import os
import json
from enum import Enum
from .groq_client import client

class InterruptType(str, Enum):
    REFINE = "REFINE"
    CANCEL = "CANCEL"
    STATUS = "STATUS"
    PIVOT = "PIVOT"

INTERRUPT_CLASSIFIER_PROMPT = """You are an interrupt classifier for a voice agent.
The agent is currently executing: {current_task}
The user just said: "{user_utterance}"

Classify the interruption as exactly one of:
REFINE - user is modifying constraints on the current task
CANCEL - user is abandoning the current task
STATUS - user is asking about progress (do not cancel)
PIVOT - user wants a completely different task

Respond with JSON only:
{{"type": "REFINE", "updated_params": {{}}}}
or {{"type": "CANCEL"}}
or {{"type": "STATUS"}}
or {{"type": "PIVOT", "new_task": "..."}}"""

async def classify_interrupt(user_utterance: str, current_task: dict) -> dict:
    completion = client.chat.completions.create(
        model=os.environ.get("GROQ_LLM_MODEL", "llama-3.1-8b-instant"),
        messages=[
            {
                "role": "system",
                "content": INTERRUPT_CLASSIFIER_PROMPT.format(
                    current_task=current_task,
                    user_utterance=user_utterance
                )
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