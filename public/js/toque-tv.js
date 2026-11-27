// O celular como controle da TV (/tv?controle=1): o mesmo jeito do modo jogo do celular (layout PS5 do
// toque-jogo.js), sem imagem por baixo — ela está na TV.
//   - analógico esquerdo flutuante: nasce embaixo do polegar em qualquer ponto da metade esquerda;
//   - arrastar o dedo no resto da tela é o analógico direito, e um anel mostra o centro dele;
//   - os quatro botões com L1/L2/R1/R2 em volta, e Create, PS, Options... na barra de cima.
// A mais que lá: o direcional é uma cruz inteira (o dedo escorrega de uma seta para a outra e as
// diagonais valem), a base do analógico vai atrás do dedo que passou da borda (inverter o lado responde
// na hora), o tamanho dos botões, e L1/L2 na mão esquerda para quem mira e anda a câmera ao mesmo tempo.
//
// O estado sai em `estado` ({ b, lx, ly, rx, ry, lt, rt }, ver pad-virtual.js) e aoMudar() avisa o tv.js.

const CHAVE = 'sala3d-tv-toque';
const MIN_MS = 50; // um toque rápido vale pelo menos isso: o jogo lê o controle a cada quadro e perderia o aperto
const RAIO_DIR = 70; // px do dedo até o fundo do analógico direito (dividido pela sensibilidade)
const DPAD_MORTO = 0.22; // miolo da cruz que não aperta nada
// giroscópio no analógico direito, em graus por segundo (os mesmos números do toque-jogo.js)
const GIRO_MORTO = 4;
const GIRO_CHEIO = 160;
const GIRO_BASE = 0.16;
const PADRAO = { sens: 1, tam: 1, vibrar: true, giro: false, esq: false, pos: {} };
const arred = (v) => Math.round(v * 1000) / 1000;
const entre = (v, a, b) => Math.min(b, Math.max(a, v));

// os símbolos desenhados: o △ □ ○ da fonte sai pequeno e torto em parte dos celulares
const icone = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const TRI = icone('<path d="M12 4 21 19.5H3Z"/>');
const QUA = icone('<rect x="4.5" y="4.5" width="15" height="15"/>');
const BOL = icone('<circle cx="12" cy="12" r="8.5"/>');
const XIS = icone('<path d="M5 5 19 19M19 5 5 19"/>');
const TOPO = [['L3', 10], ['R3', 11], ['Touch', 17], ['PS', 16]]; // sem Create e Options: travados como o PS
const ACOES = [
  ['L2', 6, 'l2', ''], [TRI, 3, 'tri', 'tt-ps tt-tri'], ['R2', 7, 'r2', ''],
  [QUA, 2, 'qua', 'tt-ps tt-qua'], [BOL, 1, 'bol', 'tt-ps tt-bol'],
  ['L1', 4, 'l1', ''], [XIS, 0, 'xis', 'tt-ps tt-xis'], ['R1', 5, 'r1', ''],
];

function ler() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { /* sem armazenamento */ }
  const a = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
  if (!a.pos || typeof a.pos !== 'object') a.pos = {};
  a.sens = entre(Number(a.sens) || 1, 0.5, 2);
  a.tam = entre(Number(a.tam) || 1, 0.85, 1.15);
  return a;
}

export class ToqueTv {
  constructor({ raiz, estado, aoMudar, onSair, onTelaCheia, aviso }) {
    Object.assign(this, { raiz, estado, aoMudar, onSair, onTelaCheia, aviso });
    this.op = ler();
    this.dedos = new Map(); // bit -> quantos dedos seguram
    this.desde = new Map(); // bit -> quando desceu
    this.timers = new Map(); // bit -> o soltar que espera o MIN_MS
    this.fins = new Set(); // como soltar o que tem um dedo em cima (trocar de tela, sair)
    this.dir = { x: 0, y: 0 }; // o dedo no analógico direito
    this.giro = { x: 0, y: 0 };
    this.editando = false;
    this.montar();
  }

