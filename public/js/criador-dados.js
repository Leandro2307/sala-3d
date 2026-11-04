// Criador por voz: o catálogo de peças e o leitor da frase. Nada de IA: a frase vira uma árvore
// juntando peças já registradas ("pistola que atira pombos que cagam granadas" =
// Pistola → atira Pombo → solta Granada). Cada peça sabe se mexer, bater e soltar outras, e a
// mistura delas (com recursão) é o que dá a impressão de que o jogo cria qualquer coisa.
// Só dados e contas, sem three.js (criador.js monta os modelos, a física e a tela do catálogo).

// ------------------------------------------------------------------ peças
// cat: arma, bicho, comida, objeto, veiculo, magia. desc: o que faz (aparece no catálogo).
// armas: cad (tiros/s), espalha (abertura), qtd (por tiro), velo (m/s), padrao (o que atira sem
// pedir), danoArma (multiplica o dano do que atira), ceu (o que atira cai do céu onde se mira)
// coisas: mov (reto, arco, voa, guiado, anda, parado, sobe, volta), bate (some, quica, explode, dano),
// dano, vida (s), corpo (raio), fator (velocidade relativa à da arma), gira (rola no ar),
// persiste (bate em alguém e continua), raio (da explosão), explodeNoFim (pavio), impacto (dano
// da batida, quando a explosão é outra conta), passo (andando), pulo, empurra, suco (cor do
// respingo), rastro (cor do rastro), puxa (raio da atração), atravessa (passa pelas paredes),
// transp (meio transparente), velFixa, sobeVel, gatilho (mina: explode com alguém perto),
// emite [peça, modo, intervalo] (o que solta sozinho), viraPadrao [peça, quantas] (o que vira no fim),
// chama (fogo: cresce e some), louco (zigue-zague), pega (gruda onde bate), grav (gravidade)
export const PECAS = {
  // ---------------------------------------------------------------- armas
  pistola: { cat: 'arma', tipo: 'arma', nome: 'Pistola', desc: 'Rápida e certeira', syn: ['pistola', 'revolver', 'arma', 'trezoitao', 'pistol', 'gun', 'handgun'], cad: 4, espalha: 0.012, qtd: 1, velo: 60, padrao: 'bala' },
  metralhadora: { cat: 'arma', tipo: 'arma', nome: 'Metralhadora', desc: 'Rajada sem parar', syn: ['metralhadora', 'fuzil', 'rifle', 'submetralhadora', 'uzi', 'ak', 'machinegun'], cad: 11, espalha: 0.035, qtd: 1, velo: 70, padrao: 'bala' },
  minigun: { cat: 'arma', tipo: 'arma', nome: 'Minigun', desc: 'Chuva de tiros, espalha muito', syn: ['minigun', 'gatling', 'metralhadorona'], cad: 22, espalha: 0.06, qtd: 1, velo: 75, padrao: 'bala' },
  escopeta: { cat: 'arma', tipo: 'arma', nome: 'Escopeta', desc: 'Sete de uma vez, de perto', syn: ['escopeta', 'espingarda', 'doze', 'shotgun'], cad: 1.3, espalha: 0.11, qtd: 7, velo: 55, padrao: 'bala' },
  sniper: { cat: 'arma', tipo: 'arma', nome: 'Sniper', desc: 'Um tiro, dano triplo', syn: ['sniper', 'precisao', 'atirador', 'franco'], cad: 0.8, espalha: 0, qtd: 1, velo: 150, padrao: 'bala', danoArma: 3 },
  bazuca: { cat: 'arma', tipo: 'arma', nome: 'Bazuca', desc: 'Foguete que explode', syn: ['bazuca', 'bazooka', 'lancador', 'launcher', 'rpg'], cad: 0.9, espalha: 0, qtd: 1, velo: 32, padrao: 'foguete' },
  lancagranadas: { cat: 'arma', tipo: 'arma', nome: 'Lança-granadas', desc: 'Granadas em arco', syn: ['lancagranadas'], cad: 1.3, espalha: 0.02, qtd: 1, velo: 26, padrao: 'granada' },
  canhao: { cat: 'arma', tipo: 'arma', nome: 'Canhão', desc: 'Bola de ferro que explode', syn: ['canhao', 'cannon'], cad: 0.7, espalha: 0, qtd: 1, velo: 38, padrao: 'bomba' },
  lancachamas: { cat: 'arma', tipo: 'arma', nome: 'Lança-chamas', desc: 'Fogo contínuo, curto alcance', syn: ['lancachamas', 'flamethrower', 'macarico'], cad: 16, espalha: 0.07, qtd: 1, velo: 16, padrao: 'fogo' },
  arco: { cat: 'arma', tipo: 'arma', nome: 'Arco', desc: 'Flechas que caem em curva', syn: ['arco', 'besta', 'balestra', 'bow', 'crossbow'], cad: 1.6, espalha: 0.005, qtd: 1, velo: 55, padrao: 'flecha' },
  estilingue: { cat: 'arma', tipo: 'arma', nome: 'Estilingue', desc: 'Atira pedra (ou o que pedir)', syn: ['estilingue', 'atiradeira', 'baladeira', 'bodoque', 'slingshot'], cad: 2, espalha: 0.02, qtd: 1, velo: 32, padrao: 'pedra' },
  varinha: { cat: 'arma', tipo: 'arma', nome: 'Varinha mágica', desc: 'Solta estrelas', syn: ['varinha', 'cajado', 'condao', 'wand', 'staff'], cad: 3, espalha: 0.03, qtd: 1, velo: 24, padrao: 'estrela' },
  chuva: { cat: 'arma', tipo: 'arma', nome: 'Chuva', desc: 'Faz cair do céu onde você mira', syn: ['chuva', 'tempestade', 'temporal', 'rain', 'storm'], cad: 1.2, espalha: 0, qtd: 5, velo: 14, padrao: 'meteoro', ceu: true },
  mao: { cat: 'arma', tipo: 'arma', nome: 'Mão', desc: '', syn: [], cad: 2.5, espalha: 0.02, qtd: 1, velo: 30, padrao: 'pedra', oculto: true },

  // ---------------------------------------------------------------- tiros e explosivos
  bala: { cat: 'objeto', nome: 'Bala', desc: 'Tiro comum', syn: ['bala', 'tiro', 'projetil', 'municao', 'bullet'], mov: 'reto', bate: 'some', dano: 20, vida: 2, corpo: 0.12, fator: 1 },
  laser: { cat: 'magia', nome: 'Laser', desc: 'Raio vermelho, rápido', syn: ['laser', 'lazer'], mov: 'reto', bate: 'some', dano: 25, vida: 1.5, corpo: 0.12, fator: 1.6 },
  flecha: { cat: 'objeto', nome: 'Flecha', desc: 'Cai em curva', syn: ['flecha', 'seta', 'arrow'], mov: 'arco', bate: 'some', dano: 35, vida: 3, corpo: 0.12, fator: 1, grav: 0.5 },
  granada: { cat: 'objeto', nome: 'Granada', desc: 'Quica e explode depois', syn: ['granada', 'grenade'], mov: 'arco', bate: 'quica', explodeNoFim: true, raio: 4, dano: 80, impacto: 5, vida: 2.2, corpo: 0.18, fator: 0.35, gira: true },
  foguete: { cat: 'objeto', nome: 'Foguete', desc: 'Voa reto e explode', syn: ['foguete', 'rocket'], mov: 'reto', bate: 'explode', raio: 4, dano: 90, vida: 4, corpo: 0.18, fator: 0.8, rastro: '#fb923c' },
  missil: { cat: 'objeto', nome: 'Míssil', desc: 'Persegue e explode', syn: ['missil', 'missile', 'torpedo'], mov: 'guiado', bate: 'explode', raio: 3.5, dano: 80, vida: 5, corpo: 0.18, fator: 0.55, rastro: '#e5e7eb' },
  bomba: { cat: 'objeto', nome: 'Bomba', desc: 'Explosão grande', syn: ['bomba', 'bomb'], mov: 'arco', bate: 'explode', raio: 6, dano: 120, vida: 6, corpo: 0.35, fator: 0.5, gira: true },
  tnt: { cat: 'objeto', nome: 'TNT', desc: 'Quica e explode enorme', syn: ['tnt', 'dinamite', 'dynamite'], mov: 'arco', bate: 'quica', explodeNoFim: true, raio: 7, dano: 140, impacto: 5, vida: 2.5, corpo: 0.3, fator: 0.4, gira: true },
  barril: { cat: 'objeto', nome: 'Barril', desc: 'Explode onde bater', syn: ['barril', 'tambor', 'barrel'], mov: 'arco', bate: 'explode', raio: 5, dano: 100, vida: 6, corpo: 0.4, fator: 0.4, gira: true },
  mina: { cat: 'objeto', nome: 'Mina', desc: 'Fica no chão e explode quando passam', syn: ['mina', 'landmine'], mov: 'parado', bate: 'some', gatilho: 2.2, explodeNoFim: true, raio: 4, dano: 100, vida: 40, corpo: 0.3, fator: 0.4 },
  torreta: { cat: 'objeto', nome: 'Torreta', desc: 'Para no chão e atira sozinha', syn: ['torreta', 'torre', 'sentinela', 'turret'], mov: 'parado', bate: 'dano', persiste: true, dano: 0, vida: 15, corpo: 0.5, fator: 0.35, emite: ['bala', 'mira', 0.35] },

  // ---------------------------------------------------------------- bichos
  pombo: { cat: 'bicho', nome: 'Pombo', desc: 'Voa atrás de alguém', syn: ['pombo', 'pomba', 'pigeon', 'dove'], mov: 'voa', bate: 'dano', persiste: true, dano: 12, vida: 9, corpo: 0.35, fator: 0.3 },
  passaro: { cat: 'bicho', nome: 'Pássaro', desc: 'Voa atrás de alguém', syn: ['passaro', 'passarinho', 'ave', 'bird', 'arara', 'papagaio'], modelo: 'pombo', cor: '#3b82f6', mov: 'voa', bate: 'dano', persiste: true, dano: 12, vida: 9, corpo: 0.35, fator: 0.3 },
  pato: { cat: 'bicho', nome: 'Pato', desc: 'Voa atrás de alguém', syn: ['pato', 'patinho', 'duck'], mov: 'voa', bate: 'dano', persiste: true, dano: 12, vida: 9, corpo: 0.35, fator: 0.3 },
  morcego: { cat: 'bicho', nome: 'Morcego', desc: 'Voa rápido', syn: ['morcego', 'bat', 'vampiro'], mov: 'voa', bate: 'dano', persiste: true, dano: 10, vida: 8, corpo: 0.25, fator: 0.4 },
  coruja: { cat: 'bicho', nome: 'Coruja', desc: 'Voa atrás de alguém', syn: ['coruja', 'owl'], mov: 'voa', bate: 'dano', persiste: true, dano: 12, vida: 9, corpo: 0.35, fator: 0.3 },
  aguia: { cat: 'bicho', nome: 'Águia', desc: 'Mergulha em quem estiver perto', syn: ['aguia', 'falcao', 'gaviao', 'eagle', 'hawk'], mov: 'guiado', bate: 'dano', persiste: true, dano: 25, vida: 8, corpo: 0.45, fator: 0.45 },
  borboleta: { cat: 'bicho', nome: 'Borboleta', desc: 'Voa em zigue-zague', syn: ['borboleta', 'mariposa', 'butterfly'], mov: 'voa', bate: 'dano', persiste: true, dano: 3, vida: 10, corpo: 0.2, fator: 0.2, louco: true },
  abelha: { cat: 'bicho', nome: 'Abelha', desc: 'Persegue e ferroa', syn: ['abelha', 'vespa', 'marimbondo', 'bee', 'wasp'], mov: 'guiado', bate: 'dano', dano: 10, vida: 7, corpo: 0.2, fator: 0.3 },
  dragao: { cat: 'bicho', nome: 'Dragão', desc: 'Voa e cospe fogo', syn: ['dragao', 'dragon', 'wyvern'], mov: 'voa', bate: 'dano', persiste: true, dano: 40, vida: 12, corpo: 1, fator: 0.3, emite: ['fogo', 'mira', 0.12] },
  galinha: { cat: 'bicho', nome: 'Galinha', desc: 'Corre atrás e bica', syn: ['galinha', 'frango', 'pintinho', 'galo', 'chicken', 'hen'], mov: 'anda', bate: 'dano', persiste: true, dano: 10, vida: 12, corpo: 0.35, fator: 0.3, passo: 4.5 },
  porco: { cat: 'bicho', nome: 'Porco', desc: 'Corre atrás', syn: ['porco', 'porquinho', 'leitao', 'pig'], mov: 'anda', bate: 'dano', persiste: true, dano: 20, vida: 12, corpo: 0.5, fator: 0.3, passo: 3.5 },
  vaca: { cat: 'bicho', nome: 'Vaca', desc: 'Atropela e empurra', syn: ['vaca', 'boi', 'touro', 'cow', 'bull'], mov: 'anda', bate: 'dano', persiste: true, dano: 35, vida: 12, corpo: 0.8, fator: 0.35, passo: 3, empurra: 12 },
  cavalo: { cat: 'bicho', nome: 'Cavalo', desc: 'Corre muito', syn: ['cavalo', 'egua', 'potro', 'horse', 'pony', 'ponei'], mov: 'anda', bate: 'dano', persiste: true, dano: 30, vida: 12, corpo: 0.7, fator: 0.35, passo: 8, empurra: 10 },
  unicornio: { cat: 'bicho', nome: 'Unicórnio', desc: 'Corre deixando brilho', syn: ['unicornio', 'unicorn'], mov: 'anda', bate: 'dano', persiste: true, dano: 25, vida: 12, corpo: 0.7, fator: 0.35, passo: 7, rastro: '#f0abfc' },
  cachorro: { cat: 'bicho', nome: 'Cachorro', desc: 'Corre atrás e morde', syn: ['cachorro', 'cao', 'cachorrinho', 'dog', 'doguinho', 'viralata'], mov: 'anda', bate: 'dano', persiste: true, dano: 18, vida: 12, corpo: 0.35, fator: 0.35, passo: 7 },
  gato: { cat: 'bicho', nome: 'Gato', desc: 'Corre e pula', syn: ['gato', 'gatinho', 'gata', 'cat', 'kitty'], mov: 'anda', bate: 'dano', persiste: true, dano: 12, vida: 12, corpo: 0.3, fator: 0.35, passo: 6, pulo: 6 },
  coelho: { cat: 'bicho', nome: 'Coelho', desc: 'Pula alto', syn: ['coelho', 'coelhinho', 'rabbit', 'bunny'], mov: 'anda', bate: 'dano', persiste: true, dano: 8, vida: 12, corpo: 0.25, fator: 0.3, passo: 5, pulo: 7 },
  sapo: { cat: 'bicho', nome: 'Sapo', desc: 'Pulão', syn: ['sapo', 'ra', 'perereca', 'frog'], mov: 'anda', bate: 'dano', persiste: true, dano: 8, vida: 12, corpo: 0.25, fator: 0.3, passo: 4, pulo: 8 },
  cobra: { cat: 'bicho', nome: 'Cobra', desc: 'Rasteja e morde forte', syn: ['cobra', 'serpente', 'jiboia', 'snake'], mov: 'anda', bate: 'dano', persiste: true, dano: 22, vida: 12, corpo: 0.25, fator: 0.3, passo: 3.5, pulo: 0 },
  aranha: { cat: 'bicho', nome: 'Aranha', desc: 'Corre atrás', syn: ['aranha', 'tarantula', 'spider'], mov: 'anda', bate: 'dano', persiste: true, dano: 12, vida: 12, corpo: 0.3, fator: 0.3, passo: 5 },
  urso: { cat: 'bicho', nome: 'Urso', desc: 'Pesado, empurra longe', syn: ['urso', 'ursinho', 'panda', 'bear'], mov: 'anda', bate: 'dano', persiste: true, dano: 35, vida: 12, corpo: 0.7, fator: 0.3, passo: 4, empurra: 10 },
  leao: { cat: 'bicho', nome: 'Leão', desc: 'Rápido e forte', syn: ['leao', 'leoa', 'tigre', 'onca', 'lion', 'tiger'], mov: 'anda', bate: 'dano', persiste: true, dano: 30, vida: 12, corpo: 0.6, fator: 0.35, passo: 6.5 },
  elefante: { cat: 'bicho', nome: 'Elefante', desc: 'Enorme, atropela', syn: ['elefante', 'mamute', 'elephant'], mov: 'anda', bate: 'dano', persiste: true, dano: 45, vida: 12, corpo: 1.1, fator: 0.3, passo: 3, empurra: 16, pulo: 0 },
  dinossauro: { cat: 'bicho', nome: 'Dinossauro', desc: 'O rei da arena', syn: ['dinossauro', 'dino', 'tiranossauro', 'trex', 'rex', 'dinosaur'], mov: 'anda', bate: 'dano', persiste: true, dano: 55, vida: 12, corpo: 1, fator: 0.3, passo: 5, empurra: 14, pulo: 0 },
  macaco: { cat: 'bicho', nome: 'Macaco', desc: 'Corre e joga banana', syn: ['macaco', 'macaquinho', 'gorila', 'chimpanze', 'monkey', 'gorilla'], mov: 'anda', bate: 'dano', persiste: true, dano: 10, vida: 12, corpo: 0.35, fator: 0.3, passo: 5, emite: ['banana', 'mira', 1.2] },
  pinguim: { cat: 'bicho', nome: 'Pinguim', desc: 'Devagar e fofo', syn: ['pinguim', 'penguin'], mov: 'anda', bate: 'dano', persiste: true, dano: 10, vida: 12, corpo: 0.3, fator: 0.35, passo: 2.5 },
  zumbi: { cat: 'bicho', nome: 'Zumbi', desc: 'Lento, mas não desiste', syn: ['zumbi', 'zombie', 'morto'], mov: 'anda', bate: 'dano', persiste: true, dano: 20, vida: 20, corpo: 0.4, fator: 0.25, passo: 1.8, pulo: 0 },
  robo: { cat: 'bicho', nome: 'Robô', desc: 'Anda e atira laser', syn: ['robo', 'robozinho', 'androide', 'robot', 'ciborgue'], mov: 'anda', bate: 'dano', persiste: true, dano: 20, vida: 15, corpo: 0.45, fator: 0.3, passo: 3, pulo: 0, emite: ['laser', 'mira', 0.9] },
  bonecodeneve: { cat: 'bicho', nome: 'Boneco de neve', desc: 'Anda e joga bola de neve', syn: ['bonecodeneve', 'snowman'], mov: 'anda', bate: 'dano', persiste: true, dano: 10, vida: 15, corpo: 0.45, fator: 0.3, passo: 2, pulo: 0, emite: ['boladeneve', 'mira', 1] },
  tubarao: { cat: 'bicho', nome: 'Tubarão', desc: 'Voa atrás e morde', syn: ['tubarao', 'shark'], mov: 'guiado', bate: 'dano', persiste: true, dano: 45, vida: 9, corpo: 0.7, fator: 0.4 },
  golfinho: { cat: 'bicho', nome: 'Golfinho', desc: 'Nada no ar atrás de alguém', syn: ['golfinho', 'dolphin', 'boto'], mov: 'guiado', bate: 'dano', persiste: true, dano: 20, vida: 8, corpo: 0.5, fator: 0.4 },
  baleia: { cat: 'bicho', nome: 'Baleia', desc: 'Gigante voadora', syn: ['baleia', 'orca', 'whale'], mov: 'voa', bate: 'dano', persiste: true, dano: 60, vida: 12, corpo: 1.6, fator: 0.2, empurra: 18 },
  peixe: { cat: 'bicho', nome: 'Peixe', desc: 'Quica no chão', syn: ['peixe', 'sardinha', 'fish', 'peixinho'], mov: 'arco', bate: 'quica', dano: 15, vida: 5, corpo: 0.25, fator: 0.45, gira: true },
  polvo: { cat: 'bicho', nome: 'Polvo', desc: 'Gruda onde bater', syn: ['polvo', 'lula', 'octopus', 'squid'], mov: 'arco', bate: 'dano', persiste: true, dano: 15, vida: 8, corpo: 0.35, fator: 0.4, pega: true },

  // ---------------------------------------------------------------- comida
  melancia: { cat: 'comida', nome: 'Melancia', desc: 'Estoura em suco', syn: ['melancia', 'watermelon', 'melao'], mov: 'arco', bate: 'some', dano: 35, vida: 5, corpo: 0.45, fator: 0.45, gira: true, suco: '#ef4444' },
  banana: { cat: 'comida', nome: 'Banana', desc: 'Gira e quica', syn: ['banana', 'bananinha'], mov: 'arco', bate: 'quica', dano: 12, vida: 6, corpo: 0.2, fator: 0.5, gira: true, suco: '#fde047' },
  maca: { cat: 'comida', nome: 'Maçã', desc: 'Estoura', syn: ['maca', 'apple', 'pera'], mov: 'arco', bate: 'some', dano: 15, vida: 5, corpo: 0.2, fator: 0.55, gira: true, suco: '#ef4444' },
  tomate: { cat: 'comida', nome: 'Tomate', desc: 'Esborracha', syn: ['tomate', 'tomato'], mov: 'arco', bate: 'some', dano: 10, vida: 5, corpo: 0.2, fator: 0.55, gira: true, suco: '#dc2626' },
  abacaxi: { cat: 'comida', nome: 'Abacaxi', desc: 'Pesadinho', syn: ['abacaxi', 'pineapple'], mov: 'arco', bate: 'some', dano: 25, vida: 5, corpo: 0.3, fator: 0.45, gira: true, suco: '#fde047' },
  pizza: { cat: 'comida', nome: 'Pizza', desc: 'Voa reto girando', syn: ['pizza'], mov: 'reto', bate: 'some', dano: 20, vida: 3, corpo: 0.35, fator: 0.6, gira: true, suco: '#f59e0b' },
  hamburguer: { cat: 'comida', nome: 'Hambúrguer', desc: 'Lanche voador', syn: ['hamburguer', 'hamburger', 'xburguer', 'lanche', 'burger', 'sanduiche'], mov: 'arco', bate: 'some', dano: 18, vida: 5, corpo: 0.3, fator: 0.5, gira: true, suco: '#a16207' },
  bolo: { cat: 'comida', nome: 'Bolo', desc: 'Bolo na cara', syn: ['bolo', 'torta', 'cake', 'pie'], mov: 'arco', bate: 'some', dano: 25, vida: 5, corpo: 0.4, fator: 0.45, suco: '#f9a8d4' },
  sorvete: { cat: 'comida', nome: 'Sorvete', desc: 'Gelado na cabeça', syn: ['sorvete', 'picole', 'icecream'], mov: 'arco', bate: 'some', dano: 12, vida: 5, corpo: 0.25, fator: 0.5, gira: true, suco: '#fbcfe8' },
  rosquinha: { cat: 'comida', nome: 'Rosquinha', desc: 'Voa reto girando', syn: ['rosquinha', 'donut', 'sonho', 'rosca'], mov: 'reto', bate: 'some', dano: 15, vida: 3, corpo: 0.25, fator: 0.6, gira: true, suco: '#f472b6' },
  cenoura: { cat: 'comida', nome: 'Cenoura', desc: 'Que nem flecha', syn: ['cenoura', 'carrot'], mov: 'reto', bate: 'some', dano: 18, vida: 2.5, corpo: 0.12, fator: 0.9, suco: '#fb923c' },
  queijo: { cat: 'comida', nome: 'Queijo', desc: 'Fatia voadora', syn: ['queijo', 'cheese'], mov: 'arco', bate: 'some', dano: 15, vida: 5, corpo: 0.25, fator: 0.5, gira: true, suco: '#facc15' },
  ovo: { cat: 'comida', nome: 'Ovo', desc: 'Quebra (e pode virar bicho)', syn: ['ovo', 'egg'], mov: 'arco', bate: 'some', dano: 5, vida: 4, corpo: 0.22, fator: 0.4, gira: true, suco: '#fde68a' },
  coco: { cat: 'comida', nome: 'Cocô', desc: 'Exatamente o que parece', syn: ['coco', 'bosta', 'merda', 'poop', 'caquinha'], mov: 'arco', bate: 'some', dano: 10, vida: 5, corpo: 0.2, fator: 0.45, suco: '#78350f' },

  // ---------------------------------------------------------------- objetos
  bola: { cat: 'objeto', nome: 'Bola', desc: 'Quica pra todo lado', syn: ['bola', 'bolinha', 'ball'], mov: 'arco', bate: 'quica', dano: 25, vida: 7, corpo: 0.35, fator: 0.5, gira: true },
  pedra: { cat: 'objeto', nome: 'Pedra', desc: 'Pedrada', syn: ['pedra', 'rocha', 'pedregulho', 'rock', 'stone'], mov: 'arco', bate: 'some', dano: 30, vida: 5, corpo: 0.3, fator: 0.55, gira: true },
  caixa: { cat: 'objeto', nome: 'Caixa', desc: 'Caixote de madeira', syn: ['caixa', 'cubo', 'bloco', 'caixote', 'box', 'cube', 'block'], mov: 'arco', bate: 'some', dano: 30, vida: 5, corpo: 0.4, fator: 0.45, gira: true },
  tijolo: { cat: 'objeto', nome: 'Tijolo', desc: 'Tijolada', syn: ['tijolo', 'brick'], mov: 'arco', bate: 'some', dano: 28, vida: 5, corpo: 0.2, fator: 0.55, gira: true },
  bigorna: { cat: 'objeto', nome: 'Bigorna', desc: 'Cai pesado', syn: ['bigorna', 'anvil'], mov: 'arco', bate: 'some', dano: 70, vida: 6, corpo: 0.35, fator: 0.45, grav: 2 },
  piano: { cat: 'objeto', nome: 'Piano', desc: 'Clássico de desenho', syn: ['piano', 'teclado'], mov: 'arco', bate: 'some', dano: 80, vida: 6, corpo: 0.8, fator: 0.35, grav: 1.5 },
  privada: { cat: 'objeto', nome: 'Privada', desc: 'Vaso sanitário voador', syn: ['privada', 'vaso', 'patente', 'toilet'], mov: 'arco', bate: 'some', dano: 40, vida: 6, corpo: 0.45, fator: 0.4, gira: true },
  geladeira: { cat: 'objeto', nome: 'Geladeira', desc: 'Pesada', syn: ['geladeira', 'refrigerador', 'fridge'], mov: 'arco', bate: 'some', dano: 50, vida: 6, corpo: 0.6, fator: 0.35, gira: true },
  pneu: { cat: 'objeto', nome: 'Pneu', desc: 'Rola e quica', syn: ['pneu', 'roda', 'tire', 'wheel'], mov: 'arco', bate: 'quica', dano: 20, vida: 8, corpo: 0.4, fator: 0.5, gira: true },
  moeda: { cat: 'objeto', nome: 'Moeda', desc: 'Dinheiro na cara', syn: ['moeda', 'dinheiro', 'grana', 'coin', 'money'], mov: 'arco', bate: 'quica', dano: 8, vida: 6, corpo: 0.12, fator: 0.6, gira: true },
  diamante: { cat: 'objeto', nome: 'Diamante', desc: 'Brilha e corta', syn: ['diamante', 'cristal', 'joia', 'diamond', 'gem'], mov: 'reto', bate: 'some', dano: 30, vida: 2.5, corpo: 0.18, fator: 0.9, gira: true, rastro: '#a5f3fc' },
  faca: { cat: 'objeto', nome: 'Faca', desc: 'Arremesso de faca', syn: ['faca', 'adaga', 'punhal', 'knife', 'dagger'], mov: 'reto', bate: 'some', dano: 30, vida: 2, corpo: 0.12, fator: 1, gira: true },
  shuriken: { cat: 'objeto', nome: 'Shuriken', desc: 'Estrela ninja', syn: ['shuriken', 'ninja'], mov: 'reto', bate: 'some', dano: 25, vida: 2, corpo: 0.15, fator: 1, gira: true },
  machado: { cat: 'objeto', nome: 'Machado', desc: 'Gira no ar', syn: ['machado', 'machadinha', 'axe'], mov: 'arco', bate: 'some', dano: 40, vida: 4, corpo: 0.3, fator: 0.6, gira: true },
  espada: { cat: 'objeto', nome: 'Espada', desc: 'Gira no ar', syn: ['espada', 'katana', 'sabre', 'sword'], mov: 'arco', bate: 'some', dano: 45, vida: 4, corpo: 0.35, fator: 0.6, gira: true },
  arpao: { cat: 'objeto', nome: 'Arpão', desc: 'Lança comprida', syn: ['arpao', 'tridente', 'spear', 'javelin', 'dardo'], mov: 'reto', bate: 'some', dano: 40, vida: 3, corpo: 0.12, fator: 0.9 },
  bumerangue: { cat: 'objeto', nome: 'Bumerangue', desc: 'Vai e volta', syn: ['bumerangue', 'boomerang'], mov: 'volta', bate: 'dano', persiste: true, dano: 25, vida: 3, corpo: 0.2, fator: 0.6, gira: true },
  boladeneve: { cat: 'objeto', nome: 'Bola de neve', desc: 'Gelada', syn: ['boladeneve', 'snowball'], mov: 'arco', bate: 'some', dano: 15, vida: 4, corpo: 0.2, fator: 0.55, suco: '#f8fafc' },

  // ---------------------------------------------------------------- veículos
  carro: { cat: 'veiculo', nome: 'Carro', desc: 'Atropela', syn: ['carro', 'carrinho', 'automovel', 'fusca', 'car'], mov: 'anda', bate: 'dano', persiste: true, dano: 45, vida: 10, corpo: 0.9, fator: 0.4, passo: 10, empurra: 16, pulo: 0 },
  tanque: { cat: 'veiculo', nome: 'Tanque', desc: 'Anda e dispara bombas', syn: ['tanque', 'blindado', 'tank'], mov: 'anda', bate: 'dano', persiste: true, dano: 40, vida: 15, corpo: 1.1, fator: 0.3, passo: 2.5, pulo: 0, emite: ['bomba', 'mira', 1.6] },
  aviao: { cat: 'veiculo', nome: 'Avião', desc: 'Voa e solta bombas', syn: ['aviao', 'jato', 'caca', 'plane', 'jet'], mov: 'voa', bate: 'dano', persiste: true, dano: 30, vida: 10, corpo: 0.9, fator: 0.5, emite: ['bomba', 'cai', 0.8] },
  helicoptero: { cat: 'veiculo', nome: 'Helicóptero', desc: 'Voa e dispara mísseis', syn: ['helicoptero', 'helicopter', 'heli'], mov: 'voa', bate: 'dano', persiste: true, dano: 20, vida: 12, corpo: 0.8, fator: 0.3, emite: ['missil', 'mira', 1.5] },
  ovni: { cat: 'veiculo', nome: 'Disco voador', desc: 'Solta raios', syn: ['ovni', 'ufo', 'nave', 'alien', 'et'], mov: 'voa', bate: 'dano', persiste: true, dano: 20, vida: 12, corpo: 0.9, fator: 0.3, emite: ['relampago', 'mira', 0.9] },

  // ---------------------------------------------------------------- magia e natureza
  estrela: { cat: 'magia', nome: 'Estrela', desc: 'Brilha e gira', syn: ['estrela', 'estrelinha', 'star'], mov: 'reto', bate: 'some', dano: 18, vida: 2, corpo: 0.2, fator: 0.8, gira: true, rastro: '#fde68a' },
  relampago: { cat: 'magia', nome: 'Relâmpago', desc: 'O mais rápido', syn: ['relampago', 'raio', 'trovao', 'choque', 'lightning', 'thunder'], mov: 'reto', bate: 'some', dano: 35, vida: 1, corpo: 0.15, fator: 2.2, rastro: '#fde047' },
  fogo: { cat: 'magia', nome: 'Fogo', desc: 'Chama curta que queima', syn: ['fogo', 'chama', 'chamas', 'labareda', 'fire', 'flame'], mov: 'reto', bate: 'some', dano: 6, vida: 0.55, corpo: 0.25, fator: 1, chama: true },
  gota: { cat: 'magia', nome: 'Água', desc: 'Gotas que molham', syn: ['gota', 'agua', 'pingo', 'water', 'drop'], mov: 'arco', bate: 'some', dano: 3, vida: 3, corpo: 0.1, fator: 1, suco: '#60a5fa' },
  confete: { cat: 'magia', nome: 'Confete', desc: 'Festa! (não machuca)', syn: ['confete', 'serpentina', 'confetti'], mov: 'arco', bate: 'some', dano: 0, vida: 2, corpo: 0.08, fator: 1, cor: 'arcoiris', grav: 0.3, gira: true },
  meteoro: { cat: 'magia', nome: 'Meteoro', desc: 'Pedra em chamas que explode', syn: ['meteoro', 'meteorito', 'cometa', 'asteroide', 'meteor'], mov: 'arco', bate: 'explode', raio: 6, dano: 110, vida: 6, corpo: 0.6, fator: 0.5, gira: true, rastro: '#f97316' },
  nuvem: { cat: 'magia', nome: 'Nuvem', desc: 'Voa por cima e chove', syn: ['nuvem', 'nuvenzinha', 'cloud'], mov: 'voa', bate: 'dano', persiste: true, dano: 0, vida: 10, corpo: 1, fator: 0.25, emite: ['gota', 'cai', 0.12] },
  bolha: { cat: 'magia', nome: 'Bolha', desc: 'Sobe devagar', syn: ['bolha', 'bolhinha', 'bubble'], mov: 'sobe', bate: 'some', dano: 2, vida: 5, corpo: 0.3, fator: 0.3, transp: true, sobeVel: 1.5 },
  balao: { cat: 'magia', nome: 'Balão', desc: 'Sobe e estoura', syn: ['balao', 'bexiga', 'balloon'], mov: 'sobe', bate: 'some', dano: 5, vida: 8, corpo: 0.4, fator: 0.3, sobeVel: 2.5, suco: '#ef4444' },
  fogos: { cat: 'magia', nome: 'Fogos de artifício', desc: 'Sobe e explode em estrelas', syn: ['fogos', 'rojao', 'foguetinho', 'fireworks'], mov: 'sobe', bate: 'explode', explodeNoFim: true, raio: 3, dano: 30, vida: 1.3, corpo: 0.15, fator: 0.4, sobeVel: 16, rastro: '#fca5a5', viraPadrao: ['estrela', 8] },
  buraconegro: { cat: 'magia', nome: 'Buraco negro', desc: 'Puxa tudo e explode', syn: ['buraconegro', 'vortice', 'portal'], mov: 'reto', bate: 'dano', persiste: true, dano: 12, vida: 6, corpo: 0.5, fator: 0.12, velFixa: 4, puxa: 10, atravessa: true, explodeNoFim: true, raio: 5, impacto: 12 },
  tornado: { cat: 'magia', nome: 'Tornado', desc: 'Persegue e joga longe', syn: ['tornado', 'furacao', 'redemoinho', 'ciclone'], mov: 'guiado', bate: 'dano', persiste: true, dano: 15, vida: 8, corpo: 1, fator: 0.2, velFixa: 5, puxa: 6, empurra: 18 },
  fantasma: { cat: 'magia', nome: 'Fantasma', desc: 'Atravessa parede', syn: ['fantasma', 'assombracao', 'espirito', 'ghost', 'boo'], mov: 'guiado', bate: 'dano', persiste: true, dano: 15, vida: 10, corpo: 0.45, fator: 0.3, velFixa: 6, atravessa: true, transp: true },
};
for (const k in PECAS) {
  const d = PECAS[k];
  d.tipo = d.tipo || 'coisa';
  d.modelo = d.modelo || k;
  // arma também vira "coisa" (pombo que caga pistolas): flutua e atira sozinha
  if (d.tipo === 'arma') Object.assign(d, { mov: 'voa', bate: 'dano', persiste: true, dano: 15, vida: 8, corpo: 0.3, fator: 0.3 });
}
export const CATEGORIAS = [
  { id: 'arma', nome: 'Armas', cor: '#f43f5e' },
  { id: 'bicho', nome: 'Bichos', cor: '#22c55e' },
  { id: 'comida', nome: 'Comida', cor: '#f59e0b' },
  { id: 'objeto', nome: 'Objetos', cor: '#38bdf8' },
  { id: 'veiculo', nome: 'Veículos', cor: '#a78bfa' },
  { id: 'magia', nome: 'Magia e natureza', cor: '#e879f9' },
];

