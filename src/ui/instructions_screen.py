from __future__ import annotations

import pygame

from .widgets import GOLD, MUTED, NAVY, PANEL, PANEL_EDGE, TEXT, Button, draw_round_rect, wrap_text


INSTRUCTIONS = [
    ("Puzzle rules",
     "Place exactly N queens on an N×N board so that every row, every column, and every "
     "colored kingdom contains one queen. No two queens may share a diagonal. All of these "
     "rules must hold at the same time. A board that breaks any one rule is invalid."),
    ("Kingdoms",
     "The board is partitioned into N connected regions. Connectivity is 4-directional "
     "(up, down, left, right). The stored reference solution is never shown during a race "
     "and is never used to fake the AI's performance."),
    ("Race rules",
     "You and the AI receive the same immutable puzzle and independent boards. A valid "
     "submission locks your board. Invalid submissions do not count. The race continues "
     "until both sides have solved or the time limit expires (default 120 seconds). "
     "If both succeed, timestamps are compared. If they fall within 0.05 seconds, the "
     "result is a draw. Elapsed time uses a monotonic clock, not the wall clock."),
    ("Hidden AI",
     "During the live round the interface only says that the AI is competing. Queen "
     "positions, search progress, scores, and metrics appear only on the results screen."),
    ("CSP Backtracking + MRV + Forward Checking",
     "A systematic CSP solver that dynamically selects the unassigned row with the Minimum "
     "Remaining Values (MRV / fewest legal columns) and immediately forward-checks unassigned variable "
     "domains after each placement. Pruned domains are restored upon backtracking. Complete for finite CSP domains."),
    ("Greedy Best-First Search",
     "An informed priority-queue solver evaluated purely by f(n) = h(n), where h estimates remaining "
     "unassigned queens and domain tightness. Unlike systematic backtracking, it pursues promising nodes "
     "greedily and is not guaranteed to find a solution or prove unsatisfiability in bounded search."),
]

ABOUT = [
    ("Kingdom Wars: The AI Queen Race",
     "A strategy game that combines constraint satisfaction with a human-versus-AI race. "
     "Two genuine AI approaches solve the same family of puzzles: CSP Backtracking with MRV "
     "and Forward Checking, and Greedy Best-First Search. The emphasis is on correct constraints, honest "
     "metrics, and a playable interface rather than on claiming a universal winner."),
    ("Technology",
     "Python, Pygame, pytest, heapq, and a background thread for AI search. No server, "
     "database, or cloud API is required. Progress is stored in a local JSON file when possible."),
]


class TextScreen:
    def __init__(self, app, title: str, sections: list[tuple[str, str]], back_to: str = "menu") -> None:
        self.app = app
        self.title = title
        self.sections = sections
        self.scroll = 0
        self.back = Button("Back", lambda: app.go(back_to))

    def handle(self, event: pygame.event.Event) -> None:
        self.back.handle(event)
        if event.type == pygame.MOUSEWHEEL:
            self.scroll = max(0, self.scroll - event.y * 36)
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_DOWN:
                self.scroll += 36
            if event.key == pygame.K_UP:
                self.scroll = max(0, self.scroll - 36)

    def update(self, dt: float) -> None:
        return

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.back.set_rect(pygame.Rect(32, 24, 140, 46))
        surface.fill(NAVY)
        self.back.draw(surface, self.app.font_button)
        title = self.app.font_title.render(self.title, True, GOLD)
        surface.blit(title, (190, 28))
        panel = pygame.Rect(40, 90, w - 80, h - 120)
        draw_round_rect(surface, panel, PANEL, 18)
        pygame.draw.rect(surface, PANEL_EDGE, panel, 2, border_radius=18)
        y = panel.y + 24 - self.scroll
        for heading, body in self.sections:
            if y > panel.bottom:
                break
            if y >= panel.y:
                img = self.app.font_button.render(heading, True, GOLD)
                surface.blit(img, (panel.x + 24, y))
            y += 36
            for line in wrap_text(body, self.app.font_small, panel.width - 48):
                if panel.y < y < panel.bottom - 20:
                    txt = self.app.font_small.render(line, True, TEXT)
                    surface.blit(txt, (panel.x + 24, y))
                y += 22
            y += 18
        hint = self.app.font_small.render("Scroll with the mouse wheel", True, MUTED)
        surface.blit(hint, (w - 280, 40))


class InstructionsScreen(TextScreen):
    name = "instructions"

    def __init__(self, app) -> None:
        super().__init__(app, "Instructions", INSTRUCTIONS)


class AboutScreen(TextScreen):
    name = "about"

    def __init__(self, app) -> None:
        super().__init__(app, "About", ABOUT)
