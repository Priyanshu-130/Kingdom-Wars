from __future__ import annotations

import random
import threading
import time
from typing import Optional

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult, TerminationReason
from .base_solver import BaseSolver


class HillClimbingSolver(BaseSolver):
    """Local search over column permutations. Not guaranteed to find a solution.

    Candidate: permutation p where a queen sits at (row i, column p[i]).
    This representation already enforces one queen per row and per column.

    Conflict score:
      diagonal_pairs + kingdom_pairs
    where a pair of queens contributes 1 if they share a diagonal, and 1 if
    they share a kingdom. Score 0 is necessary but not sufficient until the
    shared ConstraintChecker accepts the candidate.
    """

    algorithm_name = "Hill Climbing"

    def conflict_score(self, puzzle: Puzzle, perm: tuple[int, ...]) -> int:
        n = puzzle.n
        score = 0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(i - j) == abs(perm[i] - perm[j]):
                    score += 1
                if puzzle.kingdom_at(i, perm[i]) == puzzle.kingdom_at(j, perm[j]):
                    score += 1
        return score

    def neighbors(self, perm: tuple[int, ...]) -> list[tuple[int, ...]]:
        n = len(perm)
        result = []
        base = list(perm)
        for i in range(n):
            for j in range(i + 1, n):
                nxt = list(base)
                nxt[i], nxt[j] = nxt[j], nxt[i]
                result.append(tuple(nxt))
        return result

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

        rng = random.Random(config.random_seed)
        n = puzzle.n
        iterations = 0
        restarts = 0
        evaluations = 0
        reason = TerminationReason.RESTART_LIMIT
        found: Optional[tuple[int, ...]] = None
        found_at: Optional[float] = None
        initial_score: Optional[int] = None
        final_score: Optional[int] = None
        best_ever: Optional[tuple[int, ...]] = None
        best_ever_score = 10**9

        def evaluate(perm: tuple[int, ...]) -> int:
            nonlocal evaluations
            evaluations += 1
            return self.conflict_score(puzzle, perm)

        while restarts < config.max_restarts:
            if self._cancelled(cancel_event):
                reason = TerminationReason.CANCELLED
                break
            if self._timed_out(started, config):
                reason = TerminationReason.TIMEOUT
                break

            current = tuple(rng.sample(range(n), n))
            current_score = evaluate(current)
            if initial_score is None:
                initial_score = current_score
            if current_score < best_ever_score:
                best_ever_score = current_score
                best_ever = current
            sideways = 0

            improved = True
            while improved:
                if self._cancelled(cancel_event):
                    reason = TerminationReason.CANCELLED
                    found = None
                    break
                if self._timed_out(started, config):
                    reason = TerminationReason.TIMEOUT
                    break
                if iterations >= config.max_iterations:
                    reason = TerminationReason.ITERATION_LIMIT
                    break

                iterations += 1
                best_neighbor = None
                best_score = current_score
                equal_neighbors: list[tuple[int, ...]] = []
                for neigh in self.neighbors(current):
                    score = evaluate(neigh)
                    if score < best_score:
                        best_score = score
                        best_neighbor = neigh
                        equal_neighbors = []
                    elif score == current_score:
                        equal_neighbors.append(neigh)
                    if score < best_ever_score:
                        best_ever_score = score
                        best_ever = neigh

                if best_neighbor is not None and best_score < current_score:
                    current = best_neighbor
                    current_score = best_score
                    sideways = 0
                    if current_score == 0:
                        report = self.checker.validate_row_columns(puzzle, current)
                        if report.valid:
                            found = current
                            found_at = time.perf_counter()
                            reason = TerminationReason.SOLVED
                            final_score = 0
                            improved = False
                            break
                    continue

                if equal_neighbors and sideways < config.sideways_moves:
                    current = rng.choice(equal_neighbors)
                    sideways += 1
                    continue

                improved = False
                reason = TerminationReason.LOCAL_OPTIMUM

            final_score = current_score
            if found is not None:
                break
            restarts += 1

        if found is None and best_ever is not None:
            final_score = best_ever_score

        metrics = {
            "iterations": iterations,
            "restarts": restarts,
            "objective_evaluations": evaluations,
            "initial_conflict_score": initial_score,
            "final_conflict_score": final_score,
            "objective": "diagonal_pairs + kingdom_pairs over a column permutation",
        }
        return self._finish(
            started,
            found is not None,
            found,
            reason,
            metrics,
            seed=config.random_seed,
            puzzle=puzzle,
            found_at=found_at,
        )
