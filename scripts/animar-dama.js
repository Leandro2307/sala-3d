// A Dama de Véu como personagem jogável (public/js/personagens.js). O dama.glb do Caça-Fantasmas
// (feito por scripts/preparar-dama.js) só tem o que um monstro usa: Idle, Walk, Run e Attack. Aqui
// ele ganha Jump (no ar, boiando), Sit (sentada numa cadeira) e Wave (o aceno), gravados no próprio
// public/models/fantasmas/dama.glb: o jogo e o Caça-Fantasmas usam o mesmo arquivo.
//
// O vestido segue as coxas e o quadril juntos (ver preparar-dama.js): sentada, com as coxas para a
// frente, a saia abaixo do joelho ia junto e ficava espetada no ar, como uma tábua. Por isso a saia
// ganha ossos próprios, em faixas de altura (FAIXAS): em cada faixa, o peso que o pano tinha no
// quadril e nas coxas passa para cópias deles (Saia_Q* filhos do quadril, Saia_E* e Saia_D* filhos
// das coxas, no joelho). Paradas no lugar, as cópias são os próprios ossos: Idle, Walk, Run e Attack,
// que não as mexem, ficam iguais. Sentada, o colo acompanha as coxas e, do joelho para baixo, o pano
// cai reto (ver vestir()).
//
//   npm i --prefix ../gt @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   NODE_PATH=../gt/node_modules node scripts/animar-dama.js
//
// Rodar de novo troca os três clipes pelos novos (os ossos da saia já estão lá e ficam). Depois de
// rodar scripts/preparar-dama.js, rode este também. Ao mudar, suba a versao da dama em
// public/js/personagens.js e em public/js/fantasmas-dados.js (o mesmo endereço nos dois: um download só).
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { resample } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');

let THREE; // módulo ES: entra por import() no começo

const ARQ = process.env.ARQ || path.join(__dirname, '..', 'public', 'models', 'fantasmas', 'dama.glb');
const GRAU = Math.PI / 180;
const GERADOS = ['Jump', 'Sit', 'Wave'];

// As faixas da saia, de cima para baixo, pela altura do ponto na pose de repouso (m; os joelhos
// ficam em 0,59 e 0,69). Cada faixa vai do `ate` da anterior (a primeira, da CINTURA) até o dela.
// colo: quanto a parte do pano que o quadril segura acompanha as coxas (o vestido de quem senta
// deita no colo); cai: quanto o pano, do joelho para baixo, cai reto em vez de seguir a coxa.
const CINTURA = 1.0; // acima disto é o corpete: fica com o quadril
const FAIXAS = [
  { ate: 0.95, colo: 0.25, cai: 0 },
  { ate: 0.9, colo: 0.6, cai: 0 },
  { ate: 0.7, colo: 1, cai: 0 },
  { ate: 0.64, colo: 1, cai: 0.3 },
  { ate: 0.58, colo: 1, cai: 0.65 },
  { ate: -Infinity, colo: 1, cai: 1 },
];

// ---------------------------------------------------------------- matemática
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const eixoAng = (eixo, ang) => new THREE.Quaternion().setFromAxisAngle(eixo, ang);
const suave = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const X = () => v3(1, 0, 0);
const Z = () => v3(0, 0, 1);

