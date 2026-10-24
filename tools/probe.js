// Paired probes: grandmaster variants vs the default grandmaster, each compared seed by seed
// with the default playing the same seed, so the luck of the starting position cancels out.
//   node tools/probe.js '[{"fear":20},{"advanceW":0}]' [games=80] [--open 2] [--max 120] [--seed 7919]
// For every variant: win rate, end-of-game base hp difference (the strongest signal found) and a
// survival score (a loss on turn 60 counts like a win), each as the per-seed change vs the
// control, ± one paired standard error, plus how long its losses lasted.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { playGame, workerCount } from './match.js';

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(j => {
        const r = playGame(j.seed, 'gm', 'gm', j.cfg, null, j.aSide, j.maxTurns, 0, j.open);
        // survival score: a win is 0.75 + up to 0.25 for base hp left; a loss is 0.75 × turns
        // survived / 60 (so losing on turn 60 counts like winning); surviving to the cap is 0.75
        const hpLeft = Math.max(0, Math.min(1, (r.end[j.aSide].hp) / 160));
        const surv = r.aWon ? 0.75 + 0.25 * hpLeft : r.bWon ? 0.75 * Math.min(1, r.turns / 60) : 0.75;
        return { v: j.v, seed: j.seed, win: r.aWon ? 1 : r.bWon ? 0 : 0.5, hp: r.parts.hp, surv, turns: r.turns, lost: r.bWon };
    }));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const open = Number(flag('--open', 2));
    const seed0 = Number(flag('--seed', 7919)); // use a new value to confirm a result on fresh seeds
    const maxTurns = Number(flag('--max', 120));
    const variants = [{}, ...JSON.parse(args[0])];
    const games = Number(args[1] ?? 80);
    const jobs = [];
    variants.forEach((cfg, v) => {
        for (let g = 0; g < games; g++) jobs.push({ v, cfg, seed: seed0 + g, aSide: g % 2 ? 'blue' : 'red', maxTurns, open });
    });
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, n) => chunks[n % threads].push(j));
    const t0 = Date.now();
    const res = (await Promise.all(chunks.map(c => new Promise((ok, bad) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', bad);
    })))).flat();
    const by = variants.map((_, v) => Object.fromEntries(res.filter(r => r.v === v).map(r => [r.seed, r])));
    const stat = xs => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const se = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1) / xs.length); return [m, se]; };
    const [cw] = stat(Object.values(by[0]).map(r => r.win));
    const [ch] = stat(Object.values(by[0]).map(r => r.hp));
    console.log(`${games} seeds per variant, ${((Date.now() - t0) / 1000).toFixed(0)}s. control (default vs default): wins ${(100 * cw).toFixed(1)}%, hp diff ${ch.toFixed(3)}`);
    for (let v = 1; v < variants.length; v++) {
        const seeds = Object.keys(by[v]);
        const [dw, sw] = stat(seeds.map(s => by[v][s].win - by[0][s].win));
        const [dh, sh] = stat(seeds.map(s => by[v][s].hp - by[0][s].hp));
        const [ds, ss] = stat(seeds.map(s => by[v][s].surv - by[0][s].surv));
        const lossTurns = seeds.filter(s => by[v][s].lost).map(s => by[v][s].turns);
        const ctlLossTurns = seeds.filter(s => by[0][s].lost).map(s => by[0][s].turns);
        const avg = xs => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : '-');
        console.log(`${''.padEnd(24)} survival ${ds >= 0 ? '+' : ''}${(100 * ds).toFixed(1)} ±${(100 * ss).toFixed(1)} (${(ds / (ss || 1)).toFixed(1)}σ)   its losses last ${avg(lossTurns)} turns (control's ${avg(ctlLossTurns)})`);
        console.log(`${JSON.stringify(variants[v]).padEnd(24)} wins ${dw >= 0 ? '+' : ''}${(100 * dw).toFixed(1)} ±${(100 * sw).toFixed(1)} pts (${(dw / (sw || 1)).toFixed(1)}σ)   hp ${dh >= 0 ? '+' : ''}${dh.toFixed(3)} ±${sh.toFixed(3)} (${(dh / (sh || 1)).toFixed(1)}σ)`);
    }
}