// ------------------------------------------------------------------ jeitos (modificadores)
// efeito: dito para uma arma, vale para o que ela atira ("bazuca explosiva" = foguete explosivo)
const COR = (c) => (n) => { n.cor = c; };
export const MODS = [
  { nome: 'gigante', desc: 'Bem maior e mais forte', syn: ['gigante', 'enorme', 'grande', 'gigantesco', 'gigantesca', 'imenso', 'imensa', 'mega', 'giant', 'huge', 'big'], f: (n) => { n.escala *= 2.2; n.danoMul *= 1.6; } },
  { nome: 'mini', desc: 'Pequenininho', syn: ['pequeno', 'pequena', 'mini', 'minusculo', 'minuscula', 'pequenininho', 'bebe', 'filhote', 'tiny', 'small', 'little', 'baby'], f: (n) => { n.escala *= 0.5; } },
  { nome: 'rápido', desc: 'Mais veloz (arma: atira mais)', syn: ['rapido', 'rapida', 'veloz', 'ligeiro', 'ligeira', 'turbo', 'fast', 'quick'], f: (n) => { n.vel *= 1.8; } },
  { nome: 'lento', desc: 'Câmera lenta', syn: ['lento', 'lenta', 'devagar', 'slow'], f: (n) => { n.vel *= 0.5; } },
  { nome: 'super', desc: 'Maior, mais rápido e dano em dobro', syn: ['super', 'ultra', 'hiper'], f: (n) => { n.escala *= 1.4; n.vel *= 1.3; n.danoMul *= 2; } },
  { nome: 'explosivo', desc: 'Explode quando bate', efeito: true, syn: ['explosivo', 'explosiva', 'explode', 'explodem', 'explodindo', 'explosive', 'exploding', 'explodes'], f: (n) => { n.explosivo = true; } },
  { nome: 'teleguiado', desc: 'Persegue quem estiver perto', efeito: true, syn: ['teleguiado', 'teleguiada', 'guiado', 'guiada', 'perseguidor', 'perseguidora', 'teledirigido', 'homing', 'seeking'], f: (n) => { n.guiado = true; } },
  { nome: 'quicante', desc: 'Quica em tudo', efeito: true, syn: ['quicante', 'saltitante', 'quica', 'borracha', 'pula', 'bouncy', 'bouncing'], f: (n) => { n.quica = true; } },
  { nome: 'de fogo', desc: 'Rastro de fogo, queima mais', efeito: true, syn: ['flamejante', 'flamejantes', 'incendiario', 'incendiaria', 'fervendo', 'flaming'], f: (n) => { n.rastro = '#fb923c'; n.danoMul *= 1.3; } },
  { nome: 'de gelo', desc: 'Azul gelado', efeito: true, syn: ['congelante', 'gelado', 'gelada', 'congelado', 'congelada', 'frio', 'fria', 'ice', 'frozen'], f: (n) => { n.cor = '#7dd3fc'; n.rastro = '#e0f2fe'; n.danoMul *= 1.2; } },
  { nome: 'elétrico', desc: 'Faísca e dá choque', efeito: true, syn: ['eletrico', 'eletrica', 'eletrizante', 'eletrificado', 'electric'], f: (n) => { n.rastro = '#fde047'; n.danoMul *= 1.3; } },
  { nome: 'venenoso', desc: 'Verde e tóxico', efeito: true, syn: ['venenoso', 'venenosa', 'toxico', 'toxica', 'radioativo', 'radioativa', 'poison', 'toxic'], f: (n) => { n.cor = '#84cc16'; n.rastro = '#a3e635'; n.danoMul *= 1.2; } },
  { nome: 'invisível', desc: 'Transparente, atravessa parede', efeito: true, syn: ['invisivel', 'transparente', 'fantasmagorico', 'fantasmagorica', 'invisible'], f: (n) => { n.atravessa = true; n.transp = true; } },
  { nome: 'voador', desc: 'Bicho de chão sai voando', syn: ['voador', 'voadora', 'voando', 'alado', 'alada', 'flying'], f: (n) => { n.voa = true; } },
  { nome: 'pesado', desc: 'Cai rápido e machuca mais', syn: ['pesado', 'pesada', 'gordo', 'gorda', 'gordinho', 'heavy', 'fat'], f: (n) => { n.grav *= 2; n.escala *= 1.25; n.danoMul *= 1.5; n.vel *= 0.8; } },
  { nome: 'leve', desc: 'Flutua devagar', syn: ['leve', 'flutuante', 'light'], f: (n) => { n.grav *= 0.3; } },
  { nome: 'eterno', desc: 'Dura três vezes mais', syn: ['eterno', 'eterna', 'imortal', 'infinito', 'infinita', 'duradouro'], f: (n) => { n.vidaMul *= 3; } },
  { nome: 'louco', desc: 'Zigue-zague', syn: ['louco', 'louca', 'maluco', 'maluca', 'doido', 'doida', 'crazy'], f: (n) => { n.louco = true; } },
  { nome: 'giratório', desc: 'Gira sem parar', syn: ['giratorio', 'giratoria', 'girando', 'rodando', 'spinning'], f: (n) => { n.gira = true; } },
  { nome: 'grudento', desc: 'Gruda onde bate', syn: ['grudento', 'grudenta', 'pegajoso', 'pegajosa', 'sticky'], f: (n) => { n.pega = true; } },
  { nome: 'brilhante', desc: 'Neon', syn: ['brilhante', 'neon', 'luminoso', 'luminosa', 'glowing'], f: (n) => { n.brilho = true; } },
  { nome: 'vermelho', cor: '#ef4444', syn: ['vermelho', 'vermelha', 'red'], f: COR('#ef4444') },
  { nome: 'azul', cor: '#3b82f6', syn: ['azul', 'blue'], f: COR('#3b82f6') },
  { nome: 'verde', cor: '#22c55e', syn: ['verde', 'green'], f: COR('#22c55e') },
  { nome: 'amarelo', cor: '#facc15', syn: ['amarelo', 'amarela', 'yellow'], f: COR('#facc15') },
  { nome: 'rosa', cor: '#f472b6', syn: ['rosa', 'pink'], f: COR('#f472b6') },
  { nome: 'roxo', cor: '#a855f7', syn: ['roxo', 'roxa', 'purple'], f: COR('#a855f7') },
  { nome: 'preto', cor: '#1f2937', syn: ['preto', 'preta', 'black'], f: COR('#1f2937') },
  { nome: 'branco', cor: '#f8fafc', syn: ['branco', 'branca', 'white'], f: COR('#f8fafc') },
  { nome: 'laranja', cor: '#fb923c', syn: ['laranja', 'orange'], f: COR('#fb923c') },
  { nome: 'dourado', cor: '#eab308', syn: ['dourado', 'dourada', 'ouro', 'golden', 'gold'], f: COR('#eab308') },
  { nome: 'arco-íris', cor: 'arcoiris', syn: ['colorido', 'colorida', 'arcoiris', 'rainbow'], f: COR('arcoiris') },
];

