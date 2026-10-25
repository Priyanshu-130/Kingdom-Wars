from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterable, Optional

from ..models.puzzle import Puzzle


@dataclass
class ValidationReport:
    valid: bool
    complete: bool
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        if self.valid:
            return "All constraints satisfied."
        if not self.errors:
            return "Solution is incomplete or invalid."
        return " ".join(self.errors)


class ConstraintChecker:
    """Single source of truth for puzzle and placement rules."""

    @staticmethod
    def _normalize(placements: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
        return list(placements)

    def validate_puzzle_definition(self, puzzle: Puzzle) -> ValidationReport:
        errors: list[str] = []
        n = puzzle.n
        if n < 1:
            errors.append("Board size must be positive.")
        if len(puzzle.kingdoms) != n:
            errors.append("Kingdom grid row count does not match N.")
        for row in puzzle.kingdoms:
            if len(row) != n:
                errors.append("Kingdom grid is not N×N.")
                break
        ids = [kid for row in puzzle.kingdoms for kid in row]
        unique = set(ids)
        if unique != set(range(n)):
            errors.append("Kingdom IDs must be exactly 0..N-1, each used.")
        if len(puzzle.kingdom_colors) < n:
            errors.append("Missing kingdom colors.")
        if puzzle.verified_solution:
            if len(puzzle.verified_solution) != n:
                errors.append("Verified solution length must equal N.")
            elif any(c < 0 or c >= n for c in puzzle.verified_solution):
                errors.append("Verified solution contains out-of-range columns.")
        if unique == set(range(n)):
            for kid in range(n):
                if not self.kingdom_is_connected(puzzle, kid):
                    errors.append(f"Kingdom {kid} is not connected.")
        if not errors and puzzle.verified_solution:
            report = self.validate_complete(
                puzzle,
                [(r, puzzle.verified_solution[r]) for r in range(n)],
            )
            if not report.valid:
                errors.append("Stored verified solution is not valid.")
                errors.extend(report.errors)
        return ValidationReport(valid=not errors, complete=True, errors=errors)

    def kingdom_is_connected(self, puzzle: Puzzle, kingdom_id: int) -> bool:
        cells = [
            (r, c)
            for r, c in puzzle.all_cells()
            if puzzle.kingdom_at(r, c) == kingdom_id
        ]
        if not cells:
            return False
        start = cells[0]
        seen = {start}
        q: deque[tuple[int, int]] = deque([start])
        n = puzzle.n
        while q:
            r, c = q.popleft()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:
                    if puzzle.kingdom_at(nr, nc) == kingdom_id:
                        seen.add((nr, nc))
                        q.append((nr, nc))
        return len(seen) == len(cells)

    def placement_conflicts(
        self,
        puzzle: Puzzle,
        placements: Iterable[tuple[int, int]],
        candidate: Optional[tuple[int, int]] = None,
    ) -> list[str]:
        queens = self._normalize(placements)
        if candidate is not None:
            queens = queens + [candidate]
        errors: list[str] = []
        n = puzzle.n
        rows: dict[int, int] = defaultdict(int)
        cols: dict[int, int] = defaultdict(int)
        kingdoms: dict[int, int] = defaultdict(int)
        for r, c in queens:
            if not (0 <= r < n and 0 <= c < n):
                errors.append("Queen is outside the board.")
                continue
            rows[r] += 1
            cols[c] += 1
            kingdoms[puzzle.kingdom_at(r, c)] += 1
        for r, count in rows.items():
            if count > 1:
                errors.append(f"Row {r + 1} has more than one queen.")
        for c, count in cols.items():
            if count > 1:
                errors.append(f"Column {c + 1} has more than one queen.")
        for k, count in kingdoms.items():
            if count > 1:
                errors.append(f"Kingdom {k + 1} has more than one queen.")
        placed = [(r, c) for r, c in queens if 0 <= r < n and 0 <= c < n]
        for i in range(len(placed)):
            r1, c1 = placed[i]
            for j in range(i + 1, len(placed)):
                r2, c2 = placed[j]
                if abs(r1 - r2) == abs(c1 - c2):
                    errors.append("Two queens share a diagonal.")
                    return errors
        return errors

    def is_safe_partial(self, puzzle: Puzzle, columns: list[int], row: int, col: int) -> bool:
        """columns[r] = col for filled rows r < row; -1 otherwise. Check adding (row, col)."""
        n = puzzle.n
        if not (0 <= row < n and 0 <= col < n):
            return False
        used_kingdoms = set()
        for r in range(n):
            c = columns[r]
            if c < 0:
                continue
            if c == col:
                return False
            if abs(r - row) == abs(c - col):
                return False
            used_kingdoms.add(puzzle.kingdom_at(r, c))
        if puzzle.kingdom_at(row, col) in used_kingdoms:
            return False
        return True

    def is_safe_assignment(self, puzzle: Puzzle, columns: dict[int, int], row: int, col: int) -> bool:
        n = puzzle.n
        if not (0 <= row < n and 0 <= col < n):
            return False
        kid = puzzle.kingdom_at(row, col)
        for r, c in columns.items():
            if c == col:
                return False
            if abs(r - row) == abs(c - col):
                return False
            if puzzle.kingdom_at(r, c) == kid:
                return False
        return True

    def validate_complete(
        self,
        puzzle: Puzzle,
        placements: Iterable[tuple[int, int]],
    ) -> ValidationReport:
        queens = self._normalize(placements)
        n = puzzle.n
        errors: list[str] = []
        complete = len(queens) == n
        if len(queens) != n:
            errors.append(f"Need exactly {n} queens; found {len(queens)}.")
        if len(set(queens)) != len(queens):
            errors.append("Duplicate placements are not allowed.")
        errors.extend(self.placement_conflicts(puzzle, queens))
        rows = {r for r, _ in queens}
        cols = {c for _, c in queens}
        if len(queens) == n:
            if len(rows) != n:
                errors.append("Every row must contain exactly one queen.")
            if len(cols) != n:
                errors.append("Every column must contain exactly one queen.")
            kingdoms = {puzzle.kingdom_at(r, c) for r, c in queens if 0 <= r < n and 0 <= c < n}
            if kingdoms != set(range(n)):
                errors.append("Every kingdom must contain exactly one queen.")
        unique_errors = []
        seen = set()
        for err in errors:
            if err not in seen:
                unique_errors.append(err)
                seen.add(err)
        valid = not unique_errors and complete
        return ValidationReport(valid=valid, complete=complete, errors=unique_errors)

    def validate_row_columns(self, puzzle: Puzzle, columns: tuple[int, ...]) -> ValidationReport:
        if len(columns) != puzzle.n:
            return ValidationReport(
                valid=False,
                complete=False,
                errors=["Column assignment length does not match N."],
            )
        placements = [(r, columns[r]) for r in range(puzzle.n)]
        return self.validate_complete(puzzle, placements)

    def human_feedback(self, puzzle: Puzzle, placements: Iterable[tuple[int, int]]) -> str:
        queens = self._normalize(placements)
        n = puzzle.n
        if not queens:
            return "Place one queen in each row, column, and kingdom. Diagonals are forbidden."
        conflicts = self.placement_conflicts(puzzle, queens)
        missing = n - len(queens)
        parts = []
        if missing > 0:
            parts.append(f"{missing} queen(s) still needed.")
        if len(queens) > n:
            parts.append(f"Too many queens ({len(queens)}/{n}).")
        if conflicts:
            parts.extend(conflicts[:3])
        if not parts:
            if len(queens) == n:
                report = self.validate_complete(puzzle, queens)
                if report.valid:
                    return "Looks valid. Submit when you are ready."
                return report.summary()
            return "No conflicts yet. Keep placing queens."
        return " ".join(parts)
