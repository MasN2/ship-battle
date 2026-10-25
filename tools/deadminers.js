// Dead-miner audit (playtest 17): how often does a grandmaster buy a fragile miner (< 15 hp) that
// dies without ever reaching the mining band (sectors 3-5), and was that purchase its top-scored
// move or a variety pick? Plays the given config as red against several opponents.
//   node tools/deadminers.js '{cfg}' [games per opponent=6] [--opps user16,user5,pol:smart,gm] [--max 40]

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, SimError } from '../js/sim.js';
import { chooseGrandmaster } from '../js/grandmaster.js';
import { TEMPLATES } from '../js/templates.js';
import { makeBot, workerCount } from './match.js';
import { mulberry32 } from './rng.js';

const ORE_GAIN = n => (n % 3 === 0 ? n / 3 : 0) + (n % 9 === 0 ? n / 3 : 0) + (n % 27 === 0 ? n / 3 : 0);
const fragileMiner = n => n && ORE_GAIN(n) && TEMPLATES[n].health < 15;

function game({ cfg, opp, seed, maxTurns }) {
    const rng = mulberry32(seed);
    const blue = makeBot(opp, null, 0.1);
    const S = newSimState();
    const memo = { blue: {}, red: {} };
    const tracked = []; // { ship, turn, variety, inBand }
    const known = new Set();
    try {
        while (!S.over && S.turn <= maxTurns) {
            const b = blue(S, 'blue', rng, memo.blue) || 0;
            const out = [];
            const r = chooseGrandmaster(S, 'red', { cfg, memo: memo.red, rng, out });
            // top-scored first move (skip and saving both start with 0)
            let top = null;
            for (const e of out) if (!top || e.score > top.score) top = e;
            const variety = top && (top.plan.saveFor ? 0 : top.plan.first) !== r;
            const turn = S.turn;
            stepTurn(S, b, r);
            for (const s of S.red.ships) {
                if (known.has(s)) continue;
                known.add(s);
                if (fragileMiner(s.number) && s.number === r) tracked.push({ ship: s, turn, n: r, variety, inBand: false });
            }
            for (const t of tracked) if (S.red.ships.includes(t.ship) && t.ship.sector >= 3 && t.ship.sector <= 5) t.inBand = true;
        }
    } catch (e) { if (!(e instanceof SimError)) throw e; }
    return tracked.map(t => ({
        opp, n: t.n, turn: t.turn, variety: t.variety,
        dead: !S.red.ships.includes(t.ship) && !t.inBand,
    }));
}

if (!isMainThread) {
    parentPort.postMessage(workerData.jobs.map(game).flat());
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const opps = flag('--opps', 'user16,user5,user14,pol:smart,gm').split(',');
    const maxTurns = Number(flag('--max', 40));
    const cfg = JSON.parse(args[0] ?? '{}');
    const games = Number(args[1] ?? 6);
    const jobs = [];
    for (const opp of opps) for (let g = 0; g < games; g++) jobs.push({ cfg, opp, seed: 31000 + g, maxTurns });
    const threads = workerCount(jobs.length);
    const chunks = Array.from({ length: threads }, () => []);
    jobs.forEach((j, i) => chunks[i % threads].push(j));
    const res = (await Promise.all(chunks.map(c => new Promise(ok => {
        const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
        w.on('message', ok); w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
    })))).flat();
    const line = (label, xs) => {
        const d = xs.filter(x => x.dead).length;
        console.log(`${label.padEnd(16)} fragile miners ${String(xs.length).padStart(3)}  died unmined ${String(d).padStart(3)} (${xs.length ? (100 * d / xs.length).toFixed(0) : 0}%)`);
    };
    for (const opp of opps) line(opp, res.filter(x => x.opp === opp));
    line('top choice', res.filter(x => !x.variety));
    line('variety pick', res.filter(x => x.variety));
    line('all', res);
    const early = res.filter(x => x.dead).map(x => `t${x.turn}${x.variety ? '*' : ''}`);
    console.log(`dead ones (turn bought, * = variety): ${early.join(' ')}`);
}
