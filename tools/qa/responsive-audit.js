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

// Every page the builder emits. Regenerate with the slug list in
// tools/research_data.py if that changes.
const PAGES = [
  'index', 'pbsd', 'cypha', 'chess', 'retdec', 'mathscript', 'aegis',
  'sentinel', 'cellai', 'kickstarter', 'research', 'licensing', 'about',
  '404', 'research/aria-aead', 'research/compression', 'research/uhpm',
  'research/neural-decompiler', 'research/modelling-aes',
  'research/gf2-algebra', 'research/asset-tracking', 'research/filtering',
  'research/physics', 'research/carbide', 'research/economics',
  'research/fungal', 'research/nn-shortcuts', 'research/usg',
  'research/scheduler', 'research/ashby', 'research/vdj',
  'research/electromechanical', 'research/izaac-protocols', 'research/lcrp',
  'research/boolean-dimensions', 'research/veritas', 'research/primes',
  'research/qgo', 'research/ucdw', 'research/diamond-battery',
  'research/qdmp', 'research/hybrid-components', 'research/ausdike',
  'research/noise-generator', 'research/rngs', 'research/nqd',
  'research/math-survey', 'research/battle-sim', 'research/cpu',
  'research/future-cpp', 'research/pharma', 'research/hsa',
  'research/weapons-defence', 'research/weapons-police',
  'research/threat-assessments', 'research/ucn', 'research/ucn-ais',
  'research/un-reform', 'research/hemp-harmony', 'research/cocktails',
];

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
    for (const name of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(`${BASE}/${name}.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(280);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);

      if (overflow > 2) {
        problems.push(`${name} @ ${label} ${width}x${height}: overflows by ${overflow}px`);
      }
      if (errors.length) {
        problems.push(`${name} @ ${label} ${width}x${height}: ${errors[0]}`);
      }
      checks++;
      await page.close();
    }
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
