// Sala 3D — servidor de sinalização (WebRTC), estado da sala, telão sincronizado e parkour.
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const compression = require('compression');
const { paginaInicial, moduloVersionado, PREFIXO_THREE, THREE_DIR, PREFIXO_SIO, SIO_DIR } = require('./pagina.js');
const { execFile } = require('child_process');
const crypto = require('crypto');
const banco = require('./banco');
// a planta do escritório é a mesma do navegador (public/js/escritorio.js); carrega em main()
let ESCRITORIO = null;

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const USE_HTTPS = process.argv.includes('--https') || process.env.HTTPS === '1';
const SHARE_SLOTS = 4;
const MAX_CHAT = 60;
const MAX_PHOTO = 60_000; // data URL da foto do rosto (128x128 jpeg dá ~12 kB)
const PUNCH_RANGE = 4.5; // metros: folga sobre o alcance real, só para barrar absurdo
// armas da camiseta 22 (public/js/armas-dados.js, lido no main()): cadência, alcance e chumbos
// de cada uma. O servidor aceita 15% de folga na cadência (a rede não entrega no compasso exato).
let ARMAS = { pistola: { cadencia: 0.3, alcance: 70, chumbos: 1 } };
const armaDe = (u) => (Object.hasOwn(ARMAS, u.arma) ? ARMAS[u.arma] : ARMAS.pistola);
const SHIRTS = ['none', 'lula', 'bolsonaro'];
let PERSONAGENS = ['padrao']; // ids do catálogo (public/js/personagens.js), lido no main()
const VOLTA_MIN = 6; // segundos: abaixo disso é atravessar a pista, não dar a volta
const VOLTA_MAX = 600;
// Versão deste servidor (no Render, o commit do deploy), que vai no "join". A página que reconecta
// e encontra outra versão recarrega, em vez de seguir com o código velho falando com o servidor novo.
// O commit e não a hora da partida: o plano grátis dorme e acorda sem nada ter mudado.
const VERSAO = process.env.RENDER_GIT_COMMIT?.slice(0, 12) || Date.now().toString(36);

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

// STUN público + TURN. Sem TURN, amigos em redes diferentes (CGNAT da fibra, 4G, Brave) ficam
// com a tela preta e sem voz: a conexão direta não fecha. O padrão é a conta grátis da Metered
// do dono da sala (20 GB/mês); TURN_URL/TURN_USER/TURN_PASS no ambiente trocam por outro.
// A senha do TURN não é segredo de verdade: ela vai para o navegador de todo mundo na sala.
const METERED = 'global.relay.metered.ca';
const TURN = {
  urls: (process.env.TURN_URL || `turn:${METERED}:80,turn:${METERED}:80?transport=tcp,turn:${METERED}:443,turns:${METERED}:443?transport=tcp`).split(','),
  username: process.env.TURN_USER || 'e78fbefbb1d65a8ea146708b',
  credential: process.env.TURN_PASS || 'syadTyT5gu9HJnrT',
};
const iceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  TURN,
];

const app = express();
// Sem isto o navegador baixa tudo cru: só o three.js são 662 kB, e o cabeçalho
// JSON dos modelos 3D comprime a mais de 5x.
app.use(compression());
// Modo ao vivo (só rodando no seu PC, nunca no Render): quando um arquivo de public/ muda, quem
// está com a sala aberta no localhost recebe o nome dele por /dev-recarregar e a página se
// atualiza sozinha (CSS troca na hora; o resto recarrega e volta para a sala). O "boot" muda
// quando o servidor reinicia (npm run dev = node --watch): aí a página também recarrega.
if (!(process.env.RENDER || process.env.NODE_ENV === 'production')) {
  const boot = Date.now().toString(36);
  const ouvintesDev = new Set();
  let pendente = null;
  try {
    // no Windows o fs.watch avisa até quando um arquivo só é lido: confere se o conteúdo mudou
    const assinaturas = new Map();
    fs.watch(path.join(__dirname, 'public'), { recursive: true }, (_ev, nome) => {
      if (!nome || /(^|[\\/])\.|~$|\.tmp$/.test(nome)) return;
      let assinatura;
      try {
        const st = fs.statSync(path.join(__dirname, 'public', nome));
        if (!st.isFile()) return;
        assinatura = `${st.size}:${st.mtimeMs}`;
      } catch {
        return;
      }
      const antes = assinaturas.get(nome);
      assinaturas.set(nome, assinatura);
      if (antes === undefined) {
        // primeira notícia deste arquivo: só conta se ele mudou há pouco (não é uma leitura)
        if (Date.now() - Number(assinatura.split(':')[1]) > 3000) return;
      } else if (antes === assinatura) return;
      clearTimeout(pendente);
      pendente = setTimeout(() => {
        const msg = `data: ${String(nome).replace(/\\/g, '/')}\n\n`;
        for (const res of ouvintesDev) { res.write(msg); res.flush?.(); }
      }, 250);
    });
  } catch (err) {
    console.warn('[ao vivo] não deu para vigiar public/', err.message);
  }
  app.get('/dev-recarregar', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.flushHeaders?.();
    res.write(`event: boot\ndata: ${boot}\n\n`);
    res.flush?.();
    ouvintesDev.add(res);
    req.on('close', () => ouvintesDev.delete(res));
  });
}

