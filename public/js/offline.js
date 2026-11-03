// Modo offline: os jogos de cartas (truco, uno, 21, cacheta e poker) sem internet. Os módulos do
// servidor que mandam nessas mesas (cartas-servidor.js e poker-servidor.js, servidos como módulos ES
// em /offline/, ver pagina.js) rodam aqui dentro da página: o "servidor de bolso". O main.js recebe
// um socket de mentira, com o mesmo on/emit/ack do socket.io, que conversa com ele em vez da rede.
// Assim os jogos não sabem a diferença: os robôs completam a mesa, como na sala.
//
// Só existe uma pessoa (você); voz, telas, chat e o resto da sala ficam parados. As moedas do
// offline são à parte das da sala (localStorage), e voltam para 100 quando acabam.
import { MAPAS } from './mapas-dados.js';

export const JOGOS_OFFLINE = ['truco', 'uno', 'vinteum', 'cacheta', 'poker'];
// tudo o que a sala tem (JOGOS_SALA do server.js): fora as cartas, desligado no offline
const JOGOS_SALA = ['parkour', 'ringue', 'corrida', 'futebol', 'volei', 'basquete', 'boliche', 'surf', 'matamata', 'batalha', 'xadrez', 'dama', 'velha', 'dados', 'poderes', 'armas',
  'pingue', 'queimada', 'sinuca', 'golfe', 'truco', 'uno', 'vinteum', 'cacheta', 'poker', 'gincana', 'fantasmas', 'kart', 'pinta', 'tapa', 'tiro'];
const LIGADOS = new Set([...JOGOS_OFFLINE, 'tapa', 'tiro']); // tapa e tiro de brincadeira na mesa
const MOEDAS_INICIAIS = 100;
const MOEDAS_MINIMO = 20; // o mínimo da mesa de poker mais barata: abaixo disso, volta para o inicial
const CHAVE_MOEDAS = 'sala3d-offline-moedas';
const SALA = 'offline';

function lerMoedas() {
  try {
    const n = Number(localStorage.getItem(CHAVE_MOEDAS));
    return Number.isFinite(n) && n >= MOEDAS_MINIMO ? n : MOEDAS_INICIAIS;
  } catch {
    return MOEDAS_INICIAIS;
  }
}
function gravarMoedas(n) {
  try { localStorage.setItem(CHAVE_MOEDAS, String(n)); } catch { /* modo privado */ }
}

// o que passa "pela rede" vai copiado, como no socket.io: quem recebe não mexe no objeto de quem mandou
const copiar = (args) => args.map((a) => (a === undefined ? undefined : JSON.parse(JSON.stringify(a))));
const depois = (fn) => queueMicrotask(() => {
  try {
    fn();
  } catch (err) {
    console.error('[offline]', err);
  }
});

function ouvintes() {
  const mapa = new Map();
  return {
    on(ev, fn) {
      if (!mapa.has(ev)) mapa.set(ev, new Set());
      mapa.get(ev).add(fn);
    },
    off(ev, fn) {
      if (fn) mapa.get(ev)?.delete(fn);
      else mapa.delete(ev);
    },
    entregar(ev, args) {
      for (const fn of [...(mapa.get(ev) || [])]) {
        try {
          fn(...args);
        } catch (err) {
          console.error('[offline]', ev, err);
        }
      }
    },
  };
}

// separa o ack (função no fim) do resto, e faz a resposta voltar copiada e depois, como pela rede
function comAck(args) {
  const ultimo = args[args.length - 1];
  if (typeof ultimo !== 'function') return { dados: copiar(args), ack: null };
  const ack = (...r) => depois(() => ultimo(...copiar(r)));
  return { dados: copiar(args.slice(0, -1)), ack };
}

