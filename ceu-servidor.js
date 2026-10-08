// Surf e mata-mata (os dois no céu, ver public/js/ceu-dados.js).
//
// Surf: cada um anda com a própria física no navegador; aqui fica só o placar dos tempos.
// Mata-mata: quem entra nasce com pistola e pega as outras armas do chão. O servidor sabe quem
// está com qual arma (é ela que vale no tiro, em vez da escolhida no menu), conta os abates e
// faz as armas do chão voltarem. O tiro e o nocaute continuam passando pelo server.js.

let D = null; // os dados (módulo ES)
import('./public/js/ceu-dados.js')
  .then((m) => { D = m; })
  .catch((err) => console.warn('  Dados do surf/mata-mata não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);

function novaArena() {
  return { jogadores: new Map(), itens: D.ARENA.itens.map(() => ({ volta: 0 })), fimEm: 0, vencedor: null };
}

function ligarCeu(io, rooms, jogoLigado, getBoards) {
  const arenaPublica = (a) => ({
    jogadores: [...a.jogadores].map(([id, j]) => ({ id, nome: j.nome, cor: j.cor, abates: j.abates, mortes: j.mortes, arma: j.arma })),
    itens: a.itens.map((i) => Math.max(0, i.volta - Date.now())), // ms até voltar (0: está lá)
    vencedor: a.vencedor,
  });
  const avisar = (room) => io.to(room.id).emit('mm-estado', room.matamata ? arenaPublica(room.matamata) : null);

  // as armas voltam sozinhas; a rodada acabada recomeça
  setInterval(() => {
    if (!D) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      const a = room.matamata;
      if (!a) continue;
      let mudou = false;
      for (const i of a.itens) {
        if (i.volta && i.volta <= agora) {
          i.volta = 0;
          mudou = true;
        }
      }
      if (a.fimEm && a.fimEm <= agora) {
        a.fimEm = 0;
        a.vencedor = null;
        for (const j of a.jogadores.values()) {
          j.abates = 0;
          j.mortes = 0;
        }
        mudou = true;
      }
      if (mudou) avisar(room);
    }
  }, 500);

  const api = {
    // a arma que vale no tiro de quem está na arena (null: fora dela, vale a regra de sempre)
    armaNaArena(room, user) {
      const j = room?.matamata?.jogadores.get(user?.id);
      if (!j || !jogoLigado(room, 'matamata') || !D.naArena(ondeEsta(user))) return null;
      return j.arma;
    },
    // nocaute (chamado pelo 'ko' do server.js): conta o abate e a vítima volta com a pistola
    nocaute(room, vitima, autor) {
      const a = room?.matamata;
      const v = a?.jogadores.get(vitima.id);
      if (!v) return;
      v.mortes++;
      v.arma = D.ARENA.inicial;
      const k = autor && autor.id !== vitima.id ? a.jogadores.get(autor.id) : null;
      if (k && !a.fimEm) {
        k.abates++;
        if (k.abates >= D.ARENA.abates) {
          a.vencedor = { nome: k.nome, cor: k.cor };
          a.fimEm = Date.now() + 7000;
        }
      }
      avisar(room);
    },
  };

  api.porSocket = function porSocket(socket, quem) {
    const sair = () => {
      const { room, user } = quem();
      const a = room?.matamata;
      if (!a || !user || !a.jogadores.delete(user.id)) return;
      if (!a.jogadores.size) room.matamata = null;
      avisar(room);
    };

    socket.on('mm-entrar', (ack) => {
      const { room, user } = quem();
      if (!room || !user || !D || !jogoLigado(room, 'matamata')) return ack?.({ erro: 'desligado' });
      room.matamata ||= novaArena();
      const a = room.matamata;
      if (!a.jogadores.has(user.id)) a.jogadores.set(user.id, { nome: user.name, cor: user.color, abates: 0, mortes: 0, arma: D.ARENA.inicial });
      avisar(room);
      ack?.({ ok: true });
    });
    socket.on('mm-sair', sair);
    socket.on('disconnect', sair);

    socket.on('mm-ver', (ack) => {
      const { room } = quem();
      ack?.(room?.matamata ? arenaPublica(room.matamata) : null);
    });

    // pegou uma arma do chão
    socket.on('mm-pegar', (i) => {
      const { room, user } = quem();
      const a = room?.matamata;
      const j = a?.jogadores.get(user?.id);
      const item = D?.ARENA.itens[i];
      if (!j || !item || a.itens[i].volta) return;
      const p = ondeEsta(user);
      const A = D.ARENA;
      if (!p || Math.hypot(p.x - (A.x + item.x), p.z - (A.z + item.z)) > 3 || Math.abs(p.y - (A.y + item.y)) > 3) return;
      j.arma = item.tipo;
      a.itens[i].volta = Date.now() + A.volta;
      avisar(room);
    });

    // surf: terminou o percurso
    socket.on('surf-fim', (tempo) => {
      const { room, user } = quem();
      if (!room || !user || !jogoLigado(room, 'surf')) return;
      const t = Number(tempo);
      if (!Number.isFinite(t) || t < 10 || t > 3600) return;
      const placar = (getBoards(room.id).surf ||= []);
      const meu = placar.find((e) => e.name === user.name);
      const recorde = !meu || t < meu.time;
      if (meu && recorde) Object.assign(meu, { time: t, color: user.color });
      else if (!meu) placar.push({ name: user.name, color: user.color, time: t });
      placar.sort((x, y) => x.time - y.time);
      placar.length = Math.min(placar.length, 10);
      io.to(room.id).emit('surf-fim', { name: user.name, color: user.color, time: t, recorde, placar });
    });
    socket.on('surf-ver', (ack) => {
      const { room } = quem();
      ack?.(room ? getBoards(room.id).surf || [] : []);
    });
  };
  return api;
}

module.exports = { ligarCeu };
