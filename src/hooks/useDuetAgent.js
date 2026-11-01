// src/hooks/useDuetAgent.js
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioStreamer } from './useAudioStreamer';
import { useAudioQueue } from './useAudioQueue';

export function useDuetAgent({ onCanvasAction, onInterject, onSubtitle } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [agentState, setAgentState] = useState('IDLE'); // IDLE, LISTENING, THINKING, SPEAKING
  const socketRef = useRef(null);

  const { enqueueAudioChunk, interrupt: stopLocalAudio } = useAudioQueue();

  // Helper to instantly kill any browser speech synthesis
  const cancelBrowserSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Instant client-side ducking when user voice energy spikes
  const handleLocalVAD = useCallback((rms) => {
    if (rms > 0.04 && agentState === 'SPEAKING') {
      cancelBrowserSpeech();
      stopLocalAudio();
      setAgentState('LISTENING');
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'barge_in' }));
      }
    }
  }, [agentState, stopLocalAudio, cancelBrowserSpeech]);

  // Stream raw PCM chunks directly to the backend
  const handlePcmChunk = useCallback((pcmArrayBuffer) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(pcmArrayBuffer);
    }
  }, []);

  const { isRecording, startStreaming, stopStreaming } = useAudioStreamer({
    onPcmChunk: handlePcmChunk,
    onLocalVAD: handleLocalVAD,
  });

  // Dispatch text messages over WebSocket
  const sendUserText = useCallback((text) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'user_text', text }));
    } else {
      console.warn('Socket not open, cannot send text');
    }
  }, []);

  // Manual interrupt (barge-in button)
  const manualInterrupt = useCallback(() => {
    cancelBrowserSpeech();
    stopLocalAudio();
    setAgentState('LISTENING');
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'barge_in' }));
    }
  }, [stopLocalAudio, cancelBrowserSpeech]);

  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket('ws://localhost:8000/ws/live');
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isMounted) return;
      console.log('Duet Agent WebSocket connected');
      setIsConnected(true);
    };

    ws.onerror = (err) => {
      console.error('Duet Agent WS error:', err);
    };

    ws.onmessage = async (event) => {
      if (!isMounted) return;

      // Case 1: Binary audio data from backend TTS
      if (event.data instanceof ArrayBuffer) {
        await enqueueAudioChunk(event.data);
        return;
      }

      // Case 2: JSON control frames
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'state':
            setAgentState(msg.state);
            break;

          case 'ai_interject':
            cancelBrowserSpeech();
            stopLocalAudio();
            if (onInterject) onInterject(msg.text);
            if (onSubtitle) onSubtitle(msg.text);
            break;

          case 'speak_start':
            setAgentState('SPEAKING');
            if (onSubtitle) onSubtitle(msg.text);

            // Real-time audio playback through speakers
            if (typeof window !== 'undefined' && 'speechSynthesis' in window && msg.text) {
              window.speechSynthesis.cancel();
              const cleanSpeech = msg.text.replace(/\[\[ACTION:.*?\]\]/g, '').trim();
              if (cleanSpeech) {
                const utterance = new SpeechSynthesisUtterance(cleanSpeech);
                utterance.rate = 1.05;
                utterance.pitch = 1.0;
                window.speechSynthesis.speak(utterance);
              }
            }
            break;

          case 'interrupt':
            cancelBrowserSpeech();
            stopLocalAudio();
            setAgentState('LISTENING');
            break;

          case 'canvas_action':
            if (onCanvasAction) onCanvasAction(msg.action);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    ws.onclose = () => {
      if (!isMounted) return;
      console.log('Duet Agent WebSocket disconnected');
      setIsConnected(false);
    };

    return () => {
      isMounted = false;
      cancelBrowserSpeech();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [enqueueAudioChunk, stopLocalAudio, cancelBrowserSpeech, onCanvasAction, onInterject, onSubtitle]);

  return {
    isConnected,
    isRecording,
    agentState,
    startLiveSession: startStreaming,
    stopLiveSession: stopStreaming,
    sendUserText,
    manualInterrupt,
  };
}