// Sala 3D — servidor de sinalização (WebRTC), estado da sala, telão sincronizado e parkour.
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const compression = require('compression');
const { execFile } = require('child_process');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const USE_HTTPS = process.argv.includes('--https') || process.env.HTTPS === '1';
const SHARE_SLOTS = 4;
const MAX_CHAT = 60;
const MAX_PHOTO = 60_000; // data URL da foto do rosto (128x128 jpeg dá ~12 kB)
const PUNCH_RANGE = 4.5; // metros: folga sobre o alcance real, só para barrar absurdo
const TIRO = { alcance: 85, cadenciaMs: 250 }; // arma da camiseta 22 (o cliente usa 80 m e 300 ms)
const SHIRTS = ['none', 'lula', 'bolsonaro'];
const PERSONAGENS = ['padrao', 'robo', 'cavaleiro', 'barbaro', 'mago', 'ladino', 'optimus', 'solus'];
const VOLTA_MIN = 6; // segundos: abaixo disso é atravessar a pista, não dar a volta
const VOLTA_MAX = 600;

// Navegador compartilhado (neko, ver neko/docker-compose.yml). Só existe se BROWSER_URL estiver
// definido — o "npm run navegador" faz isso. A senha é a de participante, não a de admin: quem
// tem o link da sala já pode entrar no navegador mesmo.
const BROWSER = (() => {
  const url = String(process.env.BROWSER_URL || '').replace(/\/+$/, '');
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo');
  } catch {
    console.warn(`  BROWSER_URL inválido (${url}): navegador compartilhado desligado.`);
    return null;
  }
  return { url, password: String(process.env.BROWSER_PASSWORD || '') };
})();
// mesmo nome do container_name em neko/docker-compose.yml
const BROWSER_CONTAINER = process.env.BROWSER_CONTAINER || 'sala3d-navegador';

// Atalhos do navegador compartilhado. A lista é fixa aqui de propósito: o cliente só manda o
// id, então ninguém consegue fazer o navegador da sala abrir um endereço qualquer.
const BROWSER_SITES = [
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'twitch', label: 'Twitch', url: 'https://www.twitch.tv/' },
  { id: 'kick', label: 'Kick', url: 'https://kick.com/' },
  { id: 'pluto', label: 'Pluto TV', url: 'https://pluto.tv/br' },
  { id: 'google', label: 'Google', url: 'https://www.google.com/' },
];

// O Firefox do neko roda com --no-remote (não aceita "abra este link" por linha de comando),
// então o atalho faz o que uma pessoa faria: Ctrl+L, digita o endereço, Enter. O endereço vai
// como argumento ($1), nunca colado dentro do script.
const XDOTOOL_OPEN = [
  'export DISPLAY="${DISPLAY:-:99.0}"',
  "w=$(xdotool search --onlyvisible --name 'Mozilla Firefox$' | head -1)",
  '[ -n "$w" ] || exit 3',
  'xdotool windowactivate --sync "$w" 2>/dev/null',
  'xdotool key --clearmodifiers ctrl+l',
  'sleep 0.2',
  'xdotool type --delay 8 "$1"',
  'xdotool key Return',
].join('; ');

// Navegador numa VPS (neko/vps): lá não dá para rodar docker exec daqui, então quem digita o
// endereço é o abrir.py da VPS, em BROWSER_URL/sala3d/abrir, protegido pelo token.
const BROWSER_OPEN_TOKEN = String(process.env.BROWSER_OPEN_TOKEN || '');

