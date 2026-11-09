// Teclado e mouse do PC num jogo de controle (layouts PS5 e Switch, virtual: true). O emulador de
// Switch e o chiaki-ng só escutam o controle: o mouse de verdade andando no PC de quem compartilha
// não entrava no jogo (e o cursor do Windows saía passeando pela tela de lá). Aqui eles viram a
// fonte "teclado" do controle virtual (pad-virtual.js), como o toque faz no celular:
//
//   WASD: analógico esquerdo        mouse: analógico direito (pela velocidade)
//   Espaço / E / Q / F: os botões de baixo, direita, esquerda e cima (pela posição)
//   Shift: L1/L   R: R1/R   clique direito: L2/ZL   clique esquerdo: R2/ZR   meio: R3   V: L3
//   Tab: Create/−   Esc: Options/+   H: PS/Home   setas: direcional
//
// Tecla fora da lista continua indo como tecla (F11 do emulador, por exemplo). O mouse vai todo
// para o controle.

const BOTAO_TECLA = {
  Space: 0, KeyE: 1, Enter: 1, KeyQ: 2, KeyF: 3, ShiftLeft: 4, ShiftRight: 4, KeyR: 5,
  Tab: 8, Escape: 9, KeyV: 10, KeyH: 16,
  ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15,
};
const BOTAO_MOUSE = { left: 7, right: 6, middle: 11, x1: 4, x2: 5 };
const STICK = { KeyW: ['ly', -1], KeyS: ['ly', 1], KeyA: ['lx', -1], KeyD: ['lx', 1] };

// O mouse vira o analógico pela velocidade: soma o que andou na última JANELA_MS e, a VEL_CHEIA
// px/ms, o analógico vai até o fim. Raiz na curva: mirar devagar ainda mexe a câmera.
const JANELA_MS = 40;
const TICK_MS = 8;
const VEL_CHEIA = 1.6;
// Toque rápido numa tecla (ou o Esc que solta o ponteiro, que desce e sobe junto): o botão fica
// apertado pelo menos MIN_MS, senão o emulador podia nem ver.
const MIN_MS = 60;

export const DICA_TECLADO = {
  switch: 'WASD anda, o mouse mexe a câmera. Espaço B · E A · Q Y · F X · Shift L · R R · clique direito ZL · esquerdo ZR · Tab − · Esc + · H Home · setas: direcional.',
  ps5: 'WASD anda, o mouse mexe a câmera. Espaço ✕ · E ○ · Q □ · F △ · Shift L1 · R R1 · clique direito L2 · esquerdo R2 · Tab Create · Esc Options · H PS · setas: direcional.',
};

export class TecladoPad {
  constructor({ pad }) {
    this.pad = pad;
    this.ativo = false;
    this.zerar();
  }

  zerar() {
    clearInterval(this.tick);
    this.tick = 0;
    for (const t of this.timers?.values() || []) clearTimeout(t);
    this.timers = new Map(); // botão -> soltura adiada (MIN_MS)
    this.desceu = new Map(); // botão -> quando desceu
    this.fontes = new Map(); // botão -> quantas teclas/botões o seguram (Shift esq. e dir.)
    this.direcoes = new Set(); // códigos de WASD apertados
    this.b = 0;
    this.mov = []; // [t, dx, dy] da última JANELA_MS
    this.rx = 0;
    this.ry = 0;
  }

  ligar() {
    if (this.ativo) return;
    this.zerar();
    this.ativo = true;
  }

  desligar() {
    if (!this.ativo) return;
    this.ativo = false;
    this.zerar();
    this.pad.soltar('teclado');
  }

  soltarTudo() {
    if (!this.ativo) return;
    this.zerar();
    this.pad.soltar('teclado');
  }

  // um evento do controle.js (mandar/moverJogo): true se virou controle e não vai como tecla/mouse
  evento(ev) {
    if (!this.ativo) return false;
    if (ev.t === 'mouse') {
      if (ev.a === 'move') {
        if (ev.dx !== undefined) this.mover(ev.dx, ev.dy);
      } else {
        // o clique que prende o mouse de novo (depois de um Esc) não aperta nada
        if (ev.a === 'down' && !document.pointerLockElement) return true;
        const i = BOTAO_MOUSE[ev.b];
        if (i !== undefined) this.botao(`m:${ev.b}`, i, ev.a === 'down');
      }
      return true;
    }
    if (ev.t === 'wheel') return true;
    if (ev.t !== 'tecla') return false;
    const desce = ev.a === 'down';
    const s = STICK[ev.code];
    if (s) {
      if (desce) this.direcoes.add(ev.code);
      else this.direcoes.delete(ev.code);
      this.enviar();
      return true;
    }
    const i = BOTAO_TECLA[ev.code];
    if (i === undefined) return false;
    this.botao(ev.code, i, desce);
    return true;
  }

  botao(quem, i, desce) {
    const segura = this.fontes.get(i) || new Set();
    if (desce) segura.add(quem);
    else segura.delete(quem);
    this.fontes.set(i, segura);
    const bit = 1 << i;
    if (segura.size) {
      clearTimeout(this.timers.get(i));
      this.timers.delete(i);
      if (!(this.b & bit)) this.desceu.set(i, performance.now());
      this.b |= bit;
      return this.enviar();
    }
    if (!(this.b & bit) || this.timers.has(i)) return;
    const falta = (this.desceu.get(i) || 0) + MIN_MS - performance.now();
    const soltar = () => {
      this.timers.delete(i);
      if (this.fontes.get(i)?.size) return;
      this.b &= ~bit;
      this.enviar();
    };
    if (falta > 0) this.timers.set(i, setTimeout(soltar, falta));
    else soltar();
  }

  mover(dx, dy) {
    this.mov.push([performance.now(), dx, dy]);
    if (!this.tick) this.tick = setInterval(() => this.medir(), TICK_MS);
    this.medir();
  }

  medir() {
    const agora = performance.now();
    while (this.mov.length && agora - this.mov[0][0] > JANELA_MS) this.mov.shift();
    let sx = 0;
    let sy = 0;
    for (const [, dx, dy] of this.mov) { sx += dx; sy += dy; }
    const curva = (v) => {
      const a = Math.min(1, Math.abs(v / JANELA_MS) / VEL_CHEIA);
      return Math.sign(v) * Math.round(Math.sqrt(a) * 100) / 100;
    };
    this.rx = curva(sx);
    this.ry = curva(sy);
    if (!this.mov.length) {
      clearInterval(this.tick);
      this.tick = 0;
    }
    this.enviar();
  }

  enviar() {
    const tem = (c) => (this.direcoes.has(c) ? 1 : 0);
    let lx = tem('KeyD') - tem('KeyA');
    let ly = tem('KeyS') - tem('KeyW');
    if (lx && ly) { lx *= Math.SQRT1_2; ly *= Math.SQRT1_2; }
    const b = this.b;
    this.pad.definir('teclado', {
      b, lx, ly, rx: this.rx, ry: this.ry,
      lt: b & (1 << 6) ? 1 : 0, rt: b & (1 << 7) ? 1 : 0,
    });
  }
}
