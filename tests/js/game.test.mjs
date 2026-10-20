import test from "node:test";
import assert from "node:assert/strict";

import { LEVEL_SPECS, PUZZLES, comparisonPuzzles, puzzleFor, specFor } from "../../web/js/puzzles.js";
import {
  humanFeedback,
  kingdomIsConnected,
  placementConflicts,
  validateComplete,
  validatePuzzleDefinition,
  validateRowColumns,
} from "../../web/js/rules.js";
import { DEFAULT_CONFIG, solveAStar, solveBacktracking, solveHeuristic, solveHillClimbing } from "../../web/js/solvers.js";
import { GameRound, ProgressStore } from "../../web/js/race.js";

const knownSolutions = [
  [2, 0, 3, 1], [1, 3, 0, 2], [3, 1, 4, 2, 0],
  [4, 1, 3, 0, 2], [0, 3, 1, 4, 2], [1, 3, 5, 0, 2, 4],
  [2, 0, 3, 1], [3, 1, 4, 2, 0], [2, 0, 3, 1, 4],
  [1, 3, 0, 2, 4], [4, 2, 0, 5, 3, 1], [3, 0, 4, 1, 5, 2],
];

test("the native game contains the exact 12 source puzzles and progression specs", () => {
  assert.equal(PUZZLES.length, 12);
  assert.equal(LEVEL_SPECS.length, 12);
  for (let index = 0; index < PUZZLES.length; index += 1) {
    const puzzle = PUZZLES[index];
    const spec = LEVEL_SPECS[index];
    assert.equal(puzzle.id, `L${spec.level}G${spec.game}`);
    assert.equal(puzzle.n, spec.n);
    assert.equal(puzzle.kingdoms.length, puzzle.n);
    assert.ok(puzzle.kingdoms.every((row) => row.length === puzzle.n));
    assert.deepEqual(new Set(puzzle.kingdoms.flat()), new Set(Array.from({ length: puzzle.n }, (_, id) => id)));
    assert.deepEqual(puzzle.colors, Array.from({ length: puzzle.n }, (_, id) =>
      [[56, 182, 255], [255, 107, 107], [255, 209, 102], [6, 214, 160], [181, 131, 255], [255, 159, 67]][id],
    ));
    assert.equal(validatePuzzleDefinition(puzzle).valid, true);
    assert.deepEqual(validateRowColumns(puzzle, knownSolutions[index]), {
      valid: true,
      complete: true,
      errors: [],
    });
    for (let kingdom = 0; kingdom < puzzle.n; kingdom += 1) {
      assert.equal(kingdomIsConnected(puzzle, kingdom), true);
    }
    assert.equal(Object.hasOwn(puzzle, "verified_solution"), false);
  }
  assert.deepEqual(comparisonPuzzles().map((puzzle) => puzzle.id), ["L1G1", "L1G3", "L2G1", "L3G2"]);
  assert.equal(specFor(4, 2).algorithmKey, "hill");
  assert.equal(puzzleFor(2, 3).n, 6);
});

test("shared rules reject rows, columns, kingdoms, diagonals, incomplete and invalid boards", () => {
  const puzzle = puzzleFor(1, 1);
  assert.equal(validateRowColumns(puzzle, knownSolutions[0]).valid, true);
  assert.ok(placementConflicts(puzzle, [[0, 2]], [0, 3]).some((error) => error.includes("Row 1")));
  assert.ok(placementConflicts(puzzle, [[0, 2]], [1, 2]).some((error) => error.includes("Column 3")));
  assert.ok(placementConflicts(puzzle, [[0, 2]], [1, 1]).some((error) => error.includes("diagonal")));
  assert.ok(validateComplete(puzzle, [[0, 2]]).errors.some((error) => error.includes("Need exactly")));
  assert.equal(humanFeedback(puzzle, []), "Place one queen in each row, column, and kingdom. Diagonals are forbidden.");
  const malformed = { ...puzzle, kingdoms: [[0, 0], [1, 1]] };
  assert.equal(validatePuzzleDefinition(malformed).valid, false);
});

