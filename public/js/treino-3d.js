// Treino dos controles do GTA 6 no /jogar: um mini mapa 3D (a praia de Vice City ao pôr do sol) com o boneco da
// sala, em que cada estação pede um comando do jogo e só anda quando a pessoa faz. Pedido de 2026-11-27: "o
// tutorial quero algo mais visual... X pula, O agacha... veja o que o GTA 6 faz em cada e recrie um tutorial real".
//
// Os comandos são os padrão do GTA 6 no PS5 (esquema "Padrão", guias de nov/2026): L3 corre (de novo: dispara),
// ✕ pula e escala, ○ agacha (de novo levanta), □ soco, L2 mira e R2 atira, R1 se protege, △ entra e sai do carro;
// no carro R2 acelera, L2 freia e dá ré, o analógico esquerdo vira e ✕ é o freio de mão.
//
// Nada vai para o PS5 enquanto o treino está aberto: o controle virtual fica em treino (pad-virtual.js, treinar) e o
// estado vem para cá — o mesmo do tutorial antigo (tutorial-controle.js). Pular (botão, P ou Esc) leva à tela "Tudo
// pronto", e é o "Começar" dela que fecha o treino; no teste grátis, os 2 minutos só correm depois dele (jogar.js
// seguraNoPreparo). Se o diagnóstico da conexão ainda estiver rodando, o "Começar" espera por ele e entra sozinho.
//
// O three.js e o boneco (avatars.js) só são baixados quando o treino abre: o /jogar continua leve para quem não usa.

import { teclasDe } from './mapa-teclas.js';

const B = { xis: 0, bol: 1, qua: 2, tri: 3, l1: 4, r1: 5, l2: 6, r2: 7, l3: 10, r3: 11 };
const bit = (n) => 1 << B[n];

const GLIFO = {
  xis: '<span class="t3-g t3-xis">✕</span>',
  bol: '<span class="t3-g t3-bol">○</span>',
  qua: '<span class="t3-g t3-qua">□</span>',
  tri: '<span class="t3-g t3-tri">△</span>',
  l1: '<span class="t3-pill">L1</span>', r1: '<span class="t3-pill">R1</span>',
  l2: '<span class="t3-pill">L2</span>', r2: '<span class="t3-pill">R2</span>',
  l3: '<span class="t3-pill">L3</span>', r3: '<span class="t3-pill">R3</span>',
  stickE: '<span class="t3-stick"><i></i></span>',
  stickD: '<span class="t3-stick t3-dir"><i></i></span>',
};
// o id do botão no mapa de teclas (mapa-teclas.js), para mostrar a tecla de quem joga no teclado
const ID_TECLA = { xis: 'b0', bol: 'b1', qua: 'b2', tri: 'b3', l1: 'b4', r1: 'b5', l2: 'b6', r2: 'b7', l3: 'b10', r3: 'b11' };

// As estações, na ordem do caminho (o mapa vai de z = 0 para a frente)
const LICOES = [
  { id: 'andar', nome: 'Andar', botoes: ['stickE'], tecla: 'W A S D', txt: 'Ande até o círculo amarelo com o <b>analógico esquerdo</b>.', toque: ['stick'] },
  { id: 'olhar', nome: 'Câmera', botoes: ['stickD'], tecla: 'mouse', txt: 'Olhe em volta com o <b>analógico direito</b>.', toque: [] },
  { id: 'correr', nome: 'Correr', botoes: ['l3'], txt: 'Aperte <b>L3</b> (clique do analógico esquerdo) e corra até o círculo. Aperte de novo para disparar.', toque: [] },
  { id: 'pular', nome: 'Pular', botoes: ['xis'], txt: 'Aperte <b>✕</b> para pular o muro. No GTA 6 o ✕ também escala.', toque: ['xis'] },
  { id: 'agachar', nome: 'Agachar', botoes: ['bol'], txt: 'Aperte <b>○</b> para agachar e passe por baixo da barreira. ○ de novo levanta.', toque: ['bol'] },
  { id: 'soco', nome: 'Soco', botoes: ['qua'], txt: 'Chegue no saco de pancada e dê <b>3 socos</b> com o <b>□</b>.', toque: ['qua'] },
  { id: 'mirar', nome: 'Mirar e atirar', botoes: ['l2', 'r2'], txt: 'Segure <b>L2</b> para mirar e aperte <b>R2</b> para atirar. Derrube os 3 alvos.', toque: ['l2', 'r2'] },
  { id: 'cobertura', nome: 'Proteger-se', botoes: ['r1'], txt: 'Encoste no muro baixo e aperte <b>R1</b> para se proteger atrás dele.', toque: ['r1'] },
  { id: 'entrar', nome: 'Entrar no carro', botoes: ['tri'], txt: 'Vá até o carro e aperte <b>△</b> para entrar.', toque: ['tri'] },
  { id: 'dirigir', nome: 'Dirigir', botoes: ['r2', 'l2', 'stickE'], txt: '<b>R2</b> acelera, <b>L2</b> freia e dá ré, o <b>analógico esquerdo</b> vira. Passe pelo arco de chegada.', toque: ['r2', 'l2'] },
  { id: 'sair', nome: 'Sair do carro', botoes: ['tri'], txt: 'Aperte <b>△</b> para sair do carro.', toque: ['tri'] },
];

// a cola da tela "Tudo pronto": os comandos do GTA 6 que o treino não pede um a um
const COLA = [
  ['l3', 'Correr / disparar'], ['xis', 'Pular e escalar'], ['bol', 'Agachar'], ['qua', 'Soco'],
  ['tri', 'Entrar e sair do carro'], ['l2', 'Mirar (no carro: freio e ré)'], ['r2', 'Atirar (no carro: acelerar)'], ['r1', 'Proteger-se'],
  ['l1', 'Guardar a arma; segure: roda de armas'], ['r3', 'Olhar para trás'],
];
const COLA_EXTRA = '<b>↑</b> celular · <b>↓</b> objetivo · <b>touchpad</b> mapa · segurar <b>←</b> rádio';

