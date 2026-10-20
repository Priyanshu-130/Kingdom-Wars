from __future__ import annotations

import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Optional

from ..algorithms.base_solver import BaseSolver
from ..models.board_state import BoardState
from ..models.puzzle import Puzzle
from ..models.round_result import RaceOutcome, RoundPhase, RoundResult
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult
from .constraint_checker import ConstraintChecker


class RoundManager:
    """Independent human/AI boards, monotonic timing, one-shot finalization."""

    MAX_MISTAKES = 3

    def __init__(
        self,
        checker: Optional[ConstraintChecker] = None,
        executor: Optional[ThreadPoolExecutor] = None,
    ) -> None:
        self.checker = checker or ConstraintChecker()
        self._executor = executor or ThreadPoolExecutor(max_workers=1, thread_name_prefix="kw-ai")
        self._owns_executor = executor is None
        self.phase = RoundPhase.READY
        self.puzzle: Optional[Puzzle] = None
        self.config = SolverConfig()
        self.human_board = BoardState(4)
        self.ai_board = BoardState(4)
        self.human_feedback = ""
        self.mistakes = 0
        self.invalid_cells: set[tuple[int, int]] = set()
        self._counted_mistake_cells: set[tuple[int, int]] = set()
        self.x_marks: set[tuple[int, int]] = set()
        self.human_time: Optional[float] = None
        self.ai_time: Optional[float] = None
        self.human_valid = False
        self.ai_valid = False
        self.solver_result: Optional[SolverResult] = None
        self.round_start: Optional[float] = None
        self.deadline: Optional[float] = None
        self.cancel_event = threading.Event()
        self._future: Optional[Future] = None
        self._finalized = False
        self._result: Optional[RoundResult] = None
        self._late_results_ignored = 0
        self.time_limit = 120.0
        self.tolerance = 0.05

    def shutdown(self) -> None:
        self.cancel_event.set()
        if self._owns_executor:
            self._executor.shutdown(wait=False, cancel_futures=True)

    def start_round(
        self,
        puzzle: Puzzle,
        solver: BaseSolver,
        config: Optional[SolverConfig] = None,
        now: Optional[float] = None,
    ) -> None:
        self.cancel_event.set()
        if self._future is not None:
            self._future.cancel()
        self.config = config or SolverConfig()
        self.time_limit = self.config.round_time_limit_seconds
        self.tolerance = self.config.near_simultaneous_tolerance
        self.puzzle = puzzle
        self.human_board = BoardState(puzzle.n)
        self.ai_board = BoardState(puzzle.n)
        self.human_feedback = self.checker.human_feedback(puzzle, [])
        self.mistakes = 0
        self.invalid_cells.clear()
        self._counted_mistake_cells.clear()
        self.x_marks.clear()
        self.human_time = None
        self.ai_time = None
        self.human_valid = False
        self.ai_valid = False
        self.solver_result = None
        self._finalized = False
        self._result = None
        self.phase = RoundPhase.RUNNING
        self.cancel_event = threading.Event()
        started = now if now is not None else time.perf_counter()
        self.round_start = started
        self.deadline = started + self.time_limit
        solver_config = SolverConfig(
            time_limit_seconds=min(self.config.time_limit_seconds, self.time_limit),
            max_nodes=self.config.max_nodes,
            max_expanded=self.config.max_expanded,
            max_generated=self.config.max_generated,
            max_iterations=self.config.max_iterations,
            max_restarts=self.config.max_restarts,
            sideways_moves=self.config.sideways_moves,
            random_seed=self.config.random_seed,
            near_simultaneous_tolerance=self.tolerance,
            round_time_limit_seconds=self.time_limit,
        )
        self._future = self._executor.submit(self._run_ai, puzzle, solver, solver_config, self.cancel_event)

    def _run_ai(
        self,
        puzzle: Puzzle,
        solver: BaseSolver,
        config: SolverConfig,
        cancel_event: threading.Event,
    ) -> SolverResult:
        return solver.solve(puzzle, config, cancel_event)

    def remaining_time(self, now: Optional[float] = None) -> float:
        if self.round_start is None or self.deadline is None:
            return self.time_limit
        clock = now if now is not None else time.perf_counter()
        return max(0.0, self.deadline - clock)

    def elapsed(self, now: Optional[float] = None) -> float:
        if self.round_start is None:
            return 0.0
        clock = now if now is not None else time.perf_counter()
        return max(0.0, clock - self.round_start)

    def toggle_human(self, row: int, col: int) -> None:
        if self.phase not in (RoundPhase.RUNNING, RoundPhase.COMPETITOR_FINISHED):
            return
        if self.human_valid or self.human_board.locked:
            return
        if not (0 <= row < self.human_board.n and 0 <= col < self.human_board.n):
            return
        cell = (row, col)
        if self.human_board.has_queen(row, col):
            self.human_board.remove(row, col)
            assert self.puzzle is not None
            self.human_feedback = self.checker.human_feedback(self.puzzle, self.human_board.queens)
            return

        assert self.puzzle is not None
        errors = self.checker.placement_conflicts(
            self.puzzle,
            self.human_board.queens,
            candidate=cell,
        )
        if errors:
            self.invalid_cells.add(cell)
            if cell not in self._counted_mistake_cells:
                self._counted_mistake_cells.add(cell)
                self.mistakes += 1
            self.human_feedback = (
                f"Invalid queen placement: {' '.join(errors[:3])} "
                f"Mistakes: {self.mistakes}/{self.MAX_MISTAKES}."
            )
            if self.mistakes >= self.MAX_MISTAKES:
                self._finalize_failure()
            return

        self.invalid_cells.discard(cell)
        self.human_board.place(row, col)
        self.human_feedback = self.checker.human_feedback(self.puzzle, self.human_board.queens)

    def toggle_x_mark(self, row: int, col: int) -> None:
        if self.phase not in (RoundPhase.RUNNING, RoundPhase.COMPETITOR_FINISHED):
            return
        if self.human_valid or self.human_board.locked:
            return
        if not (0 <= row < self.human_board.n and 0 <= col < self.human_board.n):
            return
        cell = (row, col)
        if cell in self.x_marks:
            self.x_marks.remove(cell)
        else:
            self.x_marks.add(cell)

    def _finalize_failure(self) -> None:
        if self._finalized or self.puzzle is None:
            return
        self.human_feedback = (
            f"Game over: {self.MAX_MISTAKES} invalid queen placements. "
            "Restart to try this game again."
        )
        self.cancel_event.set()
        self.phase = RoundPhase.ROUND_FINALIZED
        self._finalized = True
        self._result = RoundResult(
            puzzle=self.puzzle,
            outcome=RaceOutcome.HUMAN_FAILED,
            human_board=self.human_board.copy(),
            ai_board=self.ai_board.copy() if self.ai_valid else None,
            human_valid=False,
            ai_valid=self.ai_valid,
            human_time=None,
            ai_time=self.ai_time,
            solver_result=self.solver_result,
            human_feedback=self.human_feedback,
            finalized=True,
            notes=[self.human_feedback],
            mistakes=self.mistakes,
            invalid_cells=frozenset(self.invalid_cells),
            x_marks=frozenset(self.x_marks),
        )

    def submit_human(self, now: Optional[float] = None) -> bool:
        if self._finalized or self.puzzle is None:
            return False
        if self.phase not in (RoundPhase.RUNNING, RoundPhase.COMPETITOR_FINISHED):
            return False
        if self.human_valid:
            return True
        report = self.checker.validate_complete(self.puzzle, self.human_board.queens)
        if not report.valid:
            self.human_feedback = "Submission rejected. " + report.summary()
            return False
        clock = now if now is not None else time.perf_counter()
        self.human_valid = True
        self.human_time = clock - (self.round_start or clock)
        self.human_board.lock()
        self.human_feedback = "Valid solution locked."
        self.phase = RoundPhase.COMPETITOR_FINISHED
        self._maybe_finalize(clock)
        return True

    def restart(self, solver: BaseSolver, config: Optional[SolverConfig] = None) -> None:
        if self.puzzle is None:
            return
        self.start_round(self.puzzle, solver, config or self.config)

    def abandon(self) -> Optional[RoundResult]:
        if self._finalized:
            return self._result
        self.cancel_event.set()
        self.phase = RoundPhase.ROUND_FINALIZED
        self._finalized = True
        assert self.puzzle is not None
        self._result = RoundResult(
            puzzle=self.puzzle,
            outcome=RaceOutcome.ABANDONED,
            human_board=self.human_board.copy(),
            ai_board=None,
            human_valid=False,
            ai_valid=False,
            human_time=self.human_time,
            ai_time=None,
            solver_result=None,
            human_feedback=self.human_feedback,
            finalized=True,
            notes=["Round abandoned; progression is not awarded."],
            mistakes=self.mistakes,
            invalid_cells=frozenset(self.invalid_cells),
            x_marks=frozenset(self.x_marks),
        )
        return self._result

    def tick(self, now: Optional[float] = None) -> Optional[RoundResult]:
        if self._finalized or self.phase == RoundPhase.READY:
            return self._result
        clock = now if now is not None else time.perf_counter()
        self._poll_ai(clock)
        if self.deadline is not None and clock >= self.deadline:
            self.cancel_event.set()
            self._maybe_finalize(clock)
        return self._result

    def _poll_ai(self, now: float) -> None:
        if self._future is None or not self._future.done():
            return
        if self._finalized:
            self._late_results_ignored += 1
            return
        try:
            result = self._future.result()
        except Exception as exc:  # pragma: no cover - defensive
            result = SolverResult(
                algorithm_name="unknown",
                success=False,
                elapsed_seconds=self.elapsed(now),
                termination_reason="error",
                metrics={"error": str(exc)},
            )
        self._apply_ai_result(result, now)

    def apply_ai_result_for_tests(self, result: SolverResult, now: Optional[float] = None) -> None:
        clock = now if now is not None else time.perf_counter()
        self._apply_ai_result(result, clock)

    def _apply_ai_result(self, result: SolverResult, now: float) -> None:
        if self._finalized:
            self._late_results_ignored += 1
            return
        if self.solver_result is not None:
            return
        self.solver_result = result
        if result.success and result.solution is not None and self.puzzle is not None:
            report = self.checker.validate_row_columns(self.puzzle, result.solution)
            if report.valid:
                self.ai_valid = True
                self.ai_board.from_row_columns(result.solution)
                self.ai_board.lock()
                if result.found_at_monotonic is not None and self.round_start is not None:
                    self.ai_time = max(0.0, result.found_at_monotonic - self.round_start)
                else:
                    self.ai_time = result.elapsed_seconds
                if self.phase == RoundPhase.RUNNING:
                    self.phase = RoundPhase.COMPETITOR_FINISHED
        self._maybe_finalize(now)

    def _maybe_finalize(self, now: float) -> None:
        if self._finalized or self.puzzle is None:
            return
        timed_out = self.deadline is not None and now >= self.deadline
        both_solved = self.human_valid and self.ai_valid
        # Never end the race when only one competitor has solved.
        if both_solved or timed_out:
            self._finalize(now)

    def _finalize(self, now: float) -> None:
        if self._finalized or self.puzzle is None:
            return
        self._finalized = True
        self.cancel_event.set()
        self.phase = RoundPhase.ROUND_FINALIZED
        human_t = self.human_time if self.human_valid else None
        ai_t = self.ai_time if self.ai_valid else None
        outcome = self.determine_winner(human_t, ai_t, self.tolerance)
        notes = []
        if human_t is not None and ai_t is not None and abs(human_t - ai_t) <= self.tolerance:
            notes.append(
                f"Times were within the {self.tolerance:.3f}s draw tolerance."
            )
        self._result = RoundResult(
            puzzle=self.puzzle,
            outcome=outcome,
            human_board=self.human_board.copy(),
            ai_board=self.ai_board.copy() if self.ai_valid else None,
            human_valid=self.human_valid,
            ai_valid=self.ai_valid,
            human_time=human_t,
            ai_time=ai_t,
            solver_result=self.solver_result,
            human_feedback=self.human_feedback,
            finalized=True,
            notes=notes,
            mistakes=self.mistakes,
            invalid_cells=frozenset(self.invalid_cells),
            x_marks=frozenset(self.x_marks),
        )

    @staticmethod
    def determine_winner(
        human_time: Optional[float],
        ai_time: Optional[float],
        tolerance: float,
    ) -> RaceOutcome:
        if human_time is None and ai_time is None:
            return RaceOutcome.DRAW
        if human_time is None:
            return RaceOutcome.AI_WIN
        if ai_time is None:
            return RaceOutcome.HUMAN_WIN
        if abs(human_time - ai_time) <= tolerance:
            return RaceOutcome.DRAW
        if human_time < ai_time:
            return RaceOutcome.HUMAN_WIN
        return RaceOutcome.AI_WIN

    @property
    def result(self) -> Optional[RoundResult]:
        return self._result

    @property
    def late_results_ignored(self) -> int:
        return self._late_results_ignored

    @property
    def finalized(self) -> bool:
        return self._finalized
