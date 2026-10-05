// Sala 3D — junta tudo: lobby, mundo, jogador, voz/tela (WebRTC), telão (YouTube, Twitch…), chat e parkour.
import * as THREE from 'three';
import { World, SPAWN } from './world.js';
import { Avatar } from './avatars.js';
import { PERSONAGENS } from './modelo.js';
import { EscolherPersonagem } from './escolher-personagem.js';
import { SalasLaterais } from './salas.js';
import { Player } from './player.js';
import { RTC, SHARE_PRESETS } from './rtc.js';
import { MediaSync, PROVIDERS, preloadYouTube } from './media.js';
import { ParkourRun, formatTime, CHECKPOINT_COUNT } from './parkour.js';
import { Combat } from './combat.js';
import { RING, COMBAT, ringCorners } from './arena.js';
import { Corrida, PISTA, largada, formatarVolta, projetar, pontoEm } from './pista.js';
import { sfx, audioContext, setSfxEnabled } from './sfx.js';
import { Clima, CLIMAS, HORARIOS } from './clima.js';
import { ARMAS, IDS_ARMAS, ARMA_PADRAO, defArma, VisaoArma, iniciarCapsulas, atualizarCapsulas, preCarregarArma } from './armas.js';
import { Jogos } from './jogos.js';
import { Controle } from './controle.js';
import { Mesa } from './mesa.js';
import { Qualidade, NIVEIS, nivelInicial } from './qualidade.js';
import { GuiaExtensao } from './guia-extensao.js';
import { DEPARTAMENTOS, IDS_DEPARTAMENTOS, rotuloDoPosto } from './escritorio.js';
import { Dados, MESA_DADOS } from './dados.js';
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
const PANEL_TITLES = { people: 'Pessoas', chat: 'Chat da sala', telao: 'Telão', parkour: 'Parkour', ringue: 'Ringue de luta', corrida: 'Pista de corrida', jogos: 'Jogos, dados e moedas', sala: 'Sala da empresa', settings: 'Ajustes' };

// ------------------------------------------------------------------ ajustes salvos
const DEFAULTS = {
  name: '', color: COLORS[0], mic: true, voice: 100, screen: 90, tv: 80, spatial: false,
  shareMode: 'detail', sens: 100, sfx: true, micDevice: '', helpCollapsed: false, photo: null, shirt: 'none', char: 'padrao', arma: ARMA_PADRAO,
  // qualidade gráfica: 'auto' ou um nível fixo; nivelAuto: onde o automático parou da última vez
  qualidade: 'auto', nivelAuto: null, mostrarFps: false,
};
const stored = (() => {
  try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
})();
const settings = { ...DEFAULTS, ...stored };
// o volume do telão se chamava "yt" quando ele só tocava YouTube
if (stored.tv === undefined && stored.yt !== undefined) settings.tv = stored.yt;
delete settings.yt;
// a chave "shadows" (liga/desliga sombra) virou a qualidade gráfica
delete settings.shadows;
// celular: a ajuda começa recolhida (a tela é pequena), mas continua a um toque
if (isTouch && stored.helpCollapsed === undefined) settings.helpCollapsed = true;
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
// O nível de partida decide o antialias, que só dá para escolher ao criar o renderizador.
if (!NIVEIS[settings.qualidade]) settings.qualidade = 'auto';
const nivelDePartida = settings.qualidade !== 'auto' ? settings.qualidade
  : NIVEIS[settings.nivelAuto] ? settings.nivelAuto : nivelInicial();
const world = new World($('#gl'), $('#css3d'), { antialias: NIVEIS[nivelDePartida].antialias, qualidade: NIVEIS[nivelDePartida] });
// sol, lua, chuva e tempestade (clima.js): o dono da sala pode fixar, senão muda sozinho
const clima = new Clima(world);
const qualidade = new Qualidade(world, {
  modo: settings.qualidade,
  nivel: settings.nivelAuto,
  aoMudar: (q) => {
    // guarda onde o automático parou: a próxima visita já começa ali (com o antialias certo)
    if (q.modo === 'auto' && settings.nivelAuto !== q.nivel) {
      settings.nivelAuto = q.nivel;
      saveSettings();
    }
    renderQualidade();
  },
});
const localAvatar = new Avatar({ name: settings.name || 'Você', color: settings.color, isLocal: true });
if (!IDS_ARMAS.includes(settings.arma)) settings.arma = ARMA_PADRAO;
localAvatar.tipoArma = settings.arma;
localAvatar.group.position.set(...SPAWN.pos);
world.scene.add(localAvatar.group);
const player = new Player(world, localAvatar);
localAvatar.aquecer = (obj) => world.aquecerObjeto(obj);
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
  casting: false, // uma das minhas telas é um arquivo de vídeo, não a captura da tela
  castKey: null, // chave dessa tela (só um arquivo por vez)
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
const self = () => state.users.get(state.selfId);

// ------------------------------------------------------------------ telas compartilhadas
// Cada pessoa pode compartilhar várias abas/janelas, cada uma numa tela (u.shares: chave ->
// { key, slot, streamId, video }). A chave vem do servidor ("<id>~<n>") e é o que vai para o
// telão; o streamId liga a chave ao vídeo que chega pelo WebRTC.
function telasNoAr() {
  const out = [];
  for (const user of state.users.values()) for (const share of user.shares.values()) out.push({ share, user });
  return out;
}

function acharTela(key) {
  if (typeof key !== 'string' || key === 'media') return null;
  const user = state.users.get(key.split('~')[0]);
  const share = user?.shares.get(key);
  return share ? { share, user } : null;
}

const shareVideo = (sh) => (sh?.video?.srcObject ? sh.video : null);
const compartilhando = () => (self()?.shares.size ?? 0) > 0;
// slot null: com as 4 telas ocupadas, mais uma vai direto para o telão (só uma assim por sala)
const ondeEsta = (sh) => (sh.slot == null ? 'Telão' : world.rotuloTela(sh.slot));
const ordemDasTelas = (a, b) => (a.slot ?? -1) - (b.slot ?? -1);
const cabeMaisUma = () => {
  const telas = telasNoAr();
  return telas.filter((t) => t.share.slot != null).length < world.slots.length || !telas.some((t) => t.share.slot == null);
};

function soltarVideo(sh) {
  if (!sh.video) return;
  sh.video.srcObject = null;
  sh.video.remove();
  telasMudas.delete(sh.video);
  sh.video = null;
}

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

// ------------------------------------------------------------------ app (PWA)
// O service worker (public/sw.js) guarda o que não muda, para o app abrir rápido. O botão
// "Instalar o app" aparece quando o navegador deixa instalar; no iPhone ele só explica o caminho.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
const instalado = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let pedidoDeInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoDeInstalacao = e;
  $('#btn-instalar').hidden = false;
});
window.addEventListener('appinstalled', () => {
  pedidoDeInstalacao = null;
  $('#btn-instalar').hidden = true;
});
if (ehIOS && !instalado) $('#btn-instalar').hidden = false;
$('#btn-instalar').addEventListener('click', async () => {
  if (!pedidoDeInstalacao) {
    toast('No Safari, toque em Compartilhar (o quadrado com a seta) e depois em "Adicionar à Tela de Início".', 'info', 9000);
    return;
  }
  pedidoDeInstalacao.prompt();
  const { outcome } = await pedidoDeInstalacao.userChoice;
  if (outcome === 'accepted') $('#btn-instalar').hidden = true;
  pedidoDeInstalacao = null;
});

// ------------------------------------------------------------------ senha da sala
// Sala com senha de entrada: quem acerta ganha um "passe" do servidor, guardado por sala aqui no
// navegador — recarregar a página ou reconectar não pede a senha de novo. Ver /sala-acesso.
const idDaSala = (raw) => String(raw || '').trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'principal';
function lerPasses() {
  try { return JSON.parse(localStorage.getItem('sala3d-passes') || '{}'); } catch { return {}; }
}
function guardarPasse(sala, passe) {
  const passes = lerPasses();
  if (passe) passes[sala] = passe;
  else delete passes[sala];
  try { localStorage.setItem('sala3d-passes', JSON.stringify(passes)); } catch { /* modo privado */ }
}
function pedirSenhaDaSala(erro = '') {
  $('#campo-senha-sala').hidden = false;
  $('#senha-sala-erro').hidden = !erro;
  $('#senha-sala-erro').textContent = erro;
  $('#in-senha-sala').focus();
}
// false = a sala pediu senha (o campo aparece); true = pode entrar
async function liberarSala(sala, senha) {
  let r;
  try {
    const resp = await fetch('/sala-acesso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sala, senha: senha || undefined, passe: lerPasses()[sala] }),
    });
    r = await resp.json();
  } catch {
    return true; // sem resposta: tenta entrar assim mesmo, o servidor confere de novo
  }
  if (r.ok) {
    state.passe = r.passe || null;
    guardarPasse(sala, r.passe);
    return true;
  }
  guardarPasse(sala, null);
  pedirSenhaDaSala(r.erro || (senha ? '' : 'Esta sala tem senha. Peça a quem te convidou.'));
  return false;
}
// trocou o nome da sala: a senha digitada era de outra
roomInput.addEventListener('input', () => {
  $('#campo-senha-sala').hidden = true;
  $('#in-senha-sala').value = '';
});
// veio por um convite de sala com senha: já mostra o campo (sem gastar tentativa)
if (params.get('sala')) {
  fetch('/sala-acesso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sala: idDaSala(params.get('sala')), passe: lerPasses()[idDaSala(params.get('sala'))] }),
  }).then((r) => r.json()).then((r) => {
    if (r.protegida && !r.ok) pedirSenhaDaSala();
  }).catch(() => {});
}
// o servidor recusou o passe (senha trocada no meio do caminho): volta ao saguão desta sala
function senhaRecusada() {
  guardarPasse(idDaSala(state.roomRequested), null);
  const url = new URL(window.location.href);
  url.searchParams.set('sala', state.roomRequested);
  window.location.replace(url);
}

// cores: no formulário de entrada e no modal do personagem (que também abre dentro da sala)
function renderSwatches() {
  const html = COLORS.map((c) => `<button type="button" role="radio" aria-label="Cor ${c}" aria-checked="${c === settings.color}" style="--c:${c}" data-color="${c}"></button>`).join('');
  $('#swatches').innerHTML = html;
  $('#ep-cores').innerHTML = html;
}
renderSwatches();
function mudarCor(cor) {
  if (cor === settings.color) return;
  settings.color = cor;
  saveSettings();
  localAvatar.setColor(cor);
  renderSwatches();
  escolha.reverPrevia();
  if (socket && state.joined) {
    socket.emit('color', cor);
    self().color = cor;
    renderPeople();
  }
}
for (const sel of ['#swatches', '#ep-cores']) {
  $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) mudarCor(b.dataset.color);
  });
}
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
// Cartão do personagem no formulário de entrada; carregar = baixar o modelo agora (na abertura
// do site ele espera o mundo 3D ficar pronto, para não disputar com ele).
async function aplicarPersonagem({ carregar = true } = {}) {
  const def = PERSONAGENS[settings.char] || PERSONAGENS.padrao;
  $('#char-mini').src = def.miniatura;
  $('#char-nome').textContent = def.label;
  $('#char-resumo').textContent = def.resumo || '';
  // camiseta e foto só existem no boneco padrão: o modelo 3D tem o corpo dele
  const ehPadrao = !def.url;
  $('#campo-camiseta').hidden = !ehPadrao;
  $('#campo-foto').hidden = !ehPadrao;
  const linha = [];
  if (def.aviso) linha.push(def.aviso);
  if (def.credito) linha.push('Modelo: ' + def.credito);
  $('#char-credito').textContent = linha.join(' · ');
  if (!carregar) return;
  const r = await localAvatar.setPersonagem(def);
  if (r && r.ok === false) toast('Não consegui carregar esse personagem.', 'error');
}
aplicarPersonagem({ carregar: false });

// Modal com as miniaturas e a prévia ao vivo (escolher-personagem.js): no formulário de entrada
// e no botão da barra, dentro da sala.
const escolha = new EscolherPersonagem({
  raiz: $('#escolher-personagem'),
  aparencia: () => ({ cor: settings.color, camiseta: settings.shirt, foto: settings.photo }),
  aoEscolher: async (id) => {
    settings.char = id;
    saveSettings();
    await aplicarPersonagem();
    if (socket && state.joined) socket.emit('char', settings.char);
  },
  aoAbrir: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    player.enabled = false; // W/A/S/D não andam com o boneco por trás do modal
    player.keys.clear();
  },
  aoFechar: () => {
    if (state.joined) player.enabled = true;
  },
  // camiseta só existe no boneco padrão; a arma, para quem pode andar armado
  aoSelecionar: (def) => {
    $('#ep-linha-camiseta').hidden = !!def.url;
    renderArmas();
  },
});
$('#in-char').addEventListener('click', () => escolha.abrir(settings.char));
// o modelo 3D do personagem só baixa depois que o mundo ficou pronto: não disputa a abertura
world.pronto.then(() => aplicarPersonagem());
$('#btn-personagem').addEventListener('click', () => escolha.abrir(settings.char));
// P abre o personagem dentro da sala (trocar de boneco, cor, camiseta e arma sem sair)
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || !state.joined || state.focus || escolha.aberto || e.repeat) return;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(document.activeElement?.tagName)) return;
  escolha.abrir(settings.char);
});

