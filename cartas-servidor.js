// Truco e Uno (mesas de cartas do salão de jogos do parque): o servidor embaralha, dá as cartas,
// conduz a vez, confere cada jogada (public/js/cartas-regras.js) e joga pelos robôs que completam a
// mesa. Cada um recebe só a própria mão ('ct-mao'); o resto da mesa vai para todos ('ct-estado').
//
// Truco paulista: 4 lugares, em duplas (0 e 2 contra 1 e 3); quem não tem parceiro joga com um
// robô. Vira e manilhas, 3 rodadas por mão, truco/seis/nove/doze, mão de onze; 12 pontos ganha.
// Uno: até 6 lugares; bloqueio, inverter, +2, coringa e +4 (sem acumular); comprou e não serve,
// passa. Quem fica com uma carta tem uns segundos para dizer "UNO!", senão compra duas.

let R = null;
let MESAS = null;
Promise.all([import('./public/js/cartas-regras.js'), import('./public/js/parque-dados.js')])
  .then(([regras, dados]) => {
    R = regras;
    MESAS = dados.MESAS_CARTAS;
  })
  .catch((err) => console.warn('  Regras das cartas não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const LUGARES = { truco: 4, uno: 6 };
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico'];
const ESPERA_ROBO = 1300; // ms que o robô "pensa"
const ESPERA_GENTE = 45_000; // parado na vez: o robô joga por ele

const novaMesa = (i) => ({ i, jogo: MESAS[i].jogo, lugares: Array(LUGARES[MESAS[i].jogo]).fill(null), fase: 'espera', aviso: '', vencedor: null, ate: 0, botAte: 0, vezDesde: 0, t: null, u: null });
const mesasDa = (room) => (room.cartas ||= MESAS.map((_, i) => novaMesa(i)));
const timeDe = (lugar) => lugar % 2;
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
      pontos: t.pontos, vira: t.vira, vale: t.vale, pedido: t.pedido, podeAumentar: t.podeAumentar, mesaCartas: t.mesa, ultimaVaza: t.ultimaVaza,
      pausa: Math.max(0, t.pausaAte - Date.now()), rodadas: t.rodadas, vez: t.vez, dador: t.dador, maoDeOnze: t.maoDeOnze,
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
      const mao = m.t?.maos[k] || m.u?.maos[k] || [];
      io.to(l.id).emit('ct-mao', { mesa: m.i, lugar: k, mao });
    });
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
    t.vira = monte.pop();
    t.vale = 1;
    t.pedido = null;
    t.podeAumentar = null;
    t.rodadas = [];
    t.mesa = [];
    t.ultimaVaza = [];
    t.pausaAte = 0;
    t.inicio = (t.dador + 1) % 4;
    t.vez = t.inicio;
    t.maoDeOnze = null;
    t.ferro = t.pontos[0] === 11 && t.pontos[1] === 11; // mão de ferro: sem truco
    if (!t.ferro && (t.pontos[0] === 11 || t.pontos[1] === 11)) t.maoDeOnze = t.pontos[0] === 11 ? 0 : 1;
    m.fase = t.maoDeOnze !== null ? 'onze' : 'jogando';
    m.vencedor = null;
    m.aviso = t.maoDeOnze !== null ? `Mão de onze: ${t.maoDeOnze === 0 ? 'Nós' : 'Eles'} decidem se jogam (vale 3)` : '';
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 600;
    avisar(room, m);
  }

  function fimDaMao(room, m, time, motivo = '') {
    const t = m.t;
    t.pedido = null;
    if (time === 0 || time === 1) t.pontos[time] = Math.min(12, t.pontos[time] + t.vale);
    m.aviso = time === 'e' ? 'Mão empatada: ninguém marca' : `${time === 0 ? 'Nós' : 'Eles'} +${t.vale}${motivo ? ` (${motivo})` : ''}`;
    if (t.pontos[0] >= 12 || t.pontos[1] >= 12) {
      const v = t.pontos[0] >= 12 ? 0 : 1;
      m.fase = 'fim';
      m.vencedor = v;
      m.aviso = `${v === 0 ? 'Nós' : 'Eles'} ganharam o truco!`;
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

  // quem ganhou a mão pelas rodadas (0, 1, 'e' empate) ou null: continua
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

  function jogarTruco(room, m, k, carta) {
    const t = m.t;
    const mao = t.maos[k];
    const i = mao.indexOf(carta);
    if (i < 0) return false;
    mao.splice(i, 1);
    t.mesa.push({ lugar: k, carta });
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    if (t.mesa.length < 4) {
      t.vez = (t.vez + 1) % 4;
      avisar(room, m);
      return true;
    }
    // a rodada fechou: a carta mais forte leva (as duas mais fortes de times diferentes: empate)
    let melhor = -1;
    for (const j of t.mesa) melhor = Math.max(melhor, R.forcaTruco(j.carta, t.vira));
    const fortes = t.mesa.filter((j) => R.forcaTruco(j.carta, t.vira) === melhor);
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
    if (res !== 'e') t.inicio = fortes[0].lugar;
    t.vez = t.inicio;
    m.aviso = res === 'e' ? 'Rodada empatada' : `Rodada para ${res === 0 ? 'Nós' : 'Eles'}`;
    avisar(room, m);
    return true;
  }

  const proximoPedido = (v) => R.PASSOS_TRUCO[R.PASSOS_TRUCO.indexOf(v) + 1];
  const podePedir = (t, k) => !t.ferro && t.maoDeOnze === null && !t.pedido && t.vale < 12 && (t.podeAumentar === null || t.podeAumentar === timeDe(k));

  function pedirTruco(room, m, k) {
    const t = m.t;
    if (!podePedir(t, k) || t.vez !== k) return false;
    t.pedido = { valor: proximoPedido(t.vale), porTime: timeDe(k), de: k };
    m.aviso = `${m.lugares[k].nome}: ${R.NOME_PEDIDO[t.pedido.valor]}!`;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 400;
    avisar(room, m);
    return true;
  }

  function responder(room, m, k, resp) {
    const t = m.t;
    const p = t.pedido;
    if (!p || timeDe(k) === p.porTime) return false;
    const nome = m.lugares[k].nome;
    if (resp === 'correr') {
      fimDaMao(room, m, p.porTime, `${nome} correu`);
      return true;
    }
    if (resp === 'aumentar' && p.valor < 12) {
      t.vale = p.valor; // aumentar é aceitar o pedido e pedir mais
      t.pedido = { valor: proximoPedido(p.valor), porTime: timeDe(k), de: k };
      m.aviso = `${nome}: ${R.NOME_PEDIDO[t.pedido.valor]}!`;
    } else {
      t.vale = p.valor;
      t.pedido = null;
      t.podeAumentar = timeDe(k); // quem aceitou é quem pode aumentar depois
      m.aviso = `${nome} aceitou: a mão vale ${t.vale}`;
    }
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    avisar(room, m);
    return true;
  }

  function maoDeOnze(room, m, k, resp) {
    const t = m.t;
    if (m.fase !== 'onze' || timeDe(k) !== t.maoDeOnze) return false;
    if (resp === 'correr') {
      t.vale = 1;
      fimDaMao(room, m, 1 - t.maoDeOnze, 'correram da mão de onze');
      return true;
    }
    t.vale = 3;
    m.fase = 'jogando';
    m.aviso = 'Mão de onze: vale 3';
    m.vezDesde = Date.now();
    avisar(room, m);
    return true;
  }

  // --- o robô do truco
  const pesoTruco = (c, vira) => {
    const f = R.forcaTruco(c, vira);
    return f >= 100 ? 3 + (f - 100) * 0.4 : f >= 9 ? 2 : f >= 8 ? 1.5 : f >= 7 ? 1 : f >= 5 ? 0.5 : 0.1;
  };
  const forcaDaMao = (t, k) => t.maos[k].reduce((s, c) => s + pesoTruco(c, t.vira), 0) + t.rodadas.filter((r) => r === timeDe(k)).length * 1.5;

  function botTruco(room, m, k) {
    const t = m.t;
    const mao = [...t.maos[k]].sort((a, b) => R.forcaTruco(a, t.vira) - R.forcaTruco(b, t.vira));
    if (!mao.length) return;
    if (podePedir(t, k) && forcaDaMao(t, k) > 5.5 && Math.random() < 0.35) {
      pedirTruco(room, m, k);
      return;
    }
    let carta;
    if (!t.mesa.length) carta = t.rodadas.length === 0 && mao.length === 3 ? mao[1] : mao.at(-1);
    else {
      let melhor = -1;
      let dono = null;
      for (const j of t.mesa) {
        const f = R.forcaTruco(j.carta, t.vira);
        if (f > melhor) {
          melhor = f;
          dono = j.lugar;
        }
      }
      if (timeDe(dono) === timeDe(k)) carta = mao[0]; // o parceiro já está ganhando
      else carta = mao.find((c) => R.forcaTruco(c, t.vira) > melhor) || mao[0];
    }
    jogarTruco(room, m, k, carta);
  }

  function botResponde(room, m, k) {
    const t = m.t;
    const f = forcaDaMao(t, k) + (t.maos[(k + 2) % 4]?.length ? 1 : 0);
    if (f > 7 && t.pedido.valor < 12 && Math.random() < 0.3) responder(room, m, k, 'aumentar');
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
    if (m.fase === 'onze') {
      const time = t.maoDeOnze;
      const gente = [time, time + 2].some((k) => vezDeGente(m, k));
      if ((!gente && agora >= m.botAte) || agora - m.vezDesde > 25_000) {
        const k = time;
        const f = forcaDaMao(t, k) + forcaDaMao(t, k + 2);
        maoDeOnze(room, m, k, f > 6 ? 'jogar' : 'correr');
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
      for (const m of room.cartas || []) {
        // quem foi embora da mesa
        const M = MESAS[m.i];
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
  return function porSocket(socket, quem) {
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
        jogarTruco(room, m, k, msg.carta);
      } else {
        if (m.u.vez !== k) return;
        jogarUno(room, m, k, msg.carta, msg.cor);
      }
    });

    // truco: pedir (truco, seis...), responder (aceitar, correr, aumentar), mão de onze (jogar, correr)
    socket.on('ct-truco', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || m.jogo !== 'truco' || !m.t) return;
      if (msg.acao === 'pedir' && m.fase === 'jogando') pedirTruco(room, m, k);
      else if (['aceitar', 'correr', 'aumentar'].includes(msg.acao)) responder(room, m, k, msg.acao);
      else if (msg.acao === 'onze-jogar' || msg.acao === 'onze-correr') maoDeOnze(room, m, k, msg.acao === 'onze-jogar' ? 'jogar' : 'correr');
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
