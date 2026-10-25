from __future__ import annotations

import threading
import time

from src.algorithms.greedy import GreedyBestFirstSolver, calculate_greedy_heuristic
from src.core.constraint_checker import ConstraintChecker
from src.core.level_manager import LEVEL_SPECS
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import Puzzle
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_greedy_best_first_solves_all_active_puzzles():
    repo = PuzzleRepository()
    for spec in LEVEL_SPECS:
        puzzle = repo.get(spec.level, spec.game)
        solver = GreedyBestFirstSolver()
        result = solver.solve(puzzle, SolverConfig(time_limit_seconds=5))
        assert result.success is True
        assert result.termination_reason == TerminationReason.SOLVED
        report = ConstraintChecker().validate_row_columns(puzzle, result.solution)
        assert report.valid is True
        assert result.metrics["states_expanded"] > 0
        assert result.metrics["states_generated"] >= result.metrics["states_expanded"]
        assert "pure heuristic" in result.metrics["heuristic"]
        assert "Not guaranteed" in result.metrics["guarantees"]


def test_greedy_best_first_fixed_queens_and_edge_cases():
    puzzle = PuzzleRepository().get(1, 1)
    solver = GreedyBestFirstSolver()
    solution = puzzle.verified_solution

    # Valid fixed placement
    fixed = [(0, solution[0])]
    res = solver.solve(puzzle, SolverConfig(), fixed_queens=fixed)
    assert res.success is True
    assert res.solution[0] == solution[0]
    assert ConstraintChecker().validate_row_columns(puzzle, res.solution).valid

    # Out of bounds fixed queen
    res_oob = solver.solve(puzzle, SolverConfig(), fixed_queens=[(0, 99)])
    assert res_oob.success is False
    assert res_oob.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS

    # Conflicting fixed queens
    res_conf = solver.solve(puzzle, SolverConfig(), fixed_queens=[(0, 0), (1, 1)])
    assert res_conf.success is False
    assert res_conf.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS

    # Malformed fixed queen
    res_mal = solver.solve(puzzle, SolverConfig(), fixed_queens=["bad"])
    assert res_mal.success is False
    assert res_mal.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS


def test_greedy_best_first_respects_limits_and_distinguishes_failure():
    puzzle = PuzzleRepository().get(2, 1)
    solver = GreedyBestFirstSolver()

    # Node limit (generated)
    res_node = solver.solve(puzzle, SolverConfig(max_generated=1))
    assert res_node.success is False
    assert res_node.termination_reason == TerminationReason.NODE_LIMIT

    # Expanded limit
    res_exp = solver.solve(puzzle, SolverConfig(max_expanded=1))
    assert res_exp.success is False
    assert res_exp.termination_reason == TerminationReason.EXPANDED_LIMIT

    # Timeout limit
    res_timeout = solver.solve(puzzle, SolverConfig(time_limit_seconds=0.000001))
    assert res_timeout.success is False
    assert res_timeout.termination_reason == TerminationReason.TIMEOUT

    # Cancellation
    cancel = threading.Event()
    cancel.set()
    res_cancel = solver.solve(puzzle, SolverConfig(), cancel_event=cancel)
    assert res_cancel.success is False
    assert res_cancel.termination_reason == TerminationReason.CANCELLED


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


def test_greedy_heuristic_evaluates_promising_states_and_dead_ends():
    puzzle = PuzzleRepository().get(1, 1)
    checker = ConstraintChecker()

    # Empty board: initial distance
    h_empty = calculate_greedy_heuristic(puzzle, (-1, -1, -1, -1), 0, checker)
    assert h_empty > 0

    # Dead end: row with 0 legal columns
    # In 4x4, placing queens at (0,0), (1,2), (2,1) leaves row 3 with no legal columns
    h_dead = calculate_greedy_heuristic(puzzle, (0, 2, 1, -1), 3, checker)
    assert h_dead >= 10000  # Dead end penalty assigned

