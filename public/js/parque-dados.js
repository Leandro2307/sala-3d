// O Parque: o salão de jogos (pingue-pongue, sinuca, truco e uno), a queimada, o pinta-território,
// o minigolfe, o portal da gincana e o kartódromo, cada um onde o mapa da sala põe (mapas-dados.js).
// Só números, sem three.js: o servidor lê daqui onde fica cada mesa e cada quadra para conferir quem
// está jogando (lá este módulo é carregado uma vez por mapa, com ?mapa= no endereço).
import { MAPAS, parqueDe, mapaDoModulo } from './mapas-dados.js';

const MAPA = mapaDoModulo(import.meta.url);
const P = parqueDe(MAPA);

// Salão de jogos: um pavilhão aberto com telhado de vidro. Três colunas de mesas: pingue-pongue,
// sinuca e cartas, duas de cada.
export const { SALAO, MESAS_PINGUE, MESAS_SINUCA, MESAS_CARTAS } = P;

// Quadra de queimada: comp no eixo x (os dois campos, um de cada lado do meio), larg no z. O
// "cemitério" de cada time fica atrás da linha de fundo do outro.
export const { QUEIMADA } = P;

// Arena do pinta-território (quadrada, lado em metros)
export const { PINTA_ARENA } = P;

// Minigolfe: 9 buracos (golfe-dados.js põe cada buraco aqui dentro)
export const { GOLFE_AREA } = P;

// Portal da gincana (a pista fica no céu, em gincana-dados.js)
export const { PORTAL_GINCANA } = P;

// Kartódromo: o retângulo em volta do traçado (o traçado é do kart-dados.js)
export const KART_AREA = (() => {
  const k = P.KART;
  const c = Math.abs(Math.cos(k.giro || 0));
  const s = Math.abs(Math.sin(k.giro || 0));
  // o retângulo original (288 x 308) girado
  const w = 288 * c + 308 * s;
  const h = 288 * s + 308 * c;
  return { x0: k.x - w / 2, x1: k.x + w / 2, z0: k.z - h / 2, z1: k.z + h / 2 };
})();

// A praça do parque, as ruas dele e o pórtico na entrada: só do 3D (cidade de cada mapa)
const C = MAPAS[MAPA].cidade?.parque || {};
export const PARQUE = C.praca || { x: 0, z: 0, r: 0 };
export const RUAS_PARQUE = C.ruas || {};
export const PORTICO_PARQUE = C.portico || null;
export const PLACA_PARQUE = C.placa || null;
