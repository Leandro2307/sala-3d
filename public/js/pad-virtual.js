// Controle virtual (PS5 e jogos de controle): em vez de virar teclado e mouse, o controle de quem
// joga vira um controle de Xbox de verdade no PC de quem compartilha (ajudante 1.9+, driver
// ViGEmBus). O chiaki-ng — o Remote Play do PS5 no PC — vê esse controle como um dele e o PS5
// recebe ✕ ○ □ △, analógicos e gatilhos analógicos, sem conversão nenhuma.
//
// Três fontes alimentam o mesmo controle: o controle de toque (layout "PS5" do toque-jogo.js), o
// giroscópio do celular (mirar virando o aparelho: vira o analógico direito) e o controle de
// videogame ligado no aparelho de quem joga (gamepad-jogo.js). Os botões somam e, em cada
// analógico/gatilho, vale a fonte mais empurrada.
//
// Vai o estado inteiro {t:'pad', b, lx, ly, rx, ry, lt, rt}, só quando muda e no máximo um a cada
// ENVIO_MS (o último sempre sai). b: o bit i é o botão i do mapa padrão do navegador (0 ✕/A, 1 ○/B,
// 2 □/X, 3 △/Y, 4 L1, 5 R1, 6 L2, 7 R2, 8 Create, 9 Options, 10 L3, 11 R3, 12-15 setas, 16 PS).
// O "vivo" do modo jogo (controle.js) segura o estado no ajudante: sem notícia, ele solta tudo.
//
// Na volta, a vibração (tremor): o jogo manda o controle tremer, o ajudante 1.10+ fica sabendo e a
// sala de quem compartilha repassa. Treme o controle ligado neste aparelho, se tiver um que vibra;
// senão, o celular (navigator.vibrate: só Android — o Safari do iPhone não deixa site vibrar).

import { opcoesJogo } from './jogo-opcoes.js';

const ENVIO_MS = 12;
const NEUTRO = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
const EIXOS = ['lx', 'ly', 'rx', 'ry', 'lt', 'rt'];
const FONTES = ['toque', 'giro', 'fisico', 'teclado'];
const arred = (v) => Math.round(v * 1000) / 1000;
const entre = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// Vibração: o celular só liga e desliga o motor, então a força vira pulsos — em cada PULSO_MS, o
// motor fica ligado a parte da força. Cada ordem vale TREMOR_DURA ms e é renovada enquanto o jogo
// manda tremer; sem notícia por TREMOR_MAX ms (a conexão caiu), para.
const PULSO_MS = 60;
const TREMOR_DURA = 1500;
const TREMOR_RENOVA = 1200;
const TREMOR_MAX = 15000;

export class PadVirtual {
  constructor({ controle }) {
    this.controle = controle;
    this.key = null;
    this.fontes = this.neutras();
    this.enviado = { ...NEUTRO };
    this.ultimo = 0;
    this.timer = 0;
    this.gpIndice = null; // o controle de videogame deste aparelho (para a vibração)
    this.tremendo = null; // { g, p, desde }
    this.tremorTimer = 0;
    opcoesJogo.ouvir((k, v) => { if (k === 'vibrar' && !v) this.pararTremor(); });
  }

  neutras() {
    return Object.fromEntries(FONTES.map((f) => [f, { ...NEUTRO }]));
  }

  ligar(key) {
    if (this.key && this.key !== key) this.desligar();
    this.key = key;
  }

  // Manda o estado (solto) mesmo sem mudança: o ajudante cria o controle de Xbox já no primeiro
  // estado. Num layout de controle, logo no começo — o emulador de Switch só deixa ligar o Jogador 1
  // num controle que existe.
  acordar() {
    if (this.key) this.enviar(true);
  }

