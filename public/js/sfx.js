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

// Ruído branco reaproveitado: gerar o buffer a cada soco é desperdício.
let ruidoBuf = null;
function ruidoBuffer(ac) {
  if (ruidoBuf) return ruidoBuf;
  const n = Math.floor(ac.sampleRate * 0.5);
  ruidoBuf = ac.createBuffer(1, n, ac.sampleRate);
  const d = ruidoBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ruidoBuf;
}

// Rajada de ruído filtrada — é o que dá o "tchá" do impacto. Só com oscilador
// senoidal um soco vira bipe; a parte percussiva vem daqui.
function ruido({ dur = 0.1, gain = 0.08, type = 'lowpass', freq = 1200, toFreq = null, q = 1, delay = 0 }) {
  if (!enabled) return;
  const ac = audioContext();
  const t0 = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = ruidoBuffer(ac);
  const filtro = ac.createBiquadFilter();
  filtro.type = type;
  filtro.frequency.setValueAtTime(freq, t0);
  if (toFreq) filtro.frequency.exponentialRampToValueAtTime(toFreq, t0 + dur);
  filtro.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filtro).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  // estampido: rajada de ruído grave e curta + um "tum" (vol cai com a distância)
  tiro: (vol = 1) => {
    ruido({ dur: 0.18, gain: 0.12 * vol, type: 'lowpass', freq: 3600, toFreq: 260, q: 0.7 });
    tone({ freq: 150, to: 55, dur: 0.14, type: 'square', gain: 0.03 * vol });
  },
  jump: () => tone({ freq: 320, to: 520, dur: 0.1, type: 'triangle', gain: 0.035 }),
  pad: () => tone({ freq: 180, to: 760, dur: 0.32, type: 'sine', gain: 0.07 }),
  checkpoint: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.05, delay: i * 0.08 })),
  finish: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.24, type: 'triangle', gain: 0.055, delay: i * 0.09 })),
  fall: () => tone({ freq: 420, to: 140, dur: 0.35, type: 'sawtooth', gain: 0.03 }),
  join: () => [520, 780].forEach((f, i) => tone({ freq: f, dur: 0.12, gain: 0.04, delay: i * 0.07 })),
  leave: () => [600, 400].forEach((f, i) => tone({ freq: f, dur: 0.12, gain: 0.035, delay: i * 0.07 })),
  message: () => tone({ freq: 880, dur: 0.08, gain: 0.03 }),
  teleport: () => tone({ freq: 900, to: 220, dur: 0.3, type: 'sine', gain: 0.05 }),

  // ------------------------------------------------------------ xadrez de bruxo e dama
  // peça de pedra assentando na casa: baque surdo
  pedraPasso: (vol = 1) => {
    if (vol <= 0.02) return;
    ruido({ dur: 0.12, gain: 0.07 * vol, type: 'lowpass', freq: 700, toFreq: 160 });
    tone({ freq: 90, to: 45, dur: 0.14, type: 'sine', gain: 0.09 * vol });
  },
  // peça tomada se despedaçando: estalo, corpo grave e cascalho caindo
  pedraQuebra: (vol = 1) => {
    if (vol <= 0.02) return;
    ruido({ dur: 0.09, gain: 0.16 * vol, type: 'highpass', freq: 1800, q: 0.6 });
    ruido({ dur: 0.45, gain: 0.12 * vol, type: 'lowpass', freq: 2400, toFreq: 300, q: 0.8 });
    tone({ freq: 120, to: 38, dur: 0.35, type: 'sine', gain: 0.18 * vol });
    for (let i = 0; i < 5; i++) ruido({ dur: 0.05, gain: 0.05 * vol, type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 2, delay: 0.25 + i * 0.07 + Math.random() * 0.05 });
  },

  // dado batendo no feltro: estalo seco e curto
  dado: (vol = 1) => {
    ruido({ dur: 0.04, gain: 0.09 * vol, type: 'bandpass', freq: 2200 + Math.random() * 900, q: 1.4 });
    tone({ freq: 320, to: 180, dur: 0.05, type: 'triangle', gain: 0.03 * vol });
  },
  // Sino da Sala Comercial (venda fechada): três badaladas, cada uma com o som fundamental e os
  // harmônicos "tortos" de sino (2,76x e 5,4x), que é o que tira o jeito de bipe.
  sino: () => {
    for (const [i, base] of [[0, 784], [1, 988], [2, 1175]]) {
      const delay = i * 0.22;
      tone({ freq: base, dur: 1.1, type: 'sine', gain: 0.07, delay });
      tone({ freq: base * 2.76, dur: 0.6, type: 'sine', gain: 0.025, delay });
      tone({ freq: base * 5.4, dur: 0.25, type: 'sine', gain: 0.012, delay });
    }
  },

  // moedas: dois "plins" metálicos
  moeda: () => {
    tone({ freq: 1568, dur: 0.12, type: 'triangle', gain: 0.05 });
    tone({ freq: 2093, dur: 0.22, type: 'triangle', gain: 0.05, delay: 0.07 });
  },

  // ------------------------------------------------------------ ringue
  // Soco no vazio: só o deslocamento de ar, agudo e curto.
  punchSwing: () => ruido({ dur: 0.13, gain: 0.05, type: 'bandpass', freq: 1700, toFreq: 480, q: 1.1 }),

  // Soco que acerta: estalo de ruído por cima + corpo grave que desce rápido.
  // As duas camadas juntas é o que soa como pancada, e não como bipe.
  punchHit: () => {
    ruido({ dur: 0.075, gain: 0.13, type: 'lowpass', freq: 2600, toFreq: 700, q: 0.7 });
    tone({ freq: 165, to: 48, dur: 0.17, type: 'sine', gain: 0.17 });
    tone({ freq: 95, to: 40, dur: 0.1, type: 'triangle', gain: 0.07, delay: 0.012 });
  },

  // Apanhar: a mesma pancada, mais abafada (você ouve de dentro).
  punchTaken: () => {
    ruido({ dur: 0.09, gain: 0.1, type: 'lowpass', freq: 900, toFreq: 300 });
    tone({ freq: 140, to: 44, dur: 0.22, type: 'sine', gain: 0.15 });
  },

  // Nocaute: pancada mais pesada, com cauda e um "uuu" descendo.
  ko: () => {
    ruido({ dur: 0.16, gain: 0.15, type: 'lowpass', freq: 1800, toFreq: 240 });
    tone({ freq: 120, to: 32, dur: 0.5, type: 'sine', gain: 0.2 });
    tone({ freq: 420, to: 90, dur: 0.55, type: 'triangle', gain: 0.05, delay: 0.05 });
    ruido({ dur: 0.5, gain: 0.03, type: 'lowpass', freq: 500, toFreq: 120, delay: 0.1 });
  },
};
