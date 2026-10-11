const SOUND_KEY = 'shipbattle.sound';
let soundOn = false;
try { soundOn = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { }

let audioCtx = null;
function getAudio() {
    if (audioCtx) return audioCtx;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    return audioCtx;
}

export function isSoundOn() { return soundOn; }

export function setSound(on) {
    soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { }
    if (soundOn) {
        const ctx = getAudio();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        playTone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.12 });
        playTone({ freq: 1320, dur: 0.07, type: 'triangle', vol: 0.1, delay: 0.06 });
    }
}

export function playTone({ freq = 440, dur = 0.1, type = 'sine', vol = 0.12, sweep = null, delay = 0 }) {
    if (!soundOn) return;
    const ctx = getAudio(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

export function playNoise({ dur = 0.15, vol = 0.18, filterFreq = 2000, sweep = null, delay = 0 }) {
    if (!soundOn) return;
    const ctx = getAudio(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
}

export const sfx = {
    deploy: () => { playTone({ freq: 520, dur: 0.06, type: 'square', vol: 0.12 }); playTone({ freq: 780, dur: 0.08, type: 'square', vol: 0.10, delay: 0.04 }); playTone({ freq: 1040, dur: 0.10, type: 'sine', vol: 0.08, delay: 0.08 }); },
    skip: () => { playTone({ freq: 320, dur: 0.12, type: 'triangle', vol: 0.10, sweep: 180 }); playTone({ freq: 240, dur: 0.10, type: 'sine', vol: 0.06, sweep: 120, delay: 0.06 }); },
    attack: () => { playTone({ freq: 1200, dur: 0.05, type: 'sawtooth', vol: 0.12, sweep: 2200 }); playNoise({ dur: 0.04, vol: 0.08, filterFreq: 3000, delay: 0.01 }); },
    hit: () => { playNoise({ dur: 0.12, vol: 0.20, filterFreq: 2200, sweep: 400 }); playTone({ freq: 180, dur: 0.08, type: 'sine', vol: 0.10, sweep: 80, delay: 0.02 }); },
    missile: () => { playTone({ freq: 160, dur: 0.12, type: 'sawtooth', vol: 0.12, sweep: 60 }); playTone({ freq: 240, dur: 0.08, type: 'square', vol: 0.08, sweep: 100, delay: 0.04 }); playNoise({ dur: 0.28, vol: 0.22, filterFreq: 1400, sweep: 150, delay: 0.06 }); },
    baseHit: () => { playNoise({ dur: 0.50, vol: 0.28, filterFreq: 1100, sweep: 60 }); playTone({ freq: 120, dur: 0.40, type: 'sine', vol: 0.18, sweep: 40 }); playTone({ freq: 80, dur: 0.35, type: 'sawtooth', vol: 0.10, sweep: 30, delay: 0.08 }); },
    death: () => { playNoise({ dur: 0.45, vol: 0.24, filterFreq: 1600, sweep: 150 }); playTone({ freq: 440, dur: 0.30, type: 'sawtooth', vol: 0.12, sweep: 60 }); playTone({ freq: 280, dur: 0.25, type: 'sine', vol: 0.08, sweep: 40, delay: 0.12 }); },
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => playTone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.16, delay: i * 0.10 })); playTone({ freq: 1568, dur: 0.40, type: 'sine', vol: 0.12, delay: 0.52 }); },
    lose: () => { [440, 370, 311, 261, 220].forEach((f, i) => playTone({ freq: f, dur: 0.26, type: 'sawtooth', vol: 0.14, delay: i * 0.13 })); playNoise({ dur: 0.50, vol: 0.12, filterFreq: 600, sweep: 100, delay: 0.55 }); },
};