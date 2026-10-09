// Prepara os Transformers do Transformers Alliance (Bumblebee, Jazz, Ratchet, Brawn) para o jogo:
// lê models-brutos/<bruto>.glb (o .glb do Sketchfab) e grava public/models/<id>.glb. Depois rode
// scripts/animar-transformers.js <id>, que grava andar, correr, pular, parado e soco no arquivo.
//
//   npm i --prefix ../gt @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   NODE_PATH=../gt/node_modules node scripts/preparar-alliance.js [bumblebee] [jazz] [ratchet] [brawn]
//
// O que muda em cada um:
//   - os clipes perdem o prefixo do Blender ("BumbleBee_MV1|idle01" -> "idle01") e só ficam os que
//     o jogo usa: transformar (ida e volta) e um de comemorar, que vira o aceno;
//   - saem o plano de sombra do Sketchfab, as armas (o jogo põe a dele na mão) e o símbolo dos
//     Decepticons, que fica por cima do dos Autobots no capô e no peito (o jogo original troca um
//     pelo outro conforme o lado);
//   - os clipes de luta desses modelos ficam de lado (o Alliance é um jogo de batalha visto de lado):
//     o robô olha para -x, o carro para +z. Os que ficam viram de frente aqui, girando o osso raiz.
//     Na transformação o giro acompanha o clipe: começa (ou termina) de frente e chega no carro
//     como ele já estava, então o robô vira para a frente enquanto se transforma;
//   - texturas em webp de até 1024 px e malha e animação com meshopt (o jogo não tem Draco).
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup, resample, sparse, meshopt, textureCompress } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');

let THREE; // módulo ES: entra por import() no começo

// manter: clipes que ficam (já sem prefixo). girar: como cada um vira de frente —
// 'tudo' (o clipe inteiro), 'ida' (de frente no começo, sem giro no fim: robô -> carro),
// 'volta' (sem giro no começo, de frente no fim: carro -> robô).
const MODELOS = {
  bumblebee: {
    bruto: 'bumblebee-rotf',
    // só tem a ida (transform_v): a volta é ela de trás para frente (ver transformar em modelo.js).
    // O idle01 fica só para servir de pose base ao animar-transformers.js, que o descarta.
    manter: ['idle01', 'transform_v', 'emo_joyful'],
    girar: { idle01: 'tudo', transform_v: 'ida', emo_joyful: 'tudo' },
  },
  jazz: {
    bruto: 'jazz',
    manter: ['transform_v', 'transform_r', 'emo_joyful'],
    girar: { transform_v: 'ida', transform_r: 'volta', emo_joyful: 'tudo' },
  },
  ratchet: {
    bruto: 'ratchet',
    manter: ['transform_v', 'transform_r', 'emo_joy'],
    girar: { transform_v: 'ida', transform_r: 'volta', emo_joy: 'tudo' },
  },
  brawn: {
    bruto: 'brawn',
    manter: ['transform_v', 'transform_r', 'emo_joyful'],
    girar: { transform_v: 'ida', transform_r: 'volta', emo_joyful: 'tudo' },
  },
};

// nós que saem (com tudo que estiver pendurado neles), pelo nome do nó ou da malha. Osso nunca sai:
// a pele depende deles (as armas penduram em ossos como gun_root, que ficam).
const FORA = [/^Shadow/i, /^Symbol_DC/, /weapon|gun|pistol|wrench/i];
// o Bumblebee traz os símbolos com alfa zero (invisíveis): saem também
const FORA_INVISIVEL = /^Symbol_/;

const FPS_GIRO = 30;
const suave = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function descartarAnimacao(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const sp of a.listSamplers()) {
    const dados = [sp.getInput(), sp.getOutput()];
    sp.dispose();
    for (const d of dados) if (d && !d.listParents().some((p) => p.propertyType !== 'Root')) d.dispose();
  }
  a.dispose();
}

function descartarNo(no) {
  for (const f of no.listChildren()) descartarNo(f);
  const malha = no.getMesh();
  no.dispose();
  if (malha && !malha.listParents().some((p) => p.propertyType === 'Node')) malha.dispose();
}

