import {
  isSafeAssignment,
  isSafePartial,
  validatePuzzleDefinition,
  validateRowColumns,
} from "./rules.js";

export const DEFAULT_CONFIG = Object.freeze({
  time_limit_seconds: 30,
  max_nodes: 200_000,
  max_expanded: 80_000,
  max_generated: 200_000,
  near_simultaneous_tolerance: 0.05,
  round_time_limit_seconds: 120,
});

const REASON = Object.freeze({
  SOLVED: "solved",
  UNSOLVABLE: "unsolvable",
  CANCELLED: "cancelled",
  TIMEOUT: "timeout",
  NODE_LIMIT: "node_limit",
  EXPANDED_LIMIT: "expanded_limit",
  INVALID_PUZZLE: "invalid_puzzle",
  INVALID_FIXED_PLACEMENTS: "invalid_fixed_placements",
});

function result(name, success, solution, started, reason, metrics = {}, seed = null, foundAt = null) {
  return {
    algorithmName: name,
    success,
    solution: success ? solution : null,
    elapsedSeconds: (performance.now() - started) / 1000,
    metrics,
    terminationReason: reason,
    randomSeed: seed,
    foundAtMonotonic: success ? foundAt : null,
  };
}

function validDefinitionOrResult(name, puzzle, started) {
  const report = validatePuzzleDefinition(puzzle);
  if (report.valid) return null;
  return result(name, false, null, started, REASON.INVALID_PUZZLE, { errors: report.errors });
}

function fixedAssignment(puzzle, fixedQueens) {
  const assignment = new Map();
  for (const placement of fixedQueens) {
    if (!Array.isArray(placement) || placement.length !== 2) return null;
    const [row, col] = placement;
    if (
      !Number.isInteger(row) || !Number.isInteger(col)
      || row < 0 || row >= puzzle.n || col < 0 || col >= puzzle.n
      || assignment.has(row)
      || !isSafeAssignment(puzzle, assignment, row, col)
    ) return null;
    assignment.set(row, col);
  }
  return assignment;
}

function timedOut(started, config) {
  return (performance.now() - started) / 1000 >= config.time_limit_seconds;
}

export function solveBacktracking(puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const started = performance.now();
  const invalid = validDefinitionOrResult("Basic Backtracking", puzzle, started);
  if (invalid) return invalid;

  const n = puzzle.n;
  const columns = Array(n).fill(-1);
  const fixed = fixedAssignment(puzzle, fixedQueens);
  if (fixed === null) {
    return result("Basic Backtracking", false, null, started, REASON.INVALID_FIXED_PLACEMENTS);
  }
  for (const [row, col] of fixed) columns[row] = col;
  let nodes = 0;
  let backtracks = 0;
  let backtrackSteps = 0;
  let conflicts = 0;
  let traceId = 0;
  let reason = REASON.UNSOLVABLE;
  let found = null;
  let foundAt = null;

  function search(row, parentId = 0) {
    if (timedOut(started, config)) {
      reason = REASON.TIMEOUT;
      return true;
    }
    if (nodes >= config.max_nodes) {
      reason = REASON.NODE_LIMIT;
      return true;
    }
    if (row === n) {
      if (validateRowColumns(puzzle, columns).valid) {
        found = [...columns];
        foundAt = performance.now();
        reason = REASON.SOLVED;
        const id = trace?.enabled ? ++traceId : 0;
        trace?.enabled && trace.record({
          type: "solution",
          id,
          parentId,
          depth: n,
          placements: [...columns],
        });
        return true;
      }
      return false;
    }
    if (columns[row] >= 0) {
      return search(row + 1, parentId);
    }

    for (let col = 0; col < n; col += 1) {
      nodes += 1;
      const id = trace?.enabled ? ++traceId : 0;
      if (!isSafePartial(puzzle, columns, row, col)) {
        conflicts += 1;
        trace?.enabled && trace.record({
          type: "conflict",
          id,
          parentId,
          depth: row + 1,
          row,
          col,
          placements: [...columns],
        });
        continue;
      }

      columns[row] = col;
      trace?.enabled && trace.record({
        type: "explore",
        id,
        parentId,
        depth: row + 1,
        row,
        col,
        placements: [...columns],
      });

      if (search(row + 1, id)) return true;

      columns[row] = -1;
      backtracks += 1;
      backtrackSteps += 1;
      trace?.enabled && trace.record({
        type: "backtrack",
        id: trace?.enabled ? ++traceId : 0,
        parentId: id,
        depth: row + 1,
        row,
        col,
        placements: [...columns],
      });
    }
    return false;
  }

  search(0);
  return result(
    "Basic Backtracking",
    found !== null,
    found,
    started,
    reason,
    {
      nodes_visited: nodes,
      backtracks,
      backtrack_steps: backtrackSteps,
      conflicts,
      pruned_branches: conflicts,
    },
    null,
    foundAt,
  );
}

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get length() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && this.compare(items[right], items[left]) < 0 ? right : left;
        if (this.compare(items[child], last) >= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
}

