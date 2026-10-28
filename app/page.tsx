"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { Mic, Settings, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-background">
      {/* 1. The Infinite Canvas */}
      <div className="absolute inset-0 z-0">
        <Tldraw 
          // We will customize the Tldraw UI later to hide default tools we don't need
          hideUi={false} 
        />
      </div>

      {/* 2. The Floating UI Overlay (Top Bar) */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10 pointer-events-none">
        {/* Logo / Name */}
        <div className="bg-surface/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm border border-white/50 pointer-events-auto">
          <h1 className="text-text font-semibold tracking-wide">Duet</h1>
        </div>

        {/* Status Indicator */}
        <div className="bg-surface/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-white/50 flex items-center gap-2 pointer-events-auto">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm text-text/80">Muse is ready</span>
        </div>
      </div>

      {/* 3. The Bottom Controls (Mic & Modes) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
        {/* Socratic Toggle */}
        <button className="bg-surface hover:bg-surface/80 text-text px-4 py-3 rounded-full shadow-lg border border-white/50 transition-all pointer-events-auto flex items-center gap-2">
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Lecture Mode</span>
        </button>

        {/* The Big Mic Button */}
        <button className="bg-text hover:bg-text/90 text-background p-4 rounded-full shadow-xl transition-all hover:scale-105 active:scale-95 pointer-events-auto">
          <Mic className="w-6 h-6" />
        </button>
      </div>
    </main>
  );
}