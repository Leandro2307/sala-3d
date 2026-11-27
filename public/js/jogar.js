// Modo jogo do PC (/jogar): a sala principal sem o mundo 3D — só a tela do PC ou do PS5 e o mesmo modo jogo
// da sala (os mesmos módulos: controle.js, turbo.js, teclado-pad.js, gamepad-jogo.js, ps5-touchpad.js,
// jogo-opcoes.js, jogo-diag.js). Nasceu dos testes de 2026-11-23: no mesmo notebook, PS5 no Turbo, a página
// leve deu ~44 ms de imagem e a sala ~89 (decodificador a 13 ms por quadro e o liso no teto de 45 ms).
// A sala continua a principal; esta página não muda nada nela.
//
// O que é igual à sala: teclado e mouse (mouse preso, menu automático), controle de videogame, DualSense
// pelo WebHID (gatilhos, vibração, touchpad), modo carro, legenda, mapear teclas, a tecla nos avisos do jogo, modos de imagem,
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
//   - sem o realce de nitidez (um shader por quadro na placa integrada) e só H.264. O realce pode ser ligado nas
//     Opções, mas não no modo Turbo da TV (PRESET_TV), em que a página sempre abre;
//   - os canais do Turbo sem prazo de entrega (?canal=prazo volta ao da sala, para comparar).
//
// Quedas: a conexão com o servidor que pisca entra de novo sem recarregar (reentrar; só um deploy recarrega), e a
// tela do jogo que saiu e voltou põe a pessoa no jogo sozinha, ainda em tela cheia (tentarVoltar). Segurar
// Create + Options por 2 s sai do modo jogo, como na TV.
import { RTC } from './rtc.js';
import { precisaOferecer, oferecerAluguel } from './oferta-aluguel.js';
import { Controle } from './controle.js';
import { TurboRecebe, TTL_MS, vidaDoCanal, LISO_PCT, LISO_MAX } from './turbo.js';
import { TurboAuto, TurboVolta, foraDoModo } from './turbo-auto.js';
import { TesteJoga, MemoriaTeste, codecsDaqui } from './turbo-teste.js';
import { PainelTeste, textoDoResultado } from './turbo-teste-painel.js';
import { DiagJogo } from './jogo-diag.js';
import { linhaDaCulpa } from './culpa.js';
import { opcoesJogo, LISO_MS, PRESETS, PRESET_TV, PRESET_INICIAL, ORDEM_AUTO, OPCOES_DO_PRESET, autoMostra, htmlPresets, marcarPresets, alturaDoMenu } from './jogo-opcoes.js';
import { LAYOUTS, layoutDoTitulo, ToqueJogo } from './toque-jogo.js';
import { ControleFisico } from './gamepad-jogo.js';
import { PadVirtual } from './pad-virtual.js';
import { TecladoPad } from './teclado-pad.js';
import { MapaTeclasPainel, mapaTeclas } from './mapa-teclas.js';
import { ModoCarroTela } from './modo-carro.js';
import { AvisosBotoes } from './avisos-botoes-tela.js';
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
const QUEDA_MS = 90_000; // a tela do jogo caiu: por este tempo a tela cheia espera por ela
const SAIR_SEGURANDO_MS = 2000; // Create + Options seguidos por isto: sai do modo jogo
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
const ajustes = { jogo: 100, voz: 100, nitidez: false, tratamento: false, dualsense: false, ...lerJSON(AJUSTES_CHAVE, {}) };
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
  visita: false, // na sala como "Visitante", antes do login (visitar)
  versao: null, // a do servidor na primeira entrada
  semVoz: false, // escritório com salas à prova de som: aqui não há posição, então ninguém é ouvido
  interesse: new Map(),
};
let socket = null;
let rtc = null;
let fundo = null; // o teste da conexão em segundo plano (diagnosticarFundo): { quem, key, promessa, naEntrada, desde }
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
// a imagem do PS5 atrás da entrada (a página da TV só com o vídeo): sai junto com a entrada, para não ficar
// recebendo imagem à toa
function fundoDaEntrada(ligar) {
  const f = $('#entrada-fundo');
  // com o teste da conexão rodando por trás, a imagem do fundo fica de fora: ela disputaria a mesma internet
  const url = ligar && !fundo ? '/tv?fundo=1' : 'about:blank';
  if ((f.getAttribute('src') || 'about:blank') !== url) f.src = url;
  f.hidden = !ligar;
}
function fecharEntrada() {
  $('#entrada').hidden = true;
  fundoDaEntrada(false);
}
function pedirEntrada({ conta: pedeConta = false, sala = false, erro = '' }) {
  $('#entrada').hidden = false;
  fundoDaEntrada(true);
  $('#en-nome-l').hidden = !pedeConta;
  // a senha só aparece quando o nome digitado é de uma conta que tem senha (o servidor responde precisaSenha)
  $('#en-senha-l').hidden = true;
  $('#en-sala-l').hidden = !sala;
  $('#en-texto').textContent = pedeConta
    ? 'Digite o seu nome para entrar.'
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
// trocou o nome: a senha era de outro nome, some de novo
formEntrada.elements.nome.addEventListener('input', () => {
  if ($('#en-senha-l').hidden) return;
  $('#en-senha-l').hidden = true;
  formEntrada.elements.senha.value = '';
  erroEntrada('');
});
formEntrada.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formEntrada.elements;
  const botao = formEntrada.querySelector('button');
  botao.disabled = true;
  erroEntrada('');
  try {
    if (!conta) {
      const nome = f.nome.value.trim().replace(/\s+/g, ' ');
      if (!nome) return erroEntrada('Digite o seu nome.');
      let r;
      try { r = await post('/lan/conta', { nome, senha: f.senha.value || undefined }); } catch { r = { ok: false, erro: 'Sem conexão. Tente de novo.' }; }
      if (!r.ok) {
        if (r.precisaSenha) {
          const mostrou = $('#en-senha-l').hidden;
          $('#en-senha-l').hidden = false;
          f.senha.focus();
          return erroEntrada(mostrou ? 'Esse nome tem senha. Digite a senha dele.' : r.erro || 'Senha errada.');
        }
        return erroEntrada(r.erro || 'Não deu para entrar.');
      }
      conta = { nome, token: r.token };
      gravarJSON(LAN_CHAVE, conta);
      f.senha.value = '';
    }
    if (!(await liberarSala(f.sala.value))) return;
    fecharEntrada();
    // já na sala como "Visitante": vira a conta ali mesmo; com o join dele ainda a caminho, a resposta dele faz isso
    if (st.visita) { if (st.entrou) virarConta(); } else if (!rtc) conectar();
    else if (socket?.connected && !st.entrou) entrar();
  } finally {
    botao.disabled = false;
  }
});

async function iniciar() {
  if (!conta?.token) {
    conta = null;
    pedirEntrada({ conta: true });
    return visitar();
  }
  preparar();
  if (await liberarSala()) conectar();
}

// Enquanto a pessoa digita o nome, a página já entra na sala como "Visitante" (sem jogar nada) para o teste da
// conexão com o PC do jogo rodar nesse tempo (diagnosticarFundo). Sala com senha e sem o passe: espera o login.
async function visitar() {
  preparar();
  let r;
  try { r = await post('/sala-acesso', { sala: SALA, passe }); } catch { return; }
  if (!r?.ok || conta || rtc) return;
  passe = r.passe || passe;
  st.visita = true;
  conectar();
}
// fez o login com a página já na sala como "Visitante": vira a conta sem refazer as conexões (o teste continua)
function virarConta() {
  socket.emit('lan-entrar', { token: conta.token, nome: conta.nome }, (r) => {
    if (r?.ok && r.nome) {
      st.visita = false;
      diagJogo.marcar('entrou na conta sem reconectar', { testando: !!fundo });
      aplicarLan(r.lan);
      return;
    }
    // servidor antigo ou recusou: entra de novo, do jeito de sempre
    st.visita = false;
    socket.disconnect();
    socket.connect();
  });
}

// O /config e a conexão com o servidor já vão saindo enquanto a entrada é conferida (duas idas e voltas a menos)
const pegarConfig = () => fetch('/config').then((r) => r.json());
let config = null;
function preparar() {
  config ||= pegarConfig().catch(() => null);
  socket ||= window.io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 1500, reconnectionDelayMax: 10000 });
}

