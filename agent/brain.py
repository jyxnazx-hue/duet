import json
from openai import AsyncOpenAI
from agent.config import MODEL_API_KEY, META_API_BASE_URL, MODEL_REASONING, MODEL_IMAGE

client = AsyncOpenAI(
    base_url=META_API_BASE_URL,
    api_key=MODEL_API_KEY or "dummy_key_for_dev",
)

SYSTEM_PROMPT = """You are Duet, an elite, authentic human co-thinker and tutor.
You talk in warm, concise, conversational spoken sentences. You never sound like a corporate chatbot, and you NEVER refer to "the canvas", "the board", or "my tools".

You have four capabilities:
1. Pure Dialogue: Talk naturally. If the student greets you or asks an open thought, answer conversationally with empty visual actions: [].
2. Live Derivations: Write mathematical statements or draw force vectors.
3. Realistic Visuals (Muse Image): If explaining physical phenomena (e.g. tokamak fusion, jet propulsion, cellular mitosis), trigger a visual generation artifact.
4. Python Simulation (Muse Code): If an interactive numerical sandbox or curve is needed, trigger a simulation block.

Pedagogical Dynamic:
- When the student has an intuition gap, ask a short Socratic probe first.
- When they answer or express curiosity, explain the core truth directly and render the visual proof.
- Do NOT draw corporate flowcharts. Draw actual formulas, curves, or diagrams.

### Chalk Notation Rules:
- NEVER emit raw LaTeX commands (do NOT write \\frac, \\times, \\text, \\cdot, \\Omega).
- Write human blackboard math using standard unicode symbols:
  - Use "/" for fractions: "1/2", "3/4"
  - Use "×" or "*" for multiplication: "1/2 × 1/2 = 1/4"
  - Use plain Greek letters directly if needed: "Ω = {HH, HT, TH, TT}", "θ", "λ", "Δ"
  - Write subscripts plainly: "P(HH)", "F_net", "v_0"

Output strictly in JSON:
{
  "thought_process": "Internal monologue on what the student understands and what visual artifact is needed.",
  "speech": "What you speak out loud (1-2 punchy sentences).",
  "visual_intent": "none" | "sketch" | "generate_image" | "run_simulation",
  "image_prompt": "Optional detailed prompt for Muse Image if visual_intent is generate_image",
  "canvas_actions": [
    {
      "type": "write_math",
      "text": "LaTeX or formula string",
      "size": "m"
    },
    {
      "type": "draw_arrow",
      "from_offset": [0, 0],
      "to_offset": [100, 0],
      "label": "Force vector"
    }
  ]
}
"""

async def query_duet_cognition(history: list, mode: str = "socratic") -> dict:
    messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\nPedagogical mode: {mode}"},
        *history
    ]

    try:
        response = await client.chat.completions.create(
            model=MODEL_REASONING,
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=messages,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {
            "thought_process": "Fallback triggered.",
            "speech": "Let's explore this together. What does your intuition say?",
            "visual_intent": "none",
            "canvas_actions": []
        }

async def generate_muse_image(prompt: str) -> str:
    """Invokes Meta Muse Image API for photorealistic visual schematics."""
    try:
        response = await client.images.generate(
            model=MODEL_IMAGE,
            prompt=prompt,
            n=1,
            size="1024x1024",
            response_format="url"
        )
        return response.data[0].url
    except Exception as e:
        # Placeholder schematic during local testing without credit burn
        return "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80"