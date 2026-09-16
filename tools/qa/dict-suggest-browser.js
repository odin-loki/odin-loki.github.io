#!/usr/bin/env node
/* Does "did you mean" reach the reader?
 *
 * dict-suggest-test.js checks the algorithm against the real shards in
 * node. This checks the other half: that the popup renders the near
 * words, that they are buttons a reader can press, and that pressing
 * one replaces the popup with that word's definition.
 *
 *   python3 -m http.server 8123 &
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/qa/dict-suggest-browser.js
 */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8123';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(BASE + '/cypha.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.ImortekDict, null, { timeout: 15000 });

  // Drive the same path a double-click takes: select a word inside a
  // paragraph and dispatch dblclick on it.
  const shown = await page.evaluate(async () => {
    const host = document.querySelector('main p');
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(host);
    sel.removeAllRanges(); sel.addRange(r);
    // The handler reads the selection, so stub it to a misspelling.
    const real = window.getSelection;
    window.getSelection = () => ({ toString: () => 'algorithim' });
    host.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    window.getSelection = real;
    for (let i = 0; i < 100; i++) {
      await new Promise(r2 => setTimeout(r2, 50));
      const pop = document.querySelector('.gloss__pop.is-dict');
      if (pop && pop.querySelector('.gloss__near-btn'))
        return { text: pop.textContent,
                 words: [...pop.querySelectorAll('.gloss__near-btn')].map(b => b.textContent) };
    }
    const pop = document.querySelector('.gloss__pop.is-dict');
    return { text: pop ? pop.textContent : '(no popup)', words: [] };
  });

  let fail = 0;
  const has = shown.words.includes('algorithm');
  if (!has) fail++;
  console.log(`  ${has ? 'ok  ' : 'FAIL'}  misspelling offers the word meant  -> ${
    shown.words.join(', ') || '(none)'}`);

  // Press the first suggestion; the popup should become that definition.
  const after = await page.evaluate(async () => {
    const b = document.querySelector('.gloss__near-btn');
    if (!b) return '(no button)';
    b.click();
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 50));
      const pop = document.querySelector('.gloss__pop.is-dict');
      if (pop && /WordNet/.test(pop.textContent)) return pop.textContent;
    }
    const pop = document.querySelector('.gloss__pop.is-dict');
    return pop ? pop.textContent : '(gone)';
  });
  const resolved = /WordNet/.test(after) && /algorithm/i.test(after);
  if (!resolved) fail++;
  console.log(`  ${resolved ? 'ok  ' : 'FAIL'}  pressing one looks that word up   -> ${
    after.replace(/\s+/g, ' ').slice(0, 90)}`);

  if (errors.length) { fail++; console.log('  FAIL  page errors:', errors.join(' | ')); }
  else console.log('  ok    no page errors');

  await browser.close();
  console.log(fail ? `\nFAILED (${fail})` : '\nall checks passed');
  process.exit(fail ? 1 : 0);
})();
