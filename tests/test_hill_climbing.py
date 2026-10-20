from src.algorithms.hill_climbing import HillClimbingSolver
from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.solver_config import SolverConfig
from src.models.solver_result import TerminationReason


def test_hill_climbing_metrics_and_validation():
    puzzle = PuzzleRepository().get(3, 1)
    solver = HillClimbingSolver()
    result = solver.solve(
        puzzle,
        SolverConfig(time_limit_seconds=3, max_restarts=20, max_iterations=4000, random_seed=7),
    )
    assert result.random_seed == 7
    assert "iterations" in result.metrics
    assert "restarts" in result.metrics
    assert "objective_evaluations" in result.metrics
    assert "initial_conflict_score" in result.metrics
    assert "final_conflict_score" in result.metrics
    if result.success:
        assert ConstraintChecker().validate_row_columns(puzzle, result.solution).valid
        assert result.termination_reason == TerminationReason.SOLVED
    else:
        assert result.solution is None
        assert result.termination_reason in {
            TerminationReason.TIMEOUT,
            TerminationReason.RESTART_LIMIT,
            TerminationReason.ITERATION_LIMIT,
            TerminationReason.LOCAL_OPTIMUM,
            TerminationReason.CANCELLED,
        }


def test_hill_climbing_is_seed_deterministic_on_failure_budget():
    puzzle = PuzzleRepository().get(3, 1)
    cfg = SolverConfig(time_limit_seconds=1, max_restarts=3, max_iterations=40, random_seed=99)
    a = HillClimbingSolver().solve(puzzle, cfg)
    b = HillClimbingSolver().solve(puzzle, cfg)
    assert a.metrics["objective_evaluations"] == b.metrics["objective_evaluations"]
    assert a.success == b.success
