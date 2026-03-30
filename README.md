# ASL Review

A lightweight local web app for reviewing vocabulary from Lifeprint lessons 1–18.

## What it does

- Loads lesson vocabulary from Lifeprint lesson pages 1–18
- Lets you study a single lesson or all lessons together
- Supports search, shuffle, and hiding words you already know
- Stores your "known" progress in local browser storage
- Links each card back to the Lifeprint reference page

## Run it

From the workspace root:

```bash
cd asl-review
python3 -m http.server 8000
```

Then open:

- http://localhost:8000

## Notes

- The vocabulary dataset is scraped automatically from the lesson pages and may include a few extra glossary-style related terms from Lifeprint.
- Your progress is stored only in the browser you use.

## Files

- `index.html` — app shell
- `styles.css` — styling
- `app.js` — app logic
- `public/lessons.json` — lesson vocabulary data
