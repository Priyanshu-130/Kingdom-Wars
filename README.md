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

Kingdoms are N connected 4-directional regions. Single-click a cell to toggle an independent X mark; double-click to place or remove a queen. Right-click also toggles an X mark. X marks do not affect queen validation or mistakes. The visible mistake counter increases once for each distinct cell where an invalid queen placement is attempted. Invalid cells are highlighted red. At three mistakes the round ends in failure, and that game is not marked complete. Restarting resets the counter; leaving or restarting a round does not count as completing that game.

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
- pygame-ce 2.5.8
- Pygbag 0.9.3 (browser build)
- pytest
- Standard library: `heapq`, `concurrent.futures`, `threading`, `json`, `dataclasses`

The desktop game uses a background worker for AI search. The browser build uses the same solver and runs it synchronously because browser Python does not provide the desktop thread pool; browser progress is stored in local storage. No application server, database, authentication, or cloud API is required.

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

pygame-ce provides a prebuilt Windows wheel for CPython 3.13, so setup does not need to compile SDL with Visual C++. Python 3.14 is not the supported environment for this project.

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

## Browser build (Pygbag)

The root `main.py` remains the game entry point for both the desktop launcher and Pygbag. The browser entry uses an asynchronous Pygame loop that yields to the browser event loop each frame and scales the existing 1100×700 layout to the browser canvas. It keeps all four solvers, the colored-kingdom puzzles, the 12-game progression, the hidden AI race, the mistake limit, and the comparison screen.

From the project root, install the requirements and build/serve the web version:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pygbag main.py
```

Open `http://localhost:8000` in a browser. For a build without starting the local server:

```powershell
.\.venv\Scripts\python.exe -m pygbag --build main.py
.\.venv\Scripts\python.exe scripts\prepare_web_build.py
```

The generated site is in `build/web/`. To serve it locally after building:

```powershell
Push-Location build\web
..\..\.venv\Scripts\python.exe -m http.server 9000
Pop-Location
```

Open `http://localhost:9000`. Use port 9000 for a plain static server: Pygbag rewrites package CDN requests to `/cdn/` on localhost ports beginning with 8, which requires Pygbag's own development server. In browser games, click once to mark X and double-click to place/remove a queen; right-click remains an X-mark shortcut. Browser progression persists in local storage. AI solving and the algorithm-comparison screen run synchronously in the browser, so a search can briefly pause rendering; the desktop version retains its background AI worker. Pygbag 0.9.3's default template points to a missing BrowserFS asset, so the build preparation script switches that one reference to the version-pinned BrowserFS CDN; the script fails if Pygbag's generated template no longer matches the expected reference.

### GitHub Pages

The `Pygbag GitHub Pages` workflow builds and tests on pushes to `master` and can also be started manually from the repository's **Actions** tab. It publishes the generated `build/web/` files to the `gh-pages` branch. To enable the published site:

1. Open [Settings → Pages](https://github.com/Priyanshu-130/Kingdom-Wars/settings/pages).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch `gh-pages` and folder `/(root)`, then save.
4. Wait for the Pages deployment workflow to complete. The project site URL is `https://priyanshu-130.github.io/Kingdom-Wars/`.

The Actions workflow is granted only `contents: write`, required to update `gh-pages`. Until the workflow succeeds and Pages is enabled, the game is not deployed.

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
