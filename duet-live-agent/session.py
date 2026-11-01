# duet-live-agent/session.py
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import Enum
import logging
import re
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional

logger = logging.getLogger("duet.session")


class SessionState(str, Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    SPEAKING = "SPEAKING"


@dataclass
class CanvasAction:
    type: str = "draw"
    x: float = 0.0
    y: float = 0.0
    label: str = ""
    anchor_word: Optional[str] = None
    action_type: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    anchor_phrase: Optional[str] = None
    audio_offset_sec: float = 0.0

    def __post_init__(self):
        # Normalize fields so orchestrator and session work seamlessly together
        if not self.action_type:
            self.action_type = self.type
        if not self.anchor_phrase:
            self.anchor_phrase = self.anchor_word or self.label
        if not self.payload and (self.x or self.y or self.label):
            self.payload = {"x": self.x, "y": self.y, "label": self.label}


class DuetLiveSession:
    """
    Bi-directional full-duplex session manager.
    Handles turn state transitions, overlapped streaming between LLM and TTS,
    instant barge-in task cancellation, and audio-timeline canvas synchronization.
    """
    async def on_user_final(self, text: str):
        """Bridge alias called by Orchestrator.on_final"""
        await self.execute_turn(text)

    def __init__(
        self,
        send: Callable[[dict], Any],
        llm_stream: Optional[Callable[[str], AsyncGenerator[str, None]]] = None,
        tts_stream: Optional[Callable[[str], AsyncGenerator[dict, None]]] = None,
    ):
        self.send = send
        self.llm_stream = llm_stream
        self.tts_stream = tts_stream

        self.state = SessionState.IDLE
        self._active_turn_task: Optional[asyncio.Task] = None
        self._pending_tts_tasks: List[asyncio.Task] = []
        self._pending_timeline: List[CanvasAction] = []
        self._action_regex = re.compile(r"\[\[ACTION:(\w+):(.*?)\]\]")

    async def start(self):
        """Initializes session state and notifies client."""
        await self._transition_to(SessionState.LISTENING)

    async def _transition_to(self, new_state: SessionState):
        self.state = new_state
        logger.info(f"session {new_state.value}")
        await self._dispatch({"type": "state", "state": new_state.value})

    async def _dispatch(self, message: dict):
        try:
            res = self.send(message)
            if asyncio.iscoroutine(res):
                await res
        except Exception as e:
            logger.warning(f"Failed to dispatch message to client: {e}")

    # -------------------------------------------------------------------------
    # Interruption & Barge-In Logic
    # -------------------------------------------------------------------------
    async def barge_in(self):
        """Cancels running LLM reasoning and active TTS tasks immediately."""
        if self._active_turn_task and not self._active_turn_task.done():
            self._active_turn_task.cancel()
            self._active_turn_task = None

        for task in self._pending_tts_tasks:
            if not task.done():
                task.cancel()
        self._pending_tts_tasks.clear()
        self._pending_timeline.clear()

        await self._dispatch({"type": "interrupt"})
        await self._transition_to(SessionState.LISTENING)

    async def interrupt(self):
        """Alias for barge_in to support diverse caller conventions."""
        await self.barge_in()

    # -------------------------------------------------------------------------
    # Turn Execution
    # -------------------------------------------------------------------------
    async def execute_turn(self, user_prompt: str):
        """Executes a full turn with overlapped LLM streaming and TTS chunking."""
        # Cancel any prior turn still running
        await self.barge_in()

        self._active_turn_task = asyncio.create_task(
            self._run_turn_pipeline(user_prompt)
        )

    async def _run_turn_pipeline(self, user_prompt: str):
        if not self.llm_stream or not self.tts_stream:
            logger.warning("llm_stream or tts_stream not configured.")
            return

        try:
            await self._transition_to(SessionState.THINKING)
            clause_buffer = ""

            async for token in self.llm_stream(user_prompt):
                # Check for canvas action tags embedded in token stream
                match = self._action_regex.search(token)
                if match:
                    action_type, payload_str = match.groups()
                    self._pending_timeline.append(
                        CanvasAction(
                            action_type=action_type,
                            payload={"raw": payload_str},
                            anchor_phrase=clause_buffer.strip().split()[-1] if clause_buffer.strip() else None,
                        )
                    )
                    token = self._action_regex.sub("", token)

                clause_buffer += token

                # Trigger synthesis at clause boundaries (., ?, !, or comma after sufficient words)
                if any(p in token for p in [".", "?", "!", "\n"]) or (
                    "," in token and len(clause_buffer.split()) >= 4
                ):
                    phrase = clause_buffer.strip()
                    clause_buffer = ""
                    if phrase:
                        if self.state != SessionState.SPEAKING:
                            await self._transition_to(SessionState.SPEAKING)
                            await self._dispatch({"type": "speak_start", "text": phrase})

                        tts_task = asyncio.create_task(self._pump_tts(phrase))
                        self._pending_tts_tasks.append(tts_task)

            # Flush any remaining text in buffer
            phrase = clause_buffer.strip()
            if phrase:
                if self.state != SessionState.SPEAKING:
                    await self._transition_to(SessionState.SPEAKING)
                    await self._dispatch({"type": "speak_start", "text": phrase})

                tts_task = asyncio.create_task(self._pump_tts(phrase))
                self._pending_tts_tasks.append(tts_task)

            # Wait for all audio chunk tasks to finish synthesis and dispatch
            if self._pending_tts_tasks:
                await asyncio.gather(*self._pending_tts_tasks, return_exceptions=True)

        except asyncio.CancelledError:
            logger.info("Active turn pipeline was cancelled due to barge-in.")
            raise
        except Exception as e:
            logger.error(f"Error executing turn pipeline: {e}", exc_info=True)
        finally:
            await self._transition_to(SessionState.LISTENING)

    # -------------------------------------------------------------------------
    # Audio Synthesis & Audio-Timeline Alignment
    # -------------------------------------------------------------------------
    async def _pump_tts(self, phrase: str):
        try:
            async for chunk in self.tts_stream(phrase):
                words = chunk.get("words", [])
                timeline_actions = self.align_to_audio(
                    words, self._pending_timeline_drain()
                )

                # Dispatch audio frame to client
                await self._dispatch(
                    {
                        "type": "audio",
                        "audio_id": chunk.get("audio_id", ""),
                        "duration": chunk.get("duration", 0.0),
                    }
                )

                # Dispatch synchronized canvas actions scheduled to relative audio offsets
                for action in timeline_actions:
                    await self._dispatch(
                        {
                            "type": "canvas_action",
                            "action": {
                                "type": action.action_type,
                                "payload": action.payload,
                                "audio_offset_sec": action.audio_offset_sec,
                            },
                        }
                    )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in _pump_tts: {e}", exc_info=True)

    def _pending_timeline_drain(self) -> List[CanvasAction]:
        drained = list(self._pending_timeline)
        self._pending_timeline.clear()
        return drained

    def align_to_audio(
        self, words: List[Any], actions: List[CanvasAction]
    ) -> List[CanvasAction]:
        """
        Aligns visual canvas actions to audio word timestamps.
        Safely handles word entries whether they are dicts or objects.
        """
        if not words or not actions:
            return actions

        # Safe dictionary vs object attribute extraction
        def get_word_str(w: Any) -> str:
            val = w.get("w", "") if isinstance(w, dict) else getattr(w, "w", "")
            return str(val).lower().strip(".,?!")

        def get_word_start(w: Any) -> float:
            val = w.get("start", 0.0) if isinstance(w, dict) else getattr(w, "start", 0.0)
            return float(val)

        idx = {get_word_str(w): w for w in words}

        for action in actions:
            if action.anchor_phrase:
                target = action.anchor_phrase.lower().strip(".,?!")
                if target in idx:
                    matched_word = idx[target]
                    action.audio_offset_sec = get_word_start(matched_word)
                else:
                    # Default to start of first word if anchor isn't precisely matched
                    action.audio_offset_sec = get_word_start(words[0])
            else:
                action.audio_offset_sec = get_word_start(words[0])

        return actions
