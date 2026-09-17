#!/usr/bin/env node
/* Does every glossary entry ever actually fire?
 *
 * The Urdu translator found Ornstein-Uhlenbeck sitting in the file doing
 * nothing. The entry was there, the gloss was good, nine translations of it
 * were good — but every page writes Ornstein–Uhlenbeck with an EN DASH and
 * the key was typed with an ASCII hyphen, so the two never met. It had been
 * dead since the day it was written, in English and in all nine locales at
 * once, and no gate noticed: `gen_glossary.py check` asks whether an entry is
 * well formed, jargon-audit.py asks whether a page's acronyms have entries,
 * gloss-check.js asks whether what IS marked is marked cleanly. None of them
 * asks the plainest question of the lot.
 *
 * So this one does: run the real matcher over every English page and see
 * which entries never once light up. A dead entry is not always a bug — most
 * of the 455 are there for the dictionary lookup and the translations — so
 * the failure is narrower than "unreached": an entry whose own term or alias
 * appears in the page text and still does not mark is broken, and that is
 * what --gate fails on.
 *
 *   python3 -m http.server 8123 &
 *   node tools/qa/gloss-reach.js [base] [--gate]
 */
const { chromium } = require('playwright');
const fs = require('fs');

const args = process.argv.slice(2);
const GATE = args.includes('--gate');
const BASE = args.find(a => !a.startsWith('--')) || 'http://localhost:8123';

const PAGES = (() => {
  const out = [];
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  const codes = JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales
    .filter(l => !l.root).map(l => l.code);
  for (const m of xml.matchAll(/<loc>https:\/\/imortek\.com\.au\/([^<]*)<\/loc>/g)) {
    const path = m[1];
    if (codes.some(c => path === `${c}/` || path.startsWith(`${c}/`))) continue;
    const slug = path === '' ? 'index' : path.replace(/\.html$/, '');
    if (!out.includes(slug)) out.push(slug);
  }
  return out;
})();

// Whatever the matcher's own dash class covers, the text search here covers,
// or this gate would report the very bug it exists to catch as a false alarm.
const DASHES = /[-‐-―−]/g;
const norm = s => s.replace(DASHES, '-').toLowerCase();

(async () => {
  const terms = JSON.parse(fs.readFileSync('assets/data/glossary.json', 'utf8')).terms;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const reached = new Set();
  const text = [];
  let errors = 0;

  for (const slug of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`${BASE}/${slug === 'index' ? '' : slug + '.html'}`,
                      { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(600);
      const got = await page.evaluate(() => ({
        marked: [...document.querySelectorAll('#main .gloss')].map(e => e.dataset.term),
        prose: (document.querySelector('#main') || document.body).innerText,
      }));
      got.marked.forEach(t => reached.add(t));
      text.push(got.prose);
    } catch (e) {
      console.log(`  ${slug}: ${e.message.split('\n')[0]}`);
      errors++;
    }
    await page.close();
  }
  await browser.close();

  const all = norm(text.join('\n'));
  const dead = terms.filter(t => !reached.has(t.t));
  // An entry is BROKEN, not merely unused, when its own wording is sitting in
  // the prose and the matcher still walked past it.
  const broken = dead.filter(t => [t.t].concat(t.alias || [])
    .some(s => s.length >= 3 && all.includes(norm(s))));

  console.log(`\n  ${PAGES.length} English pages, ${terms.length} entries`);
  console.log(`  ${reached.size} fire somewhere, ${dead.length} never do`);
  if (broken.length) {
    console.log(`\n  ${broken.length} entry(s) whose own wording is on a page and still never mark:`);
    for (const t of broken) {
      const hit = [t.t].concat(t.alias || []).filter(s => s.length >= 3 && all.includes(norm(s)));
      console.log(`      ${t.t.padEnd(24)} page text contains ${hit.map(s => JSON.stringify(s)).join(', ')}`);
    }
  } else {
    console.log('\n  Every entry whose wording appears on a page marks it.');
  }
  if (errors) console.log(`  ${errors} page(s) could not be loaded`);
  if (GATE && (broken.length || errors)) process.exit(1);
})();
