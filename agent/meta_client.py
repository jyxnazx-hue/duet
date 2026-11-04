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


async def stream_meta_reasoning(messages: list) -> AsyncGenerator[str, None]:
    """Streams live tokens from Meta Muse Spark using max_completion_tokens."""
    if not MODEL_API_KEY:
        print("[meta_client] ERROR: MODEL_API_KEY is missing.")
        yield "MODEL_API_KEY is missing from environment."
        return

    url = f"{META_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json",
    }
    
    # Use max_completion_tokens ONLY (do not include max_tokens)
    payload = {
        "model": MODEL_ID,
        "messages": messages,
        "max_completion_tokens": 2048,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code == 200:
                    token_count = 0
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
                                delta = choices[0].get("delta", {})
                                token = delta.get("content") or ""
                                if token:
                                    token_count += 1
                                    yield token
                        except json.JSONDecodeError:
                            continue
                    
                    if token_count > 0:
                        return
                    print("[meta_client] Streaming yielded 0 visible tokens. Trying non-streaming call...")
                else:
                    err_bytes = await response.aread()
                    print(f"[meta_client] Streaming HTTP {response.status_code}: {err_bytes.decode('utf-8', errors='ignore')}")

    except Exception as exc:
        print(f"[meta_client] Streaming error: {exc}. Trying fallback...")

    # Non-streaming fallback
    try:
        payload["stream"] = False
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                content = msg.get("content") or ""
                if content:
                    yield content
                    return
            else:
                print(f"[meta_client] Non-stream HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[meta_client] Non-stream exception: {e}")

    yield "I'm having trouble connecting to Muse Spark. Please verify the endpoint."


async def generate_realistic_diagram(prompt: str) -> Optional[str]:
    """Meta Image Generation for realistic micrographs."""
    if not MODEL_API_KEY:
        return None

    url = f"{META_API_BASE}/images/generations"
    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": f"Microscopic view of {prompt}, high resolution scientific reference",
        "n": 1,
        "size": "512x512",
        "response_format": "url",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["data"][0]["url"]
            print(f"[meta_client] Image gen error {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[meta_client] Image gen exception: {e}")
    return None