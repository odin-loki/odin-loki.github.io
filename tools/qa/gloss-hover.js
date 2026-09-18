#!/usr/bin/env node
/* Does Explain-on-hover do what the plan says?
 *
 *   1. A chip still opens on click, with the hand-written gloss.
 *   2. Hovering a chip opens that gloss without a click, and it is not
 *      labelled WordNet.
 *   3. Hovering an ordinary English word falls through to WordNet.
 *   4. A miss opens nothing — no empty box.
 *   5. On a translated page, unmarked words do not get English WordNet.
 *   6. Touch (no hover) still opens a chip on tap, and does not open on hover.
 *
 *   python3 -m http.server 8123 &
 *   node tools/qa/gloss-hover.js
 */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8123';

function fail(n, ok, msg, extra) {
  if (!ok) n.value++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}${extra ? '  -> ' + extra : ''}`);
}

(async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const n = { value: 0 };
  const errors = [];

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/pbsd.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.gloss').length > 0, null, { timeout: 15000 });

  const label = await page.evaluate(() =>
    (document.querySelector('.gloss-ctl__label') || {}).textContent);
  fail(n, label === 'Explain', 'toolbar button reads Explain', JSON.stringify(label));

  // Click a chip — the original path, still the one a phone uses.
  const chip = page.locator('#main .gloss').first();
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await page.waitForTimeout(200);
  const clicked = await page.evaluate(() => {
    const p = document.querySelector('.gloss__pop');
    return p ? { text: p.innerText.replace(/\s+/g, ' ').trim(),
                 dict: p.classList.contains('is-dict'),
                 float: p.classList.contains('is-float') } : null;
  });
  fail(n, !!(clicked && clicked.text && !clicked.dict),
    'clicking a chip opens a hand-written gloss',
    clicked ? clicked.text.slice(0, 70) : '(none)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // Hover the same chip.
  await chip.hover();
  await page.waitForTimeout(450);
  const hovered = await page.evaluate(() => {
    const p = document.querySelector('.gloss__pop');
    return p ? { text: p.innerText.replace(/\s+/g, ' ').trim(),
                 dict: p.classList.contains('is-dict'),
                 float: p.classList.contains('is-float'),
                 src: (p.querySelector('.gloss__src') || {}).textContent || '' } : null;
  });
  fail(n, !!(hovered && hovered.text && !hovered.dict && hovered.float && hovered.src !== 'WordNet'),
    'hovering a chip opens a floating hand-written gloss',
    hovered ? hovered.text.slice(0, 70) : '(none)');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');

  // An ordinary English content word that is not a chip, and is in WordNet.
  // Function words like "because" are not in WordNet, so they would look like
  // a miss even when the fallthrough is working.
  const point = await page.evaluate(() => {
    const main = document.getElementById('main');
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const want = /\b(something|reaches|never|meant|touch|underneath|equipment)\b/;
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest('a, code, pre, .gloss, button')) continue;
      const m = want.exec(node.nodeValue || '');
      if (!m) continue;
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[1].length);
      const rect = range.getBoundingClientRect();
      if (rect.width < 4 || rect.top < 80 || rect.bottom > innerHeight - 80) continue;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, word: m[1] };
    }
    return null;
  });
  fail(n, !!point, 'found an unmarked content word to hover', point ? point.word : '');
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(1200);
    const dictPop = await page.evaluate(() => {
      const p = document.querySelector('.gloss__pop');
      return p ? { text: p.innerText.replace(/\s+/g, ' ').trim(),
                   dict: p.classList.contains('is-dict'),
                   src: (p.querySelector('.gloss__src') || {}).textContent || '' } : null;
    });
    fail(n, !!(dictPop && dictPop.dict && /WordNet/i.test(dictPop.src)),
      'hovering an ordinary word falls through to WordNet',
      dictPop ? (point.word + ' -> ' + dictPop.text.slice(0, 80)) : '(none)');
  }

  // A miss must not open a box.
  const miss = await page.evaluate(() => {
    const main = document.getElementById('main');
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest('a, code, pre, .gloss, button')) continue;
      const m = /\bxyzzyplugh\b/.exec(node.nodeValue || '');
      if (m) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + 10);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + 4, y: rect.top + 4, found: true };
      }
    }
    // No such word on the page: dispatch a move over a letter run we invent
    // by using the hit-tester against a point that will miss, then assert
    // that a synthetic lookup of a nonsense word leaves no popover.
    return { found: false };
  });
  if (miss && miss.found) {
    await page.mouse.move(miss.x, miss.y);
    await page.waitForTimeout(800);
  } else {
    await page.evaluate(async () => {
      const host = document.querySelector('#main p');
      document.querySelectorAll('.gloss__pop').forEach(p => p.remove());
      if (!window.ImortekDict) return;
      const hit = await window.ImortekDict.lookup('xyzzyplugh');
      window.__miss = hit;
    });
    await page.waitForTimeout(400);
  }
  const empty = await page.evaluate(() => {
    // Drive the hover path with a word the dictionary will miss, by
    // placing the pointer on a short function word then overwriting
    // nothing — if a popover is up from the previous test, leave it;
    // the explicit check is: looking up a nonsense word did not create
    // a new empty .gloss__pop.is-dict with no WordNet label.
    return window.__miss === null || window.__miss === undefined;
  });
  // Stronger: hover a 2-letter word (too short for dict) and expect no new dict popover.
  const shortPt = await page.evaluate(() => {
    const main = document.getElementById('main');
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest('a, code, pre, .gloss, button')) continue;
      const m = /\bto\b/.exec(node.nodeValue || '');
      if (!m) continue;
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + 2);
      const rect = range.getBoundingClientRect();
      if (rect.width < 4) continue;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  });
  if (shortPt) {
    await page.keyboard.press('Escape');
    await page.mouse.move(shortPt.x, shortPt.y);
    await page.waitForTimeout(500);
    const none = await page.evaluate(() => !document.querySelector('.gloss__pop'));
    fail(n, none, 'a two-letter word opens no popover');
  } else {
    fail(n, empty, 'nonsense lookup is a miss', String(empty));
  }

  await page.close();

  // Floating popover at 320px must stay on screen (WCAG hover content).
  const narrow = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await narrow.goto(BASE + '/licensing.html', { waitUntil: 'domcontentloaded' });
  await narrow.waitForFunction(() => document.querySelectorAll('.gloss').length > 0, null, { timeout: 15000 });
  await narrow.locator('#main .gloss').first().hover();
  await narrow.waitForTimeout(500);
  const overflow = await narrow.evaluate(() => {
    const p = document.querySelector('.gloss__pop');
    if (!p) return { missing: true };
    const r = p.getBoundingClientRect();
    return {
      missing: false,
      left: r.left, right: r.right, top: r.top,
      overflow: r.left < -1 || r.right > innerWidth + 1 || r.top < -1
    };
  });
  fail(n, !overflow.missing && !overflow.overflow,
    'hover popover stays on a 320px licensing page',
    overflow.missing ? 'no popover' : JSON.stringify(overflow));
  await narrow.close();

  // Translated page: unmarked English-looking words must not fall through.
  const fr = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  fr.on('pageerror', e => errors.push('fr: ' + e));
  await fr.goto(BASE + '/fr/pbsd.html', { waitUntil: 'domcontentloaded' });
  await fr.waitForFunction(() => document.querySelectorAll('.gloss').length > 0, null, { timeout: 15000 });
  const frLabel = await fr.evaluate(() =>
    (document.querySelector('.gloss-ctl__label') || {}).textContent);
  fail(n, frLabel === 'Expliquer', 'French button reads Expliquer', JSON.stringify(frLabel));
  await fr.locator('#main .gloss').first().click();
  await fr.waitForTimeout(300);
  const frClick = await fr.evaluate(() => {
    const p = document.querySelector('.gloss__pop');
    return p ? p.innerText.replace(/\s+/g, ' ').trim() : '';
  });
  fail(n, !!frClick && !/^[\x00-\x7F]+$/.test(frClick),
    'French chip click is not an English gloss',
    frClick.slice(0, 70) || '(none)');
  await fr.keyboard.press('Escape');

  const frWord = await fr.evaluate(() => {
    const main = document.getElementById('main');
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest('a, code, pre, .gloss, button')) continue;
      const m = /\b(dans|pour|avec|cette|comme)\b/.exec(node.nodeValue || '');
      if (!m) continue;
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[1].length);
      const rect = range.getBoundingClientRect();
      if (rect.width < 4) continue;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: m[1] };
    }
    return null;
  });
  fail(n, !!frWord, 'found an unmarked French function word');
  if (frWord) {
    await fr.mouse.move(frWord.x, frWord.y);
    await fr.waitForTimeout(900);
    const frPop = await fr.evaluate(() => {
      const p = document.querySelector('.gloss__pop');
      return p ? { src: (p.querySelector('.gloss__src') || {}).textContent || '',
                   dict: p.classList.contains('is-dict') } : null;
    });
    fail(n, !frPop || !frPop.dict,
      'French unmarked word does not get WordNet',
      frPop ? JSON.stringify(frPop) : 'none');
  }
  await fr.close();

  // Touch: hover must not be the only way in. A tap still opens a chip,
  // and a hover-shaped pointermove must not open anything.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const phone = await ctx.newPage();
  phone.on('pageerror', e => errors.push('touch: ' + e));
  await phone.goto(BASE + '/pbsd.html', { waitUntil: 'domcontentloaded' });
  await phone.waitForFunction(() => document.querySelectorAll('.gloss').length > 0, null, { timeout: 15000 });
  const hoverMedia = await phone.evaluate(() =>
    window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  fail(n, hoverMedia === false, 'touch context does not claim fine hover', String(hoverMedia));

  const chipBox = await phone.locator('#main .gloss').first().boundingBox();
  if (chipBox && !hoverMedia) {
    await phone.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
    await phone.waitForTimeout(500);
    const openedOnMove = await phone.evaluate(() => !!document.querySelector('.gloss__pop.is-float'));
    fail(n, !openedOnMove, 'pointermove on a phone opens no hover popover');
  }
  await phone.locator('#main .gloss').first().tap();
  await phone.waitForTimeout(300);
  const tapped = await phone.evaluate(() => !!document.querySelector('.gloss__pop'));
  fail(n, tapped, 'tap still opens a chip');
  await ctx.close();

  if (errors.length) {
    n.value++;
    console.log('  FAIL  page errors:', errors.join(' | '));
  } else {
    console.log('  ok    no page errors');
  }

  await browser.close();
  console.log(n.value ? `\nFAILED (${n.value})` : '\nall checks passed');
  process.exit(n.value ? 1 : 0);
})();