// ------------------------------------------------------------------ ligações (verbos)
export const LIGACOES = [
  { id: 'atira', nome: 'atira', desc: 'Atira no mais perto (arma: o que ela dispara)', syn: ['atira', 'atiram', 'atire', 'dispara', 'disparam', 'lanca', 'lancam', 'cospe', 'cospem', 'arremessa', 'arremessam', 'joga', 'jogam', 'shoots', 'shoot', 'fires', 'fire', 'spits', 'throws', 'throw'] },
  { id: 'solta', nome: 'solta / caga', desc: 'Deixa cair embaixo de si', syn: ['solta', 'soltam', 'caga', 'cagam', 'larga', 'largam', 'bota', 'botam', 'poe', 'poem', 'derruba', 'derrubam', 'chove', 'chovem', 'poops', 'poop', 'drops', 'drop', 'lays', 'lay', 'rains'] },
  { id: 'vira', nome: 'vira / explode em', desc: 'No fim, vira outras coisas', syn: ['vira', 'viram'] },
];
// expressões de várias palavras viram uma só
const FRASES = [
  ['lanca foguetes', 'bazuca'], ['lanca foguete', 'bazuca'], ['rocket launcher', 'bazuca'], ['machine gun', 'metralhadora'],
  ['lanca granadas', 'lancagranadas'], ['lanca granada', 'lancagranadas'], ['grenade launcher', 'lancagranadas'],
  ['lanca chamas', 'lancachamas'], ['lanca chama', 'lancachamas'], ['arco e flecha', 'arco'], ['varinha magica', 'varinha'],
  ['chuva de', 'chuva'], ['buraco negro', 'buraconegro'], ['black hole', 'buraconegro'], ['boneco de neve', 'bonecodeneve'],
  ['bola de neve', 'boladeneve'], ['disco voador', 'ovni'], ['nave espacial', 'ovni'], ['fogos de artificio', 'fogos'], ['fogo de artificio', 'fogos'],
  ['x burguer', 'hamburguer'], ['x burger', 'hamburguer'], ['tiranossauro rex', 'dinossauro'], ['t rex', 'dinossauro'],
  ['arco iris', 'arcoiris'], ['de fogo', 'flamejante'], ['pegando fogo', 'flamejante'], ['em chamas', 'flamejante'],
  ['de gelo', 'congelante'], ['de ouro', 'dourado'], ['de neon', 'brilhante'],
  ['um monte de', 'oito'], ['monte de', 'oito'], ['um bando de', 'oito'], ['bando de', 'oito'], ['enxame de', 'dez'], ['um exercito de', 'dez'], ['exercito de', 'dez'],
  ['se transformam em', 'vira'], ['se transforma em', 'vira'], ['transforma em', 'vira'], ['se dividem em', 'vira'], ['se divide em', 'vira'],
  ['explodem em', 'vira'], ['explode em', 'vira'], ['estoura em', 'vira'], ['estouram em', 'vira'], ['explodes into', 'vira'], ['explode into', 'vira'], ['turns into', 'vira'], ['turn into', 'vira'], ['becomes', 'vira'],
  ['deixam cair', 'solta'], ['deixa cair', 'solta'],
];
const IGNORAR = new Set(('que quem qual um uma uns umas o a os as de do da dos das com sem pra para por favor eu quero queria quer me mim faz fazer cria crie criar '
  + 'gera gere gerar manda mande tenho ter ai muito tipo assim entao isso esse essa este esta bem mais tambem ele ela eles elas seu sua no na nos nas em ao aos '
  + 'i want a an the that which with of make give please some it its is are to my can you').split(' '));
