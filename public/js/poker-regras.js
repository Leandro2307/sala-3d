// Poker Texas Hold'em: baralho e avaliação de mãos. Sem three.js nem DOM: o servidor
// (poker-servidor.js) conduz as partidas com isto, e o navegador (poker.js) usa para mostrar as
// cartas e os nomes das mãos. Carta: { n: 2..14 (11=J, 12=Q, 13=K, 14=A), s: 'p'|'c'|'o'|'e' }.

export const NAIPES = ['p', 'c', 'o', 'e'];
export const SIMBOLO = { p: '♣', c: '♥', o: '♦', e: '♠' };
export const LETRA = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rotulo = (c) => (LETRA[c.n] || c.n) + SIMBOLO[c.s];
export const cartaId = (c) => (LETRA[c.n] || c.n) + c.s;

export function novoBaralho() {
  const b = [];
  for (const s of NAIPES) for (let n = 2; n <= 14; n++) b.push({ n, s, id: cartaId({ n, s }) });
  return b;
}

// Fisher-Yates, embaralha no próprio array (o servidor passa o sorteio dele)
export function embaralhar(lista, aleatorio = Math.random) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

const NOMES_FORCA = ['Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência', 'Flush',
  'Full house', 'Quadra', 'Straight flush'];
export const nomeForca = (f) => NOMES_FORCA[f];

// agrupa por valor: devolve [[valor, quantidade], ...] do maior para o menor
const contagens = (cartas) => {
  const c = {};
  for (const k of cartas) c[k.n] = (c[k.n] || 0) + 1;
  return Object.entries(c).map(([n, q]) => [Number(n), q]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
};

// a maior sequência de 5 valores possível entre os disponíveis (com o As valendo 1 também);
// devolve os 5 valores (maiores primeiro) ou null
function melhorSequencia(valores) {
  const unicos = [...new Set(valores.map((v) => (v === 14 ? [14, 1] : [v])).flat())].sort((a, b) => b - a);
  for (let i = 0; i + 4 < unicos.length; i++) {
    let ok = true;
    for (let j = 1; j < 5; j++) if (unicos[i + j] !== unicos[i] - j) { ok = false; break; }
    if (ok) return [0, 1, 2, 3, 4].map((j) => unicos[i] - j);
  }
  return null;
}

// Avalia 5 a 7 cartas e devolve a melhor mão de 5: { forca, nome, cartas }.
// forca: 0 carta alta, 1 par, 2 dois pares, 3 trinca, 4 sequência, 5 flush, 6 full house,
// 7 quadra, 8 straight flush. cartas: as 5 da melhor mão, ordenadas para o desempate.
export function avaliarMao(cartas) {
  if (!cartas || cartas.length < 5) return { forca: 0, nome: 'Mão inválida', cartas: [] };
  const cont = contagens(cartas);
  const pares = cont.filter(([, q]) => q === 2).map(([n]) => n);
  const trincas = cont.filter(([, q]) => q === 3).map(([n]) => n);
  const quadras = cont.filter(([, q]) => q === 4).map(([n]) => n);

  // flush: tem 5+ do mesmo naipe? a mão é as 5 maiores dele
  let flush = null;
  let doFlush = null; // todas as do naipe do flush (o straight flush pode usar as menores)
  for (const s of NAIPES) {
    const doNaipe = cartas.filter((c) => c.s === s).sort((a, b) => b.n - a.n);
    if (doNaipe.length >= 5) { flush = doNaipe.slice(0, 5); doFlush = doNaipe; break; }
  }
  const sequencia = melhorSequencia(cartas.map((c) => c.n));

  let forca, tie;
  // straight flush: uma sequência só com as cartas do naipe do flush
  const seqFlush = doFlush && melhorSequencia(doFlush.map((c) => c.n));
  if (seqFlush) { forca = 8; tie = seqFlush; }
  if (forca === undefined && quadras.length) {
    forca = 7;
    const resto = cont.find(([n, q]) => n !== quadras[0] && q < 4);
    tie = [quadras[0], resto ? resto[0] : 0];
  }
  if (forca === undefined && trincas.length && (pares.length || trincas.length > 1)) {
    forca = 6;
    const p = trincas.length > 1 ? trincas[1] : pares[0];
    tie = [trincas[0], p];
  }
  if (forca === undefined && flush) { forca = 5; tie = flush.map((c) => c.n); }
  if (forca === undefined && sequencia) { forca = 4; tie = sequencia; }
  if (forca === undefined && trincas.length) {
    forca = 3;
    const kickers = cont.filter(([n, q]) => n !== trincas[0]).map(([n]) => n).sort((a, b) => b - a);
    tie = [trincas[0], ...kickers.slice(0, 2)];
  }
  if (forca === undefined && pares.length >= 2) {
    forca = 2;
    const [alto, baixo] = [Math.max(...pares), Math.min(...pares)];
    const kicker = cont.find(([n, q]) => n !== alto && n !== baixo)?.[0] || 0;
    tie = [alto, baixo, kicker];
  }
  if (forca === undefined && pares.length === 1) {
    forca = 1;
    const kickers = cont.filter(([n]) => n !== pares[0]).map(([n]) => n).sort((a, b) => b - a);
    tie = [pares[0], ...kickers.slice(0, 3)];
  }
  if (forca === undefined) {
    forca = 0;
    tie = cont.map(([n]) => n).sort((a, b) => b - a).slice(0, 5);
  }

  // as 5 cartas da melhor mão, na ordem do desempate (o As-baixo entra como 14, vale 1)
  let escolhidas;
  if (forca === 8 || forca === 4) {
    const de = forca === 8 ? doFlush : cartas;
    escolhidas = tie.map((n) => de.find((c) => c.n === n || (n === 1 && c.n === 14))).filter(Boolean);
  }
  else if (forca === 5) escolhidas = flush;
  else {
    const porValor = (n) => cartas.filter((c) => c.n === n).sort((a, b) => a.s < b.s ? -1 : 1);
    escolhidas = [];
    for (const n of tie) if (n > 0) escolhidas.push(...porValor(n));
    escolhidas = escolhidas.slice(0, 5);
  }
  return { forca, nome: NOMES_FORCA[forca], cartas: escolhidas, tie };
}

// compara duas avaliações (avaliarMao): -1 se a < b, 0 empate, 1 se a > b
export function compararMaos(a, b) {
  const A = a.forca !== undefined ? a : avaliarMao(a);
  const B = b.forca !== undefined ? b : avaliarMao(b);
  if (A.forca !== B.forca) return A.forca < B.forca ? -1 : 1;
  for (let i = 0; i < Math.max(A.tie.length, B.tie.length); i++) {
    const x = A.tie[i] || 0, y = B.tie[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Os vencedores (split pot) entre jogadores [{ id, cartas:[2] }], com as cartas comunitárias.
// Devolve o array dos jogadores com a melhor mão de 5 entre as 7 (empate divide).
export function vencedores(jogadores, comunitarias) {
  const avaliados = jogadores
    .filter((j) => j.cartas?.length === 2)
    .map((j) => ({ jogo: j, aval: avaliarMao([...j.cartas, ...comunitarias]) }));
  if (!avaliados.length) return [];
  let melhor = avaliados[0].aval;
  for (const a of avaliados.slice(1)) if (compararMaos(a.aval, melhor) > 0) melhor = a.aval;
  return avaliados.filter((a) => compararMaos(a.aval, melhor) === 0).map((a) => a.jogo);
}
