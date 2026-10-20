from __future__ import annotations

from typing import Iterable, Optional


class BoardState:
    """Mutable independent board for one competitor."""

    def __init__(self, n: int, queens: Optional[Iterable[tuple[int, int]]] = None) -> None:
        if n < 1:
            raise ValueError("Board size must be positive")
        self.n = n
        self._queens: set[tuple[int, int]] = set(queens or ())
        self._locked = False

    @property
    def queens(self) -> frozenset[tuple[int, int]]:
        return frozenset(self._queens)

    @property
    def locked(self) -> bool:
        return self._locked

    def lock(self) -> None:
        self._locked = True

    def copy(self) -> "BoardState":
        clone = BoardState(self.n, self._queens)
        clone._locked = self._locked
        return clone

    def has_queen(self, row: int, col: int) -> bool:
        return (row, col) in self._queens

    def queen_count(self) -> int:
        return len(self._queens)

    def toggle(self, row: int, col: int) -> bool:
        if self._locked:
            return False
        if not (0 <= row < self.n and 0 <= col < self.n):
            return False
        cell = (row, col)
        if cell in self._queens:
            self._queens.remove(cell)
        else:
            self._queens.add(cell)
        return True

    def place(self, row: int, col: int) -> bool:
        if self._locked:
            return False
        if not (0 <= row < self.n and 0 <= col < self.n):
            return False
        self._queens.add((row, col))
        return True

    def remove(self, row: int, col: int) -> bool:
        if self._locked:
            return False
        self._queens.discard((row, col))
        return True

    def clear(self) -> None:
        if self._locked:
            return
        self._queens.clear()

    def as_row_columns(self) -> Optional[tuple[int, ...]]:
        """Return column-per-row if there is exactly one queen per row, else None."""
        cols = [-1] * self.n
        for row, col in self._queens:
            if cols[row] != -1:
                return None
            cols[row] = col
        if any(c < 0 for c in cols):
            return None
        return tuple(cols)

    def from_row_columns(self, columns: Iterable[int]) -> None:
        if self._locked:
            return
        cols = list(columns)
        self._queens = {(r, cols[r]) for r in range(self.n)}
