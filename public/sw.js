// Service worker do app (PWA). A sala precisa do servidor para tudo (voz, telas, jogos), então
// não há modo offline de verdade: o que ele faz é guardar o que não muda — three.js e o cliente do
// socket.io com a versão no endereço, nossos módulos com a impressão digital (?v=), modelos 3D,
// miniaturas e ícones — para o app abrir rápido. O resto vai sempre à rede e só cai no cache se
// ela falhar.
// v2: as miniaturas dos personagens mudaram (sem as armas empilhadas do KayKit). Nome novo = todo
// mundo baixa de novo uma vez; o activate apaga o cache velho.
const CACHE = 'sala3d-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

// nunca passam por aqui: tempo real, senha da sala, configuração e downloads
const FORA = /^\/(socket\.io|config|ao-vivo|dev-recarregar|salas-status|sala-acesso|sala3d-extensao\.zip)/;
// não mudam sem mudar de endereço (ou quase nunca): do cache primeiro
const FIXOS = /^\/(vendor\/three@|vendor\/socket\.io@|models\/|img\/|icons\/)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || FORA.test(url.pathname)) return;
  if (req.headers.has('range')) return; // vídeo em pedaços: direto com a rede
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

async function doCache(req) {
  const cache = await abrirCache();
  const salvo = await cache?.match(req).catch(() => null);
  if (salvo) return salvo;
  // Ao guardar, confere com o servidor (304 se nada mudou): sem isso o fetch pegava o cache HTTP
  // do navegador (1 dia nas imagens) e o cache novo nascia com a miniatura velha, para sempre.
  // Navegação não aceita trocar o modo do pedido (abrir uma imagem direto na aba).
  const resp = await fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' });
  if (resp.status === 200) cache?.put(req, resp.clone()).catch(() => {});
  return resp;
}

async function daRede(req) {
  const cache = await abrirCache();
  try {
    const resp = await fetch(req);
    if (resp.status === 200) cache?.put(req.mode === 'navigate' ? '/' : req, resp.clone()).catch(() => {});
    return resp;
  } catch (err) {
    const salvo = await cache?.match(req.mode === 'navigate' ? '/' : req).catch(() => null);
    if (salvo) return salvo;
    if (req.mode === 'navigate') {
      return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sala 3D</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0d12;color:#e8ecf4;font-family:system-ui,sans-serif;text-align:center"><div><h1 style="font-size:20px">Sem conexão</h1><p style="color:#8a93a6">A Sala 3D precisa de internet. Confira a conexão e tente de novo.</p><button onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border:0;border-radius:10px;background:#6ee7c8;color:#062b22;font-weight:700">Tentar de novo</button></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    throw err;
  }
}
