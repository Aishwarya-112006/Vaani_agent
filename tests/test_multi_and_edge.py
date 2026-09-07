"""
test_multi_and_edge.py — T24 (MULTI) and T25 (EDGE).

These two scenarios exist in evaluation/scenarios.json and Section 11 of
the guide, but no ticket (QA-02 through QA-07) was ever assigned to cover
them -- a genuine gap in the original ticket list, not something skipped
here on purpose.
"""

import asyncio

import pytest

from conftest import send_text, get_status, wait_for_status
from agent.state import get_session


@pytest.mark.asyncio
async def test_t24_three_rapid_corrections(client, session_id, results_recorder):
    """
    T24: three rapid REFINE corrections in a row. Final state should
    reflect ALL of them, not just the last one applied (since
    parse_hotel_params merges into prev_params rather than replacing).
    """
    r1 = await send_text(client, session_id, "Find hotels in Delhi")
    assert r1.status_code == 200, r1.text
    await asyncio.sleep(0.1)

    r2 = await send_text(client, session_id, "Under 5000")
    assert r2.status_code == 200, r2.text
    await asyncio.sleep(0.1)

    r3 = await send_text(client, session_id, "Near a metro")
    assert r3.status_code == 200, r3.text
    await asyncio.sleep(0.1)

    r4 = await send_text(client, session_id, "Vegetarian friendly too")
    assert r4.status_code == 200, r4.text

    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=12.0)  # let the final tool call complete
    state = get_session(session_id)
    params = state.current_task.get("params", {})

    assert params.get("city") == "Delhi", f"T24: city constraint lost -- final params: {params}"
    assert params.get("budget") == 5000, f"T24: budget constraint lost -- final params: {params}"
    assert params.get("near_metro") is True, f"T24: metro constraint lost -- final params: {params}"
    assert params.get("veg_only") is True, f"T24: veg constraint lost -- final params: {params}"

    results_recorder.record("T24", passed=True, interrupt_type="MULTI", final_params=params)


@pytest.mark.asyncio
async def test_t25_interrupt_before_tool_starts(client, session_id, results_recorder):
    """
    T25: user sends a second message essentially immediately after the
    first, before the first tool call has had any real chance to run.
    Expected: graceful handling, no crash, no double-counted stale results.
    """
    r1 = await send_text(client, session_id, "Find hotels in")
    assert r1.status_code == 200, r1.text

    # No sleep at all -- fire the second message as fast as possible
    r2 = await send_text(client, session_id, "Delhi, under 5000 rupees")
    assert r2.status_code == 200, f"T25: backend crashed on rapid-fire messages: {r2.text}"

    status = await wait_for_status(client, session_id, {"COMPLETE", "CANCELLED"}, timeout=12.0)

    assert status["tool_status"] in ("COMPLETE", "CANCELLED"), (
        f"T25: backend left in an unexpected state after near-simultaneous messages: {status['tool_status']!r}"
    )
    results_recorder.record("T25", passed=True, interrupt_type="EDGE", final_status=status["tool_status"])