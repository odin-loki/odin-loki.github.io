/* =============================================================
   Plain-English layer.

   Two parts, and they are deliberately separate:

   1. The glosses are written by hand (assets/data/glossary.json).
      A model that invented definitions would be the one claim on
      this site you could not check, so none of this text is generated.

   2. Which terms get expanded for you is decided by Cypha, running
      here, learning from what you open. Same structure as the
      classifier on /cypha.html:

        WorldPrior θ₀  shared diagonal Gaussian over every term on the
                       page, fitted online by Welford
        Δ "wanted"     natural-parameter offset fitted on the terms you
                       opened, pulled back toward θ₀ by MDL decay
        DIFMemory      log-likelihood ratio of "wanted" against θ₀

      One class against the world prior, so nothing has to be invented
      about the terms you skipped. Nothing is downloaded and nothing is
      sent anywhere; what it learns lives in your browser only.
   ============================================================= */
(function (root) {
  'use strict';

  var I18N = root.ImortekI18n;
  var T = (I18N && I18N.t) || function (k) { return k; };
  var LOC = (I18N && I18N.locale) || { code: 'en' };

  var main = document.getElementById('main');
  if (!main) return;

  var KEY = 'imortek.gloss.v1';
  var SKIP = /^(CODE|PRE|A|BUTTON|SCRIPT|STYLE|NOSCRIPT|SVG|H1|TEXTAREA|INPUT|SUMMARY)$/;
  /* Elements whose text is an identifier rather than prose: a repository path,
     a file name, a version string. Marking a word inside one splits the text
     node in two, and on a right-to-left page the two halves then swap places —
     "github.com/odin-loki" rendered as "com/odin-loki.github". It is also
     simply wrong to explain "GitHub" in the middle of a URL. */
  var SKIP_CLASS = /(^|\s)(mono|panel__title|spec__k|stat__k|term__title|kv__k|code)(\s|$)/;
  var MIN_OPENS = 3;        // before Cypha is allowed an opinion
  var MAX_AUTO   = 6;        // never flood a page, however keen the reader
  var LLR_GATE  = 0.3;      // nats over the world prior before pre-expanding
  var DIM = 10;

  var terms = [], byKey = {}, nodes = [], on = false, model = null, popped = null;

  /* ---------- feature map: what kind of term is this ---------- */
  var DOMAINS = ['systems', 'security', 'ai', 'maths', 'data', 'legal'];
  function encode(t) {
    var z = new Array(DIM), i;
    for (i = 0; i < DIM; i++) z[i] = 0;
    z[0] = /^[A-Z][A-Z0-9^+-]{1,}$/.test(t.t) ? 1 : 0;            // an acronym
    var d = DOMAINS.indexOf(t.d);
    if (d >= 0) z[1 + d] = 1;                                      // 1..6 domain
    z[7] = Math.min(1, t.t.split(/[\s-]+/).length / 3);            // how many words
    z[8] = Math.min(1, t.t.length / 24);                           // how long
    z[9] = /\d/.test(t.t) ? 1 : 0;                                 // carries a number
    return z;
  }

  /* ---------- Cypha ---------- */
  function newModel() {
    return {
      prior: { n: 0, mean: zeros(DIM), m2: zeros(DIM) },
      want:  { n: 0, mean: zeros(DIM), m2: zeros(DIM), mu: zeros(DIM) },
      opened: []
    };
  }
  function zeros(n) { var a = [], i; for (i = 0; i < n; i++) a[i] = 0; return a; }

  // WorldPrior θ₀ — Welford. Every term on the page is one observation of
  // "the kind of jargon this site uses".
  function updatePrior(z) {
    var p = model.prior, i, d;
    p.n++;
    for (i = 0; i < DIM; i++) {
      d = z[i] - p.mean[i];
      p.mean[i] += d / p.n;
      p.m2[i] += d * (z[i] - p.mean[i]);
    }
  }
  function priorVar(i) {
    return model.prior.n > 1 ? Math.max(0.004, model.prior.m2[i] / (model.prior.n - 1)) : 0.06;
  }

  // Δ "wanted" — displacement from the prior in location and precision,
  // decayed back toward θ₀ so three clicks cannot claim a confident shape.
  var MDL = 0.06, SHRINK = 3;
  function updateWant(z) {
    var d = model.want, lr, i, prev, norm = 0;
    d.n++;
    lr = Math.max(0.12, 1 / (d.n + 1));
    for (i = 0; i < DIM; i++) {
      prev = d.mean[i];
      d.mean[i] += lr * (z[i] - prev);
      d.m2[i] += (z[i] - prev) * (z[i] - d.mean[i]);
      d.mu[i] = (d.mean[i] - model.prior.mean[i]) * (1 - MDL);
      d.mean[i] = model.prior.mean[i] + d.mu[i];
      norm += d.mu[i] * d.mu[i];
    }
    d.norm = Math.sqrt(norm);
  }
  function wantVar(i) {
    var n = Math.max(0, model.want.n - 1);
    return Math.max(0.003, (model.want.m2[i] + SHRINK * priorVar(i)) / (n + SHRINK));
  }
  function llr(z) {
    if (model.want.n < MIN_OPENS) return -Infinity;
    var s = 0, i, v0, vk, r0, rk;
    for (i = 0; i < DIM; i++) {
      v0 = priorVar(i); vk = wantVar(i);
      r0 = z[i] - model.prior.mean[i];
      rk = z[i] - model.want.mean[i];
      s += 0.5 * Math.log(v0 / vk) + (r0 * r0) / (2 * v0) - (rk * rk) / (2 * vk);
    }
    return s;
  }

  /* ---------- storage (per-viewer convenience only) ---------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ on: on, m: model })); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.m && o.m.prior && o.m.want) { on = !!o.on; return o.m; }
    } catch (e) {}
    return null;
  }

  /* ---------- wrap the first mention of each term ---------- */
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Matching a term against the page.

     English is easy: the word appears as written. Arabic attaches the article
     and its conjunctions to the front of the word — النواة, وللنواة — and
     Russian, Hindi and Bengali inflect the end, so an exact match finds the
     term in the heading and misses the eight times the sentence actually uses
     it. On a translated page that halved the number of terms explained.

     So an alias may carry a short prefix in the scripts that prefix, and a
     short suffix in the ones that inflect. Only for aliases of four
     characters or more, only two or three letters either side, and never for
     English — which keeps "core" from swallowing "corexyz" and keeps the
     English behaviour exactly as it was. Five characters, not four: at four,
     the Hindi for "fixed" matched inside the Hindi for "deterministic". */
  var ARABIC = /[\u0600-\u06ff]/;
  var CYRILLIC = /[\u0400-\u04ff]/;
  var INDIC = /[\u0900-\u097f\u0980-\u09ff]/;
  var HAN = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/;

  /* A word boundary that knows about scripts other than English.

     JavaScript's \w is [A-Za-z0-9_] whatever flags you pass it, so in Urdu,
     Arabic, Hindi, Bengali and Russian EVERY letter satisfies [^\w-] and the
     guards in markUp assert nothing at all. An alias could start or end in the
     middle of a word: حدود matched inside محدود on twelve pages, and صلہ inside
     فیصلہ. Unicode property escapes give a real boundary where the browser has
     them, which is everywhere that matters and is feature-tested rather than
     assumed.

     Han and kana are the deliberate exception. Chinese is written without
     spaces, so a term is always flush against more letters, and a real
     boundary would match nothing at all. */
  var UNICODE_CLASSES = (function () {
    try { new RegExp('\\p{L}', 'u'); return true; } catch (e) { return false; }
  })();
  var WORD = UNICODE_CLASSES ? '\\p{L}\\p{M}\\p{N}_' : '\\w';
  /* Letters and their combining marks, for the inflection tolerance below.
     The hardcoded ranges it replaces were each short of their own script:
     [\u0627-\u064a] has none of the Urdu letters (ٹ ڈ ڑ ک گ ہ ھ ی ے ں), so
     بائنریوں matched as far as the و and left the ں stranded outside the
     highlight; [\u0430-\u044f] likewise has no ё. */
  var LETTER = UNICODE_CLASSES ? '[\\p{L}\\p{M}]' : null;

  /* A hyphen has six lookalikes and prose uses them interchangeably.

     Every page on this site writes Ornstein–Uhlenbeck with an EN DASH,
     because that is what the typography calls for; the glossary key was
     typed with an ASCII hyphen, because that is what a keyboard gives you.
     The two never met, so the entry sat in the file explaining nothing, in
     English and in all nine translations at once. Nothing reported it: the
     term was present, the gloss was good, and no gate asks whether an entry
     ever actually fires.

     Matching the whole dash family in a term's own hyphen positions fixes
     that class once instead of once per spelling per locale.

     The word boundary takes the shorter list, because only some of these
     dashes join words. A hyphen and an en dash build a compound, so AVX must
     not light up inside AVX–512 any more than inside AVX-512, and bare
     Ornstein must not light up inside Ornstein–Uhlenbeck. The site leans on
     that: strength–time, encoder–decoder, Miller–Rabin, Wyner–Ziv,
     Marchenko–Pastur and a dozen more. An em dash is punctuation and a minus
     sign is arithmetic; neither makes the word beside it part of something
     longer, so neither belongs in a boundary. No page writes an em dash
     without spaces around it today, so this costs nothing now — it is here
     so that the first page that does still gets its jargon explained. */
  var DASH = '\\-\\u2010-\\u2015\\u2212';   // any dash, inside a term
  var JOIN = '\\-\\u2010-\\u2013';          // the ones that join words, for the boundary
  var DASHES = /[-\u2010-\u2015\u2212]/g;

  /* A space in a term is any run of whitespace on the page.

     HTML collapses whitespace, so "Gaussian mixture" written across a line
     break is one phrase to the reader and two words with a newline between
     them to a regex holding a literal space. Eleven entries had at least one
     occurrence split that way on the English pages -- Gibbs sampling, dual
     licence, search depth, capability nucleus, global passive adversary --
     and a translated page, being longer, wraps in more places again. */
  function pattern(s) {
    var body = esc(s).replace(DASHES, '[' + DASH + ']').replace(/ /g, '\\s+');
    if (LOC.code === 'en' || s.length < 5) return body;
    if (ARABIC.test(s)) {
      // و ف ب ك ل and the article ال, alone or combined.
      return '(?:[\u0648\u0641\u0628\u0643\u0644]?\u0627\u0644|[\u0648\u0641\u0628\u0643\u0644])?' + body +
             (LETTER || '[\u0627-\u064a]') + '{0,2}';
    }
    if (CYRILLIC.test(s)) return body + (LETTER || '[\u0430-\u044f]') + '{0,3}';
    // U+0964 and U+0965 are the danda — sentence punctuation, not a suffix.
    // \p{L} excludes them for the same reason, so the carve-out survives.
    if (INDIC.test(s)) return body + (LETTER || '[\u0900-\u0963\u0966-\u097f\u0980-\u09ff]') + '{0,3}';
    return body;
  }

  function markUp() {
    var strings = [];
    terms.forEach(function (t) {
      [t.t].concat(t.alias || []).forEach(function (s) { strings.push([s, t]); });
    });
    strings.sort(function (a, b) { return b[0].length - a[0].length; });

    var seen = {};
    strings.forEach(function (pair) {
      var s = pair[0], t = pair[1];
      if (seen[t.t]) return;
      // Han keeps the permissive guard; everything else gets a real boundary.
      var han = HAN.test(s);
      var w = han ? '\\w' : WORD;
      /* An acronym is matched case-sensitively, an ordinary word is not.
         Everything was case-insensitive, which is right for "capability" and
         wrong for every short acronym: ML lit up on the "ml" of a cocktail
         measure, ARM on an arm, REST on the rest of a sentence, and NOR could
         not be added at all because it would have matched the word "nor". An
         acronym on this site is written in capitals, so requiring them costs
         nothing and stops the whole class. */
      var acronym = /^[A-Z][A-Z0-9+\-/]*$/.test(s);
      var flags = (acronym ? '' : 'i') + ((!han && UNICODE_CLASSES) ? 'u' : '');
      var re = new RegExp('(^|[^' + w + JOIN + '])(' + pattern(s) + ')(?![' + w + JOIN + '])', flags);
      var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || n.nodeValue.length < s.length) return NodeFilter.FILTER_REJECT;
          for (var p = n.parentNode; p && p !== main; p = p.parentNode) {
            if (SKIP.test(p.nodeName) ||
                (p.className && typeof p.className === 'string' && SKIP_CLASS.test(p.className)) ||
                (p.classList && p.classList.contains('gloss'))) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var node = walker.nextNode();
      if (!node) return;
      var m = node.nodeValue.match(re);
      if (!m) return;
      var at = m.index + m[1].length;
      var after = node.splitText(at);
      after.splitText(m[2].length);
      var btn = document.createElement('button');
      btn.className = 'gloss';
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', m[2] + ' — plain-English explanation');
      btn.textContent = m[2];
      btn.dataset.term = t.t;
      after.parentNode.replaceChild(btn, after);
      seen[t.t] = true;
      nodes.push({ el: btn, term: t, z: encode(t) });
    });
  }

  /* ---------- popover ---------- */
  function close() {
    if (!popped) return;
    popped.el.setAttribute('aria-expanded', 'false');
    if (popped.pop && popped.pop.parentNode) popped.pop.parentNode.removeChild(popped.pop);
    popped = null;
  }
  function open(rec, viaClick) {
    close();
    var pop = document.createElement('span');
    pop.className = 'gloss__pop';
    pop.setAttribute('role', 'note');
    pop.innerHTML = '<b>' + rec.term.t + '</b>' + rec.term.g;
    rec.el.insertAdjacentElement('afterend', pop);
    rec.el.setAttribute('aria-expanded', 'true');
    popped = { el: rec.el, pop: pop };
    if (viaClick) learn(rec);
  }

  /* Any word can be looked up, not just the curated ones. The hand-written
     gloss always wins where there is one — WordNet defines "capability" as a
     general noun, which is not what it means on this site. */
  function lookupWord(word, host) {
    if (!root.ImortekDict) return;
    var pop = document.createElement('span');
    pop.className = 'gloss__pop is-dict';
    pop.setAttribute('role', 'note');
    pop.innerHTML = '<b>' + escHtml(word) + '</b><span class="dim">looking it up\u2026</span>';
    host.insertAdjacentElement('afterend', pop);
    close();
    popped = { el: host, pop: pop };
    root.ImortekDict.lookup(word).then(function (hit) {
      if (!popped || popped.pop !== pop) return;
      if (hit) {
        pop.innerHTML = '<b>' + escHtml(hit.word) +
          (hit.pos ? ' <span class="gloss__pos">' + POS[hit.pos] + '</span>' : '') +
          '</b>' + hit.gloss + '<span class="gloss__src">WordNet</span>';
        return;
      }
      // A miss is more useful with a near word beside it than with an
      // apology. suggest() only reads shards already resident, so this
      // costs nothing on the wire.
      pop.innerHTML = '<b>' + escHtml(word) + '</b>' +
        '<span class="dim">' + escHtml(T('gloss.notInDict')) + '</span>';
      if (!root.ImortekDict.suggest) return;
      root.ImortekDict.suggest(word, 3).then(function (near) {
        if (!popped || popped.pop !== pop || !near.length) return;
        var wrap = document.createElement('span');
        wrap.className = 'gloss__near';
        wrap.appendChild(document.createTextNode(T('gloss.didYouMean') + ' '));
        near.forEach(function (n, i) {
          if (i) wrap.appendChild(document.createTextNode(
            i === near.length - 1 ? ' ' + T('gloss.or') + ' ' : T('gloss.listSep') + ' '));
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'gloss__near-btn';
          b.textContent = n;
          // Two things about this handler. The host is the paragraph,
          // not the popup, so re-opening against it replaces this popup
          // rather than nesting inside the node about to be removed.
          // And the click must not reach main's own handler: that one
          // treats any click outside a .gloss as "close the popup", so
          // without stopPropagation it would tear down the very popup
          // this call is opening.
          b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            lookupWord(n, host);
          });
          wrap.appendChild(b);
        });
        wrap.appendChild(document.createTextNode(T('gloss.queryEnd')));
        pop.appendChild(wrap);
      });
    });
  }
  var POS = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

  /* The looked-up word is page text, not a URL parameter, but it reaches
     innerHTML and there is no reason for that to be the one place this
     site trusts its input.

     Named escHtml, not esc: esc() above is the REGEX escaper markUp()
     uses, and a second `function esc' at this scope silently replaces
     it. The glossary then built /(^|[^\w-])(ISO C++23)(?![\w-])/ out
     of an unescaped term, which throws "Nothing to repeat", and the
     init promise's .catch swallowed it -- so the whole layer, click
     handler included, stopped working with nothing in the console. */
  function escHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function learn(rec) {
    if (model.opened.indexOf(rec.term.t) >= 0) return;
    model.opened.push(rec.term.t);
    updateWant(rec.z);
    save();
    predict();
    readout();
  }

  /* ---------- Cypha's call: pre-expand what you would have opened ---------- */
  function predict() {
    var cand = [];
    nodes.forEach(function (rec) {
      var prev = rec.el.nextSibling;
      if (prev && prev.className === 'gloss__auto') prev.parentNode.removeChild(prev);
      rec.el.classList.remove('gloss--picked');
      if (!on) return;
      if (model.opened.indexOf(rec.term.t) >= 0) return;
      var s = llr(rec.z);
      if (s >= LLR_GATE) cand.push({ rec: rec, s: s });
    });
    // Strongest first, capped — a page speckled with brackets helps nobody.
    cand.sort(function (a, b) { return b.s - a.s; });
    cand.slice(0, MAX_AUTO).forEach(function (c) {
      var span = document.createElement('span');
      span.className = 'gloss__auto';
      span.textContent = ' (' + c.rec.term.g + ')';
      c.rec.el.insertAdjacentElement('afterend', span);
      c.rec.el.classList.add('gloss--picked');
    });
    return Math.min(cand.length, MAX_AUTO);
  }

  /* ---------- the control ---------- */
  var panel, stat;
  function readout() {
    if (!stat) return;
    var picked = on ? document.querySelectorAll('.gloss__auto').length : 0;
    stat.textContent = on
      ? (model.want.n < MIN_OPENS
          ? T('tools.openMore', { n: MIN_OPENS - model.want.n })
          : model.want.n + ' ' + T('tools.learned') + ' \u00b7 ' + picked + ' ' + T('tools.preExpanded'))
      : String(nodes.length) + ' ' + T('tools.termsOnPage');
  }

  function build() {
    panel = document.createElement('div');
    panel.className = 'gloss-ctl';
    panel.innerHTML =
      '<button type="button" class="gloss-ctl__btn" aria-pressed="false">' +
        '<span class="gloss-ctl__dot" aria-hidden="true"></span>' +
        '<span class="gloss-ctl__label">' + escHtml(T('tools.explain')) + '</span>' +
      '</button>' +
      '<span class="gloss-ctl__stat mono"></span>' +
      '<button type="button" class="gloss-ctl__reset" title="' + escHtml(T('gloss.forget')) + '">' +
        escHtml(T('tools.reset')) + '</button>';
    (root.ImortekToolbar ? root.ImortekToolbar() : document.body).appendChild(panel);
    stat = panel.querySelector('.gloss-ctl__stat');

    var toggle = panel.querySelector('.gloss-ctl__btn');
    toggle.addEventListener('click', function () {
      on = !on;
      panel.classList.toggle('is-on', on);
      toggle.setAttribute('aria-pressed', String(on));
      document.body.classList.toggle('gloss-on', on);
      close(); predict(); readout(); save();
    });
    panel.querySelector('.gloss-ctl__reset').addEventListener('click', function () {
      model = newModel();
      nodes.forEach(function (r) { updatePrior(r.z); });
      close(); predict(); readout(); save();
    });
  }

  /* ---------- go ---------- */
  var glossUrl = LOC.code === 'en'
    ? '/assets/data/glossary.json'
    : '/assets/data/glossary.' + LOC.code + '.json';
  fetch(glossUrl)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .catch(function () {
      return fetch('/assets/data/glossary.json').then(function (r) { return r.json(); });
    })
    .then(function (data) {
    terms = data.terms || [];
    terms.forEach(function (t) { byKey[t.t] = t; });
    markUp();
    if (!nodes.length) return;

    var saved = load();
    model = saved || newModel();
    // The world prior is this page's own vocabulary, refitted on every visit.
    model.prior = { n: 0, mean: zeros(DIM), m2: zeros(DIM) };
    nodes.forEach(function (r) { updatePrior(r.z); });

    build();
    panel.classList.toggle('is-on', on);
    panel.querySelector('.gloss-ctl__btn').setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('gloss-on', on);
    predict();
    readout();

    main.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.gloss');
      if (!btn) { close(); return; }
      e.preventDefault();
      if (popped && popped.el === btn) { close(); return; }
      var rec = nodes.filter(function (r) { return r.el === btn; })[0];
      if (!rec) return;
      if (!on) {
        on = true;
        panel.classList.add('is-on');
        panel.querySelector('.gloss-ctl__btn').setAttribute('aria-pressed', 'true');
        document.body.classList.add('gloss-on');
      }
      open(rec, true);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    // Double-click any word on the page and it gets looked up. This is what the
    // 144,440-word dictionary is for: the curated list covers this site's own
    // jargon, and everything else falls through to WordNet.
    main.addEventListener('dblclick', function (e) {
      var sel = (window.getSelection ? String(window.getSelection()) : '').trim();
      if (!sel || /\s/.test(sel) || sel.length < 3 || sel.length > 32) return;
      if (e.target.closest('code, pre, .gloss')) return;
      var host = e.target.closest('p, li, td, h2, h3, h4, figcaption, .note');
      if (!host) return;
      lookupWord(sel.toLowerCase().replace(/[^a-z'-]/gi, ''), host);
    });
  }).catch(function () { /* no glossary, no layer — the page is unchanged */ });
}(typeof self !== 'undefined' ? self : this));
