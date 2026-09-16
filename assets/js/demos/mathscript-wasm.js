/* =============================================================
   MathScript, the actual library, in the browser.

   Loads assets/wasm/mathscript.{js,wasm} on demand — 113 KB of
   WebAssembly compiled from the same C++ that builds the native
   library, exporting only the four calls this panel makes.

   Nothing is fetched until the reader asks for it.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('msw-demo');
  if (!root) return;

  var $ = function (id) { return document.getElementById(id); };
  var input = $('msw-input'), varEl = $('msw-var');
  var loadBtn = $('msw-load'), runBtn = $('msw-run'), state = $('msw-state');
  var mod = null, api = null, loading = false;

  var EXAMPLES = ['sin(x)*x^2', 'exp(2*x)', 'log(x)', 'x^3 - 2*x', 'cos(x)/x', '1/(1+x^2)'];
  var chips = $('msw-examples');
  if (chips) {
    chips.innerHTML = EXAMPLES.map(function (e) {
      return '<button type="button" class="chip" data-ex="' + e + '">' + e + '</button>';
    }).join('');
    chips.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ex]');
      if (!b) return;
      input.value = b.dataset.ex;
      if (api) run();
    });
  }

  function setState(t, cls) {
    state.textContent = t;
    state.className = 'badge ' + (cls || 'badge--violet');
  }

  function load() {
    if (mod || loading) return;
    loading = true;
    setState('loading\u2026');
    loadBtn.disabled = true;
    var s = document.createElement('script');
    s.src = '/assets/wasm/mathscript.js';
    s.onload = function () {
      MathScript().then(function (m) {
        mod = m;
        api = {
          parse:  m.cwrap('ms_web_parse', 'string', ['string']),
          deriv:  m.cwrap('ms_web_derivative', 'string', ['string', 'string']),
          integ:  m.cwrap('ms_web_integral', 'string', ['string', 'string']),
          isa:    m.cwrap('ms_web_isa', 'string', []),
          ver:    m.cwrap('ms_web_version', 'string', [])
        };
        loading = false;
        runBtn.disabled = false;
        loadBtn.textContent = 'Loaded';
        setState('running', 'badge--teal');
        $('msw-version').textContent = api.ver();
        $('msw-isa').textContent = api.isa().trim() || 'scalar';
        run();
      }).catch(fail);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }

  function fail() {
    loading = false;
    loadBtn.disabled = false;
    setState('unavailable', 'badge--red');
    $('msw-parse').textContent = 'The module could not be loaded.';
  }

  /* A leading "!" is the binding's error marker — the CAS never prints one. */
  function show(el, text) {
    var bad = text.charAt(0) === '!';
    el.textContent = bad ? text.slice(1) : text;
    el.style.opacity = bad ? '.6' : '';
  }

  function run() {
    if (!api) return;
    var e = input.value, v = (varEl.value || 'x').trim();
    show($('msw-parse'), api.parse(e));
    show($('msw-deriv'), api.deriv(e, v));
    show($('msw-integ'), api.integ(e, v));
  }

  loadBtn.addEventListener('click', load);
  runBtn.addEventListener('click', run);
  input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && api) run(); });
  varEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && api) run(); });
}());
