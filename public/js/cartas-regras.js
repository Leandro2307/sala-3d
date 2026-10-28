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
// a mão vale 1; truco vale 3, depois seis, nove e doze (a mão de onze é a de dez do mineiro)
export const PASSOS_TRUCO = [1, 3, 6, 9, 12];
export const NOME_PEDIDO = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };
export const VALE_DEZ = 3; // a mão de onze vale 3; quem corre dela dá 1

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
  dez: ['Vamo jogar, uai!', 'Bora pra mão de onze!', 'Mão de onze, desce!'],
  dezCorro: ['Essa eu corro.', 'Mão de onze não, sô.'],
  // o robô que levou um tapa ou um tiro na mesa (de brincadeira)
  apanhou: ['Ai! Isso não vale!', 'Tá nervoso, é?', 'Bate, mas o truco é meu!', 'Vou contar pro juiz!', 'Ô trem doído, sô!'],
  baleado: ['Fui atingido!', 'Ai, meu zap!', 'Isso é jogo de truco, sô!', 'Volto pra assombrar!', 'Errou! Quer dizer... acertou.'],
  // o robô que levou um arremesso na mesa (tomate, galinha...)
  sujou: ['Tô todo melado!', 'Quem joga comida, sô?!', 'Ai, minha roupa nova!', 'Isso é falta de respeito!', 'Vou chamar a limpeza!', 'Lavar não adianta, a vergonha fica!'],
  // o 21: pedir, parar, ganhar a rodada e perder a mão
  pede21: ['Manda carta!', 'Mais uma!', 'Vem, carta!', 'Bora, mais uma!'],
  para21: ['Parei.', 'Tô bem assim.', 'Fico aqui.', 'Chega pra mim.'],
  ganhou21: ['Passa os dedos!', 'Contei as cartas, sô!', 'Essa foi fácil!', 'Mais um dedo pra coleção!'],
  // o uno: quem disse UNO, quem comprou e passou, quem esqueceu e quem pegou alguém que esqueceu
  uno: ['Uno!'],
  unocompra: ['Comprou e passou!'],
  unoesqueceu: ['Ah, esqueci o UNO!'],
  pegouno: ['Não falou UNO!'],
  // a cacheta: bater (com 9 e com 10), pegar do lixo, ficar a uma carta de bater e quebrar (sair)
  bateu: ['Bati!', 'Batida!', 'Bati, cambada!', 'Acabou, bati!', 'Cacheta, uai!'],
  bateu10: ['Bati de dez!', 'De dez, sô! Perde dois!', 'Batida de dez!'],
  lixo: ['Essa eu quero!', 'Vem pro papai!', 'Brigado pelo presente!', 'Esse lixo é meu!'],
  naboa: ['Tô na boa!', 'Tô pifado!', 'Tô de boa, hein!'],
  quebrou: ['Quebrei!', 'Tô fora dessa, sô.', 'Fui de arrasta!'],
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
export const GRITO_DO_PEDIDO = { 3: 'truco', 6: 'seis', 9: 'nove', 12: 'doze' };

// Os sinais do truco: o cochicho que só o parceiro ouve ('ct-sinal' vai só para o lugar (k+2)%4).
// As primeiras frases mostram a carta que você tem (a mini carta vai no balão); o robô parceiro
// avisa uma carta que realmente está na mão dele. bom: a frase combina com mão boa (true) ou ruim
// (false) — o robô escolhe a que combina com a dele quando não avisa carta.
export const SINAIS = [
  { f: 'Tenho o Zap!', carta: '4p', bom: true },
  { f: 'Tenho a Copas!', carta: '7c', bom: true },
  { f: 'Tenho a Espadilha!', carta: 'Ae', bom: true },
  { f: 'Tenho o Pica-fumo!', carta: '7o', bom: true },
  { f: 'Tenho o 3!', carta: '3p', bom: true },
  { f: 'Tenho o 2!', carta: '2c', bom: true },
  { f: 'Tenho o ás!', carta: 'Ap', bom: true },
  { f: 'Tô carregado, sô!', bom: true },
  { f: 'Pede truco!', bom: true },
  { f: 'Aumenta que eu cubro!', bom: true },
  { f: 'Cai dentro que eu seguro!', bom: true },
  { f: 'Tô fraquinho...', bom: false }, { f: 'Não truca não!', bom: false },
  { f: 'Se trucarem, a gente corre!', bom: false }, { f: 'Só vim com lixo', bom: false },
  { f: 'Cobre ela pra mim!', bom: null }, { f: 'Dribla essa rodada!', bom: null },
  { f: 'Vou de coberta, hein?', bom: null }, { f: 'Segura a próxima!', bom: null },
];

