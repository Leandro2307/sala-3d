// A cidade do mapa desta página (mapas-dados.js e mapa-<id>.js): a praça na porta do prédio, as
// ruas até cada área, as pracinhas, a água, as mesas dos jogos de tabuleiro, os portais do céu, os
// pórticos, as placas de direção, os quadros "como funciona" e os totens com o mapa. Só números, sem
// three.js: as mesas (tabuleiros.js, dados.js), os portais (ceu-dados.js), a natureza, o 3D
// (cidade.js) e o mapa da tela (mapa.js) leem daqui.
import { MAPAS, MAPA_DA_PAGINA } from './mapas-dados.js';

export const MAPA = MAPA_DA_PAGINA;
export const MAPA_INFO = MAPAS[MAPA];
const C = MAPA_INFO.cidade;

// a praça na porta do prédio (o centro da cidade)
export const PRACA = C.hub;
// ruas: { nome, pontos [[x, z]...], largura, curva? (trilha que faz curva), tipo? ('pier', 'ponte'),
// pista? (termina na beira do autódromo) }
export const RUAS = C.ruas;
// pracinhas redondas das áreas (a da aventura, com os portais)
export const PRACAS = C.pracas || [];
// pisos retangulares (o da praça dos jogos, com as mesas)
export const PISOS = C.pisos || [];
const P0 = PISOS[0] || { x0: 0, x1: 0, z0: 0, z1: 0 };
export const PRACA_JOGOS = { x0: P0.x0, x1: P0.x1, z0: P0.z0, z1: P0.z1 };
export const MESAS_NOVO = C.mesas;
export const PORTAIS_NOVO = C.portais;
// lagoa, lago congelado ou lago das carpas: { x, z, r, tipo }
export const AGUA = C.agua || [];
export const TORIIS = C.toriis || null;
export const AREAS = C.areas;
export const PORTICOS = C.porticos || [];
export const PLACAS = C.placas || [];
export const QUADROS = C.quadros || [];
export const MAPAS_AQUI = C.mapasAqui || [];
export const BOSQUES = C.bosques || [];
export const ROTULOS = C.rotulos || {};
