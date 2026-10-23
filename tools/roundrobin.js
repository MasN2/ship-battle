// Round robin between grandmaster settings: every config plays every other.
//   node tools/roundrobin.js <configs.json | '[{json},...]'> [games per pair=10] [--open 4] [--max 120] [--seed 1]
// Sides alternate within each pair; both play random moves for the first --open turns so the
// games differ. Games still undecided at --max count half a point each.
// Prints standings (points, win%), each config's average income/ore at turns 20 and 30,
// and the head-to-head matrix.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import { playGame, workerCount } from './match.js';

if (!isMainThread) {
    const { jobs, configs, maxTurns, open } = workerData;
    for (const j of jobs) {
        const r = playGame(j.seed, 'gm', 'gm', configs[j.i], configs[j.k], j.aSide, maxTurns, 0, open);
        parentPort.postMessage({ ...j, winner: r.winner, aWon: r.aWon, bWon: r.bWon, turns: r.turns, econ: r.econ });
    }
    parentPort.postMessage('done');
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const open = Number(flag('--open', 4));
    const maxTurns = Number(flag('--max', 120));
    const seed0 = Number(flag('--seed', 1));
    const [src, perPairArg = 10] = args;
    const configs = JSON.parse(src.trim().startsWith('[') ? src : fs.readFileSync(src, 'utf8'));
    const perPair = Number(perPairArg);
    const label = c => JSON.stringify(c).replace(/"/g, '');

    const jobs = [];
    let seed = seed0 * 104729;
    for (let i = 0; i < configs.length; i++) {
        for (let k = i + 1; k < configs.length; k++) {
            for (let g = 0; g < perPair; g++) jobs.push({ i, k, seed: seed++, aSide: g % 2 === 0 ? 'red' : 'blue' });
        }
    }
    // longest-first isn't knowable; shuffle so slow pairs spread across threads
    for (let a = jobs.length - 1; a > 0; a--) { const b = (a * 7919 + 13) % (a + 1); [jobs[a], jobs[b]] = [jobs[b], jobs[a]]; }
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, n) => chunks[n % threads].push(j));
    const t0 = Date.now();
    const results = [];
    await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: chunk, configs, maxTurns, open } });
        w.on('message', m => { if (m === 'done') return resolve(); results.push(m); process.stderr.write(`\r${results.length}/${jobs.length}`); });
        w.on('error', reject);
    })));
    process.stderr.write('\r');

    const n = configs.length;
    const pts = new Array(n).fill(0);
    const played = new Array(n).fill(0);
    const h2h = Array.from({ length: n }, () => new Array(n).fill(0));
    const econ = Array.from({ length: n }, () => ({ 20: [0, 0, 0], 30: [0, 0, 0] }));
    let undecided = 0;
    for (const r of results) {
        const a = r.i, b = r.k;
        const bSide = r.aSide === 'red' ? 'blue' : 'red';
        played[a]++; played[b]++;
        const pa = r.aWon ? 1 : r.bWon ? 0 : 0.5;
        if (!r.aWon && !r.bWon) undecided++;
        pts[a] += pa; pts[b] += 1 - pa;
        h2h[a][b] += pa; h2h[b][a] += 1 - pa;
        for (const t of [20, 30]) {
            const e = r.econ[t];
            if (!e) continue;
            for (const [who, side] of [[a, r.aSide], [b, bSide]]) {
                econ[who][t][0] += e[side].income;
                econ[who][t][1] += e[side].ore;
                econ[who][t][2]++;
            }
        }
    }
    console.log(`${results.length} games, ${n} configs, ${perPair} per pair, ${undecided} undecided at turn ${maxTurns}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const order = [...Array(n).keys()].sort((x, y) => pts[y] - pts[x]);
    const e = (who, t) => { const v = econ[who][t]; return v[2] ? `inc ${(v[0] / v[2]).toFixed(1)} ore ${(v[1] / v[2]).toFixed(0)}` : '-'; };
    order.forEach((who, rank) => {
        console.log(`#${rank + 1}  ${String(pts[who]).padStart(5)} pts  ${(100 * pts[who] / played[who]).toFixed(0).padStart(3)}%   t20 ${e(who, 20).padEnd(16)} t30 ${e(who, 30).padEnd(16)} ${label(configs[who])}`);
    });
    console.log('\nhead to head (row config\'s points vs column config, rows/cols in standings order):');
    console.log('     ' + order.map((_, c) => `#${c + 1}`.padStart(5)).join(''));
    order.forEach((who, r) => console.log(`#${r + 1}`.padEnd(5) + order.map(o => (o === who ? '  -  ' : String(h2h[who][o]).padStart(5))).join('')));
    process.exit(0);
}
