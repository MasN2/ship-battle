// Collects positions and final results from varied games, for fitting and checking position
// evaluators (tools/fiteval.js). Each line of the output is one position from one side's view:
// { g: game id, t: turn, f: feature vector (js/features.js), y: 1 win / 0 loss, ev: hand eval }.
//   node tools/positions.js [games=240] [--out tools/positions.jsonl] [--seed 120000]

import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, SimError } from '../js/sim.js';
import { evaluate, GM_DEFAULTS } from '../js/grandmaster.js';
import { positionFeatures } from '../js/features.js';
import { makeBot, workerCount } from './match.js';
import { mulberry32 } from './rng.js';

// Pairings: GM versions against each other and against scripted / human-recorded lines.
const BETA = JSON.parse(fs.readFileSync(new URL('./beta-cfg.json', import.meta.url), 'utf8'));
const PAIRS = [
    ['gm', 'gm', {}, {}], ['gm', 'gm', BETA, {}], ['gm', 'gm', BETA, BETA],
    ['gm', 'normal', BETA, null], ['gm', 'user21', {}, null], ['gm', 'user16', BETA, null],
    ['gm', 'user5', {}, null], ['gm', 'user14', BETA, null], ['gm', 'pol:snowsmart', {}, null],
    ['gm', 'pol:gridlock', BETA, null], ['gm', 'rand', BETA, null], ['gm', 'pol:econ', {}, null],
];

function game({ id, seed }) {
    const [a, b, ca, cb] = PAIRS[id % PAIRS.length];
    const rng = mulberry32(seed);
    const aSide = id % 2 ? 'blue' : 'red';
    const bots = { [aSide]: makeBot(a, ca, 0.05), [aSide === 'red' ? 'blue' : 'red']: makeBot(b, cb, 0.05) };
    const memo = { blue: {}, red: {} };
    const S = newSimState();
    const rows = [];
    try {
        while (!S.over && S.turn <= 90) {
            for (const side of ['blue', 'red']) rows.push({ g: id, t: S.turn, side, f: positionFeatures(S, side), ev: evaluate(S, side, GM_DEFAULTS) });
            const bp = bots.blue(S, 'blue', rng, memo.blue) || 0;
            const rp = bots.red(S, 'red', rng, memo.red) || 0;
            stepTurn(S, bp, rp);
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    if (!S.over) return [];
    return rows.map(r => ({ g: r.g, t: r.t, f: r.f, ev: Math.round(r.ev), y: r.side === S.over ? 1 : 0 }));
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(game).flat());
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const out = flag('--out', 'tools/positions.jsonl');
    const seed0 = Number(flag('--seed', 120000));
    const games = Number(args[0] ?? 240);
    const jobs = Array.from({ length: games }, (_, id) => ({ id, seed: seed0 + id }));
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const t0 = Date.now();
    const rows = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    fs.writeFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    console.log(`${games} games, ${new Set(rows.map(r => r.g)).size} decided, ${rows.length} positions -> ${out} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
