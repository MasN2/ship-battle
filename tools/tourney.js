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
import { newSimState, stepTurn, SimError } from '../js/sim.js';
import { mulberry32 } from './rng.js';
import { normalBot, scriptBot, greedEconBot, grandmasterBot, HUMAN_ORDERS } from './bots.js';
import { POLICIES, GM_DEFAULTS, visibleShips } from '../js/grandmaster.js';
import { canAfford } from '../js/sim.js';

/** Wraps a deterministic bot: with chance eps (2·eps early on) it plays a random visible ship or skips. */
function noisy(bot, eps) {
    return (S, side, rng, memo) => {
        const p = S.turn <= 8 ? 2 * eps : eps;
        if (rng() < p) {
            const menu = visibleShips(S, side).filter(n => canAfford(S, side, n));
            const k = Math.floor(rng() * (menu.length + 1));
            return k < menu.length ? menu[k] : 0;
        }
        return bot(S, side, rng, memo);
    };
}

function makeBot(name, cfg, eps) {
    switch (name) {
        case 'normal': return normalBot;
        case 'gm': return grandmasterBot(cfg);
        case 'econ': return noisy(greedEconBot, eps);
        case 'alice': return noisy(scriptBot(HUMAN_ORDERS.alice_blue), eps);
        case 'alice-red': return noisy(scriptBot(HUMAN_ORDERS.alice_red), eps);
        default:
            // pol:<name> plays one of grandmaster's rollout styles on its own (spend, smart, econ, mine, big)
            if (name.startsWith('pol:') && POLICIES[name.slice(4)]) {
                const pol = POLICIES[name.slice(4)];
                return noisy((S, side, rng) => pol(S, side, GM_DEFAULTS, rng), eps);
            }
            throw new Error(`unknown bot ${name}`);
    }
}

function randomOpening(bot, turns) {
    return (S, side, rng, memo) => {
        if (S.turn > turns) return bot(S, side, rng, memo);
        const menu = visibleShips(S, side).filter(n => canAfford(S, side, n));
        const k = Math.floor(rng() * (menu.length + 1));
        return k < menu.length ? menu[k] : 0;
    };
}

function playGame(seed, aName, bName, aCfg, bCfg, aSide, maxTurns, eps, open) {
    const rng = mulberry32(seed);
    const bots = {};
    bots[aSide] = randomOpening(makeBot(aName, aCfg, eps), open);
    bots[aSide === 'red' ? 'blue' : 'red'] = randomOpening(makeBot(bName, bCfg, eps), open);
    const memo = { blue: {}, red: {} };
    const S = newSimState();
    const picks = { blue: [], red: [] };
    const ms = { blue: 0, red: 0 };
    const maxMs = { blue: 0, red: 0 };
    let crash = false;
    while (!S.over && S.turn <= maxTurns) {
        let t0 = performance.now();
        const bp = bots.blue(S, 'blue', rng, memo.blue) || 0;
        let dt = performance.now() - t0;
        ms.blue += dt; maxMs.blue = Math.max(maxMs.blue, dt);
        t0 = performance.now();
        const rp = bots.red(S, 'red', rng, memo.red) || 0;
        dt = performance.now() - t0;
        ms.red += dt; maxMs.red = Math.max(maxMs.red, dt);
        picks.blue.push(bp);
        picks.red.push(rp);
        try { stepTurn(S, bp, rp); } catch (e) {
            if (!(e instanceof SimError)) throw e;
            crash = true;
            break;
        }
    }
    const winner = S.over ?? (crash ? 'crash' : 'timeout');
    const terminus = S.over ? picks[S.over][picks[S.over].length - 1] === 83 : false;
    return {
        seed, aSide, winner, aWon: winner === aSide, bWon: winner !== aSide && (winner === 'red' || winner === 'blue'),
        turns: S.turn, terminus, picks,
        msPerTurn: { a: ms[aSide] / S.turn, b: ms[aSide === 'red' ? 'blue' : 'red'] / S.turn },
        maxMs: { a: maxMs[aSide], b: maxMs[aSide === 'red' ? 'blue' : 'red'] },
        end: { blue: { hp: S.blue.hp, income: S.blue.income, ore: S.blue.ore }, red: { hp: S.red.hp, income: S.red.income, ore: S.red.ore } },
    };
}

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
    const threads = Math.max(1, Math.min(games, Number(process.env.SB_THREADS) || Math.floor(os.cpus().length * 0.75)));
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
