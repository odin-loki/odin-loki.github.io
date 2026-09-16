/* Does "did you mean" actually mean it?
 *
 * The suggestion path is only worth shipping if it names the word a
 * reader meant, so this runs it against the real shards on disk -- no
 * stubs, no mock dictionary -- with fetch() redirected at the
 * filesystem. Each case is a misspelling a reader would plausibly
 * produce and the word they meant.
 *
 *   node tools/qa/dict-suggest-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
global.fetch = function (url) {
  const file = path.join(ROOT, url.replace(/^\//, ''));
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) });
};
const self = {};
new Function('self', fs.readFileSync(path.join(ROOT, 'assets/js/dictionary.js'), 'utf8'))(self);
const D = self.ImortekDict;

/* [typed, meant] -- the second must appear in the suggestions. */
const CASES = [
  ['algorithim', 'algorithm'],   // transposed pair near the end
  ['recieve',    'receive'],     // the canonical English transposition
  ['seperate',   'separate'],    // a > e substitution
  ['occurence',  'occurrence'],  // a dropped letter
  ['cryptograhy','cryptography'],// transposition mid-word
  ['heuristc',   'heuristic'],   // a dropped letter, late
  ['kernal',     'kernel'],      // a > e, the one every sysadmin types
  ['compilr',    'compiler'],    // dropped letter, tail
];
/* A word that is in the dictionary must not be "corrected". */
const EXACT = ['kernel', 'compiler', 'algorithm'];

(async () => {
  let fail = 0;
  for (const [typed, meant] of CASES) {
    const hit = await D.lookup(typed);
    const sug = await D.suggest(typed, 3);
    const ok = !hit && sug.includes(meant);
    if (!ok) fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${typed.padEnd(13)} -> ${
      hit ? 'found as a word (no suggestion needed)' : (sug.join(', ') || '(nothing)')
    }${ok ? '' : `   [wanted ${meant}]`}`);
  }
  for (const w of EXACT) {
    const hit = await D.lookup(w);
    const ok = !!hit;
    if (!ok) fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${w.padEnd(13)} is in the dictionary`);
  }
  const s = D.stats();
  console.log(`\n  ${s.shardsLoaded} of ${s.shardsTotal} shards touched, ${s.wordsResident} words resident`);
  console.log(fail ? `\nFAILED (${fail})` : '\nall checks passed');
  process.exit(fail ? 1 : 0);
})();
