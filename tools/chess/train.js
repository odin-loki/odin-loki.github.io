/* =============================================================
   Distil Cypha from the Imortek reference engine.

   1. Generate diverse positions by self-play with randomised openings.
   2. Label each with the teacher's own alpha-beta search evaluation.
   3. Fit Cypha's regression head:
        WorldPrior θ₀  — per-feature mean/variance, Welford, one pass
        whitening      — the natural-gradient metric
        online NLMS    — natural-gradient weight updates
        MDL decay λ    — pulls weights back toward the prior
        priority replay— surprise-weighted buffer, 0.30 replay ratio
   4. Report held-out R² and a head-to-head match against the teacher.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const C = require('../../assets/js/chess/engine.js');
const F = require('../../assets/js/chess/features.js');
const CY = require('../../assets/js/chess/cypha.js');

const ARG = k => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : null;
};
const GAMES      = parseInt(ARG('games') || '260', 10);
const LABEL_DEPTH= parseInt(ARG('depth') || '4', 10);
const PLAY_DEPTH = 2;
const EPOCHS     = parseInt(ARG('epochs') || '14', 10);
const CLIP       = 1200;
const SEED       = 20260904;

// deterministic RNG so a rebuild reproduces the same model
let _s = SEED;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) / 4294967296); }
function ri(n) { return Math.floor(rnd() * n); }

/* ---------- 1. Position generation ---------- */
function generate() {
  const positions = [];
  const seen = new Set();
  for (let g = 0; g < GAMES; g++) {
    const pos = new C.Position().setFen(C.START_FEN);
    const openingRandom = 2 + ri(8);
    for (let ply = 0; ply < 90; ply++) {
      const st = pos.status();
      if (st !== 'ok') break;
      const moves = pos.legalMoves();
      if (!moves.length) break;

      let m;
      if (ply < openingRandom || rnd() < 0.18) {
        m = moves[ri(moves.length)];               // diversity
      } else {
        const s = new C.Search(pos);
        m = s.best(PLAY_DEPTH).move || moves[ri(moves.length)];
      }

      // Sample quiet-ish positions across the whole game
      if (ply >= 4 && rnd() < 0.42) {
        const fen = pos.fen().split(' ').slice(0, 4).join(' ');
        if (!seen.has(fen)) { seen.add(fen); positions.push(fen); }
      }
      pos.makeMove(m);
    }
    if ((g + 1) % 40 === 0) {
      process.stdout.write(`  games ${g + 1}/${GAMES}  positions ${positions.length}\n`);
    }
  }
  return positions;
}

/* ---------- 2. Labelling ---------- */
function label(fens) {
  const X = [], Y = [];
  const t0 = Date.now();
  for (let i = 0; i < fens.length; i++) {
    const pos = new C.Position().setFen(fens[i] + ' 0 1');
    if (pos.status() !== 'ok') continue;
    const s = new C.Search(pos);
    const r = s.best(LABEL_DEPTH);
    if (r.move === null) continue;
    let y = r.score;
    if (Math.abs(y) > 50000) continue;             // drop mate scores
    y = Math.max(-CLIP, Math.min(CLIP, y));
    X.push(Float32Array.from(F.extract(pos)));
    Y.push(y / 100);                                // pawns
    if ((i + 1) % 1000 === 0) {
      const rate = (i + 1) / ((Date.now() - t0) / 1000);
      process.stdout.write(`  labelled ${i + 1}/${fens.length}  (${rate.toFixed(0)}/s)\n`);
    }
  }
  return { X, Y };
}

/* ---------- 3. Fit Cypha's regression head ---------- */
function fit(X, Y) {
  const D = F.DIM, N = X.length;

  // WorldPrior θ₀ — Welford, one pass, exactly as the online model does it.
  const mu = new Float64Array(D), m2 = new Float64Array(D);
  for (let n = 0; n < N; n++) {
    const x = X[n];
    for (let i = 0; i < D; i++) {
      const d = x[i] - mu[i];
      mu[i] += d / (n + 1);
      m2[i] += d * (x[i] - mu[i]);
    }
  }
  const sigma = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    sigma[i] = Math.sqrt(Math.max(1e-4, m2[i] / Math.max(1, N - 1)));
    if (sigma[i] < 1e-3) sigma[i] = 1e-3;           // dead features stay dead
  }

  const whiten = (x, z) => {
    for (let i = 0; i < D; i++) z[i] = (x[i] - mu[i]) / sigma[i];
    return z;
  };

  const w = new Float64Array(D);
  let b = 0;
  const z = new Float64Array(D);

  // Cypha's priority replay buffer: capacity 10,000, weighted by surprise,
  // replayed at a 0.30 ratio — the reference defaults from the README.
  const CAP = 10000, REPLAY = 0.30;
  const buf = [];

  const lr0 = 0.55, lrB = 0.02, lambda = 2.5e-6;

  function step(n, lr) {
    const x = X[n], y = Y[n];
    whiten(x, z);
    let pred = b, nz = 0;
    for (let i = 0; i < D; i++) { pred += w[i] * z[i]; nz += z[i] * z[i]; }
    const err = y - pred;
    const denom = nz + 1e-3;
    const g = lr * err / denom;                     // natural-gradient (NLMS) step
    for (let i = 0; i < D; i++) w[i] += g * z[i];
    b += lrB * err;
    for (let i = 0; i < D; i++) w[i] *= (1 - lambda);   // MDL decay
    return Math.abs(err);
  }

  const order = Array.from({ length: N }, (_, i) => i);
  for (let e = 0; e < EPOCHS; e++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = ri(i + 1); const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const lr = lr0 * Math.pow(0.82, e);
    let sum = 0;
    for (let k = 0; k < order.length; k++) {
      const n = order[k];
      const err = step(n, lr);
      sum += err;

      // surprise-weighted replay
      buf.push({ n, err });
      if (buf.length > CAP) buf.shift();
      if (rnd() < REPLAY && buf.length > 64) {
        // sample two candidates, replay the more surprising one
        const a = buf[ri(buf.length)], c = buf[ri(buf.length)];
        step((a.err > c.err ? a : c).n, lr * 0.6);
      }
    }
    process.stdout.write(`  epoch ${String(e + 1).padStart(2)}  lr=${lr.toFixed(3)}  MAE=${(sum / N).toFixed(4)} pawns\n`);
  }

  return { mu: Array.from(mu), sigma: Array.from(sigma), w: Array.from(w), b, scale: 100 };
}

