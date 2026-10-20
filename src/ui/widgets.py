from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import pygame

from ..models.board_state import BoardState
from ..models.puzzle import Puzzle


NAVY = (10, 16, 32)
CHARCOAL = (16, 22, 38)
PANEL = (22, 30, 52)
PANEL_EDGE = (48, 62, 96)
GOLD = (212, 175, 55)
GOLD_DIM = (164, 132, 42)
TEXT = (236, 238, 246)
MUTED = (156, 168, 196)
DANGER = (255, 107, 107)
OK = (6, 214, 160)
WHITE = (255, 255, 255)


def draw_round_rect(surface, rect, color, radius=14, width=0):
    pygame.draw.rect(surface, color, rect, width=width, border_radius=radius)


class Button:
    def __init__(
        self,
        label: str,
        action: Callable[[], None],
        accent: bool = False,
        enabled: bool = True,
    ) -> None:
        self.label = label
        self.action = action
        self.accent = accent
        self.enabled = enabled
        self.rect = pygame.Rect(0, 0, 0, 0)
        self.hover = False

    def set_rect(self, rect: pygame.Rect) -> None:
        self.rect = rect

    def handle(self, event: pygame.event.Event) -> bool:
        if not self.enabled:
            return False
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.rect.collidepoint(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                self.action()
                return True
        return False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font) -> None:
        if not self.enabled:
            bg = (40, 48, 68)
            fg = (110, 118, 140)
            border = (60, 70, 92)
        elif self.accent:
            bg = GOLD if not self.hover else (232, 196, 78)
            fg = (16, 18, 28)
            border = GOLD
        else:
            bg = (36, 48, 78) if not self.hover else (48, 64, 102)
            fg = TEXT
            border = GOLD_DIM if self.hover else PANEL_EDGE
        draw_round_rect(surface, self.rect, bg, 12)
        pygame.draw.rect(surface, border, self.rect, 2, border_radius=12)
        text = font.render(self.label, True, fg)
        surface.blit(text, text.get_rect(center=self.rect.center))


@dataclass
class GridLayout:
    origin: tuple[int, int]
    cell: int
    n: int

    def rect_for(self, row: int, col: int) -> pygame.Rect:
        x, y = self.origin
        return pygame.Rect(x + col * self.cell, y + row * self.cell, self.cell, self.cell)

    def cell_at(self, pos: tuple[int, int]) -> Optional[tuple[int, int]]:
        x, y = pos
        ox, oy = self.origin
        if x < ox or y < oy:
            return None
        col = (x - ox) // self.cell
        row = (y - oy) // self.cell
        if 0 <= row < self.n and 0 <= col < self.n:
            return int(row), int(col)
        return None

    def size(self) -> int:
        return self.cell * self.n


def layout_grid(n: int, area: pygame.Rect, max_cell: int = 88, min_cell: int = 36) -> GridLayout:
    cell = min(max_cell, area.width // n, area.height // n)
    cell = max(min_cell, cell)
    width = cell * n
    height = cell * n
    ox = area.x + (area.width - width) // 2
    oy = area.y + (area.height - height) // 2
    return GridLayout((ox, oy), cell, n)


def draw_queen(surface: pygame.Surface, rect: pygame.Rect) -> None:
    cx, cy = rect.center
    s = max(8, rect.width // 3)
    color = WHITE
    shadow = (20, 24, 36)
    pygame.draw.circle(surface, shadow, (cx + 1, cy + 3), s // 2)
    points = [
        (cx - s, cy + s // 3),
        (cx - s, cy - s // 5),
        (cx - s // 2, cy + s // 8),
        (cx, cy - s // 2),
        (cx + s // 2, cy + s // 8),
        (cx + s, cy - s // 5),
        (cx + s, cy + s // 3),
    ]
    pygame.draw.polygon(surface, color, points)
    pygame.draw.rect(surface, color, pygame.Rect(cx - s, cy + s // 4, s * 2, max(4, s // 3)), border_radius=3)
    for dx in (-s, 0, s):
        pygame.draw.circle(surface, GOLD, (cx + dx, cy - s // 2 if dx == 0 else cy - s // 5), max(3, s // 6))


def shade(color: tuple[int, int, int], amount: int) -> tuple[int, int, int]:
    return tuple(max(0, min(255, c + amount)) for c in color)


def draw_board(
    surface: pygame.Surface,
    puzzle: Puzzle,
    board: BoardState,
    layout: GridLayout,
    show_queens: bool = True,
    highlight: Optional[tuple[int, int]] = None,
) -> None:
    outer = pygame.Rect(layout.origin[0] - 8, layout.origin[1] - 8, layout.size() + 16, layout.size() + 16)
    draw_round_rect(surface, outer, PANEL, 18)
    pygame.draw.rect(surface, PANEL_EDGE, outer, 2, border_radius=18)
    for r in range(puzzle.n):
        for c in range(puzzle.n):
            rect = layout.rect_for(r, c)
            base = puzzle.color_for_kingdom(puzzle.kingdom_at(r, c))
            fill = shade(base, -18 if (r + c) % 2 else 8)
            if highlight == (r, c):
                fill = shade(base, 40)
            pygame.draw.rect(surface, fill, rect)
            pygame.draw.rect(surface, shade(base, -50), rect, 1)
            if show_queens and board.has_queen(r, c):
                draw_queen(surface, rect)


def wrap_text(text: str, font: pygame.font.Font, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines = [words[0]]
    for word in words[1:]:
        trial = f"{lines[-1]} {word}"
        if font.size(trial)[0] <= max_width:
            lines[-1] = trial
        else:
            lines.append(word)
    return lines
