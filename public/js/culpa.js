// De quem é a culpa da imagem ruim no modo jogo, na hora (o selo "Mostrar desempenho"): a mesma ideia do
// scripts/diagnostico-jogo.js, que só julga depois, com os dois relatórios na mão. Aqui quem joga já tem os
// dois lados: o que mediu e o que quem compartilha manda a cada 2 s (la: captura, enviados, fila, sonda).
//
// lado: 'host'    o PC que transmite, o PS5 ou a internet de lá
//       'voce'    o aparelho de quem recebe, ou a internet dele
//       'caminho' a internet entre os dois (as duas pontas limpas), ou sem como separar
//       null      imagem boa
// A sonda (ping até o servidor, jogo-diag.js) de cada ponta separa a internet de um da do outro: pico nela
// na hora da falha é a rede daquela ponta. É um indício, não prova: um soluço do Wi-Fi mais curto que o
// intervalo da sonda (0,5 s) escapa dela, e aí fica em 'caminho'.

export const BOM = 50; // quadros por segundo
const FILA_RUIM = 60; // ms de fila medida (viagem p90 − a menor)
const BUFFER_RUIM = 250; // ms esperando no buffer do vídeo normal
const DEC_LENTO = 14; // ms por quadro: perto de um quadro inteiro a 60 qps
const PAGINA_RUIM = 150; // ms de página travada numa amostra

// a ida e volta do PC que transmite até o roteador dele (ajudante 1.26+, 5 vezes por segundo): é o Wi-Fi de lá, sem a
// internet no meio. Roteador que não responde nada (só falhas) não diz nada.
const ROTEADOR_PICO = 60; // ms
export const roteadorRuim = (r) => !!r && r.n > 0 && ((r.max ?? 0) > ROTEADOR_PICO || (r.falhas || 0) >= 2);

const sondaRuim = (s) => !!s && ((s.picos || 0) > 0 || (s.falhas || 0) > 0);
const n = (v) => (v == null ? '–' : Math.round(v));

// r: a amostra de quem joga (DiagJogo.amostraRecebe); la: o que quem compartilha contou (ou null)
// aparelho: como chamar o de quem joga ('seu PC', 'a TV')
export function culpaDe(r, la = r?.la ?? null, aparelho = 'seu PC') {
  const tb = r?.turbo || null;
  const qps = tb?.qps ?? r?.fpsFinal ?? null;
  // a imagem chega e o aparelho joga todos os quadros fora (a Philips, 2026-11-23 11:53)
  if (r?.parou) return { lado: 'voce', onde: 'parou', texto: `${aparelho}: a imagem parou de ser mostrada` };
  if (qps == null) return null;
  const travadas = r.ritmo?.travadas || [];
  const causas = travadas.map((t) => String(t.causa || ''));
  const fila = tb?.filaMs ?? null;
  const ruim = qps < BOM || travadas.length > 0 || (fila != null && fila > FILA_RUIM) || (!tb && (r.bufferMs ?? 0) > BUFFER_RUIM);
  if (!ruim) return null;
  const ps5 = !!la?.ps5;

  // o aparelho daqui: a página travou, o decodificador atrasou, ou a tela não mostrou o que chegou
  const aqui = causas.filter((c) => /^(aqui|decodificador)/.test(c)).length;
  if ((tb?.decAtrasou || 0) > 0 || (tb?.decMs ?? r.decMs ?? 0) > DEC_LENTO || (aqui > 0 && aqui === causas.length)
    || (r.pagina?.maiorMs || 0) > PAGINA_RUIM) {
    const porque = (tb?.decAtrasou || 0) > 0 || (tb?.decMs ?? r.decMs ?? 0) > DEC_LENTO ? 'o decodificador não dá conta'
      : (r.pagina?.maiorMs || 0) > PAGINA_RUIM ? 'a página travou' : 'a tela demorou a mostrar';
    return { lado: 'voce', onde: 'aparelho', texto: `${aparelho}: ${porque}` };
  }
  // lá chegou pouco da origem (o PS5 pelo Wi-Fi de lá, ou a captura do jogo)
  if (la?.captura != null && la.captura < BOM) {
    return ps5
      ? { lado: 'host', onde: 'ps5', texto: `o PC que transmite só recebe ${n(la.captura)} qps do PS5` }
      : { lado: 'host', onde: 'captura', texto: `o jogo só dá ${n(la.captura)} qps no PC que transmite` };
  }
  const pulou = la?.turbo?.puladosFila || 0;
  const filaCheia = pulou > 0 || (fila != null && fila > FILA_RUIM);
  // lá chegou tudo e saiu pouco, sem a rede estar cheia: foi o PC de lá
  if (la?.enviado != null && la.enviado < BOM && !filaCheia) {
    return { lado: 'host', onde: 'pc', texto: `o PC que transmite mandou ${n(la.enviado)} de ${n(la.captura)} qps` };
  }
  // daqui para baixo é rede
  if (roteadorRuim(la?.roteador)) return { lado: 'host', onde: 'wifi', texto: `o Wi-Fi do PC que transmite (até o roteador: ${la.roteador.falhas ? `${la.roteador.falhas} sem resposta` : `${n(la.roteador.max)} ms`})` };
  const host = sondaRuim(la?.sonda);
  const eu = sondaRuim(r.sonda);
  if (host && !eu) return { lado: 'host', onde: 'rede', texto: 'a internet (ou o Wi-Fi) do PC que transmite' };
  if (eu && !host) return { lado: 'voce', onde: 'rede', texto: 'a sua internet (ou o seu Wi-Fi)' };
  if (!la) return { lado: 'caminho', onde: 'sem-noticia', texto: 'sem notícia do PC que transmite' };
  if (host && eu) return { lado: 'caminho', onde: 'os-dois', texto: 'a internet dos dois lados' };
  return { lado: 'caminho', onde: 'caminho', texto: 'a internet entre vocês' };
}

