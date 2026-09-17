/* =============================================================
   TRACE, compiled to WebAssembly.

   Two of the engine's own simulations, running for real:
   trace::Engine out of libtrace_core.a, the same library the
   native tools link. Nothing here reimplements the tracker —
   this file draws what it reported and nothing else.

   410 KB of WebAssembly, fetched only when the reader asks.
   ============================================================= */
(function () {
  'use strict';

  var mazeRoot = document.getElementById('tr-maze');
  var seaRoot = document.getElementById('tr-sea');
  if (!mazeRoot && !seaRoot) return;

  var $ = function (id) { return document.getElementById(id); };
  var D = window.D || function (s) { return s; };
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var INK = '#e8eef5', DIM = '#9fb0c2', MUTE = '#6b7b8d';
  var TEAL = '#5eead4', AMBER = '#fbbf24', VIOLET = '#a78bfa',
      BLUE = '#60a5fa', RED = '#f87171';

  /* ---------- one module, shared by both demos ---------- */
  var api = null, loading = false, waiters = [];

  function withApi(cb) {
    if (api) { cb(api); return; }
    waiters.push(cb);
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = '/assets/wasm/trace.js';
    s.onload = function () {
      TRACE().then(function (m) {
        api = {
          maze: m.cwrap('trace_web_maze', 'string',
            ['number','number','number','number','number','number','number','number','number','number']),
          vessels: m.cwrap('trace_web_vessels', 'string',
            ['number','number','number','number','number','number']),
          version: m.cwrap('trace_web_version', 'string', [])
        };
        loading = false;
        var w = waiters; waiters = [];
        w.forEach(function (f) { f(api); });
      })['catch'](fail);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }
  function fail() {
    loading = false;
    var w = waiters; waiters = [];
    w.forEach(function (f) { f(null); });
  }

  function setBadge(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = 'badge ' + (cls || 'badge--violet');
  }
  function pct(x) { return (100 * x).toFixed(0) + '%'; }

  /* Where something was over the last `back` scans.
     Read out of the frames rather than accumulated as the animation runs, so
     dragging the scrubber backwards draws the same trail as playing forwards
     into the same scan — an accumulated trail would show the future. */
  function trail(frames, idx, back, list, id, key) {
    var pts = [];
    for (var k = Math.max(0, idx - back); k <= idx; k++) {
      var arr = frames[k][list];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i][key] === id) { pts.push(arr[i]); break; }
      }
    }
    return pts;
  }

  function strokeTrail(ctx, pts, X, Y, colour, width) {
    if (pts.length < 2) return;
    for (var i = 1; i < pts.length; i++) {
      ctx.globalAlpha = 0.08 + 0.5 * (i / (pts.length - 1));
      ctx.beginPath();
      ctx.moveTo(X(pts[i - 1].x), Y(pts[i - 1].y));
      ctx.lineTo(X(pts[i].x), Y(pts[i].y));
      ctx.strokeStyle = colour; ctx.lineWidth = width || 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* A canvas that follows its column and the viewport height.

     `aspect`, when given, is height/width for the thing being drawn. A 21x11
     maze squeezed into a phone-width canvas of fixed height leaves two thirds
     of it empty, so the canvas takes the drawing's shape instead of the
     drawing taking the canvas's. */
  function sizer(canvas, preferred, aspect) {
    var ctx = canvas.getContext('2d');
    return {
      ctx: ctx, w: 0, h: 0,
      shape: null,
      fit: function () {
        this.h = window.ImortekFitHeight ? window.ImortekFitHeight(preferred) : preferred;
        this.w = canvas.clientWidth || canvas.parentNode.clientWidth || 600;
        if (this.shape) {
          this.h = Math.max(190, Math.min(this.h, Math.round(this.w * this.shape) + 22));
        }
        canvas.width = Math.floor(this.w * DPR);
        canvas.height = Math.floor(this.h * DPR);
        canvas.style.height = this.h + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
    };
  }

  /* A playback head shared by both demos: frames in, rAF out. */
  function player(onFrame) {
    var frames = [], i = 0, playing = false, raf = 0, acc = 0, last = 0, fps = 12;
    function tick(now) {
      if (!playing) return;
      if (!last) last = now;
      acc += now - last; last = now;
      var step = 1000 / fps;
      while (acc >= step) { acc -= step; i = (i + 1) % frames.length; }
      onFrame(frames[i], i);
      raf = requestAnimationFrame(tick);
    }
    return {
      load: function (f) { frames = f; i = 0; onFrame(frames[0], 0); },
      frames: function () { return frames; },
      index: function () { return i; },
      seek: function (k) { i = Math.max(0, Math.min(frames.length - 1, k)); onFrame(frames[i], i); },
      speed: function (v) { fps = v; },
      playing: function () { return playing; },
      play: function () {
        if (playing || !frames.length) return;
        playing = true; last = 0; acc = 0; raf = requestAnimationFrame(tick);
      },
      pause: function () { playing = false; cancelAnimationFrame(raf); }
    };
  }

  /* =========================================================
     1. The maze.
     ========================================================= */
  if (mazeRoot) (function () {
    var cv = $('tr-maze-canvas');
    var S = sizer(cv, 460), ctx = S.ctx;
    var data = null;
    var P = player(drawFrame);

    // Panel tints, so a handoff between cameras is visible as a colour change.
    var TINTS = ['#5eead4','#a78bfa','#fbbf24','#60a5fa','#f472b6','#34d399',
                 '#f59e0b','#818cf8','#2dd4bf','#c084fc','#fb923c','#38bdf8'];

    function opts() {
      return {
        w: parseInt($('tr-w').value, 10),
        h: parseInt($('tr-h').value, 10),
        t: parseInt($('tr-t').value, 10),
        b: parseInt($('tr-b').value, 10),
        pd: parseFloat($('tr-pd').value)
      };
    }

    function labels() {
      var o = opts();
      $('tr-w-v').textContent = o.w + ' × ' + o.h;
      $('tr-t-v').textContent = o.t;
      $('tr-b-v').textContent = o.b;
      $('tr-pd-v').textContent = o.pd.toFixed(2);
    }

    function run() {
      withApi(function (a) {
        if (!a) { setBadge($('tr-maze-state'), D('unavailable'), 'badge--red'); return; }
        setBadge($('tr-maze-state'), D('running…'), 'badge--amber');
        $('tr-run').disabled = true;
        // Yield once so the badge paints before the engine takes the thread.
        setTimeout(function () {
          var o = opts();
          var json = a.maze(o.w, o.h, 4, 3, o.t, o.b, 120, o.pd, 0.10,
                            (Math.random() * 4294967295) >>> 0);
          data = JSON.parse(json);
          $('tr-version').textContent = a.version();
          $('tr-scrub').max = data.frames.length - 1;
          S.shape = data.height / data.width;
          S.fit();
          P.load(data.frames);
          summary();
          setBadge($('tr-maze-state'), D('engine ran in') + ' ' +
            data.summary.wallMs.toFixed(0) + ' ms', 'badge--teal');
          $('tr-run').disabled = false;
          P.play();
          $('tr-play').textContent = D('Pause');
        }, 30);
      });
    }

    function summary() {
      var s = data.summary;
      $('tr-det').textContent = pct(s.det);
      $('tr-rec').textContent = pct(s.rec);
      $('tr-err').textContent = s.err.toFixed(2) + ' m';
      $('tr-sw').textContent = s.sw;
      $('tr-gh').textContent = s.gh;
      $('tr-lat').textContent = s.medianMs.toFixed(2) + ' ms';
      $('tr-rec').className = 'readout__v ' + (s.rec >= 1 ? 'teal' : 'amber');
      $('tr-sw').className = 'readout__v ' + (s.sw === 0 ? 'teal' : 'amber');
    }

    function drawFrame(f, idx) {
      if (!data || !f) return;
      var pad = 10;
      var cols = data.width, rows = data.height, cell = data.cell;
      var scale = Math.min((S.w - pad * 2) / (cols * cell),
                           (S.h - pad * 2) / (rows * cell));
      var ox = (S.w - cols * cell * scale) / 2;
      var oy = (S.h - rows * cell * scale) / 2;
      // World y grows upward; the canvas grows downward.
      var X = function (x) { return ox + x * scale; };
      var Y = function (y) { return oy + (rows * cell - y) * scale; };

      ctx.clearRect(0, 0, S.w, S.h);

      // Camera panels. A dark panel is the point of the whole demo, so it is
      // drawn as absence rather than as another colour.
      data.panels.forEach(function (p, i) {
        var x0 = X(p.x0), x1 = X(p.x1), y0 = Y(p.y1), y1 = Y(p.y0);
        if (p.on) {
          ctx.fillStyle = TINTS[i % TINTS.length] + '14';
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
          ctx.strokeStyle = 'rgba(248,113,113,.16)'; ctx.lineWidth = 1;
          for (var d = -(y1 - y0); d < x1 - x0; d += 9) {
            ctx.beginPath();
            ctx.moveTo(x0 + d, y1); ctx.lineTo(x0 + d + (y1 - y0), y0);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.strokeStyle = p.on ? TINTS[i % TINTS.length] + '3a' : 'rgba(248,113,113,.30)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + .5, y0 + .5, x1 - x0 - 1, y1 - y0 - 1);
      });

      // Walls, from the four-bit mask per cell.
      ctx.strokeStyle = 'rgba(200,220,240,.30)';
      ctx.lineWidth = Math.max(1, scale * 0.09);
      ctx.beginPath();
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var bits = data.walls[r * cols + c];
          var lx = X(c * cell), rx = X((c + 1) * cell);
          var by = Y(r * cell), ty = Y((r + 1) * cell);
          if (bits & 1) { ctx.moveTo(lx, ty); ctx.lineTo(rx, ty); }   // north
          if (bits & 2) { ctx.moveTo(rx, ty); ctx.lineTo(rx, by); }   // east
          if (bits & 4) { ctx.moveTo(lx, by); ctx.lineTo(rx, by); }   // south
          if (bits & 8) { ctx.moveTo(lx, ty); ctx.lineTo(lx, by); }   // west
        }
      }
      ctx.stroke();

      // Where everyone has just been. Twelve scans is enough to read a
      // direction and short enough not to bury the maze under spaghetti.
      f.truth.forEach(function (e) {
        strokeTrail(ctx, trail(data.frames, idx, 12, 'truth', e.id, 'id'), X, Y,
                    e.role === 'subject' ? TEAL : BLUE, 1.6);
      });

      // Tracks first, so truth sits on top of the uncertainty that surrounds it.
      f.tracks.forEach(function (t) {
        var x = X(t.x), y = Y(t.y);
        var ur = Math.max(3, t.u * scale);
        var coasting = t.miss > 0 && t.u > cell * 0.5;
        var col = coasting ? AMBER : VIOLET;
        ctx.beginPath();
        ctx.arc(x, y, ur, 0, Math.PI * 2);
        ctx.fillStyle = col + '1e'; ctx.fill();
        ctx.strokeStyle = col + (coasting ? 'cc' : '88');
        ctx.setLineDash(coasting ? [3, 3] : []);
        ctx.lineWidth = 1.4; ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = col;
        ctx.font = '600 10px ui-monospace,monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t.id, x + 6, y - 7);
      });

      // Ground truth: what the engine is never told.
      f.truth.forEach(function (e, i) {
        var x = X(e.x), y = Y(e.y);
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = e.role === 'subject' ? TEAL : BLUE;
        ctx.fill();
        ctx.strokeStyle = 'rgba(6,8,11,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = 'rgba(6,8,11,.9)';
        ctx.font = '700 8px ui-monospace,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String.fromCharCode(65 + i), x, y + .5);
      });

      // Scan counter, top left, out of the maze's way.
      ctx.fillStyle = MUTE;
      ctx.font = '11px ui-monospace,monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(D('scan') + ' ' + (f.scan + 1) + '/' + data.frames.length +
                   '   ' + f.ms.toFixed(2) + ' ms', 4, 4);

      $('tr-scrub').value = idx;
      $('tr-live-det').textContent = pct(f.m.det);
      $('tr-live-err').textContent = f.m.err.toFixed(2) + ' m';
      $('tr-live-ev').textContent = f.events.length
        ? f.events.map(function (e) { return e.type; }).join(' ')
        : '—';
      $('tr-live-rv').textContent = f.rv
        ? f.rv.a + '↔' + f.rv.b + ' in ' + f.rv.eta.toFixed(0) + ' s (' +
          f.rv.method + ', ' + f.rv.conf.toFixed(2) + ')'
        : D('none predicted');
    }

    $('tr-play').addEventListener('click', function () {
      if (P.playing()) { P.pause(); this.textContent = D('Play'); }
      else { P.play(); this.textContent = D('Pause'); }
    });
    $('tr-scrub').addEventListener('input', function () {
      P.pause(); $('tr-play').textContent = D('Play'); P.seek(parseInt(this.value, 10));
    });
    $('tr-run').addEventListener('click', run);
    ['tr-w','tr-h','tr-t','tr-b','tr-pd'].forEach(function (id) {
      $(id).addEventListener('input', labels);
    });
    window.addEventListener('resize', function () {
      if (!data) return;
      S.fit(); drawFrame(data.frames[P.index()], P.index());
    });
    labels();

    // Nothing is fetched until the section is actually on screen.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); run(); }
      }, { rootMargin: '120px' });
      io.observe(mazeRoot);
    } else {
      run();
    }
  })();

  /* =========================================================
     2. The vessel that goes dark.
     ========================================================= */
  if (seaRoot) (function () {
    var cv = $('tr-sea-canvas');
    var S = sizer(cv, 340), ctx = S.ctx;
    var data = null;
    var P = player(drawFrame);

    function run() {
      withApi(function (a) {
        if (!a) { setBadge($('tr-sea-state'), D('unavailable'), 'badge--red'); return; }
        setBadge($('tr-sea-state'), D('running…'), 'badge--amber');
        $('tr-sea-run').disabled = true;
        setTimeout(function () {
          var dark = parseInt($('tr-dark').value, 10);
          var from = 40;
          var json = a.vessels(5, 120, from, from + dark, 0.80,
                               (Math.random() * 4294967295) >>> 0);
          data = JSON.parse(json);
          $('tr-sea-scrub').max = data.frames.length - 1;
          S.fit();
          P.load(data.frames);
          $('tr-sea-blind').textContent = data.blindScans + ' ' + D('scans');
          $('tr-sea-coast').textContent = (data.maxCoast / 1000).toFixed(1) + ' km';
          var same = data.sameIdentity;
          $('tr-sea-same').textContent = same
            ? D('same track') + ' (' + data.idAfter + ')'
            : (data.idAfter
                ? D('new track') + ' (' + data.idBefore + ' \u2192 ' + data.idAfter + ')'
                : D('not reacquired'));
          $('tr-sea-same').className = 'readout__v ' + (same ? 'teal' : 'amber');
          setBadge($('tr-sea-state'), D('engine ran in') + ' ' +
            data.summary.wallMs.toFixed(0) + ' ms', 'badge--teal');
          $('tr-sea-run').disabled = false;
          P.play();
          $('tr-sea-play').textContent = D('Pause');
        }, 30);
      });
    }

    function drawFrame(f, idx) {
      if (!data || !f) return;
      var pad = 16, barH = 22;
      var w = S.w - pad * 2, h = S.h - pad * 2 - barH;
      var sx = w / (data.x1 - data.x0), sy = h / (data.y1 - data.y0);
      var X = function (x) { return pad + (x - data.x0) * sx; };
      var Y = function (y) { return pad + h - (y - data.y0) * sy; };
      var dark = f.scan >= data.darkFrom && f.scan < data.darkTo;

      ctx.clearRect(0, 0, S.w, S.h);
      ctx.fillStyle = dark ? 'rgba(248,113,113,.07)' : 'rgba(96,165,250,.035)';
      ctx.fillRect(pad, pad, w, h);
      ctx.strokeStyle = dark ? 'rgba(248,113,113,.45)' : 'rgba(40,54,69,1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad + .5, pad + .5, w - 1, h - 1);

      // A grid at 500 km, so the size of an uncertainty ellipse is readable
      // rather than merely large.
      ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= data.x1; gx += 500000) {
        var px = X(gx); ctx.moveTo(px, pad); ctx.lineTo(px, pad + h);
      }
      for (var gy = 0; gy <= data.y1; gy += 500000) {
        var py = Y(gy); ctx.moveTo(pad, py); ctx.lineTo(pad + w, py);
      }
      ctx.stroke();

      // Wakes. Twenty scans is twenty hours of steaming, which is what makes a
      // coasting track visibly peel away from the vessel it is coasting on.
      f.truth.forEach(function (e) {
        strokeTrail(ctx, trail(data.frames, idx, 20, 'truth', e.id, 'id'), X, Y,
                    e.role === 'suspect' ? (dark ? RED : TEAL) : BLUE, 1.4);
      });
      f.tracks.forEach(function (t) {
        strokeTrail(ctx, trail(data.frames, idx, 20, 'tracks', t.id, 'id'), X, Y,
                    VIOLET, 1.1);
      });

      // Tracks, with the uncertainty ellipse that is the whole story here.
      f.tracks.forEach(function (t) {
        var x = X(t.x), y = Y(t.y);
        var coasting = t.miss > 1;
        var col = coasting ? AMBER : VIOLET;
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(2, t.u * sx), Math.max(2, t.u * sy),
                    0, 0, Math.PI * 2);
        ctx.fillStyle = col + '1a'; ctx.fill();
        ctx.strokeStyle = col + (coasting ? 'cc' : '77');
        ctx.setLineDash(coasting ? [3, 3] : []);
        ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
      });

      // Truth. The suspect is the one that stops reporting.
      f.truth.forEach(function (e) {
        var x = X(e.x), y = Y(e.y);
        var suspect = e.role === 'suspect';
        ctx.beginPath();
        ctx.moveTo(x + 6, y); ctx.lineTo(x - 4.5, y - 4); ctx.lineTo(x - 4.5, y + 4);
        ctx.closePath();
        ctx.fillStyle = suspect ? (dark ? RED : TEAL) : BLUE;
        ctx.fill();
        if (suspect) {
          ctx.strokeStyle = dark ? RED : TEAL;
          ctx.lineWidth = 1.2;
          ctx.setLineDash(dark ? [2, 2] : []);
          ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = dark ? RED : TEAL;
          ctx.font = '600 9px ui-monospace,monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(D('suspect'), x, y - 14);
        }
      });

      // A scale bar, because "the circle got big" is not a measurement.
      // Forced left-to-right: a canvas inherits the document's direction, and
      // on an RTL page "500 km" comes out as "km 500". Only this label needs
      // it — the others are translated prose and should follow the page.
      ctx.save();
      ctx.direction = 'ltr';
      var barKm = 500, barPx = barKm * 1000 * sx;
      ctx.strokeStyle = MUTE; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 8, pad + h - 10); ctx.lineTo(pad + 8 + barPx, pad + h - 10);
      ctx.moveTo(pad + 8, pad + h - 13); ctx.lineTo(pad + 8, pad + h - 7);
      ctx.moveTo(pad + 8 + barPx, pad + h - 13); ctx.lineTo(pad + 8 + barPx, pad + h - 7);
      ctx.stroke();
      ctx.fillStyle = MUTE;
      ctx.font = '10px ui-monospace,monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(barKm + ' km', pad + 8, pad + h - 14);
      ctx.restore();

      // The transponder timeline along the bottom.
      var by = S.h - pad - barH + 8, n = data.frames.length;
      ctx.fillStyle = 'rgba(94,234,212,.20)';
      ctx.fillRect(pad, by, w, 6);
      ctx.fillStyle = 'rgba(248,113,113,.65)';
      ctx.fillRect(pad + w * (data.darkFrom / n), by,
                   w * ((data.darkTo - data.darkFrom) / n), 6);
      ctx.fillStyle = INK;
      ctx.fillRect(pad + w * (f.scan / n) - 1, by - 3, 2, 12);
      ctx.fillStyle = MUTE;
      ctx.font = '10px ui-monospace,monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(dark ? D('transponder off — nothing is reporting this vessel')
                        : D('AIS reporting'), pad, by + 10);
      ctx.textAlign = 'right';
      ctx.fillText(D('scan') + ' ' + (f.scan + 1) + '/' + n, pad + w, by + 10);

      $('tr-sea-scrub').value = idx;
      // The suspect's own track, named by the engine's own association — not
      // the widest circle on screen, which in open water is usually a false
      // alarm and was making a rather convincing case for itself.
      var state, cls;
      if (!f.sid) { state = dark ? D('no track — dormant') : D('no track'); cls = 'amber'; }
      else if (f.su > 5000) { state = D('coasting') + ' \u00b1' + (f.su / 1000).toFixed(1) + ' km'; cls = 'amber'; }
      else { state = D('tracked') + ' \u00b1' + (f.su / 1000).toFixed(1) + ' km'; cls = 'teal'; }
      $('tr-sea-u').textContent = state;
      $('tr-sea-u').className = 'readout__v ' + cls;
      $('tr-sea-det').textContent = pct(f.m.det);
    }

    $('tr-sea-play').addEventListener('click', function () {
      if (P.playing()) { P.pause(); this.textContent = D('Play'); }
      else { P.play(); this.textContent = D('Pause'); }
    });
    $('tr-sea-scrub').addEventListener('input', function () {
      P.pause(); $('tr-sea-play').textContent = D('Play'); P.seek(parseInt(this.value, 10));
    });
    $('tr-sea-run').addEventListener('click', run);
    $('tr-dark').addEventListener('input', function () {
      $('tr-dark-v').textContent = this.value + ' ' + D('scans');
    });
    window.addEventListener('resize', function () {
      if (!data) return;
      S.fit(); drawFrame(data.frames[P.index()], P.index());
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); run(); }
      }, { rootMargin: '120px' });
      io.observe(seaRoot);
    } else {
      run();
    }
  })();
})();
