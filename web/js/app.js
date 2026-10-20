import { comparisonPuzzles, LEVEL_SPECS, PUZZLES, puzzleFor, specFor } from "./puzzles.js";
import { GameRound, MAX_MISTAKES, ProgressStore } from "./race.js";
import { DEFAULT_CONFIG } from "./solvers.js";
import { cellKey } from "./rules.js";

const appElement = document.getElementById("app");
const CLICK_DELAY_MS = 300;

const INSTRUCTIONS = [
  ["Puzzle rules", "Place exactly N queens on an N×N board so that every row, every column, and every colored kingdom contains one queen. No two queens may share a diagonal. All of these rules must hold at the same time. A board that breaks any one rule is invalid."],
  ["Kingdoms", "The board is partitioned into N connected regions. Connectivity is 4-directional (up, down, left, right). The stored reference solution is never shown during a race and is never used to fake the AI's performance."],
  ["Race rules", "You and the AI receive the same immutable puzzle and independent boards. A valid submission locks your board. Invalid submissions do not count. The race continues until both sides have solved or the time limit expires (default 120 seconds). If both succeed, timestamps are compared. If they fall within 0.05 seconds, the result is a draw. Elapsed time uses a monotonic clock, not the wall clock."],
  ["Hidden AI", "During the live round the interface only says that the AI is competing. Queen positions, search progress, scores, and metrics appear only on the results screen."],
  ["Basic Backtracking", "Queens are placed one row at a time. Each legal column is tried. If a partial placement cannot be completed, the algorithm undoes it and tries the next option. This is the reliable baseline solver."],
  ["MRV + Forward Checking", "Minimum Remaining Values selects the unfilled row with the fewest legal cells, not simply the next row. After a placement, Forward Checking removes conflicting candidates from other rows and fails early when a domain becomes empty."],
  ["A* Search", "Each node is an immutable partial placement. g(n) is the number of queens placed. h(n) = N − q(n) estimates remaining placements. f(n) = g(n) + h(n) orders the priority queue. Because every complete solution has path cost N, this heuristic is admissible but weak: f(n) is N for every node, so A* is not claimed to be faster than backtracking. Duplicate states are skipped. Expansion, time, and cancellation limits apply. A* can use substantial memory because it stores a frontier of partial states."],
  ["Hill Climbing", "A candidate is a permutation of columns, so rows and columns are already unique. The objective is diagonal_pairs + kingdom_pairs. The search moves to a better neighbor, allows limited sideways moves on plateaus, and uses bounded random restarts. A zero score still has to pass the shared validator. Local search can get stuck and may fail honestly within its budget."],
];

