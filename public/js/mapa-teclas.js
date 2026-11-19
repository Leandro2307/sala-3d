// Mapa das teclas do PC no controle virtual (teclado-pad.js): cada tecla, botão do mouse ou dente da
// rodinha aponta para uma ação do controle (um botão, uma direção do analógico, o touchpad, a
// inclinação). Quem joga troca o que quiser no painel "Mapear teclas" (Opções do modo jogo): o R2 vem
// no E, mas a pessoa quer no W — clica no R2, aperta o W e pronto; o W sai do "andar para frente" e o
// painel avisa. Fica guardado neste navegador (localStorage), vale para o PS5 e para o Switch (os
// botões são pela posição: o ✕ do PS5 é o B do Switch).
//
// Tecla sem ação continua indo como tecla para o PC (F11 do emulador, por exemplo). O movimento do
// mouse é sempre o analógico direito; os botões do analógico direito no teclado somam com ele.

const CHAVE = 'sala3d-mapa-teclas';

// entrada -> ação. Entradas: o e.code do teclado, Mouse* (botões) e Roda* (dentes da rodinha)
export const PADRAO = Object.freeze({
  Space: 'b0', Enter: 'b1', KeyF: 'b3',
  ShiftLeft: 'b4', ShiftRight: 'b4', ControlLeft: 'b5', ControlRight: 'b5',
  KeyQ: 'b6', KeyE: 'b7', Tab: 'b8', Escape: 'b9', KeyV: 'b10', KeyH: 'b16',
  ArrowUp: 'b12', ArrowDown: 'b13', ArrowLeft: 'b14', ArrowRight: 'b15',
  KeyW: 'ly-', KeyS: 'ly+', KeyA: 'lx-', KeyD: 'lx+',
  AltLeft: 'tp', AltRight: 'tp', KeyG: 'giro',
  MouseLeft: 'b0', MouseRight: 'b1', MouseMiddle: 'b11', MouseX1: 'b4', MouseX2: 'b5',
  RodaBaixo: 'b2', RodaCima: 'b3',
});

// as direções dos analógicos: ação -> [eixo, sinal]
export const EIXO = {
  'ly-': ['ly', -1], 'ly+': ['ly', 1], 'lx-': ['lx', -1], 'lx+': ['lx', 1],
  'ry-': ['ry', -1], 'ry+': ['ry', 1], 'rx-': ['rx', -1], 'rx+': ['rx', 1],
};

// o botão do evento do controle.js -> a entrada do mapa
export const MOUSE = { left: 'MouseLeft', right: 'MouseRight', middle: 'MouseMiddle', x1: 'MouseX1', x2: 'MouseX2' };

// todas as ações, na ordem do painel. ps5/sw: o nome no controle de cada um; so: só num layout
export const ACOES = [
  { id: 'b0', grupo: 'Botões', ps5: '✕', sw: 'B', nome: 'Botão de baixo' },
  { id: 'b1', ps5: '○', sw: 'A', nome: 'Botão da direita' },
  { id: 'b2', ps5: '□', sw: 'Y', nome: 'Botão da esquerda' },
  { id: 'b3', ps5: '△', sw: 'X', nome: 'Botão de cima' },
  { id: 'b4', grupo: 'Ombros e gatilhos', ps5: 'L1', sw: 'L', nome: 'Ombro esquerdo' },
  { id: 'b5', ps5: 'R1', sw: 'R', nome: 'Ombro direito' },
  { id: 'b6', ps5: 'L2', sw: 'ZL', nome: 'Gatilho esquerdo' },
  { id: 'b7', ps5: 'R2', sw: 'ZR', nome: 'Gatilho direito' },
  { id: 'ly-', grupo: 'Analógico esquerdo (andar)', ps5: '↑', nome: 'Para frente' },
  { id: 'ly+', ps5: '↓', nome: 'Para trás' },
  { id: 'lx-', ps5: '←', nome: 'Para a esquerda' },
  { id: 'lx+', ps5: '→', nome: 'Para a direita' },
  { id: 'b10', ps5: 'L3', nome: 'Afundar o analógico esquerdo' },
  { id: 'ry-', grupo: 'Analógico direito (câmera — o mouse também mexe)', ps5: '↑', nome: 'Olhar para cima' },
  { id: 'ry+', ps5: '↓', nome: 'Olhar para baixo' },
  { id: 'rx-', ps5: '←', nome: 'Olhar para a esquerda' },
  { id: 'rx+', ps5: '→', nome: 'Olhar para a direita' },
  { id: 'b11', ps5: 'R3', nome: 'Afundar o analógico direito' },
  { id: 'b12', grupo: 'Direcional', ps5: '↑', nome: 'Cima' },
  { id: 'b13', ps5: '↓', nome: 'Baixo' },
  { id: 'b14', ps5: '←', nome: 'Esquerda' },
  { id: 'b15', ps5: '→', nome: 'Direita' },
  { id: 'b8', grupo: 'Menu', ps5: 'Create', sw: '−', nome: 'Botão da esquerda do meio' },
  { id: 'b9', ps5: 'Options', sw: '+', nome: 'Botão da direita do meio (pausa)' },
  { id: 'b16', ps5: 'PS', sw: 'Home', nome: 'Botão do meio' },
  { id: 'tp', grupo: 'Só no PS5', ps5: 'Touchpad', nome: 'Segure e mexa o mouse: o dedo no touchpad (com clique esquerdo, afunda)', so: 'ps5' },
  { id: 'b17', ps5: 'Afundar touchpad', nome: 'Clique do touchpad', so: 'ps5' },
  { id: 'giro', ps5: 'Inclinar', nome: 'Liga/desliga: o mouse inclina o controle (giroscópio)', so: 'ps5' },
];
const POR_ID = Object.fromEntries(ACOES.map((a) => [a.id, a]));

