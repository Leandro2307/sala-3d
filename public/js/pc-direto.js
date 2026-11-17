// PC direto: este PC na sala como o PS5 direto. O ajudante do Windows (1.19+) abre a ponte
// extensao/nativo/pc/sala3d-pc.exe, que captura um monitor pelo Windows (Desktop Duplication),
// codifica na placa de vídeo (NVENC, o mesmo do Sunshine/Moonlight e do Steam Link) e entrega à sala,
// por um WebSocket em 127.0.0.1, o H.264 e o som do PC (sem o do navegador) em Opus — no mesmo
// protocolo da ponte do PS5. A fonte é a mesma (Ps5Fonte): uma cópia decodificada vira a tela da sala
// e os quadros vão como saíram da placa para quem joga no turbo.
//
// Antes (tela inteira pelo Chrome): captura do Chrome (~54 qps no máximo) → OpenH264 no processador.
// Agora: Windows → placa (conversão e codificação) → quem joga. A 60 ou 120 qps, sem gastar processador.
//
// O controle de quem joga é o de sempre de uma tela inteira: o ajudante move o mouse, aperta as teclas
// e cria o controle de Xbox (ViGEmBus) dentro do monitor escolhido (o rótulo screen:N:0 vem da ponte).
import { icon } from './icons.js';
import { Ps5Fonte, CSS_PAINEL } from './ps5-nativo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAB = 8;
const VIDEO = 1, SOM = 2, CABECALHO = 3;
const OPCOES = 'sala3d-pc-direto'; // localStorage: { monitor (nome), altura, qps, kbps, cursor, som }
const PADRAO = { monitor: null, altura: 1080, qps: 60, kbps: 0, cursor: true, som: true };
// a banda de cada altura (kbps 0 = automática): a placa faz imagem melhor por bit que o OpenH264, mas o
// jogo de PC mexe a tela inteira o tempo todo. O turbo baixa sozinho se a rede de quem joga não der.
const bandaDe = (altura) => (altura && altura <= 720 ? 12000 : altura && altura <= 1080 ? 20000 : 35000);
const ALTURAS = [[720, '720p'], [1080, '1080p'], [0, 'Do monitor']];
const QPS = [30, 60, 120];
const QPS_JOGO = 60; // Jogos do PC: sempre a 60 qps (no monitor de 144 Hz, ver monitorDoJogo)
const esperar = async (cond, ms) => {
  const fim = Date.now() + ms;
  while (!cond() && Date.now() < fim) await new Promise((ok) => setTimeout(ok, 100));
  return !!cond();
};

export const temPcDireto = () => typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function' && typeof WebSocket === 'function';

const ERROS = {
  'sem-nvenc': 'Esta placa de vídeo não tem o codificador da NVIDIA (NVENC). Por enquanto o PC direto só funciona com placa NVIDIA; use a Tela inteira com o modo turbo.',
  'driver-antigo': 'O driver da NVIDIA está velho para o codificador. Atualize o driver (GeForce Experience ou nvidia.com) e tente de novo.',
  'duplicacao-ocupada': 'O Windows não deixou capturar esse monitor agora (outro programa em tela cheia exclusiva ou muitas capturas abertas). Feche o que estiver capturando ou ponha o jogo em janela sem borda.',
  duplicacao: 'O Windows não deixou capturar esse monitor.',
  monitor: 'Esse monitor não existe mais (desconectou?).',
  'nvenc-sessao': 'O codificador da placa não abriu (a placa já está com sessões demais: feche OBS/gravações e tente de novo).',
  video: 'a captura do monitor parou',
};

export class PcDireto {
  // pedirPonte(): pede ao ajudante a porta e o token da ponte (via extensão)
  // compartilhar(fonte, { rotulo }): põe a fonte numa tela da sala; devolve a chave ou null
  // pararTela(key), onEvento(texto, dados), toast, aoAbrir, aoFechar
  constructor({ pedirPonte, compartilhar, pararTela, onEvento, toast, aoAbrir, aoFechar }) {
    Object.assign(this, { pedirPonte, compartilhar, pararTela, onEvento, toast, aoAbrir, aoFechar });
    this.ws = null;
    this.monitores = [];
    this.nvenc = null;
    this.erroNvenc = '';
    this.fase = 'parado'; // parado | abrindo | no-ar
    this.conectado = null;
    this.fonte = null;
    this.key = null;
    this.raiz = null;
    this.erro = null;
    try { this.opcoes = { ...PADRAO, ...JSON.parse(localStorage.getItem(OPCOES) || '{}') }; } catch { this.opcoes = { ...PADRAO }; }
  }

