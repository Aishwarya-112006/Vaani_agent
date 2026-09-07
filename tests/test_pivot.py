"""
test_pivot.py (QA-06) — T18-T20, against the REAL backend.

Current backend:
- `_classify_interrupt` returns PIVOT for hotel↔restaurant domain switches
- `_resolve_tool_kind` then runs `search_restaurants` or `search_hotels`

Unsupported domains (cab / flights) are NOT pivots today — those utterances
are covered as intentional non-matches elsewhere, not as T19/T20.
"""

import asyncio

import pytest

from conftest import send_text
from agent.state import get_session

PIVOT_CASES = [
    (
        "T18",
        "Find hotels in Delhi",
        "Actually, find me restaurants instead",
        "restaurant",
        "search_restaurants",
    ),
    (
        "T19",
        "Find restaurants in Connaught Place",
        "Find hotels instead",
        "hotel",
        "search_hotels",
    ),
    (
        "T20",
        "Find hotels in Delhi under ₹5000",
        "Forget hotels — find restaurants there instead",
        "restaurant",
        "search_restaurants",
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario_id,first_text,pivot_text,expected_type,expected_tool",
    PIVOT_CASES,
)
async def test_pivot_is_classified_correctly(
    client,
    session_id,
    results_recorder,
    scenario_id,
    first_text,
    pivot_text,
    expected_type,
    expected_tool,
):
    first = await send_text(client, session_id, first_text)
    assert first.status_code == 200, first.text
    turn_before = first.json()["turn_id"]

    await asyncio.sleep(0.1)

    second = await send_text(client, session_id, pivot_text)
    assert second.status_code == 200, second.text
    body = second.json()

    assert body["interrupt_type"] == "PIVOT", (
        f"{scenario_id}: expected PIVOT classification, got {body['interrupt_type']!r}"
    )
    assert body["turn_id"] == turn_before + 1

    state = get_session(session_id)
    assert state.current_task.get("type") == expected_type, (
        f"{scenario_id}: expected task type {expected_type!r}, got {state.current_task}"
    )
    assert state.current_task.get("tool") == expected_tool, (
        f"{scenario_id}: expected tool {expected_tool!r}, got {state.current_task}"
    )

    results_recorder.record(
        scenario_id,
        passed=True,
        note=f"PIVOT → {expected_tool}",
    )
