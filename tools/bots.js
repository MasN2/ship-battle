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
