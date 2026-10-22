// Caça-Fantasmas (como o Phasmophobia): os dados do jogo, só números e textos, sem three.js. O
// navegador (fantasmas.js e fantasmas-3d.js) monta as casas daqui, e o servidor
// (fantasmas-servidor.js) usa as mesmas salas, portas, móveis e objetos para andar com o
// fantasma, saber em que cômodo cada um está e o que dá para jogar longe.
//
// Cada casa é um conjunto de cômodos retangulares (x0..x1, z0..z1, nas coordenadas da casa: o
// chão é y = 0 e a frente olha para +z) e de portas entre dois cômodos (ou para fora). Os móveis,
// os objetos soltos, os interruptores e os esconderijos nascem de um sorteio com semente fixa por
// casa: saem iguais no servidor e em todos os navegadores.

// ------------------------------------------------------------------ as provas
export const PROVAS = {
  emf: { nome: 'EMF nível 5', curto: 'EMF 5', cor: '#ef4444', dica: 'O leitor EMF chega no 5 quando o fantasma mexe em algo' },
  spirit: { nome: 'Spirit Box', curto: 'Spirit Box', cor: '#f97316', dica: 'Com a luz apagada, perto dele, pergunte (clique) e ele responde' },
  digitais: { nome: 'Digitais', curto: 'Digitais', cor: '#a78bfa', dica: 'A lanterna UV mostra as mãos em portas e interruptores que ele tocou' },
  orbes: { nome: 'Orbes', curto: 'Orbes', cor: '#e2e8f0', dica: 'Pela câmera de visão noturna, bolinhas de luz no cômodo dele' },
  escrita: { nome: 'Escrita fantasma', curto: 'Escrita', cor: '#facc15', dica: 'Deixe o livro no cômodo dele: ele rabisca as páginas' },
  frio: { nome: 'Temperatura congelante', curto: 'Congelante', cor: '#38bdf8', dica: 'O termômetro marca abaixo de 0 °C no cômodo dele' },
  dots: { nome: 'Projetor D.O.T.S.', curto: 'D.O.T.S.', cor: '#4ade80', dica: 'Ponha o projetor: o vulto dele passa pelos pontos verdes' },
};
export const IDS_PROVAS = Object.keys(PROVAS);

// ------------------------------------------------------------------ os 12 monstros
// Todos aparecem como a mesma dama de véu (como no Phasmophobia, a cara não entrega o tipo: só as
// provas). DAMA: o .glb (public/models/fantasmas/dama.glb, ver scripts/preparar-dama.js e o README
// de public/models), a altura, a cor da borda que brilha e os clipes (pedaços do nome das animações,
// na ordem de preferência). olhos: false (o rosto fica sob o cabelo); voa: flutua, sem pé no chão.
// velocidade: m/s andando à toa; caca: m/s na caçada, sem ver ninguém / vendo alguém. sanidade:
// abaixo dela (média do time) ele pode caçar.
const DAMA = {
  modelo: 'dama', altura: 1.8, borda: '#7dd3fc', olhos: false,
  clipes: { parado: ['Idle'], andar: ['Walk'], correr: ['Run'], ataque: ['Attack'] },
};
export const MONSTROS = [
  {
    id: 'espirito', nome: 'Espírito', provas: ['emf', 'spirit', 'escrita'], cor: '#93c5fd',
    ...DAMA,
    velocidade: 1.6, caca: [1.7, 2.4], sanidade: 50,
    desc: 'Um espírito comum, preso a este lugar. Ninguém sabe o que ele quer.',
    forca: 'Nenhuma conhecida.', fraqueza: 'O incenso o acalma por muito mais tempo: 3 minutos sem caçar.',
  },
  {
    id: 'espectro', nome: 'Espectro', provas: ['emf', 'spirit', 'dots'], cor: '#c4b5fd',
    ...DAMA,
    velocidade: 1.6, caca: [1.7, 2.5], sanidade: 50,
    desc: 'Some de um lugar para aparecer em outro, sem passar pelo meio.',
    forca: 'Às vezes se teleporta para perto de alguém (o EMF marca 2 onde ele chega).', fraqueza: 'O incenso o deixa tonto por mais tempo na caçada.',
  },
  {
    id: 'poltergeist', nome: 'Poltergeist', provas: ['spirit', 'digitais', 'escrita'], cor: '#fca5a5',
    ...DAMA,
    velocidade: 1.7, caca: [1.7, 2.4], sanidade: 50,
    desc: 'O barulhento: adora arremessar coisas e bater portas.',
    forca: 'Joga vários objetos de uma vez, e cada arremesso assusta quem vê.', fraqueza: 'Num cômodo vazio, sem nada para jogar, fica inofensivo.',
  },
  {
    id: 'banshee', nome: 'Banshee', provas: ['digitais', 'orbes', 'dots'], cor: '#f0abfc',
    ...DAMA,
    velocidade: 1.6, caca: [1.7, 2.4], sanidade: 50,
    desc: 'Escolhe uma vítima e só larga quando ela morre. Às vezes grita no Spirit Box.',
    forca: 'Caça pela sanidade de UMA pessoa só, a escolhida, não pela média do time.', fraqueza: 'O crucifixo a segura mais longe (5 m).',
  },
  {
    id: 'mare', nome: 'Pesadelo', provas: ['spirit', 'orbes', 'escrita'], cor: '#94a3b8',
    ...DAMA,
    velocidade: 1.6, caca: [1.7, 2.4], sanidade: 50,
    desc: 'Vive no escuro. Odeia luz e apaga tudo o que encontra aceso.',
    forca: 'No escuro caça mais cedo (60% de sanidade).', fraqueza: 'Com a luz acesa no cômodo dele, só caça abaixo de 40%. Nunca acende uma luz.',
  },
  {
    id: 'revenant', nome: 'Revenant', provas: ['orbes', 'escrita', 'frio'], cor: '#a3e635',
    ...DAMA,
    velocidade: 1.1, caca: [1.0, 3.2], sanidade: 50,
    desc: 'O morto que voltou. Lento quando não vê ninguém; quando vê, é o mais rápido de todos.',
    forca: 'Vendo você na caçada, corre a mais de 3 m/s.', fraqueza: 'Sem ver ninguém anda devagar: esconda-se e ele perde o rastro.',
  },
  {
    id: 'demonio', nome: 'Demônio', provas: ['digitais', 'escrita', 'frio'], cor: '#ef4444',
    ...DAMA,
    velocidade: 1.7, caca: [1.8, 2.5], sanidade: 70,
    desc: 'O mais agressivo: caça cedo e caça sempre.',
    forca: 'Caça com 70% de sanidade e com menos espera entre uma caçada e outra.', fraqueza: 'O crucifixo o segura de mais longe (5 m).',
  },
  {
    id: 'oni', nome: 'Oni', provas: ['emf', 'frio', 'dots'], cor: '#60a5fa',
    ...DAMA,
    velocidade: 1.8, caca: [1.8, 2.5], sanidade: 50,
    desc: 'Um demônio cheio de energia. Fica mais ativo com gente por perto.',
    forca: 'Aparece muito mais e mexe em tudo; na caçada pisca menos (fica mais tempo à vista).', fraqueza: 'Tão exibido que é fácil de achar.',
  },
  {
    id: 'hantu', nome: 'Hantu', provas: ['digitais', 'orbes', 'frio'], cor: '#bae6fd',
    ...DAMA,
    velocidade: 1.4, caca: [1.4, 2.0], sanidade: 50,
    desc: 'Gosta do frio. Fica mais forte quanto mais gelado estiver o cômodo.',
    forca: 'Nos cômodos gelados (abaixo de 3 °C) corre bem mais (2,7 m/s).', fraqueza: 'Em cômodo quente é lento. Nunca liga o disjuntor.',
  },
  {
    id: 'raiju', nome: 'Raiju', provas: ['emf', 'orbes', 'dots'], cor: '#facc15',
    ...DAMA,
    velocidade: 1.7, caca: [1.7, 2.4], sanidade: 50,
    desc: 'O espírito do trovão, que se alimenta de eletricidade.',
    forca: 'Perto de lanternas e aparelhos ligados corre a 2,6 m/s, e embaralha tudo de mais longe.', fraqueza: 'Com tudo desligado, é um fantasma comum.',
  },
  {
    id: 'yokai', nome: 'Yokai', provas: ['spirit', 'orbes', 'dots'], cor: '#86efac',
    ...DAMA,
    velocidade: 1.7, caca: [1.7, 2.4], sanidade: 50,
    desc: 'Se irrita com barulho. Falar no microfone perto dele é pedir para ser caçado.',
    forca: 'Gente falando perto faz ele caçar com 80% de sanidade.', fraqueza: 'Na caçada só escuta quem fala muito perto (2 m).',
  },
  {
    id: 'deogen', nome: 'Deogen', provas: ['spirit', 'escrita', 'dots'], cor: '#e5e7eb',
    ...DAMA,
    velocidade: 1.5, caca: [3.0, 3.0], sanidade: 40,
    desc: 'Sempre sabe onde você está. Ninguém se esconde dele.',
    forca: 'Na caçada vem direto até você, muito rápido, mesmo escondido.', fraqueza: 'Bem perto fica lentíssimo (0,4 m/s): dá para correr em círculos em volta dele.',
  },
];
export const MONSTRO = Object.fromEntries(MONSTROS.map((m) => [m.id, m]));
export const MODELO_URL = (m) => `/models/fantasmas/${m.modelo}.glb?v=1`;

