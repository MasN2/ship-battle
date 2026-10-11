import { state, processing, gameOver, setProcessing, sleep, timeout, log, startNewTurn, endGame, incrementShipId, socket, getNextMessage } from './state.js';
import { SECTORS, RED_BASE_IDX, BLUE_BASE_IDX, BLUE_DEPLOY_IDX, RED_DEPLOY_IDX, ATTACK_RANGE } from './config.js';
import { TEMPLATES, calculatePrimeFactors } from './templates.js';
import { cost, calcOreIncome, maxLoanFor } from './economy.js';
import { sfx } from './audio.js';
import { animateAttacker, shootLaser, showDamageNumber, flashBase } from './visuals.js';
import { render } from './render.js';
import { pickAIR } from './ai.js';

export function priorityOrder(owner) {
    return state[owner].ships.slice().filter(s => s.health > 0 || s.dying).sort((a, b) => {
        const da = owner === 'blue' ? -a.sector : a.sector;
        const db = owner === 'blue' ? -b.sector : b.sector;
        if (da !== db) return da - db;
        return a.row - b.row;
    });
}

export function recomputeRows() {
    for (const owner of ['blue', 'red']) {
        const bySector = {};
        for (const s of state[owner].ships) (bySector[s.sector] ??= []).push(s);
        for (const sec in bySector) {
            bySector[sec].sort((a, b) => a.row - b.row);
            bySector[sec].forEach((s, i) => { s.row = i; });
        }
    }
}

export async function deployShip(owner, num, sector, hp, atk) {
    const tpl = TEMPLATES[num];
    if (num === 53 && state[owner].ships.length) {
        sector = (owner === 'blue' ? Math.max : Math.min)(...state[owner].ships.map(s => s.sector));
    }
    const ship = {
        id: incrementShipId(),
        owner,
        number: num,
        attack: atk !== undefined ? atk : tpl.attack,
        health: hp !== undefined ? hp : tpl.health,
        maxHealth: Math.max(tpl.health, 10),
        sector,
        row: 999,
        template: tpl,
        justDeployed: true,
    };
    state[owner].ships.push(ship);
    if (num === 47) ship.attack = state[owner].income;
    if (num > 0 && (num % 7 === 0)) {
        state[owner].income += num / 7;
        state[owner].hp -= 3;
        log(`${owner.toUpperCase()} trades 3 base hp for +${num / 7} income (now ${state[owner].income}).`, owner);
    }
    if (num > 0 && (num % 49 === 0)) {
        state[owner].income += num / 7;
        state[owner].hp -= 3;
        log(`${owner.toUpperCase()} trades 3 base hp for +${num / 7} income (now ${state[owner].income}).`, owner);
    }
    if (tpl.win) {
        const enemy = owner === 'red' ? 'blue' : 'red';
        await executeStrike(ship, enemy, null, true, 0);
    }
    recomputeRows();
    log(`${owner.toUpperCase()} deploys #${num} ${tpl.name} into ${SECTORS[sector]}.`, owner);
    if (num === 41) {
        for (let i = 1; i <= 23; i++) {
            if (calculatePrimeFactors(i).length === 1) await deployShip(owner, i, sector);
        }
    }
    if (num === 29) {
        for (let i = 1; i <= 10; i++) await deployShip(owner, i, sector);
    }
    return ship;
}

export async function buyShip(owner, num) {
    const sec = owner === 'blue' ? BLUE_DEPLOY_IDX : RED_DEPLOY_IDX;
    const c = cost(num, state[owner].ore);
    if (state[owner].money + maxLoanFor(state[owner].income) < c) {
        state[owner].history.push(0);
        return false;
    }
    state[owner].history.push(num);
    state[owner].money -= c;
    if (state[owner].money < 0) state[owner].money *= 1.25;
    await deployShip(owner, num, sec);
    sfx.deploy();
    return true;
}

export async function fireMissile(ship, enemyOwner, sector) {
    animateAttacker(ship);
    const dmg = ship.template.number / 5;
    const bSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;
    const baseEl = document.querySelector(`.base.${enemyOwner}`);
    const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);

    const hits = state[enemyOwner].ships.filter(e => e.sector === sector && e.health > 0 && !e.dying);
    hits.forEach((h, idx) => {
        const hEl = document.querySelector(`[data-ship-id="${h.id}"]`);
        const d = idx * 90;
        shootLaser(attackerEl, hEl, ship.owner, { aoe: true, delay: d });
        showDamageNumber(hEl, dmg, ship.owner, { aoe: true, delay: d + 220 });
        h.health -= Math.max(dmg - (h.number % 19 === 0 ? h.number / 19 : 0), 0);
        h.flashDamage = true;
        if (h.health <= 0 && !h.dying) {
            h.dying = true;
            state.newlyKilled.push(h);
        }
    });
    sfx.missile();

    if (sector === bSec) {
        shootLaser(attackerEl, baseEl, ship.owner, { large: true });
        flashBase(enemyOwner);
        sfx.baseHit();
        state[enemyOwner].hp -= dmg * state[enemyOwner].damage_mult;
        showDamageNumber(baseEl, dmg, ship.owner, { large: true, delay: 220 });
    }

    log(`#${ship.number} [${ship.owner.toUpperCase()}] missile-strikes ${SECTORS[sector]} — ${hits.length} hit for ${dmg} each.`, ship.owner);
    render();
    hits.forEach(h => { h.flashDamage = false; });
    await sleep(520);
}

