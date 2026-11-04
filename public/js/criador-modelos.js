// Criador por voz: os modelos de voxel de cada peça (criador-dados.js). Todos olham para +z, com o
// centro perto da origem e do tamanho do "corpo" da peça. As partes marcadas como principais
// trocam de cor com os jeitos ("vaca azul"); asas, pernas e hélices são pivôs que criador.js anima.
import * as THREE from 'three';
import { projetilDe } from './criador-dados.js';

const V3 = THREE.Vector3;
const R = Math.random;
const PI = Math.PI;

export const GEO = new THREE.BoxGeometry(1, 1, 1);
export const GEO_ESF = new THREE.SphereGeometry(0.5, 12, 8);
const GEO_DOD = new THREE.DodecahedronGeometry(0.5);
const GEO_CIL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const GEO_CONE = new THREE.ConeGeometry(0.5, 1, 12);
const GEO_TORO = new THREE.TorusGeometry(0.35, 0.15, 8, 18);
const GEO_OCT = new THREE.OctahedronGeometry(0.5);

// materiais: l (fosco), b (sem luz, brilha), t (meio transparente)
const mats = new Map();
export function mat(c, tipo = 'l') {
  const k = `${c}|${tipo}`;
  let m = mats.get(k);
  if (!m) {
    if (tipo === 'b') m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    else if (tipo === 't') m = new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false });
    else m = new THREE.MeshLambertMaterial({ color: c });
    mats.set(k, m);
  }
  return m;
}
function peca(g, geo, cor, sx, sy, sz, x, y, z, principal, tipo) {
  const m = new THREE.Mesh(geo, mat(cor, tipo));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.userData.principal = !!principal;
  g.add(m);
  return m;
}
// caixa, caixa que brilha, esfera, cilindro (deitado em z com eixo 'z', em x com 'x'), cone, toro, octaedro
const B = (g, c, sx, sy, sz, x = 0, y = 0, z = 0, p = false) => peca(g, GEO, c, sx, sy, sz, x, y, z, p);
const Bb = (g, c, sx, sy, sz, x = 0, y = 0, z = 0) => peca(g, GEO, c, sx, sy, sz, x, y, z, true, 'b');
const S = (g, c, sx, sy, sz, x = 0, y = 0, z = 0, p = false) => peca(g, GEO_ESF, c, sx, sy, sz, x, y, z, p);
const St = (g, c, sx, sy, sz, x = 0, y = 0, z = 0) => peca(g, GEO_ESF, c, sx, sy, sz, x, y, z, true, 't');
function Ci(g, c, d, h, x = 0, y = 0, z = 0, p = false, eixo = 'y') {
  const m = peca(g, GEO_CIL, c, d, h, d, x, y, z, p);
  if (eixo === 'z') m.rotation.x = PI / 2;
  if (eixo === 'x') m.rotation.z = PI / 2;
  return m;
}
function Co(g, c, d, h, x = 0, y = 0, z = 0, p = false, rx = 0) {
  const m = peca(g, GEO_CONE, c, d, h, d, x, y, z, p);
  m.rotation.x = rx;
  return m;
}
const T = (g, c, s, x = 0, y = 0, z = 0, p = false) => peca(g, GEO_TORO, c, s, s, s, x, y, z, p);
const O = (g, c, sx, sy, sz, x = 0, y = 0, z = 0, p = false, tipo) => peca(g, GEO_OCT, c, sx, sy, sz, x, y, z, p, tipo);
function pivo(g, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  g.add(p);
  return p;
}
const olhos = (g, sep, y, z, s = 0.06, cor = '#111') => {
  B(g, cor, s, s, s, sep, y, z);
  B(g, cor, s, s, s, -sep, y, z);
};

// ------------------------------------------------------------------ famílias
function ave(g, corpo, cabeca, bico, { largo = false, asa = 0.5 } = {}) {
  B(g, corpo, 0.45, 0.4, 0.7, 0, 0, 0, true);
  B(g, cabeca, 0.32, 0.32, 0.32, 0, 0.25, 0.42, true);
  B(g, bico, largo ? 0.22 : 0.1, 0.07, 0.18, 0, 0.2, 0.65);
  olhos(g, 0.14, 0.3, 0.52);
  B(g, cabeca, 0.3, 0.08, 0.3, 0, 0.05, -0.45, true);
  const a1 = pivo(g, 0.22, 0.1, 0);
  const a2 = pivo(g, -0.22, 0.1, 0);
  B(a1, corpo, asa, 0.06, 0.4, asa / 2, 0, 0, true);
  B(a2, corpo, asa, 0.06, 0.4, -asa / 2, 0, 0, true);
  g.userData.asas = [a1, a2];
}
function quadrupede(g, corpo, focinho, s, { chifre = null, manchas = false, cauda = null, orelhas = null } = {}) {
  B(g, corpo, 1.1 * s, 0.8 * s, 1.7 * s, 0, 0.2 * s, 0, true);
  if (manchas) {
    B(g, '#111', 0.02, 0.35 * s, 0.5 * s, 0.56 * s, 0.3 * s, 0.2 * s);
    B(g, '#111', 0.02, 0.35 * s, 0.5 * s, -0.56 * s, 0.1 * s, -0.4 * s);
    B(g, '#111', 0.4 * s, 0.02, 0.5 * s, 0.2 * s, 0.61 * s, -0.3 * s);
  }
  B(g, corpo, 0.6 * s, 0.6 * s, 0.6 * s, 0, 0.45 * s, 1.05 * s, true);
  B(g, focinho, 0.5 * s, 0.25 * s, 0.2 * s, 0, 0.3 * s, 1.4 * s);
  olhos(g, 0.18 * s, 0.6 * s, 1.36 * s, 0.08 * Math.max(0.6, s));
  if (chifre === 'boi') {
    B(g, '#e5e7eb', 0.1 * s, 0.25 * s, 0.1 * s, 0.22 * s, 0.85 * s, 1.05 * s);
    B(g, '#e5e7eb', 0.1 * s, 0.25 * s, 0.1 * s, -0.22 * s, 0.85 * s, 1.05 * s);
  } else if (chifre) Co(g, chifre, 0.14 * s, 0.6 * s, 0, 0.95 * s, 1.25 * s, false, 0.5);
  if (orelhas) {
    B(g, orelhas, 0.14 * s, 0.22 * s, 0.08 * s, 0.2 * s, 0.82 * s, 0.95 * s);
    B(g, orelhas, 0.14 * s, 0.22 * s, 0.08 * s, -0.2 * s, 0.82 * s, 0.95 * s);
  }
  if (cauda) B(g, cauda, 0.1 * s, 0.1 * s, 0.5 * s, 0, 0.45 * s, -1 * s);
  const pernas = [];
  for (const [x, z] of [[0.35, 0.6], [-0.35, 0.6], [0.35, -0.6], [-0.35, -0.6]]) {
    const p = pivo(g, x * s, -0.15 * s, z * s);
    B(p, corpo, 0.25 * s, 0.6 * s, 0.25 * s, 0, -0.3 * s, 0, true);
    pernas.push(p);
  }
  g.userData.pernas = pernas;
}
function bipede(g, corpo, cabeca, perna, s = 1, { bracosFrente = false } = {}) {
  const y0 = -0.5 * s;
  B(g, corpo, 0.6 * s, 0.7 * s, 0.35 * s, 0, y0 + 1.1 * s, 0, true);
  B(g, cabeca, 0.42 * s, 0.42 * s, 0.42 * s, 0, y0 + 1.68 * s, 0, true);
  olhos(g, 0.1 * s, y0 + 1.72 * s, 0.21 * s, 0.08 * s);
  const pernas = [];
  for (const x of [0.15, -0.15]) {
    const p = pivo(g, x * s, y0 + 0.78 * s, 0);
    B(p, perna, 0.22 * s, 0.78 * s, 0.25 * s, 0, -0.39 * s, 0);
    pernas.push(p);
  }
  for (const x of [0.4, -0.4]) {
    const b = B(g, corpo, 0.16 * s, 0.6 * s, 0.2 * s, x * s, y0 + 1.15 * s, bracosFrente ? 0.25 * s : 0, true);
    if (bracosFrente) b.rotation.x = -PI / 2.4;
  }
  g.userData.pernas = pernas;
}
function arma(g, ponta) {
  g.userData.ponta = new V3(...ponta);
}

