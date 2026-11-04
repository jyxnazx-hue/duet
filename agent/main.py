import os
import re
import json
import asyncio
from typing import List, Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv
from starlette.websockets import WebSocketDisconnect, WebSocketState

load_dotenv()
load_dotenv("agent/.env")

from live_voice import stream_voice_chunks
from meta_client import (
    stream_meta_reasoning,
    inspect_whiteboard_canvas,
    generate_realistic_diagram,
    transcribe_meta_audio,
)

app = FastAPI(title="Duet Multimodal Companion Gateway", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are Duet, an inspiring, warm, and brilliant live multimodal companion on a shared canvas.

How you converse:
- Speak naturally and warmly in short, punchy turns (1-2 clear sentences).
- If the user asks you to explain or build a cell, walk them through it step-by-step and DRAW each organelle directly onto the canvas.

Canvas Action Rules:
At the very end of your reply, ALWAYS include the canvas action matching what you just explained:
1. When introducing the cell membrane:
[[ACTION: {"action": "draw_cell_part", "payload": {"part": "membrane", "title": "Plasma Membrane", "desc": "Selectively permeable lipid bilayer", "cx": 450, "cy": 320, "r": 160}}]]

2. When explaining the nucleus:
[[ACTION: {"action": "draw_cell_part", "payload": {"part": "nucleus", "title": "Nucleus & DNA", "desc": "Information hub controlling protein synthesis", "cx": 430, "cy": 300, "r": 50}}]]

3. When introducing mitochondria / ATP:
[[ACTION: {"action": "draw_cell_part", "payload": {"part": "mitochondria", "title": "Mitochondrion", "desc": "Cell powerhouse converting pyruvate to ATP via cellular respiration", "cx": 530, "cy": 340, "w": 65, "h": 35}}]]

4. When asked what a cell looks like in real life or for a deep dive:
[[ACTION: {"action": "render_simulation", "payload": {"type": "cell_biology", "title": "Living Eukaryotic Cell Simulation"}}]]
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
        if not self.is_connected():
            return

        try:
            # 1. Send text transcript
            await self.ws.send_text(json.dumps({"type": "spoken_transcript", "text": text}))
            
            # 2. Stream ElevenLabs audio chunks using your custom voice ID
            has_audio = False
            async for chunk in stream_voice_chunks(text, voice_id="nzFihrBIvB34imQBuxub"):
                if not self.is_connected():
                    break
                has_audio = True
                await self.ws.send_bytes(chunk)
                
            # 3. Notify frontend that complete audio stream has finished sending
            if has_audio and self.is_connected():
                await self.ws.send_text(json.dumps({"type": "audio_end"}))
            elif not has_audio and self.is_connected():
                print("[session] Warning: ElevenLabs produced no audio bytes.")

        except (WebSocketDisconnect, RuntimeError):
            print("[session] Client disconnected during speak.")
        except Exception as exc:
            print(f"[session] Speak error: {exc}")

    async def dispatch_action(self, action_dict: dict):
        await self.ws.send_text(json.dumps({
            "type": "canvas_tool",
            "action": action_dict.get("action"),
            "payload": action_dict.get("payload", {})
        }))


@app.websocket("/ws/session")
async def handle_duet_session(ws: WebSocket):
    await ws.accept()
    session = DuetSession(ws)
    print("User connected to Duet Live Session.")

    # Small 100ms pause so the frontend WebSocket finishes its handshake
    await asyncio.sleep(0.3)

    welcome_text = "Hey! I'm Duet, your live companion. What are we sketching or exploring today?"
    try:
        await session.speak(welcome_text)
    except Exception as e:
        print(f"[session] Initial greeting skipped: {e}")

    active_turn_task: Optional[asyncio.Task] = None

    async def execute_turn(user_text: str):
        try:
            await session.send_state("THINKING")
            session.history.append({"role": "user", "content": user_text})

            accumulated_response = ""
            async for token in stream_meta_reasoning(session.history, reasoning_effort="low"):
                accumulated_response += token

            # Strip [[ACTION:...]] cleanly so it is NEVER spoken aloud
            clean_speech = accumulated_response
            action_data = None

            action_match = re.search(r"\[\[ACTION:\s*({.*?})\]\]", accumulated_response, re.DOTALL)
            if action_match:
                try:
                    action_data = json.loads(action_match.group(1))
                    clean_speech = re.sub(r"\[\[ACTION:.*?\]\]", "", accumulated_response, flags=re.DOTALL).strip()
                except Exception as parse_err:
                    print(f"Action parse error: {parse_err}")

            if "[[ACTION:" in clean_speech:
                clean_speech = clean_speech.split("[[ACTION:")[0].strip()

            session.history.append({"role": "assistant", "content": clean_speech})

            await session.send_state("SPEAKING")
            print(f"Duet Spoken: {clean_speech}")

            # 1. Speak aloud
            if clean_speech:
                await session.speak(clean_speech)

            # 2. Dispatch canvas tools
            if action_data:
                action_name = action_data.get("action")
                # Handle real-life image generation request
                if action_name == "render_micrograph":
                    prompt = action_data.get("payload", {}).get("prompt", "eukaryotic cell microscope view")
                    img_url = await generate_realistic_diagram(prompt)
                    action_data["payload"]["image_url"] = img_url or "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=600&q=80"
                
                await session.dispatch_action(action_data)

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

            # Binary audio input for Meta transcription
            if "bytes" in raw_msg:
                transcription = await transcribe_meta_audio(raw_msg["bytes"])
                if transcription:
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    active_turn_task = asyncio.create_task(execute_turn(transcription))
                continue

            if "text" in raw_msg:
                event = json.loads(raw_msg["text"])
                event_type = event.get("type")

                # Barge-in cutoff
                if event_type in ("barge_in", "interrupt"):
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    await ws.send_text(json.dumps({"type": "interrupt_ack"}))
                    await session.send_state("LISTENING")

                # Vision canvas query
                elif event_type == "inspect_canvas":
                    b64_img = event.get("image_base64", "")
                    query = event.get("query", "What did the student sketch on the canvas?")
                    vision_ans = await inspect_whiteboard_canvas(b64_img, query)
                    await session.speak(vision_ans)

                # Standard text / speech query
                elif event_type == "user_message":
                    prompt_text = event.get("text", "").strip()
                    if prompt_text:
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