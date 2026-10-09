// Surf e mata-mata: os dois ficam no céu, acima do mapa (portais perto da porta do cinema, junto com o
// do mata-mata em times, que tem a arena dele em batalha-dados.js).
// Só dados e contas sem three.js: o servidor lê o mesmo arquivo para conferir armas e tempos.
import { NOVO } from './mundo.js';
import { PORTAIS_NOVO } from './cidade-dados.js';

// ------------------------------------------------------------------ portais (no chão)
// No mundo novo ficam na praça da aventura, ao lado da chegada do surf (cidade-dados.js). O servidor
// não usa os portais; o surf e a arena são os mesmos nos dois mundos.
export const PORTAIS = {
  surf: { ...(NOVO ? PORTAIS_NOVO.surf : { x: 66, z: 68 }), cor: '#22d3ee', nome: 'SURF' },
  matamata: { ...(NOVO ? PORTAIS_NOVO.matamata : { x: 76, z: 68 }), cor: '#ef4444', nome: 'MATA-MATA' },
  // o mata-mata em times (batalha.js) tem a arena dele, mas entra por um portal igual a estes
  times: { ...(NOVO ? PORTAIS_NOVO.times : { x: 86, z: 68 }), cor: '#f59e0b', nome: 'EM TIMES' },
};

// ------------------------------------------------------------------ surf
// Rampas em cunha (como as do CS): a crista vai de a até b, descendo; as duas faces caem até a
// base, h metros abaixo, a w metros para cada lado. Faces a ~53°: em cima delas não dá para ficar
// de pé, só deslizar — e no ar, virando o mouse junto com A/D, se ganha velocidade.
// O percurso sai do alto, a 440 m, no sudoeste do mapa, vai para leste e faz uma curva longa e
// aberta (dá para fazer embalado) até apontar para oeste; desce até o chão no lado oeste do mapa
// (a chegada). São 18 rampas, sempre em
// cima do mapa (fora da cerca a serra passa de 500 m). Os pontos de volta são anéis no ar: passar
// por dentro salva; não precisa parar em nada.
const GRAUS = Math.PI / 180;
const CORES = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#c084fc'];
function gerarSurf() {
  const trechos = [
    { n: 3, L: 70, vao: 12, desce: 0.26, queda: 13, giro: 0 }, // para leste
    { n: 6, L: 45, vao: 8, desce: 0.25, queda: 8, giro: -15 }, // curva para o norte (aberta: dá para fazer embalado)
    { n: 6, L: 45, vao: 8, desce: 0.25, queda: 8, giro: -15 }, // e segue virando, para oeste
    { n: 2, L: 70, vao: 12, desce: 0.26, queda: 13, giro: 0 },
    { n: 1, L: 60, vao: 12, desce: 0.78, queda: 0, giro: 0 }, // a última encosta no chão
  ];
  const rampas = [];
  let x = 5;
  let y = 440;
  let z = -20;
  let ang = 90 * GRAUS; // direção: (sen, cos) no plano x/z; 90° = leste
  for (const t of trechos) {
    for (let i = 0; i < t.n; i++) {
      ang += t.giro * GRAUS;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      // as rampas ficam em linha: com uma para cada lado, quem desce pela face de dentro chegava
      // alinhado com a crista da seguinte, abaixo dela, e batia de frente na ponta
      const off = 0;
      const a = [x + Math.cos(ang) * off, y, z - Math.sin(ang) * off];
      const b = [a[0] + dx * t.L, y - t.L * t.desce, a[2] + dz * t.L];
      rampas.push({ a, b, w: 9, h: 12, dir: [dx, dz], cor: CORES[rampas.length % CORES.length] });
      x = b[0] - Math.cos(ang) * off + dx * t.vao;
      z = b[2] + Math.sin(ang) * off + dz * t.vao;
      y = b[1] - t.queda;
    }
  }
  return rampas;
}
const RAMPAS = gerarSurf();
// anéis de volta: em volta do começo destas rampas, grandes o bastante para pegar quem vem por
// qualquer uma das faces. A volta (R) põe a pessoa em cima da face, já embalada
const ANEIS = [3, 6, 9, 12, 15].map((i) => {
  const r = RAMPAS[i];
  const [dx, dz] = r.dir;
  return { i, x: r.a[0], y: r.a[1], z: r.a[2], dir: r.dir, volta: [r.a[0] + dz * 4 + dx * 3, r.a[1] - 2.5, r.a[2] - dx * 4 + dz * 3] };
});
export const SURF = {
  inicio: { x: -7, y: 442, z: -20, yaw: -Math.PI / 2 }, // olhando para leste
  largada: { x: -3, y: 442, z: -20, lx: 16, lz: 12 }, // plataforma da largada (a crista começa na beirada)
  rampas: RAMPAS,
  aneis: ANEIS,
  raioAnel: 16,
  // a chegada: um círculo no chão, no fim da última rampa
  chegada: { x: -32, z: 383, raio: 18 },
  // atrás da chegada, uma parede alta: quem chega voando bate nela e cai na chegada
  parede: { min: [-47.5, 0, 330], max: [-46, 150, 436] },
  // abaixo disto (por anel: o 0 é a largada), caiu: volta para o último anel
  queda: [0, ...ANEIS].map((anel, k, lista) => {
    const de = anel.i ?? 0;
    const ate = (lista[k + 1]?.i ?? RAMPAS.length) + 1;
    let min = Infinity;
    for (let i = de; i < Math.min(ate, RAMPAS.length); i++) min = Math.min(min, RAMPAS[i].b[1] - RAMPAS[i].h);
    return min - 18;
  }),
};

