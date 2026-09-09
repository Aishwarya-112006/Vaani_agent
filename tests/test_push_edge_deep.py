"""Deep mock-data edge cases for push readiness (ASGI, USE_LIVE_PLACES forced off)."""

from __future__ import annotations

import asyncio

import pytest

from conftest import get_status, send_text, wait_for_status
from agent.state import get_session
from tools.cities import extract_city
from tools.hotel_search import parse_hotel_params
from tools.restaurant_search import parse_restaurant_params


# --- Unit: city / param pollution (mock strings judges type) ---------------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("Find hotels in Delhi under 5000", "Delhi"),
        ("Actually wait near metro in Mumbai", "Mumbai"),  # last city wins
        ("hotels in Bangalore", "Bangalore"),
        ("Actually, near metro", None),  # must NOT invent city=Actually
        ("metro", None),
        ("near metro", None),
        ("Forget it", None),
        ("What is Connaught Place?", None),
    ],
)
def test_extract_city_rejects_interrupt_noise(text, expected):
    assert extract_city(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Actually, near metro",
        "Wait, under 3000",
        "Near metro please",
    ],
)
def test_hotel_parse_refine_does_not_set_bogus_city(text):
    prev = {"city": "Delhi", "budget": 5000}
    out = parse_hotel_params(text, prev)
    assert out.get("city") == "Delhi", out
    assert out.get("city") not in {"Actually", "Wait", "Near", "metro"}


def test_restaurant_parse_metro_from_refine():
    prev = {"city": "Mumbai", "veg_only": False}
    out = parse_restaurant_params("Actually near metro", prev)
    assert out.get("city") == "Mumbai"
    assert out.get("near_metro") is True


# --- Integration: mock inventory search + interrupts ----------------------

@pytest.mark.asyncio
async def test_mock_hotel_search_returns_named_inventory(client, session_id):
    r = await send_text(client, session_id, "Find hotels in Delhi under 5000")
    assert r.status_code == 200
    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=14.0)
    state = get_session(session_id)
    result = state.last_tool_result or {}
    assert result.get("source") == "mock"
    rows = result.get("results") or []
    assert len(rows) >= 1
    assert all(isinstance(x.get("name"), str) and x["name"] for x in rows)


@pytest.mark.asyncio
async def test_mock_refine_budget_then_metro(client, session_id):
    await send_text(client, session_id, "Find hotels in Delhi under 8000")
    await asyncio.sleep(0.15)
    await send_text(client, session_id, "Actually under 4000")
    await asyncio.sleep(0.15)
    await send_text(client, session_id, "Near metro")
    status = await wait_for_status(client, session_id, {"COMPLETE"}, timeout=16.0)
    state = get_session(session_id)
    params = state.current_task.get("params", {})
    assert params.get("city") == "Delhi"
    assert params.get("budget") == 4000
    assert params.get("near_metro") is True
    assert status["tool_status"] == "COMPLETE"
    assert (state.last_tool_result or {}).get("source") == "mock"


@pytest.mark.asyncio
async def test_mock_cancel_mid_search(client, session_id):
    await send_text(client, session_id, "Find hotels in Jaipur under 5000")
    await asyncio.sleep(0.05)
    r = await send_text(client, session_id, "Forget it")
    assert r.status_code == 200
    assert r.json().get("interrupt_type") == "CANCEL"
    status = await wait_for_status(client, session_id, {"CANCELLED", "COMPLETE"}, timeout=12.0)
    assert status["tool_status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_mock_status_does_not_fence(client, session_id):
    await send_text(client, session_id, "Find hotels in Delhi under 5000")
    await asyncio.sleep(0.1)
    before = (await get_status(client, session_id)).json()
    turn_before = before["turn_id"]
    r = await send_text(client, session_id, "What are you searching for?")
    assert r.json().get("interrupt_type") == "STATUS"
    await asyncio.sleep(0.2)
    mid = (await get_status(client, session_id)).json()
    assert mid["turn_id"] == turn_before
    assert mid["tool_status"] in ("RUNNING", "COMPLETE")
    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=14.0)


@pytest.mark.asyncio
async def test_mock_fact_aside_search_continues(client, session_id):
    await send_text(client, session_id, "Find hotels in Delhi under 5000")
    await asyncio.sleep(0.1)
    turn_before = (await get_status(client, session_id)).json()["turn_id"]
    r = await send_text(client, session_id, "What is Connaught Place?")
    body = r.json()
    assert body.get("interrupt_type") == "FACT"
    assert body.get("fact_summary")
    await asyncio.sleep(0.15)
    mid = (await get_status(client, session_id)).json()
    assert mid["turn_id"] == turn_before
    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=14.0)


@pytest.mark.asyncio
async def test_mock_pivot_hotel_to_restaurant(client, session_id):
    await send_text(client, session_id, "Find hotels in Mumbai under 6000")
    await asyncio.sleep(0.15)
    r = await send_text(client, session_id, "Find restaurants instead")
    assert r.json().get("interrupt_type") == "PIVOT"
    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=16.0)
    state = get_session(session_id)
    assert state.current_task.get("type") == "restaurant"
    result = state.last_tool_result or {}
    assert result.get("source") == "mock"
    rows = result.get("results") or []
    assert len(rows) >= 1


@pytest.mark.asyncio
async def test_mock_emptyish_and_hinglish_cancel(client, session_id):
    await send_text(client, session_id, "Delhi mein hotels dhoondo under 5000")
    await asyncio.sleep(0.1)
    r = await send_text(client, session_id, "chhod do")
    assert r.status_code == 200
    status = await wait_for_status(
        client, session_id, {"CANCELLED", "COMPLETE", "RUNNING"}, timeout=14.0
    )
    assert status["tool_status"] in ("CANCELLED", "COMPLETE", "RUNNING")


@pytest.mark.asyncio
async def test_session_city_override(client, session_id):
    r = await client.post(f"/session/{session_id}/city", json={"city": "Pune"})
    assert r.status_code == 200
    assert r.json()["preferred_city"] == "Pune"
    state = get_session(session_id)
    assert state.preferred_city == "Pune"
