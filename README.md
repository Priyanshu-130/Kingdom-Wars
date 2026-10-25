# Kingdom Wars: The AI Queen Race

Kingdom Wars is a browser-native N-Queens strategy game with connected colored-kingdom constraints and an alternating human-versus-AI race. The playable website in [`web/`](./web/) uses only HTML, CSS, and vanilla JavaScript; its AI solvers run in a Web Worker (tournament tiers feature **CSP Backtracking + MRV + Forward Checking** and **Greedy Best-First Search**, fully accessible across the visualizer, comparison suite, worker, and tests). It is a static site and needs no Python, Pygame, Pygbag, WebAssembly, backend, or application runtime.

The Python desktop edition in `src/` provides the dual reference implementation. Its puzzle data, game rules, solver results, and progression behavior are validated against the same authoritative constraints.

## Objectives

- Model a constraint-satisfaction puzzle that is stricter than classic N-Queens.
- Implement and verify exactly two search approaches behind one shared, independent validator:
  1. **CSP Backtracking + MRV + Forward Checking** (systematic, complete, dynamic variable ordering, lookahead pruning).
  2. **Greedy Best-First Search** (informed priority-queue search driven purely by $f(n) = h(n)$).
- Run a turn-based race on independent human and AI boards with turn-consuming visual cross marks (×).
- Keep browser interaction responsive by running genuine solvers in a Web Worker.
- Produce an architecture suitable for academic viva evaluation: rigorous CSP formulations, pure heuristics, honest completeness and optimality analysis, and verifiable test suites.

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
- Every AI action at all tournament levels has the same **700 ms** reveal delay. The delay begins when the AI turn starts. If search is still running after that delay, the move waits for the worker result.
- The live match replays the selected solver's actual placements, conflicts, rejections, backtracks, and search-tree events at a configurable 300, 400, or 500 ms per event. Playback time is reported separately from measured solver execution and never changes the 700 ms AI reveal delay.
- Default round limit: **120 seconds**. If neither side solves before timeout, the result is a draw.
- The AI intentionally spends turns placing visible X eliminations. Because X marks do not change legality, this gives the AI extra moves and disadvantages it against a perfect human solution.

## Features

- Two difficulty tiers × three games (6 verified puzzles): Level 1 (three 4×4 boards, MRV + Forward Checking), Level 2 (one 5×5 and two 6×6 boards, Greedy Best-First Search).
- Turn-based AI opponent; each tournament tier is powered by its assigned genuine solver.
- Level unlock progression, persisted in browser local storage and Python local storage.
- Algorithm comparison on the same verified puzzle, plus an interactive AI Algorithm Visualization Lab featuring both solvers.
- Cross marks (×) visually rendered on search-board cells ruled out by the AI.
- Animated solver traces show real Queen candidates, conflicts, pruning, backtracking, solutions, and the corresponding search tree in both live matches and the visualization lab. The lab includes play, pause, reset, step, and playback speed controls.
- Plain-language guides explaining CSP Backtracking + MRV + Forward Checking and Greedy Best-First Search, detailing how heuristics prune the search space and how to interpret statistics.
- Shared `ConstraintChecker` used by humans and every solver as the independent authority.
- Comprehensive test suites in both Node.js (native test runner) and Python (pytest) covering constraints, solvers, race lifecycle, progression, and edge cases.

## Technology stack

- Website: HTML5, CSS, vanilla JavaScript, Web Workers, browser local storage.
- Website has no external JavaScript packages or runtime dependencies.
- Reference desktop app and tests: CPython 3.13, pygame-ce, and pytest.

## How to run

```powershell
.\.venv\Scripts\python.exe main.py
```

## How to test

Run the Python pytest regression suite:

```powershell
.\.venv\Scripts\pytest
```

Run the native browser logic tests with Node.js:

```powershell
node --test tests\js\game.test.mjs
```

## Algorithms

### 1. CSP Backtracking + MRV + Forward Checking (Level 1)

A dedicated Constraint Satisfaction Problem solver combining Minimum Remaining Values with forward checking.
- **Variable Selection (MRV):** Dynamically selects the unassigned row with the fewest remaining legal column positions (Fail-First Principle).
- **Forward Checking:** Immediately after assigning a queen, filters domains of all remaining unassigned rows, eliminating column, diagonal, and kingdom conflicts.
- **Early Wipeout Pruning:** If any unassigned row's legal domain becomes empty (size 0), the branch fails immediately without recursing deeper.
- **Domain Restoration:** Explicitly restores previous candidate domain snapshots upon backtracking.
- **Properties:** Complete and systematic. Dramatically reduces search-tree branching compared to naive static row-order backtracking. Space complexity is $O(N^2)$ for domain snapshots across recursion depth $O(N)$.

### 2. Greedy Best-First Search ($f(n) = h(n)$) (Level 2)

Uses a priority queue ordered strictly by the pure heuristic estimate $h(n)$, breaking ties by deeper search progress ($-g(n)$) and creation order.
- **Evaluation Function:** $f(n) = h(n)$ [strictly ignores accumulated path cost $g(n)$, distinguishing it fundamentally from A*].
- **Heuristic $h(n)$:** Evaluates remaining unassigned variables $(N - g)$, domain tightness (count of blocked squares across all unassigned rows), and applies an immediate heavy penalty ($+10,000$) to dead-end states where any row has 0 legal options.
- **Duplicate Detection & State Representation:** Maintains an explored set of canonical board state tuples to avoid cycling and re-expansion.
- **Resource Limits:** Governed by `max_expanded`, `max_generated`, and execution timeout.
- **Theoretical Limitations & Guarantees:** Fast in practice on many puzzles. However, it is **not guaranteed to find a solution or prove unsatisfiability** in bounded search, as greedy heuristic choices can lead down fruitless subtrees.

## Complexity & Algorithmic Comparison

| Algorithm | Priority / Order | Heuristic Function | Auxiliary Space | Completeness | Optimality |
|---|---|---|---|---|---|
| **CSP Backtracking + MRV + Forward Checking** | Dynamic MRV (fewest remaining values) | Forward Checking Lookahead | $O(N^2)$ domain snapshots | Yes | N/A (satisfaction) |
| **Greedy Best-First Search** | Min-Heap Priority Queue | Pure $f(n) = h(n)$ | $O(\text{frontier})$ | Incomplete (in general) | No |
