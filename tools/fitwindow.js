// Fits the mining-window gate to tools/windows.js results: predicts how much better (graded
// result) buying miner n now does than the grandmaster's own pick, from the position.
//   node tools/fitwindow.js [tools/windows.jsonl] [--ridge 3] [--out js/window-weights.js]
// Checked on held-out games: what the gate would gain if it fired wherever the fit says > 0.

import fs from 'fs';
import { windowInputs, WINDOW_INPUTS } from '../js/window.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const ridge = Number(flag('--ridge', 3));
const outFile = flag('--out', null);
const rows = fs.readFileSync(args[0] || 'tools/windows.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
for (const r of rows) { r.x = windowInputs(r.f, r.n ?? 3, r.own); r.d = r.forced - r.ownRes; }

function fit(train) {
    const F = WINDOW_INPUTS.length;
    const mu = new Array(F).fill(0), sd = new Array(F).fill(0);
    for (const r of train) r.x.forEach((v, i) => (mu[i] += v / train.length));
    for (const r of train) r.x.forEach((v, i) => (sd[i] += (v - mu[i]) ** 2 / train.length));
    for (let i = 0; i < F; i++) sd[i] = sd[i] > 1e-9 ? Math.sqrt(sd[i]) : 1;
    // ridge regression by normal equations (bias unpenalised)
    const D = F + 1, A = Array.from({ length: D }, () => new Array(D).fill(0)), b = new Array(D).fill(0);
    for (const r of train) {
        const z = [1, ...r.x.map((v, i) => (v - mu[i]) / sd[i])];
        for (let i = 0; i < D; i++) { b[i] += z[i] * r.d; for (let j = 0; j < D; j++) A[i][j] += z[i] * z[j]; }
    }
    for (let i = 1; i < D; i++) A[i][i] += ridge * train.length / 100;
    // gaussian elimination
    for (let c = 0; c < D; c++) {
        let p = c; for (let r = c + 1; r < D; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
        for (let r = 0; r < D; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < D; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; }
    }
    const w = b.map((v, i) => v / A[i][i]);
    return { mu, sd, w };
}
const predict = (m, x) => m.w[0] + x.reduce((t, v, i) => t + m.w[i + 1] * (v - m.mu[i]) / m.sd[i], 0);

// 5-fold by game
const fold = r => ((r.seed * 2654435761) >>> 0) % 5;
let fired = 0, gain = 0, all = 0, base = 0;
const byOpp = {};
for (let k = 0; k < 5; k++) {
    const m = fit(rows.filter(r => fold(r) !== k));
    for (const r of rows.filter(r => fold(r) === k)) {
        all++; base += r.d;
        const o = (byOpp[r.opp] ??= { n: 0, fired: 0, gain: 0 });
        o.n++;
        if (predict(m, r.x) > 0) { fired++; gain += r.d; o.fired++; o.gain += r.d; }
    }
}
console.log(`${rows.length} branches; always mining: ${(base / all).toFixed(3)} per branch`);
console.log(`gate (held-out): fires on ${fired}/${all}, mean gain where fired ${(gain / Math.max(1, fired)).toFixed(3)}, total gain per branch ${(gain / all).toFixed(3)}`);
for (const [o, v] of Object.entries(byOpp)) console.log(`  ${o.padEnd(14)} fires ${v.fired}/${v.n}  gain where fired ${(v.gain / Math.max(1, v.fired)).toFixed(3)}`);
const m = fit(rows);
const named = WINDOW_INPUTS.map((n, i) => [n, m.w[i + 1]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
console.log('weights (per sd):', named.slice(0, 12).map(([n, w]) => `${n} ${w.toFixed(3)}`).join(', '), `bias ${m.w[0].toFixed(3)}`);
if (outFile) {
    const r5 = v => Math.round(v * 1e5) / 1e5;
    fs.writeFileSync(outFile, `// Fitted by tools/fitwindow.js on ${rows.length} branches (${new Date().toISOString()}).\nexport const WINDOW_MODEL = ${JSON.stringify({ mu: m.mu.map(r5), sd: m.sd.map(r5), w: m.w.map(r5) })};\n`);
    console.log(`wrote ${outFile}`);
}
