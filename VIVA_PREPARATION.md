# Viva preparation — Kingdom Wars: The AI Queen Race

## Project objective

Build a playable constraint-satisfaction game that is more constrained than N-Queens, then race a human against four standard AI search methods on the same puzzle without leaking AI internals during play.

## Problem formulation

**Given:** N, an N×N coloring into N connected kingdoms, and the six placement rules.

**Find:** a placement of N queens, equivalently a permutation `p` of `{0…N-1}` such that:

- no diagonal: `|i − j| ≠ |p[i] − p[j]|` for all `i ≠ j`
- kingdoms of `(i, p[i])` are all distinct

This is a CSP / combinatorial search problem, not a scoring contest with many optimal costs. Every valid complete placement has the same placement-count cost N.

## State representation

- **Human/AI board:** a mutable set of `(row, col)` cells (`BoardState`).
- **Backtracking:** `columns[row] = col` or `-1`.
- **MRV:** assignment map plus per-row domains.
- **A*:** frozen tuple of length N (`AStarNode.columns`), hashed for duplicate detection.
- **Hill climbing:** permutation of columns.

The stored `verified_solution` is for generation and tests. The live AI never copies it in as a fake solve; it must search.

## Puzzle constraints

Shared by `ConstraintChecker`:

1. One queen per row
2. One queen per column
3. No shared diagonal
4. One queen per kingdom
5. Exactly N queens
6. Simultaneous satisfaction

Malformed puzzles (wrong IDs, disconnected kingdoms, invalid stored solutions) are rejected by the same checker.

## Four algorithms

### 1. Basic backtracking

Depth-first row-by-row assignment. Undo on failure. Complete for finite N if given enough time/nodes. Baseline for comparison.

### 2. MRV + forward checking

MRV: choose the unassigned **row with the smallest legal domain**. That is not “the next row.”

Forward checking: after assigning `(row, col)`, delete illegal values from other domains. Empty domain → fail and restore.

This is still backtracking, but the variable order and pruning differ, so node counts should not match naive BT on the same puzzle.

### 3. A*

`f(n) = g(n) + h(n)` with `g = q(n)` and `h = N − q(n)`.

**Heuristic justification:** each missing queen requires at least one placement, so h never overestimates path cost in placement units. **Consistency:** the decrease in h when placing one queen is 1, matching the step cost, so this h is consistent as well as admissible.

**Why it is still weak:** f is constant, so A* does not distinguish promising branches. Do not claim it always beats backtracking.

**Memory:** the frontier and explored set can grow large; that is why expansion/time/cancel limits exist.

### 4. Hill climbing

Local search on permutations. Objective = diagonal pair count + kingdom pair count. Neighbors = pairwise swaps. Sideways moves on plateaus. Random restarts with a seed.

Not complete. A local optimum with score > 0 is a failure. Score 0 must still pass `ConstraintChecker` before success is reported.

## Time and space complexity

| Algorithm | Time (typical worst) | Space |
| --- | --- | --- |
| Backtracking | O(N!) style tree, pruned by constraints | O(N) recursion |
| MRV + FC | Same worst case; often fewer nodes; extra O(N²) domain work | O(N²) domains |
| A* | O(states expanded); can approach the same tree | O(frontier) |
| Hill climbing | O(restarts × iterations × N²) | O(N) |

These are teaching bounds, not measured claims that one method is fastest.

## Strengths and weaknesses

- **Backtracking:** simple, complete, easy to viva. Can waste time on bad variable order.
- **MRV + FC:** usually less thrashing; more code; still exponential.
- **A*:** clean evaluation function to explain; weak h; memory.
- **Hill climbing:** fast moves, reproducible with a seed; can fail; good contrast with complete search.

## Testing approach

- Constraint unit tests: valid, duplicates, diagonals, kingdoms, incomplete, malformed IDs.
- Each solver: at least one solvable puzzle, shared validator, cancel/limits, metrics.
- A*: immutability, f-ordering, duplicates, goal validation.
- Hill climbing: honest failure allowed; seed determinism on a tiny budget.
- Race manager: who finished, invalid submit, timeout, restart, abandon, late results ignored, finalize once, draw tolerance.
- Progression: 3 games/level, unlock, no double count, abandon does not complete.
- UI: dummy SDL driver, navigation, click toggle, submit/restart, tick without blocking.

Never quote benchmark tables that were not produced by a real run.

## Known limitations

- Unique solutions are preferred, not proven for every generated board.
- Hill climbing may lose Master games.
- Comparison metrics are heterogeneous.
- Local JSON progress can fail on a locked folder; the session still plays.

## Suggested viva answers

**Q: Why not show AI queens during the race?**  
A: To keep a genuine race. Showing partial search would leak information and turn the UI into a solver debugger.

**Q: Why is a zero hill-climbing score not enough?**  
A: The objective is a proxy. Only the shared checker defines legal success, so an encoding bug cannot mark an illegal board as solved.

**Q: Why `perf_counter`?**  
A: Wall clocks can jump. Race ranking needs a monotonic elapsed-time source.

**Q: Can A* return a cheaper solution than backtracking?**  
A: Not under this cost model. Every valid goal costs N placements.
