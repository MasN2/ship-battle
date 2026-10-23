import { MAX_LOAN, ORE_BASE, ORE_POW, ORE_R } from './config.js';

export function maxLoanFor(income) {
    return MAX_LOAN + 0.15 * Math.max(0, income - 8);
}

export function oreDivisor(ore) {
    return ((ore + ORE_BASE) ** ORE_POW - ORE_BASE ** ORE_POW) / ORE_R;
}

export function excessExponent(shipNum) {
    if (shipNum < 20.5) return 0.34 + 0.01*shipNum;
    return 0.56 * (1.021 ** (shipNum - 21));
}

export function cost(shipNum, ore) {
    const excess = excessExponent(shipNum);
    return Math.pow(shipNum, 1 + (excess ** 2 / (excess + oreDivisor(ore))));
}

export function economy(income, ore) {
    if (income <= 0) return 0;

    let low = 0;
    let high = Math.max(1, income);

    // Dynamically expand the upper bound until cost(high, ore) >= income
    while (cost(high, ore) < income) {
        low = high;
        high *= 2;
    }

    // Binary search (bisection) for high precision
    for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2;
        const currentCost = cost(mid, ore);

        if (currentCost < income) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

export function balance(income, ore){
    const target = economy(income, ore+1);
    return 1/(cost(target, ore) - cost(target, ore+1));
}

export function calcOreIncome(owner, state) {
    let total = 0;
    for (const s of state[owner].ships) {
        let mult = (s.sector >= 3 && s.sector <= 5) ? 1 : 0;
        if (s.template.number % 33 === 0) mult = 1;
        if (s.template.number % 3 === 0) total += (s.template.number / 3) * mult;
        if (s.template.number % 9 === 0) total += (s.template.number / 3) * mult;
        if (s.template.number % 27 === 0) total += (s.template.number / 3) * mult;
    }
    total *= state[owner].ore_boost;
    const delay = state[owner].ore_delay;
    if (delay !== undefined && state.turn > 16) {
        total += (state.turn - 14) * delay;
    }
    return total + state[owner].ore_income;
}
