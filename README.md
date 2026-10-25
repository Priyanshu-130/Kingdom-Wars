# Kingdom Wars: The AI Queen Race

Kingdom Wars is a browser-native N-Queens strategy game with connected colored-kingdom constraints and an alternating human-versus-AI race. The playable website in [`web/`](./web/) uses only HTML, CSS, and vanilla JavaScript; its AI solvers run in a Web Worker (tournament tiers feature Basic Backtracking, A* Search, and Greedy Best-First Search, with MRV + Forward Checking available across the visualizer, comparison suite, worker, and tests). It is a static site and needs no Python, Pygame, Pygbag, WebAssembly, backend, or application runtime.

The original Python + Pygame desktop edition remains in `src/` as a tested reference implementation. Its puzzle data, game rules, solver results, and progression behavior are the source used to validate the browser migration.

## Objectives

- Model a constraint-satisfaction puzzle that is stricter than classic N-Queens.
- Implement four search algorithms (Basic Backtracking, A* Search, Greedy Best-First Search, and MRV + Forward Checking) behind one shared validator.
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
- Every AI action at all three tournament levels has the same **700 ms** reveal delay. The delay begins when the AI turn starts. If search is still running after that delay, the move waits for the worker result.
- The live match replays the selected solver's actual placements, conflicts, rejections, backtracks, and search-tree events at a configurable 300, 400, or 500 ms per event. Playback time is reported separately from measured solver execution and never changes the 700 ms AI reveal delay.
- Default round limit: **120 seconds**. If neither side solves before timeout, the result is a draw.
- The AI intentionally spends turns placing visible X eliminations. Because X marks do not change legality, this gives the AI extra moves and disadvantages it against a perfect human solution; this was retained by request.

## Features

- Three difficulty tiers × three games (9 verified puzzles): Easy (three 4×4 boards), Hard (two 5×5 and one 6×6), Expert (one 5×5 and two 6×6).
- Turn-based AI opponent; each tournament tier is powered by its assigned algorithm (Level 1: Basic Backtracking, Level 2: A* Search, Level 3: Greedy Best-First Search).
- Level unlock progression, persisted in browser local storage in the website.
- Algorithm comparison on the same verified puzzle, plus an interactive AI Algorithm Visualization Lab featuring all four solvers (Basic Backtracking, A* Search, Greedy Best-First Search, MRV + Forward Checking).
- Animated solver traces show real Queen candidates, conflicts, pruning, backtracking, solutions, and the corresponding search tree in both live matches and the visualization lab. The lab includes play, pause, reset, step, and playback speed controls.
- Plain-language guides explaining Backtracking, A* Search, Greedy Best-First Search, and MRV + Forward Checking, detailing how heuristics prune the search space and how to interpret statistics.
- Live-game traces retain up to 6,000 actual events and display up to 2,000 tree nodes; all shipped puzzle traces fit within those limits. Lab statistics use solver execution metrics; its visual trace is capped at 6,000 events and its rendered tree at 350 nodes to bound memory and rendering work. Search runs in a Web Worker.
- A generated gallery runs the configured solver on the shipped puzzles and displays only solutions that pass the shared validator.
- Instructions and About screens.
- Shared `ConstraintChecker` used by humans and every solver.
- Comprehensive test suites in both Node.js (native test runner) and Python (pytest) covering constraints, all four solvers, race lifecycle, progression, and edge cases.

## Technology stack

- Website: HTML5, CSS, vanilla JavaScript, Web Workers, browser local storage.
- Website has no external JavaScript packages or runtime dependencies.
- Reference desktop app and tests: CPython 3.13 (64-bit on Windows), pygame-ce, and pytest.
- GitHub Pages hosts the static files in `web/`; the site has no server-side component.

## Prerequisites

- Windows 10/11
- Python 3.13 (64-bit) available as `py -3.13`
- Ability to create a virtual environment and install packages
- Node.js (v18+) for native JS unit testing

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

Run the Python pytest regression suite:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Run the native browser logic tests with Node.js:

```powershell
node --test tests\js\game.test.mjs
```

## Native browser app

Open [`web/index.html`](./web/index.html) through any static file host, or use the deployed GitHub Pages site. The page, stylesheet, puzzle data, game rules, and algorithms are all plain files; the browser runs the AI in `web/js/solver-worker.js`. There is no compile/build step. A static preview extension can serve `web/` locally.

The browser version retains nine verified puzzle layouts: all three easy boards, all three hard boards, and all three expert boards. The tournament progression assigns:
- **Level 1 (Easy):** Basic Backtracking
- **Level 2 (Hard):** A* Search
- **Level 3 (Expert):** Greedy Best-First Search

In addition, **MRV + Forward Checking** is fully implemented and accessible in the Algorithm Visualization Lab, the algorithm comparison suite, and the solver worker.

The **Algorithm Visualization** interface can run any of the four algorithms on any shipped puzzle. It captures bounded events from the actual solver execution and synchronizes the board animation with a search-tree canvas; it does not substitute sample moves. Statistics include explored nodes, conflicts, backtracks, pruned branches, and measured execution time.

### Difficulty validation

The difficulty regression uses **100 deterministic seeds per puzzle (300 games per level, 900 total)**. A seeded row-by-row randomized backtracking policy is used as the same human-policy simulation at every level. It records policy candidate decisions, actual alternating-game wins, AI search success, turns, and native algorithm effort. Each AI search uses its real level solver and the fixed reveal delay; AI computation time is also respected.