// ---------------------------------------------------------------- camiseta
function renderShirt() {
  $$('#in-shirt button, #ep-camiseta button').forEach((b) => b.classList.toggle('on', b.dataset.shirt === settings.shirt));
  localAvatar.setShirt(settings.shirt);
}
renderShirt();
function mudarCamiseta(kind) {
  if (kind === settings.shirt) return;
  settings.shirt = kind;
  saveSettings();
  renderShirt();
  renderArmas();
  escolha.reverPrevia();
  if (state.joined) poderesMudaram();
  if (socket && state.joined) socket.emit('shirt', settings.shirt);
}
for (const sel of ['#in-shirt', '#ep-camiseta']) {
  $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-shirt]');
    if (b) mudarCamiseta(b.dataset.shirt);
  });
}
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

// ------------------------------------------------------------------ salas (lista lateral)
// Trocar de sala recarrega a página já entrando na outra (?entrar=1): voz, telas e jogos começam
// do zero, do mesmo jeito que na primeira entrada. Sala com senha sem passe para no saguão.
const salas = new SalasLaterais({
  raiz: $('#salas'),
  atual: () => state.room,
  passes: lerPasses,
  aoTrocar: (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sala', id);
    url.searchParams.set('entrar', '1');
    window.location.href = url;
  },
});
if (params.get('entrar') === '1') {
  const url = new URL(window.location.href);
  url.searchParams.delete('entrar');
  window.history.replaceState(null, '', url);
  // depois do resto do módulo: o join usa coisas declaradas mais abaixo
  if (nameInput.value.trim()) setTimeout(join, 0);
}
document.body.classList.toggle('sem-salas', !isTouch && !!settings.salasOcultas);
function abrirSalas(abrir) {
  document.body.classList.toggle('salas-abertas', abrir);
  $('#btn-salas').classList.toggle('on', abrir);
  if (abrir) salas.atualizar();
  syncTouchVisibility();
}
$('#btn-salas').addEventListener('click', () => {
  if (isTouch) return abrirSalas(!document.body.classList.contains('salas-abertas'));
  settings.salasOcultas = !settings.salasOcultas;
  saveSettings();
  document.body.classList.toggle('sem-salas', settings.salasOcultas);
});
// no toque, tocar fora da gaveta fecha
document.addEventListener('pointerdown', (e) => {
  if (!isTouch || !document.body.classList.contains('salas-abertas')) return;
  if (!e.target.closest('#salas, #btn-salas')) abrirSalas(false);
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
  clima.ligarSom();

  if (!(await liberarSala(idDaSala(state.roomRequested), $('#in-senha-sala').value))) {
    btn.disabled = false;
    btn.textContent = 'Entrar na sala';
    return;
  }

  let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  try { config = await (await fetch('/config')).json(); } catch { /* usa o padrão */ }

  socket = window.io();
  combat.socket = socket;
  rtc = new RTC(socket, {
    iceServers: config.iceServers,
    onTrack: handleTrack,
    onFalha: (id, temTurn) => {
      const u = state.users.get(id);
      if (!u || u.avisoFalha) return;
      u.avisoFalha = true;
      renderPeople();
      toast(temTurn
        ? `Não deu para conectar voz e vídeo com ${u.name}. Peça para ${u.name} recarregar a página.`
        : `Não deu para conectar voz e vídeo com ${u.name}: vocês estão em redes que bloqueiam conexão direta. O dono da sala precisa configurar o TURN (veja DEPLOY.md).`, 'error', 12000);
    },
  });
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
  if (data?.erro) return senhaRecusada();
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
  irParaEntrada();
  player.enabled = true;
  updateMicButton();
  poderesMudaram(); // mostra o X (atirar) na ajuda de quem veste a 22
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
      car: () => toggleVeiculo(),
      voar: () => toggleVoar(),
      puloAlto: () => togglePuloAlto(),
      tiro: () => puxarGatilho(),
      luneta: () => ligarLuneta(!luneta),
      soltarTiro: () => soltarGatilho(),
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
    poderesMudaram();
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
      arma: settings.arma,
      passe: state.passe,
    }, resolve);
  });
}

