// Sala 3D — junta tudo: lobby, mundo, jogador, voz/tela (WebRTC), telão (YouTube, Twitch…), chat e parkour.
import * as THREE from 'three';
import { World, SPAWN } from './world.js';
import { Avatar } from './avatars.js';
import { PERSONAGENS } from './modelo.js';
import { Player } from './player.js';
import { RTC, SHARE_PRESETS } from './rtc.js';
import { MediaSync, PROVIDERS, preloadYouTube } from './media.js';
import { ParkourRun, formatTime, CHECKPOINT_COUNT } from './parkour.js';
import { Combat } from './combat.js';
import { RING, COMBAT, ringCorners } from './arena.js';
import { Corrida, PISTA, largada, formatarVolta } from './pista.js';
import { sfx, audioContext, setSfxEnabled } from './sfx.js';
import { icon, hydrateIcons } from './icons.js';
import { isTouch, setupTouchControls, toggleFullscreen, isFullscreen, temTelaCheia } from './touch.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
};

const COLORS = ['#7c9cff', '#6ee7c8', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#38bdf8', '#a3e635', '#f97316', '#e2e8f0'];
const EMOTE_KEYS = ['wave', 'party', 'laugh', 'heart', 'clap', 'fire'];
const PANEL_TITLES = { people: 'Pessoas', chat: 'Chat da sala', telao: 'Telão', parkour: 'Parkour', ringue: 'Ringue de luta', corrida: 'Pista de corrida', settings: 'Ajustes' };

// ------------------------------------------------------------------ ajustes salvos
const DEFAULTS = {
  name: '', color: COLORS[0], mic: true, voice: 100, screen: 90, tv: 80, spatial: false,
  shareMode: 'detail', sens: 100, shadows: true, sfx: true, micDevice: '', helpCollapsed: false, photo: null, shirt: 'none', char: 'padrao',
};
const stored = (() => {
  try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
})();
const settings = { ...DEFAULTS, ...stored };
// o volume do telão se chamava "yt" quando ele só tocava YouTube
if (stored.tv === undefined && stored.yt !== undefined) settings.tv = stored.yt;
delete settings.yt;
// celular: sombra custa caro e quase não se vê na tela pequena — só se o usuário nunca escolheu
if (isTouch && stored.shadows === undefined) settings.shadows = false;
function saveSettings() {
  try { localStorage.setItem('sala3d', JSON.stringify(settings)); } catch { /* modo privado */ }
}

hydrateIcons();
setSfxEnabled(settings.sfx);
if (isTouch) {
  document.body.classList.add('touch');
  $('#lobby-note').hidden = true;
  $('#lobby-note-touch').hidden = false;
}
let touchPad = null; // controles de toque (só no celular)

// ------------------------------------------------------------------ mundo
const world = new World($('#gl'), $('#css3d'));
world.setShadows(settings.shadows);
const localAvatar = new Avatar({ name: settings.name || 'Você', color: settings.color, isLocal: true });
localAvatar.group.position.set(...SPAWN.pos);
world.scene.add(localAvatar.group);
const player = new Player(world, localAvatar);
player.sensitivity = settings.sens / 100;

const state = {
  joined: false,
  selfId: null,
  room: null,
  roomRequested: null,
  users: new Map(),
  main: 'media',
  micOn: settings.mic,
  micAvailable: false,
  sharing: false,
  casting: false, // a "tela" compartilhada é um arquivo de vídeo, não a captura da tela
  panel: null,
  focus: null,
  hovered: null,
  unread: 0,
  speaking: false,
};
let socket = null;
let rtc = null;
let tv = null; // player do telão (MediaSync)
let analyser = null;
let micBuf = null;

const sink = $('#media-sink');
// Celular bloqueia autoplay COM som. Antes o vídeo nascia com som, o play()
// era recusado e o erro ia para um catch vazio — resultado: a tela do amigo
// ficava preta no celular. Agora toca sempre mudo primeiro (isso o navegador
// deixa), tenta ligar o som e, se for barrado, mostra o botão de ativar.
const telasMudas = new Set();

async function tocarTela(v) {
  v.muted = true;
  try {
    await v.play();
  } catch (err) {
    console.warn('[tela] nem mudo tocou', err);
    return;
  }
  v.muted = false;
  await new Promise((r) => setTimeout(r, 60));
  if (v.paused || v.muted) {
    v.muted = true;
    telasMudas.add(v);
    v.play().catch(() => {});
  } else {
    telasMudas.delete(v);
  }
  updateUnblockButton();
}

// Chamado por um clique de verdade: aí o navegador libera o som.
function liberarSomDasTelas() {
  for (const v of telasMudas) {
    v.muted = false;
    v.play().catch(() => {});
  }
  telasMudas.clear();
  updateUnblockButton();
}

function updateUnblockButton() {
  const alvo = $('#tv-unblock');
  if (!alvo) return;
  const tvBloqueado = !!(tv?.blocked && world.mainScreen.mode === 'media');
  const telaMuda = telasMudas.size > 0;
  alvo.hidden = !(tvBloqueado || telaMuda);
  const btn = $('#tv-unblock-btn');
  if (btn && alvo.hidden === false) {
    btn.innerHTML = icon('volume', 16) + (telaMuda && !tvBloqueado ? 'Ativar o som da tela' : 'Ativar o som do telão');
  }
}

function makeVideo(muted) {
  const v = document.createElement('video');
  v.autoplay = true;
  v.playsInline = true;
  v.muted = muted;
  sink.appendChild(v);
  return v;
}
const localScreenVideo = makeVideo(true);
const self = () => state.users.get(state.selfId);

// ------------------------------------------------------------------ toasts
function toast(text, kind = 'info', ms = 4200, color = null) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const c = color || (kind === 'warn' ? 'var(--warn)' : kind === 'error' ? 'var(--danger)' : null);
  el.innerHTML = `<span class="tdot"${c ? ` style="--c:${c}"` : ''}></span><span></span>`;
  el.lastChild.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// ------------------------------------------------------------------ lobby
const nameInput = $('#in-name');
const roomInput = $('#in-room');
const params = new URLSearchParams(window.location.search);
nameInput.value = settings.name;
roomInput.value = params.get('sala') || '';
$('#in-mic').checked = settings.mic;

function renderSwatches() {
  $('#swatches').innerHTML = COLORS.map((c) => `<button type="button" role="radio" aria-label="Cor ${c}" aria-checked="${c === settings.color}" style="--c:${c}" data-color="${c}"></button>`).join('');
}
renderSwatches();
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  settings.color = b.dataset.color;
  localAvatar.setColor(settings.color);
  renderSwatches();
});
nameInput.addEventListener('input', () => localAvatar.setName(nameInput.value.trim() || 'Você'));
if (settings.name) localAvatar.setName(settings.name);

// ---------------------------------------------------------------- foto do rosto
// Reduz para 128x128 recortando o centro: o que trafega é um JPEG de ~10 kB, não o
// arquivo original de vários MB que a câmera do celular produz.
const PHOTO_SIZE = 128;
function photoFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Isso não é uma imagem.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.width, img.height);
      const cv = document.createElement('canvas');
      cv.width = cv.height = PHOTO_SIZE;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      resolve(cv.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
    img.src = url;
  });
}

function renderPhotoPreview() {
  const box = $('#photo-prev');
  if (settings.photo) {
    box.innerHTML = '';
    const img = new Image();
    img.src = settings.photo;
    img.alt = '';
    box.appendChild(img);
  } else {
    box.innerHTML = icon('user', 22);
  }
  $('#photo-clear').hidden = !settings.photo;
}

function applyPhoto(dataUrl) {
  settings.photo = dataUrl || null;
  saveSettings();
  renderPhotoPreview();
  localAvatar.setPhoto(settings.photo);
  if (socket && state.joined) socket.emit('photo', settings.photo);
}

renderPhotoPreview();
if (settings.photo) localAvatar.setPhoto(settings.photo);

// ---------------------------------------------------------------- personagem
$('#in-char').innerHTML = Object.values(PERSONAGENS)
  .map((p) => `<button type="button" data-char="${p.id}">${esc(p.label)}</button>`).join('');

async function aplicarPersonagem() {
  const def = PERSONAGENS[settings.char] || PERSONAGENS.padrao;
  $$('#in-char button').forEach((b) => b.classList.toggle('on', b.dataset.char === settings.char));
  // camiseta e foto só existem no boneco padrão: o modelo 3D tem o corpo dele
  const ehPadrao = !def.url;
  $('#campo-camiseta').hidden = !ehPadrao;
  $('#campo-foto').hidden = !ehPadrao;
  const linha = [];
  if (def.aviso) linha.push(def.aviso);
  if (def.credito) linha.push('Modelo: ' + def.credito);
  $('#char-credito').textContent = linha.join(' · ');
  const r = await localAvatar.setPersonagem(def);
  if (r && r.ok === false) toast('Não consegui carregar esse personagem.', 'error');
}
aplicarPersonagem();

$('#in-char').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-char]');
  if (!b) return;
  settings.char = b.dataset.char;
  saveSettings();
  await aplicarPersonagem();
  if (socket && state.joined) socket.emit('char', settings.char);
});

// ---------------------------------------------------------------- camiseta
function renderShirt() {
  $$('#in-shirt button').forEach((b) => b.classList.toggle('on', b.dataset.shirt === settings.shirt));
  localAvatar.setShirt(settings.shirt);
}
renderShirt();
$('#in-shirt').addEventListener('click', (e) => {
  const b = e.target.closest('[data-shirt]');
  if (!b) return;
  settings.shirt = b.dataset.shirt;
  saveSettings();
  renderShirt();
  if (socket && state.joined) socket.emit('shirt', settings.shirt);
});
$('#photo-pick').addEventListener('click', () => $('#photo-file').click());
$('#photo-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    applyPhoto(await photoFromFile(file));
  } catch (err) {
    toast(err.message, 'error');
  }
});
$('#photo-clear').addEventListener('click', () => applyPhoto(null));

