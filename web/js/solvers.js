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
  max_iterations: 8_000,
  max_restarts: 40,
  sideways_moves: 12,
  random_seed: 42,
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
  ITERATION_LIMIT: "iteration_limit",
  RESTART_LIMIT: "restart_limit",
  LOCAL_OPTIMUM: "local_optimum",
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
        trace?.enabled && trace.record({
          type: "solution",
          id: ++traceId,
          parentId,
          depth: row,
          placements: [...columns],
        });
        return true;
      }
      return false;
    }
    if (columns[row] >= 0) return search(row + 1, parentId);
    for (let col = 0; col < n; col += 1) {
      nodes += 1;
      const id = trace?.enabled ? ++traceId : 0;
      if (isSafePartial(puzzle, columns, row, col)) {
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
        trace?.enabled && trace.record({ type: "backtrack", id, parentId, depth: row + 1, row, col, placements: [...columns] });
      } else {
        conflicts += 1;
        backtracks += 1;
        trace?.enabled && trace.record({
          type: "conflict",
          id,
          parentId,
          depth: row + 1,
          row,
          col,
          placements: [...columns],
        });
      }
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

function compareQueueItems(a, b) {
  return a.f - b.f || a.g - b.g || a.id - b.id;
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
  const frontier = new MinHeap(compareQueueItems);
  frontier.push({ f: n, g: 0, id: 0, node: startNode });
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
        f: g + (n - g),
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
      heuristic: "h(n) = N - q(n), g(n) = q(n), f(n) = g(n) + h(n)",
    },
    null,
    foundAt,
  );
}

