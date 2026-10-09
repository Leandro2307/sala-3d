// Mata-mata em times: duas equipes, rodadas como no CS. Quem morre fica de espectador até a rodada
// acabar; vence a rodada o time que derrubar o outro inteiro (ou que tiver mais gente de pé quando o
// tempo acaba), e a partida, quem fizer BATALHA.vencer rodadas. A arena é outra, também no céu, com
// três corredores e uma plataforma no meio. Só dados e contas sem three.js: o servidor lê o mesmo
// arquivo para conferir armas, times e quem está dentro.

export const TIMES = [
  { nome: 'Autobots', cor: '#ef4444', claro: '#fca5a5' },
  { nome: 'Decepticons', cor: '#a855f7', claro: '#d8b4fe' },
];

// Caixas da metade de um time ([x0, y0, z0, x1, y1, z1], relativas ao centro do chão): a do outro
// time é a mesma girada meia volta, (x, z) -> (-x, -z). Assim os dois lados são iguais de verdade:
// o corredor norte de um é o sul do outro.
const METADE = [
  // muretas na frente do nascimento, com passagem no meio
  [-31, 0, -12, -30, 2.2, -3], [-31, 0, 3, -30, 2.2, 12],
  // divisórias dos corredores (paredes ao longo de x, em z = ±9,5), com passagens
  [-26, 0, -10, -14, 4, -9], [-26, 0, 9, -14, 4, 10],
  // corredor norte: caixotes empilhados, um pilar e uma mureta
  [-22, 0, -22, -20, 2, -20], [-21.6, 2, -21.6, -20.4, 3, -20.4], [-12, 0, -20, -10.8, 5, -18.8], [-6, 0, -24, -5, 1.3, -16],
  // corredor sul
  [-20, 0, 18, -18, 2, 20], [-12, 0, 14, -11, 1.3, 22], [-5, 0, 20, -3.8, 5, 21.2],
  // corredor do meio
  [-20, 0, -2.5, -18, 2, -0.5], [-14, 0, 1.5, -12.8, 1.3, 6],
  // escada da plataforma (degraus de 0,4 m sobem andando)
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => [-4 - i * 0.6, 0, -1.4, -4 - (i - 1) * 0.6, 3 - i * 0.4 + 0.0001, 1.4]),
  // parapeito da plataforma: cobre até a cintura de quem está lá em cima
  [-4, 3, -4, 4, 3.8, -3.6],
];
const girar = ([x0, y0, z0, x1, y1, z1]) => [-x1, y0, -z1, -x0, y1, -z0];

export const BATALHA = {
  x: 150, y: 450, z: 220,
  lx: 84, lz: 56, parede: 6,
  caixas: [
    ...METADE, ...METADE.map(girar),
    // o meio da divisória, que é um só, e a plataforma
    [-8, 0, -10, 8, 4, -9], [-8, 0, 9, 8, 4, 10],
    [-4, 0, -4, 4, 3, 4],
  ],
  // onde cada time nasce (de frente para o meio)
  nascer: [0, 1].map((t) => [[-37, -18], [-37, -9], [-37, 0], [-37, 9], [-37, 18], [-40, -4.5], [-40, 4.5], [-34, 0]]
    .map(([x, z]) => (t ? [-x, 0, -z] : [x, 0, z]))),
  // armas no chão: cada lado tem SMG, escopeta e fuzil; a sniper fica em cima da plataforma
  itens: [
    { tipo: 'submetralhadora', x: -22, y: 0, z: -15 },
    { tipo: 'escopeta', x: -22, y: 0, z: 15 },
    { tipo: 'fuzil', x: -10, y: 0, z: 0 },
    { tipo: 'submetralhadora', x: 22, y: 0, z: 15 },
    { tipo: 'escopeta', x: 22, y: 0, z: -15 },
    { tipo: 'fuzil', x: 10, y: 0, z: 0 },
    { tipo: 'sniper', x: 0, y: 3, z: 0 },
  ],
  // galeria de vidro acima do meio: quem entra com a rodada valendo espera lá, assistindo
  galeria: { y: 14, l: 10 },
  volta: 20000, // ms até a arma reaparecer (e todas voltam a cada rodada)
  inicial: 'pistola',
  vencer: 5, // rodadas para levar a partida
  tempo: 120, // segundos de rodada
  preparo: 4, // segundos parado, na contagem, antes de valer
  fimRodada: 5, // segundos mostrando quem venceu a rodada
  fimPartida: 9,
};

// a pessoa está dentro da arena (com folga)?
export const naBatalha = (p) => !!p && Math.abs(p.x - BATALHA.x) < BATALHA.lx / 2 + 6 && Math.abs(p.z - BATALHA.z) < BATALHA.lz / 2 + 6
  && p.y > BATALHA.y - 40 && p.y < BATALHA.y + 30;
