// Teclado e mouse do PC num jogo de controle (layouts PS5 e Switch, virtual: true). O emulador de
// Switch e o chiaki-ng só escutam o controle: o mouse de verdade andando no PC de quem compartilha
// não entrava no jogo (e o cursor do Windows saía passeando pela tela de lá). Aqui eles viram a
// fonte "teclado" do controle virtual (pad-virtual.js), como o toque faz no celular:
//
//   WASD: analógico esquerdo        mouse: analógico direito (pela velocidade)
//   clique esquerdo: ✕   clique direito: ○   roda para baixo: □   roda para cima: △ (um toque por dente)
//   Espaço: ✕   Enter: ○   F: △ (pela posição: no Switch, B A X)
//   Shift: L1/L   Ctrl: R1/R   Q: L2/ZL   E: R2/ZR   meio: R3   V: L3
//   Tab: Create/−   Esc: Options/+   H: PS/Home   setas: direcional
//   Alt segurado: o mouse vira um dedo no touchpad (encosta no meio ao descer o Alt, sai ao soltar);
//   Alt + clique esquerdo afunda o touchpad. O touchpad só chega no PS5 direto (a ponte); o controle
//   de Xbox (emulador, chiaki-ng) não tem.
//
// Tecla fora da lista continua indo como tecla (F11 do emulador, por exemplo). O mouse vai todo
// para o controle.

const BOTAO_TECLA = {
  Space: 0, Enter: 1, KeyF: 3, ShiftLeft: 4, ShiftRight: 4, ControlLeft: 5, ControlRight: 5,
  KeyQ: 6, KeyE: 7, Tab: 8, Escape: 9, KeyV: 10, KeyH: 16,
  ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15,
};
const BOTAO_MOUSE = { left: 0, right: 1, middle: 11, x1: 4, x2: 5 };
// roda: rolando, o botão fica SEGURADO (para baixo □, para cima △) e solta RODA_SEGURA_MS depois do
// último dente — rolar sem parar é segurar o botão; um dente só é um toque de RODA_SEGURA_MS. Virar o
// lado solta um e aperta o outro na hora. (Antes cada dente era um toque, numa fila: atrasava e não
// dava para segurar.)
const RODA_BAIXO = 2;
const RODA_CIMA = 3;
const RODA_SEGURA_MS = 150; // maior que o intervalo entre dentes de quem rola devagar sem parar
// touchpad pelo mouse (Alt segurado): quantos pixels de mouse atravessam o touchpad de ponta a ponta
const TP_LARGURA_PX = 800;
const TP_ALTURA_PX = 450;
const TP_CLIQUE = 17;
const ALT = new Set(['AltLeft', 'AltRight']);
const STICK = { KeyW: ['ly', -1], KeyS: ['ly', 1], KeyA: ['lx', -1], KeyD: ['lx', 1] };

// O mouse vira o analógico pela velocidade: soma o que andou na última JANELA_MS e, a VEL_CHEIA
// px/ms, o analógico vai até o fim. Raiz na curva: mirar devagar ainda mexe a câmera.
// 24 ms (eram 40): o analógico parava/arrancava 40 ms depois do mouse. 24 ainda pega 3 relatórios de
// um mouse sem fio de 125 Hz, sem a câmera tremer.
const JANELA_MS = 24;
const TICK_MS = 8;
const VEL_CHEIA = 1.6;
// Toque rápido numa tecla (ou o Esc que solta o ponteiro, que desce e sobe junto): o botão fica
// apertado pelo menos MIN_MS, senão o emulador podia nem ver.
const MIN_MS = 60;

export const DICA_TECLADO = {
  switch: 'WASD anda, o mouse mexe a câmera. Clique esquerdo B · direito A · roda para baixo Y · para cima X · Shift L · Ctrl R · Q ZL · E ZR · Tab − · Esc + · H Home · setas: direcional.',
  ps5: 'WASD anda, o mouse mexe a câmera. Clique esquerdo ✕ · direito ○ · roda para baixo □ · para cima △ · Shift L1 · Ctrl R1 · Q L2 · E R2 · Alt + mouse: touchpad (Alt + clique afunda) · Tab Create · Esc Options · H PS · setas: direcional.',
};

