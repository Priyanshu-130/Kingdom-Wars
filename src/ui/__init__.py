from typing import TYPE_CHECKING

__all__ = ["KingdomWarsApp"]

if TYPE_CHECKING:
    from .app_ui import KingdomWarsApp


def __getattr__(name: str):
    if name != "KingdomWarsApp":
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from .app_ui import KingdomWarsApp

    globals()[name] = KingdomWarsApp
    return KingdomWarsApp