export function calculateHeuristic(puzzle, columns, g) {
  const n = puzzle.n;
  if (g === n) return 0;
  let totalBlocked = 0;
  let deadEnd = false;
  for (let r = g; r < n; r += 1) {
    let legal = 0;
    for (let c = 0; c < n; c += 1) {
      if (isSafePartial(puzzle, columns, r, c)) {
        legal += 1;
      } else {
        totalBlocked += 1;
      }
    }
    if (legal === 0) deadEnd = true;
  }
  if (deadEnd) return 10_000 + (n - g);
  return (n - g) + totalBlocked;
}

function compareAStarQueueItems(a, b) {
  return a.f - b.f || a.h - b.h || a.id - b.id;
}

export function solveAStar(puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const started = performance.now();
  const invalid = validDefinitionOrResult("A* Search", puzzle, started);
  if (invalid) return invalid;

  const n = puzzle.n;
  const fixed = fixedAssignment(puzzle, fixedQueens);
  if (fixed === null) {
    return result("A* Search", false, null, started, REASON.INVALID_FIXED_PLACEMENTS);
  }
  const initialColumns = Array(n).fill(-1);
  for (const [row, col] of fixed) initialColumns[row] = col;
  const startNode = { columns: initialColumns, g: fixed.size, traceId: 0 };
  const h0 = calculateHeuristic(puzzle, initialColumns, fixed.size);
  const frontier = new MinHeap(compareAStarQueueItems);
  frontier.push({ f: startNode.g + h0, h: h0, g: startNode.g, id: 0, node: startNode });
  trace?.enabled && trace.record({ type: "explore", id: 0, parentId: null, depth: fixed.size, placements: [...initialColumns] });
  const explored = new Set();
  let counter = 0;
  let expanded = 0;
  let generated = 1;
  let duplicates = 0;
  let conflicts = 0;
  let prunedBranches = 0;
  let traceId = 0;
  let maxFrontier = 1;
  let reason = REASON.UNSOLVABLE;
  let found = null;
  let foundAt = null;
  let pathCost = null;

  while (frontier.length > 0) {
    if (timedOut(started, config)) {
      reason = REASON.TIMEOUT;
      break;
    }
    if (expanded >= config.max_expanded) {
      reason = REASON.EXPANDED_LIMIT;
      break;
    }
    if (generated >= config.max_generated) {
      reason = REASON.NODE_LIMIT;
      break;
    }
    const { node } = frontier.pop();
    const key = node.columns.join(",");
    if (explored.has(key)) {
      duplicates += 1;
      continue;
    }
    explored.add(key);
    expanded += 1;
    trace?.enabled && trace.record({
      type: "expand",
      id: node.traceId,
      parentId: null,
      depth: node.g,
      placements: [...node.columns],
    });

    if (node.g === n) {
      if (validateRowColumns(puzzle, node.columns).valid) {
        found = node.columns;
        foundAt = performance.now();
        pathCost = node.g;
        reason = REASON.SOLVED;
        trace?.enabled && trace.record({
          type: "solution",
          id: node.traceId,
          parentId: null,
          depth: node.g,
          placements: [...node.columns],
        });
        break;
      }
      continue;
    }
    const nextRow = node.columns.findIndex((col) => col < 0);
    if (nextRow < 0) continue;
    for (let col = 0; col < n; col += 1) {
      generated += 1;
      const id = trace?.enabled ? ++traceId : 0;
      if (!isSafePartial(puzzle, node.columns, nextRow, col)) {
        conflicts += 1;
        prunedBranches += 1;
        trace?.enabled && trace.record({
          type: "conflict",
          id,
          parentId: node.traceId,
          depth: node.g + 1,
          row: nextRow,
          col,
          placements: [...node.columns],
        });
        continue;
      }
      const childColumns = [...node.columns];
      childColumns[nextRow] = col;
      if (explored.has(childColumns.join(","))) {
        duplicates += 1;
        prunedBranches += 1;
        trace?.enabled && trace.record({
          type: "prune",
          id,
          parentId: node.traceId,
          depth: node.g + 1,
          row: nextRow,
          col,
          placements: childColumns,
        });
        continue;
      }
      const g = node.g + 1;
      const h = calculateHeuristic(puzzle, childColumns, g);
      const f = g + h;
      counter += 1;
      trace?.enabled && trace.record({
        type: "explore",
        id,
        parentId: node.traceId,
        depth: g,
        row: nextRow,
        col,
        placements: childColumns,
      });
      frontier.push({
        f,
        h,
        g,
        id: counter,
        node: { columns: childColumns, g, traceId: id },
      });
    }
    maxFrontier = Math.max(maxFrontier, frontier.length);
  }

  return result(
    "A* Search",
    found !== null,
    found,
    started,
    reason,
    {
      states_expanded: expanded,
      states_generated: generated,
      duplicates_skipped: duplicates,
      max_frontier_size: maxFrontier,
      explored_states: explored.size,
      conflicts,
      pruned_branches: prunedBranches,
      path_cost: pathCost,
      heuristic: "f(n) = g(n) + h(n), with h(n) = (N - q(n)) + unassigned domain reduction penalty",
    },
    null,
    foundAt,
  );
}

