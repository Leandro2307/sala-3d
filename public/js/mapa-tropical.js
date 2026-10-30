// Baía Tropical: uma cidade de praia. Da porta do prédio sai a Praça do Farol e dela o Calçadão, uma
// orla reta de madeira que sobe a cidade inteira com coqueiros dos dois lados: passa pela praça dos
// jogos, pelo estádio, pela praia das quadras, pela lagoa azul (com píer) e chega no parque, no
// norte. O autódromo fica a nordeste, o kartódromo a sudeste, colado na praça.
// Só números (ver mapas-dados.js). Setas das placas: quem olha para o norte (+z) tem o +x à esquerda; no verso, ↑ é o que fica à frente de
// quem lê. Os dois lados de uma placa têm o mesmo número de destinos (nada de tábua vazia).

const AV = 95; // x do Calçadão
const NORTE = ['↑', 'parque', 'Lagoa, aventura e o parque'];

export const TROPICAL = {
  nome: 'Baía Tropical',
  desc: 'Praia, lagoa azul e coqueiros, com um calçadão que liga tudo',
  cor: '#22d3ee',
  atracoes: {
    catedral: { x: 148, z: 619 }, // a catedral gótica, ponto de encontro (catedral.js); a fachada olha para o sul
    pista: { cx: 345, cz: 580, giro: -0.95 },
    kart: { x: 330, z: 140, giro: 0 },
    estadio: { cx: 33, cz: 190, giro: 0 },
    quadras: { x: 10, z: 340 },
    salao: { x: 40, z: 87, letreiro: 'leste' }, // colado no prédio, ao norte; o letreiro olha para a Rua do Salão
    queimada: { x: 30, z: 760 },
    pinta: { x: 55, z: 637 },
    golfe: { x: -27, z: 757 },
    gincana: { x: 17, z: 392 }, // na pracinha da aventura, junto dos portais do céu
    fantasmas: { x: 24, z: 385 }, // o caça-fantasmas, no meio da pracinha da aventura
  },
  cidade: {
    hub: { x: 100, z: 30, r: 28, nome: 'Praça do Farol' },
    ruas: [
      { nome: 'Alameda do Prédio', pontos: [[62, 30], [74, 30]], largura: 12 },
      { nome: 'Calçadão', pontos: [[AV, 56], [AV, 684]], largura: 12 },
      { nome: 'Rua do Kart', pontos: [[126, 32], [188, 40]], largura: 10 },
      { nome: 'Rua do Estádio', pontos: [[AV, 214], [80, 214]], largura: 8 },
      { nome: 'Rua da Praia', pontos: [[AV, 322], [-40, 322]], largura: 8 },
      { nome: 'Rua da Aventura', pontos: [[AV, 385], [40, 385]], largura: 8 },
      { nome: 'Píer', pontos: [[AV, 475], [52, 475]], largura: 4, tipo: 'pier' },
      { nome: 'Rua do Autódromo', pontos: [[AV, 427], [185, 427]], largura: 10, pista: true },
      { nome: 'Rua do Pinta', pontos: [[AV, 600], [55, 600]], largura: 8 },
      { nome: 'Rua do Golfe', pontos: [[78, 700], [-2, 700], [-2, 716]], largura: 8 },
      { nome: 'Rua da Queimada', pontos: [[30, 700], [30, 744]], largura: 6 },
      { nome: 'Rua do Salão', pontos: [[AV, 82], [70, 82]], largura: 8 },
    ],
    pracas: [{ x: 25, z: 385, r: 16, cor: '#f472b6' }],
    pisos: [{ x0: 104, x1: 190, z0: 118, z1: 232 }],
    mesas: { xadrez: { x: 126, z: 150 }, dama: { x: 168, z: 150 }, velha: { x: 126, z: 200 }, dados: { x: 168, z: 200 } },
    portais: { surf: { x: 31, z: 378 }, matamata: { x: 31, z: 392 }, times: { x: 17, z: 378 } },
    agua: [{ x: 25, z: 475, r: 52, tipo: 'lagoa' }],
    parque: {
      praca: { x: AV, z: 700, r: 18 },
      portico: { area: 'parque', x: AV, z: 664, giro: Math.PI, vao: 12 },
      placa: {
        x: AV + 9, z: 683, giro: Math.PI,
        frente: [
          ['→', { nome: 'Minigolfe e queimada', sub: 'Pela Rua do Golfe', cor: '#a3e635' }],
        ],
        verso: [['↑', 'praca', 'O Calçadão: lagoa, praia, estádio e praça']],
      },
    },
    areas: {
      catedral: { nome: 'Catedral', sub: 'Ponto de encontro, com o interior aberto', cor: '#e9d5ff', ir: { pos: [148, 0, 550], yaw: Math.PI } },
      predio: { nome: 'Prédio', sub: 'Cinema, telão, parkour e ringue', cor: '#e2e8f0', ir: { pos: [0, 0, -2], yaw: 0 } },
      praca: { nome: 'Praça do Farol', sub: 'O ponto de encontro: daqui sai o Calçadão', cor: '#fde68a', ir: { pos: [100, 0, 14], yaw: Math.PI } },
      salao: { nome: 'Salão de jogos', sub: 'Pingue-pongue, sinuca, poker e cartas', cor: '#4ade80', ir: { pos: [80, 0, 82], yaw: Math.PI / 2 } },
      kart: { nome: 'Kartódromo', sub: 'Corrida de kart com itens', cor: '#facc15', ir: { pos: [180, 0, 39], yaw: -Math.PI / 2 } },
      jogos: { nome: 'Praça dos jogos', sub: 'Xadrez, dama, jogo da velha 2 e dados', cor: '#a78bfa', ir: { pos: [108, 0, 175], yaw: -Math.PI / 2 } },
      estadio: { nome: 'Estádio', sub: 'Futebol de carro', cor: '#22d3ee', ir: { pos: [83, 0, 214], yaw: Math.PI / 2 } },
      quadras: { nome: 'Praia das quadras', sub: 'Vôlei de praia, basquete e boliche', cor: '#facc15', ir: { pos: [10, 0, 318], yaw: Math.PI } },
      aventura: { nome: 'Aventura', sub: 'Portais: surf, mata-mata, gincana e caça-fantasmas', cor: '#f472b6', ir: { pos: [46, 0, 385], yaw: Math.PI / 2 } },
      lago: { nome: 'Lagoa Azul', sub: 'Areia, píer e água transparente', cor: '#2dd4bf', ir: { pos: [88, 0, 475], yaw: Math.PI / 2 } },
      autodromo: { nome: 'Autódromo', sub: 'Corrida de carro contra o relógio', cor: '#6ee7c8', ir: { pos: [175, 0, 427], yaw: -Math.PI / 2 } },
      parque: { nome: 'Parque', sub: 'Queimada, pinta e golfe', cor: '#4ade80', ir: { pos: [AV, 0, 686], yaw: Math.PI } },
    },
    porticos: [
      { area: 'kart', x: 160, z: 36.4, giro: -Math.PI / 2 - 0.13, vao: 10 },
      { area: 'quadras', x: 72, z: 322, giro: Math.PI / 2, vao: 8 },
      { area: 'aventura', x: 70, z: 385, giro: Math.PI / 2, vao: 8 },
      { area: 'autodromo', x: 140, z: 427, giro: -Math.PI / 2, vao: 10 },
    ],
    placas: [
      { x: AV + 9, z: 62, giro: Math.PI, frente: [['↗', 'salao'], ['↑', 'jogos'], ['↑', 'estadio'], ['↑', 'quadras'], ['↑', 'aventura'], ['↑', 'lago'], ['↑', 'autodromo'], ['↑', 'parque']] },
      { x: 124, z: 21, giro: -Math.PI / 2, frente: [['↑', 'kart']], verso: [['↑', 'praca', 'Praça do Farol e o prédio']] },
      { x: 75, z: 39, giro: Math.PI / 2, frente: [['↑', 'predio']], verso: [['↑', 'praca', 'Praça do Farol, Calçadão e kart']] },
      {
        x: AV - 9, z: 168, giro: Math.PI,
        frente: [['←', 'jogos'], ['↑', 'estadio'], ['↑', 'quadras'], NORTE],
        verso: [['→', 'jogos'], ['↑', 'salao'], ['↑', 'praca', 'Praça do Farol e kart'], ['↑', 'predio']],
      },
      {
        x: AV + 9, z: 207, giro: Math.PI,
        frente: [['→', 'estadio'], ['↑', 'quadras'], ['↑', 'autodromo'], NORTE],
        verso: [['←', 'estadio'], ['↑', 'jogos'], ['↑', 'salao'], ['↑', 'praca', 'Praça do Farol, prédio e kart']],
      },
      {
        x: AV + 9, z: 315, giro: Math.PI,
        frente: [['→', 'quadras'], ['↑', 'aventura'], ['↑', 'autodromo'], NORTE],
        verso: [['←', 'quadras'], ['↑', 'estadio'], ['↑', 'salao'], ['↑', 'praca', 'Praça do Farol, prédio e kart']],
      },
      {
        x: AV + 9, z: 378, giro: Math.PI,
        frente: [['→', 'aventura'], ['↑', 'autodromo'], ['↑', 'lago'], ['↑', 'parque']],
        verso: [['←', 'aventura'], ['↑', 'quadras'], ['↑', 'estadio'], ['↑', 'praca', 'Praça do Farol, prédio e kart']],
      },
      {
        x: AV - 9, z: 420, giro: Math.PI,
        frente: [['←', 'autodromo'], ['↑', 'lago'], ['↑', { nome: 'Pinta-território', sub: 'Na Rua do Pinta, antes do parque', cor: '#d946ef' }], ['↑', 'parque']],
        verso: [['→', 'autodromo'], ['↑', 'aventura'], ['↑', 'quadras'], ['↑', 'praca', 'Praça do Farol, prédio e kart']],
      },
    ],
    quadros: [
      {
        area: 'kart', x: 150, z: 46, giro: -Math.PI / 2 - 0.13,
        linhas: ['Entre na fila com E na placa da entrada', 'Na largada você vai para o grid', 'Caixas "?" dão itens: turbo, casca, míssil', 'Use o item com o clique (ou Ação)'],
      },
      {
        area: 'estadio', x: 86, z: 224, giro: Math.PI / 2,
        linhas: ['Futebol de carro, em dois times', 'Na faixa da entrada, aperte E para jogar', 'Turbo: Shift ou correr · pulo: Espaço', 'Faça gol empurrando a bola com o carro'],
      },
      {
        area: 'quadras', x: 72, z: 313, giro: Math.PI / 2,
        linhas: ['Vôlei e basquete: é só chegar perto da bola', 'Segure o clique (ou Ação) e solte para jogar', 'Boliche: E na pista para entrar na fila', 'Na sua vez, a mesma coisa: segure e solte'],
      },
      {
        area: 'jogos', x: 108, z: 160, giro: -Math.PI / 2,
        linhas: ['Xadrez de bruxo, dama, jogo da velha 2 e dados', 'Chegue perto de uma mesa e aperte E', 'Contra outra pessoa ou contra o computador', 'No xadrez dá até para falar o lance'],
      },
      {
        area: 'aventura', x: 70, z: 376, giro: Math.PI / 2,
        linhas: ['Portais com E · gincana e caça-fantasmas', 'Surf: deslize de lado nas rampas', 'Mata-mata: pegue as armas do chão', 'Em times: derrube o time do outro lado'],
      },
      {
        area: 'autodromo', x: 140, z: 418, giro: -Math.PI / 2,
        linhas: ['Vire carro (G ou o botão do carro) e entre na pista', 'Passe pela largada: o tempo da volta começa', 'Saiu da pista? R volta para ela', 'O melhor tempo fica no placar'],
      },
      {
        area: 'parque', x: AV - 9, z: 672, giro: Math.PI,
        linhas: ['Queimada e minigolfe pela Rua do Golfe', 'Pinta-território na rua antes da praça', 'O salão de jogos fica ao lado do prédio', 'Em cada jogo: chegue perto e aperte E'],
      },
    ],
    mapasAqui: [
      { x: 72, z: 14, giro: -Math.PI / 2 },
      { x: 79, z: 684, giro: Math.PI },
    ],
    // onde nasce mata dentro da cerca (coqueiral)
    bosques: [
      { x0: 104, x1: 196, z0: 236, z1: 300 },
      { x0: -52, x1: 80, z0: 60, z1: 120 },
      { x0: -52, x1: 90, z0: 540, z1: 600 },
      { x0: -52, x1: 120, z0: 676, z1: 700 },
      { x0: 130, x1: 480, z0: 290, z1: 860 },
      { x0: 190, x1: 480, z0: -40, z1: 300 },
    ],
    // nome de cada área no mapa da tela
    rotulos: {
      catedral: [148, 619],
      predio: [4, 10], praca: [100, 30], salao: [40, 87], kart: [330, 140], jogos: [147, 175], estadio: [33, 190], quadras: [10, 340],
      aventura: [25, 400], lago: [25, 475], autodromo: [345, 580], parque: [AV, 700],
    },
  },
  tema: {
    id: 'tropical',
    // céu do meio-dia: [topo, meio, horizonte, abaixo do horizonte, halo do sol]
    ceu: ['#0b6fd6', '#38a6f2', '#c9f0ff', '#7fc6e0', '#fff7da'],
    nevoa: { cor: '#bfe9f7', perto: 380, longe: 2400 },
    sol: { cor: '#fff4dc', forca: 1.75 },
    hemi: { chao: '#c9b98a', forca: 1.5 },
    exposicao: 1.08,
    nuvens: '#ffffff',
    // o relevo: morros verdes só ao norte; nos outros lados a terra desce até o mar
    relevo: { serra: 0.55, mar: true, neveAcima: 9999 },
    cores: { grama: '#5fae45', gramaSeca: '#a7b54a', mata: '#2f7d3a', rocha: '#8a7c66', rochaFria: '#6f6a5c', neve: '#f4f1e8', areia: '#ecd9a5', areiaMolhada: '#cdb57c' },
    arvores: { palmeira: 0.65, frondosa: 0.2, palmeiraBaixa: 0.15 },
    flores: [0.95, 0.03, 0.83, 0.12, 0.55],
    arbusto: '#3f9a42',
    pedra: '#b8a888',
    rua: { tipo: 'madeira', guia: '#7a5a3a' },
    piso: 'deck',
    poste: 'tocha',
    portico: 'praia',
    placa: { fundo: '#1e3a4c', faixa: true },
    cerca: '#a07a4c',
    passaros: '#ffffff',
    particulas: null,
  },
};
