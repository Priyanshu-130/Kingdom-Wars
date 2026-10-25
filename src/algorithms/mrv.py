from __future__ import annotations

import threading
import time
from typing import Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


class MRVForwardCheckingSolver(BaseSolver):
    """CSP Backtracking with Minimum Remaining Values (MRV) and Forward Checking.

    Variable Ordering:
      MRV (Minimum Remaining Values / Most Constrained Variable):
      Selects the unassigned row with the fewest legal column candidates remaining.
      Ties are broken deterministically by lowest row index.

    Inference:
      Forward Checking:
      After assigning (row, col), immediately checks all other unassigned rows and
      prunes any column candidates that conflict on column, diagonal, or kingdom rules.
      If any unassigned row's domain becomes empty, fails immediately and backtracks,
      restoring previous domain states.

    Guarantees:
      - Completeness: Complete for finite CSP domains.
      - Efficiency: Prunes search branches at depth k rather than failing at depth N.
    """

    algorithm_name = "MRV + Forward Checking"

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
        domains: dict[int, set[int]] = {r: set(range(n)) for r in range(n)}
        assignment: dict[int, int] = {}
        nodes = 0
        backtracks = 0
        eliminated = 0
        reason = TerminationReason.UNSOLVABLE
        found: Optional[tuple[int, ...]] = None
        found_at: Optional[float] = None

        def legal_values(row: int) -> set[int]:
            return {
                col
                for col in domains[row]
                if self.checker.is_safe_assignment(puzzle, assignment, row, col)
            }

        def select_row() -> Optional[int]:
            unassigned = [r for r in range(n) if r not in assignment]
            if not unassigned:
                return None
            return min(unassigned, key=lambda r: (len(legal_values(r)), r))

        def forward_check(row: int, col: int) -> Optional[dict[int, set[int]]]:
            nonlocal eliminated
            snapshot: dict[int, set[int]] = {}
            for other in range(n):
                if other in assignment or other == row:
                    continue
                removed: set[int] = set()
                curr_assignment = {**assignment, row: col}
                for cand in list(domains[other]):
                    if not self.checker.is_safe_assignment(puzzle, curr_assignment, other, cand):
                        removed.add(cand)
                if removed:
                    snapshot[other] = set(domains[other])
                    domains[other].difference_update(removed)
                    eliminated += len(removed)
                if not domains[other]:
                    restore(snapshot)
                    return None
            return snapshot

        def restore(snapshot: dict[int, set[int]]) -> None:
            for r, values in snapshot.items():
                domains[r] = values

        def rec() -> bool:
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
            if len(assignment) == n:
                columns = tuple(assignment[r] for r in range(n))
                if self.checker.validate_row_columns(puzzle, columns).valid:
                    found = columns
                    found_at = time.perf_counter()
                    reason = TerminationReason.SOLVED
                    return True
                return False

            row = select_row()
            if row is None:
                return False
            values = sorted(legal_values(row))
            if not values:
                backtracks += 1
                return False

            for col in values:
                nodes += 1
                assignment[row] = col
                snapshot = forward_check(row, col)
                if snapshot is None:
                    backtracks += 1
                    assignment.pop(row, None)
                    continue
                if rec():
                    return True
                restore(snapshot)
                assignment.pop(row, None)
                backtracks += 1
            return False

        rec()
        metrics = {
            "nodes_visited": nodes,
            "backtracks": backtracks,
            "candidates_eliminated": eliminated,
            "pruned_branches": backtracks,
            "conflicts": backtracks,
            "heuristic": "MRV (Minimum Remaining Values) + Forward Checking",
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


# Alias for backward compatibility
HeuristicBacktrackingSolver = MRVForwardCheckingSolver
