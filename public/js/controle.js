// Controle remoto das abas compartilhadas.
//
// Quem compartilha uma aba e tem a extensão "Sala 3D — controle das abas" (pasta extensao/) pode
// ligar "Permitir controle" naquela tela. Aí quem estiver vendo a tela em foco clica em
// "Controlar": mouse, roda e teclado viram eventos que vão pelo servidor até quem compartilha, e a
// extensão dele repete tudo na aba de verdade.
//
// A extensão marca cada aba com um capture handle "sala3d-aba:<id>" — é assim que daqui se sabe
// qual aba do Chrome está por trás de cada vídeo capturado.

const MOD = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
const BOTAO = ['left', 'middle', 'right'];

export class Controle {
  constructor({ emitir, toast, onExtensao }) {
    this.emitir = emitir;
    this.toast = toast;
    this.onExtensao = onExtensao;
    this.ext = { ok: false, liberado: false, versao: null };
    this.pedidos = new Map();
    this.seq = 0;
    this.alvo = null; // { key, video } — tela que estou controlando
    this.avisos = new Map();
    this.ultimoMove = 0;
    this.arrastando = null;

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data?.sala3dExt) return;
      const m = e.data;
      if (m.sala3dExt === 'oi') {
        this.ext = { ok: true, liberado: !!m.liberado, versao: m.versao };
        this.onExtensao?.(this.ext);
      } else if (m.sala3dExt === 'resposta') {
        this.pedidos.get(m.id)?.(m.r);
        this.pedidos.delete(m.id);
      } else if (m.sala3dExt === 'desligou') {
        this.onDesligou?.(m.aba, m.motivo);
      }
    });
    window.postMessage({ sala3d: 'ping' }, location.origin);
    this.ligarEntrada();
  }

  // ---------------------------------------------------------------- ponte com a extensão
  pedir(tipo, aba, ev) {
    return new Promise((resolve) => {
      const id = ++this.seq;
      this.pedidos.set(id, resolve);
      window.postMessage({ sala3d: tipo, aba, ev, id }, location.origin);
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

  soltar(aba) {
    if (aba != null && this.ext.ok) this.pedir('soltar', aba);
  }

  // ---------------------------------------------------------------- quem compartilha
  // Chegou um clique/tecla de alguém para uma das minhas telas.
  async receber(sh, { ev, de, deId }) {
    if (!sh?.controle || sh.aba == null) return;
    const r = await this.pedir('entrada', sh.aba, ev);
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
  ligar(key, video) {
    this.alvo = { key, video };
    video.classList.add('controlando');
  }

  desligar() {
    if (!this.alvo) return;
    this.alvo.video.classList.remove('controlando');
    this.alvo = null;
    this.arrastando = null;
  }

  get ativo() { return !!this.alvo; }

  // posição do mouse em 0..1 dentro da imagem (o vídeo fica "contain", com faixas em volta)
  ponto(e) {
    const v = this.alvo.video;
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

  mandar(ev, volatil = false) {
    if (!this.alvo) return;
    this.emitir('controle', { key: this.alvo.key, ev }, volatil);
  }

  ligarEntrada() {
    const naImagem = (e) => this.alvo && e.target === this.alvo.video;
    document.addEventListener('pointerdown', (e) => {
      if (!naImagem(e)) return;
      const p = this.ponto(e);
      if (!p.dentro) return;
      e.preventDefault();
      this.arrastando = BOTAO[e.button] || 'left';
      this.mandar({ t: 'mouse', a: 'down', x: p.x, y: p.y, b: this.arrastando, n: e.detail || 1, mod: MOD(e) });
    });
    document.addEventListener('pointerup', (e) => {
      if (!this.alvo || !this.arrastando) return;
      const p = this.ponto(e);
      this.mandar({ t: 'mouse', a: 'up', x: p.x, y: p.y, b: BOTAO[e.button] || this.arrastando, n: e.detail || 1, mod: MOD(e) });
      this.arrastando = null;
    });
    document.addEventListener('pointermove', (e) => {
      if (!this.alvo || (!naImagem(e) && !this.arrastando)) return;
      const agora = performance.now();
      if (agora - this.ultimoMove < (this.arrastando ? 25 : 50)) return;
      this.ultimoMove = agora;
      const p = this.ponto(e);
      if (!p.dentro && !this.arrastando) return;
      this.mandar({ t: 'mouse', a: 'move', x: p.x, y: p.y, b: this.arrastando || 'left', arrastando: !!this.arrastando, mod: MOD(e) }, true);
    });
    document.addEventListener('wheel', (e) => {
      if (!naImagem(e)) return;
      const p = this.ponto(e);
      if (!p.dentro) return;
      e.preventDefault();
      const f = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      this.mandar({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX * f, dy: e.deltaY * f, mod: MOD(e) });
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => {
      if (naImagem(e)) e.preventDefault();
    });
    // Teclado: enquanto controla, tudo vai para a aba (menos o Esc, que sai do controle).
    // Pega na fase de captura para o jogo (andar, chat, emotes) não reagir.
    const tecla = (a) => (e) => {
      if (!this.alvo || e.key === 'Escape') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Ctrl+V: deixa o navegador colar; o texto vai pelo evento "paste"
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (a === 'down' && e.repeat && e.key.length !== 1 && !/^(Backspace|Delete|Arrow)/.test(e.key)) return;
      this.mandar({ t: 'tecla', a, key: e.key, code: e.code, kc: e.keyCode, mod: MOD(e) });
    };
    window.addEventListener('keydown', tecla('down'), true);
    window.addEventListener('keyup', tecla('up'), true);
    window.addEventListener('paste', (e) => {
      if (!this.alvo) return;
      const s = e.clipboardData?.getData('text');
      if (s) this.mandar({ t: 'texto', s: s.slice(0, 2000) });
      e.preventDefault();
    });
  }
}
