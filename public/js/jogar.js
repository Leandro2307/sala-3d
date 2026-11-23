// Modo jogo do PC (/jogar): a sala principal sem o mundo 3D — só a tela do PC ou do PS5 e o mesmo modo jogo
// da sala (os mesmos módulos: controle.js, turbo.js, teclado-pad.js, gamepad-jogo.js, ps5-touchpad.js,
// jogo-opcoes.js, jogo-diag.js). Nasceu dos testes de 2026-11-23: no mesmo notebook, PS5 no Turbo, a página
// leve deu ~44 ms de imagem e a sala ~89 (decodificador a 13 ms por quadro e o liso no teto de 45 ms).
// A sala continua a principal; esta página não muda nada nela.
//
// O que é igual à sala: teclado e mouse (mouse preso, menu automático), controle de videogame, DualSense
// pelo WebHID (gatilhos, vibração, touchpad), modo carro, legenda, mapear teclas, tutorial, modos de imagem,
// Turbo com as mesmas vidas e folgas, som, lan house (vez, contador, teste grátis, aluguel) e o relatório
// ("conta (jogar)" na lista do npm run relatorios). O que fica de fora: 3D, minijogos, webcams, chat, e
// compartilhar a própria tela.
//
// Diferença de propósito: abrir a página só assiste. Mouse e teclado só vão para o jogo com "Modo jogo" ou
// "Controlar" (na sala a pessoa abre a tela de propósito; aqui ela abre com a página).
//
// A receita é a da TV (tv.js), que o usuário achou melhor no PC (2026-11-23): a imagem medida empatava (~47
// ms), e o que sobrava de diferente o relatório não via —
//   - o controle pela Gamepad API, lido a cada 8 ms, com o botão saindo na hora. Pelo WebHID (a sala), o
//     giroscópio do DualSense muda sempre e ocupa o envio de 12 em 12 ms: o botão esperava a vez dele. O
//     DualSense direto (gatilhos, touchpad, giroscópio) fica nas Opções, desligado de fábrica;
//   - sem o realce de nitidez (um shader por quadro na placa integrada) e só H.264;
//   - os canais do Turbo sem prazo de entrega (?canal=prazo volta ao da sala, para comparar).
import { RTC } from './rtc.js';
import { Controle } from './controle.js';
import { TurboRecebe, TTL_MS, LISO_PCT, LISO_MAX } from './turbo.js';
import { DiagJogo } from './jogo-diag.js';
import { linhaDaCulpa } from './culpa.js';
import { opcoesJogo, LISO_MS, PRESETS, OPCOES_DO_PRESET, htmlPresets, marcarPresets } from './jogo-opcoes.js';
import { LAYOUTS, layoutDoTitulo } from './toque-jogo.js';
import { ControleFisico } from './gamepad-jogo.js';
import { PadVirtual } from './pad-virtual.js';
import { TecladoPad } from './teclado-pad.js';
import { MapaTeclasPainel, dicaTeclado, legendaBotoes, mapaTeclas, nomeEntrada } from './mapa-teclas.js';
import { TutorialControle } from './tutorial-controle.js';
import { Ps5Touchpad, temTouchpadHid } from './ps5-touchpad.js';
import { AvisoDoSite } from './aviso-site.js';
import { isTouch } from './touch.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const SALA = 'principal';
const LAN_CHAVE = 'sala3d-lan';
const PASSES_CHAVE = 'sala3d-passes';
const AJUSTES_CHAVE = 'sala3d-jogar';
const VOLTAR_CHAVE = 'sala3d-jogar-voltar';
const VOLTAR_MS = 3 * 60_000;
const CANAL_CONFIAVEL = params.get('canal') !== 'prazo';
const NOME_MAQ = { pc: 'PC', ps5: 'PS5' };

const lerJSON = (k, padrao) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? padrao; } catch { return padrao; }
};
const gravarJSON = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ }
};
const limitar = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
let conta = lerJSON(LAN_CHAVE, null); // { nome, token }: o mesmo da sala e da /lan
let passe = lerJSON(PASSES_CHAVE, {})[SALA] || null;
// nitidez e dualsense são daqui (as opções da sala, guardadas no mesmo navegador, não mudam)
const ajustes = { jogo: 100, voz: 100, nitidez: false, dualsense: false, ...lerJSON(AJUSTES_CHAVE, {}) };
const ENVIO_PAD_MS = 8;

const st = {
  selfId: null,
  users: new Map(), // id -> { id, name, shares: Map(key -> share), streams: Map(id -> MediaStream), cam, audioEl }
  main: null,
  lan: null,
  alvo: null, // { u, sh }: a tela mostrada (e em que se joga)
  escolhida: null, // a tela escolhida à mão (chave)
  controlando: false, // "Controlar" ligado: mouse e teclado vão à tela mesmo fora do modo jogo
  entrou: false,
  semVoz: false, // escritório com salas à prova de som: aqui não há posição, então ninguém é ouvido
  interesse: new Map(),
};
let socket = null;
let rtc = null;
const video = $('#focus-video');
const sink = $('#media-sink');

// ------------------------------------------------------------------ avisos
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
    b.addEventListener('click', () => { fechar(); acao.fazer(); });
    el.appendChild(b);
    el.style.pointerEvents = 'auto';
  }
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(fechar, ms);
  return fechar;
}

// ------------------------------------------------------------------ entrar (conta e senha da sala)
const formEntrada = $('#entrada form');
function erroEntrada(txt) {
  $('#en-erro').hidden = !txt;
  $('#en-erro').textContent = txt || '';
}
function pedirEntrada({ conta: pedeConta = false, sala = false, erro = '' }) {
  $('#entrada').hidden = false;
  $('#en-nome-l').hidden = !pedeConta;
  $('#en-senha-l').hidden = !pedeConta;
  $('#en-sala-l').hidden = !sala;
  $('#en-texto').textContent = pedeConta
    ? 'Entre com a sua conta da sala. Primeira vez? A senha que você digitar vira a da sua conta.'
    : 'A sala principal tem senha. Peça a quem te convidou.';
  erroEntrada(erro);
  const campo = formEntrada.elements[pedeConta ? 'nome' : 'sala'];
  campo.focus();
}
async function post(url, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return r.json();
}
// true: pode entrar; false: o formulário ficou aberto pedindo o que falta
async function liberarSala(senha) {
  let r;
  try { r = await post('/sala-acesso', { sala: SALA, senha: senha || undefined, passe }); } catch { return true; } // o join confere de novo
  passe = r.ok ? r.passe || null : null;
  guardarPasse();
  if (r.ok) return true;
  pedirEntrada({ conta: !conta, sala: true, erro: r.erro || '' });
  return false;
}
function guardarPasse() {
  const passes = lerJSON(PASSES_CHAVE, {});
  if (passe) passes[SALA] = passe;
  else delete passes[SALA];
  gravarJSON(PASSES_CHAVE, passes);
}
formEntrada.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formEntrada.elements;
  const botao = formEntrada.querySelector('button');
  botao.disabled = true;
  erroEntrada('');
  try {
    if (!conta) {
      const nome = f.nome.value.trim().replace(/\s+/g, ' ');
      if (!nome || !f.senha.value) return erroEntrada('Digite o nome e a senha.');
      let r;
      try { r = await post('/lan/conta', { nome, senha: f.senha.value }); } catch { r = { ok: false, erro: 'Sem conexão. Tente de novo.' }; }
      if (!r.ok) return erroEntrada(r.erro || 'Não deu para entrar.');
      conta = { nome, token: r.token };
      gravarJSON(LAN_CHAVE, conta);
      f.senha.value = '';
    }
    if (!(await liberarSala(f.sala.value))) return;
    $('#entrada').hidden = true;
    conectar();
  } finally {
    botao.disabled = false;
  }
});

async function iniciar() {
  if (isTouch) {
    $('#jg-vazio').innerHTML = '<div><b>Esta página é para o computador</b><span>No celular, use a sala.</span></div>';
    return;
  }
  if (!conta?.token) {
    conta = null;
    return pedirEntrada({ conta: true });
  }
  if (await liberarSala()) conectar();
}

