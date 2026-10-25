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


def calculate_astar_heuristic(puzzle: Puzzle, columns: tuple[int, ...], g: int, checker) -> int:
    """Informative heuristic for A* and Greedy search on Kingdom N-Queens.

    Instead of the degenerate baseline h(n) = N - g (which makes f = g + h = N constant
    for every state and provides zero search guidance), this heuristic evaluates the
    remaining unassigned variables.

    For each unassigned row r:
      - Counts legal column options satisfying row, column, diagonal, and kingdom rules.
      - If any unassigned row has 0 legal options, the branch is a dead end (penalty +10000).
      - Otherwise, accumulates the domain reduction (N - legal_options).

    Returns:
      (N - g) + domain_reduction_penalty.
    """
    n = puzzle.n
    if g == n:
        return 0

    total_blocked = 0
    dead_end = False
    for r in range(g, n):
        legal_count = 0
        for c in range(n):
            if checker.is_safe_partial(puzzle, list(columns), r, c):
                legal_count += 1
            else:
                total_blocked += 1
        if legal_count == 0:
            dead_end = True

    if dead_end:
        return 10_000 + (n - g)
    return (n - g) + total_blocked


class AStarSolver(BaseSolver):
    """A* Search over partial queen placements with priority queue (heapq).

    Evaluation function:
      f(n) = g(n) + h(n)
      g(n): number of queens placed so far (depth).
      h(n): estimated remaining cost based on unassigned rows and domain tightness.

    Notes on properties and guarantees:
      - Completeness: Complete for finite state spaces (finite N).
      - Guidance: By incorporating unassigned domain reduction, f(n) differentiates
        promising branches from heavily constrained or dead-end branches.
      - Limitation: Because h(n) adds domain reduction to guide search, it is an
        informed heuristic for CSP satisfaction rather than a strictly admissible
        shortest-path heuristic.
    """

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
        h0 = calculate_astar_heuristic(puzzle, start.columns, 0, self.checker)
        f0 = start.g + h0

        counter = 0
        # (f, h, counter, g, node)
        frontier: list[tuple[int, int, int, int, AStarNode]] = []
        heapq.heappush(frontier, (f0, h0, counter, start.g, start))

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

            _f, _h, _id, _g, node = heapq.heappop(frontier)
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
                child_f = child_g + child_h
                child_node = AStarNode(columns=child_tuple, g=child_g)

                counter += 1
                heapq.heappush(frontier, (child_f, child_h, counter, child_g, child_node))

            max_frontier = max(max_frontier, len(frontier))

        metrics = {
            "states_expanded": expanded,
            "states_generated": generated,
            "duplicates_skipped": duplicates,
            "max_frontier_size": max_frontier,
            "explored_states": len(explored),
            "conflicts": conflicts,
            "pruned_branches": pruned_branches,
            "path_cost": path_cost,
            "heuristic": "f(n) = g(n) + h(n), with h(n) = (N - q) + unassigned domain reduction penalty",
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
