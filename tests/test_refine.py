"""
test_refine.py (QA-03) — T04-T11 (8 scenarios: 5 budget + 3 location),
against the REAL backend's regex-based classifier and REFINE code path.

Real behaviour confirmed from main.py: REFINE and a fresh request take the
SAME code path at the bottom of /message — there's no special REFINE
branch. What actually distinguishes "REFINE" is that `_classify_interrupt`
returns "REFINE" (when tool_status=="RUNNING" and the text matches certain
keywords), which main.py returns as `interrupt_type` in the response, but
functionally it just reruns search_hotels with re-parsed params (merged
with the previous ones via `parse_hotel_params(text, prev_params)`).
"""

import asyncio

import pytest

from conftest import send_text, get_status
from agent.state import get_session

REFINE_BUDGET_CASES = [
    ("T04", "Find hotels in Delhi", "Actually, under 3000 rupees only"),
    ("T05", "Find hotels in Mumbai", "Make it under 5000"),
    ("T06", "Find hotels in Bangalore", "Keep it under 4000 rupees"),
    ("T07", "Search hotels in Delhi", "Under 2500 please"),
    ("T08", "Find a hotel in Delhi", "Actually make it vegetarian and under 5000"),
]

REFINE_LOCATION_CASES = [
    ("T09", "Find hotels in Delhi", "Near a metro station"),
    ("T10", "Find hotels nearby", "Somewhere near the metro"),
    ("T11", "Search hotels in Mumbai", "Actually near a metro instead"),
]


async def _run_refine_case(client, session_id, first_text, refine_text):
    first = await send_text(client, session_id, first_text)
    assert first.status_code == 200, first.text
    turn_after_first = first.json()["turn_id"]

    # Give the tool a moment to start (it has a 1.5s artificial delay)
    await asyncio.sleep(0.1)

    second = await send_text(client, session_id, refine_text)
    assert second.status_code == 200, second.text
    body = second.json()
    return turn_after_first, body


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_id,first_text,refine_text", REFINE_BUDGET_CASES)
async def test_refine_budget_constraint(client, session_id, results_recorder, scenario_id, first_text, refine_text):
    turn_before, body = await _run_refine_case(client, session_id, first_text, refine_text)

    assert body["interrupt_type"] == "REFINE", (
        f"{scenario_id}: expected REFINE, backend classified as {body['interrupt_type']!r}"
    )
    assert body["turn_id"] == turn_before + 1

    state = get_session(session_id)
    assert "budget" in state.current_task.get("params", {}) or "veg_only" in state.current_task.get("params", {})
    results_recorder.record(scenario_id, passed=True, interrupt_type="REFINE")


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_id,first_text,refine_text", REFINE_LOCATION_CASES)
async def test_refine_location_constraint(client, session_id, results_recorder, scenario_id, first_text, refine_text):
    turn_before, body = await _run_refine_case(client, session_id, first_text, refine_text)

    assert body["interrupt_type"] == "REFINE", (
        f"{scenario_id}: expected REFINE, backend classified as {body['interrupt_type']!r}"
    )
    assert body["turn_id"] == turn_before + 1

    state = get_session(session_id)
    assert state.current_task.get("params", {}).get("near_metro") is True
    results_recorder.record(scenario_id, passed=True, interrupt_type="REFINE")
