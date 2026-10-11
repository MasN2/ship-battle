import { state, processing, gameOver, opponent } from './state.js';
import { SECTORS, BLUE_BASE_IDX, RED_BASE_IDX, BLUE_DEPLOY_IDX, RED_DEPLOY_IDX, ATTACK_RANGE, SWORD_SVG, BOW_SVG, ROCKET_SVG, HEART_SVG, TARGET_MARK_SVG, SECTOR_LABEL_H, BASE_H, SHIP_CARD_H, SHIP_CARD_H_COMPACT, START_ORE } from './config.js';
import { TEMPLATES, SHIP_NUMS, listAbilities } from './templates.js';
import { cost, calcOreIncome, excessExponent, oreDivisor, maxLoanFor } from './economy.js';
import { shipNumBg, shipStripGradient } from './visuals.js';
import { hideTip } from './tooltips.js';
import { runTurn } from './combat.js';

const shipElements = new Map();

export function render() {
    const nameInput = document.getElementById('blue-bo');
    const emailInput = document.getElementById('red-bo');
    if (nameInput) nameInput.value = `${state.blue.history}`;
    if (emailInput) emailInput.value = `${state.red.history}`;

    hideTip();
    renderStats();
    renderBattlefield();
    // renderDeployBar();

    const ti = document.getElementById('turn-info');
    if (ti) {
        ti.innerHTML = processing
            ? `Turn ${state.turn} · <span class="resolving">RESOLVING…</span>`
            : gameOver
                ? `Turn ${state.turn} · ENDED`
                : `Turn ${state.turn} · DEPLOY`;
    }
}

export function renderStats() {
    document.getElementById('blue-money').textContent = `${state.blue.money.toFixed(2)} (+${state.blue.income})`;
    document.getElementById('blue-ore').textContent = `${state.blue.ore} (+${calcOreIncome('blue', state)})`;
    document.getElementById('red-money').textContent = `${state.red.money.toFixed(2)} (+${state.red.income})`;
    document.getElementById('red-ore').textContent = `${state.red.ore} (+${calcOreIncome('red', state)})`;
    document.getElementById('red-command').textContent = opponent;
}

export function getShipPosition(ship, allShips) {
    const sectorIdx = ship.sector;
    const leftPct = (sectorIdx - 1) / 7 * 100;
    let top = SECTOR_LABEL_H;
    if (sectorIdx === BLUE_BASE_IDX || sectorIdx === RED_BASE_IDX) top += BASE_H;
    const inSector = allShips.filter(s => s.sector === sectorIdx).sort((a, b) => {
        if (a.owner !== b.owner) return a.owner === 'blue' ? -1 : 1;
        return a.row - b.row;
    });
    const l = inSector.length;
    const modifiedShips = l > 7 ? 7 * Math.pow(l / 7, 0.5) : 7;
    top += inSector.indexOf(ship) * (240 / modifiedShips);
    return { leftPct, top, compact: false };
}

export function renderBattlefield() {
    const el = document.getElementById('battlefield');
    if (!el) return;

    if (!document.getElementById('ships-layer')) {
        el.innerHTML = '';
        for (let i = 1; i < 8; i++) {
            const sec = document.createElement('div');
            sec.className = `sector${i < 4 ? ' blue-side' : (i > 4 ? ' red-side' : '')}${i === BLUE_DEPLOY_IDX ? ' deploy-blue' : ''}${i === RED_DEPLOY_IDX ? ' deploy-red' : ''}`;
            sec.dataset.sectorIdx = i;

            const label = document.createElement('div');
            label.className = 'sector-label';
            const tag = i === BLUE_DEPLOY_IDX ? '⌃ BLUE DEPLOY' : (i === RED_DEPLOY_IDX ? 'RED DEPLOY ⌃' : '');
            label.innerHTML = `<span>${SECTORS[i]}</span><span class="deploy-tag">${tag}</span>`;
            label.dataset.tip = (i === BLUE_DEPLOY_IDX || i === RED_DEPLOY_IDX) ? 'deploy' : 'sector';
            sec.appendChild(label);

            if (i === BLUE_BASE_IDX) sec.appendChild(renderBase('blue'));
            if (i === RED_BASE_IDX) sec.appendChild(renderBase('red'));
            el.appendChild(sec);
        }
        const shipsLayer = document.createElement('div');
        shipsLayer.id = 'ships-layer';
        el.appendChild(shipsLayer);
        const fxLayer = document.createElement('div');
        fxLayer.id = 'fx-layer';
        el.appendChild(fxLayer);
    }

    /*
    const blueBase = el.querySelector('.base.blue');
    const redBase = el.querySelector('.base.red');
    if (blueBase) blueBase.replaceWith(renderBase('blue'));
    if (redBase) redBase.replaceWith(renderBase('red'));
    */

    const blueHp = el.querySelector('.base.blue .base-hp');
    if (blueHp) blueHp.textContent = parseFloat(state.blue.hp.toFixed(1));

    const redHp = el.querySelector('.base.red .base-hp');
    if (redHp) redHp.textContent = parseFloat(state.red.hp.toFixed(1));

    const shipsLayer = document.getElementById('ships-layer');
    const allShips = [...state.blue.ships, ...state.red.ships];
    const activeIds = new Set(allShips.map(s => s.id));

    for (const [id, div] of shipElements) {
        if (!activeIds.has(id)) {
            div.remove();
            shipElements.delete(id);
        }
    }

    for (const ship of allShips) {
        const pos = getShipPosition(ship, allShips);
        let div = shipElements.get(ship.id);
        if (!div) {
            div = createShipElement(ship, pos.compact);
            shipsLayer.appendChild(div);
            shipElements.set(ship.id, div);
        }
        div.style.left = `calc(${pos.leftPct}% + 4px)`;
        div.style.top = `${pos.top}px`;
        div.style.zIndex = -ship.row;
        updateShipElement(div, ship);
    }

    let maxBottom = 300;
    for (const ship of allShips) {
        const pos = getShipPosition(ship, allShips);
        const bottom = pos.top + SHIP_CARD_H + 12;
        if (bottom > maxBottom) maxBottom = bottom;
    }
    el.style.minHeight = `${maxBottom}px`;
}

