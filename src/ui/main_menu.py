from __future__ import annotations

import pygame

from .widgets import GOLD, MUTED, NAVY, TEXT, Button, draw_round_rect, PANEL, PANEL_EDGE


class MainMenuScreen:
    name = "menu"

    def __init__(self, app) -> None:
        self.app = app
        self.buttons = [
            Button("Start Game", lambda: app.go("levels"), accent=True),
            Button("Instructions", lambda: app.go("instructions")),
            Button("Exit", app.quit),
        ]

    def layout(self, size: tuple[int, int]) -> None:
        w, h = size
        box_w, box_h = 420, 58
        start_y = 320
        for i, btn in enumerate(self.buttons):
            btn.set_rect(pygame.Rect((w - box_w) // 2, start_y + i * 72, box_w, box_h))

    def handle(self, event: pygame.event.Event) -> None:
        for btn in self.buttons:
            btn.handle(event)

    def update(self, dt: float) -> None:
        return

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.layout((w, h))
        surface.fill(NAVY)
        title = self.app.font_hero.render("KINGDOM WARS", True, GOLD)
        subtitle = self.app.font_title.render("The AI Queen Race", True, TEXT)
        tag = self.app.font_small.render(
            "N-Queens  ·  Colored Kingdoms  ·  Human vs Algorithm", True, MUTED
        )
        surface.blit(title, title.get_rect(center=(w // 2, 140)))
        surface.blit(subtitle, subtitle.get_rect(center=(w // 2, 210)))
        surface.blit(tag, tag.get_rect(center=(w // 2, 258)))
        panel = pygame.Rect(w // 2 - 260, 300, 520, 250)
        draw_round_rect(surface, panel, PANEL, 20)
        pygame.draw.rect(surface, PANEL_EDGE, panel, 2, border_radius=20)
        for btn in self.buttons:
            btn.draw(surface, self.app.font_button)
