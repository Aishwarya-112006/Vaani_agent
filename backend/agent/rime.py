import os
import httpx
from dotenv import load_dotenv

load_dotenv()


async def rime_speak(text: str) -> bytes:
    """Synthesize speech with Rime and return raw audio bytes (mp3)."""
    api_key = os.environ.get("RIME_API_KEY")
    if not api_key:
        raise RuntimeError("RIME_API_KEY is missing. Add it to backend/.env")

    endpoint = os.environ.get("RIME_ENDPOINT", "https://users.rime.ai/v1/rime-tts")
    model_id = os.environ.get("RIME_MODEL_ID", "mist")
    speaker = os.environ.get("RIME_SPEAKER", "ava")
    language = os.environ.get("RIME_LANGUAGE", "en")
    audio_format = os.environ.get("RIME_AUDIO_FORMAT", "mp3")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "speaker": speaker,
                "modelId": model_id,
                "lang": language,
                "audioFormat": audio_format,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return response.content
