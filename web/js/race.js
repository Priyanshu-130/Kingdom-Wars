import {
  cellKey,
  humanFeedback,
  placementConflicts,
  validateComplete,
  validateRowColumns,
} from "./rules.js";
import { AI_MOVE_DELAY_MS } from "./config.js";
import { GAMES_PER_LEVEL, LEVEL_COUNT } from "./puzzles.js?three-tiers-v2";

export const MAX_MISTAKES = 3;
export const ROUND_TIME_LIMIT_SECONDS = 120;
export const NEAR_SIMULTANEOUS_TOLERANCE = 0.05;
const PROGRESS_VERSION = 2;
const PROGRESS_STORAGE_KEY = "kingdom-wars-progress";

export class GameRound {
  constructor(puzzle, startedAt = performance.now(), config = {}) {
    this.puzzle = puzzle;
    this.startedAt = startedAt;
    this.timeLimit = config.round_time_limit_seconds ?? ROUND_TIME_LIMIT_SECONDS;
    this.tolerance = config.near_simultaneous_tolerance ?? NEAR_SIMULTANEOUS_TOLERANCE;
    this.aiMoveDelayMs = config.ai_move_delay_ms ?? AI_MOVE_DELAY_MS;
    this.deadline = startedAt + this.timeLimit * 1000;
    this.phase = "HUMAN_TURN";
    this.currentTurn = "human";
    this.humanQueens = new Set();
    this.aiQueens = new Set();
    this.xMarks = new Set();
    this.aiXMarks = new Set();
    this.invalidCells = new Set();
    this.countedMistakeCells = new Set();
    this.mistakes = 0;
    this.humanFeedback = humanFeedback(puzzle, []);
    this.humanValid = false;
    this.aiValid = false;
    this.humanTime = null;
    this.aiTime = null;
    this.solverResult = null;
    this.aiPlan = null;
    this.aiPlanReady = false;
    this.aiPlanReadyAt = null;
    this.aiTurnStartedAt = null;
    this.aiRevealAt = null;
    this.aiLastAction = null;
    this.aiNeedsReplan = false;
    this.aiActions = 0;
    this.lastAIMove = null;
    this.result = null;
  }

  remainingTime(now = performance.now()) {
    return Math.max(0, (this.deadline - now) / 1000);
  }

  elapsed(now = performance.now()) {
    return Math.max(0, (now - this.startedAt) / 1000);
  }

  canEdit() {
    return !this.result && this.currentTurn === "human";
  }

  toggleHuman(row, col, now = performance.now()) {
    if (!this.canEdit() || !this.inBounds(row, col)) return;
    const key = cellKey(row, col);
    if (this.humanQueens.has(key)) {
      this.humanQueens.delete(key);
      this.humanFeedback = humanFeedback(this.puzzle, this.humanPlacements());
      this.finishHumanTurn(now);
      return true;
    }
    const errors = placementConflicts(this.puzzle, this.humanPlacements(), [row, col]);
    if (errors.length > 0) {
      this.invalidCells.add(key);
      if (!this.countedMistakeCells.has(key)) {
        this.countedMistakeCells.add(key);
        this.mistakes += 1;
      }
      this.humanFeedback =
        `Invalid queen placement: ${errors.slice(0, 3).join(" ")} `
        + `Mistakes: ${this.mistakes}/${MAX_MISTAKES}.`;
      if (this.mistakes >= MAX_MISTAKES) this.finalizeFailure();
      return false;
    }
    this.invalidCells.delete(key);
    this.humanQueens.add(key);
    this.humanFeedback = humanFeedback(this.puzzle, this.humanPlacements());
    if (validateComplete(this.puzzle, this.humanPlacements()).valid) {
      this.humanValid = true;
      this.humanTime = this.elapsed(now);
      this.finalize("human_win", now, ["You completed a valid solution."]);
      return true;
    }
    this.finishHumanTurn(now);
    return true;
  }

