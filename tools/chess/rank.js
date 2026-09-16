/* =============================================================
   Rank the chess head on an internal scale.

     node tools/chess/rank.js [gamesPerPairing]

   There is no way to put a FIDE number on this honestly: that would
   need games against rated humans, and there have not been any. What
   can be measured is how the head compares with the reference engine
   it was distilled from, at several search depths, so that is what is
   published — an internal ladder anchored at reference(d1) = 1000.

   Ratings are fitted by Bradley-Terry maximum likelihood over every
   pairing, not by the sequential Elo update rule, so the result does
   not depend on the order the games were played in. The reported
   uncertainty is the usual 1/sqrt(information) standard error, and it
   is wide, because these are hundreds of games rather than thousands.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const C  = require('../../assets/js/chess/engine.js');
const CY = require('../../assets/js/chess/cypha.js');
const M  = require('../../assets/data/cypha-chess.json');

const N = parseInt(process.argv[2] || '16', 10);
let seed = 20260916;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const shipped = new CY.CyphaEval(M);
const players = [];
for (const d of [1, 2, 3]) players.push({ name: 'reference d' + d, kind: 'ref', depth: d });
for (const d of [1, 2, 3]) players.push({ name: 'cypha d' + d,     kind: 'cy',  depth: d });

function move(p, pos) {
  return p.kind === 'ref'
    ? new C.Search(pos).best(p.depth).move
    : new CY.CyphaSearch(pos, shipped).best(p.depth, 0).move;
}

/* One game. Returns 1 if a wins, 0 if b wins, 0.5 for a draw. */
function game(a, b, openingSeed) {
  seed = openingSeed;
  const pos = new C.Position().setFen(C.START_FEN);
  for (let i = 0; i < 4; i++) {
    const ms = pos.legalMoves();
    if (!ms.length) break;
    pos.makeMove(ms[Math.floor(rnd() * ms.length)]);
  }
  let ply = 0;
  while (pos.status() === 'ok' && ply < 160) {
    const mover = (pos.turn === C.WHITE) === (ply % 2 === ply % 2 && true) ? null : null;
    const p = (ply % 2 === 0) ? a : b;   // a moves first from the opening position
    const m = move(p, pos);
    if (!m) break;
    pos.makeMove(m);
    ply++;
  }
  if (pos.status() !== 'checkmate') return 0.5;
  // The side to move is mated, so the player who did NOT just move lost.
  const loserMovedLast = (ply % 2 === 1);   // a moved on even plies
  return loserMovedLast ? 1 : 0;            // if b (odd ply) is mated, a wins
}

const S = players.map(() => 0);      // score
const G = players.map(() => 0);      // games
const H = [];                        // head-to-head results for the fit
console.log(`${players.length} players, ${N} games per pairing, ${players.length * (players.length - 1) / 2 * N} games total`);

for (let i = 0; i < players.length; i++) {
  for (let j = i + 1; j < players.length; j++) {
    let si = 0;
    for (let g = 0; g < N; g++) {
      // alternate who moves first, and reuse the same opening for both halves
      const openingSeed = 1000 + g * 7919;
      const r = (g % 2 === 0) ? game(players[i], players[j], openingSeed)
                              : 1 - game(players[j], players[i], openingSeed);
      si += r;
    }
    S[i] += si;          G[i] += N;
    S[j] += (N - si);    G[j] += N;
    H.push({ i, j, n: N, si });
    console.log(`  ${players[i].name.padEnd(13)} vs ${players[j].name.padEnd(13)} ${si.toFixed(1)} - ${(N - si).toFixed(1)}`);
  }
}

/* Bradley-Terry MLE, anchored so reference d1 = 1000. */
const R = players.map(() => 1000);
const E = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
for (let it = 0; it < 4000; it++) {
  const grad = players.map(() => 0), info = players.map(() => 0);
  for (const h of H) {
    const e = E(R[h.i], R[h.j]);
    grad[h.i] += h.si - h.n * e;
    grad[h.j] += (h.n - h.si) - h.n * (1 - e);
    const v = h.n * e * (1 - e);
    info[h.i] += v; info[h.j] += v;
  }
  for (let k = 0; k < R.length; k++) if (info[k] > 0) R[k] += 60 * grad[k] / info[k];
  const shift = R[0] - 1000;
  for (let k = 0; k < R.length; k++) R[k] -= shift;       // re-anchor
}

const info = players.map(() => 0);
for (const h of H) {
  const e = E(R[h.i], R[h.j]), v = h.n * e * (1 - e);
  info[h.i] += v; info[h.j] += v;
}

console.log('\n  rating   ±     record        player');
const out = {};
players.forEach((p, k) => {
  const se = info[k] > 0 ? 400 / Math.LN10 / Math.sqrt(info[k]) : 0;
  out[p.name] = { rating: Math.round(R[k]), se: Math.round(se),
                  score: S[k], games: G[k], kind: p.kind, depth: p.depth };
  console.log(`  ${String(Math.round(R[k])).padStart(6)}  ${String(Math.round(se)).padStart(3)}  ` +
              `${S[k].toFixed(1).padStart(5)}/${String(G[k]).padEnd(4)}  ${p.name}`);
});

const dst = path.join(__dirname, '../../assets/data/cypha-chess-rank.json');
fs.writeFileSync(dst, JSON.stringify({
  scale: 'Imortek internal — reference engine at depth 1 anchored to 1000. Not FIDE.',
  gamesPerPairing: N,
  totalGames: players.length * (players.length - 1) / 2 * N,
  method: 'Bradley-Terry maximum likelihood over all pairings',
  players: out
}, null, 1));
console.log('\nwrote ' + dst);
