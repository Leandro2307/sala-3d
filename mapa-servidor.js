// O mapa de cada sala no servidor (public/js/mapas-dados.js). Os jogos que o servidor confere
// (mesas, quadras, kart, golfe, pinta...) ficam em lugares diferentes em cada mapa, então cada módulo
// de dados/física é carregado uma vez por mapa (com ?mapa=<id> no endereço: o módulo calcula as
// posições daquele mapa).
//
// carregarPorMapa devolve uma ponte: um objeto que repassa cada propriedade para o módulo do mapa em
// uso. Quem usa troca o mapa com usar(room) toda vez que entra no código com uma sala: no laço que
// passa pelas salas e a cada evento de socket (ver comMapa). O código dos jogos é síncrono (nenhum
// setTimeout), então o mapa em uso é sempre o da sala que está sendo tratada.

const MAPAS_SALA = ['tropical', 'neve', 'outono'];
const MAPA_PADRAO = 'tropical';
const mapaDa = (room) => (MAPAS_SALA.includes(room?.config?.mapa) ? room.config.mapa : MAPA_PADRAO);

function carregarPorMapa(arquivo) {
  const mods = {};
  let atual = MAPA_PADRAO;
  const ponte = new Proxy({}, {
    get: (_, k) => mods[atual]?.[k],
    has: (_, k) => k in (mods[atual] || {}),
  });
  const usar = (room) => {
    atual = mapaDa(room);
  };
  const pronto = Promise.all(MAPAS_SALA.map((m) => import(`./public/js/${arquivo}?mapa=${m}`).then((mod) => { mods[m] = mod; })))
    .then(() => ponte);
  return { pronto, usar };
}

// o quem() do socket, trocando para o mapa da sala dele toda vez que é chamado
const comMapa = (quem, ...cargas) => () => {
  const r = quem();
  if (r?.room) for (const c of cargas) c.usar(r.room);
  return r;
};

module.exports = { MAPAS_SALA, MAPA_PADRAO, mapaDa, carregarPorMapa, comMapa };
