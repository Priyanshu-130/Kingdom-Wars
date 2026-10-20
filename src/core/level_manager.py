from __future__ import annotations

from dataclasses import dataclass

from ..algorithms.astar import AStarSolver
from ..algorithms.backtracking import BacktrackingSolver
from ..algorithms.base_solver import BaseSolver
from ..algorithms.heuristic_backtracking import HeuristicBacktrackingSolver
from ..algorithms.hill_climbing import HillClimbingSolver


@dataclass(frozen=True)
class LevelSpec:
    level: int
    game: int
    n: int
    algorithm_key: str
    algorithm_title: str
    description: str


LEVEL_SPECS: tuple[LevelSpec, ...] = (
    LevelSpec(1, 1, 4, "backtracking", "Basic Backtracking", "Beginner"),
    LevelSpec(1, 2, 4, "backtracking", "Basic Backtracking", "Beginner"),
    LevelSpec(1, 3, 5, "backtracking", "Basic Backtracking", "Beginner"),
    LevelSpec(2, 1, 5, "heuristic", "MRV + Forward Checking", "Strategist"),
    LevelSpec(2, 2, 5, "heuristic", "MRV + Forward Checking", "Strategist"),
    LevelSpec(2, 3, 6, "heuristic", "MRV + Forward Checking", "Strategist"),
    LevelSpec(3, 1, 4, "astar", "A* Search", "Explorer"),
    LevelSpec(3, 2, 5, "astar", "A* Search", "Explorer"),
    LevelSpec(3, 3, 5, "astar", "A* Search", "Explorer"),
    LevelSpec(4, 1, 5, "hill", "Hill Climbing", "Master"),
    LevelSpec(4, 2, 6, "hill", "Hill Climbing", "Master"),
    LevelSpec(4, 3, 6, "hill", "Hill Climbing", "Master"),
)

LEVEL_META = {
    1: {
        "name": "Beginner",
        "algorithm": "Basic Backtracking",
        "blurb": "Systematic search with undo when a partial placement fails.",
    },
    2: {
        "name": "Strategist",
        "algorithm": "MRV + Forward Checking",
        "blurb": "Choose the most constrained row, then prune illegal candidates.",
    },
    3: {
        "name": "Explorer",
        "algorithm": "A* Search",
        "blurb": "Priority-queue search with f(n) = g(n) + h(n).",
    },
    4: {
        "name": "Master",
        "algorithm": "Hill Climbing",
        "blurb": "Local search over permutations. It can get stuck.",
    },
}


class LevelManager:
    GAMES_PER_LEVEL = 3
    LEVEL_COUNT = 4

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
            "heuristic": HeuristicBacktrackingSolver,
            "astar": AStarSolver,
            "hill": HillClimbingSolver,
        }
        return mapping[key]()

    def all_solvers(self) -> list[BaseSolver]:
        return [
            BacktrackingSolver(),
            HeuristicBacktrackingSolver(),
            AStarSolver(),
            HillClimbingSolver(),
        ]

    def next_game(self, level: int, game: int) -> tuple[int, int] | None:
        if game < self.GAMES_PER_LEVEL:
            return level, game + 1
        if level < self.LEVEL_COUNT:
            return level + 1, 1
        return None
