import { BASE_START_HP } from './config.js';

export const TEMPLATES = {
    1: { number: 1, name: 'Skiff', attack: 1, health: 9, tags: [] },
    2: { number: 2, name: 'Corvette', attack: 2, health: 11, tags: ['×2 CMB'], combat: true },
    3: { number: 3, name: 'Driller', attack: 1, health: 4, tags: ['MIN'], mining: 0.03 },
    4: { number: 4, name: 'Frigate', attack: 4, health: 15, tags: ['×2 CMB'], combat: true },
    5: { number: 5, name: 'Missile', attack: 1, health: 18, tags: ['×7 AOE'], missile: true },
    6: { number: 6, name: 'Reaver', attack: 2, health: 17, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.06 },
    7: { number: 7, name: 'Trader', attack: 1, health: 1, tags: ['×5 INC+1'], incomeBoost: 1 },
    8: { number: 8, name: 'Destroyer', attack: 8, health: 21, tags: ['×2 CMB'], combat: true },
    9: { number: 9, name: 'Quarry', attack: 1, health: 4, tags: ['MIN', 'MIN'], mining: 0.18 },
    10: { number: 10, name: 'Hellfire', attack: 2, health: 25, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    11: { number: 11, name: 'Archer', attack: 5, health: 17, tags: ['CARRIER'], split: true },
    12: { number: 12, name: 'Excavator', attack: 4, health: 30, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.12 },
    13: { number: 13, name: 'Carrier', attack: 1, health: 22, tags: ['LONG RANGE'], longRange: true },
    14: { number: 14, name: 'Caravan', attack: 2, health: 18, tags: ['×2 CMB', '×5 INC+2'], combat: true, incomeBoost: 2 },
    15: { number: 15, name: 'Blaster', attack: 1, health: 18, tags: ['MIN', '×7 AOE'], mining: 0.15, missile: true },
    16: { number: 16, name: 'Dreadnought', attack: 16, health: 33, tags: ['×2 CMB'], combat: true },
    17: { number: 17, name: 'Sapper', attack: 1, health: 90, tags: ['SIEGE'], siege: true },
    18: { number: 18, name: 'Behemoth', attack: 2, health: 24, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.36 },
    19: { number: 19, name: 'Bulwark', attack: 1, health: 110, tags: ['ARMOR'] },
    20: { number: 20, name: 'Leviathan', attack: 4, health: 45, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    21: { number: 21, name: 'Foundry', attack: 1, health: 1, tags: ['MIN', '×5 INC+3'], mining: 0.21, incomeBoost: 3 },
    22: { number: 22, name: 'Glaive', attack: 10, health: 60, tags: ['CARRIER'], split: true },
    23: { number: 23, name: 'Pathfinder', attack: 1, health: 22, tags: [] },
    24: { number: 24, name: 'Freighter', attack: 8, health: 60, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.24 },
    25: { number: 25, name: 'Nova', attack: 1, health: 16, tags: ['NOVA'], nova: true },
    26: { number: 26, name: 'Mothership', attack: 2, health: 50, tags: ['×2 CMB', 'LONG RANGE'], longRange: true },
    27: { number: 27, name: 'Cornucopia', attack: 1, health: 5, tags: ['MIN', 'MIN', 'MIN'], mining: 0.81 },
    28: { number: 28, name: 'Convoy', attack: 4, health: 60, tags: ['×2 CMB', '×5 INC+4'], combat: true, incomeBoost: 4 },
    29: { number: 29, name: 'Armory', attack: 1, health: 130, tags: [] },
    30: { number: 30, name: 'Dynamite', attack: 2, health: 40, tags: ['×2 CMB', 'MIN', '×7 AOE'], mining: 0.30, missile: true },
    31: { number: 31, name: 'Crossbowman', attack: 9, health: 60, tags: [] },
    32: { number: 32, name: 'Battlecruiser', attack: 32, health: 80, tags: ['×2 CMB'] },
    33: { number: 33, name: 'Reaper', attack: 5, health: 80, tags: ['MIN', 'CARRIER'], split: true },
    34: { number: 34, name: 'Eraser', attack: 2, health: 70, tags: ['×2 CMB', 'SIEGE'], siege: true },
    35: { number: 35, name: 'Flotilla', attack: 1, health: 30, tags: ['×5 INC+5', '×7 AOE'], incomeBoost: 5, missile: true },
    36: { number: 36, name: 'Titan', attack: 4, health: 50, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.72 },
    37: { number: 37, name: 'Ruler', attack: 1, health: 40, tags: [] },
    38: { number: 38, name: 'Centurion', attack: 2, health: 200, tags: ['ARMOR'] },
    39: { number: 39, name: 'Harvester', attack: 1, health: 50, tags: ['MIN', 'LONG RANGE'], longRange: true, mining: 0.33 },
    40: { number: 40, name: 'Obliterator', attack: 27, health: 60, tags: ['×2 CMB', '×7 AOE'], combat: true, missile: true },
    41: { number: 41, name: 'Command Ship', attack: 41, health: 60 },
    42: { number: 42, name: 'Refinery', attack: 3, health: 25, tags: ['MIN', '×5 INC+6'], mining: 0.42, incomeBoost: 6 },
    43: { number: 43, name: 'Raybeam', attack: 1, health: 100 },
    44: { number: 44, name: 'Sharpshooter', attack: 45, health: 60 },
    45: { number: 45, name: 'Reactor', attack: 1, health: 34 },
    46: { number: 46, name: 'Starfinder', attack: 3, health: 70 },
    47: { number: 47, name: 'Rainbow', attack: 1, health: 90, tags: [] },
    48: { number: 48, name: 'Megahauler', attack: 81, health: 100, tags: ['×2 CMB', 'MIN'], combat: true, mining: 0.24 },
    49: { number: 49, name: 'Exchange', attack: 1, health: 90, tags: ['×5 INC+1'], incomeBoost: 14 },
    50: { number: 50, name: 'Doomsday', attack: 3, health: 70, tags: ['NOVA'], nova: true },
    51: { number: 51, name: 'Engineer', attack: 1, health: 90, tags: ['×2 CMB', 'SIEGE'], siege: true },
    52: { number: 52, name: 'Starbase', attack: 9, health: 120, tags: ['×2 CMB', 'LONG RANGE'], longRange: true },
    41: { number: 53, name: 'Abacus', attack: 1, health: 1 },
    54: { number: 54, name: 'Valhalla', attack: 3, health: 50, tags: ['×2 CMB', 'MIN', 'MIN'], combat: true, mining: 0.36 },
    55: { number: 55, name: 'ICBM', attack: 5, health: 70 },
    56: { number: 56, name: 'Armada', attack: 27, health: 200 },
    57: { number: 57, name: 'Source', attack: 1, health: 300 },
    58: { number: 58, name: 'BaseForge', attack: 3, health: 120 },
    59: { number: 59, name: 'Economist', attack: 1, health: 240 },
    60: { number: 60, name: 'Nobel', attack: 9, health: 120 },
    61: { number: 61, name: 'Shinobi', attack: 61, health: 130 },
    62: { number: 62, name: 'Xbowman', attack: 27, health: 150 },
    63: { number: 63, name: 'Forge', attack: 1, health: 30 },
    64: { number: 64, name: 'Power', attack: 729, health: 140 },
    65: { number: 65, name: 'Firebase', attack: 1, health: 120 },
    66: { number: 66, name: 'Musketeer', attack: 15, health: 240 },
    67: { number: 67, name: 'Samurai', attack: 67, health: 160 },
    68: { number: 68, name: 'Clock', attack: 9, health: 300 },
    69: { number: 69, name: 'Orefinder', attack: 1, health: 120 },
    70: { number: 70, name: 'Fleet', attack: 3, health: 120 },
    71: { number: 71, name: 'Wong', attack: 1, health: 150 },
    72: { number: 72, name: 'Old God', attack: 27, health: 800 },
    73: { number: 73, name: 'Rejuvenator', attack: 73, health: 300 },
    89: { number: 89, name: 'Terminus', attack: 1984, health: 1, tags: ['END'], win: true },
};

export const SHIP_NUMS = Object.keys(TEMPLATES).map(Number).sort((a, b) => a - b);

export function calculatePrimeFactors(n) {
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

export function listAbilities(n) {
    if (n < 2) return "No abilities.";
    const factors = calculatePrimeFactors(n);
    const lines = [`Prime factors: ${factors.join(' &times; ')}`];
    for (const factor of factors) {
        switch (factor) {
            case 2: lines.push(`<b class="tr">2 › </b> I have ×${n >= 40 ? 3 : 2} attack.`); break;
            case 3: lines.push(`<b style="color: #00cab1;">3 › End of turn:</b> +${n / 3} ore if this ship is within the center 3 sectors.`); break;
            case 5: lines.push(`<b class="tp">5 › After I attack:</b> Fire a ${n / 5}-damage missile that hits all enemies in target sector. Prioritizes attacking crowded sectors.`); break;
            case 7: lines.push(`<b class="tc">7 › Deploy:</b> Trade 4 base hp for ${n / 7} income.`); break;
            case 11: lines.push(`<b style="color: #25d367;">11 ›</b> I have +1 range and x5 attack.`); break;
            case 13: lines.push(`<b class="to">13 › End of turn:</b> Deploy ship #${2 * n / 13} in my sector.`); break;
            case 17: lines.push(`<b style="color: #a28e00;">17 › End of turn:</b> Enemy base loses ${n / 17} hp.`); break;
            case 19: lines.push(`<b style="color: #8a63fe;">19 ›</b> I take ${n / 19} less damage from all sources.`); break;
            case 23: lines.push(`<b style="color: yellow;">23 › End of turn:</b> Trade 1 base hp for ${n / 23} income.`); break;
            case 29: lines.push(`<b style="color: white;">29 › End of turn:</b> Modify your base with +1 armor.`); break;
            case 31: lines.push(`<b style="color: #5e7488;">31 › I have +2 range and x9 attack.`); break;
            case 37: lines.push(`<b style="color: #5e7488;">37 › Deploy:</b> Also deploy ships up to #12 in my sector.`); break;
            case 41: lines.push(`<b style="color: white;">41 › Deploy:</b> Modify your ships with +1 attack.`); break;
            case 43: lines.push(`<b style="color: white;">43 › End of turn:</b> Modify me with ×3 attack.`); break;
            case 47: lines.push(`<b style="color: white;">47 › End of turn:</b> Deploy ship #(my attack) in my sector, then modify me with +2 attack.`); break;
            case 53: lines.push(`<b style="color: #5e7488;">53 › Deploy:</b> Also deploy prime ships up to #31 in my sector.`); break;
            case 59: lines.push(`<b style="color: white;">59 › Deploy:</b> Modify me with +attack equal to your income.`); break;
            case 61: lines.push(`<b style="color: white;">61 › Deploy:</b> I join the furthest advanced ship.`); break;
            case 67: lines.push(`<b style="color: white;">67 › Deploy:</b> I join the furthest advanced ship.`); break;
            case 71: lines.push(`<b style="color: white;">71</b> Your Deploy abilities trigger twice as many times.`); break;
            case 73: lines.push(`<b style="color: white;">73 › Deploy:</b> Your base gains hp equal to my attack.`); break;
            case 89: lines.push(`<b style="color: white;">89 › Deploy:</b> The enemy base loses hp equal to my attack.`); break;
        }
    }
    if (n % 33 === 0) lines.push('<b style="color: #00cab1;">3</b> &times; <b style="color: #25d367;">11</b>: I mine anywhere.');
    if (n % 58 === 0) lines.push('<b style="color: #00cab1;">2</b> &times; <b style="color: #25d367;">29</b>: Then modify your base with x2 armor.');
    return lines.join('<br>');
}