// ------------------------------------------------------------------ cada peça
const MODELOS = {
  // armas
  pistola: (g) => { B(g, '#374151', 0.12, 0.14, 0.45, 0, 0.05, 0.1, true); B(g, '#1f2937', 0.11, 0.3, 0.14, 0, -0.15, -0.05); B(g, '#111', 0.06, 0.06, 0.05, 0, 0.07, 0.34); arma(g, [0, 0.07, 0.38]); },
  metralhadora: (g) => { B(g, '#374151', 0.14, 0.18, 0.7, 0, 0, 0.15, true); B(g, '#111', 0.06, 0.06, 0.4, 0, 0.03, 0.65); B(g, '#1f2937', 0.1, 0.3, 0.14, 0, -0.22, 0.15); B(g, '#4b5563', 0.12, 0.16, 0.3, 0, -0.03, -0.35); arma(g, [0, 0.03, 0.88]); },
  minigun: (g) => {
    B(g, '#374151', 0.3, 0.3, 0.5, 0, 0, -0.1, true);
    const r = pivo(g, 0, 0, 0.45);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; Ci(r, '#111', 0.05, 0.8, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0, false, 'z'); }
    B(g, '#1f2937', 0.1, 0.25, 0.12, 0, -0.25, -0.1);
    g.userData.rotor = r; g.userData.rotorEixo = 'z';
    arma(g, [0, 0, 0.88]);
  },
  escopeta: (g) => { B(g, '#4b5563', 0.08, 0.08, 0.9, 0.045, 0.05, 0.3, true); B(g, '#4b5563', 0.08, 0.08, 0.9, -0.045, 0.05, 0.3, true); B(g, '#92400e', 0.14, 0.2, 0.5, 0, -0.05, -0.3); B(g, '#78350f', 0.17, 0.1, 0.25, 0, -0.02, 0.3); arma(g, [0, 0.05, 0.78]); },
  sniper: (g) => {
    B(g, '#1f2937', 0.12, 0.16, 0.8, 0, 0, 0, true); Ci(g, '#111', 0.06, 0.7, 0, 0.03, 0.75, false, 'z');
    Ci(g, '#111', 0.1, 0.4, 0, 0.16, 0.05, false, 'z'); B(g, '#57534e', 0.12, 0.2, 0.35, 0, -0.06, -0.5); B(g, '#111', 0.08, 0.22, 0.1, 0, -0.18, 0);
    arma(g, [0, 0.03, 1.12]);
  },
  bazuca: (g) => { B(g, '#3f6212', 0.26, 0.26, 1.3, 0, 0, 0.2, true); B(g, '#1f2937', 0.1, 0.25, 0.1, 0, -0.2, 0); B(g, '#111', 0.06, 0.12, 0.1, -0.12, 0.18, 0.2); B(g, '#1f2937', 0.3, 0.3, 0.1, 0, 0, 0.85); arma(g, [0, 0, 0.92]); },
  lancagranadas: (g) => { Ci(g, '#365314', 0.34, 0.7, 0, 0, 0.2, true, 'z'); Ci(g, '#1f2937', 0.4, 0.35, 0, 0, -0.1, false, 'z'); B(g, '#1f2937', 0.1, 0.25, 0.1, 0, -0.25, -0.05); arma(g, [0, 0, 0.58]); },
  canhao: (g) => { B(g, '#111827', 0.4, 0.4, 1.2, 0, 0.1, 0.3, true); B(g, '#1f2937', 0.5, 0.5, 0.15, 0, 0.1, 0.9); B(g, '#78350f', 0.1, 0.5, 0.5, 0.3, -0.15, 0); B(g, '#78350f', 0.1, 0.5, 0.5, -0.3, -0.15, 0); arma(g, [0, 0.1, 1.0]); },
  lancachamas: (g) => {
    Ci(g, '#dc2626', 0.22, 0.5, 0, 0.12, -0.15, true); Ci(g, '#dc2626', 0.22, 0.5, 0, -0.12, -0.15, true);
    B(g, '#374151', 0.1, 0.1, 0.8, 0, 0, 0.3); Ci(g, '#111', 0.14, 0.12, 0, 0, 0.72, false, 'z'); Bb(g, '#60a5fa', 0.06, 0.06, 0.04, 0, 0, 0.79);
    arma(g, [0, 0, 0.82]);
  },
  arco: (g) => {
    B(g, '#92400e', 0.06, 0.5, 0.06, 0, 0, 0.1, true);
    const a = B(g, '#92400e', 0.06, 0.45, 0.06, 0, 0.42, -0.02, true); a.rotation.x = 0.5;
    const b = B(g, '#92400e', 0.06, 0.45, 0.06, 0, -0.42, -0.02, true); b.rotation.x = -0.5;
    B(g, '#f8fafc', 0.01, 1.2, 0.01, 0, 0, -0.16);
    arma(g, [0, 0, 0.15]);
  },
  estilingue: (g) => {
    B(g, '#a16207', 0.07, 0.35, 0.07, 0, -0.15, 0, true);
    const a = B(g, '#a16207', 0.06, 0.25, 0.06, 0.08, 0.1, 0, true); a.rotation.z = -0.5;
    const b = B(g, '#a16207', 0.06, 0.25, 0.06, -0.08, 0.1, 0, true); b.rotation.z = 0.5;
    B(g, '#ef4444', 0.25, 0.03, 0.03, 0, 0.2, -0.05);
    arma(g, [0, 0.2, 0.08]);
  },
  varinha: (g) => { B(g, '#3f2a14', 0.04, 0.04, 0.6, 0, 0, 0.1, true); O(g, '#fde047', 0.16, 0.16, 0.06, 0, 0, 0.44, false, 'b'); arma(g, [0, 0, 0.48]); },
  chuva: (g) => { S(g, '#e2e8f0', 0.4, 0.25, 0.35, 0, 0, 0.1, true); S(g, '#e2e8f0', 0.3, 0.22, 0.3, 0.15, 0.06, 0.2, true); S(g, '#cbd5e1', 0.3, 0.22, 0.3, -0.15, 0.04, 0.05, true); arma(g, [0, -0.1, 0.25]); },
  mao: (g) => { B(g, '#f2c9a0', 0.2, 0.12, 0.24); B(g, '#e8b68a', 0.2, 0.06, 0.1, 0, 0.06, 0.13); arma(g, [0, 0.2, 0.12]); },

  // tiros e explosivos
  bala: (g) => Bb(g, '#fbbf24', 0.09, 0.09, 0.3),
  laser: (g) => Bb(g, '#ff2d2d', 0.07, 0.07, 1.2),
  flecha: (g) => { B(g, '#a16207', 0.04, 0.04, 0.8, 0, 0, 0, true); Co(g, '#9ca3af', 0.08, 0.16, 0, 0, 0.46, false, PI / 2); B(g, '#ef4444', 0.12, 0.02, 0.14, 0, 0, -0.36); B(g, '#ef4444', 0.02, 0.12, 0.14, 0, 0, -0.36); },
  granada: (g) => { B(g, '#3f6212', 0.28, 0.32, 0.28, 0, 0, 0, true); B(g, '#4b5563', 0.14, 0.1, 0.14, 0, 0.2, 0); B(g, '#9ca3af', 0.18, 0.04, 0.04, 0.1, 0.24, 0); },
  foguete: (g) => { B(g, '#9ca3af', 0.2, 0.2, 0.8, 0, 0, 0, true); B(g, '#ef4444', 0.16, 0.16, 0.2, 0, 0, 0.48); B(g, '#ef4444', 0.5, 0.05, 0.2, 0, 0, -0.35); B(g, '#ef4444', 0.05, 0.5, 0.2, 0, 0, -0.35); Bb(g, '#fb923c', 0.12, 0.12, 0.25, 0, 0, -0.55); },
  missil: (g) => { B(g, '#f1f5f9', 0.18, 0.18, 0.9, 0, 0, 0, true); B(g, '#dc2626', 0.14, 0.14, 0.2, 0, 0, 0.52); B(g, '#475569', 0.45, 0.04, 0.18, 0, 0, -0.35); B(g, '#475569', 0.04, 0.45, 0.18, 0, 0, -0.35); Bb(g, '#fde047', 0.1, 0.1, 0.2, 0, 0, -0.55); },
  bomba: (g) => { S(g, '#111827', 0.7, 0.7, 0.7, 0, 0, 0, true); B(g, '#a16207', 0.06, 0.25, 0.06, 0, 0.42, 0); Bb(g, '#fde047', 0.1, 0.1, 0.1, 0, 0.57, 0); },
  tnt: (g) => { for (const [x, z] of [[0.1, 0], [-0.1, 0], [0, 0.15]]) Ci(g, '#dc2626', 0.18, 0.55, x, 0, z, true); B(g, '#f8fafc', 0.42, 0.12, 0.3, 0, 0, 0.02); B(g, '#a16207', 0.04, 0.2, 0.04, 0, 0.36, 0.05); },
  barril: (g) => { Ci(g, '#9a3412', 0.6, 0.8, 0, 0, 0, true); Ci(g, '#57534e', 0.62, 0.06, 0, 0.25, 0); Ci(g, '#57534e', 0.62, 0.06, 0, -0.25, 0); B(g, '#facc15', 0.2, 0.2, 0.02, 0, 0, 0.31); },
  mina: (g) => { Ci(g, '#3f3f46', 0.6, 0.14, 0, 0, 0, true); Ci(g, '#52525b', 0.3, 0.08, 0, 0.1, 0); Bb(g, '#ef4444', 0.08, 0.06, 0.08, 0, 0.16, 0); },
  torreta: (g) => {
    Ci(g, '#475569', 0.7, 0.3, 0, -0.35, 0, true); Ci(g, '#334155', 0.2, 0.4, 0, -0.05, 0);
    B(g, '#64748b', 0.45, 0.35, 0.5, 0, 0.3, 0, true); Ci(g, '#111', 0.09, 0.6, 0, 0.32, 0.5, false, 'z'); Bb(g, '#ef4444', 0.1, 0.06, 0.02, 0, 0.4, 0.26);
  },

  // bichos
  pombo: (g) => ave(g, '#8a8f99', '#6b7080', '#f59e0b'),
  pato: (g) => ave(g, '#facc15', '#16a34a', '#f97316', { largo: true }),
  morcego: (g) => { ave(g, '#1f2937', '#111827', '#111', { asa: 0.7 }); B(g, '#111827', 0.08, 0.14, 0.06, 0.1, 0.46, 0.4); B(g, '#111827', 0.08, 0.14, 0.06, -0.1, 0.46, 0.4); olhos(g, 0.1, 0.3, 0.58, 0.05, '#ef4444'); },
  coruja: (g) => { ave(g, '#a16207', '#92400e', '#f59e0b'); B(g, '#fef3c7', 0.1, 0.1, 0.02, 0.08, 0.3, 0.59); B(g, '#fef3c7', 0.1, 0.1, 0.02, -0.08, 0.3, 0.59); },
  aguia: (g) => ave(g, '#78350f', '#f8fafc', '#facc15', { asa: 0.75 }),
  borboleta: (g) => {
    B(g, '#111', 0.06, 0.06, 0.4);
    const a1 = pivo(g, 0.03, 0, 0);
    const a2 = pivo(g, -0.03, 0, 0);
    B(a1, '#f472b6', 0.45, 0.02, 0.4, 0.22, 0, 0.05, true); B(a1, '#facc15', 0.15, 0.025, 0.12, 0.25, 0, 0.05);
    B(a2, '#f472b6', 0.45, 0.02, 0.4, -0.22, 0, 0.05, true); B(a2, '#facc15', 0.15, 0.025, 0.12, -0.25, 0, 0.05);
    g.userData.asas = [a1, a2];
  },
  abelha: (g) => {
    B(g, '#facc15', 0.3, 0.3, 0.45, 0, 0, 0, true); B(g, '#111', 0.31, 0.31, 0.08, 0, 0, 0.06); B(g, '#111', 0.31, 0.31, 0.08, 0, 0, -0.12);
    B(g, '#111', 0.22, 0.22, 0.15, 0, 0, 0.28); B(g, '#111', 0.05, 0.05, 0.12, 0, 0, -0.28);
    const a1 = pivo(g, 0.15, 0.15, 0);
    const a2 = pivo(g, -0.15, 0.15, 0);
    B(a1, '#e0f2fe', 0.35, 0.03, 0.2, 0.17, 0, 0); B(a2, '#e0f2fe', 0.35, 0.03, 0.2, -0.17, 0, 0);
    g.userData.asas = [a1, a2];
  },
  dragao: (g) => {
    B(g, '#16a34a', 0.9, 0.7, 1.6, 0, 0, 0, true); B(g, '#bbf7d0', 0.7, 0.2, 1.4, 0, -0.32, 0);
    B(g, '#16a34a', 0.35, 0.35, 0.6, 0, 0.35, 0.95, true); B(g, '#16a34a', 0.45, 0.4, 0.55, 0, 0.55, 1.35, true);
    B(g, '#15803d', 0.4, 0.15, 0.3, 0, 0.42, 1.65); olhos(g, 0.2, 0.68, 1.5, 0.08, '#fde047');
    B(g, '#fef3c7', 0.08, 0.2, 0.08, 0.14, 0.85, 1.25); B(g, '#fef3c7', 0.08, 0.2, 0.08, -0.14, 0.85, 1.25);
    for (const z of [0.5, 0.1, -0.3]) B(g, '#ea580c', 0.08, 0.25, 0.2, 0, 0.45, z);
    B(g, '#16a34a', 0.3, 0.3, 1, 0, 0.05, -1.25, true); B(g, '#ea580c', 0.35, 0.05, 0.3, 0, 0.05, -1.8);
    const a1 = pivo(g, 0.45, 0.25, 0.1);
    const a2 = pivo(g, -0.45, 0.25, 0.1);
    B(a1, '#22c55e', 1.4, 0.05, 0.9, 0.7, 0, 0, true); B(a2, '#22c55e', 1.4, 0.05, 0.9, -0.7, 0, 0, true);
    g.userData.asas = [a1, a2];
  },
  galinha: (g) => {
    B(g, '#f8fafc', 0.5, 0.5, 0.6, 0, 0, 0, true); B(g, '#f8fafc', 0.3, 0.3, 0.3, 0, 0.35, 0.3, true);
    B(g, '#ef4444', 0.08, 0.15, 0.22, 0, 0.56, 0.3); B(g, '#facc15', 0.1, 0.08, 0.14, 0, 0.32, 0.5); B(g, '#ef4444', 0.06, 0.12, 0.06, 0, 0.2, 0.47);
    olhos(g, 0.15, 0.4, 0.4, 0.05); B(g, '#f8fafc', 0.3, 0.35, 0.15, 0, 0.25, -0.33, true);
    const p1 = pivo(g, 0.12, -0.25, 0);
    const p2 = pivo(g, -0.12, -0.25, 0);
    B(p1, '#f59e0b', 0.06, 0.3, 0.06, 0, -0.12, 0); B(p2, '#f59e0b', 0.06, 0.3, 0.06, 0, -0.12, 0);
    g.userData.pernas = [p1, p2];
  },
  porco: (g) => quadrupede(g, '#f9a8d4', '#f472b6', 0.7, { orelhas: '#f472b6', cauda: '#f472b6' }),
  vaca: (g) => quadrupede(g, '#f8fafc', '#f9a8d4', 1, { chifre: 'boi', manchas: true, cauda: '#111' }),
  cavalo: (g) => { quadrupede(g, '#92400e', '#78350f', 1, { orelhas: '#78350f', cauda: '#1c1917' }); B(g, '#1c1917', 0.12, 0.25, 0.7, 0, 0.75, 0.75); },
  unicornio: (g) => { quadrupede(g, '#f8fafc', '#f9a8d4', 1, { chifre: '#e879f9', orelhas: '#f8fafc', cauda: '#c084fc' }); B(g, '#c084fc', 0.12, 0.25, 0.7, 0, 0.75, 0.75); B(g, '#67e8f9', 0.13, 0.12, 0.4, 0, 0.85, 0.6); },
  cachorro: (g) => { quadrupede(g, '#a16207', '#111', 0.55, { orelhas: '#713f12', cauda: '#a16207' }); },
  gato: (g) => { quadrupede(g, '#fb923c', '#fda4af', 0.45, { orelhas: '#ea580c', cauda: '#fb923c' }); B(g, '#ea580c', 0.5, 0.05, 0.05, 0, 0.4, 0.2); },
  coelho: (g) => { quadrupede(g, '#e5e7eb', '#f9a8d4', 0.4); B(g, '#e5e7eb', 0.08, 0.45, 0.06, 0.07, 0.6, 0.42, true); B(g, '#e5e7eb', 0.08, 0.45, 0.06, -0.07, 0.6, 0.42, true); S(g, '#fff', 0.16, 0.16, 0.16, 0, 0.12, -0.38); },
  sapo: (g) => {
    B(g, '#22c55e', 0.55, 0.3, 0.6, 0, 0, 0, true); B(g, '#86efac', 0.45, 0.06, 0.5, 0, -0.16, 0.02);
    S(g, '#22c55e', 0.16, 0.16, 0.16, 0.14, 0.2, 0.22, true); S(g, '#22c55e', 0.16, 0.16, 0.16, -0.14, 0.2, 0.22, true);
    olhos(g, 0.14, 0.24, 0.29, 0.06); B(g, '#7f1d1d', 0.3, 0.03, 0.02, 0, -0.04, 0.3);
    const p1 = pivo(g, 0.25, -0.1, -0.15);
    const p2 = pivo(g, -0.25, -0.1, -0.15);
    B(p1, '#16a34a', 0.12, 0.12, 0.35, 0.05, -0.05, 0); B(p2, '#16a34a', 0.12, 0.12, 0.35, -0.05, -0.05, 0);
    g.userData.pernas = [p1, p2];
  },
  cobra: (g) => {
    const seg = [];
    for (let i = 0; i < 6; i++) {
      const p = pivo(g, 0, 0, 0.4 - i * 0.2);
      B(p, i % 2 ? '#65a30d' : '#4d7c0f', 0.2 - i * 0.015, 0.16, 0.22, 0, 0, 0, true);
      seg.push(p);
    }
    B(g, '#4d7c0f', 0.26, 0.18, 0.26, 0, 0.02, 0.6, true); olhos(g, 0.1, 0.1, 0.72, 0.05, '#facc15'); B(g, '#dc2626', 0.03, 0.02, 0.15, 0, 0, 0.8);
    g.userData.cobra = seg;
  },
  aranha: (g) => {
    S(g, '#111', 0.5, 0.4, 0.6, 0, 0, -0.1, true); S(g, '#1f2937', 0.3, 0.26, 0.3, 0, 0, 0.3, true);
    olhos(g, 0.06, 0.06, 0.45, 0.05, '#ef4444');
    const pernas = [];
    for (let i = 0; i < 4; i++) {
      for (const lado of [1, -1]) {
        const p = pivo(g, lado * 0.15, 0, 0.25 - i * 0.15);
        const b = B(p, '#111', 0.5, 0.04, 0.04, lado * 0.25, -0.1, 0);
        b.rotation.z = lado * -0.6;
        pernas.push(p);
      }
    }
    g.userData.pernas = pernas;
  },
  urso: (g) => quadrupede(g, '#78350f', '#a16207', 1.05, { orelhas: '#78350f' }),
  leao: (g) => { quadrupede(g, '#f59e0b', '#fbbf24', 0.9, { cauda: '#f59e0b' }); B(g, '#92400e', 0.8, 0.8, 0.3, 0, 0.45, 0.85); },
  elefante: (g) => {
    quadrupede(g, '#9ca3af', '#9ca3af', 1.4);
    B(g, '#9ca3af', 0.2, 0.8, 0.2, 0, -0.05, 2.05, true); B(g, '#d1d5db', 0.6, 0.6, 0.05, 0.5, 0.65, 1.45); B(g, '#d1d5db', 0.6, 0.6, 0.05, -0.5, 0.65, 1.45);
    B(g, '#f8fafc', 0.06, 0.06, 0.35, 0.18, 0.3, 2);
  },
  dinossauro: (g) => {
    B(g, '#16a34a', 0.9, 1.1, 1.2, 0, 0.3, 0, true); B(g, '#16a34a', 0.7, 0.6, 0.9, 0, 1.05, 0.75, true);
    B(g, '#f8fafc', 0.6, 0.06, 0.06, 0, 0.82, 1.18); olhos(g, 0.3, 1.2, 0.9, 0.09, '#fde047');
    B(g, '#16a34a', 0.45, 0.45, 1.3, 0, 0.35, -1.1, true); B(g, '#16a34a', 0.25, 0.25, 0.6, 0, 0.25, -1.9, true);
    B(g, '#15803d', 0.1, 0.35, 0.12, 0.42, 0.55, 0.55); B(g, '#15803d', 0.1, 0.35, 0.12, -0.42, 0.55, 0.55);
    const p1 = pivo(g, 0.28, -0.15, 0);
    const p2 = pivo(g, -0.28, -0.15, 0);
    B(p1, '#15803d', 0.32, 0.8, 0.4, 0, -0.35, 0); B(p2, '#15803d', 0.32, 0.8, 0.4, 0, -0.35, 0);
    g.userData.pernas = [p1, p2];
  },
  macaco: (g) => { bipede(g, '#92400e', '#d6a77a', '#78350f', 0.7); B(g, '#92400e', 0.08, 0.08, 0.6, 0, -0.05, -0.35); },
  pinguim: (g) => {
    S(g, '#111827', 0.55, 0.8, 0.5, 0, 0, 0, true); S(g, '#f8fafc', 0.4, 0.6, 0.3, 0, -0.05, 0.12);
    B(g, '#f59e0b', 0.12, 0.06, 0.16, 0, 0.25, 0.28); olhos(g, 0.1, 0.3, 0.22, 0.05);
    const p1 = pivo(g, 0.12, -0.38, 0.05);
    const p2 = pivo(g, -0.12, -0.38, 0.05);
    B(p1, '#f59e0b', 0.14, 0.05, 0.2, 0, 0, 0.05); B(p2, '#f59e0b', 0.14, 0.05, 0.2, 0, 0, 0.05);
    g.userData.pernas = [p1, p2];
  },
  zumbi: (g) => { bipede(g, '#1d4ed8', '#84cc16', '#44403c', 1, { bracosFrente: true }); B(g, '#7f1d1d', 0.2, 0.05, 0.02, 0, 1.08, 0.22); },
  robo: (g) => {
    bipede(g, '#9ca3af', '#cbd5e1', '#64748b', 1);
    B(g, '#475569', 0.03, 0.25, 0.03, 0, 1.45, 0); Bb(g, '#ef4444', 0.08, 0.08, 0.08, 0, 1.6, 0);
    Bb(g, '#38bdf8', 0.3, 0.08, 0.02, 0, 1.22, 0.22); Bb(g, '#22c55e', 0.2, 0.2, 0.02, 0, 0.65, 0.18);
  },
  bonecodeneve: (g) => {
    S(g, '#f8fafc', 0.8, 0.8, 0.8, 0, -0.3, 0, true); S(g, '#f8fafc', 0.6, 0.6, 0.6, 0, 0.32, 0, true); S(g, '#f8fafc', 0.45, 0.45, 0.45, 0, 0.8, 0, true);
    olhos(g, 0.08, 0.86, 0.2, 0.05); Co(g, '#fb923c', 0.08, 0.25, 0, 0.8, 0.3, false, PI / 2);
    Ci(g, '#111', 0.4, 0.05, 0, 1.02, 0); Ci(g, '#111', 0.26, 0.28, 0, 1.15, 0); B(g, '#dc2626', 0.5, 0.08, 0.5, 0, 0.6, 0);
  },
  tubarao: (g) => {
    B(g, '#64748b', 0.8, 0.8, 2, 0, 0, 0, true); B(g, '#e2e8f0', 0.72, 0.3, 1.8, 0, -0.3, 0);
    B(g, '#64748b', 0.12, 0.6, 0.5, 0, 0.65, -0.1, true); B(g, '#64748b', 0.12, 0.9, 0.4, 0, 0.1, -1.15, true);
    B(g, '#64748b', 0.9, 0.08, 0.35, 0.5, -0.2, 0.2, true); B(g, '#64748b', 0.9, 0.08, 0.35, -0.5, -0.2, 0.2, true);
    olhos(g, 0.4, 0.15, 0.75, 0.1); B(g, '#7f1d1d', 0.5, 0.12, 0.05, 0, -0.15, 1.0); B(g, '#fff', 0.5, 0.05, 0.06, 0, -0.09, 1.01);
  },
  golfinho: (g) => {
    B(g, '#60a5fa', 0.6, 0.6, 1.5, 0, 0, 0, true); B(g, '#dbeafe', 0.5, 0.25, 1.3, 0, -0.22, 0.05); B(g, '#60a5fa', 0.25, 0.2, 0.4, 0, -0.08, 0.9, true);
    B(g, '#60a5fa', 0.1, 0.4, 0.35, 0, 0.45, -0.1, true); B(g, '#60a5fa', 0.7, 0.08, 0.3, 0, 0, -0.9, true); olhos(g, 0.3, 0.1, 0.55, 0.07);
  },
  baleia: (g) => {
    B(g, '#1e3a8a', 1.6, 1.4, 3, 0, 0, 0, true); B(g, '#e2e8f0', 1.4, 0.4, 2.6, 0, -0.6, 0.1); olhos(g, 0.78, 0.1, 1, 0.14);
    B(g, '#1e3a8a', 1.8, 0.12, 0.6, 0, 0.1, -1.8, true); Bb(g, '#bfdbfe', 0.15, 0.5, 0.15, 0, 0.95, 0.6);
  },
  peixe: (g) => { B(g, '#fb923c', 0.25, 0.4, 0.6, 0, 0, 0, true); B(g, '#fb923c', 0.08, 0.4, 0.25, 0, 0, -0.4, true); B(g, '#111', 0.27, 0.06, 0.06, 0, 0.08, 0.2); },
  polvo: (g) => {
    S(g, '#a855f7', 0.6, 0.6, 0.6, 0, 0.15, 0, true); olhos(g, 0.15, 0.2, 0.28, 0.08);
    const pernas = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; const p = pivo(g, Math.cos(a) * 0.2, -0.1, Math.sin(a) * 0.2); B(p, '#9333ea', 0.09, 0.45, 0.09, 0, -0.2, 0, true); pernas.push(p); }
    g.userData.pernas = pernas;
  },

  // comida
  melancia: (g) => { S(g, '#15803d', 0.8, 0.7, 1, 0, 0, 0, true); S(g, '#166534', 0.82, 0.72, 0.25, 0, 0, 0.2); S(g, '#166534', 0.82, 0.72, 0.25, 0, 0, -0.2); },
  banana: (g) => { const a = B(g, '#facc15', 0.1, 0.1, 0.25, 0, 0, 0, true); const b = B(g, '#facc15', 0.1, 0.1, 0.22, 0, 0.05, 0.2, true); b.rotation.x = -0.5; const c = B(g, '#facc15', 0.1, 0.1, 0.22, 0, 0.05, -0.2, true); c.rotation.x = 0.5; B(g, '#422006', 0.05, 0.05, 0.06, 0, 0.12, 0.32); void a; },
  maca: (g) => { S(g, '#dc2626', 0.4, 0.38, 0.4, 0, 0, 0, true); B(g, '#422006', 0.03, 0.12, 0.03, 0, 0.24, 0); B(g, '#16a34a', 0.1, 0.02, 0.06, 0.05, 0.27, 0); },
  tomate: (g) => { S(g, '#ef4444', 0.42, 0.34, 0.42, 0, 0, 0, true); B(g, '#16a34a', 0.2, 0.03, 0.2, 0, 0.17, 0); },
  abacaxi: (g) => { S(g, '#eab308', 0.45, 0.6, 0.45, 0, 0, 0, true); for (let i = 0; i < 4; i++) { const f = B(g, '#16a34a', 0.06, 0.35, 0.12, 0, 0.4, 0); f.rotation.set(0.3 * Math.cos(i * 1.57), i * 0.8, 0.3 * Math.sin(i * 1.57)); } },
  pizza: (g) => { Ci(g, '#f59e0b', 0.75, 0.05, 0, 0, 0, true); Ci(g, '#fde047', 0.65, 0.06, 0, 0.005, 0); for (const [x, z] of [[0.15, 0.1], [-0.15, 0.12], [0.05, -0.18], [-0.12, -0.08], [0.2, -0.1]]) Ci(g, '#b91c1c', 0.12, 0.07, x, 0.01, z); },
  hamburguer: (g) => { S(g, '#d97706', 0.55, 0.25, 0.55, 0, 0.14, 0, true); Ci(g, '#4ade80', 0.58, 0.03, 0, 0.02, 0); Ci(g, '#facc15', 0.56, 0.03, 0, -0.01, 0); Ci(g, '#78350f', 0.54, 0.09, 0, -0.07, 0); Ci(g, '#d97706', 0.52, 0.08, 0, -0.15, 0, true); },
  bolo: (g) => { Ci(g, '#f9a8d4', 0.7, 0.35, 0, 0, 0, true); Ci(g, '#fdf2f8', 0.72, 0.06, 0, 0.18, 0); B(g, '#60a5fa', 0.04, 0.16, 0.04, 0, 0.29, 0); Bb(g, '#fde047', 0.05, 0.06, 0.05, 0, 0.4, 0); S(g, '#dc2626', 0.1, 0.1, 0.1, 0.18, 0.22, 0.1); },
  sorvete: (g) => { Co(g, '#d6a77a', 0.28, 0.45, 0, -0.15, 0, true, PI); S(g, '#f9a8d4', 0.32, 0.3, 0.32, 0, 0.15, 0, true); S(g, '#a16207', 0.26, 0.22, 0.26, 0, 0.32, 0); S(g, '#dc2626', 0.08, 0.08, 0.08, 0, 0.45, 0); },
  rosquinha: (g) => { const t = T(g, '#d97706', 0.7, 0, 0, 0, true); t.rotation.x = PI / 2; const c = T(g, '#f472b6', 0.72, 0, 0.03, 0); c.rotation.x = PI / 2; c.scale.y = 0.5; },
  cenoura: (g) => { Co(g, '#fb923c', 0.16, 0.6, 0, 0, 0, true, PI / 2); for (const r of [-0.4, 0, 0.4]) { const f = B(g, '#16a34a', 0.03, 0.03, 0.2, 0, 0, -0.38); f.rotation.y = r; } },
  queijo: (g) => { B(g, '#facc15', 0.5, 0.3, 0.4, 0, 0, 0, true); for (const [x, y] of [[0.1, 0.05], [-0.12, -0.05], [0.02, -0.08]]) S(g, '#ca8a04', 0.08, 0.08, 0.02, x, y, 0.2); },
  ovo: (g) => S(g, '#fef3c7', 0.36, 0.48, 0.36, 0, 0, 0, true),
  coco: (g) => { S(g, '#78350f', 0.42, 0.18, 0.42, 0, -0.1, 0, true); S(g, '#78350f', 0.32, 0.16, 0.32, 0, 0.02, 0, true); S(g, '#78350f', 0.2, 0.14, 0.2, 0, 0.12, 0, true); Co(g, '#78350f', 0.1, 0.12, 0, 0.21, 0, true); olhos(g, 0.06, 0.05, 0.15, 0.04, '#fff'); },

  // objetos
  bola: (g) => { S(g, '#ef4444', 0.7, 0.7, 0.7, 0, 0, 0, true); S(g, '#f8fafc', 0.72, 0.18, 0.72); },
  pedra: (g) => peca(g, GEO_DOD, '#78716c', 0.6, 0.5, 0.6, 0, 0, 0, true),
  caixa: (g) => { B(g, '#a16207', 0.7, 0.7, 0.7, 0, 0, 0, true); B(g, '#713f12', 0.72, 0.1, 0.72, 0, 0.3, 0); B(g, '#713f12', 0.72, 0.1, 0.72, 0, -0.3, 0); },
  tijolo: (g) => B(g, '#b91c1c', 0.4, 0.2, 0.2, 0, 0, 0, true),
  bigorna: (g) => { B(g, '#374151', 0.7, 0.2, 0.3, 0, 0.2, 0, true); B(g, '#374151', 0.3, 0.3, 0.2, 0, 0, 0, true); B(g, '#4b5563', 0.55, 0.15, 0.35, 0, -0.2, 0); Co(g, '#374151', 0.2, 0.3, 0.45, 0.2, 0, true, 0); },
  piano: (g) => {
    B(g, '#111', 1.4, 0.9, 0.6, 0, 0.1, 0, true); B(g, '#f8fafc', 1.3, 0.06, 0.22, 0, -0.05, 0.38);
    for (let i = 0; i < 9; i++) B(g, '#111', 0.06, 0.07, 0.12, -0.55 + i * 0.14, -0.02, 0.42);
    for (const x of [-0.6, 0.6]) B(g, '#111', 0.1, 0.5, 0.1, x, -0.55, 0.3);
  },
  privada: (g) => { Ci(g, '#f8fafc', 0.5, 0.35, 0, -0.1, 0.1, true); Ci(g, '#e2e8f0', 0.52, 0.04, 0, 0.1, 0.1); B(g, '#f8fafc', 0.5, 0.45, 0.2, 0, 0.2, -0.22, true); B(g, '#9ca3af', 0.08, 0.04, 0.04, 0.18, 0.4, -0.12); },
  geladeira: (g) => { B(g, '#f1f5f9', 0.7, 1.3, 0.6, 0, 0, 0, true); B(g, '#cbd5e1', 0.72, 0.03, 0.62, 0, 0.25, 0); B(g, '#94a3b8', 0.04, 0.3, 0.04, 0.28, 0.5, 0.31); B(g, '#94a3b8', 0.04, 0.3, 0.04, 0.28, -0.1, 0.31); },
  pneu: (g) => { const t = T(g, '#111827', 1.05, 0, 0, 0, true); t.rotation.y = PI / 2; Ci(g, '#9ca3af', 0.38, 0.2, 0, 0, 0, false, 'x'); },
  moeda: (g) => { Ci(g, '#eab308', 0.3, 0.04, 0, 0, 0, true, 'z'); B(g, '#ca8a04', 0.08, 0.14, 0.05, 0, 0, 0); },
  diamante: (g) => O(g, '#67e8f9', 0.3, 0.42, 0.3, 0, 0, 0, true, 't'),
  faca: (g) => { B(g, '#cbd5e1', 0.03, 0.08, 0.35, 0, 0, 0.08, true); B(g, '#3f2a14', 0.05, 0.07, 0.18, 0, 0, -0.18); B(g, '#57534e', 0.06, 0.14, 0.03, 0, 0, -0.08); },
  shuriken: (g) => { B(g, '#6b7280', 0.42, 0.03, 0.1, 0, 0, 0, true); B(g, '#6b7280', 0.1, 0.03, 0.42, 0, 0, 0, true); const a = B(g, '#9ca3af', 0.3, 0.035, 0.08, 0, 0, 0); a.rotation.y = PI / 4; const b = B(g, '#9ca3af', 0.08, 0.035, 0.3, 0, 0, 0); b.rotation.y = PI / 4; Ci(g, '#111', 0.06, 0.05, 0, 0, 0); },
  machado: (g) => { B(g, '#92400e', 0.06, 0.6, 0.06, 0, 0, 0, true); B(g, '#9ca3af', 0.05, 0.22, 0.25, 0, 0.22, 0.12); },
  espada: (g) => { B(g, '#e2e8f0', 0.04, 0.7, 0.1, 0, 0.2, 0, true); B(g, '#ca8a04', 0.04, 0.05, 0.3, 0, -0.17, 0); B(g, '#3f2a14', 0.05, 0.2, 0.06, 0, -0.3, 0); },
  arpao: (g) => { B(g, '#92400e', 0.04, 0.04, 1.1, 0, 0, 0, true); Co(g, '#9ca3af', 0.08, 0.2, 0, 0, 0.62, false, PI / 2); },
  bumerangue: (g) => { const a = B(g, '#b45309', 0.4, 0.04, 0.08, 0.14, 0, 0, true); a.rotation.y = 0.5; const b = B(g, '#b45309', 0.4, 0.04, 0.08, -0.14, 0, 0, true); b.rotation.y = -0.5; },
  boladeneve: (g) => S(g, '#f8fafc', 0.4, 0.4, 0.4, 0, 0, 0, true),

  // veículos
  carro: (g) => {
    B(g, '#dc2626', 1.1, 0.4, 1.9, 0, 0, 0, true); B(g, '#dc2626', 0.95, 0.4, 0.95, 0, 0.38, -0.1, true); B(g, '#bae6fd', 0.9, 0.3, 0.02, 0, 0.38, 0.38);
    Bb(g, '#fef9c3', 0.2, 0.1, 0.02, 0.35, 0, 0.96); Bb(g, '#fef9c3', 0.2, 0.1, 0.02, -0.35, 0, 0.96);
    const rodas = [];
    for (const [x, z] of [[0.55, 0.6], [-0.55, 0.6], [0.55, -0.6], [-0.55, -0.6]]) { const p = pivo(g, x, -0.22, z); Ci(p, '#111', 0.4, 0.18, 0, 0, 0, false, 'x'); rodas.push(p); }
    g.userData.rodas = rodas;
  },
  tanque: (g) => {
    B(g, '#4d7c0f', 1.3, 0.5, 2, 0, 0, 0, true); B(g, '#1c1917', 0.3, 0.45, 2.1, 0.65, -0.1, 0); B(g, '#1c1917', 0.3, 0.45, 2.1, -0.65, -0.1, 0);
    B(g, '#3f6212', 0.8, 0.35, 0.9, 0, 0.42, -0.1, true); Ci(g, '#1c1917', 0.14, 1.1, 0, 0.45, 0.8, false, 'z');
  },
  aviao: (g) => {
    B(g, '#e2e8f0', 0.4, 0.4, 2, 0, 0, 0, true); Co(g, '#e2e8f0', 0.4, 0.4, 0, 0, 1.2, true, PI / 2); B(g, '#bae6fd', 0.3, 0.12, 0.3, 0, 0.18, 0.7);
    B(g, '#3b82f6', 2.2, 0.06, 0.55, 0, 0, 0.1); B(g, '#3b82f6', 0.8, 0.05, 0.3, 0, 0.05, -0.85); B(g, '#3b82f6', 0.05, 0.45, 0.35, 0, 0.3, -0.85);
  },
  helicoptero: (g) => {
    S(g, '#16a34a', 0.9, 0.8, 1.2, 0, 0, 0.1, true); S(g, '#bae6fd', 0.6, 0.5, 0.5, 0, 0.05, 0.5); B(g, '#16a34a', 0.15, 0.15, 1.3, 0, 0.1, -1, true);
    B(g, '#111', 0.04, 0.5, 0.15, 0.08, 0.15, -1.6); B(g, '#111', 0.06, 0.3, 0.06, 0, 0.5, 0.1);
    B(g, '#111', 0.04, 0.05, 1, 0.3, -0.45, 0.1); B(g, '#111', 0.04, 0.05, 1, -0.3, -0.45, 0.1);
    const r = pivo(g, 0, 0.65, 0.1); B(r, '#1f2937', 2.4, 0.03, 0.14); B(r, '#1f2937', 0.14, 0.03, 2.4);
    g.userData.rotor = r; g.userData.rotorEixo = 'y';
  },
  ovni: (g) => {
    Ci(g, '#9ca3af', 1.6, 0.2, 0, 0, 0, true); Ci(g, '#6b7280', 1.1, 0.12, 0, -0.14, 0); St(g, '#67e8f9', 0.7, 0.5, 0.7, 0, 0.18, 0);
    S(g, '#84cc16', 0.25, 0.3, 0.25, 0, 0.15, 0); olhos(g, 0.05, 0.22, 0.1, 0.04);
    const r = pivo(g, 0, 0, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; Bb(r, i % 2 ? '#fde047' : '#f472b6', 0.1, 0.06, 0.1, Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78); }
    g.userData.rotor = r; g.userData.rotorEixo = 'y';
  },

  // magia e natureza
  estrela: (g) => { O(g, '#fde047', 0.45, 0.45, 0.12, 0, 0, 0, true, 'b'); const o = O(g, '#facc15', 0.45, 0.45, 0.12, 0, 0, 0, false, 'b'); o.rotation.z = PI / 4; },
  relampago: (g) => { const a = Bb(g, '#fde047', 0.08, 0.08, 0.5, 0.05, 0, 0.35); a.rotation.y = 0.4; const b = Bb(g, '#fef08a', 0.08, 0.08, 0.5, -0.05, 0, 0); b.rotation.y = -0.4; const c = Bb(g, '#fde047', 0.08, 0.08, 0.5, 0.05, 0, -0.35); c.rotation.y = 0.4; },
  fogo: (g) => { Bb(g, '#fb923c', 0.35, 0.35, 0.35); Bb(g, '#fde047', 0.2, 0.2, 0.2, 0, 0, 0.08); },
  gota: (g) => St(g, '#60a5fa', 0.18, 0.24, 0.18),
  confete: (g) => B(g, '#f472b6', 0.14, 0.02, 0.1, 0, 0, 0, true),
  meteoro: (g) => { peca(g, GEO_DOD, '#57534e', 1.1, 1, 1.1, 0, 0, 0, true); Bb(g, '#f97316', 0.6, 0.6, 0.8, 0, 0, -0.45); Bb(g, '#fde047', 0.3, 0.3, 0.5, 0, 0, -0.5); },
  nuvem: (g) => { for (const [x, y, z, s] of [[0, 0, 0, 1.1], [0.6, -0.05, 0.1, 0.8], [-0.6, -0.05, -0.1, 0.8], [0.2, 0.3, -0.2, 0.7], [-0.25, 0.25, 0.25, 0.65]]) S(g, '#f1f5f9', s * 1.2, s * 0.8, s, x, y, z, true); },
  bolha: (g) => { St(g, '#bae6fd', 0.6, 0.6, 0.6); Bb(g, '#ffffff', 0.08, 0.08, 0.02, 0.12, 0.14, 0.28); },
  balao: (g) => { S(g, '#ef4444', 0.7, 0.85, 0.7, 0, 0.2, 0, true); Co(g, '#b91c1c', 0.12, 0.1, 0, -0.28, 0, true, PI); B(g, '#f8fafc', 0.01, 0.7, 0.01, 0, -0.65, 0); },
  fogos: (g) => { Ci(g, '#dc2626', 0.16, 0.6, 0, 0, 0, true, 'z'); Co(g, '#facc15', 0.18, 0.2, 0, 0, 0.4, false, PI / 2); B(g, '#a16207', 0.02, 0.02, 0.6, 0.1, 0, -0.4); Bb(g, '#fb923c', 0.1, 0.1, 0.15, 0, 0, -0.35); },
  buraconegro: (g) => {
    S(g, '#020617', 0.9, 0.9, 0.9, 0, 0, 0, true);
    const r = pivo(g, 0, 0, 0);
    const t = peca(r, GEO_TORO, '#a855f7', 1.8, 1.8, 0.6, 0, 0, 0, false, 'b'); t.rotation.x = PI / 2;
    const t2 = peca(r, GEO_TORO, '#e879f9', 1.4, 1.4, 0.4, 0, 0, 0, false, 'b'); t2.rotation.x = PI / 2.3;
    g.userData.rotor = r; g.userData.rotorEixo = 'y';
  },
  tornado: (g) => {
    const r = pivo(g, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const m = peca(r, GEO_CIL, '#94a3b8', 0.4 + i * 0.3, 0.32, 0.4 + i * 0.3, (i % 2 ? 0.08 : -0.08), -0.9 + i * 0.34, 0, true, 't'); m.rotation.y = i; }
    g.userData.rotor = r; g.userData.rotorEixo = 'y'; g.userData.rotorVel = 9;
  },
  fantasma: (g) => {
    St(g, '#f8fafc', 0.8, 0.9, 0.8, 0, 0.2, 0);
    for (const x of [-0.25, 0, 0.25]) peca(g, GEO_CONE, '#f8fafc', 0.3, 0.35, 0.3, x, -0.35, 0, true, 't').rotation.x = PI;
    B(g, '#111', 0.12, 0.18, 0.05, 0.14, 0.3, 0.38); B(g, '#111', 0.12, 0.18, 0.05, -0.14, 0.3, 0.38); B(g, '#111', 0.15, 0.12, 0.05, 0, 0.05, 0.4);
  },
};

