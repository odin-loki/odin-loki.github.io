/* =============================================================
   SENTINEL's KDEHotspot and HawkesProcess, compiled to
   WebAssembly with Qt for WebAssembly. Loaded on demand.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('snw-demo');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var api = null, loading = false, pts = [], hot = [];

  // A small patch of Sydney, so the numbers look like real coordinates.
  var LAT0 = -33.95, LAT1 = -33.84, LON0 = 151.15, LON1 = 151.25;

  function setState(t, cls) { $('snw-state').textContent = t; $('snw-state').className = 'badge ' + (cls || 'badge--violet'); }

  function load() {
    if (api || loading) return;
    loading = true; setState('loading\u2026'); $('snw-load').disabled = true;
    var s = document.createElement('script');
    s.src = '/assets/wasm/sentinel.js';
    s.onload = function () {
      Sentinel().then(function (m) {
        api = {
          kde: m.cwrap('sn_web_kde','string',['string','number','number','number','number','number','number','number']),
          haw: m.cwrap('sn_web_hawkes','string',['string','string','number'])
        };
        loading = false; $('snw-load').textContent = 'Loaded';
        setState('running', 'badge--teal');
        if (!pts.length) seed();
        run();
      }).catch(fail);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }
  function fail() { loading = false; $('snw-load').disabled = false; setState('unavailable','badge--red'); }

  function seed() {
    pts = [];
    for (var i = 0; i < 14; i++) pts.push([-33.87 + Math.sin(i) * 0.004, 151.21 + Math.cos(i) * 0.004]);
    for (var j = 0; j < 10; j++) pts.push([-33.92 + Math.cos(j) * 0.003, 151.18 + Math.sin(j) * 0.003]);
  }

  function csv() { return pts.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5); }).join(';'); }

  function run() {
    $('snw-n').textContent = String(pts.length);
    if (!api || pts.length < 3) { hot = []; draw(); return; }
    var k = api.kde(csv(), LAT0, LAT1, LON0, LON1, 50, 3, 0.02);
    hot = (k.charAt(0) === '!') ? [] : k.split(';').filter(Boolean).map(function (r) {
      var f = r.split(',').map(Number);
      return { lat: f[0], lon: f[1], peak: f[2], count: f[3], rank: f[4] };
    });
    var h = api.haw(csv(), '', 10).split(',');
    $('snw-alpha').textContent = (h[0].charAt(0) === '!') ? '\u2014' : Number(h[1]).toPrecision(3);
    $('snw-out').innerHTML = hot.length
      ? '<div class="dim">rank  incidents  peak density</div>' + hot.map(function (r) {
          return '<div>  ' + r.rank + '      ' + String(r.count).padStart(4) + '       ' + r.peak.toPrecision(4) + '</div>';
        }).join('') + '<div class="dim" style="margin-top:8px">mu = ' + Number(h[0]).toPrecision(4) + '</div>'
      : '<span class="dim">No hotspot survived suppression.</span>';
    draw();
  }

  function draw() {
    var c = $('snw-canvas'), ctx = c.getContext('2d'), dpr = window.devicePixelRatio || 1;
    var w = c.width = c.clientWidth * dpr;
    var h = c.height = (window.ImortekFitHeight ? window.ImortekFitHeight(340) : 340) * dpr;
    ctx.clearRect(0, 0, w, h);
    var X = function (lon) { return (lon - LON0) / (LON1 - LON0) * w; };
    var Y = function (lat) { return (1 - (lat - LAT0) / (LAT1 - LAT0)) * h; };
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    for (var g = 1; g < 6; g++) {
      ctx.beginPath(); ctx.moveTo(w*g/6, 0); ctx.lineTo(w*g/6, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h*g/6); ctx.lineTo(w, h*g/6); ctx.stroke();
    }
    hot.forEach(function (r, i) {
      var rad = (34 - i * 8) * dpr;
      var grd = ctx.createRadialGradient(X(r.lon), Y(r.lat), 0, X(r.lon), Y(r.lat), rad);
      grd.addColorStop(0, 'rgba(167,139,250,.5)');
      grd.addColorStop(1, 'rgba(167,139,250,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(X(r.lon), Y(r.lat), rad, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#a78bfa';
      ctx.font = (12*dpr) + 'px ui-monospace, monospace';
      ctx.fillText('#' + r.rank, X(r.lon) + rad * 0.5, Y(r.lat) - rad * 0.5);
    });
    ctx.fillStyle = '#5eead4';
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(X(p[1]), Y(p[0]), 2.6*dpr, 0, 6.3); ctx.fill(); });
  }

  $('snw-canvas').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect();
    var lon = LON0 + (e.clientX - r.left) / r.width * (LON1 - LON0);
    var lat = LAT0 + (1 - (e.clientY - r.top) / r.height) * (LAT1 - LAT0);
    pts.push([lat, lon]);
    run();
  });
  $('snw-load').addEventListener('click', load);
  $('snw-seed').addEventListener('click', function () { seed(); run(); });
  $('snw-clear').addEventListener('click', function () { pts = []; hot = []; run(); });
  window.addEventListener('resize', draw);
  draw();
}());
