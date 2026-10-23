// Replays a real game from both build orders and shows what grandmaster thinks of
// each of red's turns: its top moves and scores, and what red actually played.
//   node tools/analyze.js "<blue build order>" "<red build order>" [--from 1] [--to 999] [--cfg '{json}']
// Build orders are the comma lists the game shows: type ? into the box between the two
// command cards for blue's; red's is on its base card (Advanced UI).

import { newSimState, stepTurn } from '../js/sim.js';
import { chooseGrandmaster, GM_DEFAULTS } from '../js/grandmaster.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const from = Number(flag('--from', 1));
const to = Number(flag('--to', 999));
const cfg = { chaos: 0, ...JSON.parse(flag('--cfg', '{}')) };
const parse = s => s.split(/[\s,]+/).filter(Boolean).map(Number);
const blue = parse(args[0] ?? '');
const red = parse(args[1] ?? '');

const S = newSimState();
const memo = {};
const board = side => {
    const by = {};
    for (const s of S[side].ships) (by[s.sector] ??= []).push(`${s.number}(${Math.round(s.health)})`);
    return Object.keys(by).sort().map(k => `${k}:[${by[k].join(' ')}]`).join(' ') || '-';
};
for (let t = 0; t < Math.max(blue.length, red.length) && !S.over; t++) {
    const bp = blue[t] ?? 0;
    const rp = red[t] ?? 0;
    if (S.turn >= from && S.turn <= to) {
        const out = [];
        const weights = [];
        const would = chooseGrandmaster(S, 'red', { out, cfg, memo, weightsOut: weights });
        out.sort((x, y) => y.score - x.score);
        const rank = out.findIndex(e => e.plan.first === rp && !e.plan.saveFor) + 1;
        const side = s => `hp ${S[s].hp.toFixed(0)} $${S[s].money.toFixed(1)} inc ${S[s].income} ore ${S[s].ore.toFixed(0)}`;
        console.log(`t${S.turn}  blue ${side('blue')} buys ${bp} | red ${side('red')} buys ${rp}${rank ? ` (its #${rank} pick)` : ''}  -> grandmaster would play ${would}`);
        console.log(`     blue ${board('blue')}`);
        console.log(`     red  ${board('red')}`);
        console.log(`     grandmaster now: ${out.slice(0, 6).map(e => `${e.plan.saveFor ? 'save' + e.plan.saveFor : e.plan.first}:${Math.round(e.score)}`).join('  ')}`);
        if (weights.length) {
            const names = (cfg.theirs ?? GM_DEFAULTS.theirs);
            console.log(`     reads blue as: ${names.map((n, j) => [n, weights[j]]).filter(([, x]) => x > (cfg.observePrior ?? GM_DEFAULTS.observePrior) + 0.01).map(([n, x]) => `${n} ${x.toFixed(1)}`).join(', ') || '-'}`);
        }
    }
    stepTurn(S, bp, rp);
}
console.log(S.over ? `winner ${S.over} at turn ${S.turn}` : `still going at turn ${S.turn}: blue hp ${S.blue.hp.toFixed(0)}, red hp ${S.red.hp.toFixed(0)}`);
