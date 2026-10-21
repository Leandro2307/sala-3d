// Truco e Uno (mesas de cartas do salão de jogos do parque): o servidor embaralha, dá as cartas,
// conduz a vez, confere cada jogada (public/js/cartas-regras.js) e joga pelos robôs que completam a
// mesa. Cada um recebe só a própria mão ('ct-mao'); o resto da mesa vai para todos ('ct-estado').
//
// Truco mineiro: 4 lugares, em duplas (0 e 2 contra 1 e 3); quem não tem parceiro joga com um
// robô. Baralho limpo (27 cartas: de Q a 3, mais 4♣, 7♥ e 7♦), manilhas fixas (zap, copas,
// espadilha e pica-fumo), 3 rodadas por mão; a mão vale 2, e o
// truco 4, o seis 8, o nove 10 e o doze 12 — cada pedido e cada resposta é um grito ('ct-grito')
// que a mesa ouve. Carta coberta da segunda rodada em diante, mão de dez (o time com 10 vê as
// cartas do parceiro e decide) e mão de ferro (10 a 10: ninguém vê as cartas); 12 pontos ganha.
// Os avisos falam das duplas como «0» e «1»: cada um lê "sua dupla" ou "a outra dupla" (cartas.js).
// Uno: até 6 lugares; bloqueio, inverter, +2, coringa e +4 (sem acumular); comprou e não serve,
// passa. Quem fica com uma carta tem uns segundos para dizer "UNO!", senão compra duas.
const { carregarPorMapa, comMapa } = require('./mapa-servidor.js');

