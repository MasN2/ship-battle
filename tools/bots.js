// Opponents for tournaments. Every bot is (S, side, rng, memo) -> ship number (0 = skip),
// chosen from the state before either side's purchase this turn, like the live game.

import { MAX_LOAN } from '../js/config.js';
import { SHIP_NUMS } from '../js/templates.js';
import { cost } from '../js/economy.js';
import { enemyOf, canAfford } from '../js/sim.js';
import { chooseGrandmaster } from '../js/grandmaster.js';

/** Sectors as seen from `side`: red's sector 5 is blue's sector 3. */
const rel = (side, sec) => (side === 'red' ? sec : 8 - sec);

/** pickAIR() from js/ai.js (the live Normal AI), rewritten to play either side. */
export function normalBot(S, side, rng) {
    const me = S[side];
    const foe = S[enemyOf(side)];
    const affordable = SHIP_NUMS.filter(n => cost(n, me.ore) <= me.money + MAX_LOAN);
    affordable.push(0);
    const items = [];
    const weights = [];
    const foeHasSector5 = foe.ships.some(s => s.sector === rel(side, 5));
    for (const num of affordable) {
        items.push(num);
        let w = num > 3 ? cost(num, 0) : 5;
        if (num % 3 === 0) { w *= 2; if (foeHasSector5) w = 0; }
        if (num % 7 === 0 && num !== 0) { w *= (me.hp - 20) / Math.min(me.income, 10); if (foeHasSector5) w = 0; }
        if (items.includes(7) && num === 0) w = 0;
        if (num % 17 === 0 && num !== 0) { w *= (40 * (num / 17) / foe.hp) ** 4; if (foeHasSector5) w = 0; }
        if (num % 5 === 0 && num > 0) w *= (foe.ships.length ** 3) / 300;
        if (num % 3 !== 0 && num % 7 !== 0 && me.ships.some(s => s.sector === rel(side, 3))) w = 0;
        if (num >= 67) w *= 1000000;
        const loan = Math.max(0, cost(num, me.ore) - me.money);
        w = Math.max(0, w - 2 * loan);
        weights.push(w);
    }
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
        if (r < weights[i]) return items[i];
        r -= weights[i];
    }
    return 0; // all weights zero: pickAIR returns undefined and runTurn skips
}

/** Replays a fixed build order (a human's opening), then hands over to `then`. */
export function scriptBot(order, then = normalBot) {
    return (S, side, rng, memo) => {
        if (S.turn <= order.length) return order[S.turn - 1];
        return then(S, side, rng, memo);
    };
}

/** Pure economy: traders while it can, then the biggest thing affordable. */
export function greedEconBot(S, side) {
    const me = S[side];
    if (me.hp > 60 && me.income < 40 && canAfford(S, side, 7) && me.money >= cost(7, me.ore)) return 7;
    if (me.income < 40) return 0;
    for (let i = SHIP_NUMS.length - 1; i >= 0; i--) if (cost(SHIP_NUMS[i], me.ore) <= me.money) return SHIP_NUMS[i];
    return 0;
}

export function grandmasterBot(cfg) {
    return (S, side, rng, memo) => chooseGrandmaster(S, side, { rng, memo, cfg });
}

// Human build orders from js/scenarios.js ("Defense Practice 1"), blue and red.
export const HUMAN_ORDERS = {
    alice_blue: [2, 3, 3, 3, 3, 3, 0, 0, 7, 0, 7, 0, 7, 0, 7, 5, 5, 5, 7, 4, 7, 3, 9, 0, 9, 3, 9, 9, 7, 7, 7, 7, 0, 21],
    alice_red: [0, 3, 0, 7, 0, 0, 1, 8, 1, 2, 1, 3, 1, 7, 0, 7, 3, 6, 0, 7, 0, 7, 7, 0, 8, 7, 7, 8, 8, 5, 5, 10, 8, 11, 7, 7, 12, 4, 12, 7, 6, 14, 7, 21, 16, 14, 16],
};

