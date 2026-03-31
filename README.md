# ASL Review

A lightweight ASL vocabulary review app based on Lifeprint lessons 1–45.

## Status

This project is a standalone static site repo.

That means:
- the frontend runs as a pure static site
- sign media is precomputed at build time
- no runtime server scraping is required for normal use
- GitHub Pages should publish directly from the repository root

## Static build artifacts

Generated into `public/`:

- `lessons.json` — lesson-oriented vocabulary data
- `words.json` — deduplicated word cards with precomputed media and lesson appearances
- `build-report.json` — review report for missing/fallback media and suspicious duplicates

## Config / overrides

Optional manual override files:

- `config/media-overrides.json`
- `config/term-aliases.json`
- `config/source-preferences.json`

Use these to lock down tricky words, canonicalize inconsistent terms, or pin the preferred source page.

## Build the dataset

From the repo root:

```bash
python3 tools/build_static_dataset.py
```

## Run locally

From the repo root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages publishing

This repo is intended to publish as a branch-based GitHub Pages site from the **repository root**.

Expected repo setup:
- Pages source: **Deploy from a branch**
- Branch: `master`
- Folder: `/ (root)`

A root-level `.nojekyll` file is included so GitHub Pages serves the site as plain static files.

## Media selection policy

Precomputed media order:

1. demonstration video of the sign
2. animated GIF of the sign
3. image sequence
4. otherwise no inline media

## Notes

- User progress is stored in browser local storage.
- `public/build-report.json` is the main review artifact for cleanup.
- `docs/` is now only a local export artifact and is not required for GitHub Pages publishing.
