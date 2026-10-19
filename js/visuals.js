import { state, timeout } from './state.js';

// --- DYNAMIC FX POOLS ---
const INITIAL_POOL_SIZE = 30; // Start small to save initial DOM overhead
const laserPool = [];
const impactPool = [];
const damagePool = [];
let poolsReady = false;

// Generic helper: grabs an idle element, or dynamically expands the pool if full
function acquireFromPool(pool, defaultClass) {
    let item = pool.find(p => !p.inUse);

    // If all pooled elements are busy, EXPAND the pool by 1!
    if (!item) {
        const layer = document.getElementById('fx-layer');
        if (!layer) return null;

        const el = document.createElement('div');
        el.className = defaultClass;
        el.style.display = 'none';
        layer.appendChild(el);

        item = { el, inUse: false };
        pool.push(item);
    }

    item.inUse = true;
    return item;
}

export function initFxPool() {
    const layer = document.getElementById('fx-layer');
    if (!layer || poolsReady) return;
    layer.innerHTML = '';

    // Seed the initial pool
    for (let i = 0; i < INITIAL_POOL_SIZE; i++) {
        // Laser
        const l = document.createElement('div');
        l.className = 'fx-laser';
        l.style.display = 'none';
        layer.appendChild(l);
        laserPool.push({ el: l, inUse: false });

        // Impact
        const imp = document.createElement('div');
        imp.className = 'fx-impact';
        imp.style.display = 'none';
        layer.appendChild(imp);
        impactPool.push({ el: imp, inUse: false });

        // Damage Number
        const dmg = document.createElement('div');
        dmg.className = 'fx-damage';
        dmg.style.display = 'none';
        layer.appendChild(dmg);
        damagePool.push({ el: dmg, inUse: false });
    }
    poolsReady = true;
}


let rectCache = new Map();
export function clearRectCache() {
    rectCache.clear();
}
function getCachedRect(el) {
    if (!el) return null;
    let r = rectCache.get(el);
    if (!r) {
        r = el.getBoundingClientRect();
        rectCache.set(el, r);
    }
    return r;
}

export function shipFactorStops(num) {
    const stops = [];
    if (num <= 0) return [{ c: 'rgba(0,0,0,0)', p: 1 }];
    let n = num;
    const primes = [
        { p: 2, c: 'var(--f-cmb)' }, { p: 3, c: 'var(--f-min)' },
        { p: 5, c: 'var(--f-aoe)' }, { p: 7, c: 'var(--f-inc)' },
        { p: 11, c: 'var(--f-11)' }, { p: 13, c: 'var(--f-13)' },
        { p: 17, c: 'var(--f-17)' }, { p: 19, c: 'var(--f-19)' },
        { p: 23, c: 'var(--f-23)' }, { p: 29, c: 'var(--f-29)' }, { p: 31, c: 'var(--f-31)' },
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
    if (n === 1) return stops[0].c || stops[0];
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
    if (!fromEl || !toEl) return null;
    initFxPool();

    const oRect = getCachedRect(document.getElementById('fx-layer'));
    const f = getCachedRect(fromEl);
    const t = getCachedRect(toEl);

    const x1 = f.left + f.width / 2 - oRect.left;
    const y1 = f.top + f.height / 2 - oRect.top;
    const x2 = t.left + t.width / 2 - oRect.left;
    const y2 = t.top + t.height / 2 - oRect.top;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const delay = opts.delay || 0;

    const fire = () => {
        // Automatically expands if all current lasers are in-flight!
        const item = acquireFromPool(laserPool, 'fx-laser');
        if (!item) return;

        const laser = item.el;
        laser.className = `fx-laser ${owner}${opts.preview ? ' preview' : ''}${opts.aoe ? ' aoe' : ''}`;
        laser.style.left = `${x1}px`;
        laser.style.top = `${y1}px`;
        laser.style.width = `${len}px`;
        laser.style.transform = `rotate(${angle}deg)`;
        laser.style.display = 'block';

        timeout(() => {
            laser.style.display = 'none';
            item.inUse = false; // Returned to pool
        }, 350);

        if (!opts.preview) timeout(() => impactFlash(x2, y2, owner, opts.large), 180);
    };

    if (delay > 0) timeout(fire, delay);
    else fire();

    return { targetX: x2, targetY: y2 };
}

export function impactFlash(x, y, owner, large = false) {
    initFxPool();
    const item = acquireFromPool(impactPool, 'fx-impact');
    if (!item) return;

    const d = item.el;
    d.className = `fx-impact ${owner}${large ? ' large' : ''}`;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.display = 'block';

    timeout(() => {
        d.style.display = 'none';
        item.inUse = false; // Returned to pool
    }, 280);
}

export function showDamageNumber(x, y, dmg, owner, opts = {}) {
    initFxPool();
    const delay = opts.delay || 0;

    const fire = () => {
        const item = acquireFromPool(damagePool, 'fx-damage');
        if (!item) return;

        const div = item.el;
        div.className = `fx-damage${opts.aoe ? ' aoe' : ''}`;
        div.style.left = `${x}px`;
        div.style.top = `${y - 10}px`;
        div.style.color = owner === 'blue' ? 'var(--laser-blue)' : 'var(--laser-red)';
        div.style.fontSize = opts.large ? '22px' : '';
        div.textContent = `−${dmg}`;
        div.style.display = 'block';

        timeout(() => {
            div.style.display = 'none';
            item.inUse = false; // Returned to pool
        }, 650);
    };

    if (delay > 0) timeout(fire, delay);
    else fire();
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