if (!window.isSecureContext || !navigator.mediaDevices) {
  // o aviso tem que cair na nota que está visível (a do celular é outra)
  const note = isTouch ? $('#lobby-note-touch') : $('#lobby-note');
  note.classList.add('warn');
  note.innerHTML = 'Este endereço não é seguro (http). Microfone e compartilhamento de tela só funcionam em <b>https</b> ou <b>localhost</b>. Use o link do túnel (npm run tunnel) ou <b>npm run https</b>.';
}

setTimeout(() => localAvatar.emote('wave'), 900);

$('#lobby-form').addEventListener('submit', (e) => {
  e.preventDefault();
  join();
});

// ------------------------------------------------------------------ entrar na sala
async function join() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  settings.name = name;
  settings.mic = $('#in-mic').checked;
  saveSettings();
  state.micOn = settings.mic;
  state.roomRequested = roomInput.value.trim() || 'principal';

  const btn = $('#btn-join');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  audioContext();

  let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  try { config = await (await fetch('/config')).json(); } catch { /* usa o padrão */ }

  socket = window.io();
  combat.socket = socket;
  rtc = new RTC(socket, { iceServers: config.iceServers, onTrack: handleTrack });
  rtc.shareMode = settings.shareMode;
  preloadYouTube();
  $('#browser-block').hidden = !config.browser;
  renderBrowserSites(config.browser?.sites || []);
  tv = new MediaSync(socket, $('#tv-host'), {
    // o sufixo do id evita dois "Ana" brigando pela mesma sessão dentro do neko
    browser: config.browser && { ...config.browser, name: () => `${settings.name}-${(state.selfId || '').slice(-3)}` },
    onChange: onTvChange,
    onError: (msg) => {
      toast(msg, 'error', 6000);
      showTvError(msg);
    },
    onNotice: (msg) => toast(msg, 'warn', 6000),
  });
  tv.setVolume(settings.tv);
  bindSocket();

  const data = await emitJoin();
  applyJoined(data);
  // pede o microfone sem travar a entrada; a voz entra nas conexões assim que liberada
  if (state.micOn) {
    initMic().then(() => {
      socket.emit('mic', state.micOn && state.micAvailable);
      updateMicButton();
      const me = self();
      if (me) me.mic = state.micOn && state.micAvailable;
      renderPeople();
    });
  }

  state.joined = true;
  $('#lobby').hidden = true;
  $('#hud').hidden = false;
  $('#bar').hidden = false;
  localAvatar.setName(name);
  const spawn = [SPAWN.pos[0] + (Math.random() - 0.5) * 8, 0, SPAWN.pos[2] + Math.random() * 3];
  player.teleport(spawn, SPAWN.yaw);
  player.enabled = true;
  updateMicButton();
  if (!navigator.mediaDevices?.getDisplayMedia) {
    $('#btn-share').hidden = true;
    $('#share-unsupported').hidden = false;
    $('#share-mode-field').hidden = true;
  }
  sfx.join();
  if (isTouch) {
    touchPad = setupTouchControls(player, {
      use: () => { if (state.hovered) enterFocus(state.hovered); else if (state.focus) exitFocus(); },
      view: toggleView,
      respawn: () => { if (!state.focus) respawn(); },
      punch: () => punch(),
      sit: () => toggleSit(),
      fullscreen: async () => {
        const r = await toggleFullscreen();
        updateFullscreenButton();
        if (r.ok) return;
        if (r.motivo === 'sem-suporte') {
          toast('Este navegador não tem tela cheia. No iPhone, use o Safari e "Adicionar à Tela de Início".', 'warn', 7000);
        } else {
          toast('O navegador recusou a tela cheia. Tente de novo tocando no botão.', 'warn', 5000);
        }
      },
    });
    syncTouchVisibility();
    if (!temTelaCheia) $('#tb-full').hidden = true; // iOS não tem tela cheia de página
    if (window.matchMedia('(orientation: portrait)').matches) {
      toast('Vire o celular na horizontal para jogar melhor.', 'warn', 7000);
    }
  }
}

function emitJoin() {
  return new Promise((resolve) => {
    socket.emit('join', {
      room: state.roomRequested,
      name: settings.name,
      color: settings.color,
      mic: state.micOn && state.micAvailable,
      photo: settings.photo,
      shirt: settings.shirt,
      char: settings.char,
    }, resolve);
  });
}

function applyJoined(data) {
  state.selfId = data.selfId;
  rtc.selfId = data.selfId;
  state.room = data.room;
  state.users.clear();
  state.users.set(data.selfId, {
    id: data.selfId, name: settings.name, color: settings.color, mic: state.micOn && state.micAvailable,
    slot: null, screenStreamId: null, isSelf: true, avatar: localAvatar, streams: new Map(),
  });
  for (const u of data.users) addUser(u);
  state.main = data.main;
  tv.setInitial(data.media);

  $('#chat-list').innerHTML = '';
  if (data.chat.length) data.chat.forEach((m) => addChat(m, false));
  else $('#chat-list').innerHTML = '<li class="empty">Nenhuma mensagem ainda. Diga oi! 👋</li>';
  setLeaderboard(data.leaderboard);
  setFightBoard(data.fights);
  setRaceBoard(data.voltas);

  for (const u of data.users) rtc.getPeer(u.id);

  const url = new URL(window.location.href);
  url.searchParams.set('sala', state.room);
  window.history.replaceState(null, '', url);
  refreshScreens();
  renderPeople();
  updateRoomInfo();
}

function bindSocket() {
  socket.on('disconnect', () => {
    if (state.joined) $('#reconnecting').hidden = false;
  });
  socket.on('connect', async () => {
    if (!state.joined) return;
    // reconexão: refaz tudo do zero com o novo id
    $('#reconnecting').hidden = true;
    if (state.sharing) stopShare(false);
    for (const id of [...state.users.keys()]) if (id !== state.selfId) removeUser(id, true);
    const data = await emitJoin();
    applyJoined(data);
    toast('Reconectado!');
  });

  socket.on('user-joined', (u) => {
    addUser(u);
    rtc.getPeer(u.id);
    sfx.join();
    toast(`${u.name} entrou na sala`, 'info', 3500, u.color);
    renderPeople();
    updateRoomInfo();
  });

  socket.on('user-left', ({ id }) => {
    const u = state.users.get(id);
    if (!u) return;
    sfx.leave();
    toast(`${u.name} saiu`, 'info', 3000, u.color);
    removeUser(id);
  });

  socket.on('state', ({ id, p, r, a, s }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    u.avatar.setNetworkState(p, r, a);
    u.speaking = !!s;
    u.avatar.speaking = !!s;
  });

  socket.on('user-update', ({ id, mic, photo, shirt, char, health, ko }) => {
    const u = state.users.get(id);
    if (!u) return;
    if (mic !== undefined) {
      u.mic = mic;
      u.avatar.setStatus({ mic });
      renderPeople();
    }
    if (photo !== undefined) {
      u.photo = photo;
      u.avatar.setPhoto(photo);
    }
    if (shirt !== undefined) {
      u.shirt = shirt;
      u.avatar.setShirt(shirt);
    }
    if (char !== undefined) {
      u.char = char;
      u.avatar.setPersonagem(PERSONAGENS[char]);
    }
    if (health !== undefined) u.avatar.setHealth(health);
    if (ko !== undefined) u.avatar.setKo(ko);
  });

  // ------------------------------------------------------------ ringue
  socket.on('volta', ({ name, color, time, recorde, voltas }) => {
    setRaceBoard(voltas);
    if (name === settings.name) return; // o próprio já viu no HUD
    if (recorde) toast(`${name} fez ${formatarVolta(time)} na pista`, 'info', 4200, color);
  });

  socket.on('punch', ({ id }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    u.avatar.punch();
    sfx.punchSwing();
  });

  socket.on('hit', ({ from, fromName, dir }) => {
    combat.takeHit({ dir, from, fromName });
  });

  socket.on('ko', ({ id, name, by, byColor, fights }) => {
    setFightBoard(fights);
    const u = state.users.get(id);
    if (u && !u.isSelf) {
      u.avatar.setKo(true);
      u.avatar.setHealth(0);
      setTimeout(() => { u.avatar.setKo(false); u.avatar.setHealth(1); }, COMBAT.respawnDelay * 1000);
    }
    sfx.ko();
    toast(by ? `${by} nocauteou ${name}!` : `${name} caiu do ringue!`, 'warn', 4200, byColor || null);
  });

  socket.on('share-update', ({ id, slot, screenStreamId }) => {
    const u = state.users.get(id);
    if (!u) return;
    const was = u.slot;
    if (slot == null && u.screenStreamId) u.streams.delete(u.screenStreamId);
    u.slot = slot;
    u.screenStreamId = screenStreamId;
    u.avatar.setStatus({ sharing: slot != null });
    if (!u.isSelf) {
      routeStreams(u);
      if (slot != null && was == null) toast(`${u.name} começou a compartilhar a tela (Tela ${slot + 1})`, 'info', 4500, u.color);
    }
    refreshScreens();
    renderPeople();
  });

  socket.on('main', ({ source, by }) => {
    state.main = source;
    refreshScreens();
    renderPeople();
    if (by && by !== settings.name) {
      const u = state.users.get(source);
      toast(source === 'media' ? `${by} voltou o telão para o ${tv.label}` : `${by} colocou a tela de ${u?.name ?? 'alguém'} no telão`);
    }
  });

  socket.on('chat', (m) => addChat(m, m.id !== state.selfId));

  socket.on('browser-opened', ({ site, by }) => {
    toast(by === settings.name ? `Abrindo ${site} no telão` : `${by} abriu ${site} no navegador do telão`, 'info', 3500, '#38bdf8');
  });

  socket.on('emote', ({ id, kind }) => state.users.get(id)?.avatar.emote(kind));

  socket.on('parkour-finish', ({ name, color, time, record, leaderboard }) => {
    setLeaderboard(leaderboard);
    const me = name === settings.name;
    if (me) {
      if (record) toast(`Novo recorde pessoal: ${formatTime(time)}!`, 'info', 5000, '#fde047');
    } else {
      toast(`${name} completou o parkour em ${formatTime(time)}${record ? ' — recorde!' : ''}`, 'info', 5000, color);
    }
  });
}

