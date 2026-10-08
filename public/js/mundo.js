// Os mundos da sala: o clássico (o de sempre) e o novo, organizado em volta de uma praça na porta
// do prédio. Quem escolhe é o dono da sala (config.mundo, ver server.js), e vale para a página
// inteira: as posições das atrações (autódromo, mesas de jogos, portais...) saem dos módulos de
// cenário no momento em que eles carregam. Por isso trocar de mundo recarrega a página, como já
// acontece ao trocar de sala (ver mundoDaSala em main.js).
//
// Aqui só se decide qual: ?mundo= no endereço e, sem ele, o último mundo visto nesta sala neste
// navegador (a sala vem em ?sala=). No servidor não há endereço: vale o clássico, e é só o que ele
// precisa (as quadras e a arena do céu, que ele confere, ficam no mesmo lugar nos dois).

export const MUNDOS = {
  classico: { nome: 'Clássico', desc: 'O mundo de sempre: autódromo grande e as atrações espalhadas' },
  novo: { nome: 'Praça central', desc: 'Praça na porta do prédio e avenidas até cada área' },
};
export const IDS_MUNDOS = Object.keys(MUNDOS);

const CHAVE = 'sala3d-mundos'; // { sala: mundo }

function lidos() {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

function escolher() {
  if (typeof location === 'undefined') return 'classico';
  const params = new URLSearchParams(location.search);
  const pedido = params.get('mundo');
  if (MUNDOS[pedido]) return pedido;
  const sala = params.get('sala');
  const salvo = sala && lidos()[sala.toLowerCase()];
  return MUNDOS[salvo] ? salvo : 'classico';
}

export const MUNDO = escolher();
export const NOVO = MUNDO === 'novo';

// guarda o mundo da sala: a próxima visita já monta o certo, sem recarregar
export function lembrarMundo(sala, mundo) {
  if (!sala || !MUNDOS[mundo]) return;
  try {
    const m = lidos();
    if (mundo === 'classico') delete m[sala];
    else m[sala] = mundo;
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch { /* modo privado: recarrega toda vez, mas funciona */ }
}
