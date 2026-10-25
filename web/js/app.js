import {
  comparisonPuzzles,
  GAMES_PER_LEVEL,
  LEVEL_COUNT,
  LEVEL_SPECS,
  PUZZLES,
  puzzleFor,
  specFor,
} from "./puzzles.js?three-tiers-v2";
import { GameRound, MAX_MISTAKES, ProgressStore } from "./race.js?three-tiers-v2";
import { DEFAULT_CONFIG } from "./solvers.js?three-tiers-v2";
import { cellKey } from "./rules.js";

const appElement = document.getElementById("app");
const CLICK_DELAY_MS = 300;
const SOLVER_WORKER_URL = new URL("./solver-worker.js?four-solvers-v1", import.meta.url);

const ALGORITHM_GUIDES = {
  backtracking: {
    name: "Basic Backtracking",
    tagline: "Build a solution one row at a time, and undo choices when a branch gets stuck.",
    steps: [
      "Start at the first unfilled row and try its columns from left to right.",
      "Keep a Queen only if it passes the column, diagonal, and kingdom rules.",
      "Continue to the next row. If no column works, remove the last Queen and try its next option.",
      "Finish when every row has a Queen and the complete board passes validation.",
    ],
    watch: "On the board, Queens accumulate down the rows. Red marks are rejected trials; purple marks show a Queen being undone.",
    tradeoff: "Systematic and complete within its limits, but may explore many branches in worst-case O(N!).",
  },
  astar: {
    name: "A* Search",
    tagline: "Evaluate queued partial boards with f(n) = g(n) + h(n), balancing placed queens and domain tightness.",
    steps: [
      "Each priority queue node represents a partial Queen placement.",
      "Expand the queued state with the smallest f = g + h. Here, g is Queens placed (depth) and h estimates remaining difficulty.",
      "The heuristic h evaluates unassigned rows and penalizes domain reductions, detecting dead ends where a row has 0 legal options.",
      "Generate legal child states for the next empty row; prune conflicting or previously explored duplicate states.",
      "Stop when an expanded complete board passes the shared puzzle validator.",
    ],
    watch: "Blue nodes are generated or expanded states; red nodes violate a rule; amber nodes duplicate an explored state.",
    tradeoff: "Informed priority-queue exploration. Adding domain penalties prevents f = N degeneracy but makes h an informed CSP heuristic rather than a strictly admissible shortest-path heuristic.",
  },
  greedy: {
    name: "Greedy Best-First Search",
    tagline: "Aggressively expand the state that appears closest to a goal, evaluating nodes purely by f(n) = h(n).",
    steps: [
      "Each priority queue node represents a partial Queen placement.",
      "Unlike A*, Greedy Best-First ignores path cost g(n) and prioritizes nodes strictly by smallest h(n).",
      "States with more Queens placed and more open legal cells in remaining rows receive lower h values.",
      "If a branch produces a dead end (a row with zero options), its heuristic penalty spikes, redirecting the search.",
      "Stop when a complete board passes the shared puzzle validator.",
    ],
    watch: "Greedy search drives rapidly down promising branches. If trapped, it backtracks via the priority queue.",
    tradeoff: "Often expands fewer nodes than unguided search, but is incomplete and non-optimal in general; can be misled by greedy choices.",
  },
  mrv: {
    name: "MRV + Forward Checking",
    tagline: "Select the most constrained variable first (Minimum Remaining Values) and prune domains ahead of time.",
    steps: [
      "MRV variable ordering: instead of rigid row 0 to N-1 order, always select the unassigned row with the fewest legal column candidates.",
      "Try legal column candidates for that row in sorted order.",
      "Forward Checking: after placing a Queen, immediately prune all conflicting values from the domains of all other unassigned rows.",
      "If any unassigned row's domain is wiped out (0 candidates), detect the dead end immediately at depth k and backtrack.",
      "Restore pruned domain snapshots upon backtracking.",
    ],
    watch: "Assignments jump between rows based on constrainedness rather than sequential order. Red marks show domain eliminations and backtracks.",
    tradeoff: "Complete systematic CSP search with forward inference; prunes failures much earlier than simple backtracking.",
  },
};

const INSTRUCTIONS = [
  ["Puzzle rules", "Place exactly N queens on an N×N board so that every row, every column, and every colored kingdom contains one queen. No two queens may share a diagonal. All of these rules must hold at the same time. A board that breaks any one rule is invalid."],
  ["Kingdoms", "The board is partitioned into N connected regions. Connectivity is 4-directional (up, down, left, right). The stored reference solution is never shown during a race and is never used to fake the AI's performance."],
  ["Turn-based race", "You and the AI have separate boards and alternate one move at a time. You move first. A valid Queen placement or an X annotation ends that player's turn; an invalid Queen placement counts as a mistake and keeps your turn. The first player to complete a valid board wins. The round limit is 120 seconds."],
  ["Equal AI delay", "Every AI action, at every level, waits the same 700 ms before it is revealed. Search runs in a Web Worker. If the solver is still computing after 700 ms, the AI waits until its legal move is ready. The separate live search replay can be slowed to 300, 400, or 500 ms per event; this never changes solver execution time or the fixed reveal delay."],
  ["AI moves and X marks", "Each AI level runs its assigned genuine solver to create a full legal plan, then reveals only one action on each AI turn. The AI revalidates each planned Queen against its own board and recomputes from already-placed Queens if necessary. AI X marks visually show cells ruled out by its Queens; X marks do not block Queen placement or affect mistakes. AI X moves consume turns, as requested."],
  ["Basic Backtracking", "Queens are placed one row at a time. Each legal column is tried. If a partial placement cannot be completed, the algorithm undoes it and tries the next option. This is the reliable baseline solver."],
  ["A* Search", "Nodes represent partial placements ordered by f(n) = g(n) + h(n). g(n) is placed Queens and h(n) estimates remaining difficulty including unassigned domain reduction. Duplicate states are skipped. Limits apply to expanded states and memory."],
  ["Greedy Best-First Search", "Evaluates nodes purely by f(n) = h(n), ignoring path cost g(n). It greedily pursues states with fewest remaining variables and fewest constrained domains. Fast in practice, but incomplete and non-optimal in the general case."],
  ["MRV + Forward Checking", "A CSP solver using Minimum Remaining Values to dynamically pick the variable with fewest legal values, combined with forward checking to prune conflicting domain values from unassigned variables after every placement."],
];

