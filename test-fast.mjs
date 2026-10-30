import assert from 'node:assert/strict';
import './marble-sort-bot.user.js';
import { Game } from './engine/game.js';
import { generateLevel } from './engine/levelgen.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';

const bot = globalThis.MarbleSortBot;
const levels = [1, 4, 5, 7, 10, 15, 20, 30, 40, 50, 64, 75, 100, 250, 1000];
const rows = [], started = performance.now();
let checkedConservation = 0;

for (const n of levels) {
  for (const dim of [[390, 844], [1440, 900]]) {
    const g = new Game(generateLevel(n), () => {});
    g.setLayout(computeLayout(...dim, 160, 10, g.board.W, g.board.H, g.cap));
    g.speed = 3;
    Math.random = makeRng(937 + n + dim[0]).next;
    const choice = await bot.choose(g, { fast: true });
    assert(choice, `No fast choice at ${n}`);

    // Compare animation schedules on the same plan. These are simulated wall
    // durations at 60 FPS, not a benchmark of the user's computer or network.
    const normal = bot.cloneGame(g); normal.speed = 1;
    const base = await bot.preview(normal, choice.plan.seq);
    const triple = await bot.preview(g, choice.plan.seq);

    for (const seed of [831 + n, 2093 + n]) {
      const actual = bot.cloneGame(g);
      let seq = [...choice.plan.seq], pipeline = choice.executionFast, replans = 0;
      Math.random = makeRng(seed).next;
      let peak = 0, frame = 0, overlapping = 0;
      for (; frame < 60000 && actual.state === 'play'; frame++) {
        if (frame % 3 === 0 && seq.length && bot.settled(actual)) {
          let safe = bot.canRelease(actual, seq[0], pipeline);
          if (safe && actual.load() + actual.board.count[seq[0]] > actual.cap - 1) {
            safe = (await bot.preview(actual, seq[0])).ok;
          }
          if (!safe) {
            assert(++replans <= 20, 'Repeated replanning without progress');
            const revised = await bot.choose(actual, { fast: true, peak });
            assert(revised, `No revised plan at ${n}`);
            seq = [...revised.plan.seq]; pipeline = revised.executionFast;
          }
        }
        if (frame % 3 === 0 && seq.length && bot.canRelease(actual, seq[0], pipeline)) {
          if (!bot.settled(actual)) {
            assert(actual.load() + actual.board.count[seq[0]] <= actual.cap - 1);
            overlapping++; checkedConservation++;
          }
          const index = seq.shift();
          assert(actual.tap(index), `Illegal fast tap at ${n}`);
        }
        actual.update(1 / 60);
        peak = Math.max(peak, actual.beltCount());
      }
      assert.equal(actual.state, 'won', `Fast run did not win: ${n} ${dim} seed ${seed}`);
      assert.equal(seq.length, 0);
      assert(actual.cols.every(col => !col.trays.length));
      assert.equal(actual.load(), 0);
      rows.push({ level: n, viewport: dim.join('x'), seed, cap: actual.cap, peak,
        simulatedSeconds: Number((frame / 60).toFixed(2)),
        sequential1xSeconds: base.ok ? Number(base.wallSeconds.toFixed(2)) : null,
        sequential3xSeconds: triple.ok ? Number(triple.wallSeconds.toFixed(2)) : null, overlapping,
        pipeline, replans });
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
}

const comparable = rows.filter(r => r.sequential1xSeconds !== null && r.sequential3xSeconds !== null);
const total = field => comparable.reduce((s, r) => s + r[field], 0);
const summary = { wins: rows.length, levels: levels.length, checkedOverlappingTaps: checkedConservation,
  comparableRuns: comparable.length,
  speedupVsSequential1x: Number((total('sequential1xSeconds') / total('simulatedSeconds')).toFixed(2)),
  speedupVsSequential3x: Number((total('sequential3xSeconds') / total('simulatedSeconds')).toFixed(2)),
  durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)) };
console.log(JSON.stringify({ summary }));
