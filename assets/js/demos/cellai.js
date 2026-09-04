/* =============================================================
   Cell AI — Gray-Scott reaction-diffusion, live.

     ∂A/∂t = Dₐ∇²A − AB² + F(1 − A)
     ∂B/∂t = D_b∇²B + AB² − (F + k)B

   Five-point Laplacian, explicit Euler. The same class of dynamics
   the CellularPDE core is built from — shown at a scale you can watch.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('ca-demo');
  if (!root) return;

  var canvas = document.getElementById('ca-canvas');
  var ctx = canvas.getContext('2d');
  var pcan = document.getElementById('ca-partitions');
  var pctx = pcan.getContext('2d');
  var reduced = window.ImortekReduced;

  var GW = 200, GH = 110;          // simulation grid
  var A, B, A2, B2;
  var DA = 1.0, DB = 0.5, F = 0.0545, K = 0.0620, DT = 1.0;
  var speed = 8, steps = 0, running = true, raf = null;
  var img, off, octx;

  // Every preset below was checked to actually pattern at Dₐ=1.0, D_b=0.5, dt=1.0.
  var PRESETS = [
    { name: 'Coral',       f: 0.0545, k: 0.0620 },
    { name: 'Fingerprint', f: 0.0370, k: 0.0600 },
    { name: 'Spots',       f: 0.0300, k: 0.0620 },
    { name: 'Maze',        f: 0.0290, k: 0.0570 },
    { name: 'Solitons',    f: 0.0300, k: 0.0560 },
    { name: 'Chaos',       f: 0.0260, k: 0.0510 }
  ];

  function alloc() {
    A = new Float32Array(GW * GH);
    B = new Float32Array(GW * GH);
    A2 = new Float32Array(GW * GH);
    B2 = new Float32Array(GW * GH);
  }

  function seed() {
    for (var i = 0; i < A.length; i++) { A[i] = 1; B[i] = 0; }
    // a few seeded blobs of B to break symmetry
    for (var s = 0; s < 6; s++) {
      var cx = 20 + Math.random() * (GW - 40);
      var cy = 15 + Math.random() * (GH - 30);
      var r = 4 + Math.random() * 5;
      for (var y = Math.max(0, cy - r); y < Math.min(GH, cy + r); y++) {
        for (var x = Math.max(0, cx - r); x < Math.min(GW, cx + r); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) {
            B[(y | 0) * GW + (x | 0)] = 1;
            A[(y | 0) * GW + (x | 0)] = 0.2;
          }
        }
      }
    }
    steps = 0;
  }

  function step() {
    var w = GW, h = GH;
    for (var y = 0; y < h; y++) {
      var ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, y0 = y * w;
      for (var x = 0; x < w; x++) {
        var xm = (x - 1 + w) % w, xp = (x + 1) % w;
        var i = y0 + x;
        var a = A[i], b = B[i];
        // Nine-point Laplacian, weights -1 / 0.2 / 0.05. The plain five-point
        // stencil with these diffusion rates exceeds the explicit-Euler
        // stability limit and the field saturates instead of patterning.
        var lapA = 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x])
                 + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp])
                 - a;
        var lapB = 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x])
                 + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp])
                 - b;
        var abb = a * b * b;
        var na = a + (DA * lapA - abb + F * (1 - a)) * DT;
        var nb = b + (DB * lapB + abb - (F + K) * b) * DT;
        A2[i] = na < 0 ? 0 : na > 1 ? 1 : na;
        B2[i] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
    }
    var t;
    t = A; A = A2; A2 = t;
    t = B; B = B2; B2 = t;
    steps++;
  }

  /* ---------- Rendering ---------- */
  function initImage() {
    off = document.createElement('canvas');
    off.width = GW; off.height = GH;
    octx = off.getContext('2d');
    img = octx.createImageData(GW, GH);
  }

  function render() {
    var d = img.data;
    for (var i = 0; i < B.length; i++) {
      var v = B[i];
      var t = Math.min(1, Math.max(0, v * 2.6));
      // dark ground → teal → violet, matching the site palette
      var r, g, bl;
      if (t < 0.5) {
        var u = t / 0.5;
        r = 4 + u * 10; g = 6 + u * 228; bl = 10 + u * 202;
      } else {
        var s = (t - 0.5) / 0.5;
        r = 14 + s * 153; g = 234 - s * 95; bl = 212 + s * 38;
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = bl; d[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.clientWidth, CA_H);
  }

  function renderPartitions() {
    var w = pcan.clientWidth, h = 90;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (pcan.width !== Math.floor(w * dpr)) {
      pcan.width = Math.floor(w * dpr);
      pcan.height = Math.floor(h * dpr);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = '#04060a';
    pctx.fillRect(0, 0, w, h);

    // N = 4 partitions across the field, as in CellularPDE
    var N = 4, means = [];
    var colW = Math.floor(GW / N);
    for (var p = 0; p < N; p++) {
      var sum = 0, n = 0;
      for (var y = 0; y < GH; y++) {
        for (var x = p * colW; x < (p + 1) * colW && x < GW; x++) { sum += B[y * GW + x]; n++; }
      }
      means.push(n ? sum / n : 0);
    }
    var maxM = Math.max(0.001, Math.max.apply(null, means));
    var bw = (w - 10 * (N + 1)) / N;
    var COLS = ['#5eead4', '#7dd3c8', '#a78bfa', '#8b5cf6'];
    for (p = 0; p < N; p++) {
      var bh = (means[p] / maxM) * (h - 26);
      var x0 = 10 + p * (bw + 10);
      pctx.fillStyle = 'rgba(255,255,255,.04)';
      pctx.fillRect(x0, 8, bw, h - 26);
      pctx.fillStyle = COLS[p];
      pctx.fillRect(x0, 8 + (h - 26 - bh), bw, bh);
      pctx.fillStyle = '#6b7b8d';
      pctx.font = '400 9px ui-monospace, monospace';
      pctx.fillText('P' + p, x0 + bw / 2 - 6, h - 5);
    }
    return means;
  }

  function updateReadouts(means) {
    var sum = 0, act = 0;
    for (var i = 0; i < B.length; i++) {
      sum += B[i];
      if (B[i] > 0.12 && B[i] < 0.6) act++;      // cells in the reacting band
    }
    var meanB = sum / B.length;
    document.getElementById('ca-steps').textContent = steps.toLocaleString();
    document.getElementById('ca-meanb').textContent = meanB.toFixed(4);
    document.getElementById('ca-activity').textContent = (act / B.length).toFixed(4);

    var regime = document.getElementById('ca-regime');
    var frac = act / B.length;
    if (meanB < 0.004) { regime.textContent = 'extinct'; regime.className = 'readout__v red'; }
    else if (meanB > 0.42) { regime.textContent = 'saturated'; regime.className = 'readout__v amber'; }
    else if (frac > 0.78) { regime.textContent = 'turbulent'; regime.className = 'readout__v amber'; }
    else if (frac < 0.02) { regime.textContent = 'quiescent'; regime.className = 'readout__v amber'; }
    else { regime.textContent = 'patterning'; regime.className = 'readout__v'; }
  }

  /* ---------- Loop ---------- */
  var frameCount = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!running) return;
    for (var s = 0; s < speed; s++) step();
    render();
    if ((frameCount++ % 6) === 0) {
      var means = renderPartitions();
      updateReadouts(means);
    }
  }

  /* ---------- Interaction ---------- */
  function inject(e) {
    var r = canvas.getBoundingClientRect();
    var gx = Math.floor(((e.clientX - r.left) / r.width) * GW);
    var gy = Math.floor(((e.clientY - r.top) / r.height) * GH);
    var rad = 5;
    for (var y = gy - rad; y <= gy + rad; y++) {
      for (var x = gx - rad; x <= gx + rad; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if ((x - gx) * (x - gx) + (y - gy) * (y - gy) > rad * rad) continue;
        B[y * GW + x] = 1;
        A[y * GW + x] = 0.2;
      }
    }
  }
  var painting = false;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId); painting = true; inject(e);
  });
  canvas.addEventListener('pointermove', function (e) { if (painting) inject(e); });
  canvas.addEventListener('pointerup', function () { painting = false; });
  canvas.addEventListener('pointerleave', function () { painting = false; });

  var presetEl = document.getElementById('ca-presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.name;
    b.addEventListener('click', function () {
      F = p.f; K = p.k;
      document.getElementById('ca-feed').value = F;
      document.getElementById('ca-kill').value = K;
      document.getElementById('ca-feed-v').textContent = F.toFixed(4);
      document.getElementById('ca-kill-v').textContent = K.toFixed(4);
      presetEl.querySelectorAll('.chip').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      seed();
    });
    presetEl.appendChild(b);
  });

  document.getElementById('ca-feed').addEventListener('input', function (e) {
    F = parseFloat(e.target.value);
    document.getElementById('ca-feed-v').textContent = F.toFixed(4);
  });
  document.getElementById('ca-kill').addEventListener('input', function (e) {
    K = parseFloat(e.target.value);
    document.getElementById('ca-kill-v').textContent = K.toFixed(4);
  });
  document.getElementById('ca-speed').addEventListener('input', function (e) {
    speed = parseInt(e.target.value, 10);
    document.getElementById('ca-speed-v').textContent = speed;
  });
  document.getElementById('ca-pause').addEventListener('click', function () {
    running = !running;
    this.textContent = running ? 'Pause' : 'Resume';
  });
  document.getElementById('ca-reset').addEventListener('click', seed);

  var CA_H_PREF = 380, CA_H = CA_H_PREF;
  function sizeCanvas() {
    CA_H = window.ImortekFitHeight ? window.ImortekFitHeight(CA_H_PREF) : CA_H_PREF;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(CA_H * dpr);
    canvas.style.height = CA_H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', function () { sizeCanvas(); render(); });

  alloc(); initImage(); seed(); sizeCanvas();
  presetEl.querySelectorAll('.chip')[0].setAttribute('aria-pressed', 'true');   // Coral

  if (reduced) {
    for (var i = 0; i < 900; i++) step();
    render(); updateReadouts(renderPartitions());
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { if (!raf) loop(); }
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      });
    }, { threshold: 0.1 }).observe(canvas);
  } else {
    loop();
  }
})();
