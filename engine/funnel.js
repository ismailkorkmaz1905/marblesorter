// Plain 2D physics for the funnel: gravity, marble/marble and marble/wall contacts, nothing else.
// The funnel is a symmetric curve into a single-file tube; the gate at the bottom opens only
// when the belt has a free slot passing by.

const GRAVITY = 1700;   // px/s²
const MAX_H = 1 / 300;  // max substep (s): keeps fast marbles from tunnelling through walls
const ITERATIONS = 3;
const BOUNCE = 0.05;    // marbles barely bounce, like heavy glass
const DRAG = 0.6;       // gentle rolling resistance (1/s)
const MAX_V = 800;

export const FUNNEL = { neck: 1.9, entry: 1.0 };  // neck half-width (marble radii), entry slope

// Symmetric funnel: a cubic curve from the board's bottom corners into a vertical tube.
export function buildFunnel(L, opt = FUNNEL) {
  const r = L.br, top = L.frameBottom - 2, gateY = L.neckY;
  const topHalf = L.boardW / 2, neckHalf = r * opt.neck;
  const tubeTop = gateY - r * 3.4, h = tubeTop - top;
  const side = (sgn) => {
    const P0 = { x: topHalf, y: top }, P3 = { x: neckHalf, y: tubeTop };
    const P1 = { x: topHalf - (h * 0.35) / opt.entry, y: top + h * 0.35 }; // leaves the corner sloping down
    const P2 = { x: neckHalf, y: tubeTop - h * 0.45 };                     // arrives vertical
    const pts = [{ x: L.cx + sgn * topHalf, y: top - L.boardH }];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, u = 1 - t;
      const x = u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x;
      const y = u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y;
      pts.push({ x: L.cx + sgn * x, y });
    }
    pts.push({ x: L.cx + sgn * neckHalf, y: gateY + 2 });
    return pts;
  };
  const left = side(-1), right = side(1), segs = [];
  for (const pts of [left, right]) {
    for (let k = 0; k < pts.length - 1; k++) segs.push({ a: pts[k], b: pts[k + 1] });
  }
  return { left, right, segs, gateY, neckHalf, top, tubeTop, cx: L.cx };
}

// Real marbles are never identical: each gets a size within 94-100% of nominal (invisible),
// which is what keeps a symmetric pair from wedging over the neck on a knife-edge.
const size = (b, r) => (b.rad ??= r * (0.94 + Math.random() * 0.06));

export function stepFunnel(balls, F, r, dt) {
  for (const b of balls) {
    size(b, r);
    if (b.squeeze > 0) b.squeeze -= dt;
  }
  settleJam(balls, F, r, dt);
  const steps = Math.ceil(dt / MAX_H), h = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (const b of balls) {
      b.vy += GRAVITY * h;
      b.vx *= 1 - DRAG * h; b.vy *= 1 - DRAG * h;
      const v = Math.hypot(b.vx, b.vy);
      if (v > MAX_V) { b.vx *= MAX_V / v; b.vy *= MAX_V / v; }
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      collideBalls(balls);
      for (const b of balls) { collideWalls(b, F, eff(b)); contain(b, F, eff(b)); gateFloor(b, F, b.rad); }
    }
  }
}

// Effective contact radius: slightly compressible while a jam settles.
const eff = (b) => (b.squeeze > 0 ? b.rad * 0.85 : b.rad);

// Granular jam: marbles at rest above the neck with none entering it. The wedged marbles
// compress a touch for a moment and gravity alone lets the pile settle through. No forces added.
function settleJam(balls, F, r, dt) {
  const low = balls.reduce((a, b) => (!a || b.y > a.y ? b : a), null);
  const neck = balls.some((b) => b.y > F.tubeTop - r && Math.abs(b.x - F.cx) <= F.neckHalf + r);
  if (!low || neck || low.squeeze > 0) { F.watch = null; return; }
  if (!F.watch || low.y > F.watch.y + r * 0.25) { F.watch = { y: low.y, t: 0 }; return; }
  F.watch.t += dt;
  if (F.watch.t < 0.35) return;
  F.watch = null;
  F.jams = (F.jams || 0) + 1;
  for (const b of balls) if (Math.hypot(b.x - low.x, b.y - low.y) < r * 5) b.squeeze = 0.3;
}

function collideBalls(balls) {
  for (let i = 0; i < balls.length; i++) {
    const p = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const q = balls[j], rr = eff(p) + eff(q);
      const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
      p.x -= nx * push; p.y -= ny * push;
      q.x += nx * push; q.y += ny * push;
      const vrel = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (vrel < 0) {
        const imp = (-(1 + BOUNCE) * vrel) / 2;
        p.vx -= imp * nx; p.vy -= imp * ny;
        q.vx += imp * nx; q.vy += imp * ny;
      }
    }
  }
}

export function collideWalls(b, F, r) {
  for (const { a, b: e } of F.segs) {
    const ex = e.x - a.x, ey = e.y - a.y, len2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((b.x - a.x) * ex + (b.y - a.y) * ey) / len2));
    const px = a.x + ex * t, py = a.y + ey * t;
    const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = px + nx * r; b.y = py + ny * r;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + BOUNCE) * vn * nx; b.vy -= (1 + BOUNCE) * vn * ny; }
  }
}

// x of a wall polyline at height y (walls are monotonic in y).
function wallX(pts, y) {
  if (y <= pts[0].y) return pts[0].x;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], e = pts[k + 1];
    if (y <= e.y) return a.x + (e.x - a.x) * ((y - a.y) / Math.max(1e-6, e.y - a.y));
  }
  return pts[pts.length - 1].x;
}

// Hard guarantee: a marble is never outside the funnel walls, whatever the frame rate.
export function contain(b, F, r) {
  if (b.y < F.left[0].y) return;
  const lo = wallX(F.left, b.y) + r * 0.98, hi = wallX(F.right, b.y) - r * 0.98;
  if (lo > hi) { b.x = (lo + hi) / 2; return; }
  if (b.x > hi) { b.x = hi; if (b.vx > 0) b.vx = 0; }
  if (b.x < lo) { b.x = lo; if (b.vx < 0) b.vx = 0; }
}

function gateFloor(b, F, r) {
  if (b.y > F.gateY - r) { b.y = F.gateY - r; if (b.vy > 0) b.vy = 0; }
}

// The marble sitting in the neck, ready to drop onto the belt (or -1).
export function atGate(balls, F, r) {
  let best = -1;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.y >= F.gateY - r * 1.6 && Math.abs(b.x - F.cx) <= F.neckHalf && (best < 0 || b.y > balls[best].y)) best = i;
  }
  return best;
}
