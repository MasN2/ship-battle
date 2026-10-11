const userData = {
    alice: {
        title: "Defense Practice 1",
        handicap: 4,
        name: "2,3,3,3,3,3,0,0,7,0,7,0,7,0,7,5,5,5,7,4,7,3,9,0,9,3,9,9,7,7,7,7,0,21",
        email: "0,3,0,7,0,0,1,8,1,2,1,3,1,7,0,7,3,6,0,7,0,7,7,0,8,7,7,8,8,5,5,10,8,11,7,7,12,4,12,7,6,14,7,21,16,14,16",
    },
    bob: {
        title: "test1",
        handicap: 0,
        name: "Bob Smith",
        email: "bob@example.com",
    },
    charlie: {
        title: "test2",
        handicap: 0,
        name: "Charlie Brown",
        email: "charlie@example.com",
    }
};

const dropdown = document.getElementById('userSelect');
const handicapInput = document.getElementById('handicapSelect');
const nameInput = document.getElementById('blue-bo');
const emailInput = document.getElementById('red-bo');

// 1. Dynamically populate the dropdown options from the object
for (const key in userData) {
    if (userData.hasOwnProperty(key)) {
        const user = userData[key];

        // Create a new <option> element
        const option = document.createElement('option');
        option.value = key;               // e.g., "alice"
        option.textContent = user.title;   // e.g., "Alice Johnson"

        // Add it to the dropdown select box
        dropdown.appendChild(option);
    }
}

// 2. Listen for changes to fill the text fields
dropdown.addEventListener('change', function () {
    const selectedValue = this.value;

    if (userData[selectedValue]) {
        handicapInput.value = userData[selectedValue].handicap;
        nameInput.value = userData[selectedValue].name;
        emailInput.value = userData[selectedValue].email;
    } else {
        nameInput.value = '';
        emailInput.value = '';
    }
});

async function importGame() {
    let r = JSON.parse(`[${emailInput.value}]`);
    let b = JSON.parse(`[${nameInput.value}]`);
    newGame(handicapInput.value);
    state.red.opening = r;
    await load(b);
}
const button = document.getElementById('importBtn');
button.addEventListener('click', importGame);


const input = document.getElementById("command-line");

input.addEventListener("keypress", async (event) => {
    // If the user presses the "Enter" key on the keyboard
    if (event.key === "Enter") {
        // Cancel the default action, if needed
        event.preventDefault();
        if (input.value === "?") { input.value = `${state.blue.history}`; }
        else { await load(JSON.parse(`[${input.value}]`)); input.value = ""; }
    }
});

// ===== Factor-coded ship gradient =====
// Each ship's number is factored over {2, 3, 5, 7} *with multiplicity*. The
// resulting list of colored stops is laid out as equal-width bands separated
// by thin dark lines, so:
//   #2 = [2]       → 1 red band
//   #4 = [2,2]     → 2 red bands (one separator)
//   #8 = [2,2,2]   → 3 red bands (two separators)
//   #6 = [2,3]     → red │ teal
//   #12 = [2,2,3]  → red │ red │ teal
//   #18 = [2,3,3]  → red │ teal │ teal
// Primes >7 (11/13/17/19) fall back to neutral slate.
function shipFactorStops(num) {
    const stops = [];
    if (num === 0) return [0];
    let n = num;
    while (n % 2 === 0) { stops.push({ c: 'var(--f-cmb)', p: 2 }); n /= 2; }
    while (n % 3 === 0) { stops.push({ c: 'var(--f-min)', p: 3 }); n /= 3; }
    while (n % 5 === 0) { stops.push({ c: 'var(--f-aoe)', p: 5 }); n /= 5; }
    while (n % 7 === 0) { stops.push({ c: 'var(--f-inc)', p: 7 }); n /= 7; }
    while (n % 11 === 0) { stops.push({ c: 'var(--f-11)', p: 11 }); n /= 11; }
    while (n % 13 === 0) { stops.push({ c: 'var(--f-13)', p: 13 }); n /= 13; }
    while (n % 17 === 0) { stops.push({ c: 'var(--f-17)', p: 17 }); n /= 17; }
    while (n % 19 === 0) { stops.push({ c: 'var(--f-19)', p: 19 }); n /= 19; }
    while (n % 23 === 0) { stops.push({ c: 'var(--f-23)', p: 23 }); n /= 23; }
    if (stops.length === 0) {
        stops.push({ c: 'var(--f-base)', p: 1 });
    }
    return stops;
}
function buildConicGradient(num) {
    const stops = shipFactorStops(num);
    const n = stops.length;
    if (n === 1) return stops[0].c;
    // Soft, fairly wide WHITE spacer between bands — wide enough that
    // adjacent same-color stops (e.g. 8 = 2·2·2) read as separate bars.
    const SEP = 'oklch(0.97 0.005 245)';
    let SEPW = 1 / 30;
    const out = [];
    let cum = 0;
    out.push(`${SEP} ${cum}turn`);
    cum += SEPW / 2;
    out.push(`${SEP} ${cum}turn`);
    for (let i = 0; i < n; i++) {
        out.push(`${stops[i].c} ${cum}turn`);
        cum += Math.log(stops[i].p) / Math.log(num) - SEPW;
        out.push(`${stops[i].c} ${cum}turn`);
        out.push(`${SEP} ${cum}turn`);
        cum += SEPW;
        out.push(`${SEP} ${cum}turn`);
    }
    return `conic-gradient(${out.join(', ')})`;
}
function buildBandedGradient(num, angle) {
    const stops = shipFactorStops(num);
    const n = stops.length;
    if (n === 1) return stops[0];
    // Soft, fairly wide WHITE spacer between bands — wide enough that
    // adjacent same-color stops (e.g. 8 = 2·2·2) read as separate bars.
    const SEP = 'oklch(0.97 0.005 245)';
    const SEPW = Math.min(8, 18 / n); // spacer width as % of gradient length
    const out = [];
    for (let i = 0; i < n; i++) {
        const p = (i / n) * 100;
        const q = ((i + 1) / n) * 100;
        const a = i === 0 ? 0 : p + SEPW / 2;
        const b = i === n - 1 ? 100 : q - SEPW / 2;
        out.push(`${stops[i]} ${a.toFixed(2)}%`, `${stops[i]} ${b.toFixed(2)}%`);
        if (i < n - 1) {
            out.push(`${SEP} ${(q - SEPW / 2).toFixed(2)}%`, `${SEP} ${(q + SEPW / 2).toFixed(2)}%`);
        }
    }
    return `linear-gradient(${angle}, ${out.join(', ')})`;
}
function shipGradient(num) {
    return buildConicGradient(num);
    // return buildBandedGradient(num, '135deg');
}
function shipStripGradient(num) {
    // Vertical version for the compact-mode left strip
    return buildBandedGradient(num, '180deg');
}
// Compose the dual-background trick that turns the factor gradient into a
// ring around a solid-dark interior, so the number text stays readable.
function shipNumBg(num) {
    const INNER = 'oklch(0.18 0.025 245)';
    return `linear-gradient(${INNER}, ${INNER}) padding-box, ${shipGradient(num)} border-box`;
}
// Tags shown on battlefield ships — only those with mechanical effects WHILE alive.
// CHEAP / ×2 CMB / ×5 INC / TANK / GLASS CANNON / ASSASSIN / CAPITAL are
// cosmetic descriptors or on-deploy-only, so they're suppressed on the field.
function isWhileAliveTag(t) {
    return t.startsWith('×3') || t.startsWith('×7') || t === 'SPLIT' || t === 'DOUBLE STRIKE' || t === 'TRAMPLE' || t === 'LONG RANGE';
}
// Strip the factor prefix from tags for cleaner display (e.g., "×2 CMB" → "CMB")
function stripTagPrefix(t) {
    if (t.startsWith('×2 ')) return t.slice(3);
    if (t.startsWith('×3 ')) return t.slice(3);
    if (t.startsWith('×5 ')) return t.slice(3);
    if (t.startsWith('×7 ')) return t.slice(3);
    return t;
}
// CSS class to color-code a tag like its factor identity.
function tagFactorClass(t) {
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
// ===== Game constants =====
const SECTORS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const BLUE_BASE_IDX = 1;
const RED_BASE_IDX = 7;
const BLUE_DEPLOY_IDX = 1;   // sector A
const RED_DEPLOY_IDX = 7;   // sector I
const BASE_START_HP = 150;
const START_INCOME = 4;
const START_ORE = 0;
const ORE_POW = 0.75;
const ORE_R = 27;
const ORE_BASE = 110;
const ATTACK_RANGE = 2;
const MAX_LOAN = 4;
function max_loan_for(income) {
    return MAX_LOAN + 0.1 * Math.max(0, income - 8);
}

// ===== Ship templates =====
// Factors drive abilities:
// ×2 => combat hull (just stat profile, no special rule)
// ×3 => miner (mining attribute generates ore per turn)
// ×5 => trader (income boost on deploy)
// ×7 => missile (damages ALL enemies in target's sector)
//
// Stats below are first-pass — playtest & edit freely.
const TEMPLATES = {
    1: { number: 1, name: 'Skiff', attack: 1, health: 9, tags: [] },
    2: { number: 2, name: 'Corvette', attack: 2, health: 12, tags: ['×2 CMB'], combat: true },
    3: { number: 3, name: 'Driller', attack: 1, health: 4, tags: ['MIN'], mining: 0.03 },
    4: { number: 4, name: 'Frigate', attack: 4, health: 16, tags: ['×2 CMB'], combat: true },
    5: { number: 5, name: 'Missile', attack: 1, health: 19, tags: ['×7 AOE'], missile: true },
    6: { number: 6, name: 'Reaver', attack: 2, health: 16, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.06 },
    7: { number: 7, name: 'Trader', attack: 1, health: 1, tags: ['×5 INC+1'], incomeBoost: 1 },
    8: { number: 8, name: 'Destroyer', attack: 8, health: 22, tags: ['×2 CMB'], combat: true },
    9: { number: 9, name: 'Quarry', attack: 1, health: 4, tags: ['MIN', 'MIN'], mining: 0.18 },
    10: { number: 10, name: 'Hellfire', attack: 2, health: 26, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    11: { number: 11, name: 'Archer', attack: 5, health: 16, tags: ['CARRIER'], split: true },
    12: { number: 12, name: 'Excavator', attack: 4, health: 27, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.12 },
    13: { number: 13, name: 'Carrier', attack: 1, health: 22, tags: ['LONG RANGE'], longRange: true },
    14: { number: 14, name: 'Caravan', attack: 2, health: 20, tags: ['×2 CMB', '×5 INC+2'], combat: true, incomeBoost: 2 },
    15: { number: 15, name: 'Blaster', attack: 1, health: 15, tags: ['MIN', '×7 AOE'], mining: 0.15, missile: true },
    16: { number: 16, name: 'Dreadnought', attack: 16, health: 32, tags: ['×2 CMB'], combat: true },
    17: { number: 17, name: 'Sapper', attack: 1, health: 80, tags: ['SIEGE'], siege: true },
    18: { number: 18, name: 'Behemoth', attack: 2, health: 25, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.36 },
    19: { number: 19, name: 'Bulwark', attack: 1, health: 84, tags: ['ARMOR'] },
    20: { number: 20, name: 'Leviathan', attack: 4, health: 45, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    21: { number: 21, name: 'Foundry', attack: 1, health: 2, tags: ['MIN', '×5 INC+3'], mining: 0.21, incomeBoost: 3 },
    22: { number: 22, name: 'Glaive', attack: 10, health: 45, tags: ['CARRIER'], split: true },
    23: { number: 23, name: 'Pathfinder', attack: 1, health: 12, tags: [] },
    24: { number: 24, name: 'Freighter', attack: 8, health: 55, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.24 },
    25: { number: 25, name: 'Nova', attack: 1, health: 25, tags: ['NOVA'], nova: true },
    26: { number: 26, name: 'Mothership', attack: 2, health: 36, tags: ['×2 CMB', 'LONG RANGE'], longRange: true },
    27: { number: 27, name: 'Cornucopia', attack: 1, health: 6, tags: ['MIN', 'MIN', 'MIN'], mining: 0.81 },
    28: { number: 28, name: 'Convoy', attack: 4, health: 55, tags: ['×2 CMB', '×5 INC+4'], combat: true, incomeBoost: 4 },
    29: { number: 29, name: 'Ruler', attack: 1, health: 40, tags: [] },
    30: { number: 30, name: 'Dynamite', attack: 2, health: 45, tags: ['×2 CMB', 'MIN', '×7 AOE'], mining: 0.30, missile: true },
    31: { number: 31, name: 'Raybeam', attack: 1, health: 60, tags: [] },
    32: { number: 32, name: 'Battlecruiser', attack: 32, health: 70, tags: ['×2 CMB'] },
    33: { number: 33, name: 'Reaper', attack: 5, health: 100, tags: ['MIN', 'CARRIER'], split: true },
    34: { number: 34, name: 'Eraser', attack: 2, health: 80, tags: ['×2 CMB', 'SIEGE'], siege: true },
    35: { number: 35, name: 'Flotilla', attack: 1, health: 30, tags: ['×5 INC+5', '×7 AOE'], incomeBoost: 5, missile: true },
    36: { number: 36, name: 'Titan', attack: 4, health: 70, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.72 },
    37: { number: 37, name: 'Rainbow', attack: 1, health: 90, tags: [] },
    38: { number: 38, name: 'Centurion', attack: 2, health: 200, tags: ['ARMOR'] },
    39: { number: 39, name: 'Harvester', attack: 1, health: 50, tags: ['MIN', 'LONG RANGE'], longRange: true, mining: 0.33 },
    40: { number: 40, name: 'Obliterator', attack: 8, health: 90, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    41: { number: 41, name: 'Abacus', attack: 1, health: 20 },
    42: { number: 42, name: 'Refinery', attack: 2, health: 45, tags: ['MIN', '×5 INC+6'], mining: 0.42, incomeBoost: 6 },
    43: { number: 43, name: 'Replicator', attack: 1, health: 50 },
    44: { number: 44, name: 'Sharpshooter', attack: 20, health: 150 },
    45: { number: 45, name: 'Reactor', attack: 1, health: 35 },
    46: { number: 46, name: 'Starfinder', attack: 2, health: 70 },
    47: { number: 47, name: 'Economist', attack: 1, health: 120, tags: [] },
    48: { number: 48, name: 'Megahauler', attack: 16, health: 200, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.24 },
    49: { number: 49, name: 'Exchange', attack: 1, health: 100, tags: ['×5 INC+1'], incomeBoost: 14 },
    50: { number: 50, name: 'Doomsday', attack: 2, health: 80, tags: ['NOVA'], nova: true },
    51: { number: 51, name: 'Engineer', attack: 1, health: 140, tags: ['×2 CMB', 'SIEGE'], siege: true },
    52: { number: 52, name: 'Starbase', attack: 4, health: 120, tags: ['×2 CMB', 'LONG RANGE'], longRange: true },
    53: { number: 53, name: 'Ninja', attack: 53, health: 90 },
    54: { number: 54, name: 'Valhalla', attack: 2, health: 50, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.36 },
    71: { number: 71, name: 'Terminus', attack: BASE_START_HP, health: 1, tags: ['END'], win: true },
};
const SHIP_NUMS = Object.keys(TEMPLATES).map(n => +n).sort((a, b) => a - b);

// ===== Difficulty / handicap =====
// Applied at NEW BATTLE start. Income mult adjusts AI's per-turn income.
// Ore mult adjusts AI's starting ore. HP delta tweaks AI base HP.
// `aiNoise` injects jitter into the AI's deploy scoring — higher = dumber.
const DIFFICULTIES = {
    'daily': { label: 'Weekly Puzzle', incomeMult: 72, oreMult: 1, hpMult: 1, aiNoise: 0.1, aiSkipChance: 0.02, ai: 'daily' },
    'normal': { label: 'Normal', incomeMult: 4, oreMult: 1, hpMult: 1, aiNoise: 0.4, aiSkipChance: 0.08, ai: false },
    'hard': { label: 'Hard', incomeMult: 4, oreMult: 1, oreDelay: 1 / 16, hpMult: 0.85, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    'challenging': { label: 'Hard', incomeMult: 4, oreMult: 1, oreDelay: 2 / 16, hpMult: 0.7, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    'tricky': { label: 'Brutal', incomeMult: 4, oreMult: 1, oreDelay: 3 / 16, hpMult: 0.55, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    'visionary': { label: 'Brutal', incomeMult: 4, oreMult: 1, oreDelay: 4 / 16, hpMult: 0.4, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    'pvp': { label: 'PVP', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: "pvp" },
    'custom': { label: 'Custom', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: "custom" },
};
let difficulty = 'normal';

// ===== State =====
let state, nextShipId, processing, gameOver;
let speedMult = 4;
let socket = null;

var username = "player"
var opponent = "ai"

async function getNextMessage() {
    return new Promise((resolve) => {
        socket.addEventListener('message', (event) => {
            resolve(event.data);
        }, { once: true }); // 'once: true' ensures the listener is removed after one execution
    });
}

function newGame(handicap) {
    // remove any modal
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());

    // read handicap from the header select
    const sel = document.getElementById('handicap-select');
    if (sel) difficulty = sel.value;

    if (handicap !== undefined) {
        handicap = parseInt(handicap, 10);
        difficulty = ["normal", "hard", "challenging", "tricky", "visionary"][handicap];
    }

    const D = DIFFICULTIES[difficulty];

    if (D.ai === "pvp") {

        socket = new WebSocket("wss://render-echo-wvk1.onrender.com");

        opponent = "waiting";

        socket.addEventListener('open', async () => {
            socket.send(username);
            opponent = await getNextMessage();
            render()
        }, { once: true });

    } else {

        opponent = "ai";

    }



    state = {
        turn: 0,
        blue: { hp: BASE_START_HP, damage_mult: 1, regen: 0, income: START_INCOME, money: 0, ore: START_ORE, ore_boost: 1, ships: [], history: [], },
        red: {
            hp: BASE_START_HP,
            damage_mult: D.hpMult ?? 1,
            regen: D.regen,
            income: D.incomeMult,
            money: 0,
            ore: START_ORE,
            ore_boost: D.oreMult,
            ore_delay: D.oreDelay ?? 0,
            ships: [],
            ai: D.ai,
            opening: [],
            history: [],
        },
        log: []
    };
    handicapInput.value = state.red.ore_delay * 16;
    if (D.ai == "daily") { state.red.hp += 130; state.blue.hp += 130; };
    if (D.ai == "custom") {
        p = prompt("Please enter your opponent's build order:", "0,0,7");
        state.red.opening = JSON.parse(`[${p}]`)
    }
    nextShipId = 1;
    processing = false;
    gameOver = false;
    log(`Battle commenced. Handicap: ${D.label}.`, 'heading');
    startNewTurn();
    render();

    if (D.ai == 'defense') {
        state.red.opening = [0, 3, 0, 7, 0, 0, 1, 8, 1, 2, 1, 3, 1, 7, 0, 7, 3, 6, 0, 7, 0, 7, 7, 0, 8, 7, 7, 8, 8, 5, 5, 10, 8, 11, 7, 7, 12, 4, 12, 7, 6, 14, 7, 21, 16, 14, 16];
        const input = document.getElementById("command-line");
        input.value = "2,3,3,3,3,3,0,0,7,0,7,0,7,0,7,5,5,5,7,4,7,3,9,0,9,3,9,9,7,7,7,7,0,21";
    }

}

function startNewTurn() {
    state.turn++;
    // Step 1: Income (collected at the start of each turn before the deploy decision,
    //  so the player can see exactly what's affordable).
    state.blue.money += state.blue.income;
    state.red.money += state.red.income;
    log(`── Turn ${state.turn} ── Income: BLUE +${state.blue.income} · RED +${state.red.income}`, 'heading');
}

function ore_divisor(ore) {
    return ((ore + ORE_BASE) ** ORE_POW - ORE_BASE ** ORE_POW) / ORE_R;
}

function excess_exponent(shipNum) {
    return 0.35 * (1.023 ** shipNum);
}

function cost(shipNum, ore) {
    return Math.pow(shipNum, 1 + (excess_exponent(shipNum) ** 2 / (excess_exponent(shipNum) + ore_divisor(ore))));
}

function log(text, cls = '') {
    state.log.push({ text, cls });
    if (state.log.length > 200) state.log.shift();
    renderLog();
}

function renderLog() {
    const el = document.getElementById('log');
    el.innerHTML = '';
    for (const entry of state.log) {
        const div = document.createElement('div');
        div.className = 'log-entry ' + (entry.cls || '');
        div.textContent = entry.text;
        el.appendChild(div);
    }
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
}

// ===== Priority =====
// Forwardmost first; top of column wins ties.
// Blue forward = higher sector index; Red forward = lower sector index.
function priorityOrder(owner) {
    return state[owner].ships.slice().filter(s => s.health > 0 || s.dying).sort((a, b) => {
        const da = owner === 'blue' ? -a.sector : a.sector;
        const db = owner === 'blue' ? -b.sector : b.sector;
        if (da !== db) return da - db;
        return a.row - b.row;
    });
}

// Assign each ship a row (top-to-bottom order within its column).
// New arrivals to a column have row=999 so they fall to the bottom; we then renumber 0..n.
function recomputeRows() {
    for (const owner of ['blue', 'red']) {
        const bySector = {};
        for (const s of state[owner].ships) (bySector[s.sector] ??= []).push(s);
        for (const sec in bySector) {
            bySector[sec].sort((a, b) => a.row - b.row);
            bySector[sec].forEach((s, i) => { s.row = i; });
        }
    }
}

async function deployShip(owner, num, sector, hp, atk) {
    const tpl = TEMPLATES[num];

    if (num == 53 && state[owner].ships.length) {
        sector = (owner == 'blue' ? Math.max : Math.min)(...state[owner].ships.map((s) => s.sector))
    }

    const ship = {
        id: nextShipId++,
        owner,
        number: num,
        attack: atk !== undefined ? atk : tpl.attack,
        health: hp !== undefined ? hp : tpl.health,
        maxHealth: Math.max(tpl.health, 10),
        sector: sector,
        row: 999,                // pushed to bottom of column
        template: tpl,
        justDeployed: true,
    };
    state[owner].ships.push(ship);
    if (num == 47) ship.attack = state[owner].income;
    if (num > 0 && (num % 7 == 0)) {
        state[owner].income += num / 7;
        state[owner].hp -= 3;
        log(`${owner.toUpperCase()} trades 3 base hp for +${num / 7} income (now ${state[owner].income}).`, owner);
    }
    if (num > 0 && (num % 49 == 0)) {
        state[owner].income += num / 7;
        state[owner].hp -= 3;
        log(`${owner.toUpperCase()} trades 3 base hp for +${num / 7} income (now ${state[owner].income}).`, owner);
    }
    if (tpl.win) {
        let enemyowner = 'red'
        if (owner == 'red') enemyowner = 'blue';
        await executeStrike(ship, enemyowner, null, true, 0);
    }
    recomputeRows();
    log(`${owner.toUpperCase()} deploys #${num} ${tpl.name} into ${SECTORS[sector]}.`, owner);
    if (num == 41) {
        for (let i = 1; i <= 23; i++) { if (calculatePrimeFactors(i).length == 1) await deployShip(owner, i, sector) }
    }
    if (num == 29) {
        for (let i = 1; i <= 10; i++) { await deployShip(owner, i, sector) }
    }
    return ship;
}

// ===== Deploy =====
async function buyShip(owner, num) {
    const sec = owner === 'blue' ? BLUE_DEPLOY_IDX : RED_DEPLOY_IDX;
    const c = cost(num, state[owner].ore);
    if (state[owner].money + max_loan_for(state[owner].income) < c) {
        state[owner].history.push(0);
        return false;
    }
    state[owner].history.push(num);
    state[owner].money -= c;
    if (state[owner].money < 0) state[owner].money *= 5 / 4;
    await deployShip(owner, num, sec);
    sfx.deploy();
    return true;
}

function calcOreIncome(owner) {
    let enemyowner = 'red'
    if (owner == 'red') enemyowner = 'blue';
    let total = 0;
    for (const s of state[owner].ships) {
        let mult = 0;
        if (5 >= s.sector && s.sector >= 3) mult = 1;
        if (s.template.number == 33) mult = 1;
        if (s.template.number % 3 == 0) total += s.template.number / 3 * mult;
        if (s.template.number % 9 == 0) total += s.template.number / 3 * mult;
        if (s.template.number % 27 == 0) total += s.template.number / 3 * mult;
    }
    total *= state[owner].ore_boost;
    x = state[owner].ore_delay;
    if (x !== undefined && state.turn > 16) { total += (state.turn - 14) * x }
    return total;
}

async function load(bingo) {
    for (const ship of bingo) {
        await runTurn(ship);
    }
}

// ===== Turn driver =====
// Player commits the turn by clicking either a ship (1-click deploy) or the
// Skip slot (#0). `playerPick` is the chosen ship number or null for skip.
async function runTurn(playerPick) {
    if (!playerPick) playerPick = 0;

    if (processing || gameOver) return;
    processing = true;
    render();

    let aiPick = state.red.opening[state.turn - 1];

    if (state['red'].ai == "pvp") {

        socket.send(playerPick);

        aiPick = parseInt(await getNextMessage(), 10);
        console.log(aiPick);


    }

    else if (state['red'].ai == "daily") {
        aiPick = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][state.turn - 1]
    }

    else if (state['red'].ai == "skiffopener") {
        aiPick = [1, 3, 3, 3, 3, 3, 0, 0, 7, 0, 7, 0, 7, 0, 7][state.turn - 1]
        if (state.blue.ships.some((s) => { return s.sector == 5; })) aiPick = undefined;
        if (aiPick === undefined) {

            aiPick = pickAIR(true);
            console.log(aiPick);


        }
    }


    else if (state['red'].ai == "runner16") {
        aiPick = [0, 0, 7, 0, 0, 0, 7, 5, 0, 0, 7, 3, 3, 7, 2, 7, 3, 3, 7, 7, 7, 0, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8][state.turn - 1]
    }

    else if (state['red'].ai == "8iq") {
        aiPick = [0, 0, 0, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8][state.turn - 1]
    }

    if (aiPick === undefined) {

        aiPick = pickAIR();
        console.log(aiPick);


    }


    // Step 2: Deploy (simultaneous, costs paid)
    if (playerPick) await buyShip('blue', playerPick);
    else { log('BLUE skips deploy.', 'blue'); sfx.skip(); state.blue.history.push(0); }
    if (aiPick) await buyShip('red', aiPick);
    else { log('RED skips deploy.', 'red'); state.red.history.push(0); }

    render();
    await sleep(200);

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp != state.blue.hp) {
        return finishCleanup(true);
    }

    // Clear "just deployed" flag (used for entrance animation)
    for (const o of ['blue', 'red']) for (const s of state[o].ships) s.justDeployed = false;

    // Step 3: Attack
    log('Attack phase.');
    await runAttacks();

    render();
    await sleep(200);

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp != state.blue.hp) {
        return finishCleanup(true);
    }

    // Step 4: Cleanup
    let removed = false;
    // Death animations are now handled immediately during attacks, so just remove dead ships
    for (const owner of ['blue', 'red']) {
        const before = state[owner].ships.length;
        state[owner].ships = state[owner].ships.filter(s => s.health > 0);
        if (state[owner].ships.length !== before) removed = true;
    }
    if (removed) {
        recomputeRows();
        log('Wreckage cleared.');
        render();
        await sleep(280);
    }

    // Step 5: Advance — ships that did NOT attack move 1 sector forward.
    let advanced = false;
    for (const owner of ['blue', 'red']) {
        state[owner].ships.sort((a, b) => a.row - b.row)
        for (const ship of state[owner].ships) {
            if (!ship.attackedThisTurn) {
                const dir = owner === 'blue' ? +1 : -1;
                const next = ship.sector + dir;
                const prev = ship.sector - dir;
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

    // Mining payout (end of turn)
    for (const owner of ['blue', 'red']) {
        if (state[owner].regen !== undefined && state[owner].hp >= 100) { state[owner].hp += state[owner].regen }
        deployments = [];
        let enemyowner = 'red';
        if (owner == 'red') enemyowner = 'blue';
        for (const s of state[owner].ships) {
            if (s.template.number % 31 == 0) s.attack *= 2;
            if (s.template.number % 23 == 0) { state[owner].income += s.template.number / 23; }
            if (s.template.number % 17 == 0) state[enemyowner].hp -= s.template.number / 17;
            if (s.template.number % 13 == 0) deployments.push([owner, 2 * s.template.number / 13, s.sector]);
            if (s.template.number % 37 == 0) {
                s.attack += 1;
                deployments.push([owner, s.attack, s.sector]);
            }
            if (s.template.number % 43 == 0) {
                s.attack += 1;
                for (let i = 0; i < s.attack; i++) {
                    deployments.push([owner, 2, s.sector]);
                }
            }
        }
        let total = calcOreIncome(owner);
        if (total > 0) {
            state[owner].ore += total;
            log(`${owner.toUpperCase()} mines +${total.toFixed(2)} ore (now ${state[owner].ore.toFixed(2)}).`, owner);
        }
        for (const args of deployments) {
            await deployShip(...args);
        }
    }
    recomputeRows();

    if ((state.blue.hp <= 0 || state.red.hp <= 0) && state.red.hp != state.blue.hp) {
        return finishCleanup(true);
    }

    // Begin next turn (income for next turn happens here)
    startNewTurn();
    processing = false;
    render();
}

async function finishCleanup() {
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

async function fireMissile(ship, enemyOwner, sector) {
    animateAttacker(ship);
    const dmg = ship.template.number / 5;

    const bSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;

    const tSec = sector;

    const baseEl = document.querySelector(`.base.${enemyOwner}`);
    const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);

    const hits = state[enemyOwner].ships.filter(e => e.sector === tSec && e.health > 0 && !e.dying);
    hits.forEach((h, idx) => {
        const hEl = document.querySelector(`[data-ship-id="${h.id}"]`);
        const d = idx * 90;
        shootLaser(attackerEl, hEl, ship.owner, {
            aoe: true,
            delay: d
        });
        showDamageNumber(hEl, dmg, ship.owner, {
            aoe: true,
            delay: d + 220
        });
        h.health -= Math.max(dmg - (h.number % 19 == 0 ? h.number / 19 : 0), 0);
        h.flashDamage = true;
        if (h.health <= 0 && !h.dying) {
            h.dying = true;
            state.newlyKilled.push(h);
        }
    });
    sfx.missile();

    if (tSec == bSec) {
        shootLaser(attackerEl, baseEl, ship.owner, {
            large: true
        });
        flashBase(enemyOwner);
        sfx.baseHit();
        state[enemyOwner].hp -= dmg * state[enemyOwner].damage_mult;
        showDamageNumber(baseEl, dmg, ship.owner, {
            large: true,
            delay: 220
        });
    }

    log(`#${ship.number} [${ship.owner.toUpperCase()}] missile-strikes ${SECTORS[tSec]} — ${hits.length} hit for ${dmg} each.`, ship.owner);
    render();
    hits.forEach(h => {
        h.flashDamage = false;
    });

    await sleep(520);
}

async function executeStrike(ship, enemyOwner, atkTarget, atkBaseTarget, remainingDmg) {
    const dmg = remainingDmg || ship.attack;
    state.newlyKilled = [];

    if (atkBaseTarget) {
        animateAttacker(ship);
        const baseEl = document.querySelector(`.base.${enemyOwner}`);
        const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);
        shootLaser(attackerEl, baseEl, ship.owner, {
            large: true
        });
        flashBase(enemyOwner);
        sfx.baseHit();
        state[enemyOwner].hp -= dmg * state[enemyOwner].damage_mult;
        showDamageNumber(baseEl, dmg, ship.owner, {
            large: true,
            delay: 220
        });
        log(`#${ship.number} [${ship.owner.toUpperCase()}] strikes ${enemyOwner.toUpperCase()} base for ${dmg} (→ ${state[enemyOwner].hp} HP).`, ship.owner);
        render();
        await sleep(560);
        return {
            leftover: 0
        };
    } else {
        if (!atkTarget || atkTarget.health <= 0 || atkTarget.dying) {
            return {
                leftover: dmg
            };
        }
        animateAttacker(ship);
        const attackerEl = document.querySelector(`[data-ship-id="${ship.id}"]`);
        {
            const targetEl = document.querySelector(`[data-ship-id="${atkTarget.id}"]`);
            shootLaser(attackerEl, targetEl, ship.owner);
            showDamageNumber(targetEl, dmg, ship.owner, {
                delay: 220
            });
            atkTarget.health -= Math.max(dmg - (atkTarget.number % 19 == 0 ? atkTarget.number / 19 : 0), 0)
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
            return {
                leftover
            };
        }
        return {
            leftover: 0
        };
    }
}

async function runAttacks() {
    function getRange(ship) {
        return (ship.template.number % 11 == 0) ? 3 : ATTACK_RANGE;
    }

    function findTarget(ship, enemyOwner) {
        const range = getRange(ship);
        const enemyShips = state[enemyOwner].ships.filter(s => s.health > 0 && !s.dying);
        const baseSec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;

        const sortBy = (arr, keyFn) => {
            const compareKeys = (a, b) => {
                for (let i = 0; i < a.length; i++) {
                    if (a[i] < b[i]) return -1;
                    if (a[i] > b[i]) return 1;
                }
                return 0;
            };

            return arr
                .map(item => ({ item, key: keyFn(item) }))
                .sort((a, b) => compareKeys(a.key, b.key))
                .map(wrapped => wrapped.item);
        };

        const targetCount = {};
        for (const s of enemyShips) {
            targetCount[s.sector] = (targetCount[s.sector] || 0) + 1;
        }
        targetCount[baseSec] += 1;

        const prioritized = sortBy(enemyShips.slice(), s => [ship.number % 5 === 0 ? -targetCount[s.sector] : 0, enemyOwner === 'blue' ? -s.sector : s.sector, s.row])

        for (const e of prioritized) {
            if (Math.abs(e.sector - ship.sector) <= range) {
                if (e.sector == baseSec) return { target: null, baseTarget: true };
                return { target: e, baseTarget: false };
            }
        }
        if (Math.abs(baseSec - ship.sector) <= range && state[enemyOwner].hp > 0) {
            return { target: null, baseTarget: true };
        }
        return { target: null, baseTarget: false };
    }

    function buildAttacksForOwner(owner) {
        const q = priorityOrder(owner);
        const attacks = [];
        for (const ship of q) {
            const enemyOwner = owner === 'blue' ? 'red' : 'blue';
            const strikes = ship.template.doubleStrike ? 2 : 1;
            for (let s = 0; s < strikes; s++) {
                const { target, baseTarget } = findTarget(ship, enemyOwner);
                if (!target && !baseTarget) continue;
                attacks.push({ ship, target, baseTarget, enemyOwner, strikeIndex: s, totalStrikes: strikes });
            }
        }
        return attacks;
    }


    async function processAttacks(attacks) {
        for (const atk of attacks) {
            const ship = atk.ship;
            const enemyOwner = atk.enemyOwner;

            let { target, baseTarget } = findTarget(ship, enemyOwner);
            if (!target && !baseTarget) {
                continue;
            }

            ship.attackedThisTurn = true;

            scrollShipIntoView(ship.id);
            if (target) scrollShipIntoView(target.id);
            await sleep(220);

            let tsec = target?.sector;
            if (baseTarget) tsec = ship.owner === 'blue' ? RED_BASE_IDX : BLUE_BASE_IDX;
            const result = await executeStrike(ship, enemyOwner, target, baseTarget, 0);
            if (ship.template.number % 5 == 0) fireMissile(ship, enemyOwner, tsec);
            if (ship.template.number % 25 == 0) fireMissile(ship, enemyOwner, tsec);

            if (ship.template.trample && result.leftover > 0) {
                let overflow = result.leftover;
                let trampleHits = 0;
                while (overflow > 0) {
                    const { target: nextTarget, baseTarget: nextBase } = findTarget(ship, enemyOwner);
                    if (!nextTarget && !nextBase) break;
                    const trampleResult = await executeStrike(ship, enemyOwner, nextTarget, nextBase, overflow);
                    overflow = trampleResult.leftover;
                    trampleHits++;
                    if (trampleHits > 10) break;
                }
                if (trampleHits > 0) {
                    log(`#${ship.number} TRAMPLE overflow resolved (${trampleHits} extra hit(s)).`, ship.owner);
                }
            }
        }
    }

    state.newlyKilled = [];

    // All blue attacks first, then all red attacks
    const blueAttacks = buildAttacksForOwner('blue');
    const redAttacks = buildAttacksForOwner('red');

    await processAttacks(blueAttacks);
    await processAttacks(redAttacks);

    for (const s of state.newlyKilled) s.dying = false;
    for (const o of ['blue', 'red']) for (const s of state[o].ships) { s.exhausted = false; s.flashDamage = false; }
}

// Ships are absolutely positioned in #ships-layer with overflow:visible,
// so there's nothing to scroll — this is a no-op.
function scrollShipIntoView(shipId) { }

function animateAttacker(ship) {
    ship._attackPulse = true;
    ship.exhausted = true;
    timeout(() => { ship._attackPulse = false; }, 450);
}
function flashBase(owner) {
    const el = document.querySelector(`.base.${owner}`);
    if (el) {
        el.classList.add('damaged');
        timeout(() => el.classList.remove('damaged'), 400);
    }
}

// ===== Combat FX =====
// Lasers fire as DOM elements over the battlefield so they survive the
// .innerHTML wipe that render() does (the #fx-layer is preserved).
// Each laser is strongly directional: bright tip at the TARGET end, fading
// tail toward the attacker, with an impact flash that pops at the target.
function shootLaser(fromEl, toEl, owner, opts = {}) {
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
        laser.className = 'fx-laser ' + owner + (opts.preview ? ' preview' : '') + (opts.aoe ? ' aoe' : '');
        laser.style.left = x1 + 'px';
        laser.style.top = y1 + 'px';
        laser.style.width = len + 'px';
        laser.style.transform = `rotate(${angle}deg)`;
        layer.appendChild(laser);
        timeout(() => laser.remove(), 600);
        // Impact pops once the bolt has reached the target end (skip for preview)
        if (!opts.preview) {
            timeout(() => impactFlash(x2, y2, owner, opts.large), 220);
        }
    };
    if (delay > 0) setTimeout(fire, delay);
    else fire();
}

function impactFlash(x, y, owner, large = false) {
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const d = document.createElement('div');
    d.className = 'fx-impact ' + owner + (large ? ' large' : '');
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    layer.appendChild(d);
    timeout(() => d.remove(), 480);
}

function showDamageNumber(el, dmg, owner, opts = {}) {
    if (!el) return;
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const oRect = layer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - oRect.left;
    const y = r.top - oRect.top + 4;
    const delay = opts.delay || 0;
    const shipId = el.dataset.shipId;
    const isBase = el.classList.contains('base');
    const baseOwner = isBase ? (el.classList.contains('blue') ? 'blue' : 'red') : null;
    const fire = () => {
        const currentLayer = document.getElementById('fx-layer');
        if (!currentLayer) return;
        let currentEl = null;
        if (isBase) {
            currentEl = document.querySelector(`.base.${baseOwner}`);
        } else if (shipId) {
            currentEl = document.querySelector(`[data-ship-id="${shipId}"]`);
        }
        if (!currentEl || !document.body.contains(currentEl)) return;
        const currentORect = currentLayer.getBoundingClientRect();
        const currentR = currentEl.getBoundingClientRect();
        const currentX = currentR.left + currentR.width / 2 - currentORect.left;
        const currentY = currentR.top - currentORect.top + 4;
        const div = document.createElement('div');
        div.className = 'fx-damage' + (opts.aoe ? ' aoe' : '');
        div.style.left = currentX + 'px';
        div.style.top = currentY + 'px';
        div.style.color = owner === 'blue' ? 'var(--laser-blue)' : 'var(--laser-red)';
        if (opts.large) div.style.fontSize = '22px';
        div.textContent = '−' + dmg;
        currentLayer.appendChild(div);
        timeout(() => { if (div.parentNode) div.remove(); }, 1000);
    };
    if (delay > 0) setTimeout(fire, delay);
    else fire();
}

// ===== AI =====
function getWeightedRandom(items, weights) {
    // 1. Calculate the total sum of all weights
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    // 2. Generate a random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // 3. Iterate through weights and subtract from the random number
    for (let i = 0; i < weights.length; i++) {
        if (random < weights[i]) {
            return items[i];
        }
        random -= weights[i];
    }
}

function getHighestWeightItem(items, weights) {
    if (items.length === 0 || weights.length === 0) return undefined;

    let maxIndex = 0;
    let maxWeight = weights[0];

    for (let i = 1; i < weights.length; i++) {
        // Using strictly greater than (>) ensures that in the event of a tie, 
        // the first item encountered with the maximum weight is kept (deterministic).
        if (weights[i] > maxWeight) {
            maxWeight = weights[i];
            maxIndex = i;
        }
    }

    return items[maxIndex];
}

function pickAIR(det = false) {
    red = state.red;
    const affordable = SHIP_NUMS.filter(n => cost(n, red.ore) <= red.money + MAX_LOAN);
    affordable.push(0);
    let items = [];
    let weights = [];
    for (const num of affordable) {
        items.push(num);
        w = 5;
        if (num > 3) w = cost(num, 0);
        if (num % 3 == 0) w *= 2;
        if (num % 3 == 0 && state.blue.ships.some((s) => { return s.sector == 5; })) w *= 0;
        if (num % 7 == 0 && num !== 0) w *= (state.red.hp - 20) / Math.min(state.red.income, 10);
        if (num % 7 == 0 && state.blue.ships.some((s) => { return s.sector == 5; })) w *= 0;
        if (items.includes(7) && num == 0) w *= 0;
        if (num % 17 == 0 && num !== 0) w *= (40 * (num / 17) / state.blue.hp) ** 4;
        if (num % 17 == 0 && state.blue.ships.some((s) => { return s.sector == 5; })) w *= 0;
        if (num % 5 == 0 && num > 0) w *= state.blue.ships.length ** 3 / 300;
        if ((num % 3 !== 0) && (num % 7 !== 0) && state.red.ships.some((s) => { return s.sector == 3; })) {
            w = 0;
        }
        if (num >= 67) w *= 1000000;
        let loan = cost(num, red.ore) - red.money;
        if (loan < 0) loan = 0;
        w -= 2 * loan;
        if (w < 0) w = 0;
        weights.push(w);
    }
    console.log(weights);
    if (det) { return getHighestWeightItem(items, weights) }
    return getWeightedRandom(items, weights);
}

// ===== Game over =====
function endGame() {
    gameOver = true;
    processing = false;
    let winner;
    if (state.red.hp > state.blue.hp) winner = 'RED';
    else winner = 'BLUE';
    log(`${winner === 'DRAW' ? 'Mutual annihilation' : winner + ' wins'} on turn ${state.turn}.`, 'heading');
    if (winner === 'BLUE') sfx.win();
    else if (winner === 'RED') sfx.lose();
    else sfx.death();
    render();
    // showModal(winner);
}

function showModal(winner) {
    const color = winner === 'BLUE' ? 'var(--blue)' : winner === 'RED' ? 'var(--red)' : 'var(--fg)';
    const div = document.createElement('div');
    div.className = 'modal-backdrop';
    div.innerHTML = `
        <div class="modal">
          <h2 style="color:${color}">${winner}${winner === 'DRAW' ? '' : ' wins'}</h2>
          <div class="sub">Turn ${state.turn} · BLUE ${state.blue.hp} · RED ${0, state.red.hp}</div>
          <button class="action-btn primary" id="new-battle-btn">↻ New Battle</button>
        </div>`;
    document.body.appendChild(div);
    document.getElementById('new-battle-btn').onclick = newGame;
}

const sleep = ms => new Promise(r => setTimeout(r, ms / speedMult));
const timeout = (fn, ms) => setTimeout(fn, ms / speedMult);

// ===== Icons (sword for attack, heart for HP) =====
const SWORD_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.4 1.1 L7 4.5 L8.2 5.7 L11.5 2.3 L11.5 0.5 Z M6.4 5.1 L1.4 10.1 L1.4 11.5 L2.8 11.5 L7.8 6.5 Z M5.5 7.2 L4.8 7.9 L4.1 7.2 L4.8 6.5 Z"/></svg>`;
const BOW_SVG = '🏹'
const ROCKET_SVG = '🚀'
const HEART_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 11 C6 11 1 7.5 1 4.3 C1 2.7 2.2 1.5 3.7 1.5 C4.7 1.5 5.5 2 6 2.8 C6.5 2 7.3 1.5 8.3 1.5 C9.8 1.5 11 2.7 11 4.3 C11 7.5 6 11 6 11 Z"/></svg>`;
const TARGET_MARK_SVG = `<svg class="target-mark" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="0" x2="7" y2="2.8" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="11.2" x2="7" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="0" y1="7" x2="2.8" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="11.2" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.2"/></svg>`;

// ===== Audio (Web Audio synth, off by default) =====
const SOUND_KEY = 'shipbattle.sound';
let soundOn = false;
try { soundOn = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { }
let audioCtx = null;
function getAudio() {
    if (audioCtx) return audioCtx;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    return audioCtx;
}
function setSound(on) {
    soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { }
    if (soundOn) {
        const ctx = getAudio();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        // tiny confirmation tick
        playTone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.12 });
        playTone({ freq: 1320, dur: 0.07, type: 'triangle', vol: 0.1, delay: 0.06 });
    }
}
function playTone({ freq = 440, dur = 0.1, type = 'sine', vol = 0.12, sweep = null, delay = 0 }) {
    if (!soundOn) return;
    const ctx = getAudio(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function playNoise({ dur = 0.15, vol = 0.18, filterFreq = 2000, sweep = null, delay = 0 }) {
    if (!soundOn) return;
    const ctx = getAudio(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
}
const sfx = {
    deploy: () => { playTone({ freq: 520, dur: 0.06, type: 'square', vol: 0.12 }); playTone({ freq: 780, dur: 0.08, type: 'square', vol: 0.10, delay: 0.04 }); playTone({ freq: 1040, dur: 0.10, type: 'sine', vol: 0.08, delay: 0.08 }); },
    skip: () => { playTone({ freq: 320, dur: 0.12, type: 'triangle', vol: 0.10, sweep: 180 }); playTone({ freq: 240, dur: 0.10, type: 'sine', vol: 0.06, sweep: 120, delay: 0.06 }); },
    attack: () => { playTone({ freq: 1200, dur: 0.05, type: 'sawtooth', vol: 0.12, sweep: 2200 }); playNoise({ dur: 0.04, vol: 0.08, filterFreq: 3000, delay: 0.01 }); },
    hit: () => { playNoise({ dur: 0.12, vol: 0.20, filterFreq: 2200, sweep: 400 }); playTone({ freq: 180, dur: 0.08, type: 'sine', vol: 0.10, sweep: 80, delay: 0.02 }); },
    missile: () => { playTone({ freq: 160, dur: 0.12, type: 'sawtooth', vol: 0.12, sweep: 60 }); playTone({ freq: 240, dur: 0.08, type: 'square', vol: 0.08, sweep: 100, delay: 0.04 }); playNoise({ dur: 0.28, vol: 0.22, filterFreq: 1400, sweep: 150, delay: 0.06 }); },
    baseHit: () => { playNoise({ dur: 0.50, vol: 0.28, filterFreq: 1100, sweep: 60 }); playTone({ freq: 120, dur: 0.40, type: 'sine', vol: 0.18, sweep: 40 }); playTone({ freq: 80, dur: 0.35, type: 'sawtooth', vol: 0.10, sweep: 30, delay: 0.08 }); },
    death: () => { playNoise({ dur: 0.45, vol: 0.24, filterFreq: 1600, sweep: 150 }); playTone({ freq: 440, dur: 0.30, type: 'sawtooth', vol: 0.12, sweep: 60 }); playTone({ freq: 280, dur: 0.25, type: 'sine', vol: 0.08, sweep: 40, delay: 0.12 }); },
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => playTone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.16, delay: i * 0.10 })); playTone({ freq: 1568, dur: 0.40, type: 'sine', vol: 0.12, delay: 0.52 }); },
    lose: () => { [440, 370, 311, 261, 220].forEach((f, i) => playTone({ freq: f, dur: 0.26, type: 'sawtooth', vol: 0.14, delay: i * 0.13 })); playNoise({ dur: 0.50, vol: 0.12, filterFreq: 600, sweep: 100, delay: 0.55 }); },
};

// ===== Ship positioning =====
const SECTOR_LABEL_H = 26;
const BASE_H = 78;
const SHIP_CARD_H = 30;
const SHIP_CARD_H_COMPACT = 26;
const SHIP_GAP = 4;

function getShipPosition(ship, allShips) {
    const sectorIdx = ship.sector;
    const leftPct = (sectorIdx - 1) / 7 * 100;
    let top = SECTOR_LABEL_H;
    if (sectorIdx === BLUE_BASE_IDX || sectorIdx === RED_BASE_IDX) top += BASE_H;
    const inSector = allShips.filter(s => s.sector === sectorIdx).sort((a, b) => {
        if (a.owner !== b.owner) return a.owner === 'blue' ? -1 : 1;
        return a.row - b.row;
    });
    const l = inSector.length;
    const compact = inSector.length >= 1984;
    const h = compact ? SHIP_CARD_H_COMPACT : SHIP_CARD_H;
    const idx = inSector.indexOf(ship);
    let modified_ships = 7;
    if (l > 7) {
        modified_ships = 7 * Math.pow(l / 7, 0.5);
    }
    top += idx * (240 / modified_ships);
    return { leftPct, top, compact };
}

// DOM reconciliation map
const shipElements = new Map();

// ===== Rendering =====
function render() {
    nameInput.value = `${state.blue.history}`;
    emailInput.value = `${state.red.history}`;
    hideTip();
    renderStats();
    renderBattlefield();
    renderDeployBar();
    const ti = document.getElementById('turn-info');
    ti.innerHTML = processing
        ? `Turn ${state.turn} · <span class="resolving">RESOLVING…</span>`
        : gameOver
            ? `Turn ${state.turn} · ENDED`
            : `Turn ${state.turn} · DEPLOY`;
}

function renderStats() {
    document.getElementById('blue-money').textContent = `${state.blue.money.toFixed(2)} (+${state.blue.income})`;
    document.getElementById('blue-ore').textContent = `${state.blue.ore} (+${calcOreIncome('blue')})`;

    document.getElementById('red-money').textContent = `${state.red.money.toFixed(2)} (+${state.red.income})`;
    document.getElementById('red-ore').textContent = `${state.red.ore} (+${calcOreIncome('red')})`;
    document.getElementById('red-command').textContent = opponent;
}

function renderBattlefield() {
    const el = document.getElementById('battlefield');

    // First render: build sector grid, ships layer, fx layer
    if (!document.getElementById('ships-layer')) {
        el.innerHTML = '';
        for (let i = 1; i < 8; i++) {
            const sec = document.createElement('div');
            sec.className = 'sector';
            sec.dataset.sectorIdx = i;
            if (i < 4) sec.classList.add('blue-side');
            else if (i > 4) sec.classList.add('red-side');
            if (i === BLUE_DEPLOY_IDX) sec.classList.add('deploy-blue');
            if (i === RED_DEPLOY_IDX) sec.classList.add('deploy-red');
            const label = document.createElement('div');
            label.className = 'sector-label';
            let tag = '';
            if (i === BLUE_DEPLOY_IDX) tag = '⌃ BLUE DEPLOY';
            if (i === RED_DEPLOY_IDX) tag = 'RED DEPLOY ⌃';
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

    // Update bases
    const blueBaseElH = el.querySelector('.base.blue .base-hp');
    const redBaseElH = el.querySelector('.base.red .base-hp');
    if (blueBaseElH) blueBaseElH.textContent = state.blue.hp;
    if (redBaseElH) redBaseElH.textContent = state.red.hp;
    const blueBaseEl = el.querySelector('.base.blue');
    const redBaseEl = el.querySelector('.base.red');
    if (blueBaseEl) blueBaseEl.replaceWith(renderBase('blue'));
    if (redBaseEl) redBaseEl.replaceWith(renderBase('red'));

    // Reconcile ships
    const shipsLayer = document.getElementById('ships-layer');
    const allShips = [...state.blue.ships, ...state.red.ships];

    // Targeting indicator: show on the forwardmost ship of each side that is within range of enemy fire.
    function findPrimaryTarget(defendingOwner) {
        const attackingOwner = defendingOwner === 'blue' ? 'red' : 'blue';
        const attackers = state[attackingOwner].ships.filter(s => s.health > 0 && !s.dying);
        if (attackers.length === 0) return null;
        const defenders = state[defendingOwner].ships.filter(s => s.health > 0 && !s.dying);
        const targeted = defenders.filter(d =>
            attackers.some(a => Math.abs(d.sector - a.sector) <= (a.template.longRange ? 3 : ATTACK_RANGE))
        );
        if (targeted.length === 0) return null;
        targeted.sort((a, b) => {
            const da = defendingOwner === 'blue' ? -a.sector : a.sector;
            const db = defendingOwner === 'blue' ? -b.sector : b.sector;
            if (da !== db) return da - db;
            return a.row - b.row;
        });
        return targeted[0];
    }

    const blueTargeted = findPrimaryTarget('blue');
    const redTargeted = findPrimaryTarget('red');
    const activeIds = new Set(allShips.map(s => s.id));

    // Remove elements for ships that no longer exist (already cleaned up)
    for (const [id, el] of shipElements) {
        if (!activeIds.has(id)) {
            el.remove();
            shipElements.delete(id);
        }
    }

    // Update or create ship elements
    for (const ship of allShips) {
        const pos = getShipPosition(ship, allShips);
        let div = shipElements.get(ship.id);

        if (!div) {
            // Create new ship element
            div = createShipElement(ship, pos.compact, ship === blueTargeted || ship === redTargeted);
            div.style.left = `calc(${pos.leftPct}% + 4px)`;
            div.style.top = pos.top + 'px';
            div.style.zIndex = -ship.row;
            if (ship.justDeployed) div.classList.add('appearing');
            shipsLayer.appendChild(div);
            shipElements.set(ship.id, div);
        } else {
            // Update existing element position (CSS transition handles animation)
            div.style.left = `calc(${pos.leftPct}% + 4px)`;
            div.style.top = pos.top + 'px';
            div.style.zIndex = -ship.row;
            // Update classes
            updateShipElement(div, ship, pos.compact, ship === blueTargeted || ship === redTargeted);
        }
    }

    // Adjust battlefield min-height based on tallest stack
    let maxBottom = 300;
    for (const ship of allShips) {
        const pos = getShipPosition(ship, allShips);
        const bottom = pos.top + (pos.compact ? SHIP_CARD_H_COMPACT : SHIP_CARD_H) + 12;
        if (bottom > maxBottom) maxBottom = bottom;
    }
    el.style.minHeight = maxBottom + 'px';
}

function createShipElement(ship, compact, targeted) {
    targeted = false;
    const div = document.createElement('div');
    div.dataset.shipId = ship.id;
    applyShipClasses(div, ship, compact, targeted);
    applyShipContent(div, ship, compact, targeted);
    return div;
}

function to_pct(n) {
    if (n <= 0) return '0%';
    if (n >= 1) return '100%';
    return `${100 * n}%`;
}

function updateShipElement(div, ship, compact, targeted) {
    // Don't disturb dying elements
    if (div.classList.contains('dying')) return;
    targeted = false;
    applyShipClasses(div, ship, compact, targeted);
    // Update ATK display
    const atkEl = div.querySelector('.atk');
    atkEl.innerHTML = `${ship.number % 5 ? (ship.number % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${ship.attack}`

    // Update HP display
    const hpEl = div.querySelector('.hp');
    if (hpEl) {
        const dead = ship.health <= 0;
        const lowHp = ship.health <= ship.maxHealth * 0.35;
        hpEl.className = 'hp ' + (dead ? 'dead' : (lowHp ? 'low' : ''));
        hpEl.innerHTML = `${HEART_SVG}${ship.health}`;
    }
    // Update health bar
    let hpBarFill = div.querySelector('.hp-bar-fill-1');
    if (hpBarFill) {
        hpBarFill.style.width = to_pct((ship.health - 0) / 8);
    }
    hpBarFill = div.querySelector('.hp-bar-fill-2');
    if (hpBarFill) {
        hpBarFill.style.width = to_pct((ship.health - 8) / 24);
    }
    hpBarFill = div.querySelector('.hp-bar-fill-3');
    if (hpBarFill) {
        hpBarFill.style.width = to_pct((ship.health - 32) / 72);
    }
    hpBarFill = div.querySelector('.hp-bar-fill-4');
    if (hpBarFill) {
        hpBarFill.style.width = to_pct((ship.health - 104) / 216);
    }
}

function applyShipClasses(div, ship, compact, targeted) {
    let cls = 'ship ' + ship.owner;
    if (compact) cls += ' compact';
    if (ship._attackPulse) cls += ' attacking';
    if (ship.flashDamage) cls += ' damaged';
    if (ship.dying) cls += ' dying';
    if (ship.exhausted) cls += ' exhausted';
    if (ship.justDeployed) cls += ' appearing';
    const dead = ship.health <= 0;
    if (dead) cls += ' dead';
    if (targeted && !dead) cls += ' targeted';
    div.className = cls;
}

function applyShipContent(div, ship, compact, targeted) {
    const dead = ship.health <= 0;
    const lowHp = ship.health <= ship.maxHealth * 0.35;
    const allTags = ship.template.tags || [];
    const visibleTags = allTags.filter(isWhileAliveTag);
    const stripHTML = compact
        ? `<span class="ship-strip" aria-hidden="true" style="background:${shipStripGradient(ship.number)}"></span>`
        : '';
    const targetMark = (targeted && (!dead || ship.dying)) ? TARGET_MARK_SVG : '';
    div.innerHTML = `
        ${stripHTML}
        <div class="ship-inner">
          <div style="display: flex; gap:5px;">
              <div><span class="ship-num" data-tip-text="${listAbilities(ship.number)}" style="background:${shipNumBg(ship.number)};">${ship.number}</span></div>
              <div style="position:relative;flex:1">
			      <div class="ship-stats">
				    <span class="atk">${ship.number % 5 ? (ship.number % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${ship.attack}</span>
				    <span class="hp ${dead ? 'dead' : (lowHp ? 'low' : '')}">${HEART_SVG}${ship.health}</span>
				    <span class="ship-name" data-tip="shipname">${ship.template.name}</span>
			      </div>
              </div>
          </div>
        </div>
      `;
    updateShipElement(div, ship, compact, targeted);
}

function renderShip(ship, compact = false, targeted = false) {
    const div = document.createElement('div');
    let cls = 'ship ' + ship.owner;
    if (compact) cls += ' compact';
    if (ship._attackPulse) cls += ' attacking';
    if (ship.flashDamage) cls += ' damaged';
    if (ship.dying) cls += ' dying';
    if (ship.exhausted) cls += ' exhausted';
    if (ship.justDeployed) cls += ' appearing';
    const dead = ship.health <= 0;
    if (dead) cls += ' dead';
    if (targeted && !dead) cls += ' targeted';
    div.className = cls;
    div.dataset.shipId = ship.id;
    const lowHp = ship.health <= ship.maxHealth * 0.35;
    const allTags = ship.template.tags || [];
    // Filter to while-alive tags on BOTH compact and full cards — cosmetic
    // descriptors (CHEAP, ×2 CMB, ×5 INC, TANK, etc.) only appear in the deploy bar.
    const visibleTags = allTags.filter(isWhileAliveTag);
    const stripHTML = compact
        ? `<span class="ship-strip" aria-hidden="true" style="background:${shipStripGradient(ship.number)}"></span>`
        : '';
    const targetMark = (targeted && (!dead || ship.dying)) ? TARGET_MARK_SVG : '';
    div.innerHTML = `
        ${stripHTML}
        <div class="ship-inner">
          ${targetMark}
          <div class="head">
            <span class="ship-num" data-tip="shipnum" style="background:${shipNumBg(ship.number)};">${ship.number}</span>
            <span class="ship-name" data-tip="shipname">${ship.template.name}</span>
          </div>
          <div class="ship-stats">
            <span class="atk">${ship.number % 5 ? (ship.number % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${ship.attack}</span>
            <span class="hp ${dead ? 'dead' : (lowHp ? 'low' : '')}">${HEART_SVG}${ship.health}</span>
          </div>
          <div class="ship-tags">
            ${visibleTags.map(t => `<span class="tag ${tagFactorClass(t)}" data-tip-text="${escapeAttr(tagTip(t))}">${stripTagPrefix(t)}</span>`).join('')}
          </div>
        </div>
      `;
    return div;
}

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderBase(owner) {
    console.log("rendering base");
    const div = document.createElement('div');
    div.className = `base ${owner}`;
    div.dataset.tip = 'base';
    div.innerHTML = `
        <div class="base-hp">${parseFloat(state[owner].hp.toFixed(3))}</div>
    `;
    const myDiv = document.createElement('div');
    myDiv.className = "row1";
    div.appendChild(myDiv);

    for (const n of state[owner].history) {
        console.log(`${myDiv.innerHTML}`);
        console.log("adding n to html");
        myDiv.insertAdjacentHTML('beforeend', `<span class="num" style="background:${shipNumBg(n)};" data-tip-text="${listAbilities(n)}" data-html="true">${n}</span>`);
    };

    return div;
}

function listAbilities(n) {
    if (n < 2) {
        return "No prime factors - No abilities.";
    }
    factors = calculatePrimeFactors(n);
    let lines = [];
    lines.push(`Prime factors: ${factors.join(' &times; ')}`);
    for (const factor of factors) {
        switch (factor) {
            case 2: lines.push('2: I have 2x attack.'); break;
            case 3: lines.push(`3: End of Turn: +${n / 3} ore if this ship is in the center 3 sectors.`); break;
            case 5: lines.push(`5: After I attack: fire a ${n / 5} damage missile that hits every enemy in target sector. Fires at the sector with the most enemies.`); break;
            case 7: lines.push(`7: Deploy: Trade 3 base hp for ${n / 7} income.`); break;
            case 11: lines.push('11: I have +1 range and x5 attack.'); break;
            case 13: lines.push(`13: End of turn: Deploy ship #${2 * n / 13} in my sector.`); break;
            case 17: lines.push(`17: End of turn: Enemy base loses ${n / 17} hp.`); break;
            case 19: lines.push(`19: I take ${n / 19} less damage from all sources.`); break;
            case 23: lines.push(`23: End of turn: Gain ${n / 23} income.`); break;
            case 29: lines.push(`29: Deploy: Deploy ships up to #10 in my sector.`); break;
            case 31: lines.push(`31: End of turn: Modify me with x2 attack.`); break;
            case 37: lines.push("37: End of turn: Modify me with +1 attack, then deploy ship #(my attack) in my sector."); break;
            case 41: lines.push("41: Deploy: Deploy prime ships up to #23 in my sector."); break;
            case 43: lines.push("43: End of turn: Modify me with +1 attack, then deploy that many corvettes into my sector."); break;
            case 47: lines.push("47: Deploy: Set my attack equal to your income."); break;
            case 53: lines.push("53: Deploy: I join the furthest advanced ship. (I also have more attack.)"); break;
            case 71: lines.push('71: Deploy: I attack the enemy base. (I have enough attack to one-shot it unless there is a handicap.)'); break;
        }
    }
    if (n % 33 == 0) lines.push('3 &times; 11: I mine anywhere.');
    return lines.join('<br>');
}

function calculatePrimeFactors(n) {
    if (isNaN(n) || n < 2) {
        return "No prime factors - No abilities.";
    }

    let factors = [];
    let divisor = 2;

    // Loop to divide by prime factors
    while (divisor <= n) {
        if (n % divisor === 0) {
            factors.push(divisor);
            n = n / divisor;
        } else {
            divisor++;
        }
    }
    return factors;
}



function renderDeployBar() {
    const el = document.getElementById('deploy-bar');
    el.innerHTML = '';

    // Slot #0: Skip (ends turn without deploy)
    const skipDisabled = processing || gameOver;
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'ship-btn skip-btn' + (skipDisabled ? ' disabled' : '');
    skip.dataset.tip = 'free';
    skip.innerHTML = `
        <div class="stats">
          <span class="num">0</span>
        </div>
          <div class="row1">
          <span class="name">Skip</span>
    </div>
		    <span class="overlay-text-right">FREE</span>
      `;
    skip.onclick = () => { if (!skipDisabled) runTurn(null); };
    el.appendChild(skip);

    const cb = document.getElementById('tag-toggle');
    scrub_mode = !cb.checked;

    // Slots 1…N
    for (const n of SHIP_NUMS) {
        if (scrub_mode && n > 4 + state.turn) { continue }
        const t = TEMPLATES[n];
        const c = cost(n, state.blue.ore);
        const q = Math.max(calcOreIncome('blue'), 1)
        const d = cost(n, state.blue.ore) - cost(n, state.blue.ore + q);

        // Discount baseline: cost at the starting ore level (ore = START_ORE).
        // Mining ore drops the price below baseline; running out of miners can push it above.
        const baseC = cost(n, START_ORE);
        const pct = (baseC - c) / baseC * 100;
        let tagHTML = '';
        if (pct >= 1.0) {
            tagHTML = `<span class="discount-tag" data-tip-text="${escapeAttr('Ore discount: ' + pct.toFixed(0) + '% off baseline cost of ' + baseC.toFixed(2) + '. Mining more ore drops prices further.')}">−${pct.toFixed(0)}%</span>`;
        } else if (pct <= -1.0) {
            tagHTML = `<span class="discount-tag premium" data-tip-text="${escapeAttr('Surcharge: ' + Math.abs(pct).toFixed(0) + '% over baseline (low ore). Deploy a Miner to bring prices down.')}">+${Math.abs(pct).toFixed(0)}%</span>`;
        }
        const affordable = state.blue.money + max_loan_for(state.blue.income) >= c;
        const btnDisabled = !affordable || processing || gameOver;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ship-btn'
            + (affordable ? '' : ' unaffordable')
            + (btnDisabled ? ' disabled' : '');
        btn.dataset.tipText = `Ship #${n} (${t.name}) - base cost ${n}^(1+${excess_exponent(n).toFixed(2)}) = ${cost(n, 0).toFixed(2)} <br>
    Your ${state.blue.ore} ore dliutes the excess exponent by ${ore_divisor(state.blue.ore).toFixed(2)} <br>
    You pay ${c.toFixed(2)} — ${q} more ore would discount this by ${d > 1 ? d.toFixed(2) : d.toPrecision(2)} <br>
    Your opponent can buy this for ${cost(n, state.red.ore).toFixed(2)}`
        if (scrub_mode) { btn.dataset.tipText = `Ship #${n} (${t.name}) <br> Hover over the ship number to see abilities. <br> Click to buy for ${c.toFixed(2)}! <br> Obtain ore (eg. from ship #3) to reduce this cost!` };
        btn.dataset.shipNum = n;
        btn.innerHTML = `
          <div class="stats">
            <span class="num" style="background:${shipNumBg(n)};" data-tip-text="${listAbilities(n)}" data-html="true">${n}</span>
            <span class="atk">${n % 5 ? (n % 11 ? SWORD_SVG : BOW_SVG) : ROCKET_SVG}${t.attack}</span>
            <span class="hp">${HEART_SVG}${t.health}</span>
          </div>
          <div class="row1">
            <span class="name">${t.name}</span>
          </div>
		    <span class="overlay-text-right ${c > state.blue.money ? 'text-red' : ''}">${c.toFixed(2)}</span>
        `;
        btn.onclick = () => { if (!btnDisabled) runTurn(n); };
        // Add hover preview
        btn.addEventListener('mouseenter', () => showShipPreview(n, 'blue'));
        btn.addEventListener('mouseleave', hideShipPreview);
        el.appendChild(btn);
    }
}

function showShipPreview(shipNum, owner) {
    if (processing) return;
    hideShipPreview();
    const shipsLayer = document.getElementById('ships-layer');
    if (!shipsLayer) return;

    const deploySec = owner === 'blue' ? BLUE_DEPLOY_IDX : RED_DEPLOY_IDX;
    const t = TEMPLATES[shipNum];

    // Create a temporary ship object for positioning
    const previewShip = {
        id: 'preview',
        owner,
        number: shipNum,
        attack: t.attack,
        health: t.health,
        maxHealth: t.health,
        sector: deploySec,
        row: 999, // bottom of column
        template: t,
        justDeployed: false,
    };

    // Get all ships in the deploy sector to calculate position
    const allShips = [...state.blue.ships, ...state.red.ships, previewShip];
    const pos = getShipPosition(previewShip, allShips);

    const div = createShipElement(previewShip, pos.compact, false);
    div.classList.add('preview');
    div.id = 'ship-preview';
    div.style.left = `calc(${pos.leftPct}% + 4px)`;
    div.style.top = pos.top + 'px';
    shipsLayer.appendChild(div);
}

function hideShipPreview() {
    const existing = document.getElementById('ship-preview');
    if (existing) existing.remove();
}

// ===== Tooltips =====
// Centered hover hints for the cryptic shorthand: stats (A/H), tags (×N ABC),
// resource labels, etc. Elements opt-in with data-tip="<key>" (lookup in TIPS)
// or data-tip-text="<arbitrary string>". Positioning is element-centered,
// not cursor-based, with auto-flip below if the top edge would overflow.
const TIPS = {
    atk: '<span class="tc">Attack</span> — damage dealt to a target ship per hit.',
    hp: '<span class="tc">Health</span> — remaining / max. The ship is destroyed at 0 HP.',
    cost: '<span class="tc">Deploy cost</span>. Formula: cost = N^(1 + <span class="to">1/ore</span>). Mining <span class="to">ore</span> lowers all costs.',
    free: 'Skip your deploy this turn. No <span class="tc">money</span> spent — useful to save up for a heavier ship.',
    income: '<span class="tc">Income</span> — money gained at the START of every turn. Boostable with Trader ships (<span class="to">×5</span>).',
    money: '<span class="tc">Money</span> — spendable funds. Used to deploy ships. You can overspend up to $4 (plus a bit more if your income is high), paying 25% interest.',
    // ore:      `<span class="to">Ore</span> — each ore adds 1/${ORE_R} to the dilution factor of the excess exponents of ships. Gained from Miner ships (<span class="to">×3</span>).`,
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

// Per-tag descriptions for shorthand badges like "×3 MIN .08" / "×5 INC+2".
function tagTip(tag) {
    if (tag.startsWith('×2')) return '<span class="tc">Combat hull</span> (factor of ×2) — better fighter than typical ships.';
    if (tag === 'MIN') {
        return `<span class="to">Miner</span> (factor of ×3) — generates N/3 at the end of every turn while not under your base. Ore lowers all ship costs.`;
    }
    if (tag.startsWith('×5')) {
        const m = tag.match(/\+\d+/);
        return `<span class="to">Trader</span> (factor of ×5) — permanently adds ${m ? m[0] : '+1'} to your income when deployed (even if the ship later dies).`;
    }
    if (tag.startsWith('×7')) return '<span class="tc">Missile ship</span> (factor of ×7) — its attack hits EVERY enemy in the target ship\'s sector, not just one.';
    if (tag === 'SIEGE') return 'At the end of each turn, attacks the enemy base.';
    if (tag === 'SPLIT') return 'When this ship advances without attacking, it spawns a Skiff (#1) in the sector behind it — a convoy that multiplies.';
    if (tag === 'DOUBLE STRIKE') return 'Attacks twice each combat phase — two separate hits on the same or different targets.';
    if (tag === 'TRAMPLE') return 'Excess damage from an overkill strike carries over to the next enemy in priority — no damage wasted.';
    if (tag === 'LONG RANGE') return 'Strikes from 3 sectors away instead of 2 — outranges every other ship on the field.';
    if (tag === 'TANK') return 'High HP soak with no special ability.';
    if (tag === 'CAPITAL') return 'Heavy capital-class warship.';
    if (tag === 'CARRIER') return 'End of turn: Spawn Ship #N/13 in my sector.';
    if (tag === 'ARMOR') return 'Damage I take is reduced by N/19.';
    if (tag === 'NOVA') return 'I attack every enemy (but only if at least one was in range to begin with).';
    if (tag === 'END') return 'On deploy: Attack enemy base.';
    return tag;
}

const tooltipEl = document.getElementById('tooltip');
let currentTip = null;

function getTipText(el) {
    const cb = document.getElementById('tag-toggle');
    scrub_mode = !cb.checked;
    if (scrub_mode && el.dataset.tip === 'ore') return 'Ore discounts your ships! Bigger ships get bigger discounts!'
    if (el.dataset.tipText) return el.dataset.tipText;
    if (el.dataset.tip) return TIPS[el.dataset.tip] || '';
    return '';
}

function showTip(el) {
    const text = getTipText(el);
    if (!text) return;
    tooltipEl.innerHTML = text;
    tooltipEl.classList.remove('below');
    // Render off-screen to measure
    tooltipEl.style.left = '-9999px';
    tooltipEl.style.top = '0px';
    // Force layout
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
    // Clamp horizontally so tooltip stays on screen, but keep arrow centered when possible
    let left = cx;
    const halfW = tw / 2;
    const margin = 8;
    if (left - halfW < margin) left = halfW + margin;
    if (left + halfW > window.innerWidth - margin) left = window.innerWidth - halfW - margin;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.classList.toggle('below', below);
    tooltipEl.classList.add('visible');
}

function hideTip() {
    currentTip = null;
    tooltipEl.classList.remove('visible');
}

document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip],[data-tip-text]');
    if (!el || el === currentTip) return;
    currentTip = el;
    showTip(el);
});
document.addEventListener('mouseout', (e) => {
    if (!currentTip) return;
    const to = e.relatedTarget;
    if (to && currentTip.contains(to)) return;            // moving within same tip element
    if (to && to.closest && to.closest('[data-tip],[data-tip-text]')) return; // mouseover handles next
    hideTip();
});
// Hide on scroll / resize so it doesn't drift
window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);

// Boot
(() => {
    var cb = document.getElementById('sound-toggle');
    if (cb) {
        cb.checked = soundOn;
        cb.addEventListener('change', e => setSound(e.target.checked));
    }
    cb = document.getElementById('tag-toggle');
    if (cb) {
        cb.addEventListener('change', e => renderDeployBar());
    }
    const slider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    if (slider && speedVal) {
        slider.addEventListener('input', e => {
            speedMult = parseFloat(e.target.value);
            speedVal.textContent = speedMult + '×';
            document.documentElement.style.setProperty('--anim-speed', speedMult);
        });
    }
})();
newGame();