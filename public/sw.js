// Service worker do app (PWA). A sala precisa do servidor para tudo (voz, telas, jogos); sem
// internet só abrem os jogos de cartas, para quem baixou o pacote offline (OFFLINE, abaixo). No dia
// a dia o que ele faz é guardar o que não muda — three.js e o cliente do
// socket.io com a versão no endereço, nossos módulos com a impressão digital (?v=), modelos 3D,
// miniaturas e ícones — para o app abrir rápido. O resto vai sempre à rede e só cai no cache se
// ela falhar.
// v2: as miniaturas dos personagens mudaram (sem as armas empilhadas do KayKit). Nome novo = todo
// mundo baixa de novo uma vez; o activate apaga o cache velho.
// v3: o visual novo do mapa (posprocesso.js) — havia quem ficasse com a página velha. Além de
// apagar o cache velho, recarrega as abas abertas da sala para pegarem tudo novo.
// v4: para de recarregar abas abertas — isso causava "entra e sai" no PWA durante o login.
const CACHE = 'sala3d-v4';
// O modo offline (jogos de cartas sem internet, ver js/offline-pacote.js) guarda tudo num cache à
// parte, que o activate não apaga: quem baixou continua com ele depois de uma atualização (a página
// atualiza o pacote sozinha quando tem internet). Sem rede, a página vem dele: ela combina com os
// módulos que estão nele.
const OFFLINE = 'sala3d-offline';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    let velho = false;
    for (const nome of await caches.keys()) {
      if (nome === CACHE || nome === OFFLINE) continue;
      velho = true;
      await caches.delete(nome);
    }
    await self.clients.claim();
    // Não recarrega as abas abertas automaticamente: no PWA isso derrubava o login no meio da
    // entrada ("entra e sai"). O cache velho é apagado; a nova versão entra na próxima abertura do
    // app ou quando a pessoa recarregar a aba.
  })());
});

// nunca passam por aqui: tempo real, senha da sala, configuração e downloads
const FORA = /^\/(socket\.io|offline-lista|config|ao-vivo|dev-recarregar|salas-status|sala-acesso|sala3d-extensao\.zip)/;
// não mudam sem mudar de endereço (ou quase nunca): do cache primeiro
const FIXOS = /^\/(vendor\/three@|vendor\/socket\.io@|models\/|img\/|icons\/)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || FORA.test(url.pathname)) return;
  if (req.headers.has('range')) {
    // as vozes das cartas (um <audio>, que pede em pedaços): sem rede, o pedaço sai do pacote offline
    if (url.pathname.startsWith('/audio/')) e.respondWith(fetch(req).catch(() => pedacoDoCache(req)));
    return; // vídeo em pedaços: direto com a rede
  }
  const fixo = FIXOS.test(url.pathname) || (url.pathname.startsWith('/js/') && url.searchParams.has('v'));
  e.respondWith(fixo ? doCache(req) : daRede(req));
});

// O CacheStorage pode falhar (perfil com problema, cota cheia, navegação privada de alguns
// navegadores): aí tudo vai direto à rede, em vez de a página nem abrir.
async function abrirCache() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

// procura em todos os caches: o do app e o do modo offline
const salvoEmAlgum = (req) => caches.match(req).catch(() => null);

async function doCache(req) {
  const cache = await abrirCache();
  const salvo = await salvoEmAlgum(req);
  if (salvo) return salvo;
  // Ao guardar, confere com o servidor (304 se nada mudou): sem isso o fetch pegava o cache HTTP
  // do navegador (1 dia nas imagens) e o cache novo nascia com a miniatura velha, para sempre.
  // Navegação não aceita trocar o modo do pedido (abrir uma imagem direto na aba).
  const resp = await fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' });
  if (resp.status === 200) cache?.put(req, resp.clone()).catch(() => {});
  return resp;
}

// "Range: bytes=0-" de um arquivo guardado inteiro: devolve o pedaço pedido (206)
async function pedacoDoCache(req) {
  const salvo = await salvoEmAlgum(req.url);
  if (!salvo) return Response.error();
  const tudo = await salvo.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let ini = m && m[1] ? Number(m[1]) : 0;
  let fim = m && m[2] ? Number(m[2]) : tudo.byteLength - 1;
  if (m && !m[1] && m[2]) { ini = Math.max(0, tudo.byteLength - Number(m[2])); fim = tudo.byteLength - 1; }
  fim = Math.min(fim, tudo.byteLength - 1);
  return new Response(tudo.slice(ini, fim + 1), {
    status: 206,
    headers: {
      'Content-Type': salvo.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${ini}-${fim}/${tudo.byteLength}`,
      'Content-Length': String(fim - ini + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function daRede(req) {
  const cache = await abrirCache();
  try {
    const resp = await fetch(req);
    if (resp.status === 200) cache?.put(req.mode === 'navigate' ? '/' : req, resp.clone()).catch(() => {});
    return resp;
  } catch (err) {
    // sem rede, a página do pacote offline (que combina com os módulos dele) vem antes da última vista
    const salvo = req.mode === 'navigate'
      ? (await caches.open(OFFLINE).then((c) => c.match('/')).catch(() => null)) || (await cache?.match('/').catch(() => null))
      : await salvoEmAlgum(req);
    if (salvo) return salvo;
    if (req.mode === 'navigate') {
      return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sala 3D</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d12;color:#e8ecf4;font-family:system-ui,sans-serif;text-align:center"><div><h1 style="font-size:20px">Sem conexão</h1><p style="color:#8a93a6">A Sala 3D precisa de internet. Confira a conexão e tente de novo.</p><button onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border:0;border-radius:10px;background:#6ee7c8;color:#062b22;font-weight:700">Tentar de novo</button></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    throw err;
  }
}
