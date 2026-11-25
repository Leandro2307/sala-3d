// O modo carro à vista (mapa-teclas.js, teclado-pad.js), na sala e na /jogar: um quadro colorido em cima da
// legenda (verde a pé, laranja no carro) o tempo todo e, na hora da troca, um aviso grande no meio da tela.
// A página não vê o jogo: se o △ não entrou no carro de verdade, é aqui que a pessoa percebe.
import { textoModoCarro } from './mapa-teclas.js';

const AVISO_MS = 1500;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class ModoCarroTela {
  // quadro: #jogo-modo (fica); aviso: #jogo-modo-aviso (aparece na troca e some)
  constructor({ quadro, aviso }) {
    this.quadro = quadro;
    this.aviso = aviso;
    this.timer = 0;
  }

  mostrar(noCarro) {
    const t = textoModoCarro(noCarro);
    if (!t) return this.esconder();
    this.quadro.hidden = false;
    this.quadro.classList.toggle('carro', t.noCarro);
    this.quadro.innerHTML = `<i>${t.icone}</i><span><b>${esc(t.nome)}</b><small>${esc(t.faz)}</small></span>${
      t.troca ? `<kbd>${esc(t.troca)}<small>troca</small></kbd>` : ''}`;
  }

  // a troca: o aviso grande
  trocou(noCarro) {
    const t = textoModoCarro(noCarro);
    if (!t) return;
    this.aviso.hidden = true;
    this.aviso.classList.toggle('carro', t.noCarro);
    this.aviso.innerHTML = `<i>${t.icone}</i><b>${esc(t.nome)}</b><small>${esc(t.faz)}</small>`;
    void this.aviso.offsetWidth; // a animação começa de novo em trocas seguidas
    this.aviso.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.aviso.hidden = true; }, AVISO_MS);
  }

  esconder() {
    clearTimeout(this.timer);
    this.quadro.hidden = true;
    this.aviso.hidden = true;
  }
}
