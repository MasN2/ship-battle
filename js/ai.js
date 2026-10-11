import { state } from './state.js';
import { MAX_LOAN } from './config.js';
import { SHIP_NUMS } from './templates.js';
import { cost } from './economy.js';

export function getWeightedRandom(items, weights) {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
        if (random < weights[i]) return items[i];
        random -= weights[i];
    }
}

export function getHighestWeightItem(items, weights) {
    if (!items.length || !weights.length) return undefined;
    let maxIndex = 0;
    let maxWeight = weights[0];
    for (let i = 1; i < weights.length; i++) {
        if (weights[i] > maxWeight) {
            maxWeight = weights[i];
            maxIndex = i;
        }
    }
    return items[maxIndex];
}

export function pickAIR(det = false) {
    const red = state.red;
    const affordable = SHIP_NUMS.filter(n => cost(n, red.ore) <= red.money + MAX_LOAN);
    affordable.push(0);

    const items = [];
    const weights = [];

    for (const num of affordable) {
        items.push(num);
        let w = num > 3 ? cost(num, 0) : 5;
        const blueHasSector5 = state.blue.ships.some(s => s.sector === 5);

        if (num % 3 === 0) {
            w *= 2;
            if (blueHasSector5) w = 0;
        }
        if (num % 7 === 0 && num !== 0) {
            w *= (state.red.hp - 20) / Math.min(state.red.income, 10);
            if (blueHasSector5) w = 0;
        }
        if (items.includes(7) && num === 0) w = 0;
        if (num % 17 === 0 && num !== 0) {
            w *= (40 * (num / 17) / state.blue.hp) ** 4;
            if (blueHasSector5) w = 0;
        }
        if (num % 5 === 0 && num > 0) {
            w *= (state.blue.ships.length ** 3) / 300;
        }
        if (num % 3 !== 0 && num % 7 !== 0 && state.red.ships.some(s => s.sector === 3)) {
            w = 0;
        }
        if (num >= 67) w *= 1000000;

        const loan = Math.max(0, cost(num, red.ore) - red.money);
        w = Math.max(0, w - 2 * loan);
        weights.push(w);
    }

    return det ? getHighestWeightItem(items, weights) : getWeightedRandom(items, weights);
}