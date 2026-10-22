// Catálogo de jogos: um modal com todos os jogos da sala, filtrados por gênero. Cada cartão tem a
// foto da maquete 3D do jogo (jogos-3d.js) e, ao lado, a maquete ao vivo do selecionado, girando,
// com o "Ir para" e (quando tem) as regras e os recordes no painel lateral.
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const GENEROS = [
  { id: 'esporte', nome: 'Esportes', cor: '#4ade80' },
  { id: 'corrida', nome: 'Corrida', cor: '#f97316' },
  { id: 'acao', nome: 'Ação e luta', cor: '#f43f5e' },
  { id: 'mesa', nome: 'Tabuleiro e cartas', cor: '#a78bfa' },
  { id: 'aventura', nome: 'Aventura e festa', cor: '#38bdf8' },
  { id: 'terror', nome: 'Terror', cor: '#a3e635' },
];

// liga: o(s) jogo(s) da sala que precisam estar ligados; painel: regras e recordes no painel lateral
export const CATALOGO = [
  { id: 'futebol', nome: 'Futebol de carro', desc: 'Bola gigante, gols e turbo para voar', genero: 'esporte', cor: '#22c55e' },
  { id: 'volei', nome: 'Vôlei de praia', desc: 'Na areia, com os bonecos', genero: 'esporte', cor: '#facc15' },
  { id: 'basquete', nome: 'Basquete', desc: 'Arremesso com barra de força', genero: 'esporte', cor: '#f97316' },
  { id: 'boliche', nome: 'Boliche', desc: '2 pistas, até 4 por pista', genero: 'esporte', cor: '#a855f7' },
  { id: 'pingue', nome: 'Pingue-pongue', desc: 'No salão de jogos; sozinho, contra o robô', genero: 'esporte', cor: '#3b82f6', painel: 'parque' },
  { id: 'sinuca', nome: 'Sinuca', desc: 'Bola 8, até dois por mesa', genero: 'esporte', cor: '#16a34a', painel: 'parque' },
  { id: 'golfe', nome: 'Minigolfe', desc: '9 buracos com moinho, morros e água', genero: 'esporte', cor: '#4ade80', painel: 'parque' },
  { id: 'queimada', nome: 'Queimada', desc: 'Azul × Vermelho, com cemitério', genero: 'esporte', cor: '#ef4444', painel: 'parque' },
  { id: 'corrida', nome: 'Pista de corrida', desc: 'Vire carro e bata o recorde da volta', genero: 'corrida', cor: '#ef4444', painel: 'corrida' },
  { id: 'kart', nome: 'Kart', desc: 'Kartódromo com itens, 3 voltas', genero: 'corrida', cor: '#f59e0b', painel: 'parque' },
  { id: 'matamata', nome: 'Mata-mata', desc: 'Arena com armas no chão (X1)', genero: 'acao', cor: '#f43f5e' },
  { id: 'batalha', nome: 'Mata-mata em times', desc: 'Autobots × Decepticons, por rodadas', genero: 'acao', cor: '#8b5cf6' },
  { id: 'ringue', nome: 'Ringue', desc: 'Luta e socos até o nocaute', genero: 'acao', cor: '#dc2626', painel: 'ringue' },
  { id: 'xadrez', nome: 'Xadrez de bruxo', desc: 'As peças andam sozinhas e viram pó', genero: 'mesa', cor: '#c4b5fd', painel: 'jogos' },
  { id: 'dama', nome: 'Dama gigante', desc: 'Contra alguém ou contra o computador', genero: 'mesa', cor: '#fbbf24', painel: 'jogos' },
  { id: 'velha', nome: 'Jogo da velha', desc: 'O tabuleiro gigante da praça', genero: 'mesa', cor: '#f472b6', painel: 'jogos' },
  { id: 'dados', nome: 'Mesa de dados', desc: 'Apostas com moedas', genero: 'mesa', cor: '#fbbf24', painel: 'jogos' },
  { id: 'truco', nome: 'Truco', desc: 'Truco mineiro em duplas, com os gritos', genero: 'mesa', cor: '#16a34a', painel: 'parque' },
  { id: 'uno', nome: 'Uno', desc: 'Até 6 na mesa, com robôs', genero: 'mesa', cor: '#ef4444', painel: 'parque' },
  { id: 'parkour', nome: 'Parkour', desc: 'Circuito até o camarote VIP', genero: 'aventura', cor: '#8b5cf6', painel: 'parkour' },
  { id: 'gincana', nome: 'Gincana', desc: '10 fases estilo Fall Guys e a final', genero: 'aventura', cor: '#f472b6', painel: 'parque' },
  { id: 'fantasmas', nome: 'Caça-Fantasmas', desc: '12 monstros em 5 casas assombradas', genero: 'terror', cor: '#a3e635' },
  { id: 'surf', nome: 'Surf', desc: 'Rampas no céu, como no CS', genero: 'aventura', cor: '#38bdf8' },
  { id: 'pinta', nome: 'Pinta-território', desc: 'Times pintam o chão com tinta', genero: 'aventura', cor: '#ec4899', painel: 'parque' },
];
// ids dos jogos da sala que o catálogo mostra (o botão da barra some se todos estiverem desligados)
export const JOGOS_DO_CATALOGO = CATALOGO.map((j) => j.id);

