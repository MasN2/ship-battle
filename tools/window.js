// Shows where the mining-window gate (cfg.mineWindow) overrides the search, in one game.
//   node tools/window.js '<cfg json>' [opponent=gm] [--seed 50000] [--side red]
import { newSimState, stepTurn, SimError, enemyOf } from '../js/sim.js';
import { chooseGrandmaster } from '../js/grandmaster.js';
import { makeBot } from './match.js';
import { mulberry32 } from './rng.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const seed = Number(flag('--seed', 50000));
const side = flag('--side', 'red');
const cfg = JSON.parse(args[0]);
const opp = makeBot(args[1] || 'gm', null, 0);
const rng = mulberry32(seed);
const S = newSimState();
const memo = {};
const ore = s => `${S[s].ore.toFixed(0)}`;
try {
    while (!S.over && S.turn <= 120) {
        const out = [];
        const me = chooseGrandmaster(S, side, { cfg, rng, windowOut: out, memo: {} });
        const them = opp(S, enemyOf(side), rng, memo) || 0;
        const w = out[0];
        const tag = w && w.rows ? ` ${w.mv !== w.rows[0] ? "WINDOW" : "w"} ${w.rows[0]}->${w.mv} val ${w.val.map(x => x.toFixed(0)).join('/')} worst ${w.worst.map(x => x.toFixed(0)).join('/')}` : '';
        console.log(`t${S.turn} me ${me} them ${them}  hp ${S[side].hp}/${S[enemyOf(side)].hp} ore ${ore(side)}/${ore(enemyOf(side))} inc ${S[side].income}/${S[enemyOf(side)].income}${tag}`);
        if (side === 'blue') stepTurn(S, me, them); else stepTurn(S, them, me);
    }
} catch (e) { if (!(e instanceof SimError)) throw e; }
console.log(`winner ${S.over} turn ${S.turn}`);
