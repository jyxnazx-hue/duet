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
from meta_client import stream_meta_reasoning

app = FastAPI(title="Duet Resilient Whiteboard Gateway", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are Duet, an inspiring, warm, and concise live companion on a shared canvas.

RULES:
1. Speak in 1-2 punchy, conversational sentences.
2. When asked to draw or sketch a pendulum, describe what you are sketching and append:
[[ACTION: {"type": "draw_pendulum"}]]
3. When asked for the formula, explain the period and append:
[[ACTION: {"type": "write_formula"}]]
4. When asked to calculate or solve (e.g. 1m on Earth), append:
[[ACTION: {"type": "solve_problem"}]]
5. When asked to simulate or test motion, append:
[[ACTION: {"type": "launch_simulation"}]]
6. In Feynman mode, ask: "If we swap our light bob for a heavy 10-kilogram bowling ball on the same string, does it swing faster, slower, or stay the exact same?"

Always put [[ACTION: ...]] at the very end of your response.
"""

class DuetSession:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.history: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    def is_connected(self) -> bool:
        return self.ws.client_state == WebSocketState.CONNECTED

    async def send_state(self, state: str):
        if self.is_connected():
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
            async for chunk in stream_voice_chunks(text, voice_id="nzFihrBIvB34imQBuxub"):
                if not self.is_connected():
                    break
                has_audio = True
                await self.ws.send_bytes(chunk)
            if has_audio and self.is_connected():
                await self.ws.send_text(json.dumps({"type": "audio_end"}))
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception as exc:
            print(f"[session] Speak error: {exc}")

    async def dispatch_action(self, action_dict: dict):
        if self.is_connected():
            print(f"[session] Dispatched Action: {action_dict}")
            await self.ws.send_text(json.dumps({
                "type": "canvas_action",
                "action": action_dict
            }))


@app.websocket("/ws/session")
async def handle_duet_session(ws: WebSocket):
    await ws.accept()
    session = DuetSession(ws)
    print("User connected to Duet Live Session.")

    await asyncio.sleep(0.3)
    welcome_text = "Welcome to Duet! What concept in mechanics or physics should we explore today?"
    await session.speak(welcome_text)

    active_turn_task: Optional[asyncio.Task] = None

    async def execute_turn(user_text: str):
        try:
            await session.send_state("THINKING")
            session.history.append({"role": "user", "content": user_text})
            lower_input = user_text.lower()

            # Guaranteed Intent Detection (Failsafe trigger so actions NEVER miss)
            # Failsafe instant intent detection
            forced_action = None
            if any(k in lower_input for k in ["draw", "sketch", "canvas", "diagram", "pendulum"]):
                forced_action = {"type": "draw_pendulum"}
            elif any(k in lower_input for k in ["formula", "equation", "period"]):
                forced_action = {"type": "write_formula"}
            elif any(k in lower_input for k in ["solve", "calc", "crunch", "answer", "noida", "earth"]):
                forced_action = {"type": "solve_problem"}
            elif any(k in lower_input for k in ["simulat", "interactive", "sandbox", "swing"]):
                forced_action = {"type": "launch_simulation"}

            # Send action IMMEDIATELY so whiteboard responds with zero delay
            if forced_action:
                await session.dispatch_action(forced_action)

            # Stream model reasoning
            accumulated_response = ""
            async for token in stream_meta_reasoning(session.history):
                accumulated_response += token

            clean_speech = accumulated_response
            action_data = None

            # Extract any model-generated action
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

            # If model produced an action and we didn't force one earlier, dispatch it now
            if action_data and not forced_action:
                await session.dispatch_action(action_data)

            # Speak speech response
            if clean_speech:
                await session.speak(clean_speech)

            await asyncio.sleep(0.1)
            await session.send_state("LISTENING")

        except asyncio.CancelledError:
            print("Turn cancelled cleanly.")
            await session.send_state("LISTENING")
        except Exception as e:
            print(f"Execution error: {e}")
            await session.send_state("LISTENING")

    try:
        while True:
            raw_msg = await ws.receive()
            if raw_msg.get("type") == "websocket.disconnect":
                break

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
                        if active_turn_task and not active_turn_task.done():
                            active_turn_task.cancel()
                        active_turn_task = asyncio.create_task(execute_turn(prompt_text))

    except (WebSocketDisconnect, RuntimeError):
        print("Session disconnected.")
    finally:
        if active_turn_task and not active_turn_task.done():
            active_turn_task.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)