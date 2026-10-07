// Regras do jogo da velha e o adversário de computador.
// Casa = linha * 3 + coluna (linha 0 = fileira 1, coluna 0 = "a"). Peças 'x' (começa) e 'o'.
// A interface é a mesma de xadrez.js/dama.js, para jogos.js e o servidor tratarem igual.

const LINHAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const PECA = { w: 'x', b: 'o' };

export const casaNome = (i) => 'abc'[i % 3] + (Math.floor(i / 3) + 1);

export function novo() {
  return { b: new Array(9).fill(null), vez: 'w', n: 0 };
}

export function legais(st) {
  if (vencedora(st.b)) return [];
  const out = [];
  for (let i = 0; i < 9; i++) if (!st.b[i]) out.push({ casa: i, p: PECA[st.vez] });
  return out;
}

export function aplicar(st, m) {
  const b = st.b.slice();
  b[m.casa] = m.p;
  return { b, vez: st.vez === 'w' ? 'b' : 'w', n: st.n + 1 };
}

function vencedora(b) {
  for (const l of LINHAS) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l;
  return null;
}

export function situacao(st) {
  const linha = vencedora(st.b);
  if (linha) return { fim: true, vencedor: st.b[linha[0]] === 'x' ? 'w' : 'b', motivo: 'Três em linha', linha };
  if (st.b.every(Boolean)) return { fim: true, vencedor: null, motivo: 'Deu velha — empate' };
  return { fim: false };
}

export const paraTexto = (m) => casaNome(m.casa);
export function deTexto(st, s) {
  return legais(st).find((m) => casaNome(m.casa) === s) || null;
}
export const descrever = (st, m) => `${m.p.toUpperCase()} em ${casaNome(m.casa)}`;

// minimax completo (são no máximo 9! posições, cabe fácil)
function nota(b, vez, prof) {
  const l = vencedora(b);
  if (l) return b[l[0]] === PECA[vez] ? 10 - prof : prof - 10;
  if (b.every(Boolean)) return 0;
  let melhor = -Infinity;
  const outro = vez === 'w' ? 'b' : 'w';
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = PECA[vez];
    melhor = Math.max(melhor, -nota(b, outro, prof + 1));
    b[i] = null;
  }
  return melhor;
}

// nível 0: quase aleatório (só não deixa passar a vitória); 1: ganha e bloqueia, às vezes erra;
// 2: perfeito (no máximo empata com ele)
export function lanceDoComputador(st, nivel = 1) {
  const ms = legais(st);
  if (!ms.length) return null;
  // tabuleiro vazio: o minimax dá empate em todas as casas, depois de passar por mais de meio
  // milhão de posições. Sortear direto dá a mesma distribuição, em qualquer nível.
  if (ms.length === 9) return ms[Math.floor(Math.random() * 9)];
  const sorteio = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const ganha = (m, vez) => {
    const b = st.b.slice();
    b[m.casa] = PECA[vez];
    return !!vencedora(b);
  };
  const outro = st.vez === 'w' ? 'b' : 'w';
  const vitoria = ms.find((m) => ganha(m, st.vez));
  if (vitoria) return vitoria;
  if (nivel === 0) return sorteio(ms);
  const bloqueio = ms.find((m) => ganha(m, outro));
  if (bloqueio && (nivel === 2 || Math.random() < 0.85)) return bloqueio;
  if (nivel === 1 && Math.random() < 0.35) return sorteio(ms);
  let melhor = -Infinity;
  let bons = [];
  for (const m of ms) {
    const b = st.b.slice();
    b[m.casa] = m.p;
    const v = -nota(b, outro, 1);
    if (v > melhor) {
      melhor = v;
      bons = [m];
    } else if (v === melhor) bons.push(m);
  }
  return sorteio(bons);
}

// casas vêm de casasNoTexto (índice do tabuleiro 8x8): converte para o 3x3
export function interpretar(st, casas8) {
  const casas = casas8.map((i) => ((i & 7) < 3 && (i >> 3) < 3 ? (i >> 3) * 3 + (i & 7) : -1));
  if (!casas.length || casas[0] < 0) return { erro: 'Diga uma casa de a1 a c3 (ex.: "b2" é o meio).' };
  const m = legais(st).find((x) => x.casa === casas[casas.length - 1]);
  return m ? { lance: m } : { erro: 'Essa casa já está ocupada.' };
}
