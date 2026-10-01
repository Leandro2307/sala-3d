// Percurso de parkour: fica na metade de trás da sala, subindo até o camarote VIP de frente para o telão.
// Cada plataforma: pos = centro do topo [x, yTopo, z], size = [largura x, profundidade z], h = espessura.

const C = {
  start: 0x34d399,
  a: 0x5eead4,
  b: 0x60a5fa,
  c: 0xa78bfa,
  d: 0xf472b6,
  e: 0x22d3ee,
  f: 0xfb7185,
  moving: 0xfbbf24,
  pad: 0xfb923c,
  checkpoint: 0xe2e8f0,
  balcony: 0x2a2f3d,
  finish: 0xfde047,
  teleport: 0x38bdf8,
};

export const COURSE = [
  { id: 'start', type: 'start', pos: [-27, 0.35, 6], size: [6, 6], h: 0.35, color: C.start, label: 'LARGADA' },

  // A — Degraus
  { pos: [-27, 1.6, 11.5], size: [3, 3], color: C.a },
  { pos: [-23, 2.9, 15], size: [3, 3], color: C.a },
  { pos: [-27.5, 4.1, 18.5], size: [2.6, 2.6], color: C.a },
  { pos: [-23.5, 5.2, 22], size: [2.4, 2.4], color: C.a },
  { pos: [-27, 6.2, 25.5], size: [2.2, 2.2], color: C.a },
  { id: 'cp1', type: 'checkpoint', pos: [-27, 6.6, 31], size: [5, 5], color: C.checkpoint, label: 'CHECKPOINT 1' },

  // B — Ponte e plataformas móveis
  { pos: [-18.5, 6.6, 33], size: [8, 0.9], color: C.b },
  { pos: [-9, 6.6, 33], size: [3, 3], color: C.moving, move: { axis: 'x', amp: 3.5, period: 4.5 } },
  { pos: [0, 7.4, 33], size: [2.6, 2.6], color: C.b },
  { pos: [6.5, 8.2, 33], size: [2.6, 2.6], color: C.moving, move: { axis: 'z', amp: 3, period: 3.8 } },
  { type: 'pad', pos: [13, 8.2, 33], size: [3, 3], color: C.pad, strength: 19 },
  { id: 'cp2', type: 'checkpoint', pos: [19, 13.2, 33], size: [4.5, 4.5], color: C.checkpoint, label: 'CHECKPOINT 2' },

  // C — Torre
  { pos: [25.5, 14.2, 28], size: [2.4, 2.4], color: C.c },
  { pos: [29.5, 15.2, 23.5], size: [2.2, 2.2], color: C.c },
  { pos: [25.5, 16.2, 19], size: [2, 2], color: C.c },
  { pos: [30, 16, 14], size: [3, 3], color: C.moving, move: { axis: 'y', amp: 2.2, period: 4 } },
  { pos: [25, 19.4, 9], size: [3, 3], color: C.c },
  { id: 'cp3', type: 'checkpoint', pos: [29.5, 20, 4.5], size: [4, 4], color: C.checkpoint, label: 'CHECKPOINT 3' },

  // D — Vigas finas sobre o vazio
  { pos: [25, 20.4, 0.5], size: [2, 2], color: C.e },
  { pos: [19.5, 20.8, -2], size: [6, 0.75], color: C.e }, // viga estreita
  { pos: [13.5, 21.2, -2], size: [2.2, 2.2], color: C.e },
  { pos: [8, 21.6, 1], size: [2, 2], color: C.moving, move: { axis: 'z', amp: 3.4, period: 4.2 } },
  { pos: [3, 22, 5], size: [1.9, 1.9], color: C.e },
  { id: 'cp4', type: 'checkpoint', pos: [-2, 22.4, 9], size: [4, 4], color: C.checkpoint, label: 'CHECKPOINT 4' },

  // E — Zigue-zague quebrado, cada vez menor
  { pos: [-7, 23, 12.5], size: [2, 2], color: C.f },
  { pos: [-11.5, 23.6, 16], size: [1.8, 1.8], color: C.f },
  { pos: [-16, 24.2, 12.5], size: [1.7, 1.7], color: C.moving, move: { axis: 'z', amp: 3, period: 3.4 } },
  { pos: [-20.5, 24.8, 16], size: [1.6, 1.6], color: C.f },
  { type: 'pad', pos: [-25, 24.8, 19.5], size: [2.8, 2.8], color: C.pad, strength: 17 },
  { id: 'cp5', type: 'checkpoint', pos: [-29, 27.2, 23.5], size: [4, 4], color: C.checkpoint, label: 'CHECKPOINT 5' },

  // F — Reta final até o camarote (descendo)
  { pos: [-29, 27.2, 28], size: [2.2, 2.2], color: C.d },
  { pos: [-24, 26.4, 31.5], size: [2.2, 2.2], color: C.moving, move: { axis: 'x', amp: 3.6, period: 4.6 } },
  { pos: [-18, 25.6, 34], size: [2, 2], color: C.d },
  { pos: [-12, 24.6, 36.5], size: [2, 2], color: C.d },

  // Camarote VIP
  { id: 'balcony', type: 'balcony', pos: [-4, 23, 36], size: [32, 8], h: 0.8, color: C.balcony },
  { id: 'finish', type: 'finish', pos: [-4, 23.15, 36.5], size: [4, 4], h: 0.15, color: C.finish, label: 'CHEGADA' },
  { type: 'teleport', pos: [-15, 23.15, 37.5], size: [2.6, 2.6], h: 0.15, color: C.teleport, target: [0, 0, -2], label: 'DESCER' },
];

