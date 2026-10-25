export const SECTORS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
export const BLUE_BASE_IDX = 1;
export const RED_BASE_IDX = 7;
export const BLUE_DEPLOY_IDX = 1; // Sector B (index 1)
export const RED_DEPLOY_IDX = 7;  // Sector H (index 7)

export const BASE_START_HP = 160;
export const START_INCOME = 4;
export const START_ORE = 0;
export const ORE_POW = 0.8;
export const ORE_R = 40;
export const ORE_BASE = 70;
export const ATTACK_RANGE = 2;
export const MAX_LOAN = 4;

export const SECTOR_LABEL_H = 8;
export const BASE_H = 78;
export const SHIP_CARD_H = 30;
export const SHIP_CARD_H_COMPACT = 26;

export const SWORD_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.4 1.1 L7 4.5 L8.2 5.7 L11.5 2.3 L11.5 0.5 Z M6.4 5.1 L1.4 10.1 L1.4 11.5 L2.8 11.5 L7.8 6.5 Z M5.5 7.2 L4.8 7.9 L4.1 7.2 L4.8 6.5 Z"/></svg>`;
export const BOW_SVG = '🏹';
export const ROCKET_SVG = '🚀';
export const HEART_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 11 C6 11 1 7.5 1 4.3 C1 2.7 2.2 1.5 3.7 1.5 C4.7 1.5 5.5 2 6 2.8 C6.5 2 7.3 1.5 8.3 1.5 C9.8 1.5 11 2.7 11 4.3 C11 7.5 6 11 6 11 Z"/></svg>`;
export const TARGET_MARK_SVG = `<svg class="target-mark" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="0" x2="7" y2="2.8" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="11.2" x2="7" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="0" y1="7" x2="2.8" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="11.2" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.2"/></svg>`;

const c1tutorial = {
    1: "Welcome to ship battle!\nYou can 'buy' a 'Skiff' (click the button)\nAlternatively, you can skip your turn and save your money for bigger ships. But saving money isn't useful in this mission because bigger ships haven't been unlocked yet.",
    2: "Ships advance one space every turn.",
    3: "Ships can fire at enemies within range 2.",
    4: "Ships that fire do not advance.",
    5: "Ships fire at the top ship in the enemy column.",
    6: "Reduce a ship to 0 hp to destroy it.",
    7: "After destroying an enemy ship, ships fire at the next enemy in line.",
    8: "For this mission, your objective is to destroy 10 enemy ships, then destroy the enemy base.",
    19: "Great job destroying the enemy fleet - time to move on their base.",
    20: "I heard the academy sends terminators to eliminate slow students, I wouldn't worry about that.",
    21: "Reduce the enemy base to 0hp to win!",
    26: "If you get terminated, you can press the button in the top left to try again.",
}

const c2tutorial = {
    1: "Good job cadet! I've unlocked the corvette for you. The corvette hits harder and is tougher than an ordinary skiff.",
    2: "Budget Master Ryan: On behalf of the federation, I've increased your budget to $2.",
    3: "You can take loans to buy a ship you cannot afford. Loans have a 25% interest, so don't rely on them too much.",
    4: "You might notice that ship 2 costs more than $2. Mysterious!",
    5: "Ship Masters is a deep turn based strategy game set in a sci-fi universe. Construct over 60 hand-balanced ships, discover the unique powers of the prime numbers, and master the mechanics that allow you to combine them.",
    6: "The power of the prime 2 is to hit harder. Hover over the 2 to find out more.",
    7: "I wonder what will happen if you combine 2 with itself.",
}

const c4tutorial = {
    1: "Each ship number is its ship's minimum cost. The power of the prime 3 is to mine ore, which brings the ship cost closer to the minimum.",
    2: "Budget Master Ryan: On behalf of the federation, I've increased your budget to $3.",
    3: "That said, we're under a frigate attack right now. Maybe now is not the best time to mine.",
}

const c6tutorial = {
    1: "Budget Master Ryan: On behalf of the federation, I've increased your budget to $4.",
    2: "The power of the prime 5 is to fire a missile that hits all enemies in the sector.",
    3: "Wow, that would have been useful when the enemy was actually deploying ships.",
}

