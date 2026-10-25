from __future__ import annotations

import pygame

from ..core.level_manager import LEVEL_META, LEVEL_SPECS, LevelManager
from .widgets import GOLD, MUTED, NAVY, OK, PANEL, PANEL_EDGE, TEXT, Button, draw_round_rect


class LevelSelectionScreen:
    name = "levels"

    def __init__(self, app) -> None:
        self.app = app
        self.back = Button("Main Menu", lambda: app.go("menu"))
        self.cards: list[tuple[int, int, pygame.Rect, bool]] = []

    def layout(self, size: tuple[int, int]) -> None:
        w, h = size
        self.back.set_rect(pygame.Rect(40, 28, 180, 46))
        self.cards.clear()
        margin_x = 48
        count = LevelManager.LEVEL_COUNT
        card_w = min(480, (w - margin_x * 2 - (count - 1) * 20) // count)
        total_w = count * card_w + (count - 1) * 20
        start_x = (w - total_w) // 2
        card_h = h - 180
        for i, level in enumerate(range(1, count + 1)):
            rect = pygame.Rect(start_x + i * (card_w + 20), 120, card_w, card_h)
            unlocked = self.app.controller.progress.is_level_unlocked(level)
            self.cards.append((level, i, rect, unlocked))

    def handle(self, event: pygame.event.Event) -> None:
        self.back.handle(event)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            for level, _i, rect, unlocked in self.cards:
                if not unlocked or not rect.collidepoint(event.pos):
                    continue
                inner_y = rect.y + 150
                for game in range(1, LevelManager.GAMES_PER_LEVEL + 1):
                    g_rect = pygame.Rect(rect.x + 18, inner_y + (game - 1) * 78, rect.width - 36, 64)
                    if g_rect.collidepoint(event.pos):
                        self.app.start_race(level, game)
                        return

    def update(self, dt: float) -> None:
        return

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        self.layout((w, h))
        surface.fill(NAVY)
        self.back.draw(surface, self.app.font_button)
        title = self.app.font_title.render("Select a Level", True, TEXT)
        surface.blit(title, (240, 32))
        hint = self.app.font_small.render(
            "Finish all three games in a level to unlock the next algorithm.", True, MUTED
        )
        surface.blit(hint, (240, 78))
        for level, _i, rect, unlocked in self.cards:
            meta = LEVEL_META[level]
            draw_round_rect(surface, rect, PANEL if unlocked else (18, 22, 34), 18)
            pygame.draw.rect(surface, GOLD if unlocked else PANEL_EDGE, rect, 2, border_radius=18)
            name = self.app.font_button.render(f"Level {level}  {meta['name']}", True, TEXT if unlocked else MUTED)
            algo = self.app.font_small.render(meta["algorithm"], True, GOLD if unlocked else MUTED)
            surface.blit(name, (rect.x + 20, rect.y + 22))
            surface.blit(algo, (rect.x + 20, rect.y + 58))
            done = self.app.controller.progress.completed_count(level)
            progress = self.app.font_small.render(f"{done}/{LevelManager.GAMES_PER_LEVEL} games completed", True, OK if done == LevelManager.GAMES_PER_LEVEL else MUTED)
            surface.blit(progress, (rect.x + 20, rect.y + 88))
            if not unlocked:
                lock = self.app.font_button.render("Locked", True, MUTED)
                surface.blit(lock, lock.get_rect(center=rect.center))
                continue
            inner_y = rect.y + 150
            for game in range(1, LevelManager.GAMES_PER_LEVEL + 1):
                spec = next(s for s in LEVEL_SPECS if s.level == level and s.game == game)
                g_rect = pygame.Rect(rect.x + 18, inner_y + (game - 1) * 78, rect.width - 36, 64)
                completed = self.app.controller.progress.is_completed(level, game)
                draw_round_rect(surface, g_rect, (32, 44, 74), 12)
                pygame.draw.rect(surface, OK if completed else PANEL_EDGE, g_rect, 2, border_radius=12)
                label = f"Game {game}   {spec.n}×{spec.n}"
                if completed:
                    label += "   ✓"
                txt = self.app.font_small.render(label, True, TEXT)
                surface.blit(txt, txt.get_rect(center=g_rect.center))
