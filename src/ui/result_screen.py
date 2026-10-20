from __future__ import annotations

from typing import Optional

import pygame

from ..core.level_manager import LevelManager
from ..models.round_result import RaceOutcome, RoundResult
from .widgets import (
    GOLD,
    MUTED,
    NAVY,
    OK,
    PANEL,
    PANEL_EDGE,
    TEXT,
    DANGER,
    Button,
    draw_board,
    draw_round_rect,
    layout_grid,
    wrap_text,
)


class ResultScreen:
    name = "results"

    def __init__(self, app) -> None:
        self.app = app
        self.result: Optional[RoundResult] = None
        self.next_btn = Button("Next Game", self._next, accent=True)
        self.levels_btn = Button("Return to Levels", lambda: app.go("levels"))
        self.menu_btn = Button("Main Menu", lambda: app.go("menu"))

    def set_result(self, result: RoundResult) -> None:
        self.result = result

    def _next(self) -> None:
        if self.result is None:
            self.app.go("levels")
            return
        nxt = LevelManager().next_game(self.result.puzzle.level, self.result.puzzle.game)
        if nxt is None:
            self.app.go("levels")
            return
        level, game = nxt
        if self.app.controller.progress.is_game_unlocked(level, game):
            self.app.start_race(level, game)
        else:
            self.app.go("levels")

    def layout(self, size: tuple[int, int]) -> None:
        w, _h = size
        self.next_btn.set_rect(pygame.Rect(w - 250, 24, 210, 46))
        self.levels_btn.set_rect(pygame.Rect(w - 490, 24, 220, 46))
        self.menu_btn.set_rect(pygame.Rect(32, 24, 180, 46))

    def handle(self, event: pygame.event.Event) -> None:
        self.next_btn.handle(event)
        self.levels_btn.handle(event)
        self.menu_btn.handle(event)

    def update(self, dt: float) -> None:
        return

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.layout((w, h))
        surface.fill(NAVY)
        self.next_btn.draw(surface, self.app.font_button)
        self.levels_btn.draw(surface, self.app.font_button)
        self.menu_btn.draw(surface, self.app.font_button)
        result = self.result
        if result is None:
            return
        headline = {
            RaceOutcome.HUMAN_WIN: "You won the race",
            RaceOutcome.AI_WIN: "The AI won the race",
            RaceOutcome.DRAW: "Draw",
            RaceOutcome.ABANDONED: "Round abandoned",
            RaceOutcome.HUMAN_FAILED: "Game over: 3 mistakes",
        }[result.outcome]
        color = OK if result.outcome == RaceOutcome.HUMAN_WIN else GOLD
        if result.outcome in (RaceOutcome.AI_WIN, RaceOutcome.HUMAN_FAILED):
            color = DANGER
        title = self.app.font_title.render(headline, True, color)
        surface.blit(title, (230, 28))

        human_area = pygame.Rect(40, 100, (w // 2) - 60, h // 2)
        ai_area = pygame.Rect(w // 2 + 10, 100, (w // 2) - 50, h // 2)
        h_layout = layout_grid(result.puzzle.n, human_area, max_cell=64)
        draw_board(
            surface,
            result.puzzle,
            result.human_board,
            h_layout,
            True,
            invalid_cells=result.invalid_cells,
            x_marks=result.x_marks,
        )
        hl = self.app.font_button.render("Human board", True, TEXT)
        surface.blit(hl, (human_area.x, human_area.y - 8 + human_area.height + 8) if False else (human_area.x, 96))
        if result.ai_valid and result.ai_board is not None:
            a_layout = layout_grid(result.puzzle.n, ai_area, max_cell=64)
            draw_board(surface, result.puzzle, result.ai_board, a_layout, True)
            al = self.app.font_button.render("AI board (revealed)", True, TEXT)
            surface.blit(al, (ai_area.x, 96))
        else:
            draw_round_rect(surface, ai_area, PANEL, 18)
            pygame.draw.rect(surface, PANEL_EDGE, ai_area, 2, border_radius=18)
            msg = self.app.font_button.render("No validated AI solution", True, MUTED)
            surface.blit(msg, msg.get_rect(center=ai_area.center))

        panel = pygame.Rect(40, h // 2 + 70, w - 80, h // 2 - 90)
        draw_round_rect(surface, panel, PANEL, 18)
        pygame.draw.rect(surface, PANEL_EDGE, panel, 2, border_radius=18)

        ht = f"{result.human_time:.3f}s" if result.human_time is not None else "—"
        at = f"{result.ai_time:.3f}s" if result.ai_time is not None else "—"
        lines = [
            f"Human valid: {result.human_valid}    time: {ht}",
            f"AI valid: {result.ai_valid}    time: {at}",
            f"Mistakes: {result.mistakes}/{self.app.controller.round.MAX_MISTAKES}",
        ]
        sr = result.solver_result
        if sr:
            lines.append(
                f"Algorithm: {sr.algorithm_name}    success: {sr.success}    "
                f"elapsed: {sr.elapsed_seconds:.4f}s    reason: {sr.termination_reason}"
            )
            if sr.random_seed is not None:
                lines.append(f"Random seed: {sr.random_seed}")
            metric_bits = [f"{k}: {v}" for k, v in sr.metrics.items()]
            lines.append("Metrics: " + "  ·  ".join(metric_bits[:8]))
            if len(metric_bits) > 8:
                lines.append("  ·  ".join(metric_bits[8:]))
        for note in result.notes:
            lines.append(note)
        lines.append("Algorithm-specific metrics are not directly comparable across solvers.")
        y = panel.y + 20
        for line in lines:
            for wrapped in wrap_text(line, self.app.font_small, panel.width - 40):
                img = self.app.font_small.render(wrapped, True, TEXT)
                surface.blit(img, (panel.x + 20, y))
                y += 22
                if y > panel.bottom - 24:
                    return
