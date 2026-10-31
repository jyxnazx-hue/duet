import asyncio
import json
import time
from typing import Optional, List, Dict, Any
from fastapi import WebSocket

class DuetSession:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.is_active = True
        self.is_speaking = False
        self.is_thinking = False
        
        # Audio generation tracking for instant interruption
        self.current_task: Optional[asyncio.Task] = None
        self.generation_id = 0
        
        # Conversational memory
        self.history: List[Dict[str, Any]] = []
        
        # Spatial placement state on canvas
        self.cursor_x = 100
        self.cursor_y = 100
        self.max_y_in_row = 100

    async def interrupt(self):
        """Immediately abort active generation and mute agent playback."""
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
        
        self.generation_id += 1
        self.is_speaking = False
        self.is_thinking = False
        
        await self.ws.send_json({
            "type": "interrupt",
            "generation_id": self.generation_id,
            "message": "Playback and drawing cancelled due to user interjection."
        })

    def allocate_spatial_slot(self, width: int = 300, height: int = 150) -> tuple[int, int]:
        """Calculates organic non-overlapping board coordinates for fresh thoughts."""
        placed_x = self.cursor_x
        placed_y = self.cursor_y
        
        # Shift down for the next entry
        self.cursor_y += height + 40
        if self.cursor_y > 1200:
            # Wrap to next horizontal column if board grows deep
            self.cursor_y = 100
            self.cursor_x += 420

        return placed_x, placed_y

    def reset_canvas_layout(self):
        self.cursor_x = 100
        self.cursor_y = 100