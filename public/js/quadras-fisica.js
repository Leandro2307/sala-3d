// Vôlei, basquete e boliche: onde fica cada quadra e a física das bolas. Sem three.js, para rodar
// igual no navegador (bola prevista, pinos animados) e no servidor (que manda no placar).
// Coordenadas do mundo: as três lado a lado no eixo x, onde o mapa da sala põe (mapas-dados.js; no
// servidor este módulo é carregado uma vez por mapa, com ?mapa= no endereço).
import { deslocamento, mapaDoModulo } from './mapas-dados.js';

const D = deslocamento(mapaDoModulo(import.meta.url), 'quadras');

// ------------------------------------------------------------------ vôlei
// Quadra de 18 x 9 m na areia, rede no meio (x = cx). Lado 0: x < cx; lado 1: x > cx.
export const VOLEI = {
  cx: -20 + D.dx, cz: 196 + D.dz,
  comp: 18, larg: 9,
  rede: { altura: 2.35, base: 0.9 }, // a rede vai de 0,9 m até 2,35 m (embaixo passa a bola)
  raio: 0.4, // a bola é maior que a de verdade: dá para ver de longe
  gravidade: 7, // flutua um pouco: dá tempo de chegar nela
  pontos: 15, // e 2 de diferença
};

// um passo da bola do vôlei. Devolve 'chao' quando encosta no chão.
export function passoVolei(b, dt) {
  const { p, v } = b;
  const r = VOLEI.raio;
  v.y -= VOLEI.gravidade * dt;
  const xAntes = p.x;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  // a rede: atravessou o plano dela na altura da rede (dentro da largura) -> volta
  const naRede = Math.abs(p.z - VOLEI.cz) < VOLEI.larg / 2 + 0.6 && p.y > VOLEI.rede.base - r && p.y < VOLEI.rede.altura + r * 0.3;
  if (naRede && Math.sign(xAntes - VOLEI.cx) !== Math.sign(p.x - VOLEI.cx)) {
    const lado = Math.sign(xAntes - VOLEI.cx) || 1;
    p.x = VOLEI.cx + lado * r;
    v.x = -v.x * 0.3;
    v.z *= 0.6;
  }
  if (p.y <= r) {
    p.y = r;
    return 'chao';
  }
  return null;
}

export function andarVolei(b, dt) {
  const n = Math.min(24, Math.ceil(dt * 120));
  for (let i = 0; i < n; i++) if (passoVolei(b, dt / n) === 'chao') return 'chao';
  return null;
}

export const ladoVolei = (x) => (x < VOLEI.cx ? 0 : 1);
export const dentroVolei = (p) => Math.abs(p.x - VOLEI.cx) <= VOLEI.comp / 2 + VOLEI.raio && Math.abs(p.z - VOLEI.cz) <= VOLEI.larg / 2 + VOLEI.raio;
// onde a bola espera o saque, do lado de quem saca
export const saqueVolei = (lado) => ({ x: VOLEI.cx + (lado === 0 ? -1 : 1) * (VOLEI.comp / 2 - 1.5), y: 2.2, z: VOLEI.cz });

// ------------------------------------------------------------------ basquete
// Quadra de 28 x 15 m, uma cesta em cada ponta (aro a 3,05 m).
export const BASQUETE = {
  cx: 22 + D.dx, cz: 196 + D.dz,
  comp: 28, larg: 15,
  aro: { altura: 3.05, raio: 0.34, dist: 12.4 }, // centro do aro a 12,4 m do meio
  tabela: { dist: 12.85, larg: 1.8, alt: 1.05, base: 2.9 },
  raio: 0.2,
  gravidade: 9.8,
  tres: 6.75, // de onde a cesta vale 3
};
export const aroBasquete = (i) => ({ x: BASQUETE.cx + (i === 0 ? -1 : 1) * BASQUETE.aro.dist, y: BASQUETE.aro.altura, z: BASQUETE.cz });
const ARO_PONTOS = 16;

