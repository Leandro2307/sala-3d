// Tabuleiros gigantes do lado de fora do cinema: xadrez de bruxo (como em Harry Potter, as peças
// andam sozinhas e a que é tomada se despedaça), um jogo de damas no mesmo tamanho e um jogo
// da velha em que o X e o O caem do céu.
// Aqui fica só a parte 3D: tabuleiro, peças, animações e estilhaços. As regras ficam em
// xadrez.js/dama.js e a partida (rede, comandos, HUD) em jogos.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from './sfx.js';
import { isTouch } from './touch.js';

const BORDA = 1.3;
const Y = 0.16; // altura do tabuleiro (em cima da praça)
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

// Ficam a sudeste da porta do cinema, longe da estrada do autódromo.
// n = casas por lado, q = lado de uma casa em metros
export const MESAS = {
  xadrez: { x: 90, z: -12, n: 8, q: 2.6, nome: 'Xadrez de bruxo', lados: ['Brancas', 'Pretas'] },
  dama: { x: 122, z: -12, n: 8, q: 2.6, nome: 'Dama gigante', lados: ['Claras', 'Escuras'] },
  velha: { x: 152, z: -12, n: 3, q: 4.2, nome: 'Jogo da velha', lados: ['X', 'O'] },
};
// para a natureza não plantar árvore em cima (a segunda cobre a velha e a mesa de dados)
export const RESERVAS_JOGOS = [{ x: 106, z: -12, r: 38 }, { x: 166, z: -12, r: 26 }];

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function* tween(dur, fn) {
  let t = 0;
  while (t < 1) {
    const dt = yield;
    t = Math.min(1, t + dt / dur);
    fn(t);
  }
}
function* esperar(s) {
  let t = 0;
  while (t < s) t += yield;
}

