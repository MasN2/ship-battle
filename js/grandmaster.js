// Grandmaster: a search AI. For every move it could make this turn (buy a ship,
// skip, or save up for a bigger ship) it plays the game forward in the headless
// rules (sim.js) against a few plausible replies, scores where each line ends up,
// and takes the best. It plays by the player's rules: same money, loans and ore,
// no peeking at the player's pick this turn, and only ships the deploy bar would
// show (see visibleShips).

import { SHIP_NUMS, TEMPLATES } from './templates.js';
import { cost, economy, maxLoanFor } from './economy.js';
import { cloneState, stepTurn, canAfford, enemyOf, SimError } from './sim.js';

export const GM_DEFAULTS = {
    depth: 30,          // turns each line is played forward
    saveTurns: 4,       // consider skipping to afford a ship up to this many turns away
    // Follow-up styles tried for itself after the move (the best one counts), and the
    // opponent styles each line is tested against. 'wild' is the Normal AI's random pick;
    // listing it three times tests three different random opponents.
    // 'turtle'/'value' (traders, then Frigate-style fighters stacking at home for a counterwave)
    // came from a playtest loss; adding them took it from 68 to 96 wins vs that build order.
    mine: ['spend', 'smart', 'econ', 'mine', 'turtle', 'value'],
    theirs: ['spend', 'smart', 'econ', 'mine', 'wild', 'wild', 'wild', 'turtle', 'value'],
    agg: 'mean',        // how scores across their styles combine: 'mean' | 'min'
    horizon: 40,        // turns of future spending that income and ore are worth
    // A line that ends in a win (loss) scores this much (less), sooner is bigger. Big enough that
    // results dominate, small enough that the position still counts: 3e4 beat 1e6 113-87.
    // Lower values (3e3, 1e3) build more economy but lost in round robins.
    winScore: 3e4,
    incomeW: 1,         // weight on income's share of that...
    oreW: 1,            // ...and on the ore stock's share
    hpW: 1,             // value of a point of base hp...
    fear: 40,           // ...plus fear·ln(1+hp): the last points matter most
    shipW: 1,           // value of ships on the board (√(attack·health) each)
    advanceW: 0.04,     // per sector a ship has pushed toward the enemy
    visibleOnly: true,  // limit itself to the ships the player's deploy bar shows
    chaos: 0.5,         // opening randomness, as a share of the best-to-4th-best score gap
    chaosTurns: 8,      // turns it applies to
};

/** The ships render.js shows on the deploy bar for this side's income and ore. */
export function visibleShips(S, side) {
    const inc = S[side].income;
    const ore = S[side].ore;
    const c = n => cost(n, ore);
    const lim = {
        hideAbove10: c(10) > 3.2 * inc, hideAbove20: c(20) > 3 * inc, hideAbove30: c(30) > 2.8 * inc,
        hideAbove40: c(40) > 2.6 * inc, hideBelow10: c(40) <= 2.6 * inc, hideAbove50: c(50) > 2.5 * inc,
        hideBelow20: c(50) <= 2.5 * inc, hideAbove60: c(60) > 2.4 * inc, hideBelow30: c(60) <= 2.4 * inc,
        hideAbove70: c(70) > 4 * inc,
    };
    return SHIP_NUMS.filter(n => !(
        (lim.hideAbove10 && n >= 10) || (lim.hideAbove20 && n >= 20) || (lim.hideAbove30 && n >= 30) ||
        (lim.hideAbove40 && n >= 40) || (lim.hideBelow10 && n <= 10) || (lim.hideAbove50 && n >= 50) ||
        (lim.hideBelow20 && n <= 20) || (lim.hideAbove60 && n >= 60) || (lim.hideBelow30 && n <= 30) ||
        (lim.hideAbove70 && n >= 70)
    ));
}

function shipMenu(S, side, cfg) {
    return cfg.visibleOnly ? visibleShips(S, side) : SHIP_NUMS;
}

/** Rollout policy: the biggest ship affordable without a loan. */
function greedy(S, side, cfg) {
    const menu = shipMenu(S, side, cfg);
    const me = S[side];
    for (let i = menu.length - 1; i >= 0; i--) if (cost(menu[i], me.ore) <= me.money) return menu[i];
    return 0;
}

const INCOME_GAIN = n => (n % 7 === 0 ? n / 7 : 0) + (n % 49 === 0 ? n / 7 : 0);
const ORE_GAIN = n => (n % 3 === 0 ? n / 3 : 0) + (n % 9 === 0 ? n / 3 : 0) + (n % 27 === 0 ? n / 3 : 0);

/** Enemy ships within `reach` sectors of this side's base. */
function threatened(S, side, reach) {
    const base = side === 'blue' ? 1 : 7;
    return S[enemyOf(side)].ships.some(s => Math.abs(s.sector - base) <= reach);
}

