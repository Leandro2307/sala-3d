// Mata-mata em times (ver public/js/batalha-dados.js). O servidor é quem manda: em que time cada um
// está, quem está de pé, a fase da rodada e o relógio. O tiro e o nocaute continuam passando pelo
// server.js, que pergunta aqui se valem: do mesmo time, ou espectador, não leva nem dá dano.
//
// Fases: 'espera' (falta gente num dos times: dá para treinar, e quem cai levanta), 'preparo'
// (contagem, todo mundo parado no nascimento), 'luta', 'fimRodada' e 'fimPartida'. Na luta, quem
// cai fica de espectador até a próxima rodada.
const { contarAbate, zerarSerie, armaDoAbate } = require('./abates');

let D = null; // os dados (módulo ES)
let ARMAS = {};
Promise.all([import('./public/js/batalha-dados.js'), import('./public/js/armas-dados.js')])
  .then(([m, a]) => { D = m; ARMAS = a.ARMAS; })
  .catch((err) => console.warn('  Dados do mata-mata em times não carregaram:', err.message));

const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const VALENDO = ['preparo', 'luta', 'fimRodada']; // nessas fases quem cai não levanta

function novaBatalha() {
  return {
    jogadores: new Map(), placar: [0, 0], rodada: 0, fase: 'espera', ate: 0,
    vencedor: null, campeao: null, primeiro: false, noInicio: [0, 0], seq: 0,
    itens: D.BATALHA.itens.map(() => ({ volta: 0 })),
  };
}