function posMundo(o) {
  o.updateWorldMatrix(true, false);
  return v3().setFromMatrixPosition(o.matrixWorld);
}
function quatMundo(o) {
  return o.getWorldQuaternion(new THREE.Quaternion());
}
// gira o osso em volta do próprio pivô por uma rotação dada no espaço do mundo
function girar(o, q) {
  const pai = quatMundo(o.parent);
  o.quaternion.premultiply(pai.clone().invert().multiply(q).multiply(pai)).normalize();
}
// gira o osso até a direção dele (do pivô ao filho) apontar para dir, no mundo
function apontar(o, filho, dir, peso = 1) {
  const atual = posMundo(filho).sub(posMundo(o)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(atual, dir.clone().normalize());
  girar(o, new THREE.Quaternion().slerp(q, peso));
}

// ---------------------------------------------------------------- o arquivo
function espelhar(doc) {
  const objs = new Map();
  const raiz = new THREE.Object3D();
  const criar = (no, pai) => {
    const o = new THREE.Object3D();
    o.name = no.getName();
    o.position.fromArray(no.getTranslation());
    o.quaternion.fromArray(no.getRotation());
    o.scale.fromArray(no.getScale());
    o.userData.no = no;
    pai.add(o);
    objs.set(no, o);
    for (const filho of no.listChildren()) criar(filho, o);
  };
  for (const no of doc.getRoot().listScenes()[0].listChildren()) criar(no, raiz);
  raiz.updateMatrixWorld(true);
  return { raiz, objs };
}

// O nome curto do osso: "mixamorig:LeftForeArm_029" -> "LeftForeArm"
const curto = (nome) => nome.replace('mixamorig:', '').replace(/_\d+$/, '');

function amostrar(sampler, t) {
  const tin = sampler.getInput().getArray();
  const out = sampler.getOutput();
  const n = tin.length;
  const el = (i) => out.getElement(i, []);
  if (t <= tin[0]) return el(0);
  if (t >= tin[n - 1]) return el(n - 1);
  let i = 0;
  while (tin[i + 1] < t) i++;
  const u = (t - tin[i]) / (tin[i + 1] - tin[i]);
  const a = el(i);
  const b = el(i + 1);
  if (a.length === 4) return new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), u).toArray();
  return a.map((x, k) => lerp(x, b[k], u));
}

// ---------------------------------------------------------------- os ossos da saia
// Cria as cópias de cada faixa e passa para elas o peso do pano (só o da malha "roupa"). Cópia
// parada no lugar = o osso original: a matriz inversa de ligação dela é a do original com o
// deslocamento dela desfeito, em cada uma das três skins (todas ficam com os mesmos ossos, na
// mesma ordem, e o jogo junta os esqueletos num só; ver unirEsqueletos em modelo.js).
function criarSaia(doc) {
  const raizDoc = doc.getRoot();
  const nos = raizDoc.listNodes();
  if (nos.some((n) => n.getName() === 'Saia_Q1')) return false; // já tem: fica
  const osso = (nome) => nos.find((n) => curto(n.getName()) === nome);
  const quadril = osso('Hips');
  const coxa = { E: osso('LeftUpLeg'), D: osso('RightUpLeg') };
  const joelho = { E: osso('LeftLeg'), D: osso('RightLeg') };
  const meio = coxa.E.getTranslation().map((x, k) => (x + coxa.D.getTranslation()[k]) / 2);
  const novo = (nome, pai, pos) => {
    const n = doc.createNode(nome).setTranslation(pos);
    pai.addChild(n);
    return n;
  };
  const faixas = FAIXAS.map((f, i) => ({
    Q: novo(`Saia_Q${i + 1}`, quadril, meio),
    E: f.cai ? novo(`Saia_E${i + 1}`, coxa.E, joelho.E.getTranslation()) : null,
    D: f.cai ? novo(`Saia_D${i + 1}`, coxa.D, joelho.D.getTranslation()) : null,
  }));
  const pais = new Map([[quadril, 'Q'], [coxa.E, 'E'], [coxa.D, 'D']]);
  const copias = faixas.flatMap((f) => ['Q', 'E', 'D'].map((k) => f[k]).filter(Boolean));

  // as skins: o osso novo entra no fim, com a inversa do pai menos o deslocamento dele
  const skins = raizDoc.listSkins();
  const mat = (a) => new THREE.Matrix4().fromArray(a);
  for (const skin of skins) {
    const juntas = skin.listJoints();
    const ibm = skin.getInverseBindMatrices();
    const lista = Array.from(ibm.getArray());
    for (const c of copias) {
      const pai = juntas.indexOf(c.getParentNode());
      const desloc = new THREE.Matrix4().makeTranslation(...c.getTranslation()).invert();
      lista.push(...desloc.multiply(mat(ibm.getElement(pai, []))).toArray());
      skin.addJoint(c);
    }
    ibm.setArray(new Float32Array(lista));
  }

  // os pesos: cada ponto do vestido abaixo da cintura troca quadril e coxas pelas cópias da faixa dele
  const { objs } = espelhar(doc);
  const noRoupa = nos.find((n) => n.getMesh()?.getName() === 'roupa');
  const skin = noRoupa.getSkin();
  const juntas = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const mats = juntas.map((j, i) => objs.get(j).matrixWorld.clone().multiply(mat(ibm.getElement(i, []))));
  const indice = new Map(juntas.map((j, i) => [j, i]));
  const prim = noRoupa.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION');
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const js = J.getArray();
  const M = new THREE.Matrix4();
  const v = v3();
  const contagem = faixas.map(() => 0);
  for (let i = 0; i < P.getCount(); i++) {
    const p = W.getElement(i, []);
    M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) if (p[k]) for (let e = 0; e < 16; e++) M.elements[e] += mats[js[i * 4 + k]].elements[e] * p[k];
    const y = v.fromArray(P.getElement(i, [])).applyMatrix4(M).y;
    if (y >= CINTURA) continue;
    const f = FAIXAS.findIndex((fx) => y >= fx.ate);
    contagem[f]++;
    for (let k = 0; k < 4; k++) {
      const lado = pais.get(juntas[js[i * 4 + k]]);
      if (lado && faixas[f][lado]) js[i * 4 + k] = indice.get(faixas[f][lado]);
    }
  }
  J.setArray(js);
  console.log(`saia: ${copias.length} ossos novos; pontos por faixa: ${contagem.join(', ')}`);
  return true;
}

