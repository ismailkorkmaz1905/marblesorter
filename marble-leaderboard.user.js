// ==UserScript==
// @name         Marble Sort Nearby Leaderboard
// @namespace    local.marble-sort
// @version      1.1.0
// @description  Önündeki 3 oyuncu, sen ve arkandaki 1 oyuncu. Yalnızca GET kullanır.
// @match        https://marblesort.onurtirpan.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Console: Dosyanın tamamını oyun sekmesindeki Console'a yapıştır.
// Mevcut botu durdurmaz; oyun ilerlemesini veya skorunu değiştirmez.
// Kaldır: MarbleSortLeaderboard.destroy()
(() => {
  'use strict';
  const VERSION = '1.1.0';
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
  let busy = false, closed = false, lastGood = null;
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
      lastGood = new Date();
      statusEl.textContent = `${timeFormat.format(lastGood)} - 15 saniyede bir yenilenir`;
    } catch (err) {
      if (closed) return;
      statusEl.textContent = `Sıralama alınamadı${lastGood ? '; son veri ' + timeFormat.format(lastGood) : ''}.`;
      if (!lastGood) noteEl.textContent = 'Yenile ile tekrar deneyebilirsin. Oyun ve bot devam eder.';
      console.warn('[MarbleSortLeaderboard]', err.message);
    } finally {
      clearTimeout(timeout); controller = null; busy = false;
      if (button) button.disabled = false;
    }
  }

  const onVisible = () => { if (!document.hidden) void refresh(); };
  Object.assign(api, {
    refresh,
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
  button.onclick = () => { void refresh(); };
  root.querySelector('.close').onclick = () => api.destroy();
  ensureMount();
  document.addEventListener('visibilitychange', onVisible);
  timer = setInterval(() => { void refresh(); }, 15000);
  void refresh();
})();
