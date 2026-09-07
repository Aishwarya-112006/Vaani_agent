import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


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
    active_request_id: Optional[str] = None
    last_tool_result: Optional[dict] = None
    reply_lang: str = "en"  # 'en' | 'hi' — mirrors last clear user utterance

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "turn_id": self.turn_id,
            "current_task": self.current_task,
            "tool_status": self.tool_status,
            "stale_discarded": self.stale_discarded,
            "last_interrupt_type": self.last_interrupt_type,
            "active_request_id": self.active_request_id,
            "last_tool_result": self.last_tool_result,
            "reply_lang": self.reply_lang,
        }


# In-memory session store
_sessions: dict[str, ConversationState] = {}


def create_session(session_id: str) -> ConversationState:
    state = ConversationState(session_id=session_id)
    _sessions[session_id] = state
    return state


def get_session(session_id: str) -> Optional[ConversationState]:
    return _sessions.get(session_id)


async def handle_interrupt(state: ConversationState, interrupt: dict, run_tool_fn=None) -> None:
    interrupt_type = interrupt.get("type")
    state.last_interrupt_type = interrupt_type
    state.turn_id += 1

    logger.info(f"[{state.session_id}] Interrupt: {interrupt_type} | new turn_id={state.turn_id}")

    if interrupt_type == "STATUS":
        logger.info(f"[{state.session_id}] STATUS — tool keeps running")
        return

    if state.tool_future and not state.tool_future.done():
        state.tool_future.cancel()
        state.tool_status = "CANCELLED"
        logger.info(f"[{state.session_id}] Tool cancelled")

    if interrupt_type == "REFINE":
        updated_params = interrupt.get("updated_params", {})
        state.current_task["params"] = {**state.current_task.get("params", {}), **updated_params}
        state.tool_status = "RUNNING"
        if run_tool_fn:
            state.tool_future = asyncio.create_task(
                run_tool_fn(state.current_task, state.turn_id, state)
            )
        logger.info(
            f"[{state.session_id}] REFINE — rerunning tool with params: {state.current_task['params']}"
        )

    elif interrupt_type == "CANCEL":
        state.current_task = {}
        state.tool_status = "IDLE"
        state.active_request_id = None
        logger.info(f"[{state.session_id}] CANCEL — task cleared")

    elif interrupt_type == "PIVOT":
        new_task = interrupt.get("new_task", "")
        state.current_task = {"raw": new_task}
        state.tool_status = "IDLE"
        state.active_request_id = None
        logger.info(f"[{state.session_id}] PIVOT — new task: {new_task}")


async def tool_callback(result: dict, turn_id: int, state: ConversationState, speak_fn=None) -> None:
    if turn_id != state.turn_id:
        state.stale_discarded += 1
        logger.info(
            f"[{state.session_id}] Stale result BLOCKED — result turn_id={turn_id} != current turn_id={state.turn_id}"
        )
        return

    state.tool_status = "COMPLETE"
    logger.info(f"[{state.session_id}] Result accepted — turn_id={turn_id}")

    if speak_fn:
        await speak_fn(result)
