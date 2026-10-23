// Trains js/intuition.js by mirror duels (antithetic evolution strategies, chess-evolved style).
//   node tools/train-intuition.js [duels=1000] [--batch 16] [--lr 0.05] [--sigma 0.08] [--spike 0.5] [--keys vibes|all]
//                                 [--portal 0.2] [--opening 2] [--fresh]
//                                 [--monolith [--learner '{cfg}'] [--mono '{cfg}']]
// --monolith: instead of mirror duels, each noise sample ε is played twice on the same start
// against a fixed plain grandmaster (the monolith): once as baseline+ε, once as baseline-ε.
// Only pairs where the two differ update the baseline (toward whichever sign won), so the
// signal is "did this beat the real thing", not "was it less wacky than the other side".
// Each duel: both sides get the same start: a shared random opening of up to --opening turns,
// and in a --portal share of duels the same boosted economy so higher-tier ships come into play. One side
// plays baseline+ε, the other baseline-ε, where ε is small noise on every weight plus one
// big spike. The baseline then moves lr·ε toward the winner (so away from the loser), more
// for decisive or early wins. No single duel is trusted; the average is.
// Both sides are a cheaper grandmaster (CHEAP below) so a duel takes seconds.
// Writes js/intuition-weights.js after every batch and appends to tools/intuition-log.txt.

import { Worker, isMainThread, parentPort } from 'worker_threads';
import fs from 'fs';
import { workerCount } from './match.js';
import { mulberry32 } from './rng.js';
import { newSimState, stepTurn, canAfford, SimError } from '../js/sim.js';
import { chooseGrandmaster, visibleShips } from '../js/grandmaster.js';
import { INTUITION_KEYS } from '../js/intuition.js';

// The trained pairs: a handful of "glance" rules, so each gets a usable share of the duels.
// (Training all 99 pairs at once was mostly random walk.) --keys all trains every pair.
const VIBES = [
    'miner:incoming', 'miner:breakout', 'miner:always', 'econ:incoming', 'econ:breakout', 'econ:failing',
    'econ:econGap', 'econ:always', 'missile:enemyWave', 'missile:failing', 'missile:always', 'size:lethal',
    'size:incoming', 'size:breakout', 'skip:always', 'skip:incoming', 'skip:banked', 'pricey:failing',
    'pricey:banked', 'armor:incoming',
];

export const CHEAP = {
    depth: 12, mine: ['smart', 'econ', 'turtle', 'value'], theirs: ['smart', 'econ', 'turtle', 'value', 'wild'], chaos: 0,
};

function duel({ base, eps, plusSide, seed, portal, opening }) {
    const rng = mulberry32(seed);
    const S = newSimState();
    // chaos portal: a shared boosted economy, so higher-tier ships come into play. Kept to a
    // minority of duels: real games mostly end before turn 40 from a normal start.
    if (rng() < portal) {
        const inc = [6, 10, 16, 28][Math.floor(rng() * 4)];
        const ore = [0, 60, 250, 900][Math.floor(rng() * 4)];
        for (const side of ['blue', 'red']) { S[side].income = inc; S[side].ore = ore; S[side].money = inc; }
    }
    // shared random opening
    const k = Math.floor(rng() * (opening + 1));
    for (let t = 0; t < k && !S.over; t++) {
        const menu = visibleShips(S, 'blue').filter(n => canAfford(S, 'blue', n));
        const n = rng() < 0.25 || !menu.length ? 0 : menu[Math.floor(rng() * menu.length)];
        stepTurn(S, n, canAfford(S, 'red', n) ? n : 0);
    }
    const W = sign => Object.fromEntries(INTUITION_KEYS.map(key => [key, (base[key] ?? 0) + sign * (eps[key] ?? 0)]));
    const cfg = {
        [plusSide]: { ...CHEAP, intuition: W(1) },
        [plusSide === 'red' ? 'blue' : 'red']: { ...CHEAP, intuition: W(-1) },
    };
    const memo = { blue: {}, red: {} };
    const start = S.turn;
    try {
        while (!S.over && S.turn < start + 100) {
            const b = chooseGrandmaster(S, 'blue', { cfg: cfg.blue, memo: memo.blue, rng });
            const r = chooseGrandmaster(S, 'red', { cfg: cfg.red, memo: memo.red, rng });
            stepTurn(S, b, r);
        }
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
    }
    if (!S.over) return { result: 0, turns: S.turn - start };
    const winnerHp = Math.max(0, S[S.over].hp);
    const turns = S.turn - start;
    // decisive (winner barely scratched) or early wins count more
    const weight = 0.5 + 0.5 * Math.min(1, winnerHp / 160) + (turns < 30 ? 0.3 : 0);
    return { result: S.over === plusSide ? weight : -weight, turns };
}

/** One game: a learner (grandmaster + intuition W) against the plain monolith grandmaster,
    from a shared random start. Returns the learner's result, 1 / 0.5 / 0, weighted up when decisive. */
function vsMonolith(W, learnerSide, seed, opening, cfgL, cfgM) {
    const rng = mulberry32(seed);
    const S = newSimState();
    const k = Math.floor(rng() * (opening + 1));
    for (let t = 0; t < k && !S.over; t++) {
        const menu = visibleShips(S, 'blue').filter(n => canAfford(S, 'blue', n));
        const n = rng() < 0.25 || !menu.length ? 0 : menu[Math.floor(rng() * menu.length)];
        stepTurn(S, n, canAfford(S, 'red', n) ? n : 0);
    }
    const monoSide = learnerSide === 'red' ? 'blue' : 'red';
    const cfg = { [learnerSide]: { ...cfgL, intuition: W }, [monoSide]: cfgM };
    const memo = { blue: {}, red: {} };
    const start = S.turn;
    try {
        while (!S.over && S.turn < start + 100) {
            const b = chooseGrandmaster(S, 'blue', { cfg: cfg.blue, memo: memo.blue, rng });
            const r = chooseGrandmaster(S, 'red', { cfg: cfg.red, memo: memo.red, rng });
            stepTurn(S, b, r);
        }
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
    }
    if (!S.over) return 0.5;
    return S.over === learnerSide ? 1 : 0;
}

