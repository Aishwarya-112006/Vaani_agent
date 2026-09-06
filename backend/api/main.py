import uuid
import logging
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .models import SessionResponse, MessageResponse, StatusResponse, EvaluateResponse
from agent.state import create_session, get_session

logger = logging.getLogger(__name__)

app = FastAPI(title="VaaniAgent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected: {session_id}")

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)
        logger.info(f"WebSocket disconnected: {session_id}")

    async def broadcast_state(self, session_id: str, state):
        websocket = self.active_connections.get(session_id)
        if websocket:
            try:
                await websocket.send_json(state.to_dict())
            except Exception as e:
                logger.error(f"WebSocket send error: {e}")

manager = ConnectionManager()


@app.post("/session", response_model=SessionResponse)
async def create_session_route():
    session_id = str(uuid.uuid4())
    create_session(session_id)
    return SessionResponse(session_id=session_id)


@app.post("/message", response_model=MessageResponse)
async def handle_message():
    return MessageResponse(status="ok", turn_id=1)


@app.get("/status", response_model=StatusResponse)
async def get_status(session_id: str):
    state = get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return StatusResponse(**state.to_dict())


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate():
    return EvaluateResponse(status="ok", message="evaluation stub")


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    state = get_session(session_id)
    if not state:
        await websocket.close(code=4004)
        return

    await manager.connect(session_id, websocket)
    try:
        # Send initial state immediately on connect
        await manager.broadcast_state(session_id, state)
        while True:
            # Keep connection alive, frontend sends pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id)