"""
test_cancel.py (QA-04) — T12-T14, against the REAL backend.

Confirmed from main.py: CANCEL increments turn_id, sets tool_status to
CANCELLED, clears current_task and active_request_id, and cancels the
in-flight tool future. It does NOT speak anything (no Rime call anywhere
in this route) — that's a real gap versus the guide's "Rime acknowledges"
requirement, and these tests reflect that honestly rather than papering
over it.

CANCEL-EXTRA-1 and CANCEL-EXTRA-2 are QA-authored additions beyond the
canonical T12-T14 (scenarios.json only defines 3 CANCEL scenarios; #28
asks for 5 total). They deliberately use IDs outside the T01-T25 range so
they never get folded into the official 25-scenario run (#32) or its
metrics (#33) -- they're extra regression coverage, not part of the
scored suite.
"""

import asyncio

import pytest

from conftest import send_text, get_status
from agent.state import get_session

CANCEL_CASES = [
    ("T12", "Find hotels in Delhi", "Forget it"),
    ("T13", "Find hotels in Delhi", "Never mind"),
    ("T14", "Search hotels in Bangalore", "Stop searching"),
    # CANCEL-EXTRA-1: bare "cancel" — _classify_interrupt's regex
    # (forget it|never mind|stop searching|cancel|stop it) lists "cancel"
    # as its own trigger word, but none of T12-T14 actually send it. This
    # closes that literal coverage gap, and on a restaurant task (T12/T14
    # are hotel, T13 is restaurant) to keep tool-type coverage even.
    ("CANCEL-EXTRA-1", "Search restaurants in Mumbai", "Cancel"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_id,first_text,cancel_text", CANCEL_CASES)
async def test_cancel_abandons_task(client, session_id, results_recorder, scenario_id, first_text, cancel_text):
    first = await send_text(client, session_id, first_text)
    assert first.status_code == 200, first.text
    turn_before = first.json()["turn_id"]

    await asyncio.sleep(0.1)  # let the tool actually start (3-4s artificial delay)

    second = await send_text(client, session_id, cancel_text)
    assert second.status_code == 200, second.text
    body = second.json()

    assert body["interrupt_type"] == "CANCEL", (
        f"{scenario_id}: expected CANCEL, backend classified as {body['interrupt_type']!r}"
    )
    assert body["turn_id"] == turn_before + 1
    assert body["active_request_id"] is None

    status = (await get_status(client, session_id)).json()
    assert status["tool_status"] == "CANCELLED"

    state = get_session(session_id)
    assert state.current_task == {}

    # Confirm the cancelled tool never sneaks a result through afterward.
    # NOTE: a properly cancelled asyncio.Task raises CancelledError at its
    # next await point and is caught by _run_search_hotels's except block,
    # which returns WITHOUT touching stale_discarded. So the correct,
    # clean outcome here is tool_status staying CANCELLED (not flipping to
    # COMPLETE) -- stale_discarded incrementing is only expected if
    # cancellation raced and lost, which would itself be a bug worth flagging.
    await asyncio.sleep(2.0)
    status_after = (await get_status(client, session_id)).json()
    assert status_after["tool_status"] == "CANCELLED", (
        f"{scenario_id}: cancelled tool still completed and overwrote state "
        f"(tool_status={status_after['tool_status']!r}) -- cancellation didn't take effect in time"
    )

    results_recorder.record(
        scenario_id, passed=True, interrupt_type="CANCEL",
        note="backend speaks nothing on CANCEL (no Rime call in this route yet)"
    )


@pytest.mark.asyncio
async def test_cancel_after_refine_chain(client, session_id, results_recorder):
    """
    CANCEL-EXTRA-2 (chained interrupt): hotel search -> REFINE -> CANCEL.

    T12-T14 and CANCEL-EXTRA-1 only ever CANCEL a task's *first* tool run.
    This chains a REFINE in first, so the CANCEL has to correctly stop the
    REFINE's re-spawned asyncio task (not the original one), turn_id has
    to advance twice, and the REFINE's in-flight tool must not be allowed
    to complete late and overwrite state after the CANCEL already moved
    the conversation forward. This is the same class of bug the stale-fence
    suite (#31) checks for, just via CANCEL instead of a third search.
    """
    first = await send_text(client, session_id, "Find hotels in Delhi under ₹5000")
    assert first.status_code == 200, first.text
    turn0 = first.json()["turn_id"]

    await asyncio.sleep(0.1)

    refine = await send_text(client, session_id, "actually under ₹3000")
    assert refine.status_code == 200, refine.text
    refine_body = refine.json()
    assert refine_body["interrupt_type"] == "REFINE", (
        f"expected REFINE, backend classified as {refine_body['interrupt_type']!r}"
    )
    assert refine_body["turn_id"] == turn0 + 1

    await asyncio.sleep(0.1)  # let the REFINE's re-spawned tool actually start

    cancel = await send_text(client, session_id, "forget it")
    assert cancel.status_code == 200, cancel.text
    cancel_body = cancel.json()
    assert cancel_body["interrupt_type"] == "CANCEL", (
        f"expected CANCEL, backend classified as {cancel_body['interrupt_type']!r}"
    )
    assert cancel_body["turn_id"] == turn0 + 2
    assert cancel_body["active_request_id"] is None

    status = (await get_status(client, session_id)).json()
    assert status["tool_status"] == "CANCELLED"

    state = get_session(session_id)
    assert state.current_task == {}

    # The REFINE's tool was running under turn_id = turn0+1; it must not
    # complete late and clobber state now that CANCEL has moved on to turn0+2.
    await asyncio.sleep(2.0)
    status_after = (await get_status(client, session_id)).json()
    assert status_after["tool_status"] == "CANCELLED", (
        "REFINE's in-flight tool completed after CANCEL and overwrote state "
        f"(tool_status={status_after['tool_status']!r})"
    )

    results_recorder.record(
        "CANCEL-EXTRA-2", passed=True, interrupt_type="CANCEL",
        note="chained REFINE->CANCEL: verifies fencing survives two interrupts in a row"
    )