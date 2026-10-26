// The time wizard: learns a book of lessons (js/book.js) from real games against a fixed
// opponent (default: grandmaster v1.2, deterministic but for opening jitter).
//   node tools/wizard.js [batches=3] [--games 8] [--cfg '{learner cfg}'] [--rewinds 6] [--alts 3] [--fresh]
//                        [--check 2] [--checkGames 16]
// Checkpoints: before training and every --check batches, --checkGames held-out games (seeds it
// never trains on, sides alternating, no rewinds) against the opponent with the current book,
// so a run shows mid-flight whether the book is actually helping.
// Each game: the learner (β config + the current book) plays the opponent. On a loss it rewinds:
// a few turns before the end it tries its next-best moves there, each played out to the end with
// the same opponent; if none wins it rewinds further back, toward the opening, until one wins or
// the rewinds run out. Every real outcome goes into the book: each decision of a game is credited
// with that game's result, and the decisions leading up to a rewind point with the best result
// found from there (a win was available along that path). Writes js/book-data.js after every
// batch, so later batches play with what earlier ones learned. Learner sides alternate.

import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { newSimState, stepTurn, cloneState, SimError } from '../js/sim.js';
import { chooseGrandmaster } from '../js/grandmaster.js';
import { bookKeys, bookRecord } from '../js/book.js';
import { workerCount } from './match.js';
import { mulberry32 } from './rng.js';

const MAX_TURNS = 90;

// Value of an outcome, graded by margin (playtest 24: "I almost won that" and "no way I could
// have won that" are different lessons). A win is 0.7 + 0.3 × its own base hp left, so a
// last-gasp win sits just above the closest loss; a loss is up to 0.3 by how far it got their
// base down (most) and how long it lasted. The cap counts 0.5.
export function outcome(S, side) {
    const opp = side === 'red' ? 'blue' : 'red';
    const frac = x => Math.max(0, Math.min(1, x / 160));
    if (S.over === side) return 0.7 + 0.3 * frac(S[side].hp);
    if (S.over) return 0.3 * (0.65 * (1 - frac(S[opp].hp)) + 0.35 * Math.min(1, S.turn / 60));
    return 0.5;
}
const WON = r => r >= 0.7;

/** Plays on from S (learner on `side`), its first move forced to `first` if given.
    Returns the result and the learner's decisions: position keys, move, snapshot, alternatives. */
function playOn(S, side, cfg, oppCfg, seed, first, keepSnaps) {
    const rng = mulberry32(seed);
    const rngOpp = mulberry32(seed ^ 0x5bd1e995);
    const opp = side === 'red' ? 'blue' : 'red';
    const memo = {}, memoOpp = {};
    const decisions = [];
    try {
        while (!S.over && S.turn <= MAX_TURNS) {
            const out = [];
            const snap = keepSnaps ? cloneState(S) : null;
            const mine = first !== undefined && !decisions.length
                ? first
                : chooseGrandmaster(S, side, { cfg, memo, rng, out });
            const theirs = chooseGrandmaster(S, opp, { cfg: oppCfg, memo: memoOpp, rng: rngOpp });
            // alternatives: other first moves, best scored first
            const best = new Map();
            for (const e of out) {
                const n = e.plan.saveFor ? 0 : e.plan.first;
                if (!best.has(n) || e.score > best.get(n)) best.set(n, e.score);
            }
            const alts = [...best.entries()].filter(([n]) => n !== mine).sort((a, b) => b[1] - a[1]).map(([n]) => n);
            decisions.push({ keys: bookKeys(S, side), move: mine, snap, alts });
            if (side === 'blue') stepTurn(S, mine, theirs);
            else stepTurn(S, theirs, mine);
        }
    } catch (e) {
        if (!(e instanceof SimError)) throw e;
    }
    return { result: outcome(S, side), turns: S.turn, decisions };
}

function episode({ cfg, oppCfg, seed, side, rewinds, alts }) {
    const records = [];
    const rec = (decs, r) => { for (const d of decs) records.push([d.keys, d.move, r]); };
    const game = playOn(newSimState(), side, cfg, oppCfg, seed, undefined, true);
    let best = game.result;
    let fixedAt = null, tried = 0;
    if (!WON(game.result)) {
        const L = game.decisions.length;
        // rewind points: 4 turns before the end, then every 4 turns further back
        const points = [];
        for (let T = L - 4; T >= 0 && points.length < rewinds; T -= 4) points.push(T);
        search:
        for (const T of points) {
            const d = game.decisions[T];
            for (const alt of d.alts.slice(0, alts)) {
                tried++;
                const branch = playOn(cloneState(d.snap), side, cfg, oppCfg, seed * 31 + T * 7 + alt, alt, false);
                rec(branch.decisions, branch.result);
                if (branch.result > best) best = branch.result;
                if (WON(branch.result)) {
                    // a win existed from here: the path into this position was fine
                    rec(game.decisions.slice(0, T), branch.result);
                    fixedAt = d.snap.turn;
                    break search;
                }
            }
        }
    }
    if (fixedAt === null) rec(game.decisions, game.result);
    else rec(game.decisions.slice(game.decisions.findIndex(d => d.snap.turn === fixedAt)), game.result);
    return { seed, side, result: game.result, turns: game.turns, fixedAt, tried, best, records };
}

