// Zero: an AI that learned the game from scratch by playing itself (tools/zero/), with no
// hand-written tactics, opening book or lookahead. One glance at the board -> a probability
// for every move on the deploy bar, like a classifier: "this position is a 'buy Frigate'".
//
// It never sees a ship's identity as a bare id. Everything is the numbers a player reads:
// price right now (vs money and income), attack, hp, and what the primes do (ore mined, income
// gained, missile damage, range, armour, siege...). Training shuffles those numbers (balance
// noise, odd starts), so it has to learn what makes a buy good rather than memorise sequences.
//
// The board is seen from the chair of the side to move: 7 sectors from my base to theirs, mine
// and theirs. Each ship goes through a small shared encoder, and the encodings are summed per
// (owner, sector), so any number of ships fits and order inside a sector shows as row features.
//
// The same encoder runs in self-play (tools/zero/selfplay.js), which writes these features out
// for the trainer (tools/zero/train.py, PyTorch); the trainer rebuilds the net from them, so the
// forward pass here and the one there must stay identical (tools/zero/parity.js checks).

import { TEMPLATES, SHIP_NUMS } from './templates.js';
import { economy as economyRaw, maxLoanFor, calcOreIncome } from './economy.js';
import { costOf, canAfford } from './sim.js';
import { visibleShips } from './grandmaster.js';

export const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 89];
export const N_TYPES = SHIP_NUMS.length;
export const SKIP_TYPE = N_TYPES; // the type table's extra all-zero row
export const TYPE_IDX = new Int32Array(90).fill(-1);
SHIP_NUMS.forEach((n, i) => { TYPE_IDX[n] = i; });

export const TYPE_DIM = 13 + PRIMES.length;
export const SHIP_DYN = 4;
export const ACT_DYN = 5;
export const GLOBAL_DIM = 19;
export const CELLS = 14; // 7 sectors × (mine, theirs)

const l1p = Math.log1p;

/** What a player reads off ship n's card (current stats, so balance modifiers show). */
export function typeFeatures(n, out = new Float32Array(TYPE_DIM), o = 0) {
    const t = TEMPLATES[n];
    const has = p => n % p === 0;
    const ore = (has(3) ? n / 3 : 0) + (has(9) ? n / 3 : 0) + (has(27) ? n / 3 : 0);
    const deployIncome = (has(7) ? n / 7 : 0) + (has(49) ? n / 7 : 0);
    const missile = has(5) ? (n / 5) * (has(25) ? 2 : 1) : 0;
    out[o++] = l1p(n) / 4.5;
    out[o++] = l1p(t.attack) / 5;
    out[o++] = l1p(t.health) / 5;
    out[o++] = l1p(ore) / 3;
    out[o++] = has(33) ? 1 : 0;                       // mines anywhere
    out[o++] = l1p(deployIncome) / 2;
    out[o++] = has(7) ? (has(49) ? 2 : 1) : 0;        // base hp paid on deploy, in 3s
    out[o++] = l1p(has(23) ? n / 23 : 0);             // income per turn
    out[o++] = l1p(missile) / 3;
    out[o++] = has(31) ? 2 : has(11) ? 1 : 0;         // range beyond 2
    out[o++] = has(19) ? n / 19 / 3 : 0;              // damage reduction
    out[o++] = has(17) ? n / 17 / 3 : 0;              // siege per turn
    out[o++] = has(13) ? l1p(2 * n / 13) / 3 : 0;     // spawns ship #2n/13 per turn
    for (const p of PRIMES) out[o++] = has(p) ? 1 : 0;
    return out;
}

/** Card features for every ship type, plus a zero row for "skip". Rebuild after balance changes. */
export function typeTable() {
    const T = new Float32Array((N_TYPES + 1) * TYPE_DIM);
    SHIP_NUMS.forEach((n, i) => typeFeatures(n, T, i * TYPE_DIM));
    return T;
}

const econMemo = new Map();
function economy(income, ore) {
    const key = income * 100003 + ore;
    let v = econMemo.get(key);
    if (v === undefined) {
        if (econMemo.size > 100000) econMemo.clear();
        v = income > 0 ? economyRaw(income, ore) : 0;
        econMemo.set(key, v);
    }
    return v;
}
/** Forget memoised economy() values (after prices change). */
export function clearZeroMemos() { econMemo.clear(); }

function sideFeatures(S, o, out, k) {
    const x = S[o];
    const hp = Math.max(0, x.hp);
    out[k++] = Math.min(5, hp / 160);
    out[k++] = l1p(hp) / 6;
    out[k++] = Math.asinh(x.money / 10) / 3;
    out[k++] = l1p(Math.max(0, x.income)) / 3;
    out[k++] = l1p(Math.max(0, x.ore)) / 6;
    out[k++] = Math.log(Math.max(1e-3, x.armor ?? 1)) / 2;
    out[k++] = l1p(economy(x.income, x.ore)) / 4;
    out[k++] = Math.asinh((x.money + maxLoanFor(x.income)) / 10) / 3;
    out[k++] = l1p(Math.max(0, calcOreIncome(o, S))) / 3;
    return k;
}

