/* =============================================================
   Capstone, compiled to WebAssembly — the decoder rung of the
   RetDec ladder, running for real. Loaded on demand.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('rdw-demo');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var api = null, loading = false, bits = 64;

  var EXAMPLES = [
    { label: 'function prologue', hex: '55 48 89 e5 b8 01 00 00 00 5d c3', bits: 64 },
    { label: 'string compare',    hex: '48 8b 45 f8 0f b6 00 3c 00 74 08', bits: 64 },
    { label: 'xor loop',          hex: '31 c0 48 85 ff 74 0d 48 8b 0f 48 31 c1', bits: 64 },
    { label: '32-bit frame',      hex: '55 89 e5 83 ec 10 c7 45 fc 00 00 00 00', bits: 32 }
  ];
  var chips = $('rdw-examples');
  chips.innerHTML = EXAMPLES.map(function (e, i) {
    return '<button type="button" class="chip" data-i="' + i + '">' + e.label + '</button>';
  }).join('');
  chips.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-i]');
    if (!b) return;
    var e = EXAMPLES[+b.dataset.i];
    $('rdw-input').value = e.hex;
    setBits(e.bits);
    if (api) run();
  });

  function setBits(n) {
    bits = n;
    root.querySelectorAll('[data-bits]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.bits === n));
    });
  }
  root.querySelectorAll('[data-bits]').forEach(function (b) {
    b.addEventListener('click', function () { setBits(+b.dataset.bits); if (api) run(); });
  });

  function load() {
    if (api || loading) return;
    loading = true; $('rdw-load').disabled = true; $('rdw-load').textContent = 'loading\u2026';
    var s = document.createElement('script');
    s.src = '/assets/wasm/retdec.js';
    s.onload = function () {
      RetDec().then(function (m) {
        api = {
          dis: m.cwrap('rd_web_disasm', 'string', ['string','number','number']),
          ver: m.cwrap('rd_web_version', 'string', [])
        };
        loading = false;
        $('rdw-run').disabled = false;
        $('rdw-load').textContent = 'Loaded';
        $('rdw-version').textContent = api.ver();
        run();
      }).catch(fail);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }
  function fail() {
    loading = false; $('rdw-load').disabled = false; $('rdw-load').textContent = 'unavailable';
    $('rdw-out').textContent = 'The decoder could not be loaded.';
  }

  function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

  function run() {
    if (!api) return;
    var base = bits === 64 ? 0x401000 : 0x8048000;
    var text = api.dis($('rdw-input').value, bits, base);
    if (text.charAt(0) === '!') {
      $('rdw-out').innerHTML = '<span class="dim">' + esc(text.slice(1)) + '</span>';
      $('rdw-count').textContent = '0';
      return;
    }
    var lines = text.trim().split('\n');
    $('rdw-count').textContent = String(lines.length);
    $('rdw-out').innerHTML = lines.map(function (l) {
      var p = l.split('\t');
      return '<div><span class="dim">' + esc(p[0]) + '</span>  <b>' + esc(p[1] || '') +
             '</b> <span>' + esc(p[2] || '') + '</span></div>';
    }).join('');
  }

  $('rdw-load').addEventListener('click', load);
  $('rdw-run').addEventListener('click', run);
  $('rdw-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && api) run(); });
}());
