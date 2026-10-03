// Cena 3D: sala de cinema com parede de telas, sofás, parkour e camarote; lá fora, o
// autódromo ao ar livre, com serra, floresta e lago em volta.
import * as THREE from 'three';
import { isTouch } from './touch.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COURSE, RAILS, FUN_PADS } from './parkour.js';
import { RING } from './arena.js';
import { PISTA, CAMINHO, CURVAS, pontoEm, projetar } from './pista.js';
import { criarNatureza } from './natureza.js';
import { RESERVA_JOGOS } from './tabuleiros.js';

// Área jogável inteira (cercada): a sala do cinema num canto, em volta da origem, e o
// autódromo ao ar livre a leste. O telão do cinema continua em minZ, perto da plateia.
export const ROOM = { minX: -52, maxX: 480, minZ: -40, maxZ: 530, height: 60 };
// A sala do cinema: fechada e igual por dentro ao que sempre foi. A porta fica na parede
// leste, virada para o autódromo.
export const SALA = { minX: ROOM.minX, maxX: 60, minZ: ROOM.minZ, maxZ: 60, height: ROOM.height, porta: { z0: 14, z1: 46, altura: 18 } };
export const SPAWN = { pos: [0, 0, -2], yaw: 0 };

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const _tmp = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const TV_PX = { w: 1280, h: 720 }; // superfície CSS3D do player do telão (iframe/<video>)

// Parede de telas: telão no centro, 4 telas de compartilhamento nas laterais (levemente viradas para o centro).
const MAIN_LAYOUT = { x: 0, y: 12.6, z: ROOM.minZ + 0.6, w: 30, h: 16.875 };
const SLOT_LAYOUT = [
  { x: -24.6, y: 7.4, z: ROOM.minZ + 2.4, rotY: 0.26 },
  { x: 24.6, y: 7.4, z: ROOM.minZ + 2.4, rotY: -0.26 },
  { x: -24.6, y: 17.6, z: ROOM.minZ + 2.4, rotY: 0.26 },
  { x: 24.6, y: 17.6, z: ROOM.minZ + 2.4, rotY: -0.26 },
].map((s) => ({ ...s, w: 16, h: 9 }));