// o nome da ação no controle do layout ('ps5' ou 'switch')
export function rotulo(id, layout = 'ps5') {
  const a = POR_ID[id];
  if (!a) return id;
  return (layout === 'switch' && a.sw) || a.ps5;
}

// a rodinha só manda pulsos: só trava botões (não dá para segurar um analógico nela)
const ehBotao = (id) => /^b\d+$/.test(id);
const ehRoda = (entrada) => entrada === 'RodaBaixo' || entrada === 'RodaCima';

const NOMES = {
  Space: 'Espaço', Enter: 'Enter', Tab: 'Tab', Escape: 'Esc', Backspace: '⌫', CapsLock: 'Caps',
  ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt', AltRight: 'AltGr', MetaLeft: 'Win', MetaRight: 'Win dir.', ContextMenu: 'Menu',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: "'", Minus: '-', Equal: '=', BracketLeft: '´', BracketRight: '[', Backslash: ']',
  Semicolon: 'Ç', Quote: '~', Comma: ',', Period: '.', Slash: ';', IntlRo: '/', IntlBackslash: '\\',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  MouseLeft: 'Clique esq.', MouseRight: 'Clique dir.', MouseMiddle: 'Clique do meio',
  MouseX1: 'Mouse 4 (lateral)', MouseX2: 'Mouse 5 (lateral)', RodaBaixo: 'Roda ↓', RodaCima: 'Roda ↑',
};
// o nome curto da entrada, como está escrito no teclado (ABNT2)
export function nomeEntrada(e) {
  if (NOMES[e]) return NOMES[e];
  let m = /^Key([A-Z])$/.exec(e);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(e);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(e);
  if (m) return `Num ${{ Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: ',', Enter: 'Enter' }[m[1]] || m[1]}`;
  return e;
}

// Modo carro (GTA e parecidos): no carro o W acelera (R2) e o S freia/dá ré (L2), mas a pé o R2 atira e
// o L2 mira — o W não pode fazer as duas coisas. Ligado aqui, o △ (o botão de entrar no carro, F no
// padrão) troca de modo a cada toque: no carro valem as teclas desta camada por cima do mapa; △ de
// novo volta a pé. A sala não vê o jogo por dentro: se o △ não entrou no carro, um △ longe de carro
// acerta o modo. Desligado (o padrão), o △ é só o △.
// 'troca': uma tecla que só troca de modo (a pé / no carro) sem apertar nada no jogo — o Num * no
// padrão. Serve para acertar o modo sem o △ (que no jogo entra/sai do carro).
export const CARRO_PADRAO = Object.freeze({ KeyW: 'b7', KeyS: 'b6', NumpadMultiply: 'troca' });
export const CARRO_ACOES = ['b7', 'b6', 'troca']; // as ações que o painel deixa pôr no carro
const CARRO_NOME = { b7: 'Acelerar (no carro)', b6: 'Frear / ré (no carro)', troca: 'Só troca a pé / no carro (não aperta nada)' };
const rotuloCarro = (id, layout) => (id === 'troca' ? '🚗' : rotulo(id, layout));
export const ENTRA_CARRO = 'b3';

function ler() {
  const r = { mapa: { ...PADRAO }, carro: { ligado: false, t: 1, mapa: { ...CARRO_PADRAO } } };
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (o && o.v === 1 && o.mapa && typeof o.mapa === 'object') {
      r.mapa = {};
      for (const [e, a] of Object.entries(o.mapa)) if (POR_ID[a] && (!ehRoda(e) || ehBotao(a))) r.mapa[e] = a;
      if (o.carro && typeof o.carro === 'object') {
        r.carro.ligado = !!o.carro.ligado;
        if (o.carro.mapa && typeof o.carro.mapa === 'object') {
          r.carro.mapa = {};
          for (const [e, a] of Object.entries(o.carro.mapa)) if (CARRO_ACOES.includes(a) && !ehRoda(e)) r.carro.mapa[e] = a;
          // gravado antes da tecla de troca existir: ganha o Num * (se ele está livre no carro)
          if (!o.carro.t && !r.carro.mapa.NumpadMultiply) r.carro.mapa.NumpadMultiply = 'troca';
        }
      }
    }
  } catch { /* sem armazenamento */ }
  return r;
}

