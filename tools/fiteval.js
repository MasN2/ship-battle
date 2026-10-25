// Fits a position evaluator to real outcomes and checks it on games it never saw.
//   node tools/fiteval.js positions.jsonl [--hidden 16] [--epochs 60] [--out js/value-weights.js]
// Compares, by turn range, how well each predicts the eventual winner (log-loss, lower is
// better; accuracy = how often the side it favours goes on to win):
//   hand    the grandmaster's hand-written position score (a logistic fit of it alone)
//   linear  logistic regression on js/features.js
//   net     a small neural net (one hidden layer) on the same features
// Games are split 80/20 by game id, so test positions come from games the fit never saw.

import fs from 'fs';
import { FEATURE_NAMES } from '../js/features.js';
import { mulberry32 } from './rng.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const hidden = Number(flag('--hidden', 16));
const epochs = Number(flag('--epochs', 60));
const outFile = flag('--out', null);
const rows = fs.readFileSync(args[0], 'utf8').trim().split('\n').map(l => JSON.parse(l));

// split by game
const test = r => (r.g * 2654435761 >>> 0) % 5 === 0;
const train = rows.filter(r => !test(r)), tst = rows.filter(test);

// standardise features (stats from training rows)
const F = FEATURE_NAMES.length;
const mu = new Array(F).fill(0), sd = new Array(F).fill(0);
for (const r of train) r.f.forEach((x, i) => (mu[i] += x / train.length));
for (const r of train) r.f.forEach((x, i) => (sd[i] += (x - mu[i]) ** 2 / train.length));
for (let i = 0; i < F; i++) sd[i] = Math.sqrt(sd[i]) || 1;
const norm = f => f.map((x, i) => (x - mu[i]) / sd[i]);
for (const r of rows) r.x = norm(r.f);

const sig = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const rng = mulberry32(7);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// hand: logistic on the hand eval alone (scale + bias)
function fitHand() {
    let a = 0, b = 0;
    const s = 1 / 1000;
    for (let ep = 0; ep < 30; ep++) for (const r of shuffle(train.slice())) {
        const p = sig(a * r.ev * s + b), g = p - r.y;
        a -= 0.05 * g * r.ev * s; b -= 0.05 * g;
    }
    return r => sig(a * r.ev * s + b);
}

// net: F -> hidden (tanh) -> 1, plain SGD; hidden 0 = logistic regression
function fitNet(H) {
    const W1 = Array.from({ length: H }, () => Array.from({ length: F }, () => (rng() - 0.5) * 0.3));
    const b1 = new Array(H).fill(0);
    const W2 = Array.from({ length: H }, () => (rng() - 0.5) * 0.3);
    const wl = new Array(F).fill(0); // linear part (the whole model when H = 0)
    let b2 = 0;
    const fwd = x => {
        const h = W1.map((w, k) => Math.tanh(w.reduce((t, wi, i) => t + wi * x[i], b1[k])));
        const z = h.reduce((t, hk, k) => t + W2[k] * hk, b2) + wl.reduce((t, w, i) => t + w * x[i], 0);
        return { h, p: sig(z) };
    };
    let lr = 0.02;
    for (let ep = 0; ep < epochs; ep++) {
        for (const r of shuffle(train.slice())) {
            const { h, p } = fwd(r.x);
            const g = p - r.y;
            for (let i = 0; i < F; i++) wl[i] -= lr * (g * r.x[i] + 1e-4 * wl[i]);
            for (let k = 0; k < H; k++) {
                const gh = g * W2[k] * (1 - h[k] * h[k]);
                W2[k] -= lr * (g * h[k] + 1e-4 * W2[k]);
                for (let i = 0; i < F; i++) W1[k][i] -= lr * (gh * r.x[i] + 1e-4 * W1[k][i]);
                b1[k] -= lr * gh;
            }
            b2 -= lr * g;
        }
        lr *= 0.95;
    }
    const model = { mu, sd, W1, b1, W2, wl, b2 };
    return { predict: r => fwd(r.x).p, model };
}

const ranges = [[1, 8], [9, 15], [16, 25], [26, 40], [41, 999]];
function report(name, predict) {
    const cells = ranges.map(([lo, hi]) => {
        const rs = tst.filter(r => r.t >= lo && r.t <= hi);
        if (!rs.length) return '        -        ';
        let ll = 0, acc = 0;
        for (const r of rs) {
            const p = Math.min(1 - 1e-6, Math.max(1e-6, predict(r)));
            ll -= r.y ? Math.log(p) : Math.log(1 - p);
            acc += (p > 0.5) === (r.y === 1) ? 1 : (p === 0.5 ? 0.5 : 0);
        }
        return `${(ll / rs.length).toFixed(3)} / ${(100 * acc / rs.length).toFixed(0).padStart(3)}%`;
    });
    console.log(`${name.padEnd(8)} ${cells.map(c => c.padStart(15)).join('  ')}`);
}

console.log(`${rows.length} positions (${train.length} train / ${tst.length} test), games split 80/20`);
console.log(`turns    ${ranges.map(([lo, hi]) => `${lo}-${hi > 99 ? '' : hi}`.padStart(15)).join('  ')}`);
console.log(`(log-loss / accuracy; a coin flip is 0.693 / 50%)`);
report('hand', fitHand());
const lin = fitNet(0);
report('linear', lin.predict);
const net = fitNet(hidden);
report('net', net.predict);
if (outFile) {
    fs.writeFileSync(outFile, `// Fitted by tools/fiteval.js on ${rows.length} positions (${new Date().toISOString()}); see js/features.js.\nexport const VALUE_NET = ${JSON.stringify(net.model, (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v))};\n`);
    console.log(`wrote ${outFile}`);
}
