// "Vídeo" do passo a passo da extensão. Não é arquivo de vídeo: é uma animação montada aqui mesmo,
// com uma tela imitando o Chrome e o Windows, um cursor que anda e clica, e a legenda de cada
// passo. Fica leve, carrega na hora e acompanha o guia se algum passo mudar.
// Fica dentro do guia (guia-extensao.js) e só roda enquanto ele está aberto.

import { icon } from './icons.js';

const W = 640; // o palco é desenhado em 640x360 e escalado para caber no guia
const H = 360;
const CANCELADO = Symbol('cancelado');
const SITE = location.host;

// ------------------------------------------------------------------ peças da tela
const chrome = ({ aba, url, pagina }) => `
  <div class="vg-chrome">
    <div class="vg-abas"><span class="vg-aba ativa">${aba}</span><span class="vg-aba">YouTube</span><span class="vg-mais">+</span></div>
    <div class="vg-barra">
      <span class="vg-nav">${icon('esq', 11)}${icon('dir', 11)}${icon('fwd', 10)}</span>
      <span class="vg-end" data-alvo="end">${url}</span>
      <span class="vg-quebra" data-alvo="quebra">${icon('quebra', 13)}</span>
      <span class="vg-perfil"></span>
    </div>
    <div class="vg-pagina">${pagina}</div>
  </div>`;

const paginaSala = (extra = '') => `
  <div class="vg-sala">
    <div class="vg-card">
      <b>Instalar a extensão de controle</b>
      <span class="vg-btn-verde" data-alvo="baixar">${icon('baixar', 11)}Baixar sala3d-extensao.zip</span>
      <small>Depois: botão direito no arquivo → Extrair tudo</small>
    </div>
    ${extra}
  </div>`;

const paginaExtensoes = ({ dev = false } = {}) => `
  <div class="vg-ext">
    <div class="vg-ext-topo">
      <b>Extensões</b>
      <span class="vg-busca">Pesquisar extensões</span>
      <span class="vg-dev"><small>Modo do desenvolvedor</small><i class="vg-toggle${dev ? ' on' : ''}" data-alvo="dev"></i></span>
    </div>
    <div class="vg-ext-ferramentas${dev ? '' : ' oculto'}" data-alvo="ferramentas">
      <span class="vg-btn-contorno" data-alvo="carregar">Carregar sem compactação</span>
      <span class="vg-btn-contorno">Compactar extensão</span>
      <span class="vg-btn-contorno">Atualizar</span>
    </div>
    <div class="vg-ext-cards">
      <div class="vg-ext-card nova oculto" data-alvo="nova"><i class="vg-ic-ext"></i><span><b>Sala 3D — controle das abas</b><small>1.2.0</small></span><i class="vg-toggle on"></i></div>
      <div class="vg-ext-card"><i class="vg-ic-ext cinza"></i><span><b>Documentos Google off-line</b><small>1.80</small></span><i class="vg-toggle on"></i></div>
      <div class="vg-ext-card"><i class="vg-ic-ext cinza"></i><span><b>Tradutor</b><small>2.0.13</small></span><i class="vg-toggle on"></i></div>
    </div>
    <div class="vg-dialogo seletor oculto" data-alvo="seletor">
      <b>Selecionar pasta</b>
      <div class="vg-seletor-lista">
        <span><i class="vg-ic-pasta"></i>Documentos</span>
        <span><i class="vg-ic-pasta"></i>Imagens</span>
        <span data-alvo="pasta-ext"><i class="vg-ic-pasta"></i>sala3d-extensao</span>
      </div>
      <div class="vg-dialogo-botoes"><span class="vg-btn-azul" data-alvo="selecionar">Selecionar pasta</span><span class="vg-btn-cinza">Cancelar</span></div>
    </div>
  </div>`;

