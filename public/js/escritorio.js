// Escritório modular: a empresa marca os departamentos que tem e as salas se encaixam dos dois
// lados de um corredor, com a recepção na entrada. Cada sala tem a cara do departamento e as
// próprias telas. Este arquivo é só a planta (nada de 3D): o servidor usa também, para saber
// quantas telas cada sala tem e em qual sala cai cada compartilhamento.
//
// O prédio fica onde no modo Lazer está o cinema, com a porta para o mesmo lado (leste), então
// lá fora continuam o parque, a pista e as mesas de jogos.
//
// Com mais de 6 departamentos entra uma terceira fileira (fundos), com o seu próprio corredor:
//
//   z=-30 ┌─────────┬─────────┬─────────┬──────────┐
//         │ 9ª sala │ 8ª sala │ 7ª sala │          │
//   z=-6  ├──  ─────┴──  ─────┴──  ─────┤          │
//         │        corredor dos fundos         │          │
//   z=2   ├─────────┬─────────┬─────────┤          │
//         │ 5ª sala │ 3ª sala │ 1ª sala │          │
//   z=26  ├──  ─────┴──  ─────┴──  ─────┤ recepção │
//         │        corredor                    porta  → lá fora (x=60)
//   z=34  ├──  ─────┬──  ─────┬──  ─────┤          │
//         │ 6ª sala │ 4ª sala │ 2ª sala │          │
//   z=58  └─────────┴─────────┴─────────┴──────────┘
//        x=-44     -16        12        40         60

// telas: as da parede (de todo mundo). postos: mesas individuais com 3 monitores cada — quem
// senta fica com o posto, e o que compartilha aparece nos monitores dele.
// painel: a sala tem um painel (placar, status, mural...) que conta como a ÚLTIMA tela dela. Livre,
// mostra o conteúdo dele; com alguém compartilhando ali (ex.: a aba do ranking), mostra a aba.
export const DEPARTAMENTOS = {
  ti: { nome: 'TI', telas: 9, painel: 'Status', postos: 12, cor: '#38bdf8', descricao: 'Parede de monitoramento e 12 postos com 3 monitores e cadeira gamer' },
  comercial: { nome: 'Comercial', telas: 5, painel: 'Placar', postos: 8, cor: '#fbbf24', descricao: 'Placar de metas, 8 postos com 3 monitores e sino' },
  telemarketing: { nome: 'Telemarketing', telas: 5, painel: 'Central', postos: 8, cor: '#f472b6', descricao: '8 baias com 3 monitores, headset e painel da central' },
  reuniao: { nome: 'Reunião', telas: 2, postos: 0, cor: '#a78bfa', descricao: 'Mesa para 10, telão e duas telas' },
  financeiro: { nome: 'Financeiro', telas: 3, painel: 'Indicadores', postos: 8, cor: '#34d399', descricao: '8 postos com 3 monitores, painel de indicadores e cofre' },
  rh: { nome: 'RH', telas: 3, painel: 'Mural', postos: 6, cor: '#fb923c', descricao: '6 postos, cantinho de conversa e mural da equipe' },
  marketing: { nome: 'Marketing', telas: 5, painel: 'Ideias', postos: 8, cor: '#e879f9', descricao: '8 postos em ilhas, parede criativa e quadro de ideias' },
  gestao: { nome: 'Gestão', telas: 3, painel: 'Equipe', postos: 4, cor: '#f87171', descricao: 'Sala dos gestores: painel da equipe ao vivo (quem está trabalhando, em pausa ou inativo) e 4 postos' },
  descanso: { nome: 'Descanso', telas: 1, postos: 0, cor: '#a3e635', descricao: 'Copa com sofás e TV — quem entra fica “Em pausa” e os gestores são avisados' },
};
export const MONITORES_POR_POSTO = 3;
export const TELAS_RECEPCAO = 2; // na parede da recepção, uma de cada lado do corredor principal
export const IDS_DEPARTAMENTOS = Object.keys(DEPARTAMENTOS);
export const MAX_SALAS = 9;