const ABOUT = [
  ["Kingdom Wars: The AI Queen Race", "A strategy game combining constraint satisfaction with an alternating human-versus-AI race. Three real search algorithms solve the same family of colored-kingdom N-Queens puzzles, with shared validation and honest solver metrics."],
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

function explainSearchEvent(event, algorithmKey) {
  if (!event) return "Run a search, then step through the recorded events to see the solver’s actual decisions.";
  const position = Number.isInteger(event.row)
    ? ` at row ${event.row + 1}, column ${event.col + 1}`
    : "";
  if (event.type === "solution") return "Solution found: this complete arrangement passed the game’s shared rules validator.";
  if (event.type === "conflict") {
    return `Rejected${position}: placing a Queen here would break a column, diagonal, or kingdom constraint with an existing Queen.`;
  }
  if (event.type === "backtrack") return `Backtrack${position}: this branch could not be completed, so the solver removes this Queen and tries another option.`;
  if (event.type === "prune") return `Pruned${position}: this partial arrangement has already been explored or eliminated, so the search skips it.`;
  if (event.type === "expand") return `Expanding partial board from priority queue: state popped to generate and evaluate its candidate extensions.`;
  if (event.type === "explore") {
    if (algorithmKey === "astar") {
      return `A* creates legal child state${position} and queues it with f = g + h.`;
    }
    if (algorithmKey === "greedy") {
      return `Greedy Best-First creates legal child state${position} and queues it evaluated by h.`;
    }
    if (algorithmKey === "mrv") {
      return `MRV assigns Queen${position} and forward checks remaining variable domains.`;
    }
    return `Backtracking places a legal Queen${position} and recurses.`;
  }
  return `The solver recorded a ${event.type} event${position}.`;
}

function workerFailure(label, event) {
  const location = event.filename
    ? `${event.filename}${event.lineno ? `:${event.lineno}` : ""}`
    : "";
  const details = [event.message, location].filter(Boolean).join(" at ");
  return details
    ? `${label} failed: ${details}`
    : `${label} could not load or execute. Confirm the preview server is running, then reload.`;
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

function drawVisualizationBoard(canvas, puzzle, event) {
  const width = Math.max(300, Math.floor(canvas.clientWidth || 420));
  const size = Math.min(width, 460);
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  canvas.style.height = `${size}px`;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, size, size);
  const cell = size / puzzle.n;
  const placements = event?.placements || Array(puzzle.n).fill(-1);
  const conflictedCells = new Set();
  if (event?.type === "conflict" || event?.type === "prune") {
    if (Number.isInteger(event.row) && Number.isInteger(event.col)) {
      conflictedCells.add(cellKey(event.row, event.col));
    }
  } else if (Number.isInteger(event?.score) && event.score > 0) {
    for (let firstRow = 0; firstRow < placements.length; firstRow += 1) {
      if (placements[firstRow] < 0) continue;
      for (let secondRow = firstRow + 1; secondRow < placements.length; secondRow += 1) {
        if (placements[secondRow] < 0) continue;
        const firstCol = placements[firstRow];
        const secondCol = placements[secondRow];
        if (
          firstCol === secondCol
          || Math.abs(firstRow - secondRow) === Math.abs(firstCol - secondCol)
          || puzzle.kingdoms[firstRow][firstCol] === puzzle.kingdoms[secondRow][secondCol]
        ) {
          conflictedCells.add(cellKey(firstRow, firstCol));
          conflictedCells.add(cellKey(secondRow, secondCol));
        }
      }
    }
  }
  for (let row = 0; row < puzzle.n; row += 1) {
    for (let col = 0; col < puzzle.n; col += 1) {
      const kingdom = puzzle.kingdoms[row][col];
      const [red, green, blue] = puzzle.colors[kingdom];
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${((row + col) % 2) ? 0.56 : 0.74})`;
      context.fillRect(col * cell, row * cell, cell, cell);
      context.strokeStyle = "rgba(8, 14, 28, .62)";
      context.lineWidth = 1;
      context.strokeRect(col * cell, row * cell, cell, cell);
      const isBacktracked = event?.type === "backtrack" && event.row === row && event.col === col;
      if (placements[row] === col || isBacktracked) {
        context.fillStyle = "#111827";
        context.font = `700 ${Math.round(cell * 0.68)}px Georgia, serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("♛", col * cell + cell / 2, row * cell + cell / 2 + 1);
      }
      if (conflictedCells.has(cellKey(row, col))) {
        context.strokeStyle = "#ff354f";
        context.lineWidth = Math.max(3, size / 115);
        context.strokeRect(col * cell + 2, row * cell + 2, cell - 4, cell - 4);
      }
    }
  }
  if (Number.isInteger(event?.row) && Number.isInteger(event?.col)) {
    context.strokeStyle = event.type === "conflict" || event.type === "prune"
      ? "#ff354f"
      : event.type === "backtrack" ? "#c084fc" : "#fff4ad";
    context.lineWidth = Math.max(3, size / 115);
    context.strokeRect(event.col * cell + 2, event.row * cell + 2, cell - 4, cell - 4);
    if (event.type === "conflict" || event.type === "prune") {
      context.strokeStyle = "#ff354f";
      context.lineWidth = Math.max(2, size / 180);
      context.beginPath();
      context.moveTo(event.col * cell + cell * 0.3, event.row * cell + cell * 0.3);
      context.lineTo((event.col + 1) * cell - cell * 0.3, (event.row + 1) * cell - cell * 0.3);
      context.moveTo((event.col + 1) * cell - cell * 0.3, event.row * cell + cell * 0.3);
      context.lineTo(event.col * cell + cell * 0.3, (event.row + 1) * cell - cell * 0.3);
      context.stroke();
    }
  }
}

