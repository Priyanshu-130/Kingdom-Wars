from __future__ import annotations

import asyncio
import os
import sys

import pygame

from .core.game_controller import GameController
from .models.round_result import RoundResult
from .ui.algorithm_comparison import AlgorithmComparisonScreen
from .ui.instructions_screen import AboutScreen, InstructionsScreen
from .ui.level_selection import LevelSelectionScreen
from .ui.main_menu import MainMenuScreen
from .ui.puzzle_screen import PuzzleScreen
from .ui.result_screen import ResultScreen
from .ui.widgets import NAVY


class KingdomWarsApp:
    def __init__(
        self,
        controller: GameController | None = None,
        size: tuple[int, int] = (1280, 720),
        browser_mode: bool = False,
    ) -> None:
        self.controller = controller or GameController()
        self.size = size
        self.browser_mode = browser_mode
        self.running = False
        self.screen_surface = None
        self.clock = None
        self.font_hero = None
        self.font_title = None
        self.font_button = None
        self.font_small = None
        self.screens = {}
        self.current = "menu"

    def _init_display(self) -> None:
        pygame.init()
        pygame.display.set_caption("Kingdom Wars: The AI Queen Race")
        flags = pygame.RESIZABLE | (pygame.SCALED if self.browser_mode else 0)
        self.screen_surface = pygame.display.set_mode(self.size, flags)
        self.clock = pygame.time.Clock()
        self.font_hero = pygame.font.SysFont("georgia", 54, bold=True)
        self.font_title = pygame.font.SysFont("segoeui", 32, bold=True)
        self.font_button = pygame.font.SysFont("segoeui", 22, bold=True)
        self.font_small = pygame.font.SysFont("segoeui", 18)
        self.screens = {
            "menu": MainMenuScreen(self),
            "levels": LevelSelectionScreen(self),
            "puzzle": PuzzleScreen(self),
            "results": ResultScreen(self),
            "compare": AlgorithmComparisonScreen(self),
            "instructions": InstructionsScreen(self),
            "about": AboutScreen(self),
        }
        self.current = "menu"
        self.running = True

    def go(self, name: str) -> None:
        self.current = name

    def start_race(self, level: int, game: int) -> None:
        self.controller.start_game(level, game)
        self.go("puzzle")

    def show_results(self, result: RoundResult) -> None:
        self.screens["results"].set_result(result)
        self.go("results")

    def quit(self) -> None:
        self.running = False

    def run(self) -> None:
        asyncio.run(self.run_async())

    async def run_async(self) -> None:
        self._init_display()
        try:
            while self.running:
                dt = self.clock.tick(60) / 1000.0
                await asyncio.sleep(0)
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        self.running = False
                    elif event.type == pygame.VIDEORESIZE:
                        if not self.browser_mode:
                            self.size = (max(800, event.w), max(600, event.h))
                            self.screen_surface = pygame.display.set_mode(self.size, pygame.RESIZABLE)
                    else:
                        self.screens[self.current].handle(event)
                self.screens[self.current].update(dt)
                if self.screen_surface:
                    self.screen_surface.fill(NAVY)
                    self.screens[self.current].draw(self.screen_surface)
                    pygame.display.flip()
        finally:
            self.controller.round.shutdown()
            pygame.quit()


def run() -> None:
    app = KingdomWarsApp()
    app.run()


async def run_browser() -> None:
    app = KingdomWarsApp(
        controller=GameController(browser_mode=True),
        size=(1100, 700),
        browser_mode=True,
    )
    await app.run_async()


def main() -> None:
    run()


if __name__ == "__main__":
    main()
