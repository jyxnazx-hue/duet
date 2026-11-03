import { useEffect, useRef, useState, useCallback } from 'react';

// REPLACE THIS with your active ngrok URL from Colab:
const WS_ENDPOINT = 'ws://localhost:8000/ws/live';

export function useDuetAgent(editor) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [agentState, setAgentState] = useState('IDLE'); // IDLE, LISTENING, THINKING, SPEAKING
  const [messages, setMessages] = useState([]);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const nextPlayTimeRef = useRef(0);

  // Initialize Audio Context for PCM streaming playback
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Play incoming raw 16kHz 16-bit linear PCM audio chunks smoothly
  const playPcmChunk = useCallback((arrayBuffer) => {
    const ctx = getAudioContext();
    const int16Array = new Int16Array(arrayBuffer);
    if (int16Array.length === 0) return;

    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, 16000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
  }, [getAudioContext]);

  // Handle interrupting audio playback immediately
  const stopAudioPlayback = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().then(() => {
        audioContextRef.current = null;
        nextPlayTimeRef.current = 0;
      });
    }
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_ENDPOINT);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to Duet Live Agent');
      setIsConnected(true);
      setAgentState('LISTENING');
    };

    ws.onclose = () => {
      console.log('Disconnected from Duet Live Agent');
      setIsConnected(false);
      setAgentState('IDLE');
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

    ws.onmessage = (event) => {
      // 1. Binary Audio Chunk from Meta Neural Model
      if (event.data instanceof ArrayBuffer) {
        playPcmChunk(event.data);
        return;
      }

      // 2. Control & Text JSON messages
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'state') {
          setAgentState(payload.state);
        } else if (payload.type === 'speak_start') {
          // Add real spoken response from Llama to chat log
          if (payload.text && payload.text.trim()) {
            setMessages((prev) => [...prev, { sender: 'duet', text: payload.text }]);
          }
        } else if (payload.type === 'interrupt') {
          stopAudioPlayback();
          setAgentState('LISTENING');
        } else if (payload.type === 'canvas_action' && editor) {
          // Render math or shapes on tldraw
          const { action } = payload;
          if (action.type === 'math' && action.payload?.text) {
            editor.createShape({
              type: 'text',
              x: 250 + Math.random() * 80,
              y: 200 + Math.random() * 80,
              props: {
                text: action.payload.text,
                size: 'm',
                color: 'blue',
              },
            });
          }
        }
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    return () => {
      ws.close();
      stopAudioPlayback();
    };
  }, [editor, playPcmChunk, stopAudioPlayback]);

  // Start Capturing Microphone and Streaming PCM
  const startMic = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);

      // Create script processor to stream 16kHz PCM
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          wsRef.current.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setIsMicActive(true);
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
    }
  }, [getAudioContext]);

  // Stop Microphone
  const stopMic = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsMicActive(false);
  }, []);

  // Send manual text input
  const sendTextMessage = useCallback((text) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [...prev, { sender: 'user', text }]);
    wsRef.current.send(JSON.stringify({ type: 'user_text', text }));
  }, []);

  // Trigger Barge-In
  const interrupt = useCallback(() => {
    stopAudioPlayback();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'barge_in' }));
    }
  }, [stopAudioPlayback]);

  return {
    isConnected,
    isMicActive,
    agentState,
    messages,
    startMic,
    stopMic,
    sendTextMessage,
    interrupt,
  };
}