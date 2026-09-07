# VaaniAgent — things to change / add

Living backlog for product upgrades, API integrations, UX polish, and remaining tech debt.  
Use this as the single checklist before demo day or the next sprint.

---

## Priority legend

| Tag | Meaning |
|-----|---------|
| **P0** | Do soon — high demo impact, low risk |
| **P1** | Strong next — solid product value |
| **P2** | Nice to have / later |
| **SKIP** | Not worth it for current hackathon scope |

---

## A. Recommended free API integrations

### A1. IPInfo — auto city greeting — **P0**
**Why:** Killer opener; no credit card; easy.

**What to change**
- [x] Add `IPINFO_TOKEN` (optional) to `backend/.env.example` — free tier often works with limited unauthenticated access; prefer token.
- [x] On `POST /session`, resolve client IP → city (fallback: `Delhi`).
- [x] Return `{ session_id, detected_city, greeting }` (or separate `GET /geo`).
- [x] Frontend: on session create, speak + show greeting:  
  `Hi! Searching near {city}?` with chips: **Yes** / **Change city**.
- [x] Handle localhost/VPN wrong city → always allow override.
- [x] Do **not** hard-fail session if IPInfo is down.

**Files likely touched**
- `backend/api/main.py` (`/session`)
- `backend/api/models.py`
- `frontend/src/lib/api.ts`
- `frontend/src/components/vaani/voice-agent.tsx`
- `frontend/src/lib/copy.ts`
- `backend/.env.example`

---

### A2. Wikipedia API — mid-search side questions — **P0**
**Why:** No API key; proves “answer without cancelling tool”; great STATUS-adjacent demo.

**What to change**
- [ ] Add interrupt type **FACT** / **ASIDE** (keep **STATUS** = progress only).
- [ ] Classifier: questions like `what is …`, `tell me about …`, `kya hai …` while tool is RUNNING.
- [ ] Call Wikipedia REST summary (`https://en.wikipedia.org/api/rest_v1/page/summary/{title}`) — no key.
- [ ] Speak short summary via existing `/tts` + Rime.
- [ ] **Do not** cancel `tool_future` / bump turn for FACT.
- [ ] Cap summary length (~2 sentences) for TTS.
- [ ] Fallback spoken line if page missing: `Woh nahi mila — search continue kar rahi hoon.`

**Files likely touched**
- `backend/api/main.py` (`_classify_interrupt`, `/message`)
- `backend/tools/wikipedia.py` (new)
- `frontend/src/lib/copy.ts`
- `frontend/src/components/vaani/voice-agent.tsx` (classify + speak)
- `evaluation/scenarios.json` (1–2 FACT scenarios)
- `tests/test_status.py` or new `tests/test_fact.py`

---

### A3. Google Maps Geocoding — **P2 / SKIP for now**
**Why:** Needs Google Cloud key; little visible benefit until you leave mock tools.

**Only do if**
- [ ] You also add a real “places near lat/lng” tool, **or**
- [ ] You store coords on areas and use them in ranking.

**Otherwise skip** — keep string areas (`Connaught Place`, `near metro` boolean).

---

## B. UX / product features to add

### B1. Constraint chips + confirm — **P0**
- [ ] Show active filters as chips: `city` · `budget` · `veg` · `metro` · `cuisine` · `area`.
- [ ] Tap chip → remove filter → auto REFINE.
- [ ] Before first search (optional): confirm line  
  `Delhi · under ₹5000 · near metro — theek hai?`

### B2. Post-result follow-ups — **P1**
- [ ] After COMPLETE, offer: `Cheaper?` / `Closer to metro?` / `Veg only?` / `Restaurants instead?`
- [ ] One-tap sends the matching refine/pivot utterance.

### B3. Compare top 2 — **P1**
- [ ] When tool returns ≥2 results, speak one contrast line  
  (`Lotus vs Metro Inn — Lotus is closer to metro, thoda mehenga.`).

### B4. Ambiguity ask — **P1**
- [ ] If city missing and no IP city: ask `Kaunsa city?` instead of silent Delhi default.
- [ ] If budget missing on hotel: optional ask or keep default ₹5000 (document choice).

### B5. Barge-in while speaking — **P1**
- [ ] If user starts PTT / types while TTS plays → `stopSpeaking()` + treat as new interrupt.
- [ ] Ensure AudioContext stays unlocked.

