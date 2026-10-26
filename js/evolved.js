// Evolved evaluation: a wide set of position features, each with a learned weight, tuned by
// AI-vs-AI evolution (tools/evolve.js) instead of by hand. The weights live in
// evolved-weights.js. evolvedBot uses it with one turn of lookahead: for each purchase it
// plays one turn (opponent skipping) and keeps the purchase whose result scores best.

import { cost, economy, calcOreIncome } from './economy.js';
import { cloneState, stepTurn, canAfford, enemyOf, SimError } from './sim.js';
import { visibleShips } from './grandmaster.js';

/** Feature names, in order. Each is measured for one side; see sideFeatures. */
export const FEATURES = [
    'hp', 'lnHp', 'danger', 'income', 'perTurn', 'lnPerTurn', 'ore', 'lnOre', 'money', 'oreRate',
    'armor', 'count', 'atk', 'health', 'worth', 'lanchester', 'homeAtk', 'homeHp', 'midAtk', 'midHp',
    'fwdAtk', 'fwdHp', 'missile', 'armorShips', 'siege', 'carrier', 'growth', 'threatIn', 'incomeLeft',
    'perTurnLeft', 'econShips', 'miners',
];

const isIncome = n => n % 7 === 0;
const isMiner = n => n % 3 === 0;

/** Feature vector for `side`. Sectors are counted from its own base: 0 home, 6 enemy base. */
export function sideFeatures(S, side) {
    const me = S[side];
    const hp = Math.max(0, me.hp);
    const perTurn = me.income > 0 ? economy(me.income, me.ore) : 0;
    const left = Math.max(0, 60 - S.turn);
    let count = 0, atk = 0, health = 0, worth = 0, homeAtk = 0, homeHp = 0, midAtk = 0, midHp = 0;
    let fwdAtk = 0, fwdHp = 0, missile = 0, armorShips = 0, siege = 0, carrier = 0, growth = 0;
    let econShips = 0, miners = 0;
    for (const s of me.ships) {
        if (s.health <= 0) continue;
        const n = s.template.number;
        const adv = side === 'blue' ? s.sector - 1 : 7 - s.sector;
        count++; atk += s.attack; health += s.health;
        worth += Math.sqrt(Math.max(0.5, s.attack) * s.health);
        if (adv === 0) { homeAtk += s.attack; homeHp += s.health; }
        else if (adv <= 3) { midAtk += s.attack; midHp += s.health; }
        else { fwdAtk += s.attack; fwdHp += s.health; }
        if (n % 5 === 0) missile += (n / 5) * (n % 25 === 0 ? 2 : 1);
        if (n % 19 === 0) armorShips += n / 19;
        if (n % 17 === 0) siege += n / 17;
        if (n % 13 === 0) carrier += 2 * n / 13;
        if (n % 23 === 0) growth += n / 23;
        if (isIncome(n)) econShips++;
        if (isMiner(n) && adv >= 2 && adv <= 4) miners++;
    }
    // Damage the enemy fleet can soon put on this side's base.
    const base = side === 'blue' ? 1 : 7;
    let threatIn = 0;
    for (const s of S[enemyOf(side)].ships) {
        if (s.health <= 0) continue;
        const reach = s.number % 11 === 0 ? 3 : 2;
        const d = Math.abs(s.sector - base);
        if (d <= reach) threatIn += s.attack;
        else if (d <= reach + 2) threatIn += 0.5 * s.attack;
    }
    return [
        hp, Math.log1p(hp), Math.max(0, 40 - hp), me.income, perTurn, Math.log1p(perTurn),
        me.ore, Math.log1p(me.ore), me.money, calcOreIncome(side, S),
        me.armor - 1, count, atk, health, worth, Math.sqrt(atk * health), homeAtk, homeHp, midAtk, midHp,
        fwdAtk, fwdHp, missile, armorShips, siege, carrier, growth, threatIn, me.income * left,
        perTurn * left, econShips, miners,
    ];
}

/** Starting weights: roughly the hand-made grandmaster evaluation. `me` scores my features,
    `opp` the opponent's (they start as the negation; evolution may make them asymmetric). */
export function seedWeights() {
    const me = Object.fromEntries(FEATURES.map(f => [f, 0]));
    Object.assign(me, { hp: 1, lnHp: 40, danger: 2, perTurn: 30, money: 0.5, oreRate: 2, armor: 10, worth: 1, perTurnLeft: 0.3 });
    const opp = Object.fromEntries(FEATURES.map(f => [f, -me[f]]));
    return { me, opp };
}

/** Score of a position for `side` under weights W (higher is better for `side`). */
export function evolvedEval(W, S, side) {
    if (S.over) return S.over === side ? 1e6 - 1000 * S.turn : -1e6 + 1000 * S.turn;
    const a = sideFeatures(S, side);
    const b = sideFeatures(S, enemyOf(side));
    let v = 0;
    for (let i = 0; i < FEATURES.length; i++) v += W.me[FEATURES[i]] * a[i] + W.opp[FEATURES[i]] * b[i];
    return v;
}

/** One-turn-lookahead bot over weights W: plays each affordable visible ship (or skip) for one
    turn against an opponent who skips, and keeps the best-scoring result. */
export function evolvedBot(W) {
    return (S, side) => {
        const menu = [0, ...visibleShips(S, side).filter(n => canAfford(S, side, n))];
        let best = 0;
        let bestV = -Infinity;
        for (const n of menu) {
            const T = cloneState(S);
            try {
                if (side === 'blue') stepTurn(T, n, 0); else stepTurn(T, 0, n);
            } catch (e) {
                if (e instanceof SimError) continue;
                throw e;
            }
            const v = evolvedEval(W, T, side);
            if (v > bestV) { bestV = v; best = n; }
        }
        return best;
    };
}


/** Cheaper evolvedBot for use inside grandmaster's rollouts: only skip, a trader and the
    `wide` most expensive affordable ships are tried. */
export function evolvedPolicy(W, wide = 5) {
    return (S, side) => {
        const ok = visibleShips(S, side).filter(n => canAfford(S, side, n));
        const menu = [0, ...ok.slice(-wide)];
        if (ok.includes(7) && !menu.includes(7)) menu.push(7);
        let best = 0;
        let bestV = -Infinity;
        for (const n of menu) {
            const T = cloneState(S);
            try {
                if (side === 'blue') stepTurn(T, n, 0); else stepTurn(T, 0, n);
            } catch (e) {
                if (e instanceof SimError) continue;
                throw e;
            }
            const v = evolvedEval(W, T, side);
            if (v > bestV) { bestV = v; best = n; }
        }
        return best;
    };
}
