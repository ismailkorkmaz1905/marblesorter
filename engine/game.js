// Live game simulation: taps, falling marbles, conveyor belt, trays, boosters, win/lose.
import { BLOCK, EMPTY, PER_BLOCK } from './board.js';
import { TRAY } from './levelgen.js';
import { beltPoint, cellCenter, cellRect, holePos, trayY } from './layout.js';
import { buildFunnel, stepFunnel, atGate } from './funnel.js';

const BELT_SPEED = 260;   // px/s
const FALL_SPEED = 720;   // px/s
const DROP_TIME = 0.22;   // s, belt -> tray hole
const POP_TIME = 0.38;    // s, full tray celebration
const STUCK_GRACE = 0.5;  // s of confirmed deadlock before losing

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - (1 - t) * (1 - t);

// true if a point at s0 moving forward by d passes q on a loop of length P
function crossed(s0, d, q, P) {
  const x = (((q - s0) % P) + P) % P;
  return x > 0 && x <= d;
}

export class Game {
  constructor(level, emit) {
    this.level = level;
    this.emit = emit;
    this.board = level.board.clone();
    this.cap = level.capacity;
    this.cols = level.cols.map((arr) => ({ trays: arr.map((c) => ({ c, filled: 0, res: 0, sent: 0, pop: -1 })), shift: 0 }));
    this.slots = new Array(this.cap).fill(null);
    this.off = 0;
    this.pending = [];  // marbles in the funnel (physics bodies)
    this.falling = [];  // marbles travelling from a block to the funnel
    this.toTray = [];   // marbles dropping into a tray hole
    this.fx = [];       // particles
    this.cellFx = new Map();
    this.state = 'play';
    this.time = 0;
    this.stuck = 0;
    this.endTimer = 0;
    this.moves = 0;
    this.trail = [];    // taps (i) and magnet pulls (-(i+1)): the server replays these on a win
    this.speed = 1;     // test speed multiplier (1-3)
    this.L = null;
  }

  setLayout(L) { this.L = L; this.F = buildFunnel(L); }

  // ---------- queries ----------
  // Only the front tray takes marbles; the next one opens once the front has cleared.
  activeTray(k) {
    const t = this.cols[k].trays[0];
    return t && t.pop < 0 && t.res < TRAY ? t : null;
  }

  // Rightmost column first: that is the order the belt's bottom lane passes them.
  matchCol(color) {
    for (let k = this.cols.length - 1; k >= 0; k--) {
      const t = this.activeTray(k);
      if (t && t.c === color) return k;
    }
    return -1;
  }

  beltCount() { let n = 0; for (const b of this.slots) if (b) n++; return n; }

  load() { return this.beltCount() + this.pending.length + this.falling.length; }

  tappable(i) { return this.board.exitPath(i) !== null; }

  // ---------- input ----------
  tap(i) {
    if (this.state !== 'play' || i < 0 || this.board.type[i] !== BLOCK) return false;
    const path = this.board.exitPath(i);
    if (!path) {
      this.cellFx.set(i, { kind: 'shake', t: 0 });
      this.emit('blocked');
      return false;
    }
    const L = this.L, color = this.board.color[i], count = this.board.count[i];
    const pts = this.exitPoints(i, path);
    const dots = dotPositions(L, i, count);
    dots.forEach((d, k) => {
      const ball = { c: color, x: d.x, y: d.y };
      this.falling.push({ b: ball, pts: [d, ...pts], seg: 0, delay: k * 0.03, v: FALL_SPEED * (0.9 + Math.random() * 0.2) });
    });
    this.cellFx.set(i, { kind: 'pop', t: 0, color, count });
    this.removeBlock(i);
    this.moves++;
    this.trail.push(i);
    this.emit('tap', { color });
    return true;
  }

  exitPoints(i, path) {
    const L = this.L, pts = [];
    for (const j of path) pts.push(cellCenter(L, j));
    const last = path.length ? path[path.length - 1] : i;
    const c = cellCenter(L, last);
    pts.push({ x: c.x, y: L.boardY + L.boardH - L.br }); // then physics takes over in the funnel
    return pts;
  }

