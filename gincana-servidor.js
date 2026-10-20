// Gincana (no céu, acima do parque): o servidor manda nas fases e em quem chegou e quem caiu.
//
// Fases: espera (ninguém) -> contagem (quem entra pelo portal espera na largada, atrás do portão)
// -> corrida (o portão abre; a ordem de chegada fica guardada) -> intervalo -> final (todo mundo no
// piso de hexágonos que cai: pisou, cai daqui a pouco, para todos) -> fim (o último em pé leva a
// coroa) -> contagem de novo, se ainda tiver gente. Os obstáculos e as quedas são de cada navegador;
// aqui só chegam "cheguei", "caí" e "pisei neste piso".

let G = null;
import('./public/js/gincana-dados.js')
  .then((m) => { G = m; })
  .catch((err) => console.warn('  Dados da gincana não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const nova = () => ({ fase: 'espera', ate: 0, desde: Date.now(), jogadores: new Map(), semente: 1, pisos: new Map(), chegadas: 0, quedas: 0, vencedor: null, rodada: 0 });

const publico = (g) => ({
  fase: g.fase, falta: Math.max(0, g.ate - Date.now()), semente: g.semente, vencedor: g.vencedor, rodada: g.rodada,
  jogadores: [...g.jogadores.values()].map(({ id, nome, cor, chegou, tempo, caiu }) => ({ id, nome, cor, chegou, tempo, caiu })),
  // pisos caindo: [id, ms até cair]
  pisos: [...g.pisos].map(([id, em]) => [id, Math.max(0, em - Date.now())]),
});

function ligarGincana(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('gc-estado', publico(room.gincana));

  function fase(room, nome, segundos) {
    const g = room.gincana;
    g.fase = nome;
    g.desde = Date.now();
    g.ate = Date.now() + segundos * 1000;
    avisar(room);
  }

  function comecarContagem(room) {
    const g = room.gincana;
    for (const j of g.jogadores.values()) Object.assign(j, { chegou: null, tempo: null, caiu: null, atrasado: false });
    g.pisos.clear();
    g.chegadas = 0;
    g.quedas = 0;
    g.vencedor = null;
    g.semente = Math.floor(Math.random() * 1e9);
    g.rodada++;
    fase(room, 'contagem', G.TEMPOS.contagem);
  }

  // a final acabou: o último em pé (ou o último a cair) vence
  function fimDaFinal(room) {
    const g = room.gincana;
    const lista = [...g.jogadores.values()];
    const emPe = lista.filter((j) => !j.caiu);
    let v = emPe.length === 1 ? emPe[0] : null;
    if (!v && emPe.length > 1) v = emPe.sort((a, b) => (a.chegou ?? 99) - (b.chegou ?? 99))[0]; // o tempo acabou: quem chegou antes
    if (!v && lista.length) v = lista.sort((a, b) => (b.caiu ?? 0) - (a.caiu ?? 0))[0];
    g.vencedor = v ? { id: v.id, nome: v.nome, cor: v.cor } : null;
    if (v && lista.length > 1) {
      const u = room.users.get(v.id);
      if (u) darMoedas?.(room, u, 30, 'coroa da gincana');
    }
    fase(room, 'fim', G.TEMPOS.fim);
  }

  function tic(room) {
    const g = room.gincana;
    const agora = Date.now();
    if (!g.jogadores.size) {
      if (g.fase !== 'espera') {
        g.fase = 'espera';
        g.pisos.clear();
        avisar(room);
      }
      return;
    }
    if (g.fase === 'espera') return comecarContagem(room);
    const todos = [...g.jogadores.values()];
    if (g.fase === 'contagem' && agora >= g.ate) return fase(room, 'corrida', G.TEMPOS.corrida);
    if (g.fase === 'corrida') {
      // todo mundo chegou, ou o tempo acabou
      if (agora >= g.ate || todos.every((j) => j.chegou !== null)) return fase(room, 'intervalo', G.TEMPOS.intervalo);
    }
    if (g.fase === 'intervalo' && agora >= g.ate) {
      g.pisos.clear();
      return fase(room, 'final', G.TEMPOS.final);
    }
    if (g.fase === 'final') {
      const emPe = todos.filter((j) => !j.caiu).length;
      if (agora >= g.ate || emPe === 0 || (todos.length > 1 && emPe <= 1)) return fimDaFinal(room);
    }
    if (g.fase === 'fim' && agora >= g.ate) comecarContagem(room);
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

    socket.on('gc-ver', (ack) => {
      const { g } = daSala();
      ack?.(g ? publico(g) : null);
    });

    socket.on('gc-entrar', (_, ack) => {
      const { room, user, g } = daSala();
      if (!g || !jogoLigado(room, 'gincana')) return ack?.({ erro: 'desligado' });
      // chegou com a corrida ou a final valendo: espera a próxima (assiste da sacada)
      const atrasado = g.fase === 'corrida' || g.fase === 'intervalo' || g.fase === 'final';
      g.jogadores.set(user.id, { id: user.id, nome: user.name, cor: user.color, chegou: null, tempo: null, caiu: atrasado ? -1 : null, atrasado });
      avisar(room);
      ack?.({ ok: true, fase: g.fase, atrasado });
    });

    socket.on('gc-sair', () => {
      const { room, user, g } = daSala();
      if (g?.jogadores.delete(user.id)) avisar(room);
    });

    socket.on('gc-chegou', () => {
      const { room, user, g } = daSala();
      const j = g?.jogadores.get(user.id);
      if (!j || g.fase !== 'corrida' || j.chegou !== null || j.atrasado) return;
      j.chegou = ++g.chegadas;
      j.tempo = Math.round((Date.now() - g.desde) / 100) / 10;
      io.to(room.id).emit('gc-chegada', { id: j.id, nome: j.nome, ordem: j.chegou, tempo: j.tempo });
      if (j.chegou === 1 && g.jogadores.size > 1) {
        const u = room.users.get(user.id);
        if (u) darMoedas?.(room, u, 10, 'primeiro na corrida da gincana');
      }
      avisar(room);
    });

    // caiu da final
    socket.on('gc-caiu', () => {
      const { room, user, g } = daSala();
      const j = g?.jogadores.get(user.id);
      if (!j || g.fase !== 'final' || j.caiu !== null) return;
      j.caiu = ++g.quedas;
      io.to(room.id).emit('gc-queda', { id: j.id, nome: j.nome });
      avisar(room);
    });

    // pisou num hexágono da final: ele cai daqui a pouco, para todo mundo
    socket.on('gc-pisou', (id) => {
      const { room, user, g } = daSala();
      const n = num(id);
      if (!g?.jogadores.has(user.id) || g.fase !== 'final' || n === null || n < 0 || n >= G.PISOS.length || g.pisos.has(n)) return;
      g.pisos.set(n, Date.now() + G.FINAL.caiEm);
      io.to(room.id).emit('gc-piso', [n, G.FINAL.caiEm]);
    });

    // uma porta falsa quebrou: some para todos
    socket.on('gc-porta', (k) => {
      const { room, g } = daSala();
      const n = num(k);
      if (!g || n === null || n < 0 || n > 5) return;
      io.to(room.id).emit('gc-porta', n);
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.gincana?.jogadores.delete(user?.id)) avisar(room);
    });
  };
}

module.exports = { ligarGincana };
