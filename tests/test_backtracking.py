import threading

from src.algorithms.backtracking import BacktrackingSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_backtracking_solves_verified_puzzle():
    puzzle = PuzzleRepository().get(1, 1)
    result = BacktrackingSolver().solve(puzzle, SolverConfig(time_limit_seconds=5))
    assert result.success
    assert result.termination_reason == TerminationReason.SOLVED
    assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
    assert result.metrics["nodes_visited"] >= 1
    assert "backtracks" in result.metrics


def test_backtracking_cancellation():
    puzzle = PuzzleRepository().get(2, 3)
    cancel = threading.Event()
    cancel.set()
    result = BacktrackingSolver().solve(puzzle, SolverConfig(), cancel)
    assert not result.success
    assert result.termination_reason == TerminationReason.CANCELLED


def test_backtracking_node_limit():
    puzzle = PuzzleRepository().get(1, 3)
    result = BacktrackingSolver().solve(puzzle, SolverConfig(max_nodes=1, time_limit_seconds=5))
    assert not result.success
    assert result.termination_reason == TerminationReason.NODE_LIMIT
