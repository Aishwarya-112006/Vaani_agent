import asyncio
import logging
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from groq import RateLimitError
from pydantic import BaseModel, Field

from .models import (
    SessionResponse,
    SessionCityRequest,
    SessionCityResponse,
    MessageResponse,
    StatusResponse,
    EvaluateResponse,
)
from agent.state import create_session, get_session, ConversationState
from agent.stt import groq_transcribe
from agent.rime import rime_speak
from agent.language import detect_reply_lang
from tools.ipinfo import (
    client_ip_from_headers,
    resolve_city_from_ip,
    greeting_for_city,
    DEFAULT_CITY,
)
from tools.hotel_search import parse_hotel_params, search_hotels
from tools.restaurant_search import parse_restaurant_params, search_restaurants
from tools.wikipedia import clean_wiki_query, fetch_wiki_summary


# Structured JSON logger
class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        session_id = getattr(record, "session_id", None)
        turn_id = getattr(record, "turn_id", None)
        tool_id = getattr(record, "tool_id", None)
        if session_id is not None:
            log_data["session_id"] = session_id
        if turn_id is not None:
            log_data["turn_id"] = turn_id
        if tool_id is not None:
            log_data["tool_id"] = tool_id
        return json.dumps(log_data)


handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger(__name__)


def _cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()] or ["*"]


app = FastAPI(title="VaaniAgent")

_CORS = _cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS allow_origins=%s (set CORS_ORIGINS for deploy — D1)", _CORS)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)

    async def broadcast_state(self, session_id: str, state: ConversationState):
        websocket = self.active_connections.get(session_id)
        if websocket:
            try:
                await websocket.send_json(state.to_dict())
            except Exception as e:
                logger.error(f"WebSocket send error: {e}")


manager = ConnectionManager()


def log_event(
    event: str,
    session_id: Optional[str] = None,
    turn_id: Optional[int] = None,
    tool_id: Optional[str] = None,
) -> None:
    extra: dict = {}
    if session_id:
        extra["session_id"] = session_id
    if turn_id is not None:
        extra["turn_id"] = turn_id
    if tool_id:
        extra["tool_id"] = tool_id
    logger.info(event, extra=extra)


async def _run_search_hotels(
    session_id: str,
    turn_id: int,
    request_id: str,
    params: dict,
) -> None:
    """Run interruptible search_hotels; discard stale results after fencing."""
    state = get_session(session_id)
    if not state:
        return

    try:
        result = await search_hotels(
            city=params.get("city", "Delhi"),
            budget=params.get("budget", 5000),
            near_metro=bool(params.get("near_metro", False)),
            veg_only=bool(params.get("veg_only", False)),
            reply_lang=getattr(state, "reply_lang", "en") or "en",
        )
    except asyncio.CancelledError:
        log_event(
            "tool_cancelled",
            session_id=session_id,
            turn_id=turn_id,
            tool_id=request_id,
        )
        return

    await _finalize_tool_result(session_id, turn_id, request_id, result)


async def _run_search_restaurants(
    session_id: str,
    turn_id: int,
    request_id: str,
    params: dict,
) -> None:
    """Run interruptible search_restaurants; discard stale results after fencing."""
    state = get_session(session_id)
    if not state:
        return

    try:
        result = await search_restaurants(
            city=params.get("city", "Delhi"),
            cuisine=params.get("cuisine", "Indian"),
            veg_only=bool(params.get("veg_only", False)),
            area=params.get("area"),
            near_metro=bool(params.get("near_metro", False)),
            area_explicit=bool(params.get("area_explicit", False)),
            reply_lang=getattr(state, "reply_lang", "en") or "en",
        )
    except asyncio.CancelledError:
        log_event(
            "tool_cancelled",
            session_id=session_id,
            turn_id=turn_id,
            tool_id=request_id,
        )
        return

    await _finalize_tool_result(session_id, turn_id, request_id, result)


async def _finalize_tool_result(
    session_id: str,
    turn_id: int,
    request_id: str,
    result: dict,
) -> None:
    state = get_session(session_id)
    if not state:
        return

    if state.turn_id != turn_id or state.active_request_id != request_id:
        state.stale_discarded += 1
        log_event(
            "stale_discarded",
            session_id=session_id,
            turn_id=turn_id,
            tool_id=request_id,
        )
        await manager.broadcast_state(session_id, state)
        return

    state.tool_status = "COMPLETE"
    state.last_tool_result = result
    state.history.append({"role": "assistant", "kind": "tool_result", "result": result})
    log_event("tool_complete", session_id=session_id, turn_id=turn_id, tool_id=request_id)
    await manager.broadcast_state(session_id, state)