// ---------------------------------------------------------------- as poses
// r: { ossos (nome curto -> Object3D), resetar(), amostrar(clipe, t) }. Ela olha para +z, a
// esquerda é +x.

// O vestido (ver FAIXAS): cada cópia do quadril gira em volta do meio das virilhas com a média do
// giro das coxas (o colo), e do joelho para baixo o pano volta à direção que tinha no repouso,
// pendurado no joelho (cai). Tudo no espaço do quadril. forca: quanto disso vale (1 sentada).
function vestir(r, forca = 1) {
  const o = r.ossos;
  const giro = (lado) => o[`${lado}UpLeg`].quaternion.clone().multiply(r.repouso.get(o[`${lado}UpLeg`]).clone().invert());
  const media = giro('Left').slerp(giro('Right'), 0.5);
  const meio = r.repousoPos.get(o.Saia_Q1);
  // o meio dos joelhos, no repouso e agora (no espaço do quadril)
  const joelhoRep = v3();
  const joelhoAgora = v3();
  for (const lado of ['Left', 'Right']) {
    const coxa = o[`${lado}UpLeg`];
    const k = o[`${lado}Leg`].position;
    joelhoRep.add(k.clone().applyQuaternion(r.repouso.get(coxa)).add(r.repousoPos.get(coxa)).multiplyScalar(0.5));
    joelhoAgora.add(k.clone().applyQuaternion(coxa.quaternion).add(coxa.position).multiplyScalar(0.5));
  }
  FAIXAS.forEach((f, i) => {
    const colo = new THREE.Quaternion().slerp(media, f.colo * forca);
    const cai = f.cai * forca;
    const q = o[`Saia_Q${i + 1}`];
    // o joelho levado pelo colo e, caindo, o joelho de verdade
    const alvo = joelhoRep.clone().sub(meio).applyQuaternion(colo).add(meio).lerp(joelhoAgora, cai);
    q.quaternion.copy(colo).slerp(new THREE.Quaternion(), cai);
    q.position.copy(meio).sub(joelhoRep).applyQuaternion(q.quaternion).add(alvo);
    for (const [lado, l] of [['Left', 'E'], ['Right', 'D']]) {
      const copia = o[`Saia_${l}${i + 1}`];
      if (!copia) continue;
      const coxa = o[`${lado}UpLeg`];
      // de volta ao giro do repouso em relação ao quadril
      const volta = coxa.quaternion.clone().invert().multiply(r.repouso.get(coxa));
      copia.quaternion.identity().slerp(volta, cai);
    }
  });
}

