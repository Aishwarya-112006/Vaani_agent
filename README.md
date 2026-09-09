# VaaniAgent — DataForge 2026 Rime Track

Interruptible **India-first** voice booking agent (hotels + restaurants).  
Built for the Rime Track: users can change their mind mid-search without stale answers being spoken.

> **Honest demo note:** hotel/restaurant results default to **mock inventory** so interrupts stay
> demoable (~4–5s cancelable delay). Set `GEOAPIFY_API_KEY` + `USE_LIVE_PLACES=1` for live
> OpenStreetMap places + map pins. **While live is on there is no mock fallback** (empty/error
> is honest). Always live either way: interrupt classification, turn fencing, Groq STT, Rime TTS,
> Wikipedia FACT, IP city greeting.

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
| **Stale fence** | Old `turn_id` + `active_request_id` results never reach Rime |
| **City greeting** | IPInfo (optional) → Yes / Change city (known cities only) |
| **Live map** | Left **PlacesPanel** (Leaflet) while RUNNING / COMPLETE |
| **Judge UX** | DebugPanel + WS, always-on interrupt chips, one-click demos |

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

**One process only** on the API port. Leftover uvicorn / ghost listeners cause stale mock,
CORS failures, or hung `/session`. If `:8000` is wedged on Windows: Admin
`net stop winnat` → `net start winnat`, or run `PORT=8002` and point the FE at it.

### 2. Frontend (`:8080`)

```bash
cd frontend
pnpm install
# Match the backend port (required if not :8000):
#   echo VITE_API_URL=http://localhost:8000 > .env.local
pnpm dev
```

Open **http://localhost:8080** (if 8080 is busy Vite bumps to 8081/8082 — add that origin to `CORS_ORIGINS`).

| Route | Purpose |
|-------|---------|
| `/` | Voice lab (main demo — viewport-fit conversation card) |
| `/demo` | 60s judge script + API key checklist |
| `/evaluate` | Metrics harness + QA-independent pytest log |

Full walkthrough: **[DEMO.md](./DEMO.md)** · Evidence: **[RIME_EVIDENCE.md](./RIME_EVIDENCE.md)** · Backlog: **[ENHANCEMENTS.md](./ENHANCEMENTS.md)**

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
| `IPINFO_TOKEN` | No | City greeting (fallback: Delhi / local) |
| `GEOAPIFY_API_KEY` | No | Live places + geocode for map pins |
| `USE_LIVE_PLACES` | No (`0`) | `1` = Geoapify only (no mock fallback); `0` = mock/eval |
| `CORS_ORIGINS` | Local/Prod | Include `http://localhost:8080` … `:8082` for Vite bumps |
| `PORT` | No (`8000`) | Override if `:8000` is ghost-bound |

Frontend: `VITE_API_URL` (default `http://localhost:8000`) — **must match** the running backend or session/WS fail.

**Live places + map:** `GEOAPIFY_API_KEY` + `USE_LIVE_PLACES=1`, restart **one** backend. On `/`, a **Live map** panel opens on the left during search/results. Mock mode still geocodes pins when a Geoapify key is present.

**If mic STT returns 403:** use **typed text**; Rime TTS can still work.

---

## Demo in 60 seconds

1. Confirm city (**Yes** or **Change city**).
2. Type or say: `Find hotels in Delhi under ₹5000`.
3. While searching (~1–2s in, window is ~4–5s): tap **REFINE** / **STATUS** / **FACT** / **PIVOT** / **CANCEL** (always visible in the Live conversation card) or type `Actually, only vegetarian and near a metro`.
4. Or tap **Demo · REFINE / STATUS / FACT / PIVOT** below.
5. After COMPLETE: **Cheaper?** · **Metro?** · **Veg?** · **Restaurants?** · **Book first?** · **Same · Mumbai**.
6. Show DebugPanel: `turn_id` · `tool_status` · `interrupt_type` · `stale_discarded` · `places_source` · latency badges.

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
| Tools | `search_hotels` / `search_restaurants` — mock by default (~4–5s, cancelable); optional live Geoapify/OSM |
| Aside | Wikipedia FACT |
| Geo | IPInfo → session city; Geoapify geocode + Places (optional) |
| UI | TanStack Start / Vite · Framer Motion · Leaflet map · Web Audio |

---

## Project layout

```
Vaani_agent/
├── backend/           # FastAPI app (pnpm setup / pnpm dev)
│   ├── api/main.py
│   ├── agent/         # STT, Rime, state, interrupts
│   └── tools/         # hotels, restaurants, real_places, wikipedia, ipinfo
├── frontend/          # Voice lab UI (:8080)
│   ├── scripts/chromium-smoke.mjs
│   └── src/components/vaani/
├── tests/             # pytest vs live ASGI app (mock places locked)
├── evaluation/        # scenarios + metrics JSON
├── DEMO.md
├── RIME_EVIDENCE.md
└── ENHANCEMENTS.md
```

---

## Testing

### Backend (pytest)

```bash
# from repo root — forces USE_LIVE_PLACES=0 via tests/conftest.py
backend/.venv/Scripts/python -m pytest tests/ -q
```

Includes FACT + deep mock edges (`tests/test_push_edge_deep.py`). Writes `evaluation/qa_independent_results.json`.

### Metrics harness

```bash
backend/.venv/Scripts/python evaluation/compute_metrics.py
```

Updates `evaluation/results.json`. View at `/evaluate`.

### Chromium smoke (Playwright)

With FE + BE running and `VITE_API_URL` matched:

```bash
cd frontend
pnpm exec playwright install chromium   # once
# optional: set VAANI_UI_URL=http://localhost:8080
node scripts/chromium-smoke.mjs
```

Checks session, interrupt chips, typed search, STATUS mid-flight, map panel, no `city=Actually` pollution.

---

## API sketch

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/session` | Create session + city greeting |
| `POST` | `/session/{id}/city` | Confirm preferred city |
| `POST` | `/message` | Text and/or audio; interrupts |
| `POST` | `/tts` | Rime audio bytes |
| `GET` | `/status` | Tool / fence state (WS carries richer `last_tool_result`) |
| `WS` | `/ws/{session_id}` | Live DebugPanel |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Mic STT 403 from Groq | Use typed input; refresh API key |
| No speech / TTS Failed to fetch | Check `RIME_API_KEY`; click page once to unlock audio |
| CORS / session pending | `CORS_ORIGINS` must include the exact Vite origin (`:8080`–`:8082`); `VITE_API_URL` must match BE |
| Judge panel “Waiting for WebSocket” | FE pointing at wrong/dead port — one clean BE + restart Vite |
| Empty / hung map | Wait for COMPLETE; enable Geoapify for pins; live mode has no mock fallback |
| Stale mock after env change | Kill extra uvicorn on `:8000` / `:8001`; restart one BE |
| Empty eval page | Run pytest / `compute_metrics.py`, refresh `/evaluate` |

---

## License / event

Built for **DataForge 2026 — Rime Track**.
