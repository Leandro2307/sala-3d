// Efeitos sonoros sintetizados (sem arquivos): pulo, cama elástica, checkpoint, chegada, entrar/sair.
let ctx = null;
let enabled = true;

export function setSfxEnabled(on) { enabled = on; }

export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.06, delay = 0 }) {
  if (!enabled) return;
  const ac = audioContext();
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  jump: () => tone({ freq: 320, to: 520, dur: 0.1, type: 'triangle', gain: 0.035 }),
  pad: () => tone({ freq: 180, to: 760, dur: 0.32, type: 'sine', gain: 0.07 }),
  checkpoint: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.05, delay: i * 0.08 })),
  finish: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.24, type: 'triangle', gain: 0.055, delay: i * 0.09 })),
  fall: () => tone({ freq: 420, to: 140, dur: 0.35, type: 'sawtooth', gain: 0.03 }),
  join: () => [520, 780].forEach((f, i) => tone({ freq: f, dur: 0.12, gain: 0.04, delay: i * 0.07 })),
  leave: () => [600, 400].forEach((f, i) => tone({ freq: f, dur: 0.12, gain: 0.035, delay: i * 0.07 })),
  message: () => tone({ freq: 880, dur: 0.08, gain: 0.03 }),
  teleport: () => tone({ freq: 900, to: 220, dur: 0.3, type: 'sine', gain: 0.05 }),
};
