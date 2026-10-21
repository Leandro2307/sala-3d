// Pingue-pongue (salão de jogos do parque): o servidor manda no placar, no saque e na bolinha.
//
// Como no vôlei (quadras-servidor.js), quem bate na bolinha calcula a raquetada no navegador e manda
// a bolinha nova; o servidor confere (perto da bolinha e da pessoa, do lado certo, depois do quique)
// e anda com ela daí em diante, contando quiques e pontos. Mesa com uma pessoa só: o robô assume o
// outro lado (erra de vez em quando). Chegou a segunda pessoa, o robô sai e o placar zera.
const { carregarPorMapa, comMapa } = require('./mapa-servidor.js');

let F = null; // a física (módulo ES)
const DADOS = carregarPorMapa('pingue-fisica.js'); // um módulo por mapa (mapa-servidor.js)
DADOS.pronto
  .then((m) => { F = m; })
  .catch((err) => console.warn('  Física do pingue-pongue não carregou:', err.message));

const PASSO = 1 / 60;
const ROBO = 'robo';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vetor = (a) => (Array.isArray(a) && a.length === 3 && a.every((n) => num(n) !== null) ? { x: a[0], y: a[1], z: a[2] } : null);
const arred = (n) => Math.round(n * 100) / 100;
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);

function novaMesa(i) {
  const m = { i, lados: [null, null], pontos: [0, 0], fase: 'espera', saque: 0, inicial: 0, ate: 0, marcou: null, bola: null, ultimo: null, quiques: 0, toque: { id: null, seq: 0 }, tic: 0, roboErrou: false, desde: Date.now() };
  bolaNoSaque(m);
  return m;
}
function bolaNoSaque(m) {
  m.bola = { p: F.saquePingue(F.PINGUE.mesas[m.i], m.saque), v: { x: 0, y: 0, z: 0 } };
  m.ultimo = m.saque;
  m.quiques = 0;
  m.roboErrou = false;
  m.desde = Date.now();
}
const mesasDa = (room) => (room.pingue ||= F.PINGUE.mesas.map((_, i) => novaMesa(i)));

const ladoPublico = (room, id) => {
  if (!id) return null;
  if (id === ROBO) return { id: ROBO, nome: 'Robô', cor: '#94a3b8' };
  const u = room.users.get(id);
  return u ? { id, nome: u.name, cor: u.color } : null;
};
const bolaArr = (m) => [m.i, arred(m.bola.p.x), arred(m.bola.p.y), arred(m.bola.p.z), arred(m.bola.v.x), arred(m.bola.v.y), arred(m.bola.v.z), m.ultimo, m.quiques, m.toque.id, m.toque.seq];
const mesaPublica = (room, m) => ({
  mesa: m.i, lados: m.lados.map((id) => ladoPublico(room, id)), pontos: m.pontos, fase: m.fase, saque: m.saque,
  marcou: m.marcou, falta: Math.max(0, m.ate - Date.now()), bola: bolaArr(m),
});

