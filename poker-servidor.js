// Poker Texas Hold'em (mesas do salão de jogos): o servidor embaralha, dá as cartas, conduz as
// apostas, confere o showdown (public/js/poker-regras.js) e joga pelos robôs que completam a mesa.
// Cada um recebe só a própria mão ('pk-mao'); o resto da mesa vai para a sala ('pk-mesa') com as
// mãos fechadas (abrem no showdown).
//
// CONTRATO DE EVENTOS (tudo com o prefixo pk-)
//   client -> server
//     'pk-sentar'  { mesa, lugar? }        senta na mesa (lugar 0..5; sem lugar, o primeiro livre).
//                                            ack({ ok, lugar } | { erro: 'cheia'|'ocupado'|'sem moedas'|'desligado' })
//     'pk-comecar' { mesa }                começa a partida (completa com robôs até 2+ jogadores)
//     'pk-apostar' { mesa, tipo, valor? }  ação na vez: tipo 'fold'|'check'|'call'|'raise'|'allin';
//                                            'raise' usa valor = aposta total desejada na rodada
//     'pk-sair'    { mesa }                levanta da mesa
//     'pk-ver'     (ack)                   ack com o estado público de todas as mesas
//   server -> sala (room.id): 'pk-mesa' { ...publico(m) }  a cada mudança de estado
//   server -> jogador (só o dono): 'pk-mao' { mesa, lugar, mao: [carta, carta] }  mão privada
//
// publico(m): { mesa, fase: 'espera'|'pre-flop'|'flop'|'turn'|'river'|'showdown', comunitarias,
//   pote, aviso, prazo, prazoTotal, resultado, lugares: [{ id, nome, robo, saldo, aposta, fold,
//   allIn, dealer, vez, mao }] } — mao é [2 cartas] só no showdown (ou null), o dono vê a sua em
//   'pk-mao'. dealer/vez são booleans por lugar.
//
// Regras da mesa: 6 lugares, Texas Hold'em sem limite. Small blind 1, big blind 2 (moedas do saldo
// real, debitadas na hora). Quem não tem o valor entra all-in automaticamente; quem está com 0 não
// senta. A rodada de apostas fecha quando os ativos igualam a maior aposta (ou vão all-in); flop,
// turn e river abrem as cartas comunitárias; no showdown a melhor mão de 5 entre as 7 leva o pote
// (split pot com side pots). Fim da mão: 8 s de espera e nova mão automática com 2+ na mesa.
// Robôs assumem o lugar de quem sai no meio da partida e jogam por quem trava na vez.
const path = require('path');
let R = null;
import('./public/js/poker-regras.js')
  .then((regras) => { R = regras; })
  .catch((err) => console.warn('  Regras de poker não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const LUGARES = 6;
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico', 'Robô Sol'];
const ESPERA_ROBO = 1400; // ms que o robô "pensa"
const ESPERA_GENTE = 40_000; // parado na vez: o robô joga por ele (check/fold)
const INTERVALO_APOSTA = 700; // anti-spam: ms mínimo entre duas apostas da mesma pessoa
const ESPERA_FIM_MAO = 8000; // espera entre mãos
const MESAS_FIXAS = [{ x: 20, z: 18 }, { x: 28, z: 18 }]; // posição no mapa (auto-sair por distância)

const novaMesa = (i) => ({
  i, jogo: 'poker', lugares: Array(LUGARES).fill(null), fase: 'espera',
  comunitarias: [], pote: 0, apostas: Array(LUGARES).fill(0), apostaAtual: 0,
  dealerIndex: -1, vez: -1, ate: 0, vezDesde: 0, botAte: 0, aviso: '', resultado: null,
});
const mesasDa = (room) => (room.poker ||= { mesas: MESAS_FIXAS.map((_, i) => novaMesa(i)) });
const longeDemais = (l, longe) => {
  if (!longe) { l.longeDesde = 0; return false; }
  l.longeDesde ||= Date.now();
  return Date.now() - l.longeDesde > 3000;
};

function ligarPoker(io, rooms, jogoLigado, darMoedas, cobrarSaldo) {
  const nomeDe = (m, k) => m.lugares[k]?.nome || '…';
  const humanos = (m) => m.lugares.filter((l) => l && !l.bot);
  const robo = (m, k) => ({ id: `robo-${m.i}-${k}`, nome: NOMES_ROBO[k % NOMES_ROBO.length], cor: '#94a3b8', bot: true, mao: [], fold: false, allIn: false, apostadoTotal: 0 });
  const vezDeGente = (m, k) => !!m.lugares[k] && !m.lugares[k].bot;
  // saldo real do lugar (robô sempre tem); lido do usuário, que o server.js mantém em user.moedas
  const saldoDe = (room, m, k) => {
    const l = m.lugares[k];
    if (!l) return 0;
    if (l.bot) return 1e9;
    return room.users.get(l.id)?.moedas ?? 0;
  };
  // débito/crédito no saldo real: preferindo o cobrarSaldo injetado (silencioso); sem ele, darMoedas
  // com valor negativo cai no mudarSaldo do server.js (server.js:461) e avisa a sala como os outros jogos
  const cobrar = (room, l, delta) => {
    const user = room.users.get(l.id);
    if (!user) return;
    if (cobrarSaldo) user.moedas = cobrarSaldo(user.name, delta);
    else darMoedas?.(io, room, user, delta, delta < 0 ? 'aposta no poker' : 'pote do poker');
  };
  const ativos = (m) => m.lugares.map((l, k) => (l && !l.fold ? k : -1)).filter((k) => k >= 0);
  // quem ainda decide nesta rodada: sem fold e sem all-in
  const decidindo = (m) => ativos(m).filter((k) => !m.lugares[k].allIn);
  const vivos = (m) => m.lugares.map((l, k) => (l ? k : -1)).filter((k) => k >= 0);
  const proximoAtivo = (m, de) => {
    const n = m.lugares.length;
    for (let s = 1; s <= n; s++) {
      const k = (de + s) % n;
      if (m.lugares[k] && !m.lugares[k].fold && !m.lugares[k].allIn) return k;
    }
    return -1;
  };

  // ------------------------------------------------------------------ o que vai para cada um
  function publico(m) {
    const espera = m.fase === 'showdown' ? ESPERA_FIM_MAO : ESPERA_GENTE;
    const abre = m.fase === 'showdown';
    return {
      mesa: m.i, jogo: 'poker', fase: m.fase, comunitarias: m.comunitarias, pote: m.pote,
      apostaAtual: m.apostaAtual, aviso: m.aviso, resultado: m.resultado,
      prazo: Math.max(0, m.vezDesde + espera - Date.now()), prazoTotal: espera,
      lugares: m.lugares.map((l, k) => (l ? {
        id: l.bot ? null : l.id, nome: l.nome, robo: !!l.bot,
        saldo: l.bot ? null : Math.round(Math.min(saldoDeDeFora(l), 1e9)),
        aposta: m.apostas[k] || 0, fold: !!l.fold, allIn: !!l.allIn,
        dealer: k === m.dealerIndex, vez: k === m.vez && m.fase !== 'espera' && m.fase !== 'showdown',
        mao: abre && l.mao?.length ? l.mao.map(R.rotulo) : null,
      } : null)),
    };
    function saldoDeFora(l) { return l._saldo ?? 0; } // preenchido em avisar()
  }

  function avisar(room, m) {
    // saldo atual de cada um (só gente) para o pacote público
    m.lugares.forEach((l, k) => { if (l) l._saldo = saldoDe(room, m, k); });
    io.to(room.id).emit('pk-mesa', publico(m));
    m.lugares.forEach((l, k) => {
      if (!l || l.bot || !l.mao?.length) return;
      io.to(l.id).emit('pk-mao', { mesa: m.i, lugar: k, mao: l.mao.map(R.rotulo) });
    });
  }

  // a mesa ficou sem gente: some com os robôs e espera
  function arrumarMesa(room, m) {
    if (!humanos(m).length) {
      m.lugares = m.lugares.map(() => null);
      m.fase = 'espera';
      m.comunitarias = [];
      m.pote = 0;
      m.apostaAtual = 0;
      m.apostas = Array(LUGARES).fill(0);
      m.vez = -1;
      m.aviso = '';
      m.resultado = null;
    }
    avisar(room, m);
  }

  function sair(room, id) {
    for (const m of room.poker?.mesas || []) {
      const k = m.lugares.findIndex((l) => l && !l.bot && l.id === id);
      if (k < 0) continue;
      // com a partida rolando, um robô assume as cartas e o dinheiro já apostado dele
      const l = m.lugares[k];
      m.lugares[k] = m.fase === 'espera' ? null : Object.assign(robo(m, k), { mao: l.mao, fold: l.fold, allIn: l.allIn, apostadoTotal: l.apostadoTotal });
      if (m.fase !== 'espera') m.aviso = `${room.users.get(id)?.name || 'Alguém'} saiu: um robô assumiu`;
      if (m.vez === k) passarVez(room, m, k);
      arrumarMesa(room, m);
    }
  }

  // ------------------------------------------------------------------ a mão
  function novaMao(room, m) {
    const jogando = vivos(m);
    if (jogando.length < 2) { m.fase = 'espera'; avisar(room, m); return; }
    const monte = R.embaralhar(R.novoBaralho());
    m.comunitarias = [];
    m.pote = 0;
    m.apostaAtual = 0;
    m.apostas = Array(LUGARES).fill(0);
    m.resultado = null;
    m.fase = 'pre-flop';
    for (const k of jogando) {
      const l = m.lugares[k];
      l.mao = [monte.pop(), monte.pop()];
      l.fold = false;
      l.allIn = false;
      l.apostadoTotal = 0;
    }
    m.monte = monte;
    // o botão anda; blinds logo à frente (heads-up: o botão é a small blind)
    const n = m.lugares.length;
    let d = (m.dealerIndex + 1) % n;
    while (!m.lugares[d]) d = (d + 1) % n;
    m.dealerIndex = d;
    const ordem = (de, passos) => { let k = de; for (let s = 0; s < passos; s++) k = proximoOcupado(m, k); return k; };
    const sb = ordem(d, 1);
    const bb = ordem(sb, 1);
    cobrarBlind(room, m, sb, 1);
    cobrarBlind(room, m, bb, 2);
    m.vez = ordem(bb, 1);
    m.aviso = `Small blind ${nomeDe(m, sb)} (1), big blind ${nomeDe(m, bb)} (2)`;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 600;
    avisar(room, m);
  }

  const proximoOcupado = (m, de) => {
    const n = m.lugares.length;
    for (let s = 1; s <= n; s++) {
      const k = (de + s) % n;
      if (m.lugares[k]) return k;
    }
    return de;
  };

  // cobra o blind do saldo real; sem o valor inteiro, entra all-in com o que tem
  function cobrarBlind(room, m, k, v) {
    const l = m.lugares[k];
    const pago = Math.min(v, saldoDe(room, m, k));
    if (pago > 0) cobrar(room, l, -pago);
    l.apostadoTotal = pago;
    m.apostas[k] = pago;
    m.apostaAtual = Math.max(m.apostaAtual, pago);
    if (saldoDe(room, m, k) <= 0 || l.apostadoTotal < v) l.allIn = true;
  }

  function passarVez(room, m, k) {
    m.vez = proximoAtivo(m, k);
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
  }

  // aposta o que der (até o pedido); all-in se ficar sem nada. Devolve o que entrou.
  function pôrFichas(room, m, k, pedido) {
    const l = m.lugares[k];
    const falta = Math.max(0, pedido - m.apostas[k]);
    const pago = Math.min(falta, saldoDe(room, m, k));
    if (pago > 0) {
      cobrar(room, l, -pago);
      l.apostadoTotal += pago;
      m.apostas[k] += pago;
      m.apostaAtual = Math.max(m.apostaAtual, m.apostas[k]);
    }
    if (saldoDe(room, m, k) <= 0) l.allIn = true;
    return pago;
  }

  function apostar(room, m, k, tipo, valor = 0) {
    if (m.fase === 'espera' || m.fase === 'showdown' || m.vez !== k) return false;
    const l = m.lugares[k];
    if (!l || l.fold || l.allIn) return false;
    const nome = nomeDe(m, k);
    if (tipo === 'fold') {
      l.fold = true;
      m.aviso = `${nome} desistiu`;
      if (!checarFim(room, m)) passarVez(room, m, k);
      avisar(room, m);
      return true;
    }
    if (tipo === 'check') {
      if (m.apostas[k] !== m.apostaAtual) return false;
      m.aviso = `${nome} passou`;
      passarVez(room, m, k);
      avisar(room, m);
      return true;
    }
    if (tipo === 'call') {
      const pago = pôrFichas(room, m, k, m.apostaAtual);
      m.aviso = l.allIn ? `${nome} vai all-in com ${pago}!` : `${nome} pagou ${pago}`;
      if (!checarFim(room, m)) passarVez(room, m, k);
      avisar(room, m);
      return true;
    }
    if (tipo === 'allin') {
      const antes = m.apostas[k];
      pôrFichas(room, m, k, m.apostas[k] + saldoDe(room, m, k)); // tudo que tem
      m.aviso = m.apostas[k] > antes ? `${nome} vai all-in: ${m.apostas[k]}!` : `${nome} está all-in`;
      if (!checarFim(room, m)) passarVez(room, m, k);
      avisar(room, m);
      return true;
    }
    if (tipo === 'raise') {
      valor = Math.floor(Number(valor) || 0);
      const minimo = m.apostaAtual + 1;
      if (valor < minimo) return false;
      pôrFichas(room, m, k, valor);
      m.aviso = l.allIn ? `${nome} all-in: ${m.apostas[k]}!` : `${nome} subiu para ${m.apostas[k]}`;
      if (!checarFim(room, m)) passarVez(room, m, k);
      avisar(room, m);
      return true;
    }
    return false;
  }

  // a rodada fechou (todos os ativos igualaram ou foram all-in)? Avança a fase.
  function rodadaFechada(m) {
    const ds = decidindo(m);
    if (!ds.length) return true; // só restaram all-ins e folds
    return ds.every((k) => m.apostas[k] === m.apostaAtual);
  }

  // fim antes do showdown (só um sem fold)? entrega o pote e encerra a mão
  function checarFim(room, m) {
    const restantes = ativos(m);
    if (restantes.length > 1) {
      if (rodadaFechada(m)) avancarFase(room, m);
      return false;
    }
    // um só leva tudo, sem mostrar as cartas
    const k = restantes[0];
    const pote = m.lugares.reduce((s, l) => s + (l?.apostadoTotal || 0), 0);
    m.pote = pote;
    if (k !== undefined) {
      const l = m.lugares[k];
      if (!l.bot) { const u = room.users.get(l.id); if (u) darMoedas?.(io, room, u, pote, 'pote do poker'); }
      m.aviso = `${nomeDe(m, k)} levou o pote (${pote})`;
      m.resultado = { vencedores: [{ lugar: k, nome: nomeDe(m, k), mao: 'sem showdown' }], pote };
    } else m.aviso = 'Mão encerrada';
    encerrarMao(room, m);
    return true;
  }

  function avancarFase(room, m) {
    // recolhe as apostas da rodada no pote
    m.pote = m.lugares.reduce((s, l) => s + (l?.apostadoTotal || 0), 0);
    m.apostas = Array(LUGARES).fill(0);
    m.apostaAtual = 0;
    if (m.fase === 'pre-flop') {
      m.comunitarias.push(m.monte.pop(), m.monte.pop(), m.monte.pop());
      m.fase = 'flop';
      m.aviso = 'Flop';
    } else if (m.fase === 'flop') {
      m.comunitarias.push(m.monte.pop());
      m.fase = 'turn';
      m.aviso = 'Turn';
    } else if (m.fase === 'turn') {
      m.comunitarias.push(m.monte.pop());
      m.fase = 'river';
      m.aviso = 'River';
    } else {
      showdown(room, m);
      return;
    }
    m.vez = proximoAtivo(m, m.dealerIndex);
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 500;
    avisar(room, m);
  }

  // side pots: ordena as contribuições e monta os níveis; cada pot só pode ir para quem pagou aquele nível
  function calcularPotes(m) {
    const contrib = m.lugares.map((l) => l?.apostadoTotal || 0);
    const pots = [];
    let nivel = 0;
    for (;;) {
      const restantes = contrib.map((c, k) => (c > nivel ? k : -1)).filter((k) => k >= 0);
      if (!restantes.length) break;
      const menor = Math.min(...restantes.map((k) => contrib[k]));
      const valor = contrib.reduce((s, c) => s + Math.max(0, Math.min(c, menor) - nivel), 0);
      nivel = menor;
      pots.push({ valor, elegiveis: contrib.map((c, k) => (c >= nivel && k >= 0 ? k : -1)).filter((k) => k >= 0) });
    }
    return pots;
  }

  function showdown(room, m) {
    m.fase = 'showdown';
    const naMao = ativos(m).filter((k) => m.lugares[k].mao?.length === 2);
    const vencedoresPorPot = [];
    const ganhadores = new Map(); // lugar -> total ganho
    for (const pot of calcularPotes(m)) {
      const candidatos = pot.elegiveis.filter((k) => naMao.includes(k));
      if (!candidatos.length) continue;
      const vs = R.vencedores(candidatos.map((k) => ({ id: k, cartas: m.lugares[k].mao })), m.comunitarias);
      const fatia = Math.floor(pot.valor / vs.length);
      for (const v of vs) {
        const k = Number(v.id);
        ganhadores.set(k, (ganhadores.get(k) || 0) + fatia);
      }
      vencedoresPorPot.push({ valor: pot.valor, vencedores: vs.map((v) => Number(v.id)) });
    }
    const partes = [];
    for (const [k, total] of ganhadores) {
      const l = m.lugares[k];
      if (l && !l.bot) { const u = room.users.get(l.id); if (u) darMoedas?.(io, room, u, total, 'pote do poker'); }
      partes.push(`${nomeDe(m, k)} (${total})`);
    }
    const avaliadas = naMao.map((k) => ({ k, a: R.avaliarMao([...m.lugares[k].mao, ...m.comunitarias]) }));
    m.resultado = {
      pote: m.pote,
      maos: avaliadas.map(({ k, a }) => ({ lugar: k, nome: nomeDe(m, k), mao: a.nome, cartas: a.cartas.map(R.rotulo) })),
      vencedores: [...ganhadores.entries()].map(([k, total]) => ({ lugar: k, nome: nomeDe(m, k), total })),
    };
    m.aviso = partes.length ? `Pote para ${partes.join(' e ')}` : 'Pote sem dono';
    encerrarMao(room, m);
  }

  function encerrarMao(room, m) {
    m.fase = 'showdown';
    m.vez = -1;
    m.ate = Date.now() + ESPERA_FIM_MAO;
    m.vezDesde = Date.now();
    avisar(room, m);
  }

  // ------------------------------------------------------------------ o robô
  const forcaDaMaoInicial = (mao) => {
    const [a, b] = [...mao].sort((x, y) => y.n - x.n);
    if (a.n === b.n) return 4 + a.n / 20; // par na mão
    const altas = (a.n >= 12 ? 1 : 0) + (b.n >= 10 ? 1 : 0);
    return a.n / 20 + b.n / 30 + altas * 0.6;
  };

  function botPoker(room, m, k) {
    const l = m.lugares[k];
    const forca = forcaDaMaoInicial(l.mao) + (m.comunitarias.length ? 1 : 0);
    const precisa = m.apostaAtual - m.apostas[k];
    const podeAllIn = saldoDe(room, m, k);
    if (precisa <= 0) {
      // pode passar; às vezes aposta para roubar o pote
      if (forca > 2.5 && Math.random() < 0.18) apostar(room, m, k, 'raise', m.apostaAtual + Math.max(2, Math.ceil(m.pote / 3)));
      else apostar(room, m, k, 'check');
      return;
    }
    if (forca > 2 && Math.random() < 0.12 && podeAllIn > precisa) {
      apostar(room, m, k, 'raise', m.apostaAtual + Math.max(2, Math.ceil(m.pote / 2)));
      return;
    }
    const custo = precisa / Math.max(1, m.pote + precisa);
    if (forca > 1.4 || Math.random() < 0.35 - custo) apostar(room, m, k, 'call');
    else apostar(room, m, k, 'fold');
  }

  function ticPoker(room, m, agora) {
    if (m.fase === 'showdown') {
      if (agora >= m.ate) {
        // tira da mesa quem ficou sem moedas; nova mão se sobrarem 2+
        for (const k of vivos(m)) {
          const l = m.lugares[k];
          if (!l.bot && saldoDe(room, m, k) <= 0) {
            m.aviso = `${l.nome} ficou sem moedas e saiu da mesa`;
            m.lugares[k] = null;
          }
        }
        m.resultado = null;
        novaMao(room, m);
      }
      return;
    }
    if (m.fase === 'espera') return;
    if (m.vez < 0 || !m.lugares[m.vez]) return;
    if (!vezDeGente(m, m.vez) ? agora >= m.botAte : agora - m.vezDesde > ESPERA_GENTE) {
      if (agora - m.vezDesde > ESPERA_GENTE) apostar(room, m, m.vez, m.apostas[m.vez] === m.apostaAtual ? 'check' : 'fold');
      else botPoker(room, m, m.vez);
    }
  }

  // ------------------------------------------------------------------ relógio
  setInterval(() => {
    if (!R) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      for (const m of room.poker?.mesas || []) {
        // quem foi embora da mesa
        const M = MESAS_FIXAS[m.i];
        for (const l of [...m.lugares]) {
          if (!l || l.bot) continue;
          const p = ondeEsta(room.users.get(l.id));
          if (!jogoLigado(room, m.jogo) || longeDemais(l, !p || Math.hypot(p.x - M.x, p.z - M.z) > 12)) sair(room, l.id);
        }
        ticPoker(room, m, agora);
      }
    }
  }, 250);

  // ------------------------------------------------------------------ recados de cada um
  return function porSocket(socket, quemDaSala) {
    const daSala = () => {
      const { room, user } = quemDaSala();
      if (!room || !user || !R) return {};
      return { room, user, mesas: mesasDa(room).mesas };
    };
    const meuLugar = (m, user) => m.lugares.findIndex((l) => l && !l.bot && l.id === user.id);

    socket.on('pk-ver', (ack) => {
      const { mesas } = daSala();
      ack?.(mesas ? mesas.map(publico) : null);
    });

    socket.on('pk-sentar', (msg, ack) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || !jogoLigado(room, m.jogo)) return ack?.({ erro: 'desligado' });
      if (meuLugar(m, user) >= 0) return ack?.({ ok: true, lugar: meuLugar(m, user) });
      if ((user.moedas ?? 0) <= 0) return ack?.({ erro: 'sem moedas' }); // quem está com 0 não senta
      sair(room, user.id);
      const quer = msg?.lugar;
      if (Number.isInteger(quer)) {
        if (quer < 0 || quer >= m.lugares.length) return ack?.({ erro: 'cheia' });
        if (m.lugares[quer] && !m.lugares[quer].bot) return ack?.({ erro: 'ocupado' });
      }
      let k = Number.isInteger(quer) && (!m.lugares[quer] || m.lugares[quer].bot)
        ? quer
        : m.lugares.findIndex((l) => !l);
      if (k < 0) k = m.lugares.findIndex((l) => l?.bot);
      if (k < 0) return ack?.({ erro: 'cheia' });
      m.lugares[k] = { id: user.id, nome: user.name, cor: user.color, bot: false, mao: [], fold: false, allIn: false, apostadoTotal: 0 };
      if (m.fase === 'espera') {
        const ocupados = vivos(m).length;
        m.aviso = ocupados >= 2 ? `${user.name} sentou: ${ocupados} na mesa` : `${user.name} sentou: esperando mais gente (mínimo 2)`;
      } else m.aviso = `${user.name} sentou`;
      avisar(room, m);
      ack?.({ ok: true, lugar: k });
    });

    socket.on('pk-comecar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || meuLugar(m, user) < 0 || (m.fase !== 'espera' && m.fase !== 'showdown')) return;
      // completa com robôs até 2+ jogadores
      let falta = 2 - vivos(m).length;
      for (let k = 0; k < m.lugares.length && falta > 0; k++) {
        if (!m.lugares[k]) { m.lugares[k] = robo(m, k); falta--; }
      }
      if (vivos(m).length < 2) return;
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

    socket.on('pk-sair', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m) return;
      sair(room, user.id);
    });

    socket.on('disconnect', () => {
      const { room, user } = quemDaSala();
      if (room?.poker && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarPoker };
