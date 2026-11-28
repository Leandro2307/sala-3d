// Tutorial do controle do PS5 no modo jogo: toda vez que a pessoa entra no modo jogo numa tela de PS5, um
// passo a passo pede cada ação (clicar, rolar, apertar, arrastar) e só anda quando ela faz. No PC
// ensina o teclado e o mouse (teclado-pad.js); no celular, os botões da tela (toque-jogo.js), com o
// botão da vez piscando.
//
// Enquanto o tutorial está aberto o controle virtual fica em treino (pad-virtual.js, treinar): o
// estado vem para cá e nada vai para o PS5 — dá para apertar à vontade sem mexer no jogo. Ao fechar,
// o estado de verdade volta a sair.
//
// Aparece sempre (pedido do usuário) e sai fácil: o botão "Pular" grande, que pega clique e toque, e,
// no PC com o mouse preso, P ou Esc. As opções do modo jogo (PC) e o painel do toque (celular) têm
// "Tutorial do controle" para ver de novo.

import { mapaTeclas, nomeEntrada, teclasDe, visiveis } from './mapa-teclas.js';

const OK_MS = 650; // o "Isso!" antes do próximo passo

// botões no mapa padrão do navegador (o bit i do estado do controle)
const B = { xis: 0, bol: 1, qua: 2, tri: 3, l1: 4, r1: 5, l2: 6, r2: 7 };

const GLIFO = {
  xis: '<span class="tut-g tut-xis">✕</span>',
  bol: '<span class="tut-g tut-bol">○</span>',
  qua: '<span class="tut-g tut-qua">□</span>',
  tri: '<span class="tut-g tut-tri">△</span>',
  l1: '<span class="tut-pill">L1</span>', r1: '<span class="tut-pill">R1</span>',
  l2: '<span class="tut-pill">L2</span>', r2: '<span class="tut-pill">R2</span>',
  stickE: '<span class="tut-stick"><i></i></span><small>analógico esquerdo</small>',
  stickD: '<span class="tut-stick"><i></i></span><small>analógico direito (câmera)</small>',
  touchpad: '<span class="tut-tp"><i></i></span><small>touchpad</small>',
};

// o mouse desenhado; parte: a que acende (esq, dir, baixo, cima, mover)
const mouse = (parte) => `<svg class="tut-mouse" viewBox="0 0 64 96" aria-hidden="true">
  <rect x="7" y="5" width="50" height="84" rx="25" class="tut-m-corpo${parte === 'mover' ? ' on' : ''}"/>
  <path d="M7 40 V30 A25 25 0 0 1 32 5 V40 Z" class="tut-m-bt${parte === 'esq' ? ' on' : ''}"/>
  <path d="M57 40 V30 A25 25 0 0 0 32 5 V40 Z" class="tut-m-bt${parte === 'dir' ? ' on' : ''}"/>
  <rect x="27" y="13" width="10" height="20" rx="5" class="tut-m-roda${parte === 'baixo' || parte === 'cima' ? ' on' : ''}"/>
  ${parte === 'baixo' ? '<path d="M24 52 L32 62 L40 52 Z" class="tut-m-seta"/>' : ''}
  ${parte === 'cima' ? '<path d="M24 62 L32 52 L40 62 Z" class="tut-m-seta"/>' : ''}
  ${parte === 'mover' ? '<path d="M2 66 h10 M52 66 h10 M32 92 v4" class="tut-m-traco"/>' : ''}
</svg>`;
const teclas = (...t) => t.map((k) => `<kbd class="tut-k">${k}</kbd>`).join('<span class="tut-mais">+</span>');