const NUMEROS = { dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, vinte: 20, cem: 30, mil: 30,
  duplo: 2, dupla: 2, triplo: 3, tripla: 3, quadruplo: 4, varios: 5, varias: 5, muitos: 8, muitas: 8,
  two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, hundred: 30, many: 8 };
// guardar a criação: "guardar", "nada", "tirar"...
const GUARDAR = new Set(['guardar', 'guarda', 'guarde', 'nada', 'tirar', 'tira', 'sumir', 'nenhuma', 'remover', 'remove', 'none', 'nothing']);

const SYN_PECA = new Map();
const SYN_MOD = new Map();
const SYN_LIG = new Map();
const TODAS = [];
for (const k in PECAS) for (const w of PECAS[k].syn) { SYN_PECA.set(w, k); TODAS.push([w, 'peca', k]); }
for (const m of MODS) for (const w of m.syn) { SYN_MOD.set(w, m); TODAS.push([w, 'mod', m]); }
for (const l of LIGACOES) for (const w of l.syn) { SYN_LIG.set(w, l.id); TODAS.push([w, 'lig', l.id]); }

// ------------------------------------------------------------------ leitor
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function variantes(w) {
  const v = [w];
  for (const [a, b] of [[/oes$/, 'ao'], [/aes$/, 'ao'], [/ns$/, 'm'], [/eis$/, 'il'], [/is$/, 'l'], [/es$/, ''], [/s$/, '']]) if (a.test(w)) v.push(w.replace(a, b));
  return v;
}
function acharEm(mapa, w) {
  for (const x of variantes(w)) if (mapa.has(x)) return mapa.get(x);
  return null;
}
function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// o que a palavra é: ligação, jeito ou peça (com plural e um errinho de reconhecimento)
function classificar(w) {
  let x;
  if ((x = acharEm(SYN_LIG, w))) return ['lig', x];
  if ((x = acharEm(SYN_PECA, w))) return ['peca', x];
  if ((x = acharEm(SYN_MOD, w))) return ['mod', x];
  if (w.length < 5) return null; // palavra curta: não arrisca adivinhar
  let melhor = null;
  let bd = 9;
  for (const v of variantes(w)) {
    for (const [k, t, val] of TODAS) {
      if (Math.abs(k.length - v.length) > 2) continue;
      const d = lev(v, k);
      if (d < bd) { bd = d; melhor = [t, val]; }
    }
  }
  return bd <= (w.length >= 8 ? 2 : 1) ? melhor : null;
}

