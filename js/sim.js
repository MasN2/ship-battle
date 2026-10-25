// Headless copy of the rules in combat.js: same turn order, same targeting, same
// numbers, but synchronous and with no DOM, so AIs can play thousands of turns
// ahead. tools/verify.js plays random games through both this and the real
// combat.js and checks they stay identical; re-run it after any rules change.
//
// The live game's attack phase runs both sides' attack loops concurrently with
// sleep()s between shots, so who shoots when is set by the JS scheduler:
//   blue strike 1, red strike 1, blue missile 1, red missile 1,
//   then blue strike+missile, red strike+missile, ... alternating
// (a side whose remaining attacks have no target drops out). runAttacks below
// replays that order explicitly.

import { RED_BASE_IDX, BLUE_BASE_IDX, BLUE_DEPLOY_IDX, RED_DEPLOY_IDX, ATTACK_RANGE, BASE_START_HP, START_INCOME, START_ORE } from './config.js';
import { TEMPLATES, calculatePrimeFactors } from './templates.js';
import { calcOreIncome, maxLoanFor, oreDivisor, excessExponent } from './economy.js';
import { SHIP_NUMS } from './templates.js';

// Ship prices for one ore level, all ships at once: the same expression as cost() in
// economy.js (so the same numbers to the last bit), computed once per ore value instead of
// on every call. Ore changes slowly, so a small cache covers nearly every lookup.
const priceCache = new Map();
function priceTable(ore) {
    let t = priceCache.get(ore);
    if (t) return t;
    if (priceCache.size > 4096) priceCache.clear();
    t = new Float64Array(84);
    const d = oreDivisor(ore);
    for (const n of SHIP_NUMS) {
        const excess = excessExponent(n);
        t[n] = Math.pow(n, 1 + (excess ** 2 / (excess + d)));
    }
    priceCache.set(ore, t);
    return t;
}
/** cost(num, ore) from economy.js, cached. */
export const costOf = (num, ore) => priceTable(ore)[num];

export const SIDES = ['blue', 'red'];
export const enemyOf = side => (side === 'blue' ? 'red' : 'blue');

/** A fresh match with the same starting values newGame() uses for Normal. */
export function newSimState() {
    const side = () => ({
        hp: BASE_START_HP, armor: 1, armor_gain: 0, income: START_INCOME, money: 0, ore: START_ORE,
        ore_boost: 1, ore_income: 0, ships: [], history: [],
    });
    const S = { turn: 0, blue: side(), red: side(), over: null };
    S.blue.regen = 0;      // newGame gives blue regen 0 and red regen undefined;
    S.red.ore_delay = 0;   // both are no-ops at these values but keep the shape.
    startNewTurn(S);
    return S;
}

const SIDE_KEYS = ['hp', 'armor', 'armor_gain', 'regen', 'income', 'money', 'ore', 'ore_boost', 'ore_delay', 'ore_income'];

function copyShip(s) {
    return { number: s.number, attack: s.attack, health: s.health, sector: s.sector, row: s.row, template: s.template, dying: false };
}

/** Snapshot of the live game's state (or another sim state) that the sim can play forward. */
export function cloneState(src) {
    const S = { turn: src.turn, over: src.over ?? null };
    for (const side of SIDES) {
        const o = {};
        for (const k of SIDE_KEYS) if (src[side][k] !== undefined) o[k] = src[side][k];
        o.ships = src[side].ships.filter(s => s.health > 0).map(copyShip);
        o.history = []; // purchases made from here on (read the source's own history for the past)
        S[side] = o;
    }
    return S;
}

export function canAfford(S, side, num) {
    return S[side].money + maxLoanFor(S[side].income) >= costOf(num, S[side].ore);
}

// Same result as recomputeRows in combat.js: within each sector, ships keep their row order
// (ties in array order) and are renumbered 0, 1, 2, ...
const rowBuckets = Array.from({ length: 9 }, () => []);
function recomputeRows(S) {
    for (const owner of SIDES) {
        for (const b of rowBuckets) b.length = 0;
        for (const s of S[owner].ships) rowBuckets[s.sector].push(s);
        for (const b of rowBuckets) {
            // stable insertion sort by row (buckets hold a few ships; same order as Array.sort)
            for (let i = 1; i < b.length; i++) {
                const x = b[i];
                let j = i - 1;
                while (j >= 0 && b[j].row > x.row) { b[j + 1] = b[j]; j--; }
                b[j + 1] = x;
            }
            for (let i = 0; i < b.length; i++) b[i].row = i;
        }
    }
}

export class SimError extends Error {}

