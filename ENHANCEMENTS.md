# VaaniAgent — things to change / add

Living backlog for product upgrades, API integrations, UX polish, optimization, and tech debt.  
Use this as the single checklist before demo day — and to **split GitHub issues by owner**.

---

## Priority legend

| Tag | Meaning |
|-----|---------|
| **P0** | Do soon — high demo impact, low risk |
| **P1** | Strong next — solid product value |
| **P2** | Nice to have / later |
| **SKIP** | Not worth it for current hackathon scope |
| **DONE** | Shipped — keep for history / regression |

## Owner legend (for GitHub assignees)

| Owner | Means |
|-------|--------|
| **Frontend** | UI, voice client, `copy.ts`, TTS playback, chips, demos |
| **Backend** | FastAPI, tools, STT/TTS API, interrupts, pytest, eval harness |
| **Both** | Needs FE + BE contract; open **two issues** or one epic with two checklists |
| **Docs** | README / DEMO.md / architecture — either owner, usually Frontend or lead |

**Suggested GitHub labels:** `frontend` · `backend` · `docs` · `P0` · `P1` · `P2`

---

## GitHub issue board (copy titles)

| ID | Priority | Owner | Suggested issue title |
|----|----------|-------|------------------------|
| B1 | P0 | **Frontend** | `feat(frontend): constraint chips + confirm for active filters` |
| B6 | P0 | **Frontend** | `feat(frontend): one-click judge demos (REFINE / STATUS / FACT / PIVOT)` |
| F1 | P0 | **Docs** | `docs: 60s judge script + API key checklist` |
| B5 | P1 | **Frontend** | `feat(frontend): barge-in — stop TTS on mic/type interrupt` |
| B11 | P1 | **Frontend** | `feat(frontend): reduce silence between ack and result speech` |
| B3 | P1 | **Both** | `feat: compare top-2 spoken summary (BE summary + FE copy fallback)` |
| B2 | P1 | **Frontend** | `feat(frontend): post-result follow-up chips` |
| B4 | P1 | **Both** | `feat: ask for city/budget when missing (BE prefer + FE speak ask)` |
| C1 | P1 | **Both** | `chore: align frontend classify() with backend _classify_interrupt` |
| C2 | P1 | **Frontend** | `chore(frontend): prefer backend interrupt_type on audio path` |
| C3 | P1 | **Docs** | `docs: clarify hotel/restaurant results are mock inventory` |
| E1 | P1 | **Backend** | `test(backend): FACT scenarios + tests/test_fact.py` |
| E2 | P1 | **Backend** | `test: keep harness free of client-fed interrupt_type` |
| H1 | P1 | **Frontend** | `refactor(frontend): split voice-agent.tsx into modules` |
| H2 | P1 | **Both** | `chore: shared interrupt keyword source (TS + Python tests)` |
| D1 | P1 | **Backend** | `chore(backend): verify CORS_ORIGINS on deploy` |
| B7 | P2 | **Both** | `feat: same search, new city only` |
| B8 | P2 | **Both** | `feat: undo last interrupt` |
| B9 | P2 | **Both** | `feat: DebugPanel latency badges (STT/tool/TTS ms)` |
| B10 | P2 | **Both** | `feat: mock book first hotel confirmation` |
| A4 | P2 | **Backend** (+ FE display) | `feat(backend): real places/hotel search (OSM) with mock fallback` |
| A3 | SKIP/P2 | **Backend** | Geocoding only if A4 ships |
| E3 | P2 | **Frontend** | `feat(frontend): EvalPage FACT / qa_independent results` |
| H3 | P2 | **Frontend** | `chore(frontend): trim deps / cold-start notes` |
| H4 | P2 | **Frontend** | `chore(frontend): audit copy.ts EN/HI parity` |
| D2–D4 | P2 | **Backend** / **Docs** | evaluate endpoint, Docker/.env, Rime-down copy |

---

## Done recently (shipped)

### D1. IPInfo — auto city greeting — **DONE** · Owners: Backend + Frontend
- [x] **Backend:** `IPINFO_TOKEN`, `tools/ipinfo.py`, `POST /session`, `POST /session/{id}/city`
- [x] **Frontend:** greeting speak + Yes / Change city chips; override UX

### D2. Wikipedia FACT interrupt — **DONE** (core) · Owners: Backend + Frontend
- [x] **Backend:** FACT classify, `tools/wikipedia.py`, no tool cancel, `fact_summary`
- [x] **Frontend:** FACT path — speak summary, no fence
- [x] **Backend:** FACT eval + `tests/test_fact.py` → **E1**

### D3. Voice UX reliability — **DONE** · Owner: Frontend (+ Backend summaries/delay)
- [x] **Frontend:** click-to-toggle mic, session guard, Rime-only speak, EN/HI copy
- [x] **Backend:** shorter summaries, ~2–2.8s delay, stale-fence test retune

