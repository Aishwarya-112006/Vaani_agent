# DEMO.md — 60-second judge script

## Before you start (API keys)

| Key | Where | Needed for |
|-----|--------|------------|
| `GROQ_API_KEY` | `backend/.env` | STT (mic) |
| `RIME_API_KEY` | `backend/.env` | TTS voice |
| `IPINFO_TOKEN` | optional | City greeting (falls back to Delhi) |

Copy `backend/.env.example` → `backend/.env`. Frontend: `pnpm dev` on `:8080`. Backend: `pnpm dev` in `/backend` on `:8000`.

**Honest note:** Hotel / restaurant **results are city-aware mock inventory** (not live Maps). Interrupt fencing, STT, TTS, and Wikipedia FACT are real.

**If mic STT fails** (Groq 403/network): a banner appears — **type** the same lines below. Rime TTS still works.

---

## 60-second live script

1. **Open** http://localhost:8080 — confirm city (**Yes** or **Change city**).
2. **Mic or type:** `Find hotels in Delhi under ₹5000` — hear confirm + searching pulse.
3. **While searching (~1s in):** `Actually, only vegetarian and near a metro` → **REFINE** (DebugPanel `interrupt_type`).
4. **Or tap** Demo · REFINE / STATUS / FACT / PIVOT (one-click scripts).
5. **After COMPLETE:** tap **Cheaper?** / **Metro?** / **Veg?** / **Restaurants?** / **Book first?**
6. **FACT aside:** `What is Connaught Place?` — Wikipedia line; search does not cancel.
7. **Show** DebugPanel: `turn_id`, `tool_status`, `stale_discarded`, `interrupt_type`.
8. **Optional:** open `/evaluate` for harness metrics · `/demo` for this script on-screen.

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

## Eval evidence

- Pytest: `backend/.venv/Scripts/python -m pytest tests/ -q` → expect **27+** green (incl. FACT).
- QA JSON: `evaluation/qa_independent_results.json` · UI: `/evaluate`
- Claims write-up: `RIME_EVIDENCE.md`