// ?sincronia=1: a imagem volta a esperar o som e o som e o liso do Turbo voltam a ser os da sala (para comparar)
const SINCRONIA = new URLSearchParams(location.search).get('sincronia') === '1';
let conectando = false;
async function conectar() {
  if (conectando) return;
  conectando = true;
  preparar();
  const ice = (await config)?.iceServers;
  rtc = new RTC(socket, {
    iceServers: Array.isArray(ice) && ice.length ? ice : [{ urls: 'stun:stun.l.google.com:19302' }],
    onTrack: receberTrilha,
    onFalha: (id, temTurn) => {
      const u = st.users.get(id);
      if (!u || u.avisoFalha || id !== st.alvo?.u.id) return;
      u.avisoFalha = true;
      toast(temTurn ? `Não deu para conectar com ${u.name}. Recarregue a página.` : `Não deu para conectar com ${u.name}: as redes bloqueiam a conexão direta.`, 'error', 12000);
    },
  });
  rtc.semSincronia = !SINCRONIA; // a imagem não espera o som (rtc.somSolto)
  rtc.onControle = receberDireto;
  rtc.onMicCaiu = () => {
    mic.ligado = false;
    mic.pronto = false;
    socket.emit('mic', false);
    mostrarMic();
    toast('O microfone foi desligado pelo sistema. Clique em Microfone para ligar de novo.', 'warn', 6000);
  };
  const renovar = () => pegarConfig().then((c) => rtc.trocarIce(c.iceServers)).catch(() => {});
  setInterval(renovar, 6 * 3600_000);
  if (!rtc.temTurn) {
    const semTurn = setInterval(() => { if (rtc.temTurn) clearInterval(semTurn); else renovar(); }, 10_000);
  }
  ligarSocket();
}

function entrar() {
  const visita = !!st.visita && !conta;
  st.visita = visita;
  socket.emit('join', {
    room: SALA, name: visita ? 'Visitante' : conta?.nome, color: '#6ee7c8', mic: false, passe, lan: conta?.token || null, proto: 2,
    ...(visita ? { visita: true } : {}),
  }, (data) => {
    // o "Visitante" recusado (servidor sem ele): espera o login, sem recarregar
    if (visita && !data?.selfId) {
      st.visita = false;
      if (conta) entrar(); // o login chegou enquanto isso
      return;
    }
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
    // o servidor mudou de versão enquanto a conexão estava fora (deploy): o código novo combina com ele
    if (st.versao && data.versao && data.versao !== st.versao) return location.reload();
    st.versao ??= data.versao || null;
    st.entrou = true;
    st.selfId = data.selfId;
    rtc.selfId = data.selfId;
    st.main = data.main;
    $('#reconnecting').hidden = true;
    if (data.passe) {
      passe = data.passe;
      guardarPasse();
    }
    aplicarSala(data.sala);
    for (const u of data.users) addUser(u);
    // as conexões antes do primeiro pedido de imagem (aplicarLan → atualizar): sem elas o pedido não sai
    for (const u of data.users) rtc.getPeer(u.id);
    aplicarLan(data.lan);
    if (mic.ligado) socket.emit('mic', true); // reconexão com o microfone aberto
    atualizar();
    if (visita) diagJogo.marcar('entrou como visitante (o login ainda na tela)');
    if (visita && conta) virarConta(); // fez o login enquanto o visitante entrava
  });
}

// Reconexão: os ids mudaram e as conexões de vídeo eram com os antigos. Entra de novo sem recarregar a página: a
// tela cheia fica e, quando a tela do jogo voltar, a pessoa volta ao jogo (tentarVoltar).
function reentrar() {
  if (jogandoLa) caiuDoJogo();
  for (const u of st.users.values()) u.audioEl?.remove();
  for (const id of [...rtc.peers.keys()]) rtc.removePeer(id);
  st.users.clear();
  st.interesse.clear();
  semDono.clear();
  Object.assign(st, { entrou: false, selfId: null, main: null, controlando: false });
  atualizar();
  entrar();
}

