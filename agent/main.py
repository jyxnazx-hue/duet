import os
import re
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from session import DuetSession
from meta_client import stream_meta_reasoning
from voice_engine import stream_audio_chunks, split_into_spoken_clauses
from prompt import SYSTEM_PROMPT

app = FastAPI(title="Duet Live Agent Gateway")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/")
async def root():
    return {"status": "ok", "app": "Duet Live Agent"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "duet-agent"}

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {"id": "muse-spark-1.3", "object": "model", "owned_by": "meta"}
        ]
    }

@app.websocket("/ws/session")
async def handle_duet_session(ws: WebSocket):
    await ws.accept()
    print("✓ Student connected to Duet live whiteboard session.")

    session = DuetSession(system_prompt=SYSTEM_PROMPT)
    active_turn_task = None

    async def execute_turn(user_text: str):
        if not user_text.strip():
            return

        session.add_user_message(user_text)
        await ws.send_text(json.dumps({"type": "state", "state": "THINKING"}))

        full_raw_reply = ""
        context_messages = session.get_contextual_prompt_messages()

        try:
            async for token in stream_meta_reasoning(context_messages):
                full_raw_reply += token

            # Parse drawing and note tool directives
            draw_matches = re.findall(r"\[\[DRAW:\s*(.*?)\]\]", full_raw_reply)
            note_matches = re.findall(r"\[\[NOTE:\s*(.*?)\]\]", full_raw_reply)

            spoken_text = re.sub(r"\[\[(DRAW|NOTE):\s*.*?\]\]", "", full_raw_reply).strip()
            session.add_assistant_message(spoken_text)

            # 1. Dispatch Whiteboard Tools
            for formula in draw_matches:
                session.register_board_artifact("formula", formula.strip())
                await ws.send_text(json.dumps({
                    "type": "canvas_tool",
                    "action": "draw_formula",
                    "payload": {"formula": formula.strip()}
                }))

            for note in note_matches:
                session.register_board_artifact("note", note.strip())
                await ws.send_text(json.dumps({
                    "type": "canvas_tool",
                    "action": "create_note",
                    "payload": {"text": note.strip()}
                }))

            # 2. Dispatch Spoken Content
            await ws.send_text(json.dumps({"type": "state", "state": "SPEAKING"}))
            await ws.send_text(json.dumps({"type": "spoken_transcript", "text": spoken_text}))

            # 3. Stream Voice (Clause by Clause)
            has_voice = False
            for clause in split_into_spoken_clauses(spoken_text):
                async for audio_chunk in stream_audio_chunks(clause):
                    has_voice = True
                    await ws.send_bytes(audio_chunk)

            if not has_voice:
                await ws.send_text(json.dumps({"type": "audio_fallback", "text": spoken_text}))

            await ws.send_text(json.dumps({"type": "state", "state": "LISTENING"}))

        except asyncio.CancelledError:
            print("Turn interrupted by user (Barge-in).")
            await ws.send_text(json.dumps({"type": "interrupt_ack"}))
            raise

    try:
        while True:
            msg = await ws.receive()
            # Clean exit on client disconnect
            if msg.get("type") == "websocket.disconnect":
                break

            if "text" in msg:
                event = json.loads(msg["text"])
                event_type = event.get("type")

                if event_type in ("barge_in", "interrupt"):
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    await ws.send_text(json.dumps({"type": "state", "state": "LISTENING"}))

                elif event_type == "user_message":
                    if active_turn_task and not active_turn_task.done():
                        active_turn_task.cancel()
                    active_turn_task = asyncio.create_task(execute_turn(event.get("text", "")))

    except (WebSocketDisconnect, RuntimeError):
        print("Session disconnected.")
    finally:
        if active_turn_task and not active_turn_task.done():
            active_turn_task.cancel()

    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)