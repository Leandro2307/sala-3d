// Gera a miniatura de cada personagem do catálogo (public/js/personagens.js) para o modal de
// escolha: abre um Chrome invisível na sala local, põe cada um na vitrine (vitrine.js) e salva
// public/img/personagens/<id>.webp. Rode de novo sempre que entrar um personagem novo.
//
//   npm start            (em outro terminal: a sala precisa estar no ar em localhost:3000)
//   node scripts/miniaturas.js [id ...]      (sem ids: todos)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((c) => fs.existsSync(c));
const SALA = process.env.SALA_URL || 'http://localhost:3000';
const PASTA = path.join(__dirname, '..', 'public', 'img', 'personagens');
const LARGURA = 256;
const ALTURA = 320;

if (!CHROME) {
  console.error('Não achei o Chrome. Diga onde ele está com CHROME=/caminho/do/chrome');
  process.exit(1);
}
fs.mkdirSync(PASTA, { recursive: true });
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'sala3d-miniaturas-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--enable-unsafe-swiftshader', `--user-data-dir=${perfil}`, '--remote-debugging-pipe',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

// protocolo de depuração pelo cano (mensagens JSON separadas por \0)
let buf = '';
let seq = 0;
const pend = new Map();
chrome.stdio[4].on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) !== -1) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pend.has(msg.id)) {
      pend.get(msg.id)(msg);
      pend.delete(msg.id);
    }
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((res) => {
  const id = ++seq;
  pend.set(id, res);
  chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const avaliar = async (sessao, expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessao);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erro na página');
  return r.result?.result?.value;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    await esperar(1500);
    // uma página qualquer da sala (mesma origem, para importar os módulos dela)
    const { result: alvo } = await cdp('Target.createTarget', { url: `${SALA}/style.css` });
    const { result: s } = await cdp('Target.attachToTarget', { targetId: alvo.targetId, flatten: true });
    await esperar(1500);
    const ids = await avaliar(s.sessionId, `(async () => {
      document.documentElement.innerHTML = '<head></head><body style="margin:0"></body>';
      const mapa = document.createElement('script');
      mapa.type = 'importmap';
      mapa.textContent = JSON.stringify({ imports: { three: '/vendor/three/build/three.module.js', 'three/addons/': '/vendor/three/examples/jsm/' } });
      document.head.append(mapa);
      const { PERSONAGENS } = await import('/js/personagens.js');
      const { Vitrine } = await import('/js/vitrine.js');
      const canvas = document.createElement('canvas');
      canvas.width = ${LARGURA};
      canvas.height = ${ALTURA};
      document.body.append(canvas);
      window.vitrine = new Vitrine(canvas, { girar: false, fotos: true });
      window.vitrine.tamanho(${LARGURA}, ${ALTURA});
      window.PERSONAGENS = PERSONAGENS;
      return Object.keys(PERSONAGENS);
    })()`);
    const pedidos = process.argv.slice(2);
    for (const id of ids.filter((x) => !pedidos.length || pedidos.includes(x))) {
      const url = await avaliar(s.sessionId, `(async () => {
        await window.vitrine.mostrar(window.PERSONAGENS[${JSON.stringify(id)}]);
        window.vitrine.quadro();
        return window.vitrine.canvas.toDataURL('image/webp', 0.86);
      })()`);
      const dados = Buffer.from(url.split(',')[1], 'base64');
      fs.writeFileSync(path.join(PASTA, `${id}.webp`), dados);
      console.log(`${id.padEnd(20)} ${Math.round(dados.length / 1024)} KB`);
    }
  } catch (err) {
    console.error('falhou:', err.message);
    process.exitCode = 1;
  } finally {
    chrome.kill();
    await esperar(800);
    fs.rmSync(perfil, { recursive: true, force: true });
    process.exit();
  }
})();
