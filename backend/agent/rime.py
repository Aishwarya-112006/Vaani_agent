import os
import httpx
from dotenv import load_dotenv

load_dotenv()

async def rime_speak(text: str) -> bytes:
    api_key = os.environ.get("RIME_API_KEY")
    endpoint = os.environ.get("RIME_ENDPOINT", "https://users.rime.ai/v1/rime-tts")
    model_id = os.environ.get("RIME_MODEL_ID", "mist")
    speaker = os.environ.get("RIME_SPEAKER", "ava")
    language = os.environ.get("RIME_LANGUAGE", "en-US")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "speaker": speaker,
                "modelId": model_id,
                "language": language,
            },
            timeout=30.0
        )
        response.raise_for_status()
        return response.content