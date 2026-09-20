"""Adjustable EQ settings for profile and AI-driven refinements."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.constants import (
    HIGH_CROSSOVER_HZ,
    HIGH_SHELF_FREQ_HZ,
    LOW_CROSSOVER_HZ,
    LOW_SHELF_FREQ_HZ,
    OUTPUT_TRIM_DB,
    REVERB_MIX,
    REVERB_ROOM_SIZE,
    SHELF_GAIN_DB,
    SHELF_Q,
    ProcessingProfile,
)


@dataclass
class CustomEQSettings:
    low_shelf_enabled: bool = False
    low_shelf_freq_hz: float = LOW_SHELF_FREQ_HZ
    low_shelf_gain_db: float = 0.0
    low_shelf_q: float = SHELF_Q

    high_shelf_enabled: bool = False
    high_shelf_freq_hz: float = HIGH_SHELF_FREQ_HZ
    high_shelf_gain_db: float = 0.0
    high_shelf_q: float = SHELF_Q

    mid_focus_enabled: bool = False
    mid_focus_low_hz: float = 350.0
    mid_focus_high_hz: float = 4500.0

    output_trim_db: float = OUTPUT_TRIM_DB
    pitch_semitones: float = 0.0

    reverb_enabled: bool = False
    reverb_mix: float = REVERB_MIX
    reverb_room_size: float = REVERB_ROOM_SIZE

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> CustomEQSettings:
        allowed = {field.name for field in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        return cls(**{key: value for key, value in data.items() if key in allowed})

    def clamp(self) -> CustomEQSettings:
        """Keep AI adjustments within safe listening ranges."""
        self.low_shelf_freq_hz = min(max(self.low_shelf_freq_hz, 40.0), 800.0)
        self.high_shelf_freq_hz = min(max(self.high_shelf_freq_hz, 800.0), 12000.0)
        self.low_shelf_gain_db = min(max(self.low_shelf_gain_db, -12.0), 18.0)
        self.high_shelf_gain_db = min(max(self.high_shelf_gain_db, -12.0), 18.0)
        self.low_shelf_q = min(max(self.low_shelf_q, 0.4), 2.0)
        self.high_shelf_q = min(max(self.high_shelf_q, 0.4), 2.0)
        self.mid_focus_low_hz = min(max(self.mid_focus_low_hz, 80.0), 1500.0)
        self.mid_focus_high_hz = min(max(self.mid_focus_high_hz, 1500.0), 10000.0)
        if self.mid_focus_high_hz <= self.mid_focus_low_hz + 100:
            self.mid_focus_high_hz = self.mid_focus_low_hz + 500.0
        self.output_trim_db = min(max(self.output_trim_db, -18.0), 0.0)
        self.pitch_semitones = min(max(self.pitch_semitones, -6.0), 6.0)
        self.reverb_mix = min(max(self.reverb_mix, 0.0), 0.55)
        self.reverb_room_size = min(max(self.reverb_room_size, 0.1), 1.0)
        return self


def settings_from_profile(profile: ProcessingProfile) -> CustomEQSettings:
    if profile == ProcessingProfile.HIGH_BOOST:
        return CustomEQSettings(
            high_shelf_enabled=True,
            high_shelf_freq_hz=HIGH_SHELF_FREQ_HZ,
            high_shelf_gain_db=SHELF_GAIN_DB,
            high_shelf_q=SHELF_Q,
            output_trim_db=OUTPUT_TRIM_DB,
        )
    if profile == ProcessingProfile.MID_ONLY:
        return CustomEQSettings(
            mid_focus_enabled=True,
            mid_focus_low_hz=LOW_CROSSOVER_HZ,
            mid_focus_high_hz=HIGH_CROSSOVER_HZ,
            output_trim_db=0.0,
        )
    raise ValueError(f"Unknown profile: {profile}")


def describe_settings(settings: CustomEQSettings) -> str:
    parts: list[str] = []
    if settings.low_shelf_enabled:
        parts.append(
            f"low band {settings.low_shelf_gain_db:+.1f} dB (mid/high unchanged)"
        )
    if settings.high_shelf_enabled:
        parts.append(
            f"high band {settings.high_shelf_gain_db:+.1f} dB above "
            f"{settings.high_shelf_freq_hz / 1000:.0f} kHz (low/mid unchanged before trim)"
        )
    if settings.mid_focus_enabled:
        parts.append(
            f"mid only {settings.mid_focus_low_hz:.0f}-{settings.mid_focus_high_hz:.0f} Hz "
            f"(low/high removed)"
        )
    if abs(settings.pitch_semitones) >= 0.25:
        parts.append(f"pitch {settings.pitch_semitones:+.1f} semitones")
    if settings.reverb_enabled:
        parts.append(f"reverb mix {settings.reverb_mix * 100:.0f}%")
    parts.append(f"output trim {settings.output_trim_db:.1f} dB")
    return ", ".join(parts)