export const PREDIO = {
  maxX: 60,
  z0: 2,
  z1: 58,
  altura: 6.5,
  corredor: [26, 34], // z do corredor; a porta de fora fica no mesmo trecho, em x = 60
  corredorFundos: [-6, 2], // z do corredor da fileira dos fundos (só com mais de 6 salas)
  z0Fundos: -30, // onde o prédio começa quando tem a fileira dos fundos
  recepcao: 40, // de x = 40 até a porta é recepção
  largura: 28, // largura (x) de cada sala
};

// vagas na ordem em que as salas entram: a mais perto da recepção primeiro, norte e depois sul;
// da 7ª em diante, a fileira dos fundos
const VAGAS = [
  ...[12, 12, -16, -16, -44, -44].map((x0, i) => ({ x0, lado: i % 2 ? 'sul' : 'norte' })),
  ...[12, -16, -44].map((x0) => ({ x0, lado: 'fundos' })),
];

const faixaZ = (lado) => ({
  norte: [PREDIO.z0, PREDIO.corredor[0]],
  sul: [PREDIO.corredor[1], PREDIO.z1],
  fundos: [PREDIO.z0Fundos, PREDIO.corredorFundos[0]],
}[lado]);
// z da parede da sala que dá para o corredor (onde fica a porta). Norte e fundos olham para +z.
export const zDaPorta = (lado) => ({ norte: PREDIO.corredor[0], sul: PREDIO.corredor[1], fundos: PREDIO.corredorFundos[0] }[lado]);

// departamentos válidos, sem repetir, na ordem escolhida
export function limparDepartamentos(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).filter((d) => DEPARTAMENTOS[d] && !vistos.has(d) && vistos.add(d)).slice(0, MAX_SALAS);
}

// A planta de uma lista de departamentos: onde fica cada sala, quais telas são dela, que vagas
// sobram (viram lounge) e até onde o prédio vai para oeste.
export function planta(deptos) {
  const lista = limparDepartamentos(deptos);
  let tela = 0;
  const salas = lista.map((id, i) => {
    const { x0, lado } = VAGAS[i];
    const [z0, z1] = faixaZ(lado);
    const d = DEPARTAMENTOS[id];
    const sala = { id, nome: d.nome, cor: d.cor, lado, x0, x1: x0 + PREDIO.largura, z0, z1, primeiraTela: tela, telas: d.telas };
    tela += d.telas;
    return sala;
  });
  // a recepção também tem telas de parede (depois das salas)
  const recepcao = { id: 'recepcao', nome: 'Recepção', primeiraTela: tela, telas: TELAS_RECEPCAO };
  tela += TELAS_RECEPCAO;
  // monitores dos postos: depois de todas as telas de parede, 3 por posto, na ordem das salas
  const telasParede = tela;
  const postos = [];
  for (const s of salas) {
    for (let i = 0; i < DEPARTAMENTOS[s.id].postos; i++) {
      postos.push({ id: `${s.id}-${i}`, sala: s.id, n: i, primeiraTela: tela });
      tela += MONITORES_POR_POSTO;
    }
  }
  const fundos = lista.length > 6;
  const colunas = fundos ? 3 : Math.max(1, Math.ceil(lista.length / 2));
  const lounges = VAGAS.slice(lista.length, fundos ? VAGAS.length : colunas * 2).map(({ x0, lado }) => {
    const [z0, z1] = faixaZ(lado);
    return { id: 'lounge', nome: 'Lounge', lado, x0, x1: x0 + PREDIO.largura, z0, z1 };
  });
  return { salas, recepcao, lounges, postos, minX: VAGAS[(colunas - 1) * 2].x0, z0: fundos ? PREDIO.z0Fundos : PREDIO.z0, fundos, telasParede, totalTelas: tela };
}

