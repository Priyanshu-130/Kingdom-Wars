from __future__ import annotations

from dataclasses import dataclass

from ..algorithms.astar import AStarSolver
from ..algorithms.backtracking import BacktrackingSolver
from ..algorithms.base_solver import BaseSolver
from ..algorithms.greedy import GreedyBestFirstSolver
from ..algorithms.mrv import MRVForwardCheckingSolver


@dataclass(frozen=True)
class LevelSpec:
    level: int
    game: int
    n: int
    algorithm_key: str
    algorithm_title: str
    description: str


LEVEL_SPECS: tuple[LevelSpec, ...] = (
    LevelSpec(1, 1, 4, "backtracking", "Basic Backtracking", "Easy"),
    LevelSpec(1, 2, 4, "backtracking", "Basic Backtracking", "Easy"),
    LevelSpec(1, 3, 4, "backtracking", "Basic Backtracking", "Easy"),
    LevelSpec(2, 1, 5, "astar", "A* Search", "Hard"),
    LevelSpec(2, 2, 5, "astar", "A* Search", "Hard"),
    LevelSpec(2, 3, 6, "astar", "A* Search", "Hard"),
    LevelSpec(3, 1, 5, "greedy", "Greedy Best-First Search", "Expert"),
    LevelSpec(3, 2, 6, "greedy", "Greedy Best-First Search", "Expert"),
    LevelSpec(3, 3, 6, "greedy", "Greedy Best-First Search", "Expert"),
)

LEVEL_META = {
    1: {
        "name": "Easy",
        "algorithm": "Basic Backtracking",
        "blurb": "Systematic search with undo when a partial placement fails.",
    },
    2: {
        "name": "Hard",
        "algorithm": "A* Search",
        "blurb": "Priority-queue search with f(n) = g(n) + h(n).",
    },
    3: {
        "name": "Expert",
        "algorithm": "Greedy Best-First Search",
        "blurb": "Heuristic search prioritizing promising nodes with f(n) = h(n).",
    },
}


class LevelManager:
    GAMES_PER_LEVEL = 3
    LEVEL_COUNT = 3

    def spec(self, level: int, game: int) -> LevelSpec:
        for item in LEVEL_SPECS:
            if item.level == level and item.game == game:
                return item
        raise KeyError(f"No spec for level {level} game {game}")

    def solver_for(self, level: int) -> BaseSolver:
        key = self.spec(level, 1).algorithm_key
        return self.solver_by_key(key)

    def solver_by_key(self, key: str) -> BaseSolver:
        mapping = {
            "backtracking": BacktrackingSolver,
            "astar": AStarSolver,
            "greedy": GreedyBestFirstSolver,
            "mrv": MRVForwardCheckingSolver,
            "heuristic": MRVForwardCheckingSolver,
        }
        if key not in mapping:
            raise KeyError(f"Unknown solver key: {key}")
        return mapping[key]()

    def all_solvers(self) -> list[BaseSolver]:
        return [
            BacktrackingSolver(),
            AStarSolver(),
            GreedyBestFirstSolver(),
            MRVForwardCheckingSolver(),
        ]

    def next_game(self, level: int, game: int) -> tuple[int, int] | None:
        if game < self.GAMES_PER_LEVEL:
            return level, game + 1
        if level < self.LEVEL_COUNT:
            return level + 1, 1
        return None
