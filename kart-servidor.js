// Kart (kartódromo do parque): o servidor manda nas fases da corrida, na colocação, nas caixas de
// item, nas cascas de banana no chão e nos mísseis.
//
// Cada um dirige o próprio kart no navegador e manda a volta e a fração da volta (kt-prog); daqui
// sai a ordem. Caixa pega some por uns segundos para todos e dá um item sorteado pela colocação
// (quem vem atrás ganha mais turbo e míssil). A casca fica no chão até alguém passar por cima; o
// míssil vai no carro da frente e chega depois de um tempo (quem leva é que roda, no navegador dele).

let K = null;
import('./public/js/kart-dados.js')
  .then((m) => { K = m; })
  .catch((err) => console.warn('  Dados do kart não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const MAX_PILOTOS = 8;

const novo = () => ({ fase: 'espera', ate: 0, desde: 0, pilotos: new Map(), caixas: new Map(), cascas: new Map(), seqCasca: 0, chegadas: 0, primeiroEm: 0, corrida: 0 });

// a colocação: quem chegou (na ordem), depois quem corre (pela distância), e quem espera a próxima
const ordem = (k) => [...k.pilotos.values()].sort((a, b) => {
  if (a.espera !== b.espera) return a.espera ? 1 : -1;
  if (a.chegou && b.chegou) return a.chegou - b.chegou;
  if (a.chegou) return -1;
  if (b.chegou) return 1;
  return b.volta + b.t - (a.volta + a.t);
});

const publico = (k) => ({
  fase: k.fase, falta: Math.max(0, k.ate - Date.now()), corrida: k.corrida,
  pilotos: ordem(k).map(({ id, nome, cor, volta, chegou, tempo, grid, espera }) => ({ id, nome, cor, volta, chegou, tempo, grid, espera })),
  caixas: [...k.caixas].map(([id, ate]) => [id, Math.max(0, ate - Date.now())]),
  cascas: [...k.cascas].map(([id, c]) => [id, c.x, c.z]),
});

function ligarKart(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room) => io.to(room.id).emit('kt-estado', publico(room.kart));

  function fase(room, nome, segundos) {
    const k = room.kart;
    k.fase = nome;
    k.desde = Date.now();
    k.ate = Date.now() + segundos * 1000;
    avisar(room);
  }

  function prepararCorrida(room) {
    const k = room.kart;
    k.corrida++;
    k.chegadas = 0;
    k.primeiroEm = 0;
    k.caixas.clear();
    k.cascas.clear();
    let g = 0;
    for (const p of k.pilotos.values()) Object.assign(p, { volta: 0, t: 0, chegou: null, tempo: null, grid: g++, espera: false, ultimaVolta: 0 });
    fase(room, 'largada', K.TEMPOS_KART.largada);
  }

  function fimDaCorrida(room) {
    const k = room.kart;
    const lista = ordem(k).filter((p) => p.chegou);
    const premios = [30, 15, 8];
    if (k.pilotos.size > 1) {
      lista.slice(0, 3).forEach((p, i) => {
        const u = room.users.get(p.id);
        if (u) darMoedas?.(room, u, premios[i], `${i + 1}º lugar no kart`);
      });
    } else if (lista[0]) {
      const u = room.users.get(lista[0].id);
      if (u) darMoedas?.(room, u, 5, 'corrida de kart completa');
    }
    fase(room, 'fim', K.TEMPOS_KART.fim);
  }

  setInterval(() => {
    if (!K) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      const k = room.kart;
      if (!k) continue;
      if (!jogoLigado(room, 'kart')) {
        if (k.pilotos.size) {
          k.pilotos.clear();
          k.fase = 'espera';
          avisar(room);
        }
        continue;
      }
      for (const id of [...k.pilotos.keys()]) if (!room.users.has(id)) k.pilotos.delete(id);
      if (!k.pilotos.size) {
        if (k.fase !== 'espera') {
          k.fase = 'espera';
          avisar(room);
        }
        continue;
      }
      // caixas que voltaram
      for (const [id, ate] of k.caixas) if (agora >= ate) k.caixas.delete(id);
      if (k.fase === 'espera') fase(room, 'contagem', K.TEMPOS_KART.contagem);
      else if (k.fase === 'contagem' && agora >= k.ate) prepararCorrida(room);
      else if (k.fase === 'largada' && agora >= k.ate) fase(room, 'corrida', K.TEMPOS_KART.maxCorrida);
      else if (k.fase === 'corrida') {
        const todos = [...k.pilotos.values()];
        const acabou = todos.every((p) => p.chegou || p.espera) || agora >= k.ate || (k.primeiroEm && agora - k.primeiroEm > K.TEMPOS_KART.depoisDoPrimeiro * 1000);
        if (acabou) fimDaCorrida(room);
      } else if (k.fase === 'fim' && agora >= k.ate) fase(room, 'contagem', K.TEMPOS_KART.contagem);
    }
  }, 250);

  // a ordem muda o tempo todo: manda a colocação 2 vezes por segundo, só durante a corrida
  setInterval(() => {
    if (!K) return;
    for (const room of rooms.values()) {
      const k = room.kart;
      if (k?.fase === 'corrida' && k.pilotos.size) io.to(room.id).volatile.emit('kt-ordem', ordem(k).map((p) => [p.id, p.volta, p.chegou]));
    }
  }, 500);

  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !K) return {};
      room.kart ||= novo();
      return { room, user, k: room.kart };
    };

    socket.on('kt-ver', (ack) => {
      const { k } = daSala();
      ack?.(k ? publico(k) : null);
    });

    // entrar na próxima corrida (com uma valendo, espera a próxima)
    socket.on('kt-entrar', (_, ack) => {
      const { room, user, k } = daSala();
      if (!k || !jogoLigado(room, 'kart')) return ack?.({ erro: 'desligado' });
      if (k.pilotos.size >= MAX_PILOTOS && !k.pilotos.has(user.id)) return ack?.({ erro: 'cheio' });
      const valendo = k.fase === 'largada' || k.fase === 'corrida';
      k.pilotos.set(user.id, { id: user.id, nome: user.name, cor: user.color, volta: 0, t: 0, chegou: null, tempo: null, grid: -1, ultimaVolta: 0, espera: valendo });
      avisar(room);
      ack?.({ ok: true, valendo });
    });

    socket.on('kt-sair', () => {
      const { room, user, k } = daSala();
      if (k?.pilotos.delete(user.id)) avisar(room);
    });

    // onde estou na pista: volta e fração da volta
    socket.on('kt-prog', (msg) => {
      const { room, user, k } = daSala();
      const p = k?.pilotos.get(user.id);
      if (!p || k.fase !== 'corrida' || p.chegou || p.espera) return;
      const volta = num(msg?.volta);
      const t = num(msg?.t);
      if (volta === null || t === null) return;
      // uma volta a mais de cada vez, e não em menos de 20 s
      if (volta === p.volta + 1 && Date.now() - p.ultimaVolta > 20_000) {
        p.volta = volta;
        p.ultimaVolta = Date.now();
      }
      p.t = Math.max(0, Math.min(0.999, t));
      if (p.volta >= K.KART.voltas) {
        p.chegou = ++k.chegadas;
        p.tempo = Math.round((Date.now() - k.desde) / 100) / 10;
        if (p.chegou === 1) k.primeiroEm = Date.now();
        io.to(room.id).emit('kt-chegada', { id: p.id, nome: p.nome, ordem: p.chegou, tempo: p.tempo });
        avisar(room);
      }
    });

    // passou por uma caixa de item
    socket.on('kt-caixa', (id, ack) => {
      const { room, user, k } = daSala();
      const p = k?.pilotos.get(user.id);
      const n = num(id);
      const c = n !== null && K.CAIXAS_ITEM[n];
      const eu = ondeEsta(user);
      if (!p || p.espera || k.fase !== 'corrida' || !c || k.caixas.has(n) || !eu || Math.hypot(eu.x - c.x, eu.z - c.z) > 8) return ack?.(null);
      k.caixas.set(n, Date.now() + 4000);
      const lista = ordem(k).filter((x) => !x.espera);
      const item = K.sortearItem(lista.findIndex((x) => x.id === user.id), lista.length);
      io.to(room.id).emit('kt-caixa', [n, 4000]);
      ack?.(item);
    });

    // soltou uma casca atrás do kart
    socket.on('kt-casca', (msg) => {
      const { room, user, k } = daSala();
      const x = num(msg?.x);
      const z = num(msg?.z);
      if (!k?.pilotos.has(user.id) || k.fase !== 'corrida' || x === null || z === null) return;
      const id = ++k.seqCasca;
      k.cascas.set(id, { x, z, de: user.id });
      if (k.cascas.size > 24) k.cascas.delete(k.cascas.keys().next().value);
      io.to(room.id).emit('kt-casca', [id, x, z]);
    });

    // passou por cima de uma casca: ela some para todos
    socket.on('kt-pisou', (id) => {
      const { room, k } = daSala();
      const n = num(id);
      if (!k || n === null || !k.cascas.delete(n)) return;
      io.to(room.id).emit('kt-tirar-casca', n);
    });

    // míssil: vai no carro da frente (quem está em primeiro manda no segundo)
    socket.on('kt-missil', () => {
      const { room, user, k } = daSala();
      if (!k?.pilotos.has(user.id) || k.fase !== 'corrida') return;
      const lista = ordem(k).filter((p) => !p.chegou && !p.espera);
      const i = lista.findIndex((p) => p.id === user.id);
      const alvo = i > 0 ? lista[i - 1] : lista[1];
      if (!alvo) return;
      const a = ondeEsta(room.users.get(alvo.id));
      const b = ondeEsta(user);
      const dist = a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 60;
      const ms = Math.round(900 + Math.min(dist, 400) * 12);
      io.to(room.id).emit('kt-missil', { de: user.id, alvo: alvo.id, ms });
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.kart?.pilotos.delete(user?.id)) avisar(room);
    });
  };
}

module.exports = { ligarKart };
