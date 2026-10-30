// Jardim do Outono: um jardim japonês no outono. Da Praça do Pagode, na porta do prédio, a Trilha do
// Jardim sobe fazendo curvas entre o jardim de pedras (as mesas dos jogos) e o estádio, passa pelas
// quadras e pelo lago das carpas (com uma ponte vermelha até o autódromo) e vira o Caminho dos Torii,
// que sobe pelo oeste com um portal atrás do outro até os jogos do parque. O kartódromo fica a
// sudeste, o autódromo ao norte.
// Só números (ver mapas-dados.js). Setas das placas: quem olha para o norte (+z) tem o +x à esquerda.

const SUL = ['↑', 'praca', 'Praça do Pagode e prédio'];

export const OUTONO = {
  nome: 'Jardim do Outono',
  desc: 'Bordos vermelhos, cerejeiras, lago de carpas e caminho de torii',
  cor: '#f97316',
  atracoes: {
    pista: { cx: 270, cz: 620, giro: -0.16 },
    kart: { x: 340, z: 190, giro: 0 },
    estadio: { cx: 140, cz: 180, giro: 0 },
    quadras: { x: 10, z: 300 },
    salao: { x: 166, z: 11, letreiro: 'oeste' }, // ao lado da praça da porta do prédio
    queimada: { x: 0, z: 680 },
    pinta: { x: 0, z: 760 },
    golfe: { x: -15, z: 500 },
    gincana: { x: 5, z: 427 }, // na pracinha da aventura, junto dos portais do céu
    fantasmas: { x: 11.5, z: 420 }, // o caça-fantasmas, no meio da pracinha da aventura
  },
  cidade: {
    hub: { x: 100, z: 30, r: 28, nome: 'Praça do Pagode' },
    ruas: [
      { nome: 'Alameda do Prédio', pontos: [[62, 30], [74, 30]], largura: 12 },
      {
        nome: 'Trilha do Jardim',
        pontos: [[100, 56], [93, 95], [90, 140], [89, 200], [90, 250], [100, 282], [104, 320], [98, 360], [80, 392], [46, 410], [36, 440], [36, 520], [37, 600], [36, 680], [37, 760], [36, 846]],
        largura: 8, curva: true,
      },
      { nome: 'Trilha do Estádio', pontos: [[90, 255], [150, 258], [192, 250], [192, 210]], largura: 7, curva: true },
      { nome: 'Trilha das Quadras', pontos: [[90, 268], [50, 282], [-40, 284]], largura: 7, curva: true },
      { nome: 'Ponte das Carpas', pontos: [[104, 320], [196, 320]], largura: 5, tipo: 'ponte' },
      { nome: 'Trilha do Autódromo', pontos: [[196, 320], [204, 352], [240, 385], [262, 400]], largura: 8, curva: true, pista: true },
      { nome: 'Trilha do Kart', pontos: [[126, 40], [165, 60], [198, 88]], largura: 8, curva: true },
      { nome: 'Trilha da Aventura', pontos: [[46, 420], [28, 420]], largura: 6 },
      { nome: 'Trilha do Golfe', pontos: [[36, 466], [9, 466]], largura: 6 },
      { nome: 'Trilha do Salão', pontos: [[127, 28], [136, 28]], largura: 6 },
      { nome: 'Trilha da Queimada', pontos: [[36, 664], [0, 664]], largura: 6 },
      { nome: 'Trilha do Pinta', pontos: [[36, 727], [0, 727]], largura: 6 },
    ],
    pracas: [{ x: 12, z: 420, r: 16, cor: '#f472b6' }],
    pisos: [{ x0: -40, x1: 80, z0: 96, z1: 234, tipo: 'cascalho' }],
    mesas: { xadrez: { x: 0, z: 130 }, dama: { x: 50, z: 130 }, velha: { x: 0, z: 200 }, dados: { x: 50, z: 200 } },
    portais: { surf: { x: 18, z: 413 }, matamata: { x: 18, z: 427 }, times: { x: 5, z: 413 } },
    agua: [{ x: 150, z: 320, r: 38, tipo: 'carpas' }],
    // um torii a cada 14 m no Caminho dos Torii (o trecho norte da Trilha do Jardim)
    toriis: { rua: 'Trilha do Jardim', z0: 446, z1: 842, passo: 14 },
    parque: { praca: null, portico: null },
    areas: {
      predio: { nome: 'Prédio', sub: 'Cinema, telão, parkour e ringue', cor: '#e2e8f0', ir: { pos: [0, 0, -2], yaw: 0 } },
      praca: { nome: 'Praça do Pagode', sub: 'O ponto de encontro do jardim', cor: '#fca5a5', ir: { pos: [100, 0, 14], yaw: Math.PI } },
      salao: { nome: 'Salão de jogos', sub: 'Pingue-pongue, sinuca, poker e cartas', cor: '#4ade80', ir: { pos: [126, 0, 28], yaw: -Math.PI / 2 } },
      kart: { nome: 'Kartódromo', sub: 'Corrida de kart com itens', cor: '#facc15', ir: { pos: [186, 0, 80], yaw: -Math.PI / 2 } },
      jogos: { nome: 'Jardim dos jogos', sub: 'Xadrez, dama, jogo da velha 2 e dados', cor: '#a78bfa', ir: { pos: [82, 0, 165], yaw: Math.PI / 2 } },
      estadio: { nome: 'Estádio', sub: 'Futebol de carro', cor: '#22d3ee', ir: { pos: [189, 0, 207], yaw: 0 } },
      quadras: { nome: 'Quadras', sub: 'Vôlei, basquete e boliche', cor: '#facc15', ir: { pos: [10, 0, 280], yaw: Math.PI } },
      lago: { nome: 'Lago das carpas', sub: 'Peixes coloridos e a ponte vermelha', cor: '#fb7185', ir: { pos: [100, 0, 320], yaw: -Math.PI / 2 } },
      autodromo: { nome: 'Autódromo', sub: 'Corrida de carro contra o relógio', cor: '#6ee7c8', ir: { pos: [232, 0, 379], yaw: -Math.PI / 2 - 0.75 } },
      aventura: { nome: 'Aventura', sub: 'Portais: surf, mata-mata, gincana e caça-fantasmas', cor: '#f472b6', ir: { pos: [34, 0, 420], yaw: Math.PI / 2 } },
      parque: { nome: 'Caminho dos Torii', sub: 'Golfe, queimada e pinta', cor: '#ef4444', ir: { pos: [36, 0, 448], yaw: Math.PI } },
    },
    porticos: [
      { area: 'kart', x: 160, z: 57, giro: -Math.PI / 2 - 0.45, vao: 9 },
      { area: 'estadio', x: 150, z: 258, giro: -Math.PI / 2, vao: 8 },
      { area: 'quadras', x: 60, z: 279, giro: Math.PI / 2 + 0.3, vao: 8 },
      { area: 'autodromo', x: 228, z: 375, giro: -Math.PI / 2 - 0.75, vao: 9 },
    ],
    placas: [
      { x: 110, z: 64, giro: Math.PI, frente: [['↑', 'jogos'], ['↑', 'estadio'], ['↑', 'quadras'], ['↑', 'lago'], ['↑', 'aventura'], ['↑', 'parque']] },
      { x: 124, z: 21, giro: -Math.PI / 2, frente: [['↑', 'salao'], ['↖', 'kart']], verso: [['↑', 'praca'], ['↑', 'predio']] },
      { x: 75, z: 39, giro: Math.PI / 2, frente: [['↑', 'predio']], verso: [['↑', 'praca', 'Praça do Pagode, salão e kart']] },
      {
        x: 80, z: 262, giro: Math.PI,
        frente: [['←', 'estadio'], ['→', 'quadras'], ['↑', 'lago'], ['↑', 'aventura'], ['↑', 'parque']],
        verso: [['→', 'estadio'], ['←', 'quadras'], ['↑', 'jogos'], ['↑', 'salao'], SUL],
      },
      {
        x: 94, z: 330, giro: Math.PI,
        frente: [['←', 'lago', 'Ponte das Carpas'], ['←', 'autodromo'], ['↑', 'aventura'], ['↑', 'parque']],
        verso: [['→', 'autodromo'], ['↑', 'quadras'], ['↑', 'estadio'], SUL],
      },
      { x: 58, z: 400, giro: Math.PI - 1.1, frente: [['→', 'aventura'], ['↑', 'parque']] },
      { x: 44, z: 446, giro: Math.PI, frente: [['↑', 'parque', 'O caminho dos portais vermelhos'], ['↑', { nome: 'Minigolfe', sub: '9 buracos', cor: '#a3e635' }], ['↑', { nome: 'Queimada e pinta', sub: 'Dois times, uma bola · times pintam o chão', cor: '#f97316' }]], verso: [['↑', 'aventura'], ['↑', 'lago'], SUL] },
    ],
    quadros: [
      {
        area: 'kart', x: 176, z: 80, giro: -Math.PI / 2 - 0.6,
        linhas: ['Entre na fila com E na placa da entrada', 'Na largada você vai para o grid', 'Caixas "?" dão itens: turbo, casca, míssil', 'Use o item com o clique (ou Ação)'],
      },
      {
        area: 'jogos', x: 84, z: 110, giro: Math.PI / 2,
        linhas: ['Xadrez de bruxo, dama, jogo da velha 2 e dados', 'Chegue perto de uma mesa e aperte E', 'Contra outra pessoa ou contra o computador', 'No xadrez dá até para falar o lance'],
      },
      {
        area: 'estadio', x: 200, z: 228, giro: 0,
        linhas: ['Futebol de carro, em dois times', 'Na faixa da entrada, aperte E para jogar', 'Turbo: Shift ou correr · pulo: Espaço', 'Faça gol empurrando a bola com o carro'],
      },
      {
        area: 'quadras', x: 40, z: 275, giro: Math.PI / 2 + 0.3,
        linhas: ['Vôlei e basquete: é só chegar perto da bola', 'Segure o clique (ou Ação) e solte para jogar', 'Boliche: E na pista para entrar na fila', 'Na sua vez, a mesma coisa: segure e solte'],
      },
      {
        // ao lado do pórtico, do lado de fora da curva (mais adiante ficava em cima da pista)
        area: 'autodromo', x: 228, z: 362, giro: -Math.PI / 2 - 0.75,
        linhas: ['Vire carro (G ou o botão do carro) e entre na pista', 'Passe pela largada: o tempo da volta começa', 'Saiu da pista? R volta para ela', 'O melhor tempo fica no placar'],
      },
      {
        area: 'aventura', x: 40, z: 430, giro: Math.PI / 2,
        linhas: ['Portais com E · gincana e caça-fantasmas', 'Surf: deslize de lado nas rampas', 'Mata-mata: pegue as armas do chão', 'Em times: derrube o time do outro lado'],
      },
      {
        area: 'parque', x: 28, z: 452, giro: Math.PI,
        linhas: ['Siga os torii: cada jogo tem uma trilha', 'Minigolfe, queimada e, no fim, o pinta', 'O salão de jogos fica na praça do prédio', 'Em cada jogo: chegue perto e aperte E'],
      },
    ],
    mapasAqui: [
      { x: 76, z: 16, giro: -Math.PI / 2 },
      { x: 26, z: 438, giro: Math.PI },
    ],
    bosques: [
      { x0: -52, x1: 85, z0: 236, z1: 278 },
      { x0: -52, x1: 30, z0: 312, z1: 400 },
      { x0: 104, x1: 205, z0: 60, z1: 120 },
      { x0: 60, x1: 210, z0: 362, z1: 860 },
      { x0: 205, x1: 480, z0: 334, z1: 860 },
      { x0: -52, x1: 30, z0: 440, z1: 860 },
      { x0: 200, x1: 480, z0: -40, z1: 340 },
    ],
    rotulos: {
      predio: [4, 10], praca: [100, 30], salao: [166, 11], kart: [340, 190], jogos: [20, 165], estadio: [140, 180], quadras: [10, 300],
      lago: [150, 320], autodromo: [270, 620], aventura: [12, 436], parque: [36, 640],
    },
  },
  tema: {
    id: 'outono',
    ceu: ['#3e72c4', '#7aa6dd', '#f6e2c4', '#b8a08a', '#ffe9c4'],
    nevoa: { cor: '#e9d7bf', perto: 300, longe: 2100 },
    sol: { cor: '#ffe6c2', forca: 1.6 },
    hemi: { chao: '#7a5a3a', forca: 1.4 },
    exposicao: 1.04,
    nuvens: '#fff6ea',
    relevo: { serra: 0.9, mar: false, neveAcima: 380 },
    cores: { grama: '#9a9a46', gramaSeca: '#c19a4a', mata: '#8a3b22', rocha: '#7d6f66', rochaFria: '#5f5a6e', neve: '#f4f1ee', areia: '#d8c7a4', areiaMolhada: '#b9a47c' },
    arvores: { bordo: 0.45, cerejeira: 0.2, frondosaOutono: 0.25, bambu: 0.1 },
    flores: [0.0, 0.08, 0.95, 0.12],
    arbusto: '#9c4a26',
    pedra: '#8c8378',
    rua: { tipo: 'cascalho', guia: '#4a4038' },
    piso: 'cascalho',
    poste: 'lanterna',
    portico: 'torii',
    placa: { fundo: '#2a1d1a', faixa: true },
    cerca: '#5a3a2a',
    passaros: '#1b1726',
    particulas: 'folhas',
  },
};
