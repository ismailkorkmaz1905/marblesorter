import assert from 'node:assert/strict';
import './marble-sort-bot.user.js';
import { Game } from './engine/game.js';
import { generateLevel } from './engine/levelgen.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';

const bot = globalThis.MarbleSortBot, rows = [], started = performance.now();
const levels = [1, 2, 3, 4, 5, 7, 10, 12, 13, 14, 15, 16, 18, 20, 25, 30];
for (const n of levels) {
  for (const dim of [[390, 844], [1440, 900]]) {
    const initial = new Game(generateLevel(n), () => {});
    initial.setLayout(computeLayout(...dim, 160, 10, initial.board.W, initial.board.H, initial.cap));
    initial.speed = 3;
    Math.random = makeRng(475 + n).next;
    const before = JSON.stringify({ b: initial.board, cols: initial.cols, trail: initial.trail });
    const choice = await bot.choose(initial, { perfect: true });
    assert.equal(JSON.stringify({ b: initial.board, cols: initial.cols, trail: initial.trail }), before);
    if (!choice) {
      assert.equal(initial.moves, 0);
      const row = { level: n, viewport: dim.join('x'), limit: bot.starLimit(initial),
        status: 'no_certified_plan', moves: 0 };
      rows.push(row); console.log(JSON.stringify(row)); continue;
    }
    assert(choice.plan.peak <= bot.starLimit(initial));
    for (const seed of [1175 + n, 8347 + n]) {
      const g = bot.cloneGame(initial);
      Math.random = makeRng(seed).next;
      let seq = [...choice.plan.seq], peak = 0, frame = 0, replans = 0, stopped = false;
      for (; frame < 40000 && g.state === 'play'; frame++) {
        if (frame % 3 === 0 && seq.length && bot.settled(g)) {
          if (!bot.canPerfectRelease(g, seq[0], peak)) {
            assert(++replans <= 10);
            const revised = await bot.choose(g, { perfect: true, peak });
            if (!revised) { stopped = true; break; }
            seq = [...revised.plan.seq];
          }
          assert(bot.canPerfectRelease(g, seq[0], peak));
          assert(g.tap(seq.shift()));
        }
        g.update(1 / 60);
        peak = Math.max(peak, g.beltCount());
        assert(peak <= bot.starLimit(g), `Star limit violated at ${n}`);
        assert.notEqual(g.state, 'lost');
      }
      assert(stopped || g.state === 'won', `Timed out at ${n}`);
      const row = { level: n, viewport: dim.join('x'), seed, cap: g.cap, limit: bot.starLimit(g), peak,
        status: stopped ? 'stopped_to_preserve_stars' : 'won_three_stars',
        simulatedSeconds: Number((frame / 60).toFixed(2)), moves: g.moves, replans };
      rows.push(row); console.log(JSON.stringify(row));
    }
  }
}

// A high historical peak cannot be silently erased to manufacture three stars.
{
  const g = new Game(generateLevel(12), () => {});
  g.setLayout(computeLayout(390, 844, 160, 10, g.board.W, g.board.H, g.cap));
  assert.equal(await bot.choose(g, { perfect: true, peak: bot.starLimit(g) + 1 }), null);
  assert.equal(g.moves, 0);
}

const summary = { threeStarWins: rows.filter(r => r.status === 'won_three_stars').length,
  noCertifiedPlan: rows.filter(r => r.status === 'no_certified_plan').length,
  stoppedToPreserveStars: rows.filter(r => r.status === 'stopped_to_preserve_stars').length,
  lowerStarCompletions: 0, levels: levels.length,
  durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)) };
console.log(JSON.stringify({ summary }));