// Quantos checkpoints o percurso tem (o HUD desenha um ponto para cada).
export const CHECKPOINT_COUNT = COURSE.filter((p) => p.type === 'checkpoint').length;

// Grade de proteção do camarote (deixa aberto o lado por onde se chega).
export const RAILS = [
  { pos: [-10, 24.1, 32.15], size: [20, 0.25], h: 1.1 },
  { pos: [-19.9, 24.1, 36], size: [0.25, 8], h: 1.1 },
];

// Camas elásticas de diversão na plateia (não fazem parte do percurso).
export const FUN_PADS = [
  { type: 'pad', pos: [-31, 0.25, -6], size: [3.2, 3.2], h: 0.25, color: C.pad, strength: 21 },
  { type: 'pad', pos: [31, 0.25, -6], size: [3.2, 3.2], h: 0.25, color: C.pad, strength: 21 },
];

export function startSpawn() {
  const s = COURSE[0];
  return { pos: [s.pos[0], s.pos[1], s.pos[2]], yaw: Math.PI };
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// Estado de uma corrida: largada → checkpoints → chegada.
export class ParkourRun {
  constructor(callbacks) {
    this.cb = callbacks;
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | ready | running
    this.time = 0;
    this.checkpoint = null;
    this.reached = new Set();
    this.quit = false; // desistiu: não volta a valer até pisar na largada de novo
  }

  // chamado todo frame com a superfície em que o jogador está pisando (ou null no ar)
  update(dt, ground) {
    const type = ground?.data?.type;
    if (this.state === 'running') this.time += dt;

    if (type === 'start') {
      if (this.state !== 'ready') {
        this.reset();
        this.state = 'ready';
        this.checkpoint = ground;
        this.cb.onReady?.();
      }
      return;
    }

    // desistiu: só volta a correr pisando na largada (tratado acima)
    if (this.quit) return;

    if (this.state === 'ready') {
      // saiu andando direto para o chão: não é uma corrida
      if (type === 'floor') {
        this.reset();
        this.cb.onCancel?.();
        return;
      }
      // saiu da largada pulando → começa a contar
      this.state = 'running';
      this.time = 0;
      this.cb.onStart?.();
    }

    if (this.state !== 'running' || !ground) return;

    if (type === 'checkpoint' && !this.reached.has(ground.data.id)) {
      this.reached.add(ground.data.id);
      this.checkpoint = ground;
      this.cb.onCheckpoint?.(ground.data);
    } else if (type === 'finish') {
      const t = this.time;
      this.state = 'idle';
      this.cb.onFinish?.(t);
    } else if (type === 'floor') {
      this.cb.onFall?.(this.checkpoint);
    }
  }

  cancel() {
    const was = this.state;
    this.reset();
    return was;
  }

  // Desistir no meio da corrida: para o cronômetro e devolve o jogador ao chão.
  // Sem isso, quem já pegou um checkpoint ficava preso — todo toque no chão o
  // teleportava de volta, e só terminando a corrida dava para sair.
  abandon() {
    if (this.state === 'idle') return false;
    this.reset();
    this.quit = true;
    this.cb.onAbandon?.();
    return true;
  }
}