class PythonRandom {
  constructor(seed) {
    const unsigned = Math.abs(Math.trunc(seed));
    const key = [];
    let remaining = BigInt(unsigned);
    do {
      key.push(Number(remaining & 0xffffffffn));
      remaining >>= 32n;
    } while (remaining > 0n);
    this.state = new Uint32Array(624);
    this.state[0] = 19650218;
    for (let i = 1; i < 624; i += 1) {
      this.state[i] = (Math.imul(1812433253, this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i) >>> 0;
    }
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k -= 1) {
      this.state[i] = (
        Math.imul(
          this.state[i] ^ Math.imul(this.state[i - 1] ^ (this.state[i - 1] >>> 30), 1664525),
          1,
        ) + key[j] + j
      ) >>> 0;
      i += 1;
      j += 1;
      if (i >= 624) {
        this.state[0] = this.state[623];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k -= 1) {
      this.state[i] = (
        Math.imul(
          this.state[i] ^ Math.imul(this.state[i - 1] ^ (this.state[i - 1] >>> 30), 1566083941),
          1,
        ) - i
      ) >>> 0;
      i += 1;
      if (i >= 624) {
        this.state[0] = this.state[623];
        i = 1;
      }
    }
    this.state[0] = 0x80000000;
    this.index = 624;
  }

  uint32() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i += 1) {
        const y = (this.state[i] & 0x80000000) | (this.state[(i + 1) % 624] & 0x7fffffff);
        this.state[i] = this.state[(i + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.state[this.index];
    this.index += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  getrandbits(bits) {
    if (bits <= 0) return 0;
    return this.uint32() >>> (32 - bits);
  }

  randbelow(limit) {
    const bits = limit.toString(2).length;
    let value;
    do {
      value = this.getrandbits(bits);
    } while (value >= limit);
    return value;
  }

  sampleRange(length) {
    const pool = Array.from({ length }, (_, index) => index);
    const sample = [];
    for (let i = 0; i < length; i += 1) {
      const j = this.randbelow(length - i);
      sample.push(pool[j]);
      pool[j] = pool[length - i - 1];
    }
    return sample;
  }

  choice(items) {
    return items[this.randbelow(items.length)];
  }
}

function conflictScore(puzzle, permutation) {
  let score = 0;
  for (let i = 0; i < puzzle.n; i += 1) {
    for (let j = i + 1; j < puzzle.n; j += 1) {
      if (Math.abs(i - j) === Math.abs(permutation[i] - permutation[j])) score += 1;
      if (puzzle.kingdoms[i][permutation[i]] === puzzle.kingdoms[j][permutation[j]]) score += 1;
    }
  }
  return score;
}

function neighbors(permutation, fixedRows = new Set()) {
  const all = [];
  for (let i = 0; i < permutation.length; i += 1) {
    if (fixedRows.has(i)) continue;
    for (let j = i + 1; j < permutation.length; j += 1) {
      if (fixedRows.has(j)) continue;
      const next = [...permutation];
      [next[i], next[j]] = [next[j], next[i]];
      all.push(next);
    }
  }
  return all;
}

export function solveHillClimbing(puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const started = performance.now();
  const invalid = validDefinitionOrResult("Hill Climbing", puzzle, started);
  if (invalid) return invalid;

  const rng = new PythonRandom(config.random_seed);
  const n = puzzle.n;
  const fixed = fixedAssignment(puzzle, fixedQueens);
  if (fixed === null) {
    return result("Hill Climbing", false, null, started, REASON.INVALID_FIXED_PLACEMENTS);
  }
  const fixedRows = new Set(fixed.keys());
  let iterations = 0;
  let restarts = 0;
  let evaluations = 0;
  let conflicts = 0;
  let prunedBranches = 0;
  let traceId = 0;
  let reason = REASON.RESTART_LIMIT;
  let found = null;
  let foundAt = null;
  let initialScore = null;
  let finalScore = null;
  let bestEver = null;
  let bestEverScore = 10 ** 9;
  const evaluate = (permutation) => {
    evaluations += 1;
    const score = conflictScore(puzzle, permutation);
    conflicts += score;
    return score;
  };

  while (restarts < config.max_restarts) {
    if (timedOut(started, config)) {
      reason = REASON.TIMEOUT;
      break;
    }
    let current;
    let currentTraceId;
    if (fixed.size === 0) {
      current = rng.sampleRange(n);
    } else {
      current = Array(n).fill(-1);
      const usedColumns = new Set();
      for (const [row, col] of fixed) {
        current[row] = col;
        usedColumns.add(col);
      }
      const rows = Array.from({ length: n }, (_, row) => row).filter((row) => !fixedRows.has(row));
      const columns = Array.from({ length: n }, (_, col) => col).filter((col) => !usedColumns.has(col));
      const shuffled = rng.sampleRange(columns.length).map((index) => columns[index]);
      rows.forEach((row, index) => { current[row] = shuffled[index]; });
    }
    currentTraceId = trace?.enabled ? ++traceId : 0;
    let currentScore = evaluate(current);
    trace?.enabled && trace.record({
      type: "restart",
      id: currentTraceId,
      parentId: null,
      depth: restarts,
      placements: [...current],
      score: currentScore,
    });
    if (fixed.size === n && currentScore === 0 && validateRowColumns(puzzle, current).valid) {
      found = current;
      foundAt = performance.now();
      reason = REASON.SOLVED;
      finalScore = 0;
      trace?.enabled && trace.record({
        type: "solution",
        id: currentTraceId,
        parentId: null,
        depth: n,
        placements: [...current],
        score: 0,
      });
      break;
    }
    if (initialScore === null) initialScore = currentScore;
    if (currentScore < bestEverScore) {
      bestEverScore = currentScore;
      bestEver = current;
    }
    let sideways = 0;
    let improved = true;
    while (improved) {
      if (timedOut(started, config)) {
        reason = REASON.TIMEOUT;
        break;
      }
      if (iterations >= config.max_iterations) {
        reason = REASON.ITERATION_LIMIT;
        break;
      }
      iterations += 1;
      let bestNeighbor = null;
      let bestNeighborTraceId = null;
      let bestScore = currentScore;
      const equalNeighbors = [];
      const equalNeighborTraceIds = [];
      let neighborCount = 0;
      for (const neighbor of neighbors(current, fixedRows)) {
        const score = evaluate(neighbor);
        neighborCount += 1;
        const id = trace?.enabled ? ++traceId : 0;
        trace?.enabled && trace.record({
          type: score > 0 ? "conflict" : "candidate",
          id,
          parentId: currentTraceId,
          depth: iterations,
          placements: [...neighbor],
          score,
        });
        if (score < bestScore) {
          bestScore = score;
          bestNeighbor = neighbor;
          bestNeighborTraceId = id;
          equalNeighbors.length = 0;
        } else if (score === currentScore) {
          equalNeighbors.push(neighbor);
          if (trace?.enabled) equalNeighborTraceIds.push(id);
        }
        if (score < bestEverScore) {
          bestEverScore = score;
          bestEver = neighbor;
        }
      }
      if (bestNeighbor !== null && bestScore < currentScore) {
        prunedBranches += Math.max(0, neighborCount - 1);
        current = bestNeighbor;
        currentScore = bestScore;
        currentTraceId = bestNeighborTraceId;
        sideways = 0;
        if (currentScore === 0 && validateRowColumns(puzzle, current).valid) {
          found = current;
          foundAt = performance.now();
          reason = REASON.SOLVED;
          finalScore = 0;
          improved = false;
          trace?.enabled && trace.record({
            type: "solution",
            id: currentTraceId,
            parentId: null,
            depth: n,
            placements: [...current],
            score: 0,
          });
          break;
        }
        continue;
      }
      if (equalNeighbors.length > 0 && sideways < config.sideways_moves) {
        const selectedIndex = rng.randbelow(equalNeighbors.length);
        prunedBranches += Math.max(0, neighborCount - 1);
        current = equalNeighbors[selectedIndex];
        currentTraceId = trace?.enabled ? equalNeighborTraceIds[selectedIndex] : 0;
        sideways += 1;
        continue;
      }
      prunedBranches += neighborCount;
      improved = false;
      reason = REASON.LOCAL_OPTIMUM;
      trace?.enabled && trace.record({
        type: "local-optimum",
        id: currentTraceId,
        parentId: null,
        depth: iterations,
        placements: [...current],
        score: currentScore,
      });
    }
    finalScore = currentScore;
    if (found !== null) break;
    restarts += 1;
  }
  if (found === null && bestEver !== null) finalScore = bestEverScore;
  return result(
    "Hill Climbing",
    found !== null,
    found,
    started,
    reason,
    {
      iterations,
      restarts,
      objective_evaluations: evaluations,
      conflicts,
      backtracks: 0,
      pruned_branches: prunedBranches,
      initial_conflict_score: initialScore,
      final_conflict_score: finalScore,
      objective: "diagonal_pairs + kingdom_pairs over a column permutation",
    },
    config.random_seed,
    foundAt,
  );
}

export const SOLVERS = Object.freeze({
  backtracking: solveBacktracking,
  astar: solveAStar,
  hill: solveHillClimbing,
});

export function solveByKey(key, puzzle, config = DEFAULT_CONFIG, fixedQueens = [], trace = null) {
  const solver = SOLVERS[key];
  if (!solver) throw new RangeError(`Unknown solver: ${key}`);
  return solver(puzzle, config, fixedQueens, trace);
}

export { REASON as TERMINATION_REASON };