// No ar: boiando. As pernas juntas, de joelho um pouco dobrado e pé esticado para baixo, o tronco
// um pouco para trás e os braços meio abertos, subindo e descendo devagar, as mãos atrasadas e
// caídas. Acima do ombro a manga de morcego, costurada na cintura, esticava numa tira.
// A cabeça fica tombada, como no parado; o pano pende um pouco.
const PULAR = { duracao: 1.6, fps: 30 };
function posePular(r, f) {
  const o = r.ossos;
  r.amostrar('Idle', 0);
  const ciclo = f * Math.PI * 2;
  girar(o.Spine, eixoAng(X(), -9 * GRAU));
  girar(o.Spine2, eixoAng(X(), -4 * GRAU));
  for (const [s, l] of [[1, 'Left'], [-1, 'Right']]) {
    apontar(o[`${l}UpLeg`], o[`${l}Leg`], v3(0.06 * s, -1, 0.32));
    apontar(o[`${l}Leg`], o[`${l}Foot`], v3(0.02 * s, -1, -0.3));
    apontar(o[`${l}Foot`], o[`${l}ToeBase`], v3(0, -1, 0.25));
    const onda = (d) => Math.sin(ciclo - d + (s > 0 ? 0 : 0.4));
    apontar(o[`${l}Arm`], o[`${l}ForeArm`], v3(s, -0.75 + onda(0) * 0.12, 0.3));
    apontar(o[`${l}ForeArm`], o[`${l}Hand`], v3(s, -0.45 + onda(0.7) * 0.18, 0.45));
    apontar(o[`${l}Hand`], o[`${l}HandMiddle1`], v3(0.55 * s, -0.75 + onda(1.4) * 0.25, 0.35));
  }
  vestir(r, 0.6);
}

// Sentada numa cadeira: o tronco e a cabeça do parado (curvada, a cabeça tombada e o tranco), as
// coxas para a frente, um pouco abertas, as canelas retas para baixo, os pés na ponta e as mãos no
// colo. O jogo desce o modelo até o quadril encostar no assento (encaixarNoAssento em modelo.js).
const SENTAR = { duracao: 4, fps: 15 };
function poseSentada(r, f) {
  const o = r.ossos;
  r.amostrar('Idle', f * SENTAR.duracao);
  for (const [s, l] of [[1, 'Left'], [-1, 'Right']]) {
    apontar(o[`${l}UpLeg`], o[`${l}Leg`], v3(0.1 * s, -0.08, 1));
    apontar(o[`${l}Leg`], o[`${l}Foot`], v3(0.03 * s, -1, -0.06));
    apontar(o[`${l}Foot`], o[`${l}ToeBase`], v3(0, -0.5, 1));
    apontar(o[`${l}Arm`], o[`${l}ForeArm`], v3(0.14 * s, -1, 0.32));
    apontar(o[`${l}ForeArm`], o[`${l}Hand`], v3(-0.18 * s, -0.3, 1));
    apontar(o[`${l}Hand`], o[`${l}HandMiddle1`], v3(-0.1 * s, -0.55, 1));
  }
  vestir(r, 1);
}

// O aceno: da pose do parado, o braço direito sobe devagar (o cotovelo abaixo do ombro, pela
// manga), a mão balança duas vezes de um lado para o outro, com a cabeça tombando mais para o lado dela, e desce. Toca uma vez.
const ACENAR = { duracao: 2.6, fps: 30 };
function poseAcenar(r, f) {
  const o = r.ossos;
  const t = f * ACENAR.duracao;
  r.amostrar('Idle', 0);
  const k = suave(0, 0.45, t) * (1 - suave(2.1, 2.6, t));
  const vai = Math.sin((t - 0.45) * Math.PI * 2 * 1.1) * suave(0.35, 0.55, t) * (1 - suave(1.9, 2.15, t));
  apontar(o.RightArm, o.RightForeArm, v3(-0.7, -0.35, 0.6), k);
  apontar(o.RightForeArm, o.RightHand, v3(-0.2 + vai * 0.4, 1, 0.3), k);
  apontar(o.RightHand, o.RightHandMiddle1, v3(-0.1 + vai * 0.7, 1, 0.15), k);
  girar(o.Head, eixoAng(Z(), 12 * k * GRAU));
  girar(o.Head, eixoAng(X(), -6 * k * GRAU));
}

const CLIPES = [
  ['Jump', PULAR, posePular, true],
  ['Sit', SENTAR, poseSentada, true],
  ['Wave', ACENAR, poseAcenar, false],
];