function deployShip(S, owner, num, sector) {
    const tpl = TEMPLATES[num];
    // The live game throws here too (tpl.attack of undefined) and the match freezes.
    if (!tpl) throw new SimError(`no ship #${num}`);
    const own = S[owner].ships;
    if ((num === 61 || num === 67) && own.length) {
        sector = owner === 'blue' ? Math.max(...own.map(s => s.sector)) : Math.min(...own.map(s => s.sector));
    }
    // A new ship always ends up last in its sector: recomputeRows would give it the next row,
    // so it gets that row directly (rows are normalised whenever ships are deployed).
    let row = 0;
    for (const s of own) if (s.sector === sector) row++;
    const ship = { number: num, attack: tpl.attack, health: tpl.health, sector, row, template: tpl, dying: false };
    own.push(ship);
    for (let i = 0; i < 2 ** own.filter(s => s.number == 71).length; i++) {
        triggerOnDeploy(S, owner, num, sector, ship);
    }
    return ship;
}

function triggerOnDeploy(S, owner, num, sector, ship) {
    const me = S[owner];
    if (num === 53) ship.attack += me.income;
    if (num > 0 && num % 7 === 0) { me.income += num / 7; me.hp -= 3; }
    if (num > 0 && num % 49 === 0) { me.income += num / 7; me.hp -= 3; }
    if (num === 73) me.hp += ship.attack;
    if (TEMPLATES[num].win) S[enemyOf(owner)].hp -= ship.attack;
    if (num === 41) {
        for (let i = 1; i <= 23; i++) if (calculatePrimeFactors(i).length === 1) deployShip(S, owner, i, sector);
    }
    if (num % 31 === 0) {
        for (let i = 1; i <= 10 * num / 31; i++) deployShip(S, owner, i, sector);
    }
    if (num === 59) for (const s of me.ships) s.attack += 1;
}

function buyShip(S, owner, num) {
    const me = S[owner];
    if (!canAfford(S, owner, num)) { me.history.push(0); return false; }
    me.history.push(num);
    me.money -= costOf(num, me.ore);
    if (me.money < 0) me.money *= 1.25;
    deployShip(S, owner, num, owner === 'blue' ? BLUE_DEPLOY_IDX : RED_DEPLOY_IDX);
    return true;
}

// ---- attack phase -------------------------------------------------------

// Per-phase index of living ships by sector, so target lookup doesn't re-sort
// every enemy ship for every shot (combat.js does; the result is the same).
function buildIndex(S) {
    const idx = {};
    for (const owner of SIDES) {
        const secs = [];
        const cnt = [];
        for (let i = 0; i <= 8; i++) { secs.push([]); cnt.push(0); }
        for (const s of S[owner].ships) {
            if (s.health > 0) { secs[s.sector].push(s); cnt[s.sector]++; }
        }
        for (const list of secs) list.sort((a, b) => a.row - b.row);
        idx[owner] = { secs, cnt, head: new Array(9).fill(0) };
    }
    return idx;
}

function frontOf(ix, sec) {
    const list = ix.secs[sec];
    let h = ix.head[sec];
    while (h < list.length && list[h].health <= 0) h++;
    ix.head[sec] = h;
    return list[h];
}

/** Same answer as findTarget in combat.js: { target, base } or null. */
function findTarget(idx, ship) {
    const enemy = ship.owner === 'blue' ? 'red' : 'blue';
    const ix = idx[enemy];
    const range = ship.template.number % 11 === 0 ? 3 : ATTACK_RANGE;
    const baseSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;
    const lo = Math.max(1, ship.sector - range);
    const hi = Math.min(7, ship.sector + range);
    // Enemy priority runs from the enemy ship nearest the attacker's side.
    const step = enemy === 'blue' ? -1 : 1;
    const start = step === -1 ? hi : lo;
    let best = -1;
    if (ship.number % 5 === 0) {
        let bestKey = -1;
        for (let sec = start; sec >= lo && sec <= hi; sec += step) {
            const c = ix.cnt[sec];
            if (c <= 0) continue;
            const key = c + (sec === baseSec ? 1 : 0);
            if (key > bestKey) { bestKey = key; best = sec; }
        }
    } else {
        for (let sec = start; sec >= lo && sec <= hi; sec += step) {
            if (ix.cnt[sec] > 0) { best = sec; break; }
        }
    }
    if (best >= 0) {
        if (best === baseSec) return { target: null, base: true };
        return { target: frontOf(ix, best), base: false };
    }
    if (Math.abs(baseSec - ship.sector) <= range) return { target: null, base: true };
    return null;
}

function hurt(S, idx, ship, dmg) {
    ship.health -= Math.max(dmg - (ship.number % 19 === 0 ? ship.number / 19 : 0), 0);
    if (ship.health <= 0 && !ship.dying) {
        ship.dying = true;
        idx[ship.owner].cnt[ship.sector]--;
    }
}

function strike(S, idx, ship) {
    const t = findTarget(idx, ship);
    if (!t) return null;
    const enemy = ship.owner === 'blue' ? 'red' : 'blue';
    ship.attackedThisTurn = true;
    if (t.base) S[enemy].hp -= ship.attack / S[enemy].armor;
    else hurt(S, idx, t.target, ship.attack);
    return t.base ? (ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX) : t.target.sector;
}