  desligar() {
    this.pararTremor();
    if (!this.key) return;
    // só solta se algo foi apertado: o "solto" mandado à toa criava um controle de Xbox no PC de lá
    // no fim de qualquer modo jogo, até no Minecraft
    const apertado = this.enviado.b || EIXOS.some((k) => this.enviado[k]);
    this.fontes = this.neutras();
    if (apertado) this.enviar(true);
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

  // ------------------------------------------------------------ giroscópio (analógico direito)
  // x, y de -1 a 1, já com a zona morta do jogo descontada (ver toque-jogo.js). Em degraus de 0,02:
  // o giroscópio muda todo evento, e o tremido da mão não precisa ir pela rede.
  giro(x, y) {
    const q = (v) => Math.round(v * 50) / 50;
    const f = this.fontes.giro;
    f.rx = q(x);
    f.ry = q(y);
    this.mudou();
  }

  // ------------------------------------------------------------ controle de videogame
  // g: o Gamepad do navegador. Zona morta pequena: o chiaki-ng e o jogo têm a deles.
  fisico(g) {
    const eixo = (v) => (Math.abs(v || 0) < 0.08 ? 0 : arred(v));
    let b = 0;
    g.buttons.forEach((x, i) => { if (i < 17 && x.pressed) b |= 1 << i; });
    this.gpIndice = g.index;
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

  // ------------------------------------------------------------ teclado e mouse do PC (teclado-pad.js)
  definir(fonte, e) {
    this.fontes[fonte] = { ...NEUTRO, ...e };
    this.mudou();
  }

  // ------------------------------------------------------------ vibração (o jogo mandou tremer)
  // g: motor grande (o tranco), p: motor pequeno (o zumbido), de 0 a 1
  // Devolve como tremeu ('controle', 'celular', 'nada', 'desligado', 'parou'), para o relatório.
  tremor(g, p) {
    if (!this.key) return 'sem-jogo';
    if (!opcoesJogo.get('vibrar')) return 'desligado';
    g = entre(g);
    p = entre(p);
    if (g < 0.05 && p < 0.05) {
      this.pararTremor();
      return 'parou';
    }
    // O emulador de Switch traduz a vibração HD em valores bem baixos (teste de 2026-11-09: 0,07 e
    // 0,13), que no controle mal se sentem. Reforço: qualquer tremor sai com pelo menos ~40% e a
    // curva (raiz) sobe os fracos sem estourar os fortes.
    const reforco = (v) => (v < 0.05 ? 0 : Math.min(1, 0.35 + 0.65 * Math.sqrt(v)));
    g = reforco(g);
    p = reforco(p);
    this.tremendo = { g, p, desde: performance.now() };
    return this.vibrar();
  }

  // o controle de videogame deste aparelho: o ligado agora (o índice guardado pode ter mudado ao
  // reconectar o Bluetooth), de preferência o que está sendo usado
  gamepad() {
    const lista = [...(navigator.getGamepads?.() || [])].filter((g) => g?.connected);
    return lista.find((g) => g.index === this.gpIndice) || lista.find((g) => g.mapping === 'standard') || lista[0] || null;
  }

  // como esse controle vibra: vibrationActuator (Chrome e Safari) ou hapticActuators (o jeito antigo,
  // Firefox e Safaris velhos). null: o navegador não deixa o site vibrar o controle.
  atuador() {
    const g = this.gamepad();
    if (!g) return null;
    const v = g.vibrationActuator;
    if (v?.playEffect) return { tipo: 'efeito', a: v };
    const h = g.hapticActuators?.[0];
    if (h?.pulse) return { tipo: 'pulso', a: h };
    return null;
  }

  // o que o navegador oferece para vibrar (vai no relatório quando o primeiro tremor chega)
  comoVibra() {
    const g = this.gamepad();
    return {
      controle: g ? String(g.id).slice(0, 60) : null,
      vibrationActuator: g ? (g.vibrationActuator ? (g.vibrationActuator.effects || g.vibrationActuator.type || 'sim') : 'não tem') : null,
      hapticActuators: g ? (g.hapticActuators?.length || 0) : null,
      navigatorVibrate: !!navigator.vibrate,
    };
  }

  vibrar() {
    clearTimeout(this.tremorTimer);
    const t = this.tremendo;
    if (!t || performance.now() - t.desde > TREMOR_MAX) {
      this.pararTremor();
      return 'parou';
    }
    const at = this.atuador();
    let como = 'controle';
    if (at?.tipo === 'efeito') {
      const a = at.a;
      // 'dual-rumble' é o efeito de todo controle; alguns navegadores só dizem o que têm em effects
      const efeito = Array.isArray(a.effects) && a.effects.length && !a.effects.includes('dual-rumble') ? a.effects[0] : 'dual-rumble';
      a.playEffect(efeito, { duration: TREMOR_DURA, startDelay: 0, strongMagnitude: t.g, weakMagnitude: t.p })
        .catch((err) => { if (!this.erroTremor) { this.erroTremor = String(err?.message || err); this.onErroTremor?.(this.erroTremor); } });
    } else if (at?.tipo === 'pulso') {
      at.a.pulse(Math.max(t.g, t.p), TREMOR_DURA)?.catch?.(() => {});
    } else if (navigator.vibrate) {
      como = 'celular';
      // no celular o motor pequeno conta menos: ele é o zumbido fino, que o celular não tem
      const forca = Math.max(t.g, t.p * 0.6);
      const liga = Math.max(10, Math.round(PULSO_MS * forca));
      if (liga >= PULSO_MS - 6) navigator.vibrate(TREMOR_DURA);
      else navigator.vibrate(Array.from({ length: Math.ceil(TREMOR_DURA / PULSO_MS) * 2 }, (_, i) => (i % 2 ? PULSO_MS - liga : liga)));
    } else return 'nada';
    this.tremorTimer = setTimeout(() => this.vibrar(), TREMOR_RENOVA);
    return como;
  }

  pararTremor() {
    clearTimeout(this.tremorTimer);
    this.tremorTimer = 0;
    if (!this.tremendo) return;
    this.tremendo = null;
    const at = this.atuador();
    if (at?.tipo === 'efeito') at.a.reset?.()?.catch?.(() => {});
    navigator.vibrate?.(0);
  }

  // ------------------------------------------------------------ envio
  estado() {
    const fs = FONTES.map((k) => this.fontes[k]);
    const e = { b: fs.reduce((b, f) => b | f.b, 0) };
    for (const k of EIXOS) e[k] = fs.reduce((v, f) => (Math.abs(f[k]) > Math.abs(v) ? f[k] : v), 0);
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
