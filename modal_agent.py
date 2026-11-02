# modal_agent.py
from __future__ import annotations

import io
import json
import logging
import wave
import asyncio
import os
import modal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("duet.modal")

# Container definition: includes PyTorch, CUDA, transformers, and FastAPI
duet_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch",
        "torchaudio",
        "transformers>=4.43.0",
        "accelerate",
        "faster-whisper",
        "fastapi[standard]",
        "uvicorn",
        "soundfile",
        "numpy",
        "sentencepiece"
    )
)

app = modal.App("duet-live-agent")


@app.cls(
    gpu="A10G",
    image=duet_image,
    secrets=[modal.Secret.from_name("duet-secrets")],
    timeout=600,
    scaledown_window=300
)
class DuetVoiceServer:
    @modal.enter()
    def load_models(self):
        """Loads speech recognition and neural speech models into GPU VRAM."""
        import torch
        from faster_whisper import WhisperModel
        from transformers import AutoProcessor, SeamlessM4Tv2ForTextToSpeech

        logger.info("Initializing Meta Speech Models on A10G...")

        # 1. Ear: Real-time Whisper on GPU
        self.asr_model = WhisperModel("small.en", device="cuda", compute_type="float16")

        # 2. Voice: Meta SeamlessM4T v2
        model_id = "facebook/seamless-m4t-v2-large"
        hf_token = os.environ.get("HF_TOKEN")
        
        self.tts_processor = AutoProcessor.from_pretrained(model_id, token=hf_token)
        self.tts_model = SeamlessM4Tv2ForTextToSpeech.from_pretrained(
            model_id,
            token=hf_token,
            torch_dtype=torch.float16
        ).to("cuda")
        self.tts_model.eval()

        logger.info("All Meta models loaded into VRAM.")

    def transcribe_audio(self, pcm_bytes: bytes) -> str:
        """Transcribes incoming 16kHz audio buffer."""
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(pcm_bytes)
        wav_io.seek(0)

        segments, _ = self.asr_model.transcribe(wav_io, beam_size=1)
        return " ".join([s.text for s in segments]).strip()

    def synthesize_speech(self, text: str) -> bytes:
        """Synthesizes text into 16kHz linear PCM using Meta SeamlessM4T."""
        # pyrefly: ignore[missing-import]
        import torch
        import numpy as np

        clean_text = text.strip()
        if not clean_text:
            return b""

        inputs = self.tts_processor(text=clean_text, src_lang="eng", return_tensors="pt").to("cuda")

        with torch.no_grad():
            output = self.tts_model.generate(**inputs, tgt_lang="eng")
            audio_array = output[0].cpu().numpy().squeeze()

        # Scale float [-1.0, 1.0] to 16-bit PCM bytes
        pcm_data = (audio_array * 32767).clip(-32768, 32767).astype(np.int16).tobytes()
        return pcm_data

    @modal.asgi_app()
    def web(self):
        from fastapi import FastAPI, WebSocket, WebSocketDisconnect
        from fastapi.middleware.cors import CORSMiddleware

        api = FastAPI()
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"]
        )

        @api.websocket("/ws/live")
        async def websocket_endpoint(ws: WebSocket):
            await ws.accept()
            logger.info("Frontend connected to Modal Duet Live Agent.")

            is_connected = True
            speech_buffer = bytearray()
            active_turn_task = None

            async def run_turn(user_prompt: str):
                nonlocal is_connected
                if not user_prompt.strip():
                    return

                logger.info(f"Processing turn for: {user_prompt}")
                await ws.send_text(json.dumps({"type": "state", "state": "THINKING"}))

                # Conversational response generation with dynamic canvas triggers
                p = user_prompt.lower()
                if "force" in p or "gravity" in p:
                    text_out = "Force is an interaction that accelerates mass. [[ACTION:math:F_{net} = m \\cdot a]] Notice how gravity acts downward toward the center. What balances this on a stationary plane?"
                elif any(greet in p for greet in ["hello", "hi", "hey"]):
                    text_out = "Hello! I am Duet, your live tutor and thought partner. What are we exploring or sketching today?"
                elif "momentum" in p:
                    text_out = "Linear momentum is the product of mass and velocity. [[ACTION:math:p = m \\cdot v]] What happens to momentum during an inelastic collision?"
                else:
                    text_out = f"You asked about '{user_prompt.strip()}'. Let's break this down together step by step right on the board."

                # Send visual canvas action to tldraw
                if "[[ACTION:math:" in text_out:
                    action_part = text_out.split("[[ACTION:math:")[1].split("]]")[0]
                    await ws.send_text(json.dumps({
                        "type": "canvas_action",
                        "action": {"type": "math", "payload": {"text": action_part}}
                    }))

                clean_speech = text_out.split("[[ACTION:")[0].strip()

                await ws.send_text(json.dumps({"type": "state", "state": "SPEAKING"}))
                await ws.send_text(json.dumps({"type": "speak_start", "text": clean_speech}))

                # Synthesize voice audio via SeamlessM4T running on this GPU
                loop = asyncio.get_running_loop()
                pcm_bytes = await loop.run_in_executor(None, self.synthesize_speech, clean_speech)
                
                if pcm_bytes and is_connected:
                    # Stream raw binary PCM directly into browser's useAudioQueue
                    await ws.send_bytes(pcm_bytes)

                await ws.send_text(json.dumps({"type": "state", "state": "LISTENING"}))

            try:
                while is_connected:
                    msg = await ws.receive()
                    if msg.get("type") == "websocket.disconnect":
                        is_connected = False
                        break

                    # Raw binary PCM microphone streaming
                    if "bytes" in msg and msg["bytes"]:
                        speech_buffer.extend(msg["bytes"])
                        # Check buffer threshold (~1.2s of audio at 16kHz 16-bit mono = 38400 bytes)
                        if len(speech_buffer) >= 38400:
                            audio_chunk = bytes(speech_buffer)
                            speech_buffer.clear()

                            loop = asyncio.get_running_loop()
                            transcription = await loop.run_in_executor(None, self.transcribe_audio, audio_chunk)

                            if transcription.strip():
                                logger.info(f"Transcribed speech: {transcription}")
                                if active_turn_task and not active_turn_task.done():
                                    active_turn_task.cancel()
                                active_turn_task = asyncio.create_task(run_turn(transcription))

                    # JSON control frames & manual text input
                    elif "text" in msg and msg["text"]:
                        data = json.loads(msg["text"])
                        if data.get("type") == "barge_in":
                            if active_turn_task and not active_turn_task.done():
                                active_turn_task.cancel()
                            await ws.send_text(json.dumps({"type": "interrupt"}))
                        elif data.get("type") == "user_text":
                            if active_turn_task and not active_turn_task.done():
                                active_turn_task.cancel()
                            active_turn_task = asyncio.create_task(run_turn(data.get("text", "")))

            except WebSocketDisconnect:
                logger.info("Client disconnected.")
            finally:
                is_connected = False

        return api