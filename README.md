# ASL Review

A lightweight ASL vocabulary review app based on Lifeprint lessons 1–45.

## Status

This app now supports a **static-data build pipeline** and a **GitHub Pages export path**.

That means:
- the frontend can run as a pure static site
- sign media is precomputed at build time
- no runtime server scraping is required for normal use

## Static build artifacts

Generated into `public/`:

- `lessons.json` — lesson-oriented vocabulary data
- `words.json` — deduplicated word cards with precomputed media and lesson appearances
- `build-report.json` — review report for missing/fallback media and suspicious duplicates

## Config / overrides

Optional manual override files:

- `config/media-overrides.json`
- `config/term-aliases.json`

Use these to lock down tricky words or canonicalize inconsistent terms.

## Build the dataset

From the workspace root:

```bash
python3 asl-review/tools/build_static_dataset.py
```

## Export a static site

From the workspace root:

```bash
python3 asl-review/tools/export_static_site.py
```

This creates a publishable static site in:

```bash
asl-review/docs/
```

## Run locally

From the workspace root:

```bash
cd asl-review
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages publishing

A GitHub Actions workflow is included at:

```bash
asl-review/.github/workflows/pages.yml
```

It will:
1. build the static dataset
2. export the static site to `asl-review/docs/`
3. deploy that artifact to GitHub Pages

### Expected repo setup

When this project is pushed to GitHub:
- enable **GitHub Pages** in the repository settings if needed
- allow GitHub Actions to deploy Pages
- push to `main` or `master`

## Media selection policy

Precomputed media order:

1. demonstration video of the sign
2. animated GIF of the sign
3. fallback context/story video

The builder also follows related sign pages when needed.

## Notes

- User progress is still stored in browser local storage.
- `public/build-report.json` is the main review artifact for cleanup.
- The generated dataset currently includes a small number of missing-media and fallback-media entries that can be improved over time via overrides.
