from __future__ import annotations

from dataclasses import dataclass


KINGDOM_PALETTE: tuple[tuple[int, int, int], ...] = (
    (56, 182, 255),
    (255, 107, 107),
    (255, 209, 102),
    (6, 214, 160),
    (181, 131, 255),
    (255, 159, 67),
    (94, 234, 212),
    (244, 114, 182),
)


@dataclass(frozen=True)
class Puzzle:
    """Immutable puzzle definition. The verified solution is for tests/generation only."""

    puzzle_id: str
    n: int
    kingdoms: tuple[tuple[int, ...], ...]
    kingdom_colors: tuple[tuple[int, int, int], ...]
    verified_solution: tuple[int, ...]
    level: int
    game: int
    title: str = ""
    difficulty: str = ""

    def kingdom_at(self, row: int, col: int) -> int:
        return self.kingdoms[row][col]

    def color_for_kingdom(self, kingdom_id: int) -> tuple[int, int, int]:
        return self.kingdom_colors[kingdom_id]

    def all_cells(self) -> list[tuple[int, int]]:
        return [(r, c) for r in range(self.n) for c in range(self.n)]
