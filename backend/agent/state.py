import asyncio
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class ConversationState:
    session_id: str
    turn_id: int = 0
    current_task: dict = field(default_factory=dict)
    tool_future: Optional[asyncio.Task] = None
    tool_status: str = "IDLE"  # IDLE | RUNNING | CANCELLED | COMPLETE
    history: list = field(default_factory=list)
    stale_discarded: int = 0
    last_interrupt_type: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "turn_id": self.turn_id,
            "current_task": self.current_task,
            "tool_status": self.tool_status,
            "stale_discarded": self.stale_discarded,
            "last_interrupt_type": self.last_interrupt_type,
        }


# In-memory session store
_sessions: dict[str, ConversationState] = {}

def create_session(session_id: str) -> ConversationState:
    state = ConversationState(session_id=session_id)
    _sessions[session_id] = state
    return state

def get_session(session_id: str) -> Optional[ConversationState]:
    return _sessions.get(session_id)