// nomes do fantasma (como a pessoa que ele foi): aparece no quadro da van e no diário
export const NOMES = ['Maria Aparecida', 'João Batista', 'Ana Clara', 'Benedito Souza', 'Rosa Maria', 'Severino Lima', 'Luzia Fernandes',
  'Antônio Carlos', 'Isabel Moreira', 'Joaquim Pereira', 'Helena Duarte', 'Francisco Alves', 'Cecília Ramos', 'Raimundo Nonato', 'Teresa Cristina',
  'Sebastião Rocha', 'Olga Mendes', 'Lázaro Nunes', 'Glória Pires', 'Otávio Barros'];

// as respostas do Spirit Box (a voz sai do próprio navegador, bem grave e lenta)
export const RESPOSTAS = {
  onde: ['Aqui', 'Perto', 'Atrás de você', 'Longe', 'Do seu lado', 'Em cima'],
  idade: ['Criança', 'Velho', 'Jovem', 'Cem anos', 'Adulto'],
  quem: ['Morte', 'Matar', 'Sangue', 'Você', 'Sofrer', 'Odeio'],
};

// ------------------------------------------------------------------ itens
// Todo mundo começa com tudo. Os que se põem no chão (livro, D.O.T.S., crucifixo) têm limite.
export const ITENS = [
  { id: 'emf', nome: 'Leitor EMF', tecla: '1', dica: 'Mede o campo eletromagnético: 5 é prova' },
  { id: 'spirit', nome: 'Spirit Box', tecla: '2', dica: 'Clique para perguntar (luz apagada, perto dele)' },
  { id: 'termo', nome: 'Termômetro', tecla: '3', dica: 'Abaixo de 0 °C é prova' },
  { id: 'camera', nome: 'Câmera noturna', tecla: '4', dica: 'Clique liga a visão noturna: mostra os orbes' },
  { id: 'uv', nome: 'Lanterna UV', tecla: '5', dica: 'Clique liga: mostra digitais em portas e interruptores' },
  { id: 'livro', nome: 'Livro', tecla: '6', dica: 'Clique põe no chão (E pega de volta)', limite: 2 },
  { id: 'dots', nome: 'Projetor D.O.T.S.', tecla: '7', dica: 'Clique põe no chão (E pega de volta)', limite: 2 },
  { id: 'crucifixo', nome: 'Crucifixo', tecla: '8', dica: 'No chão, impede caçadas perto dele (2 usos)', limite: 2 },
  { id: 'incenso', nome: 'Incenso', tecla: '9', dica: 'Clique acende: perto dele, segura ou cega o fantasma', limite: 3 },
];
export const ITEM = Object.fromEntries(ITENS.map((i) => [i.id, i]));

// ------------------------------------------------------------------ números do jogo
export const JOGO = {
  sanidadeEscuro: 0.16, // %/s dentro da casa, com a luz do cômodo apagada
  sanidadeClaro: 0.05, // %/s dentro da casa, com luz
  sanidadeEvento: 10, // ver o fantasma aparecer
  sanidadeSusto: 4, // arremesso, porta batendo perto
  remedio: 40, // a caixa de remédios da van (uma vez por pessoa)
  esperaCacada: 25, // s entre uma caçada e a outra (o demônio: 20)
  carencia: 3.5, // s do começo da caçada em que ele ainda não mata
  crucifixo: 3, // raio em m (banshee e demônio: 5)
  incensoSegura: 90, // s sem caçar depois do incenso (o espírito: 180)
  incensoCega: 6, // s cego na caçada (o espectro: 12)
  alcanceSpirit: 5, // m até o fantasma para a pergunta valer
  pegou: 0.9, // m: a caçada pegou
  duracao: { pequena: 22, media: 30, grande: 38 }, // s de caçada por tamanho de casa
  moedas: { acertou: 30, acertouMorto: 15, sobreviveu: 5 },
};

