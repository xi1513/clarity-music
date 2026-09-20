"""Clarity Music — accessible music processing platform."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai_agent import refine_settings_with_ai
from app.audio_processor import process_audio, process_audio_custom
from app.constants import PROFILE_DESCRIPTIONS, PROFILE_LABELS, ProcessingProfile
from app.eq_settings import CustomEQSettings, settings_from_profile

load_dotenv()

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
ALLOWED_EXTENSIONS = {".wav", ".flac", ".ogg", ".aiff", ".aif", ".mp3", ".m4a"}

app = FastAPI(
    title="Clarity Music",
    description="Research-informed music processing for hard-of-hearing listeners",
    version="0.2.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _validate_upload(file: UploadFile, file_bytes: bytes) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Please upload: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/profiles")
async def list_profiles():
    return [
        {
            "id": profile.value,
            "label": PROFILE_LABELS[profile],
            "description": PROFILE_DESCRIPTIONS[profile],
        }
        for profile in ProcessingProfile
    ]


@app.post("/api/process")
async def process_upload(
    file: UploadFile = File(...),
    profile: str = Form(...),
):
    try:
        selected_profile = ProcessingProfile(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid processing profile") from exc

    file_bytes = await file.read()
    _validate_upload(file, file_bytes)

    try:
        original_wav, processed_wav, analysis_original, analysis_processed, metadata = (
            process_audio(file_bytes, selected_profile)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not process audio: {exc}",
        ) from exc

    custom_settings = settings_from_profile(selected_profile)

    return JSONResponse(
        {
            "original_audio": base64.b64encode(original_wav).decode("ascii"),
            "processed_audio": base64.b64encode(processed_wav).decode("ascii"),
            "analysis_original": analysis_original,
            "analysis_processed": analysis_processed,
            "analysis": analysis_original,
            "audio_identical": original_wav == processed_wav,
            "metadata": metadata,
            "custom_settings": custom_settings.to_dict(),
            "filename": file.filename,
        }
    )


def _render_custom_response(
    file_bytes: bytes,
    settings: CustomEQSettings,
    *,
    base_profile: ProcessingProfile | None = None,
) -> dict:
    original_wav, processed_wav, analysis_original, analysis_processed, metadata = (
        process_audio_custom(file_bytes, settings)
    )
    if base_profile is not None:
        metadata["base_profile"] = base_profile.value
        metadata["base_profile_label"] = PROFILE_LABELS[base_profile]

    return {
        "original_audio": base64.b64encode(original_wav).decode("ascii"),
        "processed_audio": base64.b64encode(processed_wav).decode("ascii"),
        "analysis_original": analysis_original,
        "analysis_processed": analysis_processed,
        "analysis": analysis_original,
        "audio_identical": original_wav == processed_wav,
        "metadata": metadata,
        "custom_settings": settings.to_dict(),
    }


@app.post("/api/apply-settings")
async def apply_settings(
    file: UploadFile = File(...),
    settings: str = Form(...),
):
    file_bytes = await file.read()
    _validate_upload(file, file_bytes)

    try:
        custom = CustomEQSettings.from_dict(json.loads(settings)).clamp()
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid settings") from exc

    try:
        payload = _render_custom_response(file_bytes, custom)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not apply settings: {exc}",
        ) from exc

    return JSONResponse(payload)


@app.post("/api/refine")
async def refine_upload(
    file: UploadFile = File(...),
    profile: str = Form(...),
    current_settings: str = Form(...),
    message: str = Form(...),
    chat_history: str = Form("[]"),
):
    user_message = message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Please enter a message.")

    try:
        selected_profile = ProcessingProfile(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid processing profile") from exc

    file_bytes = await file.read()
    _validate_upload(file, file_bytes)

    try:
        settings_payload = json.loads(current_settings)
        current = CustomEQSettings.from_dict(settings_payload).clamp()
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid current settings") from exc

    try:
        history = json.loads(chat_history)
        if not isinstance(history, list):
            raise ValueError("chat_history must be a list")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid chat history") from exc

    try:
        _, _, analysis_original, _, _ = process_audio(file_bytes, selected_profile)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not analyze audio: {exc}",
        ) from exc

    try:
        updated_settings, assistant_message = refine_settings_with_ai(
            user_message=user_message,
            current_settings=current,
            analysis=analysis_original,
            profile_label=PROFILE_LABELS[selected_profile],
            chat_history=history,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI refinement failed: {exc}",
        ) from exc

    try:
        payload = _render_custom_response(
            file_bytes,
            updated_settings,
            base_profile=selected_profile,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not apply refined settings: {exc}",
        ) from exc

    payload["assistant_message"] = assistant_message
    return JSONResponse(payload)
