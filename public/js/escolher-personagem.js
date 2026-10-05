// Modal de escolha do personagem: grade com a miniatura de cada um (imagem pronta, abre na hora)
// e, ao lado, a prévia ao vivo do selecionado, girando, com botões para ver cada animação.
// O modelo só é baixado quando a pessoa clica nele — e fica no cache, pronto para o jogo.
import { PERSONAGENS } from './personagens.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class EscolherPersonagem {
  // aparencia(): { cor, camiseta, foto } — o boneco padrão aparece como a pessoa o deixou
  constructor({ raiz, aoEscolher, aparencia, aoAbrir, aoFechar }) {
    this.raiz = raiz;
    this.aoEscolher = aoEscolher;
    this.aparencia = aparencia;
    this.aoAbrir = aoAbrir;
    this.aoFechar = aoFechar;
    this.vitrine = null;
    this.atual = 'padrao';
    this.selecionado = null;
    this.grade = raiz.querySelector('#ep-grade');
    this.canvas = raiz.querySelector('#ep-canvas');
    this.grade.innerHTML = Object.values(PERSONAGENS).map((p) => `
      <button type="button" class="ep-item" data-id="${esc(p.id)}" title="${esc(p.label)}">
        <img src="${esc(p.miniatura)}" alt="" loading="lazy" width="128" height="160">
        <span>${esc(p.label)}</span>
      </button>`).join('');

    this.grade.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.selecionar(b.dataset.id);
    });
    // dois cliques: já usa
    this.grade.addEventListener('dblclick', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.usar(b.dataset.id);
    });
    raiz.querySelector('#ep-acoes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-anim]');
      if (!b || !this.vitrine) return;
      const v = b.dataset.anim;
      if (v === 'wave' || v === 'punch') this.vitrine.gesto(v);
      else {
        this.vitrine.animar(Number(v));
        raiz.querySelectorAll('[data-anim]').forEach((x) => x.classList.toggle('on', x === b));
      }
    });
    raiz.querySelector('#ep-usar').addEventListener('click', () => this.usar(this.selecionado));
    raiz.addEventListener('click', (e) => {
      if (e.target === raiz || e.target.closest('[data-ep="fechar"]')) this.fechar();
    });
    raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.fechar();
      }
    });
    this.aoRedimensionar = () => this.ajustarTamanho();
  }

  get aberto() {
    return !this.raiz.hidden;
  }

  async abrir(atual) {
    this.atual = PERSONAGENS[atual] ? atual : 'padrao';
    this.raiz.hidden = false;
    this.aoAbrir?.();
    this.grade.querySelectorAll('[data-id]').forEach((b) => b.classList.toggle('em-uso', b.dataset.id === this.atual));
    window.addEventListener('resize', this.aoRedimensionar);
    if (!this.vitrine) {
      const { Vitrine } = await import('./vitrine.js');
      if (!this.aberto) return;
      this.vitrine = new Vitrine(this.canvas);
    }
    this.ajustarTamanho();
    this.vitrine.iniciar();
    this.selecionar(this.atual);
    this.grade.querySelector(`[data-id="${CSS.escape(this.atual)}"]`)?.focus({ preventScroll: false });
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    window.removeEventListener('resize', this.aoRedimensionar);
    // a prévia é um segundo WebGL: fechou, devolve a placa de vídeo para o jogo
    this.vitrine?.dispose();
    this.vitrine = null;
    this.selecionado = null;
    this.aoFechar?.();
  }

  ajustarTamanho() {
    const r = this.canvas.getBoundingClientRect();
    this.vitrine?.tamanho(Math.round(r.width), Math.round(r.height));
  }

  async selecionar(id) {
    const def = PERSONAGENS[id];
    if (!def) return;
    this.selecionado = id;
    this.grade.querySelectorAll('[data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    this.raiz.querySelector('#ep-nome').textContent = def.label;
    this.raiz.querySelector('#ep-resumo').textContent = def.resumo || '';
    const linha = [];
    if (def.aviso) linha.push(def.aviso);
    if (def.credito) linha.push('Modelo: ' + def.credito);
    this.raiz.querySelector('#ep-credito').textContent = linha.join(' · ');
    const usar = this.raiz.querySelector('#ep-usar');
    const emUso = id === this.atual;
    usar.disabled = emUso;
    usar.textContent = emUso ? 'Em uso' : `Usar ${def.label}`;
    // volta para "parado" a cada troca
    this.raiz.querySelectorAll('[data-anim]').forEach((x) => x.classList.toggle('on', x.dataset.anim === '0'));
    if (!this.vitrine) return;
    this.vitrine.animar(0);
    const carregando = this.raiz.querySelector('#ep-carregando');
    carregando.hidden = !def.url;
    try {
      await this.vitrine.mostrar(def, this.aparencia());
    } catch {
      this.raiz.querySelector('#ep-resumo').textContent = 'Não consegui carregar este personagem agora.';
    } finally {
      if (this.selecionado === id) carregando.hidden = true;
    }
  }

  usar(id) {
    if (!PERSONAGENS[id]) return;
    if (id !== this.atual) this.aoEscolher(id);
    this.fechar();
  }
}
