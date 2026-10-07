// Salas ao vivo, no jeito do Discord: quantas salas têm gente agora e quem está em cada uma, em
// tempo real. O servidor empurra a lista pelo /ao-vivo (Server-Sent Events) sempre que alguém
// entra, sai ou muda de status; o EventSource reconecta sozinho se a conexão cair.
// Usado no saguão (o cartão "Ao vivo agora") e na coluna de salas (salas.js) dentro da sala.
import { corDa, sigla } from './salas.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// cor da bolinha de presença (a mesma do painel da equipe e da lista de pessoas)
export const COR_STATUS = { disponivel: '#22c55e', ocupado: '#ef4444', reuniao: '#a78bfa', pausa: '#fbbf24', almoco: '#fb923c', ausente: '#94a3b8', inativo: '#64748b' };

export class AoVivo {
  constructor() {
    this.dados = null;
    this.conectado = false;
    this.ouvintes = new Set();
    if (!window.EventSource) return;
    this.es = new EventSource('/ao-vivo');
    this.es.onmessage = (e) => {
      try {
        this.dados = JSON.parse(e.data);
      } catch {
        return;
      }
      this.conectado = true;
      this.avisar();
    };
    this.es.onerror = () => {
      this.conectado = false;
      this.avisar();
    };
  }

  avisar() {
    for (const f of this.ouvintes) f(this.dados || { salas: [], pessoas: 0 }, this.conectado);
  }

  ouvir(f) {
    this.ouvintes.add(f);
    if (this.dados) f(this.dados, this.conectado);
  }
}

// O cartão do saguão. aoEscolher(id): a pessoa clicou numa sala. ativo(): o cartão está à mostra
// (dentro da sala ele fica escondido, e quem entra e sai das outras salas não o remonta à toa).
export function cartaoDoSaguao(aoVivo, { lista, resumo, selecionada, aoEscolher, ativo = () => true }) {
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sala]');
    if (b) aoEscolher(b.dataset.sala);
  });
  const render = (dados, conectado) => {
    if (!ativo()) return;
    const { salas = [], pessoas = 0 } = dados;
    resumo.textContent = !conectado && !salas.length
      ? 'Reconectando…'
      : `${salas.length} ${salas.length === 1 ? 'sala' : 'salas'} · ${pessoas} ${pessoas === 1 ? 'pessoa online' : 'pessoas online'}`;
    if (!salas.length) {
      lista.innerHTML = '<p class="ao-vivo-vazio">Nenhuma sala com gente agora. Escolha um nome em <b>Sala</b> e seja o primeiro a entrar.</p>';
      return;
    }
    const atual = selecionada();
    lista.innerHTML = salas.map((s) => {
      const nomes = s.nomes.map((p) => `<li title="${esc(p.nome)}"><i style="--c:${esc(p.cor)};--s:${COR_STATUS[p.status] || COR_STATUS.disponivel}"></i>${esc(p.nome)}</li>`).join('');
      const resto = s.pessoas - s.nomes.length;
      const tipo = s.modulo === 'escritorio' ? 'Escritório' : 'Lazer';
      return `<button type="button" class="av-sala${s.id === atual ? ' on' : ''}" data-sala="${esc(s.id)}">
        <span class="sala-ic" style="--c:${corDa(s.id)}">${esc(sigla(s.empresa || s.id))}${s.temSenha ? `<span class="sala-cadeado">${icon('lock', 10)}</span>` : ''}</span>
        <span class="av-info">
          <span class="av-nome"><b>#${esc(s.id)}</b><span class="av-qtd">${s.pessoas}</span></span>
          <small>${s.empresa ? `${esc(s.empresa)} · ` : ''}${tipo}${s.temSenha ? ' · com senha' : ''}</small>
          ${nomes || resto > 0 ? `<ul class="av-nomes">${nomes}${resto > 0 ? `<li class="mais">${s.temSenha ? `${resto} ${resto === 1 ? 'pessoa' : 'pessoas'}` : `+${resto}`}</li>` : ''}</ul>` : ''}
        </span>
      </button>`;
    }).join('');
  };
  aoVivo.ouvir(render);
  return () => aoVivo.avisar(); // redesenha (a sala escolhida mudou)
}
