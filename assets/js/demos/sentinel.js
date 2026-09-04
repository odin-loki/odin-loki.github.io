/* =============================================================
   SENTINEL — kernel density and Rossmo geographic profiling.

   KDE:    f(s) = (1/nh²) Σ K((s − xᵢ)/h),  Gaussian K
   Rossmo: p(i,j) = Σ_c [ φ·k / d^f  +  (1−φ)·k·B^(g−f) / (2B − d)^g ]
           where φ = 1 when d > B (outside the buffer zone), else 0.

   Both computed live over the points you place.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('sn-demo');
  if (!root) return;

  var canvas = document.getElementById('sn-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 380, dpr = Math.min(window.devicePixelRatio || 1, 2);

  var points = [];            // {x, y} in [0,1]
  var model = 'kde';
  var bw = 0.09, B = 0.10, fExp = 1.2, gExp = 1.2;
  var GRID = 64;
  var kdeGrid = null, rosGrid = null, peakKde = 0, best = null;
  var truthAnchor = null, hitScore = null;

  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp01(v) { return Math.min(0.98, Math.max(0.02, v)); }

  /* ---------- Models ---------- */
  function computeKde() {
    var g = new Float64Array(GRID * GRID);
    if (!points.length) { kdeGrid = g; peakKde = 0; return; }
    var h2 = bw * bw, norm = 1 / (2 * Math.PI * h2 * points.length);
    var max = 0;
    for (var j = 0; j < GRID; j++) {
      var sy = (j + 0.5) / GRID;
      for (var i = 0; i < GRID; i++) {
        var sx = (i + 0.5) / GRID, acc = 0;
        for (var k = 0; k < points.length; k++) {
          var dx = sx - points[k].x, dy = sy - points[k].y;
          acc += Math.exp(-(dx * dx + dy * dy) / (2 * h2));
        }
        var v = acc * norm;
        g[j * GRID + i] = v;
        if (v > max) max = v;
      }
    }
    kdeGrid = g; peakKde = max;
  }

  function computeRossmo() {
    var g = new Float64Array(GRID * GRID);
    if (points.length < 3) { rosGrid = g; best = null; return; }
    var max = 0, bx = 0, by = 0;
    for (var j = 0; j < GRID; j++) {
      var sy = (j + 0.5) / GRID;
      for (var i = 0; i < GRID; i++) {
        var sx = (i + 0.5) / GRID, acc = 0;
        for (var c = 0; c < points.length; c++) {
          // Manhattan distance, as in Rossmo's original formulation
          var d = Math.abs(sx - points[c].x) + Math.abs(sy - points[c].y);
          if (d < 1e-6) d = 1e-6;
          if (d > B) {
            acc += 1 / Math.pow(d, fExp);                       // distance decay
          } else {
            var denom = 2 * B - d;
            if (denom < 1e-6) denom = 1e-6;
            acc += Math.pow(B, gExp - fExp) / Math.pow(denom, gExp);  // buffer zone
          }
        }
        g[j * GRID + i] = acc;
        if (acc > max) { max = acc; bx = sx; by = sy; }
      }
    }
    // normalise to a probability surface
    var sum = 0, n;
    for (n = 0; n < g.length; n++) sum += g[n];
    for (n = 0; n < g.length; n++) g[n] /= (sum || 1);
    rosGrid = g;
    best = { x: bx, y: by, score: max / (sum || 1) };

    // Hit score: rank every cell by probability, find where the true anchor sits.
    // This is how geographic profiling is actually evaluated — the fraction of the
    // map you would have to search, in rank order, before reaching the anchor.
    // 50% is what random guessing gives you.
    if (truthAnchor) {
      var ti = Math.min(GRID - 1, Math.floor(truthAnchor.x * GRID));
      var tj = Math.min(GRID - 1, Math.floor(truthAnchor.y * GRID));
      var tv = g[tj * GRID + ti], better = 0;
      for (var q = 0; q < g.length; q++) if (g[q] > tv) better++;
      hitScore = better / g.length;
    } else {
      hitScore = null;
    }
  }

  function recompute() {
    computeKde();
    computeRossmo();
    updateReadouts();
    draw();
  }

  /* ---------- Rendering ---------- */
  function sizeCanvas() {
    W = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function surfaceImage(grid, ramp) {
    var off = document.createElement('canvas');
    off.width = GRID; off.height = GRID;
    var octx = off.getContext('2d');
    var img = octx.createImageData(GRID, GRID);
    var max = 0, i;
    for (i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
    if (max <= 0) return off;
    for (i = 0; i < grid.length; i++) {
      var t = Math.pow(grid[i] / max, 0.55);
      var c = ramp(t);
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = Math.round(Math.min(1, t * 1.15) * 205);
    }
    octx.putImageData(img, 0, 0);
    return off;
  }

  // teal → amber → red, the conventional density ramp
  function kdeRamp(t) {
    if (t < 0.5) {
      var u = t / 0.5;
      return [Math.round(13 + u * 238), Math.round(148 + u * 43), Math.round(136 - u * 100)];
    }
    var v = (t - 0.5) / 0.5;
    return [251, Math.round(191 - v * 78), Math.round(36 + v * 37)];
  }
  // violet ramp for the profiling surface, so the two never read as the same quantity
  function rosRamp(t) {
    return [Math.round(50 + t * 117), Math.round(30 + t * 109), Math.round(90 + t * 160)];
  }

  function draw() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    ctx.imageSmoothingEnabled = true;
    if ((model === 'rossmo' || model === 'both') && rosGrid && points.length >= 3) {
      ctx.globalAlpha = model === 'both' ? 0.75 : 1;
      ctx.drawImage(surfaceImage(rosGrid, rosRamp), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if ((model === 'kde' || model === 'both') && kdeGrid && points.length) {
      ctx.globalAlpha = model === 'both' ? 0.6 : 1;
      ctx.drawImage(surfaceImage(kdeGrid, kdeRamp), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // street grid, purely as a spatial reference
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += W / 10) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += H / 7) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // incidents
    for (var i = 0; i < points.length; i++) {
      var px = points[i].x * W, py = points[i].y * H;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,238,244,.92)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(4,6,10,.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Rossmo peak
    if (best && (model === 'rossmo' || model === 'both')) {
      var bxp = best.x * W, byp = best.y * H;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bxp, byp, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bxp - 17, byp); ctx.lineTo(bxp - 6, byp);
      ctx.moveTo(bxp + 6, byp); ctx.lineTo(bxp + 17, byp);
      ctx.moveTo(bxp, byp - 17); ctx.lineTo(bxp, byp - 6);
      ctx.moveTo(bxp, byp + 6); ctx.lineTo(bxp, byp + 17);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText('peak p(anchor)', bxp + 16, byp - 12);
    }

    if (truthAnchor && (model === 'rossmo' || model === 'both')) {
      var tx = truthAnchor.x * W, ty = truthAnchor.y * H;
      ctx.strokeStyle = '#5eead4';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(tx, ty, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx - 5, ty - 5); ctx.lineTo(tx + 5, ty + 5);
      ctx.moveTo(tx + 5, ty - 5); ctx.lineTo(tx - 5, ty + 5);
      ctx.stroke();
      ctx.fillStyle = '#5eead4';
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText('true anchor', tx + 13, ty + 4);
    }

    if (!points.length) {
      ctx.fillStyle = '#6b7b8d';
      ctx.font = '400 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to place incidents', W / 2, H / 2 - 6);
      ctx.font = '400 11px ui-monospace, monospace';
      ctx.fillText('KDE needs 1 · Rossmo needs 3', W / 2, H / 2 + 16);
      ctx.textAlign = 'left';
    }
  }

  /* ---------- Readouts ---------- */
  var provEl = document.getElementById('sn-prov');
  function prov(text, cls) {
    var s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text + '\n';
    provEl.appendChild(s);
    while (provEl.childNodes.length > 40) provEl.removeChild(provEl.firstChild);
    provEl.scrollTop = provEl.scrollHeight;
  }

  function updateReadouts() {
    document.getElementById('sn-n').textContent = points.length;
    document.getElementById('sn-peak').textContent = points.length ? peakKde.toFixed(2) : '—';
    var lead = document.getElementById('sn-lead');
    if (!best) {
      lead.className = 'verdict';
      lead.innerHTML = '<div class="verdict__label">No leads</div>' +
        '<div class="verdict__why">Rossmo&rsquo;s formula needs at least three incidents before a ' +
        'profile means anything.</div>';
      return;
    }
    var extra = '';
    if (hitScore !== null) {
      var pct = (hitScore * 100).toFixed(1);
      var verdictWord = hitScore < 0.05 ? 'excellent' : hitScore < 0.15 ? 'useful'
                      : hitScore < 0.35 ? 'weak' : 'no better than guessing';
      extra = '<br><br><strong>Hit score ' + pct + '%</strong> — searching the map in ranked ' +
              'order, you would cover ' + pct + '% of it before reaching the true anchor. ' +
              'Random guessing averages 50%. This run: ' + verdictWord + '.';
    }
    lead.className = 'verdict is-allow';
    lead.innerHTML =
      '<div class="verdict__label">SEARCH AREA RANKED</div>' +
      '<div class="verdict__op mono">x=' + best.x.toFixed(3) + '  y=' + best.y.toFixed(3) +
      '  p=' + best.score.toExponential(2) + '</div>' +
      '<div class="verdict__why">Highest-probability anchor cell under Rossmo with B=' +
      B.toFixed(2) + ', f=' + fExp.toFixed(1) + ', g=' + gExp.toFixed(1) +
      ', over ' + points.length + ' incidents.' + extra + '</div>';
  }

  /* ---------- Interaction ---------- */
  canvas.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    points.push({ x: clamp01(x), y: clamp01(y) });
    truthAnchor = null;   // hand-placed incidents have no known anchor
    prov('ingest    incident #' + points.length + '  (' + x.toFixed(3) + ', ' + y.toFixed(3) + ')  quality=1.00', 'hl');
    prov('  model   kde  bandwidth=' + bw.toFixed(2) + '  kernel=gaussian');
    if (points.length >= 3) prov('  model   rossmo  B=' + B.toFixed(2) + ' f=' + fExp.toFixed(1) + ' g=' + gExp.toFixed(1), 'vi');
    prov('  status  surfaces recomputed', 'ok');
    recompute();
  });

  root.querySelectorAll('[data-model]').forEach(function (b) {
    b.addEventListener('click', function () {
      model = b.dataset.model;
      root.querySelectorAll('[data-model]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      draw();
    });
  });

  function bindRange(id, fmt, set) {
    var el = document.getElementById(id), out = document.getElementById(id + '-v');
    el.addEventListener('input', function () {
      set(parseFloat(el.value));
      out.textContent = fmt(parseFloat(el.value));
      recompute();
    });
  }
  bindRange('sn-bw', function (v) { return v.toFixed(2); }, function (v) { bw = v; });
  bindRange('sn-buffer', function (v) { return v.toFixed(2); }, function (v) { B = v; });
  bindRange('sn-f', function (v) { return v.toFixed(1); }, function (v) { fExp = v; gExp = v; });

  root.querySelectorAll('[data-scenario]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = b.dataset.scenario;
      points = [];
      provEl.innerHTML = '';
      if (s === 'series') {
        // A series by one offender: offences ring a home anchor, avoiding a
        // buffer zone immediately around it. These are exactly Rossmo's assumptions.
        var ax = 0.30 + Math.random() * 0.40, ay = 0.30 + Math.random() * 0.40;
        truthAnchor = { x: ax, y: ay };
        prov('# synthetic series — single offender, stable anchor', 'vi');
        for (var i = 0; i < 16; i++) {
          var ang = Math.random() * Math.PI * 2;
          var r = 0.11 + Math.abs(gauss()) * 0.07;      // buffer + distance decay
          points.push({ x: clamp01(ax + r * Math.cos(ang)), y: clamp01(ay + r * Math.sin(ang)) });
        }
        prov('  truth   anchor at (' + ax.toFixed(3) + ', ' + ay.toFixed(3) + ')', 'warn');
        prov('  note    ground truth is known here only because it is synthetic', 'warn');
      } else if (s === 'dispersed') {
        truthAnchor = null;
        prov('# dispersed offences — no single anchor to find', 'vi');
        for (var j = 0; j < 18; j++) {
          points.push({ x: clamp01(Math.random()), y: clamp01(Math.random()) });
        }
        prov('  note    Rossmo assumes a stable anchor. This violates that.', 'warn');
      } else {
        truthAnchor = null;
      }
      recompute();
    });
  });

  window.addEventListener('resize', function () { sizeCanvas(); draw(); });

  sizeCanvas();
  prov('# sentinel spatial inference ready', 'ok');
  recompute();

  if ('IntersectionObserver' in window) {
    var seeded = false;
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seeded) {
          seeded = true;
          root.querySelector('[data-scenario="series"]').click();
          obs.disconnect();
        }
      });
    }, { threshold: 0.25 }).observe(canvas);
  }
})();