// ------------------------------------------------------------------ pessoas
function addUser(data) {
  if (state.users.has(data.id)) return state.users.get(data.id);
  const avatar = new Avatar({ name: data.name, color: data.color });
  avatar.setStatus({ mic: data.mic, sharing: data.slot != null });
  if (data.photo) avatar.setPhoto(data.photo);
  if (data.shirt && data.shirt !== 'none') avatar.setShirt(data.shirt);
  if (data.char && data.char !== 'padrao') avatar.setPersonagem(PERSONAGENS[data.char]);
  if (data.health != null) avatar.setHealth(data.health);
  if (data.ko) avatar.setKo(true);
  avatar.setNetworkState(data.p, data.r, data.a);
  world.scene.add(avatar.group);
  const u = { ...data, isSelf: false, avatar, streams: new Map(), audioEl: null, screenVideo: null, speaking: false };
  state.users.set(u.id, u);
  return u;
}

function removeUser(id, quiet = false) {
  const u = state.users.get(id);
  if (!u || u.isSelf) return;
  u.avatar.dispose();
  if (u.audioEl) {
    u.audioEl.srcObject = null;
    u.audioEl.remove();
  }
  if (u.screenVideo) {
    u.screenVideo.srcObject = null;
    u.screenVideo.remove();
  }
  state.users.delete(id);
  rtc.removePeer(id);
  if (state.focus?.userId === id) exitFocus();
  if (!quiet) {
    refreshScreens();
    renderPeople();
    updateRoomInfo();
  }
}

function updateRoomInfo() {
  const n = state.users.size;
  $('#room-name').textContent = state.room;
  $('#bar-room').textContent = `#${state.room}`;
  $('#room-count').textContent = `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
  $('#people-badge').textContent = n;
  $('#invite-url').textContent = inviteUrl();
}

function statusText(u) {
  const st = rtc?.peers.get(u.id)?.pc.connectionState;
  if (st === 'failed') return 'Falha na conexão de áudio/vídeo';
  if (st === 'connecting') return 'Conectando…';
  return 'Na sala';
}

function renderPeople() {
  if (!state.joined && !state.selfId) return;
  const users = [...state.users.values()].sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)));
  $('#people-list').innerHTML = users.map((u) => {
    const sharing = u.slot != null;
    const sub = sharing
      ? `Compartilhando · Tela ${u.slot + 1}${state.main === u.id ? ' · no telão' : ''}`
      : u.isSelf ? 'Você' : statusText(u);
    return `<li class="person${u.speaking ? ' speaking' : ''}" data-id="${esc(u.id)}">
      <span class="avatar-dot" style="--c:${esc(u.color)}">${esc((u.name[0] || '?').toUpperCase())}</span>
      <div class="person-info">
        <div class="person-name">${esc(u.name)}${u.isSelf ? ' <small>(você)</small>' : ''}</div>
        <div class="person-sub${sharing ? ' sharing' : ''}">${esc(sub)}</div>
      </div>
      <div class="person-actions">
        ${sharing ? `<button type="button" class="icon-btn" data-act="view" title="Ver a tela">${icon('eye', 18)}</button>
        <button type="button" class="icon-btn${state.main === u.id ? ' on' : ''}" data-act="pin" title="${state.main === u.id ? 'Tirar do telão' : 'Pôr no telão'}">${icon('pin', 18)}</button>` : ''}
        ${!u.isSelf ? `<button type="button" class="icon-btn" data-act="goto" title="Ir até">${icon('goto', 18)}</button>` : ''}
        ${u.mic ? '' : `<span class="muted-ic" title="Microfone desligado">${icon('micOff', 18)}</span>`}
      </div>
    </li>`;
  }).join('');
}

$('#people-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const u = state.users.get(id);
  if (!u) return;
  if (btn.dataset.act === 'view') enterFocus({ kind: 'share', userId: id });
  if (btn.dataset.act === 'pin') togglePin(id);
  if (btn.dataset.act === 'goto') {
    const p = u.avatar.group.position;
    run.cancel();
    hideParkourHud();
    player.teleport([p.x + 1.4, p.y, p.z + 1.4], null);
  }
});

function togglePin(id) {
  socket.emit('main', state.main === id ? 'media' : id);
}

// ------------------------------------------------------------------ microfone
async function initMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    state.micAvailable = false;
    state.micOn = false;
    return;
  }
  try {
    try {
      await rtc.startMic(settings.micDevice || null);
    } catch (err) {
      if (!settings.micDevice) throw err;
      settings.micDevice = '';
      await rtc.startMic(null);
    }
  } catch (err) {
    console.warn('[mic]', err);
    state.micAvailable = false;
    state.micOn = false;
    toast('Microfone bloqueado ou indisponível — você ainda ouve e assiste tudo. Clique no microfone para tentar de novo.', 'warn', 7000);
    return;
  }
  state.micAvailable = true;
  rtc.setMicEnabled(state.micOn);
  setupAnalyser();
  populateDevices();
}

function setupAnalyser() {
  try {
    const ac = audioContext();
    const src = ac.createMediaStreamSource(new MediaStream([rtc.micTrack]));
    analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    micBuf = new Float32Array(analyser.fftSize);
  } catch (err) {
    console.warn('[mic analyser]', err);
  }
}

async function toggleMic() {
  if (!state.micAvailable) {
    state.micOn = true;
    await initMic();
    if (!state.micAvailable) return updateMicButton();
  } else {
    state.micOn = !state.micOn;
  }
  rtc.setMicEnabled(state.micOn);
  socket.emit('mic', state.micOn);
  const me = self();
  if (me) me.mic = state.micOn;
  localAvatar.setStatus({ mic: state.micOn });
  updateMicButton();
  renderPeople();
}

function updateMicButton() {
  const on = state.micOn && state.micAvailable;
  const b = $('#btn-mic');
  b.classList.toggle('off', !on);
  b.querySelector('i').innerHTML = icon(on ? 'mic' : 'micOff');
  b.dataset.tip = on ? 'Desligar microfone (M)' : 'Ligar microfone (M)';
  localAvatar.setStatus({ mic: on });
}

async function populateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const sel = $('#set-mic-device');
    sel.innerHTML = '<option value="">Padrão do sistema</option>'
      + mics.filter((d) => d.deviceId && d.deviceId !== 'default')
        .map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microfone')}</option>`).join('');
    sel.value = settings.micDevice || '';
  } catch { /* sem permissão */ }
}

// ------------------------------------------------------------------ compartilhar tela
async function toggleShare() {
  if (state.sharing) return stopShare(true);
  if (shareBusy) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Seu navegador não permite compartilhar a tela aqui. Use Chrome/Edge no computador (https ou localhost).', 'error', 6000);
    return;
  }
  let stream;
  shareBusy = true;
  try {
    stream = await rtc.startScreen();
    if (!(await publishShare(stream))) return;
  } catch (err) {
    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(`Não foi possível compartilhar: ${err.message}`, 'error');
    return;
  } finally {
    shareBusy = false;
  }
  if (!stream.getAudioTracks().length) {
    toast('Compartilhando sem som. Para mandar o som, escolha uma aba ou a tela inteira e marque “Compartilhar áudio”.', 'warn', 8000);
  } else {
    toast(`Você está compartilhando na Tela ${self().slot + 1} (com som)`);
  }
}

// reserva uma tela no servidor e manda o stream (captura de tela ou arquivo) para todo mundo
async function publishShare(stream) {
  const res = await new Promise((resolve) => socket.emit('share-start', { streamId: stream.id }, resolve));
  if (!res?.ok) {
    rtc.stopScreen();
    toast(res?.error || 'Não foi possível compartilhar.', 'error');
    return false;
  }
  state.sharing = true;
  const me = self();
  me.slot = res.slot;
  me.screenStreamId = stream.id;
  localScreenVideo.srcObject = stream;
  localScreenVideo.play().catch(() => {});
  rtc.publishScreen();
  // captura de tela: a trilha acaba quando a pessoa clica em "Parar" na barra do navegador.
  // Arquivo: acaba toda vez que o vídeo chega ao fim, e isso não é motivo para parar.
  if (!state.casting) {
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (rtc.screenStream === stream) stopShare(true);
    });
  }
  localAvatar.setStatus({ sharing: true });
  updateShareButton();
  refreshScreens();
  renderPeople();
  return true;
}

function stopShare(notify) {
  if (!state.sharing) return;
  rtc.stopScreen();
  stopCastVideo();
  if (notify) socket.emit('share-stop');
  state.sharing = false;
  localScreenVideo.srcObject = null;
  const me = self();
  if (me) {
    me.slot = null;
    me.screenStreamId = null;
  }
  localAvatar.setStatus({ sharing: false });
  updateShareButton();
  refreshScreens();
  renderPeople();
}

