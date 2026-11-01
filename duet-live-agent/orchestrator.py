"""duet-live-agent/orchestrator.py
Coordinates STT partials -> drift check -> ai_interject, and audio energy -> barge-in.
"""
from __future__ import annotations
import asyncio
import logging
import re
import time
from dataclasses import dataclass
from typing import List, Optional

try:
    from .session import DuetLiveSession, SessionState, CanvasAction
except ImportError:
    from session import DuetLiveSession, SessionState, CanvasAction

log = logging.getLogger("duet.orchestrator")

# Critical premise errors: sign flips, conservation violations, divide-by-zero logic
DRIFT_PATTERNS = [
    (re.compile(r"friction.*(forward|with motion|same direction)", re.I), "friction direction", 0.92),
    (re.compile(r"gravity.*(up|upward|positive y)", re.I), "gravity sign", 0.90),
    (re.compile(r"normal.*(down|negative)", re.I), "normal sign", 0.88),
    (re.compile(r"divide.*zero|/ ?0\b", re.I), "divide by zero", 0.95),
    (re.compile(r"ΣF\s*=\s*0.*a\s*!=\s*0", re.I), "net force contradiction", 0.90),
    (re.compile(r"v\s*=\s*0.*so.*(F|force)\s*=\s*0", re.I), "v=0 => F=0 misconception", 0.87),
]

INTERJECT_TEXT = {
    "friction direction": "Wait, pause there — check the direction of friction first.",
    "gravity sign": "Wait, pause there — check the sign of that force.",
    "normal sign": "Hold on — which way does the normal point?",
    "divide by zero": "Hold on — you're about to divide by zero.",
    "net force contradiction": "Wait — if net force is zero, what does that say about acceleration?",
    "v=0 => F=0 misconception": "Hold on — zero velocity doesn't mean zero force. Think net force.",
}

@dataclass
class Partial:
    text: str
    confidence: float
    ts: float

class CanvasCoordinator:
    """Prevents overlap: 64px line pitch, max 4 primitives per turn unless confident."""
    def __init__(self, x0=200, y0=150, pitch=64, max_per_turn=4):
        self.x0, self.y0, self.pitch = x0, y0, pitch
        self.max_per_turn = max_per_turn
        self._row = 0

    def place_text(self, label: str, anchor_word: str = "") -> CanvasAction:
        a = CanvasAction(type="text", x=self.x0, y=self.y0 + self._row * self.pitch,
                         label=label, anchor_word=anchor_word or label.split()[0])
        self._row += 1
        return a

    def reset_turn(self):
        self._row = 0

class Orchestrator:
    def __init__(
        self,
        session: DuetLiveSession,
        energy_threshold: float = 0.35,
        hangover_frames: int = 2,
        interject_threshold: float = 0.85,
    ):
        self.s = session
        self.energy_threshold = energy_threshold
        self.hangover_frames = hangover_frames
        self.interject_threshold = interject_threshold
        self._hot_frames = 0
        self._partials: List[Partial] = []
        self._last_partial_ts = time.time()
        self.canvas = CanvasCoordinator()
        self._interjected_for: set[str] = set()  # once per turn per error key

    # ---- audio path (16kHz PCM frames -> energy) ----
    async def on_audio_frame(self, pcm_bytes: bytes, energy: float):
        # During SPEAKING, energy spike = user barge-in. Delegate cancel to session.
        if self.s.state == SessionState.SPEAKING and energy >= self.energy_threshold:
            self._hot_frames += 1
            if self._hot_frames >= self.hangover_frames:
                self._hot_frames = 0
                await self.s.on_barge_in(source=f"vad_energy:{energy:.2f}")
        else:
            self._hot_frames = 0

    # ---- STT partial path (Muse Voice Transcribe streaming) ----
    async def on_partial(self, text: str, confidence: float):
        now = time.time()
        pause_ms = (now - self._last_partial_ts) * 1000
        self._last_partial_ts = now
        self._partials.append(Partial(text, confidence, now))
        # keep rolling window
        self._partials = self._partials[-20:]

        # Only interject while user is speaking/thinking, not while AI is speaking full turn
        if self.s.state not in (SessionState.LISTENING, SessionState.THINKING):
            return

        key, conf = self.detect_drift(text, confidence)
        if key and conf > self.interject_threshold and key not in self._interjected_for:
            self._interjected_for.add(key)
            await self.s.ai_interject(INTERJECT_TEXT[key], speak_short=False)
            # Drop a visual anchor immediately (spiral guard) — queued for next speak flush
            anchor = self.canvas.place_text(
                label="ΣF = m·a  (+y up)",
                anchor_word="force",
            )
            self.s.queue_canvas(anchor)

    async def on_final(self, text: str, confidence: float = 1.0):
        self._interjected_for.clear()
        self.canvas.reset_turn()
        await self.s.execute_turn(text)
        

    @staticmethod
    def detect_drift(text: str, confidence: float):
        """Returns (error_key, confidence) if critical premise error."""
        if confidence < 0.5:
            return None, 0.0
        for pat, key, prior in DRIFT_PATTERNS:
            if pat.search(text):
                # fuse STT confidence with pattern prior
                fused = min(0.99, (confidence + prior) / 2 + 0.05)
                return key, fused
        return None, 0.0

    # ---- canvas action path with coordinate guard ----
    async def add_canvas_action(self, action: CanvasAction):
        # Enforce max per turn to leave canvas uncluttered (pondering mode)
        if len(self.s._pending_timeline) >= self.canvas.max_per_turn:
            log.warning("canvas budget exceeded, dropping %s", action.label)
            return False
        self.s.queue_canvas(action)
        return True