export class CatalogoJogos {
  // ligado(id): o jogo está ligado nesta sala; ir(id): leva até ele; painel(nome): abre o painel lateral
  constructor({ raiz, ligado, ir, painel, aoAbrir, aoFechar }) {
    this.raiz = raiz;
    this.ligado = ligado;
    this.ir = ir;
    this.painel = painel;
    this.aoAbrir = aoAbrir;
    this.aoFechar = aoFechar;
    this.palco = null;
    this.fotos = new Map(); // id -> imagem da maquete (fica para a próxima vez que abrir)
    this.genero = 'todos';
    this.selecionado = null;
    this.grade = raiz.querySelector('#cj-grade');
    this.filtros = raiz.querySelector('#cj-filtros');
    this.canvas = raiz.querySelector('#cj-canvas');

    this.filtros.addEventListener('click', (e) => {
      const b = e.target.closest('[data-genero]');
      if (!b) return;
      this.genero = b.dataset.genero;
      this.render();
    });
    this.grade.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.selecionar(b.dataset.id);
    });
    this.grade.addEventListener('dblclick', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.irPara(b.dataset.id);
    });
    // o cartão inclina na direção do mouse
    this.grade.addEventListener('pointermove', (e) => {
      const b = e.target.closest('.cj-item');
      if (!b || e.pointerType !== 'mouse') return;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
      b.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 16}deg`);
    });
    this.grade.addEventListener('pointerout', (e) => {
      const b = e.target.closest('.cj-item');
      if (b && !b.contains(e.relatedTarget)) {
        b.style.removeProperty('--rx');
        b.style.removeProperty('--ry');
      }
    });
    raiz.querySelector('#cj-ir').addEventListener('click', () => this.irPara(this.selecionado));
    raiz.querySelector('#cj-regras').addEventListener('click', () => {
      const j = CATALOGO.find((x) => x.id === this.selecionado);
      if (!j?.painel) return;
      this.fechar();
      this.painel(j.painel);
    });
    raiz.addEventListener('click', (e) => {
      if (e.target === raiz || e.target.closest('[data-cj="fechar"]')) this.fechar();
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

  disponiveis() {
    return CATALOGO.filter((j) => this.ligado(j.id));
  }

  async abrir() {
    if (this.aberto) return;
    this.raiz.hidden = false;
    this.aoAbrir?.();
    window.addEventListener('resize', this.aoRedimensionar);
    this.render();
    if (!this.palco) {
      const { PalcoJogos } = await import('./jogos-3d.js');
      if (!this.aberto) return;
      this.palco = new PalcoJogos(this.canvas);
    }
    this.ajustarTamanho();
    this.palco.iniciar();
    const lista = this.visiveis();
    this.selecionar(lista.some((j) => j.id === this.selecionado) ? this.selecionado : lista[0]?.id);
    this.tirarFotos();
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    window.removeEventListener('resize', this.aoRedimensionar);
    // a maquete é um segundo WebGL: fechou, devolve a placa de vídeo para o jogo
    this.palco?.dispose();
    this.palco = null;
    this.aoFechar?.();
  }

  ajustarTamanho() {
    const r = this.canvas.getBoundingClientRect();
    this.palco?.tamanho(Math.round(r.width), Math.round(r.height));
  }

  visiveis() {
    return this.disponiveis().filter((j) => this.genero === 'todos' || j.genero === this.genero);
  }

  render() {
    const disp = this.disponiveis();
    const conta = (g) => disp.filter((j) => g === 'todos' || j.genero === g).length;
    this.filtros.innerHTML = [{ id: 'todos', nome: 'Todos', cor: '#6ee7c8' }, ...GENEROS]
      .filter((g) => conta(g.id))
      .map((g) => `<button type="button" class="cj-filtro${g.id === this.genero ? ' on' : ''}" data-genero="${g.id}" style="--c:${g.cor}" aria-pressed="${g.id === this.genero}">${esc(g.nome)}<small>${conta(g.id)}</small></button>`)
      .join('');
    if (!conta(this.genero)) this.genero = 'todos';
    const lista = this.visiveis();
    this.grade.innerHTML = lista.map((j) => {
      const g = GENEROS.find((x) => x.id === j.genero);
      const foto = this.fotos.get(j.id);
      return `<button type="button" class="cj-item${j.id === this.selecionado ? ' on' : ''}" data-id="${j.id}" style="--c:${j.cor}">
        <span class="cj-foto">${foto ? `<img src="${foto}" alt="">` : '<i class="cj-giro"></i>'}</span>
        <span class="cj-nome"><b>${esc(j.nome)}</b><small>${esc(g.nome)}</small></span>
      </button>`;
    }).join('') || '<p class="hint">Os jogos estão desligados nesta sala.</p>';
  }

  // a foto de cada cartão sai da própria maquete, uma por quadro (não trava a abertura)
  tirarFotos() {
    const faltam = this.disponiveis().filter((j) => !this.fotos.has(j.id));
    const proxima = () => {
      const j = faltam.shift();
      if (!j || !this.palco || !this.aberto) return;
      const url = this.palco.miniatura(j.id, j.cor);
      this.fotos.set(j.id, url);
      const foto = this.grade.querySelector(`[data-id="${j.id}"] .cj-foto`);
      if (foto) foto.innerHTML = `<img src="${url}" alt="">`;
      requestAnimationFrame(proxima);
    };
    requestAnimationFrame(proxima);
  }

  selecionar(id) {
    const j = CATALOGO.find((x) => x.id === id);
    const info = this.raiz.querySelector('.cj-palco');
    info.hidden = !j;
    if (!j) return;
    this.selecionado = id;
    this.grade.querySelectorAll('[data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    const g = GENEROS.find((x) => x.id === j.genero);
    this.raiz.querySelector('#cj-genero').textContent = g.nome;
    this.raiz.querySelector('#cj-genero').style.setProperty('--c', g.cor);
    this.raiz.querySelector('#cj-nome').textContent = j.nome;
    this.raiz.querySelector('#cj-desc').textContent = j.desc;
    this.raiz.querySelector('#cj-ir').innerHTML = `${icon('goto', 18)}Ir para ${esc(j.nome)}`;
    this.raiz.querySelector('#cj-regras').hidden = !j.painel;
    this.raiz.querySelector('.cj-tela').style.setProperty('--c', j.cor);
    this.palco?.mostrar(id, j.cor);
  }

  irPara(id) {
    if (!CATALOGO.some((x) => x.id === id)) return;
    this.fechar();
    this.ir(id);
  }
}
