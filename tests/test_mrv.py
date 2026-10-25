import threading

from src.algorithms.mrv import MRVForwardCheckingSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import Puzzle
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_mrv_forward_checking_solves_and_validates():
    for (level, game) in [(1, 1), (2, 1), (3, 1)]:
        puzzle = PuzzleRepository().get(level, game)
        solver = MRVForwardCheckingSolver()
        result = solver.solve(puzzle, SolverConfig(time_limit_seconds=5))
        assert result.success is True
        assert result.termination_reason == TerminationReason.SOLVED
        assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
        assert result.metrics["nodes_visited"] >= 1
        assert result.metrics["candidates_eliminated"] >= 0


def test_mrv_forward_checking_limits_and_cancellation():
    puzzle = PuzzleRepository().get(2, 3)
    cancel = threading.Event()
    cancel.set()
    result = MRVForwardCheckingSolver().solve(puzzle, SolverConfig(), cancel)
    assert result.termination_reason == TerminationReason.CANCELLED

    limited = MRVForwardCheckingSolver().solve(
        puzzle, SolverConfig(max_nodes=1, time_limit_seconds=5)
    )
    assert not limited.success
    assert limited.termination_reason == TerminationReason.NODE_LIMIT


def test_mrv_forward_checking_unsolvable_board():
    puzzle = Puzzle(
        puzzle_id="UNSOLVABLE_2X2",
        level=1,
        game=1,
        n=2,
        kingdoms=((0, 1), (0, 1)),
        kingdom_colors=((0, 0, 0), (1, 1, 1)),
        verified_solution=(),
    )
    solver = MRVForwardCheckingSolver()
    result = solver.solve(puzzle, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.UNSOLVABLE


def test_mrv_forward_checking_invalid_puzzle():
    malformed = Puzzle(
        puzzle_id="BAD",
        level=1,
        game=1,
        n=3,
        kingdoms=((0, 0), (1, 1)),  # Not 3x3
        kingdom_colors=((0, 0, 0), (1, 1, 1), (2, 2, 2)),
        verified_solution=(),
    )
    solver = MRVForwardCheckingSolver()
    result = solver.solve(malformed, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.INVALID_PUZZLE
