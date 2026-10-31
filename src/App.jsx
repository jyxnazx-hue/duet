import React, { useState } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { useDuetAgent } from './useDuetAgent'

export default function App() {
  const [editor, setEditor] = useState(null)
  const [inputText, setInputText] = useState('')

  const {
    isConnected,
    isThinking,
    agentSpeech,
    sendPrompt,
    triggerInterrupt,
  } = useDuetAgent(editor)

  const handleSend = (e) => {
    e.preventDefault()
    if (!inputText.trim()) return
    sendPrompt(inputText)
    setInputText('')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {/* 1. Infinite Spatial Canvas */}
      <Tldraw onMount={(editorInstance) => setEditor(editorInstance)} />

      {/* 2. Duet Agent Floating Status & Spoken Output */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        {/* Connection & Thinking Pill */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 18px',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(10px)',
            borderRadius: 9999,
            border: '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10B981' : '#EF4444',
            }}
          />
          <span>{isConnected ? 'Duet Live' : 'Connecting to Agent...'}</span>

          {isThinking && (
            <span style={{ color: '#6366F1', fontWeight: 600 }}>
              • Deriving...
            </span>
          )}

          <button
            onClick={triggerInterrupt}
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              background: '#F9FAFB',
              cursor: 'pointer',
            }}
          >
            Interrupt
          </button>
        </div>

        {/* Live Spoken Speech Subtitle */}
        {agentSpeech && (
          <div
            style={{
              maxWidth: 540,
              padding: '10px 18px',
              background: 'rgba(17, 24, 39, 0.88)',
              color: '#FFFFFF',
              borderRadius: 14,
              fontSize: 14,
              lineHeight: 1.45,
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            "{agentSpeech}"
          </div>
        )}
      </div>

      {/* 3. Test Prompt Bar (for rapid live testing before mic streaming) */}
      <form
        onSubmit={handleSend}
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '6px 10px',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a question or test an equation..."
          style={{
            width: 380,
            border: 'none',
            outline: 'none',
            fontSize: 14,
            padding: '6px 8px',
          }}
        />
        <button
          type="submit"
          style={{
            background: '#111827',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}