from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


class TerminationReason:
    SOLVED = "solved"
    UNSOLVABLE = "unsolvable"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    NODE_LIMIT = "node_limit"
    EXPANDED_LIMIT = "expanded_limit"
    ITERATION_LIMIT = "iteration_limit"
    RESTART_LIMIT = "restart_limit"
    LOCAL_OPTIMUM = "local_optimum"
    INVALID_PUZZLE = "invalid_puzzle"
    INVALID_FIXED_PLACEMENTS = "invalid_fixed_placements"


@dataclass
class SolverResult:
    algorithm_name: str
    success: bool
    solution: Optional[tuple[int, ...]] = None
    elapsed_seconds: float = 0.0
    metrics: dict[str, Any] = field(default_factory=dict)
    termination_reason: str = TerminationReason.UNSOLVABLE
    random_seed: Optional[int] = None
    found_at_monotonic: Optional[float] = None

    def validated_solution(self) -> Optional[tuple[int, ...]]:
        if self.success:
            return self.solution
        return None
