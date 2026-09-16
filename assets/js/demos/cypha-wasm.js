/* =============================================================
   cypha::rff_features, compiled to WebAssembly.

   Measures how well random features reconstruct the exact RBF
   kernel as the feature count grows, for the three projection
   kinds the library implements. 40 KB, loaded on demand.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('cyw-demo');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var api = null, loading = false, last = null;
  var KINDS = [
    { k: 0, name: 'iid Gaussian', colour: '#5eead4' },
    { k: 1, name: 'SORF',         colour: '#fbbf24' },
    { k: 2, name: 'ORF',          colour: '#a78bfa' }
  ];

  function setState(t, cls) { $('cyw-state').textContent = t; $('cyw-state').className = 'badge ' + (cls || 'badge--violet'); }

  function load() {
    if (api || loading) return;
    loading = true; setState('loading\u2026'); $('cyw-load').disabled = true;
    var s = document.createElement('script');
    s.src = '/assets/wasm/cypha.js';
    s.onload = function () {
      Cypha().then(function (m) {
        api = {
          sweep: m.cwrap('cy_web_sweep', 'string', ['number','number','number','number','number','number']),
          err:   m.cwrap('cy_web_rff_error2', 'number', ['number','number','number','number','number','number','number']),
          ver:   m.cwrap('cy_web_version', 'string', [])
        };
        loading = false;
        $('cyw-run').disabled = false;
        $('cyw-load').textContent = 'Loaded';
        setState('running', 'badge--teal');
        $('cyw-version').textContent = api.ver();
        run();
      }).catch(fail);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }
  function fail() { loading = false; $('cyw-load').disabled = false; setState('unavailable', 'badge--red'); }

  function run() {
    if (!api) return;
    var d = parseInt($('cyw-dim').value, 10);
    var gamma = parseFloat($('cyw-gamma').value);
    last = KINDS.map(function (kind) {
      var pts = [];
      for (var D = 2; D <= 256; D *= 2) pts.push({ D: D, e: api.err(kind.k, D, d, 60, gamma, 7, 1) });
      return { kind: kind, pts: pts };
    });
    draw();
    table();
  }

  function table() {
    if (!last) return;
    var rows = ['<b>   D      iid     SORF      ORF</b>'];
    for (var i = 0; i < last[0].pts.length; i++) {
      rows.push('  ' + String(last[0].pts[i].D).padStart(4) + '  ' +
        last.map(function (s) { return s.pts[i].e.toFixed(3).padStart(7); }).join('  '));
    }
    $('cyw-table').innerHTML = '<pre style="margin:0">' + rows.join('\n') + '</pre>';
  }

  function draw() {
    var c = $('cyw-canvas'), ctx = c.getContext('2d');
    var w = c.width = c.clientWidth * (window.devicePixelRatio || 1);
    var h = c.height = (window.ImortekFitHeight ? window.ImortekFitHeight(300) : 300) * (window.devicePixelRatio || 1);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    if (!last) return;
    var pad = 44 * (window.devicePixelRatio || 1);
    var maxE = 0;
    last.forEach(function (s) { s.pts.forEach(function (p) { if (isFinite(p.e)) maxE = Math.max(maxE, p.e); }); });
    if (maxE <= 0) return;
    var n = last[0].pts.length;
    var X = function (i) { return pad + (w - pad * 1.4) * (i / (n - 1)); };
    var Y = function (e) { return h - pad - (h - pad * 1.8) * (e / maxE); };

    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var yy = pad * 0.6 + (h - pad * 1.8) * (g / 4);
      ctx.beginPath(); ctx.moveTo(pad, yy); ctx.lineTo(w - pad * 0.4, yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = (11 * (window.devicePixelRatio || 1)) + 'px ui-monospace, monospace';
    last[0].pts.forEach(function (p, i) { ctx.fillText(String(p.D), X(i) - 8, h - pad * 0.45); });
    ctx.fillText('features D \u2192', pad, h - pad * 0.05);
    ctx.save(); ctx.translate(pad * 0.25, pad * 0.9); ctx.rotate(-Math.PI/2);
    ctx.fillText('\u2016K \u2212 K\u0302\u2016', 0, 0); ctx.restore();

    last.forEach(function (s) {
      ctx.strokeStyle = s.kind.colour; ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
      ctx.beginPath();
      s.pts.forEach(function (p, i) { i ? ctx.lineTo(X(i), Y(p.e)) : ctx.moveTo(X(i), Y(p.e)); });
      ctx.stroke();
      ctx.fillStyle = s.kind.colour;
      s.pts.forEach(function (p, i) { ctx.beginPath(); ctx.arc(X(i), Y(p.e), 3 * (window.devicePixelRatio||1), 0, 6.3); ctx.fill(); });
    });
    var lx = w - pad * 4.2, ly = pad * 0.7;
    last.forEach(function (s, i) {
      ctx.fillStyle = s.kind.colour;
      ctx.fillRect(lx, ly + i * 18 * (window.devicePixelRatio||1), 10, 3);
      ctx.fillText(s.kind.name, lx + 16, ly + 4 + i * 18 * (window.devicePixelRatio||1));
    });
  }

  $('cyw-load').addEventListener('click', load);
  $('cyw-run').addEventListener('click', run);
  ['cyw-dim','cyw-gamma'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      $(id + '-v').textContent = id === 'cyw-gamma' ? parseFloat($(id).value).toFixed(2) : $(id).value;
      if (api) run();
    });
  });
  window.addEventListener('resize', draw);
}());
