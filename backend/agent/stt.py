import asyncio
import os
from .groq_client import client


async def groq_transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe a recorded clip with Groq Whisper.

    If GROQ_STT_LANGUAGE is unset / 'auto', Whisper auto-detects the spoken language
    so Hindi and English both work. Set e.g. GROQ_STT_LANGUAGE=hi to force Hindi.
    """
    name = filename or "audio.webm"
    lang = (os.environ.get("GROQ_STT_LANGUAGE") or "auto").strip().lower()

    def _call() -> str:
        kwargs: dict = {
            "file": (name, audio_bytes),
            "model": os.environ.get("GROQ_STT_MODEL", "whisper-large-v3"),
        }
        if lang and lang not in {"auto", "detect", "*"}:
            kwargs["language"] = lang
        result = client.audio.transcriptions.create(**kwargs)
        return (result.text or "").strip()

    return await asyncio.to_thread(_call)
