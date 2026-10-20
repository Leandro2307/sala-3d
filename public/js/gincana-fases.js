// As 10 fases da gincana e a final, só em números (sem three.js): o servidor lê daqui o tipo, o
// tempo e quantas peças quebram em cada uma; o navegador monta o 3D (gincana-3d.js).
//
// Cada fase fica num lugar só dela, bem longe do mapa (origemDa, gincana-dados.js), e as
// coordenadas daqui são relativas a ele: x para o lado, z para a frente (as corridas vão para z
// crescente), y para cima a partir do chão da largada. Caixa: [x0, y0, z0, x1, y1, z1].
//
// tipo: 'corrida' (até a chegada; caiu, volta no último ponto — na gosma, caiu está fora),
// 'sobrevivencia' (ficar em pé até o tempo acabar; caiu, está fora) ou 'final' (o último em pé).

const FRENTE = Math.PI; // yaw de quem olha para a frente (z crescente)
const LADO = Math.PI / 2; // yaw de quem olha para -x (das sacadas para a arena)

// plataforma com o topo em y e `esp` de espessura
const plat = (x0, z0, x1, z1, y = 0, cor = 'branco', esp = 1) => ({ c: [x0, y - esp, z0, x1, y, z1], cor });

// n degraus de `alt` subindo para a frente (dir 1) ou para trás (dir -1), cada um com `fundo` m
function escada(x0, x1, z, y, n, { fundo = 0.8, alt = 0.4, dir = 1, cor = 'branco' } = {}) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    const za = z + dir * i * fundo;
    const zb = z + dir * (i + 1) * fundo;
    lista.push({ c: [x0, y - 1, Math.min(za, zb), x1, y + alt * (i + 1), Math.max(za, zb)], cor: i % 2 ? cor : 'branco' });
  }
  return lista;
}

// a largada das corridas: o piso atrás do portão (z < 0), o portão e onde cada um nasce
function largada(meia) {
  return {
    caixa: plat(-meia, -12, meia, 0, 0, 'branco', 2),
    portao: [-meia, 0, 0, meia, 4, 0.6],
    nascer: { x0: -meia + 1.5, x1: meia - 1.5, z0: -11, z1: -2, y: 0, yaw: FRENTE },
    inicio: { area: null, x: 0, y: 0, z: -6, yaw: FRENTE },
  };
}

// a sacada de quem assiste (caiu ou chegou atrasado) nas arenas: ao lado, mais alta
const sacada = (x, y) => ({ caixa: plat(x - 4, -6, x + 4, 6, y, 'branco'), lugar: { x, y, z: 0, yaw: LADO } });

// ------------------------------------------------------------------ 1. Portas Bagunçadas
// Cinco paredões de portas: em cada um, umas seguram e as outras quebram quando alguém passa
// (sorteado a cada rodada, igual para todos). Entre eles, dois varredores e dois empurradores.
function portasBaguncadas() {
  const L = 14;
  const lg = largada(L);
  const caixas = [lg.caixa];
  for (let i = 0; i < 10; i++) caixas.push(plat(-L, i * 10, L, (i + 1) * 10, 0, i % 2 ? 'lilas' : 'rosa'));
  let id = 0;
  const portas = [[16, 7, 3], [32, 6, 3], [48, 6, 3], [64, 5, 3], [80, 5, 2]].map(([z, n, solidas]) => {
    const pilar = 1;
    const vao = (2 * L - (n + 1) * pilar) / n;
    const vaos = [];
    let x = -L;
    for (let k = 0; k < n; k++) {
      caixas.push({ c: [x, 0, z - 0.3, x + pilar, 3.2, z + 0.3], cor: 'roxo' });
      vaos.push({ id: id++, x0: x + pilar, x1: x + pilar + vao });
      x += pilar + vao;
    }
    caixas.push({ c: [x, 0, z - 0.3, L, 3.2, z + 0.3], cor: 'roxo' });
    caixas.push({ c: [-L, 3.2, z - 0.3, L, 5, z + 0.3], cor: 'roxo' }); // a verga
    return { z, vaos, solidas, alt: 3.2 };
  });
  return {
    id: 'portas', nome: 'Portas Bagunçadas', desc: 'Umas portas seguram, as outras quebram: arrisque!', tipo: 'corrida', tempo: 100, cor: '#f472b6',
    caixas, portao: lg.portao, nascer: lg.nascer, queda: -10,
    pontos: [lg.inicio, { area: [-L, -1, 49, L, 8, 100], x: 0, y: 0, z: 51, yaw: FRENTE }],
    chegada: [-L, -0.5, 92, L, 8, 100], arco: { z: 92, x0: -L, x1: L, y: 0 }, sacada: { x: 0, y: 0, z: 96, yaw: 0 },
    portas, quebraveis: id,
    varredores: [
      { x: -7, z: 40, y: 0, y0: 0.25, y1: 1.15, raio: 6, vel: 1.3 },
      { x: 7, z: 40, y: 0, y0: 0.25, y1: 1.15, raio: 6, vel: -1.5 },
    ],
    moveis: [
      { x: 0, y: 1, z: 70, meia: [2, 1, 1], eixo: 'x', amp: 10, periodo: 3.6, fase: 0, cor: 'laranja' },
      { x: 0, y: 1, z: 75, meia: [2, 1, 1], eixo: 'x', amp: 10, periodo: 3.6, fase: 0.5, cor: 'laranja' },
    ],
  };
}

