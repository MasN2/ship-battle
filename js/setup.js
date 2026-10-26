// The New Game screen: pick an opponent (skirmish AI, campaign mission, online/custom) and, for
// skirmishes, modifiers (js/modifiers.js). Start Game hands the choice to startGame(); Restart
// replays it. The last choice is remembered in this browser.

import { DIFFICULTIES } from './config.js';
import { startGame, setup as currentSetup } from './state.js';
import { DEFAULT_MODS, DISCOUNT_PRIMES, OPENINGS, PRESETS, normalizeMods, describeMods } from './modifiers.js';

const STORE_KEY = 'shipbattle.setup';

const SLIDERS = [
    { key: 'startMoney', label: 'Starting money', min: 0, max: 30, step: 1 },
    { key: 'startIncome', label: 'Starting income', min: 1, max: 12, step: 1 },
    { key: 'startOre', label: 'Starting ore', min: 0, max: 80, step: 5 },
    { key: 'baseHp', label: 'Base HP', min: 40, max: 400, step: 20 },
];
const STEPS = [
    { key: 'shipHp', label: 'Ship HP', values: [0.5, 0.75, 1, 1.5, 2] },
    { key: 'shipAtk', label: 'Ship attack', values: [0.5, 1, 1.5, 2] },
];

const CLASSIC_HINT = {
    normal: 'The standard AI', hard: 'Gains ore and armor over time', challenging: 'More ore and armor',
    tricky: 'Sharper picks, more ore', visionary: 'The strongest handicapped AI',
};

let draft = loadDraft();
let tab = draft.tab ?? 'skirmish';

function loadDraft() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved && DIFFICULTIES[saved.difficulty]) return { ...saved, mods: normalizeMods(saved.mods) };
    } catch { /* storage unavailable: use defaults */ }
    return { difficulty: 'normal', mods: normalizeMods(), chaos: false, tab: 'skirmish' };
}

function saveDraft() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...draft, tab })); } catch { /* ignore */ }
}

const isCampaign = key => key.startsWith('campaign');
const isOther = key => ['pvp', 'custom'].includes(DIFFICULTIES[key].ai);
const tabOf = key => isCampaign(key) ? 'campaign' : isOther(key) ? 'other' : 'skirmish';

function choiceButton(key, label, hint) {
    const b = document.createElement('button');
    b.className = 'setup-choice';
    b.dataset.key = key;
    b.innerHTML = `<span class="setup-choice-label"></span><span class="setup-choice-hint"></span>`;
    b.querySelector('.setup-choice-label').textContent = label;
    b.querySelector('.setup-choice-hint').textContent = hint ?? '';
    b.addEventListener('click', () => { draft.difficulty = key; refresh(); });
    return b;
}

function buildChoices() {
    const opp = document.getElementById('setup-opponents');
    const camp = document.getElementById('setup-campaigns');
    const other = document.getElementById('setup-other');
    for (const [key, D] of Object.entries(DIFFICULTIES)) {
        if (isCampaign(key)) {
            camp.appendChild(choiceButton(key, D.label.replace('Campaign ', 'Mission '), D.tutorial ? 'Tutorial' : 'Prime master'));
        } else if (isOther(key)) {
            other.appendChild(choiceButton(key, D.label, D.ai === 'pvp' ? 'Play a person online' : 'Enter a build order for red'));
        } else {
            opp.appendChild(choiceButton(key, D.label, CLASSIC_HINT[key] ?? (D.ai === 'grandmaster' ? 'Searches ahead, no handicaps' : '')));
        }
    }
}

function buildMods() {
    const presets = document.getElementById('setup-presets');
    for (const [key, p] of Object.entries(PRESETS)) {
        const b = document.createElement('button');
        b.className = 'setup-preset';
        b.dataset.key = key;
        b.title = p.desc;
        b.textContent = key === 'chaos' ? `🎲 ${p.label}` : p.label;
        b.addEventListener('click', () => {
            draft.chaos = key === 'chaos';
            if (!draft.chaos) draft.mods = normalizeMods(p.mods);
            refresh();
        });
        presets.appendChild(b);
    }

    const box = document.getElementById('setup-mods');
    for (const s of SLIDERS) {
        const row = document.createElement('label');
        row.className = 'setup-mod';
        row.innerHTML = `<span class="setup-mod-label"></span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><output></output>`;
        row.querySelector('.setup-mod-label').textContent = s.label;
        const input = row.querySelector('input');
        input.dataset.key = s.key;
        input.addEventListener('input', () => { draft.mods[s.key] = Number(input.value); refresh(); });
        box.appendChild(row);
    }
    for (const s of STEPS) box.appendChild(segmented(s.label, s.key, s.values.map(v => [v, `×${v}`])));
    box.appendChild(segmented('Opening', 'opening', Object.entries(OPENINGS).map(([k, o]) => [k, o.label, o.desc])));

    const primes = document.createElement('div');
    primes.className = 'setup-mod';
    primes.innerHTML = `<span class="setup-mod-label">Discounted primes</span><div class="setup-seg" data-key="discount"></div>`;
    const seg = primes.querySelector('.setup-seg');
    for (const p of DISCOUNT_PRIMES) {
        const b = document.createElement('button');
        b.className = 'setup-seg-btn prime';
        b.dataset.value = p;
        b.textContent = `×${p}`;
        b.title = `Ships whose number is a multiple of ${p} cost less`;
        b.addEventListener('click', () => {
            const d = draft.mods.discount;
            draft.mods.discount = d.includes(p) ? d.filter(x => x !== p) : [...d, p].sort((a, b) => a - b);
            refresh();
        });
        seg.appendChild(b);
    }
    box.appendChild(primes);

    const pct = document.createElement('label');
    pct.className = 'setup-mod';
    pct.id = 'setup-discount-pct';
    pct.innerHTML = `<span class="setup-mod-label">Discount</span><input type="range" min="10" max="60" step="5" data-key="discountPct"><output></output>`;
    const pin = pct.querySelector('input');
    pin.addEventListener('input', () => { draft.mods.discountPct = Number(pin.value); refresh(); });
    box.appendChild(pct);
}

