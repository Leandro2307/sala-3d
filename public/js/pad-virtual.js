// Controle virtual (PS5 e jogos de controle): em vez de virar teclado e mouse, o controle de quem
// joga vira um controle de Xbox de verdade no PC de quem compartilha (ajudante 1.9+, driver
// ViGEmBus). O chiaki-ng — o Remote Play do PS5 no PC — vê esse controle como um dele e o PS5
// recebe ✕ ○ □ △, analógicos e gatilhos analógicos, sem conversão nenhuma.
//
// Duas fontes alimentam o mesmo controle: o controle de toque (layout "PS5" do toque-jogo.js) e o
// controle de videogame ligado no aparelho de quem joga (gamepad-jogo.js). Os botões somam e, em
// cada analógico/gatilho, vale a fonte mais empurrada.
//
// Vai o estado inteiro {t:'pad', b, lx, ly, rx, ry, lt, rt}, só quando muda e no máximo um a cada
// ENVIO_MS (o último sempre sai). b: o bit i é o botão i do mapa padrão do navegador (0 ✕/A, 1 ○/B,
// 2 □/X, 3 △/Y, 4 L1, 5 R1, 6 L2, 7 R2, 8 Create, 9 Options, 10 L3, 11 R3, 12-15 setas, 16 PS).
// O "vivo" do modo jogo (controle.js) segura o estado no ajudante: sem notícia, ele solta tudo.

const ENVIO_MS = 12;
const NEUTRO = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
const EIXOS = ['lx', 'ly', 'rx', 'ry', 'lt', 'rt'];
const arred = (v) => Math.round(v * 1000) / 1000;

export class PadVirtual {
  constructor({ controle }) {
    this.controle = controle;
    this.key = null;
    this.fontes = { toque: { ...NEUTRO }, fisico: { ...NEUTRO } };
    this.enviado = { ...NEUTRO };
    this.ultimo = 0;
    this.timer = 0;
  }

  ligar(key) {
    if (this.key && this.key !== key) this.desligar();
    this.key = key;
  }

  desligar() {
    if (!this.key) return;
    this.fontes = { toque: { ...NEUTRO }, fisico: { ...NEUTRO } };
    this.enviar(true);
    this.key = null;
  }

  // ------------------------------------------------------------ controle de toque
  botao(i, desce) {
    const f = this.fontes.toque;
    f.b = desce ? f.b | (1 << i) : f.b & ~(1 << i);
    // L2/R2 da tela: gatilho inteiro (no controle de verdade ele é analógico)
    if (i === 6) f.lt = desce ? 1 : 0;
    if (i === 7) f.rt = desce ? 1 : 0;
    this.mudou();
  }

  stick(lado, x, y) {
    const f = this.fontes.toque;
    f[`${lado}x`] = arred(x);
    f[`${lado}y`] = arred(y);
    this.mudou();
  }

  // ------------------------------------------------------------ controle de videogame
  // g: o Gamepad do navegador. Zona morta pequena: o chiaki-ng e o jogo têm a deles.
  fisico(g) {
    const eixo = (v) => (Math.abs(v || 0) < 0.08 ? 0 : arred(v));
    let b = 0;
    g.buttons.forEach((x, i) => { if (i < 17 && x.pressed) b |= 1 << i; });
    const f = this.fontes.fisico;
    Object.assign(f, {
      b,
      lx: eixo(g.axes[0]), ly: eixo(g.axes[1]), rx: eixo(g.axes[2]), ry: eixo(g.axes[3]),
      lt: arred(g.buttons[6]?.value || 0), rt: arred(g.buttons[7]?.value || 0),
    });
    this.mudou();
  }

  soltar(fonte) {
    this.fontes[fonte] = { ...NEUTRO };
    this.mudou();
  }

  // ------------------------------------------------------------ envio
  estado() {
    const { toque: a, fisico: b } = this.fontes;
    const e = { b: a.b | b.b };
    for (const k of EIXOS) e[k] = Math.abs(a[k]) >= Math.abs(b[k]) ? a[k] : b[k];
    return e;
  }

  mudou() {
    if (!this.key || this.timer) return;
    const falta = this.ultimo + ENVIO_MS - performance.now();
    if (falta <= 0) this.enviar();
    else this.timer = setTimeout(() => this.enviar(), falta);
  }

  enviar(sempre = false) {
    clearTimeout(this.timer);
    this.timer = 0;
    if (!this.key) return;
    const e = this.estado();
    if (!sempre && e.b === this.enviado.b && EIXOS.every((k) => e[k] === this.enviado[k])) return;
    this.enviado = e;
    this.ultimo = performance.now();
    this.controle.mandar(this.key, { t: 'pad', ...e });
  }
}
