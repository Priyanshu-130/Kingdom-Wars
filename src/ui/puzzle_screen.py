from __future__ import annotations

import time
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
    DOUBLE_CLICK_SECONDS = 0.3

    def __init__(self, app) -> None:
        self.app = app
        self.grid: Optional[GridLayout] = None
        self.hover: Optional[tuple[int, int]] = None
        self._pending_x_cell: Optional[tuple[int, int]] = None
        self._pending_x_since = 0.0
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
        if event.type == pygame.MOUSEBUTTONDOWN and event.button in (1, 3):
            cell = self.grid.cell_at(event.pos) if self.grid is not None else None
            if event.button == 1 and cell is not None:
                now = time.perf_counter()
                if (
                    self._pending_x_cell == cell
                    and now - self._pending_x_since <= self.DOUBLE_CLICK_SECONDS
                ):
                    self._pending_x_cell = None
                    self.app.controller.round.toggle_human(*cell)
                else:
                    self._flush_pending_x()
                    self._pending_x_cell = cell
                    self._pending_x_since = now
                return
            self._flush_pending_x()
            if event.button == 3 and cell is not None:
                self.app.controller.round.toggle_x_mark(*cell)
                return

        self.submit_btn.handle(event)
        self.restart_btn.handle(event)
        self.menu_btn.handle(event)
        if self.grid is None:
            return
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.grid.cell_at(event.pos)

    def _flush_pending_x(self) -> None:
        if self._pending_x_cell is None:
            return
        self.app.controller.round.toggle_x_mark(*self._pending_x_cell)
        self._pending_x_cell = None

    def update(self, dt: float) -> None:
        if (
            self._pending_x_cell is not None
            and time.perf_counter() - self._pending_x_since >= self.DOUBLE_CLICK_SECONDS
        ):
            self._flush_pending_x()
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

        draw_board(
            surface,
            puzzle,
            rnd.human_board,
            self.grid,
            True,
            self.hover,
            rnd.invalid_cells,
            rnd.x_marks,
        )

        side = pygame.Rect(w - 360, 110, 328, h - 150)
        draw_round_rect(surface, side, PANEL, 18)
        pygame.draw.rect(surface, PANEL_EDGE, side, 2, border_radius=18)
        remaining = rnd.remaining_time()
        timer_color = DANGER if remaining < 15 else GOLD
        timer = self.app.font_hero.render(f"{remaining:05.1f}s", True, timer_color)
        surface.blit(timer, (side.x + 24, side.y + 24))
        tlabel = self.app.font_small.render("Time remaining", True, MUTED)
        surface.blit(tlabel, (side.x + 24, side.y + 96))
        mistake_color = DANGER if rnd.mistakes else TEXT
        mistake_counter = self.app.font_button.render(
            f"Mistakes: {rnd.mistakes}/{rnd.MAX_MISTAKES}",
            True,
            mistake_color,
        )
        surface.blit(mistake_counter, (side.x + 24, side.y + 116))

        status = "AI is competing"
        if rnd.phase == RoundPhase.COMPETITOR_FINISHED and rnd.human_valid:
            status = "Your solution is locked. Waiting for the round clock."
        st = self.app.font_button.render(status, True, OK)
        surface.blit(st, (side.x + 24, side.y + 152))
        y = side.y + 190
        for line in wrap_text("AI progress is hidden until results.", self.app.font_small, side.width - 48):
            img = self.app.font_small.render(line, True, MUTED)
            surface.blit(img, (side.x + 24, y))
            y += 24

        y += 8
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
            line
            for text in (
                "Single-click to mark X; double-click a queen.",
                "Right-click also toggles an X mark.",
                "Submit only when every constraint holds.",
            )
            for line in wrap_text(text, self.app.font_small, side.width - 48)
        ]
        y = side.bottom - len(help_lines) * 24 - 24
        for line in help_lines:
            img = self.app.font_small.render(line, True, MUTED)
            surface.blit(img, (side.x + 24, y))
            y += 24
