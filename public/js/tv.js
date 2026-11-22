// Modo TV: a Smart TV abre o mesmo endereço da sala e o servidor entrega esta página (ver ehTV no
// server.js). Nada do mundo 3D, do formulário ou do personagem: entra direto na sala principal,
// mostra o telão em tela cheia e tem um botão só, "Modo jogo".
//
// Conta: a TV entra sem conta (só assiste). O QR code leva a /lan?tv=CÓDIGO; no celular a pessoa
// entra na conta dela, e a página /lan liga a TV nessa conta (POST /lan/tv → 'tv-conta' aqui). Lá
// mesmo ela aluga o PC ou o PS5. O QR fica sempre na tela, menos no horário pago de quem está na TV.
//
// Controle: dois caminhos, que podem ir juntos.
//   1. O controle (PS4, PS5, Xbox) ligado no Bluetooth da TV: o navegador dela entrega pela Gamepad
//      API e daqui vai o estado inteiro {t:'pad'} para quem compartilha (o mesmo controle virtual do
//      modo jogo, ver pad-virtual.js). Sem controle, as setas e o OK do controle remoto viram o
//      direcional e o ✕.
//   2. Plano B (?controle=1, aberto no celular pela página /lan): o controle ligado no celular, e o
//      celular manda os comandos. Para quem compartilha, é a mesma conta jogando: a imagem vem para a
//      TV (que liga o modo jogo) e os botões, do celular.
// Os comandos vão direto pelo WebRTC (rtc.mandarControle), e pelo servidor enquanto o canal não abre.
// Imagem no modo jogo: o Turbo (turbo.js), como o site faz para quem joga. No vídeo normal o PC de quem
// compartilha codifica de novo o que o PS5 já mandou codificado (duas compressões: a imagem saía
// granulada na TV, teste de 2026-11-22). No Turbo os quadros do PS5 vêm como saíram dele (H.265 se a
// TV decodifica) e o PC só repassa. A TV sem WebCodecs, ou com a rede apertada, volta ao vídeo normal.
// A cada 2 s a TV mede a imagem (selo com Info ou um botão colorido do controle remoto) e, ao sair do
// jogo, manda o relatório ao servidor (scripts/relatorios.js baixa: "joga", nome "conta (TV)").
import { RTC } from './rtc.js';
import { TurboRecebe } from './turbo.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const CONTROLE = params.get('controle') === '1';
const SALA = 'principal';
const LAN_CHAVE = 'sala3d-lan';
const NOME_MAQ = { pc: 'PC', ps5: 'PS5' };
const VIVO_MS = 500;
const ENVIO_MS = 8;
const INTERESSE_MS = 1000;
const SAIR_SEGURANDO_MS = 2000; // Select + Start seguidos por isso: sai do modo jogo
const ZONA_MORTA = 0.08;

window.__tvOk = true;
if (CONTROLE) document.body.classList.add('controle');

const lerJSON = (k, padrao) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? padrao; } catch { return padrao; }
};
const conta = lerJSON(LAN_CHAVE, null); // { nome, token } (o mesmo da página /lan)
const passe = lerJSON('sala3d-passes', {})[SALA] || null;

const st = {
  selfId: null,
  users: new Map(), // id -> { id, name, shares: Map(key -> share), streams: Map(id -> MediaStream) }
  main: null,
  lan: null,
  lanDif: 0,
  alvo: null, // { u, sh }: a tela que a TV mostra (e em que joga)
  jogando: null, // a chave da tela em que está no modo jogo (só a TV)
  entrou: false,
  interesse: new Map(), // id -> o último mapa enviado (JSON)
};
let socket = null;
let rtc = null;

// ------------------------------------------------------------------ avisos
let avisoTimer = 0;
function aviso(texto, tipo = 'info', ms = 5000) {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = `vidro ${tipo}`;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ------------------------------------------------------------------ entrar
async function iniciar() {
  let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  try { config = await (await fetch('/config')).json(); } catch { /* usa o padrão */ }
  socket = window.io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 1500, reconnectionDelayMax: 10000 });
  rtc = new RTC(socket, { iceServers: config.iceServers, onTrack: receberTrilha });
  rtc.onControle = receberDireto;
  setInterval(() => {
    fetch('/config').then((r) => r.json()).then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
  }, 6 * 3600_000);
  ligarSocket();
}

function entrar() {
  socket.emit('join', {
    room: SALA,
    name: conta?.nome || 'TV',
    color: '#38bdf8',
    mic: false,
    passe,
    lan: conta?.token || null,
    tv: true,
    proto: 2,
  }, (data) => {
    if (data?.erro === 'conta') {
      // o token venceu: volta a ser a TV sem conta (o QR liga de novo)
      try { localStorage.removeItem(LAN_CHAVE); } catch { /* sem storage */ }
      return location.reload();
    }
    if (data?.erro === 'senha') {
      $('#vazio-txt').textContent = 'A sala principal tem senha. Entre nela uma vez por este navegador.';
      return;
    }
    if (!data?.selfId) return;
    entrou(data);
  });
}

function entrou(data) {
  st.entrou = true;
  st.selfId = data.selfId;
  rtc.selfId = data.selfId;
  st.main = data.main;
  for (const u of data.users) addUser(u);
  aplicarLan(data.lan);
  for (const u of data.users) rtc.getPeer(u.id);
  $('#marca').classList.add('on');
  $('#conta-chip').innerHTML = conta ? `Conta <b>${esc(conta.nome)}</b>` : 'Sem conta';
  $('#btn-sair').hidden = !conta;
  $('#cel-conta').textContent = conta ? `Conta ${conta.nome} · sala ${SALA}` : 'Entre na sua conta pela página de aluguel primeiro.';
  if (!CONTROLE) pedirCodigo();
  atualizar();
}

