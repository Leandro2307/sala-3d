// Pinta-território (arena do parque): o servidor guarda a grade do chão (de que time é cada metro),
// conta a área de cada time, manda nas rodadas e em quem foi pintado.
//
// Quem atira manda o tiro (os outros veem a tinta voando) e, quando ela cai no chão, onde caiu: o
// servidor pinta a grade e repassa para todos desenharem. Acertou alguém do outro time, o navegador
// de quem atirou avisa; com 3 acertos ele volta para a base (e fica uns segundos protegido).
const { carregarPorMapa, comMapa } = require('./mapa-servidor.js');

let P = null;
const DADOS = carregarPorMapa('pinta-dados.js'); // um módulo por mapa (mapa-servidor.js)
DADOS.pronto
  .then((m) => { P = m; })
  .catch((err) => console.warn('  Dados do pinta-território não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);

const nova = () => ({ fase: 'espera', ate: 0, jogadores: new Map(), grade: new Uint8Array(P.PINTA.n * P.PINTA.n), area: [0, 0], vencedor: null });
const publico = (pt) => ({
  fase: pt.fase, falta: Math.max(0, pt.ate - Date.now()), area: pt.area, total: pt.grade.length, vencedor: pt.vencedor,
  jogadores: [...pt.jogadores.values()].map(({ id, nome, cor, time, pontos }) => ({ id, nome, cor, time, pontos })),
});

function ligarPinta(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('pt-estado', publico(room.pinta));

  function fase(room, nome, segundos) {
    const pt = room.pinta;
    pt.fase = nome;
    pt.ate = Date.now() + segundos * 1000;
    avisar(room);
  }

  function limpar(room) {
    const pt = room.pinta;
    pt.grade.fill(0);
    pt.area = [0, 0];
    pt.vencedor = null;
    for (const j of pt.jogadores.values()) Object.assign(j, { vida: P.PINTA.vida, pontos: 0, protegidoAte: 0 });
    io.to(room.id).emit('pt-limpar');
  }

  function tirar(room, id) {
    if (room.pinta?.jogadores.delete(id)) avisar(room);
  }

  setInterval(() => {
    if (!P) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      DADOS.usar(room);
      const pt = room.pinta;
      if (!pt) continue;
      if (!jogoLigado(room, 'pinta')) {
        if (pt.jogadores.size) {
          pt.jogadores.clear();
          avisar(room);
        }
        continue;
      }
      // quem caiu ou saiu da arena (3 s de folga: a posição chega depois de um teleporte)
      for (const j of [...pt.jogadores.values()]) {
        const p = ondeEsta(room.users.get(j.id));
        const longe = !p || !P.naArena(p, 8);
        if (!longe) j.longeDesde = 0;
        else j.longeDesde ||= agora;
        if (!room.users.has(j.id) || (longe && agora - j.longeDesde > 3000)) tirar(room, j.id);
      }
      if (!pt.jogadores.size) {
        if (pt.fase !== 'espera') {
          pt.fase = 'espera';
          limpar(room);
          avisar(room);
        }
        continue;
      }
      if (pt.fase === 'espera') {
        limpar(room);
        fase(room, 'contagem', P.TEMPOS_PINTA.contagem);
      } else if (pt.fase === 'contagem' && agora >= pt.ate) {
        limpar(room);
        fase(room, 'jogo', P.TEMPOS_PINTA.jogo);
      } else if (pt.fase === 'jogo') {
        io.to(room.id).volatile.emit('pt-area', pt.area);
        if (agora >= pt.ate) {
          const [a, b] = pt.area;
          pt.vencedor = a === b ? null : a > b ? 0 : 1;
          const doisTimes = new Set([...pt.jogadores.values()].map((j) => j.time)).size > 1;
          if (pt.vencedor !== null && doisTimes) {
            for (const j of pt.jogadores.values()) {
              const u = room.users.get(j.id);
              if (j.time === pt.vencedor && u) darMoedas?.(room, u, 15, 'vitória no pinta-território');
            }
          }
          fase(room, 'fim', P.TEMPOS_PINTA.fim);
        }
      } else if (pt.fase === 'fim' && agora >= pt.ate) {
        limpar(room);
        fase(room, 'contagem', P.TEMPOS_PINTA.contagem);
      }
    }
  }, 1000);

  return function porSocket(socket, quemDaSala) {
    const quem = comMapa(quemDaSala, DADOS);
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !P) return {};
      room.pinta ||= nova();
      return { room, user, pt: room.pinta };
    };

    socket.on('pt-ver', (ack) => {
      const { pt } = daSala();
      ack?.(pt ? { estado: publico(pt), grade: Buffer.from(pt.grade).toString('base64') } : null);
    });

    socket.on('pt-entrar', (_, ack) => {
      const { room, user, pt } = daSala();
      if (!pt || !jogoLigado(room, 'pinta')) return ack?.({ erro: 'desligado' });
      if (!pt.jogadores.has(user.id)) {
        const n = [0, 1].map((t) => [...pt.jogadores.values()].filter((j) => j.time === t).length);
        const time = n[0] === n[1] ? Math.round(Math.random()) : n[0] < n[1] ? 0 : 1;
        pt.jogadores.set(user.id, { id: user.id, nome: user.name, cor: user.color, time, vida: P.PINTA.vida, pontos: 0, protegidoAte: 0, tiros: [] });
        avisar(room);
      }
      ack?.({ ok: true, time: pt.jogadores.get(user.id).time });
    });

    socket.on('pt-sair', () => {
      const { room, user } = quem();
      if (room?.pinta && user) tirar(room, user.id);
    });

    // atirou: os outros veem a tinta voando ([ox, oy, oz, vx, vy, vz])
    socket.on('pt-tiro', (a) => {
      const { room, user, pt } = daSala();
      const j = pt?.jogadores.get(user.id);
      if (!j || pt.fase !== 'jogo' || !Array.isArray(a) || a.length !== 6 || !a.every((n) => num(n) !== null)) return;
      socket.to(room.id).volatile.emit('pt-tiro', [j.time, ...a]);
    });

    // a tinta caiu no chão: pinta a grade
    socket.on('pt-tinta', (a) => {
      const { room, user, pt } = daSala();
      const j = pt?.jogadores.get(user.id);
      const x = num(a?.[0]);
      const z = num(a?.[1]);
      const eu = ondeEsta(user);
      if (!j || pt.fase !== 'jogo' || x === null || z === null || !eu || Math.hypot(x - eu.x, z - eu.z) > 40) return;
      // no máximo uns 12 por segundo
      const agora = Date.now();
      j.tiros = j.tiros.filter((t) => agora - t < 1000);
      if (j.tiros.length >= 12) return;
      j.tiros.push(agora);
      const d = P.pintarGrade(pt.grade, x, z, j.time + 1);
      pt.area[0] += d[0];
      pt.area[1] += d[1];
      j.pontos += Math.max(0, d[j.time]);
      io.to(room.id).emit('pt-tinta', [Math.round(x * 100) / 100, Math.round(z * 100) / 100, j.time]);
    });

    // a tinta acertou alguém do outro time
    socket.on('pt-acerto', (id) => {
      const { room, user, pt } = daSala();
      const j = pt?.jogadores.get(user.id);
      const alvo = pt?.jogadores.get(id);
      if (!j || !alvo || pt.fase !== 'jogo' || alvo.time === j.time || Date.now() < alvo.protegidoAte) return;
      const a = ondeEsta(room.users.get(alvo.id));
      const b = ondeEsta(user);
      if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > 40) return;
      alvo.vida--;
      io.to(alvo.id).emit('pt-dano', { vida: alvo.vida });
      if (alvo.vida > 0) return;
      alvo.vida = P.PINTA.vida;
      alvo.protegidoAte = Date.now() + P.PINTA.protecao + 500;
      io.to(alvo.id).emit('pt-splat', { por: j.nome });
      io.to(room.id).emit('pt-abate', { por: j.nome, porTime: j.time, alvo: alvo.nome });
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.pinta && user) tirar(room, user.id);
    });
  };
}

module.exports = { ligarPinta };
