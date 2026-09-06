from pydantic import BaseModel
from typing import Optional

class SessionResponse(BaseModel):
    session_id: str

class MessageResponse(BaseModel):
    status: str
    turn_id: Optional[int] = None
    interrupt_type: Optional[str] = None

class StatusResponse(BaseModel):
    session_id: str
    turn_id: int
    tool_status: str
    stale_discarded: int
    last_interrupt_type: Optional[str] = None

class EvaluateResponse(BaseModel):
    status: str
    message: str