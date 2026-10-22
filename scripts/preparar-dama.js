// A Dama de Véu, o 13º monstro do Caça-Fantasmas: a "Ghost Lady v2 (WIP)" de Loves_Art (Sketchfab,
// CC BY 4.0, https://sketchfab.com/3d-models/ghost-lady-v2-wip-a453a33fb311400d9dda4b113d59b7bc), de
// véu e vestido preto, com o cabelo cobrindo o rosto. Lê models-brutos/ghost-lady.glb (o .glb do botão
// de download, 160 MB) e grava public/models/fantasmas/dama.glb.
//
//   npm i --prefix ../gt @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   NODE_PATH=../gt/node_modules node scripts/preparar-dama.js
//
// O original tem 102 mil triângulos, dez texturas de 4096 px e um clipe só (andar). O vestido, o véu e
// o cabelo não têm esqueleto: são uma simulação de pano gravada quadro a quadro (74 formas por peça),
// que só serve para aquele andar. Aqui:
//   - vestido, véu e cabelo ganham pesos do esqueleto do corpo, na pose de repouso (a do arquivo, que é
//     a mesma do pano parado). O vestido é uma peça só, com mangas: cada ponto dele é ligado à parte do
//     corpo mais perto por dentro do pano (ver regioes()), senão a ponta da manga, que pende ao lado do
//     quadril, ia junto com a coxa. A saia segue as coxas e um pouco o quadril, não as canelas (senão
//     abre como calça). Véu e cabelo seguem a cabeça e, mais embaixo, os ombros e o peito;
//   - saem as formas gravadas, os olhos e os cílios (ficam embaixo do cabelo), o esqueleto do cabelo e
//     o pedaço do corpo que o vestido cobre (ver cobertos()), que só furava o pano;
//   - os triângulos caem para uns 20 mil (meshopt) e as texturas para 1024 px em webp; fica só a cor
//     (o jogo troca o material pelo assombrado, que não usa o resto);
//   - além do andar (Walk), ganha Idle, Run e Attack, feitos osso a osso aqui (ver poseParado,
//     poseCorrer e poseAtaque).
// Para mexer nos movimentos, mude os números das poses, rode de novo e suba o ?v= de MODELO_URL em
// public/js/fantasmas-dados.js.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup, resample, meshopt, weld, simplifyPrimitive, textureCompress } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
const sharp = require('sharp');

let THREE; // módulo ES: entra por import() no começo

const ENTRADA = path.join(__dirname, '..', 'models-brutos', 'ghost-lady.glb');
const SAIDA = process.env.SAIDA || path.join(__dirname, '..', 'public', 'models', 'fantasmas', 'dama.glb');
const GRAU = Math.PI / 180;
// quantos triângulos sobram de cada parte (fração do original)
const REDUZIR = { corpo: 0.28, roupa: 0.2, cabelo: 0.45 };
const TEXTURA = 1024;

// ---------------------------------------------------------------- matemática
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const eixoAng = (eixo, ang) => new THREE.Quaternion().setFromAxisAngle(eixo, ang);
const suave = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const X = () => v3(1, 0, 0);
const Y = () => v3(0, 1, 0);
const Z = () => v3(0, 0, 1);
// tremor: soma de senos sem período curto (parece aleatório, mas é o mesmo em todo quadro)
const tremor = (t, s) => (Math.sin(t * 37.1 + s) + Math.sin(t * 23.7 + s * 2.3) * 0.7 + Math.sin(t * 51.3 + s * 0.7) * 0.5) / 2.2;

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
function mover(o, delta) {
  const alvo = posMundo(o).add(delta);
  o.parent.updateWorldMatrix(true, false);
  o.position.copy(o.parent.worldToLocal(alvo));
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

// Uma malha no mundo, na pose de repouso: posição, normal, uv e triângulos. Com esqueleto, ponto =
// Σ peso · osso · IBM · v (os ossos ainda no repouso); sem, a matriz do nó.
function malhaNoMundo(no, objs) {
  const prim = no.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION');
  const N = prim.getAttribute('NORMAL');
  const T = prim.getAttribute('TEXCOORD_0');
  const skin = no.getSkin();
  const n = P.getCount();
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const v = v3();
  const w = v3();
  let mats = null;
  if (skin) {
    const ibm = skin.getInverseBindMatrices();
    mats = skin.listJoints().map((j, i) => objs.get(j).matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(ibm.getElement(i, []))));
  }
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const M = new THREE.Matrix4();
  const normal = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    if (mats) {
      M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      const j = J.getElement(i, []);
      const p = W.getElement(i, []);
      for (let k = 0; k < 4; k++) if (p[k]) for (let e = 0; e < 16; e++) M.elements[e] += mats[j[k]].elements[e] * p[k];
    } else M.copy(objs.get(no).matrixWorld);
    normal.getNormalMatrix(M);
    v.fromArray(P.getElement(i, [])).applyMatrix4(M).toArray(pos, i * 3);
    w.fromArray(N.getElement(i, [])).applyMatrix3(normal).normalize().toArray(nor, i * 3);
    if (T) uv.set(T.getElement(i, []), i * 2);
  }
  return { pos, nor, uv, idx: Array.from(prim.getIndices().getArray()), material: prim.getMaterial() };
}

