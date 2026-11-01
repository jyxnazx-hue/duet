// src/hooks/useAudioQueue.js
import { useRef, useCallback } from 'react';

export function useAudioQueue() {
  const audioCtxRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Enqueue raw 16-bit PCM or WAV chunks received from backend
  const enqueueAudioChunk = useCallback(async (arrayBuffer, sampleRate = 24000) => {
    const ctx = getAudioContext();
    
    // Convert 16-bit PCM ArrayBuffer to AudioBuffer
    const pcm16 = new Int16Array(arrayBuffer);
    const audioBuffer = ctx.createBuffer(1, pcm16.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule seamlessly back-to-back
    const now = ctx.currentTime;
    const startTime = Math.max(now, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }, [getAudioContext]);

  // Instant barge-in cut: Stop all queued speech immediately
  const interrupt = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current = [];
    if (audioCtxRef.current) {
      nextStartTimeRef.current = audioCtxRef.current.currentTime;
    }
  }, []);

  return { enqueueAudioChunk, interrupt };
}