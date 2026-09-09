# DEMO.md — 60-second judge script

## Before you start (API keys)

| Key | Where | Needed for |
|-----|--------|------------|
| `GROQ_API_KEY` | `backend/.env` | STT (mic) |
| `RIME_API_KEY` | `backend/.env` | TTS voice |
| `IPINFO_TOKEN` | optional | City greeting (falls back to Delhi) |
| `GEOAPIFY_API_KEY` | optional | Map pins / live places |
| `USE_LIVE_PLACES` | optional (`0`) | Keep `0` for reliable mock demo; `1` = live OSM only |

Copy `backend/.env.example` → `backend/.env`.

```bash
# Terminal 1 — one backend only
cd backend && pnpm dev          # default :8000

# Terminal 2 — one frontend
cd frontend
# If BE is not on :8000:  VITE_API_URL=http://localhost:PORT
pnpm dev                        # prefer :8080
```

Open **http://localhost:8080**. If Vite lands on `:8081`/`:8082`, those origins must be in `CORS_ORIGINS`.

**Honest note:** Default results are **city-aware mock inventory** (~4–5s search so interrupts are visible). Interrupt fencing, STT, TTS, Wikipedia FACT, and (optional) live Geoapify places are real. Live mode does **not** fall back to mock.

**If mic STT fails** (Groq 403/network): banner appears — **type** the lines below. Rime TTS can still work.

**If STT is slow:** `GROQ_STT_MODEL=whisper-large-v3-turbo` in `backend/.env`, restart BE. Live `/message` classifies interrupts with rules, not an LLM.

---

## 60-second live script

1. **Open** Voice lab — confirm city (**Yes** or **Change city**). City ask only accepts known cities (no `Actually` / `metro` pollution).
2. **Mic or type:** `Find hotels in Delhi under ₹5000` — confirm + searching pulse; **Live map** opens on the left.
3. **While searching (~1–2s in):** tap amber **REFINE / STATUS / FACT / PIVOT / CANCEL** in the conversation card (always visible), or type `Actually, only vegetarian and near a metro` → **REFINE**.
4. **Or tap** Demo · REFINE / STATUS / FACT / PIVOT (one-click scripts lower on the page).
5. **After COMPLETE:** **Cheaper?** / **Metro?** / **Veg?** / **Restaurants?** / **Book first?** / **Same · Mumbai**.
6. **FACT aside:** `What is Connaught Place?` — Wikipedia line; search does not cancel.
7. **Show** DebugPanel (WS): `turn_id`, `tool_status`, `interrupt_type`, `stale_discarded`, `places_source`, `tool_delay`, `ack→complete`.
8. **Optional:** `/evaluate` for harness · `/demo` for this script on-screen.

---

## Interrupt cheat sheet

| Say… | Type |
|------|------|
| Actually / under / veg / metro | REFINE |
| What are you searching for? | STATUS |
| Forget it / cancel | CANCEL |
| Find restaurants instead | PIVOT |
| What is …? / Tell me about … | FACT |

---

## Ops checklist (demo day)

| Check | OK when |
|-------|---------|
| One BE process | Docs at `http://127.0.0.1:PORT/docs` |
| FE → same PORT | Network tab `POST …/session` hits that host |
| WebSocket | Judge panel **not** “Waiting for WebSocket…” |
| Interrupt window | Search stays RUNNING several seconds (~4–5s) |

Ghost `:8000` on Windows → Admin `net stop winnat` / `net start winnat`, or `PORT=8002` + matching `VITE_API_URL`.

---

## Eval evidence

- Pytest: `backend/.venv/Scripts/python -m pytest tests/ -q` → expect **50+** green (incl. FACT + `test_push_edge_deep.py`).
- Chromium smoke: `cd frontend && node scripts/chromium-smoke.mjs` (FE+BE up).
- QA JSON: `evaluation/qa_independent_results.json` · UI: `/evaluate`
- Claims write-up: `RIME_EVIDENCE.md`
