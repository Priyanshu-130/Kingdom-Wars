from __future__ import annotations

import threading
import time
from typing import Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


class BacktrackingSolver(BaseSolver):
    """Place queens one row at a time; undo when a partial assignment fails."""

    algorithm_name = "Basic Backtracking"

    def solve(
        self,
        puzzle: Puzzle,
        config: SolverConfig,
        cancel_event: Optional[threading.Event] = None,
    ) -> SolverResult:
        started = time.perf_counter()
        defn = self.checker.validate_puzzle_definition(puzzle)
        if not defn.valid:
            return self._invalid_puzzle_result(puzzle, started)

        n = puzzle.n
        columns = [-1] * n
        nodes = 0
        backtracks = 0
        reason = TerminationReason.UNSOLVABLE
        found: Optional[tuple[int, ...]] = None
        found_at: Optional[float] = None

        def rec(row: int) -> bool:
            nonlocal nodes, backtracks, reason, found, found_at
            if self._cancelled(cancel_event):
                reason = TerminationReason.CANCELLED
                return True
            if self._timed_out(started, config):
                reason = TerminationReason.TIMEOUT
                return True
            if nodes >= config.max_nodes:
                reason = TerminationReason.NODE_LIMIT
                return True
            if row == n:
                candidate = tuple(columns)
                if self.checker.validate_row_columns(puzzle, candidate).valid:
                    found = candidate
                    found_at = time.perf_counter()
                    reason = TerminationReason.SOLVED
                    return True
                return False
            for col in range(n):
                nodes += 1
                if self.checker.is_safe_partial(puzzle, columns, row, col):
                    columns[row] = col
                    if rec(row + 1):
                        return True
                    columns[row] = -1
                    backtracks += 1
                else:
                    backtracks += 1
            return False

        rec(0)
        metrics = {
            "nodes_visited": nodes,
            "backtracks": backtracks,
        }
        return self._finish(
            started,
            found is not None,
            found,
            reason,
            metrics,
            puzzle=puzzle,
            found_at=found_at,
        )