// ------------------------------------------------------------------ 2. Pisa Leve
// Dois campos de pisos iguais sobre o nada: só um caminho é de verdade. Pisou num falso, ele
// treme e cai (e fica aberto para todo mundo ver). No meio, um descanso que vale de ponto.
function pisaLeve() {
  const lg = largada(10);
  const P = { cols: 8, rows: 9, tam: 2, gap: 0.3, y: 0, esp: 0.5 };
  const passo = P.tam + P.gap;
  const larg = P.cols * passo - P.gap;
  const campos = [3.3, 30.3].map((z0, i) => ({ z0, x0: -larg / 2, base: i * P.cols * P.rows }));
  return {
    id: 'pisaleve', nome: 'Pisa Leve', desc: 'Só um caminho de pisos é de verdade: os falsos caem', tipo: 'corrida', tempo: 110, cor: '#22d3ee',
    caixas: [lg.caixa, plat(-10, 0, 10, 3, 0, 'lilas'), plat(-10, 24, 10, 30, 0, 'lilas'), plat(-10, 51, 10, 62, 0, 'lilas')],
    portao: lg.portao, nascer: lg.nascer, queda: -8,
    pontos: [lg.inicio, { area: [-10, -1, 24, 10, 8, 30], x: 0, y: 0, z: 27, yaw: FRENTE }],
    chegada: [-10, -0.5, 55, 10, 8, 62], arco: { z: 55, x0: -10, x1: 10, y: 0 }, sacada: { x: 0, y: 0, z: 59, yaw: 0 },
    pisaLeve: { ...P, passo, campos }, quebraveis: campos.length * P.cols * P.rows,
  };
}

// ------------------------------------------------------------------ 3. Gira-Gira
// Uma arena redonda e duas barras girando em volta do pilar: a de baixo, pule; a de cima (que
// desce depois de 20 s), não pule. Cada vez mais rápido.
function giraGira() {
  const s = sacada(20, 5);
  return {
    id: 'giragira', nome: 'Gira-Gira', desc: 'Pule a barra de baixo, fique no chão na de cima', tipo: 'sobrevivencia', tempo: 70, cor: '#facc15',
    caixas: [{ c: [-1.1, 0, -1.1, 1.1, 3.6, 1.1], cor: 'roxo' }, s.caixa],
    discos: [{ x: 0, z: 0, r: 13, y: 0, esp: 1.2, cor: 'azul' }],
    barras: [
      { y0: 0.2, y1: 1.0, raio: 13.6, v0: 0.7, ac: 0.016, desde: 0, giro0: 0, cor: 'vermelho' },
      { y0: 2.05, y1: 2.8, raio: 13.6, v0: -0.55, ac: -0.012, desde: 22, giro0: Math.PI / 2, cor: 'amarelo' },
    ],
    nascer: { anel: 8, y: 0 }, queda: -6, sacada: s.lugar,
  };
}

