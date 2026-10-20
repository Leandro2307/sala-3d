// Gincana (como no Fall Guys): a pista no céu, acima do norte do parque, e a rodada final no piso de
// hexágonos que cai. Só números e contas, sem three.js: o servidor lê daqui o tempo de cada fase e
// quantos pisos tem a final; o navegador monta o 3D (gincana.js) e anda com os obstáculos.
//
// Tudo anda pelo relógio (Date.now): todo mundo vê os varredores, as plataformas e os pêndulos no
// mesmo lugar (o empurrão de cada um é calculado no navegador dele).

export const Y = 450; // o chão da pista
const X = 40; // o meio da pista em x; ela vai para o norte (z cresce)

// caixas paradas: [x0, y0, z0, x1, y1, z1] (y relativo ao chão da pista)
export const CAIXAS = [
  // 1. a largada (atrás do portão)
  [30, -2, 688, 50, 0, 700],
  // 2. a ponte dos varredores
  [37, -1, 700, 43, 0, 730],
  [39.6, 0, 707.6, 40.4, 1.6, 708.4], [39.6, 0, 721.6, 40.4, 1.6, 722.4], // os eixos
  // 3. o fim das plataformas que se mexem (o começo é a ponte)
  [33, -1, 760, 47, 0, 770],
  // 4. o corredor das portas
  [28, -1, 770, 52, 0, 790],
  // 5. a ponte estreita dos pêndulos
  [38, -1, 790, 42, 0, 816],
  // 6. a escada final (degraus de 0,4 m sobem andando) e a chegada
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [36, -1, 816 + i * 1.8, 44, 0.4 * (i + 1), 817.8 + i * 1.8]),
  [32, -1, 830.4, 48, 3.2, 844],
];

// o portão da largada: fechado até a corrida começar
export const PORTAO = [30, 0, 700, 50, 4, 700.6];

// o paredão das portas (em z = 780): 6 vãos de 2,6 m; em cada rodada, 3 portas são de verdade
// (seguram) e 3 quebram quando alguém passa (sorteado pelo servidor, igual para todos)
export const PORTAS = (() => {
  const vaos = [];
  const pilares = [];
  let x = 28;
  for (let k = 0; k < 6; k++) {
    pilares.push([x, 0, 779.7, x + 1.2, 5, 780.3]);
    vaos.push({ x0: x + 1.2, x1: x + 3.8 });
    x += 3.8;
  }
  pilares.push([x, 0, 779.7, 52, 5, 780.3]);
  return { z: 780, vaos, pilares, verga: [28, 3, 779.7, 52, 5, 780.3] };
})();
// quais portas seguram nesta rodada (3 de 6), pelo número sorteado
export function portasDeVerdade(semente) {
  const lista = [0, 1, 2, 3, 4, 5];
  let s = semente >>> 0;
  for (let i = lista.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return new Set(lista.slice(0, 3));
}

// plataformas que vão e voltam em x (meia largura, z do meio, amplitude, período, fase)
export const MOVEIS = [735, 742, 749, 756].map((z, k) => ({ x: X, z, meia: 2.5, amp: 5, periodo: 4.2, fase: k * 0.27 }));
export const posMovel = (m, t) => m.x + Math.sin((t / m.periodo + m.fase) * Math.PI * 2) * m.amp;

// varredores: barras que giram em volta de um eixo, na altura das canelas (pule!)
export const VARREDORES = [
  { x: X, z: 708, raio: 6.5, vel: 1.15, alt: [0.25, 1.15] },
  { x: X, z: 722, raio: 6.5, vel: -1.45, alt: [0.25, 1.15] },
];
export const anguloVarredor = (v, t) => t * v.vel;

// pêndulos: martelos que balançam de lado sobre a ponte estreita
export const PENDULOS = [796, 803, 810].map((z, k) => ({ x: X, z, eixo: 10, braco: 8.6, abre: 0.95, periodo: 2.6, fase: k * 0.33, raio: 1.1 }));
export function cabecaPendulo(p, t) {
  const a = p.abre * Math.sin((t / p.periodo + p.fase) * Math.PI * 2);
  return { x: p.x + Math.sin(a) * p.braco, y: p.eixo - Math.cos(a) * p.braco, z: p.z, a, w: Math.cos((t / p.periodo + p.fase) * Math.PI * 2) };
}

// onde se volta depois de cair (o último que passou vale) e onde ele começa a valer
export const PONTOS = [
  { x: X, z: 694, yaw: Math.PI, desde: 0 }, // a largada (olhando para o norte)
  { x: X, z: 702, yaw: Math.PI, desde: 701 },
  { x: X, z: 764, yaw: Math.PI, desde: 760 },
  { x: X, z: 786, yaw: Math.PI, desde: 781 },
  { x: X, z: 832, yaw: Math.PI, desde: 830.4 },
];
export const CHEGADA = { x0: 32, x1: 48, z0: 834, z1: 844, y: 3.2 };

// ------------------------------------------------------------------ a final: o piso que cai
// Hexágonos (pontudos para o norte) em dois andares. Pisou, ele fica vermelho e cai logo depois.
export const FINAL = { x: X, z: 905, raio: 1.95, anel: 4, andares: [5, -5], queda: -18, caiEm: 650 };
export const PISOS = (() => {
  const lista = [];
  const r = FINAL.raio + 0.05;
  FINAL.andares.forEach((y, andar) => {
    for (let q = -FINAL.anel; q <= FINAL.anel; q++) {
      for (let s = Math.max(-FINAL.anel, -q - FINAL.anel); s <= Math.min(FINAL.anel, -q + FINAL.anel); s++) {
        lista.push({ id: lista.length, andar, x: FINAL.x + Math.sqrt(3) * r * (q + s / 2), z: FINAL.z + 1.5 * r * s, y });
      }
    }
  });
  return lista;
})();
// onde cada um começa na final (espalhados no andar de cima)
export const nascerNaFinal = (k) => {
  const a = k * 2.4;
  const d = 3 + (k % 4) * 3;
  return { x: FINAL.x + Math.cos(a) * d, z: FINAL.z + Math.sin(a) * d };
};
// quem caiu da final assiste daqui (uma sacada ao lado)
export const SACADA = { x0: 64, x1: 74, z0: 895, z1: 915, y: 8 };

// o portal no chão do parque (PORTAL_GINCANA, parque-dados.js) leva até a largada
export const TEMPOS = { contagem: 15, corrida: 150, intervalo: 5, final: 120, fim: 9 };
