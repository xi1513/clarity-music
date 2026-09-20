"""Research-informed audio processing profiles for hard-of-hearing listeners."""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf
from scipy import signal

from app.constants import (
    HIGH_CROSSOVER_HZ,
    LOW_CROSSOVER_HZ,
    PROFILE_DESCRIPTIONS,
    PROFILE_LABELS,
    OUTPUT_TRIM_DB,
    SHELF_GAIN_DB,
    ProcessingProfile,
)
from app.eq_settings import CustomEQSettings, describe_settings, settings_from_profile


def load_audio(file_bytes: bytes) -> tuple[np.ndarray, int]:
    data, sample_rate = sf.read(io.BytesIO(file_bytes), always_2d=True)
    return data.astype(np.float64), sample_rate


def write_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def _ensure_stereo(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return np.column_stack([audio, audio])
    return audio


def _db_to_linear(gain_db: float) -> float:
    return 10 ** (gain_db / 20.0)


def _apply_frequency_band_gains(
    audio: np.ndarray,
    sample_rate: int,
    *,
    low_hz: float,
    high_hz: float,
    low_gain: float = 1.0,
    mid_gain: float = 1.0,
    high_gain: float = 1.0,
) -> np.ndarray:
    """Apply independent gain to low / mid / high FFT bins without cross-band bleed."""
    n_samples = audio.shape[0]
    freqs = np.fft.rfftfreq(n_samples, 1.0 / sample_rate)
    gain = np.ones_like(freqs)
    gain[freqs < low_hz] = low_gain
    gain[(freqs >= low_hz) & (freqs < high_hz)] = mid_gain
    gain[freqs >= high_hz] = high_gain

    processed = np.zeros_like(audio)
    for ch in range(audio.shape[1]):
        spectrum = np.fft.rfft(audio[:, ch])
        processed[:, ch] = np.fft.irfft(spectrum * gain, n=n_samples)
    return processed


def _limit_band_gains(
    audio: np.ndarray,
    sample_rate: int,
    *,
    low_hz: float,
    high_hz: float,
    low_gain: float,
    mid_gain: float,
    high_gain: float,
    ceiling: float = 0.99,
) -> np.ndarray:
    """
    Apply band gains and limit peaks without scaling untouched bands.
    Only gains that differ from 1.0 are reduced when headroom runs out.
    """
    processed = _apply_frequency_band_gains(
        audio,
        sample_rate,
        low_hz=low_hz,
        high_hz=high_hz,
        low_gain=low_gain,
        mid_gain=mid_gain,
        high_gain=high_gain,
    )
    peak = float(np.max(np.abs(processed)))
    if peak <= ceiling:
        return processed

    limit_factor = ceiling / peak
    adjusted_low = 1.0 + (low_gain - 1.0) * limit_factor if low_gain != 1.0 else 1.0
    adjusted_mid = 1.0 + (mid_gain - 1.0) * limit_factor if mid_gain != 1.0 else 1.0
    adjusted_high = 1.0 + (high_gain - 1.0) * limit_factor if high_gain != 1.0 else 1.0
    return _apply_frequency_band_gains(
        audio,
        sample_rate,
        low_hz=low_hz,
        high_hz=high_hz,
        low_gain=adjusted_low,
        mid_gain=adjusted_mid,
        high_gain=adjusted_high,
    )


def _split_frequency_bands(
    audio: np.ndarray,
    sample_rate: int,
    low_hz: float = LOW_CROSSOVER_HZ,
    high_hz: float = HIGH_CROSSOVER_HZ,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Split audio into low, mid, and high bands using the same topology as the
    waveform player (low-pass, band-pass, high-pass at shared crossover points).
    """
    low_sos = signal.butter(4, low_hz, btype="low", fs=sample_rate, output="sos")
    high_sos = signal.butter(4, high_hz, btype="high", fs=sample_rate, output="sos")
    mid_high_sos = signal.butter(4, low_hz, btype="high", fs=sample_rate, output="sos")
    mid_low_sos = signal.butter(4, high_hz, btype="low", fs=sample_rate, output="sos")

    low = _apply_sos(audio, low_sos)
    high = _apply_sos(audio, high_sos)
    mid = _apply_sos(_apply_sos(audio, mid_high_sos), mid_low_sos)
    return low, mid, high


def _band_gain_linear(boost_db: float, trim_db: float) -> float:
    """Apply boost then compensating trim on a single band only."""
    return _db_to_linear(boost_db + trim_db)


def _process_with_settings(
    audio: np.ndarray, sample_rate: int, settings: CustomEQSettings
) -> np.ndarray:
    low_hz = settings.mid_focus_low_hz if settings.mid_focus_enabled else LOW_CROSSOVER_HZ
    high_hz = (
        settings.mid_focus_high_hz
        if settings.mid_focus_enabled
        else settings.high_shelf_freq_hz
        if settings.high_shelf_enabled
        else HIGH_CROSSOVER_HZ
    )

    low_gain = 1.0
    mid_gain = 1.0
    high_gain = 1.0

    if settings.mid_focus_enabled:
        _, processed, _ = _split_frequency_bands(audio, sample_rate, low_hz, high_hz)
    else:
        if settings.low_shelf_enabled:
            low_gain = _band_gain_linear(settings.low_shelf_gain_db, settings.output_trim_db)

        if settings.high_shelf_enabled:
            high_gain = _db_to_linear(settings.high_shelf_gain_db)

        processed = _limit_band_gains(
            audio,
            sample_rate,
            low_hz=low_hz,
            high_hz=high_hz,
            low_gain=low_gain,
            mid_gain=mid_gain,
            high_gain=high_gain,
        )

        if settings.high_shelf_enabled and settings.output_trim_db != 0:
            processed = _apply_output_trim(processed, settings.output_trim_db)
            processed = _prevent_clip(processed)

    if abs(settings.pitch_semitones) >= 0.05:
        processed = _apply_pitch_shift(processed, sample_rate, settings.pitch_semitones)

    # Global trim only when no per-band shaping ran (e.g. AI-only trim/pitch).
    if (
        settings.output_trim_db != 0
        and not settings.low_shelf_enabled
        and not settings.high_shelf_enabled
        and not settings.mid_focus_enabled
    ):
        processed = _apply_output_trim(processed, settings.output_trim_db)
        processed = _prevent_clip(processed)
    elif settings.mid_focus_enabled:
        processed = _prevent_clip(processed)

    if settings.reverb_enabled:
        processed = _apply_reverb(
            processed,
            sample_rate,
            mix=settings.reverb_mix,
            room_size=settings.reverb_room_size,
        )
        processed = _prevent_clip(processed)

    return processed


def _apply_reverb(
    audio: np.ndarray,
    sample_rate: int,
    *,
    mix: float = 0.28,
    room_size: float = 0.55,
) -> np.ndarray:
    """Add a subtle room reverb (dry/wet mix) for a fuller listening effect."""
    if mix <= 0.001:
        return audio

    decay_seconds = 0.35 + room_size * 1.4
    ir_length = max(1024, int(sample_rate * decay_seconds))
    rng = np.random.default_rng(42)
    times = np.arange(ir_length) / sample_rate
    ir = np.exp(-times / (decay_seconds * 0.45)) * rng.standard_normal(ir_length)
    ir *= np.hanning(ir_length)
    ir /= max(np.max(np.abs(ir)), 1e-8)

    processed = np.zeros_like(audio)
    for ch in range(audio.shape[1]):
        wet = signal.fftconvolve(audio[:, ch], ir, mode="same")
        processed[:, ch] = audio[:, ch] * (1.0 - mix) + wet * mix
    return processed


def _apply_sos(audio: np.ndarray, sos: np.ndarray) -> np.ndarray:
    """Filter each channel through a second-order-section biquad."""
    processed = np.zeros_like(audio)
    for ch in range(audio.shape[1]):
        processed[:, ch] = signal.sosfilt(sos, audio[:, ch])
    return processed


def _apply_output_trim(audio: np.ndarray, trim_db: float) -> np.ndarray:
    return audio * _db_to_linear(trim_db)


def _prevent_clip(audio: np.ndarray, ceiling: float = 0.99) -> np.ndarray:
    peak = np.max(np.abs(audio))
    if peak > ceiling:
        return audio * (ceiling / peak)
    return audio


def _analyze_audio(audio: np.ndarray, sample_rate: int) -> dict:
    """Extract basic characteristics for display."""
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    n_fft = min(8192, len(mono))
    spectrum = np.abs(np.fft.rfft(mono[:n_fft]))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)

    bands = {
        "bass": (20, 250),
        "midrange": (250, 2000),
        "highs": (2000, min(sample_rate // 2 - 1, 12000)),
    }
    band_energy = {}
    for name, (lo, hi) in bands.items():
        mask = (freqs >= lo) & (freqs <= hi)
        band_energy[name] = float(np.sum(spectrum[mask] ** 2))

    total = sum(band_energy.values()) or 1.0
    band_balance = {k: round(v / total * 100, 1) for k, v in band_energy.items()}

    rms = float(np.sqrt(np.mean(mono**2)))
    peak = float(np.max(np.abs(mono)))
    dynamic_range_db = round(20 * np.log10(max(peak, 1e-8) / max(rms, 1e-8)), 1)

    return {
        "band_balance": band_balance,
        "dynamic_range_db": dynamic_range_db,
        "duration_seconds": round(len(mono) / sample_rate, 2),
        "sample_rate": sample_rate,
        "channels": audio.shape[1] if audio.ndim == 2 else 1,
    }


def _apply_pitch_shift(
    audio: np.ndarray, sample_rate: int, semitones: float
) -> np.ndarray:
    """Shift pitch while keeping duration (in semitones, 0 = no change)."""
    if abs(semitones) < 0.05:
        return audio

    factor = 2 ** (semitones / 12.0)
    shifted = np.zeros_like(audio)
    for ch in range(audio.shape[1]):
        channel = audio[:, ch]
        n_samples = len(channel)
        resampled = signal.resample(channel, max(2, int(n_samples * factor)))
        shifted[:, ch] = signal.resample(resampled, n_samples)
    return shifted


def _process_high_boost(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    return _process_with_settings(
        audio, sample_rate, settings_from_profile(ProcessingProfile.HIGH_BOOST)
    )


def _process_mid_only(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    return _process_with_settings(
        audio, sample_rate, settings_from_profile(ProcessingProfile.MID_ONLY)
    )


def process_audio_custom(
    file_bytes: bytes, settings: CustomEQSettings
) -> tuple[bytes, bytes, dict, dict, dict]:
    """Process uploaded audio using explicit EQ settings."""
    audio, sample_rate = load_audio(file_bytes)
    audio = _ensure_stereo(audio)
    settings = settings.clamp()

    processed = _process_with_settings(audio, sample_rate, settings)
    analysis_original = _analyze_audio(audio, sample_rate)
    analysis_processed = _analyze_audio(processed, sample_rate)

    original_wav = write_wav(_prevent_clip(audio), sample_rate)
    processed_wav = write_wav(processed, sample_rate)

    metadata = {
        "profile": "custom",
        "profile_label": "AI Refined",
        "profile_description": describe_settings(settings),
        "eq_settings": settings.to_dict(),
    }

    return original_wav, processed_wav, analysis_original, analysis_processed, metadata


def _eq_settings(profile: ProcessingProfile) -> dict | None:
    return settings_from_profile(profile).to_dict()


def process_audio(
    file_bytes: bytes, profile: ProcessingProfile
) -> tuple[bytes, bytes, dict, dict, dict]:
    """
    Process uploaded audio and return original WAV, processed WAV, analysis, and metadata.
    """
    audio, sample_rate = load_audio(file_bytes)
    audio = _ensure_stereo(audio)

    if profile == ProcessingProfile.HIGH_BOOST:
        processed = _process_high_boost(audio, sample_rate)
    elif profile == ProcessingProfile.MID_ONLY:
        processed = _process_mid_only(audio, sample_rate)
    else:
        raise ValueError(f"Unknown profile: {profile}")

    analysis_original = _analyze_audio(audio, sample_rate)
    analysis_processed = _analyze_audio(processed, sample_rate)

    original_wav = write_wav(_prevent_clip(audio), sample_rate)
    processed_wav = write_wav(processed, sample_rate)

    metadata = {
        "profile": profile.value,
        "profile_label": PROFILE_LABELS[profile],
        "profile_description": PROFILE_DESCRIPTIONS[profile],
        "eq_settings": _eq_settings(profile),
    }

    return original_wav, processed_wav, analysis_original, analysis_processed, metadata
