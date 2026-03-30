# ASL Review

A lightweight ASL vocabulary review app based on Lifeprint lessons 1–45.

## Current status

The app now supports a **static-data build pipeline** so it can be published to static hosts such as:

- GitHub Pages
- Cloudflare Pages
- Netlify
- any simple static file host

At runtime, the frontend reads prebuilt JSON files and no longer needs server-side media scraping.

## Static build artifacts

Generated into `public/`:

- `lessons.json` — lesson-oriented vocabulary data
- `words.json` — deduplicated word cards with precomputed media and lesson appearances
- `build-report.json` — review report for missing/fallback media and suspicious duplicates

## Build the static dataset

From the workspace root:

```bash
python3 asl-review/tools/build_static_dataset.py
```

Optional override/config files:

- `asl-review/config/media-overrides.json`
- `asl-review/config/term-aliases.json`

## Run locally

From the workspace root:

```bash
cd asl-review
python3 -m http.server 8000
```

Then open:

http://localhost:8000

## Publish to GitHub Pages

The app is static after the dataset is generated. A simple publish flow is:

1. Run the static build script
2. Commit the generated `public/*.json` files
3. Publish the `asl-review/` directory with your preferred static hosting workflow

For GitHub Pages specifically, you can publish either:

- the repository root if you move/copy the app there, or
- a `docs/` export, or
- a dedicated Pages branch

## Media selection policy

Precomputed media order:

1. demonstration video of the sign
2. animated GIF of the sign
3. fallback context/story video

The builder also follows related sign pages when necessary.

## Notes

- User progress is still stored in browser local storage.
- `build-report.json` helps identify terms that may need manual overrides.