// Playtest 2026-10-23: the user beat grandmaster (as red) with this order: three traders,
// then Frigates stacked in the home sector, then the counterwave. (Red's moves are also kept.)
HUMAN_ORDERS.user1_blue = [1, 3, 0, 0, 7, 0, 0, 7, 0, 7, 1, 4, 4, 4, 4, 4, 6, 4, 4, 4, 4, 4, 4, 7, 4, 4, 4];
HUMAN_ORDERS.user1_red_gm = [0, 0, 0, 0, 8, 3, 2, 2, 4, 4, 0, 3, 3, 0, 0, 7, 0, 3, 0, 7, 1, 4, 5, 5, 4, 4, 4];

// Playtest 2 (same day): user out-econ'd grandmaster (traders turns 18-31, income 8 -> 19 vs 6),
// then won with big ships around turn 56.
HUMAN_ORDERS.user2_blue = [1, 3, 0, 0, 7, 0, 0, 7, 0, 7, 2, 4, 4, 4, 3, 3, 3, 7, 3, 3, 7, 7, 7, 3, 7, 7, 7, 7, 7, 7, 14, 5, 10, 10, 12, 10, 10, 10, 6, 12, 12, 6, 10, 13, 5, 8, 14, 8, 14, 8, 14, 8, 14, 8, 8, 8];
HUMAN_ORDERS.user2_red_gm = [0, 0, 0, 0, 8, 3, 2, 0, 1, 3, 7, 3, 0, 0, 7, 0, 2, 3, 5, 0, 3, 0, 8, 8, 0, 8, 0, 0, 2, 4, 2, 8, 5, 4, 7, 4, 4, 4, 0, 4, 0, 0, 10, 5, 0, 7, 7, 5, 1, 4, 4, 0, 10, 5, 5, 5];

// Playtest 4: user beat Grandmaster β with early traders then nonstop Frigates (a counterwave
// built from home). Only an economy opening beats this order in replays.
HUMAN_ORDERS.user4_blue = [1, 3, 0, 0, 7, 0, 0, 7, 4, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2];
HUMAN_ORDERS.user4_red_gmb = [0, 0, 2, 4, 2, 4, 0, 1, 3, 5, 0, 0, 7, 0, 0, 7, 1, 7, 0, 5, 5, 5, 5, 4, 4, 4, 4];

// Playtest 5 (2026-10-24): user beat Grandmaster β on turn 26 with traders then Frigate spam again.
HUMAN_ORDERS.user5_blue = [1, 3, 0, 0, 7, 0, 0, 7, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3];
HUMAN_ORDERS.user5_red_gmb = [0, 0, 2, 4, 1, 1, 3, 4, 3, 5, 0, 7, 0, 0, 7, 0, 3, 3, 4, 5, 5, 5, 5, 2, 4, 4];

// Playtest 7 (2026-10-24): user beat β v1.3β on turn 46; it pushed the player's base to 26 hp
// but fed Frigates into the counterwave and hoarded ~39 money with 26 ore instead of mining
// in the open board on the tail of its push.
HUMAN_ORDERS.user7_blue = [0, 0, 0, 7, 0, 0, 7, 2, 2, 4, 5, 2, 4, 2, 7, 2, 3, 3, 3, 7, 3, 7, 3, 7, 5, 7, 7, 4, 4, 10, 5, 8, 8, 4, 8, 4, 8, 8, 8, 4, 8, 8, 4, 8, 4, 4];
HUMAN_ORDERS.user7_red_gmb13 = [0, 0, 7, 0, 2, 1, 0, 1, 6, 1, 7, 0, 2, 6, 7, 0, 7, 0, 0, 10, 4, 5, 4, 8, 4, 6, 4, 0, 7, 0, 7, 0, 4, 1, 6, 11, 4, 5, 10, 10, 2, 8, 8, 8, 4, 8];

