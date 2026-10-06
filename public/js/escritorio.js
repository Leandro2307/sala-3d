// Escritório modular: a empresa marca os departamentos que tem e as salas se encaixam dos dois
// lados de um corredor, com a recepção na entrada. Cada sala tem a cara do departamento e as
// próprias telas. Este arquivo é só a planta (nada de 3D): o servidor usa também, para saber
// quantas telas cada sala tem e em qual sala cai cada compartilhamento.
//
// O prédio fica onde no modo Lazer está o cinema, com a porta para o mesmo lado (leste), então
// lá fora continuam o parque, a pista e as mesas de jogos.
//
//   z=2   ┌─────────┬─────────┬─────────┬──────────┐
//         │ 5ª sala │ 3ª sala │ 1ª sala │          │
//   z=26  ├──  ─────┴──  ─────┴──  ─────┤ recepção │
//         │        corredor                    porta  → lá fora (x=60)
//   z=34  ├──  ─────┬──  ─────┬──  ─────┤          │
//         │ 6ª sala │ 4ª sala │ 2ª sala │          │
//   z=58  └─────────┴─────────┴─────────┴──────────┘
//        x=-44     -16        12        40         60

// telas: as da parede (de todo mundo). postos: mesas individuais com 3 monitores cada — quem
// senta fica com o posto, e o que compartilha aparece nos monitores dele.
export const DEPARTAMENTOS = {
  ti: { nome: 'TI', telas: 8, postos: 12, cor: '#38bdf8', descricao: 'Parede de monitoramento e 12 postos com 3 monitores e cadeira gamer' },
  comercial: { nome: 'Comercial', telas: 4, postos: 8, cor: '#fbbf24', descricao: 'Placar de metas, 8 postos com 3 monitores e sino' },
  telemarketing: { nome: 'Telemarketing', telas: 4, postos: 8, cor: '#f472b6', descricao: '8 baias com 3 monitores, headset e painel da central' },
  reuniao: { nome: 'Reunião', telas: 2, postos: 0, cor: '#a78bfa', descricao: 'Mesa para 10, telão e duas telas' },
  financeiro: { nome: 'Financeiro', telas: 2, postos: 8, cor: '#34d399', descricao: '8 postos com 3 monitores, painel de indicadores e cofre' },
  rh: { nome: 'RH', telas: 2, postos: 6, cor: '#fb923c', descricao: '6 postos, cantinho de conversa e mural da equipe' },
  marketing: { nome: 'Marketing', telas: 4, postos: 8, cor: '#e879f9', descricao: '8 postos em ilhas, parede criativa e quadro de ideias' },
  gestao: { nome: 'Gestão', telas: 2, postos: 4, cor: '#f87171', descricao: 'Sala dos gestores: painel da equipe ao vivo (quem está trabalhando, em pausa ou inativo) e 4 postos' },
  descanso: { nome: 'Descanso', telas: 1, postos: 0, cor: '#a3e635', descricao: 'Copa com sofás e TV — quem entra fica “Em pausa” e os gestores são avisados' },
};
export const MONITORES_POR_POSTO = 3;
export const IDS_DEPARTAMENTOS = Object.keys(DEPARTAMENTOS);
export const MAX_SALAS = 6;

export const PREDIO = {
  maxX: 60,
  z0: 2,
  z1: 58,
  altura: 6.5,
  corredor: [26, 34], // z do corredor; a porta de fora fica no mesmo trecho, em x = 60
  recepcao: 40, // de x = 40 até a porta é recepção
  largura: 28, // largura (x) de cada sala
};

// vagas na ordem em que as salas entram: a mais perto da recepção primeiro, norte e depois sul
const VAGAS = [12, 12, -16, -16, -44, -44].map((x0, i) => ({ x0, lado: i % 2 ? 'sul' : 'norte' }));

const faixaZ = (lado) => (lado === 'norte' ? [PREDIO.z0, PREDIO.corredor[0]] : [PREDIO.corredor[1], PREDIO.z1]);

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
  // monitores dos postos: depois de todas as telas de parede, 3 por posto, na ordem das salas
  const telasParede = tela;
  const postos = [];
  for (const s of salas) {
    for (let i = 0; i < DEPARTAMENTOS[s.id].postos; i++) {
      postos.push({ id: `${s.id}-${i}`, sala: s.id, n: i, primeiraTela: tela });
      tela += MONITORES_POR_POSTO;
    }
  }
  const colunas = Math.max(1, Math.ceil(lista.length / 2));
  const lounges = VAGAS.slice(lista.length, colunas * 2).map(({ x0, lado }) => {
    const [z0, z1] = faixaZ(lado);
    return { id: 'lounge', nome: 'Lounge', lado, x0, x1: x0 + PREDIO.largura, z0, z1 };
  });
  return { salas, lounges, postos, minX: VAGAS[(colunas - 1) * 2].x0, telasParede, totalTelas: tela };
}

// em que sala está o ponto (id do departamento, 'lounge', 'corredor', 'recepcao' ou null = fora)
export function salaEm(p, x, z) {
  if (x < p.minX || x > PREDIO.maxX || z < PREDIO.z0 || z > PREDIO.z1) return null;
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
  return s.lado === 'norte' ? { pos: [x, 0, PREDIO.corredor[0] - 2.5], yaw: 0 } : { pos: [x, 0, PREDIO.corredor[1] + 2.5], yaw: Math.PI };
}

// as telas de parede de uma sala: [primeira, última + 1). Fora de sala: todas as de parede.
export function faixaDeTelas(p, id) {
  const s = p.salas.find((x) => x.id === id);
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

// "TI · Tela 2" ou "TI · Posto 3 · Monitor 1"
export function rotuloDaTela(p, i) {
  const po = postoDaTela(p, i);
  if (po) return `${rotuloDoPosto(po.id)} · Monitor ${i - po.primeiraTela + 1}`;
  const s = p.salas.find((x) => i >= x.primeiraTela && i < x.primeiraTela + x.telas);
  return s ? `${s.nome} · Tela ${i - s.primeiraTela + 1}` : `Tela ${i + 1}`;
}
