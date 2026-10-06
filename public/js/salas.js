// Lista lateral de salas, no jeito do Discord: uma coluna de ícones com as salas que a pessoa já
// visitou (guardadas neste navegador), quantas pessoas há em cada uma agora e, passando o mouse,
// quem está lá. Um clique troca de sala; o "+" entra numa sala nova pelo nome.
// Os números vêm do /ao-vivo (aovivo.js, em tempo real) e do /salas-status (as salas com senha de
// que a pessoa tem o passe, e as visitadas que estão vazias), consultado de tempos em tempos.
// Embaixo das visitadas, depois de um separador, entram as outras salas com gente agora.
import { icon } from './icons.js';

const CHAVE = 'sala3d-visitadas';
const MAX = 20;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ler() {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE) || '[]');
    return Array.isArray(l) ? l.filter((s) => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}
function gravar(lista) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* modo privado */ }
}

// cor fixa por nome de sala (a mesma em todo navegador)
export function corDa(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}
// "time-de-vendas" -> "TV", "principal" -> "PR"
export function sigla(nome) {
  const partes = nome.replace(/[^a-z0-9À-ÿ ]/gi, ' ').trim().split(/[\s_-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] || nome || '?').slice(0, 2).toUpperCase();
}

export class SalasLaterais {
  // atual(): id da sala em que a pessoa está; passes(): { sala: passe } das salas com senha;
  // aoTrocar(id): ir para outra sala
  constructor({ raiz, atual, passes, aoTrocar }) {
    this.raiz = raiz;
    this.atual = atual;
    this.passes = passes;
    this.aoTrocar = aoTrocar;
    this.lista = ler();
    this.status = new Map(); // id -> { pessoas, nomes, temSenha, empresa }
    this.timer = null;
    this.elLista = raiz.querySelector('.salas-lista');
    this.form = raiz.querySelector('.salas-nova');
    this.tip = raiz.querySelector('.salas-tip');
    this.dicas = new Map(); // id -> html da dica
    this.vivas = []; // salas com gente agora que a pessoa ainda não visitou

    // dica fora da coluna (que rola e cortaria o balão): uma só, posicionada ao lado do ícone
    this.elLista.addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-sala]');
      if (!b || e.pointerType === 'touch') return;
      this.tip.innerHTML = this.dicas.get(b.dataset.sala) || '';
      const r = b.getBoundingClientRect();
      this.tip.style.left = `${r.right + 12}px`;
      this.tip.style.top = `${r.top + r.height / 2}px`;
      this.tip.hidden = false;
      this.dicaDe = b.dataset.sala;
    });
    this.elLista.addEventListener('pointerleave', () => { this.tip.hidden = true; this.dicaDe = null; });

    this.elLista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sala]');
      if (b && b.dataset.sala !== this.atual()) this.aoTrocar(b.dataset.sala);
    });
    // botão direito: tira a sala da lista (a sala em si continua existindo)
    this.elLista.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('[data-sala]');
      if (!b || b.dataset.sala === this.atual()) return;
      e.preventDefault();
      this.lista = this.lista.filter((s) => s.id !== b.dataset.sala);
      gravar(this.lista);
      this.render();
    });
    raiz.querySelector('.salas-add').addEventListener('click', () => {
      this.form.hidden = !this.form.hidden;
      if (!this.form.hidden) this.form.querySelector('input').focus();
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = this.form.querySelector('input');
      const id = inp.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 40);
      if (!id) return inp.focus();
      inp.value = '';
      this.form.hidden = true;
      if (id !== this.atual()) this.aoTrocar(id);
    });
    this.form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.form.hidden = true;
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.atualizar(); });
  }

  // entrou numa sala: vai para a lista (no fim, como um servidor novo no Discord)
  visitar(id, { empresa = '', temSenha = false } = {}) {
    const ja = this.lista.find((s) => s.id === id);
    if (ja) Object.assign(ja, { empresa, temSenha, ultima: Date.now() });
    else this.lista.push({ id, empresa, temSenha, ultima: Date.now() });
    // cheia: sai a visitada há mais tempo (nunca a atual)
    while (this.lista.length > MAX) {
      const velha = this.lista.filter((s) => s.id !== id).sort((a, b) => a.ultima - b.ultima)[0];
      this.lista = this.lista.filter((s) => s !== velha);
    }
    gravar(this.lista);
    this.render();
  }

  // começa a perguntar ao servidor (a cada 8 s, só com a aba visível)
  iniciar() {
    this.atualizar();
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (!document.hidden) this.atualizar(); }, 8000);
  }

  async atualizar() {
    if (!this.lista.length) return;
    try {
      const passes = this.passes();
      const r = await fetch('/salas-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: this.lista.map((s) => s.id), passes: Object.fromEntries(this.lista.map((s) => [s.id, passes[s.id]]).filter(([, p]) => p)) }),
      });
      const { salas } = await r.json();
      for (const s of salas) this.status.set(s.id, s);
    } catch {
      return; // sem rede: fica com os números de antes
    }
    this.render();
  }

  // lista nova do /ao-vivo: atualiza os números das visitadas e mostra as outras salas com gente
  aoVivo({ salas = [] } = {}) {
    const visitadas = new Set(this.lista.map((s) => s.id));
    for (const v of salas) {
      if (!visitadas.has(v.id)) continue;
      const antes = this.status.get(v.id);
      // sala com senha: o /ao-vivo não manda nomes; ficam os do /salas-status (quem tem o passe)
      const nomes = v.temSenha && antes?.nomes?.length ? antes.nomes : v.nomes;
      this.status.set(v.id, { ...antes, ...v, nomes });
    }
    // visitada que sumiu da lista ao vivo: esvaziou (ou o dono tirou da lista) — o /salas-status confirma
    if (this.vivasAntes) for (const id of this.vivasAntes) if (visitadas.has(id) && !salas.some((v) => v.id === id)) this.atualizar();
    this.vivasAntes = salas.map((v) => v.id);
    this.vivas = salas.filter((v) => !visitadas.has(v.id)).slice(0, 15);
    for (const v of this.vivas) this.status.set(v.id, v);
    this.render();
  }

  render() {
    const atual = this.atual();
    this.dicas.clear();
    const item = (s) => {
      const st = this.status.get(s.id) || {};
      const n = st.pessoas || 0;
      const empresa = st.empresa ?? s.empresa;
      const senha = st.temSenha ?? s.temSenha;
      const nomes = (st.nomes || []).map((p) => `<li><i style="--c:${esc(p.cor)}"></i>${esc(p.nome)}</li>`).join('');
      const resto = n - (st.nomes?.length || 0);
      const agora = n ? `${n} ${n === 1 ? 'pessoa' : 'pessoas'} agora` : 'Ninguém agora';
      this.dicas.set(s.id, `<b>#${esc(s.id)}</b>${empresa ? `<small>${esc(empresa)}</small>` : ''}
        <em>${agora}${s.id === atual ? ' · você está aqui' : ''}</em>
        ${nomes ? `<ul>${nomes}${resto > 0 ? `<li class="mais">+${resto}</li>` : ''}</ul>` : ''}`);
      return `<button type="button" class="sala-it${s.id === atual ? ' on' : ''}${n ? ' viva' : ''}" data-sala="${esc(s.id)}" aria-label="Sala ${esc(s.id)}, ${agora}">
        <span class="sala-ic" style="--c:${corDa(s.id)}">${esc(sigla(empresa || s.id))}
          ${n ? `<span class="sala-qtd">${n > 99 ? '99+' : n}</span>` : ''}
          ${senha ? `<span class="sala-cadeado">${icon('lock', 10)}</span>` : ''}
        </span>
        <span class="sala-rotulo"><b>#${esc(s.id)}</b><small>${agora}</small></span>
      </button>`;
    };
    this.elLista.innerHTML = this.lista.map(item).join('')
      + (this.vivas.length ? `<span class="salas-sep" title="Outras salas com gente agora"></span>${this.vivas.map((v) => item({ id: v.id, empresa: v.empresa, temSenha: v.temSenha })).join('')}` : '');
    // a dica aberta acompanha os números novos
    if (this.dicaDe && !this.tip.hidden) this.tip.innerHTML = this.dicas.get(this.dicaDe) || '';
  }
}