function texturaTabuleiro(tipo, n, Q, LADO) {
  // Desenhado num quadro de T px e reduzido conforme o aparelho. No celular, 1024 px ainda deixam o
  // tabuleiro nítido no zoom normal; o da velha (casas lisas e um #) fica com a metade disso. Cada
  // tabuleiro de 1280 px custava ~15 MB entre o canvas, a textura e os mipmaps.
  const T = 1280;
  const velha = tipo === 'velha';
  const px = isTouch ? (velha ? 512 : 1024) : (velha ? 1024 : 1280);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.scale(px / T, px / T);
  const k = T / LADO;
  const b = BORDA * k;
  const q = Q * k;
  const [claro, escuro, moldura, letra] = {
    xadrez: ['#ddd6c6', '#26252d', '#17161c', '#c9b98f'],
    dama: ['#e8d6ae', '#2f5d45', '#3a2417', '#f3dfb5'],
    velha: ['#1d2340', '#1d2340', '#0e1122', '#a5b4fc'],
  }[tipo];
  ctx.fillStyle = moldura;
  ctx.fillRect(0, 0, T, T);
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      const x = b + c * q;
      const y = b + (n - 1 - l) * q;
      ctx.fillStyle = (c + l) % 2 === 0 ? escuro : claro;
      ctx.fillRect(x, y, q, q);
      // veios de mármore: riscos finos e tortos, cada casa com os seus
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, q, q);
      ctx.clip();
      ctx.strokeStyle = (c + l) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(80,60,40,0.10)';
      ctx.lineWidth = 1.4;
      for (let v = 0; v < 4; v++) {
        ctx.beginPath();
        let vx = x + Math.random() * q;
        let vy = y;
        ctx.moveTo(vx, vy);
        while (vy < y + q) {
          vx += (Math.random() - 0.5) * 18;
          vy += 10;
          ctx.lineTo(vx, vy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.strokeStyle = letra;
  ctx.lineWidth = 4;
  ctx.strokeRect(b - 3, b - 3, q * n + 6, q * n + 6);
  if (velha) {
    // o "#" do jogo da velha, em neon
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 28 * (px / T); // o desfoque da sombra não segue a escala do contexto
    for (const i of [1, 2]) {
      ctx.beginPath();
      ctx.moveTo(b + i * q, b + 18);
      ctx.lineTo(b + i * q, b + q * n - 18);
      ctx.moveTo(b + 18, b + i * q);
      ctx.lineTo(b + q * n - 18, b + i * q);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = letra;
  ctx.font = `800 ${Math.round(b * 0.55)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const L = 'abcdefgh'[i];
    ctx.fillText(L, b + i * q + q / 2, T - b / 2);
    ctx.save();
    ctx.translate(b + i * q + q / 2, b / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(L, 0, 0);
    ctx.restore();
    ctx.fillText(String(i + 1), b / 2, b + (n - 1 - i) * q + q / 2);
    ctx.save();
    ctx.translate(T - b / 2, b + (n - 1 - i) * q + q / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(String(i + 1), 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// placas e letreiros desenhados em escala: no celular o canvas tem a metade
const ESCALA_PLACA = isTouch ? 0.5 : 1;

function placaTexto(texto, cor) {
  // desenhado em 1024 x 192, encolhido no celular
  const e = ESCALA_PLACA;
  const cv = document.createElement('canvas');
  cv.width = 1024 * e;
  cv.height = 192 * e;
  const ctx = cv.getContext('2d');
  ctx.setTransform(e, 0, 0, e, 0, 0);
  ctx.fillStyle = '#0f1118';
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = cor;
  ctx.fillRect(0, 176, 1024, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.font = `800 92px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 512, 88);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ peças
const arco = (cy, r, a0, a1, n = 10, sx = 1) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([Math.cos(a) * r * sx, cy + Math.sin(a) * r]);
  }
  return out;
};
const BASE = [[0, 0], [0.86, 0], [0.86, 0.16], [0.78, 0.24], [0.74, 0.32], [0.58, 0.4]];
const PERFIS = {
  p: [...BASE, [0.42, 0.56], [0.3, 1.1], [0.27, 1.24], [0.46, 1.3], [0.46, 1.38], [0.28, 1.44], ...arco(1.76, 0.38, -1.0, Math.PI / 2, 10)],
  r: [...BASE, [0.56, 0.5], [0.46, 0.7], [0.44, 1.9], [0.6, 2.0], [0.62, 2.45], [0.46, 2.45], [0.46, 2.3], [0, 2.3]],
  b: [...BASE, [0.48, 0.56], [0.3, 1.5], [0.27, 1.62], [0.48, 1.7], [0.48, 1.78], [0.3, 1.84], ...arco(2.3, 0.46, -1.2, Math.PI / 2, 12, 0.8), ...arco(2.86, 0.12, -Math.PI / 2, Math.PI / 2, 6)],
  q: [...BASE, [0.5, 0.58], [0.32, 1.9], [0.3, 2.02], [0.54, 2.1], [0.54, 2.18], [0.34, 2.24], [0.36, 2.4], [0.62, 2.8], [0.5, 2.86], ...arco(2.86, 0.4, 0, Math.PI / 2, 6), ...arco(3.34, 0.13, -Math.PI / 2, Math.PI / 2, 6)],
  k: [...BASE, [0.52, 0.6], [0.34, 2.1], [0.32, 2.22], [0.56, 2.3], [0.56, 2.38], [0.36, 2.44], [0.38, 2.6], [0.58, 3.0], [0.56, 3.08], [0, 3.12]],
  n: [...BASE, [0.56, 0.5], [0.5, 0.62], [0, 0.62]],
};
const ALTURA = { p: 2.14, r: 2.45, b: 2.98, q: 3.47, k: 3.75, n: 3.05, w: 0.42, W: 0.84 };

// Junta as partes de uma peça numa geometria só. O mergeGeometries exige todas com índice ou todas
// sem, e a cabeça do cavalo (ExtrudeGeometry) não tem.
function juntar(partes) {
  const semIndice = partes.some((p) => !p.index);
  return mergeGeometries(semIndice ? partes.map((p) => (p.index ? p.toNonIndexed() : p)) : partes);
}

let geoCache = null;
function geometrias() {
  if (geoCache) return geoCache;
  const g = {};
  const torno = {};
  for (const [t, pts] of Object.entries(PERFIS)) {
    torno[t] = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), 28);
  }
  // cabeça do cavalo: um perfil de lado, extrudado
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.58);
  s.lineTo(0.5, 0.58);
  s.quadraticCurveTo(0.55, 1.0, 0.3, 1.38);
  s.quadraticCurveTo(0.62, 1.55, 0.86, 1.86);
  s.quadraticCurveTo(0.94, 2.06, 0.74, 2.16);
  s.quadraticCurveTo(0.5, 2.3, 0.32, 2.58);
  s.lineTo(0.22, 2.98);
  s.lineTo(0.02, 2.7);
  s.quadraticCurveTo(-0.4, 2.62, -0.6, 2.1);
  s.quadraticCurveTo(-0.72, 1.5, -0.55, 1.0);
  s.lineTo(-0.5, 0.58);
  const cab = new THREE.ExtrudeGeometry(s, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 });
  cab.translate(0, 0, -0.28);
  // as 6 ameias da torre, cada uma virada para fora, e as 8 pérolas da coroa da dama
  const ameias = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return new THREE.BoxGeometry(0.26, 0.26, 0.2).rotateY(-a).translate(Math.cos(a) * 0.52, 2.56, Math.sin(a) * 0.52);
  });
  const perolas = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return new THREE.SphereGeometry(0.09, 10, 8).translate(Math.cos(a) * 0.6, 2.86, Math.sin(a) * 0.6);
  });
  const cruz = [new THREE.BoxGeometry(0.12, 0.6, 0.12).translate(0, 3.42, 0), new THREE.BoxGeometry(0.4, 0.12, 0.12).translate(0, 3.48, 0)];
  // cada peça do xadrez numa geometria só: um desenho por peça (eram até 9), e outro na sombra
  g.peca = {
    p: torno.p,
    b: torno.b,
    r: juntar([torno.r, ...ameias]),
    q: juntar([torno.q, ...perolas]),
    k: juntar([torno.k, ...cruz]),
    // os cavalos branco (N) e preto (n) olham para lados opostos
    N: juntar([torno.n, cab.clone().rotateY(Math.PI / 2)]),
    n: juntar([torno.n, cab.clone().rotateY(-Math.PI / 2)]),
  };
  // dama (jogo de damas): disco com borda arredondada e um friso
  g.disco = new THREE.LatheGeometry([[0, 0], [0.9, 0], [0.97, 0.06], [0.97, 0.36], [0.9, 0.42], [0.62, 0.42], [0.56, 0.36], [0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y)), 36);
  g.coroa = new THREE.TorusGeometry(0.5, 0.08, 8, 28);
  g.cacos = [new THREE.TetrahedronGeometry(0.3), new THREE.BoxGeometry(0.34, 0.24, 0.26), new THREE.DodecahedronGeometry(0.2)];
  g.alvo = new THREE.CircleGeometry(0.42, 24);
  g.anel = new THREE.RingGeometry(1.0, 1.2, 36);
  geoCache = g;
  return g;
}

