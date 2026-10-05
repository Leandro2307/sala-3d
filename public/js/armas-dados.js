// Catálogo das armas (só dados: o servidor lê o mesmo arquivo para conferir cadência, alcance e
// quantos chumbos cada tiro pode ter). O desenho e as animações ficam em armas.js.
//
// Modelos: "Ultimate Guns Pack" de Quaternius (quaternius.com), domínio público (CC0).
// Medidas do modelo (unidades do arquivo, cano em +X, Y para cima):
//   empunhadura = onde a mão direita segura; apoio = onde a esquerda segura (armas longas);
//   boca = ponta do cano; janela = por onde a cápsula sai; comprimento = tamanho real em metros.
//
// cadencia em segundos; dano por chumbo (vida vai de 0 a 100); auto = segurar o gatilho dispara.
export const ARMAS = {
  pistola: {
    id: 'pistola', nome: 'Pistola', modelo: '/models/armas/pistola.glb',
    comprimento: 0.24, xMin: -0.34, xMax: 1.48,
    empunhadura: [0, 0.05], apoio: null, boca: [1.48, 0.56], janela: [0.75, 0.66],
    cadencia: 0.3, dano: 20, alcance: 70, empurrao: 6, chumbos: 1, abertura: 0, auto: false,
    coice: 0.7, cartucho: 'bala', engatilhar: null, som: { grave: 160, corte: 3600, dur: 0.16, vol: 0.9 },
  },
  submetralhadora: {
    id: 'submetralhadora', nome: 'SMG', modelo: '/models/armas/submetralhadora.glb',
    comprimento: 0.62, xMin: -1.8, xMax: 2.25,
    empunhadura: [-0.05, 0], apoio: [1.25, 0.25], boca: [2.25, 0.57], janela: [0.9, 0.75],
    cadencia: 0.085, dano: 7, alcance: 50, empurrao: 2.5, chumbos: 1, abertura: 0.012, auto: true,
    coice: 0.35, cartucho: 'bala', engatilhar: null, som: { grave: 190, corte: 4200, dur: 0.1, vol: 0.7 },
  },
  fuzil: {
    id: 'fuzil', nome: 'Fuzil', modelo: '/models/armas/fuzil.glb',
    comprimento: 0.88, xMin: -1.6, xMax: 3.82,
    empunhadura: [-0.02, 0.05], apoio: [2.0, 0.5], boca: [3.82, 0.58], janela: [0.9, 0.7],
    cadencia: 0.12, dano: 11, alcance: 90, empurrao: 3.5, chumbos: 1, abertura: 0.006, auto: true,
    coice: 0.5, cartucho: 'fuzil', engatilhar: null, som: { grave: 120, corte: 3000, dur: 0.17, vol: 1 },
  },
  escopeta: {
    id: 'escopeta', nome: 'Escopeta', modelo: '/models/armas/escopeta.glb',
    comprimento: 1.0, xMin: -1.48, xMax: 4.31,
    empunhadura: [0.15, -0.05], apoio: [2.1, -0.02], boca: [4.31, 0.22], janela: [0.9, 0.2],
    cadencia: 0.85, dano: 9, alcance: 32, empurrao: 3, chumbos: 7, abertura: 0.075, auto: false,
    coice: 1.3, cartucho: 'cartucho', engatilhar: 'bomba', som: { grave: 90, corte: 2400, dur: 0.3, vol: 1.25 },
  },
  sniper: {
    id: 'sniper', nome: 'Sniper', modelo: '/models/armas/sniper.glb',
    comprimento: 1.15, xMin: -1.38, xMax: 4.96,
    empunhadura: [0.45, -0.1], apoio: [2.0, 0.02], boca: [4.96, 0.21], janela: [1.1, 0.32],
    cadencia: 1.4, dano: 65, alcance: 150, empurrao: 10, chumbos: 1, abertura: 0, auto: false,
    coice: 1.6, cartucho: 'fuzil', engatilhar: 'ferrolho', som: { grave: 70, corte: 2200, dur: 0.38, vol: 1.35 },
  },
};

export const IDS_ARMAS = Object.keys(ARMAS);
export const ARMA_PADRAO = 'pistola';
