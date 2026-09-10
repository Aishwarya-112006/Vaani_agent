# Vercel serverless entry point — imports the FastAPI app from main.py
# Vercel's @vercel/python runtime looks for `app` in this file.
from api.main import app  # noqa: F401  (re-exported for Vercel)
