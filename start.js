// Marble Sort - bot ve sıralama paneli birlikte.
// Bot: 2.0.1. Sıralama paneli: 1.3.0.
// Bu dosyayı Not Defteri ile aç. Tamamını oyun sekmesindeki
// F12 > Console alanına yapıştır, Enter'a bas, panelden Başlat'ı seç.
// Oyun ilerlemesini sıfırlamaz. Bu paket kod yedeğidir.

(() => {
  'use strict';
  if (globalThis.MarbleSortBot) {
    if (globalThis.MarbleSortBot.version === '2.0.1') {
      globalThis.MarbleSortBot.show?.();
      return;
    }
    globalThis.MarbleSortBot.destroy?.();
  }

  const TRAY = 3;
  const COLORS = ['Kırmızı', 'Turuncu', 'Sarı', 'Yeşil', 'Koyu yeşil', 'Camgöbeği', 'Mavi', 'Mor', 'Pembe', 'Beyaz'];
  // Yield to the page without setTimeout's 4 ms nested-timer clamp.
  const sleep = (() => {
    if (typeof MessageChannel === 'undefined' || typeof document === 'undefined') return () => new Promise(resolve => setTimeout(resolve, 0));
    const channel = new MessageChannel(), queue = [];
    channel.port1.onmessage = () => queue.shift()?.();
    return () => new Promise(resolve => { queue.push(resolve); channel.port2.postMessage(0); });
  })();
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const cancelled = () => { throw new Error('cancelled'); };

  // A settled belt contains only unmatched marbles. Let each release finish
  // travelling before choosing another box, including all tray-pop animations.
  function settled(g) {
    return !g.falling.length && !g.pending.length && !g.toTray.length &&
      !g.cols.some(col => col.trays[0] &&
        (col.trays[0].pop >= 0 || col.trays[0].res > col.trays[0].filled)) &&
      !g.slots.some(b => b && (b.target || g.matchCol(b.c) >= 0));
  }

  function resolve(s, cols) {
    let changed;
    do {
      changed = false;
      // Same right-to-left priority as Game.matchCol and the original solver.
      for (let k = cols.length - 1; k >= 0; k--) {
        if (s.ptr[k] >= cols[k].length) continue;
        const c = cols[k][s.ptr[k]];
        const take = Math.min(TRAY - s.fill[k], s.pool[c]);
        if (!take) continue;
        s.pool[c] -= take;
        s.fill[k] += take;
        changed = true;
        if (s.fill[k] === TRAY) { s.ptr[k]++; s.fill[k] = 0; }
      }
    } while (changed);
    s.load = sum(s.pool);
  }

  function snapshot(g, peak = 0) {
    if (!settled(g)) throw new Error('Önce hareket eden topların durması gerekiyor.');
    const cols = g.cols.map(col => col.trays.map(t => t.c));
    const root = {
      b: g.board.clone(), pool: new Array(10).fill(0),
      ptr: g.cols.map(() => 0), fill: g.cols.map(col => col.trays[0]?.filled || 0),
      peak: Math.max(peak, g.beltCount()), residualPeak: 0, cost: 0, seq: [], load: 0,
    };
    for (const b of g.slots) if (b) root.pool[b.c]++;
    resolve(root, cols);
    root.residualPeak = root.load;
    return { root, cols, cap: g.cap };
  }

  function boardKey(b) {
    // Hidden flags do not change legal moves. Generator queues and counts do.
    let out = '';
    for (let i = 0; i < b.type.length; i++) {
      out += String.fromCharCode(33 + b.type[i], 40 + b.color[i], 40 + b.count[i]);
    }
    return out + '|' + b.gens.map(g => g.queue.join(',')).join(';');
  }

  const key = s => boardKey(s.b) + '|' + s.ptr + '|' + s.fill + '|' + s.pool;

  function canRelease(g, index, fast = false) {
    if (g.state !== 'play' || !g.tappable(index)) return false;
    if (settled(g)) {
      if (!fast) return true;
      const model = snapshot(g);
      return !!advance(model.root, index, model.cols, model.cap);
    }
    // Count everything still capable of entering the belt, including balls in
    // the funnel and falling from boxes. Reserve one slot for headroom.
    if (!fast || g.load() + g.board.count[index] > g.cap - 1) return false;
    // Preserve the order in which colours reach trays. Overlapping unmatched
    // colours can strand a later plan even when the belt itself never overflows.
    if (g.falling.length || g.pending.length || g.slots.some(b => b && !b.target)) return false;
    const color = g.board.color[index];
    return !g.cols.some(col => {
      const front = col.trays[0];
      const busy = front && (front.pop >= 0 || front.res > front.filled);
      return busy && (front.c === color || col.trays[1]?.c === color);
    });
  }

  function advance(s, i, cols, cap, limit = Infinity) {
    if (s.load >= cap) return null; // A full unmatched belt cannot admit the next colour.
    if (s.peak > limit || s.load + s.b.count[i] > limit) return null;
    const n = {
      b: s.b.clone(), pool: s.pool.slice(), ptr: s.ptr.slice(), fill: s.fill.slice(),
      // An upper bound, not an exact physical prediction: all balls in this box
      // could enter the belt before any of them reaches a tray.
      peak: Math.max(s.peak, Math.min(cap, s.load + s.b.count[i])),
      residualPeak: s.residualPeak, cost: s.cost, seq: [...s.seq, i], load: 0,
    };
    n.pool[s.b.color[i]] += s.b.count[i];
    n.b.clearCell(i);
    resolve(n, cols);
    if (n.load >= cap) return null;
    n.residualPeak = Math.max(s.residualPeak, n.load);
    n.cost += n.load;
    return n;
  }

  const rank = (a, b) => a.peak - b.peak || a.residualPeak - b.residualPeak ||
    a.load - b.load || a.cost - b.cost;
  const complete = (s, cols) => !s.b.blocksLeft() && !s.load &&
    s.ptr.every((p, k) => p === cols[k].length);
  const starLimit = g => Math.floor(g.cap * 0.6);
  const canPerfectRelease = (g, index, peak = 0) =>
    Math.max(peak, g.beltCount()) <= starLimit(g) && g.tappable(index) &&
    g.load() + g.board.count[index] <= starLimit(g);

  // Beam results are memoised by root state, so a search done ahead of time
  // (see prepareLevel) is reused instantly when that level starts.
  const beamMemo = new Map();
  async function beam(model, options = {}) {
    const memoKey = key(model.root) + '|' + model.root.peak + '|' + (options.width ?? 128) + '|' + (options.limit ?? '');
    const hit = beamMemo.get(memoKey);
    if (hit) return hit;
    const result = await beamSearch(model, options);
    beamMemo.set(memoKey, result);
    if (beamMemo.size > 8) beamMemo.delete(beamMemo.keys().next().value);
    return result;
  }

  // Model of a level's untouched starting state, identical to snapshot() of a
  // fresh Game, built without the live game or its layout.
  function levelModel(level) {
    const cols = level.cols.map(arr => [...arr]);
    const root = { b: level.board.clone(), pool: new Array(10).fill(0), ptr: cols.map(() => 0), fill: cols.map(() => 0),
      peak: 0, residualPeak: 0, cost: 0, seq: [], load: 0 };
    resolve(root, cols);
    root.residualPeak = root.load;
    return { root, cols, cap: level.capacity };
  }

  // Run the same beams chooseContinuous will ask for, ahead of time.
  async function prepareLevel(level, options = {}) {
    const model = levelModel(level), limit = Math.floor(level.capacity * 0.6);
    const perfect = await beam(model, { ...options, width: 512, limit });
    if (!perfect.plans.length) await beam(model, { ...options, width: 2048, limit });
    await beam(model, { ...options, width: 512, limit: undefined });
  }

  async function beamSearch(model, options = {}) {
    const { root, cols, cap } = model;
    const width = options.width ?? 128;
    const alive = options.alive ?? (() => true);
    if (!alive()) cancelled();
    let states = [root], nodes = 0, yielded = performance.now();
    for (let depth = 0; depth < root.b.blocksLeft(); depth++) {
      const dedup = new Map();
      for (const s of states) {
        for (const i of s.b.tappableList()) {
          const n = advance(s, i, cols, cap, options.limit);
          nodes++;
          if (n) {
            // Keep different first moves so the physical preview has alternatives.
            const k = n.seq[0] + ':' + key(n), prev = dedup.get(k);
            if (!prev || rank(n, prev) < 0) dedup.set(k, n);
          }
          if (nodes % 128 === 0 && performance.now() - yielded > 10) {
            await sleep();
            if (!alive()) cancelled();
            yielded = performance.now();
          }
        }
      }
      states = [...dedup.values()].sort(rank).slice(0, width);
      if (!states.length) return { plans: [], nodes };
    }
    const seen = new Set();
    const plans = states.filter(s => {
      if (!complete(s, cols) || seen.has(s.seq[0])) return false;
      seen.add(s.seq[0]); return true;
    });
    return { plans, nodes };
  }

  // Improve a beam result with bounded exhaustive search. modelExact refers
  // only to the conservative load model, never to the random live physics.
  async function improve(model, initial, options = {}) {
    if (!initial?.seq.length) return { plan: initial, modelExact: true, nodes: 0 };
    const { root, cols, cap } = model;
    const alive = options.alive ?? (() => true);
    const deadline = performance.now() + (options.exactMs ?? 100);
    const limit = options.exactNodes ?? 6000;
    let best = initial, nodes = 0, limited = false;
    const memo = new Map();
    async function visit(s) {
      if (limited || s.peak >= best.peak) return;
      if (++nodes > limit || performance.now() >= deadline) { limited = true; return; }
      if (complete(s, cols)) { best = s; return; }
      const moves = s.b.tappableList();
      if (!moves.length) return;
      const unavoidable = Math.min(cap, s.load + Math.min(...moves.map(i => s.b.count[i])));
      if (Math.max(s.peak, unavoidable) >= best.peak) return;
      const k = key(s), old = memo.get(k);
      if (old !== undefined && old <= s.peak) return;
      memo.set(k, s.peak);
      const children = moves.map(i => advance(s, i, cols, cap, options.limit)).filter(Boolean).sort(rank);
      for (const n of children) {
        if (nodes % 256 === 0) { await sleep(); if (!alive()) cancelled(); }
        await visit(n);
        if (limited) break;
      }
    }
    await visit(root);
    return { plan: best, modelExact: !limited, nodes };
  }

  function cloneGame(g) {
    const data = {};
    for (const [k, v] of Object.entries(g)) if (k !== 'emit') data[k] = v;
    // One structuredClone preserves ball.target.t references to cloned trays.
    const copy = Object.assign(Object.create(Object.getPrototypeOf(g)), structuredClone(data));
    Object.setPrototypeOf(copy.board, Object.getPrototypeOf(g.board));
    copy.emit = () => {};
    copy.fx = []; copy.cellFx = new Map();
    return copy;
  }

  async function preview(g, indexOrSequence, options = {}) {
    const sim = cloneGame(g), alive = options.alive ?? (() => true);
    if (!alive()) cancelled();
    let peak = Math.max(options.peak ?? 0, sim.beltCount());
    const sequence = Array.isArray(indexOrSequence) ? indexOrSequence : [indexOrSequence];
    let frames = 0;
    if (options.fast) {
      let cursor = 0, sinceTap = 0;
      while (sinceTap < 7200) {
        if (cursor < sequence.length && settled(sim) && !canRelease(sim, sequence[cursor], true)) {
          return { ok: false, peak, reason: 'unsafe' };
        }
        if (frames % 3 === 0 && cursor < sequence.length && canRelease(sim, sequence[cursor], true)) {
          if (!sim.tap(sequence[cursor++])) return { ok: false, peak, reason: 'blocked' };
          sinceTap = 0;
        }
        sim.update(1 / 60); frames++; sinceTap++;
        peak = Math.max(peak, sim.beltCount());
        if (sim.state === 'lost') return { ok: false, peak, reason: 'lost' };
        if (cursor === sequence.length && settled(sim)) {
          const finished = !sim.board.blocksLeft() && !sim.load() && sim.cols.every(col => !col.trays.length);
          return { ok: !Array.isArray(indexOrSequence) || finished, peak, load: sim.beltCount(),
            seconds: sim.time - g.time, wallSeconds: frames / 60 };
        }
        if (frames % 240 === 239) { await sleep(); if (!alive()) cancelled(); }
      }
      return { ok: false, peak, reason: 'timeout' };
    }
    for (const index of sequence) {
      if (!alive()) cancelled();
      if (!sim.tap(index)) return { ok: false, peak, reason: 'blocked' };
      let idle = false;
      for (let frame = 0; frame < 7200; frame++) {
        sim.update(1 / 60); frames++;
        peak = Math.max(peak, sim.beltCount());
        if (sim.state === 'lost') return { ok: false, peak, reason: 'lost' };
        if (settled(sim)) { idle = true; break; }
        if (frames % 240 === 239) { await sleep(); if (!alive()) cancelled(); }
      }
      if (!idle) return { ok: false, peak, reason: 'timeout' };
    }
    const finished = !sim.board.blocksLeft() && !sim.load() && sim.cols.every(col => !col.trays.length);
    return { ok: !Array.isArray(indexOrSequence) || finished, peak,
      load: sim.beltCount(), seconds: sim.time - g.time, wallSeconds: frames / 60 };
  }

  async function choose(g, options = {}) {
    if (options.alive && !options.alive()) cancelled();
    if (options.perfect) options = { ...options, fast: false, limit: starLimit(g), width: options.width ?? 512 };
    const model = snapshot(g, options.peak ?? 0);
    if (model.root.peak > (options.limit ?? Infinity)) return null;
    if (!model.root.b.blocksLeft()) return null;
    let result = await beam(model, options);
    // A narrow beam can miss a valid order. Retry more broadly before stopping.
    if (!result.plans.length) result = await beam(model, { ...options, width: options.perfect ? 2048 : 512 });
    if (!result.plans.length) return null;
    const exact = await improve(model, result.plans[0], options);
    const candidates = [exact.plan, ...result.plans].filter((p, j, xs) =>
      xs.findIndex(q => q.seq[0] === p.seq[0]) === j).slice(0, options.previews ?? 3);
    const choices = [];
    for (const plan of candidates) {
      const forecast = await preview(g, plan.seq, options);
      if (forecast.ok) choices.push({ index: plan.seq[0], plan, forecast });
    }
    // Compare full physical runs, not just the next box. Random rollout and
    // bounded search still do not prove the globally optimal live move.
    choices.sort((a, b) => options.fast
      ? a.forecast.wallSeconds - b.forecast.wallSeconds || a.forecast.peak - b.forecast.peak || rank(a.plan, b.plan)
      : a.forecast.peak - b.forecast.peak || a.forecast.seconds - b.forecast.seconds || rank(a.plan, b.plan));
    const choice = choices[0];
    if (!choice && options.fast) return choose(g, { ...options, fast: false });
    return choice ? { ...choice, modelExact: exact.modelExact && choice.plan.peak === exact.plan.peak,
      nodes: result.nodes + exact.nodes, executionFast: !!options.fast, perfectPlan: !!options.perfect } : null;
  }

  // Re-check a cached plan against the live, settled state. Physical routing
  // can drift from the model (which tray a colour reaches first); catching it
  // early leaves room to replan instead of walking into a dead end.
  function planFeasible(g, seq, peak = 0) {
    if (!settled(g)) return true;
    const { root, cols, cap } = snapshot(g, peak);
    let s = root;
    for (const i of seq) {
      if (!s.b.tappableList().includes(i)) return false;
      s = advance(s, i, cols, cap);
      if (!s) return false;
    }
    return complete(s, cols);
  }

  // Largest belt peak that still earns the same star tier as `peak`.
  function tierBound(cap, peak) {
    for (const f of [0.6, 0.85]) {
      let p = Math.floor(cap * f) + 1;
      while (p > 0 && p / cap > f) p--;
      if (peak <= p) return Math.min(p, cap - 1);
    }
    return cap - 1;
  }

  // Pipelined release. Everything that can still reach the belt is g.load(),
  // and balls only leave it, so load + box <= bound keeps the belt peak within
  // the planned star tier and below capacity (no deadlock) without waiting for
  // the previous boxes to settle. Returns 'tap', 'wait' or 'settled'.
  function releaseDecision(g, i, bound, peak = 0) {
    if (g.state !== 'play') return 'wait';
    const b = tierBound(g.cap, Math.max(bound, peak, g.beltCount()));
    if (g.tappable(i) && g.load() + g.board.count[i] <= b) return 'tap';
    return settled(g) ? 'settled' : 'wait';
  }

  // Settled, but the next box does not fit the conservative bound. Simulate
  // just this box: release it if the physics keeps the star tier, or if the
  // plan is fresh and the release cannot overflow. false means replan.
  async function settledRelease(g, i, bound, peak, fresh, options = {}) {
    if (!canRelease(g, i)) return false;
    const limit = tierBound(g.cap, Math.max(bound, peak, g.beltCount()));
    const f = await preview(g, i, { ...options, peak });
    if (f.ok && f.peak <= limit) return true;
    return fresh && f.ok;
  }

  // Full physical rollout of a plan with overlapping releases. If this fails,
  // the plan is only safe when played one box at a time.
  async function pipelineSafe(g, sequence, peak = 0, options = {}) {
    const sim = cloneGame(g), alive = options.alive ?? (() => true);
    let cursor = 0, frames = 0;
    peak = Math.max(peak, sim.beltCount());
    while (frames < 36000) {
      if (frames % 3 === 0 && cursor < sequence.length) {
        const i = sequence[cursor], d = releaseDecision(sim, i, 0, peak);
        if (d === 'tap' || (d === 'settled' && sim.tappable(i) && sim.load() + sim.board.count[i] <= sim.cap - 1)) {
          if (!sim.tap(i)) return false;
          cursor++;
        } else if (d === 'settled') return false;
      }
      sim.update(1 / 60); frames++;
      peak = Math.max(peak, sim.beltCount());
      if (sim.state !== 'play') return sim.state === 'won';
      if (frames % 240 === 239) { await sleep(); if (!alive()) cancelled(); }
    }
    return false;
  }

  // Release bound for a plan. Default: stay in the best star tier reached so
  // far (bound 0 grows with the live peak). Turbo: allow the plan's forecast tier.
  const planBound = (g, choice, turbo = false) =>
    choice.perfectPlan ? starLimit(g) : turbo ? choice.forecast.peak : 0;

  async function chooseContinuous(g, options = {}) {
    const perfect = await choose(g, { ...options, perfect: true });
    if (perfect || options.requirePerfect) return perfect;
    return choose(g, { ...options, perfect: false, fast: false, width: options.width ?? 512 });
  }

  const api = { version: '2.0.1', prepareLevel, levelModel, tierBound, releaseDecision, planFeasible, pipelineSafe, settledRelease, planBound, settled, snapshot, beam, improve, choose, chooseContinuous, preview, cloneGame,
    key, boardKey, canRelease, starLimit, canPerfectRelease };
  globalThis.MarbleSortBot = api;
  if (typeof document === 'undefined') return; // Node tests use the real engine.

  let panel, text, stats, marker, timer, runGuardBox, prepareBox, minBox, nextBox, fastBox, turboBox, leadBox, speedBox, perfectBox, targetBox;
  let running = false, busy = false, generation = 0, mode = 'auto';
  let levelBoxes = 0, levelStartedAt = 0, lastGame = null, waitStarted = 0, cached = null, nextAttemptAt = 0, noPlan = 0, careful = false;
  const carefulLevels = new Set(); // levels where overlapping releases drifted
  const app = () => globalThis.__ms?.app;
  const say = value => { if (text) text.textContent = value; };
  const hideMarker = () => { if (marker) marker.hidden = true; };

  function point(g, index) {
    if (!marker) return;
    const L = app().L, x = index % g.board.W, y = Math.floor(index / g.board.W);
    const px = L.boardX + (x + 0.5) * L.cell;
    const py = L.boardY + (y + 0.5) * L.cell;
    Object.assign(marker.style, { left: `${px}px`, top: `${L.flip ? L.vh - py : py}px`,
      width: `${L.cell - 4}px`, height: `${L.cell - 4}px` });
    marker.hidden = false;
  }

  function stop(message = 'Durduruldu.') {
    running = false; generation++;
    cached = null;
    hideMarker(); say(message);
  }

  const validCache = g => cached && cached.g === g && cached.board === boardKey(g.board) &&
    cached.moves === g.moves && cached.trail === g.trail.length;

  // Server times each level: hold the final box until the level is old enough.
  // The server rejects (HTTP 422) wins faster than about 0.3 s per box, timed
  // from level start. Hold the final box until boxes x perBox has passed.
  function holdLastBox(g) {
    const perBox = Math.max(0, Number(minBox?.value) || 0);
    const min = perBox * (levelBoxes || 0) * 1000;
    if (!min || g.board.blocksLeft() !== 1) return false;
    const left = min - (performance.now() - levelStartedAt);
    if (left <= 0) return false;
    say(`Sunucu süre sınırı: son kutu ${Math.ceil(left / 1000)} sn bekletiliyor (${levelBoxes} kutu x ${perBox} sn).`);
    return true;
  }

  function tapCached(g) {
    if (holdLastBox(g)) return false;
    if (cached.perfect && !canPerfectRelease(g, cached.seq[0], app().maxLoad)) {
      cached = null; return false;
    }
    const i = cached.seq.shift();
    if (!g.tap(i)) { cached = null; return false; }
    cached.board = boardKey(g.board); cached.moves = g.moves; cached.trail = g.trail.length; cached.fresh = false;
    point(g, i); waitStarted = g.time;
    say(`${cached.perfect ? '3 yıldız planı' : 'En iyi bulunan plan'}: ${cached.seq.length} hamle kaldı. Bant: ${g.beltCount()}/${g.cap}.`);
    return true;
  }

  // Points tracker: the win screen shows the server's award ("+N pts").
  // The server times each level, so this is how speed settings are compared.
  const wins = [];
  let pointsGame = null, lastAward = null;
  // The server's win reply is plain JSON { p, why, score, rank }; the game only
  // shows p. Read it to learn why a win scored nothing.
  const pageFetch = globalThis.fetch;
  function hookFetch() {
    if (globalThis.fetch !== pageFetch) return;
    globalThis.fetch = async function (input, init) {
      const res = await pageFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (/api\/w(\?|$)/.test(url)) {
          const at = Date.now();
          res.clone().text().then(t => {
            let d = null;
            try { d = JSON.parse(t); } catch {}
            if (res.ok && d) lastAward = { ...d, at };
            else {
              const why = 'HTTP ' + res.status + (t ? ': ' + t.slice(0, 120).replace(/\s+/g, ' ') : '');
              lastAward = { p: 0, why, at };
              console.warn('[MarbleSortBot] sunucu reddetti', why);
            }
          }, () => { lastAward = { p: 0, why: 'HTTP ' + res.status, at }; });
        }
      } catch {}
      return res;
    };
  }
  // Non-blocking: poll the win screen's "+N pts" for up to 6 s after a win.
  // The text survives the next-level click until the following win clears it.
  function trackPoints(g) {
    if (pointsGame === g) return;
    pointsGame = g;
    const level = g.level.n, speed = g.speed, since = performance.now(), sinceWall = Date.now() - 1000, boxesAtWin = levelBoxes;
    const secs = levelStartedAt ? Math.round((performance.now() - levelStartedAt) / 100) / 10 : null;
    const poll = () => {
      const award = lastAward && lastAward.at >= sinceWall ? lastAward : null;
      if (!award && performance.now() - since < 8000) { setTimeout(poll, 250); return; }
      // Self-tune toward the server's limit: +0.02 after a 422, -0.005 after a
      // scored win, never below 0.30 s/box. 0 keeps the hold switched off.
      if (award && minBox && Number(minBox.value) > 0) {
        const v = Number(minBox.value) + (/HTTP 422/.test(String(award.why)) ? 0.02 : award.p ? -0.005 : 0);
        minBox.value = Math.max(0.30, Math.round(v * 1000) / 1000).toFixed(3);
      }
      wins.push({ p: award?.p || 0, at: Date.now(), speed, level, secs, boxes: boxesAtWin,
        note: award ? (award.p ? '' : String(award.why ?? 'neden yok')) : 'cevap yok' });
      if (wins.length > 200) wins.shift();
      showStats();
    };
    poll();
  }
  function showStats() {
    if (!stats) return;
    const last = wins.slice(-20), w = wins.at(-1);
    const total = last.reduce((t, x) => t + x.p, 0), zero = last.filter(x => !x.p).length;
    const why = {};
    for (const x of last) if (!x.p) why[x.note] = (why[x.note] || 0) + 1;
    const mins = last.length > 1 ? (last.at(-1).at - last[0].at) / 60000 : 0;
    stats.textContent = `Son bölüm (${w.level}, ${w.speed}x): ${w.p ? '+' + w.p + ' puan' : w.note}. ` +
      `Son ${last.length}: ortalama ${Math.round(total / last.length)} puan/bölüm` +
      (mins > 0 ? `, ${Math.round((total - last[0].p) / mins)} puan/dk` : '') + (zero ? `, ${zero} puansız (${Object.entries(why).map(([k, v]) => k + ' x' + v).join(', ')})` : '') +
      (w.secs ? `. Son bölüm süresi ${w.secs} sn` : '') + '.';
  }

  // Lead guard: between levels, stay on the win screen while we are #1 and
  // ahead of #2 by at least the chosen margin; resume when the margin shrinks.
  let leadHeld = false;
  function holdLead() {
    const margin = Math.max(0, Number(leadBox.value) || 0);
    if (!margin) { leadHeld = false; return false; }
    const board = globalThis.MarbleSortLeaderboard;
    if (!board) { leadHeld = false; return false; }
    const info = board.latest;
    const fresh = info && Date.now() - info.at < 660000;
    if (fresh) leadHeld = info.rank === 1 && info.lead !== null && info.lead >= margin;
    if (leadHeld) {
      say(`1. sıradasın, fark ${info.lead} puan (hedef ${margin}). Bekleniyor; fark düşerse devam edilecek.`);
      return true;
    }
    return false;
  }

  // Plan the next level in the background while this one plays.
  let preparedFor = 0;
  function prepareNext(g) {
    const n = g.level.n + 1;
    if (preparedFor === n) return;
    preparedFor = n;
    const token = generation;
    import(new URL('js/levelgen.js', location.href).href)
      .then(m => prepareLevel(m.generateLevel(n), { alive: () => running && token === generation }))
      .catch(err => { preparedFor = 0; if (err.message !== 'cancelled') console.warn('[MarbleSortBot] ön plan', err.message); });
  }

  // Run guard: the game asks the server for a run id when a level starts and
  // silently drops the win if that request failed. Do not play such a level.
  let runGame = null, runState = 'wait';
  function runReady(g) {
    if (runGame !== g) {
      runGame = g; runState = 'wait';
      const run = app()?.run;
      if (!run?.then) runState = 'ok';
      else run.then(r => { if (runGame === g) runState = r ? 'ok' : 'none'; }, () => { if (runGame === g) runState = 'none'; });
    }
    return runState;
  }

  function retryLevel(message) {
    if (mode !== 'auto' || perfectBox.checked) { stop(message); return; }
    if (performance.now() < nextAttemptAt) return;
    const g = app()?.game;
    const button = g?.state === 'lost'
      ? document.querySelector('#m-lose.show [data-action="retry"]')
      : document.querySelector('[data-action="restart"]');
    if (!button) {
      // No restart control found: play out a box so the game reaches its own
      // lose screen, whose retry button is known.
      const i = g?.state === 'play' ? g.board.tappableList()[0] : undefined;
      if (i !== undefined && settled(g)) { g.tap(i); say(message + ' Bölüm bitirilip yeniden denenecek.'); }
      else say('Yeniden deneme ekranı bekleniyor...');
      return;
    }
    cached = null; nextAttemptAt = performance.now() + 5000;
    say(message + ' Mevcut bölüm yeniden deneniyor.');
    button.click();
  }

  async function pump() {
    if (!running || busy) return;
    if (performance.now() < nextAttemptAt) return;
    const a = app(), g = a?.game;
    if (!g || a.screen !== 'game') { say('Önce normal bir bölüm aç.'); return; }
    if (a.mode !== 'campaign' || !g.board) { stop('Bu sürüm normal mod içindir. Mega modu desteklemiyor.'); return; }
    if (g.state === 'lost') { retryLevel('Bölüm kaybedildi.'); return; }
    if (g.state === 'won') {
      if (perfectBox.checked && a.maxLoad > starLimit(g)) {
        stop('Bu bölümde 3 yıldız sınırı aşılmış. Sonraki bölüme geçilmedi.'); return;
      }
      if (mode === 'auto') trackPoints(g);
      const target = Math.max(0, Number(targetBox.value) || 0);
      if (mode === 'auto' && nextBox.checked && holdLead()) return;
      if (target && g.level.n >= target) { stop(`${g.level.n}. bölüm tamamlandı. Hedefe ulaşıldı.`); return; }
      if (mode === 'auto' && nextBox.checked) {
        const next = document.querySelector('#m-win.show [data-action="next"]');
        if (next) next.click();
        say('Sonraki bölüm bekleniyor...');
      } else stop('Bölüm tamamlandı.');
      return;
    }
    if (a.paused || document.hidden) { say('Oyun duraklatıldı. Devam edince bot da devam eder.'); return; }
    // The UI caps speed at 3x; the engine runs any multiplier. Re-apply every
    // tick in case the game resets it on a new level or settings change.
    const speed = Math.min(20, Math.max(1, Math.round(Number(speedBox.value) || 3)));
    if (mode === 'auto' && speed > 3 && g.speed !== speed) g.speed = speed;
    if (lastGame !== g) { lastGame = g; levelStartedAt = performance.now(); levelBoxes = g.moves ? 0 : g.board.blocksLeft(); waitStarted = g.time; cached = null; noPlan = 0; careful = carefulLevels.has(g.level.n); }
    const perfect = perfectBox.checked;
    if (perfect && Math.max(a.maxLoad, g.beltCount()) > starLimit(g)) {
      stop('Bu bölümde 3 yıldız sınırı zaten aşılmış. 3 yıldız için yalnızca mevcut bölümü yeniden oynamak gerekir.'); return;
    }
    const cacheAllowed = mode === 'auto';
    if (cached && (!cacheAllowed || !validCache(g))) cached = null;
    const run = mode === 'auto' && runGuardBox.checked ? runReady(g) : 'ok';
    if (run === 'none' && !g.moves) { retryLevel('Bölüm başlangıcı sunucuya ulaşmadı, puan sayılmayacaktı.'); return; }
    if (run === 'wait' && cached?.seq.length && !g.moves) { say('Sunucu bölüm başlangıcını onaylıyor...'); return; }
    if (cached && prepareBox.checked) prepareNext(g);
    if (cached?.seq.length) {
      const i = cached.seq[0];
      if (cached.checked !== g.moves && settled(g)) {
        cached.checked = g.moves;
        if (!planFeasible(g, cached.seq, a.maxLoad)) {
          // Routing drifted: finish this level one box at a time.
          careful = true; carefulLevels.add(g.level.n); cached = null; return;
        }
      }
      if (careful && !settled(g)) { say('Dikkatli mod: toplar yerleşiyor...'); return; }
      const decision = releaseDecision(g, i, cached.bound, a.maxLoad);
      if (decision === 'tap') { tapCached(g); return; }
      if (decision === 'wait') {
        say(`Bantta yer bekleniyor... Hareket halindeki toplar: ${g.load()}.`);
        if (g.time - waitStarted > 150) retryLevel('Toplar uzun süredir yerleşmedi.');
        return;
      }
      // Settled, but the box no longer fits the planned star tier: the live
      // routing drifted. Replan once; a fresh plan may then accept a tier drop.
      if (cached.perfect) { cached = null; return; }
      busy = true;
      const token = generation;
      try {
        const ok = await settledRelease(g, i, cached.bound, a.maxLoad, cached.fresh,
          { alive: () => running && token === generation && app()?.game === g });
        if (running && token === generation && validCache(g) && !a.paused && !document.hidden && settled(g)) {
          if (ok) tapCached(g);
          else cached = null; // Replan from the real state.
        }
      } catch (err) { if (err.message !== 'cancelled') stop(`Hata: ${err.message}`); }
      finally { busy = false; }
      return;
    }
    if (!settled(g)) {
      hideMarker(); say(`Toplar yerleşiyor... Bant: ${g.beltCount()}/${g.cap}`);
      if (g.time - waitStarted > 150) retryLevel('Toplar uzun süredir yerleşmedi.');
      return;
    }
    waitStarted = g.time;
    if (!g.board.blocksLeft()) { say('Son toplar bekleniyor...'); return; }
    busy = true;
    const token = generation;
    const alive = () => running && token === generation && app()?.game === g;
    const before = key(snapshot(g).root);
    try {
      say('Hamleler hesaplanıyor...');
      const choice = await chooseContinuous(g, { alive, peak: a.maxLoad, requirePerfect: perfect });
      if (!alive()) return;
      if (a.paused || document.hidden || !settled(g) || key(snapshot(g).root) !== before) return;
      if (!choice) {
        if (perfect) stop('3 yıldız sınırında güvenli bir plan bulunamadı. Bölümü bitirmeden duruldu.');
        else if (++noPlan >= 2) {
          // No legal completion exists from here: restart instead of waiting forever.
          noPlan = 0; carefulLevels.add(g.level.n);
          retryLevel('Bölüm çözümsüz bir duruma girdi.');
        } else {
          nextAttemptAt = performance.now() + 2000;
          say('Plan bulunamadı. Arama tekrar denenecek.');
        }
        return;
      }
      noPlan = 0;
      const i = choice.index;
      const row = Math.floor(i / g.board.W) + 1, col = i % g.board.W + 1;
      point(g, i);
      say(`${COLORS[g.board.color[i]]}: ${row}. satır, ${col}. sütun. ` +
        `Tahmini bölüm zirvesi: ${choice.forecast.peak}/${g.cap}.`);
      if (mode === 'hint') { running = false; return; }
      if (cacheAllowed && !careful && !choice.perfectPlan &&
        !(await pipelineSafe(g, choice.plan.seq, a.maxLoad, { alive }))) {
        careful = true; carefulLevels.add(g.level.n);
      }
      if (!alive() || !settled(g) || key(snapshot(g).root) !== before) return;
      if (cacheAllowed) {
        cached = { g, seq: [...choice.plan.seq], board: boardKey(g.board), moves: g.moves,
          trail: g.trail.length, pipeline: choice.executionFast, perfect: choice.perfectPlan, fresh: true,
          bound: planBound(g, choice, turboBox.checked) };
        // First box waits for the server's run id (checked on the next tick).
        if (!(runGuardBox.checked && !g.moves && runReady(g) !== 'ok')) tapCached(g);
        return;
      }
      if (perfect && !canPerfectRelease(g, i, a.maxLoad)) { stop('3 yıldız sınırını korumak için duruldu.'); return; }
      if (!g.tap(i)) { stop('Hamle uygulanamadı. Tekrar başlat.'); return; }
      waitStarted = g.time;
      if (mode === 'one') { running = false; return; }
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.error('[MarbleSortBot]', err);
        if (perfectBox.checked) stop(`Hata: ${err.message}`);
        else { nextAttemptAt = performance.now() + 5000; say(`Hata: ${err.message}. Arama tekrar denenecek.`); }
      }
    } finally { busy = false; }
  }

  function start(selectedMode = 'auto') {
    if (!globalThis.__ms?.app) { say('Oyun yüklenmedi veya bu sürümde oyun erişimi değişmiş.'); return; }
    generation++; running = true; mode = selectedMode;
    lastGame = null; cached = null; nextAttemptAt = 0; hideMarker();
    if (selectedMode === 'auto' && fastBox.checked) {
      // Use the game's existing 3x control and normal settings handler.
      document.querySelector('#speed-btns [data-speed="3"]')?.click();
    }
    void pump();
  }

  function mount() {
    const host = document.createElement('div');
    host.id = 'marble-sort-bot';
    Object.assign(host.style, { position: 'fixed', zIndex: '2147483646', right: '10px', top: '10px',
      maxWidth: 'min(310px, calc(100vw - 20px))', pointerEvents: 'auto' });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{font:13px/1.45 system-ui,sans-serif;color:#f4f7fc}
      .panel{background:#152132f5;border:1px solid #52657d;border-radius:12px;padding:11px;box-shadow:0 5px 24px #0005}
      header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:8px}
      button{font:inherit;cursor:pointer;border:1px solid #63748c;border-radius:6px;padding:5px 8px;background:#293e58;color:#fff}
      button:hover{background:#3a5475}.start{background:#19764d}.buttons{display:flex;gap:5px;flex-wrap:wrap}
      p{margin:8px 0;white-space:pre-wrap}label{display:block;font-size:12px}input{vertical-align:middle}
      details{margin-top:7px;font-size:11px;color:#becce0}summary{cursor:pointer}
    </style><section class="panel">
      <header><b>Marble Sort Bot</b><button class="close" title="Botu kapat">X</button></header>
      <div class="buttons"><button class="start">Başlat</button><button class="stop">Durdur</button><button class="hint">İpucu</button><button class="one">Tek hamle</button></div>
      <p class="status">Normal bölümü açıp Başlat'a bas.</p>
      <p class="stats" style="font-size:11px;color:#becce0"></p>
      <label><input class="next" type="checkbox" checked> Sonraki bölüme otomatik geç</label>
      <label><input class="perfect" type="checkbox"> 3 yıldız şart: çözüm yoksa dur</label>
      <label><input class="fast" type="checkbox" checked> Oyunun 3x hızı</label>
      <label>Hız çarpanı: <input class="speed" type="number" min="1" max="20" step="1" value="3" style="width:50px"> (oyun en fazla 3, 20 önerilir)</label>
      <label>Kutu başına en az: <input class="minsec" type="number" min="0" step="0.005" value="0.33" style="width:55px"> sn (422'de artar, kabulde azalır, en az 0.30)</label>
      <label><input class="prepare" type="checkbox" checked> Sonraki bölümü önceden planla</label>
      <label><input class="runguard" type="checkbox" checked> Sunucu bölümü kaydetmediyse oynama</label>
      <label><input class="turbo" type="checkbox"> Turbo: daha hızlı, yıldız biraz düşebilir</label>
      <label>Lider farkı: <input class="lead" type="number" min="0" step="100" value="1000" style="width:70px"> puan (0 = kapalı)</label>
      <label>Hedef bölüm: <input class="target" type="number" min="0" step="1" value="0" style="width:70px"> (0 = sınırsız)</label>
      <details><summary>Çözüm hakkında</summary>Kutuları güvenli olduğu anda üst üste bırakır; ulaşılan yıldız seviyesini korur. Turbo bu sınırı plan tahminine kadar gevşetir. Lider farkı: 1. sıradayken arkandakiyle fark bu değere ulaşınca bölüm arasında bekler, fark düşünce devam eder. Önce 3 yıldızlık güvenli plan arar. Bulamazsa en iyi bulduğu planla devam eder; her bölümde 3 yıldız garanti değildir. Kaybedilen veya takılan mevcut bölümü yeniden dener. Sekme gizlenince duraklar; uyku veya kilit ekranında çalışma garantisi yoktur. Tamamlanan bölümleri sıfırlamaz.</details>
    </section>`;
    text = root.querySelector('.status');
    stats = root.querySelector('.stats');
    runGuardBox = root.querySelector('.runguard');
    prepareBox = root.querySelector('.prepare');
    minBox = root.querySelector('.minsec');
    hookFetch();
    nextBox = root.querySelector('.next');
    fastBox = root.querySelector('.fast');
    turboBox = root.querySelector('.turbo');
    leadBox = root.querySelector('.lead');
    speedBox = root.querySelector('.speed');
    perfectBox = root.querySelector('.perfect');
    targetBox = root.querySelector('.target');
    fastBox.onchange = () => stop("Hız değişti. Başlat'a bas.");
    perfectBox.onchange = () => stop("Yıldız tercihi değişti. Başlat'a bas.");
    root.querySelector('.start').onclick = () => start();
    root.querySelector('.stop').onclick = () => stop();
    root.querySelector('.hint').onclick = () => { stop(); start('hint'); };
    root.querySelector('.one').onclick = () => { stop(); start('one'); };
    root.querySelector('.close').onclick = () => { stop(); host.hidden = true; };
    marker = document.createElement('div');
    marker.hidden = true;
    Object.assign(marker.style, { position: 'fixed', zIndex: '2147483645', pointerEvents: 'none',
      border: '4px solid #00e3ff', borderRadius: '12px', boxShadow: '0 0 16px #00c8ff',
      transform: 'translate(-50%,-50%)', boxSizing: 'border-box' });
    document.documentElement.append(host, marker);
    panel = host;
    timer = setInterval(() => { void pump(); }, 20);
  }

  Object.assign(api, {
    start: () => start(), stop, points: () => wins.slice(), hint: () => { stop(); start('hint'); },
    step: () => { stop(); start('one'); },
    show: () => { if (panel) panel.hidden = false; },
    destroy: () => { stop(); if (globalThis.fetch !== pageFetch) globalThis.fetch = pageFetch; clearInterval(timer); panel?.remove(); marker?.remove(); delete globalThis.MarbleSortBot; },
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();


// Console: Dosyanın tamamını oyun sekmesindeki Console'a yapıştır.
// Mevcut botu durdurmaz; oyun ilerlemesini veya skorunu değiştirmez.
// Kaldır: MarbleSortLeaderboard.destroy()
(() => {
  'use strict';
  const VERSION = '1.3.0';
  if (globalThis.MarbleSortLeaderboard?.version === VERSION) {
    globalThis.MarbleSortLeaderboard.show?.();
    void globalThis.MarbleSortLeaderboard.refresh?.();
    return;
  }

  const scoreOf = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  function selectWindow(data) {
    if (!data || !Array.isArray(data.top)) throw new Error('Sıralama yanıtı beklenen biçimde değil.');
    const byRank = new Map();
    let flagged = null;
    data.top.forEach((row, index) => {
      const rank = Number.isInteger(row.rank) && row.rank > 0 ? row.rank : index + 1;
      const player = { rank, name: String(row.n ?? ''), score: scoreOf(row.s), self: !!row.me };
      byRank.set(rank, player);
      if (row.me) flagged = player;
    });
    const me = data.me || {};
    const rank = Number.isInteger(me.rank) && me.rank > 0 ? me.rank : flagged?.rank;
    const self = { rank: rank ?? null, name: String(me.name ?? flagged?.name ?? 'Sen'),
      score: scoreOf(me.score) ?? flagged?.score ?? null, self: true };
    if (!rank) return { rank: null, rows: [self], missing: [], unranked: true };
    const rows = [], missing = [];
    for (let r = Math.max(1, rank - 3); r <= rank + 1; r++) {
      const player = r === rank ? self : byRank.get(r);
      if (!player) { missing.push(r); continue; }
      rows.push({ ...player, self: r === rank,
        gap: player.score === null || self.score === null ? null : player.score - self.score });
    }
    // Lead over the next player (positive = ahead). null if unknown.
    const next = byRank.get(rank + 1);
    const lead = next?.score == null || self.score === null ? null : self.score - next.score;
    return { rank, rows, missing, unranked: false, lead };
  }

  const api = { version: VERSION, selectWindow };
  if (typeof document === 'undefined') { globalThis.MarbleSortLeaderboard = api; return; }
  if (location.hostname !== 'marblesort.onurtirpan.io') {
    console.warn('Sıralama kodunu Marble Sort oyun sekmesinde çalıştır.'); return;
  }
  globalThis.MarbleSortLeaderboard?.destroy?.();
  globalThis.MarbleSortLeaderboard = api;

  let host, root, rowsEl, statusEl, noteEl, rankEl, button, timer, controller;
  let busy = false, closed = false, lastGood = null, failures = 0, nextTry = 0;
  const format = new Intl.NumberFormat('tr-TR');
  const timeFormat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmt = value => value === null ? '-' : format.format(value);

  function ensureMount() {
    if (!host || closed) return;
    const bot = document.getElementById('marble-sort-bot');
    const parent = bot?.shadowRoot?.querySelector('.panel');
    const target = parent || document.documentElement;
    if (host.parentNode !== target) target.appendChild(host);
    if (parent) host.style.cssText = 'display:block;margin-top:12px;';
    else host.style.cssText = 'display:block;position:fixed;right:12px;bottom:12px;width:320px;max-width:calc(100vw - 24px);z-index:2147483646;';
  }

  function cell(row, text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    row.appendChild(td);
    return td;
  }

  function render(data) {
    const view = selectWindow(data);
    api.latest = { rank: view.rank, lead: view.lead ?? null, at: Date.now() };
    rowsEl.replaceChildren();
    rankEl.textContent = view.rank ? `#${view.rank}` : 'Sıra yok';
    for (const player of view.rows) {
      const tr = document.createElement('tr');
      if (player.self) { tr.className = 'self'; tr.setAttribute('aria-current', 'true'); }
      cell(tr, player.rank ? `#${player.rank}` : '-', 'rank');
      const name = cell(tr, `${player.name}${player.self ? ' (Sen)' : ''}`, 'name');
      name.title = player.name;
      cell(tr, fmt(player.score), 'number');
      const gap = player.self ? '-' : player.gap === null ? '-' :
        `${player.gap > 0 ? '+' : player.gap < 0 ? '-' : ''}${fmt(Math.abs(player.gap))}`;
      cell(tr, gap, 'number gap');
      rowsEl.appendChild(tr);
    }
    noteEl.textContent = view.unranked ? 'Sunucu henüz bir sıra bildirmedi.' :
      view.missing.length ? `API yanıtında bulunmayan sıralar: ${view.missing.map(r => '#' + r).join(', ')}.` :
      view.rank === 1 ? 'Lidersin.' : 'Önündeki en fazla 3 kişi ve hemen arkandaki kişi.';
  }

  async function refresh() {
    if (busy || closed || document.hidden) return;
    // Every 5 min; after errors back off to 10, 20, up to 30 min.
    if (Date.now() < nextTry) return;
    ensureMount();
    busy = true; button.disabled = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10000);
    try {
      // Same read-only URL as the game's net/api.js board(). No POST, no key.
      let pid = null;
      try { pid = JSON.parse(localStorage.getItem('marblesort.id') || 'null')?.pid; } catch {}
      const url = new URL('api/t', location.href);
      if (typeof pid === 'string' && pid) url.searchParams.set('me', pid);
      const response = await fetch(url.href, { method: 'GET', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (closed) return;
      render(data);
      lastGood = new Date(); failures = 0; nextTry = 0;
      statusEl.textContent = `${timeFormat.format(lastGood)} - 5 dakikada bir yenilenir`;
    } catch (err) {
      if (closed) return;
      statusEl.textContent = `Sıralama alınamadı${lastGood ? '; son veri ' + timeFormat.format(lastGood) : ''}.`;
      if (!lastGood) noteEl.textContent = 'Yenile ile tekrar deneyebilirsin. Oyun ve bot devam eder.';
      failures++;
      nextTry = Date.now() + Math.min(1800000, 300000 * 2 ** (failures - 1));
      if (failures === 1) console.warn('[MarbleSortLeaderboard]', err.message, '- tekrar denemeler yavaşlatıldı.');
    } finally {
      clearTimeout(timeout); controller = null; busy = false;
      if (button) button.disabled = false;
    }
  }

  const onVisible = () => {};
  Object.assign(api, {
    refresh: () => { nextTry = 0; return refresh(); },
    show: () => { if (host) { host.hidden = false; ensureMount(); } },
    destroy: () => {
      closed = true; clearInterval(timer); controller?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      host?.remove(); delete globalThis.MarbleSortLeaderboard;
    },
  });

  host = document.createElement('section');
  host.id = 'marble-sort-nearby-board';
  root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{font:12px/1.4 system-ui,sans-serif;color:#eaf1fa}
    .wrap{background:#152132;border:1px solid #435771;border-radius:9px;overflow:hidden}
    header{display:flex;align-items:center;gap:7px;padding:8px 9px;border-bottom:1px solid #34485f}
    strong{font-size:12px;letter-spacing:.3px} .rank-pill{margin-right:auto;color:#7de5bb;font-weight:700}
    button{font:inherit;background:#293e58;color:#fff;border:1px solid #526a88;border-radius:5px;padding:3px 6px;cursor:pointer}
    button:disabled{opacity:.5;cursor:wait}button:hover{background:#385574}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{font-size:10px;color:#9db0c8;text-align:left;padding:6px 7px;font-weight:500}
    td{padding:7px;border-top:1px solid #25384e;font-variant-numeric:tabular-nums}
    th:first-child{width:34px}th:nth-child(3){width:54px}th:nth-child(4){width:58px}
    .number,th:nth-child(n+3){text-align:right}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rank{color:#a6bad1}.gap{color:#b8cbe1}.self{background:#154b40;font-weight:700}.self .rank{color:#a6f1ce}
    p{margin:0;padding:6px 9px;font-size:10px;color:#a9bbd1}.note{padding-bottom:8px}.status{border-top:1px solid #34485f}
  </style><div class="wrap">
    <header><strong>YAKIN SIRALAMA</strong><span class="rank-pill"></span><button class="refresh" type="button">Yenile</button><button class="close" type="button" aria-label="Sıralama panelini kaldır">X</button></header>
    <table aria-label="Yakın oyuncular"><thead><tr><th>Sıra</th><th>Oyuncu</th><th>Puan</th><th>Fark</th></tr></thead><tbody></tbody></table>
    <p class="status" role="status">Sıralama yükleniyor...</p><p class="note">Fark sütunu puan farkını gösterir.</p>
  </div>`;
  rowsEl = root.querySelector('tbody'); statusEl = root.querySelector('.status');
  noteEl = root.querySelector('.note'); rankEl = root.querySelector('.rank-pill');
  button = root.querySelector('.refresh');
  button.onclick = () => { nextTry = 0; void refresh(); };
  root.querySelector('.close').onclick = () => api.destroy();
  ensureMount();
  document.addEventListener('visibilitychange', onVisible);
  timer = setInterval(() => { void refresh(); }, 300000);
  void refresh();
})();
