// Vila da Neve: uma vila nas montanhas. No meio, um lago congelado (dá para patinar) com uma rua em
// anel em volta. Da Praça do Pinheirão, na porta do prédio, sobem a rua do estádio e a Rua Leste,
// que passa pelo autódromo e pelo anel e, no alto, vira para leste até o vale do parque. Do anel
// sai a rua do norte: quadras, praça dos jogos, aventura e, no fim, o kartódromo.
// Só números (ver mapas-dados.js). Setas das placas: quem olha para o norte (+z) tem o +x à esquerda.

const LAGO = { x: 40, z: 300 };
const R_ANEL = 62;
// a rua em anel: um círculo de pontos (fechado)
const anel = Array.from({ length: 41 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2;
  return [LAGO.x + Math.cos(a) * R_ANEL, LAGO.z + Math.sin(a) * R_ANEL];
});
const SUL = ['↓', 'praca', 'Praça do Pinheirão e prédio'];

export const NEVE = {
  nome: 'Vila da Neve',
  desc: 'Montanhas nevadas, pinheiros e um lago congelado para patinar',
  cor: '#93c5fd',
  atracoes: {
    pista: { cx: 340, cz: 290, giro: -0.69 },
    kart: { x: 100, z: 712, giro: 0 },
    estadio: { cx: 60, cz: 140, giro: Math.PI / 2 },
    quadras: { x: 40, z: 420 },
    salao: { x: 300, z: 820 },
    queimada: { x: 400, z: 820 },
    pinta: { x: 430, z: 720 },
    golfe: { x: 275, z: 690 },
    gincana: { x: -32, z: 477 }, // na pracinha da aventura, junto dos portais do céu
  },
  cidade: {
    hub: { x: 100, z: 30, r: 28, nome: 'Praça do Pinheirão' },
    ruas: [
      { nome: 'Alameda do Prédio', pontos: [[62, 30], [74, 30]], largura: 12 },
      { nome: 'Rua do Estádio', pontos: [[96, 56], [86, 90]], largura: 10 },
      { nome: 'Rua Leste', pontos: [[118, 52], [135, 76], [135, 550], [330, 550], [350, 566], [350, 704]], largura: 10, curva: true },
      { nome: 'Rua do Autódromo', pontos: [[135, 107], [222, 107]], largura: 10, pista: true },
      { nome: 'Rua do Lago', pontos: [[102, 300], [135, 300]], largura: 8 },
      { nome: 'Anel do Lago', pontos: anel, largura: 8 },
      { nome: 'Rua do Norte', pontos: [[14, 357], [14, 556], [-37, 556], [-37, 606]], largura: 8 },
      { nome: 'Rua da Aventura', pontos: [[14, 470], [-9, 470]], largura: 8 },
      { nome: 'Rua do Golfe', pontos: [[333, 712], [300, 712], [300, 657]], largura: 8 },
      { nome: 'Rua do Salão', pontos: [[350, 737], [350, 790], [300, 790]], largura: 8 },
      { nome: 'Rua da Queimada', pontos: [[350, 790], [400, 790], [400, 804]], largura: 8 },
      { nome: 'Rua do Pinta', pontos: [[366, 708], [430, 686]], largura: 8 },
    ],
    pracas: [{ x: -25, z: 470, r: 16, cor: '#f472b6' }],
    pisos: [{ x0: 20, x1: 120, z0: 444, z1: 534 }],
    mesas: { xadrez: { x: 45, z: 466 }, dama: { x: 95, z: 466 }, velha: { x: 45, z: 512 }, dados: { x: 95, z: 512 } },
    portais: { surf: { x: -19, z: 463 }, matamata: { x: -19, z: 477 }, times: { x: -32, z: 463 } },
    agua: [{ x: LAGO.x, z: LAGO.z, r: 48, tipo: 'gelo' }],
    parque: {
      praca: { x: 350, z: 720, r: 18 },
      portico: { area: 'parque', x: 350, z: 600, giro: Math.PI, vao: 12 },
      placa: {
        x: 358, z: 701, giro: Math.PI,
        frente: [
          ['↖', { nome: 'Pinta-território', sub: 'Times pintam o chão', cor: '#d946ef' }],
          ['↑', { nome: 'Salão de jogos', sub: 'Pingue-pongue, sinuca, truco, uno e 21', cor: '#4ade80' }],
          ['↑', { nome: 'Queimada', sub: 'Dois times, uma bola', cor: '#f97316' }],
          ['→', { nome: 'Minigolfe', sub: '9 buracos', cor: '#a3e635' }],
        ],
        verso: [['↓', 'praca', 'A vila: lago, praça e prédio']],
      },
    },
    areas: {
      predio: { nome: 'Prédio', sub: 'Cinema, telão, parkour e ringue', cor: '#e2e8f0', ir: { pos: [0, 0, -2], yaw: 0 } },
      praca: { nome: 'Praça do Pinheirão', sub: 'O ponto de encontro da vila', cor: '#fde68a', ir: { pos: [100, 0, 14], yaw: Math.PI } },
      estadio: { nome: 'Estádio', sub: 'Futebol de carro', cor: '#22d3ee', ir: { pos: [84, 0, 89], yaw: Math.PI } },
      autodromo: { nome: 'Autódromo', sub: 'Corrida de carro contra o relógio', cor: '#6ee7c8', ir: { pos: [200, 0, 107], yaw: -Math.PI / 2 } },
      lago: { nome: 'Lago congelado', sub: 'Pista de patinação no gelo', cor: '#93c5fd', ir: { pos: [114, 0, 300], yaw: Math.PI / 2 } },
      quadras: { nome: 'Quadras', sub: 'Vôlei, basquete e boliche', cor: '#facc15', ir: { pos: [14, 0, 392], yaw: Math.PI } },
      jogos: { nome: 'Praça dos jogos', sub: 'Xadrez, dama, jogo da velha e dados', cor: '#a78bfa', ir: { pos: [22, 0, 490], yaw: -Math.PI / 2 } },
      aventura: { nome: 'Aventura', sub: 'Portais: surf, mata-mata e gincana', cor: '#f472b6', ir: { pos: [-4, 0, 470], yaw: Math.PI / 2 } },
      kart: { nome: 'Kartódromo', sub: 'Corrida de kart com itens', cor: '#facc15', ir: { pos: [-37, 0, 596], yaw: Math.PI } },
      parque: { nome: 'Vale do parque', sub: 'Salão de jogos, queimada, pinta e golfe', cor: '#4ade80', ir: { pos: [350, 0, 690], yaw: Math.PI } },
    },
    porticos: [
      { area: 'autodromo', x: 190, z: 107, giro: -Math.PI / 2, vao: 10 },
      { area: 'lago', x: 122, z: 300, giro: Math.PI / 2, vao: 8 },
      { area: 'quadras', x: 14, z: 384, giro: Math.PI, vao: 8 },
      { area: 'aventura', x: 2, z: 470, giro: Math.PI / 2, vao: 8 },
      { area: 'kart', x: -37, z: 584, giro: Math.PI, vao: 8 },
    ],
    placas: [
      {
        x: 108, z: 63, giro: Math.PI,
        frente: [['↗', 'estadio'], ['↖', 'autodromo'], ['↖', 'lago', 'Lago congelado, quadras e jogos'], ['↖', 'parque']],
      },
      { x: 124, z: 21, giro: -Math.PI / 2, frente: [['↑', 'praca']], verso: [['↑', 'predio']] },
      { x: 75, z: 39, giro: Math.PI / 2, frente: [['↑', 'predio']], verso: [['↑', 'praca']] },
      {
        x: 127, z: 100, giro: Math.PI,
        frente: [['←', 'autodromo'], ['↑', 'lago'], ['↑', 'parque']],
        verso: [['→', 'autodromo'], SUL],
      },
      {
        x: 143, z: 292, giro: Math.PI,
        frente: [['→', 'lago', 'Lago congelado: patine no gelo'], ['→', 'quadras'], ['→', 'jogos'], ['→', 'kart'], ['↑', 'parque']],
        verso: [['←', 'lago'], ['←', 'quadras'], ['↓', 'autodromo'], SUL],
      },
      { x: 127, z: 545, giro: Math.PI, frente: [['←', 'parque']] },
      {
        x: 22, z: 376, giro: Math.PI,
        frente: [['↑', 'quadras'], ['↑', 'jogos'], ['↑', 'aventura'], ['↑', 'kart']],
        verso: [['↓', 'lago'], ['↓', 'praca', 'Praça do Pinheirão e prédio']],
      },
      { x: 6, z: 478, giro: Math.PI, frente: [['→', 'aventura'], ['←', 'jogos'], ['↑', 'kart']], verso: [['↓', 'quadras'], ['↓', 'lago']] },
    ],
    quadros: [
      {
        area: 'estadio', x: 98, z: 84, giro: Math.PI,
        linhas: ['Futebol de carro, em dois times', 'Na faixa da entrada, aperte E para jogar', 'Turbo: Shift ou correr · pulo: Espaço', 'Faça gol empurrando a bola com o carro'],
      },
      {
        area: 'autodromo', x: 180, z: 115, giro: -Math.PI / 2,
        linhas: ['Vire carro (G ou o botão do carro) e entre na pista', 'Passe pela largada: o tempo da volta começa', 'Saiu da pista? R volta para ela', 'O melhor tempo fica no placar'],
      },
      {
        area: 'lago', x: 122, z: 309, giro: Math.PI / 2,
        linhas: ['O lago está congelado: entre e deslize', 'No gelo você escorrega: freie com cuidado', 'Pule para dar uma pirueta', 'Em volta, o anel leva a toda a vila'],
      },
      {
        area: 'quadras', x: 22, z: 398, giro: Math.PI,
        linhas: ['Vôlei e basquete: é só chegar perto da bola', 'Segure o clique (ou Ação) e solte para jogar', 'Boliche: E na pista para entrar na fila', 'Na sua vez, a mesma coisa: segure e solte'],
      },
      {
        area: 'jogos', x: 22, z: 540, giro: -Math.PI / 2,
        linhas: ['Xadrez de bruxo, dama, jogo da velha e dados', 'Chegue perto de uma mesa e aperte E', 'Contra outra pessoa ou contra o computador', 'No xadrez dá até para falar o lance'],
      },
      {
        area: 'aventura', x: 2, z: 461, giro: Math.PI / 2,
        linhas: ['Portais com E · gincana: 10 fases e a final', 'Surf: deslize de lado nas rampas', 'Mata-mata: pegue as armas do chão', 'Em times: derrube o time do outro lado'],
      },
      {
        area: 'kart', x: -29, z: 590, giro: Math.PI,
        linhas: ['Entre na fila com E na placa da entrada', 'Na largada você vai para o grid', 'Caixas "?" dão itens: turbo, casca, míssil', 'Use o item com o clique (ou Ação)'],
      },
      {
        area: 'parque', x: 342, z: 610, giro: Math.PI,
        linhas: ['Salão de jogos: pingue-pongue, sinuca, truco, uno e 21', 'Queimada, pinta-território e minigolfe', 'O salão fica no alto, no fim da subida', 'Em cada jogo: chegue perto e aperte E'],
      },
    ],
    mapasAqui: [
      { x: 76, z: 16, giro: -Math.PI / 2 },
      { x: 342, z: 701, giro: Math.PI },
    ],
    bosques: [
      { x0: -52, x1: 130, z0: 60, z1: 570 },
      { x0: 130, x1: 480, z0: 533, z1: 860 },
      { x0: -52, x1: 480, z0: -40, z1: 60 },
    ],
    rotulos: {
      predio: [4, 10], praca: [100, 30], estadio: [60, 140], autodromo: [340, 290], lago: [40, 300], quadras: [40, 420],
      jogos: [70, 490], aventura: [-25, 488], kart: [100, 712], parque: [350, 720],
    },
  },
  tema: {
    id: 'neve',
    ceu: ['#2856a6', '#5f8fd6', '#dde9f7', '#9fb3cc', '#ffffff'],
    nevoa: { cor: '#dce7f3', perto: 260, longe: 1900 },
    sol: { cor: '#f4f8ff', forca: 1.55 },
    hemi: { chao: '#dfe8f2', forca: 1.55 },
    exposicao: 1.0,
    nuvens: '#f5f8ff',
    relevo: { serra: 1.25, mar: false, neveAcima: 40 },
    cores: { grama: '#eef3f8', gramaSeca: '#dfe7f0', mata: '#c9d6e3', rocha: '#6d717c', rochaFria: '#59607a', neve: '#ffffff', areia: '#e9eef4', areiaMolhada: '#cfd9e4' },
    arvores: { pinheiroNeve: 0.8, pinheiro: 0.2 },
    flores: [],
    arbusto: '#e8eef5',
    pedra: '#7b8090',
    rua: { tipo: 'pedra', guia: '#f3f6fa' },
    piso: 'laje',
    poste: 'lampiao',
    portico: 'chale',
    placa: { fundo: '#3b2a20', faixa: true },
    cerca: '#5b4130',
    passaros: '#1b1726',
    particulas: 'brilho',
  },
};
