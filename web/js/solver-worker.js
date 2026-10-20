import { comparisonPuzzles, LEVEL_SPECS, PUZZLES } from "./puzzles.js?three-solvers-v2";
import { DEFAULT_CONFIG, SOLVERS, solveByKey } from "./solvers.js?three-solvers-v2";
import { validateRowColumns } from "./rules.js?three-solvers-v2";

const MAX_LAB_TRACE_EVENTS = 6_000;

function solveOne(message) {
  const { puzzle, solverKey, config, startedAtEpoch, fixedQueens = [] } = message;
  const solved = solveByKey(solverKey, puzzle, config, fixedQueens);
  return {
    ...solved,
    raceElapsedSeconds: solved.success && solved.foundAtMonotonic !== null
      ? Math.max(
        0,
        (performance.timeOrigin + solved.foundAtMonotonic - startedAtEpoch) / 1000,
      )
      : null,
  };
}

function solveForLab(message) {
  const trace = {
    enabled: true,
    events: [],
    truncated: false,
    record(event) {
      if (this.events.length >= MAX_LAB_TRACE_EVENTS) {
        this.enabled = false;
        this.truncated = true;
        return;
      }
      this.events.push(event);
    },
  };
  const solved = solveByKey(
    message.solverKey,
    message.puzzle,
    { ...DEFAULT_CONFIG, ...message.config },
    [],
    trace,
  );
  const metrics = solved.metrics || {};
  return {
    result: solved,
    events: trace.events,
    traceTruncated: trace.truncated,
    statistics: {
      nodesExplored: metrics.nodes_visited ?? metrics.states_expanded ?? metrics.objective_evaluations ?? 0,
      conflicts: metrics.conflicts ?? 0,
      backtracks: metrics.backtrack_steps ?? metrics.backtracks ?? 0,
      prunedBranches: metrics.pruned_branches ?? metrics.candidates_eliminated ?? 0,
      elapsedSeconds: solved.elapsedSeconds,
    },
  };
}

function solveGallery() {
  const solutions = [];
  const failedPuzzles = [];
  for (const puzzle of PUZZLES) {
    const spec = LEVEL_SPECS.find((item) => item.level === puzzle.level && item.game === puzzle.game);
    const attempts = spec.algorithmKey === "hill" ? 5 : 1;
    let found = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const solved = solveByKey(spec.algorithmKey, puzzle, {
        ...DEFAULT_CONFIG,
        random_seed: DEFAULT_CONFIG.random_seed + puzzle.level * 10 + puzzle.game + attempt,
      });
      if (solved.success && validateRowColumns(puzzle, solved.solution).valid) {
        found = solved;
        break;
      }
    }
    if (!found) {
      failedPuzzles.push(puzzle.id);
      continue;
    }
    solutions.push({
      puzzleId: puzzle.id,
      algorithm: spec.algorithm,
      solution: found.solution,
      elapsedSeconds: found.elapsedSeconds,
    });
  }
  return { solutions, failedPuzzles };
}

self.addEventListener("message", (event) => {
  const message = event.data;
  try {
    if (message.type === "solve") {
      self.postMessage({ type: "result", result: solveOne(message) });
      return;
    }
    if (message.type === "lab") {
      self.postMessage({ type: "lab-result", ...solveForLab(message) });
      return;
    }
    if (message.type === "gallery") {
      self.postMessage({ type: "gallery-result", ...solveGallery() });
      return;
    }
    if (message.type === "compare") {
      const rows = Object.entries(SOLVERS).map(([key, solver]) => {
        const spec = LEVEL_SPECS.find((item) => item.algorithmKey === key);
        let successes = 0;
        let lastResult = null;
        for (let repeat = 0; repeat < message.repeats; repeat += 1) {
          const config = {
            ...DEFAULT_CONFIG,
            ...message.config,
            random_seed: DEFAULT_CONFIG.random_seed + repeat,
          };
          lastResult = solver(message.puzzle, config);
          if (lastResult.success) successes += 1;
        }
        return {
          algorithm: spec.algorithm,
          result: lastResult,
          successes,
          repeats: message.repeats,
        };
      });
      self.postMessage({ type: "comparison", rows });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
