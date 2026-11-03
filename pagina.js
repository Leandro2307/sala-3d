// A página inicial (public/index.html), servida com duas coisas a mais que aceleram a abertura:
//
// 1. Um <link rel="modulepreload"> para cada módulo do formulário de entrada (entrada.js), e a
//    lista dos módulos da sala (main.js, os nossos e os do three.js), que o entrada.js pede todos
//    de uma vez assim que o formulário aparece. Sem a lista o navegador só descobre um import
//    depois de baixar o arquivo que o pede: eram 8 levas seguidas, e o último chegava aos 3 s.
// 2. O three.js e o cliente do socket.io num endereço com a versão (/vendor/three@0.186.1/...,
//    /vendor/socket.io@4.8.4/...), que pode ficar no cache do navegador por um ano: quando a
//    versão mudar, o endereço muda junto.
//
// 3. Em produção, os nossos módulos com uma impressão digital do conteúdo no endereço
//    (/js/world.js?v=3fa9c1…), também em cache por um ano: o servidor reescreve os imports de
//    cada arquivo com a impressão de quem ele importa. Mudou um arquivo, muda a impressão dele
//    e, em cascata, a de quem o importa — o navegador nunca usa uma versão velha. Sem isso eram
//    31 perguntas "mudou?" ao servidor a cada visita (~1,8 s no Render, que atende ~6 por vez).
//
// Imports dinâmicos (import('./x.js')) ficam fora do modulepreload de propósito: são os que só
// carregam quando alguém precisa (a prévia do modal de personagem, por exemplo).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLICO = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const VERSAO_THREE = JSON.parse(fs.readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version;
const PREFIXO_THREE = `/vendor/three@${VERSAO_THREE}`;
const SOCKET_IO = path.join(__dirname, 'node_modules', 'socket.io');
const VERSAO_SIO = JSON.parse(fs.readFileSync(path.join(SOCKET_IO, 'package.json'), 'utf8')).version;
const PREFIXO_SIO = `/vendor/socket.io@${VERSAO_SIO}`;
const SIO_DIR = path.join(SOCKET_IO, 'client-dist'); // o cliente já montado para o navegador

// import/export estáticos: "from '...'" e "import '...'" (nada de import() dinâmico)
const IMPORTS = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]/g;

// endereço de um especificador, visto de dentro do módulo `de` (endereço também)
function resolver(espec, de) {
  if (espec === 'three') return `${PREFIXO_THREE}/build/three.module.js`;
  if (espec.startsWith('three/addons/')) return `${PREFIXO_THREE}/examples/jsm/${espec.slice('three/addons/'.length)}`;
  if (espec.startsWith('./') || espec.startsWith('../') || espec.startsWith('/')) return new URL(espec, `http://x${de}`).pathname;
  return null; // pacote sem mapa: o navegador nem conseguiria carregar
}

// arquivo no disco de um endereço
function arquivo(url) {
  if (url.startsWith(PREFIXO_THREE + '/')) return path.join(THREE_DIR, url.slice(PREFIXO_THREE.length + 1));
  return path.join(PUBLICO, url);
}

function grafo(inicio) {
  const vistos = new Set();
  const fila = [inicio];
  while (fila.length) {
    const url = fila.shift();
    if (vistos.has(url)) continue;
    let codigo;
    try {
      codigo = fs.readFileSync(arquivo(url), 'utf8');
    } catch {
      continue;
    }
    vistos.add(url);
    for (const m of codigo.matchAll(IMPORTS)) {
      const destino = resolver(m[1], url);
      if (destino && !vistos.has(destino)) fila.push(destino);
    }
  }
  return [...vistos];
}

const PRODUCAO = !!(process.env.RENDER || process.env.NODE_ENV === 'production');

// imports relativos (estáticos, side-effect e dinâmicos) que terminam em .js
const RELATIVOS = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+?\.js)\2/g;