// ------------------------------------------------------------------ as casas
// tam: pequena/media/grande (duração da caçada, quanto a sanidade cai). pe: altura do teto.
// estilo: as texturas de piso, parede e fachada. portas: a/b são os cômodos (b null: a porta da
// rua); x/z no meio do vão, que fica sobre a parede comum.
const CASAS = [
  {
    id: 'acacias', nome: 'Casa da Rua das Acácias', sub: 'Pequena · 8 cômodos', cor: '#f59e0b', tam: 'pequena', pe: 2.8,
    estilo: 'casa', origem: { x: -9000, y: 900, z: 9000 },
    desc: 'Uma casinha de família no fim da rua. Os vizinhos ouvem choro de bebê à noite.',
    comodos: [
      { id: 'sala', nome: 'Sala de estar', tipo: 'sala', x0: -10, z0: 1, x1: -2, z1: 7 },
      { id: 'hall', nome: 'Entrada', tipo: 'hall', x0: -2, z0: 1, x1: 2, z1: 7 },
      { id: 'cozinha', nome: 'Cozinha', tipo: 'cozinha', x0: 2, z0: 1, x1: 10, z1: 7 },
      { id: 'corredor', nome: 'Corredor', tipo: 'corredor', x0: -10, z0: -1, x1: 10, z1: 1 },
      { id: 'quarto1', nome: 'Quarto do casal', tipo: 'quarto', x0: -10, z0: -7, x1: -4, z1: -1 },
      { id: 'banheiro', nome: 'Banheiro', tipo: 'banheiro', x0: -4, z0: -7, x1: 0, z1: -1 },
      { id: 'quarto2', nome: 'Quarto do menino', tipo: 'quarto', x0: 0, z0: -7, x1: 5, z1: -1 },
      { id: 'bebe', nome: 'Quarto do bebê', tipo: 'bebe', x0: 5, z0: -7, x1: 10, z1: -1 },
    ],
    portas: [
      { a: 'hall', b: null, x: 0, z: 7, l: 1.2 },
      { a: 'hall', b: 'sala', x: -2, z: 4, l: 1.4, aberta: true },
      { a: 'hall', b: 'cozinha', x: 2, z: 4, l: 1.4, aberta: true },
      { a: 'hall', b: 'corredor', x: 0, z: 1, l: 1.2, aberta: true, semPorta: true },
      { a: 'sala', b: 'corredor', x: -7, z: 1, l: 1.0 },
      { a: 'cozinha', b: 'corredor', x: 7, z: 1, l: 1.0 },
      { a: 'corredor', b: 'quarto1', x: -7, z: -1, l: 1.0 },
      { a: 'corredor', b: 'banheiro', x: -2, z: -1, l: 0.9 },
      { a: 'corredor', b: 'quarto2', x: 2.5, z: -1, l: 1.0 },
      { a: 'corredor', b: 'bebe', x: 7.5, z: -1, l: 1.0 },
    ],
    disjuntor: { sala: 'cozinha', lado: 'z1', t: 0.85 },
  },
  {
    id: 'sitio', nome: 'Sítio Bela Vista', sub: 'Média · 11 cômodos', cor: '#84cc16', tam: 'media', pe: 3.0,
    estilo: 'sitio', origem: { x: -9600, y: 900, z: 9000 },
    desc: 'A sede de uma fazenda abandonada desde o incêndio no celeiro. O dono nunca foi encontrado.',
    comodos: [
      { id: 'jantar', nome: 'Sala de jantar', tipo: 'jantar', x0: -14, z0: 4, x1: -4, z1: 10 },
      { id: 'hall', nome: 'Entrada', tipo: 'hall', x0: -4, z0: 4, x1: 2, z1: 10 },
      { id: 'sala', nome: 'Sala de estar', tipo: 'sala', x0: 2, z0: 4, x1: 14, z1: 10 },
      { id: 'corredor', nome: 'Corredor', tipo: 'corredor', x0: -14, z0: 1, x1: 14, z1: 4 },
      { id: 'cozinha', nome: 'Cozinha', tipo: 'cozinha', x0: -14, z0: -10, x1: -6, z1: 1 },
      { id: 'despensa', nome: 'Despensa', tipo: 'deposito', x0: -6, z0: -10, x1: -2, z1: -5 },
      { id: 'lavanderia', nome: 'Lavanderia', tipo: 'lavanderia', x0: -6, z0: -5, x1: -2, z1: 1 },
      { id: 'banheiro', nome: 'Banheiro', tipo: 'banheiro', x0: -2, z0: -3, x1: 2, z1: 1 },
      { id: 'escritorio', nome: 'Escritório', tipo: 'escritorio', x0: -2, z0: -10, x1: 2, z1: -3 },
      { id: 'casal', nome: 'Quarto do casal', tipo: 'quarto', x0: 2, z0: -10, x1: 9, z1: 1 },
      { id: 'filho', nome: 'Quarto da filha', tipo: 'quarto', x0: 9, z0: -10, x1: 14, z1: 1 },
    ],
    portas: [
      { a: 'hall', b: null, x: -1, z: 10, l: 1.3 },
      { a: 'hall', b: 'jantar', x: -4, z: 7, l: 1.4, aberta: true },
      { a: 'hall', b: 'sala', x: 2, z: 7, l: 1.4, aberta: true },
      { a: 'hall', b: 'corredor', x: -1, z: 4, l: 1.3, aberta: true, semPorta: true },
      { a: 'jantar', b: 'corredor', x: -9, z: 4, l: 1.0 },
      { a: 'sala', b: 'corredor', x: 8, z: 4, l: 1.0 },
      { a: 'cozinha', b: 'corredor', x: -10, z: 1, l: 1.2, aberta: true },
      { a: 'cozinha', b: 'despensa', x: -6, z: -7.5, l: 0.9 },
      { a: 'lavanderia', b: 'corredor', x: -4, z: 1, l: 0.9 },
      { a: 'banheiro', b: 'corredor', x: 0, z: 1, l: 0.9 },
      { a: 'casal', b: 'corredor', x: 5, z: 1, l: 1.0 },
      { a: 'filho', b: 'corredor', x: 11.5, z: 1, l: 1.0 },
      { a: 'escritorio', b: 'casal', x: 2, z: -6.5, l: 0.9 },
      { a: 'escritorio', b: 'despensa', x: -2, z: -7.5, l: 0.9 },
    ],
    disjuntor: { sala: 'lavanderia', lado: 'x0', t: 0.5 },
  },
  {
    id: 'escola', nome: 'Escola Estadual Dom Pedro', sub: 'Grande · 12 cômodos', cor: '#38bdf8', tam: 'grande', pe: 3.2,
    estilo: 'escola', origem: { x: -10200, y: 900, z: 9000 },
    desc: 'Fechada depois que um aluno sumiu no recreio. O sinal ainda toca sozinho de madrugada.',
    comodos: [
      { id: 'sala1', nome: 'Sala 1 (alfabetização)', tipo: 'aula', x0: -24, z0: 2, x1: -14, z1: 16 },
      { id: 'sala2', nome: 'Sala 2', tipo: 'aula', x0: -14, z0: 2, x1: -4, z1: 16 },
      { id: 'hall', nome: 'Pátio de entrada', tipo: 'hall', x0: -4, z0: 2, x1: 4, z1: 16 },
      { id: 'sala3', nome: 'Sala 3', tipo: 'aula', x0: 4, z0: 2, x1: 14, z1: 16 },
      { id: 'biblioteca', nome: 'Biblioteca', tipo: 'biblioteca', x0: 14, z0: 2, x1: 24, z1: 16 },
      { id: 'corredor', nome: 'Corredor', tipo: 'corredor', x0: -24, z0: -2, x1: 24, z1: 2 },
      { id: 'banhM', nome: 'Banheiro masculino', tipo: 'banheiro', x0: -24, z0: -16, x1: -18, z1: -2 },
      { id: 'banhF', nome: 'Banheiro feminino', tipo: 'banheiro', x0: -18, z0: -16, x1: -12, z1: -2 },
      { id: 'refeitorio', nome: 'Refeitório', tipo: 'refeitorio', x0: -12, z0: -16, x1: 2, z1: -2 },
      { id: 'cozinha', nome: 'Cozinha', tipo: 'cozinha', x0: 2, z0: -16, x1: 8, z1: -2 },
      { id: 'professores', nome: 'Sala dos professores', tipo: 'escritorio', x0: 8, z0: -16, x1: 16, z1: -2 },
      { id: 'diretoria', nome: 'Diretoria', tipo: 'escritorio', x0: 16, z0: -16, x1: 24, z1: -2 },
    ],
    portas: [
      { a: 'hall', b: null, x: 0, z: 16, l: 1.8 },
      { a: 'hall', b: 'corredor', x: 0, z: 2, l: 2.2, aberta: true, semPorta: true },
      { a: 'sala1', b: 'corredor', x: -19, z: 2, l: 1.1 },
      { a: 'sala2', b: 'corredor', x: -9, z: 2, l: 1.1 },
      { a: 'sala3', b: 'corredor', x: 9, z: 2, l: 1.1 },
      { a: 'biblioteca', b: 'corredor', x: 19, z: 2, l: 1.4 },
      { a: 'sala1', b: 'sala2', x: -14, z: 12, l: 1.0 },
      { a: 'banhM', b: 'corredor', x: -21, z: -2, l: 1.0 },
      { a: 'banhF', b: 'corredor', x: -15, z: -2, l: 1.0 },
      { a: 'refeitorio', b: 'corredor', x: -5, z: -2, l: 2.0, aberta: true },
      { a: 'cozinha', b: 'corredor', x: 5, z: -2, l: 1.0 },
      { a: 'refeitorio', b: 'cozinha', x: 2, z: -9, l: 1.2 },
      { a: 'professores', b: 'corredor', x: 12, z: -2, l: 1.0 },
      { a: 'diretoria', b: 'corredor', x: 20, z: -2, l: 1.0 },
      { a: 'professores', b: 'diretoria', x: 16, z: -9, l: 0.9 },
    ],
    disjuntor: { sala: 'cozinha', lado: 'x1', t: 0.3 },
  },
  {
    id: 'hospicio', nome: 'Hospício Santa Luzia', sub: 'Grande · 20 cômodos', cor: '#a78bfa', tam: 'grande', pe: 3.4,
    estilo: 'hospicio', origem: { x: -10800, y: 900, z: 9000 },
    desc: 'Os pacientes da ala leste nunca saíram. Dizem que a terapia continua até hoje.',
    comodos: [
      { id: 'enfermaria', nome: 'Enfermaria', tipo: 'enfermaria', x0: -26, z0: 10, x1: -6, z1: 18 },
      { id: 'recepcao', nome: 'Recepção', tipo: 'recepcao', x0: -6, z0: 10, x1: 6, z1: 18 },
      { id: 'farmacia', nome: 'Farmácia', tipo: 'deposito', x0: 6, z0: 10, x1: 14, z1: 18 },
      { id: 'diretor', nome: 'Sala do diretor', tipo: 'escritorio', x0: 14, z0: 10, x1: 26, z1: 18 },
      { id: 'corredor1', nome: 'Corredor das celas', tipo: 'corredor', x0: -26, z0: 6, x1: 26, z1: 10 },
      { id: 'cela1', nome: 'Cela 1', tipo: 'cela', x0: -26, z0: -2, x1: -19, z1: 6 },
      { id: 'cela2', nome: 'Cela 2', tipo: 'cela', x0: -19, z0: -2, x1: -12, z1: 6 },
      { id: 'cela3', nome: 'Cela 3', tipo: 'cela', x0: -12, z0: -2, x1: -5, z1: 6 },
      { id: 'cela4', nome: 'Cela 4', tipo: 'cela', x0: -5, z0: -2, x1: 2, z1: 6 },
      { id: 'cela5', nome: 'Cela 5', tipo: 'cela', x0: 2, z0: -2, x1: 9, z1: 6 },
      { id: 'cela6', nome: 'Cela 6', tipo: 'cela', x0: 9, z0: -2, x1: 16, z1: 6 },
      { id: 'corredorL', nome: 'Corredor leste', tipo: 'corredor', x0: 16, z0: -18, x1: 20, z1: 6 },
      { id: 'chuveiros', nome: 'Chuveiros', tipo: 'banheiro', x0: 20, z0: -2, x1: 26, z1: 6 },
      { id: 'corredor2', nome: 'Corredor dos fundos', tipo: 'corredor', x0: -26, z0: -6, x1: 16, z1: -2 },
      { id: 'refeitorio', nome: 'Refeitório', tipo: 'refeitorio', x0: -26, z0: -18, x1: -12, z1: -6 },
      { id: 'cozinha', nome: 'Cozinha', tipo: 'cozinha', x0: -12, z0: -18, x1: -2, z1: -6 },
      { id: 'terapia', nome: 'Sala de terapia', tipo: 'terapia', x0: -2, z0: -18, x1: 8, z1: -6 },
      { id: 'necroterio', nome: 'Necrotério', tipo: 'necroterio', x0: 8, z0: -18, x1: 16, z1: -6 },
      { id: 'lavanderia', nome: 'Lavanderia', tipo: 'lavanderia', x0: 20, z0: -18, x1: 26, z1: -2 },
    ],
    portas: [
      { a: 'recepcao', b: null, x: 0, z: 18, l: 1.8 },
      { a: 'recepcao', b: 'corredor1', x: 0, z: 10, l: 2.0, aberta: true },
      { a: 'enfermaria', b: 'corredor1', x: -16, z: 10, l: 1.4 },
      { a: 'farmacia', b: 'corredor1', x: 10, z: 10, l: 1.0 },
      { a: 'diretor', b: 'corredor1', x: 20, z: 10, l: 1.0 },
      { a: 'cela1', b: 'corredor1', x: -22.5, z: 6, l: 1.0 },
      { a: 'cela2', b: 'corredor1', x: -15.5, z: 6, l: 1.0 },
      { a: 'cela3', b: 'corredor1', x: -8.5, z: 6, l: 1.0 },
      { a: 'cela4', b: 'corredor1', x: -1.5, z: 6, l: 1.0 },
      { a: 'cela5', b: 'corredor1', x: 5.5, z: 6, l: 1.0 },
      { a: 'cela6', b: 'corredor1', x: 12.5, z: 6, l: 1.0 },
      { a: 'corredorL', b: 'corredor1', x: 18, z: 6, l: 2.0, aberta: true, semPorta: true },
      { a: 'chuveiros', b: 'corredor1', x: 23, z: 6, l: 1.0 },
      { a: 'corredor2', b: 'corredorL', x: 16, z: -4, l: 2.0, aberta: true, semPorta: true },
      { a: 'refeitorio', b: 'corredor2', x: -19, z: -6, l: 1.6, aberta: true },
      { a: 'cozinha', b: 'corredor2', x: -7, z: -6, l: 1.0 },
      { a: 'terapia', b: 'corredor2', x: 3, z: -6, l: 1.0 },
      { a: 'necroterio', b: 'corredorL', x: 16, z: -12, l: 1.2 },
      { a: 'lavanderia', b: 'corredorL', x: 20, z: -10, l: 1.0 },
      { a: 'refeitorio', b: 'cozinha', x: -12, z: -12, l: 1.0 },
    ],
    disjuntor: { sala: 'lavanderia', lado: 'x1', t: 0.5 },
  },
  {
    id: 'mansao', nome: 'Mansão Blackwood', sub: 'Grande · 12 cômodos', cor: '#f43f5e', tam: 'grande', pe: 3.6,
    estilo: 'mansao', origem: { x: -11400, y: 900, z: 9000 },
    desc: 'A família Blackwood fazia sessões espíritas na capela. Numa delas, alguma coisa respondeu.',
    comodos: [
      { id: 'estar', nome: 'Sala de estar', tipo: 'sala', x0: -22, z0: 6, x1: -5, z1: 16 },
      { id: 'foyer', nome: 'Saguão', tipo: 'hall', x0: -5, z0: 6, x1: 5, z1: 16 },
      { id: 'biblioteca', nome: 'Biblioteca', tipo: 'biblioteca', x0: 5, z0: 6, x1: 22, z1: 16 },
      { id: 'galeria', nome: 'Galeria dos retratos', tipo: 'corredor', x0: -22, z0: 2, x1: 22, z1: 6 },
      { id: 'jantar', nome: 'Sala de jantar', tipo: 'jantar', x0: -22, z0: -6, x1: -8, z1: 2 },
      { id: 'musica', nome: 'Salão de música', tipo: 'musica', x0: -8, z0: -6, x1: 8, z1: 2 },
      { id: 'quarto', nome: 'Quarto principal', tipo: 'quarto', x0: 8, z0: -6, x1: 22, z1: 2 },
      { id: 'cozinha', nome: 'Cozinha', tipo: 'cozinha', x0: -22, z0: -16, x1: -8, z1: -6 },
      { id: 'capela', nome: 'Capela', tipo: 'capela', x0: -8, z0: -16, x1: 8, z1: -6 },
      { id: 'banheiro', nome: 'Banheiro', tipo: 'banheiro', x0: 8, z0: -16, x1: 14, z1: -6 },
      { id: 'hospedes', nome: 'Quarto de hóspedes', tipo: 'quarto', x0: 14, z0: -16, x1: 22, z1: -6 },
    ],
    portas: [
      { a: 'foyer', b: null, x: 0, z: 16, l: 1.8 },
      { a: 'foyer', b: 'estar', x: -5, z: 11, l: 1.6, aberta: true },
      { a: 'foyer', b: 'biblioteca', x: 5, z: 11, l: 1.6, aberta: true },
      { a: 'foyer', b: 'galeria', x: 0, z: 6, l: 2.2, aberta: true, semPorta: true },
      { a: 'estar', b: 'galeria', x: -14, z: 6, l: 1.2 },
      { a: 'biblioteca', b: 'galeria', x: 14, z: 6, l: 1.2 },
      { a: 'jantar', b: 'galeria', x: -15, z: 2, l: 1.2 },
      { a: 'musica', b: 'galeria', x: 0, z: 2, l: 1.6, aberta: true },
      { a: 'quarto', b: 'galeria', x: 15, z: 2, l: 1.1 },
      { a: 'jantar', b: 'cozinha', x: -15, z: -6, l: 1.1 },
      { a: 'musica', b: 'capela', x: 0, z: -6, l: 1.6 },
      { a: 'quarto', b: 'banheiro', x: 11, z: -6, l: 0.9 },
      { a: 'quarto', b: 'hospedes', x: 18, z: -6, l: 1.0 },
      { a: 'jantar', b: 'musica', x: -8, z: -2, l: 1.2 },
    ],
    disjuntor: { sala: 'cozinha', lado: 'x0', t: 0.5 },
  },
];

