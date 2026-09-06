import os
import json
import logging
from .groq_client import groq_chat_with_retry

logger = logging.getLogger(__name__)

INTENT_PROMPT = """You are a voice assistant that helps users find hotels and restaurants in India.
Based on the user's utterance, select the correct tool and extract parameters.

Available tools:
- search_hotels(city, budget, near_metro, veg_friendly)
- search_restaurants(city, cuisine, veg_only, area)

Respond with JSON only:
{{"tool": "search_hotels", "params": {{"city": "...", "budget": 5000, "near_metro": false, "veg_friendly": false}}}}
or
{{"tool": "search_restaurants", "params": {{"city": "...", "cuisine": "...", "veg_only": false, "area": "..."}}}}"""

async def classify_intent(user_utterance: str) -> dict:
    try:
        completion = groq_chat_with_retry(
            messages=[
                {
                    "role": "system",
                    "content": INTENT_PROMPT
                },
                {
                    "role": "user",
                    "content": user_utterance
                }
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        raise