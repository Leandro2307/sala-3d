// Kart: o kartódromo do parque (KART_AREA, parque-dados.js), as caixas de item e as contas da pista.
// Sem three.js: o servidor lê daqui as voltas, os tempos e os itens; o navegador monta o 3D
// (kart.js) e anda com o kart.
//
// O traçado é uma curva suave pelos pontos do DESENHO (Catmull-Rom centrípeta), amostrada numa
// linha de pontos. Volta só conta passando por todos os setores, em ordem (como no autódromo).
import { mapaDoModulo, transformarKart } from './mapas-dados.js';

// o mapa deste módulo (no servidor vem no endereço: ?mapa=): o desenho é girado e posto no lugar dele
const NO_MAPA = transformarKart(mapaDoModulo(import.meta.url));

export const KART = {
  largura: 14,
  voltas: 3,
  setores: 10,
  topo: 26, // m/s no asfalto
  turbo: 38,
  re: 7,
  acel: 15,
  freio: 30,
  atrito: 1.1,
  esterco: 2.0,
  grama: 12, // máximo fora do asfalto
  giro: 1.3, // segundos rodando depois de uma casca ou de um míssil
  turboTempo: 1.5,
  escudoTempo: 7,
};

export const TEMPOS_KART = { contagem: 20, largada: 4, maxCorrida: 360, depoisDoPrimeiro: 45, fim: 10 };

// o desenho (x, z): sai na reta do sul, para leste; sobe pelo leste, faz o "S" no meio, cruza o
// norte de volta para oeste e desce pelo lado oeste até a largada
const DESENHO = [
  [215, 572], [280, 570], [345, 574], [400, 586], [438, 612], [452, 650],
  [448, 690], [425, 722], [390, 736], [355, 726], [330, 700], [300, 690],
  [270, 702], [258, 735], [272, 770], [305, 792], [350, 800], [400, 805],
  [436, 813], [450, 830], [428, 842], [370, 841], [300, 838], [240, 830],
  [210, 805], [200, 760], [205, 710], [222, 670], [216, 630], [204, 600],
];

// Catmull-Rom centrípeta fechada: pontos a cada ~1 m
function amostrar(pontos, passo = 1) {
  const n = pontos.length;
  const P = (i) => pontos[((i % n) + n) % n];
  const saida = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const d = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-4; // alfa = 0,5
    const t0 = 0;
    const t1 = t0 + d(p0, p1);
    const t2 = t1 + d(p1, p2);
    const t3 = t2 + d(p2, p3);
    const comp = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(comp / passo));
    for (let j = 0; j < k; j++) {
      const t = t1 + ((t2 - t1) * j) / k;
      const mix = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = mix(p0, p1, t0, t1);
      const A2 = mix(p1, p2, t1, t2);
      const A3 = mix(p2, p3, t2, t3);
      const B1 = mix(A1, A2, t0, t2);
      const B2 = mix(A2, A3, t1, t3);
      saida.push(mix(B1, B2, t1, t2));
    }
  }
  return saida;
}

