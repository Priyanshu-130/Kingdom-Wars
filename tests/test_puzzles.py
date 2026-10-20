from src.core.constraint_checker import ConstraintChecker
from src.core.level_manager import LEVEL_SPECS
from src.core.puzzle_repository import PuzzleRepository


def test_repository_has_nine_verified_puzzles_after_removed_tier():
    repo = PuzzleRepository()
    puzzles = repo.all_puzzles()
    assert len(puzzles) == 9
    assert [puzzle.puzzle_id for puzzle in puzzles] == [
        f"L{level}G{game}" for level in range(1, 4) for game in range(1, 4)
    ]
    checker = ConstraintChecker()
    for spec, puzzle in zip(LEVEL_SPECS, puzzles):
        assert puzzle.n == spec.n
        assert puzzle.level == spec.level
        assert puzzle.game == spec.game
        report = checker.validate_puzzle_definition(puzzle)
        assert report.valid, report.errors
        sol = checker.validate_row_columns(puzzle, puzzle.verified_solution)
        assert sol.valid


def test_kingdoms_are_connected_and_complete():
    repo = PuzzleRepository()
    checker = ConstraintChecker()
    for puzzle in repo.all_puzzles():
        ids = {puzzle.kingdom_at(r, c) for r, c in puzzle.all_cells()}
        assert ids == set(range(puzzle.n))
        for kid in range(puzzle.n):
            assert checker.kingdom_is_connected(puzzle, kid)