let conectando = false;
async function conectar() {
  if (conectando) return;
  conectando = true;
  let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  try { config = await (await fetch('/config')).json(); } catch { /* usa o padrão */ }
  socket = window.io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 1500, reconnectionDelayMax: 10000 });
  rtc = new RTC(socket, {
    iceServers: config.iceServers,
    onTrack: receberTrilha,
    onFalha: (id, temTurn) => {
      const u = st.users.get(id);
      if (!u || u.avisoFalha || id !== st.alvo?.u.id) return;
      u.avisoFalha = true;
      toast(temTurn ? `Não deu para conectar com ${u.name}. Recarregue a página.` : `Não deu para conectar com ${u.name}: as redes bloqueiam a conexão direta.`, 'error', 12000);
    },
  });
  rtc.onControle = receberDireto;
  rtc.onMicCaiu = () => {
    mic.ligado = false;
    mic.pronto = false;
    socket.emit('mic', false);
    mostrarMic();
    toast('O microfone foi desligado pelo sistema. Clique em Microfone para ligar de novo.', 'warn', 6000);
  };
  const renovar = () => fetch('/config').then((r) => r.json()).then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
  setInterval(renovar, 6 * 3600_000);
  if (!rtc.temTurn) {
    const semTurn = setInterval(() => { if (rtc.temTurn) clearInterval(semTurn); else renovar(); }, 10_000);
  }
  ligarSocket();
}

function entrar() {
  socket.emit('join', {
    room: SALA, name: conta?.nome, color: '#6ee7c8', mic: false, passe, lan: conta?.token || null, proto: 2,
  }, (data) => {
    if (data?.erro === 'conta') {
      try { localStorage.removeItem(LAN_CHAVE); } catch { /* sem armazenamento */ }
      return location.reload();
    }
    if (data?.erro === 'senha') {
      passe = null;
      guardarPasse();
      return location.reload();
    }
    if (!data?.selfId) return;
    st.entrou = true;
    st.selfId = data.selfId;
    rtc.selfId = data.selfId;
    st.main = data.main;
    if (data.passe) {
      passe = data.passe;
      guardarPasse();
    }
    aplicarSala(data.sala);
    for (const u of data.users) addUser(u);
    aplicarLan(data.lan);
    for (const u of data.users) rtc.getPeer(u.id);
    atualizar();
  });
}

function ligarSocket() {
  socket.on('connect', () => {
    diagJogo.marcar('conectou ao servidor', { id: socket.id, transporte: socket.io?.engine?.transport?.name ?? null });
    // reconexão: os ids mudaram e as conexões de vídeo eram com os antigos — começa de novo (o "Voltar ao
    // jogo" aparece quando a tela voltar)
    if (st.entrou) return location.reload();
    entrar();
  });
  socket.on('disconnect', (motivo) => {
    diagJogo.marcar('caiu a conexão com o servidor', { motivo: String(motivo || '') });
    lembrarJogo();
    if (st.entrou) $('#reconnecting').hidden = false;
  });
  socket.on('user-joined', (u) => {
    addUser(u);
    rtc.getPeer(u.id);
    atualizar();
  });
  socket.on('user-left', ({ id }) => {
    const u = st.users.get(id);
    u?.audioEl?.remove();
    st.users.delete(id);
    st.interesse.delete(id);
    rtc.removePeer(id);
    atualizar();
  });
  socket.on('user-update', (m) => {
    const u = st.users.get(m?.id);
    if (!u) return;
    if ('cam' in m) u.cam = m.cam;
    if (typeof m.name === 'string') u.name = m.name;
    if ('cam' in m) ouvirVoz(u);
  });
  socket.on('share-update', ({ id, key, streamId, gone, controle: pode, titulo, superficie }) => {
    const u = st.users.get(id);
    if (!u || typeof key !== 'string') return;
    if (gone || !pode) avisoSite.esquecer(key);
    if (gone) {
      const sh = u.shares.get(key);
      if (sh) u.streams.delete(sh.streamId);
      u.shares.delete(key);
    } else {
      const sh = u.shares.get(key) || { key };
      Object.assign(sh, { controle: !!pode, titulo: titulo ?? null, superficie: superficie ?? sh.superficie ?? null });
      if (streamId) sh.streamId = streamId;
      u.shares.set(key, sh);
      fisico.jogoDaTela(key, sh.titulo);
    }
    ouvirVoz(u);
    atualizar();
  });
  socket.on('main', ({ source }) => {
    st.main = source;
    atualizar();
  });
  socket.on('lan', aplicarLan);
  socket.on('sala', aplicarSala);
  socket.on('passe', (p) => {
    passe = p;
    guardarPasse();
  });
  socket.on('controle-volta', receberVolta);
}

function aplicarSala(s) {
  st.semVoz = s?.modulo === 'escritorio' && s.departamentos?.length > 0 && s.privacidade !== false;
  if (st.semVoz && mic.ligado) alternarMic();
  $('#jg-mic').hidden = st.semVoz;
  $('#jg-vol-voz').parentElement.hidden = st.semVoz;
  volumes();
}

function addUser(u) {
  const antes = st.users.get(u.id);
  const streams = antes?.streams || semDono.get(u.id) || new Map();
  semDono.delete(u.id);
  const novo = { id: u.id, name: u.name, cam: u.cam || null, shares: new Map((u.shares || []).map((sh) => [sh.key, { ...sh }])), streams, audioEl: antes?.audioEl || null };
  st.users.set(u.id, novo);
  ouvirVoz(novo);
}

// ------------------------------------------------------------------ voltar ao jogo depois de uma queda
function lembrarJogo() {
  if (!jogandoLa) return;
  const t = acharTela(jogandoLa.key);
  if (!t) return;
  try { sessionStorage.setItem(VOLTAR_CHAVE, JSON.stringify({ dono: t.u.name, maquina: maquinaDaTela(t.sh), em: Date.now() })); } catch { /* sem armazenamento */ }
}
function esquecerJogo() {
  try { sessionStorage.removeItem(VOLTAR_CHAVE); } catch { /* sem armazenamento */ }
}
function voltaAoJogo() {
  try {
    const v = JSON.parse(sessionStorage.getItem(VOLTAR_CHAVE) || 'null');
    return v && Date.now() - v.em < VOLTAR_MS ? v : null;
  } catch {
    return null;
  }
}
addEventListener('pagehide', lembrarJogo);

// ------------------------------------------------------------------ som e voz
const mic = { pronto: false, ligado: false };
// a voz é a trilha de quem não tem vídeo nela (a tela e a webcam têm) e que não é de uma tela
function ouvirVoz(u) {
  const daTela = new Set([...u.shares.values()].map((sh) => sh.streamId));
  let voz = null;
  for (const s of u.streams.values()) {
    if (daTela.has(s.id) || s.id === u.cam || s.getVideoTracks().length) continue;
    if (s.getAudioTracks().some((t) => t.readyState === 'live')) voz = s;
  }
  if (!voz) {
    if (u.audioEl) u.audioEl.srcObject = null;
    return;
  }
  if (!u.audioEl) {
    u.audioEl = document.createElement('audio');
    u.audioEl.autoplay = true;
    sink.appendChild(u.audioEl);
  }
  if (u.audioEl.srcObject !== voz) {
    u.audioEl.srcObject = voz;
    u.audioEl.play().catch(() => {}); // barrado sem gesto: o próximo clique ou tecla toca (tocarTudo)
  }
  volumes();
}
function volumes() {
  video.volume = ajustes.jogo / 100;
  for (const u of st.users.values()) {
    if (!u.audioEl) continue;
    u.audioEl.volume = ajustes.voz / 100;
    u.audioEl.muted = st.semVoz || ajustes.voz <= 0;
  }
}
// o navegador só deixa tocar com som depois de um gesto
function tocarTudo() {
  if (video.muted && video.srcObject) {
    video.muted = false;
    video.play().catch(() => {});
  }
  for (const u of st.users.values()) if (u.audioEl?.srcObject && u.audioEl.paused) u.audioEl.play().catch(() => {});
}
for (const ev of ['pointerdown', 'click', 'keydown']) document.addEventListener(ev, tocarTudo, { capture: true, passive: true });
for (const [id, k] of [['#jg-vol-jogo', 'jogo'], ['#jg-vol-voz', 'voz']]) {
  $(id).value = String(ajustes[k]);
  $(id).addEventListener('input', (e) => {
    ajustes[k] = limitar(e.target.value, 0, 100);
    gravarJSON(AJUSTES_CHAVE, ajustes);
    volumes();
  });
  $(id).addEventListener('change', (e) => e.target.blur());
}
async function alternarMic() {
  if (!rtc || !st.entrou) return;
  if (!mic.pronto) {
    if (!mic.ligado) {
      try {
        await rtc.startMic(null);
        mic.pronto = true;
      } catch {
        return void toast('Microfone bloqueado ou indisponível. Libere no cadeado do endereço e tente de novo.', 'warn', 7000);
      }
    }
  }
  mic.ligado = !mic.ligado && !st.semVoz;
  rtc.setMicEnabled(mic.ligado);
  socket.emit('mic', mic.ligado);
  mostrarMic();
}
function mostrarMic() {
  $('#jg-mic').textContent = mic.ligado ? 'Microfone ligado' : 'Microfone desligado';
  $('#jg-mic').classList.toggle('on', mic.ligado);
  $('#jg-mic').setAttribute('aria-pressed', String(mic.ligado));
}
$('#jg-mic').addEventListener('click', (e) => {
  e.currentTarget.blur();
  alternarMic();
});