function applyJoined(data) {
  state.selfId = data.selfId;
  rtc.selfId = data.selfId;
  state.room = data.room;
  state.passe = data.passe || null;
  guardarPasse(data.room, data.passe);
  state.users.clear();
  state.users.set(data.selfId, {
    id: data.selfId, name: settings.name, color: settings.color, mic: state.micOn && state.micAvailable,
    shares: new Map(), isSelf: true, avatar: localAvatar, streams: new Map(),
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
  jogos.sincronizar(data.jogos);
  self().moedas = data.moedas ?? 0;
  mostrarMoedas();
  aplicarSala(data.sala);
  reentrarComoDono();
  salas.iniciar();

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
    pararTodasAsTelas(false);
    for (const id of [...state.users.keys()]) if (id !== state.selfId) removeUser(id, true);
    const data = await emitJoin();
    if (data?.erro) return senhaRecusada();
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
    salas.atualizar();
  });

  socket.on('user-left', ({ id }) => {
    const u = state.users.get(id);
    if (!u) return;
    sfx.leave();
    toast(`${u.name} saiu`, 'info', 3000, u.color);
    removeUser(id);
    salas.atualizar();
  });

  socket.on('state', ({ id, p, r, a, s }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    u.avatar.setNetworkState(p, r, a);
    u.speaking = !!s;
    u.avatar.speaking = !!s;
  });

  socket.on('user-update', ({ id, mic, photo, shirt, char, color, arma, health, ko }) => {
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
    if (arma !== undefined && IDS_ARMAS.includes(arma)) u.avatar.setArma(u.avatar.armado, arma);
    if (color !== undefined) {
      u.color = color;
      u.avatar.setColor(color);
      renderPeople();
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

  socket.on('tiro', ({ id, de, ate, mais, arma }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    desenharTiro(de, ate);
    for (const p of mais || []) desenharTiro(de, p, true);
    u.avatar.atirar();
    const def = defArma(IDS_ARMAS.includes(arma) ? arma : u.avatar.tipoArma);
    const d = localAvatar.group.position.distanceTo(_tmpTiro.set(de[0], de[1], de[2]));
    const vol = THREE.MathUtils.clamp(1 - d / 90, 0.06, 1);
    sfx.tiro(vol, def.som);
    if (def.engatilhar) setTimeout(() => sfx.engatilhar(vol), 170);
  });

  socket.on('hit', ({ from, fromName, dir, arma }) => {
    combat.takeHit({ dir, from, fromName, arma });
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

  // uma tela de alguém entrou (slot) ou saiu (slot null). As minhas eu registro na resposta do
  // share-start e apago no stopShare: aqui só chegam de volta.
  // A que estava só no telão pode ganhar uma tela quando outra sai (mesma chave, slot novo).
  socket.on('posto', ({ id, posto }) => {
    const u = state.users.get(id);
    if (!u) return;
    u.posto = posto;
    refreshScreens();
  });

  socket.on('share-update', ({ id, key, slot, streamId, gone, controle: podeControlar, site, titulo }) => {
    const u = state.users.get(id);
    if (!u || typeof key !== 'string') return;
    const tinha = u.shares.get(key);
    if (tinha && !gone) {
      tinha.slot = slot ?? null;
      tinha.controle = !!podeControlar;
      tinha.site = site ?? null;
      tinha.titulo = titulo ?? null;
      updateFocusCtrl();
    } else if (u.isSelf) {
      return;
    } else if (gone) {
      if (!tinha) return;
      u.streams.delete(tinha.streamId);
      soltarVideo(tinha);
      u.shares.delete(key);
    } else {
      const sh = { key, slot: slot ?? null, streamId, video: null, controle: !!podeControlar, site: site ?? null, titulo: titulo ?? null };
      u.shares.set(key, sh);
      toast(`${u.name} começou a compartilhar (${ondeEsta(sh)})`, 'info', 4500, u.color);
    }
    u.avatar.setStatus({ sharing: u.shares.size > 0 });
    if (u.isSelf) refreshScreens();
    else routeStreams(u);
    renderPeople();
  });

  socket.on('main', ({ source, by }) => {
    state.main = source;
    refreshScreens();
    renderPeople();
    if (by && by !== settings.name) {
      const dono = acharTela(source)?.user;
      toast(source === 'media' ? `${by} voltou o telão para o ${tv.label}` : `${by} colocou a tela de ${dono?.name ?? 'alguém'} no telão`);
    }
  });

  socket.on('chat', (m) => addChat(m, m.id !== state.selfId));

  socket.on('browser-opened', ({ site, by }) => {
    toast(by === settings.name ? `Abrindo ${site} no telão` : `${by} abriu ${site} no navegador do telão`, 'info', 3500, '#38bdf8');
  });

  socket.on('emote', ({ id, kind }) => state.users.get(id)?.avatar.emote(kind));
  socket.on('jogo', (msg) => jogos.receber(msg));
  // mexendo na própria aba: sem o aviso de "fulano está mexendo na sua aba"
  socket.on('controle', (msg) => {
    const sh = self()?.shares.get(msg.key);
    if (sh?.controle) turboDaTela(msg.key);
    controle.receber(sh, msg.deId === state.selfId ? { ...msg, deId: null } : msg);
  });
  // o dono pôs, trocou ou tirou a senha: quem está dentro recebe o passe novo
  socket.on('passe', (passe) => {
    state.passe = passe;
    guardarPasse(state.room, passe);
  });
  socket.on('sala', (cfg) => {
    aplicarSala(cfg);
    if (cfg.por && cfg.por !== settings.name) toast(`${cfg.por} atualizou a sala`, 'info', 3500);
  });
  socket.on('sino', ({ nome, cor }) => {
    ultimoSino = Date.now();
    sfx.sino();
    world.escritorio?.tocarSino();
    toast(`${nome === settings.name ? 'Você' : nome} fechou uma venda!`, 'success', 5000, cor);
  });
  socket.on('moedas', ({ id, moedas, delta, motivo }) => {
    const u = state.users.get(id);
    if (!u) return;
    u.moedas = moedas;
    if (u.isSelf) {
      mostrarMoedas(true);
      sfx.moeda();
      toast(`+${delta} moedas · ${motivo}`, 'success', 4500);
    } else if (delta >= 50) {
      toast(`${u.name} ganhou ${delta} moedas (${motivo})`, 'info', 4000, u.color);
    }
    renderPeople();
  });
  // o saldo novo só aparece quando os dados param (ver dados.aoTerminar)
  socket.on('dados', (ev) => dados.receber(ev));

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
  avatar.aquecer = (obj) => world.aquecerObjeto(obj);
  avatar.setStatus({ mic: data.mic, sharing: data.shares?.length > 0 });
  if (data.photo) avatar.setPhoto(data.photo);
  avatar.tipoArma = IDS_ARMAS.includes(data.arma) ? data.arma : ARMA_PADRAO;
  if (data.shirt && data.shirt !== 'none') avatar.setShirt(data.shirt);
  if (data.char && data.char !== 'padrao') avatar.setPersonagem(PERSONAGENS[data.char]);
  if (data.health != null) avatar.setHealth(data.health);
  if (data.ko) avatar.setKo(true);
  avatar.setNetworkState(data.p, data.r, data.a);
  world.scene.add(avatar.group);
  const shares = new Map((data.shares || []).map((sh) => [sh.key, { ...sh, video: null }]));
  const u = { ...data, shares, isSelf: false, avatar, streams: new Map(), audioEl: null, speaking: false };
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
  for (const sh of u.shares.values()) soltarVideo(sh);
  if (state.focus?.kind === 'share' && u.shares.has(state.focus.key)) exitFocus();
  state.users.delete(id);
  rtc.removePeer(id);
  if (!quiet) {
    refreshScreens();
    renderPeople();
    updateRoomInfo();
  }
}

function updateRoomInfo() {
  const n = state.users.size;
  const empresa = state.sala?.empresa;
  $('#room-name').textContent = empresa || state.room;
  $('#bar-room').textContent = empresa ? `${empresa} · #${state.room}` : `#${state.room}`;
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
    const telas = [...u.shares.values()].sort(ordemDasTelas);
    const sub = telas.length
      ? `Compartilhando · ${telas.map(ondeEsta).join(', ')}`
      : u.isSelf ? 'Você' : statusText(u);
    // uma linha por tela: ver, pôr no telão e (as suas) parar
    const linhas = telas.map((sh) => {
      const noTelao = state.main === sh.key;
      return `<li data-key="${esc(sh.key)}">
        <span>${ondeEsta(sh)}${noTelao && sh.slot != null ? ' · <b>no telão</b>' : ''}</span>
        <button type="button" class="icon-btn" data-act="view" title="Ver a tela">${icon('eye', 16)}</button>
        <button type="button" class="icon-btn${noTelao ? ' on' : ''}" data-act="pin" title="${noTelao ? 'Tirar do telão' : 'Pôr no telão'}">${icon('pin', 16)}</button>
        ${u.isSelf ? `<button type="button" class="icon-btn" data-act="stop" title="Parar esta tela">${icon('x', 16)}</button>` : ''}
      </li>`;
    }).join('');
    return `<li class="person${u.speaking ? ' speaking' : ''}" data-id="${esc(u.id)}">
      <span class="avatar-dot" style="--c:${esc(u.color)}">${esc((u.name[0] || '?').toUpperCase())}</span>
      <div class="person-info">
        <div class="person-name">${esc(u.name)}${u.isSelf ? ' <small>(você)</small>' : ''}<span class="moedas" title="Moedas">${icon('moeda', 12)} ${u.moedas ?? 0}</span></div>
        <div class="person-sub${telas.length ? ' sharing' : ''}">${esc(sub)}</div>
      </div>
      <div class="person-actions">
        ${!u.isSelf ? `<button type="button" class="icon-btn" data-act="goto" title="Ir até">${icon('goto', 18)}</button>` : ''}
        ${u.mic ? '' : `<span class="muted-ic" title="Microfone desligado">${icon('micOff', 18)}</span>`}
      </div>
      ${linhas ? `<ul class="person-shares">${linhas}</ul>` : ''}
    </li>`;
  }).join('');
  renderSharePop();
}

$('#people-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const key = btn.closest('[data-key]')?.dataset.key;
  const u = state.users.get(id);
  if (!u) return;
  if (btn.dataset.act === 'view') enterFocus({ kind: 'share', key });
  if (btn.dataset.act === 'pin') togglePin(key);
  if (btn.dataset.act === 'stop') stopShare(key, true);
  if (btn.dataset.act === 'goto') {
    const p = u.avatar.group.position;
    run.cancel();
    hideParkourHud();
    player.teleport([p.x + 1.4, p.y, p.z + 1.4], null);
  }
});

function togglePin(key) {
  if (key) socket.emit('main', state.main === key ? 'media' : key);
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
// Dá para compartilhar várias abas/janelas ao mesmo tempo: cada clique em "Compartilhar outra"
// abre o seletor do navegador de novo e a escolhida vai para a próxima tela livre.
async function novaTela() {
  if (shareBusy) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Seu navegador não permite compartilhar a tela aqui. Use Chrome/Edge no computador (https ou localhost).', 'error', 6000);
    return;
  }
  if (!cabeMaisUma()) {
    toast('Todas as telas e o telão estão ocupados. Pare uma delas para compartilhar outra.', 'warn', 5000);
    return;
  }
  let stream;
  let key;
  shareBusy = true;
  try {
    stream = await rtc.captureScreen();
    key = await publishShare(stream);
    if (!key) return;
  } catch (err) {
    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(`Não foi possível compartilhar: ${err.message}`, 'error');
    return;
  } finally {
    shareBusy = false;
  }
  const onde = ondeEsta(self().shares.get(key));
  if (!stream.getAudioTracks().length) {
    toast(`${onde} sem som. Para mandar o som, escolha uma aba ou a tela inteira e marque “Compartilhar áudio”.`, 'warn', 8000);
  } else {
    toast(`Você está compartilhando no ${onde === 'Telão' ? 'telão' : onde} (com som)`);
  }
}

// Reserva uma tela no servidor e manda o stream (captura ou arquivo) para todo mundo.
// Devolve a chave da tela, ou null se não deu.
async function publishShare(stream, { file = false, height = 0 } = {}) {
  // no escritório, numa tela da sala onde a pessoa está
  const sala = world.salaEm(player.pos.x, player.pos.z);
  const res = await new Promise((resolve) => socket.emit('share-start', { streamId: stream.id, sala }, resolve));
  if (!res?.ok) {
    if (!file) for (const t of stream.getTracks()) t.stop();
    toast(res?.error || 'Não foi possível compartilhar.', 'error');
    return null;
  }
  const video = makeVideo(true);
  video.srcObject = stream;
  video.play().catch(() => {});
  const aba = file ? null : controle.abaDe(stream, (nova) => marcaDaAba(res.key, nova));
  // não é aba (janela ou tela inteira): quem clica é o ajudante nativo da extensão
  const alvo = file || aba != null ? null : controle.alvoDe(stream);
  self().shares.set(res.key, { key: res.key, slot: res.slot ?? null, streamId: stream.id, video, file, aba, alvo, controle: false, site: null, titulo: null });
  avisarAbas();
  rtc.addScreen(res.key, stream, { file, height });
  // captura: a trilha acaba quando a pessoa clica em "Parar" na barra do navegador.
  // Arquivo: acaba toda vez que o vídeo chega ao fim, e isso não é motivo para parar.
  if (!file) stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare(res.key, true));
  localAvatar.setStatus({ sharing: true });
  updateShareButton();
  refreshScreens();
  renderPeople();
  return res.key;
}

// A extensão marca a aba compartilhada ("sala3d-aba:<id>"), mas a marca é da PÁGINA: o Chrome a
// apaga a cada navegação e ela volta quando a página nova carrega. Sumir, então, quase sempre é
// só um link clicado: o controle pausa (os eventos que chegam são ignorados) e segue sozinho
// quando a marca volta com a mesma aba. Marca de outra aba = a pessoa trocou pelo "Compartilhar
// esta aba" do Chrome, e o controle vai junto. Sem marca por muito tempo (página onde a extensão
// não roda, como as do Chrome), o controle desliga — e religa se a mesma aba voltar a ter marca.
const ESPERA_MARCA = 8000;

function marcaDaAba(key, nova) {
  const s = self()?.shares.get(key);
  if (!s) return;
  clearTimeout(s.semMarca);
  s.semMarca = null;
  if (nova == null) {
    if (s.aba == null) return;
    s.semMarca = setTimeout(() => {
      s.semMarca = null;
      controle.soltar(s.aba);
      s.religar = s.controle ? s.aba : null;
      s.aba = null;
      if (s.religar != null) {
        socket.emit('controle-permitir', { key, on: false });
        toast('Controle da aba pausado: a página aberta não aceita controle (ex.: páginas do próprio Chrome). Ele volta sozinho quando a aba abrir um site comum.', 'info', 8000);
      }
      avisarAbas();
      renderSharePop();
    }, ESPERA_MARCA);
    return;
  }
  if (s.aba != null && s.aba !== nova) controle.soltar(s.aba);
  const religar = s.religar === nova && !s.controle;
  s.religar = null;
  s.aba = nova;
  if (religar) {
    socket.emit('controle-permitir', { key, on: true });
    toast('O controle da aba voltou.', 'success', 3000);
  }
  avisarAbas();
  renderSharePop();
}

// Alguém está controlando esta tela: ela vai a 60 quadros por segundo (cursor e rolagem fluidos)
// e volta ao normal 5 s depois do último movimento — parada, 60 quadros só gastariam banda.
const turbos = new Map(); // key -> timer
function turboDaTela(key) {
  if (!turbos.has(key)) rtc.turbo(key, true);
  clearTimeout(turbos.get(key));
  turbos.set(key, setTimeout(() => {
    turbos.delete(key);
    rtc.turbo(key, false);
  }, 5000));
}

// diz à extensão quais abas estou compartilhando (ela abre nelas os links de aba nova e conta em
// que site estão)
function avisarAbas() {
  controle.informarAbas([...(self()?.shares.values() || [])].map((s) => s.aba).filter((a) => a != null));
}

function stopShare(key, notify) {
  const me = self();
  const sh = me?.shares.get(key);
  if (!sh) return;
  clearTimeout(sh.semMarca);
  clearTimeout(turbos.get(key));
  turbos.delete(key);
  rtc.stopScreen(key);
  controle.soltar(sh.aba);
  if (sh.alvo && sh.controle) controle.soltarJanela();
  if (sh.file) stopCastVideo();
  if (notify) socket.emit('share-stop', key);
  me.shares.delete(key);
  avisarAbas();
  soltarVideo(sh);
  localAvatar.setStatus({ sharing: me.shares.size > 0 });
  updateShareButton();
  refreshScreens();
  renderPeople();
}

function pararTodasAsTelas(notify) {
  for (const key of [...(self()?.shares.keys() || [])]) stopShare(key, notify);
}

function updateShareButton() {
  const n = self()?.shares.size ?? 0;
  const b = $('#btn-share');
  b.classList.toggle('on', n > 0);
  b.dataset.tip = n ? 'Suas telas' : 'Compartilhar tela';
  const c = $('#share-count');
  c.hidden = n < 1;
  c.textContent = n;
  if (!n) $('#share-pop').hidden = true;
}

// o que a pessoa escolheu no seletor do navegador
function tipoDaTela(sh) {
  if (sh.file) return 'Vídeo do computador';
  const surf = sh.video?.srcObject?.getVideoTracks()[0]?.getSettings?.().displaySurface;
  return surf === 'browser' ? 'Aba' : surf === 'window' ? 'Janela' : surf === 'monitor' ? 'Tela inteira' : 'Tela';
}

// menu do botão de compartilhar enquanto há telas no ar
function renderSharePop() {
  const pop = $('#share-pop');
  if (!pop) return;
  const telas = [...(self()?.shares.values() || [])].sort(ordemDasTelas);
  if (!telas.length) {
    pop.hidden = true;
    pop.innerHTML = '';
    return;
  }
  const cabe = cabeMaisUma();
  const vaiProTelao = cabe && telasNoAr().filter((t) => t.share.slot != null).length >= world.slots.length;
  // um clique libera (ou tira) o controle de todas as telas que aceitam controle
  const controlaveis = telas.filter((sh) => !sh.file);
  const todasLiberadas = controlaveis.length > 0 && controlaveis.every((sh) => sh.controle);
  const botaoTodas = controlaveis.length > 1 || (controlaveis.length === 1 && !todasLiberadas)
    ? `<button type="button" class="sp-all${todasLiberadas ? ' on' : ''}" data-act="ctrl-all">${icon('cursor', 15)}${todasLiberadas ? 'Tirar o controle de todas' : 'Permitir controle em todas'}</button>`
    : '';
  pop.innerHTML = `<div class="sp-title">Suas telas</div>${botaoTodas}`
    + telas.map((sh) => {
      const noTelao = state.main === sh.key;
      return `<div class="sp-row" data-key="${esc(sh.key)}">
        <span class="sp-name">${esc(tipoDaTela(sh))}<small>${ondeEsta(sh)}${noTelao && sh.slot != null ? ' · no telão' : ''}</small></span>
        ${sh.file ? '' : `<button type="button" class="sp-btn ctrl${sh.controle ? ' on' : ''}" data-act="ctrl" title="${sh.controle ? 'Parar de deixar controlar' : 'Permitir que mexam nesta tela'}">${icon('cursor', 16)}</button>`}
        <button type="button" class="sp-btn${noTelao ? ' on' : ''}" data-act="pin" title="${noTelao ? 'Tirar do telão' : 'Pôr no telão'}">${icon('pin', 16)}</button>
        <button type="button" class="sp-btn danger" data-act="stop" title="Parar esta tela">${icon('x', 16)}</button>
      </div>`;
    }).join('')
    + `<button type="button" class="sp-add" data-act="add"${cabe ? '' : ' disabled'}>${icon('share', 16)}${!cabe ? 'Telas e telão ocupados' : vaiProTelao ? 'Compartilhar outra direto no telão' : 'Compartilhar outra aba ou janela'}</button>`
    + (telas.length > 1 ? '<button type="button" class="sp-stop-all" data-act="stop-all">Parar todas</button>' : '');
}

$('#btn-share').addEventListener('click', () => {
  if (!compartilhando()) {
    novaTela();
    return;
  }
  renderSharePop();
  $('#share-pop').hidden = !$('#share-pop').hidden;
});

$('#share-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const key = b.closest('[data-key]')?.dataset.key;
  switch (b.dataset.act) {
    case 'add':
      $('#share-pop').hidden = true;
      novaTela();
      return;
    case 'pin':
      togglePin(key);
      break;
    case 'stop':
      stopShare(key, true);
      break;
    case 'ctrl':
      permitirControle(key);
      break;
    case 'ctrl-all':
      controleEmTodas();
      break;
    case 'stop-all':
      pararTodasAsTelas(true);
      break;
    default:
  }
  renderSharePop();
});

// ------------------------------------------------------------------ controle remoto das abas
// Precisa da extensão (pasta extensao/) no Chrome de quem compartilha. Ver controle.js.
const controle = new Controle({
  emitir: (ev, data, volatil) => (volatil ? socket?.volatile.emit(ev, data) : socket?.emit(ev, data)),
  toast,
  onExtensao: () => {
    renderSharePop();
    avisarAbas();
    guia.atualizar();
    renderExtensao();
  },
});

// Guia de instalação da extensão (ver guia-extensao.js). Abre sozinho quando alguém tenta liberar
// o controle sem ela, e fica em Ajustes → Extensão de controle.
const guia = new GuiaExtensao({ raiz: $('#guia-ext'), controle });
const abrirGuiaExtensao = (foco) => guia.abrir(foco);

function renderExtensao() {
  const { ok, liberado, versao } = controle.ext;
  $('#ext-status').textContent = ok && liberado ? `Instalada e liberada neste site${versao ? ` · versão ${versao}` : ''}`
    : ok ? 'Instalada, mas falta liberar este site'
      : 'Para deixarem mexer nas suas abas';
  $('#ext-guia').textContent = ok && liberado ? 'Ver guia' : ok ? 'Liberar' : 'Instalar';
}
renderExtensao();
if (isTouch) $('#ext-row').hidden = true; // celular não compartilha tela
$('#ext-guia').addEventListener('click', () => abrirGuiaExtensao());

// A extensão está instalada e liberada neste site? Se não, abre o guia (no passo que falta).
function extensaoPronta() {
  if (controle.ext.ok && controle.ext.liberado) return true;
  abrirGuiaExtensao();
  return false;
}

