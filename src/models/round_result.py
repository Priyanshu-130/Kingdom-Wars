from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .board_state import BoardState
from .puzzle import Puzzle
from .solver_result import SolverResult


class RoundPhase(str, Enum):
    READY = "READY"
    RUNNING = "RUNNING"
    COMPETITOR_FINISHED = "COMPETITOR_FINISHED"
    ROUND_FINALIZED = "ROUND_FINALIZED"


class RaceOutcome(str, Enum):
    HUMAN_WIN = "human_win"
    AI_WIN = "ai_win"
    DRAW = "draw"
    ABANDONED = "abandoned"


@dataclass
class RoundResult:
    puzzle: Puzzle
    outcome: RaceOutcome
    human_board: BoardState
    ai_board: Optional[BoardState]
    human_valid: bool
    ai_valid: bool
    human_time: Optional[float]
    ai_time: Optional[float]
    solver_result: Optional[SolverResult]
    human_feedback: str = ""
    finalized: bool = True
    notes: list[str] = field(default_factory=list)
