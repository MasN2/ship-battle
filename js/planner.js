// The planner (playtests 28-30): decides from the real board instead of imagined scripted games.
// For each buy of mine and each plausible reply of theirs, the actual sim plays the board out
// for a few turns with nothing else bought (a clean read of the fight on the board now), and a
// ledger in money terms records what happened:
//   ore mined by each side           priced as income-equivalent at the tiers its income reaches
//   ships destroyed                  at their price; mine that die past the centre (crashing into
//                                    their base) count extra: that HP feeds their counterwave
//   ships still alive at the end     at their price, discounted if stranded beyond the centre
//   income gained                    over the rest of the game
//   base damage                      only as it approaches lethal (chip damage is nearly worthless)
//   money banked                     at face value
// Their replies are then mixed the way an opponent hunting for the counter would (regret
// matching on the table), and the buy with the best expected ledger is played.

import { cloneState, stepTurn, canAfford, enemyOf, costOf, SimError } from './sim.js';
import { economy } from './economy.js';

const ORE_GAIN = n => (n % 3 === 0 ? n / 3 : 0) + (n % 9 === 0 ? n / 3 : 0) + (n % 27 === 0 ? n / 3 : 0);
const INCOME_GAIN = n => (n % 7 === 0 ? n / 7 : 0) + (n % 49 === 0 ? n / 7 : 0);

export const PLANNER_DEFAULTS = {
    turns: 8,            // turns each (my buy, their reply) pair is played out
    restTurns: 25,       // how long income / ore keep paying (the rest of a typical game)
    crash: 0.6,          // extra cost (share of price) for my HP lost past the centre
    stranded: 0.3,       // discount on my surviving ships beyond the centre
    lethal: 400,         // value of their base at 0, falling off exponentially with its hp
    lethalScale: 35,     // hp scale of that falloff
    iters: 200,          // regret-matching iterations
    cont: null,          // style both sides follow after the first turn (null = nothing more is bought)
};

const dist = (side, sector) => (side === 'blue' ? sector - 1 : 7 - sector); // 0 = own base .. 6 = theirs

/** Money value of an ore stock change for this income: income-equivalent × restTurns. */
function oreMoney(inc, ore, dOre, P) {
    if (dOre <= 0 || inc <= 0) return 0;
    const r = (i, o) => [1, 2, 4].reduce((t, k) => t + economy(k * i, o) / k, 0) / 3;
    const perIncome = Math.max(1e-6, r(inc + 1, ore) - r(inc, ore));
    return ((r(inc, ore + dOre) - r(inc, ore)) / perIncome) * P.restTurns;
}