// cada passo: o que mostra e quando está feito. feito(e, novos, passo): e é o estado do controle,
// novos os botões que acabaram de descer; passo.visto guarda o que já foi feito nos passos de dois.
const apertou = (...nomes) => (e, novos, p) => {
  for (const n of nomes) if (novos & (1 << B[n])) p.visto.add(n);
  return nomes.every((n) => p.visto.has(n));
};
const PASSOS_PC_PADRAO = [
  {
    tit: 'Prenda o mouse no jogo',
    txt: 'Clique na imagem do jogo. O mouse some e passa a ser o controle.',
    de: mouse('esq'), para: '<span class="tut-pill">jogo</span>',
    preso: true,
  },
  { tit: 'Espaço = ✕', txt: 'Aperte <b>Espaço</b> (pular, confirmar).', de: teclas('Espaço'), para: GLIFO.xis, feito: apertou('xis') },
  { tit: 'C = ○', txt: 'Aperte <b>C</b> (agachar, voltar). O <b>Ctrl</b> também é ○.', de: teclas('C'), para: GLIFO.bol, feito: apertou('bol') },
  { tit: 'R = □', txt: 'Aperte <b>R</b> (recarregar, interagir).', de: teclas('R'), para: GLIFO.qua, feito: apertou('qua') },
  {
    tit: 'F ou rodinha = △',
    txt: 'Aperte <b>F</b> ou role a <b>rodinha</b> (trocar de arma, entrar no carro).',
    de: teclas('F') + '<span class="tut-mais">/</span>' + mouse('cima'), para: GLIFO.tri, feito: apertou('tri'),
  },
  {
    tit: 'Clique direito = L2 · esquerdo = R2',
    txt: 'Clique com o botão <b>direito</b> (mirar) e com o <b>esquerdo</b> (atirar). Dá para segurar os dois juntos.',
    de: mouse('dir') + mouse('esq'), para: GLIFO.l2 + GLIFO.r2, feito: apertou('l2', 'r2'),
  },
  { tit: 'Tab = L1 · E = R1', txt: 'Aperte <b>Tab</b> e depois <b>E</b>.', de: teclas('Tab', 'E'), para: GLIFO.l1 + GLIFO.r1, feito: apertou('l1', 'r1') },
  {
    tit: 'W A S D = andar',
    txt: 'Ande com <b>W A S D</b>, como num jogo de PC.',
    de: teclas('W', 'A', 'S', 'D'), para: GLIFO.stickE,
    feito: (e) => Math.hypot(e.lx || 0, e.ly || 0) > 0.5,
  },
  {
    tit: 'Mexer o mouse = câmera',
    txt: '<b>Mexa o mouse</b> para olhar em volta.',
    de: mouse('mover'), para: GLIFO.stickD,
    feito: (e) => Math.hypot(e.rx || 0, e.ry || 0) > 0.35,
  },
  {
    tit: 'Alt + mouse = touchpad',
    txt: '<b>Segure Alt</b> e mexa o mouse: é o dedo no touchpad. Alt + clique afunda o touchpad.',
    de: teclas('Alt') + '<span class="tut-mais">+</span>' + mouse('mover'), para: GLIFO.touchpad,
    feito: (e) => !!e.tp && e.tp[0] >= 0 && Math.hypot(e.tp[0] - 0.5, e.tp[1] - 0.5) > 0.12,
  },
  {
    tit: 'Pronto!',
    txt: 'Mais: <b>Shift</b> L3 (correr) · <b>V</b> R3 · <b>H</b> PS · <b>M</b> clique do touchpad · <b>setas</b> ou <b>1 2 3 4</b> direcional.<br>O que cada botão faz fica no canto de baixo, à direita. Aperte <b>Espaço</b> (✕) para começar a jogar.',
    de: teclas('Espaço'), para: GLIFO.xis,
    fim: true,
  },
];
// Os passos do PC seguem o mapa de teclas (mapa-teclas.js): o passo de uma ação que a pessoa trocou
// vira "aperte a tecla dela"; ação sem tecla nenhuma não tem passo.
const ID = { xis: 'b0', bol: 'b1', qua: 'b2', tri: 'b3', l1: 'b4', r1: 'b5', l2: 'b6', r2: 'b7' };
const MOUSE_PARTE = { MouseLeft: 'esq', MouseRight: 'dir', RodaBaixo: 'baixo', RodaCima: 'cima' };
const desenhoDe = (id) => {
  const es = visiveis(id).slice(0, 3);
  return es.map((e) => (MOUSE_PARTE[e] ? mouse(MOUSE_PARTE[e]) : `<kbd class="tut-k">${nomeEntrada(e)}</kbd>`)).join('<span class="tut-mais">/</span>');
};
function passosPc() {
  const p = PASSOS_PC_PADRAO;
  const tem = (id) => mapaTeclas.entradas(id).length > 0;
  const um = (nome, glifo) => (tem(ID[nome])
    ? { tit: `${teclasDe(ID[nome])} = ${glifo.replace(/<[^>]+>/g, '')}`, txt: `Aperte <b>${teclasDe(ID[nome])}</b>.`, de: desenhoDe(ID[nome]), para: glifo, feito: apertou(nome) }
    : null);
  const passo = (padrao, ...nomes) => (nomes.every((n) => mapaTeclas.padrao(ID[n])) ? [padrao] : nomes.map((n) => um(n, GLIFO[n])));
  const andar = ['ly-', 'lx-', 'ly+', 'lx+'];
  const andarPadrao = andar.every((id) => mapaTeclas.padrao(id));
  const ks = andar.map((id) => mapaTeclas.entradas(id).map(nomeEntrada)[0]);
  const fim = [['b16', 'PS'], ['b10', 'L3'], ['b11', 'R3'], ['b12', '↑'], ['b13', '↓'], ['b14', '←'], ['b15', '→']]
    .filter(([id]) => tem(id)).map(([id, n]) => `<b>${teclasDe(id)}</b> ${n}`).join(' · ');
  const xis = tem('b0') ? `${teclasDe('b0')} (✕)` : 'P';
  return [
    p[0],
    ...passo(p[1], 'xis'), ...passo(p[2], 'bol'), ...passo(p[3], 'qua'), ...passo(p[4], 'tri'),
    ...passo(p[5], 'l2', 'r2'), ...passo(p[6], 'l1', 'r1'),
    andarPadrao ? p[7] : ks.every(Boolean) ? { ...p[7], tit: `${ks.join(' ')} = andar`, txt: `Ande com <b>${ks.join(' ')}</b>.`, de: teclas(...ks) } : null,
    p[8],
    mapaTeclas.padrao('tp') ? p[9] : tem('tp') ? { ...p[9], tit: `${teclasDe('tp')} + mouse = touchpad`, txt: `<b>Segure ${teclasDe('tp')}</b> e mexa o mouse: é o dedo no touchpad.`, de: desenhoDe('tp') + '<span class="tut-mais">+</span>' + mouse('mover') } : null,
    mapaTeclas.personalizado()
      ? { ...p[10], txt: `Mais: ${fim}.<br>Aperte ${xis} para começar a jogar.`, de: desenhoDe('b0') || p[10].de }
      : p[10],
  ].filter(Boolean);
}
const PASSOS_TOQUE = [
  { tit: 'Toque no ✕', txt: 'Toque no botão que está <b>piscando</b>.', para: GLIFO.xis, alvos: ['xis'], feito: apertou('xis') },
  { tit: 'Toque no ○', txt: 'Agora o ○.', para: GLIFO.bol, alvos: ['bol'], feito: apertou('bol') },
  { tit: 'Toque no □', txt: 'Agora o □.', para: GLIFO.qua, alvos: ['qua'], feito: apertou('qua') },
  { tit: 'Toque no △', txt: 'Agora o △.', para: GLIFO.tri, alvos: ['tri'], feito: apertou('tri') },
  { tit: 'L1 e R1', txt: 'Toque no <b>L1</b> e no <b>R1</b>.', para: GLIFO.l1 + GLIFO.r1, alvos: ['l1', 'r1'], feito: apertou('l1', 'r1') },
  { tit: 'L2 e R2', txt: 'Toque no <b>L2</b> e no <b>R2</b> (os gatilhos).', para: GLIFO.l2 + GLIFO.r2, alvos: ['l2', 'r2'], feito: apertou('l2', 'r2') },
  {
    tit: 'Andar',
    txt: '<b>Arraste o polegar</b> no lado esquerdo da tela: o analógico vem para baixo do dedo.',
    para: GLIFO.stickE, alvos: ['stick'],
    feito: (e) => Math.hypot(e.lx || 0, e.ly || 0) > 0.5,
  },
  {
    tit: 'Câmera',
    txt: '<b>Arraste o dedo</b> no lado direito da tela, longe dos botões, para olhar em volta.',
    para: GLIFO.stickD, alvos: ['olhar'],
    feito: (e) => Math.hypot(e.rx || 0, e.ry || 0) > 0.4,
  },
  {
    tit: 'Pronto!',
    txt: 'As setas ficam à esquerda; L3 e R3, em cima; o <b>⋯</b> abre o PS. Toque no <b>✕</b> para começar a jogar.',
    para: GLIFO.xis, alvos: ['xis'],
    fim: true,
  },
];

