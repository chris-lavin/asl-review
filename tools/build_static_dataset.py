#!/usr/bin/env python3
"""Build a GitHub Pages-friendly static dataset for the ASL review app.

Outputs:
- public/lessons.json          lesson -> raw vocabulary items
- public/words.json            deduplicated word cards with precomputed media
- public/build-report.json     unresolved/suspicious entries for manual review

Optional inputs:
- config/media-overrides.json  manual media selection by source URL or term
- config/term-aliases.json     canonical term remapping
"""

from __future__ import annotations

import html as ihtml
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / 'public'
CONFIG_DIR = ROOT / 'config'
LESSONS_OUT = PUBLIC_DIR / 'lessons.json'
WORDS_OUT = PUBLIC_DIR / 'words.json'
REPORT_OUT = PUBLIC_DIR / 'build-report.json'

BASE = 'https://www.lifeprint.com/asl101/lessons/'
HEADERS = {'User-Agent': 'Mozilla/5.0 (ASL Review Static Builder)'}
STOP_PATTERNS = [
    r'Practice Sheet',
    r'Story\s*\d',
    r'Discussion:',
    r'Notes and discussion:',
    r'Response Vocabulary',
]
GENERIC_CONTEXT_VIDEO_IDS = {'q6LuW4Sp_XM'}
VIDEO_CONTEXT_WINDOW = 260
EXAMPLE_VIDEO_PATTERNS = [
    r'sample sentence',
    r'\bexample\s*:',
    r'\bgloss\b',
    r'\byou-[a-z]',
    r'\bhe-[a-z]',
    r'\bshe-[a-z]',
    r'\bthey-[a-z]',
    r'\bi-[a-z]',
    r'\bme-[a-z]',
    r'\bhim-[a-z]',
    r'\bher-[a-z]',
    r'\bdirectional\b',
    r'\b(?:are|do|does|did|will|would|can|could|should|is|was|were|why|what|when|where|who|how)\b[^.]{0,100}\?',
    r'=\s*["“][^"”]{0,100}\?',
]


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


MEDIA_OVERRIDES = load_json(CONFIG_DIR / 'media-overrides.json', {'byUrl': {}, 'byTerm': {}})
TERM_ALIASES = load_json(CONFIG_DIR / 'term-aliases.json', {})
SOURCE_PREFERENCES = load_json(CONFIG_DIR / 'source-preferences.json', {})

session = requests.Session()
session.headers.update(HEADERS)
html_cache: dict[str, str] = {}
binary_cache: dict[str, bytes] = {}
media_cache: dict[str, dict[str, Any] | None] = {}


def fetch_text(url: str) -> str:
    if url not in html_cache:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        html_cache[url] = response.text
    return html_cache[url]


