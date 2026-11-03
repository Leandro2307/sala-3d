// Onde fica a catedral em cada mapa (mapa-<id>.js, atracoes.catedral: o centro da planta). Só
// números: o 3D (catedral.js), o mapa da tela e a escalada leem daqui. A grade da catedral tem
// 61 x 118 blocos de planta e 117 de altura (1 bloco = 1 m); a fachada das torres olha para o sul.
import { MAPA_INFO } from './cidade-dados.js';

const LARG = 61;
const COMP = 118;
const ALT = 117;
const c = MAPA_INFO.atracoes.catedral;

export const CATEDRAL = {
  cx: c.x,
  cz: c.z,
  larg: LARG,
  comp: COMP,
  alt: ALT,
  // o canto da grade (bloco 0, 0, 0)
  x0: Math.round(c.x - LARG / 2),
  z0: Math.round(c.z - COMP / 2),
};

// ------------------------------------------------------------------ a escalada
// Parkour por fora, no tema da catedral (madeira e pedra, nada de neon), do chão ao lado da nave até
// a ponta da torre oeste, a 102 m: andaimes até o telhado da nave lateral, um andaime em pé entre os
// contrafortes até a altura da cumeeira, mísulas de pedra subindo a face norte da torre até o terraço
// e vigas em espiral em volta da flecha, até a sacada do sino. Conferido bloco a bloco contra a grade
// (nada encosta na catedral e sobra 2,2 m de cabeça; vão de 0,9 a 2,6 m e subida de até 1,5 m).
// Em blocos: [tipo, x, yTopo, z, largura, profundidade]. L largada, A andaime, M mísula de pedra,
// V viga, C checkpoint, F chegada.
export const ESCALADA = [
  ['L', 6, 0.4, 27, 4, 4], ['A', 9.4, 1.6, 30.6, 2.6, 2.6], ['A', 12.2, 3, 33.8, 2.6, 2.6], ['A', 9.4, 4.4, 37, 2.6, 2.6],
  ['A', 12.2, 5.8, 40.2, 2.6, 2.6], ['A', 9.4, 7.2, 43.4, 2.6, 2.6], ['A', 5.8, 8.6, 41, 2.6, 2.6], ['A', 5.8, 10, 37.4, 2.6, 2.6],
  ['A', 5.8, 11.4, 33.8, 2.6, 2.6], ['A', 9, 12.8, 30.4, 2.6, 2.6], ['C', 9.6, 14.2, 26.4, 2.6, 2.6], ['A', 12.4, 15.7, 29.8, 2.2, 2.2],
  ['A', 12.4, 17.2, 26.2, 2.2, 2.2], ['A', 8.4, 18.7, 29.8, 2.2, 2.2], ['A', 12.4, 20.2, 29.8, 2.2, 2.2], ['A', 12.4, 21.6, 26.2, 2.2, 2.2],
  ['A', 16.4, 23, 28.4, 2.2, 2.2], ['A', 21, 24.4, 27.4, 2.2, 2.2], ['A', 21, 25.8, 31, 2.2, 2.2], ['A', 17.2, 27.2, 31, 2.2, 2.2],
  ['A', 17.2, 28.6, 27.4, 2.2, 2.2], ['A', 21, 30, 27.4, 2.2, 2.2], ['A', 21, 31.4, 31, 2.2, 2.2], ['A', 17.2, 32.8, 31, 2.2, 2.2],
  ['A', 17.2, 34.2, 27.4, 2.2, 2.2], ['A', 21, 35.6, 27.4, 2.2, 2.2], ['A', 21, 37, 31, 2.2, 2.2], ['A', 17.2, 38.4, 31, 2.2, 2.2],
  ['A', 17.2, 39.8, 27.4, 2.2, 2.2], ['A', 21, 41.2, 27.4, 2.2, 2.2], ['C', 19, 42.8, 29.6, 2.8, 2.8], ['M', 15.4, 44.2, 26, 2.2, 2.2],
  ['M', 15.7, 45.6, 23.1, 2.2, 2.2], ['M', 19.2, 47, 22.6, 2.2, 2.2], ['M', 23, 48.4, 22.6, 2.2, 2.2], ['M', 23, 49.8, 26, 2.2, 2.2],
  ['M', 19.2, 51.2, 26, 2.2, 2.2], ['M', 15.4, 52.6, 26, 2.2, 2.2], ['M', 15.4, 54, 22.6, 2.2, 2.2], ['M', 19.2, 55.4, 22.6, 2.2, 2.2],
  ['M', 23, 56.8, 22.6, 2.2, 2.2], ['M', 23, 58.2, 26, 2.2, 2.2], ['M', 19.2, 59.6, 26, 2.2, 2.2], ['C', 19.5, 60.8, 23, 2.8, 2.8],
  ['V', 22.8, 62.1, 24, 2, 2], ['V', 25.4, 63.4, 25.7, 2, 2], ['V', 25.3, 64.7, 22, 2, 2], ['V', 28.2, 66, 22.8, 2, 2],
  ['V', 26.7, 67.3, 19.2, 2, 2], ['V', 29.7, 68.6, 19.3, 2, 2], ['V', 27.2, 69.9, 16.5, 2, 2], ['V', 30.2, 71.2, 15.9, 2, 2],
  ['V', 27, 72.5, 14, 2, 2], ['V', 29.7, 73.8, 12.7, 2, 2], ['V', 26.1, 75.1, 12, 2, 2], ['V', 28.3, 76.4, 10, 2, 2],
  ['V', 25.1, 77.7, 10.2, 2, 2], ['V', 26.7, 79, 7.7, 2, 2], ['V', 23.4, 80.3, 9.3, 1.8, 1.8], ['C', 24.4, 81.6, 6.2, 2.8, 2.8],
  ['V', 21.6, 82.9, 9, 1.8, 1.8], ['V', 21.7, 84.2, 6.1, 1.8, 1.8], ['V', 20.1, 85.5, 9.3, 1.8, 1.8], ['V', 19.4, 86.8, 6.5, 1.8, 1.8],
  ['V', 18, 88.1, 4.1, 1.8, 1.8], ['V', 17.7, 89.4, 7.8, 1.8, 1.8], ['V', 15.7, 90.7, 5.9, 1.8, 1.8], ['V', 16.6, 92, 9.4, 1.8, 1.8],
  ['V', 14.2, 93.3, 7.9, 1.8, 1.8], ['V', 11.4, 94.6, 7.2, 1.8, 1.8], ['V', 13.4, 95.9, 10.1, 1.8, 1.8], ['V', 16.2, 97.2, 12.3, 1.8, 1.8],
  ['V', 13.4, 98.5, 12.2, 1.8, 1.8], ['V', 10.8, 99.8, 13, 1.8, 1.8], ['V', 14.3, 101.1, 14, 1.8, 1.8], ['F', 17.4, 102.4, 15.7, 3, 3],
];
// a plaquinha "descer" ao lado da chegada (leva de volta à largada)
export const DESCER = [15, 102.4, 15.7, 1.8, 1.8];
export const CHECKPOINTS_ESCALADA = ESCALADA.filter((p) => p[0] === 'C').length;