export class TutorialControle {
  // raiz: a camada do tutorial (dentro do #focus, que é o que vai para a tela cheia)
  // pad: o controle virtual; toqueRaiz: o controle de toque (para acender o botão da vez)
  constructor({ raiz, pad, toqueRaiz, onFechou, onAbriu }) {
    this.raiz = raiz;
    this.pad = pad;
    this.toqueRaiz = toqueRaiz;
    this.onFechou = onFechou;
    this.onAbriu = onAbriu;
    this.modo = null;
    this.i = 0;
    this.antes = 0;
    this.esperando = 0; // timer do "Isso!"
    document.addEventListener('pointerlockchange', () => this.conferirPreso());
  }

  get ativo() { return !!this.modo; }

  // modo: 'pc' (teclado e mouse) ou 'toque' (botões da tela)
  abrir(modo) {
    if (this.modo === modo) return;
    if (this.modo) this.fechar(false);
    this.modo = modo;
    this.passos = (modo === 'pc' ? passosPc() : PASSOS_TOQUE).map((p) => ({ ...p, visto: new Set() }));
    this.i = 0;
    this.antes = 0;
    this.fimDesceu = false;
    this.pad.treinar((e) => this.estado(e));
    this.raiz.hidden = false;
    this.raiz.dataset.modo = modo;
    this.mostrar();
    this.onAbriu?.(modo);
  }

