import asyncio
from agent.brain import query_meta_brain

async def main():
    print("Testing Meta Muse Spark Agent...")
    
    user_input = "Can you explain the basics of a neural network to me?"
    print(f"\nUser: {user_input}")
    
    response = await query_meta_brain(user_input)
    
    print(f"\nAI Speech: {response['speech']}")
    print(f"Canvas Actions: {response['canvas_actions']}")

if __name__ == "__main__":
    asyncio.run(main())