// Ground truth for mining windows: from real positions, play the game out twice - once with a
// miner bought now instead of the grandmaster's own pick, once with its pick - and record both
// results with the position's features, for fitting a gate that knows when mining pays.
//   node tools/windows.js '{cfg}' [games=48] [--opps gm,normal,user21,...] [--seed 200000] [--out tools/windows.jsonl]
// --mode style:K plays that style for K turns instead of one miner (a mining stretch), then the grandmaster.
// Appends to --out, so chunks can be collected one after another.

import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, canAfford, cloneState, enemyOf, SimError } from '../js/sim.js';
import { chooseGrandmaster, POLICIES } from '../js/grandmaster.js';
import { TEMPLATES } from '../js/templates.js';
import { positionFeatures } from '../js/features.js';
import { makeBot, workerCount } from './match.js';
import { mulberry32 } from './rng.js';

const MINERS = [3, 6, 9, 12, 15, 18];

// graded result for `me`: a win 0.75..1 by base hp left, a loss 0..0.75 by how long it lasted
function finish(S, me, opp, cfg, rng, first, mode = null) {
    const bot = makeBot(opp, null, 0.05);
    const memo = { me: {}, them: {} };
    let k = 0;
    try {
        while (!S.over && S.turn < 120) {
            const a = mode && k < mode.k ? POLICIES[mode.style](cloneState(S), me, cfg, rng) || 0
                : k === 0 ? first : chooseGrandmaster(S, me, { cfg, memo: memo.me, rng });
            k++;
            const b = bot(S, enemyOf(me), rng, memo.them) || 0;
            if (me === 'blue') stepTurn(S, a, b); else stepTurn(S, b, a);
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    const hp = Math.max(0, Math.min(1, S[me].hp / 160));
    return S.over === me ? 0.75 + 0.25 * hp : S.over ? 0.75 * Math.min(1, S.turn / 60) : 0.75;
}

function job({ cfg, opp, seed, me, mode }) {
    const rng = mulberry32(seed);
    const bot = makeBot(opp, null, 0.05);
    const S = newSimState();
    const memo = { me: {}, them: {} };
    const rows = [];
    try {
        while (!S.over && S.turn < 45 && rows.length < 3) {
            const a = chooseGrandmaster(S, me, { cfg, memo: memo.me, rng });
            const b = bot(S, enemyOf(me), rng, memo.them) || 0;
            const miners = MINERS.filter(n => n !== a && canAfford(S, me, n));
            if (mode && rng() < 0.25) {
                const s2 = seed * 13 + S.turn;
                const forced = finish(cloneState(S), me, opp, cfg, mulberry32(s2), 0, mode);
                const own = finish(cloneState(S), me, opp, cfg, mulberry32(s2), a);
                rows.push({ opp, seed, t: S.turn, own: a, mode: `${mode.style}:${mode.k}`, f: positionFeatures(S, me), forced, ownRes: own });
            } else if (!mode && !(TEMPLATES[a]?.mining > 0) && miners.length && rng() < 0.3) {
                const n = miners[Math.floor(rng() * miners.length)];
                const s2 = seed * 13 + S.turn;
                const forced = finish(cloneState(S), me, opp, cfg, mulberry32(s2), n);
                const own = finish(cloneState(S), me, opp, cfg, mulberry32(s2), a);
                rows.push({ opp, seed, t: S.turn, own: a, n, f: positionFeatures(S, me), forced, ownRes: own });
            }
            if (me === 'blue') stepTurn(S, a, b); else stepTurn(S, b, a);
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    return rows;
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(job).flat());
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const opps = flag('--opps', 'gm,normal,user21,user14,user5,user16,pol:snowsmart,rand').split(',');
    const seed0 = Number(flag('--seed', 200000));
    const out = flag('--out', 'tools/windows.jsonl');
    const m = flag('--mode', null);
    const mode = m ? { style: m.split(':')[0], k: Number(m.split(':')[1] || 6) } : null;
    const cfg = JSON.parse(args[0]);
    const games = Number(args[1] ?? 48);
    const jobs = Array.from({ length: games }, (_, i) => ({ cfg, opp: opps[i % opps.length], seed: seed0 + i, me: i % 2 ? 'blue' : 'red', mode }));
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const t0 = Date.now();
    const res = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    fs.appendFileSync(out, res.map(r => JSON.stringify(r)).join('\n') + '\n');
    const by = {};
    for (const r of res) { const o = (by[r.opp] ??= [0, 0, 0]); o[0]++; o[1] += r.forced - r.ownRes; o[2] += r.forced > r.ownRes + 0.05 ? 1 : 0; }
    for (const [o, [k, d, w]] of Object.entries(by)) console.log(`${o.padEnd(14)} ${k} branches  miner-minus-own ${(d / k).toFixed(3)}  miner clearly better ${w}`);
    console.log(`${res.length} branches from ${games} games -> ${out} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
