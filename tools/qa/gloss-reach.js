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

/* The matcher does not read all of a page. It skips links, code, headings and
   anything whose class marks it as an identifier rather than prose, and it
   works one text node at a time, so a phrase broken by an <em> is two strings
   to it and not one. A gate that asks its question of #main.innerText asks a
   different question and reports the difference as breakage -- which is what
   the first run of this did: 13 entries, and most of them were the gate being
   wrong rather than the site. Both rules are lifted out of glossary.js instead
   of copied, so they cannot drift; a change to their shape fails loudly here
   rather than quietly weakening the check. */
const MATCHER = fs.readFileSync('assets/js/glossary.js', 'utf8');
function lift(name) {
  const m = MATCHER.match(new RegExp('var ' + name + ' = (/.*?/);'));
  if (!m) throw new Error(`gloss-reach: cannot find ${name} in glossary.js -- ` +
    'the matcher changed shape and this gate needs updating to match');
  return m[1];
}
const SKIP_SRC = lift('SKIP'), SKIP_CLASS_SRC = lift('SKIP_CLASS');

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
const norm = s => s.replace(DASHES, '-');

/* "Is this wording on the page" has to be asked the way the matcher asks it,
   or the gate files the matcher's correct refusals as breakages. Two ways to
   get it wrong, and the first run of this gate managed both.

   Boundaries: Bengali writes পূর্বনির্ধারিত ("default") eight times, which
   contains নির্ধারিত ("determined"). The matcher declines that on purpose;
   a plain substring test reports the refusal as a bug.

   Inflection: the matcher tolerates a short suffix in Russian, Hindi, Bengali
   and Urdu, and a short prefix in Arabic and Urdu, and tolerates NOTHING in
   English or the Latin locales. Applying the suffix everywhere had the gate
   claiming "particle filter" was broken because a page says "particles".

   Case: the matcher matches an acronym case-sensitively and everything
   else case-insensitively, because ML lit up on the "ml" of a cocktail
   measure before it did. Lowercasing both sides here undoes that, and the
   gate duly reported the French pages as breaking SES -- "ses propres
   conditions", the possessive, four letters of French prose away from a
   satellite operator.

   So the rules are lifted from pattern() in glossary.js rather than
   approximated, and the lengths and the case test are its own. */
const ACRONYM = /^[A-Z][A-Z0-9+\-\/]*$/;
const ARABIC = /[\u0600-\u06ff]/, CYRILLIC = /[\u0400-\u04ff]/,
      INDIC = /[\u0900-\u097f\u0980-\u09ff]/;
const WORDCH = '\\p{L}\\p{M}\\p{N}_';
// Only the joining dashes, matching the boundary the matcher uses.
const DASHCLS = '\\-\\u2010-\\u2013';
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function onPage(text, s, code) {
  if (s.length < 3) return false;
  let prefix = '', suffix = '';
  if (code !== 'en' && s.length >= 5) {
    if (ARABIC.test(s)) {
      prefix = '(?:[\u0648\u0641\u0628\u0643\u0644]?\u0627\u0644|[\u0648\u0641\u0628\u0643\u0644])?';
      suffix = '[\\p{L}\\p{M}]{0,2}';
    } else if (CYRILLIC.test(s) || INDIC.test(s)) {
      suffix = '[\\p{L}\\p{M}]{0,3}';
    }
  }
  const flags = (ACRONYM.test(s) ? '' : 'i') + 'u';
  try {
    return new RegExp('(^|[^' + WORDCH + DASHCLS + '])' + prefix +
                      escRx(norm(s)).replace(/ /g, '\\s+') +
                      suffix + '(?![' + WORDCH + DASHCLS + '])', flags).test(text);
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
    const text = [], free = [];

    for (const path of pages) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        const location_url = `${BASE}/${code === 'en' ? '' : code + '/'}${path}`;
        await page.goto(location_url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(600);
        const got = await page.evaluate(async ([skipSrc, skipClassSrc, url]) => {
          const SKIP = eval(skipSrc), SKIP_CLASS = eval(skipClassSrc);
          /* Read the prose out of the page's own HTML rather than the live DOM.
             The matcher marks up once, on load; a demo that writes into a
             readout afterwards puts words on the page that were never offered
             to it. The chess board's readout says "depth 2" while it thinks,
             and the gate called `search depth` broken in six languages on the
             strength of it. The served file is exactly what the matcher saw. */
          const doc = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
          const main = doc.querySelector('#main') || doc.body;
          const w = doc.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
              for (let p = n.parentNode; p && p !== main; p = p.parentNode) {
                if (SKIP.test(p.nodeName) ||
                    (p.className && typeof p.className === 'string' && SKIP_CLASS.test(p.className))) {
                  return NodeFilter.FILTER_REJECT;
                }
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          });
          const parts = [];
          for (let n = w.nextNode(); n; n = w.nextNode()) parts.push(n.nodeValue);

          /* A second reading, off the live page, with one rule the file cannot
             express: the matcher will not look inside a mark another entry has
             already made. sentinel.html writes "KDE hotspots", `kernel
             density' claims the whole phrase because it is the longer and more
             specific string, and `heat map' -- which carries "hotspots" -- is
             then correctly left with nowhere to go. Asking the file alone,
             that reads as a breakage. A word has to survive BOTH readings to
             count: the file, so a demo cannot invent it, and the live page, so
             a rival entry cannot have taken it. */
          const live = document.querySelector('#main') || document.body;
          const lw = document.createTreeWalker(live, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
              for (let p = n.parentNode; p && p !== live; p = p.parentNode) {
                if (SKIP.test(p.nodeName) ||
                    (p.className && typeof p.className === 'string' && SKIP_CLASS.test(p.className)) ||
                    (p.classList && p.classList.contains('gloss'))) {
                  return NodeFilter.FILTER_REJECT;
                }
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          });
          const lparts = [];
          for (let n = lw.nextNode(); n; n = lw.nextNode()) lparts.push(n.nodeValue);

          return {
            marked: [...document.querySelectorAll('#main .gloss')].map(e => e.dataset.term),
            // One text node per line: the matcher cannot see across a tag either.
            prose: parts.join('\n'),
            unclaimed: lparts.join('\n'),
          };
        }, [SKIP_SRC, SKIP_CLASS_SRC, location_url]);
        got.marked.forEach(t => reached.add(t));
        text.push(got.prose);
        free.push(got.unclaimed);
      } catch (e) {
        console.log(`  ${code}/${path}: ${e.message.split('\n')[0]}`);
        errors++;
      }
      await page.close();
    }

    const all = norm(text.join('\n'));
    const unclaimed = norm(free.join('\n'));
    const dead = terms.filter(t => !reached.has(t.t));
    // An entry is BROKEN, not merely unused, when its own wording is sitting
    // in the prose and the matcher still walked past it.
    const broken = dead.filter(t => [t.t].concat(t.alias || [])
      .some(s => onPage(all, s, code) && onPage(unclaimed, s, code)));
    report.push({ code, pages: pages.length, terms: terms.length,
                  fired: reached.size, dead: dead.length, broken, all, unclaimed });
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
      const hit = [t.t].concat(t.alias || [])
        .filter(s => onPage(r.all, s, r.code) && onPage(r.unclaimed, s, r.code));
      console.log(`      ${t.t.padEnd(24)} page text has ${hit.map(s => JSON.stringify(s)).join(', ')}`);
    }
  }
  if (!total) console.log('\n  Every entry whose wording appears on a page marks it.');
  if (errors) console.log(`  ${errors} page(s) could not be loaded`);
  if (GATE && (total || errors)) process.exit(1);
})();
