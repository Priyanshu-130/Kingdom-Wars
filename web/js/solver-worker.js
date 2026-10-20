import { comparisonPuzzles, LEVEL_SPECS, puzzleFor } from "./puzzles.js";
import { DEFAULT_CONFIG, SOLVERS, solveByKey } from "./solvers.js";

function solveOne(message) {
  const { puzzle, solverKey, config, startedAtEpoch } = message;
  const solved = solveByKey(solverKey, puzzle, config);
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

self.addEventListener("message", (event) => {
  const message = event.data;
  try {
    if (message.type === "solve") {
      self.postMessage({ type: "result", result: solveOne(message) });
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
