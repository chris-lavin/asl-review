#!/usr/bin/env python3
"""Export the ASL review app to a GitHub Pages-friendly docs/ directory."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
PUBLIC = ROOT / 'public'

FILES = [
    'index.html',
    'app.js',
    'styles.css',
    'README.md',
]


def main() -> None:
    if DOCS.exists():
        shutil.rmtree(DOCS)
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / 'public').mkdir(parents=True, exist_ok=True)

    for name in FILES:
        shutil.copy2(ROOT / name, DOCS / name)

    for name in ['lessons.json', 'words.json', 'build-report.json']:
        shutil.copy2(PUBLIC / name, DOCS / 'public' / name)

    (DOCS / '.nojekyll').write_text('', encoding='utf-8')
    print(f'Exported static site to {DOCS}')


if __name__ == '__main__':
    main()
