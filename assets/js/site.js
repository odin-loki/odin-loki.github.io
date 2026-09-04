/* =============================================================
   Imortek — site core
   Nav, scroll behaviour, reveal, hero field, live GitHub stats.
   ============================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile nav ---------- */
  function initNav() {
    var toggle = document.querySelector('.nav__toggle');
    var links = document.querySelector('.nav__links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      links.classList.toggle('is-open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });

    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        toggle.setAttribute('aria-expanded', 'false');
        links.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) {
        toggle.setAttribute('aria-expanded', 'false');
        links.classList.remove('is-open');
        document.body.style.overflow = '';
        toggle.focus();
      }
    });

    // Mark current page
    var here = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav__link, .nav__menu a').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      var path = href.replace(/^\.\//, '/').replace(/\.html$/, '').replace(/\/index$/, '');
      if (path === '/' ) path = '/';
      var norm = here.replace(/\.html$/, '');
      if (norm === path || (path !== '/' && norm.endsWith(path))) {
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  /* ---------- Sticky header + scroll progress ---------- */
  function initScroll() {
    var header = document.querySelector('.site-header');
    var bar = document.querySelector('.progress-bar');
    var ticking = false;

    function update() {
      var y = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle('is-stuck', y > 12);
      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var delay = parseFloat(entry.target.dataset.delay || 0);
          setTimeout(function () { entry.target.classList.add('is-in'); }, delay * 1000);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Product card pointer glow ---------- */
  function initCardGlow() {
    if (reduced) return;
    document.querySelectorAll('.product').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- Email de-obfuscation (anti-harvest) ---------- */
  function initEmail() {
    var user = 'odin.loch';
    var host = 'outlook.com.au';
    document.querySelectorAll('[data-email]').forEach(function (el) {
      var addr = user + '@' + host;
      var subject = el.dataset.subject ? ('?subject=' + encodeURIComponent(el.dataset.subject)) : '';
      if (el.tagName === 'A') {
        el.setAttribute('href', 'mailto:' + addr + subject);
        if (el.dataset.email === 'text') el.textContent = addr;
      } else {
        el.textContent = addr;
      }
    });
  }

  /* ---------- Animated counters ---------- */
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.textContent = el.dataset.count; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var target = parseFloat(el.dataset.count);
        var decimals = (el.dataset.count.split('.')[1] || '').length;
        var suffix = el.dataset.suffix || '';
        var prefix = el.dataset.prefix || '';
        var dur = 1100, t0 = performance.now();
        (function step(now) {
          var p = Math.min(1, (now - t0) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          var val = (target * eased).toFixed(decimals);
          el.textContent = prefix + (decimals ? val : Math.round(val).toLocaleString()) + suffix;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Hero: capability lattice field ---------- */
  function initHeroField() {
    var canvas = document.querySelector('.hero__canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, nodes = [], raf = null, sweep = 0;
    var pointer = { x: -9999, y: -9999, on: false };

    function resize() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var density = Math.max(28, Math.min(96, Math.round((w * h) / 15000)));
      nodes = [];
      for (var i = 0; i < density; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 0.9,
          // a few nodes are "capability handles" — brighter, violet
          cap: Math.random() < 0.14
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      var link = Math.min(170, Math.max(110, w / 9));

      // edges
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 > link * link) continue;
          var d = Math.sqrt(d2);
          var alpha = (1 - d / link) * 0.30;
          // sweep highlight
          var mid = (a.x + b.x) / 2;
          var near = 1 - Math.min(1, Math.abs(mid - sweep) / 150);
          ctx.strokeStyle = (a.cap || b.cap)
            ? 'rgba(167,139,250,' + (alpha * (0.7 + near)) + ')'
            : 'rgba(94,234,212,' + (alpha * (0.55 + near * 0.9)) + ')';
          ctx.lineWidth = 0.6 + near * 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // nodes
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        var glow = 1 - Math.min(1, Math.abs(n.x - sweep) / 130);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + glow * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = n.cap
          ? 'rgba(167,139,250,' + (0.55 + glow * 0.45) + ')'
          : 'rgba(94,234,212,' + (0.35 + glow * 0.5) + ')';
        ctx.fill();
        if (n.cap) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(167,139,250,' + (0.12 + glow * 0.25) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      if (!reduced) step();
    }

    function step() {
      sweep += 1.5;
      if (sweep > w + 200) sweep = -200;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
        if (pointer.on) {
          var dx = n.x - pointer.x, dy = n.y - pointer.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 16000 && d2 > 1) {
            var f = (1 - d2 / 16000) * 0.55;
            var d = Math.sqrt(d2);
            n.x += (dx / d) * f; n.y += (dy / d) * f;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', function () {
      cancelAnimationFrame(raf);
      resize();
      frame();
    });
    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.on = pointer.x > -60 && pointer.x < w + 60 && pointer.y > -60 && pointer.y < h + 60;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { pointer.on = false; });

    // Pause when off-screen
    if ('IntersectionObserver' in window && !reduced) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { if (!raf) frame(); }
          else { cancelAnimationFrame(raf); raf = null; }
        });
      }, { threshold: 0 }).observe(canvas);
    }

    resize();
    frame();
  }

  /* ---------- Live GitHub repository stats ---------- */
  var GH_USER = 'odin-loki';
  var GH_CACHE_KEY = 'imortek.gh.v2';
  var GH_TTL = 45 * 60 * 1000; // 45 minutes

  function ghRender(repos) {
    var byName = {};
    repos.forEach(function (r) { byName[r.name.toLowerCase()] = r; });

    // Per-repo stat slots
    document.querySelectorAll('[data-gh-repo]').forEach(function (el) {
      var r = byName[el.dataset.ghRepo.toLowerCase()];
      if (!r) return;
      var field = el.dataset.ghField || 'stars';
      var val;
      if (field === 'stars') val = r.stargazers_count;
      else if (field === 'forks') val = r.forks_count;
      else if (field === 'language') val = r.language || '—';
      else if (field === 'size') val = (r.size / 1024).toFixed(1) + ' MB';
      else if (field === 'updated') val = relTime(r.pushed_at);
      else if (field === 'issues') val = r.open_issues_count;
      if (val !== undefined) { el.textContent = val; el.classList.add('is-live'); }
    });

    // Aggregates
    var totalStars = repos.reduce(function (a, r) { return a + r.stargazers_count; }, 0);
    var langs = {};
    repos.forEach(function (r) { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
    var latest = repos.slice().sort(function (a, b) {
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    })[0];

    setText('[data-gh-total="repos"]', repos.length);
    setText('[data-gh-total="stars"]', totalStars);
    setText('[data-gh-total="languages"]', Object.keys(langs).length);
    setText('[data-gh-total="latest"]', latest ? latest.name : '—');
    setText('[data-gh-total="latest-when"]', latest ? relTime(latest.pushed_at) : '—');

    // Activity feed
    var feed = document.querySelector('[data-gh-feed]');
    if (feed) {
      var recent = repos.slice().sort(function (a, b) {
        return new Date(b.pushed_at) - new Date(a.pushed_at);
      }).slice(0, 6);
      feed.innerHTML = recent.map(function (r) {
        return '<a class="feed__row" href="' + r.html_url + '" target="_blank" rel="noopener">' +
          '<span class="feed__name mono">' + esc(r.name) + '</span>' +
          '<span class="feed__desc">' + esc(r.description || 'No description') + '</span>' +
          '<span class="feed__when mono">' + relTime(r.pushed_at) + '</span>' +
          '</a>';
      }).join('');
      feed.classList.remove('is-loading');
    }

    document.querySelectorAll('[data-gh-status]').forEach(function (el) {
      el.textContent = 'live from api.github.com';
      el.classList.add('is-live');
    });
  }

  function setText(sel, v) {
    document.querySelectorAll(sel).forEach(function (el) { el.textContent = v; el.classList.add('is-live'); });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function relTime(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    if (diff < 2592000) return Math.round(diff / 86400) + 'd ago';
    if (diff < 31536000) return Math.round(diff / 2592000) + 'mo ago';
    return Math.round(diff / 31536000) + 'y ago';
  }

  function initGitHub() {
    if (!document.querySelector('[data-gh-repo], [data-gh-total], [data-gh-feed]')) return;

    try {
      var cached = JSON.parse(localStorage.getItem(GH_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.t < GH_TTL) {
        ghRender(cached.d);
        return;
      }
    } catch (e) { /* storage blocked — fall through to network */ }

    fetch('https://api.github.com/users/' + GH_USER + '/repos?per_page=100&sort=pushed')
      .then(function (r) { if (!r.ok) throw new Error('gh ' + r.status); return r.json(); })
      .then(function (repos) {
        if (!Array.isArray(repos)) throw new Error('bad payload');
        var slim = repos.map(function (r) {
          return {
            name: r.name, html_url: r.html_url, description: r.description,
            language: r.language, stargazers_count: r.stargazers_count,
            forks_count: r.forks_count, open_issues_count: r.open_issues_count,
            size: r.size, pushed_at: r.pushed_at
          };
        });
        try { localStorage.setItem(GH_CACHE_KEY, JSON.stringify({ t: Date.now(), d: slim })); } catch (e) {}
        ghRender(slim);
      })
      .catch(function () {
        // Static fallback values already in the HTML stay as-is.
        document.querySelectorAll('[data-gh-status]').forEach(function (el) {
          el.textContent = 'cached snapshot';
        });
        var feed = document.querySelector('[data-gh-feed]');
        if (feed) feed.classList.remove('is-loading');
      });
  }

  /* ---------- Copy-to-clipboard ---------- */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.dataset.copy;
        var done = function () {
          var old = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = old; }, 1400);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
        else {
          var ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          document.body.removeChild(ta);
        }
      });
    });
  }

  /* ---------- Year ---------- */
  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------- Optional background video slots ----------
     A slot upgrades to video only if the file actually exists. Absent file →
     the canvas animation keeps running, with no console error and no layout
     shift. See docs/VIDEO-SCRIPTS.md. */
  function initVideoSlots() {
    var slots = document.querySelectorAll('[data-video]');
    if (!slots.length) return;

    // Decorative background loops: never fetch them for someone who asked for
    // reduced motion.
    if (reduced) return;

    // tools/build.sh writes this from the contents of assets/video/, so a site
    // with no clips issues no requests for clips that are not there.
    fetch('/assets/video/manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (available) {
        if (!Array.isArray(available) || !available.length) return;
        slots.forEach(function (slot) {
          var base = slot.dataset.video;
          if (!base) return;
          var name = base.split('/').pop();
          if (available.indexOf(name) < 0) return;
          mountVideo(slot, base);
        });
      })
      .catch(function () { /* no manifest — canvas animations stay */ });
  }

  function mountVideo(slot, base) {
    var v = document.createElement('video');
    v.className = 'slot-video';
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.preload = 'metadata';
    if (slot.dataset.poster) v.poster = slot.dataset.poster;

    var webm = document.createElement('source');
    webm.src = base + '.webm';
    webm.type = 'video/webm';
    var mp4 = document.createElement('source');
    mp4.src = base + '.mp4';
    mp4.type = 'video/mp4';
    v.appendChild(webm);
    v.appendChild(mp4);

    v.addEventListener('canplay', function () {
      slot.appendChild(v);
      requestAnimationFrame(function () { v.classList.add('is-in'); });
      var canvas = slot.querySelector('canvas');
      if (canvas) canvas.classList.add('is-superseded');
      slot.classList.add('has-video');
    }, { once: true });

    v.load();
    var playing = v.play();
    if (playing && playing.catch) playing.catch(function () { /* autoplay blocked */ });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initNav();
    initScroll();
    initReveal();
    initCardGlow();
    initEmail();
    initCounters();
    initHeroField();
    initVideoSlots();
    initGitHub();
    initCopy();
    initYear();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* Demo canvases pick their height from the viewport rather than a constant,
     so a phone held sideways does not get a canvas taller than the screen. */
  window.ImortekFitHeight = function (preferred) {
    var vh = window.innerHeight || 800;
    var vw = window.innerWidth || 1024;
    var cap = vh * (vw < 900 && vh < 620 ? 0.66 : 0.74);   // short/landscape gets less
    return Math.round(Math.max(190, Math.min(preferred, cap)));
  };

  window.ImortekReduced = reduced;
})();