// ------------------------------------------------------------------ as telas
const acharTela = (key) => {
  const u = typeof key === 'string' ? st.users.get(key.split('~')[0]) : null;
  const sh = u?.shares.get(key);
  return sh ? { u, sh } : null;
};
const maquinaDaTela = (sh) => (sh?.superficie === 'ps5' || sh?.titulo === 'PS5' ? 'ps5' : 'pc');
const ehPs5 = (sh) => !!sh && (sh.superficie === 'ps5' || layoutDoTitulo(sh.titulo) === 'ps5');
const layoutDa = (sh) => (sh?.superficie === 'ps5' ? 'ps5' : layoutDoTitulo(sh?.titulo));
const telasNoAr = () => [...st.users.values()].flatMap((u) => [...u.shares.values()].map((sh) => ({ u, sh })));

// na minha vez, a máquina que aluguei; fora dela, a escolhida à mão, o telão, a primeira com controle
function escolherAlvo() {
  if (jogandoLa) return acharTela(jogandoLa.key);
  const telas = telasNoAr();
  const escolhida = telas.find((t) => t.sh.key === st.escolhida);
  if (escolhida) return escolhida;
  const volta = voltaAoJogo();
  const antes = volta && telas.find((t) => t.u.name === volta.dono && maquinaDaTela(t.sh) === volta.maquina);
  if (antes) return antes;
  for (const m of minhasMaquinas()) {
    const t = telas.find((x) => maquinaDaTela(x.sh) === m && x.sh.controle);
    if (t) return t;
  }
  return telas.find((t) => t.sh.key === st.main) || telas.find((t) => t.sh.controle) || telas[0] || null;
}

const semDono = new Map(); // id -> Map(stream.id -> stream): a imagem que chegou antes da pessoa
function receberTrilha(peerId, stream) {
  const u = st.users.get(peerId);
  if (!u) {
    if (!semDono.has(peerId)) semDono.set(peerId, new Map());
    semDono.get(peerId).set(stream.id, stream);
    return;
  }
  u.streams.set(stream.id, stream);
  ouvirVoz(u);
  mostrarVideo();
}

const vivo = (s) => s && s.getTracks().some((t) => t.readyState === 'live');
function mostrarVideo() {
  const a = st.alvo;
  const stream = a ? a.u.streams.get(a.sh.streamId) : null;
  const ok = vivo(stream);
  if (ok && video.srcObject !== stream) {
    video.srcObject = stream;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
    aplicarBuffer();
  } else if (!ok && video.srcObject) video.srcObject = null;
  $('#jg-vazio').hidden = ok;
  if (!ok && st.entrou) {
    $('#jg-vazio b').textContent = a ? 'Carregando a imagem…' : 'Nada no telão agora';
    $('#jg-vazio span').textContent = a ? `${a.u.name} · ${a.sh.titulo || NOME_MAQ[maquinaDaTela(a.sh)]}` : 'Quando o PC ou o PS5 entrar na sala, a imagem aparece aqui.';
  }
}

// a imagem que não sobe: pede de novo e depois refaz a conexão com quem compartilha
let esperandoDesde = 0;
let passoEspera = 0;
setInterval(() => {
  const a = st.alvo;
  if (!st.entrou || !a || vivo(a.u.streams.get(a.sh.streamId))) {
    esperandoDesde = 0;
    passoEspera = 0;
    return;
  }
  esperandoDesde ||= Date.now();
  const s = (Date.now() - esperandoDesde) / 1000;
  if (passoEspera === 0 && s > 6) {
    passoEspera = 1;
    enviarInteresse(true);
  } else if (passoEspera === 1 && s > 14) {
    passoEspera = 2;
    rtc.refazer(a.u.id, 'a imagem do /jogar não chegou');
  }
}, 2000);

// só a tela mostrada vem no máximo; as outras telas e as webcams não vêm
function enviarInteresse(forcar = false) {
  if (!rtc || !st.selfId) return;
  for (const u of st.users.values()) {
    if (!u.shares.size && !u.cam) continue;
    const mapa = {};
    for (const sh of u.shares.values()) mapa[sh.key] = sh.key === st.alvo?.sh.key ? 'max' : 'off';
    if (u.cam) mapa.cam = 'off';
    const json = JSON.stringify(mapa);
    if (!forcar && st.interesse.get(u.id) === json) continue;
    st.interesse.set(u.id, json);
    rtc.enviarInteresse(u.id, mapa);
  }
}
let ultimoCompleto = 0;
let interesseDesde = 0; // ao entrar, o canal ainda está abrindo e o 1º pedido se perde: repete mais nos 20 s
setInterval(() => {
  const agora = Date.now();
  if (st.entrou) interesseDesde ||= agora;
  const completo = agora - ultimoCompleto > (agora - interesseDesde < 20_000 ? 1500 : 8000);
  if (completo) ultimoCompleto = agora;
  enviarInteresse(completo);
}, 1000);

function atualizar() {
  const antes = st.alvo?.sh.key;
  // a tela em que se jogava saiu do ar ou perdeu o controle
  if (jogandoLa && !acharTela(jogandoLa.key)?.sh.controle) {
    lembrarJogo();
    controle.desligarJogo();
    toast('A tela do jogo saiu do ar ou o controle foi travado.', 'warn', 6000);
  }
  st.alvo = escolherAlvo();
  if (antes !== st.alvo?.sh.key) {
    st.controlando = false;
    controle.remover(video);
    enviarInteresse(true);
  }
  mostrarVideo();
  atualizarBarra();
  mostrarVezLan();
}

// ------------------------------------------------------------------ a barra
const podeControlar = () => !!st.alvo?.sh.controle;
const jogavel = () => podeControlar() && ['window', 'monitor', 'ps5'].includes(st.alvo.sh.superficie);
function atualizarBarra() {
  const a = st.alvo;
  $('#focus-name').textContent = a ? `Tela de ${a.u.name} · ${a.sh.titulo || NOME_MAQ[maquinaDaTela(a.sh)]}` : 'Sala 3D · Jogar';
  const telas = telasNoAr();
  const html = telas.length > 1 ? telas.map((t) => `<button type="button" class="secondary small" data-tela="${esc(t.sh.key)}" aria-pressed="${t.sh.key === a?.sh.key}">${esc(t.sh.titulo || NOME_MAQ[maquinaDaTela(t.sh)])} · ${esc(t.u.name)}</button>`).join('') : '';
  if ($('#jg-telas').innerHTML !== html) $('#jg-telas').innerHTML = html;
  const emJogo = !!controle.jogo;
  document.body.classList.toggle('jg-jogando', emJogo);
  // a superfície do controle só existe jogando ou com "Controlar" ligado
  if (!podeControlar()) st.controlando = false;
  if ((st.controlando || emJogo) && podeControlar()) {
    if (!controle.tem(video)) {
      controle.adicionar(video, a.sh.key);
      controle.focar(video);
    }
  } else if (controle.tem(video)) controle.remover(video);
  const cb = $('#focus-ctrl');
  cb.hidden = !podeControlar() || emJogo;
  cb.textContent = st.controlando ? 'Só assistir' : 'Controlar';
  cb.classList.toggle('on', st.controlando);
  const jb = $('#focus-jogo');
  jb.hidden = !jogavel();
  jb.textContent = emJogo ? 'Desligar modo jogo' : 'Modo jogo';
  jb.classList.toggle('on', emJogo);
  jb.title = 'Mouse gira a câmera e WASD anda. F8 liga e desliga.';
  $('#focus-jogo-op-wrap').hidden = jb.hidden;
  if (jb.hidden) $('#jogo-op-pop').hidden = true;
  $('#focus-engasgo').hidden = !emJogo;
  const grande = $('#jg-jogar');
  grande.hidden = jb.hidden || st.controlando;
  grande.textContent = voltaAoJogo() ? '▶ Voltar ao jogo' : `▶ Modo jogo · ${a ? a.sh.titulo || NOME_MAQ[maquinaDaTela(a.sh)] : ''}`;
  atualizarBotaoTouchpad();
}
$('#jg-telas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tela]');
  if (!b || controle.jogo) return;
  st.escolhida = b.dataset.tela;
  esquecerJogo();
  atualizar();
});
$('#focus-ctrl').addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (!st.controlando && !deixarJogar()) return;
  st.controlando = !st.controlando;
  atualizarBarra();
});
$('#focus-full').addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else $('#focus').requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
});