// ---------------------------------------------------------------- gravar
// Canal que não muda no clipe inteiro sai com dois quadros só (como os do preparar-dama.js).
function gravarClipe(doc, r, nome, def, pose, laco) {
  const n = Math.round(def.duracao * def.fps);
  const tempos = Array.from({ length: n + 1 }, (_, i) => (i * def.duracao) / n);
  const valores = r.canais.map(() => []);
  for (let i = 0; i <= n; i++) {
    r.resetar();
    pose(r, laco ? (i % n) / n : i / n); // em laço o último quadro é o primeiro: fecha sem tranco
    r.raiz.updateMatrixWorld(true);
    r.canais.forEach((c, k) => {
      const v = c.caminho === 'rotation' ? c.o.quaternion.toArray() : c.o.position.toArray();
      const ant = valores[k][valores[k].length - 1];
      if (ant && c.caminho === 'rotation' && v[0] * ant[0] + v[1] * ant[1] + v[2] * ant[2] + v[3] * ant[3] < 0) for (let j = 0; j < 4; j++) v[j] = -v[j];
      valores[k].push(v);
    });
  }
  const buf = doc.getRoot().listBuffers()[0];
  const acessor = (tipo, dados) => doc.createAccessor().setType(tipo).setArray(new Float32Array(dados)).setBuffer(buf);
  const cheia = acessor('SCALAR', tempos);
  const curta = acessor('SCALAR', [0, def.duracao]);
  const anim = doc.createAnimation(nome);
  r.canais.forEach((c, k) => {
    const vs = valores[k];
    const fixo = vs.every((v) => v.every((x, j) => Math.abs(x - vs[0][j]) < 1e-6));
    const sampler = doc.createAnimationSampler()
      .setInput(fixo ? curta : cheia)
      .setOutput(acessor(c.caminho === 'rotation' ? 'VEC4' : 'VEC3', fixo ? [...vs[0], ...vs[0]] : vs.flat()))
      .setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.o.userData.no).setTargetPath(c.caminho).setSampler(sampler));
  });
}

function descartarAnimacao(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

// ---------------------------------------------------------------- tudo
(async () => {
  THREE = await import('three');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const antes = fs.statSync(ARQ).size;
  const doc = await io.read(ARQ);
  const raizDoc = doc.getRoot();
  for (const a of raizDoc.listAnimations()) if (GERADOS.includes(a.getName())) descartarAnimacao(a);
  criarSaia(doc);

  const { raiz, objs } = espelhar(doc);
  const juntas = raizDoc.listNodes().find((n) => n.getMesh()?.getName() === 'roupa').getSkin().listJoints();
  const ossos = {};
  for (const j of juntas) ossos[curto(j.getName())] = objs.get(j);
  const base = [];
  raiz.traverse((o) => base.push([o, o.position.clone(), o.quaternion.clone()]));
  const clipes = new Map(raizDoc.listAnimations().map((a) => [a.getName(), a.listChannels()
    .map((c) => ({ o: objs.get(c.getTargetNode()), caminho: c.getTargetPath(), s: c.getSampler() }))
    .filter((c) => c.o && ['rotation', 'translation'].includes(c.caminho))]));
  const r = {
    raiz, ossos,
    repouso: new Map(juntas.map((j) => [objs.get(j), objs.get(j).quaternion.clone()])),
    repousoPos: new Map(juntas.map((j) => [objs.get(j), objs.get(j).position.clone()])),
    // as cópias do quadril também andam (ver vestir)
    canais: [
      ...juntas.map((j) => ({ o: objs.get(j), caminho: 'rotation' })),
      ...juntas.filter((j) => /^(mixamorig:Hips|Saia_Q)/.test(j.getName())).map((j) => ({ o: objs.get(j), caminho: 'translation' })),
    ],
    resetar: () => { for (const [o, p, q] of base) { o.position.copy(p); o.quaternion.copy(q); } },
    amostrar: (nome, t) => {
      for (const c of clipes.get(nome)) {
        const v = amostrar(c.s, t);
        if (c.caminho === 'rotation') c.o.quaternion.fromArray(v);
        else c.o.position.fromArray(v);
      }
    },
  };
  for (const [nome, def, pose, laco] of CLIPES) gravarClipe(doc, r, nome, def, pose, laco);
  await doc.transform(resample());
  await io.write(ARQ, doc);
  console.log(`dama.glb: ${Math.round(antes / 1024)} KB -> ${Math.round(fs.statSync(ARQ).size / 1024)} KB, clipes: ${raizDoc.listAnimations().map((a) => a.getName()).join(', ')}`);
})().catch((e) => { console.error('falha:', e.stack || e.message); process.exit(1); });
