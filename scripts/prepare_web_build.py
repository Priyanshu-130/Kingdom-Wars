from __future__ import annotations

import re
from pathlib import Path


INDEX = Path("build/web/index.html")
BROWSERFS_SCRIPT = (
    '<script src="https://cdn.jsdelivr.net/npm/browserfs@1.4.3/dist/browserfs.min.js">'
    "</script>"
)
PYGBAG_BROWSERFS = re.compile(
    r'<script src="https://pygame-web\.github\.io/cdn/[^"]*/browserfs\.min\.js"></script>'
)


def main() -> None:
    if not INDEX.is_file():
        raise FileNotFoundError(f"Pygbag build output is missing: {INDEX}")
    html = INDEX.read_text(encoding="utf-8")
    html, replacements = PYGBAG_BROWSERFS.subn(BROWSERFS_SCRIPT, html)
    if replacements != 1:
        raise RuntimeError(
            f"Expected one Pygbag BrowserFS script reference, found {replacements}."
        )
    INDEX.write_text(html, encoding="utf-8")
    print(f"Patched BrowserFS CDN in {INDEX}.")


if __name__ == "__main__":
    main()