/** Rollout policy factory: save for the best `gain` per cost, fight when pressed. */
function investor(gain, minHp, fallback = greedy) {
    return (S, side, cfg) => {
        const me = S[side];
        if (me.hp < minHp || threatened(S, side, 3)) return fallback(S, side, cfg);
        let best = 0;
        let bestRate = 0;
        for (const n of shipMenu(S, side, cfg)) {
            const g = gain(n);
            if (!g) continue;
            const rate = g / cost(n, me.ore);
            if (rate > bestRate) { bestRate = rate; best = n; }
        }
        if (!best) return fallback(S, side, cfg);
        return cost(best, me.ore) <= me.money ? best : 0;
    };
}

/** Rollout policy: the sturdiest fighter affordable without a loan (most attack × health),
    e.g. Frigates over Missiles. Bought every turn, these pile up inside the home sector,
    where they can't be targeted, and roll out as a counterwave. */
function value(S, side, cfg) {
    const me = S[side];
    let best = 0;
    let bestV = 0;
    for (const n of shipMenu(S, side, cfg)) {
        if (cost(n, me.ore) > me.money) break;
        if (INCOME_GAIN(n)) continue;
        const t = TEMPLATES[n];
        const v = t.attack * t.health;
        if (v >= bestV) { bestV = v; best = n; }
    }
    return best;
}

/** What the enemy fleet looks like, for sizing up counters. */
function fleetStats(ships) {
    const bySec = new Array(9).fill(0);
    let atk = 0, hp = 0, n = 0;
    for (const s of ships) {
        if (s.health <= 0) continue;
        bySec[s.sector]++;
        atk += s.attack; hp += s.health; n++;
    }
    return { crowd: Math.max(0, ...bySec), avgAtk: n ? atk / n : 2, avgHp: n ? hp / n : 15, n };
}

/** A ship's fighting power against that fleet: √(damage dealt per turn × hits it can take). */
function matchupPower(num, f) {
    const t = TEMPLATES[num];
    let dmg = f.n ? Math.min(t.attack, Math.max(f.avgHp, 1)) : t.attack; // overkill is wasted
    if (num % 5 === 0) dmg += (num / 5) * Math.max(1, f.crowd) * (num % 25 === 0 ? 2 : 1);
    if (num % 17 === 0) dmg += num / 17;
    const armor = num % 19 === 0 ? num / 19 : 0;
    const perHit = Math.max(0.2, f.avgAtk - armor);
    const life = t.health * (f.avgAtk / perHit);
    return Math.sqrt(Math.max(0.1, dmg) * life);
}

/** Rollout policy: of the ships affordable without a loan, the best counter to their fleet. */
function smart(S, side, cfg) {
    const me = S[side];
    const f = fleetStats(S[enemyOf(side)].ships);
    let best = 0;
    let bestV = 0;
    for (const n of shipMenu(S, side, cfg)) {
        if (cost(n, me.ore) > me.money) break; // menu is ascending in number, and so in cost
        const v = matchupPower(n, f);
        if (v > bestV) { bestV = v; best = n; }
    }
    return best;
}

/** Rollout policy: bank until the purse buys a ship worth ~3 turns of income, unless pressed. */
function big(S, side, cfg) {
    const me = S[side];
    if (me.money < 3 * me.income && !threatened(S, side, 2)) return 0;
    return greedy(S, side, cfg);
}

/** Rollout policy: the live Normal AI's weighted-random pick (pickAIR in ai.js), from
    either side, on a seeded random stream so rollouts stay repeatable. */
function wild(S, side, cfg, rand) {
    const me = S[side];
    const foe = S[enemyOf(side)];
    const rel = sec => (side === 'red' ? sec : 8 - sec);
    const foeNear = foe.ships.some(s => s.sector === rel(5));
    const ownCenter = me.ships.some(s => s.sector === rel(3));
    const items = [];
    const weights = [];
    let total = 0;
    for (const num of [...SHIP_NUMS, 0]) {
        if (num && cost(num, me.ore) > me.money + 4) continue;
        let w = num > 3 ? cost(num, 0) : 5;
        if (num % 3 === 0) { w *= 2; if (foeNear) w = 0; }
        if (num % 7 === 0 && num !== 0) { w *= (me.hp - 20) / Math.min(me.income, 10); if (foeNear) w = 0; }
        if (num === 0 && cost(7, me.ore) <= me.money + 4) w = 0;
        if (num % 17 === 0 && num !== 0) { w *= (40 * (num / 17) / foe.hp) ** 4; if (foeNear) w = 0; }
        if (num % 5 === 0 && num > 0) w *= (foe.ships.length ** 3) / 300;
        if (num % 3 !== 0 && num % 7 !== 0 && ownCenter) w = 0;
        if (num >= 67) w *= 1000000;
        w = Math.max(0, w - 2 * Math.max(0, cost(num, me.ore) - me.money));
        items.push(num);
        weights.push(w);
        total += w;
    }
    let r = rand() * total;
    for (let i = 0; i < items.length; i++) {
        if (r < weights[i]) return canAfford(S, side, items[i]) ? items[i] : 0;
        r -= weights[i];
    }
    return 0;
}

export const POLICIES = {
    wild,
    spend: greedy,
    smart,
    econ: investor(INCOME_GAIN, 40),
    value,
    // Traders while nothing is near, then the sturdiest fighter every turn: the human
    // turtle-and-counterwave line that beat it in playtesting.
    turtle: investor(INCOME_GAIN, 40, value),
    mine: investor(ORE_GAIN, 40),
    big,
    skip: () => 0,
};

function sideValue(S, side, cfg) {
    const me = S[side];
    const hp = Math.max(0, me.hp);
    let v = cfg.hpW * hp + cfg.fear * Math.log1p(hp);
    // Income and ore, valued as the ship size they buy each turn over the horizon:
    // what the income buys at no ore, plus what the ore stock adds on top.
    const perTurn = me.income > 0 ? economy(me.income, me.ore) : 0;
    const bare = me.income > 0 ? economy(me.income, 0) : 0;
    const horizon = Math.max(8, cfg.horizon - 0.1 * S.turn);
    v += horizon * (cfg.incomeW * bare + cfg.oreW * (perTurn - bare));
    if (me.income > 0) v += me.money * (perTurn / me.income);
    let ships = 0;
    for (const s of me.ships) {
        if (s.health <= 0) continue;
        const advance = side === 'blue' ? s.sector - 1 : 7 - s.sector;
        ships += Math.sqrt(Math.max(0.5, s.attack) * s.health) * (1 + cfg.advanceW * advance);
    }
    return v + cfg.shipW * ships;
}

export function evaluate(S, side, cfg) {
    const v = sideValue(S, side, cfg) - sideValue(S, enemyOf(side), cfg);
    // Win sooner, lose later; the position still breaks ties, so a lost line keeps fighting.
    const W = cfg.winScore;
    if (S.over) return (S.over === side ? W - W / 1000 * S.turn : -W + W / 1000 * S.turn) + v;
    return v;
}

function plans(S, side, cfg) {
    const out = [{ first: 0 }];
    const me = S[side];
    for (const n of shipMenu(S, side, cfg)) {
        if (canAfford(S, side, n)) { out.push({ first: n }); continue; }
        if (cfg.saveTurns > 0 && me.income > 0) {
            // turns of saving until it's affordable (loan included, as canAfford counts it)
            const short = cost(n, me.ore) - me.money - maxLoanFor(me.income);
            const wait = Math.ceil(short / me.income);
            if (wait <= cfg.saveTurns) out.push({ first: 0, saveFor: n, wait });
        }
    }
    return out;
}

function seededRandom(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Plays `plan`, then my policy `mine`, against their policy `theirs`; scores the end. */
function rollout(S, side, plan, mine, theirs, cfg, stream = 0) {
    const sim = cloneState(S);
    const opp = enemyOf(side);
    const myPol = POLICIES[mine];
    const theirPol = POLICIES[theirs];
    // Every move is tested against the same random streams (one per opponent-style slot),
    // so lines differ only by the moves being compared.
    const rand = seededRandom(S.turn * 7919 + 17 + 104729 * stream);
    try {
        for (let d = 0; d < cfg.depth && !sim.over; d++) {
            let a;
            if (d === 0) a = plan.first;
            else if (plan.saveFor && d <= plan.wait) a = canAfford(sim, side, plan.saveFor) ? plan.saveFor : 0;
            else a = myPol(sim, side, cfg, rand);
            const b = theirPol(sim, opp, cfg, rand);
            if (side === 'blue') stepTurn(sim, a, b);
            else stepTurn(sim, b, a);
        }
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
        return -5e5; // a line that freezes the live game: avoid it
    }
    return evaluate(sim, side, cfg);
}

/**
 * The grandmaster's pick for `side` this turn (0 = skip).
 * opts.cfg overrides GM_DEFAULTS; opts.out, if an array, receives every plan's score.
 */
export function chooseGrandmaster(state, side, opts = {}) {
    const cfg = { ...GM_DEFAULTS, ...(opts.cfg || {}) };
    const S = cloneState(state);
    const rng = opts.rng || Math.random;
    const scored = [];
    for (const plan of plans(S, side, cfg)) {
        // Best follow-up style of mine, judged across their styles.
        let score = -Infinity;
        for (const mine of cfg.mine) {
            const scores = cfg.theirs.map((t, j) => rollout(S, side, plan, mine, t, cfg, j));
            const s = cfg.agg === 'min' ? Math.min(...scores) : scores.reduce((a, b) => a + b, 0) / scores.length;
            if (s > score) score = s;
        }
        if (opts.out) opts.out.push({ plan, score });
        scored.push({ plan, score });
    }
    // Opening chaos: early on, every move gets a random nudge sized to the gap between the
    // best and the 4th-best move, so close alternatives trade places and no single memorised
    // line beats it every game. Clearly worse moves are never picked.
    let jitter = 0;
    if (cfg.chaos > 0 && S.turn <= cfg.chaosTurns && scored.length > 1) {
        const sorted = scored.map(e => e.score).sort((a, b) => b - a);
        jitter = cfg.chaos * Math.min(sorted[0] - sorted[Math.min(3, sorted.length - 1)], 2000);
    }
    let best = 0;
    let bestScore = -Infinity;
    for (const { plan, score } of scored) {
        const s = score + (jitter ? rng() * jitter : 0);
        if (s > bestScore) { bestScore = s; best = plan.first; }
    }
    return best;
}
