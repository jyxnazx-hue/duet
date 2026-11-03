import asyncio
from agent.audio import record_audio, transcribe_audio, speak_text
from agent.brain import query_meta_brain

async def main():
    print("Starting full voice loop test...")
    
    # 1. Record User Audio
    audio_file = record_audio(duration=5)
    
    # 2. Transcribe (Ears)
    print("Transcribing audio via Meta Voice Transcribe...")
    user_text = await transcribe_audio(audio_file)
    print(f"User said: '{user_text}'")
    
    if not user_text:
        print("No speech detected. Exiting.")
        return

    # 3. Reason (Brain)
    print("Thinking (Muse Spark)...")
    response = await query_meta_brain(user_text)
    
    # 4. Speak (Mouth)
    ai_speech = response['speech']
    canvas_actions = response['canvas_actions']
    
    speak_text(ai_speech)
    
    # 5. Print Canvas Actions
    print(f"\n--- Canvas Actions ---")
    for action in canvas_actions:
        print(action)

if __name__ == "__main__":
    asyncio.run(main())