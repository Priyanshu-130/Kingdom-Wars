export function kingdomIsConnected(puzzle, kingdomId) {
  const cells = [];
  for (let row = 0; row < puzzle.n; row += 1) {
    for (let col = 0; col < puzzle.n; col += 1) {
      if (puzzle.kingdoms[row][col] === kingdomId) cells.push([row, col]);
    }
  }
  if (cells.length === 0) return false;
  const seen = new Set([cellKey(...cells[0])]);
  const queue = [cells[0]];
  for (let index = 0; index < queue.length; index += 1) {
    const [row, col] = queue[index];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const key = cellKey(nextRow, nextCol);
      if (
        nextRow >= 0 && nextRow < puzzle.n && nextCol >= 0 && nextCol < puzzle.n
        && !seen.has(key) && puzzle.kingdoms[nextRow][nextCol] === kingdomId
      ) {
        seen.add(key);
        queue.push([nextRow, nextCol]);
      }
    }
  }
  return seen.size === cells.length;
}

export function validatePuzzleDefinition(puzzle) {
  const errors = [];
  const n = puzzle.n;
  if (!Number.isInteger(n) || n < 1) errors.push("Board size must be positive.");
  if (!Array.isArray(puzzle.kingdoms) || puzzle.kingdoms.length !== n) {
    errors.push("Kingdom grid row count does not match N.");
  }
  if (Array.isArray(puzzle.kingdoms) && puzzle.kingdoms.some((row) => !Array.isArray(row) || row.length !== n)) {
    errors.push("Kingdom grid is not N×N.");
  }
  if (errors.length > 0) return { valid: false, complete: true, errors };
  const ids = new Set(puzzle.kingdoms.flat());
  if (ids.size !== n || Array.from({ length: n }, (_, id) => id).some((id) => !ids.has(id))) {
    errors.push("Kingdom IDs must be exactly 0..N-1, each used.");
  }
  if (!Array.isArray(puzzle.colors) || puzzle.colors.length < n) errors.push("Missing kingdom colors.");
  if (Array.from({ length: n }, (_, id) => id).some((id) => !kingdomIsConnected(puzzle, id))) {
    errors.push("One or more kingdoms are not connected.");
  }
  return { valid: errors.length === 0, complete: true, errors };
}

export function cellKey(row, col) {
  return `${row},${col}`;
}

export function placementConflicts(puzzle, placements, candidate = null) {
  const queens = candidate === null ? [...placements] : [...placements, candidate];
  const rows = new Map();
  const cols = new Map();
  const kingdoms = new Map();
  const errors = [];
  for (const [row, col] of queens) {
    if (!(row >= 0 && row < puzzle.n && col >= 0 && col < puzzle.n)) {
      errors.push("Queen is outside the board.");
      continue;
    }
    rows.set(row, (rows.get(row) || 0) + 1);
    cols.set(col, (cols.get(col) || 0) + 1);
    const kingdom = puzzle.kingdoms[row][col];
    kingdoms.set(kingdom, (kingdoms.get(kingdom) || 0) + 1);
  }
  for (const [row, count] of rows) {
    if (count > 1) errors.push(`Row ${row + 1} has more than one queen.`);
  }
  for (const [col, count] of cols) {
    if (count > 1) errors.push(`Column ${col + 1} has more than one queen.`);
  }
  for (const [kingdom, count] of kingdoms) {
    if (count > 1) errors.push(`Kingdom ${kingdom + 1} has more than one queen.`);
  }
  const inBounds = queens.filter(([row, col]) => row >= 0 && row < puzzle.n && col >= 0 && col < puzzle.n);
  for (let i = 0; i < inBounds.length; i += 1) {
    const [rowA, colA] = inBounds[i];
    for (let j = i + 1; j < inBounds.length; j += 1) {
      const [rowB, colB] = inBounds[j];
      if (Math.abs(rowA - rowB) === Math.abs(colA - colB)) {
        errors.push("Two queens share a diagonal.");
        return errors;
      }
    }
  }
  return errors;
}

