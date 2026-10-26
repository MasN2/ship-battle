// Intuition: a learned bias on top of grandmaster's search. A glance at the board, with no
// lookahead: "a big wave is coming, so no miners", "my counterwave is breaking out, so now
// miners", "my attack looks lethal, double down", "my attack is failing, traders/missiles".
// Each candidate move gets  sum over (trait, situation) of  weight · trait(move) · situation(board),
// in units of INTUITION_UNIT score points. The weights are trained by mirror duels
// (tools/train-intuition.js) and live in intuition-weights.js.

import { TEMPLATES } from './templates.js';
import { cost, economy } from './economy.js';
import { enemyOf } from './sim.js';

export const INTUITION_UNIT = 1000;

/** What kind of purchase a move is. */
export const TRAITS = ['skip', 'econ', 'miner', 'missile', 'size', 'pricey', 'armor', 'siege', 'carrier'];

/** What the board looks like from `side`'s chair. */
export const SITUATIONS = [
    'always', 'incoming', 'enemyWave', 'breakout', 'lethal', 'failing', 'econGap', 'myHp', 'theirHp',
    'banked', 'stage',
];

export function moveTraits(n, S, side) {
    if (!n) return [1, 0, 0, 0, 0, 0, 0, 0, 0];
    const t = TEMPLATES[n];
    const me = S[side];
    const econ = (n % 7 === 0 ? n / 7 : 0) + (n % 23 === 0 ? 3 * n / 23 : 0);
    const ore = (n % 3 === 0 ? n / 3 : 0) + (n % 9 === 0 ? n / 3 : 0) + (n % 27 === 0 ? n / 3 : 0);
    return [
        0,
        Math.min(3, econ),
        Math.min(3, ore / 3),
        n % 5 === 0 ? Math.min(3, n / 10) : 0,
        Math.min(4, Math.sqrt(t.attack * t.health) / 10),
        Math.min(4, cost(n, me.ore) / Math.max(1, me.income)),
        n % 19 === 0 ? 1 : 0,
        n % 17 === 0 ? 1 : 0,
        n % 13 === 0 ? 1 : 0,
    ];
}

const clip = (x, hi = 3) => Math.max(-hi, Math.min(hi, x));

export function situation(S, side) {
    const opp = enemyOf(side);
    const adv = (s, owner) => (owner === 'blue' ? s.sector - 1 : 7 - s.sector); // 0 = own base
    let myHomeAtk = 0, myMidHp = 0, myFwdAtk = 0, myFwdHp = 0;
    for (const s of S[side].ships) {
        if (s.health <= 0) continue;
        const a = adv(s, side);
        if (a === 0) myHomeAtk += s.attack;
        else if (a <= 3) myMidHp += s.health;
        else { myFwdAtk += s.attack; myFwdHp += s.health; }
    }
    let theirNearAtk = 0, theirNearHp = 0, theirHomeAtk = 0;
    for (const s of S[opp].ships) {
        if (s.health <= 0) continue;
        const a = adv(s, opp);
        if (a >= 3) { theirNearAtk += s.attack; theirNearHp += s.health; } // in my half
        if (a === 0) theirHomeAtk += s.attack;
    }
    const me = S[side], them = S[opp];
    const pt = x => (x.income > 0 ? economy(x.income, x.ore) : 0);
    return [
        1,
        clip(theirNearAtk / (myHomeAtk + 4)),                  // incoming wave vs my home defence
        clip(theirNearHp / 100),                               // how big their wave is
        clip(theirNearHp < 20 ? myMidHp / 60 : 0),            // my counterwave is out and unopposed
        clip(myFwdAtk * 3 / Math.max(10, them.hp)),           // my attack could finish them
        clip(myFwdHp > 0 ? theirHomeAtk / (myFwdHp / 5 + 1) : 0), // my attack is being shredded
        clip((pt(me) - pt(them)) / (pt(them) + 1)),           // economy lead (+) or deficit (-)
        Math.max(0, me.hp) / 160,
        Math.max(0, them.hp) / 160,
        clip(me.money / Math.max(1, me.income) / 4),          // turns of income banked
        Math.min(2, S.turn / 40),
    ];
}

/** Bias (in score points) for playing n now. W is { 'trait:situation': weight }. */
export function intuitionBias(W, n, S, side, sit) {
    if (!W) return 0;
    const tr = moveTraits(n, S, side);
    let v = 0;
    for (let i = 0; i < TRAITS.length; i++) {
        if (!tr[i]) continue;
        for (let j = 0; j < SITUATIONS.length; j++) {
            const w = W[`${TRAITS[i]}:${SITUATIONS[j]}`];
            if (w) v += w * tr[i] * sit[j];
        }
    }
    return v * INTUITION_UNIT;
}

export const INTUITION_KEYS = TRAITS.flatMap(t => SITUATIONS.map(s => `${t}:${s}`));
