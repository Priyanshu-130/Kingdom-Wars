from importlib import import_module
from typing import TYPE_CHECKING

_EXPORTS = {
    "ConstraintChecker": "constraint_checker",
    "ValidationReport": "constraint_checker",
    "PuzzleRepository": "puzzle_repository",
    "PuzzleGenerator": "puzzle_generator",
    "GameController": "game_controller",
    "RoundManager": "round_manager",
    "LevelManager": "level_manager",
    "LEVEL_SPECS": "level_manager",
    "ProgressManager": "progress_manager",
}

__all__ = list(_EXPORTS)

if TYPE_CHECKING:
    from .constraint_checker import ConstraintChecker, ValidationReport
    from .game_controller import GameController
    from .level_manager import LEVEL_SPECS, LevelManager
    from .progress_manager import ProgressManager
    from .puzzle_generator import PuzzleGenerator
    from .puzzle_repository import PuzzleRepository
    from .round_manager import RoundManager


def __getattr__(name: str):
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(f".{module_name}", __name__), name)
    globals()[name] = value
    return value
