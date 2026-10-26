// Evolves the weights of js/evolved.js by AI-vs-AI play.
//   node tools/evolve.js [generations=50] [--mutants 8] [--vs 24] [--show 2] [--showgames 120]
//                        [--pool 6] [--noise 10] [--spike 80] [--seed 1] [--fresh]
// Each generation: the champion spawns mutants (noise on every weight, plus one big "spike"
// on a single weight). Screening: each mutant plays a short match against the champion. Show
// match: the best few replay a long match on fresh seeds (so screening luck can't carry them)
// and play the outlier pool: wild mutants, past champions, and fixed bots (frigate spam,
// snowball, turtle, playtest orders, Normal), so a counter that never shows up between
// near-identical champions still gets tested. A mutant takes over only if it wins the show
// match (>= 55%) and does at least as well as the champion against the pool.
// New champions are written to js/evolved-weights.js; tools/evolve-log.txt keeps the history.
// Runs on a quarter of the cores at low priority (SB_THREADS overrides).

import { Worker, isMainThread, parentPort } from 'worker_threads';
import fs from 'fs';
import { playGame, workerCount } from './match.js';
import { FEATURES, seedWeights, sideFeatures } from '../js/evolved.js';
import { newSimState, stepTurn } from '../js/sim.js';
import { mulberry32 } from './rng.js';
import { normalBot } from './bots.js';

const FIXED = ['pol:value', 'pol:snowball', 'pol:turtle', 'user1', 'user4', 'normal'];