function ligarSocket() {
  socket.on('connect', () => {
    // reconexão: começa de novo (as conexões de vídeo eram com os ids antigos)
    if (st.entrou) return location.reload();
    entrar();
  });
  socket.on('disconnect', () => {
    $('#marca').classList.remove('on');
    if (st.jogando) aviso('A conexão caiu. Voltando…', 'alerta', 8000);
  });
  socket.on('user-joined', (u) => {
    addUser(u);
    rtc.getPeer(u.id);
    atualizar();
  });
  socket.on('user-left', ({ id }) => {
    st.users.delete(id);
    st.interesse.delete(id);
    rtc.removePeer(id);
    atualizar();
  });
  socket.on('share-update', ({ id, key, slot, streamId, gone, controle, titulo, superficie }) => {
    const u = st.users.get(id);
    if (!u || typeof key !== 'string') return;
    if (gone) u.shares.delete(key);
    else {
      const sh = u.shares.get(key) || { key, streamId };
      Object.assign(sh, { slot: slot ?? null, controle: !!controle, titulo: titulo ?? null, superficie: superficie ?? sh.superficie ?? null });
      if (streamId) sh.streamId = streamId;
      u.shares.set(key, sh);
    }
    atualizar();
  });
  socket.on('main', ({ source }) => {
    st.main = source;
    atualizar();
  });
  socket.on('lan', aplicarLan);
  socket.on('controle-volta', ({ key, ev }) => receberVolta(key, ev));
  // o celular desta conta virou o controle (ou saiu do jogo): a TV entra no modo jogo sozinha
  socket.on('tv-modo', (m) => {
    if (CONTROLE) return;
    if (m?.ligar) { if (!st.jogando) ligarJogo(); } else desligarJogo();
  });
  socket.on('tv-conta', (c) => {
    if (!c?.token) return;
    try { localStorage.setItem(LAN_CHAVE, JSON.stringify({ nome: c.nome, token: c.token })); } catch { /* sem storage */ }
    aviso(`Pronto! A TV entrou na conta ${c.nome}.`, 'info', 4000);
    setTimeout(() => location.reload(), 1200);
  });
}

function addUser(u) {
  const shares = new Map((u.shares || []).map((sh) => [sh.key, { ...sh }]));
  const antes = st.users.get(u.id);
  const streams = antes?.streams || semDono.get(u.id) || new Map();
  semDono.delete(u.id);
  st.users.set(u.id, { id: u.id, name: u.name, shares, streams });
}

// ------------------------------------------------------------------ a TV no código do QR
function pedirCodigo() {
  socket.emit('tv-codigo', null, (r) => {
    if (!r?.ok) return;
    $('#qr-img').src = `/tv/qr.svg?c=${r.codigo}`;
    $('#qr-url').textContent = `${location.host}/lan?tv=${r.codigo}`;
    atualizarQr();
  });
}

// ------------------------------------------------------------------ lan house
const maquinaDaTela = (sh) => (sh?.superficie === 'ps5' || sh?.titulo === 'PS5' ? 'ps5' : 'pc');
const idsDaVez = (m) => st.lan?.[m]?.ids || [];
const minhaVez = () => Object.keys(NOME_MAQ).filter((m) => idsDaVez(m).includes(st.selfId));
function podeJogar(sh) {
  if (!st.lan) return true;
  const m = maquinaDaTela(sh);
  if (idsDaVez(m).includes(st.selfId)) return true;
  return !st.lan[m]?.conta && !st.lan.semTeste?.includes(st.selfId);
}

function aplicarLan(e) {
  st.lan = e?.ligada ? e : null;
  if (typeof e?.agora === 'number') st.lanDif = e.agora - Date.now();
  // acabou a vez (ou alguém alugou a máquina livre): sai do modo jogo
  if (st.jogando) {
    const sh = st.alvo?.sh;
    if (!sh || !podeJogar(sh)) {
      desligarJogo();
      aviso('Seu tempo acabou. Para continuar, alugue mais pelo celular (QR code).', 'alerta', 9000);
    }
  }
  atualizar();
}

function atualizarTempo() {
  const el = $('#tempo-chip');
  const minhas = minhaVez();
  let texto = '';
  if (minhas.length) {
    const m = minhas[0];
    const fim = st.lan[m].fim;
    const falta = Math.max(0, fim - (Date.now() + st.lanDif));
    const min = Math.ceil(falta / 60_000);
    texto = st.lan[m].preparando ? `Sua vez no <b>${NOME_MAQ[m]}</b> já vai começar` : `Sua vez no <b>${NOME_MAQ[m]}</b> · faltam <b>${min} min</b>`;
  } else if (st.lan && st.selfId) {
    const fimTeste = st.lan.teste?.[st.selfId];
    if (fimTeste) texto = `Teste grátis · <b>${Math.max(0, Math.ceil((fimTeste - Date.now() - st.lanDif) / 1000))} s</b>`;
  }
  el.hidden = !texto;
  el.innerHTML = texto;
  $('#cel-vez').innerHTML = texto || (st.lan ? 'Você não tem horário agora. Alugue na página de aluguel.' : 'Sala sem aluguel: pode jogar.');
}
setInterval(atualizarTempo, 1000);

