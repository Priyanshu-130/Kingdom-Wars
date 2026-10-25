# Viva Preparation Guide — Kingdom Wars: The AI Queen Race

This guide provides deep technical explanations, algorithmic formulations, complexity analyses, and model viva answers for the Kingdom Wars project.

---

## 1. Project Overview & Problem Formulation

### What is Kingdom Wars?
Kingdom Wars is a combinatorial puzzle and turn-based strategy game. It extends the classic $N$-Queens problem by introducing **connected colored kingdoms** on an $N \times N$ grid, and pits a human player against an AI solver in a turn-based race.

### Formal CSP Definition
The game is modeled formally as a **Constraint Satisfaction Problem (CSP)**:
- **Variables:** $X = \{R_0, R_1, \dots, R_{N-1}\}$, where variable $R_i$ represents row $i$.
- **Domains:** For each variable $R_i$, $D_i = \{0, 1, \dots, N-1\}$, representing the column index for the queen in row $i$.
- **Constraints ($C$):**
  1. **Row constraint:** Exactly one queen per row (enforced by the variable formulation $R_i$).
  2. **Column constraint:** $\forall i \neq j, R_i \neq R_j$ (all queens in distinct columns).
  3. **Diagonal constraint:** $\forall i \neq j, |i - j| \neq |R_i - R_j|$ (no two queens share a main or anti-diagonal).
  4. **Kingdom constraint:** $\forall i \neq j, \text{kingdom}[i][R_i] \neq \text{kingdom}[j][R_j]$ (each connected colored region has at most one queen).
  5. **Global count:** Exactly $N$ queens placed on the board.
  6. **Simultaneous satisfaction:** A state is a solution if and only if **all** constraints hold simultaneously.

Unlike shortest-path search in graphs with varying edge costs, this is a **combinatorial satisfaction problem**. Every valid complete solution has depth $N$.

---

## 2. State Representations

Across our two solvers and core engine:
- **BoardState:** A mutable set of placed coordinate tuples `(row, col)`.
- **MRV + Forward Checking:** An assignment dictionary `assignment[row] = col`, an active unassigned row set, and explicit remaining legal domains `domains[row] = Set(c_1, c_2, ...)`.
- **Greedy Best-First Search:** An immutable tuple `columns` of length $N$, ordered in a priority queue purely by heuristic value $f(n) = h(n)$, breaking ties by deeper search progress ($-g(n)$). Visited states are tracked in an explored set of canonical tuples.

*Authoritative Validation:* Solvers produce candidate placements, but `ConstraintChecker` independently verifies row, column, diagonal, and kingdom constraints for all reported solutions.

---

## 3. The Two Search Algorithms: Deep Dive

### 1. CSP Backtracking + MRV + Forward Checking (Level 1)
- **Mechanism:** Combines systematic search with CSP inference techniques:
  1. **Minimum Remaining Values (MRV) Variable Ordering:** Instead of assigning rows $0, 1, \dots, N-1$ in static order, MRV calculates the number of legal candidate columns remaining for every unassigned row. It selects the row with the minimum remaining values (smallest domain size).
     - *Why? The Fail-First Principle:* If a branch is going to fail, picking the variable with the fewest options causes failure as high up in the tree as possible, pruning huge search subtrees immediately.
  2. **Forward Checking (Constraint Propagation):** Whenever a queen is assigned to `(row, col)`, the solver immediately inspects all remaining unassigned rows and removes all conflicting columns (same column, diagonals, or same kingdom).
  3. **Early Wipeout Detection:** If any unassigned row's domain is reduced to zero ($|domain| = 0$), a *domain wipeout* has occurred. The solver immediately prunes the branch and backtracks without further exploration.
  4. **Domain Restoration:** When backtracking, domain snapshots from previous states are restored accurately.
- **Properties:** Complete and systematic. Dramatically reduces search-tree branching compared to naive backtracking.

### 2. Greedy Best-First Search ($f(n) = h(n)$) (Level 2)
- **Mechanism:** Evaluates nodes strictly by estimated distance/penalty to the goal:
  $$f(n) = h(n)$$
- **Distinction from A*:** Ignores path cost $g(n)$ entirely. It does NOT use $g(n) + h(n)$ as its priority function. It prioritizes nodes that appear closest to a valid solution right now.
- **Meaningful Heuristic:**
  $$h(n) = (N - g) + \text{domain reduction penalty} + \text{dead-end penalty}$$
  - $(N - g)$: Remaining unassigned queens.
  - Domain reduction penalty: Blocked candidate positions across all unassigned rows.
  - Dead-end penalty ($+10,000$): Triggered if any unassigned row has 0 legal options left.
- **Tie-breaking:** When two states have the same heuristic score, it favors deeper progress ($-g(n)$) and earlier generation order (FIFO id).
- **Theoretical Properties & Honesty:**
  - **Incompleteness:** Greedy Best-First Search is not guaranteed to find a solution; greedy choices can lead down fruitless subtrees.
  - **No Unsatisfiability Proof:** Unless the entire state space is exhaustively explored without cutoffs, it cannot formally prove unsatisfiability in bounded search.

---

## 4. Complexity & Comparison Summary

| Metric | MRV + Forward Checking | Greedy Best-First |
|---|---|---|
| **Strategy** | Systematic CSP with Lookahead | Pure Best-First ($f = h$) |
| **Variable Order** | Dynamic MRV (fewest remaining values) | First unassigned row |
| **Priority Function** | N/A (Recursive DFS) | Min-Heap on $h(n)$ |
| **Space Complexity** | $O(N^2)$ (domain snapshots) | $O(\text{frontier})$ |
| **Completeness** | Yes (systematic CSP) | Incomplete (in general) |
| **Unsatisfiability Proof** | Yes (exhaustive systematic search) | No (bounded search cutoff) |

---

## 5. Frequently Asked Viva Questions

### Q1: Why use MRV variable ordering instead of row-by-row order?
**Answer:** Static row ordering ignores domain restrictions caused by already-placed queens. Minimum Remaining Values (MRV) implements the Fail-First Principle: selecting the variable with the fewest remaining legal values minimizes the branching factor at that level and detects unavoidable dead ends earlier, pruning exponential subtrees.

### Q2: How does Forward Checking differ from naive backtracking?
**Answer:** In naive backtracking, constraints are checked backward: when a queen is placed, we verify if it conflicts with previously placed queens. In Forward Checking, whenever a variable is assigned, we look forward to all unassigned variables and prune their domains. If any domain becomes empty, we backtrack immediately without searching deeper.

### Q3: Why is Greedy Best-First Search not A*?
**Answer:** A* uses $f(n) = g(n) + h(n)$, combining past cost with future heuristic estimate. Greedy Best-First Search uses $f(n) = h(n)$, completely ignoring $g(n)$. It is purely greedy and does not guarantee shortest path, optimality, or completeness.

### Q4: Can Greedy Best-First Search prove that a board is unsatisfiable?
**Answer:** No, in general bounded search, when Greedy Best-First Search exceeds its node, expansion, or time limit, it reports search failure rather than a mathematical proof of unsatisfiability. By contrast, a complete systematic search like MRV Forward Checking that exhausts the search space without hitting limits can formally prove unsatisfiability.
