// Futebol de carro: o servidor manda na bola, no placar e no relógio da partida.
//
// Cada um dirige o próprio carro no navegador e manda a posição (fut-carro), que só é repassada.
// A bola anda aqui, com a mesma física do navegador (public/js/futebol-fisica.js). Quem encosta
// nela calcula o chute na hora, sem esperar a rede, e manda a bola nova (fut-toque): o servidor
// aceita se ela estiver perto de onde ele acha que a bola está, e todos passam a seguir dali.
// Os gols, o relógio e a saída de bola são daqui.

let F = null; // a física (módulo ES, carregado uma vez)
import('./public/js/futebol-fisica.js')
  .then((m) => { F = m; })
  .catch((err) => console.warn('  Física do futebol não carregou (estádio sem partida):', err.message));

const PASSO = 1 / 60;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vetor = (a) => (Array.isArray(a) && a.length === 3 && a.every((n) => num(n) !== null) ? { x: a[0], y: a[1], z: a[2] } : null);
const arred = (n) => Math.round(n * 100) / 100;

function novaPartida() {
  return {
    jogadores: new Map(), // id -> { time, nome, cor, lugar }
    placar: [0, 0],
    fase: 'espera', // espera | saida | jogo | gol | fim
    ate: 0, // quando a fase atual termina (saida, gol, fim)
    tempo: 0, // segundos de jogo que faltam (abaixo de 0: prorrogação)
    prorrogacao: false,
    bola: { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } },
    toque: { id: null, seq: 0, nome: '' }, // o último que chutou
    marcou: null, // { time, nome } do último gol
    tic: 0,
  };
}

function bolaNoMeio(pt) {
  pt.bola.p = { x: 0, y: F ? F.BOLA.raio : 1.5, z: 0 };
  pt.bola.v = { x: 0, y: 0, z: 0 };
  pt.toque = { id: null, seq: pt.toque.seq, nome: '' };
}

// o que todo mundo precisa saber da partida (vai a cada mudança, não a cada quadro)
function publico(pt) {
  const agora = Date.now();
  return {
    fase: pt.fase,
    falta: Math.max(0, pt.ate - agora), // ms até acabar a fase
    tempo: Math.round(pt.tempo),
    prorrogacao: pt.prorrogacao,
    placar: pt.placar,
    marcou: pt.marcou,
    jogadores: [...pt.jogadores].map(([id, j]) => ({ id, time: j.time, nome: j.nome, cor: j.cor, lugar: j.lugar })),
  };
}

