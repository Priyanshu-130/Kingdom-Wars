from pathlib import Path

from src.core.level_manager import LevelManager
from src.core.progress_manager import ProgressManager
from src.models.round_result import RaceOutcome, RoundResult
from src.models.board_state import BoardState
from src.core.puzzle_repository import PuzzleRepository
from src.core.game_controller import GameController


def test_three_games_unlock_rules(tmp_path: Path):
    progress = ProgressManager(tmp_path / "progress.json")
    assert LevelManager.GAMES_PER_LEVEL == 3
    assert progress.is_level_unlocked(1)
    assert not progress.is_level_unlocked(2)
    progress.mark_completed(1, 1)
    progress.mark_completed(1, 1)
    assert progress.completed_count(1) == 1
    progress.mark_completed(1, 2)
    progress.mark_completed(1, 3)
    assert progress.is_level_unlocked(2)
    assert not progress.is_level_unlocked(3)


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
