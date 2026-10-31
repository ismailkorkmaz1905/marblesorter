import fs from 'node:fs';
import {Game} from './engine/game.js';
import {generateLevel} from './engine/levelgen.js';
import './marble-sort-bot.user.js';
const bot=globalThis.MarbleSortBot;
const data=JSON.parse(fs.readFileSync(new URL('./results/plans.json',import.meta.url),'utf8'));
data.sourceCommit='39b1fa6c7447890b670a56b58599ee393dd81b2a';
data.engineVersion='repository engine at sourceCommit';
fs.writeFileSync(new URL('./results/plans.json',import.meta.url),JSON.stringify(data,null,2));
const table={};
for(const r of data.levels) if(r.status==='validated') {
  const g=new Game(generateLevel(r.n),()=>{});
  table[r.n]={signature:bot.offlineSignature(g),seq:r.seq,stars:r.stars};
}
const header='// Offline candidates validated at 1440x900, 20x, two seeds. Live outcomes can differ.\n';
fs.writeFileSync(new URL('./offline-plans.js',import.meta.url),header+'globalThis.__msOfflinePlans = '+JSON.stringify(table)+';\n');
const source=fs.readFileSync(new URL('./marble-sort-bot.user.js',import.meta.url),'utf8');
const original=fs.readFileSync(new URL('./start.js',import.meta.url),'utf8');
const begin=original.indexOf('(() => {'),end=original.indexOf('\n})();',begin)+'\n})();'.length;
if(begin<0||end<begin)throw new Error('Bundle boundaries missing');
const bundle=original.slice(0,begin)+source.slice(source.indexOf('(() => {')).trimEnd()+original.slice(end);
fs.writeFileSync(new URL('./start.js',import.meta.url),bundle);
fs.writeFileSync(new URL('./start-precomputed.js',import.meta.url),fs.readFileSync(new URL('./offline-plans.js',import.meta.url),'utf8')+bundle);
console.log(JSON.stringify({packaged:Object.keys(table).length,range:data.range}));
