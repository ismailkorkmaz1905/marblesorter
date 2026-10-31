import fs from 'node:fs';
import crypto from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {Game} from './engine/game.js';
import {generateLevel, beamPlan} from './engine/levelgen.js';
import {computeLayout} from './engine/layout.js';
import {makeRng} from './engine/rng.js';
import './marble-sort-bot.user.js';
const bot = globalThis.MarbleSortBot;
const dir = new URL('./results/', import.meta.url);
const fingerprint = level => crypto.createHash('sha256').update(JSON.stringify(level)).digest('hex');
function game(level, seed) {
  Math.random = makeRng(seed).next;
  const g = new Game(level, () => {});
  g.setLayout(computeLayout(1440,900,160,10,g.board.W,g.board.H,g.cap));
  g.speed = 20; return g;
}
function validate(level, seq, seed) {
  const g = game(level,seed); let peak=0, frames=0;
  for(const i of seq) {
    if(!g.tap(i)) return {ok:false,reason:'blocked'};
    let idle=false;
    for(let f=0;f<7200;f++) {
      g.update(1/60);frames++;peak=Math.max(peak,g.beltCount());
      if(g.state==='lost') return {ok:false,reason:'lost'};
      if(bot.settled(g)){idle=true;break;}
    }
    if(!idle)return {ok:false,reason:'timeout'};
  }
  for(let f=0;f<1200&&g.state==='play';f++)g.update(1/60);
  return {ok:g.state==='won',state:g.state,peak,stars:g.state!=='won'?0:peak/g.cap<=0.6?3:peak/g.cap<=0.85?2:1,frames};
}
async function solve(n) {
  const t=Date.now(), level=generateLevel(n), candidates=[];
  const alive=()=>Date.now()-t<30000;
  let best=null;
  function consider(seq,method) {
    if(!seq?.length)return;
    const checks=[validate(level,seq,77+n),validate(level,seq,913+n)];
    if(checks.every(x=>x.ok)) {
      const stars=Math.min(...checks.map(x=>x.stars));
      if(!best||stars>best.stars)best={seq,method,checks,stars};
    }
  }
  for(const width of [24,96]) {
    const p=beamPlan(level.board,level.cols,width);
    consider(p.seq,'generator-beam-'+width);
    if(best?.stars===3)break;
  }
  if(!best)try {
    const c=await bot.chooseContinuous(game(level,77+n),{width:128,previews:2,alive,exactMs:30,exactNodes:2000});
    if(c)consider(c.plan.seq,'bot-2.2.0');
  }catch(e){candidates.push(e.message);}
  return {n,hash:fingerprint(level),capacity:level.capacity,status:best?'validated':'unresolved',...best,errors:candidates,ms:Date.now()-t};
}
if(!isMainThread) {
  parentPort.on('message',async n=>{
    try{parentPort.postMessage(await solve(n));}catch(e){parentPort.postMessage({n,status:'error',error:e.stack});}
  });
} else {
  const start=Number(process.argv[2]||1101),end=Number(process.argv[3]||2100);
  fs.mkdirSync(dir,{recursive:true});
  const log=new URL('levels.jsonl',dir);
  const rows=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  const done=new Set(rows.map(r=>r.n)),queue=[];
  for(let n=start;n<=end;n++)if(!done.has(n))queue.push(n);
  let active=0;
  function save(){const selected=rows.filter(r=>r.n>=start&&r.n<=end).sort((a,b)=>a.n-b.n);const summary={range:[start,end],attempted:selected.length,validated:selected.filter(r=>r.status==='validated').length,threeStars:selected.filter(r=>r.stars===3).length,unresolved:selected.filter(r=>r.status!=='validated').map(r=>r.n),validation:{dimensions:[1440,900],speed:20,seeds:'77+level and 913+level',execution:'one tap, wait until settled'},levels:selected};fs.writeFileSync(new URL('plans.json',dir),JSON.stringify(summary,null,2));return summary;}
  function assign(w){if(queue.length){active++;w.postMessage(queue.shift());}else w.terminate();}
  const count=Math.min(2,queue.length);
  if(!count)console.log(JSON.stringify(save(),(k,v)=>k==='levels'?undefined:v));
  for(let i=0;i<count;i++) {
    const w=new Worker(new URL(import.meta.url));
    w.on('message',r=>{active--;rows.push(r);fs.appendFileSync(log,JSON.stringify(r)+'\n');if(rows.length%10===0||(!queue.length&&!active)){const s=save();console.log(JSON.stringify({done:s.attempted,validated:s.validated,threeStars:s.threeStars,last:r.n,ms:r.ms,remaining:queue.length}));}assign(w);});
    w.on('error',e=>{console.error(e);process.exitCode=1;});assign(w);
  }
}
