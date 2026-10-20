// Truco paulista e Uno: baralhos e regras das cartas. Sem three.js nem DOM: o servidor
// (cartas-servidor.js) conduz as partidas com isto, e o navegador (cartas.js) usa para mostrar as
// cartas e saber quais dá para jogar.

// ------------------------------------------------------------------ truco paulista
// Baralho sem 8, 9 e 10. Carta: valor + naipe ('7o', 'Ap'...). Naipes, do mais fraco ao mais forte
// entre as manilhas: ouros, espadas, copas, paus (o zap).
export const VALORES_TRUCO = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
export const NAIPES = ['o', 'e', 'c', 'p'];
export const SIMBOLO = { o: '♦', e: '♠', c: '♥', p: '♣' };
export const NOME_NAIPE = { o: 'ouros', e: 'espadas', c: 'copas', p: 'paus' };
export const naipeVermelho = (n) => n === 'o' || n === 'c';
export const PASSOS_TRUCO = [1, 3, 6, 9, 12]; // quanto a mão vale a cada pedido
export const NOME_PEDIDO = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

export const valorDe = (c) => c.slice(0, -1);
export const naipeDe = (c) => c.slice(-1);

export function baralhoTruco() {
  const b = [];
  for (const v of VALORES_TRUCO) for (const n of NAIPES) b.push(v + n);
  return b;
}

// a manilha é o valor seguinte ao da vira (depois do 3 vem o 4)
export const manilhaDa = (vira) => VALORES_TRUCO[(VALORES_TRUCO.indexOf(valorDe(vira)) + 1) % VALORES_TRUCO.length];

// força da carta nesta mão: manilhas acima de tudo, pelo naipe; as outras pelo valor (naipe não conta)
export function forcaTruco(carta, vira) {
  const v = valorDe(carta);
  if (v === manilhaDa(vira)) return 100 + NAIPES.indexOf(naipeDe(carta));
  return VALORES_TRUCO.indexOf(v);
}

// ------------------------------------------------------------------ uno
// Carta: cor + símbolo ('r7', 'gP2' = +2 verde, 'bB' = bloqueio azul, 'yI' = inverter amarelo) ou
// coringa ('W', 'W4'). Coringa jogado guarda a cor escolhida em `cor` no estado da mesa.
export const CORES_UNO = ['r', 'g', 'b', 'y'];
export const NOME_COR = { r: 'vermelho', g: 'verde', b: 'azul', y: 'amarelo' };
export const HEX_COR = { r: '#ef4444', g: '#22c55e', b: '#3b82f6', y: '#eab308' };

export function baralhoUno() {
  const b = [];
  for (const c of CORES_UNO) {
    b.push(`${c}0`);
    for (let k = 0; k < 2; k++) {
      for (let n = 1; n <= 9; n++) b.push(`${c}${n}`);
      b.push(`${c}B`, `${c}I`, `${c}P2`);
    }
  }
  for (let k = 0; k < 4; k++) b.push('W', 'W4');
  return b;
}

export const coringa = (c) => c === 'W' || c === 'W4';
export const corUno = (c) => (coringa(c) ? null : c[0]);
export const simboloUno = (c) => (coringa(c) ? c : c.slice(1));

// dá para jogar esta carta em cima de `topo`, com a cor valendo `cor`?
export function podeJogarUno(carta, topo, cor) {
  if (coringa(carta)) return true;
  return corUno(carta) === cor || simboloUno(carta) === simboloUno(topo);
}

// o texto da carta, para mostrar
export function rotuloUno(c) {
  const s = simboloUno(c);
  return { B: '⊘', I: '⇄', P2: '+2', W: '★', W4: '+4' }[s] ?? s;
}

// embaralha (o servidor passa o sorteio dele)
export function embaralhar(lista, aleatorio = Math.random) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}
