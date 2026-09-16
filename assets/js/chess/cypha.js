/* =============================================================
   Cypha chess player.

   Cypha's regression head over the chess feature space:

     WorldPrior θ₀   per-feature mean and variance, fitted online
     whitening       z = (φ − μ) / σ   — the natural-gradient metric
     linear head     ŷ = w·z + b       — evaluation in centipawns

   The weights were distilled offline from the Imortek reference
   engine's own search evaluations. They are the starting point, not
   the end of it: Cypha is an online learner, so the head keeps
   fitting while you play.

   The training signal is the same one the offline distillation used —
   a search evaluation. After each of its moves the head is corrected
   toward the value its own alpha-beta search returned from that
   position, which is a strictly better estimate than the static eval
   it produced. At the end of a game the final positions are corrected
   again toward the actual result.

   The update is normalised LMS on the whitened features, and every
   step is followed by MDL decay back toward the distilled weights, so
   what the model learns is a *displacement* from what shipped and can
   never run away from it. The WorldPrior (mu, sigma) is left exactly
   as distilled: it was fitted on 26,568 positions and a few live games
   have no business moving it.

   All of it runs in the viewer's browser. The learned displacement is
   theirs, stays in their localStorage, and is never sent anywhere.
   ============================================================= */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./engine.js') : root.ImortekChess,
                    typeof require === 'function' ? require('./features.js') : root.ImortekChessFeatures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImortekChessCypha = api;
}(typeof self !== 'undefined' ? self : this, function (C, F) {
  'use strict';

  var LR      = 0.06;    // normalised LMS step on whitened features
  var MDL     = 0.0015;  // decay back toward the distilled weights, per update
  var CLIP    = 1200;    // centipawns — the clip the offline training used
  var MATEISH = 30000;   // mate scores are not evaluation targets

  function CyphaEval(params) {
    this.mu = Float32Array.from(params.mu);
    this.sigma = Float32Array.from(params.sigma);
    this.w = Float32Array.from(params.w);
    this.b = params.b;
    this.scale = params.scale || 100;
    this._buf = new Float32Array(F.DIM);
    this._z = new Float32Array(F.DIM);

    // What shipped. Everything learned is measured as a displacement from this.
    this.w0 = Float32Array.from(params.w);
    this.b0 = params.b;
    this.seen = 0;      // positions learned from
    this.games = 0;
  }

  /* Whitened features for a position: z = (phi - mu) / sigma. */
  CyphaEval.prototype._whiten = function (pos) {
    var f = F.extract(pos, this._buf), z = this._z, i;
    for (i = 0; i < f.length; i++) z[i] = (f[i] - this.mu[i]) / this.sigma[i];
    return z;
  };

  /* One online correction toward a better estimate of this position.
     `target` is in centipawns, from the side to move — the same units and
     the same sign convention as evaluate(). */
  CyphaEval.prototype.observe = function (pos, target) {
    if (!isFinite(target) || Math.abs(target) >= MATEISH) return 0;
    if (target > CLIP) target = CLIP; else if (target < -CLIP) target = -CLIP;

    var z = this._whiten(pos), w = this.w, i;
    var pred = this.b, zz = 0;
    for (i = 0; i < z.length; i++) { pred += w[i] * z[i]; zz += z[i] * z[i]; }

    var err = (target / this.scale) - pred;
    var step = LR * err / (1 + zz);          // normalised LMS — cannot blow up
    for (i = 0; i < z.length; i++) {
      w[i] += step * z[i];
      w[i] = this.w0[i] + (w[i] - this.w0[i]) * (1 - MDL);   // MDL decay
    }
    this.b += step;
    this.b = this.b0 + (this.b - this.b0) * (1 - MDL);
    this.seen++;
    return err * this.scale;                 // residual in centipawns, for the UI
  };

  /* How far the head has moved from what shipped, in units of the
     distilled weight vector's own norm. */
  CyphaEval.prototype.drift = function () {
    var d = 0, n0 = 0, i, x;
    for (i = 0; i < this.w.length; i++) {
      x = this.w[i] - this.w0[i]; d += x * x; n0 += this.w0[i] * this.w0[i];
    }
    return n0 > 0 ? Math.sqrt(d / n0) : 0;
  };

  CyphaEval.prototype.reset = function () {
    this.w.set(this.w0); this.b = this.b0; this.seen = 0; this.games = 0;
  };

  /* Persist only the displacement, rounded — the distilled weights are
     already on disk and never change. */
  CyphaEval.prototype.save = function () {
    var d = new Array(this.w.length), i;
    for (i = 0; i < this.w.length; i++) d[i] = Math.round((this.w[i] - this.w0[i]) * 1e5) / 1e5;
    return { v: 1, dim: this.w.length, seen: this.seen, games: this.games,
             db: Math.round((this.b - this.b0) * 1e6) / 1e6, d: d };
  };
  CyphaEval.prototype.restore = function (o) {
    if (!o || o.v !== 1 || o.dim !== this.w.length || !o.d) return false;
    for (var i = 0; i < this.w.length; i++) this.w[i] = this.w0[i] + (o.d[i] || 0);
    this.b = this.b0 + (o.db || 0);
    this.seen = o.seen || 0; this.games = o.games || 0;
    return true;
  };

  CyphaEval.prototype.evaluate = function (pos) {
    var f = F.extract(pos, this._buf);
    var s = this.b, w = this.w, mu = this.mu, sg = this.sigma;
    for (var i = 0; i < f.length; i++) {
      if (w[i] === 0) continue;
      s += w[i] * ((f[i] - mu[i]) / sg[i]);
    }
    return s * this.scale;      // centipawns, from the side to move
  };

  /* ---------- Alpha-beta driven by Cypha's evaluation ---------- */
  var MATE = 100000;

  function mvvLva(m) {
    if (!m.captured) return 0;
    return C.VALUE[C.type(m.captured)] * 10 - C.VALUE[C.type(m.piece)];
  }

  function CyphaSearch(pos, evalr) {
    this.pos = pos; this.ev = evalr; this.nodes = 0;
  }

  CyphaSearch.prototype.quiesce = function (alpha, beta, depth) {
    this.nodes++;
    var stand = this.ev.evaluate(this.pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth <= 0) return alpha;

    var moves = this.pos.generateMoves(true);
    moves.sort(function (a, b) { return mvvLva(b) - mvvLva(a); });
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      if (this.pos.inCheck(this.pos.turn === C.WHITE ? C.BLACK : C.WHITE)) {
        this.pos.unmakeMove(); continue;
      }
      var score = -this.quiesce(-beta, -alpha, depth - 1);
      this.pos.unmakeMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  CyphaSearch.prototype.alphabeta = function (depth, alpha, beta) {
    if (depth <= 0) return this.quiesce(alpha, beta, 4);
    this.nodes++;
    var moves = this.pos.generateMoves(false);
    moves.sort(function (a, b) { return mvvLva(b) - mvvLva(a); });
    var legal = 0;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      if (this.pos.inCheck(this.pos.turn === C.WHITE ? C.BLACK : C.WHITE)) {
        this.pos.unmakeMove(); continue;
      }
      legal++;
      var score = -this.alphabeta(depth - 1, -beta, -alpha);
      this.pos.unmakeMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    if (!legal) return this.pos.inCheck(this.pos.turn) ? -MATE + (100 - depth) : 0;
    return alpha;
  };

  /* Returns the chosen move plus the full ranked list, so the UI can show
     what Cypha considered and by how much it preferred its choice. */
  CyphaSearch.prototype.best = function (depth, temperature) {
    var moves = this.pos.legalMoves();
    if (!moves.length) return { move: null, score: 0, ranked: [] };
    var scored = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      var score = -this.alphabeta(depth - 1, -Infinity, Infinity);
      this.pos.unmakeMove();
      scored.push({ move: m, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });

    var pick = scored[0];
    if (temperature && temperature > 0 && scored.length > 1) {
      // Cypha's temperature-scaled generation mode, applied to move choice.
      var top = scored[0].score, sum = 0, ws = [];
      for (var j = 0; j < scored.length; j++) {
        var wgt = Math.exp((scored[j].score - top) / (temperature * 100));
        ws.push(wgt); sum += wgt;
      }
      var r = Math.random() * sum, acc = 0;
      for (var k = 0; k < scored.length; k++) {
        acc += ws[k];
        if (r <= acc) { pick = scored[k]; break; }
      }
    }
    return { move: pick.move, score: pick.score, ranked: scored, nodes: this.nodes };
  };

  return { CyphaEval: CyphaEval, CyphaSearch: CyphaSearch };
}));
