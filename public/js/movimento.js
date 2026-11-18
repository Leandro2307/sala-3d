// Movimento do controle no PS5 direto: o giroscópio, o acelerômetro e a orientação (quaternion) que o
// DualSense manda ao PS5 — é por eles que o jogo vê o controle inclinar (a nave do Astro Bot, que se
// pilota inclinando o controle). A ponte (libchiaki) recebe os três prontos e só repassa.
//
// A orientação sai da fusão dos dois sensores (algoritmo de Madgwick), copiada do orientation.c do
// chiaki-ng: mesmo filtro, mesmos pesos, mesma volta de 90° no fim. Uma diferença: lá o filtro de
// tremido (fuzz) grava por cima do próprio estado da fusão e, a ~250 amostras por segundo, engole
// parte de cada passo de uma rotação lenta para sempre (teste: inclinar 25° para frente dava 15°).
// Aqui a fusão anda no valor verdadeiro e o filtro só alisa o que sai. Roda aqui, no navegador de quem joga, no ritmo do controle
// (~250 por segundo, com o relógio dele), e não na ponte: pela rede vão só fotos do estado (no máximo
// uma a cada 12 ms), e integrar o giroscópio em fotos atrasadas e tremidas tortaria a orientação.
//
// Unidades e eixos do SDL (os que a libchiaki espera): giroscópio em rad/s, acelerômetro em g;
// x para a direita, y para cima, z para quem segura. Deitado e parado: acelerômetro (0, 1, 0).
// Inclinar para a esquerda (o lado direito sobe) é giro positivo em z; a frente subir, positivo em x.

const S45 = Math.SQRT1_2;
const AQUECIMENTO = 30; // amostras com o filtro forte: acha a gravidade logo no começo
const BETA_AQUECIMENTO = 20;
const BETA = 0.05;
const FUZZ = 0.0007; // filtro de tremido da orientação (como o do sistema de entrada do kernel)
const FUZZ_PESO = 0.75;
const FUZZ_PESO_2X = 0.6;

const fuzz = (atual, antes) => {
  const d = Math.abs(atual - antes);
  if (d < FUZZ / 2) return antes;
  if (d < FUZZ) return FUZZ_PESO * antes + (1 - FUZZ_PESO) * atual;
  if (d < FUZZ * 2) return FUZZ_PESO_2X * antes + (1 - FUZZ_PESO_2X) * atual;
  return atual;
};

// degraus do que vai pela rede: o tremido da mão não precisa ir inteiro (giroscópio de 0,004 rad/s,
// uns 0,23°/s; acelerômetro de 0,004 g; orientação em 4 casas)
const q250 = (v) => Math.round(v * 250) / 250 || 0;
const q4 = (v) => Math.round(v * 10000) / 10000 || 0;

export class Fusao {
  constructor() {
    this.zerar();
  }

  zerar() {
    // 90° em torno de x: o "deitado" no referencial do Madgwick (gravidade em z)
    this.q = { w: S45, x: S45, y: 0, z: 0 };
    this.saida = { ...this.q }; // o q com o filtro de tremido: é o que vai ao PS5
    this.g = [0, 0, 0];
    this.a = [0, 1, 0];
    this.n = 0;
  }

  // uma amostra: g em rad/s, a em g, dt em segundos desde a anterior
  passo(g, a, dt) {
    this.g = g;
    this.a = a;
    this.n++;
    if (this.n <= 1 || !(dt > 0)) return; // a primeira só marca o tempo (como no chiaki-ng)
    const beta = this.n < AQUECIMENTO ? BETA_AQUECIMENTO : BETA;
    let [gx, gy, gz] = g;
    let [ax, ay, az] = a;
    let { w: q0, x: q1, y: q2, z: q3 } = this.q;
    // quanto o quaternion muda pelo giroscópio
    let d0 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz);
    let d1 = 0.5 * (q0 * gx + q2 * gz - q3 * gy);
    let d2 = 0.5 * (q0 * gy - q1 * gz + q3 * gx);
    let d3 = 0.5 * (q0 * gz + q1 * gy - q2 * gx);
    // correção pela gravidade (só com o acelerômetro medindo algo)
    const na = Math.hypot(ax, ay, az);
    if (na > 0) {
      ax /= na; ay /= na; az /= na;
      const q0q0 = q0 * q0, q1q1 = q1 * q1, q2q2 = q2 * q2, q3q3 = q3 * q3;
      let s0 = 4 * q0 * q2q2 + 2 * q2 * ax + 4 * q0 * q1q1 - 2 * q1 * ay;
      let s1 = 4 * q1 * q3q3 - 2 * q3 * ax + 4 * q0q0 * q1 - 2 * q0 * ay - 4 * q1 + 8 * q1 * q1q1 + 8 * q1 * q2q2 + 4 * q1 * az;
      let s2 = 4 * q0q0 * q2 + 2 * q0 * ax + 4 * q2 * q3q3 - 2 * q3 * ay - 4 * q2 + 8 * q2 * q1q1 + 8 * q2 * q2q2 + 4 * q2 * az;
      let s3 = 4 * q1q1 * q3 - 2 * q1 * ax + 4 * q2q2 * q3 - 2 * q2 * ay;
      const ns = s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3;
      if (ns > 0.000001) {
        const r = 1 / Math.sqrt(ns);
        s0 *= r; s1 *= r; s2 *= r; s3 *= r;
        d0 -= beta * s0; d1 -= beta * s1; d2 -= beta * s2; d3 -= beta * s3;
      }
    }
    q0 += d0 * dt; q1 += d1 * dt; q2 += d2 * dt; q3 += d3 * dt;
    const nq = 1 / Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3);
    this.q = { w: q0 * nq, x: q1 * nq, y: q2 * nq, z: q3 * nq };
    const s = this.saida;
    this.saida = { w: fuzz(this.q.w, s.w), x: fuzz(this.q.x, s.x), y: fuzz(this.q.y, s.y), z: fuzz(this.q.z, s.z) };
  }

  // [gx, gy, gz, ax, ay, az, ox, oy, oz, ow] como vai ao PS5: a orientação volta os 90° do Madgwick
  // (deitado = 0, 0, 0, 1)
  estado() {
    const { w, x, y, z } = this.saida;
    return [
      ...this.g.map(q250), ...this.a.map(q250),
      q4(S45 * (x - w)), q4(S45 * (y + z)), q4(S45 * (z - y)), q4(S45 * (w + x)),
    ];
  }
}

// O controle inclinado sem um controle de verdade (o mouse no lugar do giroscópio, teclado-pad.js):
// rolagem (graus, para a esquerda positivo) e arfagem (graus, a frente para cima positivo), e quanto
// cada uma mudou por segundo. Devolve o que o giroscópio e o acelerômetro mediriam assim — a ordem
// é: primeiro a frente sobe/desce, depois o controle tomba para o lado.
export function inclinado(rolagem, arfagem, vRolagem, vArfagem) {
  const r = (rolagem * Math.PI) / 180;
  const p = (arfagem * Math.PI) / 180;
  const vr = (vRolagem * Math.PI) / 180;
  const vp = (vArfagem * Math.PI) / 180;
  return {
    g: [vp, vr * Math.sin(p), vr * Math.cos(p)],
    a: [Math.sin(r), Math.cos(r) * Math.cos(p), -Math.cos(r) * Math.sin(p)],
  };
}
