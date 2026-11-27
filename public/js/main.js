// Sala 3D — junta tudo: lobby, mundo, jogador, voz/tela (WebRTC), telão (YouTube, Twitch…), chat e parkour.
import * as THREE from 'three';
import { World, SPAWN } from './world.js';
import { Avatar } from './avatars.js';
import { PERSONAGENS } from './modelo.js';
import { EscolherPersonagem } from './escolher-personagem.js';
import { CatalogoJogos } from './catalogo-jogos.js';
import { PcJogos } from './pc-jogos.js';
import { Ps5Nativo, temPs5Nativo } from './ps5-nativo.js';
import { Dublagem } from './voz-universal.js';
import { precisaOferecer, oferecerAluguel } from './oferta-aluguel.js';
import { PcDireto, temPcDireto } from './pc-direto.js';
import { Diretas } from './diretas.js';
import { Ps5Touchpad, temTouchpadHid } from './ps5-touchpad.js';
import { SalasLaterais } from './salas.js';
import { AoVivo, cartaoDoSaguao, COR_STATUS } from './aovivo.js';
import { Player } from './player.js';
import { RTC, presetDe, codecsTestados, QPS_OBS } from './rtc.js';
import { MediaSync, PROVIDERS, preloadYouTube } from './media.js';
import { ParkourRun, formatTime, CHECKPOINT_COUNT } from './parkour.js';
import { CHECKPOINTS_ESCALADA } from './catedral-dados.js';
import { Combat } from './combat.js';
import { RING, COMBAT, ringCorners } from './arena.js';
import { Corrida, PISTA, largada, formatarVolta, projetar, pontoEm } from './pista.js';
import { sfx, audioContext, setSfxEnabled } from './sfx.js';
import { Clima } from './clima.js';
import { ARMAS, IDS_ARMAS, ARMA_PADRAO, defArma, VisaoArma, iniciarCapsulas, atualizarCapsulas, preCarregarArma } from './armas.js';
import { Jogos } from './jogos.js';
import { Controle, versaoNum, eventoDeControle } from './controle.js';
import { AvisoDoSite } from './aviso-site.js';
import { ToqueJogo, jogoDaJanela, LAYOUTS, layoutDoTitulo } from './toque-jogo.js';
import { ControleFisico } from './gamepad-jogo.js';
import { PadVirtual } from './pad-virtual.js';
import { TecladoPad } from './teclado-pad.js';
import { MapaTeclasPainel, mapaTeclas } from './mapa-teclas.js';
import { AvisosBotoes } from './avisos-botoes-tela.js';
import { TurboEnvio, TurboRecebe, TTL_MS, vidaDoCanal, LISO_PCT, LISO_MAX } from './turbo.js';
import { TurboAuto, TurboVolta, foraDoModo } from './turbo-auto.js';
import { TesteEnvio, TesteJoga, MemoriaTeste, codecsDaqui } from './turbo-teste.js';
import { PainelTeste, textoDoResultado } from './turbo-teste-painel.js';
import { opcoesJogo, LISO_MS, PRESETS, PRESET_TV, ORDEM_AUTO, OPCOES_DO_PRESET, autoMostra, htmlPresets, marcarPresets, alturaDoMenu } from './jogo-opcoes.js';
import { Mesa } from './mesa.js';
import { Qualidade, NIVEIS, nivelInicial } from './qualidade.js';
import * as moduloQualidade from './qualidade.js';
import { GuiaExtensao } from './guia-extensao.js';
import { TutorialHud, dicasAoPassar } from './guia-hud.js';
import { Navegadores, siteDe } from './navegador.js';
import { DEPARTAMENTOS, IDS_DEPARTAMENTOS, MAX_SALAS, rotuloDoPosto, portaDa, comTelas } from './escritorio.js';
import { Dados, MESA_DADOS } from './dados.js';
import { Futebol } from './futebol.js';
import { Quadras } from './quadras.js';
import { Pingue } from './pingue.js';
import { Queimada } from './queimada.js';
import { Sinuca } from './sinuca.js';
import { Golfe } from './golfe.js';
import { Cartas, primarVoz } from './cartas.js';
import { Poker } from './poker.js';
import { Gincana } from './gincana.js';
import { Fantasmas } from './fantasmas.js';
import { Kart } from './kart.js';
import { Pinta } from './pinta.js';
import { hud as hudJogos } from './hud-jogos.js';
import { MapaTela } from './mapa.js';
import { MAPAS, MAPA_DA_PAGINA, lembrarMapa } from './mapas-dados.js';
import { AREAS, MAPA_INFO } from './cidade-dados.js';
import { Surf, MataMata, dicaDoPortal } from './ceu.js';
import { Batalha } from './batalha.js';
import { TIMES } from './batalha-dados.js';
import { Anuncios } from './anuncios.js';
import { acertarAvatar, tamanhoDo } from './hitbox.js';
import { Criador } from './criador.js';
import { icon, hydrateIcons } from './icons.js';
import { photoFromFile } from './foto.js';
import { Musica } from './musica.js';
import { DiagJogo } from './jogo-diag.js';
import { linhaDaCulpa } from './culpa.js';
import { NaTv } from './na-tv.js';
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
const PANEL_TITLES = { people: 'Pessoas', chat: 'Chat da sala', telao: 'Telão', musica: 'Música da sala', parkour: 'Parkour', ringue: 'Ringue de luta', corrida: 'Pista de corrida', jogos: 'Jogos, dados e moedas', parque: 'Parque', sala: 'Sala da empresa', settings: 'Ajustes' };

// ------------------------------------------------------------------ ajustes salvos
const DEFAULTS = {
  name: '', color: COLORS[0], mic: true, voice: 100, screen: 90, tv: 80, musica: 20, spatial: false, porJogo: true,
  shareMode: 'max', sens: 100, balancoVisao: true, sfx: true, micDevice: '', camDevice: '', helpCollapsed: false, photo: null, shirt: 'none', char: 'padrao', arma: ARMA_PADRAO,
  // qualidade gráfica: 'auto' ou um nível fixo; nivelAuto: onde o automático parou da última vez;
  // falhasAuto: quantas vezes cada nível caiu logo depois de subir (o automático espera mais para tentar)
  qualidade: 'auto', nivelAuto: null, falhasAuto: {}, mostrarFps: false,
  // distância de visão: 'longe' (até a serra), 'media' ou 'perto' (ver DISTANCIAS)
  distancia: 'longe',
  // texturas do mapa: 'auto', 'detalhadas' ou 'simples' (lidas no qualidade.js, ao abrir a página)
  texturas: 'auto',
  // economia de bateria: 'auto' (bateria fraca fora da tomada), 'sim' ou 'nao'
  economia: 'auto',
  // presença (ver "empresa") e se o gestor quer os alertas da equipe
  status: 'disponivel', alertasGestor: true,
  // com a extensão pronta, a tela já entra no ar com "Permitir controle" ligado
  controleAuto: true,
  // compartilhar pelo OBS: qual monitor (1 = o 1 do Windows) o OBS captura, para o controle
  obsMonitor: 1,
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
// a música da sala virou som de fundo (baixinha): quem estava no volume de fábrica antigo (60)
// passa para o novo; quem mexeu no volume fica com o que escolheu
if (!stored.musicaFundo) {
  if (stored.musica === undefined || stored.musica === 60) settings.musica = DEFAULTS.musica;
  settings.musicaFundo = true;
}
// celular: a ajuda começa recolhida (a tela é pequena), mas continua a um toque
if (isTouch && stored.helpCollapsed === undefined) settings.helpCollapsed = true;
function saveSettings() {
  try { localStorage.setItem('sala3d', JSON.stringify(settings)); } catch { /* modo privado */ }
}

hydrateIcons();
setSfxEnabled(settings.sfx);
// o nome de cada ícone ao passar o mouse, e o tutorial da interface na primeira visita (guia-hud.js)
dicasAoPassar();
const tutorialHud = new TutorialHud({ toque: isTouch });
if (isTouch) {
  document.body.classList.add('touch');
  barraMais();
}

// Celular: todos os botões da barra do topo ficam guardados no ⋯ (a tela é pequena e o mundo vem
// primeiro). Tocou no ⋯: os botões redondos (microfone, câmera, compartilhar...) aparecem na barra e
// os ícones dos painéis numa grade embaixo dela. Escolheu um ou tocou fora, fecha.
function barraMais() {
  const direita = $('.bar-right');
  const centro = $('.bar-center');
  const btn = $('#btn-mais');
  btn.hidden = false;
  const aberta = () => document.body.classList.contains('bar-mais');
  const abrir = (on) => {
    document.body.classList.toggle('bar-mais', on);
    btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', () => abrir(!aberta()));
  // escolheu um ícone: fecha (o compartilhar e as reações abrem um balão: ficam até escolher)
  direita.addEventListener('click', () => abrir(false));
  centro.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b === btn || b.closest('.pop-wrap')) return;
    abrir(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (aberta() && !e.target.closest('.bar-right, .bar-center, .popover')) abrir(false);
  });
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
// o mapa sobe em etapas; enquanto isso o formulário de entrada responde (entrada.js)
const entrada = window.sala3dEntrada;
await world.construir((f) => entrada?.mapa(f));
// Daqui até o fim do módulo não há mais espera: o formulário passa a ser deste arquivo. O que a
// pessoa mudou nele enquanto o mapa subia está no localStorage (o entrada.js grava a cada mudança).
const pedidoDaEntrada = entrada?.soltar() || {};
if (entrada) {
  const agora = (() => {
    try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
  })();
  for (const k of ['name', 'color', 'char', 'shirt', 'photo', 'mic']) if (agora[k] !== undefined) settings[k] = agora[k];
}
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
// o céu do meio-dia, com sol (clima.js)
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
  avatarDe: (id) => state.users.get(id)?.avatar ?? null, // gritos, tapa e tiro mexem no boneco de quem está na mesa
  levou: (tipo, nome, dir, item) => (tipo === 'tiro' ? leveiTiro(nome) : leveiTapa(nome, dir, item)),
  tiroFx: (de, ate) => desenharTiro(de, ate),
});
jogosDoParque.push(cartas);
// poker nas mesas do meio do salão: sentado, como nas cartas (câmera atrás da cadeira, mouse solto
// para os botões e para clicar nas fichas)
const poker = new Poker({
  world, player, sfx, ligado: () => jogoLigado('poker'),
  focar: () => focarCartas('poker'),
  soltarFoco: () => { if (state.focus?.kind === 'poker') sairDoFoco(); },
});
jogosDoParque.push(poker);
// gincana: 10 fases e a final, bem longe do mapa (o portal fica na pracinha da aventura, com os do céu)
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
// caça-fantasmas (como o Phasmophobia): 12 monstros em 5 casas assombradas, bem longe do mapa (o
// portal fica no meio da pracinha da aventura)
const fantasmas = new Fantasmas({
  world, player, sfx, clima, ligado: () => jogoLigado('fantasmas'), posDe: posDoId, falando: () => state.speaking,
  aoEntrar: () => {
    if (player.veiculo) toggleVeiculo();
    if (player.voando) toggleVoar();
    if (player.puloAlto) togglePuloAlto();
    if (player.sitting) toggleSit();
  },
});
jogosDoParque.push(fantasmas);
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

let trocandoRota = null; // { key, ate }: a conexão dessa tela está sendo refeita de propósito (mudarRota)
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
// o entrada.js já preencheu (e a pessoa pode ter digitado outra sala enquanto o mapa subia)
if (!entrada) roomInput.value = params.get('sala') || '';
// ?compartilhar=tela&entrar=1: ao entrar, já compartilha a tela inteira (ver o fim do join)
let compartilharAoEntrar = params.get('compartilhar') === 'tela' && params.get('entrar') === '1';
$('#in-mic').checked = settings.mic;

// ------------------------------------------------------------------ app (PWA)
// O service worker (public/sw.js) guarda o que não muda, para o app abrir rápido. O botão
// "Instalar o app" aparece quando o navegador deixa instalar; no iPhone ele só explica o caminho.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Dentro da sala, fechar a aba pede confirmação: o Ctrl+W (Ctrl agachar + W andar, num jogo) fechava
// a sala sem aviso. O Chrome não deixa a página segurar o Ctrl+W (só com o teclado travado da tela
// cheia do modo jogo); o que dá é o "Sair do site?". As saídas do próprio site (trocar de sala, Sair,
// Recarregar) passam por saidaLiberada antes, sem perguntar.
let saidaLiberada = false;
const liberarSaida = () => { saidaLiberada = true; };
addEventListener('beforeunload', (e) => {
  if (!state.joined || saidaLiberada) return;
  e.preventDefault();
  e.returnValue = '';
});
// com o teclado travado (tela cheia do modo jogo) o Ctrl+W chega à página: não deixa fechar
addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyW' && state.joined) e.preventDefault();
}, true);

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
    liberarSaida();
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
// No app instalado a barra superior continua sendo a navegação principal. A classe também
// permite que o CSS não a esconda ao entrar em um jogo.
document.body.classList.toggle('pwa', !!instalado);
// o aviso pode ter chegado antes deste arquivo: o entrada.js guardou
let pedidoDeInstalacao = entrada?.pedidoDeInstalacao || null;
if (pedidoDeInstalacao) $('#btn-instalar').hidden = false;
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
// false = a sala pediu senha (o campo aparece); senão pode entrar, e volta o que o servidor disse
// da sala ({ mapa }; vazio se ele não respondeu)
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
    return {}; // sem resposta: tenta entrar assim mesmo, o servidor confere de novo
  }
  if (r.ok) {
    state.passe = r.passe || null;
    guardarPasse(sala, r.passe);
    return r;
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
// veio por um convite de sala com senha: já mostra o campo (sem gastar tentativa; o entrada.js já conferiu)
if (params.get('sala') && !entrada) {
  fetch('/sala-acesso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sala: idDaSala(params.get('sala')), passe: lerPasses()[idDaSala(params.get('sala'))] }),
  }).then((r) => r.json()).then((r) => {
    if (r.protegida && !r.ok) pedirSenhaDaSala();
  }).catch(() => {});
}
// o servidor recusou o passe (senha trocada no meio do caminho) ou a conta da lan house: volta ao
// saguão desta sala
function senhaRecusada(erro) {
  if (erro === 'conta') try { localStorage.removeItem('sala3d-lan'); } catch { /* sem storage */ }
  else guardarPasse(idDaSala(state.roomRequested), null);
  const url = new URL(window.location.href);
  url.searchParams.set('sala', state.roomRequested);
  liberarSaida();
  window.location.replace(url);
}

// ----- conta (nome e senha) na entrada: todo mundo entra com uma (lanhouse.js guarda as contas)
function erroConta(txt) {
  $('#conta-erro').hidden = !txt;
  $('#conta-erro').textContent = txt || '';
}
// já logado com este nome: segue; senão faz o login (ou cria a conta) com o nome e a senha
async function contaParaEntrar(nome) {
  let guardada = null;
  try { guardada = JSON.parse(localStorage.getItem('sala3d-lan') || 'null'); } catch { /* sem storage */ }
  const chave = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (guardada?.token && chave(guardada.nome) === chave(nome)) return true;
  const senha = $('#in-senha-conta').value;
  if (!senha) {
    $('#campo-senha-conta').hidden = false;
    erroConta('Digite sua senha. Primeira vez? A senha que você digitar vira a da sua conta.');
    $('#in-senha-conta').focus();
    return false;
  }
  let r;
  try {
    r = await (await fetch('/lan/conta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha }),
    })).json();
  } catch {
    r = { ok: false, erro: 'Sem conexão. Tente de novo.' };
  }
  if (!r.ok) {
    erroConta(r.erro);
    return false;
  }
  try { localStorage.setItem('sala3d-lan', JSON.stringify({ nome, token: r.token })); } catch { /* sem storage */ }
  $('#in-senha-conta').value = '';
  erroConta('');
  if (r.criou) toast(`Conta criada: na próxima vez, entre com o nome ${nome} e essa senha.`, 'success', 6000);
  return true;
}
$('#in-senha-conta').addEventListener('input', () => erroConta(''));

// cores: no formulário de entrada e no modal do personagem (que também abre dentro da sala)
function renderSwatches() {
  const html = COLORS.map((c) => `<button type="button" role="radio" aria-label="Cor ${c}" aria-checked="${c === settings.color}" style="--c:${c}" data-color="${c}"></button>`).join('');
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
for (const sel of ['#ep-cores']) {
  $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) mudarCor(b.dataset.color);
  });
}
nameInput.addEventListener('input', () => localAvatar.setName(nameInput.value.trim() || 'Você'));
if (settings.name) localAvatar.setName(settings.name);

// ---------------------------------------------------------------- foto do rosto (reduzida em foto.js)
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
  // a foto só existe no boneco padrão: o modelo 3D tem o corpo dele
  $('#campo-foto').hidden = !!def.url;
  if (!carregar) return;
  const r = await localAvatar.setPersonagem(def);
  if (r && r.ok === false) toast('Não consegui carregar esse personagem.', 'error');
}
aplicarPersonagem({ carregar: false });

// Modal com as miniaturas e a prévia ao vivo (escolher-personagem.js): no formulário de entrada
// e no botão da barra, dentro da sala.
// O entrada.js já criou o modal (pode até estar aberto, com a prévia girando): fica com ele e só
// troca as funções.
const opcoesDaEscolha = {
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
};
const escolha = entrada?.escolha
  ? Object.assign(entrada.escolha, opcoesDaEscolha)
  : new EscolherPersonagem(opcoesDaEscolha);
$('#in-char').addEventListener('click', () => escolha.abrir(settings.char));
// o modelo 3D do personagem só baixa depois que o mundo ficou pronto: não disputa a abertura
world.pronto.then(() => aplicarPersonagem());
$('#btn-personagem').addEventListener('click', () => escolha.abrir(settings.char));

// Catálogo de jogos (catalogo-jogos.js): todos os jogos por gênero, com a maquete 3D de cada um.
// Truco e uno ficam na mesma mesa de cartas; os jogos sem lugar próprio levam até a área deles.
const AREA_DO_JOGO = { futebol: 'estadio', volei: 'quadras', basquete: 'quadras', boliche: 'quadras', surf: 'aventura', matamata: 'aventura', batalha: 'aventura', truco: 'cartas', uno: 'cartas' };
function irParaJogo(id) {
  if (!state.joined) return;
  if (id === 'parkour') return goToStart();
  if (id === 'ringue') return goToRing();
  if (id === 'corrida') return irParaLargada();
  if (['xadrez', 'dama', 'velha'].includes(id)) return irParaMesa(id);
  if (id === 'cacheta' || id === 'vinteum') {
    // as mesas da cacheta e do 21 ficam longe das outras de cartas: leva direto à do jogo
    const l = cartas.lugar(id);
    player.teleport([l.pos[0], l.pos[1], l.pos[2]], l.yaw);
    return sfx.teleport();
  }
  if (id === 'dados') return $('#jogos-dados').click();
  irParaArea(AREA_DO_JOGO[id] || id);
}
const catalogo = new CatalogoJogos({
  raiz: $('#catalogo-jogos'),
  ligado: (id) => jogoLigado(id),
  ir: (id) => {
    sairDoJogo(); // futebol, céu, gincana... saem antes de ir
    run.abandon();
    if (player.veiculo && id !== 'corrida') toggleVeiculo();
    exitFocus();
    // offline: já senta na mesa do jogo (offline.js)
    if (offlineJogo) return entrarNoJogoOffline(id);
    irParaJogo(id);
  },
  painel: (nome) => openPanel(nome),
  aoAbrir: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (state.panel) closePanel();
    $('#cj-pc').hidden = !state.donoDaSala || !!offlineJogo; // os jogos do PC são só do dono
    player.enabled = false;
    player.keys.clear();
  },
  aoFechar: () => {
    if (state.joined) player.enabled = true;
  },
});
$('#btn-jogos').addEventListener('click', () => (catalogo.aberto ? catalogo.fechar() : catalogo.abrir()));
// Jogos do PC (pc-jogos.js): o catálogo do PC de jogos da sala, para o dono escolher (/jogos ou o botão
// no catálogo de jogos). O PC de jogos atende em pedidoDeJogo.
const pcJogos = new PcJogos({
  socket: () => socket,
  toast: (...a) => toast(...a),
  dono: () => state.donoDaSala,
  aoAbrir: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (catalogo.aberto) catalogo.fechar();
    player.enabled = false;
    player.keys.clear();
  },
  aoFechar: () => {
    if (state.joined) player.enabled = true;
  },
});
$('#cj-pc').addEventListener('click', () => pcJogos.abrir());
$('#btn-pc-jogos').addEventListener('click', () => (pcJogos.aberto ? pcJogos.fechar() : pcJogos.abrir()));
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
for (const sel of ['#ep-camiseta']) {
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
  const note = $('#lobby-note');
  note.hidden = false;
  note.classList.add('warn');
  note.innerHTML = 'Este endereço não é seguro (http). Microfone e compartilhamento de tela só funcionam em <b>https</b> ou <b>localhost</b>. Use o link do túnel (npm run tunnel) ou <b>npm run https</b>.';
}

setTimeout(() => localAvatar.emote('wave'), 900);

$('#lobby-form').addEventListener('submit', (e) => {
  e.preventDefault();
  // Celular: a sala é sempre deitada. No Android a trava de orientação só vale em tela cheia, que
  // precisa deste toque; no iPhone não há trava (nem tela cheia) e, em pé, um aviso cobre a sala
  if (isTouch && temTelaCheia && !isFullscreen()) toggleFullscreen().then(updateFullscreenButton);
  join();
});

// ------------------------------------------------------------------ salas (lista lateral)
// Trocar de sala recarrega a página já entrando na outra (?entrar=1): voz, telas e jogos começam
// do zero, do mesmo jeito que na primeira entrada. Sala com senha sem passe para no saguão.
// Também serve para voltar à mesma sala (servidor novo no ar, 3D que não voltou sozinho).
function recarregarNaSala(id = state.room, mapa = null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('sala', id);
  url.searchParams.set('entrar', '1');
  url.searchParams.delete('mundo'); // de quando havia dois mundos
  // trocando de sala, o mapa é o que a outra sala usa (mapas-dados.js lembra); só vai no endereço
  // quando é para montar outro mapa nesta (assim funciona até sem localStorage)
  if (mapa) url.searchParams.set('mapa', mapa);
  else if (id !== state.room) url.searchParams.delete('mapa');
  liberarSaida();
  window.location.href = url;
}
// música da sala (musica.js): a fila do YouTube que todo mundo ouve junto, longe do telão
const musica = new Musica({
  socket: () => socket,
  toast: (...a) => toast(...a),
  volume: () => settings.musica,
  aoMudarVolume: (v) => {
    settings.musica = v;
    saveSettings();
  },
  painelAberto: () => state.panel === 'musica',
  // música no telão: quem carrega cada faixa no telão é o servidor; daqui só destrava o som do
  // telão (o toque no botão vale como gesto) e lê o segundo e a duração do player dele
  noTelao: {
    liberar: () => {
      if (!tv) return false;
      tv.unblock();
      return true;
    },
    tempo: () => (tv?.ready && tv.state.provider === 'youtube' ? tv.adapter.time() : null),
    duracao: () => (tv?.ready && tv.state.provider === 'youtube' ? tv.adapter.duration() : 0),
  },
});

const salas = new SalasLaterais({
  raiz: $('#salas'),
  atual: () => state.room,
  passes: lerPasses,
  aoTrocar: (id) => recarregarNaSala(id),
});
// salas ao vivo (aovivo.js): o cartão do saguão e as salas com gente na coluna lateral
const aoVivo = entrada?.aoVivo || new AoVivo();
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
// Modo offline (offline.js): o jogo de cartas escolhido no saguão. Daqui em diante o clique num
// jogo do cartão "Jogar sem internet" (entrada.js) vem para cá.
let offlineJogo = null;
function jogarOffline(id) {
  if (state.joined || offlineJogo) return;
  offlineJogo = id;
  if (!nameInput.value.trim()) nameInput.value = 'Jogador';
  join();
}
if (entrada) entrada.aoJogarOffline = jogarOffline;
if (pedidoDaEntrada.offline) {
  setTimeout(() => jogarOffline(pedidoDaEntrada.offline), 0);
} else if (params.get('entrar') === '1') {
  const url = new URL(window.location.href);
  url.searchParams.delete('entrar');
  url.searchParams.delete('compartilhar'); // recarregar a página não compartilha de novo
  window.history.replaceState(null, '', url);
  // depois do resto do módulo: o join usa coisas declaradas mais abaixo
  if (nameInput.value.trim()) setTimeout(join, 0);
} else if (pedidoDaEntrada.entrar && nameInput.value.trim()) {
  // apertou Entrar enquanto a sala carregava
  setTimeout(join, 0);
}
// a coluna das salas começa escondida toda vez que entra; o botão Salas do menu mostra
document.body.classList.toggle('sem-salas', !isTouch);
function abrirSalas(abrir) {
  document.body.classList.toggle('salas-abertas', abrir);
  $('#btn-salas').classList.toggle('on', abrir);
  if (abrir) salas.atualizar();
  syncTouchVisibility();
}
$('#btn-salas').addEventListener('click', () => {
  if (isTouch) return abrirSalas(!document.body.classList.contains('salas-abertas'));
  const oculta = document.body.classList.toggle('sem-salas');
  $('#btn-salas').classList.toggle('on', !oculta);
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
  // offline não há com quem falar: nem pede o microfone
  state.micOn = offlineJogo ? false : settings.mic;
  state.roomRequested = offlineJogo ? 'offline' : roomInput.value.trim() || 'principal';

  const btn = $('#btn-join');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  audioContext();

  const sala = idDaSala(state.roomRequested);
  const acesso = offlineJogo ? {} : await liberarSala(sala, $('#in-senha-sala').value);
  // todo mundo entra com a conta: faz o login (ou cria a conta) com o nome e a senha digitados
  if (!acesso || (!offlineJogo && !(await contaParaEntrar(name)))) {
    btn.disabled = false;
    btn.textContent = 'Entrar na sala';
    return;
  }
  // Escolheu no saguão uma sala de outro mapa que o montado nesta página (o mapa é montado antes,
  // pela sala do endereço): recarrega já entrando nela com o mapa certo, ainda no saguão. Entrar
  // primeiro e recarregar depois (mapaDaSala) era o "entra, sai e entra de novo".
  if (MAPAS[acesso.mapa] && acesso.mapa !== MAPA_DA_PAGINA) {
    lembrarMapa(sala, acesso.mapa);
    return recarregarNaSala(sala, acesso.mapa);
  }

  let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  if (!offlineJogo) try { config = await (await fetch('/config')).json(); } catch { /* usa o padrão */ }

  // No celular (redes móveis/operadoras) polling primeiro; no computador, websocket primeiro. Se
  // o primeiro não abrir (proxy ou antivírus que barra websocket), tryAllTransports tenta o outro:
  // sem ele o socket.io insiste só no primeiro e a pessoa nunca entra.
  // Offline: o socket de mentira, ligado ao servidor de bolso dos jogos de cartas (offline.js).
  if (offlineJogo) {
    try {
      const { criarSocketOffline } = await import('./offline.js');
      socket = await criarSocketOffline({ mapa: MAPA_DA_PAGINA, nome: name, cor: settings.color });
    } catch (err) {
      console.error(err);
      offlineJogo = null;
      btn.disabled = false;
      btn.textContent = 'Entrar na sala';
      toast('Não deu para abrir o modo offline. Baixe os jogos de novo com internet.', 'error', 8000);
      return;
    }
  } else {
    socket = window.io({
      transports: isTouch ? ['polling', 'websocket'] : ['websocket', 'polling'],
      tryAllTransports: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
  }
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
  // o som da tela do PS5 para quem alugou sem a dublagem: o do PS5 sozinho (semDublagemPara)
  rtc.somPara = (id, key, track) => {
    const sh = self()?.shares.get(key);
    const m = sh?.somPc;
    return m?.origem === 'voz' && track === m.mix && m.ps5?.readyState === 'live' && semDublagemPara(id, sh) ? m.ps5 : null;
  };
  rtc.onControle = receberDireto;
  rtc.onTurbo = (id, canal) => turboEnvio.receber(id, canal);
  rtc.onTurboSom = (id, canal) => turboEnvio.receberSom(id, canal);
  rtc.onTeste = (id, canal) => testeEnvio.receber(id, canal);
  rtc.onTesteDados = (id, canal) => testeEnvio.receberDados(id, canal);
  // a credencial do TURN vence (48 h na Cloudflare): renova com a página aberta
  setInterval(() => {
    fetch('/config').then((r) => r.json()).then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
  }, 6 * 3600_000);
  // Entrou sem TURN (o /config falhou ou veio só com STUN, servidor acordando): busca de novo a
  // cada 10 s até vir. Sem ele, quem está em outra rede (4G, CGNAT) não ouvia ninguém até
  // recarregar a página; as conexões que não ligaram são refeitas com o TURN novo (rtc.vigiar).
  if (!offlineJogo && !rtc.temTurn) {
    const semTurn = setInterval(() => {
      if (rtc.temTurn) return clearInterval(semTurn);
      fetch('/config').then((r) => r.json()).then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
    }, 10_000);
  }
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
  if (data?.erro) return senhaRecusada(data.erro);
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
  document.body.classList.add('na-sala'); // celular em pé: o aviso de girar (style.css)
  $('#lobby').hidden = true;
  // primeira visita: o tutorial da interface vem antes do aviso de boas-vindas
  $('#hud').hidden = false;
  $('#bar').hidden = false;
  quedaEm = null;
  reconectouEm = Date.now();
  voltarDiretas('a página recarregou');
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
  // o OBS chega como câmera: só no computador (o celular também tem câmera, mas não tem OBS)
  if (!navigator.mediaDevices?.getDisplayMedia || isTouch) $('#obs-row').hidden = true;
  // PS5 direto: só no PC (a ponte roda no Windows, pelo ajudante)
  $('#btn-ps5').hidden = isTouch || !temPs5Nativo();
  $('#btn-pc').hidden = isTouch || !temPcDireto();
  // com um monitor só não há o que escolher (o screen:0)
  $('#obs-monitor-field').hidden = $('#obs-row').hidden || window.screen.isExtended === false;
  sfx.join();
  if (isTouch) {
    touchPad = setupTouchControls(player, {
      use: () => { if (state.hovered) enterFocus(state.hovered); else if (state.focus) exitFocus(); },
      view: toggleView,
      respawn: () => teclaR(),
      sairJogo: () => sairDoJogo(),
      // em jogo a barra do topo some; o ☰ traz ela de volta
      menu: () => document.body.classList.toggle('barra-aberta'),
      hud: () => alternarHud(),
      punch: () => punch(),
      tapa: () => darTapa(),
      sit: () => toggleSit(),
      car: () => toggleVeiculo(),
      voar: () => toggleVoar(),
      puloAlto: () => togglePuloAlto(),
      tiro: () => puxarGatilho(),
      // jogos com bola: o E e a ação (o clique do computador)
      jogoE: () => usarEDosJogos(),
      jogoAcao: () => { if (acaoDosJogos()) cliqueDoJogo = true; },
      jogoSoltar: () => {
        if (!cliqueDoJogo) return;
        cliqueDoJogo = false;
        soltarAcaoDosJogos();
      },
      luneta: () => ligarLuneta(!luneta),
      soltarTiro: () => soltarGatilho(),
      // criador por voz: o microfone é o N (segurar e soltar, ou tocar para ligar e desligar) e a
      // grade é o U (catálogo)
      voz: () => criador.vozApertar(),
      soltarVoz: () => criador.vozSoltar(),
      catalogo: () => criador.abrirCatalogo(),
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
  }
  if (offlineJogo) return entrarNoJogoOffline(offlineJogo);
  // ?compartilhar=tela (o "abrir-e-compartilhar.bat" do PC de quem compartilha): aparece o botão
  // "Compartilhar a tela inteira". O Chrome só abre o seletor depois de um clique na página; o .bat
  // aperta este botão pelo UI Automation do Windows (que conta como clique) e depois o Compartilhar
  // do seletor, que já abre na aba "Tela inteira". Sem o .bat, é só clicar.
  if (compartilharAoEntrar) {
    compartilharAoEntrar = false;
    botaoTelaInteira();
  }
  // com a barra e os botões de toque já no lugar (e um respiro para a sala aparecer)
  if (tutorialHud.precisa()) setTimeout(() => tutorialHud.iniciar(), 900);
}

// Offline: o catálogo (só com os jogos de cartas, os únicos ligados) é a página inicial e é para
// onde se volta ao levantar da mesa
function abrirCatalogoOffline() {
  if (!offlineJogo || catalogo.aberto || Date.now() - sentandoOffline < 1500) return;
  setTimeout(() => {
    if (!catalogo.aberto && !cartas.ativa && !poker.ativa && Date.now() - sentandoOffline > 1500) catalogo.abrir();
  }, 150); // depois de o foco da mesa sair (ele devolve o boneco)
}
let sentandoOffline = 0; // indo para outra mesa pelo catálogo: o levantar da anterior não reabre ele
cartas.aoSairDaMesa = abrirCatalogoOffline;
poker.aoSairDaMesa = abrirCatalogoOffline;

// Offline: leva à mesa do jogo escolhido, senta e começa (os robôs completam a mesa).
// id 'catalogo': só abre o catálogo.
function entrarNoJogoOffline(id) {
  if (!document.body.classList.contains('modo-offline')) {
    document.body.classList.add('modo-offline');
    // o catálogo vira a tela inicial: só sai dele para um jogo, e volta a ele ao levantar
    catalogo.fixo = true;
    $('#catalogo-jogos').classList.add('cj-offline');
    $('#cj-titulo').innerHTML = 'Jogos de cartas <small class="cj-sub">sem internet · contra os robôs</small>';
  }
  if (id === 'catalogo') return abrirCatalogoOffline();
  sentandoOffline = Date.now();
  const ehPoker = id === 'poker';
  const l = ehPoker ? poker.lugar() : cartas.lugar(id);
  player.teleport([l.pos[0], l.pos[1] ?? 0, l.pos[2]], l.yaw);
  setTimeout(() => {
    if (ehPoker) {
      const M = poker.mesas[0];
      if (!M || !focarCartas('poker')) return;
      poker.sentar(M);
      socket.emit('pk-comecar', { mesa: M.i });
    } else {
      const M = cartas.mesas.find((x) => x.m.jogo === id);
      if (!M || !focarCartas()) return;
      cartas.sentarNa(M);
      socket.emit('ct-comecar', { mesa: M.i });
    }
  }, 400);
  // não conseguiu sentar (mesa cheia, sem moedas...): volta ao catálogo em vez de largar no mundo
  setTimeout(() => {
    if (cartas.ativa || poker.ativa) return;
    sentandoOffline = 0;
    abrirCatalogoOffline();
  }, 2500);
}

// Entra na sala e espera a resposta do servidor: os dados da sala, ou { erro: 'senha' }. Se a
// conexão cair no meio, o join daquela conexão morreu com ela (o servidor tira quem caiu): manda de
// novo quando o socket.io reconectar. Antes, uma queda aqui virava erro e o erro era tratado como
// senha recusada — a página voltava para o saguão e esquecia o passe da sala.
let joinPromise = null;

function emitJoin() {
  if (joinPromise) return joinPromise;
  joinPromise = new Promise((resolve) => {
    let feito = false;
    let lento;
    const enviar = () => {
      if (feito) return;
      clearTimeout(lento);
      lento = setTimeout(() => {
        if (!feito) toast('A conexão está lenta. Ainda tentando entrar na sala…', 'warn', 8000);
      }, 15000);
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
        lan: tokenLan(),
        proto: 2, // recebe as posições em lote ('states'); aba antiga continua no 'state' de cada um
      }, (data) => {
        if (feito) return;
        feito = true;
        clearTimeout(lento);
        socket.off('connect', enviar);
        joinPromise = null;
        resolve(data);
      });
    };
    // cada conexão nova (a primeira ou uma reconexão no meio da entrada) manda o join de novo
    socket.on('connect', enviar);
    if (socket.connected) enviar();
  });
  return joinPromise;
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
  aplicarLan(data.lan);
  entrarLan();
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
  musica.iniciar();
  self().moedas = data.moedas ?? 0;
  mostrarMoedas();
  aplicarSala(data.sala);
  reentrarComoDono();
  reentrarAtendendoTela();
  salas.iniciar();

  for (const u of data.users) rtc.getPeer(u.id);

  const url = new URL(window.location.href);
  url.searchParams.set('sala', state.room);
  if (!offlineJogo) window.history.replaceState(null, '', url);
  refreshScreens();
  renderPeople();
  updateRoomInfo();
}

function bindSocket() {
  // o relatório do modo jogo guarda as quedas (o modo jogo cai junto; a próxima sessão mostra o que
  // houve antes dela: em 2026-11-17 tudo piorou depois de uma reconexão e o relatório não dizia)
  socket.on('disconnect', (motivo) => {
    diagJogo.marcar('caiu a conexão com o servidor', { motivo: String(motivo || '') });
    quedaEm ??= Date.now();
    lembrarJogo(); // jogando numa tela de outra pessoa: quando ela voltar, o botão "Voltar ao jogo"
    if (state.joined) $('#reconnecting').hidden = false;
  });
  socket.on('connect', async () => {
    diagJogo.marcar('conectou ao servidor', { id: socket.id, transporte: socket.io?.engine?.transport?.name ?? null });
    // durante um join o próprio emitJoin manda de novo nesta conexão
    if (!state.joined || joinPromise) return;
    // Reconexão: refaz tudo do zero com o novo id. Sempre — mesmo logo depois de entrar: o
    // servidor já tirou quem caiu, e sem o join de novo a pessoa ficava fantasma (ninguém a via)
    // com o "Reconectando" na tela. A troca de transporte do socket.io não passa por aqui.
    $('#reconnecting').hidden = true;
    // As telas no ar NÃO param: a captura continua viva e volta para a sala com a chave nova
    // (antes, qualquer piscada da internet ou reinício do servidor desligava tudo).
    const guardadas = guardarTelas();
    const queda = quedaEm;
    diretas.travada = true; // as que sobraram (imagem morta) saem, mas ninguém mandou parar
    try { pararTodasAsTelas(false); } finally { diretas.travada = false; }
    for (const id of [...state.users.keys()]) if (id !== state.selfId) removeUser(id, true);
    const data = await emitJoin();
    const largar = () => {
      aDevolver = [];
      for (const g of guardadas) for (const t of g.stream.getTracks()) t.stop();
    };
    if (data?.erro) {
      largar();
      return senhaRecusada(data.erro);
    }
    // o servidor mudou de versão (deploy novo): recarrega já entrando, com o código que combina com ele.
    // A captura não sobrevive à recarga: o PC do /tela compartilha de novo sozinho depois (telaParaVoltar).
    if (data?.versao && data.versao !== state.versao) {
      lembrarTelasParaVoltar(guardadas);
      // a imagem que caiu nesta mesma queda também volta depois da recarga
      for (const m of diretas.paraVoltar(queda)) diretas.atualizar(m, { caiu: null });
      largar();
      return recarregarNaSala();
    }
    applyJoined(data);
    toast('Reconectado!');
    quedaEm = null;
    reconectouEm = Date.now();
    if (await devolverTelas()) voltarDiretas('a conexão caiu', queda);
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
    criador.definirArma(id, null);
    removeUser(id);
    salas.atualizar();
  });

  // servidor antigo: uma mensagem por pessoa a cada passo
  socket.on('state', ({ id, p, r, a, s }) => {
    const u = state.users.get(id);
    if (!u || u.isSelf) return;
    u.avatar.setNetworkState(p, r, a);
    u.speaking = !!s;
    u.avatar.speaking = u.speaking && ouco(u); // aro só em quem dá para ouvir
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
      // aro verde só em quem dá para ouvir (outra sala à prova de som, ou outro jogo, fala e não se ouve)
      u.avatar.speaking = u.speaking && ouco(u);
    }
  });

  socket.on('user-update', ({ id, name, mic, cam, photo, shirt, char, color, arma, health, ko, status, inativo, gestor, desde }) => {
    const u = state.users.get(id);
    if (!u) return;
    // o /jogar entra como "Visitante" (o teste da conexão roda durante o login) e vira a conta da pessoa sem reconectar
    if (typeof name === 'string' && name && name !== u.name) {
      u.name = name;
      u.avatar.setName(name);
      renderPeople();
    }
    if (status !== undefined || inativo !== undefined || gestor !== undefined) {
      if (status !== undefined) u.status = status;
      if (inativo !== undefined) u.inativo = inativo;
      if (gestor !== undefined) u.gestor = gestor;
      if (desde !== undefined) u.desde = desde;
      u.avatar.setPresenca(COR_STATUS[presencaDe(u)]);
      if (u.isSelf && gestor !== undefined) {
        if (gestor) pedirNotificacoes();
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

  // tapa (de alguém, em alguém): o braço de quem bateu, o PLAFT! em quem levou e, se fui eu, o
  // empurrão e a marca da mão na tela
  socket.on('tapa', ({ de, deNome, para, dir }) => {
    const quem = state.users.get(de);
    if (quem && !quem.isSelf) quem.avatar.tapa();
    if (!para) return; // tapa no vento: só o braço
    const alvo = state.users.get(para);
    if (!alvo) return;
    alvo.avatar.levarTapa(dir, !alvo.isSelf);
    const d = localAvatar.group.position.distanceTo(alvo.avatar.group.position);
    sfx.tapa(THREE.MathUtils.clamp(1 - d / 40, 0.05, 1));
    if (alvo.isSelf) leveiTapa(deNome, dir);
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

  socket.on('hit', ({ from, fromName, dir, arma, dano }) => {
    combat.takeHit({ dir, from, fromName, arma, dano });
  });

  socket.on('criador-arma', ({ id, texto }) => criador.definirArma(id, texto));
  socket.on('criador-tiro', (m) => criador.tiroRemoto(m));

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

  socket.on('share-update', ({ id, key, slot, streamId, gone, controle: podeControlar, site, titulo, superficie }) => {
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
      tinha.superficie = superficie ?? tinha.superficie ?? null;
      updateFocusCtrl();
      // reconheceu o jogo da janela agora: o controle de toque passa para os botões dele
      toqueJogo.jogoDaTela(key, tinha.titulo);
      fisico.jogoDaTela(key, tinha.titulo);
    } else if (u.isSelf) {
      return;
    } else if (gone) {
      if (!tinha) return;
      u.streams.delete(tinha.streamId);
      soltarVideo(tinha);
      u.shares.delete(key);
    } else {
      const sh = { key, slot: slot ?? null, streamId, video: null, controle: !!podeControlar, site: site ?? null, titulo: titulo ?? null, superficie: superficie ?? null };
      u.shares.set(key, sh);
      toast(`${u.name} começou a compartilhar (${ondeEsta(sh)})`, 'info', 4500, u.color);
    }
    u.avatar.setStatus({ sharing: u.shares.size > 0 });
    // a tela mudou de lugar, entrou ou saiu: as telas do 3D se refazem mesmo sem vídeo novo
    if (u.isSelf || !routeStreams(u)) refreshScreens();
    renderPeople();
    setTimeout(atualizarInteresse, 0);
  });

  socket.on('mu-estado', (s) => musica.estado(s));
  socket.on('mu-aviso', (a) => musica.aviso(a));

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
  socket.on('chat-aviso', addAviso);
  // /tela: este PC (liberado) foi chamado; ou a resposta do PC que eu chamei
  socket.on('tela-pedido', (m) => pedidoDeTela(m || {}).catch((err) => socket.emit('tela-resposta', { ok: false, texto: String(err?.message || err) })));
  socket.on('tela-resposta', ({ de, ok, texto, jogo }) => {
    const quem = jogo ? `PC de ${de}` : `/tela ${de}`;
    avisoTela(`${quem}: ${texto}`);
    if (!ok) toast(`${quem}: ${texto}`, 'warn', 8000);
    else if (jogo) toast(`${quem}: ${texto}`, 'success', 7000);
    if (jogo) pcJogos.resposta();
    if (jogo) remotoResposta(ok, texto, de);
  });
  // Jogos do PC: este PC (o de jogos) foi chamado; ou o catálogo de algum PC mudou
  socket.on('hub-pedido', (m) => pedidoDeJogo(m || {}).catch((err) => socket.emit('tela-resposta', { ok: false, jogo: true, texto: String(err?.message || err) })));
  socket.on('hub-mudou', () => pcJogos.mudou());
  // PC da casa a distância: o dono pediu daqui a Tela 1, o PC direto ou o PS5 direto (ver pedidoRemoto)
  socket.on('hub-remoto', (m) => pedidoRemoto(m || {}).catch((err) => socket.emit('tela-resposta', { ok: false, jogo: true, texto: String(err?.message || err) })));

  socket.on('browser-opened', ({ site, by }) => {
    toast(by === settings.name ? `Abrindo ${site} no telão` : `${by} abriu ${site} no navegador do telão`, 'info', 3500, '#38bdf8');
  });

  socket.on('emote', ({ id, kind }) => state.users.get(id)?.avatar.emote(kind));
  socket.on('jogo', (msg) => jogos.receber(msg));
  // mexendo na própria aba: sem o aviso de "fulano está mexendo na sua aba"
  socket.on('controle', receberControle);
  // a volta de uma tela que controlo: o texto do Ctrl+C, ou um aviso do site (ver aviso-site.js)
  socket.on('controle-volta', receberVolta);
  // o dono pôs, trocou ou tirou a senha: quem está dentro recebe o passe novo
  socket.on('passe', (passe) => {
    state.passe = passe;
    guardarPasse(state.room, passe);
  });
  socket.on('lan', aplicarLan);
  // chegou alguém novo: o liberado "até alguém novo" acabou e a pessoa nova testa
  socket.on('lan-novo', (m) => {
    const maqs = (m?.maquinas || []).map((x) => MAQUINAS_LAN[x]).filter(Boolean).join(' e ');
    if (m?.id === state.selfId) toast(`Pode testar: ${maqs} livre para os seus 2 minutos grátis.`, 'success', 8000);
    else if ((m?.maquinas || []).some((x) => lanEraAberta.has(x))) toast(`${m.nome} chegou para testar: o seu tempo liberado no ${maqs} acabou.`, 'info', 10000);
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
  socket.on('moedas', ({ id, moedas, delta, motivo, pix }) => {
    const u = state.users.get(id);
    if (!u) return;
    u.moedas = moedas;
    if (u.isSelf) {
      mostrarMoedas(true);
      // as apostas (poker) tiram do saldo sem festa; o que entra toca a moeda. O pix do dono que
      // tira também avisa: senão o saldo some sem explicação
      if (delta > 0) {
        sfx.moeda();
        toast(`+${delta} moedas · ${motivo}`, 'success', 4500);
      } else if (pix) {
        toast(`−${-delta} moedas · ${motivo} (agora ${moedas})`, 'info', 5000);
      }
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
  if (data.criador) criador.definirArma(data.id, data.criador);
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
  for (const key of [...jogandoAqui.keys()]) jogoAqui(key, id, false);
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
  const btnGalera = $('#hud-btn-galera');
  if (btnGalera) {
    const temAmigos = state.users.size > 0;
    btnGalera.hidden = !temAmigos;
    if (temAmigos) {
      const amigos = [...state.users.values()];
      const txt = $('#hud-txt-galera');
      if (txt) txt.textContent = amigos.length === 1 ? `Ir até ${amigos[0].name}` : `Ir até amigos (${amigos.length})`;
    }
  }
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
  if (document.hidden || jogoNoMeuPc()) return 'off';
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

// em foco: como a tela está chegando (altura, quadros, atraso e se passa pelo TURN)
async function medirFoco() {
  const el = $('#focus-qualidade');
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  const track = t && !t.user.isSelf ? t.share.video?.srcObject?.getVideoTracks()[0] : null;
  const r = track && rtc ? await rtc.recebendo(t.user.id, track.id) : null;
  let texto = r ? `${r.altura}p · ${r.fps} qps` : '';
  if (r?.atraso != null) texto += ` · ~${r.atraso} ms`;
  // TURN por TCP: um pacote perdido segura todos os de trás (rede que bloqueia UDP)
  if (r?.turn) texto += ` · via TURN${r.turn === 'udp' ? '' : ' (TCP)'}`;
  // modo jogo: quantos quadros a captura pega lá no PC de quem compartilha
  const la = jogandoLa && diagJogo.sessao?.outroLado;
  if (la && Date.now() - la.recebido < 6000 && la.captura != null) texto += ` · lá: captura ${Math.round(la.captura)} qps`;
  el.textContent = texto;
  el.title = r?.atraso != null
    ? 'Atraso medido aqui: a rede (metade da ida e volta) mais a espera de cada quadro até ficar pronto. A captura e a codificação no PC de quem compartilha somam mais um pouco.'
    : '';
}
setInterval(medirFoco, 1000);

// ------------------------------------------------------------------ compartilhar tela
// Dá para compartilhar várias abas/janelas ao mesmo tempo: cada clique em "Compartilhar outra"
// abre o seletor do navegador de novo e a escolhida vai para a próxima tela livre.
// telaEscolhida: veio do (+) de uma tela (aí não pergunta onde)
// monitor: o seletor abre já na tela inteira (o ?compartilhar=tela)
// obs: pela câmera virtual do OBS, a 120 qps (rtc.captureObs; a captura de tela do Chrome não
// passa de ~54)
// auto: veio do /tela (ninguém na frente deste PC): não pergunta em qual tela da sala
// Devolve a chave da tela nova (ou nada, se não compartilhou).
async function novaTela(telaEscolhida, { monitor = false, obs = false, auto = false } = {}) {
  if (shareBusy) return;
  if (obs ? !navigator.mediaDevices?.getUserMedia : !navigator.mediaDevices?.getDisplayMedia) {
    toast('Seu navegador não permite compartilhar a tela aqui. Use Chrome/Edge no computador (https ou localhost).', 'error', 6000);
    return;
  }
  if (!cabeMaisUma()) {
    toast('Todas as telas e o telão estão ocupados. Pare uma delas para compartilhar outra.', 'warn', 5000);
    return;
  }
  // escritório, fora do próprio posto: a pessoa escolhe em qual tela da sala vai aparecer
  const tela = telaEscolhida ?? (auto ? undefined : await escolherTela());
  if (tela === null) return;
  let stream;
  let key;
  shareBusy = true;
  try {
    stream = obs ? await rtc.captureObs() : await rtc.captureScreen({ monitor });
    key = await publishShare(stream, { tela, qps: obs ? QPS_OBS : null });
    if (!key) return;
  } catch (err) {
    if (obs && err.name === 'NotAllowedError') toast('Para compartilhar pelo OBS, permita a câmera para este site (o OBS aparece como câmera).', 'error', 7000);
    else if (err.name === 'SemObs') toast(err.message, 'error', 8000);
    else if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(`Não foi possível compartilhar: ${err.message}`, 'error');
    return;
  } finally {
    shareBusy = false;
  }
  const onde = ondeEsta(self().shares.get(key));
  if (obs) {
    const qps = Math.round(stream.getVideoTracks()[0]?.getSettings?.().frameRate || 0);
    const lugar = onde === 'Telão' ? 'telão' : onde;
    if (qps && qps < 100) toast(`O OBS está mandando ${qps} qps para o ${lugar}. Para 120, mude em Configurações → Vídeo → FPS no OBS e reinicie a câmera virtual.`, 'warn', 9000);
    else if (stream.getAudioTracks().length) toast(`Você está compartilhando pelo OBS no ${lugar} a ${qps || QPS_OBS} qps (com o som do PC).`, 'success', 7000);
    else toast(`Pelo OBS no ${lugar} a ${qps || QPS_OBS} qps, sem som. Para o som, no seletor escolha “Tela inteira” e marque “Compartilhar áudio do sistema”.`, 'warn', 9000);
  } else if (!stream.getAudioTracks().length) {
    toast(`${onde} sem som. Para mandar o som, escolha uma aba ou a tela inteira e marque “Compartilhar áudio”.`, 'warn', 8000);
  } else {
    toast(`Você está compartilhando no ${onde === 'Telão' ? 'telão' : onde} (com som)`);
  }
  // aba pelo seletor: o Chrome põe a faixa no topo. Uma vez por sessão, ensina o atalho sem faixa
  if (stream.getVideoTracks()[0]?.getSettings?.().displaySurface === 'browser' && !dicaFaixaDada) {
    dicaFaixaDada = true;
    setTimeout(() => toast(dicaSemFaixa().replace(/<[^>]+>/g, ''), 'info', 9000), 1500);
  }
  return key;
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
// qps: o ritmo da captura quando passa de 60 (a tela pelo OBS)
// manterNaFalha: não deu, a imagem continua viva (quem chama tenta de novo)
// reconexao: a tela já estava no ar antes da queda (tenta a mesma tela da sala; ocupada, qualquer
// outra) e o controle volta pelas mãos de quem chama.
async function publishShare(stream, { file = false, height = 0, aba: abaConhecida = null, tela, qps = null, reconexao = false, manterNaFalha = false, superficie: superficieDada = null, alvo: alvoDado = null } = {}) {
  // no escritório, numa tela da sala onde a pessoa está
  const sala = world.salaEm(player.pos.x, player.pos.z);
  // a do OBS conta como tela inteira (modo jogo, controle pelo ajudante)
  // superficieDada: a do PS5 direto ('ps5'), que não é captura nenhuma
  const superficie = superficieDada ?? (file ? null : qps ? 'monitor' : stream.getVideoTracks()[0]?.getSettings?.().displaySurface ?? null);
  // a conexão que cai no meio nunca responde: sem o prazo, a tela ficava esperando para sempre
  const pedir = (t) => new Promise((resolve) => socket.timeout(20_000).emit('share-start', { streamId: stream.id, sala, tela: t, superficie }, (err, r) => resolve(err ? null : r)));
  let res = await pedir(tela);
  if (!res?.ok && reconexao && tela != null) res = await pedir(undefined);
  if (!res?.ok) {
    if (manterNaFalha) return null;
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
  // A câmera do OBS não tem o rótulo "screen:N:0" da captura de tela: vale o monitor dos Ajustes.
  // O ajudante numera os monitores como o Windows (o 1 do Windows é o screen:0).
  // alvoDado: o do PC direto (a imagem vem da ponte, mas o mouse e o teclado vão no monitor dela)
  const alvo = file || aba != null ? null
    : alvoDado ? alvoDado
    : qps ? { superficie: 'monitor', rotulo: `screen:${Math.max(0, (Number(settings.obsMonitor) || 1) - 1)}:0` }
    : controle.alvoDe(stream);
  self().shares.set(res.key, { key: res.key, slot: res.slot ?? null, streamId: stream.id, video, file, aba, alvo, controle: false, site: null, titulo: null, obs: !!qps, superficie });
  avisarAbas();
  rtc.addScreen(res.key, stream, { file, height, qps });
  // captura: a trilha acaba quando a pessoa clica em "Parar" na barra do navegador.
  // Arquivo: acaba toda vez que o vídeo chega ao fim, e isso não é motivo para parar.
  if (!file) {
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      // a do /tela (ou do jogo) caiu sozinha neste PC sem ninguém na frente: compartilha de novo
      const doTela = telaKey === res.key && self()?.shares.has(res.key);
      const obs = !!self()?.shares.get(res.key)?.obs;
      stopShare(res.key, true);
      if (doTela) voltarTela({ obs, motivo: 'a captura caiu' });
    });
  }
  localAvatar.setStatus({ sharing: true });
  updateShareButton();
  refreshScreens();
  renderPeople();
  if (!file && !reconexao) liberarAoCompartilhar(res.key);
  manterAcordado();
  return res.key;
}

// "Já permitir controle ao compartilhar" (menu Suas telas): quem tem a extensão pronta não precisa
// voltar no menu para ligar o controle depois de compartilhar. Sem extensão, sem aba reconhecida
// ou sem o ajudante do Windows (janela/tela inteira), fica como antes: desligado e sem alarde.
async function liberarAoCompartilhar(key) {
  if (!settings.controleAuto || !controle.ext.ok || !controle.ext.liberado) return;
  const sh = self()?.shares.get(key);
  if (!sh || sh.file || sh.controle || (sh.aba == null && !sh.alvo)) return;
  if (sh.aba == null) {
    const r = await esperandoAjudante(controle.retomarJanela());
    if (r?.erro || self()?.shares.get(key) !== sh || sh.controle) return;
  }
  socket.emit('controle-permitir', { key, on: true });
  toast('Controle já liberado nessa tela: quem abrir pode mexer. Para tirar, use o botão do cursor em "Suas telas".', 'success', 6000);
  if (sh.alvo) conferirAdmin(sh);
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

// manter: só tira da sala (reconexão) — a captura, o som local e o controle seguem para a tela nova
function stopShare(key, notify, { manter = false } = {}) {
  const me = self();
  const sh = me?.shares.get(key);
  if (!sh) return;
  clearTimeout(sh.semMarca);
  clearTimeout(turbos.get(key));
  turbos.delete(key);
  // o som do PC misturado no PS5: a tela volta com o som do PS5 antes de sair
  if (sh.somPc) desligarSomPc(sh, rtc.screens.get(key));
  if (sh.ps5 && !manter && dublagem.fonte === sh.ps5) dublagem.desligar();
  rtc.stopScreen(key, { manterTrilhas: manter });
  if (sh.escuta && !manter) {
    sh.escuta.pause();
    sh.escuta.srcObject = null;
  }
  if (!manter) {
    controle.soltar(sh.aba);
    if (sh.alvo && sh.controle) controle.soltarJanela();
  }
  if (sh.file) stopCastVideo();
  if (notify) socket.emit('share-stop', key);
  me.shares.delete(key);
  // a tela do PS5 direto saiu: a sessão com o PS5 acaba junto
  if (sh.ps5 && !manter) ps5Nativo.telaSaiu(key);
  if (sh.pcDireto && !manter) pcDireto.telaSaiu(key);
  // o Lossless para todos acaba com a tela: solta a câmera do OBS e fecha a janela do PS5
  if (sh.losslessCam) {
    for (const t of sh.losslessCam.getTracks()) t.stop();
    sh.lossless = sh.losslessCam = null;
    controle.pedir('pc-obs-ps5', undefined, undefined, '__parar__', 20_000).catch(() => {});
    if (janelaLs && !janelaLs.closed) janelaLs.close();
  }
  avisarAbas();
  soltarVideo(sh);
  localAvatar.setStatus({ sharing: me.shares.size > 0 });
  updateShareButton();
  refreshScreens();
  renderPeople();
  manterAcordado();
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

// aba, janela ou tela inteira: o vídeo capturado aqui diz; o que chega de outra pessoa não
// (getSettings do vídeo recebido vem sem displaySurface) — aí vale o que ela avisou à sala
function superficieDe(sh) {
  return sh.video?.srcObject?.getVideoTracks()[0]?.getSettings?.().displaySurface || sh.superficie || null;
}

// o que a pessoa escolheu no seletor do navegador
function tipoDaTela(sh) {
  if (sh.file) return 'Vídeo do computador';
  if (sh.obs) return `OBS · ${QPS_OBS} qps`;
  if (sh.ps5) return 'PS5 direto';
  if (sh.pcDireto) return 'PC direto (placa de vídeo)';
  const surf = superficieDe(sh);
  return surf === 'browser' ? 'Aba' : surf === 'window' ? 'Janela' : surf === 'monitor' ? 'Tela inteira' : surf === 'ps5' ? 'PS5 direto' : 'Tela';
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
    + (cabe && temPs5Nativo() && !ps5Nativo.noAr ? '<button type="button" class="sp-obs" data-act="add-ps5" title="O Remote Play do PS5 sem o chiaki-ng aberto: a imagem do PS5 vai direto para quem joga">Compartilhar o PS5 direto</button>' : '')
    + (cabe && temPcDireto() && !isTouch && !pcDireto.noAr ? '<button type="button" class="sp-obs" data-act="add-pc" title="Como o Remote Play: um monitor deste PC codificado pela placa de vídeo (NVENC), a 60 ou 120 qps, direto para quem joga">Compartilhar o PC direto (placa de vídeo)</button>' : '')
    + (cabe ? `<button type="button" class="sp-obs" data-act="add-obs" title="Pela câmera virtual do OBS (o OBS a ${QPS_OBS} qps, com a câmera virtual ligada)">Compartilhar pelo OBS (${QPS_OBS} qps)</button>` : '')
    + (telas.length > 1 ? '<button type="button" class="sp-stop-all" data-act="stop-all">Parar todas</button>' : '')
    + (controle.ext.ok ? `<label class="sp-auto"><input type="checkbox" data-act="ctrl-auto"${settings.controleAuto ? ' checked' : ''}>Já permitir controle ao compartilhar</label>` : '')
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

$('#share-pop').addEventListener('change', (e) => {
  if (e.target.dataset?.act !== 'ctrl-auto') return;
  settings.controleAuto = e.target.checked;
  saveSettings();
  toast(settings.controleAuto ? 'As próximas telas já entram com o controle liberado.' : 'As próximas telas entram só para assistir; libere o controle quando quiser.', 'info', 4000);
});

$('#share-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || b.dataset.act === 'ctrl-auto') return;
  const key = b.closest('[data-key]')?.dataset.key;
  switch (b.dataset.act) {
    case 'add':
      $('#share-pop').hidden = true;
      novaTela();
      return;
    case 'add-obs':
      $('#share-pop').hidden = true;
      novaTela(undefined, { obs: true });
      return;
    case 'add-ps5':
      $('#share-pop').hidden = true;
      ps5Nativo.abrir();
      return;
    case 'add-pc':
      $('#share-pop').hidden = true;
      pcDireto.abrir();
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
  // Mouse e teclado vão direto para o dono da tela pelo canal da conexão (ver rtc.canalControle):
  // o servidor no meio somava a distância até ele a cada tecla. Canal ainda fechando: pelo servidor.
  emitir: (ev, data, volatil) => {
    // lan house: o teste grátis acabou nesta máquina livre: nada vai, e abre o aluguel
    if (ev === 'controle' && barradoNoTesteLan(data.key)) return void pedirAluguelTeste();
    if (ev === 'controle' && seguraNoPreparo(data.key, data.ev)) return;
    if (ev === 'controle' && rtc?.mandarControle(String(data.key).split('~')[0], { c: data })) return;
    if (ev === 'controle-volta' && rtc?.mandarControle(data.para, { v: { key: data.key, ev: data.ev } })) return;
    return volatil ? socket?.volatile.emit(ev, data) : socket?.emit(ev, data);
  },
  // o canal com o dono da tela está aberto (o modo jogo manda o mouse mais vezes por ele)
  direto: (key) => !!rtc?.canalControle(String(key).split('~')[0]),
  // modo jogo: o total andado pelo mouse, no canal sem ordem (ver rtc.canalMovimento e receberDireto)
  movimento: (key, total) => (barradoNoTesteLan(key) ? (pedirAluguelTeste(), true) : seguraNoPreparo(key, { t: 'mouse' }) || !!rtc?.mandarMovimento(String(key).split('~')[0], { m: { key, ...total } })),
  semPonteiro: isTouch,
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
// Chegou um clique/tecla para uma tela minha (pelo servidor ou direto, ver receberDireto).
// Mexendo na própria aba: sem o aviso de "fulano está mexendo na sua aba".
function receberControle(msg) {
  const sh = self()?.shares.get(msg.key);
  // lan house: fora quem compartilha, só quem tem o horário pago agora nesta máquina (PC ou PS5)
  // mexe; sem ninguém alugado na hora, todo mundo. O servidor também barra, mas o canal direto do
  // WebRTC não passa por ele.
  if (msg.deId && msg.deId !== state.selfId && !podeJogarLan(maquinaDaTela(sh), msg.deId)) return;
  // máquina livre: o primeiro comando de quem joga (não o "entrar no modo jogo") começa o teste grátis
  if (msg.deId && msg.deId !== state.selfId && sh?.controle && state.lan && lanLivre(maquinaDaTela(sh)) && contaNoTesteLan(msg.ev)) avisarTesteLan(msg.deId, msg.key);
  if (sh?.controle) turboDaTela(msg.key);
  controle.receber(sh, msg.deId === state.selfId ? { ...msg, deId: null } : msg);
}

function receberVolta({ key, ev, de } = {}) {
  if (typeof key !== 'string' || !ev) return;
  if (ev.t === 'copia' && typeof ev.s === 'string' && controle.pediuCopia(key)) copiarDaTela(ev.s, de);
  else if (ev.t === 'dialogo' && (ev.fechou || controle.mexeuEm(key))) avisoSite.receber(key, ev, `Na tela de ${de || 'alguém'}`);
  else if (ev.t === 'jogo-envio') {
    if (jogandoLa?.key === key) {
      jogandoLa.ps5 = ev.ps5 || null; // PS5 direto: o que o PS5 manda (e o Lossless de lá), para o selo
      diagJogo.doOutroLado(ev);
    }
  } else if (ev.t === 'tremor') {
    // o jogo do PS5 vibrou o controle: treme o celular (ou o controle ligado neste aparelho)
    if (jogandoLa?.key !== key) return;
    const como = padVirtual.tremor(ev.g, ev.p, !!ev.h);
    // relatório: o primeiro tremor diz o que o navegador oferece; depois, um resumo a cada 10 s
    tremoresAqui.n++;
    tremoresAqui.como[como] = (tremoresAqui.como[como] || 0) + 1;
    const agora = performance.now();
    if (!tremoresAqui.primeiro) {
      tremoresAqui.primeiro = true;
      tremoresAqui.desde = agora;
      diagJogo.evento('tremor do jogo chegou', { g: ev.g, p: ev.p, como, ...padVirtual.comoVibra() });
    } else if (agora - tremoresAqui.desde > 10_000) {
      diagJogo.evento('tremores', { n: tremoresAqui.n, como: tremoresAqui.como });
      tremoresAqui.n = 0;
      tremoresAqui.como = {};
      tremoresAqui.desde = agora;
    }
  } else if (ev.t === 'gatilhos') {
    // o jogo do PS5 mudou os gatilhos adaptativos: vão para o DualSense daqui (pelo WebHID)
    if (jogandoLa?.key !== key) return;
    const foi = touchpad.gatilhos(ev.e, ev.d);
    diagJogo.evento('gatilhos adaptativos chegaram', { e: ev.e?.[0], d: ev.d?.[0], dualsense: foi });
  } else if (ev.t === 'cursor') {
    // o jogo mostrou o cursor (menu) ou escondeu: o mouse troca de jeito, se a pessoa deixou
    if (jogandoLa?.key !== key) return;
    jogandoLa.cursorLivre = !!ev.livre;
    diagJogo.evento(ev.livre ? 'o jogo mostrou o cursor: mouse pela posição (menu)' : 'o jogo escondeu o cursor: mouse preso (câmera)');
    if (opcoesJogo.get('menuAuto')) controle.cursorLivre(key, !!ev.livre);
  } else if (ev.t === 'pad-erro' && jogandoLa?.key === key && Date.now() - (avisosAdmin.get(`pad:${key}`) || 0) > 60_000) {
    avisosAdmin.set(`pad:${key}`, Date.now());
    toast(`O controle virtual ainda não funciona no PC de ${de || 'quem compartilha'}: ${ev.erro === 'sem-driver' ? 'falta instalar o driver ViGEmBus' : 'falta rodar de novo o instalar.bat do ajudante'} lá.`, 'warn', 12000);
  } else if (ev.t === 'admin' && controle.mexeuEm(key) && Date.now() - (avisosAdmin.get(`de:${key}`) || 0) > 30_000) {
    avisosAdmin.set(`de:${key}`, Date.now());
    const quem = de || 'quem compartilha';
    toast(`O seu controle não chega na tela de ${quem}: ${ev.titulo ? `“${String(ev.titulo).slice(0, 40)}”` : 'o programa'} está aberto como administrador lá, e o Windows bloqueia. Peça para abrir sem administrador.`, 'warn', 12000);
  }
}

// Programa aberto como administrador no PC de quem compartilha: o Windows não deixa o ajudante (um
// programa comum) mexer nele, e os cliques e as teclas somem sem erro. Avisa quem compartilha e
// quem estava mexendo — um aviso por tela a cada 30 s. Chaves: a tela; "de:" + tela do lado de
// quem controla; "para:" + tela + pessoa para a volta.
const avisosAdmin = new Map();
// Controle virtual do PS5 (pad-virtual.js) que não abriu no ajudante: sem o driver ViGEmBus ou sem a
// biblioteca que o instalar.bat baixa. Quem compartilha vê o que instalar; quem joga, que falta lá.
controle.onPadErro = (sh, erro, deId) => {
  const agora = Date.now();
  if (deId && agora - (avisosAdmin.get(`pad-para:${sh.key}:${deId}`) || 0) > 60_000) {
    avisosAdmin.set(`pad-para:${sh.key}:${deId}`, agora);
    controle.emitir('controle-volta', { key: sh.key, para: deId, ev: { t: 'pad-erro', erro } });
  }
  if (agora - (avisosAdmin.get(`pad:${sh.key}`) || 0) < 60_000) return;
  avisosAdmin.set(`pad:${sh.key}`, agora);
  toast(erro === 'sem-driver'
    ? 'Para o controle do PS5 funcionar, instale o driver ViGEmBus neste PC (github.com/nefarius/ViGEmBus/releases) e feche e abra o Chrome.'
    : 'Para o controle do PS5 funcionar, rode de novo o instalar.bat da pasta extensao/nativo e feche e abra o Chrome.', 'warn', 15000);
};
controle.onAdmin = (sh, titulo, deId) => {
  const agora = Date.now();
  if (deId && agora - (avisosAdmin.get(`para:${sh.key}:${deId}`) || 0) > 30_000) {
    avisosAdmin.set(`para:${sh.key}:${deId}`, agora);
    controle.emitir('controle-volta', { key: sh.key, para: deId, ev: { t: 'admin', titulo } });
  }
  if (agora - (avisosAdmin.get(sh.key) || 0) < 30_000) return;
  avisosAdmin.set(sh.key, agora);
  toast(`${titulo ? `“${titulo.slice(0, 40)}”` : 'O programa compartilhado'} está aberto como administrador, e o Windows não deixa o controle chegar nele. Feche e abra de novo sem “Executar como administrador” (veja também em Propriedades → Compatibilidade do atalho).`, 'warn', 15000);
};

// Na hora de liberar uma janela: se ela está como administrador, avisa já (sem esperar alguém
// tentar mexer e nada acontecer). Tela inteira é conferida a cada clique, na janela embaixo dele.
// A resposta também diz que programa está lá (ver onQual).
async function conferirAdmin(sh) {
  if (!sh?.alvo) return;
  const r = await controle.conferirJanela(sh.alvo);
  if (r?.qual) controle.onQual(sh, r.qual);
  if (sh.alvo.superficie === 'window' && r?.admin) controle.onAdmin(sh, String(r.admin.titulo || ''), null);
}

// Que programa está na janela (na tela inteira, o da frente): o ajudante 1.6+ diz em cada
// resposta. Sendo um jogo com botões próprios no celular (toque-jogo.js), a sala fica sabendo pelo
// título da tela — só o nome do jogo, nunca o título da janela (na tela inteira ele pode ser uma
// conversa). Tela inteira não volta para "nenhum" quando outra janela vem para a frente: os botões
// de quem está jogando não trocam no meio da partida.
controle.onQual = (sh, q) => {
  if (sh.aba != null) return;
  const nome = jogoDaJanela(q);
  if (nome === (sh.titulo ?? null) || (!nome && sh.alvo?.superficie === 'monitor')) return;
  sh.titulo = nome;
  socket.emit('share-info', { key: sh.key, site: null, titulo: nome });
};

// O jogo na minha tela mostrou o cursor (menu, inventário) ou escondeu (ajudante 1.8+): quem joga nela
// fica sabendo e troca o mouse entre a câmera e o menu (controle.cursorLivre)
const cursorDoJogo = new Map(); // tela -> último estado mandado
// o Wi-Fi deste PC (ajudante do Windows), na resposta dos eventos de quem joga: vai no relatório de
// envio. A memória do PC vem no mesmo pacote (ajudante 1.12+, em pc), que a extensão já repassa inteiro.
// Ajudante 1.20+: no mesmo pacote, a carga do PC (placa, processador, rede: carga) e as placas de rede
// ligadas (redes). Vão para cada amostra de envio do relatório (em pc).
let wifiChegouEm = 0; // a última vez que o Wi-Fi e a carga do PC chegaram (pedirCargaDoPc)
controle.onWifi = (w) => {
  const { pc, carga, redes, roteador, ...wifi } = w || {};
  wifiChegouEm = Date.now();
  if (Number.isFinite(carga?.nv?.usoPct)) Object.assign(cargaDaPlaca, { usoPct: carga.nv.usoPct, em: Date.now() });
  diagJogo.wifiChegou(wifi);
  diagJogo.pcChegou({ memoria: pc ?? null, carga: carga ?? null, redes: redes ?? null, roteador: roteador ?? null });
  memoriaDoPc(pc);
};

// O Wi-Fi e a carga do PC vêm do ajudante junto da resposta ao teclado e ao mouse de quem joga. No PS5
// direto a entrada vai pela ponte do PS5 e nada vinha: justo a fase em que o Wi-Fi deste PC caiu
// (2026-11-18, 20:28) ficou sem esses números no relatório. Sem notícia há 3 s, pede direto ao ajudante
// (extensão 1.28+, ajudante 1.22+); sem resposta duas vezes seguidas, para de pedir por 1 min.
const cargaDoPc = { pedidaEm: 0, falhas: 0, pausaAte: 0 };
async function pedirCargaDoPc() {
  const agora = Date.now();
  if (agora - wifiChegouEm < 3000 || agora - cargaDoPc.pedidaEm < 1800 || agora < cargaDoPc.pausaAte) return;
  const ext = controle.ext;
  if (!ext?.ok || versaoNum(ext.versao) < versaoNum('1.28') || ext.nativo?.ok === false) return;
  if (ext.nativo?.versao && versaoNum(ext.nativo.versao) < versaoNum('1.22')) return;
  cargaDoPc.pedidaEm = agora;
  const r = await controle.pedir('pc-carga', null, null, null, 4000);
  if (!r || r.erro || r.ok === false) {
    if (++cargaDoPc.falhas >= 2) Object.assign(cargaDoPc, { falhas: 0, pausaAte: Date.now() + 60_000 });
    return;
  }
  cargaDoPc.falhas = 0;
  const { tipo, pid, ...w } = r;
  controle.onWifi?.(w);
}

// Memória do PC de quem compartilha, no modo jogo. A "confirmada" é o que os programas pediram ao
// Windows (RAM + arquivo de paginação). O emulador de Switch 2 (lichii) segura ~17 GB sozinho: com o
// Chrome compartilhando, a conta passa do limite, o Windows nega memória enquanto aumenta o arquivo de
// paginação e o jogo, o Chrome ou o PC inteiro travam. Avisa antes, a cada 2 min no máximo.
const MEMORIA_POUCA_GB = 2;
let memoriaAvisada = 0;
function memoriaDoPc(pc) {
  const livre = Number(pc?.livreGb), limite = Number(pc?.limiteGb);
  if (!Number.isFinite(livre) || !Number.isFinite(limite) || livre >= MEMORIA_POUCA_GB) return;
  if (Date.now() - memoriaAvisada < 120_000) return;
  memoriaAvisada = Date.now();
  diagJogo.evento('pouca memória virtual no PC', pc);
  toast(`Este PC está quase sem memória: ${livre.toFixed(1)} GB livres de ${limite.toFixed(1)} GB. O jogo, o Chrome ou o PC inteiro podem travar. Feche os programas que não está usando (Steam, Epic, WhatsApp...) e aumente a memória virtual do Windows (Sistema → Sobre → Configurações avançadas do sistema → Desempenho → Avançado → Memória virtual).`, 'warn', 20000);
}

// Jogo de controle (PS5 pelo chiaki-ng, emulador de Switch): o nome que a sala reconheceu na tela
const deControle = (sh) => !!LAYOUTS[layoutDoTitulo(sh?.titulo)]?.virtual;
controle.onCursor = (sh, livre) => {
  const quem = jogandoAqui.get(sh.key);
  // num jogo de controle o cursor à mostra é o do Windows, não um menu: quem joga no PC perdia o
  // mouse preso, e o celular, os botões
  if (deControle(sh)) return;
  if (!quem || cursorDoJogo.get(sh.key) === livre) return;
  cursorDoJogo.set(sh.key, livre);
  diagJogo.evento(livre ? 'o jogo mostrou o cursor (menu)' : 'o jogo escondeu o cursor', { key: sh.key });
  for (const id of quem.keys()) controle.emitir('controle-volta', { key: sh.key, para: id, ev: { t: 'cursor', livre } });
};

// O jogo do PS5 mandou o controle virtual tremer (ajudante 1.10+, extensão 1.17+): vai para quem
// está jogando com ele, no máximo um a cada TREMOR_MS (o último sempre sai — senão o celular podia
// ficar tremendo depois que o jogo parou).
const TREMOR_MS = 40;
let tremorVez = 0, tremorTimer = 0, tremorFila = null;
let tremoresLa = 0, tremoresLaDesde = 0;
controle.onTremor = ({ key, deId }, g, p, h = false) => {
  // relatório de quem compartilha: o ajudante contou que o jogo mandou tremer
  const agora = performance.now();
  tremoresLa++;
  if (!tremoresLaDesde || agora - tremoresLaDesde > 10_000) {
    diagJogo.evento(tremoresLaDesde ? 'o jogo mandou tremer' : 'o jogo mandou tremer (primeira vez)', { n: tremoresLa, g, p, joga: !!jogandoAqui.get(key)?.has(deId) });
    tremoresLa = 0;
    tremoresLaDesde = agora;
  }
  // o celular como controle da TV: quem está no modo jogo é a TV da mesma conta, e quem treme é ele
  const quem = jogandoAqui.get(key);
  const nome = state.users.get(deId)?.name;
  if (!quem?.has(deId) && !(nome && [...(quem?.keys() || [])].some((id) => state.users.get(id)?.name === nome))) return;
  if (capacidadesJogo.get(deId)?.vibra === false) return; // nada para tremer lá (teclado e mouse)
  tremorFila = { key, para: deId, ev: { t: 'tremor', g: Math.round(g * 100) / 100, p: Math.round(p * 100) / 100, ...(h ? { h: true } : {}) } };
  if (tremorTimer) return;
  const sair = () => {
    tremorTimer = 0;
    tremorVez = performance.now();
    controle.emitir('controle-volta', tremorFila);
  };
  const falta = tremorVez + TREMOR_MS - performance.now();
  if (falta <= 0) sair();
  else tremorTimer = setTimeout(sair, falta);
};

// ------------------------------------------------------------------ modo jogo
// Alguém joga numa tela minha (ligou o modo jogo nela): a sala deste PC fica leve — o 3D para de
// ser desenhado, e as telas e webcams dos outros param de chegar —, a placa de vídeo fica para o
// jogo e o codificador, e quem joga leva a banda de jogo (rtc.modoJogo). tela → Map(quem → desde)
const jogandoAqui = new Map();
let desenharMesmoAssim = false; // quem compartilha pediu a sala de volta (botão do aviso)
// PS5 direto: o jogo roda no PS5 e a imagem chega pronta (o turbo só repassa), então a placa de vídeo
// daqui não tem o que guardar e a sala continua desenhada. Com o Lossless Scaling dobrando a imagem
// do PS5 a placa trabalha, e a pausa volta.
const telaPesada = (key) => {
  const sh = self()?.shares.get(key);
  return !sh?.ps5 || !!sh.lossless;
};
const jogoNoMeuPc = () => !desenharMesmoAssim && [...jogandoAqui.keys()].some(telaPesada);
// Eu jogo na tela de outra pessoa: { key, video }
let jogandoLa = null;
const diagJogo = new DiagJogo({ toast, contexto: () => ({ sala: state.room || null, nome: settings.name || null }), verRelatorio: () => false }); // sem aviso de relatório (pedido de 2026-11-27): ele vai para o servidor do mesmo jeito

// rapido: quem joga pediu menos atraso (opção "Menos atraso"): a tela vai para ela em 720p fixo
function jogoAqui(key, deId, ligar, rapido = false) {
  const antes = jogandoAqui.size > 0;
  let quem = jogandoAqui.get(key);
  if (ligar) {
    if (!quem) jogandoAqui.set(key, (quem = new Map()));
    if (!quem.has(deId)) quem.set(deId, Date.now());
  } else {
    if (!quem?.delete(deId)) return;
    if (!quem.size) jogandoAqui.delete(key);
  }
  rtc?.modoJogo(key, jogandoAqui.has(key), [...(jogandoAqui.get(key)?.keys() || [])]);
  const mudouRapido = rtc?.rapidoJogo(deId, ligar && rapido);
  if (!ligar) {
    ajusteDoJogo.delete(deId);
    semDecodificar.delete(deId);
  } else if (cursorDoJogo.has(key)) {
    // quem chegou agora já sabe se o jogo está num menu
    controle.emitir('controle-volta', { key, para: deId, ev: { t: 'cursor', livre: cursorDoJogo.get(key) } });
  }
  // Ninguém mais joga nessa tela (desligou, saiu da sala, caiu): o ajudante solta o que estava
  // apertado — antes, quem caía segurando o W deixava o personagem andando sozinho
  if (!jogandoAqui.has(key)) {
    cursorDoJogo.delete(key);
    const sh = self()?.shares.get(key);
    if (sh?.alvo && sh.controle) controle.receber(sh, { ev: { t: 'modo', jogo: false } });
  }
  // ninguém mais joga nessa tela: a captura volta ao tamanho do preset
  if (!jogandoAqui.has(key) && (capturaDoJogo.has(key) || codificadorDoJogo.has(key))) {
    if (['testando', 'reduzida'].includes(capturaDoJogo.get(key)?.fase) || codificadorDoJogo.get(key)?.mexeu) rtc?.capturaDeJogo(key, null);
    capturaDoJogo.delete(key);
    codificadorDoJogo.delete(key);
  }
  const nome = state.users.get(deId)?.name || 'Alguém';
  diagJogo.evento(ligar ? 'modo jogo ligado por quem controla' : 'modo jogo desligado', { key, deId, nome });
  const agora = jogandoAqui.size > 0;
  // depois do comecar abaixo (o 1º pedido chega junto com o modo jogo, antes do relatório existir)
  const registrarRapido = () => { if (mudouRapido) diagJogo.evento(ligar && rapido ? 'quem joga pediu menos atraso: 720p fixo' : 'menos atraso desligado', { deId }); };
  if (antes === agora) return void registrarRapido();
  if (agora) {
    desenharMesmoAssim = false;
    diagJogo.comecar('compartilha', {
      gl: world.renderer.getContext(),
      extra: { extensao: controle.ext?.versao ?? null, ajudante: controle.ext?.nativo?.versao ?? null, preset: rtc?.shareMode ?? null, superficie: superficieDe(self()?.shares.get(key)), janelaDoJogo: self()?.shares.get(key)?.titulo ?? null, codecs: codecsTestados(), qpsCaptura: rtc?.qpsCaptura() ?? null },
    });
    avisarEmulador(self()?.shares.get(key));
    if (telaPesada(key)) toast(`${nome} está jogando no seu PC. A sala ficou em pausa aqui, para o jogo e a transmissão terem a placa de vídeo toda.`, 'info', 12000, null, {
      rotulo: 'Desenhar a sala',
      fazer: () => {
        desenharMesmoAssim = true;
        diagJogo.evento('quem compartilha voltou a desenhar a sala');
      },
    });
  } else {
    desenharMesmoAssim = false;
    diagJogo.parar();
  }
  registrarRapido();
  atualizarInteresse();
}
// o que cada pessoa que joga sente (avisarRapido do lado dela): vibra (tremor) e ds (gatilhos do DualSense);
// sem a informação (versão antiga), manda tudo como antes
const capacidadesJogo = new Map();
controle.onModo = (sh, jogo, deId, rapido, cap) => {
  if (cap && (typeof cap.vibra === 'boolean' || typeof cap.ds === 'boolean')) capacidadesJogo.set(deId, cap);
  jogoAqui(sh.key, deId, jogo, rapido);
  if (jogo && rtc?.linhasPedidas(deId, cap?.alt ?? null)) diagJogo.evento('quem joga pediu outra altura', { deId, linhas: cap?.alt ?? null });
};

// Emulador de Switch na tela: o controle de quem joga chega como um controle de Xbox virtual, e o
// emulador só o usa se o Jogador 1 estiver nele (o padrão é o controle ligado no PC). Uma vez por
// página, até a pessoa dizer que já fez.
const CHAVE_EMULADOR = 'sala3d-emulador-ok';
let emuladorAvisado = false;
function avisarEmulador(sh) {
  if (emuladorAvisado || layoutDoTitulo(sh?.titulo) !== 'switch') return;
  emuladorAvisado = true;
  try { if (localStorage.getItem(CHAVE_EMULADOR)) return; } catch { /* sem armazenamento */ }
  toast('Emulador de Switch: o controle de quem joga chega como um “Xbox 360 Controller”. No emulador, em Emulação → Configurar → Controles, ponha o Jogador 1 nele (Dispositivo de entrada). Dica: salve um perfil para ele e outro para o seu controle.', 'info', 25000, null, {
    rotulo: 'Já fiz',
    fazer: () => { try { localStorage.setItem(CHAVE_EMULADOR, '1'); } catch { /* sem armazenamento */ } },
  });
}

// quem joga: a opção "Menos atraso" vai para quem compartilha junto com o modo jogo (de novo a cada
// mudança dela, no meio da jogatina). Junto, se este aparelho sente o tremor (vibra) e se tem um
// DualSense para os gatilhos adaptativos (ds): sem eles, quem compartilha não manda — o lorrel, no
// teclado e mouse, recebia ~20 tremores por segundo pelo mesmo canal da imagem (2026-11-18)
function avisarRapido() {
  if (jogandoLa) controle.mandar(jogandoLa.key, { t: 'modo', jogo: true, rapido: !!opcoesJogo.get('rapido'), vibra: padVirtual.podeVibrar(), ds: !!touchpad.ligado });
}
// um controle ligou ou desligou neste aparelho: o que ele sente mudou
addEventListener('gamepadconnected', () => avisarRapido());
addEventListener('gamepaddisconnected', () => avisarRapido());

// eu liguei (ou desliguei) o modo jogo numa tela de outra pessoa
// Modo turbo (turbo.js). Quem compartilha: manda a imagem de uma tela minha liberada para quem
// pediu, e o vídeo da conexão para essa pessoa para. Quem joga: liga com a opção "Modo turbo".
// a placa deste PC (o ajudante manda com a carga do PC): o tratamento da imagem cede quando ela enche
const cargaDaPlaca = { usoPct: null, em: 0 };
const turboEnvio = new TurboEnvio({
  gpu: () => (cargaDaPlaca.usoPct != null ? cargaDaPlaca : null),
  tela: (key, id = null) => {
    const sh = self()?.shares.get(key);
    const scr = rtc?.screens.get(key);
    // quem alugou o PS5 sem a dublagem: o som do PS5 sozinho, no lugar da mistura com a voz (semDublagemPara)
    const semVoz = id && sh?.somPc?.origem === 'voz' && sh.somPc.ps5?.readyState === 'live' && semDublagemPara(id, sh);
    // Lossless para todos (losslessParaTodos): a câmera do OBS é codificada como uma tela comum
    if (sh?.lossless && scr) return { stream: semVoz ? new MediaStream([...sh.lossless.getVideoTracks(), sh.somPc.ps5]) : sh.lossless, controle: !!sh.controle, ps5: null };
    // sem a mistura, o PS5 direto repassa o próprio som (o Opus dele) e a tela comum leva o som do PS5
    if (semVoz && scr) return { stream: new MediaStream([...scr.stream.getVideoTracks(), sh.somPc.ps5]), controle: !!sh.controle, ps5: sh.ps5 || sh.pcDireto || null, somMix: null };
    // somMix: o som do PS5 com o do PC (somDoPcNoPs5); o turbo codifica a mistura em vez de repassar o do PS5
    // PC direto: os quadros da placa vão como saíram, igual aos do PS5 (a mesma fonte)
    return sh && scr ? { stream: scr.stream, controle: !!sh.controle, ps5: sh.ps5 || sh.pcDireto || null, somMix: sh.somPc ? new MediaStream([sh.somPc.mix]) : null } : null;
  },
  onMudou: (id, key, ligado) => {
    rtc?.turboPara(id, key, ligado);
    diagJogo.evento(ligado ? 'modo turbo: mandando a imagem por fora do vídeo' : 'modo turbo desligado: vídeo normal', { para: state.users.get(id)?.name ?? id });
  },
  // a banda que o WebRTC estima até essa pessoa (e se é a mesma casa): a banda em que o turbo começa e se
  // os quadros do PS5 vão como vieram ou codificados aqui
  rede: (id) => rtc?.caminhoPara(id) ?? null,
  onEvento: (id, texto, dados) => diagJogo.evento(texto, { para: state.users.get(id)?.name ?? id, ...dados }),
});

// o teste da conexão de quem vai jogar numa tela minha (turbo-teste.js)
const testeEnvio = new TesteEnvio({
  tela: (key) => turboEnvio.tela(key),
  sonda: (sinal, onCanal) => rtc?.responderSonda(sinal, onCanal) ?? null,
  // o vídeo normal para durante o teste (disputaria a mesma conexão); o turbo que liga em seguida cuida do resto
  silenciar: (id, key, sim) => { if (sim || !turboEnvio.sessoes.has(id)) rtc?.turboPara(id, key, sim); },
  onEvento: (id, texto, dados) => diagJogo.evento(texto, { para: state.users.get(id)?.name ?? id, ...dados }),
});

// PS5 direto (ps5-nativo.js): o Remote Play pela ponte do ajudante, sem a janela do chiaki-ng. A imagem
// do PS5 entra numa tela da sala (uma cópia decodificada aqui) e vai do jeito que o PS5 fez para quem
// joga no turbo. O controle de quem joga vai para a ponte (controle.onPs5) e chega como um DualSense.
// PC direto (pc-direto.js): um monitor deste PC pela ponte do ajudante, codificado pela placa de vídeo
// (NVENC), como o Remote Play do PS5. A mesma fonte do PS5 direto: uma cópia decodificada vira a tela da
// sala e os quadros da placa vão como saíram para quem joga no turbo. O controle é o de uma tela inteira.
// as que estão no ar por aqui, para voltarem sozinhas (diretas.js; a volta em voltarDiretas)
const diretas = new Diretas({
  sala: () => state.room,
  guarda: (() => { try { return sessionStorage; } catch { return null; } })(),
});
const pcDireto = new PcDireto({
  pedirPonte: () => controle.pedir('pc-ponte', undefined, undefined, undefined, 25_000),
  compartilhar: (fonte, info) => compartilharPcDireto(fonte, info),
  pararTela: (key) => stopShare(key, true),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  toast: (...a) => toast(...a),
  aoAbrir: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    player.enabled = false;
    player.keys.clear();
  },
  aoFechar: () => {
    if (state.joined) player.enabled = true;
  },
  aoParar: () => diretas.larga('pc'),
  aoCair: () => caiuDireta('pc'),
});

// a imagem do PC direto numa tela da sala, com o controle liberado (é para jogar). O som não toca aqui:
// é o próprio som deste PC (quem compartilha já está ouvindo).
// auto: pedido dos Jogos do PC (ninguém na frente deste PC): não pergunta a tela
async function compartilharPcDireto(fonte, { rotulo, auto = false }) {
  if (!state.joined) {
    toast('Entre na sala antes de pôr o PC numa tela.', 'warn', 5000);
    return null;
  }
  if (!cabeMaisUma()) {
    toast('Todas as telas e o telão estão ocupados. Pare uma delas para pôr o PC.', 'warn', 6000);
    return null;
  }
  const volta = voltandoDireta.pc;
  if (auto) await semCompartilharAgora();
  if (shareBusy) return null;
  shareBusy = true;
  let key;
  try {
    const tela = volta ? volta.slot ?? undefined : auto ? undefined : await escolherTela();
    if (tela === null) return null;
    key = await publishShare(fonte.stream, { tela, superficie: 'monitor', reconexao: !!volta, alvo: { superficie: 'monitor', rotulo } });
  } finally {
    shareBusy = false;
  }
  const sh = key && self()?.shares.get(key);
  if (!sh) return null;
  sh.pcDireto = fonte;
  diretas.quer('pc', { slot: sh.slot, nome: pcDireto.nomeMonitor ?? null, qps: Number(pcDireto.conectado?.qps) || 60, lan: !!volta?.lan, controle: volta?.controle ?? true });
  segurarDiretas();
  renderPeople();
  renderSharePop();
  // "Já permitir controle ao compartilhar" ligado: o publishShare já libera; senão, libera aqui
  // (na volta, o controle fica como estava: voltarDireta)
  if (!volta && !(settings.controleAuto && controle.ext.ok && controle.ext.liberado)) permitirControle(key);
  toast(`O PC está no ${ondeEsta(sh) === 'Telão' ? 'telão' : ondeEsta(sh)} pela placa de vídeo. Quem abrir a tela e ligar o modo jogo (turbo) recebe a imagem direto da placa.`, 'success', 8000);
  return key;
}

const ps5Nativo = new Ps5Nativo({
  aoParar: () => diretas.larga('ps5'),
  aoCair: () => caiuDireta('ps5'),
  pedirPonte: () => controle.pedir('ps5-ponte', undefined, undefined, undefined, 25_000),
  compartilhar: (fonte) => compartilharPs5(fonte),
  pararTela: (key) => stopShare(key, true),
  // vibração e gatilhos adaptativos: para quem mandou o último estado do controle nessa tela (como a
  // do ajudante); se quem joga é este PC (o PS5 é daqui), direto no controle daqui
  onTremor: (g, p, h) => {
    if (controle.jogo?.key === ps5Nativo.key) return void padVirtual.tremor(g, p, h);
    const u = controle.ultimoPad;
    if (u && u.key === ps5Nativo.key) controle.onTremor?.(u, g, p, h);
  },
  onGatilhos: (e, d) => {
    diagJogo.evento('ps5 direto: gatilhos adaptativos', { e: e[0], d: d[0] });
    if (controle.jogo?.key === ps5Nativo.key) return void touchpad.gatilhos(e, d);
    const u = controle.ultimoPad;
    if (!u || u.key !== ps5Nativo.key || !jogandoAqui.get(u.key)?.has(u.deId)) return;
    if (capacidadesJogo.get(u.deId)?.ds === false) return; // sem DualSense lá: os gatilhos não têm onde ir
    controle.emitir('controle-volta', { key: u.key, para: u.deId, ev: { t: 'gatilhos', e, d } });
  },
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  toast: (...a) => toast(...a),
  aoAbrir: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    player.enabled = false;
    player.keys.clear();
  },
  aoFechar: () => {
    if (state.joined) player.enabled = true;
  },
  // "Jogar com o Lossless": a tela do PS5 em foco, modo jogo em tela cheia e o Lossless ligado nela
  jogarComLossless: (key) => jogarComLossless(key),
  // "Lossless para todos": o Lossless deste PC dobra a imagem do PS5 e todos recebem pela câmera do OBS
  losslessTodos: {
    ligado: () => !!self()?.shares.get(ps5Nativo.key)?.lossless,
    alternar: () => losslessParaTodos(!self()?.shares.get(ps5Nativo.key)?.lossless),
  },
  // o volume do som do PS5 aqui (só neste PC: quem joga usa o volume das telas)
  volume: { get: () => volumePs5, set: (v) => mudarVolumePs5(v) },
  // "Levar o som do PC": o som do PC (a voz do Voz Universal) misturado no do PS5, na mesma tela
  somPc: {
    ligado: () => self()?.shares.get(ps5Nativo.key)?.somPc?.origem === 'pc',
    alternar: () => somDoPcNoPs5(self()?.shares.get(ps5Nativo.key)?.somPc?.origem !== 'pc'),
    abafar: () => abafarPs5,
    alternarAbafar: () => {
      abafarPs5 = !abafarPs5;
      try { localStorage.setItem('sala3d-ps5-abafar', abafarPs5 ? '1' : '0'); } catch { /* sem armazenamento */ }
    },
  },
  // a dublagem pelo Voz Universal, lendo a imagem do PS5 direto (voz-universal.js)
  dublagem: {
    ligada: () => dublagem.ligado,
    estado: () => dublagem.estado,
    resumo: () => dublagem.resumo(),
    ultimaFala: () => dublagem.ultimaFala,
    alternar: () => alternarDublagem(),
  },
});

// ------------------------------------------------------------------ o som do PS5 no relatório
// A cada 2 s: os pacotes de som que chegam da ponte, o tocador (buffer, faltas), quantas vezes o
// decodificador caiu e a trilha que vai para quem joga. "Parou de chegar"/"voltou" viram eventos.
const medeSomPs5 = medidorQps();
let somPs5Agora = null;
let somPs5Parado = false;
setInterval(() => {
  const f = ps5Nativo.key ? ps5Nativo.fonte : null;
  if (!f) { somPs5Agora = null; somPs5Parado = false; medeSomPs5(null); return; }
  const st = f.stats();
  const tr = f.stream?.getAudioTracks()[0];
  const pps = medeSomPs5(f.conta.som ?? 0);
  somPs5Agora = {
    pps: pps != null ? Math.round(pps) : null,
    errosDecodificador: f.conta.errosSom || 0,
    tocador: st.tocador,
    trilha: tr ? { estado: tr.readyState, muda: tr.muted, ligada: tr.enabled } : null,
  };
  if (pps == null || !diagJogo.ativo) return;
  if (!somPs5Parado && pps < 1) { somPs5Parado = true; diagJogo.evento('PS5: o som parou de chegar da ponte', somPs5Agora); }
  else if (somPs5Parado && pps >= 1) { somPs5Parado = false; diagJogo.evento('PS5: o som voltou a chegar', somPs5Agora); }
}, 2000);

// quem joga: o som sumiu (nem turbo nem vídeo normal) e voltou
let somLaSumiu = false;
function vigiarSomQueChega(resumo) {
  if (!resumo) return;
  const turboOk = resumo.turbo?.som?.ativo && resumo.turbo.som.pps > 0;
  const webrtcOk = resumo.somWebrtc?.pps > 0;
  const por = turboOk ? 'turbo' : webrtcOk ? 'vídeo normal' : 'nenhum';
  resumo.somPor = por;
  if (!somLaSumiu && por === 'nenhum') { somLaSumiu = true; diagJogo.evento('o som do jogo sumiu (nem turbo nem vídeo normal)', { turbo: resumo.turbo?.som ?? null, webrtc: resumo.somWebrtc }); }
  else if (somLaSumiu && por !== 'nenhum') { somLaSumiu = false; diagJogo.evento(`o som do jogo voltou (${por})`); }
}

// ------------------------------------------------------------------ Lossless para todos (OBS)
// O PS5 a 30 qps, o Lossless DESTE PC dobra e todo mundo recebe pela câmera do OBS (até 60: o teto do
// turbo). A sala abre uma janela só com a imagem do PS5; o ajudante (1.18+) leva essa janela maximizada
// para o monitor em que a sala não está, monta no OBS (pelo WebSocket dele) uma cena que captura aquele
// monitor e liga o Lossless nela. A imagem da tela do PS5 vira a câmera do OBS: o turbo codifica ela e o
// vídeo da conexão troca de trilha; o som e o controle continuam os do PS5 direto.
// Testado em 2026-11-16 (página a 30 qps no lugar do PS5): a câmera do OBS deu 55 quadros diferentes por
// segundo. De fábrica o Lossless só escala a janela da frente: clicando em outra ele pausava (iam os 30).
// O ajudante 1.25+ liga o "Multi display mode" dele (e solta o mouse da janela escalada): ele segue
// escalando a janela do PS5 com a sala em uso no outro monitor (r.multiMonitor: ja | ligado | sem-opcao).
const TITULO_LS = 'PS5 · Lossless';
const multiMonitorOk = (r) => r?.multiMonitor === 'ja' || /^ligado/.test(r?.multiMonitor || '');
function avisoFocoLossless(r) {
  if (multiMonitorOk(r)) return 'Pode usar a sala no outro monitor: o Lossless segue escalando a janela do PS5.';
  if (r?.multiMonitor === 'sem-opcao') return 'Este Lossless não tem o modo de vários monitores (atualize o Lossless Scaling): deixe a janela do PS5 na frente, clicando em outra ele pausa.';
  return 'Deixe a janela do PS5 na frente: clicando em outra, o Lossless pausa. Para ele seguir com a sala em uso, atualize a extensão (chrome://extensions → recarregar a da Sala 3D: ajudante 1.25).';
}
let janelaLs = null;

function abrirJanelaPs5(trilha) {
  if (janelaLs && !janelaLs.closed) return janelaLs;
  const w = window.open('', 'sala3d-ps5-lossless', 'popup,width=1280,height=720');
  if (!w) return null;
  w.document.title = TITULO_LS;
  w.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;cursor:none';
  const v = w.document.createElement('video');
  v.muted = true; // o som já toca na sala
  v.autoplay = true;
  v.playsInline = true;
  // nada mais se mexe nesta janela: o Lossless conta os redesenhos dela (só a imagem do PS5, a 30)
  v.style.cssText = 'width:100vw;height:100vh;object-fit:contain;display:block;background:#000';
  v.srcObject = new MediaStream([trilha]);
  w.document.body.appendChild(v);
  v.play().catch(() => {});
  return w;
}

const MOTIVO_LS = {
  'obs-websocket': 'o OBS não deixou a sala comandar. No OBS: Ferramentas → Configurações do servidor WebSocket → marque “Ativar servidor WebSocket”.',
  'lossless-fechado': 'o Lossless Scaling está fechado. Abra o Lossless e tente de novo.',
  'sem-janela': 'o ajudante não achou a janela do PS5 (ela fechou antes da hora?).',
  'ajudante-ausente': 'o ajudante do Windows não respondeu (instale de novo pela extensão).',
  demorou: 'o ajudante demorou demais (o OBS pode estar abrindo: tente de novo).',
};

async function losslessParaTodos(ligar) {
  const key = ps5Nativo.key;
  const sh = key && self()?.shares.get(key);
  const scr = key && rtc?.screens.get(key);
  if (!sh || !scr) return void toast('Ponha o PS5 numa tela antes.', 'warn', 5000);
  if (ligar) {
    if (sh.lossless) return;
    if (versaoNum(controle.ext.versao) < versaoNum('1.24')) {
      return void toast('Para o Lossless para todos, atualize a extensão: chrome://extensions → recarregar a da Sala 3D (versão 1.24).', 'warn', 10000);
    }
    const trilha = scr.stream.getVideoTracks()[0];
    // a janela abre ainda no clique (depois de um await o navegador bloqueia)
    const w = abrirJanelaPs5(trilha);
    if (!w) return void toast('O navegador bloqueou a janela do PS5. Libere os pop-ups deste site e tente de novo.', 'warn', 8000);
    janelaLs = w;
    toast('Preparando: a janela do PS5 no outro monitor, o OBS e o Lossless…', 'info', 6000);
    const r = await controle.pedir('pc-obs-ps5', undefined, undefined, TITULO_LS, 60_000).catch(() => null);
    diagJogo.evento('Lossless para todos: ajudante', r || { erro: 'sem resposta' });
    if (!r?.ok) {
      const m = r?.msg || r?.erro;
      toast(`Lossless para todos não ligou: ${MOTIVO_LS[m] || m || 'sem resposta do ajudante'}`, 'warn', 12000);
      w.close();
      return;
    }
    let cam;
    try {
      cam = await rtc.camObs();
    } catch (err) {
      controle.pedir('pc-obs-ps5', undefined, undefined, '__parar__', 20_000).catch(() => {});
      w.close();
      return void toast(err?.message || String(err), 'warn', 9000);
    }
    const nova = cam.getVideoTracks()[0];
    // a imagem do OBS com o som do PS5 (é esse par que o turbo manda)
    sh.lossless = new MediaStream([nova, ...scr.stream.getAudioTracks()]);
    sh.losslessCam = cam;
    nova.addEventListener('ended', () => losslessParaTodos(false), { once: true });
    rtc.replaceScreenTrack(key, nova);
    turboEnvio.trocarFonte(key);
    mostrarNaMinhaTela(sh, new MediaStream([nova]));
    ps5Nativo.render?.();
    const semLs = r.lossless ? '' : ' O Lossless não ligou na janela: clique nela e aperte o atalho dele.';
    toast(`Lossless para todos ligado: a janela do PS5 está ${r.umMonitor ? 'na tela' : 'no outro monitor'} e todos recebem a imagem do OBS.${semLs} ${avisoFocoLossless(r)}`, semLs || !multiMonitorOk(r) ? 'warn' : 'success', 14000);
  } else {
    if (!sh.lossless) return;
    const cam = sh.losslessCam;
    sh.lossless = null;
    sh.losslessCam = null;
    const direta = scr.stream.getVideoTracks()[0];
    if (direta) rtc.replaceScreenTrack(key, direta);
    turboEnvio.trocarFonte(key);
    mostrarNaMinhaTela(sh, scr.stream);
    for (const t of cam?.getTracks() || []) t.stop();
    controle.pedir('pc-obs-ps5', undefined, undefined, '__parar__', 20_000).catch(() => {});
    if (janelaLs && !janelaLs.closed) janelaLs.close(); // o Lossless para junto com a janela
    janelaLs = null;
    ps5Nativo.render?.();
    diagJogo.evento('Lossless para todos: desligado');
    toast('De volta à imagem direta do PS5.', 'info', 5000);
  }
}

// a janela do PS5 fechada com o Lossless para todos ligado: volta para a imagem direta
setInterval(() => {
  if (!janelaLs?.closed) return;
  janelaLs = null;
  if (self()?.shares.get(ps5Nativo.key)?.lossless) {
    losslessParaTodos(false);
    toast('A janela do PS5 fechou: voltei para a imagem direta.', 'warn', 8000);
  }
}, 1000);

// a minha tela na sala (e o foco, se estiver nela) mostra esta imagem: com o Lossless para todos, a do
// OBS, que é o que todos recebem
function mostrarNaMinhaTela(sh, stream) {
  if (sh.video && sh.video.srcObject !== stream) {
    sh.video.srcObject = stream;
    sh.video.play().catch(() => {});
  }
  if (state.focus?.kind === 'share' && state.focus.key === sh.key) {
    const fv = $('#focus-video');
    fv.srcObject = stream;
    fv.play().catch(() => {});
  }
  refreshScreens();
}

// ------------------------------------------------------------------ som do PC junto com o PS5
// O Voz Universal (dublagem das legendas) fala pelo alto-falante do PC, fora da tela do PS5. Em vez de
// uma segunda tela só para o som, o som do sistema (o seletor do Chrome com "Tela inteira" e
// "Compartilhar áudio do sistema"; a imagem é largada) é misturado no som do PS5 e vai na mesma tela:
// pelo vídeo da conexão e pelo turbo. O áudio do sistema no Windows sai sem o próprio Chrome
// (restrictOwnAudio: "loopbackWithoutChrome"), então o PS5, que toca no Chrome, não vai em dobro e a voz
// dos amigos não volta para eles. Enquanto o PC fala, o PS5 abaixa na mistura (como o "abafar o jogo" do
// Voz Universal faz só neste PC).
const ABAFAR_PS5 = 0.3; // o volume do PS5 na mistura enquanto o PC fala
const LIMIAR_FALA = 0.015; // RMS do som do PC que conta como fala
let abafarPs5 = (() => {
  try { return localStorage.getItem('sala3d-ps5-abafar') !== '0'; } catch { return true; }
})();

async function somDoPcNoPs5(ligar) {
  const key = ps5Nativo.key;
  const sh = key && self()?.shares.get(key);
  const scr = key && rtc?.screens.get(key);
  if (!sh || !scr) return void toast('Ponha o PS5 numa tela antes.', 'warn', 5000);
  if (!ligar) return void desligarSomPc(sh, scr, true);
  if (sh.somPc) return;
  if (dublagem.ligado) return void toast('A dublagem já leva a voz do Voz Universal junto com o PS5 (não precisa do som do PC).', 'info', 7000);
  const ps5 = scr.stream.getAudioTracks()[0];
  if (!ps5 || ps5.readyState !== 'live') return void toast('O som do PS5 não está tocando nesta tela (este navegador não decodifica o som dele).', 'warn', 8000);
  // o AudioContext nasce ainda no clique (depois do seletor o navegador poderia abrir ele parado)
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx;
  try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 }); } catch { ctx = new AC({ latencyHint: 'interactive' }); }
  const pc = await rtc.somDoSistema();
  if (!pc) {
    ctx.close().catch(() => {});
    return void toast('Sem o som do PC: no seletor, escolha "Tela inteira" e marque "Compartilhar áudio do sistema".', 'warn', 10000);
  }
  // a tela saiu (ou já ligou por outro clique) enquanto o seletor estava aberto
  if (self()?.shares.get(key) !== sh || sh.somPc || ps5.readyState !== 'live') {
    pc.stop();
    ctx.close().catch(() => {});
    return;
  }
  misturarNoPs5(sh, scr, ps5, pc, ctx, 'pc');
  // parou pela faixa do Chrome ("Parar compartilhamento"): volta só o som do PS5
  pc.addEventListener('ended', () => {
    if (sh.somPc?.pc !== pc) return;
    desligarSomPc(sh, rtc.screens.get(key), true);
    toast('O som do PC parou: a tela do PS5 segue só com o som do PS5.', 'info', 6000);
  }, { once: true });
  const disp = pc.getSettings?.().deviceId || '';
  diagJogo.evento('PS5 direto: som do PC ligado', { dispositivo: disp, hz: ctx.sampleRate });
  // "loopback" sem o "WithoutChrome": o Chrome entra junto (o PS5 em dobro e a voz dos amigos de volta)
  if (/^loopback$/i.test(disp)) toast('O som do PC está indo, mas este Chrome não separou o som dele mesmo: o PS5 pode ir em dobro. Atualize o Chrome.', 'warn', 12000);
  else toast('O som do PC está indo junto com o PS5, na mesma tela. Deixe a tela do PS5 visível para o Voz Universal ler as legendas.', 'success', 9000);
}

// A mistura PS5 + outro som (origem 'pc': o som do sistema; 'voz': a voz da dublagem, voz-universal.js) no
// lugar do som do PS5 da tela: pelo vídeo da conexão e pelo turbo. O PS5 abaixa enquanto o outro som toca.
function misturarNoPs5(sh, scr, ps5, pc, ctx, origem) {
  const key = sh.key;
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  const gPs5 = ctx.createGain();
  const gPc = ctx.createGain();
  ctx.createMediaStreamSource(new MediaStream([ps5])).connect(gPs5).connect(dest);
  const fontePc = ctx.createMediaStreamSource(new MediaStream([pc]));
  fontePc.connect(gPc).connect(dest);
  // o PS5 abaixa enquanto o PC fala e volta devagar depois da fala
  const medidor = ctx.createAnalyser();
  medidor.fftSize = 1024;
  fontePc.connect(medidor);
  const amostras = new Float32Array(medidor.fftSize);
  let falouEm = -1e9;
  let alvoAtual = 1;
  const vigia = setInterval(() => {
    medidor.getFloatTimeDomainData(amostras);
    let soma = 0;
    for (const x of amostras) soma += x * x;
    const agora = performance.now();
    if (Math.sqrt(soma / amostras.length) > LIMIAR_FALA) falouEm = agora;
    const alvo = abafarPs5 && agora - falouEm < 400 ? ABAFAR_PS5 : 1;
    if (alvo === alvoAtual) return;
    alvoAtual = alvo;
    gPs5.gain.setTargetAtTime(alvo, ctx.currentTime, alvo < 1 ? 0.03 : 0.25);
  }, 40);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const mix = dest.stream.getAudioTracks()[0];
  sh.somPc = { ctx, mix, ps5, pc, vigia, gPs5, origem };
  // a mistura entra no lugar do som do PS5 na própria trilha da tela: quem entrar depois já recebe ela
  scr.stream.removeTrack(ps5);
  scr.stream.addTrack(mix);
  rtc.replaceScreenTrack(key, mix);
  if (sh.lossless) sh.lossless = new MediaStream([...sh.lossless.getVideoTracks(), mix]);
  turboEnvio.trocarFonte(key);
  ps5Nativo.render?.();
}

// ------------------------------------------------------------------ dublagem (Voz Universal)
// Ligada no painel do PS5 direto, fica lembrada: toda vez que o PS5 entra numa tela, ela liga sozinha.
// Quem aluga o PS5 escolhe se quer a dublagem (lan.html, "Quero o modo dublado"): desmarcada, a vez vem com
// semDublagem e o som que vai para essa pessoa é o do PS5 sozinho, pelo turbo e pelo vídeo normal. Os outros
// (e este PC) continuam com a voz.
function semDublagemPara(id, sh) {
  if (!state.lan || !sh || maquinaDaTela(sh) !== 'ps5') return false;
  const v = state.lan.ps5;
  return !!v?.semDublagem && (v.ids || []).includes(id);
}
// a escolha de quem tem a vez mudou (alugou, acabou a vez, entrou de novo): o som de cada um é refeito
let semDublagemAntes = '';
function conferirSomSemDublagem() {
  const v = state.lan?.ps5;
  const chave = v?.semDublagem ? (v.ids || []).join(',') : '';
  if (chave === semDublagemAntes) return;
  semDublagemAntes = chave;
  for (const sh of self()?.shares.values() || []) {
    if (sh.somPc?.origem !== 'voz' || maquinaDaTela(sh) !== 'ps5') continue;
    rtc?.atualizarSomDaTela(sh.key);
    turboEnvio.trocarFonte(sh.key);
    if (chave) diagJogo.evento('lan: quem alugou não quer a dublagem — só o som do jogo para essa pessoa', { conta: v.conta });
  }
}
const DUBLAGEM = 'sala3d-ps5-dublagem';
let querDublagem = (() => {
  try { return localStorage.getItem(DUBLAGEM) === '1'; } catch { return false; }
})();
let abafoVoz = 1; // o PS5 neste PC enquanto a voz da dublagem fala (0..1)
const dublagem = new Dublagem({
  // extensão de antes da 1.27 não conhece o pedido (ficaria 100 s esperando): já pede a atualização
  pedirVoz: () => (controle.ext.ok && versaoNum(controle.ext.versao) < versaoNum('1.27')
    ? Promise.resolve({ ok: false, erro: 'demorou' })
    : controle.pedir('voz-universal', undefined, undefined, undefined, 105_000)),
  // a voz vai na mistura com o PS5 para quem joga (no lugar do "Levar o som do PC")
  aoTrilha: (trilha) => {
    const key = ps5Nativo.key;
    const sh = key && self()?.shares.get(key);
    const scr = key && rtc?.screens.get(key);
    if (!sh || !scr) return;
    if (!trilha) {
      if (sh.somPc?.origem === 'voz') desligarSomPc(sh, scr, true);
      return;
    }
    if (sh.somPc) desligarSomPc(sh, scr);
    const ps5 = sh.ps5?.trilhaSom || scr.stream.getAudioTracks()[0];
    if (!ps5 || ps5.readyState !== 'live') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 }); } catch { ctx = new AC({ latencyHint: 'interactive' }); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    misturarNoPs5(sh, scr, ps5, trilha, ctx, 'voz');
  },
  // neste PC a voz sai pelo alto-falante (o Voz Universal toca): o PS5 daqui abaixa enquanto ela fala
  abafarAqui: (nivel) => {
    abafoVoz = nivel;
    for (const sh of self()?.shares.values() || []) if (sh.ps5 && sh.escuta) sh.escuta.volume = (volumePs5 / 100) * abafoVoz;
  },
  aoMudar: () => ps5Nativo.render?.(),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
});

function ligarDublagem() {
  const fonte = ps5Nativo.key ? ps5Nativo.fonte : null;
  if (fonte) dublagem.ligar(fonte);
}

function alternarDublagem() {
  querDublagem = !dublagem.ligado;
  try { localStorage.setItem(DUBLAGEM, querDublagem ? '1' : '0'); } catch { /* sem armazenamento */ }
  if (!querDublagem) return void dublagem.desligar();
  if (!ps5Nativo.key) return void toast('Ponha o PS5 numa tela antes: a dublagem liga junto toda vez.', 'info', 6000);
  ligarDublagem();
}

// tira a mistura e devolve o som do PS5 à tela (aviso: atualiza o painel)
function desligarSomPc(sh, scr, aviso = false) {
  const m = sh?.somPc;
  if (!m) return;
  sh.somPc = null;
  clearInterval(m.vigia);
  const vivo = m.ps5.readyState === 'live';
  if (scr) {
    scr.stream.removeTrack(m.mix);
    if (vivo) {
      scr.stream.addTrack(m.ps5);
      rtc.replaceScreenTrack(sh.key, m.ps5);
    }
  }
  if (sh.lossless) sh.lossless = new MediaStream([...sh.lossless.getVideoTracks(), ...(vivo ? [m.ps5] : [])]);
  turboEnvio.trocarFonte(sh.key);
  m.pc.stop();
  m.mix.stop();
  m.ctx.close().catch(() => {});
  diagJogo.evento('PS5 direto: som do PC desligado');
  if (aviso) ps5Nativo.render?.();
}

// ------------------------------------------------------------------ Lossless Scaling
// O Lossless gera os quadros no PC de quem joga, em cima da sala em tela cheia: sem OBS, sem codificar
// de novo e sem o teto de 60 do turbo. O ajudante (1.17+) aperta o atalho dele (o do Settings.xml do
// Lossless). Testado em 2026-11-16 com o Lossless deste PC: o atalho pelo SendInput liga a escala no
// Chrome em tela cheia, até com o teclado travado do modo jogo (página a 30 qps → "30 / 60" no
// contador). O Lossless conta as vezes que a JANELA se redesenha: qualquer animação por cima da
// imagem (no teste, a moldura de depuração da extensão) sobe a base para a taxa do monitor e ele não
// gera nada — no modo jogo só a imagem do jogo se mexe.
let losslessLigado = false;
async function alternarLossless() {
  if (isTouch) return;
  const novo = versaoNum(controle.ext.versao) >= versaoNum('1.23');
  const r = novo ? await controle.pedir('pc-lossless', undefined, undefined, undefined, 10_000).catch(() => null) : null;
  diagJogo.evento('Lossless: atalho', r || { semAjudante: true });
  if (r?.ok) {
    losslessLigado = !losslessLigado;
    if (!losslessLigado) return void toast('Lossless desligado.', 'info', 4000);
    const mult = Number(r.multiplicador) || 2;
    if (r.geracao && r.geracao !== 'OFF') opcoesJogo.set('lossless', r.modo === 'ADAPTIVE' ? 0 : mult);
    // adaptativo com alvo até 60: com a imagem a 60 ele já está no alvo e não gera nada
    const aviso = r.modo === 'ADAPTIVE' && Number(r.alvo) <= 60
      ? ` Atenção: o Lossless está no modo Adaptativo com alvo ${r.alvo}; com o PS5 a 60 ele não gera nada. No Lossless, ponha Fixo ×2 (ou alvo 120/144).`
      : '';
    const mm = /^ligado/.test(r.multiMonitor || '') ? ' Liguei o modo de vários monitores do Lossless: ele segue escalando mesmo com o foco em outra janela.' : '';
    toast(`Lossless ligado (${r.atalho}).${aviso}${mm} O contador dele mostra base / gerados; ${r.atalho} desliga.`, aviso ? 'warn' : 'success', aviso ? 15000 : 8000);
  } else if (r?.msg === 'fechado') {
    toast('O Lossless Scaling está fechado. Abra o Lossless e tente de novo.', 'warn', 8000);
  } else {
    // sem o ajudante 1.17 (ou a extensão 1.23): a pessoa aperta o atalho (funciona no modo jogo)
    toast(`Aperte o atalho do Lossless (Ctrl+Alt+S).${novo ? '' : ' Para a sala apertar sozinha, atualize a extensão (chrome://extensions → recarregar).'}`, 'info', 8000);
  }
}

// o botão do painel do PS5: foco na tela do PS5, modo jogo em tela cheia e o Lossless
async function jogarComLossless(key) {
  if (!key || !acharTela(key)) return void toast('Ponha o PS5 numa tela antes.', 'warn', 5000);
  // semDualSense: aqui o DualSense é pedido no clique do Modo jogo logo abaixo (antes da tela cheia)
  if (state.focus?.kind !== 'share' || state.focus.key !== key) enterFocus({ kind: 'share', key, semDualSense: true });
  updateFocusCtrl();
  if (controle.jogoNo !== $('#focus-video')) $('#focus-jogo').click(); // ainda no clique: a tela cheia é aceita
  // o Lossless pega a janela da frente: espera a tela cheia assentar
  await new Promise((ok) => setTimeout(ok, 900));
  if (!losslessLigado) alternarLossless();
}


// qps de uma contagem que só sobe (quadros do PS5, quadros de uma trilha), entre uma leitura e outra
function medidorQps() {
  let antes = null;
  return (n) => {
    if (n == null) {
      antes = null;
      return null;
    }
    const t = performance.now();
    const q = antes && n >= antes.n && t > antes.t ? ((n - antes.n) * 1000) / (t - antes.t) : null;
    antes = { n, t };
    return q;
  };
}
const medePs5Manda = medidorQps();
const medePs5Tela = medidorQps();
// o desempenho do PS5 direto deste PC, em qps (a última medida, a cada 1 s)
let ps5Agora = { manda: null, tela: null, lossless: null, danos: 0 };
let ps5DanosAntes = 0;
setInterval(() => {
  const st = ps5Nativo.key ? ps5Nativo.fonte?.stats?.() : null;
  const sh = ps5Nativo.key && self()?.shares.get(ps5Nativo.key);
  // quadros perdidos entre o PS5 e este PC nos últimos 3 s (a amostra de quem joga é de 2 s e chega depois)
  const danosAgora = ps5Nativo.danos || 0;
  ps5Nativo.danos = 0;
  const danos = [ps5DanosAntes, ps5Agora.danos1 || 0, danosAgora];
  ps5DanosAntes = ps5Agora.danos1 || 0;
  ps5Agora = {
    manda: medePs5Manda(st ? st.quadros : null),
    tela: medePs5Tela(st ? st.desenhados : null),
    lossless: null,
    danos: danos[0] + danos[1] + danos[2],
    danos1: danosAgora,
  };
  // o selo na própria tela do PS5 (modo jogo neste PC): o que o PS5 manda e o que aparece aqui
  const j = controle.jogo;
  const el = $('#jogo-selo');
  if (!sh?.ps5 || j?.key !== ps5Nativo.key) {
    if (!jogandoLa) el.hidden = true; // o selo de quem joga longe (mostrarSelo) não é deste
    return;
  }
  el.hidden = !opcoesJogo.get('selo');
  if (el.hidden) return;
  const m = ps5Agora;
  const q = (v) => (v != null ? Math.round(v) : '–');
  const lsx = Number(opcoesJogo.get('lossless')) || 0;
  el.innerHTML = `<b>PS5 direto</b> · PS5 manda ${q(m.manda)} qps · na tela <span class="${m.tela != null && m.tela < 50 ? 'ruim' : ''}">${q(m.tela)} qps</span>`
    + (lsx && m.tela != null ? ` · com o Lossless ×${lsx} ≈ ${Math.round(m.tela * lsx)} qps` : '');
}, 1000);

controle.onPs5 = (sh, ev, meu) => {
  if (ev?.t === 'pad') ps5Nativo.pad(ev, meu); // meu: o botão PS de quem hospeda passa pela trava
  else if (ev?.t === 'vivo') ps5Nativo.vivo();
};

// a imagem do PS5 numa tela da sala, com o controle já liberado (é para jogar) e o som tocando aqui
async function compartilharPs5(fonte) {
  if (!state.joined) {
    toast('Entre na sala antes de pôr o PS5 numa tela.', 'warn', 5000);
    return null;
  }
  if (!cabeMaisUma()) {
    toast('Todas as telas e o telão estão ocupados. Pare uma delas para pôr o PS5.', 'warn', 6000);
    return null;
  }
  const volta = voltandoDireta.ps5;
  const auto = ps5SemPerguntar || ps5Nativo.retomada;
  if (auto) await semCompartilharAgora();
  if (shareBusy) return null;
  shareBusy = true;
  let key;
  try {
    // ligado pela lan house, ou a sessão que voltou depois de a página recarregar (ninguém na frente
    // deste PC): não pergunta a tela
    const tela = volta ? volta.slot ?? undefined : auto ? undefined : await escolherTela();
    if (tela === null) return null;
    key = await publishShare(fonte.stream, { tela, superficie: 'ps5', reconexao: !!volta });
  } finally {
    shareBusy = false;
  }
  const sh = key && self()?.shares.get(key);
  if (!sh) return null;
  Object.assign(sh, { ps5: fonte, titulo: 'PS5', superficie: 'ps5' });
  diretas.quer('ps5', { slot: sh.slot, lan: !!volta?.lan, controle: volta?.controle ?? true });
  segurarDiretas();
  // o nome "PS5" põe o celular de quem joga nos botões do PS5 (toque-jogo.js)
  socket.emit('share-info', { key, site: null, titulo: 'PS5' });
  if (volta?.controle !== false) socket.emit('controle-permitir', { key, on: true });
  // o som do PS5 sai aqui também (antes era a janela do chiaki-ng que tocava)
  if (fonte.stream.getAudioTracks().length) {
    sh.escuta = new Audio();
    sh.escuta.srcObject = new MediaStream(fonte.stream.getAudioTracks());
    sh.escuta.volume = volumePs5 / 100;
    sh.escuta.play().catch(() => {});
  }
  // a dublagem ligada da outra vez: liga junto (depois de o painel guardar a tela do PS5)
  if (querDublagem) setTimeout(ligarDublagem, 300);
  renderPeople();
  renderSharePop();
  toast(`O PS5 está no ${ondeEsta(sh) === 'Telão' ? 'telão' : ondeEsta(sh)}, com o controle liberado. Quem abrir a tela e ligar o modo jogo joga nele.`, 'success', 7000);
  return key;
}

// O volume do som do PS5 neste PC (o sh.escuta das telas de PS5), de 0 a 100: na janela PS5 direto e
// no menu Opções do modo jogo. Só muda o que se ouve aqui; quem joga ouve no volume das telas dele.
let volumePs5 = (() => {
  try {
    const v = Number(localStorage.getItem('sala3d-ps5-volume'));
    return localStorage.getItem('sala3d-ps5-volume') != null && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100;
  } catch {
    return 100;
  }
})();
function mudarVolumePs5(v) {
  volumePs5 = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
  try { localStorage.setItem('sala3d-ps5-volume', String(volumePs5)); } catch { /* sem armazenamento */ }
  for (const sh of self()?.shares.values() || []) if (sh.ps5 && sh.escuta) sh.escuta.volume = (volumePs5 / 100) * abafoVoz;
  const el = $('#jogo-ps5-vol');
  if (el && Number(el.value) !== volumePs5) el.value = String(volumePs5);
  const saida = $('#jogo-ps5-vol-n');
  if (saida) saida.textContent = `${volumePs5}%`;
}

const turboRecebe = new TurboRecebe({
  abrir: (id, vida) => rtc?.abrirTurbo(id, vida),
  abrirSom: (id) => rtc?.abrirTurboSom(id, modoTv()), // o Turbo da TV: canais sem prazo, como no /jogar
  // o som da tela toca no vídeo dela no #media-sink (o #focus-video, da imagem, é mudo)
  somDaTela: (key) => shareVideo(acharTela(key)?.share),
  // o volume vem dos Ajustes, não do <video>: no iPhone o volume dele fica sempre em 1
  volume: () => settings.screen / 100,
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  onFalhou: (motivo) => {
    diagJogo.evento('modo turbo falhou: vídeo normal de volta', { motivo });
    if (turboRecebe.ultimaFalha) diagJogo.evento('turbo: como estava ao desistir', turboRecebe.ultimaFalha);
    turboVolta.falhou(motivo); // sem aviso na tela: o vídeo normal entra sozinho e o relatório guarda o motivo
  },
});
turboRecebe.liso = opcoesJogo.get('turboLiso');
turboRecebe.socorro = true;
const modoTv = () => !!presetAtual()?.semRealce;
function ligarTurbo() {
  if (!jogandoLa || entrando === jogandoLa) return; // no meio do teste da conexão: entrarNoTurbo liga no fim
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  const p = presetAtual();
  // o Turbo da TV na sala: a receita do /jogar (canal sem prazo, só H.264, sem realce, o soluço fora da folga)
  const tv = modoTv();
  vidaPedida = tv ? null : p?.vida ?? TTL_MS;
  turboRecebe.vidaMs = vidaDoCanal(vidaPedida, rttDoDono?.dono === jogandoLa.key.split('~')[0] ? rttDoDono.ms : null);
  turboRecebe.soH264 = tv;
  turboRecebe.lisoSoluco = tv;
  turboVolta.ligou();
  turboRecebe.h265 = !!p?.h265;
  turboRecebe.lisoPct = p?.lisoPct ?? LISO_PCT;
  turboRecebe.lisoMax = p?.lisoMax ?? LISO_MAX; // Turbo rápido: a folga do liso até 15 ms (e não 45)
  turboRecebe.realce = !tv && !!opcoesJogo.get('nitidez');
  turboRecebe.tratamento = !tv && !!opcoesJogo.get('tratamento');
  turboRecebe.ligar(jogandoLa.key, jogandoLa.video, opcoesJogo.get('rapido') ? 720 : 1080);
  diagJogo.evento('modo turbo ligado', { nitidez: turboRecebe.realce, tratamento: turboRecebe.tratamento, liso: opcoesJogo.get('turboLiso'), vidaMs: turboRecebe.vidaMs, h265: turboRecebe.h265, lisoPct: turboRecebe.lisoPct, lisoMaxMs: turboRecebe.lisoMax });
}

// ---------------------------------------------------------------- modos de imagem (jogo-opcoes.js)
const MODOS_IMAGEM = [...PRESETS, PRESET_TV]; // o Turbo da TV não tem cartão na sala: só o automático o usa
const presetAtual = () => MODOS_IMAGEM.find((p) => p.id === opcoesJogo.get('preset')) || null;
let aplicandoPreset = false;

// Troca tudo de uma vez para o preset n (ou 0, manual: fica como está) e, no modo jogo, religa o que
// precisa: buffer, 720p/1080p de quem compartilha, turbo (a vida do canal só vale ao abrir).
function aplicarPreset(n, porque = 'escolhido') {
  const p = MODOS_IMAGEM.find((x) => x.id === n) || null;
  const antes = presetAtual();
  aplicandoPreset = true;
  try {
    opcoesJogo.setVarios({ preset: p ? p.id : 0, ...(p ? p.opcoes : {}) });
  } finally {
    aplicandoPreset = false;
  }
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  if (!jogandoLa || !p) return;
  diagJogo.evento(`preset ${p.id}: ${p.nome} (${porque})`, { ...p.opcoes, vidaMs: p.vida, h265: !!p.h265, lisoPct: p.lisoPct ?? null });
  // só a folga do liso muda (Turbo liso ↔ Turbo rápido): vale já, sem a imagem recomeçar
  if (turboRecebe.ligado && soAFolgaMuda(antes, p) && turboRecebe.mudarLiso(p.lisoPct ?? LISO_PCT, p.lisoMax ?? LISO_MAX)) return;
  aplicarBuffer();
  avisarRapido();
  if (p.opcoes.turbo) ligarTurbo();
  else {
    turboVolta.parar();
    turboRecebe.desligar();
  }
}
const soAFolgaMuda = (a, b) => !!a && !!b && !a.semRealce && !b.semRealce && a.vida === b.vida && OPCOES_DO_PRESET.every((k) => a.opcoes[k] === b.opcoes[k]);

// ---------------------------------------------------------------- automático e volta do turbo (turbo-auto.js)
let rttDoDono = null; // { dono, ms }: a ida e volta da última amostra, para a vida do canal (vidaDoCanal)
const nomeDoModo = (id) => MODOS_IMAGEM.find((p) => p.id === id)?.nome || 'modo atual';
function mostrarAuto() {
  Object.assign(autoMostra, { ligado: turboAuto.ligado, texto: turboAuto.fase === 'fixo' ? `agora: ${nomeDoModo(turboAuto.escolhido)}` : turboAuto.fase ? 'medindo a sua conexão…' : 'escolhe o melhor para você' });
  marcarPresets(document);
}
const turboAuto = new TurboAuto({
  modos: ORDEM_AUTO.sala,
  aplicar: (id, porque) => aplicarPreset(id, porque),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  onEstado: () => mostrarAuto(),
  onDecidiu: (id) => {
    const quem = jogandoLa && (acharTela(jogandoLa.key)?.user?.name || jogandoLa.key.split('~')[0]);
    if (quem && memoriaTeste.trocarModo(quem, id)) diagJogo.evento('teste da conexão: a próxima entrada começa no modo do automático', { modo: id });
  },
});
const turboVolta = new TurboVolta({
  ligar: () => {
    turboRecebe.depoisDaFalha = { kbps: turboRecebe.ultimaFalha?.bandaKbps || 3000 };
    ligarTurbo();
  },
  pode: () => !!jogandoLa && !!opcoesJogo.get('turbo') && !turboRecebe.ligado && !(rttDoDono?.ms > 250),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
});
// a cada amostra (2 s): a ida e volta de agora e o automático
function amostraDoAuto(resumo) {
  if (!jogandoLa || !resumo) return;
  if (resumo.rttMs != null) {
    const dono = jogandoLa.key.split('~')[0];
    rttDoDono = { dono, ms: resumo.rttMs };
    // ligou sem saber a ida e volta, e ela é longa: o canal com a vida curta perde o que precisa ir de novo
    const vida = vidaDoCanal(vidaPedida, resumo.rttMs);
    if (turboRecebe.ligado && !vidaAjustada && vida != null && vida > turboRecebe.vidaMs * 1.5 && resumo.rttMs > 120) {
      vidaAjustada = true;
      diagJogo.evento('turbo: canal com mais tempo para quem está longe', { rttMs: resumo.rttMs, vidaMs: vida });
      ligarTurbo();
    }
  }
  // o turbo que voltou já dura: o próximo ligar não precisa mais começar por baixo
  if (turboRecebe.depoisDaFalha && turboRecebe.ligado && performance.now() - turboVolta.ligouEm > 60_000) turboRecebe.depoisDaFalha = null;
  turboAuto.amostra(resumo, document.hidden);
  verCaminho(resumo);
  conferirPrevisto(resumo);
}
// O navegador trocou de caminho sozinho (2026-11-25: de 8 para 50 ms, duas vezes): guarda os caminhos que havia e, se o
// novo é bem mais lento, procura outro uma vez por jogo.
const vigiaCaminho = { par: null, rtt: [], procurou: false };
function verCaminho(resumo) {
  const par = resumo.conexao?.par;
  const rtt = resumo.rttMs;
  if (!par || rtt == null) return;
  const v = vigiaCaminho;
  if (v.par && v.par !== par) {
    const antes = v.rtt.length ? [...v.rtt].sort((a, b) => a - b)[v.rtt.length >> 1] : null;
    const dono = jogandoLa.key.split('~')[0];
    v.troca = { antes, desde: performance.now() };
    Promise.resolve(rtc?.caminhosDe(dono)).then((caminhos) => diagJogo.evento('os caminhos na hora da troca', { antesMs: antes, caminhos })).catch(() => {});
    v.rtt = [];
  }
  v.par = par;
  v.rtt.push(rtt);
  if (v.rtt.length > 10) v.rtt.shift();
  if (!v.troca || v.procurou || v.troca.antes == null || v.rtt.length < 4) return;
  const agora = [...v.rtt].sort((a, b) => a - b)[v.rtt.length >> 1];
  if (agora > v.troca.antes * 2.5 && agora > v.troca.antes + 25) {
    v.procurou = true;
    diagJogo.evento('o caminho novo é bem mais lento: procurando outro', { antesMs: v.troca.antes, agoraMs: agora });
    rtc?.procurarCaminho(jogandoLa.key.split('~')[0]);
  }
  v.troca = null;
}
// ---------------------------------------------------------------- o teste da conexão antes do turbo (turbo-teste.js)
const memoriaTeste = new MemoriaTeste();
const painelTeste = new PainelTeste({ dentro: () => $('#focus'), onPular: () => { if (jogandoLa) memoriaTeste.marcarPulado(acharTela(jogandoLa.key)?.user?.name || jogandoLa.key.split('~')[0]); testeJoga.pular(); }, onEvento: (texto, dados) => diagJogo.evento(texto, dados) });
const testeJoga = new TesteJoga({
  abrir: (id) => rtc?.abrirTeste(id) ?? null,
  caminho: (id) => rtc?.caminhoPara(id) ?? null,
  caminhos: (id) => rtc?.caminhosDe(id) ?? null,
  sonda: (sinal) => rtc?.sondaTurn(sinal) ?? null,
  onProgresso: (p) => painelTeste.progresso(p),
  onVivo: (v) => painelTeste.vivo(v),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
});
let codecsDoTeste = null;
// passa a conexão com o dono da tela para o TURN ou de volta (rtc.usarCaminho): a tela em foco espera a imagem nova
function mudarRota(key, quer) {
  const antes = trocandoRota;
  trocandoRota = { key, ate: performance.now() + 12_000 };
  if (!rtc?.usarCaminho(key.split('~')[0], quer)) {
    trocandoRota = antes;
    return false;
  }
  setTimeout(refreshScreens, 12_500); // não voltou: sai do foco como sempre
  return true;
}
// espera (até 10 s) a conexão estar pelo TURN (ou direto)
async function esperarRota(dono, turn) {
  for (let i = 0; i < 40; i++) {
    const c = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null);
    if (c && c.relay === turn) return true;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  return false;
}
// Testa (ou usa o teste de há pouco, com a conexão parecida) e prepara o turbo. Devolve o resultado ou null.
async function testarConexao(deNovo) {
  const jl = jogandoLa;
  const dono = jl.key.split('~')[0];
  const rede = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null);
  if (jogandoLa !== jl) return null;
  const quem = acharTela(jl.key)?.user?.name || dono; // o PC do jogo pelo nome: o id muda a cada entrada
  // uma vez por dia (como no /jogar): o de hoje vale mesmo com a ida e volta diferente; pulado hoje, entra sem testar
  let r = deNovo ? null : memoriaTeste.valido(quem, rede) || memoriaTeste.doDia(quem);
  if (!r && !deNovo && memoriaTeste.pulouHoje(quem)) {
    diagJogo.evento('teste da conexão: pulado hoje, entrando sem testar');
    return null;
  }
  let rede0 = null;
  if (r) diagJogo.evento('teste da conexão: vale o de hoje', { tetoKbps: r.tetoKbps, codec: r.codec, modo: r.modo });
  else {
    codecsDoTeste ??= await codecsDaqui(['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'], ['hvc1.1.6.L123.B0']);
    if (jogandoLa !== jl) return null;
    if (!deNovo && memoriaTeste.porque) diagJogo.evento('teste da conexão: o de há pouco não vale mais', { porque: memoriaTeste.porque });
    // testar de novo com o TURN escolhido antes: primeiro volta ao direto, para comparar os dois
    if (mudarRota(jl.key, 'auto')) await esperarRota(dono, false);
    if (jogandoLa !== jl) return null;
    painelTeste.mostrar();
    rede0 = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null); // o teste vale para este caminho direto
    r = await testeJoga.rodar(jl.key, { codecs: codecsDoTeste, padrao: 14, rapido: 16, tudo: deNovo, toque: isTouch });
    painelTeste.fechar();
    if (r.tetoParcialKbps) memoriaTeste.guardarParcial(quem, r.tetoParcialKbps);
    if (jogandoLa !== jl || r.erro) return null;
    memoriaTeste.guardar(quem, r, rede0 || await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null));
    if (jogandoLa !== jl) return null;
    painelTeste.resultado(r, MODOS_IMAGEM.find((p) => p.id === r.modo)?.nome || 'Turbo');
  }
  if (r.trocarRota && mudarRota(jl.key, 'turn')) {
    const foi = await esperarRota(dono, true);
    diagJogo.evento('teste da conexão: passando para o TURN', { foi });
    if (jogandoLa === jl) aplicarBuffer();
    if (!foi && jogandoLa === jl) mudarRota(jl.key, 'auto'); // não ligou: volta a valer qualquer caminho
    if (jogandoLa !== jl) return null;
  }
  autoMostra.teste = textoDoResultado(r);
  marcarPresets(document);
  return r;
}
// O teste previu o atraso e as travadas: um minuto depois, o relatório guarda o que deu de verdade (para ajustar o teste)
let previsto = null;
function conferirPrevisto(resumo) {
  const p = previsto;
  if (!p || !turboRecebe.ligado || document.hidden) return;
  const passou = performance.now() - p.desde;
  if (passou < 8000) return;
  // travadas da fonte (o PS5 perdendo imagem até o PC de lá, inclusive a que aparece na amostra seguinte) não são da conexão
  const fonte = foraDoModo(resumo) === 'fonte' || (p.fonteAntes && resumo.ritmo?.travadas?.length > 0);
  p.fonteAntes = foraDoModo(resumo) === 'fonte';
  if (fonte) p.daFonte = (p.daFonte || 0) + (resumo.ritmo?.travadas?.length || 0);
  p.am.push({ atraso: resumo.atrasoMs, qps: resumo.fpsFinal, travadas: fonte ? 0 : resumo.ritmo?.travadas?.length || 0, tremido: resumo.turbo?.viagemP90 != null ? resumo.turbo.viagemP90 - resumo.turbo.viagemMs : null });
  if (passou < 68_000) return;
  previsto = null;
  const med = (k) => { const v = p.am.map((a) => a[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? Math.round(v[v.length >> 1] * 10) / 10 : null; };
  const realMin = Math.round((p.am.reduce((n, a) => n + a.travadas, 0) / (p.am.length / 30)) * 10) / 10;
  // bem pior que o previsto: na próxima entrada testa de novo
  // bem pior que o previsto: só anota (o teste não volta sozinho no mesmo dia; "Testar de novo" nas Opções roda)
  if (realMin > Math.max(10, (p.travadasMin || 0) * 3)) diagJogo.evento('teste da conexão: o jogo saiu pior que o previsto', { travadasMin: realMin });
  diagJogo.evento('teste da conexão: previsto x real', { previsto: { atrasoMs: p.atrasoMs, travadasMin: p.travadasMin }, real: { atrasoMs: med('atraso'), qps: med('qps'), tremidoMs: med('tremido'), travadasMin: realMin, travadasDaFonte: p.daFonte || 0 } });
}
// Entrar no turbo: com o Automático, primeiro o teste; sem ele (versão antiga lá, pulado, sem conexão), direto
let entrando = false;
async function entrarNoTurbo(deNovo = false) {
  const jl = jogandoLa;
  if (!jl || entrando === jl) return;
  entrando = jl;
  let r = null;
  try {
    turboRecebe.teste = null;
    if (turboAuto.ligado || deNovo) {
      turboVolta.parar();
      turboAuto.parar();
      turboRecebe.desligar();
      r = await testarConexao(deNovo);
    }
  } catch (err) {
    console.warn('[teste]', err);
  } finally {
    if (entrando === jl) entrando = false;
  }
  if (jogandoLa !== jl || !opcoesJogo.get('turbo')) return;
  if (r) turboRecebe.teste = { tratar: !!r.tratar, tetoKbps: r.livre && r.rota !== 'turn' ? null : r.tetoKbps, codec: r.codec, turn: r.rota === 'turn', bom: !!r.confirmou };
  else {
    // sem teste (pulado): o que um teste pulado de hoje chegou a medir já diz quanto o caminho leva
    const parcial = memoriaTeste.parcial(acharTela(jl.key)?.user?.name || jl.key.split('~')[0]);
    if (parcial) {
      turboRecebe.teste = { tetoKbps: parcial };
      diagJogo.evento('turbo: começando no que o teste pulado mediu', { tetoKbps: parcial });
    }
  }
  previsto = r?.previsto ? { ...r.previsto, desde: performance.now(), am: [], quem: acharTela(jl.key)?.user?.name || jl.key.split('~')[0] } : null;
  if (r && turboAuto.ligado && opcoesJogo.get('preset') !== r.modo) aplicarPreset(r.modo, 'teste da conexão');
  if (!turboRecebe.ligado) ligarTurbo();
  if (!turboAuto.ligado) return;
  if (r) turboAuto.comecarCom(r.modo);
  else turboAuto.comecar();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-testar]');
  if (!el) return;
  el.blur();
  if (jogandoLa && opcoesJogo.get('turbo')) entrarNoTurbo(true);
  else toast('O teste roda com o Modo jogo ligado (e o modo turbo).', 'info', 4000);
});

let vidaPedida = TTL_MS;
let vidaAjustada = false;
function autoDesligado() { // escolheu à mão
  if (!turboAuto.ligado) return;
  turboAuto.desligar();
  mostrarAuto();
}


// o seletor de modo de imagem (no menu do PC e no painel do celular) mostra o de agora
function sincronizarPresets() {
  marcarPresets(document);
}
$('#jogo-op-pop').insertAdjacentHTML('afterbegin', htmlPresets());
// Modo pela conexão (enquanto a pessoa não escolher um à mão): direta → 1080p Turbo liso; pelo TURN
// (o servidor no meio, de um dos lados) → 1080p, o vídeo normal. Teste de 2026-11-16 21:55 (Emilly,
// iPhone, PC pelo TURN): o turbo deu 35 qps e ~25 travadas por minuto (a fila do canal parava mais que
// a espera de 150 ms e a imagem do PS5 esperava o quadro-chave); o 1080p, 55 qps e ~4.
// Duas amostras seguidas com o mesmo caminho antes de trocar (a conexão se acertando no começo).
// Só no celular: no PC, teste de 2026-11-17 02:07–02:11 (kazu, PC pelo TURN do lado de cá, God of
// War no PS5 direto) o 1080p normal deixou o buffer do vídeo subir até 300 ms (atraso de 250–470 ms,
// "mouse com muito delay"), e o turbo no mesmo caminho ficou em ~106 ms a 57 qps.
const PRESET_DIRETO = 14;
const PRESET_TURN = isTouch ? 12 : 14;
const presetRede = { auto: true, turn: null, seguidas: 0, avisado: false };
function presetPelaRede(rede) {
  if (!presetRede.auto || !jogandoLa || !rede?.local) return;
  if (turboRecebe.teste?.turn && turboRecebe.teste.bom) return; // o teste da conexão mediu o turbo pelo TURN: serve
  const turn = /^relay/.test(rede.local) || /^relay/.test(rede.remoto || '');
  presetRede.seguidas = turn === presetRede.turn ? presetRede.seguidas + 1 : 1;
  presetRede.turn = turn;
  // com o automático, aqui só se decide o que é do TURN no celular (e a volta dele): o resto é o automático
  const quero = turn ? PRESET_TURN : turboAuto.ligado ? (opcoesJogo.get('preset') === PRESET_TURN && PRESET_TURN !== PRESET_DIRETO ? turboAuto.inicial : opcoesJogo.get('preset')) : PRESET_DIRETO;
  if (presetRede.seguidas < 2 || opcoesJogo.get('preset') === quero) return;
  if (turn && PRESET_TURN === PRESET_DIRETO && turboAuto.ligado) return;
  if (turn) turboAuto.parar();
  aplicarPreset(quero, turn ? 'automático: conexão pelo TURN' : 'automático: conexão direta');
  if (!turn && turboAuto.ligado) turboAuto.comecar();
  if (turn && !presetRede.avisado) {
    presetRede.avisado = true;
    toast('A conexão passa por um servidor no meio: modo 1080p (mais estável que o turbo nesse caminho).', 'info', 6000);
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-preset]');
  if (!el) return;
  if (el.dataset.preset === 'auto') {
    presetRede.auto = true;
    if (!turboAuto.ligado) {
      const primeiro = turboAuto.modos[0];
      if (opcoesJogo.get('preset') !== primeiro) aplicarPreset(primeiro, 'automático');
      turboAuto.ligar(!!jogandoLa);
    }
    mostrarAuto();
    el.blur();
    return;
  }
  presetRede.auto = false; // escolheu à mão: a conexão não troca mais o modo (até recarregar)
  autoDesligado();
  const n = Number(el.dataset.preset) || 0;
  if (n !== (opcoesJogo.get('preset') || 0)) aplicarPreset(n);
  else sincronizarPresets();
  el.blur();
});
mostrarAuto();

// Quem joga sentiu um engasgo: F9 no PC, botão "Engasgou" no celular e no PC. Marca a hora no relatório,
// com os últimos 3 s do turbo quadro a quadro (a caixa-preta), para cruzar o que se sentiu com os números.
function marcarEngasgo() {
  if (!jogandoLa) return;
  diagJogo.marcarEngasgo(turboRecebe.ligado ? turboRecebe.caixaPreta() : null);
}

// ---------------------------------------------------------------- voltar ao jogo depois de uma queda
// A conexão com o servidor caiu no meio do jogo (ou a página recarregou porque o servidor mudou de
// versão): a sala refaz tudo com ids novos e o modo jogo desliga. Em 2026-11-18 (20:24) um deploy
// derrubou o lorrel no meio da partida, e ele levou ~15 s para achar a tela e religar. Agora a página
// lembra em que tela estava jogando (sessionStorage: sobrevive à recarga) e, quando ela volta à sala (em
// até 3 min), oferece um botão que abre a tela e religa o modo jogo — num clique, porque a tela cheia e o
// mouse preso só entram com um.
const VOLTAR_JOGO = 'sala3d-voltar-jogo';
const VOLTAR_JOGO_MS = 3 * 60_000;
function lembrarJogo() {
  if (!jogandoLa) return;
  const t = acharTela(jogandoLa.key);
  if (!t || t.user.isSelf) return;
  try {
    sessionStorage.setItem(VOLTAR_JOGO, JSON.stringify({ dono: t.user.name, superficie: superficieDe(t.share), titulo: t.share.titulo ?? null, sala: state.room ?? null, em: Date.now() }));
  } catch { /* sem armazenamento */ }
}
function esquecerJogo() {
  try { sessionStorage.removeItem(VOLTAR_JOGO); } catch { /* sem armazenamento */ }
}
function conferirVoltaAoJogo() {
  let info = null;
  try { info = JSON.parse(sessionStorage.getItem(VOLTAR_JOGO) || 'null'); } catch { /* sem armazenamento */ }
  if (!info) return;
  if (Date.now() - info.em > VOLTAR_JOGO_MS || (info.sala && state.room && info.sala !== state.room)) return void esquecerJogo();
  if (jogandoLa || !state.joined) return;
  const t = telasNoAr().find(({ share, user }) => !user.isSelf && user.name === info.dono && superficieDe(share) === info.superficie && podeControlar({ share, user }));
  if (!t) return;
  esquecerJogo();
  diagJogo.marcar('a tela do jogo voltou depois da queda', { dono: info.dono, superficie: info.superficie, foraMs: Date.now() - info.em });
  toast(`A conexão caiu no meio do jogo. A tela de ${info.dono} já voltou.`, 'info', 60_000, null, { rotulo: 'Voltar ao jogo', fazer: () => voltarAoJogo(t.share.key) });
}
// no clique do botão: abre a tela em foco e liga o modo jogo como o botão "Modo jogo" (tela cheia inclusive)
function voltarAoJogo(key) {
  if (!acharTela(key) || jogandoLa) return;
  enterFocus({ kind: 'share', key, semDualSense: true });
  const fv = $('#focus-video');
  if (state.focus?.kind === 'share' && state.focus.key === key && !$('#focus-jogo').hidden && controle.jogoNo !== fv) $('#focus-jogo').click();
}
setInterval(conferirVoltaAoJogo, 2000);
addEventListener('pagehide', lembrarJogo); // a página recarregando (servidor novo) no meio do jogo

function jogoLa(video, key) {
  turboVolta.parar();
  turboAuto.parar();
  testeJoga.pular('saiu do jogo');
  if (jogandoLa) mudarRota(jogandoLa.key, 'auto'); // o TURN escolhido vale só para o jogo
  Object.assign(vigiaCaminho, { par: null, rtt: [], procurou: false });
  previsto = null;
  painelTeste.fechar();
  turboRecebe.desligar();
  turboRecebe.depoisDaFalha = null;
  vidaAjustada = false;
  if (jogandoLa) {
    const feitos = rtc?.baixaLatencia(jogandoLa.video.srcObject, false);
    diagJogo.evento('buffer normal de volta', feitos);
    jogandoLa = null;
    diagJogo.parar();
  }
  if (!video) {
    mostrarAuto();
    return void mostrarSelo();
  }
  esquecerJogo(); // de volta ao jogo: o "Voltar ao jogo" de uma queda anterior não vale mais
  // o automático começa no modo que deu certo da última vez nesta página
  if (turboAuto.ligado && opcoesJogo.get('turbo') && opcoesJogo.get('preset') !== turboAuto.inicial) aplicarPreset(turboAuto.inicial, 'automático');
  jogandoLa = { key, video, cursorLivre: false };
  diagJogo.comecar('joga', {
    gl: world.renderer.getContext(),
    video,
    // janela, e não tela: o ambiente já tem "tela" (o tamanho da tela do aparelho)
    extra: { janelaDoJogo: acharTela(key)?.share.titulo ?? null, toque: isTouch, opcoes: { liso: opcoesJogo.get('liso'), menuAuto: opcoesJogo.get('menuAuto'), giro: opcoesJogo.get('giro'), rapido: opcoesJogo.get('rapido'), turbo: opcoesJogo.get('turbo'), turboLiso: opcoesJogo.get('turboLiso'), preset: opcoesJogo.get('preset') } },
  });
  aplicarBuffer();
  mostrarSelo();
  avisarRapido(); // o "Menos atraso" e o que este aparelho sente (vibra, DualSense)
  if (opcoesJogo.get('turbo')) entrarNoTurbo();
}

// O buffer da imagem de quem joga: o mínimo, ou um pouco (LISO_MS) com "Imagem mais lisa"
function aplicarBuffer() {
  if (!jogandoLa) return;
  const liso = opcoesJogo.get('liso');
  diagJogo.evento(liso ? `buffer de ${LISO_MS} ms (imagem mais lisa)` : 'buffer mínimo', rtc?.baixaLatencia(jogandoLa.video.srcObject, true, liso ? LISO_MS : 0));
}

// Selo de desempenho (opção "Mostrar desempenho"): o que chega na tela, o atraso estimado e a banda,
// a cada amostra do relatório (2 s)
function mostrarSelo(r = null) {
  const el = $('#jogo-selo');
  const ver = !!jogandoLa && opcoesJogo.get('selo');
  el.hidden = !ver;
  if (!ver) return;
  if (!r) return void (el.textContent = 'medindo…');
  const qps = r.fpsFinal != null ? Math.round(r.fpsFinal) : '–';
  const atraso = r.atrasoMs != null ? `${Math.round(r.atrasoMs)} ms` : '–';
  const mbps = r.kbps != null ? (r.kbps / 1000).toFixed(1) : '–';
  const linhas = r.altura ? `${r.altura}p` : '';
  // turbo: da captura lá até desenhado aqui, medido quadro a quadro (turbo.js, pontaMs)
  const imagem = r.turbo?.pontaMs != null ? ` (imagem ${Math.round(r.turbo.pontaMs)} ms)` : '';
  // trancos: quadros que ficaram 3 quadros da fonte ou mais nos últimos 2 s (ritmo.js)
  const trancos = r.ritmo ? ` · <span class="${r.ritmo.trancos > 2 ? 'ruim' : ''}">${r.ritmo.trancos} trancos</span>` : '';
  const liso = r.turbo?.liso ? ` · liso ${Math.round(r.turbo.liso.alvoMs)} ms` : '';
  // PS5 direto: o que o PS5 manda (e, com o Lossless no PC de lá, o que sai do OBS) antes do que chega aqui
  const p5 = jogandoLa.ps5;
  const q = (v) => (v != null ? Math.round(v) : '–');
  const origem = p5 ? `PS5 ${q(p5.manda)}${p5.lossless != null ? ` → Lossless (OBS) ${q(p5.lossless)}` : ''} → aqui ` : '';
  // o Lossless deste PC: o navegador não vê os quadros que ele gera, então é a conta (qps × modo)
  const lsx = Number(opcoesJogo.get('lossless')) || 0;
  const comLs = lsx && r.fpsFinal != null ? ` · com o Lossless ×${lsx} ≈ ${Math.round(r.fpsFinal * lsx)} qps` : '';
  el.innerHTML = (turboRecebe.ligado ? '<b>turbo</b> · ' : '') + `${origem}<span class="${r.fpsFinal != null && r.fpsFinal < 50 ? 'ruim' : ''}">${qps} qps</span>${comLs}${trancos} · ${linhas} · ~${atraso}${imagem}${liso} · ${mbps} Mbps`
    + (r.motivo ? ` · <span class="ruim">${r.motivo}</span>` : '')
    + `\n<span class="${r.culpa ? 'ruim' : ''}">${esc(linhaDaCulpa(r.culpa, diagJogo.sessao?.culpas))}</span>`;
}

opcoesJogo.ouvir((k, v) => {
  // mudou à mão uma opção que faz parte dos presets: agora é "Manual"
  if (!aplicandoPreset && OPCOES_DO_PRESET.includes(k)) {
    presetRede.auto = false;
    autoDesligado();
  }
  if (!aplicandoPreset && OPCOES_DO_PRESET.includes(k) && opcoesJogo.get('preset')) {
    aplicandoPreset = true;
    try { opcoesJogo.setVarios({ preset: 0 }); } finally { aplicandoPreset = false; }
    if (jogandoLa) diagJogo.evento('preset: manual (opção mudada à mão)', { [k]: v });
  }
  if (k === 'preset') sincronizarPresets();
  if (k === 'liso') aplicarBuffer();
  else if (k === 'turboLiso') {
    turboRecebe.liso = v;
    if (jogandoLa) diagJogo.evento(v ? 'turbo liso ligado' : 'turbo liso desligado');
  }
  else if (k === 'rapido') {
    avisarRapido();
    if (turboRecebe.ligado) ligarTurbo(); // o turbo também manda em 720p com "Menos atraso"
  } else if (k === 'turbo' && jogandoLa) {
    if (v) ligarTurbo();
    else {
      turboVolta.parar();
      turboRecebe.desligar();
    }
  }
  else if (k === 'selo') mostrarSelo();
  else if (k === 'nitidez' && turboRecebe.ligado) ligarTurbo(); // o realce troca a tela: liga de novo
  else if (k === 'tratamento' && !turboRecebe.comTratamento(v)) ligarTurbo(); // a tela de agora não é WebGL
  else if (k === 'menuAuto' && jogandoLa) controle.cursorLivre(jogandoLa.key, v ? jogandoLa.cursorLivre : false);
  else if (k === 'preencher') document.body.classList.toggle('jogo-preencher', !!v);
  else if (k === 'tela') document.body.dataset.jogoTela = v;
  $$('#jogo-op-pop [data-op]').forEach((el) => { el.checked = !!opcoesJogo.get(el.dataset.op); });
});
// "Preencher a tela" (só vale no modo jogo: o CSS junta com toque-jogo / jogo-pc)
document.body.classList.toggle('jogo-preencher', !!opcoesJogo.get('preencher'));
document.body.dataset.jogoTela = opcoesJogo.get('tela'); // o tamanho da imagem no celular (junto com toque-jogo)

// A cada 2 s, com o modo jogo ligado de algum lado: uma amostra para o relatório. Quem compartilha
// manda o resumo para quem joga (a mesma volta do controle).
let quadrosDaSala = 0;
function salaAgora() {
  const q = quadrosDaSala;
  quadrosDaSala = 0;
  return { desenha: mundoVisivel(), teto: tetoDeQuadros(), quadros2s: q, escondida: document.hidden, foco: state.focus?.kind ?? null, pessoas: state.users.size };
}
// a última ida e volta do "ping" do controle e o tempo até o ajudante lá (ms)
const pingDoJogo = { rtt: null, ida: null, ajudante: null };
async function amostrarJogo() {
  if (!rtc || !diagJogo.ativo) return;
  try {
    const sala = salaAgora();
    // alguém joga numa tela minha: o Wi-Fi e a carga deste PC também quando o ajudante não manda sozinho (PS5)
    if (jogandoAqui.size) pedirCargaDoPc();
    for (const [key, quem] of [...jogandoAqui]) {
      if (!self()?.shares.has(key)) {
        for (const id of [...quem.keys()]) jogoAqui(key, id, false);
        continue;
      }
      const cru = await rtc.diagEnvio(key);
      const medida = cru.envios.find((e) => e.captura)?.captura;
      if (medida) rtc.capturaMedida(key, medida.width, medida.height);
      for (const id of quem.keys()) {
        // testando a conexão (turbo-teste.js): o vídeo está parado de propósito, não é para avisar nem ajustar nada
        if (testeEnvio.testes.has(id)) continue;
        // no turbo, os números da imagem dessa pessoa são os do canal turbo (o vídeo da conexão está parado)
        const turbo = turboEnvio.stats(id, key);
        const resumo = diagJogo.amostraEnvio(key, cru, id, sala, turbo, self()?.shares.get(key)?.titulo ?? null);
        // o som do PS5 direto (pacotes chegando da ponte, o tocador, a trilha que vai para quem joga)
        if (resumo && self()?.shares.get(key)?.ps5) {
          const ultima = diagJogo.sessao?.amostras.at(-1);
          if (ultima) ultima.somPs5 = somPs5Agora;
        }
        if (!resumo) continue;
        // os ajustes do vídeo da conexão não valem para quem está no turbo
        if (!turbo) ajustarJogo(id, resumo);
        // a captura e o codificador são um só por tela
        if (id === quem.keys().next().value) {
          ajustarCaptura(key, resumo);
          if (!turbo) vigiarCodificador(key, resumo);
        }
        const { t, captura, enviado, codificado, altura, kbps, limite, motivo, codificador, placa, imagemBaixa, codMs, filaMs } = resumo;
        // no turbo, o que só se vê daqui (a banda do codificador, os quadros pulados, os quadros-chave)
        // vai junto: o relatório de quem joga explica sozinho uma queda de banda ou de quadros
        const tb = turbo && { bandaKbps: turbo.bandaKbps, pulados: turbo.pulados, puladosFila: turbo.puladosFila, trocasDeBanda: turbo.trocasDeBanda, filaLaMs: turbo.filaLaMs, chaves: turbo.chaves, chaveKB: turbo.chaveKB, chavesIgnoradas: turbo.chavesIgnoradas, som: turbo.som };
        const ps5 = self()?.shares.get(key)?.ps5 ? { manda: ps5Agora.manda, lossless: null, danos: ps5Agora.danos } : null;
        controle.emitir('controle-volta', { key, para: id, ev: { t: 'jogo-envio', quando: t, captura, enviado, codificado, altura, kbps, limite, motivo, codificador, placa, imagemBaixa, codMs, filaMs, turbo: tb || null, ps5, sonda: resumo.sonda ?? null, roteador: resumo.pc?.roteador ?? null } });
      }
    }
    if (jogandoLa && entrando !== jogandoLa) { // no teste da conexão a imagem está parada: nada a medir
      const dono = jogandoLa.key.split('~')[0];
      // o atraso do controle: um "ping" pelo canal do mouse e do teclado; a volta (receberDireto)
      // traz também quanto o PC de lá leva até o ajudante
      rtc.mandarControle(dono, { p: performance.now() });
      const trilha = jogandoLa.video.srcObject?.getVideoTracks()[0];
      const som = jogandoLa.video.srcObject?.getAudioTracks()[0] || null;
      const extra = { preset: opcoesJogo.get('preset') || 0, turbo: turboRecebe.stats(), controleRttMs: pingDoJogo.rtt, controleIdaMs: pingDoJogo.ida, ajudanteMs: pingDoJogo.ajudante, movimentoCru: controle.movimentoCru, controleFisico: fisico.usado, cursorLivre: jogandoLa.cursorLivre };
      const cru = trilha ? await rtc.diagRecebe(trilha, som) : null;
      const resumo = trilha && diagJogo.amostraRecebe(cru, sala, extra);
      presetPelaRede(cru?.rede);
      amostraDoAuto(resumo);
      vigiarSomQueChega(resumo);
      mostrarSelo(resumo);
      // a mesma amostra vai para quem compartilha, que baixa o relatório dos dois lados de uma vez
      // (do celular não dá para tirar o arquivo fácil). Só pelo canal direto: sem ele, fica aqui.
      if (resumo) {
        const { la, ...r } = resumo;
        // o ambiente nas primeiras (o canal pode ainda estar abrindo) e depois de vez em quando
        const n = diagJogo.sessao.amostras.length;
        const amb = n <= 4 || n % 15 === 1 ? diagJogo.sessao.ambiente : undefined;
        rtc.mandarControle(jogandoLa.key.split('~')[0], { j: { key: jogandoLa.key, r, amb } });
      }
    }
  } catch (err) {
    console.warn('[modo-jogo] amostra', err);
  }
}
setInterval(amostrarJogo, 2000);

// O envio para quem joga se ajusta pelo que as amostras mostram (rtc: piso de banda e degradação):
// a rede dela perdendo mais de 8% por 6 s com o piso → o piso sai (forçar banda numa rede que não
// aguenta só perde mais); a imagem abaixo de 400 linhas por banda por 6 s → 'balanced', que troca
// um pouco dos quadros por linhas, por pelo menos 30 s e até a banda folgar de novo. Só abaixo de
// 400: o 'balanced' do libwebrtc desce até 15 qps em 480p, e 540p a 60 joga melhor que isso.
// E a banda estimada abaixo de 5 Mbps por 4 s → a tela fica fixa em 720p (rtc.linhasDeJogo), em
// vez de pular de resolução a cada vaivém da banda; volta à captura inteira com mais de 9 Mbps
// por 10 s, depois de pelo menos 30 s fixa.
// A captura de um jogo pesado em 1080p ficava em ~32 qps (God of War numa RTX 3060 Ti; numa janela
// pequena, ~55), com banda e codificador sobrando. Não dá para saber pelos números se o limite é
// a captura ou o próprio jogo: então testa. Captura abaixo de 45 qps em 900 linhas ou mais por 6 s,
// sem limite de banda → captura em 720p; nas 3 amostras seguintes (a 1ª depois da troca não
// conta) subiu 8 qps ou mais → fica; senão volta e não tenta de novo (o limite é o jogo/placa).
// Fica no relatório de um jeito ou de outro.
const capturaDoJogo = new Map(); // tela -> { fase, ruins, base, depois, desde }
async function ajustarCaptura(key, r) {
  let st = capturaDoJogo.get(key);
  if (!st) capturaDoJogo.set(key, (st = { fase: 'normal', ruins: 0, base: [], depois: [] }));
  const linhas = Number(String(r.capturaRes || '').split('x')[1]) || 0;
  if (st.fase === 'normal') {
    const ruim = r.captura != null && r.captura < 45 && linhas >= 900 && r.limite === 'none';
    st.ruins = ruim ? st.ruins + 1 : 0;
    st.base = ruim ? [...st.base, r.captura].slice(-3) : [];
    if (st.ruins < 3) return;
    st.fase = 'testando';
    st.depois = [];
    const agora = await rtc.capturaDeJogo(key, 720);
    diagJogo.evento('captura lenta em 1080p: testando a captura em 720p', { captura: mediaDe(st.base), linhas, agora });
    if (agora == null) st.fase = 'nao-ajuda';
  } else if (st.fase === 'testando') {
    st.depois.push(r.captura);
    if (st.depois.length < 4) return;
    const antes = mediaDe(st.base);
    const depois = mediaDe(st.depois.slice(1));
    if (depois != null && antes != null && depois >= antes + 8) {
      st.fase = 'reduzida';
      diagJogo.evento('captura em 720p ajudou: fica', { antes, depois });
    } else {
      st.fase = 'nao-ajuda';
      await rtc.capturaDeJogo(key, null);
      diagJogo.evento('captura em 720p não ajudou: volta ao tamanho inteiro (o limite é o jogo ou a placa)', { antes, depois });
    }
  }
}
// O codificador caiu no processador num codec que a placa faz (H.264 Baseline/Main/High, depois de
// uma medida ímpar, por exemplo): rtc.reiniciarCodificador muda a captura para o par logo abaixo e
// o Chrome volta para a placa. Voltou e a captura de antes era par, ela volta (ou ao 720p do teste
// de captura): a escala par segura a placa. Captura ímpar (janela de tamanho ímpar) fica no par
// logo abaixo. Abaixo de 360 linhas o Chrome usa o processador de propósito: não adianta tentar.
// No máximo uma vez a cada 20 s.
const codificadorDoJogo = new Map(); // tela -> { ultimo, restaurar }
const NO_PROCESSADOR = /openh264|libvpx|libaom/i;
async function vigiarCodificador(key, r) {
  let st = codificadorDoJogo.get(key);
  if (!st) codificadorDoJogo.set(key, (st = { ultimo: 0, restaurar: false }));
  const naPlaca = r.codificador && !NO_PROCESSADOR.test(r.codificador);
  if (st.restaurar && naPlaca) {
    st.restaurar = false;
    const linhas = capturaDoJogo.get(key)?.fase === 'reduzida' ? 720 : null;
    const agora = await rtc.capturaDeJogo(key, linhas);
    diagJogo.evento('codificador de volta na placa: captura no tamanho de antes', { codificador: r.codificador, captura: agora });
    return;
  }
  const podiaPlaca = /H264/i.test(r.codec || '') && /profile-level-id=(42001f|4d00|6400)/i.test(r.codec || '');
  if (!podiaPlaca || naPlaca || !r.codificador || !(r.altura >= 360) || Date.now() - st.ultimo < 20_000) return;
  st.ultimo = Date.now();
  const feito = await rtc.reiniciarCodificador(key);
  st.restaurar = !!feito?.nativoPar;
  st.mexeu ||= !!feito; // ao sair do modo jogo a captura volta ao preset
  diagJogo.evento('codificador no processador: captura em medida par para voltar à placa', { codificador: r.codificador, enviado: `${r.largura}x${r.altura}`, captura: feito?.tamanho ?? null, voltaDepois: st.restaurar });
}

const mediaDe = (v) => {
  const n = v.filter((x) => x != null);
  return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
};

// O codec de jogo (H.265, ou o H.264 da placa com o perfil trocado: rtc.preferirCodecDeJogo) é
// aposta: se o aparelho de quem joga passar 6 s sem decodificar nenhum quadro, um passo atrás.
const semDecodificar = new Map(); // id de quem joga -> amostras seguidas sem quadro decodificado
function vigiarDecodificacao(id, r) {
  // no modo turbo o vídeo da conexão para essa pessoa está parado de propósito (rtc.turboPara): não
  // decodificar nada ali é o certo — antes isso tirava o H.265 e a troca de perfil à toa, e o vídeo
  // normal voltava no processador
  if ([...turboEnvio.sessoes.values()].some((s) => s.id === id) || r?.turbo) return void semDecodificar.set(id, 0);
  const n = r && typeof r === 'object' && !(r.decodificado > 0) ? (semDecodificar.get(id) || 0) + 1 : 0;
  semDecodificar.set(id, n);
  if (n < 3) return;
  semDecodificar.set(id, 0);
  const passo = rtc.codecSeguroJogo(id);
  if (passo) diagJogo.evento(passo === 1 ? 'quem joga não decodificou: sem o H.265' : 'quem joga não decodificou: sem a troca de perfil do H.264', { codec: r.codec ?? null });
}

const ajusteDoJogo = new Map(); // id de quem joga -> { perdas, baixas, boas, balanceadoDesde, curta, larga, fixaDesde }
function ajustarJogo(id, r) {
  let st = ajusteDoJogo.get(id);
  if (!st) ajusteDoJogo.set(id, (st = { perdas: 0, baixas: 0, boas: 0, balanceadoDesde: 0, curta: 0, larga: 0, fixaDesde: 0 }));
  const est = r.saidaEstimadaKbps;
  st.n = (st.n || 0) + 1;
  // O modo jogo começa em 720p: a banda começa em 1–8 Mbps e leva uns segundos para subir, e em
  // 1080p cheio a fila de envio chegava a 1 s, com 2 s de imagem parada no iPhone logo no começo.
  // Sai com a banda acima de 9 Mbps por 6 s (no mínimo 8 s depois de começar).
  if (st.n === 1 && rtc.linhasDeJogo(id, 720)) {
    st.fixaDesde = Date.now();
    st.comeco = true;
    diagJogo.evento('começo em 720p até a banda subir', { saidaEstimadaKbps: est, altura: r.altura });
  }
  st.curta = st.n > 3 && est != null && est < 5000 ? st.curta + 1 : 0;
  st.larga = est != null && est > 9000 ? st.larga + 1 : 0;
  // Fila de envio acima de 150 ms numa amostra só: 720p (e metade da banda) na hora, sem esperar a
  // estimativa cair. Esperando, a fila chegava a 1 s, a imagem parava 1–2 s e o iPhone ficava com
  // o buffer em 400 ms por uns 20 s depois. Já em 720p, a fila alta segura o 720p por mais 30 s.
  const filaAlta = (r.filaMs ?? 0) > 150;
  if (filaAlta && st.fixaDesde) {
    st.fixaDesde = Date.now();
    st.comeco = false;
  }
  if (filaAlta && rtc.linhasDeJogo(id, 720)) {
    st.fixaDesde = Date.now();
    st.comeco = false;
    diagJogo.evento('fila de envio cresceu: tela em 720p na hora', { filaMs: r.filaMs, saidaEstimadaKbps: est, altura: r.altura });
  } else if (st.curta >= 2 && rtc.linhasDeJogo(id, 720)) {
    st.fixaDesde = Date.now();
    st.comeco = false;
    diagJogo.evento('banda curta: tela fixa em 720p', { saidaEstimadaKbps: est, altura: r.altura });
  } else if (st.fixaDesde && Date.now() - st.fixaDesde > (st.comeco ? 8_000 : 30_000) && st.larga >= (st.comeco ? 3 : 5) && rtc.linhasDeJogo(id, null)) {
    st.fixaDesde = 0;
    st.comeco = false;
    diagJogo.evento('banda folgou: tela de volta à captura inteira', { saidaEstimadaKbps: est });
  }
  st.perdas = (r.perdaLa ?? 0) > 8 ? st.perdas + 1 : 0;
  if (st.perdas >= 3 && rtc.soltarPisoJogo(id)) diagJogo.evento('piso de banda solto: a rede de quem joga está perdendo muito', { perdaLa: r.perdaLa, kbps: r.kbps });
  // O piso também enche a fila sem perder nada: forçando banda acima do que o Wi-Fi aguenta, os
  // pacotes esperam (fila de envio até 480 ms num relatório) e atrasam a imagem e o controle juntos.
  // Fila acima de 60 ms, ou a ida e volta o dobro da menor vista (e 20 ms a mais), por 6 s → sai.
  if (r.rttMs != null) st.rttBase = Math.min(st.rttBase ?? Infinity, r.rttMs);
  const enfileirou = (r.filaMs ?? 0) > 60 || (r.rttMs != null && st.rttBase != null && r.rttMs > st.rttBase * 2 && r.rttMs - st.rttBase > 20);
  st.filas = enfileirou ? (st.filas || 0) + 1 : 0;
  if (st.filas >= 3 && rtc.soltarPisoJogo(id)) diagJogo.evento('piso de banda solto: a fila cresceu (atraso)', { filaMs: r.filaMs, rttMs: r.rttMs, rttBase: st.rttBase, kbps: r.kbps });
  const banda = r.limite === 'bandwidth';
  st.baixas = r.imagemBaixa && r.altura < 400 && banda ? st.baixas + 1 : 0;
  st.boas = !r.imagemBaixa && r.limite === 'none' ? st.boas + 1 : 0;
  if (st.baixas >= 3 && rtc.imagemDeJogo(id, true)) {
    st.balanceadoDesde = Date.now();
    diagJogo.evento('imagem em migalhas: troca um pouco de quadros por resolução (balanced)', { altura: r.altura, kbps: r.kbps, saidaEstimadaKbps: r.saidaEstimadaKbps });
  } else if (st.balanceadoDesde && Date.now() - st.balanceadoDesde > 30_000 && st.boas >= 3 && rtc.imagemDeJogo(id, false)) {
    st.balanceadoDesde = 0;
    diagJogo.evento('banda folgou: volta a segurar os 60 quadros', { altura: r.altura, kbps: r.kbps });
  }
}

// O que chega pelo canal direto não passou pelo servidor: aqui se confere o que ele conferiria —
// a tela é minha e está liberada, o evento é bem formado e ninguém manda mais de 240 por segundo.
const contasDiretas = new Map(); // id -> { janela, conta }
const somasDoJogo = new Map(); // "id:tela" -> a última soma de movimento que chegou { e, x, y, s }
function receberDireto(id, m) {
  const u = state.users.get(id);
  if (!u || !m || typeof m !== 'object') return;
  if (m.v && typeof m.v === 'object') {
    // a volta só vale de quem é dono da tela
    if (typeof m.v.key === 'string' && m.v.key.split('~')[0] === id) receberVolta({ ...m.v, de: u.name });
    return;
  }
  // modo jogo: o que quem joga numa tela minha mediu do lado dela (só dela, e pequeno)
  if (m.j && typeof m.j === 'object') {
    if (typeof m.j.key === 'string' && jogandoAqui.get(m.j.key)?.has(id) && JSON.stringify(m.j).length < 20_000) {
      diagJogo.doQuemJoga(id, u.name, m.j);
      vigiarDecodificacao(id, m.j.r);
    }
    return;
  }
  // ping do controle de quem joga numa tela minha: volta na hora, com o tempo até o ajudante daqui
  if (typeof m.p === 'number') {
    // t: a hora daqui, para quem joga medir só a ida (com os relógios acertados pelo turbo)
    if ([...jogandoAqui.values()].some((q) => q.has(id))) rtc?.mandarControle(id, { pe: m.p, aj: controle.ajudanteMs != null ? Math.round(controle.ajudanteMs * 10) / 10 : null, t: performance.now() });
    return;
  }
  // a volta do meu ping (eu jogo na tela dessa pessoa)
  if (typeof m.pe === 'number') {
    if (jogandoLa?.key.split('~')[0] === id) {
      // A ida sozinha (o comando): a hora de lá menos a diferença dos relógios (a do turbo, pelo pong
      // de menor ida e volta). A volta do ping vem pelo caminho da imagem e espera atrás dela.
      const dif = turboRecebe.dif;
      const ida = typeof m.t === 'number' && dif != null ? Math.max(0, Math.round((m.t - dif - m.pe) * 10) / 10) : null;
      Object.assign(pingDoJogo, { rtt: Math.round((performance.now() - m.pe) * 10) / 10, ida, ajudante: typeof m.aj === 'number' ? m.aj : null });
    }
    return;
  }
  const agora = Date.now();
  const n = contasDiretas.get(id) || { janela: 0, conta: 0 };
  if (agora - n.janela > 1000) Object.assign(n, { janela: agora, conta: 0 });
  contasDiretas.set(id, n);
  // Modo jogo: o total andado pelo mouse (canal sem ordem, ver controle.enviarMove). Aplica a
  // diferença para a última soma que chegou; a que chega atrasada (número menor) já está somada.
  if (m.m && typeof m.m === 'object') {
    const t = m.m;
    if (typeof t.key !== 'string' || !self()?.shares.get(t.key)?.controle || ![t.e, t.x, t.y, t.s].every(Number.isFinite)) return;
    if (++n.conta > 240) return;
    const chave = `${id}:${t.key}`;
    const u0 = somasDoJogo.get(chave);
    const antes = u0?.e === t.e ? u0 : { e: t.e, x: 0, y: 0, s: 0 };
    if (t.s <= antes.s) return;
    somasDoJogo.set(chave, { e: t.e, x: t.x, y: t.y, s: t.s });
    const ev = eventoDeControle({ t: 'mouse', a: 'move', dx: t.x - antes.x, dy: t.y - antes.y, b: 'left', mod: 0, jogo: true });
    if (ev) receberControle({ key: t.key, ev, de: u.name, deId: id });
    return;
  }
  const c = m.c;
  if (!c || typeof c.key !== 'string' || !self()?.shares.get(c.key)?.controle) return;
  if (++n.conta > 240) return;
  const ev = eventoDeControle(c.ev);
  if (ev) receberControle({ key: c.key, ev, de: u.name, deId: id });
}

// Alt+Shift+S (ou o ícone da extensão) numa aba: a resposta vai para o ícone dela
controle.onCapturarAba =async (p) => controle.responderPedido(p.pedido, await capturarAbaDaExtensao(p));
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
$('#set-obs-monitor').value = String(settings.obsMonitor || 1);
$('#set-obs-monitor').addEventListener('change', (e) => {
  settings.obsMonitor = Number(e.target.value) || 1;
  saveSettings();
  // a tela do OBS no ar passa a controlar o monitor novo
  for (const sh of self()?.shares.values() || []) {
    if (sh.obs && sh.alvo) sh.alvo = { superficie: 'monitor', rotulo: `screen:${settings.obsMonitor - 1}:0` };
  }
});
$('#btn-ps5').addEventListener('click', () => {
  if (ps5Nativo.aberto) return ps5Nativo.fechar();
  closePanel();
  ps5Nativo.abrir();
});
$('#btn-pc').addEventListener('click', () => {
  if (pcDireto.aberto) return pcDireto.fechar();
  closePanel();
  pcDireto.abrir();
});
$('#obs-compartilhar').addEventListener('click', () => {
  closePanel();
  novaTela(undefined, { obs: true });
});
$('#ver-tutorial').addEventListener('click', () => {
  closePanel();
  tutorialHud.iniciar();
});

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
    if (quem.deId) controle.emitir('controle-volta', { key: sh.key, para: quem.deId, ev });
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
  if (janelasOk) for (const s of janelas) await conferirAdmin(s);
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
  // PS5 direto: o controle vai para a ponte, sem extensão nem ajudante no meio
  if (sh.ps5) {
    socket.emit('controle-permitir', { key, on: !sh.controle });
    toast(sh.controle ? 'Ninguém mais joga no PS5 por aqui.' : 'Pronto: quem abrir essa tela joga no PS5 com o controle dela.', 'success', 5000);
    return;
  }
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
  conferirAdmin(sh);
}

// Dá para mexer nesta tela daqui? As dos outros, se o dono liberou. As suas, só se for aba: quem
// clica nela é a extensão, sem tocar no mouse. Janela e tela inteira são o ajudante nativo
// movendo o seu mouse de verdade — controladas de você para você, ele brigaria com ele mesmo.
// a própria tela: só a aba (o resto já está na mão de quem compartilha) e o PS5 direto, que não
// tem janela nenhuma no PC: a sala é o único lugar onde dá para jogar nele
const podeControlar = ({ user: u, share: sh }) => !!sh.controle && (!u.isSelf || sh.aba != null || superficieDe(sh) === 'ps5');

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
    // janela ou tela inteira: o título é o jogo que o ajudante reconheceu nela (ver onQual)
    const jogo = ['window', 'monitor', 'ps5'].includes(superficieDe(t.share)) && t.share.titulo ? ` · ${t.share.titulo}` : '';
    $('#focus-name').textContent = `${dono} · ${ondeEsta(t.share)}${!nav && t.share.site ? ` · ${t.share.site}` : ''}${jogo}`;
  }
  // a máquina alugada para outra pessoa: só assistir (o "Modo jogo" vira "Tela cheia", ver soVerLan)
  const ver = !!t && !t.user.isSelf && soVerLan(t.share);
  if (!pode || ver) controle.remover(fv);
  // Liberada, já entra controlando — igual à mesa, sem botão no meio do caminho. "Só assistir"
  // para de mexer até fechar o foco (state.focus.soAssistir).
  else if (!controle.tem(fv) && !state.focus.soAssistir) {
    controle.adicionar(fv, state.focus.key);
    controle.focar(fv);
  }
  const liberar = !!t && !pode && t.user.isSelf && !t.share.file && t.share.aba != null;
  const on = controle.tem(fv);
  btn.hidden = (!pode && !liberar) || ver;
  btn.dataset.modo = liberar ? 'liberar' : 'controlar';
  btn.classList.toggle('on', on);
  btn.innerHTML = `${icon(liberar || !on ? 'cursor' : 'eye', 16)}${liberar ? 'Permitir controle' : on ? 'Só assistir' : 'Controlar'}`;
  btn.title = on ? 'Parar de mexer nesta tela (continua vendo)' : '';
  // Modo jogo: só em janela/tela inteira dos outros (o ajudante nativo é quem manda delta/scancode),
  // e no PS5 direto também na própria (teclado, mouse e controle daqui viram o controle do PS5)
  const jb = $('#focus-jogo');
  const sup = t ? superficieDe(t.share) : null;
  const janela = !!t && (sup === 'ps5' || (!t.user.isSelf && ['window', 'monitor'].includes(sup)));
  if ((!on || !janela) && controle.jogoNo === fv) controle.desligarJogo();
  jb.hidden = ver ? !janela : !on || !janela;
  jb.dataset.ver = ver ? '1' : '';
  // as opções do modo jogo (no celular elas ficam no painel do controle de toque)
  $('#focus-jogo-op-wrap').hidden = jb.hidden || isTouch || ver;
  $('#focus-engasgo').hidden = jb.hidden || isTouch || ver || controle.jogoNo !== fv;
  if (jb.hidden || ver) $('#jogo-op-pop').hidden = true;
  const emJogo = controle.jogoNo === fv;
  if (ver) {
    const cheia = !!document.fullscreenElement;
    jb.classList.toggle('on', cheia);
    jb.innerHTML = `${icon('eye', 16)}${cheia ? 'Sair da tela cheia' : 'Tela cheia'}`;
    jb.title = `Agora é a vez de ${state.lan?.[maquinaDaTela(t.share)]?.conta || 'outra pessoa'}: dá para assistir em tela cheia. F8 entra e sai.`;
    return;
  }
  jb.classList.toggle('on', emJogo);
  jb.innerHTML = `${icon('gamepad', 16)}${emJogo ? 'Desligar modo jogo' : 'Modo jogo'}`;
  jb.title = isTouch ? 'Analógico e botões na tela, com os do Minecraft e do God of War' : 'Mouse gira a câmera e WASD anda (Minecraft e cia.). F8 liga e desliga.';
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
$('#focus-jogo').addEventListener('click', async () => {
  const fv = $('#focus-video');
  // alugada para outra pessoa: só a tela cheia, sem controle, sem tutorial e sem o teste da conexão
  if ($('#focus-jogo').dataset.ver && controle.jogoNo !== fv) return void verOuAlugar();
  const ligar = controle.jogoNo !== fv;
  if (!ligar) esquecerJogo(); // desligou de propósito (botão ou F8): nada de "Voltar ao jogo"
  // decidido antes de ligar (ainda no clique): a lista de aparelhos do Chrome tem que abrir antes da
  // tela cheia, que a escondia
  const pedirDualSense = ligar && !isTouch && precisaPedirDualSense();
  if (pedirDualSense) pedindoDualSense = true; // antes do modoJogo: o tutorial do teclado não abre
  controle.modoJogo(fv, ligar);
  updateFocusCtrl();
  if (ligar && isTouch) {
    // celular: tela cheia deitada, e o controle de toque por cima (ver toque-jogo.js, que avisa
    // com que botões entrou)
    if (!document.fullscreenElement) $('#focus').requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else if (ligar) {
    if (pedirDualSense) {
      await conectarDualSense();
      if (controle.jogoNo !== fv) return; // desligou o modo jogo enquanto a lista estava aberta
      // Depois da lista o Chrome já não deixa entrar em tela cheia (o clique "venceu"): tenta, e se
      // não der, entra no próximo clique ou tecla na página — que é o mesmo clique que prende o mouse
      await jogoNoPc(true);
      if (!document.fullscreenElement) telaCheiaNoProximoGesto(fv);
      return;
    }
    jogoNoPc(true); // sem aviso ao ligar (pedido de 2026-11-27)
  } else if (!isTouch) jogoNoPc(false);
});

// Modo jogo numa tela de PS5 com um DualSense ligado neste PC (a Gamepad API o vê) e sem a permissão do
// WebHID ainda: pede já, aproveitando o clique (o Chrome só abre a lista de aparelhos num clique). É
// uma vez só: com a permissão dada, o touchpad.ligar() do onJogo conecta sozinho daí em diante.
// A permissão fica guardada aqui (dualSensePermitido) porque a decisão tem que ser na hora do clique.
let dualSensePermitido = false;
let pedindoDualSense = false; // a lista do Chrome está aberta (do clique no Modo jogo)

// a tela cheia que a lista do Chrome não deixou entrar: no próximo clique ou tecla, se ainda no jogo
function telaCheiaNoProximoGesto(fv) {
  toast('DualSense pronto. Clique na tela (ou aperte uma tecla) para entrar em tela cheia.', 'info', 7000);
  const ir = () => {
    removeEventListener('pointerdown', ir, true);
    removeEventListener('keydown', ir, true);
    if (controle.jogoNo === fv && !document.fullscreenElement) jogoNoPc(true);
  };
  addEventListener('pointerdown', ir, true);
  addEventListener('keydown', ir, true);
}
const conferirPermissaoDualSense = () => navigator.hid?.getDevices?.()
  .then((ds) => { dualSensePermitido = ds.some((d) => d.vendorId === 0x054c); })
  .catch(() => {});
conferirPermissaoDualSense();
navigator.hid?.addEventListener?.('connect', conferirPermissaoDualSense);

// Não dá para exigir ver o DualSense na Gamepad API: depois de aberto pelo WebHID uma vez, ele fica no
// relatório completo (0x31) até desligar, e aí o Chrome não o mostra mais. Então pede sempre numa tela
// de PS5, menos se: quem joga fechou a lista sem escolher (não insiste mais neste navegador), ou o
// controle ligado é de outra marca (um de Xbox não precisa disto).
const RECUSOU_DUALSENSE = 'sala3d.dualsenseRecusou';
function precisaPedirDualSense() {
  if (!temTouchpadHid() || touchpad.ligado || dualSensePermitido || pedindoDualSense) return false;
  try { if (localStorage.getItem(RECUSOU_DUALSENSE)) return false; } catch { /* sem armazenamento: pede */ }
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  if (!t || !(t.share.ps5 || layoutDoTitulo(t.share.titulo) === 'ps5')) return false;
  const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const sony = (g) => /054c|dualsense|wireless controller/i.test(g.id);
  return !pads.length || pads.some(sony);
}

async function conectarDualSense() {
  let ok = false;
  pedindoDualSense = true;
  try { ok = await touchpad.pedir(); } catch { /* fechou a lista ou falhou ao abrir */ }
  pedindoDualSense = false;
  if (ok) {
    dualSensePermitido = true;
    try { localStorage.removeItem(RECUSOU_DUALSENSE); } catch { /* ok */ }
    toast('DualSense ligado: botões, gatilhos adaptativos, vibração e touchpad vão direto entre ele e o PS5. Das próximas vezes ele liga sozinho.', 'success', 6000);
  } else {
    // fechou a lista sem escolher: não pergunta mais neste navegador (o botão das Opções continua lá)
    try { localStorage.setItem(RECUSOU_DUALSENSE, '1'); } catch { /* ok */ }
    toast('Sem o DualSense: dá para ligar depois em Opções → "Usar o DualSense".', 'info', 6000);
  }
  atualizarBotaoTouchpad();
}

// Sai do modo jogo e fica na tela em foco (o Esc duas vezes): o mesmo que o botão "Desligar modo jogo"
function desligarModoJogoNoFoco() {
  esquecerJogo();
  controle.modoJogo($('#focus-video'), false);
  updateFocusCtrl();
  if (!isTouch) jogoNoPc(false);
}

// Modo jogo no PC: tela cheia da tela em foco, sem moldura, com o teclado travado (Keyboard Lock).
// Sem a trava o Chrome fica com Ctrl+W, Ctrl+T e Ctrl+N — no Minecraft correr é Ctrl+W, e a aba
// da sala fechava. Travado, um Esc rápido vai para o jogo (segurar o Esc sai da tela cheia).
// Só as teclas de jogo: a trava de todas (lock() sem lista) pegava o PC inteiro de quem joga — a tecla
// Windows e os atalhos do Windows (Ctrl+Esc, Alt+Tab) iam para a página em vez do Windows daqui.
const TECLAS_TRAVADAS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `Key${l}`),
  ...'0123456789'.split('').map((n) => `Digit${n}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'Escape', 'Tab', 'Space', 'Enter', 'Backspace', 'CapsLock', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'Minus', 'Equal',
  'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'IntlBackslash', 'IntlRo',
];
async function jogoNoPc(ligar) {
  document.body.classList.toggle('jogo-pc', ligar);
  if (ligar) {
    try {
      if (document.fullscreenElement !== $('#focus')) await $('#focus').requestFullscreen({ navigationUI: 'hide' });
      await navigator.keyboard?.lock?.(TECLAS_TRAVADAS);
      diagJogo.evento('tela cheia com o teclado travado', { trava: !!navigator.keyboard?.lock });
    } catch (err) {
      diagJogo.evento('tela cheia ou trava do teclado recusada', { erro: String(err?.message || err) });
    }
    controle.travarPonteiro(); // a tela cheia pode ter soltado o ponteiro
  } else {
    navigator.keyboard?.unlock?.();
    if (document.fullscreenElement === $('#focus')) document.exitFullscreen().catch(() => {});
  }
}
// saiu da tela cheia (Esc segurado, F11): a trava do teclado já caiu sozinha; o modo jogo continua
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('jogo-pc');
  else if (controle.jogoNo && !isTouch) document.body.classList.add('jogo-pc');
  if ($('#focus-jogo').dataset.ver) updateFocusCtrl(); // o "Tela cheia" de quem só assiste troca o texto
});
// Eu assistia a vez de outra pessoa e ela acabou com a máquina livre: sai da tela cheia e abre o aluguel no
// "Jogar agora" (começa no minuto seguinte). Com a página escondida, fica para quando voltar a ela.
let fimVezPendente = null;
async function acabouVezAssistindo(m, conta) {
  if (document.visibilityState !== 'visible') return void (fimVezPendente = { m, conta });
  fimVezPendente = null;
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  const nome = { pc: 'PC', ps5: 'PS5' }[m];
  const temTeste = !state.lan?.semTeste?.includes(state.selfId);
  toast(`A vez de ${conta || 'quem jogava'} no ${nome} acabou: o ${nome} está livre.${temTeste ? ' Use seus 2 min grátis ou alugue para jogar.' : ' Alugue para jogar agora.'}`, 'info', 10000);
  if (!state.lan || !lanLivre(m) || !$('#lan-modal').hidden) return; // alguém pegou nesse meio-tempo, ou já está aberto
  abrirAluguel({ maquina: m, agora: true }); // o "Jogar agora" do aluguel: começa no minuto seguinte
}
document.addEventListener('visibilitychange', () => {
  const p = fimVezPendente;
  if (p && document.visibilityState === 'visible' && state.lan && lanLivre(p.m)) acabouVezAssistindo(p.m, p.conta);
});
// antes da 1ª tela cheia desta vez: a oferta do próximo horário livre (oferta-aluguel.js)
async function verOuAlugar() {
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  if (!t) return;
  const m = maquinaDaTela(t.share);
  const vez = state.lan?.[m];
  if (document.fullscreenElement || !precisaOferecer(m, vez)) return telaCheiaSoVer();
  const r = await oferecerAluguel({ sala: state.room || '', maquina: m, vez });
  if (r === 'ver') telaCheiaSoVer();
  else if (r?.alugar) abrirAluguel({ maquina: m, ...r.alugar });
}
function telaCheiaSoVer() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    if (isTouch) screen.orientation?.unlock?.();
    return;
  }
  $('#focus').requestFullscreen({ navigationUI: 'hide' })
    .then(() => (isTouch ? screen.orientation?.lock?.('landscape') : null))
    .catch(() => { /* iPhone: sem tela cheia de elemento */ });
}

// opções do modo jogo no PC (o celular tem as mesmas no painel do controle de toque)
$('#focus-jogo-op').addEventListener('click', (e) => {
  const pop = $('#jogo-op-pop');
  pop.hidden = !pop.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!pop.hidden));
  e.currentTarget.blur();
  alturaDoMenu(pop);
  $$('#jogo-op-pop [data-op]').forEach((el) => { el.checked = !!opcoesJogo.get(el.dataset.op); });
  // o volume do PS5 só aparece para quem tem o PS5 numa tela deste PC
  $('#jogo-ps5-vol-row').hidden = ![...(self()?.shares.values() || [])].some((sh) => sh.ps5 && sh.escuta);
  mudarVolumePs5(volumePs5);
  atualizarBotaoTouchpad();
});
$('#jogo-ps5-vol').addEventListener('input', (e) => mudarVolumePs5(e.target.value));
// sensibilidade do mouse num jogo de controle (teclado-pad.js), guardada neste aparelho
const mostrarMouseSens = () => {
  const v = Number(opcoesJogo.get('mouseSens')) || 1;
  $('#jogo-mouse-sens').value = String(v);
  $('#jogo-mouse-sens-n').textContent = `${v.toFixed(1)}×`;
};
mostrarMouseSens();
$('#jogo-mouse-sens').addEventListener('input', (e) => {
  opcoesJogo.set('mouseSens', Math.min(3, Math.max(0.3, Number(e.target.value) || 1)));
  mostrarMouseSens();
});
$('#focus-engasgo').addEventListener('click', (e) => {
  e.currentTarget.blur();
  marcarEngasgo();
});
$('#jogo-lossless').value = String(Number(opcoesJogo.get('lossless')) || 0);
$('#jogo-lossless-ligar').addEventListener('click', (e) => {
  e.currentTarget.blur();
  alternarLossless();
});
$('#jogo-lossless').addEventListener('change', (e) => {
  opcoesJogo.set('lossless', Number(e.target.value) || 0);
  e.target.blur();
  mostrarSelo();
});
addEventListener('resize', () => alturaDoMenu($('#jogo-op-pop')));
$('#jogo-op-pop').addEventListener('change', (e) => {
  const k = e.target.dataset.op;
  if (k) opcoesJogo.set(k, e.target.checked);
  e.target.blur();
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#focus-jogo-op-wrap')) $('#jogo-op-pop').hidden = true;
});

// Controle de videogame (gamepad-jogo.js): no modo jogo, no PC e no celular. No celular, usando o
// controle, os botões da tela saem do caminho.
// Controle virtual (pad-virtual.js): no layout PS5 o toque e o controle de videogame viram um
// controle de Xbox no PC de quem compartilha, em vez de teclado e mouse
const padVirtual = new PadVirtual({ controle });
const tecladoPad = new TecladoPad({
  pad: padVirtual,
  sens: () => opcoesJogo.get('mouseSens'),
  aviso: (texto) => toast(texto, 'info', 5000),
  // sem o quadro "a pé / no carro" (desde 2026-11-27): o modo entra pelo quadro do carro no jogo (avisosBotoes)
  // e o △ seguinte volta a pé
  onCarro: (sim) => {
    if (sim !== noCarro) diagJogo.evento(sim ? 'modo carro: no carro' : 'modo carro: a pé');
    noCarro = sim;
  },
});
tecladoPad.soSaiNoTriangulo = true;
// A tecla em cima dos avisos de botão do jogo (avisos-botoes-tela.js), como no /jogar: no PC, numa tela de PS5,
// jogando no teclado. Também acha o quadro do carro do GTA (acima do minimapa) e liga o modo carro.
const avisosBotoes = new AvisosBotoes({
  camada: $('#jogo-avisos'),
  video: $('#focus-video'),
  telaTurbo: () => $('#focus-video').parentElement.querySelector('.turbo-tela:not([hidden])'),
  querCarro: () => mapaTeclas.carroTroca(),
  noCarro: () => tecladoPad.noCarro(),
  onCarro: () => {
    if (tecladoPad.carro || !mapaTeclas.carroTroca()) return;
    diagJogo.evento('modo carro: o quadro do carro apareceu no jogo');
    tecladoPad.trocarCarro(true);
  },
});
turboRecebe.espiar = (frame) => avisosBotoes.espiar(frame);
// tremores que chegaram aqui (quem joga), para o relatório (ver receberVolta)
const tremoresAqui = { n: 0, como: {}, primeiro: false, desde: 0 };
padVirtual.onErroTremor = (erro) => diagJogo.evento('o controle não aceitou o tremor', { erro, ...padVirtual.comoVibra() });
// Sem tutorial do controle (desde 2026-11-27, como no /jogar): no teclado as teclas aparecem nos avisos do jogo.
// Mapear teclas (mapa-teclas.js): pelas Opções do modo jogo. Aberto, o teclado e o mouse são do painel
// (nada vai para o jogo) e o que o teclado segurava no controle solta.
const mapaPainel = new MapaTeclasPainel({
  raiz: $('#mapa-teclas'),
  onAbriu: () => tecladoPad.soltarTudo(),
  onFechou: () => {
    tecladoPad.soltarTudo();
    if (controle.jogo) toast('Teclas salvas neste navegador. Clique na imagem para voltar a jogar.', 'success', 4000);
  },
});
$('#jogo-mapear').addEventListener('click', (e) => {
  e.currentTarget.blur();
  $('#jogo-op-pop').hidden = true;
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  mapaPainel.abrir(layoutDoTitulo(t?.share?.titulo) === 'switch' ? 'switch' : 'ps5');
});
controle.paraPad = (ev) => {
  if (mapaPainel.aberto) return true;
  return tecladoPad.evento(ev);
};
// Touchpad do DualSense (ps5-touchpad.js): no modo jogo numa tela de PS5, no PC. Com a permissão dada
// uma vez, volta sozinho; antes disso, pelo botão nas opções do modo jogo.
// controle ligado ou desligado: as teclas nos avisos são só para quem joga no teclado
const entradaMudou = () => { if (layoutLegenda) mostrarLegendaJogo(layoutLegenda); };
const touchpad = new Ps5Touchpad({ pad: padVirtual, onMudou: () => { atualizarBotaoTouchpad(); avisarRapido(); entradaMudou(); } });
padVirtual.hid = touchpad; // com o DualSense aberto pelo WebHID, a vibração vai direto nele
function atualizarBotaoTouchpad() {
  const b = $('#jogo-touchpad');
  // no modo jogo do PS5, e também só assistindo uma tela de PS5 (dá para ligar antes de jogar)
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  const telaPs5 = !isTouch && !!t && (!!t.share?.ps5 || layoutDoTitulo(t.share?.titulo) === 'ps5');
  b.hidden = !temTouchpadHid() || !(touchpad.ativo || telaPs5);
  b.textContent = touchpad.ligado ? 'DualSense ligado ✓ (gatilhos, vibração e touchpad)' : 'Usar o DualSense (gatilhos, vibração e touchpad)';
  b.disabled = touchpad.ligado;
  // Mapear teclas: no PC, numa tela de PS5 ou de Switch (onde o teclado vira o controle)
  const lay = t ? (t.share?.ps5 ? 'ps5' : layoutDoTitulo(t.share?.titulo)) : null;
  $('#jogo-mapear').hidden = isTouch || !LAYOUTS[lay]?.virtual;
}
$('#jogo-touchpad').addEventListener('click', async (e) => {
  e.currentTarget.blur();
  try {
    if (await touchpad.pedir()) toast('DualSense ligado: botões, gatilhos adaptativos, vibração e touchpad vão direto entre ele e o PS5.', 'success', 5000);
  } catch (err) {
    toast(`Não deu para ler o touchpad: ${err?.message || err}`, 'warn', 7000);
  }
  conferirPermissaoDualSense();
  atualizarBotaoTouchpad();
});
const fisico = new ControleFisico({
  controle,
  pad: padVirtual,
  toast,
  onAtivo: (sim) => { $('#toque-jogo').classList.toggle('tj-pad', sim); entradaMudou(); },
});
// o controle de toque aparece e some junto com o modo jogo (inclusive quando ele desliga sozinho)
const toqueJogo = new ToqueJogo({
  raiz: $('#toque-jogo'),
  controle,
  pad: padVirtual,
  toast: (texto, tipo, ...resto) => { if (tipo !== 'info') toast(texto, tipo, ...resto); }, // sem os avisos de entrada
  onEngasgo: () => marcarEngasgo(),
  onTv: isTouch ? () => naTv.abrir() : null,
  // "Volume do jogo" no painel: o mesmo "Volume das telas compartilhadas" dos Ajustes
  volume: {
    get: () => settings.screen,
    set: (v) => {
      settings.screen = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
      const el = $('#set-screen');
      if (el) el.value = String(settings.screen);
      updateVolumes();
      saveSettings();
    },
  },
  onSair: () => {
    controle.desligarJogo();
    updateFocusCtrl();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  },
});
sincronizarPresets(); // o painel do celular também tem o seletor de presets
// "Colocar na TV" (na-tv.js): no celular, na tela em foco e no modo jogo
const naTv = isTouch ? new NaTv({
  raiz: $('#na-tv'),
  foco: $('#focus'),
  toast,
  // a tela do jogo em foco: a que já está, senão a do telão, senão a primeira com imagem
  abrirTela: () => {
    if (state.focus?.kind === 'share') return true;
    const key = [state.main, ...[...state.users.values()].flatMap((u) => [...u.shares.keys()])]
      .find((k) => k && shareVideo(acharTela(k)?.share));
    if (key) enterFocus({ kind: 'share', key });
    return state.focus?.kind === 'share';
  },
  token: () => tokenLan(),
  sala: () => state.room,
  antesDeSair: () => {
    liberarSaida();
    controle.desligarJogo();
  },
}) : null;
if (naTv) {
  $('#focus-tv').hidden = false;
  $('#focus-tv').addEventListener('click', () => naTv.abrir());
}
// o título da tela traz o nome do jogo que está nela (ver onQual): os botões são os dele
controle.onJogo = (video, key) => {
  if (video) padVirtual.ligar(key);
  if (video && isTouch) toqueJogo.mostrar(key, acharTela(key)?.share.titulo);
  else toqueJogo.esconder();
  if (video) fisico.ligar(key, acharTela(key)?.share.titulo);
  else fisico.desligar();
  // jogo de controle no PC (o celular faz isso no toque-jogo): o controle virtual já aparece lá, e o
  // teclado e o mouse daqui viram esse controle (o emulador e o chiaki-ng não escutam mouse)
  const layoutPc = video && !isTouch ? layoutDoTitulo(acharTela(key)?.share.titulo) : null;
  if (layoutPc === 'ps5') touchpad.ligar().then(atualizarBotaoTouchpad);
  else touchpad.desligar();
  atualizarBotaoTouchpad();
  if (layoutPc && LAYOUTS[layoutPc]?.virtual) {
    padVirtual.acordar();
    tecladoPad.ligar(layoutPc);
  } else tecladoPad.desligar();
  mostrarLegendaJogo(layoutPc && LAYOUTS[layoutPc]?.virtual ? layoutPc : null);
  if (!video) mapaPainel.fechar();
  if (!video) padVirtual.desligar(); // depois do toque e do controle: o último estado é tudo solto
  // o modo jogo desligou por fora do botão (a tela fechou, saiu do foco): sai da tela cheia também
  if (!video && !isTouch && document.body.classList.contains('jogo-pc')) jogoNoPc(false);
  if (!video && losslessLigado) alternarLossless();
  // a própria tela (PS5 direto): a imagem já é daqui, sem turbo nem diagnóstico de quem joga longe
  jogoLa(video && !acharTela(key)?.user.isSelf ? video : null, key);
  placaNoJogo(!!video);
};
// Celular no modo jogo: o 3D sai da memória da placa enquanto o jogo cobre a tela (World.liberarPlaca)
// e volta ao sair. No iPhone a memória da placa é a da página: 3D + vídeo do jogo derrubavam a aba.
// Espera um pouco antes de soltar: entrar e sair na hora (toque sem querer) não paga a recompilação.
let soltarPlaca = 0;
function placaNoJogo(jogando) {
  clearTimeout(soltarPlaca);
  if (!isTouch) return;
  if (!jogando) return void world.devolverPlaca();
  soltarPlaca = setTimeout(() => {
    if (controle.jogoNo && state.focus?.kind === 'share' && world.liberarPlaca()) diagJogo.marcar('3D solto da placa enquanto joga (celular)');
  }, 1500);
}
// Sem a legenda dos botões no canto nem o quadro do modo carro (desde 2026-11-27, como no /jogar): no teclado as
// teclas aparecem em cima dos avisos do próprio jogo. layout: o do jogo no PC (null: fora do modo jogo).
let layoutLegenda = null;
let noCarro = false; // o modo carro do teclado (teclado-pad.js)
function mostrarLegendaJogo(layout) {
  layoutLegenda = layout;
  const noTeclado = !!layout && !isTouch && !fisico.pad() && !touchpad.ligado;
  avisosBotoes.ligar(noTeclado && layout === 'ps5' && opcoesJogo.get('avisos'));
}
mapaTeclas.ouvir(() => { if (layoutLegenda) mostrarLegendaJogo(layoutLegenda); });
for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (layoutLegenda) mostrarLegendaJogo(layoutLegenda); });
opcoesJogo.ouvir((k) => { if (k === 'avisos' && layoutLegenda) mostrarLegendaJogo(layoutLegenda); });
// a aba sumiu (celular bloqueou, outro app): o que o toque e o controle seguravam sobe já
controle.onEscondeu = () => {
  toqueJogo.soltarTudo();
  fisico.soltarTudo();
  tecladoPad.soltarTudo();
};
// o jogo mostrou ou escondeu o cursor: no celular, os botões de menu entram e saem sozinhos
controle.onCursorLivre = (livre) => toqueJogo.cursorDoJogo(livre);

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
  ['velha', 'Jogo da velha 2', 'Nove velhinhas numa velha só'],
  ['dados', 'Mesa de dados', 'Apostas com moedas'],
  ['poderes', 'Poderes', 'Voar e pulo alto'],
  ['armas', 'Arma da camiseta 22', ''],
  ['criador', 'Criador por voz', 'Segure N e fale: a frase vira arma, no mapa todo'],
  ['pingue', 'Pingue-pongue', 'Salão de jogos do parque; sozinho, contra o robô'],
  ['queimada', 'Queimada', 'Times Azul × Vermelho, com cemitério'],
  ['sinuca', 'Sinuca', 'Bola 8 no salão de jogos, até dois por mesa'],
  ['golfe', 'Minigolfe', '9 buracos com moinho, morros e água'],
  ['truco', 'Truco', 'Truco mineiro em duplas, com os gritos e robôs'],
  ['uno', 'Uno', 'Até 6 na mesa, com robôs'],
  ['vinteum', '21', 'Duelo de 21 com trunfos: conte as cartas, aposte dedos'],
  ['cacheta', 'Cacheta', '2 baralhos, 9 cartas e o curinga do vira, com robôs'],
  ['poker', 'Poker', "Texas Hold'em apostando as moedas, com robôs"],
  ['gincana', 'Gincana', '10 fases estilo Fall Guys e a final dos hexágonos'],
  ['fantasmas', 'Caça-Fantasmas', '12 monstros em 5 casas assombradas, como o Phasmophobia'],
  ['kart', 'Kart', 'Kartódromo com itens, 3 voltas'],
  ['pinta', 'Pinta-território', 'Times pintam o chão com tinta'],
  ['tapa', 'Tapa', 'Y dá um tapa em quem está na frente (não tira vida)'],
  ['tiro', 'Tiro na mesa de cartas', 'De brincadeira: derruba da cadeira, não tira vida'],
];
const AREAS_DE_JOGO = ['parkour', 'ringue', 'corrida', 'futebol', 'volei', 'basquete', 'boliche', 'surf', 'matamata', 'batalha', 'xadrez', 'dama', 'velha', 'dados', 'pingue', 'queimada', 'sinuca', 'golfe', 'cartas', 'poker', 'gincana', 'fantasmas', 'kart', 'pinta'];
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
// Quem entrou como dono ou gestor continua sendo neste aparelho (fechar a aba, recarregar, trocar de
// mapa, queda da conexão): o que fica guardado, por sala, é o passe que o servidor devolve, nunca a
// senha. Trocar a senha vence os passes; "Sair do modo empresa neste aparelho" apaga os daqui.
const CHAVE_PAPEIS = 'sala3d-papeis';
let papeis = {}; // { sala: { dono, gestor } }; só na memória se o navegador não deixa guardar
function lerPapeis() {
  try {
    const guardado = localStorage.getItem(CHAVE_PAPEIS);
    if (guardado) papeis = JSON.parse(guardado) || {};
  } catch { /* sem armazenamento */ }
  return papeis;
}
const passeDoPapel = (papel) => lerPapeis()[state.room]?.[papel] || null;
function guardarPapel(sala, papel, passe) {
  lerPapeis();
  papeis[sala] = { ...papeis[sala], [papel]: passe || undefined };
  if (!papeis[sala].dono && !papeis[sala].gestor) delete papeis[sala];
  try { localStorage.setItem(CHAVE_PAPEIS, JSON.stringify(papeis)); } catch { /* modo privado */ }
}
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

// A sala usa outro mapa que o montado nesta página (mapas-dados.js): recarrega já entrando nela, com
// o mapa certo. Acontece na primeira visita a uma sala de outro mapa e quando o dono troca o mapa
// com gente dentro.
function mapaDaSala(cfg) {
  const mapa = MAPAS[cfg.mapa] ? cfg.mapa : MAPA_DA_PAGINA;
  if (!state.room) return false;
  lembrarMapa(state.room, mapa);
  if (mapa === MAPA_DA_PAGINA) return false;
  toast(`Indo para o mapa ${MAPAS[mapa].nome}…`, 'info', 6000);
  recarregarNaSala(state.room, mapa);
  return true;
}

function aplicarSala(cfg) {
  if (!cfg) return;
  if (mapaDaSala(cfg)) return;
  state.sala = cfg;
  aplicarLogo(cfg.logo || '');
  if (state.room) salas.visitar(state.room, { empresa: cfg.empresa, temSenha: cfg.temSenha });
  let mudou = false;
  // as mesas de cartas são uma área só, ligada se o truco, o uno, o 21 ou a cacheta estiver
  for (const j of AREAS_DE_JOGO) mudou = world.ligarArea(j, j === 'cartas' ? jogoLigado('truco') || jogoLigado('uno') || jogoLigado('vinteum') || jogoLigado('cacheta') : jogoLigado(j)) || mudou;
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
  // o botão dos jogos do PC é só do dono
  $('#btn-pc-jogos').hidden = !state.donoDaSala;
  const cfg = state.sala;
  if (!cfg) return;
  const amb = modoEscritorio()
    ? { nome: `Escritório (${cfg.departamentos.map((d) => DEPARTAMENTOS[d].nome).join(', ')})` }
    : MODOS[0];
  const desligados = JOGOS_DA_SALA.filter(([j]) => !jogoLigado(j)).length;
  $('#sala-resumo').innerHTML = `<div class="sala-chip">${icon('predio', 18)}<span>
    <b>${esc(cfg.empresa || 'Sem nome de empresa')}</b>
    <small>Mapa: ${esc((MAPAS[cfg.mapa] || MAPAS[MAPA_DA_PAGINA]).nome)} · Ambiente: ${esc(amb.nome)} · ${desligados ? `${desligados} ${desligados === 1 ? 'jogo desligado' : 'jogos desligados'}` : 'todos os jogos ligados'}${cfg.temSenha ? ' · com senha' : ''}${modoEscritorio() && cfg.privacidade !== false ? ' · salas à prova de som' : ''}</small>
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
  $('#sala-sair').hidden = !state.donoDaSala && !souGestor();
  $('#chat-input').placeholder = state.donoDaSala ? 'Mensagem, /pix para dar moedas ou /tela' : 'Mensagem para todos';
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
  const lanCfg = cfg.lanhouse || { ligada: false, abre: 8, fecha: 24 };
  f.lanLigada.checked = !!lanCfg.ligada;
  f.lanAbre.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === lanCfg.abre ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  f.lanFecha.innerHTML = Array.from({ length: 24 }, (_, i) => i + 1).map((h) => `<option value="${h}"${h === lanCfg.fecha ? ' selected' : ''}>${h === 24 ? '00:00 (meia-noite)' : `${String(h).padStart(2, '0')}:00`}</option>`).join('');
  $('#sala-mapas').innerHTML = Object.entries(MAPAS).map(([id, m]) => `<label class="modulo mapa-op" style="--c:${m.cor}">
      <input type="radio" name="mapa" value="${id}"${(cfg.mapa || MAPA_DA_PAGINA) === id ? ' checked' : ''}>
      <b>${m.nome}</b><small>${m.desc}</small>
    </label>`).join('');
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
    $('#onde-chip').dataset.tip = fechada ? 'Sala à prova de som: só quem está aqui ouve a conversa' : 'Onde você está no escritório';
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
    guardarPapel(state.room, 'gestor', r.passe);
    form.reset();
    toast('Você entrou como gestor: vai ver a equipe aqui e receber os alertas.', 'success', 6000);
  });
});
function reentrarComoGestor() {
  const sala = state.room;
  const passe = passeDoPapel('gestor');
  if (!passe) return;
  socket.emit('sala-gestor', { passe }, (r) => { if (r?.vencido) guardarPapel(sala, 'gestor', null); });
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

// ----- lan house (lanhouse.js no servidor, /lan para reservar): na sala com ela ligada, só quem tem
// o horário pago agora joga. O login feito em /lan fica guardado aqui e vai junto ao entrar.
const LAN_CHAVE = 'sala3d-lan';
const tokenLan = () => {
  try { return JSON.parse(localStorage.getItem(LAN_CHAVE) || 'null')?.token || null; } catch { return null; }
};
function entrarLan() {
  const token = tokenLan();
  if (!token) return;
  socket.emit('lan-entrar', { token }, (r) => {
    if (r?.erro === 'login') try { localStorage.removeItem(LAN_CHAVE); } catch { /* sem storage */ }
    state.lanConta = r?.conta || null;
    if (r?.lan) aplicarLan(r.lan);
  });
}
const MAQUINAS_LAN = { pc: 'PC', ps5: 'PS5' };
// a tela do PS5 direto é o PS5; o resto (janela, tela inteira, aba) é o PC
const maquinaDaTela = (sh) => (sh?.ps5 || sh?.superficie === 'ps5' || sh?.titulo === 'PS5' ? 'ps5' : 'pc');
const idsDaVez = (m) => state.lan?.[m]?.ids || [];
// lan house: a máquina sem ninguém alugado na hora fica livre, mas só para o teste grátis: 2 min por
// pessoa, uma vez (conta e IP, ver lanhouse.js teste). Quem já usou o seu não joga mais de graça.
const lanLivre = (m) => !state.lan?.[m]?.conta;
const semTesteLan = (id) => !!state.lan?.semTeste?.includes(id);
// a fila da vez (fila-lan.js): com gente na fila e a máquina livre, só joga quem o servidor pôs em livres
const livreNaFilaLan = (m, id) => !state.lan?.fila?.[m]?.livres || state.lan.fila[m].livres.includes(id);
const podeJogarLan = (m, id) => !state.lan || idsDaVez(m).includes(id) || (lanLivre(m) && !semTesteLan(id) && livreNaFilaLan(m, id));
// A máquina está alugada para outra pessoa e eu não sou da vez: só assisto (o mesmo do /jogar). No "até alguém
// novo", quem ainda tem o teste grátis não entra aqui: em segundos a vez é dela.
// a máquina da tela em foco, se eu estou só assistindo a vez de outra pessoa nela
function assistindoLan() {
  const t = state.focus?.kind === 'share' ? acharTela(state.focus.key) : null;
  return t && !t.user.isSelf && soVerLan(t.share) ? maquinaDaTela(t.share) : null;
}
function soVerLan(sh) {
  if (!state.lan || !sh) return false;
  const m = maquinaDaTela(sh);
  const v = state.lan[m];
  if (!v?.conta || idsDaVez(m).includes(state.selfId)) return false;
  return !v.aberta || semTesteLan(state.selfId);
}
// Quem compartilha a tela: o primeiro comando de quem joga de graça numa máquina livre começa os 2
// min dessa pessoa no servidor (os comandos vêm direto, pelo WebRTC, e ele não os vê).
const pediuTesteLan = new Map(); // id -> quando avisou
function avisarTesteLan(id, key) {
  if (state.lan?.teste?.[id] || Date.now() - (pediuTesteLan.get(id) || 0) < 3000) return;
  pediuTesteLan.set(id, Date.now());
  socket?.emit('lan-teste', { id, key });
}
// Só jogar de verdade começa o teste (o mesmo do servidor, contaNoTesteLan): entrar no modo jogo, o "ainda
// estou aqui" (a cada 0,5 s) e o controle todo solto não
function contaNoTesteLan(ev) {
  if (!ev || ev.t === 'modo' || ev.t === 'vivo') return false;
  if (ev.t === 'pad') return !!(ev.b || ev.tp || ev.m || ['lx', 'ly', 'rx', 'ry', 'lt', 'rt'].some((k) => ev[k]));
  return true;
}
// Quem joga de graça: enquanto o diagnóstico (teste da conexão) está na tela, nada
// vai ao jogo, e os 2 min só começam quando terminam ou são pulados
function seguraNoPreparo(key, ev) {
  if (!state.lan || state.lan.teste?.[state.selfId] || ev?.t === 'modo' || ev?.t === 'vivo') return false;
  if (!testeJoga.testando) return false;
  const dono = String(key).split('~')[0];
  if (dono === state.selfId) return false;
  const sh = state.users.get(dono)?.shares.get(key);
  return !!sh && lanLivre(maquinaDaTela(sh)) && !idsDaVez(maquinaDaTela(sh)).includes(state.selfId);
}
// Quem joga: o teste grátis acabou e a máquina continua livre (sem ser a minha vez): o comando não
// sai, e abre o aluguel.
function barradoNoTesteLan(key) {
  if (!state.lan || !semTesteLan(state.selfId)) return false;
  const dono = String(key).split('~')[0];
  if (dono === state.selfId) return false;
  const sh = state.users.get(dono)?.shares.get(key);
  if (!sh) return false;
  const m = maquinaDaTela(sh);
  return lanLivre(m) && !idsDaVez(m).includes(state.selfId);
}
// o teste acabou: sai do modo jogo e da tela cheia (o PC e o PS5 continuam abertos para quem alugar)
let tirandoDoJogo = false; // desligar o modo jogo manda comandos (soltar tudo), que voltam aqui
function tirarDoJogoLan() {
  if (tirandoDoJogo) return;
  tirandoDoJogo = true;
  try {
    if (controle.jogo) {
      controle.desligarJogo();
      updateFocusCtrl();
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (document.body.classList.contains('jogo-pc')) jogoNoPc(false);
  } finally {
    tirandoDoJogo = false;
  }
}
let pediuAluguelEm = 0;
function pedirAluguelTeste() {
  tirarDoJogoLan();
  if (!$('#lan-modal').hidden || Date.now() - pediuAluguelEm < 10_000) return;
  pediuAluguelEm = Date.now();
  toast('Seu teste grátis já foi usado. Para jogar, alugue o PC ou o PS5.', 'warn', 6000);
  abrirAluguel();
}
let meuTesteLan = null; // o fim dos meus 2 min (correndo), para avisar no começo e no fim
const minhasMaquinas = () => Object.keys(MAQUINAS_LAN).filter((m) => idsDaVez(m).includes(state.selfId));
let lanEraMinha = new Set();
let lanEraAberta = new Set(); // as minhas que eram "até alguém novo" (o fim delas avisa pelo 'lan-novo')
const horaCurta = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// quanto falta para o fim da vez, pelo relógio do servidor (dif: a hora de lá menos a daqui)
let lanDif = 0;
const avisouFimLan = new Set(); // "pc|fim|5": o aviso de 5 min (e o de 1 min) só uma vez por vez
function faltaLan(fim) {
  const s = Math.max(0, Math.round((fim - (Date.now() + lanDif)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return { s, texto: h ? `${h}h${String(m).padStart(2, '0')}min` : `${m}:${ss}` };
}
function textoVezLan(m) {
  const v = state.lan?.[m];
  if (!v?.conta) {
    const fimTeste = state.lan?.teste?.[state.selfId];
    if (fimTeste) {
      const t = faltaLan(fimTeste);
      return { texto: `Teste grátis no ${MAQUINAS_LAN[m]} · faltam ${t.texto}`, minha: true, acabando: t.s <= 30, s: t.s, teste: true };
    }
    if (semTesteLan(state.selfId)) return { texto: `${MAQUINAS_LAN[m]} livre · alugue para jogar`, livre: true };
    return { texto: `${MAQUINAS_LAN[m]} livre · 2 min grátis`, livre: true };
  }
  const minha = idsDaVez(m).includes(state.selfId);
  // liberado até alguém novo entrar: sem fim
  if (v.aberta) return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${MAQUINAS_LAN[m]} · até alguém novo chegar`, minha };
  const f = faltaLan(v.fim);
  // o PC sendo preparado (o jogo abrindo) no minuto antes da vez: conta até a vez começar
  if (v.preparando && v.inicio) {
    const c = faltaLan(v.inicio);
    if (c.s > 0) return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${MAQUINAS_LAN[m]} começa em ${c.texto} · preparando o PC`, minha, s: f.s };
  }
  return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${MAQUINAS_LAN[m]} · faltam ${f.texto}`, minha, acabando: f.s <= 300, s: f.s };
}
// De quem é a vez e quanto falta: no topo da sala (as duas máquinas) e por cima da tela aberta do PC
// ou do PS5. Quem está jogando recebe aviso a 5 min e a 1 min do fim.
function mostrarVezLan() {
  for (const m of Object.keys(MAQUINAS_LAN)) {
    const el = $(`#lan-vez-${m}`);
    if (!el) continue;
    el.hidden = !state.lan;
    if (!state.lan) continue;
    const v = textoVezLan(m);
    el.textContent = v.texto;
    el.classList.toggle('minha', !!v.minha);
    el.classList.toggle('livre', !!v.livre);
    el.classList.toggle('acabando', !!v.acabando);
    if (v.minha && !v.teste) {
      const fim = state.lan[m].fim;
      for (const lim of [300, 60]) {
        const k = `${m}|${fim}|${lim}`;
        if (v.s <= lim && v.s > 0 && !avisouFimLan.has(k)) {
          avisouFimLan.add(k);
          toast(`Falta${lim === 60 ? '' : 'm'} ${lim / 60} min do seu horário no ${MAQUINAS_LAN[m]}. Para continuar, toque em "Alugar PC ou PS5".`, 'warn', 8000);
        }
      }
    }
  }
  const foco = $('#lan-vez-foco');
  if (!foco) return;
  const k = state.focus?.kind === 'share' ? state.focus.key : null;
  const sh = k ? state.users.get(k.split('~')[0])?.shares.get(k) : null;
  // só nas telas que se jogam (com o controle liberado, ou a do PS5)
  const vale = state.lan && sh && (sh.controle || maquinaDaTela(sh) === 'ps5');
  foco.hidden = !vale;
  if (!vale) return;
  const v = textoVezLan(maquinaDaTela(sh));
  foco.textContent = v.texto;
  foco.classList.toggle('minha', !!v.minha);
  foco.classList.toggle('acabando', !!v.acabando);
}
setInterval(() => { if (state.lan || !$('#lan-vez-foco')?.hidden) mostrarVezLan(); }, 1000);
function aplicarLan(e) {
  const assistia = assistindoLan(); // a máquina que eu assistia sem ser a minha vez
  const vezQueAssistia = assistia ? state.lan[assistia].conta : null;
  state.lan = e?.ligada ? e : null;
  if (assistia && state.lan && lanLivre(assistia)) acabouVezAssistindo(assistia, vezQueAssistia);
  if (typeof e?.agora === 'number') lanDif = e.agora - Date.now();
  // a vez mudou: quem jogava numa tela minha e não pode mais (a hora passou, ou alguém alugou a
  // máquina que estava livre) sai do modo jogo deste PC (a sala volta a ser desenhada normalmente)
  for (const sh of self()?.shares.values() || []) {
    if (!sh.controle) continue;
    for (const id of [...(jogandoAqui.get(sh.key)?.keys() || [])]) {
      if (!podeJogarLan(maquinaDaTela(sh), id)) controle.receber(sh, { ev: { t: 'modo', jogo: false }, deId: id });
    }
  }
  const agora = new Set(minhasMaquinas());
  for (const m of agora) {
    if (lanEraMinha.has(m)) continue;
    const v = state.lan[m];
    if (v.aberta) {
      toast(`O ${MAQUINAS_LAN[m]} foi liberado para você até alguém novo chegar para testar. Bom jogo!`, 'success', 8000);
      continue;
    }
    toast(v.preparando
      ? `Seu horário no ${MAQUINAS_LAN[m]} começa às ${horaCurta(v.inicio)}: o ${MAQUINAS_LAN[m]} já está sendo preparado e você já pode entrar. Joga até ${horaCurta(v.fim)}.`
      : `Seu horário no ${MAQUINAS_LAN[m]} começou: você joga até ${horaCurta(v.fim)}. Bom jogo!`, 'success', 8000);
  }
  for (const m of lanEraMinha) if (!agora.has(m) && !lanEraAberta.has(m)) toast(lanLivre(m) ? `Seu horário no ${MAQUINAS_LAN[m]} acabou. Ninguém alugou a próxima hora: a tela fica livre para todos.` : `Seu horário no ${MAQUINAS_LAN[m]} acabou. Para jogar mais, toque em "Alugar PC ou PS5".`, 'info', 10000);
  lanEraMinha = agora;
  lanEraAberta = new Set([...agora].filter((m) => state.lan[m]?.aberta));
  // o meu teste grátis: começou (primeiro comando ao jogo) ou acabou (abre o aluguel)
  const fimTeste = state.lan?.teste?.[state.selfId] || null;
  if (fimTeste && !meuTesteLan) toast('Teste grátis: você tem 2 minutos para jogar. Depois, para continuar, é só alugar o PC ou o PS5.', 'info', 7000);
  if (meuTesteLan && !fimTeste && semTesteLan(state.selfId)) {
    pediuAluguelEm = Date.now();
    toast('Seu teste grátis de 2 minutos acabou. Para continuar jogando, alugue o PC ou o PS5.', 'warn', 10000);
    tirarDoJogoLan();
    abrirAluguel();
  }
  meuTesteLan = fimTeste;
  mostrarLan();
  mostrarVezLan();
  conferirSomSemDublagem();
  updateFocusCtrl(); // alugou ou acabou a vez: o "Modo jogo" vira "Tela cheia" para quem só assiste (e volta)
}
// o botão "Alugar PC ou PS5" no topo, à esquerda: só com a lan house ligada (o começo e o fim da
// vez de cada um chegam como aviso, ver aplicarLan)
function mostrarLan() {
  $('#lan-reservar').hidden = !state.lan;
  $('.lan-sep').hidden = !state.lan;
}
// a reserva (/lan) abre numa janela dentro da sala; o pagamento abre numa aba nova
// pedido: { maquina, dia, inicio } — a página do aluguel já abre nessa máquina, com essa hora escolhida
function abrirAluguel(pedido = null) {
  if (document.pointerLockElement) document.exitPointerLock();
  const extra = pedido?.maquina ? `&maquina=${pedido.maquina}${pedido.agora ? '&agora=1' : pedido.dia ? `&dia=${pedido.dia}&hora=${pedido.inicio}` : ''}` : '';
  $('#lan-frame').src = `/lan?sala=${encodeURIComponent(state.room || '')}&embed=1${extra}`;
  $('#lan-modal').hidden = false;
}
function fecharAluguel() {
  $('#lan-modal').hidden = true;
  $('#lan-frame').src = 'about:blank';
}
// dono: libera tempo de graça para uma conta (sem Stripe); começa a contar quando a pessoa entra
$('#lan-liberar').addEventListener('click', () => {
  const f = $('#sala-config').elements;
  const conta = f.lanLiberarConta.value.trim();
  if (!conta) return toast('Escreva o nome da conta.', 'error');
  // "2m": teste de 2 minutos (a vez começa e acaba sem esperar a hora cheia)
  // "novo": sem fim, até entrar alguém que ainda tem o teste grátis (lanhouse.js chegouNovo)
  const v = f.lanLiberarHoras.value;
  const ateNovo = v === 'novo';
  const minutos = /m$/.test(v) ? parseInt(v, 10) : 0;
  const maquina = f.lanLiberarMaquina.value;
  const jogo = maquina === 'pc' ? f.lanLiberarJogo.value : '';
  socket.emit('lan-liberar', { conta, maquina, horas: minutos || ateNovo ? 0 : Number(v), minutos, jogo, ateNovo }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para liberar.', 'error');
    const comJogo = r.jogoNome ? `, com ${r.jogoNome}` : '';
    if (r.ateNovo) return toast(`${r.maquina} liberado para ${r.conta}${comJogo} até alguém novo entrar para testar. ${r.comecou ? 'Já está na sala: começou agora.' : 'Começa quando a pessoa entrar.'}`, 'success', 8000);
    const t = r.minutosTotal;
    const tempo = t % 60 ? `${t} minutos` : `${t / 60} hora${t > 60 ? 's' : ''}`;
    // o tempo só começa a contar quando a pessoa entra (lanhouse.js comecarLiberadas)
    toast(`${r.maquina} liberado para ${r.conta}: ${tempo}${comJogo}. ${r.comecou ? 'Já está na sala: começou agora.' : 'Começa a contar quando a pessoa entrar.'}`, 'success', 7000);
  });
});
// a lista de jogos do PC da casa no "Jogo (PC)" do Liberar: carrega ao abrir a lista
async function carregarJogosLiberar() {
  const sel = $('#sala-config').elements.lanLiberarJogo;
  try {
    const r = await fetch('/lan/jogos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sala: state.room }) }).then((x) => x.json());
    const antes = sel.value;
    sel.innerHTML = '<option value="">Nenhum: só a tela do PC</option>'
      + (r.jogos || []).map((j) => `<option value="${esc(j.id)}">${esc(j.nome)}</option>`).join('');
    sel.value = antes;
  } catch { /* fica a lista que já tinha */ }
}
$('#sala-config').elements.lanLiberarJogo.addEventListener('focus', carregarJogosLiberar);
// dono: encerra a vez de agora na máquina escolhida acima (a máquina fica livre e sai da sala)
$('#lan-encerrar').addEventListener('click', () => {
  const f = $('#sala-config').elements;
  socket.emit('lan-encerrar', { maquina: f.lanLiberarMaquina.value }, (r) => {
    if (!r?.ok) return toast(r?.erro || 'Não deu para encerrar.', 'error');
    toast(`Vez de ${r.conta} no ${r.maquina} encerrada: a máquina ficou livre.`, 'success');
  });
});
$('#lan-reservar').addEventListener('click', abrirAluguel);
$('#lan-modal-fechar').addEventListener('click', fecharAluguel);
// o lan.html avisa a altura do conteúdo: a janela cresce e encolhe junto (passou do limite, rola por dentro)
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.tipo !== 'lan-altura') return;
  const fr = $('#lan-frame');
  if (e.source !== fr.contentWindow) return;
  fr.style.height = `${Math.max(120, Number(e.data.altura) || 0)}px`;
});
$('#lan-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) fecharAluguel(); });

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

// ------------------------------------------------------------------ mapa
// O mapa da tela (mapa.js): botão na barra ou L. Tocar numa área (ou num jogo do parque) leva até ela.
const jogosDoParqueLigados = () => jogosDoParque.filter((j) => j.lugar && (j.algumLigado ? j.algumLigado() : jogoLigado(j.id)));
const mapaTela = new MapaTela({
  posicao: () => ({ x: player.pos.x, z: player.pos.z, yaw: player.yaw }),
  pessoas: () => [...state.users.values()].filter((u) => !u.isSelf && u.avatar).map((u) => ({ x: u.avatar.group.position.x, z: u.avatar.group.position.z })),
  jogosDoParque: () => jogosDoParqueLigados().filter((j) => !AREAS[j.id]).map((j) => {
    const l = j.lugar();
    return { id: j.id, nome: l.nome, desc: l.desc, cor: l.cor };
  }),
  ir: (id) => irParaArea(id),
});
function abrirMapa() {
  if (!state.joined) return;
  if (document.pointerLockElement) document.exitPointerLock();
  mapaTela.alternar();
}
$('#btn-mapa').addEventListener('click', abrirMapa);
// o lago congelado (Vila da Neve): em cima dele o boneco escorrega (player.js)
function naPistaDeGelo(p) {
  const g = world.natureza?.gelo;
  return !!g && p.y < 0.5 && Math.hypot(p.x - g.x, p.z - g.z) < g.raioAgua;
}

function irParaArea(id) {
  const jogo = jogosDoParque.find((j) => j.id === id);
  const alvo = id === 'predio' ? world.entrada() : jogo ? jogo.lugar() : AREAS[id]?.ir;
  if (!alvo || !state.joined) return;
  sairDoJogo(); // futebol, céu, gincana... saem antes de ir
  run.abandon();
  if (player.veiculo) toggleVeiculo();
  exitFocus();
  if (state.panel) closePanel();
  player.teleport([alvo.pos[0] + (Math.random() - 0.5) * 1.2, alvo.pos[1] ?? 0, alvo.pos[2] + (Math.random() - 0.5) * 1.2], alvo.yaw);
  sfx.teleport();
}

// ------------------------------------------------------------------ parque
// "Ir para" de cada jogo do parque (o parque fica longe da entrada): cada jogo diz onde se começa
// (lugar()) e com que nome
function renderParque() {
  const lista = jogosDoParqueLigados();
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

// entrou na sala (ou a conexão caiu e voltou): prova que é dono com o passe guardado neste aparelho
function reentrarComoDono() {
  state.donoDaSala = false;
  reentrarComoGestor();
  const sala = state.room;
  const passe = passeDoPapel('dono');
  if (!passe) return renderSala();
  socket.emit('sala-entrar', { passe }, (r) => {
    if (r?.vencido) {
      guardarPapel(sala, 'dono', null);
      toast('A senha de dono desta sala mudou. Entre de novo com a nova.', 'warn', 7000);
    }
    if (state.room !== sala) return;
    state.donoDaSala = !!r?.ok;
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
    guardarPapel(state.room, 'dono', r.passe);
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
    guardarPapel(state.room, 'dono', r.passe);
    state.donoDaSala = true;
    form.reset();
    formSujo = false;
    renderSala();
  });
});

// deixa de ser dono e gestor e esquece este aparelho (PC que outra pessoa também usa)
$('#sala-sair').addEventListener('click', () => {
  const sala = state.room;
  socket.emit('sala-sair', null, (r) => {
    if (!r?.ok) return toast('Não deu para sair agora. Tente de novo.', 'error');
    guardarPapel(sala, 'dono', null);
    guardarPapel(sala, 'gestor', null);
    state.donoDaSala = false;
    formSujo = false;
    renderSala();
    toast('Pronto: este aparelho não entra mais sozinho no modo empresa.', 'success', 5000);
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
    mapa: form.querySelector('[name="mapa"]:checked')?.value || MAPA_DA_PAGINA,
    departamentos: $$('#sala-deptos input:checked').map((i) => i.value),
    jogos: Object.fromEntries($$('#sala-jogos input').map((i) => [i.value, i.checked])),
    placar: lerPlacar(),
    paginas: lerPaginas(),
    aviso: form.elements.aviso.value.trim(),
    ...(logoNovo !== undefined ? { logo: logoNovo } : {}),
    privacidade: form.elements.privacidade.checked,
    listada: form.elements.listada.checked,
    lanhouse: {
      ligada: form.elements.lanLigada.checked,
      abre: Number(form.elements.lanAbre.value),
      fecha: Number(form.elements.lanFecha.value),
    },
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
    guardarPapel(state.room, 'dono', r.passe);
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
  // Ctrl+Alt+S (o atalho do Lossless): com o Lossless aberto ele nem chega aqui (o Lossless pega o S);
  // chegando, o Lossless está fechado ou com outro atalho, e o ajudante confere e avisa — não vai pro jogo
  if (e.code === 'KeyS' && e.ctrlKey && e.altKey && controle.jogoNo && !isTouch) {
    if (a === 'down' && !e.repeat) alternarLossless();
    return true;
  }
  // F9: "engasgou agora" (marca no relatório do modo jogo)
  if (e.code === 'F9' && jogandoLa) {
    if (a === 'down' && !e.repeat) marcarEngasgo();
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
  // mesmo id e outro objeto: a conexão foi refeita (rtc.refazer) e o stream antigo morreu
  if (u.streams.get(stream.id) !== stream) {
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
        // a conexão foi refeita com a tela em foco: o foco também mostra o stream novo
        const fv = $('#focus-video');
        if (state.focus?.kind === 'share' && state.focus.key === sh.key && fv.srcObject && fv.srcObject !== st) {
          fv.srcObject = st;
          fv.play().catch(() => {});
        }
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
let hudDaMesa = false; // quem escondeu foi o sentar numa mesa (e não o H): levantando, volta
function alternarHud() {
  hudDaMesa = false;
  const sem = document.body.classList.toggle('sem-hud');
  if (sem) toast(isTouch ? 'Interface escondida. Toque no olho para mostrar de novo.' : 'Interface escondida. Aperte H para mostrar de novo.', 'info', 2500);
}

// Sentado numa mesa (cartas, poker, tabuleiros, dados, sinuca), a interface da sala some sozinha,
// como no H; o painel do jogo fica. Levantando, ela volta — a não ser que o H já a tivesse escondido
// antes. No celular a barra de cima fica só com o microfone (body.mesa-limpa): lá não há H.
const FOCOS_DE_MESA = ['cartas', 'poker', 'jogo', 'dados', 'sinuca'];
let sentadoNaMesa = false;
let avisouHudDaMesa = false;
function hudAoSentar() {
  // na sinuca a vez vai e volta (a mira entra e sai do foco): conta enquanto estiver na mesa
  const sentado = FOCOS_DE_MESA.includes(state.focus?.kind) || sinuca.ativo();
  if (sentado === sentadoNaMesa) return;
  sentadoNaMesa = sentado;
  document.body.classList.toggle('mesa-limpa', sentado);
  if (sentado && !document.body.classList.contains('sem-hud')) {
    document.body.classList.add('sem-hud');
    hudDaMesa = true;
    if (!isTouch && !avisouHudDaMesa) {
      avisouHudDaMesa = true;
      toast('Interface escondida enquanto joga. Aperte H para mostrar.', 'info', 3000);
    }
  } else if (!sentado && hudDaMesa) {
    document.body.classList.remove('sem-hud');
    hudDaMesa = false;
  }
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
  // (passando para o TURN ou voltando dele a imagem some por uns 2 s: o jogo não sai por isso)
  if (state.focus?.kind === 'share' && !shareVideo(acharTela(state.focus.key)?.share) && !(trocandoRota?.key === state.focus.key && performance.now() < trocandoRota.ate)) exitFocus();
  renderMainSources();
  mesa.atualizar();
}

// ------------------------------------------------------------------ voz separada por jogo
// Com o ajuste ligado, cada partida conversa à parte: quem está na mesa 2 do truco só ouve quem
// está nela, e quem não está em jogo nenhum só ouve quem também não está. Cada jogo diz em que
// partida a pessoa está (partida(id, posição)) pelo que já chega do servidor. Como a voz por
// proximidade, vale para o que eu ouço: a minha voz continua saindo para todos.
const partidas = new Map(); // id -> partida ('cartas1', 'kart'...); quem está fora de jogo não entra
function atualizarPartidas() {
  partidas.clear();
  if (!settings.porJogo) return;
  const comVoz = [...jogosDoParque, futebol, quadras, mataMata, batalha, jogos];
  for (const u of state.users.values()) {
    const p = posDe(u);
    for (const j of comVoz) {
      const partida = j.partida(u.id, p);
      if (partida) {
        partidas.set(u.id, partida);
        break;
      }
    }
  }
}
// ouço a voz dessa pessoa: mesma sala (escritório) e, com a voz separada por jogo, mesma partida
const ouco = (u) => mesmoAmbiente(u) && partidas.get(u.id) === partidas.get(state.selfId);

// com o celular travado, o pausar da tela de bloqueio cala a sala (ver 'ouvir com o celular travado')
const travado = { silencio: null, destravado: false, telas: new Map(), calado: false }; // telas: video -> { a, src }
function updateVolumes() {
  const me = self();
  atualizarPartidas();
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    if (u.audioEl) {
      let v = settings.voice / 100;
      // escritório com salas à prova de som (de um departamento para fora, ou para outro) e voz
      // separada por jogo (de uma partida para fora, ou para outra): ninguém ouve
      if (!ouco(u)) v = 0;
      if (settings.spatial && me) {
        const d = u.avatar.group.position.distanceTo(localAvatar.group.position);
        v *= THREE.MathUtils.clamp(1 - (d - 6) / 34, 0.1, 1);
      }
      u.audioEl.volume = THREE.MathUtils.clamp(v, 0, 1);
      // no iPhone o volume é só leitura (fica sempre 1): calar de verdade é pelo muted
      const mudo = v <= 0 || travado.calado;
      if (u.audioEl.muted !== mudo) {
        u.audioEl.muted = mudo;
        if (!mudo) tocarVoz(u);
      }
    }
    for (const sh of u.shares.values()) if (sh.video) sh.video.volume = settings.screen / 100;
  }
}

// alguém que eu ouço está falando agora (a música da sala abaixa para a voz passar)
function alguemFalando() {
  for (const u of state.users.values()) {
    if (!u.isSelf && u.avatar.speaking && u.audioEl && !u.audioEl.muted) return true;
  }
  return false;
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
  primarVoz(); // destrava o mp3 dos gritos no iOS/Android (valia o gesto antes do joined)
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
    if (!u.mic || !ouco(u) || settings.voice <= 0 || vozesBarradas.has(u.id)) {
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
    // 3 s de fala sem nenhum pacote: pede a voz de novo (e repete a cada 5 s enquanto faltar).
    // Dois pedidos não bastaram (13 s): refaz a conexão com ela do zero, o mesmo que sair e entrar
    // na sala (antes era o único jeito: a voz do amigo só chegava depois que ele saía e voltava).
    u.semVoz = (u.semVoz || 0) + 1;
    if (u.semVoz >= 3 && u.semVoz % 5 === 3) {
      if (n == null) routeStreams(u);
      if (u.semVoz >= 13 && rtc.refazer(u.id, `${u.name} fala e a voz não chega`)) {
        u.pacotesVoz = null;
      } else {
        console.warn(`[voz] ${u.name} está falando e a voz não chega: pedindo de novo`);
        rtc.pedirVoz(u.id);
      }
    }
  }
}
setInterval(vigiarVozes, 1000);

// ------------------------------------------------------------------ ouvir com o celular travado
// Travou o celular (ou trocou de app) com a sala aberta: continua ouvindo as vozes e o som das telas.
// 1) Um <audio> silencioso em loop com a Media Session: o Android põe o Chrome como "tocando mídia"
//    (notificação e controle na tela de bloqueio) e não congela a página; o iPhone mantém o áudio.
//    Ele é destravado no primeiro toque e só toca enquanto a sala está escondida.
// 2) O som das telas sai pelo <video>, que com a página escondida fica sem quadro (nível 'off') e
//    o celular pode pausar: enquanto escondida, a trilha de som vai para um <audio> só dela.
function audioDoSilencio() {
  if (travado.silencio) return travado.silencio;
  // 10 s de silêncio (WAV 8 kHz, 8 bits): menos de 5 s o Android não trata como mídia
  const n = 8000 * 10;
  const buf = new ArrayBuffer(44 + n);
  const d = new DataView(buf);
  const txt = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); d.setUint32(4, 36 + n, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true);
  txt(36, 'data'); d.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  const a = document.createElement('audio');
  a.loop = true;
  a.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  sink.appendChild(a);
  travado.silencio = a;
  return a;
}
// no toque: toca e pausa, para depois o play() em segundo plano não ser barrado (iPhone)
function destravarSilencio() {
  if (!isTouch || travado.destravado || !state.joined) return;
  travado.destravado = true;
  const a = audioDoSilencio();
  a.play().then(() => { if (!document.hidden) a.pause(); }).catch(() => { travado.destravado = false; });
}
function calarSala(calar) {
  travado.calado = calar;
  for (const u of state.users.values()) if (!u.isSelf && u.audioEl) u.audioEl.muted = calar || u.audioEl.volume <= 0;
  for (const { a } of travado.telas.values()) a.muted = calar;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = calar ? 'paused' : 'playing';
  if (!calar) updateVolumes();
}
function somDasTelasNoAudio(ligar) {
  if (!ligar) {
    for (const [v, { a }] of travado.telas) {
      a.pause();
      a.srcObject = null;
      a.remove();
      if (v.srcObject && !telasMudas.has(v)) {
        v.muted = false;
        v.play().catch(() => {});
      }
    }
    travado.telas.clear();
    return;
  }
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    for (const sh of u.shares.values()) {
      const v = sh.video;
      const src = v?.srcObject;
      const antes = travado.telas.get(v);
      if (antes?.src === src) {
        v.muted = true; // o routeStreams pode ter religado o som do vídeo
        continue;
      }
      if (antes) {
        antes.a.srcObject = null;
        antes.a.remove();
        travado.telas.delete(v);
      }
      const trilhas = src?.getAudioTracks?.() || [];
      if (!trilhas.length) continue;
      const a = document.createElement('audio');
      a.srcObject = new MediaStream(trilhas);
      a.volume = THREE.MathUtils.clamp(settings.screen / 100, 0, 1);
      a.muted = travado.calado;
      sink.appendChild(a);
      a.play().catch(() => {});
      v.muted = true;
      travado.telas.set(v, { a, src });
    }
  }
}
function salaEscondida() {
  if (!isTouch) return;
  const esconder = document.hidden && state.joined;
  if (esconder) {
    const a = audioDoSilencio();
    a.play().catch(() => {});
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: state.room && state.room !== 'principal' ? `Sala 3D · ${state.room}` : 'Sala 3D',
          artist: 'Ouvindo a sala',
          artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
        });
        navigator.mediaSession.playbackState = travado.calado ? 'paused' : 'playing';
        // o pausar da tela de bloqueio cala a sala (sem ele, o Chrome pausaria só o silêncio)
        navigator.mediaSession.setActionHandler('pause', () => calarSala(true));
        navigator.mediaSession.setActionHandler('play', () => calarSala(false));
      } catch { /* sem Media Session */ }
    }
    somDasTelasNoAudio(true);
  } else {
    travado.silencio?.pause();
    somDasTelasNoAudio(false);
    if (travado.calado) calarSala(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  }
}
document.addEventListener('visibilitychange', salaEscondida);
for (const ev of ['pointerdown', 'touchend']) document.addEventListener(ev, destravarSilencio, { capture: true, passive: true });
// com a sala escondida, uma tela nova (ou que voltou) também passa para o <audio>
setInterval(() => { if (isTouch && document.hidden && state.joined) somDasTelasNoAudio(true); }, 2000);

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

// resposta do servidor só para mim (o /pix): uma linha no chat, sem nome nem bolha no boneco
function addAviso(msg) {
  const list = $('#chat-list');
  list.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.className = 'aviso';
  li.innerHTML = `<div class="meta"><b style="--c:var(--accent)">Sala</b><time>${hhmm(msg.t)}</time></div><div class="text"></div>`;
  li.querySelector('.text').textContent = msg.text;
  list.appendChild(li);
  while (list.children.length > 200) list.firstElementChild.remove();
  if (state.panel === 'chat') list.scrollTop = list.scrollHeight;
  else toast(msg.text, 'info', 6000);
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  const criar = /^\/criar\b\s*(.*)$/i.exec(text);
  if (criar) {
    if (criar[1]) criador.pedir(criar[1]);
    else criador.abrirCatalogo();
  } else if (/^\/cat[aá]logo\b/i.test(text)) criador.abrirCatalogo();
  else if (/^\/tela(\s|$)/i.test(text)) comandoTela(text.slice(5).trim());
  else if (/^\/jogos\s*$/i.test(text)) pcJogos.abrir();
  else if (/^\/ps5\s*$/i.test(text)) ps5Nativo.abrir();
  else if (/^\/pc\s*$/i.test(text)) pcDireto.abrir();
  else if (text) socket.emit('chat', text);
  input.value = '';
  fecharSugestoes();
  input.blur();
});

// ------------------------------------------------------------------ /tela
// Acesso de longe ao PC de casa. Nele, uma vez: "/tela liberar" (fica guardado naquele navegador).
// De qualquer outro aparelho, o dono da sala manda "/tela <nick>" e aquele PC, se estiver na sala
// com esse nick, compartilha a Tela 1 com áudio e já libera o controle. "/tela parar <nick>" para.
// No PC de casa, quem aperta o botão e o seletor do Chrome é o ajudante do Windows (extensão 1.19+,
// clicar-seletor.ps1), pelo mesmo caminho do abrir-e-compartilhar.bat.
const TELA_LIBERADA = 'sala3d-tela-liberada';
let telaKey = null; // a tela que o /tela abriu aqui

function telaLiberadaAqui() {
  try { return localStorage.getItem(TELA_LIBERADA) === '1'; } catch { return false; }
}
function reentrarAtendendoTela() {
  if (!telaLiberadaAqui()) return;
  socket.emit('tela-atender', true);
  catalogoEnviado = null;
  setTimeout(() => publicarJogos(), 3000); // a extensão se apresenta logo depois de entrar
  // A página recarregou com a tela no ar: NÃO compartilha a Tela 1 de novo sozinha. Ela entrava pela
  // captura do Chrome, que pega o monitor da própria sala (a sala aparecia em espelho no lugar do
  // jogo). Quem põe o PC e o PS5 de volta é a vez da lan house (o servidor repete o pedido para a
  // página nova, pelo PC direto) ou o dono, à mão.
  try { sessionStorage.removeItem(TELA_VOLTAR); } catch { /* sem armazenamento */ }
}
const avisoTela = (text) => addAviso({ text, t: Date.now() });

// ----- a tela não cai sozinha
// Reconexão (a internet piscou, o servidor reiniciou): as capturas vivas saem da sala sem desligar e
// voltam com a chave nova, na mesma tela da sala se ela continuar livre, com o controle como estava.
let aDevolver = []; // as que ainda não voltaram: outra queda no meio da volta não as perde
let voltaN = 0;
function guardarTelas() {
  const guardadas = [...aDevolver];
  for (const sh of [...(self()?.shares.values() || [])]) {
    const stream = rtc?.screens.get(sh.key)?.stream;
    if (sh.file || !stream?.getVideoTracks().some((t) => t.readyState === 'live')) continue;
    guardadas.push({
      stream, chave: sh.key, slot: sh.slot, aba: sh.aba, obs: !!sh.obs, superficie: sh.superficie, controle: !!sh.controle,
      escuta: sh.escuta || null, site: sh.site, titulo: sh.titulo, doTela: sh.key === telaKey, ps5: sh.ps5 || null,
      pcDireto: sh.pcDireto || null, alvo: sh.pcDireto ? sh.alvo : null,
    });
    sh.escuta = null; // o som da aba segue tocando aqui
    stopShare(sh.key, false, { manter: true });
  }
  aDevolver = guardadas;
  return guardadas;
}
// devolve true quando terminou (false: a conexão caiu no meio, e a próxima continua)
async function devolverTelas() {
  const n = ++voltaN;
  let voltaram = 0;
  let refazer = null; // a do PC do /tela que não deu para devolver: compartilha de novo do zero
  for (const g of [...aDevolver]) {
    const viva = () => g.stream.getVideoTracks().some((t) => t.readyState === 'live');
    let key = null;
    // Sem tela livre: as desta própria pessoa, da conexão que caiu, seguram as telas até o servidor
    // notar a queda (uns 45 s). Tenta por 1 min.
    for (let i = 0; i < 12 && !key && viva(); i++) {
      if (i) await new Promise((ok) => setTimeout(ok, 5000));
      if (n !== voltaN || !socket.connected) return false;
      if (viva()) key = await publishShare(g.stream, { aba: g.aba, tela: g.slot ?? undefined, qps: g.obs ? QPS_OBS : null, reconexao: true, manterNaFalha: true, superficie: g.ps5 ? 'ps5' : g.pcDireto ? 'monitor' : null, alvo: g.alvo });
      if (n !== voltaN || (!key && !socket.connected)) return false;
    }
    aDevolver = aDevolver.filter((x) => x !== g);
    if (!key) {
      if (viva()) toast('Uma das suas telas não voltou: todas as telas da sala estão ocupadas.', 'warn', 8000);
      for (const t of g.stream.getTracks()) t.stop();
      g.escuta?.pause();
      // (a sessão pode já ser outra, aberta no meio da queda: essa fica)
      if (g.ps5 && ps5Nativo.fonte === g.ps5) {
        ps5Nativo.key = null;
        ps5Nativo.parar();
      }
      if (g.pcDireto && pcDireto.fonte === g.pcDireto) {
        pcDireto.key = null;
        pcDireto.parar();
      }
      // a do PC direto e a do PS5 não voltam pela captura do Chrome (pegaria o monitor da sala): voltam
      // pela ponte (voltarDiretas)
      if (!g.pcDireto && !g.ps5 && (g.doTela || (telaLiberadaAqui() && g.obs))) refazer = { obs: g.obs };
      continue;
    }
    voltaram++;
    const sh = self().shares.get(key);
    Object.assign(sh, { site: g.site, titulo: g.titulo, escuta: g.escuta });
    // PS5 direto: a sessão com o PS5 seguiu no ar; a tela nova é dela (e o nome volta para o layout)
    if (g.ps5) {
      Object.assign(sh, { ps5: g.ps5 });
      ps5Nativo.key = key;
      socket.emit('share-info', { key, site: null, titulo: 'PS5' });
    }
    if (g.pcDireto) {
      Object.assign(sh, { pcDireto: g.pcDireto });
      pcDireto.key = key;
    }
    if (lanAbriu.pc && lanAbriu.pc === g.chave) lanAbriu.pc = key; // o fim da vez ainda a acha
    if (g.doTela) telaKey = key;
    if (g.controle) socket.emit('controle-permitir', { key, on: true });
  }
  if (voltaram) toast(voltaram > 1 ? `As suas ${voltaram} telas continuam no ar.` : 'A sua tela continua no ar.', 'success', 4000);
  if (refazer) voltarTela({ ...refazer, motivo: 'a conexão caiu' });
  return true;
}
// Antes de recarregar com a tela no ar (só no PC liberado para o /tela): lembra para voltar sozinha.
const TELA_VOLTAR = 'sala3d-tela-voltar';
function lembrarTelasParaVoltar(lista) {
  if (!telaLiberadaAqui()) return;
  const casa = lista.filter((g) => g.doTela || g.obs || g.superficie === 'monitor');
  if (!casa.length) return;
  try { sessionStorage.setItem(TELA_VOLTAR, JSON.stringify({ obs: casa.some((g) => g.obs), t: Date.now() })); } catch { /* sem armazenamento */ }
}
// recarregar a aba por qualquer outro motivo (F5, o Chrome recarregou a aba) também lembra
window.addEventListener('pagehide', () => {
  const lista = [...(self()?.shares.values() || [])].filter((sh) => !sh.file)
    .map((sh) => ({ obs: !!sh.obs, superficie: sh.superficie, doTela: sh.key === telaKey }));
  lembrarTelasParaVoltar(lista);
});

// O PC do /tela (ninguém na frente dele) perdeu a tela: compartilha de novo sozinho, pelo mesmo
// caminho do /tela (ou pelo OBS, se era pelo OBS), e libera o controle. No máximo 4 vezes a cada
// 15 min, para não brigar com um problema que não se resolve sozinho.
const voltasDaTela = [];
let voltandoTela = false;
async function voltarTela({ obs = false, motivo = '' } = {}) {
  if (!telaLiberadaAqui() || voltandoTela) return;
  const agora = Date.now();
  while (voltasDaTela.length && agora - voltasDaTela[0] > 15 * 60_000) voltasDaTela.shift();
  if (voltasDaTela.length >= 4) return avisoTela('A tela caiu de novo e não volta mais sozinha por agora: mande /tela de novo.');
  voltasDaTela.push(agora);
  voltandoTela = true;
  try {
    // a sala acabou de entrar: espera a extensão se apresentar
    for (let i = 0; i < 20 && (!state.joined || !controle.ext.ok || shareBusy); i++) await new Promise((ok) => setTimeout(ok, 1000));
    if (!state.joined || !controle.ext.ok || !controle.ext.liberado) return;
    const minhas = [...(self()?.shares.values() || [])];
    if (minhas.some((sh) => (obs ? sh.obs : !sh.obs && sh.superficie === 'monitor'))) return; // já voltou
    toast(`A tela está voltando sozinha (${motivo})…`, 'info', 5000);
    if (obs) {
      const o = await controle.pedir('pc-obs', undefined, undefined, undefined, 30_000);
      if (!o?.ok) return avisoTela(`A tela caiu (${motivo}) e o OBS não abriu: ${erroDoAjudante(o)}`);
    }
    const r = await compartilharSozinho({ obs });
    if (r.erro) return avisoTela(`A tela caiu (${motivo}) e não voltou: ${r.erro}`);
    telaKey = r.key;
    await liberarControle(r.key);
    avisoTela(`A tela tinha caído (${motivo}) e voltou sozinha.`);
  } finally {
    voltandoTela = false;
  }
}

// ----- o PS5 direto e o PC direto voltam sempre (diretas.js), com ou sem alguém alugando
// Numa recarga a ponte segue com a imagem no ar, mas a página nova não a conhece: abre a ponte e a tela
// volta (a mesma, se continuar livre), com o controle como estava. Sem a ponte no ar, liga de novo. O que
// a vez alugada pôs só volta com a vez ainda valendo.
let quedaEm = null; // quando a sala perdeu a conexão (null: conectada)
let reconectouEm = 0;
const voltandoDireta = { ps5: null, pc: null };
async function semCompartilharAgora() {
  for (let i = 0; i < 40 && shareBusy; i++) await new Promise((ok) => setTimeout(ok, 500));
}
// Aba duplicada herda o sessionStorage: só a que tem a imagem no ar (a tranca) volta, senão uma
// tomaria a ponte da outra.
let trancaDiretas = null;
function segurarDiretas() {
  if (!navigator.locks?.request) return Promise.resolve(true);
  trancaDiretas ??= new Promise((resolve) => {
    navigator.locks.request('sala3d-diretas', { ifAvailable: true }, (tranca) => {
      resolve(!!tranca);
      if (tranca) return new Promise(() => {}); // até a aba fechar ou recarregar
      trancaDiretas = null;
      return undefined;
    }).catch(() => resolve(true));
  });
  return trancaDiretas;
}
// a tela desta máquina na sala (null: fora do ar)
function diretaNoAr(m) {
  const fonte = m === 'ps5' ? ps5Nativo : pcDireto;
  return (fonte.noAr && fonte.key && self()?.shares.get(fonte.key)) || null;
}
// viva, esperando a vez no devolverTelas
const diretaGuardada = (m) => aDevolver.some((g) => (m === 'ps5' ? g.ps5 : g.pcDireto));
// A imagem caiu sozinha. Com a sala também fora, volta na reconexão; logo depois de uma reconexão (a
// rede ainda se acertando), volta já.
function caiuDireta(m) {
  diretas.caiu(m);
  if (quedaEm || voltandoDireta[m] || !diretas.lista[m] || Date.now() - reconectouEm > 60_000) return;
  setTimeout(() => { if (!quedaEm) voltarDiretas('a conexão caiu', Date.now()); }, 3000);
}
async function voltarDiretas(motivo, queda = null) {
  const lista = diretas.paraVoltar(queda).filter((m) => !diretaNoAr(m) && !diretaGuardada(m) && !voltandoDireta[m]);
  if (!lista.length) return;
  // a página de antes solta a tranca ao sair; outra aba com a imagem no ar não solta
  let minha = false;
  for (let i = 0; i < 5 && !minha; i++) {
    if (i) await esperar(1000);
    minha = await segurarDiretas();
  }
  if (!minha) {
    for (const m of lista) diretas.larga(m);
    return;
  }
  // a extensão se apresenta logo depois de a página abrir
  for (let i = 0; i < 30 && (!state.joined || !controle.ext.ok); i++) await esperar(1000);
  for (const m of lista) {
    // na fila dos pedidos da lan house: um "abrir" dela no meio acha a tela já na sala
    const vez = filaDePedidos[m].then(() => voltarDireta(m, motivo));
    filaDePedidos[m] = vez.catch((err) => diagJogo.evento('a imagem direta não voltou', { m, erro: String(err?.message || err).slice(0, 200) }));
  }
}
async function voltarDireta(m, motivo) {
  const d = diretas.lista[m] && { ...diretas.lista[m] };
  // pararam no meio da espera, ou já voltou
  if (!d || !state.joined || diretaNoAr(m) || diretaGuardada(m)) return;
  if (d.lan && lanLivre(m)) return void diretas.larga(m);
  const nome = m === 'ps5' ? 'PS5' : 'PC';
  diretas.atualizar(m, { caiu: null });
  voltandoDireta[m] = d;
  toast(`O ${nome} está voltando sozinho (${motivo})…`, 'info', 5000);
  diagJogo.evento(`${nome} direto: voltando sozinho`, { motivo });
  let erro = null;
  try {
    if (m === 'ps5') erro = await ligarPs5Sozinho(() => !!diretas.lista.ps5);
    else if (!d.nome) erro = 'não sei qual monitor estava no ar';
    else {
      // como o PS5: a ponte pode estar reabrindo com a página
      for (let i = 0; i < 4 && !diretaNoAr('pc'); i++) {
        if (i) await esperar(10_000);
        if (!diretas.lista.pc) break;
        erro = (await pcDireto.ligarParaJogo({ nome: d.nome, qps: d.qps })).erro || null;
      }
    }
    const sh = diretaNoAr(m);
    if (sh) {
      if (m === 'pc' && d.lan) lanAbriu.pc = sh.key;
      if (m === 'pc' && d.controle !== false) await liberarControle(sh.key);
      // desligado por quem compartilha: continua desligado
      if (d.controle === false) socket.emit('controle-permitir', { key: sh.key, on: false });
      return;
    }
  } finally {
    voltandoDireta[m] = null;
  }
  // pararam, ou a conexão caiu de novo no meio: a próxima tenta outra vez
  if (!diretas.lista[m] || quedaEm || diretaGuardada(m)) return;
  diretas.larga(m);
  avisoTela(`O ${nome} não voltou sozinho: ${erro || 'a tela não entrou na sala'}.`);
}
// como cada uma está agora (a tela da sala, o controle): é como ela volta
function anotarDiretas() {
  for (const m of Object.keys(diretas.lista)) {
    const sh = diretaNoAr(m);
    diretas.atualizar(m, sh && !voltandoDireta[m] && !quedaEm ? { slot: sh.slot, controle: !!sh.controle } : {});
  }
}
setInterval(anotarDiretas, 15_000);
window.addEventListener('pagehide', anotarDiretas);

// Enquanto compartilha, o PC não dorme nem apaga/bloqueia a tela (bloqueada, a captura congela e
// quem estava jogando de longe fica sem imagem). Pelo ajudante do Windows (1.15+), que vale com o
// jogo na frente; e pela trava de tela do navegador, que só vale com a sala visível.
let acordado = { on: false, em: 0 };
let travaTela = null;
function manterAcordado() {
  const on = [...(self()?.shares.values() || [])].some((sh) => !sh.file);
  if (on && !travaTela && document.visibilityState === 'visible' && navigator.wakeLock?.request) {
    travaTela = navigator.wakeLock.request('screen').then((l) => {
      l.addEventListener('release', () => { travaTela = null; });
      return l;
    }).catch(() => { travaTela = null; return null; });
  } else if (!on && travaTela) {
    const t = travaTela;
    travaTela = null;
    t.then((l) => l?.release()).catch(() => {});
  }
  // o ajudante: liga, desliga só se ligou, e repete a cada 5 min (ele pode ter reaberto)
  if (!controle.ext.ok || !controle.ext.liberado || controle.ext.nativo?.ok === false) return;
  if (on === acordado.on && (!on || Date.now() - acordado.em < 5 * 60_000)) return;
  acordado = { on, em: Date.now() };
  controle.pedir('pc-acordado', undefined, undefined, on ? 1 : 0, 10_000);
}
document.addEventListener('visibilitychange', manterAcordado);
// PC direto e PS5 direto: com a sala minimizada ou coberta, o Chrome desacelera a página e o turbo de
// quem joga não entra (teste de 2026-11-17 01:44: "sem-imagem" quatro vezes, até a sala voltar à frente)
let escondidaNoAr = false;
document.addEventListener('visibilitychange', () => {
  const noAr = pcDireto.noAr || ps5Nativo.noAr;
  if (document.hidden && noAr) {
    escondidaNoAr = true;
    diagJogo.evento('a sala ficou escondida com a imagem direta no ar (o Chrome desacelera a página)');
  } else if (!document.hidden && escondidaNoAr) {
    escondidaNoAr = false;
    if (noAr) toast(`Deixe a janela da sala aberta e visível enquanto o ${pcDireto.noAr ? 'PC' : 'PS5'} direto estiver no ar (no outro monitor, por exemplo): minimizada ou coberta, o Chrome desacelera a página e o modo turbo de quem joga não entra.`, 'warn', 12000);
  }
});
setInterval(manterAcordado, 60_000);

function comandoTela(resto) {
  const [palavra = '', ...mais] = resto.split(/\s+/).filter(Boolean);
  const p = palavra.toLowerCase();
  if (p === 'liberar' || p === 'bloquear') {
    const on = p === 'liberar';
    try { on ? localStorage.setItem(TELA_LIBERADA, '1') : localStorage.removeItem(TELA_LIBERADA); } catch { /* sem armazenamento */ }
    socket.emit('tela-atender', on);
    if (!on) return avisoTela('Este PC não atende mais o /tela.');
    catalogoEnviado = null;
    publicarJogos();
    const falta = !controle.ext.ok ? ' Falta a extensão da Sala 3D neste Chrome (com este site liberado no ícone dela).'
      : !controle.ext.liberado ? ' Falta liberar este site no ícone da extensão.'
      : controle.ext.nativo?.ok === false ? ' Falta o ajudante do Windows (extensao\\nativo\\instalar.bat).' : '';
    return avisoTela(`Este PC agora atende o /tela: o dono da sala manda "/tela ${settings.name}" de outro aparelho e ele compartilha a Tela 1 com áudio e libera o controle. Deixe a sala aberta aqui.${falta}`);
  }
  const parar = p === 'parar';
  const nick = (parar ? mais.join(' ') : resto).trim();
  if (!nick) return avisoTela('Use "/tela <nick>" para o PC desse jogador compartilhar a tela, "/tela parar <nick>" para parar. No PC que vai atender, uma vez: "/tela liberar".');
  if (!state.donoDaSala) return avisoTela('Só o dono da sala pode usar o /tela. Entre como dono (painel da sala) neste aparelho.');
  socket.emit('tela-pedir', { nick, acao: parar ? 'parar' : 'compartilhar' }, (r) => {
    if (r?.ok) return avisoTela(parar ? `Pedi para ${nick} parar de compartilhar.` : `Pedi a tela de ${nick}. Leva uns segundos…`);
    const erros = {
      dono: 'Só o dono da sala pode usar o /tela.',
      ninguem: `Ninguém chamado "${nick}" está nesta sala.`,
      'nao-liberado': `O PC de ${nick} não atende o /tela. Nele, mande uma vez "/tela liberar".`,
    };
    avisoTela(erros[r?.erro] || 'Não deu para mandar o /tela.');
  });
}

// O botão "Compartilhar a tela inteira" (o ?compartilhar=tela e o /tela): o Chrome só abre o seletor
// depois de um clique na página, e o UI Automation do Windows apertando o botão conta como clique.
// Devolve a chave da tela quando ela entrar (ou null).
function botaoTelaInteira({ auto = false, obs = false } = {}) {
  document.querySelector('#botao-tela-inteira')?.remove();
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'botao-tela-inteira';
  b.textContent = 'Compartilhar a tela inteira';
  b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;padding:18px 28px;font:600 18px system-ui,sans-serif;border:0;border-radius:12px;background:#2563eb;color:#fff;box-shadow:0 8px 30px #0008;cursor:pointer';
  document.body.appendChild(b);
  return new Promise((resolve) => {
    b.addEventListener('click', async () => {
      b.remove();
      resolve((await novaTela(undefined, obs ? { obs: true, auto } : { monitor: true, auto })) ?? null);
    });
  });
}

// Com a sala em tela cheia (o painel em foco, o modo jogo) o botão acima fica por baixo dela — o
// ajudante não acha o que apertar — e o seletor do Chrome não abre por cima. Sai da tela cheia (e
// solta o ponteiro e o teclado) antes; ninguém está na frente deste PC mesmo.
async function sairDaTelaCheiaParaOSeletor() {
  try { navigator.keyboard?.unlock?.(); } catch { /* sem trava */ }
  if (document.pointerLockElement) document.exitPointerLock?.();
  const doc = document;
  if (!(doc.fullscreenElement || doc.webkitFullscreenElement)) return;
  const saiu = new Promise((ok) => {
    const pronto = () => { doc.removeEventListener('fullscreenchange', pronto); ok(); };
    doc.addEventListener('fullscreenchange', pronto);
    setTimeout(pronto, 1500);
  });
  await (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {});
  await saiu;
  await new Promise((ok) => setTimeout(ok, 300)); // a janela do Chrome se acerta antes do clique
}

async function pedidoDeTela({ acao, de }, responder = (ok, texto) => socket.emit('tela-resposta', { ok, texto })) {
  if (!telaLiberadaAqui()) return; // o servidor já não manda, mas por garantia
  const minhas = self()?.shares;
  if (acao === 'parar') {
    const key = telaKey && minhas?.has(telaKey) ? telaKey : [...(minhas?.values() || [])].find((s) => s.alvo?.superficie === 'monitor')?.key;
    if (!key) return responder(true, 'não estava compartilhando a tela');
    stopShare(key, true);
    telaKey = null;
    return responder(true, 'parou de compartilhar');
  }
  // já está na tela inteira (pelo /tela ou à mão)? fica nela. O OBS não conta: ele mostra só o jogo.
  const telaInteira = (sh) => sh && !sh.obs && !sh.file && sh.superficie === 'monitor';
  let key = telaKey && telaInteira(minhas?.get(telaKey)) ? telaKey
    : [...(minhas?.values() || [])].find(telaInteira)?.key ?? null;
  let trocouObs = false;
  if (!key) {
    if (!controle.ext.ok || !controle.ext.liberado) return responder(false, 'a extensão da Sala 3D não está liberada no Chrome de lá');
    if (shareBusy || voltandoTela) return responder(false, 'já tem um compartilhamento começando lá');
    toast(`${de} pediu a sua tela pelo /tela.`, 'info', 6000);
    // compartilhando pelo OBS (o jogo): a tela inteira entra no lugar dele, com o mesmo som do PC.
    // Escolher um jogo de novo volta para o OBS.
    for (const sh of [...(minhas?.values() || [])]) {
      if (!sh.obs) continue;
      stopShare(sh.key, true);
      trocouObs = true;
    }
    const r = await compartilharSozinho();
    if (r.erro) return responder(false, `não compartilhou: ${r.erro}${trocouObs ? ' (o OBS saiu do ar: escolha o jogo de novo para voltar a ele)' : ''}`);
    key = r.key;
  }
  telaKey = key;
  const onde = trocouObs ? 'trocou o OBS pela tela inteira (Tela 1, com áudio)' : 'compartilhando a Tela 1 com áudio';
  if (!(await liberarControle(key))) return responder(true, `${onde}, mas sem controle (falta o ajudante do Windows)`);
  responder(true, `${onde}, controle liberado`);
}

// Ninguém na frente deste PC: põe o botão na sala e o ajudante aperta ele e o seletor do Chrome (a
// Tela 1, com o áudio do sistema). obs: a imagem vem da câmera virtual do OBS (o seletor dá só o som).
// Devolve { key } ou { erro } (o motivo, para quem pediu).
async function compartilharSozinho({ obs = false } = {}) {
  await sairDaTelaCheiaParaOSeletor();
  const entrou = botaoTelaInteira({ auto: true, obs });
  const r = await controle.pedir('tela-auto', undefined, undefined, 'Tela 1', 80_000);
  if (r?.erro) {
    document.querySelector('#botao-tela-inteira')?.remove();
    return {
      erro: r.erro === 'ajudante-ausente' ? 'o ajudante do Windows não está instalado lá'
        : r.erro === 'sem-resposta' || r.msg === 'demorou' ? 'o seletor do Chrome não respondeu (ajudante antigo? recarregue a extensão lá)'
        : r.msg === 'sem-script' ? 'falta o clicar-seletor.ps1 na pasta do ajudante'
        : r.msg || r.erro,
    };
  }
  const key = await Promise.race([entrou, new Promise((ok) => setTimeout(() => ok(null), obs ? 25_000 : 15_000))]);
  document.querySelector('#botao-tela-inteira')?.remove();
  return key ? { key } : { erro: obs ? 'o Chrome não começou a compartilhar pelo OBS' : 'o Chrome não começou a compartilhar' };
}

// controle liberado: quem pediu já mexe no mouse, no teclado e no controle de lá
async function liberarControle(key) {
  const sh = self()?.shares.get(key);
  if (!sh || sh.controle || !sh.alvo) return true;
  const r = await controle.retomarJanela();
  if (r?.erro) return false;
  socket.emit('controle-permitir', { key, on: true });
  return true;
}

// ------------------------------------------------------------------ jogos do PC (o hub)
// Este PC, liberado para o /tela, é o PC de jogos da sala: o ajudante do Windows (extensão 1.20+,
// ajudante 1.14+) lista os atalhos da pasta "Jogos da Sala 3D" da área de trabalho e o catálogo vai
// para o servidor (só o dono da sala vê, em pc-jogos.js). O dono escolhe um jogo: este PC fecha o de
// antes, põe o monitor de 144 Hz na sala pelo PC direto (a placa de vídeo, sempre a 60 qps), libera o
// controle e abre o jogo nesse monitor. Sem o PC direto (placa sem NVENC, ponte fora): pelo OBS (com a
// câmera virtual), como antes. Escolher outro troca o jogo; o compartilhamento continua.
let catalogoEnviado = null; // o último catálogo mandado (não manda igual de novo)
let publicandoJogos = false;
async function publicarJogos() {
  if (!socket || !state.joined || !telaLiberadaAqui() || !controle.ext.ok || !controle.ext.liberado || publicandoJogos) return;
  if (controle.ext.nativo?.ok === false) return;
  publicandoJogos = true;
  try {
    const r = await controle.pedir('pc-jogos', undefined, undefined, undefined, 30_000);
    if (!r?.ok || !Array.isArray(r.jogos)) return;
    const jogos = r.jogos.map((j) => ({ id: j.id, nome: j.nome, icone: j.icone || null, capa: j.capa || null, steam: j.steam || null }));
    // o servidor recebe até 1 MB por mensagem: passando disso, as capas próprias saem (fica o ícone)
    for (const j of jogos) if (JSON.stringify(jogos).length > 850_000) j.capa = null;
    const pacote = { jogos, atual: r.atual || null };
    const assinatura = JSON.stringify(pacote);
    if (assinatura === catalogoEnviado) return;
    catalogoEnviado = assinatura;
    socket.emit('hub-jogos', pacote);
  } finally {
    publicandoJogos = false;
  }
}
// pega atalho novo na pasta e o jogo que fecharam aqui mesmo
setInterval(() => publicarJogos(), 60_000);

async function cameraLiberada() {
  try {
    return (await navigator.permissions.query({ name: 'camera' })).state === 'granted';
  } catch {
    return true; // sem como saber: tenta
  }
}

const erroDoAjudante = (r) => (r?.erro === 'ajudante-ausente' ? 'o ajudante do Windows não está instalado lá'
  : r?.erro === 'demorou' || r?.erro === 'sem-resposta' ? `o ajudante não respondeu (precisa do 1.14+: recarregue a extensão lá${r.versao ? `; está no ${r.versao}` : ''})`
  : r?.msg || r?.erro || 'sem resposta');

// Lan house: o que a vez de alguém pôs na sala (a tela do PC, o PS5). Acabou a vez e ninguém pegou a
// seguinte, sai da sala; o que já estava na sala antes da vez fica.
const lanAbriu = { pc: null, jogo: null, ps5: false };
// o PC alugado (lan house) com um jogo aberto pela vez: quem joga também não fecha o jogo (controle.js, ajudante 1.24+)
controle.aluguel = () => !!(state.lan && lanAbriu.jogo && !lanLivre('pc'));
let ps5SemPerguntar = false;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// a vez no PS5: liga o PS5 direto no último console usado (ou no primeiro registrado) e põe na sala
async function pedidoPs5Lan(acao, de, responder, daLan = false) {
  // acabou a vez e ninguém pegou a seguinte: o PS5 sai da sala (mesmo que a página tenha recarregado
  // no meio da vez e não lembre quem o ligou)
  if (acao === 'fechar') {
    lanAbriu.ps5 = false;
    diretas.larga('ps5');
    if (!ps5Nativo.noAr && !ps5Nativo.conectado) return responder(true, 'Acabou a vez no PS5.');
    ps5Nativo.parar();
    return responder(true, 'O PS5 saiu da sala: acabou a vez.');
  }
  if (ps5Nativo.noAr) {
    if (ps5Nativo.key) socket.emit('controle-permitir', { key: ps5Nativo.key, on: true });
    return responder(true, `O PS5 já está na sala. Abra a tela de ${settings.name} para jogar.`);
  }
  toast(`Vez de ${de} no PS5: ligando o PS5…`, 'info', 6000);
  const erro = await ligarPs5Sozinho();
  if (erro) return responder(false, erro);
  lanAbriu.ps5 = true;
  if (daLan) diretas.atualizar('ps5', { lan: true });
  responder(true, `O PS5 está na sala. Abra a tela de ${settings.name} para jogar.`);
}
// liga o PS5 direto e põe na sala sem perguntar nada; devolve o erro, ou null. querAinda(): desistiram?
async function ligarPs5Sozinho(querAinda = () => true) {
  if (!temPs5Nativo()) return 'o navegador do PC da casa não abre o PS5 direto (use o Chrome)';
  if (!(await ps5Nativo.ligarPonte())) return `o PS5 não ligou: ${ps5Nativo.erro || 'a ponte não abriu'}`;
  ps5Nativo.mandar({ tipo: 'consoles' });
  for (let i = 0; i < 25 && !ps5Nativo.consoles.length; i++) await esperar(200);
  const lista = ps5Nativo.consoles;
  const console_ = lista.find((c) => c.id === ps5Nativo.opcoes.ultimo) || lista[0];
  if (!console_) return 'nenhum PS5 registrado no PC da casa (registre em PS5 direto)';
  ps5SemPerguntar = true;
  try {
    // Até 6 tentativas: logo depois de a sessão de antes cair (a ponte reiniciou com a página), o PS5
    // ainda a acha aberta e recusa ("Remote Play já em uso") por alguns segundos.
    for (let tentativa = 0; tentativa < 6 && !ps5Nativo.key && querAinda(); tentativa++) {
      if (tentativa) {
        diagJogo.evento('PS5 recusou, tentando de novo', { tentativa });
        await esperar(10_000);
        if (ps5Nativo.key || ps5Nativo.noAr || !querAinda()) break;
      }
      await ps5Nativo.jogar(console_.id);
      // conecta (e acorda o PS5 do repouso): até 90 s até a tela entrar na sala
      for (let i = 0; i < 180 && !ps5Nativo.key && ps5Nativo.fase !== 'parado'; i++) await esperar(500);
    }
    for (let i = 0; i < 20 && !ps5Nativo.key && ps5Nativo.noAr; i++) await esperar(500);
  } finally {
    ps5SemPerguntar = false;
  }
  return ps5Nativo.key ? null : 'o PS5 não conectou (ligado ou em repouso, no mesmo Wi-Fi do PC?)';
}
// um pedido de cada vez por máquina, em fila: o segundo, chegando no meio do primeiro, derrubava a
// ponte que estava abrindo e deixava a tela dela sobrando na sala (o PC em duas telas). Na fila, um
// "abrir" repetido acha a máquina já na sala, e um "fechar" no meio de um "abrir" não se perde.
const filaDePedidos = { pc: Promise.resolve(), ps5: Promise.resolve() };
function pedidoDeJogo(m) {
  const qual = m?.maquina === 'ps5' ? 'ps5' : 'pc';
  const vez = filaDePedidos[qual].then(() => pedidoDeJogoJa(m));
  filaDePedidos[qual] = vez.catch(() => {});
  return vez;
}
async function pedidoDeJogoJa({ acao, id, de, maquina, lan: daLan }) {
  const responder = (ok, texto) => socket.emit('tela-resposta', { ok, texto, jogo: true });
  if (!telaLiberadaAqui()) return;
  if (maquina === 'ps5') return pedidoPs5Lan(acao, de, responder, !!daLan);
  if (!controle.ext.ok || !controle.ext.liberado) return responder(false, 'a extensão da Sala 3D não está liberada no Chrome de lá');
  if (acao === 'fechar') {
    // a vez acabou sem jogo aberto por ela: não há o que fechar no Windows, só a tela sai
    const r = !daLan || lanAbriu.jogo ? await controle.pedir('pc-jogo-fechar', undefined, undefined, undefined, 30_000) : { ok: true, msg: '' };
    publicarJogos();
    const key = lanAbriu.pc;
    lanAbriu.pc = null;
    lanAbriu.jogo = null;
    if (daLan && diretas.lista.pc?.lan) diretas.larga('pc');
    if (daLan && key && self()?.shares.has(key)) stopShare(key, true);
    return responder(!!r?.ok, r?.ok ? r.msg || 'O PC saiu da sala: acabou a vez.' : `não fechou: ${erroDoAjudante(r)}`);
  }
  const minhas = self()?.shares;
  const antes = new Set(minhas?.keys() || []);
  // PC direto (a placa de vídeo) no lugar do OBS: sempre o monitor de 144 Hz, sempre a 60 qps. O jogo
  // abre nesse monitor (o ajudante leva a janela para lá). Já no ar assim: trocar de jogo não mexe nele.
  let key = null;
  let monitor = null;
  let semDireto = null;
  if (temPcDireto() && !isTouch) {
    const pronto = pcDireto.noAr && pcDireto.key && pcDireto.conectado?.monitor === pcDireto.monitorDoJogo()?.i;
    if (!pronto) {
      if (shareBusy) return responder(false, 'já tem um compartilhamento começando lá');
      toast(id ? `${de} escolheu um jogo: abrindo o PC direto…` : `Vez de ${de} no PC: pondo o PC na sala…`, 'info', 6000);
      // o OBS e a Tela 1 do /tela saem: a imagem passa a vir da placa
      for (const sh of [...(minhas?.values() || [])]) if (sh.obs) stopShare(sh.key, true);
      if (telaKey && minhas?.has(telaKey)) stopShare(telaKey, true);
      telaKey = null;
    }
    const r = await pcDireto.ligarParaJogo();
    if (r.key) {
      key = r.key;
      monitor = r.monitor;
    } else {
      semDireto = r.erro;
      diagJogo.evento('jogos do pc: o PC direto não abriu, vai pelo OBS', { erro: String(r.erro).slice(0, 200) });
    }
  }
  // sem o PC direto (outra placa, a ponte não abriu): pelo OBS, como antes. Já nele? continua.
  if (!key) key = [...(minhas?.values() || [])].find((s) => s.obs)?.key ?? null;
  if (!key) {
    if (shareBusy) return responder(false, 'já tem um compartilhamento começando lá');
    if (!(await cameraLiberada())) return responder(false, 'o Chrome de lá ainda não deixou a sala usar a câmera (o OBS chega como câmera): na frente do PC, compartilhe uma vez pelo OBS e permita');
    toast(id ? `${de} escolheu um jogo: abrindo o OBS…` : `Vez de ${de} no PC: pondo o PC na sala pelo OBS…`, 'info', 6000);
    const o = await controle.pedir('pc-obs', undefined, undefined, undefined, 30_000);
    if (!o?.ok) return responder(false, `${semDireto ? `o PC direto não abriu (${semDireto}) e ` : ''}não abriu o OBS: ${erroDoAjudante(o)}`);
    // a Tela 1 do /tela sai: a imagem passa a vir do OBS
    if (telaKey && minhas?.has(telaKey)) stopShare(telaKey, true);
    telaKey = null;
    const r = await compartilharSozinho({ obs: true });
    if (r.erro) return responder(false, `não compartilhou: ${r.erro}`);
    key = telaKey = r.key;
  }
  const controleOk = await liberarControle(key);
  // a vez da lan house pôs o PC na sala agora: sai quando ela acabar
  if (daLan) {
    if (!antes.has(key)) lanAbriu.pc = key;
    else if (lanAbriu.pc !== key) lanAbriu.pc = null;
    if (key === pcDireto.key) diretas.atualizar('pc', { lan: lanAbriu.pc === key });
  }
  const como = monitor ? ` pelo PC direto (monitor ${monitor.i + 1}${monitor.hz ? ` de ${monitor.hz} Hz` : ''}, 60 qps)` : semDireto ? ` pelo OBS (o PC direto não abriu: ${semDireto})` : ' pelo OBS';
  const semControle = controleOk ? '' : ' (sem controle: falta o ajudante do Windows)';
  // alugou o PC sem escolher jogo: só a tela do PC na sala, a pessoa abre o que quiser
  if (!id) return responder(true, `O PC está na sala${como}${semControle}. Abra a tela de ${settings.name} para jogar.`);
  // ev.monitor: o ajudante abre o jogo no monitor que a placa está mandando (extensão 1.26+)
  // o ajudante numera os monitores como o Windows (EnumDisplayDevices: o N do rótulo "screen:N:0");
  // o "i" da ponte é a ordem da placa (DXGI), que pode ser outra: com ele o jogo ia para o monitor errado
  const monWin = monitor ? Number(/^screen:(\d+):/.exec(monitor.rotulo || '')?.[1] ?? monitor.i) : null;
  const j = await controle.pedir('pc-jogo-abrir', undefined, monitor ? { monitor: monWin } : undefined, String(id || ''), 40_000);
  publicarJogos();
  if (!j?.ok) return responder(false, `não abriu o jogo: ${erroDoAjudante(j)}`);
  if (daLan) lanAbriu.jogo = true;
  responder(true, `${j.msg}${como}${semControle}. Abra a tela de ${settings.name} para jogar.`);
}

// PC da casa a distância (painel Empresa do dono, em outro aparelho): a Tela 1 (como o /tela), o PC
// direto (como alugar o PC sem jogo) ou o PS5 direto (como a vez no PS5), ligar ou parar. Usa os mesmos
// caminhos da lan house e do /tela, na mesma fila de cada máquina.
async function pedidoRemoto({ maquina, acao, de }) {
  if (!telaLiberadaAqui()) return;
  const responder = (ok, texto) => socket.emit('tela-resposta', { ok, texto, jogo: true });
  const parar = acao === 'parar';
  if (maquina === 'tela') {
    // pedidoDeTela responde sem o "jogo": aqui a resposta vai com ele, para o painel do dono
    const resp = (ok, texto) => responder(ok, `Tela 1: ${texto}`);
    if (parar) {
      const key = telaKey && self()?.shares.has(telaKey) ? telaKey : null;
      if (!key) return resp(true, 'não estava no ar');
      stopShare(key, true);
      telaKey = null;
      return resp(true, 'saiu do ar');
    }
    return pedidoDeTela({ acao: 'compartilhar', de }, resp);
  }
  if (maquina === 'ps5') return pedidoDeJogo({ maquina: 'ps5', acao: parar ? 'fechar' : 'abrir', de });
  // PC direto
  if (parar) {
    const key = pcDireto.key;
    diretas.larga('pc');
    if (!pcDireto.noAr && !(key && self()?.shares.has(key))) return responder(true, 'O PC direto não estava no ar.');
    if (key && self()?.shares.has(key)) stopShare(key, true);
    pcDireto.parar();
    if (lanAbriu.pc === key) lanAbriu.pc = null;
    return responder(true, 'O PC direto saiu do ar.');
  }
  return pedidoDeJogo({ maquina: 'pc', acao: 'abrir', id: '', de });
}

// ----- o painel do dono (Empresa → "PC da casa a distância"): escolhe o PC liberado e manda o pedido
const REMOTO_PC = 'sala3d-remoto-pc';
let remotoEsperando = null; // o pedido mandado, até a resposta do PC (ou 3 min: o PS5 tenta até 6 vezes)
const remotoAberto = () => state.panel === 'sala' && !!$('#remoto-pc')?.closest('details')?.open;
function carregarPcsRemotos() {
  if (!socket || !state.donoDaSala) return;
  socket.emit('hub-pcs', null, (r) => {
    const sel = $('#remoto-pc');
    if (!r?.ok) {
      sel.innerHTML = '<option value="">Só o dono vê os PCs</option>';
      return renderRemoto();
    }
    let lembrado = null;
    try { lembrado = localStorage.getItem(REMOTO_PC); } catch { /* sem armazenamento */ }
    const antes = sel.value || lembrado;
    // o próprio aparelho por último: o comum é mandar de outro
    const pcs = [...r.pcs].sort((a, b) => Number(a.eu) - Number(b.eu));
    sel.innerHTML = pcs.length
      ? pcs.map((p) => `<option value="${esc(p.nick)}">${esc(p.nick)}${p.eu ? ' (este aparelho)' : ''}</option>`).join('')
      : '<option value="">Nenhum PC liberado na sala agora</option>';
    if (pcs.some((p) => p.nick === antes)) sel.value = antes;
    renderRemoto();
  });
}
// o que o PC escolhido tem no ar agora (pelas telas dele na sala)
function renderRemoto() {
  const nick = $('#remoto-pc').value;
  const dono = nick ? [...state.users.values()].find((u) => u.name === nick) : null;
  const telas = dono ? [...(dono.shares?.values() || [])] : [];
  const ps5 = telas.some((sh) => sh.superficie === 'ps5' || sh.titulo === 'PS5');
  const monitor = telas.some((sh) => sh.superficie === 'monitor');
  document.querySelector('.remoto-linha:has([data-remoto="ps5"])')?.classList.toggle('no-ar', ps5);
  for (const b of $$('[data-remoto]')) if (!remotoEsperando) b.disabled = !nick;
  // o que está no ar fica numa linha; a resposta do último pedido, na outra (até o próximo)
  $('#remoto-noar').textContent = !nick ? 'Libere o PC da casa: nele, mande uma vez “/tela liberar” no chat, com a sala aberta.'
    : ps5 || monitor ? `No ar agora: ${[monitor && 'a tela do PC', ps5 && 'o PS5'].filter(Boolean).join(' e ')}.`
    : 'Nada deste PC no ar agora.';
}
const NOME_REMOTO = { tela: 'a Tela 1', pc: 'o PC direto', ps5: 'o PS5 direto' };
$('#sala-config').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remoto]');
  if (!b) return;
  const nick = $('#remoto-pc').value;
  if (!nick || !socket) return;
  const { remoto: maquina, acao } = b.dataset;
  socket.emit('hub-remoto', { nick, maquina, acao }, (r) => {
    if (!r?.ok) {
      const erros = { dono: 'Só o dono da sala manda no PC da casa.', ninguem: `${nick} não está mais na sala (ou deixou de atender o /tela).` };
      $('#remoto-status').textContent = erros[r?.erro] || 'Não deu para mandar o pedido.';
      return carregarPcsRemotos();
    }
    clearTimeout(remotoEsperando?.t);
    remotoEsperando = { t: setTimeout(() => {
      remotoEsperando = null;
      renderRemoto();
      $('#remoto-status').textContent = `O PC de ${nick} não respondeu em 3 min (a sala está aberta lá?).`;
    }, 180_000) };
    for (const x of $$('[data-remoto]')) x.disabled = true;
    $('#remoto-status').textContent = `${acao === 'parar' ? 'Tirando' : 'Ligando'} ${NOME_REMOTO[maquina]} no PC de ${nick}…${maquina === 'ps5' && acao !== 'parar' ? ' (o PS5 pode levar até 1 min para acordar)' : ''}`;
  });
});
$('#remoto-pc').addEventListener('change', (e) => {
  try { localStorage.setItem(REMOTO_PC, e.target.value); } catch { /* sem armazenamento */ }
  renderRemoto();
});
$('#remoto-pc').closest('details').addEventListener('toggle', (e) => { if (e.target.open) carregarPcsRemotos(); });
setInterval(() => { if (remotoAberto()) carregarPcsRemotos(); }, 5000);
// a resposta do PC chegou ('tela-resposta' com jogo: true)
function remotoResposta(ok, texto, de) {
  if (!remotoEsperando) return;
  clearTimeout(remotoEsperando.t);
  remotoEsperando = null;
  renderRemoto();
  $('#remoto-status').textContent = `${ok ? '✓' : '✕'} PC de ${de}: ${texto}`;
}

// /pix do dono e /tela: completam o comando, a ação e o nome de quem está na sala. Setas escolhem, Tab ou
// Enter põem no campo (o Enter só manda quando a lista está fechada), Esc fecha.
const PIX_ACOES = [
  ['adicionar', 'soma ao saldo'],
  ['remover', 'tira do saldo'],
  ['ajustar', 'deixa o saldo com o valor'],
];
let sugestoes = []; // { texto: o campo inteiro depois de escolher, rotulo, extra, cor }
let sugestaoAtiva = 0;

// /tela: o dono escolhe o PC (pelo nick); "liberar"/"bloquear" servem a qualquer um, no PC de casa
const TELA_ACOES = [
  ['parar', 'para o compartilhamento de um PC', true],
  ['liberar', 'este PC passa a atender o /tela', false],
  ['bloquear', 'este PC deixa de atender o /tela', false],
];

// quem está na sala e tem "parte" no nome: quem começa com isso vem primeiro, depois quem só tem
// no meio. Nome já completo (um só, igual): lista vazia, e o Enter manda.
function sugestoesDeNomes(prefixo, digitado, { semEu = false, extra }) {
  const parte = digitado.trim().toLowerCase();
  const vistos = new Set();
  const pessoas = [...state.users.values()].filter((u) => {
    const k = u.name.toLowerCase();
    if ((semEu && u.isSelf) || vistos.has(k) || !k.includes(parte)) return false;
    vistos.add(k);
    return true;
  });
  pessoas.sort((a, b) => (b.name.toLowerCase().startsWith(parte) - a.name.toLowerCase().startsWith(parte)) || a.name.localeCompare(b.name, 'pt-BR'));
  if (pessoas.length === 1 && pessoas[0].name === digitado.trim()) return [];
  return pessoas.map((u) => ({
    texto: prefixo + u.name,
    rotulo: u.isSelf ? `${u.name} (você)` : u.name,
    extra: extra(u),
    cor: u.color,
  }));
}

function sugestoesDoPix(v) {
  if (!v.startsWith('/')) return [];
  const dono = state.donoDaSala;
  const baixo = v.toLowerCase();
  // o comando em si ("/", "/t", "/p"…)
  if (!/\s/.test(v)) {
    const cmds = [];
    if (dono && '/pix'.startsWith(baixo)) cmds.push({ texto: '/pix ', rotulo: '/pix', extra: 'adicionar, remover ou ajustar moedas' });
    if (dono && '/jogos'.startsWith(baixo)) cmds.push({ texto: '/jogos', rotulo: '/jogos', extra: 'os jogos do PC de jogos' });
    if (temPcDireto() && !isTouch && baixo.length >= 2 && '/pc'.startsWith(baixo)) cmds.push({ texto: '/pc', rotulo: '/pc', extra: 'este PC na sala pela placa de vídeo (como o Remote Play)' });
    if (temPs5Nativo() && !isTouch && '/ps5'.startsWith(baixo)) cmds.push({ texto: '/ps5', rotulo: '/ps5', extra: 'jogar o PS5 deste PC direto na sala' });
    if ('/tela'.startsWith(baixo)) cmds.push({ texto: '/tela ', rotulo: '/tela', extra: dono ? 'o PC de alguém compartilha a tela' : 'liberar ou bloquear este PC para o /tela' });
    return cmds;
  }

  // /tela parar <nick>
  let m = /^(\/tela\s+parar\s+)(.*)$/i.exec(v);
  if (m) return dono ? sugestoesDeNomes(m[1], m[2], { semEu: true, extra: () => 'parar de compartilhar' }) : [];
  // /tela <ação ou nick>
  m = /^(\/tela\s+)(.*)$/i.exec(v);
  if (m) {
    const parte = m[2].toLowerCase();
    const acoes = TELA_ACOES.filter(([a, , soDono]) => (dono || !soDono) && a.startsWith(parte) && a !== parte)
      .map(([a, extra]) => ({ texto: `/tela ${a}${a === 'parar' ? ' ' : ''}`, rotulo: a, extra }));
    if (TELA_ACOES.some(([a]) => a === parte.trim())) return [];
    if (dono && [...state.users.values()].some((u) => !u.isSelf && u.name === m[2].trim())) return [];
    const nomes = dono ? sugestoesDeNomes(m[1], m[2], { semEu: true, extra: () => 'compartilhar a tela deste PC' }) : [];
    // digitou algo: os nomes primeiro (é o uso de todo dia); vazio: as ações primeiro
    return parte ? [...nomes, ...acoes] : [...acoes, ...nomes];
  }

  if (!dono) return [];
  m = /^\/pix\s+(\S*)$/i.exec(v);
  if (m) {
    const parte = m[1].toLowerCase();
    return PIX_ACOES.filter(([a]) => a.startsWith(parte) && a !== parte)
      .map(([a, extra]) => ({ texto: `/pix ${a} `, rotulo: a, extra }));
  }
  m = /^(\/pix\s+(?:adicionar|remover|ajustar)\s+\d[\d.]*\s+)(.*)$/i.exec(v);
  if (!m) return [];
  return sugestoesDeNomes(m[1], m[2], { extra: (u) => `${u.moedas ?? 0} moedas` });
}

function mostrarSugestoes() {
  const input = $('#chat-input');
  sugestoes = input.selectionStart === input.value.length ? sugestoesDoPix(input.value) : [];
  sugestaoAtiva = Math.min(sugestaoAtiva, Math.max(0, sugestoes.length - 1));
  const ul = $('#chat-sugestoes');
  ul.hidden = !sugestoes.length;
  ul.innerHTML = sugestoes.map((s, i) => `<li role="option" data-i="${i}" class="${i === sugestaoAtiva ? 'ativa' : ''}" aria-selected="${i === sugestaoAtiva}">
    <b${s.cor ? ` style="--c:${esc(s.cor)}"` : ''}>${esc(s.rotulo)}</b><small>${esc(s.extra)}</small></li>`).join('');
  // a escolhida fica à mostra dentro da lista (scrollIntoView rolaria o painel junto)
  const li = ul.querySelector('.ativa');
  if (li) ul.scrollTop = Math.min(li.offsetTop, Math.max(ul.scrollTop, li.offsetTop + li.offsetHeight - ul.clientHeight));
}

function fecharSugestoes() {
  sugestoes = [];
  sugestaoAtiva = 0;
  $('#chat-sugestoes').hidden = true;
}

function usarSugestao(i) {
  const s = sugestoes[i];
  if (!s) return;
  const input = $('#chat-input');
  input.value = s.texto;
  input.focus();
  input.setSelectionRange(s.texto.length, s.texto.length);
  sugestaoAtiva = 0;
  mostrarSugestoes();
}

$('#chat-input').addEventListener('input', () => {
  sugestaoAtiva = 0;
  mostrarSugestoes();
});
$('#chat-input').addEventListener('keydown', (e) => {
  if (!sugestoes.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugestaoAtiva = (sugestaoAtiva + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length;
    mostrarSugestoes();
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    usarSugestao(sugestaoAtiva);
  } else if (e.key === 'Escape') {
    e.stopPropagation(); // o Esc do teclado geral tiraria o foco do campo
    fecharSugestoes();
  }
});
$('#chat-input').addEventListener('blur', () => setTimeout(() => {
  if (document.activeElement !== $('#chat-input')) fecharSugestoes();
}, 150));
// mousedown sem padrão: o campo não perde o foco (nem o teclado do celular fecha) ao tocar no nome
$('#chat-sugestoes').addEventListener('mousedown', (e) => e.preventDefault());
$('#chat-sugestoes').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) usarSugestao(Number(li.dataset.i));
});

// ------------------------------------------------------------------ parkour
const run = new ParkourRun({
  onReady: () => {
    world.resetCheckpoints();
    // um tracinho por checkpoint do percurso (o do cinema ou a escalada da catedral)
    $('#pk-cps').innerHTML = '<i></i>'.repeat(run.percurso === 'escalada' ? CHECKPOINTS_ESCALADA : CHECKPOINT_COUNT);
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
    // o placar do servidor é o do parkour do cinema; a escalada fica só com o tempo na tela
    const escalada = run.percurso === 'escalada';
    if (!escalada) socket.emit('parkour-finish', t);
    setPkTime(t);
    showParkourHud('done', escalada ? 'No topo da catedral! 🔔 O alçapão DESCER leva de volta' : 'Chegou! Aproveite a vista do camarote 😎');
    if (escalada) toast(`Você escalou a catedral em ${formatTime(t)}!`, 'info', 5000);
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
  const start = world.colliders.find((c) => c.data.type === 'start' && !c.data.percurso);
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
window.addEventListener('keydown', (e) => perifericosAtivos()?.tecla(e.target?.type === 'password' || e.target?.classList?.contains('senha-oculta') ? null : e.code, true), true);
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
  if (criador.armado) { // a criação por voz manda enquanto está na mão
    criador.gatilho(true);
    return;
  }
  atirar();
  gatilho = true;
}
function soltarGatilho() {
  gatilho = false;
  criador.gatilho(false);
}
window.addEventListener('keyup', (e) => { if (e.code === 'KeyX') soltarGatilho(); });
document.addEventListener('mouseup', (e) => { if (e.button === 0) soltarGatilho(); });
window.addEventListener('blur', soltarGatilho);

function atualizarArmas(dt) {
  const fp = player.mode === 'first' && !luneta && temArma() && !criador.armado && !player.veiculo && !player.sitting && !state.focus && !combat.knockedOut && !player.override;
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
  touchPad?.setPoderes({ voando: player.voando, puloAlto: player.puloAlto, armado: temArma() || criador.armado, sniper: temSniper(), luneta });
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
// no celular, segurar o dedo no 3D (a tacada da sinuca) abria o menu do toque longo
world.canvas.addEventListener('contextmenu', (e) => { if (temSniper() || isTouch) e.preventDefault(); });

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
#municao[hidden] { display: none; }
body.touch #municao { pointer-events: auto; }`;
document.head.appendChild(estiloMunicao);
// no celular não tem R: tocar no pente recarrega
elMunicao.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  recarregar();
});
let municaoAntes = '';
function mostrarMunicao() {
  const arma = armaAtual();
  // o pente só aparece no mata-mata (e no mata-mata em times): passeando com a arma, não
  const ver = temArma() && state.joined && !player.veiculo && (mataMata.ativo || batalha.ativo);
  const r = isTouch ? ' · toque para recarregar' : ' · R recarrega';
  const txt = !ver ? '' : recarga ? `…|${defArma(arma).nome} · recarregando` : `${balasDe(arma)} / ${pente(arma)}|${defArma(arma).nome}${r}`;
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

// ------------------------------------------------------------------ criador por voz (criador.js)
// Segurar N e falar (ou /criar no chat): a frase vira a arma na mão, no mapa todo. No celular são os
// botões de microfone e de grade (catálogo) da coluna da direita, e a criação atira pelo de tiro.
const criador = new Criador({
  world, player, localAvatar,
  toque: isTouch,
  toast: (...a) => toast(...a),
  // o microfone do toque fica vermelho enquanto ouve
  aoOuvir: (on) => {
    const b = $('#tb-voz');
    b?.classList.toggle('gravando', on);
    b?.setAttribute('aria-pressed', String(on));
  },
  mudou: () => poderesMudaram(), // criou ou guardou: o botão de tiro do toque aparece ou some
  socket: () => socket,
  eu: () => state.selfId,
  avatarDe: (id) => state.users.get(id)?.avatar || null,
  // quem as coisas criadas perseguem e acertam (eu também: as dos outros vêm para cima de mim)
  alvos: () => {
    const l = [];
    for (const u of state.users.values()) {
      if (!u.avatar || u.avatar.ko) continue;
      if (u.isSelf) {
        if (!combat.knockedOut) l.push({ id: u.id, pos: player.pos, raio: 0.45, altura: 1.8 });
      } else if (batalha.podeAcertar(u.id)) l.push({ id: u.id, pos: u.avatar.group.position, ...tamanhoDo(u.avatar) });
    }
    return l;
  },
  podeUsar: () => state.joined && jogoLigado('criador') && !mataMata.ativo && !batalha.ativo,
  podeAtirar: () => !player.veiculo && !player.sitting && !state.focus && !combat.knockedOut && !player.override,
  acertar: (id, dano, dir) => socket?.emit('criador-acerto', { to: id, dano, dir }),
  empurrar: (v) => {
    player.vel.x += v.x;
    player.vel.z += v.z;
    if (v.y > 0) { // explosão: tira do chão; o buraco negro só puxa de lado
      player.vel.y = Math.max(player.vel.y, v.y);
      player.grounded = false;
      player.ground = null;
    }
  },
});
window.addEventListener('keyup', (e) => { if (e.code === 'KeyN') criador.falarFim(); });

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
  touchPad?.setPoderes({ voando: player.voando, puloAlto: player.puloAlto, armado: temArma() || criador.armado, sniper: temSniper(), luneta });
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

// ------------------------------------------------------------------ tapa (como no BOMBANANA)
// Y (a mãozinha no celular, ou a do lado do nome na mesa de cartas): tapa de mão aberta em quem está
// perto e na frente. Não tira vida: empurra, sacode a tela de quem levou e faz PLAFT! O servidor
// confere o alcance e o intervalo (ver 'tapa' no server.js).
const TAPA = { alcance: 2.3, cone: 0.25, intervalo: 0.55, empurrao: 11, pulo: 4.5 };
let ultimoTapa = 0;
function darTapa(alvoId = null) {
  if (!state.joined || !jogoLigado('tapa') || combat.knockedOut) return;
  const agora = performance.now() / 1000;
  if (agora - ultimoTapa < TAPA.intervalo) return;
  ultimoTapa = agora;
  // sem alvo escolhido: o mais perto, na frente e mais ou menos na mesma altura
  if (!alvoId) {
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    let perto = Infinity;
    for (const u of state.users.values()) {
      if (u.isSelf || !u.avatar) continue;
      const p = u.avatar.group.position;
      const dx = p.x - player.pos.x;
      const dz = p.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > TAPA.alcance || d < 0.01 || Math.abs(p.y - player.pos.y) > 2) continue;
      if ((dx * fx + dz * fz) / d < TAPA.cone) continue;
      if (d < perto) {
        perto = d;
        alvoId = u.id;
      }
    }
  }
  localAvatar.tapa();
  sfx.tapaVento();
  socket?.emit('tapa', { to: alvoId });
}

// levei um tapa: empurrão (em pé; sentado na mesa ou no sofá só a tela sacode) e a marca da mão.
// item: a coisa jogada na mesa de cartas (ARREMESSOS): a marca vira ela (a galinha, o ovo...)
function leveiTapa(nome, dir, item) {
  if (!player.override && !player.sitting && Array.isArray(dir)) {
    player.vel.x += dir[0] * TAPA.empurrao;
    player.vel.z += dir[1] * TAPA.empurrao;
    player.vel.y = Math.max(player.vel.y, TAPA.pulo);
    player.grounded = false;
    player.ground = null;
  }
  player.addShake(0.8);
  if (item) marcaNaTela(item.emoji, item.texto, nome ? `${nome} jogou ${item.um} em você!` : `Levou ${item.um}!`, false);
  else marcaNaTela('🖐️', 'PLAFT!', nome ? `${nome} te deu um tapa!` : 'Levou um tapa!', false);
}

// levei um tiro de brincadeira na mesa de cartas: a tela treme mais, o clarão e o BANG!
function leveiTiro(nome) {
  player.addShake(1.3);
  marcaNaTela('💥', 'BANG!', nome ? `${nome} te deu um tiro!` : 'Levou um tiro!', true);
}

// a marca de quem levou (a mão do tapa ou o estouro do tiro), que some sozinha
function marcaNaTela(icone, titulo, texto, tiro) {
  let el = $('#tapa-marca');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tapa-marca';
    el.innerHTML = '<i class="mao" aria-hidden="true"></i><b></b><span></span>';
    document.body.append(el);
  }
  const direita = Math.random() < 0.5;
  el.style.setProperty('--lado', direita ? '72%' : '28%');
  el.style.setProperty('--giro', direita ? '18deg' : '-18deg');
  el.classList.toggle('tiro', tiro);
  el.querySelector('.mao').textContent = icone;
  el.querySelector('b').textContent = titulo;
  el.querySelector('span').textContent = texto;
  el.hidden = false;
  el.classList.remove('anda');
  void el.offsetWidth; // recomeça a animação (tapa em cima de tapa)
  el.classList.add('anda');
  clearTimeout(marcaNaTela.t);
  marcaNaTela.t = setTimeout(() => { el.hidden = true; }, 1150);
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
  const pertoDoTotem = !state.focus && !mesa && !naMesaDeDados && Math.hypot(player.pos.x - 65, player.pos.z - 22) < 4.5;
  const info = state.focus ? null
    : mesa ? { kind: 'jogo', mesa, label: jogos.rotulo(mesa) }
      : naMesaDeDados ? { kind: 'dados', label: 'Apostar nos dados' }
      : pertoDoTotem ? { kind: 'totem_jogos', label: 'Ver Guia de Destinos' }
      : infoDaMira(pickScreen());
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

// Sentou numa mesa de cartas (cartas.js) ou de poker (poker.js): o mouse fica solto para o painel
function focarCartas(kind = 'cartas') {
  if (state.focus?.kind === kind) return true;
  if (state.focus || state.panel || mesa.aberta || !state.joined) return false;
  fecharMesa(false);
  if (document.pointerLockElement) document.exitPointerLock();
  if (player.veiculo) toggleVeiculo();
  state.focus = { kind };
  $('#hover-hint').hidden = true;
  syncTouchVisibility();
  return true;
}

function enterFocus(info) {
  if (!info) return;
  if (info.kind === 'totem_jogos') {
    catalogo.aberto ? catalogo.fechar() : catalogo.abrir();
    return;
  }
  exitFocus();
  fecharMesa(false);
  if (document.pointerLockElement) document.exitPointerLock();
  // A tecla de andar segurada no clique que abriu a tela: daqui em diante o teclado é da tela e o
  // keyup dela para no controle.js (stopImmediatePropagation) — o boneco nunca via a tecla subir e
  // ficava andando para o lado sem parar.
  player.keys.clear();
  if (info.kind === 'dados') {
    state.focus = { kind: 'dados' };
    if (player.sitting) toggleSit();
    if (player.veiculo) toggleVeiculo();
    dados.entrar();
    recolherPainel('#dados-hud', false);
    $('#hover-hint').hidden = true;
    syncTouchVisibility();
    return;
  }
  if (info.kind === 'jogo') {
    state.focus = { kind: 'jogo' };
    if (player.sitting) toggleSit();
    if (player.veiculo) toggleVeiculo();
    jogos.entrar(info.mesa);
    recolherPainel('#jogo-hud', false);
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
    mostrarFocoHud();
    $('#crosshair').hidden = true;
    $('#hover-hint').hidden = true;
    // celular: analógico e botões somem (e soltam o que estava apertado), como nos outros focos —
    // por cima do telão eles andavam, sentavam e viravam carro com a câmera presa no vídeo
    syncTouchVisibility();
    // tela limpa: só o vídeo e a barra de sair do foco (ver body.tv-focus no style.css)
    if (state.panel) closePanel();
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
  // Tela de PS5 sem o DualSense permitido ainda: a lista do Chrome abre já, neste clique (sem tela
  // cheia para escondê-la). Assim o clique no Modo jogo fica livre para a tela cheia entrar direto.
  if (!info.semDualSense && !isTouch && navigator.userActivation?.isActive !== false && precisaPedirDualSense()) conectarDualSense();
}

// Painel do jogo recolhido: só título, vez e mensagem — o resto do tabuleiro fica livre para tocar.
// O botão ao lado do Sair (ou tocar no título) abre e fecha. No celular o painel aberto é um modal no
// meio da tela (abre assim ao sentar) e o recolhido, um menuzinho no canto com o ☰ para reabrir.
function recolherPainel(sel, recolher) {
  const hud = $(sel);
  hud.classList.toggle('min', recolher);
  const b = hud.querySelector('.hud-min');
  b.setAttribute('aria-expanded', String(!recolher));
  b.title = recolher ? 'Abrir o painel' : 'Recolher o painel';
  if (isTouch) b.innerHTML = icon(recolher ? 'menu' : 'minimizar', 16);
}
for (const sel of ['#jogo-hud', '#dados-hud']) {
  $(sel).addEventListener('click', (e) => {
    if (e.target.closest('.hud-min, .jh-head > b')) recolherPainel(sel, !$(sel).classList.contains('min'));
  });
}
// no celular, escolhido o que fazer (sentar, contra o computador, novo jogo, rolar), o modal fecha e o
// tabuleiro fica livre; tocar no fundo escuro também fecha
if (isTouch) {
  $('#jogo-hud').addEventListener('click', (e) => {
    if (e.target.closest('.jh-lado button, #jh-bot, #jh-novo')) recolherPainel('#jogo-hud', true);
  });
  $('#dados-hud').addEventListener('click', (e) => {
    if (e.target.closest('#dh-rolar, #dh-so')) recolherPainel('#dados-hud', true);
  });
  $('#hud-fundo').addEventListener('click', () => {
    for (const sel of ['#jogo-hud', '#dados-hud']) if (!$(sel).hidden) recolherPainel(sel, true);
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
  } else if (state.focus.kind === 'poker') {
    poker.sairDaMesa();
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
    naTv?.saiuDaTela();
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

// Barra do telão em foco ("Clique no vídeo..." + Sair): tapava o título do vídeo. Some com o
// mouse parado e volta quando ele mexe. O mexer DENTRO do iframe do player não chega à página,
// então também conta o mouse entrando no player e o clique nele (o iframe pega o foco: blur).
// No navegador compartilhado ela fica: é ali que diz como voltar a andar.
let focoHudTimer = 0;
function mostrarFocoHud() {
  if (state.focus?.kind !== 'tv') return;
  const hud = $('#tv-focus-hud');
  hud.classList.remove('sumido');
  clearTimeout(focoHudTimer);
  if (tv.state.provider === 'browser') return;
  focoHudTimer = setTimeout(() => {
    if (hud.matches(':hover')) mostrarFocoHud(); // com o mouse em cima do Sair, espera
    else hud.classList.add('sumido');
  }, 2500);
}
for (const ev of ['pointermove', 'pointerdown', 'pointerover']) {
  document.addEventListener(ev, mostrarFocoHud, { passive: true });
}
window.addEventListener('blur', () => setTimeout(mostrarFocoHud, 0));
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
  if (name === 'settings') {
    populateDevices();
    // as seções dos ajustes abrem fechadas: cada um abre só a que procura
    for (const d of document.querySelectorAll('#panel .aj-sec')) d.open = false;
  }
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
const helpMaisBtn = $('#help-mais-btn');
const helpExtra = $('#help-extra');
if (helpMaisBtn && helpExtra) {
  helpMaisBtn.addEventListener('click', () => {
    const aberto = !helpExtra.hidden;
    helpExtra.hidden = aberto;
    helpMaisBtn.classList.toggle('aberto', !aberto);
    const rotulo = helpMaisBtn.querySelector('span');
    if (rotulo) rotulo.textContent = !aberto ? 'Menos atalhos' : 'Mais atalhos';
  });
}
$('#hud-btn-jogos')?.addEventListener('click', () => {
  catalogo.aberto ? catalogo.fechar() : catalogo.abrir();
});
$('#hud-btn-galera')?.addEventListener('click', () => {
  const amigos = [...state.users.values()];
  if (!amigos.length) return toast('Nenhum outro jogador na sala no momento.', 'info');
  if (amigos.length === 1) {
    irAte(amigos[0]);
    toast(`Teleportado para ${amigos[0].name}!`, 'info');
  } else {
    openPanel('people');
    toast('Escolha um amigo na lista para ir até ele!', 'info');
  }
});

// ------------------------------------------------------------------ bússola
// A faixa no topo: para onde fica cada área do mapa desta sala (AREAS, as mesmas do mapa da tela) e
// cada amigo. As etiquetas nunca se encavalam: as que se encostam se afastam em bloco
// (espalharNaFaixa) e só uma abre com o nome e a distância (a do meio, ou a que está sob o mouse).
// Clicar numa leva até lá; no celular o primeiro toque abre o nome e o segundo leva. Clicar no resto
// da faixa abre o mapa.
const bussolaCanvas = $('#bussola-canvas');
const bussolaCtx = bussolaCanvas?.getContext('2d');
const TEMA_ID = MAPA_INFO.tema.id;
const ICONE_AREA = {
  predio: '🎬', praca: '⛲', kart: '🏎️', jogos: '🎲', estadio: '⚽', quadras: '🏀', autodromo: '🏁', aventura: '🌀',
  lago: { neve: '⛸️', outono: '🎏' }[TEMA_ID] || '🌊',
  parque: TEMA_ID === 'outono' ? '⛩️' : '🎡',
};
const BUS_FOV = Math.PI * 0.72;
const BUS_ALT = 22; // altura de cada etiqueta
const BUS_FECHADA = 26; // largura só com o ícone
const BUS_FOLGA = 4; // espaço mínimo entre duas etiquetas
const BUS_BORDA = 6;
const FONTE_BUS = '700 11.5px "Plus Jakarta Sans", sans-serif';
const FONTE_ICONE = '13px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
let alvosBussola = [];
let focoBussola = null; // a chave da etiqueta aberta
let fixoBussola = null; // { chave, ate }: a que o toque abriu (celular)
let mouseBussola = null; // x do mouse sobre a faixa
let tempoBussola = 0;
const largBussola = new Map(); // chave -> largura de agora (anima ao abrir e fechar)
let tamBussola = { w: 0, h: 0 };
if (bussolaCanvas) new ResizeObserver(([e]) => { tamBussola = { w: e.contentRect.width, h: e.contentRect.height }; }).observe(bussolaCanvas);

// Põe cada etiqueta o mais perto possível do seu x ideal sem encostar nas vizinhas: as que se
// encostam viram um bloco, centrado na média dos ideais, que não passa de [min, max].
// itens: [{ x (o centro ideal), w }] em ordem de x; grava em cada um o centro final (cx).
function espalharNaFaixa(itens, min, max) {
  const blocos = [];
  const inicio = (b) => Math.min(Math.max(b.soma / b.itens.length, min), max - b.larg);
  for (const it of itens) {
    it.off = it.w / 2;
    blocos.push({ itens: [it], larg: it.w, soma: it.x - it.off });
    while (blocos.length > 1) {
      const b = blocos[blocos.length - 1];
      const a = blocos[blocos.length - 2];
      if (inicio(a) + a.larg + BUS_FOLGA <= inicio(b)) break;
      const desloca = a.larg + BUS_FOLGA;
      for (const m of b.itens) m.off += desloca;
      a.soma += b.soma - b.itens.length * desloca;
      a.larg += BUS_FOLGA + b.larg;
      a.itens.push(...b.itens);
      blocos.pop();
    }
  }
  for (const b of blocos) {
    const x0 = inicio(b);
    for (const m of b.itens) m.cx = x0 + m.off;
  }
}

function renderBussola() {
  const { w, h } = tamBussola;
  if (!bussolaCtx || !state.joined || !w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (bussolaCanvas.width !== Math.round(w * dpr) || bussolaCanvas.height !== Math.round(h * dpr)) {
    bussolaCanvas.width = Math.round(w * dpr);
    bussolaCanvas.height = Math.round(h * dpr);
  }
  const agora = performance.now();
  const dt = Math.min(0.1, (agora - tempoBussola) / 1000);
  tempoBussola = agora;
  const ctx = bussolaCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(0, 0, w, h, h / 2) : ctx.rect(0, 0, w, h);
  ctx.fill();

  const cx = w / 2;
  const meia = w / 2 - 16;
  const px = player.pos.x;
  const pz = player.pos.z;
  const sy = Math.sin(player.yaw);
  const cy = Math.cos(player.yaw);
  // o ângulo de uma direção em relação a para onde se olha: positivo é à direita da câmera
  const angulo = (dx, dz) => Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy);
  const xDe = (a) => cx + (a / (BUS_FOV / 2)) * meia;
  const visivel = (a) => Math.abs(a) < BUS_FOV / 2;
  // perto da beira do campo de visão a etiqueta some aos poucos, em vez de pular para fora
  const alfaDe = (a) => Math.min(1, (BUS_FOV / 2 - Math.abs(a)) / 0.14);

  let itens = [];
  for (const [id, a] of Object.entries(AREAS)) {
    const dx = a.ir.pos[0] - px;
    const dz = a.ir.pos[2] - pz;
    const dist = Math.hypot(dx, dz);
    const ang = angulo(dx, dz);
    if (dist < 15 || !visivel(ang)) continue;
    itens.push({ chave: `a:${id}`, tipo: 'area', id, icone: ICONE_AREA[id] || '📍', nome: a.nome, cor: a.cor, dist, x: xDe(ang), alfa: alfaDe(ang) });
  }
  for (const u of state.users.values()) {
    const pos = u.avatar?.group?.position;
    if (u.isSelf || !pos) continue;
    const dx = pos.x - px;
    const dz = pos.z - pz;
    const dist = Math.hypot(dx, dz);
    const ang = angulo(dx, dz);
    if (dist < 2.5 || !visivel(ang)) continue;
    const inicial = (u.name || '?').trim().charAt(0).toUpperCase() || '?';
    itens.push({ chave: `u:${u.id}`, tipo: 'user', user: u, icone: inicial, nome: u.name, cor: u.color || '#93c5fd', dist, x: xDe(ang), alfa: alfaDe(ang) });
  }

  // a etiqueta aberta: a que o toque abriu; senão a que está sob o mouse; senão a que está embaixo
  // da setinha; senão a mais perto do meio (com uma folga para a de agora, para não ficar trocando
  // entre duas quase empatadas)
  if (fixoBussola && agora > fixoBussola.ate) fixoBussola = null;
  const existe = (chave) => chave && itens.some((it) => it.chave === chave);
  const sobMouse = (a) => mouseBussola != null && mouseBussola >= a.xMin && mouseBussola <= a.xMax;
  let foco = existe(fixoBussola?.chave) ? fixoBussola.chave : null;
  if (!foco && mouseBussola != null) {
    const atual = alvosBussola.find((a) => a.chave === focoBussola);
    foco = atual && sobMouse(atual) ? atual.chave : alvosBussola.find(sobMouse)?.chave ?? null;
    if (!existe(foco)) foco = null;
  }
  // a que está embaixo da setinha do meio (a de agora fica enquanto continuar embaixo dela)
  const noMeio = (a) => a.xMin <= cx && a.xMax >= cx;
  if (!foco) {
    const atual = alvosBussola.find((a) => a.chave === focoBussola);
    foco = atual && noMeio(atual) ? atual.chave : alvosBussola.find(noMeio)?.chave ?? null;
    if (!existe(foco)) foco = null;
  }
  if (!foco) {
    let melhor = 34;
    for (const it of itens) {
      const d = Math.abs(it.x - cx) - (it.chave === focoBussola ? 10 : 0);
      if (d < melhor) {
        melhor = d;
        foco = it.chave;
      }
    }
  }
  focoBussola = foco;

  // larguras: a aberta cresce até caber o nome; as outras fecham no ícone
  const k = 1 - Math.exp(-dt * 16);
  ctx.textBaseline = 'middle';
  for (const it of itens) {
    it.rotulo = `${it.nome} · ${Math.round(it.dist)} m`;
    ctx.font = FONTE_BUS;
    const alvo = it.chave === foco ? BUS_FECHADA + ctx.measureText(it.rotulo).width + 10 : BUS_FECHADA;
    const antes = largBussola.get(it.chave) ?? BUS_FECHADA;
    it.w = Math.abs(alvo - antes) < 0.5 ? alvo : antes + (alvo - antes) * k;
    it.aberta = it.chave === foco;
  }
  largBussola.clear();
  for (const it of itens) largBussola.set(it.chave, it.w);
  // se não cabem todas, saem as mais longe (nunca a aberta)
  const cabe = w - BUS_BORDA * 2;
  const ocupa = () => itens.reduce((s, it) => s + it.w, 0) + BUS_FOLGA * Math.max(0, itens.length - 1);
  if (ocupa() > cabe) {
    const porDist = itens.filter((it) => !it.aberta).sort((a, b) => b.dist - a.dist);
    const sai = new Set();
    let total = ocupa();
    for (const it of porDist) {
      if (total <= cabe) break;
      sai.add(it);
      total -= it.w + BUS_FOLGA;
    }
    itens = itens.filter((it) => !sai.has(it));
  }
  itens.sort((a, b) => a.x - b.x);
  espalharNaFaixa(itens, BUS_BORDA, w - BUS_BORDA);

  // a régua: um risquinho a cada 15° e as letras N, L, S, O onde nenhuma etiqueta está por cima
  const y0 = (h - BUS_ALT) / 2;
  const livre = (x) => itens.every((it) => x < it.cx - it.w / 2 - 6 || x > it.cx + it.w / 2 + 6);
  ctx.textAlign = 'center';
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const ang = angulo(Math.sin(t), Math.cos(t));
    if (!visivel(ang)) continue;
    const x = xDe(ang);
    ctx.globalAlpha = alfaDe(ang);
    if (i % 6 === 0) {
      if (!livre(x)) continue;
      ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = i === 0 ? '#f87171' : '#94a3b8';
      ctx.fillText('NLSO'[i / 6], x, h / 2 + 0.5);
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.fillRect(x - 0.5, h - (i % 3 === 0 ? 6 : 4), 1, i % 3 === 0 ? 4 : 2);
    }
  }

  alvosBussola = [];
  for (const it of itens) {
    const bx = it.cx - it.w / 2;
    ctx.globalAlpha = it.alfa;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, y0, it.w, BUS_ALT, BUS_ALT / 2) : ctx.rect(bx, y0, it.w, BUS_ALT);
    ctx.fillStyle = it.tipo === 'user' ? 'rgba(29, 78, 216, 0.95)' : 'rgba(15, 23, 42, 0.96)';
    ctx.fill();
    ctx.strokeStyle = it.cor;
    ctx.lineWidth = it.aberta ? 2 : 1.25;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.textAlign = 'center';
    if (it.tipo === 'user') {
      ctx.font = '800 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#eff6ff';
    } else {
      ctx.font = FONTE_ICONE;
    }
    ctx.fillText(it.icone, bx + BUS_FECHADA / 2, h / 2 + 0.5);
    if (it.w > BUS_FECHADA + 4) {
      ctx.font = FONTE_BUS;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(it.rotulo, bx + BUS_FECHADA - 3, h / 2 + 0.5);
    }
    ctx.restore();
    alvosBussola.push({ xMin: bx, xMax: bx + it.w, chave: it.chave, tipo: it.tipo, id: it.id, user: it.user, nome: it.nome });
  }
  ctx.globalAlpha = 1;
  // o meio: para onde você está olhando
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.moveTo(cx - 4, 0);
  ctx.lineTo(cx + 4, 0);
  ctx.lineTo(cx, 4.5);
  ctx.closePath();
  ctx.fill();
}
bussolaCanvas?.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') mouseBussola = e.clientX - bussolaCanvas.getBoundingClientRect().left;
});
bussolaCanvas?.addEventListener('pointerleave', () => { mouseBussola = null; });
bussolaCanvas?.addEventListener('click', (e) => {
  const x = e.clientX - bussolaCanvas.getBoundingClientRect().left;
  // a etiqueta tocada, com uma folga para o dedo (a mais perto, se duas estão dentro da folga)
  let alvo = alvosBussola.find((a) => x >= a.xMin && x <= a.xMax);
  if (!alvo) {
    const perto = alvosBussola.map((a) => ({ a, d: Math.max(a.xMin - x, x - a.xMax) })).filter((p) => p.d <= 6).sort((p, q) => p.d - q.d);
    alvo = perto[0]?.a;
  }
  if (!alvo) return abrirMapa();
  // no celular não tem mouse por cima: o primeiro toque abre o nome, o segundo leva
  if (isTouch && alvo.chave !== focoBussola) {
    fixoBussola = { chave: alvo.chave, ate: performance.now() + 5000 };
    return;
  }
  fixoBussola = null;
  if (alvo.tipo === 'user') {
    irAte(alvo.user);
    toast(`Teleportado para ${alvo.user.name}!`, 'info');
  } else {
    irParaArea(alvo.id);
    toast(`Teleportado para ${alvo.nome}!`, 'info');
  }
});

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
// computador: os ícones dos painéis ficam num menu só, ao lado de Ajustes e Tela cheia (no
// celular o menu não existe: eles continuam na grade do ⋯). Escolheu um, clicou fora ou Esc: fecha.
{
  const wrap = $('.bar-menu-wrap');
  const btn = $('#btn-menu');
  const aberto = () => wrap.classList.contains('aberto');
  const abrir = (on) => {
    wrap.classList.toggle('aberto', on);
    btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', () => abrir(!aberto()));
  $('#bar-menu').addEventListener('click', (e) => { if (e.target.closest('button')) abrir(false); });
  document.addEventListener('pointerdown', (e) => { if (aberto() && !wrap.contains(e.target)) abrir(false); }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !aberto()) return;
    e.stopImmediatePropagation();
    abrir(false);
  }, true);
}
$('#btn-leave').addEventListener('click', () => {
  pararTodasAsTelas(true);
  for (const m of ['ps5', 'pc']) diretas.larga(m); // inclusive a que ainda estava voltando
  socket?.disconnect();
  rtc?.closeAll();
  liberarSaida();
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
bindToggle('#set-por-jogo', 'porJogo', updateVolumes);
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
  renderTexturas(); // na Automática, as texturas seguem a qualidade fixa
});

// ------------------------------------------------------------------ texturas do mapa
// Fotos no chão e árvores de folhas recortadas (detalhadas) ou a versão de antes, de cor lisa
// (simples). O mundo é montado ao abrir a página: a escolha vale ao recarregar (ver qualidade.js).
if (!(moduloQualidade.OPCOES_TEXTURAS || ['auto']).includes(settings.texturas)) settings.texturas = 'auto';
const texturasAgora = moduloQualidade.TEXTURAS_DETALHADAS ?? true;
const texturasQuer = () => moduloQualidade.texturasDetalhadas?.(settings) ?? texturasAgora;
function renderTexturas() {
  $$('#set-texturas button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.texturas));
  const nome = (d) => (d ? 'detalhadas' : 'simples');
  let dica = settings.texturas === 'auto'
    ? `Detalhadas com placa de vídeo boa (qualidade Alta) e simples no resto. Agora: ${nome(texturasAgora)}.`
    : settings.texturas === 'detalhadas'
      ? 'Fotos no chão, árvores e arbustos com folhas recortadas e pedras com relevo.'
      : 'A versão leve, de cor lisa: para PC fraco e celular.';
  if (texturasQuer() !== texturasAgora) dica += ` As ${nome(texturasQuer())} entram ao recarregar a página.`;
  $('#texturas-hint').textContent = dica;
}
renderTexturas();
$('#set-texturas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  settings.texturas = b.dataset.value;
  saveSettings();
  renderTexturas();
  if (texturasQuer() !== texturasAgora) {
    toast(`As texturas ${texturasQuer() ? 'detalhadas' : 'simples'} entram ao recarregar a página.`, 'info', 8000, null,
      { rotulo: 'Recarregar', fazer: () => { liberarSaida(); location.reload(); } });
  }
});

// ------------------------------------------------------------------ distância de visão
// Metros até onde o 3D é desenhado (0 = tudo, até a serra). Para PC fraco: menos mato, morro e prédio
// ao longe para a placa de vídeo pintar; a névoa esconde onde o mundo acaba (World.setDistancia).
const DISTANCIAS = {
  longe: { metros: 0, dica: 'Desenha tudo, até a serra no horizonte.' },
  media: { metros: 700, dica: 'Até uns 700 m: a serra some na névoa e sobra placa de vídeo.' },
  perto: { metros: 300, dica: 'Até uns 300 m, com a névoa mais perto. Para PC fraco.' },
};
if (!DISTANCIAS[settings.distancia]) settings.distancia = 'longe';
function renderDistancia() {
  $$('#set-distancia button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.distancia));
  $('#distancia-hint').textContent = DISTANCIAS[settings.distancia].dica;
}
world.setDistancia(DISTANCIAS[settings.distancia].metros);
renderDistancia();
$('#set-distancia').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  settings.distancia = b.dataset.value;
  saveSettings();
  world.setDistancia(DISTANCIAS[settings.distancia].metros);
  renderDistancia();
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
    if (mapaTela.aberto) mapaTela.fechar();
    else if (avisoSite.aberto) avisoSite.esc();
    else if (typing()) document.activeElement.blur();
    else if (!$('#tela-mais').hidden) fecharMenuDaTela(true);
    else if (guia.aberto) guia.fechar();
    else if (escolha.aberto) escolha.fechar();
    else if (catalogo.aberto) catalogo.fechar();
    else if (mesa.aberta) fecharMesa(true);
    // Esc duas vezes seguidas no modo jogo (o primeiro foi para o jogo, ver controle.js): desliga o
    // modo jogo e fica na tela em foco, com os botões — não volta direto para a sala
    else if (state.focus && controle.jogoNo && controle.jogoNo === $('#focus-video')) desligarModoJogoNoFoco();
    else if (state.focus) sairDoFoco();
    else if (!$('#react-pop').hidden) $('#react-pop').hidden = true;
    else if (state.panel) closePanel();
    else sairDoJogo(); // futebol, céu, gincana, kart... ou preso no parkour
    return;
  }
  if (typing() || e.repeat || guia.aberto || escolha.aberto || catalogo.aberto || avisoSite.aberto || !$('#tela-mais').hidden) return;
  // jogando futebol de carro: as letras são do carro (futebol.js); ficam só microfone, câmera,
  // chat e esconder a tela
  if (futebol.jogando && !['KeyM', 'KeyK', 'KeyT', 'Enter', 'KeyH'].includes(e.code)) return;
  if (e.code === 'KeyE' && usarEDosJogos()) return; // futebol, boliche, parque e portais do céu
  if (fantasmas.tecla(e)) return; // dentro da casa assombrada: aparelhos, lanterna e diário
  // em times: N troca de time; assistindo, as setas trocam de quem se assiste
  if (batalha.ativo && !state.focus && e.code === 'KeyN') {
    batalha.trocarTime();
    return;
  }
  if (e.code === 'KeyN' && !state.focus) {
    criador.falarInicio();
    return;
  }
  if (e.code === 'KeyU' && !state.focus) {
    criador.abrirCatalogo();
    return;
  }
  if (batalha.espectando && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    batalha.trocarAlvo(e.code === 'ArrowRight' ? 1 : -1);
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
  if (['jogo', 'dados', 'sinuca', 'cartas', 'poker'].includes(state.focus?.kind) && !['KeyE', 'KeyM', 'KeyT', 'Enter'].includes(e.code)) return;
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
      teclaR(); // no surf volta para a etapa; no mata-mata recarrega
      break;
    case 'KeyV':
      toggleView();
      break;
    case 'KeyL':
      abrirMapa();
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
    case 'KeyY':
      darTapa();
      break;
    case 'KeyZ':
      if (temSniper() && !cartas.ativa) ligarLuneta(!luneta); // sentado nas cartas, o Z zoa a mesa (cartas.js)
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
  else if (temArma() || criador.armado) puxarGatilho();
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

// O E dos jogos (tecla ou o botão E do celular): futebol, boliche, jogos do parque e os portais
// do céu. Devolve se algum usou.
function usarEDosJogos() {
  if (state.focus) return false;
  if (futebol.pertoDaEntrada()) { futebol.entrar(); return true; }
  if (quadras.usarE() || jogosDoParque.some((j) => j.usarE?.())) return true;
  if (surf.pertoDoPortal()) { surf.entrar(); return true; }
  if (mataMata.pertoDoPortal()) { mataMata.entrar(); return true; }
  if (batalha.pertoDoPortal()) { batalha.entrar(); return true; }
  return false;
}

// O R (tecla ou o botão de voltar do celular): cada jogo decide o que é "voltar"
function teclaR() {
  if (state.focus) return;
  if (surf.ativo) { surf.voltar(); return; }
  if (jogosDoParque.some((j) => j.teclaR?.())) return; // gincana: volta no último ponto
  if (temArma() && recarregar()) return;
  if (!mataMata.ativo && !batalha.ativo) respawn(); // no mata-mata o R só recarrega
}

// Sair do jogo em que se está (o Esc do teclado; no celular, o X do canto). Devolve se saiu.
function sairDoJogo() {
  if (futebol.jogando) futebol.sair();
  else if (surf.ativo) surf.sair();
  else if (mataMata.ativo) mataMata.sair();
  else if (batalha.ativo) batalha.sair();
  else if (jogosDoParque.some((j) => j.esc?.())) { /* gincana, pinta e kart (correndo) saem */ }
  else if (kart.inscrito) {
    kart.sairDaCorrida(); // esperando a largada
    hudJogos.mensagem('Saiu do kart', '', 1200);
  } else if (sinuca.sair()) { /* andando entre as tacadas, longe da mesa */ }
  else if (run.state !== 'idle') run.abandon();
  else return false;
  return true;
}

// Em que jogo a pessoa está agora (ou ''): no celular, isso deixa a tela só com o que o jogo usa
// (body[data-jogo]), e o X do canto aparece quando o jogo não tem um E para sair
function jogoAtual() {
  if (futebol.jogando) return 'futebol';
  if (surf.ativo) return 'surf';
  if (mataMata.ativo) return 'matamata';
  if (batalha.ativo) return 'batalha';
  if (gincana.dentro) return 'gincana';
  if (fantasmas.dentro) return 'fantasmas';
  if (kart.ativo() || (kart.ligado() && kart.inscrito)) return 'kart';
  if (pinta.ativo()) return 'pinta';
  if (queimada.ativo()) return 'queimada';
  if (pingue.ativo()) return 'pingue';
  if (sinuca.ativo()) return 'sinuca';
  if (golfe.ativo()) return 'golfe';
  if (quadras.ativo()) return 'quadras';
  if (player.veiculo && (corrida.naPista || corrida.ativa)) return 'corrida';
  if (combat.inRing) return 'ringue';
  if (run.state !== 'idle') return 'parkour';
  return '';
}
const SAI_COM_X = ['futebol', 'surf', 'matamata', 'batalha', 'gincana', 'fantasmas', 'kart', 'pinta', 'parkour', 'sinuca'];
let jogoNaTela = '';
let armadoNaTela = false;
function marcarJogoAtual() {
  const j = state.joined && !state.focus ? jogoAtual() : ''; // num foco (sinuca, cartas) a barra fica
  if (j === jogoNaTela) return;
  jogoNaTela = j;
  if (j) document.body.dataset.jogo = j;
  else {
    delete document.body.dataset.jogo;
    document.body.classList.remove('barra-aberta');
  }
  const x = $('#tb-sair-jogo');
  if (x) x.hidden = !SAI_COM_X.includes(j);
}

// Ponto de inspeção para testes automatizados. Só existe com ?debug=1 na URL —
// em uso normal nada disso fica exposto.
if (params.get('debug') === '1') {
  window.__sala3d = {
    state, player, combat, run, corrida, world, settings, punch, goToRing, respawn, mataMata, batalha, anuncios,
    toggleVeiculo, irParaLargada, jogos, irParaMesa, exitFocus, dados, quadras, jogosDoParque, pingue, queimada, sinuca, golfe, cartas, poker, gincana, fantasmas, kart, pinta,
    tocarTela, telasMudas, liberarSomDasTelas, makeVideo, mesa, controle, abrirMesa, fecharMesa, marcaDaAba,
    publishShare, stopShare, acharTela, telasNoAr, get rtc() { return rtc; }, diagJogo, clima, ligarLuneta, futebol, surf, criador, run,
    enterFocus, get socket() { return socket; }, fisico, toqueJogo, opcoesJogo, turboRecebe, turboEnvio, ps5Nativo, pcDireto,
    travado, salaEscondida, musica,
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
    // no celular: o E e a ação aparecem perto de um jogo (e dos portais do céu e do futebol)
    touchPad?.setJogo({
      e: livre && (/kbd>E</.test(d) || /kbd>E</.test(quadras.dicaAntes || '') || futebol.pertoDaEntrada()
        || surf.pertoDoPortal() || mataMata.pertoDoPortal() || batalha.pertoDoPortal()),
      acao: livre && (quadras.ativo() || jogosDoParque.some((j) => j.ativo?.())),
    });
  }
  marcarJogoAtual();
  hudAoSentar();
  // a arma do mata-mata chega pela rede e pode trocar depois do aviso ao boneco: o botão de
  // atirar do celular confere aqui
  if (temArma() !== armadoNaTela) {
    armadoNaTela = temArma();
    poderesMudaram();
  }
  dicaDoPortal(state.focus || state.panel ? '' : surf.pertoDoPortal() ? 'Ir para o surf' : mataMata.pertoDoPortal() ? 'Entrar no mata-mata'
    : batalha.pertoDoPortal() ? 'Entrar no mata-mata em times' : '');
  if (batalha.ativo && !jogoLigado('batalha')) batalha.sair(); // o dono da sala desligou
  if (futebol.jogando && !jogoLigado('futebol')) futebol.sair(); // o dono da sala desligou
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
const mundoVisivel = () => !mesa.aberta && state.focus?.kind !== 'share' && !jogoNoMeuPc();

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
  if (escolha.aberto || catalogo.aberto || guia.aberto || !escolherTelaEl.hidden || !telaMaisEl.hidden || (isTouch && state.panel)) return 20;
  if (!state.joined && (isTouch || innerWidth <= 860)) return 20;
  if (economiaLigada) return 30;
  return TETO_TOQUE;
}

// o porquê do teto, para o chip de FPS (null: os quadros medidos dizem tudo)
function motivoDoTeto(teto) {
  if (jogoNoMeuPc()) return 'jogo no seu PC';
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
  // quem segura é o aparelho (no iPhone: Pouca Energia ou aquecido), não a sala: baixar gráfico
  // não muda nada, e o chip diz isso
  if (!motivo && qualidade.presoNoSistema) texto += ' · limite do aparelho';
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
// Sentado nas cartas ou no poker: quem está entre a câmera e a mesa (passando atrás da cadeira, em
// pé em cima dela) some para mim, como atrás da parede. Quem está sentado nesta mesa sempre aparece.
function tampaAMesa(u) {
  const M = cartas.ativa || poker.ativa;
  const o = player.override;
  if (!M || !o || M.e?.lugares?.some((l) => l?.id === u.id)) return false;
  const p = u.avatar.group.position;
  const a = o.position;
  const dx = o.target.x - a.x;
  const dz = o.target.z - a.z;
  const k = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1);
  if (k < -0.2 || k > 1) return false;
  return Math.hypot(a.x + dx * k - p.x, a.z + dz * k - p.z) < 0.9;
}
// Na mesma mesa, um personagem grande (o Optimus "senta" de pé, com quase 3 m) fica do tamanho de
// um boneco sentado, só para mim: senão tampa a mesa. A altura é a da pose de agora, medida uma vez
// por segundo; levantou (ou eu saí), volta ao tamanho dele.
const ALTO_SENTADO = 1.5; // do assento ao topo da cabeça do boneco padrão sentado
const _caixaMesa = new THREE.Box3();
function caberNaMesa(u, t) {
  const a = u.avatar;
  const M = cartas.ativa || poker.ativa;
  if (!M || !player.override || !a.personagem || !M.e?.lugares?.some((l) => l?.id === u.id)) {
    if (a.inner.scale.x !== 1) a.inner.scale.setScalar(1);
    u.medidoNaMesa = null;
    return;
  }
  if (u.medidoNaMesa != null && t - u.medidoNaMesa < 1) return;
  u.medidoNaMesa = t;
  _caixaMesa.setFromObject(a.personagem.grupo, true);
  const alto = (_caixaMesa.max.y - a.group.position.y) / a.inner.scale.x;
  a.inner.scale.setScalar(alto > ALTO_SENTADO ? ALTO_SENTADO / alto : 1);
}
const zoomDaCamera = () => TAN_FOV / Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2));
function atualizarAvatares(dt, t, desenhando) {
  const cam = world.camera.position;
  const zoom = zoomDaCamera();
  for (const u of state.users.values()) {
    if (u.isSelf) continue;
    const a = u.avatar;
    // jogando futebol de carro: quem aparece é o carro dele no campo (futebol.js), não o boneco
    // (e no caça-fantasmas, quem morreu ou está escondido no armário some)
    const noCampo = futebol.joga(u.id) || fantasmas.oculto(u.id);
    if (a.group.visible === noCampo) a.group.visible = !noCampo;
    if (noCampo) continue;
    caberNaMesa(u, t);
    if (!a.animarCom) {
      a.update(dt, t);
      continue;
    }
    a.mover(dt, t);
    u.tampa = tampaAMesa(u); // o nome some junto (lodDosBonecos): perto da câmera ficaria enorme
    a.setOculto((world.escondido?.(a.group.position) ?? false) || u.tampa);
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
    const nome = !u.tampa && (u.distLod / zoom < b.nomes + (a.lod.nome ? 5 : 0) || u.speaking || u.shares.size > 0);
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
  contextoPerdido = null;
  if (world.liberada) return; // de propósito: celular jogando (placaNoJogo)
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
  // o 3D solto no jogo (placaNoJogo) e a sala de volta à vista por outro caminho: devolve
  if (desenhando && world.liberada) world.devolverPlaca();
  quadrosDaSala++;
  world.update(t); // plataformas móveis e escritório andam mesmo sem desenhar (quem está em cima)
  clima.update(dt, t);
  balancarLuneta(t);

  if (state.joined) {
    if (futebol.jogando) futebol.update(dt); // no campo: o carro do futebol no lugar do boneco
    else {
      player.noGelo = naPistaDeGelo(player.pos);
      player.update(dt);
    }
    futebol.animar(dt);
    quadras.update(dt, t);
    for (const j of jogosDoParque) j.update(dt, t);
    surf.update(dt);
    criador.update(dt, t);
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
    musica.abafar(alguemFalando(), dt);
    sendState(dt);
    updateHover();
    updateSitHint();
    renderBussola();
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
  // modo jogo: copia o relatório (o da sessão ligada ou o da última) para mandar
  relatorioJogo: () => diagJogo.copiar(),
  baixarRelatorioJogo: () => diagJogo.baixar(),
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
// a sala está ligada: a barra de carregamento do formulário de entrada some
entrada?.pronto();
