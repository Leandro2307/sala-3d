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
//
// Nas duas mesas: zoeira ('ct-zoar', as frases de ZOEIRA, gritadas como os pedidos) e, de
// brincadeira, tapa e tiro ('ct-acao') e arremesso de tomate, galinha e afins ('ct-arremesso') em
// quem está sentado, gente ou robô — o robô reclama. No truco, o sinal ('ct-sinal') é um cochicho
// que só o parceiro recebe. Os robôs soltam zoeira aleatória no meio do jogo e o robô parceiro
// manda sinal combinando com a mão dele.
// Uno: até 6 lugares; bloqueio, inverter, +2, coringa e +4 (sem acumular); comprou e não serve,
// passa. Quem fica com uma carta tem uns segundos para dizer "UNO!", senão compra duas.
// 21: dois lugares, um contra o outro (o do jogo 21 original): 11 cartas de 1 a 11, a primeira de
// cada um fechada, trunfos (TRUNFOS_21) e a aposta em dedos; 5 dedos cada, quem fica sem perde.
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
const LUGARES = { truco: 4, uno: 6, vinteum: 2 };
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico'];
const ESPERA_ROBO = 1300; // ms que o robô "pensa"
const ESPERA_GENTE = 45_000; // parado na vez: o robô joga por ele
const ESPERA_RESPOSTA = 25_000; // sem responder o truco (ou decidir a mão de dez): aceita por ele
const INTERVALO_ACAO = { tapa: 500, tiro: 2500 }; // ms entre dois tapas (tiros) da mesma pessoa
const INTERVALO_ZOEIRA = 2500;
const INTERVALO_SINAL = 1500; // ms entre dois sinais da mesma pessoa (só o parceiro recebe)
const INTERVALO_ARREMESSO = 1200; // ms entre dois arremessos da mesma pessoa
const RESENHA_INTERVALO = 20000; // no mínimo isso entre duas zoeiras aleatórias na mesma mesa

const novaMesa = (i) => ({ i, jogo: MESAS.MESAS_CARTAS[i].jogo, lugares: Array(LUGARES[MESAS.MESAS_CARTAS[i].jogo]).fill(null), fase: 'espera', aviso: '', vencedor: null, ate: 0, botAte: 0, vezDesde: 0, t: null, u: null, v: null });
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
// as cartas do lugar k, no jogo que for (no 21 são números)
const maoDe = (m, k) => m.t?.maos[k] || m.u?.maos[k] || m.v?.maos[k] || [];
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
  // quanto falta para o servidor decidir sozinho (a barra do tempo no painel)
  const espera = m.t?.pedido || m.fase === 'dez' ? ESPERA_RESPOSTA : ESPERA_GENTE;
  const base = {
    mesa: m.i, jogo: m.jogo, fase: m.fase, aviso: m.aviso, vencedor: m.vencedor,
    prazo: Math.max(0, m.vezDesde + espera - Date.now()), prazoTotal: espera,
    lugares: m.lugares.map((l, k) => (l ? { id: l.bot ? null : l.id, nome: l.nome, cor: l.cor, bot: !!l.bot, cartas: maoDe(m, k).length } : null)),
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
  if (m.v) {
    const v = m.v;
    // fim da rodada: as cartas fechadas abrem para todo mundo
    const abre = m.fase === 'fimDaRodada' || m.fase === 'fim';
    Object.assign(base, {
      vez: v.vez, meta: R.meta21(v.mesa), aposta: [0, 1].map((k) => R.aposta21(v.mesa, k, v.rodada)), base: R.apostaBase21(v.rodada),
      vidas: v.vidas, raiox: v.raiox, rodada: v.rodada, mesa21: v.mesa.map((l) => l.map((t) => t.c)),
      silencio: [0, 1].map((k) => R.silenciado21(v.mesa, k)),
      monte: v.monte.length, passes: v.passes, trunfosN: v.trunfos.map((t) => t.length),
      maos21: v.maos.map((mao) => mao.map((n, i) => (i === 0 && !abre ? 'verso' : R.carta21(n)))),
      resultado: abre ? v.resultado : null,
    });
  }
  return base;
}