export function novoNo(k) {
  return { c: k, d: PECAS[k], qtd: 1, qtdExp: false, escala: 1, vel: 1, danoMul: 1, grav: 1, vidaMul: 1, explosivo: false, guiado: false, quica: false,
    cor: null, rastro: null, atravessa: false, transp: false, voa: false, louco: false, gira: false, pega: false, brilho: false,
    projetil: null, emissores: [], vira: null, mods: [], modsProj: [], pai: null, auto: false };
}
function aplicarMod(n, m) {
  if (m.efeito && n.d.tipo === 'arma') { n.modsProj.push(m); return; } // vale para o que a arma atira
  m.f(n);
  if (!n.mods.includes(m.nome)) n.mods.push(m.nome);
}
function ligar(pai, filho, tipo) {
  filho.pai = pai;
  if (tipo === 'vira') {
    pai.vira = filho;
    if (!filho.qtdExp) filho.qtd = 3;
    return;
  }
  if (pai.d.tipo === 'arma' && !pai.projetil) {
    pai.projetil = filho;
    return;
  }
  if (tipo === 'atira') pai.emissores.push({ filho, modo: 'mira', intervalo: 1.1 });
  else pai.emissores.push({ filho, modo: 'cai', intervalo: pai.d.mov === 'anda' ? 1.3 : 0.55 });
}
// completa a árvore com o que cada peça faz sozinha: o tiro padrão da arma, o fogo do dragão,
// as estrelas dos fogos... (só onde a frase não disse outra coisa)
function auto(k, pai) {
  const n = novoNo(k);
  n.pai = pai;
  n.auto = true;
  return n;
}
function completar(n, prof = 0) {
  if (prof > 10) return;
  const d = n.d;
  if (d.tipo === 'arma') {
    if (!n.projetil) n.projetil = auto(d.padrao, n);
    for (const m of n.modsProj) aplicarMod(n.projetil, m);
    n.modsProj = [];
  } else if (d.emite && !n.emissores.length) {
    n.emissores.push({ filho: auto(d.emite[0], n), modo: d.emite[1], intervalo: d.emite[2] });
  }
  if (d.viraPadrao && !n.vira) {
    n.vira = auto(d.viraPadrao[0], n);
    n.vira.qtd = d.viraPadrao[1];
  }
  if (n.projetil) completar(n.projetil, prof + 1);
  for (const m of n.emissores) completar(m.filho, prof + 1);
  if (n.vira) completar(n.vira, prof + 1);
}

