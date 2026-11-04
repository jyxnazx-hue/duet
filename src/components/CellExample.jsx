import React, { useState, useEffect, useRef } from 'react';

// A rough map of where the organelles are on the background image
const TARGET_COORDS = {
  membrane: { x: 100, y: 300 },
  nucleus: { x: 350, y: 200 },
  mitochondria: { x: 600, y: 400 },
  golgi: { x: 500, y: 250 }
};

export default function CellExample({ latestAction }) {
  const [cursorPos, setCursorPos] = useState({ x: 500, y: 500 });
  const [annotations, setAnnotations] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const animationRef = useRef(null);

  // Handle incoming actions from the LLM
  useEffect(() => {
    if (!latestAction || latestAction.type !== 'annotate') return;

    const target = TARGET_COORDS[latestAction.target];
    if (!target) return;

    setIsDrawing(true);

    // Animate Ghost Cursor to target
    const startPos = cursorPos;
    const startTime = performance.now();
    const duration = 1000; // 1 second to travel

    const animateCursor = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      // Ease-in-out curve
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      
      const currentX = startPos.x + (target.x - startPos.x) * ease;
      const currentY = startPos.y + (target.y - startPos.y) * ease;
      
      setCursorPos({ x: currentX, y: currentY });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animateCursor);
      } else {
        // Arrived! Drop the annotation
        setAnnotations(prev => [...prev, { 
          x: target.x, 
          y: target.y, 
          text: latestAction.label 
        }]);
        setIsDrawing(false);
      }
    };

    animationRef.current = requestAnimationFrame(animateCursor);

    return () => cancelAnimationFrame(animationRef.current);
  }, [latestAction]);

  return (
    <div style={{ position: 'relative', width: '800px', height: '600px', backgroundColor: '#FDFBF7', border: '1px solid #E8E2D7', borderRadius: '12px', overflow: 'hidden' }}>
      
      {/* 1. The Cell Background Image (You can use the reference image here) */}
      <img 
        src="/cell-diagram.png" 
        alt="Cell"
        style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.8 }}
      />

      {/* 2. The Annotations Layer */}
      {annotations.map((ann, i) => (
        <div key={i} style={{ position: 'absolute', left: ann.x, top: ann.y, transition: 'all 0.3s' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#E07A5F', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '20px', top: '-10px', background: '#fff', padding: '4px 8px', borderRadius: '4px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', fontSize: '12px', whiteSpace: 'nowrap', fontWeight: 'bold', color: '#2D2A26' }}>
            {ann.text}
          </div>
        </div>
      ))}

      {/* 3. The Ghost Cursor */}
      <div style={{
        position: 'absolute',
        left: cursorPos.x,
        top: cursorPos.y,
        width: '24px',
        height: '24px',
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
        transition: isDrawing ? 'none' : 'opacity 0.5s',
        opacity: isDrawing ? 1 : 0
      }}>
        {/* SVG Cursor */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36Z" fill="#E07A5F" stroke="#2D2A26" strokeWidth="1.5"/>
        </svg>
      </div>

    </div>
  );
}