/** Plays one pair out and returns my ledger minus theirs. */
function ledger(S, side, mine, theirs, P) {
    const opp = enemyOf(side);
    const sim = cloneState(S);
    // ships priced at what their owner pays now, so buying is neutral until the ship does something
    const price = s => costOf(s.number, ore0[ownerOf.get(s)] ?? 0);
    const ownerOf = new Map();
    const v = { [side]: 0, [opp]: 0 };
    const ore0 = { [side]: S[side].ore, [opp]: S[opp].ore };
    const tag = () => { for (const who of [side, opp]) for (const x of sim[who].ships) if (!ownerOf.has(x)) ownerOf.set(x, who); };
    const inc0 = { [side]: S[side].income, [opp]: S[opp].income };
    const money0 = { [side]: S[side].money, [opp]: S[opp].money };
    try {
        for (let d = 0; d < P.turns && !sim.over; d++) {
            tag();
            const before = { [side]: new Set(sim[side].ships), [opp]: new Set(sim[opp].ships) };
            const pol = P.cont ? P.policies[P.cont] : null;
            const a = d === 0 ? mine : pol ? pol(sim, side, P.gmCfg, () => 0.5) : 0;
            const b = d === 0 ? theirs : pol ? pol(sim, opp, P.gmCfg, () => 0.5) : 0;
            if (side === 'blue') stepTurn(sim, a, b);
            else stepTurn(sim, b, a);
            // ships destroyed this turn
            for (const who of [side, opp]) {
                const alive = new Set(sim[who].ships.filter(s => s.health > 0));
                for (const s of before[who]) {
                    if (alive.has(s)) continue;
                    const pastCentre = dist(who, s.sector) >= 4;
                    v[who] -= price(s) * (1 + (pastCentre ? P.crash : 0));
                }
            }
        }
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
        return -1e6;
    }
    tag();
    for (const s of S[side].ships) ownerOf.set(s, side);
    for (const s of S[opp].ships) ownerOf.set(s, opp);
    for (const who of [side, opp]) {
        const x = sim[who];
        // ships still alive, at their price (the bought one is now on the board, so buying is
        // neutral until it does something)
        for (const s of x.ships) {
            if (s.health <= 0) continue;
            const frac = s.health / s.template.health;
            const stranded = dist(who, s.sector) >= 4 ? 1 - P.stranded : 1;
            v[who] += price(s) * Math.min(1, frac) * stranded;
        }
        // ships alive at the start were already counted as assets; remove that baseline
        for (const s of S[who].ships) if (s.health > 0) v[who] -= price(s) * Math.min(1, s.health / s.template.health) * (dist(who, s.sector) >= 4 ? 1 - P.stranded : 1);
        // economy: money, income gained, ore mined
        v[who] += x.money - money0[who];
        v[who] += (x.income - inc0[who]) * P.restTurns;
        v[who] += oreMoney(Math.max(1, inc0[who]), ore0[who], x.ore - ore0[who], P);
        // base: only near-lethal damage matters
        const hp = Math.max(0, x.hp);
        v[who] -= P.lethal * Math.exp(-hp / P.lethalScale);
        if (sim.over === who) v[who] += 5 * P.lethal;
    }
    return v[side] - v[opp];
}

export function plannerChoice(S, side, cfg, rng = Math.random, out = null) {
    const P = { ...PLANNER_DEFAULTS, ...(cfg.planner || {}), policies: cfg.policies, gmCfg: cfg };
    const opp = enemyOf(side);
    const menu = cfg.menu(S, side);
    const mineMoves = [0, ...menu.filter(n => canAfford(S, side, n))];
    const theirMoves = [0, ...cfg.menu(S, opp).filter(n => canAfford(S, opp, n))];
    const M = mineMoves.map(m => theirMoves.map(r => ledger(S, side, m, r, P)));
    // regret matching: their mix of replies that best counters me (zero-sum on the ledger)
    const m = mineMoves.length, n = theirMoves.length;
    const rA = new Array(m).fill(0), rB = new Array(n).fill(0), sumB = new Array(n).fill(0);
    const strat = r => { const p = r.map(x => Math.max(0, x)); const t = p.reduce((a, b) => a + b, 0); return t > 0 ? p.map(x => x / t) : r.map(() => 1 / r.length); };
    for (let it = 0; it < P.iters; it++) {
        const pa = strat(rA), pb = strat(rB);
        for (let j = 0; j < n; j++) sumB[j] += pb[j];
        const ua = M.map(row => row.reduce((t, x, j) => t + x * pb[j], 0));
        const ub = theirMoves.map((_, j) => -M.reduce((t, row, i) => t + row[j] * pa[i], 0));
        const va = ua.reduce((t, x, i) => t + x * pa[i], 0), vb = ub.reduce((t, x, j) => t + x * pb[j], 0);
        for (let i = 0; i < m; i++) rA[i] += ua[i] - va;
        for (let j = 0; j < n; j++) rB[j] += ub[j] - vb;
    }
    const tot = sumB.reduce((a, b) => a + b, 0);
    const value = mineMoves.map((mv, i) => ({ mv, v: M[i].reduce((t, x, j) => t + x * sumB[j] / tot, 0) }));
    value.sort((a, b) => b.v - a.v);
    if (out) out.push(...value);
    return value;
}
