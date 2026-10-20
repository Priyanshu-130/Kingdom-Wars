# Kingdom Wars: The AI Queen Race

A local Python + Pygame desktop game that combines the N-Queens puzzle with colored-region (“kingdom”) constraints. A human player races an AI solver on the same immutable puzzle, using independent boards. Four levels use four different algorithms: basic backtracking, MRV + forward checking, A* search, and hill climbing.

## Objectives

- Model a constraint-satisfaction puzzle that is stricter than classic N-Queens.
- Implement four search algorithms behind one shared validator.
- Run a fair hidden race: the AI does not see human placements, and live AI progress is not shown.
- Keep the Pygame loop responsive by solving on a background thread.
- Produce a project a CSE student can explain in a viva: state, constraints, heuristics, complexity, and honest failure cases.

## Game rules

A valid solution on an N×N board must satisfy **all** of the following:

1. Exactly one queen in every row.
2. Exactly one queen in every column.
3. No two queens share a diagonal.
4. Exactly one queen in each colored kingdom.
5. Exactly N queens.
6. All of the above at the same time.

Kingdoms are N connected 4-directional regions. Left-click a cell to place or remove a queen; right-click to toggle an independent X mark. X marks do not affect queen validation or mistakes. The visible mistake counter increases once for each distinct cell where an invalid queen placement is attempted. Invalid cells are highlighted red. At three mistakes the round ends in failure, and that game is not marked complete. Restarting resets the counter; leaving or restarting a round does not count as completing that game.

Race rules:

- Both competitors start from the same round-start event.
- Timing uses `time.perf_counter()`, not the wall clock.
- Default round limit: **120 seconds** (`SolverConfig.round_time_limit_seconds`).
- The race does not end when only one side solves.
- If both solve, timestamps are compared. If they differ by at most **0.05s**, the result is a draw.
- If neither solves, the result is a draw.

## Features

- Four levels × three games (12 verified puzzles).
- Hidden human-vs-AI race with independent boards.
- Level unlock progression, persisted in `data/progress.json` when the disk is writable.
- Algorithm comparison on the same verified puzzle.
- Instructions and About screens.
- Shared `ConstraintChecker` used by humans and every solver.
- pytest suite for constraints, solvers, race lifecycle, progression, and UI smoke tests.

## Technology stack

- CPython 3.13 (64-bit on Windows)
- Pygame 2.6.1
- pytest
- Standard library: `heapq`, `concurrent.futures`, `threading`, `json`, `dataclasses`

No web server, database, authentication, or cloud API.

## Prerequisites

- Windows 10/11
- Python 3.13 (64-bit) available as `py -3.13`
- Ability to create a virtual environment and install packages

## Installation (Windows PowerShell)

From the project folder:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Pygame 2.6.1 has a prebuilt Windows wheel for CPython 3.13, so this setup does not need to compile Pygame with Visual C++. Python 3.14 is not the supported environment for this project.

## How to run

```powershell
.\.venv\Scripts\python.exe main.py
```

Alternative:

```powershell
.\.venv\Scripts\python.exe -m src.app
```

## How to test

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Project structure

```
main.py
requirements.txt
README.md
VIVA_PREPARATION.md
src/
  app.py
  models/          puzzle, board, solver/round results, config
  algorithms/      backtracking, MRV+FC, A*, hill climbing
  core/            constraints, puzzles, race, progression
  ui/              Pygame screens and widgets
tests/
data/              local progress JSON
```

## Algorithms

### Level 1 — Basic Backtracking

Place a queen in row 0…N−1. For each row, try legal columns. Recurse after a valid placement. Undo when a branch fails. Metrics: nodes visited, backtracks, time, termination reason.

### Level 2 — MRV + Forward Checking

Variables are rows. **MRV** picks the unassigned row with the fewest remaining legal columns (not merely the next row). **Forward checking** removes candidates that conflict with the new queen and fails immediately if any domain is empty. Domains are restored on backtrack. Extra metric: candidates eliminated.

### Level 3 — A* Search

Nodes are **immutable** partial placements (`columns` tuple). Priority queue: `heapq`.

- `g(n)` = number of queens placed
- `h(n)` = `N - q(n)`
- `f(n)` = `g(n) + h(n)`

This heuristic is admissible if each remaining queen costs at least 1. It is also **weak**: every complete solution has path cost N, so `f(n) = N` for every node. This project does **not** claim that A* is always faster than backtracking or BFS. Duplicate canonical states are skipped. Limits: expanded states, generated states, time, cancellation.

### Level 4 — Hill Climbing

A candidate is a **permutation** of columns (one queen per row and column). Objective:

`conflict_score = diagonal_pairs + kingdom_pairs`

Move to a better neighbor (column swaps), allow a few sideways moves on plateaus, then random restart. Configurable seed. A zero score is still passed through `ConstraintChecker`. Failure within the budget is reported honestly. Hill climbing is **not** guaranteed to solve a puzzle.

## Complexity (typical)

Let N be the board size.

- Backtracking / MRV: worst-case exponential in N. MRV + FC often visits fewer nodes but does extra domain work per assignment.
- A*: time depends on expanded states; space is O(frontier). The weak heuristic does not shrink the tree to polynomial size.
- Hill climbing: each iteration evaluates O(N²) swap neighbors. Restarts are bounded. Not complete.

N is 4–6 in this game, which is small enough to search, not a claim of scalability to large N.

## Progression

- Level 1 starts unlocked.
- Completing all three **finalized** games in a level unlocks the next.
- Abandoning or restarting does not mark a game complete.
- A game is stored at most once.

## Limitations

- Puzzle generation uses seeded construction around a known N-Queens solution. Uniqueness is preferred but not guaranteed for every board.
- Hill climbing may fail on Master-level games.
- The A* heuristic is pedagogical, not a high-performance admissible design.
- If `data/progress.json` cannot be written, progress stays in memory for that session.
- Algorithm comparison metrics are not interchangeable (nodes vs expanded states vs objective evaluations).

## Future improvements

- Stronger A* heuristics (conflict-aware, still documented).
- Simulated annealing or min-conflicts as extra local-search baselines.
- Optional puzzle editor.
- Sound and animation polish.

## Viva notes

See `VIVA_PREPARATION.md` for oral-exam style explanations of state, constraints, algorithms, and testing.