// ------------------------------------------------------------------ mata-mata
// Arena fechada, flutuando. Tudo relativo ao centro do chão (y = 0 é o piso).
export const ARENA = {
  x: 300, y: 450, z: 100,
  lx: 64, lz: 44, parede: 5,
  // obstáculos: [x0, y0, z0, x1, y1, z1]
  caixas: [
    // caixotes perto dos nascimentos
    [-19, 0, -9, -17, 2, -7], [-19, 0, 7, -17, 2, 9], [17, 0, -9, 19, 2, -7], [17, 0, 7, 19, 2, 9],
    [-19, 2, -9, -18, 3, -8], [18, 2, 8, 19, 3, 9],
    // muretas para se esconder
    [-7, 0, -13, -6, 1.3, -4], [6, 0, 4, 7, 1.3, 13], [-14, 0, 12, -8, 1.3, 13], [8, 0, -13, 14, 1.3, -12],
    // pilares
    [-11, 0, -18, -9.8, 4, -16.8], [9.8, 0, 16.8, 11, 4, 18], [-11, 0, 16.8, -9.8, 4, 18], [9.8, 0, -18, 11, 4, -16.8],
    // corredores: paredes com passagem no meio
    [-24, 0, -4, -23, 3, -1], [-24, 0, 1, -23, 3, 4], [23, 0, -4, 24, 3, -1], [23, 0, 1, 24, 3, 4],
    // a torre do meio, com escada dos dois lados (degraus de 0,4 m sobem andando)
    [-3, 0, -3, 3, 3, 3],
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => [3 + (i - 1) * 0.6, 0, -1.2, 3 + i * 0.6, 3 - i * 0.4 + 0.0001, 1.2]),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => [-3 - i * 0.6, 0, -1.2, -3 - (i - 1) * 0.6, 3 - i * 0.4 + 0.0001, 1.2]),
  ],
  nascer: [[-28, 0, -18], [-28, 0, 0], [-28, 0, 18], [28, 0, -18], [28, 0, 0], [28, 0, 18], [-14, 0, 0], [14, 0, 0]],
  // armas no chão (a de cima da torre é a sniper)
  itens: [
    { tipo: 'submetralhadora', x: -20, y: 0, z: -16 },
    { tipo: 'escopeta', x: -20, y: 0, z: 16 },
    { tipo: 'fuzil', x: 20, y: 0, z: -16 },
    { tipo: 'escopeta', x: 20, y: 0, z: 16 },
    { tipo: 'fuzil', x: 0, y: 0, z: -18 },
    { tipo: 'submetralhadora', x: 0, y: 0, z: 18 },
    { tipo: 'sniper', x: 0, y: 3, z: 0 },
  ],
  volta: 15000, // ms até a arma reaparecer
  inicial: 'pistola', // com que se nasce
  abates: 15, // quem chegar primeiro vence a rodada
};

// a pessoa está dentro da arena (com folga)?
export const naArena = (p) => !!p && Math.abs(p.x - ARENA.x) < ARENA.lx / 2 + 6 && Math.abs(p.z - ARENA.z) < ARENA.lz / 2 + 6
  && p.y > ARENA.y - 40 && p.y < ARENA.y + 30;