// a chegada da imagem, ao lado do nome da tela
setInterval(async () => {
  const a = st.alvo;
  const trilha = video.srcObject?.getVideoTracks?.()[0];
  const r = a && trilha && rtc && !controle.jogo ? await rtc.recebendo(a.u.id, trilha.id).catch(() => null) : null;
  let texto = r ? `${r.altura}p · ${r.fps} qps` : '';
  if (r?.atraso != null) texto += ` · ~${r.atraso} ms`;
  if (r?.turn) texto += ` · via TURN${r.turn === 'udp' ? '' : ' (TCP)'}`;
  $('#focus-qualidade').textContent = texto;
}, 1000);

// ------------------------------------------------------------------ lan house
let lanDif = 0;
let lanEraMinha = new Set();
let meuTesteLan = null;
let pediuAluguelEm = 0;
let tirandoDoJogo = false;
const avisouFim = new Set();
const idsDaVez = (m) => st.lan?.[m]?.ids || [];
const lanLivre = (m) => !st.lan?.[m]?.conta;
const semTeste = () => !!st.lan?.semTeste?.includes(st.selfId);
const podeJogarLan = (m) => !st.lan || idsDaVez(m).includes(st.selfId) || (lanLivre(m) && !semTeste());
function minhasMaquinas() { return Object.keys(NOME_MAQ).filter((m) => idsDaVez(m).includes(st.selfId)); }
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function falta(fim) {
  const s = Math.max(0, Math.round((fim - (Date.now() + lanDif)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { s, texto: h ? `${h}h${String(m).padStart(2, '0')}min` : `${m}:${String(s % 60).padStart(2, '0')}` };
}
function textoVez(m) {
  const v = st.lan?.[m];
  if (!v?.conta) {
    const fimTeste = st.lan?.teste?.[st.selfId];
    if (fimTeste) {
      const t = falta(fimTeste);
      return { texto: `Teste grátis no ${NOME_MAQ[m]} · faltam ${t.texto}`, minha: true, acabando: t.s <= 30, s: t.s, teste: true };
    }
    return { texto: semTeste() ? `${NOME_MAQ[m]} livre · alugue para jogar` : `${NOME_MAQ[m]} livre · 2 min grátis`, livre: true };
  }
  const f = falta(v.fim);
  const minha = idsDaVez(m).includes(st.selfId);
  if (v.preparando && v.inicio) {
    const c = falta(v.inicio);
    if (c.s > 0) return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${NOME_MAQ[m]} começa em ${c.texto} · preparando`, minha, s: f.s };
  }
  return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${NOME_MAQ[m]} · faltam ${f.texto}`, minha, acabando: f.s <= 300, s: f.s };
}
function mostrarVezLan() {
  for (const m of Object.keys(NOME_MAQ)) {
    const el = $(`#lan-vez-${m}`);
    el.hidden = !st.lan;
    if (!st.lan) continue;
    const v = textoVez(m);
    el.textContent = v.texto;
    for (const c of ['minha', 'livre', 'acabando']) el.classList.toggle(c, !!v[c]);
    if (!v.minha || v.teste) continue;
    for (const lim of [300, 60]) {
      const k = `${m}|${st.lan[m].fim}|${lim}`;
      if (v.s > lim || v.s <= 0 || avisouFim.has(k)) continue;
      avisouFim.add(k);
      toast(`Falta${lim === 60 ? '' : 'm'} ${lim / 60} min do seu horário no ${NOME_MAQ[m]}. Para continuar, alugue mais.`, 'warn', 8000);
    }
  }
  // por cima da imagem só jogando em tela cheia (fora dela a barra já mostra)
  const foco = $('#lan-vez-foco');
  const sh = st.alvo?.sh;
  const v = st.lan && sh && controle.jogo ? textoVez(maquinaDaTela(sh)) : null;
  foco.hidden = !v?.acabando; // jogando, só no fim da vez: nada por cima da imagem
  if (foco.hidden) return;
  foco.textContent = v.texto;
  foco.classList.toggle('minha', !!v.minha);
  foco.classList.toggle('acabando', !!v.acabando);
}
setInterval(() => { if (st.lan) mostrarVezLan(); }, 1000);

function aplicarLan(e) {
  st.lan = e?.ligada ? e : null;
  if (typeof e?.agora === 'number') lanDif = e.agora - Date.now();
  const agora = new Set(minhasMaquinas());
  for (const m of agora) {
    if (lanEraMinha.has(m)) continue;
    const v = st.lan[m];
    toast(v.preparando ? `Seu horário no ${NOME_MAQ[m]} começa às ${hora(v.inicio)}. Joga até ${hora(v.fim)}.` : `Seu horário no ${NOME_MAQ[m]} começou: você joga até ${hora(v.fim)}. Bom jogo!`, 'success', 8000);
  }
  for (const m of lanEraMinha) if (!agora.has(m)) toast(`Seu horário no ${NOME_MAQ[m]} acabou. Para jogar mais, alugue outro horário.`, 'warn', 9000);
  lanEraMinha = agora;
  const fimTeste = st.lan?.teste?.[st.selfId] || null;
  if (fimTeste && !meuTesteLan) toast('Teste grátis: você tem 2 minutos para jogar. Depois, é só alugar o PC ou o PS5.', 'info', 7000);
  if (meuTesteLan && !fimTeste && semTeste()) {
    pediuAluguelEm = Date.now();
    toast('Seu teste grátis de 2 minutos acabou. Para continuar jogando, alugue o PC ou o PS5.', 'warn', 10000);
    tirarDoJogo();
    abrirAluguel();
  }
  meuTesteLan = fimTeste;
  // acabou a vez, ou alguém alugou a máquina que estava livre
  const sh = st.alvo?.sh;
  if (sh && (controle.jogo || st.controlando) && !podeJogarLan(maquinaDaTela(sh))) {
    const m = maquinaDaTela(sh);
    tirarDoJogo();
    if (!lanLivre(m)) toast(`Agora é a vez de ${st.lan[m].conta} no ${NOME_MAQ[m]}. Para jogar, alugue outro horário.`, 'warn', 9000);
  }
  $('#lan-reservar').hidden = !st.lan;
  atualizar();
}
// o comando que não pode sair: o teste grátis acabou e a máquina continua livre
function barrado(key) {
  if (!st.lan) return false;
  const t = acharTela(key);
  return !!t && !podeJogarLan(maquinaDaTela(t.sh));
}
function tirarDoJogo() {
  if (tirandoDoJogo) return; // desligar manda comandos (soltar tudo), que voltam aqui
  tirandoDoJogo = true;
  try {
    st.controlando = false;
    esquecerJogo();
    controle.desligarJogo();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    jogoNoPc(false);
    atualizarBarra();
  } finally {
    tirandoDoJogo = false;
  }
}
function pedirAluguel() {
  tirarDoJogo();
  if (!$('#lan-modal').hidden || Date.now() - pediuAluguelEm < 10_000) return;
  pediuAluguelEm = Date.now();
  toast('Você não tem horário agora. Para jogar, alugue o PC ou o PS5.', 'warn', 6000);
  abrirAluguel();
}
// antes de entrar no jogo: é a minha vez (ou a máquina está livre e ainda tenho o teste)?
function deixarJogar() {
  const a = st.alvo;
  if (!a) return false;
  if (podeJogarLan(maquinaDaTela(a.sh))) return true;
  const m = maquinaDaTela(a.sh);
  toast(lanLivre(m) ? `Seu teste grátis já foi usado. Alugue o ${NOME_MAQ[m]} para jogar.` : `Agora é a vez de ${st.lan[m].conta} no ${NOME_MAQ[m]}.`, 'warn', 7000);
  if (lanLivre(m)) abrirAluguel();
  return false;
}
function abrirAluguel() {
  if (document.pointerLockElement) document.exitPointerLock();
  $('#lan-frame').src = `/lan?sala=${encodeURIComponent(SALA)}&embed=1`;
  $('#lan-modal').hidden = false;
}
function fecharAluguel() {
  $('#lan-modal').hidden = true;
  $('#lan-frame').src = 'about:blank';
}
$('#lan-reservar').addEventListener('click', abrirAluguel);
$('#lan-modal-fechar').addEventListener('click', fecharAluguel);
$('#lan-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) fecharAluguel(); });
addEventListener('message', (e) => {
  const fr = $('#lan-frame');
  if (e.origin !== location.origin || e.data?.tipo !== 'lan-altura' || e.source !== fr.contentWindow) return;
  fr.style.height = `${Math.max(120, Number(e.data.altura) || 0)}px`;
});
// entrou em outra conta pela página de aluguel: esta página entra com ela
addEventListener('storage', (e) => {
  if (e.key !== LAN_CHAVE || !st.entrou || controle.jogo) return;
  if (lerJSON(LAN_CHAVE, null)?.token !== conta?.token) location.reload();
});

// ------------------------------------------------------------------ controle (mouse e teclado)
const controle = new Controle({
  emitir: (ev, data, volatil) => {
    if (ev === 'controle' && !tirandoDoJogo && barrado(data.key)) return void pedirAluguel();
    if (ev === 'controle' && rtc?.mandarControle(String(data.key).split('~')[0], { c: data })) return;
    return volatil ? socket?.volatile.emit(ev, data) : socket?.emit(ev, data);
  },
  direto: (key) => !!rtc?.canalControle(String(key).split('~')[0]),
  movimento: (key, total) => (barrado(key) ? (pedirAluguel(), true) : !!rtc?.mandarMovimento(String(key).split('~')[0], { m: { key, ...total } })),
  toast,
  onExtensao: () => {},
  minha: () => null,
});
const avisoSite = new AvisoDoSite({ raiz: $('#aviso-site'), controle, responder: (key, ev) => controle.mandar(key, ev) });

const diagJogo = new DiagJogo({ toast, contexto: () => ({ sala: SALA, nome: conta ? `${conta.nome} (jogar)` : null }) });
let jogandoLa = null; // { key, video, cursorLivre, ps5 }
const avisos = new Map();
const tremores = { n: 0, como: {}, primeiro: false, desde: 0 };

function receberVolta({ key, ev, de } = {}) {
  if (typeof key !== 'string' || !ev) return;
  if (ev.t === 'copia' && typeof ev.s === 'string' && controle.pediuCopia(key)) {
    navigator.clipboard.writeText(ev.s).then(() => toast(`Copiado da tela de ${de || 'alguém'}.`, 'success', 2500), () => {});
  } else if (ev.t === 'dialogo' && (ev.fechou || controle.mexeuEm(key))) avisoSite.receber(key, ev, `Na tela de ${de || 'alguém'}`);
  else if (ev.t === 'admin' && controle.mexeuEm(key) && Date.now() - (avisos.get('admin') || 0) > 30_000) {
    avisos.set('admin', Date.now());
    toast(`O seu controle não chega na tela de ${de || 'quem compartilha'}: ${ev.titulo ? `“${String(ev.titulo).slice(0, 40)}”` : 'o programa'} está aberto como administrador lá. Peça para abrir sem administrador.`, 'warn', 12000);
  }
  if (jogandoLa?.key !== key) return;
  if (ev.t === 'jogo-envio') {
    jogandoLa.ps5 = ev.ps5 || null;
    diagJogo.doOutroLado(ev);
  } else if (ev.t === 'tremor') {
    const como = padVirtual.tremor(ev.g, ev.p, !!ev.h);
    tremores.n++;
    tremores.como[como] = (tremores.como[como] || 0) + 1;
    const agora = performance.now();
    if (!tremores.primeiro) {
      Object.assign(tremores, { primeiro: true, desde: agora });
      diagJogo.evento('tremor do jogo chegou', { g: ev.g, p: ev.p, como, ...padVirtual.comoVibra() });
    } else if (agora - tremores.desde > 10_000) {
      diagJogo.evento('tremores', { n: tremores.n, como: tremores.como });
      Object.assign(tremores, { n: 0, como: {}, desde: agora });
    }
  } else if (ev.t === 'gatilhos') {
    const foi = touchpad.gatilhos(ev.e, ev.d);
    diagJogo.evento('gatilhos adaptativos chegaram', { e: ev.e?.[0], d: ev.d?.[0], dualsense: foi });
  } else if (ev.t === 'cursor') {
    jogandoLa.cursorLivre = !!ev.livre;
    diagJogo.evento(ev.livre ? 'o jogo mostrou o cursor: mouse pela posição (menu)' : 'o jogo escondeu o cursor: mouse preso (câmera)');
    if (opcoesJogo.get('menuAuto')) controle.cursorLivre(key, !!ev.livre);
  } else if (ev.t === 'pad-erro' && Date.now() - (avisos.get('pad') || 0) > 60_000) {
    avisos.set('pad', Date.now());
    toast(`O controle virtual ainda não funciona no PC de ${de || 'quem compartilha'}: ${ev.erro === 'sem-driver' ? 'falta instalar o driver ViGEmBus' : 'falta rodar de novo o instalar.bat do ajudante'} lá.`, 'warn', 12000);
  }
}

// o que chega direto, pelo canal da conexão: só a volta de quem é dono da tela e o ping do controle
const ping = { rtt: null, ida: null, ajudante: null };
function receberDireto(id, m) {
  const u = st.users.get(id);
  if (!u || !m || typeof m !== 'object') return;
  if (m.v && typeof m.v === 'object') {
    if (typeof m.v.key === 'string' && m.v.key.split('~')[0] === id) receberVolta({ ...m.v, de: u.name });
  } else if (typeof m.pe === 'number' && jogandoLa?.key.split('~')[0] === id) {
    const dif = turboRecebe.dif;
    const ida = typeof m.t === 'number' && dif != null ? Math.max(0, Math.round((m.t - dif - m.pe) * 10) / 10) : null;
    Object.assign(ping, { rtt: Math.round((performance.now() - m.pe) * 10) / 10, ida, ajudante: typeof m.aj === 'number' ? m.aj : null });
  }
}

// ------------------------------------------------------------------ Turbo e modos de imagem (como na sala)
const MOTIVO_TURBO = {
  navegador: 'este navegador não tem o que o modo turbo precisa',
  'sem-controle': 'a tela não está com o controle liberado',
  'sem-tela': 'a tela saiu do ar',
  codificador: 'o PC de quem compartilha não conseguiu codificar',
  decodificador: 'este aparelho não conseguiu decodificar',
  conexao: 'a conexão direta com quem compartilha não está aberta',
  'sem-imagem': 'nenhuma imagem chegou em 4 s',
  lento: 'a conexão com quem compartilha não aguenta (a imagem atrasava ou parava)',
};
const turboAvisado = new Set();
const turboRecebe = new TurboRecebe({
  abrir: (id, vida) => rtc?.abrirTurbo(id, CANAL_CONFIAVEL ? null : vida),
  abrirSom: (id) => rtc?.abrirTurboSom(id, CANAL_CONFIAVEL),
  somDaTela: () => video,
  volume: () => ajustes.jogo / 100,
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  onFalhou: (motivo) => {
    diagJogo.evento('modo turbo falhou: vídeo normal de volta', { motivo });
    if (turboAvisado.has(motivo)) return;
    turboAvisado.add(motivo);
    toast(`Modo turbo desligado: ${MOTIVO_TURBO[motivo] || motivo}. A imagem voltou ao normal.`, 'warn', 8000);
  },
});
// como na TV: só H.264, os mesmos perfis, e a placa antes de qualquer outra coisa; o PC leva 3–4 s para começar
turboRecebe.semHevc = true;
turboRecebe.codecsForcados = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];
turboRecebe.aceleracoes = ['prefer-hardware', 'prefer-hardware@2a', 'prefer-hardware@28', 'prefer-hardware@1f', 'no-preference'];
turboRecebe.semImagemMs = 12_000;
const presetAtual = () => PRESETS.find((p) => p.id === opcoesJogo.get('preset')) || null;
function ligarTurbo() {
  if (!jogandoLa) return;
  const p = presetAtual();
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  turboRecebe.vidaMs = p?.vida ?? TTL_MS;
  turboRecebe.h265 = !!p?.h265;
  turboRecebe.lisoPct = p?.lisoPct ?? LISO_PCT;
  turboRecebe.lisoMax = p?.lisoMax ?? LISO_MAX;
  turboRecebe.realce = !!ajustes.nitidez;
  turboRecebe.ligar(jogandoLa.key, jogandoLa.video, opcoesJogo.get('rapido') ? 720 : 1080);
  diagJogo.evento('modo turbo ligado', { nitidez: turboRecebe.realce, liso: opcoesJogo.get('turboLiso'), vidaMs: turboRecebe.vidaMs, h265: turboRecebe.h265, lisoPct: turboRecebe.lisoPct, lisoMaxMs: turboRecebe.lisoMax, canal: CANAL_CONFIAVEL ? 'confiável' : 'com prazo' });
}
let aplicandoPreset = false;
function aplicarPreset(n) {
  const p = PRESETS.find((x) => x.id === n) || null;
  aplicandoPreset = true;
  try { opcoesJogo.setVarios({ preset: p ? p.id : 0, ...(p ? p.opcoes : {}) }); } finally { aplicandoPreset = false; }
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  if (!jogandoLa || !p) return;
  diagJogo.evento(`preset ${p.id}: ${p.nome} (escolhido)`, { ...p.opcoes, vidaMs: p.vida, lisoPct: p.lisoPct ?? null });
  aplicarBuffer();
  avisarModo();
  if (p.opcoes.turbo) ligarTurbo();
  else turboRecebe.desligar();
}
$('#jogo-op-pop').insertAdjacentHTML('afterbegin', htmlPresets());
marcarPresets(document);
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-preset]');
  if (!el) return;
  const n = Number(el.dataset.preset) || 0;
  if (n !== (opcoesJogo.get('preset') || 0)) aplicarPreset(n);
  else marcarPresets(document);
  el.blur();
});
opcoesJogo.ouvir((k, v) => {
  if (!aplicandoPreset && OPCOES_DO_PRESET.includes(k) && opcoesJogo.get('preset')) {
    aplicandoPreset = true;
    try { opcoesJogo.setVarios({ preset: 0 }); } finally { aplicandoPreset = false; }
    diagJogo.evento('preset: manual (opção mudada à mão)', { [k]: v });
  }
  if (k === 'preset') marcarPresets(document);
  if (k === 'liso') aplicarBuffer();
  else if (k === 'turboLiso') turboRecebe.liso = v;
  else if (k === 'rapido') {
    avisarModo();
    if (turboRecebe.ligado) ligarTurbo();
  } else if (k === 'turbo' && jogandoLa) {
    if (v) ligarTurbo();
    else turboRecebe.desligar();
  } else if (k === 'selo') mostrarSelo();
  else if (k === 'menuAuto' && jogandoLa) controle.cursorLivre(jogandoLa.key, v ? jogandoLa.cursorLivre : false);
  else if (k === 'preencher') document.body.classList.toggle('jogo-preencher', !!v);
  for (const el of $$('#jogo-op-pop [data-op]')) el.checked = !!opcoesJogo.get(el.dataset.op);
});
document.body.classList.toggle('jogo-preencher', !!opcoesJogo.get('preencher'));

