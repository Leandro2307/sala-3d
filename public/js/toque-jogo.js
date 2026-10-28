// Controle de toque do modo jogo (celular): joga num PC de longe pela tela do celular.
//
// No computador o modo jogo prende o ponteiro e usa o teclado (ver controle.js). No celular não
// há nem um nem outro: por cima da tela vem um controle como o dos jogos de celular —
//   - analógico à esquerda: vira W A S D (empurrado até a borda para a frente, corre);
//   - arrastar o dedo no resto da tela: gira a câmera (o mesmo delta do mouse no modo jogo);
//   - botões à direita e em cima: os do jogo que está na tela.
//
// Cada jogo tem o seu layout (LAYOUTS): Minecraft, God of War e um genérico para os outros. O
// ajudante do Windows de quem compartilha diz que programa está na janela; a sala dele conta o
// nome do jogo como título da tela (jogoDaJanela) e aqui o layout troca sozinho. O nome do layout,
// no canto de cima, abre a escolha à mão e a sensibilidade.
//
// Menu do jogo (inventário, pausa, mapa): o PC mostra o cursor. Os botões que abrem um menu trocam
// os da direita pelos de menu, e a tela vira tela de toque: o cursor de lá vai para baixo do dedo
// e tocar (sem arrastar) clica ali mesmo.
//
// Tudo vai por controle.mandar/mover: o modo jogo marca cada evento e o ajudante nativo do PC
// manda como scancode e movimento relativo, igual ao mouse e ao teclado de verdade.

const DEAD = 0.25; // zona morta do analógico
const CORRE = 0.95; // empurrar até a borda (para a frente) corre
const OLHAR = 2.2; // pixels do dedo -> pixels de mouse (vezes a sensibilidade)
const MOVE_MS = 16;
const TOQUE_PX = 12; // no menu, o dedo que andou menos que isso até soltar clicou (mais é arrastar)
const CHAVE_SENS = 'sala3d-toque-sens';

const ESPECIAIS = {
  Space: [' ', 32], ShiftLeft: ['Shift', 16], ControlLeft: ['Control', 17], AltLeft: ['Alt', 18],
  Escape: ['Escape', 27], Tab: ['Tab', 9], Enter: ['Enter', 13],
};
// code ("KeyW", "Digit1", "F5") -> key e keyCode do navegador
function teclaDe(code) {
  if (ESPECIAIS[code]) return { key: ESPECIAIS[code][0], kc: ESPECIAIS[code][1] };
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return { key: m[1].toLowerCase(), kc: m[1].charCodeAt(0) };
  m = /^Digit(\d)$/.exec(code);
  if (m) return { key: m[1], kc: 48 + Number(m[1]) };
  m = /^F(\d{1,2})$/.exec(code);
  if (m) return { key: code, kc: 111 + Number(m[1]) };
  return { key: code, kc: 0 };
}

// Jogos com layout próprio: pelo título da janela ou pelo nome do programa (sem o .exe). O
// Minecraft Java roda no javaw (genérico): ali vale o título.
const JOGOS = [
  { id: 'gow', nome: 'God of War', titulo: /god of war/i, programa: /^gowr?$/i },
  { id: 'minecraft', nome: 'Minecraft', titulo: /minecraft|lunar client|badlion/i, programa: /^minecraft/i },
];

// Quem compartilha: { titulo, programa } da janela (o ajudante diz) -> o nome do jogo, ou null.
// Só o nome vai para a sala, nunca o título da janela (na tela inteira ele pode ser uma conversa).
export function jogoDaJanela({ titulo = '', programa = '' } = {}) {
  return JOGOS.find((j) => j.titulo.test(String(titulo)) || j.programa.test(String(programa)))?.nome ?? null;
}

// quem controla: o título da tela (o nome do jogo) -> o layout
const layoutDoTitulo = (titulo) => JOGOS.find((j) => j.titulo.test(String(titulo || '')))?.id ?? 'generico';

