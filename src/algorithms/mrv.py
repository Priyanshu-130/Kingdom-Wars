from __future__ import annotations

import threading
import time
from typing import Iterable, Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


class MRVForwardCheckingSolver(BaseSolver):
    """CSP Backtracking with Minimum Remaining Values (MRV) and Forward Checking.

    Variable Ordering:
      MRV (Minimum Remaining Values / Most Constrained Variable):
      Dynamically selects the unassigned row with the fewest legal column candidates remaining.
      Ties are broken deterministically by lowest row index.

    Inference (Forward Checking):
      After assigning a queen to (row, col), immediately checks all remaining unassigned rows
      and prunes any column values that violate column, diagonal, or kingdom constraints.
      If any unassigned row's domain is reduced to zero candidates, immediately detects
      the wipeout and backtracks at depth k rather than failing at depth N.

    Domain Restoration:
      Before pruning, takes an exact snapshot of affected domains. When backtracking
      from a branch, restores all pruned domain states faithfully.

    Guarantees & Properties:
      - Completeness: Complete for finite CSP domains; guaranteed to find a valid solution
        or prove unsatisfiability if one does not exist (within node and time limits).
      - Soundness: All reported solutions strictly satisfy row, column, diagonal, and
        connected-kingdom constraints.
    """

    algorithm_name = "MRV + Forward Checking"

    def solve(
        self,
        puzzle: Puzzle,
        config: SolverConfig,
        cancel_event: Optional[threading.Event] = None,
        fixed_queens: Optional[Iterable[tuple[int, int]]] = None,
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
            curr_assignment = {**assignment, row: col}
            for other in range(n):
                if other in curr_assignment:
                    continue
                removed: set[int] = set()
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
                domains[r] = set(values)

        # Handle pre-fixed queens if provided
        if fixed_queens:
            for placement in fixed_queens:
                if not isinstance(placement, (list, tuple)) or len(placement) != 2:
                    return SolverResult(
                        algorithm_name=self.algorithm_name,
                        success=False,
                        elapsed_seconds=time.perf_counter() - started,
                        termination_reason=TerminationReason.INVALID_FIXED_PLACEMENTS,
                        metrics={"error": "Malformed fixed queen placement"},
                    )
                r, c = placement
                if not (0 <= r < n and 0 <= c < n):
                    return SolverResult(
                        algorithm_name=self.algorithm_name,
                        success=False,
                        elapsed_seconds=time.perf_counter() - started,
                        termination_reason=TerminationReason.INVALID_FIXED_PLACEMENTS,
                        metrics={"error": f"Fixed queen out of bounds: ({r}, {c})"},
                    )
                if r in assignment or not self.checker.is_safe_assignment(puzzle, assignment, r, c):
                    return SolverResult(
                        algorithm_name=self.algorithm_name,
                        success=False,
                        elapsed_seconds=time.perf_counter() - started,
                        termination_reason=TerminationReason.INVALID_FIXED_PLACEMENTS,
                        metrics={"error": f"Fixed queen conflicts: ({r}, {c})"},
                    )
                assignment[r] = c
                domains[r] = {c}
                # Forward check the fixed placement
                snap = forward_check(r, c)
                if snap is None:
                    return SolverResult(
                        algorithm_name=self.algorithm_name,
                        success=False,
                        elapsed_seconds=time.perf_counter() - started,
                        termination_reason=TerminationReason.UNSOLVABLE,
                        metrics={"error": f"Fixed queen domain wipeout: ({r}, {c})"},
                    )

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
            "completeness": "Complete systematic CSP search with forward inference",
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
