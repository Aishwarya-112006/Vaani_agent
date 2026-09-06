from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from .models import SessionResponse, MessageResponse, StatusResponse, EvaluateResponse
from agent.state import create_session, get_session
from typing import Optional
import uuid

app = FastAPI(title="VaaniAgent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/session", response_model=SessionResponse)
async def create_session_route():
    session_id = str(uuid.uuid4())
    create_session(session_id)
    return SessionResponse(session_id=session_id)

@app.post("/message", response_model=MessageResponse)
async def handle_message(
    audio: UploadFile = File(...),
    session_id: Optional[str] = Form(default=None),
):
    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty audio clip")

    state = get_session(session_id) if session_id else None
    if session_id and not state:
        state = create_session(session_id)
    if state:
        state.turn_id += 1
        state.history.append(
            {
                "role": "user",
                "kind": "audio",
                "filename": audio.filename,
                "bytes": len(payload),
            }
        )
        turn_id = state.turn_id
    else:
        turn_id = 1

    return MessageResponse(status="ok", turn_id=turn_id)

@app.get("/status", response_model=StatusResponse)
async def get_status(session_id: str):
    state = get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return StatusResponse(**state.to_dict())

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate():
    return EvaluateResponse(status="ok", message="evaluation stub")