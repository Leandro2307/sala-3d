// Controle remoto das abas compartilhadas.
//
// Quem compartilha uma aba e tem a extensão "Sala 3D — controle das abas" (pasta extensao/) pode
// ligar "Permitir controle" naquela tela. Aí quem estiver vendo a tela em foco clica em
// "Controlar": mouse, roda e teclado viram eventos que vão pelo servidor até quem compartilha, e a
// extensão dele repete tudo na aba de verdade.
//
// A extensão marca cada aba com um capture handle "sala3d-aba:<id>" — é assim que daqui se sabe
// qual aba do Chrome está por trás de cada vídeo capturado. Janela ou tela inteira não é aba: aí
// quem clica é o ajudante nativo da extensão (extensao/nativo), que move o mouse de verdade.
//
// Do lado de quem controla, cada imagem que aceita controle é uma "superfície": o foco 2D tem
// uma, a mesa de trabalho tem uma por monitor. Como num PC com vários monitores, o mouse vai
// para a superfície que está embaixo dele e o teclado fica com a última clicada.

const MOD = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
const BOTAO = ['left', 'middle', 'right'];
// intervalo mínimo entre movimentos de mouse (ms). O servidor corta acima de 120 eventos/s.
const MOVE_MS = 25;
const ARRASTO_MS = 16;
const RODA_MS = 30;