// "Permitir controle em todas" do menu Suas telas — ou tira de todas, se já estão todas liberadas
async function controleEmTodas() {
  const telas = [...(self()?.shares.values() || [])].filter((s) => !s.file);
  if (!telas.length) return;
  if (telas.every((s) => s.controle)) {
    for (const s of telas) {
      socket.emit('controle-permitir', { key: s.key, on: false });
      controle.soltar(s.aba);
    }
    if (telas.some((s) => s.alvo)) controle.soltarJanela();
    toast('Ninguém mais mexe nas suas telas.');
    return;
  }
  if (!extensaoPronta()) return;
  const faltam = telas.filter((s) => !s.controle);
  const abas = faltam.filter((s) => s.aba != null);
  const janelas = faltam.filter((s) => s.aba == null && s.alvo);
  const semAba = faltam.length - abas.length - janelas.length;
  // janela e tela inteira: o ajudante nativo precisa estar instalado (sobe agora)
  const janelasOk = janelas.length > 0 && !(await controle.retomarJanela())?.erro;
  const liberar = janelasOk ? [...abas, ...janelas] : abas;
  for (const s of liberar) socket.emit('controle-permitir', { key: s.key, on: true });
  if (liberar.length) toast(`Controle liberado em ${liberar.length} ${liberar.length === 1 ? 'tela' : 'telas'}: quem abrir já pode mexer.`, 'success', 5000);
  if (janelas.length && !janelasOk) {
    toast('Janela e tela inteira precisam do ajudante do Windows — veja no guia.', 'warn', 8000);
    abrirGuiaExtensao('janelas');
  }
  if (semAba) toast('Não reconheci uma das abas. Se ela já estava aberta antes da extensão, recarregue-a e compartilhe de novo.', 'warn', 8000);
}

// A aba compartilhada mudou de página: conta à sala o site e o título (para a barra de navegação).
// Um envio por segundo no máximo — tem site que fica piscando o título ("(1) Nova mensagem").
const infoPendente = new Map(); // key -> { site, titulo, timer }
controle.onAbaMudou = (aba, site, titulo) => {
  for (const s of self()?.shares.values() || []) {
    if (s.aba !== aba) continue;
    const p = infoPendente.get(s.key) || {};
    Object.assign(p, { site, titulo });
    infoPendente.set(s.key, p);
    if (p.timer) continue;
    socket.emit('share-info', { key: s.key, site, titulo });
    p.timer = setTimeout(() => {
      infoPendente.delete(s.key);
      if (p.site !== site || p.titulo !== titulo) socket.emit('share-info', { key: s.key, site: p.site, titulo: p.titulo });
    }, 1000);
  }
};
// janela: Ctrl+Alt+End no teclado de quem compartilha. Aba: fechou a barra amarela do Chrome.
controle.onDesligou = (aba, motivo, janela) => {
  for (const sh of self()?.shares.values() || []) {
    if (!sh.controle || (janela ? !sh.alvo : sh.aba !== aba)) continue;
    socket.emit('controle-permitir', { key: sh.key, on: false });
    toast(janela ? 'Controle cortado pelo Ctrl+Alt+End.' : 'O controle da aba foi desligado (a barra amarela do Chrome foi fechada).', 'info', 5000);
  }
};

async function permitirControle(key) {
  const sh = self()?.shares.get(key);
  if (!sh) return;
  if (sh.controle) {
    socket.emit('controle-permitir', { key, on: false });
    controle.soltar(sh.aba);
    if (sh.alvo) controle.soltarJanela();
    toast('Ninguém mais mexe nessa tela.');
    return;
  }
  if (!extensaoPronta()) return;
  if (sh.aba == null && !sh.alvo) {
    toast('Não reconheci a aba. Se ela já estava aberta antes da extensão, recarregue-a e compartilhe de novo.', 'warn', 9000);
    return;
  }
  // janela/tela: o ajudante nativo sobe agora (se não estiver instalado, a extensão avisa)
  if (sh.aba == null) {
    const r = await controle.retomarJanela();
    if (r?.erro) {
      toast('Janela e tela inteira precisam do ajudante do Windows — veja no guia. Abas funcionam sem isso.', 'warn', 8000);
      abrirGuiaExtensao('janelas');
      return;
    }
  }
  socket.emit('controle-permitir', { key, on: true });
  toast(sh.aba != null
    ? 'Pronto: quem abrir essa tela já pode mexer nela. O Chrome mostra uma barra amarela de depuração enquanto isso — é normal.'
    : 'Pronto: quem abrir essa tela vai mexer no mouse e no teclado de verdade do seu PC, dentro dela. Ctrl+Alt+End corta na hora.', 'success', 9000);
  if (sh.aba != null && !controle.navega) {
    toast('Sua extensão é a versão antiga: sem barra de navegação e com links de aba nova fora da tela. Em chrome://extensions, clique em Recarregar na "Sala 3D — controle das abas".', 'warn', 11000);
  }
}

// Dá para mexer nesta tela daqui? As dos outros, se o dono liberou. As suas, só se for aba: quem
// clica nela é a extensão, sem tocar no mouse. Janela e tela inteira são o ajudante nativo
// movendo o seu mouse de verdade — controladas de você para você, ele brigaria com ele mesmo.
const podeControlar = ({ user: u, share: sh }) => !!sh.controle && (!u.isSelf || sh.aba != null);

function porqueNaoControla({ user: u, share: sh }) {
  if (!u.isSelf) return 'só ver';
  if (sh.file) return 'seu vídeo';
  if (sh.aba == null) return 'sua janela · os outros controlam';
  return 'sua aba · libere o controle';
}

// ------------------------------------------------------------------ navegação da aba
// Voltar, avançar, recarregar e endereço numa aba controlada (precisa da extensão 1.2 do lado de
// quem compartilha — é ela que conta o site, então "tem site" = dá para navegar).
const navegavel = (t) => podeControlar(t) && !!t.share.site;

// texto que não parece endereço vira pesquisa no Google
function enderecoDigitado(texto) {
  const s = String(texto || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?([/?#]\S*)?$/i.test(s)) return `http://${s}`;
  if (/^[\p{L}\p{N}_-]+(\.[\p{L}\p{N}_-]+)+(:\d+)?([/?#]\S*)?$/iu.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

function navegar(key, a, texto) {
  const ev = { t: 'nav', a };
  if (a === 'abrir') {
    ev.url = enderecoDigitado(texto);
    if (!ev.url) return;
  }
  controle.mandar(key, ev);
}

// barra da tela em foco (a da mesa é montada em mesa.js)
const focusNav = $('#focus-nav');
focusNav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b || state.focus?.kind !== 'share') return;
  b.blur();
  navegar(state.focus.key, b.dataset.nav);
});
focusNav.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = focusNav.elements.endereco;
  if (state.focus?.kind === 'share') navegar(state.focus.key, 'abrir', input.value);
  input.blur();
});
focusNav.elements.endereco.addEventListener('focus', (e) => e.target.select());

// botão da tela em foco: "Controlar", ou "Permitir controle" na sua aba que ainda não liberou
function updateFocusCtrl() {
  const btn = $('#focus-ctrl');
  const fv = $('#focus-video');
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  const pode = !!t && podeControlar(t);
  const nav = !!t && navegavel(t);
  focusNav.hidden = !nav;
  const end = focusNav.elements.endereco;
  if (nav && document.activeElement !== end) {
    end.value = t.share.site;
    end.title = t.share.titulo || t.share.site;
  }
  if (t) {
    const dono = t.user.isSelf ? 'Sua tela' : `Tela de ${t.user.name}`;
    $('#focus-name').textContent = `${dono} · ${ondeEsta(t.share)}${!nav && t.share.site ? ` · ${t.share.site}` : ''}`;
  }
  if (!pode) controle.remover(fv);
  // Liberada, já entra controlando — igual à mesa, sem botão no meio do caminho. "Só assistir"
  // para de mexer até fechar o foco (state.focus.soAssistir).
  else if (!controle.tem(fv) && !state.focus.soAssistir) {
    controle.adicionar(fv, state.focus.key);
    controle.focar(fv);
  }
  const liberar = !!t && !pode && t.user.isSelf && !t.share.file && t.share.aba != null;
  const on = controle.tem(fv);
  btn.hidden = !pode && !liberar;
  btn.dataset.modo = liberar ? 'liberar' : 'controlar';
  btn.classList.toggle('on', on);
  btn.innerHTML = `${icon(liberar || !on ? 'cursor' : 'eye', 16)}${liberar ? 'Permitir controle' : on ? 'Só assistir' : 'Controlar'}`;
  btn.title = on ? 'Parar de mexer nesta tela (continua vendo)' : '';
}
$('#focus-ctrl').addEventListener('click', async () => {
  const btn = $('#focus-ctrl');
  const fv = $('#focus-video');
  btn.blur();
  if (state.focus?.kind !== 'share') return;
  if (btn.dataset.modo === 'liberar') {
    await permitirControle(state.focus.key);
    return; // vira controle direto quando o servidor confirmar (share-update)
  }
  state.focus.soAssistir = controle.tem(fv);
  if (state.focus.soAssistir) controle.remover(fv);
  updateFocusCtrl();
});

// ------------------------------------------------------------------ sala da empresa
// O dono da sala (quem criou a senha) escolhe o ambiente, quais jogos aparecem e o nome da
// empresa — vale para todo mundo que entrar. O servidor guarda (banco.js) e também barra os jogos
// desligados; aqui eles somem do mundo (World.ligarArea), da barra, da ajuda e das teclas.
const MODOS = [
  { id: 'lazer', nome: 'Lazer', desc: 'Cinema, parque e todos os jogos' },
  { id: 'escritorio', nome: 'Escritório', desc: 'Uma sala por departamento, ligadas por um corredor' },
];
const JOGOS_DA_SALA = [
  ['parkour', 'Parkour', 'Circuito até o camarote'],
  ['ringue', 'Ringue', 'Luta e socos'],
  ['corrida', 'Pista de corrida', 'Virar carro e dar voltas'],
  ['xadrez', 'Xadrez de bruxo', ''],
  ['dama', 'Dama gigante', ''],
  ['velha', 'Jogo da velha', ''],
  ['dados', 'Mesa de dados', 'Apostas com moedas'],
  ['poderes', 'Poderes', 'Voar e pulo alto'],
  ['armas', 'Arma da camiseta 22', ''],
];
const AREAS_DE_JOGO = ['parkour', 'ringue', 'corrida', 'xadrez', 'dama', 'velha', 'dados'];
// parkour e ringue ficam dentro do cinema: no escritório não existem
const SO_NO_CINEMA = ['parkour', 'ringue'];
const modoEscritorio = () => state.sala?.modulo === 'escritorio' && state.sala.departamentos?.length > 0;
const jogoLigado = (nome) => state.sala?.jogos?.[nome] !== false && !(modoEscritorio() && SO_NO_CINEMA.includes(nome));
const temSino = () => modoEscritorio() && state.sala.departamentos.includes('comercial');

// onde a pessoa nasce e para onde volta: recepção do escritório, ou a frente do cinema
function irParaEntrada() {
  const e = world.entrada();
  if (player.veiculo) toggleVeiculo();
  player.teleport([e.pos[0] + (Math.random() - 0.5) * 4, 0, e.pos[2] + (Math.random() - 0.5) * 3], e.yaw);
}
let senhaDono = null; // só na memória: se a conexão cair, entra como dono de novo sozinho
let formSujo = false; // o dono está mexendo no formulário: o que chega do servidor não apaga

function aplicarSala(cfg) {
  if (!cfg) return;
  state.sala = cfg;
  clima.setConfig(cfg);
  if (state.room) salas.visitar(state.room, { empresa: cfg.empresa, temSenha: cfg.temSenha });
  let mudou = false;
  for (const j of AREAS_DE_JOGO) mudou = world.ligarArea(j, jogoLigado(j)) || mudou;
  if (mudou) world.aquecerShaders(); // o número de luzes pode ter mudado
  // o cinema (Lazer) ou o prédio do escritório com os departamentos escolhidos
  if (world.setModo(cfg)) {
    refreshScreens();
    // a planta mudou com gente dentro: volta para a entrada (senão alguém fica dentro de uma parede)
    if (state.joined) irParaEntrada();
  }
  world.escritorio?.placar(cfg.placar);
  $('#sino').hidden = !temSino();
  atualizarPaineis();
  // desligou o que alguém estava usando agora
  if (!jogoLigado('poderes')) {
    if (player.voando) toggleVoar();
    if (player.puloAlto) togglePuloAlto();
  }
  if (!jogoLigado('corrida') && player.veiculo) toggleVeiculo();
  if (!jogoLigado('parkour') && run.state !== 'idle') {
    run.cancel();
    hideParkourHud();
  }
  if ((state.focus?.kind === 'jogo' && jogos.ativa && !jogoLigado(jogos.ativa)) || (state.focus?.kind === 'dados' && !jogoLigado('dados'))) exitFocus();
  // botões da barra, teclas da ajuda e botões de toque de cada jogo
  $$('[data-jogo]').forEach((el) => { el.hidden = !el.dataset.jogo.split(' ').some(jogoLigado); });
  if (state.panel && $(`#bar [data-panel="${state.panel}"]`)?.hidden) closePanel();
  poderesMudaram(); // arma (camiseta 22) na ajuda e no toque
  updateRoomInfo();
  renderSala();
}

function renderSala() {
  const cfg = state.sala;
  if (!cfg) return;
  const amb = modoEscritorio()
    ? { nome: `Escritório (${cfg.departamentos.map((d) => DEPARTAMENTOS[d].nome).join(', ')})` }
    : MODOS[0];
  const desligados = JOGOS_DA_SALA.filter(([j]) => !jogoLigado(j)).length;
  $('#sala-resumo').innerHTML = `<div class="sala-chip">${icon('predio', 18)}<span>
    <b>${esc(cfg.empresa || 'Sem nome de empresa')}</b>
    <small>Ambiente: ${esc(amb.nome)} · ${desligados ? `${desligados} ${desligados === 1 ? 'jogo desligado' : 'jogos desligados'}` : 'todos os jogos ligados'}${cfg.temSenha ? ' · com senha' : ''}</small>
  </span></div>${state.donoDaSala ? '<p class="hint">Você é o dono desta sala.</p>' : ''}`;
  $('#sala-criar').hidden = cfg.temDono || state.donoDaSala;
  $('#sala-entrar').hidden = !cfg.temDono || state.donoDaSala;
  $('#sala-config').hidden = !state.donoDaSala;
  $('#entrada-status').textContent = cfg.temSenha
    ? 'Ligada: quem chega pelo link precisa digitar a senha.'
    : 'Sala aberta: qualquer um com o link entra.';
  $('#entrada-salvar').textContent = cfg.temSenha ? 'Trocar' : 'Pôr senha';
  $('#entrada-tirar').hidden = !cfg.temSenha;
  if (state.donoDaSala) preencherConfig();
}

function preencherConfig(forcar = false) {
  if (formSujo && !forcar) return;
  const cfg = state.sala;
  $('#sala-config').elements.empresa.value = cfg.empresa || '';
  const opcoes = (lista, atual) => Object.entries(lista).map(([id, o]) => `<option value="${id}"${id === atual ? ' selected' : ''}>${o.nome}</option>`).join('');
  $('#sala-config').elements.clima.innerHTML = opcoes(CLIMAS, cfg.clima || 'auto');
  $('#sala-config').elements.horario.innerHTML = opcoes(HORARIOS, cfg.horario || 'ciclo');
  $('#sala-modulos').innerHTML = MODOS.map((a) => `<label class="modulo">
      <input type="radio" name="modulo" value="${a.id}"${cfg.modulo === a.id ? ' checked' : ''}>
      <b>${a.nome}</b><small>${a.desc}</small>
    </label>`).join('');
  // departamentos do escritório: cada um vira uma sala (a ordem é a das vagas, a partir da recepção)
  $('#sala-deptos').innerHTML = IDS_DEPARTAMENTOS.map((id) => {
    const d = DEPARTAMENTOS[id];
    return `<label class="toggle-row compact depto">
      <span><b><i class="mon-cor" style="--c:${d.cor}"></i>${d.nome}</b><small>${d.descricao}</small></span>
      <input type="checkbox" class="switch" value="${id}"${cfg.departamentos?.includes(id) ? ' checked' : ''}>
    </label>`;
  }).join('');
  $('#sala-jogos').innerHTML = JOGOS_DA_SALA.map(([j, nome, desc]) => `<label class="toggle-row compact">
      <span><b>${nome}</b>${desc ? `<small>${desc}</small>` : ''}</span>
      <input type="checkbox" class="switch" value="${j}"${jogoLigado(j) ? ' checked' : ''}>
    </label>`).join('');
  const placar = cfg.placar || { titulo: '', itens: [] };
  $('#sala-config').elements.placarTitulo.value = placar.titulo || '';
  $('#placar-linhas').innerHTML = '';
  for (const it of placar.itens) linhaDoPlacar(it);
  mostrarEditorDoPlacar();
}

// ---------------------------------------------------- placar de metas (Sala Comercial)
function linhaDoPlacar(it = { nome: '', valor: '', meta: '' }) {
  const lista = $('#placar-linhas');
  if (lista.children.length >= 12) return;
  const div = document.createElement('div');
  div.className = 'placar-linha';
  div.innerHTML = `<input name="pnome" maxlength="24" placeholder="Nome">
    <input name="pvalor" type="number" min="0" step="any" placeholder="Vendido">
    <input name="pmeta" type="number" min="0" step="any" placeholder="Meta">
    <button type="button" class="icon-btn" data-remover aria-label="Tirar do placar">${icon('x', 14)}</button>`;
  div.querySelector('[name="pnome"]').value = it.nome || '';
  div.querySelector('[name="pvalor"]').value = it.valor === '' ? '' : it.valor;
  div.querySelector('[name="pmeta"]').value = it.meta === '' ? '' : it.meta;
  lista.appendChild(div);
}
// o que aparece no formulário depende do modo e dos departamentos marcados
const mostrarEditorDoPlacar = () => {
  const escritorio = $('#sala-config').querySelector('[name="modulo"]:checked')?.value === 'escritorio';
  $('#sala-deptos').hidden = !escritorio;
  $('#deptos-hint').hidden = !escritorio;
  $('#placar-editor').hidden = !(escritorio && $('#sala-deptos input[value="comercial"]')?.checked);
};
$('#sala-modulos').addEventListener('change', mostrarEditorDoPlacar);
$('#sala-deptos').addEventListener('change', mostrarEditorDoPlacar);
$('#placar-add').addEventListener('click', () => {
  linhaDoPlacar();
  formSujo = true;
  $('#placar-linhas').lastElementChild?.querySelector('input')?.focus();
});
$('#placar-linhas').addEventListener('click', (e) => {
  if (!e.target.closest('[data-remover]')) return;
  e.target.closest('.placar-linha').remove();
  formSujo = true;
});
const lerPlacar = () => ({
  titulo: $('#sala-config').elements.placarTitulo.value.trim(),
  itens: $$('#placar-linhas .placar-linha').map((l) => ({
    nome: l.querySelector('[name="pnome"]').value.trim(),
    valor: Number(l.querySelector('[name="pvalor"]').value) || 0,
    meta: Number(l.querySelector('[name="pmeta"]').value) || 0,
  })).filter((it) => it.nome),
});

// ---------------------------------------------------- sino (Sala Comercial)
let ultimoSino = 0;
function tocarSino() {
  if (!temSino()) return;
  if (Date.now() - ultimoSino < 8000) {
    toast('O sino acabou de tocar — espere uns segundos.', 'info', 2500);
    return;
  }
  socket.emit('sino');
}
$('#sino').addEventListener('click', (e) => {
  e.currentTarget.blur();
  tocarSino();
});

// ---------------------------------------------------- painéis do escritório (TI e central de telemarketing)
// dados de verdade: quantas pessoas estão em cada sala e quantas telas cada sala tem no ar
function atualizarPaineis() {
  if (!world.escritorio) return;
  const porSala = {};
  for (const u of state.users.values()) {
    const p = u.isSelf ? player.pos : u.avatar.group.position;
    const sala = world.salaEm(p.x, p.z);
    if (sala) porSala[sala] = (porSala[sala] || 0) + 1;
  }
  const telasPorSala = {};
  for (const t of telasNoAr()) {
    if (t.share.slot == null) continue;
    const sala = world.postoDaTela(t.share.slot)?.sala
      ?? world.planta?.salas.find((s) => t.share.slot >= s.primeiraTela && t.share.slot < s.primeiraTela + s.telas)?.id;
    if (sala) telasPorSala[sala] = (telasPorSala[sala] || 0) + 1;
  }
  const d = new Date();
  world.escritorio.status({
    empresa: state.sala?.empresa || '',
    pessoas: state.users.size,
    porSala,
    telasPorSala,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  });
}
setInterval(atualizarPaineis, 5000);

// a conexão caiu e voltou: o servidor esqueceu quem era dono, então prova de novo com a senha
function reentrarComoDono() {
  state.donoDaSala = false;
  if (!senhaDono) return renderSala();
  socket.emit('sala-entrar', { senha: senhaDono }, (r) => {
    state.donoDaSala = !!r?.ok;
    if (!r?.ok) senhaDono = null;
    renderSala();
  });
}

$('#sala-criar').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const senha = form.elements.senha.value;
  socket.emit('sala-dono', { senha }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para criar a senha.', 'error');
    senhaDono = senha;
    state.donoDaSala = true;
    form.reset();
    formSujo = false;
    renderSala();
    toast('Pronto: você é o dono desta sala. Guarde a senha — é com ela que se muda a sala depois.', 'success', 7000);
  });
});

$('#sala-entrar').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const senha = form.elements.senha.value;
  socket.emit('sala-entrar', { senha }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Senha errada.', 'error');
    senhaDono = senha;
    state.donoDaSala = true;
    form.reset();
    formSujo = false;
    renderSala();
  });
});

// as senhas têm botão próprio: digitar nelas não segura a config que chega dos outros
$('#sala-config').addEventListener('input', (e) => { if (e.target.type !== 'password') formSujo = true; });
$('#sala-config').addEventListener('click', (e) => {
  const b = e.target.closest('[data-todos]');
  if (!b) return;
  $$('#sala-jogos input').forEach((i) => { i.checked = b.dataset.todos === '1'; });
  formSujo = true;
});
$('#sala-config').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const cfg = {
    empresa: form.elements.empresa.value.trim(),
    modulo: form.querySelector('[name="modulo"]:checked')?.value || 'lazer',
    departamentos: $$('#sala-deptos input:checked').map((i) => i.value),
    jogos: Object.fromEntries($$('#sala-jogos input').map((i) => [i.value, i.checked])),
    placar: lerPlacar(),
    clima: form.elements.clima.value,
    horario: form.elements.horario.value,
  };
  socket.emit('sala-config', cfg, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para salvar.', 'error');
    formSujo = false;
    toast('Sala atualizada para todo mundo.', 'success');
  });
});
$('#sala-trocar').addEventListener('click', () => {
  const campo = $('#sala-config').elements.nova;
  const nova = campo.value;
  socket.emit('sala-senha', { nova }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para trocar a senha.', 'error');
    senhaDono = nova;
    campo.value = '';
    toast('Senha de dono trocada.', 'success');
  });
});

// senha de entrada: vale na hora, sem esperar o "Salvar para todos"
function mudarSenhaDeEntrada(senha) {
  const campo = $('#sala-config').elements.entrada;
  socket.emit('sala-entrada', { senha }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para mudar a senha da sala.', 'error');
    campo.value = '';
    toast(senha ? 'Senha da sala ligada. Mande a senha junto com o convite.' : 'Senha tirada: a sala está aberta.', 'success', 6000);
  });
}
$('#entrada-salvar').addEventListener('click', () => {
  const senha = $('#sala-config').elements.entrada.value;
  if (senha.length < 4) return toast('A senha da sala precisa ter pelo menos 4 caracteres.', 'warn');
  mudarSenhaDeEntrada(senha);
});
$('#entrada-tirar').addEventListener('click', () => mudarSenhaDeEntrada(''));
// Enter nos campos de senha aperta o botão ao lado, não o "Salvar para todos"
for (const [campo, botao] of [['entrada', '#entrada-salvar'], ['nova', '#sala-trocar']]) {
  $('#sala-config').elements[campo].addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    $(botao).click();
  });
}

// ------------------------------------------------------------------ mesa de trabalho
// Todas as telas lado a lado, como monitores. Ver mesa.js.
const mesa = new Mesa({
  raiz: $('#mesa'),
  controle,
  // os outros primeiro (agrupados por pessoa), as suas no fim
  telas: () => telasNoAr()
    .sort((a, b) => (a.user.isSelf - b.user.isSelf) || a.user.name.localeCompare(b.user.name) || ordemDasTelas(a.share, b.share))
    .map((t) => ({
      key: t.share.key,
      nome: t.user.isSelf ? 'Você' : t.user.name,
      onde: ondeEsta(t.share),
      cor: t.user.color,
      minha: t.user.isSelf,
      controle: podeControlar(t),
      semControle: porqueNaoControla(t),
      navega: navegavel(t),
      site: t.share.site,
      titulo: t.share.titulo,
      stream: shareVideo(t.share)?.srcObject ?? null,
    })),
  aoNavegar: navegar,
  aoCompartilhar: () => novaTela(),
  aoTelaCheia: async () => {
    const r = await toggleFullscreen();
    if (!r.ok) toast('O navegador não deixou entrar em tela cheia. Tente a tecla F11.', 'warn', 5000);
  },
  aoFechar: () => fecharMesa(true),
});
controle.atalho = (e, a) => mesa.atalho(e, a);

function abrirMesa() {
  if (!state.joined || mesa.aberta) return;
  if (state.focus) exitFocus();
  if (state.panel) closePanel();
  $('#share-pop').hidden = true;
  $('#react-pop').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  player.keys.clear(); // tecla que estava apertada não fica andando por trás
  mesa.abrir();
  syncTouchVisibility();
}

// olhar: devolve o mouse para a visão do boneco (Esc e o botão de voltar)
function fecharMesa(olhar) {
  if (!mesa.aberta) return;
  mesa.fechar();
  syncTouchVisibility();
  if (olhar) voltarAOlhar();
}

$('#btn-mesa').addEventListener('click', () => (mesa.aberta ? fecharMesa(true) : abrirMesa()));
$('#focus-mesa').addEventListener('click', abrirMesa);

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
  // um arquivo por vez; as abas/janelas compartilhadas continuam no ar
  if (state.castKey) stopShare(state.castKey, true);
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
  state.casting = true;
  const key = await publishShare(stream, { file: true, height: castVideo.videoHeight });
  if (!key) {
    stopCastVideo();
    return;
  }
  state.castKey = key;
  // depois do fim, dar play de novo cria trilhas novas no mesmo stream: repassa para todos
  stream.addEventListener('addtrack', (e) => {
    if (state.castKey !== key) return;
    rtc.replaceScreenTrack(key, e.track);
    self()?.shares.get(key)?.video?.play().catch(() => {}); // o stream ficou sem trilhas no fim e o <video> parou
  });
  $('#cast-title').textContent = file.name;
  updateShareButton();
  renderCast();
  // quem escolhe um filme quer ver no telão, não numa das telinhas
  if (state.main !== key) socket.emit('main', key);
  toast(`Transmitindo “${file.name}” no telão`);
}

function stopCastVideo() {
  state.casting = false;
  state.castKey = null;
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
$('#cast-stop').addEventListener('click', () => stopShare(state.castKey, true));
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

// decide qual stream é voz e qual é cada uma das telas da pessoa
function routeStreams(u) {
  const daTela = new Set([...u.shares.values()].map((sh) => sh.streamId));
  const vivo = (st) => st && st.getTracks().some((t) => t.readyState === 'live');
  let mic = null;
  for (const st of u.streams.values()) {
    if (!vivo(st) || daTela.has(st.id)) continue;
    if (!st.getVideoTracks().length && !mic) mic = st;
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
  for (const sh of u.shares.values()) {
    const st = u.streams.get(sh.streamId);
    if (vivo(st)) {
      if (!sh.video) sh.video = makeVideo(true);
      if (sh.video.srcObject !== st) {
        sh.video.srcObject = st;
        tocarTela(sh.video);
      }
    } else if (sh.video?.srcObject) {
      sh.video.srcObject = null;
    }
  }
  updateVolumes();
  refreshScreens();
}

function refreshScreens() {
  const telas = telasNoAr();
  const pinned = acharTela(state.main);
  // Fixou a tela de alguém no telão com um vídeo tocando: o vídeo vai para a tela dessa
  // pessoa (trocam de lugar). Antes o vídeo simplesmente sumia.
  const slotMidia = pinned && tv?.state.id && pinned.share.slot != null ? world.slots[pinned.share.slot] : null;
  world.slots.forEach((slot, i) => {
    const dono = telas.find((t) => t.share.slot === i);
    slot.owner = dono?.share.key ?? null;
    if (slot === slotMidia) {
      const meta = PROVIDERS[tv.state.provider];
      slot.setLabel(`${tv.label} · ${world.rotuloTela(i)}`, meta?.color);
      slot.setPlaceholder(tv.title || tv.label, 'Tocando aqui — chegue mais perto');
      slot.setMidia(true);
      return;
    }
    slot.setMidia(false);
    if (!dono) {
      slot.clearVideo();
      slot.setPlaceholder(world.rotuloTela(i), 'Livre — clique em “Compartilhar tela”');
      // posto com dono: o monitor do meio mostra de quem é
      const dp = slot.posto && slot.meio ? donoDoPosto(slot.posto) : null;
      slot.setLabel(dp ? (dp.isSelf ? 'Seu posto' : `Posto de ${dp.name}`) : null, dp?.color);
      return;
    }
    const { user: u, share: sh } = dono;
    const quem = u.isSelf ? 'Você' : u.name;
    slot.setLabel(slot.posto ? quem : `${quem} · ${world.rotuloTela(i)}`, u.color);
    const v = shareVideo(sh);
    if (v) slot.setVideo(v);
    else {
      slot.clearVideo();
      slot.setPlaceholder(u.name, 'Conectando à tela…');
    }
  });

  world.midiaNoSlot(slotMidia);

  // o telão do cinema e o da pista mostram sempre a mesma coisa
  for (const ms of world.telaoes) {
    ms.owner = null;
    ms.setLabel(null);
    if (pinned) {
      const { user: u, share: sh } = pinned;
      ms.owner = sh.key;
      ms.setLabel(u.isSelf ? 'Você' : u.name, u.color);
      const v = shareVideo(sh);
      if (v) ms.setMode('share', v);
      else {
        ms.setMode('empty');
        ms.setPlaceholder(u.name, 'Conectando à tela…');
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
  const midiaVisivel = ms.mode === 'media' || !!slotMidia;
  tv?.setHidden(!midiaVisivel);

  if (state.focus?.kind === 'tv' && !midiaVisivel) exitFocus();
  if (state.focus?.kind === 'share' && !shareVideo(acharTela(state.focus.key)?.share)) exitFocus();
  renderMainSources();
  mesa.atualizar();
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
    for (const sh of u.shares.values()) if (sh.video) sh.video.volume = settings.screen / 100;
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
  const telas = telasNoAr().sort((a, b) => ordemDasTelas(a.share, b.share));
  const playing = !!tv?.state.id;
  const color = playing ? PROVIDERS[tv.state.provider]?.color : 'var(--muted)';
  const sub = playing ? (tv.title || 'Carregando…') : 'Nada tocando';
  $('#main-sources').innerHTML = [
    `<button type="button" class="source${state.main === 'media' ? ' on' : ''}" data-src="media"><span class="sdot" style="--c:${color}"></span>${playing ? esc(tv.label) : 'Player'}<small>${esc(sub.slice(0, 26))}</small></button>`,
    ...telas.map(({ user: u, share: sh }) => `<button type="button" class="source${state.main === sh.key ? ' on' : ''}" data-src="${esc(sh.key)}"><span class="sdot" style="--c:${esc(u.color)}"></span>${sh.file ? 'Seu vídeo' : `Tela de ${esc(u.isSelf ? 'você' : u.name)}`}<small>${ondeEsta(sh)}</small></button>`),
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
  if (!jogoLigado('parkour')) {
    toast('O parkour está desligado nesta sala.', 'info', 2600);
    return;
  }
  const start = world.colliders.find((c) => c.data.type === 'start');
  teleportToCollider(start, Math.PI);
}

// ------------------------------------------------------------------ sentar
const TIPOS_ASSENTO = new Set(['sofa', 'puff']);
function assentoAtual() {
  if (!player.grounded) return null;
  return TIPOS_ASSENTO.has(player.ground?.data?.type) ? player.ground : null;
}

// No escritório dá para sentar só chegando perto da cadeira ou do sofá (não precisa subir nele).
function lugarPerto() {
  if (!player.grounded || player.veiculo) return null;
  return world.assentoPerto(player.pos.x, player.pos.z);
}

function toggleSit() {
  if (player.sitting) {
    player.stand();
    return;
  }
  const lugar = lugarPerto();
  if (lugar) return sentarNoLugar(lugar);
  const assento = assentoAtual();
  if (assento) player.sit(assento);
  else toast(world.escritorio ? 'Chegue perto de uma cadeira ou sofá para sentar.' : 'Fique em cima de um sofá ou pufe para sentar.', 'info', 2600);
}

// Cadeira de posto de trabalho: se o posto está livre, fica sendo seu — o que você compartilhar
// estando nesta sala aparece nos 3 monitores dele, e quem passar (até de fora, pelo vidro) vê.
function sentarNoLugar(lugar) {
  player.sentarEm(lugar);
  if (!lugar.posto || self()?.posto === lugar.posto) return;
  socket.emit('posto', { id: lugar.posto }, (r) => {
    if (r?.ok) toast(`${rotuloDoPosto(lugar.posto)} agora é seu: compartilhe a tela e ela aparece nestes 3 monitores. Mire num monitor e aperte E para controlar.`, 'info', 6000);
    else if (r?.dono) toast(`Este posto é de ${r.dono}. Pode sentar, mas suas telas não vão para estes monitores.`, 'info', 4500);
    else if (r?.erro) toast(r.erro, 'error');
  });
}

function donoDoPosto(id) {
  for (const u of state.users.values()) if (u.posto === id) return u;
  return null;
}

function updateSitHint() {
  const podeSentar = !player.sitting && !!(lugarPerto() || assentoAtual()) && !state.focus && !state.panel;
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

// No carro, "voltar" põe o carro de novo na pista, no ponto mais perto e virado para a frente
// (atolou na grama, bateu numa árvore, se perdeu). Teleportar para onde já estava na pista
// não conta como cortar caminho.
function voltarParaPista() {
  const { t } = projetar(player.pos.x, player.pos.z);
  const p = pontoEm(t);
  player.teleport([p.x, PISTA.y, p.z], p.angulo + Math.PI);
  flashRace('De volta à pista');
}

function respawn() {
  if (player.veiculo) {
    voltarParaPista();
    return;
  }
  if (run.state !== 'idle' && run.checkpoint && run.checkpoint.data.type !== 'start') {
    teleportToCollider(run.checkpoint);
    flashPk('De volta ao checkpoint');
  } else if (world.modo === 'escritorio') {
    irParaEntrada();
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
  if (!player.veiculo && !jogoLigado('corrida')) {
    toast('A pista de corrida está desligada nesta sala.', 'info', 2600);
    return;
  }
  const virou = player.setVeiculo(!player.veiculo);
  if (!virou) return;
  if (player.veiculo && player.voando) {
    player.voando = false;
    poderesMudaram();
  }
  sfx.teleport();
  if (player.veiculo) {
    toast(isTouch
      ? 'Modo carro: pedais à direita aceleram e freiam, o analógico é o volante. O botão de correr é o turbo.'
      : 'Modo carro: W acelera, S freia, A/D viram. Shift é turbo. R volta para a pista.', 'info', 5000);
  }
  atualizarHudCorrida();
  if (touchPad) touchPad.showCarro?.(player.veiculo);
}

function irParaLargada() {
  if (!jogoLigado('corrida')) {
    toast('A pista de corrida está desligada nesta sala.', 'info', 2600);
    return;
  }
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

function updateFightHud(health, emRingue) {
  const inRing = emRingue && jogoLigado('ringue'); // ringue desligado: lá é chão como outro qualquer
  const hud = $('#fight-hud');
  const v = Math.max(0, Math.min(1, health / COMBAT.maxHealth));
  // a porradaria vale no mapa todo: fora do ringue a barra aparece quando você apanha
  hud.hidden = !(inRing || v < 1 || combat.knockedOut);
  $('#fh-label').textContent = inRing ? 'Ringue' : 'Vida';
  localAvatar.setHealth(v);
  socket?.emit('health', v);
  if (hud.hidden) return;
  $('#fh-fill').style.width = `${v * 100}%`;
  hud.classList.toggle('hurt', v <= 0.55 && v > 0.28);
  hud.classList.toggle('danger', v <= 0.28);
  hud.classList.toggle('ko', combat.knockedOut);
  $('#fh-hint').innerHTML = combat.knockedOut
    ? 'Nocauteado…'
    : isTouch ? 'Toque na luva para socar' : `<kbd>F</kbd> soca${temArma() ? ' · <kbd>X</kbd> atira' : ''}`;
}

// ------------------------------------------------------------------ arma (camiseta 22)
// O servidor confere a camiseta de novo: isto aqui é só para não mostrar o que não vale.
function temArma() { return settings.shirt === 'bolsonaro' && jogoLigado('armas'); }

const _tmpTiro = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _origemTiro = new THREE.Vector3();
const _direita = new THREE.Vector3();
const _raioTiro = new THREE.Raycaster();
const tiros = [];
const tiroGeo = new THREE.BoxGeometry(0.05, 0.05, 1);

// ------------------------------------------------------------------ armas (armas.js)
// A arma na tela em 1ª pessoa precisa da câmera na cena (filhos da câmera só aparecem assim).
world.scene.add(world.camera);
const visaoArma = new VisaoArma(world.camera);
iniciarCapsulas(world.scene);
// gatilho: segurar X (ou o botão esquerdo com o mouse preso, ou o botão de tiro no toque)
// dispara sem parar nas automáticas; nas outras, um tiro por aperto
let gatilho = false;
function puxarGatilho() {
  atirar();
  gatilho = true;
}
function soltarGatilho() {
  gatilho = false;
}
window.addEventListener('keyup', (e) => { if (e.code === 'KeyX') soltarGatilho(); });
document.addEventListener('mouseup', (e) => { if (e.button === 0) soltarGatilho(); });
window.addEventListener('blur', soltarGatilho);

function atualizarArmas(dt) {
  const fp = player.mode === 'first' && !luneta && temArma() && !player.veiculo && !player.sitting && !state.focus && !combat.knockedOut && !player.override;
  if (fp && visaoArma.tipo !== settings.arma) visaoArma.setTipo(settings.arma);
  visaoArma.update(dt, {
    visivel: fp,
    andando: player.grounded ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 7) : 0.2,
    yaw: player.yaw,
    pitch: player.pitch,
    chao: player.pos.y,
  });
  atualizarCapsulas(dt);
  if (gatilho && temArma() && defArma(settings.arma).auto) atirar();
}

// escolha da arma no modal do personagem (só aparece para quem anda armado)
function renderArmas() {
  const linha = $('#ep-linha-arma');
  linha.hidden = settings.shirt !== 'bolsonaro' || (state.sala && !jogoLigado('armas'));
  if (linha.hidden) return;
  $('#ep-arma').innerHTML = IDS_ARMAS.map((id) => `<button type="button" data-arma="${id}" class="${id === settings.arma ? 'on' : ''}" title="${ARMAS[id].auto ? 'Automática: segure para rajada' : 'Um tiro por aperto'}">${ARMAS[id].nome}</button>`).join('');
}
function mudarArma(tipo) {
  if (!IDS_ARMAS.includes(tipo) || tipo === settings.arma) return;
  settings.arma = tipo;
  saveSettings();
  if (tipo !== 'sniper') ligarLuneta(false);
  localAvatar.setArma(localAvatar.armado, tipo);
  renderArmas();
  poderesMudaram();
  if (socket && state.joined) socket.emit('arma', tipo);
}
// ------------------------------------------------------------------ luneta da sniper
// Segurar o botão direito (ou Z, que liga e desliga; no toque, o botão da mira): a câmera vai
// para a 1ª pessoa com zoom de luneta, a mira fica mais fina e balança de leve com a respiração.
const FOV_LUNETA = 13;
let luneta = false;
let antesDaLuneta = null; // { modo, fov, sens }
let balancoLuneta = { x: 0, y: 0 };
const temSniper = () => temArma() && settings.arma === 'sniper';
function ligarLuneta(on) {
  if (on && (luneta || !temSniper() || state.focus || player.veiculo || player.sitting || combat.knockedOut || !state.joined)) return;
  if (!on && !luneta) return;
  luneta = on;
  const cam = world.camera;
  if (on) {
    antesDaLuneta = { modo: player.mode, fov: cam.fov, sens: player.sensitivity };
    player.mode = 'first';
    cam.fov = FOV_LUNETA;
    player.sensitivity = antesDaLuneta.sens * 0.22;
    balancoLuneta = { x: 0, y: 0 };
    sfx.engatilhar(0.35);
  } else {
    player.mode = antesDaLuneta.modo;
    cam.fov = antesDaLuneta.fov;
    player.sensitivity = antesDaLuneta.sens;
    // tira o balanço que ficou somado na mira
    player.yaw -= balancoLuneta.x;
    player.pitch -= balancoLuneta.y;
  }
  cam.updateProjectionMatrix();
  $('#luneta').hidden = !on;
  $('#crosshair').classList.toggle('luneta-on', on);
  document.body.classList.toggle('com-luneta', on);
  touchPad?.setPoderes({ voando: player.voando, puloAlto: player.puloAlto, armado: temArma(), sniper: temSniper(), luneta });
}
// respiração: um oito bem lento somado à mira (e tirado ao sair)
function balancarLuneta(t) {
  if (!luneta) return;
  const x = Math.sin(t * 0.9) * 0.0022 + Math.sin(t * 2.3) * 0.0007;
  const y = Math.sin(t * 1.8) * 0.0014;
  player.yaw += x - balancoLuneta.x;
  player.pitch += y - balancoLuneta.y;
  balancoLuneta = { x, y };
  // a luneta não combina com sentar, dirigir, focar numa tela ou cair nocauteado
  if (!temSniper() || state.focus || player.veiculo || player.sitting || combat.knockedOut) ligarLuneta(false);
}
document.addEventListener('mousedown', (e) => {
  if (e.button === 2 && document.pointerLockElement === world.canvas && temSniper()) ligarLuneta(true);
});
document.addEventListener('mouseup', (e) => { if (e.button === 2) ligarLuneta(false); });
world.canvas.addEventListener('contextmenu', (e) => { if (temSniper()) e.preventDefault(); });

$('#ep-arma').addEventListener('click', (e) => {
  const b = e.target.closest('[data-arma]');
  if (b) mudarArma(b.dataset.arma);
});
$('#ep-arma').addEventListener('pointerover', (e) => {
  const b = e.target.closest('[data-arma]');
  if (b) preCarregarArma(b.dataset.arma);
});
const flashTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,248,200,1)');
  g.addColorStop(0.4, 'rgba(255,190,80,0.8)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// traçante amarelo da arma até onde a bala parou (o clarão de verdade sai do modelo da arma;
// este brilho pequeno só marca a origem). semClarao: os outros chumbos da escopeta
function desenharTiro(de, ate, semClarao = false) {
  const a = new THREE.Vector3(...de);
  const b = new THREE.Vector3(...ate);
  const risco = new THREE.Mesh(tiroGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, toneMapped: false }));
  risco.position.copy(a).add(b).multiplyScalar(0.5);
  risco.scale.set(1, 1, Math.max(0.01, a.distanceTo(b)));
  risco.lookAt(b);
  const clarao = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, toneMapped: false }));
  clarao.position.copy(a);
  clarao.scale.setScalar(semClarao ? 0.001 : 0.45);
  world.scene.add(risco, clarao);
  tiros.push({ risco, clarao, vida: 0.12 });
}

function atualizarTiros(dt) {
  for (let i = tiros.length - 1; i >= 0; i--) {
    const t = tiros[i];
    t.vida -= dt;
    t.risco.material.opacity = Math.max(0, t.vida / 0.12);
    t.clarao.material.opacity = Math.max(0, t.vida / 0.12);
    if (t.vida <= 0) {
      t.risco.removeFromParent();
      t.clarao.removeFromParent();
      t.risco.material.dispose();
      t.clarao.material.dispose();
      tiros.splice(i, 1);
    }
  }
}

function atirar() {
  if (!temArma()) {
    toast('Arma só para quem escolheu a camiseta 22.', 'info', 2600);
    return;
  }
  if (player.veiculo || player.sitting || state.focus || !state.joined) return;
  const cam = world.camera;
  cam.getWorldDirection(_camDir);
  // o raio sai da mira, mas da altura do boneco para a frente: em 3ª pessoa a câmera fica
  // atrás, e acertaria quem estivesse entre ela e você
  const frente = Math.max(0, _tmpTiro.copy(player.pos).sub(cam.position).dot(_camDir));
  _origemTiro.copy(cam.position).addScaledVector(_camDir, frente);
  const def = defArma(settings.arma);
  const r = combat.atirar({
    origem: _origemTiro,
    dir: _camDir,
    arma: def.id,
    bloqueado: (o, d, max) => {
      _raioTiro.set(o, d);
      _raioTiro.far = max;
      const h = _raioTiro.intersectObjects(world.cameraBlockers, false)[0];
      return h ? h.distance : null;
    },
  });
  if (!r) return; // cadência ou nocauteado
  // vira o corpo para onde atirou: os outros veem o braço apontando para lá
  player.bodyYaw = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
  localAvatar.atirar();
  visaoArma.disparar();
  player.addShake(def.coice * 0.18);
  // o traçante sai da boca do cano: na 1ª pessoa, a da arma na tela; na 3ª, da frente do peito,
  // à direita, tão longe quanto o cano da arma
  _direita.crossVectors(_camDir, cam.up).normalize();
  const de = new THREE.Vector3();
  if (visaoArma.raiz.visible && visaoArma.arma) visaoArma.arma.userData.ponta.getWorldPosition(de);
  else de.set(player.pos.x, player.pos.y + (def.apoio ? 1.38 : 1.3), player.pos.z).addScaledVector(_camDir, 0.3 + def.comprimento * 0.75).addScaledVector(_direita, def.apoio ? 0.2 : 0.3);
  const arred = (v) => v.toArray().map((n) => Math.round(n * 100) / 100);
  desenharTiro(arred(de), arred(r.ponto));
  const mais = r.pontos.slice(1).map(arred);
  for (const p of mais) desenharTiro(arred(de), p, true);
  sfx.tiro(1, def.som);
  if (def.engatilhar) setTimeout(() => sfx.engatilhar(), 170);
  sfx.capsula(0.8);
  if (r.alvo) sfx.punchHit();
  socket?.emit('tiro', { to: r.alvo?.id ?? null, dir: r.dirXZ, de: arred(de), ate: arred(r.ponto), mais, n: r.n });
}

// ------------------------------------------------------------------ poderes
function toggleVoar() {
  if (!player.voando && !jogoLigado('poderes')) {
    toast('Os poderes estão desligados nesta sala.', 'info', 2600);
    return;
  }
  if (player.veiculo) {
    toast('Saia do carro para voar.', 'info', 2600);
    return;
  }
  player.voando = !player.voando;
  if (player.voando && player.sitting) player.stand();
  poderesMudaram();
  toast(player.voando
    ? (isTouch ? 'Voando! O botão de pulo sobe e a seta para baixo desce.' : 'Voando! Espaço sobe, C desce, Shift acelera. Q desliga.')
    : 'Voo desligado.', 'info', 3600);
}

function togglePuloAlto() {
  if (!player.puloAlto && !jogoLigado('poderes')) {
    toast('Os poderes estão desligados nesta sala.', 'info', 2600);
    return;
  }
  player.puloAlto = !player.puloAlto;
  poderesMudaram();
  toast(player.puloAlto ? `Pulo alto ligado${isTouch ? '' : ' (J desliga)'}.` : 'Pulo alto desligado.', 'info', 2600);
}

function poderesMudaram() {
  // com poder ligado o parkour não vale: a corrida em andamento é cancelada
  if ((player.voando || player.puloAlto) && run.state !== 'idle') {
    run.cancel();
    hideParkourHud();
    world.resetCheckpoints();
    toast('Com poder ligado o parkour não conta: corrida cancelada.', 'warn', 4000);
  }
  if (!temSniper()) ligarLuneta(false);
  touchPad?.setPoderes({ voando: player.voando, puloAlto: player.puloAlto, armado: temArma(), sniper: temSniper(), luneta });
  $('#help-luneta').hidden = !temSniper();
  const ativos = [player.voando && '🪽 Voando', player.puloAlto && '⬆ Pulo alto'].filter(Boolean);
  $('#poderes-hud').hidden = !ativos.length;
  $('#poderes-hud').textContent = ativos.join('  ·  ');
  $('#help-tiro').hidden = !temArma();
}

function punch() {
  if (!jogoLigado('ringue')) return;
  if (combat.punch()) {
    localAvatar.punch();
    sfx.punchSwing(); // o som de acerto vem depois, pelo onHitLanded
  }
}

function goToRing() {
  if (!jogoLigado('ringue')) {
    toast('O ringue está desligado nesta sala.', 'info', 2600);
    return;
  }
  const c = ringCorners()[0];
  run.abandon();
  player.teleport(c, Math.atan2(RING.x - c[0], RING.z - c[2]) + Math.PI);
}
$('#ring-go').addEventListener('click', () => { goToRing(); closePanel(); });

// ------------------------------------------------------------------ xadrez de bruxo e dama
const jogos = new Jogos({
  world,
  player,
  toast,
  emitir: (ev, data, ack) => (ack ? socket?.emit(ev, data, ack) : socket?.emit(ev, data)),
  selfId: () => state.selfId,
  nomeDe: (id) => state.users.get(id)?.name,
});
function irParaMesa(mesa) {
  if (!jogoLigado(mesa)) {
    toast('Esse jogo está desligado nesta sala.', 'info', 2600);
    return;
  }
  run.abandon();
  if (player.veiculo) toggleVeiculo();
  exitFocus();
  const [x, y, z] = jogos.mesas[mesa].posComandante(0);
  player.teleport([x, y, z + 2.5], 0);
  sfx.teleport();
  closePanel();
}
$('#jogos-xadrez').addEventListener('click', () => irParaMesa('xadrez'));
$('#jogos-dama').addEventListener('click', () => irParaMesa('dama'));
$('#jogos-velha').addEventListener('click', () => irParaMesa('velha'));
$('#jogos-dados').addEventListener('click', () => {
  run.abandon();
  if (player.veiculo) toggleVeiculo();
  exitFocus();
  player.teleport([MESA_DADOS.x, 0.15, MESA_DADOS.z + 6.5], 0);
  sfx.teleport();
  closePanel();
});

// ------------------------------------------------------------------ moedas e mesa de dados
function mostrarMoedas(pulo = false) {
  const n = self()?.moedas ?? 0;
  $('#moedas-n').textContent = n;
  $('#moedas-n2').textContent = n;
  if (dados.ativo) dados.atualizarHud();
  if (pulo) {
    const chip = $('#moedas-chip');
    chip.classList.remove('pulo');
    void chip.offsetWidth; // reinicia a animação
    chip.classList.add('pulo');
  }
}

// a mesa de dados é uma área do mundo: o dono da sala pode desligar (World.ligarArea)
const dados = world.area('dados', () => new Dados({
  world,
  player,
  toast,
  emitir: (ev, data, ack) => socket?.emit(ev, data, ack),
  selfId: () => state.selfId,
  saldo: () => self()?.moedas ?? 0,
  aoTerminar: (ev) => {
    const u = state.users.get(ev.id);
    if (!u) return;
    if (ev.aposta) u.moedas = ev.moedas;
    if (u.isSelf && ev.aposta) {
      mostrarMoedas(true);
      toast(ev.ganhou ? `Deu ${ev.a + ev.b}! Você ganhou ${ev.delta} moedas` : `Deu ${ev.a + ev.b}. Perdeu ${-ev.delta} moedas`, ev.ganhou ? 'success' : 'info', 4000);
    }
    renderPeople();
  },
}));
$('#dh-sair').addEventListener('click', sairDoFoco);
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
      const u = acharTela(screen.owner)?.user;
      return { kind: 'share', key: screen.owner, label: `Ver a tela de ${u?.isSelf ? 'você' : u?.name}` };
    }
    return null;
  }
  if (screen.midia) return { kind: 'tv', screen, label: `Focar no vídeo (${tv?.label ?? 'vídeo'})` };
  const t = acharTela(screen.owner);
  if (t && shareVideo(t.share)) return { kind: 'share', key: t.share.key, label: t.user.isSelf ? 'Ver sua tela' : `Ver a tela de ${t.user.name}` };
  return null;
}

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

// escolhe a tela que está na mira (ou a mais próxima da direção do olhar)
function pickScreen() {
  const cam = world.camera;
  raycaster.setFromCamera(screenCenter, cam);
  raycaster.far = 140;
  const alcance = (s, d) => s.w >= 3 || d < 14;
  const hit = raycaster.intersectObjects(world.screens.map((s) => s.surface), false)[0];
  if (hit && alcance(hit.object.userData.screen, hit.distance) && screenInfo(hit.object.userData.screen)) return hit.object.userData.screen;
  cam.getWorldDirection(_fwd);
  let best = null;
  let bestScore = 1.25;
  for (const s of world.screens) {
    if (!screenInfo(s)) continue;
    s.surface.getWorldPosition(_to).sub(cam.position);
    const dist = _to.length();
    if (dist > 140 || (s.w < 3 && dist > 5)) continue;
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
  const perto = state.focus ? null : jogos.maisPerto(player.pos);
  const mesa = perto && jogoLigado(perto) ? perto : null; // mesa desligada pelo dono da sala some
  const naMesaDeDados = !state.focus && !mesa && jogoLigado('dados') && dados.perto(player.pos);
  const info = state.focus ? null
    : mesa ? { kind: 'jogo', mesa, label: jogos.rotulo(mesa) }
      : naMesaDeDados ? { kind: 'dados', label: 'Apostar nos dados' } : screenInfo(pickScreen());
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
  fecharMesa(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (info.kind === 'dados') {
    state.focus = { kind: 'dados' };
    if (player.sitting) toggleSit();
    if (player.veiculo) toggleVeiculo();
    dados.entrar();
    recolherPainel('#dados-hud', isTouch);
    $('#hover-hint').hidden = true;
    syncTouchVisibility();
    return;
  }
  if (info.kind === 'jogo') {
    state.focus = { kind: 'jogo' };
    if (player.sitting) toggleSit();
    if (player.veiculo) toggleVeiculo();
    jogos.entrar(info.mesa);
    recolherPainel('#jogo-hud', isTouch);
    $('#hover-hint').hidden = true;
    syncTouchVisibility();
    return;
  }
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
  const t = acharTela(info.key);
  const v = shareVideo(t?.share);
  if (!v) return;
  state.focus = { kind: 'share', key: t.share.key };
  const fv = $('#focus-video');
  fv.srcObject = v.srcObject;
  fv.play().catch(() => {});
  updateFocusPin();
  updateFocusCtrl();
  $('#focus').hidden = false;
  syncTouchVisibility();
}

// Painel do jogo recolhido: só título, vez e mensagem — o resto do tabuleiro fica livre para tocar.
// No celular ele abre recolhido; o botão ao lado do Sair (ou tocar no título) abre e fecha.
function recolherPainel(sel, recolher) {
  const hud = $(sel);
  hud.classList.toggle('min', recolher);
  const b = hud.querySelector('.hud-min');
  b.setAttribute('aria-expanded', String(!recolher));
  b.title = recolher ? 'Abrir o painel' : 'Recolher o painel';
}
for (const sel of ['#jogo-hud', '#dados-hud']) {
  $(sel).addEventListener('click', (e) => {
    if (e.target.closest('.hud-min, .jh-head > b')) recolherPainel(sel, !$(sel).classList.contains('min'));
  });
}

function updateFocusPin() {
  if (state.focus?.kind !== 'share') return;
  const pinned = state.main === state.focus.key;
  $('#focus-pin').innerHTML = `${icon('pin', 16)}${pinned ? 'Tirar do telão' : 'Pôr no telão'}`;
}

function exitFocus() {
  if (!state.focus) return;
  if (state.focus.kind === 'jogo') {
    jogos.sair();
  } else if (state.focus.kind === 'dados') {
    dados.sair();
  } else if (state.focus.kind === 'tv') {
    player.override = null;
    world.travarTelao(null);
    document.body.classList.remove('tv-focus');
    tv.interactive = false;
    // o iframe do navegador segura o teclado: devolve para o jogo
    if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
    $('#tv-focus-hud').hidden = true;
    $('#crosshair').hidden = false;
  } else {
    controle.remover($('#focus-video'));
    $('#focus').hidden = true;
    $('#focus-video').srcObject = null;
    if (document.fullscreenElement === $('#focus')) document.exitFullscreen().catch(() => {});
  }
  state.focus = null;
  syncTouchVisibility();
}

// Saída pedida pela pessoa (Esc, E, botão de fechar): além de sair, o mouse já volta a girar a
// visão do boneco, sem precisar clicar na sala de novo.
function sairDoFoco() {
  exitFocus();
  voltarAOlhar();
}

$('#focus-close').addEventListener('click', sairDoFoco);
$('#jh-sair').addEventListener('click', sairDoFoco);
$('#tv-focus-exit').addEventListener('click', sairDoFoco);
$('#focus-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#focus').requestFullscreen().catch(() => {});
});
$('#focus-pin').addEventListener('click', () => {
  if (state.focus?.kind === 'share') togglePin(state.focus.key);
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

// o analógico e os botões só aparecem quando dá pra andar de verdade (com o telão em foco
// eles ficariam por cima do vídeo, atrapalhando tocar nos controles do player)
function syncTouchVisibility() {
  if (!touchPad) return;
  const livre = state.joined && !state.panel && !state.focus && !mesa.aberta && !document.body.classList.contains('salas-abertas');
  touchPad.show(livre);
  if (!livre) touchPad.reset();
}

function updateFullscreenButton() {
  const cheia = isFullscreen();
  $('#tb-full')?.classList.toggle('on', cheia);
  const b = $('#btn-full');
  b.classList.toggle('on', cheia);
  b.dataset.tip = cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia (esconde as barras do Chrome)';
}
document.addEventListener('fullscreenchange', updateFullscreenButton);

// Tela cheia no computador. Além de dar mais espaço, some com as barras "Compartilhando …
// com esta guia" que o Chrome põe no topo a cada aba compartilhada — site nenhum consegue
// tirar essas barras, mas em tela cheia o Chrome esconde tudo lá de cima.
if (!temTelaCheia) $('#btn-full').hidden = true;
$('#btn-full').addEventListener('click', async () => {
  const r = await toggleFullscreen();
  if (!r.ok) toast('O navegador não deixou entrar em tela cheia. Tente a tecla F11.', 'warn', 5000);
});

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
$('#btn-view').addEventListener('click', toggleView);
$('#btn-react').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#react-pop').hidden = !$('#react-pop').hidden;
});
$('#react-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emote]');
  if (b) sendEmote(b.dataset.emote);
});
// fecha cada menu ao clicar fora dele (composedPath: o clique pode ter redesenhado o menu)
document.addEventListener('click', (e) => {
  const caminho = e.composedPath();
  for (const id of ['#react-pop', '#share-pop']) {
    const pop = $(id);
    if (!caminho.includes(pop.parentElement)) pop.hidden = true;
  }
});
$('#btn-leave').addEventListener('click', () => {
  pararTodasAsTelas(true);
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
  ligarLuneta(false);
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
bindToggle('#set-sfx', 'sfx', (on) => setSfxEnabled(on));
bindToggle('#set-fps', 'mostrarFps', (on) => { $('#fps').hidden = !on; });
$('#fps').hidden = !settings.mostrarFps;

// qualidade gráfica (ver qualidade.js)
const DICAS_QUALIDADE = {
  alta: 'Tudo no máximo: sombra nítida, mais luzes e a floresta inteira.',
  media: 'Sombra mais simples, menos luzes e menos mato ao longe.',
  baixa: 'Para PC fraco e celular: sem sombra, resolução menor e floresta rala.',
};
function renderQualidade() {
  $$('#set-qualidade button').forEach((b) => b.classList.toggle('on', b.dataset.value === qualidade.modo));
  const n = NIVEIS[qualidade.efetivo];
  const res = qualidade.escala < 0.999 ? ` · resolução em ${Math.round(qualidade.escala * 100)}%` : '';
  let dica = qualidade.modo === 'auto'
    ? `Agora: ${n.nome}${res}. Ajusta sozinha para ficar em 60 quadros por segundo.`
    : DICAS_QUALIDADE[qualidade.modo];
  // antialias (bordas sem serrilhado) só muda ao recarregar
  if (n.antialias !== world.renderer.getContextAttributes().antialias) dica += ' As bordas mudam ao recarregar a página.';
  $('#qualidade-hint').textContent = dica;
}
renderQualidade();
$('#set-qualidade').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  settings.qualidade = b.dataset.value;
  saveSettings();
  qualidade.definirModo(b.dataset.value);
  renderQualidade();
});

function renderShareMode() {
  $$('#set-share-mode button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.shareMode));
  const preset = SHARE_PRESETS[settings.shareMode] || SHARE_PRESETS.detail;
  const dicas = {
    detail: 'Para código, planilhas, slides: imagem nítida a 30 quadros — e 60 enquanto alguém controla a tela.',
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
    if (compartilhando()) {
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
    // Esc sai de vez (mesmo controlando a tela) e devolve o mouse para a visão do boneco
    if (typing()) document.activeElement.blur();
    else if (guia.aberto) guia.fechar();
    else if (escolha.aberto) escolha.fechar();
    else if (mesa.aberta) fecharMesa(true);
    else if (state.focus) sairDoFoco();
    else if (!$('#react-pop').hidden) $('#react-pop').hidden = true;
    else if (state.panel) closePanel();
    else run.abandon(); // preso no parkour? Esc sai da corrida
    return;
  }
  if (typing() || e.repeat || guia.aberto || escolha.aberto) return;
  // comandando um tabuleiro: as teclas de andar/voar/socar ficam com o jogo
  if ((state.focus?.kind === 'jogo' || state.focus?.kind === 'dados') && !['KeyE', 'KeyM', 'KeyT', 'Enter'].includes(e.code)) return;
  switch (e.code) {
    case 'KeyE':
      if (state.focus) sairDoFoco();
      else if (state.hovered) enterFocus(state.hovered);
      break;
    case 'Tab':
      e.preventDefault();
      abrirMesa();
      break;
    case 'KeyR':
      if (!state.focus) respawn();
      break;
    case 'KeyV':
      toggleView();
      break;
    case 'KeyB':
      tocarSino(); // Sala Comercial: fechei uma venda
      break;
    case 'KeyF':
      punch();
      break;
    case 'KeyC':
      if (!player.voando) toggleSit(); // voando, C é descer
      break;
    case 'KeyQ':
      toggleVoar();
      break;
    case 'KeyJ':
      togglePuloAlto();
      break;
    case 'KeyX':
      puxarGatilho();
      break;
    case 'KeyZ':
      if (temSniper()) ligarLuneta(!luneta);
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

function lockPointer(avisar = false) {
  try {
    const p = world.canvas.requestPointerLock?.();
    p?.catch?.(() => {
      if (avisar) toast('Clique na sala para voltar a mexer a visão.', 'info', 2600);
    });
  } catch { /* ignorado */ }
}

// Depois de sair de uma tela, mesa ou jogo: trava o mouse de novo na visão do boneco.
// O Chrome deixa travar sem clique quando foi a própria página que destravou (e foi: entrar
// numa tela destrava). Se mesmo assim ele recusar, o aviso pede um clique.
function voltarAOlhar() {
  if (isTouch || !state.joined || state.panel || state.focus || mesa.aberta) return;
  if (document.pointerLockElement === world.canvas) return;
  lockPointer(true);
}

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== world.canvas || e.button !== 0) return;
  // dentro do ringue o botão esquerdo é o soco; fora dele continua focando telas
  if (combat.inRing && !state.focus) punch();
  else if (state.hovered) enterFocus(state.hovered);
  else if (temArma()) puxarGatilho();
});

// Ponto de inspeção para testes automatizados. Só existe com ?debug=1 na URL —
// em uso normal nada disso fica exposto.
if (params.get('debug') === '1') {
  window.__sala3d = {
    state, player, combat, run, corrida, world, settings, punch, goToRing, respawn,
    toggleVeiculo, irParaLargada, jogos, irParaMesa, exitFocus, dados,
    tocarTela, telasMudas, liberarSomDasTelas, makeVideo, mesa, controle, abrirMesa, fecharMesa, marcaDaAba,
    publishShare, stopShare, acharTela, telasNoAr, get rtc() { return rtc; }, clima, ligarLuneta,
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
  $('#clima-chip').textContent = clima.rotulo();
  updateVolumes();
  if (settings.mostrarFps) {
    const res = qualidade.escala < 0.999 ? ` ${Math.round(qualidade.escala * 100)}%` : '';
    $('#fps').textContent = `${Math.round(qualidade.fps)} FPS · ${NIVEIS[qualidade.efetivo].nome}${res}`;
  }
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
  const dtMs = now - lastFrame;
  const dt = Math.min(dtMs / 1000, 0.05);
  lastFrame = now;
  elapsed += dt;
  const t = elapsed;
  world.update(t);
  clima.update(dt, t);
  balancarLuneta(t);

  if (state.joined) {
    player.update(dt);
    // com poder ligado o parkour nem começa (pular alto/voar até o camarote não é recorde)
    if (player.voando || player.puloAlto) {
      if (run.state !== 'idle') {
        run.cancel();
        hideParkourHud();
      }
    } else if (jogoLigado('parkour')) {
      run.update(dt, player.grounded ? player.ground : null);
    }
    if (run.state === 'running') setPkTime(run.time);
    combat.update(dt);
    jogos.update(dt, t);
    dados.update(dt);
    atualizarTiros(dt);
    atualizarArmas(dt);
    localAvatar.setKo(combat.knockedOut);
    if (jogoLigado('corrida')) corrida.update(dt, player.pos.x, player.pos.z, player.veiculo);
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

  // a mesa e a tela em foco cobrem tudo: sem desenhar o 3D sobra placa de vídeo para as telas
  const desenhando = !mesa.aberta && state.focus?.kind !== 'share';
  qualidade.quadro(dtMs, desenhando && !world.compilando); // compilando: quadro vazio não conta
  if (desenhando) world.render();
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
