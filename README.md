# Clarity Music

An online music-processing platform designed to improve the listening experience for people who are hard of hearing. Upload a song, choose a research-informed processing profile, and compare the original with the processed version.

## Features

- **Upload** WAV, FLAC, OGG, MP3, or AIFF files (up to 50 MB)
- **Two processing profiles:**
  1. **Clarity & Detail** — +9 dB high shelf at 4 kHz with −6 dB output trim
  2. **Vocal Focus** — keeps the midrange and reduces extreme lows and highs
- **A/B comparison** — switch between original and processed playback
- **Audio analysis** — shows band balance, dynamic range, and duration

## Quick start

```bash
cd clarity-music
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

## Important note

This tool is for listening exploration and research. It does not diagnose hearing loss, replace hearing aids, or guarantee results for every listener.

## Project structure

```
clarity-music/
├── app/
│   ├── audio_processor.py   # DSP profiles and analysis
│   └── main.py              # FastAPI server
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── requirements.txt
```
