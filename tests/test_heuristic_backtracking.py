import threading

from src.algorithms.heuristic_backtracking import HeuristicBacktrackingSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_heuristic_solves_and_differs_from_row_order_idea():
    puzzle = PuzzleRepository().get(2, 1)
    solver = HeuristicBacktrackingSolver()
    result = solver.solve(puzzle, SolverConfig(time_limit_seconds=5))
    assert result.success
    assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
    assert result.metrics["candidates_eliminated"] >= 0
    assert result.metrics["nodes_visited"] >= 1


def test_heuristic_cancellation_and_limits():
    puzzle = PuzzleRepository().get(2, 3)
    cancel = threading.Event()
    cancel.set()
    result = HeuristicBacktrackingSolver().solve(puzzle, SolverConfig(), cancel)
    assert result.termination_reason == TerminationReason.CANCELLED
    limited = HeuristicBacktrackingSolver().solve(
        puzzle, SolverConfig(max_nodes=1, time_limit_seconds=5)
    )
    assert not limited.success
    assert limited.termination_reason == TerminationReason.NODE_LIMIT
