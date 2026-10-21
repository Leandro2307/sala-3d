// Bonecos: tronco em cápsula, cabeça redonda (ou com a foto da pessoa), braços e
// pernas articulados em dois segmentos, e camiseta opcional estampada no peito.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { criarPersonagem } from './modelo.js';
import { criarArma, capsulaDa, soltarArma, ARMA_PADRAO } from './armas.js';
// pelo módulo inteiro, e não pelo nome: um qualidade.js de antes da ESCALA_TEXTURA não derruba o boneco
import * as qualidade from './qualidade.js';

// a arma na mão do boneco padrão: cano (+X da arma) para onde o braço aponta (-Y da mão) e o
// "cima" da arma (+Y) para o +Z da mão, que vira o alto quando o braço está esticado à frente
const BASE_MAO = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));

// canvas da etiqueta do nome menor onde a memória é curta (celular); o desenho é o mesmo
const ESCALA_TEXTURA = qualidade.ESCALA_TEXTURA ?? 1;

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

export const EMOTES = {
  wave: '👋', party: '🎉', laugh: '😂', heart: '❤️', clap: '👏', fire: '🔥',
};

// Proporções: pé no chão em y=0 e topo da cabeça em ~1.8, que é a altura do colisor.
const ALTURA = {
  perna: 0.58, // do chão até o quadril
  troncoY: 1.0, // centro do tronco
  cabecaY: 1.52,
  cabecaR: 0.285,
};

// A frente do boneco é +Z (a viseira original já era centrada ali).
// Reprojeta o UV de um pedaço de esfera/cilindro como se a textura fosse colada
// de frente, senão o UV nativo da esfera distorce a foto nas bordas.
function uvDeFrente(geo) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
    minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    // +X do mundo cai na direita da tela para quem olha o boneco de frente,
    // então u cresce junto com x — inverter aqui espelhava o texto da camiseta.
    uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
  }
  uv.needsUpdate = true;
  return geo;
}

const shared = {
  // mesmas fatias da cabeça (ver montarCorpo) e o mesmo recorte: a viseira fica sempre por fora dela
  visor: new THREE.SphereGeometry(0.285, 24, 12, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.32),
  halo: new THREE.TorusGeometry(0.44, 0.03, 8, 48),
  // Calota na frente da cabeça, onde entra a foto. Larga de propósito: cobre
  // praticamente todo o rosto, em vez de ficar uma bolinha no meio da cabeça.
  rosto: uvDeFrente(new THREE.SphereGeometry(0.2905, 28, 22, Math.PI / 2 - 1.05, 2.1, Math.PI / 2 - 0.92, 1.84)),
  // webcam na frente do rosto dos personagens glTF (a cabeça redonda usa a calota acima)
  discoCam: new THREE.CircleGeometry(0.2, 40),
  aroCam: new THREE.RingGeometry(0.2, 0.225, 40),
  // faixa curva no peito, onde entra a estampa da camiseta
  peito: uvDeFrente(new THREE.CylinderGeometry(0.307, 0.307, 0.34, 28, 1, true, -0.72, 1.44)),
  visorMat: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.12, metalness: 0.6 }),
  sapatoMat: new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.6 }),
  // carro: a frente aponta para +Z, igual ao boneco
  chassi: new RoundedBoxGeometry(1.5, 0.52, 3.1, 3, 0.2),
  cabine: new RoundedBoxGeometry(1.18, 0.5, 1.45, 3, 0.18),
  roda: new THREE.CylinderGeometry(0.33, 0.33, 0.26, 16),
  farol: new THREE.SphereGeometry(0.11, 10, 8),
  vidroMat: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.08, metalness: 0.7 }),
  pneuMat: new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.85 }),
  farolMat: new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }),
  lanternaMat: new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false }),
};

// Índice de cada osso no esqueleto do boneco padrão: cada vértice guarda o osso que o move
// (skinIndex) e o Avatar monta a lista de ossos nesta ordem. Pares: [lado −1, lado +1].
const OSSO = { tronco: 0, quadril: 1, cabeca: 2, ombros: 3, perna: [4, 6], joelho: [5, 7], ombro: [8, 10], cotovelo: [9, 11] };

// O corpo do boneco padrão é uma malha só, com esqueleto. Cada peça (cápsula, esfera) é colada no
// osso que a move, já com a posição e a escala fixas dela, e as peças da mesma cor se juntam num
// grupo: pele, tronco e sapatos. Eram 17 malhas soltas, 17 desenhos por pessoa e outros 17 na
// sombra; agora são 3, e 2 sem camiseta (o tronco tem a cor da pele e vai junto com ela). A
// geometria é a mesma para todo boneco: só o esqueleto é de cada um.
let corpoPadrao = null;
function montarCorpo() {
  const m = new THREE.Matrix4();
  const peca = (geo, osso, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => {
    const g = geo.clone().applyMatrix4(m.makeScale(sx, sy, sz).setPosition(x, y, z));
    g.deleteAttribute('uv'); // o corpo não tem textura
    const n = g.attributes.position.count;
    const indices = new Uint16Array(n * 4);
    const pesos = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      indices[i * 4] = osso;
      pesos[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(pesos, 4));
    return g;
  };
  const coxa = new THREE.CapsuleGeometry(0.115, 0.26, 4, 10);
  const canela = new THREE.CapsuleGeometry(0.098, 0.24, 4, 10);
  const braco = new THREE.CapsuleGeometry(0.082, 0.19, 4, 10);
  const antebraco = new THREE.CapsuleGeometry(0.072, 0.18, 4, 10);
  const mao = new THREE.SphereGeometry(0.098, 12, 8);
  const pe = new THREE.SphereGeometry(0.125, 12, 8);
  const pele = [
    peca(new THREE.SphereGeometry(0.26, 16, 10), OSSO.quadril, undefined, [1, 0.72, 1]),
    peca(new THREE.SphereGeometry(0.285, 24, 16), OSSO.cabeca),
    peca(new THREE.SphereGeometry(0.3, 16, 12), OSSO.ombros, undefined, [1.12, 0.62, 0.92]),
  ];
  const sapatos = [];
  for (const i of [0, 1]) {
    pele.push(
      peca(coxa, OSSO.perna[i], [0, -0.13, 0]),
      peca(canela, OSSO.joelho[i], [0, -0.12, 0]),
      peca(braco, OSSO.ombro[i], [0, -0.1, 0]),
      peca(antebraco, OSSO.cotovelo[i], [0, -0.1, 0]),
      peca(mao, OSSO.cotovelo[i], [0, -0.23, 0]),
    );
    sapatos.push(peca(pe, OSSO.joelho[i], [0, -0.26, 0.05], [1, 0.6, 1.45]));
  }
  const tronco = peca(new THREE.CapsuleGeometry(0.3, 0.38, 6, 20), OSSO.tronco);
  // juntar por cor ANTES dos grupos: com as peças direto sairiam 17 grupos (17 desenhos)
  const comCamiseta = mergeGeometries([mergeGeometries(pele), tronco, mergeGeometries(sapatos)], true);
  // os mesmos vértices na placa de vídeo, em dois grupos: pele com tronco, e sapatos
  const semCamiseta = new THREE.BufferGeometry();
  semCamiseta.setIndex(comCamiseta.index);
  for (const nome of Object.keys(comCamiseta.attributes)) semCamiseta.setAttribute(nome, comCamiseta.attributes[nome]);
  const [gPele, gTronco, gSapatos] = comCamiseta.groups;
  semCamiseta.addGroup(0, gPele.count + gTronco.count, 0);
  semCamiseta.addGroup(gSapatos.start, gSapatos.count, 2);
  return { comCamiseta, semCamiseta };
}

// Sprite com canvas. O desenho é sempre feito em w × h "lógicos"; esc encolhe só o canvas de
// verdade (e a memória dele), e a transformação do contexto põe tudo no mesmo lugar.
function makeCanvasSprite(w, h, scaleX, scaleY, esc = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * esc);
  canvas.height = Math.round(h * esc);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scaleX, scaleY, 1);
  sprite.renderOrder = 10;
  return { sprite, canvas, ctx, tex, w, h };
}

