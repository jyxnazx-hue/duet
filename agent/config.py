import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

MODEL_API_KEY = os.getenv("MODEL_API_KEY", "")
META_API_BASE_URL = os.getenv("META_API_BASE_URL", "https://api.meta.ai/v1")

MODEL_REASONING = "muse-spark-1.3"
MODEL_IMAGE = "muse-image-1.0"
MODEL_ASR = "muse-voice-transcribe-1.0"
MODEL_SAM = "sam-3.1"



