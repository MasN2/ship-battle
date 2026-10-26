// Game modifiers: opt-in rule changes chosen on the New Game screen (starting economy, ship
// stats, prime discounts, a mirrored fleet already on the field). A standard game uses
// DEFAULT_MODS, which leaves every value exactly as in config.js / templates.js.
//
// Ship stats and prices are changed where the rules read them (TEMPLATES and cost()), so the
// AIs' lookahead (js/sim.js) plays by the same modified rules as the live game.

import { BASE_START_HP, START_INCOME, START_ORE } from './config.js';
import { TEMPLATES, SHIP_NUMS } from './templates.js';
import { priceMult } from './economy.js';
import { clearPriceCache } from './sim.js';
import { clearPriceMemos } from './grandmaster.js';

export const DISCOUNT_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

export const DEFAULT_MODS = {
    startMoney: 0,
    startIncome: START_INCOME,
    startOre: START_ORE,
    baseHp: BASE_START_HP,
    shipHp: 1,
    shipAtk: 1,
    discount: [],       // primes whose ships are cheaper
    discountPct: 30,
    opening: 'none',    // key of OPENINGS
};

// Fleets placed for both sides before turn 1: [ship number, sector] from blue's side; red gets
// the mirror image (sector 8 - s). Blue at 3 and red at 5 are in range, so they fight at once.
export const OPENINGS = {
    none: { label: 'Empty field' },
    skirmish: { label: 'Skirmish line', desc: 'Corvette + Skiff in range, a Driller behind', fleet: [[2, 3], [1, 3], [3, 2]] },
    standoff: { label: 'Mining standoff', desc: 'Two Drillers in the centre, a Frigate guarding', fleet: [[3, 3], [3, 3], [4, 2]] },
    heavy: { label: 'Heavy clash', desc: 'Destroyer and Reaver already trading fire', fleet: [[8, 3], [6, 3], [2, 2], [2, 2]] },
    random: { label: 'Random mirror', desc: 'A different mirrored fleet every game' },
};

export const PRESETS = {
    standard: { label: 'Standard', desc: 'The usual rules', mods: {} },
    blitz: { label: 'Blitz', desc: 'Low base HP, cash up front', mods: { baseHp: 80, startMoney: 10 } },
    glass: { label: 'Glass Cannons', desc: 'Half HP ships, fights end fast', mods: { shipHp: 0.5 } },
    juggernaut: { label: 'Juggernauts', desc: 'Double HP ships, long grinds', mods: { shipHp: 2 } },
    boom: { label: 'Boom Economy', desc: 'Start with 8 income and 30 ore', mods: { startIncome: 8, startOre: 30 } },
    oreRush: { label: 'Ore Rush', desc: 'Miners (×3) 40% off', mods: { discount: [3], discountPct: 40 } },
    missiles: { label: 'Missile Season', desc: 'Missile ships (×5) 40% off, half HP', mods: { discount: [5], discountPct: 40, shipHp: 0.5 } },
    brawl: { label: 'Brawl', desc: 'Skirmish line already engaged', mods: { opening: 'skirmish' } },
    chaos: { label: 'Chaos', desc: 'Random modifiers every game', mods: null },
};

const ORIGINAL = Object.fromEntries(SHIP_NUMS.map(n => [n, { attack: TEMPLATES[n].attack, health: TEMPLATES[n].health }]));

const pick = a => a[Math.floor(Math.random() * a.length)];

/** A random but playable mix of modifiers. */
export function chaosMods() {
    const m = { ...DEFAULT_MODS, discount: [] };
    const knobs = [
        () => { m.startMoney = pick([5, 10, 15, 20]); },
        () => { m.startIncome = pick([2, 3, 6, 8]); },
        () => { m.startOre = pick([20, 40, 60]); },
        () => { m.baseHp = pick([80, 120, 240, 320]); },
        () => { m.shipHp = pick([0.5, 0.75, 1.5, 2]); },
        () => { m.shipAtk = pick([0.5, 1.5, 2]); },
        () => { m.discount = [pick(DISCOUNT_PRIMES)]; m.discountPct = pick([30, 40, 50]); },
        () => { m.opening = pick(['skirmish', 'standoff', 'heavy', 'random']); },
    ];
    const order = knobs.sort(() => Math.random() - 0.5);
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) order[i]();
    return m;
}

export function normalizeMods(mods) {
    return { ...DEFAULT_MODS, ...(mods || {}), discount: [...(mods?.discount ?? [])] };
}

export function isDefault(mods) {
    return describeMods(mods).length === 0;
}

/** Short labels for each active modifier, e.g. ["Ship HP ×0.5", "×3 ships 40% off"]. */
export function describeMods(mods) {
    const m = normalizeMods(mods);
    const d = DEFAULT_MODS;
    const out = [];
    if (m.startMoney !== d.startMoney) out.push(`Start money ${m.startMoney}`);
    if (m.startIncome !== d.startIncome) out.push(`Income ${m.startIncome}`);
    if (m.startOre !== d.startOre) out.push(`Start ore ${m.startOre}`);
    if (m.baseHp !== d.baseHp) out.push(`Base HP ${m.baseHp}`);
    if (m.shipHp !== d.shipHp) out.push(`Ship HP ×${m.shipHp}`);
    if (m.shipAtk !== d.shipAtk) out.push(`Ship attack ×${m.shipAtk}`);
    if (m.discount.length) out.push(`${m.discount.map(p => '×' + p).join(' ')} ships ${m.discountPct}% off`);
    if (m.opening !== 'none') out.push(OPENINGS[m.opening]?.label ?? m.opening);
    return out;
}

/** Sets ship stats and prices for these modifiers (DEFAULT_MODS restores the originals). */
export function applyBalanceMods(mods) {
    const m = normalizeMods(mods);
    for (const n of SHIP_NUMS) {
        const o = ORIGINAL[n];
        TEMPLATES[n].health = m.shipHp === 1 ? o.health : Math.max(1, Math.round(o.health * m.shipHp));
        TEMPLATES[n].attack = m.shipAtk === 1 ? o.attack : Math.max(1, Math.round(o.attack * m.shipAtk));
    }
    priceMult.fill(1);
    if (m.discount.length) {
        for (const n of SHIP_NUMS) {
            if (m.discount.some(p => n % p === 0)) priceMult[n] = 1 - m.discountPct / 100;
        }
    }
    clearPriceCache();
    clearPriceMemos();
}

function randomFleet() {
    const fleet = [];
    const size = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < size; i++) fleet.push([pick([1, 2, 2, 3, 4, 4, 5, 6, 8, 9]), pick([2, 3, 3, 4])]);
    return fleet;
}

/** Places the opening fleet (mirrored) for both sides. `newId` hands out ship ids. */
export function seedOpening(state, mods, newId) {
    const m = normalizeMods(mods);
    const fleet = m.opening === 'random' ? randomFleet() : OPENINGS[m.opening]?.fleet;
    if (!fleet) return;
    for (const [num, sector] of fleet) {
        for (const owner of ['blue', 'red']) {
            const tpl = TEMPLATES[num];
            state[owner].ships.push({
                id: newId(), owner, number: num, attack: tpl.attack, health: tpl.health,
                maxHealth: Math.max(tpl.health, 10), sector: owner === 'blue' ? sector : 8 - sector,
                row: 0, template: tpl, justDeployed: false,
            });
        }
    }
    for (const owner of ['blue', 'red']) {
        const bySector = {};
        for (const s of state[owner].ships) s.row = (bySector[s.sector] = (bySector[s.sector] ?? -1) + 1);
    }
}
