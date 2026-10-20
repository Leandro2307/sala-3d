// Queimada (quadra do parque): o servidor manda na bola, em quem está com ela e em quem foi queimado.
//
// Como no basquete (quadras-servidor.js): quem passa perto da bola solta pede para pegar; quem está
// com ela arremessa (o navegador manda a bola nova) e o servidor anda com ela daí em diante. A cada
// passo ele confere se a bola, ainda sem tocar no chão, encostou em alguém do outro time em campo:
// queimou (vai para o cemitério) — a não ser que esse alguém estivesse defendendo, aí ele pega a
// bola. Quem queima do cemitério volta para o campo. Time sem ninguém em campo perde a rodada.

let F = null;
import('./public/js/queimada-fisica.js')
  .then((m) => { F = m; })
  .catch((err) => console.warn('  Física da queimada não carregou:', err.message));

const PASSO = 1 / 60;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vetor = (a) => (Array.isArray(a) && a.length === 3 && a.every((n) => num(n) !== null) ? { x: a[0], y: a[1], z: a[2] } : null);
const arred = (n) => Math.round(n * 100) / 100;
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);

const bolaNoMeio = () => ({ p: { x: F.QUEIMADA.cx, y: F.QUEIMADA.raio, z: F.QUEIMADA.cz }, v: { x: 0, y: 0, z: 0 } });
const novaQueimada = () => ({ jogadores: new Map(), fase: 'jogo', vencedor: null, ate: 0, placar: [0, 0], bola: bolaNoMeio(), dono: null, lancador: null, direto: false, parada: 0, tic: 0, largou: { id: null, em: 0 } });

const publico = (q) => ({
  fase: q.fase, vencedor: q.vencedor, placar: q.placar, falta: Math.max(0, q.ate - Date.now()),
  jogadores: [...q.jogadores.values()].map(({ id, nome, cor, time, vivo }) => ({ id, nome, cor, time, vivo })),
});
const bolaArr = (q) => [arred(q.bola.p.x), arred(q.bola.p.y), arred(q.bola.p.z), arred(q.bola.v.x), arred(q.bola.v.y), arred(q.bola.v.z), q.dono, q.lancador];