function ligarCartas(io, rooms, jogoLigado, darMoedas) {
  function avisar(room, m) {
    io.to(room.id).emit('ct-estado', publico(m));
    m.lugares.forEach((l, k) => {
      if (!l || l.bot) return;
      const t = m.t;
      let mao = maoDe(m, k);
      const extra = {};
      if (m.v) {
        // 21: a mão toda (a fechada também: é minha), os trunfos e, com o raio-x, a fechada do rival
        mao = mao.map(R.carta21);
        extra.trunfos = m.v.trunfos[k];
        extra.rivalOculta = m.v.raiox[k] ? R.carta21(m.v.maos[1 - k][0]) : null;
      }
      if (t?.ferro) mao = mao.map(() => 'verso'); // mão de ferro: nem o dono vê
      if (t && m.fase === 'dez' && timeDe(k) === t.maoDeDez) extra.parceiro = t.maos[(k + 2) % 4];
      io.to(l.id).emit('ct-mao', { mesa: m.i, lugar: k, mao, ...extra });
    });
  }

  // O grito vai para a sala toda: quem está perto da mesa ouve (cartas.js decide pela distância).
  // frase: uma escolhida (a zoeira); senão sorteia a do tipo. alvo: o lugar de quem foi trucado.
  // trunfo: o do 21 que foi usado (a carta aparece grande para quem está na mesa).
  function gritar(room, m, k, tipo, { frase = null, alvo = null, trunfo = null } = {}) {
    const frases = R.GRITOS[tipo];
    if (!frase && !frases) return;
    frase ||= frases[Math.floor(Math.random() * frases.length)];
    io.to(room.id).emit('ct-grito', { mesa: m.i, lugar: k, tipo, nome: m.lugares[k]?.nome || '', frase, alvo, trunfo });
  }

  // o robô que fez a rodada zoa de vez em quando (no máximo uma vez a cada 8 s na mesa)
  function roboZoa(room, m, k) {
    if (!m.lugares[k]?.bot || Math.random() > 0.3 || Date.now() - (m.zoouEm || 0) < 8000) return;
    m.zoouEm = Date.now();
    gritar(room, m, k, 'zoeira', { frase: R.ZOEIRA[Math.floor(Math.random() * R.ZOEIRA.length)] });
  }

  // O cochicho do truco: o sinal vai só para o parceiro ((k+2)%4), e só se ele for gente. A carta
  // (quando tem) vai junto: a mini carta aparece no balão do parceiro.
  function sinalar(room, m, k, frase, carta = null) {
    const p = (k + 2) % 4;
    const l = m.lugares[p];
    if (!l || l.bot) return false;
    io.to(l.id).emit('ct-sinal', { mesa: m.i, lugar: k, nome: m.lugares[k]?.nome || '', frase, carta });
    return true;
  }
  const humanos = (m) => m.lugares.filter((l) => l && !l.bot);
  const robo = (m, k) => ({ id: `robo-${m.i}-${k}`, nome: NOMES_ROBO[k % NOMES_ROBO.length], cor: '#94a3b8', bot: true });
  const vezDeGente = (m, k) => !!m.lugares[k] && !m.lugares[k].bot;

  // a mesa ficou sem gente: some com os robôs e espera
  function arrumarMesa(room, m) {
    if (!humanos(m).length) {
      m.lugares = m.lugares.map(() => null);
      m.fase = 'espera';
      m.t = m.u = m.v = null;
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
    } else if (m.jogo === 'vinteum') {
      for (const k of [0, 1]) if (!m.lugares[k]) m.lugares[k] = robo(m, k);
      novaPartida21(room, m);
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
    if (res !== 'e') roboZoa(room, m, fortes[0].lugar);
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
    gritar(room, m, k, R.GRITO_DO_PEDIDO[t.pedido.valor], { alvo: (k + 1) % 4 });
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
      gritar(room, m, k, R.GRITO_DO_PEDIDO[t.pedido.valor], { alvo: (k + 1) % 4 });
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

  // o robô parceiro de vez em quando manda um sinal que combina com a mão dele: com sorte avisa
  // uma carta que realmente está na mão dele (manilha ou 3/2/ás), senão uma frase pelo tamanho da mão
  function roboSinala(room, m, k) {
    if (Date.now() - (m.sinalEm || 0) < 15000 || Math.random() > 0.12) return;
    if (!vezDeGente(m, (k + 2) % 4)) return;
    m.sinalEm = Date.now();
    const mao = m.t.maos[k] || [];
    const manilha = mao.find((c) => R.MANILHAS.includes(c));
    const forte = mao.find((c) => ['3', '2', 'A'].includes(R.valorDe(c)));
    if ((manilha || forte) && Math.random() < 0.6) {
      const carta = manilha || forte;
      const s = R.SINAIS.find((x) => x.carta === carta)
        || R.SINAIS.find((x) => x.carta && R.valorDe(x.carta) === R.valorDe(carta));
      if (s) return sinalar(room, m, k, s.f, s.carta);
    }
    const f = forcaDaMao(m.t, k);
    const quais = R.SINAIS.filter((s) => (f > 5.5 ? s.bom === true : f < 3.5 ? s.bom === false : s.bom === null));
    const s = quais[Math.floor(Math.random() * quais.length)];
    if (s) sinalar(room, m, k, s.f, s.carta);
  }

  function botTruco(room, m, k) {
    const t = m.t;
    if (!t.maos[k].length) return;
    if (t.ferro) {
      jogarTruco(room, m, k, null);
      return;
    }
    roboSinala(room, m, k);
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
      if ((!gente && agora >= m.botAte) || agora - m.vezDesde > ESPERA_RESPOSTA) {
        const f = forcaDaMao(t, time) + forcaDaMao(t, time + 2);
        maoDeDez(room, m, time, f > 6 ? 'jogar' : 'correr');
      }
      return;
    }
    if (t.pedido) {
      const oponentes = [0, 1, 2, 3].filter((k) => timeDe(k) !== t.pedido.porTime);
      const gente = oponentes.some((k) => vezDeGente(m, k));
      if (!gente && agora >= m.botAte) botResponde(room, m, oponentes.find((k) => k === (t.pedido.de + 1) % 4) ?? oponentes[0]);
      else if (gente && agora - m.vezDesde > ESPERA_RESPOSTA) responder(room, m, oponentes.find((k) => vezDeGente(m, k)), 'aceitar');
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

  // ------------------------------------------------------------------ 21
  // Como no 21 do Resident Evil 7: os trunfos de aposta, escudo, meta e silêncio ficam na mesa
  // (v.mesa) e valem enquanto estiverem lá; o Destruir do rival tira. Cada um tem a sua aposta.
  const nome21 = (m, k) => m.lugares[k]?.nome || '…';
  const dedos = (n) => `${n} dedo${n === 1 ? '' : 's'}`;
  function darTrunfo(v, k, n = 1) {
    for (let i = 0; i < n; i++) if (v.trunfos[k].length < R.MAX_TRUNFOS_21) v.trunfos[k].push(R.sortearTrunfo21());
  }

  function novaPartida21(room, m) {
    m.v = { vidas: [R.DEDOS_21, R.DEDOS_21], rodada: 0, inicio: Math.floor(Math.random() * 2), trunfos: [[], []] };
    for (const k of [0, 1]) darTrunfo(m.v, k); // a primeira rodada começa com um a mais
    novaRodada21(room, m, null);
  }

  // perdeu: o lugar de quem perdeu a rodada passada (ganha um trunfo a mais, para reagir)
  function novaRodada21(room, m, perdeu) {
    const v = m.v;
    v.monte = R.embaralhar(R.baralho21());
    v.maos = [[v.monte.pop(), v.monte.pop()], [v.monte.pop(), v.monte.pop()]];
    v.mesa = [[], []];
    v.ordem = 0;
    v.raiox = [false, false];
    v.passes = 0;
    v.rodada += 1;
    v.resultado = null;
    v.inicio = 1 - v.inicio; // cada rodada começa um
    v.vez = v.inicio;
    v.usouNaVez = 0;
    for (const k of [0, 1]) darTrunfo(v, k, perdeu === k ? 2 : 1);
    m.fase = 'jogando';
    m.vencedor = null;
    const base = R.apostaBase21(v.rodada);
    m.aviso = `Rodada ${v.rodada}${base > 1 ? ` (aposta base ${base})` : ''}: ${nome21(m, v.vez)} começa`;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 900;
    avisar(room, m);
  }

  function passarVez21(m) {
    const v = m.v;
    v.vez = 1 - v.vez;
    v.usouNaVez = 0;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
  }

  function pedir21(room, m, k) {
    const v = m.v;
    if (m.fase !== 'jogando' || v.vez !== k || !v.monte.length || R.silenciado21(v.mesa, k)) return false;
    const n = v.monte.pop();
    v.maos[k].push(n);
    v.passes = 0;
    m.aviso = `${nome21(m, k)} pediu carta: ${n}`;
    if (Math.random() < 0.35) gritar(room, m, k, 'pede21');
    passarVez21(m);
    avisar(room, m);
    return true;
  }

  // parar não tranca: se o rival mexer depois, a vez volta. Dois parados em seguida fecham a rodada.
  function parar21(room, m, k) {
    const v = m.v;
    if (m.fase !== 'jogando' || v.vez !== k) return false;
    v.passes += 1;
    if (Math.random() < 0.4) gritar(room, m, k, 'para21');
    if (v.passes >= 2) {
      resolver21(room, m);
      return true;
    }
    m.aviso = `${nome21(m, k)} parou`;
    passarVez21(m);
    avisar(room, m);
    return true;
  }

  // O efeito de cada trunfo: devolve o texto do que aconteceu, ou null se não dá para usar agora
  // (aí ele não é gasto). Os de mesa entram na mesa de quem usou.
  function efeito21(v, k, chave) {
    const o = 1 - k;
    const minha = v.maos[k];
    const dele = v.maos[o];
    const folga = R.meta21(v.mesa) - R.soma21(minha);
    const tirarDoMonte = (n) => v.monte.splice(v.monte.indexOf(n), 1);
    const T = R.TRUNFOS_21[chave];
    if (/^c\d$/.test(chave)) {
      const n = Number(chave.slice(1));
      if (!v.monte.includes(n)) return `o ${n} não estava no baralho`; // gasta: e conta onde ele está
      tirarDoMonte(n);
      minha.push(n);
      return `comprou o ${n}`;
    }
    if (T.mesa) {
      // a mesma meta que já vale não muda nada
      if (/^meta/.test(chave) && R.meta21(v.mesa) === Number(chave.slice(4))) return null;
      if (chave === 'silencio' && R.silenciado21(v.mesa, o)) return null;
      v.mesa[k].push({ c: chave, n: ++v.ordem });
      if (chave === 'mais1' || chave === 'mais2') {
        darTrunfo(v, k);
        return `a aposta do rival foi para ${R.aposta21(v.mesa, o, v.rodada)} (e ganhou um trunfo)`;
      }
      if (chave === 'escudo' || chave === 'escudo2') return `a sua aposta desceu para ${R.aposta21(v.mesa, k, v.rodada)}`;
      if (chave === 'silencio') return 'o rival não pode pedir carta';
      if (chave === 'colheita') return 'cada trunfo daqui pra frente dá outro';
      return `a meta virou ${R.meta21(v.mesa)}`;
    }
    switch (chave) {
      case 'devolver': {
        if (minha.length < 2) return null;
        const n = minha.pop();
        v.monte.push(n);
        R.embaralhar(v.monte);
        return `devolveu o ${n} para o baralho`;
      }
      case 'remover': {
        if (dele.length < 2) return null;
        const n = dele.pop();
        v.monte.push(n);
        R.embaralhar(v.monte);
        return `mandou o ${n} do rival de volta para o baralho`;
      }
      case 'troca': {
        if (minha.length < 2 || dele.length < 2) return null;
        const a = minha.pop();
        const b = dele.pop();
        minha.push(b);
        dele.push(a);
        return `trocou o ${a} pelo ${b}`;
      }
      case 'perfeita': {
        const cabe = v.monte.filter((n) => n <= folga);
        if (!cabe.length) return null;
        const n = Math.max(...cabe);
        tirarDoMonte(n);
        minha.push(n);
        return `comprou o ${n}`;
      }
      case 'presente': {
        if (!v.monte.length) return null;
        const n = Math.max(...v.monte);
        tirarDoMonte(n);
        dele.push(n);
        return `o rival comprou o ${n}`;
      }
      case 'raiox':
        if (v.raiox[k]) return null;
        v.raiox[k] = true;
        return 'está vendo a carta fechada do rival';
      case 'trocaTrunfos': {
        // (este já saiu da mão) descarta até 2 dos outros, sorteados, e ganha 3
        const meus = v.trunfos[k];
        for (let i = 0; i < 2 && meus.length; i++) meus.splice(Math.floor(Math.random() * meus.length), 1);
        darTrunfo(v, k, 3);
        return 'trocou trunfos: ganhou 3 novos';
      }
      case 'feliz':
        darTrunfo(v, k);
        darTrunfo(v, o);
        return 'os dois ganharam um trunfo';
      case 'destruir': {
        const t = v.mesa[o].pop();
        if (!t) return null;
        return `destruiu ${R.TRUNFOS_21[t.c].nome} do rival`;
      }
      case 'destruirTudo': {
        if (!v.mesa[o].length) return null;
        const n = v.mesa[o].length;
        v.mesa[o] = [];
        return `limpou a mesa do rival (${n} trunfo${n === 1 ? '' : 's'})`;
      }
      default: return null;
    }
  }

  function usar21(room, m, k, chave) {
    const v = m.v;
    const T = R.TRUNFOS_21[chave];
    const i = v.trunfos[k].indexOf(chave);
    if (m.fase !== 'jogando' || v.vez !== k || !T || i < 0) return false;
    const colhe = v.mesa[k].some((t) => t.c === 'colheita'); // a colheita vale para os próximos
    v.trunfos[k].splice(i, 1);
    const texto = efeito21(v, k, chave);
    if (!texto) {
      v.trunfos[k].splice(i, 0, chave); // não deu: volta para a mão
      return false;
    }
    if (colhe) darTrunfo(v, k);
    v.passes = 0; // o rival pode responder ao trunfo
    m.aviso = `${nome21(m, k)} usou ${T.nome}: ${texto}`;
    gritar(room, m, k, 'trunfo', { frase: `${T.nome}!`, trunfo: chave });
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 400;
    avisar(room, m);
    return true;
  }

  // quem passou da meta perde (os dois passaram: perde quem passou mais); senão, ganha o mais perto
  function resolver21(room, m) {
    const v = m.v;
    const meta = R.meta21(v.mesa);
    const s = v.maos.map(R.soma21);
    const passou = s.map((x) => x > meta);
    let venc;
    if (passou[0] && passou[1]) venc = s[0] === s[1] ? 'e' : s[0] < s[1] ? 0 : 1;
    else if (passou[0] || passou[1]) venc = passou[0] ? 1 : 0;
    else venc = s[0] === s[1] ? 'e' : s[0] > s[1] ? 0 : 1;
    let dano = 0;
    v.perdeu = null;
    if (venc !== 'e') {
      const p = 1 - venc;
      dano = R.aposta21(v.mesa, p, v.rodada);
      v.vidas[p] = Math.max(0, v.vidas[p] - dano);
      v.perdeu = p;
    }
    v.resultado = { somas: s, vencedor: venc, dano, meta };
    if (venc === 'e') m.aviso = `Empate em ${s[0]}: ninguém perde dedo`;
    else {
      const perdeu = nome21(m, 1 - venc);
      m.aviso = `${nome21(m, venc)} ganhou a rodada (${s[venc]} × ${s[1 - venc]}): `
        + (dano ? `${perdeu} perde ${dedos(dano)}` : `os escudos de ${perdeu} seguraram`);
      if (m.lugares[venc]?.bot && Math.random() < 0.6) gritar(room, m, venc, 'ganhou21');
    }
    if (venc !== 'e' && v.vidas[1 - venc] <= 0) {
      m.fase = 'fim';
      m.vencedor = venc;
      m.aviso = `${nome21(m, venc)} ganhou o 21!`;
      m.ate = Date.now() + 9000;
      const l = m.lugares[venc];
      if (l && !l.bot) {
        const u = room.users.get(l.id);
        const contraGente = !m.lugares[1 - venc]?.bot;
        if (u) darMoedas?.(room, u, contraGente ? 30 : 12, 'vitória no 21');
      }
    } else {
      m.fase = 'fimDaRodada';
      m.ate = Date.now() + 5200;
    }
    avisar(room, m);
  }

  // --- o robô do 21: conta as cartas que viu (as dele e as abertas do rival); não sabe a fechada
  function leitura21(v, k) {
    const o = 1 - k;
    const meta = R.meta21(v.mesa);
    const minha = R.soma21(v.maos[k]);
    const abertas = v.raiox[k] ? v.maos[o] : v.maos[o].slice(1);
    const sei = new Set([...v.maos[k], ...abertas]);
    const incertas = R.baralho21().filter((n) => !sei.has(n));
    const folga = meta - minha;
    const estouro = incertas.length ? incertas.filter((n) => n > folga).length / incertas.length : 1;
    const media = incertas.length ? incertas.reduce((a, b) => a + b, 0) / incertas.length : 6;
    const rival = R.soma21(abertas) + (v.raiox[k] ? 0 : media);
    return { meta, minha, folga, estouro, rival, rivalCerto: v.raiox[k], incertas };
  }

  function escolherTrunfo21(v, k) {
    const o = 1 - k;
    const tem = new Set(v.trunfos[k]);
    if (!tem.size || Math.random() < 0.2) return null;
    const L = leitura21(v, k);
    const passei = L.minha > L.meta;
    const rivalPassou = L.rival > L.meta + (L.rivalCerto ? 0 : 2);
    const ganhando = !passei && (rivalPassou || L.minha >= L.rival + 2);
    const perdendo = passei || L.minha < L.rival - 1;
    const dele = v.mesa[o].map((t) => t.c);
    const ruimPraMim = dele.at(-1);
    const nota = {
      devolver: passei && v.maos[k].length > 1 ? 100 : 0,
      destruir: !ruimPraMim ? 0 : ruimPraMim === 'silencio' && !passei && L.folga >= 3 ? 97
        : /^mais/.test(ruimPraMim) ? 66 : /^escudo/.test(ruimPraMim) && ganhando ? 52 : /^meta/.test(ruimPraMim) && passei ? 88 : 30,
      destruirTudo: dele.length >= 2 ? 72 : 0,
      meta24: passei && L.minha <= 24 ? 92 : 0,
      meta27: passei && L.minha <= 27 ? 90 : 0,
      troca: passei && v.maos[k].length > 1 && v.maos[o].length > 1 && v.maos[k].at(-1) > v.maos[o].at(-1) ? 85 : 0,
      perfeita: !passei && L.folga >= 2 ? 75 : 0,
      meta17: !passei && L.minha <= 17 && L.minha >= 14 && L.rival > 17 ? 70 : 0,
      silencio: ganhando && !rivalPassou ? 68 : 0,
      mais2: ganhando ? 62 : 36,
      remover: v.maos[o].length > 1 && v.maos[o].at(-1) >= 5 && !rivalPassou ? 58 : 0,
      mais1: ganhando ? 56 : 38,
      escudo2: perdendo ? 58 : 18,
      presente: !rivalPassou && L.rival >= L.meta - 4 && v.monte.length ? 52 : 0,
      escudo: perdendo ? 50 : 16,
      colheita: v.trunfos[k].length >= 3 ? 45 : 0,
      raiox: !v.raiox[k] ? 40 : 0,
      trocaTrunfos: v.trunfos[k].length >= 4 ? 26 : 0,
      feliz: 22,
    };
    // as cartas de número: a que crava a meta é ótima; uma que cabe, boa (se ainda pode estar no monte)
    for (let n = 2; n <= 7; n++) {
      if (passei || !L.incertas.includes(n) || n > L.folga) continue;
      nota[`c${n}`] = n === L.folga ? 95 : 50 + n * 3;
    }
    let melhor = null;
    for (const c of tem) if ((nota[c] || 0) > (nota[melhor] || 0)) melhor = c;
    return melhor && nota[melhor] > 0 ? melhor : null;
  }

  function bot21(room, m, k) {
    const v = m.v;
    // até três trunfos por vez, um de cada vez (para dar tempo de ver)
    if (v.usouNaVez < 3) {
      const t = escolherTrunfo21(v, k);
      if (t && usar21(room, m, k, t)) {
        v.usouNaVez += 1;
        return;
      }
    }
    const L = leitura21(v, k);
    const rivalParou = v.passes === 1;
    let pede;
    if (!v.monte.length || L.minha >= L.meta || R.silenciado21(v.mesa, k)) pede = false;
    else if (rivalParou) pede = L.minha <= L.rival ? L.estouro < 0.8 : L.estouro < 0.2;
    else pede = L.estouro <= 0.3 || (L.minha < L.meta - 6 && L.estouro < 0.55) || (L.minha < L.rival - 2 && L.estouro < 0.6);
    if (pede) pedir21(room, m, k);
    else parar21(room, m, k);
  }

  function ticVinte(room, m, agora) {
    if (m.fase === 'fimDaRodada') {
      if (agora >= m.ate) novaRodada21(room, m, m.v.perdeu);
      return;
    }
    if (m.fase !== 'jogando') return;
    const k = m.v.vez;
    if (!vezDeGente(m, k)) {
      if (agora >= m.botAte) bot21(room, m, k);
    } else if (agora - m.vezDesde > ESPERA_GENTE) parar21(room, m, k); // parado na vez: para por ele
  }

  // ------------------------------------------------------------------ relógio
  // Resenha da mesa: com o jogo rolando, um robô solta uma zoeira do nada (no máximo uma a cada
  // RESENHA_INTERVALO por mesa, e com sorte a cada batida do relógio).
  function resenha(room, m, agora) {
    if (m.fase !== 'jogando' || agora - (m.resenhaEm || 0) < RESENHA_INTERVALO || Math.random() > 0.006) return;
    const bots = m.lugares.map((l, k) => (l?.bot ? k : -1)).filter((k) => k >= 0);
    if (!bots.length) return;
    m.resenhaEm = agora;
    gritar(room, m, bots[Math.floor(Math.random() * bots.length)], 'zoeira', { frase: R.ZOEIRA[Math.floor(Math.random() * R.ZOEIRA.length)] });
  }

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
            } else if (m.jogo === 'vinteum') novaPartida21(room, m);
            else novaRodadaUno(room, m);
          }
          continue;
        }
        if (m.jogo === 'truco') ticTruco(room, m, agora);
        else if (m.jogo === 'vinteum') ticVinte(room, m, agora);
        else ticUno(room, m, agora);
        resenha(room, m, agora);
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

    // sentar: na cadeira escolhida (livre ou de um robô, que sai e deixa as cartas); sem escolha,
    // no primeiro lugar livre. Cadeira com gente: avisa, para o seletor escolher outra.
    socket.on('ct-entrar', (msg, ack) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      if (!m || !jogoLigado(room, m.jogo)) return ack?.({ erro: 'desligado' });
      if (meuLugar(m, user) >= 0) return ack?.({ ok: true, lugar: meuLugar(m, user) });
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
      } else if (m.jogo === 'uno') {
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

    // 21: pedir carta, parar ou usar um trunfo
    socket.on('ct-21', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      if (k < 0 || m.jogo !== 'vinteum' || !m.v) return;
      if (msg.acao === 'pedir') pedir21(room, m, k);
      else if (msg.acao === 'parar') parar21(room, m, k);
      else if (msg.acao === 'trunfo' && typeof msg.trunfo === 'string') usar21(room, m, k, msg.trunfo);
    });

    // zoeira: uma das frases de ZOEIRA, gritada para a mesa (a qualquer hora, sentado nela)
    socket.on('ct-zoar', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      const i = msg?.i;
      if (k < 0 || !Number.isInteger(i) || !R.ZOEIRA[i]) return;
      if (Date.now() - (user.zoouEm || 0) < INTERVALO_ZOEIRA) return;
      user.zoouEm = Date.now();
      gritar(room, m, k, 'zoeira', { frase: R.ZOEIRA[i] });
    });

    // Tapa e tiro na mesa, de brincadeira: em quem está sentado nela (gente ou robô). Não mexe no
    // jogo; quem levou tremeu (e caiu da cadeira, no tiro) em cartas.js, e o robô reclama.
    socket.on('ct-acao', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      const tipo = msg?.tipo;
      const alvo = msg?.alvo;
      if (k < 0 || !Object.hasOwn(INTERVALO_ACAO, tipo) || !jogoLigado(room, tipo)) return;
      if (!Number.isInteger(alvo) || alvo === k || !m.lugares[alvo]) return;
      const chave = tipo === 'tiro' ? 'tiroNaMesaEm' : 'tapaNaMesaEm';
      if (Date.now() - (user[chave] || 0) < INTERVALO_ACAO[tipo]) return;
      user[chave] = Date.now();
      const l = m.lugares[alvo];
      io.to(room.id).emit('ct-acao', { mesa: m.i, tipo, de: k, alvo, deNome: user.name, alvoId: l.bot ? null : l.id });
      if (l.bot) gritar(room, m, alvo, tipo === 'tiro' ? 'baleado' : 'apanhou');
    });

    // Arremesso de brincadeira (tomate, galinha, ovo...): em quem está sentado na mesa, gente ou
    // robô. Não mexe no jogo; o objeto voa e espirra na cara de quem levou, e o robô reclama.
    socket.on('ct-arremesso', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      const item = msg?.item;
      const alvo = msg?.alvo;
      if (k < 0 || !R.ARREMESSOS[item] || !Number.isInteger(alvo) || alvo === k || !m.lugares[alvo]) return;
      if (Date.now() - (user.arremessouEm || 0) < INTERVALO_ARREMESSO) return;
      user.arremessouEm = Date.now();
      const l = m.lugares[alvo];
      io.to(room.id).emit('ct-arremesso', { mesa: m.i, item, de: k, alvo, deNome: user.name, alvoId: l.bot ? null : l.id });
      if (l.bot) gritar(room, m, alvo, 'sujou');
    });

    // O sinal do truco: o cochicho que só o parceiro recebe (e só se ele for gente — robô não lê).
    socket.on('ct-sinal', (msg) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      const i = msg?.i;
      if (k < 0 || m.jogo !== 'truco' || !m.t || m.fase === 'espera') return;
      if (!Number.isInteger(i) || !R.SINAIS[i]) return;
      if (Date.now() - (user.sinalEm || 0) < INTERVALO_SINAL) return;
      if (sinalar(room, m, k, R.SINAIS[i].f, R.SINAIS[i].carta)) user.sinalEm = Date.now();
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.cartas && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarCartas };
  // ------------------------------------------------------------------ 21
  // Como no 21 do Resident Evil 7: os trunfos de aposta, escudo, meta e silêncio ficam na mesa
  // (v.mesa) e valem enquanto estiverem lá; o Destruir do rival tira. Cada um tem a sua aposta.
  const nome21 = (m, k) => m.lugares[k]?.nome || '…';
  const dedos = (n) => `${n} dedo${n === 1 ? '' : 's'}`;
  function darTrunfo(v, k, n = 1) {
    for (let i = 0; i < n; i++) if (v.trunfos[k].length < R.MAX_TRUNFOS_21) v.trunfos[k].push(R.sortearTrunfo21());
  }

  function novaPartida21(room, m) {
    m.v = { vidas: [R.DEDOS_21, R.DEDOS_21], rodada: 0, inicio: Math.floor(Math.random() * 2), trunfos: [[], []] };
    for (const k of [0, 1]) darTrunfo(m.v, k); // a primeira rodada começa com um a mais
    novaRodada21(room, m, null);
  }

  // perdeu: o lugar de quem perdeu a rodada passada (ganha um trunfo a mais, para reagir)
  function novaRodada21(room, m, perdeu) {
    const v = m.v;
    v.monte = R.embaralhar(R.baralho21());
    v.maos = [[v.monte.pop(), v.monte.pop()], [v.monte.pop(), v.monte.pop()]];
    v.mesa = [[], []];
    v.ordem = 0;
    v.raiox = [false, false];
    v.passes = 0;
    v.rodada += 1;
    v.resultado = null;
    v.inicio = 1 - v.inicio; // cada rodada começa um
    v.vez = v.inicio;
    v.usouNaVez = 0;
    for (const k of [0, 1]) darTrunfo(v, k, perdeu === k ? 2 : 1);
    m.fase = 'jogando';
    m.vencedor = null;
    const base = R.apostaBase21(v.rodada);
    m.aviso = `Rodada ${v.rodada}${base > 1 ? ` (aposta base ${base})` : ''}: ${nome21(m, v.vez)} começa`;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 900;
    avisar(room, m);
  }

  function passarVez21(m) {
    const v = m.v;
    v.vez = 1 - v.vez;
    v.usouNaVez = 0;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
  }

  function pedir21(room, m, k) {
    const v = m.v;
    if (m.fase !== 'jogando' || v.vez !== k || !v.monte.length || R.silenciado21(v.mesa, k)) return false;
    const n = v.monte.pop();
    v.maos[k].push(n);
    v.passes = 0;
    m.aviso = `${nome21(m, k)} pediu carta: ${n}`;
    if (Math.random() < 0.35) gritar(room, m, k, 'pede21');
    passarVez21(m);
    avisar(room, m);
    return true;
  }

  // parar não tranca: se o rival mexer depois, a vez volta. Dois parados em seguida fecham a rodada.
  function parar21(room, m, k) {
    const v = m.v;
    if (m.fase !== 'jogando' || v.vez !== k) return false;
    v.passes += 1;
    if (Math.random() < 0.4) gritar(room, m, k, 'para21');
    if (v.passes >= 2) {
      resolver21(room, m);
      return true;
    }
    m.aviso = `${nome21(m, k)} parou`;
    passarVez21(m);
    avisar(room, m);
    return true;
  }

  // O efeito de cada trunfo: devolve o texto do que aconteceu, ou null se não dá para usar agora
  // (aí ele não é gasto). Os de mesa entram na mesa de quem usou.
  function efeito21(v, k, chave) {
    const o = 1 - k;
    const minha = v.maos[k];
    const dele = v.maos[o];
    const folga = R.meta21(v.mesa) - R.soma21(minha);
    const tirarDoMonte = (n) => v.monte.splice(v.monte.indexOf(n), 1);
    const T = R.TRUNFOS_21[chave];
    if (/^c\d$/.test(chave)) {
      const n = Number(chave.slice(1));
      if (!v.monte.includes(n)) return `o ${n} não estava no baralho`; // gasta: e conta onde ele está
      tirarDoMonte(n);
      minha.push(n);
      return `comprou o ${n}`;
    }
    if (T.mesa) {
      // a mesma meta que já vale não muda nada
      if (/^meta/.test(chave) && R.meta21(v.mesa) === Number(chave.slice(4))) return null;
      if (chave === 'silencio' && R.silenciado21(v.mesa, o)) return null;
      v.mesa[k].push({ c: chave, n: ++v.ordem });
      if (chave === 'mais1' || chave === 'mais2') {
        darTrunfo(v, k);
        return `a aposta do rival foi para ${R.aposta21(v.mesa, o, v.rodada)} (e ganhou um trunfo)`;
      }
      if (chave === 'escudo' || chave === 'escudo2') return `a sua aposta desceu para ${R.aposta21(v.mesa, k, v.rodada)}`;
      if (chave === 'silencio') return 'o rival não pode pedir carta';
      if (chave === 'colheita') return 'cada trunfo daqui pra frente dá outro';
      return `a meta virou ${R.meta21(v.mesa)}`;
    }
    switch (chave) {
      case 'devolver': {
        if (minha.length < 2) return null;
        const n = minha.pop();
        v.monte.push(n);
        R.embaralhar(v.monte);
        return `devolveu o ${n} para o baralho`;
      }
      case 'remover': {
        if (dele.length < 2) return null;
        const n = dele.pop();
        v.monte.push(n);
        R.embaralhar(v.monte);
        return `mandou o ${n} do rival de volta para o baralho`;
      }
      case 'troca': {
        if (minha.length < 2 || dele.length < 2) return null;
        const a = minha.pop();
        const b = dele.pop();
        minha.push(b);
        dele.push(a);
        return `trocou o ${a} pelo ${b}`;
      }
      case 'perfeita': {
        const cabe = v.monte.filter((n) => n <= folga);
        if (!cabe.length) return null;
        const n = Math.max(...cabe);
        tirarDoMonte(n);
        minha.push(n);
        return `comprou o ${n}`;
      }
      case 'presente': {
        if (!v.monte.length) return null;
        const n = Math.max(...v.monte);
        tirarDoMonte(n);
        dele.push(n);
        return `o rival comprou o ${n}`;
      }
      case 'raiox':
        if (v.raiox[k]) return null;
        v.raiox[k] = true;
        return 'está vendo a carta fechada do rival';
      case 'trocaTrunfos': {
        // (este já saiu da mão) descarta até 2 dos outros, sorteados, e ganha 3
        const meus = v.trunfos[k];
        for (let i = 0; i < 2 && meus.length; i++) meus.splice(Math.floor(Math.random() * meus.length), 1);
        darTrunfo(v, k, 3);
        return 'trocou trunfos: ganhou 3 novos';
      }
      case 'feliz':
        darTrunfo(v, k);
        darTrunfo(v, o);
        return 'os dois ganharam um trunfo';
      case 'destruir': {
        const t = v.mesa[o].pop();
        if (!t) return null;
        return `destruiu ${R.TRUNFOS_21[t.c].nome} do rival`;
      }
      case 'destruirTudo': {
        if (!v.mesa[o].length) return null;
        const n = v.mesa[o].length;
        v.mesa[o] = [];
        return `limpou a mesa do rival (${n} trunfo${n === 1 ? '' : 's'})`;
      }
      default: return null;
    }
  }

  function usar21(room, m, k, chave) {
    const v = m.v;
    const T = R.TRUNFOS_21[chave];
    const i = v.trunfos[k].indexOf(chave);
    if (m.fase !== 'jogando' || v.vez !== k || !T || i < 0) return false;
    const colhe = v.mesa[k].some((t) => t.c === 'colheita'); // a colheita vale para os próximos
    v.trunfos[k].splice(i, 1);
    const texto = efeito21(v, k, chave);
    if (!texto) {
      v.trunfos[k].splice(i, 0, chave); // não deu: volta para a mão
      return false;
    }
    if (colhe) darTrunfo(v, k);
    v.passes = 0; // o rival pode responder ao trunfo
    m.aviso = `${nome21(m, k)} usou ${T.nome}: ${texto}`;
    gritar(room, m, k, 'trunfo', { frase: `${T.nome}!`, trunfo: chave });
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 400;
    avisar(room, m);
    return true;
  }

  // quem passou da meta perde (os dois passaram: perde quem passou mais); senão, ganha o mais perto
  function resolver21(room, m) {
    const v = m.v;
    const meta = R.meta21(v.mesa);
    const s = v.maos.map(R.soma21);
    const passou = s.map((x) => x > meta);
    let venc;
    if (passou[0] && passou[1]) venc = s[0] === s[1] ? 'e' : s[0] < s[1] ? 0 : 1;
    else if (passou[0] || passou[1]) venc = passou[0] ? 1 : 0;
    else venc = s[0] === s[1] ? 'e' : s[0] > s[1] ? 0 : 1;
    let dano = 0;
    v.perdeu = null;
    if (venc !== 'e') {
      const p = 1 - venc;
      dano = R.aposta21(v.mesa, p, v.rodada);
      v.vidas[p] = Math.max(0, v.vidas[p] - dano);
      v.perdeu = p;
    }
    v.resultado = { somas: s, vencedor: venc, dano, meta };
    if (venc === 'e') m.aviso = `Empate em ${s[0]}: ninguém perde dedo`;
    else {
      const perdeu = nome21(m, 1 - venc);
      m.aviso = `${nome21(m, venc)} ganhou a rodada (${s[venc]} × ${s[1 - venc]}): `
        + (dano ? `${perdeu} perde ${dedos(dano)}` : `os escudos de ${perdeu} seguraram`);
      if (m.lugares[venc]?.bot && Math.random() < 0.6) gritar(room, m, venc, 'ganhou21');
    }
    if (venc !== 'e' && v.vidas[1 - venc] <= 0) {
      m.fase = 'fim';
      m.vencedor = venc;
      m.aviso = `${nome21(m, venc)} ganhou o 21!`;
      m.ate = Date.now() + 9000;
      const l = m.lugares[venc];
      if (l && !l.bot) {
        const u = room.users.get(l.id);
        const contraGente = !m.lugares[1 - venc]?.bot;
        if (u) darMoedas?.(room, u, contraGente ? 30 : 12, 'vitória no 21');
      }
    } else {
      m.fase = 'fimDaRodada';
      m.ate = Date.now() + 5200;
    }
    avisar(room, m);
  }

  // --- o robô do 21: conta as cartas que viu (as dele e as abertas do rival); não sabe a fechada
  function leitura21(v, k) {
    const o = 1 - k;
    const meta = R.meta21(v.mesa);
    const minha = R.soma21(v.maos[k]);
    const abertas = v.raiox[k] ? v.maos[o] : v.maos[o].slice(1);
    const sei = new Set([...v.maos[k], ...abertas]);
    const incertas = R.baralho21().filter((n) => !sei.has(n));
    const folga = meta - minha;
    const estouro = incertas.length ? incertas.filter((n) => n > folga).length / incertas.length : 1;
    const media = incertas.length ? incertas.reduce((a, b) => a + b, 0) / incertas.length : 6;
    const rival = R.soma21(abertas) + (v.raiox[k] ? 0 : media);
    return { meta, minha, folga, estouro, rival, rivalCerto: v.raiox[k], incertas };
  }

  function escolherTrunfo21(v, k) {
    const o = 1 - k;
    const tem = new Set(v.trunfos[k]);
    if (!tem.size || Math.random() < 0.2) return null;
    const L = leitura21(v, k);
    const passei = L.minha > L.meta;
    const rivalPassou = L.rival > L.meta + (L.rivalCerto ? 0 : 2);
    const ganhando = !passei && (rivalPassou || L.minha >= L.rival + 2);
    const perdendo = passei || L.minha < L.rival - 1;
    const dele = v.mesa[o].map((t) => t.c);
    const ruimPraMim = dele.at(-1);
    const nota = {
      devolver: passei && v.maos[k].length > 1 ? 100 : 0,
      destruir: !ruimPraMim ? 0 : ruimPraMim === 'silencio' && !passei && L.folga >= 3 ? 97
        : /^mais/.test(ruimPraMim) ? 66 : /^escudo/.test(ruimPraMim) && ganhando ? 52 : /^meta/.test(ruimPraMim) && passei ? 88 : 30,
      destruirTudo: dele.length >= 2 ? 72 : 0,
      meta24: passei && L.minha <= 24 ? 92 : 0,
      meta27: passei && L.minha <= 27 ? 90 : 0,
      troca: passei && v.maos[k].length > 1 && v.maos[o].length > 1 && v.maos[k].at(-1) > v.maos[o].at(-1) ? 85 : 0,
      perfeita: !passei && L.folga >= 2 ? 75 : 0,
      meta17: !passei && L.minha <= 17 && L.minha >= 14 && L.rival > 17 ? 70 : 0,
      silencio: ganhando && !rivalPassou ? 68 : 0,
      mais2: ganhando ? 62 : 36,
      remover: v.maos[o].length > 1 && v.maos[o].at(-1) >= 5 && !rivalPassou ? 58 : 0,
      mais1: ganhando ? 56 : 38,
      escudo2: perdendo ? 58 : 18,
      presente: !rivalPassou && L.rival >= L.meta - 4 && v.monte.length ? 52 : 0,
      escudo: perdendo ? 50 : 16,
      colheita: v.trunfos[k].length >= 3 ? 45 : 0,
      raiox: !v.raiox[k] ? 40 : 0,
      trocaTrunfos: v.trunfos[k].length >= 4 ? 26 : 0,
      feliz: 22,
    };
    // as cartas de número: a que crava a meta é ótima; uma que cabe, boa (se ainda pode estar no monte)
    for (let n = 2; n <= 7; n++) {
      if (passei || !L.incertas.includes(n) || n > L.folga) continue;
      nota[`c${n}`] = n === L.folga ? 95 : 50 + n * 3;
    }
    let melhor = null;
    for (const c of tem) if ((nota[c] || 0) > (nota[melhor] || 0)) melhor = c;
    return melhor && nota[melhor] > 0 ? melhor : null;
  }

  function bot21(room, m, k) {
    const v = m.v;
    // até três trunfos por vez, um de cada vez (para dar tempo de ver)
    if (v.usouNaVez < 3) {
      const t = escolherTrunfo21(v, k);
      if (t && usar21(room, m, k, t)) {
        v.usouNaVez += 1;
        return;
      }
    }
    const L = leitura21(v, k);
    const rivalParou = v.passes === 1;
    let pede;
    if (!v.monte.length || L.minha >= L.meta || R.silenciado21(v.mesa, k)) pede = false;
    else if (rivalParou) pede = L.minha <= L.rival ? L.estouro < 0.8 : L.estouro < 0.2;
    else pede = L.estouro <= 0.3 || (L.minha < L.meta - 6 && L.estouro < 0.55) || (L.minha < L.rival - 2 && L.estouro < 0.6);
    if (pede) pedir21(room, m, k);
    else parar21(room, m, k);
  }

  function ticVinte(room, m, agora) {
    if (m.fase === 'fimDaRodada') {
      if (agora >= m.ate) novaRodada21(room, m, m.v.perdeu);
      return;
    }
    if (m.fase !== 'jogando') return;
    const k = m.v.vez;
    if (!vezDeGente(m, k)) {
      if (agora >= m.botAte) bot21(room, m, k);
    } else if (agora - m.vezDesde > ESPERA_GENTE) parar21(room, m, k); // parado na vez: para por ele
  }

