import React, { useState } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import { 
  Anchor, 
  Plus, 
  Mic, 
  MicOff, 
  GraduationCap,
  BrainCircuit,
  Undo2,
  Redo2,
  Trash2,
  Play,
  Square
} from 'lucide-react';

import { useCanvasAnimator } from './useCanvasAnimator';
import { PHOTOSYNTHESIS_LESSON } from './photosynthesisData';

// Custom component prop to cleanly suppress the tldraw watermark badge
const customComponents = {
  Watermark: () => null,
};

export default function App() {
  const [tabs, setTabs] = useState(['Photosynthesis', 'Classical Mechanics', 'Neuro-AI']);
  const [activeTab, setActiveTab] = useState(0);
  const [editingTabIdx, setEditingTabIdx] = useState(null);
  const [editingTabText, setEditingTabText] = useState('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chapters, setChapters] = useState([
    { num: '01', title: '01. Light Reactions', sub: 'Thylakoid & Electron Transport' },
    { num: '02', title: '02. Calvin Cycle', sub: 'Stroma & Carbon Fixation' },
    { num: '03', title: '03. Glucose Output', sub: 'Hexose Sugar Synthesis' }
  ]);
  const [activeChapter, setActiveChapter] = useState(0);

  const [isMicActive, setIsMicActive] = useState(false);
  const [pedagogyMode, setPedagogyMode] = useState('socratic');

  const [editor, setEditor] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Hook up the Animator
  const { runSequence, stopAnimation, isAnimating, currentStep } = useCanvasAnimator(editor);

  const startDemoAnimation = () => {
    if (!editor) return;
    // Clear canvas before running the demo sequence
    editor.selectAll();
    editor.deleteShapes(editor.getSelectedShapeIds());
    // Draw the Photosynthesis concept sequence with a 550ms step interval
    runSequence(PHOTOSYNTHESIS_LESSON, 550);
  };

  const handleTabSave = () => {
    if (editingTabIdx !== null) {
      const updated = [...tabs];
      updated[editingTabIdx] = editingTabText.trim() || `Subject ${editingTabIdx + 1}`;
      setTabs(updated);
      setEditingTabIdx(null);
    }
  };

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="top-header">
        <div className="header-left">
          <div className="brand-badge" title="Duet Canvas">
            <Anchor size={17} strokeWidth={2.4} />
          </div>

          <div className="tabs-container">
            {tabs.map((tab, idx) => (
              <div 
                key={idx}
                className={`tab-item ${activeTab === idx ? 'active' : ''}`}
                onClick={() => setActiveTab(idx)}
                onDoubleClick={() => {
                  setEditingTabIdx(idx);
                  setEditingTabText(tabs[idx]);
                }}
              >
                {editingTabIdx === idx ? (
                  <input
                    type="text"
                    className="tab-input"
                    value={editingTabText}
                    autoFocus
                    onChange={(e) => setEditingTabText(e.target.value)}
                    onBlur={handleTabSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleTabSave()}
                  />
                ) : (
                  <span>{tab}</span>
                )}
              </div>
            ))}

            <button 
              className="add-tab-btn" 
              onClick={() => setTabs([...tabs, `Subject ${tabs.length + 1}`])}
              title="Add Subject Tab"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Header Right */}
        <div className="header-right">
          {/* Animator Test Action */}
          {isAnimating ? (
            <button 
              className="icon-btn" 
              style={{ background: '#FAF0EB', color: 'var(--accent-warm)', borderColor: 'var(--accent-warm)' }}
              onClick={stopAnimation}
            >
              <Square size={13} fill="currentColor" />
              <span>Drawing ({currentStep}/{PHOTOSYNTHESIS_LESSON.length})</span>
            </button>
          ) : (
            <button 
              className="icon-btn primary"
              onClick={startDemoAnimation}
            >
              <Play size={13} fill="currentColor" />
              <span>Test Animator</span>
            </button>
          )}

          <div className="mode-toggle-group">
            <button 
              className={`mode-btn ${pedagogyMode === 'socratic' ? 'active' : ''}`}
              onClick={() => setPedagogyMode('socratic')}
              title="Socratic Mode"
            >
              <GraduationCap size={14} />
              <span>Socratic</span>
            </button>
            <button 
              className={`mode-btn ${pedagogyMode === 'feynman' ? 'active' : ''}`}
              onClick={() => setPedagogyMode('feynman')}
              title="Feynman Mode"
            >
              <BrainCircuit size={14} />
              <span>Feynman</span>
            </button>
          </div>

          <button 
            className={`voice-pill-btn ${isMicActive ? 'listening' : ''}`}
            onClick={() => setIsMicActive(!isMicActive)}
            title={isMicActive ? "Mute Microphone" : "Enable Voice"}
          >
            {isMicActive ? (
              <>
                <span className="live-pulse"></span>
                <Mic size={15} />
                <span>Listening...</span>
              </>
            ) : (
              <>
                <MicOff size={15} />
                <span>Voice Muted</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="main-body">
        {/* Left Chapter Rail */}
        <aside className={`chapter-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div 
            className="chapter-sidebar-header" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Click to collapse" : "Click to expand chapters"}
          >
            {isSidebarOpen ? (
              <span className="sidebar-title">Chapters</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>CH</span>
            )}
          </div>

          <div className="chapter-list">
            {chapters.map((ch, idx) => (
              isSidebarOpen ? (
                <div 
                  key={idx}
                  className={`chapter-card ${activeChapter === idx ? 'active' : ''}`}
                  onClick={() => setActiveChapter(idx)}
                >
                  <div className="chapter-card-title">{ch.title}</div>
                  <div className="chapter-card-sub">{ch.sub}</div>
                </div>
              ) : (
                <button
                  key={idx}
                  className={`chapter-icon-btn ${activeChapter === idx ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChapter(idx);
                    setIsSidebarOpen(true);
                  }}
                  title={ch.title}
                >
                  {ch.num}
                </button>
              )
            ))}
          </div>
        </aside>

        {/* Central Infinite Canvas */}
        <main className="canvas-wrapper">
          {/* Centered Floating History Bar */}
          <div className="centered-action-bar">
            <span className="page-indicator-pill">Page 1</span>
            <div className="bar-divider"></div>
            <button className="bar-btn" onClick={() => editor?.undo()} title="Undo">
              <Undo2 size={14} />
            </button>
            <button className="bar-btn" onClick={() => editor?.redo()} title="Redo">
              <Redo2 size={14} />
            </button>
            <button 
              className="bar-btn" 
              onClick={() => {
                const selected = editor?.getSelectedShapeIds();
                if (selected?.length) editor?.deleteShapes(selected);
              }} 
              title="Delete Selected"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <Tldraw 
            components={customComponents}
            onMount={(editorInstance) => {
              setEditor(editorInstance);
              editorInstance.on('change', () => {
                setZoomLevel(Math.round(editorInstance.getZoomLevel() * 100));
              });
            }}
          />

          {/* Simple Zoom Percentage */}
          <button 
            className="simple-zoom-indicator" 
            onClick={() => {
              editor?.resetZoom();
              setZoomLevel(100);
            }} 
            title="Reset Zoom"
          >
            {zoomLevel}%
          </button>
        </main>
      </div>
    </div>
  );
}