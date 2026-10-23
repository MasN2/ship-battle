// Bot-vs-bot tournament on the headless rules, in parallel.
//   node tools/tourney.js <botA> <botB> [games=40] [--max 200] [--a '{json}'] [--b '{json}'] [--seed 1] [--eps 0.1] [--log]
// Bots: normal (the live Normal AI), gm (grandmaster; --a/--b override its settings),
//       econ (scripted trader greed), alice / alice-red (human build orders from scenarios.js, then Normal),
//       pol:<style> (one of grandmaster's rollout styles played on its own).
// A plays red in even games and blue in odd ones, so blue's first-mover edge cancels out.
// Deterministic bots (everything but normal and gm) make a random move with chance --eps each
// turn (doubled in the first 8 turns), so a run is many different games, not one game replayed;
// the summary counts how many distinct games were actually played.
// --open N: both sides play random moves for the first N turns (an "opening book" of random
// starting positions), which is how two grandmaster versions get varied games against each other.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';
import { playGame, workerCount } from './match.js';

if (!isMainThread) {
    const { jobs, aName, bName, aCfg, bCfg, maxTurns, eps, open } = workerData;
    for (const { seed, aSide } of jobs) parentPort.postMessage(playGame(seed, aName, bName, aCfg, bCfg, aSide, maxTurns, eps, open));
    parentPort.postMessage('done');
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => {
        const i = args.indexOf(name);
        if (i < 0) return dflt;
        const v = args[i + 1];
        args.splice(i, 2);
        return v;
    };
    const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const maxTurns = Number(flag('--max', 200));
    const aCfg = JSON.parse(flag('--a', 'null'));
    const bCfg = JSON.parse(flag('--b', 'null'));
    const seed0 = Number(flag('--seed', 1));
    const eps = Number(flag('--eps', 0.1));
    const open = Number(flag('--open', 0));
    const showLog = bool('--log');
    const [aName = 'gm', bName = 'normal', gamesArg = 40] = args;
    const games = Number(gamesArg);

    const jobs = Array.from({ length: games }, (_, i) => ({ seed: seed0 * 7919 + i, aSide: i % 2 === 0 ? 'red' : 'blue' }));
    const threads = workerCount(games);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const t0 = Date.now();
    const results = [];
    await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: chunk, aName, bName, aCfg, bCfg, maxTurns, eps, open } });
        w.on('message', m => {
            if (m === 'done') return resolve();
            results.push(m);
            process.stderr.write(`\r${results.length}/${games}`);
        });
        w.on('error', reject);
    })));
    process.stderr.write('\r');
    results.sort((x, y) => x.seed - y.seed);

    const n = results.length;
    const count = f => results.filter(f).length;
    const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : '-'; };
    const aLabel = `${aName}${aCfg ? JSON.stringify(aCfg) : ''}`;
    const bLabel = `${bName}${bCfg ? JSON.stringify(bCfg) : ''}`;
    const distinct = new Set(results.map(r => JSON.stringify(r.picks))).size;
    console.log(`${n} games (${distinct} distinct), ${aLabel} vs ${bLabel}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`A wins ${count(r => r.aWon)}  B wins ${count(r => r.bWon)}  timeouts ${count(r => r.winner === 'timeout')}  crashes ${count(r => r.winner === 'crash')}`);
    {
        // margin score (tools/match.js marginScore): wins 0.6-1, losses 0-0.4, quality inside
        const m = results.map(r => r.margin);
        const mean = m.reduce((a, b) => a + b, 0) / n;
        const se = Math.sqrt(m.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1) / n);
        const w = results.map(r => (r.aWon ? 1 : r.bWon ? 0 : 0.5));
        const wm = w.reduce((a, b) => a + b, 0) / n;
        const wse = Math.sqrt(w.reduce((a, b) => a + (b - wm) ** 2, 0) / Math.max(1, n - 1) / n);
        const snr = xs => { const mu = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, xs.length - 1)); return `${mu.toFixed(2)} (${(mu / (sd / Math.sqrt(xs.length) || 1)).toFixed(1)}σ)`; };
        console.log(`A minus B at game end: ${Object.keys(results[0].parts).filter(k => k !== 'turns').map(k => `${k} ${snr(results.map(r => r.parts[k]))}`).join('  ')}`);
        console.log(`A score: wins ${(100 * wm).toFixed(1)}% ±${(100 * wse).toFixed(1)}   margin ${(100 * mean).toFixed(1)} ±${(100 * se).toFixed(1)}  (50 = even; ± is one standard error)`);
    }
    console.log(`A as red: ${count(r => r.aSide === 'red' && r.aWon)}/${count(r => r.aSide === 'red')}   A as blue: ${count(r => r.aSide === 'blue' && r.aWon)}/${count(r => r.aSide === 'blue')}`);
    const aWins = results.filter(r => r.aWon);
    const bWins = results.filter(r => r.bWon);
    console.log(`turns: A wins median ${median(aWins.map(r => r.turns))} (Terminus ${aWins.filter(r => r.terminus).length}), B wins median ${median(bWins.map(r => r.turns))} (Terminus ${bWins.filter(r => r.terminus).length})`);
    const avg = xs => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
    console.log(`think time per turn: A ${avg(results.map(r => r.msPerTurn.a)).toFixed(1)}ms, B ${avg(results.map(r => r.msPerTurn.b)).toFixed(1)}ms (slowest single turn: A ${Math.max(...results.map(r => r.maxMs.a)).toFixed(0)}ms, B ${Math.max(...results.map(r => r.maxMs.b)).toFixed(0)}ms)`);
    if (showLog) {
        for (const r of results) {
            const aPicks = r.picks[r.aSide];
            const bPicks = r.picks[r.aSide === 'red' ? 'blue' : 'red'];
            console.log(`seed ${r.seed} A=${r.aSide} winner=${r.winner} t${r.turns}${r.terminus ? ' TERMINUS' : ''}  end ${JSON.stringify(r.end)}`);
            console.log(`   A: ${aPicks.join(',')}`);
            console.log(`   B: ${bPicks.join(',')}`);
        }
    }
    process.exit(0);
}
