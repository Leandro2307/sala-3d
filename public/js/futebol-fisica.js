// Futebol de carro: o campo e a física da bola. Sem three.js, para rodar igual no navegador (bola
// prevista entre um recado e outro do servidor) e no servidor (que manda na bola e conta os gols).
//
// Tudo aqui é no sistema do campo: x de lado a lado, z de gol a gol, y para cima, a origem no
// meio do campo, no chão. O time 0 (azul) defende o gol do z negativo; o 1 (laranja), o do z
// positivo. Quem põe o campo no mundo (centro e giro) é o futebol.js.

export const CAMPO = {
  largura: 64, // x
  comprimento: 92, // z, de uma linha de fundo à outra
  altura: 24, // o teto
  chanfro: 11, // os cantos cortados a 45° (a bola não fica presa no canto)
  gol: { largura: 18, altura: 7.5, fundo: 8 },
};

export const BOLA = {
  raio: 1.5,
  gravidade: 13, // m/s², a mesma dos carros: tudo meio "lunar", como no jogo
  quique: 0.62, // quanto da velocidade volta ao bater numa parede
  atrito: 0.25, // o quanto o chão segura a bola rolando (por segundo)
  ar: 0.03,
  maxVel: 62,
};

export const PARTIDA = {
  duracao: 300, // segundos de jogo
  golMs: 3000, // depois do gol, até recomeçar
  saidaMs: 3000, // contagem antes da saída de bola
  fimMs: 8000, // placar final na tela, até a próxima partida
};

const W = CAMPO.largura / 2;
const L = CAMPO.comprimento / 2;
const G = CAMPO.gol;
const CANTO = W + L - CAMPO.chanfro; // |x| + |z| até aqui (o chanfro)
const R2 = Math.SQRT1_2;

// Empurra uma esfera (centro p, raio r) para fora das paredes do campo e rebate a velocidade v.
// p e v: {x, y, z}, mudados no lugar. quique/atrito: da bola (o carro usa outros).
// Devolve a maior "batida" (velocidade contra a parede), para o som.
// semChao: o carro (o chão dele é tratado à parte, pelas rodas).
export function colidirCampo(p, v, r, quique = BOLA.quique, atrito = 0.12, semChao = false) {
  let batida = 0;
  const contra = (nx, ny, nz, pen) => {
    if (pen <= 0) return;
    p.x += nx * pen;
    p.y += ny * pen;
    p.z += nz * pen;
    const vn = v.x * nx + v.y * ny + v.z * nz;
    if (vn >= 0) return;
    batida = Math.max(batida, -vn);
    // a parte da velocidade ao longo da parede perde um pouco (a bola "pega" na parede), tanto
    // mais quanto mais forte a batida: rolando no chão (batida de nada, a cada passo) não perde
    const tx = v.x - vn * nx;
    const ty = v.y - vn * ny;
    const tz = v.z - vn * nz;
    const k = 1 - atrito * Math.min(1, -vn / 10);
    const vq = -vn * quique;
    v.x = tx * k + nx * vq;
    v.y = ty * k + ny * vq;
    v.z = tz * k + nz * vq;
  };

  if (!semChao) contra(0, 1, 0, r - p.y); // chão
  const dentroDoGol = Math.abs(p.z) > L;
  if (dentroDoGol) {
    // a caixa do gol: lados, teto e fundo
    const sz = Math.sign(p.z);
    contra(-1, 0, 0, p.x + r - G.largura / 2);
    contra(1, 0, 0, -G.largura / 2 - (p.x - r));
    contra(0, -1, 0, p.y + r - G.altura);
    contra(0, 0, -sz, Math.abs(p.z) + r - (L + G.fundo));
    return batida;
  }
  contra(0, -1, 0, p.y + r - CAMPO.altura); // teto
  contra(-1, 0, 0, p.x + r - W);
  contra(1, 0, 0, -W - (p.x - r));
  // os 4 cantos cortados
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      contra(-sx * R2, 0, -sz * R2, (sx * p.x + sz * p.z - CANTO) * R2 + r);
    }
  }
  // as paredes do fundo, com o buraco do gol
  const sz = Math.sign(p.z) || 1;
  const pen = Math.abs(p.z) + r - L;
  if (pen > 0) {
    const naBoca = Math.abs(p.x) < G.largura / 2 && p.y < G.altura;
    if (!naBoca) contra(0, 0, -sz, pen);
    else {
      // dentro da boca do gol: só as traves e o travessão (o ponto da borda mais perto)
      const ex = Math.abs(p.x) > G.largura / 2 - r ? Math.sign(p.x) * G.largura / 2 : null;
      const ey = p.y > G.altura - r ? G.altura : null;
      for (const [bx, by] of [[ex, p.y], [p.x, ey], [ex, ey]]) {
        if (bx == null || by == null) continue;
        const dx = p.x - bx;
        const dy = p.y - by;
        const dz = p.z - sz * L;
        const d = Math.hypot(dx, dy, dz);
        if (d >= r || d < 1e-6) continue;
        contra(dx / d, dy / d, dz / d, r - d);
      }
    }
  }
  return batida;
}

