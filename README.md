# Kingdom Wars: The AI Queen Race

Kingdom Wars is a browser-native N-Queens strategy game with connected colored-kingdom constraints and an alternating human-versus-AI race. The playable website in [`web/`](./web/) uses only HTML, CSS, and vanilla JavaScript; its three active AI solvers run in a Web Worker. It is a static site and needs no Python, Pygame, Pygbag, WebAssembly, backend, or application runtime.

The original Python + Pygame desktop edition remains in `src/` as a tested reference implementation. Its puzzle data, game rules, solver results, and progression behavior are the source used to validate the browser migration.

## Objectives

- Model a constraint-satisfaction puzzle that is stricter than classic N-Queens.
- Implement three search algorithms behind one shared validator.
- Run a turn-based race on independent human and AI boards.
- Keep browser interaction responsive by solving in a Web Worker.
- Produce a project a CSE student can explain in a viva: state, constraints, heuristics, complexity, and honest failure cases.

## Game rules

A valid solution on an N×N board must satisfy **all** of the following:

1. Exactly one queen in every row.
2. Exactly one queen in every column.
3. No two queens share a diagonal.
4. Exactly one queen in each colored kingdom.
5. Exactly N queens.
6. All of the above at the same time.

Kingdoms are N connected 4-directional regions. Single-click or right-click a cell to toggle an X mark; double-click to place or remove a queen. Each X or valid Queen action consumes the current player's turn. X marks are visual annotations: they do not block later Queens, affect Queen validation, or count as mistakes. AI X marks identify cells ruled out by its current Queens, but are separate AI turns as requested. The visible mistake counter increases once for each distinct cell where an invalid Queen placement is attempted. Invalid cells are highlighted red. At three mistakes the round ends in failure, and that game is not marked complete. Restarting resets the counter; leaving or restarting a round does not count as completing that game.

Turn-based race rules:

- Human and AI have independent boards. The human acts first; only the active player can place Queens or X marks.
- The first player to complete a valid board wins. An invalid human Queen attempt counts as a mistake and does not pass the turn.
- Every AI action at all three levels has the same **700 ms** reveal delay. The delay begins when the AI turn starts. If search is still running after that delay, the move waits for the worker result.
- The live match replays the selected solver's actual placements, conflicts, rejections, backtracks, and search-tree events at a configurable 300, 400, or 500 ms per event. Playback time is reported separately from measured solver execution and never changes the 700 ms AI reveal delay.
- Default round limit: **120 seconds**. If neither side solves before timeout, the result is a draw.
- The AI intentionally spends turns placing visible X eliminations. Because X marks do not change legality, this gives the AI extra moves and disadvantages it against a perfect human solution; this was retained by request.

## Features

- Three difficulty tiers × three games (9 verified puzzles): Easy (three 4×4 boards), Hard (two 5×5 and one 6×6), Expert (one 5×5 and two 6×6).
- Turn-based AI opponent; each level retains its genuine assigned algorithm.
- Level unlock progression, persisted in browser local storage in the website.
- Algorithm comparison on the same verified puzzle, plus an AI Algorithm Visualization Lab.
- Animated solver traces show real Queen candidates, conflicts, pruning, backtracking, solutions, and the corresponding search tree in both live matches and the visualization lab. The lab includes play, pause, reset, step, and playback speed controls.
- The visualization lab includes plain-language, step-by-step guides to Backtracking, A* Search, and Hill Climbing, plus an explanation of each event as it is replayed, the board/tree colors, and how to interpret algorithm-specific statistics.
- Live-game traces retain up to 6,000 actual events and display up to 2,000 tree nodes; all shipped puzzle traces fit within those limits. Lab statistics use solver execution metrics; its visual trace is capped at 6,000 events and its rendered tree at 350 nodes to bound memory and rendering work. Search runs in a Web Worker.
- A generated gallery runs the configured solver on the shipped puzzles and displays only solutions that pass the shared validator.
- Instructions and About screens.
- Shared `ConstraintChecker` used by humans and every solver.
- pytest suite for constraints, solvers, race lifecycle, progression, and UI smoke tests.

## Technology stack

- Website: HTML5, CSS, vanilla JavaScript, Web Workers, browser local storage.
- Website has no external JavaScript packages or runtime dependencies.
- Reference desktop app and tests: CPython 3.13 (64-bit on Windows), pygame-ce, and pytest.
- GitHub Pages hosts the static files in `web/`; the site has no server-side component.

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

## Native browser app

Open [`web/index.html`](./web/index.html) through any static file host, or use the deployed GitHub Pages site. The page, stylesheet, puzzle data, game rules, and algorithms are all plain files; the browser runs the AI in `web/js/solver-worker.js`. There is no compile/build step. A static preview extension can serve `web/` locally; this is only for previewing and is not part of the deployed game's runtime.

The browser version retains nine puzzle layouts and kingdom colors: all three easy boards, all three A* boards, and all three Hill Climbing boards. The removed MRV tier and its three boards are no longer playable or included in the lab, comparison, or gallery. The Python reference specs and seed mapping use the same nine remaining layouts. Basic Backtracking, A*, and seeded Hill Climbing each compute a complete plan in a Web Worker. The AI reveals one legal Queen or X action per turn, checks each Queen against its current board, and can rerun its assigned solver with already-placed Queens fixed if its plan no longer extends the board. Queen placements use the same row, column, diagonal, and kingdom constraints. Older saved progress is migrated: completions from the removed tier are discarded, while the A* and Hill Climbing completions move to their new tier numbers.

