#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = '/home/dad/.openclaw/workspace/asl-review';
const tests = JSON.parse(fs.readFileSync(path.join(root, 'config/media-selection-tests.json'), 'utf8')).cases;
const words = JSON.parse(fs.readFileSync(path.join(root, 'public/words.json'), 'utf8'));

let failures = 0;
for (const test of tests) {
  const word = words.find((w) => w.term === test.term);
  if (test.expect.absent) {
    if (word) {
      console.log(`FAIL ${test.term}: expected absent, but found term`);
      failures += 1;
    } else {
      console.log(`PASS ${test.term}: absent as expected`);
    }
    continue;
  }
  if (!word) {
    console.log(`FAIL ${test.term}: term not found`);
    failures += 1;
    continue;
  }
  const media = word.media || {};
  if (test.expect.type && media.type !== test.expect.type) {
    console.log(`FAIL ${test.term}: expected type=${test.expect.type}, got ${media.type || 'null'}`);
    failures += 1;
    continue;
  }
  if (test.expect.url && media.url !== test.expect.url) {
    console.log(`FAIL ${test.term}: expected url=${test.expect.url}, got ${media.url || 'null'}`);
    failures += 1;
    continue;
  }
  for (const bad of test.rejectUrlContains || []) {
    if ((media.url || '').toLowerCase().includes(bad.toLowerCase())) {
      console.log(`FAIL ${test.term}: url contains forbidden text '${bad}' -> ${media.url}`);
      failures += 1;
      continue;
    }
  }
  console.log(`PASS ${test.term}: ${media.type || 'null'} ${media.url || '[no url]'}`);
}

if (failures) {
  console.log(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed.`);
