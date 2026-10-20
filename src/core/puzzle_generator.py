from __future__ import annotations

import random
from collections import defaultdict, deque
from typing import Optional

from ..models.puzzle import KINGDOM_PALETTE, Puzzle
from .constraint_checker import ConstraintChecker


class PuzzleGenerator:
    """Build connected kingdoms around a known valid N-Queens arrangement."""

    def __init__(self, checker: Optional[ConstraintChecker] = None) -> None:
        self.checker = checker or ConstraintChecker()

    def n_queens_solutions(self, n: int, limit: int = 80) -> list[tuple[int, ...]]:
        solutions: list[tuple[int, ...]] = []
        cols = [-1] * n

        def safe(row: int, col: int) -> bool:
            for r in range(row):
                c = cols[r]
                if c == col or abs(r - row) == abs(c - col):
                    return False
            return True

        def rec(row: int) -> None:
            if len(solutions) >= limit:
                return
            if row == n:
                solutions.append(tuple(cols))
                return
            for col in range(n):
                if safe(row, col):
                    cols[row] = col
                    rec(row + 1)
                    cols[row] = -1

        rec(0)
        return solutions

    def count_kingdom_solutions(self, puzzle: Puzzle, limit: int = 8) -> int:
        n = puzzle.n
        columns = [-1] * n
        count = 0

        def rec(row: int) -> None:
            nonlocal count
            if count >= limit:
                return
            if row == n:
                report = self.checker.validate_row_columns(puzzle, tuple(columns))
                if report.valid:
                    count += 1
                return
            for col in range(n):
                if self.checker.is_safe_partial(puzzle, columns, row, col):
                    columns[row] = col
                    rec(row + 1)
                    columns[row] = -1

        rec(0)
        return count

    def _grow_kingdoms(self, n: int, solution: tuple[int, ...], rng: random.Random) -> list[list[int]]:
        grid = [[-1] * n for _ in range(n)]
        frontiers: dict[int, list[tuple[int, int]]] = {}
        for kid, col in enumerate(solution):
            grid[kid][col] = kid
            frontiers[kid] = [(kid, col)]

        remaining = n * n - n
        while remaining > 0:
            progressed = False
            order = list(range(n))
            rng.shuffle(order)
            for kid in order:
                rng.shuffle(frontiers[kid])
                placed = False
                for r, c in list(frontiers[kid]):
                    neighbors = [(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)]
                    rng.shuffle(neighbors)
                    for nr, nc in neighbors:
                        if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == -1:
                            grid[nr][nc] = kid
                            frontiers[kid].append((nr, nc))
                            remaining -= 1
                            placed = True
                            progressed = True
                            break
                    if placed:
                        break
            if not progressed:
                # Attach leftover cells to a neighboring kingdom.
                for r in range(n):
                    for c in range(n):
                        if grid[r][c] != -1:
                            continue
                        opts = []
                        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                            if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] >= 0:
                                opts.append(grid[nr][nc])
                        if opts:
                            kid = rng.choice(opts)
                            grid[r][c] = kid
                            frontiers[kid].append((r, c))
                            remaining -= 1
                            progressed = True
                if not progressed:
                    break
        return grid

    def generate(
        self,
        n: int,
        puzzle_id: str,
        level: int,
        game: int,
        seed: int,
        prefer_unique: bool = True,
        max_attempts: int = 80,
    ) -> Puzzle:
        rng = random.Random(seed)
        nq = self.n_queens_solutions(n)
        if not nq:
            raise ValueError(f"No N-Queens solutions exist for n={n}")
        best: Optional[Puzzle] = None
        best_count = 10**9
        for attempt in range(max_attempts):
            solution = nq[rng.randrange(len(nq))]
            grid = self._grow_kingdoms(n, solution, rng)
            if any(cell < 0 for row in grid for cell in row):
                continue
            colors = tuple(KINGDOM_PALETTE[i % len(KINGDOM_PALETTE)] for i in range(n))
            kingdoms = tuple(tuple(row) for row in grid)
            puzzle = Puzzle(
                puzzle_id=puzzle_id,
                n=n,
                kingdoms=kingdoms,
                kingdom_colors=colors,
                verified_solution=solution,
                level=level,
                game=game,
                title=f"Level {level} · Game {game}",
                difficulty=f"n={n}",
            )
            defn = self.checker.validate_puzzle_definition(puzzle)
            if not defn.valid:
                continue
            count = self.count_kingdom_solutions(puzzle, limit=6)
            if count < 1:
                continue
            if prefer_unique and count == 1:
                return puzzle
            if count < best_count:
                best = puzzle
                best_count = count
        if best is None:
            raise RuntimeError(f"Could not generate a valid puzzle for {puzzle_id}")
        return best