function updateShareButton() {
  const b = $('#btn-share');
  b.classList.toggle('on', state.sharing);
  b.querySelector('i').innerHTML = icon(state.sharing ? 'shareOff' : 'share');
  b.dataset.tip = state.casting ? 'Parar de transmitir o vídeo' : state.sharing ? 'Parar de compartilhar' : 'Compartilhar tela';
}

// ------------------------------------------------------------------ vídeo do computador
// O arquivo toca num <video> escondido e o captureStream() dele vira a "tela" que vai para
// os outros pelo WebRTC: qualidade do arquivo, com som, sem capturar o resto do PC.
const castVideo = makeVideo(false);
// Só o captureStream() sem prefixo: o mozCaptureStream() do Firefox deixa quem transmite
// sem som (bugzilla.mozilla.org/show_bug.cgi?id=1178751).
const castSupported = !!castVideo.captureStream && !!window.RTCPeerConnection;
let castUrl = null;
let shareBusy = false; // começando uma tela ou um arquivo: um de cada vez

// espera um evento; resolve true se veio, false se estourou o tempo, e rejeita no evento de falha
function waitEvent(target, ok, fail, ms) {
  return new Promise((resolve, reject) => {
    const done = (fn, arg) => {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      if (fail) target.removeEventListener(fail, onFail);
      fn(arg);
    };
    const onOk = () => done(resolve, true);
    const onFail = () => done(reject, new Error(fail));
    const timer = setTimeout(() => done(resolve, false), ms);
    target.addEventListener(ok, onOk);
    if (fail) target.addEventListener(fail, onFail);
  });
}

async function castFile(file) {
  if (!castSupported) {
    toast('Este navegador não consegue transmitir arquivos. Use Chrome ou Edge no computador.', 'error', 6000);
    return;
  }
  if (shareBusy) return;
  shareBusy = true;
  try {
    await startCast(file);
  } finally {
    shareBusy = false;
  }
}

async function startCast(file) {
  if (state.sharing) stopShare(true);
  stopCastVideo();
  castUrl = URL.createObjectURL(file);
  castVideo.src = castUrl;
  castVideo.muted = false;
  castVideo.volume = settings.tv / 100;
  let abriu = false;
  try {
    abriu = await waitEvent(castVideo, 'loadedmetadata', 'error', 20000);
  } catch { /* abriu continua false */ }
  if (!abriu || !castVideo.videoWidth) {
    stopCastVideo();
    toast('O navegador não conseguiu abrir esse arquivo. MP4 (H.264) e WebM funcionam sempre; MKV e MOV dependem dos codecs.', 'error', 8000);
    return;
  }
  try {
    await castVideo.play();
  } catch {
    // sem permissão para tocar com som aqui: os outros recebem o som mesmo assim
    castVideo.muted = true;
    await castVideo.play().catch(() => {});
    toast('Toque em ▶ no painel do telão para ouvir aqui também.', 'warn', 6000);
  }
  const stream = castVideo.captureStream();
  if (!stream.getVideoTracks().length) await waitEvent(stream, 'addtrack', null, 3000);
  if (!stream.getVideoTracks().length) {
    stopCastVideo();
    toast('Não consegui transmitir a imagem desse arquivo.', 'error');
    return;
  }
  rtc.useStream(stream, { height: castVideo.videoHeight });
  state.casting = true;
  if (!(await publishShare(stream))) {
    stopCastVideo();
    return;
  }
  // depois do fim, dar play de novo cria trilhas novas no mesmo stream: repassa para todos
  stream.addEventListener('addtrack', (e) => {
    if (rtc.screenStream !== stream) return;
    rtc.replaceScreenTrack(e.track);
    localScreenVideo.play().catch(() => {}); // o stream ficou sem trilhas no fim e o <video> parou
  });
  $('#cast-title').textContent = file.name;
  updateShareButton();
  renderCast();
  // quem escolhe um filme quer ver no telão, não numa das telinhas
  if (state.main !== state.selfId) socket.emit('main', state.selfId);
  toast(`Transmitindo “${file.name}” no telão`);
}

function stopCastVideo() {
  state.casting = false;
  castVideo.pause();
  castVideo.removeAttribute('src');
  castVideo.load();
  if (castUrl) URL.revokeObjectURL(castUrl);
  castUrl = null;
  renderCast();
}

function renderCast() {
  $('#cast-now').hidden = !state.casting;
  $('#cast-pick').innerHTML = icon('film', 18) + (state.casting ? 'Trocar de vídeo' : 'Escolher vídeo');
  $('#cast-play').innerHTML = icon(castVideo.paused ? 'play' : 'pause', 22);
}

function updateCastProgress() {
  const cur = castVideo.currentTime || 0;
  const dur = Number.isFinite(castVideo.duration) ? castVideo.duration : 0;
  $('#cast-cur').textContent = mmss(cur);
  $('#cast-dur').textContent = mmss(dur);
  $('#cast-fill').style.width = dur ? `${Math.min(100, (cur / dur) * 100)}%` : '0%';
}

if (!castSupported) {
  $('#cast-pick').hidden = true;
  $('#cast-unsupported').hidden = false;
}
$('#cast-pick').addEventListener('click', () => $('#cast-file').click());
$('#cast-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) castFile(file);
});
$('#cast-play').addEventListener('click', () => {
  if (castVideo.paused) {
    castVideo.muted = false;
    castVideo.play().catch(() => {});
  } else {
    castVideo.pause();
  }
});
$('#cast-back').addEventListener('click', () => { castVideo.currentTime = Math.max(0, castVideo.currentTime - 10); });
$('#cast-fwd').addEventListener('click', () => {
  if (Number.isFinite(castVideo.duration)) castVideo.currentTime = Math.min(castVideo.duration, castVideo.currentTime + 10);
});
$('#cast-stop').addEventListener('click', () => stopShare(true));
$('#cast-progress').addEventListener('click', (e) => {
  const dur = castVideo.duration;
  if (!Number.isFinite(dur) || !dur) return;
  const r = e.currentTarget.getBoundingClientRect();
  castVideo.currentTime = ((e.clientX - r.left) / r.width) * dur;
  updateCastProgress();
});
castVideo.addEventListener('play', renderCast);
castVideo.addEventListener('pause', renderCast);
castVideo.addEventListener('ended', () => {
  if (state.casting) toast('O vídeo terminou. Aperte ▶ para ver de novo ou ⏹ para parar de transmitir.', 'info', 6000);
});

// ------------------------------------------------------------------ mídia recebida
function handleTrack(peerId, stream) {
  const u = state.users.get(peerId);
  if (!u) return;
  if (!u.streams.has(stream.id)) {
    u.streams.set(stream.id, stream);
    stream.addEventListener('removetrack', () => routeStreams(u));
  }
  routeStreams(u);
}

// decide qual stream é voz e qual é tela
function routeStreams(u) {
  let screen = null;
  let mic = null;
  for (const s of u.streams.values()) {
    if (!s.getTracks().some((t) => t.readyState === 'live')) continue;
    if (u.screenStreamId && s.id === u.screenStreamId) screen = s;
    else if (!s.getVideoTracks().length && !mic) mic = s;
  }
  if (mic) {
    if (!u.audioEl) {
      u.audioEl = document.createElement('audio');
      u.audioEl.autoplay = true;
      sink.appendChild(u.audioEl);
    }
    if (u.audioEl.srcObject !== mic) {
      u.audioEl.srcObject = mic;
      u.audioEl.play().catch(() => {});
    }
  }
  if (screen) {
    if (!u.screenVideo) u.screenVideo = makeVideo(true);
    if (u.screenVideo.srcObject !== screen) {
      u.screenVideo.srcObject = screen;
      tocarTela(u.screenVideo);
    }
  } else if (u.screenVideo && u.screenVideo.srcObject) {
    u.screenVideo.srcObject = null;
  }
  updateVolumes();
  refreshScreens();
}

function shareVideoOf(u) {
  if (!u || u.slot == null) return null;
  if (u.isSelf) return state.sharing ? localScreenVideo : null;
  return u.screenVideo?.srcObject ? u.screenVideo : null;
}

function refreshScreens() {
  const users = [...state.users.values()];
  world.slots.forEach((slot, i) => {
    const owner = users.find((u) => u.slot === i);
    slot.owner = owner?.id ?? null;
    if (!owner) {
      slot.clearVideo();
      slot.setPlaceholder(`Tela ${i + 1}`, 'Livre — clique em “Compartilhar tela”');
      slot.setLabel(null);
      return;
    }
    slot.setLabel(`${owner.isSelf ? 'Você' : owner.name} · Tela ${i + 1}`, owner.color);
    const v = shareVideoOf(owner);
    if (v) slot.setVideo(v);
    else {
      slot.clearVideo();
      slot.setPlaceholder(owner.name, 'Conectando à tela…');
    }
  });

  // o telão do cinema e o da pista mostram sempre a mesma coisa
  const pinned = state.main !== 'media' ? state.users.get(state.main) : null;
  for (const ms of world.telaoes) {
    ms.owner = null;
    ms.setLabel(null);
    if (pinned) {
      ms.owner = pinned.id;
      ms.setLabel(pinned.isSelf ? 'Você' : pinned.name, pinned.color);
      const v = shareVideoOf(pinned);
      if (v) ms.setMode('share', v);
      else {
        ms.setMode('empty');
        ms.setPlaceholder(pinned.name, 'Conectando à tela…');
      }
    } else if (tv?.state.id) {
      // o cartaz só aparece no telão que não está com o player (o mais longe de você)
      ms.setPlaceholder(tv.title || tv.label, 'Tocando no outro telão — chegue mais perto');
      ms.setMode('media');
    } else {
      ms.setMode('empty');
      ms.setPlaceholder('Telão', 'Cole um link (YouTube, Twitch, Kick…) ou fixe a tela de alguém aqui');
    }
  }
  const ms = world.mainScreen;
  tv?.setHidden(ms.mode !== 'media');

  if (state.focus?.kind === 'tv' && ms.mode !== 'media') exitFocus();
  if (state.focus?.kind === 'share' && !shareVideoOf(state.users.get(state.focus.userId))) exitFocus();
  renderMainSources();
}

