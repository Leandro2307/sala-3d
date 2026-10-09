// Onde o tiro pega. Antes todo mundo era três esferas empilhadas de 1,9 m: no Optimus (2,8 m de pé)
// o peito e a cabeça ficavam de fora, e transformado em carreta só um pedaço da cabine contava.
//
// Agora o personagem 3D vira uma caixa por osso, como nos jogos de tiro: cada vértice da malha vai
// para o osso que mais o puxa, e a caixa daquele osso é a que cerca os seus vértices, medida uma vez
// na pose de ligação (no espaço do próprio osso). No jogo a caixa anda com o osso: acompanha o passo,
// o soco, a transformação e a forma de veículo. O raio entra no espaço de cada caixa (a matriz inteira
// do osso, com escala) e testa contra ela; o parâmetro da reta não muda com a troca de espaço, então
// a distância de volta é a do mundo.
//
// Boneco padrão: as três esferas de sempre (é o tamanho dele). Carro desenhado em código: a caixa do
// carro.
import * as THREE from 'three';

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _raio = new THREE.Ray();
const _caixa = new THREE.Box3();

// caixas por cadastro de personagem: os clones têm as mesmas malhas, na mesma ordem, com os mesmos
// ossos (e o mesmo bindMatrix): medir uma vez serve para todos
const porModelo = new WeakMap();

const ESFERAS = [0.45, 0.95, 1.45];
const RAIO_ESFERA = 0.42;
// o carro do boneco padrão (avatars.js, criarCarro), no espaço do boneco
const CARRO = new THREE.Box3(new THREE.Vector3(-0.95, 0, -1.65), new THREE.Vector3(0.95, 1.15, 1.65));

function malhasDe(raiz) {
  const lista = [];
  raiz.traverse((o) => { if (o.isMesh) lista.push(o); });
  return lista;
}

// Uma caixa por osso com pelo menos 6 vértices (menos que isso é ponta de dedo, antena...), mais uma
// por malha rígida. Folga de 2,5% da altura do modelo em volta de cada uma: a malha de baixo
// polígono fica um tico para dentro do que se vê, e tiro de raspão no braço tem que pegar.
function medirCaixas(personagem) {
  const malhas = malhasDe(personagem.raiz);
  const caixas = [];
  let altura = 0;
  for (const malha of malhas) {
    const g = malha.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    altura = Math.max(altura, g.boundingBox.max.y - g.boundingBox.min.y);
  }
  malhas.forEach((malha, k) => {
    const g = malha.geometry;
    const pos = g.attributes.position;
    if (!malha.isSkinnedMesh || !g.attributes.skinIndex) {
      caixas.push({ malha: k, osso: -1, caixa: g.boundingBox.clone(), n: pos.count });
      return;
    }
    const ossos = malha.skeleton.bones;
    // vértice no espaço do osso, na pose de ligação: inversa do osso · bindMatrix · v
    const paraOsso = malha.skeleton.boneInverses.map((ibm) => new THREE.Matrix4().multiplyMatrices(ibm, malha.bindMatrix));
    const idx = g.attributes.skinIndex;
    const peso = g.attributes.skinWeight;
    const porOsso = new Map();
    for (let i = 0; i < pos.count; i++) {
      let j = idx.getX(i);
      let w = peso.getX(i);
      for (const [ji, wi] of [[idx.getY(i), peso.getY(i)], [idx.getZ(i), peso.getZ(i)], [idx.getW(i), peso.getW(i)]]) {
        if (wi > w) { j = ji; w = wi; }
      }
      if (!ossos[j]) continue;
      _v.fromBufferAttribute(pos, i).applyMatrix4(paraOsso[j]);
      let c = porOsso.get(j);
      if (!c) porOsso.set(j, (c = { caixa: new THREE.Box3(), n: 0 }));
      c.caixa.expandByPoint(_v);
      c.n++;
    }
    for (const [j, c] of porOsso) if (c.n >= 6) caixas.push({ malha: k, osso: j, caixa: c.caixa, n: c.n });
  });
  const folga = altura * 0.025;
  for (const c of caixas) c.caixa.expandByScalar(folga);
  return caixas;
}

function caixasDe(personagem) {
  let c = porModelo.get(personagem.def);
  if (!c) porModelo.set(personagem.def, (c = medirCaixas(personagem)));
  return c;
}