// Botão: r = rótulo, k = a tecla no PC (miúda, embaixo), a = lugar na grade, e o que ele faz:
//   tecla: 'KeyE'                  segura enquanto o dedo está nele
//   mouse: 'left'                  idem, com um botão do mouse
//   combo: ['KeyQ', 'mouse:left']  aperta junto (na ordem) e solta ao contrário
//   trava: 'ShiftLeft'             liga e desliga (agachar, mirar)
//   menu: true                     abre um menu do jogo: os botões da direita viram os de menu
//   texto: true                    abre o teclado do celular (chat)
// Grade da direita: linhas p (baixa), m (média) e g (grande); cada coluna tem a largura de um
// botão grande. Os tamanhos ficam no CSS (--tj-p, --tj-m, --tj-g), que encolhe nos celulares baixos.
const MENU_PADRAO = {
  areas: ['enter enter enter', 'dir clicar clicar', 'dir clicar clicar'],
  linhas: 'pgg',
  botoes: [
    { r: 'Enter', tecla: 'Enter', a: 'enter' },
    { r: 'Clique dir.', mouse: 'right', a: 'dir' },
    { r: 'Clicar', mouse: 'left', a: 'clicar', cls: 'tj-forte' },
  ],
};

const LAYOUTS = {
  minecraft: {
    nome: 'Minecraft',
    dica: 'Bater segurando quebra o bloco; o ⋯ da barra abre o inventário.',
    correr: 'ControlLeft', // Ctrl desce antes do W: é assim que o Minecraft entende "correr"
    escFecha: true, // o Esc fecha qualquer tela do Minecraft (inventário, pausa, baú)
    texto: { abre: 'KeyT', cancela: 'Escape', dica: 'Mensagem ou /comando' },
    hotbar: true,
    topo: [
      { r: 'Chat', k: 'T', texto: true },
      { r: 'Pausar', k: 'Esc', tecla: 'Escape', menu: true },
    ],
    areas: ['soltar correr camera', 'agachar usar bater', 'agachar pular pular'],
    linhas: 'pgg',
    botoes: [
      { r: 'Soltar', k: 'Q', tecla: 'KeyQ', a: 'soltar' },
      { r: 'Correr', k: 'Ctrl', trava: 'ControlLeft', a: 'correr' },
      { r: 'Câmera', k: 'F5', tecla: 'F5', a: 'camera' },
      { r: 'Agachar', k: 'Shift', trava: 'ShiftLeft', a: 'agachar' },
      { r: 'Usar', mouse: 'right', a: 'usar' },
      { r: 'Bater', mouse: 'left', a: 'bater', cls: 'tj-forte' },
      { r: 'Pular', k: 'Espaço', tecla: 'Space', a: 'pular', cls: 'tj-redondo' },
    ],
    // no inventário: Shift+clique passa a pilha inteira, clique direito divide, Q joga fora
    menu: {
      areas: ['shift shift soltar', 'dir clicar clicar', 'dir clicar clicar'],
      linhas: 'pgg',
      botoes: [
        { r: 'Shift + clique', k: 'passa a pilha', combo: ['ShiftLeft', 'mouse:left'], a: 'shift' },
        { r: 'Soltar', k: 'Q', tecla: 'KeyQ', a: 'soltar' },
        { r: 'Clique dir.', k: 'divide', mouse: 'right', a: 'dir' },
        { r: 'Clicar', mouse: 'left', a: 'clicar', cls: 'tj-forte' },
      ],
    },
  },
  // os comandos de fábrica do God of War (2018) no PC
  gow: {
    nome: 'God of War',
    dica: 'Mirar liga e desliga: com ele aceso, Leve e Pesado arremessam o machado.',
    correr: 'ShiftLeft',
    topo: [
      { r: 'Virar', k: 'X', tecla: 'KeyX' },
      { r: 'Flechas', k: 'T', tecla: 'KeyT' },
      { r: 'Mapa', k: 'M', tecla: 'KeyM', menu: true },
      { r: 'Menu', k: 'Esc', tecla: 'Escape', menu: true },
    ],
    areas: [
      'runico forte furia travar',
      'atreus interagir machado mirar',
      'defender pesado leve leve',
      'esquiva esquiva leve leve',
    ],
    linhas: 'mmgg',
    botoes: [
      { r: 'Rúnico', k: 'Q+esq.', combo: ['KeyQ', 'mouse:left'], a: 'runico' },
      { r: 'Rúnico forte', k: 'Q+dir.', combo: ['KeyQ', 'mouse:right'], a: 'forte' },
      { r: 'Fúria', k: 'Shift+meio', combo: ['ShiftLeft', 'mouse:middle'], a: 'furia', cls: 'tj-ouro' },
      { r: 'Travar', k: 'meio', mouse: 'middle', a: 'travar' },
      { r: 'Atreus', k: 'F', tecla: 'KeyF', a: 'atreus' },
      { r: 'Interagir', k: 'E', tecla: 'KeyE', a: 'interagir' },
      { r: 'Machado', k: 'R: volta', tecla: 'KeyR', a: 'machado' },
      { r: 'Mirar', k: 'Ctrl', trava: 'ControlLeft', a: 'mirar' },
      { r: 'Defender', k: 'Q', tecla: 'KeyQ', a: 'defender' },
      { r: 'Pesado', k: 'dir.', mouse: 'right', a: 'pesado' },
      { r: 'Leve', k: 'esq.', mouse: 'left', a: 'leve', cls: 'tj-forte' },
      { r: 'Esquiva', k: 'Espaço', tecla: 'Space', a: 'esquiva', cls: 'tj-redondo' },
    ],
  },
  // qualquer outro jogo de PC: as teclas mais comuns, com o nome da tecla no botão
  generico: {
    nome: 'Genérico',
    correr: 'ShiftLeft',
    texto: { dica: 'Texto para o jogo (vai com Enter)' },
    topo: [
      { r: 'Tab', tecla: 'Tab' },
      { r: 'Teclado', texto: true },
      { r: 'Esc', tecla: 'Escape', menu: true },
    ],
    areas: ['d1 d2 d3 d4', 'q e r f', 'ctrl dir clique clique', 'espaco espaco clique clique'],
    linhas: 'pmgg',
    botoes: [
      ...['1', '2', '3', '4'].map((n) => ({ r: n, tecla: `Digit${n}`, a: `d${n}` })),
      ...['Q', 'E', 'R', 'F'].map((l) => ({ r: l, tecla: `Key${l}`, a: l.toLowerCase() })),
      { r: 'Ctrl', tecla: 'ControlLeft', a: 'ctrl' },
      { r: 'Clique dir.', mouse: 'right', a: 'dir' },
      { r: 'Clique', mouse: 'left', a: 'clique', cls: 'tj-forte' },
      { r: 'Espaço', tecla: 'Space', a: 'espaco', cls: 'tj-redondo' },
    ],
  },
};

