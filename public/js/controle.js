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
//
// Mexendo na PRÓPRIA aba compartilhada, nada passa pelo servidor: o evento vai direto para a
// extensão deste Chrome, e o mouse sai a cada movimento (assim que a extensão terminou o
// anterior), sem o intervalo que segura a rede de quem controla de longe.
//
// Modo jogo (botão "Modo jogo" no foco de uma janela/tela): a tela prende o ponteiro (pointer
// lock) e o mouse vai como DELTA, não como posição — é assim que jogos tipo Minecraft giram a
// câmera. As teclas já vão com o "code" físico, e o ajudante nativo as manda como scancode.
// Esc solta o ponteiro (o jogo recebe um Esc e abre o menu dele); clicar na tela prende de novo.
// Pelo canal direto a câmera sai a cada JOGO_MS e o movimento é lido no pointerrawupdate, que vem
// na hora em que o mouse mexe (o pointermove espera o próximo quadro da tela).
//
// A volta (extensão 1.11+): o que o site da aba controlada responde vai para quem mexeu por último
// nela (this.ultimo) — um aviso do site (alert, confirm...) esperando resposta (ver aviso-site.js)
// e o texto do Ctrl+C, que cai na área de transferência de quem controla.

const MOD = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
const BOTAO = ['left', 'middle', 'right'];
// intervalo mínimo entre movimentos de mouse (ms). O servidor corta acima de 120 eventos/s.
const MOVE_MS = 25;
const ARRASTO_MS = 16;
const RODA_MS = 30;
const RODA_MINHA_MS = 8;
// Modo jogo pelo canal direto (sem o servidor e o limite dele): ~125 movimentos por segundo. Os
// 25 ms do MOVE_MS eram atraso puro na câmera, e ela andava aos trancos.
const JOGO_MS = 8;
// Duplo e triplo clique: o pointerdown do Chrome vem sempre com detail 0 (só o mousedown traz a
// contagem), e a aba controlada recebia todo clique como o primeiro — sem duplo clique para
// selecionar palavra. A conta é feita aqui, como no Windows: mesmo botão, perto e logo em seguida.
const CLIQUE_MS = 500;
const CLIQUE_PX = 5;

// Evento de controle que chegou direto de outra pessoa (canal da conexão, sem o servidor no meio):
// a mesma conferência que o servidor faz no eventoDeControle do server.js.
export function eventoDeControle(e) {
  if (!e || typeof e !== 'object') return null;
  const n = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
  const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max);
  const mod = n(e.mod, 0, 15) | 0;
  let ev = null;
  if (e.t === 'mouse' && ['down', 'up', 'move'].includes(e.a)) {
    ev = { t: 'mouse', a: e.a, x: e.x === undefined && e.dx !== undefined ? 0.5 : n(e.x, 0, 1), y: e.y === undefined && e.dy !== undefined ? 0.5 : n(e.y, 0, 1), b: BOTAO.includes(e.b) ? e.b : 'left', n: n(e.n, 1, 3) | 0, arrastando: !!e.arrastando, mod };
    if (e.a === 'move' && (e.dx !== undefined || e.dy !== undefined)) Object.assign(ev, { dx: n(e.dx, -4000, 4000), dy: n(e.dy, -4000, 4000) });
  } else if (e.t === 'modo') return { t: 'modo', jogo: !!e.jogo };
  else if (e.t === 'wheel') ev = { t: 'wheel', x: n(e.x, 0, 1), y: n(e.y, 0, 1), dx: n(e.dx, -3000, 3000), dy: n(e.dy, -3000, 3000), mod };
  else if (e.t === 'tecla' && (e.a === 'down' || e.a === 'up')) {
    ev = { t: 'tecla', a: e.a, key: txt(e.key, 24), code: txt(e.code, 24).trim(), kc: n(e.kc, 0, 255) | 0, mod };
    if (e.ag === true) ev.ag = true;
  } else if (e.t === 'texto') return { t: 'texto', s: String(e.s ?? '').slice(0, 2000) };
  else if (e.t === 'dialogo') return { t: 'dialogo', aceitar: !!e.aceitar, texto: String(e.texto ?? '').slice(0, 2000) };
  else if (e.t === 'nav') {
    if (['voltar', 'avancar', 'recarregar'].includes(e.a)) return { t: 'nav', a: e.a };
    try {
      const u = new URL(String(e.url ?? '').slice(0, 2000));
      return e.a === 'abrir' && ['http:', 'https:'].includes(u.protocol) ? { t: 'nav', a: 'abrir', url: u.href } : null;
    } catch {
      return null;
    }
  }
  if (ev && e.jogo === true) ev.jogo = true;
  return ev;
}