function juntar(lista) {
  const total = lista.reduce((s, m) => s + m.pos.length / 3, 0);
  const r = { pos: new Float32Array(total * 3), nor: new Float32Array(total * 3), uv: new Float32Array(total * 2), idx: [], material: lista[0].material };
  let base = 0;
  for (const m of lista) {
    r.pos.set(m.pos, base * 3);
    r.nor.set(m.nor, base * 3);
    r.uv.set(m.uv, base * 2);
    for (const i of m.idx) r.idx.push(i + base);
    base += m.pos.length / 3;
  }
  return r;
}

// Grade para achar os vizinhos mais perto sem passar por todos
class Grade {
  constructor(pos, lado = 0.04) {
    this.lado = lado;
    this.pos = pos;
    this.celulas = new Map();
    for (let i = 0; i < pos.length / 3; i++) {
      const k = this.chave(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (!this.celulas.has(k)) this.celulas.set(k, []);
      this.celulas.get(k).push(i);
    }
  }
  chave(x, y, z) { return `${Math.floor(x / this.lado)},${Math.floor(y / this.lado)},${Math.floor(z / this.lado)}`; }
  // os k mais perto de (x, y, z) que passam no filtro: [[índice, distância²], ...]
  perto(x, y, z, k = 1, filtro = null, raioMax = 0.6) {
    const cx = Math.floor(x / this.lado);
    const cy = Math.floor(y / this.lado);
    const cz = Math.floor(z / this.lado);
    const achados = [];
    for (let r = 0; r * this.lado <= raioMax; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let l = -r; l <= r; l++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(l)) !== r) continue; // só a casca nova
        const lista = this.celulas.get(`${cx + i},${cy + j},${cz + l}`);
        if (!lista) continue;
        for (const p of lista) {
          if (filtro && !filtro(p)) continue;
          const dx = this.pos[p * 3] - x;
          const dy = this.pos[p * 3 + 1] - y;
          const dz = this.pos[p * 3 + 2] - z;
          achados.push([p, dx * dx + dy * dy + dz * dz]);
        }
      }
      // a casca r cobre tudo até r·lado: com k achados mais perto que isso, acabou
      if (achados.length >= k) {
        achados.sort((a, b) => a[1] - b[1]);
        if (achados[k - 1][1] <= (r * this.lado) ** 2) return achados.slice(0, k);
      }
    }
    achados.sort((a, b) => a[1] - b[1]);
    return achados.slice(0, k);
  }
}

// ---------------------------------------------------------------- pesos do pano
// Partes do corpo, pelos ossos. As pontas (dedos, pé) entram no osso grande delas.
const REGIAO = (nome) => {
  if (/^Left(Arm|ForeArm|Hand)/.test(nome)) return 'bracoE';
  if (/^Right(Arm|ForeArm|Hand)/.test(nome)) return 'bracoD';
  if (/(UpLeg|Leg|Foot|Toe)/.test(nome)) return 'pernas';
  if (/^(Head|HeadTop|Neck|SoftHair)/.test(nome)) return 'cabeca';
  return 'tronco'; // quadril, coluna, ombros, seios
};
// o osso que o pano usa no lugar de cada um: a saia não segue a canela nem o pé, a manga não
// segue os dedos
const NO_PANO = (nome) => nome
  .replace(/^(Left|Right)(Leg|Foot|ToeBase|Toe_End)$/, '$1UpLeg')
  .replace(/^(Left|Right)Hand.+$/, '$1Hand');

// Triângulos de uma malha numa grade, para lançar raios curtos nela
class GradeTri {
  constructor(m, lado = 0.05) {
    this.m = m;
    this.lado = lado;
    this.cel = new Map();
    const a = v3(); const b = v3(); const c = v3();
    for (let t = 0; t < m.idx.length / 3; t++) {
      a.fromArray(m.pos, m.idx[t * 3] * 3);
      b.fromArray(m.pos, m.idx[t * 3 + 1] * 3);
      c.fromArray(m.pos, m.idx[t * 3 + 2] * 3);
      const mn = a.clone().min(b).min(c);
      const mx = a.clone().max(b).max(c);
      for (let x = Math.floor(mn.x / lado); x <= Math.floor(mx.x / lado); x++) {
        for (let y = Math.floor(mn.y / lado); y <= Math.floor(mx.y / lado); y++) {
          for (let z = Math.floor(mn.z / lado); z <= Math.floor(mx.z / lado); z++) {
            const k = `${x},${y},${z}`;
            if (!this.cel.has(k)) this.cel.set(k, []);
            this.cel.get(k).push(t);
          }
        }
      }
    }
  }
  // o primeiro triângulo que o raio (origem, dir) toca até a distância alcance: { t, d } ou null
  raio(origem, dir, alcance) {
    const raio = new THREE.Ray(origem, dir);
    const a = v3(); const b = v3(); const c = v3(); const ponto = v3();
    const vistos = new Set();
    let melhor = null;
    for (let s = 0; s <= alcance + this.lado; s += this.lado / 2) {
      const p = origem.clone().addScaledVector(dir, Math.min(s, alcance));
      const lista = this.cel.get(`${Math.floor(p.x / this.lado)},${Math.floor(p.y / this.lado)},${Math.floor(p.z / this.lado)}`);
      for (const t of lista || []) {
        if (vistos.has(t)) continue;
        vistos.add(t);
        a.fromArray(this.m.pos, this.m.idx[t * 3] * 3);
        b.fromArray(this.m.pos, this.m.idx[t * 3 + 1] * 3);
        c.fromArray(this.m.pos, this.m.idx[t * 3 + 2] * 3);
        if (!raio.intersectTriangle(a, b, c, false, ponto)) continue;
        const d = ponto.distanceTo(origem);
        if (d < alcance && (!melhor || d < melhor.d)) melhor = { t, d };
      }
      // tudo até aqui já foi visto: o achado mais perto que o passo atual não muda mais
      if (melhor && melhor.d < s - this.lado) break;
    }
    return melhor;
  }
}

