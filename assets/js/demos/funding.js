/* =============================================================
   PBSD port cost model.

   Everything is derived from the assumptions on screen. No figure
   is hard-coded into the total — change an input and the total moves.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('fund-demo');
  if (!root) return;

  var IDS = ['fd-files', 'fd-attempts', 'fd-escalate', 'fd-in', 'fd-out', 'fd-verify'];
  var PRICE_IDS = ['fd-p-small-in', 'fd-p-small-out', 'fd-p-big-in', 'fd-p-big-out'];

  var SCENARIOS = {
    lean:  { 'fd-files':  6000, 'fd-attempts': 2.0, 'fd-escalate': 25, 'fd-in': 20, 'fd-out': 18, 'fd-verify':  4 },
    base:  { 'fd-files': 12000, 'fd-attempts': 3.0, 'fd-escalate': 38, 'fd-in': 30, 'fd-out': 30, 'fd-verify':  7 },
    hard:  { 'fd-files': 24000, 'fd-attempts': 4.5, 'fd-escalate': 55, 'fd-in': 45, 'fd-out': 48, 'fd-verify': 14 }
  };

  // Verification runs on rented CPU. Editable only through the scenario, since
  // it is a rate rather than an assumption about the port itself.
  var CPU_HOURLY = 0.42;   // AUD per core-hour, commodity cloud

  function val(id) { return parseFloat(document.getElementById(id).value); }

  function fmtMoney(v) {
    return 'A$' + Math.round(v).toLocaleString();
  }
  function fmtTokens(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
    return String(Math.round(v));
  }

  function compute() {
    var files = val('fd-files');
    var attempts = val('fd-attempts');
    var escalate = val('fd-escalate') / 100;
    var tokIn = val('fd-in') * 1000;
    var tokOut = val('fd-out') * 1000;
    var verifyHrsPer100 = val('fd-verify');

    var pSmallIn = val('fd-p-small-in'), pSmallOut = val('fd-p-small-out');
    var pBigIn = val('fd-p-big-in'), pBigOut = val('fd-p-big-out');

    var totalAttempts = files * attempts;
    // Every attempt goes through the small model; a share is then retried on the large one.
    var smallAttempts = totalAttempts;
    var bigAttempts = totalAttempts * escalate;

    var smallInTok = smallAttempts * tokIn, smallOutTok = smallAttempts * tokOut;
    var bigInTok = bigAttempts * tokIn, bigOutTok = bigAttempts * tokOut;

    var costSmall = (smallInTok / 1e6) * pSmallIn + (smallOutTok / 1e6) * pSmallOut;
    var costBig = (bigInTok / 1e6) * pBigIn + (bigOutTok / 1e6) * pBigOut;
    var inference = costSmall + costBig;

    var verifyHours = (files / 100) * verifyHrsPer100;
    var verification = verifyHours * CPU_HOURLY;

    var total = inference + verification;
    var tokens = smallInTok + smallOutTok + bigInTok + bigOutTok;

    return {
      files: files, total: total, inference: inference, verification: verification,
      costSmall: costSmall, costBig: costBig, tokens: tokens,
      verifyHours: verifyHours, perFile: files ? total / files : 0
    };
  }

  function render() {
    var r = compute();

    document.getElementById('fd-total').textContent = fmtMoney(r.total);
    document.getElementById('fd-infer').textContent = fmtMoney(r.inference);
    document.getElementById('fd-verify-cost').textContent = fmtMoney(r.verification);
    document.getElementById('fd-tokens').textContent = fmtTokens(r.tokens);
    document.getElementById('fd-perfile').textContent = 'A$' + r.perFile.toFixed(2);

    var rows = [
      ['Small-model inference', r.costSmall, 'var(--teal)',
       'Every attempt starts here — the cheap pass that resolves most files.'],
      ['Large-model escalation', r.costBig, 'var(--violet)',
       'Files the small model could not close, retried at maximum reasoning effort — where most of the output tokens go.'],
      ['Verification compute', r.verification, 'var(--amber)',
       Math.round(r.verifyHours).toLocaleString() + ' core-hours of compile, sanitizer, differential and IR checking.']
    ];
    var max = Math.max.apply(null, rows.map(function (x) { return x[1]; })) || 1;

    document.getElementById('fd-bars').innerHTML = rows.map(function (row) {
      var pct = (row[1] / max) * 100;
      var share = r.total ? (row[1] / r.total) * 100 : 0;
      return '<div class="bar">' +
        '<div class="bar__head"><b>' + row[0] + '</b><span>' + fmtMoney(row[1]) +
        '  ·  ' + share.toFixed(0) + '%</span></div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' + pct.toFixed(1) +
        '%;background:' + row[2] + '"></div></div>' +
        '<div class="bar__note">' + row[3] + '</div>' +
        '</div>';
    }).join('');
  }

  function syncLabels() {
    document.getElementById('fd-files-v').textContent = Math.round(val('fd-files')).toLocaleString();
    document.getElementById('fd-attempts-v').textContent = val('fd-attempts').toFixed(1);
    document.getElementById('fd-escalate-v').textContent = Math.round(val('fd-escalate')) + '%';
    document.getElementById('fd-in-v').textContent = Math.round(val('fd-in')) + 'k';
    document.getElementById('fd-out-v').textContent = Math.round(val('fd-out')) + 'k';
    document.getElementById('fd-verify-v').textContent = val('fd-verify').toFixed(1);
  }

  IDS.concat(PRICE_IDS).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { syncLabels(); render(); });
  });

  root.querySelectorAll('[data-scenario]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = SCENARIOS[b.dataset.scenario];
      Object.keys(s).forEach(function (id) { document.getElementById(id).value = s[id]; });
      root.querySelectorAll('[data-scenario]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      syncLabels(); render();
    });
  });

  syncLabels();
  render();
})();
