/* =============================================================
   Similarity — related pages, and a search box.

   Both run off assets/data/voice-index.json, the same sparse
   TF-IDF index the voice layer uses, so there is one notion of
   "close to" on this site rather than three.

   Related pages are precomputed in tools/gen_voice_index.py with a
   hubness correction, because raw cosine makes the homepage
   everyone's nearest neighbour and that is not a recommendation.

   Search is computed here: the query is a sparse TF-IDF vector and
   the cosine runs over the smaller side. Sixty pages, so there is
   no index structure worth building — it is a loop.
   ============================================================= */
(function (root) {
  'use strict';

  var I18N = root.ImortekI18n;
  var T = (I18N && I18N.t) || function (k) { return k; };
  var LOC = (I18N && I18N.locale) || { code: 'en', prefix: '' };

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var index = null, indexP = null;

  function load() {
    if (indexP) return indexP;
    indexP = fetch(LOC.code === 'en'
        ? '/assets/data/voice-index.json'
        : '/assets/data/voice-index.' + LOC.code + '.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { index = d; return d; })
      .catch(function () { return null; });
    return indexP;
  }

  /* Mirrors stem() in tools/gen_voice_index.py exactly. If these drift, the
     query and the index stop speaking the same language. */
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w))  return w.slice(0, -3) + "y";
    if (w.length > 4 && /sses$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ally$/.test(w)) return w.slice(0, -4) + "al";
    if (w.length > 4 && /ly$/.test(w))   return w.slice(0, -2);
    if (w.length > 5 && /ing$/.test(w)) { var b = w.slice(0, -3); return (b.length > 3 && b.slice(-1) === b.slice(-2, -1)) ? b.slice(0, -1) : b; }
    if (w.length > 4 && /ed$/.test(w))  { var c = w.slice(0, -2); return (c.length > 3 && c.slice(-1) === c.slice(-2, -1)) ? c.slice(0, -1) : c; }
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /* English splits on ASCII and stems; every other language uses the shared
     tokeniser in i18n.js, which is what built that locale's index. Mixing the
     two is how a Russian query came back empty. */
  function toks(text) {
    if (LOC.code !== 'en' && I18N && I18N.tokens) return I18N.tokens(text);
    return (String(text).toLowerCase().match(/[a-z][a-z'+-]+/g) || []).map(stem);
  }

  function vec(text) {
    if (!index) return null;
    var counts = {};
    toks(text).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    var v = {}, any = false, w, n = 0;
    for (w in counts) {
      var idf = index.idf[w];
      if (idf === undefined) continue;
      any = true;
      v[w] = (1 + Math.log(counts[w])) * idf;
    }
    if (!any) return null;
    for (w in v) n += v[w] * v[w];
    n = Math.sqrt(n) || 1;
    for (w in v) v[w] /= n;
    return v;
  }

  function search(q, limit) {
    return load().then(function () {
      var v = vec(q);
      if (!v) return [];
      var here = location.pathname.replace(/index\.html$/, '');
      // The fourteen main pages carry a small prior. Forty-six research
      // articles otherwise swamp them, and somebody searching "memory safe
      // operating system" wants the product, not a CPU design note that
      // happens to use the same words. Measured: this alone moved top-1 from
      // 10/15 to 13/15 on the labelled query set in tools/eval-search.py.
      var boost = index.boost || 1;
      return index.pages.map(function (pg) {
        var s = 0, w;
        for (w in v) if (pg.v[w] !== undefined) s += v[w] * pg.v[w];
        if (pg.m) s *= boost;
        return { u: pg.u, t: pg.t, s: s };
      }).filter(function (r) { return r.s > 0.02 && r.u !== here; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, limit || 6);
    });
  }

  /* ---------- related pages, appended to the end of <main> ---------- */
  function related() {
    var here = location.pathname;
    if (/\/404\.html$/.test(here)) return;
    // The locale home is served at /es/ and at /es/index.html, and the index
    // only knows one of them.
    var home = (LOC.prefix || '') + '/';
    load().then(function (d) {
      if (!d) return;
      var me = d.pages.filter(function (p) {
        return p.u === here ||
               (p.u === home && (here === home || here === home + 'index.html'));
      })[0];
      if (!me || !me.n || !me.n.length) return;
      var main = document.getElementById('main');
      if (!main || main.querySelector('.related')) return;

      var sec = document.createElement('section');
      sec.className = 'section section--tight related';
      sec.innerHTML =
        '<div class="wrap">' +
          '<div class="section-head" style="margin-bottom:1.5rem">' +
            '<span class="eyebrow">' + esc(T('related.eyebrow')) + '</span>' +
            '<h2 style="font-size:clamp(1.2rem,2.2vw,1.6rem)">' + esc(T('related.title')) + '</h2>' +
          '</div>' +
          '<div class="grid grid-2">' +
            me.n.map(function (n) {
              return '<a class="card card--hover related__item" href="' + n.u + '">' +
                       '<div class="card__glow"></div>' +
                       '<h3 style="font-size:.98rem;margin:0">' + n.t + '</h3>' +
                     '</a>';
            }).join('') +
          '</div>' +
          '<p class="tiny muted" style="margin-top:14px">' +
            esc(T('related.note')) +
          '</p>' +
        '</div>';
      main.appendChild(sec);
    });
  }

  /* ---------- search, opened with the key or the button ---------- */
  var box = null;
  function openSearch() {
    if (box) { box.querySelector('input').focus(); return; }
    box = document.createElement('div');
    box.className = 'sitesearch';
    box.innerHTML =
      '<div class="sitesearch__panel" role="dialog" aria-modal="true" aria-label="' + esc(T('search.aria')) + '">' +
        '<input type="search" placeholder="' + esc(T('search.placeholder')) + '" ' +
             'aria-label="' + esc(T('search.aria')) + '" autocomplete="off">' +
        '<div class="sitesearch__out" role="listbox"></div>' +
        '<p class="tiny muted" style="margin:10px 4px 0">' + esc(T('search.hint')) + '</p>' +
      '</div>';
    document.body.appendChild(box);
    var input = box.querySelector('input'), out = box.querySelector('.sitesearch__out');
    var t = null;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        search(input.value, 7).then(function (rs) {
          out.innerHTML = rs.length
            ? rs.map(function (r) {
                return '<a href="' + r.u + '" role="option"><span>' + r.t + '</span>' +
                       '<b class="mono">' + r.s.toFixed(2) + '</b></a>';
              }).join('')
            : (input.value.trim() ? '<p class="small muted" style="padding:10px">' + esc(T('search.nothing')) + '</p>' : '');
        });
      }, 120);
    });
    box.addEventListener('click', function (e) { if (e.target === box) closeSearch(); });
    input.focus();
    load();
  }
  function closeSearch() { if (box) { box.remove(); box = null; } }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearch();
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); openSearch();
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-search]')) { e.preventDefault(); openSearch(); }
  });

  if (document.readyState !== 'loading') related();
  else document.addEventListener('DOMContentLoaded', related);

  root.ImortekSimilar = { search: search, open: openSearch, load: load };
}(typeof self !== 'undefined' ? self : this));
