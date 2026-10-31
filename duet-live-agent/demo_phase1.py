# duet-live-agent/demo_phase1.py
import asyncio
from session import DuetLiveSession
from orchestrator import Orchestrator

async def fake_llm(prompt, cancel_event):
    yield {"speech_token": "The normal force balances weight. "}
    yield {"speech_token": "So N equals m g."}

async def fake_tts(text, tempo):
    words = [{"w": w, "start": 0.4*i, "end": 0.4*i+0.3} for i, w in enumerate(text.split())]
    yield {"pcm": b"\x00"*320, "words": words}

async def send_to_browser(msg):
    print("->", msg["type"], msg.get("text", msg.get("audio_id", "")))

async def main():
    sess = DuetLiveSession(send=send_to_browser, llm_stream=fake_llm, tts_stream=fake_tts)
    orch = Orchestrator(sess)
    await sess.start()
    # 1. AI interjects on bad premise
    await orch.on_partial("gravity acts upward so...", confidence=0.93)
    # 2. Full turn
    await orch.on_final("gravity acts upward so net force is...")
    await asyncio.sleep(0.5)
    # 3. User barge-in during SPEAKING
    await orch.on_audio_frame(b"\x00"*640, energy=0.8)
    await orch.on_audio_frame(b"\x00"*640, energy=0.9)

if __name__ == "__main__":
    asyncio.run(main())