def _restaurant_signal(text: str) -> bool:
    return bool(
        re.search(
            # Common typos: resturant / restraunt
            r"\brestaurants?\b|\bresturants?\b|\brestraunts?\b|food|eat|dinner|lunch|breakfast|cafe|cuisine|thali|dining|khana|khaana",
            (text or "").lower(),
        )
    )


def _hotel_signal(text: str) -> bool:
    # Note: budget / metro alone are hotel REFINE cues, not tool switches
    return bool(
        re.search(
            r"\bhotels?\b|\bhotals?\b|\bstay\b|\brooms?\b|lodging|accommodation|resort",
            (text or "").lower(),
        )
    )


def _resolve_tool_kind(
    text: str,
    state: ConversationState,
    interrupt: Optional[str],
) -> str:
    """Route to search_hotels vs search_restaurants.

    REFINE keeps the current tool. PIVOT / explicit intents switch.
    """
    restaurant = _restaurant_signal(text)
    hotel = _hotel_signal(text)
    current = str(state.current_task.get("type", "") or "")

    if interrupt == "PIVOT":
        if restaurant and not hotel:
            return "restaurant"
        if hotel and not restaurant:
            return "hotel"
        if restaurant and hotel:
            if re.search(r"\brestaurants?\b", (text or "").lower()):
                return "restaurant"
            if re.search(r"\bhotels?\b", (text or "").lower()):
                return "hotel"
        return "restaurant" if current == "hotel" else "hotel"

    if restaurant and not hotel:
        return "restaurant"
    if hotel and not restaurant:
        return "hotel"
    if restaurant and hotel:
        if re.search(r"\brestaurants?\b", (text or "").lower()):
            return "restaurant"
        if re.search(r"\bhotels?\b", (text or "").lower()):
            return "hotel"

    # REFINE / continuation — stay on the in-flight (or last) tool
    if current in ("restaurant", "hotel"):
        return current
    return "hotel"


def _classify_interrupt(text: str, state: ConversationState) -> Optional[str]:
    """Keep keyword families in sync with frontend `lib/interrupt.ts` (C1 / H2)."""
    s = (text or "").lower()
    if re.search(r"what are you|are you still|how long|status", s):
        return "STATUS"
    if re.search(r"what is|tell me about|who is|kya hai|kya hota|batao", s):
        return "FACT"
    if re.search(r"forget it|never mind|stop searching|cancel|stop it", s):
        return "CANCEL"
    task_type = str(state.current_task.get("type", ""))
    if task_type == "hotel" and _restaurant_signal(s):
        return "PIVOT"
    if task_type == "restaurant" and _hotel_signal(s):
        return "PIVOT"
    if state.tool_status == "RUNNING" and re.search(
        r"actually|only|vegetarian|veg|under|metro|near|rupees|₹|cuisine|area",
        s,
    ):
        return "REFINE"
    return None


@app.post("/session", response_model=SessionResponse)
async def create_session_route(request: Request):
    session_id = str(uuid.uuid4())
    state = create_session(session_id)

    # Best-effort geo — never fail session creation
    try:
        ip = client_ip_from_headers(
            dict(request.headers),
            fallback=request.client.host if request.client else "127.0.0.1",
        )
        geo = await resolve_city_from_ip(ip)
    except Exception:
        geo = {
            "city": DEFAULT_CITY,
            "source": "fallback",
            "ip": None,
            "is_local": True,
        }

    city = str(geo.get("city") or DEFAULT_CITY)
    state.detected_city = city
    # Do not invent preferred_city — FE confirms via /city (Yes / Change)
    state.preferred_city = None
    greeting = greeting_for_city(city, lang="en")

    log_event("session_created", session_id=session_id)
    logger.info(
        "session_geo city=%s source=%s local=%s",
        city,
        geo.get("source"),
        geo.get("is_local"),
    )
    return SessionResponse(
        session_id=session_id,
        detected_city=city,
        greeting=greeting,
        city_source=str(geo.get("source") or "fallback"),
        is_local=bool(geo.get("is_local")),
    )


@app.post("/session/{session_id}/city", response_model=SessionCityResponse)
async def set_session_city(session_id: str, body: SessionCityRequest):
    """Override preferred city (localhost / VPN wrong guess)."""
    state = get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    city = (body.city or "").strip().title() or DEFAULT_CITY
    state.preferred_city = city
    greeting = greeting_for_city(city, lang=getattr(state, "reply_lang", "en") or "en")
    log_event("session_city_set", session_id=session_id)
    return SessionCityResponse(session_id=session_id, preferred_city=city, greeting=greeting)


