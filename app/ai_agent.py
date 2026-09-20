"""Translate plain-language listening requests into EQ settings."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.eq_settings import CustomEQSettings, describe_settings

SYSTEM_PROMPT = """You help hard-of-hearing music listeners refine audio processing on Clarity Music.

You receive:
- the user's plain-language request (NOT technical EQ language from them)
- the current EQ settings already applied after they chose a preset
- basic audio analysis (bass/mid/high balance, dynamic range)

Your job:
1. Interpret requests like "make the bass clearer", "vocals stand out more", "less harsh", "more warmth", "brighter but comfortable".
2. Adjust the EQ settings accordingly.
3. Reply in friendly, non-technical language. Do NOT mention filter types, Hz, dB, Q, or shelves to the user.

Mapping guide (internal only):
- Processing is band-isolated: low boosts affect only frequencies below 250 Hz, high boosts only above 2000 Hz, mid focus keeps 250-2000 Hz and removes the rest. Untouched bands stay unchanged.
- bass / low end / kick / drums / warmth -> low_shelf_enabled, low_shelf_gain_db, low_shelf_freq_hz
- vocals / melody / clarity / mids -> mid_focus_enabled or high_shelf_gain_db
- bright / crisp / detail / highs -> high_shelf_enabled, high_shelf_gain_db
- harsh / sharp / tiring -> reduce high_shelf_gain_db or lower output_trim_db slightly more
- muddy / boomy -> reduce low_shelf_gain_db
- clearer bass -> moderate low_shelf boost with controlled output_trim_db
- louder feel without clipping -> small output_trim_db increase (toward 0), not huge boosts
- softer / gentler -> reduce boosts or trim more
- higher pitch / brighter tone / sharper melody -> increase pitch_semitones slightly (about 0.5-2)
- lower pitch / deeper / warmer tone -> decrease pitch_semitones (about -0.5 to -2)
- "make vocals higher" or "song too low" -> positive pitch_semitones
- "make it less squeaky" -> negative pitch_semitones

Rules:
- Make incremental changes (usually 1-4 dB adjustments unless user asks for a lot).
- Keep settings within safe ranges; the server will clamp them again.
- Always return the FULL updated settings object, not a diff.
- Preserve the overall intent of the chosen preset unless the user asks to change direction.
- Do NOT turn off the preset's main effect (low_shelf_enabled, high_shelf_enabled, or mid_focus_enabled) unless the user explicitly asks to remove that effect.
- Adjust around the current preset rather than resetting the mix to flat/original.

Return JSON only with this shape:
{
  "assistant_message": "friendly explanation for the user",
  "settings": {
    "low_shelf_enabled": false,
    "low_shelf_freq_hz": 200,
    "low_shelf_gain_db": 0,
    "low_shelf_q": 0.71,
    "high_shelf_enabled": false,
    "high_shelf_freq_hz": 2000,
    "high_shelf_gain_db": 0,
    "high_shelf_q": 0.71,
    "mid_focus_enabled": false,
    "mid_focus_low_hz": 350,
    "mid_focus_high_hz": 4500,
    "output_trim_db": -9.5,
    "pitch_semitones": 0,
    "reverb_enabled": false,
    "reverb_mix": 0.28,
    "reverb_room_size": 0.55
  }
}
"""


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add it to a .env file in the project root."
        )
    return OpenAI(api_key=api_key)


def refine_settings_with_ai(
    *,
    user_message: str,
    current_settings: CustomEQSettings,
    analysis: dict[str, Any],
    profile_label: str,
    chat_history: list[dict[str, str]] | None = None,
) -> tuple[CustomEQSettings, str]:
    """Use OpenAI to update EQ settings from a natural-language request."""
    history = chat_history or []
    context = {
        "chosen_preset": profile_label,
        "current_settings": current_settings.to_dict(),
        "current_settings_summary": describe_settings(current_settings),
        "audio_analysis": analysis,
        "user_request": user_message,
    }

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history[-8:]:
        role = item.get("role", "user")
        content = item.get("content", "")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    messages.append(
        {
            "role": "user",
            "content": json.dumps(context, indent=2),
        }
    )

    client = _client()
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        response_format={"type": "json_object"},
        messages=messages,
        temperature=0.4,
    )

    raw = response.choices[0].message.content or "{}"
    payload = json.loads(raw)
    assistant_message = str(payload.get("assistant_message", "I've updated the sound based on your request."))
    merged = current_settings.to_dict()
    merged.update(payload.get("settings", {}))
    settings = CustomEQSettings.from_dict(merged).clamp()
    return settings, assistant_message
