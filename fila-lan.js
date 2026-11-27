// Fila da vez na lan house (pedido de 2026-11-27): quem está assistindo entra na fila de uma máquina (PC ou
// PS5) e vê "Vez de João · você é o 1º da fila". Quando a máquina fica livre, o 1º é chamado e só ele pode
// começar (o teste grátis ou o "Jogar agora"/a hora de agora no aluguel) por CHAMADA_MS; não começou, sai da
// fila e o seguinte é chamado. Começou o teste grátis: a chamada vai até o fim dele + CHAMADA_MS (dá para
// alugar depois do teste sem perder o lugar). Começou uma vez (paga, liberada): sai da fila.
// Sem ninguém na fila, nada muda. Horário já alugado na agenda passa na frente da fila (a vez dele é a vez).
// Fica na memória (um reinício do servidor esvazia a fila; quem estava nela entra de novo).

const CHAMADA_MS = 2 * 60_000;
const AUSENTE_MS = 60_000; // saiu da sala (recarregar a página não tira da fila; fechar por 1 min tira)

class FilaLan {
  constructor(maquinas = ['pc', 'ps5']) {
    this.m = Object.fromEntries(maquinas.map((m) => [m, { lista: [], chamada: null }]));
  }

  // [{ conta, desde, foraDesde }]
  lista(m) { return this.m[m]?.lista || []; }
  chamada(m) { return this.m[m]?.chamada || null; }
  posicao(m, conta) { return this.lista(m).findIndex((x) => x.conta === conta); }

  entrar(m, conta, agora = Date.now()) {
    const f = this.m[m];
    if (!f || !conta) return -1;
    let i = this.posicao(m, conta);
    if (i < 0) i = f.lista.push({ conta, desde: agora, foraDesde: null }) - 1;
    return i;
  }

  sair(m, conta) {
    const f = this.m[m];
    if (!f) return false;
    const i = this.posicao(m, conta);
    if (i < 0) return false;
    f.lista.splice(i, 1);
    if (f.chamada?.conta === conta) f.chamada = null;
    return true;
  }

  // Quem tem a preferência agora nesta máquina livre (o 1º da fila), se não é esta conta: null deixa começar.
  // Com a máquina ocupada não importa (quem joga é o da vez).
  bloqueia(m, conta) {
    const p = this.lista(m)[0];
    return p && p.conta !== conta ? p.conta : null;
  }

  // o chamado começou o teste grátis (fim dele): a chamada espera o teste acabar e mais CHAMADA_MS
  comecouTeste(m, conta, fimTeste) {
    const c = this.chamada(m);
    if (c?.conta === conta) c.ate = Math.max(c.ate, fimTeste + CHAMADA_MS);
  }

  // A cada poucos segundos, por máquina. vez: a conta que joga agora (null: livre); testando: { conta, fim } do
  // teste grátis correndo nesta máquina; presentes: as contas na sala. Devolve o que mudou:
  // [{ tipo: 'chamada' | 'passou' | 'pegou' | 'saiu', conta, ate? }]
  passo(m, { vez = null, testando = null, presentes = new Set(), agora = Date.now() } = {}) {
    const f = this.m[m];
    if (!f) return [];
    const ev = [];
    // fora da sala há mais de AUSENTE_MS: sai
    for (const x of [...f.lista]) {
      if (presentes.has(x.conta)) x.foraDesde = null;
      else if (x.foraDesde == null) x.foraDesde = agora;
      else if (agora - x.foraDesde >= AUSENTE_MS) {
        this.sair(m, x.conta);
        ev.push({ tipo: 'saiu', conta: x.conta });
      }
    }
    if (vez) {
      // pegou a máquina (pagou, liberado): não espera mais
      if (this.sair(m, vez)) ev.push({ tipo: 'pegou', conta: vez });
      // máquina ocupada: a chamada de quem não começou volta a esperar a máquina ficar livre
      f.chamada = null;
      return ev;
    }
    // alguém de fora da fila ainda no teste de 2 min (começou antes de a fila existir): espera acabar
    if (testando && testando.fim > agora && testando.conta !== f.lista[0]?.conta) return ev;
    if (f.chamada && f.chamada.ate <= agora) {
      const c = f.chamada.conta;
      this.sair(m, c);
      ev.push({ tipo: 'passou', conta: c });
    }
    if (f.chamada && f.chamada.conta !== f.lista[0]?.conta) f.chamada = null;
    if (!f.chamada && f.lista.length) {
      f.chamada = { conta: f.lista[0].conta, ate: agora + CHAMADA_MS };
      ev.push({ tipo: 'chamada', conta: f.chamada.conta, ate: f.chamada.ate });
    }
    return ev;
  }

  // para o estado da sala: { lista: [conta], chamada: { conta, ate } | null }
  estado(m) {
    const f = this.m[m];
    return { lista: f.lista.map((x) => x.conta), chamada: f.chamada ? { ...f.chamada } : null };
  }
}

module.exports = { FilaLan, CHAMADA_MS, AUSENTE_MS };
