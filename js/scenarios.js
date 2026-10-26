import { newGame, state } from './state.js';
import { load } from './combat.js';

export const userData = {
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

export function initScenarios() {
    const dropdown = document.getElementById('userSelect');
    const handicapInput = document.getElementById('handicapSelect');
    const nameInput = document.getElementById('blue-bo');
    const emailInput = document.getElementById('red-bo');
    const importBtn = document.getElementById('importBtn');
    const input = document.getElementById("command-line");

    if (dropdown) {
        for (const key in userData) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = userData[key].title;
            dropdown.appendChild(option);
        }

        dropdown.addEventListener('change', function () {
            if (userData[this.value]) {
                handicapInput.value = userData[this.value].handicap;
                nameInput.value = userData[this.value].name;
                emailInput.value = userData[this.value].email;
            } else {
                nameInput.value = '';
                emailInput.value = '';
            }
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const r = JSON.parse(`[${emailInput.value}]`);
            const b = JSON.parse(`[${nameInput.value}]`);
            document.getElementById('formModal')?.classList.remove('active');
            newGame(handicapInput.value);
            state.red.opening = r;
            await load(b);
        });
    }

    if (input) {
        input.addEventListener("keypress", async (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (input.value === "?") {
                    input.value = `${state.blue.history}`;
                } else {
                    await load(JSON.parse(`[${input.value}]`));
                    input.value = "";
                }
            }
        });
    }
}