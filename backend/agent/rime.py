import os
import httpx
from dotenv import load_dotenv

from agent.language import rime_lang_code

load_dotenv()


def _voice_for_lang(reply_lang: str) -> tuple[str, str, str]:
    """Return (speaker, model_id, rime_lang) for the reply language."""
    default_speaker = os.environ.get("RIME_SPEAKER", "luna")
    default_model = os.environ.get("RIME_MODEL_ID", "arcana")
    default_lang = os.environ.get("RIME_LANGUAGE", "eng")

    if reply_lang == "hi":
        # Hindi is Coda-only (nadi / taru)
        return (
            os.environ.get("RIME_SPEAKER_HI", "nadi"),
            os.environ.get("RIME_MODEL_ID_HI", "coda"),
            "hin",
        )

    # Normalize short codes: en → eng
    lang = default_lang if len(default_lang) != 2 else rime_lang_code(default_lang)
    if lang in {"en", "hi"}:
        lang = rime_lang_code(lang)
    return default_speaker, default_model, lang or "eng"


async def rime_speak(text: str, *, reply_lang: str | None = None) -> bytes:
    """Synthesize speech with Rime and return raw audio bytes (mp3)."""
    api_key = os.environ.get("RIME_API_KEY")
    if not api_key:
        raise RuntimeError("RIME_API_KEY is missing. Add it to backend/.env")

    endpoint = os.environ.get("RIME_ENDPOINT", "https://users.rime.ai/v1/rime-tts")
    audio_format = os.environ.get("RIME_AUDIO_FORMAT", "mp3")
    speaker, model_id, language = _voice_for_lang(reply_lang or "en")

    # Keep lines within Rime's ~1000 char HTTP limit
    clipped = (text or "").strip()
    if len(clipped) > 900:
        clipped = clipped[:897].rstrip() + "..."

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": clipped,
                "speaker": speaker,
                "modelId": model_id,
                "lang": language,
                "audioFormat": audio_format,
            },
            timeout=30.0,
        )
        if response.status_code >= 400:
            body = (response.text or "").strip()[:300]
            raise RuntimeError(
                f"HTTP {response.status_code} speaker={speaker} model={model_id} "
                f"lang={language}: {body or '(empty body)'}"
            )
        if not response.content:
            raise RuntimeError(
                f"Empty audio speaker={speaker} model={model_id} lang={language}"
            )
        return response.content
