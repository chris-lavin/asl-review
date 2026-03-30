#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = '/home/dad/.openclaw/workspace/asl-review';
const publicWords = JSON.parse(fs.readFileSync(path.join(root, 'public/words.json'), 'utf8'));
const overrides = JSON.parse(fs.readFileSync(path.join(root, 'config/media-overrides.json'), 'utf8'));
const tests = JSON.parse(fs.readFileSync(path.join(root, 'config/media-selection-tests.json'), 'utf8'));

const outDir = path.join(root, 'audit');
fs.mkdirSync(outDir, { recursive: true });

const testedTerms = new Set(tests.cases.map((c) => c.term.toLowerCase()));
const overrideTerms = new Set(Object.keys(overrides.byTerm || {}).map((t) => t.toLowerCase()));
const htmlCache = new Map();

function fetchText(url) {
  return new Promise((resolve, reject) => {
    if (htmlCache.has(url)) return resolve(htmlCache.get(url));
    https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        htmlCache.set(url, data);
        resolve(data);
      });
    }).on('error', reject);
  });
}

function clean(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelTail(before) {
  const tail = clean(before).slice(-160);
  return tail;
}

function scoreWord(word, html) {
  const issues = [];
  let score = 0;
  const media = word.media || {};
  const lowerTerm = word.term.toLowerCase();
  const sourceUrl = word.sourceUrl || '';
  const selectedUrl = media.url || '';

  if (overrideTerms.has(lowerTerm)) {
    issues.push('manual_override');
    score += 1;
  }
  if (testedTerms.has(lowerTerm)) {
    issues.push('covered_by_regression');
    score += 1;
  }
  if (media.selectedFrom && media.selectedFrom.startsWith('related-')) {
    issues.push('related_media');
    score += 8;
  }
  if (media.quality === 'fallback') {
    issues.push('fallback_media');
    score += 8;
  }
  if (!word.media) {
    issues.push('missing_media');
    score += 10;
  }
  if (media.type === 'gif' && /youtube|\.mp4/i.test(html)) {
    issues.push('gif_despite_video_candidate');
    score += 5;
  }
  if (media.type === 'video' && /\.gif/i.test(html)) {
    issues.push('video_despite_gif_candidate');
    score += 3;
  }
  if (media.type === 'video' && /sample sentence|\?|gloss|you like|do you|how many/i.test(selectedUrl + ' ' + html)) {
    // kept loose on purpose; this is only suspicion scoring
    score += 1;
  }
  if (media.type === 'video' && /q6LuW4Sp_XM/.test(selectedUrl)) {
    issues.push('generic_fallback_video');
    score += 10;
  }
  if (media.type === 'video' && /you-|how-many|wish-yourself|food-|tomorrow-|equal-one-day|carry-vet/i.test(selectedUrl)) {
    issues.push('sentence_like_video_filename');
    score += 8;
  }
  if (sourceUrl !== (media.sourceUrl || sourceUrl)) {
    issues.push('selected_media_from_different_source');
    score += 6;
  }
  if (/pages-signs\/20\//.test(sourceUrl) || /\?$/.test(word.term)) {
    issues.push('looks_like_sentence_entry');
    score += 8;
  }

  const youtubeCandidates = [];
  for (const match of html.matchAll(/<iframe[^>]+src=["'](https:\/\/www\.youtube\.com\/embed\/[^"']+)["'][^>]*>/ig)) {
    const before = html.slice(Math.max(0, match.index - 220), match.index);
    youtubeCandidates.push({ url: match[1].replace('/embed//', '/embed/'), context: labelTail(before) });
  }
  const html5Candidates = [];
  for (const match of html.matchAll(/<video[^>]+src=["']([^"']+)["'][^>]*>/ig)) {
    const before = html.slice(Math.max(0, match.index - 220), match.index);
    html5Candidates.push({ url: new URL(match[1], sourceUrl).toString(), context: labelTail(before) });
  }
  const gifCandidates = [];
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+\.gif[^"']*)["'][^>]*>/ig)) {
    const src = new URL(match[1], sourceUrl).toString();
    if (src.includes('/images-layout/back.gif')) continue;
    const before = html.slice(Math.max(0, match.index - 220), match.index);
    gifCandidates.push({ url: src, context: labelTail(before) });
  }
  const imageSequenceCandidates = [];
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png)[^"']*)["'][^>]*>/ig)) {
    const src = new URL(match[1], sourceUrl).toString();
    if (src.includes('/images-layout/')) continue;
    imageSequenceCandidates.push(src);
  }

  if (media.type === 'video' && youtubeCandidates.length > 1) {
    issues.push('multiple_video_candidates');
    score += 4;
  }
  if (media.type === 'gif' && gifCandidates.length > 1) {
    issues.push('multiple_gif_candidates');
    score += 2;
  }
  if (!media.type && imageSequenceCandidates.length >= 2) {
    issues.push('has_image_sequence_but_no_media');
    score += 9;
  }
  if (media.type === 'video') {
    const pickedContext = [...youtubeCandidates, ...html5Candidates].find((c) => c.url === selectedUrl)?.context || '';
    if (/sample sentence|do you|how many|you like|\?$|gloss/i.test(pickedContext)) {
      issues.push('selected_video_has_sentence_context');
      score += 8;
    }
  }

  return {
    term: word.term,
    sourceUrl,
    media,
    suspicionScore: score,
    issues: [...new Set(issues)],
    candidates: {
      youtube: youtubeCandidates,
      html5: html5Candidates,
      gifs: gifCandidates,
      imageSequenceCount: imageSequenceCandidates.length,
      firstImageSequenceUrls: imageSequenceCandidates.slice(0, 6),
    },
  };
}

(async () => {
  const results = [];
  for (const word of publicWords) {
    try {
      const html = await fetchText(word.sourceUrl);
      results.push(scoreWord(word, html));
    } catch (error) {
      results.push({
        term: word.term,
        sourceUrl: word.sourceUrl,
        media: word.media,
        suspicionScore: 100,
        issues: ['fetch_failed'],
        error: String(error),
        candidates: { youtube: [], html5: [], gifs: [], imageSequenceCount: 0, firstImageSequenceUrls: [] },
      });
    }
  }

  results.sort((a, b) => b.suspicionScore - a.suspicionScore || a.term.localeCompare(b.term));
  fs.writeFileSync(path.join(outDir, 'media-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const top = results.slice(0, 100).map((r) => ({
    term: r.term,
    suspicionScore: r.suspicionScore,
    issues: r.issues.join(','),
    mediaType: r.media?.type || '',
    mediaUrl: r.media?.url || (r.media?.urls ? '[image-sequence]' : ''),
    sourceUrl: r.sourceUrl,
  }));
  const csv = ['term,suspicionScore,issues,mediaType,mediaUrl,sourceUrl']
    .concat(top.map((row) => [row.term, row.suspicionScore, row.issues, row.mediaType, row.mediaUrl, row.sourceUrl].map((v) => JSON.stringify(v ?? '')).join(',')))
    .join('\n');
  fs.writeFileSync(path.join(outDir, 'media-audit-top100.csv'), csv);

  console.log(`Wrote ${path.join(outDir, 'media-audit.json')}`);
  console.log(`Wrote ${path.join(outDir, 'media-audit-top100.csv')}`);
  console.log('\nTop 20 suspicious selections:');
  for (const row of top.slice(0, 20)) {
    console.log(`- ${row.term} [${row.suspicionScore}] ${row.issues}`);
  }
})();
