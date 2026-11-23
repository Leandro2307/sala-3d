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
//
// Quedas: a conexão com o servidor que pisca entra de novo sem recarregar (reentrar; só um deploy recarrega),
// e a tela do jogo que saiu e voltou põe a TV no jogo sozinha (tentarVoltar, até 3 min).
import { RTC } from './rtc.js';
import { contarCulpa, culpaDe, linhaDaCulpa, Sonda } from './culpa.js';

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
const VOLTAR_CHAVE = 'sala3d-tv-voltar';
const VOLTAR_MS = 3 * 60_000;
const VOLTAR_MAX = 3; // a página recarregou tantas vezes seguidas, sem 1 min de jogo entre elas: só pelo botão
const TOQUE_ABERTO = 'sala3d-tv-toque-aberto';

window.__tvOk = true;
if (CONTROLE) document.body.classList.add('controle');

const lerJSON = (k, padrao) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? padrao; } catch { return padrao; }
};
const conta = lerJSON(LAN_CHAVE, null); // { nome, token } (o mesmo da página /lan)
let passe = lerJSON('sala3d-passes', {})[SALA] || null;
function guardarPasse(p) {
  passe = p;
  const passes = lerJSON('sala3d-passes', {});
  if (p) passes[SALA] = p;
  else delete passes[SALA];
  try { localStorage.setItem('sala3d-passes', JSON.stringify(passes)); } catch { /* sem storage */ }
}

const st = {
  selfId: null,
  users: new Map(), // id -> { id, name, shares: Map(key -> share), streams: Map(id -> MediaStream) }
  main: null,
  lan: null,
  lanDif: 0,
  alvo: null, // { u, sh }: a tela que a TV mostra (e em que joga)
  escolhida: null, // a tela escolhida no botão "Ver o PS5/PC" (chave)
  jogando: null, // a chave da tela em que está no modo jogo (só a TV)
  jogo: null, // { dono, maquina, voltas, desde } do jogo de agora, para voltar a ele depois de uma queda
  telaDaTv: null, // só no celular: a tela em que a TV desta conta está jogando (null: fora do jogo)
  chamouTv: 0, // só no celular: quando pediu à TV para entrar no jogo
  tvRespondeu: 0, // e quando ela respondeu
  entrou: false,
  versao: null, // a do servidor na primeira entrada
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
const pegarConfig = () => fetch('/config').then((r) => r.json());
async function iniciar() {
  // a conexão com o servidor já vai abrindo enquanto o /config vem (uma ida e volta a menos)
  const config = pegarConfig().catch(() => null);
  socket = window.io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 1500, reconnectionDelayMax: 10000 });
  const ice = (await config)?.iceServers;
  rtc = new RTC(socket, {
    iceServers: Array.isArray(ice) && ice.length ? ice : [{ urls: 'stun:stun.l.google.com:19302' }],
    onTrack: receberTrilha,
    onFalha: (id, temTurn) => {
      if (CONTROLE || id !== st.alvo?.u.id) return;
      aviso(temTurn ? `Não deu para conectar com ${st.alvo.u.name}. Tentando de novo…` : `A rede daqui bloqueia a conexão com ${st.alvo.u.name}.`, 'erro', 10_000);
    },
  });
  rtc.onControle = receberDireto;
  rtc.semHevc = true; // TV: sempre H.264 (rtc.soH264)
  const renovar = () => pegarConfig().then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
  setInterval(renovar, 6 * 3600_000);
  // entrou sem o TURN (o /config falhou, o servidor acordando): pede de novo até vir, como a sala
  if (!rtc.temTurn) {
    const semTurn = setInterval(() => { if (rtc.temTurn) clearInterval(semTurn); else renovar(); }, 10_000);
  }
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
    // o servidor mudou de versão enquanto a conexão estava fora (deploy): o código novo combina com ele
    if (st.versao && data.versao && data.versao !== st.versao) return location.reload();
    st.versao ??= data.versao || null;
    entrou(data);
  });
}

function entrou(data) {
  st.entrou = true;
  st.selfId = data.selfId;
  rtc.selfId = data.selfId;
  st.main = data.main;
  if (data.passe) guardarPasse(data.passe);
  for (const u of data.users) addUser(u);
  // as conexões antes do primeiro pedido de imagem (aplicarLan → atualizar): sem elas o pedido não sai, e a
  // imagem ficava em 270p até o próximo pedido completo, 8 s depois (numa TV lenta, 10 s para chegar a 1080p)
  for (const u of data.users) rtc.getPeer(u.id);
  aplicarLan(data.lan);
  $('#marca').classList.add('on');
  $('#conta-chip').innerHTML = conta ? `Conta <b>${esc(conta.nome)}</b>` : 'Sem conta';
  $('#btn-sair').hidden = !conta;
  $('#cel-conta').textContent = conta ? `Conta ${conta.nome} · sala ${SALA}` : 'Entre na sua conta pela página de aluguel primeiro.';
  if (!CONTROLE) pedirCodigo();
  else if (toque.ativo || (conta && gamepad())) chamarTv(true); // a conexão voltou com o controle na mão
  atualizar();
}

// Reconexão: os ids mudaram e as conexões de vídeo eram com os antigos. Entra de novo sem recarregar a página: a
// tela cheia fica, e o som também (recarregada sem um gesto, a TV podia voltar muda).
function reentrar() {
  if (st.jogando) caiuDoJogo('a conexão com a sala caiu');
  for (const id of [...rtc.peers.keys()]) rtc.removePeer(id);
  st.users.clear();
  st.interesse.clear();
  semDono.clear();
  Object.assign(st, { entrou: false, selfId: null, main: null, alvo: null, telaDaTv: null });
  mostrarVideo();
  entrar();
}

