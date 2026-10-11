import { newGame, setSpeedMult, setUsername } from './js/state.js';
import { setSound, isSoundOn } from './js/audio.js';
import { initTooltips } from './js/tooltips.js';
import { initScenarios } from './js/scenarios.js';
import { renderDeployBar } from './js/render.js';

// Expose handlers expected by index.html inline attributes
window.newGame = newGame;
window.setUsername = setUsername;

document.addEventListener('DOMContentLoaded', () => {
    initTooltips();
    initScenarios();

    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) {
        soundToggle.checked = isSoundOn();
        soundToggle.addEventListener('change', e => setSound(e.target.checked));
    }

    const tagToggle = document.getElementById('tag-toggle');
    if (tagToggle) {
        tagToggle.addEventListener('change', () => renderDeployBar());
    }

    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    if (speedSlider && speedVal) {
        speedSlider.addEventListener('input', e => {
            const val = parseFloat(e.target.value);
            setSpeedMult(val);
            speedVal.textContent = `${val}×`;
            document.documentElement.style.setProperty('--anim-speed', val);
        });
    }

    // Start first match
    newGame();
});