test("all four real solvers return validated solutions and respect search limits", () => {
  const bt = solveBacktracking(puzzleFor(1, 1), DEFAULT_CONFIG);
  const mrv = solveHeuristic(puzzleFor(2, 1), DEFAULT_CONFIG);
  const astar = solveAStar(puzzleFor(3, 1), DEFAULT_CONFIG);
  const hill = solveHillClimbing(puzzleFor(4, 1), { ...DEFAULT_CONFIG, random_seed: 7 });
  for (const solved of [bt, mrv, astar, hill]) {
    if (solved.success) assert.equal(validateRowColumns(
      puzzleFor(Number(solved.algorithmName === "Basic Backtracking" ? 1 : solved.algorithmName === "MRV + Forward Checking" ? 2 : solved.algorithmName === "A* Search" ? 3 : 4), 1),
      solved.solution,
    ).valid, true);
    assert.ok(solved.elapsedSeconds >= 0);
  }
  assert.equal(bt.metrics.nodes_visited > 0, true);
  assert.equal(mrv.metrics.candidates_eliminated >= 0, true);
  assert.equal(astar.metrics.path_cost, puzzleFor(3, 1).n);
  assert.equal(astar.metrics.heuristic, "h(n) = N - q(n), g(n) = q(n), f(n) = g(n) + h(n)");

  assert.equal(solveBacktracking(puzzleFor(1, 3), { ...DEFAULT_CONFIG, max_nodes: 1 }).terminationReason, "node_limit");
  assert.equal(solveHeuristic(puzzleFor(2, 3), { ...DEFAULT_CONFIG, max_nodes: 1 }).terminationReason, "node_limit");
  assert.equal(solveAStar(puzzleFor(3, 2), { ...DEFAULT_CONFIG, max_expanded: 1 }).terminationReason, "expanded_limit");
});

test("each of the 12 games runs its configured solver and returns a valid placement", () => {
  const expectedByPuzzle = [
    [2, 0, 3, 1], [1, 3, 0, 2], [3, 1, 4, 2, 0],
    [1, 4, 2, 0, 3], [0, 3, 1, 4, 2], [1, 3, 5, 0, 2, 4],
    [2, 0, 3, 1], [3, 1, 4, 2, 0], [2, 0, 3, 1, 4],
    [1, 3, 0, 2, 4], [4, 2, 0, 5, 3, 1], [3, 0, 4, 1, 5, 2],
  ];
  for (let index = 0; index < PUZZLES.length; index += 1) {
    const puzzle = PUZZLES[index];
    const spec = LEVEL_SPECS[index];
    const solved = ({
      backtracking: solveBacktracking,
      heuristic: solveHeuristic,
      astar: solveAStar,
      hill: solveHillClimbing,
    })[spec.algorithmKey](puzzle, DEFAULT_CONFIG);
    assert.equal(solved.success, true, `${puzzle.id} ${spec.algorithm}`);
    assert.deepEqual(solved.solution, expectedByPuzzle[index], puzzle.id);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true, puzzle.id);
  }
});

test("Hill Climbing preserves the Python-seeded random search behavior", () => {
  const solved = solveHillClimbing(puzzleFor(4, 1), {
    ...DEFAULT_CONFIG,
    time_limit_seconds: 1,
    max_restarts: 3,
    max_iterations: 40,
    random_seed: 99,
  });
  assert.equal(solved.success, true);
  assert.deepEqual(solved.solution, [1, 3, 0, 2, 4]);
  assert.deepEqual(
    {
      iterations: solved.metrics.iterations,
      restarts: solved.metrics.restarts,
      objective_evaluations: solved.metrics.objective_evaluations,
      initial_conflict_score: solved.metrics.initial_conflict_score,
      final_conflict_score: solved.metrics.final_conflict_score,
    },
    {
      iterations: 2,
      restarts: 0,
      objective_evaluations: 21,
      initial_conflict_score: 5,
      final_conflict_score: 0,
    },
  );
});