// "1.10.2" -> um número que dá para comparar com outra versão
export const versaoNum = (v) => String(v || '0').split('.').map(Number).reduce((s, n, i) => s + (n || 0) * [1e6, 1e3, 1][i], 0);

export class Controle {
  constructor({ emitir, toast, onExtensao, minha, direto, semPonteiro = false }) {
    this.emitir = emitir;
    this.direto = direto || (() => false); // chave -> o evento vai pelo canal direto (sem servidor)?
    this.semPonteiro = semPonteiro; // celular: sem ponteiro preso no modo jogo (ver toque-jogo.js)
    this.toast = toast;
    this.onExtensao = onExtensao;
    this.minha = minha || (() => null); // chave -> a minha tela com essa chave (ou null)
    // atalho: o de mostrar uma aba sem a faixa, como está no Chrome ('' = sem atalho; null = extensão
    // antiga, que não conta). nativo: { ok, versao, erro } do ajudante do Windows (null = nunca abriu)
    this.ext = { ok: false, liberado: false, versao: null, atalho: null, nativo: null };
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
    this.moveEmVoo = false; // movimento na minha aba esperando a extensão
    this.roda = null;
    this.rodaTimer = 0;
    this.arrastando = null; // { video, key, b, x, y, n }
    this.ultimoClique = null; // { video, b, x, y, t, n }: para contar duplo e triplo clique
    this.jogo = null; // { video, key }: modo jogo ligado nessa tela (ver o cabeçalho)
    this.cru = false; // o pointerrawupdate traz o movimento (aí o pointermove não manda de novo)
    // quem compartilha: key -> { deId, de, quando } de quem mexeu por último (deId null = eu mesmo)
    this.ultimo = new Map();
    // quem controla: key -> quando mandei algo para essa tela, e quando pedi um Ctrl+C nela (a volta
    // só é aceita assim: ninguém põe texto na sua área de transferência sem você ter pedido)
    this.envios = new Map();
    this.copias = new Map();

    document.addEventListener('pointerlockchange', () => {
      const j = this.jogo;
      if (!j || document.pointerLockElement === j.video) return;
      // Esc soltou o ponteiro: o jogo lá recebe um Esc (abre o menu dele) e o modo jogo continua
      // armado — clicar na tela prende o mouse de novo. No celular não há ponteiro preso: lá o
      // controle de toque (toque-jogo.js) cuida do jogo.
      if (this.semPonteiro) return;
      this.soltarTeclas();
      this.soltarMouse();
      this.mandar(j.key, { t: 'tecla', a: 'down', key: 'Escape', code: 'Escape', kc: 27, mod: 0 });
      this.mandar(j.key, { t: 'tecla', a: 'up', key: 'Escape', code: 'Escape', kc: 27, mod: 0 });
      this.onJogoSoltou?.(j.video);
    });

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data?.sala3dExt) return;
      const m = e.data;
      if (m.sala3dExt === 'oi') {
        this.ext = {
          ok: true,
          liberado: !!m.liberado,
          versao: m.versao,
          atalho: typeof m.atalho === 'string' ? m.atalho : null,
          nativo: m.nativo && typeof m.nativo === 'object' ? m.nativo : null,
        };
        this.onExtensao?.(this.ext);
      } else if (m.sala3dExt === 'resposta') {
        this.pedidos.get(m.id)?.(m.r);
        this.pedidos.delete(m.id);
      } else if (m.sala3dExt === 'desligou') {
        this.onDesligou?.(m.aba, m.motivo, !!m.janela);
      } else if (m.sala3dExt === 'capturar-aba' && typeof m.streamId === 'string') {
        // pedido: a extensão 1.11+ espera a resposta (o resultado aparece no ícone dela)
        this.onCapturarAba?.({ streamId: m.streamId, aba: Number(m.aba), site: m.site || null, titulo: m.titulo || '', pedido: m.pedido ?? null });
      } else if (m.sala3dExt === 'parar-aba') {
        this.onPararAba?.({ aba: Number(m.aba), pedido: m.pedido ?? null });
      } else if (m.sala3dExt === 'aba-mudou') {
        this.onAbaMudou?.(m.aba, m.site || null, m.titulo || '');
      } else if (m.sala3dExt === 'dialogo') {
        this.onDialogo?.(Number(m.aba), m.dialogo && typeof m.dialogo === 'object' ? m.dialogo : null, m.site || null);
      }
    });
    window.postMessage({ sala3d: 'ping' }, location.origin);
    this.ligarEntrada();
  }

  // ---------------------------------------------------------------- ponte com a extensão
  pedir(tipo, aba, ev, alvo, ms = 4000) {
    return new Promise((resolve) => {
      const id = ++this.seq;
      this.pedidos.set(id, resolve);
      window.postMessage({ sala3d: tipo, aba, ev, alvo, id }, location.origin);
      setTimeout(() => {
        if (this.pedidos.delete(id)) resolve({ erro: 'sem-resposta' });
      }, ms);
    });
  }

  // a resposta a um pedido da extensão (o resultado do Alt+Shift+S vai para o ícone dela)
  responderPedido(pedido, r) {
    if (pedido != null) window.postMessage({ sala3d: 'resposta-pedido', pedido, r }, location.origin);
  }

  // a sala precisa que a pessoa escolha algo: a extensão traz esta aba para a frente
  mostrarSala() {
    if (this.ext.ok) window.postMessage({ sala3d: 'mostrar-sala' }, location.origin);
  }

  // o guia confere se o ajudante do Windows está instalado (a resposta chega também pelo "oi")
  conferirNativo() {
    return this.pedir('nativo-conferir', null, null, null, 15000);
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

  // ---------------------------------------------------------------- modo jogo
  get jogoNo() { return this.jogo?.video || null; }

  // liga o modo jogo numa tela: ponteiro travado nela, mouse vira delta, teclas viram scancode
  modoJogo(video, ligar) {
    if (!ligar) return this.desligarJogo();
    if (!this.superficies.has(video)) return;
    if (this.jogo?.video === video) return this.travarPonteiro();
    this.desligarJogo();
    const key = this.superficies.get(video);
    this.jogo = { video, key };
    this.focar(video);
    this.travarPonteiro();
    this.mandar(key, { t: 'modo', jogo: true });
    this.onJogo?.(video, key);
  }

  desligarJogo() {
    const j = this.jogo;
    if (!j) return;
    this.onJogo?.(null); // antes de desligar: o que o controle de toque segurava sobe como jogo
    this.jogo = null;
    if (document.pointerLockElement === j.video) document.exitPointerLock();
    this.mandar(j.key, { t: 'modo', jogo: false });
  }

  travarPonteiro() {
    const v = this.jogo?.video;
    if (!v || this.semPonteiro || document.pointerLockElement === v) return;
    try {
      // movimento cru (sem a aceleração do Windows de quem controla), onde o navegador deixa
      const p = v.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch(() => v.requestPointerLock());
    } catch {
      try { v.requestPointerLock(); } catch { /* gesto não valeu: o próximo clique tenta de novo */ }
    }
  }

  soltar(aba) {
    if (aba != null && this.ext.ok) this.pedir('soltar', aba);
  }

  soltarJanela() {
    if (this.ext.ok) this.pedir('janela-soltar');
  }

  // liberou de novo: destrava o ajudante (depois de um Ctrl+Alt+End ele fica parado). Na primeira
  // vez depois de instalar ou atualizar, ele se compila: pode levar uns segundos.
  retomarJanela() {
    return this.pedir('janela-retomar', null, null, null, 15000);
  }

  // o ajudante passa a cuidar dessa janela sem mexer em nada: a resposta diz se ela está como
  // administrador (extensão 1.12+), e aí ninguém conseguiria mexer nela
  conferirJanela(alvo) {
    return this.pedir('janela', null, null, alvo);
  }

  // ---------------------------------------------------------------- quem compartilha
  // Chegou um clique/tecla de alguém para uma das minhas telas.
  async receber(sh, { ev, de, deId }) {
    if (!sh?.controle || (sh.aba == null && !sh.alvo)) return;
    // aba trocando de página (sem marca por um instante): ignora até a página nova aparecer
    if (sh.semMarca) return;
    // voltar/endereço e os avisos do site só existem em aba; numa janela quem clica é o ajudante
    if ((ev?.t === 'nav' || ev?.t === 'dialogo') && sh.aba == null) return;
    // quem mexeu por último nesta tela (o movimento sozinho não conta): é para essa pessoa que vão
    // os avisos do site e o texto do Ctrl+C
    if (!(ev?.t === 'mouse' && ev.a === 'move')) this.ultimo.set(sh.key, { deId: deId || null, de: de || null, quando: Date.now() });
    const r = sh.aba != null ? await this.pedir('entrada', sh.aba, ev) : await this.pedir('janela', null, ev, sh.alvo);
    if (r?.erro) {
      if (r.erro === 'alvo-nao-achado') this.onAlvoPerdido?.(sh);
      // sem-dialogo: o aviso já tinha sido respondido (por quem compartilha, no Chrome dele)
      else if (!['sem-resposta', 'cortado', 'sem-dialogo'].includes(r.erro)) console.warn('[controle]', r.erro);
      return;
    }
    // o programa está como administrador: o evento foi, mas o Windows não deixou chegar nele
    if (r?.admin) this.onAdmin?.(sh, String(r.admin.titulo || ''), deId || null);
    // que programa está na janela (ajudante 1.6+): a sala reconhece o jogo por ele
    if (r?.qual) this.onQual?.(sh, r.qual);
    // Ctrl+C de quem controla de longe: o texto vai para a área de transferência dela (mexendo na
    // minha própria aba, o Chrome já copiou para a minha)
    if (deId && typeof r?.copia === 'string' && r.copia) this.emitir('controle-volta', { key: sh.key, para: deId, ev: { t: 'copia', s: r.copia } });
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
    if (this.jogo?.video === video) this.desligarJogo();
    if (this.teclado === video) this.focar(null);
    if (this.arrastando?.video === video) this.soltarMouse();
    this.superficies.delete(video);
    video.classList.remove('controlavel', 'controlando');
  }

  // a superfície que recebe o teclado (null: o teclado volta para a sala)
  focar(video) {
    const novo = video && this.superficies.has(video) ? video : null;
    if (novo === this.teclado) return;
    if (this.jogo && this.jogo.video !== novo) this.desligarJogo();
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
    // no modo jogo cada evento diz que é de jogo: o "modo" sozinho se perdia quando o ajudante
    // reabria (ou ainda compilava) e o WASD e a câmera paravam, mas o clique continuava
    if (this.jogo?.key === key && ['mouse', 'wheel', 'tecla'].includes(ev.t)) ev = { ...ev, jogo: true };
    const minha = this.minha(key);
    if (minha) return void this.receber(minha, { ev });
    this.envios.set(key, Date.now());
    this.emitir('controle', { key, ev }, volatil);
  }

  // ---------------------------------------------------------------- a volta (quem controla)
  // pedi um Ctrl+C nessa tela há pouco? (vale uma vez)
  pediuCopia(key) {
    const t = this.copias.get(key);
    this.copias.delete(key);
    return !!t && Date.now() - t < 8000;
  }

  // mexi nessa tela nos últimos minutos? (um aviso do site só aparece para quem estava mexendo)
  mexeuEm(key) {
    return Date.now() - (this.envios.get(key) || 0) < 10 * 60_000;
  }

  // Movimento: no máximo um a cada MOVE_MS, mas o último sempre sai (senão o cursor do outro
  // lado parava um pouco antes de onde o mouse parou). Na minha aba: um por vez, sem relógio.
  // No modo jogo (delta) os movimentos SOMAM — descartar um moveria a câmera a menos.
  mover(key, ev, intervalo) {
    const p = this.movePendente;
    if (p && p.key === key && p.ev.dx !== undefined && ev.dx !== undefined) {
      p.ev.dx += ev.dx;
      p.ev.dy += ev.dy;
    } else {
      this.movePendente = { key, ev };
    }
    if (this.minha(key)) {
      if (!this.moveEmVoo) this.moverNaMinha();
      return;
    }
    if (this.moveTimer) return;
    const falta = this.ultimoMove + intervalo - performance.now();
    if (falta <= 0) this.enviarMove();
    else this.moveTimer = setTimeout(() => this.enviarMove(), falta);
  }

  // modo jogo: o delta do mouse preso; pelo canal direto sai mais vezes (JOGO_MS)
  moverJogo(v, e, a) {
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (!dx && !dy) return;
    const key = this.superficies.get(v);
    const ms = this.direto(key) ? JOGO_MS : a ? ARRASTO_MS : MOVE_MS;
    this.mover(key, { t: 'mouse', a: 'move', dx, dy, b: a?.b || 'left', arrastando: !!a, mod: MOD(e) }, ms);
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

  // sempre o movimento mais novo; os que chegaram enquanto a extensão trabalhava ficam para trás
  async moverNaMinha() {
    this.moveEmVoo = true;
    try {
      while (this.movePendente) {
        const { key, ev } = this.movePendente;
        this.movePendente = null;
        const minha = this.minha(key);
        if (minha) await this.receber(minha, { ev });
        else this.mandar(key, ev, true);
      }
    } finally {
      this.moveEmVoo = false;
    }
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
    // na minha aba a rolagem sai a cada quadro, como numa aba de verdade
    if (!this.rodaTimer) this.rodaTimer = setTimeout(() => this.enviarRoda(), this.minha(key) ? RODA_MINHA_MS : RODA_MS);
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
    this.mandar(a.key, { t: 'mouse', a: 'up', x: a.x, y: a.y, b: a.b, n: a.n || 1, mod: 0 });
  }

  // 1, 2 ou 3: mesmo botão, mesma tela, perto do clique anterior e a menos de CLIQUE_MS dele
  contarClique(video, b, e) {
    const u = this.ultimoClique;
    const t = performance.now();
    const seguido = u && u.video === video && u.b === b && t - u.t < CLIQUE_MS && Math.hypot(e.clientX - u.x, e.clientY - u.y) <= CLIQUE_PX;
    const n = seguido ? (u.n % 3) + 1 : 1;
    this.ultimoClique = { video, b, x: e.clientX, y: e.clientY, t, n };
    return n;
  }

  mandarTecla(key, ev) {
    if (ev.a === 'down') this.apertadas.set(ev.code, { key, ev });
    else this.apertadas.delete(ev.code);
    // Ctrl+C / Ctrl+X (pela tecla virtual, que segue o layout do teclado): a volta traz o texto
    if (ev.a === 'down' && (ev.mod & 6) && !(ev.mod & 1) && (ev.kc === 67 || ev.kc === 88)) this.copias.set(key, Date.now());
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
      const emJogo = this.jogo && this.jogo.video === v;
      const p = emJogo ? { x: 0.5, y: 0.5, dentro: true } : this.ponto(v, e);
      if (!p.dentro) return;
      e.preventDefault();
      // um botão que ficou com o foco levaria o Espaço e o Enter que eram para a tela
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      this.focar(v);
      this.soltarAlt();
      this.cancelarMove();
      if (emJogo) this.travarPonteiro(); // voltou de um Esc: o clique que prende o mouse vale lá também
      const key = this.superficies.get(v);
      const b = BOTAO[e.button] || 'left';
      const n = this.contarClique(v, b, e);
      this.arrastando = { video: v, key, b, x: p.x, y: p.y, n };
      this.mandar(key, { t: 'mouse', a: 'down', x: p.x, y: p.y, b, n, mod: MOD(e) });
    });
    document.addEventListener('pointerup', (e) => {
      const a = this.arrastando;
      if (!a) return;
      const p = this.ponto(a.video, e);
      this.arrastando = null;
      this.cancelarMove();
      this.mandar(a.key, { t: 'mouse', a: 'up', x: p.x, y: p.y, b: BOTAO[e.button] || a.b, n: a.n, mod: MOD(e) });
    });
    document.addEventListener('pointermove', (e) => {
      const a = this.arrastando;
      const v = a ? a.video : sob(e);
      if (!v) return;
      // modo jogo com o ponteiro travado: o movimento vai como delta (é o que gira a câmera)
      if (this.jogo && this.jogo.video === v && document.pointerLockElement === v) {
        if (!this.cru) this.moverJogo(v, e, a);
        return;
      }
      const p = this.ponto(v, e);
      if (!a && !p.dentro) return;
      if (a) Object.assign(a, { x: p.x, y: p.y });
      const ev = { t: 'mouse', a: 'move', x: p.x, y: p.y, b: a?.b || 'left', arrastando: !!a, mod: MOD(e) };
      this.mover(this.superficies.get(v), ev, a ? ARRASTO_MS : MOVE_MS);
    });
    // O mesmo movimento, sem esperar o quadro da tela (até 16 ms a 60 Hz). O primeiro que chega
    // com movimento de verdade tira o pointermove da jogada; navegador que não manda movimento
    // aqui fica com o pointermove, como antes.
    document.addEventListener('pointerrawupdate', (e) => {
      const j = this.jogo;
      if (!j || document.pointerLockElement !== j.video || (!e.movementX && !e.movementY)) return;
      this.cru = true;
      this.moverJogo(j.video, e, this.arrastando?.video === j.video ? this.arrastando : null);
    });
    document.addEventListener('wheel', (e) => {
      const v = sob(e);
      if (!v) return;
      const emJogo = this.jogo && this.jogo.video === v && document.pointerLockElement === v;
      const p = emJogo ? { x: 0.5, y: 0.5, dentro: true } : this.ponto(v, e);
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
      // dentro de uma janela da sala (o aviso do site, por exemplo) o teclado é dela
      if (e.target?.closest?.('[role="dialog"], [role="alertdialog"]')) return;
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
      // AltGr (Ctrl+Alt no Windows) que dá um caractere — @, €, ° e, no ABNT2, / e ?: do outro lado vai
      // como o caractere, e não como o atalho Ctrl+Alt+tecla (que não escreveria nada)
      if ([...e.key].length === 1 && e.getModifierState?.('AltGraph')) ev.ag = true;
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
