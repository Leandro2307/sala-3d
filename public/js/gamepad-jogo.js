// Controle de videogame (Xbox, PlayStation, genérico) no modo jogo: quem joga liga o controle no PC
// ou no celular (Bluetooth; o Safari do iPhone também lê) e joga no PC de quem compartilha sem
// instalar nada lá. O controle vira teclado e mouse, como o controle de toque (toque-jogo.js):
//   - analógico esquerdo: W A S D (até a borda para a frente, corre);
//   - analógico direito: o mouse (a câmera), com curva — devagar mira, no fundo gira rápido;
//   - botões: o mapa "pad" do layout do jogo na tela (Minecraft, God of War ou genérico).
// Tudo sai por controle.mandar/mover, com a marca de jogo: o ajudante do PC manda como scancode e
// movimento relativo. O controle é lido a cada quadro (requestAnimationFrame) só com o modo jogo ligado.

import { LAYOUTS, layoutDoTitulo, teclaDe, direcoesDoStick, lerSens } from './toque-jogo.js';

const ZONA = 0.15; // zona morta dos analógicos (controle gasto não fica andando sozinho)
const GATILHO = 0.35; // gatilho analógico apertado a partir daqui
const CAMERA = 1500; // pixels de mouse por segundo com o analógico direito no fundo (vezes a sensibilidade)
const MOVE_MS = 8;

// -1..1 com a zona morta tirada e a curva (ao quadrado: o meio do curso fica fino para mirar)
const curva = (v) => {
  const a = Math.abs(v);
  if (a < ZONA) return 0;
  const n = Math.min(1, (a - ZONA) / (1 - ZONA));
  return Math.sign(v) * n * n;
};

export class ControleFisico {
  constructor({ controle, toast, onAtivo }) {
    this.controle = controle;
    this.toast = toast || (() => {});
    this.onAtivo = onAtivo; // (true|false): o controle está sendo usado (o celular esconde os botões da tela)
    this.key = null;
    this.layoutId = 'generico';
    this.antes = []; // botões apertados na leitura anterior
    this.seguras = new Map(); // tecla/botão -> quantos seguram (o analógico e um botão podem ser o mesmo Shift)
    this.travadas = new Set(); // teclas de "trava:" ligadas
    this.doStick = new Set();
    this.resto = { x: 0, y: 0 };
    this.t = 0;
    this.raf = 0;
    this.usado = false;
    addEventListener('gamepadconnected', (e) => {
      this.toast(`Controle conectado: ${String(e.gamepad.id).replace(/\(.*\)/, '').trim() || 'controle'}. No modo jogo ele anda, mira e aperta os botões do jogo.`, 'info', 5000);
      if (this.key) this.rodar();
    });
    addEventListener('gamepaddisconnected', () => {
      if (!this.pad()) this.soltarTudo();
    });
  }

  // o primeiro controle ligado (no mapa padrão, de preferência)
  pad() {
    const lista = [...(navigator.getGamepads?.() || [])].filter((g) => g?.connected);
    return lista.find((g) => g.mapping === 'standard') || lista[0] || null;
  }

  // modo jogo ligado numa tela (titulo: o nome do jogo que a sala reconheceu nela)
  ligar(key, titulo) {
    this.key = key;
    this.layoutId = layoutDoTitulo(titulo);
    this.rodar();
  }

  jogoDaTela(key, titulo) {
    if (key !== this.key) return;
    const id = layoutDoTitulo(titulo);
    if (id === this.layoutId) return;
    this.soltarTudo();
    this.layoutId = id;
  }

