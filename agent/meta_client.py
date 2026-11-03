import os
import json
import httpx
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

# Meta Model API credentials
META_API_KEY = os.getenv("MODEL_API_KEY") or os.getenv("META_API_KEY") or ""
META_API_BASE = os.getenv("META_API_BASE", "https://api.meta.ai/v1").rstrip("/")
MODEL_ID = os.getenv("META_MODEL_ID", "muse-spark-1.3")


async def stream_meta_reasoning(messages: list) -> AsyncGenerator[str, None]:
    """Streams conversational reasoning tokens directly from Meta Model API."""
    if not META_API_KEY:
        print("[meta_client] Warning: MODEL_API_KEY is not set.")
        return

    url = f"{META_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {META_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL_ID,
        "messages": messages,
        "temperature": 0.65,
        "max_tokens": 120,
        "stream": True
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_bytes = await response.aread()
                    print(f"[meta_client] Meta API Error {response.status_code}: {err_bytes.decode()}")
                    return

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line.removeprefix("data: ").strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        choices = chunk.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                    except json.JSONDecodeError:
                        continue
        except Exception as exc:
            print(f"[meta_client] Connection error: {exc}")


async def generate_speech_stream(text: str) -> AsyncGenerator[bytes, None]:
    """Audio generator placeholder for Meta dev mode (yields empty, triggers fallback)."""
    if not text.strip():
        return
    # Intentionally empty during dev mode so zero credits are consumed;
    # main.py immediately triggers the interface speech fallback.
    if False:
        yield b""