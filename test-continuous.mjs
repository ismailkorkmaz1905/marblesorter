import assert from 'node:assert/strict';
import './marble-sort-bot.user.js';
import { Game } from './engine/game.js';
import { generateLevel } from './engine/levelgen.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';

const bot = globalThis.MarbleSortBot, rows = [], started = performance.now();
for (const n of [5, 10, 12, 13, 15, 20, 30, 50, 64]) {
  for (const dim of [[390, 844], [1440, 900]]) {
    Math.random = makeRng(913 + n + dim[0]).next;
    const g = new Game(generateLevel(n), () => {});
    g.setLayout(computeLayout(...dim, 160, 10, g.board.W, g.board.H, g.cap)); g.speed = 3;
    const before = JSON.stringify({ b: g.board, cols: g.cols, trail: g.trail });
    const choice = await bot.chooseContinuous(g);
    assert(choice, `No continuous plan at ${n}`);
    assert.equal(JSON.stringify({ b: g.board, cols: g.cols, trail: g.trail }), before);
    assert.equal(g.level.n, n);
    let peak = 0;
    for (const i of choice.plan.seq) {
      if (choice.perfectPlan) assert(bot.canPerfectRelease(g, i, peak));
      assert(g.tap(i));
      let idle = false;
      for (let frame = 0; frame < 7200; frame++) {
        g.update(1 / 60); peak = Math.max(peak, g.beltCount());
        assert.notEqual(g.state, 'lost');
        if (choice.perfectPlan) assert(peak <= bot.starLimit(g));
        if (bot.settled(g)) { idle = true; break; }
      }
      assert(idle);
    }
    for (let f = 0; f < 180; f++) g.update(1 / 60);
    assert.equal(g.state, 'won');
    const row = { level: n, viewport: dim.join('x'), preferredThreeStarPlan: choice.perfectPlan,
      cap: g.cap, peak, stars: peak / g.cap <= 0.6 ? 3 : peak / g.cap <= 0.85 ? 2 : 1 };
    rows.push(row); console.log(JSON.stringify(row));
  }
}

// Strict mode remains optional. It must not silently downgrade the user's goal.
{
  const g = new Game(generateLevel(5), () => {});
  g.setLayout(computeLayout(390, 844, 160, 10, g.board.W, g.board.H, g.cap));
  assert.equal(await bot.chooseContinuous(g, { requirePerfect: true }), null);
  assert.equal(g.moves, 0);
}

console.log(JSON.stringify({ summary: { wins: rows.length,
  preferredThreeStarWins: rows.filter(r => r.preferredThreeStarPlan).length,
  fallbackWins: rows.filter(r => !r.preferredThreeStarPlan).length,
  durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)) } }));