export async function executeStrike(ship, enemyOwner, atkTarget, atkBaseTarget, remainingDmg) {
    const dmg = remainingDmg || ship.attack;
    state.newlyKilled = [];

    if (atkBaseTarget) {
        animateAttacker(ship);
        const baseEl = document.querySelector(`.base.${enemyOwner}`);
        const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);
        shootLaser(attackerEl, baseEl, ship.owner, { large: true });
        flashBase(enemyOwner);
        sfx.baseHit();
        state[enemyOwner].hp -= dmg * state[enemyOwner].damage_mult;
        showDamageNumber(baseEl, dmg, ship.owner, { large: true, delay: 220 });
        log(`#${ship.number} [${ship.owner.toUpperCase()}] strikes ${enemyOwner.toUpperCase()} base for ${dmg} (→ ${state[enemyOwner].hp} HP).`, ship.owner);
        render();
        await sleep(560);
        return { leftover: 0 };
    }

    if (!atkTarget || atkTarget.health <= 0 || atkTarget.dying) return { leftover: dmg };

    animateAttacker(ship);
    const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);
    const targetEl = document.querySelector(`[data-ship-id="${atkTarget.id}"]`);
    shootLaser(attackerEl, targetEl, ship.owner);
    showDamageNumber(targetEl, dmg, ship.owner, { delay: 220 });
    atkTarget.health -= Math.max(dmg - (atkTarget.number % 19 === 0 ? atkTarget.number / 19 : 0), 0);
    atkTarget.flashDamage = true;
    sfx.attack();
    timeout(() => sfx.hit(), 90);

    let leftover = 0;
    if (atkTarget.health <= 0 && !atkTarget.dying) {
        leftover = Math.max(0, -atkTarget.health);
        atkTarget.dying = true;
        state.newlyKilled.push(atkTarget);
    }
    log(`#${ship.number} [${ship.owner.toUpperCase()}] hits #${atkTarget.number} for ${dmg} (→ ${Math.max(0, atkTarget.health)} HP).`, ship.owner);
    render();
    atkTarget.flashDamage = false;
    await sleep(520);
    return { leftover };
}

export async function runAttacks() {
    const getRange = ship => (ship.template.number % 11 === 0 ? 3 : ATTACK_RANGE);

    function findTarget(ship, enemyOwner) {
        const range = getRange(ship);
        const enemyShips = state[enemyOwner].ships.filter(s => s.health > 0 && !s.dying);
        const baseSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;

        const targetCount = {};
        for (const s of enemyShips) targetCount[s.sector] = (targetCount[s.sector] || 0) + 1;
        targetCount[baseSec] = (targetCount[baseSec] || 0) + 1;

        const prioritized = enemyShips.slice().sort((a, b) => {
            const countDiff = (ship.number % 5 === 0) ? targetCount[b.sector] - targetCount[a.sector] : 0;
            if (countDiff !== 0) return countDiff;
            const secDiff = (enemyOwner === 'blue') ? b.sector - a.sector : a.sector - b.sector;
            if (secDiff !== 0) return secDiff;
            return a.row - b.row;
        });

        for (const e of prioritized) {
            if (Math.abs(e.sector - ship.sector) <= range) {
                return { target: e.sector === baseSec ? null : e, baseTarget: e.sector === baseSec };
            }
        }
        if (Math.abs(baseSec - ship.sector) <= range && state[enemyOwner].hp > 0) {
            return { target: null, baseTarget: true };
        }
        return { target: null, baseTarget: false };
    }

    function buildAttacksForOwner(owner) {
        const attacks = [];
        for (const ship of priorityOrder(owner)) {
            const enemy = owner === 'blue' ? 'red' : 'blue';
            const strikes = ship.template.doubleStrike ? 2 : 1;
            for (let s = 0; s < strikes; s++) {
                const { target, baseTarget } = findTarget(ship, enemy);
                if (target || baseTarget) attacks.push({ ship, enemyOwner: enemy });
            }
        }
        return attacks;
    }

    async function processAttacks(attacks) {
        for (const atk of attacks) {
            const { ship, enemyOwner } = atk;
            const { target, baseTarget } = findTarget(ship, enemyOwner);
            if (!target && !baseTarget) continue;

            ship.attackedThisTurn = true;
            await sleep(220);

            let tsec = target?.sector ?? (ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX);
            const result = await executeStrike(ship, enemyOwner, target, baseTarget, 0);

            if (ship.template.number % 5 === 0) fireMissile(ship, enemyOwner, tsec);
            if (ship.template.number % 25 === 0) fireMissile(ship, enemyOwner, tsec);

            if (ship.template.trample && result.leftover > 0) {
                let overflow = result.leftover;
                let trampleHits = 0;
                while (overflow > 0 && trampleHits <= 10) {
                    const { target: nextTarget, baseTarget: nextBase } = findTarget(ship, enemyOwner);
                    if (!nextTarget && !nextBase) break;
                    const res = await executeStrike(ship, enemyOwner, nextTarget, nextBase, overflow);
                    overflow = res.leftover;
                    trampleHits++;
                }
            }
        }
    }

    state.newlyKilled = [];
    await processAttacks(buildAttacksForOwner('blue'));
    await processAttacks(buildAttacksForOwner('red'));

    for (const s of state.newlyKilled) s.dying = false;
    for (const o of ['blue', 'red']) for (const s of state[o].ships) { s.exhausted = false; s.flashDamage = false; }
}