const ABOUT = [
  ["Kingdom Wars: The AI Queen Race", "A strategy game combining constraint satisfaction with a hidden human-versus-AI race. Four real search algorithms solve the same family of colored-kingdom N-Queens puzzles, with shared validation and honest solver metrics."],
  ["Technology", "This browser edition is native HTML, CSS, and vanilla JavaScript. The solvers run in a browser Web Worker; progression is saved in local storage. No Python, Pygame, WebAssembly, server, database, or cloud API is required to play."],
];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatTime(value, digits = 3) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(digits)}s`;
}

function availableStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function boardCellSize(n, maxCell, width, height) {
  return Math.max(36, Math.min(maxCell, Math.floor(width / n), Math.floor(height / n)));
}

function renderBoard(puzzle, queens, invalidCells, xMarks, options = {}) {
  const n = puzzle.n;
  const { cellSize = 64, disabled = true, label = "Puzzle board" } = options;
  const queenSet = queens instanceof Set ? queens : new Set(queens || []);
  const invalidSet = invalidCells instanceof Set ? invalidCells : new Set(invalidCells || []);
  const xSet = xMarks instanceof Set ? xMarks : new Set(xMarks || []);
  let cells = "";
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const key = cellKey(row, col);
      const isQueen = queenSet.has(key);
      const isInvalid = invalidSet.has(key);
      const kingdom = puzzle.kingdoms[row][col];
      const color = `rgb(${puzzle.colors[kingdom].join(",")})`;
      const aria = `Row ${row + 1}, column ${col + 1}, kingdom ${kingdom + 1}${isQueen ? ", queen" : ""}${xSet.has(key) ? ", X mark" : ""}`;
      cells += `<button type="button" class="board-cell${isInvalid ? " invalid" : ""} tone-${(row + col) % 2}" data-cell="${row},${col}" style="--kingdom-color:${color}" aria-label="${aria}" aria-pressed="${isQueen}"${disabled ? " disabled" : ""}>${xSet.has(key) ? '<span class="x-mark" aria-hidden="true">×</span>' : ""}${isQueen ? '<span class="queen" aria-hidden="true">♛</span>' : ""}</button>`;
    }
  }
  return `<div class="board-shell" aria-label="${escapeHTML(label)}"><div class="board" style="--board-n:${n};--cell-size:${cellSize}px">${cells}</div></div>`;
}

function renderTextSections(sections) {
  return sections.map(([heading, text]) =>
    `<section class="content-section"><h2>${escapeHTML(heading)}</h2><p>${escapeHTML(text)}</p></section>`,
  ).join("");
}

class KingdomWarsBrowserApp {
  constructor(root) {
    this.root = root;
    this.progress = new ProgressStore(availableStorage());
    this.currentScreen = "menu";
    this.round = null;
    this.lastRound = null;
    this.lastResult = null;
    this.worker = null;
    this.comparisonWorker = null;
    this.comparisonPuzzleId = comparisonPuzzles()[0].id;
    this.comparisonRows = null;
    this.comparisonRunning = false;
    this.comparisonRepeats = 1;
    this.pendingX = null;
    this.notice = "";
    this.interval = window.setInterval(() => this.tick(), 100);

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("contextmenu", (event) => this.handleContextMenu(event));
    this.render();
  }

  render() {
    const views = {
      menu: () => this.renderMenu(),
      levels: () => this.renderLevels(),
      puzzle: () => this.renderPuzzle(),
      results: () => this.renderResults(),
      compare: () => this.renderComparison(),
      instructions: () => this.renderTextScreen("Instructions", INSTRUCTIONS),
      about: () => this.renderTextScreen("About", ABOUT),
      exit: () => this.renderExit(),
    };
    this.root.innerHTML = `${this.notice ? `<p class="error-banner" role="alert">${escapeHTML(this.notice)}</p>` : ""}${views[this.currentScreen]()}`;
  }

  renderMenu() {
    return `<section class="screen main-menu">
      <h1 class="brand-title">KINGDOM WARS</h1>
      <h2 class="brand-subtitle">The AI Queen Race</h2>
      <p class="brand-tagline">N-Queens&nbsp; · &nbsp;Colored Kingdoms&nbsp; · &nbsp;Human vs Algorithm</p>
      <nav class="menu-panel" aria-label="Main menu">
        <button class="button button-primary menu-button" data-action="start">Start Game</button>
        <button class="button menu-button" data-action="compare">Algorithm Comparison</button>
        <button class="button menu-button" data-action="instructions">Instructions</button>
        <button class="button menu-button" data-action="about">About</button>
        <button class="button menu-button" data-action="exit">Exit</button>
      </nav>
    </section>`;
  }

  renderLevels() {
    const cards = [1, 2, 3, 4].map((level) => {
      const unlocked = this.progress.isLevelUnlocked(level);
      const completed = this.progress.completedCount(level);
      const spec = specFor(level, 1);
      const games = unlocked
        ? `<div class="game-list">${[1, 2, 3].map((game) => {
          const item = specFor(level, game);
          const done = this.progress.isCompleted(level, game);
          return `<button class="button game-card${done ? " completed" : ""}" data-action="start-game" data-level="${level}" data-game="${game}">Game ${game}&nbsp;&nbsp; ${item.n}×${item.n}${done ? "　✓" : ""}</button>`;
        }).join("")}</div>`
        : '<div class="locked-label">Locked</div>';
      return `<article class="level-card ${unlocked ? "unlocked" : "locked"}">
        <h2>Level ${level}&nbsp; ${escapeHTML(spec.name)}</h2>
        <p class="level-algorithm">${escapeHTML(spec.algorithm)}</p>
        <p class="level-progress">${completed}/3 games completed</p>
        ${games}
      </article>`;
    }).join("");
    return `<section class="screen">
      <header class="screen-header">
        <button class="button" data-action="menu">Main Menu</button>
        <div class="screen-heading"><h1>Select a Level</h1><p>Finish all three games in a level to unlock the next algorithm.</p></div>
      </header>
      <div class="level-grid">${cards}</div>
    </section>`;
  }

  renderPuzzle() {
    const round = this.round;
    if (!round) return this.renderLevels();
    const puzzle = round.puzzle;
    const spec = specFor(puzzle.level, puzzle.game);
    const width = Math.min(window.innerWidth, 1100) - 420;
    const height = Math.min(window.innerHeight, 720) - 150;
    const cellSize = boardCellSize(puzzle.n, 88, width, height);
    const locked = !round.canEdit();
    return `<section class="screen">
      <header class="game-topbar">
        <button class="button menu-return" data-action="leave-round">Return to Menu</button>
        <div class="game-title"><h1>Level ${puzzle.level}&nbsp; Game ${puzzle.game}&nbsp; · &nbsp;${puzzle.n}×${puzzle.n}</h1><p>AI algorithm (hidden during the race): ${escapeHTML(spec.algorithm)}</p></div>
        <button class="button" data-action="restart">Restart</button>
        <button class="button button-primary" data-action="submit">Submit Solution</button>
      </header>
      <div class="game-layout">
        <div class="board-stage">${renderBoard(puzzle, round.humanQueens, round.invalidCells, round.xMarks, { cellSize, disabled: locked, label: "Your board" })}</div>
        <aside class="panel race-panel">
          <p class="timer" id="round-timer">${round.remainingTime().toFixed(1).padStart(5, "0")}s</p>
          <p class="panel-label">Time remaining</p>
          <p class="mistake-counter${round.mistakes ? " has-mistakes" : ""}" id="mistake-counter">Mistakes: ${round.mistakes}/${MAX_MISTAKES}</p>
          <p class="ai-status" id="ai-status">${round.phase === "COMPETITOR_FINISHED" && round.humanValid ? "Your solution is locked. Waiting for the round clock." : "AI is competing"}</p>
          <p class="ai-hidden">AI progress is hidden until results.</p>
          <h2 class="feedback-heading">Your feedback</h2>
          <p class="feedback" id="human-feedback">${escapeHTML(round.humanFeedback)}</p>
          <p class="queen-count">Queens placed: ${round.humanQueens.size} / ${puzzle.n}</p>
          <p class="play-hint">Single-click to mark X; double-click a queen. Right-click also toggles an X mark. Submit only when every constraint holds.</p>
        </aside>
      </div>
    </section>`;
  }

  renderResults() {
    const round = this.lastRound;
    const result = this.lastResult;
    if (!round || !result) return this.renderLevels();
    const puzzle = round.puzzle;
    const headline = {
      human_win: "You won the race",
      ai_win: "The AI won the race",
      draw: "Draw",
      abandoned: "Round abandoned",
      human_failed: `Game over: ${MAX_MISTAKES} mistakes`,
    }[result.outcome];
    const humanWidth = Math.min(64, Math.floor((Math.min(window.innerWidth, 1100) / 2 - 70) / puzzle.n));
    const aiWidth = humanWidth;
    const solver = result.solverResult;
    const metricText = solver
      ? Object.entries(solver.metrics || {}).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join("　·　")
      : "";
    const solverDetails = solver ? `<p>Algorithm: ${escapeHTML(solver.algorithmName)}　success: ${solver.success}　elapsed: ${formatTime(solver.elapsedSeconds, 4)}　reason: ${escapeHTML(solver.terminationReason)}</p>${solver.randomSeed !== null ? `<p>Random seed: ${solver.randomSeed}</p>` : ""}<p>Metrics: ${escapeHTML(metricText)}</p>` : "";
    const notes = result.notes.map((note) => `<p>${escapeHTML(note)}</p>`).join("");
    const next = specFor(puzzle.level, puzzle.game).game < 3 || puzzle.level < 4;
    return `<section class="screen">
      <header class="screen-header">
        <button class="button" data-action="menu">Main Menu</button>
        <h1 class="result-headline ${result.outcome}">${escapeHTML(headline)}</h1>
        <div class="header-actions">
          <button class="button" data-action="levels">Return to Levels</button>
          <button class="button button-primary" data-action="next-game">${next ? "Next Game" : "All Levels Complete"}</button>
        </div>
      </header>
      <div class="result-boards">
        <section class="panel result-board-card"><h2>Human board</h2>${renderBoard(puzzle, round.humanQueens, round.invalidCells, round.xMarks, { cellSize: humanWidth, disabled: true, label: "Final human board" })}</section>
        <section class="panel result-board-card"><h2>AI board (revealed)</h2>${result.aiValid ? renderBoard(puzzle, round.aiQueens, new Set(), new Set(), { cellSize: aiWidth, disabled: true, label: "AI solution" }) : '<div class="no-ai-solution">No validated AI solution</div>'}</section>
      </div>
      <section class="panel result-details">
        <p>Human valid: ${result.humanValid}　time: ${formatTime(result.humanTime)}</p>
        <p>AI valid: ${result.aiValid}　time: ${formatTime(result.aiTime)}</p>
        <p>Mistakes: ${result.mistakes}/${MAX_MISTAKES}</p>
        ${solverDetails}
        ${notes}
        <p class="muted">Algorithm-specific metrics are not directly comparable across solvers.</p>
      </section>
    </section>`;
  }

  renderTextScreen(title, sections) {
    return `<section class="screen">
      <header class="screen-header"><button class="button" data-action="menu">Back</button><h1>${escapeHTML(title)}</h1></header>
      <article class="panel content-panel">${renderTextSections(sections)}<p class="content-hint">Scroll to read all sections.</p></article>
    </section>`;
  }

  renderComparison() {
    const options = comparisonPuzzles().map((puzzle) => {
      const selected = this.comparisonPuzzleId === puzzle.id;
      return `<button class="button${selected ? " selected" : ""}" data-action="select-puzzle" data-puzzle="${puzzle.id}" aria-pressed="${selected}">${puzzle.id}&nbsp; ${puzzle.n}×${puzzle.n}</button>`;
    }).join("");
    const rows = this.comparisonRows
      ? this.comparisonRows.map((row) => {
        const solver = row.result;
        const metrics = Object.entries(solver.metrics || {}).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join("　·　");
        return `<article class="comparison-row"><h2>${escapeHTML(row.algorithm)}</h2><p>success=${solver.success}　time=${formatTime(solver.elapsedSeconds, 4)}　reason=${escapeHTML(solver.terminationReason)}　successes=${row.successes}/${row.repeats}${solver.randomSeed !== null ? `　seed=${solver.randomSeed}` : ""}</p><p>${escapeHTML(metrics || "No extra metrics.")}</p></article>`;
      }).join("")
      : `<p class="comparison-empty">${this.comparisonRunning ? "Running all four solvers on the selected verified puzzle…" : "Choose a puzzle, then run the comparison."}</p>`;
    return `<section class="screen">
      <header class="screen-header">
        <button class="button" data-action="menu">Main Menu</button>
        <h1>Algorithm Comparison</h1>
        <div class="header-actions">
          <button class="button" data-action="toggle-repeats">Repeats: ${this.comparisonRepeats}</button>
          <button class="button button-primary" data-action="run-comparison"${this.comparisonRunning ? " disabled" : ""}>${this.comparisonRunning ? "Running…" : "Run comparison"}</button>
        </div>
      </header>
      <div class="compare-puzzles">${options}</div>
      <p class="comparison-note">The same verified puzzle is given to every solver. Metrics are algorithm-specific and not equivalent. These are real runs, not fabricated benchmarks. A single run does not prove that one algorithm is always fastest.</p>
      <section class="panel comparison-results">${rows}</section>
    </section>`;
  }

  renderExit() {
    return `<section class="screen main-menu">
      <h1 class="brand-title">KINGDOM WARS</h1>
      <h2 class="brand-subtitle">Thanks for playing</h2>
      <p class="brand-tagline">You can close this browser tab to exit the game.</p>
      <button class="button button-primary menu-button" data-action="menu">Return to Main Menu</button>
    </section>`;
  }

  handleClick(event) {
    const cellButton = event.target.closest("[data-cell]");
    if (cellButton && this.currentScreen === "puzzle") {
      this.handleBoardClick(cellButton, event);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    if (this.pendingX) this.flushPendingX();
    const action = button.dataset.action;
    if (action === "start") this.currentScreen = "levels";
    else if (action === "menu") this.currentScreen = "menu";
    else if (action === "levels") this.currentScreen = "levels";
    else if (action === "compare") this.currentScreen = "compare";
    else if (action === "instructions") this.currentScreen = "instructions";
    else if (action === "about") this.currentScreen = "about";
    else if (action === "exit") this.currentScreen = "exit";
    else if (action === "start-game") this.startGame(Number(button.dataset.level), Number(button.dataset.game));
    else if (action === "leave-round") this.leaveRound();
    else if (action === "restart") {
      const { level, game } = this.round.puzzle;
      this.startGame(level, game);
    } else if (action === "submit") this.submitRound();
    else if (action === "next-game") this.nextGame();
    else if (action === "toggle-repeats") {
      this.comparisonRepeats = this.comparisonRepeats === 1 ? 3 : 1;
    } else if (action === "select-puzzle") {
      this.comparisonPuzzleId = button.dataset.puzzle;
      this.comparisonRows = null;
    } else if (action === "run-comparison") this.runComparison();
    this.render();
  }

  handleBoardClick(button, event) {
    if (!this.round?.canEdit()) return;
    const [row, col] = button.dataset.cell.split(",").map(Number);
    const key = cellKey(row, col);
    const now = performance.now();
    if (this.pendingX && this.pendingX.key === key && now - this.pendingX.startedAt <= CLICK_DELAY_MS) {
      window.clearTimeout(this.pendingX.timer);
      this.pendingX = null;
      this.round.toggleHuman(row, col, now);
      this.handleRoundChange();
      return;
    }
    if (this.pendingX) this.flushPendingX();
    this.pendingX = {
      key,
      row,
      col,
      startedAt: now,
      timer: window.setTimeout(() => {
        if (this.pendingX?.key === key) {
          this.flushPendingX();
          this.handleRoundChange();
        }
      }, CLICK_DELAY_MS),
    };
  }

  handleContextMenu(event) {
    const cellButton = event.target.closest("[data-cell]");
    if (!cellButton || this.currentScreen !== "puzzle" || !this.round?.canEdit()) return;
    event.preventDefault();
    if (this.pendingX) this.flushPendingX();
    const [row, col] = cellButton.dataset.cell.split(",").map(Number);
    this.round.toggleXMark(row, col);
    this.render();
  }

  flushPendingX() {
    if (!this.pendingX) return;
    const pending = this.pendingX;
    window.clearTimeout(pending.timer);
    this.pendingX = null;
    this.round?.toggleXMark(pending.row, pending.col);
  }

  startGame(level, game) {
    if (!this.progress.isGameUnlocked(level, game)) {
      this.notice = "That game is locked. Complete the previous level to unlock it.";
      this.currentScreen = "levels";
      return;
    }
    this.stopRoundWorker();
    this.pendingX = null;
    this.notice = "";
    const puzzle = puzzleFor(level, game);
    this.round = new GameRound(puzzle, performance.now(), DEFAULT_CONFIG);
    this.currentScreen = "puzzle";
    const round = this.round;
    const worker = new Worker(new URL("./solver-worker.js", import.meta.url), { type: "module" });
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      if (round !== this.round) return;
      if (event.data.type === "result") {
        round.applyAIResult(event.data.result, performance.now());
        this.stopRoundWorker();
        this.handleRoundChange();
      } else if (event.data.type === "error") {
        this.handleWorkerError(event.data.message, round);
      }
    });
    worker.addEventListener("error", (event) => {
      this.handleWorkerError(event.message || "The AI solver worker stopped unexpectedly.", round);
    });
    worker.postMessage({
      type: "solve",
      puzzle,
      solverKey: specFor(level, game).algorithmKey,
      config: DEFAULT_CONFIG,
      startedAtEpoch: performance.timeOrigin + round.startedAt,
    });
  }

  stopRoundWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  handleWorkerError(message, round) {
    console.error("Kingdom Wars solver worker failed:", message);
    this.stopRoundWorker();
    if (round !== this.round || round.result) return;
    round.applyAIResult({
      algorithmName: "unknown",
      success: false,
      solution: null,
      elapsedSeconds: round.elapsed(),
      metrics: { error: message },
      terminationReason: "error",
      randomSeed: null,
      foundAtMonotonic: null,
      raceElapsedSeconds: null,
    });
    this.handleRoundChange();
  }

  submitRound() {
    if (this.pendingX) this.flushPendingX();
    this.round?.submit(performance.now());
    this.handleRoundChange();
  }

  leaveRound() {
    if (this.pendingX) this.flushPendingX();
    this.round?.abandon();
    this.stopRoundWorker();
    this.currentScreen = "levels";
  }

  nextGame() {
    if (!this.lastRound) {
      this.currentScreen = "levels";
      return;
    }
    const { level, game } = this.lastRound.puzzle;
    const next = game < 3 ? [level, game + 1] : level < 4 ? [level + 1, 1] : null;
    if (!next || !this.progress.isGameUnlocked(...next)) {
      this.currentScreen = "levels";
      return;
    }
    this.startGame(...next);
  }

  runComparison() {
    if (this.comparisonRunning) return;
    if (this.comparisonWorker) this.comparisonWorker.terminate();
    const puzzle = comparisonPuzzles().find((item) => item.id === this.comparisonPuzzleId);
    const worker = new Worker(new URL("./solver-worker.js", import.meta.url), { type: "module" });
    this.comparisonWorker = worker;
    this.comparisonRunning = true;
    this.comparisonRows = null;
    worker.addEventListener("message", (event) => {
      if (worker !== this.comparisonWorker) return;
      this.comparisonWorker = null;
      worker.terminate();
      this.comparisonRunning = false;
      if (event.data.type === "comparison") this.comparisonRows = event.data.rows;
      else this.notice = `Algorithm comparison failed: ${event.data.message}`;
      if (this.currentScreen === "compare") this.render();
    });
    worker.addEventListener("error", (event) => {
      if (worker !== this.comparisonWorker) return;
      this.comparisonWorker = null;
      worker.terminate();
      this.comparisonRunning = false;
      this.notice = `Algorithm comparison failed: ${event.message || "worker error"}`;
      if (this.currentScreen === "compare") this.render();
    });
    worker.postMessage({
      type: "compare",
      puzzle,
      repeats: this.comparisonRepeats,
      config: DEFAULT_CONFIG,
    });
  }

  tick() {
    if (this.currentScreen !== "puzzle" || !this.round) return;
    this.round.tick(performance.now());
    if (this.round.result) {
      this.handleRoundChange();
      return;
    }
    const timer = document.getElementById("round-timer");
    if (timer) {
      const remaining = this.round.remainingTime();
      timer.textContent = `${remaining.toFixed(1).padStart(5, "0")}s`;
      timer.classList.toggle("urgent", remaining < 15);
    }
  }

  handleRoundChange() {
    if (!this.round) return;
    if (this.round.result) {
      this.stopRoundWorker();
      this.pendingX = null;
      this.lastRound = this.round;
      this.lastResult = this.round.result;
      if (!["abandoned", "human_failed"].includes(this.lastResult.outcome)) {
        try {
          this.progress.markCompleted(this.round.puzzle.level, this.round.puzzle.game);
        } catch (error) {
          this.notice = `Round completed, but progress could not be saved: ${error.message}`;
        }
      }
      this.currentScreen = "results";
      this.render();
      return;
    }
    const feedback = document.getElementById("human-feedback");
    const count = document.getElementById("mistake-counter");
    const aiStatus = document.getElementById("ai-status");
    const queenCount = document.querySelector(".queen-count");
    if (feedback) feedback.textContent = this.round.humanFeedback;
    if (count) {
      count.textContent = `Mistakes: ${this.round.mistakes}/${MAX_MISTAKES}`;
      count.classList.toggle("has-mistakes", this.round.mistakes > 0);
    }
    if (aiStatus) {
      aiStatus.textContent = this.round.phase === "COMPETITOR_FINISHED" && this.round.humanValid
        ? "Your solution is locked. Waiting for the round clock."
        : "AI is competing";
    }
    if (queenCount) queenCount.textContent = `Queens placed: ${this.round.humanQueens.size} / ${this.round.puzzle.n}`;
    this.renderBoardForRound();
  }

  renderBoardForRound() {
    const stage = document.querySelector(".board-stage");
    if (!stage || !this.round) return;
    const puzzle = this.round.puzzle;
    const width = Math.min(window.innerWidth, 1100) - 420;
    const height = Math.min(window.innerHeight, 720) - 150;
    const cellSize = boardCellSize(puzzle.n, 88, width, height);
    stage.innerHTML = renderBoard(
      puzzle,
      this.round.humanQueens,
      this.round.invalidCells,
      this.round.xMarks,
      { cellSize, disabled: !this.round.canEdit(), label: "Your board" },
    );
  }
}

new KingdomWarsBrowserApp(appElement);
