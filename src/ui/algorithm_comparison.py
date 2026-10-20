from __future__ import annotations

from typing import Optional

import pygame

from ..models.puzzle import Puzzle
from ..models.solver_config import SolverConfig
from .widgets import GOLD, MUTED, NAVY, PANEL, PANEL_EDGE, TEXT, Button, draw_round_rect, wrap_text


class AlgorithmComparisonScreen:
    name = "compare"

    def __init__(self, app) -> None:
        self.app = app
        self.puzzles = app.controller.repository.comparison_puzzles()
        self.selected: Puzzle = self.puzzles[0]
        self.rows: list[dict] = []
        self.running = False
        self.repeats = 1
        self.back = Button("Main Menu", lambda: app.go("menu"))
        self.run_btn = Button("Run comparison", self._run, accent=True)
        self.repeat_btn = Button("Repeats: 1", self._toggle_repeats)

    def _toggle_repeats(self) -> None:
        self.repeats = 3 if self.repeats == 1 else 1
        self.repeat_btn.label = f"Repeats: {self.repeats}"

    def _run(self) -> None:
        self.running = True

    def layout(self, size: tuple[int, int]) -> None:
        w, _h = size
        self.back.set_rect(pygame.Rect(32, 24, 180, 46))
        self.run_btn.set_rect(pygame.Rect(w - 250, 24, 210, 46))
        self.repeat_btn.set_rect(pygame.Rect(w - 470, 24, 200, 46))

    def handle(self, event: pygame.event.Event) -> None:
        self.back.handle(event)
        self.run_btn.handle(event)
        self.repeat_btn.handle(event)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            x, y = event.pos
            px = 40
            for puzzle in self.puzzles:
                rect = pygame.Rect(px, 90, 210, 48)
                if rect.collidepoint((x, y)):
                    self.selected = puzzle
                    self.rows = []
                px += 220

    def update(self, dt: float) -> None:
        if self.running:
            self.rows = self.app.controller.compare_algorithms(self.selected, repeats=self.repeats)
            self.running = False

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.layout((w, h))
        surface.fill(NAVY)
        self.back.draw(surface, self.app.font_button)
        self.run_btn.draw(surface, self.app.font_button)
        self.repeat_btn.draw(surface, self.app.font_button)
        title = self.app.font_title.render("Algorithm Comparison", True, TEXT)
        surface.blit(title, (230, 28))
        px = 40
        for puzzle in self.puzzles:
            rect = pygame.Rect(px, 90, 210, 48)
            selected = puzzle.puzzle_id == self.selected.puzzle_id
            draw_round_rect(surface, rect, PANEL, 12)
            pygame.draw.rect(surface, GOLD if selected else PANEL_EDGE, rect, 2, border_radius=12)
            label = self.app.font_small.render(
                f"{puzzle.puzzle_id}  {puzzle.n}×{puzzle.n}", True, TEXT
            )
            surface.blit(label, label.get_rect(center=rect.center))
            px += 220

        note = (
            "The same verified puzzle is given to every solver. Metrics are algorithm-specific "
            "and not equivalent. These are real runs, not fabricated benchmarks. A single run "
            "does not prove that one algorithm is always fastest."
        )
        y = 156
        for line in wrap_text(note, self.app.font_small, w - 80):
            img = self.app.font_small.render(line, True, MUTED)
            surface.blit(img, (40, y))
            y += 22

        panel = pygame.Rect(40, 220, w - 80, h - 260)
        draw_round_rect(surface, panel, PANEL, 18)
        pygame.draw.rect(surface, PANEL_EDGE, panel, 2, border_radius=18)
        if not self.rows:
            empty = self.app.font_button.render("Choose a puzzle, then run the comparison.", True, MUTED)
            surface.blit(empty, empty.get_rect(center=panel.center))
            return
        y = panel.y + 20
        for row in self.rows:
            result = row["result"]
            header = (
                f"{result.algorithm_name}    success={result.success}    "
                f"time={result.elapsed_seconds:.4f}s    reason={result.termination_reason}    "
                f"successes={row['successes']}/{row['repeats']}"
            )
            if result.random_seed is not None:
                header += f"    seed={result.random_seed}"
            img = self.app.font_button.render(header, True, GOLD)
            surface.blit(img, (panel.x + 20, y))
            y += 32
            metrics = "  ·  ".join(f"{k}: {v}" for k, v in result.metrics.items())
            for line in wrap_text(metrics or "No extra metrics.", self.app.font_small, panel.width - 40):
                m = self.app.font_small.render(line, True, TEXT)
                surface.blit(m, (panel.x + 20, y))
                y += 22
            y += 12
            if y > panel.bottom - 40:
                break
