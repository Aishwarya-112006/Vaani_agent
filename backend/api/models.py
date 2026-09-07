from pydantic import BaseModel
from typing import Optional


class SessionResponse(BaseModel):
    session_id: str
    detected_city: str = "Delhi"
    greeting: str = "Hi! How can I help you today?"


class MessageResponse(BaseModel):
    status: str
    turn_id: Optional[int] = None
    interrupt_type: Optional[str] = None
    active_request_id: Optional[str] = None
    transcript: Optional[str] = None
    reply_lang: Optional[str] = None


class StatusResponse(BaseModel):
    session_id: str
    turn_id: int
    tool_status: str
    stale_discarded: int
    last_interrupt_type: Optional[str] = None
    active_request_id: Optional[str] = None
    reply_lang: Optional[str] = None


class EvaluateResponse(BaseModel):
    status: str
    message: str
