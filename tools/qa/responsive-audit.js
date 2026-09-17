#!/usr/bin/env node
/* ---------------------------------------------------------------
 * Responsive audit.
 *
 * Loads every page at every viewport in the matrix below and reports
 * horizontal overflow and JavaScript errors. This is what catches the
 * failures that "it looks fine on my laptop" does not.
 *
 *   npm i -D playwright        # once
 *   python3 -m http.server 8123 &
 *   node tools/qa/responsive-audit.js
 *
 * Optional: pass a base URL as the first argument to audit a deployed
 * site instead of localhost.
 * --------------------------------------------------------------- */
'use strict';

const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8123';

// Every English page the build actually produced, read out of sitemap.xml so
// this list cannot fall behind the site the way a hand-kept one does. 404 is
// deliberately absent from the sitemap and is added back by hand, because a
// not-found page that overflows on a phone is still a page someone sees.
const fs = require('fs');
const PAGES = (() => {
  const out = ['404'];
  if (!fs.existsSync('sitemap.xml')) return out;
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  const codes = fs.existsSync('tools/locales.json')
    ? JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales
        .filter(l => !l.root).map(l => l.code)
    : [];
  for (const m of xml.matchAll(/<loc>https:\/\/imortek\.com\.au\/([^<]*)<\/loc>/g)) {
    const path = m[1];
    if (codes.some(c => path === `${c}/` || path.startsWith(`${c}/`))) continue;
    const slug = path === '' ? 'index' : path.replace(/\.html$/, '');
    if (!out.includes(slug)) out.push(slug);
  }
  return out;
})();

// The same core pages again in every other language, read out of
// tools/locales.json so the audit cannot fall behind the builder. Arabic and
// Urdu are the ones worth the extra minutes: a mirrored layout has its own
// ways of overflowing, and nothing else in this repository would catch them.
const CORE = [
  'index', 'pbsd', 'cypha', 'chess', 'retdec', 'mathscript', 'aegis',
  'sentinel', 'cellai', 'trace', 'kickstarter', 'beta', 'research', 'licensing',
  'about', '404',
];
const LOCALES = fs.existsSync('tools/locales.json')
  ? JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales
      .filter(l => !l.root).map(l => l.code)
  : [];
for (const code of LOCALES) for (const slug of CORE) PAGES.push(`${code}/${slug}`);

const SIZES = [
  ['iPhone SE',        320,  568],
  ['Android',          360,  800],
  ['iPhone 13',        390,  844],
  ['iPhone Pro Max',   430,  932],
  ['iPad portrait',    768, 1024],
  ['iPad landscape',  1024,  768],
  ['Laptop',          1440,  900],
  ['Desktop',         1920, 1080],
  ['Ultrawide',       2560, 1440],
  ['Phone landscape',  844,  390],
];

(async () => {
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE lets a sandbox point at a preinstalled
  // browser instead of one downloaded into node_modules.
  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const problems = [];
  let checks = 0;

  for (const [label, width, height] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    // The webfont stylesheet is render-blocking, so a sandbox that cannot
    // reach fonts.googleapis.com stalls DOMContentLoaded by ~13s per page —
    // 77 minutes across the matrix. Fail those requests immediately: the
    // font never arrives either way, so this only removes the waiting, and
    // the layout under test is the fallback stack in both cases.
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

    for (const name of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      let overflow = 0;
      try {
        await page.goto(`${BASE}/${name}.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(280);
        overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
      } catch (e) {
        problems.push(`${name} @ ${label} ${width}x${height}: ${e.message.split('\n')[0]}`);
      }

      if (overflow > 2) {
        problems.push(`${name} @ ${label} ${width}x${height}: overflows by ${overflow}px`);
      }
      if (errors.length) {
        problems.push(`${name} @ ${label} ${width}x${height}: ${errors[0]}`);
      }
      checks++;
      await page.close();
    }
    console.log(`  ${label.padEnd(16)} ${checks} checks, ${problems.length} problem(s) so far`);
    await ctx.close();
  }

  await browser.close();

  console.log(`${checks} combinations checked — ${PAGES.length} pages x ${SIZES.length} viewports`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach(p => console.log('  ' + p));
    process.exit(1);
  }
  console.log('\nNo horizontal overflow and no page errors at any size.');
})();