// As coisas que dá para jogar em quem está na mesa ('ct-arremesso'), de brincadeira. texto: o barulho
// do acerto no balão; um: como aparece no aviso de quem levou ("Fulano jogou um ovo em você!").
export const ARREMESSOS = {
  tomate: { nome: 'Tomate', emoji: '🍅', texto: 'SPLAT!', um: 'um tomate' },
  galinha: { nome: 'Galinha', emoji: '🐔', texto: 'COCORICÓ!', um: 'uma galinha' },
  ovo: { nome: 'Ovo', emoji: '🥚', texto: 'PLOC!', um: 'um ovo' },
  torta: { nome: 'Torta', emoji: '🥧', texto: 'PÁ!', um: 'uma torta' },
  chinelo: { nome: 'Chinelo', emoji: '🩴', texto: 'CHAP!', um: 'um chinelo' },
  peixe: { nome: 'Peixe', emoji: '🐟', texto: 'FLAP!', um: 'um peixe' },
  agua: { nome: 'Balão d’água', emoji: '💦', texto: 'SPLASH!', um: 'um balão d’água' },
  coco: { nome: 'Coco', emoji: '🥥', texto: 'TUM!', um: 'um coco' },
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
// o que quem jogou fala em voz alta: o efeito em prosa, o número com a cor ('7 azul')
const FALA_UNO = { B: 'Pula!', I: 'Volta!', P2: 'Mais dois!', W: 'Coringa!', W4: 'Mais quatro!' };
export const falaUno = (c) => FALA_UNO[simboloUno(c)] ?? `${simboloUno(c)} ${NOME_COR[corUno(c)]}`;

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
// destruir); os outros fazem efeito na hora. peso: a chance no sorteio. unico: ninguém tem dois (o
// segundo não faria nada): o sorteio pula o que a pessoa já tem na mão ou na mesa. Os outros somam.
export const TRUNFOS_21 = {
  c2: { nome: 'Carta 2', desc: 'Compra o 2, se ele ainda estiver no baralho.', icone: '2', cor: '#9ae6b4', peso: 4, unico: true },
  c3: { nome: 'Carta 3', desc: 'Compra o 3, se ele ainda estiver no baralho.', icone: '3', cor: '#9ae6b4', peso: 4, unico: true },
  c4: { nome: 'Carta 4', desc: 'Compra o 4, se ele ainda estiver no baralho.', icone: '4', cor: '#9ae6b4', peso: 4, unico: true },
  c5: { nome: 'Carta 5', desc: 'Compra o 5, se ele ainda estiver no baralho.', icone: '5', cor: '#9ae6b4', peso: 4, unico: true },
  c6: { nome: 'Carta 6', desc: 'Compra o 6, se ele ainda estiver no baralho.', icone: '6', cor: '#9ae6b4', peso: 4, unico: true },
  c7: { nome: 'Carta 7', desc: 'Compra o 7, se ele ainda estiver no baralho.', icone: '7', cor: '#9ae6b4', peso: 4, unico: true },
  baixa: { nome: 'Carta Baixa', desc: 'Compra a menor carta do baralho.', icone: '🪶', cor: '#5eead4', peso: 3 },
  devolver: { nome: 'Devolver', desc: 'Sua última carta aberta volta para o baralho.', icone: '↩️', cor: '#ff9966', peso: 6 },
  remover: { nome: 'Remover', desc: 'A última carta aberta do rival volta para o baralho.', icone: '🫳', cor: '#ff7a59', peso: 5 },
  troca: { nome: 'Troca', desc: 'Troca a sua última carta aberta com a do rival.', icone: '🔁', cor: '#ff6600', peso: 4 },
  perfeita: { nome: 'Compra Perfeita', desc: 'Compra a maior carta do baralho que não passa da meta.', icone: '✨', cor: '#cc66ff', peso: 2 },
  presente: { nome: 'Presente de Grego', desc: 'O rival compra a maior carta que ainda está no baralho.', icone: '🎁', cor: '#ff4da6', peso: 3 },
  espiar: { nome: 'Espiar', desc: 'Você vê a próxima carta do baralho (só você), até ela sair de cima.', icone: '👀', cor: '#38bdf8', peso: 4 },
  queimar: { nome: 'Queimar', desc: 'A carta de cima do baralho vira para todos e sai da rodada.', icone: '🔥', cor: '#f97316', peso: 3 },
  raiox: { nome: 'Raio-X', desc: 'Você vê a carta fechada do rival nesta rodada.', icone: '👁️', cor: '#73ffcc', peso: 3, unico: true },
  trocaTrunfos: { nome: 'Troca de Trunfos', desc: 'Descarta 2 trunfos seus (sorteados) e ganha 3 novos.', icone: '🔀', cor: '#facc15', peso: 3 },
  feliz: { nome: 'Felicidade', desc: 'Você e o rival ganham um trunfo cada.', icone: '😊', cor: '#fde68a', peso: 2 },
  furto: { nome: 'Furto', desc: 'Pega um trunfo sorteado da mão do rival.', icone: '🥷', cor: '#fb7185', peso: 3 },
  curativo: { nome: 'Curativo', desc: `Recupera 1 dedo (até ${DEDOS_21}).`, icone: '🩹', cor: '#fca5a5', peso: 1 },
  destruir: { nome: 'Destruir', desc: 'Tira da mesa o último trunfo que o rival pôs lá.', icone: '💥', cor: '#ff3333', peso: 5 },
  destruirTudo: { nome: 'Destruir+', desc: 'Tira da mesa todos os trunfos do rival.', icone: '☢️', cor: '#cc0000', peso: 2 },
  roubar: { nome: 'Roubar', desc: 'O último trunfo da mesa do rival passa para a sua mesa.', icone: '🧲', cor: '#e879f9', peso: 3 },
  mais1: { nome: 'Aposta +1', desc: 'Na mesa: a aposta do rival sobe 1. E você ganha um trunfo.', icone: '☝️', cor: '#e6b800', peso: 7, mesa: true },
  mais2: { nome: 'Aposta +2', desc: 'Na mesa: a aposta do rival sobe 2. E você ganha um trunfo.', icone: '✌️', cor: '#f59e0b', peso: 3, mesa: true },
  tudo: { nome: 'Tudo ou Nada', desc: 'Na mesa: a aposta dos dois dobra nesta rodada.', icone: '🎲', cor: '#fbbf24', peso: 2, mesa: true, unico: true },
  escudo: { nome: 'Escudo', desc: 'Na mesa: a sua aposta desce 1.', icone: '🛡️', cor: '#4da6ff', peso: 6, mesa: true },
  escudo2: { nome: 'Escudo+', desc: 'Na mesa: a sua aposta desce 2.', icone: '🔰', cor: '#0066cc', peso: 2, mesa: true },
  meta17: { nome: 'Meta 17', desc: 'Na mesa: a meta vira 17 (vale a última meta posta).', icone: '17', cor: '#86efac', peso: 2, mesa: true, unico: true },
  meta21: { nome: 'Meta 21', desc: 'Na mesa: a meta volta a ser 21 (vale a última meta posta).', icone: '21', cor: '#c4b5fd', peso: 2, mesa: true, unico: true },
  meta24: { nome: 'Meta 24', desc: 'Na mesa: a meta vira 24 (vale a última meta posta).', icone: '24', cor: '#aaaaff', peso: 2, mesa: true, unico: true },
  meta27: { nome: 'Meta 27', desc: 'Na mesa: a meta vira 27 (vale a última meta posta).', icone: '27', cor: '#8f8fff', peso: 2, mesa: true, unico: true },
  silencio: { nome: 'Silêncio', desc: 'Na mesa: o rival não pode pedir carta.', icone: '🤐', cor: '#94a3b8', peso: 2, mesa: true, unico: true },
  cadeado: { nome: 'Cadeado', desc: 'Na mesa: o rival só pode usar Destruir.', icone: '🔒', cor: '#a3a3a3', peso: 1, mesa: true, unico: true },
  neblina: { nome: 'Neblina', desc: 'Na mesa: o rival não vê as suas cartas abertas, só quantas são.', icone: '🌁', cor: '#cbd5e1', peso: 2, mesa: true, unico: true },
  colheita: { nome: 'Colheita', desc: 'Na mesa: cada trunfo que você usar depois te dá outro.', icone: '🌾', cor: '#84cc16', peso: 2, mesa: true, unico: true },
};
export const trunfo21 = (c) => (typeof c === 'string' && c.startsWith('T:') ? c.slice(2) : null);
const DE_APOSTA = { mais1: 1, mais2: 2 };
const DE_ESCUDO = { escudo: 1, escudo2: 2 };
// com o Cadeado do rival na mesa, só estes passam
export const LIVRES_CADEADO_21 = ['destruir', 'destruirTudo'];

// O que está na mesa decide a rodada. mesa[k]: os trunfos que k pôs lá, cada um { c, n } (n: a ordem
// em que entrou, para saber qual meta vale).
export const dobrado21 = (mesa) => [...mesa[0], ...mesa[1]].some((t) => t.c === 'tudo');
export function aposta21(mesa, k, rodada) {
  const sobe = mesa[1 - k].reduce((s, t) => s + (DE_APOSTA[t.c] || 0), 0);
  const desce = mesa[k].reduce((s, t) => s + (DE_ESCUDO[t.c] || 0), 0);
  return Math.max(0, apostaBase21(rodada) + sobe - desce) * (dobrado21(mesa) ? 2 : 1);
}
export function meta21(mesa) {
  let ultima = null;
  for (const t of [...mesa[0], ...mesa[1]]) if (/^meta\d+$/.test(t.c) && (!ultima || t.n > ultima.n)) ultima = t;
  return ultima ? Number(ultima.c.slice(4)) : META_21;
}
export const silenciado21 = (mesa, k) => mesa[1 - k].some((t) => t.c === 'silencio');
export const trancado21 = (mesa, k) => mesa[1 - k].some((t) => t.c === 'cadeado');
// a Neblina na mesa de k: as cartas abertas de k só ele vê
export const nublado21 = (mesa, k) => mesa[k].some((t) => t.c === 'neblina');

// tenho: os trunfos que a pessoa já tem (na mão e na mesa); um único que já está lá não vem de novo
export function sortearTrunfo21(aleatorio = Math.random, tenho = []) {
  const lista = Object.entries(TRUNFOS_21).filter(([k, t]) => !(t.unico && tenho.includes(k)));
  let r = aleatorio() * lista.reduce((s, [, t]) => s + t.peso, 0);
  for (const [k, t] of lista) {
    r -= t.peso;
    if (r < 0) return k;
  }
  return lista[0][0];
}

// ------------------------------------------------------------------ cacheta
// Dois baralhos de 52, sem os coringas de verdade (104 cartas). Cada um recebe 9; depois vira-se
// uma carta (o vira) e o curinga da mão é o valor seguinte ao dele, na mesma cor (vira 8♣: os 9
// pretos; depois do K vem o A). Na vez: compra do monte ou pega a de cima do lixo e descarta. Bate
// quem fecha a mão em jogos: trinca (o mesmo valor, de 3 naipes diferentes; a 4ª e a 5ª podem
// repetir naipe, são dois baralhos) ou sequência (o mesmo naipe, A-2-3 até Q-K-A, sem dar a volta).
// No máximo um curinga fazendo papel de outra carta em cada jogo. Bater com 9 (descarta a 10ª):
// cada um dos outros perde 1 ponto; com as 10 (sem descartar): perdem 2. Sem pontos, sai da partida;
// o último que sobra ganha. Carta: valor + naipe + o baralho dela ('7o0', '10e1', 'Kp0').
export const VALORES_CACHETA = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const CARTAS_CACHETA = 9;
export const PONTOS_CACHETA = 5; // a de boteco começa com 7 ou 10; com 5 a partida não passa de meia hora
const RE_CACHETA = /^(10|[A2-9JQK])([oecp])([01])$/;
export const ehCartaCacheta = (c) => typeof c === 'string' && RE_CACHETA.test(c);
// v: 1 (ás) a 13 (rei); n: o naipe
export function lerCacheta(c) {
  const m = RE_CACHETA.exec(c);
  return m ? { v: VALORES_CACHETA.indexOf(m[1]) + 1, n: m[2] } : null;
}
// a carta sem o baralho: as duas cópias são a mesma carta ('7o0' e '7o1' são o 7♦)
export const faceCacheta = (c) => c.slice(0, -1);

export function baralhoCacheta() {
  const b = [];
  for (const d of [0, 1]) for (const v of VALORES_CACHETA) for (const n of NAIPES) b.push(`${v}${n}${d}`);
  return b;
}

export function curingaDe(vira) {
  const l = lerCacheta(vira);
  return l ? { v: (l.v % 13) + 1, vermelho: naipeVermelho(l.n) } : null;
}
export function ehCuringa(c, cur) {
  const l = cur && lerCacheta(c);
  return !!l && l.v === cur.v && naipeVermelho(l.n) === cur.vermelho;
}
// "os 9 pretos", "as damas vermelhas"
const PLURAL_CACHETA = { 1: ['ases', 'os'], 11: ['valetes', 'os'], 12: ['damas', 'as'], 13: ['reis', 'os'] };
export function nomeCuringa(cur) {
  if (!cur) return '';
  const [nome, art] = PLURAL_CACHETA[cur.v] || [VALORES_CACHETA[cur.v - 1], 'os'];
  const cor = cur.vermelho ? 'vermelho' : 'preto';
  return `${art} ${nome} ${art === 'as' ? `${cor.slice(0, -1)}as` : `${cor}s`}`;
}
// '7♦', '10♠'
export const nomeCartaCacheta = (c) => {
  const l = lerCacheta(c);
  return l ? `${VALORES_CACHETA[l.v - 1]}${SIMBOLO[l.n]}` : '';
};

// Todos os jogos que dá para montar com estas cartas, por máscara (bit i = a carta i). ordem: as
// cartas na ordem de mostrar (a sequência na ordem dela, com o curinga no buraco que ele tapa).
function jogosPossiveis(cartas, cur) {
  const info = cartas.map((c) => ({ ...lerCacheta(c), curinga: ehCuringa(c, cur) }));
  const jogos = new Map();
  const por = (ordem) => {
    const mask = ordem.reduce((a, i) => a | (1 << i), 0);
    if (!jogos.has(mask)) jogos.set(mask, { mask, ordem });
  };
  const curingas = info.map((x, i) => (x.curinga ? i : -1)).filter((i) => i >= 0);
  // trincas: o mesmo valor, de pelo menos 3 naipes (o curinga conta como um naipe que falta)
  for (let v = 1; v <= 13; v++) {
    const nat = info.map((x, i) => (x.v === v ? i : -1)).filter((i) => i >= 0);
    if (nat.length < 2) continue;
    for (let s = 1; s < 1 << nat.length; s++) {
      const idx = nat.filter((_, j) => s & (1 << j)).sort((a, b) => NAIPES.indexOf(info[a].n) - NAIPES.indexOf(info[b].n));
      const naipes = new Set(idx.map((i) => info[i].n)).size;
      if (idx.length >= 3 && naipes >= 3) por(idx);
      if (idx.length >= 2 && naipes >= 2) for (const w of curingas) if (!idx.includes(w)) por([...idx, w]);
    }
  }
  // sequências: o mesmo naipe, do A (1) ao A de cima (14); cada posição com uma carta daquele valor
  // e naipe, ou com o curinga (um só)
  for (const n of NAIPES) {
    if (!info.some((x) => x.n === n)) continue;
    const de = (p) => info.map((x, i) => (x.n === n && x.v === (p === 14 ? 1 : p) ? i : -1)).filter((i) => i >= 0);
    for (let ini = 1; ini <= 12; ini++) {
      const passo = (p, usadas, curingaUsado) => {
        if (usadas.length >= 3) por([...usadas]);
        if (p > 14 || usadas.length >= cartas.length) return;
        for (const i of de(p)) if (!usadas.includes(i)) passo(p + 1, [...usadas, i], curingaUsado);
        if (!curingaUsado) for (const w of curingas) if (!usadas.includes(w)) passo(p + 1, [...usadas, w], true);
      };
      passo(ini, [], false);
    }
  }
  return [...jogos.values()];
}

const bits = (m) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};

