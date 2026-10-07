// O computador dos jogos de tabuleiro, fora da thread do 3D: no difícil, a busca do xadrez e da
// dama leva de 0,2 a 0,5 s, e na página isso parava o quadro a cada lance. As regras são os
// mesmos módulos do jogo (e do servidor), que não usam nada da página.
// Pedido: { id, mesa, st, prof }. Resposta: { id, texto } (o lance como vai pela rede, ou null
// se não tem lance) ou { id, erro }.
import * as X from './xadrez.js';
import * as D from './dama.js';
import * as V from './velha.js';

const REGRAS = { xadrez: X, dama: D, velha: V };

self.onmessage = ({ data: { id, mesa, st, prof } }) => {
  try {
    const R = REGRAS[mesa];
    const m = R.lanceDoComputador(st, prof);
    self.postMessage({ id, texto: m ? R.paraTexto(m) : null });
  } catch (e) {
    self.postMessage({ id, erro: String(e?.message || e) });
  }
};
