// O mundo novo ("Praça central", ver mundo.js): tudo se organiza em volta de uma praça na porta do
// prédio. Da praça saem uma alameda até a porta, a avenida leste até o autódromo e a avenida norte,
// com uma rua para cada área: estádio, quadras, praça dos jogos, aventura (portais e chegada do
// surf) e, no fim, o lago. Só números, sem three.js: a pista (pista.js), as mesas (tabuleiros.js,
// dados.js), os portais (ceu-dados.js), a natureza e o 3D da cidade (cidade.js) leem daqui.
//
// O prédio (cinema e escritório), o estádio, as quadras e a arena do céu ficam onde sempre
// estiveram: as quadras e a arena o servidor também confere, e ele é um só para as salas dos dois
// mundos. Eixos: x para leste, z para norte (o estádio fica ao norte do prédio).

export const PRACA = { x: 140, z: 30, r: 38 };

// Ruas e avenidas: [[x, z], ...] e largura. A avenida leste termina perto da arquibancada; o último
// trecho, até a beira da pista, quem calcula é cidade.js (depende do traçado).
export const RUAS = {
  alameda: { nome: 'Alameda do Prédio', pontos: [[62, 30], [PRACA.x - PRACA.r + 4, 30]], largura: 12 },
  leste: { nome: 'Avenida do Autódromo', pontos: [[PRACA.x + PRACA.r - 4, 30], [290, 30]], largura: 12 },
  norte: { nome: 'Avenida Central', pontos: [[140, PRACA.z + PRACA.r - 4], [140, 400]], largura: 12 },
  estadio: { nome: 'Rua do Estádio', pontos: [[136, 77], [40, 77]], largura: 8 },
  quadras: { nome: 'Rua das Quadras', pontos: [[136, 215], [-30, 215]], largura: 8 },
  aventura: { nome: 'Rua da Aventura', pontos: [[136, 350], [34, 350]], largura: 8 },
};

// Praça dos jogos: uma praça de pedra dos dois lados da avenida central, com as quatro mesas
export const PRACA_JOGOS = { x0: 86, x1: 194, z0: 248, z1: 328 };
export const MESAS_NOVO = {
  xadrez: { x: 106, z: 270 },
  dama: { x: 174, z: 270 },
  velha: { x: 106, z: 307 },
  dados: { x: 174, z: 305 },
};

// Aventura: os portais do surf e do mata-mata numa pracinha, ao lado de onde o surf termina
export const PRACA_AVENTURA = { x: 20, z: 350, r: 16 };
export const PORTAIS_NOVO = { surf: { x: 25, z: 343 }, matamata: { x: 25, z: 357 } };

// O lago no fim da avenida central, com um mirante na ponta da avenida
export const LAGO = { x: 140, z: 462, r: 40 };
export const MIRANTE = { x: 140, z: 404, r: 11 };

// Pórticos com o nome de cada área, por cima da rua (x, z, giro: de frente para quem vem da praça)
export const PORTICOS = [
  { nome: 'AUTÓDROMO', cor: '#6ee7c8', x: 232, z: 30, giro: -Math.PI / 2, vao: 16 },
  { nome: 'ESTÁDIO', cor: '#22d3ee', x: 118, z: 77, giro: Math.PI / 2, vao: 12 },
  { nome: 'QUADRAS', cor: '#facc15', x: 118, z: 215, giro: Math.PI / 2, vao: 12 },
  { nome: 'PRAÇA DOS JOGOS', cor: '#a78bfa', x: 140, z: 240, giro: Math.PI, vao: 16 },
  { nome: 'AVENTURA', cor: '#f472b6', x: 118, z: 350, giro: Math.PI / 2, vao: 12 },
];

// Onde a natureza pode fazer bosque dentro da cerca (fora daqui, gramado limpo e árvores em fileira)
export const BOSQUES = [
  { x0: 162, x1: 228, z0: 92, z1: 330 }, // entre a avenida central e o autódromo
  { x0: 88, x1: 126, z0: 92, z1: 200 }, // entre o estádio e a avenida
  { x0: -52, x1: 70, z0: 232, z1: 326 }, // atrás das quadras
  { x0: -52, x1: 480, z0: 420, z1: 530 }, // o bosque do norte, em volta do lago
  { x0: 238, x1: 480, z0: 330, z1: 530 }, // atrás do autódromo
  { x0: 70, x1: 236, z0: -40, z1: -14 }, // atrás da praça
];