// texto -> { raiz, ignoradas } | { guardar: true } | null (nenhuma peça)
export function parsear(texto) {
  let s = ` ${normalizar(texto)} `;
  for (const [a, b] of FRASES) s = s.replaceAll(` ${a} `, ` ${b} `);
  const toks = s.trim().split(' ').filter(Boolean);
  if (toks.length && toks.length <= 3 && toks.some((w) => GUARDAR.has(w)) && !toks.some((w) => classificar(w)?.[0] === 'peca')) return { guardar: true };
  let raiz = null;
  let atual = null;
  let ultimoNo = null;
  let ligPend = null;
  let modsPend = [];
  let qtdPend = null;
  let eVisto = false;
  const ignoradas = [];
  for (const [i, w] of toks.entries()) {
    if (w === 'e' || w === 'and') { eVisto = true; continue; }
    if (w === 'faca' && i === 0 && toks.length > 1) continue; // "faça uma pistola..." (a faca sozinha é a peça)
    if (IGNORAR.has(w)) continue;
    const num = /^\d+$/.test(w) ? Math.min(30, Number(w)) : NUMEROS[w];
    if (num) { qtdPend = num; ultimoNo = null; continue; }
    const cl = classificar(w);
    if (!cl) { ignoradas.push(w); continue; }
    const [t, val] = cl;
    if (t === 'lig') {
      if (eVisto && atual?.pai) atual = atual.pai; // "... e atira X" volta para o dono anterior
      eVisto = false;
      ligPend = val;
      ultimoNo = null;
      continue;
    }
    if (t === 'mod') {
      if (ultimoNo) aplicarMod(ultimoNo, val);
      else modsPend.push(val);
      continue;
    }
    const n = novoNo(val);
    if (qtdPend) { n.qtd = qtdPend; n.qtdExp = true; qtdPend = null; }
    for (const m of modsPend) aplicarMod(n, m);
    modsPend = [];
    if (!raiz) raiz = n;
    else if (ligPend) ligar(atual, n, ligPend);
    else if (atual.d.tipo === 'arma' && !atual.projetil) ligar(atual, n, 'atira'); // "metralhadora de abelhas"
    else { ignoradas.push(`${w} (sem ligação)`); continue; }
    ligPend = null;
    eVisto = false;
    atual = n;
    ultimoNo = n;
  }
  if (!raiz) return null;
  if (raiz.d.tipo !== 'arma') {
    const mao = novoNo('mao');
    ligar(mao, raiz, 'atira');
    raiz = mao;
  }
  completar(raiz);
  return { raiz, ignoradas };
}

