/* =============================================================
   Lazy dictionary — 144,440 words from WordNet 3.1.

   Shipping eleven megabytes to every visitor to explain the
   occasional word would be absurd, so nothing is loaded until
   something is actually looked up.

     manifest.json   76 shards, each with its first and last word
     lookup(w)       binary-search the manifest, fetch that one
                     shard, build a trie from it, answer from the trie
     cache           per shard, for the life of the page

   The trie is built here rather than shipped. A nested-object trie
   serialised to JSON is several times the size of the words it
   holds; building one from a sorted list of five thousand words
   takes about a millisecond, so the wire format is the sorted list.

   The trie earns its place on the two jobs a hash map cannot do:
   walking a prefix, and longest-match scanning for multi-word terms.

   See tools/gen_dictionary.py for how the shards are built, and
   assets/data/dict/LICENSE for WordNet's terms.
   ============================================================= */
(function (root) {
  'use strict';

  var BASE = '/assets/data/dict/';
  var manifest = null, manifestP = null;
  var shards = {};            // name -> { words, glosses, pos, trie }
  var pending = {};           // name -> Promise
  var misses = {};            // words known not to be in the dictionary

  function loadManifest() {
    if (manifestP) return manifestP;
    manifestP = fetch(BASE + 'manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (m) {
        manifest = m;
        m._order = Object.keys(m.shards).sort(function (a, b) {
          return m.shards[a].lo < m.shards[b].lo ? -1 : 1;
        });
        return m;
      });
    return manifestP;
  }

  /* Which shard would hold this word — binary search over [lo, hi] ranges. */
  function shardFor(word) {
    if (!manifest) return null;
    var order = manifest._order, lo = 0, hi = order.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, s = manifest.shards[order[mid]];
      if (word < s.lo) hi = mid - 1;
      else if (word > s.hi) lo = mid + 1;
      else return order[mid];
    }
    return null;
  }

  /* ---------- trie ---------- */
  function buildTrie(wordsArr) {
    var rootNode = { c: null, i: -1 };
    for (var n = 0; n < wordsArr.length; n++) {
      var w = wordsArr[n], node = rootNode;
      for (var k = 0; k < w.length; k++) {
        var ch = w.charCodeAt(k);
        if (!node.c) node.c = {};
        if (!node.c[ch]) node.c[ch] = { c: null, i: -1 };
        node = node.c[ch];
      }
      node.i = n;
    }
    return rootNode;
  }
  function walk(trie, word) {
    var node = trie;
    for (var k = 0; k < word.length; k++) {
      if (!node.c) return null;
      node = node.c[word.charCodeAt(k)];
      if (!node) return null;
    }
    return node;
  }

  function loadShard(name) {
    if (shards[name]) return Promise.resolve(shards[name]);
    if (pending[name]) return pending[name];
    pending[name] = fetch(BASE + name + '.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var s = { words: d.w, glosses: d.g, pos: d.p || '', trie: buildTrie(d.w) };
        shards[name] = s;
        delete pending[name];
        return s;
      })
      .catch(function () { delete pending[name]; return null; });
    return pending[name];
  }

  /* ---------- light morphology ----------
     Enough to get from a word on the page to its dictionary headword.
     Not a real stemmer; a real one would need the exception lists, and
     the trie makes a short ladder of candidates cheap to test. */
  function candidates(w) {
    var out = [w], m;
    if (/ies$/.test(w))        out.push(w.slice(0, -3) + 'y');
    if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w) && !/ss$/.test(w))     out.push(w.slice(0, -1));
    if (/ing$/.test(w)) {
      out.push(w.slice(0, -3), w.slice(0, -3) + 'e');
      m = w.slice(0, -3);
      if (/([bdfglmnprt])\1$/.test(m)) out.push(m.slice(0, -1));
    }
    if (/ed$/.test(w)) {
      out.push(w.slice(0, -2), w.slice(0, -1));
      m = w.slice(0, -2);
      if (/([bdfglmnprt])\1$/.test(m)) out.push(m.slice(0, -1));
    }
    if (/ly$/.test(w))  out.push(w.slice(0, -2));
    if (/ier$/.test(w))  out.push(w.slice(0, -3) + 'y');
    if (/iest$/.test(w)) out.push(w.slice(0, -4) + 'y');
    if (/(er|est)$/.test(w)) {
      out.push(w.replace(/(er|est)$/, ''), w.replace(/(er|est)$/, 'e'));
      m = w.replace(/(er|est)$/, '');
      if (/([bdfglmnprt])\1$/.test(m)) out.push(m.slice(0, -1));
    }
    return out.filter(function (c, i) { return c.length > 2 && out.indexOf(c) === i; });
  }

  function answer(shard, word, idx) {
    return { word: word, gloss: shard.glosses[idx], pos: shard.pos.charAt(idx) || '' };
  }

  /* ---------- public ---------- */
  function lookup(raw) {
    var w = String(raw || '').toLowerCase().trim();
    if (!w || misses[w]) return Promise.resolve(null);
    return loadManifest().then(function () {
      var tries = candidates(w);
      // Group candidates by shard so a word never costs more than one fetch
      // per distinct shard.
      var byShard = {};
      tries.forEach(function (c) {
        var s = shardFor(c);
        if (s) (byShard[s] = byShard[s] || []).push(c);
      });
      var names = Object.keys(byShard);
      if (!names.length) { misses[w] = 1; return null; }
      return Promise.all(names.map(loadShard)).then(function (loaded) {
        for (var i = 0; i < loaded.length; i++) {
          var s = loaded[i];
          if (!s) continue;
          var list = byShard[names[i]];
          for (var j = 0; j < list.length; j++) {
            var node = walk(s.trie, list[j]);
            if (node && node.i >= 0) return answer(s, list[j], node.i);
          }
        }
        misses[w] = 1;
        return null;
      });
    });
  }

  /* Words starting with a prefix — the trie's other job. */
  function prefix(p, limit) {
    p = String(p || '').toLowerCase();
    limit = limit || 12;
    if (p.length < 2) return Promise.resolve([]);
    return loadManifest().then(function () {
      var name = shardFor(p);
      if (!name) return [];
      return loadShard(name).then(function (s) {
        if (!s) return [];
        var node = walk(s.trie, p);
        if (!node) return [];
        var out = [];
        (function descend(nd) {
          if (out.length >= limit) return;
          if (nd.i >= 0) out.push(s.words[nd.i]);
          if (!nd.c) return;
          var keys = Object.keys(nd.c).sort(function (a, b) { return a - b; });
          for (var i = 0; i < keys.length && out.length < limit; i++) descend(nd.c[keys[i]]);
        }(node));
        return out;
      });
    });
  }

  /* ---------- did you mean ----------
     A miss is more useful with a near word beside it than with an
     apology. Two sources, in this order:

       1. edit distance 1 — one deletion, transposition, substitution
          or insertion — tested against the trie, which makes exact
          membership a walk of length n and nothing else;
       2. prefix completions of the typed word, which is what catches
          a truncation rather than a typo.

     The cost rule is that a miss must not buy a second round of
     fetches. lookup() has already pulled the word's own shard and
     possibly a neighbour's; only those, and anything else resident
     from an earlier lookup, are consulted. A candidate whose shard is
     not loaded is dropped rather than fetched, so the suggestions are
     the ones that were free. That makes the answer depend on what the
     reader has looked up before, which is a real limitation and the
     honest trade: a suggestion is a courtesy, and a courtesy that
     costs 150KB is not one.

     Ranking is by edit position — a typo late in a word leaves a
     longer correct prefix, and a candidate sharing more of the
     opening is more likely to be the word meant. */
  var ALPHA = 'abcdefghijklmnopqrstuvwxyz';

  function edits1(w) {
    var out = [], i, j, c;
    for (i = 0; i < w.length; i++) out.push(w.slice(0, i) + w.slice(i + 1));
    for (i = 0; i < w.length - 1; i++)
      out.push(w.slice(0, i) + w.charAt(i + 1) + w.charAt(i) + w.slice(i + 2));
    for (i = 0; i < w.length; i++)
      for (j = 0; j < 26; j++) {
        c = ALPHA.charAt(j);
        if (c !== w.charAt(i)) out.push(w.slice(0, i) + c + w.slice(i + 1));
      }
    for (i = 0; i <= w.length; i++)
      for (j = 0; j < 26; j++) out.push(w.slice(0, i) + ALPHA.charAt(j) + w.slice(i));
    return out;
  }

  /* How much of the opening two words share. */
  function shared(a, b) {
    var i = 0, n = Math.min(a.length, b.length);
    while (i < n && a.charAt(i) === b.charAt(i)) i++;
    return i;
  }

  function suggest(raw, limit) {
    var w = String(raw || '').toLowerCase().trim();
    limit = limit || 3;
    if (w.length < 3) return Promise.resolve([]);
    return loadManifest().then(function () {
      var own = shardFor(w);
      // Resident shards plus this word's own, which lookup() fetched.
      return (own && !shards[own] ? loadShard(own) : Promise.resolve())
        .then(function () {
          var seen = {}, hits = [];
          seen[w] = 1;
          edits1(w).forEach(function (c) {
            if (c.length < 3 || seen[c]) return;
            seen[c] = 1;
            var name = shardFor(c);
            if (!name || !shards[name]) return;   // not resident: not free
            var node = walk(shards[name].trie, c);
            if (node && node.i >= 0) hits.push({ word: c, rank: shared(w, c) });
          });
          hits.sort(function (a, b) {
            return b.rank - a.rank || (a.word < b.word ? -1 : 1);
          });
          var out = hits.slice(0, limit).map(function (h) { return h.word; });
          if (out.length >= limit) return out;
          // Room left: fill it with completions of what was typed.
          // prefix() resolves shardFor(w), which is `own' above and is
          // therefore already resident -- still no second fetch.
          return prefix(w, limit).then(function (pre) {
            pre.forEach(function (word) {
              if (out.length < limit && word !== w && out.indexOf(word) < 0)
                out.push(word);
            });
            return out;
          }, function () { return out; });
        });
    });
  }

  function stats() {
    var names = Object.keys(shards), words = 0;
    names.forEach(function (n) { words += shards[n].words.length; });
    return { shardsLoaded: names.length,
             shardsTotal: manifest ? manifest._order.length : 0,
             wordsResident: words,
             wordsTotal: manifest ? manifest.words : 0 };
  }

  root.ImortekDict = { lookup: lookup, prefix: prefix, suggest: suggest,
                       stats: stats, ready: loadManifest };
}(typeof self !== 'undefined' ? self : this));
