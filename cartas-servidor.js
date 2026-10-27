// Truco e Uno (mesas de cartas do salão de jogos do parque): o servidor embaralha, dá as cartas,
// conduz a vez, confere cada jogada (public/js/cartas-regras.js) e joga pelos robôs que completam a
// mesa. Cada um recebe só a própria mão ('ct-mao'); o resto da mesa vai para todos ('ct-estado').
//
// Truco mineiro: 4 lugares, em duplas (0 e 2 contra 1 e 3); quem não tem parceiro joga com um
// robô. Baralho limpo (27 cartas: de Q a 3, mais 4♣, 7♥ e 7♦), manilhas fixas (zap, copas,
// espadilha e pica-fumo), 3 rodadas por mão; a mão vale 2, e o
// truco 4, o seis 8, o nove 10 e o doze 12 — cada pedido e cada resposta é um grito ('ct-grito')
// que a mesa ouve. Carta coberta da segunda rodada em diante, mão de dez (o time com 10 vê as
// cartas do parceiro e decide) e mão de ferro (11 a 11: ninguém vê as cartas); 12 pontos ganha.
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
// cada um fechada, trunfos (TRUNFOS_21) e a aposta em dedos; 10 dedos cada, quem fica sem perde.
// Cacheta: até 4, cada um por si; 2 baralhos, 9 cartas, o vira e o curinga; compra, descarta e bate
// quem fecha a mão em jogos. Bater com 9 tira 1 ponto de cada um, com 10 tira 2; o último com
// pontos ganha.
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
const LUGARES = { truco: 4, uno: 6, vinteum: 2, cacheta: 4 };
// homem, mulher, homem...: a voz de cada lugar é de homem nos pares e de mulher nos ímpares (cartas-regras.js)
const NOMES_ROBO = ['Robô Zé', 'Robô Lia', 'Robô Tião', 'Robô Bia', 'Robô Nico', 'Robô Rita'];
const ESPERA_ROBO = 1300; // ms que o robô "pensa"
const ESPERA_GENTE = 45_000; // parado na vez: o robô joga por ele
const ESPERA_RESPOSTA = 25_000; // sem responder o truco (ou decidir a mão de dez): aceita por ele
const INTERVALO_ACAO = { tapa: 500, tiro: 2500 }; // ms entre dois tapas (tiros) da mesma pessoa
const INTERVALO_ZOEIRA = 2500;
const INTERVALO_SINAL = 1500; // ms entre dois sinais da mesma pessoa (só o parceiro recebe)
const INTERVALO_ARREMESSO = 1200; // ms entre dois arremessos da mesma pessoa
const RESENHA_INTERVALO = 20000; // no mínimo isso entre duas zoeiras aleatórias na mesma mesa

