from __future__ import annotations

import heapq
import threading
import time
from dataclasses import dataclass
from typing import Iterable, Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


@dataclass(frozen=True)
class GreedyNode:
    """Immutable partial queen placement: columns[row] is -1 if that row is empty."""

    columns: tuple[int, ...]
    g: int


def calculate_greedy_heuristic(puzzle: Puzzle, columns: tuple[int, ...], g: int, checker) -> int:
    """Meaningful heuristic for Greedy Best-First Search on Kingdom N-Queens.

    Evaluates unassigned variables to estimate distance to completion:
    - Base distance: (N - g) remaining unassigned queens.
    - Domain tightness: For each unassigned row, counts blocked candidate positions.
      Heavily constrained domains receive higher heuristic penalty.
    - Immediate dead-end penalty: If any unassigned row has 0 legal candidates,
      the branch cannot succeed (+10,000 penalty to redirect search).

    Returns:
      h(n) >= 0 where h=0 represents a complete, conflict-free board.
    """
    n = puzzle.n
    if g == n:
        return 0

    total_blocked = 0
    dead_end = False
    for r in range(n):
        if columns[r] >= 0:
            continue
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


class GreedyBestFirstSolver(BaseSolver):
    """Greedy Best-First Search over partial queen placements with priority queue.

    Evaluation function:
      f(n) = h(n)  [pure heuristic evaluation, completely ignoring path cost g(n)].
      Priority queue ordering: min-heap on (h, -g, counter, node).

    Differences from A*:
      - A* evaluates f(n) = g(n) + h(n), balancing cost-so-far with estimated cost.
      - Greedy Best-First evaluates f(n) = h(n) purely greedily, chasing states that
        appear closest to completion. It does NOT use g(n) + h(n) as its priority function.

    Theoretical Limitations & Guarantees:
      - Incompleteness: Unlike systematic backtracking or admissible A*, pure Greedy
        Best-First Search is not guaranteed to find a solution or an optimal path in general
        spaces; greedy heuristic choices can lead down fruitless subtrees.
      - Unsatisfiability: Unless the priority queue and reachable state space are
        exhaustively searched without early cutoff, it cannot formally prove unsatisfiability.
    """

    algorithm_name = "Greedy Best-First Search"

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
        initial_cols = [-1] * n
        fixed_count = 0

        if fixed_queens:
            fixed_assignment: dict[int, int] = {}
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
                if r in fixed_assignment or not self.checker.is_safe_assignment(puzzle, fixed_assignment, r, c):
                    return SolverResult(
                        algorithm_name=self.algorithm_name,
                        success=False,
                        elapsed_seconds=time.perf_counter() - started,
                        termination_reason=TerminationReason.INVALID_FIXED_PLACEMENTS,
                        metrics={"error": f"Fixed queen conflicts: ({r}, {c})"},
                    )
                fixed_assignment[r] = c
                initial_cols[r] = c
                fixed_count += 1

        start = GreedyNode(columns=tuple(initial_cols), g=fixed_count)
        h0 = calculate_greedy_heuristic(puzzle, start.columns, fixed_count, self.checker)

        counter = 0
        # Priority queue strictly orders by h(n) (pure heuristic), breaking ties by deeper progress (-g)
        frontier: list[tuple[int, int, int, GreedyNode]] = []
        heapq.heappush(frontier, (h0, -fixed_count, counter, start))

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
        last_popped_node: Optional[GreedyNode] = None

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
            last_popped_node = node
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
                child_h = calculate_greedy_heuristic(puzzle, child_tuple, child_g, self.checker)
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
            "path_cost": node.g if found and last_popped_node else None,
            "heuristic": "f(n) = h(n) [Greedy Best-First, pure heuristic]",
            "guarantees": "Not guaranteed to find optimal solution or prove unsatisfiability in bounded search.",
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
