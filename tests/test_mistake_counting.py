from src.algorithms.backtracking import BacktrackingSolver
from src.core.game_controller import GameController
from src.core.progress_manager import ProgressManager
from src.core.puzzle_repository import PuzzleRepository
from src.models.round_result import RaceOutcome, RoundPhase


def test_three_invalid_queen_cells_end_game_and_restart_resets(tmp_path):
    repository = PuzzleRepository()
    progress = ProgressManager(tmp_path / "progress.json")
    controller = GameController(repository=repository, progress=progress)
    puzzle = controller.start_game(1, 1)
    round_manager = controller.round
    solution_col = puzzle.verified_solution[0]
    round_manager.toggle_human(0, solution_col)

    invalid_cells = {(0, col) for col in range(puzzle.n) if col != solution_col}
    first_invalid = min(invalid_cells)
    round_manager.toggle_human(*first_invalid)
    round_manager.toggle_human(*first_invalid)
    assert round_manager.mistakes == 1
    assert not round_manager.human_board.has_queen(*first_invalid)

    remaining_invalid = sorted(invalid_cells - {first_invalid})
    round_manager.toggle_human(*remaining_invalid[0])
    round_manager.toggle_human(*remaining_invalid[1])

    result = controller.tick()
    assert round_manager.mistakes == 3
    assert round_manager.phase == RoundPhase.ROUND_FINALIZED
    assert result is not None
    assert result.outcome == RaceOutcome.HUMAN_FAILED
    assert result.mistakes == 3
    assert result.invalid_cells == invalid_cells
    assert not progress.is_completed(1, 1)

    board_before = round_manager.human_board.queens
    round_manager.toggle_human(1, 0)
    round_manager.toggle_x_mark(1, 0)
    assert round_manager.human_board.queens == board_before
    assert (1, 0) not in round_manager.x_marks

    round_manager.restart(BacktrackingSolver())
    assert round_manager.mistakes == 0
    assert not round_manager.invalid_cells
    assert not round_manager.x_marks
    assert round_manager.phase == RoundPhase.RUNNING
    round_manager.shutdown()


def test_correct_placements_and_x_marks_never_count_as_mistakes(tmp_path):
    controller = GameController(
        repository=PuzzleRepository(),
        progress=ProgressManager(tmp_path / "progress.json"),
    )
    puzzle = controller.start_game(1, 1)
    round_manager = controller.round

    round_manager.toggle_x_mark(0, puzzle.verified_solution[0])
    assert round_manager.mistakes == 0
    assert not round_manager.human_board.queens

    for row, col in enumerate(puzzle.verified_solution):
        round_manager.toggle_human(row, col)
    assert round_manager.mistakes == 0
    assert round_manager.human_board.queen_count() == puzzle.n
    assert round_manager.x_marks == {(0, puzzle.verified_solution[0])}
    round_manager.shutdown()
