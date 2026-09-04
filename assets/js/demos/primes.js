/* =============================================================
   Prime meta-pattern — the sieve the network rediscovered.

   Three generators scan the same window of integers:

     conventional   6k±1 lattice → small-prime trial division →
                    deterministic Miller-Rabin
     NN-augmented   6k±1 lattice → distilled scorer at threshold τ →
                    the same Miller-Rabin verifier
     pure NN        the scorer alone, no verifier

   The scorer is a log-odds model over exactly the features Paper 1
   recovered from the trained weights, in the order it recovered them:
   is_6k_pm1, then n mod 5, 7, 11, 13, 17, 19. Each "p does not divide
   n" observation contributes -log(1 - 1/p) — which is what trial
   division looks like written as a likelihood ratio. A per-candidate
   logit jitter stands in for the network's imperfect fit, so recall
   varies with scale the way the paper reports.
   ============================================================= */
(function () {
  'use strict';

  var root = document.getElementById('prime-demo');
  if (!root) return;

  var canvas = document.getElementById('prime-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 200, dpr = Math.min(window.devicePixelRatio || 1, 2);

  var scale = 5;          // s = log10(n)
  var tau = 0.5;          // scorer threshold
  var lane = 'all';
  var WINDOW = 420;       // consecutive integers scanned
  var start = 0;
  var cells = [];
  var stats = null;

  /* ---------- exact primality ---------- */
  // Deterministic for n < 3.317 x 10^24 with the first 13 primes as
  // witnesses — the same bound the paper's verifier cites.
  var WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

  function powmod(b, e, m) {
    var r = 1n;
    b %= m;
    while (e > 0n) {
      if (e & 1n) r = (r * b) % m;
      b = (b * b) % m;
      e >>= 1n;
    }
    return r;
  }

  function millerRabin(nNum) {
    var n = BigInt(nNum);
    if (n < 2n) return false;
    for (var i = 0; i < WITNESSES.length; i++) {
      if (n === WITNESSES[i]) return true;
      if (n % WITNESSES[i] === 0n) return false;
    }
    var d = n - 1n, r = 0n;
    while ((d & 1n) === 0n) { d >>= 1n; r++; }
    outer:
    for (var j = 0; j < WITNESSES.length; j++) {
      var x = powmod(WITNESSES[j], d, n);
      if (x === 1n || x === n - 1n) continue;
      for (var k = 1n; k < r; k++) {
        x = (x * x) % n;
        if (x === n - 1n) continue outer;
      }
      return false;
    }
    return true;
  }

  /* ---------- the distilled scorer ---------- */
  // A real 105 -> 64 -> 1 MLP forward pass, the same size class as the
  // paper's networks, over the same deliberately redundant feature set:
  // the 6k±1 indicator, small-prime residues, the binary bits of n, and
  // a tail of derived features the network learns to mostly ignore.
  //
  // The first-layer weights are hand-set rather than trained, so the
  // network computes exactly the function Paper 1 distilled out of the
  // trained weights: twelve units form clipped ramps that read 0 when
  // p divides n and 1 when it does not, for p in {5,7,11,13,17,19}, and
  // the output layer weights them by -log(1 - 1/p) — trial division
  // written as a likelihood ratio. The remaining 52 hidden units carry
  // the redundant features at small random weights. They contribute the
  // logit noise that costs the network its recall, and they contribute
  // the arithmetic that costs it its speed.
  var RESIDUES = [5, 7, 11, 13, 17, 19];
  var LLR = RESIDUES.map(function (p) { return -Math.log(1 - 1 / p); });
  var LLR_6K = Math.log(3);   // P(6k±1) = 1/3 at random, 1 for a prime

  var NF = 105, NH = 64;
  var SMALL_P = [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79];
  var W1 = new Float64Array(NH * NF), B1 = new Float64Array(NH);
  var W2 = new Float64Array(NH), feat = new Float64Array(NF);

  (function buildWeights() {
    // Deterministic PRNG so the network is the same on every visit.
    var seed = 0x2f6e2b1;
    function rnd() {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296 - 0.5;
    }
    // Units 0..11: clipped ramps on the residue features, two per prime.
    for (var r = 0; r < RESIDUES.length; r++) {
      var fi = 1 + r;              // feature index of (n mod p)/p
      var k = RESIDUES[r];         // slope: one residue step saturates it
      W1[(2 * r) * NF + fi] = k;       B1[2 * r] = 0;
      W1[(2 * r + 1) * NF + fi] = k;   B1[2 * r + 1] = -1;
      W2[2 * r] = LLR[r];
      W2[2 * r + 1] = -LLR[r];     // ReLU(kx) - ReLU(kx - 1) = clip(kx, 0, 1)
    }
    // Units 12..63: the redundant capacity, at small weights.
    for (var h = 12; h < NH; h++) {
      for (var f = 0; f < NF; f++) W1[h * NF + f] = rnd() * 0.42;
      B1[h] = rnd() * 0.3;
      W2[h] = rnd() * 0.62;
    }
  })();

  function features(n) {
    var i;
    feat[0] = (n % 6 === 1 || n % 6 === 5) ? 1 : 0;
    for (i = 0; i < SMALL_P.length; i++) feat[1 + i] = (n % SMALL_P[i]) / SMALL_P[i];
    for (i = 0; i < 32; i++) feat[21 + i] = (n >>> i) & 1;         // binary bits
    var ln = Math.log(n);
    feat[53] = ln / 20;
    feat[54] = 1 / ln;
    feat[55] = (n % 30) / 30;
    feat[56] = (n % 210) / 210;
    feat[57] = (n % 2310) / 2310;
    var d = 0, m = n;
    while (m > 0) { d += m % 10; m = Math.floor(m / 10); }
    feat[58] = d / 60;
    feat[59] = (n % 4) / 4;
    feat[60] = Math.sqrt(n) % 1;
    for (i = 61; i < NF; i++) {                                     // derived tail
      var h = Math.imul(n ^ (i * 0x9e3779b1), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) >>> 0;
      feat[i] = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    return feat;
  }

  // The redundant units carry no signal, so their output is centred and
  // scaled to a residual of realistic spread rather than left to swamp
  // the sieve the first twelve units compute. Calibrated once, at load.
  var NOISE_MEAN = 0, NOISE_SCALE = 1;

  function forward(n) {
    var x = features(n), sieve = 0, noise = 0, h, f, a, base;
    for (h = 0; h < NH; h++) {
      a = B1[h]; base = h * NF;
      for (f = 0; f < NF; f++) a += W1[base + f] * x[f];
      if (a <= 0) continue;
      if (h < 12) sieve += W2[h] * a; else noise += W2[h] * a;
    }
    return { sieve: sieve, noise: noise, on6k: x[0] === 1 };
  }

  (function calibrate() {
    var acc = [], i, s2, m = 0, v = 0;
    for (i = 0; i < 1200; i++) {
      var n = 1000 + Math.floor((i / 1200) * 99000000) + (i * 7919) % 9973;
      acc.push(forward(n).noise);
    }
    for (i = 0; i < acc.length; i++) m += acc[i];
    m /= acc.length;
    for (i = 0; i < acc.length; i++) { s2 = acc[i] - m; v += s2 * s2; }
    v = Math.sqrt(v / acc.length) || 1;
    NOISE_MEAN = m;
    NOISE_SCALE = 1.15 / v;   // ~1.15 logits of residual spread
  })();

  function score(n) {
    var o = forward(n);
    var logit = -Math.log(Math.log(n) - 1);        // prior log-odds of primality
    logit += o.on6k ? LLR_6K : -4;
    logit += o.sieve;
    logit += (o.noise - NOISE_MEAN) * NOISE_SCALE;
    return 1 / (1 + Math.exp(-logit));
  }

  /* ---------- filter strength, per the paper ---------- */
  var SMALL = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  function filterStrength(s) {
    // max(5, 15 * w2(s)) with w2 rising across the scale range.
    return Math.max(5, Math.round(15 * Math.min(1, (s - 2) / 6)));
  }

  /* ---------- the scan ---------- */
  function run() {
    var base = Math.pow(10, scale);
    start = Math.floor(base + Math.random() * base * 0.8);
    if (start % 2 === 0) start++;

    var F = filterStrength(scale);
    cells = [];

    var i, n;
    var conv = { mr: 0, cand: 0, found: 0, us: 0 };
    var aug  = { mr: 0, cand: 0, found: 0, us: 0 };
    var pure = { cand: 0, found: 0, tp: 0, fp: 0, missed: 0, us: 0 };
    var actualPrimes = 0;

    // Ground truth first, so every lane is scored against the same answer.
    var truth = new Array(WINDOW);
    for (i = 0; i < WINDOW; i++) {
      n = start + i;
      truth[i] = millerRabin(n);
      if (truth[i]) actualPrimes++;
    }

    // Conventional: lattice, then trial division, then the verifier.
    function trialDivides(v) {
      for (var f = 0; f < F; f++) if (v !== SMALL[f] && v % SMALL[f] === 0) return false;
      return true;
    }
    var lattice = [];
    for (i = 0; i < WINDOW; i++) {
      n = start + i;
      if (n % 6 === 1 || n % 6 === 5) lattice.push(n);
    }
    conv.cand = aug.cand = pure.cand = lattice.length;

    for (i = 0; i < lattice.length; i++) {
      if (!trialDivides(lattice[i])) continue;
      conv.mr++;
      if (millerRabin(lattice[i])) conv.found++;
    }
    // NN-augmented: the scorer replaces the trial-division filter, and the
    // same verifier still decides. Pure NN: no verifier at all.
    for (i = 0; i < lattice.length; i++) {
      if (score(lattice[i]) < tau) continue;
      aug.mr++;
      pure.found++;
      if (millerRabin(lattice[i])) aug.found++;
    }

    // Time the filters, not the whole scan. This is where the paper's
    // slowdown lives: per-candidate network inference against a handful of
    // modulo operations, with no matching reduction in candidate count.
    // performance.now() is coarse, so repeat until the interval is real.
    function perCandidate(fn) {
      var reps = 0, sink = 0, t = performance.now(), el;
      do {
        for (var j = 0; j < lattice.length; j++) sink += fn(lattice[j]) ? 1 : 0;
        reps++;
        el = performance.now() - t;
      } while (el < 12 && reps < 4000);
      window.__primeSink = sink;
      return el * 1000 / (reps * lattice.length);
    }
    conv.us = perCandidate(trialDivides);
    aug.us = perCandidate(function (v) { return score(v) >= tau; });
    pure.us = aug.us;

    // Per-integer classification for the band, and pure-NN accuracy.
    for (i = 0; i < WINDOW; i++) {
      n = start + i;
      var onLattice = (n % 6 === 1 || n % 6 === 5);
      var sc = onLattice ? score(n) : 0;
      var accepted = onLattice && sc >= tau;
      var isPrime = truth[i];
      if (isPrime) {
        if (accepted) pure.tp++; else pure.missed++;
      } else if (accepted) {
        pure.fp++;
      }
      var kind;
      if (!onLattice) kind = 'lattice';
      else if (isPrime && accepted) kind = 'hit';
      else if (isPrime) kind = 'miss';
      else if (accepted) kind = 'false';
      else kind = 'rejected';
      cells.push({ n: n, kind: kind, p: sc });
    }

    stats = {
      conv: conv, aug: aug, pure: pure,
      primes: actualPrimes, F: F,
      recall: actualPrimes ? pure.tp / actualPrimes : 0,
      skip: pure.cand ? (pure.cand - pure.found) / pure.cand : 0,
      slowdown: conv.us > 0 ? aug.us / conv.us : 0,
      mrSaved: conv.mr > 0 ? 1 - aug.mr / conv.mr : 0
    };

    draw();
    readouts();
  }

  /* ---------- drawing ---------- */
  var COLOUR = {
    lattice:  'rgba(107,123,141,.30)',
    rejected: 'rgba(107,123,141,.62)',
    hit:      '#5eead4',
    miss:     '#f87171',
    'false':  '#fbbf24'
  };

  function resize() {
    W = canvas.clientWidth || root.clientWidth || 640;
    H = window.ImortekFitHeight ? window.ImortekFitHeight(200) : 200;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    if (!cells.length) return;
    ctx.clearRect(0, 0, W, H);

    var cols = Math.ceil(Math.sqrt(WINDOW * W / Math.max(1, H)));
    cols = Math.max(20, Math.min(WINDOW, cols));
    var rows = Math.ceil(WINDOW / cols);
    var pad = 2;
    var cw = (W - pad) / cols, ch = Math.min(cw, (H - 26 - pad) / rows);
    var x0 = 0, y0 = 0;

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var cx = x0 + (i % cols) * cw, cy = y0 + Math.floor(i / cols) * ch;
      var dim = (lane !== 'all') && !inLane(c, lane);
      ctx.globalAlpha = dim ? 0.16 : 1;
      ctx.fillStyle = COLOUR[c.kind];
      ctx.fillRect(cx + pad / 2, cy + pad / 2, Math.max(1, cw - pad), Math.max(1, ch - pad));
      if ((c.kind === 'hit' || c.kind === 'miss') && !dim && cw > 5) {
        ctx.globalAlpha = dim ? 0.16 : 0.55;
        ctx.strokeStyle = COLOUR[c.kind];
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + pad / 2 - 1, cy + pad / 2 - 1,
                       Math.max(1, cw - pad) + 2, Math.max(1, ch - pad) + 2);
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(148,163,184,.75)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(start.toLocaleString() + '  →  ' + (start + WINDOW - 1).toLocaleString(), 1, H - 2);
    var label = stats ? (stats.primes + ' primes in ' + WINDOW + ' integers') : '';
    ctx.textAlign = 'right';
    ctx.fillText(label, W - 1, H - 2);
    ctx.textAlign = 'left';
  }

  function inLane(c, l) {
    if (l === 'conv') return c.kind === 'hit' || c.kind === 'miss';
    if (l === 'nn') return c.kind === 'hit' || c.kind === 'false';
    if (l === 'lost') return c.kind === 'miss';
    return true;
  }

  /* ---------- readouts ---------- */
  function set(id, txt, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    if (cls !== undefined) el.className = cls;
  }

  function readouts() {
    if (!stats) return;
    var s = stats;
    function us(v) { return v < 1 ? v.toFixed(3) + ' µs' : v.toFixed(2) + ' µs'; }

    set('pr-conv-mr', s.conv.mr.toString());
    set('pr-conv-found', s.conv.found + ' / ' + s.primes);
    set('pr-conv-us', us(s.conv.us));

    set('pr-aug-mr', s.aug.mr.toString());
    set('pr-aug-found', s.aug.found + ' / ' + s.primes);
    set('pr-aug-us', us(s.aug.us));

    set('pr-pure-found', s.pure.found.toString());
    set('pr-pure-recall', (s.recall * 100).toFixed(0) + '%');
    set('pr-pure-fp', s.pure.fp.toString());
    set('pr-pure-us', us(s.pure.us));

    set('pr-conv-missed', '0');
    set('pr-aug-missed', (s.primes - s.aug.found).toString());
    set('pr-pure-missed', s.pure.missed.toString());

    set('pr-filter', s.F.toString());
    set('pr-mrsaved', (s.mrSaved * 100).toFixed(0) + '% fewer');
    set('pr-slowdown', s.slowdown >= 1
        ? s.slowdown.toFixed(0) + '× slower'
        : (1 / s.slowdown).toFixed(1) + '× faster');

    var verdict = document.getElementById('pr-verdict');
    if (verdict) {
      if (s.pure.missed === 0 && s.pure.fp === 0) {
        verdict.textContent = 'At this threshold and scale the scorer happens to agree with the ' +
          'verifier on every integer in the window. Move the threshold or the scale and it stops.';
      } else {
        verdict.textContent = 'The scorer skipped ' + s.pure.missed + ' real ' +
          (s.pure.missed === 1 ? 'prime' : 'primes') + ' and waved through ' + s.pure.fp +
          ' ' + (s.pure.fp === 1 ? 'composite' : 'composites') + '. It saves ' +
          (s.mrSaved * 100).toFixed(0) + '% of the verifier calls, and costs ' +
          s.slowdown.toFixed(0) + '× more per candidate to do it.';
      }
    }
  }

  /* ---------- wiring ---------- */
  var sSlider = document.getElementById('pr-scale');
  var tSlider = document.getElementById('pr-tau');

  if (sSlider) sSlider.addEventListener('input', function () {
    scale = parseInt(this.value, 10);
    var out = document.getElementById('pr-scale-v');
    if (out) out.textContent = '10^' + scale;
    run();
  });
  if (tSlider) tSlider.addEventListener('input', function () {
    tau = parseInt(this.value, 10) / 100;
    var out = document.getElementById('pr-tau-v');
    if (out) out.textContent = tau.toFixed(2);
    run();
  });

  root.querySelectorAll('[data-lane]').forEach(function (b) {
    b.addEventListener('click', function () {
      lane = this.getAttribute('data-lane');
      root.querySelectorAll('[data-lane]').forEach(function (o) {
        o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      });
      draw();
    });
  });

  var again = document.getElementById('pr-again');
  if (again) again.addEventListener('click', run);

  window.addEventListener('resize', resize);
  resize();
  run();
})();
