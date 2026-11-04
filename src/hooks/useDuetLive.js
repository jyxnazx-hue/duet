import { useEffect, useRef, useState, useCallback } from 'react';

export function useDuetLive(wsUrl = 'ws://127.0.0.1:8000/ws/session', onCanvasAction = null) {
  const [status, setStatus] = useState('OFFLINE');
  const [agentState, setAgentState] = useState('LISTENING');
  const [activeSpeech, setActiveSpeech] = useState('');
  const [conversation, setConversation] = useState([]);
  const [activeSimulation, setActiveSimulation] = useState(null);
  const [isMicActive, setIsMicActive] = useState(false);

  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const isMicActiveRef = useRef(false);
  const audioRef = useRef(new Audio());
  const audioChunksRef = useRef([]);

  const flushAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current.src = '';
      }
    }
    audioChunksRef.current = [];
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const playElevenLabsAudio = useCallback((blob) => {
    flushAudio();
    const url = URL.createObjectURL(blob);
    audioRef.current.src = url;
    audioRef.current.onended = () => {
      URL.revokeObjectURL(url);
      setAgentState('LISTENING');
    };
    audioRef.current.onerror = () => setAgentState('LISTENING');
    audioRef.current.play().catch(() => setAgentState('LISTENING'));
  }, [flushAudio]);

  const sendMessage = useCallback((text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();
    setConversation((prev) => [...prev, { sender: 'user', text }]);
    wsRef.current.send(JSON.stringify({ type: 'user_message', text }));
  }, [flushAudio]);

  const interruptAgent = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    flushAudio();
    wsRef.current.send(JSON.stringify({ type: 'barge_in' }));
    setAgentState('LISTENING');
  }, [flushAudio]);

  useEffect(() => {
    let isMounted = true;
    let socket = null;

    const timer = setTimeout(() => {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isMounted) setStatus('ONLINE');
      };

      socket.onclose = () => {
        if (isMounted) setStatus('OFFLINE');
      };

      socket.onmessage = async (event) => {
        if (!isMounted) return;

        // 1. Accumulate audio chunks
        if (event.data instanceof Blob) {
          audioChunksRef.current.push(event.data);
          return;
        }

        // 2. Control Messages
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state') {
            setAgentState(msg.state);
          } else if (msg.type === 'spoken_transcript') {
            setActiveSpeech(msg.text);
            setConversation((prev) => [...prev, { sender: 'duet', text: msg.text }]);
          } else if (msg.type === 'audio_end') {
            if (audioChunksRef.current.length > 0) {
              const fullAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' });
              audioChunksRef.current = [];
              playElevenLabsAudio(fullAudioBlob);
            }
          } else if (msg.type === 'canvas_tool') {
            if (msg.action === 'render_simulation') {
              setActiveSimulation(msg.payload);
            } else if (onCanvasAction) {
              // Pass direct drawing actions to App.jsx canvas
              onCanvasAction(msg.action, msg.payload);
            }
          } else if (msg.type === 'interrupt_ack') {
            flushAudio();
          }
        } catch (err) {
          console.error('WS message error:', err);
        }
      };
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (socket) socket.close();
    };
  }, [wsUrl, playElevenLabsAudio, flushAudio, onCanvasAction]);

  // Continuous speech recognition that auto-restarts until user toggles off
  const startRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim();
      if (transcript) sendMessage(transcript);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setIsMicActive(false);
        isMicActiveRef.current = false;
      }
    };

    rec.onend = () => {
      // Keep listening actively if user has not explicitly clicked mute
      if (isMicActiveRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setIsMicActive(true);
      isMicActiveRef.current = true;
    } catch {}
  }, [sendMessage]);

  const toggleLiveVoice = useCallback(() => {
    if (isMicActiveRef.current) {
      isMicActiveRef.current = false;
      setIsMicActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      startRecognition();
    }
  }, [startRecognition]);

  return {
    status,
    agentState,
    activeSpeech,
    conversation,
    activeSimulation,
    setActiveSimulation,
    isMicActive,
    sendMessage,
    interruptAgent,
    toggleLiveVoice,
  };
}