// ------------------------------------------------------------------ sorteio com semente
export function semente(n) {
  let s = n >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (txt) => {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ------------------------------------------------------------------ geometria das casas
export const PAREDE = 0.09; // meia parede: cada cômodo põe a sua do lado de dentro do limite
const LADOS = ['x0', 'x1', 'z0', 'z1'];

// em que lado do cômodo c fica a porta p ('x0', 'x1', 'z0' ou 'z1'), ou null
export function ladoDaPorta(c, p) {
  const e = 1e-6;
  if (Math.abs(p.x - c.x0) < e && p.z > c.z0 && p.z < c.z1) return 'x0';
  if (Math.abs(p.x - c.x1) < e && p.z > c.z0 && p.z < c.z1) return 'x1';
  if (Math.abs(p.z - c.z0) < e && p.x > c.x0 && p.x < c.x1) return 'z0';
  if (Math.abs(p.z - c.z1) < e && p.x > c.x0 && p.x < c.x1) return 'z1';
  return null;
}

// a parede de um lado do cômodo: a reta (fixo), o começo e o fim, e para onde ela olha (o dentro)
export function linhaDoLado(c, lado) {
  if (lado === 'x0') return { eixo: 'z', fixo: c.x0, a: c.z0, b: c.z1, nx: 1, nz: 0 };
  if (lado === 'x1') return { eixo: 'z', fixo: c.x1, a: c.z0, b: c.z1, nx: -1, nz: 0 };
  if (lado === 'z0') return { eixo: 'x', fixo: c.z0, a: c.x0, b: c.x1, nx: 0, nz: 1 };
  return { eixo: 'x', fixo: c.z1, a: c.x0, b: c.x1, nx: 0, nz: -1 };
}

// ponto da parede: s ao longo dela, recuado d para dentro do cômodo
export function pontoNaParede(L, s, d) {
  return L.eixo === 'x' ? { x: s, z: L.fixo + L.nz * d } : { x: L.fixo + L.nx * d, z: s };
}

// as janelas: nos lados que dão para fora, uma a cada ~4 m (não em corredor nem banheiro pequeno)
function janelasDe(casa, c, lado) {
  const L = linhaDoLado(c, lado);
  const ext = lado === 'x0' ? casa.limites.x0 : lado === 'x1' ? casa.limites.x1 : lado === 'z0' ? casa.limites.z0 : casa.limites.z1;
  if (Math.abs(L.fixo - ext) > 1e-6) return [];
  if (c.tipo === 'cela' || c.tipo === 'necroterio') return [];
  const comp = L.b - L.a;
  const n = Math.max(0, Math.floor(comp / 4.2));
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = L.a + (comp * (i + 0.5)) / n;
    out.push({ s, l: c.tipo === 'banheiro' ? 0.7 : 1.3 });
  }
  return out;
}

// ------------------------------------------------------------------ montar uma casa (os dados)
const cache = new Map();
export const CASA_IDS = CASAS.map((c) => c.id);
export const CASAS_RESUMO = CASAS.map(({ id, nome, sub, cor, desc, tam }) => ({ id, nome, sub, cor, desc, tam }));

export function casa(id) {
  if (cache.has(id)) return cache.get(id);
  const base = CASAS.find((c) => c.id === id);
  if (!base) return null;
  const C = { ...base };
  const sala = Object.fromEntries(C.comodos.map((c) => [c.id, c]));
  C.sala = sala;
  C.limites = {
    x0: Math.min(...C.comodos.map((c) => c.x0)), x1: Math.max(...C.comodos.map((c) => c.x1)),
    z0: Math.min(...C.comodos.map((c) => c.z0)), z1: Math.max(...C.comodos.map((c) => c.z1)),
  };
  // portas com o lado em cada cômodo e o eixo do vão
  C.portas = C.portas.map((p, i) => {
    const ca = sala[p.a];
    const ladoA = ladoDaPorta(ca, p);
    const ladoB = p.b ? ladoDaPorta(sala[p.b], p) : null;
    const eixo = ladoA === 'x0' || ladoA === 'x1' ? 'z' : 'x'; // o vão corre ao longo de...
    return { ...p, i, ladoA, ladoB, eixo, rua: !p.b, h: Math.min(2.2, C.pe - 0.3) };
  });
  C.entrada = C.portas.find((p) => p.rua);
  // vizinhos de cada cômodo (pelas portas)
  C.vizinhos = Object.fromEntries(C.comodos.map((c) => [c.id, []]));
  for (const p of C.portas) {
    if (!p.b) continue;
    C.vizinhos[p.a].push({ sala: p.b, porta: p.i });
    C.vizinhos[p.b].push({ sala: p.a, porta: p.i });
  }
  // aberturas em cada lado de cada cômodo (portas e janelas)
  for (const c of C.comodos) {
    c.aberturas = { x0: [], x1: [], z0: [], z1: [] };
    for (const p of C.portas) {
      if (p.a === c.id) c.aberturas[p.ladoA].push({ s: p.eixo === 'x' ? p.x : p.z, l: p.l, porta: p.i });
      if (p.b === c.id) c.aberturas[p.ladoB].push({ s: p.eixo === 'x' ? p.x : p.z, l: p.l, porta: p.i });
    }
    c.janelas = {};
    for (const lado of LADOS) {
      c.janelas[lado] = janelasDe(C, c, lado).filter((j) => !c.aberturas[lado].some((a) => Math.abs(a.s - j.s) < (a.l + j.l) / 2 + 0.6));
    }
    c.area = (c.x1 - c.x0) * (c.z1 - c.z0);
  }
  mobiliar(C);
  // a van, na rua em frente à porta
  const e = C.entrada;
  C.van = { x: e.x + 6.5, z: C.limites.z1 + 12 };
  C.chegada = { x: e.x + 2, z: C.limites.z1 + 9, yaw: 0 };
  C.terreno = { x0: C.limites.x0 - 14, x1: C.limites.x1 + 14, z0: C.limites.z0 - 12, z1: C.limites.z1 + 24 };
  cache.set(id, C);
  return C;
}

// ------------------------------------------------------------------ os móveis
// Cada móvel: { t, x, z, r (giro em quartos de volta: 0 olha para +z), w, d, h, sala, esconde? }.
// O desenho de cada tipo é do fantasmas-3d.js; aqui só a caixa (que também é o colisor).
const MOVEIS = {
  cama: { w: 1.6, d: 2.1, h: 0.6 },
  camaSolteiro: { w: 1.0, d: 2.0, h: 0.55 },
  berco: { w: 0.8, d: 1.3, h: 1.0 },
  guardaRoupa: { w: 1.6, d: 0.65, h: 2.15, esconde: true },
  armario: { w: 0.9, d: 0.55, h: 2.0, esconde: true },
  comoda: { w: 1.2, d: 0.5, h: 0.9, sup: true },
  criado: { w: 0.5, d: 0.45, h: 0.6, sup: true },
  sofa: { w: 2.2, d: 0.95, h: 0.85 },
  poltrona: { w: 0.95, d: 0.9, h: 0.95 },
  mesaCentro: { w: 1.2, d: 0.6, h: 0.45, sup: true, livre: true },
  estante: { w: 1.6, d: 0.4, h: 2.1, sup: true },
  tv: { w: 1.6, d: 0.45, h: 1.3 },
  mesa: { w: 1.8, d: 1.0, h: 0.76, sup: true, livre: true },
  mesaLonga: { w: 3.2, d: 1.1, h: 0.76, sup: true, livre: true },
  balcao: { w: 2.4, d: 0.65, h: 0.92, sup: true },
  geladeira: { w: 0.8, d: 0.75, h: 1.85 },
  fogao: { w: 0.8, d: 0.65, h: 0.92 },
  pia: { w: 0.6, d: 0.45, h: 0.85 },
  vaso: { w: 0.45, d: 0.7, h: 0.8 },
  banheira: { w: 0.8, d: 1.7, h: 0.6 },
  chuveiro: { w: 1.0, d: 1.0, h: 2.2 },
  maquina: { w: 0.65, d: 0.65, h: 0.9 },
  prateleira: { w: 1.4, d: 0.45, h: 1.9, sup: true },
  caixas: { w: 1.0, d: 0.8, h: 0.8 },
  escrivaninha: { w: 1.4, d: 0.7, h: 0.76, sup: true },
  carteira: { w: 0.7, d: 0.55, h: 0.75, livre: true },
  lousa: { w: 3.0, d: 0.1, h: 1.4, parede: 1.0 },
  maca: { w: 0.9, d: 2.0, h: 0.75 },
  macaNecro: { w: 0.8, d: 2.0, h: 0.9 },
  gavetaNecro: { w: 2.4, d: 0.8, h: 2.0 },
  cadeiraRodas: { w: 0.7, d: 0.8, h: 0.9, livre: true },
  piano: { w: 1.6, d: 1.5, h: 1.0, livre: true },
  banco: { w: 2.4, d: 0.6, h: 0.9, livre: true },
  altar: { w: 2.0, d: 0.9, h: 1.0, sup: true },
  relogio: { w: 0.6, d: 0.4, h: 2.1 },
  quadro: { w: 0.9, d: 0.06, h: 1.1, parede: 1.4, semColisao: true },
  espelho: { w: 0.7, d: 0.05, h: 1.0, parede: 1.2, semColisao: true },
  tapete: { w: 2.4, d: 1.6, h: 0.01, livre: true, semColisao: true },
  cama_cela: { w: 0.9, d: 2.0, h: 0.5 },
  balcaoRecepcao: { w: 3.0, d: 0.8, h: 1.1, sup: true, livre: true },
  lareira: { w: 1.8, d: 0.6, h: 1.4 },
  boneca: { w: 0.3, d: 0.3, h: 0.45, semColisao: true, livre: true },
};
export const TIPOS_MOVEIS = MOVEIS;

// o que vai em cada tipo de cômodo: [móvel, junto à parede?, quantos]
const RECEITAS = {
  sala: [['sofa', 1], ['poltrona', 1], ['tv', 1], ['estante', 1], ['tapete', 0], ['mesaCentro', 0], ['quadro', 1], ['quadro', 1], ['relogio', 1]],
  hall: [['comoda', 1], ['quadro', 1], ['espelho', 1], ['tapete', 0]],
  cozinha: [['balcao', 1], ['balcao', 1], ['geladeira', 1], ['fogao', 1], ['pia', 1], ['mesa', 0], ['prateleira', 1]],
  corredor: [['quadro', 1], ['quadro', 1], ['quadro', 1], ['comoda', 1]],
  quarto: [['cama', 1], ['guardaRoupa', 1], ['criado', 1], ['comoda', 1], ['quadro', 1], ['tapete', 0], ['espelho', 1]],
  bebe: [['berco', 1], ['guardaRoupa', 1], ['comoda', 1], ['boneca', 0], ['tapete', 0], ['quadro', 1]],
  banheiro: [['vaso', 1], ['pia', 1], ['banheira', 1], ['espelho', 1], ['armario', 1]],
  jantar: [['mesaLonga', 0], ['estante', 1], ['comoda', 1], ['quadro', 1], ['quadro', 1], ['relogio', 1]],
  deposito: [['prateleira', 1], ['prateleira', 1], ['caixas', 1], ['caixas', 1], ['armario', 1]],
  lavanderia: [['maquina', 1], ['maquina', 1], ['pia', 1], ['prateleira', 1], ['armario', 1]],
  escritorio: [['escrivaninha', 1], ['estante', 1], ['estante', 1], ['armario', 1], ['poltrona', 1], ['quadro', 1]],
  aula: [['lousa', 1], ['escrivaninha', 1], ['armario', 1], ['estante', 1], ['carteiras', 0]],
  biblioteca: [['estante', 1], ['estante', 1], ['estante', 1], ['estante', 1], ['estante', 1], ['estante', 1], ['mesaLonga', 0], ['poltrona', 1], ['armario', 1]],
  refeitorio: [['mesaLonga', 0], ['mesaLonga', 0], ['mesaLonga', 0], ['balcao', 1], ['prateleira', 1], ['armario', 1]],
  recepcao: [['balcaoRecepcao', 0], ['sofa', 1], ['poltrona', 1], ['quadro', 1], ['armario', 1], ['cadeiraRodas', 0]],
  enfermaria: [['maca', 1], ['maca', 1], ['maca', 1], ['maca', 1], ['maca', 1], ['armario', 1], ['armario', 1], ['prateleira', 1], ['cadeiraRodas', 0]],
  cela: [['cama_cela', 1], ['vaso', 1], ['armario', 1]],
  terapia: [['maca', 1], ['escrivaninha', 1], ['poltrona', 1], ['armario', 1], ['prateleira', 1], ['cadeiraRodas', 0]],
  necroterio: [['gavetaNecro', 1], ['gavetaNecro', 1], ['macaNecro', 0], ['macaNecro', 0], ['armario', 1], ['prateleira', 1]],
  musica: [['piano', 0], ['poltrona', 1], ['poltrona', 1], ['estante', 1], ['quadro', 1], ['quadro', 1], ['tapete', 0], ['relogio', 1]],
  capela: [['altar', 1], ['banco', 0], ['banco', 0], ['banco', 0], ['banco', 0], ['quadro', 1], ['armario', 1]],
};

const PEQUENOS = ['livro', 'copo', 'garrafa', 'prato', 'caixinha', 'vela', 'xicara', 'lata'];

function mobiliar(C) {
  const rnd = semente(hash(C.id));
  C.moveis = [];
  C.objetos = [];
  C.interruptores = [];
  C.esconderijos = [];
  const ocupadoPor = (c, caixa) => C.moveis.some((m) => m.sala === c.id && !m.semColisao && sobrepoe(caixaDe(m), caixa, 0.15));
  for (const c of C.comodos) {
    // interruptor: na parede da primeira porta, ao lado do vão (do lado de dentro)
    const pr = c.aberturas.x0.concat(c.aberturas.x1, c.aberturas.z0, c.aberturas.z1).find((a) => C.portas[a.porta]);
    if (pr) {
      const p = C.portas[pr.porta];
      const lado = p.a === c.id ? p.ladoA : p.ladoB;
      const L = linhaDoLado(c, lado);
      let s = pr.s + pr.l / 2 + 0.35;
      if (s > L.b - 0.3) s = pr.s - pr.l / 2 - 0.35;
      const q = pontoNaParede(L, s, PAREDE + 0.02);
      C.interruptores.push({ i: C.interruptores.length, sala: c.id, x: q.x, z: q.z, y: 1.3, nx: L.nx, nz: L.nz });
    }
    const receita = c.tipo === 'aula' ? RECEITAS.aula : RECEITAS[c.tipo] || [];
    for (const [t, naParede] of receita) {
      if (t === 'carteiras') {
        carteiras(C, c, rnd);
        continue;
      }
      const def = MOVEIS[t];
      for (let tent = 0; tent < 24; tent++) {
        const m = naParede ? junto(C, c, t, def, rnd) : noMeio(C, c, t, def, rnd);
        if (!m) continue;
        if (!def.semColisao && ocupadoPor(c, caixaDe(m))) continue;
        if (!def.semColisao && bloqueiaPorta(C, c, m)) continue;
        if (def.parede && C.moveis.some((o) => o.sala === c.id && MOVEIS[o.t].parede && Math.hypot(o.x - m.x, o.z - m.z) < 1.4)) continue;
        if (t === 'tapete' && C.moveis.some((o) => o.sala === c.id && o.t === 'tapete')) break;
        m.i = C.moveis.length;
        C.moveis.push(m);
        if (def.esconde) C.esconderijos.push({ i: C.esconderijos.length, movel: m.i, sala: c.id, x: m.x, z: m.z, r: m.r });
        break;
      }
    }
  }
  // objetos soltos em cima do que é superfície (e alguns no chão)
  for (const m of C.moveis) {
    const def = MOVEIS[m.t];
    if (!def.sup) continue;
    const n = m.t === 'estante' || m.t === 'prateleira' ? 3 : m.t === 'mesaLonga' ? 3 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const t = PEQUENOS[Math.floor(rnd() * PEQUENOS.length)];
      const giro = (m.r * Math.PI) / 2;
      const u = (rnd() - 0.5) * (m.w - 0.3);
      const v = (rnd() - 0.5) * (m.d - 0.2);
      const y = m.t === 'estante' || m.t === 'prateleira' ? [0.42, 0.95, 1.45][k % 3] : def.h;
      C.objetos.push({
        i: C.objetos.length, t, sala: m.sala,
        x: m.x + u * Math.cos(giro) + v * Math.sin(giro), y: y + 0.01, z: m.z - u * Math.sin(giro) + v * Math.cos(giro), giro: rnd() * 6.28,
      });
    }
  }
}