function updateVolumes() {
  const me = self();
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    if (u.audioEl) {
      let v = settings.voice / 100;
      if (settings.spatial && me) {
        const d = u.avatar.group.position.distanceTo(localAvatar.group.position);
        v *= THREE.MathUtils.clamp(1 - (d - 6) / 34, 0.1, 1);
      }
      u.audioEl.volume = THREE.MathUtils.clamp(v, 0, 1);
    }
    if (u.screenVideo) u.screenVideo.volume = settings.screen / 100;
  }
}

// ------------------------------------------------------------------ telão
function onTvChange(s) {
  refreshScreens();
  renderTv();
  if (s.action === 'load' && s.by && s.by !== settings.name) {
    const meta = PROVIDERS[s.provider];
    toast(`${s.by} colocou ${meta?.live ? 'uma live' : 'um vídeo'} no telão · ${meta?.label ?? 'Vídeo'}`, 'info', 4000, meta?.color);
  }
  if (s.action) s.action = null;
}

function renderTv() {
  if (!tv) return;
  const s = tv.state;
  const on = !!s.id;
  $('#tv-now').hidden = !on;
  if (on) {
    const meta = PROVIDERS[s.provider];
    $('#tv-now').style.setProperty('--fill', meta.color);
    const badge = $('#tv-badge');
    badge.textContent = meta.label;
    badge.style.setProperty('--c', meta.color);
    // o navegador é um só para todos: nem "ao vivo" nem "pausar vale só para você" se aplicam
    const browser = s.provider === 'browser';
    $('#tv-live').hidden = !tv.live || browser;
    // ao vivo não tem linha do tempo; sem API não tem nem play/pause compartilhado
    $('#tv-timeline').hidden = !tv.canSeek;
    for (const id of ['#tv-back', '#tv-fwd', '#tv-sync']) $(id).hidden = !tv.canSeek;
    $('#tv-play').hidden = !tv.controllable;
    $('#tv-noapi').hidden = tv.controllable || browser;
  }
  $('#tv-title').textContent = tv.title || (on ? 'Carregando vídeo…' : '—');
  $('#tv-by').textContent = s.by ? `Última ação por ${s.by}` : '';
  $('#tv-play').innerHTML = icon(s.playing ? 'pause' : 'play', 22);
  $('#tv-volume').value = settings.tv;
  const browserOn = s.provider === 'browser';
  $('#browser-open').innerHTML = icon('globe', 18) + (browserOn ? 'Navegador no telão' : 'Pôr o navegador no telão');
  $('#browser-open').classList.toggle('on', browserOn);
}

function showTvError(msg) {
  const el = $('#tv-error');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showTvError.timer);
  showTvError.timer = setTimeout(() => { el.hidden = true; }, 9000);
}

function renderMainSources() {
  const sharers = [...state.users.values()].filter((u) => u.slot != null);
  const playing = !!tv?.state.id;
  const color = playing ? PROVIDERS[tv.state.provider]?.color : 'var(--muted)';
  const sub = playing ? (tv.title || 'Carregando…') : 'Nada tocando';
  $('#main-sources').innerHTML = [
    `<button type="button" class="source${state.main === 'media' ? ' on' : ''}" data-src="media"><span class="sdot" style="--c:${color}"></span>${playing ? esc(tv.label) : 'Player'}<small>${esc(sub.slice(0, 26))}</small></button>`,
    ...sharers.map((u) => `<button type="button" class="source${state.main === u.id ? ' on' : ''}" data-src="${esc(u.id)}"><span class="sdot" style="--c:${esc(u.color)}"></span>${u.isSelf && state.casting ? 'Seu vídeo' : `Tela de ${esc(u.isSelf ? 'você' : u.name)}`}<small>Tela ${u.slot + 1}</small></button>`),
  ].join('');
}

$('#main-sources').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (b && b.dataset.src !== state.main) socket.emit('main', b.dataset.src);
});

$('#tv-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#tv-url');
  const r = tv.load(input.value);
  if (r.error) {
    showTvError(r.error);
    return;
  }
  input.value = '';
  input.blur();
  $('#tv-error').hidden = true;
  tv.unblock();
});
// Atalhos: o ícone vem do próprio site; se não carregar, fica a inicial do nome.
function renderBrowserSites(sites) {
  const box = $('#browser-sites');
  box.innerHTML = sites.map((s) => `<button type="button" class="site-btn" data-site="${esc(s.id)}" title="Abrir ${esc(s.label)} no navegador do telão">`
    + `<img src="https://${esc(s.host)}/favicon.ico" alt="" referrerpolicy="no-referrer" loading="lazy">${esc(s.label)}</button>`).join('');
  for (const img of box.querySelectorAll('img')) {
    img.addEventListener('error', () => {
      const letra = document.createElement('span');
      letra.className = 'site-letter';
      letra.textContent = img.parentElement.textContent.trim()[0] || '?';
      img.replaceWith(letra);
    }, { once: true });
  }
}

$('#browser-sites').addEventListener('click', (e) => {
  const b = e.target.closest('[data-site]');
  if (!b || b.disabled) return;
  // o atalho abre o site no navegador compartilhado; se o telão está com outra coisa, troca
  if (tv.state.provider !== 'browser') tv.send('load', { provider: 'browser', id: 'shared' });
  else if (state.main !== 'media') socket.emit('main', 'media');
  b.disabled = true;
  socket.emit('browser-open', b.dataset.site, (res) => {
    b.disabled = false;
    if (!res?.ok) toast(res?.error || 'Não consegui abrir esse site.', 'warn');
  });
});

$('#browser-open').addEventListener('click', () => {
  if (tv.state.provider === 'browser') {
    if (state.main !== 'media') socket.emit('main', 'media');
    toast('O navegador já está no telão: olhe para ele e aperte E para usar.');
    return;
  }
  tv.send('load', { provider: 'browser', id: 'shared' });
});
$('#tv-play').addEventListener('click', () => tv.togglePlay());
$('#tv-back').addEventListener('click', () => tv.seekBy(-10));
$('#tv-fwd').addEventListener('click', () => tv.seekBy(10));
$('#tv-stop').addEventListener('click', () => tv.stop());
$('#tv-sync').addEventListener('click', () => {
  if (!tv.canSeek) return;
  tv.send('seek', { time: tv.currentTime() });
  toast('Todo mundo sincronizado com o seu tempo.');
});
$('#tv-progress').addEventListener('click', (e) => {
  const dur = tv.duration();
  if (!dur || !tv.canSeek) return;
  const r = e.currentTarget.getBoundingClientRect();
  tv.send('seek', { time: ((e.clientX - r.left) / r.width) * dur });
});
$('#tv-volume').addEventListener('input', (e) => {
  settings.tv = Number(e.target.value);
  tv?.setVolume(settings.tv);
  castVideo.volume = settings.tv / 100;
  saveSettings();
});
$('#tv-unblock-btn').addEventListener('click', () => {
  tv?.unblock();
  liberarSomDasTelas();
});
// qualquer clique real na página já serve para liberar o som do telão
document.addEventListener('pointerdown', () => { if (tv?.blocked) tv.unblock(); }, true);

