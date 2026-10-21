// Vôlei, basquete e boliche: o servidor manda no placar, na vez e em quem está com a bola.
//
// Como no futebol de carro (futebol-servidor.js), cada um joga com o próprio boneco no navegador:
// quem encosta na bola calcula a batida na hora e manda a bola nova; o servidor confere se faz
// sentido (perto da bola e da pessoa), anda com a bola daí em diante e decide os pontos.
// No boliche o servidor simula a jogada inteira (a mesma conta do navegador, determinística) e
// conta os pinos.
const { carregarPorMapa, comMapa } = require('./mapa-servidor.js');

let F = null; // a física (módulo ES)
const DADOS = carregarPorMapa('quadras-fisica.js'); // um módulo por mapa (mapa-servidor.js)
DADOS.pronto
  .then((m) => { F = m; })
  .catch((err) => console.warn('  Física das quadras não carregou (vôlei, basquete e boliche parados):', err.message));

const PASSO = 1 / 60;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vetor = (a) => (Array.isArray(a) && a.length === 3 && a.every((n) => num(n) !== null) ? { x: a[0], y: a[1], z: a[2] } : null);
const arred = (n) => Math.round(n * 100) / 100;
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const bolaArr = (b, id = null, seq = 0) => [arred(b.p.x), arred(b.p.y), arred(b.p.z), arred(b.v.x), arred(b.v.y), arred(b.v.z), id, seq];

function novoVolei() {
  const v = { pontos: [0, 0], fase: 'saque', saque: 0, ate: 0, bola: null, toque: { id: null, seq: 0, lado: null }, toques: { lado: null, n: 0 }, marcou: null, ultimo: Date.now(), tic: 0 };
  bolaNoSaque(v);
  return v;
}
function bolaNoSaque(v) {
  v.bola = { p: F.saqueVolei(v.saque), v: { x: 0, y: 0, z: 0 } };
  v.toques = { lado: null, n: 0 };
  v.toque = { id: null, seq: v.toque.seq, lado: null };
}

function novoBasquete() {
  return { bola: { p: { x: F.BASQUETE.cx, y: 1, z: F.BASQUETE.cz }, v: { x: 0, y: 0, z: 0 } }, dono: null, arremesso: null, placar: new Map(), parada: 0, tic: 0, roubo: new Map(), largou: { id: null, em: 0 } };
}

const novaPista = () => ({ jogadores: [], vez: 0, emPe: Array(10).fill(true), fase: 'espera', ate: 0, desde: Date.now() });

function quadrasDa(room) {
  room.quadras ||= { volei: novoVolei(), basquete: novoBasquete(), boliche: [novaPista(), novaPista()] };
  return room.quadras;
}

// ------------------------------------------------------------------ o que vai para todos
const voleiPublico = (v) => ({ fase: v.fase, pontos: v.pontos, saque: v.saque, marcou: v.marcou, falta: Math.max(0, v.ate - Date.now()), bola: bolaArr(v.bola, v.toque.id, v.toque.seq) });
const basquetePublico = (b) => ({
  dono: b.dono,
  bola: bolaArr(b.bola),
  placar: [...b.placar.values()].sort((x, y) => y.pts - x.pts).slice(0, 8),
});
const pistaPublica = (p, i) => ({ pista: i, fase: p.fase, vez: p.vez, emPe: p.emPe, jogadores: p.jogadores.map(({ id, nome, cor, rolls }) => ({ id, nome, cor, rolls })) });

