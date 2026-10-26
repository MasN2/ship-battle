// Strength of the imagined styles (grandmaster's rollout policies): a round-robin of each style
// as a pure bot (with a little noise, eps) against every other, plus against fixed references.
// Prints each style's average score and an Elo-like rating; weak styles are imagined opponents
// that hand the grandmaster wins it would never get from a real player.
//   node tools/styles.js [games per pair=20] [--refs gm,normal,user16,user21] [--eps 0.1]

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { playGame, workerCount } from './match.js';
import { POLICIES } from '../js/grandmaster.js';

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(j => {
        const r = playGame(j.seed, j.a, j.b, null, null, j.aSide, 120, j.eps, 0);
        return { a: j.a, b: j.b, s: r.aWon ? 1 : r.bWon ? 0 : 0.5 };
    }));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const refs = flag('--refs', 'gm,normal,user16,user21').split(',').filter(Boolean);
    const eps = Number(flag('--eps', 0.1));
    const games = Number(args[0] ?? 20);
    const styles = Object.keys(POLICIES).filter(n => n !== 'evo').map(n => `pol:${n}`);
    const players = [...styles, ...refs];
    const jobs = [];
    let seed = 300000;
    for (let i = 0; i < players.length; i++) for (let k = i + 1; k < players.length; k++) {
        if (refs.includes(players[i]) && refs.includes(players[k])) continue;
        for (let g = 0; g < games; g++) jobs.push({ a: players[i], b: players[k], seed: seed++, aSide: g % 2 ? 'blue' : 'red', eps });
    }
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const t0 = Date.now();
    const res = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    // pairwise table and Elo by iterative fitting
    const score = {}, n = {};
    for (const p of players) { score[p] = {}; n[p] = {}; }
    for (const r of res) {
        score[r.a][r.b] = (score[r.a][r.b] ?? 0) + r.s; n[r.a][r.b] = (n[r.a][r.b] ?? 0) + 1;
        score[r.b][r.a] = (score[r.b][r.a] ?? 0) + 1 - r.s; n[r.b][r.a] = (n[r.b][r.a] ?? 0) + 1;
    }
    const elo = Object.fromEntries(players.map(p => [p, 0]));
    for (let it = 0; it < 2000; it++) {
        for (const p of players) {
            let grad = 0;
            for (const q in n[p]) {
                const e = 1 / (1 + 10 ** ((elo[q] - elo[p]) / 400));
                grad += score[p][q] - n[p][q] * e;
            }
            elo[p] += 0.5 * grad;
        }
        const mean = players.reduce((t, p) => t + elo[p], 0) / players.length;
        for (const p of players) elo[p] -= mean;
    }
    const avg = p => { let s = 0, c = 0; for (const q in n[p]) { if (refs.includes(q)) continue; s += score[p][q]; c += n[p][q]; } return c ? s / c : 0; };
    console.log(`${res.length} games, ${((Date.now() - t0) / 60000).toFixed(1)} min. rating (Elo-like), score vs the styles, and vs each reference:`);
    for (const p of players.slice().sort((a, b) => elo[b] - elo[a])) {
        const vs = refs.filter(r => r !== p).map(r => `${r} ${n[p][r] ? (100 * score[p][r] / n[p][r]).toFixed(0).padStart(3) + '%' : '   -'}`).join('  ');
        console.log(`${p.padEnd(14)} ${String(Math.round(elo[p])).padStart(5)}   styles ${(100 * avg(p)).toFixed(0).padStart(3)}%   ${vs}`);
    }
}
