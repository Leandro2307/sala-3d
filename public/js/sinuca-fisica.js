// Sinuca (bola 8) no salão de jogos do parque: as mesas e a física das bolas. Sem three.js e só com
// + - * / e raiz quadrada no laço (contas que dão o mesmo resultado em qualquer navegador): o
// servidor simula a tacada inteira e conta o que caiu; cada navegador simula a mesma tacada para
// animar e, no fim, as bolas ficam onde o servidor disse.
// Tudo no sistema da mesa: x ao longo do comprimento, z de lado, a origem no meio do pano.
import { MESAS_SINUCA } from './parque-dados.js';

export const SINUCA = {
  mesas: MESAS_SINUCA,
  comp: 4.6, larg: 2.3, // o pano (maior que o de verdade: dá para ver da sala)
  altura: 1.0, // altura do pano
  raio: 0.055,
  bolsoCanto: 0.15, bolsoMeio: 0.14, // até onde o centro da bola cai no bolso
  atrito: 0.55, // m/s² rolando
  tabela: 0.75, // quanto da velocidade volta da tabela
  choque: 0.95, // bola com bola
  forcaMax: 6.5, // m/s na bola branca
};
const L = SINUCA.comp / 2;
const W = SINUCA.larg / 2;
const R = SINUCA.raio;
export const BOLSOS = [[-L, -W], [0, -W - 0.02], [L, -W], [-L, W], [0, W + 0.02], [L, W]];
const BOCA_CANTO = 0.17; // perto do canto a tabela some (a bola entra no bolso)
const BOCA_MEIO = 0.13;
export const MARCA_SAIDA = { x: -L / 2, z: 0 }; // onde fica a branca na saída e depois de cair

// Bolas: 0 é a branca, 1–7 lisas, 8 a preta, 9–15 listradas. { n, x, z, vx, vz, fora }
export const lisa = (n) => n >= 1 && n <= 7;
export const listrada = (n) => n >= 9 && n <= 15;

// o triângulo arrumado: a ponta no "pé" da mesa, a 8 no meio da terceira fila, um canto de cada
// grupo. ordem: as outras 13 bolas na ordem em que vão (o servidor sorteia)
export function arrumarTriangulo(ordem) {
  const bolas = [{ n: 0, x: MARCA_SAIDA.x, z: 0, vx: 0, vz: 0, fora: false }];
  const lugares = [];
  const dx = 2 * R * 0.8661 + 0.002;
  for (let fila = 0; fila < 5; fila++) {
    for (let i = 0; i <= fila; i++) lugares.push({ x: L / 2 + fila * dx, z: (i - fila / 2) * (2 * R + 0.002) });
  }
  // 4 = a do meio da 3ª fila (a 8); 10 e 14 = os cantos de trás (uma lisa e uma listrada)
  const resto = [...ordem];
  const pegar = (cond) => {
    const k = resto.findIndex(cond);
    return resto.splice(k >= 0 ? k : 0, 1)[0];
  };
  const fixas = { 4: 8, 10: pegar(lisa), 14: pegar(listrada) };
  lugares.forEach((l, i) => {
    const n = fixas[i] ?? resto.shift();
    bolas.push({ n, x: l.x, z: l.z, vx: 0, vz: 0, fora: false });
  });
  return bolas.sort((a, b) => a.n - b.n);
}

// cópia das bolas (para simular sem mexer nas de verdade)
export const copiarBolas = (bolas) => bolas.map((b) => ({ ...b }));

