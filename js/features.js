// Position features for learned evaluators: what a player glances at, from `side`'s point of view.
// Mine and theirs side by side, so a fitted model can weigh each (and their differences).

import { enemyOf } from './sim.js';
import { economy, calcOreIncome } from './economy.js';

export const FEATURE_NAMES = [
    'turn',
    'hp', 'hpThem',
    'income', 'incomeThem',
    'oreLog', 'oreLogThem',
    'econ', 'econThem',            // ship size one turn's income buys at current ore
    'bank', 'bankThem',            // money in turns of income
    'mining', 'miningThem',        // ore per turn being mined right now
    'powHome', 'powMid', 'powFar', // my strength (sqrt(attack × hp)) near my base / centre / near theirs
    'powHomeThem', 'powMidThem', 'powFarThem', // theirs, same zones from my side (Far = near their base)
    'front', 'frontThem',          // how far my / their most advanced ship has come (0..6)
];

export function positionFeatures(S, side) {
    const opp = enemyOf(side);
    const dist = sector => (side === 'blue' ? sector - 1 : 7 - sector); // 0 = my base .. 6 = theirs
    const zone = d => (d <= 1 ? 0 : d <= 4 ? 1 : 2);
    const pow = { [side]: [0, 0, 0], [opp]: [0, 0, 0] };
    let front = 0, frontThem = 0;
    for (const owner of [side, opp]) {
        for (const s of S[owner].ships) {
            if (s.health <= 0) continue;
            const d = dist(s.sector);
            pow[owner][zone(d)] += Math.sqrt(Math.max(0.5, s.attack) * s.health);
            if (owner === side) front = Math.max(front, d);
            else frontThem = Math.max(frontThem, 6 - d);
        }
    }
    const me = S[side], them = S[opp];
    const econ = x => (x.income > 0 ? economy(x.income, x.ore) : 0);
    return [
        S.turn,
        Math.max(0, me.hp), Math.max(0, them.hp),
        me.income, them.income,
        Math.log1p(Math.max(0, me.ore)), Math.log1p(Math.max(0, them.ore)),
        econ(me), econ(them),
        me.money / Math.max(1, me.income), them.money / Math.max(1, them.income),
        calcOreIncome(side, S), calcOreIncome(opp, S),
        ...pow[side], ...pow[opp],
        front, frontThem,
    ];
}
