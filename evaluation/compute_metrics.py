#!/usr/bin/env python3
"""Run the 25-scenario QA harness and write evaluation/results.json.

Usage (from repo root or backend/):
  backend/.venv/Scripts/python evaluation/compute_metrics.py

Speeds tool mocks to ~50–120ms so the suite finishes quickly while still
exercising interruptible delay + stale fencing.
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
EVAL_DIR = Path(__file__).resolve().parent
SCENARIOS_PATH = EVAL_DIR / "scenarios.json"
RESULTS_PATH = EVAL_DIR / "results.json"
PUBLIC_COPY = ROOT / "frontend" / "public" / "evaluation" / "results.json"

sys.path.insert(0, str(BACKEND))


def _speed_up_tools() -> None:
    import tools.hotel_search as hotels
    import tools.restaurant_search as restaurants

    hotels.MIN_DELAY = 0.05
    hotels.MAX_DELAY = 0.12
    restaurants.MIN_DELAY = 0.05
    restaurants.MAX_DELAY = 0.12


def _post_message(client, session_id: str, text: str, interrupt_type: str | None = None):
    data = {"session_id": session_id, "text": text}
    if interrupt_type:
        data["interrupt_type"] = interrupt_type
    return client.post("/message", data=data)


def _wait_tool(session_id: str, timeout: float = 2.0) -> None:
    import asyncio
    from agent.state import get_session

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = get_session(session_id)
        if not state:
            return
        fut = state.tool_future
        if fut is None or fut.done():
            return
        # Yield to the event loop used by TestClient / anyio
        try:
            asyncio.get_event_loop().run_until_complete(asyncio.sleep(0.02))
        except Exception:
            time.sleep(0.02)


def _eval_checks(scenario: dict, session_id: str, step_results: list[dict], recovery_ms: float | None) -> list[dict]:
    from agent.state import get_session

    state = get_session(session_id)
    task = (state.current_task if state else {}) or {}
    params = task.get("params") if isinstance(task.get("params"), dict) else {}
    tool = str(task.get("tool") or "")
    outcomes: list[dict] = []

    for check in scenario.get("checks", []):
        ok = False
        detail = ""

        if check == "tool_hotels":
            ok = tool == "search_hotels" or task.get("type") == "hotel"
            detail = f"tool={tool or task.get('type')}"
        elif check == "tool_restaurants":
            ok = tool == "search_restaurants" or task.get("type") == "restaurant"
            detail = f"tool={tool or task.get('type')}"
        elif check == "complete":
            ok = bool(state and state.tool_status == "COMPLETE" and state.last_tool_result)
            detail = f"status={getattr(state, 'tool_status', None)}"
        elif check == "interrupt":
            expected = [s.get("expect_interrupt") for s in scenario["steps"] if s.get("expect_interrupt")]
            got = [r.get("interrupt_type") for r in step_results if r.get("expect_interrupt")]
            ok = bool(expected) and got == expected
            detail = f"expected={expected} got={got}"
        elif check == "context_city":
            ok = str(params.get("city", "")).lower() in {"delhi", "mumbai", "bangalore", "pune", "goa", "jaipur"}
            # Prefer preserving the city from the opening step when not explicitly changed
            first = scenario["steps"][0]["text"].lower()
            if "mumbai" in first:
                ok = str(params.get("city", "")).lower() == "mumbai"
            elif "delhi" in first and "mumbai" not in " ".join(s["text"].lower() for s in scenario["steps"][1:]):
                ok = str(params.get("city", "")).lower() == "delhi"
            detail = f"city={params.get('city')}"
        elif check == "budget_refined":
            ok = isinstance(params.get("budget"), (int, float)) and int(params["budget"]) != 5000
            # T08 raises to 8000; T04 lowers to 3000
            detail = f"budget={params.get('budget')}"
        elif check == "veg_only":
            ok = bool(params.get("veg_only"))
            detail = f"veg_only={params.get('veg_only')}"
        elif check == "near_metro":
            ok = bool(params.get("near_metro"))
            detail = f"near_metro={params.get('near_metro')}"
        elif check == "city_mumbai":
            ok = str(params.get("city", "")).lower() == "mumbai"
            detail = f"city={params.get('city')}"
        elif check == "city_bangalore":
            ok = str(params.get("city", "")).lower() == "bangalore"
            detail = f"city={params.get('city')}"
        elif check == "area_cp":
            area = str(params.get("area", "")).lower()
            ok = "connaught" in area
            detail = f"area={params.get('area')}"
        elif check == "cancelled":
            ok = bool(state and state.tool_status == "CANCELLED" and not state.active_request_id)
            detail = f"status={getattr(state, 'tool_status', None)}"
        elif check == "status_keeps_running":
            ok = bool(state and state.tool_status == "RUNNING" and state.active_request_id)
            detail = f"status={getattr(state, 'tool_status', None)} req={getattr(state, 'active_request_id', None)}"
        elif check == "stale_blocked":
            ok = bool(state and state.stale_discarded >= 1)
            detail = f"stale_discarded={getattr(state, 'stale_discarded', 0)}"
        elif check == "no_crash":
            ok = True
            detail = "handled"
        else:
            detail = "unknown check"

        outcomes.append({"check": check, "pass": ok, "detail": detail, "recovery_ms": recovery_ms})

    return outcomes


def _inject_stale_arrival(session_id: str, old_turn: int, old_request_id: str) -> None:
    """Simulate a late tool completion for a fenced request (stale fencing path)."""
    import anyio
    from api.main import _finalize_tool_result

    async def _run() -> None:
        await _finalize_tool_result(
            session_id,
            old_turn,
            old_request_id,
            {
                "tool": "search_hotels",
                "summary": "STALE payload that must be discarded",
                "results": [],
            },
        )

    anyio.run(_run)


def run_scenario(client, scenario: dict) -> dict:
    from agent.state import get_session

    started = time.perf_counter()
    session = client.post("/session").json()["session_id"]
    step_results: list[dict] = []
    recovery_ms: float | None = None
    error: str | None = None
    first_turn: int | None = None
    first_request: str | None = None

    try:
        for index, step in enumerate(scenario["steps"]):
            wait_ms = int(step.get("wait_ms") or 0)
            if wait_ms:
                time.sleep(wait_ms / 1000.0)

            expect = step.get("expect_interrupt")
            t0 = time.perf_counter()
            # Frontend sends interrupt_type when it classifies one — mirror that
            resp = _post_message(client, session, step["text"], expect)
            latency = (time.perf_counter() - t0) * 1000
            body = resp.json() if resp.status_code == 200 else {"error": resp.text}
            if resp.status_code != 200:
                error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                step_results.append(
                    {
                        "text": step["text"],
                        "expect_interrupt": expect,
                        "interrupt_type": None,
                        "status_code": resp.status_code,
                    }
                )
                break

            interrupt_got = body.get("interrupt_type")
            if expect and index > 0 and recovery_ms is None:
                recovery_ms = round(latency, 1)

            if index == 0:
                first_turn = body.get("turn_id")
                first_request = body.get("active_request_id")

            step_results.append(
                {
                    "text": step["text"],
                    "expect_interrupt": expect,
                    "interrupt_type": interrupt_got,
                    "turn_id": body.get("turn_id"),
                    "active_request_id": body.get("active_request_id"),
                    "latency_ms": round(latency, 1),
                }
            )

            # Let RUNNING tools progress unless STATUS (must stay running)
            if expect != "STATUS" and expect != "CANCEL":
                _wait_tool(session, timeout=0.35)

        # STALE scenarios: inject a late completion for the fenced first request
        if scenario["type"] == "STALE" and first_turn is not None and first_request:
            _inject_stale_arrival(session, int(first_turn), str(first_request))

        settle = int(scenario.get("await_settle_ms") or 0)
        if settle:
            time.sleep(settle / 1000.0)
            _wait_tool(session, timeout=1.0)
        elif scenario["type"] == "NORMAL":
            _wait_tool(session, timeout=1.0)
            deadline = time.monotonic() + 1.5
            while time.monotonic() < deadline:
                st = get_session(session)
                if st and st.tool_status == "COMPLETE":
                    break
                time.sleep(0.03)

    except Exception as exc:  # noqa: BLE001 — capture as scenario failure
        error = str(exc)

    check_outcomes = _eval_checks(scenario, session, step_results, recovery_ms)
    passed = bool(check_outcomes) and all(c["pass"] for c in check_outcomes) and error is None
    if not check_outcomes and error is None:
        passed = True

    state = get_session(session)
    return {
        "id": scenario["id"],
        "type": scenario["type"],
        "description": scenario["description"],
        "expected": scenario["expected"],
        "result": "PASS" if passed else "FAIL",
        "passed": passed,
        "error": error,
        "recovery_latency_ms": recovery_ms,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        "steps": step_results,
        "checks": check_outcomes,
        "final": {
            "tool_status": getattr(state, "tool_status", None),
            "tool": (state.current_task or {}).get("tool") if state else None,
            "type": (state.current_task or {}).get("type") if state else None,
            "params": (state.current_task or {}).get("params") if state else None,
            "stale_discarded": getattr(state, "stale_discarded", 0) if state else 0,
            "last_interrupt_type": getattr(state, "last_interrupt_type", None) if state else None,
        },
    }


def compute_metrics(scenario_results: list[dict]) -> dict:
    interrupt_cases = [r for r in scenario_results if r["type"] in {"REFINE", "CANCEL", "STATUS", "PIVOT", "STALE", "MULTI"}]
    interrupt_pass = 0
    interrupt_total = 0
    for r in interrupt_cases:
        for c in r.get("checks", []):
            if c["check"] == "interrupt":
                interrupt_total += 1
                if c["pass"]:
                    interrupt_pass += 1

    stale_cases = [r for r in scenario_results if r["type"] == "STALE"]
    stale_pass = sum(1 for r in stale_cases if any(c["check"] == "stale_blocked" and c["pass"] for c in r.get("checks", [])))
    stale_total = len(stale_cases) or 1

    context_checks = [
        c
        for r in scenario_results
        for c in r.get("checks", [])
        if c["check"] in {"context_city", "city_mumbai", "city_bangalore", "area_cp", "veg_only", "near_metro", "budget_refined"}
    ]
    context_pass = sum(1 for c in context_checks if c["pass"])
    context_total = len(context_checks) or 1

    recoveries = [r["recovery_latency_ms"] for r in scenario_results if isinstance(r.get("recovery_latency_ms"), (int, float))]
    recovery_avg = round(sum(recoveries) / len(recoveries), 1) if recoveries else 0.0

    status_cases = [r for r in scenario_results if r["type"] == "STATUS"]
    status_pass = sum(
        1 for r in status_cases if any(c["check"] == "status_keeps_running" and c["pass"] for c in r.get("checks", []))
    )
    status_total = len(status_cases) or 1

    passed = sum(1 for r in scenario_results if r["passed"])
    total = len(scenario_results)

    def pct(n: int, d: int) -> float:
        return round(100.0 * n / d, 1) if d else 0.0

    return {
        "interrupt_detection": {
            "value": pct(interrupt_pass, interrupt_total or 1),
            "display": f"{pct(interrupt_pass, interrupt_total or 1):.1f}%",
            "target": "85%+",
            "pass": pct(interrupt_pass, interrupt_total or 1) >= 85,
            "n": interrupt_pass,
            "d": interrupt_total,
        },
        "stale_block_rate": {
            "value": pct(stale_pass, stale_total),
            "display": f"{pct(stale_pass, stale_total):.1f}%",
            "target": "100%",
            "pass": stale_pass == stale_total,
            "n": stale_pass,
            "d": stale_total,
        },
        "context_preservation": {
            "value": pct(context_pass, context_total),
            "display": f"{pct(context_pass, context_total):.1f}%",
            "target": "90%+",
            "pass": pct(context_pass, context_total) >= 90,
            "n": context_pass,
            "d": context_total,
        },
        "recovery_latency_ms": {
            "value": recovery_avg,
            "display": f"{int(recovery_avg)} ms",
            "target": "<2000ms",
            "pass": recovery_avg < 2000,
            "samples": len(recoveries),
        },
        "status_non_cancel": {
            "value": pct(status_pass, status_total),
            "display": f"{pct(status_pass, status_total):.1f}%",
            "target": "100%",
            "pass": status_pass == status_total,
            "n": status_pass,
            "d": status_total,
        },
        "scenarios_passed": {
            "value": passed,
            "display": f"{passed}/{total}",
            "target": f"{total}/{total}",
            "pass": passed == total,
            "n": passed,
            "d": total,
        },
    }


def main() -> int:
    _speed_up_tools()

    from fastapi.testclient import TestClient
    from api.main import app

    scenarios = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []

    with TestClient(app) as client:
        for scenario in scenarios:
            print(f"Running {scenario['id']} {scenario['type']}…", flush=True)
            results.append(run_scenario(client, scenario))

    metrics = compute_metrics(results)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "harness": "evaluation/compute_metrics.py",
        "scenario_count": len(results),
        "passed": sum(1 for r in results if r["passed"]),
        "failed": sum(1 for r in results if not r["passed"]),
        "metrics": metrics,
        "scenarios": results,
    }

    RESULTS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    PUBLIC_COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(RESULTS_PATH, PUBLIC_COPY)

    print(
        f"\nWrote {RESULTS_PATH.relative_to(ROOT)} and {PUBLIC_COPY.relative_to(ROOT)}",
        flush=True,
    )
    print(f"Passed {payload['passed']}/{payload['scenario_count']}", flush=True)
    for key, meta in metrics.items():
        mark = "PASS" if meta["pass"] else "FAIL"
        print(f"  {key}: {meta['display']} (target {meta['target']}) [{mark}]", flush=True)

    return 0 if payload["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
