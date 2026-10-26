import { state } from './js/state.js';
import { SWORD_SVG, BOW_SVG, ROCKET_SVG, HEART_SVG } from './js/config.js';
import { economy, balance } from './js/economy.js';

const STORAGE_KEY = 'shipbattle.laneSummary';

// Drill icon for mining ships (#3, #6, #9, etc.)
const DRILL_SVG = `
<svg class="lane-icon" viewBox="0 0 16 16">
  <path fill="currentColor" d="M7 0.5h2v2H7zm-2 2.5h6l-.8 2H5.8zm.5 2.5h5l-.8 2H6.3zm.5 2.5h4l-.8 2H6.8zm.5 2.5h3l-.8 2H7.3zm.5 2.5h2L8 15.5z"/>
</svg>`;

// Gold coin icon for End of Turn Income ships (#23, #46, etc.)
const COIN_SVG = `
<svg class="lane-icon" viewBox="0 0 16 16">
  <path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.6 3.5v1a2 2 0 0 1 1.4.6l-.8.8a1.1 1.1 0 0 0-.6-.3c-.4 0-.7.2-.7.5 0 .3.2.4.6.6l.6.2c.8.3 1.3.8 1.3 1.6 0 .8-.6 1.4-1.4 1.5v1h-.8v-1a2.2 2.2 0 0 1-1.6-.7l.8-.8c.3.3.5.4.8.4.4 0 .7-.2.7-.5 0-.3-.2-.5-.6-.6l-.6-.2c-.8-.3-1.3-.8-1.3-1.6 0-.7.5-1.4 1.4-1.5v-1h.8z"/>
</svg>`;

// Siege / Base Damage icon (Factor 17)
const SIEGE_SVG = `
<svg class="lane-icon" viewBox="0 0 16 16">
  <path fill="currentColor" d="M7 1h2v3H7zm0 11h2v3H7zm6-6h3v2h-3zM0 6h3v2H0zm2.5-3.5l2.1 2.1-1.4 1.4L1.1 3.9zm9.5 9.5l2.1 2.1-1.4 1.4-2.1-2.1zm2.1-9.5l-2.1 2.1-1.4-1.4 2.1-2.1zm-9.5 9.5l-2.1 2.1-1.4-1.4 2.1-2.1zM8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
</svg>`;

// Hangar / Ship Spawner icon for End of Turn Deploy (Factors 13, 43, 47)
const DEPLOY_SVG = `
<svg class="lane-icon" viewBox="0 0 16 16">
  <path fill="currentColor" d="M8 1l4.5 6.5-2.5-.5L10 12H6l.0-5-2.5.5L8 1zm-4 12h8v2H4v-2z"/>
</svg>`;

// Shield with '+' badge for Give Base Armor (Factor 31)
const BASE_ARMOR_SVG = `
<svg class="lane-icon" viewBox="0 0 16 16">
  <path fill="currentColor" fill-rule="evenodd" d="M8 1l6 2.5v4.5c0 3.7-2.6 6.3-6 7.5-3.4-1.2-6-3.8-6-7.5V3.5L8 1zm1 5H7v2H5v2h2v2h2v-2h2V8H9V6z"/>
</svg>`;

function getPrimeFactors(n) {
    if (isNaN(n) || n < 2) return [];
    const factors = [];
    let divisor = 2;
    while (divisor <= n) {
        if (n % divisor === 0) {
            factors.push(divisor);
            n /= divisor;
        } else {
            divisor++;
        }
    }
    return factors;
}

let summaryBarEl = null;
let battlefieldEl = null;
let isEnabled = localStorage.getItem(STORAGE_KEY) === '1';

document.addEventListener('DOMContentLoaded', () => {
    battlefieldEl = document.getElementById('battlefield');
    if (!battlefieldEl) return;

    createSummaryBarDOM();
    injectPauseMenuToggle();
    applyState(isEnabled);

    const observer = new MutationObserver(() => {
        if (isEnabled) updateSummaryBar();
    });

    observer.observe(battlefieldEl, { childList: true, subtree: true });

    const turnInfo = document.getElementById('turn-info');
    if (turnInfo) {
        observer.observe(turnInfo, { childList: true, characterData: true, subtree: true });
    }
});

