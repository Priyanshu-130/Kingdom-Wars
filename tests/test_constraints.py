from src.core.constraint_checker import ConstraintChecker
from src.core.puzzle_repository import PuzzleRepository
from src.models.puzzle import KINGDOM_PALETTE, Puzzle


def _puzzle():
    return PuzzleRepository().get(1, 1)


def test_valid_complete_solution():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    cols = puzzle.verified_solution
    report = checker.validate_row_columns(puzzle, cols)
    assert report.valid
    assert report.complete


def test_duplicate_rows():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    n = puzzle.n
    queens = [(0, 0), (0, 1)] + [(r, r % n) for r in range(2, n)]
    report = checker.validate_complete(puzzle, queens)
    assert not report.valid
    assert any("Row" in e for e in report.errors)


def test_duplicate_columns():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    queens = [(r, 0) for r in range(puzzle.n)]
    report = checker.validate_complete(puzzle, queens)
    assert not report.valid
    assert any("Column" in e for e in report.errors)


def test_diagonal_conflicts():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    queens = [(r, r) for r in range(puzzle.n)]
    report = checker.validate_complete(puzzle, queens)
    assert not report.valid
    assert any("diagonal" in e.lower() for e in report.errors)


def test_duplicate_kingdom_occupancy():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    cells = [(r, c) for r, c in puzzle.all_cells() if puzzle.kingdom_at(r, c) == 0][:2]
    others = []
    used_rows = {cells[0][0], cells[1][0]}
    used_cols = {cells[0][1], cells[1][1]}
    for r in range(puzzle.n):
        if r in used_rows:
            continue
        for c in range(puzzle.n):
            if c in used_cols:
                continue
            others.append((r, c))
            used_rows.add(r)
            used_cols.add(c)
            break
    queens = cells + others[: puzzle.n - 2]
    report = checker.validate_complete(puzzle, queens)
    assert not report.valid


def test_missing_queens_and_incomplete():
    puzzle = _puzzle()
    checker = ConstraintChecker()
    report = checker.validate_complete(puzzle, [(0, puzzle.verified_solution[0])])
    assert not report.valid
    assert not report.complete


def test_malformed_and_invalid_kingdom_ids():
    checker = ConstraintChecker()
    bad = Puzzle(
        puzzle_id="bad",
        n=4,
        kingdoms=((0, 0, 0, 0), (1, 1, 1, 1), (2, 2, 2, 2), (9, 9, 9, 9)),
        kingdom_colors=KINGDOM_PALETTE[:4],
        verified_solution=(1, 3, 0, 2),
        level=1,
        game=1,
    )
    report = checker.validate_puzzle_definition(bad)
    assert not report.valid
    assert any("Kingdom IDs" in e or "connected" in e.lower() for e in report.errors)
