// Clipes que os Transformers não trazem, feitos aqui e gravados dentro do próprio .glb: Walk, Run e
// Jump (e Idle no Optimus, que só tem a transformação). Optimus e Solus vêm do Transformers: Earth
// Wars sem ciclo de andar; Bumblebee, Jazz, Ratchet e Brawn, do Transformers Alliance, com o
// parado e os golpes virados de lado (lá a luta é vista de lado): neles saem também um Idle de
// frente e um Punch (direto de direita). Os do Alliance passam antes por scripts/preparar-alliance.js.
// O passo e o passo girado no código por cima da pose (o antigo andarProcedural)
// ficava duro: coxa indo e voltando, pé arrastando, o resto do corpo parado. Aqui cada quadro é
// montado osso a osso:
//   - pernas por IK: o tornozelo segue um trajeto (no chão durante o apoio, num arco no balanço) e
//     coxa e joelho dobram para alcançá-lo, com o joelho apontando para a frente;
//   - o pé rola: pousa de calcanhar, assenta e sai na ponta, com o dedo ficando no chão;
//   - o quadril sobe e desce, gira, inclina e passa o peso de uma perna para a outra; o peito gira
//     ao contrário e o pescoço segura o olhar para a frente;
//   - os braços descem ao lado do corpo e balançam ao contrário das pernas.
// A base é a pose de robô de pé do próprio arquivo (último quadro da transformação no Optimus,
// primeiro do idle no Solus e no Bumblebee), e todo osso que essa pose mexe entra em todos os
// clipes: na mistura de um clipe para o outro, osso que ficasse de fora voltaria para a pose de
// repouso, que nesses é a de veículo. Em Jazz, Ratchet e Brawn o repouso já é o robô de pé, de
// frente e de braço esticado: é ele a base.
//
//   npm i --prefix ../gt @gltf-transform/core @gltf-transform/extensions meshoptimizer
//   NODE_PATH=../gt/node_modules node scripts/animar-transformers.js [optimus] [solus] [bumblebee] [jazz] [ratchet] [brawn] [--medir]
//
// Lê e grava public/models/<id>.glb no lugar; rodar de novo troca os clipes gerados pelos novos.
// --medir não grava nada: mostra, quadro a quadro, a altura da sola de cada pé em relação ao chão
// e quanto cada joelho dobra. Depois de gerar, suba `versao` do personagem em public/js/personagens.js.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');

let THREE; // o three é módulo ES: entra por import() logo no começo

const GRAU = Math.PI / 180;
const GERADOS = ['Idle', 'Walk', 'Run', 'Jump', 'Punch'];

// Os ossos de cada rig, pelo nome. O Earth Wars usa bn_*; o Alliance, o Biped do 3ds Max. No Biped
// o pescoço carrega as clavículas (girá-lo para segurar o olhar levaria os ombros junto): lá quem
// segura o olhar é a cabeça.
const EARTH_WARS = {
  pelve: '^bn_pelvis01', peito: '^bn_chest01', pescoco: '^bn_neck01',
  lado: (s) => ({
    coxa: `^bn_${s}_thigh01`, joelho: `^bn_${s}_knee01`, pe: `^bn_${s}_foot01`, dedo: `^bn_${s}_toe01`,
    braco: `^bn_${s}_upperarm01`, antebraco: `^bn_${s}_forearm01`, pulso: `^bn_${s}_wrist01`,
  }),
};
const BIPED = {
  pelve: '^Bip001 Pelvis', peito: '^Bip001 Spine1', pescoco: '^Bip001 Head',
  lado: (s) => {
    const L = s.toUpperCase();
    return {
      coxa: `^Bip001 ${L} Thigh`, joelho: `^Bip001 ${L} Calf`, pe: `^Bip001 ${L} Foot`, dedo: `^Bip001 ${L} Toe0_`,
      braco: `^Bip001 ${L} UpperArm`, antebraco: `^Bip001 ${L} Forearm`, pulso: `^Bip001 ${L} Hand`,
    };
  },
};

// base: de onde sai a pose de pé (null: o repouso do arquivo). largura e abertura dos braços mudam
// de um para o outro: o Optimus tem o peito de cabine de caminhão, e braço colado no corpo entra
// nele. idleReto: o Idle sai de pé e de frente (poseDePe) em vez de respirar na pose base, que nos
// do Alliance é a de luta, de lado. descartar: clipes do arquivo que só serviram de base.
const ALLIANCE = ['Idle', 'Walk', 'Run', 'Jump', 'Punch'];
const MODELOS = {
  optimus: { base: ['transform_to_robot', 'ultimo'], clipes: ['Idle', 'Walk', 'Run', 'Jump'], abertura: 30 },
  solus: { base: ['idle', 'primeiro'], clipes: ['Walk', 'Run', 'Jump'], abertura: 16 },
  bumblebee: { ossos: BIPED, base: ['idle01', 'primeiro'], clipes: ALLIANCE, abertura: 16, idleReto: true, descartar: ['idle01'] },
  jazz: { ossos: BIPED, base: null, clipes: ALLIANCE, abertura: 14, idleReto: true },
  ratchet: { ossos: BIPED, base: null, clipes: ALLIANCE, abertura: 16, idleReto: true },
  brawn: { ossos: BIPED, base: null, clipes: ALLIANCE, abertura: 18, idleReto: true },
};

// Medidas em pernas (L = coxa + canela) e graus, para valer nos dois tamanhos.
// fase 0: calcanhar esquerdo pousando na frente. apoio: fração do ciclo com o pé no chão (andando
// passa de 0,5, os dois pés juntos no chão por um instante; correndo fica abaixo, com o voo).
const ANDAR = {
  duracao: 0.72,
  apoio: 0.58,
  passada: 0.74, // quanto o pé corre por baixo do quadril durante o apoio
  altura: 0.95, // quadril acima do tornozelo, no ponto mais alto
  quique: 0.022, // quanto o quadril desce, nos dois sentidos (desce 2x isto)
  baixo: 0.04, // fase do ponto mais baixo: pés juntos no chão
  elevar: 0.12, // altura do pé no meio do balanço
  pouso: 14, // dedo para cima ao pousar o calcanhar
  saida: 26, // calcanhar para cima ao sair na ponta
  tanIni: 0.25, tanFim: 0.05, // o pé ainda recua um pouco ao sair, e chega quase parado
  largura: 0.03, // pé por fora do quadril
  quadrilGiro: 6, quadrilRola: 3, quadrilLado: 0.022, quadrilInclina: 2,
  peitoGiro: 9, peitoInclina: 4, peitoRola: 1.5,
  bracoBalanco: 20, bracoFrente: 3, cotovelo: 14, cotoveloExtra: 16,
};

const CORRER = {
  duracao: 0.72, // o jogo toca correndo em 1,6x: 0,45 s por ciclo
  apoio: 0.36,
  passada: 0.8,
  altura: 0.92,
  quique: 0.03,
  baixo: 0.18, // no meio do apoio: o joelho segura o peso
  elevar: 0.26,
  pouso: 6,
  saida: 34,
  tanIni: 0.55, tanFim: -0.15, // chuta para trás ao sair e puxa o chão ao chegar
  largura: 0.015,
  quadrilGiro: 8, quadrilRola: 2.5, quadrilLado: 0.012, quadrilInclina: 7,
  peitoGiro: 11, peitoInclina: 8, peitoRola: 1,
  bracoBalanco: 38, bracoFrente: 8, cotovelo: 80, cotoveloExtra: 12,
};

// De pé, parado e de frente (os do Alliance): quadril pouco abaixo do esticado, pés um pouco por
// fora dele, e a respiração.
const PARADO = { altura: 0.985, largura: 0.07, respira: 0.006 };

const CLIPES = {
  Idle: { duracao: 3, fps: 15, pose: (r, p, abertura, cfg) => (cfg.idleReto ? poseDePe(r, p, abertura) : poseParado(r, p)) },
  Walk: { duracao: ANDAR.duracao, fps: 30, pose: (r, p, abertura) => poseAndar(r, p, ANDAR, abertura) },
  Run: { duracao: CORRER.duracao, fps: 30, pose: (r, p, abertura) => poseAndar(r, p, CORRER, abertura) },
  Jump: { duracao: 1.2, fps: 15, pose: poseNoAr },
  Punch: { duracao: 0.55, fps: 30, pose: poseSoco },
};

// ---------------------------------------------------------------- matemática
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const eixoAng = (eixo, ang) => new THREE.Quaternion().setFromAxisAngle(eixo, ang);
const suave = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const X = () => v3(1, 0, 0);
const Y = () => v3(0, 1, 0);
const Z = () => v3(0, 0, 1);

function posMundo(o) {
  o.updateWorldMatrix(true, false);
  return v3().setFromMatrixPosition(o.matrixWorld);
}
function quatMundo(o) {
  return o.getWorldQuaternion(new THREE.Quaternion()); // já atualiza a cadeia de cima
}
// gira o osso em volta do próprio pivô por uma rotação dada no espaço do mundo
function girar(o, r) {
  const pai = quatMundo(o.parent);
  o.quaternion.premultiply(pai.clone().invert().multiply(r).multiply(pai)).normalize();
}
// põe a rotação do osso, no mundo, igual a q
function orientar(o, q) {
  o.quaternion.copy(quatMundo(o.parent).invert().multiply(q)).normalize();
}
function mover(o, delta) {
  const alvo = posMundo(o).add(delta);
  o.parent.updateWorldMatrix(true, false);
  o.position.copy(o.parent.worldToLocal(alvo));
}
// ângulo com sinal de a para b, em volta de eixo (a e b já perpendiculares a ele)
function anguloEm(a, b, eixo) {
  return Math.atan2(eixo.dot(v3().crossVectors(a, b)), a.dot(b));
}
function semComponente(v, eixo) {
  return v.clone().sub(eixo.clone().multiplyScalar(v.dot(eixo)));
}

// ---------------------------------------------------------------- arquivo
function amostra(sampler, ultimo) {
  const entrada = sampler.getInput();
  const saida = sampler.getOutput();
  const n = entrada.getCount();
  const i = ultimo ? n - 1 : 0;
  const cubica = sampler.getInterpolation() === 'CUBICSPLINE';
  return saida.getElement(cubica ? i * 3 + 1 : i, []); // getElement já desfaz o normalizado
}