// A melhor arrumação da mão: o máximo de cartas em jogos. grupos: as cartas de cada jogo, na ordem
// de mostrar; soltas: as que sobram.
export function arranjoCacheta(cartas, cur) {
  const n = cartas.length;
  if (!n) return { grupos: [], soltas: [] };
  const jogos = jogosPossiveis(cartas, cur);
  const memo = new Map();
  const melhor = (mask) => {
    if (!mask) return { cob: 0, g: [] };
    if (memo.has(mask)) return memo.get(mask);
    const bit = mask & -mask;
    let r = melhor(mask & ~bit); // a carta mais baixa fica de fora
    for (const j of jogos) {
      if (!(j.mask & bit) || (j.mask & mask) !== j.mask) continue;
      const resto = melhor(mask & ~j.mask);
      const cob = resto.cob + bits(j.mask);
      if (cob > r.cob) r = { cob, g: [j, ...resto.g] };
    }
    memo.set(mask, r);
    return r;
  };
  const r = melhor((1 << n) - 1);
  const usadas = r.g.reduce((a, j) => a | j.mask, 0);
  return { grupos: r.g.map((j) => j.ordem.map((i) => cartas[i])), soltas: cartas.filter((_, i) => !(usadas & (1 << i))) };
}

// a mão fecha toda em jogos? devolve os jogos, ou null
export function bateCacheta(cartas, cur) {
  if (cartas.length < 3) return null;
  const a = arranjoCacheta(cartas, cur);
  return a.soltas.length ? null : a.grupos;
}

