import test from "node:test";
import assert from "node:assert/strict";

import { GAMES_PER_LEVEL, LEVEL_COUNT, LEVEL_SPECS, PUZZLES, comparisonPuzzles, puzzleFor, specFor } from "../../web/js/puzzles.js";
import { AI_MOVE_DELAY_MS } from "../../web/js/config.js";
import {
  humanFeedback,
  kingdomIsConnected,
  isSafePartial,
  placementConflicts,
  validateComplete,
  validatePuzzleDefinition,
  validateRowColumns,
} from "../../web/js/rules.js";
import { DEFAULT_CONFIG, SOLVERS, solveAStar, solveBacktracking, solveByKey, solveHillClimbing } from "../../web/js/solvers.js";
import { GameRound, ProgressStore } from "../../web/js/race.js";

const knownSolutions = [
  [2, 0, 3, 1], [1, 3, 0, 2], [2, 0, 3, 1],
  [3, 1, 4, 2, 0], [3, 1, 4, 2, 0], [1, 3, 5, 0, 2, 4],
  [1, 3, 0, 2, 4], [4, 2, 0, 5, 3, 1], [3, 0, 4, 1, 5, 2],
];

test("the native game contains nine puzzles across three algorithm tiers", () => {
  assert.equal(PUZZLES.length, 9);
  assert.equal(LEVEL_SPECS.length, 9);
  assert.equal(LEVEL_COUNT, 3);
  assert.equal(GAMES_PER_LEVEL, 3);
  assert.deepEqual(Object.keys(SOLVERS), ["backtracking", "astar", "hill"]);
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
  assert.equal(specFor(3, 2).algorithmKey, "hill");
  assert.deepEqual(LEVEL_SPECS.map((spec) => spec.n), [4, 4, 4, 5, 5, 6, 5, 6, 6]);
  assert.deepEqual(
    [1, 2, 3].map((level) => LEVEL_SPECS.filter((spec) => spec.level === level).map((spec) => spec.n)),
    [[4, 4, 4], [5, 5, 6], [5, 6, 6]],
  );
  assert.deepEqual([1, 2, 3].map((level) => specFor(level, 1).name), ["Easy", "Hard", "Expert"]);
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

test("all three active solvers return validated solutions and respect search limits", () => {
  const bt = solveBacktracking(puzzleFor(1, 1), DEFAULT_CONFIG);
  const astar = solveAStar(puzzleFor(2, 1), DEFAULT_CONFIG);
  const hill = solveHillClimbing(puzzleFor(3, 1), { ...DEFAULT_CONFIG, random_seed: 7 });
  for (const [puzzle, solved] of [[puzzleFor(1, 1), bt], [puzzleFor(2, 1), astar], [puzzleFor(3, 1), hill]]) {
    assert.equal(solved.success, true);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true);
    assert.ok(solved.elapsedSeconds >= 0);
  }
  assert.equal(bt.metrics.nodes_visited > 0, true);
  assert.equal(astar.metrics.path_cost, puzzleFor(2, 1).n);
  assert.equal(astar.metrics.heuristic, "h(n) = N - q(n), g(n) = q(n), f(n) = g(n) + h(n)");

  assert.equal(solveBacktracking(puzzleFor(1, 3), { ...DEFAULT_CONFIG, max_nodes: 1 }).terminationReason, "node_limit");
  assert.throws(() => solveByKey("heuristic", puzzleFor(1, 1)), /Unknown solver/);
  assert.equal(solveAStar(puzzleFor(2, 2), { ...DEFAULT_CONFIG, max_expanded: 1 }).terminationReason, "expanded_limit");
});

test("each of the nine games runs its configured solver and returns a valid placement", () => {
  const expectedByPuzzle = [
    [2, 0, 3, 1], [1, 3, 0, 2], [2, 0, 3, 1],
    [3, 1, 4, 2, 0], [3, 1, 4, 2, 0], [1, 3, 5, 0, 2, 4],
    [1, 3, 0, 2, 4], [4, 2, 0, 5, 3, 1], [3, 0, 4, 1, 5, 2],
  ];
  for (let index = 0; index < PUZZLES.length; index += 1) {
    const puzzle = PUZZLES[index];
    const spec = LEVEL_SPECS[index];
    const solved = ({
      backtracking: solveBacktracking,
      astar: solveAStar,
      hill: solveHillClimbing,
    })[spec.algorithmKey](puzzle, DEFAULT_CONFIG);
    assert.equal(solved.success, true, `${puzzle.id} ${spec.algorithm}`);
    assert.deepEqual(solved.solution, expectedByPuzzle[index], puzzle.id);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true, puzzle.id);
  }
});