  removeBlock(i) {
    const spawned = this.board.clearCell(i);
    for (const j of spawned) {
      const g = this.board.gens.find((q) => q.out === j);
      this.cellFx.set(j, { kind: 'spawn', t: 0, from: g ? g.at : j });
    }
    for (const j of this.board.revealExposed()) this.cellFx.set(j, { kind: 'reveal', t: 0 });
  }

  // ---------- simulation ----------
  // Once every box is released the player can only watch, so the run-out plays at 2x.
  update(dt) {
    if (!this.L) return;
    dt = Math.min(dt, 1 / 20);
    this.fast = this.state === 'play' && !this.board.blocksLeft();
    for (let n = (this.fast ? 2 : 1) * this.speed; n > 0; n--) this.step(dt);
  }

  step(dt) {
    this.time += dt;
    this.updateFalling(dt);
    this.updatePile(dt);
    this.updateBelt(dt);
    this.updateDrops(dt);
    this.updateTrays(dt);
    this.updateFx(dt);
    this.checkEnd(dt);
  }

  updateFalling(dt) {
    for (let n = this.falling.length - 1; n >= 0; n--) {
      const f = this.falling[n];
      if (f.delay > 0) { f.delay -= dt; continue; }
      let move = f.v * dt;
      f.v += 900 * dt;
      while (move > 0 && f.seg < f.pts.length - 1) {
        const a = f.b, b = f.pts[f.seg + 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d <= move) { a.x = b.x; a.y = b.y; f.seg++; move -= d; }
        else { a.x += (dx / d) * move; a.y += (dy / d) * move; move = 0; }
      }
      if (f.seg >= f.pts.length - 1) {
        this.falling.splice(n, 1);
        f.b.vx = (Math.random() - 0.5) * 120;
        f.b.vy = f.v * 0.5;
        this.pending.push(f.b);
      }
    }
  }

  updatePile(dt) {
    stepFunnel(this.pending, this.F, this.L.br, dt);
  }

  updateBelt(dt) {
    const L = this.L, P = L.P, sp = P / this.cap, d = BELT_SPEED * dt;
    const prev = this.off;
    this.off = (this.off + d) % P;
    for (let i = 0; i < this.cap; i++) {
      const s0 = i * sp + prev;
      let b = this.slots[i];
      const g = !b && this.pending.length && crossed(s0, d, 0, P) ? atGate(this.pending, this.F, L.br) : -1;
      if (g >= 0) {
        b = this.pending.splice(g, 1)[0];
        b.enter = { x: b.x, y: b.y, t: 0 };
        this.slots[i] = b;
        this.claim(b);
      }
      if (!b) continue;
      if (b.enter) {
        b.enter.t += dt / 0.14;
        if (b.enter.t >= 1) b.enter = null;
      }
      if (!b.target) this.claim(b);
      if (b.target && crossed(s0, d, L.dropS[b.target.k], P)) {
        this.slots[i] = null;
        this.launch(b);
      }
    }
    // marble positions follow their slot
    for (let i = 0; i < this.cap; i++) {
      const b = this.slots[i];
      if (!b) continue;
      const p = beltPoint(L, i * sp + this.off);
      if (b.enter) {
        const t = ease(b.enter.t);
        b.x = lerp(b.enter.x, p.x, t);
        b.y = lerp(b.enter.y, p.y, t);
      } else { b.x = p.x; b.y = p.y; }
    }
  }

  // A marble claims its tray hole the moment it is on the belt (or a tray opens up for it),
  // then rides to that column. Same bookkeeping as the level solver, so plans stay valid.
  claim(b) {
    const k = this.matchCol(b.c);
    if (k < 0) return;
    const t = this.activeTray(k);
    t.res++;
    b.target = { k, t };
  }

  release(b) {
    if (b.target) { b.target.t.res--; b.target = null; }
  }

  launch(b) {
    const { k, t } = b.target;
    b.target = null;
    b.enter = null;
    this.toTray.push({ b, k, tray: t, hole: t.sent++, sx: b.x, sy: b.y, t: 0 });
  }

  sendToTray(b, k, tray) {
    tray.res++;
    b.target = { k, t: tray };
    this.launch(b);
  }

