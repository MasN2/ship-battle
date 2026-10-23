// Sparse map of the strategy space: a concept plays one side for the first K turns, then that
// side hands over to grandmaster; the other side is grandmaster throughout. Does the concept's
// opening still lose with grandmaster-quality play after it?
//   node tools/crawl.js [games per cell=2] [--k 6,12] [--max 120] [--open 2]
// --open: both sides play random moves for the first turns, so each cell is many different
// games (grandmaster vs grandmaster is deterministic enough that otherwise a cell is one game).
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, canAfford, SimError } from '../js/sim.js';
import { chooseGrandmaster, POLICIES, GM_DEFAULTS, visibleShips } from '../js/grandmaster.js';
import { workerCount } from './match.js';
import { mulberry32 } from './rng.js';

const only = n => (S, side) => (canAfford(S, side, n) && S[side].money >= 0 ? n : 0);
export const CONCEPTS = {
    none: null, // control: grandmaster from turn 1
    miners: POLICIES.mine, traders: POLICIES.econ, snowball: POLICIES.snowball, turtle: POLICIES.turtle,
    frigates: POLICIES.value, rush: POLICIES.spend, missiles: only(5), skiffs: only(1), drillers: only(3),
    idle: () => 0,
};

function play({ concept, k, side, seed, maxTurns, open }) {
    const rng = mulberry32(seed);
    const S = newSimState();
    const memo = { blue: {}, red: {} };
    const pol = CONCEPTS[concept];
    let handover = null;
    let maxShip = { blue: 0, red: 0 };
    try {
        while (!S.over && S.turn <= maxTurns) {
            const random = sd => {
                const menu = visibleShips(S, sd).filter(n => canAfford(S, sd, n));
                const i = Math.floor(rng() * (menu.length + 1));
                return i < menu.length ? menu[i] : 0;
            };
            // the first `open` turns are random for both sides, so each cell is many different games
            const pick = sd => (S.turn <= open ? random(sd) : sd === side && pol && S.turn <= open + k
                ? pol(S, sd, GM_DEFAULTS, rng) || 0
                : chooseGrandmaster(S, sd, { memo: memo[sd], rng }));
            if (S.turn === open + k + 1) handover = { hp: Math.round(S[side].hp), inc: S[side].income, ore: Math.round(S[side].ore), oppHp: Math.round(S[side === 'red' ? 'blue' : 'red'].hp) };
            const b = pick('blue'), r = pick('red');
            maxShip.blue = Math.max(maxShip.blue, b); maxShip.red = Math.max(maxShip.red, r);
            stepTurn(S, b, r);
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    const opp = side === 'red' ? 'blue' : 'red';
    return {
        concept, k, side, won: S.over === side, lost: S.over === opp, turns: S.turn, handover,
        end: { inc: S[side].income, ore: Math.round(S[side].ore), oppInc: S[opp].income, oppOre: Math.round(S[opp].ore) },
        maxShip: Math.max(maxShip.blue, maxShip.red),
    };
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(play));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const ks = flag('--k', '6,12').split(',').map(Number);
    const maxTurns = Number(flag('--max', 120));
    const open = Number(flag('--open', 2));
    const per = Number(args[0] ?? 2);
    const jobs = [];
    let seed = 31337;
    for (const concept of Object.keys(CONCEPTS)) for (const k of concept === 'none' ? [0] : ks)
        for (const side of ['red', 'blue']) for (let g = 0; g < per; g++) jobs.push({ concept, k, side, seed: seed++, maxTurns, open });
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, n) => chunks[n % threads].push(j));
    const t0 = Date.now();
    const res = (await Promise.all(chunks.map(c => new Promise((ok, bad) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', bad);
    })))).flat();
    console.log(`${res.length} games, ${((Date.now() - t0) / 1000).toFixed(0)}s. Concept side's record (W-L), game length, and its economy at handover -> end vs grandmaster's at end.`);
    const cells = {};
    for (const r of res) (cells[`${r.concept} k${r.k}`] ??= []).push(r);
    for (const [key, rs] of Object.entries(cells)) {
        const w = rs.filter(r => r.won).length, l = rs.filter(r => r.lost).length;
        const turns = rs.map(r => r.turns).join('/');
        const h = rs[0].handover;
        const e = rs.map(r => `${r.end.inc}/${r.end.ore}`).join(' ');
        const o = rs.map(r => `${r.end.oppInc}/${r.end.oppOre}`).join(' ');
        console.log(`${key.padEnd(14)} ${w}-${l}  turns ${turns.padEnd(16)} handover ${h ? `hp ${h.hp} inc ${h.inc} ore ${h.ore} (gm hp ${h.oppHp})` : '-'}`.padEnd(88) + ` end inc/ore ${e} vs gm ${o}  top ship ${Math.max(...rs.map(r => r.maxShip))}`);
    }
}