const NOME = { host: 'HOST', voce: 'VOCÊ', caminho: 'INTERNET' };

// A segunda linha do selo. contas: { host, voce, caminho, total } da sessão
export function linhaDaCulpa(culpa, contas) {
  const ruins = (contas?.host || 0) + (contas?.voce || 0) + (contas?.caminho || 0);
  const pct = (k) => `${Math.round((100 * (contas?.[k] || 0)) / ruins)}%`;
  const soma = ruins ? ` · quedas: host ${pct('host')}, você ${pct('voce')}, internet ${pct('caminho')} (${ruins})` : '';
  if (!culpa) return `✓ tudo certo${soma}`;
  return `⚠ culpa: ${NOME[culpa.lado]} (${culpa.texto})${soma}`;
}

export function contarCulpa(contas, culpa) {
  contas.total = (contas.total || 0) + 1;
  if (culpa) contas[culpa.lado] = (contas[culpa.lado] || 0) + 1;
  return contas;
}

// A sonda até o servidor para páginas sem o DiagJogo (a TV): a mesma conta de jogo-diag.js
export class Sonda {
  constructor(ms = 1000) {
    this.medidas = [];
    this.falhas = 0;
    this.minimos = [];
    this.ligada = false;
    this.ocupada = false;
    setInterval(() => this.medir(), ms);
  }

  async medir() {
    if (!this.ligada || this.ocupada || document.visibilityState === 'hidden') return;
    this.ocupada = true;
    const t0 = performance.now();
    try {
      const r = await fetch(`/ping-jogo?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      this.medidas.push(performance.now() - t0);
    } catch {
      this.falhas++;
    } finally {
      this.ocupada = false;
    }
  }

  tirar() {
    const v = this.medidas;
    const falhas = this.falhas;
    this.medidas = [];
    this.falhas = 0;
    if (!v.length && !falhas) return null;
    if (v.length) {
      this.minimos.push(Math.min(...v));
      if (this.minimos.length > 15) this.minimos.shift();
    }
    const base = this.minimos.length ? Math.min(...this.minimos) : null;
    return { n: v.length, max: v.length ? Math.round(Math.max(...v)) : null, base: base != null ? Math.round(base) : null, picos: base != null ? v.filter((x) => x > base + 80).length : 0, falhas };
  }
}