function aplicarBuffer() {
  if (!jogandoLa || !video.srcObject) return;
  const liso = opcoesJogo.get('liso');
  diagJogo.evento(liso ? `buffer de ${LISO_MS} ms (imagem mais lisa)` : 'buffer mínimo', rtc?.baixaLatencia(video.srcObject, true, liso ? LISO_MS : 0));
}
function avisarModo() {
  if (jogandoLa) controle.mandar(jogandoLa.key, { t: 'modo', jogo: true, rapido: !!opcoesJogo.get('rapido'), vibra: padVirtual.podeVibrar(), ds: !!touchpad.ligado });
}
addEventListener('gamepadconnected', () => avisarModo());
addEventListener('gamepaddisconnected', () => avisarModo());

// A placa de vídeo, para o relatório: lida com a página à toa, e não no clique do Modo jogo (criar um
// contexto WebGL trava a página). O relatório recebe algo que responde como um contexto.
let nomePlaca = null;
function lerPlaca() {
  const gl = document.createElement('canvas').getContext('webgl');
  if (!gl) return;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  nomePlaca = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(lerPlaca, { timeout: 5000 }) : lerPlaca()), 1500);
const placaLida = { getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0 }), getParameter: () => nomePlaca };

function jogoLa(v, key) {
  turboRecebe.desligar();
  if (jogandoLa) {
    diagJogo.evento('buffer normal de volta', rtc?.baixaLatencia(video.srcObject, false));
    jogandoLa = null;
    diagJogo.parar();
  }
  if (!v) return void mostrarSelo();
  esquecerJogo();
  jogandoLa = { key, video: v, cursorLivre: false };
  const op = (k) => opcoesJogo.get(k);
  diagJogo.comecar('joga', {
    gl: placaLida,
    video: v,
    extra: { pagina: 'jogar', receita: 'tv', dualsense: ajustes.dualsense, nitidez: ajustes.nitidez, canal: CANAL_CONFIAVEL ? 'confiável' : 'com prazo', janelaDoJogo: acharTela(key)?.sh.titulo ?? null, toque: false, opcoes: { liso: op('liso'), menuAuto: op('menuAuto'), giro: false, rapido: op('rapido'), turbo: op('turbo'), turboLiso: op('turboLiso'), preset: op('preset') } },
  });
  aplicarBuffer();
  mostrarSelo();
  avisarModo();
  if (op('turbo')) ligarTurbo();
}