function missiles(S, idx, ship, tsec) {
    const n = ship.template.number;
    const shots = (n % 5 === 0 ? 1 : 0) + (n % 25 === 0 ? 1 : 0);
    if (!shots) return;
    const enemy = ship.owner === 'blue' ? 'red' : 'blue';
    const bSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;
    const dmg = n / 5;
    for (let k = 0; k < shots; k++) {
        for (const h of idx[enemy].secs[tsec]) if (h.health > 0) hurt(S, idx, h, dmg);
        if (tsec === bSec) S[enemy].hp -= dmg / S[enemy].armor;
    }
}

function attackList(S, idx, owner) {
    const ships = S[owner].ships.filter(s => s.health > 0);
    ships.sort((a, b) => {
        const da = owner === 'blue' ? -a.sector : a.sector;
        const db = owner === 'blue' ? -b.sector : b.sector;
        if (da !== db) return da - db;
        return a.row - b.row;
    });
    return ships.filter(s => findTarget(idx, s));
}

function runAttacks(S) {
    for (const o of SIDES) for (const s of S[o].ships) s.owner = o;
    const idx = buildIndex(S);
    const lists = { blue: attackList(S, idx, 'blue'), red: attackList(S, idx, 'red') };
    const pos = { blue: 0, red: 0 };
    // Advance a side to its next attack that still has a target and fire the strike.
    const nextStrike = side => {
        const list = lists[side];
        while (pos[side] < list.length) {
            const ship = list[pos[side]++];
            const tsec = strike(S, idx, ship);
            if (tsec !== null) return { ship, tsec };
        }
        return null;
    };
    const b = nextStrike('blue');
    const r = nextStrike('red');
    if (b) missiles(S, idx, b.ship, b.tsec);
    if (r) missiles(S, idx, r.ship, r.tsec);
    const queue = [];
    if (b) queue.push('blue');
    if (r) queue.push('red');
    while (queue.length) {
        const side = queue.shift();
        const a = nextStrike(side);
        if (!a) continue;
        missiles(S, idx, a.ship, a.tsec);
        queue.push(side);
    }
    for (const o of SIDES) for (const s of S[o].ships) s.dying = false;
}

// ---- turn ----------------------------------------------------------------

function checkOver(S) {
    if ((S.blue.hp <= 0 || S.red.hp <= 0) && S.red.hp !== S.blue.hp) {
        S.over = S.red.hp > S.blue.hp ? 'red' : 'blue';
        return true;
    }
    return false;
}

function startNewTurn(S) {
    S.turn++;
    S.blue.money += S.blue.income;
    S.red.money += S.red.income;
}

/** One full turn, as runTurn() plays it. picks are ship numbers, 0 = skip. */
export function stepTurn(S, bluePick, redPick) {
    if (S.over) return S;
    // history mirrors state[side].history in the live game: the ship bought, or 0
    if (bluePick) buyShip(S, 'blue', bluePick); else S.blue.history.push(0);
    if (redPick) buyShip(S, 'red', redPick); else S.red.history.push(0);
    if (checkOver(S)) return S;

    runAttacks(S);
    if (checkOver(S)) return S;

    for (const owner of SIDES) {
        S[owner].ships = S[owner].ships.filter(s => s.health > 0);
        S[owner].ships.sort((a, b) => a.row - b.row);
        const dir = owner === 'blue' ? +1 : -1;
        for (const ship of S[owner].ships) {
            if (!ship.attackedThisTurn) {
                const next = ship.sector + dir;
                if (next >= 1 && next <= 7) { ship.sector = next; ship.row = 999; }
            }
            ship.attackedThisTurn = false;
        }
    }
    recomputeRows(S);

    for (const owner of SIDES) {
        const me = S[owner];
        const enemy = enemyOf(owner);
        if (me.regen !== undefined && me.hp >= 100) me.hp += me.regen;
        const deployments = [];
        for (const s of me.ships) {
            const n = s.template.number;
            if (n % 37 === 0) s.attack *= 1 + n / 37;
            if (n % 23 === 0) me.income += n / 23;
            if (n % 17 === 0) S[enemy].hp -= n / 17;
            if (n % 13 === 0) deployments.push([2 * n / 13, s.sector]);
            if (n % 47 === 0) { deployments.push([s.attack, s.sector]); s.attack += 2; }
            if (n % 43 === 0) {
                s.attack += 1;
                for (let i = 0; i < s.attack; i++) deployments.push([2, s.sector]);
            }
            if (n % 29 === 0) me.armor += n / 29;
            if (n % 58 === 0) me.armor *= 2;
        }
        const ore = calcOreIncome(owner, S);
        if (ore > 0) me.ore += ore;
        if (S.turn >= 11) me.armor += me.armor_gain;
        for (const [num, sec] of deployments) deployShip(S, owner, num, sec);
    }
    // (rows are already in order here: movement renumbered them and deployShip keeps them so)
    if (checkOver(S)) return S;

    startNewTurn(S);
    return S;
}