export const LINHA = amostrar(DESENHO.map(NO_MAPA));
const ACUM = (() => {
  const a = [0];
  for (let i = 1; i <= LINHA.length; i++) {
    const p = LINHA[i - 1];
    const q = LINHA[i % LINHA.length];
    a.push(a[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return a;
})();
export const COMPRIMENTO = ACUM.at(-1);

// a caixa de cada pedaço de 40 pontos: a projeção só olha os pedaços perto
const BLOCO = 40;
const CAIXAS = [];
for (let i = 0; i < LINHA.length; i += BLOCO) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let j = i; j <= Math.min(i + BLOCO, LINHA.length); j++) {
    const [x, z] = LINHA[j % LINHA.length];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  CAIXAS.push({ i, x0, x1, z0, z1 });
}

// o ponto da pista mais perto de (x, z): { t (fração da volta, 0 = largada), dist, x, z, ang }
// ang: para onde a pista vai ali (no plano: x = sen, z = cos, como o yaw do boneco ao contrário)
export function projetarKart(x, z) {
  let melhor = { d2: Infinity, i: 0, u: 0 };
  const testar = (i0, i1) => {
    for (let i = i0; i < i1; i++) {
      const [ax, az] = LINHA[i % LINHA.length];
      const [bx, bz] = LINHA[(i + 1) % LINHA.length];
      const vx = bx - ax;
      const vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const dx = x - (ax + vx * u);
      const dz = z - (az + vz * u);
      const d2 = dx * dx + dz * dz;
      if (d2 < melhor.d2) melhor = { d2, i, u };
    }
  };
  const folga = KART.largura * 3;
  for (const c of CAIXAS) {
    if (x < c.x0 - folga || x > c.x1 + folga || z < c.z0 - folga || z > c.z1 + folga) continue;
    testar(c.i, Math.min(c.i + BLOCO, LINHA.length));
  }
  if (melhor.d2 === Infinity) testar(0, LINHA.length);
  const { i, u } = melhor;
  const [ax, az] = LINHA[i % LINHA.length];
  const [bx, bz] = LINHA[(i + 1) % LINHA.length];
  const s = ACUM[i] + Math.hypot(bx - ax, bz - az) * u;
  return { t: s / COMPRIMENTO, dist: Math.sqrt(melhor.d2), x: ax + (bx - ax) * u, z: az + (bz - az) * u, ang: Math.atan2(bx - ax, bz - az) };
}

// o ponto e a direção da pista numa fração da volta
export function pontoKart(t) {
  const s = (((t % 1) + 1) % 1) * COMPRIMENTO;
  let i = 0;
  while (i < LINHA.length - 1 && ACUM[i + 1] < s) i++;
  const [ax, az] = LINHA[i];
  const [bx, bz] = LINHA[(i + 1) % LINHA.length];
  const l = ACUM[i + 1] - ACUM[i] || 1;
  const u = (s - ACUM[i]) / l;
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, ang: Math.atan2(bx - ax, bz - az) };
}

// a linha de largada e chegada, no meio da reta do sul (a volta é contada a partir dela)
export const LARGADA_T = 0.05;
export const naVoltaKart = (t) => (((t - LARGADA_T) % 1) + 1) % 1;

// o grid de largada: duas filas atrás da linha, 7 m entre uma fila e outra
export function lugarNoGrid(k) {
  const t = LARGADA_T - ((Math.floor(k / 2) + 1) * 7) / COMPRIMENTO;
  const p = pontoKart(t);
  const lado = k % 2 ? 1 : -1;
  // o lado da pista: perpendicular à direção (sen, cos) -> (cos, -sen)
  return { x: p.x + Math.cos(p.ang) * lado * 3.2, z: p.z - Math.sin(p.ang) * lado * 3.2, ang: p.ang };
}

// as caixas de item: fileiras de 4 atravessando a pista
export const CAIXAS_ITEM = [0.18, 0.43, 0.68, 0.88].flatMap((t, f) => {
  const p = pontoKart(t);
  return [-4.5, -1.5, 1.5, 4.5].map((w, k) => ({ id: f * 4 + k, x: p.x + Math.cos(p.ang) * w, z: p.z - Math.sin(p.ang) * w }));
});
export const ITENS = ['turbo', 'casca', 'missil', 'escudo'];
export const NOME_ITEM = { turbo: 'Turbo', casca: 'Casca de banana', missil: 'Míssil', escudo: 'Escudo' };
export const ICONE_ITEM = { turbo: '⚡', casca: '🍌', missil: '🚀', escudo: '🛡️' };
// sorteio pela colocação: quem vem atrás ganha mais turbo e míssil
export function sortearItem(posicao, total, aleatorio = Math.random) {
  const atras = total > 1 ? posicao / (total - 1) : 0.5; // 0 = primeiro, 1 = último
  const pesos = { turbo: 1 + atras * 2, casca: 2 - atras * 1.4, missil: 0.3 + atras * 2.2, escudo: 1.4 - atras * 0.6 };
  const soma = Object.values(pesos).reduce((a, b) => a + b, 0);
  let r = aleatorio() * soma;
  for (const [k, p] of Object.entries(pesos)) if ((r -= p) <= 0) return k;
  return 'turbo';
}

// a placa de entrar, no fim da Rua dos Esportes
export const ENTRADA_KART = (() => {
  const [x, z] = NO_MAPA([189, 606]);
  return { x, z };
})();
