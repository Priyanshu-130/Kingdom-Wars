import json
from pathlib import Path
import sys
from types import SimpleNamespace

from src.core.level_manager import LevelManager
from src.core.progress_manager import ProgressManager
from src.models.round_result import RaceOutcome, RoundResult
from src.models.board_state import BoardState
from src.core.puzzle_repository import PuzzleRepository
from src.core.game_controller import GameController


def test_three_games_unlock_rules(tmp_path: Path):
    progress = ProgressManager(tmp_path / "progress.json")
    assert LevelManager.GAMES_PER_LEVEL == 3
    assert LevelManager.LEVEL_COUNT == 2
    assert len(LevelManager().all_solvers()) == 2
    assert LevelManager().spec(1, 1).algorithm_key == "mrv"
    assert LevelManager().spec(2, 1).algorithm_key == "greedy"
    assert LevelManager().solver_by_key("mrv") is not None
    assert LevelManager().solver_by_key("greedy") is not None
    assert progress.is_level_unlocked(1)
    assert not progress.is_level_unlocked(2)
    progress.mark_completed(1, 1)
    progress.mark_completed(1, 1)
    assert progress.completed_count(1) == 1
    progress.mark_completed(1, 2)
    progress.mark_completed(1, 3)
    assert progress.is_level_unlocked(2)
    assert not progress.is_level_unlocked(3)
    assert LevelManager().next_game(2, 3) is None
    progress.mark_completed(2, 1)
    progress.mark_completed(2, 2)
    progress.mark_completed(2, 3)
    assert progress.level_completed(2)
    assert not progress.is_level_unlocked(3)


def test_legacy_progress_drops_removed_tier_and_remaps_later_tiers(tmp_path: Path):
    path = tmp_path / "progress.json"
    path.write_text(json.dumps({
        "version": 2,
        "completed": [
            [1, 1], [1, 2], [1, 3],
            [2, 1], [2, 2], [2, 3],
            [3, 1],
        ],
    }), encoding="utf-8")

    progress = ProgressManager(path)
    assert progress.completed_count(1) == 3
    assert progress.completed_count(2) == 1
    assert not progress.is_completed(2, 2)
    assert not progress.is_level_unlocked(3)
    assert json.loads(path.read_text(encoding="utf-8"))["version"] == 3


def test_abandon_does_not_advance(tmp_path: Path):
    repo = PuzzleRepository()
    progress = ProgressManager(tmp_path / "p.json")
    controller = GameController(repository=repo, progress=progress)
    controller.start_game(1, 1)
    result = controller.abandon()
    assert result.outcome == RaceOutcome.ABANDONED
    assert not progress.is_completed(1, 1)


def test_finalize_records_once(tmp_path: Path):
    repo = PuzzleRepository()
    progress = ProgressManager(tmp_path / "p.json")
    controller = GameController(repository=repo, progress=progress)
    puzzle = repo.get(1, 1)
    fake = RoundResult(
        puzzle=puzzle,
        outcome=RaceOutcome.HUMAN_WIN,
        human_board=BoardState(puzzle.n),
        ai_board=None,
        human_valid=True,
        ai_valid=False,
        human_time=1.0,
        ai_time=None,
        solver_result=None,
    )
    controller._record_completion(fake)
    controller._record_completion(fake)
    assert progress.completed_count(1) == 1


def test_browser_progress_uses_local_storage(monkeypatch, tmp_path: Path):
    class LocalStorage:
        def __init__(self):
            self.values = {}

        def getItem(self, key):
            return self.values.get(key)

        def setItem(self, key, value):
            self.values[key] = value

    storage = LocalStorage()
    monkeypatch.setitem(sys.modules, "js", SimpleNamespace(localStorage=storage))
    first = ProgressManager(tmp_path / "unused.json")
    first.mark_completed(1, 1)
    reloaded = ProgressManager(tmp_path / "unused.json")
    assert reloaded.is_completed(1, 1)