// um passo da bola solta. Devolve { cesta: i } quando ela desce por dentro do aro i.
export function passoBasquete(b, dt) {
  const { p, v } = b;
  const r = BASQUETE.raio;
  const yAntes = p.y;
  v.y -= BASQUETE.gravidade * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  let cesta = null;
  for (let i = 0; i < 2; i++) {
    const a = aroBasquete(i);
    const s = i === 0 ? -1 : 1;
    // tabela: um retângulo de pé, de frente para a quadra
    const xt = BASQUETE.cx + s * BASQUETE.tabela.dist;
    const T = BASQUETE.tabela;
    if (Math.abs(p.z - a.z) < T.larg / 2 && p.y > T.base - r && p.y < T.base + T.alt + r) {
      const pen = s * (p.x - xt) + r;
      if (pen > 0 && pen < r * 2.5) {
        p.x -= s * pen;
        if (s * v.x > 0) v.x = -v.x * 0.6;
      }
    }
    // o aro: um anel de pontinhos
    for (let k = 0; k < ARO_PONTOS; k++) {
      const ang = (k / ARO_PONTOS) * Math.PI * 2;
      const qx = a.x + Math.cos(ang) * BASQUETE.aro.raio;
      const qz = a.z + Math.sin(ang) * BASQUETE.aro.raio;
      const dx = p.x - qx;
      const dy = p.y - a.y;
      const dz = p.z - qz;
      const d = Math.hypot(dx, dy, dz);
      const lim = r + 0.02;
      if (d >= lim || d < 1e-6) continue;
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      p.x += nx * (lim - d);
      p.y += ny * (lim - d);
      p.z += nz * (lim - d);
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn < 0) {
        v.x -= 1.6 * vn * nx;
        v.y -= 1.6 * vn * ny;
        v.z -= 1.6 * vn * nz;
      }
    }
    // desceu pelo plano do aro, por dentro dele
    if (yAntes >= a.y && p.y < a.y && v.y < 0 && Math.hypot(p.x - a.x, p.z - a.z) < BASQUETE.aro.raio - r * 0.4) cesta = i;
  }
  // chão
  if (p.y < r) {
    p.y = r;
    if (v.y < 0) v.y = -v.y * 0.72;
    if (Math.abs(v.y) < 0.6) v.y = 0;
    v.x *= 0.985;
    v.z *= 0.985;
  }
  return cesta === null ? null : { cesta };
}

export function andarBasquete(b, dt) {
  const n = Math.min(32, Math.ceil(dt * 240));
  let r = null;
  for (let i = 0; i < n; i++) r = passoBasquete(b, dt / n) || r;
  return r;
}

// Velocidade de saída para cair no aro, num ângulo fixo (55°: entra mais de cima, sem raspar no aro da frente): devolve o módulo (ou null, perto
// demais/alto demais). d: distância no chão; h: altura do aro acima da mão.
export const ANGULO_ARREMESSO = (55 * Math.PI) / 180;
export function forcaIdeal(d, h, ang = ANGULO_ARREMESSO) {
  const c = Math.cos(ang);
  const den = 2 * c * c * (d * Math.tan(ang) - h);
  if (den <= 0) return null;
  return Math.sqrt((BASQUETE.gravidade * d * d) / den);
}