  guardarOpcoes() {
    try { localStorage.setItem(OPCOES, JSON.stringify(this.opcoes)); } catch { /* sem armazenamento */ }
  }

  get aberto() { return !!this.raiz && !this.raiz.hidden; }
  get noAr() { return !!this.fonte && !this.fonte.parada; }

  // ---------------------------------------------------------------- a ponte
  async ligarPonte() {
    if (this.ws && this.ws.readyState <= 1) return true;
    if (this.abrindoPonte) return this.abrindoPonte;
    this.abrindoPonte = (async () => {
      const r = await this.pedirPonte();
      if (!r?.ok) {
        this.erro = r?.erro === 'ajudante-ausente' || r?.erro === 'sem-resposta' ? 'Precisa da extensão Sala 3D e do ajudante do Windows (Ajustes → Extensão de controle).'
          : r?.erro === 'demorou' || r?.erro === 'desconhecido' ? 'Recarregue a extensão Sala 3D em chrome://extensions (o PC direto precisa da 1.25) e feche e abra o Chrome para o ajudante atualizar (1.19).'
          : r?.msg === 'sem-ponte' ? 'A ponte do PC (extensao/nativo/pc/sala3d-pc.exe) não está na pasta da extensão. Atualize a pasta (git pull).'
          : `A ponte do PC não abriu (${r?.msg || r?.erro || 'sem resposta'}).`;
        return false;
      }
      return new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(`ws://127.0.0.1:${Number(r.porta)}/pc?t=${encodeURIComponent(r.token)}`);
        } catch (err) {
          this.erro = `Não deu para falar com a ponte: ${err.message}`;
          return resolve(false);
        }
        ws.binaryType = 'arraybuffer';
        const fim = setTimeout(() => { try { ws.close(); } catch { /* */ } }, 8000);
        ws.onopen = () => {
          clearTimeout(fim);
          this.ws = ws;
          this.erro = null;
          resolve(true);
        };
        ws.onerror = () => {
          this.erro = 'O Chrome não deixou a sala falar com a ponte neste PC. Se ele perguntar sobre “dispositivos na rede local”, permita.';
        };
        ws.onclose = () => {
          clearTimeout(fim);
          if (this.ws === ws) this.ws = null;
          resolve(false);
          if (this.noAr) this.terminar('a ponte do PC fechou');
          this.render();
        };
        ws.onmessage = (e) => (typeof e.data === 'string' ? this.texto(e.data) : this.binario(e.data));
      });
    })();
    try { return await this.abrindoPonte; } finally { this.abrindoPonte = null; }
  }

  mandar(m) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  binario(ab) {
    if (ab.byteLength < CAB || !this.fonte) return;
    const u = new Uint8Array(ab);
    const dados = u.subarray(CAB);
    if (u[0] === VIDEO) this.fonte.quadro(dados, u[1], (u[2] << 8) | u[3]);
    else if (u[0] === SOM) this.fonte.som(dados);
    else if (u[0] === CABECALHO) this.fonte.cabecalho(dados);
  }

  texto(txt) {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    switch (m.tipo) {
      case 'oi':
        this.versaoPonte = m.versao;
        break;
      case 'monitores':
        this.monitores = Array.isArray(m.lista) ? m.lista : [];
        this.nvenc = !!m.nvenc;
        this.erroNvenc = m.erroNvenc || '';
        break;
      case 'conectado':
        this.conectado = m;
        this.fase = 'no-ar';
        if (this.fonte?.banda) this.fonte.banda.atual = Number(m.kbps) || this.fonte.banda.atual;
        this.onEvento?.('pc direto: no ar', m);
        // a página recarregou com a imagem no ar: uma fonte nova para ela
        if (!this.fonte) this.novaFonte(Number(m.kbps) || bandaDe(m.altura));
        this.porNaSala();
        break;
      case 'som':
        this.fonte?.somCabecalho({ hz: m.hz, canais: m.canais });
        break;
      case 'saiu':
        this.onEvento?.('pc direto: saiu', m);
        // o "parou" da captura de antes chegando depois de recomeçar (Jogos do PC trocando de monitor)
        if (m.motivo === 'parou' && this.fase === 'abrindo') break;
        if (m.erro) this.toast?.(`PC direto: ${ERROS[m.motivo] || m.motivo}`, 'error', 10000);
        this.terminar(null);
        break;
      case 'aviso':
        console.warn('[pc direto]', m.texto);
        this.onEvento?.('pc direto: aviso', { texto: String(m.texto).slice(0, 200) });
        if (/eco/.test(m.texto)) this.toast?.('PC direto: este Windows não separa o som do Chrome; a voz da sala pode voltar como eco para quem joga.', 'warn', 9000);
        break;
      default:
    }
    this.render();
  }

  // ---------------------------------------------------------------- no ar
  novaFonte(kbps) {
    this.fonte?.parar();
    this.fonte = new Ps5Fonte({ pedirChave: () => this.mandar({ tipo: 'chave' }), onEvento: this.onEvento });
    // o turbo ajusta a banda da placa pela fila que quem joga mede (TurboEnvio.ajustarBanda)
    const max = kbps;
    this.fonte.banda = {
      atual: kbps,
      max,
      mudar: (nova) => {
        const k = Math.round(Math.min(max, Math.max(2000, nova)));
        if (Math.abs(k - this.fonte.banda.atual) < 200) return;
        this.fonte.banda.atual = k;
        this.mandar({ tipo: 'banda', kbps: k });
      },
    };
  }

  // Jogos do PC: o monitor mais rápido (o de 144 Hz); empatados, o que não tem a sala, depois o principal
  monitorDoJogo() {
    const m = this.monitores;
    if (!m.length) return null;
    const hz = Math.max(...m.map((x) => Number(x.hz) || 0));
    const rapidos = m.filter((x) => (Number(x.hz) || 0) === hz);
    return rapidos.find((x) => !this.salaNoMonitor(x)) || rapidos.find((x) => x.principal) || rapidos[0];
  }

  // Jogos do PC (o dono escolheu um jogo neste hub): sempre o monitor de 144 Hz e sempre a 60 qps, sem
  // perguntar a tela (ninguém está na frente deste PC). Já no ar noutro monitor ou noutro qps: recomeça.
  // Devolve { key, monitor } quando a imagem já está numa tela da sala, ou { erro }.
  async ligarParaJogo() {
    if (!temPcDireto()) return { erro: 'este navegador não decodifica vídeo pela página (WebCodecs)' };
    if (!(await this.ligarPonte())) return { erro: this.erro || 'a ponte do PC não abriu' };
    this.monitores = [];
    this.nvenc = null;
    this.mandar({ tipo: 'monitores' });
    await esperar(() => this.monitores.length && this.nvenc != null, 6000);
    if (this.nvenc === false) return { erro: ERROS[this.erroNvenc] || ERROS['sem-nvenc'] };
    const mon = this.monitorDoJogo();
    if (!mon) return { erro: 'a ponte não achou nenhum monitor' };
    const c = this.conectado;
    if (this.noAr && this.key && c && c.monitor === mon.i && Number(c.qps) === QPS_JOGO) return { key: this.key, monitor: mon };
    if (this.noAr || this.fase === 'abrindo') {
      this.parar();
      await new Promise((ok) => setTimeout(ok, 800)); // a ponte solta a captura e o codificador
    }
    this.paraJogo = true;
    await this.iniciar(mon.i, { qps: QPS_JOGO, guardar: false });
    await esperar(() => this.key || this.fase === 'parado', 30_000);
    this.paraJogo = false;
    if (this.key) return { key: this.key, monitor: mon };
    if (this.fase !== 'parado') this.parar();
    return { erro: this.erro || 'a placa não começou a mandar a imagem' };
  }

  monitorEscolhido() {
    const m = this.monitores;
    return m.find((x) => x.nome === this.opcoes.monitor) || m.find((x) => !this.salaNoMonitor(x)) || m.find((x) => x.principal) || m[0] || null;
  }

  // a janela da sala está nesse monitor? (compartilhar o monitor da própria sala vira um espelho infinito)
  salaNoMonitor(mon) {
    const r = devicePixelRatio || 1;
    const cx = (screenX + outerWidth / 2) * r, cy = (screenY + outerHeight / 2) * r;
    return cx >= mon.x && cx < mon.x + mon.w && cy >= mon.y && cy < mon.y + mon.h;
  }

  // qps: o do jogo (senão o das opções); guardar: false não troca o monitor guardado nas opções
  async iniciar(i, { qps: qpsFixo, guardar = true } = {}) {
    if (this.noAr || this.fase === 'abrindo') return;
    if (!(await this.ligarPonte())) { this.render(); return; }
    const mon = this.monitores.find((x) => x.i === Number(i)) || this.monitorEscolhido();
    if (!mon) return this.toast?.('A ponte não achou nenhum monitor.', 'error', 6000);
    if (guardar) {
      this.opcoes.monitor = mon.nome;
      this.guardarOpcoes();
    }
    const altura = Number(this.opcoes.altura) || 0;
    const qps = qpsFixo || (QPS.includes(Number(this.opcoes.qps)) ? Number(this.opcoes.qps) : 60);
    const alturaReal = altura && altura < mon.h ? altura : mon.h;
    const kbps = Number(this.opcoes.kbps) >= 2000 ? Number(this.opcoes.kbps) : Math.round(bandaDe(alturaReal) * (qps > 60 ? 1.5 : qps < 60 ? 0.7 : 1));
    this.novaFonte(kbps);
    this.fase = 'abrindo';
    this.onEvento?.('pc direto: pedido', { monitor: mon.nome, altura, qps, kbps });
    this.mandar({ tipo: 'iniciar', monitor: mon.i, altura, qps, kbps, cursor: !!this.opcoes.cursor, som: !!this.opcoes.som });
    this.render();
  }

  async porNaSala() {
    if (!this.fonte || this.key || this.pondo) return;
    const fonte = this.fonte;
    this.pondo = true;
    let key;
    try { key = await this.compartilhar(fonte, { rotulo: this.conectado?.rotulo || 'screen:0:0', auto: !!this.paraJogo }); } finally { this.pondo = false; }
    if (this.fonte !== fonte) return;
    if (!key) {
      this.toast?.('A sala não conseguiu pôr o PC numa tela. Desligando o PC direto.', 'error', 6000);
      this.parar();
      return;
    }
    this.key = key;
    this.fechar();
  }

  terminar(motivo) {
    const fonte = this.fonte;
    this.fonte = null;
    this.conectado = null;
    this.fase = 'parado';
    if (motivo) this.toast?.(`PC direto desligado: ${motivo}.`, 'warn', 6000);
    const key = this.key;
    this.key = null;
    fonte?.parar();
    if (key) this.pararTela?.(key);
    this.render();
  }

  parar() {
    this.mandar({ tipo: 'parar' });
    this.terminar(null);
  }

  // a tela saiu da sala pelo X: a captura para junto
  telaSaiu(key) {
    if (key !== this.key) return;
    this.key = null;
    this.parar();
  }

  stats() {
    return this.fonte ? { ...this.fonte.stats(), conectado: this.conectado, ponte: this.versaoPonte ?? null, banda: this.fonte.banda?.atual ?? null } : null;
  }

  // ---------------------------------------------------------------- painel
  montar() {
    if (this.raiz) return;
    const css = document.createElement('style');
    css.textContent = CSS_PAINEL.replaceAll('#ps5-nativo', '#pc-direto')
      + `#pc-direto { --p5: #22c55e; } #pc-direto .p5-selo { background: linear-gradient(150deg, #4ade80, #15803d); box-shadow: 0 6px 18px rgba(22,163,74,.35); }
      #pc-direto .p5-ic { color: #bbf7d0; } #pc-direto .p5-aviso .ic, #pc-direto .p5-vazio .ic { color: #86efac; } #pc-direto .p5-fase { color: #4ade80; }
      #pc-direto .p5-checks { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0 2px; font-size: 13px; }
      #pc-direto .p5-checks label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }`;
    document.head.appendChild(css);
    this.raiz = document.createElement('div');
    this.raiz.id = 'pc-direto';
    this.raiz.className = 'ep-fundo';
    this.raiz.hidden = true;
    this.raiz.innerHTML = `<div class="ep-card p5-card" role="dialog" aria-modal="true" aria-labelledby="pcd-titulo">
      <header class="guia-head">
        <div class="p5-cab"><span class="p5-selo">${icon('pc', 22)}</span>
          <div><h2 id="pcd-titulo">PC direto</h2><small>A tela deste PC codificada pela placa de vídeo, como o Remote Play</small></div></div>
        <button type="button" class="icon-btn" data-pc="fechar" aria-label="Fechar">${icon('x')}</button>
      </header>
      <div class="p5-corpo"></div>
    </div>`;
    document.body.appendChild(this.raiz);
    this.raiz.addEventListener('click', (e) => {
      if (e.target === this.raiz || e.target.closest('[data-pc="fechar"]')) return this.fechar();
      const b = e.target.closest('[data-pc]');
      if (!b || b.disabled) return;
      const acao = b.dataset.pc;
      if (acao === 'iniciar') this.iniciar(b.dataset.i);
      else if (acao === 'parar') this.parar();
      else if (acao === 'tentar') this.abrir();
      else if (acao === 'atualizar') this.mandar({ tipo: 'monitores' });
    });
    this.raiz.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'pc-altura') this.opcoes.altura = Number(e.target.value) || 0;
      else if (n === 'pc-qps') this.opcoes.qps = QPS.includes(Number(e.target.value)) ? Number(e.target.value) : 60;
      else if (n === 'pc-kbps') this.opcoes.kbps = Number(e.target.value) ? Math.min(100000, Math.max(2000, Number(e.target.value))) : 0;
      else if (n === 'pc-cursor') this.opcoes.cursor = e.target.checked;
      else if (n === 'pc-som') this.opcoes.som = e.target.checked;
      else return;
      this.guardarOpcoes();
      this.render();
    });
    this.raiz.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.fechar();
    });
  }

  async abrir() {
    this.montar();
    if (!this.aberto) {
      this.raiz.hidden = false;
      this.aoAbrir?.();
    }
    this.render();
    if (!temPcDireto()) return;
    if (await this.ligarPonte()) this.mandar({ tipo: 'monitores' });
    this.render();
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    this.aoFechar?.();
  }

  render() {
    if (!this.aberto) return;
    const corpo = this.raiz.querySelector('.p5-corpo');
    if (!temPcDireto()) {
      corpo.innerHTML = `<div class="p5-aviso">${icon('help', 16)}<span>Este navegador não decodifica vídeo pela página (WebCodecs). Use o Chrome ou o Edge.</span></div>`;
      return;
    }
    if (!this.ws) {
      corpo.innerHTML = `<div class="p5-vazio">${icon(this.erro ? 'help' : 'sync', 22)}<span>${this.erro ? esc(this.erro) : 'Abrindo a ponte do PC…'}</span>
        ${this.erro ? '<button type="button" class="secondary small" data-pc="tentar">Tentar de novo</button>' : ''}</div>`;
      return;
    }
    const pilula = (txt, cor, vivo = false) => `<span class="p5-pilula${vivo ? ' vivo' : ''}" style="--c:${cor}">${txt}</span>`;
    const ocupado = this.noAr || this.fase === 'abrindo';
    const escolhido = this.monitorEscolhido();
    const c = this.conectado;
    const semNvenc = this.nvenc === false;
    const lista = this.monitores.map((m) => {
      const aqui = this.salaNoMonitor(m);
      const ar = ocupado && c && c.monitor === m.i;
      const meta = [`${m.w}×${m.h}`, m.hz ? `${m.hz} Hz` : '', m.principal ? 'principal' : '', esc(m.placa)].filter(Boolean).join(' · ');
      return `<div class="p5-item${ar ? ' ar' : ''}">
        <span class="p5-ic">${icon('monitores', 20)}</span>
        <span><b>Monitor ${m.i + 1}</b>${ar ? pilula('no ar', '#4ade80', true) : aqui ? pilula('a sala está aqui', '#fbbf24') : m === escolhido && !ocupado ? pilula('sugerido', '#86efac') : ''}
          <small>${meta}${aqui && !ar ? ' · compartilhar este mostra a própria sala (espelho)' : ''}</small></span>
        <span class="p5-acoes">${ar ? `<button type="button" class="primary small p5-parar" data-pc="parar">${icon('stop', 14)} Parar</button>`
          : `<button type="button" class="primary small" data-pc="iniciar" data-i="${m.i}"${ocupado || semNvenc ? ' disabled' : ''}>${icon('play', 14)} Compartilhar</button>`}</span>
      </div>`;
    }).join('');
    const agora = c ? `${this.fonte?.cfg ? `${this.fonte.cfg.w}×${this.fonte.cfg.h}` : `${c.largura}×${c.altura}`} · ${c.qps} qps · ${Math.round((this.fonte?.banda?.atual || c.kbps) / 100) / 10} Mbps · H.264 na placa${c.hz && c.qps > c.hz ? ` <span class="p5-fase">(o monitor está a ${c.hz} Hz)</span>` : ''}` : '';
    const alturaSel = Number(this.opcoes.altura) || 0;
    corpo.innerHTML = `
      ${semNvenc ? `<div class="p5-aviso">${icon('help', 16)}<span>${esc(ERROS[this.erroNvenc] || ERROS['sem-nvenc'])}</span></div>`
        : ocupado ? `<section class="p5-sec"><h3>Agora</h3><p class="p5-status">${this.fase === 'abrindo' ? '<span class="p5-fase">abrindo a captura e o codificador…</span>' : `<b>No ar:</b> ${agora}`}</p></section>`
        : `<div class="p5-aviso">${icon('help', 16)}<span>O monitor escolhido vai para uma tela da sala e, no modo turbo, <b>a imagem que a placa fez vai direto para quem joga</b> (sem a captura do Chrome nem o processador). O mouse, o teclado e o controle de quem joga chegam como numa tela inteira. Ponha o jogo em <b>tela cheia sem borda</b> no monitor que não é o da sala, e <b>deixe a janela da sala visível</b> (minimizada ou coberta, o Chrome desacelera a página e o turbo não entra).</span></div>`}
      <section class="p5-sec"><h3>Monitores</h3>
        <div class="p5-lista">${lista || `<div class="p5-vazio">${icon('monitores', 24)}<span>Nenhum monitor achado.</span><button type="button" class="secondary small" data-pc="atualizar">Procurar de novo</button></div>`}</div>
      </section>
      <section class="p5-sec"><h3>Imagem</h3>
        <div class="p5-campos">
          <label>Resolução <select name="pc-altura"${ocupado ? ' disabled' : ''}>
            ${ALTURAS.map(([a, n]) => `<option value="${a}"${alturaSel === a ? ' selected' : ''}>${n}</option>`).join('')}
          </select></label>
          <label>Quadros por segundo <select name="pc-qps"${ocupado ? ' disabled' : ''}>
            ${QPS.map((q) => `<option value="${q}"${Number(this.opcoes.qps) === q ? ' selected' : ''}>${q} qps</option>`).join('')}
          </select></label>
          <label>Banda (kbps) <input name="pc-kbps" type="number" min="2000" max="100000" step="1000"${ocupado ? ' disabled' : ''} value="${Number(this.opcoes.kbps) >= 2000 ? Number(this.opcoes.kbps) : ''}" placeholder="auto ${bandaDe(alturaSel || escolhido?.h || 1080)}"></label>
        </div>
        <div class="p5-checks">
          <label><input type="checkbox" name="pc-cursor"${this.opcoes.cursor ? ' checked' : ''}${ocupado ? ' disabled' : ''}> Mostrar o ponteiro do mouse</label>
          <label><input type="checkbox" name="pc-som"${this.opcoes.som ? ' checked' : ''}${ocupado ? ' disabled' : ''}> Levar o som do PC (menos o do Chrome)</label>
        </div>
      </section>`;
  }
}