---

## A. API integrations

### A3. Google Maps Geocoding — **P2 / SKIP** · Owner: **Backend**
**Why:** Needs Google key; useless without real places.

- [ ] Backend only if A4 lands  
**Frontend:** none until results need map UI

### A4. Real hotel/places search — **P2** · Owner: **Backend** (primary) + **Frontend** (display)
**Backend**
- [ ] OSM / Places tool; area parse; price sort; mock fallback  
**Frontend**
- [ ] Show real fields from `last_tool_result` (no hardcoded Lotus fallback when BE returns data)

**Files BE:** `tools/hotel_search.py`, `tools/places.py`, `main.py`  
**Files FE:** `voice-agent.tsx`, `copy.ts` (fallback only)

---

## B. UX / product

### B1. Constraint chips + confirm — **P0** · Owner: **Frontend**
- [x] Chips: `city` · `budget` · `veg` · `metro` · `cuisine` · `area`
- [x] Tap → remove → auto REFINE
- [x] Optional confirm line before first search

**Files:** `voice-agent.tsx`, `copy.ts`  
**Backend:** none (uses existing params)

---

### B2. Post-result follow-ups — **P1** · Owner: **Frontend**
- [x] After COMPLETE: Cheaper? / Metro? / Veg? / Restaurants?
- [x] One-tap → existing refine/pivot utterances

**Backend:** none

---

### B3. Compare top 2 — **P1** · Owner: **Both** (split issues)
**Backend issue**
- [x] Build contrast line in `summary` when `count >= 2`  
**Frontend issue**
- [x] Fallback copy if summary missing; keep TTS short

**Files BE:** `hotel_search.py`, `restaurant_search.py`  
**Files FE:** `copy.ts`, `voice-agent.tsx`

---

### B4. Ambiguity ask — **P1** · Owner: **Both**
**Backend**
- [x] Signal “city required” / don’t silently invent city when no preferred_city  
**Frontend**
- [x] Speak `Kaunsa city?` / budget ask; wait for user before `runTool`

---

### B5. Barge-in while speaking — **P1** · Owner: **Frontend**
- [x] Mic / type while TTS → `stopSpeaking()` + new interrupt
- [x] AudioContext stays unlocked

**Files:** `speak.ts`, `PushToTalk.tsx`, `voice-agent.tsx`  
**Backend:** none

---

### B6. One-click judge demos — **P0** · Owner: **Frontend**
- [x] Scripts: REFINE · STATUS · FACT · PIVOT
- [x] DebugPanel shows correct state after each

**Files:** `voice-agent.tsx`, `lib/demos.ts`  
**Backend:** none (uses live APIs)

---

### B7. Same search, new city — **P2** · Owner: **Both**
- [x] **Backend:** parse “same but Mumbai” → keep other params  
- [x] **Frontend:** chip `Same · Mumbai` + parseTask path

---

### B8. Undo last interrupt — **P2** · Owner: **Both**
**Backend:** param history stack  
**Frontend:** utterance + speak restore

---

### B9. Latency badges — **P2** · Owner: **Both**
**Backend:** return timing fields on message / tool result  
**Frontend:** DebugPanel badges

---

### B10. Mock “book first” — **P2** · Owner: **Both**
- [x] **Frontend:** utter + speak mock booking line (`Book first?` chip)
- [ ] **Backend:** optional confirm endpoint (FE mock is enough for demo)

---

### B11. Prefetch / reduce silence — **P1** · Owner: **Frontend**
- [x] Polish ack → COMPLETE gap (same Rime voice only; no browser bridge)
- [x] Honest searching pulse

**Files:** `voice-agent.tsx`, `speak.ts`  
**Backend:** none (delay already tuned)

---

## C. Precision / correctness

| Item | Pri | Owner | Notes |
|------|-----|-------|--------|
| Spoken from BE `last_tool_result.summary` | DONE | Both | Shipped |
| `GROQ_STT_LANGUAGE=auto` | DONE | Backend | `.env.example` |
| Align `classify()` ↔ `_classify_interrupt` | P1 | **Both** | Shared list or paired tests |
| Prefer BE `interrupt_type` on audio | P1 | **Frontend** | Metrics honesty |
| Wire/delete unused LLM pipeline | P2 | **Backend** | `agent/pipeline.py` etc. |
| Dedupe audio history turns | P2 | **Backend** | `/message` history |
| Document mock inventory | P1 | **Docs** | README |

---

## D. Backend / API hardening · Owner: **Backend** (unless noted)

| Item | Pri | Owner |
|------|-----|-------|
| Verify `CORS_ORIGINS` on deploy | P1 | Backend |
| Session retry + error UI | DONE | Frontend (+ BE) |
| `/evaluate` → harness docs | P2 | Backend + Docs |
| Docker / compose `.env` + ports | P2 | Backend + Docs |
| Rime-down user copy | P2 | Backend + **Frontend** banner |
| Pyright config + log_event types | DONE | Backend |