/* ---------- 4. Evaluation ---------- */
function r2(params, X, Y) {
  const ev = new CY.CyphaEval(params);
  const D = F.DIM;
  let ssRes = 0, ssTot = 0, mean = 0;
  for (const y of Y) mean += y;
  mean /= Y.length;
  for (let n = 0; n < X.length; n++) {
    let pred = params.b;
    for (let i = 0; i < D; i++) pred += params.w[i] * ((X[n][i] - params.mu[i]) / params.sigma[i]);
    ssRes += (Y[n] - pred) ** 2;
    ssTot += (Y[n] - mean) ** 2;
  }
  return { r2: 1 - ssRes / ssTot, rmse: Math.sqrt(ssRes / X.length) };
}

function playMatch(params, games, cyphaDepth, teacherDepth) {
  const ev = new CY.CyphaEval(params);
  let cw = 0, cl = 0, dr = 0;
  for (let g = 0; g < games; g++) {
    const pos = new C.Position().setFen(C.START_FEN);
    const cyphaIsWhite = (g % 2 === 0);
    let result = null;
    for (let ply = 0; ply < 160; ply++) {
      const st = pos.status();
      if (st === 'checkmate') { result = (pos.turn === C.WHITE) ? 'black' : 'white'; break; }
      if (st !== 'ok') { result = 'draw'; break; }
      const cyphaToMove = (pos.turn === C.WHITE) === cyphaIsWhite;
      let m;
      if (ply < 4) {
        const ms = pos.legalMoves(); m = ms[ri(ms.length)];
      } else if (cyphaToMove) {
        m = new CY.CyphaSearch(pos, ev).best(cyphaDepth).move;
      } else {
        m = new C.Search(pos).best(teacherDepth).move;
      }
      if (!m) { result = 'draw'; break; }
      pos.makeMove(m);
    }
    if (result === null) result = 'draw';
    if (result === 'draw') dr++;
    else if ((result === 'white') === cyphaIsWhite) cw++;
    else cl++;
    process.stdout.write(`  game ${g + 1}/${games}: ${result}  (cypha ${cyphaIsWhite ? 'white' : 'black'})  running ${cw}W-${cl}L-${dr}D\n`);
  }
  return { wins: cw, losses: cl, draws: dr, games };
}

/* ---------- Run ---------- */
console.log(`Generating positions from ${GAMES} self-play games...`);
const fens = generate();
console.log(`  ${fens.length} unique positions\n`);

console.log(`Labelling at teacher depth ${LABEL_DEPTH}...`);
const { X, Y } = label(fens);
console.log(`  ${X.length} labelled\n`);

const split = Math.floor(X.length * 0.85);
const Xtr = X.slice(0, split), Ytr = Y.slice(0, split);
const Xte = X.slice(split), Yte = Y.slice(split);

console.log(`Fitting Cypha head on ${Xtr.length} (holding out ${Xte.length})...`);
const params = fit(Xtr, Ytr);

const trFit = r2(params, Xtr, Ytr);
const teFit = r2(params, Xte, Yte);
console.log(`\n  train  R²=${trFit.r2.toFixed(4)}  RMSE=${trFit.rmse.toFixed(3)} pawns`);
console.log(`  test   R²=${teFit.r2.toFixed(4)}  RMSE=${teFit.rmse.toFixed(3)} pawns\n`);

console.log('Match: Cypha(d2) vs teacher(d2)...');
const match = playMatch(params, parseInt(ARG('match') || '20', 10), 2, 2);
console.log(`\n  Cypha ${match.wins}W ${match.losses}L ${match.draws}D of ${match.games}`);

const outDir = path.join(__dirname, '..', '..', 'assets', 'data');
fs.mkdirSync(outDir, { recursive: true });

const round = (a, p) => a.map(v => Number(v.toFixed(p)));
const model = {
  model: 'cypha-chess',
  version: 1,
  note: 'Cypha regression head distilled from the Imortek reference engine.',
  dim: F.DIM,
  scale: params.scale,
  b: Number(params.b.toFixed(6)),
  mu: round(params.mu, 5),
  sigma: round(params.sigma, 5),
  w: round(params.w, 5),
  training: {
    games: GAMES,
    positions: X.length,
    train: Xtr.length,
    holdout: Xte.length,
    teacherDepth: LABEL_DEPTH,
    epochs: EPOCHS,
    clipCentipawns: CLIP
  },
  metrics: {
    trainR2: Number(trFit.r2.toFixed(4)),
    testR2: Number(teFit.r2.toFixed(4)),
    trainRmsePawns: Number(trFit.rmse.toFixed(3)),
    testRmsePawns: Number(teFit.rmse.toFixed(3)),
    match: match
  }
};
const outPath = path.join(outDir, 'cypha-chess.json');
fs.writeFileSync(outPath, JSON.stringify(model));
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`\nWrote ${outPath} (${kb} KB)`);