const MATERIAIS = {
  w: new THREE.MeshStandardMaterial({ color: 0xece5d4, roughness: 0.32, metalness: 0.02 }),
  b: new THREE.MeshStandardMaterial({ color: 0x1f1e26, roughness: 0.28, metalness: 0.18 }),
  dw: new THREE.MeshStandardMaterial({ color: 0xf1e2bf, roughness: 0.4 }),
  db: new THREE.MeshStandardMaterial({ color: 0x5a1717, roughness: 0.35, metalness: 0.05 }),
  ouro: new THREE.MeshStandardMaterial({ color: 0xf5c451, roughness: 0.25, metalness: 0.8, emissive: 0x3a2600 }),
  x: new THREE.MeshStandardMaterial({ color: 0xff5d73, roughness: 0.3, emissive: 0x7a1020 }),
  o: new THREE.MeshStandardMaterial({ color: 0x6ee7c8, roughness: 0.3, emissive: 0x0b5a48 }),
};

function pecaXadrez(p) {
  const t = p.toLowerCase();
  const corpo = new THREE.Group();
  const m = new THREE.Mesh(geometrias().peca[t === 'n' ? p : t], p !== t ? MATERIAIS.w : MATERIAIS.b);
  m.castShadow = true;
  m.receiveShadow = true;
  corpo.add(m);
  corpo.scale.setScalar(1.12);
  return corpo;
}

function pecaDama(p) {
  const g = geometrias();
  const mat = p.toLowerCase() === 'w' ? MATERIAIS.dw : MATERIAIS.db;
  const corpo = new THREE.Group();
  const d = new THREE.Mesh(g.disco, mat);
  d.castShadow = d.receiveShadow = true;
  corpo.add(d);
  if (p === 'W' || p === 'B') coroar(corpo, mat);
  return corpo;
}

// jogo da velha: X de duas barras cruzadas, O de um anel grosso — deitados no tabuleiro
function pecaVelha(p) {
  const corpo = new THREE.Group();
  if (p === 'x') {
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const barra = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.75), MATERIAIS.x);
      barra.rotation.y = a;
      barra.position.y = 0.35;
      barra.castShadow = true;
      corpo.add(barra);
    }
  } else {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.36, 14, 40), MATERIAIS.o);
    anel.rotation.x = Math.PI / 2;
    anel.position.y = 0.36;
    anel.castShadow = true;
    corpo.add(anel);
  }
  return corpo;
}

