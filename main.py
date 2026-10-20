from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Pygbag discovers browser packages from imports in this entry module.
import pygame

from src.app import run, run_browser


async def main() -> None:
    await run_browser()


if __name__ == "__main__":
    if sys.platform == "emscripten":
        asyncio.run(main())
    else:
        run()
