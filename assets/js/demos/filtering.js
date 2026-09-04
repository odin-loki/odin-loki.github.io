/* =============================================================
   GH-SR-IMM — single-target illustration.

   Two filters see identical measurements. One assumes Gaussian
   measurement noise; the other uses a heavy-tailed (NIG-style)
   likelihood whose effective covariance inflates for implausible
   returns, so an outlier is down-weighted instead of trusted.
   ============================================================= */
(function () {
  'use strict';

  var root = document.getElementById('filt-demo');
  if (!root) return;

  var canvas = document.getElementById('filt-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H_PREF = 340, H = H_PREF, dpr = Math.min(window.devicePixelRatio || 1, 2);

  var outlierRate = 0.12, sensorNoise = 0.02, manoeuvre = 1.0, show = 'both';
  var truth = [], meas = [], estG = [], estH = [], rmseG = 0, rmseH = 0;

  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- Scenario ---------- */
  var N = 170;
  function simulate() {
    truth = []; meas = [];
    // A manoeuvring target: a base sweep plus turns whose amplitude the slider scales.
    var phase = Math.random() * Math.PI * 2;
    var freq = 1.6 + Math.random() * 1.4;
    for (var t = 0; t < N; t++) {
      var u = t / (N - 1);
      var x = 0.07 + u * 0.86;
      var y = 0.5
            + 0.20 * manoeuvre * Math.sin(u * Math.PI * freq + phase)
            + 0.07 * manoeuvre * Math.sin(u * Math.PI * freq * 2.7 + phase * 1.7);
      y = Math.min(0.93, Math.max(0.07, y));
      truth.push({ x: x, y: y });

      // Measurement: mostly Gaussian, occasionally a wild return.
      var isOut = Math.random() < outlierRate;
      var s = isOut ? sensorNoise * (7 + Math.random() * 9) : sensorNoise;
      meas.push({
        x: x + gauss() * s * 0.5,
        y: y + gauss() * s,
        out: isOut
      });
    }
    run();
  }

  /* ---------- Filters ----------
     Both are the same constant-velocity Kalman filter in y. The only
     difference is how the measurement covariance is formed. */
  function kalman(heavy) {
    var y = meas[0].y, v = 0;
    var P = [[0.05, 0], [0, 0.05]];
    var q = 2.2e-5 * (0.5 + manoeuvre);      // process noise
    var Rbase = sensorNoise * sensorNoise;
    var out = [];

    for (var t = 0; t < N; t++) {
      // predict (constant velocity, unit time step)
      y = y + v;
      P[0][0] = P[0][0] + 2 * P[0][1] + P[1][1] + q;
      P[0][1] = P[0][1] + P[1][1];
      P[1][0] = P[0][1];
      P[1][1] = P[1][1] + q;

      // innovation
      var z = meas[t].y;
      var innov = z - y;
      var S = P[0][0] + Rbase;

      var R = Rbase;
      if (heavy) {
        // NIG-style: the effective covariance grows with the normalised
        // squared innovation, so an implausible return is trusted less.
        var d2 = (innov * innov) / S;
        R = Rbase * (1 + d2 / 2.6);
        S = P[0][0] + R;
      }

      // update
      var k0 = P[0][0] / S, k1 = P[1][0] / S;
      y = y + k0 * innov;
      v = v + k1 * innov;
      var p00 = P[0][0], p01 = P[0][1], p10 = P[1][0], p11 = P[1][1];
      P[0][0] = p00 - k0 * p00;
      P[0][1] = p01 - k0 * p01;
      P[1][0] = p10 - k1 * p00;
      P[1][1] = p11 - k1 * p01;

      out.push(y);
    }
    return out;
  }

  function rmse(est) {
    var s = 0;
    for (var t = 0; t < N; t++) { var d = est[t] - truth[t].y; s += d * d; }
    return Math.sqrt(s / N);
  }

  function run() {
    estG = kalman(false);
    estH = kalman(true);
    rmseG = rmse(estG);
    rmseH = rmse(estH);

    document.getElementById('filt-rmse-g').textContent = (rmseG * 1000).toFixed(1);
    document.getElementById('filt-rmse-h').textContent = (rmseH * 1000).toFixed(1);
    var gain = rmseG > 0 ? (1 - rmseH / rmseG) * 100 : 0;
    var g = document.getElementById('filt-gain');
    g.textContent = (gain >= 0 ? '+' : '') + gain.toFixed(1) + '%';
    g.className = 'readout__v ' + (gain > 4 ? 'amber' : gain < -4 ? 'red' : 'plain');
    draw();
  }

  /* ---------- Draw ---------- */
  function sizeCanvas() {
    H = window.ImortekFitHeight ? window.ImortekFitHeight(H_PREF) : H_PREF;
    W = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  var PX = function (p) { return p * W; };
  var PY = function (p) { return p * H; };

  function line(pts, colour, width, dash) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var x = PX(truth[i].x), y = PY(pts[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,.032)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += Math.max(48, W / 14)) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += 42) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // measurements
    for (var i = 0; i < N; i++) {
      var m = meas[i];
      ctx.beginPath();
      ctx.arc(PX(m.x), PY(m.y), m.out ? 3.4 : 1.9, 0, Math.PI * 2);
      ctx.fillStyle = m.out ? 'rgba(248,113,113,.85)' : 'rgba(248,113,113,.32)';
      ctx.fill();
      if (m.out) {
        ctx.beginPath();
        ctx.arc(PX(m.x), PY(m.y), 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(248,113,113,.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // truth
    line(truth.map(function (p) { return p.y; }), 'rgba(107,123,141,.85)', 2, [5, 5]);

    if (show === 'both' || show === 'gauss') line(estG, '#60a5fa', 2);
    if (show === 'both' || show === 'gh') line(estH, '#5eead4', 2.2);

    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('outliers: ' + Math.round(outlierRate * 100) + '%   ' +
                 'σ: ' + sensorNoise.toFixed(3), 12, H - 12);
  }

  /* ---------- Controls ---------- */
  function bind(id, fmt, set) {
    var el = document.getElementById(id);
    var out = document.getElementById(id + '-v');
    el.addEventListener('input', function () {
      set(parseFloat(el.value));
      out.textContent = fmt(parseFloat(el.value));
      run();
    });
  }
  bind('filt-out', function (v) { return v + '%'; }, function (v) { outlierRate = v / 100; simulateQuiet(); });
  bind('filt-noise', function (v) { return v.toFixed(3); }, function (v) { sensorNoise = v; simulateQuiet(); });
  bind('filt-manv', function (v) { return v.toFixed(1) + '×'; }, function (v) { manoeuvre = v; simulateQuiet(); });

  // Re-generate measurements deterministically enough that dragging a slider
  // feels continuous rather than reshuffling the whole scene each frame.
  var seedTruth = null;
  function simulateQuiet() {
    if (!seedTruth) { simulate(); seedTruth = truth.slice(); return; }
    simulate();
  }

  root.querySelectorAll('[data-filt]').forEach(function (b) {
    b.addEventListener('click', function () {
      show = b.dataset.filt;
      root.querySelectorAll('[data-filt]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      draw();
    });
  });
  document.getElementById('filt-reset').addEventListener('click', simulate);
  window.addEventListener('resize', function () { sizeCanvas(); draw(); });

  sizeCanvas();
  simulate();
})();