| Tier | Human win rate | AI win rate | AI search success | Mean human-policy decisions | Mean human turns used |
|---|---:|---:|---:|---:|---:|
| Easy | 37.3% | 62.7% | 100.0% | 20.57 | 5.25 |
| Hard | 11.7% | 88.3% | 100.0% | 108.69 | 8.33 |
| Expert | 8.3% | 91.7% | 100.0% | 160.24 | 8.99 |

Under this fixed simulated policy, average decisions increase and human win rate decreases at every tier.

### GitHub Pages

The **Native Kingdom Wars Pages** workflow validates and deploys the static `web/` directory on pushes to `master` or `main`.

To enable deployment:

1. Open [Settings → Pages](https://github.com/Priyanshu-130/Kingdom-Wars/settings/pages).
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push to `master` (or manually run **Native Kingdom Wars Pages** in Actions).
4. After the workflow succeeds, the site URL is `https://priyanshu-130.github.io/Kingdom-Wars/`.

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
tests/
  js/               native browser logic tests (Node.js test runner)
  test_*.py         Python reference regression tests (pytest)
src/
  app.py
  models/          puzzle, board, solver/round results, config
  algorithms/      backtracking, astar, greedy, mrv
  core/            constraints, puzzles, race, progression
  ui/              Pygame screens and widgets
data/              local progress JSON
```

## Algorithms

### 1. Basic Backtracking (DFS)

Places queens row-by-row (0 to N−1). For each row, iterates through columns 0 to N−1. Before placing, checks row, column, diagonal, and kingdom constraints. Recurses on valid placements and backtracks immediately upon conflict.
- **Properties:** Complete for finite N. Baseline standard search. Worst-case time $O(N!)$, space $O(N)$.
- **Metrics:** Nodes visited, backtracks, elapsed time, termination reason.

### 2. A* Search ($f(n) = g(n) + h(n)$)

State nodes represent immutable partial assignments. Explored with a min-priority queue (`heapq`).
- **Cost so far $g(n)$:** Number of queens placed.
- **Heuristic $h(n)$:** Combines remaining queens $(N - g)$ with an unassigned-row domain reduction penalty, plus a high dead-end penalty ($+10,000$) if any unassigned row has 0 legal options remaining.
- **Audit & Correction:** The naive heuristic $h(n) = N - q(n)$ causes $f(n) = q(n) + (N - q(n)) = N$ identically across every state in the search tree, degrading A* to arbitrary/FIFO order. Our domain-informed heuristic differentiates states by penalizing branches that severely restrict remaining rows, steering A* toward open and viable configurations.
- **Properties:** In incremental satisfaction search, this heuristic acts as an informative pruning guide. Canonical states prevent duplicate expansions. Bounded by node and time budgets. Space is $O(\text{frontier})$.

### 3. Greedy Best-First Search ($f(n) = h(n)$)

Uses a priority queue ordered strictly by the heuristic estimate $h(n)$, breaking ties by deeper search progress ($-g(n)$) and creation order.
- **Distinction from A*:** Completely ignores accumulated cost $g(n)$, selecting nodes that appear closest to completion regardless of path history.
- **Properties & Limitations:** Highly aggressive and fast on typical puzzles. However, it is **not optimal** and **not guaranteed complete** in general search spaces, as it can follow misleading heuristic gradients down unproductive branches before exhausting them.

### 4. MRV + Forward Checking (CSP Solver)

A dedicated Constraint Satisfaction Problem solver combining Minimum Remaining Values with forward checking.
- **Variable Selection (MRV):** Dynamically selects the unassigned row with the fewest remaining legal column positions (Fail-First Principle).
- **Forward Checking:** Immediately after assigning a queen, filters domains of all remaining unassigned rows, eliminating column, diagonal, and kingdom conflicts.
- **Early Wipeout Pruning:** If any unassigned row's legal domain becomes empty (size 0), the branch fails immediately without recursing deeper.
- **Properties:** Complete, systematic, and dramatically reduces search tree branching factor compared to static row-order backtracking. Space complexity is $O(N)$ depth.

## Complexity Overview

| Algorithm | Worst-Case Time | Auxiliary Space | Completeness | Optimality (Cost) |
|---|---|---|---|---|
| **Basic Backtracking** | $O(N!)$ | $O(N)$ | Yes (finite $N$) | N/A (satisfaction) |
| **A* Search** | $O(b^d)$ | $O(\text{frontier})$ | Yes (with finite budget) | Direct path |
| **Greedy Best-First** | $O(b^m)$ | $O(\text{frontier})$ | No (can get trapped) | No |
| **MRV + Forward Checking** | $O(d^N)$ | $O(N \times N)$ domains | Yes | N/A (satisfaction) |

*Note:* $N$ is 4–6 in this game. These are pedagogical and combinatorial bounds, not claims of polynomial scaling to arbitrary $N$.

## Progression

- Level 1 starts unlocked.
- Completing all three games in a level unlocks the next tier.
- The tournament features three levels across nine verified puzzles.
- Abandoning or restarting does not mark a game complete.

## Limitations

- Puzzle generation uses seeded construction around a known N-Queens solution. Uniqueness is preferred but not guaranteed for every board.
- Greedy Best-First Search lacks theoretical completeness guarantees and may require deeper exploration if heuristic estimates misguide search.
- The A* heuristic is designed for CSP satisfaction guidance rather than shortest-path metric minimization.
- If `data/progress.json` cannot be written, progress falls back safely to session memory.
- Algorithm comparison metrics are heterogeneous across paradigms (recursive DFS nodes vs. priority queue expansions).

## Viva Notes

See [`VIVA_PREPARATION.md`](./VIVA_PREPARATION.md) for in-depth oral-exam questions and explanations covering state spaces, CSP constraints, heuristic formulations, optimality vs. satisfaction, and test validation.
