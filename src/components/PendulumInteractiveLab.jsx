import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function PendulumInteractiveLab({ action, onActionComplete }) {
  const whiteboardRef = useRef(null);
  const simCanvasRef = useRef(null);

  // Drawing elements state
  const [boardItems, setBoardItems] = useState([]);
  const [penCursor, setPenCursor] = useState({ x: 0, y: 0, visible: false, writing: false });

  // Interactive Container State
  const [showSim, setShowSim] = useState(false);
  const [simLength, setSimLength] = useState(1.2); // meters
  const [simGravity, setSimGravity] = useState(9.8); // m/s^2
  const [isSimPaused, setIsSimPaused] = useState(false);

  // -------------------------------------------------------------
  // 1. Subtle Pen-Point Drawing & Writing Engine
  // -------------------------------------------------------------
  const glidePen = useCallback((fromX, fromY, toX, toY, duration, onComplete) => {
    setPenCursor({ x: fromX, y: fromY, visible: true, writing: true });
    const startTime = performance.now();

    const frame = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);

      const curX = fromX + (toX - fromX) * ease;
      const curY = fromY + (toY - fromY) * ease;
      setPenCursor({ x: curX, y: curY, visible: true, writing: true });

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        if (onComplete) onComplete();
        setTimeout(() => setPenCursor((c) => ({ ...c, writing: false })), 200);
      }
    };
    requestAnimationFrame(frame);
  }, []);

  // Handle incoming commands from Duet
  useEffect(() => {
    if (!action || !action.type) return;

    if (action.type === 'draw_pendulum_diagram') {
      const cx = 420;
      const cy = 180;
      const len = 170;
      const angle = 0.42; // ~24 degrees
      const bobX = cx + Math.sin(angle) * len;
      const bobY = cy + Math.cos(angle) * len;

      glidePen(cx - 70, cy, cx + 70, cy, 350, () => {
        // Ceiling anchor
        setBoardItems((prev) => [
          ...prev,
          { type: 'ceiling', x: cx, y: cy },
          { type: 'equilibrium', cx, cy, len: len + 30 },
        ]);

        // String line
        glidePen(cx, cy, bobX, bobY, 400, () => {
          setBoardItems((prev) => [
            ...prev,
            { type: 'string', sx: cx, sy: cy, ex: bobX, ey: bobY, lenLabel: 'L' },
          ]);

          // Bob mass
          glidePen(bobX, bobY, bobX + 22, bobY + 22, 250, () => {
            setBoardItems((prev) => [
              ...prev,
              { type: 'bob', x: bobX, y: bobY, r: 16, label: 'm' },
              { type: 'arc', cx, cy, radius: 45, startAngle: Math.PI / 2, endAngle: Math.PI / 2 + angle, label: 'θ' },
            ]);
            setTimeout(() => setPenCursor((c) => ({ ...c, visible: false })), 600);
          });
        });
      });
    } else if (action.type === 'write_formula') {
      glidePen(640, 220, 640, 280, 450, () => {
        setBoardItems((prev) => [
          ...prev,
          {
            type: 'formula_card',
            x: 630,
            y: 200,
            title: 'Period of a Simple Pendulum',
            formula: 'T = 2π √(L / g)',
            insight: 'Notice: Mass (m) cancels out completely!',
          },
        ]);
        setTimeout(() => setPenCursor((c) => ({ ...c, visible: false })), 600);
      });
    } else if (action.type === 'solve_step') {
      glidePen(630, 340, 630, 420, 400, () => {
        setBoardItems((prev) => [
          ...prev,
          {
            type: 'solution_block',
            x: 630,
            y: 330,
            steps: action.steps || [
              'Given: L = 1.0 m, g = 9.8 m/s²',
              'T = 2π √(1.0 / 9.8)',
              'T ≈ 2π · 0.3194',
              'T ≈ 2.007 seconds',
            ],
          },
        ]);
        setTimeout(() => setPenCursor((c) => ({ ...c, visible: false })), 600);
      });
    } else if (action.type === 'launch_simulation') {
      setShowSim(true);
    }
  }, [action, glidePen]);

  // -------------------------------------------------------------
  // 2. Main Whiteboard Canvas Render Loop
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = whiteboardRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    boardItems.forEach((item) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'ceiling') {
        // Ceiling support beam
        ctx.strokeStyle = '#262422';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(item.x - 70, item.y);
        ctx.lineTo(item.x + 70, item.y);
        ctx.stroke();

        // Hatching marks
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#78716C';
        for (let x = item.x - 60; x <= item.x + 60; x += 12) {
          ctx.beginPath();
          ctx.moveTo(x, item.y);
          ctx.lineTo(x + 8, item.y - 10);
          ctx.stroke();
        }
      } else if (item.type === 'equilibrium') {
        // Center dashed equilibrium line
        ctx.strokeStyle = '#A8A29E';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(item.cx, item.cy);
        ctx.lineTo(item.cx, item.cy + item.len);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (item.type === 'string') {
        // Cord
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(item.sx, item.sy);
        ctx.lineTo(item.ex, item.ey);
        ctx.stroke();

        // Length 'L' label
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillStyle = '#2563EB';
        ctx.fillText('L', (item.sx + item.ex) / 2 - 16, (item.sy + item.ey) / 2);
      } else if (item.type === 'bob') {
        // Pendulum bob mass
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
        ctx.fillStyle = '#DC2626';
        ctx.fill();
        ctx.strokeStyle = '#991B1B';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '700 12px Inter, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, item.x, item.y);
      } else if (item.type === 'arc') {
        // Angle theta indicator
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(item.cx, item.cy, item.radius, item.startAngle, item.endAngle);
        ctx.stroke();

        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillStyle = '#059669';
        ctx.fillText(item.label, item.cx + 12, item.cy + item.radius + 14);
      } else if (item.type === 'formula_card') {
        ctx.font = '700 13px Inter, sans-serif';
        ctx.fillStyle = '#78716C';
        ctx.fillText(item.title, item.x, item.y);

        ctx.font = '700 24px Inter, sans-serif';
        ctx.fillStyle = '#1D4ED8';
        ctx.fillText(item.formula, item.x, item.y + 36);

        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillStyle = '#047857';
        ctx.fillText(item.insight, item.x, item.y + 64);
      } else if (item.type === 'solution_block') {
        ctx.font = '700 13px Inter, sans-serif';
        ctx.fillStyle = '#262422';
        ctx.fillText('Step-by-Step Derivation:', item.x, item.y);

        item.steps.forEach((st, i) => {
          ctx.font = i === item.steps.length - 1 ? '700 15px Inter, sans-serif' : '500 13px Inter, sans-serif';
          ctx.fillStyle = i === item.steps.length - 1 ? '#15803D' : '#44403C';
          ctx.fillText(st, item.x, item.y + 24 + i * 22);
        });
      }

      ctx.restore();
    });
  }, [boardItems]);

  // -------------------------------------------------------------
  // 3. Interactive Container: Live Harmonic Physics Simulation
  // -------------------------------------------------------------
  useEffect(() => {
    if (!showSim) return;
    const canvas = simCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const width = (canvas.width = 680);
    const height = (canvas.height = 380);
    const originX = width / 2;
    const originY = 60;

    let angle = 0.5; // Initial release angle ~28 deg
    let angularVelocity = 0.0;
    const pixelsPerMeter = 160;

    const render = () => {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, height);

      const lengthPx = simLength * pixelsPerMeter;

      if (!isSimPaused) {
        // Physical equation of motion: d²θ/dt² = -(g/L) * sin(θ)
        const angularAcceleration = (-simGravity / simLength) * Math.sin(angle);
        angularVelocity += angularAcceleration * 0.016; // dt ~16ms
        angularVelocity *= 0.999; // Air damping
        angle += angularVelocity * 0.016;
      }

      const bobX = originX + Math.sin(angle) * lengthPx;
      const bobY = originY + Math.cos(angle) * lengthPx;

      // Draw dashed reference line
      ctx.strokeStyle = '#333333';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX, originY + lengthPx + 20);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pivot
      ctx.fillStyle = '#A1A1AA';
      ctx.beginPath();
      ctx.arc(originX, originY, 5, 0, Math.PI * 2);
      ctx.fill();

      // String
      ctx.strokeStyle = '#E4E4E7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(bobX, bobY);
      ctx.stroke();

      // Bob
      ctx.beginPath();
      ctx.arc(bobX, bobY, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#60A5FA';
      ctx.fill();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Computed Period Readout
      const theoreticalPeriod = (2 * Math.PI * Math.sqrt(simLength / simGravity)).toFixed(3);
      ctx.fillStyle = '#F4F4F5';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText(`Period T = ${theoreticalPeriod} s`, 24, 30);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [showSim, simLength, simGravity, isSimPaused]);

  return (
    <>
      {/* 1. Underlying 2D Whiteboard */}
      <canvas ref={whiteboardRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />

      {/* 2. Realistic Pen-Point Cursor */}
      {penCursor.visible && (
        <div
          style={{
            position: 'absolute',
            left: penCursor.x,
            top: penCursor.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* 3px Pen Nib Point */}
          <div
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: '#1E40AF',
              boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.25)',
              transition: 'transform 0.1s ease',
              transform: penCursor.writing ? 'scale(1.3)' : 'scale(1)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#3B82F6',
              backgroundColor: '#FFFFFF',
              border: '1px solid #DBEAFE',
              padding: '1px 6px',
              borderRadius: '4px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}
          >
            Duet Pen
          </span>
        </div>
      )}

      {/* 3. Interactive Sandbox Container (Only opens on command) */}
      {showSim && (
        <div
          style={{
            position: 'absolute',
            top: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#121212',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            border: '1px solid #27272A',
            zIndex: 500,
            width: '720px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#F4F4F5' }}>
              Interactive Harmonic Oscillator Sandbox
            </span>
            <button
              onClick={() => setShowSim(false)}
              style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: '16px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <canvas ref={simCanvasRef} style={{ borderRadius: '10px', display: 'block', width: '100%' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#A1A1AA', display: 'block' }}>Length (L): {simLength}m</label>
                <input
                  type="range"
                  min="0.4"
                  max="2.5"
                  step="0.1"
                  value={simLength}
                  onChange={(e) => setSimLength(Number(e.target.value))}
                  style={{ accentColor: '#3B82F6', width: '110px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#A1A1AA', display: 'block' }}>Gravity (g): {simGravity}m/s²</label>
                <input
                  type="range"
                  min="1.6"
                  max="20.0"
                  step="0.5"
                  value={simGravity}
                  onChange={(e) => setSimGravity(Number(e.target.value))}
                  style={{ accentColor: '#10B981', width: '110px' }}
                />
              </div>
            </div>

            <button
              onClick={() => setIsSimPaused((p) => !p)}
              style={{
                padding: '6px 16px',
                backgroundColor: '#27272A',
                color: '#F4F4F5',
                border: '1px solid #3F3F46',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {isSimPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
