// Procedural, seeded level generator. Every level is verified solvable by a greedy solver
// before the belt capacity is fixed, so difficulty comes from the margin, never luck.
import { makeRng } from './rng.js';
import { Board, VOID, EMPTY, BLOCK, GEN, PER_BLOCK } from './board.js';

export const NCOLORS = 10;
export const NCOLS = 4;
export const TRAY = 3;
export const MAX_CAP = 40;
const MIN_CAP = 18;

export function tierOf(n) {
  if (n % 10 === 0) return 'veryhard';
  if (n % 5 === 0) return 'hard';
  return 'normal';
}

export function levelParams(n) {
  const tier = tierOf(n);
  const W = n <= 1 ? 3 : n <= 2 ? 4 : n <= 6 ? 5 : 6;
  const H = n <= 1 ? 2 : n <= 3 ? 3 : n <= 6 ? 4 : n <= 12 ? 5 : n <= 25 ? 6 : 7;
  const colors = Math.min(NCOLORS, 3 + Math.floor(n / 3) + (tier === 'normal' ? 0 : 1));
  const hidden = n < 4 ? 0 : Math.min(0.5, 0.12 + n * 0.008) + (tier === 'veryhard' ? 0.1 : 0);
  const gens = n < 7 ? 0 : n < 14 ? 1 : n < 30 ? 2 : 2 + (n % 3 === 0 ? 2 : 0);
  const genLen = n < 14 ? 2 : n < 30 ? 3 : 4;
  const baseMargin = n <= 2 ? 20 : Math.max(14, Math.round(26 - n * 0.3));
  const margin = tier === 'veryhard' ? 8 : tier === 'hard' ? 9 : baseMargin;
  const noise = n < 3 ? 0 : Math.min(6, 1 + Math.floor(n / 7)) + (tier === 'normal' ? 0 : tier === 'hard' ? 3 : 4);
  return { n, tier, W, H, colors, hidden, gens, genLen, margin, noise };
}

// ---------- shape ----------
function makeMask(p, R) {
  const { W, H } = p, m = [];
  for (let y = 0; y < H; y++) m.push(new Array(W).fill(true));
  const cutSym = (x, y) => { m[y][x] = false; m[y][W - 1 - x] = false; };
  if (H >= 4 && R.chance(0.6)) { // narrower crown, like a pyramid/arch
    for (let x = 0; x < Math.floor((W - 2) / 2); x++) cutSym(x, 0);
    if (H >= 5 && W >= 6 && R.chance(0.6)) cutSym(0, 1);
  }
  if (H >= 4 && W >= 5 && R.chance(0.45)) cutSym(0, H - 1); // narrow outlet row
  if (H >= 5 && W >= 6 && R.chance(0.35)) cutSym(R.range(1, 2), R.range(1, H - 3)); // interior holes
  return m;
}