export class Controle {
  constructor({ emitir, toast, onExtensao }) {
    this.emitir = emitir;
    this.toast = toast;
    this.onExtensao = onExtensao;
    this.ext = { ok: false, liberado: false, versao: null };
    this.pedidos = new Map();
    this.seq = 0;
    this.superficies = new Map(); // <video> -> chave da tela
    this.teclado = null; // <video> que recebe o teclado
    this.apertadas = new Map(); // code -> { key, ev }: o keyup vai para a tela que recebeu o keydown
    this.consumidas = new Set(); // teclas que viraram atalho: o keyup delas também não sai daqui
    this.alt = null; // Alt esquerdo guardado (ver tecla())
    this.atalho = null; // (e, 'down'|'up') => true se a tecla é atalho de quem usa o Controle
    this.avisos = new Map();
    this.ultimoMove = 0;
    this.movePendente = null;
    this.moveTimer = 0;
    this.roda = null;
    this.rodaTimer = 0;
    this.arrastando = null; // { video, key, b, x, y }

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data?.sala3dExt) return;
      const m = e.data;
      if (m.sala3dExt === 'oi') {
        this.ext = { ok: true, liberado: !!m.liberado, nativo: !!m.nativo, versao: m.versao };
        this.onExtensao?.(this.ext);
      } else if (m.sala3dExt === 'resposta') {
        this.pedidos.get(m.id)?.(m.r);
        this.pedidos.delete(m.id);
      } else if (m.sala3dExt === 'desligou') {
        this.onDesligou?.(m.aba, m.motivo, !!m.janela);
      } else if (m.sala3dExt === 'capturar-aba' && typeof m.streamId === 'string') {
        this.onCapturarAba?.({ streamId: m.streamId, aba: Number(m.aba), site: m.site || null, titulo: m.titulo || '' });
      } else if (m.sala3dExt === 'aba-mudou') {
        this.onAbaMudou?.(m.aba, m.site || null, m.titulo || '');
      }
    });
    window.postMessage({ sala3d: 'ping' }, location.origin);
    this.ligarEntrada();
  }

  // ---------------------------------------------------------------- ponte com a extensão
  pedir(tipo, aba, ev, alvo) {
    return new Promise((resolve) => {
      const id = ++this.seq;
      this.pedidos.set(id, resolve);
      window.postMessage({ sala3d: tipo, aba, ev, alvo, id }, location.origin);
      setTimeout(() => {
        if (this.pedidos.delete(id)) resolve({ erro: 'sem-resposta' });
      }, 4000);
    });
  }

  // Qual aba do Chrome é esse vídeo capturado? (null = janela, tela inteira, ou aba sem a extensão)
  // A pessoa pode trocar a aba pelo "Compartilhar esta aba" do Chrome: aí avisa pelo mudou().
  abaDe(stream, mudou) {
    const track = stream.getVideoTracks()[0];
    if (!track?.getCaptureHandle) return null;
    const ler = () => {
      const m = /^sala3d-aba:(\d+)$/.exec(track.getCaptureHandle()?.handle || '');
      return m ? Number(m[1]) : null;
    };
    track.addEventListener('capturehandlechange', () => mudou(ler()));
    return ler();
  }

  // Janela ou tela inteira (não é aba): quem clica é o ajudante nativo. O Chrome põe no rótulo do
  // vídeo algo como "window:263318:0" ou "screen:0:0", e o ajudante acha a janela/monitor por ele.
  alvoDe(stream) {
    const track = stream.getVideoTracks()[0];
    const sup = track?.getSettings?.().displaySurface;
    if (sup !== 'window' && sup !== 'monitor') return null;
    return { superficie: sup, rotulo: track.label };
  }

  // A extensão 1.2 navega a aba (voltar, endereço), abre nela os links de aba nova e conta em
  // que site ela está. A 1.1 só clica e digita.
  get navega() {
    const [a, b] = String(this.ext.versao || '0').split('.').map(Number);
    return this.ext.ok && (a > 1 || (a === 1 && b >= 2));
  }

  // quais abas estou compartilhando agora (a extensão segue elas: links de aba nova, site aberto)
  informarAbas(abas) {
    if (this.ext.ok && this.ext.liberado) window.postMessage({ sala3d: 'abas', abas }, location.origin);
  }

  soltar(aba) {
    if (aba != null && this.ext.ok) this.pedir('soltar', aba);
  }

  soltarJanela() {
    if (this.ext.ok) this.pedir('janela-soltar');
  }

  // liberou de novo: destrava o ajudante (depois de um Ctrl+Alt+End ele fica parado)
  retomarJanela() {
    return this.pedir('janela-retomar');
  }

  // ---------------------------------------------------------------- quem compartilha
  // Chegou um clique/tecla de alguém para uma das minhas telas.
  async receber(sh, { ev, de, deId }) {
    if (!sh?.controle || (sh.aba == null && !sh.alvo)) return;
    // aba trocando de página (sem marca por um instante): ignora até a página nova aparecer
    if (sh.semMarca) return;
    // voltar/endereço só existe em aba; numa janela quem clica é o ajudante nativo
    if (ev?.t === 'nav' && sh.aba == null) return;
    const r = sh.aba != null ? await this.pedir('entrada', sh.aba, ev) : await this.pedir('janela', null, ev, sh.alvo);
    if (r?.erro) {
      if (r.erro !== 'sem-resposta') console.warn('[controle]', r.erro);
      return;
    }
    // avisa (de vez em quando) que alguém está mexendo
    const agora = Date.now();
    if (deId && (ev.a === 'down' || ev.t === 'tecla') && agora - (this.avisos.get(deId) || 0) > 30000) {
      this.avisos.set(deId, agora);
      this.toast(`${de} está mexendo na sua aba compartilhada`, 'info', 3500);
    }
  }

  // ---------------------------------------------------------------- quem controla
  adicionar(video, key) {
    this.superficies.set(video, key);
    video.classList.add('controlavel');
  }

  remover(video) {
    if (!this.superficies.has(video)) return;
    if (this.teclado === video) this.focar(null);
    if (this.arrastando?.video === video) this.soltarMouse();
    this.superficies.delete(video);
    video.classList.remove('controlavel', 'controlando');
  }

  // a superfície que recebe o teclado (null: o teclado volta para a sala)
  focar(video) {
    const novo = video && this.superficies.has(video) ? video : null;
    if (novo === this.teclado) return;
    this.soltarTeclas();
    this.teclado?.classList.remove('controlando');
    this.teclado = novo;
    novo?.classList.add('controlando');
  }

  tem(video) { return this.superficies.has(video); }

  get ativo() { return !!this.teclado; }

  // posição do mouse em 0..1 dentro da imagem (o vídeo fica "contain", com faixas em volta)
  ponto(v, e) {
    const r = v.getBoundingClientRect();
    const cs = getComputedStyle(v);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const cw = r.width - pl - pr;
    const ch = r.height - pt - pb;
    const vw = v.videoWidth || 16;
    const vh = v.videoHeight || 9;
    const k = Math.min(cw / vw, ch / vh);
    const dw = vw * k;
    const dh = vh * k;
    const x = (e.clientX - (r.left + pl + (cw - dw) / 2)) / dw;
    const y = (e.clientY - (r.top + pt + (ch - dh) / 2)) / dh;
    return { x, y, dentro: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
  }

  mandar(key, ev, volatil = false) {
    this.emitir('controle', { key, ev }, volatil);
  }

  // Movimento: no máximo um a cada MOVE_MS, mas o último sempre sai (senão o cursor do outro
  // lado parava um pouco antes de onde o mouse parou).
  mover(key, ev, intervalo) {
    this.movePendente = { key, ev };
    if (this.moveTimer) return;
    const falta = this.ultimoMove + intervalo - performance.now();
    if (falta <= 0) this.enviarMove();
    else this.moveTimer = setTimeout(() => this.enviarMove(), falta);
  }

  enviarMove() {
    clearTimeout(this.moveTimer);
    this.moveTimer = 0;
    const p = this.movePendente;
    this.movePendente = null;
    if (!p) return;
    this.ultimoMove = performance.now();
    this.mandar(p.key, p.ev, true);
  }

  // clique e soltura já levam a posição: um movimento atrasado depois deles só atrapalharia
  cancelarMove() {
    clearTimeout(this.moveTimer);
    this.moveTimer = 0;
    this.movePendente = null;
  }

  // Roda: soma os giros e manda um a cada RODA_MS (touchpad dispara um evento por quadro).
  girar(key, p, dx, dy, mod) {
    if (this.roda && this.roda.key !== key) this.enviarRoda();
    if (!this.roda) this.roda = { key, dx: 0, dy: 0 };
    Object.assign(this.roda, { x: p.x, y: p.y, mod });
    this.roda.dx += dx;
    this.roda.dy += dy;
    if (!this.rodaTimer) this.rodaTimer = setTimeout(() => this.enviarRoda(), RODA_MS);
  }

  enviarRoda() {
    clearTimeout(this.rodaTimer);
    this.rodaTimer = 0;
    const r = this.roda;
    this.roda = null;
    if (r) this.mandar(r.key, { t: 'wheel', x: r.x, y: r.y, dx: r.dx, dy: r.dy, mod: r.mod });
  }

  soltarMouse() {
    const a = this.arrastando;
    if (!a) return;
    this.arrastando = null;
    this.cancelarMove();
    this.mandar(a.key, { t: 'mouse', a: 'up', x: a.x, y: a.y, b: a.b, n: 1, mod: 0 });
  }

  mandarTecla(key, ev) {
    if (ev.a === 'down') this.apertadas.set(ev.code, { key, ev });
    else this.apertadas.delete(ev.code);
    this.mandar(key, ev);
  }

  // Tecla que desceu numa tela sobe nela, mesmo que o teclado tenha mudado de tela ou saído:
  // senão um Ctrl ou Shift ficaria preso apertado do outro lado.
  soltarTeclas() {
    this.alt = null;
    for (const { key, ev } of this.apertadas.values()) this.mandar(key, { ...ev, a: 'up', mod: 0 });
    this.apertadas.clear();
  }

  // outra tecla veio com o Alt apertado: aí ele é Alt de verdade e desce antes dela
  soltarAlt() {
    const alt = this.alt;
    this.alt = null;
    if (alt && !alt.usado) this.mandarTecla(alt.key, alt.ev);
  }

  ligarEntrada() {
    const sob = (e) => (this.superficies.has(e.target) ? e.target : null);
    document.addEventListener('pointerdown', (e) => {
      const v = sob(e);
      if (!v) return;
      const p = this.ponto(v, e);
      if (!p.dentro) return;
      e.preventDefault();
      // um botão que ficou com o foco levaria o Espaço e o Enter que eram para a tela
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      this.focar(v);
      this.soltarAlt();
      this.cancelarMove();
      const key = this.superficies.get(v);
      const b = BOTAO[e.button] || 'left';
      this.arrastando = { video: v, key, b, x: p.x, y: p.y };
      this.mandar(key, { t: 'mouse', a: 'down', x: p.x, y: p.y, b, n: e.detail || 1, mod: MOD(e) });
    });
    document.addEventListener('pointerup', (e) => {
      const a = this.arrastando;
      if (!a) return;
      const p = this.ponto(a.video, e);
      this.arrastando = null;
      this.cancelarMove();
      this.mandar(a.key, { t: 'mouse', a: 'up', x: p.x, y: p.y, b: BOTAO[e.button] || a.b, n: e.detail || 1, mod: MOD(e) });
    });
    document.addEventListener('pointermove', (e) => {
      const a = this.arrastando;
      const v = a ? a.video : sob(e);
      if (!v) return;
      const p = this.ponto(v, e);
      if (!a && !p.dentro) return;
      if (a) Object.assign(a, { x: p.x, y: p.y });
      const ev = { t: 'mouse', a: 'move', x: p.x, y: p.y, b: a?.b || 'left', arrastando: !!a, mod: MOD(e) };
      this.mover(this.superficies.get(v), ev, a ? ARRASTO_MS : MOVE_MS);
    });
    document.addEventListener('wheel', (e) => {
      const v = sob(e);
      if (!v) return;
      const p = this.ponto(v, e);
      if (!p.dentro) return;
      e.preventDefault();
      const f = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      this.girar(this.superficies.get(v), p, e.deltaX * f, e.deltaY * f, MOD(e));
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => {
      if (sob(e)) e.preventDefault();
    });
    // Teclado: vai para a superfície que tem o teclado. O Esc fica com a sala (sai da tela);
    // Shift+Esc manda um Esc para a tela. Pega na fase de captura para o jogo (andar, chat,
    // emotes) não reagir.
    const tecla = (a) => (e) => {
      const desceu = a === 'up' ? this.apertadas.get(e.code) : null;
      if (desceu) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.mandarTecla(desceu.key, { ...desceu.ev, a, mod: e.code === 'Escape' ? MOD(e) & ~8 : MOD(e) });
        return;
      }
      if (a === 'up' && this.consumidas.delete(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this.atalho?.(e, a)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (a === 'down') this.consumidas.add(e.code);
        if (this.alt) this.alt.usado = true;
        return;
      }
      // Alt esquerdo sozinho: só desce do outro lado se não virou atalho (Alt+1…9 da mesa).
      // Mandado de cara, um Alt solto abriria o menu do programa que está lá.
      if (e.code === 'AltLeft' && a === 'up' && this.alt) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const alt = this.alt;
        this.alt = null;
        if (!alt.usado) {
          this.mandarTecla(alt.key, alt.ev);
          this.mandarTecla(alt.key, { ...alt.ev, a: 'up', mod: MOD(e) });
        }
        return;
      }
      // keyup de tecla que não desceu na tela (o Tab que abriu a mesa, por exemplo) não vai
      if (a === 'up') return;
      const key = this.teclado ? this.superficies.get(this.teclado) : null;
      if (!key) return;
      if (e.key === 'Escape' && !e.shiftKey) return;
      // Ctrl+V: deixa o navegador colar; o texto vai pelo evento "paste"
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (a === 'down' && e.repeat && e.key.length !== 1 && !/^(Backspace|Delete|Arrow)/.test(e.key)) return;
      // o Shift do Shift+Esc não vai junto (do outro lado, Shift+Esc abre o gerenciador do Chrome)
      const ev = { t: 'tecla', a, key: e.key, code: e.code, kc: e.keyCode, mod: e.key === 'Escape' ? MOD(e) & ~8 : MOD(e) };
      if (e.code === 'AltLeft' && a === 'down') {
        if (!this.alt) this.alt = { key, ev, usado: false };
        return;
      }
      this.soltarAlt();
      // o ajudante nativo aperta o Shift de verdade: solta ele lá antes do Esc. O Shift daqui,
      // quando subir, já não está em apertadas e não vai.
      if (e.key === 'Escape') {
        for (const code of ['ShiftLeft', 'ShiftRight']) {
          const s = this.apertadas.get(code);
          if (s) this.mandarTecla(s.key, { ...s.ev, a: 'up', mod: 0 });
        }
      }
      this.mandarTecla(key, ev);
    };
    window.addEventListener('keydown', tecla('down'), true);
    window.addEventListener('keyup', tecla('up'), true);
    window.addEventListener('blur', () => {
      this.soltarTeclas();
      this.soltarMouse();
    });
    window.addEventListener('paste', (e) => {
      if (!this.teclado) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const s = e.clipboardData?.getData('text');
      if (s) this.mandar(this.superficies.get(this.teclado), { t: 'texto', s: s.slice(0, 2000) });
      e.preventDefault();
    });
  }
}