def clean_text(text: str) -> str:
    text = ihtml.unescape(text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'</p\s*>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip(' -:\n\t')
    return text


def fetch_bytes(url: str) -> bytes:
    if url not in binary_cache:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        binary_cache[url] = response.content
    return binary_cache[url]


def gif_frame_count(url: str) -> int:
    try:
        data = fetch_bytes(url)
    except requests.RequestException:
        return 0
    return data.count(b'\x21\xF9\x04')


def keep_href(href: str) -> bool:
    return any(part in href for part in ['/pages-signs/', '/pages-layout/'])


def canonicalize_term(term: str) -> str:
    normalized = re.sub(r'\s+', ' ', term).strip(' -')
    return TERM_ALIASES.get(normalized, normalized)


def extract_lessons() -> list[dict[str, Any]]:
    all_lessons = []
    for lesson_number in range(1, 46):
        url = f'{BASE}lesson{lesson_number:02d}.htm'
        html = fetch_text(url)
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

            normalized = canonicalize_term(term)
            if SOURCE_PREFERENCES.get(normalized, '__missing__') is None:
                continue
            key = normalized.lower()
            if key in seen_terms:
                continue
            seen_terms.add(key)
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
    return all_lessons


def extract_media_from_html(term: str, html: str, base_url: str) -> dict[str, Any] | None:
    gif_matches = [
        urljoin(base_url, match.group(1))
        for match in re.finditer(r'<img[^>]+src=["\']([^"\']+\.gif[^"\']*)["\'][^>]*>', html, re.I)
    ]
    gif_matches = [src for src in gif_matches if '/images-layout/back.gif' not in src]

    animated_gif_matches = [src for src in gif_matches if gif_frame_count(src) > 1]
    preferred_gif = next((src for src in animated_gif_matches if re.search(r'/gifs(?:-animated)?/', src, re.I)), None)
    if not preferred_gif:
        preferred_gif = next((src for src in animated_gif_matches if re.search(r'/(gifs|images-signs)/', src, re.I)), None)
    if not preferred_gif:
        preferred_gif = next((src for src in gif_matches if re.search(r'/gifs(?:-animated)?/', src, re.I)), None)
    if not preferred_gif:
        preferred_gif = next((src for src in gif_matches if re.search(r'/(gifs|images-signs)/', src, re.I)), None)
    if not preferred_gif and gif_matches:
        preferred_gif = gif_matches[0]

    iframe_matches = []
    for match in re.finditer(r'<iframe[^>]+src=["\'](https://www\.youtube\.com/embed/[^"\']+)["\'][^>]*>', html, re.I):
        src = match.group(1).replace('/embed//', '/embed/')
        before_start = max(0, match.start() - VIDEO_CONTEXT_WINDOW)
        after_end = min(len(html), match.end() + VIDEO_CONTEXT_WINDOW)
        before_context = clean_text(html[before_start:match.start()]).lower()
        after_context = clean_text(html[match.end():after_end]).lower()
        iframe_matches.append({'src': src, 'beforeContext': before_context, 'afterContext': after_context})

    normalized_term = re.sub(r'\s+', ' ', term).strip()
    term_label_pattern = re.compile(rf'\b{re.escape(normalized_term)}\s*[:.]?\s*$', re.I)

    demo_video = None
    fallback_video = None
    contextual_video = None
    for item in iframe_matches:
        src = item['src']
        before_context = item['beforeContext']
        recent_before_context = before_context[-80:]
        vid = src.split('/embed/')[-1].split('?')[0]
        if vid in GENERIC_CONTEXT_VIDEO_IDS:
            if fallback_video is None:
                fallback_video = src
            continue
        if term_label_pattern.search(recent_before_context):
            if demo_video is None:
                demo_video = src
            continue
        if any(re.search(pattern, before_context, re.I) for pattern in EXAMPLE_VIDEO_PATTERNS):
            if contextual_video is None:
                contextual_video = src
            continue
        if demo_video is None:
            demo_video = src

    if demo_video:
        return {'type': 'video', 'url': demo_video, 'quality': 'demo'}
    if preferred_gif:
        return {'type': 'gif', 'url': preferred_gif, 'quality': 'gif'}
    if contextual_video:
        return {'type': 'video', 'url': contextual_video, 'quality': 'fallback'}
    if fallback_video:
        return {'type': 'video', 'url': fallback_video, 'quality': 'fallback'}
    return None


def related_sign_links(html: str, base_url: str) -> list[str]:
    links = []
    for match in re.finditer(r'<a [^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.I | re.S):
        url = urljoin(base_url, match.group(1))
        if '/pages-signs/' not in url:
            continue
        if '/pages-signs/lessons/' in url:
            continue
        if url not in links:
            links.append(url)
    return links


def get_override(term: str, url: str) -> dict[str, Any] | None:
    by_url = MEDIA_OVERRIDES.get('byUrl', {})
    by_term = MEDIA_OVERRIDES.get('byTerm', {})
    if url in by_url:
        return by_url[url]
    if term in by_term:
        return by_term[term]
    return None


def resolve_media(term: str, url: str, depth: int = 0, seen: set[str] | None = None) -> dict[str, Any] | None:
    seen = seen or set()
    if url in seen or depth > 2:
        return None
    if depth == 0 and url in media_cache:
        return media_cache[url]
    seen.add(url)

    override = get_override(term, url)
    if override:
        result = {**override, 'sourceUrl': url, 'selectedFrom': 'override'}
        if depth == 0:
            media_cache[url] = result
        return result

    try:
        html = fetch_text(url)
    except requests.RequestException:
        return None
    direct = extract_media_from_html(term, html, url)
    if direct and direct.get('quality') == 'demo':
        result = {**direct, 'sourceUrl': url, 'selectedFrom': 'direct'}
        if depth == 0:
            media_cache[url] = result
        return result

    for related_url in related_sign_links(html, url):
        related_media = resolve_media(term, related_url, depth + 1, seen)
        if related_media and related_media.get('quality') == 'demo':
            return {**related_media, 'selectedFrom': 'related-demo'}

    if direct and direct.get('quality') == 'gif':
        result = {**direct, 'sourceUrl': url, 'selectedFrom': 'direct'}
        if depth == 0:
            media_cache[url] = result
        return result

    for related_url in related_sign_links(html, url):
        related_media = resolve_media(term, related_url, depth + 1, seen)
        if related_media and related_media.get('quality') == 'gif':
            return {**related_media, 'selectedFrom': 'related-gif'}

    if direct:
        result = {**direct, 'sourceUrl': url, 'selectedFrom': 'direct'}
        if depth == 0:
            media_cache[url] = result
        return result

    if depth == 0:
        media_cache[url] = None
    return None


def media_score(media: dict[str, Any] | None) -> tuple[int, int]:
    if not media:
        return (0, 0)
    quality = media.get('quality')
    type_score = 1 if media.get('type') == 'video' else 0
    if quality == 'demo':
        return (4, type_score)
    if quality == 'gif':
        return (3, type_score)
    if quality == 'fallback':
        return (2, type_score)
    return (1, type_score)


def choose_best_source(term: str, source_urls: list[str]) -> tuple[str, dict[str, Any] | None]:
    preferred = SOURCE_PREFERENCES.get(term)
    if preferred:
        media = resolve_media(term, preferred)
        if media is not None or preferred in source_urls:
            return preferred, media

    candidates = []
    for url in source_urls:
        media = resolve_media(term, url)
        candidates.append((media_score(media), url, media))
    candidates.sort(key=lambda item: (item[0][0], item[0][1], -len(item[1])), reverse=True)
    _, best_url, best_media = candidates[0]
    return best_url, best_media


def build_words(lessons: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    report: dict[str, Any] = {
        'missingMedia': [],
        'fallbackMedia': [],
        'duplicateTerms': [],
        'buildStats': {},
    }

    duplicates = defaultdict(set)
    for lesson in lessons:
        for item in lesson['items']:
            key = item['term'].lower()
            duplicates[key].add(item['url'])
            entry = grouped.setdefault(
                key,
                {
                    'term': item['term'],
                    'sourceUrl': item['url'],
                    'sourceUrls': [],
                    'lessons': [],
                },
            )
            if item['url'] not in entry['sourceUrls']:
                entry['sourceUrls'].append(item['url'])
            if lesson['lesson'] not in entry['lessons']:
                entry['lessons'].append(lesson['lesson'])

    for key, urls in duplicates.items():
        term = grouped[key]['term']
        if len(urls) > 1 and term not in SOURCE_PREFERENCES:
            report['duplicateTerms'].append({'term': term, 'urls': sorted(urls)})

    words = []
    for idx, (key, entry) in enumerate(sorted(grouped.items(), key=lambda kv: (min(kv[1]['lessons']), kv[1]['term'])), start=1):
        if idx % 100 == 0:
            print(f'Processed {idx}/{len(grouped)} words...')
        best_url, media = choose_best_source(entry['term'], entry['sourceUrls'])
        record = {
            'id': key,
            'term': entry['term'],
            'lessons': sorted(entry['lessons']),
            'sourceUrl': best_url,
            'sourceUrls': sorted(entry['sourceUrls']),
            'media': media,
        }
        if media is None:
            report['missingMedia'].append({'term': entry['term'], 'sourceUrl': entry['sourceUrl']})
        elif media.get('quality') == 'fallback':
            report['fallbackMedia'].append({'term': entry['term'], 'sourceUrl': entry['sourceUrl'], 'media': media})
        words.append(record)

    report['buildStats'] = {
        'lessonCount': len(lessons),
        'wordCount': len(words),
        'missingMediaCount': len(report['missingMedia']),
        'fallbackMediaCount': len(report['fallbackMedia']),
        'duplicateTermCount': len(report['duplicateTerms']),
    }
    return words, report


def main() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    lessons = extract_lessons()
    words, report = build_words(lessons)

    LESSONS_OUT.write_text(json.dumps(lessons, indent=2), encoding='utf-8')
    WORDS_OUT.write_text(json.dumps(words, indent=2), encoding='utf-8')
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding='utf-8')

    print(f'Wrote {LESSONS_OUT}')
    print(f'Wrote {WORDS_OUT}')
    print(f'Wrote {REPORT_OUT}')
    print(json.dumps(report['buildStats'], indent=2))


if __name__ == '__main__':
    main()