const caixaDe = (m) => {
  const vira = m.r % 2 === 1;
  const w = vira ? m.d : m.w;
  const d = vira ? m.w : m.d;
  return { x0: m.x - w / 2, x1: m.x + w / 2, z0: m.z - d / 2, z1: m.z + d / 2 };
};
export const caixaDoMovel = caixaDe;
const sobrepoe = (a, b, f = 0) => a.x0 < b.x1 + f && a.x1 > b.x0 - f && a.z0 < b.z1 + f && a.z1 > b.z0 - f;

// a frente de cada porta (1,1 m para os dois lados) fica livre
function bloqueiaPorta(C, c, m) {
  const b = caixaDe(m);
  for (const p of C.portas) {
    if (p.a !== c.id && p.b !== c.id) continue;
    const meia = p.l / 2 + 0.45;
    const zona = p.eixo === 'x'
      ? { x0: p.x - meia, x1: p.x + meia, z0: p.z - 1.3, z1: p.z + 1.3 }
      : { x0: p.x - 1.3, x1: p.x + 1.3, z0: p.z - meia, z1: p.z + meia };
    if (sobrepoe(b, zona)) return true;
  }
  // nem o interruptor
  for (const s of C.interruptores) if (s.sala === c.id && sobrepoe(b, { x0: s.x - 0.4, x1: s.x + 0.4, z0: s.z - 0.4, z1: s.z + 0.4 })) return true;
  return false;
}

