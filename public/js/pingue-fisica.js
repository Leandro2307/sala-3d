// Pingue-pongue: as mesas do salão de jogos e a física da bolinha. Sem three.js, para rodar igual no
// navegador (bola prevista) e no servidor (que manda no placar e na vez).
// A mesa é maior que a de verdade e a bolinha mais lenta e flutuante: dá para ver de longe e para
// chegar nela andando. O comprimento fica no eixo x: lado 0 é x < centro, lado 1 é x > centro.
import { MESAS_PINGUE } from './parque-dados.js';

export const PINGUE = {
  mesas: MESAS_PINGUE,
  comp: 4.4, larg: 2.44, altura: 0.95, // tampo
  rede: 0.26, // altura da rede acima do tampo
  raio: 0.07,
  gravidade: 6,
  quique: 0.86, // quanto da velocidade vertical volta no tampo
  pontos: 11, // e 2 de diferença
  alcance: 1.25, // até onde a raquete pega a bolinha (do centro do boneco, no chão)
};

// onde a bolinha espera o saque: atrás da ponta de quem saca
export const saquePingue = (m, lado) => ({ x: m.x + (lado === 0 ? -1 : 1) * (PINGUE.comp / 2 + 0.4), y: PINGUE.altura + 0.5, z: m.z });
export const ladoPingue = (m, x) => (x < m.x ? 0 : 1);

// Um passo da bolinha. Devolve o que aconteceu: { tipo: 'mesa', lado } (quicou no tampo),
// { tipo: 'rede' } ou { tipo: 'chao' } — ou null.
export function passoPingue(b, m, dt) {
  const { p, v } = b;
  const P = PINGUE;
  const r = P.raio;
  const topo = P.altura;
  const xAntes = p.x;
  const yAntes = p.y;
  v.y -= P.gravidade * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  // a rede: atravessou o plano dela entre o tampo e a faixa de cima
  if (Math.abs(p.z - m.z) < P.larg / 2 + 0.15 && p.y - r < topo + P.rede && p.y + r > topo && Math.sign(xAntes - m.x) !== Math.sign(p.x - m.x)) {
    const lado = Math.sign(xAntes - m.x) || 1;
    p.x = m.x + lado * (r + 0.01);
    v.x = -v.x * 0.2;
    v.z *= 0.5;
    return { tipo: 'rede' };
  }
  // o tampo (só quem vem de cima)
  const sobreAMesa = Math.abs(p.x - m.x) <= P.comp / 2 + r * 0.5 && Math.abs(p.z - m.z) <= P.larg / 2 + r * 0.5;
  if (sobreAMesa && v.y < 0 && p.y - r <= topo && yAntes - r >= topo - 0.08) {
    p.y = topo + r;
    v.y = -v.y * P.quique;
    v.x *= 0.97;
    v.z *= 0.97;
    return { tipo: 'mesa', lado: ladoPingue(m, p.x) };
  }
  if (p.y <= r) {
    p.y = r;
    v.y = Math.abs(v.y) * 0.5;
    v.x *= 0.7;
    v.z *= 0.7;
    return { tipo: 'chao' };
  }
  return null;
}

// Anda dt segundos em passos pequenos; aoEvento(ev) é chamado a cada acontecimento e, devolvendo
// true, para tudo ali (o ponto acabou).
export function andarPingue(b, m, dt, aoEvento = null) {
  const n = Math.min(40, Math.ceil(dt * 240));
  for (let i = 0; i < n; i++) {
    const ev = passoPingue(b, m, dt / n);
    if (ev && aoEvento?.(ev) === true) return;
  }
}

// A raquetada: a velocidade que leva a bolinha de p até o outro lado da mesa, caindo perto de alvoZ.
// forte: cortada (mais rápida, mais funda). O tempo de voo cresce até a bolinha passar por cima da rede.
export function rebaterPingue(m, p, lado, alvoZ, forte = false) {
  const P = PINGUE;
  const s = lado === 0 ? 1 : -1; // para onde vai
  const alvo = {
    x: m.x + s * (P.comp / 2) * (forte ? 0.78 : 0.62),
    y: P.altura + P.raio,
    z: Math.max(m.z - P.larg / 2 + 0.25, Math.min(m.z + P.larg / 2 - 0.25, alvoZ)),
  };
  const dx = alvo.x - p.x;
  const dz = alvo.z - p.z;
  const dy = alvo.y - p.y;
  const g = P.gravidade;
  let T = Math.max(0.4, Math.min(1.6, Math.sqrt(dx * dx + dz * dz) / (forte ? 9.5 : 6.2)));
  let v = null;
  for (let k = 0; k < 40; k++) {
    v = { x: dx / T, y: (dy + 0.5 * g * T * T) / T, z: dz / T };
    // ainda antes da rede: confere a altura em que passa por ela
    const tn = (m.x - p.x) / v.x;
    if (!(tn > 0) || tn >= T) break;
    const yn = p.y + v.y * tn - 0.5 * g * tn * tn;
    if (yn > P.altura + P.rede + P.raio + 0.06) break;
    T += 0.05;
  }
  return v;
}
