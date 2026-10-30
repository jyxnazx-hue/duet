import asyncio
import json
from agent.brain import query_muse_spark_with_history

async def interactive_terminal_session():
    print("=" * 60)
    print(" DUET AGENT: Interactive Session with Context Memory")
    print(" Type 'exit' to quit | Commands: '/clear', '/socratic', '/feynman'")
    print("=" * 60)

    mode = "socratic"
    conversation_history = []

    while True:
        try:
            user_input = input("\nYou (Voice/Student) > ").strip()
            if not user_input:
                continue

            if user_input.lower() in ("exit", "quit"):
                break

            if user_input.lower() == "/clear":
                conversation_history = []
                print("--> Conversation memory cleared.")
                continue

            if user_input.startswith("/"):
                selected = user_input[1:].lower()
                if selected in ("socratic", "feynman"):
                    mode = selected
                    print(f"--> Mode switched to [{mode.upper()}].")
                    continue

            # Append student turn to memory
            conversation_history.append({"role": "user", "content": user_input})

            print("\n[Muse Spark is thinking & deriving...]")
            
            # Send entire conversational history
            result = await query_muse_spark_with_history(conversation_history, mode=mode)

            speech = result.get("speech", "")
            actions = result.get("canvas_actions", [])

            # Store assistant response in history
            conversation_history.append({"role": "assistant", "content": json.dumps(result)})

            # 1. Spoken Output
            print("\n" + "-" * 50)
            print(f"Agent (Speech Output) 🎙️:")
            print(f'"{speech}"')
            print("-" * 50)

            # 2. Whiteboard Drawing Actions
            print(f"\nCanvas Actions Generated ({len(actions)} steps):")
            for idx, action in enumerate(actions, 1):
                act_type = action.get("type")
                if act_type == "write_text":
                    print(f"  [{idx}] ✍️  Text at ({action.get('x')}, {action.get('y')}): \"{action.get('text')}\"")
                elif act_type == "create_box":
                    print(f"  [{idx}] 📦 Box '{action.get('text')}' at ({action.get('x')}, {action.get('y')})")
                elif act_type == "draw_arrow":
                    print(f"  [{idx}] ➡️  Arrow: ({action.get('fromX')}, {action.get('fromY')}) -> ({action.get('toX')}, {action.get('toY')})")
                elif act_type == "create_note":
                    print(f"  [{idx}] 📝 Note: \"{action.get('text')}\"")

        except (KeyboardInterrupt, EOFError):
            break

if __name__ == "__main__":
    asyncio.run(interactive_terminal_session())