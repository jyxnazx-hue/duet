import React, { useState } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { useDuetLive } from './hooks/useDuetLive';

export default function App() {
  const [editor, setEditor] = useState(null);
  const [inputQuery, setInputQuery] = useState('');

  const {
    status,
    agentState,
    activeSpeech,
    isMicActive,
    sendMessage,
    interruptAgent,
    toggleLiveVoice,
  } = useDuetLive(editor, 'ws://127.0.0.1:8000/ws/session');

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    sendMessage(inputQuery);
    setInputQuery('');
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#FAF8F5',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 1. Fullscreen Whiteboard Canvas */}
      <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <Tldraw onMount={(editorInstance) => setEditor(editorInstance)} autoFocus />
      </div>

      {/* 2. Top Minimalist Status Pill */}
      <header
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 18px',
          backgroundColor: 'rgba(255, 253, 250, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #EAE4DD',
          borderRadius: '9999px',
          zIndex: 500,
          boxShadow: '0 8px 24px rgba(70, 50, 30, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: status === 'ONLINE' ? '#10B981' : '#EF4444',
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', color: '#38322B' }}>
            DUET
          </span>
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: '#E2DBD2' }} />

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '6px',
            backgroundColor: '#F3EDE4',
            color: '#6B5E51',
          }}
        >
          {agentState}
        </span>

        {/* Start / Stop Live Voice Mic Button */}
        <button
          onClick={toggleLiveVoice}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: '9999px',
            backgroundColor: isMicActive ? '#DC2626' : '#10B981',
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <span>{isMicActive ? '● Mute Voice' : '🎙 Start Live Voice'}</span>
        </button>

        {agentState === 'SPEAKING' && (
          <button
            onClick={interruptAgent}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: '9999px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              border: '1px solid #FECACA',
              cursor: 'pointer',
            }}
          >
            Interrupt
          </button>
        )}
      </header>

      {/* 3. Subtitle / Spoken Transcript Card */}
      {activeSpeech && (
        <div
          style={{
            position: 'absolute',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '560px',
            padding: '12px 20px',
            backgroundColor: 'rgba(255, 253, 250, 0.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #EAE4DD',
            borderRadius: '16px',
            color: '#2E2721',
            fontSize: '13px',
            lineHeight: '1.5',
            textAlign: 'center',
            zIndex: 400,
            boxShadow: '0 10px 28px rgba(70, 50, 30, 0.08)',
          }}
        >
          {activeSpeech}
        </div>
      )}

      {/* 4. Bottom Floating Input Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '540px',
          padding: '0 16px',
          zIndex: 500,
          boxSizing: 'border-box',
        }}
      >
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(255, 253, 250, 0.95)',
            backdropFilter: 'blur(14px)',
            border: '1px solid #EAE4DD',
            borderRadius: '20px',
            padding: '6px 10px',
            boxShadow: '0 12px 32px rgba(70, 50, 30, 0.09)',
          }}
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask Duet to derive, explain, or diagram..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              padding: '10px 14px',
              fontSize: '14px',
              color: '#26211C',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '9px 18px',
              borderRadius: '14px',
              backgroundColor: '#D97706',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.03em',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)',
            }}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}