function ligarSocket() {
  const aoConectar = () => {
    diagJogo.marcar('conectou ao servidor', { id: socket.id, transporte: socket.io?.engine?.transport?.name ?? null });
    if (st.entrou) reentrar();
    else entrar();
  };
  socket.on('connect', aoConectar);
  if (socket.connected) aoConectar(); // conectou enquanto a entrada era conferida
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
  // chegou alguém novo: o liberado "até alguém novo" acabou e a pessoa nova testa
  socket.on('lan-novo', (m) => {
    const maqs = (m?.maquinas || []).map((x) => NOME_MAQ[x]).filter(Boolean).join(' e ');
    if (m?.id === st.selfId) toast(`Pode testar: ${maqs} livre para os seus 2 minutos grátis.`, 'success', 8000);
    else if ((m?.maquinas || []).some((x) => lanEraAberta.has(x))) toast(`${m.nome} chegou para testar: o seu tempo liberado no ${maqs} acabou.`, 'warn', 10000);
  });
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
// (de quem é e qual máquina ficam guardados ao entrar: na queda, a tela já não está na lista)
function lembrarJogo() {
  if (!jogandoLa?.dono) return;
  try { sessionStorage.setItem(VOLTAR_CHAVE, JSON.stringify({ dono: jogandoLa.dono, maquina: jogandoLa.maquina, em: Date.now() })); } catch { /* sem armazenamento */ }
}
function esquecerJogo() {
  queda = null;
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

// A tela do jogo saiu do ar com a página aberta (o PS5 saiu e entrou, a conexão piscou): a tela cheia espera por ela
// e, voltando, o modo jogo liga sozinho. Só com a página na frente e no horário da pessoa. Esc desiste.
let queda = null; // { dono, maquina, em }
let caindo = false;
function caiuDoJogo() {
  lembrarJogo();
  queda = { dono: jogandoLa.dono, maquina: jogandoLa.maquina, em: Date.now() };
  caindo = true;
  try { controle.desligarJogo(); } finally { caindo = false; }
}
function desistirDeVoltar() {
  if (!queda) return;
  queda = null; // o botão "Voltar ao jogo" continua valendo (voltaAoJogo)
  jogoNoPc(false);
  atualizarBarra();
}
function tentarVoltar() {
  if (!queda || jogandoLa) return;
  if (Date.now() - queda.em > QUEDA_MS) return desistirDeVoltar();
  const a = st.alvo;
  if (!a || a.u.name !== queda.dono || maquinaDaTela(a.sh) !== queda.maquina || !jogavel() || !vivo(a.u.streams.get(a.sh.streamId))) return;
  if (document.hidden || !document.hasFocus() || !podeJogarLan(queda.maquina)) return;
  const fora = Math.round((Date.now() - queda.em) / 100) / 10;
  queda = null;
  entrarNoJogo(!!document.fullscreenElement);
  diagJogo.evento('a tela voltou: de volta ao jogo sozinho', { foraS: fora, telaCheia: !!document.fullscreenElement });
}
setInterval(tentarVoltar, 1000);

// A tela deste PC não apaga com o jogo ligado: um controle de videogame não conta como uso para o Windows
let trava = null;
let pedindoTrava = false;
async function acertarTrava() {
  if (!controle.jogo) {
    trava?.release().catch(() => {});
    trava = null;
    return;
  }
  if (trava || pedindoTrava || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  pedindoTrava = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    l.addEventListener('release', () => { if (trava === l) trava = null; });
    if (controle.jogo) trava = l;
    else l.release().catch(() => {});
  } catch { /* sem trava */ } finally {
    pedindoTrava = false;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acertarTrava(); });

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
  // o trilho colorido só até o volume; o resto fica branco (style da .jg-vol em jogar.html)
  $('#jg-vol-jogo').style.setProperty('--v', `${ajustes.jogo}%`);
  $('#jg-vol-voz').style.setProperty('--v', `${ajustes.voz}%`);
  for (const u of st.users.values()) {
    if (!u.audioEl) continue;
    u.audioEl.volume = ajustes.voz / 100;
    u.audioEl.muted = st.semVoz || ajustes.voz <= 0;
  }
}
// o navegador só deixa tocar com som depois de um gesto
function tocarTudo() {
  // (o Esc não conta como gesto: tirar o mudo com ele pausaria o vídeo)
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (video.muted && video.srcObject) {
    video.muted = false;
    video.play().catch((err) => {
      if (err?.name !== 'NotAllowedError') return;
      video.muted = true;
      video.play().catch(() => {});
    });
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
  // o ícone do microfone (cortado quando desligado) e o texto curto; o completo fica no title
  // só o ícone (pedido de 2026-11-27); o texto fica no title e no aria-label
  $('#jg-mic').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>${mic.ligado ? '' : '<path d="M4 4l16 16"/>'}</svg>`;
  $('#jg-mic').setAttribute('aria-label', mic.ligado ? 'Microfone ligado' : 'Microfone desligado');
  $('#jg-mic').title = mic.ligado ? 'Microfone ligado: clique para desligar' : 'Microfone desligado: clique para falar com a sala';
  $('#jg-mic').classList.toggle('on', mic.ligado);
  $('#jg-mic').setAttribute('aria-pressed', String(mic.ligado));
}
$('#jg-mic').addEventListener('click', (e) => {
  e.currentTarget.blur();
  alternarMic();
});
mostrarMic(); // o ícone desde o começo (o HTML vem vazio)

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
  // nada no telão (nem PC nem PS5 na sala): o WhatsApp do dono em destaque, para alugar
  $('#jg-vazio-whats').hidden = ok || !st.entrou || !!a || !!queda;
  if (!ok) mostrarBarra();
  if (ok) return void tentarVoltar();
  $('#jg-vazio b').textContent = !st.entrou ? 'Conectando à sala…' : a ? 'Carregando a imagem…' : queda ? 'A tela do jogo saiu do ar' : 'Nada no telão agora';
  $('#jg-vazio span').textContent = !st.entrou ? 'Só um instante.'
    : a ? `${a.u.name} · ${a.sh.titulo || NOME_MAQ[maquinaDaTela(a.sh)]}`
      : queda ? 'Se ela voltar, você volta ao jogo sozinho. Esc desiste.' : 'Quando o PC ou o PS5 entrar na sala, a imagem aparece aqui.';
}

// a imagem que não sobe: pede de novo e depois refaz a conexão com quem compartilha
let esperandoDesde = 0;
let passoEspera = 0;
setInterval(() => {
  const a = st.alvo;
  // atrás do login a imagem nem é pedida, e o teste da conexão para a imagem de propósito: refazer derrubaria o teste
  if (!st.entrou || !a || !$('#entrada').hidden || testeJoga.testando || vivo(a.u.streams.get(a.sh.streamId))) {
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
    if ((!u.shares.size && !u.cam) || !rtc.peers.has(u.id)) continue;
    const mapa = {};
    // atrás do login a imagem nem aparece (o fundo é a página da TV): só depois dele
    for (const sh of u.shares.values()) mapa[sh.key] = sh.key === st.alvo?.sh.key && $('#entrada').hidden ? 'max' : 'off';
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
  if (!st.entrou) return void (interesseDesde = 0);
  interesseDesde ||= agora;
  const completo = agora - ultimoCompleto > (agora - interesseDesde < 20_000 ? 1500 : 8000);
  if (completo) ultimoCompleto = agora;
  enviarInteresse(completo);
}, 1000);

function atualizar() {
  const antes = st.alvo?.sh.key;
  // a tela em que se jogava saiu do ar ou perdeu o controle
  if (jogandoLa && !acharTela(jogandoLa.key)?.sh.controle) {
    caiuDoJogo();
    toast('A tela do jogo saiu do ar ou o controle foi travado. Se voltar, você volta ao jogo sozinho.', 'warn', 6000);
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
  // o nome da tela não aparece mais (pedido de 2026-11-27): fica o ponto ao vivo e a qualidade
  $('#focus-name').textContent = a ? '' : 'Sala 3D · Jogar';
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
  if (document.body.classList.toggle('jg-controlando', st.controlando && !emJogo) !== eraControlando || emJogo !== eraJogo) mostrarBarra();
  eraControlando = st.controlando && !emJogo;
  eraJogo = emJogo;
  const ver = !emJogo && soVerLan();
  const cb = $('#focus-ctrl');
  cb.hidden = true; // o "Controlar" saiu da barra (2026-11-27): o Modo jogo faz o mesmo
  cb.textContent = st.controlando ? 'Só assistir' : 'Controlar';
  cb.classList.toggle('on', st.controlando);
  const jb = $('#focus-jogo');
  jb.hidden = !jogavel();
  const cheia = !!document.fullscreenElement;
  jb.textContent = ver ? (cheia ? 'Sair da tela cheia' : 'Tela cheia') : emJogo ? 'Desligar modo jogo' : 'Modo jogo';
  jb.classList.toggle('on', emJogo || (ver && cheia));
  jb.title = ver ? `Agora é a vez de ${vezDeQuem()}: dá para assistir em tela cheia. F8 entra e sai.` : 'Mouse gira a câmera e WASD anda. F8 liga e desliga.';
  $('#focus-jogo-op-wrap').hidden = jb.hidden || ver;
  if (jb.hidden) $('#jogo-op-pop').hidden = true;
  $('#focus-engasgo').hidden = !emJogo;
  const grande = $('#jg-jogar');
  grande.hidden = jb.hidden || st.controlando || (ver && cheia);
  grande.textContent = ver ? `▶ Ver em tela cheia · vez de ${vezDeQuem()}`
    : voltaAoJogo() ? '▶ Voltar ao jogo' : `▶ Modo jogo · ${a ? a.sh.titulo || NOME_MAQ[maquinaDaTela(a.sh)] : ''}`;
  atualizarBotaoTouchpad();
}
// Como no modo TV: a imagem ocupa a janela toda e a barra some com o mouse parado. Jogando (ou controlando em tela
// cheia) o mouse é do jogo: a barra só volta com ele encostado no topo da janela.
const BARRA_MS = 3500;
let eraControlando = false;
let eraJogo = false;
let barraTimer = 0;
const mouseEhDoJogo = () => !!controle.jogo || (st.controlando && !!document.fullscreenElement);
const barraPresa = () => !$('#jg-vazio').hidden || !$('#jogo-op-pop').hidden || !$('#lan-modal').hidden
  || (st.controlando && !controle.jogo && !document.fullscreenElement)
  || (!document.pointerLockElement && $('.focus-bar').matches(':hover, :has(:focus-visible)')); // com o mouse preso, o :hover fica no do clique
function mostrarBarra(ms = BARRA_MS) {
  document.body.classList.remove('jg-limpo');
  clearTimeout(barraTimer);
  barraTimer = setTimeout(esconderBarra, ms);
}
function esconderBarra() {
  clearTimeout(barraTimer);
  if (barraPresa()) barraTimer = setTimeout(esconderBarra, 1000);
  else document.body.classList.add('jg-limpo');
}
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement) return;
  if (!mouseEhDoJogo()) return mostrarBarra();
  if (e.clientY <= 4) mostrarBarra();
  else if (e.clientY > 120 && !document.body.classList.contains('jg-limpo')) esconderBarra();
}, { capture: true, passive: true });
$('.focus-bar').addEventListener('focusin', () => mostrarBarra());
addEventListener('keydown', (e) => { if (e.code === 'Tab' && !controle.jogo && !st.controlando) mostrarBarra(); });
document.addEventListener('fullscreenchange', () => { atualizarBarra(); mostrarBarra(); }); // o "Tela cheia" de quem só assiste troca o texto
// no celular não há mouse: um toque fora do jogo traz a barra
addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !controle.jogo) mostrarBarra(); }, { capture: true, passive: true });

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
let lanEraAberta = new Set(); // as minhas que eram "até alguém novo" (o fim delas avisa pelo 'lan-novo')
const idsDaVez = (m) => st.lan?.[m]?.ids || [];
const lanLivre = (m) => !st.lan?.[m]?.conta;
const semTeste = () => !!st.lan?.semTeste?.includes(st.selfId);
const podeJogarLan = (m) => !st.lan || idsDaVez(m).includes(st.selfId) || (lanLivre(m) && !semTeste());
function minhasMaquinas() { return Object.keys(NOME_MAQ).filter((m) => idsDaVez(m).includes(st.selfId)); }
// A máquina está alugada para outra pessoa: quem não é da vez só assiste. O "Modo jogo" vira "Tela cheia": a
// imagem na tela toda, sem controle, sem tutorial e sem o teste da conexão (nada disso iria ao jogo). No
// "até alguém novo", quem ainda tem o teste grátis não entra aqui: em segundos a vez é dela (deixarJogar avisa).
function soVerLan(sh = st.alvo?.sh) {
  if (!st.lan || !sh) return false;
  const m = maquinaDaTela(sh);
  const v = st.lan[m];
  if (!v?.conta || idsDaVez(m).includes(st.selfId)) return false;
  return !v.aberta || semTeste();
}
const vezDeQuem = () => (st.alvo ? st.lan?.[maquinaDaTela(st.alvo.sh)]?.conta || 'outra pessoa' : 'outra pessoa');
// Eu assistia a vez de outra pessoa e ela acabou com a máquina livre: sai da tela cheia e abre o aluguel no
// "Jogar agora" (começa no minuto seguinte). Com a página escondida, fica para quando voltar a ela.
let fimVezPendente = null;
async function acabouVezAssistindo(m, conta) {
  if (document.visibilityState !== 'visible') return void (fimVezPendente = { m, conta });
  fimVezPendente = null;
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  const nome = { pc: 'PC', ps5: 'PS5' }[m];
  const temTeste = !st.lan?.semTeste?.includes(st.selfId);
  toast(`A vez de ${conta || 'quem jogava'} no ${nome} acabou: o ${nome} está livre.${temTeste ? ' Use seus 2 min grátis ou alugue para jogar.' : ' Alugue para jogar agora.'}`, 'info', 10000);
  if (!st.lan || !lanLivre(m) || !$('#lan-modal').hidden) return; // alguém pegou nesse meio-tempo, ou já está aberto
  abrirAluguel({ maquina: m, agora: true }); // o "Jogar agora" do aluguel: começa no minuto seguinte
}
document.addEventListener('visibilitychange', () => {
  const p = fimVezPendente;
  if (p && document.visibilityState === 'visible' && st.lan && lanLivre(p.m)) acabouVezAssistindo(p.m, p.conta);
});
// antes da 1ª tela cheia desta vez: a oferta do próximo horário livre (oferta-aluguel.js)
async function verOuAlugar() {
  const m = maquinaDaTela(st.alvo.sh);
  const vez = st.lan?.[m];
  if (document.fullscreenElement || !precisaOferecer(m, vez)) return telaCheiaSoVer();
  const r = await oferecerAluguel({ sala: SALA, maquina: m, vez });
  diagJogo.marcar('lan: oferta de aluguel ao assistir', { maquina: m, escolheu: r?.alugar ? 'alugar' : r || 'fechou' });
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
    .catch(() => { /* iPhone: sem tela cheia de elemento; a página deitada já serve */ });
  diagJogo.marcar('lan: assistindo em tela cheia (a vez é de outra pessoa)', { vez: vezDeQuem() });
}
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
  const minha = idsDaVez(m).includes(st.selfId);
  // liberado até alguém novo entrar: sem fim
  if (v.aberta) return { texto: `${minha ? 'Sua vez' : `Vez de ${v.conta}`} no ${NOME_MAQ[m]} · até alguém novo chegar`, minha };
  const f = falta(v.fim);
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
  const assistia = st.alvo && soVerLan() ? maquinaDaTela(st.alvo.sh) : null; // a máquina que eu assistia sem ser a minha vez
  const vezQueAssistia = assistia ? st.lan[assistia].conta : null;
  st.lan = e?.ligada ? e : null;
  if (assistia && st.lan && lanLivre(assistia)) acabouVezAssistindo(assistia, vezQueAssistia);
  if (typeof e?.agora === 'number') lanDif = e.agora - Date.now();
  const agora = new Set(minhasMaquinas());
  for (const m of agora) {
    if (lanEraMinha.has(m)) continue;
    const v = st.lan[m];
    if (v.aberta) {
      toast(`O ${NOME_MAQ[m]} foi liberado para você até alguém novo chegar para testar. Bom jogo!`, 'success', 8000);
      continue;
    }
    toast(v.preparando ? `Seu horário no ${NOME_MAQ[m]} começa às ${hora(v.inicio)}. Joga até ${hora(v.fim)}.` : `Seu horário no ${NOME_MAQ[m]} começou: você joga até ${hora(v.fim)}. Bom jogo!`, 'success', 8000);
  }
  for (const m of lanEraMinha) if (!agora.has(m) && !lanEraAberta.has(m)) toast(`Seu horário no ${NOME_MAQ[m]} acabou. Para jogar mais, alugue outro horário.`, 'warn', 9000);
  lanEraMinha = agora;
  lanEraAberta = new Set([...agora].filter((m) => st.lan[m]?.aberta));
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
// De graça: enquanto o diagnóstico (teste da conexão) está na tela, nada vai ao jogo,
// e os 2 min só começam quando terminam ou são pulados (o servidor não conta o 'modo' nem o 'vivo')
function seguraNoPreparo(key, ev) {
  if (!st.lan || meuTesteLan || ev?.t === 'modo' || ev?.t === 'vivo') return false;
  if (!testeJoga.testando) return false;
  const t = acharTela(key);
  if (!t) return false;
  const m = maquinaDaTela(t.sh);
  return lanLivre(m) && !idsDaVez(m).includes(st.selfId);
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
  // liberado "até alguém novo": quem ainda tem o teste espera uns segundos (o servidor tira a vez de lá); quem
  // já usou o teste (por esta conta ou por outra na mesma internet) não conta como pessoa nova
  const v = st.lan?.[m];
  const texto = lanLivre(m) ? `Seu teste grátis já foi usado. Alugue o ${NOME_MAQ[m]} para jogar.`
    : !v.aberta ? `Agora é a vez de ${v.conta} no ${NOME_MAQ[m]}.`
      : semTeste() ? `O teste grátis já foi usado nesta conta ou nesta internet, então o ${NOME_MAQ[m]} continua com ${v.conta}. Para jogar, alugue.`
        : `O ${NOME_MAQ[m]} está com ${v.conta} até alguém novo chegar: em alguns segundos ele fica livre para o seu teste.`;
  toast(texto, 'warn', 8000);
  if (lanLivre(m)) abrirAluguel();
  return false;
}
// pedido: { maquina, dia, inicio } — a página do aluguel já abre nessa máquina, com essa hora escolhida
function abrirAluguel(pedido = null) {
  if (document.pointerLockElement) document.exitPointerLock();
  const extra = pedido?.maquina ? `&maquina=${pedido.maquina}${pedido.agora ? '&agora=1' : pedido.dia ? `&dia=${pedido.dia}&hora=${pedido.inicio}` : ''}` : '';
  $('#lan-frame').src = `/lan?sala=${encodeURIComponent(SALA)}&embed=1${extra}`;
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
    if (ev === 'controle' && seguraNoPreparo(data.key, data.ev)) return;
    if (ev === 'controle' && rtc?.mandarControle(String(data.key).split('~')[0], { c: data })) return;
    return volatil ? socket?.volatile.emit(ev, data) : socket?.emit(ev, data);
  },
  direto: (key) => !!rtc?.canalControle(String(key).split('~')[0]),
  movimento: (key, total) => (barrado(key) ? (pedirAluguel(), true) : seguraNoPreparo(key, { t: 'mouse' }) || !!rtc?.mandarMovimento(String(key).split('~')[0], { m: { key, ...total } })),
  toast,
  onExtensao: () => {},
  minha: () => null,
});
const avisoSite = new AvisoDoSite({ raiz: $('#aviso-site'), controle, responder: (key, ev) => controle.mandar(key, ev) });

// o aviso do relatório só para o dono da sala (o passe de dono que a sala guardou neste aparelho)
const diagJogo = new DiagJogo({ toast, contexto: () => ({ sala: SALA, nome: conta ? `${conta.nome} (jogar)` : null }), verRelatorio: () => false }); // sem aviso de relatório no /jogar: ele vai para o servidor (banco) do mesmo jeito
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
const turboRecebe = new TurboRecebe({
  abrir: (id, vida) => rtc?.abrirTurbo(id, CANAL_CONFIAVEL ? null : vida),
  abrirSom: (id) => rtc?.abrirTurboSom(id, CANAL_CONFIAVEL),
  somDaTela: () => video,
  volume: () => ajustes.jogo / 100,
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  onFalhou: (motivo) => {
    diagJogo.evento('modo turbo falhou: vídeo normal de volta', { motivo });
    if (turboRecebe.ultimaFalha) diagJogo.evento('turbo: como estava ao desistir', turboRecebe.ultimaFalha);
    turboVolta.falhou(motivo); // sem aviso na tela: o vídeo normal entra sozinho e o relatório guarda o motivo
  },
});
// como na TV: só H.264, os mesmos perfis, e a placa antes de qualquer outra coisa; o PC leva 3–4 s para começar
turboRecebe.semHevc = true;
// os avisos de botão do jogo (△, ✕…) com a tecla do teclado em cima: olham os quadros do turbo
const avisosBotoes = new AvisosBotoes({
  camada: $('#jogo-avisos'),
  video,
  telaTurbo: () => video.parentElement.querySelector('.turbo-tela:not([hidden])'),
});
turboRecebe.espiar = (frame) => avisosBotoes.espiar(frame);
turboRecebe.socorro = true;
turboRecebe.codecsForcados = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];
turboRecebe.aceleracoes = ['prefer-hardware', 'prefer-hardware@2a', 'prefer-hardware@28', 'prefer-hardware@1f', 'no-preference'];
turboRecebe.semImagemMs = 12_000;
turboRecebe.somCurto = !SINCRONIA;
turboRecebe.lisoSoluco = !SINCRONIA;
const MODOS = [PRESET_TV, ...PRESETS];
const presetAtual = () => MODOS.find((p) => p.id === opcoesJogo.get('preset')) || null;
// a página sempre abre no Turbo da TV (o padrão do jogo-opcoes.js é o da sala)
opcoesJogo.setVarios({ preset: PRESET_TV.id, ...PRESET_TV.opcoes });
// no Turbo da TV (e no Manual que sai dele) o realce não vale, mesmo guardado ligado
let realceVale = false;
const comRealce = () => !!ajustes.nitidez && realceVale;
const comTratamento = () => !!ajustes.tratamento && realceVale; // a mesma regra do realce
function ligarTurbo() {
  if (!jogandoLa || entrando === jogandoLa) return; // no meio do teste da conexão: entrarNoTurbo liga no fim
  const p = presetAtual();
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  vidaPedida = CANAL_CONFIAVEL ? null : p?.vida ?? TTL_MS;
  turboRecebe.vidaMs = CANAL_CONFIAVEL ? p?.vida ?? TTL_MS : vidaDoCanal(vidaPedida, rttDoDono?.dono === jogandoLa.key.split('~')[0] ? rttDoDono.ms : null);
  turboVolta.ligou();
  turboRecebe.h265 = !!p?.h265;
  turboRecebe.lisoPct = p?.lisoPct ?? LISO_PCT;
  turboRecebe.lisoMax = p?.lisoMax ?? LISO_MAX;
  turboRecebe.realce = comRealce();
  turboRecebe.tratamento = comTratamento();
  turboRecebe.ligar(jogandoLa.key, jogandoLa.video, opcoesJogo.get('rapido') ? 720 : 1080);
  diagJogo.evento('modo turbo ligado', { nitidez: turboRecebe.realce, tratamento: turboRecebe.tratamento, liso: opcoesJogo.get('turboLiso'), vidaMs: turboRecebe.vidaMs, h265: turboRecebe.h265, lisoPct: turboRecebe.lisoPct, lisoMaxMs: turboRecebe.lisoMax, menosFila: !SINCRONIA, canal: CANAL_CONFIAVEL ? 'confiável' : 'com prazo' });
}
let aplicandoPreset = false;
function aplicarPreset(n, porque = 'escolhido') {
  const p = MODOS.find((x) => x.id === n) || null;
  const antes = presetAtual();
  const realceAntes = [comRealce(), comTratamento()].join();
  if (p) realceVale = !p.semRealce;
  aplicandoPreset = true;
  try { opcoesJogo.setVarios({ preset: p ? p.id : 0, ...(p ? p.opcoes : {}) }); } finally { aplicandoPreset = false; }
  turboRecebe.liso = opcoesJogo.get('turboLiso');
  if (!jogandoLa || !p) return;
  diagJogo.evento(`preset ${p.id}: ${p.nome} (${porque})`, { ...p.opcoes, vidaMs: p.vida, lisoPct: p.lisoPct ?? null });
  // só a folga do liso muda (Turbo da TV, liso e rápido, com o mesmo realce): vale já, sem a imagem recomeçar
  if (turboRecebe.ligado && antes && antes.vida === p.vida && OPCOES_DO_PRESET.every((k) => antes.opcoes[k] === p.opcoes[k])
    && realceAntes === [comRealce(), comTratamento()].join() && turboRecebe.mudarLiso(p.lisoPct ?? LISO_PCT, p.lisoMax ?? LISO_MAX)) return;
  aplicarBuffer();
  avisarModo();
  if (p.opcoes.turbo) ligarTurbo();
  else {
    turboVolta.parar();
    turboRecebe.desligar();
  }
}
// ---------------------------------------------------------------- automático e volta do turbo (turbo-auto.js)
let rttDoDono = null; // { dono, ms }: a ida e volta da última amostra, para a vida do canal (vidaDoCanal)
const nomeDoModo = (id) => MODOS.find((p) => p.id === id)?.nome || 'modo atual';
function mostrarAuto() {
  Object.assign(autoMostra, { ligado: turboAuto.ligado, texto: turboAuto.fase === 'fixo' ? `agora: ${nomeDoModo(turboAuto.escolhido)}` : turboAuto.fase ? 'medindo a sua conexão…' : 'escolhe o melhor para você' });
  marcarPresets(document);
}
const turboAuto = new TurboAuto({
  modos: ORDEM_AUTO.jogar,
  aplicar: (id, porque) => aplicarPreset(id, porque),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
  onEstado: () => mostrarAuto(),
  onDecidiu: (id) => {
    const quem = jogandoLa && (jogandoLa.dono || jogandoLa.key.split('~')[0]);
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
let pulouTesteEm = 0; // o "pular" do painel: o teste de segundo plano que acabou assim não roda de novo no jogo
const painelTeste = new PainelTeste({ dentro: () => $('#focus'), onPular: () => { pulouTesteEm = Date.now(); testeJoga.pular(); }, onEvento: (texto, dados) => diagJogo.evento(texto, dados) });
// onde o teste está (para a entrada e o aviso sobre a imagem)
const PCT_ETAPA = { resposta: 8, direto: 25, turn: 55, imagem: 80, fim: 100 };
const diagAgora = { etapa: null, texto: '', pct: null };
let ultimoDiag = null; // o resumo do último teste que terminou ("caminho direto · Turbo da TV")
const testeJoga = new TesteJoga({
  abrir: (id) => rtc?.abrirTeste(id) ?? null,
  caminho: (id) => rtc?.caminhoPara(id) ?? null,
  caminhos: (id) => rtc?.caminhosDe(id) ?? null,
  sonda: (sinal) => rtc?.sondaTurn(sinal) ?? null,
  onProgresso: (p) => {
    if (p.etapa) Object.assign(diagAgora, { etapa: p.etapa, pct: Math.max(diagAgora.pct || 0, PCT_ETAPA[p.etapa] ?? 0) });
    diagAgora.texto = p.texto || '';
    painelTeste.progresso(p);
    mostrarDiagFundo();
  },
  onVivo: (v) => painelTeste.vivo(v),
  onEvento: (texto, dados) => diagJogo.evento(texto, dados),
});
const resumoDoTeste = (r) => `${r.rota === 'turn' ? 'pelo servidor' : 'caminho direto'} · ${MODOS.find((p) => p.id === r.modo)?.nome || 'Turbo'}`;
// o painel grande do teste, só com o jogo ligado
let esperandoFundo = false;
function painelSeTestando() {
  if (!testeJoga.testando || !controle.jogo || painelTeste.el) return;
  painelTeste.mostrar(esperandoFundo ? { titulo: 'Finalizando o diagnóstico da conexão', texto: 'Ele começou enquanto você entrava. Falta pouco.' } : undefined);
  if (diagAgora.etapa) painelTeste.progresso({ etapa: diagAgora.etapa, texto: diagAgora.texto });
}

// ---------------------------------------------------------------- o teste em segundo plano
// Pedido de 2026-11-27: o diagnóstico roda enquanto a pessoa faz o login (a página entra como "Visitante", ver
// visitar) ou assiste antes de apertar o Modo jogo. Quem entra rápido e aperta o Modo jogo vê "finalizando o
// diagnóstico" (testarConexao espera este); quem demora já encontra o caminho e o modo escolhidos e guardados
// (memoriaTeste, que vale o dia todo neste aparelho). Assistindo a vez de outra pessoa, não roda: o PC do jogo para a
// imagem para quem testa.
const tentouFundo = new Map(); // quem -> { n, em }
async function diagnosticoFundoTalvez() {
  if (fundo || testeJoga.testando || entrando || controle.jogo || !st.entrou || !rtc || document.hidden) return;
  const a = st.alvo;
  if (!a || !jogavel()) return;
  const naEntrada = !$('#entrada').hidden;
  if (!naEntrada && (soVerLan() || (st.lan && !podeJogarLan(maquinaDaTela(a.sh))))) return;
  const dono = a.u.id;
  const quem = a.u.name;
  const t = tentouFundo.get(quem);
  if (t && (t.n >= 2 || Date.now() - t.em < 60_000)) return;
  const rede = await Promise.resolve(rtc.caminhoPara(dono)).catch(() => null);
  if (!rede || fundo || testeJoga.testando || controle.jogo || st.alvo?.sh.key !== a.sh.key) return;
  const valeu = memoriaTeste.valido(quem, rede);
  if (valeu) {
    ultimoDiag ||= resumoDoTeste(valeu);
    return;
  }
  tentouFundo.set(quem, { n: (t?.n || 0) + 1, em: Date.now() });
  diagnosticarFundo(a.sh.key, quem, dono, naEntrada);
}
setInterval(() => { diagnosticoFundoTalvez().catch(() => {}); }, 1500);

function diagnosticarFundo(key, quem, dono, naEntrada) {
  const f = { quem, key, naEntrada, desde: performance.now() };
  fundo = f;
  Object.assign(diagAgora, { etapa: null, texto: 'Começando…', pct: 2 });
  fundoDaEntrada(!$('#entrada').hidden); // a imagem do fundo sai enquanto testa
  mostrarDiagFundo();
  const s = () => Math.round((performance.now() - f.desde) / 100) / 10;
  f.promessa = (async () => {
    let r = null;
    try {
      codecsDoTeste ??= await codecsDaqui(['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'], ['hvc1.1.6.L123.B0']);
      if (rtc?.usarCaminho(dono, 'auto')) await esperarRota(dono, false);
      const rede0 = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null);
      diagJogo.marcar('teste da conexão em segundo plano: começou', { naEntrada, quem });
      r = await testeJoga.rodar(key, { codecs: codecsDoTeste, padrao: PRESET_TV.id, rapido: 16, tudo: false, toque: false });
      if (r.tetoParcialKbps) memoriaTeste.guardarParcial(quem, r.tetoParcialKbps);
      if (r.erro) {
        diagJogo.marcar('teste da conexão em segundo plano: não terminou', { erro: r.erro, s: s() });
        r = null;
      } else {
        memoriaTeste.guardar(quem, r, rede0 || await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null));
        ultimoDiag = resumoDoTeste(r);
        autoMostra.teste = textoDoResultado(r);
        marcarPresets(document);
        diagJogo.marcar('teste da conexão em segundo plano: pronto', { s: s(), rota: r.rota, modo: r.modo, tetoKbps: r.tetoKbps, codec: r.codec, trocarRota: !!r.trocarRota, nota: r.nota?.nota ?? null });
      }
    } catch (err) {
      console.warn('[teste em segundo plano]', err);
      r = null;
    } finally {
      if (fundo === f) fundo = null;
      fundoDaEntrada(!$('#entrada').hidden);
      mostrarDiagFundo();
    }
    return r;
  })();
}

// o andamento na entrada (embaixo do botão) e por cima da imagem, antes do Modo jogo
function mostrarDiagFundo() {
  const testando = !!fundo && testeJoga.testando;
  const pct = diagAgora.pct != null ? ` · ${diagAgora.pct}%` : '';
  const en = $('#en-diag');
  if (en) {
    const html = testando ? `<span class="en-gira" aria-hidden="true"></span>Preparando a conexão com o PS5 enquanto você entra${pct}`
      : ultimoDiag && st.entrou ? `✓ Conexão pronta (${esc(ultimoDiag)})` : '';
    en.hidden = !html;
    if (en.innerHTML !== html) en.innerHTML = html;
  }
  const sobre = $('#jg-diag');
  if (sobre) {
    const ver = testando && $('#entrada').hidden && !controle.jogo;
    sobre.hidden = !ver;
    if (ver) sobre.innerHTML = `<span class="en-gira" aria-hidden="true"></span>Ajustando a conexão com o PS5: a imagem volta em instantes${pct}`;
  }
}
let codecsDoTeste = null;
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
  const quem = jl.dono || dono; // o PC do jogo pelo nome: o id muda a cada entrada
  // o de segundo plano ainda rodando (começou no login): espera ele, com o "finalizando" na tela
  const f = fundo;
  let esperou = false;
  if (!deNovo && f && f.quem === quem) {
    esperou = true;
    esperandoFundo = true;
    diagJogo.evento('teste da conexão: esperando o de segundo plano', { etapa: diagAgora.etapa, rodandoS: Math.round((performance.now() - f.desde) / 1000), naEntrada: f.naEntrada });
    painelSeTestando();
    try { await f.promessa; } finally { esperandoFundo = false; }
    painelTeste.fechar();
    if (jogandoLa !== jl) return null;
    if (Date.now() - pulouTesteEm < 5000) {
      diagJogo.evento('teste da conexão: o de segundo plano foi pulado');
      return null;
    }
  }
  const rede = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null);
  if (jogandoLa !== jl) return null;
  let r = deNovo ? null : memoriaTeste.valido(quem, rede);
  let rede0 = null;
  if (r) {
    diagJogo.evento(esperou ? 'teste da conexão: vale o de segundo plano' : 'teste da conexão: vale o de hoje', { tetoKbps: r.tetoKbps, codec: r.codec, modo: r.modo });
    ultimoDiag ||= resumoDoTeste(r);
    // quem esperou vê o resultado por 2 s
    if (esperou) painelTeste.resultado(r, MODOS.find((p) => p.id === r.modo)?.nome || 'Turbo');
  } else {
    Object.assign(diagAgora, { etapa: null, texto: 'Começando…', pct: 2 });
    codecsDoTeste ??= await codecsDaqui(['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'], ['hvc1.1.6.L123.B0']);
    if (jogandoLa !== jl) return null;
    if (!deNovo && memoriaTeste.porque) diagJogo.evento('teste da conexão: o de há pouco não vale mais', { porque: memoriaTeste.porque });
    // testar de novo com o TURN escolhido antes: primeiro volta ao direto, para comparar os dois
    if (rtc?.usarCaminho(dono, 'auto')) await esperarRota(dono, false);
    if (jogandoLa !== jl) return null;
    rede0 = await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null); // o teste vale para este caminho direto
    const rodando = testeJoga.rodar(jl.key, { codecs: codecsDoTeste, padrao: PRESET_TV.id, rapido: 16, tudo: deNovo, toque: false });
    painelSeTestando();
    r = await rodando;
    painelTeste.fechar();
    if (r.tetoParcialKbps) memoriaTeste.guardarParcial(quem, r.tetoParcialKbps);
    if (jogandoLa !== jl || r.erro) return null;
    memoriaTeste.guardar(quem, r, rede0 || await Promise.resolve(rtc?.caminhoPara(dono)).catch(() => null));
    ultimoDiag = resumoDoTeste(r);
    if (jogandoLa !== jl) return null;
    painelTeste.resultado(r, MODOS.find((p) => p.id === r.modo)?.nome || 'Turbo');
  }
  if (r.trocarRota && rtc?.usarCaminho(dono, 'turn')) {
    const foi = await esperarRota(dono, true);
    diagJogo.evento('teste da conexão: passando para o TURN', { foi });
    if (jogandoLa === jl) aplicarBuffer();
    if (!foi && jogandoLa === jl) rtc.usarCaminho(dono, 'auto'); // não ligou: volta a valer qualquer caminho
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
  if (realMin > Math.max(10, (p.travadasMin || 0) * 3)) { memoriaTeste.esquecer(p.quem); diagJogo.evento('teste da conexão: o jogo saiu pior que o previsto, testa de novo na próxima', { travadasMin: realMin }); }
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
    const parcial = memoriaTeste.parcial(jl.dono || jl.key.split('~')[0]);
    if (parcial) {
      turboRecebe.teste = { tetoKbps: parcial };
      diagJogo.evento('turbo: começando no que o teste pulado mediu', { tetoKbps: parcial });
    }
  }
  previsto = r?.previsto ? { ...r.previsto, desde: performance.now(), am: [], quem: jl.dono || jl.key.split('~')[0] } : null;
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

$('#jogo-op-pop').insertAdjacentHTML('afterbegin', htmlPresets(PRESET_TV));
mostrarAuto();
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-preset]');
  if (!el) return;
  if (el.dataset.preset === 'auto') {
    if (!turboAuto.ligado) {
      const primeiro = turboAuto.modos[0];
      if (opcoesJogo.get('preset') !== primeiro) aplicarPreset(primeiro, 'automático');
      turboAuto.ligar(!!jogandoLa);
    }
    mostrarAuto();
    el.blur();
    return;
  }
  autoDesligado();
  const n = Number(el.dataset.preset) || 0;
  if (n !== (opcoesJogo.get('preset') || 0)) aplicarPreset(n);
  else marcarPresets(document);
  el.blur();
});
opcoesJogo.ouvir((k, v) => {
  if (!aplicandoPreset && OPCOES_DO_PRESET.includes(k)) autoDesligado();
  if (!aplicandoPreset && OPCOES_DO_PRESET.includes(k) && opcoesJogo.get('preset')) {
    aplicandoPreset = true;
    try { opcoesJogo.setVarios({ preset: 0 }); } finally { aplicandoPreset = false; }
    diagJogo.evento('preset: manual (opção mudada à mão)', { [k]: v });
  }
  if (k === 'preset') {
    marcarPresets(document);
    $('#jg-nitidez').checked = comRealce();
    $('#jg-tratamento').checked = comTratamento();
  }
  if (k === 'liso') aplicarBuffer();
  else if (k === 'turboLiso') turboRecebe.liso = v;
  else if (k === 'rapido') {
    avisarModo();
    if (turboRecebe.ligado) ligarTurbo();
  } else if (k === 'turbo' && jogandoLa) {
    if (v) ligarTurbo();
    else {
      turboVolta.parar();
      turboRecebe.desligar();
    }
  } else if (k === 'selo') mostrarSelo();
  else if (k === 'avisos') mostrarLegenda(layoutLegenda);
  else if (k === 'menuAuto' && jogandoLa) controle.cursorLivre(jogandoLa.key, v ? jogandoLa.cursorLivre : false);
  else if (k === 'preencher') document.body.classList.toggle('jogo-preencher', !!v);
  else if (k === 'tela') document.body.dataset.jogoTela = v;
  for (const el of $$('#jogo-op-pop [data-op]')) el.checked = !!opcoesJogo.get(el.dataset.op);
});
document.body.classList.toggle('jogo-preencher', !!opcoesJogo.get('preencher'));
// celular: Tela toda / Com faixas / Sem bordas, no painel do controle de toque (style.css body.toque-jogo[data-jogo-tela])
document.body.dataset.jogoTela = opcoesJogo.get('tela');

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
  turboVolta.parar();
  turboAuto.parar();
  // o de segundo plano segue (entrando no jogo, testarConexao espera por ele; saindo, ele termina e fica guardado)
  if (!fundo) testeJoga.pular('saiu do jogo');
  if (jogandoLa) rtc?.usarCaminho(jogandoLa.key.split('~')[0], 'auto'); // o TURN escolhido vale só para o jogo
  Object.assign(vigiaCaminho, { par: null, rtt: [], procurou: false });
  previsto = null;
  painelTeste.fechar();
  turboRecebe.desligar();
  turboRecebe.depoisDaFalha = null;
  vidaAjustada = false;
  if (jogandoLa) {
    diagJogo.evento('buffer normal de volta', rtc?.baixaLatencia(video.srcObject, false));
    jogandoLa = null;
    diagJogo.parar();
  }
  if (!v) {
    mostrarAuto();
    return void mostrarSelo();
  }
  esquecerJogo();
  // o automático começa no modo que deu certo da última vez nesta página
  if (turboAuto.ligado && opcoesJogo.get('turbo') && opcoesJogo.get('preset') !== turboAuto.inicial) aplicarPreset(turboAuto.inicial, 'automático');
  const t = acharTela(key);
  jogandoLa = { key, video: v, cursorLivre: false, dono: t?.u.name ?? null, maquina: maquinaDaTela(t?.sh) };
  const op = (k) => opcoesJogo.get(k);
  diagJogo.comecar('joga', {
    gl: placaLida,
    video: v,
    extra: { pagina: 'jogar', receita: 'tv', dualsense: ajustes.dualsense, nitidez: comRealce(), canal: CANAL_CONFIAVEL ? 'confiável' : 'com prazo', janelaDoJogo: t?.sh.titulo ?? null, toque: false, opcoes: { liso: op('liso'), menuAuto: op('menuAuto'), giro: false, rapido: op('rapido'), turbo: op('turbo'), turboLiso: op('turboLiso'), preset: op('preset') } },
  });
  aplicarBuffer();
  mostrarSelo();
  avisarModo();
  if (op('turbo')) entrarNoTurbo();
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
  if (!rtc || !jogandoLa || !diagJogo.ativo || entrando === jogandoLa) return; // no teste da conexão a imagem está parada
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
    amostraDoAuto(resumo);
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
  diagJogo.marcarEngasgo(turboRecebe.ligado ? turboRecebe.caixaPreta() : null);
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
let segurandoSair = 0;
setInterval(() => {
  if (!padVirtual.key || touchpad.ativo) return void (segurandoSair = 0);
  const g = fisico.pad();
  if (!g) return void (segurandoSair = 0);
  if (LAYOUTS[layoutDa(st.alvo?.sh)]?.virtual) padVirtual.fisico(g);
  // Create + Options (View + Menu) segurados: sai do modo jogo, para quem joga longe do teclado
  if (!g.buttons[8]?.pressed || !g.buttons[9]?.pressed) return void (segurandoSair = 0);
  segurandoSair ||= performance.now();
  if (performance.now() - segurandoSair < SAIR_SEGURANDO_MS) return;
  segurandoSair = 0;
  sairDoJogo();
}, ENVIO_PAD_MS);
const entradaDeAgora = () => (touchpad.ligado && touchpad.ativo ? 'dualsense' : fisico.pad() ? 'gamepad' : 'teclado');
let layoutLegenda = null;
let noCarro = false;
const modoCarroTela = new ModoCarroTela({ quadro: $('#jogo-modo'), aviso: $('#jogo-modo-aviso') });
const tecladoPad = new TecladoPad({
  pad: padVirtual,
  sens: () => opcoesJogo.get('mouseSens'),
  aviso: (texto) => toast(texto, 'info', 5000),
  onCarro: (sim) => {
    if (sim !== noCarro) diagJogo.evento(sim ? 'modo carro: no carro' : 'modo carro: a pé');
    const trocou = sim !== noCarro;
    noCarro = sim;
    if (layoutLegenda) mostrarLegenda(layoutLegenda);
    if (trocou && layoutLegenda && tecladoPad.ativo) modoCarroTela.trocou(sim);
  },
});
padVirtual.onErroTremor = (erro) => diagJogo.evento('o controle não aceitou o tremor', { erro, ...padVirtual.comoVibra() });
// Sem tutorial do controle (desde 2026-11-27, pedido do usuário): no teclado e mouse, os avisos de botão do
// jogo já trazem a tecla (avisos-botoes-tela.js); no celular e com controle não precisa.
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
  return tecladoPad.evento(ev);
};
// controle ligado ou desligado: a legenda e as teclas nos avisos são só para quem joga no teclado
const entradaMudou = () => { if (layoutLegenda) mostrarLegenda(layoutLegenda); };
const touchpad = new Ps5Touchpad({ pad: padVirtual, onMudou: () => { atualizarBotaoTouchpad(); avisarModo(); entradaMudou(); } });
padVirtual.hid = touchpad;
const fisico = new ControleFisico({ controle, pad: padVirtual, toast, onAtivo: (sim) => { $('#toque-jogo').classList.toggle('tj-pad', sim); entradaMudou(); } });
// Celular: o mesmo controle de toque da sala (toque-jogo.js) por cima da imagem no modo jogo
const toqueJogo = new ToqueJogo({
  raiz: $('#toque-jogo'),
  controle,
  pad: padVirtual,
  toast: (texto, tipo, ...resto) => { if (tipo !== 'info') toast(texto, tipo, ...resto); }, // sem os avisos de entrada (pedido do usuário)
  onEngasgo: () => marcarEngasgo(),
  volume: {
    get: () => ajustes.jogo,
    set: (v) => {
      ajustes.jogo = limitar(v, 0, 100);
      $('#jg-vol-jogo').value = String(ajustes.jogo);
      gravarJSON(AJUSTES_CHAVE, ajustes);
      volumes();
    },
  },
  onSair: () => sairDoJogo(),
});
controle.onCursorLivre = (livre) => toqueJogo.cursorDoJogo(livre);
if (isTouch) document.body.classList.add('touch'); // a barra no jeito do celular (style.css body.touch, jogar.html)

// Sem a legenda dos botões no canto (desde 2026-11-27, pedido do usuário): as teclas aparecem em cima dos
// avisos do próprio jogo (avisos-botoes-tela.js). Fica o quadro do modo carro (a pé / no carro).
function mostrarLegenda(layout) {
  layoutLegenda = layout;
  // com controle não serve para nada, e menos coisa por cima da imagem é menos trabalho para mostrá-la
  const noTeclado = !!layout && entradaDeAgora() === 'teclado';
  // a tecla em cima dos avisos de botão do jogo: só com os ícones do PS5 e jogando no teclado
  avisosBotoes.ligar(noTeclado && layout === 'ps5' && opcoesJogo.get('avisos'));
  if (!noTeclado) return void modoCarroTela.esconder();
  // modo carro: a pé ou no carro, sempre à vista
  modoCarroTela.mostrar(noCarro);
}
mapaTeclas.ouvir(() => { if (layoutLegenda) mostrarLegenda(layoutLegenda); });
for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (layoutLegenda) mostrarLegenda(layoutLegenda); });

function atualizarBotaoTouchpad() {
  const sh = st.alvo?.sh;
  const b = $('#jogo-touchpad');
  b.hidden = !temTouchpadHid() || !(touchpad.ativo || ehPs5(sh));
  b.textContent = ajustes.dualsense ? 'DualSense direto ligado ✓ (clique para desligar)' : 'Usar o DualSense direto (gatilhos e giroscópio; pode atrasar)';
  // o mesmo, à vista na barra: abre a janela do navegador para vincular o DualSense (só no PC, numa tela de PS5)
  const c = $('#jg-controle');
  c.hidden = isTouch || !temTouchpadHid() || !ehPs5(sh);
  c.textContent = ajustes.dualsense ? '🎮 Controle conectado ✓' : '🎮 Conectar controle';
  c.classList.toggle('on', !!ajustes.dualsense);
  $('#jogo-mapear').hidden = !LAYOUTS[layoutDa(sh)]?.virtual;
}

// "Conectar controle" na barra: já conectado, só avisa (desligar continua nas Opções); senão, o mesmo das Opções
$('#jg-controle').addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (ajustes.dualsense) return void toast('O controle já está conectado. Para desligar o DualSense direto, use as Opções.', 'info', 5000);
  $('#jogo-touchpad').click();
});
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

// ------------------------------------------------------------------ ligar e desligar o modo jogo
controle.onJogo = (v, key) => {
  const sh = v ? acharTela(key)?.sh : null;
  if (v) {
    padVirtual.ligar(key);
    fisico.ligar(key, sh?.titulo);
  } else fisico.desligar();
  if (v && isTouch) toqueJogo.mostrar(key, sh?.titulo);
  else toqueJogo.esconder();
  const layout = sh ? layoutDa(sh) : null;
  if (layout === 'ps5' && ajustes.dualsense && !isTouch) touchpad.ligar().then(atualizarBotaoTouchpad);
  else touchpad.desligar();
  // no celular o teclado e a legenda não valem: quem joga é o controle de toque (ou um de verdade)
  const virtual = !isTouch && layout && LAYOUTS[layout]?.virtual ? layout : null;
  if (virtual) {
    padVirtual.acordar();
    tecladoPad.ligar(virtual);
  } else tecladoPad.desligar();
  mostrarLegenda(virtual);
  if (!v) {
    mapaPainel.fechar();
    padVirtual.desligar(); // depois do controle: o último estado é tudo solto
    if (!caindo && document.body.classList.contains('jogo-pc')) jogoNoPc(false); // caindo: a tela cheia espera a volta
  }
  jogoLa(v || null, key);
  // controle.jogo ainda vale aqui ao desligar (onJogo vem antes): a barra se acerta em seguida
  setTimeout(() => {
    atualizar();
    acertarTrava();
    if (!controle.jogo) document.activeElement?.blur?.();
  }, 0);
};
controle.onEscondeu = () => {
  toqueJogo.soltarTudo();
  fisico.soltarTudo();
  tecladoPad.soltarTudo();
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
    if (isTouch) screen.orientation?.unlock?.();
    return;
  }
  // celular: tela cheia deitada, sem teclado para travar nem mouse para prender
  if (isTouch) {
    try {
      if (document.fullscreenElement !== $('#focus')) await $('#focus').requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } catch { /* iPhone: sem tela cheia de elemento nem trava de giro; a página deitada já serve */ }
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
  document.body.classList.toggle('jogo-pc', !isTouch && !!document.fullscreenElement && !!controle.jogo);
  if (!document.fullscreenElement && queda) desistirDeVoltar(); // saiu da tela cheia esperando: só pelo botão
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
  if (soVerLan()) return void verOuAlugar();
  if (!deixarJogar()) return;
  entrarNoJogo(true); // sem avisos ao ligar (pedido do usuário em 2026-11-27)
}
// cheia: com a tela cheia e o teclado travado (só com um gesto, ou se a página já está em tela cheia)
function entrarNoJogo(cheia) {
  if (!controle.tem(video)) controle.adicionar(video, st.alvo.sh.key);
  controle.modoJogo(video, true);
  if (cheia) jogoNoPc(true);
}
function sairDoJogo() {
  esquecerJogo();
  controle.desligarJogo();
  jogoNoPc(false);
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
  else if (controle.jogo) sairDoJogo();
  else if (queda) desistirDeVoltar();
  else if (st.controlando) {
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
  alturaDoMenu(pop);
  for (const el of $$('#jogo-op-pop [data-op]')) el.checked = !!opcoesJogo.get(el.dataset.op);
  atualizarBotaoTouchpad();
});
addEventListener('resize', () => alturaDoMenu($('#jogo-op-pop')));
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
$('#jg-nitidez').checked = comRealce();
$('#jg-nitidez').addEventListener('change', (e) => {
  ajustes.nitidez = e.target.checked;
  gravarJSON(AJUSTES_CHAVE, ajustes);
  // o Turbo da TV não tem o realce: ligá-lo passa para o 1080p Turbo liso (o mesmo, com ele)
  if (ajustes.nitidez && presetAtual()?.semRealce) return void aplicarPreset(PRESET_INICIAL);
  if (ajustes.nitidez) realceVale = true;
  if (turboRecebe.ligado) ligarTurbo(); // o realce troca a tela: liga de novo
});
$('#jg-tratamento').checked = comTratamento();
$('#jg-tratamento').addEventListener('change', (e) => {
  ajustes.tratamento = e.target.checked;
  gravarJSON(AJUSTES_CHAVE, ajustes);
  if (ajustes.tratamento && presetAtual()?.semRealce) return void aplicarPreset(PRESET_INICIAL);
  if (ajustes.tratamento) realceVale = true;
  if (!turboRecebe.comTratamento(comTratamento())) ligarTurbo(); // a tela de agora não é WebGL
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
  mapaPainel.abrir(layoutDa(st.alvo?.sh) === 'switch' ? 'switch' : 'ps5');
});

volumes();
iniciar().catch((err) => {
  console.error('[jogar]', err);
  toast('Não deu para conectar. Recarregue a página.', 'error', 15000);
});
