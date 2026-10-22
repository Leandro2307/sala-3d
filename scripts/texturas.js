// Baixa as texturas do chão do Poly Haven (CC0, polyhaven.com) e grava em public/img/texturas/
// em WebP, já no jeito que o jogo usa:
//   detalhe: a foto em tons de cinza, com média perto de 1 — multiplica a cor do tema (o gramado
//            continua no verde do mapa, só ganha a textura de grama de verdade)
//   cor:     a foto colorida (a madeira do calçadão)
//   normal:  o relevo (OpenGL), para a luz pegar nas frestas e nas pedras
// A conversão é num Chrome invisível (canvas), como em miniaturas.js. Rode de novo para trocar
// uma textura (e mude o nome do arquivo: o service worker guarda public/img para sempre).
//
//   node scripts/texturas.js [nome ...]      (sem nomes: todas)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((c) => fs.existsSync(c));
const PASTA = path.join(__dirname, '..', 'public', 'img', 'texturas');

// nome: o arquivo; id: o do Poly Haven; media/contraste: só no detalhe
const PEDIDAS = process.argv.slice(2); // só estas (sem nada: todas)
const TEXTURAS = [
  { nome: 'grama', id: 'sparse_grass', modo: 'detalhe', media: 0.9, contraste: 1.5, tam: 512 },
  { nome: 'areia', id: 'coast_sand_01', modo: 'detalhe', media: 0.92, contraste: 1.6, tam: 512 },
  { nome: 'madeira', id: 'wood_floor_deck', modo: 'cor', clarear: 1.75, saturacao: 0.5, tam: 1024 },
  { nome: 'pedras', id: 'cobblestone_floor_08', modo: 'detalhe', media: 0.95, contraste: 1.1, tam: 512 },
  { nome: 'rocha', id: 'rock_boulder_dry', modo: 'detalhe', media: 0.92, contraste: 1.4, tam: 512 },
  { nome: 'cascalho', id: 'gravel', modo: 'detalhe', media: 0.92, contraste: 1.2, tam: 512 },
  { nome: 'lajes', id: 'stone_tiles_02', modo: 'detalhe', media: 0.92, contraste: 1.0, tam: 512 },
  { nome: 'neve', id: 'snow_02', modo: 'detalhe', media: 0.96, contraste: 1.3, tam: 512 },
];

if (!CHROME) {
  console.error('Não achei o Chrome. Diga onde ele está com CHROME=/caminho/do/chrome');
  process.exit(1);
}

async function baixar(id) {
  const info = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const pegar = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64');
  return { cor: await pegar(info.Diffuse['1k'].jpg.url), normal: await pegar(info.nor_gl['1k'].jpg.url) };
}

fs.mkdirSync(PASTA, { recursive: true });
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'sala3d-texturas-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${perfil}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

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

// roda na página: a imagem (base64) no tamanho pedido, processada, em WebP
const CONVERTER = `async (b64, tam, op) => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = cv.height = tam;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, tam, tam);
  const d = ctx.getImageData(0, 0, tam, tam);
  const p = d.data;
  if (op.modo === 'detalhe') {
    let soma = 0;
    const lum = new Float32Array(tam * tam);
    for (let i = 0; i < lum.length; i++) {
      lum[i] = (0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2]) / 255;
      soma += lum[i];
    }
    const m = soma / lum.length;
    for (let i = 0; i < lum.length; i++) {
      const v = Math.round(255 * Math.min(1, Math.max(0, op.media + (lum[i] - m) * op.contraste)));
      p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
    }
  } else if (op.clarear) {
    // saturação: puxa cada canal para o cinza do pixel (a foto é um verniz avermelhado)
    const sat = op.saturacao ?? 1;
    for (let i = 0; i < p.length; i += 4) {
      const l = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, (l + (p[i + k] - l) * sat) * op.clarear);
    }
  }
  ctx.putImageData(d, 0, 0);
  return cv.toDataURL('image/webp', op.qualidade);
}`;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    await esperar(1200);
    const { result: alvo } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { result: s } = await cdp('Target.attachToTarget', { targetId: alvo.targetId, flatten: true });
    for (const t of TEXTURAS.filter((x) => !PEDIDAS.length || PEDIDAS.includes(x.nome))) {
      const { cor, normal } = await baixar(t.id);
      const salvar = async (b64, sufixo, op) => {
        const url = await avaliar(s.sessionId, `(${CONVERTER})(${JSON.stringify(b64)}, ${t.tam}, ${JSON.stringify(op)})`);
        const dados = Buffer.from(url.split(',')[1], 'base64');
        fs.writeFileSync(path.join(PASTA, `${t.nome}${sufixo}.webp`), dados);
        console.log(`${(t.nome + sufixo).padEnd(14)} ${Math.round(dados.length / 1024)} KB`);
      };
      await salvar(cor, '', { modo: t.modo, media: t.media, contraste: t.contraste, clarear: t.clarear, saturacao: t.saturacao, qualidade: 0.82 });
      await salvar(normal, '-n', { modo: 'normal', qualidade: 0.9 });
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
