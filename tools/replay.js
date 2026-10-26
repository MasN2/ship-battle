// Plays one tournament game and prints it turn by turn.
//   node tools/replay.js <botA> <botB> <seed> [--a '{json}'] [--b '{json}'] [--side red|blue]
// Seeds match tourney.js: game i there uses seed (seed0*7919 + i), A red when i is even.

import { newSimState, stepTurn } from '../js/sim.js';
import { mulberry32 } from './rng.js';
import { normalBot, scriptBot, greedEconBot, HUMAN_ORDERS } from './bots.js';
import { chooseGrandmaster } from '../js/grandmaster.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const aCfg = JSON.parse(flag('--a', 'null'));
const bCfg = JSON.parse(flag('--b', 'null'));
const [aName, bName, seedArg] = args;
const seed = Number(seedArg);
const aSide = flag('--side', null) ?? ((seed % 7919) % 2 === 0 ? 'red' : 'blue');

const top = {};
function makeBot(name, cfg, label) {
    switch (name) {
        case 'normal': return normalBot;
        case 'econ': return greedEconBot;
        case 'alice': return scriptBot(HUMAN_ORDERS.alice_blue);
        case 'alice-red': return scriptBot(HUMAN_ORDERS.alice_red);
        case 'gm': return (S, side, rng, memo) => {
            const out = [];
            const pick = chooseGrandmaster(S, side, { rng, memo, cfg, out });
            out.sort((x, y) => y.score - x.score);
            top[label] = out.slice(0, 3).map(e => `${e.plan.saveFor ? `save${e.plan.saveFor}` : e.plan.first}:${Math.round(e.score)}`).join(' ');
            return pick;
        };
    }
    throw new Error(name);
}

const rng = mulberry32(seed);
const bSide = aSide === 'red' ? 'blue' : 'red';
const bots = { [aSide]: makeBot(aName, aCfg, 'A'), [bSide]: makeBot(bName, bCfg, 'B') };
const S = newSimState();
const board = side => {
    const by = {};
    for (const s of S[side].ships) (by[s.sector] ??= []).push(s.number);
    return Object.keys(by).sort().map(k => `${k}:[${by[k].join(' ')}]`).join(' ');
};
console.log(`A=${aName} plays ${aSide}`);
while (!S.over && S.turn <= 200) {
    for (const k in top) delete top[k];
    const bp = bots.blue(S, 'blue', rng, {}) || 0;
    const rp = bots.red(S, 'red', rng, {}) || 0;
    const line = side => `${side[0].toUpperCase()} hp ${S[side].hp.toFixed(0)} $${S[side].money.toFixed(1)} inc ${S[side].income} ore ${S[side].ore.toFixed(0)}`;
    console.log(`t${S.turn}  ${line('blue')} buys ${bp} | ${line('red')} buys ${rp}`);
    console.log(`     blue ${board('blue')}   red ${board('red')}`);
    for (const [k, v] of Object.entries(top)) console.log(`     ${k} top: ${v}`);
    stepTurn(S, bp, rp);
}
console.log(`winner ${S.over} at turn ${S.turn}`);