// opts: mapa (o montado na página), nome, cor
export async function criarSocketOffline({ mapa, nome, cor }) {
  const [{ default: cartasSrv }, { default: pokerSrv }] = await Promise.all([
    import('/offline/cartas-servidor.js'),
    import('/offline/poker-servidor.js'),
  ]);
  // os mesmos módulos que os servidores pedem (mesmo endereço = mesma instância): esperando por eles,
  // as regras e as mesas de cada mapa já estão prontas lá dentro
  await Promise.all([
    import('/js/cartas-regras.js'),
    import('/js/poker-regras.js'),
    ...['tropical', 'neve', 'outono'].map((m) => import(`/js/parque-dados.js?mapa=${m}`)),
  ]);
  await new Promise((pronto) => setTimeout(pronto, 0));

  const id = `offline-${Math.random().toString(36).slice(2, 8)}`;
  const doCliente = ouvintes();
  const doServidor = ouvintes();
  const paraCliente = (ev, args) => {
    const copia = copiar(args);
    depois(() => doCliente.entregar(ev, copia));
  };

  const config = {
    modulo: 'lazer',
    mapa: MAPAS[mapa] ? mapa : 'tropical',
    departamentos: [],
    jogos: Object.fromEntries(JOGOS_SALA.map((j) => [j, LIGADOS.has(j)])),
    empresa: '',
    placar: { titulo: 'Metas do mês', itens: [] },
    aviso: '',
    privacidade: true,
    listada: false,
    logo: '',
    paginas: {},
  };
  const room = { id: SALA, users: new Map(), config, seq: 0, mudou: new Map(), legado: 0 };
  const rooms = new Map([[SALA, room]]);
  const user = {
    id, n: 1, name: nome || 'Jogador', color: cor || '#7c9cff', moedas: lerMoedas(),
    shares: new Map(), health: 1, ko: false, p: [0, 0, -4], r: 0, a: 0, s: 0,
  };

  // io do servidor: só existe a sala e a própria pessoa (o resto da "sala" não recebe ninguém)
  const io = {
    to(alvo) {
      const emit = (ev, ...args) => {
        if (alvo === SALA || alvo === id) paraCliente(ev, args);
      };
      const destino = { emit, except: () => destino };
      destino.volatile = destino;
      return destino;
    },
  };
  const jogoLigado = (r, jogo) => r?.config?.jogos?.[jogo] !== false;
  const darMoedas = (r, u, qtd, motivo) => {
    if (!qtd) return;
    u.moedas = Math.max(0, Math.round((u.moedas + qtd) * 100) / 100);
    gravarMoedas(u.moedas);
    io.to(r.id).emit('moedas', { id: u.id, moedas: u.moedas, delta: qtd, motivo });
  };
  const porSocketCartas = cartasSrv.ligarCartas(io, rooms, jogoLigado, darMoedas);
  const porSocketPoker = pokerSrv.ligarPoker(io, rooms, jogoLigado, darMoedas);

  // o socket do lado do servidor
  let naSala = false;
  const quem = () => (naSala ? { room, user } : { room: null, user: null });
  const sock = {
    id,
    connected: true,
    on: (ev, fn) => doServidor.on(ev, fn),
    emit: (ev, ...args) => paraCliente(ev, args),
    to: () => ({ emit() {} }), // "para os outros": não há outros
    setMaxListeners() {},
  };
  porSocketCartas(sock, quem);
  porSocketPoker(sock, quem);

  doServidor.on('join', (_dados, ack) => {
    naSala = true;
    room.users.set(id, user);
    ack?.({
      selfId: id,
      room: SALA,
      users: [],
      media: { provider: null, id: null, playing: false, time: 0, updatedAt: Date.now(), by: null, serverNow: Date.now() },
      main: 'media',
      chat: [],
      leaderboard: [],
      fights: [],
      voltas: [],
      jogos: {},
      moedas: user.moedas,
      sala: { ...config, temDono: false, temSenha: false, temGestor: false },
      passe: null,
      versao: null,
      offline: true,
    });
  });
  // a posição: as mesas tiram da cadeira quem se afasta (ver longeDemais nos servidores)
  doServidor.on('state', (s) => {
    if (Array.isArray(s?.p) && s.p.length === 3) user.p = s.p;
  });

  // o socket que o main.js usa
  const cliente = {
    id,
    connected: true,
    offline: true,
    on(ev, fn) {
      doCliente.on(ev, fn);
      return cliente;
    },
    off(ev, fn) {
      doCliente.off(ev, fn);
      return cliente;
    },
    once(ev, fn) {
      const uma = (...a) => {
        doCliente.off(ev, uma);
        fn(...a);
      };
      doCliente.on(ev, uma);
      return cliente;
    },
    emit(ev, ...args) {
      const { dados, ack } = comAck(args);
      depois(() => doServidor.entregar(ev, ack ? [...dados, ack] : dados));
      return cliente;
    },
    get volatile() { return cliente; },
    timeout() { return cliente; },
    connect() { return cliente; },
    disconnect() { return cliente; },
    io: { on() {}, off() {}, opts: {} },
  };
  return cliente;
}