// ------------------------------------------------------------------ 4. Ladeira das Bolas
// Quatro patamares morro acima e bolas enormes caindo lá do alto e rolando para baixo. Tem
// blocos para se esconder e, logo depois do portão, uma vala (as bolas caem nela).
function ladeiraDasBolas() {
  const L = 12;
  const lg = largada(L);
  const caixas = [
    lg.caixa, plat(-L, 0, L, 3, 0, 'lilas'),
    plat(-L, 6, L, 22, 0, 'rosa'), ...escada(-L, L, 22, 0, 5, { cor: 'rosa' }),
    plat(-L, 26, L, 42, 2, 'lilas', 3), ...escada(-L, L, 42, 2, 5, { cor: 'lilas' }),
    plat(-L, 46, L, 62, 4, 'rosa', 5), ...escada(-L, L, 62, 4, 5, { cor: 'rosa' }),
    plat(-L, 66, L, 90, 6, 'lilas', 7),
  ];
  // a mureta dos lados (segura as bolas e quem é empurrado)
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -L - 0.6 : L;
    caixas.push({ c: [x0, 0, 6, x0 + 0.6, 1.2, 26], cor: 'branco' }, { c: [x0, 0, 26, x0 + 0.6, 3.2, 46], cor: 'branco' },
      { c: [x0, 0, 46, x0 + 0.6, 5.2, 66], cor: 'branco' }, { c: [x0, 0, 66, x0 + 0.6, 7.2, 90], cor: 'branco' });
  }
  // blocos para se esconder: entre as faixas das bolas (x = -6, 0, 6)
  const abrigos = [[-6, 12, 0], [6, 16, 0], [0, 19, 0], [0, 30, 2], [-6, 35, 2], [6, 38, 2], [6, 50, 4], [0, 54, 4], [-6, 58, 4], [-6, 70, 6], [6, 70, 6]];
  for (const [x, z, y] of abrigos) caixas.push({ c: [x - 1.2, y, z - 0.7, x + 1.2, y + 1.8, z + 0.7], cor: 'laranja' });
  return {
    id: 'ladeira', nome: 'Ladeira das Bolas', desc: 'Suba o morro sem ser atropelado pelas bolas', tipo: 'corrida', tempo: 110, cor: '#fb923c',
    caixas, portao: lg.portao, nascer: lg.nascer, queda: -10,
    pontos: [
      lg.inicio,
      { area: [-L, 1.5, 26, L, 10, 42], x: 0, y: 2, z: 28, yaw: FRENTE },
      { area: [-L, 3.5, 46, L, 12, 62], x: 0, y: 4, z: 48, yaw: FRENTE },
      { area: [-L, 5.5, 66, L, 14, 80], x: 0, y: 6, z: 68, yaw: FRENTE },
    ],
    chegada: [-L, 5.5, 80, L, 14, 90], arco: { z: 80, x0: -L, x1: L, y: 6 }, sacada: { x: 0, y: 6, z: 86, yaw: 0 },
    bolas: {
      faixas: [-9, -3, 3, 9], r: 1.5, vel: 9, periodos: [3.7, 4.3, 3.4, 4.0], fases: [0, 0.37, 0.71, 0.18],
      zQueda: 74, alturaQueda: 14, zFim: 6, forca: 14, cor: 'vermelho',
      perfil: [[90, 6], [66, 6], [62, 4], [46, 4], [42, 2], [26, 2], [22, 0], [6, 0]],
    },
  };
}

// ------------------------------------------------------------------ 5. Bloco a Bloco
// Paredões passam pela plataforma, um atrás do outro e cada vez mais rápidos: ache o buraco,
// pule a parte baixa ou fique embaixo da parte alta. Quem é empurrado para fora está fora.
function blocoABloco() {
  const s = sacada(18, 5);
  return {
    id: 'bloco', nome: 'Bloco a Bloco', desc: 'Ache o buraco no paredão antes que ele te empurre', tipo: 'sobrevivencia', tempo: 72, cor: '#a78bfa',
    caixas: [plat(-10, -10, 10, 10, 0, 'azul', 1.5), s.caixa],
    paredes: {
      x0: -10, x1: 10, celulas: 5, esp: 1, zIni: 16, zFim: -16, atraso: 1.5,
      vel0: 5, velAc: 0.22, velMax: 10, intervalo0: 5.2, intervaloAc: 0.12, intervaloMin: 2.4,
      alturas: { cheio: [0, 3.4], baixo: [0, 0.9], alto: [2.05, 3.4] },
    },
    nascer: { x0: -8, x1: 8, z0: -8, z1: 4, y: 0, yaw: FRENTE }, queda: -6, sacada: s.lugar,
  };
}

