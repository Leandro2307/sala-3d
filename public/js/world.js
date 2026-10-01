// Cena 3D: sala de cinema com parede de telas, sofás, parkour e camarote.
import * as THREE from 'three';
import { isTouch } from './touch.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COURSE, RAILS, FUN_PADS } from './parkour.js';
import { RING } from './arena.js';

export const ROOM = { minX: -36, maxX: 36, minZ: -40, maxZ: 40, height: 34 };
export const SPAWN = { pos: [0, 0, -2], yaw: 0 };

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const _tmp = new THREE.Vector3();
const YT_PX = { w: 1280, h: 720 };

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

class MainScreen extends ScreenDisplay {
  constructor(opts) {
    super({ ...opts, icon: 'play' });
    // "buraco" transparente no WebGL por onde aparece o iframe do YouTube (CSS3D por trás do canvas)
    this.hole = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w, this.h),
      new THREE.MeshBasicMaterial({
        color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide,
        toneMapped: false, fog: false,
      }),
    );
    this.hole.position.z = 0.015;
    this.hole.visible = false;
    this.hole.userData.screen = this;
    this.group.add(this.hole);

    this.cssElement = document.createElement('div');
    this.cssElement.className = 'yt-surface';
    this.cssElement.style.width = `${YT_PX.w}px`;
    this.cssElement.style.height = `${YT_PX.h}px`;
    const inner = document.createElement('div');
    inner.id = 'yt-player';
    this.cssElement.appendChild(inner);
    this.cssObject = new CSS3DObject(this.cssElement);
    this.cssObject.visible = false;
    this.mode = 'empty';
  }

  syncCss() {
    this.group.updateWorldMatrix(true, false);
    this.hole.getWorldPosition(this.cssObject.position);
    this.hole.getWorldQuaternion(this.cssObject.quaternion);
    this.cssObject.scale.setScalar(this.w / YT_PX.w);
  }

  // 'empty' (sem vídeo) | 'youtube' | 'share'
  setMode(mode, video = null) {
    this.mode = mode;
    this.hole.visible = mode === 'youtube';
    this.cssObject.visible = mode === 'youtube';
    if (mode === 'share' && video) this.setVideo(video);
    else this.clearVideo();
    if (mode === 'youtube') {
      this.placeholder.visible = false;
      this.glow.material.opacity = 0.32;
    }
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

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 12, 30);

    this.colliders = [];
    this.movers = [];
    this.cameraBlockers = []; // malhas que a câmera em 3ª pessoa não atravessa
    this.decorAnimated = [];
    this.checkpointLabels = new Map();
    this.fadeLabels = []; // placas do parkour somem quando a câmera chega perto

    this.buildLights();
    this.buildRoom();
    this.buildAudience();
    this.buildScreens();
    this.buildCourse();
    this.buildRing();

    window.addEventListener('resize', () => this.resize());
  }

  // -------------------------------------------------------------- construção
  buildLights() {
    const hemi = new THREE.HemisphereLight(0xc9d3ff, 0x1d1a2a, 1.1);
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
    this.scene.add(sun, sun.target);

    // brilho azulado que "vem" da parede de telas
    const screenGlow = new THREE.PointLight(0x7f9cff, 260, 70, 1.2);
    screenGlow.position.set(0, 12, ROOM.minZ + 8);
    this.scene.add(screenGlow);

    const backGlow = new THREE.PointLight(0xd08bff, 180, 60, 1.2);
    backGlow.position.set(0, 18, 26);
    this.scene.add(backGlow);
  }

  addBox({ min, max, data = {}, mesh = null, blocksCamera = false }) {
    const c = new Collider(new THREE.Vector3(...min), new THREE.Vector3(...max), data, mesh);
    this.colliders.push(c);
    if (mesh && blocksCamera) this.cameraBlockers.push(mesh);
    return c;
  }

  buildRoom() {
    const { minX, maxX, minZ, maxZ, height } = ROOM;
    const W = maxX - minX;
    const D = maxZ - minZ;

    // chão com grade sutil
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
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.addBox({ min: [minX - 5, -4, minZ - 5], max: [maxX + 5, 0, maxZ + 5], data: { type: 'floor' } });

    // área do parkour com piso neon (pisar nele durante a corrida = volta ao checkpoint)
    const zoneTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#1a1230';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(167,139,250,0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, w, h);
    });
    zoneTex.wrapS = zoneTex.wrapT = THREE.RepeatWrapping;
    zoneTex.repeat.set(W / 4, 38 / 4);
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(W, 38),
      new THREE.MeshStandardMaterial({ map: zoneTex, roughness: 0.6, emissive: 0x2a1650, emissiveIntensity: 0.35 }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(0, 0.005, maxZ - 19);
    zone.receiveShadow = true;
    this.scene.add(zone);

    // faixa separando plateia e parkour
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(W, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55, toneMapped: false }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.01, maxZ - 38);
    this.scene.add(stripe);

    // paredes
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x151821, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({ color: 0x0d0f15, roughness: 0.95 });
    const walls = [
      { w: W, pos: [0, height / 2, minZ], rot: 0, mat: frontMat },
      { w: W, pos: [0, height / 2, maxZ], rot: Math.PI, mat: wallMat },
      { w: D, pos: [minX, height / 2, 0], rot: Math.PI / 2, mat: wallMat },
      { w: D, pos: [maxX, height / 2, 0], rot: -Math.PI / 2, mat: wallMat },
    ];
    for (const wdef of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wdef.w, height), wdef.mat);
      m.position.set(...wdef.pos);
      m.rotation.y = wdef.rot;
      m.receiveShadow = true;
      this.scene.add(m);
      this.cameraBlockers.push(m);
    }
    const t = 4;
    this.addBox({ min: [minX - t, -4, minZ - t], max: [maxX + t, height + 4, minZ] });
    this.addBox({ min: [minX - t, -4, maxZ], max: [maxX + t, height + 4, maxZ + t] });
    this.addBox({ min: [minX - t, -4, minZ - t], max: [minX, height + 4, maxZ + t] });
    this.addBox({ min: [maxX, -4, minZ - t], max: [maxX + t, height + 4, maxZ + t] });

    // teto
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x0e1016, roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.scene.add(ceiling);
    this.addBox({ min: [minX, height, minZ], max: [maxX, height + 4, maxZ] });

    // faixas de luz no teto e rodapé neon
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xdfe7ff, toneMapped: false });
    for (const x of [-18, 0, 18]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, D - 12), stripMat);
      s.position.set(x, height - 0.1, 0);
      this.scene.add(s);
    }
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x6ee7c8, toneMapped: false });
    const baseboards = [
      { size: [W, 0.12, 0.12], pos: [0, 0.3, maxZ - 0.06] },
      { size: [0.12, 0.12, D], pos: [minX + 0.06, 0.3, 0] },
      { size: [0.12, 0.12, D], pos: [maxX - 0.06, 0.3, 0] },
    ];
    for (const b of baseboards) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), baseMat);
      m.position.set(...b.pos);
      this.scene.add(m);
    }

    // pilares de luz nos cantos
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.4, metalness: 0.4 });
    const pillarGlow = new THREE.MeshBasicMaterial({ color: 0xa78bfa, toneMapped: false });
    for (const [x, z] of [[minX + 1.5, minZ + 1.5], [maxX - 1.5, minZ + 1.5], [minX + 1.5, maxZ - 1.5], [maxX - 1.5, maxZ - 1.5]]) {
      const p = new THREE.Mesh(new RoundedBoxGeometry(3, height, 3, 3, 0.4), pillarMat);
      p.position.set(x, height / 2, z);
      p.castShadow = true;
      this.scene.add(p);
      const g = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.25, 3.05), pillarGlow);
      g.position.set(x, 1.2, z);
      this.scene.add(g);
      this.addBox({ min: [x - 1.5, 0, z - 1.5], max: [x + 1.5, height, z + 1.5], mesh: p, blocksCamera: true });
    }
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
      const z = -31;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 32, 24),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
      );
      puff.scale.set(1, 0.62, 1);
      puff.position.set(x, 0.62, z);
      puff.castShadow = true;
      puff.receiveShadow = true;
      this.scene.add(puff);
      this.addBox({ min: [x - 0.85, 0, z - 0.85], max: [x + 0.85, 1.05, z + 0.85], mesh: puff });
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
    this.mainScreen = new MainScreen({
      w: MAIN_LAYOUT.w, h: MAIN_LAYOUT.h,
      title: 'Telão', subtitle: 'Cole um link do YouTube ou fixe a tela de alguém aqui',
      accent: '#ff5d73',
    });
    this.mainScreen.group.position.set(MAIN_LAYOUT.x, MAIN_LAYOUT.y, MAIN_LAYOUT.z);
    this.scene.add(this.mainScreen.group);
    this.mainScreen.syncCss();
    this.cssScene.add(this.mainScreen.cssObject);
    // o CSS3DRenderer só insere elementos visíveis; o player do YouTube precisa existir no DOM desde já
    this.css.domElement.firstChild.firstChild.appendChild(this.mainScreen.cssElement);
    this.mainScreen.cssElement.style.display = 'none';

    this.slots = SLOT_LAYOUT.map((l, i) => {
      const s = new ScreenDisplay({
        w: l.w, h: l.h,
        title: `Tela ${i + 1}`, subtitle: 'Livre — clique em "Compartilhar tela"',
      });
      s.index = i;
      s.group.position.set(l.x, l.y, l.z);
      s.group.rotation.y = l.rotY;
      this.scene.add(s.group);
      return s;
    });

    this.screens = [this.mainScreen, ...this.slots];
    this.screenMeshes = [];
    for (const s of this.screens) {
      this.screenMeshes.push(s.surface, s.placeholder, s.videoMesh);
      if (s.hole) this.screenMeshes.push(s.hole);
    }
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
      const offset = Math.sin((t / m.period) * Math.PI * 2) * m.amp;
      const prev = c.mesh.position.clone();
      c.mesh.position.copy(c.base);
      c.mesh.position[m.axis] += offset;
      c.delta.subVectors(c.mesh.position, prev);
      c.min.copy(c.mesh.position).sub(c.half);
      c.max.copy(c.mesh.position).add(c.half);
    }
    for (const fn of this.decorAnimated) fn(time);
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
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
