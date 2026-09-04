/* =============================================================
   Cypha chess player.

   Cypha's regression head over the chess feature space:

     WorldPrior θ₀   per-feature mean and variance, fitted online
     whitening       z = (φ − μ) / σ   — the natural-gradient metric
     linear head     ŷ = w·z + b       — evaluation in centipawns

   The weights were distilled offline from the Imortek reference
   engine's own search evaluations. Nothing is trained in the browser;
   this file only runs the fitted model inside an alpha-beta search.
   ============================================================= */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./engine.js') : root.ImortekChess,
                    typeof require === 'function' ? require('./features.js') : root.ImortekChessFeatures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImortekChessCypha = api;
}(typeof self !== 'undefined' ? self : this, function (C, F) {
  'use strict';

  function CyphaEval(params) {
    this.mu = Float32Array.from(params.mu);
    this.sigma = Float32Array.from(params.sigma);
    this.w = Float32Array.from(params.w);
    this.b = params.b;
    this.scale = params.scale || 100;
    this._buf = new Float32Array(F.DIM);
  }

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
