// Emulates the live pump loop (default continuous mode) with the real engine.
// Real seconds = game frames/60 + blocking search time (game keeps ticking while bot thinks).
import { Game } from './engine/game.js';
import { generateLevel } from './engine/levelgen.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';
const file = process.argv[2];
const levels = (process.argv[3] || '1,3,5,8,10,12,15,20,25,30,40,50,64,75,100').split(',').map(Number);
await import(new URL(file, import.meta.url).href);
const bot = globalThis.MarbleSortBot;
const rows = [];
const seeds = (process.argv[4] || '77').split(',').map(Number);
if (process.argv[5]) for (const f of process.argv[5].split(',')) globalThis[f] = true;
for (const seed of seeds) for (const n of levels) for (const dim of [[390, 844], [1440, 900]]) {
  Math.random = makeRng(seed + n + dim[0]).next;
  const g = new Game(generateLevel(n), () => {});
  g.setLayout(computeLayout(...dim, 160, 10, g.board.W, g.board.H, g.cap)); g.speed = 3;
  let frames = 0, searchMs = 0, peak = 0, plan = null, searches = 0, waitFrames = 0;
  const tick = k => { for (let i = 0; i < k; i++) { g.update(1/60); frames++; peak = Math.max(peak, g.beltCount()); } };
  while (g.state === 'play' && frames < 60*600) {
    if (bot.step0) { // new bot exposes its own decision function
      const t = performance.now();
      const r = await bot.step0(g, { peak });
      const ms = performance.now() - t; searchMs += ms; if (r === 'searched') searches++;
      tick(Math.max(1, Math.ceil(ms / 1000 * 60)));
      continue;
    }
    if (plan?.seq.length && bot.releaseDecision) {
      const i = plan.seq[0], d = bot.releaseDecision(g, i, plan.bound, peak);
      if (d === 'tap') { g.tap(plan.seq.shift()); plan.fresh = false; }
      else if (d === 'settled') {
        const t0 = performance.now();
        const ok = !plan.perfect && await bot.settledRelease(g, i, plan.bound, peak, plan.fresh);
        searchMs += performance.now() - t0;
        if (ok) { g.tap(plan.seq.shift()); plan.fresh = false; }
        else plan = null;
      }
      tick(3); continue;
    }
    if (plan?.seq.length) {
      const i = plan.seq[0];
      const ok = plan.perfect ? bot.canPerfectRelease(g, i, peak) : bot.canRelease(g, i, plan.pipeline);
      if (ok) { g.tap(plan.seq.shift()); }
      else if (bot.settled(g)) plan = null;
      tick(3); continue;
    }
    if (!bot.settled(g) || !g.board.blocksLeft()) { tick(3); continue; }
    const t = performance.now();
    const c = await bot.chooseContinuous(g, { peak });
    const ms = performance.now() - t; searchMs += ms; searches++;
    tick(Math.ceil(ms / 1000 * 60) + 1);
    if (!c) { tick(300); continue; }
    plan = { seq: [...c.plan.seq], perfect: c.perfectPlan, pipeline: c.executionFast, bound: bot.planBound ? bot.planBound(g, c, !!globalThis.__msTurbo) : 0, fresh: true };
  }
  const stars = g.state !== 'won' ? 0 : peak / g.cap <= 0.6 ? 3 : peak / g.cap <= 0.85 ? 2 : 1;
  rows.push({ n, dim: dim[0], state: g.state, stars, sec: +(frames/60).toFixed(1), searchSec: +(searchMs/1000).toFixed(2), searches });
  console.log(JSON.stringify(rows.at(-1)));
}
const tot = k => rows.reduce((s, r) => s + r[k], 0);
console.log(JSON.stringify({ file, wins: rows.filter(r => r.state === 'won').length, of: rows.length,
  stars3: rows.filter(r => r.stars === 3).length, starsTotal: tot('stars'),
  totalSec: +tot('sec').toFixed(1), searchSec: +tot('searchSec').toFixed(1) }));