// ------------------------------------------------------------------ 6. Esteira Doida
// Esteiras andando para trás, ventiladores soprando de lado, trampolins até o andar de cima,
// frutas rolando na esteira de lá e plataformas que vão e voltam sobre o vão.
function esteiraDoida() {
  const lg = largada(8);
  return {
    id: 'esteira', nome: 'Esteira Doida', desc: 'Esteira para trás, vento de lado e trampolim', tipo: 'corrida', tempo: 110, cor: '#4ade80',
    caixas: [lg.caixa, plat(-6, 30, 6, 38, 0, 'rosa'), plat(-6, 40, 6, 50, 4, 'lilas', 2), plat(-6, 76, 6, 80, 4, 'rosa', 2), plat(-6, 96, 6, 108, 4, 'lilas', 2)],
    portao: lg.portao, nascer: lg.nascer, queda: -10,
    pontos: [
      lg.inicio,
      { area: [-6, -0.5, 30, 6, 3, 38], x: 0, y: 0, z: 32, yaw: FRENTE },
      { area: [-6, 3.5, 76, 6, 10, 80], x: 0, y: 4, z: 77.5, yaw: FRENTE },
    ],
    chegada: [-6, 3.5, 100, 6, 10, 108], arco: { z: 100, x0: -6, x1: 6, y: 4 }, sacada: { x: 0, y: 4, z: 104, yaw: 0 },
    esteiras: [
      { c: [-4, -1, 0, 4, 0, 30], vx: 0, vz: -4.5 },
      { c: [-3, 3, 50, 3, 4, 76], vx: 0, vz: -5 },
    ],
    ventos: [
      // o vento passa da beirada da esteira: quem não segura vai para fora
      { c: [-6, -3, 8, 8, 6, 16], vx: 4.5, vz: 0, fan: { x: -7, y: 2.5, z: 12 } },
      { c: [-8, -3, 19, 6, 6, 27], vx: -4.5, vz: 0, fan: { x: 7, y: 2.5, z: 23 } },
    ],
    pads: [-3, 0, 3].map((x) => ({ x, z: 36, y: 0, r: 1.1, forca: 17 })),
    bolas: {
      faixas: [-1.5, 1.5], r: 0.55, vel: 7, periodos: [1.9, 2.3], fases: [0, 0.48],
      zQueda: 75, alturaQueda: 3, zFim: 40, forca: 9, cor: 'laranja', fruta: true,
      perfil: [[76, 4], [40, 4]],
    },
    moveis: [82.5, 87.5, 92.5].map((z, k) => ({ x: 0, y: 3.6, z, meia: [1.5, 0.4, 1.5], eixo: 'x', amp: 4, periodo: 3.2, fase: k * 0.33, cor: 'amarelo' })),
  };
}

// ------------------------------------------------------------------ 7. Memória
// 16 pisos mostram frutas por uns segundos e escondem. O telão diz uma fruta: vá para um piso
// dela antes que os outros caiam. Cada rodada mais rápida e com menos pisos certos.
const RODADAS_MEMORIA = [
  // [mostra, alvo, cai, volta] em segundos e quantos pisos têm a fruta certa
  [4.5, 3.2, 2.6, 1.4, 4], [4.0, 3.0, 2.6, 1.4, 3], [3.6, 2.8, 2.6, 1.4, 3], [3.2, 2.6, 2.6, 1.4, 2],
  [2.8, 2.4, 2.6, 1.4, 2], [2.5, 2.2, 2.6, 1.4, 2], [2.2, 2.0, 2.6, 1.4, 1], [2.0, 2.0, 2.6, 1.4, 1],
];
function memoria() {
  const s = sacada(17, 5);
  const preparo = 2.5;
  const tempo = Math.ceil(preparo + RODADAS_MEMORIA.reduce((n, [a, b, c, d]) => n + a + b + c + d, 0) + 1);
  return {
    id: 'memoria', nome: 'Memória', desc: 'Decore as frutas e corra para a que o telão pedir', tipo: 'sobrevivencia', tempo, cor: '#fb7185',
    caixas: [s.caixa],
    memoria: { cols: 4, rows: 4, tam: 4, gap: 0.8, y: 0, esp: 0.8, preparo, rodadas: RODADAS_MEMORIA, painel: { z: 14, y: 8 } },
    // cada um nasce no meio de um piso (entre eles é o vão)
    nascer: { lista: [-7.2, -2.4, 2.4, 7.2].flatMap((z) => [-7.2, -2.4, 2.4, 7.2].map((x) => ({ x, z }))), y: 0, yaw: FRENTE },
    queda: -6, sacada: s.lugar,
  };
}

