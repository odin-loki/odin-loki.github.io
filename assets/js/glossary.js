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
  var I18N = root.ImortekI18n;
  var T = (I18N && I18N.t) || function (k) { return k; };
  var LOC = (I18N && I18N.locale) || { code: 'en' };
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  'use strict';

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

  function pattern(s) {
    var body = esc(s);
    if (LOC.code === 'en' || s.length < 5) return body;
    if (ARABIC.test(s)) {
      // و ف ب ك ل and the article ال, alone or combined.
      return '(?:[\u0648\u0641\u0628\u0643\u0644]?\u0627\u0644|[\u0648\u0641\u0628\u0643\u0644])?' + body +
             '[\u0627-\u064a]{0,2}';
    }
    if (CYRILLIC.test(s)) return body + '[\u0430-\u044f]{0,3}';
    // U+0964 and U+0965 are the danda — sentence punctuation, not a suffix.
    if (INDIC.test(s)) return body + '[\u0900-\u0963\u0966-\u097f\u0980-\u09ff]{0,3}';
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
      var re = new RegExp('(^|[^\\w-])(' + pattern(s) + ')(?![\\w-])', 'i');
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
    pop.innerHTML = '<b>' + word + '</b><span class="dim">looking it up\u2026</span>';
    host.insertAdjacentElement('afterend', pop);
    close();
    popped = { el: host, pop: pop };
    root.ImortekDict.lookup(word).then(function (hit) {
      if (!popped || popped.pop !== pop) return;
      pop.innerHTML = hit
        ? '<b>' + hit.word + (hit.pos ? ' <span class="gloss__pos">' + POS[hit.pos] + '</span>' : '') +
          '</b>' + hit.gloss + '<span class="gloss__src">WordNet</span>'
        : '<b>' + word + '</b><span class="dim">' + esc(T('gloss.notInDict')) + '</span>';
    });
  }
  var POS = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

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
        '<span class="gloss-ctl__label">' + esc(T('tools.explain')) + '</span>' +
      '</button>' +
      '<span class="gloss-ctl__stat mono"></span>' +
      '<button type="button" class="gloss-ctl__reset" title="' + esc(T('gloss.forget')) + '">' +
        esc(T('tools.reset')) + '</button>';
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
