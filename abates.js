// Sequência de abates (double kill, triple kill...), contada pelo servidor para o mata-mata e para o
// mata-mata em times. Cada abate até JANELA ms depois do anterior soma na sequência; morrer zera.
// O nome de cada sequência (DOUBLE KILL, TRIPLE KILL...) quem dá é o navegador (anuncios.js).
const JANELA = 4500;

function contarAbate(j, agora = Date.now()) {
  j.serie = agora - (j.ultimoAbate || 0) <= JANELA ? (j.serie || 0) + 1 : 1;
  j.ultimoAbate = agora;
  return j.serie;
}

function zerarSerie(j) {
  j.serie = 0;
  j.ultimoAbate = 0;
}

// a arma que derrubou (a que o navegador da vítima viu chegar), ou 'soco'
const armaDoAbate = (arma, ARMAS) => (typeof arma === 'string' && (arma === 'soco' || Object.hasOwn(ARMAS, arma)) ? arma : null);

module.exports = { contarAbate, zerarSerie, armaDoAbate, JANELA };
