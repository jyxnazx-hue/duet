// src/hooks/useAudioStreamer.js
import { useRef, useState, useCallback } from 'react';

export function useAudioStreamer({ onPcmChunk, onLocalVAD }) {
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const startStreaming = useCallback(async () => {
    try {
      // 1. Request microphone with hardware AEC and noise suppression enabled
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Initialize AudioContext
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;

      // 3. Load the PCM Worklet
      await ctx.audioWorklet.addModule('/pcm-recorder-worklet.js');

      const sourceNode = ctx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(ctx, 'pcm-recorder-worklet');
      workletNodeRef.current = workletNode;

      // 4. Intercept raw PCM chunks from the worklet thread
      workletNode.port.onmessage = (event) => {
        const pcmArrayBuffer = event.data; // Raw 16kHz Int16 ArrayBuffer
        const pcm16 = new Int16Array(pcmArrayBuffer);

        // Simple RMS energy calculation for immediate client-side barge-in ducking
        let sumSquares = 0;
        for (let i = 0; i < pcm16.length; i++) {
          const norm = pcm16[i] / 32768;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / pcm16.length);

        if (onLocalVAD) {
          onLocalVAD(rms);
        }

        if (onPcmChunk) {
          onPcmChunk(pcmArrayBuffer, rms);
        }
      };

      sourceNode.connect(workletNode);
      // Connect to destination via silent gain to keep worklet alive across browsers
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      setIsRecording(true);
    } catch (err) {
      console.error('Failed to initialize audio capture:', err);
    }
  }, [onPcmChunk, onLocalVAD]);

  const stopStreaming = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startStreaming, stopStreaming };
}