// encostado numa parede sorteada, de costas para ela
function junto(C, c, t, def, rnd) {
  const lados = LADOS.filter((l) => {
    const L = linhaDoLado(c, l);
    return L.b - L.a > def.w + 0.4;
  });
  if (!lados.length) return null;
  const lado = lados[Math.floor(rnd() * lados.length)];
  const L = linhaDoLado(c, lado);
  // nada de móvel alto na frente da janela
  const s = L.a + def.w / 2 + 0.15 + rnd() * (L.b - L.a - def.w - 0.3);
  if (!def.parede && def.h > 1 && c.janelas[lado].some((j) => Math.abs(j.s - s) < (j.l + def.w) / 2)) return null;
  if (def.parede && c.janelas[lado].some((j) => Math.abs(j.s - s) < (j.l + def.w) / 2 + 0.1)) return null;
  if (def.parede && c.aberturas[lado].some((a) => Math.abs(a.s - s) < (a.l + def.w) / 2 + 0.3)) return null;
  const q = pontoNaParede(L, s, PAREDE + def.d / 2 + 0.01);
  // r: o móvel olha para +z quando r = 0 (as costas em -z)
  const r = L.nz === 1 ? 0 : L.nz === -1 ? 2 : L.nx === 1 ? 1 : 3;
  return { t, x: q.x, z: q.z, r, w: def.w, d: def.d, h: def.h, sala: c.id, y: def.parede || 0, semColisao: !!def.semColisao };
}

