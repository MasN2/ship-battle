export const SECTORS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
export const BLUE_BASE_IDX = 1;
export const RED_BASE_IDX = 7;
export const BLUE_DEPLOY_IDX = 1; // Sector B (index 1)
export const RED_DEPLOY_IDX = 7;  // Sector H (index 7)

export const BASE_START_HP = 150;
export const START_INCOME = 4;
export const START_ORE = 0;
export const ORE_POW = 0.75;
export const ORE_R = 27;
export const ORE_BASE = 120;
export const ATTACK_RANGE = 2;
export const MAX_LOAN = 4;

export const SECTOR_LABEL_H = 26;
export const BASE_H = 78;
export const SHIP_CARD_H = 30;
export const SHIP_CARD_H_COMPACT = 26;

export const SWORD_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.4 1.1 L7 4.5 L8.2 5.7 L11.5 2.3 L11.5 0.5 Z M6.4 5.1 L1.4 10.1 L1.4 11.5 L2.8 11.5 L7.8 6.5 Z M5.5 7.2 L4.8 7.9 L4.1 7.2 L4.8 6.5 Z"/></svg>`;
export const BOW_SVG = '🏹';
export const ROCKET_SVG = '🚀';
export const HEART_SVG = `<svg class="stat-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 11 C6 11 1 7.5 1 4.3 C1 2.7 2.2 1.5 3.7 1.5 C4.7 1.5 5.5 2 6 2.8 C6.5 2 7.3 1.5 8.3 1.5 C9.8 1.5 11 2.7 11 4.3 C11 7.5 6 11 6 11 Z"/></svg>`;
export const TARGET_MARK_SVG = `<svg class="target-mark" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="0" x2="7" y2="2.8" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="11.2" x2="7" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="0" y1="7" x2="2.8" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="11.2" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.2"/></svg>`;

export const DIFFICULTIES = {
    daily: { label: 'Weekly Puzzle', incomeMult: 72, oreMult: 1, hpMult: 1, aiNoise: 0.1, aiSkipChance: 0.02, ai: 'daily' },
    normal: { label: 'Normal', incomeMult: 4, oreMult: 1, hpMult: 1, aiNoise: 0.4, aiSkipChance: 0.08, ai: false },
    hard: { label: 'Hard', incomeMult: 4, oreMult: 1, oreDelay: 1 / 16, armorGain: 0.01, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    challenging: { label: 'Hard', incomeMult: 4, oreMult: 1, oreDelay: 2 / 16, armorGain: 0.02, aiNoise: 0.2, aiSkipChance: 0.04, ai: false },
    tricky: { label: 'Brutal', incomeMult: 4, oreMult: 1, oreDelay: 3 / 16, armorGain: 0.03, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    visionary: { label: 'Brutal', incomeMult: 4, oreMult: 1, oreDelay: 4 / 16, armorGain: 0.04, regen: 0, aiNoise: 0.1, aiSkipChance: 0.02, ai: false },
    pvp: { label: 'PVP', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: 'pvp' },
    custom: { label: 'Custom', incomeMult: 4, oreMult: 1, hpMult: 0, aiNoise: 1.6, aiSkipChance: 0.32, ai: 'custom' },
};