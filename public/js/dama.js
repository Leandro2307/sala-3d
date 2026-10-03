// Regras do jogo de damas (regra brasileira) e um adversário de computador.
//
// Tabuleiro 8x8, só as casas escuras (a1 é escura). Casa = linha * 8 + coluna, linha 0 = fileira 1.
// Peças: 'w' pedra clara, 'W' dama clara, 'b' pedra escura, 'B' dama escura.
// - Pedra anda uma casa na diagonal para frente e captura para frente e para trás.
// - Dama anda e captura em qualquer distância na diagonal ("dama voadora").
// - Capturar é obrigatório, e vale a lei da maioria: tem que pegar o máximo de peças possível.
// - As peças capturadas só saem no fim do lance (não dá para pular a mesma duas vezes).
// - Só vira dama a pedra que TERMINA o lance na última fileira.
import { casaNome, casaDe } from './xadrez.js';

export { casaNome, casaDe };

const col = (i) => i & 7;
const lin = (i) => i >> 3;
const corDe = (p) => p.toLowerCase();
const ehDama = (p) => p === 'W' || p === 'B';
const DIRS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

export function novo() {
  const b = new Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if ((col(i) + lin(i)) % 2 !== 0) continue; // casa clara
    if (lin(i) <= 2) b[i] = 'w';
    else if (lin(i) >= 5) b[i] = 'b';
  }
  return { b, vez: 'w', semCaptura: 0, n: 0 };
}

const dentro = (c, l) => c >= 0 && c < 8 && l >= 0 && l < 8;

// Todas as sequências de captura a partir de "de". Cada uma: { caminho, capturas }.
function capturasDe(b, de, p) {
  const cor = corDe(p);
  const out = [];
  const passo = (pos, caminho, capturadas) => {
    let estendeu = false;
    const c0 = col(pos);
    const l0 = lin(pos);
    for (const [dc, dl] of DIRS) {
      if (ehDama(p)) {
        let c = c0 + dc;
        let l = l0 + dl;
        while (dentro(c, l) && !b[l * 8 + c]) { c += dc; l += dl; }
        if (!dentro(c, l)) continue;
        const alvo = l * 8 + c;
        if (corDe(b[alvo]) === cor || capturadas.includes(alvo)) continue;
        c += dc;
        l += dl;
        while (dentro(c, l) && !b[l * 8 + c]) {
          estendeu = true;
          const pouso = l * 8 + c;
          passo(pouso, [...caminho, pouso], [...capturadas, alvo]);
          c += dc;
          l += dl;
        }
      } else {
        const c1 = c0 + dc;
        const l1 = l0 + dl;
        const c2 = c0 + dc * 2;
        const l2 = l0 + dl * 2;
        if (!dentro(c2, l2)) continue;
        const alvo = l1 * 8 + c1;
        const pouso = l2 * 8 + c2;
        if (!b[alvo] || corDe(b[alvo]) === cor || capturadas.includes(alvo) || b[pouso]) continue;
        estendeu = true;
        passo(pouso, [...caminho, pouso], [...capturadas, alvo]);
      }
    }
    if (!estendeu && capturadas.length) out.push({ caminho, capturas: capturadas });
  };
  // a peça que está andando sai da casa de origem (pode passar por ela de novo)
  const p0 = b[de];
  b[de] = null;
  passo(de, [de], []);
  b[de] = p0;
  return out;
}

export function legais(st) {
  const b = st.b.slice();
  const caps = [];
  const simples = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || corDe(p) !== st.vez) continue;
    caps.push(...capturasDe(b, i, p));
    if (caps.length) continue;
    const c0 = col(i);
    const l0 = lin(i);
    for (const [dc, dl] of DIRS) {
      if (!ehDama(p) && dl !== (st.vez === 'w' ? 1 : -1)) continue;
      let c = c0 + dc;
      let l = l0 + dl;
      while (dentro(c, l) && !b[l * 8 + c]) {
        simples.push({ caminho: [i, l * 8 + c], capturas: [] });
        if (!ehDama(p)) break;
        c += dc;
        l += dl;
      }
    }
  }
  if (!caps.length) return simples;
  const max = Math.max(...caps.map((m) => m.capturas.length));
  return caps.filter((m) => m.capturas.length === max);
}

