import os
import json
import httpx
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

load_dotenv()
load_dotenv("agent/.env")

MODEL_API_KEY = (
    os.getenv("MODEL_API_KEY") 
    or os.getenv("META_API_KEY") 
    or ""
).strip().strip('"').strip("'")

META_API_BASE = os.getenv("META_API_BASE", "https://api.meta.ai/v1").rstrip("/")
MODEL_ID = os.getenv("META_MODEL_ID", "muse-spark-1.3")

# 1. Meta Muse Spark Conversational Reasoning
async def stream_meta_reasoning(messages: list, reasoning_effort: str = "low") -> AsyncGenerator[str, None]:
    if not MODEL_API_KEY:
        print("[meta_client] Error: No MODEL_API_KEY found.")
        yield "MODEL_API_KEY is missing."
        return

    url = f"{META_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL_ID,
        "messages": messages,
        "reasoning_effort": reasoning_effort,
        "max_tokens": 600,
        "stream": True
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err = await response.aread()
                    print(f"[meta_client] Reasoning error {response.status_code}: {err.decode()}")
                    yield "Meta endpoint error."
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
                            token = choices[0].get("delta", {}).get("content", "")
                            if token:
                                yield token
                    except json.JSONDecodeError:
                        continue
    except Exception as exc:
        print(f"[meta_client] Stream error: {exc}")


# 2. Meta Audio Transcription (muse-audio-transcribe)
async def transcribe_meta_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    if not MODEL_API_KEY:
        return ""

    url = f"{META_API_BASE}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {MODEL_API_KEY}"}
    files = {"file": (filename, audio_bytes, "audio/wav")}
    data = {"model": "muse-audio-transcribe"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, files=files, data=data)
            if resp.status_code == 200:
                return resp.json().get("text", "").strip()
            print(f"[meta_client] Transcribe error {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[meta_client] Transcribe exception: {e}")
    return ""


# 3. Meta Vision (Reading Hand-Drawn Whiteboard Sketches)
async def inspect_whiteboard_canvas(image_base64: str, question: str) -> str:
    if not MODEL_API_KEY:
        return "Meta vision key is missing."

    url = f"{META_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json"
    }

    formatted_b64 = image_base64 if image_base64.startswith("data:") else f"data:image/png;base64,{image_base64}"

    payload = {
        "model": MODEL_ID,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {"type": "image_url", "image_url": {"url": formatted_b64}}
                ]
            }
        ],
        "max_tokens": 250
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[meta_client] Vision exception: {e}")
    return "I couldn't parse that sketch clearly."


# 4. Meta Image Generation (Realistic Biology Micrographs)
async def generate_realistic_diagram(prompt: str) -> Optional[str]:
    if not MODEL_API_KEY:
        return None

    url = f"{META_API_BASE}/images/generations"
    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "prompt": f"Scientific electron microscopy photo, high resolution, biology: {prompt}",
        "n": 1,
        "size": "512x512",
        "response_format": "url"
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["data"][0]["url"]
            print(f"[meta_client] Image gen error {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[meta_client] Image gen exception: {e}")
    return None