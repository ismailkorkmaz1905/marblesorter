import assert from 'node:assert/strict';
import './marble-sort-bot.user.js';
import { generateLevel } from './engine/levelgen.js';
import { Game } from './engine/game.js';
import { computeLayout } from './engine/layout.js';
import { makeRng } from './engine/rng.js';

const bot = globalThis.MarbleSortBot;
const fixtures = [1, 2, 3, 4, 5, 7, 10, 14, 15, 20, 25, 30, 40, 50, 75, 100];
const dimensions = [[390, 844], [1440, 900]];
const rows = [];
const started = performance.now();

function makeGame(level, dimensions, seed, flip = false) {
  Math.random = makeRng(seed).next;
  const g = new Game(generateLevel(level), () => {});
  g.setLayout(computeLayout(...dimensions, 160, 10, g.board.W, g.board.H, g.cap, flip));
  return g;
}

function settle(g, stats) {
  for (let n = 0; n < 18000; n++) {
    g.update(1 / 60);
    stats.peak = Math.max(stats.peak, g.beltCount());
    if (g.state === 'lost') throw new Error(`Lost at level ${g.level.n}, move ${g.moves}`);
    if (bot.settled(g)) return;
  }
  throw new Error(`Settle timed out at level ${g.level.n}, move ${g.moves}`);
}

// End-to-end schedules run through the original, unmodified physics engine.
for (const n of fixtures) {
  for (const dim of dimensions) {
    const g = makeGame(n, dim, 101 + n + dim[0]);
    const model = bot.snapshot(g);
    const result = await bot.beam(model);
    assert(result.plans.length, `No plan for level ${n}`);
    const plan = (await bot.improve(model, result.plans[0])).plan;
    const stats = { peak: 0 };
    const original = JSON.stringify(g.board);
    const clone = bot.cloneGame(g);
    assert(clone.tap(plan.seq[0]));
    settle(clone, { peak: 0 });
    assert.equal(JSON.stringify(g.board), original, 'Preview mutated the live board');
    for (const i of plan.seq) {
      assert(g.tap(i), `Illegal tap ${i} at level ${n}`);
      settle(g, stats);
    }
    for (let f = 0; f < 180; f++) g.update(1 / 60);
    assert.equal(g.state, 'won', `Not won at level ${n}`);
    assert(g.cols.every(col => !col.trays.length));
    assert.equal(g.load(), 0);
    assert(stats.peak <= plan.peak, 'Conservative peak bound was violated');
    const stars = stats.peak / g.cap <= 0.6 ? 3 : stats.peak / g.cap <= 0.85 ? 2 : 1;
    const row = { level: n, viewport: dim.join('x'), cap: g.cap, peak: stats.peak, stars, moves: g.moves };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

// Exercise replanning from live, partially played games, including generators,
// nonzero historical peak and flipped layout.
for (const n of [1, 7, 10, 30]) {
  const g = makeGame(n, [430, 932], 3901 + n, true);
  const stats = { peak: 0 };
  while (g.board.blocksLeft()) {
    const before = JSON.stringify({ b: g.board, cols: g.cols, slots: g.slots, trail: g.trail });
    const choice = await bot.choose(g, { peak: stats.peak });
    assert(choice, `No live choice at level ${n}`);
    assert.equal(JSON.stringify({ b: g.board, cols: g.cols, slots: g.slots, trail: g.trail }), before);
    assert(g.tap(choice.index));
    settle(g, stats);
  }
  for (let f = 0; f < 180; f++) g.update(1 / 60);
  assert.equal(g.state, 'won');
  console.log(JSON.stringify({ liveReplan: n, cap: g.cap, peak: stats.peak, moves: g.moves }));
}

// The original magnet can leave boxes with fewer than nine marbles. Plan from
// that genuine engine state, instead of assuming each tap always releases nine.
{
  const g = makeGame(7, [390, 844], 226);
  assert(g.magnet());
  const stats = { peak: 0 };
  settle(g, stats);
  assert([...g.board.count].some(n => n > 0 && n < 9));
  const result = await bot.beam(bot.snapshot(g));
  assert(result.plans.length);
  for (const i of result.plans[0].seq) { assert(g.tap(i)); settle(g, stats); }
  for (let f = 0; f < 180; f++) g.update(1 / 60);
  assert.equal(g.state, 'won');
  console.log(JSON.stringify({ partialBoxGame: 7, cap: g.cap, peak: stats.peak, moves: g.moves }));
}

// Validate shared target references while a real marble is reserved for a tray.
{
  const g = makeGame(1, [390, 844], 222);
  g.tap(g.board.tappableList()[0]);
  let ball;
  for (let f = 0; f < 600 && !ball; f++) {
    g.update(1 / 60);
    ball = g.slots.find(b => b?.target);
  }
  assert(ball, 'Fixture must contain a reserved marble');
  const copy = bot.cloneGame(g);
  const other = copy.slots.find(b => b?.target);
  assert.notEqual(other.target.t, ball.target.t);
  assert.equal(other.target.t, copy.cols[other.target.k].trays[0]);
}

// A planner cancellation must not dispatch a tap.
{
  const g = makeGame(30, [390, 844], 223);
  await assert.rejects(bot.choose(g, { alive: () => false }), /cancelled/);
  assert.equal(g.moves, 0);
}

const summary = { schedules: rows.length, liveReplanGames: 4, partialBoxGames: 1, wins: rows.length + 5,
  threeStars: rows.filter(r => r.stars === 3).length,
  durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)) };
console.log(JSON.stringify({ summary }));
