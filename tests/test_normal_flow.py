"""
test_normal_flow.py (QA-02) — T01-T03, against the REAL backend.

T01/T02 hit /message and wait for tool COMPLETE.
T03 checks tool routing (hotel vs restaurant) via the live regex path —
the Groq LLM classifier in agent.pipeline is optional and not wired into
/message yet.
"""

import asyncio

import pytest

from conftest import send_text, get_status, wait_for_status
from agent.state import get_session


@pytest.mark.asyncio
async def test_t01_single_hotel_search_no_interruption(client, session_id, results_recorder):
    start = asyncio.get_event_loop().time()
    resp = await send_text(client, session_id, "Find me hotels in Delhi under 5000 rupees")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["turn_id"] == 1
    assert body["interrupt_type"] is None  # fresh request, nothing to interrupt yet

    status = await wait_for_status(client, session_id, {"COMPLETE"}, timeout=12.0)
    assert status["tool_status"] == "COMPLETE", "Tool never completed"

    elapsed_ms = (asyncio.get_event_loop().time() - start) * 1000
    assert status["stale_discarded"] == 0
    results_recorder.record("T01", passed=True, latency_ms=elapsed_ms)


@pytest.mark.asyncio
async def test_t02_single_restaurant_search_no_interruption(client, session_id, results_recorder):
    resp = await send_text(client, session_id, "Find me restaurants in Connaught Place")
    assert resp.status_code == 200, resp.text

    status = await wait_for_status(client, session_id, {"COMPLETE"}, timeout=12.0)
    assert status["tool_status"] == "COMPLETE"

    state = get_session(session_id)
    assert state.current_task.get("type") == "restaurant", (
        f"Expected a restaurant task, got: {state.current_task}"
    )
    assert state.current_task.get("tool") == "search_restaurants"
    results_recorder.record("T02", passed=True, note="restaurant tool routed correctly")


@pytest.mark.asyncio
async def test_t03_tool_selection_routing(client, session_id, results_recorder):
    """
    Live /message routing (regex), not the unwired Groq classify_intent.
    South Indian food → restaurants; hotel phrasing → hotels.
    """
    food = await send_text(client, session_id, "I want South Indian food near Saket")
    assert food.status_code == 200, food.text
    state = get_session(session_id)
    assert state.current_task.get("type") == "restaurant", state.current_task
    assert state.current_task.get("tool") == "search_restaurants"

    await wait_for_status(client, session_id, {"COMPLETE", "CANCELLED"}, timeout=12.0)

    # New session utterance via same session after complete — hotel path
    hotel = await send_text(client, session_id, "Find hotels in Delhi under ₹4000")
    assert hotel.status_code == 200, hotel.text
    state = get_session(session_id)
    assert state.current_task.get("type") == "hotel", state.current_task
    assert state.current_task.get("tool") == "search_hotels"

    results_recorder.record(
        "T03",
        passed=True,
        note="tool selection via /message regex routing (pipeline.classify_intent still unwired)",
    )
