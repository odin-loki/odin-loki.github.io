#!/usr/bin/env node
/* Does the plain-English layer ever mark half a word?
 *
 * The matcher guards its aliases with a word boundary, and for a long time
 * that boundary was [^\w-] — JavaScript's \w, which is [A-Za-z0-9_] whatever
 * flags you pass it. In Urdu, Arabic, Hindi, Bengali and Russian every letter
 * satisfies [^\w-], so the guard asserted nothing and an alias could start or
 * end inside a longer word: حدود lit up inside محدود on twelve pages.
 *
 * Nothing caught it because the symptom is a chip on a word fragment, which
 * looks like a rendering glitch rather than a bug. So this asserts the
 * invariant directly: whatever the layer marks must not have a letter of the
 * same script immediately before or after it.
 *
 * Han and kana are excluded by design — Chinese is written without spaces, so
 * a marked term is ALWAYS flush against more letters and the invariant cannot
 * hold there. That exception is in the matcher too, and this agrees with it.
 *
 *   python3 -m http.server 8123 &
 *   node tools/qa/gloss-check.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8123';
const LOCALES = fs.existsSync('tools/locales.json')
  ? JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales.map(l => l.code)
  : ['en'];
// Every page that carries prose worth marking up.
const PAGES = ['index', 'pbsd', 'cypha', 'retdec', 'mathscript', 'aegis', 'sentinel',
               'cellai', 'chess', 'trace', 'kickstarter', 'beta', 'research',
               'licensing', 'about'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const problems = [];
  let marks = 0, checked = 0;

  for (const code of LOCALES) {
    let perLocale = 0;
    for (const slug of PAGES) {
      const url = `${BASE}/${code === 'en' ? '' : code + '/'}${slug}.html`;
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        // The layer marks up on load; give it a beat to fetch its catalogue.
        await page.waitForTimeout(700);
        const found = await page.evaluate(() => {
          const HAN = /[㐀-䶿一-鿿぀-ヿ]/;
          let LETTER;
          try { LETTER = new RegExp('[\\p{L}\\p{M}]', 'u'); } catch (e) { LETTER = /[A-Za-z]/; }
          const out = [];
          document.querySelectorAll('#main .gloss').forEach(el => {
            const word = el.textContent || '';
            if (!word || HAN.test(word)) return;
            // What sits either side of the mark, in the same run of text.
            const before = el.previousSibling && el.previousSibling.nodeType === 3
              ? el.previousSibling.nodeValue.slice(-1) : '';
            const after = el.nextSibling && el.nextSibling.nodeType === 3
              ? el.nextSibling.nodeValue.slice(0, 1) : '';
            if ((before && LETTER.test(before)) || (after && LETTER.test(after))) {
              out.push({ word: word, before: before, after: after });
            }
          });
          return { glued: out, total: document.querySelectorAll('#main .gloss').length };
        });
        marks += found.total;
        perLocale += found.total;
        checked++;
        found.glued.forEach(g => problems.push(
          `${code}/${slug}: "${g.word}" is glued — "${g.before}" before, "${g.after}" after`));
      } catch (e) {
        problems.push(`${code}/${slug}: ${e.message.split('\n')[0]}`);
      }
      await page.close();
    }
    process.stdout.write(`  ${code.padEnd(3)} ${String(perLocale).padStart(4)} terms marked\n`);
  }
  await browser.close();

  console.log(`\n${marks} terms marked across ${checked} pages`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.slice(0, 40).forEach(p => console.log('  ! ' + p));
    if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
    process.exit(1);
  }
  console.log('Nothing is marked mid-word.');
})();
