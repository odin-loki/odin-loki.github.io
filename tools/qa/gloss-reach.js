#!/usr/bin/env node
/* Does every glossary entry ever actually fire?
 *
 * The Urdu translator found Ornstein-Uhlenbeck sitting in the file doing
 * nothing. The entry was there, the gloss was good, nine translations of it
 * were good — but every page writes Ornstein–Uhlenbeck with an EN DASH and
 * the key was typed with an ASCII hyphen, so the two never met. It had been
 * dead since the day it was written, in English and in all nine translations
 * at once, and no gate noticed: `gen_glossary.py check` asks whether an entry
 * is well formed, jargon-audit.py asks whether a page's acronyms have
 * entries, gloss-check.js asks whether what IS marked is marked cleanly. None
 * of them asks the plainest question of the lot.
 *
 * So this one does: run the real matcher over every page and see which
 * entries never once light up. A dead entry is not always a bug — most of the
 * 455 are carried for the dictionary lookup and the translations, and under a
 * locale most of them belong to research/, which is English-only — so the
 * failure is narrower than "unreached": an entry whose own term or alias
 * appears in the page text and still does not mark is broken, and that is
 * what --gate fails on.
 *
 * A translated file needs the same question asked of it separately, because
 * an alias can be dead in one language and fine in every other: Bengali
 * writes "deterministic" as নির্ধারণবাদী nineteen times and the entry's
 * aliases did not include it.
 *
 *   python3 -m http.server 8123 &
 *   node tools/qa/gloss-reach.js [base] [--all|--locale=bn] [--gate]
 */
const { chromium } = require('playwright');
const fs = require('fs');

const args = process.argv.slice(2);
const GATE = args.includes('--gate');
const BASE = args.find(a => !a.startsWith('--')) || 'http://localhost:8123';
const ONE = (args.find(a => a.startsWith('--locale=')) || '').split('=')[1];
const CODES = ONE ? [ONE]
  : args.includes('--all')
    ? JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales.map(l => l.code)
    : ['en'];

const LOCALE_CODES = JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales
  .filter(l => !l.root).map(l => l.code);

// Read the page list out of the sitemap so it cannot fall behind the build.
function pagesFor(code) {
  const out = [];
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  for (const m of xml.matchAll(/<loc>https:\/\/imortek\.com\.au\/([^<]*)<\/loc>/g)) {
    let path = m[1];
    if (code === 'en') {
      if (LOCALE_CODES.some(c => path === `${c}/` || path.startsWith(`${c}/`))) continue;
    } else {
      if (path !== `${code}/` && !path.startsWith(`${code}/`)) continue;
      path = path.slice(code.length + 1);
    }
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

// Whatever the matcher's own dash class covers, the text search here covers,
// or this gate would report the very bug it exists to catch as a false alarm.
const DASHES = /[-\u2010-\u2015\u2212]/g;
const norm = s => s.replace(DASHES, '-').toLowerCase();

/* "Is this wording on the page" has to be asked the way the matcher asks it,
   or the gate files the matcher's correct refusals as breakages. Bengali
   writes পূর্বনির্ধারিত ("default") eight times, and that contains
   নির্ধারিত ("determined"), which the matcher declines on purpose. A plain
   substring test would report the refusal as a bug. So: a real boundary in
   front, and up to three trailing letters, which is the inflection tolerance
   the matcher itself allows Cyrillic and Indic.

   An Arabic prefix is not allowed for here. The matcher does allow one, so a
   term the page writes with ال attached has already fired and is not in this
   list to be asked about. */
const WORDCH = '\\p{L}\\p{M}\\p{N}_';
const DASHCLS = '\\-\\u2010-\\u2015\\u2212';
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function onPage(text, s) {
  if (s.length < 3) return false;
  try {
    return new RegExp('(^|[^' + WORDCH + DASHCLS + '])' + escRx(norm(s)) +
                      '[\\p{L}\\p{M}]{0,3}(?![' + WORDCH + DASHCLS + '])', 'u').test(text);
  } catch (e) { return text.indexOf(norm(s)) >= 0; }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const report = [];
  let errors = 0;

  for (const code of CODES) {
    const file = code === 'en' ? 'assets/data/glossary.json' : `assets/data/glossary.${code}.json`;
    if (!fs.existsSync(file)) { console.log(`  ${code}: no glossary file`); continue; }
    const terms = JSON.parse(fs.readFileSync(file, 'utf8')).terms;
    const pages = pagesFor(code);
    const reached = new Set();
    const text = [];

    for (const path of pages) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        await page.goto(`${BASE}/${code === 'en' ? '' : code + '/'}${path}`,
                        { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(600);
        const got = await page.evaluate(() => ({
          marked: [...document.querySelectorAll('#main .gloss')].map(e => e.dataset.term),
          prose: (document.querySelector('#main') || document.body).innerText,
        }));
        got.marked.forEach(t => reached.add(t));
        text.push(got.prose);
      } catch (e) {
        console.log(`  ${code}/${path}: ${e.message.split('\n')[0]}`);
        errors++;
      }
      await page.close();
    }

    const all = norm(text.join('\n'));
    const dead = terms.filter(t => !reached.has(t.t));
    // An entry is BROKEN, not merely unused, when its own wording is sitting
    // in the prose and the matcher still walked past it.
    const broken = dead.filter(t => [t.t].concat(t.alias || [])
      .some(s => onPage(all, s)));
    report.push({ code, pages: pages.length, terms: terms.length,
                  fired: reached.size, dead: dead.length, broken, all });
    console.log(`  ${code.padEnd(3)} ${String(pages.length).padStart(3)} pages   ` +
                `${String(reached.size).padStart(3)}/${terms.length} entries fire   ` +
                `${broken.length} broken`);
  }
  await browser.close();

  let total = 0;
  for (const r of report) {
    if (!r.broken.length) continue;
    total += r.broken.length;
    console.log(`\n  ${r.code}: ${r.broken.length} entry(s) whose own wording is on a page and never mark`);
    for (const t of r.broken) {
      const hit = [t.t].concat(t.alias || []).filter(s => onPage(r.all, s));
      console.log(`      ${t.t.padEnd(24)} page text has ${hit.map(s => JSON.stringify(s)).join(', ')}`);
    }
  }
  if (!total) console.log('\n  Every entry whose wording appears on a page marks it.');
  if (errors) console.log(`  ${errors} page(s) could not be loaded`);
  if (GATE && (total || errors)) process.exit(1);
})();
