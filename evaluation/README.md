# Evaluation harness

25 scripted interruption scenarios for VaaniAgent.

## Run metrics

From the repo (uses `backend/.venv`):

```bash
backend/.venv/Scripts/python evaluation/compute_metrics.py
```

Writes:

- `evaluation/results.json`
- `frontend/public/evaluation/results.json` (auto-served by Vite)

## Dashboard

Open http://localhost:8080/evaluate — `EvalPage` loads `results.json` automatically (no copy-paste). Fallback: `GET http://localhost:8000/evaluate/results`.
