// Grandmaster: a search AI. For every move it could make this turn (buy a ship,
// skip, or save up for a bigger ship) it plays the game forward in the headless
// rules (sim.js) against a few plausible replies, scores where each line ends up,
// and takes the best. It plays by the player's rules: same money, loans and ore,
// no peeking at the player's pick this turn, and only ships the deploy bar would
// show (see visibleShips).

import { SHIP_NUMS, TEMPLATES } from './templates.js';
import { economy as economyRaw, maxLoanFor, calcOreIncome } from './economy.js';

// economy() is a bisection over the price formula (~40 evaluations); positions repeat the same
// income/ore pairs endlessly, so remember results (same numbers, a fraction of the time).
const econMemo = new Map();
function economy(income, ore) {
    const key = income * 100003 + ore;
    let v = econMemo.get(key);
    if (v === undefined) {
        if (econMemo.size > 200000) econMemo.clear();
        v = economyRaw(income, ore);
        econMemo.set(key, v);
    }
    return v;
}
import { cloneState, stepTurn, canAfford, enemyOf, SimError, costOf } from './sim.js';
import { evolvedEval, evolvedPolicy, seedWeights } from './evolved.js';
import { EVOLVED_WEIGHTS } from './evolved-weights.js';
import { intuitionBias, situation } from './intuition.js';
import { INTUITION_WEIGHTS } from './intuition-weights.js';
import { bookKeys, bookBias, bookEvidence } from './book.js';
import { BOOK } from './book-data.js';
import { positionFeatures } from './features.js';
import { VALUE_NET } from './value-weights.js';

/** Learned win probability for `side` (js/value-weights.js, fitted by tools/fiteval.js). */
function netWinProb(S, side, N = VALUE_NET) {
    const all = positionFeatures(S, side);
    const f = N.use ? N.use.map(i => all[i]) : all;
    const x = f.map((v, i) => (v - N.mu[i]) / N.sd[i]);
    let z = N.b2;
    for (let i = 0; i < x.length; i++) z += N.wl[i] * x[i];
    for (let k = 0; k < N.W1.length; k++) {
        let a = N.b1[k];
        const w = N.W1[k];
        for (let i = 0; i < x.length; i++) a += w[i] * x[i];
        z += N.W2[k] * Math.tanh(a);
    }
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

const EVO = EVOLVED_WEIGHTS ?? seedWeights();

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
    agg: 'mean',        // how scores across their styles combine: 'mean' | 'cautious' | 'min' | 'risk'
    risk: 0.5,          // for agg 'risk': how much the spread across opponent styles counts against a move
    swarmShips: 40,     // above this many ships on the board, the lookahead shortens proportionally
    budgetMs: 2500,     // stop scoring further moves after this long and play the best so far
    horizon: 40,        // turns of future spending that income and ore are worth
    safeEcon: 0,        // stretch that horizon by up to ×(1 + safeEcon) while the base is safe
    investBias: 0,      // score credit per +1 income a move buys (see chooseGrandmaster)
    investSafe: false,  // scale that credit (and oreBias) by how safe the base is
    oreBias: 0,         // score credit per ore/turn a miner makes, while the board is open for it
    orePerCost: false,  // scale that credit by min(1, 5 / price) (ore per money, Driller = 1)
    deadMiner: 0,       // penalty (share of one imagined win flip) for a fragile miner when it can't reach the centre
    respect: false,     // judge pure-combat moves by their worst case over respected opponents:
                        // 'push' = only while my push holds their half, 'safe' = also whenever its
                        // base is safe (safety >= respectSafety), true = always
    respectSafety: 0.8,
    pushMiners: 0,      // in a push window, drop pure fighters cheaper than this many turns of income
    // A line that ends in a win (loss) scores this much (less), sooner is bigger. Big enough that
    // results dominate, small enough that the position still counts: 3e4 beat 1e6 113-87.
    // Lower values (3e3, 1e3) build more economy but lost in round robins.
    winScore: 3e4,
    trust: 1,           // per-turn discount on imagined wins/losses (see evaluate)
    opening: null,      // e.g. { style: 'turtle', turns: 8 }: play that style first (see chooseGrandmaster)
    intuition: false,   // learned move bias (js/intuition.js): true = trained weights, or an object
    intuitionScale: 1,  // multiplier on that bias
    leaf: 'hand',       // how a rollout's end is scored: 'hand' (sideValue), 'evolved' (js/evolved.js),
                        // or 'resolve' (play the board out with no purchases first, see resolveBoard)
    resolveTurns: 25,   // for leaf 'resolve': turns the board gets to play out
    resolveWin: 0.5,    // ...and how much a resolution that ends the game counts, as a share of winScore
    leafScale: 1,       // multiplier on the evolved score
    commitMargin: 0,    // a one-off move must beat the best whole style by this much (see chooseGrandmaster)
    regretW: 0,         // penalty weight on a move's downside when countered (see Regret in chooseGrandmaster)
    regretK: 2,         // ...averaged over its this-many biggest regrets
    advK: 2,            // agg 'adversary': mean of this many worst non-wild imagined opponents
    minerFate: 0,       // penalty (in imagined win/loss flips) × share of futures where a bought fragile miner dies unmined
    closeOut: 0,        // play a style's own move when that whole plan wins this share of winScore on average
    frontW: 0,          // points for where my lead ship stands, shaped by frontBell (0 = off)
    frontBell: [0, -0.5, -0.2, 1, -0.4, -0.8, -1], // by distance from my base: 0 = home .. 3 = centre .. 6 = their base
    tactical: false,    // v3.1: decide by the simultaneous-move tactics table (see tactics()), long view as influence
    tacticTurns: 6,     // turns each (my buy, their buy) pair is played out
    tacticPolicy: 'value', // how both sides play after that first turn in the table
    tacticIters: 300,   // regret-matching iterations
    longW: 0.1,         // weight of the long-horizon rollout score
    tacticTol: 30,      // variety window (score points) among the best tactical moves
    book: null,         // wizard lessons (true = js/book-data.js), see js/book.js
    bookW: 3000,        // points per 100% win-probability edge in the book
    bookTol: 0,
    bookEvidence: 4,    // ...counting only moves verified at least this often in such positions         // variety window in book win probability (0.1 = moves within 10% of the best)
    bookPrior: 8,       // a lesson verified n times counts n / (n + bookPrior): higher = fuzzier until confirmed
    oreIncomePerMoney: false, // scale that credit by ore per money relative to a Driller (capped at 1)
    oreIncomeTurns: 0,  // >0: credit miners as the income-equivalent of this many turns of their ore (replaces oreBias)
    oreTiers: null,     // spending rhythms (turns per buy) over which ore's discount is averaged, e.g. [1, 2, 4]
    respectSkip: false, // respect also holds skipping/saving to their worst case (they aren't investments)
    decidedCombat: false, // a decided imagined game scores base hp and ships only, not bank/income/ore
    lossDelay: 0,       // a decided loss scores this much better per turn it lies ahead (fight on when lost)
    hurryAhead: false,  // hurry counts turns from now instead of the game's turn number
    idleCash: false,    // no skipping/saving when it could buy now and still afford anything next turn
    varietyBuys: false, // ...and only buys, unless skipping/saving is the best move outright
    varietyTop: 0,      // variety picks only among this many best buys, weighted to the better (0 = any, uniform)
    observe: false,     // weight opponent styles by how well they predicted real moves (styleWeights)
    observeWindow: 10,  // turns of the opponent's history considered
    observeDecay: 0.85, // a match k turns ago counts observeDecay^k
    observePrior: 0.3,  // weight every style starts with...
    priors: null,       // ...or per style, e.g. { spend: 0.05, wild: 0.05 } to expect a strong player
    incomeW: 1,         // weight on income's share of that...
    oreW: 1,            // ...and on the ore stock's share
    hpW: 1,             // value of a point of base hp...
    fear: 40,           // ...plus fear·ln(1+hp): the last points matter most
    shipW: 1,           // value of ships on the board (√(attack·health) each)
    advanceW: 0.04,     // per sector a ship has pushed toward the enemy
    fwdMult: 1,         // worth of ships within reach of a defended enemy base (counterwave fuel)
    mineTurns: 0,       // count ore that miners now in the centre will mine over this many turns
    centerW: 0,         // per mining sector (3-5) held with my ships and none of theirs
    pinW: 0,            // for pinning them in front of their own base (see sideValue)
    visibleOnly: true,  // limit itself to the ships the player's deploy bar shows
    chaos: 0.5,         // opening randomness, as a share of the best-to-4th-best score gap
    chaosTurns: 8,      // turns it applies to
    openTol: 0,         // variety: while safe, pick at random among moves within this share of one
    driftTol: 0,        // imagined win/loss flip of the best (openTol for the first openTurns, then driftTol)
    openTurns: 10,
};

