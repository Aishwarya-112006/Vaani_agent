"""
conftest.py — real integration tests against the live FastAPI app.

Unlike the earlier mock-based version, this hits the ACTUAL /session and
/message endpoints in main.py directly (in-process, no real network call,
via httpx's ASGITransport). No Groq/Rime API calls happen because we pass
`text` in the request instead of `audio`, which skips the STT step
entirely, and the current /message route doesn't call the LLM classifier
either — it uses inline regex.
"""

import json
import sys
import time
from pathlib import Path

import pytest
import pytest_asyncio
import httpx

# The real backend expects to be run with `backend/` on sys.path (main.py
# does `from agent.state import ...` as an absolute import, and
# `from .models import ...` as relative within the api package).
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.main import app          # noqa: E402
from agent.state import get_session  # noqa: E402

EVALUATION_DIR = Path(__file__).parent.parent / "evaluation"
SCENARIOS_PATH = EVALUATION_DIR / "scenarios.json"
# NOTE: deliberately NOT "results.json" -- that filename already exists in
# this repo's evaluation/ folder as the team's own self-authored evaluation
# output. Writing to the same path would silently overwrite their file.
# This suite's output gets its own name instead.
RESULTS_PATH = EVALUATION_DIR / "qa_independent_results.json"


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def session_id(client):
    resp = await client.post("/session")
    assert resp.status_code == 200, resp.text
    return resp.json()["session_id"]


async def send_text(client, session_id, text, interrupt_type=None):
    """Helper: POST /message with a text field (no audio -> no STT/Groq call).

    E2: Do NOT pass interrupt_type in normal scenarios — the backend must
    classify from text. Only pass interrupt_type for explicit override tests
    (none of the scored suite should feed it).
    """
    data = {"session_id": session_id, "text": text}
    if interrupt_type:
        data["interrupt_type"] = interrupt_type
    resp = await client.post("/message", data=data)
    return resp


# --- Issue #25: mock audio input -------------------------------------
# A minimal, valid-enough WAV file (44-byte header, silent, 8kHz mono)
# so tests can exercise the /message audio upload path without needing a
# real microphone recording or a real Groq STT call.
_SILENT_WAV_BYTES = (
    b"RIFF" + (36).to_bytes(4, "little") + b"WAVEfmt "
    + (16).to_bytes(4, "little")
    + (1).to_bytes(2, "little")   # PCM
    + (1).to_bytes(2, "little")   # mono
    + (8000).to_bytes(4, "little")   # sample rate
    + (8000).to_bytes(4, "little")   # byte rate
    + (1).to_bytes(2, "little")   # block align
    + (8).to_bytes(2, "little")   # bits per sample
    + b"data" + (0).to_bytes(4, "little")
)


@pytest.fixture
def mock_audio_bytes():
    """Raw bytes for a tiny, silent, valid WAV clip -- use with send_audio()."""
    return _SILENT_WAV_BYTES


async def send_audio(client, session_id, audio_bytes=None, filename="clip.wav"):
    """
    Helper: POST /message with an audio file instead of text, exercising
    the real STT code path (groq_transcribe). NOTE: against the real
    backend this requires a valid GROQ_API_KEY and will make a real
    (free-tier) Groq call, since STT is not mocked out at the route level.
    Tests using this should expect to skip gracefully if no key is set.
    """
    audio_bytes = audio_bytes or _SILENT_WAV_BYTES
    files = {"audio": (filename, audio_bytes, "audio/wav")}
    data = {"session_id": session_id}
    resp = await client.post("/message", data=data, files=files)
    return resp


async def get_status(client, session_id):
    resp = await client.get("/status", params={"session_id": session_id})
    return resp


async def wait_for_status(client, session_id, target_statuses, timeout=12.0, poll_interval=0.25):
    """
    Poll /status until tool_status is one of target_statuses, or timeout.
    Using a fixed sleep() before checking status is fragile -- the real
    backend's artificial delay has changed at least once already (was
    ~1.5s in earlier testing, now runs ~3.5-4s), so any fixed wait will
    eventually go stale again. Polling adapts automatically regardless of
    how long the artificial delay actually is.
    Returns the last /status JSON seen (even on timeout, so callers can
    still assert against whatever the final state was).
    """
    import asyncio
    elapsed = 0.0
    last = None
    while elapsed < timeout:
        resp = await get_status(client, session_id)
        last = resp.json()
        if last["tool_status"] in target_statuses:
            return last
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
    return last


@pytest.fixture(scope="session")
def scenarios():
    if not SCENARIOS_PATH.exists():
        pytest.skip(f"scenarios.json not found at {SCENARIOS_PATH}")
    with open(SCENARIOS_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="session")
def results_recorder():
    records = []

    class Recorder:
        def record(self, scenario_id, **fields):
            records.append({"scenario_id": scenario_id, "timestamp": time.time(), **fields})

        def all(self):
            return records

    recorder = Recorder()
    yield recorder

    EVALUATION_DIR.mkdir(exist_ok=True)
    with open(RESULTS_PATH, "w") as f:
        json.dump(recorder.all(), f, indent=2)