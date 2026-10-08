// Surf e mata-mata: os dois ficam no céu, acima do mapa (portais perto da porta do cinema).
// Só dados e contas sem three.js: o servidor lê o mesmo arquivo para conferir armas e tempos.

// ------------------------------------------------------------------ portais (no chão)
export const PORTAIS = {
  surf: { x: 66, z: 68, cor: '#22d3ee', nome: 'SURF' },
  matamata: { x: 76, z: 68, cor: '#ef4444', nome: 'MATA-MATA' },
};

// ------------------------------------------------------------------ surf
// Rampas em cunha (como as do CS): a crista vai de a até b, descendo; as duas faces caem até a
// base, h metros abaixo, a w metros para cada lado. Faces a ~53°: em cima delas não dá para ficar
// de pé, só deslizar — e no ar, virando o mouse junto com A/D, se ganha velocidade.
// Plataformas: caixas (centro x/z, topo y, lados lx/lz). As de etapa salvam o ponto de volta.
export const SURF = {
  inicio: { x: 0, y: 420, z: 460, yaw: -Math.PI / 2 }, // olhando para +x
  plataformas: [
    { id: 'inicio', x: 0, y: 420, z: 460, lx: 12, lz: 12, etapa: 0 },
    // a parede no fundo segura quem chega embalado da etapa 1 (dali se vira para -z)
    { id: 'etapa2', x: 254, y: 340, z: 455, lx: 16, lz: 16, etapa: 1, parede: { min: [262, 338, 447], max: [263.5, 345, 463] } },
    // o fim também tem parede: quem chega voando bate e cai na plataforma
    { id: 'fim', x: 254, y: 255, z: 200, lx: 18, lz: 18, fim: true, parede: { min: [245, 253, 189.5], max: [263, 270, 191] } },
  ],
  rampas: [
    // etapa 1, para +x
    { a: [6.5, 417, 460], b: [84, 397, 460], w: 9, h: 12, cor: '#22d3ee' },
    { a: [96, 394, 466], b: [166, 374, 466], w: 9, h: 12, cor: '#a78bfa' },
    { a: [178, 364, 458], b: [240, 347, 458], w: 9, h: 12, cor: '#f472b6' },
    // etapa 2, para -z
    { a: [254, 337, 446.5], b: [254, 317, 371], w: 9, h: 12, cor: '#34d399' },
    { a: [260, 314, 359], b: [260, 294, 289], w: 9, h: 12, cor: '#fbbf24' },
    { a: [256, 280, 277], b: [256, 266, 212], w: 9, h: 12, cor: '#f87171' },
  ],
  // abaixo disto, volta para o começo da etapa
  queda: [320, 245],
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