export class TecladoPad {
  // sens(): a sensibilidade do mouse escolhida nas opções do modo jogo (1 = VEL_CHEIA)
  constructor({ pad, sens = () => 1 }) {
    this.pad = pad;
    this.sens = sens;
    this.ativo = false;
    this.zerar();
  }

  zerar() {
    clearInterval(this.tick);
    this.tick = 0;
    for (const t of this.timers?.values() || []) clearTimeout(t);
    clearTimeout(this.rodaT);
    this.rodaT = 0;
    this.rodaB = 0; // o bit do botão que a roda está apertando agora
    if (this.dedo) this.pad.touchpad(null);
    this.dedo = null; // {x, y} de 0 a 1: o dedo no touchpad enquanto o Alt está segurado
    this.cliqueTp = null; // o botão do mouse que afundou o touchpad (o "up" dele solta o touchpad)
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
        const quem = `m:${ev.b}`;
        // Alt + clique esquerdo: afunda o touchpad em vez do ✕ (vale até soltar o clique)
        if (ev.a === 'down' && this.dedo && ev.b === 'left') {
          this.cliqueTp = quem;
          this.botao(quem, TP_CLIQUE, true);
          return true;
        }
        if (ev.a === 'up' && this.cliqueTp === quem) {
          this.cliqueTp = null;
          this.botao(quem, TP_CLIQUE, false);
          return true;
        }
        const i = BOTAO_MOUSE[ev.b];
        if (i !== undefined) this.botao(quem, i, ev.a === 'down');
      }
      return true;
    }
    if (ev.t === 'wheel') {
      if (ev.dy && document.pointerLockElement) this.roda(ev.dy > 0 ? RODA_BAIXO : RODA_CIMA);
      return true;
    }
    if (ev.t !== 'tecla') return false;
    const desce = ev.a === 'down';
    if (ALT.has(ev.code)) {
      this.alt(desce);
      return true;
    }
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

  // um dente da roda: aperta o botão (ou mantém apertado) e adia a soltura
  roda(i) {
    clearTimeout(this.rodaT);
    if (this.rodaB !== 1 << i) {
      this.rodaB = 1 << i;
      this.enviar();
    }
    this.rodaT = setTimeout(() => {
      this.rodaT = 0;
      this.rodaB = 0;
      this.enviar();
    }, RODA_SEGURA_MS);
  }

  // Alt: encosta o dedo no meio do touchpad (e a câmera para) ou tira o dedo
  alt(desce) {
    if (desce) {
      if (this.dedo) return;
      this.dedo = { x: 0.5, y: 0.5 };
      this.mov = [];
      this.rx = 0;
      this.ry = 0;
      this.enviar();
    } else {
      if (!this.dedo) return;
      this.dedo = null;
      if (this.cliqueTp) {
        this.botao(this.cliqueTp, TP_CLIQUE, false);
        this.cliqueTp = null;
      }
    }
    this.pad.touchpad(this.dedo ? [this.dedo.x, this.dedo.y, -1, -1] : null);
  }

  mover(dx, dy) {
    if (this.dedo) {
      const preso = (v) => Math.min(1, Math.max(0, v));
      this.dedo = { x: preso(this.dedo.x + dx / TP_LARGURA_PX), y: preso(this.dedo.y + dy / TP_ALTURA_PX) };
      this.pad.touchpad([this.dedo.x, this.dedo.y, -1, -1]);
      return;
    }
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
    const cheia = VEL_CHEIA / (Number(this.sens()) || 1);
    const curva = (v) => {
      const a = Math.min(1, Math.abs(v / JANELA_MS) / cheia);
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
    const b = this.b | this.rodaB;
    this.pad.definir('teclado', {
      b, lx, ly, rx: this.rx, ry: this.ry,
      lt: b & (1 << 6) ? 1 : 0, rt: b & (1 << 7) ? 1 : 0,
    });
  }
}