// /js/x.js -> { codigo (com os imports já versionados), hash }
// Módulos que se importam em ciclo (cidade.js <-> mapa.js) ganham todos a mesma impressão, tirada
// do conteúdo de todos eles juntos (e das impressões de quem eles importam de fora do ciclo). Antes
// cada um via o outro com uma impressão diferente da que o resto do site usava: o navegador baixava
// e rodava o cidade.js duas vezes, como dois módulos separados.
function versionarModulos() {
  const cru = new Map(); // url -> código do disco
  const deps = new Map(); // url -> [{ espec, destino }]
  for (const f of fs.readdirSync(path.join(PUBLICO, 'js'))) {
    if (!f.endsWith('.js')) continue;
    const url = `/js/${f}`;
    try {
      cru.set(url, fs.readFileSync(arquivo(url), 'utf8'));
    } catch { /* sumiu entre o readdir e a leitura */ }
  }
  for (const [url, codigo] of cru) {
    const lista = [];
    for (const m of codigo.matchAll(RELATIVOS)) {
      const destino = new URL(m[3], `http://x${url}`).pathname;
      if (cru.has(destino)) lista.push(destino);
    }
    deps.set(url, lista);
  }
  // componentes fortemente conexos (Tarjan): cada ciclo vira um grupo; sai na ordem em que os
  // grupos de quem é importado vêm antes de quem importa
  const indice = new Map(), baixo = new Map(), naPilha = new Set(), pilha = [], grupos = [];
  let n = 0;
  const visitar = (v) => {
    indice.set(v, n); baixo.set(v, n); n++;
    pilha.push(v); naPilha.add(v);
    for (const w of deps.get(v)) {
      if (!indice.has(w)) { visitar(w); baixo.set(v, Math.min(baixo.get(v), baixo.get(w))); }
      else if (naPilha.has(w)) baixo.set(v, Math.min(baixo.get(v), indice.get(w)));
    }
    if (baixo.get(v) === indice.get(v)) {
      const g = [];
      let w;
      do { w = pilha.pop(); naPilha.delete(w); g.push(w); } while (w !== v);
      grupos.push(g.sort());
    }
  };
  for (const url of cru.keys()) if (!indice.has(url)) visitar(url);

  const hashDe = new Map();
  for (const g of grupos) {
    const dentro = new Set(g);
    const h = crypto.createHash('sha1');
    for (const url of g) {
      h.update(url).update('\0').update(cru.get(url)).update('\0');
      for (const d of deps.get(url)) if (!dentro.has(d)) h.update(`${d}=${hashDe.get(d)}\0`);
    }
    const hash = h.digest('hex').slice(0, 10);
    for (const url of g) hashDe.set(url, hash);
  }
  const prontos = new Map();
  for (const [url, codigo] of cru) {
    const novo = codigo.replace(RELATIVOS, (tudo, antes, aspas, espec) => {
      const hash = hashDe.get(new URL(espec, `http://x${url}`).pathname);
      return hash ? `${antes}${aspas}${espec}?v=${hash}${aspas}` : tudo;
    });
    prontos.set(url, { codigo: novo, hash: hashDe.get(url) });
  }
  return prontos;
}

let modulos = null;
// o módulo /js/... versionado (só em produção; no PC de quem desenvolve, os arquivos crus)
function moduloVersionado(url) {
  if (!PRODUCAO) return null;
  modulos ??= versionarModulos();
  return modulos.get(url) || null;
}

function montar() {
  let html = fs.readFileSync(path.join(PUBLICO, 'index.html'), 'utf8');
  html = html.split('"/vendor/three/').join(`"${PREFIXO_THREE}/`);
  html = html.replace('src="/socket.io/socket.io.js"', `src="${PREFIXO_SIO}/socket.io.min.js"`);
  const comVersao = (u) => {
    const m = moduloVersionado(u);
    return m ? `${u}?v=${m.hash}` : u;
  };
  html = html.replace('src="/js/entrada.js"', `src="${comVersao('/js/entrada.js')}"`);
  // Na abertura só o formulário de entrada (entrada.js e os poucos módulos dele, sem o three.js).
  // A sala vai numa lista que o entrada.js pede depois que o formulário aparece.
  const daEntrada = grafo('/js/entrada.js');
  const links = daEntrada.map((u) => `  <link rel="modulepreload" href="${comVersao(u)}">`).join('\n');
  const sala = grafo('/js/main.js').filter((u) => !daEntrada.includes(u)).map(comVersao);
  const lista = `  <script type="application/json" id="sala3d-modulos">${JSON.stringify(sala)}</script>`;
  // depois do mapa de imports: módulo pedido antes dele faria o navegador ignorar o mapa
  return html.replace('</head>', `${links}\n${lista}\n</head>`);
}

let pronta = null;
// Em produção monta uma vez; no PC de quem desenvolve, a cada pedido (os arquivos mudam).
function paginaInicial() {
  if (PRODUCAO) return (pronta ??= montar());
  return montar();
}

