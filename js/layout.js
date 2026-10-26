// Scales the game area and bottom bar (CSS `zoom: var(--ui)`) so big windows get a bigger game
// instead of tiny text in a sea of space. Never below 1, so browser zoom still enlarges things.

const BASE_W = 1500;   // the layout's natural width at --ui 1
const BASE_H = 700;    // room needed at --ui 1 for the battlefield plus the bottom bars
const MAX_UI = 1.6;

/** The current --ui scale. */
export let uiScale = 1;

function update() {
    const s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H, MAX_UI);
    uiScale = Math.max(1, Math.round(s * 100) / 100);
    document.documentElement.style.setProperty('--ui', uiScale);
}

export function initLayout(onChange) {
    update();
    let last = uiScale;
    window.addEventListener('resize', () => {
        update();
        if (onChange) onChange(uiScale !== last);
        last = uiScale;
    });
}
