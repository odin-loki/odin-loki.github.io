/* =============================================================
   Cypha chess features.

   φ(position) is built from the side-to-move's point of view, so
   one weight vector serves both colours:

     384 dims   piece-square occupancy difference (6 types × 64)
       4 dims   bishop pair, doubled pawns, pseudo-mobility, phase

   Shared by the trainer (Node) and the browser player.
   ============================================================= */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./engine.js') : root.ImortekChess);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImortekChessFeatures = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var NSQ = 64, NTYPES = 6;
  var PS = NSQ * NTYPES;          // 384
  var EXTRA = 4;
  var DIM = PS + EXTRA;           // 388

  function mirror64(i) { return (7 - (i >> 3)) * 8 + (i & 7); }

  /* Extract features from the side-to-move's perspective. */
  function extract(pos, out) {
    var f = out || new Float32Array(DIM);
    f.fill(0);

    var b = pos.board;
    var us = pos.turn;
    var flip = (us === C.BLACK);

    var wB = 0, bB = 0;
    var pawnFiles = [new Int8Array(8), new Int8Array(8)];   // [white, black]
    var mobility = 0, phase = 0;

    for (var sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) !== 0) { sq += 7; continue; }
      var p = b[sq];
      if (!p) continue;
      var t = C.type(p), c = C.colour(p);
      var i64 = C.to64(sq);

      // Index from the mover's perspective: flip the board for black so that
      // "my second rank" is always the same feature.
      var idx = flip ? mirror64(i64) : i64;
      var mine = (c === us);
      f[(t - 1) * NSQ + idx] += mine ? 1 : -1;

      if (t === C.BISHOP) { if (c === C.WHITE) wB++; else bB++; }
      if (t === C.PAWN) pawnFiles[c === C.WHITE ? 0 : 1][i64 & 7]++;
      if (t !== C.PAWN && t !== C.KING) phase += (t === C.QUEEN ? 4 : t === C.ROOK ? 2 : 1);
    }

    // Bishop pair, from the mover's side
    var myB = (us === C.WHITE) ? wB : bB, opB = (us === C.WHITE) ? bB : wB;
    f[PS + 0] = (myB >= 2 ? 1 : 0) - (opB >= 2 ? 1 : 0);

    // Doubled pawns
    var myD = 0, opD = 0;
    var mi = (us === C.WHITE) ? 0 : 1, oi = 1 - mi;
    for (var file = 0; file < 8; file++) {
      if (pawnFiles[mi][file] > 1) myD += pawnFiles[mi][file] - 1;
      if (pawnFiles[oi][file] > 1) opD += pawnFiles[oi][file] - 1;
    }
    f[PS + 1] = (myD - opD) / 4;

    // Pseudo-mobility difference, scaled. Cheap proxy: our pseudo-legal count
    // minus theirs, which is the standard mobility term without the legality pass.
    var mine2 = pos.generateMoves(false).length;
    pos.turn = (us === C.WHITE) ? C.BLACK : C.WHITE;
    var theirs = pos.generateMoves(false).length;
    pos.turn = us;
    f[PS + 2] = (mine2 - theirs) / 20;
    mobility = mine2 - theirs;

    // Game phase, 0 (endgame) to 1 (opening)
    f[PS + 3] = Math.min(1, phase / 24);

    return f;
  }

  return { extract: extract, DIM: DIM, PS: PS, EXTRA: EXTRA, mirror64: mirror64 };
}));