---

## E. Evaluation / tests · Owner: **Backend** (EvalPage = Frontend)

| Item | Pri | Owner |
|------|-----|-------|
| Harness must not feed `interrupt_type` | P1 | Backend |
| FACT scenarios in `scenarios.json` | P1 | Backend |
| `tests/test_fact.py` | DONE | Backend |
| Keep pytest green | P1 | Backend |
| EvalPage FACT / qa JSON | DONE | **Frontend** |

---

## F. Docs / demo polish · Owner: **Docs**

| Item | Pri | Owner |
|------|-----|-------|
| 60s judge script (`DEMO.md` + `/demo`) incl. FACT + greeting | DONE | Docs |
| Key checklist | DONE | Docs |
| Screen recording / GIF | P1 | Docs (anyone) |
| Architecture one-pager | P2 | Docs |

---

## H. Code health · Owner by area

### H1. Split `voice-agent.tsx` — **P1** · Owner: **Frontend**
- [ ] Extract greeting, FACT/submit, demos, parse/classify

### H2. Shared interrupt keywords — **P1** · Owner: **Both**
- [ ] TS source + Python tests mirror, or document FE mirrors BE

### H3. Cold `pnpm dev` — **P2** · Owner: **Frontend**
- [ ] Trim unused deps later; Defender exclude; **SKIP** SPA rewrite mid-hackathon

### H4. `copy.ts` EN/HI audit — **P2** · Owner: **Frontend**
- [ ] Short lines; every new string has `hi` + default `en`

---

## G. Do **not** add — **SKIP**

- Full Google Places / payments / cab-flight tools  
- Heavy LLM interrupt classifier before UX polish  
- Redis multi-worker sessions  
- Browser TTS bridge while waiting on Rime  

---

## How to open GitHub issues (template)

**Frontend-only example**
```markdown
## Owner
Frontend

## Summary
…

## Scope
- [ ] …

## Out of scope
Backend API changes

## Files
- frontend/src/…
```

**Backend-only example**
```markdown
## Owner
Backend

## Summary
…

## Scope
- [ ] …

## Out of scope
UI / Rime playback

## Files
- backend/…
```

**Both — open 2 issues linked**
1. `feat(backend): …` — API / summary / tests  
2. `feat(frontend): …` — speak / chips / Depends on #backend-issue  

---

## Suggested build order (demo day)

1. ~~Frontend: B1 chips + B6 judge demos~~ **DONE**
2. ~~Frontend: B5 barge-in + B11 silence polish~~ **DONE**
3. ~~Both/Backend: B3 compare + E1 FACT tests~~ **DONE** (FACT tests added)
4. ~~Frontend: B2 follow-ups · Both: B4 ambiguity~~ **DONE**
5. ~~Docs: F 60s script~~ **DONE** (`DEMO.md` + `/demo`)
6. **Later / optional:** B8 undo · B9 latency · A4 real places · H1 split `voice-agent.tsx`

---

## Still open (relative leftover)

| ID | Pri | Owner | Status |
|----|-----|-------|--------|
| B8 | P2 | Both | Undo last interrupt — **leave** (nice-to-have) |
| A4 / A3 | P2/SKIP | Backend | Real OSM places — **leave** (mock is demo-honest) |
| H1 | P1 | Frontend | Split `voice-agent.tsx` — **leave** (refactor only) |
| H3 / H4 | P2 | Frontend | Dep trim / copy audit — **leave** |
| D2–D4 | P2 | Backend/Docs | Docker / Rime-down — **leave** |

**Closed this pass (needed):**
- TS Problems: `copy.ts` index access + `tsconfig`/`vite-env.d.ts` for lucide/framer
- C1 / H2: shared `lib/interrupt.ts` ↔ BE `_classify_interrupt`
- C2: audio path prefers BE `interrupt_type` (already wired)
- B9: DebugPanel `tool_delay` + `ack→complete` badges
- D1: CORS logged at boot + `.env.example` deploy note
- E2: conftest documents no client-fed `interrupt_type` for scored suite

---

## Demo-day minimum

| Must show | Feature | Owner |
|-----------|---------|-------|
| City opener | IPInfo greeting | Done (Both) |
| Interrupt | REFINE / CANCEL / STATUS | Done |
| Aside | FACT Wikipedia | Done (+ tests) |
| Voice | One Rime voice, click mic | Done (Frontend) |
| Polish | Chips B1 + demos B6 + `/demo` | Done |
| Evidence | `/evaluate` harness + QA tab | Done |

---

*Owners are for GitHub assignment. Prefer small single-owner issues; use **Both** only when the API contract must land first.*
