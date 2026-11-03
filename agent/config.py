import os
from dotenv import load_dotenv

load_dotenv()

META_API_KEY = os.getenv("META_API_KEY")
META_API_BASE_URL = "https://api.meta.ai/v1"
MODEL_REASONING = "muse-wonder-1.0"
ASR_MODEL = os.getenv("ASR_MODEL", "muse-voice-transcribe-1.0")