# RIME_EVIDENCE.md

## Hard Voice Claim
A voice agent can block 100% of stale tool results from reaching Rime
when a user interrupts a running tool call, using turn_id-based fencing
(plus `active_request_id` matching on finalize).

## Acceptance Test
Given a tool call in flight with turn_id N,
when the user sends a new voice message (incrementing turn_id to N+1),
then any result arriving with turn_id N MUST NOT be spoken by Rime.
Test passes if no stale audio plays — either because `stale_discarded`
increments (completed-but-stale path) or because the in-flight tool is
cancelled before a stale result can be spoken.

## Test Procedure
1. Start a session: `POST /session` -> `session_id`
2. Send voice message: `POST /message` (text: "Find hotels in Delhi")
3. Wait briefly (tool is running with an artificial delay ~4–5s)
4. Send interruption: `POST /message` (text: "Make it vegetarian only")
5. Observe: `state.stale_discarded` increments, or the interrupted tool is
   cleanly cancelled before it can produce a stale result
6. Observe: the final accepted result matches the latest request only

Repeatable command (repo root):

```bash
backend/.venv/Scripts/python -m pytest tests/ -v --tb=short
```

This suite runs as real integration tests against the live FastAPI app
in-process (via httpx's ASGITransport). `tests/conftest.py` forces
`USE_LIVE_PLACES=0` so inventory stays mock/deterministic. Every request
still goes through the actual backend interrupt + fence code.

Deep mock edges (refine/cancel/status/fact/pivot/city): `tests/test_push_edge_deep.py`.

## Results (generated 2026-09-08; suite still green as of 2026-09-10)

Total scenarios run: 27 (25 official scenarios + 2 additional CANCEL cases)
Scenarios passed: 27/27 (100%)

| Metric | Result | Sample | Target | Status |
|---|---|---|---|---|
| Interrupt Detection Accuracy | 100.0% | 17/17 | 85%+ | Pass |
| Stale Response Block Rate | 100.0% | 3/3 | 100% | Pass |
| Context Preservation Rate | 100.0% | 17/17 | 90%+ | Pass |
| Interruption Recovery Latency | 3.2ms avg | 17/17 | <2000ms | Pass |
| STATUS Non-Cancellation Rate | 100.0% | 3/3 | 100% | Pass |

Note: Results from 27 scripted scenarios. Small sample — treat as
exploratory. Full item-level results in `evaluation/qa_independent_results.json`.
Do not mix with the older self-test harness
(`evaluation/results.json` / `compute_metrics.py`), which reports different
interrupt-detection numbers.

**UI corroboration (2026-09-10):** Chromium smoke
(`frontend/scripts/chromium-smoke.mjs`) — session create, always-on interrupt
chips, typed hotel search, STATUS mid-search, Live map panel, no
`city=Actually` filter pollution — 14/14 when FE `VITE_API_URL` matches BE.

## How Rime is wired (product)
- Backend: `POST /tts` → `agent.rime.rime_speak` returns MP3 audio.
- Frontend: `speak.ts` calls `/tts` and plays audio; `stopSpeaking()` fences
  in-flight TTS on interrupt so a late clip is not played.
- CANCEL / STATUS / REFINE / PIVOT acknowledgements are spoken in the demo UI
  via `ackCancel` / `ackStatus` / etc. + Rime. Backend interrupt routes still
  do not call Rime themselves — speech is client-driven after `/message`.
- Dual fence: finalize accepts a tool result only if both `turn_id` and
  `active_request_id` match the launch ids (`api/main.py`).

## Interrupt types (product surface)
| Type | Cancels tool? | Spoken via |
|------|---------------|------------|
| STATUS | No | Ack only; search continues |
| FACT | No | Wikipedia `fact_summary`; search continues |
| CANCEL | Yes | Ack; task cleared |
| REFINE | Yes | Ack + new search with merged params |
| PIVOT | Yes | Ack + hotel↔restaurant switch |

## Limitations
- **Latency is API/classification round-trip, not time-to-first-Rime-byte.**
  The 3.2ms average is in-process HTTP interrupt classify/ack with no TTS
  network or audio decode. Treat it as a lower bound for spoken recovery.
- **Context Preservation is a proxy metric.** It reuses Interrupt Detection
  Accuracy rather than an independent “final spoken answer was correct”
  check. Numbers match here, but they are not the same measurement.
- **This pytest suite does not assert spoken Rime audio.** CANCEL / STATUS
  state-machine behavior (task cleared / tool kept running) is confirmed;
  that the UI spoke the ack via `/tts` is verified in the live demo, not in
  these backend tests. Older QA notes saying “speaks nothing” refer to the
  backend route only.
- **`stale_discarded` may stay 0** when `asyncio` cancellation wins before the
  tool completes. That still satisfies the hard claim (nothing stale is spoken).
- **PIVOT scenarios (T18–T20) only exercise hotel ↔ restaurant switching.**
  Cab-/flight-style pivots are not in this sample, so the 100% figure is
  scoped to hotel/restaurant pivots.
- Mock tools by default in pytest: not a load test against live Geoapify rate
  limits. Live places mode (`USE_LIVE_PLACES=1`) has **no mock fallback**.
- Where STT/LLM run on Groq free tier, those latencies are free-tier, not a
  dedicated/paid endpoint. Rime TTS latency is separate and not included in
  the 3.2ms figure.
- Demo UI may log `TTS · Failed to fetch` if Rime is unreachable; typed
  interrupt fencing still works.

## Evidence Classification
Type: Functional integration test against the live backend (real HTTP
requests via ASGI transport, not mocks)
Independence: QA-authored and QA-run, separate from the development team's
own self-tested harness (`evaluation/results.json`, `compute_metrics.py`)
Reproducibility: Yes — `pytest tests/ -v --tb=short`, then
`python evaluation/analysis.py`
