"""duet-live-agent/session.py
Full-duplex session modeled after LiveKit AgentSession + OpenAI Realtime session loop.
"""
from __future__ import annotations
import asyncio
import enum
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

log = logging.getLogger("duet.session")

class SessionState(str, enum.Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    SPEAKING = "SPEAKING"

_ALLOWED = {
    SessionState.IDLE: {SessionState.LISTENING},
    SessionState.LISTENING: {SessionState.THINKING, SessionState.SPEAKING, SessionState.IDLE, SessionState.LISTENING},
    SessionState.THINKING: {SessionState.SPEAKING, SessionState.LISTENING, SessionState.IDLE},
    SessionState.SPEAKING: {SessionState.LISTENING, SessionState.THINKING, SessionState.IDLE},
}

@dataclass
class CanvasAction:
    type: str  # arrow, line, text, circle, rect
    x: float
    y: float
    label: str = ""
    anchor_word: str = ""  # word in TTS that triggers render
    audio_offset_sec: Optional[float] = None
    audio_id: Optional[str] = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])

@dataclass
class WordTS:
    w: str
    start: float
    end: float

SendFn = Callable[[Dict[str, Any]], Awaitable[None]]

class DuetLiveSession:
    """Bi-directional event loop. Thread-safe via lock. Cancellation-first."""

    def __init__(
        self,
        send: SendFn,
        llm_stream: Callable[[str, asyncio.Event], Any],  # async gen: (prompt, cancel_event) -> {speech_token, canvas_action}
        tts_stream: Callable[[str, float], Any],  # async gen: (text, tempo) -> {pcm, words:[WordTS]}
        tempo: float = 1.0,
    ):
        self._send = send
        self._llm_stream = llm_stream
        self._tts_stream = tts_stream
        self.tempo = tempo

        self.state: SessionState = SessionState.IDLE
        self._lock = asyncio.Lock()
        self._closed = asyncio.Event()

        # Active cancellable work. Barge-in cancels all of these.
        self._tasks: set[asyncio.Task] = set()
        self._speech_cancel = asyncio.Event()  # set on barge-in

        self.playing_audio_id: Optional[str] = None
        self._play_start_mono: float = 0.0
        self._pending_timeline: List[CanvasAction] = []
        self.history: List[Dict[str, str]] = []  # truncated on interrupt like audio_interrupted

    # ---------- lifecycle ----------
    async def start(self):
        async with self._lock:
            self.state = SessionState.LISTENING
        log.info("session LISTENING")

    async def close(self):
        self._closed.set()
        await self._cancel_speech_tasks(reason="close")
        async with self._lock:
            self.state = SessionState.IDLE

    async def _transition(self, to: SessionState, reason: str = ""):
        async with self._lock:
            if to not in _ALLOWED.get(self.state, set()):
                log.warning("illegal %s -> %s (%s)", self.state, to, reason)
                return False
            log.info("state %s -> %s (%s)", self.state, to, reason)
            self.state = to
            return True

    def _track(self, coro, name: str) -> asyncio.Task:
        t = asyncio.create_task(coro, name=name)
        self._tasks.add(t)
        t.add_done_callback(lambda tt: self._tasks.discard(tt))
        return t

    # ---------- wire ----------
    async def send(self, msg: Dict[str, Any]):
        await self._send(msg)

    async def recv_client(self, msg: Dict[str, Any]):
        """Entry for ws frames from browser."""
        mtype = msg.get("type")
        if mtype == "barge_in":
            await self.on_barge_in(source="client_frame")
        elif mtype == "final_transcript":
            await self.on_user_final(msg.get("text", ""))
        elif mtype == "audio_energy":
            # fallback if client streams energy; orchestrator also calls on_audio_energy directly
            await self.on_audio_energy(float(msg.get("energy", 0.0)))
        else:
            log.debug("unknown client frame %s", mtype)

    # ---------- USER BARGE-IN ----------
    async def on_audio_energy(self, energy: float, threshold: float = 0.35, speaking_only: bool = True):
        """Called per 20ms PCM frame. Energy spike during SPEAKING = barge-in."""
        if self.state != SessionState.SPEAKING:
            return
        if energy >= threshold:
            await self.on_barge_in(source=f"energy:{energy:.2f}")

    async def on_barge_in(self, source: str = ""):
        """Instant preemption: cancel LLM/TTS, purge browser playout, -> LISTENING."""
        if self.state != SessionState.SPEAKING and not self._tasks:
            return
        log.info("BARGE-IN (%s) cancelling %d tasks", source, len(self._tasks))
        heard_sec = time.monotonic() - self._play_start_mono if self._play_start_mono else 0.0

        # 1. Signal cancellation to streaming generators
        self._speech_cancel.set()
        # 2. Hard cancel tasks -> raises asyncio.CancelledError inside LLM/TTS streams
        await self._cancel_speech_tasks(reason=f"barge_in:{source}")

        # 3. Truncate history to what user actually heard (audio_interrupted semantics)
        self._truncate_assistant_history(heard_sec)

        # 4. Tell browser to purge speaker buffers immediately (<20ms client cut)
        await self.send({
            "type": "interrupt",
            "stop_audio_id": self.playing_audio_id,
            "heard_sec": round(heard_sec, 3),
            "purge": True,
        })
        self.playing_audio_id = None
        self._speech_cancel.clear()
        await self._transition(SessionState.LISTENING, reason="barge_in")

    async def _cancel_speech_tasks(self, reason: str):
        tasks = list(self._tasks)
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
        log.info("cancelled speech tasks (%s)", reason)

    def _truncate_assistant_history(self, heard_sec: float):
        # Keep last assistant turn but mark truncated so LLM doesn't assume full playback
        if self.history and self.history[-1].get("role") == "assistant":
            self.history[-1]["truncated_at_sec"] = str(round(heard_sec, 3))

    # ---------- THINK + SPEAK ----------
    async def on_user_final(self, text: str):
        if not text.strip():
            await self._transition(SessionState.LISTENING, reason="empty_final")
            return
        self.history.append({"role": "user", "content": text})
        await self._transition(SessionState.THINKING, reason="user_final")
        # Run think->speak as cancellable task so barge-in can kill it
        self._track(self._think_and_speak(text), name=f"turn-{uuid.uuid4().hex[:6]}")

    async def _think_and_speak(self, user_text: str):
        try:
            # LLM streams speech tokens + canvas actions (Muse Spark adapter)
            speech_buf: List[str] = []
            canvas_buf: List[CanvasAction] = []
            async for chunk in self._llm_stream(user_text, self._speech_cancel):
                if self._speech_cancel.is_set():
                    raise asyncio.CancelledError()
                if tok := chunk.get("speech_token"):
                    speech_buf.append(tok)
                if act := chunk.get("canvas_action"):
                    canvas_buf.append(act)
                # incremental speak: flush every sentence to overlap LLM+TTS (streaming overlap)
                if tok and tok.strip().endswith((".", "?", "!")) and len(speech_buf) > 3:
                    await self._speak_flush(" ".join(speech_buf), canvas_buf)
                    speech_buf, canvas_buf = [], []
            if speech_buf:
                await self._speak_flush(" ".join(speech_buf), canvas_buf)
        except asyncio.CancelledError:
            log.info("turn cancelled (barge-in)")
            raise
        except Exception as e:
            log.exception("turn failed: %s", e)
            await self._transition(SessionState.LISTENING, reason="turn_error")

    async def _speak_flush(self, text: str, actions: List[CanvasAction]):
        if not text.strip():
            return
        await self._transition(SessionState.SPEAKING, reason="speak_flush")
        audio_id = uuid.uuid4().hex[:8]
        self.playing_audio_id = audio_id
        self._play_start_mono = time.monotonic()
        self.history.append({"role": "assistant", "content": text})

        # TTS streams pcm + word timestamps (SeamlessM4T-v2 adapter)
        words: List[WordTS] = []
        self._track(self._pump_tts(audio_id, text), name=f"tts-{audio_id}")

        # Wait for TTS word timestamps to tag timeline, then emit speak frame
        # In production pump_tts fills words via callback; here we collect after first chunk
        # Simplified: run synth inline to get words, then stream audio
        # To keep overlap, we send header first, timeline follows when ready
        await self.send({"type": "speak_start", "audio_id": audio_id, "text": text})
        # Actual audio pump runs as tracked task; timeline aligned below when words arrive

    async def _pump_tts(self, audio_id: str, text: str):
        try:
            words: List[WordTS] = []
            async for pkt in self._tts_stream(text, self.tempo):
                if self._speech_cancel.is_set():
                    raise asyncio.CancelledError()
                words.extend(pkt.get("words", []))
                await self.send({"type": "audio", "audio_id": audio_id, "pcm": pkt.get("pcm")})
            # Align canvas actions to audio offsets (Action-Timeline Audio Sync)
            timeline = self.align_to_audio(words, self._pending_timeline_drain())
            for a in timeline:
                a.audio_id = audio_id
            await self.send({"type": "timeline", "audio_id": audio_id,
                             "items": [a.__dict__ for a in timeline]})
            await self.send({"type": "speak_end", "audio_id": audio_id})
            if self.state == SessionState.SPEAKING:
                await self._transition(SessionState.LISTENING, reason="speak_done")
        except asyncio.CancelledError:
            await self.send({"type": "audio_cancelled", "audio_id": audio_id})
            raise

    def _pending_timeline_drain(self) -> List[CanvasAction]:
        items = list(self._pending_timeline)
        self._pending_timeline.clear()
        return items

    @staticmethod
    def align_to_audio(words: List[WordTS], actions: List[CanvasAction]) -> List[CanvasAction]:
        """Tag each primitive with audio_offset_sec from anchor word. Defaults to 0.0."""
        if not words:
            for a in actions:
                a.audio_offset_sec = 0.0
            return actions
        idx = {
    (w["w"].lower() if isinstance(w, dict) else w.w.lower()): w 
    for w in words
}
        for a in actions:
            w = idx.get((a.anchor_word or "").lower(), words[0])
            a.audio_offset_sec = float(w.start)
        return actions

    # ---------- AI PROACTIVE INTERJECTION ----------
    async def ai_interject(self, text: str, speak_short: bool = False):
        """Server -> client ai_interject frame. Does NOT cut mic. Optionally ducks TTS."""
        await self.send({"type": "ai_interject", "text": text})
        log.info("ai_interject: %s", text)
        if speak_short and self.state == SessionState.SPEAKING:
            # Duck current audio, inject short correction as new audio_id
            await self.send({"type": "duck", "for_ms": 800})

    def queue_canvas(self, action: CanvasAction):
        self._pending_timeline.append(action)