function openInBrowser(url, done) {
  if (BROWSER_OPEN_TOKEN) {
    fetch(`${BROWSER.url}/sala3d/abrir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${BROWSER_OPEN_TOKEN}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    }).then((r) => done(r.ok ? null : new Error(`HTTP ${r.status}`)), done);
    return;
  }
  execFile('docker', ['exec', '-u', 'neko', BROWSER_CONTAINER, 'sh', '-c', XDOTOOL_OPEN, 'sh', url],
    { timeout: 15000, windowsHide: true },
    (err) => done(err));
}

// Plataformas aceitas no telão. O cliente converte o link; aqui só se confere o formato,
// para ninguém conseguir enfiar um iframe arbitrário na tela dos outros.
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|m3u8|mpd)$/i;
function urlOk(value, { hosts = null, max = 2000, ext = null } = {}) {
  if (typeof value !== 'string' || value.length > max) return false;
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (ext && !ext.test(u.pathname)) return false;
  return !hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}
const MEDIA_IDS = {
  youtube: (id) => /^[\w-]{11}$/.test(id),
  twitch: (id) => /^[a-z0-9_]{2,25}$/.test(id), // canal ao vivo
  'twitch-vod': (id) => /^\d{5,14}$/.test(id),
  'twitch-clip': (id) => /^[\w-]{3,100}$/.test(id),
  kick: (id) => /^[\w-]{2,40}$/.test(id),
  vimeo: (id) => /^\d{1,12}(\/[0-9a-f]{6,20})?$/.test(id),
  dailymotion: (id) => /^[a-z0-9]{5,12}$/i.test(id),
  facebook: (id) => urlOk(id, { hosts: ['facebook.com', 'fb.watch'], max: 300 }),
  // link direto: sem a extensão, qualquer um faria o navegador dos outros abrir URLs arbitrárias
  video: (id) => urlOk(id, { ext: VIDEO_EXT }),
  browser: (id) => !!BROWSER && id === 'shared', // só existe um, e só se estiver configurado
};

// STUN público + TURN opcional via variáveis de ambiente (necessário em algumas redes 4G/corporativas).
const iceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(','),
    username: process.env.TURN_USER || '',
    credential: process.env.TURN_PASS || '',
  });
}

const app = express();
// Sem isto o navegador baixa tudo cru: só o three.js são 662 kB, e o cabeçalho
// JSON dos modelos 3D comprime a mais de 5x.
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
// players de HLS (.m3u8) e DASH (.mpd): só são baixados quando alguém cola um link desses
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist')));
app.use('/vendor/dash', express.static(path.join(__dirname, 'node_modules', 'dashjs', 'dist', 'modern', 'esm')));
app.get('/config', (_req, res) => res.json({
  iceServers,
  shareSlots: SHARE_SLOTS,
  browser: BROWSER && { ...BROWSER, sites: BROWSER_SITES.map(({ id, label, url }) => ({ id, label, host: new URL(url).hostname })) },
}));

// ---------------------------------------------------------------- estado das salas
const rooms = new Map();
// Os placares vivem fora da sala de propósito: a sala é apagada 30 min depois de
// esvaziar, e junto iam embora os recordes. Assim eles duram enquanto o processo viver.
// (No plano grátis do Render o serviço reinicia quando fica ocioso, e aí zeram.)
const boards = new Map(); // roomId -> { parkour: [], fights: [] }

function getBoards(id) {
  let b = boards.get(id);
  if (b && !b.voltas) b.voltas = []; // sala criada antes da pista existir
  if (!b) {
    b = { parkour: [], fights: [], voltas: [] };
    boards.set(id, b);
  }
  return b;
}

// ------------------------------------------------------------------ moedas
// Carteira por nome (minúsculo), guardada em dados/moedas.json. Quem chega pela primeira vez
// ganha MOEDAS_INICIAIS. No plano grátis do Render o disco é apagado a cada reinício, então lá
// as moedas duram enquanto o serviço estiver de pé (como os recordes).
const MOEDAS_INICIAIS = 100;
const MOEDAS_ARQ = path.join(__dirname, 'dados', 'moedas.json');
const carteiras = new Map((() => {
  try { return Object.entries(JSON.parse(fs.readFileSync(MOEDAS_ARQ, 'utf8'))); } catch { return []; }
})());
let salvarTimer = null;
function salvarMoedas() {
  if (salvarTimer) return;
  salvarTimer = setTimeout(() => {
    salvarTimer = null;
    fs.mkdir(path.dirname(MOEDAS_ARQ), { recursive: true }, () => {
      fs.writeFile(MOEDAS_ARQ, JSON.stringify(Object.fromEntries(carteiras)), () => {});
    });
  }, 2000);
}
const chaveNome = (nome) => String(nome).trim().toLowerCase();
function saldoDe(nome) {
  const k = chaveNome(nome);
  if (!carteiras.has(k)) {
    carteiras.set(k, MOEDAS_INICIAIS);
    salvarMoedas();
  }
  return carteiras.get(k);
}
function mudarSaldo(nome, delta) {
  const novo = Math.max(0, saldoDe(nome) + Math.round(delta));
  carteiras.set(chaveNome(nome), novo);
  salvarMoedas();
  return novo;
}

// Prêmios. Cada um tem um intervalo mínimo por pessoa, para ninguém "farmar" repetindo.
const PREMIOS = {
  parkour: { qtd: 50, intervalo: 90_000, motivo: 'parkour completo' },
  volta: { qtd: 30, intervalo: 40_000, motivo: 'volta na pista' },
};
// vitória numa mesa: contra gente, ou contra o computador por nível (fácil, médio, difícil)
const PREMIO_JOGO = {
  xadrez: { gente: 100, bot: [20, 50, 100] },
  dama: { gente: 60, bot: [15, 40, 80] },
  velha: { gente: 15, bot: [2, 5, 10] },
};
const ultimoPremio = new Map(); // "nome:tipo" -> quando

// Mesa de dados: dois d6, aposta contra a banca. Pagamento = quanto ganha por moeda apostada.
const PAGA_SOMA = { 2: 30, 3: 15, 4: 10, 5: 7, 6: 6, 7: 4, 8: 6, 9: 7, 10: 10, 11: 15, 12: 30 };
const APOSTAS = {
  baixo: { paga: 1, ganha: (a, b) => a + b <= 6 },
  alto: { paga: 1, ganha: (a, b) => a + b >= 8 },
  sete: { paga: 4, ganha: (a, b) => a + b === 7 },
  dupla: { paga: 4, ganha: (a, b) => a === b },
  soma: { paga: (v) => PAGA_SOMA[v], ganha: (a, b, v) => a + b === v },
};
const APOSTA_MAX = 10_000;

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = {
      id,
      users: new Map(),
      slots: new Array(SHARE_SLOTS).fill(null), // chave do compartilhamento em cada tela
      main: 'media', // 'media' (o player do telão) ou a chave do compartilhamento fixado nele
      media: { provider: null, id: null, playing: false, time: 0, updatedAt: Date.now(), by: null },
      chat: [],
      jogos: novosJogos(),
    };
    rooms.set(id, room);
  }
  return room;
}

// Xadrez de bruxo e dama gigante. O servidor guarda só os lances e quem senta em cada lado
// (0 = brancas/claras, que começam). Quem confere as regras é o cliente — aqui só se garante que
// cada um joga na sua vez e no lado em que está sentado. 'bot' = computador, jogado pelo botDono.
const JOGOS = ['xadrez', 'dama', 'velha'];
const LANCE_RE = { xadrez: /^[a-h][1-8][a-h][1-8][qrbn]?$/, dama: /^[a-h][1-8]([-x][a-h][1-8]){1,12}$/, velha: /^[a-c][1-3]$/ };
const COR = ['w', 'b'];
// As mesmas regras do cliente (módulos ES em public/js): com elas o servidor recusa lance
// ilegal e sabe quem ganhou, para pagar as moedas. Carrega em segundo plano.
let REGRAS = null;
Promise.all(JOGOS.map((j) => import(`./public/js/${j}.js`)))
  .then((ms) => { REGRAS = Object.fromEntries(JOGOS.map((j, i) => [j, ms[i]])); })
  .catch((err) => console.warn('  Regras dos jogos não carregaram (lances sem conferência):', err.message));
const MAX_LANCES = 600;
function novosJogos() {
  // desde: em que lance cada lado sentou (só vale moeda quem jogou a partida inteira)
  return Object.fromEntries(JOGOS.map((j) => [j, { lances: [], lugares: [null, null], botDono: null, st: null, fim: null, desde: [0, 0], nivel: 1, nivelMin: 1 }]));
}
const jogoPublico = (j) => ({ lances: j.lances, lugares: j.lugares, botDono: j.botDono });
// tira a pessoa das mesas (saiu da sala); devolve as mesas que mudaram
function levantarDeTudo(room, id) {
  const mudou = [];
  for (const [nome, j] of Object.entries(room.jogos)) {
    let m = false;
    j.lugares = j.lugares.map((l) => {
      if (l === id || (l === 'bot' && j.botDono === id)) { m = true; return null; }
      return l;
    });
    if (!j.lugares.includes('bot')) j.botDono = null;
    if (m) mudou.push(nome);
  }
  return mudou;
}

// Evento de mouse/teclado vindo de quem controla: só os campos esperados, com limites.
function eventoDeControle(raw) {
  const e = obj(raw);
  const n = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
  const mod = n(e.mod, 0, 15) | 0;
  if (e.t === 'mouse' && ['down', 'up', 'move'].includes(e.a)) {
    return { t: 'mouse', a: e.a, x: n(e.x, 0, 1), y: n(e.y, 0, 1), b: ['left', 'right', 'middle'].includes(e.b) ? e.b : 'left', n: n(e.n, 1, 3) | 0, arrastando: !!e.arrastando, mod };
  }
  if (e.t === 'wheel') return { t: 'wheel', x: n(e.x, 0, 1), y: n(e.y, 0, 1), dx: n(e.dx, -3000, 3000), dy: n(e.dy, -3000, 3000), mod };
  if (e.t === 'tecla' && (e.a === 'down' || e.a === 'up')) {
    // sem trim: a tecla de espaço é ' '
    return { t: 'tecla', a: e.a, key: String(e.key ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 24), code: cleanText(e.code, 24), kc: n(e.kc, 0, 255) | 0, mod };
  }
  if (e.t === 'texto') return { t: 'texto', s: String(e.s ?? '').slice(0, 2000) };
  return null;
}

function darMoedas(io, room, user, qtd, motivo) {
  if (!qtd) return;
  user.moedas = mudarSaldo(user.name, qtd);
  io.to(room.id).emit('moedas', { id: user.id, moedas: user.moedas, delta: qtd, motivo });
}

// prêmio com intervalo mínimo (parkour, volta)
function premiar(io, room, user, tipo) {
  const p = PREMIOS[tipo];
  const k = `${chaveNome(user.name)}:${tipo}`;
  const agora = Date.now();
  if (agora - (ultimoPremio.get(k) || 0) < p.intervalo) return;
  ultimoPremio.set(k, agora);
  darMoedas(io, room, user, p.qtd, p.motivo);
}

// Fim de partida: paga quem venceu (contra outra pessoa ou contra o computador). Jogar contra
// si mesmo, ou sentar no meio da partida, não vale.
function premiarJogo(io, room, mesa, j) {
  const v = j.fim?.vencedor;
  if (!v) return;
  const lado = COR.indexOf(v);
  const ganhador = room.users.get(j.lugares[lado]);
  const perdedor = j.lugares[1 - lado];
  if (!ganhador || !perdedor || perdedor === ganhador.id) return;
  if (j.desde[0] > 1 || j.desde[1] > 1) return;
  const tabela = PREMIO_JOGO[mesa];
  const qtd = perdedor === 'bot' ? tabela.bot[j.nivelMin] : tabela.gente;
  darMoedas(io, room, ganhador, qtd, `vitória ${mesa === 'velha' ? 'no jogo da velha' : mesa === 'dama' ? 'na dama' : 'no xadrez'}${perdedor === 'bot' ? ' contra o computador' : ''}`);
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, color: u.color, mic: u.mic,
    shares: [...u.shares.values()],
    p: u.p, r: u.r, a: u.a, photo: u.photo, shirt: u.shirt, char: u.char, health: u.health, ko: u.ko, moedas: u.moedas,
  };
}

// Aceita só data URL de imagem, com tamanho limitado.
function cleanPhoto(value) {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_PHOTO) return null;
  const tipos = ['data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,'];
  const prefixo = tipos.find((t) => value.startsWith(t));
  if (!prefixo) return null;
  const corpo = value.slice(prefixo.length);
  if (!corpo || !/^[A-Za-z0-9+/=]+$/.test(corpo)) return null;
  return value;
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mediaSnapshot(room) {
  return { ...room.media, serverNow: Date.now() };
}

function mediaCurrentTime(m) {
  return m.playing ? m.time + (Date.now() - m.updatedAt) / 1000 : m.time;
}

// Payload de cliente pode ser qualquer coisa: null passa pelo "= {}" e derrubaria o processo.
const obj = (v) => (v && typeof v === 'object' ? v : {});

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

// Uma pessoa pode compartilhar várias abas/janelas ao mesmo tempo, cada uma numa tela. A chave
// ("<id da pessoa>~<n>") é o que vai para o telão; o streamId liga a chave ao vídeo no WebRTC.
const donoDaChave = (key) => String(key).split('~')[0];

function shareExists(room, key) {
  return !!room.users.get(donoDaChave(key))?.shares.has(key);
}

// libera uma tela (key) ou todas as da pessoa; devolve as chaves liberadas
function freeShares(room, user, key = null) {
  const keys = key == null ? [...user.shares.keys()] : user.shares.has(key) ? [key] : [];
  for (const k of keys) {
    const sh = user.shares.get(k);
    if (sh.slot != null && room.slots[sh.slot] === k) room.slots[sh.slot] = null;
    user.shares.delete(k);
    if (room.main === k) room.main = 'media';
  }
  return keys;
}

// Com as 4 telas ocupadas, mais um compartilhamento vai direto para o telão, sem tela
// própria (slot null) — assim o telão mostra uma página e cada tela outra. Só um por sala.
function semTela(room) {
  for (const u of room.users.values()) for (const sh of u.shares.values()) if (sh.slot == null) return { user: u, share: sh };
  return null;
}

// liberou uma tela: o compartilhamento que estava só no telão ganha ela
function encaixarSemTela(room) {
  const t = semTela(room);
  const livre = room.slots.indexOf(null);
  if (!t || livre === -1) return null;
  t.share.slot = livre;
  room.slots[livre] = t.share.key;
  return t;
}

function attachSockets(io) {
  io.on('connection', (socket) => {
    let room = null;
    let user = null;

    socket.on('join', (data, ack) => {
      if (room) return;
      const roomId = cleanText(data?.room, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'principal';
      room = getRoom(roomId);
      user = {
        id: socket.id,
        name: cleanText(data?.name, 20) || 'Visitante',
        color: /^#[0-9a-f]{6}$/i.test(data?.color) ? data.color : '#7c9cff',
        mic: !!data?.mic,
        shares: new Map(), // chave -> { key, slot, streamId }
        shareSeq: 0,
        photo: cleanPhoto(data?.photo),
        shirt: SHIRTS.includes(data?.shirt) ? data.shirt : 'none',
        char: PERSONAGENS.includes(data?.char) ? data.char : 'padrao',
        health: 1,
        ko: false,
        ultimoDado: 0,
        p: [0, 0, -4], r: Math.PI, a: 0,
      };
      user.moedas = saldoDe(user.name);
      room.users.set(socket.id, user);
      socket.join(roomId);

      ack?.({
        selfId: socket.id,
        room: roomId,
        users: [...room.users.values()].filter((u) => u.id !== socket.id).map(publicUser),
        media: mediaSnapshot(room),
        main: room.main,
        chat: room.chat,
        leaderboard: getBoards(roomId).parkour,
        fights: getBoards(roomId).fights,
        voltas: getBoards(roomId).voltas,
        jogos: Object.fromEntries(Object.entries(room.jogos).map(([k, j]) => [k, jogoPublico(j)])),
        moedas: user.moedas,
      });
      socket.to(roomId).emit('user-joined', publicUser(user));
    });

    socket.on('state', (s) => {
      if (!user || !Array.isArray(s?.p)) return;
      user.p = s.p.slice(0, 3).map(Number);
      user.r = Number(s.r) || 0;
      user.a = Number(s.a) || 0;
      socket.to(room.id).volatile.emit('state', { id: user.id, p: user.p, r: user.r, a: user.a, s: s.s ? 1 : 0 });
    });

    socket.on('signal', (msg) => {
      const { to, data } = obj(msg);
      if (!user || !room.users.has(to)) return;
      io.to(to).emit('signal', { from: user.id, data });
    });

    socket.on('mic', (on) => {
      if (!user) return;
      user.mic = !!on;
      io.to(room.id).emit('user-update', { id: user.id, mic: user.mic });
    });

    // cada chamada é mais uma aba/janela (ou um arquivo) numa tela livre
    socket.on('share-start', (msg, ack) => {
      const { streamId } = obj(msg);
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!user) return;
      const sid = cleanText(streamId, 80);
      if (!sid) return reply({ ok: false, error: 'Compartilhamento inválido.' });
      let slot = room.slots.indexOf(null);
      if (slot === -1) {
        if (semTela(room)) return reply({ ok: false, error: 'Todas as telas e o telão já estão ocupados.' });
        slot = null; // vai direto para o telão
      }
      const key = `${user.id}~${++user.shareSeq}`;
      const share = { key, slot, streamId: sid, controle: false };
      if (slot != null) room.slots[slot] = key;
      user.shares.set(key, share);
      // Telão vazio? Fixa a tela compartilhada nele automaticamente.
      if (slot == null || (room.main === 'media' && !room.media.id)) room.main = key;
      io.to(room.id).emit('share-update', { id: user.id, ...share });
      io.to(room.id).emit('main', { source: room.main, by: null });
      reply({ ok: true, slot, key });
    });

    // sem chave: para todas as telas da pessoa
    socket.on('share-stop', (key) => {
      if (!user) return;
      const keys = freeShares(room, user, typeof key === 'string' ? key : null);
      for (const k of keys) io.to(room.id).emit('share-update', { id: user.id, key: k, gone: true });
      if (!keys.length) return;
      const t = encaixarSemTela(room);
      if (t) io.to(room.id).emit('share-update', { id: t.user.id, ...t.share });
      io.to(room.id).emit('main', { source: room.main, by: null });
    });

    // Controle remoto de aba (precisa da extensão do lado de quem compartilha). Só repassa para
    // telas em que o dono ligou "Permitir controle", e só eventos de mouse/teclado bem formados.
    socket.on('controle-permitir', (msg) => {
      const sh = user?.shares.get(msg?.key);
      if (!sh) return;
      sh.controle = !!msg.on;
      io.to(room.id).emit('share-update', { id: user.id, ...sh });
    });

    let ctrlJanela = 0;
    let ctrlConta = 0;
    socket.on('controle', (msg) => {
      if (!user || typeof msg?.key !== 'string') return;
      const dono = room.users.get(donoDaChave(msg.key));
      if (!dono?.shares.get(msg.key)?.controle) return;
      const agora = Date.now();
      if (agora - ctrlJanela > 1000) { ctrlJanela = agora; ctrlConta = 0; }
      if (++ctrlConta > 120) return; // mais de 120 eventos por segundo é abuso
      const ev = eventoDeControle(msg.ev);
      if (ev) io.to(dono.id).emit('controle', { key: msg.key, ev, de: user.name, deId: user.id });
    });

    socket.on('main', (source) => {
      if (!user || typeof source !== 'string') return;
      if (source !== 'media' && !shareExists(room, source)) return;
      room.main = source;
      io.to(room.id).emit('main', { source, by: user.name });
    });

    socket.on('media', (raw) => {
      const msg = obj(raw);
      if (!user) return;
      const m = room.media;
      const now = Date.now();
      const current = mediaCurrentTime(m);
      switch (msg.action) {
        case 'load': {
          const provider = String(msg.provider || '');
          const id = typeof msg.id === 'string' ? msg.id.trim() : '';
          if (!Object.hasOwn(MEDIA_IDS, provider) || !MEDIA_IDS[provider](id)) return;
          const t = Number(msg.time);
          Object.assign(m, { provider, id, playing: true, time: Number.isFinite(t) && t > 0 ? t : 0 });
          room.main = 'media';
          // sem autor: quem avisa "fulano colocou um vídeo" é o evento 'media' logo abaixo (evita aviso duplo)
          io.to(room.id).emit('main', { source: 'media', by: null });
          break;
        }
        case 'play':
        case 'pause': {
          if (!m.id) return;
          const t = Number(msg.time);
          Object.assign(m, { playing: msg.action === 'play', time: Number.isFinite(t) && t >= 0 ? t : current });
          break;
        }
        case 'seek': {
          const t = Number(msg.time);
          if (!m.id || !Number.isFinite(t)) return;
          m.time = Math.max(0, t);
          break;
        }
        case 'ended': if (m.playing && current > 3) Object.assign(m, { playing: false, time: current }); break;
        case 'stop': Object.assign(m, { provider: null, id: null, playing: false, time: 0 }); break;
        default: return;
      }
      m.updatedAt = now;
      m.by = user.name;
      io.to(room.id).emit('media', { ...mediaSnapshot(room), action: msg.action });
    });

    socket.on('chat', (text) => {
      if (!user) return;
      const clean = cleanText(text, 400);
      if (!clean) return;
      const msg = { id: user.id, name: user.name, color: user.color, text: clean, t: Date.now() };
      room.chat.push(msg);
      if (room.chat.length > MAX_CHAT) room.chat.shift();
      io.to(room.id).emit('chat', msg);
    });

    // ------------------------------------------------------------ foto do rosto
    socket.on('photo', (dataUrl) => {
      if (!user) return;
      user.photo = cleanPhoto(dataUrl);
      io.to(room.id).emit('user-update', { id: user.id, photo: user.photo });
    });

    socket.on('shirt', (kind) => {
      if (!user) return;
      user.shirt = SHIRTS.includes(kind) ? kind : 'none';
      io.to(room.id).emit('user-update', { id: user.id, shirt: user.shirt });
    });

    socket.on('char', (kind) => {
      if (!user) return;
      user.char = PERSONAGENS.includes(kind) ? kind : 'padrao';
      io.to(room.id).emit('user-update', { id: user.id, char: user.char });
    });

    // ------------------------------------------------------------ ringue
    socket.on('punch', () => {
      if (!user) return;
      socket.to(room.id).emit('punch', { id: user.id });
    });

    socket.on('hit', (msg) => {
      const { to, dir } = obj(msg);
      if (!user) return;
      const alvo = room.users.get(to);
      if (!alvo || alvo.id === user.id) return;
      // confere a distância no servidor: impede socar alguém do outro lado da sala
      if (dist(user.p, alvo.p) > PUNCH_RANGE) return;
      const d = Array.isArray(dir) ? dir.slice(0, 2).map(Number) : [0, 0];
      if (!d.every(Number.isFinite)) return;
      io.to(to).emit('hit', { from: user.id, fromName: user.name, dir: d });
    });

    // Tiro: só quem está com a camiseta 22. O servidor confere a camiseta, a cadência, que o
    // tiro saiu de perto de quem atirou e o alcance; o traçante vai para todo mundo ver.
    socket.on('tiro', (msg) => {
      const { to, dir, de, ate } = obj(msg);
      if (!user || user.shirt !== 'bolsonaro') return;
      const agora = Date.now();
      if (agora - (user.ultimoTiro || 0) < TIRO.cadenciaMs) return;
      user.ultimoTiro = agora;
      const ponto = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n))) ? v.map(Number) : null);
      const a = ponto(de);
      const b = ponto(ate);
      if (!a || !b || dist(a, user.p) > 6 || dist(a, b) > TIRO.alcance) return;
      socket.to(room.id).emit('tiro', { id: user.id, de: a, ate: b });
      const alvo = room.users.get(to);
      if (!alvo || alvo.id === user.id || dist(user.p, alvo.p) > TIRO.alcance) return;
      const d = Array.isArray(dir) ? dir.slice(0, 2).map(Number) : [0, 0];
      if (!d.every(Number.isFinite)) return;
      io.to(to).emit('hit', { from: user.id, fromName: user.name, dir: d, arma: true });
    });

    socket.on('health', (v) => {
      if (!user) return;
      const h = Number(v);
      if (!Number.isFinite(h)) return;
      user.health = Math.max(0, Math.min(1, h));
      socket.to(room.id).volatile.emit('user-update', { id: user.id, health: user.health });
    });

    socket.on('ko', (msg) => {
      const { by } = obj(msg);
      if (!user) return;
      user.ko = true;
      user.health = 0;
      const autor = by && by !== user.id ? room.users.get(by) : null;
      if (autor) {
        const placar = getBoards(room.id).fights;
        let linha = placar.find((e) => e.name === autor.name);
        if (!linha) {
          linha = { name: autor.name, color: autor.color, kos: 0, levou: 0 };
          placar.push(linha);
        }
        linha.kos += 1;
        linha.color = autor.color;
        const vitima = placar.find((e) => e.name === user.name);
        if (vitima) vitima.levou += 1;
        else placar.push({ name: user.name, color: user.color, kos: 0, levou: 1 });
        placar.sort((a, b) => b.kos - a.kos || a.levou - b.levou);
        placar.length = Math.min(placar.length, 10);
      }
      io.to(room.id).emit('ko', {
        id: user.id,
        name: user.name,
        by: autor ? autor.name : null,
        byColor: autor ? autor.color : null,
        fights: getBoards(room.id).fights,
      });
    });

    socket.on('revive', () => {
      if (!user) return;
      user.ko = false;
      user.health = 1;
      io.to(room.id).emit('user-update', { id: user.id, ko: false, health: 1 });
    });

    socket.on('volta', (tempo) => {
      if (!user) return;
      const t = Number(tempo);
      if (!Number.isFinite(t) || t < VOLTA_MIN || t > VOLTA_MAX) return;
      const placar = getBoards(room.id).voltas;
      const existente = placar.find((e) => e.name === user.name);
      let recorde = true;
      if (existente) {
        if (existente.time <= t) recorde = false;
        else Object.assign(existente, { time: t, color: user.color });
      } else {
        placar.push({ name: user.name, color: user.color, time: t });
      }
      placar.sort((a, b) => a.time - b.time);
      placar.length = Math.min(placar.length, 10);
      io.to(room.id).emit('volta', { name: user.name, color: user.color, time: t, recorde, voltas: placar });
      premiar(io, room, user, 'volta');
    });

    socket.on('parkour-finish', (time) => {
      if (!user) return;
      const t = Number(time);
      if (!Number.isFinite(t) || t < 8 || t > 3600) return;
      premiar(io, room, user, 'parkour');
      const board = getBoards(room.id).parkour;
      const existing = board.find((e) => e.name === user.name);
      if (existing && existing.time <= t) {
        io.to(room.id).emit('parkour-finish', { name: user.name, color: user.color, time: t, record: false, leaderboard: board });
        return;
      }
      if (existing) Object.assign(existing, { time: t, color: user.color });
      else board.push({ name: user.name, color: user.color, time: t });
      board.sort((a, b) => a.time - b.time);
      board.length = Math.min(board.length, 10);
      io.to(room.id).emit('parkour-finish', { name: user.name, color: user.color, time: t, record: true, leaderboard: board });
    });

    // atalho: abre um dos sites da lista no navegador compartilhado
    socket.on('browser-open', (siteId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!user || !BROWSER) return reply({ ok: false, error: 'Navegador compartilhado desligado.' });
      const site = BROWSER_SITES.find((s) => s.id === siteId);
      if (!site) return reply({ ok: false, error: 'Atalho desconhecido.' });
      // um clique por segundo na sala: dois atalhos ao mesmo tempo digitariam um por cima do outro
      const now = Date.now();
      if (now - (room.browserOpenAt || 0) < 1000) return reply({ ok: false, error: 'Calma, um atalho de cada vez.' });
      room.browserOpenAt = now;
      openInBrowser(site.url, (err) => {
        if (err) {
          console.warn('[navegador] atalho falhou:', err.message);
          return reply({ ok: false, error: 'Não consegui abrir: o navegador compartilhado está ligado?' });
        }
        reply({ ok: true });
        io.to(room.id).emit('browser-opened', { site: site.label, by: user.name });
      });
    });

    const mandarJogo = (mesa) => io.to(room.id).emit('jogo', { mesa, ...jogoPublico(room.jogos[mesa]) });
    const mesaDe = (msg) => (user && JOGOS.includes(msg?.mesa) ? room.jogos[msg.mesa] : null);

    socket.on('jogo-sentar', (msg, ack) => {
      const j = mesaDe(msg);
      const lado = Number(msg?.lado);
      if (!j || (lado !== 0 && lado !== 1)) return ack?.({ erro: 'Mesa inválida' });
      if (j.lugares[lado] && j.lugares[lado] !== user.id) return ack?.({ erro: 'Esse lado já tem dono' });
      if (j.lugares[lado] !== user.id) j.desde[lado] = j.lances.length;
      j.lugares[lado] = user.id;
      ack?.({ ok: true });
      mandarJogo(msg.mesa);
    });

    socket.on('jogo-levantar', (msg) => {
      const j = mesaDe(msg);
      const lado = Number(msg?.lado);
      if (!j || (lado !== 0 && lado !== 1)) return;
      const l = j.lugares[lado];
      if (l !== user.id && !(l === 'bot' && j.botDono === user.id)) return;
      j.lugares[lado] = null;
      if (!j.lugares.includes('bot')) j.botDono = null;
      mandarJogo(msg.mesa);
    });

    socket.on('jogo-bot', (msg, ack) => {
      const j = mesaDe(msg);
      const lado = Number(msg?.lado);
      if (!j || (lado !== 0 && lado !== 1)) return ack?.({ erro: 'Mesa inválida' });
      if (j.lugares[1 - lado] !== user.id) return ack?.({ erro: 'Sente do outro lado primeiro' });
      if (j.lugares[lado]) return ack?.({ erro: 'Esse lado já tem dono' });
      j.lugares[lado] = 'bot';
      j.botDono = user.id;
      j.desde[lado] = j.lances.length;
      j.nivel = [0, 1, 2].includes(msg.nivel) ? msg.nivel : 1;
      j.nivelMin = j.nivel;
      ack?.({ ok: true });
      mandarJogo(msg.mesa);
    });

    // trocou o nível do computador no meio da partida: vale o mais fácil que ele jogou
    socket.on('jogo-nivel', (msg) => {
      const j = mesaDe(msg);
      if (!j || j.botDono !== user.id || ![0, 1, 2].includes(msg.nivel)) return;
      j.nivel = msg.nivel;
      j.nivelMin = j.lances.length ? Math.min(j.nivelMin, msg.nivel) : msg.nivel;
    });

    socket.on('jogo-lance', (msg) => {
      const j = mesaDe(msg);
      if (!j || j.fim) return;
      const lance = String(msg.lance || '');
      if (!LANCE_RE[msg.mesa].test(lance) || Number(msg.n) !== j.lances.length || j.lances.length >= MAX_LANCES) return;
      const quem = j.lugares[j.lances.length % 2];
      if (quem !== user.id && !(quem === 'bot' && j.botDono === user.id)) return;
      const R = REGRAS?.[msg.mesa];
      if (R) {
        if (!j.st) {
          // lances guardados antes das regras carregarem: refaz; se algum não fecha, para nele
          let st = R.novo();
          for (const l of j.lances) {
            const m0 = R.deTexto(st, l);
            if (!m0) break;
            st = R.aplicar(st, m0);
          }
          j.st = st;
        }
        const m = R.deTexto(j.st, lance);
        if (!m) return; // lance ilegal
        j.st = R.aplicar(j.st, m);
      }
      j.lances.push(lance);
      mandarJogo(msg.mesa);
      const sit = R?.situacao(j.st);
      if (sit?.fim) {
        j.fim = sit;
        premiarJogo(io, room, msg.mesa, j);
      }
    });

    // partida nova: quem está sentado, ou qualquer um se só o computador (ou ninguém) está na mesa
    socket.on('jogo-novo', (msg) => {
      const j = mesaDe(msg);
      if (!j) return;
      const gente = j.lugares.filter((l) => l && l !== 'bot');
      if (gente.length && !gente.includes(user.id)) return;
      j.lances = [];
      j.st = null;
      j.fim = null;
      j.desde = [0, 0];
      j.nivelMin = j.nivel;
      mandarJogo(msg.mesa);
    });

    // Mesa de dados: o servidor rola (crypto), cobra e paga. Todo mundo vê os dados rolando.
    socket.on('dados-rolar', (msg, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!user) return;
      const agora = Date.now();
      if (agora - user.ultimoDado < 2500) return reply({ erro: 'Espere os dados pararem.' });
      const tipo = String(msg?.tipo || '');
      const regra = APOSTAS[tipo];
      const qtd = Math.floor(Number(msg?.qtd) || 0);
      const valor = Math.floor(Number(msg?.valor) || 0);
      if (qtd < 0 || qtd > APOSTA_MAX) return reply({ erro: 'Aposta inválida.' });
      if (qtd > 0 && !regra) return reply({ erro: 'Escolha em que apostar.' });
      if (tipo === 'soma' && !PAGA_SOMA[valor]) return reply({ erro: 'Escolha uma soma de 2 a 12.' });
      user.moedas = saldoDe(user.name);
      if (qtd > user.moedas) return reply({ erro: `Você só tem ${user.moedas} moedas.` });
      user.ultimoDado = agora;
      const a = crypto.randomInt(1, 7);
      const b = crypto.randomInt(1, 7);
      let delta = 0;
      let ganhou = false;
      if (qtd > 0) {
        ganhou = regra.ganha(a, b, valor);
        const paga = typeof regra.paga === 'function' ? regra.paga(valor) : regra.paga;
        delta = ganhou ? qtd * paga : -qtd;
        user.moedas = mudarSaldo(user.name, delta);
      }
      reply({ ok: true });
      io.to(room.id).emit('dados', {
        id: user.id, nome: user.name, cor: user.color, a, b,
        aposta: qtd > 0 ? { tipo, valor, qtd } : null, ganhou, delta, moedas: user.moedas,
      });
    });

    socket.on('emote', (kind) => {
      if (!user) return;
      socket.to(room.id).emit('emote', { id: user.id, kind: cleanText(kind, 12) });
    });

    socket.on('disconnect', () => {
      if (!room || !user) return;
      const hadSlot = freeShares(room, user).length > 0;
      room.users.delete(user.id);
      io.to(room.id).emit('user-left', { id: user.id });
      for (const mesa of levantarDeTudo(room, user.id)) io.to(room.id).emit('jogo', { mesa, ...jogoPublico(room.jogos[mesa]) });
      if (hadSlot) {
        const t = encaixarSemTela(room);
        if (t) io.to(room.id).emit('share-update', { id: t.user.id, ...t.share });
        io.to(room.id).emit('main', { source: room.main, by: null });
      }
      if (room.users.size === 0) {
        // Sala vazia: guarda só o placar e o vídeo por um tempo; limpa se ninguém voltar.
        setTimeout(() => { if (rooms.get(room.id)?.users.size === 0) rooms.delete(room.id); }, 30 * 60 * 1000);
      }
    });
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function loadCert() {
  const dir = path.join(__dirname, 'certs');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }
  const selfsigned = require('selfsigned');
  const altNames = [{ type: 2, value: 'localhost' }, ...lanAddresses().map((ip) => ({ type: 7, ip }))];
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'sala-3d.local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 825 * 24 * 3600 * 1000),
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

async function main() {
  const io = new Server({ cors: { origin: true }, maxHttpBufferSize: 1e6 });
  attachSockets(io);

  const httpServer = http.createServer(app);
  io.attach(httpServer);
  httpServer.listen(PORT, () => {
    console.log('\n  Sala 3D rodando!');
    console.log(`  → Você:          http://localhost:${PORT}`);
    console.log('  → Amigos (internet): rode "npm run tunnel" e mande o link https://...trycloudflare.com');
  });

  if (USE_HTTPS) {
    const httpsServer = https.createServer(await loadCert(), app);
    io.attach(httpsServer);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log('  → Amigos na mesma rede (aceite o aviso de certificado):');
      for (const ip of lanAddresses()) console.log(`       https://${ip}:${HTTPS_PORT}`);
      console.log('');
    });
  }
}

main();
