import heapq
import threading

from src.algorithms.astar import AStarNode, AStarSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_node_immutability_and_heuristic():
    node = AStarNode(columns=(1, -1, -1, -1), g=1)
    assert node.h(4) == 3
    assert node.f(4) == 4
    try:
        node.columns = (0, 1, 2, 3)  # type: ignore[misc]
        raised = False
    except Exception:
        raised = True
    assert raised or node.columns == (1, -1, -1, -1)


def test_priority_ordering():
    n = 4
    a = AStarNode(columns=(-1, -1, -1, -1), g=0)
    b = AStarNode(columns=(1, -1, -1, -1), g=1)
    heap = []
    heapq.heappush(heap, (a.f(n), a.g, 1, a))
    heapq.heappush(heap, (b.f(n), b.g, 0, b))
    first = heapq.heappop(heap)[-1]
    assert first.g in (0, 1)
    assert a.f(n) == b.f(n) == n


def test_astar_solves_and_validates():
    puzzle = PuzzleRepository().get(3, 1)
    result = AStarSolver().solve(puzzle, SolverConfig(time_limit_seconds=5))
    assert result.success
    assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
    assert result.metrics["states_expanded"] >= 1
    assert result.metrics["path_cost"] == puzzle.n
    assert "duplicates_skipped" in result.metrics
    assert "max_frontier_size" in result.metrics


def test_astar_limits_and_cancel():
    puzzle = PuzzleRepository().get(3, 2)
    cancel = threading.Event()
    cancel.set()
    cancelled = AStarSolver().solve(puzzle, SolverConfig(), cancel)
    assert cancelled.termination_reason == TerminationReason.CANCELLED
    limited = AStarSolver().solve(puzzle, SolverConfig(max_expanded=1, time_limit_seconds=5))
    assert not limited.success
    assert limited.termination_reason == TerminationReason.EXPANDED_LIMIT