const novaMesa = (i) => ({ i, jogo: MESAS.MESAS_CARTAS[i].jogo, lugares: Array(LUGARES[MESAS.MESAS_CARTAS[i].jogo]).fill(null), fase: 'espera', aviso: '', vencedor: null, ate: 0, botAte: 0, vezDesde: 0, t: null, u: null, v: null, c: null });
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
const maoDe = (m, k) => m.t?.maos[k] || m.u?.maos[k] || m.v?.maos[k] || m.c?.maos[k] || [];
// 21: a carta que k espiou, enquanto ela continua em cima do monte (saiu de cima: acabou a vista)
const espiada21 = (v, k) => (v.espia[k] !== null && v.monte.at(-1) === v.espia[k] ? v.espia[k] : null);
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
    Object.assign(base, { topo: u.descarte.at(-1), cor: u.cor, vez: u.vez, sentido: u.sentido, monte: u.monte.length, comprou: u.comprou, disseUno: [...u.disseUno], semUno: u.semUno ?? null });
  }
  if (m.v) {
    const v = m.v;
    // fim da rodada: as cartas fechadas abrem para todo mundo. Com a Neblina, as abertas também vão
    // viradas (o dono vê as dele pelo ct-mao)
    const abre = m.fase === 'fimDaRodada' || m.fase === 'fim';
    Object.assign(base, {
      vez: v.vez, meta: R.meta21(v.mesa), aposta: [0, 1].map((k) => R.aposta21(v.mesa, k, v.rodada)), base: R.apostaBase21(v.rodada),
      vidas: v.vidas, raiox: v.raiox, rodada: v.rodada, mesa21: v.mesa.map((l) => l.map((t) => t.c)),
      silencio: [0, 1].map((k) => R.silenciado21(v.mesa, k)),
      trancado: [0, 1].map((k) => R.trancado21(v.mesa, k)), nublado: [0, 1].map((k) => R.nublado21(v.mesa, k)),
      monte: v.monte.length, passes: v.passes, trunfosN: v.trunfos.map((t) => t.length), fora: v.fora.map(R.carta21),
      maos21: v.maos.map((mao, k) => mao.map((n, i) => ((i === 0 || R.nublado21(v.mesa, k)) && !abre ? 'verso' : R.carta21(n)))),
      resultado: abre ? v.resultado : null,
    });
  }
  if (m.c) {
    const c = m.c;
    // a batida (os jogos de quem bateu) só aparece quando a mão acaba
    Object.assign(base, {
      vez: c.vez, etapa: c.etapa, vira: c.vira, curinga: c.curinga, topoLixo: c.lixo.at(-1) || null, lixoN: c.lixo.length,
      monte: c.monte.length, pontos: c.pontos, joga: c.joga, dador: c.dador, doLixo: c.doLixo, ultimo: c.ultimo, maoN: c.n,
      batida: m.fase === 'fimDaMao' || m.fase === 'fim' ? c.batida : null,
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
        // 21: a mão toda (a fechada também: é minha), os trunfos, com o raio-x a fechada do rival, com
        // o Espiar a próxima do monte, e os trunfos que chegaram, se perderam (mão cheia) ou saíram
        const v = m.v;
        mao = mao.map(R.carta21);
        extra.trunfos = v.trunfos[k];
        extra.rivalOculta = v.raiox[k] ? R.carta21(v.maos[1 - k][0]) : null;
        const prox = espiada21(v, k);
        extra.proxima = prox === null ? null : R.carta21(prox);
        extra.chegou = v.chegou[k];
        extra.perdidos = v.perdidos[k];
        extra.saiu = v.saiu[k];
      }
      if (t?.ferro) mao = mao.map(() => 'verso'); // mão de ferro: nem o dono vê
      if (t && m.fase === 'dez' && timeDe(k) === t.maoDeDez) extra.parceiro = t.maos[(k + 2) % 4];
      io.to(l.id).emit('ct-mao', { mesa: m.i, lugar: k, mao, ...extra });
    });
    if (m.v) Object.assign(m.v, { chegou: [[], []], perdidos: [[], []], saiu: [[], []] }); // já foram contados
  }

  // O grito vai para a sala toda: quem está perto da mesa ouve (cartas.js decide pela distância).
  // frase: uma escolhida (a zoeira); senão sorteia a do tipo. alvo: o lugar de quem foi trucado.
  // trunfo: o do 21 que foi usado (a carta aparece grande para quem está na mesa).
  // falada: o que a voz fala, quando a frase escrita tem nome de gente (o mp3 é gravado antes).
  function gritar(room, m, k, tipo, { frase = null, falada = null, alvo = null, trunfo = null } = {}) {
    const frases = R.GRITOS[tipo];
    if (!frase && !frases) return;
    frase = R.naVozDe(frase || frases[Math.floor(Math.random() * frases.length)], k); // Lia e Bia no feminino
    io.to(room.id).emit('ct-grito', { mesa: m.i, lugar: k, tipo, nome: m.lugares[k]?.nome || '', frase, alvo, trunfo, voz: R.arquivoVoz(falada ? R.naVozDe(falada, k) : frase, k) });
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
      m.t = m.u = m.v = m.c = null;
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
    } else if (m.jogo === 'cacheta') {
      // cacheta: no mínimo 3 na mesa (completa com robôs)
      let falta = 3 - m.lugares.filter(Boolean).length;
      for (let k = 0; k < m.lugares.length && falta > 0; k++) {
        if (!m.lugares[k]) {
          m.lugares[k] = robo(m, k);
          falta--;
        }
      }
      novaPartidaCacheta(room, m);
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
    // mão de ferro: 11 a 11, ninguém vê as cartas (cada um vira a de cima) e não tem truco
    t.ferro = t.pontos[0] === 11 && t.pontos[1] === 11;
    // mão de onze: o time com 11 olha as cartas do parceiro e decide se joga (vale 4) ou corre (dá 2)
    t.maoDeDez = !t.ferro && (t.pontos[0] === 11 || t.pontos[1] === 11) ? (t.pontos[0] === 11 ? 0 : 1) : null;
    m.fase = t.maoDeDez !== null ? 'dez' : 'jogando';
    m.vencedor = null;
    m.aviso = t.maoDeDez !== null ? `Mão de Onze: ${dupla(t.maoDeDez)} vê as cartas do parceiro e decide (vale ${R.VALE_DEZ})`
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
      fimDaMao(room, m, 1 - t.maoDeDez, 'correram da mão de onze');
      return true;
    }
    t.vale = R.VALE_DEZ;
    m.fase = 'jogando';
    m.aviso = `Mão de Onze: vale ${R.VALE_DEZ}`;
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
    m.u = { maos, monte, descarte: [topo], cor: R.corUno(topo), vez: vivos[Math.floor(Math.random() * vivos.length)], sentido: 1, comprou: false, disseUno: new Set(), unoAte: new Map(), semUno: null };
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
      if (u.semUno === k) u.semUno = null;
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
    // a janela de pegar quem esqueceu o UNO fecha quando outra carta entra na mesa
    if (u.semUno != null && u.semUno !== k) u.semUno = null;
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
    // uma carta só: tem uns segundos para dizer UNO (o robô sempre diz); fica pegável até lá
    if (mao.length === 1 && !u.disseUno.has(k)) {
      if (m.lugares[k].bot) {
        u.disseUno.add(k);
        setTimeout(() => gritar(room, m, k, 'uno'), 900); // depois da voz da carta, que cortaria o grito
      } else u.unoAte.set(k, Date.now() + 3500);
      u.semUno = k;
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
    gritar(room, m, k, 'unocompra');
    passarVez(m);
    avisar(room, m);
  }

  function ticUno(room, m, agora) {
    const u = m.u;
    // não disse UNO a tempo: compra duas (e avisa a mesa, com a voz de quem esqueceu)
    for (const [k, ate] of [...u.unoAte]) {
      if (agora < ate) continue;
      u.unoAte.delete(k);
      if (u.maos[k]?.length === 1 && !u.disseUno.has(k)) {
        if (u.semUno === k) u.semUno = null;
        comprarUno(m, k, 2);
        m.aviso = `${m.lugares[k]?.nome || ''} esqueceu o UNO: +2`;
        gritar(room, m, k, 'unoesqueceu');
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
  // o que k já tem: os trunfos na mão e os que pôs na mesa (um único que está aí não vem de novo)
  const temTrunfo = (v, k, c) => v.trunfos[k].includes(c) || v.mesa[k].some((t) => t.c === c);
  // n trunfos sorteados para k. Mão cheia: o sorteado se perde (e ele fica sabendo qual). Devolve
  // quantos entraram na mão.
  function darTrunfo(v, k, n = 1) {
    let deu = 0;
    for (let i = 0; i < n; i++) {
      const c = R.sortearTrunfo21(Math.random, [...v.trunfos[k], ...v.mesa[k].map((t) => t.c)]);
      if (v.trunfos[k].length >= R.MAX_TRUNFOS_21) {
        v.perdidos[k].push(c);
        continue;
      }
      v.trunfos[k].push(c);
      v.chegou[k].push(c);
      deu += 1;
    }
    return deu;
  }
  // embaralhou: a carta de cima muda, e quem espiou deixa de ver
  function embaralharMonte(v) {
    R.embaralhar(v.monte);
    v.espia = [null, null];
  }
  // passou da meta: não compra mais (só volta a comprar se a meta subir ou se devolver a carta)
  const estourou21 = (v, k) => R.soma21(v.maos[k]) > R.meta21(v.mesa);
  // os números que k sabe onde estão: os dele, os abertos do rival (sem Neblina), a fechada do rival
  // (com o raio-x) e os queimados
  function sabidas21(v, k) {
    const o = 1 - k;
    const dele = v.maos[o].filter((_, i) => (i === 0 ? v.raiox[k] : !R.nublado21(v.mesa, o)));
    return { dele, todas: new Set([...v.maos[k], ...dele, ...v.fora]) };
  }

  function novaPartida21(room, m) {
    m.v = {
      vidas: [R.DEDOS_21, R.DEDOS_21], rodada: 0, inicio: Math.floor(Math.random() * 2), trunfos: [[], []],
      mesa: [[], []], monte: [], maos: [[], []], fora: [], espia: [null, null], raiox: [false, false],
      chegou: [[], []], perdidos: [[], []], saiu: [[], []],
    };
    for (const k of [0, 1]) darTrunfo(m.v, k); // a primeira rodada começa com um a mais
    novaRodada21(room, m, null);
  }

  // perdeu: o lugar de quem perdeu a rodada passada (ganha um trunfo a mais, para reagir)
  function novaRodada21(room, m, perdeu) {
    const v = m.v;
    v.monte = R.embaralhar(R.baralho21());
    v.maos = [[v.monte.pop(), v.monte.pop()], [v.monte.pop(), v.monte.pop()]];
    v.mesa = [[], []];
    v.fora = []; // as queimadas
    v.espia = [null, null];
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
    if (m.fase !== 'jogando' || v.vez !== k || !v.monte.length || R.silenciado21(v.mesa, k) || estourou21(v, k)) return false;
    const n = v.monte.pop();
    v.maos[k].push(n);
    v.passes = 0;
    m.aviso = `${nome21(m, k)} pediu carta${R.nublado21(v.mesa, k) ? '' : `: ${n}`}`;
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
  // (aí ele não é gasto, e nada mudou). Os de mesa entram na mesa de quem usou. O navegador confere
  // as mesmas coisas para apagar o trunfo (motivoTrunfo, em cartas.js).
  function efeito21(v, k, chave) {
    const o = 1 - k;
    const minha = v.maos[k];
    const dele = v.maos[o];
    const meta = R.meta21(v.mesa);
    const folga = meta - R.soma21(minha);
    const tirarDoMonte = (n) => v.monte.splice(v.monte.indexOf(n), 1);
    // com a Neblina na mesa de alguém, o aviso não conta os números da mão dele
    const qual = (lugar, n) => (R.nublado21(v.mesa, lugar) ? 'uma carta' : `o ${n}`);
    const T = R.TRUNFOS_21[chave];
    if (/^c\d$/.test(chave)) {
      const n = Number(chave.slice(1));
      if (estourou21(v, k)) return null; // estourou: não compra mais
      if (sabidas21(v, k).todas.has(n)) return null; // eu já sei onde ele está: não gasta à toa
      if (!v.monte.includes(n)) return `o ${n} não estava no baralho`; // gasta: e conta onde ele está
      tirarDoMonte(n);
      minha.push(n);
      return `comprou o ${n}`;
    }
    if (T.mesa) {
      // a mesma meta que já vale não muda nada; dos outros únicos, um na mesa já basta
      if (/^meta/.test(chave)) {
        if (meta === Number(chave.slice(4))) return null;
      } else if (T.unico && v.mesa[k].some((t) => t.c === chave)) return null;
      if (chave === 'tudo' && R.dobrado21(v.mesa)) return null;
      v.mesa[k].push({ c: chave, n: ++v.ordem });
      if (chave === 'mais1' || chave === 'mais2') {
        darTrunfo(v, k); // (cabe sempre: este acabou de sair da mão)
        return `a aposta do rival foi para ${R.aposta21(v.mesa, o, v.rodada)} (e ganhou um trunfo)`;
      }
      if (chave === 'escudo' || chave === 'escudo2') return `a sua aposta desceu para ${R.aposta21(v.mesa, k, v.rodada)}`;
      if (chave === 'silencio') return 'o rival não pode pedir carta';
      if (chave === 'colheita') return 'cada trunfo daqui pra frente dá outro';
      if (chave === 'tudo') return 'a aposta dos dois dobrou: quem perder a rodada perde o dobro';
      if (chave === 'cadeado') return 'o rival só pode usar Destruir';
      if (chave === 'neblina') return 'as cartas abertas sumiram na neblina';
      return `a meta virou ${R.meta21(v.mesa)}`;
    }
    switch (chave) {
      case 'baixa': {
        if (estourou21(v, k) || !v.monte.length) return null;
        const n = Math.min(...v.monte);
        tirarDoMonte(n);
        minha.push(n);
        return `comprou ${qual(k, n)}`;
      }
      case 'devolver': {
        if (minha.length < 2) return null;
        const n = minha.pop();
        v.monte.push(n);
        embaralharMonte(v);
        return `devolveu ${qual(k, n)} para o baralho`;
      }
      case 'remover': {
        if (dele.length < 2) return null;
        const n = dele.pop();
        v.monte.push(n);
        embaralharMonte(v);
        return `mandou ${qual(o, n)} do rival de volta para o baralho`;
      }
      case 'troca': {
        if (minha.length < 2 || dele.length < 2) return null;
        const a = minha.pop();
        const b = dele.pop();
        minha.push(b);
        dele.push(a);
        if (R.nublado21(v.mesa, k) || R.nublado21(v.mesa, o)) return 'trocou a última carta com a do rival';
        return `trocou o ${a} pelo ${b}`;
      }
      case 'perfeita': {
        const cabe = v.monte.filter((n) => n <= folga);
        if (!cabe.length) return null;
        const n = Math.max(...cabe);
        tirarDoMonte(n);
        minha.push(n);
        return `comprou ${qual(k, n)}`;
      }
      case 'presente': {
        if (!v.monte.length) return null;
        const n = Math.max(...v.monte);
        tirarDoMonte(n);
        dele.push(n);
        return `o rival comprou ${qual(o, n)}`;
      }
      case 'espiar':
        if (!v.monte.length || espiada21(v, k) !== null) return null;
        v.espia[k] = v.monte.at(-1);
        return 'está vendo a próxima carta do baralho';
      case 'queimar': {
        if (!v.monte.length) return null;
        const n = v.monte.pop();
        v.fora.push(n);
        return `queimou o ${n}: ele sai da rodada`;
      }
      case 'raiox':
        if (v.raiox[k]) return null;
        v.raiox[k] = true;
        return 'está vendo a carta fechada do rival';
      case 'trocaTrunfos': {
        // (este já saiu da mão) descarta até 2 dos outros, sorteados, e ganha 3
        const meus = v.trunfos[k];
        for (let i = 0; i < 2 && meus.length; i++) v.saiu[k].push({ c: meus.splice(Math.floor(Math.random() * meus.length), 1)[0], por: 'troca' });
        darTrunfo(v, k, 3);
        return 'trocou trunfos: ganhou 3 novos';
      }
      case 'feliz':
        darTrunfo(v, k); // (cabe sempre: este acabou de sair da mão; a do rival pode estar cheia)
        return darTrunfo(v, o) ? 'os dois ganharam um trunfo' : 'ganhou um trunfo (o rival estava de mão cheia)';
      case 'furto': {
        const daMao = v.trunfos[o];
        if (!daMao.length) return null;
        const [c] = daMao.splice(Math.floor(Math.random() * daMao.length), 1);
        v.saiu[o].push({ c, por: 'furto' });
        // um único que eu já tenho não vem repetido: o rival só perde
        if (R.TRUNFOS_21[c].unico && temTrunfo(v, k, c)) return 'furtou um trunfo do rival (repetido: foi fora)';
        v.trunfos[k].push(c);
        v.chegou[k].push(c);
        return 'furtou um trunfo do rival';
      }
      case 'curativo':
        if (v.vidas[k] >= R.DEDOS_21) return null;
        v.vidas[k] += 1;
        return `recuperou um dedo (está com ${dedos(v.vidas[k])})`;
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
      case 'roubar': {
        // vai para a minha mesa como se eu tivesse posto agora (uma meta roubada volta a valer)
        const t = v.mesa[o].pop();
        if (!t) return null;
        v.mesa[k].push({ c: t.c, n: ++v.ordem });
        return `roubou ${R.TRUNFOS_21[t.c].nome} da mesa do rival`;
      }
      default: return null;
    }
  }

  function usar21(room, m, k, chave) {
    const v = m.v;
    const T = R.TRUNFOS_21[chave];
    const i = v.trunfos[k].indexOf(chave);
    if (m.fase !== 'jogando' || v.vez !== k || !T || i < 0) return false;
    if (R.trancado21(v.mesa, k) && !R.LIVRES_CADEADO_21.includes(chave)) return false; // o Cadeado do rival
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

  // --- o robô do 21: conta as cartas que viu (as dele, as abertas do rival — sem Neblina — e as
  // queimadas); não sabe a fechada (só com o raio-x). Com o Espiar, sabe a próxima do monte.
  function leitura21(v, k) {
    const o = 1 - k;
    const meta = R.meta21(v.mesa);
    const minha = R.soma21(v.maos[k]);
    const { dele, todas } = sabidas21(v, k);
    const naoSei = v.maos[o].length - dele.length;
    const incertas = R.baralho21().filter((n) => !todas.has(n));
    const folga = meta - minha;
    const proxima = espiada21(v, k);
    const estouro = proxima !== null ? Number(proxima > folga)
      : incertas.length ? incertas.filter((n) => n > folga).length / incertas.length : 1;
    const media = incertas.length ? incertas.reduce((a, b) => a + b, 0) / incertas.length : 6;
    const rival = R.soma21(dele) + naoSei * media;
    return { meta, minha, folga, estouro, rival, rivalCerto: naoSei === 0, incertas, proxima };
  }

  function escolherTrunfo21(v, k) {
    const o = 1 - k;
    // com o Cadeado do rival na mesa, só os que passam por ele
    const tem = new Set(v.trunfos[k].filter((c) => !R.trancado21(v.mesa, k) || R.LIVRES_CADEADO_21.includes(c)));
    if (!tem.size || Math.random() < 0.2) return null;
    const L = leitura21(v, k);
    const passei = L.minha > L.meta;
    const rivalPassou = L.rival > L.meta + (L.rivalCerto ? 0 : 2);
    const ganhando = !passei && (rivalPassou || L.minha >= L.rival + 2);
    const perdendo = passei || L.minha < L.rival - 1;
    const dele = v.mesa[o].map((t) => t.c);
    const ruimPraMim = dele.at(-1);
    const naMinhaMesa = (c) => v.mesa[k].some((t) => t.c === c);
    const trancado = R.trancado21(v.mesa, k);
    // o último da mesa do rival: quanto vale tirar (Destruir) ou trazer para a minha mesa (Roubar)
    const notaDestruir = (c) => (!c ? 0 : c === 'cadeado' ? 99 : c === 'silencio' && !passei && L.folga >= 3 ? 97
      : /^mais/.test(c) ? 66 : /^escudo/.test(c) && ganhando ? 52 : /^meta/.test(c) && passei ? 88
        : c === 'tudo' ? (perdendo ? 70 : 0) : trancado ? 80 : 30);
    const notaRoubar = (c) => (!c ? 0 : c === 'silencio' ? (!passei && L.folga >= 3 ? 98 : 35)
      : /^mais/.test(c) ? 70 : /^escudo/.test(c) ? 64 : c === 'colheita' ? 50 : c === 'neblina' ? 48 : 0);
    const nota = {
      devolver: passei && v.maos[k].length > 1 ? 100 : 0,
      destruir: notaDestruir(ruimPraMim),
      roubar: notaRoubar(ruimPraMim),
      destruirTudo: trancado ? 95 : dele.length >= 2 ? 72 : 0,
      meta24: passei && L.minha <= 24 ? 92 : 0,
      meta27: passei && L.minha <= 27 ? 90 : 0,
      // a meta passou de 21 e o rival estoura com 21 (ou eu passei de 17 e caibo em 21)
      meta21: L.meta !== 21 && L.minha <= 21 && (passei || (L.meta > 21 && L.rival > 21)) ? 89 : 0,
      troca: passei && v.maos[k].length > 1 && v.maos[o].length > 1 && v.maos[k].at(-1) > v.maos[o].at(-1) ? 85 : 0,
      queimar: L.proxima !== null && L.proxima > L.folga ? 82 : 0, // espiei uma que me estoura
      curativo: v.vidas[k] < R.DEDOS_21 ? (v.vidas[k] <= 4 ? 80 : 30) : 0,
      perfeita: !passei && L.folga >= 2 ? 75 : 0,
      meta17: L.meta !== 17 && !passei && L.minha <= 17 && L.minha >= 14 && L.rival > 17 ? 70 : 0,
      silencio: ganhando && !rivalPassou && !naMinhaMesa('silencio') ? 68 : 0,
      cadeado: !naMinhaMesa('cadeado') && v.trunfos[o].length >= 2 ? (ganhando ? 67 : 44) : 0,
      tudo: ganhando && !R.dobrado21(v.mesa) ? 64 : 0,
      mais2: ganhando ? 62 : 36,
      baixa: !passei && v.monte.length && L.proxima === null && L.folga <= 5 && Math.min(...L.incertas) <= L.folga ? 60 : 0,
      remover: v.maos[o].length > 1 && v.maos[o].at(-1) >= 5 && !rivalPassou && !R.nublado21(v.mesa, o) ? 58 : 0,
      mais1: ganhando ? 56 : 38,
      escudo2: perdendo ? 58 : 18,
      presente: !rivalPassou && L.rival >= L.meta - 4 && v.monte.length ? 52 : 0,
      espiar: !passei && v.monte.length && L.proxima === null ? 50 : 0,
      escudo: perdendo ? 50 : 16,
      furto: v.trunfos[o].length ? 46 : 0,
      colheita: v.trunfos[k].length >= 3 && !naMinhaMesa('colheita') ? 45 : 0,
      neblina: !naMinhaMesa('neblina') && v.maos[k].length >= 3 ? 42 : 0,
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

  // ------------------------------------------------------------------ cacheta
  // Cada um por si (cartas-regras.js): na vez, compra (do monte ou a de cima do lixo) e descarta;
  // bate quem fecha a mão. Quem fica sem pontos quebra: sai da partida e fica sentado, assistindo; o
  // último com pontos ganha. c.joga: quem começou a partida (quem senta no meio dela espera a próxima).
  const nomeC = (m, k) => m.lugares[k]?.nome || '…';
  const vivoC = (m, k) => !!m.lugares[k] && m.c.pontos[k] > 0;
  function proximoC(m, de) {
    const n = m.lugares.length;
    for (let s = 1; s <= n; s++) if (vivoC(m, (de + s) % n)) return (de + s) % n;
    return de;
  }
  // a distância de dois valores numa sequência (o ás vale 1 e 14)
  const distC = (a, b) => Math.min(Math.abs(a - b), Math.abs((a === 1 ? 14 : a) - (b === 1 ? 14 : b)));
  // duas cartas soltas que já pedem uma terceira (par de valor, ou quase sequência)
  const parC = (x, y) => (x.v === y.v && x.n !== y.n) || (x.n === y.n && distC(x.v, y.v) > 0 && distC(x.v, y.v) <= 2);

  function novaPartidaCacheta(room, m) {
    const sentados = m.lugares.map((l, k) => (l ? k : -1)).filter((k) => k >= 0);
    m.c = { pontos: m.lugares.map((l) => (l ? R.PONTOS_CACHETA : 0)), joga: m.lugares.map(Boolean), dador: sentados[Math.floor(Math.random() * sentados.length)], n: 0 };
    novaMaoCacheta(room, m);
  }

  function novaMaoCacheta(room, m) {
    const c = m.c;
    const monte = R.embaralhar(R.baralhoCacheta());
    c.maos = m.lugares.map((_, k) => (vivoC(m, k) ? monte.splice(-R.CARTAS_CACHETA) : []));
    c.vira = monte.pop();
    c.curinga = R.curingaDe(c.vira);
    c.monte = monte;
    c.lixo = [];
    c.doLixo = null; // a carta que quem está na vez pegou do lixo (não pode voltar para lá)
    c.ultimo = null; // o último descarte: { lugar, carta }
    c.batida = null;
    c.naBoa = [];
    c.n += 1;
    c.vez = proximoC(m, c.dador);
    c.etapa = 'comprar';
    m.fase = 'jogando';
    m.vencedor = null;
    m.aviso = `Vira ${R.nomeCartaCacheta(c.vira)}: os curingas são ${R.nomeCuringa(c.curinga)}`;
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO + 900;
    avisar(room, m);
  }

  function comprarCacheta(room, m, k, doLixo) {
    const c = m.c;
    if (m.fase !== 'jogando' || c.vez !== k || c.etapa !== 'comprar') return false;
    let carta;
    if (doLixo) {
      if (!c.lixo.length) return false;
      carta = c.lixo.pop();
      c.doLixo = carta;
      m.aviso = `${nomeC(m, k)} pegou o ${R.nomeCartaCacheta(carta)} do lixo`;
      if (m.lugares[k].bot && Math.random() < 0.3) gritar(room, m, k, 'lixo');
    } else {
      if (!c.monte.length) {
        // o monte acabou: o lixo (menos o de cima) é embaralhado e vira monte
        const topo = c.lixo.pop();
        c.monte = R.embaralhar(c.lixo);
        c.lixo = topo ? [topo] : [];
      }
      if (!c.monte.length) {
        fimMaoCacheta(room, m, null);
        return true;
      }
      carta = c.monte.pop();
      c.doLixo = null;
      m.aviso = '';
    }
    c.maos[k].push(carta);
    c.etapa = 'descartar';
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    avisar(room, m);
    return true;
  }

  function descartarCacheta(room, m, k, carta) {
    const c = m.c;
    const mao = c.maos[k];
    const i = mao.indexOf(carta);
    if (m.fase !== 'jogando' || c.vez !== k || c.etapa !== 'descartar' || i < 0 || carta === c.doLixo) return false;
    mao.splice(i, 1);
    c.lixo.push(carta);
    c.ultimo = { lugar: k, carta };
    c.doLixo = null;
    c.vez = proximoC(m, k);
    c.etapa = 'comprar';
    m.aviso = '';
    if (m.lugares[k].bot) roboNaBoa(room, m, k);
    m.vezDesde = Date.now();
    m.botAte = Date.now() + ESPERA_ROBO;
    avisar(room, m);
    return true;
  }

  // carta: a que vai para o lixo (bater com 9); sem carta, bate com as 10. A mão tem que fechar toda.
  function baterCacheta(room, m, k, carta) {
    const c = m.c;
    const mao = c.maos[k];
    if (m.fase !== 'jogando' || c.vez !== k || c.etapa !== 'descartar') return false;
    let resto = mao;
    if (carta != null) {
      const i = mao.indexOf(carta);
      if (i < 0) return false;
      resto = mao.filter((_, j) => j !== i);
    }
    const grupos = R.bateCacheta(resto, c.curinga);
    if (!grupos) return false;
    if (carta != null) {
      c.lixo.push(carta);
      c.ultimo = { lugar: k, carta };
    }
    c.maos[k] = resto;
    c.batida = { lugar: k, grupos, com10: carta == null, descarte: carta ?? null };
    fimMaoCacheta(room, m, k);
    return true;
  }

  // a mão acabou: k bateu (null: o monte acabou e ninguém bateu)
  function fimMaoCacheta(room, m, k) {
    const c = m.c;
    c.etapa = null;
    if (k !== null) {
      const perde = c.batida.com10 ? 2 : 1;
      const quebraram = [];
      m.lugares.forEach((_, j) => {
        if (j === k || !vivoC(m, j)) return;
        c.pontos[j] = Math.max(0, c.pontos[j] - perde);
        if (!c.pontos[j]) quebraram.push(j);
      });
      gritar(room, m, k, c.batida.com10 ? 'bateu10' : 'bateu');
      m.aviso = `${nomeC(m, k)} bateu${c.batida.com10 ? ' com 10' : ''}: cada um perde ${perde} ponto${perde > 1 ? 's' : ''}`
        + (quebraram.length ? ` · ${quebraram.map((j) => nomeC(m, j)).join(', ')} ${quebraram.length > 1 ? 'quebraram' : 'quebrou'}` : '');
      // o robô que quebrou reclama, depois do grito de quem bateu
      const robo = quebraram.find((j) => m.lugares[j]?.bot);
      if (robo !== undefined) setTimeout(() => gritar(room, m, robo, 'quebrou'), 1800);
    } else m.aviso = 'O monte acabou e ninguém bateu: ninguém perde ponto';
    const vivos = m.lugares.map((_, j) => j).filter((j) => vivoC(m, j));
    if (vivos.length <= 1) {
      const v = vivos[0] ?? k;
      m.fase = 'fim';
      m.vencedor = v;
      m.aviso = `${nomeC(m, v)} ganhou a cacheta!`;
      m.ate = Date.now() + 10000;
      const l = m.lugares[v];
      if (l && !l.bot) {
        const u = room.users.get(l.id);
        const contraGente = m.lugares.some((o, j) => o && !o.bot && j !== v && c.joga[j]);
        if (u) darMoedas?.(room, u, contraGente ? 30 : 12, 'vitória na cacheta');
      }
    } else {
      m.fase = 'fimDaMao';
      m.ate = Date.now() + 7000;
      c.dador = proximoC(m, c.dador);
    }
    avisar(room, m);
  }

  // --- o robô da cacheta: quanto vale a mão (cartas em jogos; das soltas, o curinga e as que já
  // pedem uma terceira)
  function valorCacheta(mao, cur) {
    const a = R.arranjoCacheta(mao, cur);
    const soltas = a.soltas.map((x) => ({ x, ...R.lerCacheta(x), cur: R.ehCuringa(x, cur) }));
    let v = (mao.length - soltas.length) * 10;
    for (const s of soltas) {
      if (s.cur) v += 6;
      else if (soltas.some((o) => o !== s && !o.cur && parC(o, s))) v += 3;
    }
    return v;
  }

  // a carta que menos faz falta (o curinga só sai se for o jeito; a que veio do lixo não volta)
  function descarteRobo(mao, cur, proibida) {
    let melhor = null;
    let nota = -Infinity;
    for (const x of mao) {
      if (x === proibida) continue;
      const v = valorCacheta(mao.filter((y) => y !== x), cur) - (R.ehCuringa(x, cur) ? 50 : 0) + Math.random();
      if (v > nota) {
        nota = v;
        melhor = x;
      }
    }
    return { carta: melhor, nota };
  }

  function botCacheta(room, m, k) {
    const c = m.c;
    const mao = c.maos[k];
    if (c.etapa === 'comprar') {
      // o lixo, se a carta de cima faz bater, é curinga ou junta num jogo; senão o monte
      const topo = c.lixo.at(-1);
      let lixo = false;
      if (topo) {
        const com = [...mao, topo];
        const bate = R.comoBaterCacheta(com, c.curinga);
        lixo = !!bate.dez || bate.descartes.length > 0 || R.ehCuringa(topo, c.curinga)
          || descarteRobo(com, c.curinga, topo).nota >= valorCacheta(mao, c.curinga) + 8;
      }
      comprarCacheta(room, m, k, lixo);
      return;
    }
    const bate = R.comoBaterCacheta(mao, c.curinga);
    if (bate.dez) baterCacheta(room, m, k, null);
    else if (bate.descartes.length) baterCacheta(room, m, k, bate.descartes[0]);
    else descartarCacheta(room, m, k, descarteRobo(mao, c.curinga, c.doLixo).carta);
  }

  // o robô que ficou a uma carta de bater às vezes avisa (uma vez por mão): "Tô na boa!"
  function roboNaBoa(room, m, k) {
    const c = m.c;
    if (c.naBoa.includes(k) || Math.random() > 0.6) return;
    const soltas = R.arranjoCacheta(c.maos[k], c.curinga).soltas.map(R.lerCacheta);
    if (soltas.length > 2 || (soltas.length === 2 && !parC(soltas[0], soltas[1]))) return;
    c.naBoa.push(k);
    setTimeout(() => gritar(room, m, k, 'naboa'), 700);
  }

  function ticCacheta(room, m, agora) {
    if (m.fase === 'fimDaMao') {
      if (agora >= m.ate) novaMaoCacheta(room, m);
      return;
    }
    if (m.fase !== 'jogando') return;
    const k = m.c.vez;
    if (!vezDeGente(m, k) ? agora >= m.botAte : agora - m.vezDesde > ESPERA_GENTE) botCacheta(room, m, k);
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
            else if (m.jogo === 'cacheta') novaPartidaCacheta(room, m);
            else novaRodadaUno(room, m);
          }
          continue;
        }
        if (m.jogo === 'truco') ticTruco(room, m, agora);
        else if (m.jogo === 'vinteum') ticVinte(room, m, agora);
        else if (m.jogo === 'cacheta') ticCacheta(room, m, agora);
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
      if (m.fase !== 'espera') m.aviso = m.c && !m.c.pontos[k] ? `${user.name} sentou: entra na próxima partida` : `${user.name} sentou`;
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
          if (u.semUno === k) u.semUno = null;
          m.aviso = `${m.lugares[k].nome}: UNO!`;
          gritar(room, m, k, 'uno');
          avisar(room, m);
        }
        return;
      }
      if (msg.acao === 'pegar') {
        // pegar quem ficou com uma carta sem dizer UNO (enquanto a janela está aberta): compra duas
        const alvo = msg.alvo;
        if (!Number.isInteger(alvo) || alvo < 0 || alvo === k || alvo >= m.lugares.length || !m.lugares[alvo]) return;
        if (u.semUno !== alvo || u.maos[alvo].length !== 1 || u.disseUno.has(alvo)) return;
        u.semUno = null;
        u.unoAte.delete(alvo);
        comprarUno(m, alvo, 2);
        m.aviso = `${m.lugares[alvo].nome} não falou UNO: +2 (${m.lugares[k].nome} pegou)`;
        gritar(room, m, k, 'pegouno', { frase: `${m.lugares[alvo].nome}, não falou UNO!`, falada: R.GRITOS.pegouno[0] });
        avisar(room, m);
        return;
      }
      if (u.vez !== k) return;
      if (msg.acao === 'comprar' && !u.comprou) {
        comprarUno(m, k, 1);
        u.comprou = true;
        // o que comprou não serve: passa sozinho
        if (!R.podeJogarUno(u.maos[k].at(-1), u.descarte.at(-1), u.cor)) {
          m.aviso = `${m.lugares[k].nome} comprou e passou`;
          gritar(room, m, k, 'unocompra');
          passarVez(m);
        }
        avisar(room, m);
      } else if (msg.acao === 'passar' && u.comprou) {
        m.aviso = `${m.lugares[k].nome} comprou e passou`;
        gritar(room, m, k, 'unocompra');
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

    // cacheta: comprar do monte, pegar o lixo, descartar e bater (com a carta do descarte, ou sem
    // carta para bater com as 10). ack: deu certo (o bater que não fecha a mão volta false)
    socket.on('ct-cacheta', (msg, ack) => {
      const { room, user, mesas } = daSala();
      const m = mesas?.[msg?.mesa];
      const k = m ? meuLugar(m, user) : -1;
      let ok = false;
      if (k >= 0 && m.jogo === 'cacheta' && m.c && m.fase === 'jogando') {
        if (msg.acao === 'monte' || msg.acao === 'lixo') ok = comprarCacheta(room, m, k, msg.acao === 'lixo');
        else if (msg.acao === 'descartar' && typeof msg.carta === 'string') ok = descartarCacheta(room, m, k, msg.carta);
        else if (msg.acao === 'bater') ok = baterCacheta(room, m, k, typeof msg.carta === 'string' ? msg.carta : null);
      }
      if (typeof ack === 'function') ack({ ok });
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

    // cliente antigo (de antes do mp3 vir sempre no grito) pedindo a voz da frase
    socket.on('pedir-voz', ({ frase, lugar } = {}, ack) => {
      if (typeof ack !== 'function') return;
      if (!R || typeof frase !== 'string' || typeof lugar !== 'number') return ack(null);
      ack(R.arquivoVoz(frase, lugar));
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.cartas && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarCartas };
