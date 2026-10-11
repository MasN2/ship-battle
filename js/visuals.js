import { state, timeout } from './state.js';

export function shipFactorStops(num) {
    const stops = [];
    if (num === 0) return [0];
    let n = num;
    const primes = [
        { p: 2, c: 'var(--f-cmb)' }, { p: 3, c: 'var(--f-min)' },
        { p: 5, c: 'var(--f-aoe)' }, { p: 7, c: 'var(--f-inc)' },
        { p: 11, c: 'var(--f-11)' }, { p: 13, c: 'var(--f-13)' },
        { p: 17, c: 'var(--f-17)' }, { p: 19, c: 'var(--f-19)' },
        { p: 23, c: 'var(--f-23)' }
    ];
    for (const { p, c } of primes) {
        while (n % p === 0) { stops.push({ c, p }); n /= p; }
    }
    if (stops.length === 0) stops.push({ c: 'var(--f-base)', p: 1 });
    return stops;
}

export function buildConicGradient(num) {
    const stops = shipFactorStops(num);
    const n = stops.length;
    if (n === 1) return stops[0].c;
    const SEP = 'oklch(0.97 0.005 245)';
    const SEPW = 1 / 30;
    const out = [`${SEP} 0turn`, `${SEP} ${SEPW / 2}turn`];
    let cum = SEPW / 2;
    for (let i = 0; i < n; i++) {
        out.push(`${stops[i].c} ${cum}turn`);
        cum += Math.log(stops[i].p) / Math.log(num) - SEPW;
        out.push(`${stops[i].c} ${cum}turn`, `${SEP} ${cum}turn`);
        cum += SEPW;
        out.push(`${SEP} ${cum}turn`);
    }
    return `conic-gradient(${out.join(', ')})`;
}

export function buildBandedGradient(num, angle) {
    const stops = shipFactorStops(num);
    const n = stops.length;
    if (n === 1) return stops[0].c || stops[0];
    const SEP = 'oklch(0.97 0.005 245)';
    const SEPW = Math.min(8, 18 / n);
    const out = [];
    for (let i = 0; i < n; i++) {
        const p = (i / n) * 100;
        const q = ((i + 1) / n) * 100;
        const a = i === 0 ? 0 : p + SEPW / 2;
        const b = i === n - 1 ? 100 : q - SEPW / 2;
        const color = stops[i].c || stops[i];
        out.push(`${color} ${a.toFixed(2)}%`, `${color} ${b.toFixed(2)}%`);
        if (i < n - 1) {
            out.push(`${SEP} ${(q - SEPW / 2).toFixed(2)}%`, `${SEP} ${(q + SEPW / 2).toFixed(2)}%`);
        }
    }
    return `linear-gradient(${angle}, ${out.join(', ')})`;
}

export function shipGradient(num) { return buildConicGradient(num); }
export function shipStripGradient(num) { return buildBandedGradient(num, '180deg'); }
export function shipNumBg(num) {
    const INNER = 'oklch(0.18 0.025 245)';
    return `linear-gradient(${INNER}, ${INNER}) padding-box, ${shipGradient(num)} border-box`;
}

export function isWhileAliveTag(t) {
    return t.startsWith('×3') || t.startsWith('×7') || t === 'SPLIT' || t === 'DOUBLE STRIKE' || t === 'TRAMPLE' || t === 'LONG RANGE';
}
export function stripTagPrefix(t) { return t.replace(/^×[2357] /, ''); }
export function tagFactorClass(t) {
    if (t.startsWith('×2')) return 'tag-cmb';
    if (t.startsWith('MIN')) return 'tag-min';
    if (t.startsWith('×5')) return 'tag-inc';
    if (t.startsWith('×7')) return 'tag-aoe';
    if (t === 'SPLIT') return 'tag-split';
    if (t === 'DOUBLE STRIKE') return 'tag-ds';
    if (t === 'TRAMPLE') return 'tag-trample';
    if (t === 'LONG RANGE') return 'tag-lr';
    return '';
}

export function shootLaser(fromEl, toEl, owner, opts = {}) {
    if (!fromEl || !toEl) return;
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const oRect = layer.getBoundingClientRect();
    const f = fromEl.getBoundingClientRect();
    const t = toEl.getBoundingClientRect();
    const x1 = f.left + f.width / 2 - oRect.left;
    const y1 = f.top + f.height / 2 - oRect.top;
    const x2 = t.left + t.width / 2 - oRect.left;
    const y2 = t.top + t.height / 2 - oRect.top;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const delay = opts.delay || 0;

    const fire = () => {
        const laser = document.createElement('div');
        laser.className = `fx-laser ${owner}${opts.preview ? ' preview' : ''}${opts.aoe ? ' aoe' : ''}`;
        laser.style.left = `${x1}px`;
        laser.style.top = `${y1}px`;
        laser.style.width = `${len}px`;
        laser.style.transform = `rotate(${angle}deg)`;
        layer.appendChild(laser);
        timeout(() => laser.remove(), 600);
        if (!opts.preview) timeout(() => impactFlash(x2, y2, owner, opts.large), 220);
    };
    if (delay > 0) setTimeout(fire, delay); else fire();
}

export function impactFlash(x, y, owner, large = false) {
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const d = document.createElement('div');
    d.className = `fx-impact ${owner}${large ? ' large' : ''}`;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    layer.appendChild(d);
    timeout(() => d.remove(), 480);
}

export function showDamageNumber(el, dmg, owner, opts = {}) {
    if (!el) return;
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const delay = opts.delay || 0;
    const shipId = el.dataset.shipId;
    const isBase = el.classList.contains('base');
    const baseOwner = isBase ? (el.classList.contains('blue') ? 'blue' : 'red') : null;

    const fire = () => {
        let currentEl = isBase ? document.querySelector(`.base.${baseOwner}`) : (shipId ? document.querySelector(`[data-ship-id="${shipId}"]`) : null);
        if (!currentEl || !document.body.contains(currentEl)) return;
        const currentORect = layer.getBoundingClientRect();
        const currentR = currentEl.getBoundingClientRect();
        const div = document.createElement('div');
        div.className = `fx-damage${opts.aoe ? ' aoe' : ''}`;
        div.style.left = `${currentR.left + currentR.width / 2 - currentORect.left}px`;
        div.style.top = `${currentR.top - currentORect.top + 4}px`;
        div.style.color = owner === 'blue' ? 'var(--laser-blue)' : 'var(--laser-red)';
        if (opts.large) div.style.fontSize = '22px';
        div.textContent = `−${dmg}`;
        layer.appendChild(div);
        timeout(() => { if (div.parentNode) div.remove(); }, 1000);
    };
    if (delay > 0) setTimeout(fire, delay); else fire();
}

export function animateAttacker(ship) {
    ship._attackPulse = true;
    ship.exhausted = true;
    timeout(() => { ship._attackPulse = false; }, 450);
}

export function flashBase(owner) {
    const el = document.querySelector(`.base.${owner}`);
    if (el) {
        el.classList.add('damaged');
        timeout(() => el.classList.remove('damaged'), 400);
    }
}