  toggleXMark(row, col, now = performance.now()) {
    if (!this.canEdit() || !this.inBounds(row, col)) return false;
    const key = cellKey(row, col);
    if (this.xMarks.has(key)) this.xMarks.delete(key);
    else this.xMarks.add(key);
    this.finishHumanTurn(now);
    return true;
  }

  finishHumanTurn(now) {
    if (this.result) return;
    this.currentTurn = "ai";
    this.phase = "AI_THINKING";
    this.aiTurnStartedAt = now;
    this.aiRevealAt = now + this.aiMoveDelayMs;
  }

  setAIPlan(solverResult, now = performance.now()) {
    if (this.result) return false;
    this.solverResult = solverResult;
    this.aiPlanReadyAt = now;
    const report = solverResult.success && solverResult.solution !== null
      ? validateRowColumns(this.puzzle, solverResult.solution)
      : { valid: false };
    const extendsCurrentBoard = report.valid && this.aiPlacements().every(([row, col]) =>
      solverResult.solution[row] === col,
    );
    if (!extendsCurrentBoard) {
      this.aiPlan = null;
      this.aiPlanReady = false;
      this.finalize(
        "human_win",
        now,
        [`AI could not find a legal continuation (${solverResult.terminationReason}).`],
      );
      return false;
    }
    this.aiPlan = [...solverResult.solution];
    this.aiPlanReady = true;
    this.aiNeedsReplan = false;
    return true;
  }

  tick(now = performance.now()) {
    if (this.result) return this.result;
    if (now >= this.deadline) {
      this.finalize("draw", now, ["The round time limit expired before either player solved the puzzle."]);
      return this.result;
    }
    if (
      this.currentTurn === "ai"
      && this.aiPlanReady
      && this.aiRevealAt !== null
      && now >= this.aiRevealAt
      && now >= this.aiPlanReadyAt
    ) {
      this.revealAIMove(now);
    }
    return this.result;
  }

  revealAIMove(now) {
    if (this.result || this.currentTurn !== "ai" || !this.aiPlanReady) return false;

    let action = null;
    if (this.aiLastAction === "queen" && this.aiQueens.size < this.puzzle.n - 1) {
      const cell = this.nextAIElimination();
      if (cell) {
        const key = cellKey(...cell);
        this.aiXMarks.add(key);
        this.aiLastAction = "x";
        action = { type: "x", row: cell[0], col: cell[1] };
      }
    }
    if (!action) {
      const nextQueen = this.nextAIQueen();
      if (!nextQueen) {
        this.aiNeedsReplan = true;
        this.aiPlanReady = false;
        return false;
      }
      const key = cellKey(...nextQueen);
      this.aiQueens.add(key);
      this.aiLastAction = "queen";
      action = { type: "queen", row: nextQueen[0], col: nextQueen[1] };
      if (validateComplete(this.puzzle, this.aiPlacements()).valid) {
        this.aiValid = true;
        this.aiTime = this.elapsed(now);
        this.lastAIMove = action;
        this.aiActions += 1;
        this.finalize("ai_win", now, ["The AI completed a valid solution."]);
        return true;
      }
    }

    this.lastAIMove = action;
    this.aiActions += 1;
    this.currentTurn = "human";
    this.phase = "HUMAN_TURN";
    this.aiTurnStartedAt = null;
    this.aiRevealAt = null;
    return true;
  }

  nextAIQueen() {
    if (!this.aiPlan) return null;
    const placements = this.aiPlacements();
    for (let row = 0; row < this.aiPlan.length; row += 1) {
      const col = this.aiPlan[row];
      if (this.aiQueens.has(cellKey(row, col))) continue;
      if (placementConflicts(this.puzzle, placements, [row, col]).length === 0) {
        return [row, col];
      }
    }
    return null;
  }

  nextAIElimination() {
    const placements = this.aiPlacements();
    for (let row = 0; row < this.puzzle.n; row += 1) {
      for (let col = 0; col < this.puzzle.n; col += 1) {
        const key = cellKey(row, col);
        if (this.aiQueens.has(key) || this.aiXMarks.has(key)) continue;
        if (placementConflicts(this.puzzle, placements, [row, col]).length > 0) {
          return [row, col];
        }
      }
    }
    return null;
  }

  abandon() {
    if (this.result) return this.result;
    this.finalize("abandoned", performance.now(), ["Round abandoned; progression is not awarded."]);
    return this.result;
  }

  humanPlacements() {
    return [...this.humanQueens].map((key) => key.split(",").map(Number));
  }

  aiPlacements() {
    return [...this.aiQueens].map((key) => key.split(",").map(Number));
  }

  inBounds(row, col) {
    return row >= 0 && row < this.puzzle.n && col >= 0 && col < this.puzzle.n;
  }

  finalizeFailure() {
    if (this.result) return;
    const feedback = `Game over: ${MAX_MISTAKES} invalid queen placements. Restart to try this game again.`;
    this.humanFeedback = feedback;
    this.finalize("human_failed", performance.now(), [feedback]);
  }

  finalize(outcome, now, notes = []) {
    if (this.result) return;
    this.phase = "ROUND_FINALIZED";
    this.currentTurn = null;
    this.result = {
      outcome,
      humanValid: this.humanValid,
      aiValid: this.aiValid,
      humanTime: this.humanTime,
      aiTime: this.aiTime,
      solverResult: this.solverResult,
      notes,
      mistakes: this.mistakes,
      finalizedAt: now,
    };
  }
}

export class ProgressStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.completed = new Set();
    try {
      const saved = this.storage?.getItem("kingdom-wars-progress");
      if (saved) {
        const payload = JSON.parse(saved);
        if (Array.isArray(payload.completed)) {
          const previousVersion = Number(payload.version) || 1;
          for (const item of payload.completed) {
            if (Array.isArray(item) && item.length === 2 && Number.isInteger(item[0]) && Number.isInteger(item[1])) {
              const [oldLevel, game] = item;
              const level = previousVersion < PROGRESS_VERSION
                ? ({ 1: 1, 3: 2, 4: 3 })[oldLevel]
                : oldLevel;
              if (
                Number.isInteger(level)
                && level >= 1 && level <= LEVEL_COUNT
                && game >= 1 && game <= GAMES_PER_LEVEL
              ) this.completed.add(`${level},${game}`);
            }
          }
          if (previousVersion < PROGRESS_VERSION) {
            const completed = [...this.completed].map((entry) => entry.split(",").map(Number));
            this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: PROGRESS_VERSION, completed }));
          }
        }
      }
    } catch {
      this.completed.clear();
    }
  }

  isCompleted(level, game) {
    return this.completed.has(`${level},${game}`);
  }

  completedCount(level) {
    return Array.from({ length: GAMES_PER_LEVEL }, (_, index) => index + 1)
      .filter((game) => this.isCompleted(level, game)).length;
  }

  levelCompleted(level) {
    return this.completedCount(level) === GAMES_PER_LEVEL;
  }

  isLevelUnlocked(level) {
    if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) return false;
    return level === 1 || this.levelCompleted(level - 1);
  }

  isGameUnlocked(level, game) {
    return Number.isInteger(game)
      && game >= 1
      && game <= GAMES_PER_LEVEL
      && this.isLevelUnlocked(level);
  }

  markCompleted(level, game) {
    const key = `${level},${game}`;
    if (this.completed.has(key)) return false;
    this.completed.add(key);
    const completed = [...this.completed]
      .map((entry) => entry.split(",").map(Number))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: PROGRESS_VERSION, completed }));
    return true;
  }

  reset() {
    this.completed.clear();
    this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: PROGRESS_VERSION, completed: [] }));
  }
}