// o QR some no horário pago de quem está na TV (aí ninguém troca a conta dela)
function atualizarQr() {
  const temCodigo = !!$('#qr-img').getAttribute('src');
  $('#qr').hidden = CONTROLE || !temCodigo || minhaVez().length > 0;
  $('#qr-titulo').textContent = conta ? 'Alugar mais ou trocar de conta' : 'Alugue pelo celular';
}

// ------------------------------------------------------------------ a tela do telão
// Qual tela mostrar: na minha vez, a da máquina que aluguei (PS5 ou PC); fora dela, a que está no
// telão da sala; sem telão, a primeira com o controle liberado.
function escolherAlvo() {
  const telas = [];
  for (const u of st.users.values()) {
    if (u.id === st.selfId) continue;
    for (const sh of u.shares.values()) telas.push({ u, sh });
  }
  for (const m of minhaVez()) {
    const t = telas.find((x) => maquinaDaTela(x.sh) === m && x.sh.controle) || telas.find((x) => maquinaDaTela(x.sh) === m);
    if (t) return t;
  }
  return telas.find((x) => x.sh.key === st.main) || telas.find((x) => x.sh.controle) || telas[0] || null;
}

// a imagem pode chegar antes de a TV saber de quem é (o 'user-joined' atrasado): fica guardada
const semDono = new Map(); // id -> Map(stream.id -> stream)
function receberTrilha(peerId, stream) {
  const u = st.users.get(peerId);
  if (!u) {
    if (!semDono.has(peerId)) semDono.set(peerId, new Map());
    semDono.get(peerId).set(stream.id, stream);
    return;
  }
  u.streams.set(stream.id, stream);
  mostrarVideo();
}

// "Carregando a imagem…" que não sai (2026-11-22: o PS5 entrou na sala depois de a TV abrir e a imagem
// nunca subiu): pede de novo, depois refaz a conexão com quem compartilha e, por fim, recarrega a página
let esperandoDesde = 0;
let passoEspera = 0;
setInterval(() => {
  if (CONTROLE || !st.entrou) return;
  const a = st.alvo;
  const ok = a && vivo(a.u.streams.get(a.sh.streamId));
  if (!a || ok) {
    esperandoDesde = 0;
    passoEspera = 0;
    return;
  }
  esperandoDesde ||= Date.now();
  const s = (Date.now() - esperandoDesde) / 1000;
  if (passoEspera === 0 && s > 6) {
    passoEspera = 1;
    st.interesse.delete(a.u.id);
    enviarInteresse(true);
  } else if (passoEspera === 1 && s > 14) {
    passoEspera = 2;
    console.info('[tv] a imagem não chegou: refazendo a conexão com', a.u.name);
    rtc.refazer(a.u.id, 'a imagem da TV não chegou');
  } else if (passoEspera === 2 && s > 40) {
    passoEspera = 3;
    location.reload();
  }
}, 2000);

const vivo = (s) => s && s.getTracks().some((t) => t.readyState === 'live');
const video = $('#tela');
function mostrarVideo() {
  if (CONTROLE) return;
  const a = st.alvo;
  const stream = a ? a.u.streams.get(a.sh.streamId) : null;
  const ok = vivo(stream);
  if (ok && video.srcObject !== stream) {
    video.srcObject = stream;
    tocar();
    if (st.jogando) rtc.baixaLatencia(stream, true, BUFFER_MS);
  } else if (!ok && video.srcObject) video.srcObject = null;
  $('#vazio').hidden = ok;
  if (!ok) {
    $('#vazio').querySelector('b').textContent = a ? 'Carregando a imagem…' : 'Nada no telão agora';
    $('#vazio-txt').textContent = a ? `${a.u.name} · ${NOME_MAQ[maquinaDaTela(a.sh)]}` : 'Quando o PC ou o PS5 entrar na sala, a imagem aparece aqui.';
  }
}

// TV costuma deixar tocar com som; se não deixar, começa mudo e o OK liga
function tocar() {
  video.muted = false;
  video.play().then(() => { $('#btn-som').hidden = true; }).catch(() => {
    video.muted = true;
    video.play().catch(() => {});
    $('#btn-som').hidden = false;
  });
}
function ligarSom() {
  if (!video.muted) return;
  video.muted = false;
  video.play().catch(() => {});
  $('#btn-som').hidden = true;
}

// Quanto cada um precisa mandar: a tela do alvo no máximo, o resto nada (na TV, nem a voz das
// pessoas toca). O celular-controle não vê imagem nenhuma.
function enviarInteresse(forcar = false) {
  if (!rtc || !st.selfId) return;
  for (const u of st.users.values()) {
    if (u.id === st.selfId || !u.shares.size) continue;
    const mapa = {};
    for (const sh of u.shares.values()) mapa[sh.key] = !CONTROLE && sh.key === st.alvo?.sh.key ? 'max' : 'off';
    const json = JSON.stringify(mapa);
    if (!forcar && st.interesse.get(u.id) === json) continue;
    st.interesse.set(u.id, json);
    rtc.enviarInteresse(u.id, mapa);
  }
}
let ultimoCompleto = 0;
setInterval(() => {
  const agora = Date.now();
  const completo = agora - ultimoCompleto > 8000;
  if (completo) ultimoCompleto = agora;
  enviarInteresse(completo);
}, INTERESSE_MS);

function atualizar() {
  const antes = st.alvo?.sh.key;
  st.alvo = escolherAlvo();
  // a tela em que estava jogando saiu do ar: sai do modo jogo
  if (st.jogando && st.alvo?.sh.key !== st.jogando) desligarJogo(false);
  if (antes !== st.alvo?.sh.key) enviarInteresse(true);
  mostrarVideo();
  atualizarQr();
  atualizarTempo();
  atualizarBotao();
  atualizarCelular();
}