const LINHA = { p: 'var(--tj-p)', m: 'var(--tj-m)', g: 'var(--tj-g)' };
const htmlBotao = (b) => `<button type="button"${b.cls ? ` class="${b.cls}"` : ''}${b.a ? ` style="grid-area:${b.a}"` : ''}>`
  + `<b>${b.r}</b>${b.k ? `<small>${b.k}</small>` : ''}</button>`;

function lerSens() {
  try {
    const v = Number(localStorage.getItem(CHAVE_SENS));
    return v >= 0.4 && v <= 2.5 ? v : 1;
  } catch {
    return 1;
  }
}

export class ToqueJogo {
  constructor({ raiz, controle, toast, onSair }) {
    this.raiz = raiz;
    this.controle = controle;
    this.toast = toast || (() => {});
    this.onSair = onSair;
    this.key = null;
    // tecla ou botão ("KeyW", "mouse:left") -> quantos botões da tela seguram agora: só sobe
    // quando o último solta (a Fúria aperta Shift com o analógico já correndo no Shift)
    this.seguras = new Map();
    this.presos = new Set(); // como soltar cada botão da tela que tem um dedo em cima
    this.travadas = new Map(); // botão de trava ligado (lugar na grade) -> a tecla que ele segura
    this.doStick = new Set(); // teclas que o analógico segura
    this.escolhas = new Map(); // tela -> layout escolhido à mão (fora daqui é 'auto')
    this.escolha = 'auto';
    this.detectado = 'generico';
    this.layout = null;
    this.menu = false;
    this.slot = null; // item escolhido na barra do Minecraft (0-8), depois do primeiro toque nela
    this.sens = lerSens();
    this.montar();
  }