function ligarPingue(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room, m) => io.to(room.id).emit('pp-estado', mesaPublica(room, m));
  const humanos = (m) => m.lados.filter((id) => id && id !== ROBO).length;

  // quem saca: troca a cada 2 pontos (no 10 a 10, a cada ponto)
  function acertarSaque(m) {
    const [a, b] = m.pontos;
    const total = a + b;
    m.saque = a >= 10 && b >= 10 ? (m.inicial + total) % 2 : (m.inicial + Math.floor(total / 2)) % 2;
  }

  function recomecar(room, m) {
    m.pontos = [0, 0];
    m.marcou = null;
    m.inicial = 0;
    acertarSaque(m);
    m.fase = m.lados[0] && m.lados[1] ? 'saque' : 'espera';
    bolaNoSaque(m);
    avisar(room, m);
  }

  function ponto(room, m, lado, motivo) {
    m.pontos[lado]++;
    m.marcou = { lado, motivo };
    const [a, b] = m.pontos;
    const venceu = (a >= F.PINGUE.pontos || b >= F.PINGUE.pontos) && Math.abs(a - b) >= 2;
    m.fase = venceu ? 'fim' : 'ponto';
    m.ate = Date.now() + (venceu ? 6000 : 1600);
    if (venceu) {
      // vitória contra gente vale mais que contra o robô
      const id = m.lados[lado];
      const contraRobo = m.lados.includes(ROBO);
      const u = id && id !== ROBO ? room.users.get(id) : null;
      if (u) darMoedas?.(room, u, contraRobo ? 5 : 20, contraRobo ? 'venceu o robô no pingue-pongue' : 'vitória no pingue-pongue');
    }
    avisar(room, m);
  }

  // a mesa ganhou ou perdeu gente: o robô entra no lugar vazio de quem joga sozinho e sai quando
  // chega alguém
  function arrumarLados(room, m) {
    const gente = humanos(m);
    if (gente === 1) {
      const vazio = m.lados.indexOf(null);
      if (vazio >= 0) m.lados[vazio] = ROBO;
    } else if (gente === 0) {
      m.lados = [null, null];
    }
    recomecar(room, m);
  }

  function sairDaMesa(room, id) {
    for (const m of room.pingue || []) {
      const k = m.lados.indexOf(id);
      if (k < 0) continue;
      m.lados[k] = null;
      arrumarLados(room, m);
    }
  }

  // o robô bate: quando a bolinha já quicou do lado dele e está descendo (ou passando da ponta)
  function vezDoRobo(room, m) {
    const k = m.lados.indexOf(ROBO);
    if (k < 0) return;
    const P = F.PINGUE;
    const mesa = P.mesas[m.i];
    const b = m.bola;
    if (m.fase === 'saque') {
      if (m.saque !== k || Date.now() - m.desde < 1300) return;
    } else if (m.fase !== 'jogo' || m.ultimo === k || m.quiques < 1 || m.roboErrou) return;
    else {
      const passou = Math.abs(b.p.x - mesa.x) > P.comp / 2 - 0.2;
      if (!(b.v.y < 0 || passou) || b.p.y < P.altura - 0.1 || F.ladoPingue(mesa, b.p.x) !== k) return;
      // às vezes erra
      if (Math.random() < 0.13) {
        m.roboErrou = true;
        return;
      }
    }
    const alvoZ = mesa.z + (Math.random() - 0.5) * (P.larg - 0.6);
    const v = F.rebaterPingue(mesa, b.p, k, alvoZ, Math.random() < 0.18);
    m.bola = { p: { ...b.p }, v };
    m.ultimo = k;
    m.quiques = 0;
    m.toque = { id: ROBO, seq: m.toque.seq + 1 };
    if (m.fase === 'saque') {
      m.fase = 'jogo';
      m.marcou = null;
      avisar(room, m);
    }
    io.to(room.id).emit('pp-bola', bolaArr(m));
  }

  function tic(room, m) {
    const agora = Date.now();
    if (m.fase === 'ponto' || m.fase === 'fim') {
      if (agora < m.ate) return;
      if (m.fase === 'fim') {
        m.pontos = [0, 0];
        m.inicial = 1 - m.inicial;
      }
      acertarSaque(m);
      m.fase = m.lados[0] && m.lados[1] ? 'saque' : 'espera';
      m.marcou = null;
      bolaNoSaque(m);
      avisar(room, m);
      return;
    }
    vezDoRobo(room, m);
    if (m.fase !== 'jogo') return;
    const mesa = F.PINGUE.mesas[m.i];
    let acabou = false;
    F.andarPingue(m.bola, mesa, PASSO, (ev) => {
      if (ev.tipo === 'mesa') {
        if (ev.lado === m.ultimo) ponto(room, m, 1 - m.ultimo, 'quicou do próprio lado');
        else if (++m.quiques >= 2) ponto(room, m, m.ultimo, 'quicou duas vezes');
        else return false;
        acabou = true;
        return true;
      }
      if (ev.tipo === 'chao') {
        if (m.quiques >= 1) ponto(room, m, m.ultimo, 'não devolveu');
        else ponto(room, m, 1 - m.ultimo, 'fora');
        acabou = true;
        return true;
      }
      return false;
    });
    if (acabou) return;
    const p = m.bola.p;
    if (Math.abs(p.x - mesa.x) > 14 || Math.abs(p.z - mesa.z) > 10) {
      ponto(room, m, m.quiques >= 1 ? m.ultimo : 1 - m.ultimo, 'fora');
      return;
    }
    if (++m.tic % 3 === 0) io.to(room.id).volatile.emit('pp-bola', bolaArr(m));
  }

  // O navegador anda com a bolinha um tiquinho à frente do servidor (ele adianta o recado atrasado):
  // a raquetada pode chegar antes do quique daqui. Vale se a bolinha quica do lado de quem bateu
  // nos próximos 0,3 s.
  function vaiQuicar(m, lado) {
    const b = { p: { ...m.bola.p }, v: { ...m.bola.v } };
    let quicou = false;
    let fim = false;
    for (let k = 0; k < 18 && !fim; k++) {
      F.andarPingue(b, F.PINGUE.mesas[m.i], PASSO, (ev) => {
        if (ev.tipo === 'rede') return false;
        fim = true;
        quicou = ev.tipo === 'mesa' && ev.lado === lado;
        return true;
      });
    }
    return quicou;
  }

  // a cada segundo: quem se afastou da mesa deixa o lugar
  setInterval(() => {
    if (!F) return;
    for (const room of rooms.values()) {
      DADOS.usar(room);
      for (const m of room.pingue || []) {
        const mesa = F.PINGUE.mesas[m.i];
        for (const id of m.lados) {
          if (!id || id === ROBO) continue;
          const pos = ondeEsta(room.users.get(id));
          // longe por mais de 3 s (a posição chega um tiquinho depois de um teleporte)
          const longe = !pos || Math.hypot(pos.x - mesa.x, pos.z - mesa.z) > 16;
          m.longe ||= new Map();
          if (!longe) m.longe.delete(id);
          else if (!m.longe.has(id)) m.longe.set(id, Date.now());
          if (!jogoLigado(room, 'pingue') || (longe && Date.now() - m.longe.get(id) > 3000)) {
            m.longe.delete(id);
            sairDaMesa(room, id);
          }
        }
      }
    }
  }, 1000);

  // passos de 1/60 s pelo tempo de verdade (ver quadras-servidor.js)
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
        if (!room.pingue || !room.users.size || !jogoLigado(room, 'pingue')) continue;
        for (const m of room.pingue) if (m.fase !== 'espera') tic(room, m);
      }
    }
  }, PASSO * 1000);

  return function porSocket(socket, quemDaSala) {
    const quem = comMapa(quemDaSala, DADOS);
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !F) return {};
      return { room, user, mesas: mesasDa(room) };
    };

    socket.on('pp-ver', (ack) => {
      const { room, mesas } = daSala();
      if (!mesas) return ack?.(null);
      ack?.(mesas.map((m) => mesaPublica(room, m)));
    });

    // pegar um lado da mesa (o do robô também: ele sai)
    socket.on('pp-entrar', (msg, ack) => {
      const { room, user, mesas } = daSala();
      if (!mesas || !jogoLigado(room, 'pingue')) return ack?.({ erro: 'desligado' });
      const m = mesas[msg?.mesa];
      const lado = msg?.lado === 1 ? 1 : 0;
      if (!m) return ack?.({ erro: 'mesa' });
      if (m.lados[lado] && m.lados[lado] !== ROBO) return ack?.({ erro: 'ocupado' });
      sairDaMesa(room, user.id);
      m.lados[lado] = user.id;
      if (m.lados[1 - lado] === ROBO) m.lados[1 - lado] = null;
      arrumarLados(room, m);
      ack?.({ ok: true });
    });

    socket.on('pp-sair', () => {
      const { room, user } = quem();
      if (room?.pingue && user) sairDaMesa(room, user.id);
    });

    // bateu na bolinha (saque ou devolução)
    socket.on('pp-toque', (msg) => {
      const { room, user, mesas } = daSala();
      if (!mesas || !jogoLigado(room, 'pingue')) return;
      const m = mesas[msg?.mesa];
      if (!m) return;
      const lado = m.lados.indexOf(user.id);
      if (lado < 0) return;
      const p = vetor(msg?.p);
      const vel = vetor(msg?.v);
      const seq = num(msg?.seq);
      const eu = ondeEsta(user);
      if (!p || !vel || seq === null || !eu) return;
      if (m.fase === 'saque') {
        if (m.saque !== lado) return;
      } else if (m.fase !== 'jogo' || m.ultimo === lado || (m.quiques < 1 && !vaiQuicar(m, lado))) return;
      if (dist3(p, m.bola.p) > 2.4 || Math.hypot(p.x - eu.x, p.z - eu.z) > 3.2) return;
      const vm = Math.hypot(vel.x, vel.y, vel.z);
      const k = vm > 16 ? 16 / vm : 1;
      m.bola = { p, v: { x: vel.x * k, y: vel.y * k, z: vel.z * k } };
      m.ultimo = lado;
      m.quiques = 0;
      m.toque = { id: user.id, seq };
      if (m.fase === 'saque') {
        m.fase = 'jogo';
        m.marcou = null;
        avisar(room, m);
      }
      io.to(room.id).emit('pp-bola', bolaArr(m));
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.pingue && user) sairDaMesa(room, user.id);
    });
  };
}

module.exports = { ligarPingue };