// solto no meio do cômodo (mesas, tapetes, bancos), longe das paredes
function noMeio(C, c, t, def, rnd) {
  const folga = 1.2;
  const r = rnd() < 0.5 ? 0 : 1;
  const w = r ? def.d : def.w;
  const d = r ? def.w : def.d;
  if (c.x1 - c.x0 < w + 2 * folga || c.z1 - c.z0 < d + 2 * folga) {
    if (t !== 'tapete' && t !== 'boneca') return null;
  }
  let x;
  let z;
  if (t === 'banco') {
    // bancos da capela: fileiras viradas para o altar
    const n = C.moveis.filter((m) => m.sala === c.id && m.t === 'banco').length;
    x = (c.x0 + c.x1) / 2 + (n % 2 ? 1.8 : -1.8);
    z = c.z1 - 2.6 - Math.floor(n / 2) * 1.6;
    return { t, x, z, r: 2, w: def.w, d: def.d, h: def.h, sala: c.id, y: 0, semColisao: false };
  }
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  const ax = Math.max(0, (c.x1 - c.x0) / 2 - w / 2 - folga);
  const az = Math.max(0, (c.z1 - c.z0) / 2 - d / 2 - folga);
  x = cx + (rnd() - 0.5) * 2 * ax * (t === 'tapete' ? 0.2 : 0.8);
  z = cz + (rnd() - 0.5) * 2 * az * (t === 'tapete' ? 0.2 : 0.8);
  return { t, x, z, r, w: def.w, d: def.d, h: def.h, sala: c.id, y: 0, semColisao: !!def.semColisao };
}

