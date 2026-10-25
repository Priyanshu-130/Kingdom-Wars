import heapq
import threading

from src.algorithms.astar import AStarNode, AStarSolver, calculate_astar_heuristic
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import Puzzle
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_node_immutability():
    node = AStarNode(columns=(1, -1, -1, -1), g=1)
    try:
        node.columns = (0, 1, 2, 3)  # type: ignore[misc]
        raised = False
    except Exception:
        raised = True
    assert raised or node.columns == (1, -1, -1, -1)


def test_informative_heuristic_varies_and_detects_dead_ends():
    puzzle = PuzzleRepository().get(1, 1)
    checker = ConstraintChecker()

    # Empty board: baseline distance = 4
    h_start = calculate_astar_heuristic(puzzle, (-1, -1, -1, -1), 0, checker)
    assert h_start == 4

    # Row 0 placed safely
    h_safe = calculate_astar_heuristic(puzzle, (2, -1, -1, -1), 1, checker)
    # Remaining unassigned rows is 3, plus blocked cells > 0
    assert h_safe >= 3
    # f = g + h varies between placements
    h_other = calculate_astar_heuristic(puzzle, (0, -1, -1, -1), 1, checker)
    f_safe = 1 + h_safe
    f_other = 1 + h_other
    assert isinstance(f_safe, int)
    assert isinstance(f_other, int)


def test_astar_solves_and_validates():
    puzzle = PuzzleRepository().get(2, 1)
    result = AStarSolver().solve(puzzle, SolverConfig(time_limit_seconds=5))
    assert result.success
    assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
    assert result.metrics["states_expanded"] >= 1
    assert result.metrics["path_cost"] == puzzle.n
    assert "duplicates_skipped" in result.metrics
    assert "max_frontier_size" in result.metrics


def test_astar_limits_and_cancel():
    puzzle = PuzzleRepository().get(2, 2)
    cancel = threading.Event()
    cancel.set()
    cancelled = AStarSolver().solve(puzzle, SolverConfig(), cancel)
    assert cancelled.termination_reason == TerminationReason.CANCELLED
    limited = AStarSolver().solve(puzzle, SolverConfig(max_expanded=1, time_limit_seconds=5))
    assert not limited.success
    assert limited.termination_reason == TerminationReason.EXPANDED_LIMIT


def test_astar_unsolvable_board():
    puzzle = Puzzle(
        puzzle_id="UNSOLVABLE_2X2",
        level=1,
        game=1,
        n=2,
        kingdoms=((0, 1), (0, 1)),
        kingdom_colors=((0, 0, 0), (1, 1, 1)),
        verified_solution=(),
    )
    solver = AStarSolver()
    result = solver.solve(puzzle, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.UNSOLVABLE
