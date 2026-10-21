// Queimada: a quadra do parque, as zonas de cada um e a física da bola. Sem three.js, para rodar
// igual no navegador (bola prevista, onde cada um pode andar) e no servidor (que manda na bola e em
// quem foi queimado).
//
// A quadra tem o comprimento no eixo x: o time 0 (Azul) fica em x < cx e o 1 (Vermelho) em x > cx.
// Quem é queimado vai para o "cemitério", que é a volta do campo do outro time (os dois lados e o
// fundo): de lá ainda dá para pegar a bola e queimar — e quem queima do cemitério volta para o campo.
import { parqueDe, mapaDoModulo } from './mapas-dados.js';

// o mapa deste módulo (no servidor vem no endereço: ?mapa=)
const { QUEIMADA: Q } = parqueDe(mapaDoModulo(import.meta.url));

export const QUEIMADA = {
  ...Q,
  raio: 0.24, // a bola (maior que a de verdade: dá para ver de longe)
  gravidade: 9,
  quique: 0.55,
  atrito: 1.6, // m/s² rolando no chão
  forca: [12, 25], // velocidade de saída, do arremesso fraco ao mais forte
  corpo: { raio: 0.62, altura: 1.95 }, // onde a bola queima (um cilindro em pé no boneco)
  defesa: 650, // ms segurando a defesa (pega a bola em vez de ser queimado)
  recargaDefesa: 1500,
};
export const TIMES_QUEIMADA = [{ nome: 'Azul', cor: '#3b82f6' }, { nome: 'Vermelho', cor: '#ef4444' }];

const MEIO_L = Q.larg / 2;
const FAIXA = 4; // largura do cemitério dos lados

// Zona de cada um: um retângulo externo (fora) e, para o cemitério, o retângulo de dentro onde não
// se pode pisar (o campo do outro time). { x0, x1, z0, z1, sem: { x0, x1, z0, z1 } | null }
export function zonaQueimada(time, vivo) {
  const s = time === 0 ? -1 : 1;
  if (vivo) {
    const xa = Q.cx;
    const xb = Q.cx + s * (Q.comp / 2);
    return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Q.cz - MEIO_L, z1: Q.cz + MEIO_L, sem: null };
  }
  // cemitério: em volta do campo do outro time
  const xa = Q.cx;
  const xb = Q.cx - s * (Q.comp / 2 + Q.cemiterio);
  const campo = { x0: Math.min(Q.cx, Q.cx - s * (Q.comp / 2)), x1: Math.max(Q.cx, Q.cx - s * (Q.comp / 2)), z0: Q.cz - MEIO_L, z1: Q.cz + MEIO_L };
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Q.cz - MEIO_L - FAIXA, z1: Q.cz + MEIO_L + FAIXA, sem: campo };
}

// tudo o que é de alguém (as duas quadras e os dois cemitérios)
export const AREA_QUEIMADA = { x0: Q.cx - Q.comp / 2 - Q.cemiterio, x1: Q.cx + Q.comp / 2 + Q.cemiterio, z0: Q.cz - MEIO_L - FAIXA, z1: Q.cz + MEIO_L + FAIXA };

export const naZona = (p, z, folga = 0) => p.x >= z.x0 - folga && p.x <= z.x1 + folga && p.z >= z.z0 - folga && p.z <= z.z1 + folga
  && !(z.sem && p.x > z.sem.x0 + folga && p.x < z.sem.x1 - folga && p.z > z.sem.z0 + folga && p.z < z.sem.z1 - folga);

// Põe o ponto (x, z) dentro da zona (mexe no objeto): o boneco não sai do campo nem entra no do outro
export function prenderNaZona(p, z, margem = 0.4) {
  p.x = Math.max(z.x0 + margem, Math.min(z.x1 - margem, p.x));
  p.z = Math.max(z.z0 + margem, Math.min(z.z1 - margem, p.z));
  const s = z.sem;
  if (!s || p.x <= s.x0 - margem || p.x >= s.x1 + margem || p.z <= s.z0 - margem || p.z >= s.z1 + margem) return p;
  // dentro do campo do outro: sai pela beirada mais perto que dá para o cemitério
  const saidas = [];
  if (s.z0 - margem > z.z0) saidas.push(['z', s.z0 - margem, p.z - (s.z0 - margem)]);
  if (s.z1 + margem < z.z1) saidas.push(['z', s.z1 + margem, s.z1 + margem - p.z]);
  if (s.x0 - margem > z.x0) saidas.push(['x', s.x0 - margem, p.x - (s.x0 - margem)]);
  if (s.x1 + margem < z.x1) saidas.push(['x', s.x1 + margem, s.x1 + margem - p.x]);
  saidas.sort((a, b) => a[2] - b[2]);
  if (saidas.length) p[saidas[0][0]] = saidas[0][1];
  return p;
}

// um lugar ao acaso dentro da zona (para nascer, ir para o cemitério, voltar)
export function lugarNaZona(z, aleatorio = Math.random) {
  for (let k = 0; k < 30; k++) {
    const p = { x: z.x0 + 1 + aleatorio() * (z.x1 - z.x0 - 2), z: z.z0 + 1 + aleatorio() * (z.z1 - z.z0 - 2) };
    if (naZona(p, z, -0.8)) return p;
  }
  return prenderNaZona({ x: (z.x0 + z.x1) / 2, z: z.z0 + 1 }, z);
}

// um passo da bola solta (quica e rola no chão). Devolve true quando encostou no chão neste passo.
export function passoQueimada(b, dt) {
  const { p, v } = b;
  const r = QUEIMADA.raio;
  v.y -= QUEIMADA.gravidade * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  if (p.y > r) return false;
  p.y = r;
  if (v.y < 0) v.y = -v.y * QUEIMADA.quique;
  if (v.y < 0.8) v.y = 0;
  const vh = Math.sqrt(v.x * v.x + v.z * v.z);
  if (vh > 0) {
    const k = Math.max(0, vh - QUEIMADA.atrito * dt * (v.y === 0 ? 1 : 4)) / vh;
    v.x *= k;
    v.z *= k;
  }
  return true;
}

export function andarQueimada(b, dt) {
  const n = Math.min(24, Math.ceil(dt * 180));
  let chao = false;
  for (let i = 0; i < n; i++) chao = passoQueimada(b, dt / n) || chao;
  return chao;
}

// a bola (centro p) encosta no corpo de quem está em pé em (x, y, z)?
export function bolaNoCorpo(p, pessoa, folga = 0) {
  const C = QUEIMADA.corpo;
  const dx = p.x - pessoa.x;
  const dz = p.z - pessoa.z;
  return dx * dx + dz * dz < (C.raio + QUEIMADA.raio + folga) ** 2 && p.y > pessoa.y - QUEIMADA.raio && p.y < pessoa.y + C.altura + QUEIMADA.raio;
}