const CSS = `
#treino3d{position:absolute;inset:0;z-index:1;pointer-events:none;background:#1a0b2e}
#treino3d canvas{display:block;width:100%;height:100%}
#treino3d-hud{position:absolute;inset:0;z-index:6;pointer-events:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff}
.t3-card{position:absolute;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);width:min(560px,calc(100% - 24px));box-sizing:border-box;padding:12px 16px 12px;border-radius:16px;background:linear-gradient(180deg,rgba(26,11,46,.92),rgba(40,14,60,.9));border:1px solid rgba(255,61,139,.45);box-shadow:0 14px 40px rgba(0,0,0,.45);transition:border-color .2s,background .2s}
.t3-card::before{content:'';position:absolute;left:14px;right:14px;top:0;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,#ff3d8b,#ff8a3d 45%,#9b5cff 80%,#33e1ff)}
.t3-card.ok{border-color:#34d399;background:rgba(9,38,27,.94)}
.t3-topo{display:flex;align-items:center;gap:10px;font-size:12px;color:#d9c7ee}
.t3-topo .t3-n{font-weight:800;letter-spacing:.06em;color:#ff8a3d}
.t3-topo button{margin-left:auto;pointer-events:auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font:600 12px/1 inherit;cursor:pointer}
.t3-topo button kbd{font:700 10px/1 system-ui;background:rgba(255,255,255,.14);border-radius:4px;padding:2px 4px;margin-left:3px}
.t3-tit{display:flex;align-items:center;gap:12px;margin:6px 0 4px;font-size:22px;font-weight:800}
.t3-card.ok .t3-tit{color:#34d399}
.t3-botoes{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.t3-k{font:700 13px/1 'JetBrains Mono',ui-monospace,monospace;background:#fff;color:#1a0b2e;border-radius:6px;padding:5px 7px;box-shadow:0 2px 0 #b9a6d6}
.t3-txt{margin:0;font-size:14px;line-height:1.45;color:#eee3fa}
.t3-txt b{color:#fff}
.t3-barra{height:4px;margin-top:10px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}
.t3-barra i{display:block;height:100%;background:linear-gradient(90deg,#ff3d8b,#ff8a3d);transition:width .3s}
.t3-g{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#14101f;border:2px solid currentColor;font-size:17px;font-weight:700;line-height:1}
.t3-xis{color:#7fb2ff}.t3-bol{color:#ff6b7f}.t3-qua{color:#ff8ad8}.t3-tri{color:#3fe0b0}
.t3-pill{display:inline-grid;place-items:center;min-width:34px;height:26px;padding:0 6px;border-radius:8px;background:#14101f;border:2px solid #c8b8e6;font:800 12px/1 system-ui;color:#fff;box-sizing:border-box}
.t3-stick{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#14101f;border:2px solid #c8b8e6;box-sizing:border-box}
.t3-stick i{width:12px;height:12px;border-radius:50%;background:#c8b8e6;animation:t3-mexe 1.4s ease-in-out infinite}
.t3-dir i{animation-name:t3-mexe-d}
@keyframes t3-mexe{0%,100%{transform:translateY(-5px)}50%{transform:translateY(5px)}}
@keyframes t3-mexe-d{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
.t3-mais{color:#b9a6d6;font-size:13px}
.t3-mira{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.t3-mira::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#ff3d8b}
.t3-mira[hidden]{display:none}
.t3-dica{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(10,6,20,.78);font-size:13px;color:#f3e9ff;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}
.t3-dica[hidden]{display:none}
.t3-diag{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(10,6,20,.8);border:1px solid rgba(255,255,255,.14);font-size:12px;color:#e8dcf7;max-width:calc(100% - 24px)}
.t3-diag[hidden]{display:none}
.t3-diag .t3-gira{width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:#ff8a3d;animation:t3-gira .8s linear infinite;flex:none}
.t3-diag.ok{border-color:rgba(52,211,153,.5)}
@keyframes t3-gira{to{transform:rotate(360deg)}}
.t3-pronto{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:rgba(10,4,22,.72);pointer-events:auto;overflow:auto}
.t3-pronto-caixa{width:min(620px,100%);box-sizing:border-box;padding:22px 22px 20px;border-radius:20px;background:linear-gradient(180deg,#1d0c36,#2a0f45);border:1px solid rgba(255,61,139,.5);box-shadow:0 24px 64px rgba(0,0,0,.6);text-align:center}
.t3-pronto h2{margin:0 0 4px;font-size:28px;font-weight:800;background:linear-gradient(90deg,#ff3d8b,#ff8a3d 50%,#ffd23d);-webkit-background-clip:text;background-clip:text;color:transparent}
.t3-pronto p{margin:0 0 14px;color:#d9c7ee;font-size:14px}
.t3-cola{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;margin:0 0 10px;text-align:left}
.t3-cola div{display:flex;align-items:center;gap:8px;font-size:13px;color:#f1e8fb;min-width:0}
.t3-cola .t3-g{width:24px;height:24px;font-size:13px;flex:none}.t3-cola .t3-pill{height:22px;min-width:30px;font-size:11px;flex:none}
.t3-cola .t3-k{font-size:11px;padding:3px 5px;flex:none}
.t3-extra{font-size:12px;color:#b9a6d6;margin:0 0 14px}
.t3-estado{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 14px;font-size:13px;color:#e8dcf7}
.t3-comecar{pointer-events:auto;width:100%;height:56px;border:0;border-radius:999px;background:linear-gradient(90deg,#f0287a,#ff6b35);color:#fff;font:800 19px/1 'Plus Jakarta Sans',system-ui,sans-serif;box-shadow:0 8px 26px rgba(255,61,139,.4);cursor:pointer}
.t3-comecar:hover{filter:brightness(1.07)}
.t3-comecar.esperando{background:#3a2458;box-shadow:none}
.t3-pronto small{display:block;margin-top:8px;color:#b9a6d6;font-size:12px}
.t3-carregando{position:absolute;inset:0;display:grid;place-items:center;font-size:16px;color:#e8dcf7}
@media (max-width:560px),(max-height:480px){.t3-tit{font-size:17px;margin:4px 0 2px}.t3-txt{font-size:12.5px}.t3-card{padding:9px 12px}.t3-cola{grid-template-columns:1fr 1fr;gap:4px 8px}.t3-cola div{font-size:11.5px}.t3-pronto h2{font-size:22px}.t3-pronto-caixa{padding:14px}}
body.touch .t3-card{width:min(380px,calc(100% - 250px));left:max(12px,env(safe-area-inset-left));transform:none}
body.touch .t3-dica{bottom:auto;top:50%}
`;
let estilo = null;

// ------------------------------------------------------------------ o mundo
const LIM_X = 9.4;
const ALT_EM_PE = 1.8;
const ALT_AGACHADO = 1.05;
const RAIO = 0.35;
// muros (caixas): { x0, x1, y0, y1, z0, z1 } — a pé, o corpo bate nas caixas que ele cruza na altura
const MURO_PULO = { x0: -LIM_X, x1: LIM_X, y0: 0, y1: 0.8, z0: 30, z1: 30.6 };
const BARREIRA = { x0: -LIM_X, x1: LIM_X, y0: 1.2, y1: 2.6, z0: 36, z1: 40 };
const COBERTURA = { x0: -2.2, x1: 2.2, y0: 0, y1: 1.15, z0: 67.6, z1: 68.2 };
const SACO = { x: 0, z: 47 };
const ALVOS_Z = 61;
const CARRO = { x: 0, z: 78 };
const CHEGADA_Z = 150;