// a página inicial vai montada (ver pagina.js): com a lista de scripts para baixar de uma vez
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(paginaInicial());
});
// nossos módulos em produção, com os imports versionados (ver pagina.js): pedido com a
// impressão certa fica um ano no cache; sem ela, o navegador confere a cada visita
app.get('/js/:arquivo', (req, res, next) => {
  const m = moduloVersionado(req.path);
  if (!m) return next();
  res.set('Cache-Control', req.query.v === m.hash ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.type('application/javascript').send(m.codigo);
});
app.use(express.static(path.join(__dirname, 'public'), {
  // modelos 3D e miniaturas quase nunca mudam: um dia sem nem perguntar ao servidor
  setHeaders: (res, arq) => {
    if (/[\\/](models|img)[\\/]/.test(arq)) res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
// three.js com a versão no endereço: pode ficar um ano no cache (versão nova = endereço novo)
app.use(PREFIXO_THREE, express.static(THREE_DIR, { immutable: true, maxAge: '365d' }));
app.use('/vendor/three', express.static(THREE_DIR)); // endereço sem versão (scripts/miniaturas.js)
// O cliente do socket.io também, e a página aponta para ele (ver pagina.js). O /socket.io/socket.io.js
// do próprio socket.io continua no ar para as abas e caches de antes, mas ele pergunta "mudou?" a cada visita.
app.use(PREFIXO_SIO, express.static(SIO_DIR, { immutable: true, maxAge: '365d' }));
// players de HLS (.m3u8) e DASH (.mpd): só são baixados quando alguém cola um link desses
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist')));
app.use('/vendor/dash', express.static(path.join(__dirname, 'node_modules', 'dashjs', 'dist', 'modern', 'esm')));
// detector de rosto da webcam (public/js/rosto.js): só baixa quando alguém liga a câmera
app.use('/vendor/mediapipe', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision'), { maxAge: '1d' }));
// A extensão de controle para baixar (guia de instalação da sala). O .zip é montado aqui mesmo a
// partir da pasta extensao/, uma vez só. Os arquivos ficam na raiz do .zip: o "Extrair tudo" do
// Windows já cria a pasta "sala3d-extensao" com o manifest.json dentro — com uma pasta a mais lá
// dentro, o Chrome reclamaria que não acha o manifesto.
let extensaoZip = null;
app.get('/sala3d-extensao.zip', (_req, res) => {
  try {
    extensaoZip ??= zipDaPasta(path.join(__dirname, 'extensao'));
  } catch (err) {
    console.warn('[extensão] não deu para montar o .zip', err);
    return res.status(500).send('Não deu para montar a extensão.');
  }
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="sala3d-extensao.zip"' });
  res.send(extensaoZip);
});

// Antes de entrar: a sala tem senha? Com a senha certa (ou um passe ainda válido) devolve o passe
// que o "join" do socket exige. É POST para a senha não ficar no log de endereços.
app.post('/sala-acesso', express.json({ limit: '2kb' }), async (req, res) => {
  const b = obj(req.body);
  const id = idDaSala(b.sala);
  // sala que ainda não existia e ninguém chegou a entrar: some como as que esvaziam
  if (!rooms.has(id)) setTimeout(() => { if (rooms.get(id)?.users.size === 0) rooms.delete(id); }, 30 * 60 * 1000);
  const sala = getRoom(id);
  await carregarSala(sala);
  if (!sala.entradaHash) return res.json({ ok: true, protegida: false });
  if (b.passe && passeValido(sala, b.passe)) return res.json({ ok: true, protegida: true, passe: passeDa(sala) });
  if (!b.senha) return res.json({ ok: false, protegida: true });
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (bloqueado(ip)) return res.json({ ok: false, protegida: true, erro: 'Muitas tentativas. Espere alguns minutos.' });
  if (typeof b.senha !== 'string' || b.senha.length > 100 || !confereSenha(b.senha, sala.entradaHash)) {
    podeTentar(ip);
    return res.json({ ok: false, protegida: true, erro: 'Senha da sala errada.' });
  }
  res.json({ ok: true, protegida: true, passe: passeDa(sala) });
});

// Lista lateral de salas (salas.js): quantas pessoas há em cada sala que a pessoa já visitou.
// Os nomes de quem está dentro só vão para salas abertas ou para quem tem o passe da sala.
// Só consulta o que já está na memória: sala que ninguém abriu desde o reinício tem 0 pessoas.
app.post('/salas-status', express.json({ limit: '8kb' }), (req, res) => {
  const b = obj(req.body);
  const passes = obj(b.passes);
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).slice(0, 30).map(idDaSala))];
  res.json({
    salas: ids.map((id) => {
      const room = rooms.get(id);
      if (!room?.config) return { id, pessoas: 0 };
      const pode = passeValido(room, passes[id]);
      return {
        id,
        pessoas: room.users.size,
        temSenha: !!room.entradaHash,
        empresa: room.config.empresa || '',
        nomes: pode ? [...room.users.values()].slice(0, 8).map((u) => ({ nome: u.name, cor: u.color })) : [],
      };
    }),
  });
});

app.get('/config', (_req, res) => res.json({
  iceServers,
  shareSlots: SHARE_SLOTS,
  browser: BROWSER && { ...BROWSER, sites: BROWSER_SITES.map(({ id, label, url }) => ({ id, label, host: new URL(url).hostname })) },
}));

// ---------------------------------------------------------------- estado das salas
const rooms = new Map();

// presença (status) de cada pessoa; PARADO = não está trabalhando (os gestores são avisados)
const STATUS = ['disponivel', 'ocupado', 'reuniao', 'pausa', 'almoco', 'ausente'];
const PARADO = ['pausa', 'almoco', 'ausente'];
const NOMES_STATUS = { disponivel: 'Disponível', ocupado: 'Ocupado', reuniao: 'Em reunião', pausa: 'Em pausa', almoco: 'No almoço', ausente: 'Ausente' };

// ---------------------------------------------------------------- salas ao vivo (saguão)
// No jeito do Discord: o saguão e a coluna de salas mostram, em tempo real, todas as salas com
// gente agora e quem está em cada uma. Vai por Server-Sent Events (/ao-vivo): uma conexão que o
// servidor mantém aberta e onde empurra a lista nova sempre que alguém entra, sai ou muda a sala.
// Sala que o dono tirou da lista não aparece; sala com senha mostra só quantas pessoas, sem nomes.
const ouvintesLobby = new Set();
// o compression() segura o que é escrito até juntar bastante: flush() manda na hora
const mandar = (res, txt) => { res.write(txt); res.flush?.(); };
function salasAoVivo() {
  const lista = [];
  for (const room of rooms.values()) {
    if (!room.config || !room.users.size || room.config.listada === false) continue;
    const fechada = !!room.entradaHash;
    lista.push({
      id: room.id,
      empresa: room.config.empresa || '',
      modulo: room.config.departamentos?.length && room.config.modulo === 'escritorio' ? 'escritorio' : 'lazer',
      pessoas: room.users.size,
      temSenha: fechada,
      nomes: fechada ? [] : [...room.users.values()].slice(0, 12).map((u) => ({ nome: u.name, cor: u.color, status: u.inativo ? 'inativo' : u.status })),
    });
  }
  lista.sort((a, b) => b.pessoas - a.pessoas || a.id.localeCompare(b.id));
  return { salas: lista, pessoas: lista.reduce((s, x) => s + x.pessoas, 0) };
}
let timerLobby = null;
function lobbyMudou() {
  if (timerLobby || !ouvintesLobby.size) return;
  timerLobby = setTimeout(() => {
    timerLobby = null;
    const dados = `data: ${JSON.stringify(salasAoVivo())}\n\n`;
    for (const res of ouvintesLobby) mandar(res, dados);
  }, 400);
}
app.get('/ao-vivo', (req, res) => {
  if (ouvintesLobby.size >= 2000) return res.status(503).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  mandar(res, `retry: 4000\ndata: ${JSON.stringify(salasAoVivo())}\n\n`);
  ouvintesLobby.add(res);
  // comentário a cada 25 s: proxies (Render, Caddy) não derrubam a conexão parada
  const vivo = setInterval(() => mandar(res, ': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(vivo);
    ouvintesLobby.delete(res);
  });
});


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
// Carteira por nome (minúsculo), guardada pelo banco.js (MySQL, ou dados/moedas.json sem ele).
// Quem chega pela primeira vez ganha MOEDAS_INICIAIS. A memória é o cache: lê do banco ao entrar
// e grava a cada mudança.
const MOEDAS_INICIAIS = 100;
const carteiras = new Map();
const chaveNome = (nome) => String(nome).trim().toLowerCase();
async function carregarCarteira(nome) {
  const k = chaveNome(nome);
  if (!carteiras.has(k)) {
    let saldo = MOEDAS_INICIAIS;
    try {
      saldo = await banco.lerSaldo(k, MOEDAS_INICIAIS);
    } catch (err) {
      console.warn('[banco] lendo moedas', err.code || err.message);
    }
    if (!carteiras.has(k)) carteiras.set(k, saldo); // outra conexão pode ter chegado antes
  }
  return carteiras.get(k);
}
const saldoDe = (nome) => carteiras.get(chaveNome(nome)) ?? MOEDAS_INICIAIS;
function mudarSaldo(nome, delta) {
  const novo = Math.max(0, saldoDe(nome) + Math.round(delta));
  carteiras.set(chaveNome(nome), novo);
  banco.guardarSaldo(chaveNome(nome), novo);
  return novo;
}

// ------------------------------------------------------------------ salas das empresas
// Cada sala pode ter um dono (senha) que escolhe o modo — Lazer (o cinema) ou Escritório, com os
// departamentos que a empresa tem —, quais jogos aparecem, o nome da empresa e o placar de metas
// do Comercial. Guardado pelo banco.js.
const MODULOS = ['lazer', 'escritorio'];
// clima e hora do dia (public/js/clima.js): auto/ciclo = muda sozinho, igual para todos
const CLIMAS_SALA = ['auto', 'sol', 'nublado', 'chuva', 'tempestade'];
const HORARIOS_SALA = ['ciclo', 'manha', 'dia', 'tarde', 'noite'];
const JOGOS_SALA = ['parkour', 'ringue', 'corrida', 'xadrez', 'dama', 'velha', 'dados', 'poderes', 'armas'];
const configPadrao = () => ({
  modulo: 'lazer',
  departamentos: [],
  jogos: Object.fromEntries(JOGOS_SALA.map((j) => [j, true])),
  empresa: '',
  placar: { titulo: 'Metas do mês', itens: [] },
  clima: 'auto',
  horario: 'ciclo',
  aviso: '', // comunicado da empresa: faixa no topo para todo mundo
  privacidade: true, // escritório: voz só dentro da mesma sala de departamento
  listada: true, // aparece na lista de salas ao vivo do saguão
  logo: '', // logo da empresa (data URL)
  paginas: {}, // página fixa por tela: { "ti:4": "https://..." } (ver chaveDaTela em escritorio.js)
});

// Páginas fixas: só endereço http(s), em chave de tela válida, até 24 telas
function limparPaginas(raw) {
  const saida = {};
  for (const [chave, valor] of Object.entries(obj(raw)).slice(0, 24)) {
    if (!/^[a-z]{2,20}:\d{1,2}$/.test(chave)) continue;
    try {
      const u = new URL(cleanText(valor, 500));
      if (u.protocol === 'https:' || u.protocol === 'http:') saida[chave] = u.href;
    } catch { /* não é endereço */ }
  }
  return saida;
}

// o que vier do cliente (ou do banco) passa por aqui antes de valer
function limparConfig(raw, base = configPadrao()) {
  const c = obj(raw);
  const jogos = obj(c.jogos);
  const placar = obj(c.placar);
  // ambiente antigo (um setor só, na frente do cinema) vira o escritório com aquele setor
  const antigo = ['ti', 'comercial', 'reuniao'].includes(c.modulo);
  const limpar = ESCRITORIO?.limparDepartamentos ?? (() => []);
  return {
    modulo: antigo ? 'escritorio' : MODULOS.includes(c.modulo) ? c.modulo : base.modulo,
    departamentos: antigo ? [c.modulo] : c.departamentos === undefined ? base.departamentos : limpar(c.departamentos),
    jogos: Object.fromEntries(JOGOS_SALA.map((j) => [j, typeof jogos[j] === 'boolean' ? jogos[j] : base.jogos[j]])),
    empresa: typeof c.empresa === 'string' ? cleanText(c.empresa, 40) : base.empresa,
    clima: CLIMAS_SALA.includes(c.clima) ? c.clima : base.clima || 'auto',
    horario: HORARIOS_SALA.includes(c.horario) ? c.horario : base.horario || 'ciclo',
    aviso: typeof c.aviso === 'string' ? cleanText(c.aviso, 200) : base.aviso ?? '',
    privacidade: typeof c.privacidade === 'boolean' ? c.privacidade : base.privacidade ?? true,
    listada: typeof c.listada === 'boolean' ? c.listada : base.listada ?? true,
    // logo da empresa (data URL de imagem já reduzida no navegador); '' tira
    logo: c.logo === '' ? '' : typeof c.logo === 'string' ? cleanLogo(c.logo) ?? base.logo ?? '' : base.logo ?? '',
    paginas: c.paginas === undefined ? base.paginas ?? {} : limparPaginas(c.paginas),
    placar: c.placar === undefined ? base.placar : {
      titulo: cleanText(placar.titulo, 40) || 'Metas do mês',
      itens: (Array.isArray(placar.itens) ? placar.itens : []).slice(0, 12).map((it) => ({
        nome: cleanText(obj(it).nome, 24),
        valor: Math.max(0, Math.min(1e12, Number(obj(it).valor) || 0)),
        meta: Math.max(0, Math.min(1e12, Number(obj(it).meta) || 0)),
      })).filter((it) => it.nome),
    },
  };
}

// lê a configuração uma vez por sala (várias pessoas entrando juntas esperam a mesma leitura)
function carregarSala(room) {
  room.carregando ??= banco.lerSala(room.id).then((s) => {
    room.config = limparConfig(s?.config || {});
    room.senhaHash = s?.senhaHash || null;
    room.entradaHash = s?.config?.entradaHash || null; // vem junto da config, mas não vai para ninguém
    room.gestorHash = s?.config?.gestorHash || null; // senha de gestor (alertas da equipe), idem
    ajustarTelas(room); // cada departamento do escritório tem as suas telas
  }).catch((err) => {
    console.warn('[banco] lendo sala', room.id, err.code || err.message);
    room.config = configPadrao();
    room.senhaHash = null;
    room.entradaHash = null;
    room.gestorHash = null;
    room.carregando = null; // tenta ler de novo na próxima entrada
  });
  return room.carregando;
}

const salaPublica = (room) => ({ ...room.config, temDono: !!room.senhaHash, temSenha: !!room.entradaHash, temGestor: !!room.gestorHash });
// a senha de entrada viaja dentro do JSON da config (sem mudar a tabela); a pública não a leva
const guardarSala = (room) => banco.salvarSala(room.id, { ...room.config, entradaHash: room.entradaHash || undefined, gestorHash: room.gestorHash || undefined }, room.senhaHash);
const idDaSala = (raw) => cleanText(raw, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'principal';

// Senha de entrada (opcional). Quem acerta recebe um "passe" — o HMAC da sala com a senha atual —
// que o navegador guarda: recarregar a página ou reconectar não pede a senha de novo. Trocar a
// senha invalida os passes antigos (quem está dentro recebe o novo na hora).
const SEGREDO_PASSE = process.env.PASSE_SECRET || crypto.randomBytes(32).toString('hex');
const passeDa = (room) => crypto.createHmac('sha256', SEGREDO_PASSE).update(`${room.id}|${room.entradaHash}`).digest('hex').slice(0, 32);
function passeValido(room, passe) {
  if (!room.entradaHash) return true;
  const certo = Buffer.from(passeDa(room));
  const veio = Buffer.from(String(passe || ''));
  return veio.length === certo.length && crypto.timingSafeEqual(veio, certo);
}
const jogoLigado = (room, jogo) => room?.config?.jogos?.[jogo] !== false;

// senha do dono: scrypt com sal, nunca a senha em si
function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${crypto.scryptSync(senha, sal, 32).toString('hex')}`;
}
function confereSenha(senha, hash) {
  const [tipo, sal, h] = String(hash || '').split('$');
  if (tipo !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'hex');
  const veio = crypto.scryptSync(senha, Buffer.from(sal, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, veio);
}
// tentativas de senha por endereço: 6 a cada 5 minutos
const tentativas = new Map();
const bloqueado = (ip) => (tentativas.get(ip) || []).filter((t) => Date.now() - t < 5 * 60_000).length >= 6;
function podeTentar(ip) {
  const agora = Date.now();
  const lista = (tentativas.get(ip) || []).filter((t) => agora - t < 5 * 60_000);
  lista.push(agora);
  tentativas.set(ip, lista);
  return lista.length <= 6;
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
      seq: 0, // último número dado a quem entrou: o "n" que identifica a pessoa no lote de posições
      mudou: new Map(), // n -> pessoa que mandou posição desde o último lote
      legado: 0, // abas de antes do lote, na sala "<id>:legado"
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
  // barra de navegação da aba: voltar, avançar, recarregar ou abrir um endereço (só http/https)
  if (e.t === 'nav') {
    if (['voltar', 'avancar', 'recarregar'].includes(e.a)) return { t: 'nav', a: e.a };
    const url = enderecoWeb(e.url);
    return e.a === 'abrir' && url ? { t: 'nav', a: 'abrir', url } : null;
  }
  return null;
}

// ZIP mínimo (deflate), só o que o "Extrair tudo" do Windows e o Chrome precisam.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipDaPasta(raiz) {
  const zlib = require('zlib');
  const arquivos = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else arquivos.push(p);
    }
  };
  andar(raiz);
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  const locais = [];
  const centrais = [];
  let pos = 0;
  for (const arq of arquivos.sort()) {
    const nome = Buffer.from(path.relative(raiz, arq).split(path.sep).join('/'), 'utf8');
    const dados = fs.readFileSync(arq);
    const comp = zlib.deflateRawSync(dados, { level: 9 });
    const crc = crc32(dados);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(20, 4); // versão para extrair
    loc.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    loc.writeUInt16LE(8, 8); // deflate
    loc.writeUInt16LE(hora, 10);
    loc.writeUInt16LE(dia, 12);
    loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18);
    loc.writeUInt32LE(dados.length, 22);
    loc.writeUInt16LE(nome.length, 26);
    loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); // feito com
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(hora, 12);
    cen.writeUInt16LE(dia, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(dados.length, 24);
    cen.writeUInt16LE(nome.length, 28);
    cen.writeUInt32LE(pos, 42); // onde começa o cabeçalho local
    locais.push(loc, nome, comp);
    centrais.push(cen, nome);
    pos += loc.length + nome.length + comp.length;
  }
  const central = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(central.length, 12);
  fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, central, fim]);
}

function enderecoWeb(raw) {
  try {
    const u = new URL(String(raw ?? '').slice(0, 2000));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
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
    id: u.id, n: u.n, name: u.name, color: u.color, mic: u.mic, cam: u.cam,
    shares: [...u.shares.values()],
    posto: u.posto,
    status: u.status, inativo: u.inativo, gestor: u.gestor, desde: u.statusDesde,
    p: u.p, r: u.r, a: u.a, photo: u.photo, shirt: u.shirt, char: u.char, arma: u.arma, health: u.health, ko: u.ko, moedas: u.moedas,
  };
}

// logo da empresa: o mesmo filtro da foto, com mais espaço (o navegador reduz para 512 px)
const MAX_LOGO = 160_000;
const cleanLogo = (value) => cleanPhoto(value, MAX_LOGO);

// Aceita só data URL de imagem, com tamanho limitado.
function cleanPhoto(value, max = MAX_PHOTO) {
  if (typeof value !== 'string') return null;
  if (value.length > max) return null;
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

// Número vindo do cliente. Só converte valor simples: o Number() de uma lista aninhada mil vezes
// desce recursivo (toString/join) até estourar a pilha, e isso dentro de um handler derruba o
// processo — a sala inteira cai por um pacote de 40 KB.
const simples = (x) => x === null || typeof x !== 'object';
const num = (x) => (simples(x) ? Number(x) || 0 : 0);
// ponto [x, y, z] vindo do cliente: três números finitos, senão null
const ponto = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => simples(n) && Number.isFinite(Number(n))) ? v.map(Number) : null);
// O mesmo vale para todo handler (Number, String, template): pacote com lista ou objeto aninhado
// fundo demais é descartado na entrada (ver socket.use). Nenhuma mensagem do app passa de uns 5
// níveis; binário (Buffer) não é percorrido.
const fundoDemais = (v, n = 0) => {
  if (simples(v) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return false;
  if (n > 32) return true;
  for (const k in v) if (fundoDemais(v[k], n + 1)) return true;
  return false;
};

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

// As telas da sala: no Lazer, as 4 da parede do cinema; no escritório, as de parede de cada
// departamento, na ordem das salas, e depois os 3 monitores de cada posto de trabalho (a mesma
// planta que o navegador desenha). parede: quantas são de parede — as dos postos são só do dono.
function layoutTelas(cfg) {
  if (cfg?.modulo === 'escritorio' && cfg.departamentos?.length && ESCRITORIO) {
    const p = ESCRITORIO.planta(cfg.departamentos);
    return {
      total: p.totalTelas,
      parede: p.telasParede,
      salaDa: (i) => ESCRITORIO.comTelas(p).find((s) => i >= s.primeiraTela && i < s.primeiraTela + s.telas)?.id ?? null,
      faixa: (id) => ESCRITORIO.faixaDeTelas(p, id),
      temSala: (id) => ESCRITORIO.comTelas(p).some((s) => s.id === id),
      postoDa: (i) => ESCRITORIO.postoDaTela(p, i)?.id ?? null,
      faixaPosto: (id) => ESCRITORIO.faixaDoPosto(p, id),
      chaveDa: (i) => ESCRITORIO.chaveDaTela(p, i),
    };
  }
  return {
    total: SHARE_SLOTS, parede: SHARE_SLOTS, salaDa: () => null, faixa: () => [0, SHARE_SLOTS], temSala: () => false,
    postoDa: () => null, faixaPosto: () => null, chaveDa: (i) => `cinema:${i + 1}`,
  };
}

const salaDoPosto = (id) => String(id).split('-')[0];

function donoDoPosto(room, id) {
  for (const u of room.users.values()) if (u.posto === id) return u;
  return null;
}

// Sentou num posto livre: fica com ele. Vão para os 3 monitores as telas que estavam no posto
// antigo, nas telas de parede da sala do posto ou só no telão (nessa ordem, enquanto couber).
// Devolve os compartilhamentos que mudaram de tela, de quem forem.
function pegarPosto(room, user, id) {
  const layout = layoutTelas(room.config);
  const antigo = user.posto ? layout.faixaPosto(user.posto) : null;
  const naFaixa = (slot, f) => slot != null && !!f && slot >= f[0] && slot < f[1];
  const sala = salaDoPosto(id);
  const ordem = (sh) => (naFaixa(sh.slot, antigo) ? 0 : sh.slot != null ? 1 : 2);
  const levar = [...user.shares.values()]
    .filter((sh) => sh.slot == null || naFaixa(sh.slot, antigo) || layout.salaDa(sh.slot) === sala)
    .sort((a, b) => ordem(a) - ordem(b));
  user.posto = id;
  const faixa = layout.faixaPosto(id);
  const mudaram = [];
  for (const sh of levar) {
    const livre = telaLivre(room, faixa);
    if (livre === -1) break;
    if (sh.slot != null && room.slots[sh.slot] === sh.key) room.slots[sh.slot] = null;
    sh.slot = livre;
    room.slots[livre] = sh.key;
    mudaram.push({ user, share: sh });
  }
  // o que sobrou no posto antigo (não coube) volta para uma tela de parede ou para o telão
  for (const sh of user.shares.values()) {
    if (!naFaixa(sh.slot, antigo)) continue;
    room.slots[sh.slot] = null;
    const livre = telaLivre(room, [0, layout.parede]);
    sh.slot = livre === -1 ? null : livre;
    if (livre !== -1) room.slots[livre] = sh.key;
    mudaram.push({ user, share: sh });
  }
  for (let t = encaixarSemTela(room); t; t = encaixarSemTela(room)) mudaram.push(t);
  return mudaram;
}

// primeira tela livre entre [a, b). Tela com página fixa não conta como livre: o compartilhamento
// só vai para ela se a pessoa escolher aquela tela.
function telaLivre(room, [a, b]) {
  const paginas = room.config?.paginas;
  const chaveDa = paginas && Object.keys(paginas).length ? layoutTelas(room.config).chaveDa : null;
  for (let i = a; i < b; i++) if (room.slots[i] === null && !(chaveDa && paginas[chaveDa(i)])) return i;
  return -1;
}

// Mudou o modo ou os departamentos: refaz as telas. Cada compartilhamento tenta ficar no mesmo
// departamento, senão vai para qualquer tela livre, senão para o telão. Devolve as chaves que
// mudaram de tela (para avisar todo mundo).
function ajustarTelas(room, antes = layoutTelas(null)) {
  const depois = layoutTelas(room.config);
  // posto que deixou de existir (tirou o departamento, voltou para o Lazer): fica sem posto
  for (const u of room.users.values()) if (u.posto && !depois.faixaPosto(u.posto)) u.posto = null;
  const telas = [];
  for (const u of room.users.values()) {
    for (const sh of u.shares.values()) {
      if (sh.slot == null) continue;
      const posto = antes.postoDa(sh.slot);
      // tela de um posto: continua no posto (se ainda é dele); senão, na sala do posto
      telas.push({ sh, era: sh.slot, posto: posto && u.posto === posto ? posto : null, sala: posto ? salaDoPosto(posto) : antes.salaDa(sh.slot) });
    }
  }
  telas.sort((a, b) => a.era - b.era);
  room.slots = new Array(depois.total).fill(null);
  const mudaram = [];
  for (const t of telas) {
    let slot = t.posto ? telaLivre(room, depois.faixaPosto(t.posto)) : -1;
    if (slot === -1 && depois.temSala(t.sala)) slot = telaLivre(room, depois.faixa(t.sala));
    if (slot === -1) slot = telaLivre(room, [0, depois.parede]);
    t.sh.slot = slot === -1 ? null : slot;
    if (slot !== -1) room.slots[slot] = t.sh.key;
    if (t.sh.slot !== t.era) mudaram.push(t.sh.key);
  }
  // quem estava só no telão ganha uma tela, se sobrou
  for (let t = encaixarSemTela(room); t; t = encaixarSemTela(room)) mudaram.push(t.share.key);
  return mudaram;
}

// liberou uma tela: o compartilhamento que estava só no telão ganha ela
function encaixarSemTela(room) {
  const t = semTela(room);
  const livre = t ? telaLivre(room, [0, layoutTelas(room.config).parede]) : -1;
  if (!t || livre === -1) return null;
  t.share.slot = livre;
  room.slots[livre] = t.share.key;
  return t;
}

function attachSockets(io) {
  // alerta para os gestores que estão na sala (menos a própria pessoa)
  function avisarGestores(room, user, tipo, texto) {
    for (const u of room.users.values()) {
      if (u.gestor && u.id !== user.id) io.to(u.id).emit('alerta-gestor', { tipo, texto, id: user.id, nome: user.name, cor: user.color });
    }
  }

  // Posições em lote: a cada 30 ms, uma mensagem por sala com quem se mexeu desde a última,
  // 'states' = [n, x, y, z, r, a, s, n, ...], codificada uma vez só. Antes cada 'state' virava uma
  // mensagem para cada um dos outros: com 50 pessoas andando eram ~32 mil por segundo, e cada uma
  // é uma tarefa no navegador de quem recebe. Volátil: numa rede ruim o lote cai em vez de
  // enfileirar posição velha, e quem está parado repete a sua a cada 1 s (é o que cura um lote
  // perdido). Uns 30 ms e não 66: as pessoas mandam a 15 Hz, e com 66 cada boneco chegaria em
  // degraus de 66 e 133 ms. E 30, não 33: no Windows (npm run publico) o relógio anda de 15,6 em
  // 15,6 ms, e um intervalo de 33 vira 47.
  setInterval(() => {
    for (const room of rooms.values()) {
      if (!room.mudou.size) continue;
      // sozinho na sala, ou só abas de antes do lote: ninguém para receber
      if (room.users.size < 2 || room.legado >= room.users.size) {
        room.mudou.clear();
        continue;
      }
      const lote = [];
      let quem = null;
      for (const u of room.mudou.values()) {
        lote.push(u.n, u.p[0], u.p[1], u.p[2], u.r, u.a, u.s);
        quem = u;
      }
      // um só se mexeu: ele não precisa da própria posição. As abas antigas recebem 'state'.
      const fora = room.mudou.size === 1 ? [quem.id] : [];
      if (room.legado) fora.push(`${room.id}:legado`);
      room.mudou.clear();
      io.to(room.id).except(fora).volatile.emit('states', lote);
    }
  }, 30);

  io.on('connection', (socket) => {
    let room = null;
    let user = null;
    // sem chamar o next o pacote some, sem chegar a nenhum handler (ver fundoDemais)
    socket.use((pacote, next) => {
      if (!fundoDemais(pacote)) next();
    });

    let entrando = false;
    let dono = false; // esta conexão provou ser o dono da sala (senha)
    socket.on('join', async (data, ack) => {
      if (room || entrando) return;
      entrando = true;
      const roomId = idDaSala(data?.room);
      const nome = cleanText(data?.name, 20) || 'Visitante';
      // configuração da sala e carteira vêm do banco: espera antes de entrar
      const sala = getRoom(roomId);
      await Promise.all([carregarSala(sala), carregarCarteira(nome)]);
      if (!socket.connected) return;
      // sala com senha: só entra com o passe (ver /sala-acesso)
      if (!passeValido(sala, data?.passe)) {
        entrando = false;
        return ack?.({ erro: 'senha' });
      }
      room = sala;
      user = {
        id: socket.id,
        n: ++room.seq, // curto e nunca repetido na sala: é ele que vai no lote de posições
        name: nome,
        color: /^#[0-9a-f]{6}$/i.test(data?.color) ? data.color : '#7c9cff',
        mic: !!data?.mic,
        cam: cleanText(data?.cam, 80) || null, // id do stream da webcam (vai no rosto do boneco)
        shares: new Map(), // chave -> { key, slot, streamId }
        shareSeq: 0,
        photo: cleanPhoto(data?.photo),
        shirt: SHIRTS.includes(data?.shirt) ? data.shirt : 'none',
        char: PERSONAGENS.includes(data?.char) ? data.char : 'padrao',
        arma: Object.hasOwn(ARMAS, data?.arma ?? '') ? data.arma : 'pistola',
        health: 1,
        ko: false,
        ultimoDado: 0,
        posto: null, // posto de trabalho do escritório ("ti-3"), se sentou num
        status: STATUS.includes(data?.status) ? data.status : 'disponivel', // presença escolhida
        inativo: false, // sem mexer em nada há um tempo (o navegador avisa)
        statusDesde: Date.now(),
        gestor: false, // provou a senha de gestor (ou de dono): recebe os alertas da equipe
        ultimoChamado: 0,
        p: [0, 0, -4], r: Math.PI, a: 0, s: 0,
      };
      user.moedas = saldoDe(user.name);
      room.users.set(socket.id, user);
      socket.join(roomId);
      // aba aberta antes do lote de posições (join sem proto): não entende o 'states' e continua
      // recebendo um 'state' por posição. Só existe para a passagem de versão.
      if (!data?.proto) {
        user.legado = true;
        room.legado++;
        socket.join(`${roomId}:legado`);
      }

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
        sala: salaPublica(room),
        passe: room.entradaHash ? passeDa(room) : null,
        versao: VERSAO,
      });
      socket.to(roomId).emit('user-joined', publicUser(user));
      avisarGestores(room, user, 'entrou', `${user.name} entrou no sistema`);
      lobbyMudou();
    });

    // ---------------------------------------------------------- dono da sala
    // Sala sem dono: quem chegar primeiro e criar a senha vira o dono. Com dono: só com a senha.
    const ipDe = () => String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '').split(',')[0].trim();
    const resposta = (ack) => (typeof ack === 'function' ? ack : () => {});
    const senhaValida = (s) => typeof s === 'string' && s.length >= 6 && s.length <= 100;

    socket.on('sala-dono', async (msg, ack) => {
      const r = resposta(ack);
      if (!room) return r({ ok: false, erro: 'Entre na sala primeiro.' });
      if (room.senhaHash) return r({ ok: false, erro: 'Esta sala já tem dono.' });
      const { senha } = obj(msg);
      if (!senhaValida(senha)) return r({ ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' });
      room.senhaHash = hashSenha(senha);
      try {
        await guardarSala(room);
      } catch (err) {
        room.senhaHash = null;
        console.warn('[banco] salvando dono', err.code || err.message);
        return r({ ok: false, erro: 'Não deu para guardar a senha agora. Tente de novo.' });
      }
      dono = true;
      virarGestor();
      r({ ok: true });
      io.to(room.id).emit('sala', salaPublica(room));
    });

    socket.on('sala-entrar', (msg, ack) => {
      const r = resposta(ack);
      if (!room?.senhaHash) return r({ ok: false, erro: 'Esta sala ainda não tem dono.' });
      if (!podeTentar(ipDe())) return r({ ok: false, erro: 'Muitas tentativas. Espere alguns minutos.' });
      const { senha } = obj(msg);
      if (!senhaValida(senha) || !confereSenha(senha, room.senhaHash)) return r({ ok: false, erro: 'Senha errada.' });
      dono = true;
      virarGestor();
      r({ ok: true });
    });

    // Gestores: quem tem a senha de gestor (ou é o dono) recebe os alertas da equipe — quem ficou
    // ausente, inativo, em pausa, voltou, entrou ou saiu do sistema.
    function virarGestor() {
      if (!user || user.gestor) return;
      user.gestor = true;
      io.to(room.id).emit('user-update', { id: user.id, gestor: true });
    }
    socket.on('sala-gestor', (msg, ack) => {
      const r = resposta(ack);
      if (!room?.gestorHash) return r({ ok: false, erro: 'O dono ainda não criou a senha de gestor.' });
      if (!podeTentar(ipDe())) return r({ ok: false, erro: 'Muitas tentativas. Espere alguns minutos.' });
      const { senha } = obj(msg);
      if (typeof senha !== 'string' || senha.length > 100 || !confereSenha(senha, room.gestorHash)) return r({ ok: false, erro: 'Senha de gestor errada.' });
      virarGestor();
      r({ ok: true });
    });
    socket.on('sala-gestor-senha', async (msg, ack) => {
      const r = resposta(ack);
      if (!room || !dono) return r({ ok: false, erro: 'Só o dono da sala muda isso.' });
      const { senha } = obj(msg);
      if (senha && (typeof senha !== 'string' || senha.length < 4 || senha.length > 100)) {
        return r({ ok: false, erro: 'A senha de gestor precisa ter pelo menos 4 caracteres.' });
      }
      const antes = room.gestorHash;
      room.gestorHash = senha ? hashSenha(senha) : null;
      try {
        await guardarSala(room);
      } catch (err) {
        room.gestorHash = antes;
        console.warn('[banco] senha de gestor', err.code || err.message);
        return r({ ok: false, erro: 'Não deu para guardar agora. Tente de novo.' });
      }
      r({ ok: true });
      io.to(room.id).emit('sala', { ...salaPublica(room), por: user.name });
      lobbyMudou();
    });

    // presença: status escolhido (disponível, ocupado...) e se está inativo (sem mexer em nada)
    socket.on('status', (msg) => {
      if (!user) return;
      const m = obj(msg);
      const status = STATUS.includes(m.status) ? m.status : user.status;
      const inativo = typeof m.inativo === 'boolean' ? m.inativo : user.inativo;
      if (status === user.status && inativo === user.inativo) return;
      const parado = (u) => u.inativo || PARADO.includes(u.status);
      const antes = parado(user);
      user.status = status;
      user.inativo = inativo;
      user.statusDesde = Date.now();
      io.to(room.id).emit('user-update', { id: user.id, status, inativo, desde: user.statusDesde });
      const agora = parado(user);
      lobbyMudou();
      if (agora) avisarGestores(room, user, 'parado', `${user.name} ${inativo ? 'está inativo (sem mexer há 10 min)' : `ficou "${NOMES_STATUS[status]}"`}`);
      else if (antes) avisarGestores(room, user, 'voltou', `${user.name} voltou a trabalhar`);
    });

    // chamar alguém (o "toque no ombro"): o outro recebe um aviso com "Ir até"
    socket.on('chamar', (para) => {
      if (!user || !room.users.has(para) || para === user.id) return;
      const agora = Date.now();
      if (agora - user.ultimoChamado < 4000) return;
      user.ultimoChamado = agora;
      io.to(para).emit('chamado', { id: user.id, nome: user.name, cor: user.color });
    });

    socket.on('sala-config', async (msg, ack) => {
      const r = resposta(ack);
      if (!room || !dono) return r({ ok: false, erro: 'Só o dono da sala muda isso.' });
      const antes = room.config;
      room.config = limparConfig(msg, antes);
      try {
        await guardarSala(room);
      } catch (err) {
        room.config = antes;
        console.warn('[banco] salvando sala', err.code || err.message);
        return r({ ok: false, erro: 'Não deu para guardar agora. Tente de novo.' });
      }
      r({ ok: true });
      io.to(room.id).emit('sala', { ...salaPublica(room), por: user.name });
      lobbyMudou();
      // outro modo ou outros departamentos, outras telas: quem mudou de tela fica sabendo
      const postos = new Map([...room.users.values()].map((u) => [u.id, u.posto]));
      const mudaram = ajustarTelas(room, layoutTelas(antes));
      for (const u of room.users.values()) if (u.posto !== postos.get(u.id)) io.to(room.id).emit('posto', { id: u.id, posto: u.posto });
      for (const key of mudaram) {
        const dono = room.users.get(donoDaChave(key));
        const sh = dono?.shares.get(key);
        if (sh) io.to(room.id).emit('share-update', { id: dono.id, ...sh });
      }
    });

    // Comercial: alguém fechou uma venda e toca o sino para todo mundo (no máximo a cada 8 s)
    socket.on('sino', () => {
      if (!user || room.config?.modulo !== 'escritorio' || !room.config.departamentos?.includes('comercial')) return;
      const agora = Date.now();
      if (agora - (room.ultimoSino || 0) < 8000) return;
      room.ultimoSino = agora;
      io.to(room.id).emit('sino', { nome: user.name, cor: user.color });
    });

    socket.on('sala-senha', async (msg, ack) => {
      const r = resposta(ack);
      if (!room || !dono) return r({ ok: false, erro: 'Só o dono da sala muda isso.' });
      const { nova } = obj(msg);
      if (!senhaValida(nova)) return r({ ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' });
      const antes = room.senhaHash;
      room.senhaHash = hashSenha(nova);
      try {
        await guardarSala(room);
      } catch (err) {
        room.senhaHash = antes;
        console.warn('[banco] trocando senha', err.code || err.message);
        return r({ ok: false, erro: 'Não deu para guardar agora. Tente de novo.' });
      }
      r({ ok: true });
    });

    // senha de entrada: o dono põe, troca ou tira (vazia = sala aberta)
    socket.on('sala-entrada', async (msg, ack) => {
      const r = resposta(ack);
      if (!room || !dono) return r({ ok: false, erro: 'Só o dono da sala muda isso.' });
      const { senha } = obj(msg);
      if (senha && (typeof senha !== 'string' || senha.length < 4 || senha.length > 100)) {
        return r({ ok: false, erro: 'A senha da sala precisa ter pelo menos 4 caracteres.' });
      }
      const antes = room.entradaHash;
      room.entradaHash = senha ? hashSenha(senha) : null;
      try {
        await guardarSala(room);
      } catch (err) {
        room.entradaHash = antes;
        console.warn('[banco] senha de entrada', err.code || err.message);
        return r({ ok: false, erro: 'Não deu para guardar agora. Tente de novo.' });
      }
      r({ ok: true });
      // quem já está dentro continua podendo voltar (recarregar, reconectar) sem digitar nada
      io.to(room.id).emit('passe', room.entradaHash ? passeDa(room) : null);
      io.to(room.id).emit('sala', { ...salaPublica(room), por: user.name });
      lobbyMudou();
    });

    // Posição: só guarda e marca quem se mexeu; quem repassa é o lote (ver attachSockets). O soco e o
    // tiro conferem a distância com o user.p, e quem entra recebe a posição pelo publicUser.
    socket.on('state', (s) => {
      const p = ponto(s?.p);
      if (!user || !p) return;
      user.p = p;
      user.r = num(s.r);
      user.a = num(s.a);
      user.s = s.s ? 1 : 0;
      room.mudou.set(user.n, user);
      // abas de antes do lote: uma mensagem por posição, como era
      if (room.legado) socket.to(`${room.id}:legado`).volatile.emit('state', { id: user.id, p, r: user.r, a: user.a, s: user.s });
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

    // webcam ligada (id do stream, para os outros acharem o vídeo no WebRTC) ou desligada (null)
    socket.on('cam', (streamId) => {
      if (!user) return;
      const cam = cleanText(streamId, 80) || null;
      if (cam === user.cam) return;
      user.cam = cam;
      io.to(room.id).emit('user-update', { id: user.id, cam });
    });

    // Cada chamada é mais uma aba/janela (ou um arquivo) numa tela livre. No escritório, numa tela
    // da sala onde a pessoa está (sala = id do departamento), se tiver alguma livre.
    socket.on('share-start', (msg, ack) => {
      const { streamId, sala, tela } = obj(msg);
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!user) return;
      const sid = cleanText(streamId, 80);
      if (!sid) return reply({ ok: false, error: 'Compartilhamento inválido.' });
      const layout = layoutTelas(room.config);
      // a pessoa escolheu a tela (de parede, ou um monitor do próprio posto pelo +): se ainda está
      // livre, é ela
      const meuPosto = user.posto ? layout.faixaPosto(user.posto) : null;
      const podeEssa = Number.isInteger(tela) && tela >= 0 && (tela < layout.parede || (!!meuPosto && tela >= meuPosto[0] && tela < meuPosto[1]));
      const escolhida = podeEssa && !room.slots[tela] ? tela : -1;
      if (Number.isInteger(tela) && escolhida === -1) return reply({ ok: false, error: 'Essa tela acabou de ser ocupada. Escolha outra.' });
      // na sala do próprio posto: nos monitores dele; senão numa tela de parede da sala
      const noPosto = escolhida === -1 && user.posto && sala === salaDoPosto(user.posto) ? telaLivre(room, layout.faixaPosto(user.posto)) : -1;
      const naSala = escolhida === -1 && noPosto === -1 && typeof sala === 'string' && layout.temSala(sala) ? telaLivre(room, layout.faixa(sala)) : -1;
      let slot = escolhida !== -1 ? escolhida : noPosto !== -1 ? noPosto : naSala !== -1 ? naSala : telaLivre(room, [0, layout.parede]);
      if (slot === -1) {
        if (semTela(room)) return reply({ ok: false, error: 'Todas as telas e o telão já estão ocupados.' });
        slot = null; // vai direto para o telão
      }
      const key = `${user.id}~${++user.shareSeq}`;
      // site/titulo: em que página a aba compartilhada está (só o domínio, nunca o endereço inteiro)
      const share = { key, slot, streamId: sid, controle: false, site: null, titulo: null };
      if (slot != null) room.slots[slot] = key;
      user.shares.set(key, share);
      // Telão vazio? Fixa a tela compartilhada nele automaticamente.
      if (slot == null || (room.main === 'media' && !room.media.id)) room.main = key;
      io.to(room.id).emit('share-update', { id: user.id, ...share });
      io.to(room.id).emit('main', { source: room.main, by: null });
      reply({ ok: true, slot, key });
    });

    // Sentou na cadeira de um posto de trabalho do escritório: se está livre, fica sendo dele.
    socket.on('posto', (msg, ack) => {
      const r = resposta(ack);
      if (!user) return r({ ok: false });
      const id = typeof msg?.id === 'string' ? msg.id : '';
      if (!layoutTelas(room.config).faixaPosto(id)) return r({ ok: false, erro: 'Esse posto não existe mais.' });
      if (user.posto === id) return r({ ok: true });
      const outro = donoDoPosto(room, id);
      if (outro) return r({ ok: false, dono: outro.name });
      const mudaram = pegarPosto(room, user, id);
      io.to(room.id).emit('posto', { id: user.id, posto: id });
      for (const t of mudaram) io.to(room.id).emit('share-update', { id: t.user.id, ...t.share });
      r({ ok: true });
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

    // A aba compartilhada mudou de página: mostra o site na barra de navegação de quem controla.
    // Só o domínio vai para a sala — o endereço completo pode ter código de login, token etc.
    socket.on('share-info', (msg) => {
      const sh = user?.shares.get(obj(msg).key);
      if (!sh) return;
      const site = /^[a-z0-9.-]{1,100}$/i.test(String(msg.site ?? '')) ? String(msg.site).toLowerCase() : null;
      const titulo = cleanText(msg.titulo, 120) || null;
      if (site === sh.site && titulo === sh.titulo) return;
      Object.assign(sh, { site, titulo });
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

    socket.on('arma', (tipo) => {
      if (!user || typeof tipo !== 'string' || !Object.hasOwn(ARMAS, tipo)) return;
      user.arma = tipo;
      io.to(room.id).emit('user-update', { id: user.id, arma: tipo });
    });

    socket.on('color', (cor) => {
      if (!user || !/^#[0-9a-f]{6}$/i.test(cor)) return;
      user.color = cor;
      io.to(room.id).emit('user-update', { id: user.id, color: cor });
    });

    socket.on('char', (kind) => {
      if (!user) return;
      user.char = PERSONAGENS.includes(kind) ? kind : 'padrao';
      io.to(room.id).emit('user-update', { id: user.id, char: user.char });
    });

    // ------------------------------------------------------------ ringue
    socket.on('punch', () => {
      if (!user || !jogoLigado(room, 'ringue')) return;
      socket.to(room.id).emit('punch', { id: user.id });
    });

    socket.on('hit', (msg) => {
      const { to, dir } = obj(msg);
      if (!user || !jogoLigado(room, 'ringue')) return;
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
      const { to, dir, de, ate, mais, n } = obj(msg);
      if (!user || user.shirt !== 'bolsonaro' || !jogoLigado(room, 'armas')) return;
      const arma = armaDe(user);
      const agora = Date.now();
      if (agora - (user.ultimoTiro || 0) < arma.cadencia * 1000 * 0.85) return;
      user.ultimoTiro = agora;
      const a = ponto(de);
      const b = ponto(ate);
      const alcance = arma.alcance + 5;
      if (!a || !b || dist(a, user.p) > 6 || dist(a, b) > alcance) return;
      // os outros chumbos da escopeta, só para desenhar
      const extras = (Array.isArray(mais) ? mais : []).slice(0, arma.chumbos - 1).map(ponto).filter((p) => p && dist(a, p) <= alcance);
      socket.to(room.id).emit('tiro', { id: user.id, de: a, ate: b, mais: extras, arma: user.arma });
      const alvo = room.users.get(to);
      if (!alvo || alvo.id === user.id || dist(user.p, alvo.p) > alcance) return;
      const d = Array.isArray(dir) ? dir.slice(0, 2).map(Number) : [0, 0];
      if (!d.every(Number.isFinite)) return;
      const chumbos = Math.max(1, Math.min(arma.chumbos, Math.floor(Number(n)) || 1));
      io.to(to).emit('hit', { from: user.id, fromName: user.name, dir: d, arma: user.arma, n: chumbos });
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
      if (!user || !jogoLigado(room, 'corrida')) return;
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
      if (!user || !jogoLigado(room, 'parkour')) return;
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
    // mesa de jogo desligada pelo dono da sala não aceita nada
    const mesaDe = (msg) => (user && JOGOS.includes(msg?.mesa) && jogoLigado(room, msg.mesa) ? room.jogos[msg.mesa] : null);

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
      if (!jogoLigado(room, 'dados')) return reply({ ok: false, erro: 'A mesa de dados está desligada nesta sala.' });
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
      room.mudou.delete(user.n);
      if (user.legado) room.legado--;
      io.to(room.id).emit('user-left', { id: user.id });
      avisarGestores(room, user, 'saiu', `${user.name} saiu do sistema`);
      lobbyMudou();
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
  ESCRITORIO = await import('./public/js/escritorio.js');
  PERSONAGENS = (await import('./public/js/personagens.js')).IDS_PERSONAGENS;
  ARMAS = (await import('./public/js/armas-dados.js')).ARMAS;
  // o banco antes de abrir a porta: quem entrar já encontra a sala e as moedas no lugar
  await banco.iniciar();
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