// ------------------------------------------------------------------ utilitários de textura
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.redraw = (...args) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  tex.userData.redraw();
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawMonitorIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.07;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  roundRect(ctx, cx - s * 0.6, cy - s * 0.42, s * 1.2, s * 0.74, s * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, cy + s * 0.55);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.55);
  ctx.moveTo(cx, cy + s * 0.32);
  ctx.lineTo(cx, cy + s * 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawPlayIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, cx - s * 0.62, cy - s * 0.44, s * 1.24, s * 0.88, s * 0.22);
  ctx.fill();
  ctx.fillStyle = '#0f1219';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.16, cy - s * 0.22);
  ctx.lineTo(cx + s * 0.26, cy);
  ctx.lineTo(cx - s * 0.16, cy + s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function screenBackground(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#121722');
  g.addColorStop(1, '#0a0d14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

export function textSprite(text, { color = '#ffffff', bg = 'rgba(12,14,20,0.72)', size = 1, accent = null } = {}) {
  const tex = canvasTexture(512, 128, (ctx, w, h, t = text, c = color, a = accent) => {
    ctx.font = `700 54px ${FONT}`;
    const tw = Math.min(ctx.measureText(t).width, w - 80);
    const pw = tw + (a ? 92 : 64);
    const x0 = (w - pw) / 2;
    ctx.fillStyle = bg;
    roundRect(ctx, x0, 20, pw, 88, 44);
    ctx.fill();
    if (a) {
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.arc(x0 + 44, 64, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = c;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(t, x0 + (a ? 68 : 32), 66, w - 80);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4 * size, 1 * size, 1);
  sprite.userData.setText = (t, c = color, a = accent) => tex.userData.redraw(t, c, a);
  return sprite;
}

// ------------------------------------------------------------------ colisores (AABB)
export class Collider {
  constructor(min, max, data = {}, mesh = null) {
    this.min = min;
    this.max = max;
    this.data = data;
    this.mesh = mesh;
    this.delta = new THREE.Vector3();
  }
}

// ------------------------------------------------------------------ telas
class ScreenDisplay {
  constructor({ w, h, title, subtitle, icon = 'monitor', accent = '#6ee7c8' }) {
    this.w = w;
    this.h = h;
    this.group = new THREE.Group();
    this.accent = accent;

    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(w + 0.7, h + 0.7, 0.5, 4, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 0.55, metalness: 0.3 }),
    );
    frame.position.z = -0.27;
    frame.castShadow = true;
    this.group.add(frame);

    // linha de LED em volta da tela
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 1.1, h + 1.1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, toneMapped: false }),
    );
    glow.position.z = -0.53;
    this.glow = glow;
    this.group.add(glow);

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }),
    );
    this.surface.userData.screen = this;
    this.group.add(this.surface);

    this.placeholderTex = canvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch, t = title, s = subtitle) => {
      screenBackground(ctx, cw, ch);
      if (icon === 'play') drawPlayIcon(ctx, cw / 2, ch * 0.4, ch * 0.24, '#ff4d5e');
      else drawMonitorIcon(ctx, cw / 2, ch * 0.38, ch * 0.24, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = '#f3f5fa';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(ch * 0.085)}px ${FONT}`;
      ctx.fillText(t, cw / 2, ch * 0.66);
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.font = `500 ${Math.round(ch * 0.05)}px ${FONT}`;
      ctx.fillText(s, cw / 2, ch * 0.76);
    });
    this.placeholder = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.placeholderTex, toneMapped: false }),
    );
    this.placeholder.position.z = 0.01;
    this.placeholder.userData.screen = this;
    this.group.add(this.placeholder);

    this.videoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    this.videoMesh.position.z = 0.02;
    this.videoMesh.visible = false;
    this.videoMesh.userData.screen = this;
    this.group.add(this.videoMesh);

    // etiqueta com o nome de quem está na tela (canto inferior esquerdo, estilo Meet)
    const lw = Math.min(w * 0.46, 8);
    const lh = lw / 6.4;
    this.labelTex = canvasTexture(1024, 160, (ctx, cw, ch, t = title, dot = null) => {
      ctx.font = `700 70px ${FONT}`;
      const tw = Math.min(ctx.measureText(t).width, cw - 150);
      const pw = tw + (dot ? 124 : 72);
      ctx.fillStyle = 'rgba(10,12,18,0.78)';
      roundRect(ctx, 0, 14, pw, 132, 66);
      ctx.fill();
      if (dot) {
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(62, 80, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, dot ? 98 : 36, 84, cw - 150);
    });
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshBasicMaterial({ map: this.labelTex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.label.position.set(-w / 2 + lw / 2 + 0.3, -h / 2 + lh / 2 + 0.25, 0.05);
    this.label.visible = false;
    this.group.add(this.label);

    this.video = null;
    this.texture = null;

    // "Buraco" transparente no WebGL por onde aparece o player do telão (CSS3D por trás do
    // canvas). Toda tela tem um: o player normalmente fica no telão, mas quando o telão
    // passa a mostrar a tela de alguém, o vídeo vai para a tela dessa pessoa.
    this.hole = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide,
        toneMapped: false, fog: false,
      }),
    );
    this.hole.position.z = 0.015;
    this.hole.visible = false;
    this.hole.userData.screen = this;
    this.group.add(this.hole);
    this.isHost = false; // é esta tela que está com o player agora?
    this.midia = false; // tela lateral fazendo as vezes de telão
    this.aoMudar = null;
  }

  // esta tela deveria estar mostrando o player do telão?
  get mostraMidia() { return this.midia; }

  // Mostra o player (se for esta a tela que está com ele) ou o cartaz do que está tocando.
  atualizarBuraco() {
    const ativo = this.mostraMidia;
    this.hole.visible = ativo && this.isHost;
    if (ativo) {
      this.placeholder.visible = !this.isHost;
      this.glow.material.opacity = 0.32;
    }
    this.aoMudar?.();
  }

  setMidia(on) {
    if (on) this.clearVideo();
    this.midia = on;
    this.atualizarBuraco();
  }

  setPlaceholder(title, subtitle) {
    if (this._phKey === title + subtitle) return;
    this._phKey = title + subtitle;
    this.placeholderTex.userData.redraw(title, subtitle);
  }

  setLabel(text, dotColor = null) {
    if (text == null) {
      this.label.visible = false;
      return;
    }
    if (this._labelKey !== text + dotColor) {
      this._labelKey = text + dotColor;
      this.labelTex.userData.redraw(text, dotColor);
    }
    this.label.visible = true;
  }

  setVideo(video) {
    if (this.video === video) return;
    this.clearVideo();
    this.video = video;
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.videoMesh.material.map = this.texture;
    this.videoMesh.material.needsUpdate = true;
    this._fit = () => this.fitAspect();
    video.addEventListener('resize', this._fit);
    video.addEventListener('loadedmetadata', this._fit);
    this.fitAspect();
    this.videoMesh.visible = true;
    this.placeholder.visible = false;
    this.glow.material.opacity = 0.32;
  }

  fitAspect() {
    const v = this.video;
    const aspect = v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : this.w / this.h;
    let w = this.w;
    let h = this.w / aspect;
    if (h > this.h) { h = this.h; w = this.h * aspect; }
    this.videoMesh.scale.set(w, h, 1);
  }

  clearVideo() {
    if (this.video && this._fit) {
      this.video.removeEventListener('resize', this._fit);
      this.video.removeEventListener('loadedmetadata', this._fit);
    }
    this.texture?.dispose();
    this.texture = null;
    this.video = null;
    this.videoMesh.material.map = null;
    this.videoMesh.visible = false;
    this.placeholder.visible = true;
    this.glow.material.opacity = 0.18;
  }

  // ponto em frente à tela, a uma distância que faz a tela preencher a câmera
  focusPose(camera, margin = 1.04) {
    const center = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    this.surface.getWorldPosition(center);
    this.surface.getWorldQuaternion(quat);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(this.h / 2 / tanHalf, this.w / 2 / (tanHalf * camera.aspect)) * margin;
    return { position: center.clone().addScaledVector(normal, dist), target: center };
  }
}

// Telão (o do cinema e o da pista). O player (iframe/<video>) é um só e fica atrás do
// telão mais perto de quem está olhando — ver World.atualizarTelao. Cada telão tem o seu
// "buraco" transparente no WebGL por onde o player aparece (CSS3D por trás do canvas).
class Telao extends ScreenDisplay {
  constructor(opts) {
    super({ ...opts, icon: 'play' });
    this.mode = 'empty';
  }

  get mostraMidia() { return this.mode === 'media'; }

  // 'empty' (sem vídeo) | 'media' (player do telão) | 'share'
  setMode(mode, video = null) {
    this.mode = mode;
    if (mode === 'share' && video) this.setVideo(video);
    else this.clearVideo();
    // o telão que não está com o player mostra o cartaz do que está tocando
    this.atualizarBuraco();
  }
}

// ------------------------------------------------------------------ mundo
export class World {
  constructor(canvas, cssContainer) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    // telas de celular têm DPR 3: renderizar nisso tudo derruba o fps sem ganho visível
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.25 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.css = new CSS3DRenderer({ element: cssContainer });
    this.css.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.cssScene = new THREE.Scene();

    // longe o bastante para a serra no horizonte (o céu é desenhado no fundo, sem limite)
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 12, 30);

    this.colliders = [];
    this.movers = [];
    this.cameraBlockers = []; // malhas que a câmera em 3ª pessoa não atravessa
    this.decorAnimated = [];
    this.checkpointLabels = new Map();
    this.fadeLabels = []; // placas do parkour somem quando a câmera chega perto
    this.reservas = []; // lugares onde a natureza não planta nada (arquibancada, telão, porta)
    this.estradas = [];
    // Tudo que fica do lado de fora da sala do cinema. Some quando a câmera está lá dentro e
    // não dá para ver a porta: a serra e a floresta não precisam ser desenhadas atrás da parede.
    this.fora = new THREE.Group();
    this.scene.add(this.fora);

    this.buildLights();
    this.buildRoom();
    this.buildAudience();
    this.buildScreens();
    this.buildCourse();
    this.buildRing();
    this.buildTrack();
    // praça do xadrez de bruxo e da dama (as peças em si ficam em jogos.js)
    this.reservas.push(RESERVA_JOGOS);
    this.placaDirecao(SALA.maxX + 9, SALA.porta.z0 + 2, -Math.PI / 2, '↖  XADREZ E DAMA', '#a78bfa');
    this.natureza = criarNatureza(this.scene, this.renderer, {
      area: ROOM, sala: SALA, reservas: this.reservas, estradas: this.estradas, addBox: (o) => this.addBox(o), grupo: this.fora,
    });
    const P = SALA.porta;
    this.portaBox = new THREE.Box3(new THREE.Vector3(SALA.maxX - 1, 0, P.z0), new THREE.Vector3(SALA.maxX + 1, P.altura, P.z1));
    // O lado de fora só é desenhado quando alguém olha pela porta ou sai, e é aí que o
    // navegador compilaria os shaders dele: a primeira olhada travava a tela por segundos.
    // Compila tudo agora, enquanto a pessoa ainda está no lobby.
    // Depois, um quadro invisível visto do alto manda terreno, árvores e texturas para a
    // placa de vídeo — senão o primeiro passo para fora ainda engasgava uns 300 ms.
    this.fora.visible = true;
    const aquecer = () => {
      const alvo = new THREE.WebGLRenderTarget(64, 64);
      const cam = new THREE.PerspectiveCamera(120, 1, 1, 4000);
      cam.position.set((ROOM.minX + ROOM.maxX) / 2, 700, (ROOM.minZ + ROOM.maxZ) / 2);
      cam.lookAt(cam.position.x, 0, cam.position.z);
      const vis = this.fora.visible;
      const solAntes = this.sun.target.position.clone();
      this.fora.visible = true;
      this.focarSol(200, 120); // a sombra também: árvores e torcida têm shader de sombra próprio
      this.renderer.setRenderTarget(alvo);
      this.renderer.render(this.scene, cam);
      this.renderer.setRenderTarget(null);
      this.focarSol(solAntes.x, solAntes.z);
      this.fora.visible = vis;
      alvo.dispose();
    };
    if (this.renderer.compileAsync) this.renderer.compileAsync(this.scene, this.camera).then(aquecer).catch(() => {});
    else {
      this.renderer.compile(this.scene, this.camera);
      aquecer();
    }

    window.addEventListener('resize', () => this.resize());
  }

  // -------------------------------------------------------------- construção
  buildLights() {
    const hemi = new THREE.HemisphereLight(0xc9d3ff, 0x252036, 1.45);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3e6, 1.5);
    sun.position.set(16, 60, 22);
    sun.target.position.set(0, 0, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.sunOffset = sun.position.clone().sub(sun.target.position);
    this.scene.add(sun, sun.target);

    // brilho azulado que "vem" da parede de telas
    const screenGlow = new THREE.PointLight(0x7f9cff, 260, 70, 1.2);
    screenGlow.position.set(0, 12, ROOM.minZ + 8);
    this.scene.add(screenGlow);

    const backGlow = new THREE.PointLight(0xd08bff, 180, 60, 1.2);
    backGlow.position.set(0, 18, 26);
    this.scene.add(backGlow);
  }

  // O galpão ficou grande demais para uma sombra só: em vez de esticar o mapa de
  // sombra sobre tudo (e borrar tudo), o sol acompanha o jogador. A área coberta
  // continua pequena e nítida, e vai junto com quem está olhando.
  focarSol(x, z) {
    if (!this.sun) return;
    const alvo = this.sun.target.position;
    if (Math.abs(alvo.x - x) < 6 && Math.abs(alvo.z - z) < 6) return;
    alvo.set(x, 0, z);
    this.sun.position.copy(alvo).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
  }

  addBox({ min, max, data = {}, mesh = null, blocksCamera = false }) {
    const c = new Collider(new THREE.Vector3(...min), new THREE.Vector3(...max), data, mesh);
    this.colliders.push(c);
    if (mesh && blocksCamera) this.cameraBlockers.push(mesh);
    return c;
  }

  // A sala do cinema ficou do jeito que era por dentro; o que mudou é que ela agora tem
  // paredes próprias (antes era um galpão único com a pista dentro) e uma porta para fora.
  buildRoom() {
    const S = SALA;
    const W = S.maxX - S.minX;
    const D = S.maxZ - S.minZ;
    const cx = (S.minX + S.maxX) / 2;
    const cz = (S.minZ + S.maxZ) / 2;
    const { height } = S;
    const P = S.porta;

    // chão com grade sutil (lá fora é grama)
    const gridTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#171a22';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#222736';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, w, h);
    });
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(W / 4, D / 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.85, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this.scene.add(floor);
    // o chão da física continua um só, do tamanho da área inteira
    this.addBox({ min: [ROOM.minX - 5, -4, ROOM.minZ - 5], max: [ROOM.maxX + 5, 0, ROOM.maxZ + 5], data: { type: 'floor' } });

    // paredes: caixas finas — por dentro o material de sempre, por fora a fachada
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x151821, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({ color: 0x0d0f15, roughness: 0.95 });
    const fachadaMat = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.8, metalness: 0.2 });
    const esp = 0.6;
    // faces da BoxGeometry: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
    const parede = (min, max, faceDentro, matDentro) => {
      const mats = new Array(6).fill(fachadaMat);
      mats[faceDentro] = matDentro;
      const m = new THREE.Mesh(new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]), mats);
      m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
      this.cameraBlockers.push(m);
      this.addBox({ min, max });
      return m;
    };
    parede([S.minX, 0, S.minZ - esp], [S.maxX + esp, height, S.minZ], 4, frontMat); // atrás do telão
    parede([S.minX, 0, S.maxZ], [S.maxX + esp, height, S.maxZ + esp], 5, wallMat); // fundo
    parede([S.minX - esp, 0, S.minZ - esp], [S.minX, height, S.maxZ + esp], 0, wallMat); // oeste
    parede([S.maxX, 0, S.minZ], [S.maxX + esp, height, P.z0], 1, wallMat); // leste, antes da porta
    parede([S.maxX, 0, P.z1], [S.maxX + esp, height, S.maxZ], 1, wallMat); // leste, depois da porta
    parede([S.maxX, P.altura, P.z0], [S.maxX + esp, height, P.z1], 1, wallMat); // em cima da porta
    // os limites da área jogável (cerca lá fora) continuam sólidos
    const t = 4;
    const R = ROOM;
    this.addBox({ min: [R.minX - t, -4, R.minZ - t], max: [R.maxX + t, height + 4, R.minZ] });
    this.addBox({ min: [R.minX - t, -4, R.maxZ], max: [R.maxX + t, height + 4, R.maxZ + t] });
    this.addBox({ min: [R.minX - t, -4, R.minZ - t], max: [R.minX, height + 4, R.maxZ + t] });
    this.addBox({ min: [R.maxX, -4, R.minZ - t], max: [R.maxX + t, height + 4, R.maxZ + t] });

    // teto (e a laje por cima, para quem olha de fora)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x0e1016, roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, height, cz);
    this.scene.add(ceiling);
    const laje = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * esp, 0.6, D + 2 * esp), fachadaMat);
    laje.position.set(cx, height + 0.35, cz);
    this.fora.add(laje);
    this.addBox({ min: [R.minX, height, R.minZ], max: [R.maxX, height + 4, R.maxZ] });

    // faixas de luz no teto e rodapé neon
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xdfe7ff, toneMapped: false });
    for (const x of [-18, 0, 18]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, D - 12), stripMat);
      s.position.set(x, height - 0.1, cz);
      this.scene.add(s);
    }
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x6ee7c8, toneMapped: false });
    const baseboards = [
      { size: [W, 0.12, 0.12], pos: [cx, 0.3, S.maxZ - 0.06] },
      { size: [0.12, 0.12, D], pos: [S.minX + 0.06, 0.3, cz] },
      { size: [0.12, 0.12, P.z0 - S.minZ], pos: [S.maxX - 0.06, 0.3, (S.minZ + P.z0) / 2] },
      { size: [0.12, 0.12, S.maxZ - P.z1], pos: [S.maxX - 0.06, 0.3, (P.z1 + S.maxZ) / 2] },
    ];
    for (const b of baseboards) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), baseMat);
      m.position.set(...b.pos);
      this.scene.add(m);
    }

    // pilares de luz nos cantos
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.4, metalness: 0.4 });
    const pillarGlow = new THREE.MeshBasicMaterial({ color: 0xa78bfa, toneMapped: false });
    for (const [x, z] of [[S.minX + 1.5, S.minZ + 1.5], [S.maxX - 1.5, S.minZ + 1.5], [S.minX + 1.5, S.maxZ - 1.5], [S.maxX - 1.5, S.maxZ - 1.5]]) {
      const p = new THREE.Mesh(new RoundedBoxGeometry(3, height, 3, 3, 0.4), pillarMat);
      p.position.set(x, height / 2, z);
      p.castShadow = true;
      this.scene.add(p);
      const g = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.25, 3.05), pillarGlow);
      g.position.set(x, 1.2, z);
      this.scene.add(g);
      this.addBox({ min: [x - 1.5, 0, z - 1.5], max: [x + 1.5, height, z + 1.5], mesh: p, blocksCamera: true });
    }

    this.buildFachada();
  }

  // Por fora: contorno neon na porta, letreiro e frisos de LED. É o que se vê da pista.
  buildFachada() {
    const S = SALA;
    const P = S.porta;
    const xFora = S.maxX + 0.65;
    const neon = new THREE.MeshBasicMaterial({ color: 0x6ee7c8, toneMapped: false });
    const rosa = new THREE.MeshBasicMaterial({ color: 0xff5d73, toneMapped: false });
    const largura = P.z1 - P.z0;
    const zc = (P.z0 + P.z1) / 2;
    // moldura da porta, dos dois lados da parede (a de dentro faz parte da sala)
    for (const x of [xFora, S.maxX - 0.05]) {
      const pai = x === xFora ? this.fora : this.scene;
      for (const [sy, sz, py, pz] of [
        [0.3, largura + 0.6, P.altura + 0.15, zc],
        [P.altura, 0.3, P.altura / 2, P.z0 - 0.15],
        [P.altura, 0.3, P.altura / 2, P.z1 + 0.15],
      ]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, sy, sz), neon);
        m.position.set(x, py, pz);
        pai.add(m);
      }
    }
    // letreiro em cima da porta
    const tex = canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#0d1018';
      roundRect(ctx, 8, 8, w - 16, h - 16, 40);
      ctx.fill();
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 10;
      roundRect(ctx, 22, 22, w - 44, h - 44, 30);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 132px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff5d73';
      ctx.shadowBlur = 30;
      ctx.fillText('CINEMA', w / 2, h / 2 + 6);
    });
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(largura, largura / 4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    placa.position.set(xFora + 0.05, P.altura + 3 + largura / 8, zc);
    placa.rotation.y = Math.PI / 2;
    this.fora.add(placa);
    // frisos verticais de LED nas quinas de fora
    for (const [x, z] of [[S.maxX + 0.7, S.minZ], [S.maxX + 0.7, S.maxZ + 0.6], [S.minX - 0.7, S.maxZ + 0.6]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, S.height, 0.25), rosa);
      m.position.set(x, S.height / 2, z);
      this.fora.add(m);
    }
    // faixa de LED no alto da fachada leste e do fundo
    const faixa1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, S.maxZ - S.minZ), neon);
    faixa1.position.set(xFora, S.height - 3, (S.minZ + S.maxZ) / 2);
    const faixa2 = new THREE.Mesh(new THREE.BoxGeometry(S.maxX - S.minX, 0.5, 0.1), neon);
    faixa2.position.set((S.minX + S.maxX) / 2, S.height - 3, S.maxZ + 0.65);
    this.fora.add(faixa1, faixa2);

    // na saída: guarda o espaço para não nascer árvore na frente da porta
    this.reservas.push({ x: S.maxX + 18, z: zc, r: 26 });
  }

  buildAudience() {
    // tapete
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshStandardMaterial({ color: 0x1f2535, roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(22, 13, 1);
    rug.position.set(0, 0.01, -19);
    rug.receiveShadow = true;
    this.scene.add(rug);

    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x2c3448, roughness: 0.75 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x3d4864, roughness: 0.8 });
    const rows = [-25, -18, -11];
    rows.forEach((z, ri) => {
      for (const x of [-10, 0, 10]) this.addSofa(x, z, ri === 1 ? cushionMat : sofaMat, ri === 1 ? sofaMat : cushionMat);
    });

    // pufes lisinhos na frente
    const puffColors = [0x6ee7c8, 0xf472b6, 0x60a5fa, 0xfbbf24];
    puffColors.forEach((color, i) => {
      const x = -9 + i * 6;
      // a reta de baixo do circuito passa em z = -33: os pufes recuam para não
      // ficarem no meio da pista
      const z = -26;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 32, 24),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
      );
      puff.scale.set(1, 0.62, 1);
      puff.position.set(x, 0.62, z);
      puff.castShadow = true;
      puff.receiveShadow = true;
      this.scene.add(puff);
      this.addBox({ min: [x - 0.85, 0, z - 0.85], max: [x + 0.85, 1.05, z + 0.85], data: { type: 'puff' }, mesh: puff });
    });
  }

  addSofa(x, z, mat, cushion) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const parts = [
      { size: [7, 0.8, 2.2], pos: [0, 0.4, 0], mat },
      { size: [6.2, 0.25, 1.9], pos: [0, 0.88, -0.05], mat: cushion },
      { size: [7, 1.5, 0.6], pos: [0, 1.35, 0.85], mat },
      { size: [0.55, 0.7, 2.2], pos: [-3.25, 1.05, 0], mat },
      { size: [0.55, 0.7, 2.2], pos: [3.25, 1.05, 0], mat },
    ];
    for (const p of parts) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(...p.size, 3, 0.18), p.mat);
      m.position.set(...p.pos);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    this.scene.add(group);
    this.addBox({ min: [x - 3.5, 0, z - 1.1], max: [x + 3.5, 1.0, z + 1.1], data: { type: 'sofa' } });
    this.addBox({ min: [x - 3.5, 0, z + 0.55], max: [x + 3.5, 2.1, z + 1.15], data: { type: 'sofa' } });
    this.addBox({ min: [x - 3.5, 0, z - 1.1], max: [x - 2.97, 1.4, z + 1.1], data: { type: 'sofa' } });
    this.addBox({ min: [x + 2.97, 0, z - 1.1], max: [x + 3.5, 1.4, z + 1.1], data: { type: 'sofa' } });
  }

  buildScreens() {
    this.mainScreen = this.criarTelao({
      w: MAIN_LAYOUT.w, h: MAIN_LAYOUT.h,
      title: 'Telão', subtitle: 'Cole um link (YouTube, Twitch, Kick…) ou fixe a tela de alguém aqui',
      accent: '#ff5d73',
    });
    this.mainScreen.group.position.set(MAIN_LAYOUT.x, MAIN_LAYOUT.y, MAIN_LAYOUT.z);

    // A superfície CSS3D onde o player mora. É uma só: muda de telão conforme quem olha anda.
    this.tvElement = document.createElement('div');
    this.tvElement.className = 'tv-surface';
    this.tvElement.style.width = `${TV_PX.w}px`;
    this.tvElement.style.height = `${TV_PX.h}px`;
    const host = document.createElement('div');
    host.id = 'tv-host';
    this.tvElement.appendChild(host);
    this.tvCss = new CSS3DObject(this.tvElement);
    this.tvCss.visible = false;
    this.cssScene.add(this.tvCss);
    // o CSS3DRenderer só insere elementos visíveis; o player do telão precisa existir no DOM desde já
    this.css.domElement.firstChild.firstChild.appendChild(this.tvElement);
    this.tvElement.style.display = 'none';
    this.telaoTravado = null;
    this.slotMidia = null;
    this.setMidiaHost(this.mainScreen);

    this.slots = SLOT_LAYOUT.map((l, i) => {
      const s = new ScreenDisplay({
        w: l.w, h: l.h,
        title: `Tela ${i + 1}`, subtitle: 'Livre — clique em "Compartilhar tela"',
      });
      s.index = i;
      s.group.position.set(l.x, l.y, l.z);
      s.group.rotation.y = l.rotY;
      s.aoMudar = () => { if (s.isHost) this.tvCss.visible = s.mostraMidia; };
      this.scene.add(s.group);
      return s;
    });

    this.screens = [this.mainScreen, ...this.slots];
  }

  criarTelao(opts) {
    const t = new Telao(opts);
    t.aoMudar = () => { if (t.isHost) this.tvCss.visible = t.mostraMidia; };
    this.scene.add(t.group);
    this.telaoes = this.telaoes || [];
    this.telaoes.push(t);
    if (this.screens) this.screens.push(t);
    return t;
  }

  // Põe o player atrás desta tela — um telão, ou uma tela lateral quando o telão está com a
  // tela de alguém (só muda o transform do CSS3D: o iframe não recarrega).
  setMidiaHost(t) {
    if (this.tvHost === t) return;
    this.tvHost = t;
    for (const s of [...this.telaoes, ...(this.slots || [])]) {
      s.isHost = s === t;
      s.atualizarBuraco();
    }
    t.group.updateWorldMatrix(true, true);
    t.hole.getWorldPosition(this.tvCss.position);
    t.hole.getWorldQuaternion(this.tvCss.quaternion);
    this.tvCss.scale.setScalar(t.w / TV_PX.w);
    this.tvCss.visible = t.mostraMidia;
  }

  // Modo foco: a tela em foco fica com o player até sair do foco, perto ou longe.
  travarTelao(t) {
    this.telaoTravado = t;
    if (t) this.setMidiaHost(t);
    else if (this.slotMidia) this.setMidiaHost(this.slotMidia);
  }

  // Telão mostrando a tela de alguém e um vídeo carregado: o vídeo vai para a tela dessa
  // pessoa (os dois trocam de lugar) em vez de sumir. null devolve o vídeo ao telão.
  midiaNoSlot(slot) {
    if (this.slotMidia === slot) return;
    this.slotMidia = slot;
    if (this.telaoTravado) return;
    this.setMidiaHost(slot || this.telaoMaisPerto());
  }

  telaoMaisPerto() {
    const cam = this.camera.position;
    return this.telaoes.reduce((a, b) => (b.group.position.distanceTo(cam) < a.group.position.distanceTo(cam) ? b : a));
  }

  // O player vai para o telão mais perto da câmera. A folga de 15% evita ficar trocando
  // quando alguém para bem no meio do caminho entre os dois.
  atualizarTelao() {
    if (this.telaoTravado || this.slotMidia || !this.telaoes) return;
    if (!this.telaoes.includes(this.tvHost)) {
      this.setMidiaHost(this.telaoMaisPerto());
      return;
    }
    if (this.telaoes.length < 2) return;
    const cam = this.camera.position;
    const dist = (s) => s.group.position.distanceTo(cam);
    let perto = this.tvHost;
    for (const s of this.telaoes) if (dist(s) < dist(perto) * 0.85) perto = s;
    if (perto !== this.tvHost) this.setMidiaHost(perto);
  }


  // -------------------------------------------------------------- ringue de luta
  // Fica no chão, debaixo do parkour. O tablado é um colisor normal; as cordas são
  // só enfeite, de propósito: dá para ser arremessado para fora do ringue.
  buildRing() {
    const { x: cx, z: cz, size, matTop, matThickness } = RING;
    const half = size / 2;
    const C = RING.colors;
    const grupo = new THREE.Group();
    this.scene.add(grupo);

    // lona com as linhas pintadas
    const lonaTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#1e2435';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(244,63,94,0.75)';
      ctx.lineWidth = 10;
      ctx.strokeRect(36, 36, w - 72, h - 72);
      ctx.strokeStyle = 'rgba(244,63,94,0.3)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(251,191,36,0.9)';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PORRADARIA', w / 2, h / 2);
    });

    const lona = new THREE.Mesh(
      new THREE.BoxGeometry(size, matThickness, size),
      [
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ map: lonaTex, roughness: 0.72 }),
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
      ],
    );
    lona.position.set(cx, matTop - matThickness / 2, cz);
    lona.castShadow = true;
    lona.receiveShadow = true;
    grupo.add(lona);
    this.addBox({
      min: [cx - half, matTop - matThickness, cz - half],
      max: [cx + half, matTop, cz + half],
      data: { type: 'ring' },
      mesh: lona,
    });

    // postes nos quatro cantos
    const posteGeo = new THREE.CylinderGeometry(RING.postRadius, RING.postRadius, RING.postHeight, 12);
    const posteMat = new THREE.MeshStandardMaterial({ color: C.post, roughness: 0.35, emissive: C.post, emissiveIntensity: 0.25 });
    const cantos = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of cantos) {
      const poste = new THREE.Mesh(posteGeo, posteMat);
      poste.position.set(cx + sx * half, matTop + RING.postHeight / 2, cz + sz * half);
      poste.castShadow = true;
      grupo.add(poste);
      // sem isto a câmera de 3ª pessoa atravessa o poste e ele tapa a tela inteira
      this.cameraBlockers.push(poste);
    }

    // cordas (sem colisão de propósito)
    const cordaMat = new THREE.MeshStandardMaterial({ color: C.rope, roughness: 0.5, emissive: C.rope, emissiveIntensity: 0.3 });
    for (const altura of RING.ropes) {
      for (let i = 0; i < 4; i++) {
        const [ax, az] = cantos[i];
        const [bx, bz] = cantos[(i + 1) % 4];
        const x1 = cx + ax * half, z1 = cz + az * half;
        const x2 = cx + bx * half, z2 = cz + bz * half;
        const comprimento = Math.hypot(x2 - x1, z2 - z1);
        const corda = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, comprimento, 8), cordaMat);
        corda.rotation.z = Math.PI / 2;
        corda.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        corda.position.set((x1 + x2) / 2, matTop + altura, (z1 + z2) / 2);
        grupo.add(corda);
      }
    }

    // escadinha para subir no ringue
    for (let i = 0; i < 2; i++) {
      const degrauTop = matTop * ((i + 1) / 3);
      const w = 3.4;
      const d = 0.9;
      const z = cz - half - 0.45 - (1 - i) * d;
      const degrau = new THREE.Mesh(
        new RoundedBoxGeometry(w, degrauTop, d, 2, 0.08),
        new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 }),
      );
      degrau.position.set(cx, degrauTop / 2, z);
      degrau.castShadow = true;
      degrau.receiveShadow = true;
      grupo.add(degrau);
      this.addBox({ min: [cx - w / 2, 0, z - d / 2], max: [cx + w / 2, degrauTop, z + d / 2], data: { type: 'ring' }, mesh: degrau });
    }

    // luz quente em cima do ringue
    const luz = new THREE.SpotLight(0xffd9a0, 420, 26, Math.PI / 4.5, 0.5, 1.4);
    luz.position.set(cx, matTop + 11, cz);
    luz.target.position.set(cx, matTop, cz);
    this.scene.add(luz, luz.target);

    this.ringGroup = grupo;
  }

  // -------------------------------------------------------------- pista de corrida
  // Fita de asfalto seguindo a linha central do circuito. Sem colisores de
  // propósito: seriam ~150 caixas a mais, e a física percorre todas elas 120x
  // por segundo. Sair da pista já é punido pelo controle de setores da volta.
  buildTrack() {
    const grupo = new THREE.Group();
    this.fora.add(grupo);
    const meia = PISTA.largura / 2;

    const asfaltoTex = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#20242f';
      ctx.fillRect(0, 0, w, h);
      // granulado do asfalto, para não ficar um borrão chapado
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035).toFixed(3) + ')';
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(w / 2 - 1.5, 0, 3, h * 0.4); // tracejado central
    });
    asfaltoTex.wrapS = asfaltoTex.wrapT = THREE.RepeatWrapping;

    const zebraTex = canvasTexture(16, 32, (ctx, w, h) => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, 0, w, h / 2);
    });
    zebraTex.wrapS = zebraTex.wrapT = THREE.RepeatWrapping;

    // Monta uma fita entre dois deslocamentos laterais da linha central.
    const fita = (de, ate, altura, material, repetirV) => {
      const n = CAMINHO.length;
      const pos = [];
      const uv = [];
      const idx = [];
      let percorrido = 0;
      for (let i = 0; i <= n; i++) {
        const a = CAMINHO[i % n];
        const prev = CAMINHO[(i - 1 + n) % n];
        const prox = CAMINHO[(i + 1) % n];
        const dx = prox.x - prev.x;
        const dz = prox.y - prev.y;
        const comp = Math.hypot(dx, dz) || 1;
        const nx = -dz / comp; // normal lateral
        const nz = dx / comp;
        if (i > 0) percorrido += a.distanceTo(prev);
        const v = percorrido / repetirV;
        pos.push(PISTA.cx + a.x + nx * de, altura, PISTA.cz + a.y + nz * de);
        pos.push(PISTA.cx + a.x + nx * ate, altura, PISTA.cz + a.y + nz * ate);
        uv.push(0, v, 1, v);
        if (i < n) {
          const k = i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const malha = new THREE.Mesh(geo, material);
      malha.receiveShadow = true;
      grupo.add(malha);
      return malha;
    };

    asfaltoTex.repeat.set(1, 1);
    this.asfaltoMat = new THREE.MeshStandardMaterial({ map: asfaltoTex, roughness: 0.95, metalness: 0.0 });
    fita(-meia, meia, PISTA.y, this.asfaltoMat, 14);

    const zebraMat = new THREE.MeshStandardMaterial({
      map: zebraTex, roughness: 0.55, emissiveMap: zebraTex, emissive: 0xffffff, emissiveIntensity: 0.22,
    });
    const zebra = Math.max(0.8, PISTA.largura * 0.085); // acompanha a largura da pista
    fita(meia, meia + zebra, PISTA.y + 0.01, zebraMat, 5);
    fita(-meia - zebra, -meia, PISTA.y + 0.01, zebraMat, 5);
    // faixa branca contínua na borda do asfalto, por baixo da zebra
    const bordaMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
    fita(meia - 0.45, meia, PISTA.y + 0.005, bordaMat, 1);
    fita(-meia, -meia + 0.45, PISTA.y + 0.005, bordaMat, 1);

    // linha de largada/chegada — alinhada com a pista, não com o eixo X do mundo
    const xadrez = canvasTexture(128, 64, (ctx, w, h) => {
      const c = w / 16;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#0b0d12' : '#f8fafc';
          ctx.fillRect(x * c, y * c, c, c);
        }
      }
    });
    const larg = pontoEm(PISTA.largadaT);
    const linha = new THREE.Mesh(
      new THREE.PlaneGeometry(PISTA.largura, 3.2),
      new THREE.MeshStandardMaterial({ map: xadrez, roughness: 0.8 }),
    );
    linha.rotation.x = -Math.PI / 2;
    linha.rotation.z = larg.angulo; // gira no próprio plano antes de deitar: largura na transversal
    linha.position.set(larg.x, PISTA.y + 0.02, larg.z);
    grupo.add(linha);

    // pórtico: os postes vão para os LADOS da pista, usando a perpendicular
    const latL = larg.angulo;
    const lx = Math.cos(latL);
    const lz = -Math.sin(latL);
    const posteMatL = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
    for (const lado of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 9, 10), posteMatL);
      poste.position.set(larg.x + lx * (meia + 2.5) * lado, 4.5, larg.z + lz * (meia + 2.5) * lado);
      poste.castShadow = true;
      grupo.add(poste);
    }
    const travessa = new THREE.Mesh(
      new RoundedBoxGeometry(PISTA.largura + 7, 1.6, 0.6, 2, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, emissive: 0x1e293b, emissiveIntensity: 0.6 }),
    );
    travessa.position.set(larg.x, 8.6, larg.z);
    travessa.rotation.y = larg.angulo; // comprimento da viga na transversal da pista
    grupo.add(travessa);

    const placaL = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 76px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LARGADA', w / 2, h / 2 + 4);
    });
    const letreiro = new THREE.Mesh(
      new THREE.PlaneGeometry(PISTA.largura + 6, 1.5),
      new THREE.MeshBasicMaterial({ map: placaL, toneMapped: false }),
    );
    letreiro.position.set(larg.x - Math.sin(larg.angulo) * 0.4, 8.6, larg.z - Math.cos(larg.angulo) * 0.4);
    letreiro.rotation.y = larg.angulo + Math.PI; // virado para quem vem chegando
    grupo.add(letreiro);

    this.decorarPista(grupo, fita);
    this.trackGroup = grupo;
  }

  // Ambiente do autódromo (o traçado é o de sempre): área de escape, guard-rail, postes,
  // pneus, arquibancada com torcida, telão, placas e a estrada que vem do cinema.
  decorarPista(grupo, fita) {
    const meia = PISTA.largura / 2;
    const zebra = Math.max(0.8, PISTA.largura * 0.085);
    const borda = meia + zebra;
    const lateralDe = (p) => [Math.cos(p.angulo), -Math.sin(p.angulo)];

    // 1) área de escape de concreto dos dois lados (no lugar do tapete neon de quando era galpão)
    const escapeTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#5b5f69';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${(Math.random() * 0.08).toFixed(3)})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });
    escapeTex.wrapS = escapeTex.wrapT = THREE.RepeatWrapping;
    const escapeMat = new THREE.MeshStandardMaterial({ map: escapeTex, roughness: 0.95 });
    fita(borda, borda + 6, 0.06, escapeMat, 8);
    fita(-borda - 6, -borda, 0.06, escapeMat, 8);

    // 2) arquibancada e estrada do cinema primeiro: a estrada termina dentro da pista, e
    //    guard-rail, postes e placas precisam saber onde deixar o vão dela
    const arq = this.buildArquibancada(grupo, meia);
    this.buildEstrada(arq, meia);

    // 3) guard-rail
    this.guardRail(grupo, borda + 6.5);

    // 3) postes de luz: cabeça acesa (de graça) e algumas luzes de verdade
    const posteGeo = new THREE.CylinderGeometry(0.22, 0.3, 11, 10);
    const posteMat = new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.6 });
    const luminariaGeo = new RoundedBoxGeometry(2.6, 0.4, 1.1, 2, 0.12);
    const luminariaMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false });
    const POSTES = 28;
    for (let i = 0; i < POSTES; i++) {
      const p = pontoEm(i / POSTES);
      const [lx, lz] = lateralDe(p);
      const lado = i % 2 ? 1 : -1;
      const px = p.x + lx * (meia + 9) * lado;
      const pz = p.z + lz * (meia + 9) * lado;
      if (this.pertoDeVia(px, pz, 2)) continue; // não planta poste no meio da entrada
      const poste = new THREE.Mesh(posteGeo, posteMat);
      poste.position.set(px, 5.5, pz);
      poste.castShadow = true;
      grupo.add(poste);
      const lum = new THREE.Mesh(luminariaGeo, luminariaMat);
      lum.position.set(px, 11, pz);
      lum.lookAt(p.x, 10, p.z);
      grupo.add(lum);
      // só alguns pontos de luz reais: cada um custa caro no desenho
      if (i % 2 === 0) {
        const luz = new THREE.PointLight(0xe8eeff, 170, 58, 1.7);
        luz.position.set(px, 10.4, pz);
        this.scene.add(luz); // fora do grupo da pista de propósito: ver cullFora
      }
    }

    // 4) pilhas de pneu nas curvas (instanciadas: eram 210 malhas, agora são 2)
    const coresPilha = [0xf43f5e, 0xfbbf24, 0x60a5fa, 0x6ee7c8];
    const pneuGeo = new THREE.TorusGeometry(0.62, 0.26, 8, 16);
    const pneus = [];
    CURVAS.forEach((curva, ci) => {
      for (let k = -3; k <= 3; k++) {
        const p = pontoEm((curva.t + k * 0.0035 + 1) % 1);
        const [lx, lz] = lateralDe(p);
        for (let a = 0; a < 3; a++) pneus.push({ x: p.x + lx * (borda + 3.5), z: p.z + lz * (borda + 3.5), y: 0.3 + a * 0.5, topo: a === 2, cor: coresPilha[ci % coresPilha.length] });
      }
    });
    const pretos = new THREE.InstancedMesh(pneuGeo, new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.9 }), pneus.filter((p) => !p.topo).length);
    const topos = new THREE.InstancedMesh(pneuGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x333333 }), pneus.filter((p) => p.topo).length);
    const m4 = new THREE.Matrix4();
    const deitado = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    let ip = 0;
    let it = 0;
    for (const p of pneus) {
      m4.makeTranslation(p.x, p.y, p.z).multiply(deitado);
      if (p.topo) {
        topos.setMatrixAt(it, m4);
        topos.setColorAt(it++, new THREE.Color(p.cor));
      } else pretos.setMatrixAt(ip++, m4);
    }
    for (const malha of [pretos, topos]) {
      malha.castShadow = true;
      malha.computeBoundingSphere();
      grupo.add(malha);
    }

    // 5) placa com o nome de cada curva
    CURVAS.forEach((curva, ci) => {
      const cor = coresPilha[ci % coresPilha.length];
      const p = pontoEm(curva.t);
      const [lx, lz] = lateralDe(p);
      const px = p.x + lx * (meia + 13);
      const pz = p.z + lz * (meia + 13);
      const tex = canvasTexture(512, 128, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#' + cor.toString(16).padStart(6, '0');
        ctx.fillRect(0, h - 12, w, 12);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 54px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(curva.nome, w / 2, h / 2 - 4);
      });
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      placa.position.set(px, 3.6, pz);
      placa.lookAt(p.x, 3.2, p.z);
      grupo.add(placa);
      const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.6, 8), posteMat);
      pe.position.set(px, 1.8, pz);
      grupo.add(pe);
    });

    // 6) telão da pista e patrocínio
    this.buildTelaoPista(grupo, meia, arq);
    this.buildPatrocinio(grupo, borda + 9);

    // luz quente sobre a arquibancada e a largada
    const luzLargada = new THREE.PointLight(0xffe6c0, 280, 70, 1.6);
    luzLargada.position.set(arq.x, 13, arq.zFrente + 6);
    this.scene.add(luzLargada);
  }

  // Lâmina de guard-rail ao longo da pista, dos dois lados. Some onde encostaria em outro
  // trecho (nos grampos o deslocamento cruzaria o asfalto do lado) e perto do cinema.
  guardRail(grupo, afast) {
    const tex = canvasTexture(8, 64, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#c9ced6');
      g.addColorStop(0.28, '#7f8794');
      g.addColorStop(0.5, '#dfe3e9');
      g.addColorStop(0.72, '#7f8794');
      g.addColorStop(1, '#c2c8d0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, h * 0.45, w, h * 0.1);
    });
    tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.55, side: THREE.DoubleSide });
    const n = CAMINHO.length;
    for (const lado of [-1, 1]) {
      const pos = [];
      const uv = [];
      const idx = [];
      let k = 0;
      let anterior = null;
      let v = 0;
      for (let i = 0; i <= n; i++) {
        const a = CAMINHO[i % n];
        const prev = CAMINHO[(i - 1 + n) % n];
        const prox = CAMINHO[(i + 1) % n];
        const dx = prox.x - prev.x;
        const dz = prox.y - prev.y;
        const comp = Math.hypot(dx, dz) || 1;
        const x = PISTA.cx + a.x + (-dz / comp) * afast * lado;
        const z = PISTA.cz + a.y + (dx / comp) * afast * lado;
        const ok = projetar(x, z).dist > afast - 1.5 && !(x < SALA.maxX + 10 && z < SALA.maxZ + 10)
          && !this.pertoDeVia(x, z, 2.5); // vão da entrada da pista
        if (!ok) {
          anterior = null;
          continue;
        }
        if (anterior) {
          v += Math.hypot(x - anterior[0], z - anterior[1]);
          idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
        }
        pos.push(x, 0.32, z, x, 1.12, z);
        uv.push(v / 4, 0, v / 4, 1);
        anterior = [x, z];
        k += 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const malha = new THREE.Mesh(geo, mat);
      malha.castShadow = true;
      grupo.add(malha);
    }
  }

  // Arquibancada de frente para a reta, alinhada aos eixos de propósito: os degraus são
  // colisores de caixa (não giram) e dá para sentar neles (tecla C) para ver o telão.
  buildArquibancada(grupo, meia) {
    const p = pontoEm(0.02);
    const [lx, lz] = [Math.cos(p.angulo), -Math.sin(p.angulo)];
    const L = 64;
    const DEGRAUS = 8;
    const prof = 2.4;
    const alt = 0.9;
    // a reta corre quase no eixo X: a frente fica virada para +Z, de cara para a pista
    const x = Math.round(p.x + lx * (meia + 20));
    const zFrente = Math.round(p.z + lz * (meia + 20));
    const zFundo = zFrente - DEGRAUS * prof;

    const concreto = new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 0.85 });
    const coresAssento = [0x2563eb, 0x0ea5e9];
    for (let d = 0; d < DEGRAUS; d++) {
      const topo = alt * (d + 1);
      const z0 = zFrente - (d + 1) * prof;
      const degrau = new THREE.Mesh(new THREE.BoxGeometry(L, topo, prof), concreto);
      degrau.position.set(x, topo / 2, z0 + prof / 2);
      degrau.castShadow = true;
      degrau.receiveShadow = true;
      grupo.add(degrau);
      const assento = new THREE.Mesh(
        new THREE.BoxGeometry(L - 0.4, 0.45, 0.3),
        new THREE.MeshStandardMaterial({ color: coresAssento[d % 2], roughness: 0.6 }),
      );
      assento.position.set(x, topo + 0.22, z0 + 0.3);
      grupo.add(assento);
      this.addBox({ min: [x - L / 2, 0, z0], max: [x + L / 2, topo, z0 + prof], data: { type: 'sofa' }, mesh: degrau });
    }
    // calçada na frente
    const calcada = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, 7), new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: 0.9 }));
    calcada.rotation.x = -Math.PI / 2;
    calcada.position.set(x, 0.05, zFrente + 3.5);
    calcada.receiveShadow = true;
    grupo.add(calcada);

    // cobertura em balanço, com pilares no fundo
    const topoArq = alt * DEGRAUS;
    const coberturaY = topoArq + 5.5;
    const aco = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.45, metalness: 0.6 });
    for (let i = 0; i <= 4; i++) {
      const px = x - L / 2 + 2 + (i * (L - 4)) / 4;
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.7, coberturaY, 0.7), aco);
      pilar.position.set(px, coberturaY / 2, zFundo - 0.6);
      pilar.castShadow = true;
      grupo.add(pilar);
      this.cameraBlockers.push(pilar);
      this.addBox({ min: [px - 0.35, 0, zFundo - 0.95], max: [px + 0.35, coberturaY, zFundo - 0.25] });
    }
    const lona = new THREE.MeshStandardMaterial({ color: 0xe6ebf2, roughness: 0.75 });
    const cobertura = new THREE.Mesh(new THREE.BoxGeometry(L + 4, 0.5, DEGRAUS * prof + 6), lona);
    cobertura.position.set(x, coberturaY, zFundo + (DEGRAUS * prof) / 2 + 1.5);
    cobertura.rotation.x = -0.06;
    cobertura.castShadow = true;
    grupo.add(cobertura);
    // luminárias embaixo da cobertura: sem elas a parte de baixo é só sombra
    const luminaria = new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false });
    for (const dz of [0.25, 0.55, 0.85]) {
      const barra = new THREE.Mesh(new THREE.BoxGeometry(L - 6, 0.12, 0.35), luminaria);
      barra.position.set(x, coberturaY - 0.35 - dz * 0.6, zFundo + DEGRAUS * prof * dz + 1);
      grupo.add(barra);
    }
    // faixa com o nome, na borda da cobertura
    const nomeTex = canvasTexture(1024, 96, (ctx, w, h) => {
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#6ee7c8';
      ctx.fillRect(0, h - 8, w, 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 58px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ARQUIBANCADA  ·  SALA 3D', w / 2, h / 2 - 2);
    });
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(L + 4, 2), new THREE.MeshBasicMaterial({ map: nomeTex, toneMapped: false }));
    faixa.position.set(x, coberturaY - 0.6, zFrente + 4.6);
    grupo.add(faixa);

    // bandeiras em cima da cobertura
    const bandeiras = [];
    const panoGeo = new THREE.PlaneGeometry(2.6, 1.6, 8, 1).translate(1.3, 0, 0);
    [0xf43f5e, 0xfbbf24, 0x22c55e, 0x60a5fa, 0xa78bfa, 0xf97316].forEach((cor, i) => {
      const px = x - L / 2 + 6 + (i * (L - 12)) / 5;
      const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), aco);
      mastro.position.set(px, coberturaY + 2.2, zFrente + 2);
      grupo.add(mastro);
      const pano = new THREE.Mesh(panoGeo.clone(), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, side: THREE.DoubleSide }));
      pano.position.set(px, coberturaY + 3.4, zFrente + 2);
      grupo.add(pano);
      bandeiras.push({ pano, base: pano.geometry.attributes.position.array.slice(), fase: i });
    });
    this.decorAnimated.push((t) => {
      for (const b of bandeiras) {
        const arr = b.pano.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          const u = b.base[i] / 2.6; // 0 no mastro, 1 na ponta
          arr[i + 2] = b.base[i + 2] + Math.sin(t * 4 + b.base[i] * 1.8 + b.fase) * 0.35 * u;
        }
        b.pano.geometry.attributes.position.needsUpdate = true;
      }
    });

    // torcida: corpo e cabeça instanciados, fazendo "ola" de vez em quando
    const rnd = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const pessoas = [];
    for (let d = 0; d < DEGRAUS; d++) {
      for (let k = 0; k < Math.floor(L / 1.3); k++) {
        if (rnd() < 0.45) continue;
        pessoas.push({ x: x - L / 2 + 0.9 + k * 1.3 + (rnd() - 0.5) * 0.3, y: alt * (d + 1), z: zFrente - d * prof - 1.1, fase: rnd() * 6 });
      }
    }
    const corpoGeo = new THREE.CapsuleGeometry(0.3, 0.55, 3, 8).translate(0, 0.6, 0);
    const cabecaGeo = new THREE.SphereGeometry(0.22, 10, 8).translate(0, 1.32, 0);
    const corpos = new THREE.InstancedMesh(corpoGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), pessoas.length);
    const cabecas = new THREE.InstancedMesh(cabecaGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), pessoas.length);
    const camisas = [0xf43f5e, 0xfbbf24, 0x60a5fa, 0x6ee7c8, 0xa78bfa, 0xf8fafc, 0x22c55e, 0xf97316];
    const peles = [0xf1c6a7, 0xd9a07a, 0xa86f4c, 0x6e452d];
    pessoas.forEach((pp, i) => {
      corpos.setColorAt(i, new THREE.Color(camisas[Math.floor(rnd() * camisas.length)]));
      cabecas.setColorAt(i, new THREE.Color(peles[Math.floor(rnd() * peles.length)]));
    });
    const mp = new THREE.Matrix4();
    const atualizarTorcida = (t) => {
      for (let i = 0; i < pessoas.length; i++) {
        const pp = pessoas[i];
        // a "ola" corre de uma ponta à outra; fora dela, um balanço leve
        const onda = Math.max(0, Math.sin(t * 1.1 - (pp.x - x) * 0.09)) ** 12 * 0.75;
        const y = pp.y + onda + Math.abs(Math.sin(t * 2.2 + pp.fase)) * 0.06;
        mp.makeTranslation(pp.x, y, pp.z);
        corpos.setMatrixAt(i, mp);
        cabecas.setMatrixAt(i, mp);
      }
      corpos.instanceMatrix.needsUpdate = true;
      cabecas.instanceMatrix.needsUpdate = true;
    };
    atualizarTorcida(0);
    for (const malha of [corpos, cabecas]) {
      malha.castShadow = true;
      malha.computeBoundingSphere();
      malha.frustumCulled = false; // a "ola" levanta todo mundo: a esfera calculada parada ficaria pequena
      grupo.add(malha);
    }
    let quadro = 0;
    this.decorAnimated.push((t) => {
      // só mexe na torcida quando alguém pode estar vendo e a cada dois quadros
      if (++quadro % 2) return;
      if (this.camera.position.distanceTo(_tmp.set(x, 5, zFrente)) > 260) return;
      atualizarTorcida(t);
    });

    this.reservas.push({ x, z: zFrente - (DEGRAUS * prof) / 2, r: L / 2 + 10 });
    return { x, zFrente, zFundo, L };
  }

  // Telão da pista: mesmo tamanho de tela de cinema, de frente para a arquibancada, do
  // outro lado da reta. Mostra o mesmo que o telão do cinema (o player segue quem olha).
  buildTelaoPista(grupo, meia, arq) {
    const p = pontoEm(0.0125);
    const [lx, lz] = [Math.cos(p.angulo), -Math.sin(p.angulo)];
    const w = 36;
    const h = (w * 9) / 16;
    const base = 9;
    const tx = p.x - lx * (meia + 22);
    const tz = p.z - lz * (meia + 22);
    const alvoZ = (arq.zFrente + arq.zFundo) / 2;
    const rotY = Math.atan2(arq.x - tx, alvoZ - tz);

    this.pistaScreen = this.criarTelao({
      w, h, title: 'Telão da pista', subtitle: 'Cole um link no painel Telão: ele toca aqui e no cinema', accent: '#ff5d73',
    });
    this.pistaScreen.group.position.set(tx, base + h / 2, tz);
    this.pistaScreen.group.rotation.y = rotY;

    // estrutura: duas pernas de aço, travessa atrás e base de concreto
    const estrutura = new THREE.Group();
    estrutura.position.set(tx, 0, tz);
    estrutura.rotation.y = rotY;
    const aco = new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.45, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      const perna = new THREE.Mesh(new THREE.BoxGeometry(1.4, base + h * 0.6, 1.4), aco);
      perna.position.set(sx * (w / 2 - 5), (base + h * 0.6) / 2, -1.2);
      perna.castShadow = true;
      estrutura.add(perna);
    }
    const travessa = new THREE.Mesh(new THREE.BoxGeometry(w - 6, 1, 1), aco);
    travessa.position.set(0, base + 1.2, -1.2);
    estrutura.add(travessa);
    const sapata = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 }));
    sapata.position.set(0, 0.3, -1.2);
    sapata.receiveShadow = true;
    estrutura.add(sapata);
    // faixa de LED embaixo da tela
    const led = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.25, 0.3), new THREE.MeshBasicMaterial({ color: 0xff5d73, toneMapped: false }));
    led.position.set(0, base - 0.55, 0);
    estrutura.add(led);
    grupo.add(estrutura);

    this.reservas.push({ x: tx, z: tz, r: w / 2 + 6 });
  }

  // Placas de patrocínio atrás do guard-rail, só onde há espaço livre.
  buildPatrocinio(grupo, afast) {
    const marcas = [
      ['SALA 3D', '#6ee7c8', '#071a16'],
      ['PIPOCA TURBO', '#fbbf24', '#1c1203'],
      ['NEON COLA', '#f472b6', '#1d0614'],
      ['RÁDIO VOLTA', '#60a5fa', '#06111f'],
      ['PNEU BOM', '#f97316', '#1c0c03'],
      ['GOIÂNIA 2,3 KM', '#a78bfa', '#100a1f'],
    ];
    const texturas = marcas.map(([nome, cor, fundo]) => canvasTexture(512, 96, (ctx, w, h) => {
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 14, h);
      ctx.fillRect(w - 14, 0, 14, h);
      ctx.font = `800 54px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nome, w / 2, h / 2 + 2);
    }));
    const pe = new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.6 });
    const verso = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.8 });
    const faces = texturas.map((map) => {
      const frente = new THREE.MeshBasicMaterial({ map, toneMapped: false });
      // faces da BoxGeometry: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z (frente, virada para a pista), 5 -z
      return [verso, verso, verso, verso, frente, verso];
    });
    let n = 0;
    for (let t = 0.06; t < 0.97; t += 0.075) {
      const p = pontoEm(t);
      const [lx, lz] = [Math.cos(p.angulo), -Math.sin(p.angulo)];
      for (const lado of [1, -1]) {
        const x = p.x + lx * afast * lado;
        const z = p.z + lz * afast * lado;
        const livre = projetar(x, z).dist > afast - 2
          && !this.pertoDeVia(x, z, 8)
          && !this.reservas.some((r) => Math.hypot(x - r.x, z - r.z) < r.r)
          && !(x < SALA.maxX + 10 && z < SALA.maxZ + 10);
        if (!livre) continue;
        const placa = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 0.12), faces[n % faces.length]);
        placa.position.set(x, 2.6, z);
        placa.lookAt(p.x, 2.6, p.z);
        grupo.add(placa);
        for (const s of [-1, 1]) {
          const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), pe);
          poste.position.copy(placa.position).add(_tmp.set(lz * s * 6 * lado, -1.3, -lx * s * 6 * lado));
          grupo.add(poste);
        }
        n++;
        break; // uma placa por ponto da pista
      }
    }
  }

  // Estrada de pedra da porta do cinema até a pista: passa pela ponta da arquibancada e entra
  // no asfalto no sentido do tráfego, uns 28 m antes da linha de largada — quem chega por ela
  // cruza a linha logo em seguida e a volta já começa a contar.
  buildEstrada(arq, meia) {
    const S = SALA;
    const zPorta = (S.porta.z0 + S.porta.z1) / 2;
    const arqPonta = [arq.x - arq.L / 2 - 4, arq.zFrente + 3];
    const pj = pontoEm(PISTA.largadaT - 0.012);
    const entrada = [pj.x + Math.cos(pj.angulo) * (meia - 1), pj.z - Math.sin(pj.angulo) * (meia - 1)];
    const ctrl = [
      [S.maxX + 1, zPorta], [S.maxX + 26, zPorta + 4], [S.maxX + 52, zPorta + 14],
      [(S.maxX + 52 + arqPonta[0]) / 2, (zPorta + 14 + arqPonta[1]) / 2 + 4], arqPonta, entrada,
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curva = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const pts = curva.getSpacedPoints(90);
    const largura = 9;

    const pedraTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#7d7468';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const tom = 105 + Math.floor(Math.random() * 40);
          ctx.fillStyle = `rgb(${tom + 12},${tom + 4},${tom - 8})`;
          roundRect(ctx, x * 32 + (y % 2) * 16 + 2, y * 32 + 2, 28, 28, 6);
          ctx.fill();
        }
      }
    });
    pedraTex.wrapS = pedraTex.wrapT = THREE.RepeatWrapping;
    const pos = [];
    const uv = [];
    const idx = [];
    let v = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const c = Math.hypot(dx, dz) || 1;
      const nx = -dz / c;
      const nz = dx / c;
      if (i > 0) v += p.distanceTo(pts[i - 1]);
      // mesma ordem da fita da pista (lado - antes do +): os triângulos ficam virados para cima
      // 0,07: acima da área de escape (0,06), então a pedra vai até a zebra
      pos.push(p.x - nx * largura / 2, 0.07, p.z - nz * largura / 2, p.x + nx * largura / 2, 0.07, p.z + nz * largura / 2);
      uv.push(0, v / 4, largura / 4, v / 4);
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      // lampiões dos dois lados, alternados
      if (i % 6 === 3) {
        const lado = (i / 6) % 2 < 1 ? 1 : -1;
        const lx = p.x + nx * (largura / 2 + 1) * lado;
        const lz = p.z + nz * (largura / 2 + 1) * lado;
        if (projetar(lx, lz).dist < meia + 9) return; // perto do asfalto: sem lampião
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x2b2f3a }));
        haste.position.set(lx, 1.3, lz);
        const globo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }));
        globo.position.set(lx, 2.75, lz);
        this.fora.add(haste, globo);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const estrada = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: pedraTex, roughness: 0.95 }));
    estrada.receiveShadow = true;
    this.fora.add(estrada);
    const pontos = pts.map((p) => [p.x, p.z]);
    this.estradas.push({ pontos, largura });

    // placa logo na saída do cinema
    const zP = (S.porta.z0 + S.porta.z1) / 2;
    this.placaDirecao(S.maxX + 9, zP - 8, -Math.PI / 2, 'AUTÓDROMO  ↗', '#6ee7c8');
    return pontos;
  }

  // Alguma estrada/entrada passa a menos de (largura/2 + folga) deste ponto?
  pertoDeVia(x, z, folga) {
    for (const { pontos, largura } of this.estradas) {
      for (let i = 0; i < pontos.length - 1; i++) {
        const [ax, az] = pontos[i];
        const [bx, bz] = pontos[i + 1];
        const abx = bx - ax;
        const abz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
        if (Math.hypot(x - (ax + abx * u), z - (az + abz * u)) < largura / 2 + folga) return true;
      }
    }
    return false;
  }

  // Placa de direção num poste, com o texto dos dois lados.
  placaDirecao(x, z, rotY, texto, cor) {
    const tex = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cor;
      ctx.fillRect(0, h - 12, w, 12);
      ctx.fillStyle = '#f8fafc';
      ctx.font = `800 58px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, w / 2, h / 2 - 4);
    });
    const verso = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.8 });
    const frente = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const placa = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 0.12), [verso, verso, verso, verso, frente, frente]);
    placa.position.set(x, 3, z);
    placa.rotation.y = rotY;
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2b3245 }));
    poste.position.set(x, 1.5, z);
    this.fora.add(placa, poste);
  }

  buildCourse() {
    const matCache = new Map();
    const material = (color, emissive = 0.14) => {
      const key = `${color}-${emissive}`;
      if (!matCache.has(key)) {
        matCache.set(key, new THREE.MeshStandardMaterial({
          color, roughness: 0.38, metalness: 0.06, emissive: color, emissiveIntensity: emissive,
        }));
      }
      return matCache.get(key);
    };

    const build = (def) => {
      const [w, d] = def.size;
      const h = def.h ?? 0.6;
      const [x, top, z] = def.pos;
      const type = def.type ?? 'platform';
      const emissive = type === 'pad' || type === 'finish' || type === 'teleport' ? 0.5 : type === 'balcony' ? 0.02 : 0.14;
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(w, h, d, 3, Math.min(0.14, h / 3, w / 4, d / 4)),
        material(def.color, emissive),
      );
      mesh.position.set(x, top - h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const data = { ...def, type };
      const collider = this.addBox({
        min: [x - w / 2, top - h, z - d / 2],
        max: [x + w / 2, top, z + d / 2],
        data,
        mesh,
        blocksCamera: type === 'balcony',
      });
      collider.half = new THREE.Vector3(w / 2, h / 2, d / 2);

      if (def.move) {
        collider.base = mesh.position.clone();
        collider.fase = Math.random(); // sorteada uma vez por aba: a sua é só sua
        this.movers.push(collider);
        // faixas de aviso nas bordas das plataformas móveis
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.04, 0.08, d + 0.04),
          new THREE.MeshBasicMaterial({ color: 0x111111 }),
        );
        edge.position.y = h / 2 - 0.12;
        mesh.add(edge);
      }

      if (type === 'pad') this.decoratePad(mesh, w, d, h);
      if (type === 'checkpoint' || type === 'start' || type === 'finish' || type === 'teleport') {
        this.decorateMarker(mesh, data, h);
      }
      return collider;
    };

    COURSE.forEach(build);
    FUN_PADS.forEach(build);
    for (const r of RAILS) {
      const [w, d] = r.size;
      const [x, top, z] = r.pos;
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(w, r.h, d, 2, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.35, roughness: 0.1 }),
      );
      mesh.position.set(x, top - r.h / 2, z);
      this.scene.add(mesh);
      this.addBox({ min: [x - w / 2, top - r.h, z - d / 2], max: [x + w / 2, top, z + d / 2], data: { type: 'rail' } });
    }

    // sofá VIP no camarote
    const vipMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.7 });
    const vip = new THREE.Mesh(new RoundedBoxGeometry(8, 0.8, 2, 3, 0.2), vipMat);
    vip.position.set(5.5, 23.4, 38.4);
    vip.castShadow = true;
    const vipBack = new THREE.Mesh(new RoundedBoxGeometry(8, 1.4, 0.5, 3, 0.2), vipMat);
    vipBack.position.set(5.5, 24.2, 39.4);
    this.scene.add(vip, vipBack);
    this.addBox({ min: [1.5, 23, 37.4], max: [9.5, 23.8, 39.4], data: { type: 'sofa' } });
    this.addBox({ min: [1.5, 23, 39.15], max: [9.5, 24.9, 39.65], data: { type: 'sofa' } });
  }

  decoratePad(mesh, w, d, h) {
    const tex = canvasTexture(256, 256, (ctx, cw, ch) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const y of [150, 95]) {
        ctx.beginPath();
        ctx.moveTo(70, y + 40);
        ctx.lineTo(128, y - 15);
        ctx.lineTo(186, y + 40);
        ctx.stroke();
      }
    });
    const arrow = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w, d) * 0.8, Math.min(w, d) * 0.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.y = h / 2 + 0.02;
    mesh.add(arrow);
    this.decorAnimated.push((t) => { arrow.material.opacity = 0.55 + 0.45 * Math.sin(t * 5); });
  }

  decorateMarker(mesh, def, h) {
    const color = new THREE.Color(def.type === 'checkpoint' ? 0x34d399 : def.color);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(def.size[0], def.size[1]) * 0.36, 0.07, 12, 64),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = h / 2 + 0.06;
    mesh.add(ring);
    this.decorAnimated.push((t) => {
      const s = 1 + 0.06 * Math.sin(t * 3 + mesh.position.x);
      ring.scale.set(s, s, 1);
    });

    if (def.label) {
      const label = textSprite(def.label, { size: 0.9, accent: `#${color.getHexString()}` });
      label.position.y = h / 2 + (def.type === 'finish' ? 5.4 : 3.2);
      mesh.add(label);
      this.fadeLabels.push(label);
      if (def.type === 'checkpoint') this.checkpointLabels.set(def.id, { label, text: def.label });
    }

    if (def.type === 'finish') {
      const trophy = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: 0xfde047, metalness: 0.7, roughness: 0.25, emissive: 0x6b4d00, emissiveIntensity: 0.4 });
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold);
      cup.rotation.x = Math.PI;
      cup.position.y = 1.3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 16), gold);
      stem.position.y = 0.55;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 24), gold);
      base.position.y = 0.15;
      trophy.add(cup, stem, base);
      trophy.position.set(0, h / 2 + 2.6, 0);
      mesh.add(trophy);
      this.decorAnimated.push((t) => {
        trophy.rotation.y = t * 1.2;
        trophy.position.y = h / 2 + 3.6 + Math.sin(t * 2) * 0.15;
      });
    }
  }

  markCheckpoint(id) {
    const cp = this.checkpointLabels.get(id);
    cp?.label.userData.setText(`${cp.text} ✓`, '#a7f3d0', '#34d399');
  }

  resetCheckpoints() {
    for (const cp of this.checkpointLabels.values()) cp.label.userData.setText(cp.text, '#ffffff', '#34d399');
  }

  // -------------------------------------------------------------- loop
  update(time) {
    // tempo absoluto: todo mundo vê as plataformas móveis na mesma posição
    const t = Date.now() / 1000;
    for (const c of this.movers) {
      const m = c.data.move;
      // Cada jogador tem a sua fase: as plataformas móveis ficam em lugares
      // diferentes para cada um, então ninguém espera a vez do outro no parkour.
      const offset = Math.sin((t / m.period + c.fase) * Math.PI * 2) * m.amp;
      const prev = c.mesh.position.clone();
      c.mesh.position.copy(c.base);
      c.mesh.position[m.axis] += offset;
      c.delta.subVectors(c.mesh.position, prev);
      c.min.copy(c.mesh.position).sub(c.half);
      c.max.copy(c.mesh.position).add(c.half);
    }
    for (const fn of this.decorAnimated) fn(time);
    this.natureza?.update(time);
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  // Dentro da sala do cinema, só a porta deixa ver o lado de fora.
  cullFora() {
    const cam = this.camera;
    const p = cam.position;
    const dentro = p.x > SALA.minX && p.x < SALA.maxX && p.z > SALA.minZ && p.z < SALA.maxZ;
    let ver = !dentro;
    if (dentro) {
      cam.updateMatrixWorld();
      _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_m4);
      ver = _frustum.intersectsBox(this.portaBox);
    }
    this.fora.visible = ver;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css.setSize(w, h);
  }

  render() {
    this.natureza?.seguirCamera(this.camera, performance.now() / 1000);
    this.atualizarTelao();
    this.cullFora();
    for (const label of this.fadeLabels) {
      label.getWorldPosition(_tmp);
      const d = _tmp.distanceTo(this.camera.position);
      label.material.opacity = THREE.MathUtils.clamp((d - 5) / 5, 0, 1);
      label.visible = label.material.opacity > 0.01;
    }
    this.renderer.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
  }
}
