import {
  cellKey,
  humanFeedback,
  placementConflicts,
  validateComplete,
  validateRowColumns,
} from "./rules.js";

export const MAX_MISTAKES = 3;
export const ROUND_TIME_LIMIT_SECONDS = 120;
export const NEAR_SIMULTANEOUS_TOLERANCE = 0.05;

export class GameRound {
  constructor(puzzle, startedAt = performance.now(), config = {}) {
    this.puzzle = puzzle;
    this.startedAt = startedAt;
    this.timeLimit = config.round_time_limit_seconds ?? ROUND_TIME_LIMIT_SECONDS;
    this.tolerance = config.near_simultaneous_tolerance ?? NEAR_SIMULTANEOUS_TOLERANCE;
    this.deadline = startedAt + this.timeLimit * 1000;
    this.phase = "RUNNING";
    this.humanQueens = new Set();
    this.aiQueens = new Set();
    this.xMarks = new Set();
    this.invalidCells = new Set();
    this.countedMistakeCells = new Set();
    this.mistakes = 0;
    this.humanFeedback = humanFeedback(puzzle, []);
    this.humanValid = false;
    this.aiValid = false;
    this.humanTime = null;
    this.aiTime = null;
    this.solverResult = null;
    this.result = null;
  }

  remainingTime(now = performance.now()) {
    return Math.max(0, (this.deadline - now) / 1000);
  }

  elapsed(now = performance.now()) {
    return Math.max(0, (now - this.startedAt) / 1000);
  }

  canEdit() {
    return !this.result && ["RUNNING", "COMPETITOR_FINISHED"].includes(this.phase)
      && !this.humanValid;
  }

  toggleHuman(row, col, now = performance.now()) {
    if (!this.canEdit() || !this.inBounds(row, col)) return;
    const key = cellKey(row, col);
    if (this.humanQueens.has(key)) {
      this.humanQueens.delete(key);
      this.humanFeedback = humanFeedback(this.puzzle, this.humanPlacements());
      return;
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
      return;
    }
    this.invalidCells.delete(key);
    this.humanQueens.add(key);
    this.humanFeedback = humanFeedback(this.puzzle, this.humanPlacements());
  }

  toggleXMark(row, col) {
    if (!this.canEdit() || !this.inBounds(row, col)) return;
    const key = cellKey(row, col);
    if (this.xMarks.has(key)) this.xMarks.delete(key);
    else this.xMarks.add(key);
  }

  submit(now = performance.now()) {
    if (!this.canEdit()) return false;
    const report = validateComplete(this.puzzle, this.humanPlacements());
    if (!report.valid) {
      this.humanFeedback = `Submission rejected. ${report.errors.join(" ") || "Solution is incomplete or invalid."}`;
      return false;
    }
    this.humanValid = true;
    this.humanTime = Math.max(0, (now - this.startedAt) / 1000);
    this.humanFeedback = "Valid solution locked.";
    this.phase = "COMPETITOR_FINISHED";
    this.maybeFinalize(now);
    return true;
  }

  applyAIResult(solverResult, now = performance.now()) {
    if (this.result || this.solverResult !== null) return;
    this.solverResult = solverResult;
    if (solverResult.success && solverResult.solution !== null) {
      const report = validateRowColumns(this.puzzle, solverResult.solution);
      if (report.valid) {
        this.aiValid = true;
        this.aiQueens = new Set(
          solverResult.solution.map((col, row) => cellKey(row, col)),
        );
        this.aiTime = solverResult.raceElapsedSeconds
          ?? (solverResult.foundAtMonotonic !== null
            ? (solverResult.foundAtMonotonic - this.startedAt) / 1000
            : solverResult.elapsedSeconds);
        if (this.phase === "RUNNING") this.phase = "COMPETITOR_FINISHED";
      }
    }
    this.maybeFinalize(now);
  }

  tick(now = performance.now()) {
    if (this.result) return this.result;
    if (now >= this.deadline) this.maybeFinalize(now);
    return this.result;
  }

  abandon() {
    if (this.result) return this.result;
    this.phase = "ROUND_FINALIZED";
    this.result = {
      outcome: "abandoned",
      humanValid: false,
      aiValid: false,
      humanTime: this.humanTime,
      aiTime: null,
      solverResult: null,
      notes: ["Round abandoned; progression is not awarded."],
      mistakes: this.mistakes,
    };
    return this.result;
  }

  humanPlacements() {
    return [...this.humanQueens].map((key) => key.split(",").map(Number));
  }

  inBounds(row, col) {
    return row >= 0 && row < this.puzzle.n && col >= 0 && col < this.puzzle.n;
  }

  maybeFinalize(now) {
    if (this.result) return;
    const timedOut = now >= this.deadline;
    if (timedOut || (this.humanValid && this.aiValid)) this.finalize(now);
  }

  finalizeFailure() {
    if (this.result) return;
    const feedback = `Game over: ${MAX_MISTAKES} invalid queen placements. Restart to try this game again.`;
    this.humanFeedback = feedback;
    this.phase = "ROUND_FINALIZED";
    this.result = {
      outcome: "human_failed",
      humanValid: false,
      aiValid: this.aiValid,
      humanTime: null,
      aiTime: this.aiTime,
      solverResult: this.solverResult,
      notes: [feedback],
      mistakes: this.mistakes,
    };
  }

  finalize(now) {
    if (this.result) return;
    this.phase = "ROUND_FINALIZED";
    const humanTime = this.humanValid ? this.humanTime : null;
    const aiTime = this.aiValid ? this.aiTime : null;
    const outcome = GameRound.determineWinner(humanTime, aiTime, this.tolerance);
    const notes = [];
    if (humanTime !== null && aiTime !== null && Math.abs(humanTime - aiTime) <= this.tolerance) {
      notes.push(`Times were within the ${this.tolerance.toFixed(3)}s draw tolerance.`);
    }
    this.result = {
      outcome,
      humanValid: this.humanValid,
      aiValid: this.aiValid,
      humanTime,
      aiTime,
      solverResult: this.solverResult,
      notes,
      mistakes: this.mistakes,
      finalizedAt: now,
    };
  }

  static determineWinner(humanTime, aiTime, tolerance) {
    if (humanTime === null && aiTime === null) return "draw";
    if (humanTime === null) return "ai_win";
    if (aiTime === null) return "human_win";
    if (Math.abs(humanTime - aiTime) <= tolerance) return "draw";
    return humanTime < aiTime ? "human_win" : "ai_win";
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
          for (const item of payload.completed) {
            if (Array.isArray(item) && item.length === 2 && Number.isInteger(item[0]) && Number.isInteger(item[1])) {
              this.completed.add(`${item[0]},${item[1]}`);
            }
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
    return [1, 2, 3].filter((game) => this.isCompleted(level, game)).length;
  }

  levelCompleted(level) {
    return this.completedCount(level) === 3;
  }

  isLevelUnlocked(level) {
    return level <= 1 || this.levelCompleted(level - 1);
  }

  isGameUnlocked(level, _game) {
    return this.isLevelUnlocked(level);
  }

  markCompleted(level, game) {
    const key = `${level},${game}`;
    if (this.completed.has(key)) return false;
    this.completed.add(key);
    const completed = [...this.completed]
      .map((entry) => entry.split(",").map(Number))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.storage?.setItem("kingdom-wars-progress", JSON.stringify({ completed }));
    return true;
  }

  reset() {
    this.completed.clear();
    this.storage?.setItem("kingdom-wars-progress", JSON.stringify({ completed: [] }));
  }
}