// Um passo de dt. ev junta o que aconteceu: primeira (a primeira bola que a branca tocou),
// caidas (as que entraram, na ordem), tabelas (batidas na tabela). Devolve se alguma ainda anda.
function passo(bolas, dt, ev) {
  let anda = false;
  for (const b of bolas) {
    if (b.fora || (b.vx === 0 && b.vz === 0)) continue;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
  }
  // bolsos (e quem escapou da mesa pelo canto: cai também)
  for (const b of bolas) {
    if (b.fora) continue;
    let caiu = Math.abs(b.x) > L + 0.08 || Math.abs(b.z) > W + 0.08;
    for (let k = 0; k < 6 && !caiu; k++) {
      const [px, pz] = BOLSOS[k];
      const r = k === 1 || k === 4 ? SINUCA.bolsoMeio : SINUCA.bolsoCanto;
      const dx = b.x - px;
      const dz = b.z - pz;
      if (dx * dx + dz * dz < r * r) caiu = true;
    }
    if (caiu) {
      b.fora = true;
      b.vx = 0;
      b.vz = 0;
      ev.caidas.push(b.n);
    }
  }
  // tabelas, menos nas bocas dos bolsos
  for (const b of bolas) {
    if (b.fora) continue;
    const ax = b.x < 0 ? -b.x : b.x;
    const az = b.z < 0 ? -b.z : b.z;
    if (az > W - R && (ax > BOCA_MEIO && ax < L - BOCA_CANTO)) {
      b.z = b.z < 0 ? -(W - R) : W - R;
      if ((b.z < 0 && b.vz < 0) || (b.z > 0 && b.vz > 0)) {
        b.vz = -b.vz * SINUCA.tabela;
        b.vx *= 0.96;
        ev.tabelas++;
      }
    }
    if (ax > L - R && az < W - BOCA_CANTO) {
      b.x = b.x < 0 ? -(L - R) : L - R;
      if ((b.x < 0 && b.vx < 0) || (b.x > 0 && b.vx > 0)) {
        b.vx = -b.vx * SINUCA.tabela;
        b.vz *= 0.96;
        ev.tabelas++;
      }
    }
  }
  // bola com bola (mesma massa)
  const D = 2 * R;
  for (let i = 0; i < bolas.length; i++) {
    const a = bolas[i];
    if (a.fora) continue;
    for (let j = i + 1; j < bolas.length; j++) {
      const b = bolas[j];
      if (b.fora) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= D * D || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const sep = (D - d) / 2;
      a.x -= nx * sep;
      a.z -= nz * sep;
      b.x += nx * sep;
      b.z += nz * sep;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel <= 0) continue;
      const k = (rel * (1 + SINUCA.choque)) / 2;
      a.vx -= k * nx;
      a.vz -= k * nz;
      b.vx += k * nx;
      b.vz += k * nz;
      if (ev.primeira === null && (a.n === 0 || b.n === 0)) ev.primeira = a.n === 0 ? b.n : a.n;
    }
  }
  // atrito (pano): desacelera e para
  for (const b of bolas) {
    if (b.fora || (b.vx === 0 && b.vz === 0)) continue;
    const v = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    const nv = v - SINUCA.atrito * dt;
    if (nv <= 0.004) {
      b.vx = 0;
      b.vz = 0;
    } else {
      b.vx *= nv / v;
      b.vz *= nv / v;
      anda = true;
    }
  }
  return anda;
}

// Simula a tacada: a branca sai com (vx, vz). Muda as bolas no lugar e devolve os acontecimentos.
// quadro(t, bolas): chamado a cada 1/60 s, para animar (opcional).
export function simularSinuca(bolas, vx, vz, quadro = null) {
  const ev = { primeira: null, caidas: [], tabelas: 0 };
  const branca = bolas.find((b) => b.n === 0);
  branca.vx = vx;
  branca.vz = vz;
  const dt = 1 / 240;
  let t = 0;
  for (let k = 0; k < 240 * 14; k++) {
    t += dt;
    const anda = passo(bolas, dt, ev);
    if (quadro && k % 4 === 3) quadro(t, bolas);
    if (!anda) break;
  }
  if (quadro) quadro(t, bolas);
  ev.tempo = t;
  return ev;
}

// a branca volta para a marca da saída (se tiver bola lá, um pouco para trás)
export function devolverBranca(bolas) {
  const branca = bolas.find((b) => b.n === 0);
  branca.fora = false;
  branca.vx = 0;
  branca.vz = 0;
  for (let k = 0; k < 40; k++) {
    const x = MARCA_SAIDA.x - k * 0.05;
    const livre = bolas.every((b) => b === branca || b.fora || (b.x - x) ** 2 + b.z ** 2 > (2.05 * R) ** 2);
    if (livre) {
      branca.x = x;
      branca.z = 0;
      return;
    }
  }
}

// Onde a linha de mira (da branca, no ângulo dado) encosta primeiro: numa bola ou na tabela.
// Devolve { x, z, bola: n | null } — o centro da "bola fantasma" no ponto do choque.
export function mira(bolas, ang) {
  const branca = bolas.find((b) => b.n === 0);
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  let melhor = Infinity;
  let bola = null;
  for (const b of bolas) {
    if (b === branca || b.fora) continue;
    // raio contra círculo de raio 2R em volta da bola
    const ox = b.x - branca.x;
    const oz = b.z - branca.z;
    const proj = ox * dx + oz * dz;
    if (proj <= 0) continue;
    const perp2 = ox * ox + oz * oz - proj * proj;
    const r2 = 4 * R * R;
    if (perp2 > r2) continue;
    const t = proj - Math.sqrt(r2 - perp2);
    if (t < melhor) {
      melhor = t;
      bola = b.n;
    }
  }
  // as tabelas (o retângulo onde o centro pode andar)
  const tx = dx > 0 ? (L - R - branca.x) / dx : dx < 0 ? (-(L - R) - branca.x) / dx : Infinity;
  const tz = dz > 0 ? (W - R - branca.z) / dz : dz < 0 ? (-(W - R) - branca.z) / dz : Infinity;
  const tt = Math.min(tx, tz);
  if (tt < melhor) {
    melhor = tt;
    bola = null;
  }
  return { x: branca.x + dx * melhor, z: branca.z + dz * melhor, bola };
}
