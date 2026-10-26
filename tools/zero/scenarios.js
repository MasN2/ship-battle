// Starting scenarios for Zero: the rule shuffles self-play trains under, and a fixed set of
// held-out ones (the New Game presets, js/modifiers.js) to test whether it understands the game
// or only remembers openings. Every scenario is symmetric in rules; only the training "lopsided"
// nudge gives one side a little extra.
//
// A scenario sets the rules (TEMPLATES stats and prices, inside this process only) and returns
// a start: { money, income, ore, hp: [blue, red], fleet: [[ship, sector from blue's side]...] }.
// resetRules() puts the standard rules back.
//
// Held out of training on purpose: price changes to ×5, ×11 and ×13 ships (missiles, archers,
// carriers) and fleets bigger than ~120. The 'primeShift' and 'warzone' / 'missiles' tests ask
// whether what it learned about prices and fleets carries over to rules it has never seen.

import { TEMPLATES, SHIP_NUMS, calculatePrimeFactors } from '../../js/templates.js';
import { priceMult } from '../../js/economy.js';
import { clearPriceCache } from '../../js/sim.js';
import { clearPriceMemos } from '../../js/grandmaster.js';
import { clearZeroMemos } from '../../js/zero.js';
import { applyBalanceMods, normalizeMods, PRESETS } from '../../js/modifiers.js';

const ORIG = Object.fromEntries(SHIP_NUMS.map(n => [n, [TEMPLATES[n].attack, TEMPLATES[n].health]]));
const PRICE_PRIMES = [2, 3, 7, 17, 19, 23]; // trained on (5, 11, 13 held out)
const HELD_OUT_PRIMES = [5, 11, 13];
const FLEET_SHIPS = SHIP_NUMS.filter(n => n <= 73);

const clearMemos = () => { clearPriceCache(); clearPriceMemos(); clearZeroMemos(); };

export function resetRules() {
    for (const n of SHIP_NUMS) { TEMPLATES[n].attack = ORIG[n][0]; TEMPLATES[n].health = ORIG[n][1]; }
    priceMult.fill(1);
    clearMemos();
}

const standardStart = () => ({ money: [0, 0], income: [4, 4], ore: [0, 0], hp: [160, 160], fleet: [] });

const tools = rng => {
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    return {
        lg: s => (s ? Math.exp(s * gauss()) : 1),
        pick: a => a[Math.floor(rng() * a.length)],
        uni: (lo, hi) => lo + (hi - lo) * rng(),
        int: (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)),
    };
};

/** Nudged ship stats and prime prices (the rules a player would read off the cards). */
function jitterRules(rng, strength = 1) {
    const { lg, pick } = tools(rng);
    const atkAll = rng() < 0.25 ? lg(0.25 * strength) : 1, hpAll = rng() < 0.25 ? lg(0.25 * strength) : 1;
    const noise = pick([0.06, 0.12, 0.2]) * strength;
    for (const n of SHIP_NUMS) {
        TEMPLATES[n].attack = Math.max(1, Math.round(TEMPLATES[n].attack * atkAll * lg(noise)));
        TEMPLATES[n].health = Math.max(1, Math.round(TEMPLATES[n].health * hpAll * lg(noise)));
    }
    const all = rng() < 0.3 ? lg(0.15 * strength) : 1;
    const prime = Object.fromEntries(PRICE_PRIMES.map(p => [p, rng() < 0.4 ? lg(0.2 * strength) : 1]));
    const each = rng() < 0.5 ? 0.05 * strength : 0;
    for (const n of SHIP_NUMS) {
        let k = all * lg(each);
        for (const p of new Set(calculatePrimeFactors(n))) k *= prime[p] ?? 1;
        priceMult[n] *= k;
    }
}

/** Mild economy tweaks: miners / traders / income ships a bit cheaper or dearer. */
function econRules(rng) {
    const { pick, uni } = tools(rng);
    const k = rng() < 0.7 ? uni(0.6, 0.95) : uni(1.1, 1.5);
    const primes = pick([[3], [7], [23], [3, 7]]);
    for (const n of SHIP_NUMS) if (primes.some(p => n % p === 0)) priceMult[n] *= k;
}

