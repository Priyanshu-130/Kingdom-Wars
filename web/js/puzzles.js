export const LEVEL_COUNT = 3;
export const GAMES_PER_LEVEL = 3;

export const LEVEL_SPECS = [
  { level: 1, game: 1, n: 4, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Easy", blurb: "4×4 boards; systematic row-by-row search." },
  { level: 1, game: 2, n: 4, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Easy", blurb: "4×4 boards; systematic row-by-row search." },
  { level: 1, game: 3, n: 4, algorithmKey: "backtracking", algorithm: "Basic Backtracking", name: "Easy", blurb: "4×4 boards; systematic row-by-row search." },
  { level: 2, game: 1, n: 5, algorithmKey: "astar", algorithm: "A* Search", name: "Hard", blurb: "5×5 kingdom maps with deeper candidate search." },
  { level: 2, game: 2, n: 5, algorithmKey: "astar", algorithm: "A* Search", name: "Hard", blurb: "5×5 kingdom maps with deeper candidate search." },
  { level: 2, game: 3, n: 6, algorithmKey: "astar", algorithm: "A* Search", name: "Hard", blurb: "A 6×6 board adds more candidate decisions." },
  { level: 3, game: 1, n: 5, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Expert", blurb: "A 5×5 kingdom map with an expert-level search opponent." },
  { level: 3, game: 2, n: 6, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Expert", blurb: "6×6 boards with an expert-level local-search opponent." },
  { level: 3, game: 3, n: 6, algorithmKey: "hill", algorithm: "Hill Climbing", name: "Expert", blurb: "6×6 boards with an expert-level local-search opponent." },
];

export const PUZZLES = [
  { id: "L1G1", level: 1, game: 1, n: 4, kingdoms: [[1,0,0,0],[1,1,0,2],[3,1,2,2],[3,3,3,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 1 · Game 1", difficulty: "n=4" },
  { id: "L1G2", level: 1, game: 2, n: 4, kingdoms: [[0,0,1,1],[2,0,1,1],[2,0,3,3],[2,2,3,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 1 · Game 2", difficulty: "n=4" },
  { id: "L1G3", level: 1, game: 3, n: 4, kingdoms: [[1,1,0,0],[1,0,0,0],[1,3,2,2],[3,3,2,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160]], title: "Level 1 · Game 3", difficulty: "n=4" },
  { id: "L2G1", level: 2, game: 1, n: 5, kingdoms: [[1,1,0,0,2],[1,1,0,0,2],[4,1,3,2,2],[4,1,3,2,3],[4,4,3,3,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 2 · Game 1", difficulty: "n=5" },
  { id: "L2G2", level: 2, game: 2, n: 5, kingdoms: [[1,1,1,0,0],[4,1,1,2,0],[4,1,3,2,2],[4,3,3,3,2],[4,4,4,3,2]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 2 · Game 2", difficulty: "n=5" },
  { id: "L2G3", level: 2, game: 3, n: 6, kingdoms: [[0,0,0,1,1,1],[0,0,1,1,2,2],[0,3,1,1,2,2],[3,3,4,4,5,2],[3,3,4,4,5,2],[3,4,4,5,5,5]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 2 · Game 3", difficulty: "n=6" },
  { id: "L3G1", level: 3, game: 1, n: 5, kingdoms: [[0,0,0,0,0],[0,1,1,1,1],[2,2,1,3,1],[2,2,3,3,4],[2,2,3,4,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255]], title: "Level 3 · Game 1", difficulty: "n=5" },
  { id: "L3G2", level: 3, game: 2, n: 6, kingdoms: [[1,1,1,0,0,0],[1,1,1,0,0,3],[2,2,2,2,0,3],[2,2,4,4,3,3],[5,5,4,4,4,3],[5,5,5,4,4,3]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 3 · Game 2", difficulty: "n=6" },
  { id: "L3G3", level: 3, game: 3, n: 6, kingdoms: [[1,1,1,0,0,0],[1,1,0,0,0,2],[1,1,2,2,2,2],[3,3,5,4,4,4],[3,3,5,5,4,4],[3,3,5,5,5,4]], colors: [[56,182,255],[255,107,107],[255,209,102],[6,214,160],[181,131,255],[255,159,67]], title: "Level 3 · Game 3", difficulty: "n=6" },
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