export function createShipElement(ship, compact) {
    const div = document.createElement('div');
    div.dataset.shipId = ship.id;
    div.className = `ship ${ship.owner}${compact ? ' compact' : ''}`;
    div.innerHTML = `
        <div class="ship-inner">
          <div style="display: flex; gap:5px;">
              <div><span class="ship-num" data-tip-text="${listAbilities(ship.number)}" style="background:${shipNumBg(ship.number)};">${ship.number}</span></div>
              <div style="position:relative;flex:1">
                  <div class="ship-stats">
                    <span class="atk"></span>
                    <span class="hp"></span>
                    <span class="ship-name" data-tip="shipname">${ship.template.name}</span>
                  </div>
              </div>
          </div>
        </div>`;
    return div;
}

export function updateShipElement(div, ship) {
    if (div.classList.contains('dying')) return;
    div.className = `ship ${ship.owner}${ship._attackPulse ? ' attacking' : ''}${ship.flashDamage ? ' damaged' : ''}${ship.dying ? ' dying' : ''}${ship.exhausted ? ' exhausted' : ''}${ship.justDeployed ? ' appearing' : ''}${ship.health <= 0 ? ' dead' : ''}`;
    const atkEl = div.querySelector('.atk');
    if (atkEl) atkEl.innerHTML = `${ship.number % 5 ? (ship.number % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${ship.attack}`;
    const hpEl = div.querySelector('.hp');
    if (hpEl) hpEl.innerHTML = `${HEART_SVG}${ship.health}`;
}

export function renderBase(owner) {
    const div = document.createElement('div');
    div.className = `base ${owner}`;
    div.dataset.tip = 'base';
    div.innerHTML = `<div class="base-hp">${parseFloat(state[owner].hp.toFixed(3))}</div>`;
    const row = document.createElement('div');
    row.className = "row1";
    div.appendChild(row);
    for (const n of state[owner].history) {
        row.insertAdjacentHTML('beforeend', `<span class="num" style="background:${shipNumBg(n)};" data-tip-text="${listAbilities(n)}" data-html="true">${n}</span>`);
    }
    return div;
}
let deployBarInitialized = false;

export function renderDeployBar() {
    const el = document.getElementById('deploy-bar');
    if (!el) return;

    const cb = document.getElementById('tag-toggle');
    const scrubMode = cb ? !cb.checked : false;

    // --- INITIAL BUILD (Run only once!) ---
    if (!deployBarInitialized || el.children.length === 0) {
        el.innerHTML = '';

        // Skip Button
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.id = 'btn-ship-skip';
        skip.className = 'ship-btn skip-btn';
        skip.dataset.tip = 'free';
        skip.innerHTML = `<div class="stats"><span class="num">0</span></div><div class="row1"><span class="name">Skip</span></div><span class="overlay-text-right">FREE</span>`;
        skip.onclick = () => { if (!processing && !gameOver) runTurn(0); };
        el.appendChild(skip);

        // 54 Ship Buttons
        for (const n of SHIP_NUMS) {
            const t = TEMPLATES[n];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = `btn-ship-${n}`;
            btn.dataset.shipNum = n;
            btn.innerHTML = `
              <div class="stats">
                <span class="num" style="background:${shipNumBg(n)};" data-tip-text="${listAbilities(n)}" data-html="true">${n}</span>
                <span class="atk">${n % 5 ? (n % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${t.attack}</span>
                <span class="hp">${HEART_SVG}${t.health}</span>
              </div>
              <div class="row1"><span class="name">${t.name}</span></div>
              <span class="overlay-text-right price-tag"></span>
            `;
            btn.onclick = () => {
                const c = cost(n, state.blue.ore);
                const affordable = state.blue.money + maxLoanFor(state.blue.income) >= c;
                if (affordable && !processing && !gameOver) runTurn(n);
            };
            el.appendChild(btn);
        }
        deployBarInitialized = true;
    }

    // --- IN-PLACE UPDATE (0 DOM nodes created or destroyed) ---
    const skipBtn = document.getElementById('btn-ship-skip');
    if (skipBtn) {
        skipBtn.classList.toggle('disabled', processing || gameOver);
    }

    for (const n of SHIP_NUMS) {
        const btn = document.getElementById(`btn-ship-${n}`);
        if (!btn) continue;

        const isHidden = scrubMode && n > 4 + state.turn;
        btn.style.display = isHidden ? 'none' : '';
        if (isHidden) continue;

        const c = cost(n, state.blue.ore);
        const affordable = state.blue.money + maxLoanFor(state.blue.income) >= c;
        const btnDisabled = !affordable || processing || gameOver;

        btn.className = `ship-btn${affordable ? '' : ' unaffordable'}${btnDisabled ? ' disabled' : ''}`;

        const priceTag = btn.querySelector('.price-tag');
        if (priceTag) {
            priceTag.textContent = c.toFixed(2);
            priceTag.className = `overlay-text-right price-tag ${c > state.blue.money ? 'text-red' : ''}`;
        }
    }
}
