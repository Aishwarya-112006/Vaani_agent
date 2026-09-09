# VaaniAgent — DataForge 2026 Rime Track

Interruptible **India-first** voice booking agent (hotels + restaurants).  
Built for the Rime Track: users can change their mind mid-search without stale answers being spoken.

> **Honest demo note:** hotel/restaurant results default to **mock inventory** (names/prices) so
> interrupts stay demoable. Set `GEOAPIFY_API_KEY` + `USE_LIVE_PLACES=1` for live OpenStreetMap
> places + map pins (budget is not hard-filtered on live data). Always falls back to mock on API miss.
> What is live either way: interrupt classification, turn fencing, Groq STT, Rime TTS, Wikipedia FACT, IP city greeting.

---

## What it does

| Capability | Behavior |
|------------|----------|
| **Voice + text** | Click-to-talk mic or typed interruptions (Hinglish OK) |
| **REFINE** | Merge filters (veg, metro, budget…) without losing context |
| **CANCEL** | Fence in-flight tool; clear task |
| **STATUS** | Answer progress while search keeps running |
| **PIVOT** | Switch hotel ↔ restaurant; invalidate old result |
| **FACT** | Wikipedia aside — does **not** cancel search |
| **Stale fence** | Old `turn_id` results never reach Rime |
| **City greeting** | IPInfo (optional) → Yes / Change city |
| **Judge UX** | Live DebugPanel, one-click demos, follow-up chips |

---

## Quick start

### 1. Backend (`:8000`)

```bash
cd backend
pnpm setup                    # creates .venv + installs Python deps
copy .env.example .env        # Windows; or: cp .env.example .env
# Edit .env — set at least GROQ_API_KEY and RIME_API_KEY
pnpm dev
```

### 2. Frontend (`:8080`)

```bash
cd frontend
pnpm install
# optional: set VITE_API_URL=http://localhost:8000
pnpm dev
```

Open **http://localhost:8080**

| Route | Purpose |
|-------|---------|
| `/` | Voice lab (main demo) |
| `/demo` | 60s judge script + API key checklist |
| `/evaluate` | Metrics harness + QA-independent pytest log |

Full walkthrough: **[DEMO.md](./DEMO.md)** · Evidence claims: **[RIME_EVIDENCE.md](./RIME_EVIDENCE.md)** · Backlog: **[ENHANCEMENTS.md](./ENHANCEMENTS.md)**

---

## Environment

Copy `backend/.env.example` → `backend/.env`:

