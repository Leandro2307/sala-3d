// Truco mineiro e Uno: baralhos e regras das cartas. Sem three.js nem DOM: o servidor
// (cartas-servidor.js) conduz as partidas com isto, e o navegador (cartas.js) usa para mostrar as
// cartas e saber quais dá para jogar.

// ------------------------------------------------------------------ truco mineiro
// Baralho limpo (27 cartas): só 3, 2, A, K, J e Q de cada naipe, mais o 4 de paus e os dois setes
// vermelhos — nenhum 4, 5, 6, 7, 8, 9 ou 10 fora das manilhas. Carta: valor + naipe ('7o', 'Ap'...).
// Sem vira: as manilhas são sempre as mesmas quatro, e nas outras cartas o naipe não conta.
export const VALORES_TRUCO = ['Q', 'J', 'K', 'A', '2', '3'];
export const NAIPES = ['o', 'e', 'c', 'p'];
export const SIMBOLO = { o: '♦', e: '♠', c: '♥', p: '♣' };
export const NOME_NAIPE = { o: 'ouros', e: 'espadas', c: 'copas', p: 'paus' };
export const naipeVermelho = (n) => n === 'o' || n === 'c';
// as manilhas, da mais fraca para a mais forte: pica-fumo (7 de ouros), espadilha (ás de espadas),
// copas (7 de copas) e o zap (4 de paus)
export const MANILHAS = ['7o', 'Ae', '7c', '4p'];
export const NOME_MANILHA = { '7o': 'Pica-fumo', Ae: 'Espadilha', '7c': 'Copas', '4p': 'Zap' };
// a mão vale 2; truco, seis, nove e doze (com os pontos sempre pares, a mão de onze é a de dez)
export const PASSOS_TRUCO = [2, 4, 8, 10, 12];
export const NOME_PEDIDO = { 4: 'TRUCO', 8: 'SEIS', 10: 'NOVE', 12: 'DOZE' };
export const VALE_DEZ = 4; // a mão de dez vale 4; quem corre dela dá 2

export const valorDe = (c) => c.slice(0, -1);
export const naipeDe = (c) => c.slice(-1);

export function baralhoTruco() {
  const b = [];
  for (const v of VALORES_TRUCO) for (const n of NAIPES) b.push(v + n);
  b.push('4p', '7c', '7o'); // as manilhas que não são de A a 3 (a espadilha já veio com os ases)
  return b;
}

// força da carta: manilhas acima de tudo; as outras pelo valor (3 > 2 > A > K > J > Q)
export function forcaTruco(carta) {
  const m = MANILHAS.indexOf(carta);
  if (m >= 0) return 100 + m;
  return VALORES_TRUCO.indexOf(valorDe(carta));
}

// Os gritos da mesa, como no boteco: o servidor sorteia a frase e todo mundo ouve a mesma. A voz
// (cartas.js) fala a frase; a faixa mostra o grito em letra grande.
export const GRITOS = {
  truco: ['Truco!', 'Truco, ladrão!', 'Truco, marreco!', 'Toma truco, sô!', 'Truco nessa cambada!', 'Truco, uai!'],
  seis: ['Seis!', 'Seis, ladrão!', 'Desce o seis!', 'É seis, sô!', 'Seis, que eu tô armado!', 'Seis, uai!'],
  nove: ['Nove!', 'Nove, marreco!', 'Pede nove!', 'Nove, sô!', 'É nove, uai!'],
  doze: ['Doze!', 'Doze, pra acabar!', 'Queda! Doze!', 'Doze, cambada!', 'Doze, uai!'],
  aceito: ['Desce!', 'Cai dentro!', 'Aceito!', 'Manda que eu pago!', 'Vem, uai!', 'Bora!'],
  corro: ['Corro!', 'Tô fora!', 'Corri, sô.', 'Leva, leva.', 'Vai, pode levar.'],
  dez: ['Vamo jogar, uai!', 'Bora pra mão de dez!', 'Mão de dez, desce!'],
  dezCorro: ['Essa eu corro.', 'Mão de dez não, sô.'],
  // o robô que levou um tapa ou um tiro na mesa (de brincadeira)
  apanhou: ['Ai! Isso não vale!', 'Tá nervoso, é?', 'Bate, mas o truco é meu!', 'Vou contar pro juiz!', 'Ô trem doído, sô!'],
  baleado: ['Fui atingido!', 'Ai, meu zap!', 'Isso é jogo de truco, sô!', 'Volto pra assombrar!', 'Errou! Quer dizer... acertou.'],
};
// A zoeira: o que dá para gritar na mesa a qualquer hora (o botão de megafone), no truco e no uno.
// Os robôs também zoam quando fazem uma rodada.
export const ZOEIRA = ['Tá com medo, é?', 'Pode vir que eu tô armado!', 'Desce, marreco!', 'Ô dó!', 'Aqui é Minas, sô!', 'Hoje não!', 'Cadê o truco, uai?', 'Vai chorar?'];
export const GRITO_DO_PEDIDO = { 4: 'truco', 8: 'seis', 10: 'nove', 12: 'doze' };

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