// Espelho dos nós do glTF em Object3D, para usar a hierarquia e a matemática do three.
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
  return { raiz, objs };
}

// Vértices com esqueleto, para achar o chão e as solas. Ponto no mundo = Σ peso · osso · IBM · v.
function lerPele(doc, objs) {
  const vertices = [];
  for (const no of doc.getRoot().listNodes()) {
    const skin = no.getSkin();
    const mesh = no.getMesh();
    if (!skin || !mesh) continue;
    const juntas = skin.listJoints().map((j) => objs.get(j));
    const ibm = skin.getInverseBindMatrices();
    const ibms = juntas.map((_, i) => new THREE.Matrix4().fromArray(ibm.getElement(i, [])));
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const js = prim.getAttribute('JOINTS_0');
      const ps = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < pos.getCount(); i++) {
        const j = js.getElement(i, []);
        const p = ps.getElement(i, []);
        let maior = 0;
        for (let k = 1; k < 4; k++) if (p[k] > p[maior]) maior = k;
        vertices.push({ v: v3(...pos.getElement(i, [])), j: j.map((x) => juntas[x]), p, ibm: j.map((x) => ibms[x]), dono: juntas[j[maior]] });
      }
    }
  }
  return vertices;
}

// matrixWorld dos ossos já atualizadas (raiz.updateMatrixWorld antes)
function pontoDaPele(vt) {
  const soma = v3();
  for (let k = 0; k < 4; k++) {
    if (!vt.p[k]) continue;
    soma.add(vt.v.clone().applyMatrix4(vt.ibm[k]).applyMatrix4(vt.j[k].matrixWorld).multiplyScalar(vt.p[k]));
  }
  return soma;
}

function descartarAnimacao(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const sp of a.listSamplers()) {
    const dados = [sp.getInput(), sp.getOutput()];
    sp.dispose();
    for (const d of dados) if (d && !d.listParents().some((p) => p.propertyType !== 'Root')) d.dispose();
  }
  a.dispose();
}

function removerGerados(doc) {
  for (const a of doc.getRoot().listAnimations()) if (GERADOS.includes(a.getName())) descartarAnimacao(a);
}

