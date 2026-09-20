"""Shared constants and processing profiles."""

from enum import Enum

SHELF_GAIN_DB = 9.0
SHELF_Q = 0.71
LOW_SHELF_FREQ_HZ = 200.0
HIGH_SHELF_FREQ_HZ = 4000.0
OUTPUT_TRIM_DB = -6.0
REVERB_MIX = 0.28
REVERB_ROOM_SIZE = 0.55


class ProcessingProfile(str, Enum):
    HIGH_BOOST = "high_boost"
    MID_ONLY = "mid_only"


PROFILE_LABELS = {
    ProcessingProfile.HIGH_BOOST: "Clarity & Detail",
    ProcessingProfile.MID_ONLY: "Vocal Focus",
}

# Crossover frequencies (Hz) — aligned with waveform display
LOW_CROSSOVER_HZ = 250.0
HIGH_CROSSOVER_HZ = 2000.0

PROFILE_DESCRIPTIONS = {
    ProcessingProfile.HIGH_BOOST: (
        f"Boosts high frequencies (+{SHELF_GAIN_DB:.0f} dB above "
        f"{HIGH_SHELF_FREQ_HZ / 1000:.0f} kHz) with {OUTPUT_TRIM_DB:.0f} dB output trim. "
        f"Low and mid bands are left unchanged before trim."
    ),
    ProcessingProfile.MID_ONLY: (
        f"Removes low and high bands, keeping only midrange "
        f"({LOW_CROSSOVER_HZ:.0f} Hz – {HIGH_CROSSOVER_HZ:.0f} Hz) at full level."
    ),
}
