import threading
import time

from src.algorithms.backtracking import BacktrackingSolver
from src.core.puzzle_repository import PuzzleRepository
from src.core.round_manager import RoundManager
from src.models.round_result import RaceOutcome, RoundPhase
from src.models.solver_config import SolverConfig
from src.models.solver_result import SolverResult, TerminationReason


class InstantSolver:
    algorithm_name = "Instant"

    def solve(self, puzzle, config, cancel_event=None):
        found = time.perf_counter()
        return SolverResult(
            algorithm_name=self.algorithm_name,
            success=True,
            solution=puzzle.verified_solution,
            elapsed_seconds=0.0,
            termination_reason=TerminationReason.SOLVED,
            found_at_monotonic=found,
        )


class SlowFailSolver:
    algorithm_name = "SlowFail"

    def solve(self, puzzle, config, cancel_event=None):
        deadline = time.perf_counter() + 2.0
        while time.perf_counter() < deadline:
            if cancel_event and cancel_event.is_set():
                return SolverResult(
                    algorithm_name=self.algorithm_name,
                    success=False,
                    elapsed_seconds=0.01,
                    termination_reason=TerminationReason.CANCELLED,
                )
            time.sleep(0.01)
        return SolverResult(
            algorithm_name=self.algorithm_name,
            success=False,
            elapsed_seconds=2.0,
            termination_reason=TerminationReason.TIMEOUT,
        )


def _place_solution(manager, puzzle):
    for r, c in enumerate(puzzle.verified_solution):
        if not manager.human_board.has_queen(r, c):
            manager.toggle_human(r, c)


def test_human_solves_first_and_ai_solves_first():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    t0 = 1000.0
    mgr.start_round(puzzle, InstantSolver(), SolverConfig(round_time_limit_seconds=30), now=t0)
    _place_solution(mgr, puzzle)
    mgr.submit_human(now=t0 + 0.2)
    time.sleep(0.05)
    mgr.tick(now=t0 + 0.3)
    # Race must still be open until timeout or both solved.
    if not mgr.ai_valid:
        mgr.apply_ai_result_for_tests(
            SolverResult(
                "Instant",
                True,
                puzzle.verified_solution,
                0.01,
                termination_reason=TerminationReason.SOLVED,
                found_at_monotonic=t0 + 0.4,
            ),
            now=t0 + 0.4,
        )
    result = mgr.tick(now=t0 + 0.4)
    assert result is not None
    assert result.finalized
    assert result.human_valid and result.ai_valid
    assert result.outcome in {RaceOutcome.HUMAN_WIN, RaceOutcome.AI_WIN, RaceOutcome.DRAW}
    mgr.shutdown()


def test_only_human_solves():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    t0 = 10.0
    cfg = SolverConfig(round_time_limit_seconds=1.0, time_limit_seconds=1.0)
    mgr.start_round(puzzle, SlowFailSolver(), cfg, now=t0)
    _place_solution(mgr, puzzle)
    assert mgr.submit_human(now=t0 + 0.1)
    result = mgr.tick(now=t0 + 1.0)
    assert result is not None
    assert result.outcome == RaceOutcome.HUMAN_WIN
    assert result.human_valid and not result.ai_valid
    mgr.shutdown()


def test_only_ai_solves():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    t0 = 20.0
    mgr.start_round(puzzle, InstantSolver(), SolverConfig(round_time_limit_seconds=1), now=t0)
    time.sleep(0.05)
    mgr.tick(now=t0 + 0.2)
    if not mgr.ai_valid:
        mgr.apply_ai_result_for_tests(
            SolverResult(
                "Instant",
                True,
                puzzle.verified_solution,
                0.01,
                termination_reason=TerminationReason.SOLVED,
                found_at_monotonic=t0 + 0.05,
            ),
            now=t0 + 0.2,
        )
    result = mgr.tick(now=t0 + 1.0)
    assert result.outcome == RaceOutcome.AI_WIN
    mgr.shutdown()


def test_neither_solves_is_draw():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    t0 = 0.0
    mgr.start_round(puzzle, SlowFailSolver(), SolverConfig(round_time_limit_seconds=0.2), now=t0)
    result = mgr.tick(now=0.2)
    assert result.outcome == RaceOutcome.DRAW
    assert not result.human_valid and not result.ai_valid
    mgr.shutdown()


def test_invalid_submission():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    mgr.start_round(puzzle, InstantSolver(), SolverConfig(round_time_limit_seconds=5), now=0)
    mgr.toggle_human(0, 0)
    assert not mgr.submit_human(now=0.1)
    assert not mgr.human_valid
    assert mgr.phase != RoundPhase.ROUND_FINALIZED
    mgr.shutdown()


def test_restart_and_leave_and_late_result():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    mgr.start_round(puzzle, SlowFailSolver(), SolverConfig(round_time_limit_seconds=10), now=0)
    mgr.restart(SlowFailSolver(), SolverConfig(round_time_limit_seconds=10))
    assert mgr.phase == RoundPhase.RUNNING
    abandoned = mgr.abandon()
    assert abandoned.outcome == RaceOutcome.ABANDONED
    first = mgr.abandon()
    assert first is abandoned
    late = SolverResult(
        "late",
        True,
        puzzle.verified_solution,
        1.0,
        termination_reason=TerminationReason.SOLVED,
        found_at_monotonic=time.perf_counter(),
    )
    mgr.apply_ai_result_for_tests(late)
    assert mgr.late_results_ignored >= 1
    mgr.shutdown()


def test_near_simultaneous_draw_and_single_finalize():
    assert RoundManager.determine_winner(1.00, 1.02, 0.05) == RaceOutcome.DRAW
    assert RoundManager.determine_winner(1.00, 1.20, 0.05) == RaceOutcome.HUMAN_WIN
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    t0 = 50.0
    mgr.start_round(puzzle, InstantSolver(), SolverConfig(round_time_limit_seconds=5), now=t0)
    _place_solution(mgr, puzzle)
    mgr.submit_human(now=t0 + 0.10)
    mgr.apply_ai_result_for_tests(
        SolverResult(
            "Instant",
            True,
            puzzle.verified_solution,
            0.10,
            termination_reason=TerminationReason.SOLVED,
            found_at_monotonic=t0 + 0.12,
        ),
        now=t0 + 0.12,
    )
    result = mgr.result
    assert result.outcome == RaceOutcome.DRAW
    mgr._finalize(t0 + 1)
    assert mgr.result is result
    mgr.shutdown()


def test_real_backtracking_worker_does_not_need_main_thread():
    puzzle = PuzzleRepository().get(1, 1)
    mgr = RoundManager()
    mgr.start_round(puzzle, BacktrackingSolver(), SolverConfig(time_limit_seconds=5, round_time_limit_seconds=5))
    deadline = time.perf_counter() + 3
    while time.perf_counter() < deadline and not mgr.ai_valid:
        mgr.tick()
        time.sleep(0.01)
    assert mgr.ai_valid
    mgr.shutdown()
