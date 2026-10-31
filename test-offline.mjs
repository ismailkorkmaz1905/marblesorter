import assert from 'node:assert/strict';
import {Game} from './engine/game.js';
import {generateLevel} from './engine/levelgen.js';
import {computeLayout} from './engine/layout.js';
import {makeRng} from './engine/rng.js';
import './marble-sort-bot.user.js';
import './offline-plans.js';
const bot=globalThis.MarbleSortBot;
let passed=0;
for(const n of [1101,1105])for(const speed of [3,20])for(const width of [390,1440]) {
  Math.random=makeRng(n+5521).next;
  const g=new Game(generateLevel(n),()=>{});
  g.setLayout(computeLayout(width,width===390?844:900,160,10,g.board.W,g.board.H,g.cap));g.speed=speed;
  const choice=await bot.chooseContinuous(g,{width:64});
  assert.ok(choice,'A solution must exist for the integration fixtures');
  const check=await bot.preview(g,choice.plan.seq);
  assert.ok(check.ok,'Returned plan must complete a fresh physical replay');
  const signature=bot.offlineSignature(g);
  g.cap++;assert.notEqual(bot.offlineSignature(g),signature);g.cap--;
  g.cols[0].trays[0].c=(g.cols[0].trays[0].c+1)%10;
  assert.notEqual(bot.offlineSignature(g),signature);
  console.log(JSON.stringify({n,speed,width,offline:!!choice.offline,peak:check.peak}));passed++;
}
{
  const n=1101,g=new Game(generateLevel(n),()=>{});
  g.setLayout(computeLayout(1440,900,160,10,g.board.W,g.board.H,g.cap));g.speed=20;
  const entry=globalThis.__msOfflinePlans[n];
  globalThis.__msOfflinePlans[n]={...entry,seq:[9999]};
  const choice=await bot.chooseContinuous(g,{width:64});
  assert.ok(!choice?.offline,'Invalid sequence must fall back to the normal solver');passed++;
  globalThis.__msOfflinePlans[n]={...entry,signature:'wrong-board'};
  const mismatch=await bot.chooseContinuous(g,{width:64});
  assert.ok(!mismatch?.offline,'Different level data must reject the cached sequence');passed++;
  globalThis.__msOfflinePlans[n]=entry;
}
console.log(JSON.stringify({passed}));
