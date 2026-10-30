// Grid model shared by the level generator/solver and the live game.
export const VOID = 0, EMPTY = 1, BLOCK = 2, GEN = 3;
export const PER_BLOCK = 9;

export class Board {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    const n = W * H;
    this.type = new Uint8Array(n);
    this.color = new Int8Array(n).fill(-1);
    this.count = new Uint8Array(n);
    this.hidden = new Uint8Array(n);
    this.gens = []; // { at, out, queue: [color] }
  }

  clone() {
    const b = new Board(this.W, this.H);
    b.type.set(this.type);
    b.color.set(this.color);
    b.count.set(this.count);
    b.hidden.set(this.hidden);
    b.gens = this.gens.map((g) => ({ at: g.at, out: g.out, queue: g.queue.slice() }));
    return b;
  }

  idx(x, y) { return y * this.W + x; }

  neighbors(i) {
    const { W, H } = this, x = i % W, y = (i / W) | 0, out = [];
    if (x > 0) out.push(i - 1);
    if (x < W - 1) out.push(i + 1);
    if (y > 0) out.push(i - W);
    if (y < H - 1) out.push(i + W);
    return out;
  }

  isExitRow(i) { return ((i / this.W) | 0) === this.H - 1; }

  // Empty cells connected to the bottom exit; parent[] lets callers rebuild the exit path.
  computeReach() {
    const n = this.type.length, parent = new Int16Array(n).fill(-2), q = [];
    for (let x = 0; x < this.W; x++) {
      const i = this.idx(x, this.H - 1);
      if (this.type[i] === EMPTY) { parent[i] = -1; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      for (const j of this.neighbors(q[h])) {
        if (parent[j] === -2 && this.type[j] === EMPTY) { parent[j] = q[h]; q.push(j); }
      }
    }
    return parent;
  }

  // Returns the neighbouring reached cell a block exits through, -1 = straight out the bottom, null = blocked.
  exitVia(i, parent) {
    if (this.type[i] !== BLOCK) return null;
    if (this.isExitRow(i)) return -1;
    let best = null;
    for (const j of this.neighbors(i)) {
      if (parent[j] !== -2 && (best === null || j > best)) best = j; // prefer the cell below
    }
    return best;
  }

  // Cell sequence from a block to the exit row (excluding the block itself).
  exitPath(i, parent = this.computeReach()) {
    const via = this.exitVia(i, parent);
    if (via === null) return null;
    const path = [];
    for (let c = via; c >= 0; c = parent[c]) path.push(c);
    return path;
  }

  tappableList() {
    const parent = this.computeReach(), out = [];
    for (let i = 0; i < this.type.length; i++) {
      if (this.type[i] === BLOCK && this.exitVia(i, parent) !== null) out.push(i);
    }
    return out;
  }

  // Empties a cell, then lets generators refill. Returns spawned cell indexes.
  clearCell(i) {
    this.type[i] = EMPTY;
    this.color[i] = -1;
    this.count[i] = 0;
    this.hidden[i] = 0;
    return this.spawn();
  }

  spawn() {
    const spawned = [];
    for (const g of this.gens) {
      if (this.type[g.out] === EMPTY && g.queue.length) {
        this.type[g.out] = BLOCK;
        this.color[g.out] = g.queue.shift();
        this.count[g.out] = PER_BLOCK;
        this.hidden[g.out] = 0;
        spawned.push(g.out);
      }
    }
    return spawned;
  }

  // Hidden blocks flip face-up once they touch an empty cell or the exit.
  revealExposed() {
    const revealed = [];
    for (let i = 0; i < this.type.length; i++) {
      if (!this.hidden[i]) continue;
      if (this.isExitRow(i) || this.neighbors(i).some((j) => this.type[j] === EMPTY)) {
        this.hidden[i] = 0;
        revealed.push(i);
      }
    }
    return revealed;
  }

  blocksLeft() {
    let n = 0;
    for (let i = 0; i < this.type.length; i++) if (this.type[i] === BLOCK) n++;
    for (const g of this.gens) n += g.queue.length;
    return n;
  }
}