let { mapa, carro } = ler();
const ouvintes = new Set();
function gravar() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ v: 1, mapa, carro })); } catch { /* sem armazenamento */ }
  for (const f of ouvintes) f();
}

export const mapaTeclas = {
  // a ação de uma entrada (ou undefined: a tecla vai como tecla)
  acao: (entrada) => mapa[entrada],
  // as entradas de uma ação, na ordem em que foram postas
  entradas: (id) => Object.keys(mapa).filter((e) => mapa[e] === id),
  // põe a entrada na ação. somar: junto com as que já tem; senão, no lugar delas. Devolve o que
  // mudou: { erro } ou { tirou: a ação que a entrada fazia antes (ela sai de lá) }
  definir(id, entrada, somar = false) {
    if (!POR_ID[id]) return { erro: 'ação desconhecida' };
    if (ehRoda(entrada) && !ehBotao(id)) return { erro: 'A rodinha só manda toques: ela só pode ser um botão.' };
    const tirou = mapa[entrada] && mapa[entrada] !== id ? mapa[entrada] : null;
    if (!somar) for (const e of Object.keys(mapa)) if (mapa[e] === id) delete mapa[e];
    mapa[entrada] = id;
    gravar();
    return { tirou };
  },
  // tira a entrada: ela volta a ir como tecla (botão do mouse: não faz nada)
  remover(entrada) {
    if (!(entrada in mapa)) return;
    delete mapa[entrada];
    gravar();
  },
  // tira todas as entradas da ação
  limpar(id) {
    let mudou = false;
    for (const e of Object.keys(mapa)) if (mapa[e] === id) { delete mapa[e]; mudou = true; }
    if (mudou) gravar();
  },
  // "Voltar ao padrão" volta as teclas do carro também (o liga/desliga do modo carro fica como está)
  restaurar() {
    mapa = { ...PADRAO };
    carro.mapa = { ...CARRO_PADRAO };
    gravar();
  },
  // ---- modo carro
  carroLigado: () => carro.ligado,
  ligarCarro(sim) {
    carro.ligado = !!sim;
    gravar();
  },
  // a ação da entrada no carro (a camada do carro por cima do mapa)
  acaoCarro: (entrada) => (carro.mapa[entrada] && carro.mapa[entrada] !== 'troca' ? carro.mapa[entrada] : mapa[entrada]),
  // a entrada só troca de modo (vale a pé e no carro)
  trocaCarro: (entrada) => carro.mapa[entrada] === 'troca',
  entradasCarro: (id) => Object.keys(carro.mapa).filter((e) => carro.mapa[e] === id),
  definirCarro(id, entrada, somar = false) {
    if (!CARRO_ACOES.includes(id)) return { erro: 'ação desconhecida' };
    if (ehRoda(entrada)) return { erro: 'A rodinha não vale no carro: escolha uma tecla ou um botão do mouse.' };
    const tirou = carro.mapa[entrada] && carro.mapa[entrada] !== id ? carro.mapa[entrada] : null;
    if (!somar) for (const e of Object.keys(carro.mapa)) if (carro.mapa[e] === id) delete carro.mapa[e];
    carro.mapa[entrada] = id;
    gravar();
    return { tirou };
  },
  removerCarro(entrada) {
    if (!(entrada in carro.mapa)) return;
    delete carro.mapa[entrada];
    gravar();
  },
  limparCarro(id) {
    let mudou = false;
    for (const e of Object.keys(carro.mapa)) if (carro.mapa[e] === id) { delete carro.mapa[e]; mudou = true; }
    if (mudou) gravar();
  },
  padraoCarro(id) {
    const agora = this.entradasCarro(id).sort().join();
    const antes = Object.keys(CARRO_PADRAO).filter((e) => CARRO_PADRAO[e] === id).sort().join();
    return agora === antes;
  },
  // a ação está como no padrão? (sem nada: true para ações sem entrada no padrão)
  padrao(id) {
    const agora = this.entradas(id).sort().join();
    const antes = Object.keys(PADRAO).filter((e) => PADRAO[e] === id).sort().join();
    return agora === antes;
  },
  personalizado() { return ACOES.some((a) => !this.padrao(a.id)) || CARRO_ACOES.some((id) => !this.padraoCarro(id)); },
  ouvir(f) { ouvintes.add(f); },
};

// o texto curto das teclas de uma ação: "E", "Shift / Clique 4" ou "—"
// as entradas de uma ação para mostrar: o lado direito do Shift/Ctrl/Alt, com o esquerdo junto, não precisa
export const visiveis = (id) => mapaTeclas.entradas(id).filter((e, _, todas) => !/Right$/.test(e) || !todas.includes(e.replace(/Right$/, 'Left')));
export function teclasDe(id) {
  const es = visiveis(id);
  return es.length ? es.map(nomeEntrada).join(' / ') : '—';
}

