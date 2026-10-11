import { ORE_BASE, ORE_POW, ORE_R } from './config.js';

export const TIPS = {
    atk: '<span class="tc">Attack</span> — damage dealt to a target ship per hit.',
    hp: '<span class="tc">Health</span> — remaining / max. The ship is destroyed at 0 HP.',
    cost: '<span class="tc">Deploy cost</span>. Formula: cost = N^(1 + <span class="to">1/ore</span>). Mining <span class="to">ore</span> lowers all costs.',
    free: 'Skip your deploy this turn. No <span class="tc">money</span> spent — useful to save up for a heavier ship.',
    income: '<span class="tc">Income</span> — money gained at the START of every turn. Boostable with Trader ships (<span class="to">×5</span>).',
    money: '<span class="tc">Money</span> — spendable funds. Used to deploy ships. You can overspend up to $4 (plus a bit more if your income is high), paying 25% interest.',
    ore: `<span class="to">Ore</span> — dilutes the excess exponent of ships by ((o+${ORE_BASE})^${ORE_POW} - ${ORE_BASE}^${ORE_POW})/${ORE_R}. x diluted by y is x^2/(x+y).`,
    base: 'Your base. Reduce the enemy base to 0 HP to win. Bases cannot move or attack.',
    basehp: '<span class="tc">Base HP</span>. Reduced when enemy ships in range strike it. Game ends at 0.',
    sector: 'A column of the battlefield. Ships can attack targets up to 2 sectors away.',
    deploy: 'Ships deploy into this sector. Blue deploys to B; Red deploys to H.',
    handicap: 'AI handicap. Applied when you click New Battle. Adjusts AI income, ore, base HP, and play strength.',
    turn: 'Current turn. Each turn: Income → Deploy → Attack → Cleanup → Advance → Mining.',
    shipnum: 'Ship class number. Its factors decide its abilities (<span class="tc">×2</span> combat, <span class="to">×3</span> mining, <span class="to">×5</span> income, <span class="to">×7</span> missile).',
    shipname: 'Ship class name. Cosmetic — the number is what matters mechanically.',
    sound: 'Sound effects. Off by default. Toggle to hear deploys, attacks, hits, deaths, and end-of-battle stings.',
    speed: 'Animation speed. Drag right to resolve turns faster (up to 5×).',
};

const tooltipEl = document.getElementById('tooltip');
let currentTip = null;

function getTipText(el) {
    const cb = document.getElementById('tag-toggle');
    const scrubMode = cb ? !cb.checked : false;
    if (scrubMode && el.dataset.tip === 'ore') return 'Ore discounts your ships! Bigger ships get bigger discounts!';
    return el.dataset.tipText || (el.dataset.tip ? TIPS[el.dataset.tip] : '') || '';
}

export function showTip(el) {
    const text = getTipText(el);
    if (!text || !tooltipEl) return;
    tooltipEl.innerHTML = text;
    tooltipEl.classList.remove('below');
    tooltipEl.style.left = '-9999px';
    tooltipEl.style.top = '0px';

    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let top = r.top - th - 10;
    let below = false;

    if (top < 8) {
        top = r.bottom + 10;
        below = true;
    }

    let left = cx;
    const halfW = tw / 2;
    const margin = 8;
    if (left - halfW < margin) left = halfW + margin;
    if (left + halfW > window.innerWidth - margin) left = window.innerWidth - halfW - margin;

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.classList.toggle('below', below);
    tooltipEl.classList.add('visible');
}

export function hideTip() {
    currentTip = null;
    if (tooltipEl) tooltipEl.classList.remove('visible');
}

export function initTooltips() {
    document.addEventListener('mouseover', e => {
        const el = e.target.closest('[data-tip],[data-tip-text]');
        if (!el || el === currentTip) return;
        currentTip = el;
        showTip(el);
    });
    document.addEventListener('mouseout', e => {
        if (!currentTip) return;
        const to = e.relatedTarget;
        if (to && currentTip.contains(to)) return;
        if (to && to.closest && to.closest('[data-tip],[data-tip-text]')) return;
        hideTip();
    });
    window.addEventListener('scroll', hideTip, true);
    window.addEventListener('resize', hideTip);
}