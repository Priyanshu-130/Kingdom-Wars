from __future__ import annotations

import heapq
import threading
import time
from dataclasses import dataclass
from typing import Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .astar import calculate_astar_heuristic
from .base_solver import BaseSolver


@dataclass(frozen=True)
class GreedyNode:
    """Immutable partial placement: columns[row] is -1 if that row is empty."""

    columns: tuple[int, ...]
    g: int


class GreedyBestFirstSolver(BaseSolver):
    """Greedy Best-First Search over partial queen placements with priority queue.

    Evaluation function:
      f(n) = h(n)  [completely ignores path cost g(n)]
      h(n): estimated remaining distance based on unassigned rows and domain tightness.

    Differences from A*:
      - A* evaluates f(n) = g(n) + h(n), balancing cost-so-far with estimated cost.
      - Greedy Best-First evaluates f(n) = h(n) purely greedily, chasing states that
        appear closest to completion.
      - Incompleteness: Unlike A*, pure Greedy Best-First Search is not guaranteed to
        be complete within bounded node/depth limits and can explore suboptimal dead-ends
        when heuristic estimates are misleading.
    """

    algorithm_name = "Greedy Best-First Search"

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
        start = GreedyNode(columns=tuple([-1] * n), g=0)
        h0 = calculate_astar_heuristic(puzzle, start.columns, 0, self.checker)

        counter = 0
        # (h, -g, counter, node) -> tie-break by deeper progress (-g), then FIFO (counter)
        frontier: list[tuple[int, int, int, GreedyNode]] = []
        heapq.heappush(frontier, (h0, 0, counter, start))

        explored: set[tuple[int, ...]] = set()
        expanded = 0
        generated = 1
        duplicates = 0
        conflicts = 0
        pruned_branches = 0
        max_frontier = 1
        reason = TerminationReason.UNSOLVABLE
        found: Optional[tuple[int, ...]] = None
        found_at: Optional[float] = None

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

            _h, _neg_g, _id, node = heapq.heappop(frontier)
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
                    conflicts += 1
                    pruned_branches += 1
                    continue

                child_cols = list(node.columns)
                child_cols[next_row] = col
                child_tuple = tuple(child_cols)
                if child_tuple in explored:
                    duplicates += 1
                    pruned_branches += 1
                    continue

                child_g = node.g + 1
                child_h = calculate_astar_heuristic(puzzle, child_tuple, child_g, self.checker)
                child_node = GreedyNode(columns=child_tuple, g=child_g)

                counter += 1
                heapq.heappush(frontier, (child_h, -child_g, counter, child_node))

            max_frontier = max(max_frontier, len(frontier))

        metrics = {
            "states_expanded": expanded,
            "states_generated": generated,
            "duplicates_skipped": duplicates,
            "max_frontier_size": max_frontier,
            "explored_states": len(explored),
            "conflicts": conflicts,
            "pruned_branches": pruned_branches,
            "path_cost": node.g if found else None,
            "heuristic": "f(n) = h(n) [Greedy Best-First, pure heuristic]",
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