/** The moves on `side`'s deploy bar it can pay for (loans included), skip (0) first. */
export function legalMoves(S, side) {
    const out = [0];
    for (const n of visibleShips(S, side)) if (canAfford(S, side, n)) out.push(n);
    return out;
}

/**
 * Everything the net sees, from `side`'s chair: { global, ships: {cell, type, dyn}, acts: {type, dyn}, moves }.
 * Ship and action features are a row of the type table plus a few numbers of their own.
 */
export function encode(S, side) {
    const opp = side === 'blue' ? 'red' : 'blue';
    const global = new Float32Array(GLOBAL_DIM);
    global[0] = Math.min(4, S.turn / 50);
    sideFeatures(S, opp, global, sideFeatures(S, side, global, 1));

    const nShips = S.blue.ships.length + S.red.ships.length;
    const cell = new Int32Array(nShips), stype = new Int32Array(nShips), sdyn = new Float32Array(nShips * SHIP_DYN);
    let m = 0;
    for (const [owner, base] of [[side, 0], [opp, 7]]) {
        for (const s of S[owner].ships) {
            if (s.health <= 0) continue;
            const d = side === 'blue' ? s.sector - 1 : 7 - s.sector; // 0 = my base .. 6 = theirs
            if (d < 0 || d > 6) continue;
            cell[m] = base + d;
            stype[m] = TYPE_IDX[s.number];
            const q = m * SHIP_DYN;
            sdyn[q] = l1p(Math.max(0, s.attack)) / 5;
            sdyn[q + 1] = l1p(Math.max(0, s.health)) / 5;
            sdyn[q + 2] = 1 / (1 + s.row);
            sdyn[q + 3] = s.row === 0 ? 1 : 0;
            m++;
        }
    }

    const moves = legalMoves(S, side);
    const me = S[side];
    const atype = new Int32Array(moves.length), adyn = new Float32Array(moves.length * ACT_DYN);
    const inc = Math.max(1, me.income);
    moves.forEach((n, i) => {
        const q = i * ACT_DYN;
        if (!n) { atype[i] = SKIP_TYPE; adyn[q + 4] = 1; return; }
        const p = costOf(n, me.ore);
        atype[i] = TYPE_IDX[n];
        adyn[q] = l1p(p) / 5;
        adyn[q + 1] = l1p(p / inc) / 3;
        adyn[q + 2] = Math.min(3, Math.max(0, p - me.money) / inc);
        adyn[q + 3] = p <= me.money ? 1 : 0;
    });
    return { global, nShips: m, cell, stype, sdyn, moves, atype, adyn };
}

// ---- the net ---------------------------------------------------------------

function b64ToF32(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Float32Array(u8.buffer);
}

/** A net from the trainer's export ({ meta, params: { name: { shape, b64 } } }). */
export function loadNet(json) {
    const p = {};
    for (const [k, v] of Object.entries(json.params)) p[k] = { shape: v.shape, w: b64ToF32(v.b64) };
    const H = json.meta;
    return { meta: H, p, buf: {} };
}

// y = W x + b for a torch Linear (weight [out, in], row-major)
function linear(L, B, x, xo, y, yo, relu) {
    const W = L.w, nOut = L.shape[0], nIn = L.shape[1], bias = B?.w;
    for (let j = 0; j < nOut; j++) {
        let s = bias ? bias[j] : 0;
        const r = j * nIn;
        for (let i = 0; i < nIn; i++) s += W[r + i] * x[xo + i];
        y[yo + j] = relu && s < 0 ? 0 : s;
    }
}

const buf = (net, name, n) => (net.buf[name]?.length >= n ? net.buf[name] : (net.buf[name] = new Float32Array(n)));

