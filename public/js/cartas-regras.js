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
  // o robô que levou um arremesso na mesa (tomate, galinha...)
  sujou: ['Tô todo melado!', 'Quem joga comida, sô?!', 'Ai, minha roupa nova!', 'Isso é falta de respeito!', 'Vou chamar a limpeza!', 'Lavar não adianta, a vergonha fica!'],
  // o 21: pedir, parar, ganhar a rodada e perder a mão
  pede21: ['Manda carta!', 'Mais uma!', 'Vem, carta!', 'Bora, mais uma!'],
  para21: ['Parei.', 'Tô bem assim.', 'Fico aqui.', 'Chega pra mim.'],
  ganhou21: ['Passa os dedos!', 'Contei as cartas, sô!', 'Essa foi fácil!', 'Mais um dedo pra coleção!'],
};
// A zoeira: o que dá para gritar na mesa a qualquer hora (o botão de megafone), no truco e no uno.
// Os robôs também zoam quando fazem uma rodada, e de vez em quando soltam uma do nada no meio do jogo.
export const ZOEIRA = [
  'Tá com medo, é?', 'Pode vir que eu tô armado!', 'Desce, marreco!', 'Ô dó!', 'Aqui é Minas, sô!', 'Hoje não!',
  'Cadê o truco, uai?', 'Vai chorar?', 'Ô trem ruim, sô!', 'Vou chamar o VAR!', 'Aprendi no boteco!',
  'Tá jogando de graça?', 'Que mão é essa, uai?', 'Essa eu jogo de olho fechado!', 'Pode pedir música!',
  'Ô lapada, sô!', 'Anota a placa!', 'Chama no truco, uai!', 'Essa carta tem dono!', 'Tá tremendo, é?',
  'Eu avisei, uai!', 'Segura essa, marreco!', 'Nem o padre te salva!', 'Passei o rodo, sô!',
  'Joga e chora depois!', 'Uai, perdeu já?', 'Isso não é jogo de dama não!', 'Devolve meu troco!',
];
export const GRITO_DO_PEDIDO = { 4: 'truco', 8: 'seis', 10: 'nove', 12: 'doze' };

// Os sinais do truco: o cochicho que só o parceiro ouve ('ct-sinal' vai só para o lugar (k+2)%4).
// bom: a frase combina com mão boa (true) ou ruim (false) — o robô parceiro escolhe a que combina com a dele.
export const SINAIS = [
  { f: 'Tenho o Zap! ♣️', bom: true }, { f: 'Tenho manilha na mão!', bom: true },
  { f: 'Tô carregado, sô!', bom: true }, { f: 'Pede truco!', bom: true },
  { f: 'Aumenta que eu cubro!', bom: true }, { f: 'Cai dentro que eu seguro!', bom: true },
  { f: 'Tô fraquinho...', bom: false }, { f: 'Não truca não!', bom: false },
  { f: 'Se trucarem, a gente corre!', bom: false }, { f: 'Só vim com lixo', bom: false },
  { f: 'Cobre ela pra mim!', bom: null }, { f: 'Dribla essa rodada!', bom: null },
  { f: 'Vou de coberta, hein?', bom: null }, { f: 'Segura a próxima!', bom: null },
];

// As coisas que dá para jogar em quem está na mesa ('ct-arremesso'), de brincadeira. texto: o barulho
// do acerto no balão.
export const ARREMESSOS = {
  tomate: { nome: 'Tomate', emoji: '🍅', texto: 'SPLAT!' },
  galinha: { nome: 'Galinha', emoji: '🐔', texto: 'COCORICÓ!' },
  ovo: { nome: 'Ovo', emoji: '🥚', texto: 'PLOC!' },
  torta: { nome: 'Torta', emoji: '🥧', texto: 'PÁ!' },
  chinelo: { nome: 'Chinelo', emoji: '🩴', texto: 'CHAP!' },
  peixe: { nome: 'Peixe', emoji: '🐟', texto: 'FLAP!' },
  agua: { nome: 'Balão d’água', emoji: '💦', texto: 'SPLASH!' },
  coco: { nome: 'Coco', emoji: '🥥', texto: 'TUM!' },
};

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

// ------------------------------------------------------------------ 21 (o duelo dos trunfos)
// Como o 21 do Resident Evil 7: dois na mesa, um contra o outro (ou contra o robô). O baralho tem só
// 11 cartas, de 1 a 11, uma de cada: dá para contar o que já saiu. Cada um começa a rodada com duas
// cartas, a primeira fechada (o rival não vê). Na sua vez: usa quantos trunfos quiser e depois pede
// uma carta ou para. A rodada fecha quando os dois param em seguida; quem passou da meta perde (os
// dois passaram: perde quem passou mais), senão ganha quem chegou mais perto. Quem perde a rodada
// perde dedos — tantos quanto a aposta DELE (cada um tem a sua: os trunfos de aposta sobem a do
// rival, os escudos descem a sua). Sem dedos, acabou. Carta: 'n7'; o verso é 'verso'.
export const MAX_21 = 11;
export const DEDOS_21 = 10; // as duas mãos
export const MAX_TRUNFOS_21 = 7;
export const META_21 = 21;
export const RODADAS_POR_APOSTA = 3; // a aposta base sobe 1 a cada 3 rodadas (a partida não se arrasta)
export const carta21 = (n) => `n${n}`;
export const numero21 = (c) => (/^n\d+$/.test(c) ? Number(c.slice(1)) : 0);
export const soma21 = (mao) => mao.reduce((s, n) => s + (typeof n === 'number' ? n : numero21(n)), 0);
export function baralho21() {
  const b = [];
  for (let n = 1; n <= MAX_21; n++) b.push(n);
  return b;
}
export const apostaBase21 = (rodada) => 1 + Math.floor((Math.max(1, rodada) - 1) / RODADAS_POR_APOSTA);

// Os trunfos. mesa: fica na mesa (vale enquanto estiver lá, até o fim da rodada ou até o rival
// destruir); os outros fazem efeito na hora. peso: a chance no sorteio.
export const TRUNFOS_21 = {
  c2: { nome: 'Carta 2', desc: 'Compra o 2, se ele ainda estiver no baralho.', icone: '2', cor: '#9ae6b4', peso: 4 },
  c3: { nome: 'Carta 3', desc: 'Compra o 3, se ele ainda estiver no baralho.', icone: '3', cor: '#9ae6b4', peso: 4 },
  c4: { nome: 'Carta 4', desc: 'Compra o 4, se ele ainda estiver no baralho.', icone: '4', cor: '#9ae6b4', peso: 4 },
  c5: { nome: 'Carta 5', desc: 'Compra o 5, se ele ainda estiver no baralho.', icone: '5', cor: '#9ae6b4', peso: 4 },
  c6: { nome: 'Carta 6', desc: 'Compra o 6, se ele ainda estiver no baralho.', icone: '6', cor: '#9ae6b4', peso: 4 },
  c7: { nome: 'Carta 7', desc: 'Compra o 7, se ele ainda estiver no baralho.', icone: '7', cor: '#9ae6b4', peso: 4 },
  devolver: { nome: 'Devolver', desc: 'Sua última carta aberta volta para o baralho.', icone: '↩️', cor: '#ff9966', peso: 6 },
  remover: { nome: 'Remover', desc: 'A última carta aberta do rival volta para o baralho.', icone: '🫳', cor: '#ff7a59', peso: 5 },
  troca: { nome: 'Troca', desc: 'Troca a sua última carta aberta com a do rival.', icone: '🔁', cor: '#ff6600', peso: 4 },
  perfeita: { nome: 'Compra Perfeita', desc: 'Compra a maior carta do baralho que não passa da meta.', icone: '✨', cor: '#cc66ff', peso: 2 },
  presente: { nome: 'Presente de Grego', desc: 'O rival compra a maior carta que ainda está no baralho.', icone: '🎁', cor: '#ff4da6', peso: 3 },
  raiox: { nome: 'Raio-X', desc: 'Você vê a carta fechada do rival nesta rodada.', icone: '👁️', cor: '#73ffcc', peso: 3 },
  trocaTrunfos: { nome: 'Troca de Trunfos', desc: 'Descarta 2 trunfos seus (sorteados) e ganha 3 novos.', icone: '🔀', cor: '#facc15', peso: 3 },
  feliz: { nome: 'Felicidade', desc: 'Você e o rival ganham um trunfo cada.', icone: '😊', cor: '#fde68a', peso: 2 },
  destruir: { nome: 'Destruir', desc: 'Tira da mesa o último trunfo que o rival pôs lá.', icone: '💥', cor: '#ff3333', peso: 5 },
  destruirTudo: { nome: 'Destruir+', desc: 'Tira da mesa todos os trunfos do rival.', icone: '☢️', cor: '#cc0000', peso: 2 },
  mais1: { nome: 'Aposta +1', desc: 'Na mesa: a aposta do rival sobe 1. E você ganha um trunfo.', icone: '☝️', cor: '#e6b800', peso: 7, mesa: true },
  mais2: { nome: 'Aposta +2', desc: 'Na mesa: a aposta do rival sobe 2. E você ganha um trunfo.', icone: '✌️', cor: '#f59e0b', peso: 3, mesa: true },
  escudo: { nome: 'Escudo', desc: 'Na mesa: a sua aposta desce 1.', icone: '🛡️', cor: '#4da6ff', peso: 6, mesa: true },
  escudo2: { nome: 'Escudo+', desc: 'Na mesa: a sua aposta desce 2.', icone: '🔰', cor: '#0066cc', peso: 2, mesa: true },
  meta17: { nome: 'Meta 17', desc: 'Na mesa: a meta vira 17 (vale a última meta posta).', icone: '17', cor: '#86efac', peso: 2, mesa: true },
  meta24: { nome: 'Meta 24', desc: 'Na mesa: a meta vira 24 (vale a última meta posta).', icone: '24', cor: '#aaaaff', peso: 2, mesa: true },
  meta27: { nome: 'Meta 27', desc: 'Na mesa: a meta vira 27 (vale a última meta posta).', icone: '27', cor: '#8f8fff', peso: 2, mesa: true },
  silencio: { nome: 'Silêncio', desc: 'Na mesa: o rival não pode pedir carta.', icone: '🤐', cor: '#94a3b8', peso: 2, mesa: true },
  colheita: { nome: 'Colheita', desc: 'Na mesa: cada trunfo que você usar depois te dá outro.', icone: '🌾', cor: '#84cc16', peso: 2, mesa: true },
};
export const trunfo21 = (c) => (typeof c === 'string' && c.startsWith('T:') ? c.slice(2) : null);
const DE_APOSTA = { mais1: 1, mais2: 2 };
const DE_ESCUDO = { escudo: 1, escudo2: 2 };

// O que está na mesa decide a rodada. mesa[k]: os trunfos que k pôs lá, cada um { c, n } (n: a ordem
// em que entrou, para saber qual meta vale).
export function aposta21(mesa, k, rodada) {
  const sobe = mesa[1 - k].reduce((s, t) => s + (DE_APOSTA[t.c] || 0), 0);
  const desce = mesa[k].reduce((s, t) => s + (DE_ESCUDO[t.c] || 0), 0);
  return Math.max(0, apostaBase21(rodada) + sobe - desce);
}
export function meta21(mesa) {
  let ultima = null;
  for (const t of [...mesa[0], ...mesa[1]]) if (/^meta\d+$/.test(t.c) && (!ultima || t.n > ultima.n)) ultima = t;
  return ultima ? Number(ultima.c.slice(4)) : META_21;
}
export const silenciado21 = (mesa, k) => mesa[1 - k].some((t) => t.c === 'silencio');

export function sortearTrunfo21(aleatorio = Math.random) {
  const lista = Object.entries(TRUNFOS_21);
  let r = aleatorio() * lista.reduce((s, [, t]) => s + t.peso, 0);
  for (const [k, t] of lista) {
    r -= t.peso;
    if (r < 0) return k;
  }
  return lista[0][0];
}
