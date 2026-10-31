import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from agent.session import DuetSession
from agent.brain import query_duet_cognition, generate_muse_image
from agent.config import MODEL_REASONING

app = FastAPI(title="Duet Live Agent Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "online",
        "models": {
            "reasoning": MODEL_REASONING,
            "vision": "sam-3.1",
            "image": "muse-image-1.0",
            "asr": "muse-voice-transcribe-1.0"
        }
    }

@app.websocket("/ws/live")
async def websocket_live_stream(ws: WebSocket):
    await ws.accept()
    session = DuetSession(ws)

    try:
        while session.is_active:
            data = await ws.receive_json()
            event_type = data.get("type")

            # 1. User started speaking / interrupted
            if event_type == "barge_in":
                await session.interrupt()

            # 2. Transcribed User Audio or Text Input
            elif event_type == "user_transcript":
                user_text = data.get("text", "")
                if not user_text:
                    continue

                session.history.append({"role": "user", "content": user_text})
                await ws.send_json({"type": "state", "thinking": True})

                # Reasoning via Muse Spark / Wonder
                agent_plan = await query_duet_cognition(session.history)
                
                await ws.send_json({"type": "state", "thinking": False})

                # Stream Speech
                speech_text = agent_plan.get("speech", "")
                await ws.send_json({
                    "type": "speech_out",
                    "generation_id": session.generation_id,
                    "text": speech_text
                })

                # Process Canvas Visuals with Organic Coordinates
                actions = agent_plan.get("canvas_actions", [])
                intent = agent_plan.get("visual_intent", "none")

                rendered_actions = []
                base_x, base_y = session.allocate_spatial_slot(
                    width=320, 
                    height=max(120, len(actions) * 45)
                )

                current_line_y = base_y

                for act in actions:
                    if act.get("type") in ("write_math", "write_text"):
                        rendered_actions.append({
                            "type": "write_text",
                            "x": base_x,
                            "y": current_line_y,
                            "text": act.get("text", ""),
                            "size": act.get("size", "m"),
                            "color": act.get("color", "blue")
                        })
                        # Advance Y downward so subsequent math lines don't collide
                        current_line_y += 45

                    elif act.get("type") == "draw_arrow":
                        f_off = act.get("from_offset", [0, 20])
                        t_off = act.get("to_offset", [140, 20])
                        rendered_actions.append({
                            "type": "draw_arrow",
                            "fromX": base_x + f_off[0],
                            "fromY": current_line_y + f_off[1],
                            "toX": base_x + t_off[0],
                            "toY": current_line_y + t_off[1],
                            "color": act.get("color", "orange")
                        })
                        current_line_y += 50

                # Trigger Muse Image if visual intent warrants it
                if intent == "generate_image" and agent_plan.get("image_prompt"):
                    img_url = await generate_muse_image(agent_plan.get("image_prompt"))
                    rendered_actions.append({
                        "type": "mount_image",
                        "x": base_x + 320,
                        "y": base_y,
                        "w": 380,
                        "h": 280,
                        "url": img_url
                    })

                if rendered_actions:
                    await ws.send_json({
                        "type": "canvas_stream",
                        "generation_id": session.generation_id,
                        "actions": rendered_actions
                    })

                session.history.append({"role": "assistant", "content": json.dumps(agent_plan)})

    except WebSocketDisconnect:
        session.is_active = False

if __name__ == "__main__":
    uvicorn.run("agent.main:app", host="0.0.0.0", port=8000, reload=True)