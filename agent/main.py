import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from agent.brain import query_muse_spark
from agent.config import MODEL_REASONING

app = FastAPI(title="Duet Agent Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "online", "model": MODEL_REASONING}

@app.websocket("/ws/duet")
async def duet_live_endpoint(websocket: WebSocket):
    await websocket.accept()
    current_mode = "socratic"

    try:
        while True:
            raw_data = await websocket.receive_text()
            payload = json.loads(raw_data)
            msg_type = payload.get("type")

            # 1. Update Learning Mode (Socratic vs Feynman)
            if msg_type == "mode_switch":
                current_mode = payload.get("mode", "socratic")
                await websocket.send_json({
                    "type": "status",
                    "message": f"Mode updated to {current_mode}",
                })

            # 2. Student Prompt (from voice transcript or chat input)
            elif msg_type == "prompt":
                prompt_text = payload.get("text", "")
                
                # Signal agent is reasoning
                await websocket.send_json({"type": "thinking", "state": True})

                # Call Meta Muse Spark
                result = await query_muse_spark(prompt_text, mode=current_mode)

                await websocket.send_json({"type": "thinking", "state": False})

                # Stream conversational dialogue + synchronized canvas drawing actions
                await websocket.send_json({
                    "type": "mentor_response",
                    "speech": result.get("speech", ""),
                    "canvas_actions": result.get("canvas_actions", []),
                })

            # 3. Interruption Signal
            elif msg_type == "interrupt":
                await websocket.send_json({
                    "type": "interrupted",
                    "message": "Generation aborted, listening to user.",
                })

    except WebSocketDisconnect:
        pass

if __name__ == "__main__":
    uvicorn.run("agent.main:app", host="0.0.0.0", port=8000, reload=True)