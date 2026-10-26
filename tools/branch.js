// Branch from a real game: replay both build orders to turn T, then let grandmaster variants
// take over one side from that exact position against an adaptive opponent (with random
// variation), and see where each variant stands after N more turns.
//   node tools/branch.js "<blue order>" "<red order>" '[{cfg},...]' [--from 20] [--turns 15]
//        [--games 24] [--side red] [--opp pol:snowsmart]
// Reports, per variant: wins/losses within the window, and the side's income, ore and base hp
// difference at the end (averaged), with the control (default settings) first.
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, SimError } from '../js/sim.js';
import { makeBot, workerCount } from './match.js';
import { mulberry32 } from './rng.js';

function run({ blue, red, from, turns, side, opp, cfg, seed }) {
    const S = newSimState();
    for (let t = 0; t < from - 1 && !S.over; t++) stepTurn(S, blue[t] ?? 0, red[t] ?? 0);
    const rng = mulberry32(seed);
    const other = side === 'red' ? 'blue' : 'red';
    const bots = { [side]: makeBot('gm', cfg, 0), [other]: makeBot(opp, null, 0.15) };
    const memo = { blue: {}, red: {} };
    const end = S.turn + turns;
    try {
        while (!S.over && S.turn < end) stepTurn(S, bots.blue(S, 'blue', rng, memo.blue) || 0, bots.red(S, 'red', rng, memo.red) || 0);
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    return { won: S.over === side, lost: S.over === other, income: S[side].income, ore: S[side].ore, hp: (Math.max(0, S[side].hp) - Math.max(0, S[other].hp)) / 160, oppIncome: S[other].income };
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(j => ({ v: j.v, ...run(j) })));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const from = Number(flag('--from', 20)), turns = Number(flag('--turns', 15)), games = Number(flag('--games', 24));
    const side = flag('--side', 'red'), opp = flag('--opp', 'pol:snowsmart');
    const parse = s => s.split(/[\s,]+/).filter(Boolean).map(Number);
    const [b, r, cfgs] = args;
    const variants = [null, ...JSON.parse(cfgs)];
    const jobs = [];
    variants.forEach((cfg, v) => { for (let g = 0; g < games; g++) jobs.push({ v, cfg, seed: 1000 + g, blue: parse(b), red: parse(r), from, turns, side, opp }); });
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, n) => chunks[n % threads].push(j));
    const t0 = Date.now();
    const res = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    console.log(`branching ${side} at turn ${from} for ${turns} turns vs ${opp}, ${games} games each, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    variants.forEach((cfg, v) => {
        const rs = res.filter(x => x.v === v);
        const avg = k => rs.reduce((a, x) => a + x[k], 0) / rs.length;
        console.log(`${(cfg ? JSON.stringify(cfg) : 'default (v1.2)').padEnd(60).slice(0, 60)} W-L ${rs.filter(x => x.won).length}-${rs.filter(x => x.lost).length}  income ${avg('income').toFixed(1)} (opp ${avg('oppIncome').toFixed(1)})  ore ${avg('ore').toFixed(0)}  hp diff ${avg('hp').toFixed(2)}`);
    });
}
