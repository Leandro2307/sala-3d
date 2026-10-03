// Tabuleiros gigantes do lado de fora do cinema: xadrez de bruxo (como em Harry Potter, as peças
// andam sozinhas e a que é tomada se despedaça) e um jogo de damas no mesmo tamanho.
// Aqui fica só a parte 3D: tabuleiro, peças, animações e estilhaços. As regras ficam em
// xadrez.js/dama.js e a partida (rede, comandos, HUD) em jogos.js.
import * as THREE from 'three';
import { sfx } from './sfx.js';

export const Q = 2.6; // lado de uma casa, em metros
const BORDA = 1.3;
const LADO = Q * 8 + BORDA * 2;
const Y = 0.16; // altura do tabuleiro (em cima da praça)
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

// Ficam a sudeste da porta do cinema, longe da estrada do autódromo.
export const MESAS = {
  xadrez: { x: 90, z: -12, nome: 'Xadrez de bruxo', lados: ['Brancas', 'Pretas'] },
  dama: { x: 122, z: -12, nome: 'Dama gigante', lados: ['Claras', 'Escuras'] },
};
// para a natureza não plantar árvore em cima
export const RESERVA_JOGOS = { x: 106, z: -12, r: 38 };

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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

function texturaTabuleiro(tipo) {
  const px = 1280;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  const k = px / LADO;
  const b = BORDA * k;
  const q = Q * k;
  const [claro, escuro, moldura, letra] = tipo === 'xadrez'
    ? ['#ddd6c6', '#26252d', '#17161c', '#c9b98f']
    : ['#e8d6ae', '#2f5d45', '#3a2417', '#f3dfb5'];
  ctx.fillStyle = moldura;
  ctx.fillRect(0, 0, px, px);
  for (let l = 0; l < 8; l++) {
    for (let c = 0; c < 8; c++) {
      const x = b + c * q;
      const y = b + (7 - l) * q;
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
  ctx.strokeRect(b - 3, b - 3, q * 8 + 6, q * 8 + 6);
  ctx.fillStyle = letra;
  ctx.font = `800 ${Math.round(b * 0.55)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const L = 'abcdefgh'[i];
    ctx.fillText(L, b + i * q + q / 2, px - b / 2);
    ctx.save();
    ctx.translate(b + i * q + q / 2, b / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(L, 0, 0);
    ctx.restore();
    ctx.fillText(String(i + 1), b / 2, b + (7 - i) * q + q / 2);
    ctx.save();
    ctx.translate(px - b / 2, b + (7 - i) * q + q / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(String(i + 1), 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function placaTexto(texto, cor) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 192;
  const ctx = cv.getContext('2d');
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

let geoCache = null;
function geometrias() {
  if (geoCache) return geoCache;
  const g = {};
  for (const [t, pts] of Object.entries(PERFIS)) {
    g[t] = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), 28);
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
  g.cabeca = cab;
  g.ameia = new THREE.BoxGeometry(0.26, 0.26, 0.2);
  g.cruzV = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  g.cruzH = new THREE.BoxGeometry(0.4, 0.12, 0.12);
  g.perola = new THREE.SphereGeometry(0.09, 10, 8);
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
};

function pecaXadrez(p) {
  const g = geometrias();
  const t = p.toLowerCase();
  const branca = p !== t;
  const mat = branca ? MATERIAIS.w : MATERIAIS.b;
  const corpo = new THREE.Group();
  const add = (geo, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    corpo.add(m);
    return m;
  };
  add(g[t]);
  if (t === 'n') add(g.cabeca).rotation.y = branca ? Math.PI / 2 : -Math.PI / 2;
  if (t === 'r') for (let i = 0; i < 6; i++) add(g.ameia, Math.cos((i / 6) * Math.PI * 2) * 0.52, 2.56, Math.sin((i / 6) * Math.PI * 2) * 0.52).rotation.y = -(i / 6) * Math.PI * 2;
  if (t === 'q') for (let i = 0; i < 8; i++) add(g.perola, Math.cos((i / 8) * Math.PI * 2) * 0.6, 2.86, Math.sin((i / 8) * Math.PI * 2) * 0.6);
  if (t === 'k') {
    add(g.cruzV, 0, 3.42);
    add(g.cruzH, 0, 3.48);
  }
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
    this.grupo = new THREE.Group();
    this.grupo.position.set(this.def.x, 0, this.def.z);
    world.fora.add(this.grupo);
    this.pecas = new Array(64).fill(null);
    this.fila = [];
    this.atual = null;
    this.cacos = [];
    this.camPos = new THREE.Vector3();
    this.construir();
  }

  construir() {
    const { x, z } = this.def;
    // praça de pedra em volta, um degrau acima da grama (dá para subir andando)
    const praca = LADO + 9;
    const pedra = new THREE.Mesh(new THREE.BoxGeometry(praca, 0.15, praca), new THREE.MeshStandardMaterial({ color: 0x4b4f5c, roughness: 0.95 }));
    pedra.position.y = 0.075;
    pedra.receiveShadow = true;
    this.grupo.add(pedra);
    this.world.addBox({ min: [x - praca / 2, 0, z - praca / 2], max: [x + praca / 2, 0.15, z + praca / 2] });

    const tab = new THREE.Mesh(new THREE.PlaneGeometry(LADO, LADO), new THREE.MeshStandardMaterial({ map: texturaTabuleiro(this.tipo), roughness: 0.42, metalness: 0.05 }));
    tab.rotation.x = -Math.PI / 2;
    tab.position.y = Y;
    tab.receiveShadow = true;
    this.grupo.add(tab);
    this.tab = tab;

    // placas nos dois lados
    const cor = this.tipo === 'xadrez' ? '#a78bfa' : '#fbbf24';
    const tex = placaTexto(this.def.nome.toUpperCase(), cor);
    const ferroPlaca = new THREE.MeshStandardMaterial({ color: 0x1b1f2a });
    const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    for (const lado of [1, -1]) {
      // pórtico na beira da praça: a placa fica no alto, para não tampar o tabuleiro
      const z = lado * (LADO / 2 + 4);
      const placa = new THREE.Mesh(new THREE.BoxGeometry(9, 1.7, 0.16), [ferroPlaca, ferroPlaca, ferroPlaca, ferroPlaca, face, face]);
      placa.position.set(0, 6.2, z);
      this.grupo.add(placa);
      for (const sx of [-1, 1]) {
        const pe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), ferroPlaca);
        pe.position.set(sx * 4.7, 3.5, z);
        pe.castShadow = true;
        this.grupo.add(pe);
      }
    }
    // braseiros nos cantos: luz quente, como nas masmorras de Hogwarts
    const fogo = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
    const ferro = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.5 });
    const h = LADO / 2 + 2.6;
    this.chamas = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3, 8), ferro);
      haste.position.set(sx * h, 1.5, sz * h);
      const taca = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 0.5, 12), ferro);
      taca.position.set(sx * h, 3.1, sz * h);
      const chama = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 10), fogo);
      chama.position.set(sx * h, 3.75, sz * h);
      this.chamas.push(chama);
      this.grupo.add(haste, taca, chama);
    }
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
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Q, Q), ultMat);
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
    return out.set(((i & 7) - 3.5) * Q, Y, (3.5 - (i >> 3)) * Q);
  }
  mundo(i, out = new THREE.Vector3()) {
    return this.local(i, out).add(this.grupo.position);
  }
  get centro() { return this.grupo.position; }
  // a pessoa está na praça?
  perto(p, folga = 5.5) {
    const m = LADO / 2 + folga;
    return Math.abs(p.x - this.def.x) < m && Math.abs(p.z - this.def.z) < m;
  }
  // onde fica de pé quem comanda cada lado
  posComandante(lado) {
    const s = lado === 0 ? 1 : -1;
    return [this.def.x, 0.15, this.def.z + s * (LADO / 2 + 1.6)];
  }
  // câmera de quem comanda (lado 0/1) ou assiste (null)
  pose(lado, zoom = 1, giro = 0) {
    const ang = (lado === 1 ? Math.PI : 0) + giro;
    const d = 19 * zoom;
    const pos = new THREE.Vector3(Math.sin(ang) * d, 22 * zoom, Math.cos(ang) * d).add(this.grupo.position);
    const alvo = new THREE.Vector3(Math.sin(ang) * 1.5, 0, Math.cos(ang) * 1.5).add(this.grupo.position);
    return { position: pos, target: alvo };
  }

  casaNoRaio(raycaster) {
    const hit = raycaster.intersectObject(this.tab, false)[0];
    if (!hit) return -1;
    const p = hit.point.sub(this.grupo.position);
    const c = Math.floor(p.x / Q + 4);
    const l = Math.floor(4 - p.z / Q);
    return c >= 0 && c < 8 && l >= 0 && l < 8 ? l * 8 + c : -1;
  }

  // ---------------------------------------------------------------- estado
  novaPeca(p) {
    const corpo = this.tipo === 'xadrez' ? pecaXadrez(p) : pecaDama(p);
    const peca = new THREE.Group();
    peca.add(corpo);
    peca.userData = { p, corpo };
    this.grupo.add(peca);
    return peca;
  }

  // Põe as peças do jeito que estão no tabuleiro, sem animação (entrar na sala, partida nova).
  reconstruir(b, ultimo = null) {
    this.fila = [];
    this.atual = null;
    for (const m of this.pecas) if (m) this.grupo.remove(m);
    this.pecas = b.map((p, i) => {
      if (!p) return null;
      const m = this.novaPeca(p);
      this.local(i, m.position);
      return m;
    });
    this.marcarUltimo(ultimo);
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
      const perto = vitima.position.clone().addScaledVector(dir.normalize(), -Q * 0.7);
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
      // promoção: a peça brilha e vira outra
      const nova = v.promo;
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
    yield* tween(0.7, (t) => {
      luz.intensity = Math.sin(Math.PI * t) * 260;
      peca.rotation.y = ease(t) * Math.PI * 2;
    });
    peca.rotation.y = 0;
    peca.remove(luz);
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
    for (const [k, c] of this.chamas.entries()) c.scale.set(1, 0.85 + Math.sin(t * 9 + k * 2) * 0.15, 1);
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
