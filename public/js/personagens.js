// Catálogo dos personagens: só dados, sem 3D. O navegador usa (modelo.js carrega o .glb, o modal
// de escolha mostra a miniatura) e o servidor também, para aceitar só ids que existem.
// Para entrar aqui, o modelo precisa estar RIGADO E ANIMADO — ver README em /models.
//
// miniatura: imagem pronta em /img/personagens (gerada por scripts/miniaturas.js), para o modal
// abrir na hora sem baixar nenhum modelo.
// raioVista (opcional): raio da esfera de recorte de vista e de sombra, em alturas do boneco
// (padrão 1,1, e 2,7 em quem transforma). Pequena demais, um braço some na borda da tela.
// maos (opcional): nomes das peças que ficam penduradas nos ossos das mãos (padrão: nenhuma —
// o KayKit traz todas as armas do pacote no arquivo, umas por cima das outras).
// flutua (opcional): { altura, periodo } para quem não tem perna. Andando, sobe do chão até
// `altura` e volta a cada `periodo` segundos, em vez de dar passo (ver flutuar em modelo.js).
// molas (opcional): [{ osso, ponta, rigidez, amortecimento, limite, inercia }] — ossos com física de balanço
// (spring bone): `osso` é um padrão (regex sem distinção de maiúsculas) e `ponta` é o comprimento
// da alavanca simulada em metros no espaço do osso (ver MolaOsso em modelo.js).
// versao (opcional): vai no endereço do .glb e da miniatura. /models e /img ficam um dia no cache
// do navegador sem perguntar ao servidor: suba o número quando trocar o arquivo, senão quem já
// abriu a sala continua vendo o antigo.

const KAYKIT = {
  // altura medida na pose de repouso do arquivo; de pé eles esticam um pouco,
  // então o alvo é menor que a altura final desejada
  altura: 1.55,
  // o pacote traz 76 a 95 clipes; estes são os que o jogo usa, escolhidos à mão
  // porque o palpite automático pegava a pose de combate com arma na mão
  clipes: {
    idle: 'Unarmed_Idle',
    walk: 'Walking_A',
    run: 'Running_A',
    air: 'Jump_Idle',
    sit: 'Sit_Chair_Idle',
    punch: 'Unarmed_Melee_Attack_Punch_A',
    wave: 'Cheer',
  },
  resumo: 'Anda, corre, pula, senta, soca e comemora',
};

const kaykit = (id, label, credito) => ({ id, label, url: `/models/${id}.glb`, ...KAYKIT, credito });

// os dois Atos têm clipes com os mesmos nomes (o clássico, sem pés, muda a altura)
const ATOS = {
  // é uma bola: bem mais baixa que os bonecos, mas quase tão larga quanto alta
  altura: 1.25,
  clipes: { idle: 'Idle', walk: 'Walk', run: 'Run', air: 'Jump', sit: 'Sit', punch: 'Punch', wave: 'Wave' },
};

// Transformers Alliance: os mesmos clipes em todos (o de comemorar, que vira o aceno, muda de nome
// no Ratchet)
const clipesAlliance = (aceno) => ({ idle: 'Idle', walk: 'Walk', run: 'Run', air: 'Jump', sit: 'Idle', punch: 'Punch', wave: aceno });
// Jazz, Ratchet e Brawn: o repouso do arquivo já é o robô de pé, então a altura é a dele
const alliance = (id, label, altura, resumo, aceno) => ({
  id,
  label,
  url: `/models/${id}.glb`,
  altura,
  clipes: clipesAlliance(aceno),
  transforma: { paraVeiculo: 'transform_v', paraRobo: 'transform_r' },
  // com o repouso de robô, nem transformando ele passa de 1,06 h do centro
  raioVista: 1.15,
  resumo,
  credito: 'orangesauceu, do Transformers Alliance — CC BY',
  aviso: 'transforma em carro de verdade',
});