  // concluiu: terminou ou pulou; false: o modo jogo acabou no meio
  fechar(concluiu) {
    if (!this.modo) return;
    const onde = { passo: this.i + 1, de: this.passos?.length ?? null };
    clearTimeout(this.esperando);
    this.esperando = 0;
    this.modo = null;
    this.acender([]);
    this.raiz.hidden = true;
    this.raiz.innerHTML = '';
    this.pad.treinar(null);
    this.onFechou?.(concluiu, onde);
  }

  // PC: P ou Esc pulam (o ponteiro preso não deixa clicar no botão). true: a tecla foi usada aqui
  tecla(ev) {
    if (!this.modo || ev.t !== 'tecla' || (ev.code !== 'KeyP' && ev.code !== 'Escape')) return false;
    if (ev.a === 'down') this.fechar(true);
    return true;
  }

  get passo() { return this.passos?.[this.i]; }

  mostrar() {
    const p = this.passo;
    const total = this.passos.length;
    const toque = this.modo === 'toque';
    this.raiz.innerHTML = `<div class="tut-card" role="dialog" aria-live="polite" aria-label="Tutorial do controle">
      <div class="tut-topo"><span class="tut-n">${this.i + 1} de ${total}</span>
        <button type="button" class="tut-pular">Pular tutorial${toque ? '' : ' <kbd>P</kbd> <kbd>Esc</kbd>'}</button></div>
      <p class="tut-tit">${p.tit}</p>
      <div class="tut-visual">${p.de ? `<span class="tut-de">${p.de}</span><span class="tut-seta" aria-hidden="true">→</span>` : ''}<span class="tut-para">${p.para}</span></div>
      <p class="tut-txt">${p.txt}</p>
      <div class="tut-barra"><i style="width:${(this.i / total) * 100}%"></i></div>
    </div>`;
    this.raiz.querySelector('.tut-pular').addEventListener('click', (e) => {
      e.stopPropagation();
      this.fechar(true);
    });
    this.acender(p.alvos || []);
    if (p.preso) this.conferirPreso();
  }

  // celular: o botão da vez pisca (o lugar dele pode ter sido mudado pela pessoa)
  acender(alvos) {
    const r = this.toqueRaiz;
    if (!r) return;
    r.querySelectorAll('.tut-alvo').forEach((el) => el.classList.remove('tut-alvo'));
    for (const a of alvos) {
      const el = a === 'stick' ? r.querySelector('.tj-stick') : a === 'olhar' ? null : r.querySelector(`.tj-acoes button[data-a="${a}"]`);
      el?.classList.add('tut-alvo');
    }
    r.classList.toggle('tut-olhar', alvos.includes('olhar'));
  }

  conferirPreso() {
    if (this.modo === 'pc' && this.passo?.preso && !this.esperando && document.pointerLockElement) this.feito();
  }

  // o estado do controle (em treino: não foi para o PS5)
  estado(e) {
    const b = e.b || 0;
    const novos = b & ~this.antes;
    this.antes = b;
    const p = this.passo;
    if (!p || this.esperando) return;
    if (p.fim) {
      // fecha ao soltar o ✕: fechando ao descer, o PS5 receberia o ✕ apertado na volta
      if (novos & 1) this.fimDesceu = true;
      if (this.fimDesceu && !(b & 1)) this.fechar(true);
      return;
    }
    if (p.feito?.(e, novos, p)) this.feito();
  }

  feito() {
    const card = this.raiz.querySelector('.tut-card');
    card?.classList.add('tut-ok');
    const tit = card?.querySelector('.tut-tit');
    if (tit) tit.textContent = 'Isso! ✓';
    this.acender([]);
    this.esperando = setTimeout(() => {
      this.esperando = 0;
      if (!this.modo) return;
      this.i++;
      this.mostrar();
    }, OK_MS);
  }
}
