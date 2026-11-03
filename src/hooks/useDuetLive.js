import { useEffect, useRef, useState, useCallback } from 'react';

export function useDuetLive(editor, wsUrl = 'ws://127.0.0.1:8000/ws/session') {
  const [status, setStatus] = useState('OFFLINE');
  const [agentState, setAgentState] = useState('LISTENING');
  const [activeSpeech, setActiveSpeech] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);

  const wsRef = useRef(null);
  const editorRef = useRef(editor);
  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  // Keep editor ref synced without re-triggering WebSocket
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Audio queue flusher & speech cancellation
  const flushAudio = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Web Audio binary chunk player (for streaming audio bytes)
  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) return;
    isPlayingRef.current = true;

    const audioData = audioQueueRef.current.shift();
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }
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

  // Browser Text-To-Speech Fallback (Reliable Chrome Player)
  const speakBrowserVoice = useCallback((text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const deliverSpeech = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const naturalVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Zira'))
        ) || voices.find((v) => v.lang.startsWith('en'));

        if (naturalVoice) {
          utterance.voice = naturalVoice;
        }
      }

      utterance.onend = () => {
        setAgentState('LISTENING');
      };

      utterance.onerror = (e) => {
        console.error('TTS playback error:', e);
        setAgentState('LISTENING');
      };

      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        deliverSpeech();
        window.speechSynthesis.onvoiceschanged = null;
      };
    } else {
      deliverSpeech();
    }
  }, []);

  // Spatial Whiteboard Tool Dispatcher
  const handleCanvasTool = useCallback((action, payload) => {
    const ed = editorRef.current;
    if (!ed) return;

    try {
      const camera = ed.getCamera();
      const centerX = -camera.x + window.innerWidth / (2 * camera.z);
      const centerY = -camera.y + window.innerHeight / (2 * camera.z);

      if (action === 'draw_formula' && payload.formula) {
        ed.createShape({
          type: 'geo',
          x: centerX - 210,
          y: centerY - 60,
          props: {
            geo: 'rectangle',
            w: 420,
            h: 120,
            color: 'orange',
            fill: 'semi',
            dash: 'draw',
          },
        });

        ed.createShape({
          type: 'text',
          x: centerX - 180,
          y: centerY - 30,
          props: {
            text: payload.formula,
            size: 'l',
            color: 'black',
          },
        });
      } else if (action === 'create_note' && payload.text) {
        ed.createShape({
          type: 'note',
          x: centerX + 240,
          y: centerY - 60,
          props: {
            text: payload.text,
            color: 'yellow',
            size: 'm',
          },
        });
      }
    } catch (err) {
      console.warn('Canvas tool placement error:', err);
    }
  }, []);

  // Outgoing user message
  const sendMessage = useCallback((text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();

    // Unlock browser audio context on user action
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    wsRef.current.send(JSON.stringify({ type: 'user_message', text }));
  }, [flushAudio]);

  // Barge-in interruption
  const interruptAgent = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();
    wsRef.current.send(JSON.stringify({ type: 'barge_in' }));
  }, [flushAudio]);

  // WebSocket Connection
  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus('ONLINE');
    ws.onclose = () => {
      setStatus('OFFLINE');
      setIsMicActive(false);
    };

    ws.onmessage = async (event) => {
      // 1. Streamed Audio Bytes
      if (event.data instanceof Blob) {
        const arrayBuf = await event.data.arrayBuffer();
        audioQueueRef.current.push(arrayBuf);
        playNextAudioChunk();
        return;
      }

      // 2. JSON Control Messages
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'state') {
          setAgentState(msg.state);
        } else if (msg.type === 'spoken_transcript') {
          setActiveSpeech(msg.text);
        } else if (msg.type === 'interrupt_ack') {
          flushAudio();
        } else if (msg.type === 'audio_fallback') {
          speakBrowserVoice(msg.text);
        } else if (msg.type === 'canvas_tool') {
          handleCanvasTool(msg.action, msg.payload);
        }
      } catch (err) {
        console.error('Failed to parse agent message:', err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
      }
    };
  }, [wsUrl, playNextAudioChunk, flushAudio, speakBrowserVoice, handleCanvasTool]);

  // Live Speech Recognition Toggle
  const toggleLiveVoice = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (isMicActive) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsMicActive(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Google Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim();
      if (transcript) {
        sendMessage(transcript);
      }
    };

    recognition.onerror = () => setIsMicActive(false);
    recognition.onend = () => setIsMicActive(false);

    recognition.start();
    recognitionRef.current = recognition;
    setIsMicActive(true);
  }, [isMicActive, sendMessage]);

  return {
    status,
    agentState,
    activeSpeech,
    isMicActive,
    sendMessage,
    interruptAgent,
    toggleLiveVoice,
  };
}