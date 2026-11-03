import json
import io
import wave
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from agent.brain import query_meta_brain
from agent.audio import transcribe_audio, speak_text

app = FastAPI(title="Duet Live Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/live")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("Interface connected via WebSocket!")
    
    audio_buffer = bytearray()
    
    try:
        while True:
            msg = await ws.receive()
            
            if msg.get("type") == "websocket.disconnect":
                break
                
            # Receive binary audio chunks from the React frontend
            if "bytes" in msg and msg["bytes"]:
                audio_buffer.extend(msg["bytes"])
                
            # If the interface sends a JSON message (e.g., end of turn)
            elif "text" in msg and msg["text"]:
                data = json.loads(msg["text"])
                
                if data.get("type") == "end_turn":
                    if len(audio_buffer) == 0:
                        continue
                        
                    # Save the buffered audio to a temp WAV file for Meta ASR
                    temp_file = "temp_input.wav"
                    with wave.open(temp_file, 'wb') as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(24000) # Frontend must send 24kHz
                        wf.writeframes(audio_buffer)
                    
                    audio_buffer.clear()
                    
                    # 1. Transcribe (Ears)
                    await ws.send_json({"type": "state", "state": "THINKING"})
                    user_text = await transcribe_audio(temp_file)
                    print(f"User: {user_text}")
                    
                    if not user_text:
                        await ws.send_json({"type": "state", "state": "LISTENING"})
                        continue
                        
                    # 2. Reason (Brain)
                    response = await query_meta_brain(user_text)
                    speech = response.get("speech", "")
                    actions = response.get("canvas_actions", [])
                    
                    # 3. Send Canvas Actions to Interface
                    if actions:
                        await ws.send_json({
                            "type": "canvas_action",
                            "actions": actions
                        })
                        
                    # 4. Send Speech Text to Interface (React handles TTS via browser or we stream audio)
                    # For now, we send the text so the browser can use its native SpeechSynthesis
                    await ws.send_json({
                        "type": "speak",
                        "text": speech
                    })
                    
                    await ws.send_json({"type": "state", "state": "LISTENING"})
                    
    except WebSocketDisconnect:
        print("Interface disconnected.")