// Poker Texas Hold'em (as duas mesas do corredor do meio do salão de jogos): o servidor embaralha,
// dá as cartas, conduz as apostas, confere o showdown (public/js/poker-regras.js) e joga pelos robôs
// que completam a mesa. As fichas são as moedas de verdade de cada um (as do server.js): o blind e
// cada aposta saem do saldo na hora, e o pote volta para o saldo de quem ganha.
// Cada um recebe só a própria mão ('pk-mao'); o resto da mesa vai para a sala ('pk-mesa') com as
// mãos fechadas (abrem no showdown).
//
// CONTRATO DE EVENTOS (tudo com o prefixo pk-)
//   client -> server
//     'pk-sentar'   { mesa, lugar? }        senta na mesa (lugar 0..5; sem lugar, o primeiro livre).
//                                             ack({ ok, lugar } | { erro: 'cheia'|'ocupado'|'sem moedas'|'desligado' })
//     'pk-comecar'  { mesa }                começa a partida (completa com robôs até ROBOS_ATE na mesa)
//     'pk-apostar'  { mesa, tipo, valor? }  ação na vez: tipo 'fold'|'check'|'call'|'raise'|'allin';
//                                             'raise' usa valor = aposta total desejada na rodada
//     'pk-empilhar' { mesa, empilhado }     o pote da mesa em torres (ou espalhado): só o visual,
//                                             repassado para a sala
//     'pk-sair'     { mesa }                levanta da mesa
//     'pk-ver'      (ack)                   ack com o estado público de todas as mesas
//   server -> sala (room.id): 'pk-mesa' { ...publico(m) }  a cada mudança de estado
//                             'pk-empilhar' { mesa, empilhado, por }
//   server -> jogador (só o dono): 'pk-mao' { mesa, lugar, mao: [carta, carta] }  mão privada
//
// publico(m): { mesa, fase: 'espera'|'pre-flop'|'flop'|'turn'|'river'|'showdown', comunitarias,
//   pote (o que já foi recolhido das rodadas anteriores), apostaAtual, minimo (o raise mínimo),
//   aviso, prazo, prazoTotal, resultado, mao (número da mão), empilhado, lugares: [{ id, nome, robo,
//   cor, saldo, aposta, total, fold, fora, allIn, dealer, vez, mao }] }. Carta: { n, s } (ver
//   poker-regras.js). mao do lugar é [2 cartas] só no showdown (ou null); o dono vê a sua em 'pk-mao'.
//
// Regras da mesa: 6 lugares, Texas Hold'em sem limite. Small blind 1, big blind 2. Quem não tem o
// valor entra all-in com o que tem; quem está com 0 não senta. A rodada de apostas fecha quando
// todos os que ainda decidem já agiram e igualaram a maior aposta (o big blind tem a opção no
// pré-flop); um aumento reabre a rodada para os outros. Com todo mundo all-in as cartas que faltam
// abrem sozinhas. No showdown a melhor mão de 5 entre as 7 leva o pote (split pot e side pots).
// Fim da mão: 8 s e nova mão automática com 2+ na mesa. Quem senta no meio de uma mão espera a
// próxima. Robôs assumem o lugar de quem sai no meio da mão e jogam por quem trava na vez.
const { carregarPorMapa, comMapa } = require('./mapa-servidor.js');

