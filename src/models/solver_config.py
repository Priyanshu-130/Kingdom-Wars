from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SolverConfig:
    time_limit_seconds: float = 30.0
    max_nodes: int = 200_000
    max_expanded: int = 80_000
    max_generated: int = 200_000
    max_iterations: int = 8_000
    max_restarts: int = 40
    sideways_moves: int = 12
    random_seed: int = 42
    near_simultaneous_tolerance: float = 0.05
    round_time_limit_seconds: float = 120.0
