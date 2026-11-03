import { useEffect, useRef, useState, useCallback } from 'react';

export function useDuetLive(editor, wsUrl = 'ws://localhost:8000/ws/session') {
  const [status, setStatus] = useState('OFFLINE'); // 'ONLINE' | 'OFFLINE'
  const [agentState, setAgentState] = useState('LISTENING'); // 'LISTENING' | 'THINKING' | 'SPEAKING'
  const [activeSpeech, setActiveSpeech] = useState('');
  
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  // Initialize Web Audio Context
  useEffect(() => {
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) return;
    isPlayingRef.current = true;

    const audioData = audioQueueRef.current.shift();
    try {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      const audioBuffer = await audioCtxRef.current.decodeAudioData(audioData.slice(0));
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtxRef.current.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        playNextAudioChunk();
      };
      source.start();
    } catch (err) {
      isPlayingRef.current = false;
      playNextAudioChunk();
    }
  }, []);

  const flushAudio = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus('ONLINE');
    ws.onclose = () => setStatus('OFFLINE');

    ws.onmessage = async (event) => {
      // Binary Audio Chunk
      if (event.data instanceof Blob) {
        const arrayBuf = await event.data.arrayBuffer();
        audioQueueRef.current.push(arrayBuf);
        playNextAudioChunk();
        return;
      }

      // JSON Control Message
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'state') {
          setAgentState(msg.state);
        } else if (msg.type === 'spoken_transcript') {
          setActiveSpeech(msg.text);
        } else if (msg.type === 'interrupt_ack') {
          flushAudio();
        } else if (msg.type === 'audio_fallback') {
          // Native fallback when no TTS API key is active
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(msg.text);
            utterance.rate = 0.95;
            window.speechSynthesis.speak(utterance);
          }
        } else if (msg.type === 'canvas_tool' && editor) {
          handleCanvasTool(editor, msg.action, msg.payload);
        }
      } catch (e) {
        console.error("Failed to parse agent message:", e);
      }
    };

    return () => ws.close();
  }, [wsUrl, editor, playNextAudioChunk, flushAudio]);

  const sendMessage = useCallback((text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();
    wsRef.current.send(JSON.stringify({ type: 'user_message', text }));
  }, [flushAudio]);

  const interruptAgent = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();
    wsRef.current.send(JSON.stringify({ type: 'barge_in' }));
  }, [flushAudio]);

  return { status, agentState, activeSpeech, sendMessage, interruptAgent };
}

// Spatial Whiteboard Tool Handler
function handleCanvasTool(editor, action, payload) {
  const camera = editor.getCamera();
  const centerX = -camera.x + window.innerWidth / (2 * camera.z);
  const centerY = -camera.y + window.innerHeight / (2 * camera.z);

  if (action === 'draw_formula' && payload.formula) {
    editor.createShape({
      type: 'geo',
      x: centerX - 200,
      y: centerY - 60,
      props: {
        geo: 'rectangle',
        w: 400,
        h: 110,
        color: 'yellow',
        fill: 'semi',
        dash: 'draw'
      }
    });

    editor.createShape({
      type: 'text',
      x: centerX - 180,
      y: centerY - 35,
      props: {
        text: payload.formula,
        size: 'l',
        color: 'black'
      }
    });
  } else if (action === 'create_note' && payload.text) {
    editor.createShape({
      type: 'note',
      x: centerX + 230,
      y: centerY - 60,
      props: {
        text: payload.text,
        color: 'grey',
        size: 'm'
      }
    });
  }
}