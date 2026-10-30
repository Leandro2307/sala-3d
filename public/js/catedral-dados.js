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