function ligarFutebol(io, rooms, jogoLigado) {
  const avisar = (room) => io.to(room.id).emit('fut-estado', publico(room.futebol));

  // Saída de bola: cada um volta para o seu lugar (o cliente põe o carro lá ao ver a fase)
  function saida(room) {
    const pt = room.futebol;
    bolaNoMeio(pt);
    const n = [0, 0];
    for (const j of pt.jogadores.values()) j.lugar = n[j.time]++;
    pt.fase = 'saida';
    pt.ate = Date.now() + F.PARTIDA.saidaMs;
    avisar(room);
  }

  function comecar(room) {
    const pt = room.futebol;
    pt.placar = [0, 0];
    pt.tempo = F.PARTIDA.duracao;
    pt.prorrogacao = false;
    pt.marcou = null;
    saida(room);
  }

  function tic(room) {
    const pt = room.futebol;
    const agora = Date.now();
    if (pt.fase === 'espera') return;
    if (pt.fase === 'saida' || pt.fase === 'gol' || pt.fase === 'fim') {
      if (agora < pt.ate) return;
      if (pt.fase === 'saida') {
        pt.fase = 'jogo';
        avisar(room);
      } else if (pt.fase === 'gol') {
        // no tempo esgotado (ou gol de ouro na prorrogação) a partida acaba aqui
        if (pt.prorrogacao || pt.tempo <= 0) {
          pt.fase = 'fim';
          pt.ate = agora + F.PARTIDA.fimMs;
          avisar(room);
        } else saida(room);
      } else comecar(room);
      return;
    }
    // em jogo
    F.andarBola(pt.bola, PASSO);
    if (!pt.prorrogacao) {
      pt.tempo -= PASSO;
      // acabou o tempo: com a bola no chão encerra (como no jogo); empatado, gol de ouro
      if (pt.tempo <= 0 && pt.bola.p.y < F.BOLA.raio + 0.3) {
        pt.tempo = 0;
        if (pt.placar[0] === pt.placar[1]) {
          pt.prorrogacao = true;
          avisar(room);
        } else {
          pt.fase = 'fim';
          pt.ate = agora + F.PARTIDA.fimMs;
          avisar(room);
          return;
        }
      }
    }
    const marcou = F.gol(pt.bola.p);
    if (marcou !== null) {
      pt.placar[marcou]++;
      // gol contra também conta (para o outro time), mas o nome só vai se foi a favor
      const autor = pt.toque.id && pt.jogadores.get(pt.toque.id);
      pt.marcou = { time: marcou, nome: autor && autor.time === marcou ? autor.nome : '' };
      pt.fase = 'gol';
      pt.ate = agora + F.PARTIDA.golMs;
      avisar(room);
      return;
    }
    // a bola para todos a 20 Hz (o navegador prevê entre um e outro)
    if (++pt.tic % 3 === 0) {
      const { p, v } = pt.bola;
      io.to(room.id).volatile.emit('fut-bola', [arred(p.x), arred(p.y), arred(p.z), arred(v.x), arred(v.y), arred(v.z), pt.toque.id, pt.toque.seq]);
    }
    // o relógio vai junto com o estado uma vez por segundo (o cliente conta entre um e outro)
    if (pt.tic % 60 === 0) avisar(room);
  }

  setInterval(() => {
    if (!F) return;
    for (const room of rooms.values()) {
      if (!room.futebol?.jogadores.size) continue;
      tic(room);
    }
  }, PASSO * 1000);

  // os recados de cada um (chamado no 'connection'; quem: () => { room, user })
  return function porSocket(socket, quem) {
    const sair = () => {
      const { room, user } = quem();
      const pt = room?.futebol;
      if (!pt || !pt.jogadores.delete(user.id)) return;
      if (!pt.jogadores.size) room.futebol = null; // sem ninguém: a próxima começa do zero
      else avisar(room);
      socket.to(room.id).emit('fut-saiu', user.id);
      if (!room.futebol) io.to(room.id).emit('fut-estado', null);
    };

    socket.on('fut-entrar', (msg, ack) => {
      const { room, user } = quem();
      if (!room || !user || !F || !jogoLigado(room, 'futebol')) return ack?.({ erro: 'desligado' });
      room.futebol ||= novaPartida();
      const pt = room.futebol;
      if (!pt.jogadores.has(user.id)) {
        // o time com menos gente (empate: o que a pessoa pediu, ou o azul)
        const n = [0, 0];
        for (const j of pt.jogadores.values()) n[j.time]++;
        const pediu = msg?.time === 0 || msg?.time === 1 ? msg.time : null;
        const time = n[0] === n[1] ? (pediu ?? 0) : n[0] < n[1] ? 0 : 1;
        pt.jogadores.set(user.id, { time, nome: user.name, cor: user.color, lugar: n[time] });
      }
      if (pt.fase === 'espera') comecar(room);
      else avisar(room);
      ack?.({ ok: true, eu: user.id, estado: publico(pt) });
    });

    socket.on('fut-sair', sair);
    socket.on('disconnect', sair);

    // o carro de quem joga: só repassa (x y z, giro em quatérnio, turbo ligado)
    socket.on('fut-carro', (c) => {
      const { room, user } = quem();
      if (!room?.futebol?.jogadores.has(user.id) || !Array.isArray(c) || c.length !== 8 || !c.every((n) => num(n) !== null)) return;
      socket.to(room.id).volatile.emit('fut-carro', { id: user.id, c });
    });

    // chutou: a bola nova, como ficou logo depois do toque no navegador de quem chutou
    socket.on('fut-toque', (msg) => {
      const { room, user } = quem();
      const pt = room?.futebol;
      if (!pt?.jogadores.has(user.id) || pt.fase !== 'jogo') return;
      const p = vetor(msg?.p);
      const v = vetor(msg?.v);
      const seq = num(msg?.seq);
      if (!p || !v || seq === null) return;
      // longe demais de onde a bola está aqui: atraso grande ou trapaça — não vale
      const b = pt.bola.p;
      if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) > 9) return;
      const vel = Math.hypot(v.x, v.y, v.z);
      const k = vel > F.BOLA.maxVel ? F.BOLA.maxVel / vel : 1;
      pt.bola.p = p;
      pt.bola.v = { x: v.x * k, y: v.y * k, z: v.z * k };
      F.colidirCampo(pt.bola.p, pt.bola.v, F.BOLA.raio);
      pt.toque = { id: user.id, seq, nome: user.name };
      const { p: bp, v: bv } = pt.bola;
      io.to(room.id).emit('fut-bola', [arred(bp.x), arred(bp.y), arred(bp.z), arred(bv.x), arred(bv.y), arred(bv.z), user.id, seq]);
    });

    // quem chega na sala vê a partida que está rolando
    socket.on('fut-ver', (ack) => {
      const { room } = quem();
      ack?.(room?.futebol ? publico(room.futebol) : null);
    });
  };
}

module.exports = { ligarFutebol };