function mostrarSelo(r = null) {
  const el = $('#jogo-selo');
  el.hidden = !(jogandoLa && opcoesJogo.get('selo'));
  if (el.hidden) return;
  if (!r) return void (el.textContent = 'medindo…');
  const q = (v) => (v != null ? Math.round(v) : '–');
  const atraso = r.atrasoMs != null ? `${Math.round(r.atrasoMs)} ms` : '–';
  const mbps = r.kbps != null ? (r.kbps / 1000).toFixed(1) : '–';
  const imagem = r.turbo?.pontaMs != null ? ` (imagem ${Math.round(r.turbo.pontaMs)} ms)` : '';
  const trancos = r.ritmo ? ` · <span class="${r.ritmo.trancos > 2 ? 'ruim' : ''}">${r.ritmo.trancos} trancos</span>` : '';
  const liso = r.turbo?.liso ? ` · liso ${Math.round(r.turbo.liso.alvoMs)} ms` : '';
  const p5 = jogandoLa.ps5;
  const origem = p5 ? `PS5 ${q(p5.manda)}${p5.lossless != null ? ` → Lossless (OBS) ${q(p5.lossless)}` : ''} → aqui ` : '';
  const lsx = Number(opcoesJogo.get('lossless')) || 0;
  const comLs = lsx && r.fpsFinal != null ? ` · com o Lossless ×${lsx} ≈ ${Math.round(r.fpsFinal * lsx)} qps` : '';
  el.innerHTML = `${turboRecebe.ligado ? '<b>turbo</b> · ' : ''}${origem}<span class="${r.fpsFinal != null && r.fpsFinal < 50 ? 'ruim' : ''}">${q(r.fpsFinal)} qps</span>${comLs}${trancos} · ${r.altura ? `${r.altura}p` : ''} · ~${atraso}${imagem}${liso} · ${mbps} Mbps${r.motivo ? ` · <span class="ruim">${esc(r.motivo)}</span>` : ''}
<span class="${r.culpa ? 'ruim' : ''}">${esc(linhaDaCulpa(r.culpa, diagJogo.sessao?.culpas))}</span>`;
}