const c10tutorial = {
    1: "Budget Master Ryan: I'm not increasing your budget anymore. It's perfect as is.",
    2: "Looks like we'll have to increase it ourselves.",
    3: "The power of the prime 7 is to increase your income.",
    4: "My sensors are picking up on a destroyer attack in the future. It will be hard to defeat it with only 4 income.",
    5: "Budget Master Ryan: What do you mean? 4 is a great number!",
    6: "Once we fend off these destroyers, we'll challenge the prime masters and steal their technology!",
}

export const GM_VERSION = '1.2';
export const GM_BETA_VERSION = '1.6β';

export const DIFFICULTIES = {
    campaign1: { label: 'Campaign 1', maxShip: 1, playerIncome: 1, botHp: 62, botIncome: 33, botOre: 1000, priority: [83, 0], opening: [1,1,1,1,1,1,1,1,1,1], tutorial: c1tutorial},
    campaign2: { label: 'Campaign 2', maxShip: 2, playerIncome: 2, botHp: 63, botIncome: 66, botOre: 1000, priority: [83, 0], tutorial: c2tutorial},
    campaign4: { label: 'Campaign 4', maxShip: 4, playerIncome: 3, playerHp: 100, botHp: 160, botIncome: 7, priority: [4], tutorial: c4tutorial},
    campaign6: { label: 'Campaign 6', maxShip: 6, botHp: 160, botIncome: 52, botOre: 1000, priority: [83, 0], tutorial: c6tutorial},
    campaign10: { label: 'Campaign 10', maxShip: 10, botHp: 160, botIncome: 11, priority: [8, 4], opening: [0, 0, 0, 0, 0], tutorial: c10tutorial},
    campaign11: { label: 'Campaign 11', lockedFactor: 11, botHp: 640, botIncome: 5, priority: [11, 7, 0], oreIncome: 2},
    campaign13: { label: 'Campaign 13', lockedFactor: 13, botHp: 160, priority: [13, 0], botMoney: 96},
    campaign17: { label: 'Campaign 17', lockedFactor: 17, botHp: 1160, priority: [17, 7, 0], botIncome: 10, oreIncome: 2},
    // campaign19: { label: 'Campaign 19', lockedFactor: 19, botHp: 160, priority: [19, 14, 7, 0], botIncome: 15, oreIncome: 2},
    normal: { label: 'Normal', incomeMult: 4, oreMult: 1, hpMult: 1, aiNoise: 0.4, aiSkipChance: 0.08, ai: false },
    hard: { label: 'Hard', incomeMult: 4, oreMult: 1, oreDelay: 1 / 16, armorGain: 0.02, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    challenging: { label: 'Challenging', incomeMult: 4, oreMult: 1, oreDelay: 2 / 16, armorGain: 0.03, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    tricky: { label: 'Tricky', incomeMult: 4, oreMult: 1, oreDelay: 3 / 16, armorGain: 0.04, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    visionary: { label: 'Visionary', incomeMult: 4, oreMult: 1, oreDelay: 4 / 16, armorGain: 0.05, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    // No handicaps: same base, income and ore as Normal. The edge is all in js/grandmaster.js.
    // The version is in the label (and so on the red command card in screenshots); bump it
    // whenever default play changes, so a report can be matched to the AI that played it.
    // v1.0 first release · v1.1 winScore 3e4 · v1.2 turtle/value styles
    grandmaster: { label: `Grandmaster v${GM_VERSION}`, ai: 'grandmaster' },
    // Playtest variant: values income/ore further ahead while its base is safe (safeEcon), has no
    // "win fastest" tie-break (hurry 0), and knows the mining gridlock (the 'gridlock' style, for
    // itself and as a model of the player). β log: v1.2β distrusted far-off wins (weak to Frigate
    // counterwaves); v1.3β safeEcon 2; v1.4β + hurry 0; v1.5β + gridlock; v1.6β + investBias 3000
    // (a trader pays itself off within ~10 turns, so ties go to investing).
    grandmasterBeta: {
        label: `Grandmaster β v${GM_BETA_VERSION}`, ai: 'grandmaster',
        gmCfg: {
            safeEcon: 2, hurry: 0, investBias: 3000,
            mine: ['spend', 'smart', 'econ', 'mine', 'turtle', 'value', 'gridlock'],
            theirs: ['spend', 'smart', 'econ', 'mine', 'wild', 'wild', 'wild', 'turtle', 'value', 'gridlock'],
        },
    },
    pvp: { label: 'PVP', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: 'pvp' },
    custom: { label: 'Custom', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: 'custom' },
};