| Variable | Required | Used for |
|----------|----------|----------|
| `GROQ_API_KEY` | Yes (mic) | Whisper STT |
| `RIME_API_KEY` | Yes (voice) | Rime TTS |
| `GROQ_STT_LANGUAGE` | No (`auto`) | EN/HI detection |
| `RIME_SPEAKER` / `RIME_MODEL_ID` | No | English voice (default Luna / Arcana) |
| `RIME_SPEAKER_HI` / `RIME_MODEL_ID_HI` | No | Hindi voice (`nadi` / `coda`) |
| `IPINFO_TOKEN` | No | City greeting (fallback: detected/local) |
| `GEOAPIFY_API_KEY` | No | Live places geocode + search ([free key](https://myprojects.geoapify.com/)) |
| `USE_LIVE_PLACES` | No (`0`) | Set `1` to use Geoapify; keep `0` for mock/eval |
| `CORS_ORIGINS` | Prod | Comma-separated frontend origins |

Frontend optional: `VITE_API_URL` (default `http://localhost:8000`).

**Live places + map:** set `GEOAPIFY_API_KEY` and `USE_LIVE_PLACES=1`, restart **one** backend (`pnpm dev` in `/backend`). After a search completes on `/`, a **Map** card appears above the mic. Only one process should listen on `:8000` — leftover uvicorn reloaders will serve stale mock results.

**If mic STT returns 403** (“Access denied / network settings”): Groq is blocking the key or network — use **typed text** for the demo; TTS can still work.

---

## Demo in 60 seconds

1. Confirm city (**Yes** or **Change city**).
2. Type or say: `Find hotels in Delhi under ₹5000`.
3. While searching: `Actually, only vegetarian and near a metro` → **REFINE**.
4. Or tap **Demo · REFINE / STATUS / FACT / PIVOT**.
5. After COMPLETE: **Cheaper?** · **Metro?** · **Veg?** · **Restaurants?** · **Book first?** · **Same · Mumbai**.
6. Show DebugPanel: `turn_id` · `tool_status` · `interrupt_type` · `stale_discarded` · latency badges.

### Interrupt cheat sheet

| Say… | Type |
|------|------|
| Actually / under / veg / metro | REFINE |
| What are you searching for? | STATUS |
| Forget it / cancel | CANCEL |
| Find restaurants instead | PIVOT |
| What is …? / Tell me about … | FACT |

---

## Stack

| Layer | Tech |
|-------|------|
| API | FastAPI · WebSocket state · CORS |
| STT | Groq Whisper (`whisper-large-v3`, `auto` language) |
| TTS | Rime (`POST /tts`) — Rime-only playback (no browser voice bridge) |
| Tools | `search_hotels` / `search_restaurants` — mock by default (~2.0–2.8s, cancelable); optional live Geoapify/OSM when `USE_LIVE_PLACES=1` |
| Aside | Wikipedia FACT |
| Geo | IPInfo → session city; Geoapify geocode + Places (optional); results map (Leaflet / OSM tiles) |
| UI | TanStack Start / Vite · Framer Motion · Web Audio |

---

## Project layout

```
Vaani_agent/
├── backend/           # FastAPI app (pnpm setup / pnpm dev)
│   ├── api/main.py
│   ├── agent/         # STT, Rime, state, interrupts
│   └── tools/         # hotels, restaurants, real_places, wikipedia, ipinfo
├── frontend/          # Voice lab UI (:8080)
│   └── src/components/vaani/
├── tests/             # pytest vs live ASGI app
├── evaluation/        # scenarios + metrics JSON
├── scripts/           # UI DOM walkthrough (Playwright)
├── DEMO.md
├── RIME_EVIDENCE.md
└── ENHANCEMENTS.md
```

---

## Testing

### Backend (pytest)

```bash
# from repo root
backend/.venv/Scripts/python -m pytest tests/ -q
```

Full suite including FACT. Writes `evaluation/qa_independent_results.json`.

### Metrics harness

```bash
backend/.venv/Scripts/python evaluation/compute_metrics.py
```

Updates `evaluation/results.json` (and frontend public copy when configured). View at `/evaluate`.

### UI DOM walkthrough (Playwright)

With FE + BE running:

```bash
cd frontend
pnpm exec playwright install chromium   # once
node ../scripts/ui-dom-walkthrough.mjs
```

Clicks nav, city UX, typed refine/pivot, chips, demos; report → `scripts/ui-walkthrough-report.json`.

---

## API sketch

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/session` | Create session + city greeting |
| `POST` | `/session/{id}/city` | Confirm preferred city |
| `POST` | `/message` | Text and/or audio; interrupts |
| `POST` | `/tts` | Rime audio bytes |
| `GET` | `/status` | Tool / fence state |
| `WS` | `/ws/{session_id}` | Live DebugPanel |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Mic STT 403 from Groq | Network/key issue — use typed input; refresh API key |
| No speech | Check `RIME_API_KEY`; unlock audio with a click first |
| CORS errors | Set `CORS_ORIGINS` to your frontend URL |
| Session pending | Backend not on `:8000` — run `pnpm dev` in `backend/` |
| Empty eval page | Run pytest / `compute_metrics.py`, refresh `/evaluate` |

---

## License / event

Built for **DataForge 2026 — Rime Track**.
