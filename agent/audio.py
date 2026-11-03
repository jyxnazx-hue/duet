import asyncio
import json
import wave
import uuid
# pyrefly: ignore[missing-import]
import sounddevice as sd
# pyrefly: ignore[missing-import]
import pyttsx3
import websockets
from agent.config import META_API_KEY, ASR_MODEL

# Initialize Windows Native TTS
engine = pyttsx3.init()
engine.setProperty('rate', 160)
engine.setProperty('volume', 1.0)

def record_audio(duration=5, fs=24000, filename="user_input.wav"):
    """
    Records audio at 24kHz (required by Meta ASR).
    """
    print(f"Recording for {duration} seconds... Speak now.")
    recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype='int16')
    sd.wait()
    print("Recording finished.")
    
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(fs)
        wf.writeframes(recording.tobytes())
        
    return filename

async def transcribe_audio(filepath: str) -> str:
    """
    Streams recorded audio to Meta Voice Transcribe via WebSocket.
    """
    SESSION_ID = f"duet-{uuid.uuid4()}"
    ASR_URI = f"wss://api.meta.ai/v1/asr/realtime?sessionId={SESSION_ID}"
    
    # 24kHz, 16-bit mono
    RATE = 24_000
    FRAME_BYTES = RATE * 2 * 80 // 1000 # 80ms chunks
    
    final_transcript = ""

    try:
        async with websockets.connect(ASR_URI, open_timeout=30) as ws:
            # 1. Handshake
            await ws.send(
                json.dumps({
                    "authorization": {"accessToken": f"Bearer {META_API_KEY}"},
                    "audioEncoding": "PCM_24KHZ",
                    "model": ASR_MODEL,
                    "mode": "PUSH_TO_TALK"
                })
            )
            handshake = json.loads(await ws.recv())
            if "sessionId" not in handshake:
                raise RuntimeError(f"Handshake failed: {handshake}")

            # 2. Receiver task to catch the transcripts
            async def receive_events():
                nonlocal final_transcript
                async for message in ws:
                    if isinstance(message, bytes):
                        continue
                    event = json.loads(message)
                    if event.get("type") == "error":
                        print(f"ASR Error: {event['message']}")
                    if event.get("type") == "transcript":
                        if event.get("final"):
                            final_transcript = event["transcript"]

            receiver = asyncio.create_task(receive_events())

            # 3. Stream audio from the saved wav file (skipping the 44-byte header)
            with open(filepath, "rb") as audio:
                audio.seek(44) # Skip WAV header to get raw PCM
                while chunk := audio.read(FRAME_BYTES):
                    await ws.send(chunk)
                    await asyncio.sleep(0.08) # Pace it in real-time

            # 4. End stream and wait for final transcript
            await ws.send(json.dumps({"type": "endStream"}))
            await receiver

    except Exception as e:
        print(f"STT WebSocket Error: {e}")

    return final_transcript

def speak_text(text: str):
    """
    Uses Windows native TTS to speak the text.
    """
    print(f"Speaking: {text}")
    engine.say(text)
    engine.runAndWait()