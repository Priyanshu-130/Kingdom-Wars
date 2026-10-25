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

Across our four solvers and core engine:
- **BoardState:** A mutable set of placed coordinate tuples `(row, col)`.
- **Basic Backtracking:** An array/list `columns[row] = col` (or `-1` if unassigned).
- **A* Search:** An immutable frozen tuple `columns` of length $N$. Explored set tracks visited canonical states; a min-heap priority queue (`heapq`) orders states by $f(n) = g(n) + h(n)$.
- **Greedy Best-First Search:** An immutable tuple `columns` of length $N$, ordered in a priority queue purely by heuristic value $f(n) = h(n)$, breaking ties by deeper search progress ($-g(n)$).
- **MRV + Forward Checking:** An assignment dictionary `assignment[row] = col`, an active unassigned row set, and explicit remaining legal domains `domains[row] = [c_1, c_2, ...]`.

*Crucial Design Principle:* The stored `verified_solution` in puzzle files is used strictly for puzzle loading and regression verification. Solvers never inspect `verified_solution` during execution; every solve is computed from first principles.

---

## 3. Four Search Algorithms: Deep Dive

### 1. Basic Backtracking (DFS)
- **Mechanism:** Explores the state space depth-first with a fixed variable ordering (row $0$ to $N-1$) and fixed value ordering (column $0$ to $N-1$).
- **Pruning:** At each step, checks whether placing a queen at `(row, col)` violates column, diagonal, or kingdom constraints against already placed queens. If valid, recurses to `row + 1`; if conflict occurs, backtracks immediately.
- **Properties:** Systematic, complete for finite $N$, space-efficient ($O(N)$ stack depth), worst-case time $O(N!)$. Baseline benchmark.

### 2. A* Search ($f(n) = g(n) + h(n)$)
- **Mechanism:** Explores partial states using a priority queue.
- **Cost Function $g(n)$:** The number of queens placed so far ($g(n) = q$).
- **The Heuristic Audit & Correction:**
  - *The naive formulation:* Setting $h(n) = N - q$ causes $f(n) = g(n) + h(n) = q + (N - q) = N$ identically for every node in the search tree. When all nodes have identical $f$-values, priority-queue ordering degenerates into arbitrary/FIFO queue extraction, negating the benefit of A*.
  - *The corrected formulation:*
    $$h(n) = (N - q) + \text{domain reduction penalty} + \text{dead-end penalty}$$
    For every unassigned row, the solver checks how many legal column options remain. If any unassigned row has $0$ options left, a dead-end penalty of $+10,000$ is added. Otherwise, a penalty proportional to constrained domains is accumulated.
  - *Effect:* Differentiates promising nodes from constrained branches and steers A* away from branches that choke remaining options.
- **Properties:** Complete within configured node/memory budgets. Explored set prunes duplicate canonical configurations.

### 3. Greedy Best-First Search ($f(n) = h(n)$)
- **Mechanism:** Evaluates nodes strictly by estimated distance/penalty to the goal:
  $$f(n) = h(n)$$
- **Distinction from A*:** Ignores path cost $g(n)$ entirely. It prioritizes nodes that appear closest to a valid solution right now, regardless of how many steps it took to reach them.
- **Tie-breaking:** When two states have the same heuristic score, it favors deeper progress ($-g(n)$) and earlier generation order (FIFO id).
- **Theoretical Properties & Honesty:**
  - **Not Optimal:** Greedy Best-First Search does not guarantee finding a solution with minimal expansions.
  - **Not Complete in General:** In infinite search spaces or with cycles, Greedy Best-First can become trapped in infinite loops. Even in finite acyclic trees, it can follow misleading heuristic gradients deep into unproductive branches.
  - **Performance:** On typical $N$-Queens and Kingdom Wars boards, it is remarkably fast because it aggressively dives toward solutions when heuristic signals are strong.

### 4. MRV + Forward Checking (CSP Solver)
- **Mechanism:** Combines two core CSP algorithms:
  1. **Minimum Remaining Values (MRV) Variable Ordering:** Instead of assigning rows $0, 1, \dots, N-1$ in static order, MRV calculates the number of legal candidate columns remaining for every unassigned row. It selects the row with the minimum remaining values (smallest domain size).
     - *Why? The Fail-First Principle:* If a branch is going to fail, picking the variable with the fewest options causes failure as high up in the tree as possible, pruning huge search subtrees immediately.
  2. **Forward Checking (Constraint Propagation):** Whenever a queen is assigned to `(row, col)`, the solver immediately inspects all remaining unassigned rows and removes all conflicting columns (same column, diagonals, or same kingdom).
  3. **Early Wipeout Detection:** If any unassigned row's domain is reduced to zero ($|domain| = 0$), a *domain wipeout* has occurred. The solver immediately prunes the branch and backtracks without further exploration.
- **Properties:** Complete, systematic, and exponentially cuts down backtracks compared to naive backtracking.

---

## 4. Complexity & Comparison Summary

| Metric | Basic Backtracking | A* Search | Greedy Best-First | MRV + Forward Checking |
|---|---|---|---|---|
| **Strategy** | Systematic DFS | Best-First ($g + h$) | Pure Best-First ($h$) | CSP with MRV & Pruning |
| **Worst-Case Time** | $O(N!)$ | $O(b^d)$ | $O(b^m)$ | $O(d^N)$ (dramatically pruned) |
| **Space Complexity** | $O(N)$ (recursion stack) | $O(\text{frontier})$ | $O(\text{frontier})$ | $O(N \times N)$ (domain stack) |
| **Completeness** | Yes (finite $N$) | Yes (with finite budget) | Incomplete (in general) | Yes |
| **Variable Order** | Static (row $0 \dots N-1$) | Static (row $0 \dots N-1$) | Static (row $0 \dots N-1$) | Dynamic (Minimum Remaining Values) |
| **Constraint Check** | Backward checking | Backward checking + domain penalty | Backward checking + heuristic | Forward checking (lookahead) |

