import os
import time
import logging
from groq import Groq, RateLimitError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_api_key = os.environ.get("GROQ_API_KEY")
if not _api_key:
    raise RuntimeError("GROQ_API_KEY is missing. Add it to backend/.env")

client = Groq(api_key=_api_key)

def groq_chat_with_retry(messages: list, model: str = None, max_retries: int = 3, **kwargs) -> dict:
    model = model or os.environ.get("GROQ_LLM_MODEL", "openai/gpt-oss-20b")
    
    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
            return completion
        except RateLimitError as e:
            wait_time = 2 ** attempt
            logger.warning(f"Groq rate limit hit (attempt {attempt + 1}/{max_retries}). Waiting {wait_time}s...")
            if attempt < max_retries - 1:
                time.sleep(wait_time)
            else:
                logger.error("Groq rate limit exceeded after all retries.")
                raise
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            raise