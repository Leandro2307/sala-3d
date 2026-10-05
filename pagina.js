// A página inicial (public/index.html), servida com duas coisas a mais que aceleram a abertura:
//
// 1. Um <link rel="modulepreload"> para cada módulo que o main.js usa, direta ou indiretamente
//    (os nossos e os do three.js). Sem isso o navegador só descobre um import depois de baixar
//    o arquivo que o pede: eram 8 levas seguidas, e o último script chegava aos 3 s.
// 2. O three.js num endereço com a versão (/vendor/three@0.186.1/...), que pode ficar no cache
//    do navegador por um ano: quando a versão mudar, o endereço muda junto.
//
// Imports dinâmicos (import('./x.js')) ficam de fora de propósito: são os que só carregam quando
// alguém precisa (a prévia do modal de personagem, por exemplo).
const fs = require('fs');
const path = require('path');

const PUBLICO = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const VERSAO_THREE = JSON.parse(fs.readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version;
const PREFIXO_THREE = `/vendor/three@${VERSAO_THREE}`;

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

function montar() {
  let html = fs.readFileSync(path.join(PUBLICO, 'index.html'), 'utf8');
  html = html.split('"/vendor/three/').join(`"${PREFIXO_THREE}/`);
  const links = grafo('/js/main.js').map((u) => `  <link rel="modulepreload" href="${u}">`).join('\n');
  // depois do mapa de imports: módulo pedido antes dele faria o navegador ignorar o mapa
  return html.replace('</head>', `${links}\n</head>`);
}

let pronta = null;
// Em produção monta uma vez; no PC de quem desenvolve, a cada pedido (os arquivos mudam).
function paginaInicial() {
  if (process.env.RENDER || process.env.NODE_ENV === 'production') return (pronta ??= montar());
  return montar();
}

module.exports = { paginaInicial, PREFIXO_THREE, THREE_DIR };
