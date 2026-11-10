// Jogos do PC: o catálogo dos jogos instalados no PC de jogos da sala (o "hub"). O hub é um PC
// liberado para o /tela que tem a pasta "Jogos da Sala 3D" na área de trabalho: o ajudante do
// Windows lista os atalhos dessa pasta. Só o dono da sala vê e escolhe; escolheu, o hub fecha o jogo
// de antes, abre este e compartilha a tela pelo OBS com o controle liberado (ver pedidoDeJogo no
// main.js). As capas vêm da imagem com o mesmo nome do atalho, da Steam (pelo número do jogo) ou,
// sem nenhuma, o ícone do jogo.
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAPA_STEAM = (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
const CORES = ['#38bdf8', '#f472b6', '#4ade80', '#f97316', '#a78bfa', '#facc15', '#f43f5e', '#2dd4bf'];
const corDe = (nome) => CORES[[...String(nome)].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];

const CSS = `
#pc-jogos .pj-card { grid-template-rows: auto auto 1fr auto; grid-template-columns: minmax(0, 1fr); width: min(1000px, 100%); min-width: 0; }
#pc-jogos .pj-pcs { display: flex; flex-wrap: wrap; gap: 8px; }
#pc-jogos .pj-pcs[hidden] { display: none; }
#pc-jogos .pj-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); grid-auto-rows: max-content;
  gap: 14px; min-width: 0; min-height: 0; overflow-y: auto; padding: 4px; }
#pc-jogos .pj-item { position: relative; display: grid; padding: 0; border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
  background: #0f121a; color: var(--text); font: inherit; text-align: left; cursor: pointer;
  transition: transform 160ms var(--ease), border-color 140ms, box-shadow 160ms; }
#pc-jogos .pj-item:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--c) 70%, transparent);
  box-shadow: 0 14px 30px rgba(0,0,0,.45); }
#pc-jogos .pj-item:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
#pc-jogos .pj-item:disabled { cursor: progress; }
#pc-jogos .pj-capa { position: relative; display: grid; place-items: center; aspect-ratio: 2 / 3;
  background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--c) 40%, transparent), transparent 70%),
    linear-gradient(160deg, color-mix(in srgb, var(--c) 25%, #121621), #0b0e14); }
#pc-jogos .pj-capa img.capa { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#pc-jogos .pj-capa img.icone { width: 56%; max-width: 96px; image-rendering: auto; filter: drop-shadow(0 8px 18px rgba(0,0,0,.5)); }
#pc-jogos .pj-nome { padding: 8px 10px 10px; font-size: 13px; font-weight: 700; line-height: 1.25; }
#pc-jogos .pj-selo { position: absolute; left: 8px; top: 8px; z-index: 1; padding: 3px 8px; border-radius: 999px; font-size: 10.5px;
  font-weight: 800; letter-spacing: .04em; text-transform: uppercase; background: #16a34a; color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
#pc-jogos .pj-selo.abrindo { background: #2563eb; }
#pc-jogos .pj-item.atual { border-color: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,.45); }
#pc-jogos .pj-rodape { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
#pc-jogos .pj-status { color: var(--muted); font-size: 13px; }
#pc-jogos .pj-vazio { color: var(--muted); font-size: 14px; line-height: 1.55; }
#pc-jogos .pj-vazio code { font-size: 12.5px; }
@media (max-width: 720px) { #pc-jogos .pj-grade { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; } }
`;

export class PcJogos {
  // socket(): o da sala (nasce depois); dono(): este aparelho entrou como dono; aoAbrir/aoFechar: o main pausa o boneco
  constructor({ socket, toast, dono, aoAbrir, aoFechar }) {
    this.socket = socket;
    this.toast = toast;
    this.dono = dono;
    this.aoAbrir = aoAbrir;
    this.aoFechar = aoFechar;
    this.hubs = [];
    this.nick = null; // o PC escolhido (quando tem mais de um)
    this.abrindo = null; // { nick, id } esperando a resposta do PC
    this.raiz = null;
  }

  get aberto() {
    return !!this.raiz && !this.raiz.hidden;
  }

  montar() {
    if (this.raiz) return;
    const css = document.createElement('style');
    css.textContent = CSS;
    document.head.appendChild(css);
    this.raiz = document.createElement('div');
    this.raiz.id = 'pc-jogos';
    this.raiz.className = 'ep-fundo';
    this.raiz.hidden = true;
    this.raiz.innerHTML = `<div class="ep-card pj-card" role="dialog" aria-modal="true" aria-labelledby="pj-titulo">
      <header class="guia-head">
        <h2 id="pj-titulo">Jogos do PC</h2>
        <button type="button" class="icon-btn" data-pj="fechar" aria-label="Fechar">${icon('x')}</button>
      </header>
      <div class="pj-pcs" role="group" aria-label="Qual PC" hidden></div>
      <div class="pj-grade"></div>
      <div class="pj-rodape">
        <span class="pj-status"></span>
        <button type="button" class="secondary small" data-pj="parar" hidden>Fechar o jogo</button>
      </div>
    </div>`;
    document.body.appendChild(this.raiz);
    this.raiz.addEventListener('click', (e) => {
      if (e.target === this.raiz || e.target.closest('[data-pj="fechar"]')) return this.fechar();
      if (e.target.closest('[data-pj="parar"]')) return this.pedir('fechar');
      const pc = e.target.closest('[data-pc]');
      if (pc) {
        this.nick = pc.dataset.pc;
        return this.render();
      }
      const j = e.target.closest('[data-jogo]');
      if (j) this.pedir('abrir', j.dataset.jogo);
    });
    this.raiz.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.fechar();
    });
  }

  abrir() {
    if (!this.dono()) {
      this.toast('Só o dono da sala escolhe os jogos do PC. Entre como dono (painel da sala) neste aparelho.', 'warn', 6000);
      return;
    }
    this.montar();
    if (this.aberto) return;
    this.raiz.hidden = false;
    this.aoAbrir?.();
    this.render();
    this.carregar();
    this.raiz.querySelector('[data-pj="fechar"]').focus();
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    this.aoFechar?.();
  }

  carregar() {
    this.socket()?.emit('hub-lista', null, (r) => {
      if (!r?.ok) {
        this.hubs = [];
        this.erro = r?.erro === 'dono' ? 'Só o dono da sala escolhe os jogos do PC.' : 'Não deu para ler os jogos.';
      } else {
        this.hubs = r.hubs || [];
        this.erro = null;
      }
      if (this.aberto) this.render();
    });
  }

  hub() {
    return this.hubs.find((h) => h.nick === this.nick) || this.hubs.find((h) => !h.eu) || this.hubs[0] || null;
  }

  render() {
    if (!this.raiz) return;
    const pcs = this.raiz.querySelector('.pj-pcs');
    const grade = this.raiz.querySelector('.pj-grade');
    const status = this.raiz.querySelector('.pj-status');
    const parar = this.raiz.querySelector('[data-pj="parar"]');
    const hub = this.hub();
    pcs.hidden = this.hubs.length < 2;
    pcs.innerHTML = this.hubs.map((h) => `<button type="button" class="cj-filtro${h === hub ? ' on' : ''}" data-pc="${esc(h.nick)}" style="--c:#6ee7c8" aria-pressed="${h === hub}">${esc(h.nick)}<small>${h.jogos.length}</small></button>`).join('');
    parar.hidden = !hub?.atual;
    if (this.erro || !hub) {
      grade.innerHTML = `<p class="pj-vazio">${this.erro ? esc(this.erro) : `Nenhum PC de jogos está na sala agora.<br>
        No PC de jogos: deixe a sala aberta no Chrome (extensão 1.20+ e o ajudante instalados), mande uma vez
        <code>/tela liberar</code> no chat e ponha os atalhos dos jogos na pasta <b>Jogos da Sala 3D</b> da área de trabalho.`}</p>`;
      status.textContent = '';
      return;
    }
    if (!hub.jogos.length) {
      grade.innerHTML = `<p class="pj-vazio">O PC de ${esc(hub.nick)} não tem jogos no catálogo. Ponha os atalhos dos jogos
        (os da área de trabalho, da Steam, da Epic...) na pasta <b>Jogos da Sala 3D</b>, na área de trabalho de lá.</p>`;
      status.textContent = '';
      return;
    }
    grade.innerHTML = hub.jogos.map((j) => {
      const atual = hub.atual === j.id;
      const abrindo = this.abrindo?.nick === hub.nick && this.abrindo.id === j.id;
      const icone = j.icone ? `<img class="icone" src="${j.icone}" alt="">` : '';
      // a capa própria vale mais; a da Steam, se não carregar, some e fica o ícone
      const capa = j.capa ? `<img class="capa" src="${j.capa}" alt="">`
        : j.steam ? `<img class="capa" src="${CAPA_STEAM(j.steam)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
      return `<button type="button" class="pj-item${atual ? ' atual' : ''}" data-jogo="${esc(j.id)}" style="--c:${corDe(j.nome)}" ${this.abrindo ? 'disabled' : ''}
          title="${atual ? `${esc(j.nome)} está aberto` : `Abrir ${esc(j.nome)}`}">
        <span class="pj-capa">${icone}${capa}${abrindo ? '<span class="pj-selo abrindo">abrindo…</span>' : atual ? '<span class="pj-selo">jogando</span>' : ''}</span>
        <span class="pj-nome">${esc(j.nome)}</span>
      </button>`;
    }).join('');
    const nomeAtual = hub.jogos.find((j) => j.id === hub.atual)?.nome;
    status.textContent = this.abrindo ? `Pedi ao PC de ${hub.nick}. O jogo e o OBS levam uns segundos para abrir…`
      : nomeAtual ? `${nomeAtual} está aberto no PC de ${hub.nick}. Escolher outro fecha este.`
      : `Escolha um jogo: o PC de ${hub.nick} abre e compartilha pelo OBS, com o controle liberado.`;
  }

  pedir(acao, id) {
    const hub = this.hub();
    if (!hub || this.abrindo) return;
    this.socket()?.emit('hub-jogo', { nick: hub.nick, acao, id }, (r) => {
      if (r?.ok) return;
      this.abrindo = null;
      this.toast(r?.erro === 'ninguem' ? `O PC de ${hub.nick} saiu da sala.` : 'Não deu para pedir o jogo.', 'warn', 6000);
      this.render();
    });
    this.abrindo = { nick: hub.nick, id: acao === 'abrir' ? id : null };
    // sem resposta (o PC travou, a internet caiu): solta os botões
    clearTimeout(this.tempo);
    this.tempo = setTimeout(() => this.resposta(), 150_000);
    this.render();
  }

  // o catálogo de algum PC mudou (abriu, fechou, entrou, saiu)
  mudou() {
    if (this.aberto) this.carregar();
  }

  // a resposta do hub chegou (tela-resposta com jogo: true)
  resposta() {
    clearTimeout(this.tempo);
    this.abrindo = null;
    if (this.aberto) {
      this.render();
      this.carregar();
    }
  }
}