// ------------------------------------------------------------------ 8. Sobe a Gosma
// Uma subida em zigue-zague (três trechos, um em cima do outro) com a gosma subindo atrás:
// encostou nela, está fora. Varredores, pêndulos, plataformas que somem e trampolins no caminho.
function sobeAGosma() {
  const lg = largada(6);
  const caixas = [
    lg.caixa,
    // trecho A (x de -4 a 4, para a frente): de 0 a 10 m
    plat(-4, 0, 4, 6, 0, 'rosa'), ...escada(-4, 4, 6, 0, 10, { fundo: 1, cor: 'rosa' }),
    plat(-4, 16, 4, 24, 4, 'lilas', 2), ...escada(-4, 4, 24, 4, 5, { fundo: 1.2, cor: 'lilas' }),
    plat(-4, 42, 4, 44, 6, 'rosa', 2), ...escada(-4, 4, 44, 6, 10, { fundo: 0.63, cor: 'rosa' }),
    // a primeira curva
    plat(-4, 50.3, 20, 58, 10, 'lilas', 2),
    // trecho B (x de 12 a 20, para trás): de 10 a 20 m
    ...escada(12, 20, 50.3, 10, 8, { dir: -1, cor: 'rosa' }),
    plat(15, 26, 17, 43.9, 13.2, 'rosa', 1),
    ...escada(12, 20, 26, 13.2, 8, { dir: -1, cor: 'lilas' }),
    plat(12, 4.6, 20, 6.6, 16.4, 'lilas', 2), ...escada(12, 20, 4.6, 16.4, 9, { fundo: 0.5, dir: -1, cor: 'rosa' }),
    // a segunda curva, em cima da largada
    plat(-20, -8, 20, 0.1, 20, 'rosa', 2),
    // trecho C (x de -20 a -12, para a frente): de 20 a 30 m
    ...escada(-20, -12, 0.1, 20, 8, { fundo: 0.9, cor: 'lilas' }),
    plat(-20, 7.3, -12, 13, 23.2, 'lilas', 2),
    plat(-20, 15.5, -12, 24, 27, 'rosa', 2), ...escada(-20, -12, 24, 27, 8, { cor: 'rosa' }),
    plat(-22, 30.4, -10, 42, 30.2, 'lilas', 2),
  ];
  return {
    id: 'gosma', nome: 'Sobe a Gosma', desc: 'Suba antes que a gosma rosa te alcance', tipo: 'corrida', tempo: 125, cor: '#ec4899',
    caixas, portao: lg.portao, nascer: { ...lg.nascer, x0: -4.5, x1: 4.5 }, queda: -14,
    pontos: [lg.inicio],
    chegada: [-22, 29.7, 34, -10, 38, 42], arco: { z: 34, x0: -22, x1: -10, y: 30.2 }, sacada: { x: -16, y: 30.2, z: 39, yaw: 0 },
    gosma: { y0: -6, vel: 0.3 },
    varredores: [
      { x: 0, z: 20, y: 4, y0: 0.25, y1: 1.1, raio: 4.3, vel: 1.6 },
      { x: 8, z: 54, y: 10, y0: 0.25, y1: 1.1, raio: 3.6, vel: -1.8 },
    ],
    moveis: [
      { x: 0, y: 5.5, z: 33.5, meia: [2, 0.5, 1.5], eixo: 'x', amp: 3, periodo: 3.4, fase: 0, cor: 'amarelo' },
      { x: 0, y: 5.5, z: 38.5, meia: [2, 0.5, 1.5], eixo: 'x', amp: 3, periodo: 3.4, fase: 0.5, cor: 'amarelo' },
      { x: 4, y: 21, z: -4, meia: [1.5, 1, 1.5], eixo: 'z', amp: 2.6, periodo: 2.6, fase: 0, cor: 'laranja' },
      { x: -6, y: 21, z: -4, meia: [1.5, 1, 1.5], eixo: 'z', amp: 2.6, periodo: 2.6, fase: 0.5, cor: 'laranja' },
    ],
    pendulos: [40, 35, 30].map((z, k) => ({ x: 16, z, y: 13.2, eixo: 10, braco: 8.6, abre: 0.95, periodo: 2.6, fase: k * 0.33, raio: 1.1, plano: 'x', meia: 9 })),
    sumidas: [17.1, 13.1, 9.1].map((z, k) => ({ c: [14, 15.8, z - 1.5, 18, 16.4, z + 1.5], periodo: 3, on: 0.6, fase: k * 0.3 })),
    pads: [-17.5, -14.5].map((x) => ({ x, z: 11.5, y: 23.2, r: 1.1, forca: 16 })),
  };
}