let R = null;
let MESAS = null;
const DADOS = carregarPorMapa('parque-dados.js'); // um módulo por mapa (mapa-servidor.js)
Promise.all([import('./public/js/poker-regras.js'), DADOS.pronto])
  .then(([regras, dados]) => {
    R = regras;
    MESAS = dados; // a ponte: as mesas do mapa em uso (MESAS.MESAS_POKER)
  })
  .catch((err) => console.warn('  Regras de poker não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const LUGARES = 6;
const SMALL = 1;
const BIG = 2;
const ROBOS_ATE = 4; // "Começar" completa a mesa com robôs até ter tantos jogadores
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico', 'Robô Sol'];
const ESPERA_ROBO = 1400; // ms que o robô "pensa"
const ESPERA_GENTE = 40_000; // parado na vez: joga por ele (check ou fold)
const ESPERA_CORRIDA = 1800; // todo mundo all-in: entre uma carta e outra que abre sozinha
const INTERVALO_APOSTA = 600; // anti-spam: ms mínimo entre duas apostas da mesma pessoa
const INTERVALO_PILHA = 400; // anti-spam do empilhar
const ESPERA_FIM_MAO = 8000; // espera entre mãos

const novaMesa = (i) => ({
  i, jogo: 'poker', lugares: Array(LUGARES).fill(null), fase: 'espera', mao: 0,
  comunitarias: [], pote: 0, apostas: Array(LUGARES).fill(0), apostaAtual: 0, ultimoAumento: BIG,
  dealerIndex: -1, vez: -1, ate: 0, vezDesde: 0, botAte: 0, corrida: 0, aviso: '', resultado: null,
  empilhado: false,
});
const mesasDa = (room) => (room.poker ||= { mesas: MESAS.MESAS_POKER.map((_, i) => novaMesa(i)) });
const longeDemais = (l, longe) => {
  if (!longe) { l.longeDesde = 0; return false; }
  l.longeDesde ||= Date.now();
  return Date.now() - l.longeDesde > 3000;
};

function ligarPoker(io, rooms, jogoLigado, darMoedas) {
  const nomeDe = (m, k) => m.lugares[k]?.nome || '…';
  const humanos = (m) => m.lugares.filter((l) => l && !l.bot);
  const robo = (m, k) => ({ id: `robo-${m.i}-${k}`, nome: NOMES_ROBO[k % NOMES_ROBO.length], bot: true, mao: [], fold: false, allIn: false, agiu: false, apostadoTotal: 0 });
  const vezDeGente = (m, k) => !!m.lugares[k] && !m.lugares[k].bot;
  // o saldo de verdade (o server.js mantém user.moedas); o robô tem fichas sem fim
  const saldoDe = (room, m, k) => {
    const l = m.lugares[k];
    if (!l) return 0;
    if (l.bot) return 1e9;
    return room.users.get(l.id)?.moedas ?? 0;
  };
  // tira (delta < 0) ou põe moedas no saldo de quem está no lugar (o robô não tem carteira)
  const mexerNoSaldo = (room, l, delta, motivo) => {
    if (!l || l.bot || !delta) return;
    const user = room.users.get(l.id);
    if (user) darMoedas?.(room, user, delta, motivo);
  };
  // na mão: sentado, com cartas e sem fold
  const ativos = (m) => m.lugares.map((l, k) => (l && !l.fold && l.mao?.length ? k : -1)).filter((k) => k >= 0);
  // quem ainda decide nesta rodada: na mão e sem all-in
  const decidindo = (m) => ativos(m).filter((k) => !m.lugares[k].allIn);
  const ocupados = (m) => m.lugares.map((l, k) => (l ? k : -1)).filter((k) => k >= 0);
  const proximoQueDecide = (m, de) => {
    const n = m.lugares.length;
    for (let s = 1; s <= n; s++) {
      const k = (de + s) % n;
      const l = m.lugares[k];
      if (l && !l.fold && !l.allIn && l.mao?.length) return k;
    }
    return -1;
  };
  const proximoOcupado = (m, de) => {
    const n = m.lugares.length;
    for (let s = 1; s <= n; s++) {
      const k = (de + s) % n;
      if (m.lugares[k]) return k;
    }
    return de;
  };
  const emJogo = (m) => m.fase !== 'espera' && m.fase !== 'showdown';

  // ------------------------------------------------------------------ o que vai para cada um
  function publico(room, m) {
    const espera = m.fase === 'showdown' ? ESPERA_FIM_MAO : ESPERA_GENTE;
    const abre = m.fase === 'showdown' && m.resultado?.maos;
    const naRodada = m.apostas.reduce((s, a) => s + a, 0);
    return {
      mesa: m.i, jogo: 'poker', fase: m.fase, mao: m.mao, comunitarias: m.comunitarias.map(carta),
      pote: m.fase === 'showdown' ? 0 : Math.max(0, totalApostado(m) + (m.fantasmas || 0) - naRodada),
      apostaAtual: m.apostaAtual, minimo: m.apostaAtual + Math.max(BIG, m.ultimoAumento),
      aviso: m.aviso, resultado: m.resultado, empilhado: m.empilhado,
      prazo: m.vez >= 0 || m.fase === 'showdown' ? Math.max(0, m.vezDesde + espera - Date.now()) : 0,
      prazoTotal: espera,
      lugares: m.lugares.map((l, k) => {
        if (!l) return null;
        const u = l.bot ? null : room.users.get(l.id);
        return {
          id: l.bot ? null : l.id, nome: l.nome, robo: !!l.bot, cor: u?.color || null,
          saldo: l.bot ? null : u?.moedas ?? 0,
          aposta: m.apostas[k] || 0, total: l.apostadoTotal || 0,
          fold: !!l.fold, fora: !l.mao?.length && m.fase !== 'espera', allIn: !!l.allIn,
          dealer: k === m.dealerIndex && m.fase !== 'espera', vez: k === m.vez && emJogo(m),
          mao: abre && !l.fold && l.mao?.length ? l.mao.map(carta) : null,
        };
      }),
    };
  }
  const carta = (c) => ({ n: c.n, s: c.s });
  const totalApostado = (m) => m.lugares.reduce((s, l) => s + (l?.apostadoTotal || 0), 0);

  function avisar(room, m) {
    io.to(room.id).emit('pk-mesa', publico(room, m));
  }
  function darCartas(room, m) {
    m.lugares.forEach((l, k) => {
      if (!l || l.bot || !l.mao?.length) return;
      io.to(l.id).emit('pk-mao', { mesa: m.i, lugar: k, mao: l.mao.map(carta) });
    });
  }

  function zerarMesa(m) {
    m.fase = 'espera';
    m.comunitarias = [];
    m.pote = 0;
    m.apostaAtual = 0;
    m.apostas = Array(LUGARES).fill(0);
    m.vez = -1;
    m.corrida = 0;
    m.resultado = null;
    m.empilhado = false;
    for (const l of m.lugares) if (l) Object.assign(l, { mao: [], fold: false, allIn: false, agiu: false, apostadoTotal: 0 });
  }

  // a mesa ficou sem gente: some com os robôs e espera
  function arrumarMesa(room, m) {
    if (!humanos(m).length) {
      m.lugares = m.lugares.map(() => null);
      zerarMesa(m);
      m.aviso = '';
    }
    avisar(room, m);
  }

  function sair(room, id) {
    for (const m of room.poker?.mesas || []) {
      const k = m.lugares.findIndex((l) => l && !l.bot && l.id === id);
      if (k < 0) continue;
      const l = m.lugares[k];
      // com a mão rolando, um robô assume as cartas (e as fichas que já estão na mesa); fora da mão,
      // a cadeira fica livre
      if (emJogo(m) && l.mao?.length && !l.fold) {
        m.lugares[k] = Object.assign(robo(m, k), { mao: l.mao, fold: l.fold, allIn: l.allIn, agiu: l.agiu, apostadoTotal: l.apostadoTotal });
        m.aviso = `${l.nome} saiu: um robô assumiu`;
        if (m.vez === k) m.botAte = Date.now() + ESPERA_ROBO;
      } else {
        // o que ele já pôs nesta mão continua no pote (fica como um lugar vazio que apostou)
        if (l.apostadoTotal && m.fase !== 'espera') m.fantasmas = (m.fantasmas || 0) + l.apostadoTotal;
        m.lugares[k] = null;
        m.aviso = `${l.nome} levantou`;
      }
      arrumarMesa(room, m);
    }
  }

  // ------------------------------------------------------------------ a mão
  function novaMao(room, m) {
    zerarMesa(m);
    m.fantasmas = 0;
    const jogando = ocupados(m);
    if (jogando.length < 2) {
      m.aviso = 'Esperando mais gente (mínimo 2): clique em Começar para chamar os robôs';
      avisar(room, m);
      return;
    }
    const monte = R.embaralhar(R.novoBaralho());
    m.fase = 'pre-flop';
    m.mao++;
    for (const k of jogando) m.lugares[k].mao = [monte.pop(), monte.pop()];
    m.monte = monte;
    // o botão anda; blinds logo à frente (heads-up: o botão é a small blind)
    const d = proximoOcupado(m, m.dealerIndex);
    m.dealerIndex = d;
    const sb = jogando.length === 2 ? d : proximoOcupado(m, d);
    const bb = proximoOcupado(m, sb);
    pôrFichas(room, m, sb, SMALL);
    pôrFichas(room, m, bb, BIG);
    m.apostaAtual = BIG;
    m.ultimoAumento = BIG;
    m.aviso = `Small blind ${nomeDe(m, sb)} (${SMALL}) · big blind ${nomeDe(m, bb)} (${BIG})`;
    darCartas(room, m);
    // quem fala primeiro: depois do big blind (se todos já estão all-in pelos blinds, as cartas correm)
    if (decidindo(m).length < 2 && rodadaFechada(m)) correr(m);
    else darVez(m, proximoQueDecide(m, bb));
    avisar(room, m);
  }

  function darVez(m, k) {
    m.vez = k;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
  }
  // ninguém mais decide: as cartas que faltam abrem sozinhas, uma rodada de cada vez
  function correr(m) {
    m.vez = -1;
    m.corrida = Date.now() + ESPERA_CORRIDA;
  }

  // põe na mesa o que der (até o pedido, a aposta total da rodada); all-in se acabar o saldo.
  // Devolve o que entrou.
  function pôrFichas(room, m, k, pedido) {
    const l = m.lugares[k];
    const falta = Math.max(0, pedido - m.apostas[k]);
    const pago = Math.min(falta, saldoDe(room, m, k));
    if (pago > 0) {
      mexerNoSaldo(room, l, -pago, 'aposta no poker');
      l.apostadoTotal += pago;
      m.apostas[k] += pago;
    }
    if (saldoDe(room, m, k) <= 0) l.allIn = true;
    return pago;
  }

  function apostar(room, m, k, tipo, valor = 0) {
    if (!emJogo(m) || m.vez !== k) return false;
    const l = m.lugares[k];
    if (!l || l.fold || l.allIn) return false;
    const nome = nomeDe(m, k);
    const antes = m.apostaAtual;
    if (tipo === 'fold') {
      l.fold = true;
      m.aviso = `${nome} desistiu`;
    } else if (tipo === 'check') {
      if (m.apostas[k] !== m.apostaAtual) return false;
      m.aviso = `${nome} passou`;
    } else if (tipo === 'call') {
      if (m.apostas[k] >= m.apostaAtual) return apostar(room, m, k, 'check');
      const pago = pôrFichas(room, m, k, m.apostaAtual);
      m.aviso = l.allIn ? `${nome} pagou ${pago} e está all-in!` : `${nome} pagou ${pago}`;
    } else if (tipo === 'allin') {
      pôrFichas(room, m, k, m.apostas[k] + saldoDe(room, m, k));
      m.aviso = `${nome} foi ALL-IN: ${m.apostas[k]}!`;
    } else if (tipo === 'raise') {
      valor = Math.floor(Number(valor) || 0);
      const minimo = m.apostaAtual + Math.max(BIG, m.ultimoAumento);
      // menos que o mínimo só vale se for tudo o que tem (all-in curto)
      if (valor < minimo && valor < m.apostas[k] + saldoDe(room, m, k)) return false;
      pôrFichas(room, m, k, valor);
      m.aviso = l.allIn ? `${nome} foi ALL-IN: ${m.apostas[k]}!` : `${nome} aumentou para ${m.apostas[k]}`;
    } else return false;
    l.agiu = true;
    // subiu a aposta: a rodada reabre para os outros (o aumento mínimo passa a ser este)
    if (m.apostas[k] > antes) {
      if (m.apostas[k] - antes >= m.ultimoAumento) m.ultimoAumento = m.apostas[k] - antes;
      m.apostaAtual = m.apostas[k];
      for (const j of decidindo(m)) if (j !== k) m.lugares[j].agiu = false;
    }
    depoisDaAcao(room, m, k);
    return true;
  }

  // a rodada fechou: todos os que ainda decidem já agiram e igualaram a maior aposta
  function rodadaFechada(m) {
    const ds = decidindo(m);
    if (ds.every((k) => m.lugares[k].agiu && m.apostas[k] === m.apostaAtual)) return true;
    // sobrou um só decidindo (os outros foram all-in) e ele já cobriu a maior aposta: não tem contra quem
    return ds.length === 1 && m.apostas[ds[0]] >= m.apostaAtual;
  }

  function depoisDaAcao(room, m, k) {
    if (ativos(m).length <= 1) return levaSemShowdown(room, m);
    if (rodadaFechada(m)) proximaRua(room, m);
    else darVez(m, proximoQueDecide(m, k));
    avisar(room, m);
  }

  // só um ficou sem fold: leva tudo, sem mostrar as cartas
  function levaSemShowdown(room, m) {
    const k = ativos(m)[0];
    const pote = totalApostado(m) + (m.fantasmas || 0);
    if (k !== undefined) {
      mexerNoSaldo(room, m.lugares[k], pote, 'pote do poker');
      m.aviso = `${nomeDe(m, k)} levou o pote (${pote})`;
      m.resultado = { pote, vencedores: [{ lugar: k, nome: nomeDe(m, k), total: pote, mao: '' }] };
    } else m.aviso = 'Mão encerrada';
    encerrarMao(room, m);
  }

  // a rodada de apostas fechou: as apostas vão para o pote e abre a próxima carta (ou o showdown)
  function proximaRua(room, m) {
    m.apostas = Array(LUGARES).fill(0);
    m.apostaAtual = 0;
    m.ultimoAumento = BIG;
    m.corrida = 0;
    if (m.fase === 'river') return showdown(room, m);
    m.monte.pop(); // a carta queimada
    if (m.fase === 'pre-flop') {
      m.comunitarias.push(m.monte.pop(), m.monte.pop(), m.monte.pop());
      m.fase = 'flop';
      m.aviso = 'Flop';
    } else if (m.fase === 'flop') {
      m.comunitarias.push(m.monte.pop());
      m.fase = 'turn';
      m.aviso = 'Turn';
    } else {
      m.comunitarias.push(m.monte.pop());
      m.fase = 'river';
      m.aviso = 'River';
    }
    for (const l of m.lugares) if (l) l.agiu = false;
    // fala primeiro o primeiro na mão depois do botão; sem dois decidindo, as cartas correm
    if (decidindo(m).length < 2) correr(m);
    else darVez(m, proximoQueDecide(m, m.dealerIndex));
  }

  // side pots: os níveis das contribuições; cada pote só pode ir para quem pagou aquele nível
  function calcularPotes(m) {
    const contrib = m.lugares.map((l) => l?.apostadoTotal || 0);
    const pots = [];
    let nivel = 0;
    for (;;) {
      const acima = contrib.filter((c) => c > nivel);
      if (!acima.length) break;
      const menor = Math.min(...acima);
      const valor = contrib.reduce((s, c) => s + Math.max(0, Math.min(c, menor) - nivel), 0);
      pots.push({ valor, elegiveis: contrib.map((c, k) => (c >= menor ? k : -1)).filter((k) => k >= 0) });
      nivel = menor;
    }
    // o que ficou de quem levantou no meio vai para o primeiro pote
    if (pots.length && m.fantasmas) pots[0].valor += m.fantasmas;
    return pots;
  }

  function showdown(room, m) {
    const naMao = ativos(m);
    const ganhos = new Map(); // lugar -> total ganho
    const pote = totalApostado(m) + (m.fantasmas || 0);
    let sobra = 0;
    for (const pot of calcularPotes(m)) {
      const candidatos = pot.elegiveis.filter((k) => naMao.includes(k));
      if (!candidatos.length) { sobra += pot.valor; continue; }
      const vs = R.vencedores(candidatos.map((k) => ({ id: k, cartas: m.lugares[k].mao })), m.comunitarias).map((v) => v.id);
      const fatia = Math.floor(pot.valor / vs.length);
      // o resto da divisão vai para o primeiro depois do botão
      const resto = pot.valor - fatia * vs.length;
      vs.forEach((k, i) => ganhos.set(k, (ganhos.get(k) || 0) + fatia + (i === 0 ? resto : 0)));
    }
    // pote sem ninguém elegível (só acontece com quem levantou): vai para o maior ganhador
    if (sobra && ganhos.size) {
      const [k] = [...ganhos.entries()].sort((a, b) => b[1] - a[1])[0];
      ganhos.set(k, ganhos.get(k) + sobra);
    }
    const avaliadas = new Map(naMao.map((k) => [k, R.avaliarMao([...m.lugares[k].mao, ...m.comunitarias])]));
    for (const [k, total] of ganhos) mexerNoSaldo(room, m.lugares[k], total, 'pote do poker');
    m.resultado = {
      pote,
      maos: naMao.map((k) => ({ lugar: k, nome: nomeDe(m, k), mao: avaliadas.get(k).nome, cartas: avaliadas.get(k).cartas.map(carta) })),
      vencedores: [...ganhos.entries()].map(([k, total]) => ({ lugar: k, nome: nomeDe(m, k), total, mao: avaliadas.get(k).nome })),
    };
    const partes = m.resultado.vencedores.map((v) => `${v.nome} (+${v.total})`);
    const nomeMao = m.resultado.vencedores[0]?.mao;
    m.aviso = partes.length ? `${partes.join(' e ')} com ${nomeMao}` : 'Pote sem dono';
    encerrarMao(room, m);
  }

  function encerrarMao(room, m) {
    m.fase = 'showdown';
    m.vez = -1;
    m.corrida = 0;
    m.apostas = Array(LUGARES).fill(0);
    m.ate = Date.now() + ESPERA_FIM_MAO;
    m.vezDesde = Date.now();
  }

  // ------------------------------------------------------------------ o robô
  // força de 0 a ~1: as duas da mão no pré-flop; depois, o que a mão já faz com a mesa
  function forcaDoRobo(m, l) {
    if (!m.comunitarias.length) {
      const [a, b] = [...l.mao].sort((x, y) => y.n - x.n);
      if (a.n === b.n) return 0.55 + a.n / 30;
      return (a.n + b.n) / 40 + (a.s === b.s ? 0.06 : 0) + (a.n - b.n === 1 ? 0.04 : 0) - 0.15;
    }
    const av = R.avaliarMao([...l.mao, ...m.comunitarias]);
    return Math.min(1, av.forca / 4 + (av.tie?.[0] || 0) / 60);
  }

  function botPoker(room, m, k) {
    const l = m.lugares[k];
    const forca = forcaDoRobo(m, l) + (Math.random() - 0.5) * 0.15;
    const precisa = m.apostaAtual - m.apostas[k];
    const pote = totalApostado(m);
    const aumento = (fr) => m.apostaAtual + Math.max(BIG, m.ultimoAumento, Math.ceil(pote * fr));
    if (precisa <= 0) {
      // pode passar; com mão boa (ou blefando de vez em quando) aposta
      if (forca > 0.7 || Math.random() < 0.08) apostar(room, m, k, 'raise', aumento(forca > 0.9 ? 0.75 : 0.5));
      else apostar(room, m, k, 'check');
      return;
    }
    const custo = precisa / Math.max(1, pote + precisa);
    if (forca > 0.85 && m.apostaAtual < 60 && Math.random() < 0.5) apostar(room, m, k, 'raise', aumento(0.6));
    else if (forca > custo + 0.25 || (precisa <= BIG && Math.random() < 0.6)) apostar(room, m, k, 'call');
    else apostar(room, m, k, 'fold');
  }

  function ticPoker(room, m, agora) {
    if (m.fase === 'showdown') {
      if (agora < m.ate) return;
      // tira da mesa quem ficou sem moedas; nova mão se sobrarem 2+ (e alguém de verdade)
      for (const k of ocupados(m)) {
        const l = m.lugares[k];
        if (!l.bot && saldoDe(room, m, k) <= 0) {
          m.lugares[k] = null;
          const u = room.users.get(l.id);
          if (u) io.to(u.id).emit('pk-sem-moedas', { mesa: m.i });
        }
      }
      if (!humanos(m).length) return arrumarMesa(room, m);
      novaMao(room, m);
      return;
    }
    if (!emJogo(m)) return;
    if (m.corrida) {
      if (agora >= m.corrida) {
        proximaRua(room, m);
        avisar(room, m);
      }
      return;
    }
    if (m.vez < 0 || !m.lugares[m.vez]) return;
    if (!vezDeGente(m, m.vez)) {
      if (agora >= m.botAte) botPoker(room, m, m.vez);
    } else if (agora - m.vezDesde > ESPERA_GENTE) {
      apostar(room, m, m.vez, m.apostas[m.vez] === m.apostaAtual ? 'check' : 'fold');
    }
  }

  // ------------------------------------------------------------------ relógio
  setInterval(() => {
    if (!R) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      if (!room.poker) continue;
      DADOS.usar(room);
      for (const m of room.poker.mesas) {
        // quem foi embora da mesa
        const M = MESAS.MESAS_POKER[m.i];
        for (const l of [...m.lugares]) {
          if (!l || l.bot) continue;
          const p = ondeEsta(room.users.get(l.id));
          if (!jogoLigado(room, 'poker') || longeDemais(l, !p || Math.hypot(p.x - M.x, p.z - M.z) > 12)) sair(room, l.id);
        }
        ticPoker(room, m, agora);
      }
    }
  }, 250);

  // ------------------------------------------------------------------ recados de cada um
  return function porSocket(socket, quem) {
    const quemDaSala = comMapa(quem, DADOS);
    const daSala = () => {
      const { room, user } = quemDaSala();
      if (!room || !user || !R) return {};
      return { room, user, mesas: mesasDa(room).mesas };
    };
    const meuLugar = (m, user) => m.lugares.findIndex((l) => l && !l.bot && l.id === user.id);

    socket.on('pk-ver', (ack) => {
      const { room, mesas } = daSala();
      if (typeof ack === 'function') ack(mesas ? mesas.map((m) => publico(room, m)) : null);
      // quem chega de novo (reconexão) e ainda está numa mesa recebe a mão de volta
      for (const m of mesas || []) if (meuLugar(m, quemDaSala().user) >= 0) darCartas(quemDaSala().room, m);
    });

    socket.on('pk-sentar', (msg, ack) => {
      const responder = typeof ack === 'function' ? ack : () => {};
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || !jogoLigado(room, 'poker')) return responder({ erro: 'desligado' });
      if (meuLugar(m, user) >= 0) return responder({ ok: true, lugar: meuLugar(m, user) });
      if ((user.moedas ?? 0) <= 0) return responder({ erro: 'sem moedas' }); // quem está com 0 não senta
      const quer = msg?.lugar;
      if (Number.isInteger(quer)) {
        if (quer < 0 || quer >= m.lugares.length) return responder({ erro: 'cheia' });
        if (m.lugares[quer] && !m.lugares[quer].bot) return responder({ erro: 'ocupado' });
        // a cadeira do robô no meio de uma mão: ele está com cartas, espera a mão acabar
        if (m.lugares[quer]?.bot && emJogo(m) && m.lugares[quer].mao?.length && !m.lugares[quer].fold) return responder({ erro: 'robo jogando' });
      }
      sair(room, user.id);
      let k = Number.isInteger(quer) ? quer : m.lugares.findIndex((l) => !l);
      if (k < 0) k = m.lugares.findIndex((l) => l?.bot && !(emJogo(m) && l.mao?.length && !l.fold));
      if (k < 0) return responder({ erro: 'cheia' });
      // o robô que estava ali levanta (sem cartas na mão, não leva nada do pote)
      m.lugares[k] = { id: user.id, nome: user.name, bot: false, mao: [], fold: false, allIn: false, agiu: false, apostadoTotal: m.lugares[k]?.apostadoTotal || 0 };
      const n = ocupados(m).length;
      if (m.fase === 'espera') m.aviso = n >= 2 ? `${user.name} sentou: ${n} na mesa` : `${user.name} sentou: clique em Começar (os robôs completam a mesa)`;
      else m.aviso = `${user.name} sentou: entra na próxima mão`;
      avisar(room, m);
      responder({ ok: true, lugar: k });
    });

    socket.on('pk-comecar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || meuLugar(m, user) < 0 || m.fase !== 'espera') return;
      for (let k = 0; k < m.lugares.length && ocupados(m).length < ROBOS_ATE; k++) {
        if (!m.lugares[k]) m.lugares[k] = robo(m, k);
      }
      novaMao(room, m);
    });

    socket.on('pk-apostar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || !['fold', 'check', 'call', 'raise', 'allin'].includes(msg?.tipo)) return;
      if (Date.now() - (user.pkApostouEm || 0) < INTERVALO_APOSTA) return;
      if (apostar(room, m, k, msg.tipo, msg.valor)) user.pkApostouEm = Date.now();
    });

    socket.on('pk-empilhar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || Date.now() - (user.pkPilhaEm || 0) < INTERVALO_PILHA) return;
      user.pkPilhaEm = Date.now();
      m.empilhado = !!msg.empilhado;
      socket.to(room.id).emit('pk-empilhar', { mesa: m.i, empilhado: m.empilhado, por: user.name });
    });

    socket.on('pk-sair', () => {
      const { room, user } = daSala();
      if (room) sair(room, user.id);
    });

    socket.on('disconnect', () => {
      const { room, user } = quemDaSala();
      if (room?.poker && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarPoker };
