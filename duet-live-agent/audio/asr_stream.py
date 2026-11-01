# duet-live-agent/audio/asr_stream.py
from __future__ import annotations
import asyncio
# pyrefly: ignore[missing-import]
import audioop
import logging
from typing import AsyncGenerator, Callable, Optional

logger = logging.getLogger("duet.asr")

class StreamingASRManager:
    """
    Consumes continuous 16kHz mono 16-bit PCM audio frames from the browser,
    runs lightweight energy/silence gating, and yields speech bursts ready
    for transcription or emits partial events for real-time drift checking.
    """
    def __init__(
        self,
        sample_rate: int = 16000,
        frame_duration_ms: int = 40,
        energy_threshold: int = 450,       # Adjust based on ambient room noise
        silence_threshold_frames: int = 12  # ~480ms of silence marks end of turn
    ):
        self.sample_rate = sample_rate
        self.frame_duration_ms = frame_duration_ms
        self.energy_threshold = energy_threshold
        self.silence_threshold_frames = silence_threshold_frames

        self._in_speech = False
        self._silence_count = 0
        self._speech_buffer = bytearray()
        self._on_speech_start: Optional[Callable[[], None]] = None
        self._on_speech_end: Optional[Callable[[bytes], None]] = None

    def set_callbacks(
        self,
        on_speech_start: Optional[Callable[[], None]] = None,
        on_speech_end: Optional[Callable[[bytes], None]] = None
    ):
        self._on_speech_start = on_speech_start
        self._on_speech_end = on_speech_end

    async def process_pcm_frame(self, frame_bytes: bytes) -> Optional[bytes]:
        """
        Processes a raw 640-byte chunk (~40ms of 16kHz 16-bit PCM).
        Returns completed utterance audio bytes when a turn terminates.
        """
        if len(frame_bytes) == 0:
            return None

        # Calculate Root Mean Square (RMS) energy
        rms = audioop.rms(frame_bytes, 2)

        if rms > self.energy_threshold:
            self._silence_count = 0
            if not self._in_speech:
                self._in_speech = True
                logger.info(f"Speech detected (RMS: {rms}) -> Triggering speech_start")
                if self._on_speech_start:
                    self._on_speech_start()
            self._speech_buffer.extend(frame_bytes)
        else:
            if self._in_speech:
                self._speech_buffer.extend(frame_bytes)
                self._silence_count += 1

                # User stopped speaking for > silence_threshold_frames (~480ms)
                if self._silence_count >= self.silence_threshold_frames:
                    self._in_speech = False
                    self._silence_count = 0
                    utterance = bytes(self._speech_buffer)
                    self._speech_buffer.clear()
                    logger.info(f"Turn finalized ({len(utterance)} bytes)")
                    if self._on_speech_end:
                        self._on_speech_end(utterance)
                    return utterance

        return None

    def reset(self):
        self._in_speech = False
        self._silence_count = 0
        self._speech_buffer.clear()