// o recado que aparece ao entrar no modo jogo, montado do mapa de agora
export function dicaTeclado(layout) {
  if (layout !== 'ps5' && layout !== 'switch') return '';
  const t = (id) => teclasDe(id);
  const ks = ['ly-', 'lx-', 'ly+', 'lx+'].map((id) => mapaTeclas.entradas(id).map(nomeEntrada)[0] || '');
  const partes = [];
  for (const a of ACOES) {
    if (a.so && a.so !== layout) continue;
    if (EIXO[a.id] || !mapaTeclas.entradas(a.id).length) continue;
    if (a.id === 'tp') { partes.push(`${t('tp')} + mouse: touchpad`); continue; }
    if (a.id === 'giro') { partes.push(`${t('giro')}: o mouse inclina o controle`); continue; }
    partes.push(`${t(a.id)} ${rotulo(a.id, layout)}`);
  }
  const andar = !ks.every(Boolean) ? 'O analógico esquerdo' : ks.every((k) => k.length === 1) ? ks.join('') : ks.join(' ');
  let noCarro = '';
  // a rodinha não troca o modo carro (ela trava o botão; teclado-pad.js)
  const entra = visiveis(ENTRA_CARRO).filter((e) => !ehRoda(e)).map(nomeEntrada).join(' / ');
  if (mapaTeclas.carroLigado() && entra) {
    const c = (id) => mapaTeclas.entradasCarro(id).map(nomeEntrada).join(' / ');
    noCarro = ` Modo carro: ${entra} entra no carro e ${[c('b7') && `${c('b7')} acelera`, c('b6') && `${c('b6')} freia`].filter(Boolean).join(', ') || 'troca as teclas'}; ${entra} de novo volta a pé${c('troca') ? ` (${c('troca')} só troca o modo)` : ''}.`;
  }
  return `${andar} anda, o mouse mexe a câmera. ${partes.join(' · ')}.${noCarro} Para trocar: Opções → Mapear teclas.`;
}

// ------------------------------------------------------------------ o painel "Mapear teclas"

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// o controle desenhado: cada peça tem data-acao (acende ao passar o mouse na linha, ao apertar a tecla
// e ao clicar nela, que escolhe a ação para trocar). Os rótulos com as teclas ficam do lado de cada peça.
// [ação, x, y, alinhamento] de cada rótulo
const ROTULOS = [
  ['b6', 92, 36, 'end'], ['b7', 548, 36, 'start'], ['b4', 92, 66, 'end'], ['b5', 548, 66, 'start'],
  ['b8', 200, 82, 'end'], ['b9', 440, 82, 'start'],
  ['b12', 150, 120, 'middle'], ['b13', 150, 222, 'middle'], ['b14', 108, 170, 'end'], ['b15', 192, 170, 'start'],
  ['b3', 490, 104, 'middle'], ['b0', 490, 232, 'middle'], ['b2', 428, 170, 'end'], ['b1', 552, 170, 'start'],
  ['b16', 320, 228, 'middle'], ['b10', 240, 196, 'middle'], ['b11', 400, 196, 'middle'],
];

