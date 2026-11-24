// "Colocar na TV" (só no celular): o botão abre um painel com dois caminhos.
//   1. Espelhar: a imagem do celular na TV. O site não abre o espelhamento (nem o iPhone nem o Android
//      deixam): o painel ensina o caminho e a página arruma a imagem. O celular é mais comprido que a TV
//      (19,5:9 contra 16:9): no espelho sobram faixas pretas em cima e embaixo, e a imagem do jogo, que é
//      16:9, ainda ganha faixas dos lados. Os três encaixes (ENCAIXES) escolhem o que fazer com isso, e as
//      marcas de ajuste mostram na TV se a proporção ficou certa.
//   2. A TV como segunda tela: a TV abre o site (modo TV, tv.js) e mostra o jogo em 16:9 de verdade; o
//      celular vira o controle (/tv?controle=1). A TV já ligada na conta é só tocar; a nova entra com as 4
//      primeiras letras do código que está nela (mesma rede) ou o código inteiro.
import { icon } from './icons.js';

const CHAVE = 'sala3d-na-tv';
const BARRA_MS = 4000;
const SEM_TELA_MS = 60_000; // a tela do jogo caiu: voltando antes disto, o ajuste continua
const TV_VOLTA_MS = 20_000; // a TV recarrega para entrar na conta: quanto esperar por ela
export const ENCAIXES = {
  zoom: ['Tela toda', 'Não corta nada e ocupa o celular todo. Com o zoom vertical (ou "esticar") da TV, ocupa a TV toda também.'],
  inteira: ['Com faixas', 'Nada cortado, na proporção certa. Sobram faixas pretas em volta.'],
  largura: ['Sem bordas', 'Vai de um lado ao outro, mas corta um pouco em cima e embaixo.'],
};

// A imagem do jogo (16:9) na TV, espelhada de um celular lw×lh: quanto da largura e da altura da TV (16:9)
// ela ocupa e quanto dela aparece. No 'zoom' a TV estica a faixa espelhada até a altura toda.
export function naTvOcupa(lw, lh, encaixe) {
  const TV = 16 / 9;
  const cel = lw / lh;
  // o celular inteiro dentro da TV
  const cw = cel >= TV ? 1 : cel / TV;
  const ch = cel >= TV ? TV / cel : 1;
  if (encaixe === 'zoom') return { w: 1, h: 1, visivel: 1 };
  if (encaixe === 'largura') return { w: cw, h: ch, visivel: Math.min(cel / TV, TV / cel) };
  return { w: cel >= TV ? ch : cw, h: cel >= TV ? ch : cw, visivel: 1 };
}

const ua = navigator.userAgent;
const IPHONE = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () => navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

const PASSOS = IPHONE
  ? ['Celular e TV no mesmo Wi-Fi.', 'Puxe a <b>Central de Controle</b> (canto de cima, à direita).', 'Toque em <b>Espelhar Tela</b> e escolha a TV.', 'Volte aqui e deite o celular.']
  : ['Celular e TV no mesmo Wi-Fi.', 'Puxe as <b>configurações rápidas</b> (de cima para baixo).', 'Toque em <b>Smart View</b> (Samsung) ou <b>Transmitir</b> e escolha a TV.', 'Volte aqui e deite o celular.'];
const DICA = IPHONE
  ? 'No Safari as barras do navegador também vão para a TV. Compartilhar → <b>Adicionar à Tela de Início</b> e abrir por lá tira as barras.'
  : 'Samsung: nas opções do Smart View, em <b>Proporção do telefone</b>, <b>Tela inteira no dispositivo conectado</b> já deixa a imagem do tamanho da TV.';