The **AI Algorithm Visualization Lab** can run Basic Backtracking, A*, or Hill Climbing on any shipped puzzle. It captures bounded events from the actual solver execution and synchronizes the board animation with a search-tree canvas; it does not substitute sample moves. Statistics include solver-specific explored nodes, conflicts, backtracks, pruned candidates/branches, and measured execution time. Use Play, Pause, Reset, Next Step, and the speed selector to inspect the captured trace. Trace storage is capped at 6,000 events and the tree canvas at 350 nodes; the solver still completes and reports full-run summary statistics. The separate comparison screen runs all three active algorithms on the selected puzzle. The solution gallery executes each puzzle's configured solver and retains only solutions accepted by the shared validator; Hill Climbing may retry with different deterministic seeds, and any unsuccessful puzzle is reported rather than fabricated.

### Difficulty validation

The difficulty regression uses **100 deterministic seeds per puzzle (300 games per level, 900 total)**. A seeded row-by-row randomized backtracking policy is used as the same human-policy simulation at every level. It records policy candidate decisions, actual alternating-game wins, AI search success, turns, and native algorithm effort. Each AI search uses its real level solver and the fixed reveal delay; AI computation time is also respected.

| Tier | Human win rate | AI win rate | AI search success | Mean human-policy decisions | Mean human turns used |
|---|---:|---:|---:|---:|---:|
| Easy | 37.3% | 62.7% | 100.0% | 20.57 | 5.25 |
| Hard | 11.7% | 88.3% | 100.0% | 108.69 | 8.33 |
| Expert | 8.3% | 91.7% | 98.7% | 160.24 | 8.99 |

Under this fixed simulated policy, average decisions increase and human win rate decreases at every remaining tier. This is evidence for these nine puzzles and that policy, not a guarantee about human players generally. The turn-consuming AI X policy and human-first order also affect those match win rates; search-effort metrics are diagnostic only and are not used as the difficulty measure.

Run native browser logic tests with Node.js (built-in test runner; no npm install):

```powershell
node --test tests\js\game.test.mjs
```

The complete Python reference regression suite remains available:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

### GitHub Pages

The **Native Kingdom Wars Pages** workflow validates and deploys the static `web/` directory on pushes to `master` or `main`, and can also be started from **Actions**. It does not install Python, run Pygbag, or compile a browser package.

To enable deployment:

1. Open [Settings → Pages](https://github.com/Priyanshu-130/Kingdom-Wars/settings/pages).
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push to `master` (or manually run **Native Kingdom Wars Pages** in Actions).
4. After the workflow succeeds, the site URL is `https://priyanshu-130.github.io/Kingdom-Wars/`.

The workflow uses only the `pages: write` and `id-token: write` permissions required by GitHub Pages deployment, plus read-only repository contents access.

## Project structure

```
web/
  index.html
  styles.css
  js/               puzzle data, validation, solvers, race state, worker, UI
main.py             legacy desktop entry point
requirements.txt    legacy desktop/test dependencies
README.md
VIVA_PREPARATION.md
tests/js/           native browser logic tests
src/
  app.py
  models/          puzzle, board, solver/round results, config
  algorithms/      backtracking, A*, hill climbing
  core/            constraints, puzzles, race, progression
  ui/              Pygame screens and widgets
tests/
data/              local progress JSON
```

## Algorithms

### Level 1 — Basic Backtracking

Place a queen in row 0…N−1. For each row, try legal columns. Recurse after a valid placement. Undo when a branch fails. Metrics: nodes visited, backtracks, time, termination reason.

### Level 2 — A* Search

Nodes are **immutable** partial placements (`columns` tuple). Priority queue: `heapq`.

- `g(n)` = number of queens placed
- `h(n)` = `N - q(n)`
- `f(n)` = `g(n) + h(n)`

This heuristic is admissible if each remaining queen costs at least 1. It is also **weak**: every complete solution has path cost N, so `f(n) = N` for every node. This project does **not** claim that A* is always faster than backtracking or BFS. Duplicate canonical states are skipped. Limits: expanded states, generated states, time, cancellation.

### Level 3 — Hill Climbing

A candidate is a **permutation** of columns (one queen per row and column). Objective:

`conflict_score = diagonal_pairs + kingdom_pairs`

Move to a better neighbor (column swaps), allow a few sideways moves on plateaus, then random restart. Configurable seed. A zero score is still passed through `ConstraintChecker`. Failure within the budget is reported honestly. Hill climbing is **not** guaranteed to solve a puzzle.

## Complexity (typical)

Let N be the board size.

- Backtracking: worst-case exponential in N.
- A*: time depends on expanded states; space is O(frontier). The weak heuristic does not shrink the tree to polynomial size.
- Hill climbing: each iteration evaluates O(N²) swap neighbors. Restarts are bounded. Not complete.

N is 4–6 in this game, which is small enough to search, not a claim of scalability to large N.

## Progression

- Level 1 starts unlocked.
- Completing all three **finalized** games in a level unlocks the next.
- The game has three levels and nine shipped puzzles.
- Abandoning or restarting does not mark a game complete.
- A game is stored at most once.

## Limitations

- Puzzle generation uses seeded construction around a known N-Queens solution. Uniqueness is preferred but not guaranteed for every board.
- Hill climbing may fail on Expert-level games.
- The A* heuristic is pedagogical, not a high-performance admissible design.
- If `data/progress.json` cannot be written, progress stays in memory for that session.
- Algorithm comparison metrics are not interchangeable (nodes vs expanded states vs objective evaluations).
- The former MRV implementation and its unit tests remain as standalone Python reference material only; it is not exported as an active solver or used by gameplay, comparison, visualization, or progression.

## Future improvements

- Stronger A* heuristics (conflict-aware, still documented).
- Simulated annealing or min-conflicts as extra local-search baselines.
- Optional puzzle editor.
- Sound and animation polish.

## Viva notes

See `VIVA_PREPARATION.md` for oral-exam style explanations of state, constraints, algorithms, and testing.