// ------------------------------------------------------------------ comandos para o jogo
function mandar(key, ev) {
  const dono = String(key).split('~')[0];
  if (rtc.mandarControle(dono, { c: { key, ev } })) return;
  socket.emit('controle', { key, ev });
}

// a chave em que os botões vão agora: na TV, a do modo jogo; no celular, a do alvo (se pode jogar)
function chaveDoPad() {
  if (!CONTROLE) return st.jogando;
  const sh = st.alvo?.sh;
  return sh?.controle && podeJogar(sh) ? sh.key : null;
}

function ligarJogo() {
  ligarSom();
  const a = st.alvo;
  if (!a) return aviso('Nada no telão para jogar agora.', 'alerta');
  if (!a.sh.controle) return aviso(`O controle do ${NOME_MAQ[maquinaDaTela(a.sh)]} não está liberado agora.`, 'alerta');
  if (!podeJogar(a.sh)) {
    return aviso(conta
      ? `Você não tem horário no ${NOME_MAQ[maquinaDaTela(a.sh)]} agora. Alugue pelo celular: aponte a câmera para o QR code.`
      : 'Para jogar, alugue pelo celular: aponte a câmera para o QR code.', 'alerta', 9000);
  }
  st.jogando = a.sh.key;
  document.body.classList.add('jogando');
  document.activeElement?.blur?.();
  mandar(st.jogando, { t: 'modo', jogo: true, rapido: false, vibra: !!gamepad()?.vibrationActuator, ds: false });
  enviado = null; // o estado do controle vai inteiro de novo
  comecarRelatorio(a);
  if (video.srcObject) evento('buffer do vídeo normal', { feitos: rtc.baixaLatencia(video.srcObject, true, BUFFER_MS) });
  if (!turboFalhou) {
    turbo.ligar(st.jogando, video, 1080);
    evento('turbo ligado');
  }
  mostrarSelo(10_000);
  const dica = $('#dica-jogo');
  dica.classList.remove('some');
  setTimeout(() => dica.classList.add('some'), 5000);
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* TV sem tela cheia */ }
  history.pushState({ jogo: true }, ''); // o Voltar do controle remoto sai do jogo, não do site
}

function desligarJogo(avisarLa = true) {
  const key = st.jogando;
  if (!key) return;
  if (avisarLa) {
    mandar(key, { t: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
    mandar(key, { t: 'modo', jogo: false });
  }
  st.jogando = null;
  turbo.desligar();
  document.body.classList.remove('jogando');
  if (video.srcObject) rtc.baixaLatencia(video.srcObject, false);
  focar($('#btn-jogo'));
  mandarRelatorio('saiu do jogo');
}

// ------------------------------------------------------------------ Turbo e a medida da imagem
// Um buffer pequeno no vídeo normal: com 0, cada pacote atrasado no Wi-Fi da TV virava quadro perdido e
// pedido de quadro-chave (o PC gasta a banda no quadro-chave e a imagem embaça)
const BUFFER_MS = 40;
let turboFalhou = null; // o motivo: nesta página a TV fica no vídeo normal
const turbo = new TurboRecebe({
  abrir: (id, vida) => rtc?.abrirTurbo(id, vida),
  abrirSom: (id) => rtc?.abrirTurboSom(id),
  somDaTela: () => video,
  volume: () => 1,
  onEvento: (texto, dados) => evento(texto, dados),
  onFalhou: (motivo) => {
    // TV LG (webOS, Chrome 94, teste de 2026-11-22): o decodificador recusou o H.265 que ela disse
    // aceitar. Antes de desistir, tenta uma vez só com o H.264.
    if (motivo === 'decodificador' && !turbo.semHevc && st.jogando) {
      turbo.semHevc = true;
      evento('turbo: o decodificador falhou, tentando só com H.264', { erros: errosTurbo.slice(-5) });
      turbo.ligar(st.jogando, video, 1080);
      return;
    }
    turboFalhou = motivo;
    evento('turbo falhou: vídeo normal', { motivo, erros: errosTurbo.slice(-5) });
    if (st.jogando && video.srcObject) evento('buffer do vídeo normal', { feitos: rtc.baixaLatencia(video.srcObject, true, BUFFER_MS) });
  },
});
// TV: a aceleração da placa pode não existir para o WebCodecs (LG webOS): tenta sem preferência e no processador
turbo.aceleracoes = ['prefer-hardware', 'no-preference', 'prefer-software'];
// os erros do Turbo (decodificador da TV) vão para o relatório: é com eles que dá para ver o que a TV recusa
const errosTurbo = [];
const warnOriginal = console.warn.bind(console);
console.warn = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('[turbo]') && errosTurbo.length < 50) errosTurbo.push(a.map((x) => String(x?.message || x)).join(' ').slice(0, 300));
  warnOriginal(...a);
};

// o caminho do controle: ping pelo canal direto até quem compartilha (volta {pe, aj}: a ida e volta e
// quanto o ajudante de lá levou), o mesmo que o site mede para quem joga
const ping = { rtt: [], aj: null };
setInterval(() => {
  if (!st.jogando || !rtc) return;
  rtc.mandarControle(String(st.jogando).split('~')[0], { p: performance.now() });
}, 1000);