// Raio (origem, dir unitária) contra uma caixa no espaço dado por m: distância no mundo, ou null
function contraCaixa(m, caixa, origem, dir, max) {
  _inv.copy(m).invert();
  _o.copy(origem).applyMatrix4(_inv);
  // direção sem normalizar: t continua sendo a distância no mundo
  _d.copy(origem).add(dir).applyMatrix4(_inv).sub(_o);
  _raio.set(_o, _d);
  if (!_raio.intersectBox(caixa, _p)) return null;
  const t = _p.sub(_o).dot(_d) / _d.lengthSq();
  return t >= 0 && t <= max ? t : null;
}

// Distância até onde o raio pega no personagem 3D (null: passou longe)
function contraPersonagem(personagem, origem, dir, max) {
  const malhas = malhasDe(personagem.raiz);
  let melhor = null;
  for (const c of caixasDe(personagem)) {
    const malha = malhas[c.malha];
    if (!malha || !malha.visible) continue;
    if (c.osso < 0) {
      _m.copy(malha.matrixWorld);
    } else {
      const osso = malha.skeleton.bones[c.osso];
      // o ponto que a GPU desenha: matrixWorld da malha · bindMatrixInverse · matrixWorld do osso · (no osso)
      _m.multiplyMatrices(malha.matrixWorld, malha.bindMatrixInverse).multiply(osso.matrixWorld);
    }
    const t = contraCaixa(_m, c.caixa, origem, dir, melhor ?? max);
    if (t != null) melhor = t;
  }
  return melhor;
}

// As caixas do personagem de alguém, já no mundo ({ matriz, caixa }): para conferir a hitbox na tela
// (no console: sala3d de depuração, ver main.js)
export function caixasNoMundo(avatar) {
  const p = avatar.personagem;
  if (!p) return [];
  avatar.group.updateMatrixWorld(true);
  const malhas = malhasDe(p.raiz);
  return caixasDe(p).map((c) => {
    const malha = malhas[c.malha];
    const m = c.osso < 0 ? malha.matrixWorld.clone()
      : new THREE.Matrix4().multiplyMatrices(malha.matrixWorld, malha.bindMatrixInverse).multiply(malha.skeleton.bones[c.osso].matrixWorld);
    return { matriz: m, caixa: c.caixa };
  });
}

// raio contra esfera: distância até a entrada, ou null
function contraEsfera(cx, cy, cz, r, origem, dir, max) {
  _v.set(cx, cy, cz).sub(origem);
  const t = _v.dot(dir);
  const d2 = _v.lengthSq() - t * t;
  if (d2 > r * r) return null;
  const entra = t - Math.sqrt(r * r - d2);
  const tt = entra >= 0 ? entra : t;
  return tt >= 0 && tt <= max ? tt : null;
}

// o segmento (origem, dir, até max) passa a menos de r do ponto?
function passaPerto(cx, cy, cz, r, origem, dir, max) {
  _v.set(cx, cy, cz).sub(origem);
  const t = THREE.MathUtils.clamp(_v.dot(dir), 0, max);
  return _v.addScaledVector(dir, -t).lengthSq() <= r * r;
}

// Tamanho do corpo, por alto (para o soco e para a conta grossa do tiro): altura e raio na
// horizontal. Quem transforma é bem maior que os outros: de pé passa de 2,5 m, e de carro tem 4 a 6 m
// de comprimento.
export function tamanhoDo(avatar) {
  const grande = !!avatar.personagem?.temTransformacao;
  if (avatar.veiculo) return grande ? { altura: 2, raio: 2.6 } : { altura: 1.3, raio: 1.7 };
  return grande ? { altura: 3, raio: 0.8 } : { altura: 1.9, raio: 0.45 };
}

// Onde o tiro (origem, dir unitária, até max) pega no boneco de alguém: distância, ou null.
export function acertarAvatar(avatar, origem, dir, max) {
  const g = avatar.group;
  // conta grossa: passou longe da esfera que cabe o corpo inteiro (em qualquer pose), nem olha osso
  const { altura, raio } = tamanhoDo(avatar);
  const r = Math.max(altura, raio * 2) * 0.8 + 0.6;
  if (!passaPerto(g.position.x, g.position.y + altura / 2, g.position.z, r, origem, dir, max)) return null;
  g.updateMatrixWorld(true); // a posição pode ter chegado depois do último quadro desenhado
  const p = avatar.personagem;
  if (p && p.grupo.visible) return contraPersonagem(p, origem, dir, max);
  if (avatar.veiculo && avatar.carro?.visible) {
    _caixa.copy(CARRO);
    return contraCaixa(avatar.inner.matrixWorld, _caixa, origem, dir, max);
  }
  let melhor = null;
  for (const h of ESFERAS) {
    const t = contraEsfera(g.position.x, g.position.y + h, g.position.z, RAIO_ESFERA, origem, dir, melhor ?? max);
    if (t != null) melhor = t;
  }
  return melhor;
}
