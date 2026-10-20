import os

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame

from src.app import KingdomWarsApp
from src.core.game_controller import GameController
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
    assert controller.round.human_board.has_queen(r, c)
    screen.handle(down)
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