function desenho(layout) {
  const ps5 = layout === 'ps5';
  const face = (id, x, y) => `<g class="mt-p" data-acao="${id}"><circle cx="${x}" cy="${y}" r="17"/><text x="${x}" y="${y + 5}" class="mt-g">${esc(rotulo(id, layout))}</text></g>`;
  const seta = (id, x, y, w, h, s) => `<g class="mt-p" data-acao="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" class="mt-g mt-g-p">${s}</text></g>`;
  const ombro = (id, x, y, h) => `<g class="mt-p" data-acao="${id}"><rect x="${x}" y="${y}" width="96" height="${h}" rx="9"/><text x="${x + 48}" y="${y + h / 2 + 5}" class="mt-g">${esc(rotulo(id, layout))}</text></g>`;
  const stick = (pre, x, y, nome) => `<g>
      <circle cx="${x}" cy="${y}" r="34" class="mt-base"/>
      <g class="mt-p" data-acao="${pre}y-"><path d="M${x - 14} ${y - 18} L${x} ${y - 32} L${x + 14} ${y - 18} Z"/></g>
      <g class="mt-p" data-acao="${pre}y+"><path d="M${x - 14} ${y + 18} L${x} ${y + 32} L${x + 14} ${y + 18} Z"/></g>
      <g class="mt-p" data-acao="${pre}x-"><path d="M${x - 18} ${y - 14} L${x - 32} ${y} L${x - 18} ${y + 14} Z"/></g>
      <g class="mt-p" data-acao="${pre}x+"><path d="M${x + 18} ${y - 14} L${x + 32} ${y} L${x + 18} ${y + 14} Z"/></g>
      <g class="mt-p" data-acao="${pre === 'l' ? 'b10' : 'b11'}"><circle cx="${x}" cy="${y}" r="14"/><text x="${x}" y="${y + 4}" class="mt-g mt-g-p">${pre === 'l' ? 'L3' : 'R3'}</text></g>
      <text x="${x}" y="${y + 56}" class="mt-t mt-t-nome">${nome}</text>
      <text x="${x}" y="${y + 72}" class="mt-t" text-anchor="middle" data-eixos="${pre}"></text>
    </g>`;
  return `<svg class="mt-svg" viewBox="-100 0 840 340" role="img" aria-label="O controle, com a tecla de cada botão">
    <path class="mt-casco" d="M120 74 H520 C566 74 588 110 598 168 L618 286 C626 330 584 344 558 318 L500 266 H140 L82 318 C56 344 14 330 22 286 L42 168 C52 110 74 74 120 74 Z"/>
    ${ombro('b6', 100, 18, 30)}${ombro('b7', 444, 18, 30)}
    ${ombro('b4', 100, 54, 22)}${ombro('b5', 444, 54, 22)}
    ${ps5 ? `<g class="mt-p" data-acao="tp"><rect x="236" y="90" width="168" height="74" rx="12"/><text x="320" y="122" class="mt-g mt-g-p">touchpad</text><text x="320" y="142" class="mt-t" text-anchor="middle" data-rot="tp"></text></g>` : ''}
    ${seta('b8', 204, 96, 26, 16, ps5 ? '' : '−')}${seta('b9', 410, 96, 26, 16, ps5 ? '' : '+')}
    ${seta('b12', 138, 134, 24, 28, '▲')}${seta('b13', 138, 178, 24, 28, '▼')}
    ${seta('b14', 112, 158, 28, 24, '◀')}${seta('b15', 160, 158, 28, 24, '▶')}
    ${face('b3', 490, 128)}${face('b0', 490, 206)}${face('b2', 451, 167)}${face('b1', 529, 167)}
    <g class="mt-p" data-acao="b16"><circle cx="320" cy="200" r="13"/><text x="320" y="204" class="mt-g mt-g-p">${ps5 ? 'PS' : '⌂'}</text></g>
    ${stick('l', 240, 236, 'andar')}${stick('r', 400, 236, 'câmera (+ mouse)')}
    ${ROTULOS.map(([id, x, y, a]) => `<text x="${x}" y="${y}" class="mt-t" text-anchor="${a}" data-rot="${id}"></text>`).join('')}
  </svg>`;
}

export class MapaTeclasPainel {
  // raiz: a camada do painel (dentro do #focus, que é o que vai para a tela cheia)
  // onAbriu/onFechou: para o modo jogo soltar o controle e parar de mandar teclas enquanto está aberto
  constructor({ raiz, onAbriu, onFechou }) {
    this.raiz = raiz;
    this.onAbriu = onAbriu;
    this.onFechou = onFechou;
    this.aberto = false;
    this.pegando = null; // { id, somar }: esperando a tecla nova
    this.layout = 'ps5';
    this.acesas = new Map(); // entrada apertada -> ação (o teste ao vivo)
    this.teclaDesce = (e) => this.tecla(e, true);
    this.teclaSobe = (e) => this.tecla(e, false);
    mapaTeclas.ouvir(() => { if (this.aberto) this.atualizar(); });
    // clique no fundo escuro: o foco não sai do painel (fora dele, o controle.js mandaria as teclas
    // para o jogo, ver o [role="dialog"] de lá)
    raiz.addEventListener('pointerdown', (e) => { if (e.target === raiz) e.preventDefault(); });
  }

  abrir(layout = 'ps5') {
    this.layout = layout === 'switch' ? 'switch' : 'ps5';
    if (document.pointerLockElement) document.exitPointerLock();
    this.aberto = true;
    this.pegando = null;
    this.montar();
    this.raiz.hidden = false;
    addEventListener('keydown', this.teclaDesce, true);
    addEventListener('keyup', this.teclaSobe, true);
    this.raiz.querySelector('.mt-card').focus();
    this.onAbriu?.();
  }

  fechar() {
    if (!this.aberto) return;
    this.aberto = false;
    this.pegando = null;
    removeEventListener('keydown', this.teclaDesce, true);
    removeEventListener('keyup', this.teclaSobe, true);
    this.raiz.hidden = true;
    this.raiz.innerHTML = '';
    this.onFechou?.();
  }