  montar() {
    const r = this.raiz;
    r.innerHTML = `
      <div class="tj-olhar"></div>
      <button type="button" class="tj-chip" aria-haspopup="dialog"></button>
      <div class="tj-painel" role="dialog" aria-label="Botões do modo jogo" hidden>
        <p class="tj-painel-tit">Botões do controle</p>
        <div class="tj-opcoes"></div>
        <label class="tj-sens"><span>Sensibilidade</span><input type="range" min="0.4" max="2.5" step="0.1"><output></output></label>
        <button type="button" class="tj-ok">Pronto</button>
      </div>
      <div class="tj-topo"></div>
      <p class="tj-dica" hidden>Menu do jogo: toque onde quer clicar · arraste para levar o cursor</p>
      <div class="tj-stick"><div class="tj-ring"></div><div class="tj-knob"></div></div>
      <div class="tj-hotbar" hidden></div>
      <div class="tj-acoes"></div>
      <form class="tj-texto" hidden>
        <input name="t" type="text" maxlength="256" autocomplete="off" autocapitalize="off" enterkeyhint="send">
        <button type="submit">Enviar</button>
        <button type="button" class="tj-cancelar">Cancelar</button>
      </form>`;
    this.ligarStick(r.querySelector('.tj-stick'));
    this.ligarOlhar(r.querySelector('.tj-olhar'));
    r.querySelector('.tj-chip').addEventListener('click', () => (this.painel.hidden ? this.abrirPainel() : this.fecharPainel()));
    r.querySelector('.tj-ok').addEventListener('click', () => this.fecharPainel());
    r.querySelector('.tj-opcoes').addEventListener('click', (e) => {
      const id = e.target.closest('[data-layout]')?.dataset.layout;
      if (!id) return;
      this.escolha = id;
      if (this.key) this.escolhas.set(this.key, id);
      this.aplicar(id === 'auto' ? this.detectado : id);
      this.abrirPainel();
    });
    const sens = r.querySelector('.tj-sens input');
    sens.addEventListener('input', () => {
      this.sens = Number(sens.value) || 1;
      this.mostrarSens();
      try { localStorage.setItem(CHAVE_SENS, String(this.sens)); } catch { /* sem armazenamento */ }
    });
    const form = r.querySelector('.tj-texto');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = form.elements.t.value;
      if (s && this.key) this.controle.mandar(this.key, { t: 'texto', s });
      this.tocar('Enter');
      this.fecharTexto();
    });
    form.querySelector('.tj-cancelar').addEventListener('click', () => {
      const fecha = this.layout?.texto?.cancela;
      if (fecha) this.tocar(fecha);
      this.fecharTexto();
    });
    // nada de menu de toque longo, seleção de texto ou zoom por cima do jogo
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get painel() { return this.raiz.querySelector('.tj-painel'); }

  // ---------------------------------------------------------------- layout
  aplicar(id) {
    const L = LAYOUTS[id] || LAYOUTS.generico;
    if (this.layout === L) return;
    this.soltarTudo();
    this.fecharTexto();
    this.layout = L;
    this.menu = false;
    this.slot = null;
    this.raiz.dataset.layout = id;
    this.desenhar();
  }

  // monta os botões do layout (ou os do menu dele). Quem estava com o dedo num botão que some
  // solta antes: a tecla não fica presa do outro lado.
  desenhar() {
    for (const fim of [...this.presos]) fim(false);
    const L = this.layout;
    const r = this.raiz;
    r.classList.toggle('tj-no-menu', this.menu);
    r.querySelector('.tj-dica').hidden = !this.menu;
    r.querySelector('.tj-chip').innerHTML = `${L.nome}<span aria-hidden="true"> ▾</span>`;

    const topo = r.querySelector('.tj-topo');
    const doTopo = this.menu
      ? [L.escFecha ? { r: 'Fechar', k: 'Esc', tecla: 'Escape', fecha: true } : { r: 'Esc', k: 'volta', tecla: 'Escape' },
        { r: 'Voltar ao jogo', volta: true, cls: 'tj-volta' }]
      : L.topo;
    topo.innerHTML = doTopo.map(htmlBotao).join('') + '<button type="button" class="tj-sair" aria-label="Sair do modo jogo"><b>Sair</b></button>';
    topo.querySelectorAll('button:not(.tj-sair)').forEach((el, i) => this.ligar(el, doTopo[i]));
    this.segurar(topo.querySelector('.tj-sair'), () => {}, (tocou) => tocou && this.onSair?.());

    const grade = this.menu ? L.menu || MENU_PADRAO : L;
    const acoes = r.querySelector('.tj-acoes');
    acoes.style.gridTemplateAreas = grade.areas.map((l) => `"${l}"`).join(' ');
    acoes.style.gridTemplateRows = [...grade.linhas].map((c) => LINHA[c]).join(' ');
    acoes.style.gridTemplateColumns = `repeat(${grade.areas[0].split(' ').length}, var(--tj-g))`;
    acoes.innerHTML = grade.botoes.map(htmlBotao).join('');
    acoes.querySelectorAll('button').forEach((el, i) => {
      const b = grade.botoes[i];
      if (b.trava) el.classList.toggle('on', this.travadas.has(b.a));
      this.ligar(el, b);
    });

    const hotbar = r.querySelector('.tj-hotbar');
    hotbar.hidden = !L.hotbar || this.menu;
    hotbar.innerHTML = '';
    if (!hotbar.hidden) this.montarHotbar(hotbar);
  }

  // Barra de itens do Minecraft: 1 a 9 escolhem o item, e o ⋯ abre o inventário (como no
  // Minecraft de celular). O item aceso é o último tocado — o jogo pode ter começado em outro.
  montarHotbar(el) {
    el.innerHTML = Array.from({ length: 9 }, (_, i) => `<button type="button" aria-label="Item ${i + 1}"${this.slot === i ? ' class="sel"' : ''}>${i + 1}</button>`).join('')
      + '<button type="button" class="tj-inv" aria-label="Inventário (E)">⋯</button>';
    const slots = [...el.querySelectorAll('button:not(.tj-inv)')];
    slots.forEach((b, i) => this.segurar(b, () => {
      this.apertar(`Digit${i + 1}`);
      this.slot = i;
      slots.forEach((s, j) => s.classList.toggle('sel', j === i));
    }, () => this.largar(`Digit${i + 1}`)));
    this.ligar(el.querySelector('.tj-inv'), { tecla: 'KeyE', menu: true });
  }

  ligar(el, b) {
    if (b.texto) return this.segurar(el, () => {}, (tocou) => tocou && this.abrirTexto());
    if (b.volta) return this.segurar(el, () => {}, (tocou) => tocou && this.trocarMenu(false));
    if (b.trava) return this.segurar(el, () => this.travar(el, b), () => {});
    const partes = b.combo || (b.tecla ? [b.tecla] : b.mouse ? [`mouse:${b.mouse}`] : []);
    this.segurar(el, () => {
      for (const p of partes) this.apertar(p);
    }, (tocou) => {
      for (const p of [...partes].reverse()) this.largar(p);
      if (tocou && b.menu) this.trocarMenu(true);
      else if (tocou && b.fecha) this.trocarMenu(false);
    });
  }

  travar(el, b) {
    const liga = !this.travadas.has(b.a);
    if (liga) {
      this.travadas.set(b.a, b.trava);
      this.apertar(b.trava);
    } else {
      this.travadas.delete(b.a);
      this.largar(b.trava);
    }
    el.classList.toggle('on', liga);
  }

  // As travas (agachar, mirar, correr) não valem dentro do menu: Shift preso viraria Shift+clique
  // em todo item do inventário. Voltando ao jogo, apertam de novo.
  trocarMenu(on) {
    if (on === this.menu) return;
    for (const code of this.travadas.values()) {
      if (on) this.largar(code);
      else this.apertar(code);
    }
    this.menu = on;
    this.desenhar();
  }

  // ---------------------------------------------------------------- escolha do layout
  abrirPainel() {
    const p = this.painel;
    const det = this.detectado === 'generico' ? 'não reconheceu o jogo' : `reconheceu ${LAYOUTS[this.detectado].nome}`;
    const opcoes = [['auto', `Automático<small>${det}</small>`], ...Object.entries(LAYOUTS).map(([id, L]) => [id, L.nome])];
    p.querySelector('.tj-opcoes').innerHTML = opcoes
      .map(([id, txt]) => `<button type="button" data-layout="${id}"${this.escolha === id ? ' class="on" aria-pressed="true"' : ''}>${txt}</button>`).join('');
    p.querySelector('.tj-sens input').value = String(this.sens);
    this.mostrarSens();
    p.hidden = false;
  }

  fecharPainel() { this.painel.hidden = true; }

  mostrarSens() { this.painel.querySelector('.tj-sens output').textContent = `${this.sens.toFixed(1)}×`; }

  // ---------------------------------------------------------------- texto (chat)
  // O teclado do celular só abre num toque de verdade: por isso no soltar do dedo (pointerup).
  abrirTexto() {
    const t = this.layout?.texto || {};
    if (t.abre) this.tocar(t.abre);
    const form = this.raiz.querySelector('.tj-texto');
    form.elements.t.value = '';
    form.elements.t.placeholder = t.dica || 'Texto';
    form.hidden = false;
    form.elements.t.focus();
  }

  fecharTexto() {
    const form = this.raiz.querySelector('.tj-texto');
    if (form.hidden) return;
    form.hidden = true;
    form.elements.t.blur();
  }

  // ---------------------------------------------------------------- toques
  // Botão que fica apertado enquanto o dedo está nele (pular segurando, quebrar bloco segurando).
  // sobe(tocou): tocou é false quando o botão soltou sem o dedo sair dele de verdade (o celular
  // cancelou o toque, ou o botão sumiu na troca de layout) — aí só solta, sem abrir menu nem chat.
  segurar(el, desce, sobe) {
    let id = null;
    let fim = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      el.classList.add('apertado');
      navigator.vibrate?.(8);
      fim = (tocou) => {
        this.presos.delete(fim);
        id = null;
        el.classList.remove('apertado');
        sobe(tocou);
      };
      this.presos.add(fim);
      desce();
    });
    el.addEventListener('pointerup', (e) => { if (e.pointerId === id) fim(true); });
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === id) fim(false); });
  }

  ligarStick(el) {
    const knob = el.querySelector('.tj-knob');
    let id = null;
    let cx = 0, cy = 0, raio = 60;
    const aplicar = (x, y) => {
      let dx = (x - cx) / raio;
      let dy = (y - cy) / raio;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * raio}px, ${dy * raio}px)`;
      const correr = this.layout?.correr || 'ShiftLeft';
      const quer = new Set();
      if (len >= DEAD) {
        if (dy < -0.38) quer.add('KeyW');
        if (dy > 0.38) quer.add('KeyS');
        if (dx < -0.38) quer.add('KeyA');
        if (dx > 0.38) quer.add('KeyD');
        if (len >= CORRE && dy < -0.7) quer.add(correr);
      }
      el.classList.toggle('correndo', quer.has(correr));
      // a tecla de correr desce antes do W (o Minecraft só corre assim)
      for (const c of [correr, 'KeyW', 'KeyA', 'KeyS', 'KeyD']) {
        const tem = this.doStick.has(c);
        if (quer.has(c) && !tem) {
          this.doStick.add(c);
          this.apertar(c);
        } else if (!quer.has(c) && tem) {
          this.doStick.delete(c);
          this.largar(c);
        }
      }
    };
    this.soltarStick = () => {
      id = null;
      el.classList.remove('ativo', 'correndo');
      knob.style.transform = '';
      for (const c of this.doStick) this.largar(c);
      this.doStick.clear();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      raio = r.width / 2;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      el.classList.add('ativo');
      aplicar(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) aplicar(e.clientX, e.clientY);
    });
    const solta = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('ativo');
      aplicar(cx, cy);
    };
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
  }

  // No jogo, arrastar = mexer o mouse (a câmera). Só o primeiro dedo vale: o segundo dedo está
  // apertando um botão.
  // No menu é tela de toque: o cursor de lá vai para baixo do dedo (e segue o dedo que arrasta), e
  // soltar sem ter arrastado clica onde o dedo encostou — sem levar o cursor até lá aos poucos.
  ligarOlhar(el) {
    let id = null;
    let ux = 0, uy = 0, x0 = 0, y0 = 0;
    let noMenu = false; // este dedo encostou com os botões de menu na tela
    let arrastou = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.fecharPainel();
      if (id !== null) return;
      id = e.pointerId;
      ux = x0 = e.clientX;
      uy = y0 = e.clientY;
      noMenu = this.menu;
      arrastou = false;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      if (noMenu) this.cursorNoDedo(e, 'move');
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !this.key) return;
      if (noMenu) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) >= TOQUE_PX) arrastou = true;
        this.cursorNoDedo(e, 'move');
        return;
      }
      // os pontos intermediários deixam o giro liso mesmo com o celular mandando poucos eventos
      const juntos = e.getCoalescedEvents?.();
      const pts = juntos?.length ? juntos : [e];
      let dx = 0, dy = 0;
      for (const p of pts) {
        dx += p.clientX - ux;
        dy += p.clientY - uy;
        ux = p.clientX;
        uy = p.clientY;
      }
      dx = Math.round(dx * OLHAR * this.sens);
      dy = Math.round(dy * OLHAR * this.sens);
      if (dx || dy) this.controle.mover(this.key, { t: 'mouse', a: 'move', dx, dy, b: 'left', arrastando: false, mod: 0 }, MOVE_MS);
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!noMenu || arrastou) return;
      // o movimento que esperava a vez sai antes do clique (senão chegaria depois e tiraria o
      // cursor do lugar); o tremido do dedo não muda onde o clique cai
      this.controle.enviarMove();
      const ponto = { clientX: x0, clientY: y0 };
      this.cursorNoDedo(ponto, 'down');
      this.cursorNoDedo(ponto, 'up');
    });
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === id) id = null; });
  }

  // Leva o cursor do PC ao ponto da imagem embaixo do dedo (x, y de 0 a 1, descontadas as faixas
  // pretas em volta) e, com 'down'/'up', clica ali. Nas faixas pretas não faz nada.
  cursorNoDedo(e, a) {
    const video = this.controle.jogo?.video;
    if (!this.key || !video) return;
    const p = this.controle.ponto(video, e);
    if (!p.dentro) return;
    const ev = { t: 'mouse', a, x: p.x, y: p.y, b: 'left', n: 1, mod: 0, abs: true };
    if (a === 'move') this.controle.mover(this.key, ev, MOVE_MS);
    else this.controle.mandar(this.key, ev);
  }

  // ---------------------------------------------------------------- envio
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

  // aperta e solta (um toque)
  tocar(p) {
    this.apertar(p);
    this.largar(p);
  }

  enviar(p, desce) {
    if (!this.key) return;
    const a = desce ? 'down' : 'up';
    if (p.startsWith('mouse:')) {
      this.controle.mandar(this.key, { t: 'mouse', a, x: 0.5, y: 0.5, b: p.slice(6), n: 1, mod: 0 });
      return;
    }
    const t = teclaDe(p);
    this.controle.mandar(this.key, { t: 'tecla', a, key: t.key, code: p, kc: t.kc, mod: 0 });
  }

  // solta tudo o que a tela segura (botões, analógico, travas) — antes de trocar de layout e de sair
  soltarTudo() {
    for (const fim of [...this.presos]) fim(false);
    this.soltarStick?.();
    for (const p of this.seguras.keys()) this.enviar(p, false);
    this.seguras.clear();
    this.travadas.clear();
  }

  // ---------------------------------------------------------------- ligar e desligar
  // titulo: o título da tela (a sala de quem compartilha põe nele o nome do jogo reconhecido)
  mostrar(key, titulo) {
    this.key = key;
    this.detectado = layoutDoTitulo(titulo);
    this.escolha = this.escolhas.get(key) || 'auto';
    this.layout = null;
    this.aplicar(this.escolha === 'auto' ? this.detectado : this.escolha);
    this.raiz.hidden = false;
    document.body.classList.add('toque-jogo');
    const nome = this.layout.nome;
    this.toast(this.layout === LAYOUTS.generico
      ? `Modo jogo: analógico anda, arraste o dedo para olhar. Toque em “${nome}”, no canto, para usar os botões do Minecraft ou do God of War.`
      : `Modo jogo com os botões do ${nome}: analógico anda, arraste o dedo para olhar. ${this.layout.dica}`, 'info', 7000);
  }

  // A sala de quem compartilha contou qual jogo está na tela: troca sozinho, a não ser que a
  // pessoa tenha escolhido à mão.
  jogoDaTela(key, titulo) {
    if (key !== this.key) return;
    const id = layoutDoTitulo(titulo);
    if (id === this.detectado) return;
    this.detectado = id;
    if (!this.painel.hidden) this.abrirPainel();
    if (this.escolha !== 'auto') return;
    this.aplicar(id);
    if (id !== 'generico') this.toast(`${LAYOUTS[id].nome} na tela: o controle passou para os botões dele.`, 'info', 4000);
  }

  esconder() {
    this.soltarTudo();
    this.fecharTexto();
    this.fecharPainel();
    this.menu = false;
    this.key = null;
    this.raiz.hidden = true;
    document.body.classList.remove('toque-jogo');
  }
}
