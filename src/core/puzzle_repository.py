from __future__ import annotations

from ..models.puzzle import KINGDOM_PALETTE, Puzzle
from .constraint_checker import ConstraintChecker
from .puzzle_generator import PuzzleGenerator
from .level_manager import LEVEL_SPECS


# Hand-checked fallbacks used if generation fails. Each has a verified N-Queens
# placement and 4-connected kingdoms compatible with that placement.
_FALLBACKS: dict[str, tuple[int, tuple[tuple[int, ...], ...], tuple[int, ...]]] = {
    "L1G1": (
        4,
        (
            (0, 0, 1, 1),
            (0, 0, 1, 1),
            (2, 2, 3, 3),
            (2, 2, 3, 3),
        ),
        (1, 3, 0, 2),
    ),
    "L1G2": (
        4,
        (
            (0, 0, 0, 1),
            (2, 2, 0, 1),
            (2, 3, 1, 1),
            (2, 3, 3, 3),
        ),
        (2, 0, 3, 1),
    ),
}


class PuzzleRepository:
    def __init__(self) -> None:
        self.checker = ConstraintChecker()
        self.generator = PuzzleGenerator(self.checker)
        self._puzzles: dict[str, Puzzle] = {}
        self._by_level_game: dict[tuple[int, int], Puzzle] = {}
        self._build()

    def _build(self) -> None:
        seeds = {
            (1, 1): 101,
            (1, 2): 202,
            (1, 3): 414,
            (2, 1): 303,
            (2, 2): 515,
            (2, 3): 333,
            (3, 1): 717,
            (3, 2): 818,
            (3, 3): 919,
        }
        for spec in LEVEL_SPECS:
            puzzle_id = f"L{spec.level}G{spec.game}"
            try:
                puzzle = self.generator.generate(
                    n=spec.n,
                    puzzle_id=puzzle_id,
                    level=spec.level,
                    game=spec.game,
                    seed=seeds[(spec.level, spec.game)],
                    prefer_unique=True,
                    max_attempts=60,
                )
            except Exception:
                puzzle = self._fallback_or_raise(puzzle_id, spec.level, spec.game, spec.n)
            report = self.checker.validate_puzzle_definition(puzzle)
            if not report.valid:
                puzzle = self._fallback_or_raise(puzzle_id, spec.level, spec.game, spec.n)
            self._puzzles[puzzle.puzzle_id] = puzzle
            self._by_level_game[(puzzle.level, puzzle.game)] = puzzle

    def _fallback_or_raise(self, puzzle_id: str, level: int, game: int, n: int) -> Puzzle:
        if puzzle_id in _FALLBACKS:
            size, kingdoms, solution = _FALLBACKS[puzzle_id]
            colors = tuple(KINGDOM_PALETTE[i % len(KINGDOM_PALETTE)] for i in range(size))
            puzzle = Puzzle(
                puzzle_id=puzzle_id,
                n=size,
                kingdoms=kingdoms,
                kingdom_colors=colors,
                verified_solution=solution,
                level=level,
                game=game,
                title=f"Level {level} · Game {game}",
            )
            report = self.checker.validate_puzzle_definition(puzzle)
            if report.valid:
                return puzzle
        # Last resort: generate without uniqueness, more attempts.
        return self.generator.generate(
            n=n,
            puzzle_id=puzzle_id,
            level=level,
            game=game,
            seed=n * 1000 + level * 10 + game,
            prefer_unique=False,
            max_attempts=120,
        )

    def all_puzzles(self) -> list[Puzzle]:
        return [self.get(spec.level, spec.game) for spec in LEVEL_SPECS]

    def get(self, level: int, game: int) -> Puzzle:
        return self._by_level_game[(level, game)]

    def by_id(self, puzzle_id: str) -> Puzzle:
        return self._puzzles[puzzle_id]

    def comparison_puzzles(self) -> list[Puzzle]:
        return [
            self.get(1, 1),
            self.get(1, 3),
            self.get(2, 1),
            self.get(3, 2),
        ]
