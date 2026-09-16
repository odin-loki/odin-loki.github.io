/* =============================================================
   Locale runtime.

   The chrome — navigation, footer, headings, body copy — is
   translated at build time and arrives as ordinary HTML, so it is
   there before any script runs and it is there for a reader with
   JavaScript off. This file exists for the rest: the strings that
   only come into being when something is clicked, spoken or found.

   The English table below is the source of truth. A localised page
   inlines only its overrides, ahead of this file, so the English
   site downloads nothing extra and no page ever flashes English
   before settling into another language.

   T('tools.openMore', {n: 3})  ->  "Open 3 more and Cypha starts predicting"
   ============================================================= */
(function (root, doc) {
  'use strict';

  var EN = {
    'lang.label': 'Language',
    'lang.choose': 'Choose a language',
    'lang.suggested': 'Your browser prefers this language',
    'lang.close': 'Close',

    'tools.label': 'Page tools',
    'tools.toggle': 'Show or hide the page tools',
    'tools.readAloud': 'Read aloud',
    'tools.pause': 'Pause',
    'tools.stop': 'Stop reading',
    'tools.next': 'Next paragraph',
    'tools.voice': 'Voice commands',
    'tools.explain': 'Explain the jargon',
    'tools.reset': 'reset',
    'tools.termsOnPage': 'terms on this page',
    'tools.learned': 'learned',
    'tools.preExpanded': 'pre-expanded',
    'tools.openMore': 'Open {n} more and Cypha starts predicting',
    'tools.understood': 'understood',
    'tools.corrected': 'corrected',
    'tools.off': 'off',
    'tools.reading': 'reading',

    'search.placeholder': 'Search — describe what you want',
    'search.aria': 'Search this site',
    'search.hint': 'Matches on meaning, not just exact words. Esc to close.',
    'search.nothing': 'Nothing close.',

    'related.eyebrow': 'Closest on this site',
    'related.title': 'Related reading',
    'related.note': 'Chosen by term overlap with this page, not by hand — so it is honest about what is actually close, including when that is nothing obvious.',

    'voice.help': 'You can say: read, stop, next, back, top, home, or the name of a page. You can also describe what you want and I will find the closest page.',
    'voice.notCaught': 'I did not catch that. Say "help" for what you can say.',
    'voice.listening': 'Listening. Say "help" for what you can say.',
    'voice.micOff': 'Microphone off.',
    'voice.micBlocked': 'Microphone blocked. Allow it in your browser to use voice commands.',
    'voice.opening': 'Opening',
    'voice.didYouMean': 'Did you mean',
    'voice.sayNumber': 'Say a number, or say no.',
    'voice.understood': 'Understood. Say it another way, or say help.',
    'voice.endOfPage': 'End of page.',
    'voice.searchOpen': 'Search open.',
    'voice.nothingRelated': 'Nothing related on this page.',
    'voice.related': 'Related',
    'voice.goingTo': 'Going to',
    'voice.heading': 'Heading.',
    'voice.or': 'Or',

    'gloss.notInDict': 'Not in the dictionary.',
    'gloss.lookingUp': 'looking it up…',
    'gloss.forget': 'Forget what Cypha learned'
  };

  var over = root.__IMORTEK_I18N || {};
  var htmlEl = doc.documentElement;

  /* The document's own attributes are the single source of truth for which
     locale this is. They are set by the builder, so the runtime cannot
     disagree with the markup around it. */
  var meta = function (n) {
    var el = doc.querySelector('meta[name="' + n + '"]');
    return el ? el.getAttribute('content') : '';
  };

  var locale = {
    code:   meta('imortek:locale') || (htmlEl.lang || 'en').split('-')[0] || 'en',
    tag:    htmlEl.lang || 'en-AU',
    speech: meta('imortek:speech') || htmlEl.lang || 'en-AU',
    dir:    htmlEl.getAttribute('dir') || 'ltr',
    /* '' for English at the root, '/es' for a localised tree. Every URL the
       scripts build has to carry it or a click in Spanish lands in English. */
    prefix: meta('imortek:prefix') || ''
  };
  locale.rtl = locale.dir === 'rtl';
  locale.isRoot = locale.prefix === '';

  function T(k, vars) {
    var s = (k in over) ? over[k] : EN[k];
    if (s == null) return k;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return (name in vars) ? String(vars[name]) : m;
      });
    }
    return s;
  }

  /* A site-root path in the current locale. url('/pbsd.html') is
     '/pbsd.html' in English and '/es/pbsd.html' in Spanish. Paths that are
     not localised — research articles, assets — pass through untouched. */
  var LOCALISED = /^\/(index\.html|pbsd|cypha|retdec|mathscript|aegis|sentinel|cellai|chess|kickstarter|beta|research|licensing|about|404)(\.html)?$|^\/$/;
  function url(p) {
    if (!locale.prefix || !p || p.charAt(0) !== '/') return p;
    return LOCALISED.test(p) ? locale.prefix + (p === '/' ? '/' : p) : p;
  }

  /* The inverse: strip the locale prefix off a pathname so page-matching
     logic can compare against the canonical English path. */
  function unprefix(p) {
    if (locale.prefix && p.indexOf(locale.prefix + '/') === 0) {
      return p.slice(locale.prefix.length) || '/';
    }
    return p;
  }

  /* ---------- tokenising a query ----------
     The English search splits on /[a-z]+/ and runs a small English stemmer.
     Point that at "операционная система" and it returns nothing at all, so the
     search box in six of the ten languages silently matched nothing — it was
     not finding the wrong pages, it was never forming a query.

     This mirrors tokens_i18n() in tools/gen_voice_index.py, which is what
     built the index these queries are compared against. No stemming: the
     English stemmer turns Russian words into rubbish, and a wrong stem is
     worse than none because it quietly merges words that are not the same.
     Han characters become overlapping pairs, which is the standard answer for
     a language that does not write spaces and is enough to tell 操作系统 from
     反编译器. English keeps its own path, untouched. */
  /* A word ends where a letter-or-mark run ends. Matching letters alone is
     not enough: a Devanagari vowel sign is a mark, not a letter, so \p{L}+
     cuts "ऑपरेटिंग" into three pieces and the Hindi index came out with 23
     usable terms in it. Marks belong to the word they sit on. */
  var NOTWORD = null;
  try { NOTWORD = new RegExp('[^\\p{L}\\p{M}]+', 'u'); } catch (e) { NOTWORD = null; }
  var CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]+/g;
  var CJK_ONE = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/;

  function tokens(text) {
    var s = String(text).toLowerCase(), out = [], m, i;
    var parts = s.split(NOTWORD || /[^a-z]+/);
    for (i = 0; i < parts.length; i++) {
      if (parts[i].length > 1 && !CJK_ONE.test(parts[i])) out.push(parts[i]);
    }
    CJK_RUN.lastIndex = 0;
    while ((m = CJK_RUN.exec(s)) !== null) {
      var run = m[0];
      if (run.length === 1) { out.push(run); continue; }
      for (i = 0; i < run.length - 1; i++) out.push(run.substr(i, 2));
    }
    return out;
  }

  root.ImortekI18n = { t: T, locale: locale, url: url, unprefix: unprefix,
                       tokens: tokens, en: EN };
  root.T = T;
}(window, document));