/** Monolith pair: the same start played as baseline+ε and as baseline-ε against the monolith. */
function monolithPair({ base, eps, seed, learnerSide, opening, cfgL, cfgM }) {
    const W = sign => Object.fromEntries(Object.keys(base).map(key => [key, base[key] + sign * (eps[key] ?? 0)]));
    const plus = vsMonolith(W(1), learnerSide, seed, opening, cfgL, cfgM);
    const minus = vsMonolith(W(-1), learnerSide, seed, opening, cfgL, cfgM);
    return { plus, minus };
}

if (!isMainThread) {
    parentPort.on('message', jobs => parentPort.postMessage(jobs.map(j => (j.monolith ? monolithPair(j) : duel(j)))));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const batch = Number(flag('--batch', 16));
    const lr = Number(flag('--lr', 0.05));
    const sigma = Number(flag('--sigma', 0.08));
    const spike = Number(flag('--spike', 0.5));
    const keys = flag('--keys', 'vibes') === 'all' ? INTUITION_KEYS : VIBES;
    const monolith = bool('--monolith');
    // monolith mode: learner and monolith are both the real (default) grandmaster
    const cfgL = JSON.parse(flag('--learner', '{}'));
    const cfgM = JSON.parse(flag('--mono', '{}'));
    const portal = Number(flag('--portal', 0.2));     // share of duels from a boosted economy
    const opening = Number(flag('--opening', 2));     // max shared random opening turns
    const seed0 = Number(flag('--seed', 1));
    const fresh = bool('--fresh');
    const duels = Number(args[0] ?? 1000);
    const rng = mulberry32(seed0 * 4241);
    const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());

    let base = Object.fromEntries(INTUITION_KEYS.map(k => [k, 0]));
    if (!fresh) {
        const { INTUITION_WEIGHTS } = await import('../js/intuition-weights.js');
        if (INTUITION_WEIGHTS) base = { ...base, ...INTUITION_WEIGHTS };
    }
    const threads = workerCount();
    const workers = Array.from({ length: threads }, () => new Worker(new URL(import.meta.url)));
    const logFile = new URL('./intuition-log.txt', import.meta.url);
    const log = line => { console.log(line); fs.appendFileSync(logFile, line + '\n'); };
    log(`\n=== ${new Date().toISOString()} ${duels} duels, batch ${batch}, lr ${lr}, sigma ${sigma}, spike ${spike}, ${threads} threads`);
    let seed = seed0 * 99991;
    let decided = 0, played = 0, score = 0;
    const t0 = Date.now();
    for (let done = 0; done < duels; done += batch) {
        const jobs = Array.from({ length: Math.min(batch, duels - done) }, () => {
            const eps = Object.fromEntries(keys.map(k => [k, gauss() * sigma]));
            const sk = keys[Math.floor(rng() * keys.length)];
            eps[sk] += gauss() * spike;
            const side = rng() < 0.5 ? 'red' : 'blue';
            if (monolith) return { monolith: true, base, eps, seed: seed++, learnerSide: side, opening, cfgL, cfgM };
            return { base, eps, plusSide: side, seed: seed++, portal, opening };
        });
        const chunks = Array.from({ length: threads }, () => []);
        jobs.forEach((j, n) => chunks[n % threads].push(j));
        const results = (await Promise.all(workers.map((w, i) => new Promise(res => {
            if (!chunks[i].length) return res([]);
            w.once('message', res);
            w.postMessage(chunks[i]);
        })))).flat();
        // results come back in chunk order; match them to their jobs
        const ordered = [];
        chunks.forEach((c, i) => c.forEach((j, n) => ordered.push([j, results.slice(chunks.slice(0, i).reduce((a, x) => a + x.length, 0))[n]])));
        for (const [j, r] of ordered) {
            played++;
            if (j.monolith) {
                // the pair's average tracks the learner's win rate vs the monolith; only a
                // difference between +ε and -ε says anything about ε
                score += (r.plus + r.minus) / 2;
                const d = r.plus - r.minus;
                if (!d) continue;
                decided++;
                for (const k of keys) base[k] += lr * d * j.eps[k];
                continue;
            }
            if (!r.result) continue;
            decided++;
            for (const k of keys) base[k] += lr * r.result * j.eps[k];
        }
        fs.writeFileSync(new URL('../js/intuition-weights.js', import.meta.url),
            `// Trained weights for js/intuition.js, written by tools/train-intuition.js (${played} duels, ${new Date().toISOString()}).\n` +
            `export const INTUITION_WEIGHTS = ${JSON.stringify(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])), null, 1)};\n`);
        const top = Object.entries(base).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
        const vs = monolith ? ` learner vs monolith ${(100 * score / played).toFixed(0)}% (recent batch ${(100 * ordered.reduce((a, [, r]) => a + (r.plus + r.minus) / 2, 0) / ordered.length).toFixed(0)}%),` : '';
        log(`${played} ${monolith ? 'pairs' : 'duels'} (${decided} ${monolith ? 'split' : 'decided'}),${vs} ${((Date.now() - t0) / 60000).toFixed(1)} min. strongest: ${top}`);
    }
    for (const w of workers) w.terminate();
}
