// Minigolfe do parque: os 9 buracos e a física da bolinha. Sem three.js: o servidor lê daqui o par
// de cada buraco (ele só conta as tacadas); a bolinha de cada um anda no navegador dele.
//
// Os buracos ficam numa grade de 3 x 3 dentro de GOLFE_AREA (parque-dados.js), em zigue-zague: a
// fila de baixo vai de leste para oeste, a do meio volta, a de cima vai de novo. Cada buraco é
// descrito no sistema dele: u de lado (para leste), v ao longo (para o norte), a partir do tee.
import { GOLFE_AREA as A } from './parque-dados.js';

export const GOLFE = {
  raio: 0.09, // a bolinha (bem maior que a de verdade: dá para ver)
  copo: 0.18,
  atrito: 0.95, // m/s² rolando
  tabela: 0.72, // quanto volta da parede
  forca: [0.7, 9], // velocidade de saída, da tacada mais fraca à mais forte
  maxTacadas: 8,
  y: 0.06, // altura do gramado
};

// lane: contorno (as paredes); paredes: segmentos a mais; postes: [u, v, r]; agua: [u0, u1, v0, v1];
// morros: [u, v, r, forca] (empurram a bola para fora); moinho: { v, tunel, prof, vel, pas } (o prédio
// atravessa a pista, com um túnel no meio que as pás fecham quando passam embaixo)
const DESENHO = [
  { nome: 'A reta', par: 2, tee: [0, 1.5], copo: [0, 15.5], lane: [[-1.5, 0], [1.5, 0], [1.5, 18], [-1.5, 18]] },
  { nome: 'A curva', par: 3, tee: [0, 1.5], copo: [4.2, 12.5], lane: [[-1.5, 0], [1.5, 0], [1.5, 11], [5.5, 11], [5.5, 14], [-1.5, 14]] },
  {
    nome: 'O bloco', par: 2, tee: [0, 1.5], copo: [0, 15.5], lane: [[-2, 0], [2, 0], [2, 18], [-2, 18]],
    paredes: [[[-0.9, 8], [0.9, 8]], [[0.9, 8], [0.9, 10]], [[0.9, 10], [-0.9, 10]], [[-0.9, 10], [-0.9, 8]]],
  },
  {
    nome: 'O moinho', par: 3, tee: [0, 1.5], copo: [0, 17.5], lane: [[-1.6, 0], [1.6, 0], [1.6, 20], [-1.6, 20]],
    moinho: { v: 9.5, tunel: 0.8, prof: 1.4, vel: 1.1, pas: 4 },
  },
  {
    nome: 'Zigue-zague', par: 3, tee: [-1.5, 1.5], copo: [1.5, 18.5], lane: [[-2.5, 0], [2.5, 0], [2.5, 20], [-2.5, 20]],
    paredes: [[[-2.5, 6], [1, 6]], [[2.5, 11], [-1, 11]], [[-2.5, 16], [1, 16]]],
  },
  {
    nome: 'Os morros', par: 3, tee: [0, 1.5], copo: [0, 18], lane: [[-2, 0], [2, 0], [2, 20], [-2, 20]],
    morros: [[0, 8.5, 2.1, 3.2], [-0.9, 14, 1.3, 2.4], [1.1, 13.5, 1.1, 2.4]],
  },
  {
    nome: 'A ilha', par: 3, tee: [0, 1.5], copo: [0, 17], lane: [[-4, 0], [4, 0], [4, 20], [-4, 20]],
    agua: [[-4, -0.75, 8, 12], [0.75, 4, 8, 12]],
  },
  {
    nome: 'A tabela', par: 3, tee: [1.5, 1.5], copo: [-1.5, 16.5], lane: [[-2.5, 0], [2.5, 0], [2.5, 20], [-2.5, 20]],
    paredes: [[[-2.5, 10], [1.2, 10]], [[-0.2, 13.5], [-0.2, 20]]],
  },
  {
    nome: 'O funil', par: 3, tee: [0, 1.5], copo: [0, 18.5],
    lane: [[-5, 0], [5, 0], [5, 8], [1.5, 15], [1.5, 20], [-1.5, 20], [-1.5, 15], [-5, 8]],
    postes: [[-2.2, 5.5, 0.3], [2.2, 5.5, 0.3], [0, 9.5, 0.35], [0, 3.8, 0.3], [-0.8, 16.5, 0.22], [0.8, 16.5, 0.22]],
  },
];