@app.post("/message", response_model=MessageResponse)
async def handle_message(
    session_id: Optional[str] = Form(default=None),
    text: Optional[str] = Form(default=None),
    interrupt_type: Optional[str] = Form(default=None),
    audio: Optional[UploadFile] = File(default=None),
):
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    state = get_session(session_id)
    if not state:
        state = create_session(session_id)

    transcript: Optional[str] = None

    if audio is not None:
        payload = await audio.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Empty audio clip")

        try:
            transcript = await groq_transcribe(payload, audio.filename or "clip.webm")
        except RateLimitError as exc:
            log_event("rate_limit_hit", session_id=session_id)
            raise HTTPException(status_code=429, detail="Voice service is busy right now. Please wait a moment and try again.") from exc
        except Exception as exc:
            log_event("stt_failed", session_id=session_id)
            err_l = str(exc).lower()
            if "403" in err_l or "access denied" in err_l or "permission" in err_l or "unauthorized" in err_l:
                raise HTTPException(
                    status_code=503,
                    detail="Speech-to-text unavailable (network/key). Type your request instead.",
                ) from exc
            raise HTTPException(
                status_code=502,
                detail=f"Speech-to-text failed: {exc}",
            ) from exc

        if not transcript:
            raise HTTPException(status_code=400, detail="Could not understand audio — try again")

        text = transcript
        state.history.append(
            {
                "role": "user",
                "kind": "audio",
                "filename": audio.filename,
                "bytes": len(payload),
                "transcript": transcript,
            }
        )
        log_event("stt_ok", session_id=session_id)

    if text:
        state.reply_lang = detect_reply_lang(text, getattr(state, "reply_lang", None))

    classified = interrupt_type or _classify_interrupt(text or "", state)

    # FACT: answer side question without cancelling tool
    if classified == "FACT":
        reply_lang = getattr(state, "reply_lang", "en") or "en"
        query = clean_wiki_query(text or "")
        fact_summary = await fetch_wiki_summary(query, reply_lang)
        state.last_interrupt_type = "FACT"
        log_event("interrupt_fact", session_id=session_id, turn_id=state.turn_id)
        await manager.broadcast_state(session_id, state)
        return MessageResponse(
            status="ok",
            turn_id=state.turn_id,
            interrupt_type="FACT",
            active_request_id=state.active_request_id,
            transcript=transcript or text,
            reply_lang=reply_lang,
            fact_summary=fact_summary,
        )

    # STATUS: answer without fencing / without starting a new tool
    if classified == "STATUS":
        state.last_interrupt_type = "STATUS"
        log_event("interrupt_status", session_id=session_id, turn_id=state.turn_id)
        await manager.broadcast_state(session_id, state)
        return MessageResponse(
            status="ok",
            turn_id=state.turn_id,
            interrupt_type="STATUS",
            active_request_id=state.active_request_id,
            transcript=transcript or text,
            reply_lang=state.reply_lang,
        )

    # Fence previous tool when interrupting a run
    if state.tool_status == "RUNNING" and state.tool_future and not state.tool_future.done():
        state.tool_future.cancel()

    if classified == "CANCEL":
        state.turn_id += 1
        state.last_interrupt_type = "CANCEL"
        state.tool_status = "CANCELLED"
        state.current_task = {}
        state.active_request_id = None
        state.tool_future = None
        log_event("interrupt_cancel", session_id=session_id, turn_id=state.turn_id)
        await manager.broadcast_state(session_id, state)
        return MessageResponse(
            status="ok",
            turn_id=state.turn_id,
            interrupt_type="CANCEL",
            active_request_id=None,
            transcript=transcript or text,
            reply_lang=state.reply_lang,
        )

    state.turn_id += 1
    request_id = uuid.uuid4().hex[:8]
    state.active_request_id = request_id
    state.last_interrupt_type = classified
    state.tool_status = "RUNNING"
    state.last_tool_result = None

    prev_params = state.current_task.get("params") if isinstance(state.current_task, dict) else None
    prev = prev_params if isinstance(prev_params, dict) else None
    tool_kind = _resolve_tool_kind(text or "", state, classified)
    same_kind = str(state.current_task.get("type", "")) == tool_kind
    # Prefer confirmed city, else detected (geo) — never hardcode Delhi when both empty
    default_city = (
        (getattr(state, "preferred_city", None) or getattr(state, "detected_city", None) or "")
        .strip()
    )

    if tool_kind == "restaurant":
        merge_from = (
            prev
            if same_kind
            else (
                {k: prev[k] for k in ("city", "veg_only", "near_metro") if k in prev}
                if prev
                else None
            )
        )
        tool_params = parse_restaurant_params(
            text or "",
            merge_from,
            default_city=default_city,
        )
        if tool_params.get("city_required") or not tool_params.get("city"):
            state.tool_status = "IDLE"
            state.active_request_id = None
            state.tool_future = None
            await manager.broadcast_state(session_id, state)
            return MessageResponse(
                status="need_city",
                turn_id=state.turn_id,
                interrupt_type=classified,
                transcript=transcript or text,
                reply_lang=state.reply_lang,
                need_city=True,
            )
        state.current_task = {
            "type": "restaurant",
            "tool": "search_restaurants",
            "raw": text or "",
            "tool_call_id": request_id,
            "params": tool_params,
        }
        state.history.append({"role": "user", "kind": "text", "text": text or ""})
        state.tool_future = asyncio.create_task(
            _run_search_restaurants(session_id, state.turn_id, request_id, tool_params)
        )
    else:
        merge_from = (
            prev
            if same_kind
            else ({k: prev[k] for k in ("city", "veg_only") if k in prev} if prev else None)
        )
        tool_params = parse_hotel_params(
            text or "",
            merge_from,
            default_city=default_city,
        )
        if tool_params.get("city_required") or not tool_params.get("city"):
            state.tool_status = "IDLE"
            state.active_request_id = None
            state.tool_future = None
            await manager.broadcast_state(session_id, state)
            return MessageResponse(
                status="need_city",
                turn_id=state.turn_id,
                interrupt_type=classified,
                transcript=transcript or text,
                reply_lang=state.reply_lang,
                need_city=True,
            )
        # Budget ask is FE-only (optional). Default budget=5000 keeps tools interruptible in tests.
        state.current_task = {
            "type": "hotel",
            "tool": "search_hotels",
            "raw": text or "",
            "tool_call_id": request_id,
            "params": tool_params,
        }
        state.history.append({"role": "user", "kind": "text", "text": text or ""})
        state.tool_future = asyncio.create_task(
            _run_search_hotels(session_id, state.turn_id, request_id, tool_params)
        )

    log_event(
        "tool_started",
        session_id=session_id,
        turn_id=state.turn_id,
        tool_id=request_id,
    )
    await manager.broadcast_state(session_id, state)

    return MessageResponse(
        status="ok",
        turn_id=state.turn_id,
        interrupt_type=classified,
        active_request_id=request_id,
        transcript=transcript or text,
        reply_lang=state.reply_lang,
    )


