// The wizard's book: lessons from real games against a fixed opponent, found by rewinding lost
// games and trying other moves (tools/wizard.js). A lesson is "from a position like this, move X
// actually ended in a win / loss", filed under summaries of the position at three levels of
// detail, from the mover's point of view:
//   0  coarse: game phase and how much enemy force is near my base
//   1  middle: turn, both sides' strength per zone (home / centre / far) and the income gap
//   2  fine:   middle + money banked, ore gap and base hp gap
// A move's bias is how much better than the other moves recorded at that summary it did, counted
// in proportion to how often that was verified (n / (n + BOOK_PRIOR)): one result stays fuzzy,
// a repeatedly confirmed one becomes firm. Finer summaries count more once they have evidence.

import { enemyOf } from './sim.js';

export const BOOK_PRIOR = 2;
const LEVEL_W = [0.5, 1, 1.5];

const bucket = (x, steps) => {
    let i = 0;
    for (const s of steps) { if (x < s) return i; i++; }
    return i;
};

/** The three summary keys of the position for `side`. */
export function bookKeys(S, side) {
    const opp = enemyOf(side);
    // distance from my base: 0 = my base sector ... 6 = theirs
    const dist = sector => (side === 'blue' ? sector - 1 : 7 - sector);
    const zone = d => (d <= 1 ? 0 : d <= 4 ? 1 : 2);
    const pow = { [side]: [0, 0, 0], [opp]: [0, 0, 0] };
    for (const owner of [side, opp]) {
        for (const s of S[owner].ships) {
            if (s.health <= 0) continue;
            pow[owner][zone(dist(s.sector))] += Math.sqrt(Math.max(0.5, s.attack) * s.health);
        }
    }
    const me = S[side], them = S[opp];
    const t = S.turn;
    const threat = bucket(pow[opp][0] + pow[opp][1], [1, 10, 30, 80]);
    const phase = t <= 12 ? t >> 1 : 6 + (t >> 3);
    const P = [1, 8, 20, 50, 120];
    const zones = [...pow[side], ...pow[opp]].map(x => bucket(x, P)).join('');
    const econ = bucket(me.income - them.income, [-3, -1, 1, 3]);
    const k0 = `0|${phase}|${threat}`;
    const k1 = `1|${Math.min(t, 45)}|${zones}|${econ}`;
    const bank = bucket(me.money / Math.max(1, me.income), [1, 2, 4]);
    const ore = bucket(me.ore - them.ore, [-50, -15, 15, 50]);
    const hp = bucket(Math.max(0, me.hp) - Math.max(0, them.hp), [-40, -10, 10, 40]);
    const k2 = `2|${Math.min(t, 45)}|${zones}|${econ}|${bank}${ore}${hp}`;
    return [k0, k1, k2];
}

/** Bias (as a win-probability difference, about -1..1) for playing `move` (0 = skip/save). */
export function bookBias(book, keys, move) {
    if (!book) return 0;
    let v = 0;
    keys.forEach((key, l) => {
        const st = book[key];
        const m = st?.[move];
        if (!m) return;
        let n = 0, sum = 0;
        for (const k in st) { n += st[k][0]; sum += st[k][1]; }
        const avg = sum / n;
        v += LEVEL_W[l] * (m[0] / (m[0] + BOOK_PRIOR)) * (m[1] / m[0] - avg);
    });
    return v;
}

/** Adds one result: from the position with these keys, `move` led to `result` (0..1). */
export function bookRecord(book, keys, move, result) {
    for (const key of keys) {
        const st = (book[key] ??= {});
        const m = (st[move] ??= [0, 0]);
        m[0] += 1;
        m[1] += result;
    }
}