function connectedToExit(b) {
  const seen = new Uint8Array(b.type.length), q = [];
  for (let x = 0; x < b.W; x++) {
    const i = b.idx(x, b.H - 1);
    if (b.type[i] !== VOID && b.type[i] !== GEN) { seen[i] = 1; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    for (const j of b.neighbors(q[h])) {
      if (!seen[j] && b.type[j] !== VOID && b.type[j] !== GEN) { seen[j] = 1; q.push(j); }
    }
  }
  for (let i = 0; i < b.type.length; i++) {
    if (b.type[i] !== VOID && b.type[i] !== GEN && !seen[i]) return false;
  }
  return true;
}

function buildBoard(p, R) {
  const b = new Board(p.W, p.H);
  for (let tries = 0; ; tries++) {
    const mask = tries < 8 ? makeMask(p, R) : null; // fall back to a plain rectangle
    for (let y = 0; y < p.H; y++) for (let x = 0; x < p.W; x++) b.type[b.idx(x, y)] = !mask || mask[y][x] ? BLOCK : VOID;
    if (connectedToExit(b)) break;
  }

  // Generators sit on top-edge cells and feed the cell beneath them.
  const cands = [];
  for (let y = 0; y < p.H - 2; y++) for (let x = 0; x < p.W; x++) {
    const i = b.idx(x, y);
    if (b.type[i] === BLOCK && (y === 0 || b.type[i - p.W] === VOID) && b.type[i + p.W] === BLOCK) cands.push(i);
  }
  R.shuffle(cands);
  for (const i of cands) {
    if (b.gens.length >= p.gens) break;
    if (b.gens.some((g) => g.out === i || Math.abs(g.at - i) <= 1)) continue;
    b.type[i] = GEN;
    if (!connectedToExit(b)) { b.type[i] = BLOCK; continue; }
    b.gens.push({ at: i, out: i + p.W, queue: new Array(R.range(1, p.genLen)).fill(0) });
  }
  return b;
}

function assignColors(b, p, R) {
  const cells = [];
  for (let i = 0; i < b.type.length; i++) if (b.type[i] === BLOCK) cells.push(i);
  const total = cells.length + b.gens.reduce((s, g) => s + g.queue.length, 0);
  const k = Math.min(p.colors, Math.max(2, Math.floor(total / 2)));
  const palette = R.shuffle([...Array(NCOLORS).keys()]).slice(0, k);
  const list = [];
  for (let i = 0; i < total; i++) list.push(palette[i % k]);
  R.shuffle(list);
  let c = 0;
  for (const i of cells) { b.color[i] = list[c++]; b.count[i] = PER_BLOCK; }
  for (const g of b.gens) g.queue = g.queue.map(() => list[c++]);

  for (const i of cells) {
    if (!b.isExitRow(i) && !b.gens.some((g) => g.out === i) && R.chance(p.hidden)) b.hidden[i] = 1;
  }
  b.revealExposed();
}

// ---------- trays ----------
// A plausible play order (random taps) defines when each colour is needed; noise scrambles it.
function intendedOrder(board, R) {
  const b = board.clone(), order = [];
  for (let list = b.tappableList(); list.length; list = b.tappableList()) {
    const i = R.pick(list);
    for (let t = 0; t < b.count[i] / TRAY; t++) order.push(b.color[i]);
    b.clearCell(i);
  }
  return order;
}

function dealTrays(seq, p, R) {
  for (let i = 0; i < seq.length; i++) {
    const j = Math.min(seq.length - 1, i + R.int(p.noise + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  const cols = Array.from({ length: NCOLS }, () => []);
  for (const c of seq) {
    const min = Math.min(...cols.map((col) => col.length));
    const opts = cols.filter((col) => col.length <= min + (R.chance(0.3) ? 1 : 0));
    R.pick(opts).push(c);
  }
  return cols;
}

// ---------- solver ----------
// Mirrors the belt: marbles pass the columns right-to-left and only a column's front tray takes
// marbles. A tray that fills opens the next one only on the following round.
function resolve(cols, ptr, fill, pool) {
  let moved = true;
  while (moved) {
    moved = false;
    for (let k = cols.length - 1; k >= 0; k--) {
      if (ptr[k] >= cols[k].length) continue;
      const c = cols[k][ptr[k]], take = Math.min(TRAY - fill[k], pool[c]);
      if (take <= 0) continue;
      fill[k] += take; pool[c] -= take; moved = true;
      if (fill[k] === TRAY) { ptr[k]++; fill[k] = 0; }
    }
  }
}

const sum = (a) => a.reduce((s, v) => s + v, 0);

// Greedy player with full information; returns the peak belt load it needed.
export function solvePeak(board, cols) {
  const b = board.clone(), pool = new Array(NCOLORS).fill(0);
  const ptr = new Array(cols.length).fill(0), fill = new Array(cols.length).fill(0);
  let peak = 0;
  for (let list = b.tappableList(); list.length; list = b.tappableList()) {
    let best = null, bestScore = Infinity;
    for (const i of list) {
      const pl = pool.slice(), pt = ptr.slice(), fl = fill.slice();
      pl[b.color[i]] += b.count[i];
      resolve(cols, pt, fl, pl);
      const score = sum(pl);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    pool[b.color[best]] += b.count[best];
    b.clearCell(best);
    resolve(cols, ptr, fill, pool);
    peak = Math.max(peak, sum(pool));
  }
  return sum(pool) === 0 ? peak : Infinity;
}

// Beam search over tap orders: a much tighter (still achievable) peak than one greedy run.
export function beamPeak(board, cols, width = 24) { return beamPlan(board, cols, width).peak; }

// Best tap order found by beam search, and the belt peak it needs.
export function beamPlan(board, cols, width = 24) {
  let beam = [{ b: board.clone(), pool: new Array(NCOLORS).fill(0), ptr: new Array(cols.length).fill(0), fill: new Array(cols.length).fill(0), peak: 0, seq: [] }];
  for (;;) {
    const next = [];
    for (const st of beam) {
      const list = st.b.tappableList();
      if (!list.length) return { peak: sum(st.pool) === 0 ? st.peak : Infinity, seq: st.seq }; // all states share the same depth
      for (const i of list) {
        const b = st.b.clone(), pool = st.pool.slice(), ptr = st.ptr.slice(), fill = st.fill.slice();
        pool[b.color[i]] += b.count[i];
        b.clearCell(i);
        resolve(cols, ptr, fill, pool);
        const load = sum(pool);
        next.push({ b, pool, ptr, fill, peak: Math.max(st.peak, load), load, seq: [...st.seq, i] });
      }
    }
    next.sort((a, b) => a.peak - b.peak || a.load - b.load);
    beam = next.slice(0, width);
  }
}

export function generateLevel(n) {
  const p = levelParams(n);
  for (let attempt = 0; attempt < 40; attempt++) {
    const R = makeRng(n * 7919 + attempt * 104729 + 17);
    const q = { ...p, noise: Math.max(0, p.noise - Math.floor(attempt / 4)) };
    const board = buildBoard(q, R);
    assignColors(board, q, R);
    const order = intendedOrder(board, R);
    if (order.length * TRAY !== board.blocksLeft() * PER_BLOCK) continue; // unreachable block: reject
    const cols = dealTrays(order, q, R);
    const peak = beamPeak(board, cols);
    // Normal levels also leave room for a player who doesn't plan ahead (greedy taps).
    const casual = p.tier === 'normal' ? Math.min(MAX_CAP, solvePeak(board, cols) + 5) : 0;
    const capacity = Math.max(MIN_CAP, peak + q.margin, casual);
    if (capacity <= MAX_CAP) return { n, tier: p.tier, board, cols, capacity, peak };
  }
  throw new Error('level generation failed for ' + n);
}

export { EMPTY, BLOCK, GEN };