export class NaTv {
  // raiz: #na-tv · foco: #focus · abrirTela(): põe a tela do jogo em foco (false: não há nenhuma)
  // token(): o da conta · sala() · antesDeSair(): a página vai para o controle
  constructor({ raiz, foco, toast, abrirTela, token, sala, antesDeSair }) {
    Object.assign(this, { raiz, foco, toast, abrirTela, token, sala, antesDeSair });
    this.ligado = false;
    this.trava = null;
    this.barraTimer = 0;
    let g = {};
    try { g = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch { /* sem armazenamento */ }
    this.encaixe = ENCAIXES[g.encaixe] ? g.encaixe : 'zoom';
    this.semBotoes = !!g.semBotoes;
    this.montar();
  }

  guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ encaixe: this.encaixe, semBotoes: this.semBotoes })); } catch { /* ok */ }
  }

  montar() {
    const r = this.raiz;
    r.innerHTML = `
      <div class="ntv-caixa" role="dialog" aria-modal="true" aria-label="Colocar na TV">
        <header><b>${icon('tv', 18)} Colocar na TV</b><button type="button" class="ntv-x" aria-label="Fechar">${icon('x', 18)}</button></header>
        <div class="ntv-cols">
          <section>
            <h3>Espelhar este celular</h3>
            <ol>${PASSOS.map((p) => `<li>${p}</li>`).join('')}</ol>
            <div class="ntv-encaixes" role="radiogroup" aria-label="Tamanho da imagem na TV">
              ${Object.entries(ENCAIXES).map(([id, [nome, desc]]) => `<button type="button" role="radio" data-encaixe="${id}">
                <i class="ntv-tv" aria-hidden="true"><i></i></i><span><b>${nome}</b><small>${desc}</small></span></button>`).join('')}
            </div>
            <label class="ntv-op"><input type="checkbox" class="ntv-sem"><span>Esconder os botões da tela <small>(continuam funcionando no lugar)</small></span></label>
            <p class="ntv-dica" ${IPHONE && instalado() ? 'hidden' : ''}>${DICA}</p>
            <div class="ntv-acoes">
              <button type="button" class="ntv-ir ntv-principal"></button>
              <button type="button" class="ntv-marcas">Conferir na TV</button>
              <button type="button" class="ntv-parar" hidden>Parar</button>
            </div>
          </section>
          <section class="ntv-segunda">
            <h3>TV em tela cheia, celular de controle</h3>
            <p>A TV mostra o jogo em 16:9, do tamanho dela, e o celular fica só com os botões. Abra <b>${location.host}</b> no navegador da TV.</p>
            <div class="ntv-lista"></div>
            <form class="ntv-cod" autocomplete="off">
              <input name="c" maxlength="9" placeholder="Código da TV" autocapitalize="characters" spellcheck="false" aria-label="Código que está na tela da TV" enterkeyhint="go">
              <button type="submit">Ligar</button>
            </form>
            <p class="ntv-estado" role="status"></p>
          </section>
        </div>
      </div>`;
    const q = (s) => r.querySelector(s);
    // o clique do mesmo dedo que abriu cai no que apareceu embaixo dele (e fechava o painel na hora)
    r.addEventListener('click', (e) => {
      if (Date.now() - this.abertoEm > 450) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    r.addEventListener('click', (e) => { if (e.target === r) this.fechar(); });
    // o painel fica por cima do controle de toque: nada daqui vira comando do jogo
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup']) r.addEventListener(t, (e) => e.stopPropagation());
    q('.ntv-x').addEventListener('click', () => this.fechar());
    q('.ntv-encaixes').addEventListener('click', (e) => {
      const id = e.target.closest('[data-encaixe]')?.dataset.encaixe;
      if (!id) return;
      this.encaixe = id;
      this.guardar();
      this.aplicar();
    });
    q('.ntv-sem').addEventListener('change', (e) => {
      this.semBotoes = e.target.checked;
      this.guardar();
      this.aplicar();
    });
    q('.ntv-ir').addEventListener('click', () => { if (this.ligar()) this.fechar(); });
    q('.ntv-marcas').addEventListener('click', () => {
      if (!this.ligar()) return;
      this.fechar();
      this.mostrarMarcas();
    });
    q('.ntv-parar').addEventListener('click', () => { this.desligar(); this.fechar(); });
    q('.ntv-lista').addEventListener('click', (e) => { if (e.target.closest('button')) this.irParaControle(); });
    q('.ntv-cod').addEventListener('submit', (e) => {
      e.preventDefault();
      this.ligarTv(q('.ntv-cod input').value);
    });
    // espelhando: um toque traz a barra da tela por um instante
    this.foco.addEventListener('pointerdown', () => { if (this.ligado) this.mostrarBarra(); }, true);
    document.addEventListener('visibilitychange', () => { if (this.ligado && document.visibilityState === 'visible') this.acordado(); });
    addEventListener('resize', () => { if (!r.hidden) this.aplicar(); });
  }

  abrir() {
    // em tela cheia de um elemento só, o que está fora dele não aparece
    const cheia = document.fullscreenElement;
    (cheia && cheia !== document.documentElement ? cheia : document.body).append(this.raiz);
    const q = (s) => this.raiz.querySelector(s);
    q('.ntv-ir').textContent = this.ligado ? 'Pronto' : 'Já espelhei, arrumar a imagem';
    q('.ntv-parar').hidden = !this.ligado;
    q('.ntv-sem').checked = this.semBotoes;
    q('.ntv-segunda').hidden = this.sala() !== 'principal'; // o modo TV é sempre da principal
    q('.ntv-estado').textContent = '';
    this.raiz.hidden = false;
    this.abertoEm = Date.now();
    this.aplicar();
    if (this.sala() === 'principal') this.listar();
  }

  fechar() {
    this.raiz.querySelector('input[name="c"]').blur();
    this.raiz.hidden = true;
  }

  // ---------------------------------------------------------------- espelhar
  ligar() {
    if (!this.abrirTela()) {
      this.toast('Ainda não há nenhuma tela compartilhada para pôr na TV.', 'warn', 5000);
      return false;
    }
    this.ligado = true;
    this.aplicar();
    this.acordado();
    return true;
  }

  desligar() {
    if (!this.ligado) return;
    this.ligado = false;
    this.tirarMarcas();
    this.trava?.then((l) => l?.release()).catch(() => {});
    this.trava = null;
    this.aplicar();
  }

  // saiu da tela em foco: pode ser uma queda (a tela volta sozinha) ou a pessoa
  saiuDaTela() {
    if (!this.ligado) return;
    this.tirarMarcas();
    clearTimeout(this.semTela);
    this.semTela = setTimeout(() => { if (this.foco.hidden) this.desligar(); }, SEM_TELA_MS);
  }

  aplicar() {
    const b = document.body;
    b.classList.toggle('espelho', this.ligado);
    b.classList.toggle('espelho-sem-botoes', this.ligado && this.semBotoes);
    if (this.ligado) b.dataset.encaixe = this.encaixe;
    else delete b.dataset.encaixe;
    // o desenho de cada encaixe, na proporção deste celular deitado
    const lw = Math.max(innerWidth, innerHeight);
    const lh = Math.min(innerWidth, innerHeight);
    this.raiz.querySelectorAll('[data-encaixe]').forEach((el) => {
      const id = el.dataset.encaixe;
      el.setAttribute('aria-checked', String(id === this.encaixe));
      const o = naTvOcupa(lw, lh, id);
      Object.assign(el.querySelector('.ntv-tv > i').style, { width: `${o.w * 100}%`, height: `${o.h * 100}%` });
    });
  }

  mostrarBarra() {
    document.body.classList.add('espelho-barra');
    clearTimeout(this.barraTimer);
    this.barraTimer = setTimeout(() => document.body.classList.remove('espelho-barra'), BARRA_MS);
  }

  // sem isto o celular apaga a tela (e a TV junto) quando se joga com um controle Bluetooth
  acordado() {
    if (!navigator.wakeLock?.request || document.visibilityState !== 'visible') return;
    this.trava = navigator.wakeLock.request('screen').catch(() => null);
  }

  // As marcas vão em cima da imagem do jogo, com o mesmo encaixe dela: na TV as quinas têm que encostar nas
  // bordas e o círculo tem que ficar redondo.
  mostrarMarcas() {
    this.tirarMarcas();
    const el = document.createElement('div');
    el.className = 'ntv-teste';
    const par = { inteira: 'xMidYMid meet', largura: 'xMidYMid slice', zoom: 'none' }[this.encaixe];
    const quina = (x, y, dx, dy) => `<path d="M${x} ${y + dy * 120}V${y}H${x + dx * 120}"/>`;
    el.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="${par}" aria-hidden="true">
      <g fill="none" stroke="#38bdf8" stroke-width="12">${quina(6, 6, 1, 1)}${quina(1594, 6, -1, 1)}${quina(6, 894, 1, -1)}${quina(1594, 894, -1, -1)}
      <circle cx="800" cy="450" r="260"/></g></svg>
      <div class="ntv-teste-cx"><p>Olhe na TV: o <b>círculo</b> tem que ficar redondo${this.encaixe === 'zoom' ? '. Se ficar achatado, ligue o zoom vertical (ou "esticar") da TV' : ''}.</p>
      <button type="button" data-m="outro">Outro tamanho</button><button type="button" data-m="ok" class="ntv-principal">Ficou bom</button></div>`;
    for (const t of ['pointerdown', 'pointermove', 'pointerup']) el.addEventListener(t, (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (m === 'ok') this.tirarMarcas();
      if (m !== 'outro') return;
      const ids = Object.keys(ENCAIXES);
      this.encaixe = ids[(ids.indexOf(this.encaixe) + 1) % ids.length];
      this.guardar();
      this.aplicar();
      this.mostrarMarcas();
      this.toast(ENCAIXES[this.encaixe][0], 'info', 2000);
    });
    this.foco.append(el);
    this.teste = el;
  }

  tirarMarcas() {
    this.teste?.remove();
    this.teste = null;
  }

  // ---------------------------------------------------------------- a TV como segunda tela
  async pedir(rota, corpo = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(rota, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: this.token(), ...corpo }), signal: ctl.signal,
      });
      return await r.json();
    } catch { return { ok: false, erro: 'Sem conexão com o servidor.' }; } finally { clearTimeout(t); }
  }

  async listar() {
    const lista = this.raiz.querySelector('.ntv-lista');
    lista.textContent = '';
    const r = await this.pedir('/lan/tvs');
    lista.textContent = '';
    for (const nome of r.tvs || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = icon('tv', 18);
      b.append(` Jogar na ${nome}`);
      lista.append(b);
    }
    return r.tvs?.length || 0;
  }

  async ligarTv(codigo) {
    if (this.ligandoTv) return;
    const c = String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const estado = (t) => { this.raiz.querySelector('.ntv-estado').textContent = t; };
    if (c.length !== 4 && c.length !== 8) return estado('Digite as 4 letras que estão na TV.');
    this.ligandoTv = true;
    estado('Ligando a TV…');
    try {
      const r = await this.pedir('/lan/tv', { codigo: c });
      if (!r.ok) return estado(r.erro === 'login' ? 'Entre na sua conta de novo para ligar a TV.' : r.erro || 'Não deu certo.');
      estado('A TV está entrando na sua conta…');
      const fim = Date.now() + TV_VOLTA_MS;
      await new Promise((ok) => setTimeout(ok, 2000)); // a TV recarrega: a de antes ainda pode aparecer
      while (Date.now() < fim && !this.raiz.hidden) {
        if (await this.listar()) return this.irParaControle();
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      estado('A TV demorou para voltar. Confira a internet dela e toque em Ligar de novo.');
    } finally { this.ligandoTv = false; }
  }

  // o celular vira o controle: a /tv?controle=1 já abre com os botões e chama a TV para o jogo (tv.js)
  irParaControle() {
    try { sessionStorage.setItem('sala3d-tv-toque-aberto', String(Date.now())); } catch { /* abre no botão */ }
    this.antesDeSair?.();
    location.href = '/tv?controle=1';
  }
}
