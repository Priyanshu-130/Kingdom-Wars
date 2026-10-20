from __future__ import annotations

import heapq
import threading
import time
from dataclasses import dataclass
from typing import Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


@dataclass(frozen=True)
class AStarNode:
    """Immutable partial placement: columns[row] is -1 if that row is empty."""

    columns: tuple[int, ...]
    g: int

    def placed_count(self) -> int:
        return self.g

    def f(self, n: int) -> int:
        return self.g + self.h(n)

    def h(self, n: int) -> int:
        """Admissible baseline: each remaining queen costs at least 1.

        h(n) = N - q(n). Combined with g(n) = q(n), f(n) = N for every node.
        That does not make A* faster than backtracking; it only guarantees
        that any found goal has path cost N, which is true of every valid
        complete placement.
        """
        return n - self.g


class AStarSolver(BaseSolver):
    """A* over immutable partial queen placements with heapq."""

    algorithm_name = "A* Search"

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
        start = AStarNode(columns=tuple([-1] * n), g=0)
        counter = 0
        frontier: list[tuple[int, int, int, AStarNode]] = []
        heapq.heappush(frontier, (start.f(n), start.g, counter, start))
        explored: set[tuple[int, ...]] = set()
        expanded = 0
        generated = 1
        duplicates = 0
        max_frontier = 1
        reason = TerminationReason.UNSOLVABLE
        found: Optional[tuple[int, ...]] = None
        found_at: Optional[float] = None
        path_cost: Optional[int] = None

        while frontier:
            if self._cancelled(cancel_event):
                reason = TerminationReason.CANCELLED
                break
            if self._timed_out(started, config):
                reason = TerminationReason.TIMEOUT
                break
            if expanded >= config.max_expanded:
                reason = TerminationReason.EXPANDED_LIMIT
                break
            if generated >= config.max_generated:
                reason = TerminationReason.NODE_LIMIT
                break

            _f, _g, _id, node = heapq.heappop(frontier)
            if node.columns in explored:
                duplicates += 1
                continue
            explored.add(node.columns)
            expanded += 1

            if node.g == n:
                candidate = node.columns
                if self.checker.validate_row_columns(puzzle, candidate).valid:
                    found = candidate
                    found_at = time.perf_counter()
                    path_cost = node.g
                    reason = TerminationReason.SOLVED
                    break
                continue

            next_row = next((r for r, c in enumerate(node.columns) if c < 0), None)
            if next_row is None:
                continue
            cols = list(node.columns)
            for col in range(n):
                generated += 1
                if not self.checker.is_safe_partial(puzzle, cols, next_row, col):
                    continue
                child_cols = list(node.columns)
                child_cols[next_row] = col
                child_state = tuple(child_cols)
                if child_state in explored:
                    duplicates += 1
                    continue
                child = AStarNode(columns=child_state, g=node.g + 1)
                counter += 1
                heapq.heappush(frontier, (child.f(n), child.g, counter, child))
            max_frontier = max(max_frontier, len(frontier))

        metrics = {
            "states_expanded": expanded,
            "states_generated": generated,
            "duplicates_skipped": duplicates,
            "max_frontier_size": max_frontier,
            "explored_states": len(explored),
            "path_cost": path_cost,
            "heuristic": "h(n) = N - q(n), g(n) = q(n), f(n) = g(n) + h(n)",
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
