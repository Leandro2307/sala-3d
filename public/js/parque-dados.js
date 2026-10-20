// O Parque: a faixa nova no norte do mapa (de z = 540 até a cerca, em 860), igual nos dois mundos.
// Uma praça no meio, a Rua do Parque descendo até as quadras e a Rua dos Esportes indo para leste,
// com um jogo em cada canto: o salão de jogos (pingue-pongue, sinuca, truco e uno), o minigolfe, a
// quadra de queimada, a arena do pinta-território, o portal da gincana e o kartódromo.
// Só números, sem three.js: o servidor lê daqui onde fica cada mesa e cada quadra para conferir quem
// está jogando. Eixos: x para leste, z para norte.

export const PARQUE = { x: 20, z: 600, r: 18 };

// Ruas do parque, nos dois mundos (cidade.js desenha as do mundo novo; estas, o parque.js). A do
// Parque sai de trás das quadras e, no mundo novo, passa pela praça da aventura.
export const RUAS_PARQUE = {
  parque: { nome: 'Rua do Parque', pontos: [[20, 219], [20, PARQUE.z - PARQUE.r + 4]], largura: 8 },
  esportes: { nome: 'Rua dos Esportes', pontos: [[PARQUE.x + PARQUE.r - 4, PARQUE.z], [186, PARQUE.z]], largura: 8 },
};

// Salão de jogos: um pavilhão aberto com telhado de vidro, ao norte da praça. Três colunas de
// mesas: pingue-pongue (oeste), sinuca (meio) e cartas (leste), duas de cada.
export const SALAO = { x0: -10, x1: 50, z0: 628, z1: 670, altura: 7.5 };
export const MESAS_PINGUE = [{ x: 2, z: 638 }, { x: 2, z: 660 }];
export const MESAS_SINUCA = [{ x: 22.5, z: 638 }, { x: 22.5, z: 660 }];
export const MESAS_CARTAS = [{ x: 41.5, z: 638, jogo: 'truco' }, { x: 41.5, z: 660, jogo: 'uno' }];

// Quadra de queimada, ao norte da Rua dos Esportes: comp no eixo x (os dois campos, um de cada
// lado do meio), larg no z. O "cemitério" de cada time fica atrás da linha de fundo do outro.
export const QUEIMADA = { cx: 75, cz: 616, comp: 30, larg: 15, cemiterio: 5 };

// Arena do pinta-território (quadrada, lado em metros), depois da queimada
export const PINTA_ARENA = { cx: 133, cz: 637, lado: 56 };

// Minigolfe: 9 buracos a oeste da praça (golfe-dados.js põe cada buraco aqui dentro)
export const GOLFE_AREA = { x0: -48, x1: -6, z0: 548, z1: 626 };

// Portal da gincana (a pista fica no céu, em gincana-dados.js)
export const PORTAL_GINCANA = { x: 62, z: 588 };

// Kartódromo: o canto leste do parque, no fim da Rua dos Esportes (o traçado é do kart-dados.js)
export const KART_AREA = { x0: 186, x1: 474, z0: 546, z1: 854 };

// Pórtico na entrada do parque, por cima da Rua do Parque
export const PORTICO_PARQUE = { nome: 'PARQUE', cor: '#4ade80', x: 20, z: 545, giro: Math.PI, vao: 8 };
