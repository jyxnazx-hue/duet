import os
import re
import httpx
from typing import AsyncGenerator

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel / Conversational natural

# Voice calibration settings
VOICE_CONFIG = {
    "stability": 0.50,          # 0.50 balances emotive cadence with stability
    "similarity_boost": 0.75,   # Keeps voice character crisp
    "style": 0.10,              # Subtle conversational flair
    "use_speaker_boost": True,
    "speed": 0.95               # 5% slower for tutoring clarity
}

def split_into_spoken_clauses(text: str) -> list[str]:
    """Splits response into spoken clauses so the audio breathes naturally."""
    clauses = re.split(r'(?<=[.!?,;:])\s+', text)
    return [c.strip() for c in clauses if c.strip()]

async def stream_audio_chunks(text: str) -> AsyncGenerator[bytes, None]:
    """Streams audio. Uses ElevenLabs when API key is provided, yields empty for dev fallback."""
    if not text.strip() or not ELEVENLABS_API_KEY:
        return

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": VOICE_CONFIG
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            if response.status_code == 200:
                async for chunk in response.aiter_bytes(chunk_size=1024):
                    if chunk:
                        yield chunk
            else:
                print(f"TTS Stream warning: {response.status_code}")