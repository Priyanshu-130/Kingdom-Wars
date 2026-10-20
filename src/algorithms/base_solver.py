from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod
from typing import Optional

from ..core.constraint_checker import ConstraintChecker
from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason


class BaseSolver(ABC):
    algorithm_name: str = "base"

    def __init__(self, checker: Optional[ConstraintChecker] = None) -> None:
        self.checker = checker or ConstraintChecker()

    @abstractmethod
    def solve(
        self,
        puzzle: Puzzle,
        config: SolverConfig,
        cancel_event: Optional[threading.Event] = None,
    ) -> SolverResult:
        raise NotImplementedError

    def _cancelled(self, cancel_event: Optional[threading.Event]) -> bool:
        return bool(cancel_event and cancel_event.is_set())

    def _timed_out(self, started: float, config: SolverConfig) -> bool:
        return (time.perf_counter() - started) >= config.time_limit_seconds

    def _invalid_puzzle_result(self, puzzle: Puzzle, started: float) -> SolverResult:
        report = self.checker.validate_puzzle_definition(puzzle)
        return SolverResult(
            algorithm_name=self.algorithm_name,
            success=False,
            elapsed_seconds=time.perf_counter() - started,
            termination_reason=TerminationReason.INVALID_PUZZLE,
            metrics={"errors": report.errors},
        )

    def _finish(
        self,
        started: float,
        success: bool,
        solution: Optional[tuple[int, ...]],
        reason: str,
        metrics: dict,
        seed: Optional[int] = None,
        found_at: Optional[float] = None,
        puzzle: Optional[Puzzle] = None,
    ) -> SolverResult:
        if success and puzzle is not None and solution is not None:
            report = self.checker.validate_row_columns(puzzle, solution)
            if not report.valid:
                return SolverResult(
                    algorithm_name=self.algorithm_name,
                    success=False,
                    elapsed_seconds=time.perf_counter() - started,
                    termination_reason=TerminationReason.UNSOLVABLE,
                    metrics={**metrics, "validation_errors": report.errors},
                    random_seed=seed,
                )
        return SolverResult(
            algorithm_name=self.algorithm_name,
            success=success,
            solution=solution if success else None,
            elapsed_seconds=time.perf_counter() - started,
            metrics=metrics,
            termination_reason=reason,
            random_seed=seed,
            found_at_monotonic=found_at if success else None,
        )
