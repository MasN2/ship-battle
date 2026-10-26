// Mining-window gate (playtest 31): when does buying a miner now beat the grandmaster's own pick?
// Fitted to real games played out both ways (tools/windows.js, tools/fitwindow.js), so it learns
// the windows that actually paid - a held centre, a quiet board, the tail of a push - and the
// frenzies where mining feeds the opponent's counterwave.

import { FEATURE_NAMES } from './features.js';
import { TEMPLATES } from './templates.js';

export const WINDOW_INPUTS = [
    ...FEATURE_NAMES,
    'miningGap', 'incomeGap', 'frontGap', 'midGap', 'homeThreat',
    'fragile', 'sturdy', 'price', 'ownSkip', 'ownTrader', 'ownFighter',
];

const fi = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, i]));

/** Gate inputs: the position features (js/features.js), miner n, and the pick it would replace. */
export function windowInputs(f, n, own) {
    const t = TEMPLATES[n];
    const o = TEMPLATES[own];
    return [
        ...f,
        f[fi.mining] - f[fi.miningThem], f[fi.income] - f[fi.incomeThem], f[fi.front] - f[fi.frontThem],
        f[fi.powMid] - f[fi.powMidThem], f[fi.powHomeThem],
        t.health < 15 ? 1 : 0, t.health >= 15 ? 1 : 0, n,
        own ? 0 : 1, o?.incomeBoost ? 1 : 0, own && !o?.incomeBoost ? 1 : 0,
    ];
}

export function windowGain(model, f, n, own) {
    const x = windowInputs(f, n, own);
    return model.w[0] + x.reduce((t, v, i) => t + model.w[i + 1] * (v - model.mu[i]) / (model.sd[i] || 1), 0);
}
