// Plays random games through the real combat.js (with a stub DOM) and through
// js/sim.js side by side, and checks the two states match after every turn.
//   node tools/verify.js [games=200] [seed=1]
// Half the games start from inflated money / income / ore so the expensive
// ships (carriers, Ruler, Abacus, Replicator, Terminus, ...) get exercised too.

import './dom-stub.js';
import { mulberry32 } from './rng.js';

const st = await import('../js/state.js');
const { runTurn } = await import('../js/combat.js');
const { SHIP_NUMS } = await import('../js/templates.js');
const sim = await import('../js/sim.js');

st.setSpeedMult(1e9);

const games = Number(process.argv[2] ?? 200);
const seed0 = Number(process.argv[3] ?? 1);

function snap(S) {
    const side = o => ({
        hp: o.hp, armor: o.armor, income: o.income, money: o.money, ore: o.ore,
        ships: o.ships.filter(s => s.health > 0).map(s => [s.number, s.attack, s.health, s.sector, s.row]),
    });
    return JSON.stringify({ turn: S.turn, blue: side(S.blue), red: side(S.red) });
}

function pick(S, side, rng) {
    if (rng() < 0.2) return 0;
    if (rng() < 0.1) return SHIP_NUMS[Math.floor(rng() * SHIP_NUMS.length)]; // may be unaffordable
    const ok = SHIP_NUMS.filter(n => sim.canAfford(S, side, n));
    if (!ok.length) return 0;
    // lean toward the expensive end so big ships show up
    return ok[Math.floor(ok.length * Math.sqrt(rng()))];
}

let turnsChecked = 0;
let crashes = 0;
const seenShips = new Set();
for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed0 * 100003 + g);
    st.newGame();
    const real = st.state;
    let S;
    if (g % 2 === 0) {
        S = sim.newSimState();
        if (snap(S) !== snap(real)) { console.log(`game ${g}: start states differ\n${snap(S)}\n${snap(real)}`); process.exit(1); }
    } else {
        for (const side of ['blue', 'red']) {
            real[side].money = [0, 50, 400, 5000][Math.floor(rng() * 4)];
            real[side].income = [4, 12, 40, 200][Math.floor(rng() * 4)];
            real[side].ore = [0, 150, 2000, 30000][Math.floor(rng() * 4)];
        }
        S = sim.cloneState(real);
    }
    real.red.opening = [];
    for (let t = 0; t < 150; t++) {
        const bp = pick(S, 'blue', rng);
        const rp = pick(S, 'red', rng);
        real.red.opening[real.turn - 1] = rp;
        let simErr = null;
        let realErr = null;
        try { sim.stepTurn(S, bp, rp); } catch (e) { simErr = e; }
        try { await runTurn(bp); } catch (e) { realErr = e; }
        if (simErr || realErr) {
            if (!(simErr instanceof sim.SimError) || !realErr) {
                console.log(`game ${g} turn ${t + 1}: sim error ${simErr?.message} / real error ${realErr?.message}`);
                process.exit(1);
            }
            crashes++;
            break;
        }
        for (const side of ['blue', 'red']) for (const s of S[side].ships) seenShips.add(s.number);
        turnsChecked++;
        const a = snap(S);
        const b = snap(real);
        if (a !== b) {
            console.log(`MISMATCH game ${g} turn ${t + 1} (picks blue ${bp}, red ${rp})\nsim : ${a}\nreal: ${b}`);
            process.exit(1);
        }
        const realOver = st.gameOver;
        if (!!S.over !== realOver) { console.log(`game ${g}: game-over disagrees (sim ${S.over}, real ${realOver})`); process.exit(1); }
        if (S.over) break;
    }
    if ((g + 1) % 20 === 0) console.log(`${g + 1} games, ${turnsChecked} turns identical`);
}
const missing = SHIP_NUMS.filter(n => !seenShips.has(n));
console.log(`OK: ${games} games, ${turnsChecked} turns, sim == real every turn. ${crashes} games hit the live game's own crash (Rainbow deploying a ship number that doesn't exist).`);
console.log(`ships never fielded: ${missing.join(', ') || 'none'}`);
process.exit(0);