// ------------------------------------------------------------------ 9. Ilhas Saltitantes
// De ilha em ilha: trampolins, um caminho de plataformas que somem e voltam, elevadores e
// plataformas que vão e voltam até a chegada.
function ilhasSaltitantes() {
  const lg = largada(8);
  return {
    id: 'ilhas', nome: 'Ilhas Saltitantes', desc: 'Trampolim, plataforma que some e elevador', tipo: 'corrida', tempo: 110, cor: '#38bdf8',
    caixas: [
      lg.caixa, plat(-8, 0, 8, 10, 0, 'rosa'), plat(-8, 14, 8, 22, 3, 'lilas', 2), plat(-8, 44, 8, 52, 3, 'rosa', 2),
      plat(-8, 67, 8, 75, 9, 'lilas', 2), plat(-8, 91, 8, 103, 9, 'rosa', 2),
    ],
    portao: lg.portao, nascer: lg.nascer, queda: -10,
    pontos: [
      lg.inicio,
      { area: [-8, 2.5, 14, 8, 10, 22], x: 0, y: 3, z: 16, yaw: FRENTE },
      { area: [-8, 2.5, 44, 8, 10, 52], x: 0, y: 3, z: 46, yaw: FRENTE },
      { area: [-8, 8.5, 67, 8, 16, 75], x: 0, y: 9, z: 69, yaw: FRENTE },
    ],
    chegada: [-8, 8.5, 95, 8, 16, 103], arco: { z: 95, x0: -8, x1: 8, y: 9 }, sacada: { x: 0, y: 9, z: 99, yaw: 0 },
    pads: [-5, -1.7, 1.7, 5].map((x) => ({ x, z: 8.6, y: 0, r: 1.1, forca: 16 })),
    varredores: [{ x: 0, z: 18, y: 3, y0: 0.25, y1: 1.1, raio: 6.5, vel: 1.4 }],
    sumidas: [[-3, 24.5], [3, 28.5], [-3, 32.5], [3, 36.5], [-3, 40.5]].map(([x, z], k) => ({ c: [x - 1.8, 2.4, z - 1.8, x + 1.8, 3, z + 1.8], periodo: 3.2, on: 0.62, fase: k * 0.18 })),
    moveis: [
      // os elevadores (sobem e descem)
      ...[[55.5, 4.6, 0], [59.5, 6.6, 0.33], [63.5, 8.6, 0.66]].map(([z, topo, fase]) => ({ x: 0, y: topo - 0.4, z, meia: [1.6, 0.4, 1.6], eixo: 'y', amp: 1.8, periodo: 3.6, fase, cor: 'amarelo' })),
      // e os que vão e voltam de lado
      ...[78.5, 83.5, 88.5].map((z, k) => ({ x: 0, y: 8.6, z, meia: [1.75, 0.4, 1.75], eixo: 'x', amp: 5, periodo: 3.8, fase: k * 0.3, cor: 'laranja' })),
    ],
  };
}

