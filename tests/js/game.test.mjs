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
import {
  DEFAULT_CONFIG,
  SOLVERS,
  solveByKey,
  solveGreedyBestFirst,
  solveMRVForwardChecking,
} from "../../web/js/solvers.js";
import { GameRound, ProgressStore } from "../../web/js/race.js";

const knownSolutions = [
  [2, 0, 3, 1],
  [1, 3, 0, 2],
  [2, 0, 3, 1],
  [3, 1, 4, 2, 0],
  [1, 3, 5, 0, 2, 4],
  [4, 2, 0, 5, 3, 1],
];

test("the native game contains six puzzles across two algorithm tiers", () => {
  assert.equal(PUZZLES.length, 6);
  assert.equal(LEVEL_SPECS.length, 6);
  assert.equal(LEVEL_COUNT, 2);
  assert.equal(GAMES_PER_LEVEL, 3);
  assert.deepEqual(Object.keys(SOLVERS).sort(), ["greedy", "mrv"]);
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
  assert.deepEqual(comparisonPuzzles().map((puzzle) => puzzle.id), ["L1G1", "L1G2", "L2G1", "L2G2"]);
  assert.equal(specFor(2, 2).algorithmKey, "greedy");
  assert.deepEqual(LEVEL_SPECS.map((spec) => spec.n), [4, 4, 4, 5, 6, 6]);
  assert.deepEqual(
    [1, 2].map((level) => LEVEL_SPECS.filter((spec) => spec.level === level).map((spec) => spec.n)),
    [[4, 4, 4], [5, 6, 6]],
  );
  assert.deepEqual([1, 2].map((level) => specFor(level, 1).name), ["Level 1", "Level 2"]);
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

test("both active solvers return validated solutions and respect search limits", () => {
  const mrv = solveMRVForwardChecking(puzzleFor(1, 1), DEFAULT_CONFIG);
  const greedy = solveGreedyBestFirst(puzzleFor(2, 1), DEFAULT_CONFIG);

  for (const [puzzle, solved] of [
    [puzzleFor(1, 1), mrv],
    [puzzleFor(2, 1), greedy],
  ]) {
    assert.equal(solved.success, true);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true);
    assert.ok(solved.elapsedSeconds >= 0);
  }

  assert.ok(mrv.metrics.candidates_eliminated >= 0);
  assert.ok(mrv.metrics.nodes_visited > 0);
  assert.ok(greedy.metrics.heuristic.includes("pure heuristic"));

  assert.throws(() => solveByKey("unknown_solver", puzzleFor(1, 1)), /Unknown solver/);
  assert.equal(solveGreedyBestFirst(puzzleFor(2, 1), { ...DEFAULT_CONFIG, max_expanded: 1 }).terminationReason, "expanded_limit");
  assert.equal(solveMRVForwardChecking(puzzleFor(1, 1), { ...DEFAULT_CONFIG, max_nodes: 1 }).terminationReason, "node_limit");
});

test("each of the six games runs its configured solver and returns a valid placement", () => {
  for (let index = 0; index < PUZZLES.length; index += 1) {
    const puzzle = PUZZLES[index];
    const spec = LEVEL_SPECS[index];
    const solved = ({
      greedy: solveGreedyBestFirst,
      mrv: solveMRVForwardChecking,
    })[spec.algorithmKey](puzzle, DEFAULT_CONFIG);
    assert.equal(solved.success, true, `${puzzle.id} ${spec.algorithm}`);
    assert.deepEqual(solved.solution, knownSolutions[index], puzzle.id);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true, puzzle.id);
  }
});

test("MRV + Forward Checking and Greedy Best-First handle edge cases, fixed queens, and unsatisfiability", () => {
  const puzzle = puzzleFor(1, 1);
  const fixed = [[0, 2]];
  const mrvSolved = solveMRVForwardChecking(puzzle, DEFAULT_CONFIG, fixed);
  assert.equal(mrvSolved.success, true);
  assert.equal(mrvSolved.solution[0], 2);

  const greedySolved = solveGreedyBestFirst(puzzle, DEFAULT_CONFIG, fixed);
  assert.equal(greedySolved.success, true);
  assert.equal(greedySolved.solution[0], 2);

  const badFixed = [[0, 99]];
  assert.equal(solveMRVForwardChecking(puzzle, DEFAULT_CONFIG, badFixed).terminationReason, "invalid_fixed_placements");
  assert.equal(solveGreedyBestFirst(puzzle, DEFAULT_CONFIG, badFixed).terminationReason, "invalid_fixed_placements");

  const unsolvable = {
    n: 2,
    kingdoms: [[0, 1], [0, 1]],
    colors: [[56, 182, 255], [255, 107, 107]],
  };
  assert.equal(solveMRVForwardChecking(unsolvable, DEFAULT_CONFIG).terminationReason, "unsolvable");
  assert.equal(solveGreedyBestFirst(unsolvable, DEFAULT_CONFIG).terminationReason, "unsolvable");
});

