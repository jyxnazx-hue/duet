import { useState, useEffect, useRef, useCallback } from 'react'
import { createShapeId, toRichText } from 'tldraw'

export function useDuetAgent(editor) {
  const [isConnected, setIsConnected] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [agentSpeech, setAgentSpeech] = useState('')
  const [isListening, setIsListening] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/live')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Duet Agent WebSocket connected')
      setIsConnected(true)
    }

    ws.onclose = () => {
      console.log('Duet Agent WebSocket disconnected')
      setIsConnected(false)
    }

    ws.onerror = (err) => {
      console.error('Duet Agent WS error:', err)
    }

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'state') {
          setIsThinking(data.thinking)
        } else if (data.type === 'speech_out') {
          setAgentSpeech(data.text)
        } else if (data.type === 'canvas_stream') {
          if (editor && data.actions) {
            executeCanvasActions(editor, data.actions)
          }
        } else if (data.type === 'interrupt') {
          setAgentSpeech('')
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [editor])

  const executeCanvasActions = useCallback(async (tlEditor, actions) => {
    for (const act of actions) {
      try {
        const shapeId = createShapeId()

        if (act.type === 'write_text') {
          // Supports both modern richText and legacy text property schema
          tlEditor.createShape({
            id: shapeId,
            type: 'text',
            x: act.x,
            y: act.y,
            props: {
              richText: toRichText(act.text || ''),
              size: act.size || 'm',
              color: act.color || 'black',
            },
          })
        } else if (act.type === 'draw_arrow') {
          tlEditor.createShape({
            id: shapeId,
            type: 'arrow',
            x: act.fromX,
            y: act.fromY,
            props: {
              start: { x: 0, y: 0 },
              end: { x: act.toX - act.fromX, y: act.toY - act.fromY },
              color: act.color || 'orange',
            },
          })
        } else if (act.type === 'mount_image') {
          tlEditor.createShape({
            id: shapeId,
            type: 'geo',
            x: act.x,
            y: act.y,
            props: {
              w: act.w || 320,
              h: act.h || 220,
              geo: 'rectangle',
              color: 'light-violet',
              richText: toRichText(`[Visual Schematic: ${act.url}]`),
            },
          })
        }

        // Slight human-like pause between chalk strokes
        await new Promise((res) => setTimeout(res, 220))
      } catch (shapeError) {
        console.warn('Skipped incompatible shape render:', shapeError)
      }
    }
  }, [])

  const sendPrompt = useCallback((text) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user_transcript',
          text: text,
        })
      )
    }
  }, [])

  const triggerInterrupt = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'barge_in' }))
    }
  }, [])

  return {
    isConnected,
    isThinking,
    agentSpeech,
    isListening,
    setIsListening,
    sendPrompt,
    triggerInterrupt,
  }
}