// ------------------------------------------------------------------ cenas
// Cada cena monta a tela e roda as ações (mover o cursor, clicar, digitar, mostrar coisas).
const CENAS = [
  {
    legenda: 'Baixe a extensão pelo botão do guia',
    tela: () => chrome({
      aba: 'Sala 3D',
      url: `${SITE}/?sala=principal`,
      pagina: paginaSala(`<div class="vg-download oculto" data-alvo="download">${icon('baixar', 12)}<span><b>sala3d-extensao.zip</b><small>18 KB · Concluído</small></span></div>`),
    }),
    async acoes(c) {
      await c.clicar('baixar');
      c.mostrar('download');
      await c.esperar(1600);
    },
  },
  {
    legenda: 'Na pasta Downloads: botão direito no arquivo → Extrair tudo → Extrair',
    tela: () => `
      <div class="vg-win">
        <div class="vg-win-barra"><i class="vg-ic-pasta"></i>Downloads</div>
        <div class="vg-win-lista">
          <div class="vg-item" data-alvo="zip"><i class="vg-ic-zip"></i>sala3d-extensao.zip</div>
          <div class="vg-item oculto" data-alvo="pasta"><i class="vg-ic-pasta"></i>sala3d-extensao</div>
        </div>
        <div class="vg-menu oculto" data-alvo="menu"><span>Abrir</span><span data-alvo="extrair">Extrair tudo...</span><span>Compartilhar</span><span>Propriedades</span></div>
        <div class="vg-dialogo oculto" data-alvo="dialogo">
          <b>Extrair Pastas Compactadas (zipadas)</b>
          <small>Os arquivos serão extraídos para esta pasta:</small>
          <span class="vg-campo">C:\\Users\\Você\\Downloads\\sala3d-extensao</span>
          <div class="vg-dialogo-botoes"><span class="vg-btn-azul" data-alvo="ok-extrair">Extrair</span><span class="vg-btn-cinza">Cancelar</span></div>
        </div>
      </div>`,
    async acoes(c) {
      await c.clicar('zip', { direito: true });
      c.mostrar('menu');
      await c.esperar(500);
      c.marcar('extrair');
      await c.clicar('extrair');
      c.esconder('menu');
      c.mostrar('dialogo');
      await c.esperar(500);
      await c.clicar('ok-extrair');
      c.esconder('dialogo');
      c.mostrar('pasta');
      c.marcar('pasta');
      await c.esperar(1500);
    },
  },
  {
    legenda: 'Numa aba nova, digite chrome://extensions e aperte Enter',
    tela: () => chrome({ aba: 'Nova guia', url: '', pagina: '<div class="vg-nova"><b>Google</b><span class="vg-busca-google"></span></div>' }),
    async acoes(c) {
      await c.clicar('end');
      await c.digitar('end', 'chrome://extensions');
      await c.esperar(350);
      c.trocarPagina(paginaExtensoes());
      c.trocarAba('Extensões');
      await c.esperar(1500);
    },
  },
  {
    legenda: 'Ligue o “Modo do desenvolvedor”, no canto de cima, à direita',
    tela: () => chrome({ aba: 'Extensões', url: 'chrome://extensions', pagina: paginaExtensoes() }),
    async acoes(c) {
      await c.esperar(400);
      await c.clicar('dev');
      c.marcar('dev', 'on');
      await c.esperar(250);
      c.mostrar('ferramentas');
      await c.esperar(1500);
    },
  },
  {
    legenda: 'Clique em “Carregar sem compactação” e escolha a pasta sala3d-extensao',
    tela: () => chrome({ aba: 'Extensões', url: 'chrome://extensions', pagina: paginaExtensoes({ dev: true }) }),
    async acoes(c) {
      await c.clicar('carregar');
      c.mostrar('seletor');
      await c.esperar(500);
      await c.clicar('pasta-ext');
      c.marcar('pasta-ext');
      await c.esperar(300);
      await c.clicar('selecionar');
      c.esconder('seletor');
      c.mostrar('nova');
      await c.esperar(1800);
    },
  },
  {
    legenda: 'Volte para a sala: quebra-cabeça → Sala 3D → Liberar este site. Pronto!',
    tela: () => chrome({
      aba: 'Sala 3D',
      url: `${SITE}/?sala=principal`,
      pagina: `<div class="vg-sala"></div>
        <div class="vg-gaveta oculto" data-alvo="gaveta"><small>Extensões</small><span data-alvo="item-ext"><i class="vg-ic-ext"></i>Sala 3D — controle das abas</span></div>
        <div class="vg-popup oculto" data-alvo="popup">
          <b>Sala 3D — controle das abas</b>
          <small data-alvo="popup-txt">Liberar <em>${SITE}</em>? Só faça isso no endereço da sua Sala 3D.</small>
          <span class="vg-btn-verde largo" data-alvo="liberar">Liberar este site</span>
        </div>
        <div class="vg-pronto oculto" data-alvo="pronto">${icon('cursor', 18)}Pronto: já podem mexer nas suas abas</div>`,
    }),
    async acoes(c) {
      await c.clicar('quebra');
      c.mostrar('gaveta');
      await c.esperar(500);
      await c.clicar('item-ext');
      c.esconder('gaveta');
      c.mostrar('popup');
      await c.esperar(700);
      await c.clicar('liberar');
      c.texto('popup-txt', `<em>${SITE}</em> está liberado.`);
      c.esconder('liberar');
      await c.esperar(600);
      c.esconder('popup');
      c.mostrar('pronto');
      await c.esperar(2400);
    },
  },
];