/** A random fleet worth about `value`, mirrored for both sides; sectors are from blue's side. */
function randomFleet(rng, value, sectors) {
    const { pick } = tools(rng);
    const cap = Math.max(1, Math.min(73, Math.round(value * (0.1 + 0.55 * rng() ** 1.5))));
    const fleet = [];
    let left = value;
    while (left >= 1 && fleet.length < 24) {
        const opts = FLEET_SHIPS.filter(n => n <= Math.min(cap, left));
        if (!opts.length) break;
        const n = pick(opts);
        fleet.push([n, pick(sectors)]);
        left -= n;
    }
    return fleet;
}

/** Mid-fight: both sides already have a fleet out, bases are low, money in the bank. */
function midfight(rng, st) {
    const { pick, int } = tools(rng);
    st.fleet = randomFleet(rng, int(10, 50), pick([[1, 2, 3], [2, 3, 4], [1, 2, 3, 4], [3, 4]]));
    st.hp = Array(2).fill(pick([30, 40, 60, 80, 100, 120]));
    st.money = Array(2).fill(pick([5, 10, 15, 20, 30, 40]));
    if (rng() < 0.4) st.income = Array(2).fill(pick([4, 5, 6, 8]));
    if (rng() < 0.3) st.ore = Array(2).fill(pick([10, 30, 60]));
}

function richStart(rng, st) {
    const { pick } = tools(rng);
    st.money = Array(2).fill(pick([15, 25, 40, 60, 100]));
    if (rng() < 0.5) st.income = Array(2).fill(pick([3, 5, 6, 8, 10]));
    if (rng() < 0.4) st.ore = Array(2).fill(pick([10, 30, 60, 120]));
    if (rng() < 0.4) st.hp = Array(2).fill(pick([60, 100, 200, 260]));
}

/** Big swings on whole-game axes, log-uniform over most of the New Game slider ranges. */
function extreme(rng, st) {
    const { pick, uni } = tools(rng);
    const logU = (lo, hi) => Math.exp(uni(Math.log(lo), Math.log(hi)));
    const axes = [
        () => { const k = logU(0.25, 5); for (const n of SHIP_NUMS) TEMPLATES[n].health = Math.max(1, Math.round(TEMPLATES[n].health * k)); },
        () => { const k = logU(0.33, 3); for (const n of SHIP_NUMS) TEMPLATES[n].attack = Math.max(1, Math.round(TEMPLATES[n].attack * k)); },
        () => { st.hp = Array(2).fill(Math.max(1, Math.round(logU(1, 400)))); },
        () => { st.money = Array(2).fill(Math.round(logU(1, 250))); },
        () => { st.income = Array(2).fill(Math.max(1, Math.round(logU(1, 20)))); },
        () => { st.ore = Array(2).fill(Math.round(logU(5, 300))); },
        () => { const k = logU(0.5, 2); for (const n of SHIP_NUMS) priceMult[n] *= k; },
        () => { st.fleet = randomFleet(rng, Math.round(logU(5, 120)), [1, 2, 2, 3, 3]); },
    ].sort(() => rng() - 0.5);
    const count = pick([1, 1, 2, 2, 3]);
    for (let i = 0; i < count; i++) axes[i]();
}

function lopsided(rng, st) {
    const { pick } = tools(rng);
    const s = rng() < 0.5 ? 0 : 1;
    if (rng() < 0.5) st.money[s] += pick([1, 2, 3, 5]);
    else st.hp[s] = Math.max(10, st.hp[s] + pick([-20, -10, 10, 20]));
}

// Training families and their shares (the rest of a draw is the standard game).
export const TRAIN_FAMILIES = {
    jitter: 0.15,   // nudged ship stats and prime prices
    midfight: 0.2,  // mirrored fleets on the field, low bases, cash in hand
    rich: 0.1,      // big starting money (and sometimes income/ore/hp)
    econ: 0.1,      // cheaper/dearer miners, traders, income ships
    extreme: 0.15,  // one to three whole-game axes pushed far (ship hp/atk, base hp, money, income, ore, prices, fleet)
    combo: 0.15,    // jitter plus one of the others
};

