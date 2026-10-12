const pauseModal = document.getElementById('pause-modal');
const btnResume = document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnRestartTop = document.getElementById('btn-restart-top');
const menuBtn = document.getElementById('menu-btn');
const btnScenarios = document.getElementById('btn-open-scenarios');
const scenarioModal = document.getElementById('formModal');

function togglePauseMenu(force) {
    const isCurrentlyOpen = pauseModal.classList.contains('active');
    const shouldOpen = force !== undefined ? force : !isCurrentlyOpen;

    if (shouldOpen) {
        pauseModal.classList.add('active');
        pauseModal.setAttribute('aria-hidden', 'false');
    } else {
        pauseModal.classList.remove('active');
        pauseModal.setAttribute('aria-hidden', 'true');
    }
}

// Global ESC hotkey
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        console.log("esc found");
        // If scenario modal is open, close that first; otherwise toggle pause menu
        if (scenarioModal && scenarioModal.style.display === 'flex') {
            scenarioModal.style.display = 'none';
        } else {
            togglePauseMenu();
        }
    }
});

menuBtn?.addEventListener('click', () => togglePauseMenu(true));
btnResume?.addEventListener('click', () => togglePauseMenu(false));

btnRestart?.addEventListener('click', () => {
    togglePauseMenu(false);
    newGame();
});

btnRestartTop?.addEventListener('click', () => {
    togglePauseMenu(false);
    newGame();
});

btnScenarios?.addEventListener('click', () => {
    togglePauseMenu(false);
    if (scenarioModal) scenarioModal.style.display = 'flex';
});

// Click outside dialog to close
pauseModal?.addEventListener('click', (e) => {
    if (e.target === pauseModal) togglePauseMenu(false);
});


import { renderShortcutBar } from './js/render.js';

const SHORTCUT_KEY = 'shipbattle.showShortcut';
const shortcutBar = document.getElementById('shortcut-bar');
const shortcutToggle = document.getElementById('shortcut-toggle');

// Load preference (defaults to true)
let showShortcut = localStorage.getItem(SHORTCUT_KEY) !== '0';

if (shortcutToggle && shortcutBar) {
    shortcutToggle.checked = showShortcut;
    shortcutBar.style.display = showShortcut ? 'grid' : 'none';

    shortcutToggle.addEventListener('change', (e) => {
        showShortcut = e.target.checked;
        localStorage.setItem(SHORTCUT_KEY, showShortcut ? '1' : '0');
        shortcutBar.style.display = showShortcut ? 'grid' : 'none';
        if (showShortcut) renderShortcutBar();
    });
}