import os
import re
import json
import asyncio
from typing import List, Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from dotenv import load_dotenv

load_dotenv()
load_dotenv("agent/.env")

from live_voice import stream_voice_chunks
from meta_client import (
    stream_meta_reasoning,
    inspect_whiteboard_canvas,
    generate_realistic_diagram,
    transcribe_meta_audio,
)

app = FastAPI(title="Duet Multimodal Companion Gateway", version="3.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are Duet, a brilliant live spatial tutor.
You must output ONLY valid JSON matching this schema:
{
  "speech": "What you say out loud. Must be 1-2 sentences, ending with a question.",
  "action": {
    "type": "annotate" | "render_simulation" | "render_micrograph" | "none",
    "target": "membrane" | "nucleus" | "mitochondria" | "golgi",
    "label": "Short label to draw",
    "prompt": "Prompt for image generation (only if type is render_micrograph)"
  }
}

RULES:
1. Explain ONE concept at a time. Keep speech conversational and end with a question.
2. When explaining a part of a cell, you MUST use "annotate" to draw a label on the board. Do NOT use "none" if the user asks for an explanation.
3. If the user asks to see it in action, use "render_simulation".
4. If the user asks what it looks like in real life, use "render_micrograph".
5. Do NOT output markdown blocks like ```json. Output raw JSON only.

EXAMPLES:
User: Explain the membrane.
{"speech": "The membrane is a selectively permeable barrier. Do you know what it lets inside?", "action": {"type": "annotate", "target": "membrane", "label": "Plasma Membrane"}}

User: Show me a simulation.
{"speech": "Let's look at a live simulation. Try clicking around.", "action": {"type": "render_simulation", "target": "none", "label": ""}}

User: What does it look like in real life?
{"speech": "Here is what a real cell looks like under a microscope.", "action": {"type": "render_micrograph", "target": "none", "label": "", "prompt": "electron microscopy of eukaryotic cell"}}
"""

class DuetSession:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.history: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    def is_connected(self) -> bool:
        return self.ws.client_state == WebSocketState.CONNECTED

    async def send_state(self, state: str):
        if not self.is_connected():
            return
        try:
            await self.ws.send_text(json.dumps({"type": "state", "state": state}))
        except Exception:
            pass

    async def speak(self, text: str):
        if not self.is_connected() or not text.strip():
            return

        try:
            await self.ws.send_text(json.dumps({"type": "spoken_transcript", "text": text}))
            
            has_audio = False
            # Using ElevenLabs stream
            async for chunk in stream_voice_chunks(text, voice_id="nzFihrBIvB34imQBuxub"):
                if not self.is_connected():
                    break
                has_audio = True
                await self.ws.send_bytes(chunk)
                
            if has_audio and self.is_connected():
                await self.ws.send_text(json.dumps({"type": "audio_end"}))
                
        except (WebSocketDisconnect, RuntimeError):
            print("[session] Client disconnected during speak.")
        except Exception as exc:
            print(f"[session] Speak error: {exc}")

    async def dispatch_action(self, action_dict: dict):
        if self.is_connected():
            await self.ws.send_text(json.dumps({
                "type": "canvas_tool",
                "action": action_dict.get("type"),
                "payload": action_dict
            }))


@app.websocket("/ws/session")
async def handle_duet_session(ws: WebSocket):
    await ws.accept()
    session = DuetSession(ws)
    print("User connected to Duet Live Session.")

    await asyncio.sleep(0.3)
    welcome_text = "Welcome to Duet. What would you like to explore or learn about today?"
    try:
        await session.speak(welcome_text)
    except Exception as e:
        print(f"[session] Initial greeting skipped: {e}")

    active_turn_task: Optional[asyncio.Task] = None

    async def execute_turn(user_text: str):
        if not user_text.strip():
            return

        try:
            await session.send_state("THINKING")
            session.history.append({"role": "user", "content": user_text})

            accumulated_json = ""
            async for token in stream_meta_reasoning(session.history, reasoning_effort="low"):
                accumulated_json += token

            # ROBUST JSON EXTRACTION: Find the first { and last }
            clean_text = accumulated_json.replace("```json", "").replace("```", "").strip()
            start_idx = clean_text.find('{')
            end_idx = clean_text.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                clean_json = clean_text[start_idx:end_idx+1]
                try:
                    data = json.loads(clean_json)
                    speech = data.get("speech", "")
                    action = data.get("action", {})
                except json.JSONDecodeError as e:
                    print(f"JSON Parse Error: {e} \nRAW: {clean_json}")
                    speech = "I had a little trouble formatting my thoughts. Can you ask again?"
                    action = {}
            else:
                speech = "I didn't quite catch that. Can you ask again?"
                action = {}

            session.history.append({"role": "assistant", "content": clean_text})

            # 1. Dispatch action FIRST (Ghost Cursor moves)
            if action and action.get("type") != "none":
                action_type = action.get("type")
                if action_type == "render_micrograph":
                    img_url = await generate_realistic_diagram(action.get("prompt", "biology cell"))
                    action["image_url"] = img_url
                    await session.dispatch_action(action)
                else:
                    await session.dispatch_action(action)

            # 2. Then speak (Audio synced with cursor)
            if speech and speech != "Meta endpoint error.":
                await session.send_state("SPEAKING")
                await session.speak(speech)

            await asyncio.sleep(0.3)
            await session.send_state("LISTENING")

        except asyncio.CancelledError:
            print("Turn interrupted by user barge-in.")
            await session.send_state("LISTENING")
        except Exception as e:
            print(f"Execution error: {e}")
            await session.send_state("LISTENING")

    try:
        while True:
            raw_msg = await ws.receive()
            if raw_msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in raw_msg:
                transcription = await transcribe_meta_audio(raw_msg["bytes"])
                if transcription:
                    print(f"User said: {transcription}")
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    active_turn_task = asyncio.create_task(execute_turn(transcription))
                continue

            if "text" in raw_msg:
                event = json.loads(raw_msg["text"])
                event_type = event.get("type")

                if event_type in ("barge_in", "interrupt"):
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    await ws.send_text(json.dumps({"type": "interrupt_ack"}))
                    await session.send_state("LISTENING")

                elif event_type == "user_message":
                    prompt_text = event.get("text", "").strip()
                    if prompt_text:
                        print(f"User typed: {prompt_text}")
                        if active_turn_task and not active_turn_task.done():
                            active_turn_task.cancel()
                        active_turn_task = asyncio.create_task(execute_turn(prompt_text))

    except (WebSocketDisconnect, RuntimeError):
        print("Whiteboard session disconnected.")
    finally:
        if active_turn_task and not active_turn_task.done():
            active_turn_task.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)