function mmss(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ------------------------------------------------------------------ chat
function hhmm(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addChat(msg, notify) {
  const list = $('#chat-list');
  list.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.innerHTML = `<div class="meta"><b style="--c:${esc(msg.color)}">${esc(msg.name)}</b><time>${hhmm(msg.t)}</time></div><div class="text"></div>`;
  li.querySelector('.text').textContent = msg.text;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
  state.users.get(msg.id)?.avatar.say(msg.text);
  if (notify && state.panel !== 'chat') {
    state.unread++;
    $('#chat-dot').hidden = false;
    toast(`${msg.name}: ${msg.text}`, 'info', 5000, msg.color);
    sfx.message();
  }
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (text) socket.emit('chat', text);
  input.value = '';
  input.blur();
});

// ------------------------------------------------------------------ parkour
const run = new ParkourRun({
  onReady: () => {
    world.resetCheckpoints();
    showParkourHud('ready', 'Pule para fora da largada para começar!');
    setPkTime(0);
    setPkCps(0);
  },
  onStart: () => showParkourHud('running', ''),
  onCancel: () => hideParkourHud(),
  onAbandon: () => {
    hideParkourHud();
    world.resetCheckpoints();
    toast('Você saiu do parkour. Pise na LARGADA para correr de novo.', 'info', 3800);
  },
  onCheckpoint: (d) => {
    sfx.checkpoint();
    world.markCheckpoint(d.id);
    setPkCps(run.reached.size);
    flashPk(`${d.label}! (R volta aqui)`);
  },
  onFinish: (t) => {
    sfx.finish();
    socket.emit('parkour-finish', t);
    setPkTime(t);
    showParkourHud('done', 'Chegou! Aproveite a vista do camarote 😎');
    localAvatar.emote('party');
    socket.emit('emote', 'party');
    clearTimeout(pkHideTimer);
    pkHideTimer = setTimeout(() => { if (run.state === 'idle') hideParkourHud(); world.resetCheckpoints(); }, 7000);
  },
  onFall: (cp) => {
    if (!cp || cp.data.type === 'start') {
      run.cancel();
      sfx.fall();
      flashPk('Caiu! Volte à largada para tentar de novo');
      setTimeout(() => { if (run.state === 'idle') hideParkourHud(); }, 2500);
      return;
    }
    sfx.fall();
    teleportToCollider(cp);
    flashPk('Caiu! De volta ao checkpoint');
  },
});
let pkHideTimer = null;
let pkMsgTimer = null;

function showParkourHud(mode, msg) {
  clearTimeout(pkHideTimer);
  const hud = $('#parkour-hud');
  hud.hidden = false;
  hud.classList.toggle('ready', mode === 'ready');
  hud.classList.toggle('done', mode === 'done');
  $('#pk-msg').textContent = msg;
}
function hideParkourHud() { $('#parkour-hud').hidden = true; }
function setPkTime(t) { $('#pk-time').textContent = formatTime(t); }
$('#pk-cps').innerHTML = '<i></i>'.repeat(CHECKPOINT_COUNT);
function setPkCps(n) { $$('#pk-cps i').forEach((el, i) => el.classList.toggle('on', i < n)); }
function flashPk(msg) {
  $('#pk-msg').textContent = msg;
  clearTimeout(pkMsgTimer);
  pkMsgTimer = setTimeout(() => { if (run.state === 'running') $('#pk-msg').textContent = ''; }, 2600);
}

function teleportToCollider(c, yaw = null) {
  player.teleport([(c.min.x + c.max.x) / 2, c.max.y, (c.min.z + c.max.z) / 2], yaw);
}

function goToStart() {
  const start = world.colliders.find((c) => c.data.type === 'start');
  teleportToCollider(start, Math.PI);
}

// ------------------------------------------------------------------ sentar
const TIPOS_ASSENTO = new Set(['sofa', 'puff']);
function assentoAtual() {
  if (!player.grounded) return null;
  return TIPOS_ASSENTO.has(player.ground?.data?.type) ? player.ground : null;
}

function toggleSit() {
  if (player.sitting) {
    player.stand();
    return;
  }
  const assento = assentoAtual();
  if (assento) player.sit(assento);
  else toast('Fique em cima de um sofá ou pufe para sentar.', 'info', 2600);
}

function updateSitHint() {
  const podeSentar = !player.sitting && !!assentoAtual() && !state.focus && !state.panel;
  const dica = $('#sit-hint');
  const mostrar = podeSentar || player.sitting;
  if (dica.hidden === !mostrar) { /* já está certo */ } else dica.hidden = !mostrar;
  if (mostrar) dica.querySelector('span').textContent = player.sitting ? 'Levantar' : 'Sentar';
  if (touchPad) {
    const b = $('#tb-sit');
    if (b) b.hidden = !mostrar || !!state.panel || !!state.focus;
  }
}

player.on('veiculo', (on) => {
  localAvatar.setVeiculo(on);
  if (!on) $('#race-hud').hidden = true;
});

player.on('sit', (sentado) => {
  updateSitHint();
  if (sentado) sfx.message();
});

function respawn() {
  if (run.state !== 'idle' && run.checkpoint && run.checkpoint.data.type !== 'start') {
    teleportToCollider(run.checkpoint);
    flashPk('De volta ao checkpoint');
  } else {
    goToStart();
  }
}

function setLeaderboard(board) {
  const ol = $('#leaderboard');
  const mine = $('#pk-mine');
  if (!board?.length) {
    ol.innerHTML = '<li class="empty">Ninguém completou ainda. Seja o primeiro!</li>';
    mine.hidden = true;
    return;
  }
  ol.innerHTML = board.map((e) => {
    const eu = e.name === settings.name ? ' class="me"' : '';
    return `<li${eu}><span class="who"><i style="--c:${esc(e.color)}"></i>${esc(e.name)}</span><time>${formatTime(e.time)}</time></li>`;
  }).join('');
  const pos = board.findIndex((e) => e.name === settings.name);
  if (pos >= 0) {
    mine.hidden = false;
    mine.textContent = `Seu melhor: ${formatTime(board[pos].time)} — ${pos + 1}º de ${board.length}.`;
  } else {
    mine.hidden = false;
    mine.textContent = `Você ainda não completou o percurso (${CHECKPOINT_COUNT} checkpoints).`;
  }
}

function setFightBoard(board) {
  const ol = $('#fight-board');
  if (!board?.length) {
    ol.innerHTML = '<li class="empty">Ninguém se pegou ainda.</li>';
    return;
  }
  ol.innerHTML = board.map((e) => {
    const eu = e.name === settings.name ? ' class="me"' : '';
    return `<li${eu}><span class="who"><i style="--c:${esc(e.color)}"></i>${esc(e.name)}</span>`
      + `<span><span class="kos">${e.kos}</span><span class="levou">levou ${e.levou}</span></span></li>`;
  }).join('');
}

// ------------------------------------------------------------------ pista de corrida
$('#rh-setores').innerHTML = '<i></i>'.repeat(PISTA.setores);

// o painel da volta aparece de carro na pista, e continua aparecendo se sair dela com a
// volta valendo (o relógio não para fora da pista)
function atualizarHudCorrida() {
  $('#race-hud').hidden = !(player.veiculo && (corrida.naPista || corrida.ativa));
}

const corrida = new Corrida({
  onPista: (dentro) => {
    atualizarHudCorrida();
    if (!dentro && corrida.ativa && player.veiculo) flashRace('Fora da pista — o tempo continua correndo');
  },
  onLargada: () => {
    $('#race-hud').classList.remove('invalida');
    flashRace('Valendo!');
    sfx.checkpoint();
  },
  onSetor: (n) => setRaceSetores(n),
  onInvalida: () => {
    $('#race-hud').classList.add('invalida');
    flashRace('Cortou caminho: esta volta não vai valer');
  },
  onCortou: () => {
    $('#race-hud').classList.remove('invalida');
    setRaceSetores(0);
    flashRace('Volta não contou: cortou caminho');
  },
  onCancelar: () => {
    $('#race-hud').classList.remove('invalida');
    setRaceSetores(0);
    $('#rh-msg').textContent = '';
    atualizarHudCorrida();
  },
  onVolta: (tempo, n, recorde) => {
    $('#race-hud').classList.remove('invalida');
    setRaceSetores(0);
    sfx.finish();
    socket?.emit('volta', tempo);
    flashRace(recorde ? `Volta ${n}: ${formatarVolta(tempo)} — seu recorde!` : `Volta ${n}: ${formatarVolta(tempo)}`);
    $('#rh-melhor').textContent = corrida.melhor != null ? 'Melhor ' + formatarVolta(corrida.melhor) : '—';
  },
});

let raceMsgTimer = null;
function flashRace(msg) {
  $('#rh-msg').textContent = msg;
  clearTimeout(raceMsgTimer);
  raceMsgTimer = setTimeout(() => { $('#rh-msg').textContent = ''; }, 3200);
}
function setRaceSetores(n) {
  $$('#rh-setores i').forEach((el, i) => el.classList.toggle('on', i < n));
}

function setRaceBoard(board) {
  const ol = $('#race-board');
  const minha = $('#race-mine');
  if (!board?.length) {
    ol.innerHTML = '<li class="empty">Ninguém completou uma volta ainda.</li>';
    minha.hidden = true;
    return;
  }
  ol.innerHTML = board.map((e) => {
    const eu = e.name === settings.name ? ' class="me"' : '';
    return `<li${eu}><span class="who"><i style="--c:${esc(e.color)}"></i>${esc(e.name)}</span><time>${formatarVolta(e.time)}</time></li>`;
  }).join('');
  const pos = board.findIndex((e) => e.name === settings.name);
  minha.hidden = false;
  minha.textContent = pos >= 0
    ? `Sua melhor volta: ${formatarVolta(board[pos].time)} — ${pos + 1}º de ${board.length}.`
    : 'Você ainda não completou uma volta.';
}

function toggleVeiculo() {
  const virou = player.setVeiculo(!player.veiculo);
  if (!virou) return;
  sfx.teleport();
  if (player.veiculo) toast('Modo carro: W acelera, S freia, A/D viram. Shift é turbo.', 'info', 4200);
  atualizarHudCorrida();
  if (touchPad) touchPad.showCarro?.(player.veiculo);
}

function irParaLargada() {
  const l = largada(Math.floor(Math.random() * 3));
  if (!player.veiculo) toggleVeiculo();
  player.teleport(l.pos, l.yaw);
  corrida.reset();
}
$('#race-go').addEventListener('click', () => { irParaLargada(); closePanel(); });

// ------------------------------------------------------------------ ringue de luta
const combat = new Combat({
  player,
  socket: null, // preenchido em join(), quando o socket existe
  getOthers: () => [...state.users.values()]
    .filter((u) => !u.isSelf && u.avatar)
    .map((u) => ({ id: u.id, position: u.avatar.group.position })),
  onState: (health, inRing) => updateFightHud(health, inRing),
  onHitLanded: () => sfx.punchHit(),
  onDamage: () => {
    sfx.punchTaken();
    player.addShake(0.9); // o golpe tem que pesar na tela de quem apanha
  },
  onKo: (porQuem) => {
    player.addShake(1.6); // nocaute sacode muito mais
    toast(porQuem ? `${porQuem} te nocauteou!` : 'Você caiu do ringue!', 'error', 3600);
    updateFightHud(0, combat.inRing);
  },
});

function updateFightHud(health, inRing) {
  const hud = $('#fight-hud');
  hud.hidden = !inRing;
  if (!inRing) {
    $('#tb-punch').hidden = true;
    return;
  }
  const v = Math.max(0, Math.min(1, health / COMBAT.maxHealth));
  $('#fh-fill').style.width = `${v * 100}%`;
  hud.classList.toggle('hurt', v <= 0.55 && v > 0.28);
  hud.classList.toggle('danger', v <= 0.28);
  hud.classList.toggle('ko', combat.knockedOut);
  $('#fh-hint').innerHTML = combat.knockedOut
    ? 'Nocauteado…'
    : (isTouch ? 'Toque na luva para socar' : 'Clique ou <kbd>F</kbd> para socar');
  if (isTouch) $('#tb-punch').hidden = !!state.panel || !!state.focus;
  localAvatar.setHealth(v);
  socket?.emit('health', v);
}

function punch() {
  if (combat.punch()) {
    localAvatar.punch();
    sfx.punchSwing(); // o som de acerto vem depois, pelo onHitLanded
  }
}

function goToRing() {
  const c = ringCorners()[0];
  run.abandon();
  player.teleport(c, Math.atan2(RING.x - c[0], RING.z - c[2]) + Math.PI);
}
$('#ring-go').addEventListener('click', () => { goToRing(); closePanel(); });
$('#pk-quit').addEventListener('click', () => run.abandon());

player.on('jump', () => sfx.jump());
player.on('pad', () => sfx.pad());
player.on('teleport', (target) => {
  sfx.teleport();
  run.cancel();
  hideParkourHud();
  world.resetCheckpoints();
  player.teleport(target, 0);
});
player.on('void', () => respawn());
$('#pk-go').addEventListener('click', () => {
  goToStart();
  closePanel();
});

// ------------------------------------------------------------------ foco nas telas
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

function screenInfo(screen) {
  if (!screen) return null;
  if (world.telaoes.includes(screen)) {
    if (screen.mode === 'media') {
      return { kind: 'tv', screen, label: tv?.state.provider === 'browser' ? 'Usar o navegador' : `Focar no telão (${tv?.label ?? 'vídeo'})` };
    }
    if (screen.mode === 'share' && screen.owner) {
      const u = state.users.get(screen.owner);
      return { kind: 'share', userId: screen.owner, label: `Ver a tela de ${u?.isSelf ? 'você' : u?.name}` };
    }
    return null;
  }
  const u = screen.owner && state.users.get(screen.owner);
  if (u && shareVideoOf(u)) return { kind: 'share', userId: u.id, label: u.isSelf ? 'Ver sua tela' : `Ver a tela de ${u.name}` };
  return null;
}

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

// escolhe a tela que está na mira (ou a mais próxima da direção do olhar)
function pickScreen() {
  const cam = world.camera;
  raycaster.setFromCamera(screenCenter, cam);
  raycaster.far = 140;
  const hit = raycaster.intersectObjects(world.screens.map((s) => s.surface), false)[0];
  if (hit && screenInfo(hit.object.userData.screen)) return hit.object.userData.screen;
  cam.getWorldDirection(_fwd);
  let best = null;
  let bestScore = 1.25;
  for (const s of world.screens) {
    if (!screenInfo(s)) continue;
    s.surface.getWorldPosition(_to).sub(cam.position);
    const dist = _to.length();
    if (dist > 140) continue;
    const angle = _fwd.angleTo(_to);
    const radius = Math.atan(Math.max(s.w, s.h) / 2 / dist);
    const score = angle / (radius + 0.08);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function updateHover() {
  const info = state.focus ? null : screenInfo(pickScreen());
  const changed = (info?.label ?? null) !== (state.hovered?.label ?? null);
  state.hovered = info;
  if (changed) {
    const hint = $('#hover-hint');
    hint.hidden = !info;
    if (info) hint.querySelector('span').textContent = info.label;
    $('#crosshair').classList.toggle('on', !!info);
    touchPad?.setUseTarget(info?.label || null);
  }
}

function enterFocus(info) {
  if (!info) return;
  exitFocus();
  if (document.pointerLockElement) document.exitPointerLock();
  if (info.kind === 'tv') {
    state.focus = { kind: 'tv' };
    // o telão em foco fica com o player, mesmo que o outro esteja mais perto
    const alvo = info.screen || world.mainScreen;
    world.travarTelao(alvo);
    player.override = alvo.focusPose(world.camera, 1.02);
    document.body.classList.add('tv-focus');
    tv.interactive = true;
    // no navegador o teclado fica com ele (para digitar), então o Esc não chega aqui
    $('#tv-focus-text').textContent = tv.state.provider === 'browser'
      ? 'Clique no navegador para pegar o controle. Para voltar a andar, use o botão ao lado.'
      : 'Clique no vídeo para usar os controles do player';
    $('#tv-focus-hud').hidden = false;
    $('#crosshair').hidden = true;
    $('#hover-hint').hidden = true;
    return;
  }
  const u = state.users.get(info.userId);
  const v = shareVideoOf(u);
  if (!v) return;
  state.focus = { kind: 'share', userId: u.id };
  const fv = $('#focus-video');
  fv.srcObject = v.srcObject;
  fv.play().catch(() => {});
  $('#focus-name').textContent = u.isSelf ? 'Sua tela' : `Tela de ${u.name}`;
  updateFocusPin();
  $('#focus').hidden = false;
  syncTouchVisibility();
}

function updateFocusPin() {
  if (state.focus?.kind !== 'share') return;
  const pinned = state.main === state.focus.userId;
  $('#focus-pin').innerHTML = `${icon('pin', 16)}${pinned ? 'Tirar do telão' : 'Pôr no telão'}`;
}

function exitFocus() {
  if (!state.focus) return;
  if (state.focus.kind === 'tv') {
    player.override = null;
    world.travarTelao(null);
    document.body.classList.remove('tv-focus');
    tv.interactive = false;
    // o iframe do navegador segura o teclado: devolve para o jogo
    if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
    $('#tv-focus-hud').hidden = true;
    $('#crosshair').hidden = false;
  } else {
    $('#focus').hidden = true;
    $('#focus-video').srcObject = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  state.focus = null;
  syncTouchVisibility();
}

$('#focus-close').addEventListener('click', exitFocus);
$('#tv-focus-exit').addEventListener('click', exitFocus);
$('#focus-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#focus').requestFullscreen().catch(() => {});
});
$('#focus-pin').addEventListener('click', () => {
  if (state.focus?.kind === 'share') togglePin(state.focus.userId);
  setTimeout(updateFocusPin, 150);
});

// ------------------------------------------------------------------ painéis e barra
function openPanel(name) {
  if (state.panel === name) return closePanel();
  state.panel = name;
  $('#panel').hidden = false;
  $$('#panel section').forEach((s) => s.classList.toggle('active', s.dataset.section === name));
  $('#panel-title').textContent = PANEL_TITLES[name];
  $$('[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
  if (name === 'chat') {
    state.unread = 0;
    $('#chat-dot').hidden = true;
    const list = $('#chat-list');
    list.scrollTop = list.scrollHeight;
  }
  if (name === 'telao') {
    renderTv();
    renderCast();
  }
  if (name === 'people') renderPeople();
  if (name === 'settings') populateDevices();
  syncTouchVisibility();
}

function closePanel() {
  state.panel = null;
  $('#panel').hidden = true;
  $$('[data-panel]').forEach((b) => b.classList.remove('on'));
  syncTouchVisibility();
}

// o analógico e os botões só aparecem quando dá pra andar de verdade
function syncTouchVisibility() {
  if (!touchPad) return;
  const livre = state.joined && !state.panel && state.focus?.kind !== 'share';
  touchPad.show(livre);
  if (!livre) touchPad.reset();
}

function updateFullscreenButton() {
  const b = $('#tb-full');
  if (b) b.classList.toggle('on', isFullscreen());
}
document.addEventListener('fullscreenchange', updateFullscreenButton);

const helpBox = $('#controls-help');
const helpBtn = $('#help-toggle');
function applyHelpCollapsed() {
  helpBox.classList.toggle('collapsed', !!settings.helpCollapsed);
  helpBtn.setAttribute('aria-expanded', String(!settings.helpCollapsed));
}
applyHelpCollapsed();
helpBtn.addEventListener('click', () => {
  settings.helpCollapsed = !settings.helpCollapsed;
  saveSettings();
  applyHelpCollapsed();
});

$$('[data-panel]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.panel)));
$('#panel-close').addEventListener('click', closePanel);
$('#btn-mic').addEventListener('click', toggleMic);
$('#btn-share').addEventListener('click', toggleShare);
$('#btn-view').addEventListener('click', toggleView);
$('#btn-react').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#react-pop').hidden = !$('#react-pop').hidden;
});
$('#react-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emote]');
  if (b) sendEmote(b.dataset.emote);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.pop-wrap')) $('#react-pop').hidden = true;
});
$('#btn-leave').addEventListener('click', () => {
  stopShare(true);
  socket?.disconnect();
  rtc?.closeAll();
  window.location.href = `${window.location.pathname}?sala=${encodeURIComponent(state.room || '')}`;
});