let somSumiu = false;
function vigiarSom(r) {
  if (!r) return;
  const por = r.turbo?.som?.ativo && r.turbo.som.pps > 0 ? 'turbo' : r.somWebrtc?.pps > 0 ? 'vídeo normal' : 'nenhum';
  r.somPor = por;
  if (!somSumiu && por === 'nenhum') {
    somSumiu = true;
    diagJogo.evento('o som do jogo sumiu (nem turbo nem vídeo normal)', { turbo: r.turbo?.som ?? null, webrtc: r.somWebrtc });
  } else if (somSumiu && por !== 'nenhum') {
    somSumiu = false;
    diagJogo.evento(`o som do jogo voltou (${por})`);
  }
}

// a cada 2 s jogando: a mesma amostra da sala (e a cópia para quem compartilha)
async function amostrar() {
  if (!rtc || !jogandoLa || !diagJogo.ativo) return;
  try {
    const { key } = jogandoLa;
    const dono = key.split('~')[0];
    rtc.mandarControle(dono, { p: performance.now() });
    const trilha = video.srcObject?.getVideoTracks()[0];
    if (!trilha) return;
    const extra = { preset: opcoesJogo.get('preset') || 0, turbo: turboRecebe.stats(), controleRttMs: ping.rtt, controleIdaMs: ping.ida, ajudanteMs: ping.ajudante, movimentoCru: controle.movimentoCru, controleFisico: fisico.usado, entrada: entradaDeAgora(), cursorLivre: jogandoLa.cursorLivre };
    const cru = await rtc.diagRecebe(trilha, video.srcObject?.getAudioTracks()[0] || null);
    if (jogandoLa?.key !== key) return;
    const resumo = diagJogo.amostraRecebe(cru, { desenha: false, teto: null, quadros2s: 0, escondida: document.hidden, foco: 'jogar', pessoas: st.users.size + 1 }, extra);
    vigiarSom(resumo);
    mostrarSelo(resumo);
    // no Turbo quem compartilha não precisa da cópia (o relatório vai ao servidor): o canal fica só do controle
    if (!resumo || turboRecebe.ligado) return;
    const { la, ...r } = resumo;
    const n = diagJogo.sessao.amostras.length;
    rtc.mandarControle(dono, { j: { key, r, amb: n <= 4 || n % 15 === 1 ? diagJogo.sessao.ambiente : undefined } });
  } catch (err) {
    console.warn('[jogar] amostra', err);
  }
}
setInterval(amostrar, 2000);

function marcarEngasgo() {
  if (!jogandoLa) return;
  if (diagJogo.marcarEngasgo(turboRecebe.ligado ? turboRecebe.caixaPreta() : null)) toast('Engasgo marcado no relatório', 'info', 1500);
}
$('#focus-engasgo').addEventListener('click', (e) => {
  e.currentTarget.blur();
  marcarEngasgo();
});

// ------------------------------------------------------------------ teclado, controle e DualSense
// o controle virtual com a pressa da TV: botão que mudou sai na hora; analógico, a cada 8 ms
class PadRapido extends PadVirtual {
  mudou() {
    if (this.treino) return void super.mudou();
    if (!this.key) return;
    if (this.estado().b !== this.enviado.b) return void this.enviar();
    if (this.timer) return;
    const falta = this.ultimo + ENVIO_PAD_MS - performance.now();
    if (falta <= 0) this.enviar();
    else this.timer = setTimeout(() => this.enviar(), falta);
  }
}
const padVirtual = new PadRapido({ controle });
// A leitura do ControleFisico é por quadro da tela (13 ms a 75 Hz): aqui, a cada 8 ms, como na TV
setInterval(() => {
  if (!padVirtual.key || touchpad.ativo || !LAYOUTS[layoutDa(st.alvo?.sh)]?.virtual) return;
  const g = fisico.pad();
  if (g) padVirtual.fisico(g);
}, ENVIO_PAD_MS);
const entradaDeAgora = () => (touchpad.ligado && touchpad.ativo ? 'dualsense' : fisico.pad() ? 'gamepad' : 'teclado');
let layoutLegenda = null;
let noCarro = false;
const tecladoPad = new TecladoPad({
  pad: padVirtual,
  sens: () => opcoesJogo.get('mouseSens'),
  aviso: (texto) => toast(texto, 'info', 5000),
  onCarro: (sim) => {
    if (sim !== noCarro) diagJogo.evento(sim ? 'modo carro: no carro' : 'modo carro: a pé');
    noCarro = sim;
    if (layoutLegenda) mostrarLegenda(layoutLegenda);
  },
});
padVirtual.onErroTremor = (erro) => diagJogo.evento('o controle não aceitou o tremor', { erro, ...padVirtual.comoVibra() });
const tutorial = new TutorialControle({ raiz: $('#tut-controle'), pad: padVirtual, toqueRaiz: $('#toque-jogo') });
const mapaPainel = new MapaTeclasPainel({
  raiz: $('#mapa-teclas'),
  onAbriu: () => tecladoPad.soltarTudo(),
  onFechou: () => {
    tecladoPad.soltarTudo();
    if (controle.jogo) toast('Teclas salvas neste navegador. Clique na imagem para voltar a jogar.', 'success', 4000);
  },
});
controle.paraPad = (ev) => {
  if (mapaPainel.aberto) return true;
  if (!tutorial.ativo) return tecladoPad.evento(ev);
  if (!tutorial.tecla(ev)) tecladoPad.evento(ev);
  return true;
};
const touchpad = new Ps5Touchpad({ pad: padVirtual, onMudou: () => { atualizarBotaoTouchpad(); avisarModo(); } });
padVirtual.hid = touchpad;
const fisico = new ControleFisico({ controle, pad: padVirtual, toast, onAtivo: () => {} });

const CLASSE_LEGENDA = { b0: 'lg-xis', b1: 'lg-bol', b2: 'lg-qua', b3: 'lg-tri' };
function mostrarLegenda(layout) {
  layoutLegenda = layout;
  const el = $('#jogo-legenda');
  // com controle não serve para nada, e menos coisa por cima da imagem é menos trabalho para mostrá-la
  el.hidden = !layout || entradaDeAgora() !== 'teclado';
  if (el.hidden) return void (el.innerHTML = '');
  const troca = mapaTeclas.carroLigado() ? mapaTeclas.entradasCarro('troca').map(nomeEntrada).join(' / ') : '';
  const carro = !mapaTeclas.carroLigado() ? ''
    : `<span class="lg-carro${noCarro ? ' on' : ''}"><b>${noCarro ? '🚗 No carro' : '🚶 A pé'}</b><kbd>${esc(troca || '△ troca')}</kbd></span>`;
  el.innerHTML = carro + legendaBotoes(layout)
    .map((b) => `<span${b.id === 'b4' ? ' class="lg-sep"' : ''}><b class="${layout === 'ps5' ? CLASSE_LEGENDA[b.id] || '' : ''}">${esc(b.botao)}</b><kbd>${esc(b.teclas)}</kbd></span>`).join('');
}
mapaTeclas.ouvir(() => { if (layoutLegenda) mostrarLegenda(layoutLegenda); });
for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (layoutLegenda) mostrarLegenda(layoutLegenda); });

function atualizarBotaoTouchpad() {
  const sh = st.alvo?.sh;
  const b = $('#jogo-touchpad');
  b.hidden = !temTouchpadHid() || !(touchpad.ativo || ehPs5(sh));
  b.textContent = ajustes.dualsense ? 'DualSense direto ligado ✓ (clique para desligar)' : 'Usar o DualSense direto (gatilhos e giroscópio; pode atrasar)';
  $('#jogo-mapear').hidden = !LAYOUTS[layoutDa(sh)]?.virtual;
}

// O DualSense direto (WebHID: gatilhos adaptativos, touchpad, giroscópio), só para quem ligar nas Opções.
// Depois de aberto assim, no Bluetooth o Chrome não o mostra mais pela Gamepad API até ele desligar.
$('#jogo-touchpad').addEventListener('click', async (e) => {
  e.currentTarget.blur();
  if (ajustes.dualsense) {
    ajustes.dualsense = false;
    gravarJSON(AJUSTES_CHAVE, ajustes);
    touchpad.desligar();
    toast('DualSense direto desligado. Desligue e ligue o controle (segure o botão PS) para ele voltar pelo caminho rápido.', 'info', 10000);
  } else {
    try {
      if (!(await touchpad.pedir())) return;
      ajustes.dualsense = true;
      gravarJSON(AJUSTES_CHAVE, ajustes);
      if (controle.jogo) await touchpad.ligar();
      toast('DualSense direto ligado: gatilhos adaptativos, touchpad e giroscópio.', 'success', 5000);
    } catch (err) {
      toast(`Não deu para ler o DualSense: ${err?.message || err}`, 'warn', 7000);
    }
  }
  avisarModo();
  atualizarBotaoTouchpad();
});

