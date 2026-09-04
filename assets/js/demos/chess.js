/* =============================================================
   Play chess against Cypha.

   The engine, the feature map and the distilled head are all loaded
   as separate scripts. This file is only the board, the interaction
   and the readouts.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('cx-demo');
  if (!root) return;

  var C = window.ImortekChess;
  var CY = window.ImortekChessCypha;
  if (!C || !CY) return;

  var boardEl = document.getElementById('cx-board');
  var statusEl = document.getElementById('cx-status');
  var evalEl = document.getElementById('cx-eval');
  var nodesEl = document.getElementById('cx-nodes');
  var candEl = document.getElementById('cx-candidates');
  var movesEl = document.getElementById('cx-moves');
  var fillEl = document.getElementById('cx-evalfill');

  var GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };

  var pos = new C.Position().setFen(C.START_FEN);
  var evaluator = null;
  var humanColour = C.WHITE;
  var depth = 2;
  var selected = -1;
  var legalCache = [];
  var thinking = false;
  var sanHistory = [];
  var pendingPromotion = null;
  var lastMove = null;

  /* ---------- Load the distilled model ---------- */
  fetch('/assets/data/cypha-chess.json')
    .then(function (r) {
      if (!r.ok) throw new Error('model ' + r.status);
      return r.json();
    })
    .then(function (m) {
      evaluator = new CY.CyphaEval(m);

      var mt = m.metrics || {};
      set('cx-r2', mt.testR2 !== undefined ? mt.testR2.toFixed(3) : '—');
      set('cx-rmse', mt.testRmsePawns !== undefined ? mt.testRmsePawns.toFixed(2) + ' pawns' : '—');
      set('cx-positions', (m.training && m.training.positions)
        ? m.training.positions.toLocaleString() : '—');
      if (mt.match) {
        set('cx-match', mt.match.wins + 'W ' + mt.match.losses + 'L ' + mt.match.draws + 'D');
      }
      newGame();
    })
    .catch(function (e) {
      statusEl.className = 'verdict is-deny';
      statusEl.innerHTML = '<div class="verdict__label">Model unavailable</div>' +
        '<div class="verdict__why">Could not load the distilled weights (' +
        String(e.message) + '). The board below is still a fully working chess engine — ' +
        'it just has no opponent.</div>';
      render();
    });

  function set(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  /* ---------- Board ---------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) {
        var rank = (humanColour === C.WHITE) ? 7 - r : r;
        var file = (humanColour === C.WHITE) ? f : 7 - f;
        var sq = C.sq0x88(file, rank);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'sq ' + (((rank + file) % 2) ? 'sq--light' : 'sq--dark');
        cell.dataset.sq = sq;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', C.sqName(sq));
        cell.addEventListener('click', onSquare);
        boardEl.appendChild(cell);
      }
    }
  }

  function render() {
    var cells = boardEl.querySelectorAll('.sq');
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var sq = parseInt(cell.dataset.sq, 10);
      var p = pos.board[sq];
      cell.innerHTML = '';
      cell.className = cell.className.replace(/ is-\w+/g, '');

      if (p) {
        var span = document.createElement('span');
        span.className = 'pc ' + (C.colour(p) === C.WHITE ? 'pc--w' : 'pc--b');
        span.textContent = GLYPH[C.type(p)];
        cell.appendChild(span);
      }
      if (sq === selected) cell.className += ' is-selected';
      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cell.className += ' is-last';
      for (var j = 0; j < legalCache.length; j++) {
        if (legalCache[j].to === sq) {
          cell.className += pos.board[sq] ? ' is-capture' : ' is-target';
          break;
        }
      }
      var kp = pos.kings[pos.turn];
      if (sq === kp && pos.inCheck(pos.turn)) cell.className += ' is-check';
    }
    renderMoves();
  }

  function renderMoves() {
    var out = '';
    for (var i = 0; i < sanHistory.length; i += 2) {
      out += '<span class="">' + (i / 2 + 1) + '.</span> ' +
             '<span class="hl">' + sanHistory[i] + '</span> ' +
             (sanHistory[i + 1] ? '<span class="vi">' + sanHistory[i + 1] + '</span>' : '') + '\n';
    }
    movesEl.innerHTML = out;
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  /* ---------- Interaction ---------- */
  function onSquare(e) {
    if (thinking || pendingPromotion || !evaluator) return;
    if (pos.turn !== humanColour) return;
    if (pos.status() !== 'ok') return;

    var sq = parseInt(e.currentTarget.dataset.sq, 10);

    // completing a move?
    var picked = legalCache.filter(function (m) { return m.to === sq; });
    if (picked.length) {
      if (picked.length > 1 && picked[0].promo) {
        pendingPromotion = picked;
        showPromotion(sq);
        return;
      }
      playHuman(picked[0]);
      return;
    }

    // selecting a piece
    var p = pos.board[sq];
    if (p && C.colour(p) === humanColour) {
      selected = sq;
      legalCache = pos.legalMoves().filter(function (m) { return m.from === sq; });
    } else {
      selected = -1;
      legalCache = [];
    }
    render();
  }

  function showPromotion(sq) {
    var box = document.createElement('div');
    box.className = 'promo';
    [C.QUEEN, C.ROOK, C.BISHOP, C.KNIGHT].forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'promo__opt';
      b.innerHTML = '<span class="pc ' + (humanColour === C.WHITE ? 'pc--w' : 'pc--b') + '">' +
                    GLYPH[t] + '</span>';
      b.setAttribute('aria-label', ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'][t]);
      b.addEventListener('click', function () {
        var m = pendingPromotion.filter(function (x) { return C.type(x.promo) === t; })[0];
        pendingPromotion = null;
        box.remove();
        if (m) playHuman(m);
      });
      box.appendChild(b);
    });
    root.querySelector('.chess-wrap').appendChild(box);
  }

  function playHuman(m) {
    sanHistory.push(pos.moveSan(m));
    pos.makeMove(m);
    lastMove = m;
    selected = -1;
    legalCache = [];
    render();
    updateStatus();
    if (pos.status() === 'ok') {
      thinking = true;
      setTimeout(cyphaMove, 220);          // let the board paint first
    }
  }

  /* ---------- Cypha ---------- */
  function cyphaMove() {
    if (!evaluator) { thinking = false; return; }
    var search = new CY.CyphaSearch(pos, evaluator);
    var t0 = performance.now();
    // A little temperature at the lowest strength, so casual games vary.
    var temp = depth === 1 ? 0.9 : 0;
    var res = search.best(depth, temp);
    var ms = performance.now() - t0;

    if (!res.move) { thinking = false; updateStatus(); return; }

    showCandidates(res.ranked, res.move);
    nodesEl.textContent = res.nodes.toLocaleString() + ' · ' + Math.round(ms) + 'ms';

    sanHistory.push(pos.moveSan(res.move));
    pos.makeMove(res.move);
    lastMove = res.move;
    thinking = false;
    render();
    updateStatus();
    updateEval();
  }

  function showCandidates(ranked, chosen) {
    var top = ranked.slice(0, 4);
    var best = top.length ? top[0].score : 0;
    candEl.innerHTML = top.map(function (r) {
      var san;
      try { san = pos.moveSan(r.move); } catch (e) { san = C.moveUci(r.move); }
      var delta = r.score - best;
      var pawns = (r.score / 100);
      var isPick = r.move === chosen;
      var width = Math.max(6, 100 + delta / 12);
      return '<div class="cand' + (isPick ? ' is-pick' : '') + '">' +
        '<span class="cand__san mono">' + san + '</span>' +
        '<span class="cand__bar"><i style="width:' + Math.min(100, width).toFixed(0) + '%"></i></span>' +
        '<span class="cand__score mono">' + (pawns >= 0 ? '+' : '') + pawns.toFixed(2) + '</span>' +
        '</div>';
    }).join('');
  }

  function updateEval() {
    if (!evaluator) return;
    var cp = evaluator.evaluate(pos);
    // always report from white's point of view, as a human expects
    var white = (pos.turn === C.WHITE) ? cp : -cp;
    var pawns = white / 100;
    evalEl.textContent = (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
    evalEl.className = 'readout__v ' + (Math.abs(pawns) < 0.6 ? 'plain' : pawns > 0 ? '' : 'violet');

    // eval bar: squash to a sensible visual range
    var frac = 1 / (1 + Math.exp(-pawns / 3));
    fillEl.style.height = (frac * 100).toFixed(1) + '%';
  }

  function updateStatus() {
    var st = pos.status();
    var mine = pos.turn === humanColour;
    if (st === 'checkmate') {
      var humanWon = !mine;
      statusEl.className = 'verdict ' + (humanWon ? 'is-allow' : 'is-deny');
      statusEl.innerHTML = '<div class="verdict__label">' +
        (humanWon ? 'YOU WIN' : 'CYPHA WINS') + '</div>' +
        '<div class="verdict__why">Checkmate in ' + Math.ceil(sanHistory.length / 2) + ' moves.</div>';
      return;
    }
    if (st === 'stalemate' || st === 'draw-50' || st === 'draw-material') {
      statusEl.className = 'verdict';
      statusEl.innerHTML = '<div class="verdict__label">DRAW</div>' +
        '<div class="verdict__why">' +
        (st === 'stalemate' ? 'Stalemate — no legal move, and not in check.'
         : st === 'draw-50' ? 'Fifty-move rule.'
         : 'Insufficient material.') + '</div>';
      return;
    }
    var check = pos.inCheck(pos.turn);
    statusEl.className = 'verdict' + (check ? ' is-deny' : '');
    statusEl.innerHTML = '<div class="verdict__label">' +
      (thinking ? 'CYPHA IS THINKING' : mine ? 'YOUR MOVE' : 'CYPHA TO MOVE') + '</div>' +
      '<div class="verdict__why">' +
      (check ? '<strong>Check.</strong> ' : '') +
      (mine ? 'Click a piece to see where it can go.'
            : 'Searching to depth ' + depth + ' with the distilled evaluation.') +
      '</div>';
  }

  /* ---------- Controls ---------- */
  function newGame() {
    pos = new C.Position().setFen(C.START_FEN);
    sanHistory = [];
    selected = -1;
    legalCache = [];
    lastMove = null;
    thinking = false;
    candEl.innerHTML = '';
    nodesEl.textContent = '—';
    buildBoard();
    render();
    updateEval();
    updateStatus();
    if (humanColour === C.BLACK) {
      thinking = true;
      updateStatus();
      setTimeout(cyphaMove, 350);
    }
  }

  document.getElementById('cx-new').addEventListener('click', newGame);

  document.getElementById('cx-undo').addEventListener('click', function () {
    if (thinking) return;
    // take back a full move pair so it is the human's turn again
    for (var i = 0; i < 2 && pos.history.length; i++) {
      pos.unmakeMove();
      sanHistory.pop();
    }
    selected = -1; legalCache = []; lastMove = null;
    render(); updateEval(); updateStatus();
  });

  document.getElementById('cx-hint').addEventListener('click', function () {
    if (thinking || !evaluator || pos.status() !== 'ok') return;
    var res = new CY.CyphaSearch(pos, evaluator).best(depth, 0);
    if (res.move) {
      showCandidates(res.ranked, res.move);
      selected = res.move.from;
      legalCache = [res.move];
      render();
    }
  });

  root.querySelectorAll('[data-depth]').forEach(function (b) {
    b.addEventListener('click', function () {
      depth = parseInt(b.dataset.depth, 10);
      root.querySelectorAll('[data-depth]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      updateStatus();
    });
  });

  document.getElementById('cx-flip').addEventListener('change', function (e) {
    humanColour = e.target.checked ? C.BLACK : C.WHITE;
    newGame();
  });

  buildBoard();
  render();
})();
