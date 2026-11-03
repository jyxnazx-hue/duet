import json
from openai import AsyncOpenAI
from agent.config import META_API_KEY, META_API_BASE_URL, MODEL_REASONING
from agent.prompts import SYSTEM_PROMPT

client = AsyncOpenAI(
    base_url=META_API_BASE_URL,
    api_key=META_API_KEY or "dummy_key_for_dev",
)

async def query_meta_brain(user_text: str, history: list = None) -> dict:
    """
    Sends the user prompt to Meta Muse Spark using JSON mode.
    """
    if history is None:
        history = []

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_text}
    ]

    try:
        # Use JSON mode to force structured output
        response = await client.chat.completions.create(
            model=MODEL_REASONING,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.5
        )

        # Parse the JSON string returned by the model
        raw_content = response.choices[0].message.content
        data = json.loads(raw_content)

        return {
            "speech": data.get("speech", "").strip(),
            "canvas_actions": data.get("canvas_actions", [])
        }

    except Exception as e:
        print(f"Brain Error: {e}")
        return {
            "speech": "I am having trouble connecting right now. Can you repeat that?",
            "canvas_actions": []
        }