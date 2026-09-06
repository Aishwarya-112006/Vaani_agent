# VaaniAgent — DataForge 2026 Rime Track

Interruptible India-first voice booking agent (hotels + restaurants) with Rime TTS.

## Quick start

### Backend (`:8000`)

```bash
cd backend
pnpm setup          # creates .venv + installs requirements
# copy .env.example → .env and set GROQ_API_KEY + RIME_API_KEY
pnpm dev
```

### Frontend (`:8080`)

```bash
cd frontend
pnpm install
# optional: VITE_API_URL=http://localhost:8000
pnpm dev
```

Open http://localhost:8080 — Evaluation at `/evaluate`.

### Eval harness

```bash
backend/.venv/Scripts/python evaluation/compute_metrics.py
```

Writes `evaluation/results.json` and `frontend/public/evaluation/results.json`.

## Stack

- FastAPI + Groq Whisper STT + Rime TTS
- Mock `search_hotels` / `search_restaurants` (3–4s, cancelable)
- Interrupts: REFINE · CANCEL · STATUS · PIVOT + stale fencing
- WebSocket debug panel · 25-scenario QA harness
