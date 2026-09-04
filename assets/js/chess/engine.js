/* =============================================================
   Imortek reference chess engine.

   A conventional 0x88 engine: full legal move generation,
   material + piece-square evaluation, alpha-beta search with
   MVV-LVA ordering and a quiescence search.

   This is the TEACHER. Cypha is distilled from its evaluations.

   Runs in both Node (training) and the browser (play).
   ============================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImortekChess = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Constants ---------- */
  var EMPTY = 0;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var WHITE = 8, BLACK = 16;
  var COLOR_MASK = 24, TYPE_MASK = 7;

  function type(p) { return p & TYPE_MASK; }
  function colour(p) { return p & COLOR_MASK; }
  function isOn(sq) { return (sq & 0x88) === 0; }
  function rankOf(sq) { return sq >> 4; }
  function fileOf(sq) { return sq & 7; }
  function sq0x88(file, rank) { return (rank << 4) | file; }
  function to64(sq) { return rankOf(sq) * 8 + fileOf(sq); }

  var KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
  var BISHOP_DIRS = [-17, -15, 15, 17];
  var ROOK_DIRS = [-16, -1, 1, 16];
  var KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];

  // castling rights bits
  var WK = 1, WQ = 2, BK = 4, BQ = 8;

  /* ---------- Position ---------- */
  function Position() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;              // en-passant target square, -1 if none
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = { 8: -1, 16: -1 };
    this.history = [];
  }

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var FEN_PIECES = {
    p: PAWN | BLACK, n: KNIGHT | BLACK, b: BISHOP | BLACK,
    r: ROOK | BLACK, q: QUEEN | BLACK, k: KING | BLACK,
    P: PAWN | WHITE, N: KNIGHT | WHITE, B: BISHOP | WHITE,
    R: ROOK | WHITE, Q: QUEEN | WHITE, K: KING | WHITE
  };
  var PIECE_CHARS = {};
  for (var fc in FEN_PIECES) PIECE_CHARS[FEN_PIECES[fc]] = fc;

  Position.prototype.clear = function () {
    this.board = new Int8Array(128);
    this.turn = WHITE; this.castling = 0; this.ep = -1;
    this.halfmove = 0; this.fullmove = 1;
    this.kings = { 8: -1, 16: -1 };
    this.history = [];
  };

  Position.prototype.setFen = function (fen) {
    this.clear();
    var parts = fen.trim().split(/\s+/);
    var rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var rank = 7 - r, file = 0, row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var c = row[i];
        if (c >= '1' && c <= '8') { file += parseInt(c, 10); continue; }
        var piece = FEN_PIECES[c];
        var sq = sq0x88(file, rank);
        this.board[sq] = piece;
        if (type(piece) === KING) this.kings[colour(piece)] = sq;
        file++;
      }
    }
    this.turn = parts[1] === 'w' ? WHITE : BLACK;
    var cast = parts[2] || '-';
    if (cast.indexOf('K') >= 0) this.castling |= WK;
    if (cast.indexOf('Q') >= 0) this.castling |= WQ;
    if (cast.indexOf('k') >= 0) this.castling |= BK;
    if (cast.indexOf('q') >= 0) this.castling |= BQ;
    var ep = parts[3] || '-';
    this.ep = (ep === '-') ? -1 : sq0x88(ep.charCodeAt(0) - 97, parseInt(ep[1], 10) - 1);
    this.halfmove = parseInt(parts[4] || '0', 10);
    this.fullmove = parseInt(parts[5] || '1', 10);
    return this;
  };

  Position.prototype.fen = function () {
    var out = '';
    for (var rank = 7; rank >= 0; rank--) {
      var run = 0;
      for (var file = 0; file < 8; file++) {
        var p = this.board[sq0x88(file, rank)];
        if (p === EMPTY) { run++; continue; }
        if (run) { out += run; run = 0; }
        out += PIECE_CHARS[p];
      }
      if (run) out += run;
      if (rank) out += '/';
    }
    out += ' ' + (this.turn === WHITE ? 'w' : 'b') + ' ';
    var c = '';
    if (this.castling & WK) c += 'K';
    if (this.castling & WQ) c += 'Q';
    if (this.castling & BK) c += 'k';
    if (this.castling & BQ) c += 'q';
    out += (c || '-') + ' ';
    out += (this.ep < 0 ? '-' : String.fromCharCode(97 + fileOf(this.ep)) + (rankOf(this.ep) + 1));
    out += ' ' + this.halfmove + ' ' + this.fullmove;
    return out;
  };

  Position.prototype.clone = function () {
    var p = new Position();
    p.board = this.board.slice();
    p.turn = this.turn; p.castling = this.castling; p.ep = this.ep;
    p.halfmove = this.halfmove; p.fullmove = this.fullmove;
    p.kings = { 8: this.kings[8], 16: this.kings[16] };
    return p;
  };

  /* ---------- Attack detection ---------- */
  Position.prototype.isAttacked = function (sq, by) {
    var b = this.board, i, d, t, p;

    // pawns
    var pd = (by === WHITE) ? [-15, -17] : [15, 17];
    for (i = 0; i < 2; i++) {
      t = sq + pd[i];
      if (isOn(t) && b[t] && colour(b[t]) === by && type(b[t]) === PAWN) return true;
    }
    // knights
    for (i = 0; i < 8; i++) {
      t = sq + KNIGHT_DIRS[i];
      if (isOn(t) && b[t] && colour(b[t]) === by && type(b[t]) === KNIGHT) return true;
    }
    // king
    for (i = 0; i < 8; i++) {
      t = sq + KING_DIRS[i];
      if (isOn(t) && b[t] && colour(b[t]) === by && type(b[t]) === KING) return true;
    }
    // bishops / queens
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; t = sq + d;
      while (isOn(t)) {
        p = b[t];
        if (p) {
          if (colour(p) === by && (type(p) === BISHOP || type(p) === QUEEN)) return true;
          break;
        }
        t += d;
      }
    }
    // rooks / queens
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i]; t = sq + d;
      while (isOn(t)) {
        p = b[t];
        if (p) {
          if (colour(p) === by && (type(p) === ROOK || type(p) === QUEEN)) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  };

  Position.prototype.inCheck = function (side) {
    side = side || this.turn;
    var k = this.kings[side];
    if (k < 0) return false;
    return this.isAttacked(k, side === WHITE ? BLACK : WHITE);
  };

  /* ---------- Move generation ---------- */
  // A move is an object; allocation is fine at these depths and keeps the
  // code legible, which matters more here than raw nodes/sec.
  function mkMove(from, to, piece, captured, promo, flag) {
    return { from: from, to: to, piece: piece, captured: captured || 0,
             promo: promo || 0, flag: flag || 0 };
  }
  var F_NORMAL = 0, F_EP = 1, F_CASTLE = 2, F_DOUBLE = 3;

  Position.prototype.generateMoves = function (capturesOnly) {
    var moves = [], b = this.board, us = this.turn;
    var them = us === WHITE ? BLACK : WHITE;
    var i, d, sq, t, p, tp;

    for (sq = 0; sq < 128; sq++) {
      if (!isOn(sq)) { sq += 7; continue; }
      p = b[sq];
      if (!p || colour(p) !== us) continue;
      var pt = type(p);

      if (pt === PAWN) {
        var fwd = us === WHITE ? 16 : -16;
        var startRank = us === WHITE ? 1 : 6;
        var promoRank = us === WHITE ? 7 : 0;

        t = sq + fwd;
        if (!capturesOnly && isOn(t) && !b[t]) {
          if (rankOf(t) === promoRank) {
            moves.push(mkMove(sq, t, p, 0, QUEEN | us));
            moves.push(mkMove(sq, t, p, 0, ROOK | us));
            moves.push(mkMove(sq, t, p, 0, BISHOP | us));
            moves.push(mkMove(sq, t, p, 0, KNIGHT | us));
          } else {
            moves.push(mkMove(sq, t, p, 0, 0));
            if (rankOf(sq) === startRank) {
              var t2 = t + fwd;
              if (isOn(t2) && !b[t2]) moves.push(mkMove(sq, t2, p, 0, 0, F_DOUBLE));
            }
          }
        }
        var caps = us === WHITE ? [15, 17] : [-15, -17];
        for (i = 0; i < 2; i++) {
          t = sq + caps[i];
          if (!isOn(t)) continue;
          tp = b[t];
          if (tp && colour(tp) === them) {
            if (rankOf(t) === promoRank) {
              moves.push(mkMove(sq, t, p, tp, QUEEN | us));
              moves.push(mkMove(sq, t, p, tp, ROOK | us));
              moves.push(mkMove(sq, t, p, tp, BISHOP | us));
              moves.push(mkMove(sq, t, p, tp, KNIGHT | us));
            } else {
              moves.push(mkMove(sq, t, p, tp, 0));
            }
          } else if (!tp && t === this.ep) {
            moves.push(mkMove(sq, t, p, PAWN | them, 0, F_EP));
          }
        }
        continue;
      }

      if (pt === KNIGHT || pt === KING) {
        var dirs = pt === KNIGHT ? KNIGHT_DIRS : KING_DIRS;
        for (i = 0; i < 8; i++) {
          t = sq + dirs[i];
          if (!isOn(t)) continue;
          tp = b[t];
          if (tp && colour(tp) === us) continue;
          if (capturesOnly && !tp) continue;
          moves.push(mkMove(sq, t, p, tp, 0));
        }
        continue;
      }

      // sliders
      var sdirs = pt === BISHOP ? BISHOP_DIRS : pt === ROOK ? ROOK_DIRS
                : BISHOP_DIRS.concat(ROOK_DIRS);
      for (i = 0; i < sdirs.length; i++) {
        d = sdirs[i]; t = sq + d;
        while (isOn(t)) {
          tp = b[t];
          if (tp) {
            if (colour(tp) !== us) moves.push(mkMove(sq, t, p, tp, 0));
            break;
          }
          if (!capturesOnly) moves.push(mkMove(sq, t, p, 0, 0));
          t += d;
        }
      }
    }

    // castling
    if (!capturesOnly) {
      var k = this.kings[us];
      if (k >= 0 && !this.isAttacked(k, them)) {
        if (us === WHITE) {
          if ((this.castling & WK) && !b[0x05] && !b[0x06] &&
              b[0x07] === (ROOK | WHITE) &&
              !this.isAttacked(0x05, BLACK) && !this.isAttacked(0x06, BLACK))
            moves.push(mkMove(0x04, 0x06, KING | WHITE, 0, 0, F_CASTLE));
          if ((this.castling & WQ) && !b[0x03] && !b[0x02] && !b[0x01] &&
              b[0x00] === (ROOK | WHITE) &&
              !this.isAttacked(0x03, BLACK) && !this.isAttacked(0x02, BLACK))
            moves.push(mkMove(0x04, 0x02, KING | WHITE, 0, 0, F_CASTLE));
        } else {
          if ((this.castling & BK) && !b[0x75] && !b[0x76] &&
              b[0x77] === (ROOK | BLACK) &&
              !this.isAttacked(0x75, WHITE) && !this.isAttacked(0x76, WHITE))
            moves.push(mkMove(0x74, 0x76, KING | BLACK, 0, 0, F_CASTLE));
          if ((this.castling & BQ) && !b[0x73] && !b[0x72] && !b[0x71] &&
              b[0x70] === (ROOK | BLACK) &&
              !this.isAttacked(0x73, WHITE) && !this.isAttacked(0x72, WHITE))
            moves.push(mkMove(0x74, 0x72, KING | BLACK, 0, 0, F_CASTLE));
        }
      }
    }
    return moves;
  };

  Position.prototype.legalMoves = function () {
    var pseudo = this.generateMoves(false), out = [];
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      this.makeMove(m);
      if (!this.inCheck(this.turn === WHITE ? BLACK : WHITE)) out.push(m);
      this.unmakeMove();
    }
    return out;
  };

  /* ---------- Make / unmake ---------- */
  Position.prototype.makeMove = function (m) {
    var b = this.board, us = this.turn, them = us === WHITE ? BLACK : WHITE;
    this.history.push({
      move: m, castling: this.castling, ep: this.ep,
      halfmove: this.halfmove, kingUs: this.kings[us]
    });

    b[m.from] = EMPTY;
    if (m.flag === F_EP) {
      var capSq = m.to + (us === WHITE ? -16 : 16);
      b[capSq] = EMPTY;
    }
    b[m.to] = m.promo ? m.promo : m.piece;

    if (type(m.piece) === KING) {
      this.kings[us] = m.to;
      if (m.flag === F_CASTLE) {
        if (m.to === 0x06) { b[0x05] = b[0x07]; b[0x07] = EMPTY; }
        else if (m.to === 0x02) { b[0x03] = b[0x00]; b[0x00] = EMPTY; }
        else if (m.to === 0x76) { b[0x75] = b[0x77]; b[0x77] = EMPTY; }
        else if (m.to === 0x72) { b[0x73] = b[0x70]; b[0x70] = EMPTY; }
      }
      this.castling &= us === WHITE ? ~(WK | WQ) : ~(BK | BQ);
    }

    // rook moves / captures clear rights
    if (m.from === 0x00 || m.to === 0x00) this.castling &= ~WQ;
    if (m.from === 0x07 || m.to === 0x07) this.castling &= ~WK;
    if (m.from === 0x70 || m.to === 0x70) this.castling &= ~BQ;
    if (m.from === 0x77 || m.to === 0x77) this.castling &= ~BK;

    this.ep = (m.flag === F_DOUBLE) ? (m.from + (us === WHITE ? 16 : -16)) : -1;
    this.halfmove = (type(m.piece) === PAWN || m.captured) ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = them;
    return this;
  };

  Position.prototype.unmakeMove = function () {
    var h = this.history.pop();
    if (!h) return this;
    var m = h.move, b = this.board;
    var us = this.turn === WHITE ? BLACK : WHITE;

    this.turn = us;
    if (us === BLACK) this.fullmove--;
    this.castling = h.castling;
    this.ep = h.ep;
    this.halfmove = h.halfmove;

    b[m.from] = m.piece;
    b[m.to] = EMPTY;

    if (m.flag === F_EP) {
      var capSq = m.to + (us === WHITE ? -16 : 16);
      b[capSq] = m.captured;
    } else if (m.captured) {
      b[m.to] = m.captured;
    }

    if (type(m.piece) === KING) {
      this.kings[us] = h.kingUs;
      if (m.flag === F_CASTLE) {
        if (m.to === 0x06) { b[0x07] = b[0x05]; b[0x05] = EMPTY; }
        else if (m.to === 0x02) { b[0x00] = b[0x03]; b[0x03] = EMPTY; }
        else if (m.to === 0x76) { b[0x77] = b[0x75]; b[0x75] = EMPTY; }
        else if (m.to === 0x72) { b[0x70] = b[0x73]; b[0x73] = EMPTY; }
      }
    }
    return this;
  };

  /* ---------- Notation ---------- */
  function sqName(sq) {
    return String.fromCharCode(97 + fileOf(sq)) + (rankOf(sq) + 1);
  }
  function nameToSq(name) {
    return sq0x88(name.charCodeAt(0) - 97, parseInt(name[1], 10) - 1);
  }
  function moveUci(m) {
    var s = sqName(m.from) + sqName(m.to);
    if (m.promo) s += 'nbrq'[[KNIGHT, BISHOP, ROOK, QUEEN].indexOf(type(m.promo))];
    return s;
  }

  Position.prototype.moveSan = function (m) {
    var t = type(m.piece);
    if (m.flag === F_CASTLE) return (fileOf(m.to) === 6) ? 'O-O' : 'O-O-O';
    var s = '';
    if (t === PAWN) {
      if (m.captured) s += String.fromCharCode(97 + fileOf(m.from)) + 'x';
      s += sqName(m.to);
      if (m.promo) s += '=' + 'NBRQ'[[KNIGHT, BISHOP, ROOK, QUEEN].indexOf(type(m.promo))];
    } else {
      s += ' PNBRQK'[t];
      // disambiguation
      var others = this.legalMoves().filter(function (o) {
        return o.to === m.to && o.from !== m.from && type(o.piece) === t;
      });
      if (others.length) {
        var sameFile = others.some(function (o) { return fileOf(o.from) === fileOf(m.from); });
        var sameRank = others.some(function (o) { return rankOf(o.from) === rankOf(m.from); });
        if (!sameFile) s += String.fromCharCode(97 + fileOf(m.from));
        else if (!sameRank) s += (rankOf(m.from) + 1);
        else s += sqName(m.from);
      }
      if (m.captured) s += 'x';
      s += sqName(m.to);
    }
    this.makeMove(m);
    if (this.inCheck(this.turn)) s += this.legalMoves().length ? '+' : '#';
    this.unmakeMove();
    return s;
  };

  /* ---------- Evaluation (the teacher) ---------- */
  var VALUE = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 20000 };

  // Piece-square tables, white's point of view, index by 0..63 (a1 = 0).
  var PST = {
    1: [  0,  0,  0,  0,  0,  0,  0,  0,
          5, 10, 10,-20,-20, 10, 10,  5,
          5, -5,-10,  0,  0,-10, -5,  5,
          0,  0,  0, 20, 20,  0,  0,  0,
          5,  5, 10, 25, 25, 10,  5,  5,
         10, 10, 20, 30, 30, 20, 10, 10,
         50, 50, 50, 50, 50, 50, 50, 50,
          0,  0,  0,  0,  0,  0,  0,  0],
    2: [-50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50],
    3: [-20,-10,-10,-10,-10,-10,-10,-20,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -20,-10,-10,-10,-10,-10,-10,-20],
    4: [  0,  0,  5, 10, 10,  5,  0,  0,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
          5, 10, 10, 10, 10, 10, 10,  5,
          0,  0,  0,  0,  0,  0,  0,  0],
    5: [-20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -10,  5,  5,  5,  5,  5,  0,-10,
          0,  0,  5,  5,  5,  5,  0, -5,
         -5,  0,  5,  5,  5,  5,  0, -5,
        -10,  0,  5,  5,  5,  5,  0,-10,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20],
    6: [ 20, 30, 10,  0,  0, 10, 30, 20,
         20, 20,  0,  0,  0,  0, 20, 20,
        -10,-20,-20,-20,-20,-20,-20,-10,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30]
  };

  function mirror64(i) { return (7 - (i >> 3)) * 8 + (i & 7); }

  Position.prototype.evaluate = function () {
    var b = this.board, score = 0, sq, p, t, c, i64;
    var wB = 0, bB = 0;
    for (sq = 0; sq < 128; sq++) {
      if (!isOn(sq)) { sq += 7; continue; }
      p = b[sq];
      if (!p) continue;
      t = type(p); c = colour(p);
      i64 = to64(sq);
      var v = VALUE[t] + PST[t][c === WHITE ? i64 : mirror64(i64)];
      score += (c === WHITE) ? v : -v;
      if (t === BISHOP) { if (c === WHITE) wB++; else bB++; }
    }
    if (wB >= 2) score += 30;
    if (bB >= 2) score -= 30;
    return this.turn === WHITE ? score : -score;
  };

  /* ---------- Search ---------- */
  var MATE = 100000;

  function mvvLva(m) {
    if (!m.captured) return 0;
    return VALUE[type(m.captured)] * 10 - VALUE[type(m.piece)];
  }

  function Search(pos) { this.pos = pos; this.nodes = 0; }

  Search.prototype.quiesce = function (alpha, beta) {
    this.nodes++;
    var stand = this.pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    var moves = this.pos.generateMoves(true);
    moves.sort(function (a, b) { return mvvLva(b) - mvvLva(a); });
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      if (this.pos.inCheck(this.pos.turn === WHITE ? BLACK : WHITE)) {
        this.pos.unmakeMove(); continue;
      }
      var score = -this.quiesce(-beta, -alpha);
      this.pos.unmakeMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  Search.prototype.alphabeta = function (depth, alpha, beta) {
    if (depth <= 0) return this.quiesce(alpha, beta);
    this.nodes++;

    var moves = this.pos.generateMoves(false);
    moves.sort(function (a, b) { return mvvLva(b) - mvvLva(a); });
    var legal = 0;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      if (this.pos.inCheck(this.pos.turn === WHITE ? BLACK : WHITE)) {
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

  Search.prototype.best = function (depth) {
    var moves = this.pos.legalMoves();
    if (!moves.length) return { move: null, score: 0 };
    moves.sort(function (a, b) { return mvvLva(b) - mvvLva(a); });
    var bestMove = moves[0], bestScore = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      this.pos.makeMove(m);
      var score = -this.alphabeta(depth - 1, -Infinity, Infinity);
      this.pos.unmakeMove();
      if (score > bestScore) { bestScore = score; bestMove = m; }
    }
    return { move: bestMove, score: bestScore, nodes: this.nodes };
  };

  /* ---------- Perft (correctness harness) ---------- */
  function perft(pos, depth) {
    if (depth === 0) return 1;
    var moves = pos.generateMoves(false), n = 0;
    for (var i = 0; i < moves.length; i++) {
      pos.makeMove(moves[i]);
      if (!pos.inCheck(pos.turn === WHITE ? BLACK : WHITE)) n += perft(pos, depth - 1);
      pos.unmakeMove();
    }
    return n;
  }

  /* ---------- Game status ---------- */
  Position.prototype.status = function () {
    var moves = this.legalMoves();
    if (!moves.length) return this.inCheck(this.turn) ? 'checkmate' : 'stalemate';
    if (this.halfmove >= 100) return 'draw-50';
    // insufficient material (crude but correct for the common cases)
    var pieces = [];
    for (var sq = 0; sq < 128; sq++) {
      if (!isOn(sq)) { sq += 7; continue; }
      if (this.board[sq]) pieces.push(type(this.board[sq]));
    }
    if (pieces.length <= 2) return 'draw-material';
    if (pieces.length === 3 && (pieces.indexOf(KNIGHT) >= 0 || pieces.indexOf(BISHOP) >= 0))
      return 'draw-material';
    return 'ok';
  };

  return {
    Position: Position, Search: Search, perft: perft,
    START_FEN: START_FEN,
    EMPTY: EMPTY, PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP,
    ROOK: ROOK, QUEEN: QUEEN, KING: KING, WHITE: WHITE, BLACK: BLACK,
    type: type, colour: colour, isOn: isOn, to64: to64, sq0x88: sq0x88,
    rankOf: rankOf, fileOf: fileOf, sqName: sqName, nameToSq: nameToSq,
    moveUci: moveUci, VALUE: VALUE, PST: PST, mirror64: mirror64
  };
}));
