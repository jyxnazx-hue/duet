import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDuetLive } from './hooks/useDuetLive';
import InteractiveCanvas from './components/InteractiveCanvas';

const Icons = {
  select: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7 17 2.5-6.5L20 12z" />
    </svg>
  ),
  hand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10.5V6a2 2 0 0 0-4 0v8a7 7 0 0 0 14 0v-4a2 2 0 0 0-4 0" />
    </svg>
  ),
  pen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  eraser: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20H7L3 16a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l6.6 6.6a1 1 0 0 1 0 1.4L13 20" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  text: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  ),
  note: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  frame: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  ),
  shapes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  undo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),
  redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  ),
  chevronUp: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
};

const COLOR_PALETTE = [
  { id: 'dark', hex: '#262422' },
  { id: 'amber', hex: '#92400E' },
  { id: 'blue', hex: '#1E40AF' },
  { id: 'green', hex: '#065F46' },
  { id: 'pink', hex: '#9D174D' },
];

export default function App() {
  const [activeTool, setActiveTool] = useState('select');
  const [selectedShape, setSelectedShape] = useState('rect');
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLOR_PALETTE[0]);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);

  const [subject, setSubject] = useState('Exploration & Synthesis');
  const [pageNumber, setPageNumber] = useState('Page 1');

  const [zoomLevel, setZoomLevel] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeSidePanel, setActiveSidePanel] = useState(null);
  const [sessionResources, setSessionResources] = useState([]);

  // Complete Vector Objects State Tree (Selectable & Movable)
  const [canvasObjects, setCanvasObjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Undo/Redo stacks
  const historyRef = useRef([]);
  const redoRef = useRef([]);

  const canvasRef = useRef(null);
  const isPointerDownRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Dragging Objects
  const dragRef = useRef({
    isDragging: false,
    id: null,
    startPointer: { x: 0, y: 0 },
    initialObj: null,
  });

  // Current In-progress Drawing object
  const currentDrawRef = useRef(null);

  // 1. Define the action handler so Duet can draw on the canvas
  const handleAgentCanvasAction = useCallback((action, payload) => {
    if (action === 'draw_cell_part') {
      const now = Date.now();
      const newItems = [];

      // Draw the organelle shape
      if (payload.part === 'membrane') {
        newItems.push({
          id: now,
          type: 'shape',
          shape: 'circle',
          sx: payload.cx || 450,
          sy: payload.cy || 320,
          w: payload.r || 160,
          h: payload.r || 160,
          color: '#262422',
          width: 2.5,
        });
      } else if (payload.part === 'nucleus') {
        newItems.push({
          id: now,
          type: 'shape',
          shape: 'circle',
          sx: payload.cx || 430,
          sy: payload.cy || 300,
          w: payload.r || 50,
          h: payload.r || 50,
          color: '#1D4ED8',
          width: 2.5,
        });
      } else if (payload.part === 'mitochondria') {
        newItems.push({
          id: now,
          type: 'shape',
          shape: 'rect',
          sx: (payload.cx || 530) - (payload.w || 65) / 2,
          sy: (payload.cy || 340) - (payload.h || 35) / 2,
          w: payload.w || 65,
          h: payload.h || 35,
          color: '#B45309',
          width: 2.5,
        });
      }

      // Add the descriptive butter-cream sticky note right beside it
      newItems.push({
        id: now + 1,
        type: 'dom_note',
        x: (payload.cx || 450) + (payload.r || 60) + 30,
        y: (payload.cy || 320) - 60,
        w: 190,
        h: 120,
        color: '#FFFBEA',
        textColor: '#78350F',
        text: `${payload.title || 'Cell Organelle'}\n\n${payload.desc || ''}`,
      });

      setCanvasObjects((prev) => [...prev, ...newItems]);
    }
  }, []);

  // 2. Pass handleAgentCanvasAction as the second argument to useDuetLive
  const {
    agentState,
    activeSpeech,
    conversation,
    activeSimulation,
    setActiveSimulation,
    isMicActive,
    interruptAgent,
    toggleLiveVoice,
  } = useDuetLive('ws://127.0.0.1:8000/ws/session', handleAgentCanvasAction);

  useEffect(() => {
    if (activeSimulation?.title) {
      setSessionResources((prev) => {
        if (prev.some((r) => r.title === activeSimulation.title)) return prev;
        return [...prev, { title: activeSimulation.title, type: 'Simulation', timestamp: new Date().toLocaleTimeString() }];
      });
    }
  }, [activeSimulation]);

  const saveHistory = useCallback(() => {
    historyRef.current.push(JSON.parse(JSON.stringify(canvasObjects)));
    redoRef.current = [];
  }, [canvasObjects]);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    redoRef.current.push(JSON.parse(JSON.stringify(canvasObjects)));
    const prev = historyRef.current.pop();
    setCanvasObjects(prev);
    setSelectedId(null);
  }, [canvasObjects]);

  const handleRedo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    historyRef.current.push(JSON.parse(JSON.stringify(canvasObjects)));
    const next = redoRef.current.pop();
    setCanvasObjects(next);
    setSelectedId(null);
  }, [canvasObjects]);

  const handleClear = useCallback(() => {
    saveHistory();
    setCanvasObjects([]);
    setSelectedId(null);
  }, [saveHistory]);

  // Delete key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          saveHistory();
          setCanvasObjects((prev) => prev.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, saveHistory]);


  // -------------------------------------------------------------
  // Full Vector Re-render Loop
  // -------------------------------------------------------------
  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply viewport Pan and Zoom
    ctx.translate(pan.x, pan.y);
    const scale = zoomLevel / 100;
    ctx.scale(scale, scale);

    // Draw all completed vector objects
    canvasObjects.forEach((obj) => {
      const isSelected = obj.id === selectedId;

      ctx.save();
      ctx.strokeStyle = obj.color || '#262422';
      ctx.fillStyle = obj.color || '#262422';
      ctx.lineWidth = obj.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (obj.type === 'pen' && obj.points?.length > 1) {
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        for (let i = 1; i < obj.points.length; i++) {
          ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }
        ctx.stroke();

        // Selection Bounding Box for Freehand Stroke
        if (isSelected && obj.bounds) {
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(obj.bounds.minX - 4, obj.bounds.minY - 4, obj.bounds.maxX - obj.bounds.minX + 8, obj.bounds.maxY - obj.bounds.minY + 8);
        }
      } else if (obj.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(obj.sx, obj.sy);
        ctx.lineTo(obj.ex, obj.ey);
        ctx.stroke();

        const angle = Math.atan2(obj.ey - obj.sy, obj.ex - obj.sx);
        ctx.beginPath();
        ctx.moveTo(obj.ex, obj.ey);
        ctx.lineTo(obj.ex - 12 * Math.cos(angle - Math.PI / 6), obj.ey - 12 * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(obj.ex, obj.ey);
        ctx.lineTo(obj.ex - 12 * Math.cos(angle + Math.PI / 6), obj.ey - 12 * Math.sin(angle + Math.PI / 6));
        ctx.stroke();

        if (isSelected) {
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          const minX = Math.min(obj.sx, obj.ex);
          const minY = Math.min(obj.sy, obj.ey);
          ctx.strokeRect(minX - 4, minY - 4, Math.abs(obj.ex - obj.sx) + 8, Math.abs(obj.ey - obj.sy) + 8);
        }
      } else if (obj.type === 'shape') {
        const { sx, sy, w, h, shape } = obj;
        ctx.beginPath();
        if (shape === 'rect') {
          ctx.strokeRect(sx, sy, w, h);
        } else if (shape === 'circle') {
          const r = Math.sqrt(w * w + h * h);
          ctx.arc(sx, sy, r, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (shape === 'triangle') {
          ctx.moveTo(sx + w / 2, sy);
          ctx.lineTo(sx, sy + h);
          ctx.lineTo(sx + w, sy + h);
          ctx.closePath();
          ctx.stroke();
        } else if (shape === 'diamond') {
          ctx.moveTo(sx + w / 2, sy);
          ctx.lineTo(sx + w, sy + h / 2);
          ctx.lineTo(sx + w / 2, sy + h);
          ctx.lineTo(sx, sy + h / 2);
          ctx.closePath();
          ctx.stroke();
        } else if (shape === 'star') {
          const cx = sx + w / 2;
          const cy = sy + h / 2;
          const outer = Math.abs(w / 2);
          const inner = outer / 2.2;
          for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5 - Math.PI / 2;
            const r = i % 2 === 0 ? outer : inner;
            const px = cx + r * Math.cos(a);
            const py = cy + r * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }

        if (isSelected) {
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(sx - 4, sy - 4, w + 8, h + 8);
        }
      }
      ctx.restore();
    });

    // In-progress live stroke/shape rendering
    if (currentDrawRef.current) {
      const cur = currentDrawRef.current;
      ctx.save();
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = cur.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (cur.type === 'pen') {
        ctx.beginPath();
        ctx.moveTo(cur.points[0].x, cur.points[0].y);
        for (let i = 1; i < cur.points.length; i++) {
          ctx.lineTo(cur.points[i].x, cur.points[i].y);
        }
        ctx.stroke();
      } else if (cur.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(cur.sx, cur.sy);
        ctx.lineTo(cur.ex, cur.ey);
        ctx.stroke();
      } else if (cur.type === 'shape') {
        ctx.strokeRect(cur.sx, cur.sy, cur.w, cur.h);
      }
      ctx.restore();
    }

    ctx.restore();
  }, [canvasObjects, pan, zoomLevel, selectedId]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // Window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderAll();

    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderAll();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderAll]);

  // -------------------------------------------------------------
  // Hit Testing Function (Finds clicked stroke or shape)
  // -------------------------------------------------------------
  const findObjectAtPosition = (px, py) => {
    for (let i = canvasObjects.length - 1; i >= 0; i--) {
      const obj = canvasObjects[i];

      if (obj.type === 'pen' && obj.bounds) {
        if (
          px >= obj.bounds.minX - 8 &&
          px <= obj.bounds.maxX + 8 &&
          py >= obj.bounds.minY - 8 &&
          py <= obj.bounds.maxY + 8
        ) {
          return obj;
        }
      } else if (obj.type === 'arrow') {
        const minX = Math.min(obj.sx, obj.ex) - 8;
        const maxX = Math.max(obj.sx, obj.ex) + 8;
        const minY = Math.min(obj.sy, obj.ey) - 8;
        const maxY = Math.max(obj.sy, obj.ey) + 8;
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
          return obj;
        }
      } else if (obj.type === 'shape') {
        const minX = Math.min(obj.sx, obj.sx + obj.w);
        const maxX = Math.max(obj.sx, obj.sx + obj.w);
        const minY = Math.min(obj.sy, obj.sy + obj.h);
        const maxY = Math.max(obj.sy, obj.sy + obj.h);
        if (px >= minX - 6 && px <= maxX + 6 && py >= minY - 6 && py <= maxY + 6) {
          return obj;
        }
      }
    }
    return null;
  };

  // -------------------------------------------------------------
  // Pointer Event Logic (Drawing, Panning, Selection & Moving)
  // -------------------------------------------------------------
  const handlePointerDown = (e) => {
    const scale = zoomLevel / 100;
    const canvasX = (e.clientX - pan.x) / scale;
    const canvasY = (e.clientY - pan.y) / scale;

    if (activeTool === 'hand' || e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // SELECT & MOVE MODE
    if (activeTool === 'select') {
      const hit = findObjectAtPosition(canvasX, canvasY);
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = {
          isDragging: true,
          id: hit.id,
          startPointer: { x: canvasX, y: canvasY },
          initialObj: JSON.parse(JSON.stringify(hit)),
        };
      } else {
        setSelectedId(null);
      }
      return;
    }

    // SPAWN STICKY NOTE (Exact Soft Butter-Cream)
    if (activeTool === 'note') {
      saveHistory();
      const newNote = {
        id: Date.now(),
        type: 'dom_note',
        x: canvasX - 100,
        y: canvasY - 80,
        w: 200,
        h: 170,
        color: '#FFFBEA', // Soft butter cream
        textColor: '#78350F',
        text: '',
      };
      setCanvasObjects((prev) => [...prev, newNote]);
      setSelectedId(newNote.id);
      setActiveTool('select');
      return;
    }

    // SPAWN TEXT
    if (activeTool === 'text') {
      saveHistory();
      const newText = {
        id: Date.now(),
        type: 'dom_text',
        x: canvasX,
        y: canvasY - 14,
        w: 240,
        h: 40,
        textColor: currentColor.hex,
        text: '',
      };
      setCanvasObjects((prev) => [...prev, newText]);
      setSelectedId(newText.id);
      setActiveTool('select');
      return;
    }

    // SPAWN FRAME
    if (activeTool === 'frame') {
      saveHistory();
      const newFrame = {
        id: Date.now(),
        type: 'dom_frame',
        x: canvasX - 180,
        y: canvasY - 120,
        w: 360,
        h: 240,
        title: 'Frame Section',
      };
      setCanvasObjects((prev) => [...prev, newFrame]);
      setSelectedId(newFrame.id);
      setActiveTool('select');
      return;
    }

    // DRAWING PEN / SHAPE / ARROW
    isPointerDownRef.current = true;
    if (activeTool === 'pen') {
      currentDrawRef.current = {
        type: 'pen',
        points: [{ x: canvasX, y: canvasY }],
        color: currentColor.hex,
        width: 2.2,
      };
    } else if (activeTool === 'arrow') {
      currentDrawRef.current = {
        type: 'arrow',
        sx: canvasX,
        sy: canvasY,
        ex: canvasX,
        ey: canvasY,
        color: currentColor.hex,
      };
    } else if (activeTool === 'shape') {
      currentDrawRef.current = {
        type: 'shape',
        shape: selectedShape,
        sx: canvasX,
        sy: canvasY,
        w: 0,
        h: 0,
        color: currentColor.hex,
      };
    }
    renderAll();
  };

  const handlePointerMove = (e) => {
    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const scale = zoomLevel / 100;
    const canvasX = (e.clientX - pan.x) / scale;
    const canvasY = (e.clientY - pan.y) / scale;

    // DRAG AND MOVE SELECTED VECTOR OBJECT
    if (dragRef.current.isDragging && dragRef.current.id) {
      const dx = canvasX - dragRef.current.startPointer.x;
      const dy = canvasY - dragRef.current.startPointer.y;
      const init = dragRef.current.initialObj;

      setCanvasObjects((prev) =>
        prev.map((o) => {
          if (o.id !== dragRef.current.id) return o;
          if (o.type === 'pen') {
            const updatedPoints = init.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            return {
              ...o,
              points: updatedPoints,
              bounds: {
                minX: init.bounds.minX + dx,
                maxX: init.bounds.maxX + dx,
                minY: init.bounds.minY + dy,
                maxY: init.bounds.maxY + dy,
              },
            };
          } else if (o.type === 'arrow') {
            return { ...o, sx: init.sx + dx, sy: init.sy + dy, ex: init.ex + dx, ey: init.ey + dy };
          } else if (o.type === 'shape') {
            return { ...o, sx: init.sx + dx, sy: init.sy + dy };
          }
          return o;
        })
      );
      renderAll();
      return;
    }

    // DRAWING MOTION
    if (!isPointerDownRef.current || !currentDrawRef.current) return;
    const cur = currentDrawRef.current;

    if (cur.type === 'pen') {
      cur.points.push({ x: canvasX, y: canvasY });
    } else if (cur.type === 'arrow') {
      cur.ex = canvasX;
      cur.ey = canvasY;
    } else if (cur.type === 'shape') {
      cur.w = canvasX - cur.sx;
      cur.h = canvasY - cur.sy;
    }
    renderAll();
  };

  const handlePointerUp = () => {
    isPanningRef.current = false;

    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      dragRef.current.id = null;
      saveHistory();
      return;
    }

    if (!isPointerDownRef.current || !currentDrawRef.current) return;
    isPointerDownRef.current = false;
    const cur = currentDrawRef.current;

    saveHistory();

    if (cur.type === 'pen' && cur.points.length > 1) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      cur.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      setCanvasObjects((prev) => [...prev, { ...cur, id: Date.now(), bounds: { minX, maxX, minY, maxY } }]);
    } else if (cur.type === 'arrow' || cur.type === 'shape') {
      setCanvasObjects((prev) => [...prev, { ...cur, id: Date.now() }]);
    }

    currentDrawRef.current = null;
    renderAll();
  };

  // Dragging DOM elements (Notes / Text / Frames)
  const handleDomElementMouseDown = (e, el) => {
    e.stopPropagation();
    setSelectedId(el.id);

    if (activeTool === 'select' || activeTool === 'hand') {
      const scale = zoomLevel / 100;
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const initialElX = el.x;
      const initialElY = el.y;

      const onMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startMouseX) / scale;
        const dy = (moveEvent.clientY - startMouseY) / scale;
        setCanvasObjects((prev) =>
          prev.map((item) => (item.id === el.id ? { ...item, x: initialElX + dx, y: initialElY + dy } : item))
        );
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveHistory();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  const updateElementText = (id, newText) => {
    setCanvasObjects((prev) => prev.map((el) => (el.id === id ? { ...el, text: newText } : el)));
  };

  const updateFrameTitle = (id, newTitle) => {
    setCanvasObjects((prev) => prev.map((el) => (el.id === id ? { ...el, title: newTitle } : el)));
  };

  const scale = zoomLevel / 100;

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#F5F5F5',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 1. Vector Drawing Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          cursor:
            activeTool === 'select'
              ? 'default'
              : activeTool === 'hand'
              ? 'grab'
              : activeTool === 'eraser'
              ? 'cell'
              : 'crosshair',
          zIndex: 10,
        }}
      />

      {/* 2. Scalable Workspace for Sticky Notes, Text & Frames */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
          zIndex: 25,
        }}
      >
        {canvasObjects.map((el) => {
          if (!el.type.startsWith('dom_')) return null;
          const isSelected = selectedId === el.id;

          // Sticky Note: Soft Butter Cream Yellow, borderless
          if (el.type === 'dom_note') {
            return (
              <div
                key={el.id}
                onMouseDown={(e) => handleDomElementMouseDown(e, el)}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  backgroundColor: el.color || '#FFFBEA',
                  borderRadius: '12px',
                  boxShadow: isSelected
                    ? '0 0 0 2px #262422, 0 10px 28px rgba(0,0,0,0.08)'
                    : '0 4px 18px rgba(0,0,0,0.05)',
                  padding: '16px',
                  boxSizing: 'border-box',
                  pointerEvents: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: activeTool === 'select' ? 'move' : 'default',
                  transition: 'box-shadow 0.1s ease',
                }}
              >
                <textarea
                  value={el.text}
                  placeholder="Type a note..."
                  onChange={(e) => updateElementText(el.id, e.target.value)}
                  onFocus={() => setSelectedId(el.id)}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    resize: 'none',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    fontFamily: 'inherit',
                    color: el.textColor || '#78350F',
                    cursor: 'text',
                    userSelect: 'text',
                  }}
                />
              </div>
            );
          }

          // Editable Text Container
          if (el.type === 'dom_text') {
            return (
              <div
                key={el.id}
                onMouseDown={(e) => handleDomElementMouseDown(e, el)}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  pointerEvents: 'auto',
                  cursor: activeTool === 'select' ? 'move' : 'default',
                  boxShadow: isSelected ? '0 0 0 1.5px #262422' : 'none',
                  borderRadius: '4px',
                  padding: '4px 6px',
                }}
              >
                <input
                  type="text"
                  value={el.text}
                  placeholder="Type text..."
                  onChange={(e) => updateElementText(el.id, e.target.value)}
                  onFocus={() => setSelectedId(el.id)}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '15px',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    color: el.textColor || '#262422',
                    cursor: 'text',
                    userSelect: 'text',
                  }}
                />
              </div>
            );
          }

          // Frame Section
          if (el.type === 'dom_frame') {
            return (
              <div
                key={el.id}
                onMouseDown={(e) => handleDomElementMouseDown(e, el)}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  border: isSelected ? '1.5px solid #262422' : '1.5px dashed #A8A29E',
                  borderRadius: '12px',
                  pointerEvents: 'auto',
                  backgroundColor: 'rgba(255,255,255,0.4)',
                  cursor: activeTool === 'select' ? 'move' : 'default',
                }}
              >
                <input
                  type="text"
                  value={el.title}
                  onChange={(e) => updateFrameTitle(el.id, e.target.value)}
                  onFocus={() => setSelectedId(el.id)}
                  style={{
                    position: 'absolute',
                    top: '-24px',
                    left: '8px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: isSelected ? '#262422' : '#78716C',
                    outline: 'none',
                    cursor: 'text',
                    userSelect: 'text',
                  }}
                />
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* 3. Top Header Bar */}
      {/* Top Left: ❦ Duet */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 500,
        }}
      >
        <span style={{ fontSize: '18px', color: '#262422' }}>❦</span>
        <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.03em', color: '#262422' }}>
          Duet
        </span>
      </div>

      {/* Top Center: Minimal reactive text status */}
      <div
        style={{
          position: 'absolute',
          top: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 500,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#262422', letterSpacing: '0.02em' }}>
          {agentState === 'THINKING' ? 'thinking...' : agentState === 'SPEAKING' ? 'speaking ~~~~' : 'waiting...'}
        </span>

        {agentState === 'SPEAKING' && (
          <button
            onClick={interruptAgent}
            style={{
              background: 'none',
              border: 'none',
              color: '#706C66',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            stop
          </button>
        )}
      </div>

      {/* Top Right: Editable Subject & Page + Live Voice */}
      <div
        style={{
          position: 'absolute',
          top: '18px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 500,
        }}
      >
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #D1D1D1',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#262422',
            outline: 'none',
            maxWidth: '180px',
          }}
          title="Edit Subject"
        />

        <input
          type="text"
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value)}
          style={{
            padding: '6px 10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #D1D1D1',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#262422',
            outline: 'none',
            width: '64px',
            textAlign: 'center',
          }}
          title="Edit Page"
        />

        <button
          onClick={toggleLiveVoice}
          style={{
            padding: '6px 14px',
            backgroundColor: isMicActive ? '#262422' : '#FFFFFF',
            color: isMicActive ? '#F5F5F5' : '#262422',
            border: '1px solid #D1D1D1',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isMicActive ? '● Listening' : 'Live Voice'}
        </button>
      </div>

      {/* 4. Dialogue Box */}
      <div
        style={{
          position: 'absolute',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '540px',
          padding: '10px 18px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D1D1D1',
          borderRadius: '8px',
          color: '#262422',
          fontSize: '13px',
          lineHeight: '1.5',
          textAlign: 'center',
          zIndex: 400,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        {activeSpeech || "Hey! I'm Duet, your live companion. What are we sketching or exploring today?"}
      </div>

      {activeSimulation && (
        <InteractiveCanvas
          simulation={activeSimulation}
          onClose={() => setActiveSimulation(null)}
        />
      )}

      {/* 5. Bottom Controls */}
      {/* Bottom Left: Zoom */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D1D1D1',
          borderRadius: '8px',
          zIndex: 500,
        }}
      >
        <button
          onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#262422', fontWeight: 600 }}
        >
          –
        </button>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#262422' }}>{zoomLevel}%</span>
        <button
          onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#262422', fontWeight: 600 }}
        >
          +
        </button>
      </div>

      {/* Bottom Center: Unified Toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 8px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D1D1D1',
          borderRadius: '8px',
          zIndex: 500,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        }}
      >
        {[
          { id: 'select', label: 'Select & Move (V)', icon: Icons.select },
          { id: 'hand', label: 'Hand Pan (H)', icon: Icons.hand },
          { id: 'pen', label: 'Draw Pen (D)', icon: Icons.pen },
          { id: 'arrow', label: 'Arrow (A)', icon: Icons.arrow },
          { id: 'text', label: 'Text Box (T)', icon: Icons.text },
          { id: 'note', label: 'Sticky Note (N)', icon: Icons.note },
          { id: 'frame', label: 'Frame (F)', icon: Icons.frame },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTool(t.id);
              setIsShapeMenuOpen(false);
              setIsColorMenuOpen(false);
            }}
            title={t.label}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: activeTool === t.id ? '#EAEAEA' : 'transparent',
              color: '#262422',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background 0.1s ease',
            }}
          >
            {t.icon}
          </button>
        ))}

        {/* Geometry Shapes Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setActiveTool('shape');
              setIsShapeMenuOpen((o) => !o);
              setIsColorMenuOpen(false);
            }}
            title="Geometric Shapes"
            style={{
              height: '32px',
              padding: '0 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: activeTool === 'shape' ? '#EAEAEA' : 'transparent',
              color: '#262422',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {Icons.shapes}
            {Icons.chevronUp}
          </button>

          {isShapeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D1D1D1',
                borderRadius: '8px',
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 28px)',
                gap: '8px',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
                zIndex: 600,
              }}
            >
              {[
                { id: 'rect', label: 'Rectangle', glyph: '▭' },
                { id: 'circle', label: 'Circle', glyph: '○' },
                { id: 'triangle', label: 'Triangle', glyph: '△' },
                { id: 'diamond', label: 'Diamond', glyph: '◇' },
                { id: 'star', label: 'Star', glyph: '☆' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedShape(s.id);
                    setActiveTool('shape');
                    setIsShapeMenuOpen(false);
                  }}
                  title={s.label}
                  style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #EAEAEA',
                    borderRadius: '4px',
                    backgroundColor: selectedShape === s.id ? '#EAEAEA' : '#FFFFFF',
                    color: '#262422',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  {s.glyph}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color Palette Popover */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsColorMenuOpen((o) => !o);
              setIsShapeMenuOpen(false);
            }}
            title="Stroke Color"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: currentColor.hex,
                border: '1px solid #D1D1D1',
              }}
            />
          </button>

          {isColorMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D1D1D1',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                gap: '8px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
                zIndex: 600,
              }}
            >
              {COLOR_PALETTE.map((col) => (
                <button
                  key={col.id}
                  onClick={() => {
                    setCurrentColor(col);
                    setIsColorMenuOpen(false);
                  }}
                  title={col.id}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: col.hex,
                    border: currentColor.id === col.id ? '2px solid #262422' : '1px solid #E5E5E5',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: '#D1D1D1', margin: '0 4px' }} />

        {/* Undo / Redo / Clear */}
        <button
          onClick={handleUndo}
          title="Undo"
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#262422', cursor: 'pointer' }}
        >
          {Icons.undo}
        </button>
        <button
          onClick={handleRedo}
          title="Redo"
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#262422', cursor: 'pointer' }}
        >
          {Icons.redo}
        </button>
        <button
          onClick={handleClear}
          title="Clear Board"
          style={{ padding: '4px 8px', background: 'none', border: 'none', color: '#706C66', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
        >
          Clear
        </button>
      </div>

      {/* Bottom Right: Resources & Transcript */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 500,
        }}
      >
        <button
          onClick={() => setActiveSidePanel((c) => (c === 'resources' ? null : 'resources'))}
          title="Session Captures & Resources"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: activeSidePanel === 'resources' ? '#262422' : '#FFFFFF',
            color: activeSidePanel === 'resources' ? '#F5F5F5' : '#262422',
            border: '1px solid #D1D1D1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
          }}
        >
          ☵
        </button>

        <button
          onClick={() => setActiveSidePanel((c) => (c === 'transcript' ? null : 'transcript'))}
          title="Live Transcript"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: activeSidePanel === 'transcript' ? '#262422' : '#FFFFFF',
            color: activeSidePanel === 'transcript' ? '#F5F5F5' : '#262422',
            border: '1px solid #D1D1D1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
          }}
        >
          💬
        </button>
      </div>

      {/* 6. Full-Height Side Drawer */}
      {activeSidePanel && (
        <aside
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: '340px',
            height: '100vh',
            backgroundColor: '#FFFFFF',
            borderLeft: '1px solid #D1D1D1',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 700,
            boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #EAEAEA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#262422' }}>
              {activeSidePanel === 'transcript' ? 'Live Transcript' : 'Session Resources'}
            </span>
            <button
              onClick={() => setActiveSidePanel(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#706C66', fontSize: '15px' }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeSidePanel === 'transcript' ? (
              conversation.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#706C66', margin: 0 }}>
                  Live speech transcripts will populate here as you talk with Duet.
                </p>
              ) : (
                conversation.map((entry, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      alignSelf: entry.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#706C66' }}>
                      {entry.sender === 'user' ? 'You' : 'Duet'}
                    </span>
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: entry.sender === 'user' ? '#EAEAEA' : '#F9F9F9',
                        border: '1px solid #D1D1D1',
                        borderRadius: '6px',
                        fontSize: '12px',
                        lineHeight: '1.45',
                        color: '#262422',
                      }}
                    >
                      {entry.text}
                    </div>
                  </div>
                ))
              )
            ) : sessionResources.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#706C66', margin: 0 }}>
                No active resources captured yet. Visuals and simulations triggered during the session will index here automatically.
              </p>
            ) : (
              sessionResources.map((res, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#F9F9F9',
                    border: '1px solid #D1D1D1',
                    borderRadius: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#262422' }}>{res.title}</span>
                    <span style={{ fontSize: '10px', color: '#706C66' }}>{res.timestamp}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#706C66' }}>Type: {res.type}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}