test("X marks do not affect queen validation or mistakes; each bad queen cell counts once", () => {
  const round = new GameRound(puzzleFor(1, 1), 10_000);
  round.toggleXMark(0, 2);
  round.toggleHuman(0, 2, 10_100);
  assert.equal(round.mistakes, 0);
  round.toggleHuman(0, 3, 10_200);
  assert.equal(round.mistakes, 1);
  round.toggleHuman(0, 3, 10_300);
  assert.equal(round.mistakes, 1);
  assert.equal(round.invalidCells.has("0,3"), true);
  assert.equal(round.humanQueens.has("0,3"), false);
  assert.equal(round.xMarks.has("0,2"), true);

  round.toggleHuman(0, 0, 10_400);
  round.toggleHuman(0, 1, 10_500);
  assert.equal(round.mistakes, 3);
  assert.equal(round.result.outcome, "human_failed");
  assert.equal(round.canEdit(), false);
  round.toggleXMark(1, 0);
  assert.equal(round.xMarks.has("1,0"), false);
});

test("valid human and AI solutions finish a race and compare elapsed times", () => {
  const puzzle = puzzleFor(1, 1);
  const round = new GameRound(puzzle, 20_000);
  round.toggleXMark(0, 2);
  for (const [row, col] of knownSolutions[0].map((col, row) => [row, col])) {
    round.toggleHuman(row, col, 20_100);
  }
  assert.equal(round.mistakes, 0);
  assert.equal(round.submit(21_000), true);
  assert.equal(round.result, null);
  round.applyAIResult({
    success: true,
    solution: knownSolutions[0],
    elapsedSeconds: 0.8,
    raceElapsedSeconds: 0.8,
    foundAtMonotonic: 20_800,
    algorithmName: "Basic Backtracking",
    metrics: {},
    terminationReason: "solved",
    randomSeed: null,
  }, 21_100);
  assert.equal(round.result.outcome, "ai_win");
  assert.equal(round.result.humanValid, true);
  assert.equal(round.result.aiValid, true);
  assert.equal(round.aiQueens.size, puzzle.n);
  assert.equal(round.xMarks.has("0,2"), true);
  assert.equal(GameRound.determineWinner(1, 1.02, 0.05), "draw");
  assert.equal(GameRound.determineWinner(1, 1.2, 0.05), "human_win");
});

test("a single solved competitor waits for timeout; abandoning does not award completion", () => {
  const puzzle = puzzleFor(1, 1);
  const round = new GameRound(puzzle, 0, { round_time_limit_seconds: 1 });
  round.applyAIResult({
    success: true,
    solution: knownSolutions[0],
    elapsedSeconds: 0.2,
    raceElapsedSeconds: 0.2,
    foundAtMonotonic: 200,
    algorithmName: "Basic Backtracking",
    metrics: {},
    terminationReason: "solved",
    randomSeed: null,
  }, 250);
  assert.equal(round.result, null);
  round.tick(1_000);
  assert.equal(round.result.outcome, "ai_win");

  const abandoned = new GameRound(puzzle, 0);
  assert.equal(abandoned.abandon().outcome, "abandoned");
  assert.equal(abandoned.canEdit(), false);
});

test("local progress is persistent and unlocks each level only after three games", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progress = new ProgressStore(storage);
  assert.equal(progress.isLevelUnlocked(1), true);
  assert.equal(progress.isLevelUnlocked(2), false);
  progress.markCompleted(1, 1);
  progress.markCompleted(1, 1);
  assert.equal(progress.completedCount(1), 1);
  progress.markCompleted(1, 2);
  progress.markCompleted(1, 3);
  assert.equal(progress.isLevelUnlocked(2), true);
  assert.equal(progress.isLevelUnlocked(3), false);
  const restored = new ProgressStore(storage);
  assert.equal(restored.isLevelUnlocked(2), true);
  assert.equal(restored.isCompleted(1, 3), true);
});