export const padraoDe = (a) => a._padrao || (a._padrao = novoNo(a.d.padrao));
export const projetilDe = (a) => a.projetil || padraoDe(a);

export function nomeNo(n) {
  return (n.qtd > 1 ? `${n.qtd}× ` : '') + n.d.nome + (n.mods.length ? ` (${n.mods.join(', ')})` : '');
}
// a criação em texto, como árvore ("Pistola / └─ atira: Pombo / └─ solta: Granada")
export function arvore(n, pre = '') {
  let out = `${nomeNo(n)}\n`;
  const filhos = [];
  if (n.d.tipo === 'arma') filhos.push(['atira', projetilDe(n)]);
  for (const m of n.emissores) filhos.push([m.modo === 'cai' ? 'solta' : 'atira', m.filho]);
  if (n.vira) filhos.push(['ao morrer vira', n.vira]);
  filhos.forEach(([rot, f], i) => {
    const ult = i === filhos.length - 1;
    out += `${pre}${ult ? '└─ ' : '├─ '}${rot}: ${arvore(f, pre + (ult ? '   ' : '│  '))}`;
  });
  return out;
}
// o nome curto do que está na mão (sem a mão de arremessar)
export const nomeDaCriacao = (raiz) => nomeNo(raiz.c === 'mao' ? raiz.projetil : raiz);

// combinações prontas para o catálogo
export const COMBOS = [
  'pistola que atira pombos que cagam granadas',
  'metralhadora de abelhas teleguiadas',
  'bazuca que atira vacas explosivas',
  'chuva de pianos',
  'chuva de tubarões explosivos',
  'galinha que bota ovos que viram galinhas',
  'canhão que atira tubarões que explodem em três bombas',
  'pombo gigante que caga pistolas que atiram bolas quicantes',
  'dragão que cospe meteoros',
  'avião que solta vacas voadoras',
  'nuvem que chove cocô',
  'lança-chamas de gelo',
  'estilingue de melancias gigantes que explodem em dez abelhas',
  'arco de flechas teleguiadas de fogo',
  'escopeta de pizzas giratórias',
  'disco voador que solta dinossauros',
  'buraco negro que vira vinte confetes',
  'torreta que atira tubarões',
  'fogos de artifício que viram dez pombos',
  'varinha que atira unicórnios voadores',
  'helicóptero que solta zumbis',
  'macaco gigante que joga bananas explosivas',
  'mina que vira cinco tornados',
  'bumerangue de fogo',
  'tanque que atira galinhas',
  'robô invisível que atira relâmpagos',
];
