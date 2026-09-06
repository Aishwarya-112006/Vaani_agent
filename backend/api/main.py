from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models import SessionResponse, MessageResponse, StatusResponse, EvaluateResponse
import uuid

app = FastAPI(title="VaaniAgent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/session", response_model=SessionResponse)
async def create_session():
    return SessionResponse(session_id=str(uuid.uuid4()))

@app.post("/message", response_model=MessageResponse)
async def handle_message():
    return MessageResponse(status="ok", turn_id=1)

@app.get("/status", response_model=StatusResponse)
async def get_status():
    return StatusResponse(
        session_id="stub",
        turn_id=0,
        tool_status="IDLE",
        stale_discarded=0
    )

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate():
    return EvaluateResponse(status="ok", message="evaluation stub")