// ------------------------------------------------------------------ boliche
// Duas pistas no eixo x: a linha de falta em x0, os pinos lá na frente. Tudo um pouco maior
// que o de verdade (fator K), para dar para ver da sala.
const K = 1.4;
export const BOLICHE = {
  x0: 54 + D.dx, // linha de falta
  pistas: [193.5 + D.dz, 198.5 + D.dz], // z do meio de cada pista
  comprimento: 16, // da linha de falta ao pino da frente
  largura: 1.05 * K,
  canaleta: 0.25 * K,
  pino: { raio: 0.06 * K, altura: 0.38 * K, espaco: 0.3048 * K },
  bola: { raio: 0.11 * K, min: 6, max: 11 }, // velocidade de saída, m/s
  maxJogadores: 4,
};
// os 10 pinos, no sistema da pista: u ao longo (0 = linha de falta), w de lado
export const PINOS = (() => {
  const lista = [];
  const dRow = BOLICHE.pino.espaco * Math.sin(Math.PI / 3);
  for (let fila = 0; fila < 4; fila++) {
    for (let i = 0; i <= fila; i++) lista.push({ u: BOLICHE.comprimento + fila * dRow, w: (i - fila / 2) * BOLICHE.pino.espaco });
  }
  return lista;
})();
const DEITADO = BOLICHE.pino.altura * 0.08; // quanto um pino deitado alcança a mais
const FIM_DO_DECK = BOLICHE.comprimento + 3 * BOLICHE.pino.espaco + 0.6;

// Simula uma bola: lance { w, vu, vw } (onde ela sai no lado, velocidade ao longo e de lado),
// emPe: os pinos de pé antes (bool[10]). Determinístico: o servidor e os navegadores chegam no
// mesmo resultado. quadro(t, bola, pinos): chamado a cada 1/60 s, para animar (opcional).
// Devolve os pinos que continuam de pé.
export function simularBoliche(lance, emPe, quadro = null) {
  const B = BOLICHE;
  const rb = B.bola.raio;
  const rp = B.pino.raio;
  const meia = B.largura / 2;
  const bola = { u: 0, w: lance.w, vu: lance.vu, vw: lance.vw, canaleta: false, fora: false };
  const pinos = PINOS.map((p, i) => ({ u: p.u, w: p.w, vu: 0, vw: 0, emPe: !!emPe[i], caiu: false, ativo: !!emPe[i], tomb: 0, dir: 0 }));
  const dt = 1 / 240;
  let t = 0;
  let quieto = 0;
  for (let passo = 0; passo < 240 * 7; passo++) {
    t += dt;
    // bola
    if (!bola.fora) {
      bola.u += bola.vu * dt;
      bola.w += bola.vw * dt;
      if (!bola.canaleta && Math.abs(bola.w) > meia - rb * 0.3) {
        bola.canaleta = true; // caiu na canaleta: vai reto até o fim, sem pegar pino
        bola.w = Math.sign(bola.w) * (meia + B.canaleta / 2);
        bola.vw = 0;
      }
      if (bola.u > FIM_DO_DECK + 0.5) bola.fora = true;
    }
    // pinos deslizando (os caídos rolam e param)
    for (const p of pinos) {
      if (!p.ativo) continue;
      p.u += p.vu * dt;
      p.w += p.vw * dt;
      const v = Math.hypot(p.vu, p.vw);
      if (v > 0) {
        const k = Math.max(0, v - 2.5 * dt) / v;
        p.vu *= k;
        p.vw *= k;
      }
      if (p.caiu) p.tomb = Math.min(1, p.tomb + dt * 4);
      // saiu do deck (pelo fundo ou pelos lados): some
      if (p.u > FIM_DO_DECK || Math.abs(p.w) > meia + B.canaleta) {
        p.ativo = false;
        p.emPe = false;
        p.caiu = true;
      }
    }
    // batidas: bola x pino
    if (!bola.canaleta && !bola.fora) {
      for (const p of pinos) {
        if (!p.ativo) continue;
        bater(bola, p, rb + rp, 7, 1.5);
      }
    }
    // pino x pino
    for (let i = 0; i < pinos.length; i++) {
      const a = pinos[i];
      if (!a.ativo) continue;
      for (let j = i + 1; j < pinos.length; j++) {
        const b = pinos[j];
        if (!b.ativo) continue;
        // pino caído está deitado: varre bem mais que o de pé
        bater(a, b, rp * 2 + (a.caiu ? DEITADO : 0) + (b.caiu ? DEITADO : 0), 1.5, 1.5);
      }
    }
    // quem levou pancada cai
    for (const p of pinos) {
      if (p.emPe && Math.hypot(p.vu, p.vw) > 0.25) {
        p.emPe = false;
        p.caiu = true;
        p.dir = Math.atan2(p.vw, p.vu);
      }
    }
    if (quadro && passo % 4 === 0) quadro(t, bola, pinos);
    // acabou: bola no fundo e nada mais se mexendo
    const mexendo = pinos.some((p) => p.ativo && Math.hypot(p.vu, p.vw) > 0.05);
    quieto = bola.fora && !mexendo ? quieto + dt : 0;
    if (quieto > 0.4) break;
  }
  if (quadro) quadro(t, bola, pinos);
  return pinos.map((p) => p.emPe);
}