// carteiras em fileiras, viradas para a lousa
function carteiras(C, c, rnd) {
  const lousa = C.moveis.find((m) => m.sala === c.id && m.t === 'lousa');
  const def = MOVEIS.carteira;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  const r = lousa ? (lousa.r + 2) % 4 : 0; // de frente para a lousa
  const porX = r % 2 === 0;
  const comp = porX ? c.x1 - c.x0 : c.z1 - c.z0;
  const larg = porX ? c.z1 - c.z0 : c.x1 - c.x0;
  const cols = Math.max(1, Math.floor((comp - 2.5) / 1.4));
  const fils = Math.max(1, Math.floor((larg - 4) / 1.5));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < fils; j++) {
      if (rnd() < 0.12) continue; // umas faltando
      const u = (i - (cols - 1) / 2) * 1.4;
      const v = (j - (fils - 1) / 2) * 1.5 + (lousa ? (r === 0 || r === 1 ? 0.6 : -0.6) : 0);
      const m = { t: 'carteira', x: porX ? cx + u : cx + v, z: porX ? cz + v : cz + u, r, w: def.w, d: def.d, h: def.h, sala: c.id, y: 0, semColisao: false };
      if (bloqueiaPorta(C, c, m)) continue;
      m.i = C.moveis.length;
      C.moveis.push(m);
    }
  }
}

// ------------------------------------------------------------------ onde fica cada coisa
// o cômodo do ponto (coordenadas da casa) ou null (fora)
export function salaEm(C, x, z) {
  for (const c of C.comodos) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return c;
  return null;
}
export const dentroDaCasa = (C, x, z) => x > C.limites.x0 && x < C.limites.x1 && z > C.limites.z0 && z < C.limites.z1;

// o caminho de a até b (pontos {x, z} na casa) passando pelas portas: a lista de pontos depois de a
export function caminho(C, a, b) {
  const sa = salaEm(C, a.x, a.z);
  const sb = salaEm(C, b.x, b.z);
  if (!sa || !sb) return [b];
  if (sa === sb) return [b];
  // BFS pelos cômodos
  const antes = new Map([[sa.id, null]]);
  const fila = [sa.id];
  while (fila.length) {
    const s = fila.shift();
    if (s === sb.id) break;
    for (const v of C.vizinhos[s]) {
      if (antes.has(v.sala)) continue;
      antes.set(v.sala, { de: s, porta: v.porta });
      fila.push(v.sala);
    }
  }
  if (!antes.has(sb.id)) return [b];
  const portas = [];
  for (let s = sb.id; antes.get(s); s = antes.get(s).de) portas.unshift(antes.get(s).porta);
  const pts = [];
  for (const i of portas) {
    const p = C.portas[i];
    pts.push({ x: p.x, z: p.z, porta: i });
  }
  pts.push(b);
  return pts;
}

// um ponto livre sorteado num cômodo (longe das paredes)
export function pontoNaSala(c, rnd = Math.random, folga = 0.8) {
  return {
    x: c.x0 + folga + rnd() * Math.max(0.01, c.x1 - c.x0 - 2 * folga),
    z: c.z0 + folga + rnd() * Math.max(0.01, c.z1 - c.z0 - 2 * folga),
  };
}

// O fantasma em g vê o ponto p? No mesmo cômodo, sim; no vizinho, se a reta passa pelo vão de uma
// porta aberta (ou sem porta) entre os dois.
export function enxerga(C, g, p, portasAbertas) {
  const sg = salaEm(C, g.x, g.z);
  const sp = salaEm(C, p.x, p.z);
  if (!sg || !sp) return false;
  if (sg === sp) return true;
  for (const v of C.vizinhos[sg.id]) {
    if (v.sala !== sp.id) continue;
    const d = C.portas[v.porta];
    if (!d.semPorta && !portasAbertas[v.porta]) continue;
    // cruza a reta da parede dentro do vão?
    if (d.eixo === 'x') {
      const t = (d.z - g.z) / (p.z - g.z || 1e-6);
      const x = g.x + (p.x - g.x) * t;
      if (t >= 0 && t <= 1 && Math.abs(x - d.x) < d.l / 2) return true;
    } else {
      const t = (d.x - g.x) / (p.x - g.x || 1e-6);
      const z = g.z + (p.z - g.z) * t;
      if (t >= 0 && t <= 1 && Math.abs(z - d.z) < d.l / 2) return true;
    }
  }
  return false;
}

// coordenadas: mundo <-> casa
export const paraCasa = (C, x, y, z) => ({ x: x - C.origem.x, y: y - C.origem.y, z: z - C.origem.z });
export const paraMundo = (C, x, y, z) => [x + C.origem.x, y + C.origem.y, z + C.origem.z];
// alguém (posição do mundo) está no terreno de alguma casa? devolve a casa
export function casaDoPonto(x, y, z) {
  for (const id of CASA_IDS) {
    const C = casa(id);
    const p = paraCasa(C, x, y, z);
    if (p.y > -5 && p.y < 20 && p.x > C.terreno.x0 - 5 && p.x < C.terreno.x1 + 5 && p.z > C.terreno.z0 - 5 && p.z < C.terreno.z1 + 5) return C;
  }
  return null;
}

// os monstros que ainda servem com as provas marcadas (sim: tem; nao: descartada)
export function possiveis(sim = [], nao = []) {
  return MONSTROS.filter((m) => sim.every((p) => m.provas.includes(p)) && nao.every((p) => !m.provas.includes(p)));
}