export function isSafePartial(puzzle, columns, row, col) {
  if (!(row >= 0 && row < puzzle.n && col >= 0 && col < puzzle.n)) return false;
  const usedKingdoms = new Set();
  for (let otherRow = 0; otherRow < puzzle.n; otherRow += 1) {
    const otherCol = columns[otherRow];
    if (otherCol < 0) continue;
    if (otherCol === col || Math.abs(otherRow - row) === Math.abs(otherCol - col)) return false;
    usedKingdoms.add(puzzle.kingdoms[otherRow][otherCol]);
  }
  return !usedKingdoms.has(puzzle.kingdoms[row][col]);
}

export function isSafeAssignment(puzzle, columnsByRow, row, col) {
  if (!(row >= 0 && row < puzzle.n && col >= 0 && col < puzzle.n)) return false;
  const kingdom = puzzle.kingdoms[row][col];
  for (const [otherRow, otherCol] of columnsByRow) {
    if (
      otherCol === col
      || Math.abs(otherRow - row) === Math.abs(otherCol - col)
      || puzzle.kingdoms[otherRow][otherCol] === kingdom
    ) return false;
  }
  return true;
}

export function validateComplete(puzzle, placements) {
  const queens = [...placements];
  const errors = [];
  const complete = queens.length === puzzle.n;
  if (!complete) errors.push(`Need exactly ${puzzle.n} queens; found ${queens.length}.`);
  const keys = queens.map(([row, col]) => cellKey(row, col));
  if (new Set(keys).size !== keys.length) errors.push("Duplicate placements are not allowed.");
  errors.push(...placementConflicts(puzzle, queens));
  const rows = new Set(queens.map(([row]) => row));
  const cols = new Set(queens.map(([, col]) => col));
  if (queens.length === puzzle.n) {
    if (rows.size !== puzzle.n) errors.push("Every row must contain exactly one queen.");
    if (cols.size !== puzzle.n) errors.push("Every column must contain exactly one queen.");
    const kingdoms = new Set(
      queens
        .filter(([row, col]) => row >= 0 && row < puzzle.n && col >= 0 && col < puzzle.n)
        .map(([row, col]) => puzzle.kingdoms[row][col]),
    );
    if (kingdoms.size !== puzzle.n || Array.from({ length: puzzle.n }, (_, id) => id).some((id) => !kingdoms.has(id))) {
      errors.push("Every kingdom must contain exactly one queen.");
    }
  }
  const uniqueErrors = [...new Set(errors)];
  return { valid: uniqueErrors.length === 0 && complete, complete, errors: uniqueErrors };
}

export function validateRowColumns(puzzle, columns) {
  if (columns.length !== puzzle.n) {
    return { valid: false, complete: false, errors: ["Column assignment length does not match N."] };
  }
  return validateComplete(puzzle, columns.map((col, row) => [row, col]));
}

export function humanFeedback(puzzle, placements) {
  const queens = [...placements];
  if (queens.length === 0) {
    return "Place one queen in each row, column, and kingdom. Diagonals are forbidden.";
  }
  const conflicts = placementConflicts(puzzle, queens);
  const missing = puzzle.n - queens.length;
  const parts = [];
  if (missing > 0) parts.push(`${missing} queen(s) still needed.`);
  if (queens.length > puzzle.n) parts.push(`Too many queens (${queens.length}/${puzzle.n}).`);
  if (conflicts.length) parts.push(...conflicts.slice(0, 3));
  if (parts.length === 0) {
    if (queens.length === puzzle.n) {
      const report = validateComplete(puzzle, queens);
      if (report.valid) return "Looks valid. Submit when you are ready.";
      return report.errors.join(" ") || "Solution is incomplete or invalid.";
    }
    return "No conflicts yet. Keep placing queens.";
  }
  return parts.join(" ");
}