function ligarSocket() {
  const aoConectar = () => (st.entrou ? reentrar() : entrar());
  socket.on('connect', aoConectar);
  if (socket.connected) aoConectar(); // conectou antes de o /config chegar
  socket.on('disconnect', () => {
    $('#marca').classList.remove('on');
    lembrarJogo();
    if (st.jogando) aviso('A conexão caiu. Voltando…', 'alerta', 8000);
  });
  // o dono pôs ou trocou a senha da sala: o passe novo, para reconectar
  socket.on('passe', guardarPasse);
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
    if (gone) {
      const sh = u.shares.get(key);
      if (sh) u.streams.delete(sh.streamId);
      u.shares.delete(key);
    } else {
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
  // o celular desta conta virou o controle (ou saiu do jogo): a TV entra no modo jogo sozinha e responde em que
  // tela está (os botões dele vão para ela)
  socket.on('tv-modo', (m) => {
    if (CONTROLE) return;
    if (!m?.ligar) {
      esquecerJogo();
      desligarJogo();
    } else if (st.jogando || !ligarJogo()) avisarTela();
  });
  socket.on('tv-tela', (m) => {
    if (!CONTROLE) return;
    st.telaDaTv = typeof m?.tela === 'string' ? m.tela : null;
    st.tvRespondeu = Date.now();
    atualizar();
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

const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
let eraMinha = null; // as máquinas da minha vez (null: ainda não sei, a primeira notícia não avisa)
function aplicarLan(e) {
  st.lan = e?.ligada ? e : null;
  if (typeof e?.agora === 'number') st.lanDif = e.agora - Date.now();
  // acabou a vez (ou alguém alugou a máquina livre): sai do modo jogo
  if (st.jogando) {
    const sh = st.alvo?.sh;
    if (!sh || !podeJogar(sh)) {
      esquecerJogo();
      desligarJogo();
      aviso('Seu tempo acabou. Para continuar, alugue mais pelo celular (QR code).', 'alerta', 9000);
    }
  }
  const agora = new Set(minhaVez());
  for (const m of agora) {
    if (!eraMinha || eraMinha.has(m)) continue;
    st.escolhida = null; // começou a minha vez: a TV vai para a máquina alugada
    const v = st.lan[m];
    if (!CONTROLE) aviso(v.preparando ? `Seu horário no ${NOME_MAQ[m]} começa às ${hora(v.inicio)}.` : `Seu horário no ${NOME_MAQ[m]} começou: você joga até ${hora(v.fim)}. Bom jogo!`, 'info', 8000);
  }
  eraMinha = agora;
  atualizar();
}

// Jogando, a barra de cima some: o fim do horário avisa por cima da imagem (5 min e 1 min antes; no teste grátis,
// 30 s antes) e a contagem fica no canto nos últimos 5 minutos
const avisouFim = new Set();
function vigiarTempo() {
  const el = $('#tempo-jogo');
  const m = st.jogando && st.lan && st.alvo ? maquinaDaTela(st.alvo.sh) : null;
  const paga = m && idsDaVez(m).includes(st.selfId) && !st.lan[m].preparando;
  const fim = m ? (paga ? st.lan[m].fim : st.lan.teste?.[st.selfId]) : null;
  const s = fim ? Math.round((fim - Date.now() - st.lanDif) / 1000) : 0;
  el.hidden = !(fim && s > 0 && s <= 300);
  if (el.hidden) return;
  el.textContent = `${paga ? `Seu horário no ${NOME_MAQ[m]}` : 'Teste grátis'} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const limite = (paga ? [60, 300] : [30]).find((x) => s <= x);
  const chave = `${m}|${fim}|${limite}`;
  if (!limite || avisouFim.has(chave)) return;
  avisouFim.add(chave);
  aviso(paga ? `Falta${limite === 60 ? ' 1 minuto' : 'm 5 minutos'} do seu horário no ${NOME_MAQ[m]}. Para continuar, alugue mais pelo celular.`
    : 'Faltam 30 segundos do teste grátis. Para continuar, alugue pelo celular.', 'alerta', 8000);
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
  vigiarTempo();
}
setInterval(() => {
  atualizarTempo();
  tentarVoltar();
  // nada pausa o telão de propósito: parado (o sistema da TV, o autoplay), volta a tocar
  if (!CONTROLE && video.srcObject && video.paused && document.visibilityState === 'visible') tocar();
}, 1000);

// o QR some no horário pago de quem está na TV (aí ninguém troca a conta dela)
function atualizarQr() {
  const temCodigo = !!$('#qr-img').getAttribute('src');
  $('#qr').hidden = CONTROLE || !temCodigo || minhaVez().length > 0;
  $('#qr-titulo').textContent = conta ? 'Alugar mais ou trocar de conta' : 'Alugue pelo celular';
}

// ------------------------------------------------------------------ a tela do telão
function telasNoAr() {
  const telas = [];
  for (const u of st.users.values()) {
    if (u.id === st.selfId) continue;
    for (const sh of u.shares.values()) telas.push({ u, sh });
  }
  return telas;
}
// Qual tela mostrar: jogando, a do jogo (trocar o telão da sala não tira ninguém do jogo); no celular-controle, a
// que a TV está jogando; a escolhida à mão; a do jogo que caiu há pouco; na minha vez, a da máquina que aluguei
// (PS5 ou PC); fora dela, a que está no telão da sala; sem telão, a primeira com o controle liberado.
function escolherAlvo() {
  const telas = telasNoAr();
  const doJogo = telas.find((x) => x.sh.key === (CONTROLE ? st.telaDaTv : st.jogando) && x.sh.controle);
  if (doJogo) return doJogo;
  const escolhida = telas.find((x) => x.sh.key === st.escolhida);
  if (escolhida) return escolhida;
  const v = CONTROLE ? null : voltaAoJogo();
  const antes = v && telas.find((x) => x.u.name === v.dono && maquinaDaTela(x.sh) === v.maquina);
  if (antes) return antes;
  for (const m of minhaVez()) {
    const t = telas.find((x) => maquinaDaTela(x.sh) === m && x.sh.controle) || telas.find((x) => maquinaDaTela(x.sh) === m);
    if (t) return t;
  }
  return telas.find((x) => x.sh.key === st.main) || telas.find((x) => x.sh.controle) || telas[0] || null;
}
// a outra máquina no ar (o PS5, se a TV está no PC), para o botão de trocar
function outraTela() {
  const m = st.alvo && maquinaDaTela(st.alvo.sh);
  const outras = m ? telasNoAr().filter((x) => maquinaDaTela(x.sh) !== m) : [];
  return outras.find((x) => x.sh.controle) || outras[0] || null;
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
  tentarVoltar();
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
    $('#vazio').querySelector('b').textContent = !st.entrou ? 'Conectando à sala…' : a ? 'Carregando a imagem…' : 'Nada no telão agora';
    $('#vazio-txt').textContent = !st.entrou ? 'Só um instante.' : a ? `${a.u.name} · ${NOME_MAQ[maquinaDaTela(a.sh)]}` : 'Quando o PC ou o PS5 entrar na sala, a imagem aparece aqui.';
  }
}

// TV costuma deixar tocar com som; se não deixar, começa mudo e o OK liga
let vezDeTocar = 0;
function tocar() {
  const vez = ++vezDeTocar;
  video.muted = false;
  video.play().then(() => {
    $('#btn-som').hidden = true;
    if ($('#aviso').textContent.startsWith('Sem som')) $('#aviso').hidden = true;
  }).catch((err) => {
    if (vez !== vezDeTocar || err?.name !== 'NotAllowedError') return; // outra imagem entrou no lugar
    video.muted = true;
    video.play().catch(() => {});
    $('#btn-som').hidden = false;
  });
}
// Só depois de um gesto (tecla do controle remoto, toque): sem ele, tirar o mudo fazia o Chrome pausar o vídeo e a
// imagem congelava. Um botão do controle de videogame e o pedido do celular não contam como gesto.
function ligarSom() {
  if (!video.muted || !video.srcObject) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  tocar();
}

// Quanto cada um precisa mandar: a tela do alvo no máximo (fora do jogo, o que esta TV aguenta: nivelAssistir), o
// resto nada (na TV, nem a voz das pessoas toca). O celular-controle não vê imagem nenhuma.
function enviarInteresse(forcar = false) {
  if (!rtc || !st.selfId) return;
  for (const u of st.users.values()) {
    if (u.id === st.selfId || !u.shares.size || !rtc.peers.has(u.id)) continue;
    const mapa = {};
    for (const sh of u.shares.values()) mapa[sh.key] = CONTROLE || sh.key !== st.alvo?.sh.key ? 'off' : st.jogando ? 'max' : nivelAssistir;
    const json = JSON.stringify(mapa);
    if (!forcar && st.interesse.get(u.id) === json) continue;
    st.interesse.set(u.id, json);
    rtc.enviarInteresse(u.id, mapa);
  }
}
let ultimoCompleto = 0;
let interesseDesde = 0; // ao entrar, um pedido pode se perder com a conexão nascendo: repete mais nos 20 s
setInterval(() => {
  const agora = Date.now();
  if (!st.entrou) return void (interesseDesde = 0);
  interesseDesde ||= agora;
  const completo = agora - ultimoCompleto > (agora - interesseDesde < 20_000 ? 1500 : 8000);
  if (completo) ultimoCompleto = agora;
  enviarInteresse(completo);
}, INTERESSE_MS);

function atualizar() {
  const antes = st.alvo?.sh.key;
  st.alvo = escolherAlvo();
  // a tela em que estava jogando saiu do ar (ou travaram o controle): sai do modo jogo e volta sozinha se ela voltar
  if (st.jogando && (st.alvo?.sh.key !== st.jogando || !st.alvo.sh.controle)) {
    caiuDoJogo('a tela do jogo saiu do ar');
    aviso('A tela do jogo saiu do ar. Se ela voltar, você volta ao jogo sozinho.', 'alerta', 8000);
  }
  if (antes !== st.alvo?.sh.key) enviarInteresse(true);
  mostrarVideo();
  atualizarQr();
  atualizarTempo();
  atualizarBotao();
  atualizarCelular();
  tentarVoltar();
}

// ------------------------------------------------------------------ voltar ao jogo depois de uma queda
function lembrarJogo() {
  if (!st.jogando || !st.jogo) return;
  const { dono, maquina, voltas, desde } = st.jogo;
  try { sessionStorage.setItem(VOLTAR_CHAVE, JSON.stringify({ dono, maquina, voltas: performance.now() - desde > 60_000 ? 0 : voltas, em: Date.now() })); } catch { /* sem storage */ }
}
function esquecerJogo() {
  try { sessionStorage.removeItem(VOLTAR_CHAVE); } catch { /* sem storage */ }
}
function voltaAoJogo() {
  try {
    const v = JSON.parse(sessionStorage.getItem(VOLTAR_CHAVE) || 'null');
    return v && Date.now() - v.em < VOLTAR_MS ? v : null;
  } catch {
    return null;
  }
}
function caiuDoJogo(motivo) {
  lembrarJogo();
  desligarJogo(false, motivo);
}
// A tela em que se jogava voltou (o PS5 saiu e entrou, a conexão piscou, a página recarregou num deploy): a TV entra
// no jogo de novo, sem ninguém apertar nada. Se é a página que recarrega no jogo (a TV que trava), não insiste: três
// vezes seguidas sem 1 min de jogo, e só pelo botão.
let jaJogou = false; // nesta página
function tentarVoltar() {
  if (CONTROLE || st.jogando || !st.entrou || !st.alvo) return;
  const v = voltaAoJogo();
  if (!v) return;
  const voltas = (v.voltas || 0) + (jaJogou ? 0 : 1);
  if (voltas > VOLTAR_MAX) return;
  const { u, sh } = st.alvo;
  if (u.name !== v.dono || maquinaDaTela(sh) !== v.maquina || !sh.controle || !podeJogar(sh) || !vivo(u.streams.get(sh.streamId))) return;
  if (!ligarJogo({ voltas })) return;
  evento('a tela voltou: de volta ao jogo sozinha', { foraS: Math.round((Date.now() - v.em) / 100) / 10 });
  if (!video.muted) aviso('De volta ao jogo.', 'info', 4000); // muda, o aviso do som vale mais
}
addEventListener('pagehide', lembrarJogo);

// ------------------------------------------------------------------ comandos para o jogo
function mandar(key, ev) {
  const dono = String(key).split('~')[0];
  if (rtc.mandarControle(dono, { c: { key, ev } })) return;
  socket.emit('controle', { key, ev });
}

// a chave em que os botões vão agora: na TV, a do modo jogo; no celular, a do alvo (se pode jogar)
function chaveDoPad() {
  if (!CONTROLE) return st.jogando;
  // a TV acabou de ser chamada: espera ela dizer em que tela está (sem resposta em 1,5 s, vale a do telão)
  if (st.tvRespondeu < st.chamouTv && Date.now() - st.chamouTv < 1500) return null;
  const sh = st.alvo?.sh;
  return sh?.controle && podeJogar(sh) ? sh.key : null;
}
// conta ao celular-controle desta conta em que tela a TV está jogando (null: fora do jogo)
function avisarTela() {
  if (!CONTROLE && conta) socket?.emit('tv-tela', { tela: st.jogando });
}

// voltas: quantas vezes seguidas a página recarregou no meio do jogo e a TV entrou sozinha (tentarVoltar; null: foi
// a pessoa que entrou). Devolve se entrou.
function ligarJogo({ voltas = null } = {}) {
  ligarSom();
  const a = st.alvo;
  const nao = (texto, ms) => {
    aviso(texto, 'alerta', ms);
    return false;
  };
  if (!a) return nao('Nada no telão para jogar agora.');
  if (!a.sh.controle) return nao(`O controle do ${NOME_MAQ[maquinaDaTela(a.sh)]} não está liberado agora.`);
  if (!podeJogar(a.sh)) {
    return nao(conta
      ? `Você não tem horário no ${NOME_MAQ[maquinaDaTela(a.sh)]} agora. Alugue pelo celular: aponte a câmera para o QR code.`
      : 'Para jogar, alugue pelo celular: aponte a câmera para o QR code.', 9000);
  }
  esquecerJogo();
  jaJogou = true;
  st.jogando = a.sh.key;
  st.jogo = { dono: a.u.name, maquina: maquinaDaTela(a.sh), voltas: voltas || 0, desde: performance.now() };
  document.body.classList.add('jogando');
  document.activeElement?.blur?.();
  altura = alturaLembrada(); // antes do mandarModo: é ele que leva a altura
  alturaEm = performance.now();
  mandarModo();
  enviarInteresse();
  avisarTela();
  enviado = null; // o estado do controle vai inteiro de novo
  comecarRelatorio(a);
  zerarFila();
  culpas = {};
  decSeguidas = 0;
  paradaSeguidas = 0;
  paradaRefeitas = 0;
  la = null;
  sonda.ligada = true;
  if (altura) evento('esta TV já não deu conta de mais linhas: começa na altura que aguentou', { linhas: altura });
  if (video.srcObject) evento('buffer do vídeo normal', { feitos: rtc.baixaLatencia(video.srcObject, true, BUFFER_MS) });
  if (turboPronto && !turboFalhou) turboPronto.then(() => ligarForma(proximaForma(-1)));
  mostrarSelo(10_000);
  const dica = $('#dica-jogo');
  dica.classList.remove('some');
  setTimeout(() => dica.classList.add('some'), 5000);
  if (video.muted && video.srcObject) aviso('Sem som ainda: aperte OK no controle remoto da TV.', 'info', 6000);
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* TV sem tela cheia */ }
  // o Voltar do controle remoto sai do jogo, não do site. Um passo só: o do jogo anterior, se não foi gasto, serve
  if (!history.state?.jogo) history.pushState({ jogo: true }, '');
  acertarTrava();
  prepararTremor();
  return true;
}

// "Menos atraso" (o mesmo do site, rtc.rapidoJogo lá no PC): a tela vem em 720p fixo com no máximo
// 8 Mbps — quadros menores codificam, viajam e chegam mais por igual, e a fila da TV (a maior parte do
// atraso medido: 90–250 ms nos testes de 2026-11-23) fica menor. Ligado de fábrica na TV; um botão
// colorido do controle remoto troca para 1080p (fica guardado nesta TV).
// A altura que esta TV aguenta (null: a do "Menos atraso" ou 1080p). Desce sozinha (vigiarDecodificacao)
// 1024×576 e 768×432: 16:9 em blocos inteiros de 16, sem sobra para o decodificador da TV cortar
const ALTURAS_TV = [576, 432];
let altura = null;
let alturaEm = 0;
// A altura em que esta TV parou fica guardada por uns dias: o próximo jogo já começa nela, sem passar de novo pelos
// segundos de imagem travando até descer. O botão colorido esquece. Fora do jogo, a TV assim assiste em 540p.
const ALTURA_CHAVE = 'sala3d-tv-altura';
const ALTURA_VALE_MS = 3 * 86400_000;
function alturaLembrada() {
  const v = lerJSON(ALTURA_CHAVE, null);
  return v && ALTURAS_TV.includes(v.h) && Date.now() - v.em < ALTURA_VALE_MS ? v.h : null;
}
function lembrarAltura(h) {
  try {
    if (h) localStorage.setItem(ALTURA_CHAVE, JSON.stringify({ h, em: Date.now() }));
    else localStorage.removeItem(ALTURA_CHAVE);
  } catch { /* sem armazenamento */ }
}
let nivelAssistir = { 576: 'medio', 432: 'baixo' }[alturaLembrada()] || 'max'; // fora do jogo: um nível do rtc.js (NIVEIS)
const RAPIDO_CHAVE = 'sala3d-tv-rapido';
let rapido = true;
try { rapido = localStorage.getItem(RAPIDO_CHAVE) !== '0'; } catch { /* sem armazenamento */ }
function mandarModo() {
  if (st.jogando) mandar(st.jogando, { t: 'modo', jogo: true, rapido, vibra: !!gamepad()?.vibrationActuator, ds: false, ...(altura ? { alt: altura } : {}) });
}
function trocarRapido() {
  rapido = !rapido;
  altura = null; // escolheu à mão: recomeça do tamanho dela
  alturaEm = performance.now();
  lembrarAltura(null);
  nivelAssistir = 'max';
  try { localStorage.setItem(RAPIDO_CHAVE, rapido ? '1' : '0'); } catch { /* sem armazenamento */ }
  mandarModo();
  enviarInteresse();
  evento(rapido ? 'menos atraso ligado (720p)' : 'menos atraso desligado (1080p)');
  aviso(rapido ? 'Menos atraso: 720p (botão colorido volta ao 1080p)' : 'Imagem em 1080p (botão colorido: menos atraso)', 'info', 4000);
  seloSempre = true;
}

function desligarJogo(avisarLa = true, motivo = 'saiu do jogo') {
  const key = st.jogando;
  if (!key) return;
  if (avisarLa) {
    mandar(key, { t: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
    mandar(key, { t: 'modo', jogo: false });
  }
  st.jogando = null;
  st.jogo = null;
  sonda.ligada = false;
  formaAtual = null;
  turbo?.desligar();
  tremor?.pararTremor();
  document.body.classList.remove('jogando');
  if (video.srcObject) rtc.baixaLatencia(video.srcObject, false);
  enviarInteresse();
  avisarTela();
  vigiarTempo();
  acertarTrava();
  focar($('#btn-jogo'));
  mandarRelatorio(motivo);
}
// a pessoa saiu (Voltar, Select + Start): não volta ao jogo sozinha
function sairDoJogo() {
  esquecerJogo();
  desligarJogo();
}

// ------------------------------------------------------------------ Turbo e a medida da imagem
// Um buffer pequeno no vídeo normal: com 0, cada pacote atrasado no Wi-Fi da TV virava quadro perdido e
// pedido de quadro-chave (o PC gasta a banda no quadro-chave e a imagem embaça)
const BUFFER_MS = 40;
let turboFalhou = null; // o motivo: nesta página a TV fica no vídeo normal
// TV sem Turbo de fábrica (teste de 2026-11-23 02:23, LG webOS): a placa dela não decodifica para o
// WebCodecs em nenhuma forma (6 formas, 4 níveis de H.264 cada) e o processador dá 5–13 qps; o vídeo
// normal, com a mesma placa, decodifica em ~0,1 ms a 50–60 qps. Enquanto tenta, o PC ainda segura o
// vídeo normal no mínimo (o Turbo o substitui). ?turbo=testar liga as tentativas para uma TV nova.
const PARAM_TURBO = params.get('turbo');
const TURBO_NA_TV = !CONTROLE && (PARAM_TURBO === 'testar' || PARAM_TURBO === '1');
let turbo = null; // só com ?turbo=: o turbo.js é o maior arquivo da página, e a TV não o usa de fábrica
const turboPronto = TURBO_NA_TV && import('./turbo.js').then(({ TurboRecebe }) => {
  turbo = new TurboRecebe({
    // canais confiáveis na TV (ver rtc.abrirTurbo): sem o prazo; o PC já pula quadros quando a fila do canal enche
    abrir: (id) => rtc?.abrirTurbo(id, null),
    abrirSom: (id) => rtc?.abrirTurboSom(id, true),
    somDaTela: () => video,
    volume: () => 1,
    onEvento: (texto, dados) => evento(texto, dados),
    onFalhou: (motivo) => formaFalhou(motivo),
  });
  // TV nunca pede H.265: a LG disse que decodificava e recusou nas três acelerações (2026-11-22 e 2026-11-23)
  turbo.semHevc = true;
  // O PC leva 3–4 s para começar a mandar (mede a rede e escolhe repassar o PS5 ou codificar): com a desistência de
  // fábrica (4 s), a TV largava o Turbo um instante antes do primeiro quadro (teste de 2026-11-23 00:34 e 00:44)
  turbo.semImagemMs = 12_000;
}).catch((err) => { turboFalhou = `não carregou: ${err?.message || err}`; });

// ---- As formas do Turbo na TV, tentadas em ordem até uma mostrar imagem. Em um teste só sai a resposta
// de como o Turbo roda nesta TV: a que funcionou fica guardada (FORMA_CHAVE) e é a primeira da próxima vez;
// todas as tentativas, com o que chegou e o que o decodificador fez, vão no relatório (turboTentativas).
// Sempre H.264. ?turbo=testar esquece a guardada e testa tudo de novo.
const TODOS_H264 = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];
const BASELINE = ['avc1.42e033', 'avc1.42001f'];
// Na placa da TV primeiro, com o nível do H.264 que veio e com níveis menores no codec (a LG recusou o
// nível 5.0 do PS5 na placa e caiu no processador: ~10 qps, 2026-11-23 02:16); por último sem preferência
const PLACA_OU_NAO = ['prefer-hardware', 'prefer-hardware@2a', 'prefer-hardware@28', 'prefer-hardware@1f', 'no-preference'];
const FORMAS = [
  // o PS5 repassado (se a rede levar) ou codificado no PC, o perfil que o PC escolher
  { id: 'normal-1080', altura: 1080, codecs: TODOS_H264, recodificar: false, aceleracoes: PLACA_OU_NAO },
  // codificado no PC, um perfil de cada vez (a TV pode aceitar um e recusar outro)
  { id: 'pc-1080-high', altura: 1080, codecs: ['avc1.640033'], recodificar: true, aceleracoes: PLACA_OU_NAO },
  { id: 'pc-1080-main', altura: 1080, codecs: ['avc1.4d0033'], recodificar: true, aceleracoes: PLACA_OU_NAO },
  { id: 'pc-1080-baseline', altura: 1080, codecs: BASELINE, recodificar: true, aceleracoes: PLACA_OU_NAO },
  { id: 'pc-720-baseline', altura: 720, codecs: BASELINE, recodificar: true, aceleracoes: PLACA_OU_NAO },
  // decodificador no processador da TV: menor, para dar conta
  { id: 'pc-720-processador', altura: 720, codecs: TODOS_H264, recodificar: true, aceleracoes: ['prefer-software'] },
];
const FORMA_CHAVE = 'sala3d-tv-turbo';
const FORMA_OK_MS = 10_000; // imagem pelo Turbo por tanto tempo seguido: esta forma funciona…
const FORMA_QPS_MIN = 40; // …e na média com pelo menos isto: abaixo, a TV não dá conta e vai a próxima forma
let formaGuardada = null;
try {
  if (PARAM_TURBO === 'testar') localStorage.removeItem(FORMA_CHAVE);
  formaGuardada = localStorage.getItem(FORMA_CHAVE);
} catch { /* sem armazenamento */ }
let formaAtual = null; // { forma, indice, desde, qpsDesde }
let formasTentadas = []; // nesta página
let formaOk = null;
let melhorLenta = null; // a forma lenta com mais qps (só para o relatório)

// a ordem: a guardada primeiro, depois as outras na ordem de FORMAS
function ordemDasFormas() {
  const g = FORMAS.find((f) => f.id === formaGuardada);
  return g ? [g, ...FORMAS.filter((f) => f !== g)] : FORMAS;
}
function proximaForma(depoisDe) {
  const ordem = ordemDasFormas();
  return ordem[depoisDe + 1] ? { forma: ordem[depoisDe + 1], indice: depoisDe + 1 } : null;
}
function ligarForma(prox) {
  if (!prox || !st.jogando || !turbo) return;
  const { forma, indice } = prox;
  turbo.codecsForcados = forma.codecs;
  turbo.recodificar = forma.recodificar;
  turbo.aceleracoes = forma.aceleracoes;
  turbo.ultimaFalha = null;
  errosTurbo.length = 0;
  formaAtual = { forma, indice, desde: performance.now(), qpsDesde: 0 };
  evento(`turbo: tentando a forma ${forma.id} (${indice + 1} de ${FORMAS.length})`, { forma });
  turbo.ligar(st.jogando, video, forma.altura);
}
function registrarTentativa(resultado, extra = {}) {
  const f = formaAtual;
  if (!f) return;
  const t = { forma: f.forma.id, resultado, ms: Math.round(performance.now() - f.desde), ...extra };
  formasTentadas.push(t);
  if (rel) (rel.turboTentativas ||= []).push(t);
}
function formaFalhou(motivo) {
  const f = formaAtual;
  const diag = turbo.ultimaFalha;
  registrarTentativa(diag?.desenhados ? `mostrou e caiu: ${motivo}` : `falhou: ${motivo}`, { diag, erros: errosTurbo.slice(-5) });
  evento(`turbo: forma ${f?.forma.id} falhou (${motivo})`, { diag, erros: errosTurbo.slice(-5) });
  formaAtual = null;
  // a forma que funcionou caiu depois (a rede, não a TV): o vídeo normal segue, a forma continua guardada
  if (formaOk && f?.forma.id === formaOk) return pararTurbo(motivo);
  // não é a forma: sem controle liberado, sem tela, conexão fechada
  if (['sem-controle', 'sem-tela', 'conexao'].includes(motivo)) return pararTurbo(motivo);
  const prox = f && st.jogando ? proximaForma(f.indice) : null;
  if (!prox) {
    evento('turbo: nenhuma forma mostrou imagem nesta TV', { tentativas: formasTentadas });
    return pararTurbo('nenhuma forma');
  }
  ligarForma(prox);
}
function pararTurbo(motivo) {
  turboFalhou = motivo;
  evento('turbo falhou: vídeo normal', { motivo });
  if (st.jogando && video.srcObject) evento('buffer do vídeo normal', { feitos: rtc.baixaLatencia(video.srcObject, true, BUFFER_MS) });
}
// a forma que deu imagem por FORMA_OK_MS seguidos fica guardada
function vigiarForma(t) {
  const f = formaAtual;
  if (!f || formaOk === f.forma.id) return;
  if (!(t && t.qps > 0)) { f.qpsDesde = 0; f.qpss = []; return; }
  f.qpsDesde ||= performance.now();
  (f.qpss ||= []).push(t.qps);
  if (performance.now() - f.qpsDesde < FORMA_OK_MS) return;
  // a média sem a 1ª amostra (o começo, com o quadro-chave e o decodificador ligando)
  const conta = f.qpss.slice(1);
  const media = conta.reduce((a, b) => a + b, 0) / (conta.length || 1);
  if (media < FORMA_QPS_MIN) {
    const dados = { qpsMedia: Math.round(media * 10) / 10, kbps: t.kbps, decMs: t.decMs, filaDec: t.filaDec, decAtrasou: t.decAtrasou, aceleracao: t.aceleracao, codecLa: t.codecLa, largura: t.largura, altura: t.altura };
    turbo.desligar();
    registrarTentativa('lenta na TV', dados);
    evento(`turbo: forma ${f.forma.id} mostrou imagem mas lenta (${dados.qpsMedia} qps)`, dados);
    formaAtual = null;
    melhorLenta = !melhorLenta || dados.qpsMedia > melhorLenta.qpsMedia ? { ...dados, id: f.forma.id } : melhorLenta;
    const prox = st.jogando ? proximaForma(f.indice) : null;
    if (prox) return ligarForma(prox);
    evento('turbo: nenhuma forma rápida o bastante nesta TV — vídeo normal', { melhorLenta, tentativas: formasTentadas });
    return pararTurbo('lenta na TV');
  }
  formaOk = f.forma.id;
  try { localStorage.setItem(FORMA_CHAVE, formaOk); } catch { /* sem armazenamento */ }
  registrarTentativa('funcionou', { qpsMedia: Math.round(media * 10) / 10, aceleracao: t.aceleracao, codecLa: t.codecLa, decAtrasou: t.decAtrasou, qps: t.qps, kbps: t.kbps, decMs: t.decMs, largura: t.largura, altura: t.altura, codec: t.codec });
  evento(`turbo: a forma ${formaOk} funciona nesta TV (guardada)`, { qps: t.qps, kbps: t.kbps, decMs: t.decMs, codec: t.codec, largura: t.largura, altura: t.altura });
}
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
  const agora = { bytes: inb.bytesReceived, t: inb.timestamp, buf: inb.jitterBufferDelay || 0, saidos: inb.jitterBufferEmittedCount || 0, dec: inb.totalDecodeTime || 0, decodificados: inb.framesDecoded || 0, descartados: inb.framesDropped ?? null };
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
    jogados: antes?.descartados != null && agora.descartados != null ? Math.max(0, agora.descartados - antes.descartados) : 0, // desde a medida anterior
    congelou: inb.freezeCount ?? null,
    pli: inb.pliCount ?? null,
    nack: inb.nackCount ?? null,
    bufferMs: saidos > 0 ? Math.round(((agora.buf - antes.buf) / saidos) * 1000) : null,
    decMs: decs > 0 ? Math.round(((agora.dec - antes.dec) / decs) * 10000) / 10 : null,
  };
}

let seloAte = 0;
let seloSempre = true; // o desempenho fica na tela o jogo todo (teste das formas do Turbo); Info/cores escondem
function mostrarSelo(ms) {
  seloAte = performance.now() + ms;
}
setInterval(async () => {
  if (CONTROLE) return;
  if (!st.jogando) {
    $('#selo').hidden = true;
    return vigiarAssistindo();
  }
  const t = turbo?.ligado ? turbo.stats() : null;
  const v = await medirVideo();
  if (!st.jogando) return; // saiu do jogo enquanto media
  const rtts = [...ping.rtt].sort((x, y) => x - y);
  const controle = { rttMs: rtts.length ? Math.round(rtts[rtts.length >> 1]) : null, ajudanteMs: ping.aj, pad: !!gamepad() };
  ping.rtt.length = 0;
  if (rel && rel.amostras.length < 1800) rel.amostras.push({ t: Date.now(), rapido, turbo: t, video: v, controle });
  const semTurbo = !(t && t.qps > 0);
  const jogados = v?.jogados || 0;
  let parou = false;
  if (semTurbo) {
    parou = vigiarParada(v, jogados);
    vigiarDecodificacao(v);
    vigiarFila(v);
  }
  const deLa = la && Date.now() - la.recebido < 6000 ? la : null;
  const so = sonda.tirar();
  // os 2 primeiros (4 s) são o jogo entrando
  const culpa = (rel?.amostras.length ?? 0) <= 2 ? null
    : culpaDe({ turbo: semTurbo ? null : t, fpsFinal: v?.qps ?? null, decMs: v?.decMs ?? null, bufferMs: v?.bufferMs ?? null, ritmo: semTurbo ? null : t.ritmo, sonda: so, parou }, deLa, 'a TV');
  contarCulpa(culpas, culpa);
  const ultima = rel?.amostras.at(-1);
  if (ultima) Object.assign(ultima, { culpa, sonda: so, altura, visivel: document.visibilityState === 'visible', la: deLa && { captura: deLa.captura, enviado: deLa.enviado, sonda: deLa.sonda ?? null, roteador: deLa.roteador ?? null } });
  vigiarForma(t);
  if (rel && !rel.enviado && rel.amostras.length === 45) mandarRelatorio('90 s de jogo', true); // a TV pode desligar sem sair
  const usado = t && t.qps > 0 ? { ...t, via: 'Turbo' } : v ? { ...v, via: 'vídeo' } : null;
  const el = $('#selo');
  el.hidden = !(seloSempre || performance.now() < seloAte);
  if (!usado) el.textContent = `medindo…${formaAtual ? ` · testando ${formaAtual.forma.id} (${formaAtual.indice + 1}/${FORMAS.length})` : ''}`;
  if (usado) {
    const mbps = usado.kbps != null ? `${(usado.kbps / 1000).toFixed(1)} Mbps` : '–';
    const res = usado.largura ? `${usado.largura}×${usado.altura}` : '–';
    const codec = usado.codec ? String(usado.codec).toUpperCase().replace('H265', 'H.265').replace('H264', 'H.264') : '';
    // atraso que dá para medir aqui: a espera na fila do vídeo (ou o liso do Turbo) e o caminho do controle
    const espera = usado.via === 'vídeo' && usado.bufferMs != null ? ` · fila ${usado.bufferMs} ms` : usado.pontaMs != null ? ` · imagem ${Math.round(usado.pontaMs)} ms` : '';
    const ctrl = controle.rttMs != null ? ` · controle ${Math.round(controle.rttMs / 2)} ms` : '';
    el.textContent = `${altura ? `${altura}p` : rapido ? 'menos atraso' : '1080p'} · ${usado.via} · ${res} · ${Math.round(usado.qps || 0)} qps · ${mbps}${codec ? ` · ${codec}` : ''}${espera}${ctrl}${turboFalhou ? ` · turbo: ${turboFalhou}` : formaAtual && formaOk !== formaAtual.forma.id ? ` · testando ${formaAtual.forma.id} (${formaAtual.indice + 1}/${FORMAS.length})` : ''}`;
  }
  el.textContent += `\n${linhaDaCulpa(culpa, culpas)}`;
}, 2000);

// Fila que não para de crescer no vídeo normal (teste de 2026-11-23 00:34 e 00:42): no meio do jogo o
// decodificador da TV passou da placa para o processador (de 0,2 ms para ~19 ms por quadro, acima dos 16 ms
// de um quadro a 60 qps) e a fila chegou a 5 s. Refazer a conexão cria um decodificador novo, na placa.
// O rtc.refazer já espera 20 s, 40 s, 80 s… entre uma vez e outra.
// A decodificação lenta só conta se a TV já decodificou rápido neste jogo (a placa que caiu para o
// processador): na "4K SMART TV PH" (Android, 2026-11-23 11:30) ela é sempre 27–195 ms, e refazer a cada
// 20–60 s só travava a imagem e recomeçava em 360p. Nos primeiros 10 s a fila ainda é a de antes do jogo,
// e se duas vezes não resolveram, a terceira também não.
const FILA_REFAZ_MAX = 2;
// De quem é a culpa (culpa.js): o que o PC que transmite contou (la, 'jogo-envio'), a sonda daqui e a medida
const sonda = new Sonda();
let la = null;
let culpas = {};
let paradaSeguidas = 0;
let decSeguidas = 0;
let paradaRefeitas = 0;
// A TV joga fora todos os quadros e não mostra nenhum (a Philips, 2026-11-23 11:53:58 até o fim): 4 s assim e a
// conexão é refeita (um decodificador novo), no máximo 2 vezes por jogo
function vigiarParada(v, jogados) {
  const a = st.alvo;
  const parou = !!v && !(v.qps > 0) && jogados > 30 && document.visibilityState === 'visible';
  paradaSeguidas = parou ? paradaSeguidas + 1 : 0;
  if (paradaSeguidas < 2 || !a) return parou;
  if (paradaRefeitas < 2 && rtc.refazer(a.u.id, 'a TV parou de mostrar a imagem')) {
    paradaRefeitas++;
    paradaSeguidas = 0;
    evento('a TV parou de mostrar a imagem: conexão refeita', { descartados: jogados });
  }
  return true;
}
// A TV não dá conta de decodificar (demora, e o sintoma: fila, quadros jogados fora ou poucos na tela): pede menos
// linhas. 6 s seguidos, com 8 s de acerto depois de cada troca. Só desce; o botão colorido recomeça.
const naoDaConta = (v) => !!v && (v.decMs ?? 0) > 14 && ((v.bufferMs ?? 0) > 250 || v.jogados > 20 || (v.qps > 0 && v.qps < 45));
function vigiarDecodificacao(v) {
  decSeguidas = naoDaConta(v) ? decSeguidas + 1 : 0;
  if (decSeguidas < 3 || performance.now() - alturaEm < 8000) return;
  const nova = ALTURAS_TV.find((h) => !altura || h < altura);
  if (!nova) return;
  altura = nova;
  alturaEm = performance.now();
  decSeguidas = 0;
  lembrarAltura(altura);
  nivelAssistir = altura > 432 ? 'medio' : 'baixo';
  mandarModo();
  evento('a TV não dá conta de decodificar: menos linhas', { linhas: altura, decMs: v.decMs, bufferMs: v.bufferMs, qps: v.qps, jogados: v.jogados });
  aviso(`Esta TV não dá conta: imagem em ${altura}p (botão colorido tenta de novo)`, 'info', 6000);
}
// Fora do jogo é o telão inteiro (1080p): a TV que não dá conta pede 540p e, se ainda não der, 540p a 30 quadros
let assistirRuim = 0;
let assistirEm = 0;
async function vigiarAssistindo() {
  if (nivelAssistir === 'baixo' || !video.srcObject || document.visibilityState !== 'visible') return void (assistirRuim = 0);
  const v = await medirVideo();
  if (st.jogando) return void (assistirRuim = 0);
  assistirRuim = naoDaConta(v) ? assistirRuim + 1 : 0;
  if (assistirRuim < 3 || performance.now() - assistirEm < 8000) return;
  nivelAssistir = nivelAssistir === 'max' ? 'medio' : 'baixo';
  assistirRuim = 0;
  assistirEm = performance.now();
  console.info('[tv] a TV não dá conta do telão: pedindo', nivelAssistir, JSON.stringify({ decMs: v.decMs, bufferMs: v.bufferMs, qps: v.qps, jogados: v.jogados }));
  enviarInteresse();
}

let filaRuim = 0;
let filaRefeitas = 0;
let filaDesde = 0;
let decRapido = false; // já decodificou em até 6 ms neste jogo
function zerarFila() {
  filaRuim = 0;
  filaRefeitas = 0;
  filaDesde = performance.now();
  decRapido = false;
}
function vigiarFila(v) {
  const a = st.alvo;
  if (v?.decMs != null && v.decMs <= 6) decRapido = true;
  const lento = v && ((v.bufferMs ?? 0) > 600 || (decRapido && (v.decMs ?? 0) > 12));
  filaRuim = lento ? filaRuim + 1 : 0;
  if (filaRuim < 2 || !a) return; // 4 s seguidos
  if (filaRefeitas >= FILA_REFAZ_MAX || performance.now() - filaDesde < 10_000) return;
  filaRuim = 0;
  if (rtc.refazer(a.u.id, 'a fila do vídeo da TV não baixa') && ++filaRefeitas) evento('fila do vídeo alta: conexão refeita', { bufferMs: v.bufferMs, decMs: v.decMs, qps: v.qps });
}

function mandarRelatorio(motivo, parcial = false) {
  if (!rel || !rel.amostras.length) return;
  const r = { ...rel, fim: new Date().toISOString(), motivo };
  const qps = r.amostras.map((x) => x.turbo?.qps || x.video?.qps).filter((x) => x > 0);
  r.resumo = { mediaQps: qps.length ? qps.reduce((s, x) => s + x, 0) / qps.length : null, turbo: !!r.amostras.some((x) => x.turbo?.qps), turboFalhou, rapido, altura, culpas, turboForma: formaOk, turboGuardada: formaGuardada, turboTentativas: formasTentadas };
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
  // quem treme é o controle que está sendo usado: o da TV, ou o celular (o dele, ou o ligado nele)
  if (!ev || !key || key !== chaveDoPad()) return;
  if (ev.t === 'jogo-envio') la = { ...ev, recebido: Date.now() };
  else if (ev.t === 'tremor' && tremor && (!CONTROLE || toque.ativo || gamepad())) tremor.tremor(ev.g, ev.p, !!ev.h);
}
// A vibração do pad-virtual.js (a mesma da sala: renova enquanto o jogo manda, reforça os tremores fracos e sabe
// tremer o celular). Vem só quando há o que vibrar.
let tremor = null;
let pedindoTremor = false;
function prepararTremor() {
  if (tremor || pedindoTremor || !(CONTROLE || gamepad()?.vibrationActuator)) return;
  pedindoTremor = true;
  import('./pad-virtual.js').then(({ PadVirtual }) => {
    tremor = new PadVirtual({ controle: { mandar() {} } });
    tremor.key = 'tv'; // só vibra: os botões saem por lerControles
    tremor.gpIndice = gpIndice;
  }).catch(() => { pedindoTremor = false; });
}

// ------------------------------------------------------------------ a tela acesa
// Com um controle na mão ninguém toca na tela: sem a trava, o celular apagava (e o controle parava junto) e a TV
// podia entrar no descanso. Só enquanto joga; o navegador solta ao esconder a página, e ela volta ao mostrar.
let trava = null;
let pedindoTrava = false;
const querTrava = () => (CONTROLE ? toque.ativo || !!gamepad() : !!st.jogando);
async function acertarTrava() {
  if (!querTrava()) {
    trava?.release().catch(() => {});
    trava = null;
    return;
  }
  if (trava || pedindoTrava || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  pedindoTrava = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    l.addEventListener('release', () => { if (trava === l) trava = null; });
    if (querTrava()) trava = l;
    else l.release().catch(() => {}); // parou de jogar enquanto pedia
  } catch { /* sem trava (economia de energia, navegador antigo) */ } finally {
    pedindoTrava = false;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acertarTrava(); });
if (CONTROLE) document.addEventListener('pointerdown', acertarTrava); // iPhone: só com um toque

// ------------------------------------------------------------------ o controle (Gamepad API)
let gpIndice = null;
function gamepad() {
  const lista = [...(navigator.getGamepads?.() || [])].filter((g) => g?.connected);
  return lista.find((g) => g.index === gpIndice) || lista.find((g) => g.mapping === 'standard') || lista[0] || null;
}
addEventListener('gamepadconnected', (e) => {
  gpIndice = e.gamepad.index;
  if (tremor) tremor.gpIndice = gpIndice;
  if (CONTROLE && conta) chamarTv(true); // o controle ligado no celular: a TV entra no jogo
  aviso(`Controle ligado: ${nomeDoControle(e.gamepad)}`, 'info', 3500);
  mandarModo(); // quem compartilha fica sabendo que agora há o que vibrar
  prepararTremor();
  acertarTrava();
  atualizarBotao();
  atualizarCelular();
});
addEventListener('gamepaddisconnected', () => {
  gpIndice = null;
  mandarModo();
  acertarTrava();
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
  // 17: o clique do touchpad (o Chrome dá esse botão a mais no DualSense e no DualShock 4)
  g.buttons.forEach((bt, i) => {
    if (i <= 17 && (bt.pressed || bt.value > 0.5)) b |= 1 << i;
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
let leituraEm = 0;
function lerControles() {
  // fora do jogo, o controle só anda entre os botões da tela: 25 leituras por segundo bastam (a TV agradece)
  const agora = performance.now();
  if (!st.jogando && !toque.ativo && gpIndice == null && agora - leituraEm < 40) return;
  leituraEm = agora;
  const g = gamepad();
  if (g && gpIndice == null) gpIndice = g.index; // navegador que não avisou ('gamepadconnected')
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
      sairDoJogo();
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
// Info (457; I no teclado): mostra ou esconde o selo da imagem. Botões coloridos (Tizen/webOS 403–406; R no
// teclado): troca "Menos atraso" (720p) ↔ 1080p
const SELO = new Set([457]);
const CORES = new Set([403, 404, 405, 406]);
addEventListener('keydown', (e) => {
  if (CONTROLE) return;
  ligarSom();
  if (SELO.has(e.keyCode) || ['Info', 'i', 'I'].includes(e.key)) {
    e.preventDefault();
    seloSempre = !seloSempre;
    return;
  }
  if (CORES.has(e.keyCode) || ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'r', 'R'].includes(e.key)) {
    e.preventDefault();
    trocarRapido();
    return;
  }
  if (st.jogando) {
    if (ehVoltar(e)) {
      e.preventDefault();
      return sairDoJogo();
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
// a página saiu da frente com uma tecla apertada: o "soltou" não chega
addEventListener('blur', () => { remoto.b = 0; });
// Android TV: o Voltar vira "voltar na história" (o pushState do ligarJogo segura um passo)
addEventListener('popstate', () => {
  if (st.jogando) sairDoJogo();
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

$('#btn-jogo').addEventListener('click', () => ligarJogo());
$('#btn-som').addEventListener('click', ligarSom);
$('#btn-trocar').addEventListener('click', () => {
  const t = outraTela();
  if (!t) return;
  st.escolhida = t.sh.key;
  esquecerJogo();
  atualizar();
});
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
  const outra = outraTela();
  const trocar = $('#btn-trocar');
  if (outra) trocar.textContent = `Ver o ${NOME_MAQ[maquinaDaTela(outra.sh)]}`;
  if (!outra && document.activeElement === trocar) focar($('#btn-jogo')); // o foco não fica num botão que sumiu
  trocar.hidden = !outra;
  if (!document.activeElement || document.activeElement === document.body) focar($('#btn-jogo'));
}

// ------------------------------------------------------------------ o celular como controle (toque)
// Sem controle de verdade, o próprio celular vira um controle de PS5 na tela (toque-tv.js, deitado). Ao
// abrir, a TV desta conta entra no modo jogo sozinha ('tv-modo' pelo servidor); "Sair" tira.
const toque = { ativo: false, b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
let toqueTv = null;
const CHAMAR_MS = 4000; // sem resposta da TV por isto: ela não está aberta nesta conta
// pede à TV desta conta que entre no jogo (ou saia); ela responde em que tela está ('tv-tela')
function chamarTv(ligar) {
  st.chamouTv = ligar ? Date.now() : 0;
  socket?.emit('tv-modo', { ligar });
}
async function telaCheia() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* iPhone e navegadores sem tela cheia: o aviso "gire o celular" cobre */ }
}
async function ligarToque() {
  if (!toqueTv) return;
  toqueTv.mostrar();
  toque.ativo = true;
  enviado = null;
  chamarTv(true);
  atualizarToque();
  prepararTremor();
  acertarTrava();
  await telaCheia();
}
function desligarToque() {
  const key = chaveDoPad();
  toque.ativo = false;
  toqueTv.esconder();
  tremor?.pararTremor();
  if (key) mandar(key, { t: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
  chamarTv(false);
  lembrarToque();
  acertarTrava();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
// a página recarregou (um deploy, o navegador matou a aba) com o controle aberto: ele abre de novo sozinho
function lembrarToque() {
  if (!CONTROLE) return;
  try {
    if (toque.ativo) sessionStorage.setItem(TOQUE_ABERTO, String(Date.now()));
    else sessionStorage.removeItem(TOQUE_ABERTO);
  } catch { /* sem storage */ }
}
addEventListener('pagehide', lembrarToque);
function toqueEstavaAberto() {
  try { return Date.now() - Number(sessionStorage.getItem(TOQUE_ABERTO) || 0) < VOLTAR_MS; } catch { return false; }
}
// A TV está no jogo com este celular? null: ela ainda não respondeu
function tvNoJogo() {
  if (st.tvRespondeu >= st.chamouTv && st.chamouTv) return !!st.telaDaTv;
  return Date.now() - st.chamouTv < CHAMAR_MS ? null : false;
}
function atualizarToque() {
  if (!toque.ativo) return;
  const sh = st.alvo?.sh;
  const m = sh && maquinaDaTela(sh);
  const [txt, tipo] = !conta ? ['Sem conta', 'ruim']
    : !socket?.connected ? ['Reconectando…', 'espera']
      : !sh ? ['Nada no telão', 'espera']
        : !sh.controle ? ['Controle travado', 'ruim']
          : !podeJogar(sh) ? ['Sem horário agora', 'ruim']
            : tvNoJogo() === null ? ['Chamando a TV…', 'espera']
              : tvNoJogo() ? [`${NOME_MAQ[m]}${faltaDaVez(m)}`, 'ok']
                : [`${NOME_MAQ[m]} · TV fora do jogo`, 'espera'];
  toqueTv.status(txt, tipo, m !== 'pc');
}
// " · 12 min": quanto falta da vez paga nesta máquina
function faltaDaVez(m) {
  if (!st.lan || !idsDaVez(m).includes(st.selfId) || !st.lan[m]?.fim) return '';
  return ` · ${Math.ceil(Math.max(0, st.lan[m].fim - (Date.now() + st.lanDif)) / 60_000)} min`;
}
setInterval(atualizarToque, 1000);

if (CONTROLE) {
  import('./toque-tv.js').then(({ ToqueTv }) => {
    toqueTv = new ToqueTv({
      raiz: $('#toque'),
      estado: toque,
      aoMudar: () => { if (toque.ativo) lerControles(); }, // botão sai na hora, sem esperar a próxima leitura
      onSair: desligarToque,
      onTelaCheia: telaCheia,
      aviso,
    });
    if (conta && toqueEstavaAberto()) {
      ligarToque(); // a tela cheia só entra com um toque: o primeiro dedo a pede
      $('#toque').addEventListener('pointerup', telaCheia, { once: true });
    }
  }).catch((err) => {
    console.error('[tv] controle de toque', err);
    aviso('O controle da tela não abriu. Recarregue a página.', 'erro', 8000);
  });
  $('#btn-toque').addEventListener('click', ligarToque);
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
  else {
    const tv = tvNoJogo();
    el.innerHTML = `Os botões vão para o <b>${NOME_MAQ[maquinaDaTela(sh)]}</b>${g ? ' <span class="ok">· jogando</span>' : ''}.${
      !st.chamouTv || tv === null ? '' : tv ? ' A TV está no jogo.' : ' A TV não está no jogo: veja se ela está aberta nesta conta.'}`;
  }
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
