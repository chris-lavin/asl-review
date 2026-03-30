#!/usr/bin/env python3
"""Rebuild the lesson vocabulary dataset from Lifeprint lessons 1–18."""

import html as ihtml
import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests

BASE = 'https://www.lifeprint.com/asl101/lessons/'
HEADERS = {'User-Agent': 'Mozilla/5.0'}
OUT = Path(__file__).resolve().parent.parent / 'public' / 'lessons.json'
STOP_PATTERNS = [
    r'Practice Sheet',
    r'Story\s*\d',
    r'Discussion:',
    r'Notes and discussion:',
    r'Response Vocabulary',
]


def clean_text(text: str) -> str:
    text = ihtml.unescape(text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'</p\s*>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip(' -:\n\t')
    return text


def keep_href(href: str) -> bool:
    return any(part in href for part in ['/pages-signs/', '/pages-layout/'])


all_lessons = []
for lesson_number in range(1, 19):
    url = f'{BASE}lesson{lesson_number:02d}.htm'
    html = requests.get(url, headers=HEADERS, timeout=30).text
    match = re.search(r'<b>\s*Vocabulary\s*</b>\s*:?(.*)', html, re.I | re.S)
    if not match:
        match = re.search(r'Vocabulary\s*:?(.{0,50000})', html, re.I | re.S)
    if not match:
        raise RuntimeError(f'Could not find vocabulary block for lesson {lesson_number}')

    chunk = match.group(1)
    end = len(chunk)
    for pattern in STOP_PATTERNS:
        stop_match = re.search(pattern, chunk, re.I | re.S)
        if stop_match:
            end = min(end, stop_match.start())
    chunk = chunk[:end]

    items = []
    seen_terms = set()
    for anchor in re.finditer(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', chunk, re.I | re.S):
        href = urljoin(url, anchor.group(1))
        if not keep_href(href):
            continue

        term = clean_text(anchor.group(2))
        if not term or len(term) > 60:
            continue
        if term.lower() in {'vocabulary', 'review', 'also see', 'l01'}:
            continue
        if '[' in term or ']' in term:
            continue
        if term.count(' ') > 3:
            continue
        if term.lower().startswith('read the '):
            continue
        if re.search(r'^(lesson|story|practice|quiz)\b', term, re.I):
            continue

        normalized = re.sub(r'\s+', ' ', term).strip(' -')
        if normalized.lower() in seen_terms:
            continue
        seen_terms.add(normalized.lower())
        items.append({'term': normalized, 'url': href})

    all_lessons.append(
        {
            'lesson': lesson_number,
            'title': f'Lesson {lesson_number}',
            'source': url,
            'items': items,
            'count': len(items),
        }
    )

OUT.write_text(json.dumps(all_lessons, indent=2), encoding='utf-8')
print(f'Wrote {OUT} with {len(all_lessons)} lessons.')