function ligarBatalha(io, rooms, jogoLigado) {
  const lista = (b) => [...b.jogadores.values()];
  const contar = (b, time, soVivos = false) => lista(b).filter((j) => j.time === time && (!soVivos || j.vivo)).length;

  const publica = (b) => ({
    fase: b.fase,
    resta: Math.max(0, b.ate - Date.now()),
    rodada: b.rodada,
    placar: b.placar,
    vencedor: b.vencedor,
    campeao: b.campeao,
    vencer: D.BATALHA.vencer,
    jogadores: lista(b).map((j) => ({ id: j.id, nome: j.nome, cor: j.cor, time: j.time, vivo: j.vivo, abates: j.abates, mortes: j.mortes, arma: j.arma, vaga: j.vaga })),
    itens: b.itens.map((i) => Math.max(0, i.volta - Date.now())),
  });
  const avisar = (room) => io.to(room.id).emit('bt-estado', room.batalha ? publica(room.batalha) : null);

  // os dois times com gente: a partida pode andar
  const temJogo = (b) => contar(b, 0) > 0 && contar(b, 1) > 0;

  // time com menos gente (empate: o que está perdendo; empate de novo: sorteio)
  function timeParaQuem(b) {
    const n = [contar(b, 0), contar(b, 1)];
    if (n[0] !== n[1]) return n[0] < n[1] ? 0 : 1;
    if (b.placar[0] !== b.placar[1]) return b.placar[0] < b.placar[1] ? 0 : 1;
    return Math.random() < 0.5 ? 0 : 1;
  }

  function comecarRodada(room) {
    const b = room.batalha;
    // time com dois a mais que o outro (alguém saiu): o último a chegar troca de lado
    for (let n = [contar(b, 0), contar(b, 1)]; Math.abs(n[0] - n[1]) >= 2; n = [contar(b, 0), contar(b, 1)]) {
      const maior = n[0] > n[1] ? 0 : 1;
      const ultimo = lista(b).filter((j) => j.time === maior).sort((a, c) => c.chegou - a.chegou)[0];
      ultimo.time = 1 - maior;
    }
    b.rodada++;
    b.fase = 'preparo';
    b.ate = Date.now() + D.BATALHA.preparo * 1000;
    b.vencedor = null;
    b.noInicio = [contar(b, 0), contar(b, 1)];
    const vagas = [0, 0];
    for (const j of b.jogadores.values()) {
      j.vivo = true;
      j.arma = D.BATALHA.inicial;
      j.abatesRodada = 0;
      j.vaga = vagas[j.time]++ % D.BATALHA.nascer[j.time].length;
      zerarSerie(j);
    }
    for (const i of b.itens) i.volta = 0;
  }

  function fimDaRodada(room, vencedor) {
    const b = room.batalha;
    b.fase = 'fimRodada';
    b.vencedor = vencedor; // 0, 1 ou -1 (empate)
    if (vencedor >= 0) b.placar[vencedor]++;
    b.ate = Date.now() + D.BATALHA.fimRodada * 1000;
  }

  // alguém caiu ou saiu: um time inteiro no chão acaba a rodada
  function conferir(room) {
    const b = room.batalha;
    if (!b || (b.fase !== 'luta' && b.fase !== 'preparo')) return;
    const vivos = [contar(b, 0, true), contar(b, 1, true)];
    if (vivos[0] && vivos[1]) return;
    fimDaRodada(room, vivos[0] ? 0 : vivos[1] ? 1 : -1);
  }

  setInterval(() => {
    if (!D) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      const b = room.batalha;
      if (!b) continue;
      let mudou = false;
      for (const i of b.itens) {
        if (i.volta && i.volta <= agora) {
          i.volta = 0;
          mudou = true;
        }
      }
      if (b.fase === 'espera') {
        if (temJogo(b)) {
          comecarRodada(room);
          mudou = true;
        }
      } else if (b.ate <= agora) {
        mudou = true;
        if (b.fase === 'preparo') {
          b.fase = 'luta';
          b.ate = agora + D.BATALHA.tempo * 1000;
        } else if (b.fase === 'luta') {
          // acabou o tempo: ganha quem tem mais gente de pé
          const vivos = [contar(b, 0, true), contar(b, 1, true)];
          fimDaRodada(room, vivos[0] === vivos[1] ? -1 : vivos[0] > vivos[1] ? 0 : 1);
        } else if (b.fase === 'fimRodada' && Math.max(...b.placar) >= D.BATALHA.vencer) {
          b.fase = 'fimPartida';
          b.campeao = b.placar[0] > b.placar[1] ? 0 : 1;
          b.ate = agora + D.BATALHA.fimPartida * 1000;
        } else {
          if (b.fase === 'fimPartida') {
            b.placar = [0, 0];
            b.rodada = 0;
            b.campeao = null;
            b.primeiro = false; // o primeiro sangue é um por partida
            for (const j of b.jogadores.values()) {
              j.abates = 0;
              j.mortes = 0;
            }
          }
          if (temJogo(b)) comecarRodada(room);
          else {
            b.fase = 'espera';
            b.vencedor = null;
            for (const j of b.jogadores.values()) j.vivo = true;
          }
        }
      }
      if (mudou) avisar(room);
    }
  }, 250);

  const daBatalha = (room, user) => (user && room?.batalha?.jogadores.get(user.id)) || null;

  const api = {
    // a arma que vale no tiro de quem está na arena (null: fora dela, vale a regra de sempre)
    armaNaArena(room, user) {
      const j = daBatalha(room, user);
      if (!j || !jogoLigado(room, 'batalha') || !D.naBatalha(ondeEsta(user))) return null;
      return j.arma;
    },
    // caído (espectador) ou na contagem: não atira
    semTiro(room, user) {
      const j = daBatalha(room, user);
      return !!j && (!j.vivo || room.batalha.fase === 'preparo');
    },
    // o golpe de autor pode tirar vida de alvo? (mesmo time ou espectador, não)
    podeAcertar(room, autor, alvo) {
      const a = daBatalha(room, autor);
      const v = daBatalha(room, alvo);
      if (!a && !v) return true;
      if (!a || !v) return false; // de fora para dentro da batalha (ou o contrário), não
      return a.vivo && v.vivo && a.time !== v.time && room.batalha.fase !== 'preparo';
    },
    // nocaute (chamado pelo 'ko' do server.js)
    nocaute(room, vitima, autor, arma) {
      const b = room?.batalha;
      const v = daBatalha(room, vitima);
      if (!v || !v.vivo) return;
      zerarSerie(v);
      if (!VALENDO.includes(b.fase)) return; // na espera ninguém conta, e quem cai levanta
      v.vivo = false;
      v.mortes++;
      v.arma = D.BATALHA.inicial;
      const k = autor && autor.id !== vitima.id ? daBatalha(room, autor) : null;
      const vale = k && k.time !== v.time;
      if (vale) {
        k.abates++;
        k.abatesRodada++;
      }
      const serie = vale ? contarAbate(k) : 0;
      const primeiro = vale && !b.primeiro;
      if (vale) b.primeiro = true;
      // ACE: derrubou sozinho o time inteiro do outro lado (com pelo menos 2)
      const ace = vale && b.noInicio[v.time] >= 2 && k.abatesRodada >= b.noInicio[v.time] && contar(b, v.time, true) === 0;
      io.to(room.id).emit('mm-abate', {
        modo: 'times',
        autor: k ? { id: k.id, nome: k.nome, cor: k.cor, time: k.time } : null,
        vitima: { id: v.id, nome: v.nome, cor: v.cor, time: v.time },
        arma: armaDoAbate(arma, ARMAS),
        serie, primeiro, ace,
      });
      conferir(room);
      avisar(room);
    },
  };

  api.porSocket = function porSocket(socket, quem) {
    const sair = () => {
      const { room, user } = quem();
      const b = room?.batalha;
      if (!b || !user || !b.jogadores.delete(user.id)) return;
      if (!b.jogadores.size) {
        room.batalha = null;
      } else if (b.fase === 'preparo' || b.fase === 'luta') {
        if (!temJogo(b)) fimDaRodada(room, contar(b, 0) ? 0 : 1); // o outro time ficou vazio: W.O.
        else conferir(room);
      }
      avisar(room);
    };

    socket.on('bt-entrar', (ack) => {
      const { room, user } = quem();
      if (!room || !user || !D || !jogoLigado(room, 'batalha')) return ack?.({ erro: 'desligado' });
      room.batalha ||= novaBatalha();
      const b = room.batalha;
      if (!b.jogadores.has(user.id)) {
        const time = timeParaQuem(b);
        // entrou com a rodada valendo: espera de espectador (na contagem ainda dá tempo)
        const vivo = b.fase === 'espera' || b.fase === 'preparo';
        b.jogadores.set(user.id, {
          id: user.id, nome: user.name, cor: user.color, time, vivo, abates: 0, mortes: 0, abatesRodada: 0,
          arma: D.BATALHA.inicial, vaga: contar(b, time) % D.BATALHA.nascer[time].length, chegou: ++b.seq,
        });
        if (b.fase === 'preparo') b.noInicio[time]++;
      }
      avisar(room);
      ack?.({ ok: true });
    });
    socket.on('bt-sair', sair);
    socket.on('disconnect', sair);

    socket.on('bt-ver', (ack) => {
      const { room } = quem();
      ack?.(room?.batalha ? publica(room.batalha) : null);
    });

    // trocar de time: só sem desequilibrar (no máximo um a mais) e fora da luta (ou já caído)
    socket.on('bt-trocar', (ack) => {
      const { room, user } = quem();
      const b = room?.batalha;
      const j = daBatalha(room, user);
      if (!j) return ack?.({ erro: 'fora' });
      if (j.vivo && (b.fase === 'luta' || b.fase === 'preparo')) return ack?.({ erro: 'Só dá para trocar de time caído ou entre as partidas.' });
      const novo = 1 - j.time;
      if (contar(b, novo) + 1 > contar(b, j.time)) return ack?.({ erro: `Trocando, os ${D.TIMES[novo].nome} ficariam com gente demais.` });
      j.time = novo;
      j.vaga = (contar(b, novo) - 1) % D.BATALHA.nascer[novo].length;
      if (b.fase !== 'espera') j.vivo = false; // no lado novo, espera a próxima rodada
      conferir(room);
      avisar(room);
      ack?.({ ok: true });
    });

    // pegou uma arma do chão
    socket.on('bt-pegar', (i) => {
      const { room, user } = quem();
      const b = room?.batalha;
      const j = daBatalha(room, user);
      const item = D?.BATALHA.itens[i];
      if (!j || !j.vivo || !item || b.itens[i].volta) return;
      const p = ondeEsta(user);
      const A = D.BATALHA;
      if (!p || Math.hypot(p.x - (A.x + item.x), p.z - (A.z + item.z)) > 3 || Math.abs(p.y - (A.y + item.y)) > 3) return;
      j.arma = item.tipo;
      b.itens[i].volta = Date.now() + A.volta;
      avisar(room);
    });
  };
  return api;
}

module.exports = { ligarBatalha };