/** { logits (one per move), value (-1..1, my chances) }. T = typeTable() for the current rules. */
export function forward(net, T, e) {
    const P = net.p, H = net.meta;
    const E = H.phi, CELL = CELLS * E;
    // ship encoder, summed per cell, then log1p
    const pool = buf(net, 'pool', CELL + GLOBAL_DIM).fill(0);
    const sx = buf(net, 'sx', TYPE_DIM + SHIP_DYN), h1 = buf(net, 'h1', H.phiHidden), h2 = buf(net, 'h2', E);
    for (let k = 0; k < e.nShips; k++) {
        sx.set(T.subarray(e.stype[k] * TYPE_DIM, (e.stype[k] + 1) * TYPE_DIM), 0);
        for (let i = 0; i < SHIP_DYN; i++) sx[TYPE_DIM + i] = e.sdyn[k * SHIP_DYN + i];
        linear(P['phi1.weight'], P['phi1.bias'], sx, 0, h1, 0, true);
        linear(P['phi2.weight'], P['phi2.bias'], h1, 0, h2, 0, true);
        const o = e.cell[k] * E;
        for (let i = 0; i < E; i++) pool[o + i] += h2[i];
    }
    for (let i = 0; i < CELL; i++) pool[i] = Math.log1p(pool[i]);
    pool.set(e.global, CELL);
    const t1 = buf(net, 't1', H.trunk), h = buf(net, 'h', H.trunk);
    linear(P['t1.weight'], P['t1.bias'], pool, 0, t1, 0, true);
    linear(P['t2.weight'], P['t2.bias'], t1, 0, h, 0, true);
    // value
    const v1 = buf(net, 'v1', H.valueHidden), vo = buf(net, 'vo', 1);
    linear(P['v1.weight'], P['v1.bias'], h, 0, v1, 0, true);
    linear(P['v2.weight'], P['v2.bias'], v1, 0, vo, 0, false);
    // policy: score(move) = w · relu(Wq h + Wa [card, own numbers]) + c
    const A = H.actHidden;
    const q = buf(net, 'q', A), ax = buf(net, 'ax', TYPE_DIM + ACT_DYN), ah = buf(net, 'ah', A), lo = buf(net, 'lo', 1);
    linear(P['pq.weight'], P['pq.bias'], h, 0, q, 0, false);
    const logits = new Float32Array(e.moves.length);
    for (let k = 0; k < e.moves.length; k++) {
        ax.set(T.subarray(e.atype[k] * TYPE_DIM, (e.atype[k] + 1) * TYPE_DIM), 0);
        for (let i = 0; i < ACT_DYN; i++) ax[TYPE_DIM + i] = e.adyn[k * ACT_DYN + i];
        linear(P['pa.weight'], null, ax, 0, ah, 0, false);
        for (let i = 0; i < A; i++) { const s = ah[i] + q[i]; ah[i] = s < 0 ? 0 : s; }
        linear(P['po.weight'], P['po.bias'], ah, 0, lo, 0, false);
        logits[k] = lo[0];
    }
    return { logits, value: Math.tanh(vo[0]) };
}

/** Softmax at temperature temp (0 = all weight on the best move). */
export function moveProbs(logits, temp = 1) {
    const p = new Float64Array(logits.length);
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    if (temp <= 0) { p[best] = 1; return p; }
    let sum = 0;
    for (let i = 0; i < logits.length; i++) { p[i] = Math.exp((logits[i] - logits[best]) / temp); sum += p[i]; }
    for (let i = 0; i < logits.length; i++) p[i] /= sum;
    return p;
}

export function sampleIndex(p, rng) {
    let r = rng();
    for (let i = 0; i < p.length; i++) { if (r < p[i]) return i; r -= p[i]; }
    return p.length - 1;
}

/**
 * How the live game picks: favourite ~88% of the time, else a close second/third. Measured on
 * Alpha 0.75: no strength cost (52.3% ±2.5 over 400 standard games vs always-favourite), and a
 * fixed human build order replayed 60 times meets 58 different Alpha games instead of 1.
 */
export const LIVE_VARIETY = { topK: 3, minRatio: 0.3, temp: 0.5 };

/**
 * Near-best sampling, so replaying a game can't map out one fixed line: only the top `topK`
 * moves that the net rates at least `minRatio` as likely as its favourite can be played, chosen
 * in proportion to the net's own probabilities sharpened by `temp`. A confident net still
 * plays its favourite (a runner-up below minRatio never gets in); a torn one varies between
 * the moves it rates close.
 */
export function nearBestProbs(logits, { topK = 3, minRatio = 0.3, temp = 0.5 } = {}) {
    const p = moveProbs(logits, 1);
    const order = [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, topK);
    const q = new Float64Array(p.length);
    let sum = 0;
    for (const i of order) {
        if (p[i] < minRatio * p[order[0]]) break;
        q[i] = p[i] ** (1 / temp);
        sum += q[i];
    }
    for (const i of order) q[i] /= sum;
    return q;
}

/**
 * The live game's entry point: the ship Zero buys for `side` (0 = skip). With `variety`
 * ({ topK, minRatio, temp }, see nearBestProbs) it picks among its near-best moves;
 * otherwise softmax at `temp` (0 = always its favourite).
 */
export function chooseZero(S, side, net, { temp = 0, variety = null, rng = Math.random } = {}) {
    if (!net) return 0;
    const e = encode(S, side);
    const { logits } = forward(net, typeTable(), e);
    const p = variety ? nearBestProbs(logits, variety) : moveProbs(logits, temp);
    return e.moves[sampleIndex(p, rng)];
}
