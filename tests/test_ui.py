import os

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame

from src.app import KingdomWarsApp
from src.core.game_controller import GameController
from src.core.level_manager import LevelManager
from src.core.progress_manager import ProgressManager
from src.core.puzzle_repository import PuzzleRepository
from src.models.solver_config import SolverConfig


def test_application_starts_and_navigation(tmp_path):
    pygame.init()
    controller = GameController(PuzzleRepository(), ProgressManager(tmp_path / "p.json"))
    app = KingdomWarsApp(controller=controller, size=(1100, 700))
    app._init_display()
    assert app.running
    surface = app.screen_surface
    app.screens["menu"].draw(surface)
    app.go("levels")
    app.screens["levels"].draw(surface)
    app.go("instructions")
    app.screens["instructions"].draw(surface)
    app.go("about")
    app.screens["about"].draw(surface)
    app.go("compare")
    app.screens["compare"].draw(surface)
    app.quit()
    pygame.quit()


def test_mouse_place_submit_restart_and_ai_thread(tmp_path):
    pygame.init()
    controller = GameController(PuzzleRepository(), ProgressManager(tmp_path / "p.json"))
    controller.config = SolverConfig(round_time_limit_seconds=8, time_limit_seconds=8)
    app = KingdomWarsApp(controller=controller, size=(1100, 700))
    app._init_display()
    app.start_race(1, 1)
    puzzle = controller.round.puzzle
    screen = app.screens["puzzle"]
    screen.layout((1100, 700))
    assert screen.grid is not None
    r, c = 0, puzzle.verified_solution[0]
    pos = screen.grid.rect_for(r, c).center
    down = pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=pos)
    screen.handle(down)
    assert not controller.round.human_board.has_queen(r, c)
    screen.handle(down)
    assert controller.round.human_board.has_queen(r, c)
    screen.handle(down)
    screen.handle(down)
    assert not controller.round.human_board.has_queen(r, c)
    x_mark = pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=3, pos=pos)
    screen.handle(x_mark)
    assert (r, c) in controller.round.x_marks
    assert controller.round.mistakes == 0
    assert not controller.round.human_board.has_queen(r, c)
    for row, col in enumerate(puzzle.verified_solution):
        if not controller.round.human_board.has_queen(row, col):
            controller.round.toggle_human(row, col)
    assert controller.submit()
    controller.restart()
    assert controller.round.phase.value == "RUNNING"
    # Main loop style tick must return quickly even while AI runs.
    controller.tick()
    app.screens["puzzle"].update(0.016)
    controller.abandon()
    app.quit()
    pygame.quit()


def test_invalid_queen_is_highlighted_and_x_mark_does_not_count(tmp_path):
    pygame.init()
    controller = GameController(PuzzleRepository(), ProgressManager(tmp_path / "p.json"))
    app = KingdomWarsApp(controller=controller, size=(1100, 700))
    app._init_display()
    app.start_race(1, 1)
    puzzle = controller.round.puzzle
    screen = app.screens["puzzle"]
    screen.layout((1100, 700))
    assert screen.grid is not None

    valid_cell = (0, puzzle.verified_solution[0])
    valid_pos = screen.grid.rect_for(*valid_cell).center
    valid_click = pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=valid_pos)
    screen.handle(valid_click)
    screen.handle(valid_click)

    invalid_cell = (0, (puzzle.verified_solution[0] + 1) % puzzle.n)
    invalid_pos = screen.grid.rect_for(*invalid_cell).center
    invalid_click = pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=invalid_pos)
    screen.handle(invalid_click)
    screen.handle(invalid_click)
    assert controller.round.mistakes == 1
    screen.handle(invalid_click)
    screen.handle(invalid_click)
    assert controller.round.mistakes == 1
    assert invalid_cell in controller.round.invalid_cells
    assert not controller.round.human_board.has_queen(*invalid_cell)
    assert "Invalid queen placement" in controller.round.human_feedback

    surface = app.screen_surface
    screen.draw(surface)
    assert surface.get_at(invalid_pos)[:3] == (190, 38, 52)

    x_cell = (1, 0)
    x_pos = screen.grid.rect_for(*x_cell).center
    screen.handle(pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=x_pos))
    screen._pending_x_since -= screen.DOUBLE_CLICK_SECONDS
    screen.update(0)
    assert x_cell in controller.round.x_marks
    assert controller.round.mistakes == 1
    assert not controller.round.human_board.has_queen(*x_cell)

    app.controller.round.shutdown()
    app.quit()
    pygame.quit()


def test_browser_mode_runs_ai_without_creating_a_worker(tmp_path):
    controller = GameController(
        repository=PuzzleRepository(),
        progress=ProgressManager(tmp_path / "p.json"),
        browser_mode=True,
    )
    controller.start_game(1, 1)
    assert controller.round._executor is None
    assert controller.round.solver_result is not None
    assert controller.round.ai_valid
    assert controller.round.phase.value == "COMPETITOR_FINISHED"
    controller.round.shutdown()


def test_browser_mode_runs_each_level_solver(tmp_path):
    controller = GameController(
        repository=PuzzleRepository(),
        progress=ProgressManager(tmp_path / "p.json"),
        browser_mode=True,
    )
    for level in range(1, LevelManager.LEVEL_COUNT + 1):
        controller.round.start_round(
            controller.repository.get(level, 1),
            controller.levels.solver_for(level),
            controller.config,
        )
        assert controller.round.solver_result is not None
    controller.round.shutdown()
