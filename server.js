// Sala 3D — servidor de sinalização (WebRTC), estado da sala, YouTube sincronizado e parkour.
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const USE_HTTPS = process.argv.includes('--https') || process.env.HTTPS === '1';
const SHARE_SLOTS = 4;
const MAX_CHAT = 60;

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.get('/config', (_req, res) => res.json({ iceServers, shareSlots: SHARE_SLOTS }));

// ---------------------------------------------------------------- estado das salas
const rooms = new Map();

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = {
      id,
      users: new Map(),
      slots: new Array(SHARE_SLOTS).fill(null), // userId por tela
      main: 'youtube', // 'youtube' ou userId fixado no telão
      youtube: { videoId: null, playing: false, time: 0, updatedAt: Date.now(), by: null },
      chat: [],
      leaderboard: [],
    };
    rooms.set(id, room);
  }
  return room;
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, color: u.color, mic: u.mic,
    slot: u.slot, screenStreamId: u.screenStreamId,
    p: u.p, r: u.r, a: u.a,
  };
}

function ytSnapshot(room) {
  return { ...room.youtube, serverNow: Date.now() };
}

function ytCurrentTime(yt) {
  return yt.playing ? yt.time + (Date.now() - yt.updatedAt) / 1000 : yt.time;
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function freeSlot(room, user) {
  if (user.slot == null) return false;
  room.slots[user.slot] = null;
  user.slot = null;
  user.screenStreamId = null;
  if (room.main === user.id) room.main = 'youtube';
  return true;
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
        slot: null,
        screenStreamId: null,
        p: [0, 0, -4], r: Math.PI, a: 0,
      };
      room.users.set(socket.id, user);
      socket.join(roomId);

      ack?.({
        selfId: socket.id,
        room: roomId,
        users: [...room.users.values()].filter((u) => u.id !== socket.id).map(publicUser),
        youtube: ytSnapshot(room),
        main: room.main,
        chat: room.chat,
        leaderboard: room.leaderboard,
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

    socket.on('signal', ({ to, data } = {}) => {
      if (!user || !room.users.has(to)) return;
      io.to(to).emit('signal', { from: user.id, data });
    });

    socket.on('mic', (on) => {
      if (!user) return;
      user.mic = !!on;
      io.to(room.id).emit('user-update', { id: user.id, mic: user.mic });
    });

    socket.on('share-start', ({ streamId } = {}, ack) => {
      if (!user) return;
      let slot = user.slot;
      if (slot == null) slot = room.slots.indexOf(null);
      if (slot === -1) return ack?.({ ok: false, error: 'Todas as telas estão ocupadas.' });
      room.slots[slot] = user.id;
      user.slot = slot;
      user.screenStreamId = cleanText(streamId, 80);
      // Telão vazio? Fixa a tela compartilhada nele automaticamente.
      if (room.main === 'youtube' && !room.youtube.videoId) room.main = user.id;
      io.to(room.id).emit('share-update', { id: user.id, slot, screenStreamId: user.screenStreamId });
      io.to(room.id).emit('main', { source: room.main, by: null });
      ack?.({ ok: true, slot });
    });

    socket.on('share-stop', () => {
      if (!user) return;
      if (freeSlot(room, user)) {
        io.to(room.id).emit('share-update', { id: user.id, slot: null, screenStreamId: null });
        io.to(room.id).emit('main', { source: room.main, by: null });
      }
    });

    socket.on('main', (source) => {
      if (!user) return;
      if (source !== 'youtube' && room.users.get(source)?.slot == null) return;
      room.main = source;
      io.to(room.id).emit('main', { source, by: user.name });
    });

    socket.on('yt', (msg = {}) => {
      if (!user) return;
      const yt = room.youtube;
      const now = Date.now();
      const current = ytCurrentTime(yt);
      switch (msg.action) {
        case 'load': {
          const id = cleanText(msg.videoId, 20);
          if (!/^[\w-]{6,20}$/.test(id)) return;
          Object.assign(yt, { videoId: id, playing: true, time: Math.max(0, Number(msg.time) || 0) });
          room.main = 'youtube';
          io.to(room.id).emit('main', { source: 'youtube', by: user.name });
          break;
        }
        case 'play':
        case 'pause': {
          if (!yt.videoId) return;
          const t = Number(msg.time);
          Object.assign(yt, { playing: msg.action === 'play', time: Number.isFinite(t) && t >= 0 ? t : current });
          break;
        }
        case 'seek': yt.time = Math.max(0, Number(msg.time) || 0); break;
        case 'ended': if (yt.playing && current > 3) Object.assign(yt, { playing: false, time: current }); break;
        case 'stop': Object.assign(yt, { videoId: null, playing: false, time: 0 }); break;
        default: return;
      }
      yt.updatedAt = now;
      yt.by = user.name;
      io.to(room.id).emit('yt', { ...ytSnapshot(room), action: msg.action });
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

    socket.on('parkour-finish', (time) => {
      if (!user) return;
      const t = Number(time);
      if (!Number.isFinite(t) || t < 8 || t > 3600) return;
      const board = room.leaderboard;
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

    socket.on('emote', (kind) => {
      if (!user) return;
      socket.to(room.id).emit('emote', { id: user.id, kind: cleanText(kind, 12) });
    });

    socket.on('disconnect', () => {
      if (!room || !user) return;
      const hadSlot = freeSlot(room, user);
      room.users.delete(user.id);
      io.to(room.id).emit('user-left', { id: user.id });
      if (hadSlot) io.to(room.id).emit('main', { source: room.main, by: null });
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
