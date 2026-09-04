/* =============================================================
   ParanoidBSD — interactive reference monitor.

   A teaching model of the two authority shapes:
     ambient    — the kernel decides after the fact, from identity
     capability — the operation is unreachable without a handle

   Not a kernel emulator. The real nucleus lives in pbsd/.
   ============================================================= */
(function () {
  'use strict';

  var root = document.getElementById('cap-demo');
  if (!root) return;

  var canvas   = document.getElementById('cap-canvas');
  var opsEl    = document.getElementById('cap-ops');
  var capsEl   = document.getElementById('cap-caps');
  var logEl    = document.getElementById('cap-log');
  var verdictEl= document.getElementById('cap-verdict');
  var reachEl  = document.getElementById('cap-reach');
  var deniedEl = document.getElementById('cap-denied');
  var ctx      = canvas.getContext('2d');
  var reduced  = window.ImortekReduced;

  /* ---------- Model ---------- */

  var CAPS = [
    { id: 'dir',   label: 'dir:/var/app',    desc: 'Read handle to its own directory', on: true  },
    { id: 'net',   label: 'net:egress/tcp',  desc: 'Outbound TCP connect handle',      on: false },
    { id: 'exec',  label: 'mem:exec',        desc: 'Executable-memory handle',         on: false },
    { id: 'debug', label: 'proc:debug',      desc: 'Debug handle over another process',on: false },
    { id: 'shell', label: 'exec:program',    desc: 'Handle to spawn a new program',    on: false }
  ];

  var OPS = [
    {
      id: 'passwd',
      label: 'read the shadow password file',
      call: 'open("/etc/master.passwd", O_RDONLY)',
      target: 'Credential store',
      needs: null,                       // no handle exists for this at all
      ambient: {
        allow: false,
        why: 'Denied — but only afterwards, by discretionary access control. The process was still able to name the file and ask.'
      },
      cap: {
        why: 'Unreachable. The process holds no handle that resolves to this file, so there is no name for it to pass. The request cannot be formed.'
      }
    },
    {
      id: 'config',
      label: 'read its own config file',
      call: 'dir.open("config.toml", Rights::Read)',
      target: '/var/app',
      needs: 'dir',
      ambient: { allow: true, why: 'Allowed. The path resolves and the mode bits permit it.' },
      cap:     { why: 'Allowed. The process holds dir:/var/app and derives a read handle from it — authority narrows, it never widens.' }
    },
    {
      id: 'socket',
      label: 'open an outbound TCP connection',
      call: 'socket(AF_INET, SOCK_STREAM, 0)',
      target: 'Network',
      needs: 'net',
      ambient: { allow: true, why: 'Allowed. Any process may create a socket; nothing in the model says a font parser should not.' },
      cap:     { why: 'Requires net:egress/tcp. Without that handle there is no socket namespace to reach.' }
    },
    {
      id: 'mmap',
      label: 'map writable + executable memory',
      call: 'mmap(..., PROT_WRITE|PROT_EXEC, ...)',
      target: 'Address space',
      needs: 'exec',
      ambient: {
        allow: false,
        why: 'Denied by HardenedBSD. PaX-derived W^X enforcement already blocks this — one of the mitigations PBSD keeps unchanged.'
      },
      cap:     { why: 'Requires mem:exec, and W^X still applies on top. Two independent reasons this fails.' }
    },
    {
      id: 'ptrace',
      label: 'attach a debugger to a sibling process',
      call: 'ptrace(PT_ATTACH, pid, 0, 0)',
      target: 'Sibling process',
      needs: 'debug',
      ambient: { allow: true, why: 'Allowed. Same user id, so the check passes — the process can read another program’s memory.' },
      cap:     { why: 'Requires proc:debug over that specific process. A handle names one target, not a class of targets.' }
    },
    {
      id: 'exec',
      label: 'spawn a shell',
      call: 'execve("/bin/sh", argv, envp)',
      target: 'Program loader',
      needs: 'shell',
      ambient: { allow: true, why: 'Allowed. This is the step that turns almost every memory-safety bug into a foothold.' },
      cap:     { why: 'Requires exec:program. A process that was never given one cannot become a shell, whatever is corrupted inside it.' }
    }
  ];

  var mode = 'capability';
  var currentOp = null;
  var anim = null;

  /* ---------- Evaluate ---------- */

  function held(id) {
    for (var i = 0; i < CAPS.length; i++) if (CAPS[i].id === id) return CAPS[i].on;
    return false;
  }

  function evaluate(op) {
    if (mode === 'ambient') {
      return {
        allow: op.ambient.allow,
        why: op.ambient.why,
        stage: op.ambient.allow ? 'dac' : 'dac',
        note: op.ambient.allow ? 'no handle was required at any point' : 'the request was formed, then refused'
      };
    }
    if (op.needs === null) {
      return { allow: false, why: op.cap.why, stage: 'unreachable', note: 'no handle exists for this resource' };
    }
    var ok = held(op.needs);
    return {
      allow: ok,
      why: op.cap.why,
      stage: ok ? 'granted' : 'nohandle',
      note: ok ? 'handle ' + op.needs + ' presented' : 'handle ' + op.needs + ' not held'
    };
  }

  function reachableCount() {
    var n = 0;
    for (var i = 0; i < OPS.length; i++) if (evaluate(OPS[i]).allow) n++;
    return n;
  }

  /* ---------- Rendering: controls ---------- */

  function renderOps() {
    opsEl.innerHTML = '';
    OPS.forEach(function (op) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = op.label;
      b.setAttribute('aria-pressed', String(currentOp === op.id));
      b.addEventListener('click', function () { run(op); });
      opsEl.appendChild(b);
    });
  }

  function renderCaps() {
    capsEl.innerHTML = '';
    CAPS.forEach(function (c) {
      var wrap = document.createElement('label');
      wrap.className = 'switch';
      wrap.style.alignItems = 'flex-start';
      wrap.innerHTML =
        '<input type="checkbox"' + (c.on ? ' checked' : '') + '>' +
        '<span class="switch__track" style="margin-top:2px"></span>' +
        '<span><span class="mono" style="color:var(--ink);font-size:.82rem">' + c.label + '</span>' +
        '<br><span class="tiny muted">' + c.desc + '</span></span>';
      var input = wrap.querySelector('input');
      input.addEventListener('change', function () {
        c.on = input.checked;
        log((c.on ? 'grant  ' : 'revoke ') + c.label, c.on ? 'ok' : 'warn');
        updateCounts();
        if (currentOp) {
          var op = OPS.filter(function (o) { return o.id === currentOp; })[0];
          if (op) run(op, true);
        } else { draw(); }
      });
      capsEl.appendChild(wrap);
    });
    capsEl.classList.toggle('is-disabled', mode === 'ambient');
    capsEl.style.opacity = mode === 'ambient' ? '.4' : '1';
    capsEl.style.pointerEvents = mode === 'ambient' ? 'none' : '';
  }

  function updateCounts() {
    var r = reachableCount();
    reachEl.textContent = r + '/' + OPS.length;
    deniedEl.textContent = (OPS.length - r) + '/' + OPS.length;
  }

  function log(text, cls) {
    var span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text + '\n';
    logEl.appendChild(span);
    while (logEl.childNodes.length > 60) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setVerdict(res, op) {
    var cls = res.allow ? 'is-allow' : 'is-deny';
    verdictEl.className = 'verdict ' + cls;
    verdictEl.innerHTML =
      '<div class="verdict__label">' + (res.allow ? 'PERMITTED' : 'REFUSED') + '</div>' +
      '<div class="verdict__op mono">' + esc(op.call) + '</div>' +
      '<div class="verdict__why">' + esc(res.why) + '</div>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- Run one operation ---------- */

  function run(op, quiet) {
    currentOp = op.id;
    var res = evaluate(op);
    renderOps();
    setVerdict(res, op);
    updateCounts();

    if (!quiet) {
      log('');
      log('$ ' + op.call, 'hl');
      log('  model    ' + (mode === 'ambient' ? 'ambient authority' : 'handle nucleus'), 'vi');
      log('  monitor  ' + res.note);
      log('  result   ' + (res.allow ? 'PERMITTED' : 'REFUSED'), res.allow ? 'ok' : 'err');
    }

    startAnim(op, res);
  }

  /* ---------- Canvas ---------- */

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H_PREF = 300, H = H_PREF;

  function sizeCanvas() {
    H = window.ImortekFitHeight ? window.ImortekFitHeight(H_PREF) : H_PREF;
    var w = canvas.clientWidth || canvas.parentNode.clientWidth;
    W = w;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var state = { t: 0, playing: false, op: null, res: null, flash: 0 };

  function startAnim(op, res) {
    state.op = op; state.res = res; state.t = 0; state.flash = 0;
    if (reduced) { state.t = 1; draw(); return; }
    state.playing = true;
    if (!anim) loop();
  }

  function loop() {
    anim = requestAnimationFrame(loop);
    if (state.playing) {
      state.t += 0.012;
      if (state.t >= 1) { state.t = 1; state.playing = false; state.flash = 1; }
    } else if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - 0.02);
    }
    draw();
    if (!state.playing && state.flash <= 0) { cancelAnimationFrame(anim); anim = null; }
  }

  function draw() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);

    var procX = 26, procW = Math.min(150, W * 0.26);
    var gateX = W * 0.52;
    var resX  = W - 26 - Math.min(160, W * 0.28);
    var resW  = Math.min(160, W * 0.28);
    var midY  = 150;

    // --- backdrop grid
    ctx.strokeStyle = 'rgba(255,255,255,.03)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    var op = state.op, res = state.res;

    // --- the gate (reference monitor)
    var gateCol = !res ? 'rgba(94,234,212,.5)'
                : res.allow ? 'rgba(94,234,212,.95)' : 'rgba(248,113,113,.95)';
    ctx.strokeStyle = gateCol;
    ctx.lineWidth = 2;
    ctx.setLineDash(mode === 'ambient' ? [5, 6] : []);
    ctx.beginPath(); ctx.moveTo(gateX, 26); ctx.lineTo(gateX, H - 26); ctx.stroke();
    ctx.setLineDash([]);

    if (state.flash > 0 && res) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.5;
      ctx.strokeStyle = gateCol;
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(gateX, 26); ctx.lineTo(gateX, H - 26); ctx.stroke();
      ctx.restore();
    }

    // gate label
    ctx.save();
    ctx.translate(gateX, 18);
    ctx.font = '500 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = mode === 'ambient' ? 'rgba(163,177,192,.75)' : 'rgba(94,234,212,.9)';
    ctx.fillText(mode === 'ambient' ? 'LATE CHECK (uid/gid/MAC)' : 'HANDLE NUCLEUS', 0, 0);
    ctx.restore();

    // --- process box
    ctx.fillStyle = 'rgba(19,27,36,.9)';
    ctx.strokeStyle = 'rgba(40,54,69,1)';
    ctx.lineWidth = 1;
    roundRect(procX, midY - 44, procW, 88, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8eef4';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('process', procX + 14, midY - 22);
    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('uid 1001  untrusted', procX + 14, midY - 6);

    // handle chips on the process
    if (mode === 'capability') {
      var hy = midY + 10, hx = procX + 14;
      var any = false;
      CAPS.forEach(function (c) {
        if (!c.on) return;
        any = true;
        var label = c.id;
        ctx.font = '500 9px ui-monospace, monospace';
        var tw = ctx.measureText(label).width + 12;
        if (hx + tw > procX + procW - 8) { hx = procX + 14; hy += 15; }
        ctx.fillStyle = 'rgba(167,139,250,.16)';
        ctx.strokeStyle = 'rgba(167,139,250,.55)';
        roundRect(hx, hy, tw, 13, 6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#a78bfa';
        ctx.fillText(label, hx + 6, hy + 9.5);
        hx += tw + 5;
      });
      if (!any) {
        ctx.fillStyle = '#6b7b8d';
        ctx.font = 'italic 10px system-ui, sans-serif';
        ctx.fillText('no handles held', procX + 14, midY + 20);
      }
    } else {
      ctx.fillStyle = 'rgba(251,191,36,.85)';
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText('ambient authority', procX + 14, midY + 20);
      ctx.fillStyle = '#6b7b8d';
      ctx.font = '400 9px ui-monospace, monospace';
      ctx.fillText('can name every resource', procX + 14, midY + 34);
    }

    // --- resource box
    var rTitle = op ? op.target : 'Resource';
    var rCol = !res ? 'rgba(40,54,69,1)' : res.allow ? 'rgba(94,234,212,.7)' : 'rgba(40,54,69,1)';
    ctx.fillStyle = 'rgba(15,21,28,.9)';
    ctx.strokeStyle = rCol;
    roundRect(resX, midY - 34, resW, 68, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = res && res.allow ? '#5eead4' : '#a3b1c0';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rTitle, resX + resW / 2, midY - 6);
    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText(res ? (res.allow ? 'reached' : 'not reached') : 'idle', resX + resW / 2, midY + 12);
    ctx.textAlign = 'left';

    if (!op) {
      ctx.fillStyle = '#6b7b8d';
      ctx.font = '400 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pick an operation below to send a request through the monitor',
                   W / 2, H - 14);
      ctx.textAlign = 'left';
      return;
    }

    // --- travelling request
    var startX = procX + procW;
    var stopX  = res.allow ? resX : gateX;
    var x = startX + (stopX - startX) * ease(state.t);

    // trail
    ctx.strokeStyle = res.allow ? 'rgba(94,234,212,.28)' : 'rgba(251,191,36,.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(startX, midY); ctx.lineTo(x, midY); ctx.stroke();
    ctx.setLineDash([]);

    // token
    var tokCol = state.t >= 1 ? (res.allow ? '#5eead4' : '#f87171') : '#fbbf24';
    ctx.beginPath();
    ctx.arc(x, midY, 6, 0, Math.PI * 2);
    ctx.fillStyle = tokCol;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, midY, 11, 0, Math.PI * 2);
    ctx.strokeStyle = tokCol;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // deny burst
    if (!res.allow && state.t >= 1) {
      var rad = 12 + (1 - state.flash) * 22;
      ctx.beginPath();
      ctx.arc(gateX, midY, rad, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(248,113,113,' + (state.flash * 0.7) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillStyle = '#f87171';
      ctx.textAlign = 'center';
      ctx.fillText(res.stage === 'unreachable' ? 'UNREACHABLE'
                 : res.stage === 'nohandle'    ? 'NO HANDLE'
                 : 'REFUSED', gateX, midY + 40);
      ctx.textAlign = 'left';
    }
    if (res.allow && state.t >= 1) {
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillStyle = '#5eead4';
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'ambient' ? 'ALLOWED (no handle needed)' : 'HANDLE ACCEPTED', gateX, midY + 40);
      ctx.textAlign = 'left';
    }

    // caption
    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(op.call.length > 52 ? op.call.slice(0, 50) + '…' : op.call, W / 2, H - 14);
    ctx.textAlign = 'left';
  }

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* ---------- Mode switch ---------- */

  root.querySelectorAll('[data-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.dataset.mode;
      root.querySelectorAll('[data-mode]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      log('');
      log('# authority model → ' + (mode === 'ambient' ? 'ambient (traditional Unix)' : 'handle nucleus (PBSD)'), 'vi');
      renderCaps();
      updateCounts();
      if (currentOp) {
        var op = OPS.filter(function (o) { return o.id === currentOp; })[0];
        if (op) run(op);
      } else { draw(); }
    });
  });

  window.addEventListener('resize', function () { sizeCanvas(); draw(); });

  /* ---------- Boot ---------- */
  sizeCanvas();
  renderOps();
  renderCaps();
  updateCounts();
  draw();
  log('# reference monitor ready', 'ok');
  log('# model: handle nucleus (PBSD). toggle handles on the right.');
})();
