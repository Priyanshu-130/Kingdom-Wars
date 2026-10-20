from __future__ import annotations

from typing import Optional

import pygame

from ..models.round_result import RoundPhase
from .widgets import (
    DANGER,
    GOLD,
    MUTED,
    NAVY,
    OK,
    PANEL,
    PANEL_EDGE,
    TEXT,
    Button,
    GridLayout,
    draw_board,
    draw_round_rect,
    layout_grid,
    wrap_text,
)


class PuzzleScreen:
    name = "puzzle"

    def __init__(self, app) -> None:
        self.app = app
        self.grid: Optional[GridLayout] = None
        self.hover: Optional[tuple[int, int]] = None
        self.submit_btn = Button("Submit Solution", self._submit, accent=True)
        self.restart_btn = Button("Restart", self._restart)
        self.menu_btn = Button("Return to Menu", self._leave)

    def _submit(self) -> None:
        self.app.controller.submit()

    def _restart(self) -> None:
        self.app.controller.restart()

    def _leave(self) -> None:
        self.app.controller.abandon()
        self.app.go("levels")

    def layout(self, size: tuple[int, int]) -> None:
        w, h = size
        self.menu_btn.set_rect(pygame.Rect(32, 24, 200, 46))
        self.restart_btn.set_rect(pygame.Rect(w - 430, 24, 160, 46))
        self.submit_btn.set_rect(pygame.Rect(w - 250, 24, 218, 46))
        puzzle = self.app.controller.round.puzzle
        if puzzle is None:
            self.grid = None
            return
        area = pygame.Rect(40, 110, w - 420, h - 150)
        self.grid = layout_grid(puzzle.n, area)

    def handle(self, event: pygame.event.Event) -> None:
        self.submit_btn.handle(event)
        self.restart_btn.handle(event)
        self.menu_btn.handle(event)
        if self.grid is None:
            return
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.grid.cell_at(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            cell = self.grid.cell_at(event.pos)
            if cell:
                self.app.controller.round.toggle_human(*cell)

    def update(self, dt: float) -> None:
        result = self.app.controller.tick()
        if result and result.finalized:
            self.app.show_results(result)

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.layout((w, h))
        surface.fill(NAVY)
        rnd = self.app.controller.round
        puzzle = rnd.puzzle
        self.menu_btn.draw(surface, self.app.font_button)
        self.restart_btn.draw(surface, self.app.font_button)
        self.submit_btn.draw(surface, self.app.font_button)
        if puzzle is None or self.grid is None:
            return
        level = puzzle.level
        game = puzzle.game
        meta = self.app.controller.level_meta(level)
        heading = self.app.font_title.render(
            f"Level {level}  Game {game}   ·   {puzzle.n}×{puzzle.n}", True, TEXT
        )
        surface.blit(heading, (250, 24))
        sub = self.app.font_small.render(f"AI algorithm (hidden during the race): {meta['algorithm']}", True, MUTED)
        surface.blit(sub, (250, 68))

        draw_board(surface, puzzle, rnd.human_board, self.grid, True, self.hover)

        side = pygame.Rect(w - 360, 110, 328, h - 150)
        draw_round_rect(surface, side, PANEL, 18)
        pygame.draw.rect(surface, PANEL_EDGE, side, 2, border_radius=18)
        remaining = rnd.remaining_time()
        timer_color = DANGER if remaining < 15 else GOLD
        timer = self.app.font_hero.render(f"{remaining:05.1f}s", True, timer_color)
        surface.blit(timer, (side.x + 24, side.y + 24))
        tlabel = self.app.font_small.render("Time remaining", True, MUTED)
        surface.blit(tlabel, (side.x + 24, side.y + 96))

        status = "AI is competing"
        if rnd.phase == RoundPhase.COMPETITOR_FINISHED and rnd.human_valid:
            status = "Your solution is locked. Waiting for the round clock."
        st = self.app.font_button.render(status, True, OK)
        surface.blit(st, (side.x + 24, side.y + 140))
        note = self.app.font_small.render("AI progress is hidden until results.", True, MUTED)
        surface.blit(note, (side.x + 24, side.y + 178))

        y = side.y + 230
        fb_title = self.app.font_button.render("Your feedback", True, TEXT)
        surface.blit(fb_title, (side.x + 24, y))
        y += 40
        for line in wrap_text(rnd.human_feedback, self.app.font_small, side.width - 48):
            img = self.app.font_small.render(line, True, TEXT)
            surface.blit(img, (side.x + 24, y))
            y += 24

        y += 12
        counts = self.app.font_small.render(
            f"Queens placed: {rnd.human_board.queen_count()} / {puzzle.n}", True, MUTED
        )
        surface.blit(counts, (side.x + 24, y))
        help_lines = [
            "Click a cell to place or remove a queen.",
            "Submit only when every constraint holds.",
            "Restarting does not count as a completed game.",
        ]
        y = side.bottom - 110
        for line in help_lines:
            img = self.app.font_small.render(line, True, MUTED)
            surface.blit(img, (side.x + 24, y))
            y += 24
