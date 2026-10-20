from __future__ import annotations

from typing import Optional

from ..algorithms.base_solver import BaseSolver
from ..models.puzzle import Puzzle
from ..models.round_result import RaceOutcome, RoundResult
from ..models.solver_config import SolverConfig
from ..models.solver_result import SolverResult
from .constraint_checker import ConstraintChecker
from .level_manager import LEVEL_META, LevelManager
from .progress_manager import ProgressManager
from .puzzle_repository import PuzzleRepository
from .round_manager import RoundManager


class GameController:
    def __init__(
        self,
        repository: Optional[PuzzleRepository] = None,
        progress: Optional[ProgressManager] = None,
    ) -> None:
        self.checker = ConstraintChecker()
        self.levels = LevelManager()
        self.repository = repository or PuzzleRepository()
        self.progress = progress or ProgressManager()
        self.round = RoundManager(self.checker)
        self.config = SolverConfig()
        self.last_result: Optional[RoundResult] = None
        self.current_level = 1
        self.current_game = 1
        self.current_solver: Optional[BaseSolver] = None

    def puzzle(self, level: int, game: int) -> Puzzle:
        return self.repository.get(level, game)

    def start_game(self, level: int, game: int) -> Puzzle:
        if not self.progress.is_game_unlocked(level, game):
            raise PermissionError("This game is locked.")
        self.current_level = level
        self.current_game = game
        puzzle = self.repository.get(level, game)
        self.current_solver = self.levels.solver_for(level)
        self.round.start_round(puzzle, self.current_solver, self.config)
        return puzzle

    def tick(self) -> Optional[RoundResult]:
        result = self.round.tick()
        if result and result.finalized and result.outcome.value != "abandoned":
            self._record_completion(result)
        return result

    def submit(self) -> bool:
        ok = self.round.submit_human()
        if self.round.finalized and self.round.result:
            self._record_completion(self.round.result)
        return ok

    def restart(self) -> None:
        if self.current_solver is None:
            self.current_solver = self.levels.solver_for(self.current_level)
        self.round.restart(self.current_solver, self.config)

    def abandon(self) -> Optional[RoundResult]:
        return self.round.abandon()

    def _record_completion(self, result: RoundResult) -> None:
        self.last_result = result
        if result.outcome in (RaceOutcome.ABANDONED, RaceOutcome.HUMAN_FAILED):
            return
        self.progress.mark_completed(result.puzzle.level, result.puzzle.game)

    def compare_algorithms(self, puzzle: Puzzle, repeats: int = 1) -> list[dict]:
        rows = []
        solvers = self.levels.all_solvers()
        for solver in solvers:
            successes = 0
            last: Optional[SolverResult] = None
            for i in range(repeats):
                cfg = SolverConfig(
                    time_limit_seconds=self.config.time_limit_seconds,
                    max_nodes=self.config.max_nodes,
                    max_expanded=self.config.max_expanded,
                    max_generated=self.config.max_generated,
                    max_iterations=self.config.max_iterations,
                    max_restarts=self.config.max_restarts,
                    random_seed=self.config.random_seed + i,
                )
                last = solver.solve(puzzle, cfg)
                if last.success:
                    successes += 1
            assert last is not None
            rows.append(
                {
                    "algorithm": solver.algorithm_name,
                    "result": last,
                    "successes": successes,
                    "repeats": repeats,
                }
            )
        return rows

    def level_meta(self, level: int) -> dict:
        return LEVEL_META[level]
