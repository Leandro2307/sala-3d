// Lan house: quem não é da vez clicou em "Tela cheia" (jogar.js e main.js soVerLan). Antes de assistir, a
// oferta: de quem é a vez, até quando, e o próximo horário livre dessa máquina, com "Alugar às 23h" ou
// "Só assistir em tela cheia". Uma vez por vez (a mesma conta e o mesmo fim); depois o clique vai direto.
// Devolve 'alugar' ({ dia, inicio } em alugar), 'ver' ou null (fechou).

const NOMES = { pc: 'PC', ps5: 'PS5' };
const jaOfereceu = new Set();
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const horaCurta = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const diaSeguinte = (dia) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);

async function horarios(sala, maquina, dia) {
  const r = await fetch('/lan/horarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sala, maquina, ...(dia ? { dia } : {}) }) });
  return r.ok ? r.json() : null;
}

// o primeiro horário livre que começa depois de agora (hoje ou amanhã, até o último dia que se reserva);
// jaComecou: vale também a hora de agora, se ainda está livre (a vez de alguém acabou no meio dela)
export async function proximoLivre(sala, maquina, { jaComecou = false } = {}) {
  let r = await horarios(sala, maquina, null);
  for (let i = 0; i < 3 && r?.ok && r.ligada; i++) {
    const agora = Date.now();
    const h = r.horas.find((x) => x.estado === 'livre' && (jaComecou ? x.inicio + 3600_000 > agora : x.inicio > agora));
    if (h) return { dia: r.dia, inicio: h.inicio, hora: h.hora, hoje: r.dia === r.hoje, preco: r.preco };
    if (r.dia >= r.ultimo) break;
    r = await horarios(sala, maquina, diaSeguinte(r.dia));
  }
  return null;
}

export function precisaOferecer(maquina, vez) {
  return !jaOfereceu.has(`${maquina}|${vez?.conta}|${vez?.fim}`);
}

export async function oferecerAluguel({ sala, maquina, vez }) {
  jaOfereceu.add(`${maquina}|${vez?.conta}|${vez?.fim}`);
  const prox = await proximoLivre(sala, maquina).catch(() => null);
  const nome = NOMES[maquina] || maquina;
  const ate = vez?.aberta ? 'até alguém novo chegar' : vez?.fim ? `até as ${horaCurta(vez.fim)}` : 'agora';
  const quando = prox ? `${prox.hoje ? 'hoje' : `dia ${prox.dia.split('-').reverse().slice(0, 2).join('/')}`} às ${prox.hora}h` : null;
  const preco = prox?.preco?.valor != null ? ` (${(prox.preco.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: (prox.preco.moeda || 'brl').toUpperCase() })} a hora)` : '';
  return new Promise((ok) => {
    const fundo = document.createElement('div');
    fundo.className = 'ep-fundo oferta-aluguel';
    fundo.innerHTML = `
      <div class="ep-card" role="dialog" aria-modal="true" aria-labelledby="oa-titulo" style="width:min(440px,100%);grid-template-rows:auto;gap:12px">
        <header class="guia-head">
          <h2 id="oa-titulo" style="margin:0;font-size:18px">O ${esc(nome)} está com ${esc(vez?.conta || 'outra pessoa')}</h2>
          <button type="button" class="icon-btn" data-oa="fechar" aria-label="Fechar">✕</button>
        </header>
        <p style="margin:0;color:var(--muted);line-height:1.45">A vez vai ${esc(ate)}. Enquanto isso, dá para assistir em tela cheia.${
          quando ? `<br><b style="color:var(--text)">Quer jogar depois? O próximo horário livre é ${esc(quando)}${esc(preco)}.</b>` : '<br>Não há horário livre nos próximos dias.'}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
          <button type="button" class="secondary" data-oa="ver">Só assistir em tela cheia</button>
          ${quando ? `<button type="button" class="primary" data-oa="alugar">Alugar ${esc(quando)}</button>` : ''}
        </div>
      </div>`;
    const fim = (r) => {
      removeEventListener('keydown', tecla, true);
      fundo.remove();
      ok(r);
    };
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fim(null); } };
    addEventListener('keydown', tecla, true);
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo) return fim(null);
      const a = e.target.closest('[data-oa]')?.dataset.oa;
      if (a === 'fechar') fim(null);
      else if (a === 'ver') fim('ver');
      else if (a === 'alugar') fim({ alugar: { dia: prox.dia, inicio: prox.inicio } });
    });
    document.body.append(fundo);
    fundo.querySelector(quando ? '[data-oa="alugar"]' : '[data-oa="ver"]')?.focus();
  });
}
