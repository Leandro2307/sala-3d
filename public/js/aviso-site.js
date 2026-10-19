// Aviso do site numa tela controlada: alert, confirm, prompt e o "sair do site?" (beforeunload).
//
// Esses avisos são janelas do Chrome de quem compartilha: não aparecem no vídeo da aba, e a página
// fica parada até alguém responder. A extensão (1.11+) conta para a sala de quem compartilha, que
// manda para quem mexeu por último na tela (controle.js, "a volta"); a pergunta aparece aqui e a
// resposta volta pelo próprio controle ({ t: 'dialogo', aceitar, texto }). Se quem compartilha
// responder lá no Chrome, o aviso some daqui sozinho.
//
// Um por vez: o de outra tela espera na fila. Aberto, ele fica com o teclado (Enter responde, Esc
// cancela); a tela que estava com o teclado o recebe de volta quando ele fecha.

const TITULOS = {
  alert: 'Aviso do site',
  confirm: 'O site pergunta',
  prompt: 'O site pede uma resposta',
  beforeunload: 'Sair do site?',
};

export class AvisoDoSite {
  // responder(key, ev): leva a resposta até a tela (controle.mandar)
  constructor({ raiz, controle, responder }) {
    this.raiz = raiz;
    this.controle = controle;
    this.responder = responder;
    this.form = raiz.querySelector('form');
    this.campo = this.form.elements.texto;
    this.fila = []; // [{ key, ev, onde }]
    this.atual = null;
    this.teclado = null; // a tela que estava com o teclado antes do aviso
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.responderAtual(true);
    });
    raiz.addEventListener('click', (e) => {
      if (e.target.closest('[data-as="nao"]')) this.responderAtual(false);
    });
  }

  get aberto() { return !!this.atual; }

  // ev: { t: 'dialogo', tipo, msg, padrao, site }, ou { t: 'dialogo', fechou: true } quando o
  // aviso fechou do outro lado. onde: "Na tela de Fulano"
  receber(key, ev, onde) {
    // um aviso por tela: o novo toma o lugar do que ela tinha
    this.fila = this.fila.filter((a) => a.key !== key);
    if (ev.fechou) {
      if (this.atual?.key === key) this.proximo();
      return;
    }
    if (this.atual?.key === key) {
      this.atual = { key, ev, onde };
      this.mostrar();
      return;
    }
    this.fila.push({ key, ev, onde });
    if (!this.atual) this.proximo();
  }

  // a tela saiu do ar: o aviso dela não tem mais quem responder
  esquecer(key) {
    this.receber(key, { t: 'dialogo', fechou: true });
  }

  proximo() {
    this.atual = this.fila.shift() || null;
    if (this.atual) this.mostrar();
    else this.fechar();
  }

  mostrar() {
    const { ev, onde } = this.atual;
    const tipo = TITULOS[ev.tipo] ? ev.tipo : 'alert';
    const sair = tipo === 'beforeunload';
    this.raiz.querySelector('#as-titulo').textContent = TITULOS[tipo];
    this.raiz.querySelector('#as-onde').textContent = [onde, ev.site].filter(Boolean).join(' · ');
    this.raiz.querySelector('#as-msg').textContent = ev.msg || (sair ? 'O que foi feito nesta página pode não ser salvo.' : '');
    this.campo.hidden = tipo !== 'prompt';
    this.campo.value = tipo === 'prompt' ? ev.padrao || '' : '';
    const nao = this.raiz.querySelector('[data-as="nao"]');
    nao.hidden = tipo === 'alert';
    nao.textContent = sair ? 'Ficar' : 'Cancelar';
    this.raiz.querySelector('[data-as="sim"]').textContent = sair ? 'Sair' : 'OK';
    if (this.raiz.hidden) {
      this.teclado = this.controle.teclado;
      this.controle.focar(null);
      if (document.pointerLockElement) document.exitPointerLock();
      this.raiz.hidden = false;
    }
    if (tipo === 'prompt') {
      this.campo.focus();
      this.campo.select();
    } else {
      this.raiz.querySelector('[data-as="sim"]').focus();
    }
  }

  responderAtual(aceitar) {
    const a = this.atual;
    if (!a) return;
    this.responder(a.key, { t: 'dialogo', aceitar, texto: a.ev.tipo === 'prompt' ? this.campo.value : '' });
    this.proximo();
  }

  // Esc: cancela (no alert, que só tem o OK, é o próprio OK)
  esc() {
    this.responderAtual(this.atual?.ev.tipo === 'alert');
  }

  fechar() {
    this.atual = null;
    if (this.raiz.hidden) return;
    this.raiz.hidden = true;
    if (this.raiz.contains(document.activeElement)) document.activeElement.blur();
    if (this.teclado && this.controle.tem(this.teclado)) this.controle.focar(this.teclado);
    this.teclado = null;
  }
}
