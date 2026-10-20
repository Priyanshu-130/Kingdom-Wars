from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .level_manager import LevelManager


class ProgressManager:
    """Local JSON progress. Completing a finalized round marks a game done once."""

    def __init__(self, path: Path | None = None) -> None:
        root = Path(__file__).resolve().parents[2]
        self.path = path or (root / "data" / "progress.json")
        self._browser_storage = self._get_browser_storage()
        self.completed: set[tuple[int, int]] = set()
        self._load()

    @staticmethod
    def _get_browser_storage():
        try:
            from js import localStorage
        except ImportError:
            return None
        return localStorage

    def _load(self) -> None:
        try:
            if self._browser_storage is not None:
                stored = self._browser_storage.getItem("kingdom-wars-progress")
                if stored:
                    payload = json.loads(str(stored))
                    self.completed = {tuple(item) for item in payload.get("completed", [])}
            elif self.path.exists():
                payload = json.loads(self.path.read_text(encoding="utf-8"))
                self.completed = {tuple(item) for item in payload.get("completed", [])}
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            self.completed = set()

    def _save(self) -> None:
        payload = {"completed": [list(item) for item in sorted(self.completed)]}
        if self._browser_storage is not None:
            self._browser_storage.setItem("kingdom-wars-progress", json.dumps(payload))
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except OSError:
            # In-memory progress still works if the disk write fails.
            pass

    def is_completed(self, level: int, game: int) -> bool:
        return (level, game) in self.completed

    def mark_completed(self, level: int, game: int) -> bool:
        """Return True if this is a newly recorded completion."""
        key = (level, game)
        if key in self.completed:
            return False
        self.completed.add(key)
        self._save()
        return True

    def level_completed(self, level: int) -> bool:
        return all(self.is_completed(level, game) for game in range(1, LevelManager.GAMES_PER_LEVEL + 1))

    def is_level_unlocked(self, level: int) -> bool:
        if level <= 1:
            return True
        return self.level_completed(level - 1)

    def is_game_unlocked(self, level: int, game: int) -> bool:
        if not self.is_level_unlocked(level):
            return False
        return True

    def completed_count(self, level: int) -> int:
        return sum(1 for game in range(1, LevelManager.GAMES_PER_LEVEL + 1) if self.is_completed(level, game))

    def reset(self) -> None:
        self.completed.clear()
        self._save()

    def snapshot(self) -> Iterable[tuple[int, int]]:
        return tuple(sorted(self.completed))
