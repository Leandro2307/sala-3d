// Os mapas da sala. Cada um é um mundo próprio: as atrações em outros lugares, outro caminho entre
// elas e outra paisagem (o tema: cores, árvores, água, ruas, praças). O dono da sala escolhe
// (config.mapa, ver server.js); a página monta o mapa da sala e recarrega se ele mudar.
//
// Só números, sem three.js: os módulos de dados e de física dos jogos (quadras-fisica.js,
// parque-dados.js, kart-dados.js...) calculam onde fica cada coisa a partir daqui. No navegador vale
// o mapa da página; no servidor cada módulo é carregado uma vez por mapa, com ?mapa=<id> no endereço
// (mapaDoModulo), e cada sala usa o do mapa dela.
//
// As atrações se movem inteiras: o desenho de cada uma (as medidas, a física) é o de sempre, só o
// centro muda (e o giro, nas que podem girar). Eixos: x e z no chão. No 3D quem olha para +z tem o
// +x à esquerda (three.js); nos comentários, "norte" é +z e "leste" é +x.
import { TROPICAL } from './mapa-tropical.js';
import { NEVE } from './mapa-neve.js';
import { OUTONO } from './mapa-outono.js';

export const MAPAS = { tropical: TROPICAL, neve: NEVE, outono: OUTONO };
export const IDS_MAPAS = Object.keys(MAPAS);
export const MAPA_PADRAO = 'tropical';

// O centro de cada atração no desenho original: o deslocamento de um mapa é o centro dele menos este
export const CENTRO_ORIGINAL = {
  quadras: { x: 24.5, z: 196 },
  salao: { x: 20, z: 649 },
  queimada: { x: 75, z: 616 },
  pinta: { x: 133, z: 637 },
  golfe: { x: -27, z: 587 },
  kart: { x: 326.5, z: 705.5 },
};

// quanto mover uma atração neste mapa: { dx, dz }
export function deslocamento(mapa, atracao) {
  const c = MAPAS[mapa].atracoes[atracao];
  const o = CENTRO_ORIGINAL[atracao];
  return { dx: c.x - o.x, dz: c.z - o.z };
}

// ------------------------------------------------------------------ qual mapa
const CHAVE = 'sala3d-mapas'; // { sala: mapa }
function lidos() {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

// O mapa desta página: ?mapa= no endereço e, sem ele, o último visto nesta sala neste navegador
export const MAPA_DA_PAGINA = (() => {
  if (typeof location === 'undefined') return MAPA_PADRAO;
  const params = new URLSearchParams(location.search);
  const pedido = params.get('mapa');
  if (MAPAS[pedido]) return pedido;
  const sala = params.get('sala');
  const salvo = sala && lidos()[sala.toLowerCase()];
  return MAPAS[salvo] ? salvo : MAPA_PADRAO;
})();

// guarda o mapa da sala: a próxima visita já monta o certo, sem recarregar
export function lembrarMapa(sala, mapa) {
  if (!sala || !MAPAS[mapa]) return;
  try {
    const m = lidos();
    m[sala.toLowerCase()] = mapa;
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch { /* modo privado: recarrega toda vez, mas funciona */ }
}

// O mapa de um módulo: o ?mapa= do endereço dele (servidor) ou o da página (navegador)
export function mapaDoModulo(url) {
  try {
    const m = new URL(url).searchParams.get('mapa');
    if (MAPAS[m]) return m;
  } catch { /* endereço sem consulta */ }
  return MAPA_DA_PAGINA;
}

// ------------------------------------------------------------------ o parque
// Salão de jogos (pingue-pongue, sinuca, cartas e poker), queimada, pinta-território, minigolfe, gincana e
// kart, no lugar deste mapa. Só números: o servidor confere quem joga em cada mesa por aqui.
export function parqueDe(mapa) {
  const M = MAPAS[mapa];
  const d = (a) => deslocamento(mapa, a);
  const s = d('salao');
  const q = d('queimada');
  const p = d('pinta');
  const g = d('golfe');
  return {
    SALAO: { x0: -10 + s.dx, x1: 50 + s.dx, z0: 628 + s.dz, z1: 670 + s.dz, altura: 7.5 },
    MESAS_PINGUE: [{ x: 2 + s.dx, z: 638 + s.dz }, { x: 2 + s.dx, z: 660 + s.dz }],
    MESAS_SINUCA: [{ x: 22.5 + s.dx, z: 638 + s.dz }, { x: 22.5 + s.dx, z: 660 + s.dz }],
    MESAS_CARTAS: [{ x: 41.5 + s.dx, z: 638 + s.dz, jogo: 'truco' }, { x: 41.5 + s.dx, z: 660 + s.dz, jogo: 'uno' }, { x: 41.5 + s.dx, z: 649 + s.dz, jogo: 'vinteum' }, { x: 2 + s.dx, z: 649 + s.dz, jogo: 'cacheta' }],
    // poker: no corredor do meio, entre o pingue-pongue e a sinuca e entre a sinuca e as cartas
    MESAS_POKER: [{ x: 12 + s.dx, z: 649 + s.dz }, { x: 32 + s.dx, z: 649 + s.dz }],
    QUEIMADA: { cx: 75 + q.dx, cz: 616 + q.dz, comp: 30, larg: 15, cemiterio: 5 },
    PINTA_ARENA: { cx: 133 + p.dx, cz: 637 + p.dz, lado: 56 },
    GOLFE_AREA: { x0: -48 + g.dx, x1: -6 + g.dx, z0: 548 + g.dz, z1: 626 + g.dz },
    PORTAL_GINCANA: { ...M.atracoes.gincana },
    PORTAL_FANTASMAS: { ...M.atracoes.fantasmas },
    KART: { ...M.atracoes.kart },
  };
}

// o kart: os pontos do desenho original girados em volta do centro e postos no centro deste mapa
export function transformarKart(mapa) {
  const k = MAPAS[mapa].atracoes.kart;
  const o = CENTRO_ORIGINAL.kart;
  const c = Math.cos(k.giro || 0);
  const s = Math.sin(k.giro || 0);
  return ([x, z]) => {
    const u = x - o.x;
    const v = z - o.z;
    return [k.x + u * c - v * s, k.z + u * s + v * c];
  };
}