test("Hill Climbing preserves the Python-seeded random search behavior", () => {
  const solved = solveHillClimbing(puzzleFor(3, 1), {
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

const solverFor = {
  backtracking: solveBacktracking,
  astar: solveAStar,
  hill: solveHillClimbing,
};

function makeSolverResult(level = 1, game = 1, fixedQueens = []) {
  const spec = specFor(level, game);
  return solverFor[spec.algorithmKey](
    puzzleFor(level, game),
    { ...DEFAULT_CONFIG, random_seed: 42 },
    fixedQueens,
  );
}

test("the visualization trace is emitted by each genuine solver execution", () => {
  const requirements = {
    backtracking: ["explore", "conflict", "backtrack", "solution"],
    astar: ["expand", "conflict", "solution"],
    hill: ["restart", "conflict", "solution"],
  };
  for (let level = 1; level <= LEVEL_COUNT; level += 1) {
    const puzzle = puzzleFor(level, 1);
    const spec = specFor(level, 1);
    const events = [];
    const trace = { enabled: true, record: (event) => events.push(event) };
    const solved = solveByKey(
      spec.algorithmKey,
      puzzle,
      { ...DEFAULT_CONFIG, random_seed: 99, time_limit_seconds: 5 },
      [],
      trace,
    );
    assert.equal(solved.success, true, `${spec.algorithm} trace search should solve`);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true);
    for (const eventType of requirements[spec.algorithmKey]) {
      assert.ok(events.some((event) => event.type === eventType), `${spec.algorithm}: missing ${eventType}`);
    }
    const solutionEvent = events.find((event) => event.type === "solution");
    assert.ok(solutionEvent.placements.every((col) => Number.isInteger(col) && col >= 0));
    assert.ok(events.every((event) => Array.isArray(event.placements)));
    assert.ok(solved.metrics.conflicts >= 0);
    assert.ok(solved.metrics.pruned_branches >= 0);
  }
});

test("turns alternate, X actions consume turns, and one AI action is revealed per turn", () => {
  const puzzle = puzzleFor(1, 1);
  const round = new GameRound(puzzle, 0);
  assert.equal(round.currentTurn, "human");
  assert.equal(round.canEdit(), true);
  assert.equal(round.setAIPlan(makeSolverResult()), true);

  assert.equal(round.toggleXMark(0, 0, 100), true);
  assert.equal(round.mistakes, 0);
  assert.equal(round.currentTurn, "ai");
  assert.equal(round.canEdit(), false);
  assert.equal(round.tick(100 + AI_MOVE_DELAY_MS - 1), null);
  assert.equal(round.aiActions, 0);
  round.tick(100 + AI_MOVE_DELAY_MS);
  assert.equal(round.aiActions, 1);
  assert.equal(round.lastAIMove.type, "queen");
  assert.equal(round.currentTurn, "human");

  round.toggleXMark(0, 1, 900);
  round.tick(900 + AI_MOVE_DELAY_MS);
  assert.equal(round.aiActions, 2);
  assert.equal(round.lastAIMove.type, "x");
  assert.equal(round.aiXMarks.size, 1);
  assert.equal(round.currentTurn, "human");
  assert.equal(round.mistakes, 0);
});

test("all three levels use the one shared configurable AI delay", () => {
  assert.equal(AI_MOVE_DELAY_MS, 700);
  for (const spec of LEVEL_SPECS) {
    const round = new GameRound(puzzleFor(spec.level, spec.game), 0);
    assert.equal(round.aiMoveDelayMs, AI_MOVE_DELAY_MS);
    assert.equal(new GameRound(round.puzzle, 0, { ai_move_delay_ms: 275 }).aiMoveDelayMs, 275);
  }
});

test("each level invokes its configured genuine solver and plans a validated full solution", () => {
  const expectedNames = {
    backtracking: "Basic Backtracking",
    astar: "A* Search",
    hill: "Hill Climbing",
  };
  for (const spec of LEVEL_SPECS) {
    const solved = makeSolverResult(spec.level, spec.game);
    assert.equal(solved.algorithmName, expectedNames[spec.algorithmKey], spec.algorithm);
    assert.equal(solved.success, true, `${puzzleFor(spec.level, spec.game).id}`);
    assert.equal(validateRowColumns(puzzleFor(spec.level, spec.game), solved.solution).valid, true);
  }
});

test("each active algorithm can repair a plan around an already-placed legal AI Queen", () => {
  for (let level = 1; level <= LEVEL_COUNT; level += 1) {
    const puzzle = puzzleFor(level, 1);
    const spec = specFor(level, 1);
    const solver = solverFor[spec.algorithmKey];
    const solution = solver(puzzle, { ...DEFAULT_CONFIG, random_seed: 99 });
    const fixed = [[0, solution.solution[0]]];
    const repaired = solver(puzzle, { ...DEFAULT_CONFIG, random_seed: 99 }, fixed);
    assert.equal(repaired.success, true, `${spec.algorithm} could not extend fixed Queen`);
    assert.equal(repaired.solution[0], fixed[0][1]);
    assert.equal(validateRowColumns(puzzle, repaired.solution).valid, true);
  }
});

test("AI waits for computation as well as the fixed reveal delay", () => {
  const round = new GameRound(puzzleFor(1, 1), 0);
  round.toggleHuman(0, 2, 100);
  assert.equal(round.currentTurn, "ai");
  assert.equal(round.tick(800), null);
  assert.equal(round.aiActions, 0);

  round.setAIPlan(makeSolverResult(), 900);
  assert.equal(round.tick(899), null);
  assert.equal(round.aiActions, 0);
  round.tick(900);
  assert.equal(round.aiActions, 1);
  assert.equal(round.lastAIMove.type, "queen");
});

test("invalid Queens do not advance turns, repeated cells count once, and three distinct errors fail", () => {
  const round = new GameRound(puzzleFor(1, 1), 0);
  round.setAIPlan(makeSolverResult());
  round.toggleHuman(0, 0, 100);
  round.tick(100 + AI_MOVE_DELAY_MS);
  assert.equal(round.currentTurn, "human");

  assert.equal(round.toggleHuman(1, 0, 900), false);
  assert.equal(round.currentTurn, "human");
  assert.equal(round.mistakes, 1);
  round.toggleHuman(1, 0, 901);
  assert.equal(round.mistakes, 1);
  assert.equal(round.invalidCells.has("1,0"), true);
  assert.equal(round.humanQueens.has("1,0"), false);

  round.toggleHuman(1, 1, 902);
  round.toggleHuman(0, 1, 903);
  assert.equal(round.mistakes, 3);
  assert.equal(round.result.outcome, "human_failed");
  assert.equal(round.canEdit(), false);
});

test("X marks are visual only, never count as mistakes, and remain independent of Queen placement", () => {
  const round = new GameRound(puzzleFor(1, 1), 0);
  round.setAIPlan(makeSolverResult());
  assert.equal(round.toggleXMark(0, 2, 100), true);
  assert.equal(round.mistakes, 0);
  round.tick(100 + AI_MOVE_DELAY_MS);
  round.toggleXMark(1, 1, 900);
  round.tick(900 + AI_MOVE_DELAY_MS);
  round.toggleHuman(0, 2, 1_700);
  assert.equal(round.humanQueens.has("0,2"), true);
  assert.equal(round.xMarks.has("0,2"), true);
  assert.equal(round.mistakes, 0);
});

test("a fully valid human solution wins immediately and a failed AI search forfeits explicitly", () => {
  const puzzle = puzzleFor(1, 1);
  const humanWin = new GameRound(puzzle, 0);
  humanWin.setAIPlan(makeSolverResult());
  let now = 100;
  for (const [row, col] of knownSolutions[0].map((col, row) => [row, col])) {
    assert.equal(humanWin.toggleHuman(row, col, now), true);
    if (!humanWin.result) {
      now += AI_MOVE_DELAY_MS;
      humanWin.tick(now);
      now += 1;
    }
  }
  assert.equal(humanWin.result.outcome, "human_win");
  assert.equal(humanWin.result.humanValid, true);

  const failed = new GameRound(puzzle, 0);
  assert.equal(failed.setAIPlan({
    success: false,
    solution: null,
    algorithmName: "Basic Backtracking",
    terminationReason: "node_limit",
    metrics: {},
  }, 50), false);
  assert.equal(failed.result.outcome, "human_win");
  assert.match(failed.result.notes[0], /could not find a legal continuation/);
  assert.equal(failed.tick(100), failed.result);
});

test("a human can time out, abandon, restart, and retain the three-game unlock rule", () => {
  const puzzle = puzzleFor(1, 1);
  const timed = new GameRound(puzzle, 0, { round_time_limit_seconds: 1 });
  timed.setAIPlan(makeSolverResult());
  assert.equal(timed.tick(1_000).outcome, "draw");

  const abandoned = new GameRound(puzzle, 0);
  assert.equal(abandoned.abandon().outcome, "abandoned");
  assert.equal(abandoned.canEdit(), false);

  const restarted = new GameRound(puzzle, 0);
  assert.equal(restarted.mistakes, 0);
  assert.equal(restarted.currentTurn, "human");

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
  assert.equal(restored.isLevelUnlocked(4), false);
});

test("legacy progression drops the removed tier and remaps later-tier completions", () => {
  const values = new Map([["kingdom-wars-progress", JSON.stringify({
    completed: [
      [1, 1], [1, 2], [1, 3],
      [2, 1], [2, 2], [2, 3],
      [3, 1],
      [4, 1],
    ],
  })]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progress = new ProgressStore(storage);
  assert.equal(progress.completedCount(1), 3);
  assert.equal(progress.completedCount(2), 1);
  assert.equal(progress.completedCount(3), 1);
  assert.equal(progress.isCompleted(2, 1), true);
  assert.equal(progress.isCompleted(2, 2), false);
  assert.equal(progress.isCompleted(3, 1), true);
  assert.equal(progress.isLevelUnlocked(3), false);
  assert.equal(progress.isLevelUnlocked(4), false);
  assert.equal(JSON.parse(values.get("kingdom-wars-progress")).version, 2);
});

test("seeded difficulty study shows increasing challenge across the three tiers", () => {
  const samplesPerPuzzle = 100;
  const humanThinkMs = 100;
  const levels = [];

  function humanSearchPlan(puzzle, seed) {
    let randomState = (seed + 1) >>> 0;
    const random = () => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) / 4_294_967_296;
    };
    const columns = Array(puzzle.n).fill(-1);
    const actions = [];
    let decisions = 0;

    function search(row) {
      if (row === puzzle.n) return validateRowColumns(puzzle, columns).valid;
      const options = Array.from({ length: puzzle.n }, (_, col) => col);
      for (let index = options.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
      }
      for (const col of options) {
        decisions += 1;
        if (!isSafePartial(puzzle, columns, row, col)) continue;
        columns[row] = col;
        actions.push({ row, col });
        if (search(row + 1)) return true;
        actions.push({ row, col });
        columns[row] = -1;
      }
      return false;
    }

    assert.equal(search(0), true, `human policy must solve ${puzzle.id}`);
    return { actions, decisions };
  }

  for (let level = 1; level <= LEVEL_COUNT; level += 1) {
    const puzzles = PUZZLES.filter((puzzle) => puzzle.level === level);
    const totals = {
      humanWins: 0,
      aiWins: 0,
      draws: 0,
      aiSearchSuccesses: 0,
      humanDecisions: 0,
      humanTurns: 0,
      aiTurns: 0,
      searchEffort: 0,
    };
    for (const puzzle of puzzles) {
      const spec = specFor(level, puzzle.game);
      for (let seed = 0; seed < samplesPerPuzzle; seed += 1) {
        const solved = solverFor[spec.algorithmKey](puzzle, {
          ...DEFAULT_CONFIG,
          random_seed: seed,
        });
        const policy = humanSearchPlan(puzzle, seed);
        const round = new GameRound(puzzle, 0);
        round.setAIPlan(solved, solved.elapsedSeconds * 1000);
        let now = 0;
        let humanTurns = 0;
        if (!round.result) {
          for (const action of policy.actions) {
            now += humanThinkMs;
            assert.equal(round.toggleHuman(action.row, action.col, now), true);
            humanTurns += 1;
            if (round.result) break;
            now = Math.max(now + AI_MOVE_DELAY_MS, solved.elapsedSeconds * 1000);
            round.tick(now);
            if (round.result) break;
          }
        }
        assert.ok(round.result, `${puzzle.id} seed ${seed} must end within the planned actions`);
        totals.humanWins += Number(round.result.outcome === "human_win");
        totals.aiWins += Number(round.result.outcome === "ai_win");
        totals.draws += Number(round.result.outcome === "draw");
        totals.aiSearchSuccesses += Number(solved.success);
        totals.humanDecisions += policy.decisions;
        totals.humanTurns += humanTurns;
        totals.aiTurns += round.aiActions;
        totals.searchEffort += solved.metrics.nodes_visited
          ?? solved.metrics.states_expanded
          ?? solved.metrics.objective_evaluations
          ?? 0;
      }
    }
    const samples = samplesPerPuzzle * puzzles.length;
    levels.push({
      level,
      tier: specFor(level, 1).name,
      samples,
      humanWinRate: totals.humanWins / samples,
      aiWinRate: totals.aiWins / samples,
      aiSearchSuccessRate: totals.aiSearchSuccesses / samples,
      avgHumanDecisions: totals.humanDecisions / samples,
      avgHumanTurns: totals.humanTurns / samples,
      avgAITurns: totals.aiTurns / samples,
      avgSolverEffort: totals.searchEffort / samples,
    });
  }

  assert.deepEqual(levels.map((entry) => entry.samples), [300, 300, 300]);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(
      levels[index].avgHumanDecisions > levels[index - 1].avgHumanDecisions,
      `${levels[index].tier} should require more policy decisions than ${levels[index - 1].tier}`,
    );
    assert.ok(
      levels[index].humanWinRate < levels[index - 1].humanWinRate,
      `${levels[index].tier} should have a lower human-policy win rate than ${levels[index - 1].tier}`,
    );
  }
  console.log("Seeded difficulty study:", JSON.stringify(levels));
});