// ---------------------------------------------------------------- o boneco
// Monta o espelho na pose base e mede o que os clipes precisam: pernas, pés, chão, quadril.
function montar(doc, cfg) {
  const { raiz, objs } = espelhar(doc);
  const [nomeBase, quadro] = cfg.base || [];
  const clipeBase = nomeBase ? doc.getRoot().listAnimations().find((a) => a.getName() === nomeBase) : null;
  if (nomeBase && !clipeBase) throw new Error(`sem o clipe ${nomeBase}`);

  // canais que todo clipe gerado leva (ver o cabeçalho)
  const canais = [];
  const temCanal = new Set();
  const addCanal = (o, caminho) => {
    const k = o.uuid + caminho;
    if (temCanal.has(k)) return;
    temCanal.add(k);
    canais.push({ o, caminho });
  };
  for (const c of clipeBase ? clipeBase.listChannels() : []) {
    const o = objs.get(c.getTargetNode());
    const v = amostra(c.getSampler(), quadro === 'ultimo');
    if (c.getTargetPath() === 'rotation') o.quaternion.fromArray(v);
    else if (c.getTargetPath() === 'translation') o.position.fromArray(v);
    else if (c.getTargetPath() === 'scale') o.scale.fromArray(v);
    else continue;
    addCanal(o, c.getTargetPath());
  }

  const achar = (re) => {
    let achado = null;
    raiz.traverse((o) => { if (!achado && re.test(o.name)) achado = o; });
    if (!achado) throw new Error(`sem osso ${re}`);
    return achado;
  };
  const nomes = cfg.ossos || EARTH_WARS;
  const r = {
    raiz, canais,
    pelve: achar(new RegExp(nomes.pelve)), peito: achar(new RegExp(nomes.peito)), pescoco: achar(new RegExp(nomes.pescoco)),
    lados: {},
  };
  for (const [lado, s] of [['e', 'l'], ['d', 'r']]) {
    r.lados[lado] = { sinal: lado === 'e' ? 1 : -1 }; // a esquerda do boneco fica em +x: ele olha para +z
    for (const [osso, re] of Object.entries(nomes.lado(s))) r.lados[lado][osso] = achar(new RegExp(re));
  }
  const ossos = [r.pelve, r.peito, r.pescoco];
  for (const l of Object.values(r.lados)) ossos.push(l.coxa, l.joelho, l.pe, l.dedo, l.braco, l.antebraco);
  for (const o of ossos) addCanal(o, 'rotation');
  addCanal(r.pelve, 'translation');

  // pose base de cada nó, para voltar a ela a cada quadro
  const base = [];
  raiz.traverse((o) => base.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  r.resetar = () => {
    for (const [o, p, q, s] of base) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  };

  // chão: o jogo assenta o boneco pela pose de repouso (a do arquivo, sem clipe), ver ajustar() em
  // modelo.js. É nessa altura que a sola tem de ficar.
  const pele = lerPele(doc, objs);
  raiz.traverse((o) => {
    const no = o.userData.no;
    if (!no) return;
    o.position.fromArray(no.getTranslation());
    o.quaternion.fromArray(no.getRotation());
    o.scale.fromArray(no.getScale());
  });
  raiz.updateMatrixWorld(true);
  r.chao = pele.reduce((m, vt) => Math.min(m, pontoDaPele(vt).y), Infinity);
  r.resetar();
  raiz.updateMatrixWorld(true);

  // vértices de cada pé (o que pertence ao osso do pé ou a algum filho dele)
  const doPe = (pe) => pele.filter((vt) => { for (let o = vt.dono; o; o = o.parent) if (o === pe) return true; return false; });
  for (const l of Object.values(r.lados)) l.vertices = doPe(l.pe);
  r.solaAgora = (l) => l.vertices.reduce((m, vt) => Math.min(m, pontoDaPele(vt).y), Infinity);

  // pernas
  for (const l of Object.values(r.lados)) {
    const H = posMundo(l.coxa); const K = posMundo(l.joelho); const A = posMundo(l.pe);
    l.L1 = K.distanceTo(H);
    l.L2 = A.distanceTo(K);
    const coxaDir = K.clone().sub(H).normalize();
    const canela = A.clone().sub(K).normalize();
    l.gama0 = Math.acos(THREE.MathUtils.clamp(coxaDir.clone().negate().dot(canela), -1, 1)); // ângulo interno
    // dobradiça do joelho, medida na própria pose base e guardada no espaço da coxa. Perna reta (o
    // repouso dos do Alliance) não diz para onde o joelho dobra: aí vale o eixo de um quadril ao
    // outro, para a esquerda, que dobra o joelho para a frente
    let dobra = v3().crossVectors(coxaDir, canela);
    if (dobra.length() < Math.sin(4 * GRAU)) {
      const outro = l.sinal > 0 ? r.lados.d : r.lados.e;
      dobra = H.clone().sub(posMundo(outro.coxa)).multiplyScalar(l.sinal).setY(0);
    }
    dobra.normalize();
    l.dobra = dobra.applyQuaternion(quatMundo(l.coxa).invert());
    l.quadril0 = H;
    l.tornozelo0 = A;
    l.joelho0 = K;
    l.pe0 = quatMundo(l.pe);
    l.dedo0 = quatMundo(l.dedo);
    l.dedoPos0 = posMundo(l.dedo);
  }
  r.perna = Math.max(...Object.values(r.lados).map((l) => l.L1 + l.L2));
  r.pelve0 = posMundo(r.pelve);
  r.pelveQ0 = quatMundo(r.pelve);
  r.quadril0 = r.lados.e.quadril0.clone().add(r.lados.d.quadril0).multiplyScalar(0.5);

  // Pé chato apontando para a frente. Os dois pousam diferente na pose base (o Optimus fica de
  // calcanhar de trás levantado, numa base de luta): o mais baixo do tornozelo até a ponta é o
  // chato; o outro gira até a mesma inclinação. E os dois passam a apontar para a frente, um pouco
  // para fora.
  const inclinacao = (l) => {
    const t = l.dedoPos0.clone().sub(l.tornozelo0);
    return Math.atan2(-t.y, Math.hypot(t.x, t.z));
  };
  const chata = Math.min(...Object.values(r.lados).map(inclinacao));
  for (const l of Object.values(r.lados)) {
    const t = l.dedoPos0.clone().sub(l.tornozelo0);
    const frente = v3(l.sinal * Math.sin(6 * GRAU), 0, Math.cos(6 * GRAU));
    const giro = new THREE.Quaternion().setFromUnitVectors(v3(t.x, 0, t.z).normalize(), frente);
    l.frente = frente;
    l.lat = v3().crossVectors(frente, Y()).normalize(); // girar em volta dele sobe a ponta
    const conserto = eixoAng(l.lat, inclinacao(l) - chata).multiply(giro);
    l.pePlano = conserto.clone().multiply(l.pe0);
    l.dedoPlano = conserto.clone().multiply(l.dedo0);
    // sola, ponta e calcanhar em relação ao tornozelo, com o pé chato
    const rel = l.vertices.map((vt) => pontoDaPele(vt).sub(l.tornozelo0).applyQuaternion(conserto));
    const fundo = Math.min(...rel.map((p) => p.y));
    const rente = rel.filter((p) => p.y < fundo + 0.04 * r.perna);
    const adiante = (p) => p.dot(frente);
    // a ponta rola na junta do dedo, e o dedo fica no chão
    l.ponta = l.dedoPos0.clone().sub(l.tornozelo0).applyQuaternion(conserto).setY(fundo);
    l.calcanhar = rente.reduce((a, b) => (adiante(b) < adiante(a) ? b : a)).clone().setY(fundo);
    l.alturaTornozelo = -fundo; // do chão ao tornozelo, com o pé chato
  }
  return r;
}

// ---------------------------------------------------------------- partes da pose
// Pé no chão (ou de onde ele sairia), na posição z do trajeto: rola em volta da ponta (ang > 0,
// calcanhar subindo) ou do calcanhar (ang < 0, ponta subindo).
function pePlantado(r, l, x, z, ang, pivo) {
  const tornozelo = v3(x, r.chao + l.alturaTornozelo, z);
  const giro = eixoAng(l.lat, -ang);
  if (pivo) {
    const p = tornozelo.clone().add(pivo === 'ponta' ? l.ponta : l.calcanhar);
    tornozelo.sub(p).applyQuaternion(giro).add(p);
  }
  return {
    tornozelo,
    pe: giro.clone().multiply(l.pePlano),
    dedo: pivo === 'ponta' ? l.dedoPlano.clone() : giro.clone().multiply(l.dedoPlano),
  };
}

// IK de duas juntas: dobra o joelho até a distância quadril-tornozelo bater, aponta a perna para o
// alvo e gira em volta dela até o joelho olhar para `polo`.
function ik(r, l, alvo, polo) {
  const H = posMundo(l.coxa);
  const d = THREE.MathUtils.clamp(alvo.distanceTo(H), Math.abs(l.L1 - l.L2) + 1e-3, (l.L1 + l.L2) * 0.9995);
  const gama = Math.acos(THREE.MathUtils.clamp((l.L1 * l.L1 + l.L2 * l.L2 - d * d) / (2 * l.L1 * l.L2), -1, 1));
  l.joelho.quaternion.premultiply(eixoAng(l.dobra, l.gama0 - gama));
  const A = posMundo(l.pe);
  const u = alvo.clone().sub(H).normalize();
  girar(l.coxa, new THREE.Quaternion().setFromUnitVectors(A.sub(H).normalize(), u));
  const k = semComponente(posMundo(l.joelho).sub(H), u);
  const p = semComponente(polo, u);
  girar(l.coxa, eixoAng(u, anguloEm(k, p, u)));
  return 180 - gama / GRAU; // quanto o joelho dobra, em graus
}

function porPe(r, l, alvoPe, polo) {
  const flexao = ik(r, l, alvoPe.tornozelo, polo);
  orientar(l.pe, alvoPe.pe);
  orientar(l.dedo, alvoPe.dedo);
  return flexao;
}

// Braço: o de cima numa direção (abertura para o lado, balanço para a frente), o antebraço dobrado
// à frente dele. frente e lado: do peito, já girado.
function porBraco(l, abertura, balanco, cotovelo, frente, lado) {
  const baixo = Y().negate();
  const pendente = baixo.clone().multiplyScalar(Math.cos(balanco)).add(frente.clone().multiplyScalar(Math.sin(balanco)));
  const dirBraco = pendente.multiplyScalar(Math.cos(abertura)).add(lado.clone().multiplyScalar(l.sinal * Math.sin(abertura))).normalize();
  const atual = posMundo(l.antebraco).sub(posMundo(l.braco)).normalize();
  girar(l.braco, new THREE.Quaternion().setFromUnitVectors(atual, dirBraco));
  // braço apontando para a frente (o soco): o antebraço dobra para cima
  const adiante = semComponente(frente, dirBraco);
  const k = adiante.length();
  if (k < 0.25) adiante.multiplyScalar(k / 0.25).add(semComponente(Y(), dirBraco).normalize().multiplyScalar(1 - k / 0.25));
  adiante.normalize();
  const dirAnte = dirBraco.clone().multiplyScalar(Math.cos(cotovelo)).add(adiante.multiplyScalar(Math.sin(cotovelo)));
  const atualAnte = posMundo(l.pulso).sub(posMundo(l.antebraco)).normalize();
  girar(l.antebraco, new THREE.Quaternion().setFromUnitVectors(atualAnte, dirAnte));
}

// Quadril quadrado com o corpo: a base pode estar torta (o Optimus fica de lado, em guarda)
function esquadrar(r) {
  const e = r.lados.e.quadril0; const d = r.lados.d.quadril0;
  const linha = v3(e.x - d.x, 0, e.z - d.z).normalize();
  return new THREE.Quaternion().setFromUnitVectors(linha, X());
}

function trajeto(r, l, fase, g) {
  const L = r.perna;
  const D = g.passada * L;
  const x = l.quadril0.x + l.sinal * g.largura * L;
  const zc = r.quadril0.z;
  if (fase < g.apoio) {
    const s = fase / g.apoio;
    const z = zc + D / 2 - D * s;
    const pousoAte = 0.18; const saidaDe = 0.62;
    if (s < pousoAte) return pePlantado(r, l, x, z, -g.pouso * GRAU * (1 - suave(s / pousoAte)), 'calcanhar');
    if (s > saidaDe) return pePlantado(r, l, x, z, g.saida * GRAU * suave((s - saidaDe) / (1 - saidaDe)), 'ponta');
    return pePlantado(r, l, x, z, 0, null);
  }
  // balanço: sai de onde o apoio terminou e chega onde o próximo começa
  const s = (fase - g.apoio) / (1 - g.apoio);
  const ini = pePlantado(r, l, x, zc - D / 2, g.saida * GRAU, 'ponta');
  const fim = pePlantado(r, l, x, zc + D / 2, -g.pouso * GRAU, 'calcanhar');
  const vApoio = -D / g.apoio * (1 - g.apoio); // velocidade do pé no apoio, na escala do balanço
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1; const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2; const h11 = s ** 3 - s ** 2;
  const z = h00 * ini.tornozelo.z + h10 * vApoio * g.tanIni + h01 * fim.tornozelo.z + h11 * vApoio * g.tanFim;
  const y = lerp(ini.tornozelo.y, fim.tornozelo.y, s) + g.elevar * L * Math.sin(Math.PI * s ** 0.75);
  const ang = lerp(g.saida, -g.pouso, suave(s)) * GRAU;
  const giro = eixoAng(l.lat, -ang);
  return { tornozelo: v3(x, y, z), pe: giro.clone().multiply(l.pePlano), dedo: giro.clone().multiply(l.dedoPlano) };
}

// ---------------------------------------------------------------- clipes
function poseAndar(r, p, g, abertura) {
  const T = Math.PI * 2;
  const L = r.perna;
  const cos1 = Math.cos(T * p); const sen1 = Math.sin(T * p);

  // quadril: altura, peso de um lado para o outro, giro acompanhando a perna da frente
  const h = (g.altura * L + r.lados.e.alturaTornozelo + r.chao) - r.quadril0.y;
  const dy = h - g.quique * L * (1 + Math.cos(2 * T * (p - g.baixo)));
  mover(r.pelve, v3(g.quadrilLado * L * sen1, dy, 0));
  const giroQ = -g.quadrilGiro * GRAU * cos1;
  const rot = eixoAng(Y(), giroQ)
    .multiply(eixoAng(Z(), g.quadrilRola * GRAU * sen1))
    .multiply(eixoAng(X(), g.quadrilInclina * GRAU))
    .multiply(esquadrar(r));
  girar(r.pelve, rot);

  // peito: gira ao contrário do quadril, e quadrado com o corpo (ombros da base podem vir tortos)
  const ombros = posMundo(r.lados.e.braco).sub(posMundo(r.lados.d.braco));
  const torto = new THREE.Quaternion().setFromUnitVectors(v3(ombros.x, 0, ombros.z).normalize(), X());
  const giroP = g.peitoGiro * GRAU * cos1;
  girar(r.peito, eixoAng(Y(), giroQ + giroP)
    .multiply(eixoAng(X(), (g.peitoInclina - g.quadrilInclina * 0.5) * GRAU + 0.6 * GRAU * Math.cos(2 * T * (p - g.baixo))))
    .multiply(eixoAng(Z(), -g.peitoRola * GRAU * sen1))
    .multiply(torto));

  // pescoço segura o olhar para a frente
  const giroLiquido = giroQ + giroP;
  girar(r.pescoco, eixoAng(Y(), -0.7 * giroLiquido).multiply(eixoAng(X(), -0.6 * (g.peitoInclina + g.quadrilInclina * 0.5) * GRAU)));

  // braços: ao contrário da perna do mesmo lado
  const frente = Z().applyAxisAngle(Y(), giroLiquido);
  const lado = X().applyAxisAngle(Y(), giroLiquido);
  const balE = -g.bracoBalanco * GRAU * Math.cos(T * (p - 0.03));
  for (const l of Object.values(r.lados)) {
    const bal = (l.sinal > 0 ? balE : -balE) + g.bracoFrente * GRAU;
    const cot = (g.cotovelo + g.cotoveloExtra * Math.max(0, bal / (g.bracoBalanco * GRAU))) * GRAU;
    porBraco(l, abertura * GRAU, bal, cot, frente, lado);
  }

  // pernas
  const flexoes = {};
  for (const [nome, l] of Object.entries(r.lados)) {
    const fase = (p + (nome === 'e' ? 0 : 0.5)) % 1;
    const polo = l.frente.clone().add(v3(0, 0.15, 0)).normalize();
    flexoes[nome] = porPe(r, l, trajeto(r, l, fase, g), polo);
  }
  return flexoes;
}

// Parado (só o Optimus: o Solus tem o dele): a pose de pé da base respirando. Pés fixos onde estão.
function poseParado(r, p) {
  const T = Math.PI * 2;
  const L = r.perna;
  const alvos = {};
  for (const [nome, l] of Object.entries(r.lados)) alvos[nome] = { tornozelo: l.tornozelo0.clone(), pe: l.pe0.clone(), dedo: l.dedo0.clone(), polo: l.joelho0.clone().sub(l.quadril0) };
  mover(r.pelve, v3(0.004 * L * Math.sin(T * p), -0.006 * L * (1 - Math.cos(2 * T * p)), 0));
  girar(r.pelve, eixoAng(Y(), 1.2 * GRAU * Math.sin(T * p)));
  girar(r.peito, eixoAng(X(), -1.2 * GRAU * Math.sin(2 * T * p)).multiply(eixoAng(Y(), -1.5 * GRAU * Math.sin(T * p))));
  girar(r.pescoco, eixoAng(Y(), 6 * GRAU * Math.sin(T * p + 0.8)).multiply(eixoAng(X(), 1.5 * GRAU * Math.sin(2 * T * p + 1.3))));
  for (const l of Object.values(r.lados)) {
    girar(l.braco, eixoAng(X(), 2 * GRAU * Math.sin(2 * T * p + l.sinal)));
    girar(l.antebraco, eixoAng(X(), -2.5 * GRAU * Math.sin(2 * T * p + 0.6 + l.sinal)));
  }
  const flexoes = {};
  for (const [nome, l] of Object.entries(r.lados)) flexoes[nome] = porPe(r, l, alvos[nome], alvos[nome].polo);
  return flexoes;
}

// De pé e de frente (o Idle dos do Alliance): quadril quadrado com o corpo, pés plantados um pouco
// por fora dele, joelhos levemente dobrados, braços soltos ao lado do corpo e a respiração. giroPeito
// e bracos(l) -> [abertura, balanço, cotovelo] servem ao soco, que parte desta pose.
function poseDePe(r, p, abertura, giroPeito = 0, bracos = null) {
  const T = Math.PI * 2;
  const L = r.perna;
  const g = PARADO;
  const resp = Math.sin(T * p);
  const h = (g.altura * L + r.lados.e.alturaTornozelo + r.chao) - r.quadril0.y;
  mover(r.pelve, v3(0.004 * L * resp, h - g.respira * L * (1 - Math.cos(2 * T * p)), 0));
  girar(r.pelve, eixoAng(Y(), 1.2 * GRAU * resp + giroPeito * 0.3).multiply(esquadrar(r)));
  const ombros = posMundo(r.lados.e.braco).sub(posMundo(r.lados.d.braco));
  const torto = new THREE.Quaternion().setFromUnitVectors(v3(ombros.x, 0, ombros.z).normalize(), X());
  girar(r.peito, eixoAng(Y(), giroPeito * 0.7 - 1.5 * GRAU * resp)
    .multiply(eixoAng(X(), -1.2 * GRAU * Math.sin(2 * T * p)))
    .multiply(torto));
  // a cabeça desfaz o giro do corpo: o olhar fica para a frente
  girar(r.pescoco, eixoAng(Y(), -giroPeito + 6 * GRAU * Math.sin(T * p + 0.8)).multiply(eixoAng(X(), 1.5 * GRAU * Math.sin(2 * T * p + 1.3))));
  const frente = Z().applyAxisAngle(Y(), giroPeito);
  const lado = X().applyAxisAngle(Y(), giroPeito);
  for (const l of Object.values(r.lados)) {
    const [ab, bal, cot] = bracos?.(l)
      ?? [abertura * GRAU, (4 + 2 * Math.sin(2 * T * p + l.sinal)) * GRAU, (16 + 3 * Math.sin(2 * T * p + 0.6 + l.sinal)) * GRAU];
    porBraco(l, ab, bal, cot, frente, lado);
  }
  const flexoes = {};
  for (const [nome, l] of Object.entries(r.lados)) {
    const alvo = pePlantado(r, l, l.quadril0.x + l.sinal * g.largura * L, r.quadril0.z, 0, null);
    flexoes[nome] = porPe(r, l, alvo, l.frente.clone().add(v3(0, 0.15, 0)).normalize());
  }
  return flexoes;
}

// Soco: direto de direita saindo da guarda. Recua um pouco, estica o braço reto à frente com o peito
// girando junto e volta para a guarda; a esquerda fica protegendo o rosto. O primeiro e o último
// quadro são a guarda: o jogo mistura dela para o estado em que a pessoa estava.
function poseSoco(r, p, abertura) {
  const recua = p < 0.22 ? Math.sin((Math.PI * p) / 0.22) : 0;
  const estica = p < 0.22 ? 0 : p < 0.4 ? suave((p - 0.22) / 0.18) : 1 - suave((p - 0.48) / 0.52);
  const guarda = [abertura * 0.4 * GRAU, 30 * GRAU, 100 * GRAU];
  return poseDePe(r, 0, abertura, (22 * estica - 6 * recua) * GRAU, (l) => {
    if (l.sinal > 0) return guarda;
    return [
      lerp(guarda[0], 4 * GRAU, estica),
      lerp(guarda[1] - 12 * GRAU * recua, 84 * GRAU, estica),
      lerp(guarda[2] + 10 * GRAU * recua, 6 * GRAU, estica),
    ];
  });
}

// No ar: um joelho em cima, a outra perna esticando para baixo, braços abertos se equilibrando.
function poseNoAr(r, p, abertura) {
  const T = Math.PI * 2;
  const L = r.perna;
  const b = Math.sin(T * p);
  mover(r.pelve, v3(0, (0.93 * L + r.lados.e.alturaTornozelo + r.chao) - r.quadril0.y + 0.01 * L * b, 0));
  girar(r.pelve, eixoAng(X(), 6 * GRAU).multiply(esquadrar(r)));
  const ombros = posMundo(r.lados.e.braco).sub(posMundo(r.lados.d.braco));
  const torto = new THREE.Quaternion().setFromUnitVectors(v3(ombros.x, 0, ombros.z).normalize(), X());
  girar(r.peito, eixoAng(X(), (-4 + 1.5 * b) * GRAU).multiply(torto));
  girar(r.pescoco, eixoAng(X(), -2 * GRAU));
  for (const l of Object.values(r.lados)) porBraco(l, (abertura + 32 + 4 * l.sinal * b) * GRAU, (14 - 6 * l.sinal * b) * GRAU, 55 * GRAU, Z(), X());
  const flexoes = {};
  for (const [nome, l] of Object.entries(r.lados)) {
    const x = l.quadril0.x + l.sinal * 0.04 * L;
    const sobe = nome === 'e' ? 0.42 + 0.03 * b : 0.14 - 0.03 * b;
    const adiante = nome === 'e' ? 0.24 : -0.12;
    const alvo = pePlantado(r, l, x, r.quadril0.z + adiante * L, nome === 'e' ? 12 * GRAU : 28 * GRAU, null);
    alvo.tornozelo.y += sobe * L;
    flexoes[nome] = porPe(r, l, alvo, l.frente.clone().add(v3(0, 0.4, 0)).normalize());
  }
  return flexoes;
}

// ---------------------------------------------------------------- gravar
function lerCanal(c) {
  if (c.caminho === 'rotation') return c.o.quaternion.toArray();
  if (c.caminho === 'translation') return c.o.position.toArray();
  return c.o.scale.toArray();
}

// fixos: canal parado -> acessor, para os quatro clipes usarem o mesmo (cada acessor pesa no JSON)
function gravarClipe(doc, r, nome, def, cfg, medir, fixos) {
  const n = Math.round(def.duracao * def.fps);
  const tempos = Array.from({ length: n + 1 }, (_, i) => (i * def.duracao) / n);
  const valores = r.canais.map(() => []);
  const relato = [];
  for (let i = 0; i <= n; i++) {
    r.resetar();
    const flexoes = def.pose(r, (i % n) / n, cfg.abertura, cfg); // o último quadro é o primeiro: o laço fecha sem tranco
    r.raiz.updateMatrixWorld(true);
    r.canais.forEach((c, k) => {
      const v = lerCanal(c);
      const ant = valores[k][valores[k].length - 1];
      // quaternião vizinho do mesmo lado da esfera, senão a interpolação dá a volta longa
      if (ant && c.caminho === 'rotation' && v[0] * ant[0] + v[1] * ant[1] + v[2] * ant[2] + v[3] * ant[3] < 0) for (let j = 0; j < 4; j++) v[j] = -v[j];
      valores[k].push(v);
    });
    if (medir && i < n) {
      const sola = (l) => (r.solaAgora(l) - r.chao).toFixed(3);
      relato.push(`  ${String(i).padStart(2)}  sola E ${sola(r.lados.e)}  D ${sola(r.lados.d)}   joelho E ${flexoes.e.toFixed(0).padStart(3)}°  D ${flexoes.d.toFixed(0).padStart(3)}°`);
    }
  }
  if (medir) {
    console.log(`${nome} (${n} quadros, perna ${r.perna.toFixed(2)}, chão ${r.chao.toFixed(3)})`);
    console.log(relato.join('\n'));
    return;
  }

  const buf = doc.getRoot().listBuffers()[0];
  const acessor = (tipo, dados) => doc.createAccessor().setType(tipo).setArray(new Float32Array(dados)).setBuffer(buf);
  const entradaCheia = acessor('SCALAR', tempos);
  const entradaCurta = acessor('SCALAR', [0, def.duracao]);
  const anim = doc.createAnimation(nome);
  r.canais.forEach((c, k) => {
    const vs = valores[k];
    const fixo = vs.every((v) => v.every((x, j) => Math.abs(x - vs[0][j]) < 1e-6));
    const tipo = c.caminho === 'rotation' ? 'VEC4' : 'VEC3';
    let saida;
    if (fixo) {
      const chave = c.o.uuid + c.caminho;
      if (!fixos.has(chave)) fixos.set(chave, acessor(tipo, [...vs[0], ...vs[0]]));
      saida = fixos.get(chave);
    } else {
      saida = acessor(tipo, vs.flat());
    }
    const sampler = doc.createAnimationSampler()
      .setInput(fixo ? entradaCurta : entradaCheia)
      .setOutput(saida)
      .setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.o.userData.no).setTargetPath(c.caminho).setSampler(sampler));
  });
}

(async () => {
  THREE = await import('three');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const medir = process.argv.includes('--medir');
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const id of pedidos.length ? pedidos : Object.keys(MODELOS)) {
    const cfg = MODELOS[id];
    if (!cfg) throw new Error(`não conheço ${id}`);
    const arq = path.join(__dirname, '..', 'public', 'models', id + '.glb');
    const antes = fs.statSync(arq).size;
    const doc = await io.read(arq);
    removerGerados(doc);
    const r = montar(doc, cfg);
    const fixos = new Map();
    for (const nome of cfg.clipes) gravarClipe(doc, r, nome, CLIPES[nome], cfg, medir, fixos);
    if (medir) continue;
    for (const a of doc.getRoot().listAnimations()) if ((cfg.descartar || []).includes(a.getName())) descartarAnimacao(a);
    await io.write(arq, doc);
    const depois = fs.statSync(arq).size;
    console.log(id.padEnd(8), Math.round(antes / 1024) + ' KB -> ' + Math.round(depois / 1024) + ' KB', '| clipes:', doc.getRoot().listAnimations().map((a) => a.getName()).join(', '));
  }
})().catch((e) => { console.error('falha:', e.stack || e.message); process.exit(1); });
