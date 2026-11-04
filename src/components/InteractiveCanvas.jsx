import React, { useEffect, useRef, useState } from 'react';

export default function InteractiveCanvas({ simulation, onClose }) {
  const canvasRef = useRef(null);
  const [selectedOrganelle, setSelectedOrganelle] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const width = (canvas.width = 680);
    const height = (canvas.height = 420);
    const cx = width / 2;
    const cy = height / 2;

    let time = 0;

    // ATP Particles emitted by mitochondria
    const atpParticles = Array.from({ length: 18 }, () => ({
      x: cx + 110 + (Math.random() - 0.5) * 40,
      y: cy + 40 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      life: Math.random() * 80,
    }));

    const renderCell = () => {
      time += 0.03;
      ctx.clearRect(0, 0, width, height);

      // Background: Extracellular space
      ctx.fillStyle = '#1C1917';
      ctx.fillRect(0, 0, width, height);

      // 1. Plasma Membrane (Soft pulsating cell boundary)
      ctx.beginPath();
      for (let angle = 0; angle <= Math.PI * 2; angle += 0.05) {
        const r = 180 + Math.sin(angle * 4 + time) * 6 + Math.cos(angle * 2 - time * 0.5) * 4;
        const px = cx + r * Math.cos(angle);
        const py = cy + (r * 0.88) * Math.sin(angle);
        if (angle === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(217, 119, 6, 0.08)'; // Cytoplasm
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 2. Endoplasmic Reticulum folds
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx - 30, cy + 10, 80 + i * 16, 50 + i * 12, 0.2, 0.4, Math.PI * 1.4);
        ctx.stroke();
      }

      // 3. Nucleus (Center control hub)
      const nucR = 54 + Math.sin(time * 1.5) * 2;
      ctx.beginPath();
      ctx.arc(cx - 30, cy + 10, nucR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
      ctx.fill();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Nucleolus
      ctx.beginPath();
      ctx.arc(cx - 32, cy + 8, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#0284C7';
      ctx.fill();

      // 4. Mitochondrion (Powerhouse of the Cell)
      const mitoX = cx + 110;
      const mitoY = cy + 40;
      ctx.save();
      ctx.translate(mitoX, mitoY);
      ctx.rotate(-0.4);

      // Outer membrane
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Cristae inner folds
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1.5;
      for (let x = -20; x <= 20; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x, 10);
        ctx.stroke();
      }
      ctx.restore();

      // 5. ATP Synthesis Particles
      atpParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life > 100) {
          p.x = mitoX + (Math.random() - 0.5) * 20;
          p.y = mitoY + (Math.random() - 0.5) * 20;
          p.life = 0;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FBBF24';
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 6. Golgi Apparatus
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + 80, cy - 70 + i * 9, 28, 0.3, Math.PI * 0.9);
        ctx.stroke();
      }

      // Labels
      ctx.fillStyle = '#F5F5F4';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText('Nucleus & DNA', cx - 70, cy + 14);
      ctx.fillText('Mitochondrion (ATP Active)', mitoX - 60, mitoY + 40);
      ctx.fillText('Golgi Complex', cx + 55, cy - 85);

      animationFrameId = requestAnimationFrame(renderCell);
    };

    renderCell();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#1C1917',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        border: '1px solid #292524',
        zIndex: 600,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#F5F5F4' }}>
          {simulation?.title || 'Interactive Living Eukaryotic Cell'}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#A8A29E',
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ borderRadius: '12px', display: 'block' }}
      />
    </div>
  );
}