// ------------------------------------------------------------------ modo offline
// O pacote do modo offline (public/js/offline-pacote.js): tudo o que a página e os jogos de cartas
// pedem, para o service worker entregar sem internet. Os nossos módulos vão nos dois endereços (com a
// impressão, que é o que a página pede, e sem ela, que é o que os workers e o servidor de bolso
// pedem); do three.js vai o que os módulos importam dele.
const DIRS_OFFLINE = ['models', 'img', 'icons', 'audio/cartas'];
const SERVIDOR_DE_BOLSO = ['cartas-servidor', 'poker-servidor', 'mapa-servidor']; // ver /offline/ no server.js
// imports do three.js que o grafo não segue (import('three/addons/...') dinâmico)
const THREE_DINAMICO = /import\(\s*['"](three(?:\/addons\/[^'"]+)?)['"]\s*\)/g;

function arquivosDe(dir) {
  const saida = [];
  const andar = (d) => {
    for (const f of fs.readdirSync(path.join(PUBLICO, d), { withFileTypes: true })) {
      const rel = `${d}/${f.name}`;
      if (f.isDirectory()) andar(rel);
      else if (!/\.(md|txt)$/i.test(f.name)) saida.push(`/${rel}`);
    }
  };
  try { andar(dir); } catch { /* pasta que não existe neste deploy */ }
  return saida;
}

let offlinePronta = null;
function listaOffline(mapas) {
  if (PRODUCAO && offlinePronta) return offlinePronta;
  const comVersao = (u) => {
    const m = moduloVersionado(u);
    return m ? `${u}?v=${m.hash}` : u;
  };
  const nossos = fs.readdirSync(path.join(PUBLICO, 'js')).filter((f) => f.endsWith('.js')).map((f) => `/js/${f}`);
  const todos = new Set();
  for (const u of nossos) {
    for (const g of grafo(u)) todos.add(g);
    let codigo = '';
    try { codigo = fs.readFileSync(arquivo(u), 'utf8'); } catch { /* sumiu */ }
    for (const m of codigo.matchAll(THREE_DINAMICO)) for (const g of grafo(resolver(m[1], u))) todos.add(g);
  }
  const urls = new Set(['/', '/style.css', '/manifest.webmanifest', `${PREFIXO_SIO}/socket.io.min.js`]);
  for (const u of todos) {
    urls.add(u);
    if (u.startsWith('/js/')) urls.add(comVersao(u));
  }
  // o servidor de bolso carrega as mesas de cada mapa (mapa-servidor.js) com ?mapa= no endereço
  for (const m of mapas) urls.add(`/js/parque-dados.js?mapa=${m}`);
  for (const n of SERVIDOR_DE_BOLSO) urls.add(`/offline/${n}.js`);
  for (const d of DIRS_OFFLINE) for (const u of arquivosDe(d)) urls.add(u);
  const lista = [...urls];
  // a versão do pacote: mudou a página (e com ela as impressões dos módulos) ou a lista, baixa de novo
  const h = crypto.createHash('sha1').update(paginaInicial()).update(lista.join('\n'));
  for (const n of SERVIDOR_DE_BOLSO) h.update(servidorDeBolso(n));
  offlinePronta = { versao: h.digest('hex').slice(0, 12), urls: lista };
  return offlinePronta;
}

// Um módulo do servidor (CommonJS) como módulo ES, para rodar no navegador no modo offline: os
// require('./x.js') viram import de /offline/x.js, e o ./public/js/ dos import() vira /js/.
function servidorDeBolso(nome) {
  if (!SERVIDOR_DE_BOLSO.includes(nome)) return null;
  let codigo = fs.readFileSync(path.join(__dirname, `${nome}.js`), 'utf8');
  const deps = [];
  const variavel = (dep) => `__${dep.replace(/-/g, '_')}`;
  codigo = codigo.replace(/require\((['"])\.\/([\w-]+)\.js\1\)/g, (_, _a, dep) => {
    if (!SERVIDOR_DE_BOLSO.includes(dep)) throw new Error(`servidor de bolso: ${nome} pede ${dep}`);
    if (!deps.includes(dep)) deps.push(dep);
    return variavel(dep);
  });
  codigo = codigo.replace(/(['"`])\.\/public\/js\//g, '$1/js/');
  const topo = deps.map((d) => `import ${variavel(d)} from '/offline/${d}.js';`).join('\n');
  return `${topo}\nconst module = { exports: {} };\n${codigo}\nexport default module.exports;\n`;
}

module.exports = { paginaInicial, moduloVersionado, listaOffline, servidorDeBolso, PREFIXO_THREE, THREE_DIR, PREFIXO_SIO, SIO_DIR };