export const PERSONAGENS = {
  padrao: { id: 'padrao', label: 'Boneco', url: null, resumo: 'Com a sua cor, camiseta e foto no rosto' },
  // gerado inteiro no Blender por scripts/modelar-atos.py — para mexer nele, mude o script
  atos: {
    id: 'atos',
    label: 'Atos',
    url: '/models/atos.glb',
    versao: 2, // 2: a bola virou a logo (olho em espiral)
    ...ATOS,
    resumo: 'Olho em espiral: olha em volta, pisca, pula, senta, acena e soca',
  },
  // o primeiro Atos, de olhos de pílula: scripts/modelar-atos-classico.py
  'atos-classico': {
    id: 'atos-classico',
    label: 'Atos clássico',
    url: '/models/atos-classico.glb',
    versao: 4, // 2: ganhou a curvinha da logo; 3: anda flutuando; 4: sem pés, aceno pelo pulso
    ...ATOS,
    // sem os pés o modelo ficou mais baixo: 1,18 deixa a bola do mesmo tamanho de antes
    altura: 1.18,
    // não tem perna: anda em ondas, do chão a 25 cm e de volta (ver flutuar em modelo.js)
    flutua: { altura: 0.25, periodo: 1.3 },
    resumo: 'Flutua em ondas como fantasma, pula, senta, acena e soca',
  },
  robo: {
    id: 'robo',
    label: 'Robô',
    url: '/models/robo.glb',
    altura: 1.8,
    // "Sitting" é o movimento de SENTAR (0,4 s), não a pose sentada: repetido em loop o robô
    // descia e subia sem parar. Toca uma vez e segura o último quadro.
    poses: ['Sitting'],
    resumo: '14 animações: dança, aceno, soco, joinha…',
    credito: 'Tomás Laulhé (Quaternius), ajustes de Don McCurdy — CC0',
  },
  cavaleiro: kaykit('cavaleiro', 'Cavaleiro', 'KayKit Adventurers, de Kay Lousberg — CC0'),
  barbaro: kaykit('barbaro', 'Bárbaro', 'KayKit Adventurers, de Kay Lousberg — CC0'),
  // rig, animações e ossos de balanço gerados por scripts/rigar-guerreira.py +
  // scripts/animar-guerreira.py (com scripts/guerreira_comum.py) a partir do FBX bruto
  guerreira: {
    id: 'guerreira',
    label: 'Guerreira',
    url: '/models/guerreira.glb',
    versao: 2, // 2: esqueleto e pesos refeitos (pernas cruzadas da estátua), capa com ossos próprios
    altura: 1.72,
    clipes: { idle: 'Idle', walk: 'Walk', run: 'Run', air: 'Jump', sit: 'Sit', punch: 'Punch', wave: 'Wave' },
    molas: [{ osso: 'breast', ponta: 0.1, rigidez: 180, amortecimento: 9, limite: 0.35, inercia: 0.45 }],
    resumo: 'Anda, corre, pula, senta, soca e acena — com balanço nos seios',
    credito: 'Mixamo / Adobe',
  },
  mago: kaykit('mago', 'Mago', 'KayKit Adventurers, de Kay Lousberg — CC0'),
  ladino: kaykit('ladino', 'Ladino', 'KayKit Adventurers, de Kay Lousberg — CC0'),
  encapuzado: kaykit('encapuzado', 'Encapuzado', 'KayKit Adventurers, de Kay Lousberg — CC0'),
  esqueleto: kaykit('esqueleto', 'Esqueleto', 'KayKit Skeletons, de Kay Lousberg — CC0'),
  'esqueleto-guerreiro': kaykit('esqueleto-guerreiro', 'Esqueleto Guerreiro', 'KayKit Skeletons, de Kay Lousberg — CC0'),
  'esqueleto-ladino': kaykit('esqueleto-ladino', 'Esqueleto Ladino', 'KayKit Skeletons, de Kay Lousberg — CC0'),
  'esqueleto-mago': kaykit('esqueleto-mago', 'Esqueleto Mago', 'KayKit Skeletons, de Kay Lousberg — CC0'),

  // Estes dois trazem a animação de transformar em veículo — é o que faz a
  // transformação acontecer de verdade, em vez de trocar pelo carro desenhado
  // em código. Andar, correr e pular (e o parado do Optimus) não vinham no arquivo:
  // Walk, Run, Jump e Idle são gerados por scripts/animar-transformers.js.
  optimus: {
    id: 'optimus',
    label: 'Optimus',
    url: '/models/optimus.glb',
    versao: 2, // 2: ganhou Idle, Walk, Run e Jump
    // a pose de repouso deste arquivo é bem mais baixa que o robô de pé: ele
    // estica 2,1x ao assumir a pose, então o alvo tem que ser proporcionalmente menor
    altura: 1.34,
    clipes: { idle: 'Idle', walk: 'Walk', run: 'Run', air: 'Jump', sit: 'Idle', punch: 'fire_gun01' },
    transforma: { paraVeiculo: 'transform_to_vehicle', paraRobo: 'transform_to_robot' },
    resumo: 'Vira caminhão de verdade no G',
    credito: 'OrangeSauceu (Transformers: Earth Wars)',
    aviso: 'transforma em caminhão de verdade',
  },
  solus: {
    id: 'solus',
    label: 'Solus Prime',
    url: '/models/solus.glb',
    versao: 2, // 2: ganhou Walk, Run e Jump
    altura: 2.3,
    clipes: {
      idle: 'idle',
      walk: 'Walk',
      run: 'Run',
      air: 'Jump',
      sit: 'idle',
      punch: 'Main_Hammer_Attack',
      wave: 'Forge_Solus_Prime_Equip',
    },
    transforma: { paraVeiculo: 'main_to_alt', paraRobo: 'alt_to_main' },
    // nem transformando ele passa de 1,21 h do centro: com os 2,7 h de quem transforma, a
    // esfera de recorte passaria de 6 m
    raioVista: 1.5,
    resumo: 'Transforma no G',
    credito: 'OrangeSauceu (Transformers: Earth Wars)',
  },

  // Os quatro do Transformers Alliance viram carro no G. Chegam do Sketchfab com o transformar, o
  // comemorar e golpes virados de lado; scripts/preparar-alliance.js os põe de frente e enxuga, e
  // scripts/animar-transformers.js grava Idle, Walk, Run, Jump e Punch (de frente, pelo esqueleto).
  bumblebee: {
    id: 'bumblebee',
    label: 'Bumblebee',
    url: '/models/bumblebee.glb',
    // a pose de repouso deste arquivo é o Camaro (0,58 de altura); de pé, com as portas nas
    // costas, o robô tem 4,78 vezes isso: 0,544 deixa o robô com 2,6 m
    altura: 0.544,
    clipes: clipesAlliance('emo_joyful'),
    // só traz a ida: a volta a robô é ela de trás para frente (ver transformar em modelo.js)
    transforma: { paraVeiculo: 'transform_v', voltaAoContrario: true },
    // a altura acima é a do carro: de pé ele chega a 4,5 h do centro da esfera
    raioVista: 4.7,
    resumo: 'Vira Camaro de verdade no G',
    credito: 'Pipogame (@joseclaudio162001), do Transformers Alliance — CC BY',
    aviso: 'transforma em carro de verdade',
  },
  jazz: alliance('jazz', 'Jazz', 2.4, 'Vira carro esporte no G', 'emo_joyful'),
  ratchet: alliance('ratchet', 'Ratchet', 2.8, 'Vira ambulância no G', 'emo_joy'),
  brawn: alliance('brawn', 'Brawn', 2.7, 'Vira jipe no G', 'emo_joyful'),
};

for (const p of Object.values(PERSONAGENS)) {
  const v = p.versao ? `?v=${p.versao}` : '';
  p.miniatura = `/img/personagens/${p.id}.webp${v}`;
  if (p.url) p.url += v;
}

export const IDS_PERSONAGENS = Object.keys(PERSONAGENS);
