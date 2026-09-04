/* =============================================================
   AEGIS — traffic-correlation attack, run in the browser.

   Five senders each talk to one receiver. The adversary sees only
   per-link volume over time. It correlates every sender series
   against every receiver series and takes the argmax.

   Without shaping the pairing falls out immediately. With constant-rate
   shaping the observed series carry no signal, so correlation is noise
   and recovery drops to chance (1 in 5).
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('ae-demo');
  if (!root) return;

  var canvas = document.getElementById('ae-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 400, dpr = Math.min(window.devicePixelRatio || 1, 2);

  var N = 5;
  var NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];
  var RNAMES = ['R1', 'R2', 'R3', 'R4', 'R5'];

  var cover = false, windowSec = 240, jitter = 0.2;
  var pairing = [], sendSeries = [], recvSeries = [], corr = [], guess = [], stats = {};

  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function newPairing() {
    pairing = shuffle([0, 1, 2, 3, 4]);
    simulate();
    updateReadouts();
  }

  var BINS = 120;                    // time bins across the window
  var CONST_RATE = 1.0;              // the flat wall, in arbitrary units

  function simulate() {
    var bins = BINS;
    var burstiness = [];
    var i, j, t;

    // Each sender has its own conversational rhythm: burst period and duty.
    for (i = 0; i < N; i++) {
      burstiness.push({
        period: 8 + Math.random() * 26,
        phase: Math.random() * 30,
        duty: 0.18 + Math.random() * 0.3,
        amp: 0.35 + Math.random() * 0.55
      });
    }

    var trueSend = [], trueRecv = [];
    for (i = 0; i < N; i++) { trueSend.push(new Float64Array(bins)); }
    for (i = 0; i < N; i++) { trueRecv.push(new Float64Array(bins)); }

    var delay = 2;   // mix delay, in bins
    for (i = 0; i < N; i++) {
      var b = burstiness[i];
      for (t = 0; t < bins; t++) {
        var phaseT = ((t + b.phase) % b.period) / b.period;
        var on = phaseT < b.duty ? 1 : 0;
        var v = on * b.amp * (0.7 + Math.random() * 0.6);
        trueSend[i][t] = v;
        var rt = t + delay;
        if (rt < bins) trueRecv[pairing[i]][rt] += v;
      }
    }

    // What the adversary actually observes on the wire.
    sendSeries = []; recvSeries = [];
    var totalReal = 0, totalWire = 0;
    for (i = 0; i < N; i++) {
      var s = new Float64Array(bins), r = new Float64Array(bins);
      for (t = 0; t < bins; t++) {
        var realS = trueSend[i][t], realR = trueRecv[i][t];
        totalReal += realS;
        if (cover) {
          // Constant rate: the wire shows the same volume whatever is underneath.
          // Real traffic is carried inside that budget; the rest is padding.
          s[t] = CONST_RATE + gauss() * 0.012 * jitter;
          r[t] = CONST_RATE + gauss() * 0.012 * jitter;
        } else {
          s[t] = realS + gauss() * 0.05 * jitter;
          r[t] = realR + gauss() * 0.05 * jitter;
        }
        totalWire += s[t];
      }
      sendSeries.push(s); recvSeries.push(r);
    }

    correlate();

    stats.bandwidth = cover ? (totalWire / Math.max(0.001, totalReal)) : 1;
    stats.latency = cover ? Math.round(delay * (windowSec / BINS) * 1000) : 0;
    render();
  }

  function pearson(a, b, n) {
    var ma = 0, mb = 0, i;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    for (i = 0; i < n; i++) {
      var x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    var den = Math.sqrt(da * db);
    return den < 1e-12 ? 0 : num / den;
  }

  function correlate() {
    // Only the observed portion of the window is available to the adversary.
    var n = Math.max(6, Math.round(BINS * (windowSec / 600)));
    corr = []; guess = [];
    var peak = 0, correct = 0;
    for (var i = 0; i < N; i++) {
      var row = [], best = -2, bestJ = 0;
      for (var j = 0; j < N; j++) {
        var c = pearson(sendSeries[i], recvSeries[j], n);
        row.push(c);
        if (c > best) { best = c; bestJ = j; }
        if (Math.abs(c) > Math.abs(peak)) peak = c;
      }
      corr.push(row);
      guess.push(bestJ);
      if (bestJ === pairing[i]) correct++;
    }
    stats.recovered = correct;
    stats.peak = peak;
  }

  /* ---------- Rendering ---------- */
  function sizeCanvas() {
    W = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSeries(x, y, w, h, series, colour, label) {
    ctx.fillStyle = 'rgba(255,255,255,.02)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(28,37,48,1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);

    var n = Math.max(6, Math.round(BINS * (windowSec / 600)));
    var max = 0;
    for (var i = 0; i < n; i++) max = Math.max(max, series[i]);
    max = Math.max(max, 0.001);

    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var px = x + (i / (n - 1)) * w;
      var py = y + h - (series[i] / (max * 1.12)) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 9px ui-monospace, monospace';
    ctx.fillText(label, x + 5, y + 11);
  }

  function heatColour(v) {
    // −1..1 → dark to amber
    var t = Math.max(0, Math.min(1, (v + 0.15) / 1.15));
    var r = Math.round(30 + t * 221);
    var g = Math.round(40 + t * 151);
    var b = Math.round(51 - t * 15);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function render() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    var colW = Math.min(300, W * 0.30);
    var gap = 16;
    var stripW = (W - colW - gap * 3) / 2;
    var rowH = (H - 46) / N;

    ctx.fillStyle = '#a3b1c0';
    ctx.font = '500 10px ui-monospace, monospace';
    ctx.fillText('SENDER LINKS', gap, 16);
    ctx.fillText('RECEIVER LINKS', gap * 2 + stripW, 16);
    ctx.fillText('CORRELATION', gap * 3 + stripW * 2, 16);

    for (var i = 0; i < N; i++) {
      var y = 26 + i * rowH;
      drawSeries(gap, y, stripW, rowH - 8, sendSeries[i], '#5eead4', NAMES[i]);
      drawSeries(gap * 2 + stripW, y, stripW, rowH - 8, recvSeries[i], '#a78bfa', RNAMES[i]);
    }

    // correlation matrix
    var mx = gap * 3 + stripW * 2;
    var cell = Math.min((colW - 26) / N, (H - 70) / N);
    var my = 34;
    ctx.font = '400 9px ui-monospace, monospace';
    for (var j = 0; j < N; j++) {
      ctx.fillStyle = '#6b7b8d';
      ctx.fillText(RNAMES[j], mx + 26 + j * cell + cell / 2 - 6, my - 5);
    }
    for (i = 0; i < N; i++) {
      ctx.fillStyle = '#6b7b8d';
      ctx.fillText(NAMES[i].slice(0, 4), mx, my + i * cell + cell / 2 + 3);
      for (j = 0; j < N; j++) {
        var v = corr[i][j];
        ctx.fillStyle = heatColour(v);
        ctx.fillRect(mx + 26 + j * cell, my + i * cell, cell - 2, cell - 2);
        // mark the adversary's guess and the truth
        if (guess[i] === j) {
          ctx.strokeStyle = (pairing[i] === j) ? '#f87171' : 'rgba(232,238,244,.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(mx + 27 + j * cell, my + 1 + i * cell, cell - 4, cell - 4);
        }
        if (pairing[i] === j && guess[i] !== j) {
          ctx.strokeStyle = 'rgba(94,234,212,.7)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(mx + 27 + j * cell, my + 1 + i * cell, cell - 4, cell - 4);
          ctx.setLineDash([]);
        }
      }
    }
    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 9px ui-monospace, monospace';
    ctx.fillText('red box = adversary correct', mx, H - 22);
    ctx.fillText('teal dashes = the true pair', mx, H - 10);
  }

  /* ---------- Readouts ---------- */
  function updateReadouts() {
    var recEl = document.getElementById('ae-recovered');
    var peakEl = document.getElementById('ae-peak');
    var vEl = document.getElementById('ae-verdict');

    recEl.textContent = stats.recovered + '/' + N;
    recEl.className = 'readout__v ' + (stats.recovered >= 4 ? 'red' : stats.recovered <= 1 ? '' : 'amber');
    peakEl.textContent = stats.peak.toFixed(3);

    document.getElementById('ae-bw').textContent = stats.bandwidth.toFixed(1) + '×';
    document.getElementById('ae-lat').textContent = stats.latency + ' ms';

    if (stats.recovered >= 4) {
      vEl.className = 'verdict is-deny';
      vEl.innerHTML = '<div class="verdict__label">RELATIONSHIP GRAPH RECOVERED</div>' +
        '<div class="verdict__why">' + stats.recovered + ' of ' + N +
        ' pairs identified from volume and timing alone. No cipher was broken. ' +
        'This is what an unshaped link leaks.</div>';
    } else if (stats.recovered >= 2) {
      vEl.className = 'verdict is-deny';
      vEl.innerHTML = '<div class="verdict__label">PARTIAL RECOVERY</div>' +
        '<div class="verdict__why">' + stats.recovered + ' of ' + N +
        ' pairs correct — above the 1-in-5 chance rate. Widen the observation window and it improves.</div>';
    } else {
      vEl.className = 'verdict is-allow';
      vEl.innerHTML = '<div class="verdict__label">NO PAIRING ABOVE NOISE</div>' +
        '<div class="verdict__why">' + stats.recovered + ' of ' + N +
        ' — indistinguishable from guessing. The wire is a flat wall; correlation has nothing to bite on.</div>';
    }
  }

  function refresh() { simulate(); updateReadouts(); }

  document.getElementById('ae-cover').addEventListener('change', function (e) {
    cover = e.target.checked;
    refresh();
  });
  document.getElementById('ae-time').addEventListener('input', function (e) {
    windowSec = parseInt(e.target.value, 10);
    document.getElementById('ae-time-v').textContent = windowSec + ' s';
    correlate(); render(); updateReadouts();
  });
  document.getElementById('ae-noise').addEventListener('input', function (e) {
    jitter = parseFloat(e.target.value);
    document.getElementById('ae-noise-v').textContent = jitter.toFixed(2);
    refresh();
  });
  document.getElementById('ae-reset').addEventListener('click', newPairing);
  window.addEventListener('resize', function () { sizeCanvas(); render(); });

  sizeCanvas();
  newPairing();
  updateReadouts();
})();