// onde fica a origem de cada buraco no mundo: grade 3 x 3, em zigue-zague
const COL = 14;
const LIN = (A.z1 - A.z0) / 3;
function origem(i) {
  const fila = Math.floor(i / 3);
  const k = i % 3;
  const col = fila % 2 === 0 ? k : 2 - k; // 0 = a coluna de leste
  return { x: A.x1 - COL / 2 - col * COL, z: A.z0 + 2 + fila * LIN };
}

// tudo em coordenadas do mundo
export const BURACOS = DESENHO.map((d, i) => {
  const o = origem(i);
  const P = ([u, v]) => ({ x: o.x + u, z: o.z + v });
  const segmentos = [];
  for (let k = 0; k < d.lane.length; k++) segmentos.push([P(d.lane[k]), P(d.lane[(k + 1) % d.lane.length])]);
  for (const [a, b] of d.paredes || []) segmentos.push([P(a), P(b)]);
  // o moinho: dois blocos, um de cada lado do túnel (a pista vai de u0 a u1 na altura dele)
  let moinho = null;
  if (d.moinho) {
    const M = d.moinho;
    const us = d.lane.map(([u]) => u);
    const u0 = Math.min(...us);
    const u1 = Math.max(...us);
    const t = M.tunel / 2;
    for (const [a, b] of [[u0, -t], [t, u1]]) {
      const c = [[a, M.v], [b, M.v], [b, M.v + M.prof], [a, M.v + M.prof]];
      for (let k = 0; k < 4; k++) segmentos.push([P(c[k]), P(c[(k + 1) % 4])]);
    }
    moinho = { ...P([0, M.v]), u0: o.x + u0, u1: o.x + u1, tunel: M.tunel, prof: M.prof, vel: M.vel, pas: M.pas, porta: [P([-t, M.v]), P([t, M.v])] };
  }
  return {
    n: i + 1, nome: d.nome, par: d.par, origem: o,
    tee: P(d.tee), copo: P(d.copo),
    contorno: d.lane.map(P),
    segmentos,
    postes: (d.postes || []).map(([u, v, r]) => ({ ...P([u, v]), r })),
    agua: (d.agua || []).map(([u0, u1, v0, v1]) => ({ x0: o.x + u0, x1: o.x + u1, z0: o.z + v0, z1: o.z + v1 })),
    morros: (d.morros || []).map(([u, v, r, f]) => ({ ...P([u, v]), r, forca: f })),
    moinho,
  };
});
export const PAR_TOTAL = BURACOS.reduce((s, b) => s + b.par, 0);
// a placa de começar fica no canto de leste, perto da praça, ao lado do 1º buraco
export const ENTRADA_GOLFE = { x: A.x1 + 1.8, z: A.z0 + 4 };

// o giro das pás no instante t (s), e se alguma está passando embaixo (tapando o túnel)
export const giroDoMoinho = (m, t) => t * m.vel;
export function portaFechada(m, t) {
  const g = giroDoMoinho(m, t);
  for (let k = 0; k < m.pas; k++) {
    const a = g + (k * Math.PI * 2) / m.pas + Math.PI / 2; // 0 = a pá apontando para baixo
    const d = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(d) < 0.3) return true;
  }
  return false;
}

