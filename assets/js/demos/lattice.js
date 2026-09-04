/* =============================================================
   Homepage — PBSD migration driver typewriter.
   An illustrative reconstruction of pbsd.py output, typed out.
   ============================================================= */
(function () {
  'use strict';

  var el = document.querySelector('[data-typewriter]');
  if (!el) return;

  var reduced = window.ImortekReduced;

  var SCRIPT = [
    { t: 'prompt', s: 'python pbsd.py --scope bin,usr.bin' },
    { t: 'line', s: '' },
    { t: 'dim', s: 'PBSD migration driver  ·  HardenedBSD 15-STABLE → C++23' },
    { t: 'dim', s: 'workers: 48 Flash / 24 Pro   reasoning_effort=max' },
    { t: 'line', s: '' },
    { t: 'step', s: 'inventory', d: 'scoring C sources → docs/migration/c_inventory.csv' },
    { t: 'ok',   s: '  1,284 files scored, 312 in scope' },
    { t: 'step', s: 'passes', d: 'deterministic rewrites, tiers 0–4' },
    { t: 'ok',   s: '  tier 0  headers → modules            218 applied' },
    { t: 'ok',   s: '  tier 1  K&R → prototypes             196 applied' },
    { t: 'ok',   s: '  tier 2  raw ptr → span/string_view   141 applied' },
    { t: 'ok',   s: '  tier 3  errno → Result<T>             88 applied' },
    { t: 'warn', s: '  tier 4  manual review required        27 refused → refusals.jsonl' },
    { t: 'step', s: 'agent', d: 'filling stubbed + refused files' },
    { t: 'dim',  s: '  bin/echo/echo.cc          flash   ok' },
    { t: 'dim',  s: '  bin/cat/cat.cc            flash   ok' },
    { t: 'dim',  s: '  usr.bin/sed/compile.cc    pro     ok' },
    { t: 'err',  s: '  usr.bin/awk/run.cc        pro     UBSan: signed overflow — rejected' },
    { t: 'dim',  s: '  usr.bin/awk/run.cc        pro     retry 2/3  ok' },
    { t: 'step', s: 'verify', d: 'the model does not self-certify' },
    { t: 'ok',   s: '  compile          312/312' },
    { t: 'ok',   s: '  ASan + UBSan     312/312' },
    { t: 'ok',   s: '  differential     309/312' },
    { t: 'warn', s: '  IR equivalence   309/312   3 held back, not marked done' },
    { t: 'line', s: '' },
    { t: 'done', s: '309 files converted and verified. 3 queued for review.' },
    { t: 'dim',  s: 'docs/migration/batch_progress.json updated.' }
  ];

  var CLASS = { ok: 'ok', warn: 'warn', err: 'err', dim: '', done: 'hl', line: '', step: 'pr', prompt: 'pr' };

  function render(upTo, partial) {
    var out = '';
    for (var i = 0; i < upTo; i++) {
      out += format(SCRIPT[i], SCRIPT[i].s);
    }
    if (partial !== null && upTo < SCRIPT.length) {
      out += format(SCRIPT[upTo], partial, true);
    }
    el.innerHTML = out + '<span class="caret"></span>';
    el.scrollTop = el.scrollHeight;
  }

  function format(item, text, open) {
    var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var nl = open ? '' : '\n';
    if (item.t === 'prompt') return '<span class="pr">$</span> <span class="hl">' + esc + '</span>' + nl;
    if (item.t === 'step') {
      var detail = (item.d && !open) ? '  ' + item.d : '';
      return '<span class="pr">▸ ' + esc + '</span>' + detail + nl;
    }
    if (item.t === 'done') return '<span class="ok">✔ ' + esc + '</span>' + nl;
    var cls = CLASS[item.t];
    return (cls ? '<span class="' + cls + '">' + esc + '</span>' : esc) + nl;
  }

  if (reduced) {
    render(SCRIPT.length, null);
    el.querySelector('.caret').remove();
    return;
  }

  var line = 0, ch = 0, timer = null;

  function tick() {
    if (line >= SCRIPT.length) {
      timer = setTimeout(function () {
        line = 0; ch = 0; render(0, '');
        timer = setTimeout(tick, 700);
      }, 5200);
      return;
    }
    var full = SCRIPT[line].s;
    if (ch <= full.length) {
      render(line, full.slice(0, ch));
      ch += Math.max(1, Math.round(full.length / 22));
      timer = setTimeout(tick, 12);
    } else {
      line++; ch = 0;
      render(line, '');
      timer = setTimeout(tick, SCRIPT[line - 1].t === 'step' ? 260 : 90);
    }
  }

  // Only animate while visible
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { if (!timer) tick(); }
        else { clearTimeout(timer); timer = null; }
      });
    }, { threshold: 0.15 }).observe(el);
  } else {
    tick();
  }
})();