  updateDrops(dt) {
    for (let n = this.toTray.length - 1; n >= 0; n--) {
      const f = this.toTray[n];
      f.t += dt / DROP_TIME;
      const col = this.cols[f.k], idx = col.trays.indexOf(f.tray);
      const h = holePos(this.L, f.k, idx, col.shift, f.hole);
      const t = Math.min(1, f.t);
      f.b.x = lerp(f.sx, h.x, t);
      f.b.y = lerp(f.sy, h.y, t) - Math.sin(Math.PI * t) * this.L.br * 1.6;
      if (f.t >= 1) {
        this.toTray.splice(n, 1);
        f.tray.filled++;
        this.emit('click', { n: f.tray.filled });
        if (f.tray.filled === TRAY) {
          f.tray.pop = 0;
          this.emit('trayDone', { color: f.tray.c });
          this.burst(this.L.colX[f.k], trayY(this.L, idx, col.shift) + this.L.trayH / 2, f.tray.c);
        }
      }
    }
  }

  updateTrays(dt) {
    const step = this.L.trayH + this.L.trayGap;
    for (const col of this.cols) {
      const t = col.trays[0];
      if (t && t.pop >= 0) {
        t.pop += dt;
        if (t.pop >= POP_TIME) { col.trays.shift(); col.shift += step; }
      }
      if (col.flash > 0) col.flash -= dt;
      col.shift *= Math.exp(-dt * 14);
      if (col.shift < 0.3) col.shift = 0;
    }
    for (const [i, fx] of this.cellFx) {
      fx.t += dt;
      if (fx.t > 0.45) this.cellFx.delete(i);
    }
  }

  burst(x, y, color) {
    for (let n = 0; n < 14; n++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 180;
      this.fx.push({ kind: n % 3 ? 'spark' : 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, t: 0, life: 0.6 + Math.random() * 0.3, c: color });
    }
  }