  montar() {
    const r = this.raiz;
    const bt = (rot, bit, extra = '') => `<button type="button" class="tt-b" data-b="${bit}"${extra}>${rot}</button>`;
    r.innerHTML = `
      <div class="tt-olhar"></div>
      <div class="tt-zona"></div>
      <p class="tt-marca" aria-hidden="true">arraste aqui: câmera</p>
      <div class="tt-anel" hidden><i></i></div>
      <button type="button" class="tt-chip" aria-haspopup="dialog"><i></i><span class="tt-status">Conectando…</span> ▾</button>
      <div class="tt-topo">${TOPO.map(([n, b]) => bt(n, b)).join('')}<button type="button" class="tt-sair">Sair</button></div>
      <div class="tt-dpad" data-m="dpad">
        <b class="c" data-d="12">▲</b><b class="b" data-d="13">▼</b><b class="e" data-d="14">◀</b><b class="d" data-d="15">▶</b>
      </div>
      <div class="tt-stick" data-m="stick"><u></u><i></i></div>
      <div class="tt-acoes">${ACOES.map(([n, b, a, c]) => `<button type="button" class="tt-b ${c}" data-b="${b}" data-a="${a}" data-m="${a}">${n}</button>`).join('')}</div>
      <p class="tt-edicao" hidden>Arraste os botões para onde quiser <button type="button" class="tt-fim">Pronto</button></p>
      <div class="tt-painel" role="dialog" aria-label="Ajustes do controle" hidden>
        <p class="tt-tit">Ajustes do controle</p>
        <label class="tt-faixa"><span>Sensibilidade da câmera</span><output></output><input type="range" data-op="sens" min="0.5" max="2" step="0.1"></label>
        <label class="tt-faixa"><span>Tamanho dos botões</span><output></output><input type="range" data-op="tam" min="0.85" max="1.15" step="0.05"></label>
        <label><input type="checkbox" data-op="esq"><span>L1 e L2 na mão esquerda</span></label>
        <label><input type="checkbox" data-op="vibrar"><span>Vibrar ao tocar</span></label>
        <label><input type="checkbox" data-op="giro"><span>Mirar virando o celular</span></label>
        <div class="tt-linha"><button type="button" class="tt-mover">Mover botões</button><button type="button" class="tt-restaurar">Lugar original</button></div>
        <div class="tt-linha"><button type="button" class="tt-cheia">Tela cheia</button><button type="button" class="tt-ok">Pronto</button></div>
      </div>
      <div class="tt-gire"><div><b>Gire o celular</b><p>O controle funciona com o celular deitado.</p><button type="button" class="tt-sair">Sair do jogo</button></div></div>`;
    const $ = (s) => r.querySelector(s);
    this.painel = $('.tt-painel');
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('gesturestart', (e) => e.preventDefault()); // pinça do iPhone
    // toque duplo e pinça do Safari dariam zoom por cima do controle
    r.addEventListener('touchmove', (e) => { if (!e.target.closest('.tt-painel')) e.preventDefault(); }, { passive: false });
    r.querySelectorAll('.tt-b').forEach((el) => this.ligarBotao(el, Number(el.dataset.b)));
    this.ligarDpad($('.tt-dpad'));
    this.ligarStick($('.tt-stick'), $('.tt-zona'));
    this.ligarOlhar($('.tt-olhar'), $('.tt-anel'));
    this.ligarEditor();
    r.querySelectorAll('.tt-sair').forEach((el) => el.addEventListener('click', () => this.onSair()));
    $('.tt-chip').addEventListener('click', () => (this.painel.hidden ? this.abrirPainel() : this.fecharPainel()));
    $('.tt-ok').addEventListener('click', () => this.fecharPainel());
    $('.tt-cheia').addEventListener('click', () => { this.fecharPainel(); this.onTelaCheia(); });
    $('.tt-mover').addEventListener('click', () => this.editar(true));
    $('.tt-fim').addEventListener('click', () => this.editar(false));
    $('.tt-restaurar').addEventListener('click', () => {
      this.op.pos = {};
      this.gravar();
      this.aplicar();
    });
    this.painel.addEventListener('input', (e) => this.mudarOpcao(e.target));
    // a tela apagou ou a pessoa saiu da página com um dedo em cima: nada fica apertado no jogo
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.soltarTudo(); });
    addEventListener('blur', () => this.soltarTudo());
    addEventListener('devicemotion', (e) => this.aoGirar(e));
    this.aplicar();
  }

  // ---------------------------------------------------------------- opções
  gravar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(this.op)); } catch { /* sem armazenamento */ }
  }

  aplicar() {
    const r = this.raiz;
    r.style.setProperty('--k', String(this.op.tam));
    r.classList.toggle('tt-esq', !!this.op.esq);
    r.querySelectorAll('[data-m]').forEach((el) => {
      const p = this.op.pos[el.dataset.m];
      el.style.translate = p ? `${p[0]}px ${p[1]}px` : '';
    });
    for (const el of this.painel.querySelectorAll('[data-op]')) {
      const v = this.op[el.dataset.op];
      if (el.type === 'checkbox') el.checked = !!v;
      else {
        el.value = String(v);
        el.parentElement.querySelector('output').textContent = el.dataset.op === 'sens' ? `${v.toFixed(1)}×` : `${Math.round(v * 100)}%`;
      }
    }
  }

  async mudarOpcao(el) {
    const k = el.dataset.op;
    if (!k) return;
    let v = el.type === 'checkbox' ? el.checked : Number(el.value);
    // iPhone: o giroscópio só com a permissão, pedida no toque
    if (k === 'giro' && v && typeof DeviceMotionEvent?.requestPermission === 'function') {
      v = (await DeviceMotionEvent.requestPermission().catch(() => 'denied')) === 'granted';
      if (!v) this.aviso('Sem permissão para o giroscópio: libere em Ajustes → Safari → Movimento e orientação.', 'alerta', 6000);
    }
    this.op[k] = v;
    if (k === 'giro' && !v) this.girar(0, 0);
    // L1/L2 mudaram de lado: o lugar que a pessoa tinha arrastado era contado do lado antigo
    if (k === 'esq') {
      delete this.op.pos.l1;
      delete this.op.pos.l2;
    }
    this.gravar();
    this.aplicar();
  }

  abrirPainel() { this.painel.hidden = false; }
  fecharPainel() { this.painel.hidden = true; }

  // tipo: 'ok' (os botões estão indo), 'espera' ou 'ruim'
  status(txt, tipo, ps5) {
    const chip = this.raiz.querySelector('.tt-chip');
    chip.dataset.tipo = tipo;
    const el = chip.querySelector('.tt-status');
    if (el.textContent !== txt) el.textContent = txt;
    this.raiz.classList.toggle('tt-pc', !ps5); // no PC não há touchpad
  }

  // ---------------------------------------------------------------- estado
  vibrar() {
    if (!this.op.vibrar) return;
    try { navigator.vibrate?.(8); } catch { /* sem motor */ }
  }

  apertar(bit) {
    clearTimeout(this.timers.get(bit));
    const n = (this.dedos.get(bit) || 0) + 1;
    this.dedos.set(bit, n);
    if (n > 1) return;
    this.desde.set(bit, performance.now());
    this.porBit(bit, true);
    this.vibrar();
  }

  largar(bit) {
    const n = (this.dedos.get(bit) || 0) - 1;
    this.dedos.set(bit, Math.max(0, n));
    if (n > 0) return;
    const falta = MIN_MS - (performance.now() - (this.desde.get(bit) || 0));
    clearTimeout(this.timers.get(bit));
    if (falta <= 0) this.porBit(bit, false);
    else this.timers.set(bit, setTimeout(() => this.porBit(bit, false), falta));
  }

  // L2 e R2 também vão como gatilho inteiro
  porBit(bit, on) {
    const e = this.estado;
    e.b = on ? e.b | (1 << bit) : e.b & ~(1 << bit);
    if (bit === 6) e.lt = on ? 1 : 0;
    if (bit === 7) e.rt = on ? 1 : 0;
    this.aoMudar();
  }

  // o analógico direito: o dedo manda; sem dedo, o giroscópio
  porDireito() {
    const v = this.dir.x || this.dir.y ? this.dir : this.giro;
    this.estado.rx = arred(v.x);
    this.estado.ry = arred(v.y);
    this.aoMudar();
  }

  soltarTudo() {
    for (const fim of [...this.fins]) fim();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.dedos.clear();
    this.dir = { x: 0, y: 0 };
    this.giro = { x: 0, y: 0 };
    Object.assign(this.estado, { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
    this.aoMudar();
  }

  // ---------------------------------------------------------------- dedos
  // Um dedo por vez em cada peça (outro dedo na mesma peça não conta). desce(e) devolve false para
  // ignorar; sobe() roda uma vez só, seja qual for o jeito que o toque acabou.
  dedo(el, { desce, move, sobe }) {
    let id = null;
    const fim = () => {
      if (id === null) return;
      id = null;
      this.fins.delete(fim);
      sobe();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null || this.editando) return;
      this.fecharPainel();
      id = e.pointerId;
      this.fins.add(fim);
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      desce(e);
    });
    if (move) el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(t, (e) => { if (e.pointerId === id) fim(); });
    }
  }

  ligarBotao(el, bit) {
    this.dedo(el, {
      desce: () => { el.classList.add('on'); this.apertar(bit); },
      sobe: () => { el.classList.remove('on'); this.largar(bit); },
    });
  }

  // A cruz: o ângulo do dedo escolhe a seta (ou duas, na diagonal), e escorregar troca sem levantar
  ligarDpad(el) {
    const braco = new Map([...el.querySelectorAll('[data-d]')].map((b) => [Number(b.dataset.d), b]));
    let agora = new Set();
    const por = (quer) => {
      for (const b of agora) if (!quer.has(b)) { braco.get(b).classList.remove('on'); this.largar(b); }
      for (const b of quer) if (!agora.has(b)) { braco.get(b).classList.add('on'); this.apertar(b); }
      agora = quer;
    };
    const ler = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 2 - 1;
      const y = (e.clientY - r.top) / r.height * 2 - 1;
      const quer = new Set();
      const len = Math.hypot(x, y);
      if (len < DPAD_MORTO) return por(quer);
      // cada seta vale 45° + 11° de cada lado: a diagonal só nos 23° do canto, para o menu não pular torto
      if (y / len < -0.56) quer.add(12);
      if (y / len > 0.56) quer.add(13);
      if (x / len < -0.56) quer.add(14);
      if (x / len > 0.56) quer.add(15);
      por(quer);
    };
    this.dedo(el, { desce: ler, move: ler, sobe: () => por(new Set()) });
  }

  // O esquerdo: no lugar dele, ou flutuante pela zona da esquerda. A base segue o dedo que passa da borda.
  ligarStick(el, zona) {
    const bola = el.querySelector('i');
    let cx = 0, cy = 0, raio = 60, ox = 0, oy = 0, usando = false;
    const aplicar = (e) => {
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > raio) {
        const sobra = (d - raio) / d;
        cx += dx * sobra;
        cy += dy * sobra;
        dx -= dx * sobra;
        dy -= dy * sobra;
      }
      el.style.transform = `translate(${cx - ox}px, ${cy - oy}px)`;
      bola.style.transform = `translate(${dx * 0.75}px, ${dy * 0.75}px)`;
      this.estado.lx = arred(dx / raio);
      this.estado.ly = arred(dy / raio);
      this.aoMudar();
    };
    const desce = (flutuante) => (e) => {
      if (usando) return;
      usando = true;
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      raio = r.width / 2;
      ox = r.left + raio;
      oy = r.top + raio;
      cx = flutuante ? e.clientX : ox;
      cy = flutuante ? e.clientY : oy;
      el.classList.add('on');
      aplicar(e);
    };
    const sobe = () => {
      usando = false;
      el.classList.remove('on');
      el.style.transform = '';
      bola.style.transform = '';
      this.estado.lx = 0;
      this.estado.ly = 0;
      this.aoMudar();
    };
    // um dedo só manda no analógico: o segundo (na zona, com o primeiro na base) não faz nada
    const ligar = (alvo, flutuante) => {
      let meu = false;
      this.dedo(alvo, {
        desce: (e) => { meu = !usando; if (meu) desce(flutuante)(e); },
        move: (e) => { if (meu) aplicar(e); },
        sobe: () => { if (meu) sobe(); meu = false; },
      });
    };
    ligar(el, false);
    ligar(zona, true);
  }

  ligarOlhar(el, anel) {
    const bola = anel.querySelector('i');
    let cx = 0, cy = 0;
    const move = (e) => {
      const raio = RAIO_DIR / this.op.sens;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > raio) {
        const sobra = (d - raio) / d;
        cx += dx * sobra;
        cy += dy * sobra;
        dx -= dx * sobra;
        dy -= dy * sobra;
      }
      anel.style.transform = `translate(${cx}px, ${cy}px)`;
      bola.style.transform = `translate(${dx}px, ${dy}px)`;
      this.dir = { x: dx / raio, y: dy / raio };
      this.porDireito();
    };
    this.dedo(el, {
      desce: (e) => {
        cx = e.clientX;
        cy = e.clientY;
        anel.style.setProperty('--r', `${RAIO_DIR / this.op.sens}px`);
        anel.hidden = false;
        this.raiz.classList.add('tt-olhou');
        move(e);
      },
      move,
      sobe: () => {
        anel.hidden = true;
        this.dir = { x: 0, y: 0 };
        this.porDireito();
      },
    });
  }

  // ---------------------------------------------------------------- giroscópio
  aoGirar(e) {
    if (this.raiz.hidden || this.editando || !this.op.giro) return;
    const r = e.rotationRate;
    if (!r || r.beta == null) return;
    const lado = (screen.orientation?.angle ?? window.orientation ?? 90) === 270 || window.orientation === -90 ? 1 : -1;
    const vx = lado * r.beta;
    const vy = lado * r.gamma;
    const v = Math.hypot(vx, vy);
    if (v < GIRO_MORTO) return this.girar(0, 0);
    const m = GIRO_BASE + (1 - GIRO_BASE) * Math.min(1, v / (GIRO_CHEIO / this.op.sens));
    this.girar((vx / v) * m, (vy / v) * m);
  }

  girar(x, y) {
    const q = (v) => Math.round(v * 50) / 50; // o tremido da mão não precisa ir pela rede
    if (this.giro.x === q(x) && this.giro.y === q(y)) return;
    this.giro = { x: q(x), y: q(y) };
    this.porDireito();
  }

  // ---------------------------------------------------------------- mover botões
  editar(on) {
    if (on) {
      this.soltarTudo();
      this.fecharPainel();
    }
    this.editando = on;
    this.raiz.classList.toggle('tt-editando', on);
    this.raiz.querySelector('.tt-edicao').hidden = !on;
  }

  ligarEditor() {
    this.raiz.addEventListener('pointerdown', (e) => {
      const el = this.editando && e.target.closest('[data-m]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const k = el.dataset.m;
      const [x0, y0] = this.op.pos[k] || [0, 0];
      const r = el.getBoundingClientRect();
      const sx = e.clientX;
      const sy = e.clientY;
      const id = e.pointerId;
      const mover = (m) => {
        if (m.pointerId !== id) return;
        // não deixa sair da tela (perdido lá fora, só o "Lugar original" traria de volta)
        const dx = entre(m.clientX - sx, -r.left, innerWidth - r.right);
        const dy = entre(m.clientY - sy, -r.top, innerHeight - r.bottom);
        this.op.pos[k] = [Math.round(x0 + dx), Math.round(y0 + dy)];
        el.style.translate = `${this.op.pos[k][0]}px ${this.op.pos[k][1]}px`;
      };
      const fim = (m) => {
        if (m.pointerId !== id) return;
        removeEventListener('pointermove', mover);
        removeEventListener('pointerup', fim);
        removeEventListener('pointercancel', fim);
        this.gravar();
      };
      addEventListener('pointermove', mover);
      addEventListener('pointerup', fim);
      addEventListener('pointercancel', fim);
    }, true);
  }

  // ---------------------------------------------------------------- mostrar e esconder
  mostrar() { this.raiz.hidden = false; }

  esconder() {
    this.editar(false);
    this.fecharPainel();
    this.soltarTudo();
    this.raiz.hidden = true;
  }
}