/** The ships render.js shows on the deploy bar for this side's income and ore. */
// The bar depends only on income and ore; rollouts ask for it every imagined turn, so remember
// it (callers only read the list).
const visibleMemo = new Map();
export function visibleShips(S, side) {
    const inc = S[side].income;
    const ore = S[side].ore;
    const key = inc * 100003 + ore;
    let v = visibleMemo.get(key);
    if (v === undefined) {
        if (visibleMemo.size > 100000) visibleMemo.clear();
        v = computeVisible(inc, ore);
        visibleMemo.set(key, v);
    }
    return v;
}

function computeVisible(inc, ore) {
    const c = n => costOf(n, ore);
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
    for (let i = menu.length - 1; i >= 0; i--) if (costOf(menu[i], me.ore) <= me.money) return menu[i];
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
            const rate = g / costOf(n, me.ore);
            if (rate > bestRate) { bestRate = rate; best = n; }
        }
        if (!best) return fallback(S, side, cfg);
        return costOf(best, me.ore) <= me.money ? best : 0;
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
        if (costOf(n, me.ore) > me.money) break;
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
        if (costOf(n, me.ore) > me.money) break; // menu is ascending in number, and so in cost
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
        if (num && costOf(num, me.ore) > me.money + 4) continue;
        let w = num > 3 ? costOf(num, 0) : 5;
        if (num % 3 === 0) { w *= 2; if (foeNear) w = 0; }
        if (num % 7 === 0 && num !== 0) { w *= (me.hp - 20) / Math.min(me.income, 10); if (foeNear) w = 0; }
        if (num === 0 && costOf(7, me.ore) <= me.money + 4) w = 0;
        if (num % 17 === 0 && num !== 0) { w *= (40 * (num / 17) / foe.hp) ** 4; if (foeNear) w = 0; }
        if (num % 5 === 0 && num > 0) w *= (foe.ships.length ** 3) / 300;
        if (num % 3 !== 0 && num % 7 !== 0 && ownCenter) w = 0;
        if (num >= 67) w *= 1000000;
        w = Math.max(0, w - 2 * Math.max(0, costOf(num, me.ore) - me.money));
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

/** Damage per turn the enemy fleet could put on this side's base soon: ships already in
    range at full weight, ships one or two sectors further out at half. */
function baseThreat(S, side) {
    const base = side === 'blue' ? 1 : 7;
    let t = 0;
    for (const s of S[enemyOf(side)].ships) {
        if (s.health <= 0) continue;
        const reach = s.number % 11 === 0 ? 3 : 2;
        const d = Math.abs(s.sector - base);
        if (d <= reach) t += s.attack;
        else if (d <= reach + 2) t += 0.5 * s.attack;
    }
    return t;
}

/** Rollout policy: the human snowball. Base hp is a resource: keep buying income while the
    base can soak the incoming damage for `buffer` turns, else the sturdiest fighter. As
    income grows those fighters become the big ships that end the game. */
function snowballer(buffer, fallback = value) {
    return (S, side, cfg) => {
        const me = S[side];
        if (me.hp > 40 && me.hp > buffer * baseThreat(S, side)) {
            let best = 0;
            let bestRate = 0;
            for (const n of shipMenu(S, side, cfg)) {
                const g = INCOME_GAIN(n);
                if (!g) continue;
                const rate = g / costOf(n, me.ore);
                if (rate > bestRate) { bestRate = rate; best = n; }
            }
            if (best) return costOf(best, me.ore) <= me.money ? best : 0;
        }
        return fallback(S, side, cfg);
    };
}

const evo = evolvedPolicy(EVO);

/**
 * Rollout policy from playtest 8, the mining gridlock:
 * - enemy pushing into my half: fighters, no miners (a trader first while their wave is mid-field)
 * - my front in the centre with the enemy pinned near its own base: fighting miners (Reaver,
 *   Excavator, Behemoth... the best ore per cost with health to hold the line), so the gridlock
 *   that keeps them from mining also mines for me; Drillers only on a quiet board
 * - quiet board: traders and miners
 */
function gridlock(S, side, cfg) {
    const me = S[side];
    const adv = (s, owner) => (owner === 'blue' ? s.sector - 1 : 7 - s.sector); // 0 = own base
    const foe = enemyOf(side);
    let foeNear = 0, foeMid = 0, myCenter = 0;
    for (const s of S[foe].ships) {
        if (s.health <= 0) continue;
        const d = 6 - adv(s, foe); // distance of their ship from my base
        if (d <= 2) foeNear++;
        else if (d <= 4) foeMid++;
    }
    for (const s of me.ships) if (s.health > 0 && adv(s, side) >= 2 && adv(s, side) <= 4) myCenter++;
    const menu = shipMenu(S, side, cfg);
    const affordable = n => costOf(n, me.ore) <= me.money;
    if (foeNear) return value(S, side, cfg);
    if (foeMid) return affordable(7) && menu.includes(7) && foeMid <= 2 ? 7 : value(S, side, cfg);
    // my push holds the middle, or nothing is happening: mine
    let best = 0, bestRate = 0;
    for (const n of menu) {
        const g = ORE_GAIN(n);
        if (!g || !affordable(n)) continue;
        const sturdy = TEMPLATES[n].health >= 15;
        if (myCenter && !sturdy) continue; // only miners that can hold a line in a gridlock
        const rate = g / costOf(n, me.ore) * (sturdy ? 1.5 : 1);
        if (rate > bestRate) { bestRate = rate; best = n; }
    }
    if (best) return best;
    if (!myCenter && affordable(7) && menu.includes(7)) return 7;
    return myCenter ? value(S, side, cfg) : 0;
}

export const POLICIES = {
    wild,
    // the AI-vs-AI evolved one-turn bot (js/evolved.js), as an imagined player
    evo: (S, side) => evo(S, side),
    spend: greedy,
    smart,
    econ: investor(INCOME_GAIN, 40),
    value,
    // Traders while nothing is near, then the sturdiest fighter every turn: the human
    // turtle-and-counterwave line that beat it in playtesting.
    turtle: investor(INCOME_GAIN, 40, value),
    snowball: snowballer(8),
    // playtest 6: income whenever the base can soak it, defending with the best counter
    // (missiles / hellfires into clumped waves) instead of Frigates
    snowsmart: snowballer(8, smart),
    gridlock,
    mine: investor(ORE_GAIN, 40),
    big,
    skip: () => 0,
};

export function sideValue(S, side, cfg, combatOnly = false) {
    const me = S[side];
    const hp = Math.max(0, me.hp);
    let v = cfg.hpW * hp + cfg.fear * Math.log1p(hp);
    // A decided game (decidedCombat): bank, income and ore are worth nothing once it's over; only
    // how close it was counts (base hp, ships still fighting). Otherwise a lost line with an extra
    // Caravan or more money banked looks better than one that fought (playtest 19).
    if (combatOnly) {
        let ships = 0;
        for (const s of me.ships) if (s.health > 0) ships += Math.sqrt(Math.max(0.5, s.attack) * s.health);
        return v + cfg.shipW * ships;
    }
    // Income and ore, valued as the ship size they buy each turn over the horizon:
    // what the income buys at no ore, plus what the ore stock adds on top. With mineTurns,
    // the ore stock includes what miners now in the centre will mine over that many more turns
    // (playtests: a gridlock where I mine more is a winning position, even before the ore lands).
    const ore = me.ore + (cfg.mineTurns ? cfg.mineTurns * calcOreIncome(side, S) : 0);
    // oreTiers (playtest 22): ore is an income multiplier whose size depends on the tier being
    // bought - prices are n^(1 + e²/(e + d(ore))) with e growing in n, so ore barely discounts a
    // Driller but halves a Dreadnought. Buying every turn alone only sees row-1 discounts, so
    // value the economy as the average ship size per turn over a few spending rhythms (every
    // turn, every 2nd, every 4th: missile-hellfire alternation, short save-ups), which counts
    // the discount on the tiers this income is reaching for.
    const rate = (inc, o) => {
        if (inc <= 0) return 0;
        if (!cfg.oreTiers) return economy(inc, o);
        let t = 0;
        for (const k of cfg.oreTiers) t += economy(k * inc, o) / k;
        return t / cfg.oreTiers.length;
    };
    const perTurn = rate(me.income, ore);
    const bare = rate(me.income, 0);
    const horizon = Math.max(8, cfg.horizon - 0.1 * S.turn);
    v += horizon * (cfg.incomeW * bare + cfg.oreW * (perTurn - bare));
    if (me.income > 0) v += me.money * (perTurn / me.income);
    // Counterwave fuel: ships within reach of an enemy base that has a defending stack are about
    // to die and feed the counterwave ("whatever crashes into a base comes back doubled"), so
    // with fwdMult < 1 they count for that much instead of earning the advance bonus.
    const foe = enemyOf(side);
    const foeBase = foe === 'blue' ? 1 : 7;
    const defended = cfg.fwdMult !== 1 && S[foe].ships.some(s => s.health > 0 && s.sector === foeBase);
    // Front-line bell (playtest 28, checked on 29k recorded positions): where my lead ship stands
    // matters, but not "further is better". Holding the centre wins most (58% at turns 8-20),
    // one sector past it 46%, hanging back near home 45-48%: the ideal push is the one that
    // barely wins the centre while mining, not one that spills forward into their base.
    if (cfg.frontW) {
        let front = -1;
        for (const s of me.ships) {
            if (s.health <= 0) continue;
            const d = side === 'blue' ? s.sector - 1 : 7 - s.sector;
            if (d > front) front = d;
        }
        if (front >= 0) v += cfg.frontW * cfg.frontBell[Math.min(front, cfg.frontBell.length - 1)];
    }
    let ships = 0;
    for (const s of me.ships) {
        if (s.health <= 0) continue;
        const advance = side === 'blue' ? s.sector - 1 : 7 - s.sector;
        const w = Math.sqrt(Math.max(0.5, s.attack) * s.health);
        ships += defended && advance >= 4 ? w * cfg.fwdMult : w * (1 + cfg.advanceW * advance);
    }
    // Front line (playtest 15): holding the mining centre is worth centerW per sector (3-5) held
    // with my ships and none of theirs, pinning them in front of their own base (my ships one
    // sector from it, none of theirs further out) pinW more. Being pinned myself shows up as the
    // opponent's side of the same terms.
    if (cfg.centerW || cfg.pinW) {
        const mineIn = new Array(9).fill(false), theirsIn = new Array(9).fill(false);
        for (const s of me.ships) if (s.health > 0) mineIn[s.sector] = true;
        for (const s of S[foe].ships) if (s.health > 0) theirsIn[s.sector] = true;
        for (let sec = 3; sec <= 5; sec++) if (mineIn[sec] && !theirsIn[sec]) v += cfg.centerW;
        const step = side === 'blue' ? 1 : -1;
        const nextToTheirs = foeBase - step;
        let theirsOut = false;
        for (const s of S[foe].ships) if (s.health > 0 && s.sector !== foeBase) theirsOut = true;
        if (cfg.pinW && mineIn[nextToTheirs] && !theirsOut) v += cfg.pinW;
    }
    return v + cfg.shipW * ships;
}

/**
 * Board resolution (quiescence): freeze all purchases and let the ships on the board march and
 * fight it out, so a position isn't judged mid-fight. Shows whether an attack is about to feed a
 * counterwave. Returns the resolved state (both sides skipping for up to `turns` turns, or until
 * the board is empty).
 */
function resolveBoard(S, turns) {
    const T = cloneState(S);
    for (let k = 0; k < turns && !T.over; k++) {
        if (!T.blue.ships.length && !T.red.ships.length) break;
        stepTurn(T, 0, 0);
    }
    return T;
}

export function evaluate(S, side, cfg, ahead = 0) {
    if (cfg.leaf === 'resolve' && !S.over) {
        // judge the position after the board plays out, but keep the economy as it stands
        const T = resolveBoard(S, cfg.resolveTurns);
        if (T.over) return (T.over === side ? 1 : -1) * cfg.resolveWin * cfg.winScore
            + sideValue(S, side, cfg) - sideValue(S, enemyOf(side), cfg);
        return sideValue(T, side, cfg) - sideValue(T, enemyOf(side), cfg);
    }
    // leaf 'net' (v3.1): an undecided position is scored by the learned evaluator, in the same
    // units as a decided game (winScore × (P(I win) - P(they win))). The hand-written score
    // turned out to point the wrong way early on: the side it favoured at turns 1-8 lost 68%.
    if (cfg.leaf === 'net' && !S.over) return cfg.winScore * (netWinProb(S, side) - netWinProb(S, enemyOf(side)));
    const combatOnly = !!(cfg.decidedCombat && S.over);
    const v = cfg.leaf === 'evolved' && !S.over
        ? cfg.leafScale * evolvedEval(EVO, S, side)
        : sideValue(S, side, cfg, combatOnly) - sideValue(S, enemyOf(side), cfg, combatOnly);
    // Win sooner, lose later; the position still breaks ties, so a lost line keeps fighting.
    // A win `ahead` turns into an imagined future counts trust^ahead as much: the scripted
    // opponents in rollouts defend worse than people, so far-off wins are mostly rumour, and
    // against a rumour the economy (momentum, insurance) should win the argument. Losses keep
    // full weight: a counterwave seen far off is still a real threat.
    const W = cfg.winScore;
    const hurry = cfg.hurry ?? W / 1000;
    // hurryAhead: count the turns from now, not the game's turn number, so a late-game win
    // still outscores an undecided line (hurry × turn 40 can eat most of winScore)
    const when = cfg.hurryAhead ? ahead : S.turn;
    if (S.over === side) return (W - hurry * when) * cfg.trust ** ahead + v;
    // lossDelay (playtest 19): when every line loses, surviving longer is what's left to fight for
    // (more turns for a counterwave, a mistake, a hellfire), so a loss further off scores better.
    if (S.over) return -W + hurry * when + (cfg.lossDelay || 0) * ahead + v;
    return v;
}

/** My wave is in their half and none of theirs is in mine: the econ window of a push. */
export function pushWindow(S, side) {
    const adv = (s, owner) => (owner === 'blue' ? s.sector - 1 : 7 - s.sector);
    const mineOut = S[side].ships.some(s => s.health > 0 && adv(s, side) >= 3);
    const theirsIn = S[enemyOf(side)].ships.some(s => s.health > 0 && adv(s, enemyOf(side)) >= 3);
    return mineOut && !theirsIn;
}

function plans(S, side, cfg) {
    const me = S[side];
    // Idle cash (playtest 16): banking past the priciest ship it can see buys nothing - one ship
    // per turn, and saving doesn't unlock tiers (income does). If it could buy the cheapest ship
    // now and still afford any visible ship next turn, skipping and saving are off the menu.
    let idle = false;
    if (cfg.idleCash) {
        const costs = shipMenu(S, side, cfg).map(n => costOf(n, me.ore));
        if (costs.length) idle = me.money - Math.min(...costs) + me.income >= Math.max(...costs);
    }
    const out = idle ? [] : [{ first: 0 }];
    // Expert rule (playtests): the push is the econ window. While my wave holds their half and
    // none of theirs is in mine, cheap pure fighters trailing the push (skiffs, corvettes...)
    // are off the menu; miners, traders, saving and substantial fighters remain.
    const window = cfg.pushMiners && pushWindow(S, side);
    const trailing = n => !INCOME_GAIN(n) && !ORE_GAIN(n) && costOf(n, me.ore) < cfg.pushMiners * me.income;
    for (const n of shipMenu(S, side, cfg)) {
        if (window && trailing(n)) continue;
        if (canAfford(S, side, n)) { out.push({ first: n }); continue; }
        if (cfg.saveTurns > 0 && me.income > 0 && !idle) {
            // turns of saving until it's affordable (loan included, as canAfford counts it)
            const short = costOf(n, me.ore) - me.money - maxLoanFor(me.income);
            const wait = Math.ceil(short / me.income);
            if (wait <= cfg.saveTurns) out.push({ first: 0, saveFor: n, wait });
        }
    }
    return out;
}

// Set by rollout(): the plan's fragile miner died in that imagined future without ever mining.
let rolloutDeadMiner = false;

// Hard ceiling on one decision's thinking time, checked inside rollouts (see chooseGrandmaster).
let deadline = Infinity;

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
    // minerFate: follow a fragile miner bought by this plan; did it die before ever mining?
    const watch = cfg.minerFate && !plan.saveFor && ORE_GAIN(plan.first) && TEMPLATES[plan.first].health < 15;
    let miner = null, mined = false;
    rolloutDeadMiner = false;
    try {
        for (let d = 0; d < cfg.depth && !sim.over; d++) {
            if (d > 0 && Date.now() > deadline) break; // out of thinking time: score it as it stands
            let a;
            if (d === 0) a = plan.first;
            else if (plan.saveFor && d <= plan.wait) a = canAfford(sim, side, plan.saveFor) ? plan.saveFor : 0;
            else a = myPol(sim, side, cfg, rand);
            const b = theirPol(sim, opp, cfg, rand);
            if (side === 'blue') stepTurn(sim, a, b);
            else stepTurn(sim, b, a);
            if (watch) {
                const own = sim[side].ships;
                if (d === 0) miner = own.findLast(s => s.number === plan.first) ?? null;
                if (miner && own.includes(miner) && miner.sector >= 3 && miner.sector <= 5) mined = true;
            }
        }
        if (watch && miner && !mined && !sim[side].ships.includes(miner)) rolloutDeadMiner = true;
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
        return -5e5; // a line that freezes the live game: avoid it
    }
    return evaluate(sim, side, cfg, sim.turn - S.turn);
}

/**
 * How much each opponent style counts, from how well it predicted their real purchases.
 * Every turn the position is kept in memo; on later turns each style is asked what it would
 * have bought there and gets credit (recent turns count most) when that matches what the
 * opponent actually bought. 'wild' is random, so it keeps only the prior.
 * Returns one weight per entry of cfg.theirs, or null when observing is off.
 */
function styleWeights(S, side, cfg, memo) {
    const prior = name => cfg.priors?.[name] ?? cfg.observePrior;
    if (!cfg.observe || !memo) return cfg.priors ? cfg.theirs.map(prior) : null;
    const opp = enemyOf(side);
    const hist = S[opp].history || [];
    memo.snaps ??= {};
    memo.preds ??= {};
    memo.snaps[S.turn] = cloneState(S);
    for (const t in memo.snaps) if (t < S.turn - cfg.observeWindow) { delete memo.snaps[t]; delete memo.preds[t]; }
    const w = cfg.theirs.map(prior);
    for (let t = S.turn - 1; t >= S.turn - cfg.observeWindow && t >= 1; t--) {
        const snap = memo.snaps[t];
        const actual = hist[t - 1];
        if (!snap || actual === undefined) continue;
        const preds = memo.preds[t] ??= {};
        const r = cfg.observeDecay ** (S.turn - 1 - t);
        cfg.theirs.forEach((name, j) => {
            if (name === 'wild') return;
            if (!(name in preds)) preds[name] = POLICIES[name](snap, opp, cfg, Math.random);
            if (preds[name] === actual) w[j] += r;
        });
    }
    return w;
}

/** Combines a move's scores across opponent styles. 'cautious' averages the worse half, so a
    gamble that crushes most styles but dies to one doesn't look good on average. */
