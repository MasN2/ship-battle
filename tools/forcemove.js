// Truth test for one move: from positions where `side` could buy ship N, play the whole game out
// twice from the same position - once forcing N now, once with the grandmaster's own choice - and
// compare results (both continuations then use the same grandmaster and opponent).
//   node tools/forcemove.js '{cfg}' N [--when push|any] [--positions 12] [--opps user21,pol:snowsmart,gm]

import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, canAfford, cloneState, SimError } from '../js/sim.js';
import { chooseGrandmaster, pushWindow } from '../js/grandmaster.js';
import { makeBot, workerCount } from './match.js';
import { mulberry32 } from './rng.js';

function finish(S, blueBot, cfg, rng, first) {
    const memo = { b: {}, r: {} };
    let k = 0;
    try {
        while (!S.over && S.turn < 120) {
            const b = blueBot(S, 'blue', rng, memo.b) || 0;
            const r = k++ === 0 ? first : chooseGrandmaster(S, 'red', { cfg, memo: memo.r, rng });
            stepTurn(S, b, r);
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    return { win: S.over === 'red' ? 1 : S.over === 'blue' ? 0 : 0.5, turns: S.turn, ore: S.red.ore, hpDiff: (Math.max(0, S.red.hp) - Math.max(0, S.blue.hp)) / 160 };
}

function job({ cfg, n, opp, seed, when, skip }) {
    const rng = mulberry32(seed);
    const blue = makeBot(opp, null, 0.05);
    const S = newSimState();
    const memo = { b: {}, r: {} };
    let seen = 0;
    while (!S.over && S.turn < 60) {
        const b = blue(S, 'blue', rng, memo.b) || 0;
        const ok = canAfford(S, 'red', n) && (when === 'any' || pushWindow(S, 'red'));
        const r = chooseGrandmaster(S, 'red', { cfg, memo: memo.r, rng });
        if (ok && r !== n && seen++ === skip) {
            const out = [];
            for (const rep of [0, 1]) {
                const forced = finish(cloneState(S), makeBot(opp, null, 0.05), cfg, mulberry32(seed * 7 + rep), n);
                const own = finish(cloneState(S), makeBot(opp, null, 0.05), cfg, mulberry32(seed * 7 + rep), r);
                out.push({ opp, turn: S.turn, ore: S.red.ore, own: r, forced, ownRes: own });
            }
            return out;
        }
        stepTurn(S, b, r);
    }
    return [];
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(job).flat());
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const when = flag('--when', 'push');
    const positions = Number(flag('--positions', 12));
    const opps = flag('--opps', 'user21,pol:snowsmart,gm').split(',');
    const cfg = JSON.parse(args[0]);
    const n = Number(args[1]);
    const jobs = [];
    for (let i = 0; i < positions; i++) jobs.push({ cfg, n, when, opp: opps[i % opps.length], seed: 9300 + i, skip: i % 2 });
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const res = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    let fw = 0, ow = 0, fh = 0, oh = 0;
    for (const r of res) {
        fw += r.forced.win; ow += r.ownRes.win; fh += r.forced.hpDiff; oh += r.ownRes.hpDiff;
        console.log(`${r.opp.padEnd(14)} t${r.turn} ore ${String(r.ore).padStart(3)}  forced #${n}: ${r.forced.win} (t${r.forced.turns}, ore ${r.forced.ore})   own #${r.own}: ${r.ownRes.win} (t${r.ownRes.turns}, ore ${r.ownRes.ore})`);
    }
    console.log(`${res.length} playouts: forced #${n} wins ${fw}, its own choice wins ${ow}; mean hp margin ${(fh / res.length).toFixed(2)} vs ${(oh / res.length).toFixed(2)}`);
}
