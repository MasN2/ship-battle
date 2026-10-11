import { BASE_START_HP } from './config.js';

export const TEMPLATES = {
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
    if (n < 2) return "No prime factors - No abilities.";
    const factors = calculatePrimeFactors(n);
    const lines = [`Prime factors: ${factors.join(' &times; ')}`];
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
    if (n % 33 === 0) lines.push('3 &times; 11: I mine anywhere.');
    return lines.join('<br>');
}