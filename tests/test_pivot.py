"""
test_pivot.py (QA-06) — T18-T20, against the REAL backend.

IMPORTANT FINDING: _classify_interrupt() in main.py CAN return "PIVOT"
(when the running task_type is "hotel" and the text mentions
restaurant/food/eat/dinner/cafe). BUT there's no dedicated PIVOT branch
in /message -- after classification it falls through to the same bottom
code block as REFINE/fresh-request, which ALWAYS builds
`{"type": "hotel", "tool": "search_hotels", ...}` regardless of what the
classifier said. So PIVOT gets correctly *labeled* in the response, but
the backend still runs a hotel search even when the user asked for
something else entirely. These tests check the spec (a real new task
should run) and are expected to fail on that second assertion until a
real PIVOT branch and a second tool exist -- that's a genuine gap, not a
test bug.

SECOND FINDING: _classify_interrupt()'s PIVOT branch only recognizes
hotel<->restaurant keyword switches (restaurant|food|eat|dinner|cafe, or
"hotel"). It has no concept of cab or flight pivots at all. So T19
("find me a cab") and T20 ("search for flights") won't even be classified
as PIVOT -- T19 falls through to `None` (no keyword matches anything),
and T20 gets misclassified as REFINE (because "actually" is in the REFINE
keyword list and gets checked before... actually AFTER the PIVOT check,
but PIVOT doesn't match first, so it falls to REFINE's check next, which
DOES match "actually"). Both are asserted to spec below and will fail
with a clear message -- that's intentional, not a mistake in these tests.
"""

import asyncio

import pytest

from conftest import send_text, get_status
from agent.state import get_session

PIVOT_CASES = [
    ("T18", "Find hotels in Delhi", "Actually, find me restaurants instead"),
    ("T19", "Search hotels in Mumbai", "Find me a cab, not a hotel"),
    ("T20", "Find hotels in Delhi", "Actually search for flights to Mumbai instead"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_id,first_text,pivot_text", PIVOT_CASES)
async def test_pivot_is_classified_correctly(client, session_id, results_recorder, scenario_id, first_text, pivot_text):
    first = await send_text(client, session_id, first_text)
    assert first.status_code == 200, first.text
    turn_before = first.json()["turn_id"]

    await asyncio.sleep(0.1)

    second = await send_text(client, session_id, pivot_text)
    assert second.status_code == 200, second.text
    body = second.json()

    # This part of the spec IS met: classification works
    assert body["interrupt_type"] == "PIVOT", (
        f"{scenario_id}: expected PIVOT classification, got {body['interrupt_type']!r}"
    )
    assert body["turn_id"] == turn_before + 1

    # This part is the real gap: the executed task should match the new
    # intent, not still be a hotel search
    state = get_session(session_id)
    assert state.current_task.get("type") != "hotel", (
        f"{scenario_id}: PIVOT was classified correctly but the backend still "
        f"ran a hotel search -- no real task-switching logic exists yet for PIVOT"
    )

    results_recorder.record(
        scenario_id, passed=True,
        note="PIVOT classified and executed correctly (hotel<->restaurant swap works via _resolve_tool_kind)"
    )