function heldOut({ cfg, oppCfg, seed, side }) {
    const g = playOn(newSimState(), side, cfg, oppCfg, seed, undefined, false);
    return { result: g.result, turns: g.turns, line: side + ':' + g.decisions.map(d => d.move).join(',') };
}

if (!isMainThread) {
    const run = j => (j.check ? heldOut : episode)({ ...j, cfg: { ...j.cfg, book: workerData.book } });
    parentPort.postMessage(workerData.jobs.map(run));
} else {
    const args = process.argv.slice(2);
    const flag = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
    const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const games = Number(flag('--games', 8));
    const rewinds = Number(flag('--rewinds', 6));
    const alts = Number(flag('--alts', 3));
    const seed0 = Number(flag('--seed', 70000));
    const oppCfg = JSON.parse(flag('--opp', '{}'));
    const fresh = bool('--fresh');
    const { DIFFICULTIES } = await import('../js/config.js');
    const cfg = { ...DIFFICULTIES.grandmasterBeta.gmCfg, ...JSON.parse(flag('--cfg', '{}')) };
    const batches = Number(args[0] ?? 3);
    const bookFile = new URL('../js/book-data.js', import.meta.url);
    const logFile = new URL('./wizard-log.txt', import.meta.url);
    const log = line => { console.log(line); fs.appendFileSync(logFile, line + '\n'); };
    let book = {};
    if (!fresh) { const { BOOK } = await import('../js/book-data.js'); if (BOOK) book = BOOK; }
    // continue seeds after earlier runs so every batch sees new games
    let seed = seed0 + Object.values(book).length;
    log(`\n=== ${new Date().toISOString()} ${batches} batches × ${games} games, rewinds ${rewinds} × ${alts} alternatives, book ${Object.keys(book).length} positions`);
    const runJobs = async (jobs, bk) => {
        const threads = workerCount(jobs.length);
        const chunks = Array.from({ length: threads }, () => []);
        jobs.forEach((j, i) => chunks[i % threads].push(j));
        return (await Promise.all(chunks.map(c => new Promise(ok => {
            const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c, book: bk } });
            w.on('message', ok);
            w.on('error', e => { console.error(`worker failed: ${e.stack || e}`); process.exit(1); });
        })))).flat();
    };
    const check = Number(flag('--check', 2));
    const checkGames = Number(flag('--checkGames', 16));
    const checkpoint = async label => {
        const t0 = Date.now();
        const jobs = Array.from({ length: checkGames }, (_, g) => ({ check: true, cfg, oppCfg, seed: 90000 + g, side: g % 2 ? 'blue' : 'red' }));
        const res = await runJobs(jobs, Object.keys(book).length ? book : null);
        const wins = res.filter(r => WON(r.result)).length;
        const lossTurns = res.filter(r => r.result < 0.5).map(r => r.turns);
        const avg = lossTurns.length ? (lossTurns.reduce((a, b) => a + b, 0) / lossTurns.length).toFixed(0) : '-';
        const distinct = new Set(res.map(r => r.line)).size;
        log(`  checkpoint ${label}: held-out ${wins}/${res.length} wins vs opponent, ${distinct} distinct games, losses last ${avg} turns (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    };
    if (check) await checkpoint(`start (book ${Object.keys(book).length} positions)`);
    for (let b = 0; b < batches; b++) {
        const t0 = Date.now();
        const jobs = Array.from({ length: games }, (_, g) => ({ cfg, oppCfg, seed: seed++, side: g % 2 ? 'blue' : 'red', rewinds, alts }));
        const res = await runJobs(jobs, book);
        let n = 0;
        for (const r of res) for (const [keys, move, result] of r.records) { bookRecord(book, keys, move, result); n++; }
        fs.writeFileSync(bookFile, `// Lessons written by tools/wizard.js (see js/book.js), ${new Date().toISOString()}.\nexport const BOOK = ${JSON.stringify(book, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))};\n`);
        const wins = res.filter(r => WON(r.result)).length;
        const fixed = res.filter(r => r.fixedAt !== null).map(r => `t${r.fixedAt}`);
        log(`batch ${b + 1}: won ${wins}/${res.length} outright; losses fixed by rewinding: ${fixed.length} (${fixed.join(' ') || '-'}); ` +
            `${res.reduce((a, r) => a + r.tried, 0)} branches tried; ${n} lessons, book ${Object.keys(book).length} positions; ${((Date.now() - t0) / 60000).toFixed(1)} min`);
        if (check && (b + 1) % check === 0) await checkpoint(`after batch ${b + 1}`);
    }
}