// em qual cena começa cada passo do guia
export const CENA_DO_PASSO = { baixar: 0, abrir: 2, dev: 3, carregar: 4, liberar: 5 };

// ------------------------------------------------------------------ player
export class VideoGuia {
  constructor(raiz) {
    this.raiz = raiz;
    raiz.innerHTML = `
      <div class="vg-janela"><div class="vg-palco"></div><div class="vg-cursor"><svg viewBox="0 0 16 22" width="16" height="22"><path d="M1 1v17l4.5-4.2 3 6.7 2.6-1.2-3-6.6H14z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg></div></div>
      <div class="vg-controles">
        <button type="button" class="vg-play" aria-label="Pausar">${icon('pause', 14)}</button>
        <span class="vg-legenda"></span>
        <span class="vg-pontos">${CENAS.map((_, i) => `<button type="button" data-cena="${i}" aria-label="Passo ${i + 1}"></button>`).join('')}</span>
      </div>`;
    this.janela = raiz.querySelector('.vg-janela');
    this.palco = raiz.querySelector('.vg-palco');
    this.cursor = raiz.querySelector('.vg-cursor');
    this.cena = 0;
    this.tocando = false;
    this.token = 0;
    this.pos = { x: W * 0.6, y: H * 0.7 };
    this.k = 1;
    this.colocarCursor(0);
    raiz.querySelector('.vg-play').addEventListener('click', () => (this.tocando ? this.pausar() : this.tocar(this.cena, true)));
    raiz.querySelector('.vg-pontos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cena]');
      if (b) this.tocar(Number(b.dataset.cena));
    });
    new ResizeObserver(() => this.escalar()).observe(raiz);
  }

  escalar() {
    this.k = this.raiz.clientWidth / W || 1;
    this.janela.style.height = `${H * this.k}px`;
    this.palco.style.transform = `scale(${this.k})`;
    this.colocarCursor(0);
  }

  // começa (ou recomeça) da cena i. continuar: se já estava nela, segue de onde parou
  tocar(i = 0, continuar = false) {
    if (continuar && this.cena === i && this.pausadoNoMeio) {
      this.tocando = true;
      this.pausadoNoMeio = false;
      this.marcarPlay();
      return;
    }
    const t = ++this.token;
    this.cena = i;
    this.tocando = true;
    this.pausadoNoMeio = false;
    this.marcarPlay();
    this.rodar(t);
  }

  pausar() {
    this.tocando = false;
    this.pausadoNoMeio = true;
    this.marcarPlay();
  }

  // só mostra a cena parada (para quem pediu menos movimento no sistema): o play continua dali
  mostrar(i) {
    this.tocar(i);
    this.pausar();
  }

  parar() {
    this.token++;
    this.tocando = false;
    this.pausadoNoMeio = false;
    this.marcarPlay();
  }

  marcarPlay() {
    const b = this.raiz.querySelector('.vg-play');
    b.innerHTML = icon(this.tocando ? 'pause' : 'play', 14);
    b.setAttribute('aria-label', this.tocando ? 'Pausar' : 'Tocar');
  }

  async rodar(t) {
    while (t === this.token) {
      const cena = CENAS[this.cena];
      this.palco.innerHTML = cena.tela();
      this.raiz.querySelector('.vg-legenda').innerHTML = `<b>${this.cena + 1}</b>${cena.legenda}`;
      this.raiz.querySelectorAll('.vg-pontos button').forEach((b, i) => b.classList.toggle('on', i === this.cena));
      try {
        await cena.acoes(this.ctx(t));
        await this.esperar(t, 600);
      } catch (err) {
        if (err === CANCELADO) return;
        throw err;
      }
      this.cena = (this.cena + 1) % CENAS.length;
    }
  }

  // espera que respeita a pausa e para na hora se outra cena foi pedida
  async esperar(t, ms) {
    let falta = ms;
    while (falta > 0) {
      if (t !== this.token) throw CANCELADO;
      const passo = Math.min(50, falta);
      await new Promise((r) => setTimeout(r, passo));
      if (this.tocando) falta -= passo;
    }
    if (t !== this.token) throw CANCELADO;
  }

  colocarCursor(ms) {
    this.cursor.style.transitionDuration = `${ms}ms`;
    this.cursor.style.transform = `translate(${this.pos.x * this.k}px, ${this.pos.y * this.k}px)`;
  }

  ctx(t) {
    const cursor = this.cursor;
    const alvo = (nome) => this.palco.querySelector(`[data-alvo="${nome}"]`);
    const esperar = (ms) => this.esperar(t, ms);
    const mover = async (nome) => {
      const el = alvo(nome);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = this.palco.getBoundingClientRect();
      const x = (r.left + r.width / 2 - p.left) / this.k;
      const y = (r.top + r.height / 2 - p.top) / this.k;
      const ms = Math.min(900, Math.max(350, Math.hypot(x - this.pos.x, y - this.pos.y) * 2.2));
      this.pos = { x, y };
      this.colocarCursor(ms);
      await esperar(ms + 120);
    };
    return {
      esperar,
      mover,
      async clicar(nome, { direito = false } = {}) {
        await mover(nome);
        cursor.classList.remove('clique', 'direito');
        void cursor.offsetWidth; // reinicia a animação do clique
        cursor.classList.add('clique');
        cursor.classList.toggle('direito', direito);
        alvo(nome)?.classList.add('apertado');
        await esperar(260);
        alvo(nome)?.classList.remove('apertado');
      },
      mostrar: (nome) => alvo(nome)?.classList.remove('oculto'),
      esconder: (nome) => alvo(nome)?.classList.add('oculto'),
      marcar: (nome, cls = 'marcado') => alvo(nome)?.classList.add(cls),
      texto: (nome, html) => { const el = alvo(nome); if (el) el.innerHTML = html; },
      trocarPagina: (html) => { this.palco.querySelector('.vg-pagina').innerHTML = html; },
      trocarAba: (nome) => { this.palco.querySelector('.vg-aba.ativa').textContent = nome; },
      async digitar(nome, texto) {
        const el = alvo(nome);
        el.classList.add('digitando');
        for (const ch of texto) {
          el.textContent += ch;
          await esperar(55);
        }
        el.classList.remove('digitando');
      },
    };
  }
}
