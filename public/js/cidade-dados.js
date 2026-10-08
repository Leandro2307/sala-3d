// O mundo novo ("Praça central", ver mundo.js): tudo se organiza em volta de uma praça na porta do
// prédio. Da praça saem a rua do autódromo (até a arquibancada) e a avenida central, que sobe entre
// o estádio e o autódromo com uma rua para cada área: estádio, quadras, praça dos jogos, aventura
// (portais e chegada do surf) e, no fim, o lago. Só números, sem three.js: as mesas (tabuleiros.js,
// dados.js), os portais (ceu-dados.js), a natureza e o 3D da cidade (cidade.js) leem daqui.
//
// O prédio (cinema e escritório), o autódromo, o estádio, as quadras e a arena do céu ficam onde
// sempre estiveram, do mesmo tamanho: as quadras e a arena o servidor também confere, e ele é um só
// para as salas dos dois mundos. A avenida central passa no corredor entre o estádio e a pista
// (a ~22 m do eixo dela no ponto mais apertado, longe do guard-rail).
// Eixos: x para leste, z para norte (o estádio fica ao norte do prédio).

export const PRACA = { x: 100, z: 30, r: 30 };

// x da avenida central
const AV = 93;

// Ruas e avenidas: [[x, z], ...] e largura. A rua do autódromo termina na frente da arquibancada; o
// último trecho, até a beira da pista, quem calcula é cidade.js (depende do traçado).
export const RUAS = {
  alameda: { nome: 'Alameda do Prédio', pontos: [[62, 30], [PRACA.x - PRACA.r + 4, 30]], largura: 12 },
  leste: { nome: 'Rua do Autódromo', pontos: [[PRACA.x + PRACA.r - 4, 30], [146, 30], [146, 84]], largura: 12 },
  norte: { nome: 'Avenida Central', pontos: [[AV, PRACA.z + PRACA.r - 4], [AV, 400]], largura: 10 },
  estadio: { nome: 'Rua do Estádio', pontos: [[AV, 77], [40, 77]], largura: 8 },
  quadras: { nome: 'Rua das Quadras', pontos: [[AV, 215], [-30, 215]], largura: 8 },
  aventura: { nome: 'Rua da Aventura', pontos: [[AV, 350], [34, 350]], largura: 8 },
};

// Praça dos jogos: uma praça de pedra dos dois lados da avenida central, com as quatro mesas
export const PRACA_JOGOS = { x0: AV - 54, x1: AV + 54, z0: 245, z1: 325 };
export const MESAS_NOVO = {
  xadrez: { x: AV - 32, z: 267 },
  dama: { x: AV + 32, z: 267 },
  velha: { x: AV - 32, z: 304 },
  dados: { x: AV + 32, z: 302 },
};

// Aventura: os portais do surf e do mata-mata numa pracinha, ao lado de onde o surf termina
export const PRACA_AVENTURA = { x: 20, z: 350, r: 16 };
export const PORTAIS_NOVO = { surf: { x: 25, z: 343 }, matamata: { x: 25, z: 357 } };

// O lago no fim da avenida central, com um mirante na ponta da avenida
export const LAGO = { x: AV, z: 465, r: 40 };
export const MIRANTE = { x: AV, z: 408, r: 11 };

// Pórticos com o nome de cada área, por cima da rua (x, z, giro: de frente para quem vem da praça)
export const PORTICOS = [
  { nome: 'AUTÓDROMO', cor: '#6ee7c8', x: 146, z: 56, giro: Math.PI, vao: 12 },
  { nome: 'ESTÁDIO', cor: '#22d3ee', x: 84, z: 77, giro: Math.PI / 2, vao: 8 },
  { nome: 'QUADRAS', cor: '#facc15', x: 80, z: 215, giro: Math.PI / 2, vao: 8 },
  { nome: 'PRAÇA DOS JOGOS', cor: '#a78bfa', x: AV, z: 238, giro: Math.PI, vao: 14 },
  { nome: 'AVENTURA', cor: '#f472b6', x: 72, z: 350, giro: Math.PI / 2, vao: 8 },
];

// Placas nas saídas da praça: de frente para quem está dentro dela
export const PLACAS = [
  { x: PRACA.x + PRACA.r - 3, z: 21, giro: -Math.PI / 2, linhas: [['↑  AUTÓDROMO', '#6ee7c8']] },
  {
    x: AV + 10,
    z: PRACA.z + PRACA.r - 3,
    giro: Math.PI,
    linhas: [['↑  ESTÁDIO', '#22d3ee'], ['↑  QUADRAS', '#facc15'], ['↑  PRAÇA DOS JOGOS', '#a78bfa'], ['↑  AVENTURA', '#f472b6'], ['↑  LAGO', '#60a5fa']],
  },
  { x: PRACA.x - PRACA.r + 3, z: 39, giro: Math.PI / 2, linhas: [['↑  PRÉDIO', '#e2e8f0']] },
];

// Nomes no mapa "você está aqui" (onde escrever cada um)
export const NOMES_DO_MAPA = [
  ['AUTÓDROMO', 300, 250, '#6ee7c8', 30],
  ['JOGOS', AV, 285, '#ddd6fe', 24],
  ['LAGO', LAGO.x, LAGO.z, '#e0f2fe', 26],
];

// Onde a natureza pode fazer bosque dentro da cerca (fora daqui, gramado limpo e árvores em fileira).
// A natureza ainda tira o que fica perto da pista, das ruas, das reservas e do lago.
export const BOSQUES = [
  { x0: 150, x1: 480, z0: -40, z1: 530 }, // o autódromo, como no mundo de sempre
  { x0: 100, x1: 150, z0: 90, z1: 245 }, // entre a avenida central e a pista
  { x0: 100, x1: 150, z0: 330, z1: 420 },
  { x0: -52, x1: 36, z0: 230, z1: 335 }, // atrás das quadras
  { x0: -52, x1: 480, z0: 420, z1: 530 }, // o bosque do norte, em volta do lago
];
