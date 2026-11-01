// src/App.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Tldraw, createShapeId, toRichText } from 'tldraw';
import 'tldraw/tldraw.css';
import { useDuetAgent } from './hooks/useDuetAgent';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'system', text: 'Connecting to Duet live server...' }
  ]);
  const editorRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Auto-scroll chat panel to latest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle visual drawing actions dispatched by the agent
  const handleCanvasAction = useCallback((action) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    const mathText = action.payload?.raw || action.payload?.text || 'F_{net} = m \\times a';
    const id = createShapeId();

    try {
      editor.createShape({
        id,
        type: 'text',
        x: 220 + Math.random() * 60,
        y: 180 + Math.random() * 60,
        props: {
          richText: typeof toRichText === 'function' ? toRichText(mathText) : mathText,
          size: 'm',
          color: 'blue',
        },
      });
    } catch (err) {
      console.warn('Canvas shape fallback:', err);
    }

    setMessages((prev) => [
      ...prev,
      { sender: 'canvas', text: `Canvas Action: ${action.type} -> ${mathText}` }
    ]);
  }, []);

  const handleSubtitle = useCallback((text) => {
    setSubtitle(text);
    setMessages((prev) => [
      ...prev,
      { sender: 'agent', text }
    ]);
  }, []);

  const handleInterject = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { sender: 'interject', text: `⚠️ Interjection: ${text}` }
    ]);
  }, []);

  const {
    isConnected,
    isRecording,
    agentState,
    startLiveSession,
    stopLiveSession,
    sendUserText,
    manualInterrupt,
  } = useDuetAgent({
    onCanvasAction: handleCanvasAction,
    onSubtitle: handleSubtitle,
    onInterject: handleInterject,
  });

  // Track connection state in message feed
  useEffect(() => {
    setMessages((prev) => [
      ...prev,
      {
        sender: 'system',
        text: isConnected
          ? 'WebSocket connected to Duet Live Agent.'
          : 'WebSocket disconnected.'
      }
    ]);
  }, [isConnected]);

  const handleSend = (e) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) return;

    // Log locally in UI panel
    setMessages((prev) => [...prev, { sender: 'user', text: clean }]);

    // Dispatch through the WebSocket hook
    if (typeof sendUserText === 'function') {
      sendUserText(clean);
    } else {
      console.error('sendUserText is not defined on useDuetAgent');
    }

    setInputText('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex' }}>
      
      {/* 1. Left Canvas Area (tldraw) */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <Tldraw
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />

        {/* Top Control Bar on Canvas */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            padding: '6px 14px',
            borderRadius: 30,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: !isConnected
                  ? '#9ca3af'
                  : agentState === 'SPEAKING'
                  ? '#3b82f6'
                  : agentState === 'THINKING'
                  ? '#f59e0b'
                  : '#10b981',
              }}
            />
            <span style={{ color: '#1f2937' }}>
              {!isConnected ? 'Connecting...' : `Duet ${agentState}`}
            </span>
          </div>

          <button
            onClick={isRecording ? stopLiveSession : startLiveSession}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 20,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: isRecording ? '#ef4444' : '#10b981',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {isRecording ? '● Live Mic (Active)' : '🎙 Start Live Voice'}
          </button>

          <button
            onClick={manualInterrupt}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 20,
              cursor: 'pointer',
              border: '1px solid #e5e7eb',
              backgroundColor: '#f3f4f6',
              color: '#374151',
            }}
          >
            Interrupt
          </button>
        </div>

        {/* Live Audio Subtitle Overlay */}
        {subtitle && (
          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              maxWidth: '600px',
              padding: '8px 18px',
              borderRadius: 20,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              color: '#f8fafc',
              fontSize: 14,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* 2. Right Side Chat Panel */}
      <div
        style={{
          width: '380px',
          height: '100%',
          backgroundColor: '#ffffff',
          borderLeft: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.03)',
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fafafa',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Duet Live Log</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              background: isConnected ? '#ecfdf5' : '#fef2f2',
              color: isConnected ? '#059669' : '#dc2626',
            }}
          >
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* Message Stream */}
        <div
          ref={chatScrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontSize: 13,
          }}
        >
          {messages.map((m, idx) => {
            if (m.sender === 'system') {
              return (
                <div key={idx} style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
                  {m.text}
                </div>
              );
            }
            if (m.sender === 'interject') {
              return (
                <div key={idx} style={{ padding: '8px 12px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontWeight: 500 }}>
                  {m.text}
                </div>
              );
            }
            if (m.sender === 'canvas') {
              return (
                <div key={idx} style={{ padding: '6px 10px', background: '#eff6ff', color: '#1e40af', borderRadius: 8, fontSize: 12 }}>
                  {m.text}
                </div>
              );
            }
            const isUser = m.sender === 'user';
            return (
              <div
                key={idx}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '9px 13px',
                  borderRadius: 14,
                  backgroundColor: isUser ? '#2563eb' : '#f3f4f6',
                  color: isUser ? '#ffffff' : '#1f2937',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{isUser ? 'You' : 'Duet'}</div>
                {m.text}
              </div>
            );
          })}
        </div>

        {/* Input Bar Form */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '12px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            gap: 8,
            backgroundColor: '#ffffff',
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message or premise..."
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!isConnected}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              backgroundColor: isConnected ? '#111827' : '#9ca3af',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </form>
      </div>

    </div>
  );
}