@app.get("/status", response_model=StatusResponse)
async def get_status(session_id: str):
    state = get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    data = state.to_dict()
    return StatusResponse(
        session_id=data["session_id"],
        turn_id=data["turn_id"],
        tool_status=data["tool_status"],
        stale_discarded=data["stale_discarded"],
        last_interrupt_type=data["last_interrupt_type"],
        active_request_id=data["active_request_id"],
        reply_lang=data.get("reply_lang"),
    )


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate():
    """Point judges at the latest harness output (run compute_metrics.py to refresh)."""
    candidates = [
        Path(__file__).resolve().parents[2] / "evaluation" / "results.json",
        Path(__file__).resolve().parents[1] / "evaluation" / "results.json",
    ]
    for path in candidates:
        if path.is_file():
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                break
            passed = payload.get("passed")
            total = payload.get("scenario_count")
            return EvaluateResponse(
                status="ok",
                message=f"Harness results ready: {passed}/{total} passed. GET /evaluate/results for full JSON.",
            )
    return EvaluateResponse(
        status="missing",
        message="No results.json yet — run: python evaluation/compute_metrics.py",
    )


@app.get("/evaluate/results")
async def evaluate_results():
    """Serve evaluation/results.json written by compute_metrics.py."""
    candidates = [
        Path(__file__).resolve().parents[2] / "evaluation" / "results.json",
        Path(__file__).resolve().parents[1] / "evaluation" / "results.json",
    ]
    for path in candidates:
        if path.is_file():
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=500, detail=f"Invalid results.json: {exc}") from exc
            return JSONResponse(payload)
    raise HTTPException(
        status_code=404,
        detail="results.json not found — run: python evaluation/compute_metrics.py",
    )


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    reply_lang: Optional[str] = Field(default=None, description="en | hi")


@app.post("/tts")
async def synthesize_speech(body: TtsRequest):
    """Return Rime TTS audio bytes (audio/mpeg) for Web Audio playback."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    lang = (body.reply_lang or "en").strip().lower()
    if lang not in {"en", "hi"}:
        lang = "en"

    try:
        audio = await rime_speak(text, reply_lang=lang)
    except Exception as exc:
        log_event("tts_failed")
        raise HTTPException(
            status_code=502,
            detail="Voice service is temporarily unavailable — please try again in a moment."
        ) from exc

    if not audio:
        raise HTTPException(status_code=502, detail="Rime returned empty audio")

    log_event("tts_ok")
    return Response(content=audio, media_type="audio/mpeg")


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    state = get_session(session_id)
    if not state:
        await websocket.close(code=4004)
        return

    await manager.connect(session_id, websocket)
    log_event("websocket_connected", session_id=session_id)
    try:
        await manager.broadcast_state(session_id, state)
        while True:
            # Keepalive / client pings — server pushes on state changes
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id)
        log_event("websocket_disconnected", session_id=session_id)
