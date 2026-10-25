from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .level_manager import LevelManager


class ProgressManager:
    """Local JSON progress. Completing a finalized round marks a game done once."""

    PROGRESS_VERSION = 3

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
                    self.completed = self._read_completed(payload)
            elif self.path.exists():
                payload = json.loads(self.path.read_text(encoding="utf-8"))
                self.completed = self._read_completed(payload)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            self.completed = set()

    def _read_completed(self, payload: dict) -> set[tuple[int, int]]:
        previous_version = int(payload.get("version", 1))
        completed = set()
        for item in payload.get("completed", []):
            if not isinstance(item, (list, tuple)) or len(item) != 2:
                continue
            old_level, game = item
            if not isinstance(old_level, int) or not isinstance(game, int):
                continue
            if previous_version == 1:
                level = {1: 1, 4: 2}.get(old_level)
            elif previous_version == 2:
                level = {1: 1, 3: 2}.get(old_level)
            else:
                level = old_level

            if (
                level is not None
                and 1 <= level <= LevelManager.LEVEL_COUNT
                and 1 <= game <= LevelManager.GAMES_PER_LEVEL
            ):
                completed.add((level, game))
        if previous_version < self.PROGRESS_VERSION:
            self.completed = completed
            self._save()
        return completed

    def _save(self) -> None:
        payload = {
            "version": self.PROGRESS_VERSION,
            "completed": [list(item) for item in sorted(self.completed)],
        }
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
        if not isinstance(level, int) or level < 1 or level > LevelManager.LEVEL_COUNT:
            return False
        if level == 1:
            return True
        return self.level_completed(level - 1)

    def is_game_unlocked(self, level: int, game: int) -> bool:
        return (
            isinstance(game, int)
            and 1 <= game <= LevelManager.GAMES_PER_LEVEL
            and self.is_level_unlocked(level)
        )

    def completed_count(self, level: int) -> int:
        return sum(1 for game in range(1, LevelManager.GAMES_PER_LEVEL + 1) if self.is_completed(level, game))

    def reset(self) -> None:
        self.completed.clear()
        self._save()

    def snapshot(self) -> Iterable[tuple[int, int]]:
        return tuple(sorted(self.completed))
