"""
test_status.py (QA-05) — T15-T17, against the REAL backend.

Confirmed from main.py: STATUS is only handled specially when
tool_status == "RUNNING". In that case it does NOT increment turn_id
(unlike the earlier state.py mock/dead-code, which did) and does NOT
cancel the running tool. It also speaks nothing (no Rime call). This is
actually BETTER than the guide's dead-code path in state.py -- it avoids
the turn_id/stale-fence edge case I flagged earlier, since STATUS never
touches turn_id at all here.
"""

import asyncio

import pytest

from conftest import send_text, get_status, wait_for_status

STATUS_CASES = [
    ("T15", "Find hotels in Delhi", "What are you searching for?"),
    ("T16", "Search hotels in Mumbai", "Are you still looking?"),
    ("T17", "Find hotels in Bangalore", "What's the status?"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_id,first_text,status_text", STATUS_CASES)
async def test_status_does_not_cancel_running_tool(client, session_id, results_recorder, scenario_id, first_text, status_text):
    first = await send_text(client, session_id, first_text)
    assert first.status_code == 200, first.text
    turn_before = first.json()["turn_id"]
    request_id_before = first.json()["active_request_id"]

    await asyncio.sleep(0.1)  # tool should still be RUNNING (1.5s artificial delay)

    second = await send_text(client, session_id, status_text)
    assert second.status_code == 200, second.text
    body = second.json()

    assert body["interrupt_type"] == "STATUS", (
        f"{scenario_id}: expected STATUS, backend classified as {body['interrupt_type']!r}"
    )
    # Non-cancellation checks -- this metric MUST be 100%
    assert body["turn_id"] == turn_before, f"{scenario_id}: STATUS incorrectly changed turn_id"
    assert body["active_request_id"] == request_id_before, f"{scenario_id}: STATUS disturbed the active request"

    status_mid = (await get_status(client, session_id)).json()
    assert status_mid["tool_status"] == "RUNNING", f"{scenario_id}: STATUS incorrectly stopped the tool"

    # Let the original tool finish and confirm it still lands as a real result.
    # Poll instead of a fixed sleep -- the artificial delay varies (was
    # ~1.5s, now runs ~3.5-4s), so a fixed wait is fragile.
    status_after = await wait_for_status(client, session_id, {"COMPLETE"}, timeout=12.0)
    assert status_after["tool_status"] == "COMPLETE", (
        f"{scenario_id}: original tool never completed after a STATUS interrupt "
        f"(still {status_after['tool_status']!r} after waiting)"
    )
    assert status_after["stale_discarded"] == 0

    results_recorder.record(
        scenario_id, passed=True, interrupt_type="STATUS",
        note="backend speaks nothing on STATUS (no Rime call in this route yet)"
    )