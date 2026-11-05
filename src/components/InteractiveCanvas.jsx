import React, { useEffect, useRef, useState } from 'react';

export default function InteractiveCanvas({ simulation, onClose }) {
  const canvasRef = useRef(null);
  const [centralMass, setCentralMass] = useState(1200);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const width = (canvas.width = 720);
    const height = (canvas.height = 460);
    const cx = width / 2;
    const cy = height / 2;

    const bodies = [
      { x: cx, y: cy - 130, vx: 3.1, vy: 0, r: 9, color: '#38BDF8', trail: [] },
      { x: cx, y: cy + 185, vx: -2.6, vy: 0, r: 12, color: '#FBBF24', trail: [] },
      { x: cx + 90, y: cy, vx: 0, vy: 3.7, r: 6, color: '#F43F5E', trail: [] },
    ];

    const G = 0.8;

    const render = () => {
      ctx.fillStyle = '#171614';
      ctx.fillRect(0, 0, width, height);

      // Orbital reference rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      [90, 130, 185].forEach((radius) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Central Mass (Sun / Primary Body)
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#FB923C';
      ctx.shadowColor = '#FB923C';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Central Mass M', cx, cy + 36);

      // Update and draw orbital satellites
      bodies.forEach((b) => {
        if (!isPaused) {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);

          if (dist > 25) {
            const force = (G * centralMass) / distSq;
            b.vx += force * (dx / dist);
            b.vy += force * (dy / dist);
            b.x += b.vx;
            b.y += b.vy;

            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 40) b.trail.shift();
          }
        }

        // Particle trail
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i++) {
          const pt = b.trail[i];
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Body
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();

        // Velocity vector line
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + b.vx * 6, b.y + b.vy * 6);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [centralMass, isPaused]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#171614',
        borderRadius: '16px',
        padding: '18px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        border: '1px solid #292524',
        zIndex: 600,
        width: '756px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#F5F5F4' }}>
            {simulation?.title || 'Gravitational Orbital Sandbox'}
          </span>
          <span style={{ fontSize: '11px', color: '#A8A29E', background: '#262422', padding: '3px 8px', borderRadius: '4px' }}>
            F = G(m₁m₂)/r²
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#A8A29E', fontSize: '16px', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <canvas ref={canvasRef} style={{ borderRadius: '12px', display: 'block', width: '100%' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: '#D6D3D1', fontWeight: 500 }}>
            Central Mass (M): {centralMass}
          </label>
          <input
            type="range"
            min="400"
            max="3000"
            step="50"
            value={centralMass}
            onChange={(e) => setCentralMass(Number(e.target.value))}
            style={{ width: '140px', accentColor: '#FB923C' }}
          />
        </div>

        <button
          onClick={() => setIsPaused((p) => !p)}
          style={{
            padding: '5px 14px',
            backgroundColor: '#262422',
            color: '#F5F5F4',
            border: '1px solid #44403C',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}