function ligarQuadras(io, rooms, jogoLigado) {
  // ---------------------------------------------------------------- vôlei
  const avisarVolei = (room) => io.to(room.id).emit('vol-estado', voleiPublico(room.quadras.volei));
  function pontoVolei(room, lado, motivo) {
    const v = room.quadras.volei;
    v.pontos[lado]++;
    v.marcou = { lado, motivo };
    const [a, b] = v.pontos;
    const venceu = (a >= F.VOLEI.pontos || b >= F.VOLEI.pontos) && Math.abs(a - b) >= 2;
    v.fase = venceu ? 'fim' : 'ponto';
    v.ate = Date.now() + (venceu ? 7000 : 2200);
    v.saque = lado;
    avisarVolei(room);
  }
  function ticVolei(room) {
    const v = room.quadras.volei;
    const agora = Date.now();
    if (v.fase === 'ponto' || v.fase === 'fim') {
      if (agora < v.ate) return;
      if (v.fase === 'fim') v.pontos = [0, 0];
      v.fase = 'saque';
      v.marcou = null;
      bolaNoSaque(v);
      avisarVolei(room);
      return;
    }
    // largado há 3 min: zera (ninguém jogando)
    if (agora - v.ultimo > 180_000 && (v.pontos[0] || v.pontos[1] || v.fase === 'jogo')) {
      v.pontos = [0, 0];
      v.fase = 'saque';
      bolaNoSaque(v);
      avisarVolei(room);
      return;
    }
    if (v.fase !== 'jogo') return;
    const caiu = F.andarVolei(v.bola, PASSO);
    const longe = Math.abs(v.bola.p.x - F.VOLEI.cx) > 40 || Math.abs(v.bola.p.z - F.VOLEI.cz) > 30;
    if (caiu || longe) {
      const p = v.bola.p;
      if (!longe && F.dentroVolei(p)) pontoVolei(room, 1 - F.ladoVolei(p.x), 'no chão');
      // fora: perde quem tocou por último (sem toque, o lado onde caiu)
      else pontoVolei(room, 1 - (v.toque.lado ?? F.ladoVolei(p.x)), 'fora');
      return;
    }
    if (++v.tic % 3 === 0) io.to(room.id).volatile.emit('vol-bola', bolaArr(v.bola, v.toque.id, v.toque.seq));
  }

  // ---------------------------------------------------------------- basquete
  const avisarBasquete = (room) => io.to(room.id).emit('bas-estado', basquetePublico(room.quadras.basquete));
  function ticBasquete(room) {
    const b = room.quadras.basquete;
    const B = F.BASQUETE;
    if (b.dono) {
      // quem está com a bola foi embora (ou se afastou da quadra): ela volta ao meio
      const u = room.users.get(b.dono);
      const p = ondeEsta(u);
      if (!u || !p || Math.hypot(p.x - B.cx, p.z - B.cz) > 30) {
        b.dono = null;
        b.bola = { p: { x: B.cx, y: 1, z: B.cz }, v: { x: 0, y: 0, z: 0 } };
        avisarBasquete(room);
      } else {
        b.bola.p = { x: p.x, y: p.y + 1, z: p.z }; // para quem chega ver perto do dono
        b.bola.v = { x: 0, y: 0, z: 0 };
      }
      return;
    }
    const r = F.andarBasquete(b.bola, PASSO);
    if (r) {
      const a = b.arremesso;
      const valeu = a && Date.now() - a.em < 5000;
      const pts = valeu ? (a.tres ? 3 : 2) : 0;
      if (valeu) {
        const u = room.users.get(a.id);
        const e = b.placar.get(a.id) || { nome: a.nome, cor: u?.color || '#fff', pts: 0 };
        e.pts += pts;
        b.placar.set(a.id, e);
        b.arremesso = null;
      }
      io.to(room.id).emit('bas-cesta', { nome: valeu ? a.nome : '', pts, aro: r.cesta });
      avisarBasquete(room);
    }
    // parada no chão ou longe demais: volta ao meio
    const { p, v } = b.bola;
    const parada = p.y < B.raio + 0.05 && Math.hypot(v.x, v.y, v.z) < 0.3;
    b.parada = parada ? b.parada + PASSO : 0;
    if (b.parada > 12 || Math.abs(p.x - B.cx) > B.comp / 2 + 8 || Math.abs(p.z - B.cz) > B.larg / 2 + 8) {
      b.bola = { p: { x: B.cx, y: 1, z: B.cz }, v: { x: 0, y: 0, z: 0 } };
      b.parada = 0;
      avisarBasquete(room);
      return;
    }
    if (!parada && ++b.tic % 3 === 0) io.to(room.id).volatile.emit('bas-bola', bolaArr(b.bola));
  }

  // ---------------------------------------------------------------- boliche
  const avisarPista = (room, i) => io.to(room.id).emit('bol-estado', pistaPublica(room.quadras.boliche[i], i));
  // a vez vai para o primeiro, a partir de `ini`, que ainda não terminou as 10 rodadas (pinos
  // todos de pé); ninguém mais: fim da partida
  function passarVez(room, i, ini) {
    const p = room.quadras.boliche[i];
    const n = p.jogadores.length;
    p.emPe = Array(10).fill(true);
    for (let k = 0; k < n; k++) {
      const j = (ini + k) % n;
      if (F.vezBoliche(p.jogadores[j].rolls).fim) continue;
      p.vez = j;
      p.fase = 'jogando';
      p.desde = Date.now();
      avisarPista(room, i);
      return;
    }
    p.fase = 'fim';
    p.ate = Date.now() + 10000;
    avisarPista(room, i);
  }
  // a bola parou: a mesma pessoa joga de novo no mesmo quadro, ou passa a vez
  function proximaVez(room, i) {
    const p = room.quadras.boliche[i];
    const atual = p.jogadores[p.vez];
    const v = atual && F.vezBoliche(atual.rolls);
    if (!atual || v.fim || v.bola === 0) return passarVez(room, i, p.vez + 1);
    if (v.reposicao) p.emPe = Array(10).fill(true); // 10º quadro, depois de strike ou spare
    p.fase = 'jogando';
    p.desde = Date.now();
    avisarPista(room, i);
  }
  function tirarDaPista(room, id) {
    room.quadras?.boliche.forEach((p, i) => {
      const k = p.jogadores.findIndex((j) => j.id === id);
      if (k < 0) return;
      const eraAVez = k === p.vez;
      p.jogadores.splice(k, 1);
      if (!p.jogadores.length) {
        Object.assign(p, novaPista());
        avisarPista(room, i);
        return;
      }
      if (k < p.vez) p.vez--;
      // era a vez dele: passa para quem ficou no lugar dele na fila
      if (eraAVez && p.fase !== 'fim') passarVez(room, i, k % p.jogadores.length);
      else avisarPista(room, i);
    });
  }
  function ticBoliche(room) {
    const agora = Date.now();
    room.quadras.boliche.forEach((p, i) => {
      if (p.fase === 'rolando' && agora >= p.ate) proximaVez(room, i);
      else if (p.fase === 'fim' && agora >= p.ate) {
        // partida nova com as mesmas pessoas
        for (const j of p.jogadores) j.rolls = [];
        p.vez = 0;
        p.emPe = Array(10).fill(true);
        p.fase = p.jogadores.length ? 'jogando' : 'espera';
        p.desde = agora;
        avisarPista(room, i);
      }
    });
  }
  // a cada segundo: quem saiu de perto da pista (ou parou na vez por muito tempo) deixa a vaga
  setInterval(() => {
    if (!F) return;
    for (const room of rooms.values()) {
      DADOS.usar(room);
      if (!room.quadras) continue;
      room.quadras.boliche.forEach((p) => {
        for (const j of [...p.jogadores]) {
          const pos = ondeEsta(room.users.get(j.id));
          const longe = !pos || Math.hypot(pos.x - (F.BOLICHE.x0 + 8), pos.z - (F.BOLICHE.pistas[0] + F.BOLICHE.pistas[1]) / 2) > 40;
          const parado = p.fase === 'jogando' && p.jogadores[p.vez]?.id === j.id && Date.now() - p.desde > 90_000;
          if (longe || parado) tirarDaPista(room, j.id);
        }
      });
    }
  }, 1000);

  // Passos de 1/60 s pelo tempo que passou de verdade: no Windows o setInterval de 16,7 ms dispara
  // a cada ~31 ms (o relógio anda de 15,6 em 15,6), e um passo por disparo deixava as bolas em
  // câmera lenta aqui — o navegador, que prevê a bola, ia na frente e era puxado de volta.
  let ultimoTic = performance.now();
  let sobra = 0;
  setInterval(() => {
    const agora = performance.now();
    sobra = Math.min(sobra + (agora - ultimoTic) / 1000, PASSO * 6);
    ultimoTic = agora;
    if (!F) return;
    for (; sobra >= PASSO; sobra -= PASSO) {
      for (const room of rooms.values()) {
      DADOS.usar(room);
        if (!room.quadras || !room.users.size) continue;
        if (jogoLigado(room, 'volei')) ticVolei(room);
        if (jogoLigado(room, 'basquete')) ticBasquete(room);
        if (jogoLigado(room, 'boliche')) ticBoliche(room);
      }
    }
  }, PASSO * 1000);

  // ---------------------------------------------------------------- recados de cada um
  return function porSocket(socket, quemDaSala) {
    const quem = comMapa(quemDaSala, DADOS);
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !F) return {};
      return { room, user, q: quadrasDa(room) };
    };

    socket.on('quadras-ver', (ack) => {
      const { q } = daSala();
      if (!q) return ack?.(null);
      ack?.({ volei: voleiPublico(q.volei), basquete: basquetePublico(q.basquete), boliche: q.boliche.map(pistaPublica) });
    });

    // vôlei: bateu na bola
    socket.on('vol-toque', (msg) => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'volei')) return;
      const v = q.volei;
      if (v.fase !== 'saque' && v.fase !== 'jogo') return;
      const p = vetor(msg?.p);
      const vel = vetor(msg?.v);
      const seq = num(msg?.seq);
      const eu = ondeEsta(user);
      if (!p || !vel || seq === null || !eu) return;
      if (dist3(p, v.bola.p) > 4.5 || dist3(p, { x: eu.x, y: eu.y + 1.2, z: eu.z }) > 4) return;
      const lado = F.ladoVolei(p.x);
      // o mesmo lado: conta os toques (o 4º é falta)
      if (v.toques.lado === lado) v.toques.n++;
      else v.toques = { lado, n: 1 };
      v.toque = { id: user.id, seq, lado };
      v.ultimo = Date.now();
      const m = Math.hypot(vel.x, vel.y, vel.z);
      const k = m > 22 ? 22 / m : 1;
      v.bola = { p, v: { x: vel.x * k, y: vel.y * k, z: vel.z * k } };
      if (v.toques.n > 3) {
        pontoVolei(room, 1 - lado, '4 toques');
        return;
      }
      if (v.fase === 'saque') {
        v.fase = 'jogo';
        v.marcou = null;
        avisarVolei(room);
      }
      io.to(room.id).emit('vol-bola', bolaArr(v.bola, user.id, seq));
    });

    // basquete: pegar a bola solta
    socket.on('bas-pegar', () => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'basquete')) return;
      const b = q.basquete;
      const eu = ondeEsta(user);
      if (b.dono || !eu) return;
      if (b.largou.id === user.id && Date.now() - b.largou.em < 600) return; // a própria bola saindo da mão
      const bp = b.bola.p;
      if (Math.hypot(bp.x - eu.x, bp.z - eu.z) > 2.2 || bp.y - eu.y > 3) return;
      b.dono = user.id;
      avisarBasquete(room);
    });

    // basquete: arremessou (ou passou): a bola sai da mão com essa velocidade
    socket.on('bas-arremesso', (msg) => {
      const { room, user, q } = daSala();
      if (!q || q.basquete.dono !== user.id) return;
      const b = q.basquete;
      const p = vetor(msg?.p);
      const vel = vetor(msg?.v);
      const eu = ondeEsta(user);
      if (!p || !vel || !eu || dist3(p, eu) > 3.5) return;
      const m = Math.hypot(vel.x, vel.y, vel.z);
      const k = m > 18 ? 18 / m : 1;
      b.dono = null;
      b.bola = { p, v: { x: vel.x * k, y: vel.y * k, z: vel.z * k } };
      b.largou = { id: user.id, em: Date.now() };
      // de onde saiu: atrás da linha dos 3, vale 3
      const aro = [0, 1].map(F.aroBasquete).sort((a, c) => Math.hypot(a.x - eu.x, a.z - eu.z) - Math.hypot(c.x - eu.x, c.z - eu.z))[0];
      b.arremesso = { id: user.id, nome: user.name, tres: Math.hypot(aro.x - eu.x, aro.z - eu.z) > F.BASQUETE.tres, em: Date.now() };
      avisarBasquete(room);
      io.to(room.id).emit('bas-bola', bolaArr(b.bola));
    });

    // basquete: tentar roubar de quem está com a bola (perto dele)
    socket.on('bas-roubar', () => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'basquete')) return;
      const b = q.basquete;
      if (!b.dono || b.dono === user.id) return;
      const eu = ondeEsta(user);
      const ele = ondeEsta(room.users.get(b.dono));
      if (!eu || !ele || Math.hypot(eu.x - ele.x, eu.z - ele.z) > 1.9) return;
      const agora = Date.now();
      if (agora - (b.roubo.get(user.id) || 0) < 1200) return;
      b.roubo.set(user.id, agora);
      const conseguiu = Math.random() < 0.4;
      socket.emit('bas-roubo', { conseguiu });
      if (!conseguiu) return;
      io.to(b.dono).emit('bas-roubo', { roubaram: user.name });
      b.dono = user.id;
      avisarBasquete(room);
    });

    // boliche: entrar numa pista (até 4 por pista)
    socket.on('bol-entrar', (msg, ack) => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'boliche')) return ack?.({ erro: 'desligado' });
      const i = msg?.pista === 1 ? 1 : 0;
      if (q.boliche.some((p) => p.jogadores.some((j) => j.id === user.id))) return ack?.({ erro: 'ja' });
      const p = q.boliche[i];
      if (p.jogadores.length >= F.BOLICHE.maxJogadores) return ack?.({ erro: 'cheia' });
      p.jogadores.push({ id: user.id, nome: user.name, cor: user.color, rolls: [] });
      if (p.fase === 'espera') {
        p.fase = 'jogando';
        p.vez = 0;
        p.emPe = Array(10).fill(true);
        p.desde = Date.now();
      }
      avisarPista(room, i);
      ack?.({ ok: true });
    });

    socket.on('bol-sair', () => {
      const { room, user } = quem();
      if (room?.quadras && user) tirarDaPista(room, user.id);
    });

    // boliche: jogou a bola. O servidor simula e conta os pinos; todos animam a mesma jogada.
    socket.on('bol-lancar', (msg) => {
      const { room, user, q } = daSala();
      if (!q || !jogoLigado(room, 'boliche')) return;
      const i = msg?.pista === 1 ? 1 : 0;
      const p = q.boliche[i];
      if (p.fase !== 'jogando' || p.jogadores[p.vez]?.id !== user.id) return;
      const B = F.BOLICHE;
      const w = num(msg?.w);
      const vu = num(msg?.vu);
      const vw = num(msg?.vw);
      if (w === null || vu === null || vw === null) return;
      const lance = {
        w: Math.max(-(B.largura / 2 - B.bola.raio), Math.min(B.largura / 2 - B.bola.raio, w)),
        vu: Math.max(B.bola.min, Math.min(B.bola.max, vu)),
        vw: Math.max(-0.6, Math.min(0.6, vw)),
      };
      const antes = p.emPe;
      const depois = F.simularBoliche(lance, antes);
      const caiu = antes.filter(Boolean).length - depois.filter(Boolean).length;
      p.jogadores[p.vez].rolls.push(caiu);
      p.emPe = depois;
      p.fase = 'rolando';
      p.ate = Date.now() + (B.comprimento / lance.vu) * 1000 + 2600;
      io.to(room.id).emit('bol-lance', { pista: i, lance, antes, depois, caiu, nome: user.name, id: user.id });
      avisarPista(room, i);
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (!room?.quadras || !user) return;
      tirarDaPista(room, user.id);
      if (room.quadras.basquete.dono === user.id) {
        room.quadras.basquete.dono = null;
        avisarBasquete(room);
      }
    });
  };
}

module.exports = { ligarQuadras };
