// O que este aparelho tem no ar pelo PS5 direto e pelo PC direto, para voltar sozinho depois de uma
// reconexão ou recarga (deploy novo, F5, o Chrome recarregou a aba). Até 2026-11-24 só a vez alugada
// punha de volta (o servidor repetia o pedido): sem ninguém alugando, a pessoa voltava e a tela não.
//
// Guarda a intenção, não a tela: sai daqui só quando alguém para de propósito (o X da tela, o "Parar",
// o fim da vez, "Sair"). Uma queda só marca a hora (caiu). Fica no sessionStorage: sobrevive à recarga
// e some com a aba fechada.
export const DIRETAS = 'sala3d-diretas';
const VALE_MS = 30 * 60_000; // sem sinal da página há mais que isso (aba restaurada no outro dia): não volta
const JUNTO_MS = 2 * 60_000; // a imagem caiu até isso antes da conexão com a sala: foi a mesma queda

export class Diretas {
  // sala(): a sala de agora; guarda: o sessionStorage; agora(): a hora (os testes trocam os três)
  constructor({ sala, guarda = null, agora = () => Date.now() }) {
    Object.assign(this, { sala, guarda, agora });
    this.lista = {};
    this.travada = false; // a própria reconexão tirando as telas mortas: não é alguém parando
    try { this.lista = JSON.parse(guarda?.getItem(DIRETAS) || '{}') || {}; } catch { this.lista = {}; }
  }

  salvar() {
    try {
      if (Object.keys(this.lista).length) this.guarda?.setItem(DIRETAS, JSON.stringify(this.lista));
      else this.guarda?.removeItem(DIRETAS);
    } catch { /* sem armazenamento */ }
  }

  // está no ar (m: 'ps5' ou 'pc'): passa a voltar sozinha
  quer(m, dados) {
    this.lista[m] = { lan: false, controle: true, slot: null, ...dados, sala: this.sala(), t: this.agora(), caiu: null };
    this.salvar();
  }

  // como está agora (a tela da sala, o controle, a monitor) e o sinal de vida da página
  atualizar(m, dados) {
    if (!this.lista[m]) return;
    Object.assign(this.lista[m], dados, { t: this.agora() });
    this.salvar();
  }

  // alguém parou de propósito
  larga(m) {
    if (this.travada || !this.lista[m]) return;
    delete this.lista[m];
    this.salvar();
  }

  // a imagem caiu sozinha (a rede, a ponte): volta se a sala também cair e reconectar
  caiu(m) {
    if (!this.lista[m] || this.lista[m].caiu) return;
    this.lista[m].caiu = this.agora();
    this.salvar();
  }

  // As que têm de voltar agora. quedaEm: quando a sala perdeu a conexão (null: a página recarregou).
  // Uma imagem que já tinha caído bem antes (o PS5 desligado de manhã, a internet piscou à tarde) não
  // volta: ligaria o PS5 sozinho. As que não voltam saem da lista.
  paraVoltar(quedaEm = null) {
    const agora = this.agora();
    const voltam = [];
    for (const [m, d] of Object.entries(this.lista)) {
      const velha = agora - d.t > VALE_MS;
      const antes = d.caiu && d.caiu < (quedaEm ?? agora) - JUNTO_MS;
      if (d.sala !== this.sala() || velha || antes) delete this.lista[m];
      else voltam.push(m);
    }
    this.salvar();
    return voltam;
  }
}