function createSummaryBarDOM() {
    if (document.getElementById('lane-summary-bar')) return;

    summaryBarEl = document.createElement('div');
    summaryBarEl.id = 'lane-summary-bar';
    battlefieldEl.parentNode.insertBefore(summaryBarEl, battlefieldEl.nextSibling);
}

function injectPauseMenuToggle() {
    const pauseGrid = document.querySelector('.pause-grid');
    let toggle = document.getElementById('summary-toggle');
    if (!toggle && !pauseGrid) return;
    if (!toggle) {
        const toggleWrapper = document.createElement('label');
        toggleWrapper.htmlFor = 'summary-toggle';
        toggleWrapper.innerHTML = `
            <div class="pause-field toggle-row">
                <label for="summary-toggle">Lane Summary Bar</label>
                <input type="checkbox" id="summary-toggle" />
            </div>
        `;
        pauseGrid.appendChild(toggleWrapper);
        toggle = toggleWrapper.querySelector('input');
    }

    toggle.checked = isEnabled;
    toggle.addEventListener('change', (e) => {
        isEnabled = e.target.checked;
        localStorage.setItem(STORAGE_KEY, isEnabled ? '1' : '0');
        applyState(isEnabled);
    });
}

function applyState(enabled) {
    if (summaryBarEl) {
        summaryBarEl.style.display = enabled ? 'grid' : 'none';
    }
    if (enabled) {
        updateSummaryBar();
    }
}

