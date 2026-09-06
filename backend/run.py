"""Start the VaaniAgent API with .env loaded.

Usage:
  python run.py           # reload (dev)
  python run.py --prod    # no reload
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import uvicorn

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


def main() -> None:
    prod = "--prod" in sys.argv or "--no-reload" in sys.argv
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    print(f"VaaniAgent API → http://127.0.0.1:{port}")
    print(f"Docs          → http://127.0.0.1:{port}/docs")

    uvicorn.run(
        "api.main:app",
        host=host,
        port=port,
        reload=not prod,
        reload_dirs=[str(ROOT)] if not prod else None,
    )


if __name__ == "__main__":
    main()
