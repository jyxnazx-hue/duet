import asyncio
import json
import websockets

async def test_agent_ws():
    uri = "ws://localhost:8000/ws/duet"
    print(f"Connecting to {uri}...")
    
    async with websockets.connect(uri) as ws:
        print("Connected!")

        # 1. Switch mode
        await ws.send(json.dumps({"type": "mode_switch", "mode": "feynman"}))
        status_resp = await ws.recv()
        print("Mode Response:", status_resp)

        # 2. Send a physics prompt
        print("\nSending prompt...")
        await ws.send(json.dumps({
            "type": "prompt", 
            "text": "Explain damped harmonic oscillator damping force equation."
        }))

        # 3. Listen for responses
        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            print("\nReceived Message:", json.dumps(data, indent=2))
            
            if data.get("type") == "mentor_response":
                print("\nVerification Successful:")
                print(f"Speech: {data.get('speech')}")
                print(f"Canvas Actions ({len(data.get('canvas_actions', []))} items):", data.get('canvas_actions'))
                break

if __name__ == "__main__":
    asyncio.run(test_agent_ws())