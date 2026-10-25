from __future__ import annotations

import threading
import time

from src.algorithms.mrv import MRVForwardCheckingSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.level_manager import LEVEL_SPECS
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import Puzzle
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_mrv_forward_checking_solves_and_validates():
    repo = PuzzleRepository()
    for spec in LEVEL_SPECS:
        puzzle = repo.get(spec.level, spec.game)
        solver = MRVForwardCheckingSolver()
        result = solver.solve(puzzle, SolverConfig(time_limit_seconds=5))
        assert result.success is True
        assert result.termination_reason == TerminationReason.SOLVED
        report = ConstraintChecker().validate_row_columns(puzzle, result.solution)
        assert report.valid is True
        assert result.metrics["nodes_visited"] >= 1
        assert result.metrics["candidates_eliminated"] >= 0
        assert "MRV" in result.metrics["heuristic"]


def test_mrv_forward_checking_fixed_queens_and_edge_cases():
    puzzle = PuzzleRepository().get(1, 1)
    solver = MRVForwardCheckingSolver()

    # Valid fixed placement extending towards a solution
    solution = puzzle.verified_solution
    fixed = [(0, solution[0])]
    res = solver.solve(puzzle, SolverConfig(), fixed_queens=fixed)
    assert res.success is True
    assert res.solution[0] == solution[0]
    assert ConstraintChecker().validate_row_columns(puzzle, res.solution).valid

    # Multiple valid fixed placements
    fixed_two = [(0, solution[0]), (1, solution[1])]
    res_two = solver.solve(puzzle, SolverConfig(), fixed_queens=fixed_two)
    assert res_two.success is True
    assert res_two.solution[:2] == tuple(solution[:2])

    # Out of bounds fixed queen
    bad_fixed = [(0, 99)]
    res_bad = solver.solve(puzzle, SolverConfig(), fixed_queens=bad_fixed)
    assert res_bad.success is False
    assert res_bad.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS

    # Conflicting fixed queens (same row/col/diag/kingdom)
    conflict_fixed = [(0, 0), (0, 1)]
    res_conflict = solver.solve(puzzle, SolverConfig(), fixed_queens=conflict_fixed)
    assert res_conflict.success is False
    assert res_conflict.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS

    # Malformed fixed placement
    malformed_fixed = ["not_a_tuple"]
    res_malformed = solver.solve(puzzle, SolverConfig(), fixed_queens=malformed_fixed)
    assert res_malformed.success is False
    assert res_malformed.termination_reason == TerminationReason.INVALID_FIXED_PLACEMENTS


def test_mrv_forward_checking_limits_timeout_and_cancellation():
    puzzle = PuzzleRepository().get(2, 3)

    # Cancellation
    cancel = threading.Event()
    cancel.set()
    res_cancel = MRVForwardCheckingSolver().solve(puzzle, SolverConfig(), cancel)
    assert res_cancel.success is False
    assert res_cancel.termination_reason == TerminationReason.CANCELLED

    # Node limit
    limited = MRVForwardCheckingSolver().solve(
        puzzle, SolverConfig(max_nodes=1, time_limit_seconds=10)
    )
    assert limited.success is False
    assert limited.termination_reason == TerminationReason.NODE_LIMIT

    # Timeout
    timed_out = MRVForwardCheckingSolver().solve(
        puzzle, SolverConfig(time_limit_seconds=0.000001)
    )
    assert timed_out.success is False
    assert timed_out.termination_reason == TerminationReason.TIMEOUT


def test_mrv_forward_checking_unsolvable_board_proves_unsatisfiable():
    unsolvable_2x2 = Puzzle(
        puzzle_id="UNSOLVABLE_2X2",
        level=1,
        game=1,
        n=2,
        kingdoms=((0, 1), (0, 1)),
        kingdom_colors=((0, 0, 0), (1, 1, 1)),
        verified_solution=(),
    )
    solver = MRVForwardCheckingSolver()
    result = solver.solve(unsolvable_2x2, SolverConfig())
    assert result.success is False
    assert result.termination_reason == TerminationReason.UNSOLVABLE

    # 3x3 board where all cells belong to 1 kingdom -> impossible
    unsolvable_3x3 = Puzzle(
        puzzle_id="UNSOLVABLE_3X3",
        level=1,
        game=1,
        n=3,
        kingdoms=((0, 0, 0), (0, 1, 1), (2, 2, 2)),
        kingdom_colors=((0, 0, 0), (1, 1, 1), (2, 2, 2)),
        verified_solution=(),
    )
    res_3x3 = solver.solve(unsolvable_3x3, SolverConfig())
    assert res_3x3.success is False
    assert res_3x3.termination_reason == TerminationReason.UNSOLVABLE


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
