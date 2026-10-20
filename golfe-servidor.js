// Minigolfe (parque): cada um joga a própria bolinha no navegador; o servidor guarda em que buraco
// cada um está e as tacadas, repassa a posição das bolinhas para os outros verem e dá as moedas de
// quem termina os 9 buracos (mais para quem fica no par ou abaixo dele).

let G = null;
import('./public/js/golfe-dados.js')
  .then((m) => { G = m; })
  .catch((err) => console.warn('  Dados do minigolfe não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);

const publico = (g) => ({
  jogadores: [...g.jogadores.values()].map(({ id, nome, cor, buraco, tacadas, atual, fim }) => ({ id, nome, cor, buraco, tacadas, atual, fim })),
  recordes: g.recordes,
});

function ligarGolfe(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('gf-estado', publico(room.golfe));

  function tirar(room, id) {
    if (!room.golfe?.jogadores.delete(id)) return;
    io.to(room.id).emit('gf-saiu', id);
    avisar(room);
  }

  // quem foi para longe do minigolfe (ou com o jogo desligado) sai da partida
  setInterval(() => {
    if (!G) return;
    for (const room of rooms.values()) {
      const g = room.golfe;
      if (!g?.jogadores.size) continue;
      for (const j of [...g.jogadores.values()]) {
        const p = ondeEsta(room.users.get(j.id));
        const h = G.BURACOS[Math.min(j.buraco, 8)];
        if (!p || Math.hypot(p.x - h.origem.x, p.z - h.origem.z) > 90 || !jogoLigado(room, 'golfe')) tirar(room, j.id);
      }
    }
  }, 2000);

  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !G) return {};
      room.golfe ||= { jogadores: new Map(), recordes: [] };
      return { room, user, g: room.golfe };
    };

    socket.on('gf-ver', (ack) => {
      const { g } = daSala();
      ack?.(g ? publico(g) : null);
    });

    // começar (ou recomeçar) a partida, no 1º buraco
    socket.on('gf-entrar', (_, ack) => {
      const { room, user, g } = daSala();
      if (!g || !jogoLigado(room, 'golfe')) return ack?.({ erro: 'desligado' });
      g.jogadores.set(user.id, { id: user.id, nome: user.name, cor: user.color, buraco: 0, tacadas: [], atual: 0, fim: false });
      avisar(room);
      ack?.({ ok: true });
    });

    socket.on('gf-sair', () => {
      const { room, user } = quem();
      if (room?.golfe && user) tirar(room, user.id);
    });

    socket.on('gf-tacada', (buraco) => {
      const { room, user, g } = daSala();
      const j = g?.jogadores.get(user.id);
      if (!j || j.fim || num(buraco) !== j.buraco) return;
      j.atual = Math.min(G.GOLFE.maxTacadas, j.atual + 1);
      avisar(room);
    });

    // a bolinha caiu no copo (ou acabaram as tacadas): fecha o buraco e vai para o próximo
    socket.on('gf-buraco', (msg) => {
      const { room, user, g } = daSala();
      const j = g?.jogadores.get(user.id);
      if (!j || j.fim || num(msg?.buraco) !== j.buraco) return;
      const tacadas = Math.max(1, Math.min(G.GOLFE.maxTacadas, Math.max(j.atual, num(msg?.tacadas) ?? j.atual)));
      j.tacadas.push(tacadas);
      j.atual = 0;
      j.buraco++;
      if (j.buraco >= G.BURACOS.length) {
        j.fim = true;
        const total = j.tacadas.reduce((s, n) => s + n, 0);
        g.recordes.push({ nome: j.nome, cor: j.cor, total });
        g.recordes.sort((a, b) => a.total - b.total);
        g.recordes.length = Math.min(g.recordes.length, 8);
        const u = room.users.get(user.id);
        if (u) darMoedas?.(room, u, total <= G.PAR_TOTAL ? 30 : 15, total <= G.PAR_TOTAL ? 'minigolfe no par' : 'minigolfe completo');
        io.to(room.id).emit('gf-fim', { id: j.id, nome: j.nome, total, par: G.PAR_TOTAL });
      }
      avisar(room);
    });

    // a posição da minha bolinha, para os outros verem (até ~10 por segundo)
    let ultima = 0;
    socket.on('gf-bola', (a) => {
      const { room, user, g } = daSala();
      if (!g?.jogadores.has(user.id) || !Array.isArray(a) || a.length !== 2) return;
      const x = num(a[0]);
      const z = num(a[1]);
      const agora = Date.now();
      if (x === null || z === null || agora - ultima < 80) return;
      ultima = agora;
      socket.to(room.id).volatile.emit('gf-bola', { id: user.id, x, z });
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.golfe && user) tirar(room, user.id);
    });
  };
}

module.exports = { ligarGolfe };