function aggregate(scores, how, weights, risk = 0) {
    if (how === 'min') return Math.min(...scores);
    if (how === 'risk') {
        // Uncertainty as danger: average minus `risk` × spread across the imagined opponents.
        // A move that crushes some of them and dies to others is a gamble; one that comes out
        // decent against all of them is reliable.
        const m = scores.reduce((a, b) => a + b, 0) / scores.length;
        const sd = Math.sqrt(scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length);
        return m - risk * sd;
    }
    if (how === 'trim') {
        // Fuzzy consensus (playtest 19): drop the `risk` most extreme imagined outcomes at each end,
        // so one silly imagined opponent (a win against a style that never fights) or one fluke
        // loss can't decide a move; a near-unanimous result still counts in full.
        const s = scores.slice().sort((a, b) => a - b);
        const k = Math.min(Math.floor((s.length - 1) / 2), Math.max(0, Math.round(risk)));
        const mid = s.slice(k, s.length - k);
        return mid.reduce((a, b) => a + b, 0) / mid.length;
    }
    if (how === 'cautious') {
        const s = scores.slice().sort((a, b) => a - b);
        const k = Math.ceil(s.length / 2);
        let t = 0;
        for (let i = 0; i < k; i++) t += s[i];
        return t / k;
    }
    if (weights) {
        let t = 0, n = 0;
        scores.forEach((x, j) => { t += x * weights[j]; n += weights[j]; });
        return t / n;
    }
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Tactics (v3.1): this turn as the simultaneous game it is. For every buy of mine and every buy
 * they could make, play the pair out tacticTurns turns (both sides then following tacticPolicy)
 * and score the position; then solve that table as a zero-sum game by regret matching, so their
 * replies are the mix an opponent hunting for my counter would use - not one scripted style,
 * not the single worst case. Returns { value: Map(move -> my expected score vs their mix), mix }.
 */
function tactics(S, side, cfg, mine) {
    const opp = enemyOf(side);
    const theirs = [0, ...visibleShips(S, opp).filter(n => canAfford(S, opp, n))];
    const pol = POLICIES[cfg.tacticPolicy];
    const P = mine.map(() => new Array(theirs.length).fill(0));
    for (let i = 0; i < mine.length; i++) {
        for (let j = 0; j < theirs.length; j++) {
            const sim = cloneState(S);
            let score;
            try {
                for (let d = 0; d < cfg.tacticTurns && !sim.over; d++) {
                    const a = d === 0 ? mine[i] : pol(sim, side, cfg, () => 0.5);
                    const b = d === 0 ? theirs[j] : pol(sim, opp, cfg, () => 0.5);
                    if (side === 'blue') stepTurn(sim, a, b);
                    else stepTurn(sim, b, a);
                }
                score = evaluate(sim, side, cfg, sim.turn - S.turn);
            } catch (e) {
                if (!(e instanceof SimError)) throw e;
                score = -5e5;
            }
            P[i][j] = score;
        }
    }
    // regret matching for both players; the average strategies approach a Nash equilibrium
    const m = mine.length, n = theirs.length;
    const rA = new Array(m).fill(0), rB = new Array(n).fill(0);
    const sumB = new Array(n).fill(0);
    const strat = r => {
        const pos = r.map(x => Math.max(0, x));
        const t = pos.reduce((a, b) => a + b, 0);
        return t > 0 ? pos.map(x => x / t) : r.map(() => 1 / r.length);
    };
    for (let it = 0; it < cfg.tacticIters; it++) {
        const pa = strat(rA), pb = strat(rB);
        for (let j = 0; j < n; j++) sumB[j] += pb[j];
        const ua = P.map(row => row.reduce((t, x, j) => t + x * pb[j], 0));
        const ub = theirs.map((_, j) => -P.reduce((t, row, i) => t + row[j] * pa[i], 0));
        const va = ua.reduce((t, x, i) => t + x * pa[i], 0);
        const vb = ub.reduce((t, x, j) => t + x * pb[j], 0);
        for (let i = 0; i < m; i++) rA[i] += ua[i] - va;
        for (let j = 0; j < n; j++) rB[j] += ub[j] - vb;
    }
    const tot = sumB.reduce((a, b) => a + b, 0);
    const q = sumB.map(x => x / tot);
    const value = new Map();
    mine.forEach((mv, i) => value.set(mv, P[i].reduce((t, x, j) => t + x * q[j], 0)));
    return { value, mix: new Map(theirs.map((mv, j) => [mv, q[j]])) };
}

/**
 * The grandmaster's pick for `side` this turn (0 = skip).
 * opts.cfg overrides GM_DEFAULTS; opts.out, if an array, receives every plan's score.
 */
export function chooseGrandmaster(state, side, opts = {}) {
    const cfg = { ...GM_DEFAULTS, ...(opts.cfg || {}) };
    // Opening book: play a fixed style for the first turns, then think. The concept crawl
    // (tools/crawl.js) found openings that beat grandmaster's own opening.
    if (cfg.opening && state.turn <= cfg.opening.turns) {
        return POLICIES[cfg.opening.style](cloneState(state), side, cfg, opts.rng || Math.random) || 0;
    }
    // Invest when it's safe: the longer the base could soak the damage heading for it, the
    // further ahead income and ore are valued (horizon up to ×(1 + safeEcon)). The way a
    // player banks on economy only while the defence holds.
    const safety = Math.max(0, 1 - 8 * baseThreat(state, side) / Math.max(1, state[side].hp));
    if (cfg.safeEcon > 0) Object.assign(cfg, { horizon: cfg.horizon * (1 + cfg.safeEcon * safety) });
    // Is the board open for my miners? No enemy ships in my half, so a miner can walk out to
    // the centre and mine (playtests: drillers on the tail of a push, not into a wave).
    const foeInMyHalf = state[enemyOf(side)].ships.some(s => s.health > 0 && (side === 'blue' ? s.sector <= 4 : s.sector >= 4));
    // Bounded thinking: an imagined future costs ships × turns, so with a big swarm on the board
    // (carriers spawning every turn, long gridlocks) the lookahead shortens to keep that roughly
    // constant; normal games (under ~40 ships) are unaffected.
    const ships = state.blue.ships.length + state.red.ships.length;
    if (ships > cfg.swarmShips) Object.assign(cfg, { depth: Math.max(8, Math.round(cfg.depth * cfg.swarmShips / ships)) });
    const started = Date.now();
    deadline = started + 2 * cfg.budgetMs;
    const S = cloneState(state);
    const rng = opts.rng || Math.random;
    const weights = styleWeights(state, side, cfg, opts.memo);
    if (opts.weightsOut && weights) opts.weightsOut.push(...weights);
    const scored = [];
    // Intuition: a learned glance-at-the-board bias per move (js/intuition.js), added to
    // every line that starts with that move. cfg.intuition: true = trained weights, or a weights object.
    const IW = cfg.intuition === true ? INTUITION_WEIGHTS : cfg.intuition || null;
    const sit = IW ? situation(S, side) : null;
    const biasOf = {};
    // Book (tools/wizard.js): lessons from real games, as a win-probability edge per first move
    // in positions like this one, worth bookW points per 100% (cfg.book: true = js/book-data.js).
    const book = cfg.book === true ? BOOK : cfg.book || null;
    const keys = book ? bookKeys(S, side) : null;
    const bookOf = {};
    const bias = plan => {
        const n = plan.saveFor ? 0 : plan.first;
        const b = book ? (bookOf[n] ??= cfg.bookW * bookBias(book, keys, n, cfg.bookPrior)) : 0;
        if (!IW) return b;
        return b + (biasOf[n] ??= cfg.intuitionScale * intuitionBias(IW, n, S, side, sit));
    };
    // Investment credit: income pays off forever, mostly after the lookahead ends, and most
    // imagined lines are decided (win or loss) before then, so on its own the search can't see a
    // trader's payback. investBias points per +1 income break ties toward investing; it is meant
    // to be smaller than one imagined line flipping between win and loss, so safety still wins.
    // Scaled by safety (no trader-buying while the base is being destroyed), plus ore credit per
    // ore/turn a miner produces, only while the board is open for it to reach the centre.
    const invest = plan => {
        if (plan.saveFor || !plan.first) return 0;
        const scale = cfg.investSafe ? safety : 1;
        let v = cfg.investBias * INCOME_GAIN(plan.first) * scale;
        // per ore/turn, or (orePerCost) per ore/turn per money relative to a 5-money Driller, so a
        // cheap Driller isn't outbid by a pricey Reaver whose extra hp mostly feeds counterwaves
        const perCost = cfg.orePerCost ? Math.min(1, 5 / costOf(plan.first, S[side].ore)) : 1;
        if (cfg.oreIncomeTurns && !foeInMyHalf && ORE_GAIN(plan.first)) {
            // Ore as indirect income (playtest 22): credit a miner like a trader, scaled by how
            // much income its next oreIncomeTurns of mining are worth at the tiers this income
            // reaches (the real price formula: big for a Quarry at low/mid ore, little for a
            // Driller at 200 ore). Only while the board is open and the base safe: the tail of
            // a push, not an always-on frenzy.
            const me = S[side];
            const r = (inc, o) => [1, 2, 4].reduce((t, k) => t + economy(k * inc, o) / k, 0) / 3;
            const inc = Math.max(1, me.income);
            const eq = (r(inc, me.ore + ORE_GAIN(plan.first) * cfg.oreIncomeTurns) - r(inc, me.ore))
                / Math.max(1e-6, r(inc + 1, me.ore) - r(inc, me.ore));
            // ...per money too (playtest 23): a Reaver mines 2/turn for 2.7 Drillers' price, so two
            // Drillers mine the same for less and feed no counterwave; scale by ore-per-money
            // relative to a Driller, capped at 1 (a Quarry mines more per money than a Driller)
            const perMoney = Math.min(1, (ORE_GAIN(plan.first) / costOf(plan.first, me.ore)) / (1 / costOf(3, me.ore)));
            v += cfg.investBias * eq * (cfg.oreIncomePerMoney ? perMoney : 1) * scale;
        } else if (cfg.oreBias && !foeInMyHalf) v += cfg.oreBias * ORE_GAIN(plan.first) * perCost * scale;
        // Dead-zone miners (playtest 15): with an enemy ship in my half, a fragile miner deployed
        // now gets pinned one sector from home - can't mine, gets shot - so it costs deadMiner
        // (a share of one imagined win/loss flip). Sturdy fighting miners can hold a gridlock.
        if (cfg.deadMiner && foeInMyHalf && ORE_GAIN(plan.first) && TEMPLATES[plan.first].health < 15) {
            v -= cfg.deadMiner * 2 * cfg.winScore / cfg.theirs.length;
        }
        return v;
    };
    // respect 'push': only while my push holds their half (trailing fighters behind a wave);
    // respect true: always (too timid: it stops defending properly)
    // respect 'safe': whenever its own base is safe (opening, quiet board, pushes), not under threat
    const respectNow = cfg.respect === 'push' ? pushWindow(S, side)
        : cfg.respect === 'safe' ? safety >= cfg.respectSafety || pushWindow(S, side)
            : !!cfg.respect;
    // agg 'adversary' (playtest 18): the real opponent isn't a random draw from my imagined styles,
    // it hunts for the one that beats me. So every move is judged by the mean of its worst advK
    // imagined opponents (the random 'wild' ones left out: they are noise, not a counter), i.e.
    // by how big the downside is when they find the counter, not by how many styles it beats.
    const agg = scores => {
        if (cfg.agg !== 'adversary') return aggregate(scores, cfg.agg, weights, cfg.risk);
        const real = scores.filter((_, j) => cfg.theirs[j] !== 'wild').sort((a, b) => a - b);
        const k = Math.max(1, Math.min(cfg.advK, real.length));
        let t = 0;
        for (let i = 0; i < k; i++) t += real[i];
        return t / k;
    };
    // What each of my styles would play right now, if I just followed it.
    const styleMove = {};
    for (const mine of cfg.mine) styleMove[mine] = POLICIES[mine](S, side, cfg, () => 0.5);
    for (const plan of plans(S, side, cfg)) {
        // hard stop: keep the best move found so far rather than freeze the game
        if (scored.length && Date.now() - started > cfg.budgetMs) break;
        // Every follow-up style of mine after this move, judged across their styles.
        let score = -Infinity;
        for (const mine of cfg.mine) {
            let deadShare = 0;
            const scores = cfg.theirs.map((t, j) => {
                const x = rollout(S, side, plan, mine, t, cfg, j);
                if (rolloutDeadMiner) deadShare += 1 / cfg.theirs.length;
                return x;
            });
            // Respect the opponent (playtest 13): a pure-combat move only counts as good if it works
            // against every respected imagined opponent (all but the random 'wild' ones) - its
            // worst case. Investments (miners, traders, saving) keep the usual average.
            // respectSkip (playtest 21): skipping and saving aren't investments either, so they must
            // also work against every respected opponent - otherwise sitting still gets the lenient
            // average while every fighter is held to its worst case, and it skips in front of a
            // pile of vulnerable miners.
            const passive = cfg.respectSkip && (plan.saveFor || !plan.first);
            const combat = respectNow && (passive || (!plan.saveFor && plan.first && !INCOME_GAIN(plan.first) && !ORE_GAIN(plan.first)));
            const respected = combat ? scores.filter((_, j) => cfg.theirs[j] !== 'wild') : null;
            // Miner fate (playtest 17): a fragile miner that dies in its own column before ever
            // mining is the critical-fail position (a dead investment and a gridlock at home), worth
            // minerFate imagined win/loss flips times the share of imagined futures where it happens.
            const fate = deadShare * (cfg.minerFate || 0) * 2 * cfg.winScore / cfg.theirs.length;
            // decidedCombat also means: investment credit only for the imagined games not already
            // lost - a trader or miner pays off over time this line doesn't have (playtest 19).
            const alive = cfg.decidedCombat ? scores.filter(x => x > -cfg.winScore / 2).length / scores.length : 1;
            const s = (combat ? Math.min(...respected) : agg(scores)) + bias(plan) + alive * invest(plan) - fate;
            if (opts.detail) opts.detail.push({ plan, mine, scores, total: s });
            // "pure": this move is simply the style's own move, so the line is a plan it will
            // keep following. Anything else is a one-off deviation before the style.
            const pure = !plan.saveFor && plan.first === styleMove[mine];
            scored.push({ plan, mine, score: s, pure, raw: agg(scores), scores });
            if (s > score) score = s;
        }
        if (opts.out) opts.out.push({ plan, score });
    }
    // Regret (playtest 18): the real opponent reacts and narrows in on the counter, so "beats 7 of
    // 10 imagined styles" is not 70%, it is a 100% loss if they find one of the 3. What matters is
    // how much worse this move does against an opponent than the best move against that same
    // opponent would: its downside when countered, not whether that opponent is strong anyway
    // (a style everything loses to costs no move anything). Every line of a move pays regretW ×
    // the mean of its regretK biggest regrets over the non-random opponents, counting for each
    // opponent the move's best follow-up style (I react too).
    if (cfg.regretW > 0 && scored.length > 1) {
        const key = e => (e.plan.saveFor ? `s${e.plan.saveFor}` : `m${e.plan.first}`);
        const real = cfg.theirs.map((t, j) => (t === 'wild' ? -1 : j)).filter(j => j >= 0);
        const vec = new Map();
        for (const e of scored) {
            const v = vec.get(key(e)) ?? vec.set(key(e), real.map(() => -Infinity)).get(key(e));
            real.forEach((j, i) => { if (e.scores[j] > v[i]) v[i] = e.scores[j]; });
        }
        const best = real.map((_, i) => Math.max(...[...vec.values()].map(v => v[i])));
        const k = Math.max(1, Math.min(cfg.regretK, real.length));
        const regret = new Map();
        for (const [m, v] of vec) {
            const r = v.map((x, i) => best[i] - x).sort((a, b) => b - a);
            regret.set(m, r.slice(0, k).reduce((a, b) => a + b, 0) / k);
        }
        for (const e of scored) e.score -= cfg.regretW * regret.get(key(e));
    }
    // v3.1: tactics decide, the long view influences (playtest 26: "I never calculate 20 turns
    // ahead; the far future is a fuzzy influence, short-term tactics are the clinchers"). Each
    // first move scores its tactical value against their equilibrium mix of replies, plus
    // longW × its long-horizon score (the rollouts above, credits and book included).
    if (cfg.tactical && scored.length) {
        const longOf = new Map();
        for (const e of scored) {
            const mv = e.plan.saveFor ? 0 : e.plan.first;
            if (!longOf.has(mv) || e.score > longOf.get(mv)) longOf.set(mv, e.score);
        }
        const moves = [...longOf.keys()];
        const tac = tactics(S, side, cfg, moves);
        const final = moves.map(mv => ({ mv, v: tac.value.get(mv) + cfg.longW * longOf.get(mv) }));
        final.sort((a, b) => b.v - a.v);
        if (opts.tacticsOut) opts.tacticsOut.push(...final.map(f => ({ ...f, tac: tac.value.get(f.mv), long: longOf.get(f.mv) })));
        // variety among moves within tacticTol of the best, the better ones likelier
        const near = final.filter(f => f.v >= final[0].v - cfg.tacticTol).slice(0, cfg.varietyTop || 3);
        if (near.length > 1 && safety >= 0.8) {
            const w = near.map(f => 1 - (final[0].v - f.v) / (cfg.tacticTol || 1) + 0.25);
            let r = rng() * w.reduce((a, b) => a + b, 0);
            const i = w.findIndex(x => (r -= x) < 0);
            return near[i < 0 ? near.length - 1 : i].mv;
        }
        return final[0].mv;
    }
    // Opening chaos: early on, every move gets a random nudge sized to the gap between the
    // best and the 4th-best move, so close alternatives trade places and no single memorised
    // line beats it every game. Clearly worse moves are never picked.
    let jitter = 0;
    if (cfg.chaos > 0 && S.turn <= cfg.chaosTurns && scored.length > 1) {
        const sorted = scored.map(e => e.score).sort((a, b) => b - a);
        jitter = cfg.chaos * Math.min(sorted[0] - sorted[Math.min(3, sorted.length - 1)], 2000);
    }
    // Commitment: every line assumes it plays its style properly from next turn, so a one-off
    // (a trader now, defend later) always looks about as good as defending now, and re-planning
    // each turn would put defence off forever. So it follows the best whole style unless a
    // one-off beats that by commitMargin (missile tricks, saving up, speed bumps can).
    let bestPure = null, bestDev = null;
    for (const e of scored) {
        const v = e.score + (jitter ? rng() * jitter : 0);
        if (e.pure) { if (!bestPure || v > bestPure.v) bestPure = { ...e, v }; }
        else if (!bestDev || v > bestDev.v) bestDev = { ...e, v };
    }
    let pick = bestPure ?? bestDev;
    if (bestDev && bestPure && bestDev.v > bestPure.v + cfg.commitMargin) pick = bestDev;
    let best = pick ? pick.plan.first : 0;
    // Close out (playtest 16): when a whole plan - a style played from now on, its own move first -
    // wins most imagined games, play that plan. Otherwise every turn a one-off (a trader, a skip,
    // a miner) also "wins, if I play properly from next turn", the next turn re-plans the same way,
    // and the won position is traded away one deviation at a time. No variety, no credits.
    if (cfg.closeOut) {
        let close = null;
        for (const e of scored) if (e.pure && e.raw >= cfg.closeOut * cfg.winScore && (!close || e.raw > close.raw)) close = e;
        if (close) return close.plan.first;
    }
    // Real variety (playtests: one win shouldn't become infinite wins by replaying it): while
    // its base is safe, pick uniformly among the moves scoring within a tolerance of the best,
    // so no fixed line beats it every game. The tolerance is a share of one imagined game
    // flipping between win and loss, wider in the opening than later; none under threat.
    const tolShare = S.turn <= cfg.openTurns ? cfg.openTol : cfg.driftTol;
    if (tolShare > 0 && safety >= 0.8 && pick) {
        const flip = 2 * cfg.winScore / cfg.theirs.length;
        const byMove = new Map();
        for (const e of scored) {
            const k = e.plan.saveFor ? `s${e.plan.saveFor}` : `m${e.plan.first}`;
            if (!byMove.has(k) || e.score > byMove.get(k).score) byMove.set(k, e);
        }
        // with a book, moves it rates within bookTol win probability of the best are all sound
        // (playtest 25: a strong book otherwise turns one found win into one memorised line)
        // The wide book window only between moves the book has verified here (playtest 27: with
        // no lessons for a position, a 1000-point window made every skip "sound" and it played
        // the opening at random).
        const tol = tolShare * flip;
        const ranked = [...byMove.values()].sort((a, b) => b.score - a.score);
        const top = ranked[0].score;
        const known = e => book && bookEvidence(book, keys, e.plan.saveFor ? 0 : e.plan.first) >= cfg.bookEvidence;
        const bookTol = book && known(ranked[0]) ? cfg.bookTol * cfg.bookW : 0;
        let near = ranked.filter(e => e.score >= top - tol || (bookTol && known(e) && e.score >= top - bookTol));
        if (cfg.varietyTop) {
            // Coherent variety (playtest 16: skip, Driller, Skiff, skip): only the few best buys,
            // the better ones likelier; skipping/saving only when that is the best move outright.
            const isBuy = e => !e.plan.saveFor && e.plan.first;
            if (cfg.varietyBuys && isBuy(ranked[0])) near = near.filter(isBuy);
            near = near.slice(0, cfg.varietyTop);
            const w = near.map(e => 1 - (top - e.score) / (tol || 1) + 0.25);
            let r = rng() * w.reduce((a, b) => a + b, 0);
            const i = w.findIndex(x => (r -= x) < 0);
            best = near[i < 0 ? near.length - 1 : i].plan.first;
        } else if (near.length > 1) best = near[Math.floor(rng() * near.length)].plan.first;
    }
    return best;
}