export async function finishCleanup() {
    for (const owner of ['blue', 'red']) {
        for (const s of state[owner].ships) if (s.health <= 0) s.dying = true;
    }
    render();
    await sleep(350);
    for (const owner of ['blue', 'red']) {
        state[owner].ships = state[owner].ships.filter(s => s.health > 0);
    }
    render();
    endGame();
}

export async function runTurn(playerPick = 0) {
    if (processing || gameOver) return;
    setProcessing(true);
    render();

    let aiPick = state.red.opening[state.turn - 1];

    if (state.red.ai === "pvp") {
        socket.send(playerPick);
        aiPick = parseInt(await getNextMessage(), 10);
    } else if (state.red.ai === "daily") {
        aiPick = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 37][state.turn - 1] ?? 0;
    }

    if (aiPick === undefined) aiPick = pickAIR();

    // Step 2: Deploy
    if (playerPick) await buyShip('blue', playerPick);
    else { log('BLUE skips deploy.', 'blue'); sfx.skip(); state.blue.history.push(0); }

    if (aiPick) await buyShip('red', aiPick);
    else { log('RED skips deploy.', 'red'); state.red.history.push(0); }

    render();
    await sleep(200);

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp !== state.blue.hp) {
        return finishCleanup();
    }

    for (const o of ['blue', 'red']) for (const s of state[o].ships) s.justDeployed = false;

    // Step 3: Attack
    log('Attack phase.');
    await runAttacks();
    render();
    await sleep(200);

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp !== state.blue.hp) {
        return finishCleanup();
    }

    // Step 4: Cleanup dead
    let removed = false;
    for (const owner of ['blue', 'red']) {
        const count = state[owner].ships.length;
        state[owner].ships = state[owner].ships.filter(s => s.health > 0);
        if (state[owner].ships.length !== count) removed = true;
    }
    if (removed) {
        recomputeRows();
        log('Wreckage cleared.');
        render();
        await sleep(280);
    }

    // Step 5: Advance
    let advanced = false;
    for (const owner of ['blue', 'red']) {
        state[owner].ships.sort((a, b) => a.row - b.row);
        for (const ship of state[owner].ships) {
            if (!ship.attackedThisTurn) {
                const dir = owner === 'blue' ? +1 : -1;
                const next = ship.sector + dir;
                if (next >= 1 && next <= 7) {
                    ship.sector = next;
                    ship.row = 999;
                    advanced = true;
                    recomputeRows();
                }
            }
            delete ship.attackedThisTurn;
        }
    }
    if (advanced) {
        log('Surviving ships advance.');
        render();
        await sleep(350);
    }

    // Step 6: End of turn abilities & mining
    for (const owner of ['blue', 'red']) {
        if (state[owner].regen !== undefined && state[owner].hp >= 100) state[owner].hp += state[owner].regen;
        const enemy = owner === 'red' ? 'blue' : 'red';
        const deployments = [];

        for (const s of state[owner].ships) {
            if (s.template.number % 31 === 0) s.attack *= 2;
            if (s.template.number % 23 === 0) state[owner].income += s.template.number / 23;
            if (s.template.number % 17 === 0) state[enemy].hp -= s.template.number / 17;
            if (s.template.number % 13 === 0) deployments.push([owner, 2 * s.template.number / 13, s.sector]);
            if (s.template.number % 37 === 0) {
                s.attack += 1;
                deployments.push([owner, s.attack, s.sector]);
            }
            if (s.template.number % 43 === 0) {
                s.attack += 1;
                for (let i = 0; i < s.attack; i++) deployments.push([owner, 2, s.sector]);
            }
        }

        const oreGained = calcOreIncome(owner, state);
        if (oreGained > 0) {
            state[owner].ore += oreGained;
            log(`${owner.toUpperCase()} mines +${oreGained.toFixed(2)} ore (now ${state[owner].ore.toFixed(2)}).`, owner);
        }
        for (const args of deployments) await deployShip(...args);
    }
    recomputeRows();

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp !== state.blue.hp) {
        return finishCleanup();
    }

    startNewTurn();
    setProcessing(false);
    render();
}

export async function load(moves) {
    for (const ship of moves) await runTurn(ship);
}