// Regression: level 1100 has model-valid plans whose real tray routing diverges.
// Run the unchanged engine; never change capacity, marbles, trays, or score.
import assert from 'node:assert/strict';
import './marble-sort-bot.user.js';
import { Game } from './engine/game.js';
import { generateLevel } from './engine/levelgen.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';

const bot = globalThis.MarbleSortBot;
const level = generateLevel(1100);
const makeGame = (width, height, speed) => {
  const g = new Game(level, () => {});
  g.setLayout(computeLayout(width, height, 160, 10, g.board.W, g.board.H, g.cap));
  g.speed = speed;
  return g;
};

// Same board with different trays or capacity must not hit a stale beam cache.
const small = bot.levelModel(generateLevel(1));
assert((await bot.beam(small)).plans.length);
const narrow = await bot.beam({ ...small, cap: 1 });
assert(narrow.plans.length);
assert(narrow.plans.every(p => p.peak <= 1), 'Beam reused the old capacity');
const changedCols = small.cols.map(c => [...c]);
const first = changedCols.find(c => c.length);
first[0] = (first[0] + 1) % 10;
assert.equal((await bot.beam({ ...small, cols: changedCols })).plans.length, 0);

// Previously, every complete physical preview failed and choose returned null.
Math.random = makeRng(1567).next;
assert.equal(await bot.chooseContinuous(makeGame(1440, 900, 3), { repair: false }), null);
console.log('Reproduced the unrepairable 2.0.1 planning path.');

let wins = 0;
for (const [width, height] of [[390, 844], [1440, 900]]) {
  for (const speed of [3, 20]) {
    const g = makeGame(width, height, speed);
    Math.random = makeRng(77 + width + speed).next;
    const before = JSON.stringify(g);
    const choice = await bot.chooseContinuous(g);
    assert(choice, `No plan: ${width}px at ${speed}x`);
    assert.equal(JSON.stringify(g), before, 'Search mutated the live game');
    // Independently replay the chosen route with two fresh physics seeds.
    for (const seed of [77, 913]) {
      Math.random = makeRng(seed + width + speed).next;
      const live = makeGame(width, height, speed);
      let peak = 0;
      for (const i of choice.plan.seq) {
        assert(live.tap(i));
        let settled = false;
        for (let f = 0; f < 7200; f++) {
          live.update(1 / 60);
          peak = Math.max(peak, live.beltCount());
          assert.notEqual(live.state, 'lost', `Lost: ${width}px ${speed}x seed ${seed} move ${live.moves}`);
          if (bot.settled(live)) { settled = true; break; }
        }
        assert(settled, 'Physics did not settle');
      }
      for (let f = 0; f < 180; f++) live.update(1 / 60);
      assert.equal(live.state, 'won');
      assert.equal(live.moves, level.board.blocksLeft());
      wins++;
      console.log(JSON.stringify({ level: 1100, width, speed, seed, state: live.state, peak, cap: live.cap }));
    }
  }
}

// Strict three-star mode still refuses to silently lower its target.
assert.equal(await bot.chooseContinuous(makeGame(1440, 900, 3), { requirePerfect: true }), null);
await assert.rejects(bot.chooseContinuous(makeGame(1440, 900, 3), { alive: () => false }), /cancelled/);
console.log(JSON.stringify({ wins, total: 8, cacheIsolation: true, liveStateUnchanged: true, strictMode: true, cancellation: true }));