if (!isMainThread) {
    parentPort.on('message', jobs => {
        const out = jobs.map(j => {
            const r = playGame(j.seed, 'evo', j.bName, j.aW, j.bW, j.aSide, 120, 0.1, j.open);
            return { id: j.id, score: r.aWon ? 1 : r.bWon ? 0 : 0.5 };
        });
        parentPort.postMessage(out);
    });
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const nMut = Number(flag('--mutants', 8));
    const nVs = Number(flag('--vs', 24));
    const nPool = Number(flag('--pool', 6));
    const nShow = Number(flag('--show', 2));          // mutants promoted to the show match
    const nShowGames = Number(flag('--showgames', 120));
    const noise = Number(flag('--noise', 10));         // eval points of noise on every weight
    const spike = Number(flag('--spike', 80));         // eval points on the one spiked weight
    const seed0 = Number(flag('--seed', 1));
    const fresh = bool('--fresh');
    const gens = Number(args[0] ?? 50);
    const rng = mulberry32(seed0 * 7777);
    const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());

    // Typical size of each feature, so a "small" step means the same thing for ore (hundreds)
    // as for armor (single digits).
    const mag = new Array(FEATURES.length).fill(0);
    let samples = 0;
    for (let g = 0; g < 20; g++) {
        const r = mulberry32(g + 1);
        const S = newSimState();
        while (!S.over && S.turn < 70) {
            for (const side of ['blue', 'red']) {
                sideFeatures(S, side).forEach((x, i) => { mag[i] += Math.abs(x); });
                samples++;
            }
            stepTurn(S, normalBot(S, 'blue', r), normalBot(S, 'red', r));
        }
    }
    for (let i = 0; i < mag.length; i++) mag[i] = Math.max(1, mag[i] / samples);

    let champ = seedWeights();
    if (!fresh) {
        const { EVOLVED_WEIGHTS } = await import('../js/evolved-weights.js');
        if (EVOLVED_WEIGHTS) champ = EVOLVED_WEIGHTS;
    }
    const clone = W => ({ me: { ...W.me }, opp: { ...W.opp } });
    // Eval points per step: subtle noise ~2, spike ~40, wild outliers ~25 on everything.
    function mutate(W, small, spike) {
        const M = clone(W);
        FEATURES.forEach((f, i) => {
            for (const k of ['me', 'opp']) M[k][f] += gauss() * small / mag[i];
        });
        if (spike) {
            const i = Math.floor(rng() * FEATURES.length);
            const k = rng() < 0.5 ? 'me' : 'opp';
            M[k][FEATURES[i]] += gauss() * spike / mag[i];
            M.spike = `${k}.${FEATURES[i]}`;
        }
        return M;
    }

    const threads = workerCount();
    const workers = Array.from({ length: threads }, () => new Worker(new URL(import.meta.url)));
    async function run(jobs) {
        const chunks = Array.from({ length: threads }, () => []);
        jobs.forEach((j, n) => chunks[n % threads].push(j));
        const parts = await Promise.all(workers.map((w, i) => new Promise(res => {
            if (!chunks[i].length) return res([]);
            w.once('message', res);
            w.postMessage(chunks[i]);
        })));
        return parts.flat();
    }

    const hall = [];
    const logFile = new URL('./evolve-log.txt', import.meta.url);
    const log = line => { console.log(line); fs.appendFileSync(logFile, line + '\n'); };
    log(`\n=== ${new Date().toISOString()} evolve ${gens} gens, ${nMut} mutants, ${nVs} h2h, ${nPool}/pool member, ${threads} threads`);
    let seed = seed0 * 1000003;
    for (let gen = 1; gen <= gens; gen++) {
        const t0 = Date.now();
        const wild = [mutate(champ, 25, 0), mutate(champ, 25, 0)];
        const pool = [
            ...FIXED.map(name => ({ name, W: null })),
            ...wild.map((W, i) => ({ name: `wild${i}`, W, evo: true })),
            ...hall.slice(-3).map((W, i) => ({ name: `hall${i}`, W, evo: true })),
        ];
        const mutants = Array.from({ length: nMut }, () => mutate(champ, noise, spike));
        // Stage 1, screening: every mutant plays a short match against the champion.
        const screenSeeds = Array.from({ length: nVs }, () => seed++);
        const jobs = [];
        mutants.forEach((W, m) => screenSeeds.forEach((sd, g) => jobs.push({
            id: `${m}`, seed: sd, aSide: g % 2 ? 'blue' : 'red', aW: W, bName: 'evo', bW: champ, open: 3,
        })));
        const screen = {};
        for (const r of await run(jobs)) screen[r.id] = (screen[r.id] ?? 0) + r.score;
        const top = mutants.map((W, m) => ({ W, m, s: screen[m] ?? 0 })).sort((a, b) => b.s - a.s).slice(0, nShow);
        // Stage 2, the show match: the best few replay on fresh seeds (so screening luck doesn't
        // carry over) against the champion and the outlier pool; the champion plays the same pool.
        const showSeeds = Array.from({ length: nShowGames }, () => seed++);
        const poolSeeds = pool.map(() => Array.from({ length: nPool }, () => seed++));
        const jobs2 = [];
        const poolJobs = (W, tag) => pool.forEach((p, k) => poolSeeds[k].forEach((sd, g) => jobs2.push({
            id: `${tag}:pool:${k}`, seed: sd, aSide: g % 2 ? 'blue' : 'red', aW: W,
            bName: p.evo ? 'evo' : p.name, bW: p.W, open: 2,
        })));
        poolJobs(champ, 'c');
        top.forEach(t => {
            poolJobs(t.W, `m${t.m}`);
            showSeeds.forEach((sd, g) => jobs2.push({ id: `m${t.m}:show`, seed: sd, aSide: g % 2 ? 'blue' : 'red', aW: t.W, bName: 'evo', bW: champ, open: 3 }));
        });
        const tally = {};
        for (const r of await run(jobs2)) tally[r.id] = (tally[r.id] ?? 0) + r.score;
        const poolScore = tag => pool.reduce((a, _, k) => a + (tally[`${tag}:pool:${k}`] ?? 0), 0);
        const champPool = poolScore('c');
        let best = null;
        for (const t of top) {
            const show = tally[`m${t.m}:show`] ?? 0;
            const ps = poolScore(`m${t.m}`);
            if (show >= nShowGames * 0.55 && ps >= champPool && (!best || show > best.show)) best = { ...t, show, ps };
        }
        const perFixed = FIXED.map((name, k) => `${name.replace('pol:', '')} ${tally[`c:pool:${k}`] ?? 0}`).join(' ');
        let line = `gen ${gen}: champ pool ${champPool}/${pool.length * nPool} (${perFixed}/${nPool} each), screen best ${top[0].s}/${nVs}`;
        if (best) {
            hall.push(champ);
            champ = best.W;
            line += ` -> NEW champ (show match ${best.show}/${nShowGames}, pool ${best.ps}, spike ${champ.spike})`;
            delete champ.spike;
            fs.writeFileSync(new URL('../js/evolved-weights.js', import.meta.url),
                `// Champion weights for js/evolved.js, written by tools/evolve.js (gen ${gen}, ${new Date().toISOString()}).
` +
                `export const EVOLVED_WEIGHTS = ${JSON.stringify(champ, null, 1)};
`);
        }
        log(`${line}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    for (const w of workers) w.terminate();
}