function segmented(label, key, options) {
    const row = document.createElement('div');
    row.className = 'setup-mod';
    row.innerHTML = `<span class="setup-mod-label"></span><div class="setup-seg"></div>`;
    row.querySelector('.setup-mod-label').textContent = label;
    const seg = row.querySelector('.setup-seg');
    seg.dataset.key = key;
    for (const [value, text, desc] of options) {
        const b = document.createElement('button');
        b.className = 'setup-seg-btn';
        b.dataset.value = value;
        b.textContent = text;
        if (desc) b.title = desc;
        b.addEventListener('click', () => { draft.mods[key] = value; refresh(); });
        seg.appendChild(b);
    }
    return row;
}

function sameMods(a, b) {
    return JSON.stringify(normalizeMods(a)) === JSON.stringify(normalizeMods(b));
}

function refresh() {
    document.querySelectorAll('.setup-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.setup-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });

    // Picking a tab without a choice in it selects that tab's first entry.
    if (tabOf(draft.difficulty) !== tab) {
        const first = document.querySelector(`.setup-pane[data-pane="${tab}"] .setup-choice`);
        if (first) draft.difficulty = first.dataset.key;
    }
    document.querySelectorAll('.setup-choice').forEach(b => b.classList.toggle('active', b.dataset.key === draft.difficulty));

    const m = draft.mods;
    document.querySelectorAll('.setup-preset').forEach(b => {
        const key = b.dataset.key;
        b.classList.toggle('active', key === 'chaos' ? draft.chaos : !draft.chaos && sameMods(m, PRESETS[key].mods));
    });
    document.getElementById('setup-mods').classList.toggle('disabled', draft.chaos);
    document.querySelectorAll('#setup-mods input[type=range]').forEach(i => {
        i.value = m[i.dataset.key];
        i.disabled = draft.chaos;
        i.nextElementSibling.textContent = i.dataset.key === 'discountPct' ? `${m.discountPct}%` : m[i.dataset.key];
        i.closest('.setup-mod').classList.toggle('changed', m[i.dataset.key] !== DEFAULT_MODS[i.dataset.key]);
    });
    document.querySelectorAll('#setup-mods .setup-seg').forEach(seg => {
        const key = seg.dataset.key;
        seg.querySelectorAll('.setup-seg-btn').forEach(b => {
            const on = key === 'discount' ? m.discount.includes(Number(b.dataset.value)) : String(m[key]) === b.dataset.value;
            b.classList.toggle('active', on);
            b.disabled = draft.chaos;
        });
        const changed = key === 'discount' ? m.discount.length > 0 : m[key] !== DEFAULT_MODS[key];
        seg.closest('.setup-mod').classList.toggle('changed', changed);
    });
    document.getElementById('setup-discount-pct').hidden = m.discount.length === 0;

    const summary = document.getElementById('setup-summary');
    const active = describeMods(m);
    summary.textContent = draft.chaos ? '🎲 2–3 random modifiers, rolled fresh every game.'
        : active.length ? `Active: ${active.join(' · ')}` : 'Standard rules.';
    summary.classList.toggle('modded', draft.chaos || active.length > 0);
    saveDraft();
}

const modal = () => document.getElementById('setup-modal');

export function openSetup() {
    // Open on the game being played.
    draft = { ...draft, difficulty: currentSetup.difficulty, mods: normalizeMods(currentSetup.mods), chaos: currentSetup.chaos };
    tab = tabOf(draft.difficulty);
    refresh();
    modal().classList.add('active');
    modal().setAttribute('aria-hidden', 'false');
}

export function closeSetup() {
    modal().classList.remove('active');
    modal().setAttribute('aria-hidden', 'true');
}

export const isSetupOpen = () => modal().classList.contains('active');

/** Builds the screen; on page load it opens with the last setup this browser used. */
export function initSetup() {
    buildChoices();
    buildMods();
    document.querySelectorAll('.setup-tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; refresh(); }));
    document.getElementById('setup-reset').addEventListener('click', () => { draft.chaos = false; draft.mods = normalizeMods(); refresh(); });
    document.getElementById('setup-cancel').addEventListener('click', closeSetup);
    document.getElementById('setup-start').addEventListener('click', () => {
        closeSetup();
        const skirmish = tabOf(draft.difficulty) === 'skirmish';
        startGame({ difficulty: draft.difficulty, mods: skirmish ? draft.mods : DEFAULT_MODS, chaos: skirmish && draft.chaos });
    });
    tab = tabOf(draft.difficulty);
    refresh();
    modal().classList.add('active');
    modal().setAttribute('aria-hidden', 'false');
}