function ligarQueimada(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('qm-estado', publico(room.queimada));
  const mandarBola = (room) => io.to(room.id).emit('qm-bola', bolaArr(room.queimada));

  const emCampo = (q, time) => [...q.jogadores.values()].filter((j) => j.time === time && j.vivo);
  const doTime = (q, time) => [...q.jogadores.values()].filter((j) => j.time === time);

  function soltarBola(room, onde = null) {
    const q = room.queimada;
    q.dono = null;
    q.lancador = null;
    q.direto = false;
    q.bola = onde ? { p: { x: onde.x, y: Math.max(onde.y, F.QUEIMADA.raio), z: onde.z }, v: { x: 0, y: 0, z: 0 } } : bolaNoMeio();
    q.parada = 0;
  }

  // a rodada acabou se um time (com gente) não tem mais ninguém em campo
  function conferirFim(room) {
    const q = room.queimada;
    if (q.fase !== 'jogo') return;
    if (!doTime(q, 0).length || !doTime(q, 1).length) return;
    for (const t of [0, 1]) {
      if (emCampo(q, t).length) continue;
      const v = 1 - t;
      q.fase = 'fim';
      q.vencedor = v;
      q.placar[v]++;
      q.ate = Date.now() + 6000;
      for (const j of doTime(q, v)) {
        const u = room.users.get(j.id);
        if (u) darMoedas?.(room, u, 10, 'rodada da queimada');
      }
      avisar(room);
      return;
    }
  }

  function queimar(room, j, por) {
    j.vivo = false;
    io.to(room.id).emit('qm-queimado', { id: j.id, nome: j.nome, por: por?.nome || '' });
    // quem queimou do cemitério volta para o campo
    if (por && !por.vivo) {
      por.vivo = true;
      io.to(room.id).emit('qm-voltou', { id: por.id, nome: por.nome });
    }
    avisar(room);
    conferirFim(room);
  }

  function tic(room) {
    const q = room.queimada;
    const Q = F.QUEIMADA;
    if (q.fase === 'fim') {
      if (Date.now() < q.ate) return;
      // rodada nova: todo mundo em campo, bola no meio
      for (const j of q.jogadores.values()) j.vivo = true;
      q.fase = 'jogo';
      q.vencedor = null;
      soltarBola(room);
      io.to(room.id).emit('qm-recomecar');
      avisar(room);
      mandarBola(room);
      return;
    }
    if (q.dono) {
      const u = room.users.get(q.dono);
      const p = ondeEsta(u);
      const j = q.jogadores.get(q.dono);
      if (!u || !p || !j) {
        soltarBola(room, p);
        avisar(room);
        mandarBola(room);
        return;
      }
      q.bola.p = { x: p.x, y: p.y + 1.3, z: p.z };
      q.bola.v = { x: 0, y: 0, z: 0 };
      if (++q.tic % 6 === 0) io.to(room.id).volatile.emit('qm-bola', bolaArr(q));
      return;
    }
    const chao = F.andarQueimada(q.bola, PASSO);
    // ainda no ar depois do arremesso: queima quem for do outro time e estiver em campo
    if (q.direto && q.lancador) {
      const lancador = q.jogadores.get(q.lancador);
      for (const j of q.jogadores.values()) {
        if (!lancador || j.time === lancador.time || !j.vivo) continue;
        const pos = ondeEsta(room.users.get(j.id));
        if (!pos || !F.bolaNoCorpo(q.bola.p, pos, 0.05)) continue;
        if (Date.now() < (j.defendeAte || 0)) {
          // defendeu: fica com a bola
          q.dono = j.id;
          q.lancador = null;
          q.direto = false;
          io.to(room.id).emit('qm-defendeu', { id: j.id, nome: j.nome });
          avisar(room);
          mandarBola(room);
          return;
        }
        // queimou: a bola bate e cai
        q.direto = false;
        q.bola.v = { x: -q.bola.v.x * 0.25, y: 2.5, z: -q.bola.v.z * 0.25 };
        queimar(room, j, lancador);
        mandarBola(room);
        return;
      }
    }
    if (chao) q.direto = false;
    // parada (ou longe) fora de qualquer zona: volta para o meio
    const { p, v } = q.bola;
    const parada = Math.hypot(v.x, v.y, v.z) < 0.3;
    q.parada = parada ? q.parada + PASSO : 0;
    const A = F.AREA_QUEIMADA;
    const fora = p.x < A.x0 - 1 || p.x > A.x1 + 1 || p.z < A.z0 - 1 || p.z > A.z1 + 1;
    const longe = p.x < A.x0 - 14 || p.x > A.x1 + 14 || p.z < A.z0 - 12 || p.z > A.z1 + 12;
    if (longe || (fora && q.parada > 1.5)) {
      // para o campo do lado em que ela saiu
      soltarBola(room, { x: Q.cx + (p.x < Q.cx ? -4 : 4), y: Q.raio, z: Q.cz });
      mandarBola(room);
      return;
    }
    if (!parada && ++q.tic % 3 === 0) io.to(room.id).volatile.emit('qm-bola', bolaArr(q));
  }

  function tirar(room, id) {
    const q = room.queimada;
    if (!q?.jogadores.has(id)) return;
    q.jogadores.delete(id);
    if (q.dono === id) soltarBola(room, ondeEsta(room.users.get(id)));
    if (!q.jogadores.size) {
      q.fase = 'jogo';
      q.vencedor = null;
      soltarBola(room);
    }
    avisar(room);
    mandarBola(room);
    conferirFim(room);
  }

  // a cada segundo: quem foi para longe da quadra sai do jogo
  setInterval(() => {
    if (!F) return;
    const A = F.AREA_QUEIMADA;
    for (const room of rooms.values()) {
      const q = room.queimada;
      if (!q?.jogadores.size) continue;
      for (const j of [...q.jogadores.values()]) {
        const p = ondeEsta(room.users.get(j.id));
        // longe por mais de 3 s (a posição chega um tiquinho depois de um teleporte)
        const longe = !p || p.x < A.x0 - 20 || p.x > A.x1 + 20 || p.z < A.z0 - 20 || p.z > A.z1 + 20;
        if (!longe) j.longeDesde = 0;
        else j.longeDesde ||= Date.now();
        if ((longe && Date.now() - j.longeDesde > 3000) || !jogoLigado(room, 'queimada')) tirar(room, j.id);
      }
    }
  }, 1000);

  let ultimoTic = performance.now();
  let sobra = 0;
  setInterval(() => {
    const agora = performance.now();
    sobra = Math.min(sobra + (agora - ultimoTic) / 1000, PASSO * 6);
    ultimoTic = agora;
    if (!F) return;
    for (; sobra >= PASSO; sobra -= PASSO) {
      for (const room of rooms.values()) {
        if (!room.queimada?.jogadores.size || !jogoLigado(room, 'queimada')) continue;
        tic(room);
      }
    }
  }, PASSO * 1000);

  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !F) return {};
      room.queimada ||= novaQueimada();
      return { room, user, q: room.queimada };
    };

    socket.on('qm-ver', (ack) => {
      const { q } = daSala();
      if (!q) return ack?.(null);
      ack?.({ estado: publico(q), bola: bolaArr(q) });
    });

    // entrar: vai para o time com menos gente
    socket.on('qm-entrar', (_, ack) => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'queimada')) return ack?.({ erro: 'desligado' });
      if (q.jogadores.has(user.id)) return ack?.({ erro: 'ja' });
      const n0 = doTime(q, 0).length;
      const n1 = doTime(q, 1).length;
      const time = n0 === n1 ? Math.round(Math.random()) : n0 < n1 ? 0 : 1;
      // chegou com a rodada valendo: entra em campo (não espera)
      q.jogadores.set(user.id, { id: user.id, nome: user.name, cor: user.color, time, vivo: true, defendeAte: 0, defendeuEm: 0 });
      avisar(room);
      ack?.({ ok: true, time });
    });

    socket.on('qm-sair', () => {
      const { room, user } = quem();
      if (room?.queimada && user) tirar(room, user.id);
    });

    socket.on('qm-pegar', () => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'queimada') || q.dono || q.fase !== 'jogo') return;
      const j = q.jogadores.get(user.id);
      const eu = ondeEsta(user);
      if (!j || !eu) return;
      if (q.largou.id === user.id && Date.now() - q.largou.em < 500) return;
      const b = q.bola.p;
      if (Math.hypot(b.x - eu.x, b.z - eu.z) > 2.2 || b.y - eu.y > 2.6) return;
      // só a bola que está na sua zona (com uma folguinha na linha do meio)
      if (!F.naZona(b, F.zonaQueimada(j.time, j.vivo), 1)) return;
      q.dono = user.id;
      q.lancador = null;
      q.direto = false;
      avisar(room);
      mandarBola(room);
    });

    socket.on('qm-lancar', (msg) => {
      const { room, user, q } = daSala();
      if (!q || q.dono !== user.id) return;
      const p = vetor(msg?.p);
      const vel = vetor(msg?.v);
      const eu = ondeEsta(user);
      if (!p || !vel || !eu || Math.hypot(p.x - eu.x, p.z - eu.z) > 2.5) return;
      const m = Math.hypot(vel.x, vel.y, vel.z);
      const k = m > 27 ? 27 / m : 1;
      q.bola = { p, v: { x: vel.x * k, y: vel.y * k, z: vel.z * k } };
      q.dono = null;
      q.lancador = user.id;
      q.direto = true;
      q.parada = 0;
      q.largou = { id: user.id, em: Date.now() };
      avisar(room);
      mandarBola(room);
    });

    // segurar a defesa: por um instante, a bola que encostar é pega (não queima)
    socket.on('qm-defender', () => {
      const { q, user } = daSala();
      const j = q?.jogadores.get(user.id);
      if (!j || q.dono === user.id) return;
      const agora = Date.now();
      if (agora - j.defendeuEm < F.QUEIMADA.recargaDefesa) return;
      j.defendeuEm = agora;
      j.defendeAte = agora + F.QUEIMADA.defesa;
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.queimada && user) tirar(room, user.id);
    });
  };
}

module.exports = { ligarQueimada };
