/* =============================================================
   Cypha — 2-D online classifier.

   A faithful miniature of the real pipeline:
     encoder      → identity, or random Fourier features
     WorldPrior   → shared diagonal Gaussian, fitted online (Welford/EMA)
     Δk           → per-class natural-parameter offsets with MDL decay
     DIFMemory    → classification by log-likelihood ratio vs the prior

   Everything below runs on your machine. No model is downloaded.
   ============================================================= */
(function () {
  'use strict';

  var root = document.getElementById('cypha-demo');
  if (!root) return;

  var canvas = document.getElementById('cy-canvas');
  var ctx = canvas.getContext('2d');

  var CLASSES = [
    { id: 0, name: 'Class A', col: '#5eead4', rgb: [94, 234, 212] },
    { id: 1, name: 'Class B', col: '#a78bfa', rgb: [167, 139, 250] },
    { id: 2, name: 'Class C', col: '#fbbf24', rgb: [251, 191, 36] }
  ];

  var W = 0, H_PREF = 380, H = H_PREF, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var samples = [];         // { x, y, k }   in normalised [0,1] space
  var active = 0;
  var useRFF = false;
  var showSurface = true;
  var lrDelta = 0.05;
  var mdl = 0.001;
  var hover = null;
  var dirty = true;

  /* ---------- Encoder ---------- */
  // Random Fourier features: z(x) = sqrt(2/D) cos(Wx + b), approximating an RBF kernel.
  var RFF_D = 48, RFF_SIGMA = 0.22;
  var rffW = [], rffB = [];
  function seedRFF() {
    rffW = []; rffB = [];
    for (var i = 0; i < RFF_D; i++) {
      rffW.push([gauss() / RFF_SIGMA, gauss() / RFF_SIGMA]);
      rffB.push(Math.random() * Math.PI * 2);
    }
  }
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  seedRFF();

  function encode(x, y) {
    if (!useRFF) return [x, y];
    var z = new Array(RFF_D), s = Math.sqrt(2 / RFF_D);
    for (var i = 0; i < RFF_D; i++) {
      z[i] = s * Math.cos(rffW[i][0] * x + rffW[i][1] * y + rffB[i]);
    }
    return z;
  }
  function dim() { return useRFF ? RFF_D : 2; }

  /* ---------- Model state ---------- */
  var prior, deltas, priorStart;

  function reset() {
    var D = dim();
    prior = { n: 0, mean: zeros(D), m2: ones(D, 0.06) };
    priorStart = null;
    deltas = CLASSES.map(function () {
      return { n: 0, mean: zeros(D), m2: zeros(D), mu: zeros(D), norm: 0 };
    });
  }
  function zeros(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }
  function ones(n, v) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v; return a; }

  // WorldPrior θ₀ — Welford, so it never forgets and never needs a second pass.
  function updatePrior(z) {
    prior.n++;
    for (var i = 0; i < z.length; i++) {
      var d = z[i] - prior.mean[i];
      prior.mean[i] += d / prior.n;
      prior.m2[i] += d * (z[i] - prior.mean[i]);
    }
    if (prior.n === 8) priorStart = prior.mean.slice();
  }
  function priorVar(i) {
    return prior.n > 1 ? Math.max(0.004, prior.m2[i] / (prior.n - 1)) : 0.06;
  }

  // ClassDifferential Δk — the class is a displacement from the world prior in
  // BOTH natural parameters: location and precision. Attracted toward observations,
  // pulled back toward θ₀ by MDL decay.
  var SHRINK = 6;   // pseudo-counts of prior variance mixed into each class scale
  function updateDelta(k, z) {
    var d = deltas[k];
    d.n++;
    var lr = Math.max(lrDelta, 1 / (d.n + 1));   // fast early, settles to lrDelta
    var norm = 0;
    for (var i = 0; i < z.length; i++) {
      // online location + scale
      var prev = d.mean[i];
      d.mean[i] += lr * (z[i] - prev);
      d.m2[i] += (z[i] - prev) * (z[i] - d.mean[i]);
      // MDL decay pulls the differential back toward the prior
      d.mu[i] = (d.mean[i] - prior.mean[i]) * (1 - mdl);
      d.mean[i] = prior.mean[i] + d.mu[i];
      norm += d.mu[i] * d.mu[i];
    }
    d.norm = Math.sqrt(norm);
  }

  function classVar(d, i) {
    // Shrink the class scale toward the world prior — a class seen twice does not
    // get to claim a confident covariance.
    var pv = priorVar(i);
    var n = Math.max(0, d.n - 1);
    return Math.max(0.003, (d.m2[i] + SHRINK * pv) / (n + SHRINK));
  }

  // DIFMemory — log-likelihood ratio of class k against the world prior.
  function llr(z, k) {
    var d = deltas[k];
    if (d.n < 2) return -Infinity;
    var s = 0;
    for (var i = 0; i < z.length; i++) {
      var v0 = priorVar(i);
      var vk = classVar(d, i);
      var r0 = z[i] - prior.mean[i];
      var rk = z[i] - d.mean[i];
      s += 0.5 * Math.log(v0 / vk) + (r0 * r0) / (2 * v0) - (rk * rk) / (2 * vk);
    }
    return s;
  }

  function classify(x, y) {
    var z = encode(x, y);
    var best = -Infinity, bestK = -1, second = -Infinity, scores = [];
    for (var k = 0; k < CLASSES.length; k++) {
      var v = llr(z, k);
      scores.push(v);
      if (v > best) { second = best; best = v; bestK = k; }
      else if (v > second) second = v;
    }
    if (bestK < 0) return null;
    var margin = (second === -Infinity) ? best : best - second;
    var conf = 1 / (1 + Math.exp(-margin * 0.6));
    return { k: bestK, llr: best, margin: margin, conf: conf, scores: scores, ood: best < 0 };
  }

  function driftMagnitude() {
    if (!priorStart) return 0;
    var s = 0;
    for (var i = 0; i < prior.mean.length; i++) {
      var d = prior.mean[i] - priorStart[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  function accuracy() {
    if (!samples.length) return null;
    var right = 0;
    for (var i = 0; i < samples.length; i++) {
      var r = classify(samples[i].x, samples[i].y);
      if (r && r.k === samples[i].k) right++;
    }
    return right / samples.length;
  }

  /* ---------- Training ---------- */
  function addSample(x, y, k) {
    var z = encode(x, y);
    updatePrior(z);
    updateDelta(k, z);
    samples.push({ x: x, y: y, k: k });
    if (samples.length > 900) samples.shift();
    dirty = true;
  }

  // Re-fit from scratch — used when the encoder changes shape.
  function refit() {
    var keep = samples.slice();
    samples = [];
    reset();
    for (var i = 0; i < keep.length; i++) addSample(keep[i].x, keep[i].y, keep[i].k);
    dirty = true;
  }

  /* ---------- Rendering ---------- */
  var surfaceCache = null, surfaceKey = '';

  function sizeCanvas() {
    H = window.ImortekFitHeight ? window.ImortekFitHeight(H_PREF) : H_PREF;
    W = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    surfaceCache = null;
    dirty = true;
  }

  function buildSurface() {
    var CELL = 7;
    var cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
    var off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    var octx = off.getContext('2d');
    var img = octx.createImageData(cols, rows);

    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var x = (i + 0.5) / cols, y = (j + 0.5) / rows;
        var r = classify(x, y);
        var p = (j * cols + i) * 4;
        if (!r) { img.data[p + 3] = 0; continue; }
        var c = CLASSES[r.k].rgb;
        var a = Math.min(0.42, Math.max(0.04, (r.conf - 0.5) * 0.85));
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
        img.data[p + 3] = Math.round(a * 255);
      }
    }
    octx.putImageData(img, 0, 0);
    surfaceCache = off;
  }

  function draw() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);

    // ground
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    // decision surface
    var key = samples.length + '|' + useRFF + '|' + lrDelta + '|' + mdl + '|' + W;
    if (showSurface && deltas.some(function (d) { return d.n > 0; })) {
      if (key !== surfaceKey) { buildSurface(); surfaceKey = key; }
      if (surfaceCache) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(surfaceCache, 0, 0, W, H);
      }
    }

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += Math.max(40, W / 12)) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // world prior — where the shared Gaussian currently sits (identity encoder only)
    if (!useRFF && prior.n > 2) {
      var px = prior.mean[0] * W, py = prior.mean[1] * H;
      var sx = Math.sqrt(priorVar(0)) * W, sy = Math.sqrt(priorVar(1)) * H;
      ctx.save();
      ctx.strokeStyle = 'rgba(163,177,192,.4)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py, sx, sy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(163,177,192,.75)';
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = '400 9px ui-monospace, monospace';
      ctx.fillText('θ₀ world prior', px + 8, py - 6);
      ctx.restore();
    }

    // samples
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      var c = CLASSES[s.k];
      var x = s.x * W, y = s.y * H;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = c.col; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(4,6,10,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // hovered inference
    if (hover) {
      var hx = hover.x * W, hy = hover.y * H;
      var r = classify(hover.x, hover.y);
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2);
      ctx.strokeStyle = r ? CLASSES[r.k].col : 'rgba(163,177,192,.7)';
      ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 14, hy); ctx.lineTo(hx - 5, hy);
      ctx.moveTo(hx + 5, hy); ctx.lineTo(hx + 14, hy);
      ctx.moveTo(hx, hy - 14); ctx.lineTo(hx, hy - 5);
      ctx.moveTo(hx, hy + 5); ctx.lineTo(hx, hy + 14);
      ctx.strokeStyle = 'rgba(232,238,244,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // empty state
    if (!samples.length) {
      ctx.fillStyle = '#6b7b8d';
      ctx.font = '400 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to place samples, or load a dataset below', W / 2, H / 2 - 8);
      ctx.font = '400 11px ui-monospace, monospace';
      ctx.fillText('the model learns from every click — there is no training run', W / 2, H / 2 + 14);
      ctx.textAlign = 'left';
    }
  }

  /* ---------- Readouts ---------- */
  var nEl = document.getElementById('cy-n');
  var accEl = document.getElementById('cy-acc');
  var llrEl = document.getElementById('cy-llr');
  var driftEl = document.getElementById('cy-drift');
  var verdictEl = document.getElementById('cy-verdict');
  var deltasEl = document.getElementById('cy-deltas');

  function updateReadouts() {
    nEl.textContent = samples.length;
    var a = accuracy();
    accEl.textContent = a === null ? '—' : (a * 100).toFixed(1) + '%';
    accEl.className = 'readout__v' + (a === null ? '' : a < 0.62 ? ' red' : a < 0.85 ? ' amber' : '');
    driftEl.textContent = driftMagnitude().toFixed(3);

    deltasEl.innerHTML = CLASSES.map(function (c, k) {
      var d = deltas[k];
      var mag = Math.min(1, d.norm * (useRFF ? 3.2 : 2.4));
      return '<div class="bar">' +
        '<div class="bar__head"><b style="color:' + c.col + '">' + c.name + '</b>' +
        '<span>n=' + d.n + '  ‖Δ‖=' + d.norm.toFixed(3) + '</span></div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' + (mag * 100).toFixed(0) +
        '%;background:' + c.col + '"></div></div></div>';
    }).join('');
  }

  function updateVerdict(x, y) {
    var r = classify(x, y);
    if (!r) {
      verdictEl.className = 'verdict';
      verdictEl.innerHTML = '<div class="verdict__label">Idle</div>' +
        '<div class="verdict__why">No class differential has been fitted yet.</div>';
      llrEl.textContent = '—';
      return;
    }
    llrEl.textContent = r.llr.toFixed(2);
    var c = CLASSES[r.k];
    verdictEl.className = 'verdict ' + (r.ood ? 'is-deny' : 'is-allow');
    verdictEl.innerHTML =
      '<div class="verdict__label" style="color:' + c.col + '">' +
        c.name.toUpperCase() + (r.ood ? ' · OOD' : '') + '</div>' +
      '<div class="verdict__op mono">llr=' + r.llr.toFixed(2) +
        '  margin=' + (isFinite(r.margin) ? r.margin.toFixed(2) : '∞') +
        '  conf=' + (r.conf * 100).toFixed(0) + '%</div>' +
      '<div class="verdict__why">' +
        (r.ood
          ? 'Below the world prior — this point is more likely under θ₀ than under any class. Flagged out of distribution.'
          : 'Argmax log-likelihood ratio against the world prior, with the runner-up ' +
            (isFinite(r.margin) ? r.margin.toFixed(2) + ' nats behind.' : 'not yet fitted.')) +
      '</div>';
  }

  /* ---------- Interaction ---------- */
  function toLocal(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    };
  }

  var painting = false;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    painting = true;
    var p = toLocal(e);
    addSample(p.x, p.y, active);
    updateReadouts(); updateVerdict(p.x, p.y); draw();
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = toLocal(e);
    hover = p;
    if (painting) {
      var last = samples[samples.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.022) {
        addSample(p.x, p.y, active);
        updateReadouts();
      }
    }
    updateVerdict(p.x, p.y);
    draw();
  });
  canvas.addEventListener('pointerup', function () { painting = false; });
  canvas.addEventListener('pointerleave', function () { painting = false; hover = null; draw(); });

  /* ---------- Class picker ---------- */
  var classesEl = document.getElementById('cy-classes');
  function renderClasses() {
    classesEl.innerHTML = '';
    CLASSES.forEach(function (c, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(active === k));
      b.innerHTML = '<span class="dot" style="color:' + c.col + ';display:inline-block;margin-right:7px"></span>' + c.name;
      if (active === k) { b.style.borderColor = c.col; b.style.color = c.col; b.style.background = 'rgba(255,255,255,.04)'; }
      b.addEventListener('click', function () { active = k; renderClasses(); });
      classesEl.appendChild(b);
    });
  }

  /* ---------- Datasets ---------- */
  function loadSet(name) {
    samples = [];
    reset();
    var i, t, r;
    if (name === 'blobs') {
      var centres = [[0.25, 0.30], [0.72, 0.28], [0.48, 0.75]];
      for (i = 0; i < 150; i++) {
        var k = i % 3, c = centres[k];
        addSample(clamp(c[0] + gauss() * 0.065), clamp(c[1] + gauss() * 0.065), k);
      }
    } else if (name === 'rings') {
      // Same centre, different spread — separable only by the scale half of Δk.
      for (i = 0; i < 130; i++) {
        addSample(clamp(0.5 + gauss() * 0.055), clamp(0.5 + gauss() * 0.055), 0);
        var a = Math.random() * Math.PI * 2;
        r = 0.34 + gauss() * 0.022;
        addSample(clamp(0.5 + r * Math.cos(a)), clamp(0.5 + r * Math.sin(a)), 1);
      }
    } else if (name === 'xor') {
      for (i = 0; i < 200; i++) {
        var qx = Math.random() < 0.5 ? 0.27 : 0.73;
        var qy = Math.random() < 0.5 ? 0.27 : 0.73;
        var lab = ((qx > 0.5) !== (qy > 0.5)) ? 1 : 0;
        addSample(clamp(qx + gauss() * 0.075), clamp(qy + gauss() * 0.075), lab);
      }
    }
    updateReadouts();
    updateVerdict(0.5, 0.5);
    draw();
    footNote(name);
  }
  function clamp(v) { return Math.min(0.985, Math.max(0.015, v)); }

  var foot = document.getElementById('cy-foot');
  var footDefault = foot.innerHTML;
  function footNote(name) {
    if (name === 'xor' && !useRFF) {
      foot.innerHTML = '<strong style="color:var(--amber)">XOR with the identity encoder.</strong> ' +
        'A linear log-likelihood ratio cannot separate these quadrants — accuracy sits near chance, ' +
        'exactly as the Cypha README states. Switch on the latent RFF encoder above.';
    } else if (name === 'xor') {
      foot.innerHTML = '<strong style="color:var(--teal)">XOR with random Fourier features.</strong> ' +
        'The encoder lifts the problem into a space where a linear ratio does separate it. ' +
        'This 2-D toy separates cleanly; the same fix takes the real XOR benchmark to about 76%.';
    } else if (name === 'rings') {
      foot.innerHTML = '<strong style="color:var(--teal)">Concentric rings.</strong> ' +
        'Both classes share a centre, so the location half of Δk tells them apart not at all. ' +
        'They separate on scale alone — which is why the class differential offsets the natural ' +
        'parameters, not just the mean.';
    } else {
      foot.innerHTML = footDefault;
    }
  }

  root.querySelectorAll('[data-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = b.dataset.set;
      if (n === 'clear') {
        samples = []; reset(); updateReadouts(); draw(); foot.innerHTML = footDefault;
      } else {
        loadSet(n);
      }
    });
  });

  /* ---------- Toggles ---------- */
  var lastSet = null;
  document.getElementById('cy-rff').addEventListener('change', function (e) {
    useRFF = e.target.checked;
    seedRFF();
    refit();
    updateReadouts(); draw();
    // re-evaluate the XOR footnote if that is what is loaded
    if (foot.innerHTML !== footDefault) footNote('xor');
  });
  document.getElementById('cy-surface').addEventListener('change', function (e) {
    showSurface = e.target.checked; surfaceKey = ''; draw();
  });
  document.getElementById('cy-lr').addEventListener('input', function (e) {
    lrDelta = parseFloat(e.target.value);
    document.getElementById('cy-lr-v').textContent = lrDelta.toFixed(3);
    refit(); updateReadouts(); draw();
  });
  document.getElementById('cy-mdl').addEventListener('input', function (e) {
    mdl = parseFloat(e.target.value);
    document.getElementById('cy-mdl-v').textContent = mdl.toFixed(4);
    refit(); updateReadouts(); draw();
  });

  window.addEventListener('resize', function () { sizeCanvas(); draw(); });

  /* ---------- Boot ---------- */
  reset();
  sizeCanvas();
  renderClasses();
  updateReadouts();
  draw();

  // Seed with something interesting once the demo scrolls into view.
  if ('IntersectionObserver' in window) {
    var seeded = false;
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seeded) {
          seeded = true;
          loadSet('blobs');
          obs.disconnect();
        }
      });
    }, { threshold: 0.25 }).observe(canvas);
  }
})();
