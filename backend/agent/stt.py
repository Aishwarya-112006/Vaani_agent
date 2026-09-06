import os
from .groq_client import client

async def groq_transcribe(audio_bytes: bytes) -> str:
    transcription = client.audio.transcriptions.create(
        file=("audio.wav", audio_bytes),
        model=os.environ.get("GROQ_STT_MODEL", "whisper-large-v3"),
    )
    return transcription.text