let R = null;
let MESAS = null;
const DADOS = carregarPorMapa('parque-dados.js'); // um módulo por mapa (mapa-servidor.js)
Promise.all([import('./public/js/cartas-regras.js'), DADOS.pronto])
  .then(([regras, dados]) => {
    R = regras;
    MESAS = dados; // a ponte: as mesas do mapa em uso (MESAS.MESAS_CARTAS)
  })
  .catch((err) => console.warn('  Regras das cartas não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const LUGARES = { truco: 4, uno: 6 };
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico'];
const ESPERA_ROBO = 1300; // ms que o robô "pensa"
const ESPERA_GENTE = 45_000; // parado na vez: o robô joga por ele

const novaMesa = (i) => ({ i, jogo: MESAS.MESAS_CARTAS[i].jogo, lugares: Array(LUGARES[MESAS.MESAS_CARTAS[i].jogo]).fill(null), fase: 'espera', aviso: '', vencedor: null, ate: 0, botAte: 0, vezDesde: 0, t: null, u: null });
const mesasDa = (room) => (room.cartas ||= MESAS.MESAS_CARTAS.map((_, i) => novaMesa(i)));
const timeDe = (lugar) => lugar % 2;
const dupla = (time) => `«${time}»`;
// Pode pedir truco (ou o seguinte) agora? Não na mão de dez nem na de ferro, nem com um pedido no
// ar; depois de aceito, só quem aceitou sobe; e não se pede o que não muda nada (com o que a mão já
// vale, o time já chegaria aos 12).
const podeTrucar = (t, time) => !t.ferro && t.maoDeDez === null && !t.pedido && t.vale < 12
  && (t.podeAumentar === null || t.podeAumentar === time) && t.pontos[time] + t.vale < 12;
// responder subindo mais um: o mesmo limite, com o valor pedido (que quem responde já levaria)
const podeSubir = (t) => !!t.pedido && t.pedido.valor < 12 && t.pontos[1 - t.pedido.porTime] + t.pedido.valor < 12;
// a carta coberta não vale nada (nem empata)
const forcaNaMesa = (j) => (j.coberta ? -1 : R.forcaTruco(j.carta));
const tapada = (j) => (j.coberta ? { lugar: j.lugar, carta: 'verso', coberta: true } : j);
// longe da mesa há mais de 3 s (a posição que o servidor tem chega um tiquinho depois de um teleporte)
const longeDemais = (l, longe) => {
  if (!longe) {
    l.longeDesde = 0;
    return false;
  }
  l.longeDesde ||= Date.now();
  return Date.now() - l.longeDesde > 3000;
};

// ------------------------------------------------------------------ o que vai para cada um
function publico(m) {
  const base = {
    mesa: m.i, jogo: m.jogo, fase: m.fase, aviso: m.aviso, vencedor: m.vencedor,
    lugares: m.lugares.map((l, k) => (l ? { id: l.bot ? null : l.id, nome: l.nome, cor: l.cor, bot: !!l.bot, cartas: (m.t?.maos[k] || m.u?.maos[k] || []).length } : null)),
  };
  if (m.t) {
    const t = m.t;
    Object.assign(base, {
      pontos: t.pontos, vale: t.vale, pedido: t.pedido, mesaCartas: t.mesa.map(tapada), ultimaVaza: t.ultimaVaza.map(tapada),
      pausa: Math.max(0, t.pausaAte - Date.now()), rodadas: t.rodadas, vez: t.vez, dador: t.dador, maoDeDez: t.maoDeDez, ferro: t.ferro,
      trucar: [0, 1].map((time) => podeTrucar(t, time)), subir: podeSubir(t),
    });
  }
  if (m.u) {
    const u = m.u;
    Object.assign(base, { topo: u.descarte.at(-1), cor: u.cor, vez: u.vez, sentido: u.sentido, monte: u.monte.length, comprou: u.comprou, disseUno: [...u.disseUno] });
  }
  return base;
}

function ligarCartas(io, rooms, jogoLigado, darMoedas) {
  function avisar(room, m) {
    io.to(room.id).emit('ct-estado', publico(m));
    m.lugares.forEach((l, k) => {
      if (!l || l.bot) return;
      const t = m.t;
      let mao = t?.maos[k] || m.u?.maos[k] || [];
      const extra = {};
      if (t?.ferro) mao = mao.map(() => 'verso'); // mão de ferro: nem o dono vê
      if (t && m.fase === 'dez' && timeDe(k) === t.maoDeDez) extra.parceiro = t.maos[(k + 2) % 4];
      io.to(l.id).emit('ct-mao', { mesa: m.i, lugar: k, mao, ...extra });
    });
  }

  // o grito vai para a sala toda: quem está perto da mesa ouve (cartas.js decide pela distância)
  function gritar(room, m, k, tipo) {
    const frases = R.GRITOS[tipo];
    if (!frases) return;
    const frase = frases[Math.floor(Math.random() * frases.length)];
    io.to(room.id).emit('ct-grito', { mesa: m.i, lugar: k, tipo, nome: m.lugares[k]?.nome || '', frase });
  }
  const humanos = (m) => m.lugares.filter((l) => l && !l.bot);
  const robo = (m, k) => ({ id: `robo-${m.i}-${k}`, nome: NOMES_ROBO[k % NOMES_ROBO.length], cor: '#94a3b8', bot: true });
  const vezDeGente = (m, k) => !!m.lugares[k] && !m.lugares[k].bot;

  // a mesa ficou sem gente: some com os robôs e espera
  function arrumarMesa(room, m) {
    if (!humanos(m).length) {
      m.lugares = m.lugares.map(() => null);
      m.fase = 'espera';
      m.t = m.u = null;
      m.aviso = '';
      m.vencedor = null;
    }
    avisar(room, m);
  }

  function sair(room, id) {
    for (const m of room.cartas || []) {
      const k = m.lugares.findIndex((l) => l && !l.bot && l.id === id);
      if (k < 0) continue;
      // com a partida rolando, um robô assume as cartas dele
      m.lugares[k] = m.fase === 'espera' ? null : robo(m, k);
      if (m.fase !== 'espera') m.aviso = `${room.users.get(id)?.name || 'Alguém'} saiu: um robô assumiu`;
      arrumarMesa(room, m);
    }
  }

  function comecar(room, m) {
    if (m.jogo === 'truco') {
      for (let k = 0; k < 4; k++) if (!m.lugares[k]) m.lugares[k] = robo(m, k);
      m.t = { pontos: [0, 0], dador: Math.floor(Math.random() * 4) };
      novaMaoTruco(room, m);
    } else {
      // uno: no mínimo 3 na mesa (completa com robôs)
      let falta = 3 - m.lugares.filter(Boolean).length;
      for (let k = 0; k < m.lugares.length && falta > 0; k++) {
        if (!m.lugares[k]) {
          m.lugares[k] = robo(m, k);
          falta--;
        }
      }
      novaRodadaUno(room, m);
    }
  }

  // ------------------------------------------------------------------ truco
  function novaMaoTruco(room, m) {
    const t = m.t;
    const monte = R.embaralhar(R.baralhoTruco());
    t.maos = [0, 1, 2, 3].map(() => [monte.pop(), monte.pop(), monte.pop()]);
    t.vale = R.PASSOS_TRUCO[0];
    t.pedido = null;
    t.podeAumentar = null;
    t.rodadas = [];
    t.mesa = [];
    t.ultimaVaza = [];
    t.pausaAte = 0;
    t.inicio = (t.dador + 1) % 4;
    t.vez = t.inicio;
    // mão de ferro: 10 a 10, ninguém vê as cartas (cada um vira a de cima) e não tem truco
    t.ferro = t.pontos[0] === 10 && t.pontos[1] === 10;
    // mão de dez: o time com 10 olha as cartas do parceiro e decide se joga (vale 4) ou corre (dá 2)
    t.maoDeDez = !t.ferro && (t.pontos[0] === 10 || t.pontos[1] === 10) ? (t.pontos[0] === 10 ? 0 : 1) : null;
    m.fase = t.maoDeDez !== null ? 'dez' : 'jogando';
    m.vencedor = null;
    m.aviso = t.maoDeDez !== null ? `Mão de dez: ${dupla(t.maoDeDez)} vê as cartas do parceiro e decide (vale ${R.VALE_DEZ})`
      : t.ferro ? 'Mão de ferro: ninguém vê as cartas, cada um vira a de cima' : '';
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 600;
    avisar(room, m);
  }

  function fimDaMao(room, m, time, motivo = '') {
    const t = m.t;
    t.pedido = null;
    if (time === 0 || time === 1) t.pontos[time] = Math.min(12, t.pontos[time] + t.vale);
    m.aviso = time === 'e' ? 'Mão empatada: ninguém marca' : `${dupla(time)} +${t.vale}${motivo ? ` (${motivo})` : ''}`;
    if (t.pontos[0] >= 12 || t.pontos[1] >= 12) {
      const v = t.pontos[0] >= 12 ? 0 : 1;
      m.fase = 'fim';
      m.vencedor = v;
      m.aviso = `${dupla(v)} ganhou o truco!`;
      m.ate = Date.now() + 9000;
      const contraGente = m.lugares.some((l, k) => l && !l.bot && timeDe(k) !== v);
      m.lugares.forEach((l, k) => {
        if (!l || l.bot || timeDe(k) !== v) return;
        const u = room.users.get(l.id);
        if (u) darMoedas?.(room, u, contraGente ? 40 : 15, 'vitória no truco');
      });
    } else {
      m.fase = 'fimDaMao';
      m.ate = Date.now() + 3200;
    }
    avisar(room, m);
  }

  // quem ganhou a mão pelas rodadas (0, 1, 'e' empate) ou null: continua. Rodada empatada: leva a
  // mão quem ganhou a primeira que não empatou; as três empatadas, ninguém marca.
  function decideMao(r) {
    const v0 = r.filter((x) => x === 0).length;
    const v1 = r.filter((x) => x === 1).length;
    if (v0 >= 2) return 0;
    if (v1 >= 2) return 1;
    if (r.length >= 2) {
      if (r[0] === 'e' && r[1] !== 'e') return r[1];
      if (r[0] !== 'e' && r[1] === 'e') return r[0];
    }
    if (r.length === 3) {
      if (r[2] === 'e') return r[0] !== 'e' ? r[0] : r[1] !== 'e' ? r[1] : 'e';
      return r[2];
    }
    return null;
  }

  // coberta: virada para baixo, só da segunda rodada em diante (e nunca ganha). Na mão de ferro
  // ninguém sabe o que tem: sai a carta de cima, seja qual for a que veio.
  function jogarTruco(room, m, k, carta, coberta = false) {
    const t = m.t;
    const mao = t.maos[k];
    const i = t.ferro ? 0 : mao.indexOf(carta);
    if (i < 0 || !mao.length) return false;
    carta = mao[i];
    coberta = !!coberta && !t.ferro && t.rodadas.length > 0;
    mao.splice(i, 1);
    t.mesa.push({ lugar: k, carta, coberta });
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    if (coberta) m.aviso = `${m.lugares[k].nome} jogou coberta`;
    if (t.mesa.length < 4) {
      t.vez = (t.vez + 1) % 4;
      avisar(room, m);
      return true;
    }
    // a rodada fechou: a carta mais forte leva (as duas mais fortes de times diferentes: empate)
    let melhor = -1;
    for (const j of t.mesa) melhor = Math.max(melhor, forcaNaMesa(j));
    const fortes = t.mesa.filter((j) => forcaNaMesa(j) === melhor);
    const times = new Set(fortes.map((j) => timeDe(j.lugar)));
    const res = times.size > 1 ? 'e' : timeDe(fortes[0].lugar);
    t.rodadas.push(res);
    t.ultimaVaza = t.mesa;
    t.mesa = [];
    t.pausaAte = Date.now() + 1600;
    m.botAte = t.pausaAte + 500;
    const fim = decideMao(t.rodadas);
    if (fim !== null) {
      fimDaMao(room, m, fim);
      return true;
    }
    // quem fez a rodada começa a próxima; no empate, quem pôs a primeira das cartas que empataram
    t.inicio = fortes[0].lugar;
    t.vez = t.inicio;
    m.aviso = res === 'e' ? 'Rodada empatada' : `Rodada para ${dupla(res)}`;
    avisar(room, m);
    return true;
  }

  const proximoPedido = (v) => R.PASSOS_TRUCO[R.PASSOS_TRUCO.indexOf(v) + 1];

  function pedirTruco(room, m, k) {
    const t = m.t;
    if (m.fase !== 'jogando' || t.vez !== k || !podeTrucar(t, timeDe(k))) return false;
    t.pedido = { valor: proximoPedido(t.vale), porTime: timeDe(k), de: k };
    m.aviso = `${m.lugares[k].nome}: ${R.NOME_PEDIDO[t.pedido.valor]}!`;
    gritar(room, m, k, R.GRITO_DO_PEDIDO[t.pedido.valor]);
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 900; // dá tempo do grito
    avisar(room, m);
    return true;
  }

  function responder(room, m, k, resp) {
    const t = m.t;
    const p = t.pedido;
    if (!p || timeDe(k) === p.porTime) return false;
    const nome = m.lugares[k].nome;
    if (resp === 'correr') {
      gritar(room, m, k, 'corro');
      fimDaMao(room, m, p.porTime, `${nome} correu`);
      return true;
    }
    if (resp === 'aumentar') {
      if (!podeSubir(t)) return false;
      t.vale = p.valor; // aumentar é aceitar o pedido e pedir mais
      t.pedido = { valor: proximoPedido(p.valor), porTime: timeDe(k), de: k };
      m.aviso = `${nome}: ${R.NOME_PEDIDO[t.pedido.valor]}!`;
      gritar(room, m, k, R.GRITO_DO_PEDIDO[t.pedido.valor]);
    } else {
      t.vale = p.valor;
      t.pedido = null;
      t.podeAumentar = timeDe(k); // quem aceitou é quem pode aumentar depois
      m.aviso = `${nome} aceitou: a mão vale ${t.vale}`;
      gritar(room, m, k, 'aceito');
    }
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 600;
    avisar(room, m);
    return true;
  }

  function maoDeDez(room, m, k, resp) {
    const t = m.t;
    if (m.fase !== 'dez' || timeDe(k) !== t.maoDeDez) return false;
    if (resp === 'correr') {
      t.vale = R.PASSOS_TRUCO[0];
      gritar(room, m, k, 'dezCorro');
      fimDaMao(room, m, 1 - t.maoDeDez, 'correram da mão de dez');
      return true;
    }
    t.vale = R.VALE_DEZ;
    m.fase = 'jogando';
    m.aviso = `Mão de dez: vale ${R.VALE_DEZ}`;
    gritar(room, m, k, 'dez');
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    avisar(room, m);
    return true;
  }

  // --- o robô do truco
  const pesoTruco = (c) => {
    const f = R.forcaTruco(c);
    return f >= 100 ? 3 + (f - 100) * 0.4 : f >= 5 ? 2 : f >= 4 ? 1.5 : f >= 3 ? 1 : f >= 1 ? 0.5 : 0.1; // manilha, 3, 2, A, K/J, Q
  };
  const forcaDaMao = (t, k) => t.maos[k].reduce((s, c) => s + pesoTruco(c), 0) + t.rodadas.filter((r) => r === timeDe(k)).length * 1.5;

  function botTruco(room, m, k) {
    const t = m.t;
    if (!t.maos[k].length) return;
    if (t.ferro) {
      jogarTruco(room, m, k, null);
      return;
    }
    const mao = [...t.maos[k]].sort((a, b) => R.forcaTruco(a) - R.forcaTruco(b));
    // pede com a mão boa, e de vez em quando no blefe
    if (podeTrucar(t, timeDe(k)) && ((forcaDaMao(t, k) > 5.5 && Math.random() < 0.35) || Math.random() < 0.05)) {
      pedirTruco(room, m, k);
      return;
    }
    let carta;
    let coberta = false;
    if (!t.mesa.length) carta = t.rodadas.length === 0 && mao.length === 3 ? mao[1] : mao.at(-1);
    else {
      let melhor = -1;
      let dono = null;
      for (const j of t.mesa) {
        const f = forcaNaMesa(j);
        if (f > melhor) {
          melhor = f;
          dono = j.lugar;
        }
      }
      if (dono !== null && timeDe(dono) === timeDe(k)) carta = mao[0]; // o parceiro já está ganhando
      else {
        const ganha = mao.find((c) => R.forcaTruco(c) > melhor);
        carta = ganha || mao[0];
        // não dá para ganhar: às vezes esconde o que tinha
        coberta = !ganha && t.rodadas.length > 0 && Math.random() < 0.5;
      }
    }
    jogarTruco(room, m, k, carta, coberta);
  }

  function botResponde(room, m, k) {
    const t = m.t;
    const f = forcaDaMao(t, k) + (t.maos[(k + 2) % 4]?.length ? 1 : 0);
    if (f > 7 && podeSubir(t) && Math.random() < 0.3) responder(room, m, k, 'aumentar');
    else if (f > 3.2 + t.pedido.valor * 0.15) responder(room, m, k, 'aceitar');
    else responder(room, m, k, 'correr');
  }

  // a vez de quem é agora (quem tem que agir), no truco
  function ticTruco(room, m, agora) {
    const t = m.t;
    if (m.fase === 'fimDaMao') {
      if (agora < m.ate) return;
      t.dador = (t.dador + 1) % 4;
      novaMaoTruco(room, m);
      return;
    }
    if (agora < t.pausaAte) return;
    if (m.fase === 'dez') {
      const time = t.maoDeDez;
      const gente = [time, time + 2].some((k) => vezDeGente(m, k));
      if ((!gente && agora >= m.botAte) || agora - m.vezDesde > 25_000) {
        const f = forcaDaMao(t, time) + forcaDaMao(t, time + 2);
        maoDeDez(room, m, time, f > 6 ? 'jogar' : 'correr');
      }
      return;
    }
    if (t.pedido) {
      const oponentes = [0, 1, 2, 3].filter((k) => timeDe(k) !== t.pedido.porTime);
      const gente = oponentes.some((k) => vezDeGente(m, k));
      if (!gente && agora >= m.botAte) botResponde(room, m, oponentes.find((k) => k === (t.pedido.de + 1) % 4) ?? oponentes[0]);
      else if (gente && agora - m.vezDesde > 25_000) responder(room, m, oponentes.find((k) => vezDeGente(m, k)), 'aceitar');
      return;
    }
    if (m.fase !== 'jogando') return;
    if (!vezDeGente(m, t.vez) ? agora >= m.botAte : agora - m.vezDesde > ESPERA_GENTE) botTruco(room, m, t.vez);
  }

  // ------------------------------------------------------------------ uno
  function novaRodadaUno(room, m) {
    const monte = R.embaralhar(R.baralhoUno());
    const maos = m.lugares.map((l) => (l ? monte.splice(0, 7) : []));
    // a primeira carta da mesa é um número
    const k = monte.findIndex((c) => /^[rgby]\d$/.test(c));
    const topo = monte.splice(k, 1)[0];
    const vivos = m.lugares.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    m.u = { maos, monte, descarte: [topo], cor: R.corUno(topo), vez: vivos[Math.floor(Math.random() * vivos.length)], sentido: 1, comprou: false, disseUno: new Set(), unoAte: new Map() };
    m.fase = 'jogando';
    m.vencedor = null;
    m.aviso = '';
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 500;
    avisar(room, m);
  }

  // o próximo lugar ocupado, no sentido da mesa
  function proximo(m, de, passos = 1) {
    let k = de;
    const n = m.lugares.length;
    for (let p = 0; p < passos; p++) {
      for (let s = 0; s < n; s++) {
        k = (k + m.u.sentido + n) % n;
        if (m.lugares[k]) break;
      }
    }
    return k;
  }

  function comprarUno(m, k, n) {
    const u = m.u;
    for (let i = 0; i < n; i++) {
      if (!u.monte.length) {
        // o monte acabou: o descarte (menos o de cima) vira monte de novo
        const topo = u.descarte.pop();
        u.monte = R.embaralhar(u.descarte);
        u.descarte = [topo];
        if (!u.monte.length) break;
      }
      u.maos[k].push(u.monte.pop());
    }
    if (u.maos[k].length > 1) {
      u.disseUno.delete(k);
      u.unoAte.delete(k);
    }
  }

  function passarVez(m, pula = false) {
    const u = m.u;
    u.vez = proximo(m, u.vez, pula ? 2 : 1);
    u.comprou = false;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
  }

  function jogarUno(room, m, k, carta, cor) {
    const u = m.u;
    const mao = u.maos[k];
    const i = mao.indexOf(carta);
    if (i < 0 || !R.podeJogarUno(carta, u.descarte.at(-1), u.cor)) return false;
    if (R.coringa(carta) && !R.CORES_UNO.includes(cor)) return false;
    mao.splice(i, 1);
    u.descarte.push(carta);
    u.cor = R.coringa(carta) ? cor : R.corUno(carta);
    const nome = m.lugares[k].nome;
    const s = R.simboloUno(carta);
    m.aviso = '';
    if (!mao.length) {
      m.fase = 'fim';
      m.vencedor = k;
      m.aviso = `${nome} ganhou o Uno!`;
      m.ate = Date.now() + 7000;
      const l = m.lugares[k];
      if (!l.bot) {
        const u2 = room.users.get(l.id);
        const contraGente = humanos(m).length > 1;
        if (u2) darMoedas?.(room, u2, contraGente ? 25 : 10, 'vitória no uno');
      }
      avisar(room, m);
      return true;
    }
    // uma carta só: tem uns segundos para dizer UNO (o robô sempre diz)
    if (mao.length === 1 && !u.disseUno.has(k)) {
      if (m.lugares[k].bot) u.disseUno.add(k);
      else u.unoAte.set(k, Date.now() + 3500);
    }
    if (u.disseUno.has(k) && mao.length === 1) m.aviso = `${nome}: UNO!`;
    const dois = m.lugares.filter(Boolean).length === 2;
    if (s === 'I') {
      u.sentido *= -1;
      if (dois) {
        passarVez(m, true);
        m.aviso ||= `${nome} inverteu (joga de novo)`;
      } else {
        passarVez(m);
        m.aviso ||= `${nome} inverteu o sentido`;
      }
    } else if (s === 'B') {
      const alvo = proximo(m, k);
      m.aviso ||= `${m.lugares[alvo].nome} foi bloqueado`;
      passarVez(m, true);
    } else if (s === 'P2' || s === 'W4') {
      const alvo = proximo(m, k);
      const n = s === 'P2' ? 2 : 4;
      comprarUno(m, alvo, n);
      m.aviso ||= `${m.lugares[alvo].nome} compra ${n} e passa a vez`;
      passarVez(m, true);
    } else {
      passarVez(m);
      if (R.coringa(carta)) m.aviso ||= `${nome} escolheu ${R.NOME_COR[cor]}`;
    }
    avisar(room, m);
    return true;
  }

  // o robô do uno: a da mesma cor primeiro, depois o mesmo símbolo, coringa por último
  function botUno(room, m, k) {
    const u = m.u;
    const mao = u.maos[k];
    const topo = u.descarte.at(-1);
    const validas = mao.filter((c) => R.podeJogarUno(c, topo, u.cor));
    const ordem = (c) => (R.coringa(c) ? (c === 'W4' ? 3 : 2) : R.corUno(c) === u.cor ? 0 : 1);
    validas.sort((a, b) => ordem(a) - ordem(b));
    const melhorCor = () => {
      const conta = {};
      for (const c of mao) if (!R.coringa(c)) conta[R.corUno(c)] = (conta[R.corUno(c)] || 0) + 1;
      return Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || R.CORES_UNO[Math.floor(Math.random() * 4)];
    };
    if (validas.length) {
      jogarUno(room, m, k, validas[0], melhorCor());
      return;
    }
    if (!u.comprou) {
      comprarUno(m, k, 1);
      u.comprou = true;
      const nova = mao.at(-1);
      if (R.podeJogarUno(nova, topo, u.cor)) {
        jogarUno(room, m, k, nova, melhorCor());
        return;
      }
    }
    m.aviso = `${m.lugares[k].nome} comprou e passou`;
    passarVez(m);
    avisar(room, m);
  }

  function ticUno(room, m, agora) {
    const u = m.u;
    // não disse UNO a tempo: compra duas
    for (const [k, ate] of [...u.unoAte]) {
      if (agora < ate) continue;
      u.unoAte.delete(k);
      if (u.maos[k]?.length === 1 && !u.disseUno.has(k)) {
        comprarUno(m, k, 2);
        m.aviso = `${m.lugares[k]?.nome || ''} esqueceu o UNO: +2`;
        avisar(room, m);
      }
    }
    if (m.fase !== 'jogando') return;
    if (!vezDeGente(m, u.vez) ? agora >= m.botAte : agora - m.vezDesde > ESPERA_GENTE) botUno(room, m, u.vez);
  }

  // ------------------------------------------------------------------ relógio
  setInterval(() => {
    if (!R) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      DADOS.usar(room);
      for (const m of room.cartas || []) {
        // quem foi embora da mesa
        const M = MESAS.MESAS_CARTAS[m.i];
        for (const l of [...m.lugares]) {
          if (!l || l.bot) continue;
          const p = ondeEsta(room.users.get(l.id));
          if (!jogoLigado(room, m.jogo) || longeDemais(l, !p || Math.hypot(p.x - M.x, p.z - M.z) > 12)) sair(room, l.id);
        }
        if (m.fase === 'espera') continue;
        if (m.fase === 'fim') {
          if (agora >= m.ate) {
            if (m.jogo === 'truco') {
              m.t.pontos = [0, 0];
              novaMaoTruco(room, m);
            } else novaRodadaUno(room, m);
          }
          continue;
        }
        if (m.jogo === 'truco') ticTruco(room, m, agora);
        else ticUno(room, m, agora);
      }
    }
  }, 250);

  // ------------------------------------------------------------------ recados de cada um
  return function porSocket(socket, quemDaSala) {
    const quem = comMapa(quemDaSala, DADOS);
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !R) return {};
      return { room, user, mesas: mesasDa(room) };
    };
    const meuLugar = (m, user) => m.lugares.findIndex((l) => l && !l.bot && l.id === user.id);

    socket.on('ct-ver', (ack) => {
      const { mesas } = daSala();
      ack?.(mesas ? mesas.map(publico) : null);
    });

    // sentar: no primeiro lugar livre (ou no de um robô, que sai e deixa as cartas)
    socket.on('ct-entrar', (msg, ack) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || !jogoLigado(room, m.jogo)) return ack?.({ erro: 'desligado' });
      if (meuLugar(m, user) >= 0) return ack?.({ ok: true, lugar: meuLugar(m, user) });
      sair(room, user.id);
      let k = m.lugares.findIndex((l) => !l);
      if (k < 0) k = m.lugares.findIndex((l) => l?.bot);
      if (k < 0) return ack?.({ erro: 'cheia' });
      m.lugares[k] = { id: user.id, nome: user.name, cor: user.color, bot: false };
      if (m.fase !== 'espera') m.aviso = `${user.name} sentou`;
      // no uno, chegou com a rodada valendo num lugar vazio: recebe as 7 cartas do monte
      if (m.u && m.fase === 'jogando' && !m.u.maos[k]?.length) {
        m.u.maos[k] = [];
        comprarUno(m, k, 7);
      }
      avisar(room, m);
      ack?.({ ok: true, lugar: k });
    });

    socket.on('ct-sair', () => {
      const { room, user } = quem();
      if (room?.cartas && user) sair(room, user.id);
    });

    socket.on('ct-comecar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || meuLugar(m, user) < 0 || (m.fase !== 'espera' && m.fase !== 'fim')) return;
      comecar(room, m);
    });

    socket.on('ct-jogar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || m.fase !== 'jogando' || typeof msg?.carta !== 'string') return;
      if (m.jogo === 'truco') {
        if (m.t.vez !== k || m.t.pedido || Date.now() < m.t.pausaAte) return;
        jogarTruco(room, m, k, msg.carta, msg.coberta === true);
      } else {
        if (m.u.vez !== k) return;
        jogarUno(room, m, k, msg.carta, msg.cor);
      }
    });

    // truco: pedir (truco, seis...), responder (aceitar, correr, aumentar), mão de dez (jogar, correr)
    socket.on('ct-truco', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || m.jogo !== 'truco' || !m.t) return;
      if (msg.acao === 'pedir') pedirTruco(room, m, k);
      else if (['aceitar', 'correr', 'aumentar'].includes(msg.acao)) responder(room, m, k, msg.acao);
      else if (msg.acao === 'dez-jogar' || msg.acao === 'dez-correr') maoDeDez(room, m, k, msg.acao === 'dez-jogar' ? 'jogar' : 'correr');
    });

    // uno: comprar, passar (depois de comprar), dizer UNO
    socket.on('ct-uno', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || m.jogo !== 'uno' || !m.u || m.fase !== 'jogando') return;
      const u = m.u;
      if (msg.acao === 'uno') {
        if (u.maos[k].length <= 2) {
          u.disseUno.add(k);
          u.unoAte.delete(k);
          m.aviso = `${m.lugares[k].nome}: UNO!`;
          avisar(room, m);
        }
        return;
      }
      if (u.vez !== k) return;
      if (msg.acao === 'comprar' && !u.comprou) {
        comprarUno(m, k, 1);
        u.comprou = true;
        // o que comprou não serve: passa sozinho
        if (!R.podeJogarUno(u.maos[k].at(-1), u.descarte.at(-1), u.cor)) {
          m.aviso = `${m.lugares[k].nome} comprou e passou`;
          passarVez(m);
        }
        avisar(room, m);
      } else if (msg.acao === 'passar' && u.comprou) {
        passarVez(m);
        avisar(room, m);
      }
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.cartas && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarCartas };
