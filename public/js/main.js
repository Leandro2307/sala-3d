// Sala 3D — junta tudo: lobby, mundo, jogador, voz/tela (WebRTC), telão (YouTube, Twitch…), chat e parkour.
import * as THREE from 'three';
import { World, SPAWN } from './world.js';
import { Avatar } from './avatars.js';
import { PERSONAGENS } from './modelo.js';
import { EscolherPersonagem } from './escolher-personagem.js';
import { SalasLaterais } from './salas.js';
import { MUNDO, MUNDOS, lembrarMundo } from './mundo.js';
import { AoVivo, cartaoDoSaguao, COR_STATUS } from './aovivo.js';
import { Player } from './player.js';
import { RTC, presetDe } from './rtc.js';
import { MediaSync, PROVIDERS, preloadYouTube } from './media.js';
import { ParkourRun, formatTime, CHECKPOINT_COUNT } from './parkour.js';
import { Combat } from './combat.js';
import { RING, COMBAT, ringCorners } from './arena.js';
import { Corrida, PISTA, largada, formatarVolta, projetar, pontoEm } from './pista.js';
import { sfx, audioContext, setSfxEnabled } from './sfx.js';
import { Clima, CLIMAS, HORARIOS } from './clima.js';
import { ARMAS, IDS_ARMAS, ARMA_PADRAO, defArma, VisaoArma, iniciarCapsulas, atualizarCapsulas, preCarregarArma } from './armas.js';
import { Jogos } from './jogos.js';
import { Controle, versaoNum } from './controle.js';
import { AvisoDoSite } from './aviso-site.js';
import { Mesa } from './mesa.js';
import { Qualidade, NIVEIS, nivelInicial } from './qualidade.js';
import * as moduloQualidade from './qualidade.js';
import { GuiaExtensao } from './guia-extensao.js';
import { Navegadores, siteDe } from './navegador.js';
import { DEPARTAMENTOS, IDS_DEPARTAMENTOS, MAX_SALAS, rotuloDoPosto, portaDa, comTelas } from './escritorio.js';
import { Dados, MESA_DADOS } from './dados.js';
import { Futebol } from './futebol.js';
import { Quadras } from './quadras.js';
import { Pingue } from './pingue.js';
import { Queimada } from './queimada.js';
import { Sinuca } from './sinuca.js';
import { Golfe } from './golfe.js';
import { Cartas } from './cartas.js';
import { Gincana } from './gincana.js';
import { Kart } from './kart.js';
import { Pinta } from './pinta.js';
import { hud as hudJogos } from './hud-jogos.js';
import { Surf, MataMata, dicaDoPortal } from './ceu.js';
import { Batalha } from './batalha.js';
import { TIMES } from './batalha-dados.js';
import { Anuncios } from './anuncios.js';
import { acertarAvatar, tamanhoDo } from './hitbox.js';
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
const PANEL_TITLES = { people: 'Pessoas', chat: 'Chat da sala', telao: 'Telão', parkour: 'Parkour', ringue: 'Ringue de luta', corrida: 'Pista de corrida', jogos: 'Jogos, dados e moedas', parque: 'Parque', sala: 'Sala da empresa', settings: 'Ajustes' };

// ------------------------------------------------------------------ ajustes salvos
const DEFAULTS = {
  name: '', color: COLORS[0], mic: true, voice: 100, screen: 90, tv: 80, spatial: false,
  shareMode: 'max', sens: 100, balancoVisao: true, sfx: true, micDevice: '', camDevice: '', helpCollapsed: false, photo: null, shirt: 'none', char: 'padrao', arma: ARMA_PADRAO,
  // qualidade gráfica: 'auto' ou um nível fixo; nivelAuto: onde o automático parou da última vez;
  // falhasAuto: quantas vezes cada nível caiu logo depois de subir (o automático espera mais para tentar)
  qualidade: 'auto', nivelAuto: null, falhasAuto: {}, mostrarFps: false,
  // economia de bateria: 'auto' (bateria fraca fora da tomada), 'sim' ou 'nao'
  economia: 'auto',
  // presença (ver "empresa") e se o gestor quer os alertas da equipe
  status: 'disponivel', alertasGestor: true,
};
const stored = (() => {
  try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
})();
const settings = { ...DEFAULTS, ...stored };
settings.shareMode = presetDe(settings.shareMode); // texto nítido / vídeo / jogo viraram a Máxima
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
// MSAA pelo nível e pela densidade da tela (qualidade.js); sem essa função lá, vale o do nível
const querAntialias = (n) => moduloQualidade.querAntialias?.(n) ?? n.antialias;
const world = new World($('#gl'), $('#css3d'), { antialias: querAntialias(NIVEIS[nivelDePartida]), qualidade: NIVEIS[nivelDePartida] });
// lido uma vez: com o contexto do WebGL perdido, getContextAttributes() devolve null
const bordasLisas = !!world.renderer.getContextAttributes()?.antialias;
// navegador dentro das telas: páginas fixas do dono e o navegador que cada um abre no (+)
const navegadores = new Navegadores(world, {
  endereco: (texto) => paraIframe(enderecoDigitado(texto)),
  temPonte: () => extensaoNaVersao(1, 7),
  sala: () => state.room || 'principal',
  aoEntrada: (m) => entradaDoSite(m),
  aoDesligar: (tela) => {
    if (state.focus?.kind === 'pagina' && state.focus.tela === tela) sairDoFoco();
    refreshScreens();
  },
  aoTrocarTela: (lado) => irParaTelaDoLado(lado),
});
// sol, lua, chuva e tempestade (clima.js): o dono da sala pode fixar, senão muda sozinho
const clima = new Clima(world);
const qualidade = new Qualidade(world, {
  modo: settings.qualidade,
  nivel: settings.nivelAuto,
  falhas: settings.falhasAuto || {},
  aoMudar: (q) => {
    let mudou = false;
    // guarda onde o automático parou: a próxima visita já começa ali (com o antialias certo). Com a
    // tela ou o sistema segurando os quadros, ou em economia de bateria, o nível não diz nada da
    // placa de vídeo: não grava
    if (q.modo === 'auto' && !q.presoNoSistema && !q.economia && settings.nivelAuto !== q.nivel) {
      settings.nivelAuto = q.nivel;
      mudou = true;
    }
    // nível que caiu logo depois de subir: a próxima visita também espera mais para tentar de novo
    if (q.falhas && JSON.stringify(q.falhas) !== JSON.stringify(settings.falhasAuto || {})) {
      settings.falhasAuto = { ...q.falhas };
      mudou = true;
    }
    if (mudou) saveSettings();
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
player.balancoVisao = settings.balancoVisao;
// futebol de carro (estádio ao norte do cinema): jogando, ele dirige o carro e a câmera
const futebol = new Futebol({
  world, player, avatarLocal: localAvatar, sfx, toast: (...a) => toast(...a), estaLigado: () => jogoLigado('futebol'),
});
// os jogos do parque (pingue-pongue, queimada...): cada um entra nesta lista quando é criado, e o
// main.js repassa a eles a rede, o quadro, o E, a ação (clique/F) e a dica (ver acaoDosJogos)
const jogosDoParque = [];
// vôlei, basquete e boliche (a pé, com o boneco)
const quadras = new Quadras({
  world, player, sfx, toast: (...a) => toast(...a), ligado: (j) => jogoLigado(j),
  livre: () => state.joined && !state.focus && !futebol.jogando && !typing(),
  posDe: (id) => state.users.get(id)?.avatar.group.position ?? null,
  yawDe: (id) => state.users.get(id)?.avatar.inner.rotation.y ?? null,
});
// onde está o boneco de alguém da sala (pelo id), para os jogos do parque
const posDoId = (id) => state.users.get(id)?.avatar.group.position ?? null;
// pingue-pongue no salão de jogos do parque
const pingue = new Pingue({ world, player, sfx, ligado: () => jogoLigado('pingue'), posDe: posDoId });
jogosDoParque.push(pingue);
// queimada, na quadra do parque
const queimada = new Queimada({ world, player, sfx, ligado: () => jogoLigado('queimada'), posDe: posDoId, yawDe: (id) => state.users.get(id)?.avatar.inner.rotation.y ?? null });
jogosDoParque.push(queimada);
// sinuca, no salão de jogos
const sinuca = new Sinuca({
  world, player, sfx, ligado: () => jogoLigado('sinuca'),
  // na vez: câmera de cima da mesa, com o cursor solto (um foco, como o dos tabuleiros)
  focar: () => focarSinuca(),
  soltarFoco: () => { if (state.focus?.kind === 'sinuca') sairDoFoco(); },
});
jogosDoParque.push(sinuca);
// minigolfe, a oeste da praça do parque
const golfe = new Golfe({ world, player, sfx, ligado: () => jogoLigado('golfe'), posDe: posDoId });
jogosDoParque.push(golfe);
// truco e uno nas mesas redondas do salão: sentado, a câmera fica atrás da cadeira e o mouse solto
// para clicar nas cartas (um foco, como o da sinuca)
const cartas = new Cartas({
  world, player, sfx, ligado: (jogo) => jogoLigado(jogo),
  focar: () => focarCartas(),
  soltarFoco: () => { if (state.focus?.kind === 'cartas') sairDoFoco(); },
});
jogosDoParque.push(cartas);
// gincana: 10 fases e a final, bem longe do mapa (o portal fica ao sul da Rua dos Esportes)
const gincana = new Gincana({
  world, player, sfx, ligado: () => jogoLigado('gincana'),
  aoEntrar: () => {
    if (player.veiculo) toggleVeiculo();
    if (player.voando) toggleVoar();
    if (player.puloAlto) togglePuloAlto();
    if (player.sitting) toggleSit();
  },
});
jogosDoParque.push(gincana);
// kart no kartódromo do parque: na corrida o boneco vira o carro dele (o mesmo do autódromo, mas
// com a física do kart) mesmo com a pista de corrida desligada
const kart = new Kart({
  world, player, sfx, ligado: () => jogoLigado('kart'), posDe: posDoId,
  carro: (on) => {
    if (on) {
      if (player.voando) toggleVoar();
      if (player.puloAlto) togglePuloAlto();
      if (player.sitting) toggleSit();
    }
    if (player.veiculo === on) return;
    player.setVeiculo(on);
    atualizarHudCorrida();
    touchPad?.showCarro?.(on);
  },
});
jogosDoParque.push(kart);
// pinta-território, na arena depois da queimada
const pinta = new Pinta({
  world, player, sfx, ligado: () => jogoLigado('pinta'), posDe: posDoId,
  aoEntrar: () => {
    if (player.veiculo) toggleVeiculo();
    if (player.voando) toggleVoar();
    if (player.puloAlto) togglePuloAlto();
    if (player.sitting) toggleSit();
  },
});
jogosDoParque.push(pinta);
// surf e mata-mata (no céu; portais perto da porta do cinema)
const surf = new Surf({
  world, player, sfx, toast: (...a) => toast(...a), ligado: () => jogoLigado('surf'), socket: () => socket,
  aoEntrar: () => { if (player.veiculo) toggleVeiculo(); if (player.voando) toggleVoar(); if (player.sitting) toggleSit(); },
});
const mataMata = new MataMata({
  world, player, sfx, toast: (...a) => toast(...a), ligado: () => jogoLigado('matamata'), socket: () => socket,
  knockedOut: () => combat.knockedOut, eu: () => state.selfId,
  // arma da arena na mão do boneco (null: volta à de sempre, a da camiseta 22)
  armar: (id, tipo) => {
    const u = state.users.get(id);
    if (!u?.avatar) return;
    if (tipo) {
      u.armaDeAntes ??= u.avatar.tipoArma; // a escolhida no menu, para devolver na saída
      u.avatar.setArma(true, tipo);
    } else if (u.armaDeAntes !== undefined) {
      u.avatar.setArma(u.avatar.shirt === 'bolsonaro', u.isSelf ? settings.arma : u.armaDeAntes);
      delete u.armaDeAntes;
    }
    if (u.isSelf) poderesMudaram();
  },
});
// o que aparece por cima nas arenas: abates no canto, double kill, avisos de rodada (anuncios.js)
const anuncios = new Anuncios();
// mata-mata em times (arena própria no céu; o portal fica ao lado dos outros dois)
const batalha = new Batalha({
  world, player, sfx, toast: (...a) => toast(...a), ligado: () => jogoLigado('batalha'), socket: () => socket,
  combat: () => combat, meuId: () => state.selfId, anuncios,
  armar: (id, tipo) => mataMata.armar(id, tipo),
  avatarDe: (id) => state.users.get(id)?.avatar ?? null,
  aoEntrar: () => {
    if (player.veiculo) toggleVeiculo();
    if (player.voando) toggleVoar();
    if (player.puloAlto) togglePuloAlto();
    if (player.sitting) toggleSit();
  },
});

const state = {
  joined: false,
  selfId: null,
  room: null,
  roomRequested: null,
  users: new Map(),
  main: 'media',
  micOn: settings.mic,
  micAvailable: false,
  camOn: false, // webcam no rosto do boneco (começa sempre desligada)
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
// acao: { rotulo, fazer } põe um botão no aviso. Devolve a função que fecha o aviso antes da hora.
function toast(text, kind = 'info', ms = 4200, color = null, acao = null) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const c = color || (kind === 'warn' ? 'var(--warn)' : kind === 'error' ? 'var(--danger)' : null);
  el.innerHTML = `<span class="tdot"${c ? ` style="--c:${c}"` : ''}></span><span></span>`;
  el.lastChild.textContent = text;
  const fechar = () => {
    if (el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  };
  if (acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary small';
    b.style.flex = 'none';
    b.textContent = acao.rotulo;
    b.addEventListener('click', () => {
      fechar();
      acao.fazer();
    });
    el.appendChild(b);
    el.style.pointerEvents = 'auto'; // o #hud deixa os cliques passarem para o 3D; o aviso com botão não
  }
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(fechar, ms);
  return fechar;
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

// Modo ao vivo (só no localhost, com "npm run dev"): o servidor avisa quando um arquivo muda.
// CSS troca na hora; o resto recarrega a página, volta para a sala e para o mesmo lugar.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && window.EventSource) {
  // para depurar pelo console (só no localhost)
  window.sala3d = { world: () => world, state: () => state, player: () => player, rtc: () => rtc };
  const DEV_POS = 'sala3d-dev-pos';
  let bootVisto = null;
  const recarregar = () => {
    const url = new URL(location.href);
    if (state.joined) {
      url.searchParams.set('sala', state.room);
      url.searchParams.set('entrar', '1');
      try { sessionStorage.setItem(DEV_POS, JSON.stringify({ p: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw })); } catch { /* sem storage */ }
    }
    location.href = url;
  };
  const dev = new EventSource('/dev-recarregar');
  dev.addEventListener('boot', (e) => {
    // o servidor reiniciou (mudou server.js, por exemplo): recarrega também
    if (bootVisto && bootVisto !== e.data) recarregar();
    bootVisto = e.data;
  });
  dev.onmessage = (e) => {
    if (/\.css$/.test(e.data)) {
      for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
        if (!l.href.includes('/style.css')) continue;
        const u = new URL(l.href);
        u.searchParams.set('t', Date.now());
        l.href = u;
      }
      toast('Visual atualizado ao vivo', 'info', 1800);
      return;
    }
    toast(`Atualizando: ${e.data}`, 'info', 1500);
    setTimeout(recarregar, 300);
  };
  // voltou de uma atualização: depois de entrar, põe a pessoa onde ela estava
  let volta = null;
  try { volta = JSON.parse(sessionStorage.getItem(DEV_POS) || 'null'); sessionStorage.removeItem(DEV_POS); } catch { /* sem storage */ }
  if (volta) {
    const esperar = setInterval(() => {
      if (!state.joined) return;
      clearInterval(esperar);
      setTimeout(() => player.teleport(volta.p, volta.yaw), 1200);
    }, 300);
  }
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
  if (e.code !== 'KeyP' || !state.joined || state.focus || escolha.aberto || avisoSite.aberto || e.repeat) return;
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
// Também serve para voltar à mesma sala (servidor novo no ar, 3D que não voltou sozinho).
function recarregarNaSala(id = state.room, mundo = null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('sala', id);
  url.searchParams.set('entrar', '1');
  // trocando de sala, o mundo é o que a outra sala usa (mundo.js lembra); só vai no endereço quando
  // é para montar outro mundo nesta (assim funciona até sem localStorage)
  if (mundo) url.searchParams.set('mundo', mundo);
  else if (id !== state.room) url.searchParams.delete('mundo');
  window.location.href = url;
}
const salas = new SalasLaterais({
  raiz: $('#salas'),
  atual: () => state.room,
  passes: lerPasses,
  aoTrocar: (id) => recarregarNaSala(id),
});
// salas ao vivo (aovivo.js): o cartão do saguão e as salas com gente na coluna lateral
const aoVivo = new AoVivo();
aoVivo.ouvir((dados) => salas.aoVivo(dados));
const redesenharSaguao = cartaoDoSaguao(aoVivo, {
  lista: $('#ao-vivo-lista'),
  resumo: $('#ao-vivo-resumo'),
  selecionada: () => idDaSala(roomInput.value),
  aoEscolher: (id) => {
    roomInput.value = id;
    roomInput.dispatchEvent(new Event('input'));
    (nameInput.value.trim() ? $('#btn-join') : nameInput).focus();
  },
  ativo: () => !state.joined, // dentro da sala o saguão fica escondido
});
roomInput.addEventListener('input', () => redesenharSaguao());
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
  futebol.ligar(socket);
  quadras.ligar(socket);
  for (const j of jogosDoParque) j.ligar(socket);
  surf.ligar(socket);
  mataMata.ligar(socket);
  batalha.ligar(socket);
  // abates nas arenas: só quem está na mesma arena vê a lista e ouve o locutor
  socket.on('mm-abate', (m) => {
    const emTimes = m?.modo === 'times';
    if (emTimes ? batalha.ativo : mataMata.ativo) anuncios.abate(m, state.selfId, emTimes ? (t) => TIMES[t]?.cor : null);
  });
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
  rtc.onMicCaiu = religarMic;
  rtc.shareMode = settings.shareMode;
  preloadYouTube();
  $('#browser-block').hidden = !config.browser;
  renderBrowserSites(config.browser?.sites || []);
  extensaoNova = config.extensao || null;
  renderExtensao();
  guia.atualizar();
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
  avisarExtensaoVelha();
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
      respawn: () => { if (!state.focus && !jogosDoParque.some((j) => j.teclaR?.())) respawn(); },
      punch: () => punch(),
      sit: () => toggleSit(),
      car: () => toggleVeiculo(),
      voar: () => toggleVoar(),
      puloAlto: () => togglePuloAlto(),
      tiro: () => puxarGatilho(),
      // jogos com bola: o E e a ação (o clique do computador)
      jogoE: () => { if (!quadras.usarE()) jogosDoParque.some((j) => j.usarE?.()); },
      jogoAcao: () => { if (acaoDosJogos()) cliqueDoJogo = true; },
      jogoSoltar: () => {
        if (!cliqueDoJogo) return;
        cliqueDoJogo = false;
        soltarAcaoDosJogos();
      },
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
      cam: rtc?.camId ?? null,
      photo: settings.photo,
      shirt: settings.shirt,
      char: settings.char,
      arma: settings.arma,
      status: settings.status,
      passe: state.passe,
      proto: 2, // recebe as posições em lote ('states'); aba antiga continua no 'state' de cada um
    }, resolve);
  });
}

function applyJoined(data) {
  state.selfId = data.selfId;
  rtc.selfId = data.selfId;
  futebol.eu = data.selfId;
  quadras.eu = data.selfId;
  quadras.ver();
  for (const j of jogosDoParque) {
    j.eu = data.selfId;
    j.ver?.();
  }
  mataMata.ver();
  batalha.ver();
  futebol.verPartida(); // numa reconexão, quem estava jogando volta a pé (o servidor esqueceu)
  state.room = data.room;
  state.passe = data.passe || null;
  // versão do servidor na primeira entrada: numa reconexão, outra versão = deploy novo (ver 'connect')
  state.versao ??= data.versao;
  guardarPasse(data.room, data.passe);
  // sobra de antes (bots de teste criados no saguão) sai da cena junto
  for (const u of state.users.values()) if (!u.isSelf) u.avatar.dispose();
  state.users.clear();
  porNumero.clear();
  state.users.set(data.selfId, {
    id: data.selfId, name: settings.name, color: settings.color, mic: state.micOn && state.micAvailable,
    shares: new Map(), isSelf: true, avatar: localAvatar, streams: new Map(),
    status: settings.status, inativo: false, gestor: false, desde: Date.now(),
  });
  meuStatusMudou();
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
    // o servidor mudou de versão (deploy novo): recarrega já entrando, com o código que combina com ele
    if (data?.versao && data.versao !== state.versao) return recarregarNaSala();
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

  // servidor antigo: uma mensagem por pessoa a cada passo
  socket.on('state', ({ id, p, r, a, s }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    u.avatar.setNetworkState(p, r, a);
    u.speaking = !!s;
    u.avatar.speaking = u.speaking && mesmoAmbiente(u); // aro só em quem dá para ouvir
  });
  // servidor novo: quem se mexeu na sala vem num lote só, [n, x, y, z, r, a, s, n, x, ...] a cada ~30 ms
  socket.on('states', (a) => {
    if (!Array.isArray(a)) return;
    for (let i = 0; i + 6 < a.length; i += 7) {
      const u = porNumero.get(a[i]);
      if (!u || u.isSelf) continue;
      _pRede[0] = a[i + 1];
      _pRede[1] = a[i + 2];
      _pRede[2] = a[i + 3];
      u.avatar.setNetworkState(_pRede, a[i + 4], a[i + 5]);
      u.speaking = !!a[i + 6];
      // aro verde só em quem dá para ouvir (outra sala à prova de som fala e não se ouve)
      u.avatar.speaking = u.speaking && mesmoAmbiente(u);
    }
  });

  socket.on('user-update', ({ id, mic, cam, photo, shirt, char, color, arma, health, ko, status, inativo, gestor, desde }) => {
    const u = state.users.get(id);
    if (!u) return;
    if (status !== undefined || inativo !== undefined || gestor !== undefined) {
      if (status !== undefined) u.status = status;
      if (inativo !== undefined) u.inativo = inativo;
      if (gestor !== undefined) u.gestor = gestor;
      if (desde !== undefined) u.desde = desde;
      u.avatar.setPresenca(COR_STATUS[presencaDe(u)]);
      if (u.isSelf && gestor) {
        pedirNotificacoes();
        renderSala();
      }
      renderPeople();
      renderEquipe();
    }
    if (mic !== undefined) {
      u.mic = mic;
      u.avatar.setStatus({ mic });
      renderPeople();
    }
    if (cam !== undefined && !u.isSelf) {
      u.cam = cam;
      routeStreams(u);
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
      // o próprio já trocou ao escolher (aplicarPersonagem): o eco do servidor carregaria de novo
      if (!u.isSelf) u.avatar.setPersonagem(PERSONAGENS[char]);
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

  socket.on('ko', ({ id, name, by, byColor, fights, arena, fica }) => {
    setFightBoard(fights);
    const u = state.users.get(id);
    if (u && !u.isSelf) {
      u.avatar.setKo(true);
      u.avatar.setHealth(0);
      // em times, quem cai na rodada fica no chão até a próxima (batalha.js levanta)
      if (fica) batalha.manterCaido(id);
      else setTimeout(() => { u.avatar.setKo(false); u.avatar.setHealth(1); }, COMBAT.respawnDelay * 1000);
    }
    sfx.ko();
    // nas arenas quem conta é a lista de abates delas (anuncios.js), não um aviso para a sala toda
    if (!arena) toast(by ? `${by} nocauteou ${name}!` : `${name} caiu do ringue!`, 'warn', 4200, byColor || null);
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
    // controle desligado ou tela fora do ar: um aviso do site dela não tem mais quem responda
    if (gone || !podeControlar) avisoSite.esquecer(key);
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
    // a tela mudou de lugar, entrou ou saiu: as telas do 3D se refazem mesmo sem vídeo novo
    if (u.isSelf || !routeStreams(u)) refreshScreens();
    renderPeople();
    setTimeout(atualizarInteresse, 0);
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
  // a volta de uma tela que controlo: o texto do Ctrl+C, ou um aviso do site (ver aviso-site.js)
  socket.on('controle-volta', ({ key, ev, de } = {}) => {
    if (typeof key !== 'string' || !ev) return;
    if (ev.t === 'copia' && typeof ev.s === 'string' && controle.pediuCopia(key)) copiarDaTela(ev.s, de);
    else if (ev.t === 'dialogo' && (ev.fechou || controle.mexeuEm(key))) avisoSite.receber(key, ev, `Na tela de ${de || 'alguém'}`);
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
  socket.on('alerta-gestor', alertaDaEquipe);
  socket.on('chamado', foiChamado);
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
// n: número curto que o servidor dá a cada pessoa, usado no lote de posições ('states')
const porNumero = new Map(); // n -> pessoa
const _pRede = [0, 0, 0]; // posição de quem vem no lote (setNetworkState copia)

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
  avatar.setPresenca(COR_STATUS[presencaDe(data)]);
  world.scene.add(avatar.group);
  const shares = new Map((data.shares || []).map((sh) => [sh.key, { ...sh, video: null }]));
  const u = { ...data, shares, isSelf: false, avatar, streams: new Map(), audioEl: null, speaking: false };
  state.users.set(u.id, u);
  if (u.n != null) porNumero.set(u.n, u);
  const semDono = streamsSemDono.get(u.id);
  if (semDono) {
    streamsSemDono.delete(u.id);
    setTimeout(() => { for (const st of semDono.values()) handleTrack(u.id, st); }, 0);
  }
  world.marcarSombra?.(); // mais um boneco na sombra do sol
  return u;
}

function removeUser(id, quiet = false) {
  const u = state.users.get(id);
  if (!u || u.isSelf) return;
  for (const key of u.shares.keys()) avisoSite.esquecer(key);
  if (porNumero.get(u.n) === u) porNumero.delete(u.n);
  interesseEnviado.delete(id);
  vozFora.delete(id);
  vozesBarradas.delete(id);
  streamsSemDono.delete(id);
  u.avatar.dispose();
  world.marcarSombra?.();
  if (u.audioEl) {
    u.audioEl.srcObject = null;
    u.audioEl.remove();
  }
  if (u.camVideo) {
    u.camVideo.srcObject = null;
    u.camVideo.remove();
  }
  for (const sh of u.shares.values()) soltarVideo(sh);
  if (state.focus?.kind === 'share' && u.shares.has(state.focus.key)) exitFocus();
  state.users.delete(id);
  rtc?.removePeer(id); // bots de teste existem até antes de entrar (sem rtc)
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
  // o menu "Suas telas" e a lista só são montados à mostra (abrir cada um já redesenha): mic,
  // fala e status de cada pessoa não remontam HTML escondido
  if (!$('#share-pop').hidden) renderSharePop();
  if (state.panel !== 'people') return;
  const users = [...state.users.values()].sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)));
  $('#people-list').innerHTML = users.map((u) => {
    const telas = [...u.shares.values()].sort(ordemDasTelas);
    // presença + onde está no escritório ("Ocupado · TI"); compartilhando tem prioridade
    const pres = presencaDe(u);
    const local = localDe(u);
    const sub = telas.length
      ? `Compartilhando · ${telas.map(ondeEsta).join(', ')}`
      : !u.isSelf && statusText(u) !== 'Na sala' ? statusText(u)
        : `${NOMES_PRESENCA[pres]}${pres !== 'disponivel' && u.desde ? ` há ${haQuanto(u.desde)}` : ''}${local ? ` · ${local}` : ''}`;
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
      <span class="avatar-dot" style="--c:${esc(u.color)}">${esc((u.name[0] || '?').toUpperCase())}<i class="pres-dot" style="--s:${COR_STATUS[pres]}" title="${NOMES_PRESENCA[pres]}"></i></span>
      <div class="person-info">
        <div class="person-name">${esc(u.name)}${u.isSelf ? ' <small>(você)</small>' : ''}${u.gestor ? ' <span class="tag-gestor">Gestor</span>' : ''}<span class="moedas" title="Moedas">${icon('moeda', 12)} ${u.moedas ?? 0}</span></div>
        <div class="person-sub${telas.length ? ' sharing' : ''}">${esc(sub)}</div>
      </div>
      <div class="person-actions">
        ${!u.isSelf ? `<button type="button" class="icon-btn" data-act="chamar" title="Chamar (avisa que você quer falar)">${icon('sino', 17)}</button>` : ''}
        ${!u.isSelf ? `<button type="button" class="icon-btn" data-act="goto" title="Ir até">${icon('goto', 18)}</button>` : ''}
        ${u.mic ? '' : `<span class="muted-ic" title="Microfone desligado">${icon('micOff', 18)}</span>`}
      </div>
      ${linhas ? `<ul class="person-shares">${linhas}</ul>` : ''}
    </li>`;
  }).join('');
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
  if (btn.dataset.act === 'goto') irAte(u);
  if (btn.dataset.act === 'chamar') chamar(u);
});

function irAte(u) {
  const p = u.avatar.group.position;
  run.cancel();
  hideParkourHud();
  if (player.veiculo) toggleVeiculo();
  player.teleport([p.x + 1.4, p.y, p.z + 1.4], null);
}

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

// ------------------------------------------------------------------ webcam
// Opcional e sempre começa desligada. Ligada, o vídeo vai no rosto do boneco para todo mundo
// (Avatar.setCam: na calota da foto, ou num disco na frente do rosto dos personagens) e numa
// bolinha no canto para você se ver — em 1ª pessoa o seu boneco não aparece.
const camPreview = $('#cam-preview');

async function ligarCam(deviceId) {
  try {
    return await rtc.startCam(deviceId || null);
  } catch (err) {
    // a câmera escolhida nos ajustes sumiu (desconectou): tenta a padrão
    if (!deviceId || err.name === 'NotAllowedError') throw err;
    settings.camDevice = '';
    saveSettings();
    return rtc.startCam(null);
  }
}

// câmera desconectada (ou tomada por outro programa): desliga aqui também
function vigiarCam() {
  const track = rtc.camFonte; // a câmera de verdade (o que sai é o rosto recortado dela)
  track?.addEventListener('ended', () => {
    if (!state.camOn || rtc.camFonte !== track) return;
    toggleCam();
    toast('A câmera foi desconectada.', 'warn', 5000);
  });
}

function avisoDaCam(err) {
  if (err.name === 'NotAllowedError') return 'A câmera está bloqueada. Libere no cadeado ao lado do endereço e clique de novo.';
  if (err.name === 'NotReadableError' || err.name === 'AbortError') return 'A câmera está ocupada por outro programa (Meet, Zoom, Teams…). Feche lá e tente de novo.';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'Não achei nenhuma câmera neste computador.';
  return `Não deu para ligar a câmera: ${err.message}`;
}

async function toggleCam() {
  if (!rtc) return;
  const btn = $('#btn-cam');
  if (state.camOn) {
    state.camOn = false;
    rtc.stopCam();
    socket.emit('cam', null);
    localAvatar.setCam(null);
    camPreview.srcObject = null;
    updateCamButton();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) return toast('Este navegador não dá acesso à câmera.', 'error');
  btn.disabled = true;
  let stream;
  try {
    stream = await ligarCam(settings.camDevice);
  } catch (err) {
    console.warn('[webcam]', err);
    toast(avisoDaCam(err), 'warn', 7000);
    return;
  } finally {
    btn.disabled = false;
  }
  state.camOn = true;
  socket.emit('cam', rtc.camId);
  camPreview.srcObject = stream;
  camPreview.play().catch(() => {});
  localAvatar.setCam(camPreview);
  vigiarCam();
  updateCamButton();
  populateDevices(); // com a permissão dada, os nomes das câmeras aparecem nos ajustes
}

function updateCamButton() {
  const on = state.camOn;
  const b = $('#btn-cam');
  b.classList.toggle('on', on);
  b.querySelector('i').innerHTML = icon(on ? 'webcam' : 'webcamOff');
  b.dataset.tip = on ? 'Desligar câmera (K)' : 'Ligar câmera (K)';
  camPreview.hidden = !on;
}

async function populateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const preencher = (sel, tipo, nome, atual) => {
      sel.innerHTML = '<option value="">Padrão do sistema</option>'
        + devices.filter((d) => d.kind === tipo && d.deviceId && d.deviceId !== 'default')
          .map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || nome)}</option>`).join('');
      sel.value = atual || '';
    };
    preencher($('#set-mic-device'), 'audioinput', 'Microfone', settings.micDevice);
    preencher($('#set-cam-device'), 'videoinput', 'Câmera', settings.camDevice);
  } catch { /* sem permissão */ }
}

// ------------------------------------------------------------------ qualidade das telas
// Quem assiste diz a quem compartilha quanto precisa de cada tela (rtc.js, NIVEIS): em foco ou
// grande na vista = máxima (60 quadros); média = 540p a 60 ou a 30; pequena = um quarto; fora da
// vista ou com a aba escondida = nada de vídeo (o som continua). Subir é na hora; descer espera um
// pouco, para não ficar trocando enquanto a pessoa olha em volta.
const ESPERA_DESCER = { medio: 1500, baixo: 1500, mini: 2000, off: 2500 };
const ORDEM_NIVEL = { off: 0, mini: 1, baixo: 2, medio: 3, max: 4 };
const niveisTela = new Map(); // key -> { nivel, candidato, desde }
const interesseEnviado = new Map(); // peerId -> { key: nivel }
let ultimoEnvioCompleto = 0;

function nivelDesejado(sh) {
  const nivel = nivelDaTela(sh);
  // O som da aba compartilhada sai por este mesmo <video>, que só começa a tocar (som junto)
  // depois do 1º quadro de imagem. Até lá, no mínimo 'mini' (1/4 a 15 qps, barato): o 'off' logo
  // de cara (tela de costas, em outra sala) deixava o vídeo sem quadro e a sala sem o som.
  return nivel === 'off' && !(sh.video?.readyState >= 2) ? 'mini' : nivel;
}

function nivelDaTela(sh) {
  if (document.hidden) return 'off';
  if (state.focus?.kind === 'share') return state.focus.key === sh.key ? 'max' : 'off';
  // na mesa, pelo tamanho de cada monitor (o que está atrás da ampliada não precisa de vídeo)
  if (mesa.aberta) return mesa.nivelDe ? mesa.nivelDe(sh.key) : 'max';
  // Em pixels que o 3D desenha de verdade: a altura na página vezes a resolução do canvas. Pela
  // densidade da tela, o celular de DPR 3 (onde o 3D sai a 0,8-1,25) pedia 1080p para 60 px.
  const css = world.alturaDaTela?.(sh.key) ?? (sh.video ? world.alturaDoVideo(sh.video) : 0);
  const px = css * world.renderer.getPixelRatio();
  // 'medio' (540p60) só onde o 3D sobe a tela a 60 quadros: na Alta, a partir de 90 px
  const nivel = px >= (isTouch ? 400 : 160) ? 'max'
    : px >= 50 ? (css >= 90 && world.videoFps >= 60 ? 'medio' : 'baixo')
      : px > 0 ? 'mini' : 'off';
  // economia de bateria: fora do foco e da mesa, no máximo 540p30
  return economiaLigada && nivel === 'max' ? 'baixo' : nivel;
}

// Webcam de alguém: só vem se dá para ver o rosto — perto, de frente, na vista e sem tela, site ou
// mesa cobrindo o 3D. Fora disso quem tem a câmera nem codifica para mim.
const _rosto = new THREE.Sphere(new THREE.Vector3(), 0.9);
function nivelDaCam(u) {
  if (document.hidden || !mundoVisivel() || navegadorEmUso()) return 'off';
  const a = u.avatar;
  if (a.oculto || a.veiculo) return 'off';
  const p = a.group.position;
  const cam = world.camera.position;
  const perto = isTouch || economiaLigada ? 10 : 18;
  if (cam.distanceToSquared(p) > perto * perto) return 'off';
  // de costas para a câmera (mais de 120° fora do rosto)
  const dx = cam.x - p.x;
  const dz = cam.z - p.z;
  const giro = a.inner.rotation.y;
  if (Math.sin(giro) * dx + Math.cos(giro) * dz < -0.5 * Math.hypot(dx, dz)) return 'off';
  _rosto.center.set(p.x, p.y + 1.2, p.z);
  return (world.naVista?.(_rosto) ?? true) ? 'max' : 'off';
}

// Celular: no máximo 6 webcams decodificando ao mesmo tempo. Ficam as que se vê, as mais perto
// primeiro; quem já estava com a câmera leva 1 m de vantagem, para não trocar a cada passo de quem
// está na divisa. As que sobram voltam para a foto (ou o visor) em vez de congelar.
const MAX_CAMS_TOQUE = 6;
const _camsVistas = [];
const porDistanciaDaCam = (a, b) => a.distanciaCam - b.distanciaCam;
function limitarCams() {
  const cam = world.camera.position;
  _camsVistas.length = 0;
  for (const u of state.users.values()) {
    if (u.isSelf || !u.cam || u.nivelCam !== 'max') continue;
    u.distanciaCam = u.avatar.group.position.distanceTo(cam) - (u.camPausada === false ? 1 : 0);
    _camsVistas.push(u);
  }
  _camsVistas.sort(porDistanciaDaCam);
  _camsVistas.forEach((u, i) => {
    const pausa = i >= MAX_CAMS_TOQUE;
    if (pausa) u.nivelCam = 'off';
    u.camPausada = pausa;
    u.avatar.pausarCam?.(pausa); // não faz nada se já está assim
  });
}

function atualizarInteresse() {
  if (!state.joined || !rtc) return;
  // ninguém compartilhando nem com câmera: nada a pedir, e a vista nem precisa ser preparada
  let alguem = false;
  for (const u of state.users.values()) if (!u.isSelf && (u.shares.size || u.cam)) alguem = true;
  if (!alguem) {
    niveisTela.clear();
    return;
  }
  world.prepararInteresse?.(); // vista e paredes uma vez por rodada (alturaDaTela, naVista)
  for (const u of state.users.values()) if (!u.isSelf && u.cam) u.nivelCam = nivelDaCam(u);
  if (isTouch) limitarCams();
  const agora = performance.now();
  const completo = agora - ultimoEnvioCompleto > 8000;
  if (completo) ultimoEnvioCompleto = agora;
  const vistas = new Set();
  // subir (ou igual) é na hora; descer só depois de um tempo querendo menos
  const suavizar = (chave, quer) => {
    vistas.add(chave);
    let t = niveisTela.get(chave);
    if (!t) {
      t = { nivel: quer, candidato: quer, desde: agora };
      niveisTela.set(chave, t);
    }
    if (ORDEM_NIVEL[quer] >= ORDEM_NIVEL[t.nivel]) {
      t.nivel = quer;
      t.candidato = quer;
    } else {
      if (t.candidato !== quer) {
        t.candidato = quer;
        t.desde = agora;
      }
      if (agora - t.desde >= ESPERA_DESCER[quer]) t.nivel = quer;
    }
    return t.nivel;
  };
  for (const u of state.users.values()) {
    if (u.isSelf || (!u.shares.size && !u.cam)) continue;
    const mapa = {};
    for (const sh of u.shares.values()) mapa[sh.key] = suavizar(sh.key, nivelDesejado(sh));
    if (u.cam) mapa.cam = suavizar(`cam:${u.id}`, u.nivelCam);
    const antes = interesseEnviado.get(u.id) || {};
    const mudou = Object.keys(mapa).filter((k) => antes[k] !== mapa[k]);
    if (completo || mudou.length) {
      rtc.enviarInteresse(u.id, completo ? mapa : Object.fromEntries(mudou.map((k) => [k, mapa[k]])));
      interesseEnviado.set(u.id, mapa);
    }
  }
  for (const k of niveisTela.keys()) if (!vistas.has(k)) niveisTela.delete(k);
}
setInterval(() => {
  atualizarInteresse();
  atualizarVoz();
}, 250);
// voltou para a aba (ou saiu dela): decide na hora
document.addEventListener('visibilitychange', () => setTimeout(atualizarInteresse, 0));

// "1080p · 60 qps · H264 na placa de vídeo": como cada tela minha está saindo (menu Suas telas)
const envios = new Map(); // key -> texto
const LIMITES = { bandwidth: 'internet no limite', cpu: 'PC no limite' };
async function medirEnvios() {
  if (!rtc || !compartilhando()) return;
  for (const key of self().shares.keys()) {
    const e = await rtc.envioAtual(key);
    let texto = '';
    if (e) {
      texto = `${e.altura}p · ${e.fps} qps${e.codec ? ` · ${e.codec}` : ''}${e.placa ? ' na placa de vídeo' : ''}`;
      if (LIMITES[e.limite]) texto += ` · ${LIMITES[e.limite]}`;
    } else if (state.users.size > 1) {
      texto = 'Ninguém olhando agora: o vídeo pausa sozinho';
    }
    envios.set(key, texto);
    const el = document.querySelector(`[data-envio="${CSS.escape(key)}"]`);
    if (el) el.textContent = texto;
  }
}
setInterval(() => { if (!$('#share-pop').hidden) medirEnvios(); }, 1000);

// em foco: como a tela está chegando (altura e quadros)
async function medirFoco() {
  const el = $('#focus-qualidade');
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  const track = t && !t.user.isSelf ? t.share.video?.srcObject?.getVideoTracks()[0] : null;
  const r = track && rtc ? await rtc.recebendo(t.user.id, track.id) : null;
  el.textContent = r ? `${r.altura}p · ${r.fps} qps` : '';
}
setInterval(medirFoco, 1000);

// ------------------------------------------------------------------ compartilhar tela
// Dá para compartilhar várias abas/janelas ao mesmo tempo: cada clique em "Compartilhar outra"
// abre o seletor do navegador de novo e a escolhida vai para a próxima tela livre.
// telaEscolhida: veio do (+) de uma tela (aí não pergunta onde)
async function novaTela(telaEscolhida) {
  if (shareBusy) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Seu navegador não permite compartilhar a tela aqui. Use Chrome/Edge no computador (https ou localhost).', 'error', 6000);
    return;
  }
  if (!cabeMaisUma()) {
    toast('Todas as telas e o telão estão ocupados. Pare uma delas para compartilhar outra.', 'warn', 5000);
    return;
  }
  // escritório, fora do próprio posto: a pessoa escolhe em qual tela da sala vai aparecer
  const tela = telaEscolhida ?? await escolherTela();
  if (tela === null) return;
  let stream;
  let key;
  shareBusy = true;
  try {
    stream = await rtc.captureScreen();
    key = await publishShare(stream, { tela });
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
  // aba pelo seletor: o Chrome põe a faixa no topo. Uma vez por sessão, ensina o atalho sem faixa
  if (stream.getVideoTracks()[0]?.getSettings?.().displaySurface === 'browser' && !dicaFaixaDada) {
    dicaFaixaDada = true;
    setTimeout(() => toast(dicaSemFaixa().replace(/<[^>]+>/g, ''), 'info', 9000), 1500);
  }
}
let dicaFaixaDada = false;

// Em qual tela compartilhar? Só pergunta no escritório, numa sala com telas de parede (ou na
// recepção), quando a pessoa NÃO está na sala do próprio posto (aí vai para os monitores dela).
// Devolve o número da tela, undefined (qualquer livre, o servidor escolhe) ou null (desistiu).
// aoPerguntar: chamado logo antes de mostrar a pergunta (a aba do Alt+Shift+S traz a sala para a frente).
function escolherTela(aoPerguntar = null) {
  if (!modoEscritorio() || !world.planta) return Promise.resolve(undefined);
  const lugar = world.salaEm(player.pos.x, player.pos.z);
  const me = self();
  if (me?.posto && me.posto.split('-')[0] === lugar) return Promise.resolve(undefined);
  const sala = comTelas(world.planta).find((s) => s.id === lugar);
  if (!sala?.telas) return Promise.resolve(undefined);
  // quem está em cada tela agora
  const dono = new Map();
  for (const u of state.users.values()) for (const sh of u.shares.values()) if (sh.slot != null) dono.set(sh.slot, u);
  const caixa = $('#escolher-tela');
  $('#et-sala').textContent = sala.nome;
  const opcoes = [];
  for (let i = sala.primeiraTela; i < sala.primeiraTela + sala.telas; i++) {
    const u = dono.get(i);
    const nome = world.rotuloTela(i).split(' · ').slice(1).join(' · ') || world.rotuloTela(i);
    opcoes.push(`<button type="button" data-tela="${i}"${u ? ' disabled' : ''}>
      ${icon('share', 18)}<span><b>${esc(nome)}</b><small>${u ? `Ocupada · ${esc(u.name)}` : paginaDaTela(i) ? `Página ${esc(siteDaPagina(paginaDaTela(i)))} (sai enquanto você compartilha)` : 'Livre'}</small></span>
    </button>`);
  }
  $('#et-grade').innerHTML = opcoes.join('');
  if (document.pointerLockElement) document.exitPointerLock();
  aoPerguntar?.();
  caixa.hidden = false;
  return new Promise((resolve) => {
    const fechar = (v) => {
      caixa.hidden = true;
      caixa.removeEventListener('click', clique);
      document.removeEventListener('keydown', tecla, true);
      resolve(v);
    };
    const clique = (e) => {
      const b = e.target.closest('[data-tela], [data-et]');
      if (!b && e.target === caixa) return fechar(null);
      if (!b || b.disabled) return;
      if (b.dataset.tela) return fechar(Number(b.dataset.tela));
      fechar(b.dataset.et === 'auto' ? undefined : null);
    };
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fechar(null);
    };
    caixa.addEventListener('click', clique);
    document.addEventListener('keydown', tecla, true);
  });
}

// Aba mandada pela extensão (Alt+Shift+S ou o ícone dela, numa aba qualquer): entra numa tela
// livre como as outras, mas sem a faixa "Compartilhando ... com esta guia" do Chrome no topo.
// Devolve o resultado, que a extensão 1.11+ mostra no ícone dela (a pessoa está na outra aba e não
// vê os avisos da sala): { ok, onde } ou { erro, msg }.
async function capturarAbaDaExtensao({ streamId, aba, site, titulo }) {
  const falhou = (msg, tipo = 'warn', ms = 5000) => {
    toast(msg, tipo, ms);
    return { erro: 'sala', msg };
  };
  if (!state.joined) return falhou('Entre na sala antes de compartilhar uma aba.');
  for (const sh of self().shares.values()) {
    if (sh.aba === aba) return falhou('Essa aba já está compartilhada.', 'info', 3000);
  }
  if (!cabeMaisUma()) return falhou('Todas as telas e o telão estão ocupados. Pare uma delas para compartilhar outra.');
  if (shareBusy) return { erro: 'sala', msg: 'A sala ainda está pondo outra tela no ar: tente de novo.' };
  shareBusy = true;
  let stream;
  let key;
  try {
    stream = await rtc.captureAba(streamId);
    // marcou a tela no (+) e veio do Alt+Shift+S: vai para ela
    const marcada = alvoDaExtensao && Date.now() < alvoDaExtensao.ate ? alvoDaExtensao.i : undefined;
    alvoDaExtensao = null;
    // a pergunta "em qual tela?" aparece na sala, e a pessoa está na outra aba: a sala vem para a frente
    const tela = marcada ?? await escolherTela(() => controle.mostrarSala());
    if (tela === null) {
      for (const t of stream.getTracks()) t.stop();
      return { erro: 'sala', msg: 'Você desistiu de compartilhar.' };
    }
    key = await publishShare(stream, { aba, tela });
  } catch (err) {
    return falhou(`Não deu para compartilhar a aba: ${err.message}`, 'error', 6000);
  } finally {
    shareBusy = false;
  }
  if (!key) return { erro: 'sala', msg: 'A sala não conseguiu pôr a aba numa tela.' };
  const sh = self().shares.get(key);
  Object.assign(sh, { site, titulo });
  // pela tabCapture o som da aba deixa de sair no seu alto-falante: toca aqui para você ouvir
  if (stream.getAudioTracks().length) {
    sh.escuta = new Audio();
    sh.escuta.srcObject = new MediaStream(stream.getAudioTracks());
    sh.escuta.play().catch(() => {});
  }
  renderPeople();
  // a extensão 1.11+ (a que conta o atalho) tira a aba da sala pelo mesmo atalho
  const parar = controle.ext.atalho ? `o X da tela ou ${controle.ext.atalho} na aba` : 'o X da tela';
  toast(`${titulo ? `“${titulo.slice(0, 40)}”` : 'A aba'} está no ${ondeEsta(sh) === 'Telão' ? 'telão' : ondeEsta(sh)} (com som). Para parar, use ${parar}.`, 'success', 6000);
  return { ok: true, onde: ondeEsta(sh) };
}

// Reserva uma tela no servidor e manda o stream (captura ou arquivo) para todo mundo.
// Devolve a chave da tela, ou null se não deu.
async function publishShare(stream, { file = false, height = 0, aba: abaConhecida = null, tela } = {}) {
  // no escritório, numa tela da sala onde a pessoa está
  const sala = world.salaEm(player.pos.x, player.pos.z);
  const res = await new Promise((resolve) => socket.emit('share-start', { streamId: stream.id, sala, tela }, resolve));
  if (!res?.ok) {
    if (!file) for (const t of stream.getTracks()) t.stop();
    toast(res?.error || 'Não foi possível compartilhar.', 'error');
    return null;
  }
  const video = makeVideo(true);
  video.srcObject = stream;
  video.play().catch(() => {});
  // aba que veio pela extensão (Alt+Shift+S): já se sabe qual é, sem a marca da página
  const aba = file ? null : abaConhecida ?? controle.abaDe(stream, (nova) => marcaDaAba(res.key, nova));
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
  if (sh.escuta) {
    sh.escuta.pause();
    sh.escuta.srcObject = null;
  }
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
        <span class="sp-name">${esc(tipoDaTela(sh))}<small>${ondeEsta(sh)}${noTelao && sh.slot != null ? ' · no telão' : ''}</small><small class="sp-envio" data-envio="${esc(sh.key)}">${esc(envios.get(sh.key) || '')}</small></span>
        ${sh.file ? '' : `<button type="button" class="sp-btn ctrl${sh.controle ? ' on' : ''}" data-act="ctrl" title="${sh.controle ? 'Parar de deixar controlar' : 'Permitir que mexam nesta tela'}">${icon('cursor', 16)}</button>`}
        <button type="button" class="sp-btn${noTelao ? ' on' : ''}" data-act="pin" title="${noTelao ? 'Tirar do telão' : 'Pôr no telão'}">${icon('pin', 16)}</button>
        <button type="button" class="sp-btn danger" data-act="stop" title="Parar esta tela">${icon('x', 16)}</button>
      </div>`;
    }).join('')
    + `<button type="button" class="sp-add" data-act="add"${cabe ? '' : ' disabled'}>${icon('share', 16)}${!cabe ? 'Telas e telão ocupados' : vaiProTelao ? 'Compartilhar outra direto no telão' : 'Compartilhar outra aba ou janela'}</button>`
    + (telas.length > 1 ? '<button type="button" class="sp-stop-all" data-act="stop-all">Parar todas</button>' : '')
    + `<p class="sp-dica">${dicaSemFaixa()}</p>`;
}

// a extensão está aqui, liberada para esta sala, e é pelo menos a versão a.b
const extensaoNaVersao = (a, b) => controle.ext.ok && controle.ext.liberado && versaoNum(controle.ext.versao) >= versaoNum(`${a}.${b}`);
// a faixa "Compartilhando ... com esta guia" do Chrome só some quando a aba vem pela extensão (1.3+)
const extTemCaptura = () => controle.ext.ok && versaoNum(controle.ext.versao) >= versaoNum('1.3');
// O atalho de mostrar uma aba sem a faixa, como está no Chrome da pessoa: ela pode ter trocado em
// chrome://extensions/shortcuts, ou outra extensão ficou com ele ('' = sem atalho). A extensão de
// antes da 1.11 não conta qual é: vale o de fábrica.
const atalhoDaExt = () => controle.ext.atalho ?? 'Alt+Shift+S';
const teclasHtml = (a) => a.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+');
const comoMostrarAba = () => (atalhoDaExt() ? `aperte ${teclasHtml(atalhoDaExt())}` : 'clique no ícone da extensão Sala 3D');
function dicaSemFaixa() {
  if (extTemCaptura()) return `Sem a faixa do Chrome no topo: vá na aba que quer mostrar e ${comoMostrarAba()}.`;
  if (controle.ext.ok) return 'Atualize a extensão Sala 3D (versão 1.3) para compartilhar abas sem a faixa do Chrome no topo.';
  return 'Com a extensão Sala 3D (em Ajustes) dá para compartilhar abas sem a faixa do Chrome no topo.';
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
  // as minhas telas: o evento vai direto para a extensão, sem ida e volta pelo servidor
  minha: (key) => self()?.shares.get(key) ?? null,
  toast,
  onExtensao: () => {
    renderSharePop();
    avisarAbas();
    guia.atualizar();
    renderExtensao();
    avisarExtensaoVelha();
  },
});
// Alt+Shift+S (ou o ícone da extensão) numa aba: a resposta vai para o ícone dela
controle.onCapturarAba = async (p) => controle.responderPedido(p.pedido, await capturarAbaDaExtensao(p));
// o mesmo atalho na aba que já está na sala: tira ela de lá
controle.onPararAba = ({ aba, pedido }) => {
  const sh = [...(self()?.shares.values() || [])].find((s) => s.aba === aba);
  if (sh) {
    stopShare(sh.key, true);
    toast(`A aba${sh.titulo ? ` “${sh.titulo.slice(0, 40)}”` : ''} saiu da sala.`, 'info', 3500);
  }
  controle.responderPedido(pedido, sh ? { ok: true, parou: true } : { erro: 'sala', msg: 'Essa aba não está na sala.' });
};

// Guia de instalação da extensão (ver guia-extensao.js). Abre sozinho quando alguém tenta liberar
// o controle sem ela, e fica em Ajustes → Extensão de controle.
// extensaoNova: a versão que este servidor entrega (do /config, ao entrar)
let extensaoNova = null;
const guia = new GuiaExtensao({ raiz: $('#guia-ext'), controle, versaoNova: () => extensaoNova });
const abrirGuiaExtensao = (foco) => guia.abrir(foco);

function renderExtensao() {
  const { ok, liberado, versao } = controle.ext;
  const velha = guia.desatualizada;
  $('#ext-status').textContent = velha ? `Versão ${versao} instalada · tem a ${extensaoNova}, com novidades`
    : ok && liberado ? `Instalada e liberada neste site${versao ? ` · versão ${versao}` : ''}`
      : ok ? 'Instalada, mas falta liberar este site'
        : 'Para deixarem mexer nas suas abas';
  $('#ext-guia').textContent = velha ? 'Atualizar' : ok && liberado ? 'Ver guia' : ok ? 'Liberar' : 'Instalar';
}
renderExtensao();
if (isTouch) $('#ext-row').hidden = true; // celular não compartilha tela
$('#ext-guia').addEventListener('click', () => abrirGuiaExtensao());

// Com uma extensão mais velha que a do servidor, um aviso por visita (só para quem a tem: quem
// compartilha). Ajustes e o guia continuam mostrando como atualizar.
let avisouExtensaoVelha = false;
function avisarExtensaoVelha() {
  if (avisouExtensaoVelha || !state.joined || !guia.desatualizada) return;
  avisouExtensaoVelha = true;
  toast(`Tem uma versão nova da extensão Sala 3D (${extensaoNova}).`, 'info', 10000, null, { rotulo: 'Atualizar', fazer: () => abrirGuiaExtensao() });
}

// ------------------------------------------------------------------ a volta do controle
// O que o site da aba controlada responde e só quem controla deve ver: um aviso (alert, confirm,
// prompt, "sair do site?") esperando resposta, ou o texto que ela copiou (Ctrl+C). Ver controle.js.
const avisoSite = new AvisoDoSite({ raiz: $('#aviso-site'), controle, responder: (key, ev) => controle.mandar(key, ev) });

// Aviso do site numa aba minha sob controle: vai para quem mexeu nela por último — ou aparece
// aqui mesmo, se fui eu (mexendo na minha própria aba pela sala).
controle.onDialogo = (aba, dialogo, site) => {
  for (const sh of self()?.shares.values() || []) {
    if (sh.aba !== aba) continue;
    const quem = controle.ultimo.get(sh.key);
    if (!quem) continue;
    const ev = dialogo ? { t: 'dialogo', ...dialogo, site } : { t: 'dialogo', fechou: true };
    if (quem.deId) socket?.emit('controle-volta', { key: sh.key, para: quem.deId, ev });
    else avisoSite.receber(sh.key, ev, 'Na sua aba');
  }
};

async function copiarDaTela(texto, de) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(`Copiado da tela de ${de || 'alguém'} (${texto.length} ${texto.length === 1 ? 'caractere' : 'caracteres'}).`, 'success', 2500);
  } catch {
    toast(`Não deu para copiar o texto da tela de ${de || 'alguém'}: clique na sala e tente de novo.`, 'warn', 5000);
  }
}

// a janela compartilhada sumiu para o ajudante do Windows (fechou?): um aviso de vez em quando
let avisoAlvo = 0;
controle.onAlvoPerdido = () => {
  if (Date.now() - avisoAlvo < 30_000) return;
  avisoAlvo = Date.now();
  toast('O ajudante do Windows não achou a janela que você compartilhou. Pare e compartilhe ela de novo para voltar a deixar controlar.', 'warn', 9000);
};

// Na primeira vez depois de instalar ou atualizar, o ajudante do Windows se compila: uns segundos
// sem resposta. Passando de um instante, um aviso diz que ele está vindo.
async function esperandoAjudante(pedido) {
  let fechar = null;
  const timer = setTimeout(() => { fechar = toast('Abrindo o ajudante do Windows…', 'info', 15000); }, 800);
  try {
    return await pedido;
  } finally {
    clearTimeout(timer);
    fechar?.();
  }
}

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
  const janelasOk = janelas.length > 0 && !(await esperandoAjudante(controle.retomarJanela()))?.erro;
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
// Aba: fechou a barra amarela do Chrome. Janela: Ctrl+Alt+End no teclado de quem compartilha. As
// duas: "Cortar o controle agora", no ícone da extensão (motivo 'cortado', um aviso por tela).
let avisoCorte = 0;
controle.onDesligou = (aba, motivo, janela) => {
  let desligou = false;
  for (const sh of self()?.shares.values() || []) {
    if (!sh.controle || (janela ? !sh.alvo : sh.aba !== aba)) continue;
    socket?.emit('controle-permitir', { key: sh.key, on: false });
    desligou = true;
  }
  // a aba fechou: a tela sai do ar sozinha, sem aviso
  if (!desligou || motivo === 'target_closed') return;
  if (motivo === 'cortado') {
    if (Date.now() - avisoCorte < 3000) return;
    avisoCorte = Date.now();
  }
  toast(motivo === 'cortado' ? 'Você cortou o controle pelo ícone da extensão. Para deixar de novo, use "Permitir controle".'
    : janela ? 'Controle cortado pelo Ctrl+Alt+End.' : 'O controle da aba foi desligado (a barra amarela do Chrome foi fechada).', 'info', 6000);
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
    const r = await esperandoAjudante(controle.retomarJanela());
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
  // Modo jogo: só em janela/tela inteira dos outros (o ajudante nativo é quem manda delta/scancode)
  const jb = $('#focus-jogo');
  const janela = !!t && !t.user.isSelf && !isTouch
    && ['window', 'monitor'].includes(t.share.video?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().displaySurface);
  if ((!on || !janela) && controle.jogoNo === fv) controle.desligarJogo();
  jb.hidden = !on || !janela;
  const emJogo = controle.jogoNo === fv;
  jb.classList.toggle('on', emJogo);
  jb.innerHTML = `${icon('gamepad', 16)}${emJogo ? 'Desligar modo jogo' : 'Modo jogo'}`;
  jb.title = 'Mouse gira a câmera e WASD anda (Minecraft e cia.). F8 liga e desliga.';
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

// Modo jogo (Minecraft e cia.): mouse vira câmera, WASD anda. Esc pausa o jogo e solta o
// mouse; clicar na tela prende de novo. Com o ponteiro preso não dá para clicar no botão — por
// isso o F8 (ver controle.atalho).
$('#focus-jogo').addEventListener('click', () => {
  const fv = $('#focus-video');
  const ligar = controle.jogoNo !== fv;
  controle.modoJogo(fv, ligar);
  updateFocusCtrl();
  if (ligar) toast('Modo jogo ligado: o mouse gira a câmera e o teclado anda com o personagem. Esc pausa o jogo e solta o mouse; clique na tela para voltar. F8 liga e desliga.', 'info', 9000);
});
controle.onJogoSoltou = () => {
  if (controle.jogoNo) toast('Esc soltou o mouse (o jogo recebeu o Esc). Clique na tela para voltar a jogar, ou F8 para desligar o modo jogo.', 'info', 6000);
};

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
  ['futebol', 'Futebol de carro', 'Bola gigante, gols e turbo para voar'],
  ['volei', 'Vôlei', 'Na areia, com os bonecos'],
  ['basquete', 'Basquete', 'Arremesso com barra de força'],
  ['boliche', 'Boliche', '2 pistas, até 4 por pista'],
  ['surf', 'Surf', 'Rampas no céu, como no CS'],
  ['matamata', 'Mata-mata', 'Arena com armas no chão (X1)'],
  ['batalha', 'Mata-mata em times', 'Autobots × Decepticons, rodadas; quem cai assiste'],
  ['xadrez', 'Xadrez de bruxo', ''],
  ['dama', 'Dama gigante', ''],
  ['velha', 'Jogo da velha', ''],
  ['dados', 'Mesa de dados', 'Apostas com moedas'],
  ['poderes', 'Poderes', 'Voar e pulo alto'],
  ['armas', 'Arma da camiseta 22', ''],
  ['pingue', 'Pingue-pongue', 'Salão de jogos do parque; sozinho, contra o robô'],
  ['queimada', 'Queimada', 'Times Azul × Vermelho, com cemitério'],
  ['sinuca', 'Sinuca', 'Bola 8 no salão de jogos, até dois por mesa'],
  ['golfe', 'Minigolfe', '9 buracos com moinho, morros e água'],
  ['truco', 'Truco', 'Truco paulista em duplas, com robôs'],
  ['uno', 'Uno', 'Até 6 na mesa, com robôs'],
  ['gincana', 'Gincana', '10 fases estilo Fall Guys e a final dos hexágonos'],
  ['kart', 'Kart', 'Kartódromo com itens, 3 voltas'],
  ['pinta', 'Pinta-território', 'Times pintam o chão com tinta'],
];
const AREAS_DE_JOGO = ['parkour', 'ringue', 'corrida', 'futebol', 'volei', 'basquete', 'boliche', 'surf', 'matamata', 'batalha', 'xadrez', 'dama', 'velha', 'dados', 'pingue', 'queimada', 'sinuca', 'golfe', 'cartas', 'gincana', 'kart', 'pinta'];
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
// Trocar de mundo recarrega a página (mundoDaSala): quem era dono ou gestor continua sendo do outro
// lado. As senhas passam só por essa recarga, nesta aba, e são apagadas assim que lidas.
const CHAVE_RECARGA = 'sala3d-recarga';
const senhasDaRecarga = (() => {
  try {
    const d = JSON.parse(sessionStorage.getItem(CHAVE_RECARGA) || 'null');
    sessionStorage.removeItem(CHAVE_RECARGA);
    return d && d.sala === idDaSala(params.get('sala')) ? d : {};
  } catch {
    return {};
  }
})();
let senhaDono = senhasDaRecarga.dono || null; // só na memória: se a conexão cair, entra como dono de novo sozinho
let formSujo = false; // o dono está mexendo no formulário: o que chega do servidor não apaga

// logo da empresa: carrega a imagem uma vez por logo novo e põe no mundo e no topo da tela
let logoCarregado = null;
function aplicarLogo(src) {
  if (src === logoCarregado) return;
  logoCarregado = src;
  $('#room-logo').hidden = !src;
  if (!src) return world.setLogo(null);
  const img = new Image();
  img.onload = () => {
    if (logoCarregado !== src) return;
    $('#room-logo').src = src;
    world.setLogo(img);
  };
  img.src = src;
}

// A sala usa outro mundo que o montado nesta página (ver mundo.js): recarrega já entrando nela, com o
// mundo certo. Acontece na primeira visita a uma sala do mundo novo e quando o dono troca o mundo
// com gente dentro.
function mundoDaSala(cfg) {
  const mundo = MUNDOS[cfg.mundo] ? cfg.mundo : 'classico';
  if (!state.room) return false;
  lembrarMundo(state.room, mundo);
  if (mundo === MUNDO) return false;
  toast(`Indo para o mundo ${MUNDOS[mundo].nome}…`, 'info', 6000);
  if (senhaDono || senhaGestor) {
    try {
      sessionStorage.setItem(CHAVE_RECARGA, JSON.stringify({ sala: state.room, dono: senhaDono, gestor: senhaGestor }));
    } catch { /* sem sessionStorage: entra de novo como dono pelo painel */ }
  }
  recarregarNaSala(state.room, mundo);
  return true;
}

function aplicarSala(cfg) {
  if (!cfg) return;
  if (mundoDaSala(cfg)) return;
  state.sala = cfg;
  aplicarLogo(cfg.logo || '');
  clima.setConfig(cfg);
  if (state.room) salas.visitar(state.room, { empresa: cfg.empresa, temSenha: cfg.temSenha });
  let mudou = false;
  // as mesas de cartas são uma área só, ligada se o truco ou o uno estiver
  for (const j of AREAS_DE_JOGO) mudou = world.ligarArea(j, j === 'cartas' ? jogoLigado('truco') || jogoLigado('uno') : jogoLigado(j)) || mudou;
  if (mudou) world.aquecerShaders(); // o número de luzes pode ter mudado
  // o cinema (Lazer) ou o prédio do escritório com os departamentos escolhidos
  if (world.setModo(cfg)) {
    // a planta mudou com gente dentro: volta para a entrada (senão alguém fica dentro de uma parede)
    if (state.joined) irParaEntrada();
  }
  refreshScreens(); // outro ambiente, ou só outras páginas fixas nas telas
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
  mostrarAviso();
  ondeAntes = undefined; // o chip de onde estou redesenha (planta ou privacidade podem ter mudado)
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
    <small>Ambiente: ${esc(amb.nome)} · Mundo: ${esc((MUNDOS[cfg.mundo] || MUNDOS.classico).nome)} · ${desligados ? `${desligados} ${desligados === 1 ? 'jogo desligado' : 'jogos desligados'}` : 'todos os jogos ligados'}${cfg.temSenha ? ' · com senha' : ''}${modoEscritorio() && cfg.privacidade !== false ? ' · salas à prova de som' : ''}</small>
  </span></div>${state.donoDaSala ? '<p class="hint">Você é o dono desta sala.</p>' : souGestor() ? '<p class="hint">Você é gestor desta sala.</p>' : ''}`;
  $('#sala-gestor').hidden = !cfg.temGestor || souGestor() || state.donoDaSala;
  $('#gestor-status').textContent = cfg.temGestor
    ? 'Ligada: quem entra com ela vira gestor e recebe os alertas.'
    : 'Sem senha: só você (o dono) recebe os alertas da equipe.';
  $('#gestor-salvar').textContent = cfg.temGestor ? 'Trocar' : 'Criar';
  $('#gestor-tirar').hidden = !cfg.temGestor;
  renderIrPara();
  renderEquipe();
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
  const f = $('#sala-config').elements;
  f.empresa.value = cfg.empresa || '';
  logoNovo = undefined;
  mostrarPreviaLogo(cfg.logo || '');
  f.aviso.value = cfg.aviso || '';
  f.privacidade.checked = cfg.privacidade !== false;
  f.listada.checked = cfg.listada !== false;
  const opcoes = (lista, atual) => Object.entries(lista).map(([id, o]) => `<option value="${id}"${id === atual ? ' selected' : ''}>${o.nome}</option>`).join('');
  $('#sala-config').elements.clima.innerHTML = opcoes(CLIMAS, cfg.clima || 'auto');
  $('#sala-config').elements.horario.innerHTML = opcoes(HORARIOS, cfg.horario || 'ciclo');
  $('#sala-modulos').innerHTML = MODOS.map((a) => `<label class="modulo">
      <input type="radio" name="modulo" value="${a.id}"${cfg.modulo === a.id ? ' checked' : ''}>
      <b>${a.nome}</b><small>${a.desc}</small>
    </label>`).join('');
  $('#sala-mundos').innerHTML = Object.entries(MUNDOS).map(([id, m]) => `<label class="modulo">
      <input type="radio" name="mundo" value="${id}"${(cfg.mundo || 'classico') === id ? ' checked' : ''}>
      <b>${m.nome}</b><small>${m.desc}</small>
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
  $('#paginas-linhas').innerHTML = '';
  for (const [chave, url] of Object.entries(cfg.paginas || {})) linhaDePagina(chave, url);
}

// ---------------------------------------------------- páginas fixas nas telas (ver paginas.js)
// As telas de parede do ambiente que está no ar (o que mudar nos departamentos só aparece aqui
// depois do "Salvar para todos"). Os monitores dos postos ficam de fora.
function telasParaPagina() {
  const lista = [];
  world.slots.forEach((s, i) => {
    const chave = world.chaveTela(i);
    if (chave && !s.posto) lista.push({ chave, nome: world.rotuloTela(i) });
  });
  return lista;
}
function linhaDePagina(chave = '', url = '') {
  const lista = $('#paginas-linhas');
  if (lista.children.length >= 24) return;
  const telas = telasParaPagina();
  // tela guardada que não existe no ambiente de agora (departamento tirado): continua na lista
  if (chave && !telas.some((t) => t.chave === chave)) telas.push({ chave, nome: `${chave} (fora do ambiente atual)` });
  const div = document.createElement('div');
  div.className = 'pagina-linha';
  div.innerHTML = `<select name="ptela" aria-label="Tela">${telas.map((t) => `<option value="${esc(t.chave)}">${esc(t.nome)}</option>`).join('')}</select>
    <input name="purl" inputmode="url" spellcheck="false" maxlength="500" placeholder="https://…">
    <button type="button" class="icon-btn" data-remover aria-label="Tirar a página">${icon('x', 14)}</button>`;
  if (chave) div.querySelector('select').value = chave;
  div.querySelector('input').value = url;
  lista.appendChild(div);
}
$('#pagina-add').addEventListener('click', () => {
  linhaDePagina();
  formSujo = true;
  $('#paginas-linhas').lastElementChild?.querySelector('input')?.focus();
});
$('#paginas-linhas').addEventListener('click', (e) => {
  if (!e.target.closest('[data-remover]')) return;
  e.target.closest('.pagina-linha').remove();
  formSujo = true;
});
// a sala é https: página http seria bloqueada pelo navegador (conteúdo misto), então vai de https
const paraIframe = (url) => (url && location.protocol === 'https:' ? url.replace(/^http:/i, 'https:') : url);
const lerPaginas = () => {
  const saida = {};
  for (const l of $$('#paginas-linhas .pagina-linha')) {
    const url = paraIframe(enderecoDigitado(l.querySelector('[name="purl"]').value));
    if (url) saida[l.querySelector('[name="ptela"]').value] = url;
  }
  return saida;
};

// ---------------------------------------------------- logo da empresa (formulário do dono)
let logoNovo; // undefined = não mexeu; '' = tirar; data URL = novo
function mostrarPreviaLogo(src) {
  $('#logo-prev').innerHTML = src ? `<img src="${src}" alt="Logo">` : '<small>Sem logo</small>';
  $('#logo-clear').hidden = !src;
}
// reduz para caber em 512 px (e no banco): WebP mantém o fundo transparente
function reduzirLogo(img) {
  for (const lado of [512, 384, 256, 192]) {
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/webp', 0.9);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    if (url.length < 150_000) return url;
  }
  return null;
}
$('#logo-pick').addEventListener('click', () => $('#logo-file').click());
$('#logo-file').addEventListener('change', (e) => {
  const arq = e.target.files?.[0];
  e.target.value = '';
  if (!arq) return;
  const url = URL.createObjectURL(arq);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const dados = reduzirLogo(img);
    if (!dados) return toast('Essa imagem ficou grande demais. Tente um PNG mais simples.', 'error');
    logoNovo = dados;
    formSujo = true;
    mostrarPreviaLogo(dados);
    toast('Logo pronto. Clique em “Salvar para todos” para aplicar.', 'info', 4000);
  };
  img.onerror = () => toast('Não deu para abrir essa imagem.', 'error');
  img.src = url;
});
$('#logo-clear').addEventListener('click', () => {
  logoNovo = '';
  formSujo = true;
  mostrarPreviaLogo('');
});

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
  $('#campo-privacidade').hidden = !escritorio;
};
// o prédio tem vagas para MAX_SALAS departamentos
$('#sala-deptos').addEventListener('change', (e) => {
  if (e.target.checked && $('#sala-deptos input:checked').length > MAX_SALAS) {
    e.target.checked = false;
    toast(`O prédio tem lugar para ${MAX_SALAS} departamentos. Desmarque um para pôr este.`, 'warn', 5000);
  }
});
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
  // painel da sala de Gestão: todo mundo, os parados primeiro
  const ordem = (u) => (PARADOS.includes(presencaDe(u)) ? 0 : 1);
  const equipe = [...state.users.values()].sort((a, b) => ordem(a) - ordem(b) || a.name.localeCompare(b.name)).map((u) => {
    const pres = presencaDe(u);
    return { nome: u.name, status: pres, texto: `${NOMES_PRESENCA[pres]}${pres !== 'disponivel' && u.desde ? ` há ${haQuanto(u.desde)}` : ''} · ${localDe(u)}` };
  });
  const parados = equipe.filter((p) => PARADOS.includes(p.status)).length;
  const d = new Date();
  world.escritorio.equipe?.(equipe, `${equipe.length - parados} trabalhando · ${parados} ${parados === 1 ? 'parado' : 'parados'} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  world.escritorio.status({
    empresa: state.sala?.empresa || '',
    pessoas: state.users.size,
    porSala,
    telasPorSala,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  });
}
setInterval(atualizarPaineis, 5000);

// ---------------------------------------------------- empresa: presença, gestores, comunicado, ir para
// Presença: cada um escolhe o status (Disponível, Ocupado...). Sem mexer em nada por 10 minutos
// vira "Inativo" sozinho, e entrar na sala Descanso põe "Em pausa" até sair de lá. Os gestores
// (senha de gestor, ou o dono) veem a equipe e recebem um alerta quando alguém para de trabalhar.
const NOMES_PRESENCA = { disponivel: 'Disponível', ocupado: 'Ocupado', reuniao: 'Em reunião', pausa: 'Em pausa', almoco: 'No almoço', ausente: 'Ausente', inativo: 'Inativo' };
const ESCOLHAS_STATUS = ['disponivel', 'ocupado', 'reuniao', 'pausa', 'almoco', 'ausente'];
const PARADOS = ['pausa', 'almoco', 'ausente', 'inativo'];
const INATIVO_MS = 10 * 60 * 1000;
if (!ESCOLHAS_STATUS.includes(settings.status)) settings.status = 'disponivel';
function presencaDe(u) {
  if (u?.inativo) return 'inativo';
  return ESCOLHAS_STATUS.includes(u?.status) ? u.status : 'disponivel';
}
function haQuanto(t) {
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
function nomeDoLugar(id) {
  if (id == null) return 'Lá fora';
  return { recepcao: 'Recepção', corredor: 'Corredor', lounge: 'Lounge' }[id] || DEPARTAMENTOS[id]?.nome || '';
}
const posDe = (u) => (u.isSelf ? player.pos : u.avatar.group.position);
// onde a pessoa está no escritório ("TI", "Recepção"); fora do escritório, nada
function localDe(u) {
  if (!modoEscritorio() || !world.planta) return '';
  const p = posDe(u);
  return nomeDoLugar(world.salaEm(p.x, p.z));
}
// salas à prova de som: quem está num departamento só ouve (e é ouvido por) quem está na mesma sala.
// p: onde a pessoa está (a posição que chegou pela rede, para decidir antes de o boneco chegar lá)
function mesmoAmbiente(u, p = u.avatar.group.position) {
  if (!modoEscritorio() || state.sala?.privacidade === false || !world.planta) return true;
  const a = world.salaEm(player.pos.x, player.pos.z);
  const b = world.salaEm(p.x, p.z);
  return a === b || (!DEPARTAMENTOS[a] && !DEPARTAMENTOS[b]);
}

// A minha voz só sai para quem pode ouvir (rtc.vozPara): quem está em outra sala à prova de som
// não recebe nem decodifica nada. Volta na hora em que a pessoa entra; ao sair, só depois de 2,5 s,
// para não cortar e religar de quem para na porta.
const vozFora = new Map(); // id -> desde quando a pessoa está fora do meu ambiente
function atualizarVoz() {
  if (!state.joined || !rtc?.vozPara) return;
  const agora = performance.now();
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    let ouve = mesmoAmbiente(u, u.avatar.target);
    if (ouve) vozFora.delete(u.id);
    else {
      if (!vozFora.has(u.id)) vozFora.set(u.id, agora);
      ouve = agora - vozFora.get(u.id) < 2500;
    }
    rtc.vozPara(u.id, ouve);
  }
}

// ----- o meu status
const selStatus = $('#meu-status');
selStatus.innerHTML = ESCOLHAS_STATUS.map((id) => `<option value="${id}">${NOMES_PRESENCA[id]}</option>`).join('');
let pausaAuto = false; // "Em pausa" posto pelo Descanso (volta sozinho ao sair de lá)
function meuStatusMudou() {
  const me = self();
  const pres = presencaDe(me || { status: settings.status });
  selStatus.value = me?.status && !me.inativo ? me.status : settings.status;
  $('#meu-status-dot').style.setProperty('--s', COR_STATUS[pres]);
  $('#meu-status-sub').textContent = pres === 'inativo'
    ? 'Inativo: mexa em qualquer coisa para voltar'
    : pausaAuto ? 'Em pausa enquanto estiver no Descanso' : PARADOS.includes(pres) ? 'Os gestores foram avisados' : 'Os outros veem ao lado do seu nome';
  renderPeople();
}
function mudarStatus(status, { auto = false } = {}) {
  if (!auto) {
    settings.status = status;
    saveSettings();
  }
  const me = self();
  if (me) {
    me.status = status;
    me.desde = Date.now();
  }
  socket?.emit('status', { status });
  meuStatusMudou();
}
selStatus.addEventListener('change', () => {
  pausaAuto = false;
  mudarStatus(selStatus.value);
  selStatus.blur();
});
function marcarInativo(v) {
  const me = self();
  if (!me || me.inativo === v) return;
  me.inativo = v;
  me.desde = Date.now();
  socket?.emit('status', { inativo: v });
  meuStatusMudou();
  if (!v) toast('Que bom que voltou! Seu status saiu de "Inativo".', 'info', 3500);
}
// qualquer mexida conta como atividade (falar e compartilhar tela também)
let ultimaAcao = Date.now();
const mexeu = () => {
  ultimaAcao = Date.now();
  if (self()?.inativo) marcarInativo(false);
};
for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(ev, mexeu, { passive: true, capture: true });
setInterval(() => {
  if (!state.joined) return;
  if (state.speaking || self()?.shares.size) ultimaAcao = Date.now();
  if (Date.now() - ultimaAcao > INATIVO_MS) marcarInativo(true);
}, 15000);

// onde estou (chip no topo) e a pausa automática do Descanso
let ondeAntes = undefined;
setInterval(() => {
  if (!state.joined) return;
  const esc0 = modoEscritorio() && !!world.planta;
  $$('.onde').forEach((el) => { el.hidden = !esc0; });
  const lugar = esc0 ? world.salaEm(player.pos.x, player.pos.z) : null;
  if (esc0 && lugar !== ondeAntes) {
    ondeAntes = lugar;
    const fechada = !!DEPARTAMENTOS[lugar] && state.sala?.privacidade !== false;
    $('#onde-chip').innerHTML = `${fechada ? icon('lock', 12) : ''}${esc(nomeDoLugar(lugar))}`;
    $('#onde-chip').title = fechada ? 'Sala à prova de som: só quem está aqui ouve a conversa' : 'Onde você está no escritório';
    renderPeople();
  }
  if (esc0 && lugar === 'descanso' && !pausaAuto && settings.status === 'disponivel') {
    pausaAuto = true;
    mudarStatus('pausa', { auto: true });
    toast('Você entrou no Descanso: seu status ficou "Em pausa" até sair daqui.', 'info', 5000);
  } else if (pausaAuto && lugar !== 'descanso') {
    pausaAuto = false;
    mudarStatus(settings.status, { auto: true });
  }
}, 1000);

// ----- gestores
let senhaGestor = senhasDaRecarga.gestor || null; // só na memória, como a de dono
const alertas = []; // últimos avisos da equipe (para o painel do gestor)
const souGestor = () => !!self()?.gestor;
function avisoDoNavegador(titulo, corpo) {
  // aba escondida: notificação do sistema (se a pessoa deixou)
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(titulo, { body: corpo, icon: '/icons/icon-192.png', tag: 'sala3d-equipe' }); } catch { /* sem suporte */ }
}
function pedirNotificacoes() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
function alertaDaEquipe({ tipo, texto, cor }) {
  const d = new Date();
  alertas.unshift({ texto, tipo, hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
  alertas.length = Math.min(alertas.length, 12);
  renderEquipe();
  if (!settings.alertasGestor) return;
  // entrar e sair já aparecem para todo mundo; parar e voltar são só dos gestores
  if (tipo === 'parado' || tipo === 'voltou') {
    toast(texto, tipo === 'parado' ? 'warn' : 'success', 6500, cor);
    sfx.message();
  }
  avisoDoNavegador(state.sala?.empresa || 'Equipe', texto);
}
function renderEquipe() {
  const box = $('#sala-equipe');
  if (!box) return;
  box.hidden = !souGestor();
  if (box.hidden) return;
  const outros = [...state.users.values()].filter((u) => !u.isSelf);
  const parados = outros.filter((u) => PARADOS.includes(presencaDe(u)));
  $('#equipe-resumo').textContent = outros.length
    ? `${outros.length - parados.length} trabalhando · ${parados.length} ${parados.length === 1 ? 'parado' : 'parados'}`
    : '';
  const ordem = (u) => (PARADOS.includes(presencaDe(u)) ? 0 : 1);
  const linhas = outros.sort((a, b) => ordem(a) - ordem(b) || a.name.localeCompare(b.name)).map((u) => {
    const pres = presencaDe(u);
    const local = localDe(u);
    return `<li class="${PARADOS.includes(pres) ? 'parado' : ''}" data-id="${esc(u.id)}">
      <i class="pres-dot solto" style="--s:${COR_STATUS[pres]}"></i>
      <span><b>${esc(u.name)}</b><small>${NOMES_PRESENCA[pres]}${pres !== 'disponivel' && u.desde ? ` há ${haQuanto(u.desde)}` : ''}${local ? ` · ${esc(local)}` : ''}</small></span>
      <button type="button" class="icon-btn" data-act="chamar" title="Chamar">${icon('sino', 15)}</button>
      <button type="button" class="icon-btn" data-act="goto" title="Ir até">${icon('goto', 16)}</button>
    </li>`;
  }).join('');
  const log = alertas.map((a) => `<li class="log ${a.tipo}"><time>${a.hora}</time>${esc(a.texto)}</li>`).join('');
  $('#equipe-lista').innerHTML = (linhas || '<li class="empty">Só você na sala agora.</li>') + (log ? `<li class="log-titulo">Últimos avisos</li>${log}` : '');
}
$('#equipe-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  const u = b && state.users.get(b.closest('[data-id]')?.dataset.id);
  if (!u) return;
  if (b.dataset.act === 'goto') irAte(u);
  if (b.dataset.act === 'chamar') chamar(u);
});
$('#alertas-gestor').checked = settings.alertasGestor !== false;
$('#alertas-gestor').addEventListener('change', (e) => {
  settings.alertasGestor = e.target.checked;
  saveSettings();
  if (e.target.checked) pedirNotificacoes();
});
setInterval(() => { if (state.panel === 'sala') renderEquipe(); }, 20000);
$('#sala-gestor').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const senha = form.elements.senha.value;
  pedirNotificacoes();
  socket.emit('sala-gestor', { senha }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Senha de gestor errada.', 'error');
    senhaGestor = senha;
    form.reset();
    toast('Você entrou como gestor: vai ver a equipe aqui e receber os alertas.', 'success', 6000);
  });
});
function reentrarComoGestor() {
  if (!senhaGestor) return;
  socket.emit('sala-gestor', { senha: senhaGestor }, (r) => { if (!r?.ok) senhaGestor = null; });
}
// senha de gestor (o dono cria, troca ou tira; vale na hora)
function mudarSenhaDeGestor(senha) {
  const campo = $('#sala-config').elements.gestorSenha;
  socket.emit('sala-gestor-senha', { senha }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para mudar a senha de gestor.', 'error');
    campo.value = '';
    toast(senha ? 'Senha de gestor pronta. Passe para os gestores: eles entram com ela no painel "Sala da empresa".' : 'Senha de gestor tirada.', 'success', 7000);
  });
}
$('#gestor-salvar').addEventListener('click', () => {
  const v = $('#sala-config').elements.gestorSenha.value;
  if (v.length < 4) return toast('A senha de gestor precisa ter pelo menos 4 caracteres.', 'warn');
  mudarSenhaDeGestor(v);
});
$('#gestor-tirar').addEventListener('click', () => mudarSenhaDeGestor(''));

// ----- chamar alguém ("toque no ombro")
let ultimoChamar = 0;
function chamar(u) {
  if (Date.now() - ultimoChamar < 4000) return toast('Espere uns segundos para chamar de novo.', 'info', 2500);
  ultimoChamar = Date.now();
  socket.emit('chamar', u.id);
  toast(`Você chamou ${u.name}.`, 'info', 3000, u.color);
}
let chamadoDe = null;
let timerChamado = null;
function foiChamado({ id, nome, cor }) {
  chamadoDe = id;
  $('#chamado-nome').textContent = nome;
  $('#chamado-dot').style.setProperty('--c', cor);
  $('#chamado-dot').textContent = (nome[0] || '?').toUpperCase();
  $('#chamado').hidden = false;
  sfx.join();
  avisoDoNavegador('Chamado', `${nome} está te chamando`);
  clearTimeout(timerChamado);
  timerChamado = setTimeout(() => { $('#chamado').hidden = true; }, 25000);
}
$('#chamado-ir').addEventListener('click', (e) => {
  e.currentTarget.blur();
  const u = state.users.get(chamadoDe);
  $('#chamado').hidden = true;
  if (u) irAte(u);
  else toast('Essa pessoa já saiu.', 'info');
});
$('#chamado-fechar').addEventListener('click', () => { $('#chamado').hidden = true; });

// ----- comunicado da empresa (faixa no topo; quem fecha não vê de novo o mesmo texto)
let avisoFechado = '';
try { avisoFechado = sessionStorage.getItem('sala3d-aviso') || ''; } catch { /* sem storage */ }
function mostrarAviso() {
  const aviso = state.sala?.aviso || '';
  $('#aviso-texto').textContent = aviso;
  $('#aviso-empresa').hidden = !aviso || aviso === avisoFechado;
}
$('#aviso-fechar').addEventListener('click', () => {
  avisoFechado = state.sala?.aviso || '';
  try { sessionStorage.setItem('sala3d-aviso', avisoFechado); } catch { /* sem storage */ }
  mostrarAviso();
});

// ----- ir para (atalho para cada sala do escritório, com quantas pessoas há nela)
function renderIrPara() {
  const box = $('#sala-irpara');
  box.hidden = !modoEscritorio() || !world.planta;
  if (box.hidden) return;
  const conta = {};
  for (const u of state.users.values()) {
    const p = posDe(u);
    const id = world.salaEm(p.x, p.z);
    conta[id] = (conta[id] || 0) + 1;
  }
  const lugares = [{ id: 'recepcao', nome: 'Recepção', cor: '#6ee7c8' }, ...world.planta.salas.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor }))];
  $('#irpara-lista').innerHTML = lugares.map((l) => {
    const n = conta[l.id] || 0;
    return `<button type="button" data-ir="${l.id}"><i style="--c:${l.cor}"></i><span><b>${esc(l.nome)}</b><small>${n ? `${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : 'vazia'}</small></span></button>`;
  }).join('');
}
$('#irpara-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  const alvo = b && world.planta && portaDa(world.planta, b.dataset.ir);
  if (!alvo) return;
  b.blur();
  run.cancel();
  hideParkourHud();
  if (player.veiculo) toggleVeiculo();
  player.teleport([alvo.pos[0] + (Math.random() - 0.5) * 1.5, 0, alvo.pos[2]], alvo.yaw);
  if (isTouch) closePanel();
});
setInterval(() => { if (state.panel === 'sala') renderIrPara(); }, 3000);

// ------------------------------------------------------------------ parque
// "Ir para" de cada jogo do parque (o parque fica longe da entrada): cada jogo diz onde se começa
// (lugar()) e com que nome
function renderParque() {
  const lista = jogosDoParque.filter((j) => j.lugar && (j.algumLigado ? j.algumLigado() : jogoLigado(j.id)));
  $('#parque-lista').innerHTML = lista.map((j) => {
    const l = j.lugar();
    return `<button type="button" data-ir="${j.id}"><i style="--c:${l.cor}"></i><span><b>${esc(l.nome)}</b><small>${esc(l.desc)}</small></span></button>`;
  }).join('') || '<p class="hint">Os jogos do parque estão desligados nesta sala.</p>';
}
$('#parque-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  const jogo = b && jogosDoParque.find((j) => j.id === b.dataset.ir);
  if (!jogo) return;
  const l = jogo.lugar();
  run.abandon();
  if (player.veiculo) toggleVeiculo();
  exitFocus();
  player.teleport([l.pos[0] + (Math.random() - 0.5) * 1.2, l.pos[1], l.pos[2] + (Math.random() - 0.5) * 1.2], l.yaw);
  sfx.teleport();
  closePanel();
});

// a conexão caiu e voltou: o servidor esqueceu quem era dono, então prova de novo com a senha
function reentrarComoDono() {
  state.donoDaSala = false;
  reentrarComoGestor();
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
  pedirNotificacoes();
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
  pedirNotificacoes();
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
    mundo: form.querySelector('[name="mundo"]:checked')?.value || 'classico',
    departamentos: $$('#sala-deptos input:checked').map((i) => i.value),
    jogos: Object.fromEntries($$('#sala-jogos input').map((i) => [i.value, i.checked])),
    placar: lerPlacar(),
    paginas: lerPaginas(),
    clima: form.elements.clima.value,
    horario: form.elements.horario.value,
    aviso: form.elements.aviso.value.trim(),
    ...(logoNovo !== undefined ? { logo: logoNovo } : {}),
    privacidade: form.elements.privacidade.checked,
    listada: form.elements.listada.checked,
  };
  socket.emit('sala-config', cfg, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para salvar.', 'error');
    formSujo = false;
    logoNovo = undefined;
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
  // mediu os monitores de novo (abriu, ampliou, mudou de tamanho): cada tela no tamanho dela já
  aoOrganizar: () => setTimeout(atualizarInteresse, 0),
});
controle.atalho = (e, a) => {
  // F8 liga/desliga o modo jogo (com o ponteiro preso não dá para clicar no botão)
  if (e.code === 'F8' && !$('#focus-jogo').hidden) {
    if (a === 'down' && !e.repeat) $('#focus-jogo').click();
    return true;
  }
  return mesa.atalho(e, a);
};

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
  setTimeout(atualizarInteresse, 0);
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
// trilhas que chegaram antes da pessoa estar na lista: entram quando ela entrar (addUser)
const streamsSemDono = new Map(); // peerId -> Map(stream.id -> stream)
function handleTrack(peerId, stream) {
  const u = state.users.get(peerId);
  if (!u) {
    if (!streamsSemDono.has(peerId)) streamsSemDono.set(peerId, new Map());
    streamsSemDono.get(peerId).set(stream.id, stream);
    return;
  }
  if (!u.streams.has(stream.id)) {
    u.streams.set(stream.id, stream);
    stream.addEventListener('removetrack', () => routeStreams(u));
  }
  routeStreams(u);
}

// Decide qual stream é voz e qual é cada uma das telas da pessoa. Devolve se o vídeo de alguma
// tela mudou: só aí as telas do 3D são refeitas (voz e webcam não mexem nelas).
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
      tocarVoz(u);
    }
  }
  // webcam: vai no rosto do boneco
  const cam = u.cam ? u.streams.get(u.cam) : null;
  if (vivo(cam) && cam.getVideoTracks().length) {
    if (!u.camVideo) u.camVideo = makeVideo(true);
    if (u.camVideo.srcObject !== cam) {
      u.camVideo.srcObject = cam;
      u.camVideo.play().catch(() => {});
    }
    u.avatar.setCam(u.camVideo);
  } else {
    u.avatar.setCam(null);
    if (u.camVideo) u.camVideo.srcObject = null;
  }
  let telaMudou = false;
  for (const sh of u.shares.values()) {
    const st = u.streams.get(sh.streamId);
    if (vivo(st)) {
      if (!sh.video) sh.video = makeVideo(true);
      if (sh.video.srcObject !== st) {
        sh.video.srcObject = st;
        tocarTela(sh.video);
        telaMudou = true;
      }
    } else if (sh.video?.srcObject) {
      sh.video.srcObject = null;
      telaMudou = true;
    }
  }
  updateVolumes();
  if (telaMudou) refreshScreens();
  return telaMudou;
}

// ------------------------------------------------------------------ o (+) das telas livres
// Mirar numa tela livre e clicar (ou E): escolhe ali mesmo o que ela mostra — o navegador, uma
// aba/janela compartilhada, ou a próxima aba do Alt+Shift+S. Sem ir até o botão de compartilhar.
let telaDoMais = null;
let alvoDaExtensao = null; // { i, ate }: a próxima aba do Alt+Shift+S vai para a tela i
function menuDaTela(slot) {
  if (document.pointerLockElement) document.exitPointerLock();
  telaDoMais = slot;
  $('#tm-titulo').textContent = world.rotuloTela(slot.index);
  $('#tm-sub').textContent = slot.posto ? 'Monitor do seu posto: escolha o que aparece aqui.' : 'Escolha o que aparece nesta tela.';
  $('#tela-mais [data-tm="extensao"]').hidden = !extTemCaptura();
  $('#tm-atalho').innerHTML = `Vá na aba que quer mostrar e ${comoMostrarAba()}: ela vem para esta tela.`;
  $('#tela-mais').hidden = false;
  $('#hover-hint').hidden = true;
}
function fecharMenuDaTela(voltar = false) {
  $('#tela-mais').hidden = true;
  telaDoMais = null;
  if (voltar) voltarAOlhar();
}
$('#tela-mais').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tm]');
  if (!b) {
    if (e.target.id === 'tela-mais') fecharMenuDaTela(true); // clicou fora do cartão
    return;
  }
  const slot = telaDoMais;
  fecharMenuDaTela();
  if (!slot || b.dataset.tm === 'cancelar') return voltarAOlhar();
  if (b.dataset.tm === 'navegador') {
    navegadores.ligar(world.chaveTela(slot.index));
    refreshScreens();
    enterFocus({ kind: 'pagina', screen: slot });
  } else if (b.dataset.tm === 'compartilhar') {
    novaTela(slot.index);
  } else if (b.dataset.tm === 'extensao') {
    alvoDaExtensao = { i: slot.index, ate: Date.now() + 120_000 };
    toast(`Agora vá na aba que quer mostrar e ${comoMostrarAba().replace(/<[^>]+>/g, '')}: ela aparece em ${world.rotuloTela(slot.index)}.`, 'info', 8000);
  }
});

// H: some com tudo por cima do 3D (barra, botões, chat...). As barras de sair dos focos ficam.
function alternarHud() {
  const sem = document.body.classList.toggle('sem-hud');
  if (sem) toast('Interface escondida. Aperte H para mostrar de novo.', 'info', 2500);
}

// a página fixa que o dono pôs na tela i (ou null)
function paginaDaTela(i) {
  const chave = world.chaveTela(i);
  return (chave && state.sala?.paginas?.[chave]) || null;
}
const siteDaPagina = siteDe;

// O (+) aparece nas telas de parede livres e nos monitores livres do SEU posto (os dos postos
// dos outros são deles).
const aceitaMais = (slot) => !slot.posto || slot.posto === self()?.posto;

function refreshScreens() {
  const telas = telasNoAr();
  const pinned = acharTela(state.main);
  // Fixou a tela de alguém no telão com um vídeo tocando: o vídeo vai para a tela dessa
  // pessoa (trocam de lugar). Antes o vídeo simplesmente sumia.
  const slotMidia = pinned && tv?.state.id && pinned.share.slot != null ? world.slots[pinned.share.slot] : null;
  const comNavegador = []; // telas livres com navegador: { tela, chave, inicio, pessoal }
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
      // navegador (página fixa do dono ou o que você abriu no +): o site aparece de perto; de
      // longe fica o cartaz (ou o painel da sala)
      const chave = world.chaveTela(i);
      const inicio = paginaDaTela(i);
      const pessoal = aceitaMais(slot) ? navegadores.pessoal(chave) : null;
      if (inicio || pessoal) {
        comNavegador.push({ tela: slot, chave, inicio, pessoal });
        slot.setPlaceholder(world.rotuloTela(i), inicio ? `${siteDaPagina(inicio)} — chegue perto para abrir` : 'Seu navegador — chegue perto', false);
        slot.setMais(false);
        slot.setLabel(null);
        return;
      }
      const mais = aceitaMais(slot);
      slot.setMais(mais);
      slot.setPlaceholder(world.rotuloTela(i), mais ? 'Clique no + para compartilhar ou abrir o navegador' : 'Livre — clique em “Compartilhar tela”', mais);
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
  navegadores.sincronizar(comNavegador);
  if (state.focus?.kind === 'pagina' && !navegadores.tem(state.focus.tela)) exitFocus();

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
      // escritório com salas à prova de som: de um departamento para fora (ou para outro), ninguém ouve
      if (!mesmoAmbiente(u)) v = 0;
      if (settings.spatial && me) {
        const d = u.avatar.group.position.distanceTo(localAvatar.group.position);
        v *= THREE.MathUtils.clamp(1 - (d - 6) / 34, 0.1, 1);
      }
      u.audioEl.volume = THREE.MathUtils.clamp(v, 0, 1);
      // no iPhone o volume é só leitura (fica sempre 1): calar de verdade é pelo muted
      const mudo = v <= 0;
      if (u.audioEl.muted !== mudo) {
        u.audioEl.muted = mudo;
        if (!mudo) tocarVoz(u);
      }
    }
    for (const sh of u.shares.values()) if (sh.video) sh.video.volume = settings.screen / 100;
  }
}

// ------------------------------------------------------------------ voz: garantir que toca
// O aro verde vem pelo servidor; a voz, pelo WebRTC. Quando um dos dois falha, aparecia o aro e
// não vinha som. Três causas, três remédios:
// 1) o navegador barrou o play() do <audio> (entrada sem clique, como a recarga depois de um
//    deploy; celular que pausou o áudio em segundo plano): qualquer toque ou tecla toca de novo,
//    e se continuar barrado aparece o botão de ativar o som;
// 2) a pessoa está falando e não chega pacote nenhum: pede a voz de novo a ela (rtc.pedirVoz) e,
//    se a conexão caiu, refaz o caminho;
// 3) o <audio> perdeu a trilha (stream trocado): escolhe a voz de novo (routeStreams).
const vozesBarradas = new Set(); // ids com o play() recusado pelo navegador
let avisoVozBarrada = null; // fecha o aviso de ativar o som

function tocarVoz(u) {
  const a = u.audioEl;
  if (!a?.srcObject || !a.paused) return;
  a.play().then(() => {
    vozesBarradas.delete(u.id);
    if (!vozesBarradas.size) avisoVozBarrada?.();
  }).catch((err) => {
    if (err?.name !== 'NotAllowedError' || vozesBarradas.has(u.id)) return;
    vozesBarradas.add(u.id);
    if (vozesBarradas.size === 1) {
      avisoVozBarrada = toast('O navegador pausou o som das vozes.', 'warn', 600_000, null, { rotulo: 'Ativar o som', fazer: liberarVozes });
    }
  });
}

// um toque, clique ou tecla de verdade: o navegador deixa tocar
function liberarVozes() {
  if (!state.joined) return;
  audioContext(); // o analisador do microfone e os efeitos também param quando o contexto suspende
  for (const u of state.users.values()) if (!u.isSelf) tocarVoz(u);
}
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, liberarVozes, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  liberarVozes();
  if (micCaiu || rtc?.micTrack?.readyState === 'ended') religarMic();
});

async function vigiarVozes() {
  if (!state.joined || !rtc) return;
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    if (u.audioEl && !u.audioEl.muted) tocarVoz(u); // pausado por fora (celular, fone trocado)
    if (!u.mic || !mesmoAmbiente(u) || settings.voice <= 0 || vozesBarradas.has(u.id)) {
      u.semVoz = 0;
      continue;
    }
    // só mede enquanto o aro está aceso; a pausa entre frases não zera a conta (só o som chegando)
    if (!u.speaking) continue;
    const trilha = u.audioEl?.srcObject?.getAudioTracks()[0];
    const n = trilha?.readyState === 'live' ? await rtc.vozChegando(u.id, trilha.id) : null;
    // contador de pacotes que andou desde a última medida = a voz está chegando
    const chegou = n != null && u.pacotesVoz != null && n > u.pacotesVoz;
    u.pacotesVoz = n;
    if (chegou) {
      u.semVoz = 0;
      continue;
    }
    // 3 s de fala sem nenhum pacote: pede a voz de novo (e repete a cada 5 s enquanto faltar)
    u.semVoz = (u.semVoz || 0) + 1;
    if (u.semVoz >= 3 && u.semVoz % 5 === 3) {
      console.warn(`[voz] ${u.name} está falando e a voz não chega: pedindo de novo`);
      if (n == null) routeStreams(u);
      rtc.pedirVoz(u.id);
    }
  }
}
setInterval(vigiarVozes, 1000);

// O sistema encerrou o meu microfone (fone Bluetooth trocado, ligação no celular, app que ficou
// em segundo plano): pega de novo, senão eu falava e ninguém ouvia. Com a página escondida o
// navegador não deixa: espera ela voltar.
let micCaiu = false;
let religandoMic = false;
async function religarMic() {
  if (!rtc || !state.micAvailable || religandoMic) return;
  if (document.hidden) {
    micCaiu = true;
    return;
  }
  micCaiu = false;
  religandoMic = true;
  try {
    try {
      await rtc.startMic(settings.micDevice || null);
    } catch {
      await rtc.startMic(null);
    }
    rtc.setMicEnabled(state.micOn);
    setupAnalyser();
  } catch (err) {
    console.warn('[mic] não voltou', err);
    toast('O microfone parou. Clique no microfone para ligar de novo.', 'warn', 8000);
    state.micAvailable = false;
    state.micOn = false;
    socket?.emit('mic', false);
    updateMicButton();
  } finally {
    religandoMic = false;
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
  // guarda as 200 últimas; rolar (que mede o layout) só com o chat à mostra: abrir já rola até o fim
  while (list.children.length > 200) list.firstElementChild.remove();
  if (state.panel === 'chat') list.scrollTop = list.scrollHeight;
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
let sentadoNoPosto = null; // id do posto em que estou sentado (sem a dica "C Levantar" na frente)
function sentarNoLugar(lugar) {
  player.sentarEm(lugar);
  sentadoNoPosto = lugar.posto || null;
  world.escritorio?.perifericos?.ativar(sentadoNoPosto);
  updateSitHint();
  if (!lugar.posto || self()?.posto === lugar.posto) return;
  socket.emit('posto', { id: lugar.posto }, (r) => {
    if (r?.ok) toast(`${rotuloDoPosto(lugar.posto)} agora é seu: compartilhe a tela e ela aparece nestes 3 monitores. Mire num monitor e aperte E para controlar.`, 'info', 6000);
    else if (r?.dono) toast(`Este posto é de ${r.dono}. Pode sentar, mas suas telas não vão para estes monitores.`, 'info', 4500);
    else if (r?.erro) toast(r.erro, 'error');
  });
}

// Teclado e mouse do posto em que você está sentado: afundam a tecla que você aperta e andam
// no mouse pad com o seu mouse — aqui na sala ou dentro de um site do navegador da tela (a
// extensão repassa: navegador.js). Ver perifericos.js.
const perifericosAtivos = () => (sentadoNoPosto ? world.escritorio?.perifericos : null);

// O que o site da tela repassa (extensão): teclas e mouse para o posto, e Esc duas vezes seguidas
// volta a andar — com o teclado dentro do site, o Esc não chega ao jogo (um Esc só é do site:
// fechar janelinha, sair de tela cheia...)
let escDoSite = 0;
function entradaDoSite(m) {
  if (m.t === 'tecla' && m.code === 'Escape' && m.desceu && state.focus?.kind === 'pagina') {
    const agora = performance.now();
    if (agora - escDoSite < 700) {
      escDoSite = 0;
      sairDoFoco();
      return;
    }
    escDoSite = agora;
  }
  // Alt + mouse para o lado, de dentro do site (ver altParaOLado). A extensão 1.8.1+ manda junto
  // com o mouse se o Alt está apertado; antes dela, vale o Alt que desceu e subiu
  if (m.t === 'tecla' && m.code === 'AltLeft') segurarAlt(!!m.desceu);
  else if (m.t === 'mouse') {
    if (typeof m.alt === 'boolean' && m.alt !== altMouse.segurado) segurarAlt(m.alt);
    altParaOLado(Number(m.dx) || 0);
  }
  perifericosEntrada(m);
}
// clicou fora do monitor (na borda escura): o teclado volta para o jogo, e aí o Esc funciona
$('#css3d').addEventListener('pointerdown', (e) => {
  if (state.focus?.kind !== 'pagina' || e.target.closest('.nv')) return;
  if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
});
function perifericosEntrada(m) {
  const p = perifericosAtivos();
  if (!p) return;
  if (m.t === 'tecla') p.tecla(m.code ?? null, !!m.desceu);
  else if (m.t === 'mouse') p.mouse(Number(m.dx) || 0, Number(m.dy) || 0);
  else if (m.t === 'clique') p.clique(!!m.desceu);
}
window.addEventListener('keydown', (e) => perifericosAtivos()?.tecla(e.target?.type === 'password' ? null : e.code, true), true);
window.addEventListener('keyup', (e) => perifericosAtivos()?.tecla(e.code, false), true);
window.addEventListener('blur', () => perifericosAtivos()?.soltarTudo());
document.addEventListener('mousemove', (e) => perifericosAtivos()?.mouse(e.movementX || 0, e.movementY || 0));
document.addEventListener('mousedown', () => perifericosAtivos()?.clique(true));
document.addEventListener('mouseup', () => perifericosAtivos()?.clique(false));

function donoDoPosto(id) {
  for (const u of state.users.values()) if (u.posto === id) return u;
  return null;
}

function updateSitHint() {
  const podeSentar = !player.sitting && !!(lugarPerto() || assentoAtual()) && !state.focus && !state.panel;
  const dica = $('#sit-hint');
  // no posto a dica de levantar ficava bem na frente dos monitores: lá ela some (C continua valendo)
  const mostrar = podeSentar || (player.sitting && !sentadoNoPosto);
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
  if (!sentado) {
    sentadoNoPosto = null;
    world.escritorio?.perifericos?.ativar(null);
  }
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
  // nocauteado não leva golpe (o tiro passa por cima de quem está no chão); em times, colega e
  // espectador também não. A hitbox de cada um sai do próprio modelo (hitbox.js)
  getOthers: () => [...state.users.values()]
    .filter((u) => !u.isSelf && u.avatar && !u.avatar.ko && batalha.podeAcertar(u.id))
    .map((u) => ({ id: u.id, position: u.avatar.group.position, ...tamanhoDo(u.avatar), acertar: (o, d, max) => acertarAvatar(u.avatar, o, d, max) })),
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
  hud.hidden = !(inRing || mataMata.ativo || batalha.ativo || v < 1 || combat.knockedOut);
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
function temArma() { return (settings.shirt === 'bolsonaro' && jogoLigado('armas')) || !!mataMata.arma || !!batalha.arma; }
// a arma que está na mão: a do mata-mata (sozinho ou em times) manda enquanto se está nele
const armaAtual = () => mataMata.arma || batalha.arma || settings.arma;

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
  if (fp && visaoArma.tipo !== armaAtual()) visaoArma.setTipo(armaAtual());
  visaoArma.update(dt, {
    visivel: fp,
    andando: player.grounded ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 7) : 0.2,
    yaw: player.yaw,
    pitch: player.pitch,
    chao: player.pos.y,
  });
  atualizarCapsulas(dt);
  vigiarMunicao();
  if (gatilho && temArma() && defArma(armaAtual()).auto) atirar();
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
const temSniper = () => temArma() && armaAtual() === 'sniper';
function ligarLuneta(on) {
  if (on && (luneta || !temSniper() || state.focus || player.veiculo || player.sitting || combat.knockedOut || !state.joined)) return;
  if (!on && !luneta) return;
  luneta = on;
  player.mirando = on; // na luneta o passo não balança a visão (a respiração balança a mira)
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

// ------------------------------------------------------------------ munição
// Cada arma tem um pente (no máximo 30, ver armas-dados.js). Acabou, recarrega sozinho; R recarrega
// antes (com a arma na mão e o pente não cheio). Nasceu de novo ou pegou arma no mata-mata: cheio.
const balas = {}; // arma -> balas no pente
let recarga = null; // { arma, ate } enquanto recarrega
const pente = (arma) => defArma(arma).pente || 30;
const balasDe = (arma) => balas[arma] ?? pente(arma);
function recarregar() {
  const arma = armaAtual();
  if (!temArma() || recarga || balasDe(arma) >= pente(arma) || combat.knockedOut) return false;
  recarga = { arma, ate: performance.now() + defArma(arma).recarga * 1000 };
  sfx.engatilhar(0.6);
  mostrarMunicao();
  return true;
}
function encherPentes() {
  for (const k of Object.keys(balas)) delete balas[k];
  recarga = null;
  mostrarMunicao();
}
const elMunicao = document.createElement('div');
elMunicao.id = 'municao';
elMunicao.hidden = true;
document.body.appendChild(elMunicao);
const estiloMunicao = document.createElement('style');
estiloMunicao.textContent = `#municao { position: fixed; right: 22px; bottom: 96px; z-index: 25; padding: 8px 14px; border-radius: 12px; background: rgba(15,23,42,.8);
  color: #f8fafc; font: 800 22px 'Plus Jakarta Sans', system-ui, sans-serif; font-variant-numeric: tabular-nums; pointer-events: none; text-align: right; }
#municao small { display: block; font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: .06em; }
#municao.vazio { color: #f87171; }
#municao[hidden] { display: none; }`;
document.head.appendChild(estiloMunicao);
let municaoAntes = '';
function mostrarMunicao() {
  const arma = armaAtual();
  const ver = temArma() && state.joined && !player.veiculo;
  const txt = !ver ? '' : recarga ? `…|${defArma(arma).nome} · recarregando` : `${balasDe(arma)} / ${pente(arma)}|${defArma(arma).nome}${mataMata.ativo || batalha.ativo ? ' · R recarrega' : ''}`;
  if (txt === municaoAntes) return;
  municaoAntes = txt;
  elMunicao.hidden = !txt;
  if (!txt) return;
  const [n, nome] = txt.split('|');
  elMunicao.innerHTML = `${n}<small>${nome}</small>`;
  elMunicao.classList.toggle('vazio', !recarga && balasDe(arma) === 0);
}
let armaVista = null;
let koVisto = false;
function vigiarMunicao() {
  if (recarga && performance.now() >= recarga.ate) {
    balas[recarga.arma] = pente(recarga.arma);
    recarga = null;
    sfx.engatilhar();
  }
  // pegou outra arma (no mata-mata): vem cheia
  const arma = armaAtual();
  if ((mataMata.ativo || batalha.ativo) && arma !== armaVista) {
    delete balas[arma];
    if (recarga && recarga.arma !== arma) recarga = null;
  }
  armaVista = arma;
  // levantou do nocaute: pentes cheios
  if (koVisto && !combat.knockedOut) encherPentes();
  koVisto = combat.knockedOut;
  mostrarMunicao();
}

function atirar() {
  if (!temArma()) {
    toast('Arma só para quem escolheu a camiseta 22 (ou no mata-mata, pegando uma do chão).', 'info', 2600);
    return;
  }
  if (player.veiculo || player.sitting || state.focus || !state.joined || batalha.congelado) return;
  const armaAgora = armaAtual();
  if (recarga) return;
  if (balasDe(armaAgora) <= 0) {
    recarregar(); // pente vazio: recarrega sozinho
    return;
  }
  const cam = world.camera;
  cam.getWorldDirection(_camDir);
  // o raio sai da mira, mas da altura do boneco para a frente: em 3ª pessoa a câmera fica
  // atrás, e acertaria quem estivesse entre ela e você
  const frente = Math.max(0, _tmpTiro.copy(player.pos).sub(cam.position).dot(_camDir));
  _origemTiro.copy(cam.position).addScaledVector(_camDir, frente);
  const def = defArma(armaAtual());
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
  balas[armaAgora] = balasDe(armaAgora) - 1;
  if (balas[armaAgora] <= 0) recarregar();
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
  if (!player.voando && batalha.ativo) {
    toast('No mata-mata em times não dá para voar.', 'info', 2600);
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
  if (!player.puloAlto && batalha.ativo) {
    toast('No mata-mata em times não tem pulo alto.', 'info', 2600);
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
  if (navegadores.tem(screen)) return { kind: 'pagina', screen, label: navegadores.rotulo(screen) };
  // tela livre: o (+) — compartilhar ali ou abrir o navegador (index: posição dela em world.slots)
  if (!t && !screen.owner && world.slots[screen.index] === screen && aceitaMais(screen)) return { kind: 'livre', screen, label: 'Compartilhar ou abrir o navegador aqui' };
  return null;
}

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _hits = [];
// superfícies das telas para o raio da mira: refeitas só quando a lista de telas muda
let _superficies = [];
let _telasDasSuperficies = null;
let _quantasTelas = -1;
function superficiesDasTelas() {
  const telas = world.screens;
  if (telas !== _telasDasSuperficies || telas.length !== _quantasTelas) {
    _telasDasSuperficies = telas;
    _quantasTelas = telas.length;
    _superficies = telas.map((s) => s.surface);
  }
  return _superficies;
}
// tela escondida (cinema no escritório, sala atrás da parede) não ganha a mira: o raio do three
// não olha visible
const telaVisivel = (s) => s.group.visible && s.group.parent?.visible !== false;
// o (+) da tela livre só vale com o boneco perto dela (no chão, sem contar a altura): de longe a
// mira serve para ver as telas, não para ocupar uma. As caixas das salas ficam na origem, então a
// posição do grupo já é a do mundo
const pertoDaTela = (s) => Math.hypot(s.group.position.x - player.pos.x, s.group.position.z - player.pos.z) <= Math.max(5, s.w * 0.8);
function infoDaMira(s) {
  const info = screenInfo(s);
  return info?.kind === 'livre' && !pertoDaTela(s) ? null : info;
}

// escolhe a tela que está na mira (ou a mais próxima da direção do olhar)
function pickScreen() {
  const cam = world.camera;
  raycaster.setFromCamera(screenCenter, cam);
  raycaster.far = 140;
  const alcance = (s, d) => s.w >= 3 || d < 14;
  _hits.length = 0;
  raycaster.intersectObjects(superficiesDasTelas(), false, _hits);
  let hit = null;
  for (const h of _hits) {
    if (!telaVisivel(h.object.userData.screen)) continue;
    hit = h;
    break;
  }
  if (hit && alcance(hit.object.userData.screen, hit.distance) && infoDaMira(hit.object.userData.screen)) return hit.object.userData.screen;
  cam.getWorldDirection(_fwd);
  let best = null;
  let bestScore = 1.25;
  for (const s of world.screens) {
    if (!telaVisivel(s)) continue;
    // a distância vem antes: o screenInfo (o que a tela mostra) só é perguntado a quem ganharia
    _to.subVectors(s.group.position, cam.position);
    const dist = _to.length();
    if (dist > 140 || (s.w < 3 && dist > 5)) continue;
    const angle = _fwd.angleTo(_to);
    const radius = Math.atan(Math.max(s.w, s.h) / 2 / dist);
    const score = angle / (radius + 0.08);
    if (score < bestScore && infoDaMira(s)) {
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
      : naMesaDeDados ? { kind: 'dados', label: 'Apostar nos dados' } : infoDaMira(pickScreen());
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

// A sinuca na sua vez: a câmera vai para cima da mesa e o mouse fica solto para mirar no pano
// (sinuca.js). Não toma o lugar de outra coisa em foco (uma tela, o telão, a mesa de telas).
function focarSinuca() {
  if (state.focus?.kind === 'sinuca') return true;
  if (state.focus || state.panel || mesa.aberta || !state.joined) return false;
  fecharMesa(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (player.sitting) toggleSit();
  if (player.veiculo) toggleVeiculo();
  state.focus = { kind: 'sinuca' };
  sinuca.entrarNaMira();
  $('#hover-hint').hidden = true;
  syncTouchVisibility();
  return true;
}

// Sentou numa mesa de cartas (cartas.js): o mouse fica solto para o painel das cartas
function focarCartas() {
  if (state.focus?.kind === 'cartas') return true;
  if (state.focus || state.panel || mesa.aberta || !state.joined) return false;
  fecharMesa(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (player.veiculo) toggleVeiculo();
  state.focus = { kind: 'cartas' };
  $('#hover-hint').hidden = true;
  syncTouchVisibility();
  return true;
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
  // página fixa: a câmera para de frente e o mouse e o teclado vão direto para o site
  if (info.kind === 'livre') {
    menuDaTela(info.screen);
    return;
  }
  if (info.kind === 'pagina') {
    if (!navegadores.usar(info.screen)) return;
    state.focus = { kind: 'pagina', tela: info.screen };
    $('#pg-esq').hidden = !telaDoLado(info.screen, -1);
    $('#pg-dir').hidden = !telaDoLado(info.screen, 1);
    // com folga em volta: a barra de cima não tapa o começo do site
    player.override = info.screen.focusPose(world.camera, 1.12);
    document.body.classList.add('pagina-focus');
    $('#pagina-hud').hidden = false;
    $('#crosshair').hidden = true;
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
    setTimeout(atualizarInteresse, 0); // o vídeo cobre o 3D: as telas e webcams de trás param já
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
  setTimeout(atualizarInteresse, 0); // a tela em foco sobe para 1080p sem esperar a rodada
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
  } else if (state.focus.kind === 'sinuca') {
    sinuca.sairDaMira();
  } else if (state.focus.kind === 'cartas') {
    cartas.sairDaMesa();
  } else if (state.focus.kind === 'tv') {
    player.override = null;
    world.travarTelao(null);
    document.body.classList.remove('tv-focus');
    tv.interactive = false;
    // o iframe do navegador segura o teclado: devolve para o jogo
    if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
    $('#tv-focus-hud').hidden = true;
    $('#crosshair').hidden = false;
  } else if (state.focus.kind === 'pagina') {
    player.override = null;
    navegadores.soltar(); // o iframe segurava o teclado: devolve para o jogo
    document.body.classList.remove('pagina-focus');
    $('#pg-esq').hidden = true;
    $('#pg-dir').hidden = true;
    $('#pagina-hud').hidden = true;
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
// ------------------------------------------------------------------ a tela do lado
// Usando uma tela (o navegador no monitor do posto, por exemplo): ‹ › nas bordas ou Alt+← / Alt+→
// (até de dentro do site, com a extensão) passa para a tela vizinha — a câmera desliza até ela.
const _ladoA = new THREE.Vector3();
const _ladoB = new THREE.Vector3();
const _ladoQ = new THREE.Quaternion();
const _ladoDir = new THREE.Vector3();
function telaDoLado(tela, lado) {
  tela.surface.getWorldPosition(_ladoA);
  _ladoDir.set(lado, 0, 0).applyQuaternion(tela.surface.getWorldQuaternion(_ladoQ));
  let melhor = null;
  let nota = Infinity;
  for (const s of world.slots) {
    if (!s || s === tela || !s.group.visible || !screenInfo(s)) continue;
    s.surface.getWorldPosition(_ladoB).sub(_ladoA);
    const paraLa = _ladoB.dot(_ladoDir);
    if (paraLa < Math.min(tela.w, s.w) * 0.3) continue; // tem que estar mesmo daquele lado
    const dist = _ladoB.length();
    if (dist > Math.max(6, tela.w * 2.5)) continue;
    // a da mesma altura primeiro (nas paredes com duas fileiras de telas)
    const n = dist + Math.abs(_ladoB.y) * 2;
    if (n < nota) {
      nota = n;
      melhor = s;
    }
  }
  return melhor;
}

function irParaTelaDoLado(lado) {
  const atual = state.focus?.kind === 'pagina' ? state.focus.tela : null;
  const prox = atual && telaDoLado(atual, lado);
  const info = prox && screenInfo(prox);
  if (!info) return;
  exitFocus(); // a câmera sai de onde está e desliza até a próxima (sem voltar ao boneco)
  if (info.kind === 'livre') menuDaTela(prox);
  else enterFocus(info);
}
// Alt + mouse para o lado (sem clicar) também passa para a tela vizinha: ALT_PASSO px seguidos para
// o mesmo lado. Continuando, vai para a próxima, depois de a câmera chegar. O Alt e o mouse de dentro
// do site chegam pela extensão (entradaDoSite). Só o Alt da esquerda: o da direita é o AltGr.
const ALT_PASSO = 140;
const altMouse = { segurado: false, dx: 0, ate: 0 };
function segurarAlt(on) {
  altMouse.segurado = on;
  altMouse.dx = 0;
}
function altParaOLado(dx) {
  const a = altMouse;
  if (!a.segurado || !dx || state.focus?.kind !== 'pagina') return;
  const agora = performance.now();
  if (agora < a.ate) return; // a câmera ainda está indo para a tela nova
  a.dx = (Math.sign(dx) === Math.sign(a.dx) ? a.dx : 0) + dx;
  if (Math.abs(a.dx) < ALT_PASSO) return;
  const lado = Math.sign(a.dx);
  a.dx = 0;
  a.ate = agora + 450;
  irParaTelaDoLado(lado);
}
// Alt sozinho, no Chrome do Windows, leva o foco para o menu dele ao soltar: usando um site, não
const altDoSite = (e) => {
  if (e.code !== 'AltLeft') return;
  segurarAlt(e.type === 'keydown');
  if (state.focus?.kind === 'pagina') e.preventDefault();
};
window.addEventListener('keydown', altDoSite, true);
window.addEventListener('keyup', altDoSite, true);
window.addEventListener('blur', () => segurarAlt(false)); // Alt+Tab: o Alt sobe em outro programa
document.addEventListener('mousemove', (e) => {
  const alt = e.altKey && !e.ctrlKey; // Ctrl+Alt é o AltGr
  if (alt !== altMouse.segurado) segurarAlt(alt);
  altParaOLado(e.movementX || 0);
});

$('#pg-esq').addEventListener('click', (e) => {
  e.currentTarget.blur();
  irParaTelaDoLado(-1);
});
$('#pg-dir').addEventListener('click', (e) => {
  e.currentTarget.blur();
  irParaTelaDoLado(1);
});

// navegador em foco: a barra dele (abas, endereço) está na própria tela; aqui só o Sair
$('#pagina-hud').addEventListener('click', (e) => {
  if (e.target.closest('[data-pg="sair"]')) sairDoFoco();
});
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
  if (name === 'parque') renderParque();
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
  if (name === 'sala') {
    renderIrPara();
    renderEquipe();
  }
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
$('#btn-cam').addEventListener('click', toggleCam);
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
bindToggle('#set-balanco', 'balancoVisao', (on) => { player.balancoVisao = on; });
// ?perf=1: o chip de FPS aparece sempre, com mais duas linhas — desenhos, sombra, memória da placa
// e tempo de JS e de GPU por quadro (ver atualizarChipFps e sala.perf.gravar)
const PERF = params.has('perf');
if (PERF) world.medirGpu = true;
bindToggle('#set-fps', 'mostrarFps', (on) => { $('#fps').hidden = !(on || PERF); });
$('#fps').hidden = !(settings.mostrarFps || PERF);

// qualidade gráfica (ver qualidade.js)
const DICAS_QUALIDADE = {
  alta: 'Tudo no máximo: sombra nítida, mais luzes e a floresta inteira.',
  // no celular a Média fica sem o mapa de sombra: uma mancha redonda sob cada pessoa
  media: isTouch ? 'Sombra redonda sob as pessoas, menos luzes e menos mato ao longe.' : 'Sombra mais simples, menos luzes e menos mato ao longe.',
  baixa: 'Para PC fraco e celular: sombra redonda sob as pessoas, resolução menor e floresta rala.',
};
function renderQualidade() {
  $$('#set-qualidade button').forEach((b) => b.classList.toggle('on', b.dataset.value === qualidade.modo));
  const n = NIVEIS[qualidade.efetivo];
  // vidro fosco no HUD (style.css, html.vidro) só no PC na Alta: no resto, o desfoque refeito a
  // cada quadro sobre o 3D custava mais do que mostrava
  document.documentElement.classList.toggle('vidro', !isTouch && qualidade.efetivo === 'alta');
  const res = qualidade.escala < 0.999 ? ` · resolução em ${Math.round(qualidade.escala * 100)}%` : '';
  let dica = qualidade.modo === 'auto'
    ? `Agora: ${n.nome}${res}. Ajusta sozinha para ficar em 60 quadros por segundo.`
    : DICAS_QUALIDADE[qualidade.modo];
  // antialias (bordas sem serrilhado) só muda ao recarregar
  if (querAntialias(n) !== bordasLisas) dica += ' As bordas mudam ao recarregar a página.';
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

// ------------------------------------------------------------------ economia de bateria
// 'sim' liga sempre; 'auto' liga com a bateria em 20% ou menos fora da tomada e desliga na tomada
// ou de 30% para cima (a folga não deixa ligar e desligar em volta do limite). Ligada: 3D a 30
// quadros, automático preso na Leve, telas fora do foco no máximo em 540p30 e webcam só de perto
// (ver tetoDeQuadros, nivelDesejado, nivelDaCam e Qualidade.setEconomia).
if (!['auto', 'sim', 'nao'].includes(settings.economia)) settings.economia = 'auto';
let economiaLigada = false;
let bateria = null; // BatteryManager: só no Chrome e no Edge (no iPhone o sistema tem o Pouca Energia)
const textoEconomia = $('#economia-hint')?.textContent || '';
function ligarEconomia(on, avisar = false) {
  if (on === economiaLigada) return;
  economiaLigada = on;
  qualidade.setEconomia?.(on);
  renderEconomia();
  if (on && avisar) {
    toast('Bateria fraca: a sala entrou em economia (30 quadros e gráficos leves).', 'warn', 9000, null,
      { rotulo: 'Desligar', fazer: () => escolherEconomia('nao') });
  }
}
function decidirEconomia() {
  if (settings.economia !== 'auto') return ligarEconomia(settings.economia === 'sim');
  if (!bateria || bateria.charging || bateria.level >= 0.3) ligarEconomia(false);
  else if (bateria.level <= 0.2) ligarEconomia(true, true);
}
function escolherEconomia(valor) {
  settings.economia = valor;
  saveSettings();
  renderEconomia();
  decidirEconomia();
}
function renderEconomia() {
  $$('#set-economia button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.economia));
  const dica = $('#economia-hint');
  if (dica) dica.textContent = economiaLigada ? `Ligada agora. ${textoEconomia}` : textoEconomia;
}
$('#set-economia')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (b) escolherEconomia(b.dataset.value);
});
renderEconomia();
decidirEconomia();
navigator.getBattery?.().then((b) => {
  bateria = b;
  b.addEventListener('levelchange', decidirEconomia);
  b.addEventListener('chargingchange', decidirEconomia);
  decidirEconomia();
}).catch(() => {});

function renderShareMode() {
  $$('#set-share-mode button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.shareMode));
  const dicas = {
    leve: '720p a 60 quadros: para internet fraca ou PC simples.',
    max: 'Full HD (1080p) a 60 quadros, sempre. Se a internet apertar, cai a resolução e não a fluidez.',
    ultra: '1440p a 60 quadros: para PC forte e internet boa (mais de 25 Mbps de upload).',
  };
  $('#share-mode-hint').textContent = `${dicas[settings.shareMode]} Quem assiste de longe recebe uma versão menor e quem não está vendo não recebe: sobra placa de vídeo e internet para quem está olhando.`;
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

$('#set-cam-device').addEventListener('change', async (e) => {
  settings.camDevice = e.target.value;
  saveSettings();
  if (!rtc || !state.camOn) return;
  try {
    const stream = await ligarCam(settings.camDevice);
    // trilha nova no mesmo stream: recarrega o vídeo e a textura do rosto junto
    localAvatar.setCam(null);
    camPreview.srcObject = stream;
    camPreview.play().catch(() => {});
    localAvatar.setCam(camPreview);
    vigiarCam();
    toast('Câmera trocada.');
  } catch (err) {
    toast(avisoDaCam(err), 'error');
  }
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
    // Esc sai de vez (mesmo controlando a tela) e devolve o mouse para a visão do boneco — com um
    // aviso do site aberto, ele só responde o aviso (cancela)
    if (avisoSite.aberto) avisoSite.esc();
    else if (typing()) document.activeElement.blur();
    else if (!$('#tela-mais').hidden) fecharMenuDaTela(true);
    else if (guia.aberto) guia.fechar();
    else if (escolha.aberto) escolha.fechar();
    else if (mesa.aberta) fecharMesa(true);
    else if (state.focus) sairDoFoco();
    else if (!$('#react-pop').hidden) $('#react-pop').hidden = true;
    else if (state.panel) closePanel();
    else if (futebol.jogando) futebol.sair();
    else if (surf.ativo) surf.sair();
    else if (mataMata.ativo) mataMata.sair();
    else if (batalha.ativo) batalha.sair();
    else if (jogosDoParque.some((j) => j.esc?.())) { /* a gincana sai */ }
    else run.abandon(); // preso no parkour? Esc sai da corrida
    return;
  }
  if (typing() || e.repeat || guia.aberto || escolha.aberto || avisoSite.aberto || !$('#tela-mais').hidden) return;
  // jogando futebol de carro: as letras são do carro (futebol.js); ficam só microfone, câmera,
  // chat e esconder a tela
  if (futebol.jogando && !['KeyM', 'KeyK', 'KeyT', 'Enter', 'KeyH'].includes(e.code)) return;
  if (e.code === 'KeyE' && !state.focus && futebol.pertoDaEntrada()) {
    futebol.entrar();
    return;
  }
  if (e.code === 'KeyE' && !state.focus && quadras.usarE()) return; // fila do boliche
  if (e.code === 'KeyE' && !state.focus && jogosDoParque.some((j) => j.usarE?.())) return; // jogos do parque
  if (e.code === 'KeyE' && !state.focus && surf.pertoDoPortal()) {
    surf.entrar();
    return;
  }
  if (e.code === 'KeyE' && !state.focus && mataMata.pertoDoPortal()) {
    mataMata.entrar();
    return;
  }
  if (e.code === 'KeyE' && !state.focus && batalha.pertoDoPortal()) {
    batalha.entrar();
    return;
  }
  // em times: N troca de time; assistindo, as setas trocam de quem se assiste
  if (batalha.ativo && !state.focus && e.code === 'KeyN') {
    batalha.trocarTime();
    return;
  }
  if (batalha.espectando && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    batalha.trocarAlvo(e.code === 'ArrowRight' ? 1 : -1);
    return;
  }
  // no surf, R volta para a etapa (não para a entrada do mapa)
  if (e.code === 'KeyR' && surf.ativo && !state.focus) {
    surf.voltar();
    return;
  }
  // usando o navegador da tela: as letras são do site, não atalhos do jogo (só o Esc sai)
  if (state.focus?.kind === 'pagina') {
    if (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
      irParaTelaDoLado(e.code === 'ArrowRight' ? 1 : -1);
    }
    return;
  }
  // H: esconde (e mostra de novo) tudo o que fica por cima do 3D — para ver a sala limpa
  if (e.code === 'KeyH') {
    alternarHud();
    return;
  }
  // comandando um tabuleiro: as teclas de andar/voar/socar ficam com o jogo
  if (['jogo', 'dados', 'sinuca', 'cartas'].includes(state.focus?.kind) && !['KeyE', 'KeyM', 'KeyT', 'Enter'].includes(e.code)) return;
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
      if (state.focus) break;
      if (jogosDoParque.some((j) => j.teclaR?.())) break; // gincana: volta no último ponto
      if (temArma() && recarregar()) break;
      if (!mataMata.ativo && !batalha.ativo) respawn(); // no mata-mata o R só recarrega
      break;
    case 'KeyV':
      toggleView();
      break;
    case 'KeyB':
      tocarSino(); // Sala Comercial: fechei uma venda
      break;
    case 'KeyF':
      // perto de um jogo com bola, o F faz o mesmo que o clique; fora deles, soca
      if (acaoDosJogos()) fDoJogo = true;
      else punch();
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
    case 'KeyK':
      toggleCam();
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
  // assistindo (mata-mata em times): o clique troca de quem se assiste
  if (batalha.espectando) {
    batalha.trocarAlvo(1);
    return;
  }
  // nos jogos com bola (quadras e parque) o clique é a ação: segurar carrega, soltar arremessa
  if (!state.focus && acaoDosJogos()) {
    cliqueDoJogo = true;
    return;
  }
  // dentro do ringue o botão esquerdo é o soco; fora dele continua focando telas
  if (combat.inRing && !state.focus) punch();
  else if (state.hovered) enterFocus(state.hovered);
  else if (temArma()) puxarGatilho();
});

// o clique (ou o F) que começou uma ação de jogo termina nela (soltar = arremessar)
let cliqueDoJogo = false;
let fDoJogo = false;
window.addEventListener('keyup', (e) => {
  if (e.code !== 'KeyF' || !fDoJogo) return;
  fDoJogo = false;
  soltarAcaoDosJogos();
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !cliqueDoJogo) return;
  cliqueDoJogo = false;
  soltarAcaoDosJogos();
});

// Ação dos jogos (clique esquerdo, F ou o botão de toque): o primeiro jogo que tiver o que fazer
// agora fica com ela. Devolve se algum usou.
function acaoDosJogos() {
  if (!state.joined || state.focus || futebol.jogando || typing()) return false;
  return quadras.apertouF() || jogosDoParque.some((j) => j.apertou?.());
}
function soltarAcaoDosJogos() {
  quadras.soltouF();
  for (const j of jogosDoParque) j.soltou?.();
}

// Ponto de inspeção para testes automatizados. Só existe com ?debug=1 na URL —
// em uso normal nada disso fica exposto.
if (params.get('debug') === '1') {
  window.__sala3d = {
    state, player, combat, run, corrida, world, settings, punch, goToRing, respawn, mataMata, batalha, anuncios,
    toggleVeiculo, irParaLargada, jogos, irParaMesa, exitFocus, dados, quadras, jogosDoParque, pingue, queimada, sinuca, golfe, cartas, gincana, kart, pinta,
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
let tetoAntes = 0; // teto do quadro anterior: o 1º quadro depois de um teto ainda traz o intervalo longo
let cpuAnterior = 0; // ms de JS do quadro anterior (o automático separa processador de placa de vídeo)
// celular: no máximo 60 quadros (tela de 120 Hz vai a 60 e a de 144 a 72; a de 90 continua a 90)
const TETO_TOQUE = isTouch ? 60 : 0;
const escolherTelaEl = $('#escolher-tela');
const telaMaisEl = $('#tela-mais');

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

// O botão do microfone só muda de estilo quando precisa: falar e calar trocam a classe, e o anel
// cresce em degraus de 2,5% só enquanto se fala (calado ele nem aparece). Escrever o volume a
// cada quadro refazia o estilo da página 60 vezes por segundo.
const btnMic = $('#btn-mic');
const anelMic = btnMic.querySelector('.mic-level');
let falavaAntes = false;
let degrauAntes = 0;
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
  if (state.speaking !== falavaAntes) {
    falavaAntes = state.speaking;
    btnMic.classList.toggle('talking', state.speaking);
  }
  if (!state.speaking || !anelMic) return;
  const degrau = Math.round(Math.min(level * 6, 0.25) * 40); // 0 a 10, de 2,5 em 2,5%
  if (degrau === degrauAntes) return;
  degrauAntes = degrau;
  anelMic.style.transform = `scale(${1 + degrau / 40})`;
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
  navegadores.atualizar();
  futebol.atualizarDica(!state.focus && !state.panel);
  quadras.atualizarDica(!state.focus && !state.panel && !futebol.jogando);
  // a dica do primeiro jogo do parque que tiver uma
  {
    // a mira da sinuca é um foco, mas a dica dela continua aparecendo
    const livre = (!state.focus || state.focus.kind === 'sinuca') && !state.panel && !futebol.jogando;
    let d = '';
    for (const j of jogosDoParque) if ((d = j.dica(livre))) break;
    hudJogos.dica(d);
    // no celular: o E e a ação aparecem perto de um jogo
    touchPad?.setJogo({
      e: livre && (/kbd>E</.test(d) || /kbd>E</.test(quadras.dicaAntes || '')),
      acao: livre && (quadras.ativo() || jogosDoParque.some((j) => j.ativo?.())),
    });
  }
  dicaDoPortal(state.focus || state.panel ? '' : surf.pertoDoPortal() ? 'Ir para o surf' : mataMata.pertoDoPortal() ? 'Entrar no mata-mata'
    : batalha.pertoDoPortal() ? 'Entrar no mata-mata em times' : '');
  if (batalha.ativo && !jogoLigado('batalha')) batalha.sair(); // o dono da sala desligou
  if (futebol.jogando && !jogoLigado('futebol')) futebol.sair(); // o dono da sala desligou
  $('#clima-chip').textContent = clima.rotulo();
  updateVolumes();
  lodDosBonecos();
  vigiarContexto();
  if (settings.mostrarFps || PERF) atualizarChipFps();
  // quem está falando, na lista de pessoas: só com o painel aberto
  if (state.panel === 'people') {
    for (const li of $$('#people-list .person')) {
      const u = state.users.get(li.dataset.id);
      li.classList.toggle('speaking', !!u?.speaking);
    }
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

// a mesa e a tela em foco cobrem tudo: o 3D nem é desenhado (sobra placa de vídeo para as telas)
const mundoVisivel = () => !mesa.aberta && state.focus?.kind !== 'share';

// Site (navegador da tela) ou vídeo do telão em foco, com a câmera já parada na frente dele. Ele
// cobre quase a tela inteira e é desenhado pelo navegador, fora do 3D.
function navegadorEmUso() {
  const foco = state.focus?.kind;
  if (foco !== 'pagina' && !(foco === 'tv' && world.telaoTravado?.mostraMidia)) return false;
  const alvo = player.override?.position;
  return !!alvo && world.camera.position.distanceToSquared(alvo) < 0.0004;
}

// Teto de quadros do 3D (0 = sem teto). O que cobre a tela (site, vídeo, mesa, janelas) não é o
// 3D: com ele atrás a 60 ou 144 quadros, só tirava placa de vídeo e processador do que está na
// frente (3 navegadores derrubavam a sala para 23 qps).
// - Mesa ou tela em foco: o 3D nem é desenhado, e o laço segue a 12 (rede, voz, telas).
// - Site ou telão em foco, depois que a câmera chega: 12. No celular em pé o vídeo do telão deixa
//   muito 3D à mostra em cima e embaixo: 30.
// - Personagem, guia, menus de tela, painel no celular ou saguão em tela estreita: 20.
// - Economia de bateria: 30. Celular: 60 (a 120 Hz era o dobro de calor e bateria).
// Andando ou sentado no posto, sem teto: 30 quadros olhando em volta parecia travado.
function tetoDeQuadros() {
  if (!mundoVisivel()) return 12;
  if (navegadorEmUso()) {
    if (state.focus.kind === 'pagina') return 12;
    const a = innerWidth / innerHeight;
    return Math.min(a, 16 / 9) / Math.max(a, 16 / 9) > 0.7 ? 12 : 30;
  }
  if (escolha.aberto || guia.aberto || !escolherTelaEl.hidden || !telaMaisEl.hidden || (isTouch && state.panel)) return 20;
  if (!state.joined && (isTouch || innerWidth <= 860)) return 20;
  if (economiaLigada) return 30;
  return TETO_TOQUE;
}

// o porquê do teto, para o chip de FPS (null: os quadros medidos dizem tudo)
function motivoDoTeto(teto) {
  if (!mundoVisivel()) return 'tela coberta';
  if (navegadorEmUso()) return state.focus.kind === 'pagina' ? 'navegador em uso' : 'vídeo em foco';
  if (teto === 20) return 'janela aberta';
  if (teto === 30) return 'economia';
  return null;
}

// Chip de FPS (Ajustes → Mostrar FPS, ou ?perf=1). Com teto de propósito, mostra o motivo no lugar
// dos quadros medidos. Com ?perf=1, mais duas linhas com as médias do último segundo.
const chipFps = $('#fps');
const janelaPerf = { desde: performance.now(), quadros: 0, sombras: 0, cpu: 0, gpu: 0, nGpu: 0, sombrasPorSeg: 0, cpuMs: 0, gpuMs: 0 };
function atualizarChipFps() {
  const nivel = NIVEIS[qualidade.efetivo].nome;
  const teto = tetoDeQuadros();
  const motivo = motivoDoTeto(teto);
  const res = qualidade.escala < 0.999 ? ` ${Math.round(qualidade.escala * 100)}%` : '';
  let texto = motivo ? `3D a ${teto} qps · ${motivo} · ${nivel}` : `${Math.round(qualidade.fps)} FPS · ${nivel}${res}`;
  if (PERF) {
    const info = world.renderer.info;
    const uq = world.ultimoQuadro;
    const j = janelaPerf;
    texto += `\n${uq ? uq.draws : info.render.calls} draws · ${Math.round((uq ? uq.triangulos : info.render.triangles) / 1000)} mil tri · ${j.sombrasPorSeg}/s sombra · ${info.programs?.length ?? 0} prog`
      + `\n${info.memory.textures} tex · ${info.memory.geometries} geo · JS ${j.cpuMs.toFixed(1)} ms · GPU ${j.gpuMs.toFixed(1)} ms`;
  }
  if (chipFps.textContent !== texto) chipFps.textContent = texto;
}

// Quadro desenhado: entra nas médias do chip (?perf=1) e na gravação (sala.perf.gravar).
function registrarQuadro(dtMs, cpu) {
  const uq = world.ultimoQuadro;
  const draws = uq ? uq.draws : world.renderer.info.render.calls;
  const sombra = !!uq?.sombraRefeita;
  const gpu = uq?.gpuMs || 0;
  if (PERF) {
    const j = janelaPerf;
    j.quadros++;
    j.cpu += cpu;
    if (sombra) j.sombras++;
    if (gpu) {
      j.gpu += gpu;
      j.nGpu++;
    }
    const agora = performance.now();
    if (agora - j.desde >= 1000) {
      j.sombrasPorSeg = Math.round((j.sombras * 1000) / (agora - j.desde));
      j.cpuMs = j.cpu / j.quadros;
      j.gpuMs = j.nGpu ? j.gpu / j.nGpu : 0;
      Object.assign(j, { desde: agora, quadros: 0, sombras: 0, cpu: 0, gpu: 0, nGpu: 0 });
    }
  }
  const g = gravacao;
  if (g) {
    g.dt.push(dtMs);
    g.draws.push(draws);
    g.cpu.push(cpu);
    if (gpu) g.gpu.push(gpu);
    if (sombra) g.sombras++;
  }
}

// sala.perf.gravar(20): grava os quadros desenhados por 20 s e devolve o resumo — quadros por
// segundo, percentis do intervalo, desenhos, ms de JS e de GPU, sombras refeitas por segundo e
// tarefas longas — para comparar o antes e o depois de uma mudança, nas mesmas poses.
let gravacao = null;
async function gravarPerf(segundos = 20) {
  const g = { dt: [], draws: [], cpu: [], gpu: [], sombras: 0 };
  gravacao = g;
  world.medirGpu = true;
  const longas = [];
  let observador = null;
  if (window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
    observador = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) longas.push(e.duration);
    });
    observador.observe({ type: 'longtask' });
  }
  await new Promise((r) => setTimeout(r, segundos * 1000));
  observador?.disconnect();
  if (gravacao === g) {
    gravacao = null;
    world.medirGpu = PERF;
  }
  const n = g.dt.length;
  const soma = (a) => a.reduce((s, v) => s + v, 0);
  const media = (a) => (a.length ? soma(a) / a.length : 0);
  const maior = (a) => a.reduce((m, v) => Math.max(m, v), 0);
  const umaCasa = (v) => Math.round(v * 10) / 10;
  const ordem = [...g.dt].sort((a, b) => a - b);
  const percentil = (q) => (n ? ordem[Math.min(n - 1, Math.floor(q * n))] : 0);
  const segs = soma(g.dt) / 1000;
  return {
    quadros: n,
    fps: umaCasa(segs ? n / segs : 0),
    p50ms: umaCasa(percentil(0.5)),
    p95ms: umaCasa(percentil(0.95)),
    p99ms: umaCasa(percentil(0.99)),
    drawsMedio: Math.round(media(g.draws)),
    drawsMax: maior(g.draws),
    cpuMs: umaCasa(media(g.cpu)),
    gpuMs: umaCasa(media(g.gpu)),
    sombrasPorSeg: umaCasa(segs ? g.sombras / segs : 0),
    longas: longas.length,
    maiorLongaMs: Math.round(maior(longas)),
    nivel: qualidade.efetivo,
    escala: qualidade.escala,
    bonecos: [...state.users.values()].filter((u) => !u.isSelf).length,
  };
}

// sala.bots(40) (com ?debug=1 ou ?perf=1): gente de mentira para medir sala cheia. Entram pelo
// mesmo caminho de quem chega pela rede (LOD, escondido atrás da parede, sombra), sem WebRTC. No
// escritório a fração "sentados" ocupa assentos espalhados pelas salas; o resto passeia num
// quadrado de 2 × raio em volta de você. char fixa o personagem (senão, um de cada, em rodízio).
// sala.bots(0) tira todos.
let bots = null; // { ids, andando: [{ id, p, origem, rumo }], timer }
function criarBots(n = 20, { char = null, sentados = 0.4, raio = 30 } = {}) {
  if (bots) {
    clearInterval(bots.timer);
    for (const id of bots.ids) removeUser(id, true);
    bots = null;
  }
  if (n > 0) {
    const chaves = Object.keys(PERSONAGENS);
    const assentos = world.escritorio?.assentos || [];
    const nSentados = Math.min(assentos.length, Math.round(n * sentados));
    const centro = state.joined ? player.pos : localAvatar.group.position;
    bots = { ids: [], andando: [], timer: 0 };
    for (let i = 0; i < n; i++) {
      const id = `bot-${i}`;
      let p;
      let r;
      let a = 1;
      if (i < nSentados) {
        // um a cada tantos assentos: os sentados ficam em todas as salas, e não só na primeira
        const lugar = assentos[Math.floor((i * assentos.length) / nSentados)];
        p = [lugar.x, lugar.y, lugar.z];
        r = Math.atan2(-Math.sin(lugar.yaw), -Math.cos(lugar.yaw)); // virado para a mesa, como o player.sentarEm
        a = 4;
      } else {
        p = [centro.x + (Math.random() * 2 - 1) * raio, 0, centro.z + (Math.random() * 2 - 1) * raio];
        r = Math.random() * Math.PI * 2;
        bots.andando.push({ id, p, origem: [p[0], p[2]], rumo: r });
      }
      addUser({ id, name: `Bot ${i + 1}`, color: COLORS[i % COLORS.length], mic: true, shares: [], char: char ?? chaves[i % chaves.length], p, r, a, status: 'disponivel' });
      bots.ids.push(id);
    }
    bots.timer = setInterval(andarBots, 66);
  }
  if (state.joined) {
    renderPeople();
    updateRoomInfo();
  }
  return n;
}

// 15 vezes por segundo, como chega pela rede: 0,2 m por passo (3 m/s) num rumo que varia um pouco,
// voltando quando passa de 8 m de onde nasceu
function andarBots() {
  for (const b of bots.andando) {
    const u = state.users.get(b.id);
    if (!u) continue;
    const dx = b.p[0] - b.origem[0];
    const dz = b.p[2] - b.origem[1];
    b.rumo = dx * dx + dz * dz > 64 ? Math.atan2(-dx, -dz) : b.rumo + (Math.random() - 0.5) * 0.6;
    b.p[0] += Math.sin(b.rumo) * 0.2;
    b.p[2] += Math.cos(b.rumo) * 0.2;
    u.avatar.setNetworkState(b.p, b.rumo, 1);
  }
}

// ------------------------------------------------------------------ bonecos no laço
// Cada boneco anda (a posição da rede) todo quadro, mas a animação do corpo, que é o que pesa (nos
// personagens, o esqueleto inteiro), vai no ritmo do que aparece: inteira na vista até 30 m, 30
// qps até 60 m e 15 além. Fora da vista, inteira até 30 m (ao virar a câmera ninguém aparece
// travado) e para quem faz sombra (a sombra comprida do fim da tarde entra na tela); o resto, 12
// qps até 80 m e 2 além. Com o 3D coberto (mesa, tela em foco), 2 qps. Atrás da parede (outra
// sala do escritório), o corpo some e a animação espera. A distância é a aparente: a luneta
// (~6×) aproxima.
const TAN_FOV = Math.tan(THREE.MathUtils.degToRad(34)); // metade da abertura da câmera normal (68°)
const zoomDaCamera = () => TAN_FOV / Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2));
function atualizarAvatares(dt, t, desenhando) {
  const cam = world.camera.position;
  const zoom = zoomDaCamera();
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    const a = u.avatar;
    // jogando futebol de carro: quem aparece é o carro dele no campo (futebol.js), não o boneco
    const noCampo = futebol.joga(u.id);
    if (a.group.visible === noCampo) a.group.visible = !noCampo;
    if (noCampo) continue;
    if (!a.animarCom) {
      a.update(dt, t);
      continue;
    }
    a.mover(dt, t);
    a.setOculto(world.escondido?.(a.group.position) ?? false);
    if (a.oculto) {
      a.animarCom(dt, t, Infinity);
      continue;
    }
    const d = cam.distanceTo(a.group.position) / zoom;
    const ve = desenhando && (world.naVista?.(a.esferaVista()) ?? true);
    const passo = !desenhando ? 0.5
      : ve ? (d < 30 ? 0 : d < 60 ? 1 / 30 : 1 / 15)
        : d < 30 || a.lod.sombra ? 0 : d < 80 ? 1 / 12 : 0.5;
    a.animarCom(dt, t, passo);
    // boneco com sombra que se mexeu perto do sol: o mapa de sombra precisa ser refeito
    if (a.lod.sombra && a.mexeu() && (world.pertoDoSol?.(a.group.position) ?? true)) world.marcarSombra?.(true);
  }
}

// LOD dos bonecos, a 4 Hz, pelo orçamento do nível (NIVEIS[...].bonecos): sombra só dos mais perto
// dentro do raio, com folga de 2 bonecos e 4 m para quem já tinha (não pisca na divisa), braços e
// mãos na sombra só na Alta, e nome até uma distância (quem fala ou compartilha sempre mostra).
const _lod = []; // os remotos, do mais perto ao mais longe (reaproveitado)
const porDistancia = (a, b) => a.distLod - b.distLod;
function lodDosBonecos() {
  const b = NIVEIS[qualidade.efetivo].bonecos ?? { sombras: 6, raioSombra: 28, nomes: 50, bracos: false };
  const comMapa = world.renderer.shadowMap.enabled;
  const cam = world.camera.position;
  const zoom = zoomDaCamera();
  _lod.length = 0;
  for (const u of state.users.values()) {
    if (u.isSelf || !u.avatar.setLod) continue;
    u.distLod = u.avatar.group.position.distanceTo(cam);
    _lod.push(u);
  }
  _lod.sort(porDistancia);
  let n = 0; // a ordem entre os que se pode ver: quem está atrás da parede não gasta vaga de sombra
  for (const u of _lod) {
    const a = u.avatar;
    const tinha = a.lod.sombra;
    const sombra = comMapa && b.sombras > 0 && !a.oculto && n < b.sombras + (tinha ? 2 : 0) && u.distLod < b.raioSombra + (tinha ? 4 : 0);
    if (!a.oculto) n++;
    // o nome vai pela distância aparente: pela luneta dá para ver quem é
    const nome = u.distLod / zoom < b.nomes + (a.lod.nome ? 5 : 0) || u.speaking || u.shares.size > 0;
    if (a.setLod({ sombra, detalhe: b.bracos, nome })) world.marcarSombra?.();
  }
  if (localAvatar.setLod?.({ sombra: true, detalhe: b.bracos, nome: false })) world.marcarSombra?.();
}

// Sem mapa de sombra (Leve, Média do celular): uma mancha redonda sob cada pessoa, todas num
// desenho só (World.sombraDe). No ar ela encolhe; sentado ou escondido, some.
function atualizarSombrasRedondas() {
  if (!world.sombrasRedondas?.visible) return;
  let i = world.sombraDe(0, localAvatar, !player.grounded);
  for (const u of state.users.values()) if (!u.isSelf) i = world.sombraDe(i, u.avatar, u.avatar.anim === 3);
  world.fecharSombrasRedondas(i);
}

// ------------------------------------------------------------------ contexto do WebGL
// O sistema pode tirar a placa de vídeo da aba (driver reiniciado, celular sem memória, aba muito
// tempo escondida). O World para de desenhar e espera o contexto voltar; o laço segue (rede, voz,
// telas). Se com 5 s de aba à vista ele não voltou, oferece recarregar a sala.
let contextoPerdido = null; // { fechar, visivelMs, ultimo, ofereceu }
world.aoPerder = () => {
  contextoPerdido?.fechar();
  contextoPerdido = { fechar: toast('Recuperando o 3D…', 'warn', 600_000), visivelMs: 0, ultimo: performance.now(), ofereceu: false };
};
world.aoVoltar = () => {
  contextoPerdido?.fechar();
  contextoPerdido = null;
  qualidade.pausar?.(3000); // recompilar tudo na volta não é lentidão da placa
};
// no slowUpdate, que só roda com a aba à vista (escondida, o rAF para)
function vigiarContexto() {
  const c = contextoPerdido;
  if (!c || c.ofereceu) return;
  const agora = performance.now();
  c.visivelMs += Math.min(agora - c.ultimo, 500);
  c.ultimo = agora;
  if (c.visivelMs < 5000) return;
  c.ofereceu = true;
  c.fechar();
  c.fechar = toast('O 3D não voltou sozinho.', 'warn', 600_000, null, { rotulo: 'Recarregar a sala', fazer: () => recarregarNaSala() });
}

function frame(ts = performance.now()) {
  const teto = tetoDeQuadros();
  // Com teto, o rAF segue no ritmo da tela e o quadro só roda passado o mínimo, com 4 ms de folga
  // (o carimbo do rAF varia). A 60 o mínimo é 9,2 ms: a 120 Hz roda um sim e um não, a 90 todos.
  const minimo = !teto ? 0 : teto >= 50 ? 9.2 : 1000 / teto - 4;
  if (minimo && ts - lastFrame < minimo) {
    requestAnimationFrame(frame);
    return;
  }
  const dtMs = Math.max(0, ts - lastFrame);
  const dt = Math.min(dtMs / 1000, teto && teto < 50 ? 0.1 : 0.05);
  lastFrame = ts;
  const t0 = performance.now();
  elapsed += dt;
  const t = elapsed;
  const desenhando = mundoVisivel();
  world.update(t); // plataformas móveis e escritório andam mesmo sem desenhar (quem está em cima)
  clima.update(dt, t);
  balancarLuneta(t);

  if (state.joined) {
    if (futebol.jogando) futebol.update(dt); // no campo: o carro do futebol no lugar do boneco
    else player.update(dt);
    futebol.animar(dt);
    quadras.update(dt, t);
    for (const j of jogosDoParque) j.update(dt, t);
    surf.update(dt);
    mataMata.update(dt);
    batalha.update(dt);
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
    // nocaute: fica parado onde caiu até levantar; em times, também na contagem e assistindo
    player.travado = combat.knockedOut || batalha.congelado;
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
    world.focarSol(player.pos.x, player.pos.z, player.pos.y); // a altura diz se está dentro de uma sala do escritório
    slowTimer += dt;
    if (slowTimer > 0.25) {
      slowTimer = 0;
      slowUpdate();
    }
  } else {
    lobbyCamera(t);
  }

  // bonecos, com a câmera deste quadro já no lugar (vista e paredes)
  world.prepararQuadro?.();
  // enfeites e natureza só quando aparecem, depois do prepararQuadro: a natureza para com o lado
  // de fora escondido, e o cullFora deste quadro é que diz se ele aparece
  if (desenhando) world.animar?.(t);
  localAvatar.update(dt, t);
  if (localAvatar.mexeu?.()) world.marcarSombra?.();
  atualizarAvatares(dt, t, desenhando);
  atualizarSombrasRedondas();

  // O automático só mede quadro desenhado de verdade: sem compilação, aquecimento, personagem
  // chegando ou contexto perdido, e sem teto abaixo de 25 (lento de propósito) — nem o 1º quadro
  // depois de um.
  const medir = desenhando && !world.compilando && !world.aquecendo && !world.chegandoModelo?.() && !world.perdido
    && !(teto && teto < 25) && !(tetoAntes && tetoAntes < 25);
  // antes do render: trocar a escala redimensiona o canvas (e o apaga)
  qualidade.quadro(dtMs, medir, { cpu: cpuAnterior, alvo: teto === 30 ? 30 : 0 });
  tetoAntes = teto;
  // pulando: a sonda do automático passa alguns quadros sem desenhar (a imagem anterior fica)
  const desenha = desenhando && !qualidade.pulando;
  if (desenha) world.render();
  cpuAnterior = performance.now() - t0;
  if (desenha && (PERF || gravacao)) registrarQuadro(dtMs, cpuAnterior);
  requestAnimationFrame(frame);
}

// atalho para depuração no console do navegador; sala.perf.gravar(20) mede (ver gravarPerf)
window.sala = {
  state, world, player, run, settings, get tv() { return tv; }, get rtc() { return rtc; }, get socket() { return socket; },
  perf: { gravar: gravarPerf },
};
if (PERF || params.get('debug') === '1') window.sala.bots = criarBots;

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