export function updateSummaryBar() {
    if (!summaryBarEl || !state) return;

    // 7 sectors: columns B (index 1) through H (index 7)
    const sectors = Array.from({ length: 8 }, () => ({
        melee: 0,
        range: 0,
        missile: 0,
        siege: 0,
        drill: 0,
        income: 0,
        deploy: 0,
        baseArmor: 0,
        hp: 0,
        count: 0
    }));

    const sectorOwnership = Array.from({ length: 8 }, () => ({ blue: 0, red: 0 }));

    // Each player always owns their starting column (Col B / 1 for Blue, Col H / 7 for Red)
    sectorOwnership[1].blue += 69420;
    sectorOwnership[7].red += 69420;

    const allShips = [...(state.blue?.ships || []), ...(state.red?.ships || [])];

    for (const ship of allShips) {
        if (ship.health <= 0 || !ship.sector || ship.sector < 1 || ship.sector > 7) continue;

        const data = sectors[ship.sector];
        data.count += 1;
        data.hp += Math.max(0, ship.health);

        // Ships project ownership to their own column and all columns behind them
        if (ship.owner === 'blue') {
            for (let c = 1; c <= ship.sector; c++) {
                sectorOwnership[c].blue += 1;
            }
        } else if (ship.owner === 'red') {
            for (let c = ship.sector; c <= 7; c++) {
                sectorOwnership[c].red += 1;
            }
        }

        const n = ship.number;
        const atk = ship.attack || 0;
        const factors = getPrimeFactors(n);

        // Process factor abilities accounting for multiplicity
        for (const factor of factors) {
            switch (factor) {
                case 3:
                    // Multiples of 3 mine n / 3 ore
                    data.drill += Math.floor(n / 3);
                    break;
                case 5:
                    // Multiples of 5 fire n / 5 damage missiles
                    data.missile += Math.floor(n / 5);
                    break;
                case 13:
                    // Factor 13: End of turn deploy ship #(2n/13) (1 ship per factor 13)
                    data.deploy += 1;
                    break;
                case 17:
                    // Factor 17: Enemy base loses n / 17 HP
                    data.siege += Math.floor(n / 17);
                    break;
                case 23:
                    // Factor 23: Gain n / 23 income
                    data.income += Math.floor(n / 23);
                    break;
                case 31:
                    // Factor 31: Modify your base with +1 armor
                    data.baseArmor += 1;
                    break;
                case 43:
                    // Factor 43: Modify with +1 attack, then deploy that many Corvettes
                    data.deploy += (atk + 1);
                    break;
                case 47:
                    // Factor 47: Deploy ship #(attack) into sector
                    data.deploy += 1;
                    break;
            }
        }

        // Direct vs Long-Range attack (strictly factor 11 for Bow)

            if (factors.includes(11)) {
                data.range += atk;
            } else {
                data.melee += atk;
            }
        
    }

    let html = '';
    for (let i = 1; i <= 7; i++) {
        const active = sectors[i];
        const ownership = sectorOwnership[i];

        // Determine ownership (lanes can be unowned if ownership is tied or both 0)
        let factionClass = '';
        let countColor = '';
        if (ownership.blue > ownership.red) {
            factionClass = 'blue-controlled';
            countColor = 'blue';
        } else if (ownership.red > ownership.blue) {
            factionClass = 'red-controlled';
            countColor = 'red';
        }

        const classAttr = factionClass ? ` ${factionClass}` : '';
        const caretColorClass = countColor ? ` ${countColor}` : '';

        if (active.count === 0 && i === 1){
            html += `<div class="lane-card${classAttr}">
            <span>Economy: ${economy(state.blue.income, state.blue.ore).toFixed(2)}</span>
            <span>Balance: ${balance(state.blue.income, state.blue.ore).toFixed(2)}</span>
            </div>`
        }
        else if (active.count === 0 && i === 7){
            html += `<div class="lane-card${classAttr}">
            <span>Economy: ${economy(state.red.income, state.red.ore).toFixed(2)}</span>
            <span>Balance: ${balance(state.red.income, state.red.ore).toFixed(2)}</span>
            </div>`
        }
        else if (active.count === 0) {
            html += `
                <div class="lane-card${classAttr}">
                    <div class="lane-row empty-row">
                        <span class="lane-stat hp empty-val" data-tip-text="Total HP: 0">${HEART_SVG} 0</span>
                        <span class="lane-stat count empty-val" data-tip-text="Ship count: 0"><span class="caret${caretColorClass}">➤</span> 0</span>
                    </div>
                </div>
            `;
        } else {
        html += `
            <div class="lane-card${classAttr}">
                <div class="lane-row top-row">
                    ${active.melee > 0 ? `<span class="lane-stat melee" data-tip-text="Attack: ${active.melee}">${SWORD_SVG} ${active.melee}</span>` : ''}
                    ${active.range > 0 ? `<span class="lane-stat range" data-tip-text="Long-range attack: ${active.range}">${BOW_SVG} ${active.range}</span>` : ''}
                    ${active.missile > 0 ? `<span class="lane-stat missile" data-tip-text="Missile damage: ${active.missile}">${ROCKET_SVG} ${active.missile}</span>` : ''}
                    ${active.siege > 0 ? `<span class="lane-stat siege" data-tip-text="Base damage per turn: ${active.siege}">${SIEGE_SVG} ${active.siege}</span>` : ''}
                    ${active.drill > 0 ? `<span class="lane-stat drill" data-tip-text="Ore per turn: +${active.drill}">${DRILL_SVG} ${active.drill}</span>` : ''}
                    ${active.income > 0 ? `<span class="lane-stat income" data-tip-text="Income gain per turn: +${active.income}">${COIN_SVG} +${active.income}</span>` : ''}
                    ${active.deploy > 0 ? `<span class="lane-stat deploy" data-tip-text="Ships deployed per turn: +${active.deploy}">${DEPLOY_SVG} +${active.deploy}</span>` : ''}
                    ${active.baseArmor > 0 ? `<span class="lane-stat base-armor" data-tip-text="Base armor per turn: +${active.baseArmor}">${BASE_ARMOR_SVG} +${active.baseArmor}</span>` : ''}
                </div>
                <div class="lane-row bottom-row">
                    <span class="lane-stat hp" data-tip-text="Total HP: ${active.hp}">${HEART_SVG} ${active.hp}</span>
                    <span class="lane-stat count" data-tip-text="Ship count: ${active.count}"><span class="caret${caretColorClass}">➤</span> ${active.count}</span>
                </div>
            </div>
        `;}
    }

    summaryBarEl.innerHTML = html;
}
