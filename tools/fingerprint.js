// Grandmaster's decisions (and scores) on fixed positions taken from recorded games, so an
// optimisation can be checked to change nothing.  node tools/fingerprint.js > before.txt
import { newSimState, stepTurn } from '../js/sim.js';
import { chooseGrandmaster } from '../js/grandmaster.js';
import { HUMAN_ORDERS } from './bots.js';

const games = [['user4_blue', 'user4_red_gmb'], ['user2_blue', 'user2_red_gm'], ['user1_blue', 'user1_red_gm']];
const t0 = performance.now();
for (const [b, r] of games) {
    const B = HUMAN_ORDERS[b], R = HUMAN_ORDERS[r];
    const S = newSimState();
    for (let t = 0; t < Math.min(B.length, 40) && !S.over; t++) {
        if (t % 4 === 1) {
            const out = [];
            const pick = chooseGrandmaster(S, 'red', { cfg: { chaos: 0 }, out });
            console.log(`${b} t${S.turn} pick ${pick} ${out.map(e => Math.round(e.score)).join(',')}`);
        }
        stepTurn(S, B[t], R[t]);
    }
}
console.error(`fingerprint took ${((performance.now() - t0) / 1000).toFixed(1)}s`);
