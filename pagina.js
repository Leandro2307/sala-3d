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
const impressao = (codigo) => crypto.createHash('sha1').update(codigo).digest('hex').slice(0, 10);

// /js/x.js -> { codigo (com os imports já versionados), hash }
function versionarModulos() {
  const prontos = new Map();
  const abertos = new Set();
  const processar = (url) => {
    if (prontos.has(url)) return prontos.get(url);
    let codigo;
    try {
      codigo = fs.readFileSync(arquivo(url), 'utf8');
    } catch {
      return null;
    }
    if (abertos.has(url)) return { hash: impressao(codigo) }; // import em ciclo: usa o conteúdo cru
    abertos.add(url);
    const novo = codigo.replace(RELATIVOS, (tudo, antes, aspas, espec) => {
      const destino = new URL(espec, `http://x${url}`).pathname;
      const d = destino.startsWith('/js/') ? processar(destino) : null;
      return d ? `${antes}${aspas}${espec}?v=${d.hash}${aspas}` : tudo;
    });
    abertos.delete(url);
    const r = { codigo: novo, hash: impressao(novo) };
    prontos.set(url, r);
    return r;
  };
  for (const f of fs.readdirSync(path.join(PUBLICO, 'js'))) if (f.endsWith('.js')) processar(`/js/${f}`);
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

module.exports = { paginaInicial, moduloVersionado, PREFIXO_THREE, THREE_DIR, PREFIXO_SIO, SIO_DIR };