// valor de um canal no tempo t (LINEAR ou STEP; o Sketchfab exporta LINEAR)
function amostrar(sampler, t, caminho) {
  const ent = sampler.getInput().getArray();
  const sai = sampler.getOutput();
  const n = ent.length;
  const el = (i) => sai.getElement(i, []);
  if (t <= ent[0]) return el(0);
  if (t >= ent[n - 1]) return el(n - 1);
  let i = 0;
  while (i < n - 2 && ent[i + 1] < t) i++;
  const a = el(i);
  if (sampler.getInterpolation() === 'STEP') return a;
  const b = el(i + 1);
  const k = (t - ent[i]) / (ent[i + 1] - ent[i]);
  if (caminho === 'rotation') return new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), k).toArray();
  return a.map((v, j) => v + (b[j] - v) * k);
}

// Espelho dos nós em Object3D, na pose de repouso, para medir para onde o robô olha num quadro.
function espelhar(doc) {
  const objs = new Map();
  const raiz = new THREE.Object3D();
  const criar = (no, pai) => {
    const o = new THREE.Object3D();
    o.name = no.getName();
    o.userData.no = no;
    pai.add(o);
    objs.set(no, o);
    for (const f of no.listChildren()) criar(f, o);
  };
  for (const no of doc.getRoot().listScenes()[0].listChildren()) criar(no, raiz);
  const resetar = () => {
    for (const [no, o] of objs) {
      o.position.fromArray(no.getTranslation());
      o.quaternion.fromArray(no.getRotation());
      o.scale.fromArray(no.getScale());
    }
  };
  resetar();
  return { raiz, objs, resetar };
}

// Ângulo (em volta de +y) que põe o robô de frente para +z no tempo t do clipe: pela linha do
// quadril e pela dos ombros, da direita para a esquerda, que de frente fica apontando para +x.
function anguloDeFrente(doc, esp, anim, t) {
  esp.resetar();
  for (const c of anim.listChannels()) {
    const o = esp.objs.get(c.getTargetNode());
    const v = amostrar(c.getSampler(), t, c.getTargetPath());
    if (c.getTargetPath() === 'rotation') o.quaternion.fromArray(v);
    else if (c.getTargetPath() === 'translation') o.position.fromArray(v);
    else if (c.getTargetPath() === 'scale') o.scale.fromArray(v);
  }
  esp.raiz.updateMatrixWorld(true);
  const pos = (re) => {
    let achado = null;
    esp.raiz.traverse((o) => { if (!achado && re.test(o.name)) achado = o; });
    return new THREE.Vector3().setFromMatrixPosition(achado.matrixWorld);
  };
  const linha = pos(/^Bip001 L Thigh/).sub(pos(/^Bip001 R Thigh/)).setY(0).normalize()
    .add(pos(/^Bip001 L UpperArm/).sub(pos(/^Bip001 R UpperArm/)).setY(0).normalize());
  // girar a linha por ang em volta de y a leva para +x
  return Math.atan2(linha.z, linha.x);
}

// Gira o clipe inteiro em volta do eixo vertical que passa pelo _rootJoint (o osso mais alto do
// esqueleto: tudo pendura nele, inclusive as peças do carro). ang(t): ângulo no tempo t.
function girarClipe(doc, esp, anim, ang) {
  const raizOsso = doc.getRoot().listNodes().find((n) => n.getName() === '_rootJoint');
  const o = esp.objs.get(raizOsso);
  esp.resetar();
  esp.raiz.updateMatrixWorld(true);
  // o "para cima" do mundo no espaço do pai do osso (acima dele vem a troca de Z para Y do Sketchfab)
  const qPai = o.parent.getWorldQuaternion(new THREE.Quaternion());
  const cima = new THREE.Vector3(0, 1, 0).applyQuaternion(qPai.invert());
  let dur = 0;
  for (const s of anim.listSamplers()) dur = Math.max(dur, s.getInput().getMax([])[0]);
  const n = Math.max(1, Math.round(dur * FPS_GIRO));
  const tempos = Array.from({ length: n + 1 }, (_, i) => (i * dur) / n);
  const canal = (caminho) => anim.listChannels().find((c) => c.getTargetNode() === raizOsso && c.getTargetPath() === caminho);
  const repouso = { rotation: raizOsso.getRotation(), translation: raizOsso.getTranslation() };
  const buf = doc.getRoot().listBuffers()[0];
  const entrada = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(tempos)).setBuffer(buf);
  for (const caminho of ['rotation', 'translation']) {
    const antigo = canal(caminho);
    const valores = [];
    for (const t of tempos) {
      const v = antigo ? amostrar(antigo.getSampler(), t, caminho) : repouso[caminho];
      const giro = new THREE.Quaternion().setFromAxisAngle(cima, ang(t, dur));
      if (caminho === 'rotation') valores.push(...giro.multiply(new THREE.Quaternion().fromArray(v)).normalize().toArray());
      else valores.push(...new THREE.Vector3().fromArray(v).applyQuaternion(giro).toArray());
    }
    const saida = doc.createAccessor().setType(caminho === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(valores)).setBuffer(buf);
    const sampler = doc.createAnimationSampler().setInput(entrada).setOutput(saida).setInterpolation('LINEAR');
    anim.addSampler(sampler);
    if (antigo) {
      const velho = antigo.getSampler();
      antigo.setSampler(sampler);
      if (!velho.listParents().some((p) => p.propertyType === 'AnimationChannel')) velho.dispose();
    } else {
      anim.addChannel(doc.createAnimationChannel().setTargetNode(raizOsso).setTargetPath(caminho).setSampler(sampler));
    }
  }
}