// choque de dois discos (a: m1, b: m2), elástico pela metade
function bater(a, b, dist, m1, m2) {
  const du = b.u - a.u;
  const dw = b.w - a.w;
  const d = Math.hypot(du, dw);
  if (d >= dist || d < 1e-9) return;
  const nu = du / d;
  const nw = dw / d;
  // separa
  const pen = dist - d;
  const ka = m2 / (m1 + m2);
  const kb = m1 / (m1 + m2);
  a.u -= nu * pen * ka;
  a.w -= nw * pen * ka;
  b.u += nu * pen * kb;
  b.w += nw * pen * kb;
  const rel = (a.vu - b.vu) * nu + (a.vw - b.vw) * nw;
  if (rel <= 0) return;
  const j = (1.6 * rel) / (1 / m1 + 1 / m2);
  a.vu -= (j / m1) * nu;
  a.vw -= (j / m1) * nw;
  b.vu += (j / m2) * nu;
  b.vw += (j / m2) * nw;
  if ('emPe' in b && b.emPe) b.dir = Math.atan2(b.vw, b.vu);
}

// Placar do boliche: rolls (pinos derrubados em cada bola, na ordem) -> o total de cada quadro
// já fechado (até 10). Strike: 10 + as 2 bolas seguintes; spare: 10 + a seguinte.
export function quadrosBoliche(rolls) {
  const total = [];
  let i = 0;
  let soma = 0;
  for (let q = 0; q < 10; q++) {
    if (rolls[i] === undefined) break;
    if (rolls[i] === 10) {
      if (rolls[i + 2] === undefined) break;
      soma += 10 + rolls[i + 1] + rolls[i + 2];
      i += 1;
    } else {
      if (rolls[i + 1] === undefined) break;
      if (rolls[i] + rolls[i + 1] === 10) {
        if (rolls[i + 2] === undefined) break;
        soma += 10 + rolls[i + 2];
      } else soma += rolls[i] + rolls[i + 1];
      i += 2;
    }
    total.push(soma);
  }
  return total;
}

// Em que quadro e bola o jogador está: { quadro (0..9), bola (0..2), fim, reposicao } — reposicao:
// os pinos voltam todos antes desta bola (começo de quadro, ou no 10º depois de strike/spare).
export function vezBoliche(rolls) {
  let i = 0;
  for (let q = 0; q < 9; q++) {
    if (rolls[i] === undefined) return { quadro: q, bola: 0, fim: false, reposicao: true };
    if (rolls[i] === 10) {
      i += 1;
      continue;
    }
    if (rolls[i + 1] === undefined) return { quadro: q, bola: 1, fim: false, reposicao: false };
    i += 2;
  }
  // 10º quadro
  const a = rolls[i];
  const b = rolls[i + 1];
  const c = rolls[i + 2];
  if (a === undefined) return { quadro: 9, bola: 0, fim: false, reposicao: true };
  if (b === undefined) return { quadro: 9, bola: 1, fim: false, reposicao: a === 10 };
  if (a + b < 10 && a !== 10) return { quadro: 9, bola: 2, fim: true, reposicao: false };
  if (c === undefined) return { quadro: 9, bola: 2, fim: false, reposicao: a === 10 ? b === 10 : true };
  return { quadro: 9, bola: 3, fim: true, reposicao: false };
}