function compareGreedyQueueItems(a, b) {
  return a.h - b.h || b.g - a.g || a.id - b.id;
}

export function solveGreedyBestFirst(puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const started = performance.now();
  const invalid = validDefinitionOrResult("Greedy Best-First Search", puzzle, started);
  if (invalid) return invalid;

  const n = puzzle.n;
  const fixed = fixedAssignment(puzzle, fixedQueens);
  if (fixed === null) {
    return result("Greedy Best-First Search", false, null, started, REASON.INVALID_FIXED_PLACEMENTS);
  }
  const initialColumns = Array(n).fill(-1);
  for (const [row, col] of fixed) initialColumns[row] = col;
  const startNode = { columns: initialColumns, g: fixed.size, traceId: 0 };
  const h0 = calculateHeuristic(puzzle, initialColumns, fixed.size);
  const frontier = new MinHeap(compareGreedyQueueItems);
  frontier.push({ h: h0, g: fixed.size, id: 0, node: startNode });
  trace?.enabled && trace.record({ type: "explore", id: 0, parentId: null, depth: fixed.size, placements: [...initialColumns] });
  const explored = new Set();
  let counter = 0;
  let expanded = 0;
  let generated = 1;
  let duplicates = 0;
  let conflicts = 0;
  let prunedBranches = 0;
  let traceId = 0;
  let maxFrontier = 1;
  let reason = REASON.UNSOLVABLE;
  let found = null;
  let foundAt = null;

  while (frontier.length > 0) {
    if (timedOut(started, config)) {
      reason = REASON.TIMEOUT;
      break;
    }
    if (expanded >= config.max_expanded) {
      reason = REASON.EXPANDED_LIMIT;
      break;
    }
    if (generated >= config.max_generated) {
      reason = REASON.NODE_LIMIT;
      break;
    }
    const { node } = frontier.pop();
    const key = node.columns.join(",");
    if (explored.has(key)) {
      duplicates += 1;
      continue;
    }
    explored.add(key);
    expanded += 1;
    trace?.enabled && trace.record({
      type: "expand",
      id: node.traceId,
      parentId: null,
      depth: node.g,
      placements: [...node.columns],
    });

    if (node.g === n) {
      if (validateRowColumns(puzzle, node.columns).valid) {
        found = node.columns;
        foundAt = performance.now();
        reason = REASON.SOLVED;
        trace?.enabled && trace.record({
          type: "solution",
          id: node.traceId,
          parentId: null,
          depth: node.g,
          placements: [...node.columns],
        });
        break;
      }
      continue;
    }
    const nextRow = node.columns.findIndex((col) => col < 0);
    if (nextRow < 0) continue;
    for (let col = 0; col < n; col += 1) {
      generated += 1;
      const id = trace?.enabled ? ++traceId : 0;
      if (!isSafePartial(puzzle, node.columns, nextRow, col)) {
        conflicts += 1;
        prunedBranches += 1;
        trace?.enabled && trace.record({
          type: "conflict",
          id,
          parentId: node.traceId,
          depth: node.g + 1,
          row: nextRow,
          col,
          placements: [...node.columns],
        });
        continue;
      }
      const childColumns = [...node.columns];
      childColumns[nextRow] = col;
      if (explored.has(childColumns.join(","))) {
        duplicates += 1;
        prunedBranches += 1;
        trace?.enabled && trace.record({
          type: "prune",
          id,
          parentId: node.traceId,
          depth: node.g + 1,
          row: nextRow,
          col,
          placements: childColumns,
        });
        continue;
      }
      const g = node.g + 1;
      const h = calculateHeuristic(puzzle, childColumns, g);
      counter += 1;
      trace?.enabled && trace.record({
        type: "explore",
        id,
        parentId: node.traceId,
        depth: g,
        row: nextRow,
        col,
        placements: childColumns,
      });
      frontier.push({
        h,
        g,
        id: counter,
        node: { columns: childColumns, g, traceId: id },
      });
    }
    maxFrontier = Math.max(maxFrontier, frontier.length);
  }

  return result(
    "Greedy Best-First Search",
    found !== null,
    found,
    started,
    reason,
    {
      states_expanded: expanded,
      states_generated: generated,
      duplicates_skipped: duplicates,
      max_frontier_size: maxFrontier,
      explored_states: explored.size,
      conflicts,
      pruned_branches: prunedBranches,
      path_cost: found ? n : null,
      heuristic: "f(n) = h(n) [Greedy Best-First, pure heuristic]",
    },
    null,
    foundAt,
  );
}