function drawMicOff(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.2, y - s * 0.55, s * 0.4, s * 0.7, s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.38, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.moveTo(x, y + s * 0.33);
  ctx.lineTo(x, y + s * 0.55);
  ctx.moveTo(x - s * 0.5, y - s * 0.55);
  ctx.lineTo(x + s * 0.5, y + s * 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawScreenBadge(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#6ee7c8';
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0b0d12';
  ctx.lineWidth = s * 0.15;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.5, y - s * 0.38, s, s * 0.62, s * 0.08);
  ctx.moveTo(x - s * 0.22, y + s * 0.5);
  ctx.lineTo(x + s * 0.22, y + s * 0.5);
  ctx.stroke();
  ctx.restore();
}

// Camisetas de time político. São opções de vestuário escolhidas por quem joga —
// as duas existem, com o mesmo destaque, e nenhuma é padrão.
export const SHIRTS = {
  none: { label: 'Sem camiseta', cor: null },
  lula: { label: 'PT — Lula 13', cor: 0xc81e1e, numero: '13', nome: 'LULA', fundo: '#c81e1e', tinta: '#ffffff', estrela: true },
  bolsonaro: { label: 'Bolsonaro 22', cor: 0x166534, numero: '22', nome: 'BOLSONARO', fundo: '#166534', tinta: '#fde047' },
};

function estampaCamiseta(kind) {
  const def = SHIRTS[kind];
  if (!def || !def.numero) return null;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = def.fundo;
  ctx.fillRect(0, 0, 256, 256);

  if (def.estrela) {
    // estrela de cinco pontas atrás do número
    ctx.save();
    ctx.translate(128, 104);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 62 : 26;
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = def.tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 108px ${FONT}`;
  ctx.fillText(def.numero, 128, 108);
  ctx.font = `700 ${def.nome.length > 6 ? 30 : 42}px ${FONT}`;
  ctx.fillText(def.nome, 128, 194);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A foto ocupa a calota inteira — ela É o rosto. A borda é só um esmaecido suave
// nos cantos, para a foto encontrar a cor da cabeça sem um aro duro no meio dela.
function fotoRedonda(img, cor) {
  // o tamanho da foto que trafega (main.js): maior que isso seria só ampliar, com 16× a memória
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, n, n);

  // esmaece só a franja externa: o miolo fica com a foto cheia
  const g = ctx.createRadialGradient(n / 2, n / 2, n * 0.40, n / 2, n / 2, n * 0.52);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// O mesmo esmaecido da foto, para a webcam: vídeo não passa pelo canvas, então a borda vem de um
// alphaMap (um só para todos os bonecos).
let _mascaraCam = null;
function mascaraCam() {
  if (_mascaraCam) return _mascaraCam;
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, n * 0.40, n / 2, n / 2, n * 0.52);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  _mascaraCam = new THREE.CanvasTexture(cv);
  return _mascaraCam;
}

const _osso = new THREE.Vector3();
const _v = new THREE.Vector3();
const _mat = new THREE.Matrix4();

export class Avatar {
  constructor({ name, color, isLocal = false }) {
    this.isLocal = isLocal;
    this.name = name;
    this.color = color;
    this.mic = true;
    this.sharing = false;
    this.speaking = false;
    this.anim = 0;
    this.phase = Math.random() * 10;
    this.speakLevel = 0;

    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);

    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02 });

    // Os nós que a animação procedural move são os ossos do corpo (ver montarCorpo), todos com
    // escala 1: a escala fixa de cada peça já está na geometria, e no osso ela contaria duas vezes.
    const osso = (pai, x, y, z) => {
      const b = new THREE.Bone();
      b.position.set(x, y, z);
      pai.add(b);
      return b;
    };
    this.body = osso(this.inner, 0, ALTURA.troncoY, 0);
    this.hip = osso(this.inner, 0, ALTURA.perna, 0);
    this.head = osso(this.inner, 0, ALTURA.cabecaY, 0);
    const visor = new THREE.Mesh(shared.visor, shared.visorMat);
    visor.scale.setScalar(1.03);
    this.head.add(visor);
    this.visor = visor;
    this.face = null; // foto do rosto, quando a pessoa escolhe uma
    this.photo = null;
    this.cam = null; // webcam no rosto (setCam): { video, tex, mat, calota, disco, osso }
    this.shirt = 'none';
    this.chest = null; // estampa da camiseta
    this.health = 1; // 0..1 — barra só aparece quando leva porrada
    this.swing = 0; // animação do soco
    this.tapaTempo = 0; // animação do tapa (1 → 0)
    this.tranco = 0; // levou um tapa: o boneco tomba para o lado e volta balançando (1 → 0)
    this.trancoDir = [0, 0];
    this.ko = false;
    this.sitting = false;
    this.armado = false; // camiseta 22: anda com a arma na mão
    this.tipoArma = ARMA_PADRAO;
    this.mira = 0; // segundos com o braço apontando (depois de um tiro)
    this.coice = 0;
    this.personagem = null; // modelo glTF, quando a pessoa escolhe um
    // ombros, para a cabeça não flutuar solta (o pescoço fica sempre dentro do tronco: nem existe)
    this.shoulders = osso(this.inner, 0, 1.16, 0);

    // pernas: quadril → coxa → joelho → canela → pé
    this.legs = [];
    for (const lado of [-1, 1]) {
      const perna = osso(this.inner, lado * 0.145, ALTURA.perna, 0);
      this.legs.push({ raiz: perna, joelho: osso(perna, 0, -0.27, 0) });
    }

    // braços: ombro → braço → cotovelo → antebraço → mão (a mão desenhada é da malha do corpo;
    // este nó é onde a arma se prende)
    this.arms = [];
    for (const lado of [-1, 1]) {
      const ombro = osso(this.inner, lado * 0.335, 1.17, -0.01);
      const cotovelo = osso(ombro, 0, -0.21, 0);
      const mao = new THREE.Object3D();
      mao.position.y = -0.23;
      cotovelo.add(mao);
      this.arms.push({ raiz: ombro, cotovelo, mao, lado });
    }

    // na ordem de OSSO
    this.ossos = [
      this.body, this.hip, this.head, this.shoulders,
      this.legs[0].raiz, this.legs[0].joelho, this.legs[1].raiz, this.legs[1].joelho,
      this.arms[0].raiz, this.arms[0].cotovelo, this.arms[1].raiz, this.arms[1].cotovelo,
    ];
    corpoPadrao ??= montarCorpo();
    // material por grupo: pele, tronco (a camiseta troca este) e sapatos
    this.corpo = new THREE.SkinnedMesh(corpoPadrao.semCamiseta, [this.material, this.material, shared.sapatoMat]);
    // os inversos dos ossos são a identidade (a geometria já está no espaço de cada um): sem o 2º
    // argumento o bind os recalcularia pela pose do instante
    this.corpo.bind(new THREE.Skeleton(this.ossos, this.ossos.map(() => new THREE.Matrix4())), new THREE.Matrix4());
    // esfera fixa que cobre todas as poses (soco, pulo, nocaute): a que o three calcula sozinho é
    // a da pose daquele instante, e o braço esticado sumiria na borda da tela
    this.corpo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.3);
    this.corpo.castShadow = true;
    this.corpo.userData.sombra = 1;
    this.inner.add(this.corpo);

    // auréola que acende quando a pessoa fala (calada, nem é desenhada: ver mover)
    this.halo = new THREE.Mesh(
      shared.halo,
      new THREE.MeshBasicMaterial({ color: 0x6ee7c8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    );
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = ALTURA.cabecaY;
    this.halo.visible = false;
    this.inner.add(this.halo);

    this.tag = makeCanvasSprite(512, 128, 2.6, 0.65, ESCALA_TEXTURA);
    this.tag.sprite.position.y = 2.3;
    this.tag.sprite.visible = !isLocal; // o próprio nome só atrapalharia a visão
    this.group.add(this.tag.sprite);
    this.drawTag();

    this.bubble = null;
    this.emotes = [];

    // estado remoto (interpolação)
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.lastPos = new THREE.Vector3();
    this.hasTarget = false;
    this.waveTime = 0;

    // o que o laço decide de fora (ver setLod, setVisible/setOculto, animarCom e mexeu)
    this.lod = { sombra: true, detalhe: true, nome: !isLocal };
    this._lodSujo = false;
    this.visivel = true;
    this.oculto = false;
    this._dtAnim = 0;
    this._esfera = new THREE.Sphere();
    this._pose = { x: 0, y: 0, z: 0, ry: 0, rz: 0, vis: false };
    this._pedido = 0; // ficha da troca de personagem (ver setPersonagem)
  }

  drawTag() {
    const { ctx, canvas, tex, w, h } = this.tag;
    // o canvas pode ser menor que o desenho (ESCALA_TEXTURA): tudo em coordenadas de 512 × 128
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `700 50px ${FONT}`;
    const label = this.name;
    const tw = Math.min(ctx.measureText(label).width, 330);
    const icons = (this.mic ? 0 : 1) + (this.sharing ? 1 : 0);
    const pw = tw + 70 + icons * 64;
    const x0 = (w - pw) / 2;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.beginPath();
    ctx.roundRect(x0, 22, pw, 84, 42);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x0 + 38, 64, 11, 0, Math.PI * 2);
    ctx.fill();
    // anel com a cor da presença (disponível, ocupado, em pausa...)
    if (this.presenca) {
      ctx.strokeStyle = this.presenca;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x0 + 38, 64, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 60, 66, 330);
    let ix = x0 + 60 + tw + 36;
    if (this.sharing) { drawScreenBadge(ctx, ix, 64, 24); ix += 60; }
    if (!this.mic) drawMicOff(ctx, ix, 64, 24);

    // barra de vida: só aparece quando a pessoa está machucada
    if (this.health < 1) {
      const bw = Math.max(pw, 180);
      const bx = (w - bw) / 2;
      ctx.fillStyle = 'rgba(10,12,18,0.8)';
      ctx.beginPath();
      ctx.roundRect(bx, 112, bw, 14, 7);
      ctx.fill();
      const v = Math.max(0, Math.min(1, this.health));
      ctx.fillStyle = v > 0.5 ? '#4ade80' : v > 0.25 ? '#fbbf24' : '#f2555a';
      ctx.beginPath();
      ctx.roundRect(bx + 2, 114, Math.max(0, (bw - 4) * v), 10, 5);
      ctx.fill();
    }
    tex.needsUpdate = true;
  }

  // Troca o corpo padrão por um modelo glTF animado. Se o arquivo falhar, o
  // boneco original volta — nunca fica sem nada na tela.
  async setPersonagem(def) {
    // o mesmo modelo de novo (eco do servidor, reconexão): fica o que já está montado
    if (def?.url && this.personagem?.def === def) {
      const p = this.personagem;
      return { ok: true, padrao: false, animado: p.temAnimacao, clipes: p.clips.length };
    }
    // Cada troca leva uma ficha: o modelo que chega depois de outra troca (ou do dispose) é
    // descartado, senão o clone atrasado ficava na cena para sempre, junto com o novo.
    const pedido = ++this._pedido;
    const velho = () => pedido !== this._pedido;
    if (this.personagem) {
      this.inner.remove(this.personagem.grupo);
      this.personagem.dispose();
      this.personagem = null;
    }
    this.mostrarCorpoPadrao(true);
    if (!def || !def.url) return { ok: true, padrao: true };
    try {
      const p = await criarPersonagem(def);
      if (!p) return { ok: true, padrao: true };
      if (velho()) {
        p.dispose();
        return { ok: true, obsoleto: true };
      }
      // shaders do modelo compilados antes de ele aparecer (ver World.aquecerObjeto)
      if (this.aquecer) await this.aquecer(p.grupo);
      if (velho()) {
        p.dispose();
        return { ok: true, obsoleto: true };
      }
      this.personagem = p;
      this.inner.add(p.grupo);
      this.mostrarCorpoPadrao(false);
      // já estava de carro ao trocar de personagem: entra direto na forma veículo
      if (this.veiculo) {
        if (p.temTransformacao) {
          p.transformar(true);
          if (this.carro) this.carro.visible = false;
        } else {
          p.grupo.visible = false;
          this.criarCarro();
          this.carro.visible = true;
        }
      }
      this._lodSujo = true; // o modelo chega fazendo sombra: o próximo setLod decide
      return { ok: true, padrao: false, animado: p.temAnimacao, clipes: p.clips.length };
    } catch (err) {
      if (velho()) return { ok: true, obsoleto: true }; // já pediram outro: este erro não interessa
      console.warn('[modelo] não carregou', err);
      this.mostrarCorpoPadrao(true);
      return { ok: false, erro: err?.message || String(err) };
    }
  }

  // corpo e ossos juntos: nos ossos estão a viseira, a foto, a estampa e a arma na mão
  mostrarCorpoPadrao(ligado) {
    this.corpo.visible = ligado;
    for (const o of this.ossos) o.visible = ligado;
  }

  // Monta o carro só na primeira vez que alguém se transforma.
  criarCarro() {
    if (this.carro) return this.carro;
    const g = new THREE.Group();
    const pintura = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.3, metalness: 0.45 });
    this.pinturaMat = pintura;

    const chassi = new THREE.Mesh(shared.chassi, pintura);
    chassi.position.y = 0.46;
    chassi.castShadow = true;
    const cabine = new THREE.Mesh(shared.cabine, shared.vidroMat);
    cabine.position.set(0, 0.84, -0.12);
    cabine.castShadow = true;
    g.add(chassi, cabine);

    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const roda = new THREE.Mesh(shared.roda, shared.pneuMat);
      roda.rotation.z = Math.PI / 2;
      roda.position.set(sx * 0.78, 0.33, sz * 1.0);
      roda.castShadow = true;
      g.add(roda);
      if (sz > 0) this.rodasFrente = (this.rodasFrente || []).concat(roda);
      else this.rodasTras = (this.rodasTras || []).concat(roda);
    }

    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(shared.farol, shared.farolMat);
      f.position.set(sx * 0.48, 0.5, 1.56);
      g.add(f);
      const l = new THREE.Mesh(shared.farol, shared.lanternaMat);
      l.scale.set(1.3, 0.6, 0.6);
      l.position.set(sx * 0.5, 0.56, -1.56);
      g.add(l);
    }

    g.visible = false;
    this.inner.add(g);
    this.carro = g;
    this._lodSujo = true; // o carro chega fazendo sombra: o próximo setLod decide
    return g;
  }

  // Transformação: o corpo some e o carro aparece (ou o contrário).
  setVeiculo(on) {
    if (this.veiculo === !!on) return;
    this.veiculo = !!on;

    // Modelo com transformação própria (Optimus, Solus): o personagem vira
    // veículo sozinho, com a animação dele. Carro desenhado em código nem entra.
    if (this.personagem?.temTransformacao) {
      this.personagem.transformar(this.veiculo);
      this.personagem.grupo.visible = true;
      if (this.carro) this.carro.visible = false;
      this.mostrarCorpoPadrao(false);
      this.tag.sprite.position.y = this.veiculo ? 2.0 : 2.6;
      return;
    }

    this.criarCarro();
    this.carro.visible = this.veiculo;
    if (this.veiculo) {
      this.mostrarCorpoPadrao(false);
      if (this.personagem) this.personagem.grupo.visible = false;
    } else {
      if (this.personagem) this.personagem.grupo.visible = true;
      else this.mostrarCorpoPadrao(true);
    }
    this.tag.sprite.position.y = this.veiculo ? 1.6 : 2.3;
  }

  setName(name) { this.name = name; this.drawTag(); }

  // webcam ligada e chegando: ela é o rosto (a foto ou o visor esperam)
  get camNoRosto() {
    return !!this.cam && !this.cam.pausada;
  }

  // Foto do rosto. É uma calota que acompanha a curva da cabeça e fica POR FORA
  // dela: antes era um disco chato na mesma altura da superfície, e por isso as
  // bordas afundavam dentro da cabeça.
  setPhoto(dataUrl) {
    if (this.face) {
      this.head.remove(this.face);
      this.face.material.map?.dispose();
      this.face.material.dispose();
      this.face = null;
    }
    this.photo = dataUrl || null;
    if (!dataUrl) {
      this.visor.visible = !this.camNoRosto;
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (this.photo !== dataUrl) return; // trocou de foto enquanto carregava
      const tex = fotoRedonda(img, this.color);
      const calota = new THREE.Mesh(
        shared.rosto,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
      );
      calota.visible = !this.camNoRosto; // com a webcam ligada, a foto espera ela desligar
      this.head.add(calota);
      this.face = calota;
      this.visor.visible = false;
    };
    img.onerror = () => { this.visor.visible = !this.camNoRosto; };
    img.src = dataUrl;
  }

  // Webcam no rosto. Na cabeça redonda ela ocupa a calota da foto (a foto volta quando a câmera
  // desliga). Os personagens glTF não têm essa cabeça: lá ela vira um disco com aro na frente do
  // rosto, que acompanha o osso da cabeça (andar, sentar, gestos).
  setCam(video) {
    if ((this.cam?.video || null) === (video || null)) return;
    if (this.cam) {
      const { tex, mat, calota, disco, aro } = this.cam;
      calota.removeFromParent();
      disco.removeFromParent();
      disco.material.dispose();
      aro.material.dispose();
      tex.dispose();
      mat.dispose();
      this.cam = null;
    }
    if (!video) {
      if (this.face) this.face.visible = true;
      else this.visor.visible = true;
      return;
    }
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    // na calota a borda esmaece como a da foto; no disco quem fecha a borda é o aro
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: mascaraCam(), transparent: true, toneMapped: false });
    const calota = new THREE.Mesh(shared.rosto, mat);
    this.head.add(calota);
    const disco = new THREE.Mesh(shared.discoCam, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const aro = new THREE.Mesh(shared.aroCam, new THREE.MeshBasicMaterial({ color: this.color, toneMapped: false }));
    disco.add(aro);
    disco.visible = false;
    this.inner.add(disco);
    this.cam = { video, tex, mat, calota, disco, aro, aspecto: 0, de: null, osso: null, raio: 0.2, desvio: null, pausada: false };
    if (this.face) this.face.visible = false;
    this.visor.visible = false;
  }

  // Webcam que deixou de chegar (o celular decodifica poucas): o rosto volta a ser a foto ou o
  // visor até ela voltar, sem desmontar nada.
  pausarCam(p) {
    const c = this.cam;
    p = !!p;
    if (!c || c.pausada === p) return;
    c.pausada = p;
    c.calota.visible = !p;
    if (p) c.disco.visible = false;
    if (this.face) this.face.visible = p;
    else this.visor.visible = p;
  }

  // Recorta o meio da imagem (4:3, 16:9 ou celular em pé) para caber no rosto redondo, e põe o
  // disco na frente do rosto do personagem.
  atualizarCam() {
    const c = this.cam;
    const v = c.video;
    if (v.videoWidth && v.videoHeight) {
      const a = v.videoWidth / v.videoHeight;
      if (a !== c.aspecto) {
        c.aspecto = a;
        if (a >= 1) {
          c.tex.repeat.set(1 / a, 1);
          c.tex.offset.set((1 - 1 / a) / 2, 0);
        } else {
          c.tex.repeat.set(1, a);
          c.tex.offset.set(0, (1 - a) / 2);
        }
      }
    }
    const p = this.personagem;
    c.disco.visible = !!p && !this.veiculo && !c.pausada;
    if (!c.disco.visible) return;
    if (c.de !== p) {
      c.de = p;
      Object.assign(c, this.medirCabeca(p));
      c.disco.scale.setScalar(c.raio / 0.2);
    }
    // segue o osso da cabeça (andar, sentar, gestos)
    if (c.osso) {
      c.osso.updateWorldMatrix(true, false);
      this.inner.worldToLocal(c.osso.getWorldPosition(_osso)).add(c.desvio);
      c.disco.position.copy(_osso);
    } else {
      c.disco.position.copy(c.desvio);
    }
  }

  // Onde fica o rosto de um personagem glTF, no espaço do boneco. Cada modelo é de um jeito
  // (o robô tem capacete grande, os do KayKit têm cabeção), então mede pelos vértices acima do
  // osso da cabeça: a largura dá o tamanho do disco e o ponto mais à frente diz onde ele fica —
  // contando só "metade da altura", o disco sumia dentro do capacete do robô.
  medirCabeca(p) {
    let osso = null;
    p.raiz.traverse((o) => {
      if (!osso && o.isBone && /head/i.test(o.name) && !/end|top|nub|tip/i.test(o.name)) osso = o;
    });
    this.inner.updateWorldMatrix(true, false);
    p.raiz.updateWorldMatrix(false, true);
    const paraBoneco = _mat.copy(this.inner.matrixWorld).invert();
    const pontos = [];
    p.raiz.traverse((o) => {
      const pos = o.isMesh && o.geometry?.attributes.position;
      if (!pos) return;
      const passo = Math.max(1, Math.floor(pos.count / 3000));
      for (let i = 0; i < pos.count; i += passo) {
        o.getVertexPosition(i, _v).applyMatrix4(o.matrixWorld).applyMatrix4(paraBoneco);
        pontos.push(_v.x, _v.y, _v.z);
      }
    });
    let topo = -Infinity;
    for (let i = 1; i < pontos.length; i += 3) topo = Math.max(topo, pontos[i]);
    if (!Number.isFinite(topo)) topo = 1.8;
    const base = osso ? _osso.setFromMatrixPosition(osso.matrixWorld).applyMatrix4(paraBoneco).clone() : new THREE.Vector3(0, topo - 0.45, 0);
    const altura = THREE.MathUtils.clamp(topo - base.y, 0.2, 0.9);
    // só a cabeça: acima do pescoço e perto do eixo dela (fora mão, arma, ombreira)
    let frente = -Infinity;
    let esq = Infinity;
    let dir = -Infinity;
    for (let i = 0; i < pontos.length; i += 3) {
      const [x, y, z] = [pontos[i], pontos[i + 1], pontos[i + 2]];
      if (y < base.y + altura * 0.12 || Math.abs(x - base.x) > altura * 0.7) continue;
      frente = Math.max(frente, z);
      esq = Math.min(esq, x);
      dir = Math.max(dir, x);
    }
    const largura = dir > esq ? dir - esq : altura;
    if (!Number.isFinite(frente)) frente = base.z + altura * 0.5;
    // chapéu alto não conta: o disco senta no pescoço e cobre a cabeça até onde ela é larga
    const raio = THREE.MathUtils.clamp(Math.min(altura, largura) * 0.46, 0.12, 0.36);
    const centro = new THREE.Vector3(base.x, base.y + raio * 1.05, frente + 0.03);
    return { osso, raio, desvio: osso ? centro.sub(base) : centro };
  }

  // Camiseta: pinta o tronco e cola a estampa curva no peito.
  setShirt(kind) {
    this.shirt = SHIRTS[kind] ? kind : 'none';
    this.setArma(this.shirt === 'bolsonaro'); // a 22 vem com arma
    if (this.chest) {
      this.body.remove(this.chest);
      this.chest.material.map?.dispose();
      this.chest.material.dispose();
      this.chest = null;
    }
    const def = SHIRTS[this.shirt];
    if (!def.cor) {
      // sem camiseta o tronco tem a cor da pele e é desenhado junto com ela
      this.corpo.geometry = corpoPadrao.semCamiseta;
      return;
    }
    this.shirtMat = this.shirtMat || new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 });
    this.shirtMat.color.setHex(def.cor);
    this.corpo.material[1] = this.shirtMat;
    this.corpo.geometry = corpoPadrao.comCamiseta;
    const tex = estampaCamiseta(this.shirt);
    if (tex) {
      const faixa = new THREE.Mesh(shared.peito, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }));
      faixa.position.y = 0.02;
      this.body.add(faixa);
      this.chest = faixa;
    }
  }

  // Arma de verdade (armas.js): na mão direita do boneco padrão; nos personagens 3D (sem braço
  // procedural) fica à frente do peito, apontada para a frente. tipo: pistola, fuzil...
  setArma(on, tipo = this.tipoArma) {
    this.armado = !!on;
    if (tipo !== this.tipoArma) {
      this.tipoArma = tipo;
      this.removerArmas();
    }
    if (!on || this.armaMao || this.carregandoArma === tipo) return;
    this.carregandoArma = tipo;
    Promise.all([criarArma(tipo), criarArma(tipo)]).then(([mao, solta]) => {
      if (this.tipoArma !== tipo) return; // trocou de arma enquanto baixava
      this.carregandoArma = null;
      this.removerArmas();
      mao.quaternion.setFromRotationMatrix(BASE_MAO);
      this.arms[1].mao.add(mao);
      solta.rotation.y = -Math.PI / 2; // cano (+X) para a frente do boneco (+Z)
      solta.position.set(0.2, 1.12, 0.34);
      this.inner.add(solta);
      this.armaMao = mao;
      this.armaSolta = solta;
      this._lodSujo = true; // a arma chega fazendo sombra: o próximo setLod decide
    }).catch(() => { this.carregandoArma = null; });
  }

  removerArmas() {
    if (this.armaMao) soltarArma(this.armaMao);
    if (this.armaSolta) soltarArma(this.armaSolta);
    this.armaMao = null;
    this.armaSolta = null;
  }

  // a arma que aparece agora (na mão ou à frente do peito)
  get armaAtiva() {
    return this.personagem ? this.armaSolta : this.armaMao;
  }

  atirar() {
    this.mira = 1.4;
    this.coice = 1;
    this.armaAtiva?.userData.animador.disparar();
  }

  // ponta do cano em coordenadas do mundo (de onde sai o traçante)
  pontaDaArma(out) {
    const g = this.personagem ? this.armaSolta : this.armaMao;
    if (this.armado && g && g.visible) return g.userData.ponta.getWorldPosition(out);
    return out.copy(this.group.position).add(new THREE.Vector3(0, 1.35, 0));
  }

  setHealth(v) {
    const novo = Math.max(0, Math.min(1, v));
    if (Math.abs(novo - this.health) < 0.005) return;
    this.health = novo;
    this.drawTag();
  }

  setKo(on) {
    this.ko = !!on;
  }

  punch() {
    this.swing = 1;
    this.personagem?.tocarGesto('punch'); // o robô tem clipe de soco de verdade
  }

  // tapa de mão aberta: o braço abre para o lado e cruza na frente do corpo
  tapa() {
    this.tapaTempo = 1;
    this.personagem?.tocarGesto('punch');
  }

  // levou um tapa vindo da direção dir ([x, z], de quem bateu para quem levou): tomba para lá e o
  // "PLAFT!" sobe da cabeça (plaft = false: quem levou já vê o PLAFT! na tela, ver leveiTapa)
  levarTapa(dir, plaft = true) {
    const [dx, dz] = Array.isArray(dir) ? dir : [0, 0];
    const n = Math.hypot(dx, dz) || 1;
    this.trancoDir = [dx / n, dz / n];
    this.tranco = 1;
    if (!plaft) return;
    const e = makeCanvasSprite(256, 128, 1.5, 0.75);
    e.ctx.font = `900 64px ${FONT}`;
    e.ctx.textAlign = 'center';
    e.ctx.textBaseline = 'middle';
    e.ctx.lineJoin = 'round';
    e.ctx.lineWidth = 12;
    e.ctx.strokeStyle = '#7f1d1d';
    e.ctx.strokeText('PLAFT!', 128, 66);
    e.ctx.fillStyle = '#fde047';
    e.ctx.fillText('PLAFT!', 128, 66);
    e.tex.needsUpdate = true;
    e.sprite.position.set((Math.random() - 0.5) * 0.4, 2.1, 0);
    e.life = 0;
    e.largura = 2; // a faixa é o dobro de larga que alta (os emojis são quadrados)
    this.emotes.push(e);
    this.group.add(e.sprite);
  }

  setColor(color) {
    this.color = color;
    this.material.color.set(color);
    this.pinturaMat?.color.set(color);
    this.cam?.aro.material.color.set(color);
    // a foto tem a borda na cor do jogador: redesenha para acompanhar
    if (this.photo) {
      const url = this.photo;
      this.photo = null;
      this.setPhoto(url);
    }
    this.drawTag();
  }

  setPresenca(cor) {
    if (cor === this.presenca) return;
    this.presenca = cor;
    this.drawTag();
  }

  setStatus({ mic, sharing }) {
    let dirty = false;
    if (mic !== undefined && mic !== this.mic) { this.mic = mic; dirty = true; }
    if (sharing !== undefined && sharing !== this.sharing) { this.sharing = sharing; dirty = true; }
    if (dirty) this.drawTag();
  }

  // player.js: o próprio boneco some com a câmera colada nele (1ª pessoa, sentado no posto)
  setVisible(v) {
    this.visivel = v;
    this.inner.visible = v && !this.oculto;
  }

  // Atrás de uma parede ou noutra sala (o laço pergunta ao World): some o corpo e, com ele, a
  // sombra, a webcam e a arma. Nome, balão e emojis ficam no grupo, e a posição continua em mover().
  setOculto(v) {
    v = !!v;
    if (v === this.oculto) return;
    this.oculto = v;
    this.inner.visible = this.visivel && !v;
  }

  // Detalhe que o laço escolhe pela distância: sombra (o boneco entra no mapa de sombra), detalhe
  // (as peças marcadas 2 também) e nome. Devolve true se a sombra mudou (refazer o mapa).
  setLod({ sombra = true, detalhe = true, nome = true } = {}) {
    const l = this.lod;
    l.nome = nome;
    this.tag.sprite.visible = !this.isLocal && nome;
    if (sombra === l.sombra && detalhe === l.detalhe && !this._lodSujo) return false;
    l.sombra = sombra;
    l.detalhe = detalhe;
    this._lodSujo = false;
    let mudou = false;
    this.inner.traverse((o) => {
      if (!o.isMesh) return;
      // 1 = silhueta, 2 = só com detalhe, 0 = nunca. O que chegou sem marca (personagem 3D, carro,
      // arma, rosto, auréola) vale pelo castShadow com que veio. castShadow não muda o shader:
      // ligar e desligar não recompila nada
      const s = (o.userData.sombra ??= o.castShadow ? 1 : 0);
      const faz = sombra && (s === 1 || (s === 2 && detalhe));
      if (o.castShadow !== faz) {
        o.castShadow = faz;
        mudou = true;
      }
    });
    return mudou;
  }

  // Esfera do boneco inteiro, com nome, balão e carro (o laço pergunta ao World se ela está na
  // vista). Uma por boneco, reaproveitada a cada quadro.
  esferaVista() {
    const e = this._esfera;
    e.center.copy(this.group.position);
    e.center.y += 1.1;
    e.radius = this.veiculo ? 3 : 2.2;
    return e;
  }

  // A pose mudou o bastante para a sombra? Andando, pulando, socando, acenando, atirando ou num
  // gesto do personagem, sim; parado, só quando a posição, o giro ou a visibilidade mudam (1 mm,
  // 0,002 rad). O mapa de sombra só é refeito quando alguém responde que sim.
  mexeu() {
    const g = this.group.position;
    const r = this.inner.rotation;
    const vis = this.group.visible && this.inner.visible;
    const u = this._pose;
    if (!vis && !u.vis) return false; // escondido e continua escondido: não está na sombra
    const p = this.personagem;
    const animando = this.anim === 1 || this.anim === 2 || this.anim === 3 || this.swing > 0 || this.waveTime > 0 || this.tapaTempo > 0 || this.tranco > 0
      || this.coice > 0 || this.mira > 0 || !!p?.gesto || !!p?.travado?.isRunning();
    if (!animando && vis === u.vis && Math.abs(g.x - u.x) < 0.001 && Math.abs(g.y - u.y) < 0.001 && Math.abs(g.z - u.z) < 0.001
      && Math.abs(r.y - u.ry) < 0.002 && Math.abs(r.z - u.rz) < 0.002) return false;
    u.x = g.x;
    u.y = g.y;
    u.z = g.z;
    u.ry = r.y;
    u.rz = r.z;
    u.vis = vis;
    return true;
  }

  // balão de fala do chat
  say(text) {
    if (this.bubble) {
      // o balão anterior sai da memória junto (antes ficava uma textura por mensagem)
      this.group.remove(this.bubble.sprite);
      this.bubble.tex.dispose();
      this.bubble.sprite.material.dispose();
    }
    const b = makeCanvasSprite(768, 256, 4.2, 1.4);
    const { ctx } = b;
    ctx.font = `600 40px ${FONT}`;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 660 && line) { lines.push(line); line = word; } else line = test;
      if (lines.length === 3) break;
    }
    if (lines.length < 3 && line) lines.push(line);
    if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = `${lines[2].slice(0, -1)}…`;
    const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = lw + 60;
    const bh = lines.length * 50 + 36;
    const x0 = (768 - bw) / 2;
    const y0 = 256 - bh - 26;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(384 - 16, y0 + bh - 1);
    ctx.lineTo(384, y0 + bh + 20);
    ctx.lineTo(384 + 16, y0 + bh - 1);
    ctx.fill();
    ctx.fillStyle = '#0f1219';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 384, y0 + 20 + i * 50));
    b.tex.needsUpdate = true;
    b.sprite.position.y = 3.25;
    b.life = 6 + text.length * 0.03;
    this.bubble = b;
    this.group.add(b.sprite);
  }

  emote(kind) {
    const glyph = EMOTES[kind];
    if (!glyph) return;
    const e = makeCanvasSprite(128, 128, 0.9, 0.9);
    e.ctx.font = `96px ${EMOJI_FONT}`;
    e.ctx.textAlign = 'center';
    e.ctx.textBaseline = 'middle';
    e.ctx.fillText(glyph, 64, 72);
    e.tex.needsUpdate = true;
    e.sprite.position.set((Math.random() - 0.5) * 0.6, 2.1, 0);
    e.life = 0;
    this.emotes.push(e);
    this.group.add(e.sprite);
    if (kind === 'wave') {
      this.waveTime = 1.6;
      this.personagem?.tocarGesto('wave');
    }
  }

  // posição/rotação recebidas pela rede
  setNetworkState(p, r, a) {
    // 5 é o carro: assim a transformação chega junto com a animação, sem campo novo
    this.setVeiculo(a === 5);
    this.target.set(p[0], p[1], p[2]);
    this.targetYaw = r;
    this.anim = a;
    if (!this.hasTarget) {
      this.group.position.copy(this.target);
      this.inner.rotation.y = r;
      this.hasTarget = true;
    }
  }

  // O que anda todo quadro, com o boneco na vista ou não: a posição que veio pela rede, a fala e o
  // que fica no grupo (balão e emojis aparecem mesmo com o corpo escondido).
  mover(dt, t) {
    if (!this.isLocal && this.hasTarget) {
      const k = 1 - Math.exp(-dt * 12);
      if (this.group.position.distanceToSquared(this.target) > 400) this.group.position.copy(this.target);
      else this.group.position.lerp(this.target, k);
      let d = this.targetYaw - this.inner.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.inner.rotation.y += d * k;
    }

    // fala: calada, a auréola some de vez (com opacidade 0 o three a desenhava do mesmo jeito)
    const targetLevel = this.speaking ? 1 : 0;
    this.speakLevel += (targetLevel - this.speakLevel) * Math.min(1, dt * 10);
    this.halo.visible = this.speakLevel > 0.01;
    if (this.halo.visible) {
      this.halo.material.opacity = this.speakLevel * (0.55 + 0.35 * Math.sin(t * 10));
      const hs = 1 + this.speakLevel * 0.08 * Math.sin(t * 9);
      this.halo.scale.set(hs, hs, hs);
    }

    if (this.bubble) {
      this.bubble.life -= dt;
      this.bubble.sprite.material.opacity = Math.min(1, this.bubble.life);
      if (this.bubble.life <= 0) {
        this.group.remove(this.bubble.sprite);
        this.bubble.tex.dispose();
        this.bubble.sprite.material.dispose();
        this.bubble = null;
      }
    }

    // o tranco do tapa: mola que tomba para o lado do tapa e volta balançando
    if (this.tranco > 0) {
      this.tranco = Math.max(0, this.tranco - dt / 0.9);
      const tau = (1 - this.tranco) * 0.9;
      const a = this.tranco > 0 ? Math.sin(tau * 16) * Math.exp(-tau * 4) * 0.45 : 0;
      this.group.rotation.x = this.trancoDir[1] * a;
      this.group.rotation.z = -this.trancoDir[0] * a;
    }

    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      e.life += dt;
      e.sprite.position.y = 2.1 + e.life * 1.1;
      const sc = 0.9 + Math.min(e.life * 3, 0.5);
      e.sprite.scale.set(sc * (e.largura || 1), sc, 1);
      e.sprite.material.opacity = Math.max(0, 1 - Math.max(0, e.life - 1.4) / 0.8);
      if (e.life > 2.2) {
        this.group.remove(e.sprite);
        e.tex.dispose();
        e.sprite.material.dispose();
        this.emotes.splice(i, 1);
      }
    }
  }

  // A pose: webcam, arma, carro, personagem 3D ou a animação procedural. Aceita dt grande (ver
  // animarCom): a troca de clipe, o clipe que toca uma vez e o passo feito à mão partem do estado
  // atual, não do quadro anterior.
  animar(dt, t) {
    if (this.cam) this.atualizarCam();
    if (this.armaMao) {
      this.armaMao.visible = this.armado && !this.personagem && !this.veiculo;
      this.armaSolta.visible = this.armado && !!this.personagem && !this.veiculo;
      const arma = this.armaAtiva;
      // coice, clarão e engatilhar; a cápsula só pula se dá para ver o boneco
      if (arma.userData.animador.update(dt) && arma.visible && this.inner.visible && this.group.visible) capsulaDa(arma, this.group.position.y);
    }

    // em modo carro só as rodas giram; o resto do boneco está escondido
    if (this.veiculo && this.personagem?.temTransformacao) {
      this.personagem.update(dt, 5, 1);
      this.halo.position.y = 1.4;
      this.inner.rotation.z += (0 - this.inner.rotation.z) * Math.min(1, dt * 9);
    } else if (this.veiculo) {
      // nos outros jogadores a velocidade não vem pela rede: mede pelo deslocamento
      if (!this.isLocal) {
        const dx = this.group.position.x - (this._ultX ?? this.group.position.x);
        const dz = this.group.position.z - (this._ultZ ?? this.group.position.z);
        this.velocidade = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      }
      this._ultX = this.group.position.x;
      this._ultZ = this.group.position.z;
      const giro = (this.velocidade || 0) * dt / 0.33;
      for (const r of [...(this.rodasFrente || []), ...(this.rodasTras || [])]) r.rotation.x -= giro;
      if (this.rodasFrente) for (const r of this.rodasFrente) r.rotation.y = (this.volante || 0) * 0.45;
      this.halo.position.y = 1.1;
      this.inner.rotation.z += (0 - this.inner.rotation.z) * Math.min(1, dt * 9);
    } else if (this.personagem) {
      // nocauteado: parado e caído de lado, como o boneco padrão (em times fica assim até a rodada
      // acabar; antes o personagem 3D seguia de pé, e não dava para saber quem já tinha caído)
      this.personagem.update(dt, this.ko ? 0 : this.anim, this.anim === 2 ? 1.6 : 1);
      this.halo.position.y = 1.5;
      const alvoKo = this.ko ? Math.PI / 2.1 : 0;
      this.inner.rotation.z += (alvoKo - this.inner.rotation.z) * Math.min(1, dt * 9);
    } else {
      // animação procedural
      const moving = this.anim === 1 || this.anim === 2;
      const airborne = this.anim === 3;
      const speed = this.anim === 2 ? 15 : 10;
      if (moving) this.phase += dt * speed;
      else this.phase += dt * 2;
      const s = Math.sin(this.phase);
      const bob = moving ? Math.abs(s) * 0.12 : Math.sin(t * 2 + this.phase) * 0.015;

      const sentado = this.anim === 4;
      const alturaSentado = sentado ? -0.34 : 0;

      this.body.position.y = ALTURA.troncoY + bob + alturaSentado;
      this.hip.position.y = ALTURA.perna + bob * 0.8 + alturaSentado;
      this.head.position.y = ALTURA.cabecaY + bob * 1.1 + alturaSentado;
      this.body.rotation.z = moving && !sentado ? s * 0.06 : 0;
      this.body.rotation.x = sentado ? -0.12 : moving ? (this.anim === 2 ? 0.16 : 0.08) : 0;
      this.halo.position.y = this.head.position.y;

      this.shoulders.position.y = 1.16 + bob + alturaSentado;

      // pernas: coxa gira no quadril, canela dobra no joelho
      const passo = moving ? s * (this.anim === 2 ? 0.95 : 0.6) : 0;
      this.legs.forEach(({ raiz, joelho }, i) => {
        const lado = i === 0 ? 1 : -1;
        raiz.position.y = ALTURA.perna + bob * 0.8 + alturaSentado;
        if (sentado) {
          raiz.rotation.x = -1.45;
          joelho.rotation.x = 1.4; // joelho dobrado: canela desce reta
        } else if (airborne) {
          raiz.rotation.x = lado > 0 ? -0.5 : 0.28;
          joelho.rotation.x = lado > 0 ? 0.75 : 0.2;
        } else {
          const g = passo * lado;
          raiz.rotation.x = g;
          // o joelho só dobra na perna que está voltando, como numa passada real
          joelho.rotation.x = Math.max(0, -g) * 1.5 + (moving ? 0.1 : 0.04);
        }
      });

      // braços: balançam ao contrário das pernas
      this.arms.forEach(({ raiz, cotovelo, lado }, i) => {
        raiz.position.y = 1.18 + bob + alturaSentado;
        if ((this.swing > 0 || this.tapaTempo > 0) && lado > 0) return; // o braço do soco (e do tapa) é tratado abaixo
        if (sentado) {
          raiz.rotation.set(-0.5, 0, lado * 0.24);
          cotovelo.rotation.x = 0.75;
        } else if (airborne) {
          raiz.rotation.set(-2.2, 0, lado * 0.3);
          cotovelo.rotation.x = 0.3;
        } else {
          raiz.rotation.set(-passo * lado * 0.85, 0, lado * 0.22);
          cotovelo.rotation.x = 0.18 + Math.abs(passo) * 0.5;
        }
      });

      this.body.scale.set(1, 1, 1);
      if (airborne) this.body.scale.set(0.96, 1.05, 0.96);
      if (this.waveTime > 0) {
        this.waveTime -= dt;
        const dir = this.arms[1];
        dir.raiz.rotation.set(-2.6, 0, 0.5 + Math.sin(t * 14) * 0.25);
        dir.cotovelo.rotation.x = 0.35;
      }

      // armado: arma longa fica no ombro, com a mão esquerda no guarda-mão; a pistola fica
      // baixa, pronta, e sobe apontando por um tempo depois de cada tiro
      if (this.armado && this.armaMao && !sentado && this.swing <= 0 && !(this.waveTime > 0)) {
        const def = this.armaMao.userData.def;
        if (this.mira > 0) this.mira -= dt;
        this.coice = Math.max(0, this.coice - dt * 7);
        const k = this.coice * Math.min(1, def.coice);
        const dir = this.arms[1];
        if (this.mira > 0 || def.apoio) {
          dir.raiz.rotation.set(-1.52 - k * 0.3, 0, def.apoio ? 0.02 : 0.1);
          dir.cotovelo.rotation.x = 0.05 + k * 0.2;
        } else {
          dir.raiz.rotation.set(-0.55, 0, 0.14);
          dir.cotovelo.rotation.x = -0.75;
        }
        if (def.apoio) {
          const esq = this.arms[0];
          esq.raiz.rotation.set(-1.42 - k * 0.25, 0, 0.62);
          esq.cotovelo.rotation.x = -0.12;
        }
      } else if (!this.armado || !this.armaMao || sentado) {
        // sem arma na mão (ou sentado) a mira só corre: presa num valor, o boneco pareceria
        // sempre em movimento (ver mexeu)
        this.mira = Math.max(0, this.mira - dt);
        this.coice = Math.max(0, this.coice - dt * 7);
      }

      // soco: o braço direito dispara para frente e volta
      if (this.swing > 0) {
        this.swing = Math.max(0, this.swing - dt / 0.26);
        const golpe = Math.sin((1 - this.swing) * Math.PI);
        const dir = this.arms[1];
        // o braço parte recolhido e estica para a frente
        dir.raiz.rotation.set(-1.5 - golpe * 0.25, 0, 0.1);
        dir.cotovelo.rotation.x = 1.5 - golpe * 1.45;
        const esq = this.arms[0];
        esq.raiz.rotation.set(-1.1, 0, -0.2);
        esq.cotovelo.rotation.x = 1.3;
        this.body.rotation.y = -golpe * 0.28;
      } else if (this.tapaTempo > 0) {
        // tapa: abre o braço para o lado (prepara), cruza rápido na frente do corpo e volta
        this.tapaTempo = Math.max(0, this.tapaTempo - dt / 0.34);
        const u = 1 - this.tapaTempo;
        const golpe = u < 0.35 ? -u / 0.35 : u < 0.6 ? -1 + ((u - 0.35) / 0.25) * 2 : 1 - (u - 0.6) / 0.4;
        const dir = this.arms[1];
        dir.raiz.rotation.set(-1.35, 0, 0.2 - golpe * 0.9);
        dir.cotovelo.rotation.x = 0.25;
        this.body.rotation.y = -golpe * 0.3;
      } else if (!this.ko) {
        this.body.rotation.y = 0;
      }

      // nocauteado: cai de lado
      const alvoKo = this.ko ? Math.PI / 2.1 : 0;
      this.inner.rotation.z += (alvoKo - this.inner.rotation.z) * Math.min(1, dt * 9);

    }

    // Sem os braços procedurais (carro, personagem 3D), soco, aceno e mira só correm o tempo:
    // presos num valor, o boneco pareceria sempre em movimento (animação a pleno e sombra refeita)
    if (this.veiculo || this.personagem) {
      this.swing = Math.max(0, this.swing - dt / 0.26);
      this.tapaTempo = Math.max(0, this.tapaTempo - dt / 0.34);
      this.waveTime = Math.max(0, this.waveTime - dt);
      this.mira = Math.max(0, this.mira - dt);
      this.coice = Math.max(0, this.coice - dt * 7);
    }
  }

  // o boneco local e a vitrine: tudo, todo quadro
  update(dt, t) {
    this.mover(dt, t);
    this.animar(dt, t);
  }

  // A pose num passo escolhido pelo laço (longe ou fora da vista, menos vezes por segundo): o tempo
  // vai se juntando e a pose anda tudo de uma vez quando passa de passo segundos. Gesto, soco,
  // aceno, transformação e carro andam sempre a cada quadro. Escondido, nada: ao reaparecer segue
  // de onde estava (até 1 s somado).
  animarCom(dt, t, passo = 0) {
    this._dtAnim = Math.min(1, this._dtAnim + dt);
    if (this.oculto) return;
    const p = this.personagem;
    // gesto, soco, aceno, carro e tiro recente (o clarão dura 0,05 s: com passo, sumia antes de
    // aparecer em quem atira longe) andam a cada quadro
    if (p?.gesto || p?.travado?.isRunning() || this.swing > 0 || this.tapaTempo > 0 || this.waveTime > 0 || this.veiculo || this.coice > 0) passo = 0;
    if (this._dtAnim < passo) return;
    this.animar(this._dtAnim, t);
    this._dtAnim = 0;
  }

  // A pessoa saiu: solta da placa de vídeo tudo o que é só deste boneco. O que é compartilhado
  // (geometrias, sapato, viseira, máscara da webcam, modelos da arma e do personagem) fica.
  dispose() {
    this._pedido++; // o personagem que ainda está baixando é descartado ao chegar
    this.setCam(null);
    this.photo = null; // a foto que ainda está carregando não monta mais o rosto
    this.group.removeFromParent();
    this.personagem?.dispose();
    this.personagem = null;
    for (const m of [this.face, this.chest]) {
      m?.material.map?.dispose();
      m?.material.dispose();
    }
    this.face = null;
    this.chest = null;
    this.shirtMat?.dispose();
    this.pinturaMat?.dispose();
    for (const s of [this.bubble, ...this.emotes]) {
      if (!s) continue;
      s.tex.dispose();
      s.sprite.material.dispose();
    }
    this.bubble = null;
    this.emotes.length = 0;
    this.removerArmas();
    this.corpo.skeleton.dispose();
    this.material.dispose();
    this.halo.material.dispose();
    this.tag.tex.dispose();
    this.tag.sprite.material.dispose();
  }
}