### B6. One-click judge demos — **P0**
- [ ] Three buttons that auto-run scripts:
  1. REFINE chain  
  2. STATUS mid-search  
  3. PIVOT hotel→restaurant  
- [ ] Each ends with DebugPanel showing correct state.

### B7. “Same search, new city” — **P2**
- [ ] Utterance: `same but Mumbai` → keep budget/veg/metro, change city only.

### B8. Undo last interrupt — **P2**
- [ ] `wapas pehle wala` restores previous task params (needs small history stack).

### B9. Latency badges on DebugPanel — **P2**
- [ ] Show STT ms · tool ms · TTS ms from last turn.

### B10. Save / “book first” mock — **P2**
- [ ] After results: `book the first one` → mock confirmation spoken via Rime (no payment).

---

## C. Precision / correctness changes

- [ ] **P0** Keep spoken answers driven by backend `last_tool_result.summary` (no divergent local fake results).
- [ ] **P1** Improve Hinglish STT: document / try `GROQ_STT_LANGUAGE` multilingual or omit language lock.
- [ ] **P1** Align frontend `classify()` keywords with backend `_classify_interrupt` (one shared list or shared tests).
- [ ] **P1** Send `interrupt_type` on audio path only when needed; prefer backend as source of truth for metrics.
- [ ] **P2** Wire or delete unused `agent/pipeline.py` + `agent/interrupt.py` LLM classifiers (avoid “dead code” judge questions).
- [ ] **P2** Deduplicate audio history entries (audio + text duplicate user turns).

---

## D. Backend / API hardening

- [ ] **P1** Honor and document `CORS_ORIGINS` (already partially done — verify on `dev`).
- [ ] **P1** Session boot: never invent random UUID if `/session` fails (retry + error UI — verify on `dev`).
- [ ] **P2** `POST /evaluate` runs or clearly points to harness (already partially done).
- [ ] **P2** Dockerfile / compose: load `.env` reliably; document frontend+backend ports.
- [ ] **P2** Rate-limit friendly errors already exist for Groq — mirror clear Rime-down copy.

---

## E. Evaluation / tests

- [ ] **P1** Keep harness **not** feeding `interrupt_type` (real classification).
- [ ] **P1** Add FACT/Wikipedia scenarios once A2 lands.
- [ ] **P1** Keep pytest suite green (`tests/` — 27 cases pattern).
- [ ] **P2** Separate metric: “client-fed interrupt” vs “server-detected interrupt” if you reintroduce client hints.
- [ ] **P2** EvalPage: show `qa_independent_results.json` if that suite is the judge source of truth.

---

## F. Docs / demo polish

- [ ] **P0** 60-second judge script in `README.md` or `DEMO.md`.
- [ ] **P0** Checklist: keys required (`GROQ_API_KEY`, `RIME_API_KEY`, optional `IPINFO_TOKEN`).
- [ ] **P1** Screen recording / GIF of interrupt mid-search.
- [ ] **P2** Architecture one-pager (STT → interrupt → tool → stale fence → TTS).

---

## G. Explicitly do **not** add (for now) — **SKIP**

- Full Google Maps Places / Directions (unless leaving mocks)
- Real payments / hotel booking APIs
- Cab / flight tools (dilutes hotel+restaurant story)
- Heavy custom LLM interrupt classifier before UX polish
- Multi-worker Redis sessions (hackathon in-memory is fine)

---

## Suggested build order

1. **IPInfo greeting** (A1) + **judge demo buttons** (B6)  
2. **Wikipedia FACT interrupt** (A2)  
3. **Constraint chips + confirm** (B1) + **follow-ups** (B2)  
4. Compare top 2 (B3) · barge-in (B5) · STT Hinglish (C)  
5. Only then reconsider Geocoding (A3)

---

## Quick “definition of done” for each new feature

- [ ] Works with push-to-talk **and** text  
- [ ] Hinglish-aware short spoken line  
- [ ] Loading/error feedback within ~1s  
- [ ] Does not break REFINE / CANCEL / STATUS / PIVOT / stale fencing  
- [ ] DebugPanel still truthful  
- [ ] At least one test or eval scenario if it changes interrupt/tool behavior  

---

*Last dumped for VaaniAgent enhancement planning. Edit this file as items ship — move done items to a “Done” section or delete them.*