  desligar() {
    this.soltarTudo();
    this.key = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  rodar() {
    if (this.raf || !this.key || !navigator.getGamepads) return;
    this.t = performance.now();
    const passo = (agora) => {
      this.raf = 0;
      if (!this.key) return;
      this.ler(Math.min(0.05, (agora - this.t) / 1000));
      this.t = agora;
      this.raf = requestAnimationFrame(passo);
    };
    this.raf = requestAnimationFrame(passo);
  }

  ler(dt) {
    const g = this.pad();
    if (!g) return;
    const L = LAYOUTS[this.layoutId] || LAYOUTS.generico;
    const mapa = L.pad || LAYOUTS.generico.pad;
    const agora = g.buttons.map((b, i) => (i === 6 || i === 7 ? b.value > GATILHO || b.pressed : b.pressed));
    let mexeu = false;
    agora.forEach((ap, i) => {
      if (ap === !!this.antes[i]) return;
      mexeu = true;
      const acao = mapa[i];
      if (acao) this.botao(acao, ap);
    });
    this.antes = agora;
    // analógico esquerdo: as teclas de andar
    const quer = direcoesDoStick(g.axes[0] || 0, g.axes[1] || 0, L.correr || 'ShiftLeft');
    for (const c of [L.correr || 'ShiftLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      if (quer.has(c) && !this.doStick.has(c)) {
        this.doStick.add(c);
        this.apertar(c);
        mexeu = true;
      } else if (!quer.has(c) && this.doStick.has(c)) {
        this.doStick.delete(c);
        this.largar(c);
      }
    }
    // analógico direito: a câmera
    const sens = lerSens();
    const x = curva(g.axes[2] || 0) * CAMERA * sens * dt + this.resto.x;
    const y = curva(g.axes[3] || 0) * CAMERA * sens * dt + this.resto.y;
    const dx = Math.round(x);
    const dy = Math.round(y);
    this.resto = { x: x - dx, y: y - dy };
    if (dx || dy) {
      mexeu = true;
      this.controle.mover(this.key, { t: 'mouse', a: 'move', dx, dy, b: 'left', arrastando: false, mod: 0 }, MOVE_MS);
    }
    if (mexeu && !this.usado) {
      this.usado = true;
      this.onAtivo?.(true);
    }
  }

  // uma ação do mapa: 'KeyE', 'mouse:left', 'roda:1' ou 'trava:ShiftLeft'
  botao(acao, desce) {
    if (acao.startsWith('roda:')) {
      if (desce) this.controle.mandar(this.key, { t: 'wheel', x: 0.5, y: 0.5, dx: 0, dy: Number(acao.slice(5)) * 100, mod: 0 });
      return;
    }
    if (acao.startsWith('trava:')) {
      if (!desce) return;
      const p = acao.slice(6);
      if (this.travadas.delete(p)) this.largar(p);
      else {
        this.travadas.add(p);
        this.apertar(p);
      }
      return;
    }
    if (desce) this.apertar(acao);
    else this.largar(acao);
  }

  apertar(p) {
    const n = (this.seguras.get(p) || 0) + 1;
    this.seguras.set(p, n);
    if (n === 1) this.enviar(p, true);
  }

  largar(p) {
    const n = (this.seguras.get(p) || 0) - 1;
    if (n > 0) return void this.seguras.set(p, n);
    if (!this.seguras.delete(p)) return;
    this.enviar(p, false);
  }

  enviar(p, desce) {
    if (!this.key) return;
    const a = desce ? 'down' : 'up';
    if (p.startsWith('mouse:')) return void this.controle.mandar(this.key, { t: 'mouse', a, x: 0.5, y: 0.5, b: p.slice(6), n: 1, mod: 0 });
    const t = teclaDe(p);
    this.controle.mandar(this.key, { t: 'tecla', a, key: t.key, code: p, kc: t.kc, mod: 0 });
  }

  // solta tudo o que o controle segura (sair do modo jogo, trocar de jogo, aba escondida)
  soltarTudo() {
    for (const p of this.seguras.keys()) this.enviar(p, false);
    this.seguras.clear();
    this.travadas.clear();
    this.doStick.clear();
    this.antes = [];
    this.resto = { x: 0, y: 0 };
    if (this.usado) {
      this.usado = false;
      this.onAtivo?.(false);
    }
  }
}
