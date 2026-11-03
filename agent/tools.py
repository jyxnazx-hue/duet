CANVAS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "draw_on_canvas",
            "description": "Draws a shape, writes text, or creates an arrow on the canvas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["write_text", "create_box", "draw_arrow"],
                        "description": "The type of shape to draw."
                    },
                    "text": {
                        "type": "string",
                        "description": "The text to write (if type is write_text or create_box)."
                    },
                    "x": {
                        "type": "integer",
                        "description": "X coordinate."
                    },
                    "y": {
                        "type": "integer",
                        "description": "Y coordinate."
                    }
                },
                "required": ["type", "x", "y"]
            }
        }
    }
]