  updateFx(dt) {
    for (let n = this.fx.length - 1; n >= 0; n--) {
      const p = this.fx[n];
      p.t += dt;
      p.vy += (p.g ?? 520) * dt;
      if (p.rot !== undefined) p.rot += dt * 6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t >= p.life) this.fx.splice(n, 1);
    }
  }

  checkEnd(dt) {
    if (this.state !== 'play') return;
    const busy = this.toTray.length || this.cols.some((c) => c.trays[0] && c.trays[0].pop >= 0);
    if (!busy && !this.falling.length && !this.pending.length && !this.beltCount() && !this.board.blocksLeft()) {
      this.endTimer += dt;
      if (this.endTimer > 0.35) { this.state = 'won'; this.emit('won'); }
      return;
    }
    if (this.isDeadlocked()) {
      this.stuck += dt;
      if (this.stuck > STUCK_GRACE) { this.state = 'lost'; this.emit('lost'); }
    } else this.stuck = 0;
  }

  // Marbles only reach trays by riding the belt. Full belt + nothing on it fits + marbles still
  // waiting in the funnel = nothing can ever move again.
  isDeadlocked() {
    if (this.toTray.length || this.beltCount() < this.cap) return false;
    if (this.cols.some((c) => c.trays[0] && (c.trays[0].pop >= 0 || c.trays[0].res > c.trays[0].filled))) return false;
    if (!this.pending.length && !this.falling.length) return false;
    return !this.slots.some((b) => b.target || this.matchCol(b.c) >= 0);
  }

  // ---------- boosters ----------
  // Magnet: fills every column's current tray, pulling marbles from the belt, funnel, then the board.
  magnet() {
    if (this.state !== 'play') return false;
    let moved = 0;
    for (let k = 0; k < this.cols.length; k++) {
      const t = this.activeTray(k);
      if (!t) continue;
      while (t.res < TRAY) {
        const b = this.takeMarble(t.c);
        if (!b) break;
        this.sendToTray(b, k, t);
        moved++;
      }
    }
    if (moved) this.emit('magnet');
    return moved > 0;
  }

  takeMarble(c) {
    const s = this.slots.findIndex((b) => b && b.c === c);
    if (s >= 0) { const b = this.slots[s]; this.slots[s] = null; this.release(b); return b; }
    const p = this.pending.findIndex((b) => b.c === c);
    if (p >= 0) return this.pending.splice(p, 1)[0];
    let best = -1;
    for (let i = 0; i < this.board.type.length; i++) {
      if (this.board.type[i] !== BLOCK || this.board.color[i] !== c) continue;
      if (best < 0 || this.board.count[i] < this.board.count[best] || (this.board.hidden[best] && !this.board.hidden[i])) best = i;
    }
    if (best < 0) return null;
    const ctr = cellCenter(this.L, best);
    this.board.hidden[best] = 0;
    this.trail.push(-best - 1);
    if (--this.board.count[best] === 0) {
      this.cellFx.set(best, { kind: 'pop', t: 0, color: c, count: 1 });
      this.removeBlock(best);
    }
    return { c, x: ctr.x, y: ctr.y };
  }

  // Shuffle: keeps in-progress trays, then puts trays that match marbles already waiting up front.
  shuffle(rand = Math.random) {
    if (this.state !== 'play') return false;
    const keep = this.cols.map((col) => col.trays.filter((t) => t.res > 0 || t.pop >= 0));
    const rest = this.cols.flatMap((col) => col.trays.filter((t) => t.res === 0 && t.pop < 0));
    if (!rest.length) return false;
    const waiting = new Map();
    const note = (c) => waiting.set(c, (waiting.get(c) || 0) + 1);
    this.slots.forEach((b) => b && note(b.c));
    this.pending.forEach((b) => note(b.c));
    this.falling.forEach((f) => note(f.b.c));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const front = [];
    for (const [c, n] of [...waiting].sort((a, b) => b[1] - a[1])) {
      let need = Math.ceil(n / TRAY);
      for (let i = 0; i < rest.length && need > 0; i++) {
        if (rest[i] && rest[i].c === c) { front.push(rest[i]); rest[i] = null; need--; }
      }
    }
    const order = [...front, ...rest.filter(Boolean)];
    for (const t of order) {
      let m = 0;
      for (let k = 1; k < keep.length; k++) if (keep[k].length < keep[m].length) m = k;
      keep[m].push(t);
    }
    this.cols.forEach((col, k) => { col.trays = keep[k]; col.flash = 0.5; });
    this.emit('shuffle');
    return true;
  }

  // Vacuum: lifts every marble off the belt/funnel and pre-fills the deepest matching trays,
  // so the marble count always still adds up.
  vacuum() {
    const balls = [...this.slots.filter(Boolean), ...this.pending];
    if (!balls.length) return false;
    balls.forEach((b) => this.release(b));
    this.slots.fill(null);
    this.pending = [];
    for (const b of balls) {
      let target = null, tk = -1;
      this.cols.forEach((col, k) => {
        col.trays.forEach((t, idx) => {
          if (t.c === b.c && t.res < TRAY && idx > 0 && (!target || idx > target.idx)) { target = { t, idx }; tk = k; }
        });
      });
      if (!target) {
        const k = this.matchCol(b.c);
        if (k >= 0) { this.sendToTray(b, k, this.activeTray(k)); continue; }
        continue; // unreachable when counts are consistent
      }
      target.t.res++;
      target.t.sent++;
      target.t.filled++;
      this.fx.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: -260, t: 0, life: 0.5, c: b.c });
      if (target.t.filled === TRAY) {
        const col = this.cols[tk];
        col.trays.splice(col.trays.indexOf(target.t), 1);
      }
    }
    this.stuck = 0;
    this.emit('vacuum');
    return true;
  }

  revive() {
    this.vacuum();
    this.state = 'play';
    this.stuck = 0;
  }
}

export function dotPositions(L, i, count) {
  const r = cellRect(L, i), out = [];
  const g = r.s * 0.24;
  for (let n = 0; n < Math.min(count, PER_BLOCK); n++) {
    const gx = n % 3, gy = Math.floor(n / 3);
    out.push({ x: r.x + r.s / 2 + (gx - 1) * g, y: r.y + r.s / 2 + (gy - 1) * g });
  }
  return out;
}

export { EMPTY };
