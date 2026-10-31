# Precomputed levels 1101-2100

Based on engine and bot revision `39b1fa6c7447890b670a56b58599ee393dd81b2a`.

`results/plans.json` contains per-level tap sequences, two physical replay results, capacity, minimum observed stars, and a level fingerprint. `unresolved` lists any levels for which no validated sequence was found. Read the final counts in this file; a generated sequence alone does not count as solved.

Validation uses 1440x900, speed 20, seeds `77 + level` and `913 + level`, and waits for the marbles to settle between taps. These are offline engine wins, not played account levels or server-awarded points. Other layouts, random seeds, engine versions, or timings can change the outcome. Three stars are observations, not an optimality proof or a guarantee.

## Use

1. Stop the currently running bot with **Durdur**.
2. Run the complete contents of `start-precomputed.js` in the game's browser console, just as with `start.js`.
3. Click **Başlat**. The bot uses a matching saved route when available and falls back to its normal solver otherwise. Keep **3 yıldız şart** off if you want progression on levels without a three-star route.

The generated bundle includes the bot, plan table, and existing leaderboard helper. It does not automatically start playing. Reloading the page clears the imported table; rerun the bundle to restore it. No account backup or credentials are included.

The cache matches the board, dimensions, generator outlets, capacity, and tray colors. It previews the full route against the actual game at entry and checks the remaining route from each settled state. A failed preview discards the route and triggers normal search. Existing server run confirmation and last-box timing checks remain in force.

## Reproduce or extend

Requires Node.js. From the repository directory:

```powershell
node precompute.mjs 1101 2100
node package-plans.mjs
node test-offline.mjs
```

The batch uses two workers and appends each completed result to `results/levels.jsonl`. Rerunning skips completed levels and resumes interrupted work. The summary updates every ten completions and at the end. The initial search tries beam widths 24 and 96, then uses the existing bot solver if both fail physical verification. It keeps the best observed star result among the accepted candidates; it does not exhaustively search for a three-star solution to every level.

`start.js` is retained as the original bundle; `start-precomputed.js` is the new optional bundle. `marble-sort-bot.user.js` includes the cache integration but needs `offline-plans.js` loaded to use the saved plans.
