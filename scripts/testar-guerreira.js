// Teste de movimento da guerreira: carrega o modelo pelo modelo.js (mesmo caminho do jogo),
// roda update() com cada estado e confere se pernas animam e se as molas dos seios oscilam.
// Precisa da sala no ar: npm start
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SALA = process.env.SALA_URL || 'http://localhost:3000';
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'sala3d-teste-guerreira-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--enable-unsafe-swiftshader', `--user-data-dir=${perfil}`, '--remote-debugging-pipe',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
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
    if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
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
    const { result: alvo } = await cdp('Target.createTarget', { url: `${SALA}/style.css` });
    const { result: s } = await cdp('Target.attachToTarget', { targetId: alvo.targetId, flatten: true });
    await esperar(1500);
    const res = await avaliar(s.sessionId, `(async () => {
      document.documentElement.innerHTML = '<head></head><body style="margin:0"></body>';
      const mapa = document.createElement('script');
      mapa.type = 'importmap';
      mapa.textContent = JSON.stringify({ imports: { three: '/vendor/three/build/three.module.js', 'three/addons/': '/vendor/three/examples/jsm/' } });
      document.head.append(mapa);
      const THREE = await import('three');
      const { PERSONAGENS } = await import('/js/personagens.js');
      const { criarPersonagem } = await import('/js/modelo.js');
      const def = PERSONAGENS.guerreira;
      const p = await criarPersonagem(def);
      const raiz = new THREE.Group();
      raiz.add(p.grupo);
      raiz.updateMatrixWorld(true);

      const acha = (re) => { let b = null; p.raiz.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
      const joelho = acha(/LowerLeg_L/), seio = acha(/Breast_L/), peito = acha(/Spine2/);
      const clipes = Object.fromEntries(Object.entries(p.mapa).map(([k, c]) => [k, c && c.name]));

      const pontaSeio = new THREE.Vector3();
      const amostras = [];
      const dt = 1 / 60;
      // 1 s parada, 2 s correndo: mede joelho (animação) e seio vs peito (mola)
      for (let i = 0; i < 180; i++) {
        p.update(dt, i < 60 ? 0 : 2, 2);
        raiz.updateMatrixWorld(true);
        pontaSeio.set(0, 0.1, 0).applyMatrix4(seio.matrixWorld);
        amostras.push({
          i,
          joelho: +joelho.getWorldPosition(new THREE.Vector3()).y.toFixed(4),
          seio: +pontaSeio.y.toFixed(4),
          peito: +peito.getWorldPosition(new THREE.Vector3()).y.toFixed(4),
        });
      }
      // resposta a pulo: estado "no ar" com mudança brusca de altura do grupo
      raiz.position.y = 0.8;
      const pulo = [];
      for (let i = 0; i < 60; i++) {
        p.update(dt, 3, 1);
        raiz.updateMatrixWorld(true);
        pontaSeio.set(0, 0.1, 0).applyMatrix4(seio.matrixWorld);
        pulo.push(+ (pontaSeio.y - peito.getWorldPosition(new THREE.Vector3()).y).toFixed(4));
      }
      // correndo em linha reta a 11,5 m/s: a mola tem de ficar perto da pose animada (antes ela
      // ficava presa no limite, meio metro atrás, porque amortecia a velocidade absoluta)
      raiz.position.y = 0;
      const mola = p.molas.find((m) => m.osso === seio);
      const cab = new THREE.Vector3(), anim = new THREE.Vector3(), da = new THREE.Vector3(), ds = new THREE.Vector3();
      const desvios = [];
      for (let i = 0; i < 120; i++) {
        raiz.position.z += 11.5 * dt;
        p.update(dt, 2, 1.6);
        p.restaurarMolas(); // pose do clipe, sem a mola, para comparar com a ponta simulada
        raiz.updateMatrixWorld(true);
        cab.setFromMatrixPosition(seio.matrixWorld);
        anim.set(0, mola.ponta, 0).applyMatrix4(seio.matrixWorld);
        da.subVectors(anim, cab).normalize();
        ds.subVectors(mola.sim, cab).normalize();
        desvios.push(Math.acos(Math.min(1, da.dot(ds))));
      }
      const nums = (k) => amostras.map((a) => a[k]);
      const amp = (xs) => Math.max(...xs) - Math.min(...xs);
      const desvio = desvios.slice(60);
      return {
        mapa: clipes,
        molas: p.molas.length,
        ampJoelhoCorrendo: +amp(nums('joelho').slice(70)).toFixed(4),
        ampSeioCorrendo: +amp(nums('seio').slice(70)).toFixed(4),
        ampPeitoCorrendo: +amp(nums('peito').slice(70)).toFixed(4),
        folgaSeioPuloMax: +amp(pulo).toFixed(4),
        // radianos; o limite da mola é 0,5
        molaCorrendoReto: { medio: +(desvio.reduce((a, b) => a + b, 0) / desvio.length).toFixed(3), max: +Math.max(...desvio).toFixed(3) },
        nan: amostras.some((a) => Object.values(a).some((v) => typeof v === 'number' && Number.isNaN(v))),
      };
    })()`);
    console.log(JSON.stringify(res, null, 1));
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
