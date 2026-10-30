import json
from openai import AsyncOpenAI
from agent.config import MODEL_API_KEY, META_API_BASE_URL, MODEL_REASONING

client = AsyncOpenAI(
    base_url=META_API_BASE_URL,
    api_key=MODEL_API_KEY or "dummy_key_for_dev",
)

SYSTEM_PROMPT = """You are Duet, an authentic, sharp human mentor and spatial co-thinker.
You speak in clear, natural, spoken sentences (1-3 sentences max). You never sound robotic or mention "canvas", "board", or "tools".

### Spatial Placement Rules:
1. Do NOT draw on top of previous shapes. 
2. If this is a continuation of the same topic, position new blocks BELOW previous ones (start Y at 350+ or use offset), or branch horizontally to the right.
3. Keep coordinates clean:
   - Header text: y = current_y
   - Diagram row: y = current_y + 60
   - Notes/Takeaways: y = current_y + 180

### Allowed `canvas_actions` Primitives:
- Math / Text:
  {"type": "write_text", "id": "str", "x": int, "y": int, "text": "str", "size": "s"|"m"|"l", "color": "black"|"blue"|"red"}
- Comparison Containers / Objects:
  {"type": "create_box", "id": "str", "x": int, "y": int, "w": int, "h": int, "geo": "rectangle"|"ellipse", "text": "str", "color": "blue"|"green"|"orange"}
- Process / Force / Vector Arrows:
  {"type": "draw_arrow", "id": "str", "fromX": int, "fromY": int, "toX": int, "toY": int, "color": "black"|"red"|"orange"}
- Concept Sticky Note:
  {"type": "create_note", "id": "str", "x": int, "y": int, "text": "str", "color": "yellow"|"blue"}

Respond strictly with valid JSON:
{
  "speech": "spoken response",
  "canvas_actions": [...]
}
"""

async def query_muse_spark_with_history(messages: list, mode: str = "socratic") -> dict:
    mode_directive = (
        "Socratic: Guide them with a question once, but when they commit to an answer or ask you to explain, give the resolution and draw the proof."
        if mode == "socratic"
        else "Feynman: Dissect the intuition using vivid physical everyday counter-examples and draw the math."
    )

    full_messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\nActive Mode: {mode_directive}"},
        *messages
    ]

    try:
        response = await client.chat.completions.create(
            model=MODEL_REASONING,
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=full_messages,
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        return {
            "speech": "Let me break down the paradox directly for you right here.",
            "canvas_actions": [
                {"type": "write_text", "id": "err_note", "x": 100, "y": 100, "text": "F = ma -> a = F/m", "size": "m", "color": "blue"}
            ]
        }