function coroar(corpo, mat) {
  const g = geometrias();
  const d2 = new THREE.Mesh(g.disco, mat);
  d2.position.y = 0.42;
  d2.castShadow = true;
  const c = new THREE.Mesh(g.coroa, MATERIAIS.ouro);
  c.rotation.x = Math.PI / 2;
  c.position.y = 0.86;
  corpo.add(d2, c);
}

// ------------------------------------------------------------------ mesa
export class Mesa {
  constructor(tipo, world) {
    this.tipo = tipo;
    this.def = MESAS[tipo];
    this.world = world;
    this.n = this.def.n;
    this.q = this.def.q;
    this.lado = this.q * this.n + BORDA * 2;
    this.linha = null; // casas da linha vencedora (jogo da velha), que ficam pulsando
    this.grupo = new THREE.Group();
    this.grupo.position.set(this.def.x, 0, this.def.z);
    world.fora.add(this.grupo);
    this.pecas = new Array(this.n * this.n).fill(null);
    this.fila = [];
    this.atual = null;
    this.cacos = [];
    this.camPos = new THREE.Vector3();
    this.construir();
  }

  construir() {
    const { x, z } = this.def;
    const { q: Q, lado: LADO } = this;
    // praça de pedra em volta, um degrau acima da grama (dá para subir andando)
    const praca = LADO + 9;
    const pedra = new THREE.Mesh(new THREE.BoxGeometry(praca, 0.15, praca), new THREE.MeshStandardMaterial({ color: 0x4b4f5c, roughness: 0.95 }));
    pedra.position.y = 0.075;
    pedra.receiveShadow = true;
    this.grupo.add(pedra);
    this.world.addBox({ min: [x - praca / 2, 0, z - praca / 2], max: [x + praca / 2, 0.15, z + praca / 2] });

    const tab = new THREE.Mesh(new THREE.PlaneGeometry(LADO, LADO), new THREE.MeshStandardMaterial({ map: texturaTabuleiro(this.tipo, this.n, Q, LADO), roughness: 0.42, metalness: 0.05 }));
    tab.rotation.x = -Math.PI / 2;
    tab.position.y = Y;
    tab.receiveShadow = true;
    this.grupo.add(tab);
    this.tab = tab;

    // placas nos dois lados
    const cor = { xadrez: '#a78bfa', dama: '#fbbf24', velha: '#ff5d73' }[this.tipo];
    const tex = placaTexto(this.def.nome.toUpperCase(), cor);
    const ferroPlaca = new THREE.MeshStandardMaterial({ color: 0x1b1f2a });
    const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // A caixa da placa em dois grupos, 2 desenhos em vez de 6: laterais, topo e base (os 24
    // primeiros índices) de ferro, frente e verso com o nome.
    const caixa = new THREE.BoxGeometry(9, 1.7, 0.16);
    caixa.clearGroups();
    caixa.addGroup(0, 24, 0);
    caixa.addGroup(24, 12, 1);
    const pes = [];
    for (const lado of [1, -1]) {
      // pórtico na beira da praça: a placa fica no alto, para não tampar o tabuleiro
      const z = lado * (LADO / 2 + 4);
      const placa = new THREE.Mesh(caixa, [ferroPlaca, face]);
      placa.position.set(0, 6.2, z);
      this.grupo.add(placa);
      for (const sx of [-1, 1]) pes.push(new THREE.BoxGeometry(0.35, 7, 0.35).translate(sx * 4.7, 3.5, z));
    }
    // os 4 pés numa malha só
    const pe = new THREE.Mesh(mergeGeometries(pes), ferroPlaca);
    pe.castShadow = true;
    this.grupo.add(pe);
    // braseiros nos cantos: luz quente, como nas masmorras de Hogwarts. Hastes e taças numa malha
    // só; as 4 chamas numa InstancedMesh, que o update faz tremular.
    const fogo = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
    const ferro = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.5 });
    const h = LADO / 2 + 2.6;
    const suportes = [];
    this.chamas = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 1.0, 10), fogo, 4);
    this.chamas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.posChamas = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], k) => {
      suportes.push(
        new THREE.CylinderGeometry(0.12, 0.18, 3, 8).translate(sx * h, 1.5, sz * h),
        new THREE.CylinderGeometry(0.55, 0.25, 0.5, 12).translate(sx * h, 3.1, sz * h),
      );
      const p = new THREE.Vector3(sx * h, 3.75, sz * h);
      this.chamas.setMatrixAt(k, _m.makeTranslation(p));
      return p;
    });
    // a esfera de recorte sai com as chamas na escala 1, a maior a que elas chegam
    this.chamas.computeBoundingSphere();
    this.grupo.add(new THREE.Mesh(mergeGeometries(suportes), ferro), this.chamas);
    const luz = new THREE.PointLight(0xffc27a, 120, 40, 1.4);
    luz.position.set(0, 9, 0);
    this.grupo.add(luz);

    // marcações: casa escolhida, para onde pode ir, último lance
    const g = geometrias();
    this.marcaSel = new THREE.Mesh(g.anel, new THREE.MeshBasicMaterial({ color: 0x6ee7c8, toneMapped: false, transparent: true, opacity: 0.95 }));
    this.marcaSel.rotation.x = -Math.PI / 2;
    this.marcaSel.visible = false;
    this.grupo.add(this.marcaSel);
    const alvoMat = new THREE.MeshBasicMaterial({ color: 0x6ee7c8, toneMapped: false, transparent: true, opacity: 0.75 });
    this.alvos = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(g.alvo, alvoMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.grupo.add(m);
      this.alvos.push(m);
    }
    const ultMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.28, depthWrite: false });
    this.ultimo = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Q * 0.98, Q * 0.98), ultMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.grupo.add(m);
      return m;
    });
    const mira = new THREE.Mesh(new THREE.PlaneGeometry(Q, Q), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
    mira.rotation.x = -Math.PI / 2;
    mira.visible = false;
    this.grupo.add(mira);
    this.mira = mira;
  }

  // centro da casa, em coordenadas do grupo (coluna a = -x, fileira 1 = +z)
  local(i, out = new THREE.Vector3()) {
    const m = (this.n - 1) / 2;
    return out.set(((i % this.n) - m) * this.q, Y, (m - Math.floor(i / this.n)) * this.q);
  }
  mundo(i, out = new THREE.Vector3()) {
    return this.local(i, out).add(this.grupo.position);
  }
  get centro() { return this.grupo.position; }
  // a pessoa está na praça?
  perto(p, folga = 5.5) {
    const m = this.lado / 2 + folga;
    return Math.abs(p.x - this.def.x) < m && Math.abs(p.z - this.def.z) < m;
  }
  // onde fica de pé quem comanda cada lado
  posComandante(lado) {
    const s = lado === 0 ? 1 : -1;
    return [this.def.x, 0.15, this.def.z + s * (this.lado / 2 + 1.6)];
  }
  // câmera de quem comanda (lado 0/1) ou assiste (null)
  pose(lado, zoom = 1, giro = 0) {
    const ang = (lado === 1 ? Math.PI : 0) + giro;
    const k = Math.max(0.62, this.lado / 23.4); // tabuleiro menor, câmera mais perto
    const d = 19 * zoom * k;
    const pos = new THREE.Vector3(Math.sin(ang) * d, 22 * zoom * k, Math.cos(ang) * d).add(this.grupo.position);
    const alvo = new THREE.Vector3(Math.sin(ang) * 1.5, 0, Math.cos(ang) * 1.5).add(this.grupo.position);
    return { position: pos, target: alvo };
  }

  casaNoRaio(raycaster) {
    const hit = raycaster.intersectObject(this.tab, false)[0];
    if (!hit) return -1;
    const p = hit.point.sub(this.grupo.position);
    const n = this.n;
    const c = Math.floor(p.x / this.q + n / 2);
    const l = Math.floor(n / 2 - p.z / this.q);
    return c >= 0 && c < n && l >= 0 && l < n ? l * n + c : -1;
  }

  // ---------------------------------------------------------------- estado
  novaPeca(p) {
    const corpo = this.tipo === 'xadrez' ? pecaXadrez(p) : this.tipo === 'dama' ? pecaDama(p) : pecaVelha(p);
    const peca = new THREE.Group();
    peca.add(corpo);
    peca.userData = { p, corpo };
    this.grupo.add(peca);
    return peca;
  }

  // Põe as peças do jeito que estão no tabuleiro, sem animação (entrar na sala, partida nova).
  reconstruir(b, ultimo = null) {
    this.fila = [];
    this.atual?.return(); // a animação largada no meio ainda fecha o que abriu (a luz do brilho)
    this.atual = null;
    this.linha = null;
    for (const m of this.pecas) if (m) this.grupo.remove(m);
    this.pecas = b.map((p, i) => {
      if (!p) return null;
      const m = this.novaPeca(p);
      this.local(i, m.position);
      return m;
    });
    this.marcarUltimo(ultimo);
    this.marcarSombra();
  }

  // Peça que anda, aparece ou some muda a sombra do sol: pede um mapa novo ao World, se a mesa
  // aparece (jogo ligado, lado de fora à vista) e está na área da sombra. Quando ela volta a
  // aparecer, o próprio World refaz a sombra. Sem a API nova do World, a sombra já é de todo quadro.
  marcarSombra() {
    const w = this.world;
    if (this.grupo.visible && w.fora.visible && (w.pertoDoSol?.(this.grupo.position) ?? true)) w.marcarSombra?.();
  }

  marcarUltimo(casas) {
    this.ultimo.forEach((m, k) => {
      m.visible = !!casas && casas[k] != null;
      if (m.visible) this.local(casas[k], m.position).y = Y + 0.012;
    });
  }

  marcar(sel, destinos = []) {
    this.marcaSel.visible = sel >= 0;
    if (sel >= 0) this.local(sel, this.marcaSel.position).y = Y + 0.02;
    this.alvos.forEach((m, k) => {
      m.visible = k < destinos.length;
      if (m.visible) this.local(destinos[k], m.position).y = Y + 0.03;
    });
  }

  apontar(i) {
    this.mira.visible = i >= 0;
    if (i >= 0) this.local(i, this.mira.position).y = Y + 0.015;
  }

  get ocupada() { return !!this.atual || this.fila.length > 0; }

  // ---------------------------------------------------------------- animação
  animarXadrez(v) { this.fila.push(() => this.lanceXadrez(v)); }
  animarDama(v) { this.fila.push(() => this.lanceDama(v)); }
  animarVelha(v) { this.fila.push(() => this.lanceVelha(v)); }

  // o X ou o O despenca do céu na casa e quica
  *lanceVelha({ casa, p }) {
    const peca = this.novaPeca(p);
    this.pecas[casa] = peca;
    const alvo = this.local(casa);
    peca.position.set(alvo.x, Y + 16, alvo.z);
    peca.rotation.y = Math.random() * 0.6 - 0.3;
    this.marcarUltimo([casa]);
    yield* tween(0.7, (t) => {
      peca.position.y = Y + 16 * (1 - t * t);
      peca.userData.corpo.rotation.y = (1 - t) * 3;
    });
    sfx.pedraPasso?.(this.volume(alvo) * 1.4);
    yield* tween(0.35, (t) => {
      const amassa = Math.sin(Math.PI * t) * 0.35;
      peca.scale.set(1 + amassa, 1 - amassa, 1 + amassa);
      peca.position.y = Y + Math.sin(Math.PI * t) * 0.6;
    });
    peca.scale.set(1, 1, 1);
    peca.position.y = Y;
  }

  // linha vencedora da velha: as três peças pulsam
  destacar(casas) {
    this.linha = casas;
  }

  volume(pos) {
    return Math.max(0, 1 - this.camPos.distanceTo(_v.copy(pos).add(this.grupo.position)) / 90);
  }

  // anda até "para" (coordenadas locais). salto = o cavalo pula por cima das outras.
  *andar(peca, para, { salto = false, altura = 3.2, dur = null } = {}) {
    const de = peca.position.clone();
    const dist = de.distanceTo(para);
    if (dist < 0.01) return;
    const d = dur ?? Math.min(2.4, 0.45 + dist / 6.5);
    const dir = _v.copy(para).sub(de).setY(0).normalize();
    const eixo = new THREE.Vector3().crossVectors(_up, dir);
    const passos = Math.max(2, Math.round(dist / 1.4));
    const corpo = peca.userData.corpo;
    yield* tween(d, (t) => {
      const k = ease(t);
      peca.position.lerpVectors(de, para, k);
      if (salto) {
        peca.position.y = Y + Math.sin(Math.PI * t) * altura;
        corpo.quaternion.setFromAxisAngle(eixo, Math.sin(Math.PI * t) * 0.35);
      } else {
        // peça "andando": quica um pouco a cada passo e inclina para a frente
        peca.position.y = Y + Math.abs(Math.sin(t * Math.PI * passos)) * 0.18;
        corpo.quaternion.setFromAxisAngle(eixo, Math.sin(Math.PI * t) * 0.1);
      }
    });
    peca.position.copy(para);
    corpo.quaternion.identity();
    sfx.pedraPasso?.(this.volume(para));
  }

  // levanta, joga o peso para trás e desce o golpe na vítima
  *golpe(peca, vitima) {
    const corpo = peca.userData.corpo;
    const dir = vitima.position.clone().sub(peca.position).setY(0).normalize();
    const eixo = new THREE.Vector3().crossVectors(_up, dir);
    const y0 = peca.position.y;
    yield* tween(0.32, (t) => {
      peca.position.y = y0 + ease(t) * 0.9;
      corpo.quaternion.setFromAxisAngle(eixo, -ease(t) * 0.45);
    });
    yield* tween(0.12, (t) => {
      peca.position.y = y0 + 0.9 * (1 - t);
      corpo.quaternion.setFromAxisAngle(eixo, -0.45 + t * 1.05);
    });
    this.estilhacar(vitima, dir);
    yield* tween(0.3, (t) => corpo.quaternion.setFromAxisAngle(eixo, 0.6 * (1 - ease(t))));
    corpo.quaternion.identity();
  }

  *lanceXadrez(v) {
    const peca = this.pecas[v.de];
    if (!peca) return;
    const vitima = v.cap >= 0 ? this.pecas[v.cap] : null;
    this.pecas[v.de] = null;
    if (v.cap >= 0) this.pecas[v.cap] = null;
    const torre = v.roque ? this.pecas[v.roque.de] : null;
    if (v.roque) this.pecas[v.roque.de] = null;
    this.pecas[v.para] = peca;
    if (torre) this.pecas[v.roque.para] = torre;
    this.marcarUltimo([v.de, v.para]);
    const destino = this.local(v.para);
    const cavalo = peca.userData.p.toLowerCase() === 'n';

    if (vitima) {
      // chega perto da vítima, bate, e só então ocupa a casa
      const dir = vitima.position.clone().sub(peca.position).setY(0);
      const perto = vitima.position.clone().addScaledVector(dir.normalize(), -this.q * 0.7);
      perto.y = Y;
      yield* this.andar(peca, perto, { salto: cavalo });
      yield* this.golpe(peca, vitima);
      yield* esperar(0.15);
      yield* this.andar(peca, destino, { dur: 0.6 });
    } else if (torre) {
      // roque: rei e torre ao mesmo tempo
      const r0 = torre.position.clone();
      const r1 = this.local(v.roque.para);
      const k0 = peca.position.clone();
      yield* tween(1.3, (t) => {
        const k = ease(t);
        peca.position.lerpVectors(k0, destino, k);
        torre.position.lerpVectors(r0, r1, k);
        torre.position.y = Y + Math.sin(Math.PI * t) * 1.2; // a torre pula por cima do rei
      });
      torre.position.copy(r1);
      sfx.pedraPasso?.(this.volume(destino));
    } else {
      yield* this.andar(peca, destino, { salto: cavalo });
    }

    if (v.promo) {
      // promoção: a peça brilha e vira outra, da mesma cor (o lance traz a letra minúscula)
      const p = peca.userData.p;
      const nova = p === p.toUpperCase() ? v.promo.toUpperCase() : v.promo;
      yield* this.brilho(peca);
      this.grupo.remove(peca);
      const outra = this.novaPeca(nova);
      outra.position.copy(destino);
      this.pecas[v.para] = outra;
      sfx.checkpoint?.();
    }
  }

  *brilho(peca) {
    const luz = new THREE.PointLight(0x9fe8ff, 0, 10, 1.5);
    luz.position.set(0, 2.5, 0);
    peca.add(luz);
    // o World refaz a lista das luzes acesas na entrada e na saída: luz nova sem aviso seria a
    // maxLuzes + 1, e todo shader recompilaria
    this.world.luzesMudaram?.();
    try {
      yield* tween(0.7, (t) => {
        luz.intensity = Math.sin(Math.PI * t) * 260;
        peca.rotation.y = ease(t) * Math.PI * 2;
      });
    } finally {
      peca.rotation.y = 0;
      peca.remove(luz);
      this.world.luzesMudaram?.();
    }
  }

  *lanceDama(v) {
    const { caminho, capturas } = v;
    const peca = this.pecas[caminho[0]];
    if (!peca) return;
    this.pecas[caminho[0]] = null;
    const vitimas = new Map(capturas.map((c) => [c, this.pecas[c]]));
    for (const c of capturas) this.pecas[c] = null;
    const fim = caminho[caminho.length - 1];
    this.pecas[fim] = peca;
    this.marcarUltimo([caminho[0], fim]);
    for (let k = 1; k < caminho.length; k++) {
      const de = caminho[k - 1];
      const para = caminho[k];
      const presa = capturas.find((c) => entre(de, para, c));
      const alvo = this.local(para);
      if (presa == null) {
        yield* this.andar(peca, alvo);
        continue;
      }
      // pula por cima da presa e ela se despedaça quando ele passa
      const vit = vitimas.get(presa);
      const p0 = peca.position.clone();
      const d = Math.min(1.6, 0.6 + p0.distanceTo(alvo) / 8);
      let quebrou = false;
      yield* tween(d, (t) => {
        peca.position.lerpVectors(p0, alvo, ease(t));
        peca.position.y = Y + Math.sin(Math.PI * t) * 2.6;
        if (!quebrou && t > 0.55 && vit) {
          quebrou = true;
          this.estilhacar(vit, _v.copy(alvo).sub(p0).setY(0).normalize());
        }
      });
      peca.position.copy(alvo);
      sfx.pedraPasso?.(this.volume(alvo));
      yield* esperar(0.12);
    }
    if (v.promove) {
      yield* this.brilho(peca);
      const p = peca.userData.p.toUpperCase();
      peca.userData.p = p;
      coroar(peca.userData.corpo, p === 'W' ? MATERIAIS.dw : MATERIAIS.db);
      sfx.checkpoint?.();
    }
  }

  // a peça vira cacos que voam, quicam no tabuleiro e somem
  estilhacar(peca, dir) {
    this.grupo.remove(peca);
    const g = geometrias();
    const p = peca.userData.p;
    const mat = this.tipo === 'xadrez' ? (p === p.toUpperCase() ? MATERIAIS.w : MATERIAIS.b) : (p.toLowerCase() === 'w' ? MATERIAIS.dw : MATERIAIS.db);
    const altura = ALTURA[this.tipo === 'xadrez' ? p.toLowerCase() : p] || 1;
    const n = this.tipo === 'xadrez' ? 34 : 16;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g.cacos[i % 3], mat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      m.position.set(peca.position.x + Math.cos(a) * r, Y + Math.random() * altura, peca.position.z + Math.sin(a) * r);
      m.scale.setScalar(0.6 + Math.random() * 0.9);
      m.castShadow = true;
      const vel = new THREE.Vector3(Math.cos(a) * 4, 3 + Math.random() * 6, Math.sin(a) * 4).addScaledVector(dir, 5 + Math.random() * 4);
      this.grupo.add(m);
      this.cacos.push({ m, vel, giro: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), vida: 2.6 + Math.random() * 1.2, s: m.scale.x });
    }
    sfx.pedraQuebra?.(this.volume(peca.position));
  }

  update(dt, t, camPos) {
    this.camPos.copy(camPos);
    this.posChamas.forEach((p, k) => this.chamas.setMatrixAt(k, _m.makeScale(1, 0.85 + Math.sin(t * 9 + k * 2) * 0.15, 1).setPosition(p)));
    this.chamas.instanceMatrix.needsUpdate = true;
    // peça andando, a linha da velha pulando ou cacos voando, inclusive no quadro em que param
    const pulando = this.linha && !this.ocupada;
    if (this.ocupada || this.cacos.length || pulando) this.marcarSombra();
    if (pulando) {
      for (const i of this.linha) {
        const p = this.pecas[i];
        if (p) p.position.y = Y + Math.abs(Math.sin(t * 4)) * 1.2;
      }
    }
    // animações: uma de cada vez, na ordem dos lances
    let resto = dt;
    while (resto > 0) {
      if (!this.atual) {
        const prox = this.fila.shift();
        if (!prox) break;
        this.atual = prox();
        this.atual.next();
      }
      const r = this.atual.next(resto);
      resto = 0;
      if (r.done) this.atual = null;
    }
    // estilhaços
    for (let i = this.cacos.length - 1; i >= 0; i--) {
      const c = this.cacos[i];
      c.vida -= dt;
      c.vel.y -= 22 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      if (c.m.position.y < Y + 0.1) {
        c.m.position.y = Y + 0.1;
        c.vel.y *= -0.3;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.giro.multiplyScalar(0.6);
      }
      c.m.rotation.x += c.giro.x * dt;
      c.m.rotation.y += c.giro.y * dt;
      c.m.rotation.z += c.giro.z * dt;
      if (c.vida < 0.6) c.m.scale.setScalar(Math.max(0.001, c.s * (c.vida / 0.6)));
      if (c.vida <= 0) {
        this.grupo.remove(c.m);
        this.cacos.splice(i, 1);
      }
    }
  }
}

// a casa c está no segmento diagonal entre de e para?
function entre(de, para, c) {
  const dc = Math.sign((para & 7) - (de & 7));
  const dl = Math.sign((para >> 3) - (de >> 3));
  let x = (de & 7) + dc;
  let y = (de >> 3) + dl;
  while (x !== (para & 7)) {
    if (y * 8 + x === c) return true;
    x += dc;
    y += dl;
  }
  return false;
}