export function aplicar(st, m) {
  const b = st.b.slice();
  const de = m.caminho[0];
  const para = m.caminho[m.caminho.length - 1];
  let p = b[de];
  b[de] = null;
  for (const c of m.capturas) b[c] = null;
  if (p === 'w' && lin(para) === 7) p = 'W';
  if (p === 'b' && lin(para) === 0) p = 'B';
  b[para] = p;
  return {
    b,
    vez: st.vez === 'w' ? 'b' : 'w',
    // conta lances só de dama sem captura: 20 seguidos é empate
    semCaptura: m.capturas.length || !ehDama(st.b[de]) ? 0 : st.semCaptura + 1,
    n: st.n + 1,
  };
}

export const promoveu = (st, m) => {
  const p = st.b[m.caminho[0]];
  const para = m.caminho[m.caminho.length - 1];
  return (p === 'w' && lin(para) === 7) || (p === 'b' && lin(para) === 0);
};

export function situacao(st) {
  if (!legais(st).length) return { fim: true, vencedor: st.vez === 'w' ? 'b' : 'w', motivo: 'Sem lances' };
  if (st.semCaptura >= 40) return { fim: true, vencedor: null, motivo: 'Empate: 20 lances de dama sem captura' };
  return { fim: false };
}

export const paraTexto = (m) => m.caminho.map(casaNome).join(m.capturas.length ? 'x' : '-');
export function deTexto(st, s) {
  return legais(st).find((m) => paraTexto(m) === s) || null;
}

export function descrever(st, m) {
  const ini = casaNome(m.caminho[0]);
  const fim = casaNome(m.caminho[m.caminho.length - 1]);
  const dama = ehDama(st.b[m.caminho[0]]) ? 'Dama' : 'Pedra';
  let txt = m.capturas.length ? `${dama} ${ini} come ${m.capturas.length} e para em ${fim}` : `${dama} ${ini} para ${fim}`;
  if (promoveu(st, m)) txt += ' — virou dama!';
  return txt;
}

// ------------------------------------------------------------------ computador
function avaliar(st) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = st.b[i];
    if (!p) continue;
    const branca = corDe(p) === 'w';
    let v = ehDama(p) ? 320 : 100;
    if (!ehDama(p)) {
      v += (branca ? lin(i) : 7 - lin(i)) * 4; // avançar é bom
      if ((branca ? lin(i) : 7 - lin(i)) === 0) v += 8; // guardar a última fileira impede dama do outro
    }
    if (col(i) === 0 || col(i) === 7) v += 3; // na borda não é comida
    s += branca ? v : -v;
  }
  return st.vez === 'w' ? s : -s;
}

function busca(st, prof, alfa, beta, ply) {
  const ms = legais(st);
  if (!ms.length) return -100000 + ply;
  // capturas obrigatórias não contam profundidade: evita parar no meio de uma troca
  if (prof <= 0 && !ms[0].capturas.length) return avaliar(st);
  if (prof <= -6) return avaliar(st);
  for (const m of ms) {
    const v = -busca(aplicar(st, m), prof - 1, -beta, -alfa, ply + 1);
    if (v >= beta) return beta;
    if (v > alfa) alfa = v;
  }
  return alfa;
}

export function lanceDoComputador(st, prof = 5) {
  const ms = legais(st);
  if (!ms.length) return null;
  if (ms.length === 1) return ms[0];
  let melhor = [];
  let alfa = -Infinity;
  for (const m of ms) {
    const v = -busca(aplicar(st, m), prof - 1, -Infinity, -alfa + 8, 1) + Math.random() * 4;
    if (v > alfa + 8) {
      alfa = v;
      melhor = [m];
    } else if (v >= alfa - 8) {
      melhor.push(m);
      if (v > alfa) alfa = v;
    }
  }
  return melhor[Math.floor(Math.random() * melhor.length)];
}

// "c3 d4", "c3 e5 c7" (com capturas, as casas por onde passa), ou só o destino se der para adivinhar.
export function interpretar(st, casas) {
  const ls = legais(st);
  if (!casas.length) return { erro: 'Diga as casas, por exemplo "c3 d4".' };
  let cand = ls;
  if (casas.length === 1) cand = ls.filter((m) => m.caminho[m.caminho.length - 1] === casas[0]);
  else cand = ls.filter((m) => m.caminho[0] === casas[0] && casas.slice(1).every((c) => m.caminho.includes(c)) && m.caminho[m.caminho.length - 1] === casas[casas.length - 1]);
  if (cand.length === 1) return { lance: cand[0] };
  if (!cand.length) {
    if (ls[0]?.capturas.length) return { erro: `Captura obrigatória! Você tem que comer ${ls[0].capturas.length === 1 ? 'uma peça' : `${ls[0].capturas.length} peças`}.` };
    return { erro: 'Esse lance não pode.' };
  }
  return { erro: 'Tem mais de um jeito: diga também a casa de saída e as casas do caminho.' };
}
