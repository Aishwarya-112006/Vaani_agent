import asyncio
import os
from .groq_client import client


async def groq_transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe a recorded clip with Groq Whisper."""
    name = filename or "audio.webm"

    def _call() -> str:
        result = client.audio.transcriptions.create(
            file=(name, audio_bytes),
            model=os.environ.get("GROQ_STT_MODEL", "whisper-large-v3"),
            language=os.environ.get("GROQ_STT_LANGUAGE", "en"),
        )
        return (result.text or "").strip()

    return await asyncio.to_thread(_call)