// em que sala está o ponto (id do departamento, 'lounge', 'corredor', 'recepcao' ou null = fora)
export function salaEm(p, x, z) {
  if (x < p.minX || x > PREDIO.maxX || z < p.z0 || z > PREDIO.z1) return null;
  if (x >= PREDIO.recepcao) return 'recepcao';
  for (const s of [...p.salas, ...p.lounges]) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.id;
  return 'corredor';
}

// onde parar para entrar numa sala (logo depois da porta, olhando para dentro); 'recepcao' = balcão
export function portaDa(p, id) {
  if (id === 'recepcao') return { pos: [52, 0, (PREDIO.corredor[0] + PREDIO.corredor[1]) / 2], yaw: Math.PI / 2 };
  const s = p.salas.find((x) => x.id === id);
  if (!s) return null;
  const x = (s.x0 + s.x1) / 2;
  return s.lado === 'sul' ? { pos: [x, 0, zDaPorta(s.lado) + 2.5], yaw: Math.PI } : { pos: [x, 0, zDaPorta(s.lado) - 2.5], yaw: 0 };
}

// salas e recepção: tudo o que tem telas de parede
export const comTelas = (p) => [...p.salas, p.recepcao];

// as telas de parede de uma sala: [primeira, última + 1). Fora de sala: todas as de parede.
export function faixaDeTelas(p, id) {
  const s = comTelas(p).find((x) => x.id === id);
  return s ? [s.primeiraTela, s.primeiraTela + s.telas] : [0, p.telasParede];
}

// os 3 monitores de um posto ("ti-0"): [primeiro, último + 1), ou null se o posto não existe
export function faixaDoPosto(p, id) {
  const po = p.postos.find((x) => x.id === id);
  return po ? [po.primeiraTela, po.primeiraTela + MONITORES_POR_POSTO] : null;
}

// o posto de que um monitor faz parte (ou null, se é tela de parede)
export function postoDaTela(p, i) {
  if (i < p.telasParede) return null;
  return p.postos[Math.floor((i - p.telasParede) / MONITORES_POR_POSTO)] ?? null;
}

// "TI · Posto 3"
export function rotuloDoPosto(id) {
  const [depto, n] = String(id).split('-');
  return `${DEPARTAMENTOS[depto]?.nome ?? depto} · Posto ${Number(n) + 1}`;
}

// Chave de uma tela que não muda quando o dono troca os departamentos (o número da tela muda):
// "ti:4" é a 4ª tela de parede do TI; no Lazer (p = null), "cinema:2"; "ti-0.2" é o monitor 2
// do posto 1 do TI. É por ela que ficam guardados a página fixa de cada tela de parede (só elas
// podem ter) e o navegador que cada pessoa abriu numa tela.
export function chaveDaTela(p, i) {
  if (!p) return `cinema:${i + 1}`;
  const po = postoDaTela(p, i);
  if (po) return `${po.id}.${i - po.primeiraTela + 1}`;
  const s = comTelas(p).find((x) => i >= x.primeiraTela && i < x.primeiraTela + x.telas);
  return s ? `${s.id}:${i - s.primeiraTela + 1}` : null;
}

// "TI · Tela 2" ou "TI · Posto 3 · Monitor 1"
export function rotuloDaTela(p, i) {
  const po = postoDaTela(p, i);
  if (po) return `${rotuloDoPosto(po.id)} · Monitor ${i - po.primeiraTela + 1}`;
  const s = comTelas(p).find((x) => i >= x.primeiraTela && i < x.primeiraTela + x.telas);
  if (!s) return `Tela ${i + 1}`;
  const n = i - s.primeiraTela;
  const painel = DEPARTAMENTOS[s.id]?.painel;
  return painel && n === s.telas - 1 ? `${s.nome} · ${painel}` : `${s.nome} · Tela ${n + 1}`;
}