// Playtest 9 (2026-10-24): user beat β v1.5β in a long game; from turn ~20 it hoarded 26-33 money
// and sent skiffs instead of trailing drillers/traders, and the income gap compounded.
HUMAN_ORDERS.user9_blue = [1, 3, 0, 0, 7, 3, 3, 3, 3, 3, 3, 0, 7, 0, 7, 0, 7, 5, 5, 5, 5, 4, 6, 6, 6, 3, 3, 9, 3, 6, 6, 6, 6, 7, 7, 7, 7, 10, 7, 10, 14, 10, 10, 10, 10, 10, 10, 10, 15, 10, 10, 13, 10, 13, 10, 13, 10, 10, 13, 10, 10, 10, 10, 13, 10, 13, 10, 6, 12, 12, 12, 10, 12, 10, 13, 10, 14, 10, 14, 10, 11, 17, 10, 20, 17, 11, 10, 17, 17, 10, 15, 10, 17, 17];
HUMAN_ORDERS.user9_red_gmb15 = [0, 0, 0, 0, 8, 0, 0, 7, 0, 0, 6, 0, 1, 1, 3, 4, 7, 1, 7, 0, 2, 6, 1, 0, 1, 7, 7, 7, 11, 5, 5, 5, 10, 0, 0, 2, 0, 12, 0, 14, 0, 12, 0, 13, 0, 14, 8, 8, 12, 0, 13, 0, 14, 10, 13, 13, 0, 13, 8, 16, 8, 0, 0, 11, 19, 11, 0, 20, 13, 0, 13, 0, 0, 11, 21, 0, 19, 15, 0, 13, 7, 22, 13, 13, 12, 13, 12, 13, 13, 13, 0, 0, 12, 14];

// Playtest 10 (2026-10-24): user beat β v1.6β; it opened banking for a Destroyer, then over-
// invested (traders while its base was being destroyed) and still missed ore in open space.
HUMAN_ORDERS.user10_blue = [1, 3, 0, 0, 7, 0, 3, 2, 3, 7, 2, 3, 2, 7, 0, 7, 5, 5, 5, 5, 5, 5, 2, 4, 6, 6, 3, 3, 9, 3, 7, 7, 3, 9, 9, 6, 6, 8, 8, 2, 2, 17, 2, 2, 17, 2];
HUMAN_ORDERS.user10_red_gmb16 = [0, 0, 0, 0, 8, 0, 0, 7, 0, 0, 6, 2, 1, 2, 3, 6, 0, 7, 0, 7, 0, 2, 7, 3, 7, 7, 7, 7, 7, 7, 7, 7, 15, 7, 7, 7, 14, 7, 14, 13, 13, 0, 18, 12, 12, 14];

// Playtest 12 (2026-10-24): user beat β v1.7β on turn 64; at turn 48 it bought a Dreadnought that
// trailed in alone instead of mining. Per-opponent detail: #16 wins vs 6 of 10 imagined opponents
// (spend, econ, mine, wild x2, gridlock) and loses to smart/value; a Quarry wins only vs gridlock.
HUMAN_ORDERS.user12_blue = [1, 3, 3, 3, 2, 3, 0, 0, 7, 0, 7, 2, 4, 4, 4, 4, 3, 3, 3, 7, 3, 3, 7, 3, 7, 6, 3, 7, 7, 5, 5, 5, 6, 10, 5, 10, 6, 10, 6, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10, 8, 16, 10, 10, 12, 6, 6, 17, 8, 8, 17, 8, 8, 8, 8];
HUMAN_ORDERS.user12_red_gmb17 = [0, 0, 0, 4, 4, 4, 0, 0, 6, 3, 0, 7, 1, 0, 7, 3, 3, 3, 0, 7, 1, 5, 7, 5, 4, 4, 0, 7, 7, 7, 7, 0, 12, 9, 2, 8, 8, 10, 7, 8, 9, 9, 5, 9, 3, 14, 5, 16, 9, 9, 12, 9, 0, 0, 0, 29, 0, 0, 25, 4, 13, 8, 16, 8];

// Playtest 13 (2026-10-24): user beat β v1.7β; it trailed combat ships behind its pushes and
// started miners late. Basis for respect: 'push'.
HUMAN_ORDERS.user13_blue = [1, 3, 3, 2, 4, 2, 4, 4, 2, 2, 2, 2, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 7, 0, 7, 5, 5, 5, 4, 4, 5, 5, 3, 4, 4, 4, 6, 4, 6, 4, 4, 4, 4, 4];
HUMAN_ORDERS.user13_red_gmb17 = [0, 0, 0, 4, 2, 2, 0, 6, 1, 5, 5, 0, 0, 7, 2, 0, 4, 4, 2, 4, 2, 0, 7, 1, 2, 4, 4, 4, 3, 4, 5, 3, 0, 0, 9, 3, 1, 7, 2, 6, 1, 4, 5, 5, 5, 5, 4];