// ------------------------------------------------------------------ 10. Martelada
// Pontes estreitas com martelos balançando, um varredor, um corredor de socadores que saem dos
// lados e uma última ponte com martelos que vêm de frente.
function martelada() {
  const lg = largada(8);
  const caixas = [
    lg.caixa, plat(-2.5, 0, 2.5, 30, 0, 'rosa'), plat(-8, 30, 8, 40, 0, 'lilas'), plat(-4, 40, 4, 64, 0, 'rosa'),
    plat(-8, 64, 8, 72, 0, 'lilas'), plat(-2, 72, 2, 98, 0, 'rosa'), plat(-8, 98, 8, 110, 0, 'lilas'),
  ];
  const socadores = [[44, -1], [48, 1], [52, -1], [56, 1], [60, -1]].map(([z, lado], k) => ({ z, lado, alcance: 7.6, periodo: 2.4, fase: k * 0.2 }));
  // a base de cada socador, do lado de fora do corredor
  for (const s of socadores) caixas.push({ c: [s.lado < 0 ? -6.6 : 5.2, -1, s.z - 1.5, s.lado < 0 ? -5.2 : 6.6, 3.2, s.z + 1.5], cor: 'escuro' });
  return {
    id: 'martelada', nome: 'Martelada', desc: 'Martelos, socadores e pontes estreitas', tipo: 'corrida', tempo: 110, cor: '#ef4444',
    caixas, portao: lg.portao, nascer: lg.nascer, queda: -10,
    pontos: [
      lg.inicio,
      { area: [-8, -0.5, 30, 8, 8, 40], x: 0, y: 0, z: 32, yaw: FRENTE },
      { area: [-8, -0.5, 64, 8, 8, 72], x: 0, y: 0, z: 66, yaw: FRENTE },
    ],
    chegada: [-8, -0.5, 102, 8, 8, 110], arco: { z: 102, x0: -8, x1: 8, y: 0 }, sacada: { x: 0, y: 0, z: 106, yaw: 0 },
    pendulos: [
      ...[6, 12, 18, 24].map((z, k) => ({ x: 0, z, y: 0, eixo: 10, braco: 8.6, abre: 0.95, periodo: 2.4, fase: k * 0.27, raio: 1.2, plano: 'x', meia: 9 })),
      ...[78, 85, 92].map((z, k) => ({ x: 0, z, y: 0, eixo: 10, braco: 8.6, abre: 0.9, periodo: 2.8, fase: k * 0.31, raio: 1.3, plano: 'z', meia: 3 })),
    ],
    varredores: [{ x: 0, z: 35, y: 0, y0: 0.25, y1: 1.1, raio: 7.6, vel: 1.7 }],
    socadores,
  };
}

// ------------------------------------------------------------------ a final: Hexágonos
// Três andares de hexágonos (pontudos para o norte). Pisou, ele fica vermelho e cai logo depois.
function hexagonos() {
  const hex = { andares: [0, -9, -18], anel: 4, raio: 1.95, caiEm: 650 };
  const pisos = [];
  const r = hex.raio + 0.05;
  hex.andares.forEach((y, andar) => {
    for (let q = -hex.anel; q <= hex.anel; q++) {
      for (let s = Math.max(-hex.anel, -q - hex.anel); s <= Math.min(hex.anel, -q + hex.anel); s++) {
        pisos.push({ id: pisos.length, andar, x: Math.sqrt(3) * r * (q + s / 2), z: 1.5 * r * s, y });
      }
    }
  });
  const s = sacada(31, 6);
  return {
    id: 'hexagonos', nome: 'Hexágonos', desc: 'O piso que você pisa cai: o último em pé vence', tipo: 'final', tempo: 150, cor: '#facc15',
    caixas: [s.caixa], hex: { ...hex, pisos }, pisos: pisos.length,
    nascer: { anel: 6, y: 0 }, queda: -30, sacada: s.lugar,
  };
}

export const FASES = [
  portasBaguncadas(), pisaLeve(), giraGira(), ladeiraDasBolas(), blocoABloco(),
  esteiraDoida(), memoria(), sobeAGosma(), ilhasSaltitantes(), martelada(), hexagonos(),
];