// Rótulo de cada ponto do vestido (que parte do corpo ele veste). Saindo do ponto para DENTRO do pano
// (contra a normal), o primeiro pedaço do corpo que o raio toca até 15 cm: a manga, mesmo pendendo
// ao lado do quadril, envolve o antebraço, e o raio para dentro dela acha o braço. O resto (a boca da
// manga além da mão, a barra da saia) leva o rótulo do ponto rotulado mais perto ANDANDO PELO PANO
// (Dijkstra): pelo pano, a boca da manga fica perto do braço e longe do quadril.
function regioes(pano, corpo, corpoMundo, gradeCorpo) {
  const n = pano.pos.length / 3;
  // soldar por posição para andar pelo pano (as peças vêm cortadas nas costuras)
  const chave = new Map();
  const solda = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pano.pos[i * 3] * 2000)},${Math.round(pano.pos[i * 3 + 1] * 2000)},${Math.round(pano.pos[i * 3 + 2] * 2000)}`;
    if (!chave.has(k)) chave.set(k, i);
    solda[i] = chave.get(k);
  }
  const viz = new Map();
  const ligar = (a, b) => {
    if (a === b) return;
    if (!viz.has(a)) viz.set(a, new Set());
    viz.get(a).add(b);
  };
  for (let t = 0; t < pano.idx.length; t += 3) {
    const [a, b, c] = [solda[pano.idx[t]], solda[pano.idx[t + 1]], solda[pano.idx[t + 2]]];
    ligar(a, b); ligar(b, a); ligar(b, c); ligar(c, b); ligar(a, c); ligar(c, a);
  }
  const dist = new Float64Array(n).fill(Infinity);
  const rotulo = new Array(n).fill(null);
  const fila = [];
  // a normal do pano aponta para fora ou para dentro? O lado em que mais raios acham o corpo perto.
  const lancar = (i, sinal, alcance) => {
    const dir = v3().fromArray(pano.nor, i * 3).multiplyScalar(sinal).normalize();
    // começa 1 cm para fora: o pano colado às vezes entra um pouco no corpo
    const origem = v3().fromArray(pano.pos, i * 3).addScaledVector(dir, -0.01);
    return gradeCorpo.raio(origem, dir, alcance + 0.01);
  };
  let fora = 0;
  let dentro = 0;
  for (let i = 0; i < n; i += 37) {
    if (lancar(i, -1, 0.04)) fora++;
    if (lancar(i, 1, 0.04)) dentro++;
  }
  const sinal = fora >= dentro ? -1 : 1;
  for (let i = 0; i < n; i++) {
    if (solda[i] !== i) continue;
    const toque = lancar(i, sinal, 0.15);
    if (!toque) continue;
    const vs = [0, 1, 2].map((k) => corpoMundo.idx[toque.t * 3 + k]);
    const votos = {};
    for (const v of vs) votos[corpo.regiao[v]] = (votos[corpo.regiao[v]] || 0) + 1;
    dist[i] = 0;
    rotulo[i] = Object.entries(votos).sort((a, b) => b[1] - a[1])[0][0];
    fila.push([0, i]);
  }
  // distância pelo pano até a fonte mais perto (Dijkstra; fila de prioridade num heap binário)
  const andarPeloPano = (fontes, dist, rotulo = null) => {
    const heap = [];
    const subir = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const descer = (i) => { for (;;) { const l = i * 2 + 1; const r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
    for (const i of fontes) { dist[i] = 0; heap.push([0, i]); subir(heap.length - 1); }
    while (heap.length) {
      const [d, a] = heap[0];
      const ult = heap.pop();
      if (heap.length) { heap[0] = ult; descer(0); }
      if (d > dist[a]) continue;
      for (const b of viz.get(a) || []) {
        const dx = pano.pos[a * 3] - pano.pos[b * 3];
        const dy = pano.pos[a * 3 + 1] - pano.pos[b * 3 + 1];
        const dz = pano.pos[a * 3 + 2] - pano.pos[b * 3 + 2];
        const nd = d + Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (nd < dist[b]) {
          dist[b] = nd;
          if (rotulo) rotulo[b] = rotulo[a];
          heap.push([nd, b]);
          subir(heap.length - 1);
        }
      }
    }
  };
  const sementes = fila.map(([, i]) => i);
  andarPeloPano(sementes, dist, rotulo);
  // A manga é de morcego: costurada na lateral do corpete até a cintura. Do braço até essa costura ela
  // passa aos poucos do braço para o tronco (leque), senão o braço erguido puxava uma tira de pano.
  // bracoAte[i]: quanto da manga segue o braço (1 colada nele, 0 na costura).
  const ehBraco = (r) => r === 'bracoE' || r === 'bracoD';
  const dBraco = new Float64Array(n).fill(Infinity);
  const dResto = new Float64Array(n).fill(Infinity);
  andarPeloPano(sementes.filter((i) => ehBraco(rotulo[i])), dBraco);
  andarPeloPano(sementes.filter((i) => !ehBraco(rotulo[i])), dResto);
  const bracoAte = Array.from(solda, (s) => {
    if (!ehBraco(rotulo[s]) || !Number.isFinite(dResto[s])) return 1;
    return Math.pow(dResto[s] / (dBraco[s] + dResto[s] + 1e-6), 0.7);
  });
  return { rotulo: Array.from(solda, (s) => rotulo[s] || 'tronco'), semente: Array.from(solda, (s) => dist[s] === 0), bracoAte };
}

// Pesos de um ponto: a média dos 6 vértices do corpo mais perto (só os das regiões que valem), com
// o peso pela distância. Volta Map osso -> peso.
function pesosPerto(corpo, grade, x, y, z, valem) {
  const viz = grade.perto(x, y, z, 6, (p) => valem.has(corpo.regiao[p]));
  const soma = new Map();
  let total = 0;
  for (const [p, d2] of viz) {
    const f = 1 / (d2 + 1e-5);
    total += f;
    for (let k = 0; k < 4; k++) {
      const w = corpo.pesos[p * 4 + k];
      if (!w) continue;
      const j = corpo.noPano[corpo.juntas[p * 4 + k]];
      soma.set(j, (soma.get(j) || 0) + w * f);
    }
  }
  for (const [j, w] of soma) soma.set(j, w / total);
  return soma;
}

function misturar(a, b, t) {
  const r = new Map();
  for (const [j, w] of a) r.set(j, (r.get(j) || 0) + w * (1 - t));
  for (const [j, w] of b) r.set(j, (r.get(j) || 0) + w * t);
  return r;
}

// os 4 maiores, somando 1
function quatro(m) {
  const l = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = l.reduce((t, [, w]) => t + w, 0) || 1;
  while (l.length < 4) l.push([0, 0]);
  return l.map(([j, w]) => [j, w / s]);
}

// ---------------------------------------------------------------- o corpo coberto
// Vértices do corpo que o vestido cobre: saindo pela normal, o pano está a menos de 7 cm (nas
// pernas, 12 cm: a saia é folgada). Triângulo com os três cobertos sai (nem aparece, e só furava o
// pano no movimento).
function cobertos(corpoMundo, corpo, pano) {
  const grade = new GradeTri(pano);
  const n = corpoMundo.pos.length / 3;
  const coberto = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const origem = v3().fromArray(corpoMundo.pos, i * 3);
    const dir = v3().fromArray(corpoMundo.nor, i * 3).normalize();
    if (grade.raio(origem, dir, corpo.regiao[i] === 'pernas' ? 0.12 : 0.07)) coberto[i] = 1;
  }
  return coberto;
}

// ---------------------------------------------------------------- as poses
// r: { ossos (nome curto -> Object3D), resetar(), andar(t) }. Ele olha para +z, a esquerda é +x.

// Andar: o do arquivo (passo de passarela, cruzando as pernas), com as pernas a 60% do balanço em
// volta da pose média. O pano preso ao esqueleto não acompanha a passada inteira: a saia esticava
// para trás e a canela furava o vestido.
const PASSO = 0.6;
const ANDAR = { duracao: 1.25, fps: 30 };
const poseAndar = (r, f) => r.andar(f);

// Parado: de pé como no repouso, curvada, a cabeça tombada para a direita, respirando devagar e
// balançando um pouco; no meio do ciclo a cabeça dá um tranco para o outro lado e volta.
const PARADO = { duracao: 4, fps: 15 };
function poseParado(r, f) {
  const o = r.ossos;
  const t = f * PARADO.duracao;
  const ciclo = f * Math.PI * 2;
  girar(o.Hips, eixoAng(Z(), Math.sin(ciclo) * 1.5 * GRAU));
  girar(o.Hips, eixoAng(Y(), Math.sin(ciclo + 1) * 2 * GRAU));
  girar(o.Spine, eixoAng(X(), 6 * GRAU));
  girar(o.Spine1, eixoAng(X(), (4 + Math.sin(ciclo * 2) * 1.2) * GRAU));
  girar(o.Spine2, eixoAng(X(), Math.sin(ciclo * 2 + 0.5) * 1.5 * GRAU));
  // o tranco: rápido para lá, devagar de volta
  const tranco = suave(0.55, 0.58, f) * (1 - suave(0.62, 0.8, f));
  girar(o.Neck, eixoAng(Z(), (8 - tranco * 10) * GRAU));
  girar(o.Head, eixoAng(X(), (10 + Math.sin(ciclo) * 2) * GRAU));
  girar(o.Head, eixoAng(Z(), (22 + Math.sin(ciclo * 3) * 3 - tranco * 30) * GRAU));
  // os braços largados, um pouco para a frente, e os dedos tremendo
  for (const [s, lado] of [[1, 'Left'], [-1, 'Right']]) {
    girar(o[`${lado}Arm`], eixoAng(X(), -(6 + Math.sin(ciclo + s) * 2) * GRAU));
    girar(o[`${lado}Hand`], eixoAng(X(), tremor(t * 0.25, s) * 4 * GRAU));
  }
}

// Correr (a caçada): o andar do arquivo mais rápido, curvada para a frente e com os braços
// esticados para pegar, subindo e descendo um pouco fora de compasso, a cabeça tombada e tremendo.
const CORRER = { duracao: 0.78, fps: 30 };
function poseCorrer(r, f) {
  const o = r.ossos;
  r.andar(f);
  const ciclo = f * Math.PI * 2;
  girar(o.Spine, eixoAng(X(), 12 * GRAU));
  girar(o.Spine1, eixoAng(X(), 8 * GRAU));
  girar(o.Neck, eixoAng(X(), -10 * GRAU));
  girar(o.Head, eixoAng(Z(), (16 + tremor(f * 3, 2) * 6) * GRAU));
  for (const [s, lado] of [[1, 'Left'], [-1, 'Right']]) {
    const sobe = Math.sin(ciclo + (s > 0 ? 0 : 2.2)) * 0.12;
    const dir = v3(0.22 * s, -0.12 + sobe, 1);
    apontar(o[`${lado}Arm`], o[`${lado}ForeArm`], dir);
    apontar(o[`${lado}ForeArm`], o[`${lado}Hand`], dir.clone().add(v3(0, 0.1, 0)));
    // mão caída, de dedos para baixo
    apontar(o[`${lado}Hand`], o[`${lado}HandMiddle1`], dir.clone().add(v3(0, -0.7, 0)));
  }
}

// O ataque (o susto, colado na câmera): um tranco para a frente, na ponta dos pés, os dois braços
// sobem para agarrar o rosto de quem está na frente; segura tremendo, e a cabeça tomba de um lado
// para o outro. Toca uma vez e para no último quadro.
const ATAQUE = { duracao: 1.3, fps: 30 };
function poseAtaque(r, f) {
  const o = r.ossos;
  const t = f * ATAQUE.duracao;
  const k = suave(0, 0.13, t);
  const tr = suave(0.08, 0.2, t);
  mover(o.Hips, v3(0, 0.05 * k, 0.12 * k));
  girar(o.Spine, eixoAng(X(), 14 * k * GRAU));
  girar(o.Spine1, eixoAng(X(), 10 * k * GRAU));
  girar(o.Spine2, eixoAng(X(), 6 * k * GRAU));
  const lado = suave(0.45, 0.55, t);
  girar(o.Neck, eixoAng(X(), -6 * k * GRAU));
  girar(o.Head, eixoAng(Z(), (lerp(24, -18, lado) * k + tremor(t, 1) * 5 * tr) * GRAU));
  girar(o.Head, eixoAng(X(), (tremor(t, 4) * 4 * tr) * GRAU));
  for (const [s, l] of [[1, 'Left'], [-1, 'Right']]) {
    const dir = v3(0.3 * s + tremor(t, s * 3) * 0.05 * tr, 0.32 + tremor(t, s * 5) * 0.06 * tr, 1);
    apontar(o[`${l}Arm`], o[`${l}ForeArm`], dir, k);
    apontar(o[`${l}ForeArm`], o[`${l}Hand`], dir.clone().add(v3(-0.1 * s, 0.05, 0)), k);
    // garra: a mão dobra para cima
    apontar(o[`${l}Hand`], o[`${l}HandMiddle1`], dir.clone().add(v3(0, 0.5, 0)), k);
  }
}

const CLIPES = [
  ['Walk', ANDAR, poseAndar, true],
  ['Idle', PARADO, poseParado, true],
  ['Run', CORRER, poseCorrer, true],
  ['Attack', ATAQUE, poseAtaque, false],
];

// ---------------------------------------------------------------- gravar
function amostrar(sampler, t) {
  const tin = sampler.getInput().getArray();
  const out = sampler.getOutput();
  const n = tin.length;
  const cubica = sampler.getInterpolation() === 'CUBICSPLINE';
  const el = (i) => out.getElement(cubica ? i * 3 + 1 : i, []);
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
  const entrada = acessor('SCALAR', tempos);
  const anim = doc.createAnimation(nome);
  r.canais.forEach((c, k) => {
    const sampler = doc.createAnimationSampler()
      .setInput(entrada)
      .setOutput(acessor(c.caminho === 'rotation' ? 'VEC4' : 'VEC3', valores[k].flat()))
      .setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.o.userData.no).setTargetPath(c.caminho).setSampler(sampler));
  });
}

// ---------------------------------------------------------------- tudo
(async () => {
  THREE = await import('three');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const antes = fs.statSync(ENTRADA).size;
  const doc = await io.read(ENTRADA);
  const raizDoc = doc.getRoot();
  const { raiz, objs } = espelhar(doc);
  const nos = raizDoc.listNodes();
  const noDaMalha = (nome) => nos.find((n) => n.getMesh()?.getName() === nome);
  const dentroDe = (n, re) => { for (let o = objs.get(n); o; o = o.parent) if (re.test(o.name)) return true; return false; };

  // o corpo: o esqueleto que fica, os pesos e os pontos no mundo
  const noCorpo = noDaMalha('17');
  const skin = noCorpo.getSkin();
  const juntasDoc = skin.listJoints();
  const nomes = juntasDoc.map((j) => curto(j.getName()));
  const primCorpo = noCorpo.getMesh().listPrimitives()[0];
  const corpoMundo = malhaNoMundo(noCorpo, objs);
  const nc = corpoMundo.pos.length / 3;
  const corpo = {
    juntas: new Uint16Array(nc * 4), pesos: new Float32Array(nc * 4), regiao: new Array(nc),
    noPano: nomes.map((nome) => {
      const i = nomes.indexOf(NO_PANO(nome));
      return i >= 0 ? i : nomes.indexOf(nome);
    }),
  };
  {
    const J = primCorpo.getAttribute('JOINTS_0');
    const W = primCorpo.getAttribute('WEIGHTS_0');
    for (let i = 0; i < nc; i++) {
      const j = J.getElement(i, []);
      const w = W.getElement(i, []);
      corpo.juntas.set(j, i * 4);
      corpo.pesos.set(w, i * 4);
      let maior = 0;
      for (let k = 1; k < 4; k++) if (w[k] > w[maior]) maior = k;
      corpo.regiao[i] = REGIAO(nomes[j[maior]]);
    }
  }
  const grade = new Grade(corpoMundo.pos, 0.03);
  const idx = (nome) => nomes.indexOf(nome);
  const yDe = (nome) => posMundo(objs.get(juntasDoc[idx(nome)])).y;

  // o pano no mundo (repouso: as formas gravadas em zero)
  const roupa = juntar(nos.filter((n) => n.getMesh() && dentroDe(n, /^Motion_Dress$/)).map((n) => malhaNoMundo(n, objs)));
  const veu = juntar(nos.filter((n) => n.getMesh() && dentroDe(n, /^Motion_Hood$/)).map((n) => malhaNoMundo(n, objs)));
  const cabelo = juntar([malhaNoMundo(noDaMalha('0'), objs), malhaNoMundo(noDaMalha('18'), objs)]);

  // vestido: a região de cada ponto (andando pelo pano) e, nela, os pesos dos vizinhos do corpo
  // a saia inteira: metade o quadril e metade as duas coxas juntas (ela balança com o passo, mas não
  // abre em duas como calça)
  const quadril = new Map([[idx('Hips'), 0.5], [idx('LeftUpLeg'), 0.25], [idx('RightUpLeg'), 0.25]]);
  const yQuadril = yDe('Hips');
  const yJoelho = (yDe('LeftLeg') + yDe('RightLeg')) / 2;
  // A manga só pega o braço dela, e o ombro (tronco) só perto da cava; saia e corpete não pegam braço
  const yCava = Math.min(yDe('LeftArm'), yDe('RightArm')) - 0.08;
  const VALEM = {
    bracoE: new Set(['bracoE']), bracoD: new Set(['bracoD']), pernas: new Set(['pernas', 'tronco']),
    tronco: new Set(['pernas', 'tronco']), cabeca: new Set(['cabeca', 'tronco']),
  };
  const comOmbro = { bracoE: new Set(['bracoE', 'tronco']), bracoD: new Set(['bracoD', 'tronco']) };
  const { rotulo, semente, bracoAte } = regioes(roupa, corpo, corpoMundo, new GradeTri(corpoMundo, 0.04));
  const pesosRoupa = [];
  for (let i = 0; i < roupa.pos.length / 3; i++) {
    const [x, y, z] = roupa.pos.subarray(i * 3, i * 3 + 3);
    const valem = y > yCava && comOmbro[rotulo[i]] ? comOmbro[rotulo[i]] : VALEM[rotulo[i]];
    let p = pesosPerto(corpo, grade, x, y, z, valem);
    if (bracoAte[i] < 1) p = misturar(p, pesosPerto(corpo, grade, x, y, z, VALEM.tronco), 1 - bracoAte[i]);
    // a saia: quanto mais embaixo, mais segue a saia inteira e menos a perna de perto
    if (!comOmbro[rotulo[i]] && y < yQuadril) p = misturar(p, quadril, 0.15 + 0.6 * suave(yQuadril, yJoelho, y));
    pesosRoupa.push(p);
  }
  // véu e cabelo: em cima, a cabeça; descendo do pescoço, cada vez mais os ombros e o peito
  const cabeca = new Map([[idx('Head'), 1]]);
  const yPescoco = yDe('Neck');
  const pesosDaCabeca = (m) => {
    const lista = [];
    for (let i = 0; i < m.pos.length / 3; i++) {
      const [x, y, z] = m.pos.subarray(i * 3, i * 3 + 3);
      const t = 0.75 * suave(yPescoco + 0.04, yPescoco - 0.3, y);
      lista.push(t > 0 ? misturar(cabeca, pesosPerto(corpo, grade, x, y, z, VALEM.tronco), t) : cabeca);
    }
    return lista;
  };
  const pesosVeu = pesosDaCabeca(veu);
  const pesosCabelo = pesosDaCabeca(cabelo);
  console.log('vestido por região:', JSON.stringify(rotulo.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {})));

  // o corpo coberto pelo vestido (e pelo véu) sai
  const coberto = cobertos(corpoMundo, corpo, juntar([roupa, veu]));
  {
    const ix = primCorpo.getIndices().getArray();
    const fica = [];
    for (let t = 0; t < ix.length; t += 3) if (!(coberto[ix[t]] && coberto[ix[t + 1]] && coberto[ix[t + 2]])) fica.push(ix[t], ix[t + 1], ix[t + 2]);
    console.log(`corpo: ${ix.length / 3} triângulos, ${fica.length / 3} fora do vestido`);
    primCorpo.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(fica)).setBuffer(raizDoc.listBuffers()[0]));
  }

  // De volta ao espaço do esqueleto: ponto = (Σ peso · osso · IBM)⁻¹ · mundo, para o jogo pôr no
  // mesmo lugar no repouso e levar junto nos movimentos.
  const ibm = skin.getInverseBindMatrices();
  const matJ = juntasDoc.map((j, i) => objs.get(j).matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(ibm.getElement(i, []))));
  const buf = raizDoc.listBuffers()[0];
  const criarPrim = (m, pesos, material) => {
    const n = m.pos.length / 3;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const J = new Uint16Array(n * 4);
    const W = new Float32Array(n * 4);
    const M = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    for (let i = 0; i < n; i++) {
      const q = quatro(pesos[i]);
      M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      q.forEach(([j, w], k) => {
        J[i * 4 + k] = j;
        W[i * 4 + k] = w;
        if (w) for (let e = 0; e < 16; e++) M.elements[e] += matJ[j].elements[e] * w;
      });
      inv.copy(M).invert();
      v3().fromArray(m.pos, i * 3).applyMatrix4(inv).toArray(pos, i * 3);
      nm.getNormalMatrix(inv);
      v3().fromArray(m.nor, i * 3).applyMatrix3(nm).normalize().toArray(nor, i * 3);
    }
    const ac = (tipo, arr) => doc.createAccessor().setType(tipo).setArray(arr).setBuffer(buf);
    return doc.createPrimitive()
      .setAttribute('POSITION', ac('VEC3', pos))
      .setAttribute('NORMAL', ac('VEC3', nor))
      .setAttribute('TEXCOORD_0', ac('VEC2', m.uv))
      .setAttribute('JOINTS_0', ac('VEC4', J))
      .setAttribute('WEIGHTS_0', ac('VEC4', W))
      .setIndices(ac('SCALAR', new Uint32Array(m.idx)))
      .setMaterial(material);
  };
  const pai = noCorpo.getParentNode();
  const novaMalha = (nome, prim) => {
    const no = doc.createNode(nome).setMesh(doc.createMesh(nome).addPrimitive(prim)).setSkin(skin);
    pai.addChild(no);
    return no;
  };
  const roupaVeu = juntar([roupa, veu]);
  const primRoupa = criarPrim(roupaVeu, [...pesosRoupa, ...pesosVeu], roupa.material);
  novaMalha('roupa', primRoupa);
  if (process.env.DEPURAR) {
    // a região de cada ponto em cor (claro: tocou o corpo; escuro: veio pelo pano; na manga, escuro é
    // a parte que segue o tronco)
    const CORES = { bracoE: [1, 0.1, 0.1], bracoD: [0.1, 0.3, 1], pernas: [0.1, 1, 0.1], tronco: [1, 1, 0], cabeca: [1, 1, 1] };
    const cor = new Float32Array((roupaVeu.pos.length / 3) * 3).fill(1);
    rotulo.forEach((r, i) => cor.set(CORES[r].map((c) => c * (bracoAte[i] < 1 ? 0.15 + 0.85 * bracoAte[i] : semente[i] ? 1 : 0.45)), i * 3));
    primRoupa.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(cor).setBuffer(buf));
  }
  novaMalha('cabelo', criarPrim(cabelo, pesosCabelo, cabelo.material));

  // o corpo sem as formas gravadas
  for (const t of primCorpo.listTargets()) { primCorpo.removeTarget(t); t.dispose(); }
  noCorpo.getMesh().setWeights([]);
  noCorpo.setName('corpo');

  // os clipes: o andar do arquivo é a base do Walk e do Run (só os ossos do corpo, e com o passo
  // menor, ver PASSO); ele mesmo sai no fim
  const andar = raizDoc.listAnimations()[0];
  const ossosCorpo = new Set(juntasDoc);
  const ossos = {};
  for (const j of juntasDoc) ossos[curto(j.getName())] = objs.get(j);
  const canaisAndar = andar.listChannels()
    .filter((c) => ossosCorpo.has(c.getTargetNode()) && ['rotation', 'translation'].includes(c.getTargetPath()))
    .map((c) => ({ o: objs.get(c.getTargetNode()), caminho: c.getTargetPath(), s: c.getSampler() }));
  const durAndar = Math.max(...andar.listSamplers().map((s) => s.getInput().getMax([])[0]));
  // a média de cada osso da perna no ciclo: o passo encolhe em volta dela
  const media = new Map();
  for (const c of canaisAndar) {
    if (c.caminho !== 'rotation' || !/(UpLeg|Leg|Foot|Toe)/.test(c.o.name)) continue;
    const soma = new THREE.Vector4();
    let ref = null;
    for (let i = 0; i < 40; i++) {
      const q = new THREE.Vector4().fromArray(amostrar(c.s, (i / 40) * durAndar));
      if (!ref) ref = q.clone();
      soma.addScaledVector(q, q.dot(ref) < 0 ? -1 : 1);
    }
    media.set(c.o, new THREE.Quaternion(soma.x, soma.y, soma.z, soma.w).normalize());
  }
  const base = [];
  raiz.traverse((o) => base.push([o, o.position.clone(), o.quaternion.clone()]));
  const r = {
    raiz, ossos,
    canais: [...juntasDoc.map((j) => ({ o: objs.get(j), caminho: 'rotation' })), { o: ossos.Hips, caminho: 'translation' }],
    resetar: () => { for (const [o, p, q] of base) { o.position.copy(p); o.quaternion.copy(q); } },
    andar: (f) => {
      for (const c of canaisAndar) {
        const v = amostrar(c.s, f * durAndar);
        if (c.caminho === 'rotation') c.o.quaternion.fromArray(v);
        else c.o.position.fromArray(v);
      }
      for (const [o, q] of media) o.quaternion.copy(q.clone().slerp(o.quaternion, PASSO));
    },
  };
  for (const [nome, def, pose, laco] of CLIPES) gravarClipe(doc, r, nome, def, pose, laco);
  for (const c of andar.listChannels()) c.dispose();
  for (const s of andar.listSamplers()) s.dispose();
  andar.dispose();

  // fora: olhos, cílios, o esqueleto e a malha velha do cabelo, o pano gravado
  const sai = nos.filter((n) => ['Object_109', 'Object_111', 'Object_113', 'Object_115', 'Motion_Dress', 'Motion_Hood', 'body', 'eyebrows', 'eyelashes', 'eyes'].includes(n.getName()));
  const apagar = (n) => { for (const f of n.listChildren()) apagar(f); n.dispose(); };
  for (const n of sai) apagar(n);
  for (const s of raizDoc.listSkins()) if (s !== skin) s.dispose();

  // materiais: só a cor (o jogo troca o material pelo assombrado, que não usa o resto)
  for (const m of raizDoc.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setNormalTexture(null).setEmissiveTexture(null).setOcclusionTexture(null);
    for (const p of m.listParents()) if (p.propertyType === 'Primitive') p.setAttribute('TANGENT', null);
  }
  await doc.transform(prune(), weld());
  // menos triângulos: cada parte com a sua fração
  for (const [nome, frac] of Object.entries(REDUZIR)) {
    for (const p of raizDoc.listMeshes().find((m) => m.getName() === (nome === 'corpo' ? '17' : nome))?.listPrimitives() || []) {
      const antesT = p.getIndices().getCount() / 3;
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: frac, error: 0.02, lockBorder: false });
      console.log(`${nome}: ${antesT} -> ${p.getIndices().getCount() / 3} triângulos`);
    }
  }
  await doc.transform(
    prune(),
    dedup(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURA, TEXTURA], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(SAIDA, doc);
  const tris = raizDoc.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`dama.glb: ${Math.round(antes / 1048576)} MB -> ${Math.round(fs.statSync(SAIDA).size / 1024)} KB, ${tris} triângulos, clipes: ${raizDoc.listAnimations().map((a) => a.getName()).join(', ')}`);
})().catch((e) => { console.error('falha:', e.stack || e.message); process.exit(1); });