// Um passo da bola. b: { p, v } (com x, y, z). Devolve a batida mais forte do passo.
export function passoBola(b, dt) {
  const { p, v } = b;
  v.y -= BOLA.gravidade * dt;
  const ar = 1 - BOLA.ar * dt;
  v.x *= ar;
  v.y *= ar;
  v.z *= ar;
  // rolando no chão: o atrito freia aos poucos
  if (p.y <= BOLA.raio + 0.02 && Math.abs(v.y) < 1) {
    const k = Math.max(0, 1 - BOLA.atrito * dt);
    v.x *= k;
    v.z *= k;
  }
  const vel = Math.hypot(v.x, v.y, v.z);
  if (vel > BOLA.maxVel) {
    const k = BOLA.maxVel / vel;
    v.x *= k;
    v.y *= k;
    v.z *= k;
  }
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  return colidirCampo(p, v, BOLA.raio);
}

// Passos fixos de 1/120 s: a bola é a mesma em toda máquina, com qualquer taxa de quadros
export function andarBola(b, dt) {
  let batida = 0;
  const n = Math.min(24, Math.ceil(dt * 120));
  for (let i = 0; i < n; i++) batida = Math.max(batida, passoBola(b, dt / n));
  return batida;
}

// A bola entrou inteira no gol? Devolve o time que marcou (0 ou 1) ou null.
export function gol(p) {
  if (Math.abs(p.z) < L + BOLA.raio) return null;
  return p.z > 0 ? 0 : 1; // no gol do z positivo (o do laranja) quem marca é o azul
}

// Lugares da saída de bola, como no jogo: dois na diagonal, dois de lado, um no meio, lá atrás.
// time 0 começa no z negativo, olhando para +z. Devolve { x, z, yaw } (yaw 0 = olhando para +z).
const SAIDAS = [[-14, -26], [14, -26], [-4, -36], [4, -36], [0, -42]];
export function lugarDaSaida(time, i) {
  const [x, z] = SAIDAS[i % SAIDAS.length];
  const s = time === 0 ? 1 : -1;
  return { x: x * s, z: z * s, yaw: time === 0 ? 0 : Math.PI };
}

// Almofadas de turbo: as grandes (100) nos cantos e no meio das laterais; as pequenas (+12)
// espalhadas. São de cada um (não vão pela rede): voltam sozinhas depois de um tempo.
export const ALMOFADAS = (() => {
  const lista = [];
  for (const sx of [-1, 1]) {
    lista.push({ x: sx * (W - 5), z: 0, grande: true });
    for (const sz of [-1, 1]) lista.push({ x: sx * (W - 7), z: sz * (L - 11), grande: true });
  }
  for (const [x, z] of [[0, -14], [0, 14], [-12, 0], [12, 0], [-20, -20], [20, -20], [-20, 20], [20, 20],
    [0, -30], [0, 30], [-12, -36], [12, -36], [-12, 36], [12, 36], [-26, -8], [26, -8], [-26, 8], [26, 8]]) {
    lista.push({ x, z, grande: false });
  }
  return lista;
})();
