import { BASE_START_HP, START_INCOME, START_ORE, DIFFICULTIES } from './config.js';
import { sfx } from './audio.js';
import { render, renderDeployBar, renderShortcutBar } from './render.js';
import {showTutorial} from '../script.js';

export let state = null;
export let nextShipId = 1;
export let processing = false;
export let gameOver = false;
export let speedMult = 1;
export let socket = null;
export let username = "player";
export let opponent = "ai";
export let difficulty = 'normal';

export function setProcessing(val) { processing = val; }
export function setGameOver(val) { gameOver = val; }
export function setSpeedMult(val) { speedMult = val; }
export function setUsername(val) { username = val; }
export function incrementShipId() { return nextShipId++; }

export const sleep = ms => new Promise(r => setTimeout(r, ms / speedMult));
export const timeout = (fn, ms) => setTimeout(fn, ms / speedMult);

export async function getNextMessage() {
    return new Promise(resolve => {
        socket.addEventListener('message', event => resolve(event.data), { once: true });
    });
}

export function log(text, cls = '') {
    if (!state) return;
    state.log.push({ text, cls });
    if (state.log.length > 200) state.log.shift();
    renderLog();
}

function renderLog() {
    const el = document.getElementById('log');
    if (!el || state.log.length === 0) return;

    const latest = state.log[state.log.length - 1];
    const div = document.createElement('div');
    div.className = `log-entry ${latest.cls || ''}`;
    div.textContent = latest.text;
    el.appendChild(div);

    if (el.children.length > 200) {
        el.removeChild(el.firstElementChild);
    }
}

export function startNewTurn() {
    state.turn++;
    state.blue.money += state.blue.income;
    state.red.money += state.red.income;
    log(`── Turn ${state.turn} ── Income: BLUE +${state.blue.income} · RED +${state.red.income}`, 'heading');
    const message = state.red.tutorial[state.turn];
    if (message !== undefined) {
        showTutorial(message);
    }
}

export function newGame(handicap) {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());

    const sel = document.getElementById('handicap-select');
    if (sel) difficulty = sel.value;

    if (handicap !== undefined) {
        const idx = parseInt(handicap, 10);
        difficulty = ["normal", "hard", "challenging", "tricky", "visionary"][idx];
    }

    const D = DIFFICULTIES[difficulty];

    if (D.ai === "pvp") {
        socket = new WebSocket("wss://render-echo-wvk1.onrender.com");
        opponent = "waiting";
        socket.addEventListener('open', async () => {
            socket.send(username);
            opponent = await getNextMessage();
            render();
        }, { once: true });
    } else {
        opponent = `ai - ${D.label}`;
    }

    state = {
        turn: 0,
        blue: {
            hp: D.playerHp ?? BASE_START_HP,
            damage_mult: 1,
            regen: 0,
            income: D.playerIncome ?? START_INCOME,
            money: 0,
            ore: START_ORE,
            ore_boost: 1,
            ore_income: 0,
            armor: 1,
            armor_gain: 0,
            ships: [],
            history: [],
            lastBought: 0,
            max_ship: D.maxShip ?? 999,
            locked_factor: D.lockedFactor ?? 999,
        },
        red: {
            hp: D.botHp ?? BASE_START_HP,
            armor: 1,
            armor_gain: D.armorGain ?? 0,
            regen: D.regen,
            income: D.botIncome ?? START_INCOME,
            money: D.botMoney ?? 0,
            ore: D.botOre ?? START_ORE,
            ore_boost: D.oreMult ?? 1,
            ore_delay: D.oreDelay ?? 0,
            ore_income: D.oreIncome ?? 0,
            ships: [],
            ai: D.ai ?? false,
            opening: D.opening ?? [],
            history: [],
            priority: D.priority ?? [],
            tutorial: D.tutorial ?? [],
        },
        log: []
    };

    const handicapInput = document.getElementById('handicapSelect');
    if (handicapInput) handicapInput.value = state.red.ore_delay * 16;

    if (D.ai === "daily") { state.red.hp += 130; state.blue.hp += 130; }
    if (D.ai === "custom") {
        const p = prompt("Please enter your opponent's build order:", "0,0,7");
        if (p) state.red.opening = JSON.parse(`[${p}]`);
    }

    nextShipId = 1;
    processing = false;
    gameOver = false;
    log(`Battle commenced. Handicap: ${D.label}.`, 'heading');
    startNewTurn();
    render();
    renderDeployBar();
    renderShortcutBar();
}

export function endGame() {
    gameOver = true;
    processing = false;
    const winner = state.red.hp > state.blue.hp ? 'RED' : 'BLUE';
    log(`${winner} wins on turn ${state.turn}.`, 'heading');
    if (winner === 'BLUE') sfx.win();
    else sfx.lose();
    render();
}