/** A training scenario; `std` = chance of a plain standard game. Returns { start, family }. */
export function trainingScenario(rng, std = 0.2) {
    resetRules();
    const st = standardStart();
    if (rng() < std) return { start: st, family: 'standard' };
    const fams = Object.entries(TRAIN_FAMILIES);
    let r = rng() * fams.reduce((a, [, w]) => a + w, 0), family = fams[0][0];
    for (const [f, w] of fams) { if (r < w) { family = f; break; } r -= w; }
    const other = () => tools(rng).pick(['midfight', 'rich', 'econ', 'extreme']);
    const parts = family === 'combo' ? ['jitter', other()] : [family];
    for (const p of parts) {
        if (p === 'jitter') jitterRules(rng);
        else if (p === 'econ') econRules(rng);
        else if (p === 'midfight') midfight(rng, st);
        else if (p === 'rich') richStart(rng, st);
        else if (p === 'extreme') extreme(rng, st);
    }
    if (rng() < 0.15) lopsided(rng, st);
    clearMemos();
    return { start: st, family };
}

/** A New Game preset's rules, as the live game applies them (js/modifiers.js). */
function preset(mods, rng) {
    const m = normalizeMods(mods);
    applyBalanceMods(m);
    clearZeroMemos();
    const st = standardStart();
    st.money = [m.startMoney, m.startMoney];
    st.income = [m.startIncome, m.startIncome];
    st.ore = [m.startOre, m.startOre];
    st.hp = [m.baseHp, m.baseHp];
    if (m.openingValue) st.fleet = randomFleet(rng, m.openingValue, [1, 2, 2, 3, 3]);
    return st;
}

// Held-out tests. Presets are the game's own New Game options, mostly far more extreme than
// anything in training; 'midfight' and 'econ' are fresh draws from training families.
export const EVAL_SCENARIOS = {
    standard: () => { resetRules(); return standardStart(); },
    midfight: rng => { resetRules(); const st = standardStart(); midfight(rng, st); clearMemos(); return st; },
    econ: rng => { resetRules(); econRules(rng); clearMemos(); return standardStart(); },
    jitter: rng => { resetRules(); jitterRules(rng); clearMemos(); return standardStart(); },
    extreme: rng => { resetRules(); const st = standardStart(); extreme(rng, st); clearMemos(); return st; },
    // held out: one or two of ×5 / ×11 / ×13 ships much cheaper or dearer
    primeShift: rng => {
        resetRules();
        const { pick, uni } = tools(rng);
        const ps = rng() < 0.5 ? [pick(HELD_OUT_PRIMES)] : HELD_OUT_PRIMES.filter(() => rng() < 0.6);
        for (const p of ps) { const k = rng() < 0.5 ? uni(0.3, 0.7) : uni(1.5, 3); for (const n of SHIP_NUMS) if (n % p === 0) priceMult[n] *= k; }
        clearMemos();
        return standardStart();
    },
    ...Object.fromEntries(Object.entries(PRESETS).filter(([k]) => !['standard', 'chaos'].includes(k))
        .map(([k, p]) => [k, rng => { resetRules(); return preset(p.mods, rng); }])),
};

/** Puts a scenario's start onto a fresh sim state (newSimState() has already begun turn 1). */
export function applyStart(S, st) {
    ['blue', 'red'].forEach((side, i) => {
        S[side].income = st.income[i];
        S[side].money = st.money[i] + st.income[i];
        S[side].ore = st.ore[i];
        S[side].hp = st.hp[i];
    });
    for (const [n, sec] of st.fleet) {
        for (const owner of ['blue', 'red']) {
            const t = TEMPLATES[n];
            const sector = owner === 'blue' ? sec : 8 - sec;
            const row = S[owner].ships.filter(s => s.sector === sector).length;
            S[owner].ships.push({ number: n, attack: t.attack, health: t.health, sector, row, template: t, dying: false });
        }
    }
}