function drawSearchTree(canvas, events, cursor, boardSize, lab, nodeLimit = 350) {
  const width = Math.max(300, Math.floor(canvas.clientWidth || 600));
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  if (!lab.treeNodes || cursor < lab.treeCursor) {
    const root = { id: "root", parentId: null, depth: 0, status: "root", sequence: 0 };
    lab.treeNodes = [root];
    lab.treeById = new Map([["root", root]]);
    lab.treeCursor = 0;
  }
  for (let index = lab.treeCursor; index < cursor; index += 1) {
    const event = events[index];
    if (!Number.isInteger(event.id)) continue;
    const key = event.id;
    let node = lab.treeById.get(key);
    if (!node && lab.treeNodes.length < nodeLimit) {
      const parent = event.parentId === null ? lab.treeNodes[0] : lab.treeById.get(event.parentId) || lab.treeNodes[0];
      node = {
        id: key,
        parentId: parent.id,
        depth: parent.depth + 1,
        status: event.type,
        sequence: lab.treeNodes.length,
        visits: 1,
        row: event.row,
        col: event.col,
        score: event.score,
      };
      lab.treeById.set(key, node);
      lab.treeNodes.push(node);
    } else if (node) {
      node.visits += 1;
      node.status = event.type === "expand" ? "explored" : event.type;
      node.row = Number.isInteger(event.row) ? event.row : node.row;
      node.col = Number.isInteger(event.col) ? event.col : node.col;
      node.score = event.score ?? node.score;
    }
  }
  lab.treeCursor = cursor;
  const nodes = lab.treeNodes;
  const nodesById = lab.treeById;
  const height = Math.max(300, nodes.length * 12 + 24);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const maxDepth = Math.max(boardSize + 1, ...nodes.map((node) => node.depth));
  const xFor = (depth) => 18 + (width - 36) * Math.min(depth, maxDepth) / maxDepth;
  const yFor = (sequence) => 12 + sequence * 12;
  context.lineWidth = 1;
  context.strokeStyle = "rgba(156, 168, 196, .28)";
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const parent = nodesById.get(node.parentId);
    if (!parent) continue;
    context.beginPath();
    context.moveTo(xFor(parent.depth), yFor(parent.sequence));
    context.lineTo(xFor(node.depth), yFor(node.sequence));
    context.stroke();
  }
  const colors = {
    root: "#d4af37",
    explore: "#63b3ed",
    explored: "#63b3ed",
    expand: "#63b3ed",
    conflict: "#ff6b6b",
    prune: "#f6ad55",
    backtrack: "#c084fc",
    "local-optimum": "#c084fc",
    solution: "#06d6a0",
    candidate: "#9ca8c4",
    restart: "#e8c44e",
  };
  for (const node of nodes) {
    const x = xFor(node.depth);
    const y = yFor(node.sequence);
    context.beginPath();
    context.fillStyle = colors[node.status] || "#9ca8c4";
    context.arc(x, y, node.status === "solution" ? 4 : node.visits > 1 ? 5 : 3, 0, Math.PI * 2);
    context.fill();
    if (node.visits > 1) {
      context.fillStyle = "#c084fc";
      context.font = "10px Segoe UI, sans-serif";
      context.fillText(`x${node.visits}`, x + 6, y + 3);
    }
    if (node.row !== undefined && node.row !== null) {
      context.fillStyle = "#eceef6";
      context.font = "10px Segoe UI, sans-serif";
      context.fillText(`${node.row + 1}${Number.isInteger(node.col) ? `:${node.col + 1}` : ""}`, x + 6, y + 3);
    }
  }
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
    this.labWorker = null;
    this.labState = {
      algorithmKey: "backtracking",
      puzzleId: "L1G1",
      speed: 4,
      events: [],
      result: null,
      statistics: null,
      cursor: 0,
      playing: false,
      timer: null,
      busy: false,
      error: "",
      traceTruncated: false,
      gallery: [],
      galleryFailures: [],
      galleryBusy: false,
    };
    this.searchState = {
      events: [],
      cursor: 0,
      speedMs: 400,
      timer: null,
      playbackStartedAt: null,
      result: null,
      traceTruncated: false,
      treeNodes: null,
      treeById: null,
      treeCursor: 0,
    };
    this.pendingX = null;
    this.notice = "";
    this.interval = window.setInterval(() => this.tick(), 100);

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleLabChange(event));
    this.root.addEventListener("contextmenu", (event) => this.handleContextMenu(event));
    window.addEventListener("resize", () => {
      if (this.currentScreen === "lab") this.drawLab();
      if (this.currentScreen === "puzzle") this.drawSearch();
    });
    this.render();
  }

  render() {
    const views = {
      menu: () => this.renderMenu(),
      levels: () => this.renderLevels(),
      puzzle: () => this.renderPuzzle(),
      results: () => this.renderResults(),
      compare: () => this.renderComparison(),
      lab: () => this.renderLab(),
      instructions: () => this.renderTextScreen("Instructions", INSTRUCTIONS),
      about: () => this.renderTextScreen("About", ABOUT),
      exit: () => this.renderExit(),
    };
    this.root.innerHTML = `${this.notice ? `<p class="error-banner" role="alert">${escapeHTML(this.notice)}</p>` : ""}${views[this.currentScreen]()}`;
    if (this.currentScreen === "lab") this.drawLab();
  }

  renderMenu() {
    return `<section class="screen main-menu">
      <h1 class="brand-title">KINGDOM WARS</h1>
      <h2 class="brand-subtitle">The AI Queen Race</h2>
      <p class="brand-tagline">N-Queens&nbsp; · &nbsp;Colored Kingdoms&nbsp; · &nbsp;Human vs Algorithm</p>
      <nav class="menu-panel" aria-label="Main menu">
        <button class="button button-primary menu-button" data-action="start">Start Game</button>
        <button class="button menu-button" data-action="open-lab">Algorithm Visualisation</button>
        <button class="button menu-button" data-action="instructions">Instructions</button>
        <button class="button menu-button" data-action="exit">Exit</button>
      </nav>
    </section>`;
  }

  renderLevels() {
    const cards = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1).map((level) => {
      const unlocked = this.progress.isLevelUnlocked(level);
      const completed = this.progress.completedCount(level);
      const spec = specFor(level, 1);
      const games = unlocked
        ? `<div class="game-list">${Array.from({ length: GAMES_PER_LEVEL }, (_, index) => index + 1).map((game) => {
          const item = specFor(level, game);
          const done = this.progress.isCompleted(level, game);
          return `<button class="button game-card${done ? " completed" : ""}" data-action="start-game" data-level="${level}" data-game="${game}">Game ${game}&nbsp;&nbsp; ${item.n}×${item.n}${done ? "　✓" : ""}</button>`;
        }).join("")}</div>`
        : '<div class="locked-label">Locked</div>';
      return `<article class="level-card ${unlocked ? "unlocked" : "locked"}">
        <h2>Level ${level}&nbsp; ${escapeHTML(spec.name)}</h2>
        <p class="level-algorithm">${escapeHTML(spec.algorithm)}</p>
        <p class="level-progress">${completed}/${GAMES_PER_LEVEL} games completed</p>
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
    const availableWidth = Math.min(window.innerWidth, 1200) - (window.innerWidth > 900 ? 360 : 36);
    const boardColumns = window.innerWidth <= 620 ? 1 : 2;
    const width = Math.floor(availableWidth / boardColumns);
    const height = Math.min(window.innerHeight, 720) - 150;
    const cellSize = boardCellSize(puzzle.n, 72, width, height);
    const locked = !round.canEdit();
    return `<section class="screen">
      <header class="game-topbar">
        <button class="button menu-return" data-action="leave-round">Return to Menu</button>
        <div class="game-title"><h1>Level ${puzzle.level}&nbsp; Game ${puzzle.game}&nbsp; · &nbsp;${puzzle.n}×${puzzle.n}</h1><p>AI algorithm: ${escapeHTML(spec.algorithm)} · one Queen or X per turn</p></div>
        <button class="button" data-action="restart">Restart</button>
      </header>
      <div class="game-layout">
        <div class="game-boards">
          <section class="live-board-card"><h2>Your board</h2><div class="human-board-stage">${renderBoard(puzzle, round.humanQueens, round.invalidCells, round.xMarks, { cellSize, disabled: locked, label: "Your board" })}</div></section>
          <section class="live-board-card"><h2>AI board</h2><div class="ai-board-stage">${renderBoard(puzzle, round.aiQueens, new Set(), round.aiXMarks, { cellSize, disabled: true, label: "AI board" })}</div></section>
        </div>
        <aside class="panel race-panel">
          <p class="timer" id="round-timer">${round.remainingTime().toFixed(1).padStart(5, "0")}s</p>
          <p class="panel-label">Time remaining</p>
          <p class="mistake-counter${round.mistakes ? " has-mistakes" : ""}" id="mistake-counter">Mistakes: ${round.mistakes}/${MAX_MISTAKES}</p>
          <p class="ai-status" id="ai-status">${round.currentTurn === "human" ? "Your Turn" : "AI Thinking"}</p>
          <p class="ai-hidden">The AI reveals one Queen or elimination mark after the same ${round.aiMoveDelayMs} ms delay at every level.</p>
          <h2 class="feedback-heading">Your feedback</h2>
          <p class="feedback" id="human-feedback">${escapeHTML(round.humanFeedback)}</p>
          <p class="queen-count">Queens placed: ${round.humanQueens.size} / ${puzzle.n}</p>
          <p class="ai-queen-count">AI Queens: ${round.aiQueens.size} / ${puzzle.n}</p>
          <p class="play-hint">Single-click or right-click to mark X; double-click to place or remove a Queen. Every X or legal Queen action ends your turn. Invalid Queen placements count as mistakes and do not end your turn.</p>
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
    const next = puzzle.game < GAMES_PER_LEVEL || puzzle.level < LEVEL_COUNT;
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
        <section class="panel result-board-card"><h2>AI board</h2>${round.aiQueens.size || round.aiXMarks.size ? renderBoard(puzzle, round.aiQueens, new Set(), round.aiXMarks, { cellSize: aiWidth, disabled: true, label: "AI board" }) : '<div class="no-ai-solution">No AI moves revealed</div>'}</section>
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
      : `<p class="comparison-empty">${this.comparisonRunning ? "Running all three solvers on the selected verified puzzle…" : "Choose a puzzle, then run the comparison."}</p>`;
    return `<section class="screen">
      <header class="screen-header">
        <button class="button" data-action="menu">Main Menu</button>
        <h1>Algorithm Comparison</h1>
        <div class="header-actions">
          <button class="button" data-action="open-lab">Algorithm Visualisation</button>
          <button class="button" data-action="toggle-repeats">Repeats: ${this.comparisonRepeats}</button>
          <button class="button button-primary" data-action="run-comparison"${this.comparisonRunning ? " disabled" : ""}>${this.comparisonRunning ? "Running…" : "Run comparison"}</button>
        </div>
      </header>
      <div class="compare-puzzles">${options}</div>
      <p class="comparison-note">The same verified puzzle is given to every solver. Metrics are algorithm-specific and not equivalent. These are real runs, not fabricated benchmarks. A single run does not prove that one algorithm is always fastest.</p>
      <section class="panel comparison-results">${rows}</section>
    </section>`;
  }

  renderLab() {
    const lab = this.labState;
    const currentGuide = ALGORITHM_GUIDES[lab.algorithmKey] || ALGORITHM_GUIDES.backtracking;
    const algorithms = [
      { key: "backtracking", title: "Basic Backtracking" },
      { key: "astar", title: "A* Search" },
      { key: "greedy", title: "Greedy Best-First Search" },
      { key: "mrv", title: "MRV + Forward Checking" },
    ];
    const algorithmOptions = algorithms.map(({ key, title }) =>
      `<option value="${key}"${lab.algorithmKey === key ? " selected" : ""}>${escapeHTML(title)}</option>`,
    ).join("");
    const puzzleOptions = PUZZLES.map((puzzle) =>
      `<option value="${puzzle.id}"${lab.puzzleId === puzzle.id ? " selected" : ""}>${puzzle.id} · ${puzzle.n}×${puzzle.n}</option>`,
    ).join("");
    const statistics = lab.statistics || {
      nodesExplored: 0,
      conflicts: 0,
      backtracks: 0,
      prunedBranches: 0,
      elapsedSeconds: 0,
    };
    const event = lab.events[Math.max(0, lab.cursor - 1)];
    const eventLabel = event
      ? `${lab.cursor}/${lab.events.length} · ${event.type}${Number.isInteger(event.row) ? ` · row ${event.row + 1}, column ${event.col + 1}` : ""}`
      : lab.result ? "Ready at start" : "Run a genuine solver to create a visualization.";
    const eventExplanation = explainSearchEvent(event, lab.algorithmKey);
    return `<section class="screen lab-screen">
      <header class="screen-header">
        <button class="button" data-action="menu">Main Menu</button>
        <div class="screen-heading"><h1>Algorithm Visualisation</h1><p>Inspect real solver decisions; the game’s AI timing and turn rules are unchanged.</p></div>
      </header>
      <section class="panel lab-toolbar">
        <label>Algorithm<select data-lab-control="algorithm">${algorithmOptions}</select></label>
        <label>Puzzle<select data-lab-control="puzzle">${puzzleOptions}</select></label>
        <button class="button button-primary" data-action="lab-run"${lab.busy ? " disabled" : ""}>${lab.busy ? "Searching…" : "Run Search"}</button>
      </section>
      <section class="panel lab-guide-section" aria-label="How the algorithm works">
        <div class="lab-guide-header">
          <h2>${escapeHTML(currentGuide.name)}</h2>
          <p class="guide-tagline">${escapeHTML(currentGuide.tagline)}</p>
        </div>
        <div class="lab-guide-steps">
          <h3>How it works</h3>
          <ol>
            ${currentGuide.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join("")}
          </ol>
        </div>
      </section>
      ${lab.error ? `<p class="error-banner" role="alert">${escapeHTML(lab.error)}</p>` : ""}
      ${lab.traceTruncated ? '<p class="lab-note">The search completed in full. The animation is capped at 6,000 real events and the tree canvas at 350 nodes to keep the browser responsive; summary statistics cover the full run.</p>' : ""}
      <section class="panel lab-playback">
        <div class="lab-controls">
          <button class="button" data-action="lab-play"${!lab.events.length || lab.playing ? " disabled" : ""}>Play</button>
          <button class="button" data-action="lab-pause"${!lab.playing ? " disabled" : ""}>Pause</button>
          <button class="button" data-action="lab-reset"${!lab.events.length ? " disabled" : ""}>Reset</button>
          <button class="button" data-action="lab-step"${!lab.events.length || lab.cursor >= lab.events.length ? " disabled" : ""}>Next Step</button>
          <label>Speed<select data-lab-control="speed">
            ${[1, 2, 4, 8, 16].map((speed) => `<option value="${speed}"${lab.speed === speed ? " selected" : ""}>${speed} events/s</option>`).join("")}
          </select></label>
        </div>
        <p class="lab-event" id="lab-event">${escapeHTML(eventLabel)}</p>
        <p class="lab-event-explanation" id="lab-event-explanation">${escapeHTML(eventExplanation)}</p>
        <progress class="lab-progress" max="${Math.max(1, lab.events.length)}" value="${lab.cursor}">${lab.cursor}/${lab.events.length}</progress>
      </section>
      <div class="lab-visuals">
        <section class="panel lab-card"><h2>Search board</h2><p class="muted lab-tree-note">Shows the exact Queen arrangement from the current solver event. Red marks a rejected/conflicting position; purple marks backtracking; gold marks the current trial.</p><canvas id="lab-board" aria-label="Animated chessboard search state"></canvas></section>
        <section class="panel lab-card"><h2>Synchronized search tree</h2><p class="muted lab-tree-note">Each dot is a real partial board or candidate, connected to its parent when the solver trace provides that relationship. Color shows the event outcome; repeated dots indicate a revisited state.</p><p class="tree-legend">Blue: explored · Red: conflict · Amber: duplicate/pruned · Purple: backtrack · Green: solution · Gold: restart</p><p class="muted lab-tree-note">The canvas displays up to 350 real search nodes; complete solver statistics remain available below.</p><div class="lab-tree-scroll"><canvas id="lab-tree" aria-label="Search tree of explored and rejected branches"></canvas></div></section>
      </div>
      <section class="lab-stats" aria-label="Search statistics">
        <article class="panel"><span>Nodes explored</span><strong>${statistics.nodesExplored}</strong><small>States/candidates examined; exact meaning depends on the algorithm.</small></article>
        <article class="panel"><span>Conflicts</span><strong>${statistics.conflicts}</strong><small>Violations or objective-conflict pairs counted by this solver.</small></article>
        <article class="panel"><span>Backtracks</span><strong>${statistics.backtracks}</strong><small>Undone choices during backtracking or dead-end recovery.</small></article>
        <article class="panel"><span>Pruned branches</span><strong>${statistics.prunedBranches}</strong><small>Branches/candidates skipped by this algorithm’s search rules.</small></article>
        <article class="panel"><span>Execution time</span><strong>${formatTime(statistics.elapsedSeconds, 4)}</strong><small>Measured solver runtime, not the slower animation playback.</small></article>
      </section>
      <p class="lab-metric-note">These counters come from the completed solver run. Algorithms count work differently, so raw totals are useful for understanding one run but should not be treated as a direct performance comparison.</p>
      ${lab.result ? `<section class="panel lab-summary"><h2>${escapeHTML(lab.result.algorithmName)} · ${lab.result.success ? "solution found" : escapeHTML(lab.result.terminationReason)}</h2><p>${lab.result.success ? `Valid solution: ${lab.result.solution.map((col) => col + 1).join(", ")}` : "This real search did not find a solution within its configured limits."}</p></section>` : ""}
    </section>`;
  }

  handleLabChange(event) {
    if (event.target.matches("[data-search-speed]")) {
      this.searchState.speedMs = Number(event.target.value);
      return;
    }
    const control = event.target.dataset.labControl;
    if (control === "algorithm" || control === "puzzle") {
      this.stopLabPlayback();
      this.stopLabWorker();
      this.labState.busy = false;
      this.labState.galleryBusy = false;
      this.labState.events = [];
      this.labState.result = null;
      this.labState.statistics = null;
      this.labState.cursor = 0;
      this.labState.treeNodes = null;
      this.labState.treeById = null;
      this.labState.treeCursor = 0;
      if (control === "algorithm") this.labState.algorithmKey = event.target.value;
      if (control === "puzzle") this.labState.puzzleId = event.target.value;
    }
    if (control === "speed") this.labState.speed = Number(event.target.value);
    if (this.currentScreen === "lab") this.render();
  }

  runLab() {
    this.stopLabPlayback();
    this.stopLabWorker();
    const lab = this.labState;
    const puzzle = PUZZLES.find((item) => item.id === lab.puzzleId);
    lab.events = [];
    lab.result = null;
    lab.statistics = null;
    lab.cursor = 0;
    lab.treeNodes = null;
    lab.treeById = null;
    lab.treeCursor = 0;
    lab.error = "";
    lab.traceTruncated = false;
    lab.galleryBusy = false;
    lab.busy = true;
    this.render();
    const worker = new Worker(SOLVER_WORKER_URL, { type: "module" });
    this.labWorker = worker;
    worker.addEventListener("message", (message) => {
      if (worker !== this.labWorker) return;
      this.labWorker = null;
      worker.terminate();
      lab.busy = false;
      if (message.data.type === "lab-result") {
        lab.result = message.data.result;
        lab.events = message.data.events;
        lab.statistics = message.data.statistics;
        lab.traceTruncated = message.data.traceTruncated;
      } else {
        lab.error = `Visualization failed: ${message.data.message || "unexpected worker response"}`;
      }
      if (this.currentScreen === "lab") this.render();
    });
    worker.addEventListener("error", (error) => {
      if (worker !== this.labWorker) return;
      this.labWorker = null;
      worker.terminate();
      lab.busy = false;
      lab.error = workerFailure("Visualization worker", error);
      if (this.currentScreen === "lab") this.render();
    });
    worker.postMessage({
      type: "lab",
      puzzle,
      solverKey: lab.algorithmKey,
      config: DEFAULT_CONFIG,
    });
  }

  generateSolutionGallery() {
    this.stopLabWorker();
    const lab = this.labState;
    lab.busy = false;
    lab.galleryBusy = true;
    lab.error = "";
    this.render();
    const worker = new Worker(SOLVER_WORKER_URL, { type: "module" });
    this.labWorker = worker;
    worker.addEventListener("message", (message) => {
      if (worker !== this.labWorker) return;
      this.labWorker = null;
      worker.terminate();
      lab.galleryBusy = false;
      if (message.data.type === "gallery-result") {
        lab.gallery = message.data.solutions;
        lab.galleryFailures = message.data.failedPuzzles;
      }
      else lab.error = `Solution gallery failed: ${message.data.message || "unexpected worker response"}`;
      if (this.currentScreen === "lab") this.render();
    });
    worker.addEventListener("error", (error) => {
      if (worker !== this.labWorker) return;
      this.labWorker = null;
      worker.terminate();
      lab.galleryBusy = false;
      lab.error = workerFailure("Solution gallery worker", error);
      if (this.currentScreen === "lab") this.render();
    });
    worker.postMessage({ type: "gallery" });
  }

  stopLabWorker() {
    if (this.labWorker) {
      this.labWorker.terminate();
      this.labWorker = null;
    }
  }

  stopLabPlayback() {
    this.labState.playing = false;
    if (this.labState.timer !== null) window.clearTimeout(this.labState.timer);
    this.labState.timer = null;
  }

  stepLab() {
    const lab = this.labState;
    if (lab.cursor >= lab.events.length) {
      this.stopLabPlayback();
      return;
    }
    lab.cursor += 1;
    this.drawLab();
    if (lab.cursor >= lab.events.length) this.stopLabPlayback();
  }

  playLab() {
    if (!this.labState.events.length || this.labState.cursor >= this.labState.events.length) return;
    this.labState.playing = true;
    const advance = () => {
      if (!this.labState.playing) return;
      this.stepLab();
      if (this.labState.playing) {
        this.labState.timer = window.setTimeout(advance, 1000 / this.labState.speed);
      }
    };
    advance();
    this.renderLabControls();
  }

  renderLabControls() {
    const lab = this.labState;
    const play = this.root.querySelector('[data-action="lab-play"]');
    const pause = this.root.querySelector('[data-action="lab-pause"]');
    const step = this.root.querySelector('[data-action="lab-step"]');
    if (play) play.disabled = !lab.events.length || lab.playing || lab.cursor >= lab.events.length;
    if (pause) pause.disabled = !lab.playing;
    if (step) step.disabled = !lab.events.length || lab.cursor >= lab.events.length;
  }

  drawLab() {
    const lab = this.labState;
    const board = this.root.querySelector("#lab-board");
    const tree = this.root.querySelector("#lab-tree");
    const puzzle = PUZZLES.find((item) => item.id === lab.puzzleId);
    if (!board || !tree || !puzzle) return;
    const current = lab.cursor ? lab.events[lab.cursor - 1] : null;
    drawVisualizationBoard(board, puzzle, current);
    drawSearchTree(tree, lab.events, lab.cursor, puzzle.n, lab);
    const label = this.root.querySelector("#lab-event");
    const progress = this.root.querySelector(".lab-progress");
    if (label) {
      label.textContent = current
        ? `${lab.cursor}/${lab.events.length} · ${current.type}${Number.isInteger(current.row) ? ` · row ${current.row + 1}, column ${current.col + 1}` : ""}`
        : lab.result ? "Ready at start" : "Run a genuine solver to create a visualization.";
    }
    const explanation = this.root.querySelector("#lab-event-explanation");
    if (explanation) explanation.textContent = explainSearchEvent(current, lab.algorithmKey);
    if (progress) {
      progress.max = Math.max(1, lab.events.length);
      progress.value = lab.cursor;
    }
    this.renderLabControls();
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
    if (this.currentScreen === "lab" && !action.startsWith("lab-")) {
      this.stopLabPlayback();
      this.stopLabWorker();
      this.labState.busy = false;
      this.labState.galleryBusy = false;
    }
    if (action === "start") this.currentScreen = "levels";
    else if (action === "menu") this.currentScreen = "menu";
    else if (action === "levels") this.currentScreen = "levels";
    else if (action === "compare") this.currentScreen = "compare";
    else if (action === "open-lab") this.currentScreen = "lab";
    else if (action === "instructions") this.currentScreen = "instructions";
    else if (action === "about") this.currentScreen = "about";
    else if (action === "exit") this.currentScreen = "exit";
    else if (action === "start-game") this.startGame(Number(button.dataset.level), Number(button.dataset.game));
    else if (action === "leave-round") this.leaveRound();
    else if (action === "restart") {
      const { level, game } = this.round.puzzle;
      this.startGame(level, game);
    } else if (action === "next-game") this.nextGame();
    else if (action === "toggle-repeats") {
      this.comparisonRepeats = this.comparisonRepeats === 1 ? 3 : 1;
    } else if (action === "select-puzzle") {
      this.comparisonPuzzleId = button.dataset.puzzle;
      this.comparisonRows = null;
    } else if (action === "run-comparison") this.runComparison();
    else if (action === "lab-run") this.runLab();
    else if (action === "lab-gallery") this.generateSolutionGallery();
    else if (action === "lab-play") this.playLab();
    else if (action === "lab-pause") {
      this.stopLabPlayback();
      this.renderLabControls();
    } else if (action === "lab-reset") {
      this.stopLabPlayback();
      this.labState.cursor = 0;
      this.drawLab();
    } else if (action === "lab-step") {
      this.stopLabPlayback();
      this.stepLab();
    }
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
    if (!this.round?.canEdit()) return;
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
    if (this.round.toggleXMark(row, col, performance.now())) this.handleRoundChange();
  }

  flushPendingX() {
    if (!this.pendingX) return;
    const pending = this.pendingX;
    window.clearTimeout(pending.timer);
    this.pendingX = null;
    if (this.round?.toggleXMark(pending.row, pending.col, performance.now())) {
      this.handleRoundChange();
    }
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
    this.resetSearch();
    const puzzle = puzzleFor(level, game);
    this.round = new GameRound(puzzle, performance.now(), DEFAULT_CONFIG);
    this.currentScreen = "puzzle";
    const round = this.round;
    this.startSolverWorker(round, puzzle, specFor(level, game).algorithmKey);
  }

  startSolverWorker(round, puzzle, solverKey, fixedQueens = []) {
    this.stopRoundWorker();
    const worker = new Worker(SOLVER_WORKER_URL, { type: "module" });
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      if (round !== this.round) return;
      if (event.data.type === "trace") {
        this.addSearchEvents(event.data.events);
      } else if (event.data.type === "result") {
        this.searchState.result = event.data.result;
        this.searchState.traceTruncated = event.data.result.traceTruncated === true;
        round.setAIPlan(event.data.result, performance.now());
        if (this.worker === worker) this.stopRoundWorker();
        this.handleRoundChange();
        this.updateSearchStatus();
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
      solverKey,
      config: DEFAULT_CONFIG,
      startedAtEpoch: performance.timeOrigin + round.startedAt,
      fixedQueens,
      traceSearch: true,
    });
  }

  resetSearch() {
    if (this.searchState.timer !== null) window.clearTimeout(this.searchState.timer);
    Object.assign(this.searchState, {
      events: [],
      cursor: 0,
      timer: null,
      playbackStartedAt: null,
      result: null,
      traceTruncated: false,
      treeNodes: null,
      treeById: null,
      treeCursor: 0,
    });
  }

  addSearchEvents(events) {
    this.searchState.events.push(...events);
    if (this.currentScreen === "puzzle") this.startSearchPlayback();
  }

  startSearchPlayback() {
    if (!this.root.querySelector("#search-board")) return;
    const state = this.searchState;
    if (state.timer !== null || state.cursor >= state.events.length) {
      this.updateSearchStatus();
      return;
    }
    if (state.playbackStartedAt === null) state.playbackStartedAt = performance.now();
    const advance = () => {
      state.timer = null;
      if (state.cursor >= state.events.length) {
        this.updateSearchTime();
        this.updateSearchStatus();
        return;
      }
      state.cursor += 1;
      this.drawSearch();
      state.timer = window.setTimeout(advance, state.speedMs);
    };
    advance();
  }

  drawSearch() {
    const state = this.searchState;
    const board = this.root.querySelector("#search-board");
    const tree = this.root.querySelector("#search-tree");
    if (!board || !tree || !this.round) return;
    const puzzle = this.round.puzzle;
    const current = state.cursor ? state.events[state.cursor - 1] : null;
    drawVisualizationBoard(board, puzzle, current);
    drawSearchTree(tree, state.events, state.cursor, puzzle.n, state, 2_000);
    const progress = this.root.querySelector("#search-progress");
    const eventLabel = this.root.querySelector("#search-event");
    if (progress) {
      progress.max = Math.max(1, state.events.length);
      progress.value = state.cursor;
    }
    if (eventLabel) {
      eventLabel.textContent = current
        ? `${state.cursor}/${state.events.length} · ${current.type}${Number.isInteger(current.row) ? ` · row ${current.row + 1}, column ${current.col + 1}` : ""}${Number.isInteger(current.score) ? ` · conflict score ${current.score}` : ""}`
        : `${state.events.length} real events queued`;
    }
    this.updateSearchTime();
    this.updateSearchStatus();
  }

  updateSearchTime() {
    const timeLabel = this.root.querySelector("#search-time");
    if (!timeLabel) return;
    const visualizationSeconds = this.searchState.playbackStartedAt === null
      ? 0
      : (performance.now() - this.searchState.playbackStartedAt) / 1000;
    timeLabel.textContent = `Solver execution: ${formatTime(this.searchState.result?.elapsedSeconds, 4)} · Visualization: ${visualizationSeconds.toFixed(1)}s`;
  }

  updateSearchStatus() {
    const status = this.root.querySelector("#search-status");
    if (!status) return;
    const state = this.searchState;
    const result = state.result;
    if (state.cursor < state.events.length) {
      status.textContent = result
        ? `${result.algorithmName}: replaying the recorded search${state.traceTruncated ? " (trace capped at 6,000 events)" : ""}.`
        : "Solver running; replaying its recorded search events.";
    } else if (!result) {
      status.textContent = state.events.length
        ? "Recorded events shown so far; waiting for the solver to finish."
        : "Solver is searching; its first recorded event will appear here.";
    } else {
      status.textContent = `${result.algorithmName}: ${result.success ? "solution found" : result.terminationReason}; replay complete${state.traceTruncated ? " (trace capped at 6,000 events)" : ""}.`;
    }
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
    const solverError = {
      algorithmName: "unknown",
      success: false,
      solution: null,
      elapsedSeconds: round.elapsed(),
      metrics: { error: message },
      terminationReason: "error",
      randomSeed: null,
      foundAtMonotonic: null,
      raceElapsedSeconds: null,
    };
    this.searchState.result = solverError;
    round.setAIPlan(solverError, performance.now());
    this.handleRoundChange();
    this.updateSearchStatus();
  }

  leaveRound() {
    if (this.pendingX) this.flushPendingX();
    this.round?.abandon();
    this.stopRoundWorker();
    if (this.searchState.timer !== null) window.clearTimeout(this.searchState.timer);
    this.searchState.timer = null;
    this.currentScreen = "levels";
  }

  nextGame() {
    if (!this.lastRound) {
      this.currentScreen = "levels";
      return;
    }
    const { level, game } = this.lastRound.puzzle;
    const next = game < GAMES_PER_LEVEL
      ? [level, game + 1]
      : level < LEVEL_COUNT ? [level + 1, 1] : null;
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
    const worker = new Worker(SOLVER_WORKER_URL, { type: "module" });
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
    this.updateSearchTime();
    const now = performance.now();
    const previousAIActions = this.round.aiActions;
    this.round.tick(now);
    if (this.round.result) {
      this.handleRoundChange();
      return;
    }
    if (this.round.aiNeedsReplan && !this.worker) {
      this.round.aiNeedsReplan = false;
      this.resetSearch();
      this.startSolverWorker(
        this.round,
        this.round.puzzle,
        specFor(this.round.puzzle.level, this.round.puzzle.game).algorithmKey,
        this.round.aiPlacements(),
      );
    }
    if (this.round.aiActions !== previousAIActions) {
      this.handleRoundChange();
      return;
    }
    const timer = document.getElementById("round-timer");
    if (timer) {
      const remaining = this.round.remainingTime();
      timer.textContent = `${remaining.toFixed(1).padStart(5, "0")}s`;
      timer.classList.toggle("urgent", remaining < 15);
    }
    const status = document.getElementById("ai-status");
    if (status) status.textContent = this.round.currentTurn === "human" ? "Your Turn" : "AI Thinking";
  }

  handleRoundChange() {
    if (!this.round) return;
    if (this.round.result) {
      this.stopRoundWorker();
      if (this.searchState.timer !== null) window.clearTimeout(this.searchState.timer);
      this.searchState.timer = null;
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
    const aiQueenCount = document.querySelector(".ai-queen-count");
    if (feedback) feedback.textContent = this.round.humanFeedback;
    if (count) {
      count.textContent = `Mistakes: ${this.round.mistakes}/${MAX_MISTAKES}`;
      count.classList.toggle("has-mistakes", this.round.mistakes > 0);
    }
    if (aiStatus) aiStatus.textContent = this.round.currentTurn === "human" ? "Your Turn" : "AI Thinking";
    if (queenCount) queenCount.textContent = `Queens placed: ${this.round.humanQueens.size} / ${this.round.puzzle.n}`;
    if (aiQueenCount) aiQueenCount.textContent = `AI Queens: ${this.round.aiQueens.size} / ${this.round.puzzle.n}`;
    this.renderBoardForRound();
  }

  renderBoardForRound() {
    const humanStage = document.querySelector(".human-board-stage");
    const aiStage = document.querySelector(".ai-board-stage");
    if (!humanStage || !aiStage || !this.round) return;
    const puzzle = this.round.puzzle;
    const availableWidth = Math.min(window.innerWidth, 1200) - (window.innerWidth > 900 ? 360 : 36);
    const boardColumns = window.innerWidth <= 620 ? 1 : 2;
    const width = Math.floor(availableWidth / boardColumns);
    const height = Math.min(window.innerHeight, 720) - 150;
    const cellSize = boardCellSize(puzzle.n, 72, width, height);
    humanStage.innerHTML = renderBoard(
      puzzle,
      this.round.humanQueens,
      this.round.invalidCells,
      this.round.xMarks,
      { cellSize, disabled: !this.round.canEdit(), label: "Your board" },
    );
    aiStage.innerHTML = renderBoard(
      puzzle,
      this.round.aiQueens,
      new Set(),
      this.round.aiXMarks,
      { cellSize, disabled: true, label: "AI board" },
    );
    this.drawSearch();
  }
}

new KingdomWarsBrowserApp(appElement);