---

## 5. Testing & Verification Architecture

Our testing suite is split between Node.js and pytest:
1. **Constraint Checker Verification:**
   - Valid full placements accepted.
   - Row violations rejected.
   - Column violations rejected.
   - Diagonal conflicts rejected.
   - Kingdom conflicts rejected.
   - Partial placements ($< N$ queens) rejected as incomplete.
2. **Solver Termination & Status Differentiation:**
   - **SOLVED (`solved`):** Valid solution found that independently passes `ConstraintChecker`.
   - **UNSOLVABLE (`unsolvable`):** Complete search space exhausted with no solution (e.g., $2 \times 2$ or $3 \times 3$ boards, or conflicting fixed placements).
   - **TIMEOUT / LIMIT REACHED (`timeout`, `node_limit`, `expanded_limit`):** Search stopped due to resource limits; NOT claimed to be unsolvable.
   - **CANCELLED (`cancelled`):** Search aborted by user or round restart.
3. **Parity & Consistency:**
   - Python reference implementation in `src/` and browser implementation in `web/js/solvers.js` yield identical solutions and pass independent validation on all shipped puzzles.

---

## 6. High-Frequency Viva Questions & Model Answers

### Q1: What makes Kingdom Wars more difficult than standard N-Queens?
**Answer:**
Standard $N$-Queens only enforces row, column, and diagonal non-attack constraints. Kingdom Wars adds a 4th global partitioning constraint: the board is divided into $N$ connected 4-directional colored kingdoms, and exactly one queen must reside in each kingdom. This severely restricts the placement space, invalidates many standard $N$-Queens solutions, and eliminates standard board symmetries.

### Q2: What was the flaw in the naive A* heuristic ($h(n) = N - q$) and how did you resolve it?
**Answer:**
In an incremental queen placement formulation, $g(n)$ is the number of queens placed ($q$), and the naive heuristic was $h(n) = N - q$ (the number of remaining queens). Consequently:
$$f(n) = g(n) + h(n) = q + (N - q) = N$$
Because every node in the search tree evaluates to the exact same $f$-value ($N$), the priority queue provides zero discriminatory power and degrades to arbitrary or FIFO order.
We corrected this by augmenting $h(n)$ with unassigned-row domain reduction penalties and a $+10,000$ dead-end penalty if any unassigned row has zero legal columns remaining. This produces meaningful gradients that steer A* away from dead ends and toward viable configurations.

### Q3: How does Greedy Best-First Search differ from A* Search?
**Answer:**
A* evaluates nodes using $f(n) = g(n) + h(n)$, balancing the cost incurred so far ($g(n)$) against the estimated cost to the goal ($h(n)$).
Greedy Best-First Search uses $f(n) = h(n)$ exclusively, ignoring accumulated path cost. It strictly favors nodes that appear closest to the goal. While Greedy is often significantly faster on easy and typical boards, it is neither optimal nor complete in general search spaces, as it can get trapped down unpromising branches.

### Q4: Explain the Fail-First Principle in MRV.
**Answer:**
Minimum Remaining Values (MRV) selects the unassigned variable (row) that has the fewest legal values (columns) remaining in its domain.
The rationale is the **Fail-First Principle**: if an assignment is destined to fail because constraints cannot be satisfied, picking the most constrained variable will cause that branch to fail immediately at the shallowest possible depth. Pruning early eliminates entire combinatorial subtrees that a static variable ordering would needlessly explore.

### Q5: How does Forward Checking operate during search?
**Answer:**
In naive backtracking, constraints are checked backward: when a queen is placed, we verify if it conflicts with previously placed queens.
In Forward Checking, whenever variable $R_i$ is assigned column $c$, the algorithm looks forward: for every unassigned row $R_j$, it deletes any column $c'$ from $D_j$ that conflicts with $(i, c)$ on column, diagonal, or kingdom constraints. If any domain $D_j$ becomes empty, the algorithm detects a dead end immediately and backtracks without recursing deeper.

### Q6: Why did you eliminate Hill Climbing from the project?
**Answer:**
Hill climbing operated as local search on full board permutations (swapping columns to minimize conflict scores). However:
1. It frequently became trapped in local optima and plateau regions.
2. It lacked completeness guarantees and required stochastic restarts.
3. In a CSP game where every placement rule must strictly hold, systematic CSP solvers (Backtracking, MRV + Forward Checking) and informed tree searches (A*, Greedy Best-First) provide structured search-tree visualizations, verifiable execution traces, and predictable algorithmic properties suitable for academic evaluation.

### Q7: Why run solvers in a Web Worker in the browser?
**Answer:**
JavaScript runs on a single main UI thread. If a search algorithm executes synchronously on the main thread, intensive combinatorial exploration freezes the DOM, halts animations, and blocks user interaction. By offloading solvers to a dedicated `Web Worker`, computation occurs asynchronously on a background thread, reporting results and search-tree events via message passing while keeping the 60 FPS UI smooth and responsive.

### Q8: How does the game guarantee fair racing without cheating?
**Answer:**
Both human and AI receive the exact same puzzle specification. The AI has no access to the precomputed solution. It must invoke its assigned solver from the initial board state. Furthermore:
- AI moves are throttled by a fixed **700 ms reveal delay**, preventing instantaneous CPU wins.
- Placed queens and X-marks consume real turns.
- Independent boards and a shared `ConstraintChecker` enforce identical validation rules for both human and AI moves.