export function solveMRVForwardChecking(puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const started = performance.now();
  const invalid = validDefinitionOrResult("MRV + Forward Checking", puzzle, started);
  if (invalid) return invalid;

  const n = puzzle.n;
  const fixed = fixedAssignment(puzzle, fixedQueens);
  if (fixed === null) {
    return result("MRV + Forward Checking", false, null, started, REASON.INVALID_FIXED_PLACEMENTS);
  }

  const domains = Array.from({ length: n }, () => new Set(Array.from({ length: n }, (_, i) => i)));
  const assignment = new Map();
  for (const [r, c] of fixed) {
    assignment.set(r, c);
    domains[r] = new Set([c]);
  }

  let nodes = 0;
  let backtracks = 0;
  let eliminated = 0;
  let traceId = 0;
  let reason = REASON.UNSOLVABLE;
  let found = null;
  let foundAt = null;

  function legalValues(row) {
    const safe = [];
    for (const col of domains[row]) {
      if (isSafeAssignment(puzzle, assignment, row, col)) safe.push(col);
    }
    return safe;
  }

  function selectRow() {
    let bestRow = -1;
    let minLegal = Infinity;
    for (let r = 0; r < n; r += 1) {
      if (assignment.has(r)) continue;
      const count = legalValues(r).length;
      if (count < minLegal) {
        minLegal = count;
        bestRow = r;
      }
    }
    return bestRow >= 0 ? bestRow : null;
  }

  function forwardCheck(row, col) {
    const snapshot = new Map();
    const currentAssignment = new Map(assignment);
    currentAssignment.set(row, col);

    for (let other = 0; other < n; other += 1) {
      if (currentAssignment.has(other) || other === row) continue;
      const removed = [];
      for (const cand of domains[other]) {
        if (!isSafeAssignment(puzzle, currentAssignment, other, cand)) {
          removed.push(cand);
        }
      }
      if (removed.length > 0) {
        snapshot.set(other, new Set(domains[other]));
        for (const rem of removed) domains[other].delete(rem);
        eliminated += removed.length;
      }
      if (domains[other].size === 0) {
        restore(snapshot);
        return null;
      }
    }
    return snapshot;
  }

  function restore(snapshot) {
    for (const [r, values] of snapshot) {
      domains[r] = values;
    }
  }

  function getPlacementArray() {
    const arr = Array(n).fill(-1);
    for (const [r, c] of assignment) arr[r] = c;
    return arr;
  }

  function search(parentId = 0) {
    if (timedOut(started, config)) {
      reason = REASON.TIMEOUT;
      return true;
    }
    if (nodes >= config.max_nodes) {
      reason = REASON.NODE_LIMIT;
      return true;
    }
    if (assignment.size === n) {
      const arr = getPlacementArray();
      if (validateRowColumns(puzzle, arr).valid) {
        found = arr;
        foundAt = performance.now();
        reason = REASON.SOLVED;
        const id = trace?.enabled ? ++traceId : 0;
        trace?.enabled && trace.record({
          type: "solution",
          id,
          parentId,
          depth: n,
          placements: [...arr],
        });
        return true;
      }
      return false;
    }

    const row = selectRow();
    if (row === null) return false;
    const values = legalValues(row).sort((a, b) => a - b);
    if (values.length === 0) {
      backtracks += 1;
      return false;
    }

    for (const col of values) {
      nodes += 1;
      const id = trace?.enabled ? ++traceId : 0;
      assignment.set(row, col);
      const placements = getPlacementArray();
      trace?.enabled && trace.record({
        type: "explore",
        id,
        parentId,
        depth: assignment.size,
        row,
        col,
        placements,
      });

      const snapshot = forwardCheck(row, col);
      if (snapshot === null) {
        backtracks += 1;
        assignment.delete(row);
        trace?.enabled && trace.record({
          type: "conflict",
          id: trace?.enabled ? ++traceId : 0,
          parentId: id,
          depth: assignment.size,
          row,
          col,
          placements: getPlacementArray(),
        });
        continue;
      }

      if (search(id)) return true;

      restore(snapshot);
      assignment.delete(row);
      backtracks += 1;
      trace?.enabled && trace.record({
        type: "backtrack",
        id: trace?.enabled ? ++traceId : 0,
        parentId: id,
        depth: assignment.size,
        row,
        col,
        placements: getPlacementArray(),
      });
    }
    return false;
  }

  search(0);

  return result(
    "MRV + Forward Checking",
    found !== null,
    found,
    started,
    reason,
    {
      nodes_visited: nodes,
      backtracks,
      candidates_eliminated: eliminated,
      pruned_branches: backtracks,
      conflicts: backtracks,
      heuristic: "MRV (Minimum Remaining Values) + Forward Checking",
    },
    null,
    foundAt,
  );
}

export const SOLVERS = Object.freeze({
  backtracking: solveBacktracking,
  astar: solveAStar,
  greedy: solveGreedyBestFirst,
  mrv: solveMRVForwardChecking,
});

export function solveByKey(key, puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const solver = SOLVERS[key];
  if (!solver) throw new RangeError(`Unknown solver: ${key}`);
  return solver(puzzle, config, fixedQueens, trace);
}

export { REASON as TERMINATION_REASON };
