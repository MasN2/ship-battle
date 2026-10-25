// Grandmaster: a search AI. For every move it could make this turn (buy a ship,
// skip, or save up for a bigger ship) it plays the game forward in the headless
// rules (sim.js) against a few plausible replies, scores where each line ends up,
// and takes the best. It plays by the player's rules: same money, loans and ore,
// no peeking at the player's pick this turn, and only ships the deploy bar would
// show (see visibleShips).

import { SHIP_NUMS, TEMPLATES } from './templates.js';
import { economy, maxLoanFor } from './economy.js';
import { cloneState, stepTurn, canAfford, enemyOf, SimError, costOf } from './sim.js';
import { evolvedEval, evolvedPolicy, seedWeights } from './evolved.js';
import { EVOLVED_WEIGHTS } from './evolved-weights.js';
import { intuitionBias, situation } from './intuition.js';
import { INTUITION_WEIGHTS } from './intuition-weights.js';

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
    visibleOnly: true,  // limit itself to the ships the player's deploy bar shows
    chaos: 0.5,         // opening randomness, as a share of the best-to-4th-best score gap
    chaosTurns: 8,      // turns it applies to
};

/** The ships render.js shows on the deploy bar for this side's income and ore. */
export function visibleShips(S, side) {
    const inc = S[side].income;
    const ore = S[side].ore;
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
    const v = cfg.leaf === 'evolved' && !S.over
        ? cfg.leafScale * evolvedEval(EVO, S, side)
        : sideValue(S, side, cfg) - sideValue(S, enemyOf(side), cfg);
    // Win sooner, lose later; the position still breaks ties, so a lost line keeps fighting.
    // A win `ahead` turns into an imagined future counts trust^ahead as much: the scripted
    // opponents in rollouts defend worse than people, so far-off wins are mostly rumour, and
    // against a rumour the economy (momentum, insurance) should win the argument. Losses keep
    // full weight: a counterwave seen far off is still a real threat.
    const W = cfg.winScore;
    const hurry = cfg.hurry ?? W / 1000;
    if (S.over === side) return (W - hurry * S.turn) * cfg.trust ** ahead + v;
    if (S.over) return -W + hurry * S.turn + v;
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
    const out = [{ first: 0 }];
    const me = S[side];
    // Expert rule (playtests): the push is the econ window. While my wave holds their half and
    // none of theirs is in mine, cheap pure fighters trailing the push (skiffs, corvettes...)
    // are off the menu; miners, traders, saving and substantial fighters remain.
    const window = cfg.pushMiners && pushWindow(S, side);
    const trailing = n => !INCOME_GAIN(n) && !ORE_GAIN(n) && costOf(n, me.ore) < cfg.pushMiners * me.income;
    for (const n of shipMenu(S, side, cfg)) {
        if (window && trailing(n)) continue;
        if (canAfford(S, side, n)) { out.push({ first: n }); continue; }
        if (cfg.saveTurns > 0 && me.income > 0) {
            // turns of saving until it's affordable (loan included, as canAfford counts it)
            const short = costOf(n, me.ore) - me.money - maxLoanFor(me.income);
            const wait = Math.ceil(short / me.income);
            if (wait <= cfg.saveTurns) out.push({ first: 0, saveFor: n, wait });
        }
    }
    return out;
}

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
        }
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
    const bias = plan => {
        if (!IW) return 0;
        const n = plan.saveFor ? 0 : plan.first;
        return biasOf[n] ??= cfg.intuitionScale * intuitionBias(IW, n, S, side, sit);
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
        if (cfg.oreBias && !foeInMyHalf) v += cfg.oreBias * ORE_GAIN(plan.first) * perCost * scale;
        return v;
    };
    // respect 'push': only while my push holds their half (trailing fighters behind a wave);
    // respect true: always (too timid: it stops defending properly)
    // respect 'safe': whenever its own base is safe (opening, quiet board, pushes), not under threat
    const respectNow = cfg.respect === 'push' ? pushWindow(S, side)
        : cfg.respect === 'safe' ? safety >= cfg.respectSafety || pushWindow(S, side)
            : !!cfg.respect;
    // What each of my styles would play right now, if I just followed it.
    const styleMove = {};
    for (const mine of cfg.mine) styleMove[mine] = POLICIES[mine](S, side, cfg, () => 0.5);
    for (const plan of plans(S, side, cfg)) {
        // hard stop: keep the best move found so far rather than freeze the game
        if (scored.length && Date.now() - started > cfg.budgetMs) break;
        // Every follow-up style of mine after this move, judged across their styles.
        let score = -Infinity;
        for (const mine of cfg.mine) {
            const scores = cfg.theirs.map((t, j) => rollout(S, side, plan, mine, t, cfg, j));
            // Respect the opponent (playtest 13): a pure-combat move only counts as good if it works
            // against every respected imagined opponent (all but the random 'wild' ones) - its
            // worst case. Investments (miners, traders, saving) keep the usual average.
            const combat = respectNow && !plan.saveFor && plan.first && !INCOME_GAIN(plan.first) && !ORE_GAIN(plan.first);
            const respected = combat ? scores.filter((_, j) => cfg.theirs[j] !== 'wild') : null;
            const s = (combat ? Math.min(...respected) : aggregate(scores, cfg.agg, weights, cfg.risk)) + bias(plan) + invest(plan);
            if (opts.detail) opts.detail.push({ plan, mine, scores, total: s });
            // "pure": this move is simply the style's own move, so the line is a plan it will
            // keep following. Anything else is a one-off deviation before the style.
            const pure = !plan.saveFor && plan.first === styleMove[mine];
            scored.push({ plan, mine, score: s, pure });
            if (s > score) score = s;
        }
        if (opts.out) opts.out.push({ plan, score });
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
    const best = pick ? pick.plan.first : 0;
    return best;
}
