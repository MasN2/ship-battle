// One bot-vs-bot game on the headless rules, plus the bot roster. Shared by tourney.js
// and roundrobin.js.

import os from 'os';
import { newSimState, stepTurn, SimError, canAfford } from '../js/sim.js';
import { mulberry32 } from './rng.js';
import { normalBot, scriptBot, greedEconBot, grandmasterBot, HUMAN_ORDERS } from './bots.js';
import { POLICIES, GM_DEFAULTS, visibleShips } from '../js/grandmaster.js';
import { evolvedBot, seedWeights } from '../js/evolved.js';
import { EVOLVED_WEIGHTS } from '../js/evolved-weights.js';

/** Wraps a deterministic bot: with chance eps (2·eps early on) it plays a random visible ship or skips. */
export function noisy(bot, eps) {
    return (S, side, rng, memo) => {
        const p = S.turn <= 8 ? 2 * eps : eps;
        if (rng() < p) {
            const menu = visibleShips(S, side).filter(n => canAfford(S, side, n));
            const k = Math.floor(rng() * (menu.length + 1));
            return k < menu.length ? menu[k] : 0;
        }
        return bot(S, side, rng, memo);
    };
}

export function makeBot(name, cfg, eps) {
    switch (name) {
        case 'normal': return normalBot;
        case 'gm': return grandmasterBot(cfg);
        // evolved one-turn bot: cfg = weights, else the saved champion, else the seed
        case 'evo': return evolvedBot(cfg ?? EVOLVED_WEIGHTS ?? seedWeights());
        case 'econ': return noisy(greedEconBot, eps);
        case 'alice': return noisy(scriptBot(HUMAN_ORDERS.alice_blue), eps);
        case 'alice-red': return noisy(scriptBot(HUMAN_ORDERS.alice_red), eps);
        // the user's winning playtest order, then the turtle style it was playing
        case 'user1': return noisy(scriptBot(HUMAN_ORDERS.user1_blue, (S, side, rng) => POLICIES.turtle(S, side, GM_DEFAULTS, rng)), eps);
        case 'user4': return noisy(scriptBot(HUMAN_ORDERS.user4_blue, (S, side, rng) => POLICIES.value(S, side, GM_DEFAULTS, rng)), eps);
        case 'user2': return noisy(scriptBot(HUMAN_ORDERS.user2_blue, (S, side, rng) => POLICIES.value(S, side, GM_DEFAULTS, rng)), eps);
        default:
            // pol:<name> plays one of grandmaster's rollout styles on its own (spend, smart, econ, mine, big)
            if (name.startsWith('pol:') && POLICIES[name.slice(4)]) {
                const pol = POLICIES[name.slice(4)];
                return noisy((S, side, rng) => pol(S, side, GM_DEFAULTS, rng), eps);
            }
            throw new Error(`unknown bot ${name}`);
    }
}

export function randomOpening(bot, turns) {
    return (S, side, rng, memo) => {
        if (S.turn > turns) return bot(S, side, rng, memo);
        const menu = visibleShips(S, side).filter(n => canAfford(S, side, n));
        const k = Math.floor(rng() * (menu.length + 1));
        return k < menu.length ? menu[k] : 0;
    };
}

export function playGame(seed, aName, bName, aCfg, bCfg, aSide, maxTurns, eps, open) {
    const rng = mulberry32(seed);
    const bots = {};
    bots[aSide] = randomOpening(makeBot(aName, aCfg, eps), open);
    bots[aSide === 'red' ? 'blue' : 'red'] = randomOpening(makeBot(bName, bCfg, eps), open);
    const memo = { blue: {}, red: {} };
    const S = newSimState();
    const picks = { blue: [], red: [] };
    const ms = { blue: 0, red: 0 };
    const maxMs = { blue: 0, red: 0 };
    const econ = {};
    let crash = false;
    while (!S.over && S.turn <= maxTurns) {
        let t0 = performance.now();
        const bp = bots.blue(S, 'blue', rng, memo.blue) || 0;
        let dt = performance.now() - t0;
        ms.blue += dt; maxMs.blue = Math.max(maxMs.blue, dt);
        t0 = performance.now();
        const rp = bots.red(S, 'red', rng, memo.red) || 0;
        dt = performance.now() - t0;
        ms.red += dt; maxMs.red = Math.max(maxMs.red, dt);
        picks.blue.push(bp);
        picks.red.push(rp);
        if (S.turn === 20 || S.turn === 30) econ[S.turn] = { blue: { income: S.blue.income, ore: S.blue.ore }, red: { income: S.red.income, ore: S.red.ore } };
        try { stepTurn(S, bp, rp); } catch (e) {
            if (!(e instanceof SimError)) throw e;
            crash = true;
            break;
        }
    }
    const winner = S.over ?? (crash ? 'crash' : 'timeout');
    const terminus = S.over ? picks[S.over][picks[S.over].length - 1] === 83 : false;
    return {
        seed, aSide, winner, aWon: winner === aSide, bWon: winner !== aSide && (winner === 'red' || winner === 'blue'),
        turns: S.turn, terminus, picks, econ,
        msPerTurn: { a: ms[aSide] / S.turn, b: ms[aSide === 'red' ? 'blue' : 'red'] / S.turn },
        maxMs: { a: maxMs[aSide], b: maxMs[aSide === 'red' ? 'blue' : 'red'] },
        end: { blue: { hp: S.blue.hp, income: S.blue.income, ore: S.blue.ore }, red: { hp: S.red.hp, income: S.red.income, ore: S.red.ore } },
    };
}

/** Worker threads for the parallel tools: a quarter of the cores by default so the machine
    stays cool and usable (SB_THREADS=n overrides), and the process drops to below-normal priority. */
export function workerCount(cap = Infinity) {
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here */ }
    const want = Number(process.env.SB_THREADS) || Math.max(1, Math.floor(os.cpus().length / 4));
    return Math.max(1, Math.min(cap, want));
}
