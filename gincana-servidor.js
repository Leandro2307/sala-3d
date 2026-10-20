// Gincana (como o Fall Guys): o servidor manda no show — 10 fases e a final, cada uma num lugar bem
// longe do mapa — nos pontos de cada um e em quem chegou e quem caiu.
//
// Fases do show: espera (ninguém) -> contagem (quem entra pelo portal espera na largada da 1ª
// fase) -> para cada fase: intro (o nome dela e 3, 2, 1; o portão fechado) -> jogo -> resultado
// (os pontos da fase) -> fim (quem fez mais pontos leva a coroa) -> contagem de novo, se ainda
// tiver gente. Quem entra com uma fase valendo assiste da sacada e joga a próxima.
//
// Os obstáculos e as quedas são de cada navegador; aqui só chegam "cheguei", "caí", "quebrei esta
// porta (ou este piso falso)" e "pisei neste hexágono".

let G = null;
import('./public/js/gincana-dados.js')
  .then((m) => { G = m; })
  .catch((err) => console.warn('  Dados da gincana não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inteiro = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : null);

const nova = () => ({
  fase: 'espera', k: 0, ate: 0, desde: Date.now(), dur: 0, jogadores: new Map(), semente: 1, show: 0,
  quebrados: new Set(), pisos: new Map(), chegadas: 0, quedas: 0, primeiroEm: 0, vencedor: null,
});

const publico = (g) => ({
  fase: g.fase, k: g.k, dur: g.dur, falta: Math.max(0, g.ate - Date.now()), semente: g.semente, show: g.show, vencedor: g.vencedor,
  jogadores: [...g.jogadores.values()].map(({ id, nome, cor, pontos, ganho, chegou, tempo, caiu, atrasado }) => ({ id, nome, cor, pontos, ganho, chegou, tempo, caiu, atrasado })),
  quebrados: [...g.quebrados],
  // hexágonos caindo: [id, ms até cair]
  pisos: [...g.pisos].map(([id, em]) => [id, Math.max(0, em - Date.now())]),
});

const zerarFase = (j) => Object.assign(j, { chegou: null, tempo: null, caiu: null, caiuEm: null, atrasado: false, ganho: 0 });

function ligarGincana(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('gc-estado', publico(room.gincana));

  function fase(room, nome, segundos) {
    const g = room.gincana;
    g.fase = nome;
    g.desde = Date.now();
    g.dur = segundos * 1000;
    g.ate = g.desde + g.dur;
    avisar(room);
  }

  // show novo: todo mundo zerado, esperando na largada da 1ª fase
  function comecarShow(room) {
    const g = room.gincana;
    g.show++;
    g.k = 0;
    g.vencedor = null;
    g.semente = Math.floor(Math.random() * 1e9);
    g.quebrados.clear();
    g.pisos.clear();
    for (const j of g.jogadores.values()) Object.assign(zerarFase(j), { pontos: 0 });
    fase(room, 'contagem', G.TEMPOS.contagem);
  }

  function intro(room, k) {
    const g = room.gincana;
    g.k = k;
    g.semente = Math.floor(Math.random() * 1e9);
    g.quebrados.clear();
    g.pisos.clear();
    g.chegadas = 0;
    g.quedas = 0;
    g.primeiroEm = 0;
    for (const j of g.jogadores.values()) zerarFase(j);
    fase(room, 'intro', G.TEMPOS.intro);
  }

  // a fase acabou? (o tempo, ou ninguém mais tem o que fazer nela)
  function acabou(g) {
    const def = G.FASES[g.k];
    const agora = Date.now();
    const ativos = [...g.jogadores.values()].filter((j) => !j.atrasado);
    if (agora >= g.ate || !ativos.length) return true;
    if (def.tipo === 'corrida') {
      if (ativos.every((j) => j.chegou !== null || j.caiu !== null)) return true;
      return !!g.primeiroEm && ativos.length > 1 && agora - g.primeiroEm > G.TEMPOS.depoisDoPrimeiro * 1000;
    }
    const emPe = ativos.filter((j) => j.caiu === null).length;
    if (def.tipo === 'sobrevivencia') return emPe === 0;
    return emPe === 0 || (ativos.length > 1 && emPe <= 1); // a final
  }

  // os pontos da fase que acabou
  function pontuar(room) {
    const g = room.gincana;
    const def = G.FASES[g.k];
    const P = G.PONTOS;
    const T = Math.max(1, g.dur);
    const aguentou = (j) => Math.min(1, (j.caiuEm ?? T) / T);
    const ativos = [...g.jogadores.values()].filter((j) => !j.atrasado);
    for (const j of g.jogadores.values()) j.ganho = 0;
    if (def.tipo === 'corrida') {
      for (const j of ativos) {
        if (j.chegou) j.ganho = P.corrida[j.chegou - 1] ?? P.corridaMin;
        else if (j.caiu !== null) j.ganho = Math.round(P.gosma * aguentou(j));
      }
    } else if (def.tipo === 'sobrevivencia') {
      for (const j of ativos) j.ganho = j.caiu === null ? P.sobreviveu : Math.round(P.sobrevivencia * aguentou(j));
    } else {
      const emPe = ativos.filter((j) => j.caiu === null);
      const caidos = ativos.filter((j) => j.caiu !== null).sort((a, b) => b.caiu - a.caiu);
      for (const j of emPe) j.ganho = emPe.length === 1 ? P.final[0] : P.finalEmPe;
      caidos.forEach((j, i) => { j.ganho = P.final[emPe.length + i] ?? P.finalMin; });
    }
    for (const j of g.jogadores.values()) j.pontos += j.ganho;
  }

  // a coroa: quem fez mais pontos (empate: quem foi melhor na final)
  function fimDoShow(room) {
    const g = room.gincana;
    const lista = [...g.jogadores.values()].sort((a, b) => b.pontos - a.pontos || b.ganho - a.ganho);
    const v = lista[0];
    g.vencedor = v ? { id: v.id, nome: v.nome, cor: v.cor, pontos: v.pontos } : null;
    const u = v && room.users.get(v.id);
    if (u && lista.length > 1) darMoedas?.(room, u, 40, 'coroa da gincana');
    else if (u) darMoedas?.(room, u, 10, 'gincana completa');
    fase(room, 'fim', G.TEMPOS.fim);
  }

  function tic(room) {
    const g = room.gincana;
    if (!g.jogadores.size) {
      if (g.fase !== 'espera') {
        g.fase = 'espera';
        g.pisos.clear();
        avisar(room);
      }
      return;
    }
    const agora = Date.now();
    if (g.fase === 'espera') return comecarShow(room);
    if (g.fase === 'contagem' && agora >= g.ate) return intro(room, 0);
    if (g.fase === 'intro' && agora >= g.ate) return fase(room, 'jogo', G.FASES[g.k].tempo);
    if (g.fase === 'jogo' && acabou(g)) {
      pontuar(room);
      return fase(room, 'resultado', G.TEMPOS.resultado);
    }
    if (g.fase === 'resultado' && agora >= g.ate) return g.k + 1 < G.FASES.length ? intro(room, g.k + 1) : fimDoShow(room);
    if (g.fase === 'fim' && agora >= g.ate) comecarShow(room);
  }

  setInterval(() => {
    if (!G) return;
    for (const room of rooms.values()) {
      if (!room.gincana) continue;
      if (!jogoLigado(room, 'gincana')) {
        if (room.gincana.jogadores.size) {
          room.gincana.jogadores.clear();
          avisar(room);
        }
        continue;
      }
      // quem caiu da conexão
      for (const id of [...room.gincana.jogadores.keys()]) if (!room.users.has(id)) room.gincana.jogadores.delete(id);
      tic(room);
    }
  }, 250);

  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !G) return {};
      room.gincana ||= nova();
      return { room, user, g: room.gincana };
    };
    // o jogador desta conexão, valendo na fase que está rolando
    const emJogo = () => {
      const { room, user, g } = daSala();
      const j = g?.jogadores.get(user.id);
      if (!j || g.fase !== 'jogo' || j.atrasado) return {};
      return { room, g, j, def: G.FASES[g.k] };
    };

    socket.on('gc-ver', (ack) => {
      const { g } = daSala();
      ack?.(g ? publico(g) : null);
    });

    socket.on('gc-entrar', (_, ack) => {
      const { room, user, g } = daSala();
      if (!g || !jogoLigado(room, 'gincana')) return ack?.({ erro: 'desligado' });
      // chegou com uma fase valendo: assiste da sacada e joga a próxima (os pontos começam do zero)
      const atrasado = g.fase === 'jogo';
      if (!g.jogadores.has(user.id)) {
        g.jogadores.set(user.id, { ...zerarFase({ id: user.id, nome: user.name, cor: user.color }), pontos: 0, atrasado });
        avisar(room);
      }
      ack?.({ ok: true, fase: g.fase, atrasado: g.jogadores.get(user.id).atrasado });
    });

    socket.on('gc-sair', () => {
      const { room, user, g } = daSala();
      if (g?.jogadores.delete(user.id)) avisar(room);
    });

    socket.on('gc-chegou', () => {
      const { room, g, j, def } = emJogo();
      if (!j || def.tipo !== 'corrida' || j.chegou !== null || j.caiu !== null) return;
      j.chegou = ++g.chegadas;
      j.tempo = Math.round((Date.now() - g.desde) / 100) / 10;
      if (j.chegou === 1) g.primeiroEm = Date.now();
      io.to(room.id).emit('gc-chegada', { id: j.id, nome: j.nome, ordem: j.chegou, tempo: j.tempo });
      avisar(room);
    });

    // caiu fora: na sobrevivência, na final ou na gosma
    socket.on('gc-caiu', () => {
      const { room, g, j, def } = emJogo();
      if (!j || j.caiu !== null || j.chegou !== null || (def.tipo === 'corrida' && !def.gosma)) return;
      j.caiu = ++g.quedas;
      j.caiuEm = Date.now() - g.desde;
      io.to(room.id).emit('gc-queda', { id: j.id, nome: j.nome });
      avisar(room);
    });

    // quebrou uma porta falsa ou um piso falso: quebra para todos (e fica quebrado na fase)
    socket.on('gc-quebra', (id) => {
      const { room, g, def } = emJogo();
      const n = def ? inteiro(id, def.quebraveis || 0) : null;
      if (n === null || g.quebrados.has(n)) return;
      g.quebrados.add(n);
      io.to(room.id).emit('gc-quebra', n);
    });

    // pisou num hexágono da final: ele cai daqui a pouco, para todo mundo
    socket.on('gc-pisou', (id) => {
      const { room, g, j, def } = emJogo();
      const n = def?.hex ? inteiro(num(id), def.pisos) : null;
      if (n === null || j.caiu !== null || g.pisos.has(n)) return;
      g.pisos.set(n, Date.now() + def.hex.caiEm);
      io.to(room.id).emit('gc-piso', [n, def.hex.caiEm]);
    });

    // só para testar (GINCANA_TESTE=1 no ambiente): pula direto para a fase k
    if (process.env.GINCANA_TESTE) {
      socket.on('gc-pular', (k) => {
        const { room, g } = daSala();
        const n = inteiro(k, G?.FASES.length || 0);
        if (g?.jogadores.size && n !== null) intro(room, n);
      });
    }

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.gincana?.jogadores.delete(user?.id)) avisar(room);
    });
  };
}

module.exports = { ligarGincana };