// Com as 10 cartas na mão (depois de comprar): dez: os jogos de bater com as 10, ou null;
// descartes: as cartas que, descartadas, deixam as outras 9 fechadas (bater com 9)
export function comoBaterCacheta(mao, cur) {
  const dez = mao.length === CARTAS_CACHETA + 1 ? bateCacheta(mao, cur) : null;
  const descartes = [];
  const vistas = new Set();
  for (const c of mao) {
    if (vistas.has(faceCacheta(c))) {
      if (descartes.some((d) => faceCacheta(d) === faceCacheta(c))) descartes.push(c);
      continue;
    }
    vistas.add(faceCacheta(c));
    const resto = [...mao];
    resto.splice(resto.indexOf(c), 1);
    if (bateCacheta(resto, cur)) descartes.push(c);
  }
  return { dez, descartes };
}

// ------------------------------------------------------------------ as vozes
// Tudo o que a mesa fala em voz alta sai de um mp3 gravado (ElevenLabs, scripts/gerar-vozes-cartas.js),
// não da voz do navegador: no celular (iOS/Android) o mp3 toca fora do toque e igual em todo aparelho.
// Cada lugar tem a sua voz, como os robôs: 0 e 2 homens (Zé, Tião), 1 e 3 mulheres (Lia, Bia); no uno
// de 6 o Nico (4) fala com a voz do Zé e a Rita (5) com a da Lia.
export const VOZES_CARTAS = 4;

// as mulheres da mesa falam no feminino ("Tô armada!", "Fui atingida!"): na voz e no balão
export const vozFeminina = (lugar) => Math.abs(Number(lugar) || 0) % 2 === 1;
const NO_FEMININO = [[/\barmado\b/g, 'armada'], [/\batingido\b/g, 'atingida'], [/\btodo melado\b/g, 'toda melada'], [/\btem dono\b/g, 'tem dona'],
  [/\bpro papai\b/g, 'pra mamãe'], [/\bpifado\b/g, 'pifada'], [/\bBrigado\b/g, 'Brigada']];
export const naVozDe = (frase, lugar) => (vozFeminina(lugar) ? NO_FEMININO.reduce((f, [de, para]) => f.replace(de, para), frase) : frase);

// o arquivo da frase na voz do lugar; o mesmo nome no servidor, no navegador e no gerador
export function arquivoVoz(frase, lugar) {
  const voz = Math.abs(Number(lugar) || 0) % VOZES_CARTAS;
  let h = 0x811c9dc5; // FNV-1a: síncrono e igual em qualquer lugar (o crypto.subtle não existe em http)
  for (const ch of `${voz}:${frase}`) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return `/audio/cartas/${voz}-${h.toString(16).padStart(8, '0')}.mp3`;
}

// todas as frases que a voz do lugar fala: os gritos, a zoeira, os trunfos do 21 e as cartas do uno
export function frasesFaladas(lugar) {
  // o 21 só tem os lugares 0 e 1: as outras vozes não falam os gritos (pede21...) nem os trunfos dele
  const do21 = Math.abs(Number(lugar) || 0) % VOZES_CARTAS < 2;
  const gritos = Object.entries(GRITOS).filter(([tipo]) => do21 || !tipo.endsWith('21')).flatMap(([, f]) => f);
  const frases = new Set([...gritos, ...ZOEIRA]);
  if (do21) for (const t of Object.values(TRUNFOS_21)) frases.add(`${t.nome}!`);
  for (const c of baralhoUno()) frases.add(falaUno(c));
  return [...new Set([...frases].map((f) => naVozDe(f, lugar)))];
}