function inviteUrl() {
  return `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(state.room || 'principal')}`;
}

async function copyInvite() {
  const url = inviteUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (local) toast('Link copiado — mas é "localhost": só funciona no seu PC. Rode "npm run tunnel" e entre pelo link https://…trycloudflare.com para chamar amigos.', 'warn', 9000);
  else toast('Link de convite copiado! Mande para seus amigos.');
}
$('#copy-invite').addEventListener('click', copyInvite);
$('#copy-invite-2').addEventListener('click', copyInvite);

function toggleView() {
  const mode = player.toggleMode();
  $('#btn-view').classList.toggle('on', mode === 'first');
}

function sendEmote(kind) {
  localAvatar.emote(kind);
  socket.emit('emote', kind);
  $('#react-pop').hidden = true;
}

// ------------------------------------------------------------------ ajustes
const bindRange = (sel, key, apply) => {
  const el = $(sel);
  el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    apply?.(settings[key]);
    saveSettings();
  });
};
bindRange('#set-voice', 'voice', updateVolumes);
bindRange('#set-screen', 'screen', updateVolumes);
bindRange('#set-sens', 'sens', (v) => { player.sensitivity = v / 100; });

const bindToggle = (sel, key, apply) => {
  const el = $(sel);
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    apply?.(el.checked);
    saveSettings();
  });
};
bindToggle('#set-spatial', 'spatial', updateVolumes);
bindToggle('#set-shadows', 'shadows', (on) => world.setShadows(on));
bindToggle('#set-sfx', 'sfx', (on) => setSfxEnabled(on));