(async () => {
  THREE = await import('three');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const id of pedidos.length ? pedidos : Object.keys(MODELOS)) {
    const cfg = MODELOS[id];
    if (!cfg) throw new Error(`não conheço ${id}`);
    const entrada = path.join(__dirname, '..', 'models-brutos', cfg.bruto + '.glb');
    const saida = path.join(__dirname, '..', 'public', 'models', id + '.glb');
    const antes = fs.statSync(entrada).size;
    const doc = await io.read(entrada);
    const raiz = doc.getRoot();

    for (const a of raiz.listAnimations()) {
      const nome = a.getName().split('|').pop();
      if (cfg.manter.includes(nome)) a.setName(nome);
      else descartarAnimacao(a);
    }
    const juntas = new Set(raiz.listSkins().flatMap((s) => s.listJoints()));
    for (const no of raiz.listNodes()) {
      if (no.isDisposed() || juntas.has(no)) continue;
      const nome = `${no.getName()} ${no.getMesh()?.getName() ?? ''}`;
      const invisivel = FORA_INVISIVEL.test(nome) && no.listChildren().some((f) => f.getMesh()?.listPrimitives().some((p) => (p.getMaterial()?.getBaseColorFactor()[3] ?? 1) === 0));
      if (FORA.some((re) => re.test(nome)) || invisivel) descartarNo(no);
    }

    // de frente: mede no quadro em que o robô aparece e gira o clipe
    const esp = espelhar(doc);
    for (const [nome, modo] of Object.entries(cfg.girar)) {
      const anim = raiz.listAnimations().find((a) => a.getName() === nome);
      if (!anim) throw new Error(`${id}: sem o clipe ${nome}`);
      let dur = 0;
      for (const s of anim.listSamplers()) dur = Math.max(dur, s.getInput().getMax([])[0]);
      const a0 = anguloDeFrente(doc, esp, anim, modo === 'volta' ? dur : 0);
      const ang = modo === 'tudo' ? () => a0
        : modo === 'ida' ? (t, d) => a0 * (1 - suave(t / d / 0.85))
          : (t, d) => a0 * suave((t / d - 0.15) / 0.85);
      girarClipe(doc, esp, anim, ang);
      console.log(`  ${id} ${nome}: ${modo}, ${Math.round((a0 * 180) / Math.PI)}°`);
    }

    for (const d of raiz.listAccessors()) if (!d.listParents().some((p) => p.propertyType !== 'Root')) d.dispose();
    await doc.transform(
      dedup(), resample(), prune(), sparse(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await io.write(saida, doc);
    const depois = fs.statSync(saida).size;
    console.log(id.padEnd(10), Math.round(antes / 1024) + ' KB -> ' + Math.round(depois / 1024) + ' KB', '| clipes:', raiz.listAnimations().map((a) => a.getName()).join(', '));
  }
})().catch((e) => { console.error('falha:', e.stack || e.message); process.exit(1); });
