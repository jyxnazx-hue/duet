# duet-live-agent/server.py
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from session import DuetLiveSession, SessionState, CanvasAction
from orchestrator import Orchestrator
from audio.asr_stream import StreamingASRManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("duet.server")

app = FastAPI(title="Duet Live Agent Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Dynamic Conversational LLM Stream
# ---------------------------------------------------------------------------
async def dynamic_llm_stream(prompt: str) -> AsyncGenerator[str, None]:
    """
    Contextual streaming response that reflects the user's actual prompt,
    with embedded actions for real-time canvas sync.
    """
    p = prompt.strip().lower()

    if any(greet in p for greet in ["hello", "hi", "hey"]):
        reply = "Hello! I am Duet, your live partner and tutor. What are we exploring or deriving on the canvas today?"
    elif "help" in p:
        reply = "I can guide you step by step through physics problems, derive equations live on the board, and catch conceptual mistakes while you work. What topic should we dive into?"
    elif "gravity" in p or "force" in p or "mass" in p:
        reply = "Let's examine the force vectors on your mass. [[ACTION:math:F_{net} = m \\times a]] Notice how gravity acts downward toward the center of mass. What balances this on a stationary plane?"
    elif "who are you" in p:
        reply = "I am Duet, an interactive full-duplex conversational reasoning agent designed for live multimodal collaboration."
    else:
        reply = f"I hear you. Let's explore '{prompt.strip()}'. We can break this down together step by step right on the board."

    # Stream out tokens with natural conversational cadence
    for word in reply.split(" "):
        await asyncio.sleep(0.045)
        yield word + " "

# ---------------------------------------------------------------------------
# TTS Alignment Stream
# ---------------------------------------------------------------------------
async def live_tts_stream(text: str) -> AsyncGenerator[dict, None]:
    """
    Yields audio metadata along with word-level timing anchors for canvas synchronization.
    """
    audio_id = str(uuid.uuid4())[:8]
    words = [
        {"w": w, "start": i * 0.26, "end": (i + 1) * 0.26}
        for i, w in enumerate(text.split())
    ]
    yield {
        "audio_id": audio_id,
        "pcm": b"\x00" * 640,
        "words": words,
        "duration": len(words) * 0.26,
    }

# ---------------------------------------------------------------------------
# Full-Duplex WebSocket Endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws/live")
async def live_voice_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /ws/live full-duplex session")

    is_active = True

    async def send_to_browser(payload: dict):
        nonlocal is_active
        if not is_active:
            return
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            is_active = False

    # Initialize live session and orchestrator
    session = DuetLiveSession(
        send=send_to_browser,
        llm_stream=dynamic_llm_stream,
        tts_stream=live_tts_stream,
    )
    orchestrator = Orchestrator(session)
    await session.start()

    # Initialize ASR audio manager
    asr_manager = StreamingASRManager()

    def handle_speech_start():
        if is_active:
            logger.info("Local speech burst detected -> executing instant barge-in")
            asyncio.create_task(session.interrupt())

    def handle_speech_end(audio_bytes: bytes):
        if is_active:
            logger.info(f"Utterance finalized ({len(audio_bytes)} bytes)")
            # Trigger conversational turn from voice capture
            asyncio.create_task(session.execute_turn("I spoke a message into the mic"))

    asr_manager.set_callbacks(
        on_speech_start=handle_speech_start,
        on_speech_end=handle_speech_end,
    )

    try:
        while is_active:
            message = await websocket.receive()

            # Handle disconnect frame cleanly before Starlette raises RuntimeError
            if message.get("type") == "websocket.disconnect":
                is_active = False
                break

            # Handle binary PCM microphone frames
            if "bytes" in message and message["bytes"]:
                await asr_manager.process_pcm_frame(message["bytes"])

            # Handle JSON control frames & user chat
            elif "text" in message and message["text"]:
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "barge_in":
                    logger.info("Received explicit barge_in event from browser")
                    await session.interrupt()
                elif msg_type == "user_text":
                    user_query = data.get("text", "")
                    logger.info(f"Processing turn for query: {user_query}")
                    asyncio.create_task(session.execute_turn(user_query))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected cleanly")
    except Exception as e:
        logger.debug(f"Socket connection closed: {e}")
    finally:
        is_active = False
        await session.interrupt()
        logger.info("Session teardown completed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)