export class Treino3D {
  // dentro(): onde o treino desenha (#focus, o que vai para a tela cheia); pad: o controle virtual (pad-virtual.js)
  // entrada(): 'teclado' | 'gamepad' | 'dualsense'; toque: celular; toqueRaiz: os botões de toque (para acender o da vez)
  // carro(sim): o modo carro do teclado (W acelera) entra e sai junto com o carro do treino
  // diag(): { testando, texto, pct, pronto } do diagnóstico da conexão; gratis(): os 2 min ainda não começaram
  // onFechou(comecou, onde), onEvento(texto, dados)
  constructor({ dentro, pad, entrada, toque = false, toqueRaiz = null, carro = null, diag = () => null, gratis = () => false, onFechou = null, onEvento = null }) {
    Object.assign(this, { dentro, pad, entrada, toque, toqueRaiz, carro, diag, gratis, onFechou, onEvento });
    this.aberto = false;
    this.e = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    this.antes = 0;
  }

  get ativo() { return this.aberto; }

  async abrir(motivo = 'entrada') {
    if (this.aberto) return;
    this.aberto = true;
    this.fase = 'carregando';
    this.i = 0;
    this.antes = 0;
    this.fimDesceu = false;
    this.esperarDiag = false;
    this.inicio = performance.now();
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.textContent = CSS;
      document.head.append(estilo);
    }
    this.raiz = document.createElement('div');
    this.raiz.id = 'treino3d';
    this.hud = document.createElement('div');
    this.hud.id = 'treino3d-hud';
    this.hud.innerHTML = '<div class="t3-carregando">Carregando o treino…</div>';
    this.dentro().append(this.raiz, this.hud);
    this.pad.treinar((e) => this.estado(e));
    this.onEvento?.('treino 3D aberto', { motivo, entrada: this.entrada() });
    try {
      const [THREE, { Avatar }] = await Promise.all([import('three'), import('./avatars.js')]);
      if (!this.aberto) return;
      this.montar(THREE, Avatar);
      this.fase = 'licao';
      this.mostrarLicao();
      this.laco();
    } catch (err) {
      // sem WebGL ou sem rede: vai direto para o "Tudo pronto" (a cola dos comandos continua valendo)
      this.onEvento?.('treino 3D: não abriu o 3D', { erro: String(err?.message || err) });
      if (this.aberto) this.pronto('sem 3D');
    }
  }

  // comecou: saiu pelo "Começar"; false: o modo jogo acabou no meio
  fechar(comecou = false) {
    if (!this.aberto) return;
    const onde = { licao: LICOES[this.i]?.id ?? 'pronto', fase: this.fase, s: Math.round((performance.now() - this.inicio) / 1000) };
    this.aberto = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.okTimer);
    this.acender([]);
    if (this.noCarro) this.carro?.(false);
    this.noCarro = false;
    this.pad.treinar(null);
    if (this.aoRedim) removeEventListener('resize', this.aoRedim);
    this.aoRedim = null;
    this.raf = 0;
    try { this.renderer?.dispose(); this.renderer?.forceContextLoss?.(); } catch { /* já foi */ }
    this.renderer = null;
    this.raiz?.remove();
    this.hud?.remove();
    this.raiz = this.hud = null;
    this.onFechou?.(comecou, onde);
  }

  // PC com o mouse preso: P ou Esc pulam para o "Tudo pronto"; Enter começa. true: a tecla ficou aqui
  tecla(ev) {
    if (!this.aberto || ev.t !== 'tecla') return false;
    // no "Tudo pronto" o Esc volta a ser do modo jogo (duas vezes desliga)
    if (ev.code === 'KeyP' || (ev.code === 'Escape' && this.fase !== 'pronto')) {
      if (ev.a === 'down' && this.fase !== 'pronto') this.pular();
      return true;
    }
    if (ev.code === 'Enter' && this.fase === 'pronto') {
      if (ev.a === 'down') this.comecar();
      return true;
    }
    return false;
  }

  pular() {
    this.onEvento?.('treino 3D: pulou', { licao: LICOES[this.i]?.id, s: Math.round((performance.now() - this.inicio) / 1000) });
    this.pronto('pulou');
  }

  // o estado do controle (em treino: não foi para o PS5)
  estado(e) {
    this.e = e;
    const b = e.b || 0;
    const novos = b & ~this.antes;
    this.antes = b;
    this.novos |= novos;
    if (this.fase === 'pronto') {
      // começa ao soltar o ✕: começando na descida, o PS5 receberia o ✕ apertado na volta
      if (novos & 1) this.fimDesceu = true;
      if (this.fimDesceu && !(b & 1)) {
        this.fimDesceu = false;
        this.comecar();
      }
    }
  }

  // ---------------------------------------------------------------- a cena
  montar(THREE, Avatar) {
    this.T = THREE;
    const canvas = document.createElement('canvas');
    this.raiz.append(canvas);
    const r = new THREE.WebGLRenderer({ canvas, antialias: !this.toque, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.toque ? 1.5 : 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    const cena = new THREE.Scene();
    this.cena = cena;
    // o céu do pôr do sol de Vice City
    const ceu = document.createElement('canvas');
    ceu.width = 4;
    ceu.height = 256;
    const g = ceu.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2a0f52');
    gr.addColorStop(0.45, '#b8327a');
    gr.addColorStop(0.75, '#ff7a45');
    gr.addColorStop(1, '#ffc46b');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(ceu);
    tex.colorSpace = THREE.SRGBColorSpace;
    cena.background = tex;
    cena.fog = new THREE.Fog(0xd9667a, 45, 140);
    cena.add(new THREE.HemisphereLight(0xffb3c8, 0x6a4a3a, 1.6));
    const sol = new THREE.DirectionalLight(0xffc58a, 2.2);
    sol.position.set(-30, 25, 60);
    cena.add(sol);

    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    const caixa = (w, h, d, m, x, y, z) => {
      const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      ms.position.set(x, y, z);
      cena.add(ms);
      return ms;
    };
    // chão: areia, a calçada do caminho e a rua do carro; o mar de um lado
    const areia = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0xe8c497));
    areia.rotation.x = -Math.PI / 2;
    cena.add(areia);
    const calcada = new THREE.Mesh(new THREE.PlaneGeometry(LIM_X * 2 + 1, 76), mat(0xd8a8b8));
    calcada.rotation.x = -Math.PI / 2;
    calcada.position.set(0, 0.01, 34);
    cena.add(calcada);
    const rua = new THREE.Mesh(new THREE.PlaneGeometry(LIM_X * 2 + 1, 92), mat(0x2b2638, { roughness: 0.95 }));
    rua.rotation.x = -Math.PI / 2;
    rua.position.set(0, 0.012, 118);
    cena.add(rua);
    const faixa = mat(0xffd23d, { emissive: 0x6a5000 });
    for (let z = 76; z < 162; z += 5) caixa(0.18, 0.02, 2.4, faixa, 0, 0.02, z);
    const mar = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), new THREE.MeshStandardMaterial({ color: 0x1fb5c9, roughness: 0.25, metalness: 0.1, emissive: 0x0a3a50 }));
    mar.rotation.x = -Math.PI / 2;
    mar.position.set(130, 0.02, 60);
    cena.add(mar);
    // meio-fio rosa dos dois lados e as palmeiras
    const meioFio = mat(0xff5fa2, { emissive: 0x401028 });
    for (const lado of [-1, 1]) caixa(0.35, 0.3, 166, meioFio, lado * (LIM_X + 0.55), 0.15, 79);
    const tronco = mat(0x8a5a3a);
    const folha = mat(0x1f9a6a);
    for (let z = -4; z < 165; z += 11) {
      for (const lado of [-1, 1]) {
        const x = lado * (LIM_X + 3 + ((z * 7) % 3));
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 6, 7), tronco);
        t.position.set(x, 3, z + lado * 2);
        t.rotation.z = lado * 0.12;
        cena.add(t);
        for (let k = 0; k < 6; k++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 4), folha);
          f.position.set(x + lado * 0.35, 6.1, z + lado * 2);
          f.rotation.set(Math.PI / 2.4, (k / 6) * Math.PI * 2, 0, 'YXZ');
          f.translateY(1.3);
          cena.add(f);
        }
      }
    }
    // prédios coloridos ao fundo, do lado da cidade
    const cores = [0xff8fb1, 0x9b5cff, 0x33e1ff, 0xffb36b, 0xf7f0ff];
    for (let i = 0; i < 16; i++) {
      const h = 8 + ((i * 37) % 22);
      caixa(8, h, 8, mat(cores[i % cores.length], { emissive: 0x150818 }), -32 - (i % 3) * 9, h / 2, -10 + i * 12);
    }

    // as estações
    const muro = mat(0xf4e9ff);
    caixa(MURO_PULO.x1 - MURO_PULO.x0, MURO_PULO.y1, MURO_PULO.z1 - MURO_PULO.z0, muro, 0, MURO_PULO.y1 / 2, (MURO_PULO.z0 + MURO_PULO.z1) / 2);
    const listra = mat(0xff3d8b, { emissive: 0x4a0a24 });
    caixa(BARREIRA.x1 - BARREIRA.x0, 0.35, BARREIRA.z1 - BARREIRA.z0, listra, 0, BARREIRA.y0 + 0.17, (BARREIRA.z0 + BARREIRA.z1) / 2);
    caixa(BARREIRA.x1 - BARREIRA.x0, BARREIRA.y1 - BARREIRA.y0 - 0.35, BARREIRA.z1 - BARREIRA.z0, mat(0x6b3fa0), 0, (BARREIRA.y0 + 0.35 + BARREIRA.y1) / 2, (BARREIRA.z0 + BARREIRA.z1) / 2);
    for (const lado of [-1, 1]) caixa(0.4, BARREIRA.y1, 0.4, mat(0x6b3fa0), lado * LIM_X, BARREIRA.y1 / 2, BARREIRA.z0);
    caixa(COBERTURA.x1 - COBERTURA.x0, COBERTURA.y1, COBERTURA.z1 - COBERTURA.z0, mat(0xb3a596), 0, COBERTURA.y1 / 2, (COBERTURA.z0 + COBERTURA.z1) / 2);
    // o saco de pancada, pendurado numa trave
    caixa(0.15, 3, 0.15, mat(0x444055), SACO.x - 1.1, 1.5, SACO.z);
    caixa(1.3, 0.12, 0.12, mat(0x444055), SACO.x - 0.5, 3, SACO.z);
    const saco = new THREE.Group();
    saco.position.set(SACO.x, 3, SACO.z);
    const corpoSaco = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.3, 14), mat(0xc0392b));
    corpoSaco.position.y = -1.35;
    saco.add(corpoSaco);
    cena.add(saco);
    this.saco = { g: saco, vel: 0, ang: 0, socos: 0 };
    // os alvos
    this.alvos = [-3, 0, 3].map((x) => {
      const g2 = new THREE.Group();
      g2.position.set(x, 0, ALVOS_Z);
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat(0x555066));
      poste.position.y = 0.6;
      const disco = new THREE.Group();
      disco.position.y = 1.2;
      for (const [rr, cor, dz] of [[0.5, 0xffffff, 0], [0.34, 0xff3d8b, -0.01], [0.16, 0xffffff, -0.02]]) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.06, 24), mat(cor, { emissive: cor === 0xffffff ? 0x333333 : 0x400010 }));
        d.rotation.x = Math.PI / 2;
        d.position.set(0, 0.5, dz);
        disco.add(d);
      }
      g2.add(poste, disco);
      cena.add(g2);
      return { g: g2, disco, caiu: false, ang: 0 };
    });
    // os cones da rua e o arco de chegada
    const cone = mat(0xff7a1a, { emissive: 0x3a1400 });
    this.cones = [];
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 10), cone);
      c.position.set(k % 2 ? 2.8 : -2.8, 0.38, 96 + k * 6);
      cena.add(c);
      this.cones.push({ m: c, v: null });
    }
    const arco = mat(0xffd23d, { emissive: 0x6a4a00 });
    for (const lado of [-1, 1]) caixa(0.5, 5, 0.5, arco, lado * 7, 2.5, CHEGADA_Z);
    caixa(14.5, 0.8, 0.5, arco, 0, 5, CHEGADA_Z);
    this.placa('CHEGADA', 0, 5.9, CHEGADA_Z, 4.2);

    // placas de cada estação
    this.placa('L3 · CORRER', 0, 3, 20, 3.2);
    this.placa('✕ · PULAR', 0, 2.3, 29.4, 3);
    this.placa('○ · AGACHAR', 0, 3.4, 35.5, 3.2);
    this.placa('□ · SOCO', -2.6, 3.2, SACO.z, 2.6);
    this.placa('L2 + R2 · MIRAR E ATIRAR', 0, 3.6, ALVOS_Z + 0.5, 5);
    this.placa('R1 · PROTEGER-SE', 0, 2.4, COBERTURA.z1 + 0.4, 3.6);
    this.placa('△ · CARRO', 3.2, 2.6, CARRO.z, 2.6);

    // o marcador amarelo do objetivo (como o do GTA)
    const marc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    marc.position.y = 0.8;
    cena.add(marc);
    this.marcador = marc;

    // o carro parado (o mesmo da sala: o boneco vira carro) e o boneco
    const parado = new Avatar({ name: '', color: '#ff3d8b', isLocal: true });
    parado.setVeiculo(true);
    parado.group.position.set(CARRO.x, 0, CARRO.z);
    parado.tag.sprite.visible = false;
    cena.add(parado.group);
    this.parado = parado;
    const av = new Avatar({ name: '', color: '#33e1ff', isLocal: true });
    av.tag.sprite.visible = false;
    cena.add(av.group);
    this.av = av;
    const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2;
    cena.add(sombra);
    this.sombra = sombra;
    // o traço do tiro
    const tracoGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.traco = new THREE.Line(tracoGeo, new THREE.LineBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0 }));
    cena.add(this.traco);

    this.cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.ray = new THREE.Raycaster();
    this.p = { x: 0, y: 0, z: 0, vy: 0, chao: true, yaw: 0, agachado: false, corrida: 0, protegido: false };
    this.carroEst = { vel: 0, yaw: 0 };
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camDist = 4.4;
    this.olhou = 0;
    this.novos = 0;
    this.ajustarTamanho();
    this.aoRedim = () => this.ajustarTamanho();
    addEventListener('resize', this.aoRedim);
    this.hud.innerHTML = '<div class="t3-card"></div><div class="t3-mira" hidden></div><div class="t3-dica" hidden></div><div class="t3-diag" hidden></div>';
  }

  q(s) { return this.hud?.querySelector(s) || null; }

  placa(texto, x, y, z, largura) {
    const T = this.T;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(26,11,46,.88)';
    g.beginPath();
    g.roundRect(4, 14, 504, 100, 26);
    g.fill();
    g.strokeStyle = '#ff3d8b';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '800 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, 256, 66, 480);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false }));
    s.scale.set(largura, largura / 4, 1);
    s.position.set(x, y, z);
    this.cena.add(s);
  }

  ajustarTamanho() {
    if (!this.renderer || !this.raiz) return;
    const w = this.raiz.clientWidth || innerWidth;
    const h = this.raiz.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- o HUD
  rotuloTecla(nome) {
    if (this.toque || this.entrada() !== 'teclado') return '';
    if (nome === 'stickE') return '<kbd class="t3-k">W A S D</kbd>';
    if (nome === 'stickD') return '<kbd class="t3-k">mouse</kbd>';
    const id = ID_TECLA[nome];
    if (!id) return '';
    const t = teclasDe(id);
    return t && t !== '—' ? `<kbd class="t3-k">${t}</kbd>` : '';
  }

  mostrarLicao() {
    const l = LICOES[this.i];
    const card = this.q('.t3-card');
    if (!card) return;
    card.classList.remove('ok');
    const botoes = l.botoes.map((b) => `${GLIFO[b]}${this.rotuloTecla(b)}`).join('<span class="t3-mais">+</span>');
    card.innerHTML = `<div class="t3-topo"><span class="t3-n">${this.i + 1} DE ${LICOES.length} · TREINO GTA 6</span><button type="button" class="t3-pular">Pular treino${this.toque ? '' : ' <kbd>P</kbd>'}</button></div>
      <div class="t3-tit"><span class="t3-botoes">${botoes}</span><span>${l.nome}</span></div>
      <p class="t3-txt">${l.txt}</p>
      <div class="t3-barra"><i style="width:${(this.i / LICOES.length) * 100}%"></i></div>`;
    card.querySelector('.t3-pular').addEventListener('click', (ev) => { ev.stopPropagation(); this.pular(); });
    this.acender(this.toque ? l.toque : []);
    this.dica(null);
    this.licaoDesde = performance.now();
    this.marcarObjetivo();
  }

  // celular: o botão da vez pisca no controle de toque (a classe do tutorial antigo, style.css .tut-alvo)
  acender(alvos) {
    const r = this.toqueRaiz;
    if (!r) return;
    r.querySelectorAll('.tut-alvo').forEach((el) => el.classList.remove('tut-alvo'));
    for (const a of alvos) {
      const el = a === 'stick' ? r.querySelector('.tj-stick') : r.querySelector(`.tj-acoes button[data-a="${a}"], button[data-a="${a}"]`);
      el?.classList.add('tut-alvo');
    }
  }

  dica(texto) {
    const d = this.q('.t3-dica');
    if (!d) return;
    if (!texto) return void (d.hidden = true);
    if (d.textContent !== texto) d.textContent = texto;
    d.hidden = false;
  }

  marcarObjetivo() {
    const id = LICOES[this.i]?.id;
    const alvo = { andar: [0, 7], correr: [0, 26], pular: [0, 33], agachar: [0, 42.5], soco: [SACO.x, SACO.z - 1.2], mirar: [0, 54], cobertura: [0, COBERTURA.z0 - 0.7], entrar: [CARRO.x - 1.6, CARRO.z], dirigir: [0, CHEGADA_Z] }[id];
    this.alvo = alvo || null;
    if (!this.marcador) return;
    this.marcador.visible = !!alvo;
    if (alvo) this.marcador.position.set(alvo[0], 0.8, alvo[1]);
    this.marcador.scale.set(id === 'dirigir' ? 3 : 1, 1, 1);
  }

  feito() {
    if (this.okTimer) return;
    const card = this.q('.t3-card');
    card?.classList.add('ok');
    const tit = card?.querySelector('.t3-tit span:last-child');
    if (tit) tit.textContent = 'Isso! ✓';
    this.acender([]);
    this.onEvento?.('treino 3D: lição feita', { licao: LICOES[this.i].id, s: Math.round((performance.now() - this.licaoDesde) / 100) / 10 });
    this.okTimer = setTimeout(() => {
      this.okTimer = 0;
      if (!this.aberto || this.fase !== 'licao') return;
      this.i++;
      if (this.i >= LICOES.length) return this.pronto('terminou');
      this.mostrarLicao();
    }, 750);
  }

  mostrarDiag() {
    const el = this.q('.t3-diag');
    if (!el) return;
    const d = this.diag?.();
    const html = !d ? '' : d.testando
      ? `<span class="t3-gira"></span><span>Ajustando a conexão com o PS5 enquanto você treina${d.pct != null ? ` · ${d.pct}%` : ''}</span>`
      : d.pronto ? `<span>✓ Conexão pronta · ${d.pronto}</span>` : '';
    el.hidden = !html;
    el.classList.toggle('ok', !!d?.pronto && !d?.testando);
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ---------------------------------------------------------------- "Tudo pronto"
  pronto(porque) {
    if (this.fase === 'pronto') return;
    clearTimeout(this.okTimer);
    this.okTimer = 0;
    this.fase = 'pronto';
    this.fimDesceu = false;
    this.acender([]);
    if (this.noCarro) this.carro?.(false);
    this.noCarro = false;
    if (porque === 'terminou') this.onEvento?.('treino 3D: terminou', { s: Math.round((performance.now() - this.inicio) / 1000) });
    if (!this.hud) return;
    if (this.q('.t3-carregando')) this.hud.innerHTML = '';
    for (const s of ['.t3-card', '.t3-mira', '.t3-dica', '.t3-diag']) this.q(s)?.remove();
    const cola = COLA.map(([b, t]) => `<div>${GLIFO[b]}${this.rotuloTecla(b)}<span>${t}</span></div>`).join('');
    const el = document.createElement('div');
    el.className = 't3-pronto';
    el.innerHTML = `<div class="t3-pronto-caixa" role="dialog" aria-label="Tudo pronto para jogar">
      <h2>Tudo pronto para jogar!</h2>
      <p>${porque === 'terminou' ? 'Você mandou bem no treino. ' : ''}Os comandos do GTA 6 no seu ${this.toque ? 'celular' : this.entrada() === 'teclado' ? 'teclado' : 'controle'}:</p>
      <div class="t3-cola">${cola}</div>
      <p class="t3-extra">${COLA_EXTRA}</p>
      <div class="t3-estado" aria-live="polite"></div>
      <button type="button" class="t3-comecar"></button>
      <small>${this.toque ? 'Ou toque no ✕.' : 'Ou aperte ✕ (Espaço) ou Enter. Para sair do jogo: Esc duas vezes ou F8.'}</small>
    </div>`;
    this.hud.append(el);
    el.querySelector('.t3-comecar').addEventListener('click', (ev) => { ev.stopPropagation(); this.comecar(); });
    this.atualizarPronto();
    if (!this.raf) this.laco(); // sem 3D: o laço só cuida da tela
  }

  atualizarPronto() {
    const b = this.q('.t3-comecar');
    const est = this.q('.t3-estado');
    if (!b) return;
    const d = this.diag?.();
    const gratis = this.gratis?.();
    let txt;
    if (d?.testando) {
      txt = this.esperarDiag ? `Começa sozinho ao terminar o ajuste… ${d.pct != null ? `${d.pct}%` : ''}` : '▶ Começar assim que a conexão ficar pronta';
      est.innerHTML = `<span class="t3-gira" style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:#ff8a3d;animation:t3-gira .8s linear infinite"></span><span>Finalizando o diagnóstico da conexão${d.texto ? `: ${d.texto}` : ''}</span>`;
    } else {
      txt = `▶ Começar a jogar${gratis ? ' · 2 min grátis' : ''}`;
      est.innerHTML = d?.pronto ? `<span>✓ Conexão pronta · ${d.pronto}</span>` : '';
    }
    b.classList.toggle('esperando', !!d?.testando && this.esperarDiag);
    if (b.textContent !== txt) b.textContent = txt;
  }

  comecar() {
    if (!this.aberto || this.fase !== 'pronto') return;
    if (this.diag?.()?.testando) {
      if (!this.esperarDiag) this.onEvento?.('treino 3D: começar esperando o diagnóstico');
      this.esperarDiag = true;
      return this.atualizarPronto();
    }
    this.fechar(true);
  }

  // ---------------------------------------------------------------- o laço
  laco() {
    let ultimo = performance.now();
    const passo = (agora) => {
      if (!this.aberto) return;
      this.raf = requestAnimationFrame(passo);
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      if (this.fase === 'pronto') {
        this.atualizarPronto();
        if (this.esperarDiag && !this.diag?.()?.testando) return void this.fechar(true);
      } else {
        this.mostrarDiag();
      }
      if (!this.renderer) return;
      if (this.fase === 'licao') this.simular(dt, agora / 1000);
      else this.av?.update(dt, agora / 1000);
      this.posicionarCamera(dt);
      this.renderer.render(this.cena, this.cam);
      this.novos = 0;
    };
    this.raf = requestAnimationFrame(passo);
  }

  simular(dt, t) {
    const e = this.e;
    const b = e.b || 0;
    const novos = this.novos;
    const l = LICOES[this.i]?.id;
    const segura = (n) => !!(b & bit(n));
    const apertou = (n) => !!(novos & bit(n));
    const gat = (v) => (v > 1 ? v / 255 : v || 0);
    const l2 = Math.max(gat(e.lt), segura('l2') ? 1 : 0);
    const r2 = Math.max(gat(e.rt), segura('r2') ? 1 : 0);
    const lx = Math.abs(e.lx) > 0.12 ? e.lx : 0;
    const ly = Math.abs(e.ly) > 0.12 ? e.ly : 0;
    const rx = Math.abs(e.rx) > 0.08 ? e.rx : 0;
    const ry = Math.abs(e.ry) > 0.08 ? e.ry : 0;
    // a câmera (no carro ela volta sozinha para trás do carro quando não mexe)
    const mirando = l2 > 0.3 && !this.noCarro && l === 'mirar';
    const giro = mirando ? 1.6 : 2.8;
    this.camYaw -= rx * giro * dt;
    this.camPitch = Math.max(-0.35, Math.min(1.1, this.camPitch + ry * 1.8 * dt));
    this.olhou += Math.abs(rx) * giro * dt + Math.abs(ry) * 1.8 * dt;
    const p = this.p;
    const av = this.av;

    if (this.noCarro) {
      this.dirigir(dt, { l2, r2, lx, ly, segura, apertou, rx });
    } else {
      // a pé: L3 corre (de novo: dispara), ○ agacha, ✕ pula, □ soco, R1 cobertura
      if (apertou('l3')) {
        p.corrida = p.corrida >= 2 ? 2 : p.corrida + 1;
        p.parado = 0;
        if (p.agachado) p.agachado = false;
      }
      if (apertou('bol')) {
        // embaixo da barreira não há espaço para levantar
        if (p.agachado && this.debaixoDaBarreira()) this.dica('Sem espaço para levantar aqui: passe agachado');
        else p.agachado = !p.agachado;
        if (p.agachado) p.corrida = 0;
        p.protegido = false;
      }
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      // frente = -ly; direita da câmera = (-cos, sin)
      let mx = fx * -ly + -fz * lx;
      let mz = fz * -ly + fx * lx;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      // parou de verdade (mais de 1 s): o L3 precisa de novo, como no jogo; apertado antes de andar, vale
      p.parado = m < 0.15 ? (p.parado || 0) + dt : 0;
      if (p.parado > 1) p.corrida = 0;
      const vel = mirando ? 2.2 : p.agachado ? 1.9 : p.corrida === 2 ? 8.2 : p.corrida === 1 ? 6 : 3.3;
      if (p.protegido && m > 0.3) p.protegido = false;
      const nx = p.x + mx * vel * dt;
      const nz = p.z + mz * vel * dt;
      this.moverComMuros(nx, nz);
      if (m > 0.15 && !mirando) {
        const alvoYaw = Math.atan2(mx, mz);
        let d = alvoYaw - p.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw += d * Math.min(1, dt * 12);
      }
      if (mirando) p.yaw = this.camYaw;
      // pulo e gravidade (em cima do muro dá para ficar)
      if (apertou('xis') && p.chao && !p.agachado) {
        p.vy = 6.6;
        p.chao = false;
        this.pulou = true;
      }
      p.vy -= 19 * dt;
      p.y += p.vy * dt;
      const chao = this.alturaDoChao(p.x, p.z);
      if (p.y <= chao) {
        p.y = chao;
        p.vy = 0;
        p.chao = true;
      } else if (p.y > chao + 0.05) p.chao = false;
      // soco
      if (apertou('qua')) {
        av.punch();
        const ds = Math.hypot(p.x - SACO.x, p.z - SACO.z);
        if (ds < 1.7) {
          this.saco.vel += 3.2;
          this.saco.socos++;
        }
      }
      // cobertura
      if (apertou('r1') && Math.abs(p.x) < COBERTURA.x1 + 0.4 && p.z > COBERTURA.z0 - 1.6 && p.z < COBERTURA.z0) {
        p.protegido = true;
        p.z = COBERTURA.z0 - RAIO - 0.05;
        p.yaw = 0;
      }
      // mirar e atirar
      if (l === 'mirar' && !av.armado) av.setArma(true);
      if (l !== 'mirar' && l !== 'cobertura' && av.armado) av.setArma(false);
      if (apertou('r2') && l === 'mirar') {
        if (mirando) this.atirar();
        else this.dica('Segure L2 para mirar antes de atirar com o R2');
      }
      // entrar no carro
      // (só a partir da lição do carro: antes ele fica parado esperando)
      const pc = this.parado.group.position;
      if (apertou('tri') && this.parado.group.visible && this.i >= LICOES.findIndex((x) => x.id === 'entrar') && Math.hypot(p.x - pc.x, p.z - pc.z) < 3.6) this.entrarNoCarro();
      // a pose
      const andando = m > 0.15;
      av.anim = !p.chao ? 3 : andando ? (p.corrida && !p.agachado ? 2 : 1) : 0;
      av.group.position.set(p.x, p.y, p.z);
      av.inner.rotation.y = p.yaw;
      const alvoEscala = p.agachado || p.protegido ? 0.62 : 1;
      av.inner.scale.y += (alvoEscala - av.inner.scale.y) * Math.min(1, dt * 14);
    }
    av.update(dt, t);
    this.sombra.position.set(this.noCarro ? av.group.position.x : p.x, 0.02, this.noCarro ? av.group.position.z : p.z);
    this.sombra.scale.setScalar(this.noCarro ? 2.6 : 1);
    this.animarMundo(dt);
    this.conferir(l);
  }

  debaixoDaBarreira() {
    const p = this.p;
    return p.z > BARREIRA.z0 - RAIO && p.z < BARREIRA.z1 + RAIO;
  }

  alturaDoChao(x, z) {
    const m = MURO_PULO;
    if (x > m.x0 && x < m.x1 && z > m.z0 - RAIO * 0.5 && z < m.z1 + RAIO * 0.5 && this.p.y >= m.y1 - 0.15) return m.y1;
    const c = COBERTURA;
    if (x > c.x0 && x < c.x1 && z > c.z0 - RAIO * 0.5 && z < c.z1 + RAIO * 0.5 && this.p.y >= c.y1 - 0.15) return c.y1;
    return 0;
  }

  // anda até onde dá: cada muro empurra o corpo para fora (por eixo, para escorregar junto à parede)
  moverComMuros(nx, nz) {
    const p = this.p;
    const altura = p.agachado ? ALT_AGACHADO : ALT_EM_PE;
    const bate = (x, z) => [MURO_PULO, BARREIRA, COBERTURA].some((c) => (
      x + RAIO > c.x0 && x - RAIO < c.x1 && z + RAIO > c.z0 && z - RAIO < c.z1 && p.y + altura > c.y0 && p.y < c.y1 - 0.12
    ));
    const lim = (v) => Math.max(-LIM_X, Math.min(LIM_X, v));
    nx = lim(nx);
    nz = Math.max(-3, Math.min(CHEGADA_Z + 6, nz));
    if (!bate(nx, p.z)) p.x = nx;
    if (!bate(p.x, nz)) p.z = nz;
  }

  atirar() {
    const T = this.T;
    this.av.atirar();
    this.ray.setFromCamera(new T.Vector2(0, 0), this.cam);
    const discos = this.alvos.filter((a) => !a.caiu).map((a) => a.disco);
    const hit = this.ray.intersectObjects(discos, true)[0];
    const ate = hit ? hit.point : this.ray.ray.at(60, new T.Vector3());
    const de = new T.Vector3(this.p.x, this.p.y + 1.35, this.p.z);
    try { if (this.av.armaMao) this.av.pontaDaArma(de); } catch { /* fica o peito */ }
    this.traco.geometry.setFromPoints([de, ate]);
    this.traco.material.opacity = 1;
    if (!hit) return;
    const a = this.alvos.find((x) => x.disco === hit.object.parent || x.disco === hit.object);
    if (a) a.caiu = true;
  }

  entrarNoCarro() {
    const p = this.p;
    this.noCarro = true;
    this.carro?.(true);
    this.parado.group.visible = false;
    this.av.inner.scale.y = 1;
    this.av.setArma(false);
    this.av.setVeiculo(true);
    const pc = this.parado.group.position;
    const yaw = this.parado.inner.rotation.y;
    this.carroEst = { vel: 0, yaw, x: pc.x, z: pc.z };
    p.x = pc.x;
    p.z = pc.z;
    this.camYaw = yaw;
  }

  sairDoCarro() {
    const c = this.carroEst;
    this.noCarro = false;
    this.carro?.(false);
    this.av.setVeiculo(false);
    this.parado.group.position.set(c.x, 0, c.z);
    this.parado.inner.rotation.y = c.yaw;
    this.parado.group.visible = true;
    // sai pela porta da esquerda
    this.p.x = Math.max(-LIM_X, Math.min(LIM_X, c.x + Math.cos(c.yaw) * 1.6));
    this.p.z = c.z - Math.sin(c.yaw) * 1.6;
    this.p.y = 0;
    this.p.yaw = c.yaw;
  }

  dirigir(dt, { l2, r2, lx, ly, segura, apertou, rx }) {
    const c = this.carroEst;
    const av = this.av;
    // R2 acelera (sem gatilho, o W do teclado fora do modo carro também serve), L2 freia e dá ré, ✕ freio de mão
    const acel = Math.max(r2, this.entrada() === 'teclado' && ly < -0.6 ? 1 : 0);
    if (acel > 0.05) c.vel += acel * 11 * dt;
    if (l2 > 0.05) c.vel -= l2 * (c.vel > 0.5 ? 22 : 7) * dt;
    if (segura('xis')) c.vel *= Math.max(0, 1 - dt * 3.5);
    c.vel *= Math.max(0, 1 - dt * 0.35);
    if (acel < 0.05 && l2 < 0.05) c.vel -= Math.sign(c.vel) * Math.min(Math.abs(c.vel), 2.5 * dt);
    c.vel = Math.max(-6, Math.min(24, c.vel));
    const vira = lx * Math.min(1, Math.abs(c.vel) / 5) * (c.vel >= 0 ? 1 : -1);
    c.yaw -= vira * 1.9 * dt;
    let nx = c.x + Math.sin(c.yaw) * c.vel * dt;
    const nz = c.z + Math.cos(c.yaw) * c.vel * dt;
    if (Math.abs(nx) > LIM_X - 0.6) {
      nx = Math.sign(nx) * (LIM_X - 0.6);
      c.vel *= 0.6;
    }
    c.x = nx;
    c.z = Math.max(70, Math.min(CHEGADA_Z + 12, nz));
    // cones voam quando o carro passa por cima
    for (const k of this.cones) {
      if (k.v || Math.hypot(k.m.position.x - c.x, k.m.position.z - c.z) > 1.4) continue;
      k.v = { x: Math.sin(c.yaw) * c.vel * 0.6 + (Math.random() - 0.5) * 3, y: 4 + Math.abs(c.vel) * 0.2, z: Math.cos(c.yaw) * c.vel * 0.6, r: (Math.random() - 0.5) * 12 };
    }
    av.velocidade = c.vel;
    av.volante = vira;
    av.anim = 5;
    av.group.position.set(c.x, 0, c.z);
    av.inner.rotation.y = c.yaw;
    if (!rx) {
      let d = c.yaw - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * Math.min(1, dt * 2.2);
    }
    if (apertou('tri') && Math.abs(c.vel) < 3) this.sairDoCarro();
    else if (apertou('tri')) this.dica('Pare o carro (L2) antes de sair com o △');
  }

  animarMundo(dt) {
    const s = this.saco;
    s.vel += -s.ang * 30 * dt;
    s.vel *= Math.max(0, 1 - dt * 2.2);
    s.ang += s.vel * dt;
    s.g.rotation.x = s.ang * 0.35;
    for (const a of this.alvos) {
      if (!a.caiu || a.ang >= Math.PI / 2) continue;
      a.ang = Math.min(Math.PI / 2, a.ang + dt * 7);
      a.disco.rotation.x = -a.ang;
    }
    for (const k of this.cones) {
      if (!k.v) continue;
      k.v.y -= 15 * dt;
      k.m.position.x += k.v.x * dt;
      k.m.position.y = Math.max(0.38, k.m.position.y + k.v.y * dt);
      k.m.position.z += k.v.z * dt;
      k.m.rotation.x += k.v.r * dt;
      if (k.m.position.y <= 0.38 && k.v.y < 0) { k.v.x *= 0.5; k.v.z *= 0.5; k.v.r *= 0.5; k.v.y = 0; if (Math.abs(k.v.x) + Math.abs(k.v.z) < 0.2) k.v = { x: 0, y: 0, z: 0, r: 0, parado: true }; }
    }
    if (this.traco.material.opacity > 0) this.traco.material.opacity = Math.max(0, this.traco.material.opacity - dt * 8);
    if (this.marcador && this.alvo) {
      // chegou no marcador: ele some (de dentro dele, o amarelo tingia a tela toda)
      const dentro = !this.noCarro && Math.hypot(this.p.x - this.alvo[0], this.p.z - this.alvo[1]) < 1.4;
      this.marcador.visible = !dentro;
      this.marcador.rotation.y += dt * 0.8;
    }
  }

  // a lição andou?
  conferir(l) {
    if (this.okTimer) return;
    const p = this.p;
    const perto = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    const mira = this.q('.t3-mira');
    if (mira) mira.hidden = !(l === 'mirar' && Math.max((this.e.lt > 1 ? this.e.lt / 255 : this.e.lt) || 0, (this.e.b & bit('l2')) ? 1 : 0) > 0.3);
    const dt = (performance.now() - this.licaoDesde) / 1000;
    switch (l) {
      case 'andar':
        if (perto(0, 7, 1.3)) this.feito();
        break;
      case 'olhar':
        if (this.olhou > 2.2) this.feito();
        else if (dt > 8 && !this.toque && this.entrada() === 'teclado' && !document.pointerLockElement) this.dica('Clique na tela para o mouse virar a câmera');
        break;
      case 'correr':
        if (p.corrida > 0 && perto(0, 26, 1.6)) this.feito();
        else if (perto(0, 26, 1.6)) this.dica(`Volte um pouco e aperte L3${this.rotuloTexto('l3')} para correr`);
        break;
      case 'pular':
        if (p.z > MURO_PULO.z1 + 0.6) this.feito();
        else if (p.z > 27 && dt > 6) this.dica(`Encoste no muro e aperte ✕${this.rotuloTexto('xis')}`);
        break;
      case 'agachar':
        if (p.z > BARREIRA.z1 + 0.5) this.feito();
        else if (p.z > BARREIRA.z0 - 1.2 && !p.agachado) this.dica(`Alto demais: aperte ○${this.rotuloTexto('bol')} para agachar`);
        else this.dica(null);
        break;
      case 'soco':
        if (this.saco.socos >= 3) this.feito();
        else if (this.saco.socos) this.dica(`${this.saco.socos} de 3 socos`);
        break;
      case 'mirar': {
        const n = this.alvos.filter((a) => a.caiu).length;
        if (n >= 3) this.feito();
        else if (n) this.dica(`${n} de 3 alvos`);
        break;
      }
      case 'cobertura':
        if (p.protegido) this.feito();
        break;
      case 'entrar':
        if (this.noCarro) this.feito();
        else if (perto(CARRO.x, CARRO.z, 3.6)) this.dica(`Aperte △${this.rotuloTexto('tri')} para entrar`);
        else this.dica(null);
        break;
      case 'dirigir':
        if (this.carroEst.z > CHEGADA_Z + 1) this.feito();
        break;
      case 'sair':
        if (!this.noCarro) this.feito();
        break;
      default:
    }
  }

  rotuloTexto(nome) {
    if (this.toque || this.entrada() !== 'teclado') return '';
    const t = teclasDe(ID_TECLA[nome]);
    return t && t !== '—' ? ` (${t})` : '';
  }

  posicionarCamera(dt) {
    const T = this.T;
    if (!this.cam || !this.av) return;
    const e = this.e;
    const l2 = Math.max((e.lt > 1 ? e.lt / 255 : e.lt) || 0, (e.b & bit('l2')) ? 1 : 0);
    const mirando = l2 > 0.3 && !this.noCarro && LICOES[this.i]?.id === 'mirar' && this.fase === 'licao';
    const distAlvo = this.noCarro ? 7 : mirando ? 2.1 : 4.4;
    this.camDist += (distAlvo - this.camDist) * Math.min(1, dt * 8);
    const alvo = this.av.group.position;
    const altura = this.noCarro ? 1.2 : this.p.agachado ? 1.0 : 1.45;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const lado = mirando ? 0.65 : 0;
    const cosP = Math.cos(this.camPitch);
    this.cam.position.set(
      alvo.x - fx * this.camDist * cosP - fz * lado,
      Math.max(0.3, alvo.y + altura + Math.sin(this.camPitch) * this.camDist),
      alvo.z - fz * this.camDist * cosP + fx * lado,
    );
    // perto da barreira a câmera desce para ver por baixo dela (senão ela tapa o boneco agachado)
    const pz = this.p.z;
    if (!this.noCarro && pz > BARREIRA.z0 - 5 && pz < BARREIRA.z1 + 1.5) {
      this.camBaixa = Math.min(1, (this.camBaixa || 0) + dt * 4);
    } else this.camBaixa = Math.max(0, (this.camBaixa || 0) - dt * 4);
    if (this.camBaixa > 0) this.cam.position.y += (Math.min(this.cam.position.y, BARREIRA.y0 - 0.2) - this.cam.position.y) * this.camBaixa;
    this.cam.lookAt(new T.Vector3(alvo.x - fz * lado, alvo.y + altura, alvo.z + fx * lado));
    const fov = mirando ? 45 : 60;
    if (Math.abs(this.cam.fov - fov) > 0.1) {
      this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 10);
      this.cam.updateProjectionMatrix();
    }
  }
}
