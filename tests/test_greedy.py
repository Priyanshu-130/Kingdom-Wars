from src.algorithms.greedy import GreedyBestFirstSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import Puzzle
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_greedy_best_first_solves_valid_puzzle():
    puzzle = PuzzleRepository().get(3, 1)
    solver = GreedyBestFirstSolver()
    result = solver.solve(puzzle, SolverConfig())
    assert result.success is True
    assert result.termination_reason == TerminationReason.SOLVED
    assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
    assert result.metrics["states_expanded"] > 0
    assert result.metrics["states_generated"] >= result.metrics["states_expanded"]
    assert "pure heuristic" in result.metrics["heuristic"]


def test_greedy_best_first_respects_limits():
    puzzle = PuzzleRepository().get(3, 1)
    solver = GreedyBestFirstSolver()
    res_node = solver.solve(puzzle, SolverConfig(max_generated=1))
    assert res_node.success is False
    assert res_node.termination_reason == TerminationReason.NODE_LIMIT

    res_exp = solver.solve(puzzle, SolverConfig(max_expanded=1))
    assert res_exp.success is False
    assert res_exp.termination_reason == TerminationReason.EXPANDED_LIMIT


def test_greedy_best_first_unsolvable_board():
    puzzle = Puzzle(
        puzzle_id="UNSOLVABLE_2X2",
        level=1,
        game=1,
        n=2,
        kingdoms=((0, 1), (0, 1)),
        kingdom_colors=((0, 0, 0), (1, 1, 1)),
        verified_solution=(),
    )
    solver = GreedyBestFirstSolver()
    result = solver.solve(puzzle, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.UNSOLVABLE


def test_greedy_best_first_invalid_puzzle():
    malformed = Puzzle(
        puzzle_id="BAD",
        level=1,
        game=1,
        n=3,
        kingdoms=((0, 0), (1, 1)),  # Not 3x3
        kingdom_colors=((0, 0, 0), (1, 1, 1), (2, 2, 2)),
        verified_solution=(),
    )
    solver = GreedyBestFirstSolver()
    result = solver.solve(malformed, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.INVALID_PUZZLE