// ------------------------------------------------------------------ montagem
export function corPrincipal(n) {
  const c = n.cor || n.d.cor || null;
  if (c === 'arcoiris') return `#${new THREE.Color().setHSL(R(), 0.85, 0.55).getHexString()}`;
  return c;
}
export function construirModelo(n) {
  const g = new THREE.Group();
  (MODELOS[n.d.modelo] || MODELOS.caixa)(g);
  const cor = corPrincipal(n);
  const transp = n.transp || n.d.transp;
  const brilho = n.brilho;
  if (cor || transp || brilho) {
    g.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.isMeshBasicMaterial && !brilho) return;
      const c = o.userData.principal && cor ? cor : `#${m.color.getHexString()}`;
      if (brilho && o.userData.principal) o.material = mat(c, 'b');
      else if (transp) o.material = mat(c, 't');
      else if (o.userData.principal && cor) o.material = mat(c, m.transparent ? 't' : 'l');
    });
  }
  g.scale.setScalar(n.escala);
  return g;
}
const corPadrao = new Map();
export function corDe(n) {
  if (n.d.suco) return n.d.suco;
  const c = corPrincipal(n);
  if (c) return c;
  if (!corPadrao.has(n.d.modelo)) {
    const g = new THREE.Group();
    (MODELOS[n.d.modelo] || MODELOS.caixa)(g);
    let achou = '#ffffff';
    g.traverse((o) => { if (achou === '#ffffff' && o.isMesh && o.userData.principal) achou = `#${o.material.color.getHexString()}`; });
    corPadrao.set(n.d.modelo, achou);
  }
  return corPadrao.get(n.d.modelo);
}
// o modelo da criação para segurar: a arma com o que ela atira na boca do cano
export function modeloNaMao(raiz, tam) {
  const g = new THREE.Group();
  const s = Math.min(raiz.escala, 1.8) * tam;
  const a = construirModelo(raiz);
  a.scale.setScalar(s);
  g.add(a);
  const ponta = new THREE.Object3D();
  ponta.position.copy(a.userData.ponta || new V3(0, 0, 0.5)).multiplyScalar(s);
  g.add(ponta);
  const f = projetilDe(raiz);
  const mini = construirModelo(f);
  const caixa = new THREE.Box3().setFromObject(mini);
  const tamMini = Math.max(0.01, caixa.getSize(new V3()).length());
  mini.scale.multiplyScalar(((raiz.c === 'mao' ? 0.45 : 0.22) * tam) / tamMini * 1.4);
  mini.position.copy(ponta.position);
  if (raiz.c !== 'mao') mini.position.z += 0.08 * tam;
  g.add(mini);
  g.userData.ponta = ponta;
  g.userData.mini = mini;
  g.userData.armaModelo = a;
  return g;
}