  montar() {
    const l = this.layout;
    let html = '';
    for (const a of ACOES) {
      if (a.so && a.so !== l) continue;
      if (a.grupo) html += `${html ? '</div>' : ''}<h3 class="mt-grupo">${esc(a.grupo)}</h3><div class="mt-lista">`;
      html += `<div class="mt-linha" data-acao="${a.id}">
        <button type="button" class="mt-qual" data-trocar="${a.id}" title="Trocar a tecla"><b class="mt-glifo">${esc(rotulo(a.id, l))}</b><span class="mt-nome">${esc(a.nome)}</span></button>
        <span class="mt-teclas"></span>
        <button type="button" class="mt-mais" data-somar="${a.id}" title="Pôr mais uma tecla nesta ação" aria-label="Pôr mais uma tecla">+</button>
      </div>`;
    }
    html += '</div>';
    html += `<h3 class="mt-grupo">No carro (GTA e parecidos)</h3>
      <label class="mt-carro-liga"><input type="checkbox" data-carro-liga><span>O <b>${esc(rotulo(ENTRA_CARRO, l))}</b> (<span data-carro-tecla></span>) entra no carro e troca as teclas abaixo; <b>${esc(rotulo(ENTRA_CARRO, l))}</b> de novo volta a pé. A pé elas andam; no carro, aceleram e freiam.</span></label>
      <div class="mt-lista" data-carro-lista>`;
    for (const id of CARRO_ACOES) {
      html += `<div class="mt-linha" data-carro="${id}">
        <button type="button" class="mt-qual" data-carro-trocar="${id}" title="Trocar a tecla"><b class="mt-glifo">${esc(rotuloCarro(id, l))}</b><span class="mt-nome">${esc(CARRO_NOME[id])}</span></button>
        <span class="mt-teclas"></span>
        <button type="button" class="mt-mais" data-carro-somar="${id}" title="Pôr mais uma tecla" aria-label="Pôr mais uma tecla">+</button>
      </div>`;
    }
    html += '</div>';
    this.raiz.innerHTML =`<div class="mt-card" role="dialog" aria-modal="true" aria-labelledby="mt-titulo" tabindex="-1">
      <header class="mt-topo">
        <h2 id="mt-titulo">Mapear teclas <small>${l === 'switch' ? 'Switch' : 'PS5'}</small></h2>
        <button type="button" class="mt-x" data-fechar aria-label="Fechar">✕</button>
      </header>
      <p class="mt-sub">Clique num botão (no desenho ou na lista) e aperte a tecla, clique com o mouse ou role a rodinha que quer usar no lugar. Aperte qualquer tecla aqui para ver qual botão ela aperta.</p>
      <div class="mt-corpo">
        <div class="mt-desenho">${desenho(l)}<p class="mt-aviso" aria-live="polite"></p></div>
        <div class="mt-rolar">${html}</div>
      </div>
      <footer class="mt-rodape">
        <button type="button" class="secondary small" data-restaurar>Voltar ao padrão</button>
        <button type="button" class="primary small" data-fechar>Pronto</button>
      </footer>
      <div class="mt-pegar" hidden>
        <div class="mt-pegar-card">
          <p class="mt-pegar-tit"></p>
          <div class="mt-zona" tabindex="-1">Aperte a tecla<br><small>ou clique / role a rodinha aqui dentro</small></div>
          <div class="mt-pegar-botoes">
            <button type="button" class="secondary small" data-tirar>Deixar sem tecla</button>
            <button type="button" class="secondary small" data-cancelar>Cancelar</button>
          </div>
        </div>
      </div>
    </div>`;
    const r = this.raiz;
    r.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => this.fechar()));
    r.querySelector('[data-restaurar]').addEventListener('click', () => {
      mapaTeclas.restaurar();
      this.avisar('Tudo de volta ao padrão.');
    });
    r.querySelector('[data-carro-liga]').addEventListener('change', (e) => {
      mapaTeclas.ligarCarro(e.target.checked);
      this.avisar(e.target.checked
        ? `Modo carro ligado: no jogo, ${r.querySelector('[data-carro-tecla]').textContent} (${rotulo(ENTRA_CARRO, this.layout)}) entra no carro e troca as teclas; de novo, volta a pé.`
        : `Modo carro desligado: ${rotulo(ENTRA_CARRO, this.layout)} é só ${rotulo(ENTRA_CARRO, this.layout)}.`);
    });
    r.querySelector('.mt-rolar').addEventListener('click', (e) => {
      const tirarC = e.target.closest('[data-tirar-carro]');
      if (tirarC) {
        mapaTeclas.removerCarro(tirarC.dataset.tirarCarro);
        this.avisar(`${nomeEntrada(tirarC.dataset.tirarCarro)} saiu da seção do carro: agora faz o mesmo a pé e no carro.`);
        return;
      }
      const bc = e.target.closest('[data-carro-trocar], [data-carro-somar]');
      if (bc) {
        this.pegar(bc.dataset.carroTrocar || bc.dataset.carroSomar, !!bc.dataset.carroSomar, true);
        return;
      }
      const tirar = e.target.closest('[data-tirar-entrada]');
      if (tirar) {
        const ent = tirar.dataset.tirarEntrada;
        mapaTeclas.remover(ent);
        this.avisar(`${nomeEntrada(ent)} saiu. ${/^(Mouse|Roda)/.test(ent) ? 'Agora não faz nada no jogo.' : 'Agora vai como tecla mesmo.'}`);
        return;
      }
      const b = e.target.closest('[data-trocar], [data-somar]');
      if (b) this.pegar(b.dataset.trocar || b.dataset.somar, !!b.dataset.somar);
    });
    // no desenho: clicar numa peça escolhe a ação; passar o mouse mostra a linha
    const svg = r.querySelector('.mt-svg');
    svg.addEventListener('click', (e) => {
      const p = e.target.closest('[data-acao]');
      if (p) this.pegar(p.dataset.acao, false);
    });
    const linhaDe = (id) => r.querySelector(`.mt-linha[data-acao="${CSS.escape(id)}"]`);
    svg.addEventListener('pointerover', (e) => {
      const p = e.target.closest('[data-acao]');
      r.querySelectorAll('.mt-linha.mt-sob').forEach((x) => x.classList.remove('mt-sob'));
      if (!p) return;
      const linha = linhaDe(p.dataset.acao);
      linha?.classList.add('mt-sob');
      linha?.scrollIntoView({ block: 'nearest' });
    });
    r.querySelector('.mt-rolar').addEventListener('pointerover', (e) => {
      const linha = e.target.closest('.mt-linha');
      r.querySelectorAll('.mt-p.mt-sob').forEach((x) => x.classList.remove('mt-sob'));
      if (linha) r.querySelectorAll(`.mt-p[data-acao="${CSS.escape(linha.dataset.acao)}"]`).forEach((x) => x.classList.add('mt-sob'));
    });
    // a janela de pegar a tecla: o mouse só conta dentro da zona (fora, os botões funcionam)
    const zona = r.querySelector('.mt-zona');
    zona.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const ent = ['MouseLeft', 'MouseMiddle', 'MouseRight', 'MouseX1', 'MouseX2'][e.button];
      if (ent) this.atribuir(ent);
    });
    zona.addEventListener('contextmenu', (e) => e.preventDefault());
    zona.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY) this.atribuir(e.deltaY > 0 ? 'RodaBaixo' : 'RodaCima');
    }, { passive: false });
    // o botão "voltar" do mouse: o Chrome voltaria a página
    zona.addEventListener('mouseup', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
    r.querySelector('[data-cancelar]').addEventListener('click', () => this.pararDePegar());
    r.querySelector('[data-tirar]').addEventListener('click', () => {
      const id = this.pegando?.id;
      const noCarro = this.pegando?.carro;
      this.pararDePegar();
      if (!id) return;
      if (noCarro) {
        mapaTeclas.limparCarro(id);
        this.avisar(`${id === 'troca' ? 'A troca de modo' : rotulo(id, this.layout)} ficou sem tecla${id === 'troca' ? ` (o ${rotulo(ENTRA_CARRO, this.layout)} continua trocando)` : ' no carro'}.`);
        return;
      }
      mapaTeclas.limpar(id);
      this.avisar(`${rotulo(id, this.layout)} ficou sem tecla.`);
    });
    this.atualizar();
  }

  // escreve as teclas de cada ação no desenho e na lista
  atualizar() {
    const r = this.raiz;
    const ligado = mapaTeclas.carroLigado();
    r.querySelector('[data-carro-liga]').checked = ligado;
    r.querySelector('[data-carro-tecla]').textContent = visiveis(ENTRA_CARRO).filter((e) => !ehRoda(e)).map(nomeEntrada).join(' / ') || 'sem tecla';
    r.querySelector('[data-carro-lista]').classList.toggle('mt-carro-off', !ligado);
    for (const linha of r.querySelectorAll('.mt-linha[data-carro]')) {
      const id = linha.dataset.carro;
      const es = mapaTeclas.entradasCarro(id);
      linha.querySelector('.mt-teclas').innerHTML = es.length
        ? es.map((e) => `<span class="mt-k">${esc(nomeEntrada(e))}<button type="button" data-tirar-carro="${esc(e)}" aria-label="Tirar ${esc(nomeEntrada(e))}" title="Tirar">×</button></span>`).join('')
        : '<span class="mt-vazio">sem tecla</span>';
      linha.classList.toggle('mt-mudou', !mapaTeclas.padraoCarro(id));
    }
    for (const linha of r.querySelectorAll('.mt-linha[data-acao]')) {
      const id = linha.dataset.acao;
      const es = mapaTeclas.entradas(id);
      linha.querySelector('.mt-teclas').innerHTML = es.length
        ? es.map((e) => `<span class="mt-k">${esc(nomeEntrada(e))}<button type="button" data-tirar-entrada="${esc(e)}" aria-label="Tirar ${esc(nomeEntrada(e))}" title="Tirar">×</button></span>`).join('')
        : '<span class="mt-vazio">sem tecla</span>';
      linha.classList.toggle('mt-mudou', !mapaTeclas.padrao(id));
    }
    for (const t of r.querySelectorAll('[data-rot]')) {
      const id = t.dataset.rot;
      const es = visiveis(id).map((e) => nomeEntrada(e).replace(' (lateral)', ''));
      t.textContent = id === 'tp' ? (es.length ? `${es[0]} + mouse` : '') : es.length > 2 ? `${es.slice(0, 2).join(' / ')} …` : es.join(' / ');
      t.classList.toggle('mt-t-vazio', !es.length);
    }
    for (const t of r.querySelectorAll('[data-eixos]')) {
      const p = t.dataset.eixos;
      const um = (id) => mapaTeclas.entradas(id).map(nomeEntrada)[0];
      const ks = [`${p}y-`, `${p}x-`, `${p}y+`, `${p}x+`].map(um);
      t.textContent = ks.some(Boolean) ? ks.map((k) => k || '·').join(' ') : (p === 'r' ? 'só o mouse' : '');
    }
    r.querySelector('[data-restaurar]').disabled = !mapaTeclas.personalizado();
  }

  pegar(id, somar, carro = false) {
    if (carro ? !CARRO_ACOES.includes(id) : !ACOES.some((a) => a.id === id)) return;
    this.pegando = { id, somar, carro };
    const box = this.raiz.querySelector('.mt-pegar');
    const nome = carro ? CARRO_NOME[id] : ACOES.find((a) => a.id === id).nome;
    box.querySelector('.mt-pegar-tit').innerHTML = `${somar ? 'Mais uma tecla para' : 'Nova tecla para'} <b>${esc(carro ? rotuloCarro(id, this.layout) : rotulo(id, this.layout))}</b> <small>${esc(nome)}</small>`;
    box.hidden = false;
    this.raiz.querySelector('.mt-zona').focus();
    this.acender(id, true);
  }

  pararDePegar() {
    this.pegando = null;
    this.raiz.querySelector('.mt-pegar').hidden = true;
    this.raiz.querySelector('.mt-card').focus();
    this.raiz.querySelectorAll('.mt-p.mt-escolhida').forEach((x) => x.classList.remove('mt-escolhida'));
  }

  atribuir(entrada) {
    const p = this.pegando;
    if (!p) return;
    if (p.carro) {
      const rc = mapaTeclas.definirCarro(p.id, entrada, p.somar);
      if (rc.erro) return this.avisar(rc.erro, true);
      this.pararDePegar();
      const nome = nomeEntrada(entrada);
      if (p.id === 'troca') this.avisar(`${nome} agora só troca a pé / no carro (não aperta nada no jogo).${rc.tirou ? ` Antes era ${rotuloCarro(rc.tirou, this.layout)} no carro.` : ''}`);
      else this.avisar(`No carro, ${nome} agora é ${rotulo(p.id, this.layout)}${rc.tirou ? ` (antes era ${rotuloCarro(rc.tirou, this.layout)})` : ''}. A pé, ${nome} continua como está no mapa.`);
      return;
    }
    const r = mapaTeclas.definir(p.id, entrada, p.somar);
    if (r.erro) {
      this.avisar(r.erro, true);
      return;
    }
    this.pararDePegar();
    const nome = nomeEntrada(entrada);
    let txt = `${nome} agora é ${rotulo(p.id, this.layout)}.`;
    if (r.tirou) txt += ` Antes ${nome} era ${rotulo(r.tirou, this.layout)}${EIXO[r.tirou] ? ` (${ACOES.find((a) => a.id === r.tirou).nome.toLowerCase()})` : ''}: ${mapaTeclas.entradas(r.tirou).length ? 'ficou com as outras teclas dele.' : 'ficou sem tecla — escolha outra para ele.'}`;
    this.avisar(txt, !!r.tirou && !mapaTeclas.entradas(r.tirou).length);
  }

  avisar(txt, alerta = false) {
    const a = this.raiz.querySelector('.mt-aviso');
    if (!a) return;
    a.textContent = txt;
    a.classList.toggle('mt-alerta', alerta);
  }

  acender(id, escolhida = false) {
    this.raiz.querySelectorAll(`.mt-p[data-acao="${CSS.escape(id)}"]`).forEach((x) => x.classList.add(escolhida ? 'mt-escolhida' : 'mt-on'));
  }

  // o teclado inteiro fica com o painel enquanto ele está aberto (nada vai para o jogo)
  tecla(e, desce) {
    if (!this.aberto) return;
    // o Tab anda pelos botões do painel (fora da hora de pegar a tecla)
    if (!this.pegando && e.code === 'Tab') {
      e.stopImmediatePropagation();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.pegando) {
      if (desce && !e.repeat) this.atribuir(e.code);
      return;
    }
    // Esc solto: fecha (se o Esc está mapeado, ele acende antes, no teste)
    if (desce) {
      if (e.repeat) return;
      const id = mapaTeclas.acao(e.code);
      if (mapaTeclas.trocaCarro(e.code)) this.avisar(`${nomeEntrada(e.code)} → troca a pé / no carro${mapaTeclas.carroLigado() ? '' : ' (marque a caixa do modo carro)'}`);
      else if (id) {
        this.acesas.set(e.code, id);
        this.acender(id);
        this.avisar(`${nomeEntrada(e.code)} → ${rotulo(id, this.layout)}`);
      } else if (e.code === 'Escape') this.fechar();
      else this.avisar(`${nomeEntrada(e.code)} não aperta nada no controle (vai como tecla para o jogo).`);
      return;
    }
    const id = this.acesas.get(e.code);
    this.acesas.delete(e.code);
    if (id && ![...this.acesas.values()].includes(id)) {
      this.raiz.querySelectorAll(`.mt-p.mt-on[data-acao="${CSS.escape(id)}"]`).forEach((x) => x.classList.remove('mt-on'));
    }
  }
}