const solverFor = {
  greedy: solveGreedyBestFirst,
  mrv: solveMRVForwardChecking,
};

function makeSolverResult(level = 1, game = 1, fixedQueens = []) {
  const spec = specFor(level, game);
  return solverFor[spec.algorithmKey](
    puzzleFor(level, game),
    DEFAULT_CONFIG,
    fixedQueens,
  );
}

test("the visualization trace is emitted by each genuine solver execution", () => {
  const requirements = {
    greedy: ["expand", "conflict", "solution"],
    mrv: ["explore", "conflict", "backtrack", "solution"],
  };
  for (const key of ["greedy", "mrv"]) {
    const puzzle = puzzleFor(1, 1);
    const events = [];
    const trace = { enabled: true, record: (event) => events.push(event) };
    const solved = solverFor[key](
      puzzle,
      { ...DEFAULT_CONFIG, time_limit_seconds: 5 },
      [],
      trace,
    );
    assert.equal(solved.success, true, `${key} trace search should solve`);
    assert.equal(validateRowColumns(puzzle, solved.solution).valid, true);
    for (const eventType of requirements[key]) {
      assert.ok(events.some((event) => event.type === eventType), `${key}: missing ${eventType}`);
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

test("both levels use the shared configurable AI delay", () => {
  assert.equal(AI_MOVE_DELAY_MS, 700);
  for (const spec of LEVEL_SPECS) {
    const round = new GameRound(puzzleFor(spec.level, spec.game), 0);
    assert.equal(round.aiMoveDelayMs, AI_MOVE_DELAY_MS);
    assert.equal(new GameRound(round.puzzle, 0, { ai_move_delay_ms: 275 }).aiMoveDelayMs, 275);
  }
});

test("each level invokes its configured genuine solver and plans a validated full solution", () => {
  const expectedNames = {
    mrv: "MRV + Forward Checking",
    greedy: "Greedy Best-First Search",
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
    const solution = solver(puzzle, DEFAULT_CONFIG);
    const fixed = [[0, solution.solution[0]]];
    const repaired = solver(puzzle, DEFAULT_CONFIG, fixed);
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
  assert.equal(round.currentTurn, "human");
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
    algorithmName: "MRV + Forward Checking",
    terminationReason: "node_limit",
    metrics: {},
  }, 50), false);
  assert.equal(failed.result.outcome, "human_win");
  assert.match(failed.result.notes[0], /could not find a legal continuation/);
  assert.equal(failed.tick(100), failed.result);
});

test("a human can time out, abandon, restart, and retain the level unlock rule", () => {
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
  const restored = new ProgressStore(storage);
  assert.equal(restored.isLevelUnlocked(2), true);
  assert.equal(restored.isCompleted(1, 3), true);
  assert.equal(restored.isLevelUnlocked(3), false);
});

test("legacy progression drops removed tiers and remaps completions to active levels", () => {
  const values = new Map([["kingdom-wars-progress", JSON.stringify({
    version: 2,
    completed: [
      [1, 1], [1, 2], [1, 3],
      [2, 1],
      [3, 1],
    ],
  })]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progress = new ProgressStore(storage);
  assert.equal(progress.completedCount(1), 3);
  assert.equal(progress.completedCount(2), 1);
  assert.equal(progress.isCompleted(1, 1), true);
  assert.equal(progress.isCompleted(2, 1), true);
  assert.equal(progress.isLevelUnlocked(2), true);
  assert.equal(JSON.parse(values.get("kingdom-wars-progress")).version, 3);
});

test("seeded difficulty study shows increasing challenge across the active tiers", () => {
  const samplesPerPuzzle = 50;
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
        const solved = solverFor[spec.algorithmKey](puzzle, DEFAULT_CONFIG);
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

  assert.deepEqual(levels.map((entry) => entry.samples), [150, 150]);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(
      levels[index].avgHumanDecisions > levels[index - 1].avgHumanDecisions,
      `${levels[index].tier} should require more policy decisions than ${levels[index - 1].tier}`,
    );
  }
  console.log("Seeded difficulty study:", JSON.stringify(levels));
});
