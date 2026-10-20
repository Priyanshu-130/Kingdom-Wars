export const LEVEL_SPECS = [
  { level: 1, game: 1, n: 4, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Beginner", blurb: "Systematic search with undo when a partial placement fails." },
  { level: 1, game: 2, n: 4, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Beginner", blurb: "Systematic search with undo when a partial placement fails." },
  { level: 1, game: 3, n: 5, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Beginner", blurb: "Systematic search with undo when a partial placement fails." },
  { level: 2, game: 1, n: 5, algorithmKey: "heuristic", algorithm: "MRV + Forward Checking", name: "Strategist", blurb: "Choose the most constrained row, then prune illegal candidates." },
  { level: 2, game: 2, n: 5, algorithmKey: "heuristic", algorithm: "MRV + Forward Checking", name: "Strategist", blurb: "Choose the most constrained row, then prune illegal candidates." },
  { level: 2, game: 3, n: 6, algorithmKey: "heuristic", algorithm: "MRV + Forward Checking", name: "Strategist", blurb: "Choose the most constrained row, then prune illegal candidates." },
  { level: 3, game: 1, n: 4, algorithmKey: "astar", algorithm: "A* Search", name: "Explorer", blurb: "Priority-queue search with f(n) = g(n) + h(n)." },
  { level: 3, game: 2, n: 5, algorithmKey: "astar", algorithm: "A* Search", name: "Explorer", blurb: "Priority-queue search with f(n) = g(n) + h(n)." },
  { level: 3, game: 3, n: 5, algorithmKey: "astar", algorithm: "A* Search", name: "Explorer", blurb: "Priority-queue search with f(n) = g(n) + h(n)." },
  { level: 4, game: 1, n: 5, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Master", blurb: "Local search over permutations. It can get stuck." },
  { level: 4, game: 2, n: 6, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Master", blurb: "Local search over permutations. It can get stuck." },
  { level: 4, game: 3, n: 6, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Master", blurb: "Local search over permutations. It can get stuck." },
];

export const PUZZLES = [
  { id: "L1G1", level: 1, game: 1, n: 4, kingdoms: [[1,0,0,0],[1,1,0,2],[3,1,2,2],[3,3,3,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 1 · Game 1", difficulty: "n=4" },
  { id: "L1G2", level: 1, game: 2, n: 4, kingdoms: [[0,0,1,1],[2,0,1,1],[2,0,3,3],[2,2,3,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 1 · Game 2", difficulty: "n=4" },
  { id: "L1G3", level: 1, game: 3, n: 5, kingdoms: [[1,1,0,0,2],[1,1,0,0,2],[4,1,3,2,2],[4,1,3,2,3],[4,4,3,3,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 1 · Game 3", difficulty: "n=5" },
  { id: "L2G1", level: 2, game: 1, n: 5, kingdoms: [[1,1,1,0,0],[1,1,0,0,0],[3,2,2,2,0],[3,3,4,2,2],[3,4,4,4,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 2 · Game 1", difficulty: "n=5" },
  { id: "L2G2", level: 2, game: 2, n: 5, kingdoms: [[0,0,0,1,1],[0,2,2,1,1],[0,2,4,1,1],[0,2,4,4,3],[2,2,4,4,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 2 · Game 2", difficulty: "n=5" },
  { id: "L2G3", level: 2, game: 3, n: 6, kingdoms: [[0,0,0,1,1,1],[0,0,1,1,2,2],[0,3,1,1,2,2],[3,3,4,4,5,2],[3,3,4,4,5,2],[3,4,4,5,5,5]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 2 · Game 3", difficulty: "n=6" },
  { id: "L3G1", level: 3, game: 1, n: 4, kingdoms: [[1,1,0,0],[1,0,0,0],[1,3,2,2],[3,3,2,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 3 · Game 1", difficulty: "n=4" },
  { id: "L3G2", level: 3, game: 2, n: 5, kingdoms: [[1,1,1,0,0],[4,1,1,2,0],[4,1,3,2,2],[4,3,3,3,2],[4,4,4,3,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 3 · Game 2", difficulty: "n=5" },
  { id: "L3G3", level: 3, game: 3, n: 5, kingdoms: [[1,0,0,0,0],[1,0,2,2,0],[1,3,4,2,2],[3,3,4,2,4],[3,3,4,4,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 3 · Game 3", difficulty: "n=5" },
  { id: "L4G1", level: 4, game: 1, n: 5, kingdoms: [[0,0,0,0,0],[0,1,1,1,1],[2,2,1,3,1],[2,2,3,3,4],[2,2,3,4,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 4 · Game 1", difficulty: "n=5" },
  { id: "L4G2", level: 4, game: 2, n: 6, kingdoms: [[1,1,1,0,0,0],[1,1,1,0,0,3],[2,2,2,2,0,3],[2,2,4,4,3,3],[5,5,4,4,4,3],[5,5,5,4,4,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 4 · Game 2", difficulty: "n=6" },
  { id: "L4G3", level: 4, game: 3, n: 6, kingdoms: [[1,1,1,0,0,0],[1,1,0,0,0,2],[1,1,2,2,2,2],[3,3,5,4,4,4],[3,3,5,5,4,4],[3,3,5,5,5,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 4 · Game 3", difficulty: "n=6" },
];

export function puzzleFor(level, game) {
  const puzzle = PUZZLES.find((item) => item.level === level && item.game === game);
  if (!puzzle) throw new RangeError(`No puzzle for level ${level}, game ${game}`);
  return puzzle;
}

export function specFor(level, game) {
  const spec = LEVEL_SPECS.find((item) => item.level === level && item.game === game);
  if (!spec) throw new RangeError(`No specification for level ${level}, game ${game}`);
  return spec;
}

export function comparisonPuzzles() {
  return ["L1G1", "L1G3", "L2G1", "L3G2"].map((id) => PUZZLES.find((puzzle) => puzzle.id === id));
}