let rel = null; // o relatório desta vez no jogo
function comecarRelatorio(a) {
  rel = {
    id: `tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    lado: 'joga',
    inicio: new Date().toISOString(),
    fim: null,
    tv: true,
    ambiente: {
      ua: navigator.userAgent,
      tela: `${screen.width}×${screen.height}`,
      janela: `${innerWidth}×${innerHeight}`,
      dpr: devicePixelRatio,
      webcodecs: typeof VideoDecoder === 'function',
      controle: gamepad() ? nomeDoControle(gamepad()) : null,
    },
    alvo: { dono: a.u.name, maquina: maquinaDaTela(a.sh), superficie: a.sh.superficie || null, titulo: a.sh.titulo || null },
    eventos: [],
    amostras: [],
    enviado: false,
  };
}
function evento(texto, dados = null) {
  if (!rel) return;
  if (rel.eventos.length < 300) rel.eventos.push({ t: Date.now(), texto, ...(dados ? { dados } : {}) });
}

// a imagem que chega pelo vídeo normal (getStats do receptor da tela)
const medidaAntes = new Map(); // id do inbound-rtp -> { bytes, t, quadros }
async function medirVideo() {
  const a = st.alvo;
  const trilha = video.srcObject?.getVideoTracks?.()[0];
  const peer = a && rtc?.peers.get(a.u.id);
  if (!trilha || !peer) return null;
  let rep;
  try {
    rep = await peer.pc.getStats(trilha);
  } catch {
    return null;
  }
  let inb = null;
  const codecs = new Map();
  rep.forEach((r) => {
    if (r.type === 'inbound-rtp' && r.kind === 'video') inb = r;
    else if (r.type === 'codec') codecs.set(r.id, r.mimeType);
  });
  if (!inb) return null;
  const antes = medidaAntes.get(inb.id);
  const agora = { bytes: inb.bytesReceived, t: inb.timestamp, buf: inb.jitterBufferDelay || 0, saidos: inb.jitterBufferEmittedCount || 0, dec: inb.totalDecodeTime || 0, decodificados: inb.framesDecoded || 0 };
  medidaAntes.set(inb.id, agora);
  const kbps = antes && inb.timestamp > antes.t ? Math.round(((inb.bytesReceived - antes.bytes) * 8) / (inb.timestamp - antes.t)) : null;
  // nos últimos 2 s (o jitterBufferDelay é a soma desde o começo: a média geral escondia o de agora)
  const saidos = antes ? agora.saidos - antes.saidos : 0;
  const decs = antes ? agora.decodificados - antes.decodificados : 0;
  return {
    largura: inb.frameWidth ?? null,
    altura: inb.frameHeight ?? null,
    qps: inb.framesPerSecond ?? null,
    kbps,
    codec: (codecs.get(inb.codecId) || '').replace('video/', '') || null,
    decodificador: inb.decoderImplementation ?? null,
    perdidos: inb.packetsLost ?? null,
    pacotes: inb.packetsReceived ?? null,
    descartados: inb.framesDropped ?? null,
    congelou: inb.freezeCount ?? null,
    pli: inb.pliCount ?? null,
    nack: inb.nackCount ?? null,
    bufferMs: saidos > 0 ? Math.round(((agora.buf - antes.buf) / saidos) * 1000) : null,
    decMs: decs > 0 ? Math.round(((agora.dec - antes.dec) / decs) * 10000) / 10 : null,
  };
}

let seloAte = 0;
let seloSempre = false;
function mostrarSelo(ms) {
  seloAte = performance.now() + ms;
}
setInterval(async () => {
  if (CONTROLE || !st.jogando) {
    $('#selo').hidden = true;
    return;
  }
  const t = turbo.ligado ? turbo.stats() : null;
  const v = await medirVideo();
  const rtts = [...ping.rtt].sort((x, y) => x - y);
  const controle = { rttMs: rtts.length ? Math.round(rtts[rtts.length >> 1]) : null, ajudanteMs: ping.aj, pad: !!gamepad() };
  ping.rtt.length = 0;
  if (rel && rel.amostras.length < 1800) rel.amostras.push({ t: Date.now(), turbo: t, video: v, controle });
  if (rel && !rel.enviado && rel.amostras.length === 45) mandarRelatorio('90 s de jogo', true); // a TV pode desligar sem sair
  const usado = t && t.qps > 0 ? { ...t, via: 'Turbo' } : v ? { ...v, via: 'vídeo' } : null;
  const el = $('#selo');
  el.hidden = !(seloSempre || performance.now() < seloAte) || !usado;
  if (usado) {
    const mbps = usado.kbps != null ? `${(usado.kbps / 1000).toFixed(1)} Mbps` : '–';
    const res = usado.largura ? `${usado.largura}×${usado.altura}` : '–';
    const codec = usado.codec ? String(usado.codec).toUpperCase().replace('H265', 'H.265').replace('H264', 'H.264') : '';
    // atraso que dá para medir aqui: a espera na fila do vídeo (ou o liso do Turbo) e o caminho do controle
    const espera = usado.via === 'vídeo' && usado.bufferMs != null ? ` · fila ${usado.bufferMs} ms` : usado.pontaMs != null ? ` · imagem ${Math.round(usado.pontaMs)} ms` : '';
    const ctrl = controle.rttMs != null ? ` · controle ${Math.round(controle.rttMs / 2)} ms` : '';
    el.textContent = `${usado.via} · ${res} · ${Math.round(usado.qps || 0)} qps · ${mbps}${codec ? ` · ${codec}` : ''}${espera}${ctrl}${turboFalhou ? ` · turbo: ${turboFalhou}` : ''}`;
  }
}, 2000);

function mandarRelatorio(motivo, parcial = false) {
  if (!rel || !rel.amostras.length) return;
  const r = { ...rel, fim: new Date().toISOString(), motivo };
  const qps = r.amostras.map((x) => x.turbo?.qps || x.video?.qps).filter((x) => x > 0);
  r.resumo = { mediaQps: qps.length ? qps.reduce((s, x) => s + x, 0) / qps.length : null, turbo: !!r.amostras.some((x) => x.turbo?.qps), turboFalhou };
  const corpo = JSON.stringify({ id: parcial ? `${r.id}-p` : r.id, relatorio: r, sala: SALA, nome: `${conta?.nome || 'sem conta'} (TV)`, relogio: Date.now() });
  if (parcial) rel.enviado = true;
  else rel = null;
  try {
    fetch('/relatorio-jogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: corpo.length < 60_000 }).catch(() => {});
  } catch { /* sem rede */ }
}
addEventListener('pagehide', () => mandarRelatorio('a página fechou'));

// "estou aqui": sem notícia, quem compartilha solta o que estava apertado
setInterval(() => {
  const key = CONTROLE ? (gamepad() || toque.ativo ? chaveDoPad() : null) : st.jogando;
  if (key) mandar(key, { t: 'vivo' });
}, VIVO_MS);

// a volta: o jogo vibrou o controle
function receberDireto(id, m) {
  if (typeof m?.pe === 'number') {
    if (ping.rtt.length > 30) ping.rtt.shift();
    ping.rtt.push(performance.now() - m.pe);
    if (typeof m.aj === 'number') ping.aj = m.aj;
    return;
  }
  if (m?.v && typeof m.v.key === 'string' && m.v.key.split('~')[0] === id) receberVolta(m.v.key, m.v.ev);
}
function receberVolta(key, ev) {
  if (!ev || key !== st.jogando) return;
  if (ev.t === 'tremor') {
    const a = gamepad()?.vibrationActuator;
    a?.playEffect?.('dual-rumble', { duration: 1500, startDelay: 0, strongMagnitude: Math.min(1, Number(ev.g) || 0), weakMagnitude: Math.min(1, Number(ev.p) || 0) }).catch(() => {});
  }
}

// ------------------------------------------------------------------ o controle (Gamepad API)
let gpIndice = null;
function gamepad() {
  const lista = [...(navigator.getGamepads?.() || [])].filter((g) => g?.connected);
  return lista.find((g) => g.index === gpIndice) || lista.find((g) => g.mapping === 'standard') || lista[0] || null;
}
addEventListener('gamepadconnected', (e) => {
  gpIndice = e.gamepad.index;
  if (CONTROLE && conta) socket?.emit('tv-modo', { ligar: true }); // o controle ligado no celular: a TV entra no jogo
  aviso(`Controle ligado: ${nomeDoControle(e.gamepad)}`, 'info', 3500);
  atualizarBotao();
  atualizarCelular();
});
addEventListener('gamepaddisconnected', () => {
  gpIndice = null;
  atualizarBotao();
  atualizarCelular();
});

function nomeDoControle(g) {
  const id = String(g?.id || '');
  if (/xbox|045e|xinput/i.test(id)) return 'Controle de Xbox';
  if (/054c.*(0ce6|0df2)|dualsense/i.test(id)) return 'DualSense (PS5)';
  if (/054c.*(05c4|09cc|0ba0)|dualshock 4|^wireless controller/i.test(id)) return 'DualShock 4 (PS4)';
  if (/054c.*0268|playstation\(r\)3|ps3/i.test(id)) return 'DualShock 3 (PS3)';
  return id.replace(/\s*\(.*$/, '').slice(0, 40) || 'Controle';
}

const dz = (v) => {
  const n = Number(v) || 0;
  return Math.abs(n) < ZONA_MORTA ? 0 : Math.round(n * 1000) / 1000;
};
// o estado no formato do controle virtual (pad-virtual.js): bits dos botões do mapa padrão,
// analógicos e gatilhos
function estadoDoControle(g) {
  let b = 0;
  g.buttons.forEach((bt, i) => {
    if (i <= 16 && (bt.pressed || bt.value > 0.5)) b |= 1 << i;
  });
  const ax = g.axes;
  return { b, lx: dz(ax[0]), ly: dz(ax[1]), rx: dz(ax[2]), ry: dz(ax[3]), lt: dz(g.buttons[6]?.value), rt: dz(g.buttons[7]?.value) };
}

// sem controle na TV: as setas e o OK do controle remoto viram o direcional e o ✕
const remoto = { b: 0 };
const BIT_REMOTO = { ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15, Enter: 0 };

let enviado = null;
let ultimoEnvio = 0;
let botoesAntes = 0;
let segurandoSair = 0;
function lerControles() {
  const g = gamepad();
  const e = g ? estadoDoControle(g) : { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
  e.b |= remoto.b;
  // o controle de toque do celular soma com o de verdade: botões juntos e, em cada eixo, o mais empurrado
  if (toque.ativo) {
    e.b |= toque.b;
    for (const k of ['lx', 'ly', 'rx', 'ry', 'lt', 'rt']) if (Math.abs(toque[k]) > Math.abs(e[k])) e[k] = toque[k];
  }
  // fora do jogo, na TV: o ✕/A aperta o botão em foco e o direcional anda entre os botões
  if (!CONTROLE && !st.jogando && g) {
    const novo = e.b & ~botoesAntes;
    if (novo & 1) document.activeElement?.click?.();
    if (novo & (1 << 14 | 1 << 12)) moverFoco(-1);
    if (novo & (1 << 15 | 1 << 13)) moverFoco(1);
  }
  // Select + Start (Create + Options / View + Menu) seguidos: sai do jogo
  if (!CONTROLE && st.jogando && (e.b & 0x300) === 0x300) {
    segurandoSair ||= performance.now();
    if (performance.now() - segurandoSair > SAIR_SEGURANDO_MS) {
      segurandoSair = 0;
      desligarJogo();
      botoesAntes = e.b;
      return;
    }
  } else segurandoSair = 0;
  botoesAntes = e.b;
  const key = chaveDoPad();
  if (!key) {
    enviado = null;
    return;
  }
  const mudou = !enviado || e.b !== enviado.b || ['lx', 'ly', 'rx', 'ry', 'lt', 'rt'].some((k) => e[k] !== enviado[k]);
  // botão mudou: sai na hora; só o analógico respeita o intervalo
  const botao = !enviado || e.b !== enviado.b;
  if (!mudou || (!botao && performance.now() - ultimoEnvio < ENVIO_MS)) return;
  // celular sem controle ligado: não manda nada (o da TV pode estar jogando)
  if (CONTROLE && !g && !toque.ativo) return;
  enviado = e;
  ultimoEnvio = performance.now();
  mandar(key, { t: 'pad', ...e });
}
setInterval(lerControles, ENVIO_MS);

// ------------------------------------------------------------------ o controle remoto da TV
// Voltar: Tizen (Samsung) 10009, webOS (LG) 461, Android TV Escape/BrowserBack
const VOLTAR = new Set([10009, 461, 27, 166]);
const ehVoltar = (e) => VOLTAR.has(e.keyCode) || ['Escape', 'GoBack', 'BrowserBack', 'Back'].includes(e.key);
// Info e os botões coloridos (Tizen/webOS 403–406 e 457; I no teclado): mostra ou esconde o selo da imagem
const SELO = new Set([403, 404, 405, 406, 457]);
addEventListener('keydown', (e) => {
  if (CONTROLE) return;
  ligarSom();
  if (SELO.has(e.keyCode) || ['Info', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'i', 'I'].includes(e.key)) {
    e.preventDefault();
    seloSempre = !seloSempre;
    return;
  }
  if (st.jogando) {
    if (ehVoltar(e)) {
      e.preventDefault();
      return desligarJogo();
    }
    if (e.key in BIT_REMOTO) {
      e.preventDefault();
      remoto.b |= 1 << BIT_REMOTO[e.key];
    }
    return;
  }
  if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    moverFoco(-1);
  } else if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    moverFoco(1);
  }
});
addEventListener('keyup', (e) => {
  if (e.key in BIT_REMOTO) remoto.b &= ~(1 << BIT_REMOTO[e.key]);
});
// Android TV: o Voltar vira "voltar na história" (o pushState do ligarJogo segura um passo)
addEventListener('popstate', () => {
  if (st.jogando) desligarJogo();
});

function focaveis() {
  return [...document.querySelectorAll('[data-foco]')].filter((el) => !el.hidden && el.offsetParent !== null);
}
function focar(el) {
  if (!el) return;
  for (const f of focaveis()) f.classList.toggle('foco', f === el);
  el.focus({ preventScroll: true });
}
function moverFoco(passo) {
  const lista = focaveis();
  if (!lista.length) return;
  const i = lista.indexOf(document.activeElement);
  focar(lista[(i + passo + lista.length) % lista.length]);
}

$('#btn-jogo').addEventListener('click', ligarJogo);
$('#btn-som').addEventListener('click', ligarSom);
$('#btn-sair').addEventListener('click', () => {
  try { localStorage.removeItem(LAN_CHAVE); } catch { /* sem storage */ }
  location.reload();
});
video.addEventListener('click', () => ligarSom());

function atualizarBotao() {
  if (CONTROLE) return;
  const g = gamepad();
  const el = $('#pad-status');
  el.classList.toggle('ok', !!g);
  el.innerHTML = g
    ? `🎮 <b>${esc(nomeDoControle(g))}</b> ligado. Aperte <b>✕ / A</b> no Modo jogo.${g.mapping !== 'standard' ? '<br>Este controle veio sem o mapa padrão: algum botão pode trocar de lugar.' : ''}`
    : `Ligue o controle (PS4, PS5 ou Xbox) no <b>Bluetooth da TV</b> e aperte um botão.<br>A TV não reconhece? Use o <b>celular como controle</b>: escaneie o QR e, lá, toque em “Usar o celular como controle”.`;
  const sh = st.alvo?.sh;
  $('#btn-jogo').textContent = sh ? `▶ Modo jogo · ${NOME_MAQ[maquinaDaTela(sh)]}` : '▶ Modo jogo';
  if (!document.activeElement || document.activeElement === document.body) focar($('#btn-jogo'));
}

// ------------------------------------------------------------------ o celular como controle (toque)
// Sem controle de verdade, o próprio celular vira um controle de PS5 na tela (deitado). Ao abrir, a TV
// desta conta entra no modo jogo sozinha ('tv-modo' pelo servidor); "Sair do jogo" tira.
const TOQUE_MIN_MS = 50;
const toque = { ativo: false, b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
const vibrarToque = () => { try { navigator.vibrate?.(8); } catch { /* sem motor */ } };
let travaTela = null;
async function ligarToque() {
  const el = $('#toque');
  el.hidden = false;
  toque.ativo = true;
  enviado = null;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* iPhone e navegadores sem tela cheia: o aviso "gire o celular" cobre */ }
  try { travaTela = await navigator.wakeLock?.request('screen'); } catch { /* sem wake lock */ }
  socket?.emit('tv-modo', { ligar: true });
  atualizarToque();
}
function desligarToque() {
  Object.assign(toque, { ativo: false, b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
  const key = chaveDoPad();
  if (key) mandar(key, { t: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
  $('#toque').hidden = true;
  for (const b of document.querySelectorAll('#toque .on')) b.classList.remove('on');
  socket?.emit('tv-modo', { ligar: false });
  try { travaTela?.release(); } catch { /* já solta */ }
  travaTela = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
function atualizarToque() {
  if (!toque.ativo) return;
  const sh = st.alvo?.sh;
  const txt = !conta ? 'Sem conta' : !sh ? 'Nada no telão' : !sh.controle ? 'Controle travado' : !podeJogar(sh) ? 'Sem horário agora' : `Jogando no ${NOME_MAQ[maquinaDaTela(sh)]}`;
  $('#toque-status').textContent = txt;
}
setInterval(atualizarToque, 1000);

if (CONTROLE) {
  const raiz = $('#toque');
  raiz.addEventListener('contextmenu', (e) => e.preventDefault());
  // botões: cada dedo segura o seu (multitoque); L2 e R2 também vão como gatilho inteiro
  for (const el of raiz.querySelectorAll('[data-b]')) {
    const bit = Number(el.dataset.b);
    let desde = 0;
    let timer = 0;
    // um toque rápido vale pelo menos TOQUE_MIN_MS: o jogo lê o controle a cada quadro e perderia o aperto
    const soltar = () => {
      if (!desde) return;
      const falta = TOQUE_MIN_MS - (performance.now() - desde);
      desde = 0;
      el.classList.remove('on');
      clearTimeout(timer);
      timer = setTimeout(() => {
        toque.b &= ~(1 << bit);
        if (bit === 6) toque.lt = 0;
        if (bit === 7) toque.rt = 0;
        lerControles();
      }, Math.max(0, falta));
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ponteiro já solto */ }
      clearTimeout(timer);
      desde = performance.now();
      el.classList.add('on');
      toque.b |= 1 << bit;
      if (bit === 6) toque.lt = 1;
      if (bit === 7) toque.rt = 1;
      vibrarToque();
      lerControles(); // sai na hora, sem esperar a próxima leitura
    });
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
    el.addEventListener('lostpointercapture', soltar);
  }
  // analógicos: o dedo arrasta a bolinha; o eixo vai de -1 a 1 (y para baixo é positivo, como no controle)
  for (const el of raiz.querySelectorAll('[data-stick]')) {
    const lado = el.dataset.stick;
    const bola = el.querySelector('i');
    let dedo = null;
    const mover = (e) => {
      const r = el.getBoundingClientRect();
      const raio = r.width / 2;
      let dx = (e.clientX - (r.left + raio)) / raio;
      let dy = (e.clientY - (r.top + raio)) / raio;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      toque[`${lado}x`] = Math.round(dx * 1000) / 1000;
      toque[`${lado}y`] = Math.round(dy * 1000) / 1000;
      bola.style.transform = `translate(${dx * raio * 0.6}px, ${dy * raio * 0.6}px)`;
    };
    const soltar = () => {
      dedo = null;
      el.classList.remove('on');
      toque[`${lado}x`] = 0;
      toque[`${lado}y`] = 0;
      bola.style.transform = '';
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dedo = e.pointerId;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ponteiro já solto */ }
      el.classList.add('on');
      mover(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === dedo) mover(e); });
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  }
  $('#btn-toque').addEventListener('click', ligarToque);
  $('#toque-sair').addEventListener('click', desligarToque);
  // voltou para a página (a tela apagou e acendeu): a trava da tela volta
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && toque.ativo && !travaTela) {
      try { travaTela = await navigator.wakeLock?.request('screen'); } catch { /* sem wake lock */ }
    }
  });
}

function atualizarCelular() {
  if (!CONTROLE) return;
  const g = gamepad();
  const pad = $('#cel-pad');
  pad.textContent = g ? `🎮 ${nomeDoControle(g)} ligado` : 'Nenhum controle ligado';
  pad.className = `grande-status ${g ? 'ok' : ''}`;
  $('#cel-pad-txt').hidden = !!g;
  $('#btn-toque').hidden = !conta;
  const sh = st.alvo?.sh;
  const el = $('#cel-alvo');
  if (!conta) el.innerHTML = '<span class="ruim">Sem conta.</span> Abra a página de aluguel, entre na sua conta e volte aqui.';
  else if (!sh) el.textContent = 'Nada no telão agora. Quando o PC ou o PS5 entrar na sala, os botões vão para ele.';
  else if (!sh.controle) el.innerHTML = `<span class="ruim">O controle do ${NOME_MAQ[maquinaDaTela(sh)]} não está liberado.</span>`;
  else if (!podeJogar(sh)) el.innerHTML = `<span class="ruim">Sem horário no ${NOME_MAQ[maquinaDaTela(sh)]} agora.</span> Alugue na página de aluguel.`;
  else el.innerHTML = `Os botões vão para o <b>${NOME_MAQ[maquinaDaTela(sh)]}</b>${g ? ' <span class="ok">· jogando</span>' : ''}.`;
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// o celular-controle sem conta: nem entra (a página /lan faz o login)
if (CONTROLE && !conta) {
  atualizarCelular();
  $('#cel-conta').innerHTML = 'Sem conta. <a href="/lan" style="color:#6ee7c8">Entrar na página de aluguel</a>';
} else {
  iniciar().catch((err) => {
    console.error('[tv]', err);
    aviso('Não deu para conectar. Recarregando…', 'erro', 8000);
    setTimeout(() => location.reload(), 8000);
  });
}
atualizarBotao();
