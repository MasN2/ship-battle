import { newGame, setSpeedMult, setUsername } from './js/state.js';
import { setSound, isSoundOn } from './js/audio.js';
import { initTooltips } from './js/tooltips.js';
import { initScenarios } from './js/scenarios.js';
import { renderDeployBar } from './js/render.js';
import { initSetup } from './js/setup.js';

const tutorialBox = document.getElementById('tutorial-box');
const tutorialText = document.getElementById('tutorial-text');
const tutorialCloseBtn = document.getElementById('tutorial-close-btn');

// Close when the user clicks the close button
tutorialCloseBtn.addEventListener('click', closeTutorial);

/**
 * Displays a tutorial box with the given text.
 * Overwrites any current tutorial box if one is already open.
 * @param {string} text - The message to display.
 */
export function showTutorial(text) {
  // Overwrite text (works whether hidden or already showing)
  tutorialText.textContent = text;
  
  // Ensure it is visible
  tutorialBox.classList.remove('hidden');
}

/**
 * Closes/hides the tutorial box.
 */
export function closeTutorial() {
  tutorialBox.classList.add('hidden');
}

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

    // A standard match behind the New Game screen, which opens on the last setup used
    newGame();
    initSetup();
});
