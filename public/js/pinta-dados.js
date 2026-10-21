// Pinta-território (como no Splatoon): a arena do parque, os obstáculos e a grade do chão. Sem
// three.js: o servidor guarda de quem é cada metro do chão (a grade) e conta a área de cada time.
import { parqueDe, mapaDoModulo } from './mapas-dados.js';

// o mapa deste módulo (no servidor vem no endereço: ?mapa=)
const { PINTA_ARENA: A } = parqueDe(mapaDoModulo(import.meta.url));

export const PINTA = {
  ...A,
  n: 56, // a grade: n x n células de 1 m (o lado da arena)
  raioTinta: 1.7, // o borrão de cada tiro
  vel: 21, // velocidade da tinta saindo da arma
  gravidade: 15,
  custo: 5, // de tinta por tiro (o tanque tem 100)
  tanque: 100,
  recarga: 22, // por segundo, sem atirar
  recargaCor: 70, // por segundo em cima da cor do seu time
  cadencia: 0.15, // s entre um tiro e outro, segurando o clique
  vida: 3, // tiros que derrubam
  protecao: 2500, // ms sem levar tiro depois de voltar para a base
  muro: 2.6,
};
export const TIMES_PINTA = [{ nome: 'Rosa', cor: '#ec4899' }, { nome: 'Verde', cor: '#84cc16' }];
export const TEMPOS_PINTA = { contagem: 10, jogo: 120, fim: 8 };

const X0 = A.cx - A.lado / 2;
const Z0 = A.cz - A.lado / 2;
export const LIMITES = { x0: X0, x1: X0 + A.lado, z0: Z0, z1: Z0 + A.lado };

// obstáculos para se esconder (relativos ao centro): [x0, y0, z0, x1, y1, z1]
export const OBSTACULOS = [
  [-3, 0, -3, 3, 1.6, 3],
  [-15, 0, -13, -11, 1.4, -5], [11, 0, 5, 15, 1.4, 13],
  [-15, 0, 6, -8, 1.4, 9], [8, 0, -9, 15, 1.4, -6],
  [-6, 0, 15, 6, 1.2, 17], [-6, 0, -17, 6, 1.2, -15],
  [-22, 0, -20, -19, 2, -17], [19, 0, 17, 22, 2, 20],
].map(([x0, y0, z0, x1, y1, z1]) => [A.cx + x0, y0, A.cz + z0, A.cx + x1, y1, A.cz + z1]);

// as bases (onde cada time nasce), nos lados oeste e leste: a 8 m do muro, para a câmera (uns 6 m
// atrás do boneco, que nasce olhando para o meio) não ficar do lado de fora
export const BASES = [{ x: A.cx - 20, z: A.cz }, { x: A.cx + 20, z: A.cz }];
// a entrada, do lado de fora do muro sul
export const ENTRADA_PINTA = { x: A.cx, z: Z0 - 2.5 };

export const celulaDe = (x, z) => {
  const i = Math.floor(x - X0);
  const j = Math.floor(z - Z0);
  return i < 0 || j < 0 || i >= PINTA.n || j >= PINTA.n ? -1 : j * PINTA.n + i;
};

// pinta o círculo (x, z) do time (1 ou 2) na grade; devolve quantas células cada time ganhou e perdeu
// [delta do time 1, delta do time 2]
export function pintarGrade(grade, x, z, cor) {
  const r = PINTA.raioTinta;
  const d = [0, 0];
  for (let j = Math.floor(z - Z0 - r); j <= Math.ceil(z - Z0 + r); j++) {
    for (let i = Math.floor(x - X0 - r); i <= Math.ceil(x - X0 + r); i++) {
      if (i < 0 || j < 0 || i >= PINTA.n || j >= PINTA.n) continue;
      const cx = X0 + i + 0.5;
      const cz = Z0 + j + 0.5;
      if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
      const k = j * PINTA.n + i;
      const antes = grade[k];
      if (antes === cor) continue;
      if (antes) d[antes - 1]--;
      d[cor - 1]++;
      grade[k] = cor;
    }
  }
  return d;
}

// dentro da arena (com folga)?
export const naArena = (p, folga = 0) => p.x > LIMITES.x0 - folga && p.x < LIMITES.x1 + folga && p.z > LIMITES.z0 - folga && p.z < LIMITES.z1 + folga;