function renderShareMode() {
  $$('#set-share-mode button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.shareMode));
  const preset = SHARE_PRESETS[settings.shareMode] || SHARE_PRESETS.detail;
  const dicas = {
    detail: 'Para código, planilhas, slides: imagem parada e nítida.',
    motion: 'Para filme e vídeo: 30 quadros por segundo em 1080p.',
    game: 'Para jogo pesado: Full HD a 60 quadros por segundo. Se a internet apertar, ele derruba '
      + 'a resolução em vez dos quadros — é o que evita engasgo quando a placa de vídeo já está ocupada.',
  };
  $('#share-mode-hint').textContent = dicas[settings.shareMode] || 'Vale para o próximo compartilhamento.';
}
renderShareMode();
$('#set-share-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  settings.shareMode = b.dataset.value;
  if (rtc) {
    rtc.shareMode = settings.shareMode;
    // se já está compartilhando, reaplica sem precisar recomeçar
    if (state.sharing) {
      rtc.retuneAll();
      toast('Qualidade ajustada. A resolução só muda no próximo compartilhamento.', 'info', 5000);
    }
  }
  renderShareMode();
  saveSettings();
});

$('#set-mic-device').addEventListener('change', async (e) => {
  settings.micDevice = e.target.value;
  saveSettings();
  if (!rtc) return;
  try {
    await rtc.startMic(settings.micDevice || null);
    state.micAvailable = true;
    rtc.setMicEnabled(state.micOn);
    setupAnalyser();
    toast('Microfone trocado.');
  } catch (err) {
    toast(`Não foi possível usar esse microfone: ${err.message}`, 'error');
  }
});

// ------------------------------------------------------------------ teclado e mouse
window.addEventListener('keydown', (e) => {
  if (!state.joined) return;
  if (e.code === 'Escape') {
    if (typing()) document.activeElement.blur();
    else if (state.focus) exitFocus();
    else if (!$('#react-pop').hidden) $('#react-pop').hidden = true;
    else if (state.panel) closePanel();
    else run.abandon(); // preso no parkour? Esc sai da corrida
    return;
  }
  if (typing() || e.repeat) return;
  switch (e.code) {
    case 'KeyE':
      if (state.focus) exitFocus();
      else if (state.hovered) enterFocus(state.hovered);
      break;
    case 'KeyR':
      if (!state.focus) respawn();
      break;
    case 'KeyV':
      toggleView();
      break;
    case 'KeyF':
      punch();
      break;
    case 'KeyC':
      toggleSit();
      break;
    case 'KeyG':
      toggleVeiculo();
      break;
    case 'KeyM':
      toggleMic();
      break;
    case 'KeyT':
    case 'Enter':
      e.preventDefault();
      if (state.panel !== 'chat') openPanel('chat');
      if (document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => $('#chat-input').focus(), 30);
      break;
    default: {
      const n = Number(e.key);
      if (n >= 1 && n <= EMOTE_KEYS.length) sendEmote(EMOTE_KEYS[n - 1]);
    }
  }
});

// clique no 3D trava o mouse para olhar em volta; com o mouse travado, clicar numa tela foca nela
player.on('click', () => {
  if (!state.joined) return;
  if (isTouch) {
    // no celular o toque curto já ativa o que estiver na mira (tela, telão)
    if (state.focus) return;
    if (state.hovered) enterFocus(state.hovered);
    else if (combat.inRing) punch();
    return;
  }
  if (!state.focus) lockPointer();
});

function lockPointer() {
  try {
    const p = world.canvas.requestPointerLock?.();
    p?.catch?.(() => {});
  } catch { /* ignorado */ }
}

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== world.canvas || e.button !== 0) return;
  // dentro do ringue o botão esquerdo é o soco; fora dele continua focando telas
  if (combat.inRing && !state.focus) punch();
  else if (state.hovered) enterFocus(state.hovered);
});

// Ponto de inspeção para testes automatizados. Só existe com ?debug=1 na URL —
// em uso normal nada disso fica exposto.
if (params.get('debug') === '1') {
  window.__sala3d = {
    state, player, combat, run, corrida, world, settings, punch, goToRing, respawn,
    toggleVeiculo, irParaLargada,
    tocarTela, telasMudas, liberarSomDasTelas, makeVideo,
  };
}

// ------------------------------------------------------------------ loop principal
let lastFrame = performance.now();
let elapsed = 0;
const camRight = new THREE.Vector3();
let netTimer = 0;
let slowTimer = 0;
let lastSent = '';
let lastSentAt = 0;
let speakHold = 0;

function lobbyCamera(t) {
  const a = Math.sin(t * 0.12) * 0.45 + 0.3;
  const A = localAvatar.group.position;
  const R = 6.4;
  const cam = world.camera;
  cam.position.set(A.x + Math.sin(a) * R, A.y + 2.4, A.z + Math.cos(a) * R);
  camRight.set(Math.cos(a), 0, -Math.sin(a));
  const shift = window.innerWidth > 860 ? 2.7 : 0;
  cam.lookAt(A.x - camRight.x * shift, A.y + 1.3, A.z - camRight.z * shift);
  localAvatar.inner.rotation.y = a - 0.25;
}

function detectSpeaking(dt) {
  let level = 0;
  if (analyser && state.micOn && state.micAvailable) {
    analyser.getFloatTimeDomainData(micBuf);
    let sum = 0;
    for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
    level = Math.sqrt(sum / micBuf.length);
  }
  if (level > 0.02) speakHold = 0.3;
  else speakHold = Math.max(0, speakHold - dt);
  state.speaking = speakHold > 0;
  localAvatar.speaking = state.speaking;
  const me = self();
  if (me) me.speaking = state.speaking;
  const b = $('#btn-mic');
  b.classList.toggle('talking', state.speaking);
  b.style.setProperty('--lvl', (1 + Math.min(level * 6, 0.25)).toFixed(3));
}

function sendState(dt) {
  netTimer += dt;
  if (netTimer < 1 / 15) return;
  netTimer = 0;
  const p = player.pos;
  const msg = {
    p: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100],
    r: Math.round(player.bodyYaw * 1000) / 1000,
    a: player.anim,
    s: state.speaking ? 1 : 0,
  };
  const key = JSON.stringify(msg);
  const now = performance.now();
  if (key === lastSent && now - lastSentAt < 1000) return;
  lastSent = key;
  lastSentAt = now;
  socket.volatile.emit('state', msg);
}

function slowUpdate() {
  updateVolumes();
  for (const li of $$('#people-list .person')) {
    const u = state.users.get(li.dataset.id);
    li.classList.toggle('speaking', !!u?.speaking);
  }
  updateUnblockButton();

  if (state.panel === 'telao' && tv?.state.id) {
    const cur = tv.currentTime();
    const dur = tv.duration();
    $('#tv-cur').textContent = mmss(cur);
    $('#tv-dur').textContent = mmss(dur);
    $('#tv-fill').style.width = dur ? `${Math.min(100, (cur / dur) * 100)}%` : '0%';
    if (tv.title && $('#tv-title').textContent !== tv.title) $('#tv-title').textContent = tv.title;
  }
  if (state.panel === 'telao' && state.casting) updateCastProgress();
}

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  elapsed += dt;
  const t = elapsed;
  world.update(t);

  if (state.joined) {
    player.update(dt);
    run.update(dt, player.grounded ? player.ground : null);
    if (run.state === 'running') setPkTime(run.time);
    combat.update(dt);
    localAvatar.setKo(combat.knockedOut);
    corrida.update(dt, player.pos.x, player.pos.z, player.veiculo);
    if (corrida.ativa) $('#rh-time').textContent = formatarVolta(corrida.tempo);
    detectSpeaking(dt);
    sendState(dt);
    updateHover();
    updateSitHint();
    world.focarSol(player.pos.x, player.pos.z);
    slowTimer += dt;
    if (slowTimer > 0.25) {
      slowTimer = 0;
      slowUpdate();
    }
  } else {
    lobbyCamera(t);
  }

  localAvatar.update(dt, t);
  for (const u of state.users.values()) if (!u.isSelf) u.avatar.update(dt, t);

  world.render();
  requestAnimationFrame(frame);
}

// atalho para depuração no console do navegador
window.sala = { state, world, player, run, settings, get tv() { return tv; }, get rtc() { return rtc; }, get socket() { return socket; } };

function updateClock() {
  const d = new Date();
  $('#clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
updateClock();
setInterval(updateClock, 10000);

document.fonts?.ready.then(() => {
  localAvatar.drawTag();
  refreshScreens();
});
refreshScreens();
requestAnimationFrame(frame);
