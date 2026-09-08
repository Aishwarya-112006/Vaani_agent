"""
test_fact.py (E1) — FACT interrupt against the live FastAPI app.

FACT must answer a side question (Wikipedia summary when available) without
cancelling an in-flight hotel/restaurant tool.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from conftest import get_status, send_text, wait_for_status


@pytest.mark.asyncio
async def test_fact_does_not_cancel_running_tool(client, session_id, results_recorder):
    first = await send_text(client, session_id, "Find hotels in Delhi under 5000")
    assert first.status_code == 200, first.text
    assert first.json().get("active_request_id")

    await asyncio.sleep(0.15)

    with patch(
        "api.main.fetch_wiki_summary",
        new=AsyncMock(return_value="Connaught Place is a business centre in New Delhi."),
    ):
        fact = await send_text(client, session_id, "What is Connaught Place?")
    assert fact.status_code == 200, fact.text
    body = fact.json()
    assert body["interrupt_type"] == "FACT"
    assert body.get("fact_summary")
    assert "Connaught" in (body.get("fact_summary") or "")

    # Tool must still be running (or complete later) — not CANCELLED by FACT
    status = (await get_status(client, session_id)).json()
    assert status["tool_status"] in ("RUNNING", "COMPLETE")
    assert status["tool_status"] != "CANCELLED"

    await wait_for_status(client, session_id, {"COMPLETE"}, timeout=12.0)
    results_recorder.record(
        "FACT-01",
        passed=True,
        interrupt_type="FACT",
        note="FACT aside did not cancel hotel search",
    )


@pytest.mark.asyncio
async def test_fact_works_when_idle(client, session_id, results_recorder):
    with patch(
        "api.main.fetch_wiki_summary",
        new=AsyncMock(return_value="Delhi is the capital of India."),
    ):
        resp = await send_text(client, session_id, "Tell me about Delhi")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["interrupt_type"] == "FACT"
    assert body.get("fact_summary")
    status = (await get_status(client, session_id)).json()
    assert status["tool_status"] in ("IDLE", "COMPLETE", "CANCELLED")
    results_recorder.record("FACT-02", passed=True, interrupt_type="FACT")


@pytest.mark.asyncio
async def test_fact_classifies_kya_hai(client, session_id, results_recorder):
    first = await send_text(client, session_id, "Find restaurants in Connaught Place")
    assert first.status_code == 200, first.text
    await asyncio.sleep(0.1)
    with patch(
        "api.main.fetch_wiki_summary",
        new=AsyncMock(return_value="India Gate is a war memorial in New Delhi."),
    ):
        fact = await send_text(client, session_id, "India Gate kya hai?")
    assert fact.status_code == 200, fact.text
    assert fact.json()["interrupt_type"] == "FACT"
    status = (await get_status(client, session_id)).json()
    assert status["tool_status"] != "CANCELLED"
    results_recorder.record("FACT-03", passed=True, interrupt_type="FACT")
