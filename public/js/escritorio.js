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

export const DEPARTAMENTOS = {
  ti: { nome: 'TI', telas: 8, cor: '#38bdf8', descricao: 'Parede de monitoramento, bancadas e cadeiras gamer' },
  comercial: { nome: 'Comercial', telas: 4, cor: '#fbbf24', descricao: 'Placar de metas, ilhas de venda e sino' },
  telemarketing: { nome: 'Telemarketing', telas: 4, cor: '#f472b6', descricao: 'Baias com headset e painel da central' },
  reuniao: { nome: 'Reunião', telas: 2, cor: '#a78bfa', descricao: 'Mesa para 10, telão e duas telas' },
};
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
  const colunas = Math.max(1, Math.ceil(lista.length / 2));
  const lounges = VAGAS.slice(lista.length, colunas * 2).map(({ x0, lado }) => {
    const [z0, z1] = faixaZ(lado);
    return { id: 'lounge', nome: 'Lounge', lado, x0, x1: x0 + PREDIO.largura, z0, z1 };
  });
  return { salas, lounges, minX: VAGAS[(colunas - 1) * 2].x0, totalTelas: tela };
}

// em que sala está o ponto (id do departamento, 'lounge', 'corredor', 'recepcao' ou null = fora)
export function salaEm(p, x, z) {
  if (x < p.minX || x > PREDIO.maxX || z < PREDIO.z0 || z > PREDIO.z1) return null;
  if (x >= PREDIO.recepcao) return 'recepcao';
  for (const s of [...p.salas, ...p.lounges]) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.id;
  return 'corredor';
}

// as telas de uma sala: [primeira, última + 1)
export function faixaDeTelas(p, id) {
  const s = p.salas.find((x) => x.id === id);
  return s ? [s.primeiraTela, s.primeiraTela + s.telas] : [0, p.totalTelas];
}

// "TI · Tela 2"
export function rotuloDaTela(p, i) {
  const s = p.salas.find((x) => i >= x.primeiraTela && i < x.primeiraTela + x.telas);
  return s ? `${s.nome} · Tela ${i - s.primeiraTela + 1}` : `Tela ${i + 1}`;
}