// bate a bola (p, v: { x, z }) num segmento; devolve se bateu
function bater(p, v, a, b, r, e) {
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const l2 = sx * sx + sz * sz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * sx + (p.z - a.z) * sz) / l2));
  const cx = a.x + sx * t;
  const cz = a.z + sz * t;
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 1e-12 ? dx / d : -sz / Math.sqrt(l2);
  const nz = d2 > 1e-12 ? dz / d : sx / Math.sqrt(l2);
  p.x = cx + nx * r;
  p.z = cz + nz * r;
  const vn = v.x * nx + v.z * nz;
  if (vn < 0) {
    v.x -= (1 + e) * vn * nx;
    v.z -= (1 + e) * vn * nz;
  }
  return true;
}

// Um passo da bolinha no buraco h, no instante t (para o moinho). Devolve 'dentro' (no copo),
// 'agua', 'parou', 'bateu' (numa parede: para o som) ou null.
export function passoGolfe(b, h, dt, t) {
  const { p, v } = b;
  const G = GOLFE;
  // os morros empurram para fora
  for (const m of h.morros) {
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < m.r && d > 1e-4) {
      const k = (m.forca * (1 - d / m.r)) * dt / d;
      v.x += dx * k;
      v.z += dz * k;
    }
  }
  const vel = Math.sqrt(v.x * v.x + v.z * v.z);
  if (vel > 0) {
    const nv = Math.max(0, vel - G.atrito * dt);
    v.x *= nv / vel;
    v.z *= nv / vel;
  }
  p.x += v.x * dt;
  p.z += v.z * dt;
  let bateu = false;
  for (const [a, c] of h.segmentos) bateu = bater(p, v, a, c, G.raio, G.tabela) || bateu;
  if (h.moinho && portaFechada(h.moinho, t)) bateu = bater(p, v, h.moinho.porta[0], h.moinho.porta[1], G.raio, 0.6) || bateu;
  for (const q of h.postes) {
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const lim = q.r + G.raio;
    if (d < lim && d > 1e-6) {
      const nx = dx / d;
      const nz = dz / d;
      p.x = q.x + nx * lim;
      p.z = q.z + nz * lim;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        v.x -= 1.8 * vn * nx;
        v.z -= 1.8 * vn * nz;
      }
      bateu = true;
    }
  }
  for (const w of h.agua) if (p.x > w.x0 && p.x < w.x1 && p.z > w.z0 && p.z < w.z1) return 'agua';
  const dx = p.x - h.copo.x;
  const dz = p.z - h.copo.z;
  const agora = Math.sqrt(v.x * v.x + v.z * v.z);
  if (dx * dx + dz * dz < G.copo * G.copo) {
    if (agora < 3.6) return 'dentro';
    // rápida demais: passa raspando, um pouco desviada
    v.x *= 0.85;
    v.z *= 0.85;
  }
  if (agora < 0.04) {
    v.x = 0;
    v.z = 0;
    return 'parou';
  }
  return bateu ? 'bateu' : null;
}

// anda dt em passos pequenos; devolve o primeiro acontecimento que encerra ('dentro', 'agua',
// 'parou') ou, se bateu em algo, 'bateu'
export function andarGolfe(b, h, dt, t) {
  const n = Math.min(40, Math.ceil(dt * 360));
  let bateu = null;
  for (let i = 0; i < n; i++) {
    const r = passoGolfe(b, h, dt / n, t + (i * dt) / n);
    if (r === 'dentro' || r === 'agua' || r === 'parou') return r;
    if (r === 'bateu') bateu = r;
  }
  return bateu;
}

// o ponto está dentro do contorno do buraco? (para saber de que buraco é uma bola, e o "fora")
export function dentroDoBuraco(h, x, z) {
  let dentro = false;
  const c = h.contorno;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    if ((c[i].z > z) !== (c[j].z > z) && x < ((c[j].x - c[i].x) * (z - c[i].z)) / (c[j].z - c[i].z) + c[i].x) dentro = !dentro;
  }
  return dentro;
}
