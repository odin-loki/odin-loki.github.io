/* =============================================================
   Voice — read the page aloud, and drive it by speaking.

   Built so that somebody who cannot see the screen can use this
   site. Two browser APIs do the acoustic work, because they are
   already there and they are good:

     speechSynthesis      text to speech
     SpeechRecognition    speech to text

   Cypha does not do audio and no claim is made that it does. What
   it does here is the part the browser is bad at: turning a rough
   transcript into the right command. "Take me to paranoid bee es
   dee" has to become /pbsd.html, and which mishearings your voice
   produces is personal, so it is learned rather than hard-coded.

     phonetics    a Metaphone-style key, so "kernal" reaches
                  "kernel" and "sentinal" reaches "sentinel"
     retrieval    the spoken phrase is embedded with the same
                  hashed projection as every page (see
                  tools/gen_voice_index.py) and compared by cosine,
                  so a description finds a page without naming it
     Cypha        ranks the candidates, and corrects itself from
                  what you actually accept — the same WorldPrior and
                  log-likelihood-ratio structure as /cypha.html

   Everything runs locally. The recogniser is the browser's, the
   index is a static file, and what Cypha learns about your voice
   stays in your localStorage.
   ============================================================= */
(function (root) {
  'use strict';

  var synth = root.speechSynthesis;
  var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  if (!synth && !SR) return;

  var KEY = 'imortek.voice.v1';
  var index = null, indexP = null;
  var blocks = [], at = -1, reading = false, rec = null, listening = false;
  var panel, statusEl, liveEl;

  /* ---------- phonetics ----------
     A cut-down Metaphone: enough to collapse the mishearings a speech
     recogniser actually produces, without the full ruleset. */
  function phone(w) {
    w = String(w).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return '';
    w = w.replace(/^(kn|gn|pn|ae|wr)/, function (m) { return m.charAt(1); })
         .replace(/^x/, 's').replace(/^wh/, 'w');
    w = w.replace(/mb$/, 'm');
    var out = '', prev = '';
    for (var i = 0; i < w.length; i++) {
      var c = w[i], n = w[i + 1] || '';
      if (c === prev && c !== 'c') continue;
      prev = c;
      if ('aeiou'.indexOf(c) >= 0) { if (i === 0) out += c; continue; }
      switch (c) {
        case 'b': out += 'b'; break;
        case 'c': out += (n === 'h') ? 'x' : ('iey'.indexOf(n) >= 0 ? 's' : 'k'); break;
        case 'd': out += (n === 'g') ? 'j' : 't'; break;
        case 'g': out += (n === 'h' || n === 'n') ? '' : ('iey'.indexOf(n) >= 0 ? 'j' : 'k'); break;
        case 'h': out += ('aeiou'.indexOf(w[i - 1]) >= 0 && 'aeiou'.indexOf(n) < 0) ? '' : 'h'; break;
        case 'k': out += (w[i - 1] === 'c') ? '' : 'k'; break;
        case 'p': out += (n === 'h') ? 'f' : 'p'; break;
        case 'q': out += 'k'; break;
        case 's': out += (n === 'h') ? 'x' : 's'; break;
        case 't': out += (n === 'h') ? '0' : 't'; break;
        case 'v': out += 'f'; break;
        case 'w': case 'y': out += ('aeiou'.indexOf(n) >= 0) ? c : ''; break;
        case 'x': out += 'ks'; break;
        case 'z': out += 's'; break;
        default:  out += c;
      }
    }
    return out;
  }

  /* ---------- the spoken phrase as a sparse TF-IDF vector ---------- */
  /* Mirrors stem() in tools/gen_voice_index.py exactly. If these drift, the
     query and the index stop speaking the same language. */
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w))  return w.slice(0, -3) + "y";
    if (w.length > 4 && /sses$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ally$/.test(w)) return w.slice(0, -4) + "al";
    if (w.length > 4 && /ly$/.test(w))   return w.slice(0, -2);
    if (w.length > 5 && /ing$/.test(w)) { var b = w.slice(0, -3); return (b.length > 3 && b.slice(-1) === b.slice(-2, -1)) ? b.slice(0, -1) : b; }
    if (w.length > 4 && /ed$/.test(w))  { var c = w.slice(0, -2); return (c.length > 3 && c.slice(-1) === c.slice(-2, -1)) ? c.slice(0, -1) : c; }
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function embed(text) {
    if (!index) return null;
    var counts = {}, toks = String(text).toLowerCase().match(/[a-z][a-z'+-]{1,}/g) || [];
    toks.forEach(function (t) { t = stem(t); counts[t] = (counts[t] || 0) + 1; });
    var v = {}, any = false, w, idf, n = 0;
    for (w in counts) {
      idf = index.idf[w];
      if (idf === undefined) continue;
      any = true;
      v[w] = (1 + Math.log(counts[w])) * idf;
    }
    if (!any) return null;
    for (w in v) n += v[w] * v[w];
    n = Math.sqrt(n) || 1;
    for (w in v) v[w] /= n;
    return v;
  }
  /* Cosine over the smaller of the two sparse vectors. */
  function cosine(q, pageVec) {
    var s = 0, w;
    for (w in q) if (pageVec[w] !== undefined) s += q[w] * pageVec[w];
    return s;
  }

  /* ---------- Cypha: which reading of this transcript is right ----------
     Same shape as the classifier on /cypha.html — a shared prior over every
     candidate scored so far, plus one differential for "accepted", and a
     log-likelihood ratio between them. It starts with no opinion and earns
     one from what the listener does not correct. */
  var FD = 5;                       // [cosine, phonetic, word overlap, is-command, length]
  var model = { prior: { n: 0, mean: z(FD), m2: z(FD) },
                ok: { n: 0, mean: z(FD), m2: z(FD) },
                no: { n: 0, mean: z(FD), m2: z(FD) },
                heard: 0, used: 0, fixed: 0 };
  var offered = null;   // the shortlist last read out, awaiting a yes or a no
  function z(n) { var a = [], i; for (i = 0; i < n; i++) a[i] = 0; return a; }

  function updatePrior(f) {
    var p = model.prior, i, d;
    p.n++;
    for (i = 0; i < FD; i++) { d = f[i] - p.mean[i]; p.mean[i] += d / p.n; p.m2[i] += d * (f[i] - p.mean[i]); }
  }
  function pv(i) { return model.prior.n > 1 ? Math.max(0.004, model.prior.m2[i] / (model.prior.n - 1)) : 0.08; }
  function updateOk(f) { updateDiff(model.ok, f); }
  function updateNo(f) { updateDiff(model.no, f); }
  function updateDiff(d, f) {
    var lr, i, prev;
    d.n++;
    lr = Math.max(0.15, 1 / (d.n + 1));
    for (i = 0; i < FD; i++) {
      prev = d.mean[i];
      d.mean[i] += lr * (f[i] - prev);
      d.m2[i] += (f[i] - prev) * (f[i] - d.mean[i]);
      d.mean[i] = model.prior.mean[i] + (d.mean[i] - model.prior.mean[i]) * 0.94;   // MDL decay
    }
  }
  function dVar(d, i) {
    var n = Math.max(0, d.n - 1);
    return Math.max(0.003, (d.m2[i] + 4 * pv(i)) / (n + 4));
  }
  function ratio(d, f) {
    if (d.n < 2) return 0;
    var s = 0, i, v0, vk, r0, rk;
    for (i = 0; i < FD; i++) {
      v0 = pv(i); vk = dVar(d, i);
      r0 = f[i] - model.prior.mean[i];
      rk = f[i] - d.mean[i];
      s += 0.5 * Math.log(v0 / vk) + (r0 * r0) / (2 * v0) - (rk * rk) / (2 * vk);
    }
    return s;
  }
  /* Accepted shapes pull up, corrected ones pull down. A correction is the
     most informative thing a listener can give you, so it is worth as much
     here as an acceptance. */
  function llr(f) { return ratio(model.ok, f) - ratio(model.no, f); }
  function saveModel() { try { localStorage.setItem(KEY, JSON.stringify(model)); } catch (e) {} }
  function loadModel() {
    try {
      var r = localStorage.getItem(KEY);
      if (r) { var o = JSON.parse(r); if (o && o.prior && o.ok) model = o; }
    } catch (e) {}
  }

  /* ---------- what can be said ---------- */
  var COMMANDS = [
    { id: 'read',   say: ['read', 'read it', 'read the page', 'start reading', 'read aloud'], run: startReading },
    { id: 'stop',   say: ['stop', 'stop reading', 'quiet', 'silence', 'shut up'],             run: stopReading },
    { id: 'pause',  say: ['pause', 'hold on', 'wait'],                                         run: pauseReading },
    { id: 'resume', say: ['resume', 'continue', 'carry on', 'keep going'],                     run: resumeReading },
    { id: 'next',   say: ['next', 'skip', 'next paragraph', 'forward'],                        run: function () { jump(1); } },
    { id: 'back',   say: ['back', 'previous', 'again', 'repeat', 'go back'],                   run: function () { jump(-1); } },
    { id: 'top',    say: ['top', 'start', 'beginning', 'go to the top'],                       run: function () { at = -1; startReading(); } },
    { id: 'home',   say: ['home', 'home page', 'go home'],                                     run: function () { go('/'); } },
    { id: 'help',   say: ['help', 'what can i say', 'commands', 'options'],                    run: sayHelp },
    { id: 'search', say: ['search', 'find', 'search the site', 'look for something'],
      run: function () { if (root.ImortekSimilar) root.ImortekSimilar.open(); announce('Search open.'); } },
    { id: 'related', say: ['related', 'what is related', 'similar pages', 'see also'],
      run: function () {
        var r = document.querySelector('.related');
        if (!r) { speak('Nothing related on this page.'); return; }
        r.scrollIntoView({ block: 'start' });
        var names = [].map.call(r.querySelectorAll('h3'), function (h) { return h.textContent; });
        speak('Related: ' + names.join('. '));
        announce('Related: ' + names.join(', '));
      } },
    { id: 'listen-off', say: ['stop listening', 'turn off the microphone', 'stop the mic'],    run: function () { setListening(false); } }
  ];

  function go(url) { announce('Going to ' + url); location.href = url; }

  /* Spoken shortcuts to a page. Retrieval handles descriptions; this handles
     the things people just say, where the words they use are not the words on
     the page — nobody asks for "AGPL tiers", they ask what it costs. */
  var PLACES = [
    { u: '/',                say: ['home', 'home page', 'front page', 'imortek'] },
    { u: '/pbsd.html',       say: ['paranoid bsd', 'paranoidbsd', 'the operating system', 'pbsd', 'the os'] },
    { u: '/cypha.html',      say: ['cypha', 'cipher', 'the ai', 'the model', 'artificial intelligence',
                                   'an ai that keeps learning', 'the learning ai', 'machine learning'] },
    { u: '/chess.html',      say: ['chess', 'play chess', 'the chess game'] },
    { u: '/retdec.html',     say: ['retdec', 'the decompiler', 'reverse engineering'] },
    { u: '/mathscript.html', say: ['mathscript', 'the maths library', 'the math library', 'maths'] },
    { u: '/aegis.html',      say: ['aegis', 'the transport', 'privacy', 'metadata'] },
    { u: '/sentinel.html',   say: ['sentinel', 'crime analytics', 'the crime tool'] },
    { u: '/cellai.html',     say: ['cell ai', 'cellai', 'the experiment'] },
    { u: '/research.html',   say: ['research', 'the research shelf', 'papers', 'the shelf'] },
    { u: '/licensing.html',  say: ['licensing', 'licence', 'license', 'the price', 'how much does it cost',
                                   'what does it cost', 'cost', 'pricing', 'is it free'] },
    { u: '/about.html',      say: ['about', 'who made this', 'contact', 'get in touch', 'email'] },
    { u: '/beta.html',       say: ['beta', 'become a beta tester', 'beta testing', 'try it', 'test it'] },
    { u: '/kickstarter.html',say: ['kickstarter', 'the campaign', 'back it', 'fund it', 'donate'] }
  ];

  /* ---------- reading ---------- */
  function collect() {
    var main = document.getElementById('main');
    if (!main) return [];
    var out = [];
    main.querySelectorAll('h1, h2, h3, h4, p, li, figcaption, summary, td').forEach(function (el) {
      if (el.closest('.gloss__pop, .gloss-ctl, .voice-ctl')) return;
      if (el.offsetParent === null && el.tagName !== 'SUMMARY') return;
      var t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length < 3) return;
      // Skip a block whose text is already covered by the one before it.
      if (out.length && out[out.length - 1].text.indexOf(t) >= 0) return;
      out.push({ el: el, text: t, tag: el.tagName });
    });
    return out;
  }

  function speak(text, onEnd) {
    if (!synth) return;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = onEnd || null;
    synth.speak(u);
  }

  function readFrom(i) {
    if (!synth) return;
    blocks = blocks.length ? blocks : collect();
    if (i >= blocks.length) { stopReading(); announce('End of page.'); return; }
    at = i;
    var b = blocks[at];
    highlight(b.el);
    reading = true;
    setState();
    var prefix = /^H[1-4]$/.test(b.tag) ? 'Heading. ' : '';
    speak(prefix + b.text, function () { if (reading) readFrom(at + 1); });
  }

  function startReading() { if (synth) { synth.cancel(); } readFrom(at + 1 > 0 ? at : 0); }
  function stopReading() { reading = false; if (synth) synth.cancel(); unhighlight(); setState(); }
  function pauseReading() { if (synth && synth.speaking) { synth.pause(); reading = false; setState(); } }
  function resumeReading() { if (synth && synth.paused) { synth.resume(); reading = true; setState(); } else startReading(); }
  function jump(d) {
    blocks = blocks.length ? blocks : collect();
    var n = Math.min(blocks.length - 1, Math.max(0, at + d));
    if (synth) synth.cancel();
    readFrom(n);
  }

  var marked = null;
  function highlight(el) {
    unhighlight();
    el.classList.add('voice-at');
    marked = el;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
  }
  function unhighlight() { if (marked) { marked.classList.remove('voice-at'); marked = null; } }

  function sayHelp() {
    var t = 'You can say: read, stop, next, back, top, home, or the name of a page — '
          + 'products, research, licensing, about, beta, kickstarter. '
          + 'You can also describe what you want and I will find the closest page.';
    announce(t);
    speak(t);
  }

  /* ---------- interpreting what was said ---------- */
  function loadIndex() {
    if (indexP) return indexP;
    indexP = fetch('/assets/data/voice-index.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { index = d; return d; })
      .catch(function () { return null; });
    return indexP;
  }

  function overlap(a, b) {
    var A = a.split(/\s+/), B = b.split(/\s+/), n = 0;
    A.forEach(function (w) { if (B.indexOf(w) >= 0) n++; });
    return n / Math.max(1, A.length);
  }

  function candidates(said) {
    var saidPhone = said.split(/\s+/).map(phone).join(' ');
    var out = [];
    COMMANDS.forEach(function (c) {
      var best = 0;
      c.say.forEach(function (s) {
        var o = overlap(said, s);
        var ph = overlap(saidPhone, s.split(/\s+/).map(phone).join(' '));
        best = Math.max(best, Math.max(o, ph * 0.95));
      });
      out.push({ kind: 'command', cmd: c, label: c.id,
                 f: [0, best, best, 1, Math.min(1, said.length / 40)] });
    });
    PLACES.forEach(function (pl) {
      var best = 0;
      pl.say.forEach(function (sy) {
        var o = overlap(said, sy);
        var ph = overlap(saidPhone, sy.split(/\s+/).map(phone).join(' '));
        best = Math.max(best, Math.max(o, ph * 0.95));
      });
      out.push({ kind: 'command', label: pl.u, cmd: { run: function () { go(pl.u); } },
                 f: [0, best, best, 1, Math.min(1, said.length / 40)] });
    });
    if (index) {
      var v = embed(said);
      if (v) {
        var boost = index.boost || 1;
        index.pages.forEach(function (pg) {
          var cs = cosine(v, pg.v) * (pg.m ? boost : 1);
          var titlePhone = overlap(saidPhone, phone(pg.t.replace(/[^a-z ]/gi, '')));
          out.push({ kind: 'page', url: pg.u, label: pg.t,
                     f: [Math.max(0, cs), titlePhone, overlap(said, pg.t.toLowerCase()), 0,
                         Math.min(1, said.length / 40)] });
        });
      }
    }
    return out;
  }

  /* The retrieval index is needed before a description can be matched, so
     make sure it is in before deciding anything. */
  /* Recognisers spell acronyms out loud: ParanoidBSD comes back as
     "paranoid bee es dee". Collapse runs of spoken letter names back into
     letters before anything else looks at the transcript. */
  var LETTER = { ay: 'a', bee: 'b', see: 'c', sea: 'c', dee: 'd', ee: 'e', ef: 'f', eff: 'f',
                 gee: 'g', aitch: 'h', haitch: 'h', eye: 'i', jay: 'j', kay: 'k', el: 'l', ell: 'l',
                 em: 'm', en: 'n', oh: 'o', pee: 'p', cue: 'q', queue: 'q', ar: 'r', are: 'r',
                 es: 's', ess: 's', tee: 't', tea: 't', you: 'u', yoo: 'u', vee: 'v',
                 doubleyou: 'w', ex: 'x', why: 'y', wye: 'y', zed: 'z', zee: 'z' };
  function despell(text) {
    var words = text.split(/\s+/), out = [], run = [], raw = [];
    function flush() {
      // Only a run of two or more collapses. "are" and "you" are letter names
      // and also ordinary words, so a lone one keeps the word it was.
      if (run.length >= 2) out.push(run.join(''));
      else if (run.length) out.push(raw[0]);
      run = []; raw = [];
    }
    words.forEach(function (w) {
      var L = LETTER[w];
      if (L) { run.push(L); raw.push(w); }
      else { flush(); out.push(w); }
    });
    flush();
    return out.join(' ');
  }

  function interpret(said) {
    return loadIndex().then(function () { decide(despell(String(said).toLowerCase())); });
  }

  var ORDINAL = { one: 0, first: 0, 'number one': 0, two: 1, second: 1, 'number two': 1,
                  three: 2, third: 2, 'number three': 2, yes: 0, yeah: 0, 'that one': 0 };

  function decide(said) {
    said = said.toLowerCase().trim();
    if (!said) return;

    // Answering a shortlist. Picking one teaches the accepted shape; refusing
    // teaches the rejected shape, which is the half most systems throw away.
    if (offered) {
      var pick = ORDINAL[said];
      if (pick === undefined) {
        for (var key in ORDINAL) if (said.indexOf(key) >= 0) { pick = ORDINAL[key]; break; }
      }
      if (pick !== undefined && offered.list[pick]) {
        var chosen = offered.list[pick];
        offered.list.forEach(function (c, i) { if (i !== pick) updateNo(c.f); });
        updateOk(chosen.f);
        model.fixed++;
        offered = null;
        saveModel(); setState();
        announce('Opening ' + chosen.label);
        speak('Opening ' + chosen.label.split(' — ')[0]);
        setTimeout(function () { go(chosen.url); }, 800);
        return;
      }
      if (/^(no|nope|none|wrong|not that|neither)\b/.test(said)) {
        offered.list.forEach(function (c) { updateNo(c.f); });
        model.fixed++;
        offered = null;
        saveModel(); setState();
        announce('Understood. Say it another way, or say help.');
        speak('Understood. Try saying it another way.');
        return;
      }
      offered = null;   // anything else: treat as a fresh request
    }
    model.heard++;
    var cands = candidates(said);
    cands.forEach(function (c) { updatePrior(c.f); });
    // Base score is the evidence; Cypha's learned differential adjusts it.
    cands.forEach(function (c) {
      c.base = Math.max(c.f[0], c.f[1], c.f[2]) + (c.f[3] ? 0.05 : 0);
      c.score = c.base + 0.12 * Math.tanh(llr(c.f));
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var top = cands[0];
    // Commands are matched on wording, so they can use an absolute bar. Pages
    // are matched on similarity to a whole document, where the absolute number
    // is always small — what matters there is whether one page stands clear of
    // the rest.
    var ok;
    if (!top) ok = false;
    else if (top.kind === 'command') ok = top.base >= 0.34;
    else {
      var runnerUp = 0;
      for (var i = 1; i < cands.length; i++) {
        if (cands[i].kind === 'page') { runnerUp = cands[i].f[0]; break; }
      }
      ok = top.f[0] >= 0.16 && (top.f[0] - runnerUp) >= 0.025;
    }
    if (!ok) {
      // Rather than give up, read back the best few and let the listener pick.
      // Rank the offer by similarity, not by the combined score. A page can
      // top the combined score on title-word overlap alone, which is fine for
      // acting on a confident match and useless as a suggestion.
      var shortlist = cands.filter(function (c) { return c.kind === 'page'; })
                           .sort(function (a, b) { return b.f[0] - a.f[0]; })
                           .slice(0, 3);
      if (shortlist.length && shortlist[0].f[0] > 0.015) {
        offered = { list: shortlist, said: said };
        var names = shortlist.map(function (c, i) { return (i + 1) + ', ' + c.label.split(' — ')[0]; });
        var msg = 'Did you mean: ' + names.join('. Or ') + '. Say a number, or say no.';
        announce(msg); speak(msg);
      } else {
        announce('I did not catch that. Say "help" for what you can say.');
        speak('Sorry, I did not catch that. Say help for what you can say.');
      }
      saveModel();
      return;
    }
    model.used++;
    updateOk(top.f);          // it was good enough to act on — learn that shape
    saveModel();
    setState();
    if (top.kind === 'command') { announce(top.label); top.cmd.run(); }
    else { announce('Opening ' + top.label); speak('Opening ' + top.label); setTimeout(function () { go(top.url); }, 900); }
  }

  /* ---------- the microphone ---------- */
  function setListening(on) {
    if (!SR) return;
    if (on && !rec) {
      rec = new SR();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = document.documentElement.lang || 'en-AU';
      rec.onresult = function (e) {
        var last = e.results[e.results.length - 1];
        if (last && last.isFinal) interpret(last[0].transcript);
      };
      rec.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          announce('Microphone blocked. Allow it in your browser to use voice commands.');
          setListening(false);
        }
      };
      rec.onend = function () { if (listening) { try { rec.start(); } catch (err) {} } };
    }
    listening = on;
    if (rec) { try { on ? rec.start() : rec.stop(); } catch (e) {} }
    setState();
    if (on) { loadIndex(); announce('Listening. Say "help" for what you can say.'); }
    else announce('Microphone off.');
  }

  /* ---------- control ---------- */
  function announce(msg) { if (liveEl) liveEl.textContent = msg; }
  function setState() {
    if (!panel) return;
    panel.classList.toggle('is-reading', reading);
    panel.classList.toggle('is-listening', listening);
    var rb = panel.querySelector('[data-act="read"]');
    if (rb) { rb.setAttribute('aria-pressed', String(reading)); rb.querySelector('span').textContent = reading ? 'Pause' : 'Read aloud'; }
    var lb = panel.querySelector('[data-act="listen"]');
    if (lb) { lb.setAttribute('aria-pressed', String(listening)); }
    if (statusEl) {
      statusEl.textContent = listening
        ? (model.used + '/' + model.heard + ' understood' + (model.fixed ? ' \u00b7 ' + model.fixed + ' corrected' : ''))
        : (reading ? 'reading' : 'off');
    }
  }

  function build() {
    panel = document.createElement('div');
    panel.className = 'voice-ctl';
    panel.innerHTML =
      (synth ? '<button type="button" class="voice-ctl__btn" data-act="read" aria-pressed="false">' +
               '<span>Read aloud</span></button>' : '') +
      (synth ? '<button type="button" class="voice-ctl__icon" data-act="next" aria-label="Next paragraph">&#9654;&#9654;</button>' +
               '<button type="button" class="voice-ctl__icon" data-act="stop" aria-label="Stop reading">&#9632;</button>' : '') +
      (SR ? '<button type="button" class="voice-ctl__btn" data-act="listen" aria-pressed="false">' +
            '<span>Voice commands</span></button>' : '') +
      '<span class="voice-ctl__stat mono"></span>';
    // Into the shared bottom bar, not a fixed element of its own — two
    // independently-positioned bars overlap on a narrow screen.
    (root.ImortekToolbar ? root.ImortekToolbar() : document.body).appendChild(panel);
    statusEl = panel.querySelector('.voice-ctl__stat');

    liveEl = document.createElement('div');
    liveEl.className = 'sr-only';
    liveEl.setAttribute('role', 'status');
    liveEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(liveEl);

    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.dataset.act;
      if (a === 'read')   { reading ? pauseReading() : (synth && synth.paused ? resumeReading() : startReading()); }
      if (a === 'stop')   stopReading();
      if (a === 'next')   jump(1);
      if (a === 'listen') setListening(!listening);
    });

    document.addEventListener('keydown', function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key.toLowerCase();
      if (k === 'r') { e.preventDefault(); reading ? pauseReading() : startReading(); }
      if (k === 'l') { e.preventDefault(); setListening(!listening); }
      if (k === 's') { e.preventDefault(); stopReading(); }
    });
    root.addEventListener('beforeunload', function () { if (synth) synth.cancel(); });
  }

  loadModel();
  build();
  setState();
  root.ImortekVoice = { read: startReading, stop: stopReading, listen: setListening,
                        interpret: interpret, phone: phone, index: loadIndex,
                        rank: function (said) {
                          return loadIndex().then(function () {
                            return candidates(said.toLowerCase())
                              .filter(function (c) { return c.kind === 'page'; })
                              .sort(function (a, b) { return b.f[0] - a.f[0]; })
                              .slice(0, 3)
                              .map(function (c) { return c.label + ' ' + c.f[0].toFixed(3); });
                          });
                        },
                        stats: function () { return model; } };
}(typeof self !== 'undefined' ? self : this));