// sem controle de verdade numa tela de PS5: o tutorial do teclado. true: abriu (ou vai abrir)
function tutorialDoPs5(key) {
  if (!ehPs5(acharTela(key)?.sh)) {
    tutorial.fechar(false);
    return false;
  }
  const temControle = () => fisico.pad() || touchpad.ligado;
  if (tutorial.ativo || temControle()) return false;
  setTimeout(() => { if (controle.jogo?.key === key && !temControle()) tutorial.abrir('pc'); }, 900);
  return true;
}

// ------------------------------------------------------------------ ligar e desligar o modo jogo
controle.onJogo = (v, key) => {
  const sh = v ? acharTela(key)?.sh : null;
  if (v) {
    padVirtual.ligar(key);
    fisico.ligar(key, sh?.titulo);
  } else fisico.desligar();
  const layout = sh ? layoutDa(sh) : null;
  if (layout === 'ps5' && ajustes.dualsense) touchpad.ligar().then(atualizarBotaoTouchpad);
  else touchpad.desligar();
  const virtual = layout && LAYOUTS[layout]?.virtual ? layout : null;
  if (virtual) {
    padVirtual.acordar();
    tecladoPad.ligar(virtual);
    const dica = dicaTeclado(virtual);
    if (!tutorialDoPs5(key) && dica) toast(`Teclado e mouse viram o controle. ${dica}`, 'info', 12000);
  } else tecladoPad.desligar();
  mostrarLegenda(virtual);
  $('#jogo-tutorial').hidden = layout !== 'ps5';
  if (!v) {
    tutorial.fechar(false);
    mapaPainel.fechar();
    padVirtual.desligar(); // depois do controle: o último estado é tudo solto
    if (document.body.classList.contains('jogo-pc')) jogoNoPc(false);
  }
  jogoLa(v || null, key);
  // controle.jogo ainda vale aqui ao desligar (onJogo vem antes): a barra se acerta em seguida
  setTimeout(() => {
    atualizar();
    if (!controle.jogo) document.activeElement?.blur?.();
  }, 0);
};
controle.onEscondeu = () => {
  fisico.soltarTudo();
  tecladoPad.soltarTudo();
};
controle.onJogoSoltou = () => {
  if (controle.jogoNo) toast('Esc soltou o mouse (o jogo recebeu o Esc). Clique na tela para voltar a jogar, ou F8 para desligar o modo jogo.', 'info', 6000);
};

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
  if (!ligar) {
    navigator.keyboard?.unlock?.();
    if (document.fullscreenElement === $('#focus')) document.exitFullscreen().catch(() => {});
    return;
  }
  try {
    if (document.fullscreenElement !== $('#focus')) await $('#focus').requestFullscreen({ navigationUI: 'hide' });
    await navigator.keyboard?.lock?.(TECLAS_TRAVADAS);
    diagJogo.evento('tela cheia com o teclado travado', { trava: !!navigator.keyboard?.lock });
  } catch (err) {
    diagJogo.evento('tela cheia ou trava do teclado recusada', { erro: String(err?.message || err) });
  }
  controle.travarPonteiro(); // a tela cheia pode ter soltado o ponteiro
}
document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('jogo-pc', !!document.fullscreenElement && !!controle.jogo);
});

// o clique no "Modo jogo" (a tela cheia e o mouse preso só entram com um)
function alternarJogo() {
  if (controle.jogo) {
    esquecerJogo();
    controle.desligarJogo();
    jogoNoPc(false);
    return;
  }
  if (!jogavel() || !video.srcObject) return void toast('A imagem ainda não chegou.', 'warn');
  if (!deixarJogar()) return;
  if (!controle.tem(video)) controle.adicionar(video, st.alvo.sh.key);
  controle.modoJogo(video, true);
  jogoNoPc(true);
  if (ehPs5(st.alvo.sh) && entradaDeAgora() === 'teclado') {
    toast('Vai jogar no controle? Aperte um botão dele. Se não responder, desligue e ligue o controle (a sala pode ter deixado ele no modo direto).', 'info', 10000);
  }
  toast('Modo jogo ligado. Esc duas vezes (ou F8) desliga; segure Esc para sair da tela cheia.', 'info', 7000);
}
for (const id of ['#focus-jogo', '#jg-jogar']) {
  $(id).addEventListener('click', (e) => {
    e.currentTarget.blur();
    alternarJogo();
  });
}

controle.atalho = (e, a) => {
  if (e.code === 'F8' && !$('#focus-jogo').hidden) {
    if (a === 'down' && !e.repeat) alternarJogo();
    return true;
  }
  if (e.code === 'F9' && jogandoLa) {
    if (a === 'down' && !e.repeat) marcarEngasgo();
    return true;
  }
  return false;
};
// Esc duas vezes seguidas (a primeira foi para o jogo, ver controle.js): desliga o modo jogo. Fora do jogo:
// fecha o que estiver aberto e para de controlar
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (avisoSite.aberto) avisoSite.esc();
  else if (!$('#lan-modal').hidden) fecharAluguel();
  else if (!$('#jogo-op-pop').hidden) $('#jogo-op-pop').hidden = true;
  else if (controle.jogo) {
    esquecerJogo();
    controle.desligarJogo();
    jogoNoPc(false);
    toast('Modo jogo desligado.', 'info', 3000);
  } else if (st.controlando) {
    st.controlando = false;
    atualizarBarra();
  }
});

// ------------------------------------------------------------------ as opções
$('#focus-jogo-op').addEventListener('click', (e) => {
  const pop = $('#jogo-op-pop');
  pop.hidden = !pop.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!pop.hidden));
  e.currentTarget.blur();
  for (const el of $$('#jogo-op-pop [data-op]')) el.checked = !!opcoesJogo.get(el.dataset.op);
  atualizarBotaoTouchpad();
});
$('#jogo-op-pop').addEventListener('change', (e) => {
  const k = e.target.dataset.op;
  if (k) opcoesJogo.set(k, e.target.checked);
  e.target.blur();
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest?.('#focus-jogo-op-wrap')) $('#jogo-op-pop').hidden = true;
});
const mostrarSens = () => {
  const v = Number(opcoesJogo.get('mouseSens')) || 1;
  $('#jogo-mouse-sens').value = String(v);
  $('#jogo-mouse-sens-n').textContent = `${v.toFixed(1)}×`;
};
$('#jg-nitidez').checked = ajustes.nitidez;
$('#jg-nitidez').addEventListener('change', (e) => {
  ajustes.nitidez = e.target.checked;
  gravarJSON(AJUSTES_CHAVE, ajustes);
  if (turboRecebe.ligado) ligarTurbo(); // o realce troca a tela: liga de novo
});
mostrarSens();
$('#jogo-mouse-sens').addEventListener('input', (e) => {
  opcoesJogo.set('mouseSens', limitar(Number(e.target.value) || 1, 0.3, 3));
  mostrarSens();
});
$('#jogo-lossless').value = String(Number(opcoesJogo.get('lossless')) || 0);
$('#jogo-lossless').addEventListener('change', (e) => {
  opcoesJogo.set('lossless', Number(e.target.value) || 0);
  e.target.blur();
});
$('#jogo-mapear').addEventListener('click', (e) => {
  e.currentTarget.blur();
  $('#jogo-op-pop').hidden = true;
  tutorial.fechar(true);
  mapaPainel.abrir(layoutDa(st.alvo?.sh) === 'switch' ? 'switch' : 'ps5');
});
$('#jogo-tutorial').addEventListener('click', (e) => {
  e.currentTarget.blur();
  $('#jogo-op-pop').hidden = true;
  tutorial.abrir('pc');
});

volumes();
iniciar().catch((err) => {
  console.error('[jogar]', err);
  toast('Não deu para conectar. Recarregue a página.', 'error', 15000);
});
