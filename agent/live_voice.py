import os
import io
import asyncio
from typing import AsyncGenerator
from dotenv import load_dotenv
import httpx

load_dotenv()
load_dotenv("agent/.env")

ELEVENLABS_API_KEY = (
    os.getenv("ELEVENLABS_API_KEY") 
    or os.getenv("ELEVEN_API_KEY") 
    or ""
).strip().strip('"').strip("'")

# Your Voice ID
DEFAULT_VOICE_ID = "nzFihrBIvB34imQBuxub"
MODEL_ID = "eleven_turbo_v2_5"  # Sub-250ms latency model

async def stream_voice_chunks(text: str, voice_id: str = DEFAULT_VOICE_ID) -> AsyncGenerator[bytes, None]:
    """Streams binary MP3 audio chunks via ElevenLabs low-latency HTTP stream."""
    if not ELEVENLABS_API_KEY:
        print("[live_voice] Warning: No ELEVENLABS_API_KEY configured.")
        return

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    payload = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.85,
            "style": 0.2,
            "use_speaker_boost": True
        }
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err = await response.aread()
                    print(f"[live_voice] ElevenLabs error {response.status_code}: {err.decode()}")
                    return

                async for chunk in response.aiter_bytes(chunk_size=2048):
                    if chunk:
                        yield chunk
    except Exception as exc:
        print(f"[live_voice] Streaming exception: {exc}")