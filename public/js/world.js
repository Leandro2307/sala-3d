// Cena 3D: sala de cinema com parede de telas, sofás, parkour e camarote; lá fora, o
// autódromo ao ar livre, com serra, floresta e lago em volta.
import * as THREE from 'three';
import { isTouch } from './touch.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeGroups } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURSE, RAILS, FUN_PADS } from './parkour.js';
import { RING } from './arena.js';
import { PISTA, CAMINHO, CURVAS, pontoEm, projetar } from './pista.js';
import { criarNatureza } from './natureza.js';
import { construirEstadio } from './futebol.js';
import { construirVolei, construirBasquete, construirBoliche } from './quadras.js';
import { construirPortal, construirSurf, construirArena } from './ceu.js';
import { RESERVAS_JOGOS } from './tabuleiros.js';
import { construirEscritorio } from './escritorio3d.js';
import { planta, salaEm, rotuloDaTela, postoDaTela, chaveDaTela, DEPARTAMENTOS, PREDIO, zDaPorta } from './escritorio.js';
import * as moduloQualidade from './qualidade.js';

// Área jogável inteira (cercada): a sala do cinema num canto, em volta da origem, e o
// autódromo ao ar livre a leste. O telão do cinema continua em minZ, perto da plateia.
export const ROOM = { minX: -52, maxX: 480, minZ: -40, maxZ: 530, height: 60 };
// A sala do cinema: fechada e igual por dentro ao que sempre foi. A porta fica na parede
// leste, virada para o autódromo.
export const SALA = { minX: ROOM.minX, maxX: 60, minZ: ROOM.minZ, maxZ: 60, height: ROOM.height, porta: { z0: 14, z1: 46, altura: 18 } };
export const SPAWN = { pos: [0, 0, -2], yaw: 0 };

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _tmp3 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const CANTOS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const _raio = new THREE.Raycaster();
const _m4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _esfera = new THREE.Sphere();
const _dirSol = new THREE.Vector3();
const _escala = new THREE.Vector3();
const _eixoY = new THREE.Vector3(0, 1, 0);
const _mSombra = new THREE.Matrix4();
// monta a matriz de cada peça antes de fundir (ver fundir): nunca a matrixWorld, que dentro de
// area() ainda não foi calculada
const _aux = new THREE.Object3D();
// alturaAparente sem alocar: os 4 cantos, os 2 pontos de corte e a lista do que fica na frente
const _cantos = CANTOS.map(() => new THREE.Vector3());
const _cortes = [new THREE.Vector3(), new THREE.Vector3()];
const _naFrente = [];
// o centro e quatro pontos perto dos cantos de uma tela (tapada)
const PONTOS_TELA = [[0, 0], ...CANTOS];
const porDistancia = (a, b) => a.d - b.d;
// (x, z) do ponto dentro do retângulo, com folga (negativa: retângulo encolhido)
const dentroDe = (p, x0, x1, z0, z1, folga) => p.x >= x0 - folga && p.x <= x1 + folga && p.z >= z0 - folga && p.z <= z1 + folga;
// Cartazes e etiquetas das telas em canvas no tamanho do aparelho (qualidade.js): menos pixels no
// celular e no PC de pouca memória. Sem a constante lá (versão antiga), tamanho cheio.
const ESCALA_TEXTURA = moduloQualidade.ESCALA_TEXTURA ?? 1;
// devolve a vez ao navegador (para ele pintar, responder a cliques) e continua logo depois. O
// setTimeout(0) seria freado para 1 s com a aba em segundo plano; isto não.
const ceder = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield()
  : new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }));
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
// esc: fração do tamanho de verdade do canvas (ESCALA_TEXTURA). O desenho continua nas medidas
// lógicas w×h: a escala vai na transformação do contexto.
function canvasTexture(w, h, draw, esc = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * esc));
  canvas.height = Math.max(1, Math.round(h * esc));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.redraw = (...args) => {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  tex.userData.redraw();
  return tex;
}

// ------------------------------------------------------------------ utilitários de geometria
// Junta peças paradas que dividem o material numa malha só: um desenho (e um na sombra) no lugar
// de um por peça. As geometrias chegam já posicionadas no mundo e saem da memória depois.
function fundir(geos, material, { sombra = false, recebe = false } = {}) {
  const malha = new THREE.Mesh(mergeGeometries(geos), material);
  for (const g of geos) g.dispose();
  malha.castShadow = sombra;
  malha.receiveShadow = recebe;
  return malha;
}

// Caixa sem as faces da lista (as que levam outro material) e sem grupos: dá para fundir com outras
// caixas do mesmo material. Faces da BoxGeometry: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z.
function caixaSem(w, h, d, sem) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const indice = geo.index.array;
  const fica = [];
  for (const g of geo.groups) {
    if (sem.includes(g.materialIndex)) continue;
    for (let i = g.start; i < g.start + g.count; i++) fica.push(indice[i]);
  }
  geo.setIndex(fica);
  geo.clearGroups();
  return geo;
}

// ------------------------------------------------------------------ luz simples (nível Leve)
// Na Leve, a luz direta (sol e pontuais) dos materiais padrão vira Lambert: some o especular GGX, a
// conta mais cara do pixel numa placa integrada. A energia do especular entra no difuso, para metal
// não ficar preto. O MeshPhysical (o Atos) fica de fora. O remendo só entra se o trecho do three for
// o que conhecemos; numa versão que mudou a assinatura, desliga sozinho.
let luzSimplesLigada = false; // World.setQualidade
const PARS_FISICO = THREE.ShaderChunk.lights_physical_pars_fragment;
const LUZ_SIMPLES_OK = /void RE_Direct_Physical\(\s*const in IncidentLight directLight,\s*const in vec3 geometryPosition,\s*const in vec3 geometryNormal,\s*const in vec3 geometryViewDir,\s*const in vec3 geometryClearcoatNormal,\s*const in PhysicalMaterial material,\s*inout ReflectedLight reflectedLight\s*\)/.test(PARS_FISICO)
  && PARS_FISICO.includes('vec3 diffuseContribution;') && PARS_FISICO.includes('vec3 specularColorBlended;');
if (!LUZ_SIMPLES_OK) console.warn('Sala 3D: luz simples desligada, o shader de luz do three mudou');
// Só RE_Direct é trocado: os nomes NUM_POINT_LIGHTS e cia. o three substitui por números no texto do
// shader, e redefini-los quebraria a conta de luzes.
const RE_DIRECT_SIMPLES = `
#undef RE_Direct
#define RE_Direct RE_Direct_Simples
void RE_Direct_Simples( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution + material.specularColorBlended );
}`;
const comLuzSimples = (m) => luzSimplesLigada && LUZ_SIMPLES_OK && !m.isMeshPhysicalMaterial;
THREE.MeshStandardMaterial.prototype.onBeforeCompile = function (shader) {
  if (!comLuzSimples(this)) return;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>${RE_DIRECT_SIMPLES}`);
};
// a chave do programa continua a padrão; com a luz simples ligada, ganha um prefixo (outro programa)
THREE.MeshStandardMaterial.prototype.customProgramCacheKey = function () {
  return (comLuzSimples(this) ? 'luz-simples,' : '') + this.onBeforeCompile.toString();
};

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
// Textura de tela compartilhada que só manda quadro novo para a placa de vídeo quando vale a pena.
// Cada envio é uma cópia da imagem inteira (8 MB em 1080p): a tela lá longe, pequena na imagem,
// não precisa disso 60 vezes por segundo. O World decide o intervalo pela distância e pela
// qualidade (atualizar()). Sem requestVideoFrameCallback, sobe no ritmo do intervalo.
// Continua sendo VideoTexture: o three aloca vídeo de um jeito que aceita mudar de tamanho (o
// WebRTC troca a resolução no meio do caminho conforme a rede).
class TexturaDeTela extends THREE.VideoTexture {
  constructor(video) {
    super(video);
    // o VideoTexture já pediu para marcar todo quadro novo para subir: quem decide agora é atualizar()
    if (this._requestVideoFrameCallbackId) video.cancelVideoFrameCallback(this._requestVideoFrameCallbackId);
    this._requestVideoFrameCallbackId = 0;
    this.colorSpace = THREE.SRGBColorSpace;
    this.novo = true;
    this.ultimo = 0;
    this.temRvfc = 'requestVideoFrameCallback' in video;
    const pedir = () => {
      this.rvfc = video.requestVideoFrameCallback(() => {
        this.novo = true;
        pedir();
      });
    };
    if (this.temRvfc) pedir();
  }

  update() {} // o renderizador chama todo quadro; aqui não faz nada

  atualizar(agora, intervalo) {
    if ((this.temRvfc && !this.novo) || agora - this.ultimo < intervalo) return;
    if (this.image.readyState < this.image.HAVE_CURRENT_DATA) return;
    this.novo = false;
    this.ultimo = agora;
    this.needsUpdate = true;
  }

  dispose() {
    if (this.rvfc) this.image.cancelVideoFrameCallback(this.rvfc);
    super.dispose();
  }
}

// Cartaz de monitor de posto desligado: um só por cor, para todos (são dezenas de monitores).
const _apagados = new Map();
function monitorApagado(accent) {
  if (!_apagados.has(accent)) {
    const tex = canvasTexture(256, 144, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#111827');
      g.addColorStop(1, '#05070d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.55;
      drawMonitorIcon(ctx, w / 2, h * 0.46, h * 0.2, accent);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    m.userData.compartilhado = true;
    _apagados.set(accent, m);
  }
  return _apagados.get(accent);
}

// O (+) das telas livres: clicar nele compartilha ali ou abre o navegador (ver main.js)
function drawPlus(ctx, cx, cy, r, accent = '#6ee7c8') {
  ctx.save();
  ctx.fillStyle = 'rgba(110, 231, 200, 0.14)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#f3fffb';
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.48, cy);
  ctx.lineTo(cx + r * 0.48, cy);
  ctx.moveTo(cx, cy - r * 0.48);
  ctx.lineTo(cx, cy + r * 0.48);
  ctx.stroke();
  ctx.restore();
}

// Monitor livre do SEU posto: o mesmo cartaz de desligado, com o (+) no meio
const _mais = new Map();
function monitorMais(accent) {
  if (!_mais.has(accent)) {
    const tex = canvasTexture(256, 144, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#111827');
      g.addColorStop(1, '#05070d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawPlus(ctx, w / 2, h * 0.5, h * 0.2, accent);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    m.userData.compartilhado = true;
    _mais.set(accent, m);
  }
  return _mais.get(accent);
}

// logo da empresa (World.setLogo): aparece no lugar do ícone nas telas livres
let logoDasTelas = null;

class ScreenDisplay {
  // leve: monitor de posto de trabalho — sem moldura (a mesa já tem), com o cartaz de desligado
  // em comum e sem texto próprio. A etiqueta com o nome só é criada quando aparece pela 1ª vez.
  // painel: textura própria (placar, status...) mostrada enquanto a tela está livre
  // sombra: a moldura faz sombra (a da tela embutida na parede, rente ao reboco, não precisa)
  // embutida: tela de sala, a 25–30 cm do eixo de uma parede de 30 cm. A moldura de 0,5 m de fundo
  // atravessava a parede e aparecia (preta, maior que a tela) na sala do lado; a da embutida é rasa
  // e termina dentro da parede. O brilho, atrás do reboco, nem é mostrado.
  // cartazNaMoldura: o cartaz de desligado do monitor vem instanciado na moldura (escritorio3d.js,
  // um desenho por sala); o próprio só aparece com o (+)
  constructor({ w, h, title, subtitle, icon = 'monitor', accent = '#6ee7c8', leve = false, painel = null, sombra = true, embutida = false, cartazNaMoldura = false }) {
    this.w = w;
    this.h = h;
    this.leve = leve;
    this.cartazNaMoldura = leve && cartazNaMoldura;
    this.group = new THREE.Group();
    this.accent = accent;

    this.frame = null;
    if (!leve) {
      const fundo = embutida ? 0.22 : 0.5;
      const frame = new THREE.Mesh(
        new RoundedBoxGeometry(w + 0.7, h + 0.7, fundo, 4, Math.min(0.22, fundo / 2)),
        new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 0.55, metalness: 0.3 }),
      );
      frame.position.z = -0.02 - fundo / 2; // a frente 2 cm atrás da tela
      frame.castShadow = sombra;
      this.group.add(frame);
      this.frame = frame;
    }

    // linha de LED em volta da tela
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 1.1, h + 1.1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, toneMapped: false }),
    );
    glow.position.z = -0.53;
    glow.visible = !leve && !embutida;
    this.glow = glow;
    this.group.add(glow);

    // Fundo preto da tela: só aparece com vídeo (as tarjas de um vídeo 4:3). Sem vídeo, o cartaz
    // opaco do mesmo tamanho, 1 cm na frente, cobre tudo e ela seria um desenho à toa. Escondida
    // continua servindo: o Raycaster ignora o visible, e a matriz dela segue em dia (mira, foco,
    // altura aparente, navegador).
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }),
    );
    this.surface.userData.screen = this;
    this.surface.visible = false;
    this.group.add(this.surface);

    // mais: tela livre que aceita o (+) (compartilhar ali ou abrir o navegador)
    this.placeholderTex = leve || painel ? null : canvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch, t = title, s = subtitle, mais = false) => {
      screenBackground(ctx, cw, ch);
      if (icon === 'play') drawPlayIcon(ctx, cw / 2, ch * 0.4, ch * 0.24, '#ff4d5e');
      else if (mais) {
        if (logoDasTelas) {
          const img = logoDasTelas;
          const k = Math.min((cw * 0.3) / img.width, (ch * 0.16) / img.height);
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, cw / 2 - (img.width * k) / 2, ch * 0.16 - (img.height * k) / 2, img.width * k, img.height * k);
          ctx.globalAlpha = 1;
        }
        drawPlus(ctx, cw / 2, logoDasTelas ? ch * 0.43 : ch * 0.39, ch * 0.13, accent);
      } else if (logoDasTelas) {
        // logo da empresa, cabendo numa caixa no meio de cima
        const img = logoDasTelas;
        const k = Math.min((cw * 0.5) / img.width, (ch * 0.42) / img.height);
        ctx.globalAlpha = 0.92;
        ctx.drawImage(img, cw / 2 - (img.width * k) / 2, ch * 0.38 - (img.height * k) / 2, img.width * k, img.height * k);
        ctx.globalAlpha = 1;
      } else drawMonitorIcon(ctx, cw / 2, ch * 0.38, ch * 0.24, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = '#f3f5fa';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(ch * 0.085)}px ${FONT}`;
      ctx.fillText(t, cw / 2, ch * 0.66);
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.font = `500 ${Math.round(ch * 0.05)}px ${FONT}`;
      ctx.fillText(s, cw / 2, ch * 0.76);
    }, ESCALA_TEXTURA);
    this.placeholder = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      leve ? monitorApagado(accent) : new THREE.MeshBasicMaterial({ map: painel || this.placeholderTex, toneMapped: false }),
    );
    this.placeholder.position.z = 0.01;
    this.placeholder.userData.screen = this;
    this.placeholder.visible = !this.cartazNaMoldura;
    this.group.add(this.placeholder);

    this.videoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    this.videoMesh.position.z = 0.02;
    this.videoMesh.visible = false;
    this.videoMesh.userData.screen = this;
    this.group.add(this.videoMesh);

    this.title = title;
    this.label = null; // etiqueta com o nome: criada em setLabel, quando precisar

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

  // etiqueta com o nome de quem está na tela (canto inferior esquerdo, estilo Meet)
  criarEtiqueta() {
    const { w, h, title } = this;
    const lw = this.leve ? w * 0.62 : Math.min(w * 0.46, 8);
    const lh = lw / 6.4;
    const mx = Math.min(0.3, w * 0.03);
    const my = Math.min(0.25, h * 0.04);
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
    }, ESCALA_TEXTURA);
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshBasicMaterial({ map: this.labelTex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.label.position.set(-w / 2 + lw / 2 + mx, -h / 2 + lh / 2 + my, 0.05);
    this.label.visible = false;
    this.group.add(this.label);
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

  // redesenha o cartaz de livre (o logo da empresa mudou)
  redesenharCartaz() {
    if (!this.placeholderTex) return;
    this.placeholderTex.userData.redraw(...(this._ph || []));
  }

  setPlaceholder(title, subtitle, mais = false) {
    if (!this.placeholderTex || this._phKey === title + subtitle + mais) return;
    this._ph = [title, subtitle, mais];
    this._phKey = title + subtitle + mais;
    this.placeholderTex.userData.redraw(title, subtitle, mais);
  }

  // monitor de posto: o (+) no cartaz de desligado (só nos do seu posto)
  setMais(on) {
    if (!this.leve || this.mais === on) return;
    this.mais = on;
    this.placeholder.material = on ? monitorMais(this.accent) : monitorApagado(this.accent);
    // sem o (+), o cartaz de desligado é o instanciado da moldura
    if (!this.video && !this.midia) this.placeholder.visible = on || !this.cartazNaMoldura;
  }

  setLabel(text, dotColor = null) {
    if (text == null) {
      if (this.label) this.label.visible = false;
      return;
    }
    if (!this.label) this.criarEtiqueta();
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
    this.texture = new TexturaDeTela(video);
    this.videoMesh.material.map = this.texture;
    this.videoMesh.material.needsUpdate = true;
    this._fit = () => this.fitAspect();
    video.addEventListener('resize', this._fit);
    video.addEventListener('loadedmetadata', this._fit);
    this.fitAspect();
    this.videoMesh.visible = true;
    this.surface.visible = true; // as tarjas pretas atrás de um vídeo de outro formato
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
    this.surface.visible = false;
    this.placeholder.visible = !this.cartazNaMoldura || !!this.mais;
    this.glow.material.opacity = 0.18;
  }

  // devolve a memória (geometrias, texturas) — o cartaz de desligado é de todos, fica
  dispose() {
    this.clearVideo();
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      if (o.material.userData.compartilhado) return;
      o.material.map?.dispose();
      o.material.dispose();
    });
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
  // antialias só dá para escolher ao criar o renderizador: vem do nível de qualidade salvo.
  // qualidade: o nível de partida (ver setQualidade), aplicado antes de pré-compilar os shaders.
  constructor(canvas, cssContainer, { antialias = true, qualidade = null } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance' });
    // Contexto do WebGL perdido (o sistema tomou a placa de vídeo; comum no iPhone e no Android): o
    // three já ouve antes e impede que o contexto se perca de vez. Enquanto isso nada é desenhado
    // (perdido); na volta tudo sobe de novo para a placa, as texturas de canvas a partir do próprio
    // canvas — por isso canvas de cartaz nunca é encolhido. aoPerder/aoVoltar: avisos do main.js.
    this.perdido = false;
    this.aoPerder = null;
    this.aoVoltar = null;
    canvas.addEventListener('webglcontextlost', () => {
      this.perdido = true;
      this.consultaGpu = null;
      this.extGpu = undefined;
      this.aoPerder?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.perdido = false;
      this.natureza?.refazerAmbiente?.();
      this.luzesMudaram();
      this.sombraSuja = true;
      this.aquecerShaders();
      this.aoVoltar?.();
    });
    // Medição do último quadro desenhado (o chip do ?perf=1): desenhos e triângulos (com a passada
    // de sombra, quando ela foi refeita), se a sombra foi refeita e o tempo de GPU (com medirGpu).
    this.ultimoQuadro = { draws: 0, triangulos: 0, sombraRefeita: false, gpuMs: 0 };
    this.medirGpu = false;
    this.consultaGpu = null;
    this.extGpu = undefined;
    // Resolução = densidade de pixels da tela, limitada pela qualidade (pixelMax), vezes a escala
    // dinâmica (escala: a qualidade automática baixa um pouco quando o quadro passa do tempo).
    // Telas de celular têm DPR 3: renderizar nisso tudo derruba o fps sem ganho visível.
    this.pixelMax = isTouch ? 1.25 : 1.75;
    this.escala = 1;
    this.maxLuzes = 8;
    this.videoFps = 60;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelMax));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.alturaTela = window.innerHeight; // alturaAparente lê daqui, não do layout
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
    this.areas = new Map(); // ver area()
    // salas do escritório que a câmera pode ver (ver cullSalas): [{ ...célula, caixa }] e um bit por sala
    this.salas3d = null;
    this.maskSalas = -1;
    // caixas do que barra a câmera, para o tapada (ver prepararInteresse)
    this.caixasBloqueio = [];
    this.nCaixas = 0;
    this.caixasProntas = false;
    this._luzes = null; // luzes pontuais da cena (ver atualizarLuzes)
    this.luzesVivas = [];
    this.quadrosLuzes = 0;
    this.sombraOpcional = []; // torcida e pneus: fazem sombra só no nível em que as árvores fazem
    this.holofoteNivel = true; // o cone do ringue (ver aplicarLuzRingue)
    this.luzSimples = false;
    this.compilando = false;
    // até a sombra e o resto das malhas subirem depois de compilar (a medição de quadros não conta)
    this.aquecendo = false;
    // personagem chegando (aquecerObjeto): enquanto compila e logo depois — o 1º desenho de um
    // programa novo ainda paga o driver — a medição também não conta. Sem isso, uma sala cheia
    // entrando de uma vez derrubava o nível do automático à toa (ver chegandoModelo)
    this.modelosNaFila = 0;
    this.chegandoAte = 0;
    // muda a cada aquecimento: aquecerObjeto sabe quais materiais já estão compilados para a cena atual
    this.versaoShader = 0;
    // material único dos desenhos de aquecimento (só sobem malhas; ver subirMalhas)
    this.matAquecer = new THREE.MeshBasicMaterial();
    // câmera que não enxerga nada da cena: as luzes entram na conta mesmo assim (ver acertarLuzes)
    this.camLonge = new THREE.PerspectiveCamera(60, 1, 1, 2);
    this.camLonge.position.set(0, -1e6, 0);
    this.camLonge.updateMatrixWorld();
    this.filaAquecer = Promise.resolve(); // personagens chegando: um aquecimento de cada vez
    this.tempo = 0; // o t do último update()
    this.animado = false; // o laço já animou o cenário neste quadro (ver render)
    this.cssAntes = false;
    // resolve quando os shaders da abertura estiverem compilados (ver aquecerShaders)
    this.pronto = new Promise((r) => { this.avisarPronto = r; });

    this.buildLights();
    this.criarSombrasRedondas();
    // O cinema (casca, plateia e parede de telas) é do modo Lazer. No modo escritório ele some e o
    // prédio do escritório aparece no mesmo terreno (ver setModo).
    this.area('cinema', () => this.buildRoom());
    const cinema = this.areas.get('cinema');
    cinema.objetos.push(...this.luzesCinema);
    // o chão de física e a cerca da área jogável (começam em y = -4) são do mundo todo: ficam sempre
    cinema.colisoes = cinema.colisoes.filter((c) => c.min.y >= 0);
    this.area('plateia', () => this.buildAudience());
    this.modo = 'lazer';
    this.escritorio = null;
    this.slotsEscritorio = [];
    this.telaoesEscritorio = [];
    this.buildScreens();
    // cada jogo é uma área: o dono da sala pode desligar (ver ligarArea)
    this.area('parkour', () => this.buildCourse());
    this.area('ringue', () => this.buildRing());
    this.area('corrida', () => this.buildTrack());
    // estádio do futebol de carro, ao norte do cinema (a partida em si é do futebol.js)
    this.estadio = this.area('futebol', () => construirEstadio(this));
    // vôlei, basquete e boliche, ao norte do estádio (o jogo em si é do quadras.js)
    this.quadras3d = {
      volei: this.area('volei', () => construirVolei(this)),
      basquete: this.area('basquete', () => construirBasquete(this)),
      boliche: this.area('boliche', () => construirBoliche(this)),
    };
    this.placaDirecao(69, 58, -Math.PI / 2, 'VÔLEI · BASQUETE · BOLICHE  →', '#facc15');
    // surf e mata-mata, no céu; os portais ficam perto da porta (o jogo é do ceu.js)
    this.ceu = {
      surf: this.area('surf', () => (construirPortal(this, 'surf'), construirSurf(this))),
      arena: this.area('matamata', () => (construirPortal(this, 'matamata'), construirArena(this))),
    };
    // praça do xadrez de bruxo e da dama (as peças em si ficam em jogos.js)
    this.reservas.push(...RESERVAS_JOGOS);
    this.placaDirecao(SALA.maxX + 9, SALA.porta.z0 + 2, -Math.PI / 2, '↖  JOGOS E DADOS', '#a78bfa');
    this.natureza = criarNatureza(this.scene, this.renderer, {
      area: ROOM, sala: SALA, reservas: this.reservas, estradas: this.estradas, addBox: (o) => this.addBox(o), grupo: this.fora,
    });
    const P = SALA.porta;
    this.portaBox = new THREE.Box3(new THREE.Vector3(SALA.maxX - 1, 0, P.z0), new THREE.Vector3(SALA.maxX + 1, P.altura, P.z1));
    // qualidade antes do aquecimento: quantas luzes e se tem sombra fazem parte do shader
    if (qualidade) this.setQualidade(qualidade, { aquecer: false });
    this.aquecerShaders();

    window.addEventListener('resize', () => this.resize());
    // densidade de pixels que muda sem mudar o tamanho da janela (arrastada para outro monitor, zoom):
    // a resolução acompanha. A consulta vale para um valor só: refeita a cada mudança.
    const vigiarDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', () => {
      this.aplicarResolucao();
      vigiarDpr();
    }, { once: true });
    vigiarDpr();
  }

  // O lado de fora só é desenhado quando alguém olha pela porta ou sai, e é aí que o
  // navegador compilaria os shaders dele: a primeira olhada travava a tela por segundos.
  // Compila tudo agora (no lobby, ou logo depois de trocar a qualidade).
  // Depois, um quadro invisível visto do alto manda terreno, árvores e texturas para a
  // placa de vídeo — senão o primeiro passo para fora ainda engasgava uns 300 ms.
  // Compila os shaders em segundo plano (KHR_parallel_shader_compile). Enquanto isso o mundo
  // não é desenhado (render() espera): desenhar antes obrigaria o Chrome a compilar tudo na
  // hora, travando a página — eram 0,3 s na abertura e 0,7 s ao montar o escritório, e várias
  // vezes isso num celular. A primeira vez resolve this.pronto.
  // malhas: false quando só os programas mudaram (troca de nível): malhas e texturas já estão na
  // placa, e o 3D fica parado só durante o compileAsync, que compila em paralelo.
  aquecerShaders({ malhas = true } = {}) {
    // troca de nível no meio de um aquecimento completo (a economia ligando na abertura) cancela a
    // subida de malhas dele: herda essa subida, senão ninguém a refazia
    if (malhas) this.malhasPendentes = true;
    else if (this.malhasPendentes) malhas = true;
    const vez = (this.aquecimentos = (this.aquecimentos || 0) + 1);
    this.versaoShader++;
    this.compilando = true;
    this.aquecendo = true;
    this.luzesMudaram();
    const desistir = () => vez !== this.aquecimentos; // outro aquecimento começou depois deste
    // libera o desenho (o resto continua subindo enquanto a pessoa já vê e anda)
    const liberar = () => {
      if (desistir()) return;
      this.compilando = false;
      this.avisarPronto?.();
    };
    const fim = () => {
      liberar();
      if (desistir()) return;
      this.aquecendo = false;
      this.sombraSuja = true;
    };
    // compilação ou subida que não responde não pode deixar a tela parada
    setTimeout(liberar, 6000);
    setTimeout(fim, 20000);
    this.fora.visible = true;
    // o shader é compilado para um número de luzes: tem que ser o mesmo de todo quadro
    this.atualizarLuzes();
    // Depois dos shaders, o que também pesa no primeiro quadro: texturas (cartazes, placas, telas
    // em canvas de 1024 px) e malhas indo para a placa de vídeo. Desenhar o mapa inteiro de uma
    // vez para adiantar isso parava a página por 1,1 s; agora vai em lotes, devolvendo a vez ao
    // navegador entre um e outro. Por último, com sombra ligada, um quadro que compila os
    // shaders de sombra (árvores e torcida têm o seu), que o compileAsync não faz.
    let corrente = this.renderer.compileAsync
      ? this.renderer.compileAsync(this.scene, this.camera)
      : Promise.resolve().then(() => this.renderer.compile(this.scene, this.camera));
    if (malhas) {
      corrente = corrente
        .then(() => this.subirTexturas(this.scene, desistir))
        .then(() => this.subirMalhas(desistir, liberar))
        .then(() => { if (!desistir()) this.malhasPendentes = false; });
    } else corrente = corrente.then(liberar);
    return corrente
      .then(() => { if (!desistir()) this.aquecerSombras(); })
      .catch(() => {})
      .then(fim);
  }

  // Liga o lado de fora e todas as salas do escritório, roda fn (síncrona) e devolve tudo como
  // estava: o aquecimento sobe o que ainda não está à vista. Áreas desligadas pelo dono continuam
  // desligadas.
  comTudoVisivel(fn) {
    const fora = this.fora.visible;
    const salas = this.salas3d || [];
    const antes = salas.map((s) => s.caixa.visible);
    this.fora.visible = true;
    for (const s of salas) {
      if (s.grupo) s.grupo.visible = true;
      s.caixa.visible = true;
    }
    try {
      return fn();
    } finally {
      this.fora.visible = fora;
      salas.forEach((s, i) => {
        if (s.grupo) s.grupo.visible = antes[i];
        s.caixa.visible = antes[i];
      });
    }
  }

  // câmera bem alta, olhando para baixo, que enxerga o mapa inteiro (para os quadros de aquecer)
  cameraDeCima() {
    const cam = new THREE.PerspectiveCamera(120, 1, 1, 4000);
    cam.position.set((ROOM.minX + ROOM.maxX) / 2, 700, (ROOM.minZ + ROOM.maxZ) / 2);
    cam.lookAt(cam.position.x, 0, cam.position.z);
    return cam;
  }

  // Manda as malhas para a placa de vídeo em quadros invisíveis de 4x4 px (a câmera só enxerga a
  // camada 31, e cada lote entra nela na sua vez), devolvendo a vez ao navegador a cada ~12 ms.
  // Todo desenho daqui usa um material só (matAquecer): o objetivo é subir buffers e matrizes de
  // instância, e com o material de verdade o alvo de 4x4 compilava variantes lineares e sem tone
  // mapping que a tela nunca usa (eram os 30-120 ms por material da placa Intel). O primeiro
  // objeto de cada tipo vai sozinho (é ele que paga a variante do material único); os outros, em
  // lotes. Sombra fica de fora aqui.
  // O que está na frente da câmera sobe primeiro, com a tela esperando (fatias de ~12 ms); aí
  // aoVisiveis() libera o desenho e o resto do mapa sobe sem pressa, uma fatia de ~6 ms por
  // quadro, enquanto a pessoa já vê e anda.
  async subirMalhas(desistir, aoVisiveis = () => {}) {
    const objs = [];
    this.comTudoVisivel(() => this.scene.traverseVisible((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) objs.push(o); }));
    this.prepararVista();
    const naVista = (o) => !o.frustumCulled || (o.isSprite ? _frustum.intersectsSprite(o) : _frustum.intersectsObject(o));
    const frente = [];
    const resto = [];
    for (const o of objs) (naVista(o) ? frente : resto).push(o);

    const tipos = new Set();
    const emLotes = (lista) => {
      const lotes = [];
      let lote = [];
      for (const o of lista) {
        const tipo = `${o.isInstancedMesh}|${o.isSkinnedMesh}|${!!o.instanceColor}|${o.isSprite}|${o.isLine}|${o.isPoints}`;
        if (!tipos.has(tipo)) {
          tipos.add(tipo);
          lotes.push([o]);
          continue;
        }
        lote.push(o);
        if (lote.length === 150) {
          lotes.push(lote);
          lote = [];
        }
      }
      if (lote.length) lotes.push(lote);
      return lotes;
    };

    const cam = this.cameraDeCima();
    cam.layers.set(31);
    const alvo = new THREE.WebGLRenderTarget(4, 4);
    const subir = (lote) => this.comTudoVisivel(() => {
      const auto = this.renderer.shadowMap.autoUpdate;
      this.renderer.shadowMap.autoUpdate = false;
      this.scene.overrideMaterial = this.matAquecer;
      for (const o of lote) o.layers.enable(31);
      try {
        this.renderer.setRenderTarget(alvo);
        this.renderer.render(this.scene, cam);
      } finally {
        this.renderer.setRenderTarget(null);
        for (const o of lote) o.layers.disable(31);
        this.scene.overrideMaterial = null;
        this.renderer.shadowMap.autoUpdate = auto;
      }
    });
    const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => r()));
    try {
      let desde = performance.now();
      for (const lote of emLotes(frente)) {
        if (desistir()) return;
        subir(lote);
        if (performance.now() - desde > 12) {
          this.acertarLuzes(alvo);
          await ceder();
          desde = performance.now();
        }
      }
      this.acertarLuzes(alvo);
      aoVisiveis();
      desde = performance.now();
      for (const lote of emLotes(resto)) {
        if (desistir()) return;
        subir(lote);
        if (performance.now() - desde > 6) {
          this.acertarLuzes(alvo);
          await proximoQuadro();
          desde = performance.now();
        }
      }
    } finally {
      alvo.dispose();
    }
  }

  // O passe de sombra do three usa a contagem de luzes do desenho anterior da mesma cena (as luzes
  // do quadro só são montadas depois dele), e os quadros 4x4 da camada 31 não enxergam luz nenhuma:
  // logo depois de um deles, o mapa de sombra compilaria programas de profundidade para zero luzes,
  // na hora, no meio de um quadro de verdade. Um desenho sem sombra, com uma câmera que não enxerga
  // nada (as luzes entram na conta mesmo assim) e as luzes escolhidas como num quadro, deixa a
  // contagem igual à do quadro.
  acertarLuzes(alvo) {
    this.atualizarLuzes();
    const auto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene.overrideMaterial = this.matAquecer;
    try {
      this.renderer.setRenderTarget(alvo);
      this.renderer.render(this.scene, this.camLonge);
    } finally {
      this.renderer.setRenderTarget(null);
      this.scene.overrideMaterial = null;
      this.renderer.shadowMap.autoUpdate = auto;
    }
  }

  // Compila os programas de profundidade (sombra), que o compileAsync não faz: um mapa de sombra
  // feito de verdade, com a caixa do sol onde ficam árvores e torcida, que têm o seu. O desenho
  // comum vai para a câmera que não enxerga nada: só o passe de sombra importa, e ele usa os
  // materiais de profundidade de cada objeto. (O mapa de sombra do three filtra pelas camadas da
  // câmera principal: a dela é a 0, a de todo mundo.)
  aquecerSombras() {
    if (!this.renderer.shadowMap.enabled || !this.sun.castShadow) return;
    const alvo = new THREE.WebGLRenderTarget(4, 4);
    const solAntes = this.sun.target.position.clone();
    const naSala = this.solNaSala;
    this.acertarLuzes(alvo);
    this.comTudoVisivel(() => {
      this.focarSol(200, 120, PREDIO.altura);
      this.atualizarLuzes(); // o mesmo número de luzes, escolhidas com tudo à vista
      try {
        // o flag por luz: sem ele o three nem desenharia a sombra (ver atualizarSombra)
        this.sun.shadow.needsUpdate = true;
        this.scene.overrideMaterial = this.matAquecer;
        this.renderer.setRenderTarget(alvo);
        this.renderer.render(this.scene, this.camLonge);
      } finally {
        this.renderer.setRenderTarget(null);
        this.scene.overrideMaterial = null;
        // de volta para onde estava (no centro da sala, se estava numa)
        this.focarSol(solAntes.x, solAntes.z, naSala ? 0 : PREDIO.altura);
      }
    });
    // com tudo à vista, o desenho acima pode ter contado luzes de grupos que o quadro esconde
    // (mesas lá fora): a contagem volta à do quadro antes do próximo passe de sombra
    this.acertarLuzes(alvo);
    alvo.dispose();
    this.sombraSuja = true; // o mapa ficou centrado em 200,120
  }

  // Compila os shaders de um objeto que vai entrar na cena (um personagem que acabou de
  // carregar), em segundo plano, com as luzes da cena — sem travar o quadro em que ele aparece.
  // Um por vez (fila): numa sala cheia chegam dezenas de modelos juntos, e cada compilação passa
  // pela cena inteira. Nunca falha: sem pré-compilação, compila no primeiro quadro, como antes.
  aquecerObjeto(obj) {
    this.modelosNaFila++;
    this.filaAquecer = this.filaAquecer.then(() => this.compilarObjeto(obj)).catch(() => {}).finally(() => {
      this.modelosNaFila--;
      this.chegandoAte = performance.now() + 1500;
    });
    return this.filaAquecer;
  }

  // a medição do automático ignora estes quadros (ver modelosNaFila)
  chegandoModelo() {
    return this.modelosNaFila > 0 || performance.now() < this.chegandoAte;
  }

  // O objeto entra na cena só durante a compilação: compilado de fora (compileAsync com
  // targetScene) o shader saía com outra configuração e o Chrome compilava de novo na hora.
  // Clones do mesmo personagem dividem o material: só o primeiro de cada modelo compila (marca
  // por material com a versão dos shaders); os outros só sobem as texturas.
  async compilarObjeto(obj) {
    if (!this.renderer.compileAsync) return;
    const versao = this.versaoShader;
    const materiais = new Set();
    obj.traverse((o) => { for (const m of [].concat(o.material || [])) materiais.add(m); });
    if ([...materiais].every((m) => m.userData.aquecidoEm === versao)) {
      await this.subirTexturas(obj);
      return;
    }
    const pai = obj.parent;
    const y = obj.position.y;
    obj.position.y = -50000; // longe da câmera enquanto compila: ninguém vê o modelo no meio do mapa
    this.scene.add(obj);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      await this.subirTexturas(obj);
      for (const m of materiais) m.userData.aquecidoEm = versao;
    } finally {
      obj.position.y = y;
      if (pai) pai.add(obj);
      else this.scene.remove(obj);
    }
  }

  // manda as texturas (visíveis) de um objeto para a placa de vídeo, devolvendo a vez ao
  // navegador a cada ~12 ms; desistir(): parar no meio (veio outro pedido). Na cena, inclui o que
  // está escondido agora (lado de fora, outras salas).
  async subirTexturas(raiz, desistir = () => false) {
    const texturas = new Set();
    this.comTudoVisivel(() => raiz.traverseVisible((o) => {
      for (const m of [].concat(o.material || [])) {
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
          const t = m[k];
          if (t?.isTexture && !t.isVideoTexture) texturas.add(t);
        }
      }
    }));
    let desde = performance.now();
    for (const t of texturas) {
      if (desistir()) return;
      this.renderer.initTexture(t);
      if (performance.now() - desde > 12) {
        await ceder();
        desde = performance.now();
      }
    }
  }

  // -------------------------------------------------------------- construção
  buildLights() {
    const hemi = new THREE.HemisphereLight(0xc9d3ff, 0x252036, 1.45);
    this.scene.add(hemi);
    this.hemi = hemi; // o clima (clima.js) muda a cor e a força com a hora e o tempo

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
    // Sombra sob demanda (ver atualizarSombra): o mapa só é refeito quando algo pede. É o flag desta
    // luz, e não o do renderizador: os quadros 4x4 do aquecimento desligam o do renderizador e assim
    // nunca gastam um pedido pendente.
    sun.shadow.autoUpdate = false;
    this.sombraSuja = true; // algo parado mudou (a própria sombra, a caixa do sol, o que está à vista)
    this.sombraRemota = false; // alguém de longe se mexeu (na Média, refeito a cada 2 quadros)
    this.ultimaSombra = -Infinity;
    this.quadroSombra = 0;
    this.dirSombra = new THREE.Vector3(); // direção do sol no último mapa
    this.solNaSala = false; // caixa do sol presa a uma sala do escritório (ver focarSol)
    this.sunOffset = sun.position.clone().sub(sun.target.position);
    this.scene.add(sun, sun.target);

    // brilho azulado que "vem" da parede de telas
    const screenGlow = new THREE.PointLight(0x7f9cff, 260, 70, 1.2);
    screenGlow.position.set(0, 12, ROOM.minZ + 8);
    this.scene.add(screenGlow);

    const backGlow = new THREE.PointLight(0xd08bff, 180, 60, 1.2);
    backGlow.position.set(0, 18, 26);
    this.scene.add(backGlow);
    this.luzesCinema = [screenGlow, backGlow]; // apagam junto com o cinema (modo escritório)
  }

  // O galpão ficou grande demais para uma sombra só: em vez de esticar o mapa de
  // sombra sobre tudo (e borrar tudo), o sol acompanha o jogador. A área coberta
  // continua pequena e nítida, e vai junto com quem está olhando.
  // Numa sala do escritório (y: abaixo do forro), a caixa encolhe e fica presa no meio da sala: a
  // meia-diagonal da sala (18,4 m) mais a altura da parede cabem em ±20/±22 a qualquer hora do sol,
  // e a sombra fica 2,3× mais nítida. Cruzar a porta só muda a nitidez.
  focarSol(x, z, y = 0) {
    if (!this.sun) return;
    let sala = null;
    if (this.planta && y < PREDIO.altura) {
      for (const s of this.planta.salas) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) sala = s;
      for (const s of this.planta.lounges) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) sala = s;
    }
    if (!!sala !== this.solNaSala) {
      this.solNaSala = !!sala;
      const sc = this.sun.shadow.camera;
      const [mx, mz] = sala ? [20, 22] : [46, 52];
      sc.left = -mx;
      sc.right = mx;
      sc.top = mz;
      sc.bottom = -mz;
      sc.updateProjectionMatrix(); // só a matriz: não recompila nada
      this.sombraSuja = true;
    }
    const alvo = this.sun.target.position;
    if (sala) {
      // dentro da sala, o centro exato dela (sem a folga de 6 m de fora)
      x = (sala.x0 + sala.x1) / 2;
      z = (sala.z0 + sala.z1) / 2;
      if (alvo.x === x && alvo.z === z) return;
    } else if (Math.abs(alvo.x - x) < 6 && Math.abs(alvo.z - z) < 6) return;
    alvo.set(x, 0, z);
    this.sun.position.copy(alvo).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
    this.sombraSuja = true;
  }

  // Pede o mapa de sombra de novo. remota: alguém (outra pessoa, a torcida) se mexeu dentro da caixa
  // do sol — no nível com sombra leve, vale a cada 2 quadros.
  marcarSombra(remota = false) {
    if (remota) this.sombraRemota = true;
    else this.sombraSuja = true;
  }

  // dentro da caixa do sol, com folga para a inclinação dele (na sala do escritório a caixa é ±20 m)
  pertoDoSol(p, folga = this.solNaSala ? 26 : 75) {
    const a = this.sun.target.position;
    return Math.abs(p.x - a.x) < folga && Math.abs(p.z - a.z) < folga;
  }

  // Antes de cada quadro: decide se o mapa de sombra é refeito. Sem teto de tempo: com o próprio
  // boneco andando é todo quadro, a 60 ou 144 Hz, como antes. Parado, ~4 vezes por segundo (pega o
  // que ninguém marca: respiração, um modelo parado), mais quando o sol anda ~0,2°.
  atualizarSombra() {
    this.ultimoQuadro.sombraRefeita = false;
    if (!this.renderer.shadowMap.enabled || !this.sun.castShadow) return;
    _dirSol.copy(this.sunOffset).normalize();
    if (_dirSol.dot(this.dirSombra) < 0.999994 || !this.sun.shadow.map) this.sombraSuja = true;
    const remota = this.sombraRemota && (!this.sombraLeve || (++this.quadroSombra & 1) === 0);
    const agora = performance.now();
    if (!this.sombraSuja && !remota && agora - this.ultimaSombra <= 250) return;
    this.sun.shadow.needsUpdate = true;
    this.ultimaSombra = agora;
    this.dirSombra.copy(_dirSol);
    this.sombraSuja = false;
    this.sombraRemota = false;
    this.ultimoQuadro.sombraRefeita = true;
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
    // faces da BoxGeometry: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z. A face de dentro leva o material
    // da sala e as outras cinco a fachada, juntas num grupo só: 2 desenhos por parede, não 6. Cada
    // parede continua uma caixa à parte (barra a câmera; o raio funciona com grupos).
    const parede = (min, max, faceDentro, matDentro) => {
      const geo = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      for (const g of geo.groups) g.materialIndex = g.materialIndex === faceDentro ? 1 : 0;
      mergeGroups(geo);
      const m = new THREE.Mesh(geo, [fachadaMat, matDentro]);
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
    // as peças de todos os sofás, por material, viram uma malha cada: é aqui que o povo nasce, e
    // eram 45 desenhos (mais 45 na sombra)
    const pecas = new Map([[sofaMat, []], [cushionMat, []]]);
    const rows = [-25, -18, -11];
    rows.forEach((z, ri) => {
      for (const x of [-10, 0, 10]) this.addSofa(x, z, ri === 1 ? cushionMat : sofaMat, ri === 1 ? sofaMat : cushionMat, pecas);
    });
    for (const [mat, geos] of pecas) this.scene.add(fundir(geos, mat, { sombra: true, recebe: true }));

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

  // pecas: Map material → geometrias já no lugar (buildAudience funde tudo no fim)
  addSofa(x, z, mat, cushion, pecas) {
    const parts = [
      { size: [7, 0.8, 2.2], pos: [0, 0.4, 0], mat },
      { size: [6.2, 0.25, 1.9], pos: [0, 0.88, -0.05], mat: cushion },
      { size: [7, 1.5, 0.6], pos: [0, 1.35, 0.85], mat },
      { size: [0.55, 0.7, 2.2], pos: [-3.25, 1.05, 0], mat },
      { size: [0.55, 0.7, 2.2], pos: [3.25, 1.05, 0], mat },
    ];
    for (const p of parts) pecas.get(p.mat).push(new RoundedBoxGeometry(...p.size, 3, 0.18).translate(x + p.pos[0], p.pos[1], z + p.pos[2]));
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

    this.slotsCinema = SLOT_LAYOUT.map((l, i) => {
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
    this.slots = this.slotsCinema;

    this.screens = [this.mainScreen, ...this.slots];
  }

  criarTelao(opts) {
    const t = new Telao(opts);
    t.aoMudar = () => { if (t.isHost) this.tvCss.visible = t.mostraMidia && this.telaoVisivel(t); };
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
    // telão escondido (cinema no modo escritório): o player não fica flutuando no lugar dele
    this.tvCss.visible = t.mostraMidia && this.telaoVisivel(t);
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
    // só os que aparecem (no escritório o do cinema some; com a pista desligada, o dela também)
    const vivos = this.telaoes.filter((t) => this.telaoVisivel(t));
    return (vivos.length ? vivos : this.telaoes).reduce((a, b) => (b.group.position.distanceTo(cam) < a.group.position.distanceTo(cam) ? b : a));
  }

  // O player vai para o telão mais perto da câmera. A folga de 15% evita ficar trocando
  // quando alguém para bem no meio do caminho entre os dois.
  atualizarTelao() {
    if (this.telaoTravado || this.slotMidia || !this.telaoes) return;
    if (!this.telaoes.includes(this.tvHost) || !this.telaoVisivel(this.tvHost)) {
      const t = this.telaoMaisPerto();
      if (t !== this.tvHost) this.setMidiaHost(t);
      return;
    }
    if (this.telaoes.length < 2) return;
    const cam = this.camera.position;
    const dist = (s) => s.group.position.distanceTo(cam);
    let perto = this.tvHost;
    for (const s of this.telaoes) if (this.telaoVisivel(s) && dist(s) < dist(perto) * 0.85) perto = s;
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

    // um material de saia só (lona e degraus) e a face de cima com a pintura: 2 desenhos, não 6.
    // A pintura tem brilho próprio, que só acende sem o holofote (ver aplicarLuzRingue).
    const saia = new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.8 });
    this.lonaTopo = new THREE.MeshStandardMaterial({ map: lonaTex, emissiveMap: lonaTex, emissive: 0x000000, roughness: 0.72 });
    const lonaGeo = new THREE.BoxGeometry(size, matThickness, size);
    for (const g of lonaGeo.groups) g.materialIndex = g.materialIndex === 2 ? 1 : 0; // 2: face +y
    mergeGroups(lonaGeo);
    const lona = new THREE.Mesh(lonaGeo, [saia, this.lonaTopo]);
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

    // cordas (sem colisão de propósito), todas numa malha só
    const cordaMat = new THREE.MeshStandardMaterial({ color: C.rope, roughness: 0.5, emissive: C.rope, emissiveIntensity: 0.3 });
    const cordas = [];
    for (const altura of RING.ropes) {
      for (let i = 0; i < 4; i++) {
        const [ax, az] = cantos[i];
        const [bx, bz] = cantos[(i + 1) % 4];
        const x1 = cx + ax * half, z1 = cz + az * half;
        const x2 = cx + bx * half, z2 = cz + bz * half;
        const comprimento = Math.hypot(x2 - x1, z2 - z1);
        _aux.position.set((x1 + x2) / 2, matTop + altura, (z1 + z2) / 2);
        _aux.rotation.set(0, -Math.atan2(z2 - z1, x2 - x1), Math.PI / 2);
        _aux.updateMatrix();
        cordas.push(new THREE.CylinderGeometry(0.05, 0.05, comprimento, 8).applyMatrix4(_aux.matrix));
      }
    }
    grupo.add(fundir(cordas, cordaMat));

    // escadinha para subir no ringue
    for (let i = 0; i < 2; i++) {
      const degrauTop = matTop * ((i + 1) / 3);
      const w = 3.4;
      const d = 0.9;
      const z = cz - half - 0.45 - (1 - i) * d;
      const degrau = new THREE.Mesh(new RoundedBoxGeometry(w, degrauTop, d, 2, 0.08), saia);
      degrau.position.set(cx, degrauTop / 2, z);
      degrau.castShadow = true;
      degrau.receiveShadow = true;
      grupo.add(degrau);
      this.addBox({ min: [cx - w / 2, 0, z - d / 2], max: [cx + w / 2, degrauTop, z + d / 2], data: { type: 'ring' }, mesh: degrau });
    }

    // luz quente em cima do ringue (o cone só na Alta: ver aplicarLuzRingue)
    const luz = new THREE.SpotLight(0xffd9a0, 420, 26, Math.PI / 4.5, 0.5, 1.4);
    luz.position.set(cx, matTop + 11, cz);
    luz.target.position.set(cx, matTop, cz);
    this.scene.add(luz, luz.target);
    this.luzRingue = luz;

    this.ringGroup = grupo;
  }

  // O holofote do ringue (SpotLight) fica fora da conta das luzes pontuais e custa em todo pixel:
  // aceso só no nível que pede (holofote) e com o ringue ligado. Apagado, a pintura da lona ganha
  // brilho próprio (só um uniform, sem recompilar). Nunca por distância: ligar ou desligar muda o
  // número de spots do shader e recompila tudo. Devolve se mudou (aí quem chama recompila).
  aplicarLuzRingue() {
    const luz = this.luzRingue;
    if (!luz) return false;
    const acesa = this.holofoteNivel && !luz.userData.areaDesligada;
    const mudou = luz.visible !== acesa;
    luz.visible = acesa;
    this.lonaTopo.emissive.setHex(0xffd9a0).multiplyScalar(acesa ? 0 : 1.6);
    return mudou;
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

    // 3) postes de luz: cabeça acesa (de graça) e algumas luzes de verdade. Postes e luminárias
    //    fundidos (uma malha de cada); as luzes ficam soltas
    const posteGeo = new THREE.CylinderGeometry(0.22, 0.3, 11, 10);
    const posteMat = new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.6 });
    const luminariaGeo = new RoundedBoxGeometry(2.6, 0.4, 1.1, 2, 0.12);
    const luminariaMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false });
    const postes = [];
    const luminarias = [];
    const POSTES = 28;
    for (let i = 0; i < POSTES; i++) {
      const p = pontoEm(i / POSTES);
      const [lx, lz] = lateralDe(p);
      const lado = i % 2 ? 1 : -1;
      const px = p.x + lx * (meia + 9) * lado;
      const pz = p.z + lz * (meia + 9) * lado;
      if (this.pertoDeVia(px, pz, 2)) continue; // não planta poste no meio da entrada
      postes.push(posteGeo.clone().translate(px, 5.5, pz));
      _aux.position.set(px, 11, pz);
      _aux.lookAt(p.x, 10, p.z);
      _aux.updateMatrix();
      luminarias.push(luminariaGeo.clone().applyMatrix4(_aux.matrix));
      // só alguns pontos de luz reais: cada um custa caro no desenho
      if (i % 2 === 0) {
        const luz = new THREE.PointLight(0xe8eeff, 170, 58, 1.7);
        luz.position.set(px, 10.4, pz);
        this.scene.add(luz); // fora do grupo da pista de propósito: ver cullFora
      }
    }
    grupo.add(fundir(postes, posteMat, { sombra: true }), fundir(luminarias, luminariaMat));
    posteGeo.dispose();
    luminariaGeo.dispose();

    // 4) pilhas de pneu nas curvas (instanciadas: eram 210 malhas, agora são 2). 144 triângulos
    //    por pneu: de perto é igual ao de 256
    const coresPilha = [0xf43f5e, 0xfbbf24, 0x60a5fa, 0x6ee7c8];
    const pneuGeo = new THREE.TorusGeometry(0.62, 0.26, 6, 12);
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
      this.sombraOpcional.push(malha);
    }

    // 5) placa com o nome de cada curva (os pés, fundidos numa malha)
    const pes = [];
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
      pes.push(new THREE.CylinderGeometry(0.16, 0.22, 3.6, 8).translate(px, 1.8, pz));
    });
    grupo.add(fundir(pes, posteMat));

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

    // degraus numa malha só, e os assentos numa por cor (os colisores continuam caixas à parte)
    const concreto = new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 0.85 });
    const coresAssento = [0x2563eb, 0x0ea5e9].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    const degraus = [];
    const assentos = [[], []];
    for (let d = 0; d < DEGRAUS; d++) {
      const topo = alt * (d + 1);
      const z0 = zFrente - (d + 1) * prof;
      degraus.push(new THREE.BoxGeometry(L, topo, prof).translate(x, topo / 2, z0 + prof / 2));
      assentos[d % 2].push(new THREE.BoxGeometry(L - 0.4, 0.45, 0.3).translate(x, topo + 0.22, z0 + 0.3));
      this.addBox({ min: [x - L / 2, 0, z0], max: [x + L / 2, topo, z0 + prof], data: { type: 'sofa' } });
    }
    grupo.add(fundir(degraus, concreto, { sombra: true, recebe: true }));
    assentos.forEach((geos, i) => grupo.add(fundir(geos, coresAssento[i])));
    // calçada na frente
    const calcada = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, 7), new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: 0.9 }));
    calcada.rotation.x = -Math.PI / 2;
    calcada.position.set(x, 0.05, zFrente + 3.5);
    calcada.receiveShadow = true;
    grupo.add(calcada);

    // cobertura em balanço, com pilares no fundo (soltos de propósito: barram a câmera, e uma caixa
    // só para os cinco cobriria os vãos entre eles)
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
    grupo.add(fundir([0.25, 0.55, 0.85].map((dz) => new THREE.BoxGeometry(L - 6, 0.12, 0.35)
      .translate(x, coberturaY - 0.35 - dz * 0.6, zFundo + DEGRAUS * prof * dz + 1)), luminaria));
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

    // bandeiras em cima da cobertura (os mastros numa malha só; os panos, soltos, tremulam)
    const bandeiras = [];
    const mastros = [];
    const panoGeo = new THREE.PlaneGeometry(2.6, 1.6, 8, 1).translate(1.3, 0, 0);
    [0xf43f5e, 0xfbbf24, 0x22c55e, 0x60a5fa, 0xa78bfa, 0xf97316].forEach((cor, i) => {
      const px = x - L / 2 + 6 + (i * (L - 12)) / 5;
      mastros.push(new THREE.CylinderGeometry(0.06, 0.06, 4, 6).translate(px, coberturaY + 2.2, zFrente + 2));
      const pano = new THREE.Mesh(panoGeo.clone(), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, side: THREE.DoubleSide }));
      pano.position.set(px, coberturaY + 3.4, zFrente + 2);
      grupo.add(pano);
      bandeiras.push({ pano, base: pano.geometry.attributes.position.array.slice(), fase: i });
    });
    grupo.add(fundir(mastros, aco));
    this.decorAnimated.push((t) => {
      // escondidas (pista desligada, câmera dentro do cinema ou do prédio): nada a mexer
      if (!grupo.visible || !this.fora.visible) return;
      for (const b of bandeiras) {
        if (b.pano.position.distanceToSquared(this.camera.position) > 150 * 150) continue; // longe, nem se nota
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
      // a "ola" levanta todo mundo no máximo uns 0,13 m além da esfera calculada parada: com a
      // folga, o recorte pela vista não come ninguém na borda da tela
      malha.boundingSphere.radius += 1.5;
      grupo.add(malha);
      this.sombraOpcional.push(malha);
    }
    let quadro = 0;
    this.decorAnimated.push((t) => {
      // só mexe na torcida quando alguém pode estar vendo e a cada dois quadros
      if (++quadro % 2 || !this.fora.visible || !grupo.visible) return;
      if (this.camera.position.distanceTo(_tmp.set(x, 5, zFrente)) > 260) return;
      atualizarTorcida(t);
      // a sombra da torcida se mexe junto, se ela faz sombra neste nível e cai na caixa do sol
      if (corpos.castShadow && this.pertoDoSol(_tmp.set(x, 3, zFrente), L / 2 + 40)) this.marcarSombra(true);
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
    this.fora.add(this.pistaScreen.group); // some junto com o lado de fora
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
    const frentes = texturas.map((map) => new THREE.MeshBasicMaterial({ map, toneMapped: false }));
    // Tudo fundido (eram 8 desenhos por placa): a caixa sem a face da frente (a 4, +z, virada para
    // a pista) de todas as placas numa malha, a marca de cada patrocinador num plano no lugar exato
    // daquela face (um plano um pouco à frente brigaria com a caixa de longe), e os postes.
    const versos = [];
    const porMarca = frentes.map(() => []);
    const postes = [];
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
        _aux.position.set(x, 2.6, z);
        _aux.lookAt(p.x, 2.6, p.z);
        _aux.updateMatrix();
        versos.push(caixaSem(14, 2.6, 0.12, [4]).applyMatrix4(_aux.matrix));
        porMarca[n % frentes.length].push(new THREE.PlaneGeometry(14, 2.6).translate(0, 0, 0.06).applyMatrix4(_aux.matrix));
        for (const s of [-1, 1]) postes.push(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6).translate(x + lz * s * 6 * lado, 2.6 - 1.3, z - lx * s * 6 * lado));
        n++;
        break; // uma placa por ponto da pista
      }
    }
    grupo.add(fundir(versos, verso), fundir(postes, pe));
    porMarca.forEach((geos, i) => { if (geos.length) grupo.add(fundir(geos, frentes[i])); });
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
    // lampiões: hastes numa malha e globos noutra
    const hasteGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6);
    const globoGeo = new THREE.SphereGeometry(0.26, 12, 8);
    const hastes = [];
    const globos = [];
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
        hastes.push(hasteGeo.clone().translate(lx, 1.3, lz));
        globos.push(globoGeo.clone().translate(lx, 2.75, lz));
      }
    });
    this.fora.add(
      fundir(hastes, new THREE.MeshStandardMaterial({ color: 0x2b2f3a })),
      fundir(globos, new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })),
    );
    hasteGeo.dispose();
    globoGeo.dispose();
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
    // a caixa sem as duas faces grandes, e o texto num plano na frente e noutro atrás (girado),
    // no lugar exato delas: 2 desenhos no lugar dos 6 grupos de material de antes
    const placa = new THREE.Mesh(caixaSem(6, 1.5, 0.12, [4, 5]), verso);
    const textos = fundir([
      new THREE.PlaneGeometry(6, 1.5).translate(0, 0, 0.06),
      new THREE.PlaneGeometry(6, 1.5).rotateY(Math.PI).translate(0, 0, -0.06),
    ], frente);
    for (const m of [placa, textos]) {
      m.position.set(x, 3, z);
      m.rotation.y = rotY;
    }
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2b3245 }));
    poste.position.set(x, 1.5, z);
    this.fora.add(placa, textos, poste);
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

    // plataformas comuns (paradas e sem tipo): uma malha por material no fim, também na sombra
    const fixas = new Map();
    const build = (def) => {
      const [w, d] = def.size;
      const h = def.h ?? 0.6;
      const [x, top, z] = def.pos;
      const type = def.type ?? 'platform';
      const emissive = type === 'pad' || type === 'finish' || type === 'teleport' ? 0.5 : type === 'balcony' ? 0.02 : 0.14;
      const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(0.14, h / 3, w / 4, d / 4));
      const data = { ...def, type };
      if (!def.move && !def.type) {
        const mat = material(def.color, emissive);
        if (!fixas.has(mat)) fixas.set(mat, []);
        fixas.get(mat).push(geo.translate(x, top - h / 2, z));
        const collider = this.addBox({ min: [x - w / 2, top - h, z - d / 2], max: [x + w / 2, top, z + d / 2], data });
        collider.half = new THREE.Vector3(w / 2, h / 2, d / 2);
        return collider;
      }
      const mesh = new THREE.Mesh(geo, material(def.color, emissive));
      mesh.position.set(x, top - h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

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
    for (const [mat, geos] of fixas) this.scene.add(fundir(geos, mat, { sombra: true, recebe: true }));
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
    this.decorAnimated.push((t) => {
      if (mesh.userData.areaDesligada) return; // parkour desligado (e no escritório)
      arrow.material.opacity = 0.55 + 0.45 * Math.sin(t * 5);
    });
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
      if (mesh.userData.areaDesligada) return; // parkour desligado (e no escritório)
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
        if (mesh.userData.areaDesligada) return;
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
  // Física do cenário, todo quadro, desenhado ou não: as plataformas móveis (quem está em cima anda
  // junto) e o escritório (sino, teclado e mouse do posto).
  update(time) {
    this.tempo = time;
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
      // a sombra dela anda junto
      if (c.mesh.visible && !c.mesh.userData.areaDesligada && this.pertoDoSol(c.mesh.position, 90)) this.sombraSuja = true;
    }
    this.escritorio?.update(time);
  }

  // Enfeites animados e natureza (nuvens, água, pássaros, torcida, bandeiras): só quando o quadro
  // vai ser desenhado. Quem não chamar, render() chama.
  animar(time) {
    this.animado = true;
    for (const fn of this.decorAnimated) fn(time);
    this.natureza?.update(time);
  }

  // -------------------------------------------------------------- modo da sala
  // Lazer: o cinema de sempre. Escritório: o prédio com os departamentos que o dono escolheu (ver
  // escritorio.js / escritorio3d.js), no mesmo terreno do cinema — o parque lá fora continua.
  // Devolve true se mudou alguma coisa (aí quem chama atualiza o que está em cada tela).
  setModo({ modulo, departamentos = [], empresa = '' }) {
    const escritorio = modulo === 'escritorio' && departamentos.length > 0;
    const chave = escritorio ? `escritorio:${departamentos.join(',')}:${empresa}` : 'lazer';
    if (chave === this.chaveModo) return false;
    this.chaveModo = chave;
    this.modo = escritorio ? 'escritorio' : 'lazer';
    // o teto de luzes é por modo (o escritório tem uma luz em cada sala): o aquecimento do fim já
    // compila com ele
    this.maxLuzes = this.luzesDoModo();
    this.desmontarEscritorio();
    this.ligarArea('cinema', !escritorio);
    this.ligarArea('plateia', !escritorio);
    this.mainScreen.group.visible = !escritorio;
    for (const s of this.slotsCinema) {
      s.group.visible = !escritorio;
      if (escritorio) s.clearVideo();
    }
    if (escritorio) this.montarEscritorio(departamentos, empresa);
    this.slots = escritorio ? this.slotsEscritorio : this.slotsCinema;
    this.screens = [...this.telaoes, ...this.slots];
    if (!this.telaoVisivel(this.tvHost)) this.setMidiaHost(this.telaoMaisPerto());
    this.sombraSuja = true;
    this.aquecerShaders(); // salas novas: compila agora, não na primeira olhada
    return true;
  }

  montarEscritorio(departamentos, empresa) {
    this.planta = planta(departamentos);
    // cartaz de monitor desligado: o prédio instancia um por sala na moldura, com o material
    // compartilhado daqui (as cores que ele pediu: ali o cartaz próprio de cada monitor sobra)
    const instanciados = new Set();
    const apagado = (cor) => {
      instanciados.add(cor);
      return monitorApagado(cor);
    };
    this.escritorio = this.area('escritorio', () => construirEscritorio(this, this.planta, { empresa, apagado }));
    if (this.logo) this.escritorio.setLogo?.(this.logo);
    // Uma caixa (grupo) por sala com as telas dela: o cullSalas esconde a sala inteira (os móveis, no
    // grupo da célula, e as telas, na caixa) quando a câmera não tem como vê-la. As caixas ficam na
    // origem, sem transformação: a posição de cada tela continua sendo a do mundo. Esconde-se pela
    // caixa, nunca pelo s.group.visible (navegador, telaoVisivel e a tela do lado leem esse). Prédio
    // sem células: as telas ficam na cena, como sempre.
    this.salas3d = (this.escritorio.celulas || []).map((c) => {
      const caixa = new THREE.Group();
      this.scene.add(caixa);
      return { ...c, caixa };
    });
    this.bitsLado = { norte: 0, sul: 0, fundos: 0 };
    this.salas3d.forEach((c, i) => { this.bitsLado[c.lado] |= 1 << i; });
    this.maskSalas = -1;
    const caixaDa = (celula) => this.salas3d[celula]?.caixa || this.scene;
    // as telas de compartilhar, na ordem das salas (é a mesma ordem das telas no servidor). As
    // embutidas na parede não fazem sombra, e a moldura delas é rasa (não passa para a sala do lado)
    this.slotsEscritorio = this.escritorio.telas.map((t, i) => {
      const s = new ScreenDisplay({ w: t.w, h: t.h, title: t.rotulo, subtitle: 'Livre — clique em "Compartilhar tela"', painel: t.painel || null, sombra: !t.embutida, embutida: !!t.embutida });
      s.index = i;
      s.group.position.set(...t.pos);
      s.group.rotation.y = t.rotY;
      s.aoMudar = () => { if (s.isHost) this.tvCss.visible = s.mostraMidia; };
      caixaDa(t.celula).add(s.group);
      return s;
    });
    // os 3 monitores de cada posto, depois das telas de parede (mesma numeração do servidor)
    const postos = new Map(this.escritorio.postos.map((po) => [po.id, po]));
    for (const po of this.planta.postos) {
      const p3 = postos.get(po.id);
      const accent = DEPARTAMENTOS[po.sala]?.cor ?? this.planta.recepcao.cor; // o do balcão da recepção
      (p3?.monitores || []).forEach((m, j) => {
        const s = new ScreenDisplay({ w: m.w, h: m.h, leve: true, accent, cartazNaMoldura: instanciados.has(accent) });
        s.index = po.primeiraTela + j;
        s.posto = po.id;
        s.meio = j === 1;
        s.group.position.set(...m.pos);
        s.group.rotation.y = m.rotY;
        s.aoMudar = () => { if (s.isHost) this.tvCss.visible = s.mostraMidia; };
        caixaDa(p3.celula).add(s.group);
        this.slotsEscritorio[s.index] = s;
      });
    }
    this.telaoesEscritorio = this.escritorio.telaoes.map((t) => {
      const tel = this.criarTelao({ w: t.w, h: t.h, title: 'Telão', subtitle: 'Cole um link (YouTube, Twitch, Kick…) ou fixe a tela de alguém aqui', accent: '#a78bfa', sombra: !t.embutida, embutida: !!t.embutida });
      tel.group.position.set(...t.pos);
      tel.group.rotation.y = t.rotY;
      caixaDa(t.celula).add(tel.group);
      return tel;
    });
    this.sombraSuja = true;
  }

  // logo da empresa (imagem já carregada, ou null): telas livres e a parede da recepção
  setLogo(img) {
    logoDasTelas = img;
    this.logo = img;
    for (const s of [...this.slotsCinema, ...(this.slotsEscritorio || [])]) s?.redesenharCartaz();
    this.escritorio?.setLogo?.(img);
  }

  // tira o prédio inteiro: objetos (e a memória deles na placa), colisões, telas e telões
  desmontarEscritorio() {
    if (!this.escritorio) return;
    this.ligarArea('escritorio', false);
    for (const o of this.areas.get('escritorio').objetos) {
      this.scene.remove(o);
      o.traverse((x) => {
        x.geometry?.dispose();
        for (const m of [].concat(x.material || [])) {
          // o cartaz de monitor desligado (e a textura dele) é de todos: apagar aqui só faria
          // subir de novo na próxima montagem
          if (m.userData.compartilhado) continue;
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    this.areas.delete('escritorio');
    for (const s of [...this.slotsEscritorio, ...this.telaoesEscritorio]) {
      s.dispose();
      s.group.removeFromParent(); // na cena ou na caixa da sala
    }
    for (const c of this.salas3d || []) c.caixa.removeFromParent();
    this.salas3d = null;
    this.maskSalas = -1;
    this.telaoes = this.telaoes.filter((t) => !this.telaoesEscritorio.includes(t));
    this.slotsEscritorio = [];
    this.telaoesEscritorio = [];
    this.escritorio = null;
    this.planta = null;
    this.luzesMudaram();
    this.sombraSuja = true;
  }

  // onde a pessoa nasce e para onde volta (R)
  entrada() {
    return this.escritorio?.entrada || SPAWN;
  }

  // em que sala do escritório está um ponto (id do departamento, 'corredor', 'recepcao'...) ou null
  salaEm(x, z) {
    return this.planta ? salaEm(this.planta, x, z) : null;
  }

  // posto de trabalho de que a tela N faz parte ({ id, sala, ... }) ou null
  postoDaTela(i) {
    return this.planta ? postoDaTela(this.planta, i) : null;
  }

  // lugar para sentar (cadeira, sofá do escritório) mais perto de x/z, até `raio` metros
  assentoPerto(x, z, raio = 1.1) {
    let melhor = null;
    let dm = raio * raio;
    for (const a of this.escritorio?.assentos || []) {
      const d = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d < dm) {
        dm = d;
        melhor = a;
      }
    }
    return melhor;
  }

  // nome da tela N ("TI · Tela 2" no escritório, "Tela 3" no cinema)
  rotuloTela(i) {
    return this.planta ? rotuloDaTela(this.planta, i) : `Tela ${i + 1}`;
  }

  // chave que não muda com os departamentos ("ti:4"), para a página fixa; monitor de posto: null
  chaveTela(i) {
    return chaveDaTela(this.modo === 'escritorio' ? this.planta : null, i);
  }

  telaoVisivel(t) {
    return !!t && t.group.visible && !t.group.userData.areaDesligada;
  }

  // -------------------------------------------------------------- áreas
  // Uma área é tudo o que um pedaço do mundo criou: objetos na cena, colisões e luzes. O dono da
  // sala pode desligar um jogo inteiro (ringue, pista, parkour, mesas): some da vista e deixa de
  // ter parede invisível. Captura o que construir() acrescentou na cena e no grupo de fora.
  area(nome, construir) {
    const cena = new Set(this.scene.children);
    const fora = new Set(this.fora.children);
    const nColisoes = this.colliders.length;
    const nBloqueios = this.cameraBlockers.length;
    const r = construir();
    const a = this.areas.get(nome) || { objetos: [], colisoes: [], bloqueios: [], ligada: true };
    a.objetos.push(...this.scene.children.filter((o) => !cena.has(o)), ...this.fora.children.filter((o) => !fora.has(o)));
    a.colisoes.push(...this.colliders.slice(nColisoes));
    a.bloqueios.push(...this.cameraBlockers.slice(nBloqueios));
    this.areas.set(nome, a);
    this.luzesMudaram(); // o que nasceu pode ter trazido luz
    return r;
  }

  ligarArea(nome, ligar) {
    const a = this.areas.get(nome);
    if (!a || a.ligada === ligar) return false;
    a.ligada = ligar;
    for (const o of a.objetos) {
      o.visible = ligar;
      // marca tudo dentro: luzes e placas que outro código liga sozinho respeitam isso
      o.traverse((x) => { x.userData.areaDesligada = !ligar; });
    }
    if (ligar) {
      this.colliders.push(...a.colisoes);
      this.cameraBlockers.push(...a.bloqueios);
    } else {
      const sai = new Set([...a.colisoes, ...a.bloqueios]);
      this.colliders = this.colliders.filter((c) => !sai.has(c));
      this.cameraBlockers = this.cameraBlockers.filter((m) => !sai.has(m));
    }
    // o laço acima acende até o holofote do ringue; ele segue o nível (quem chama recompila)
    this.aplicarLuzRingue();
    this.sombraSuja = true;
    return true;
  }

  // -------------------------------------------------------------- qualidade
  // luzes: quantas luzes pontuais ficam acesas (luzesEscritorio: o teto no modo escritório);
  // sombra: tamanho do mapa (0 = sem sombra: aí a sombra redonda sob as pessoas); pixelMax: teto da
  // densidade de pixels; densidade: fração da vegetação de longe; sombraArvores: árvores, torcida e
  // pneus fazem sombra; videoFps: teto de quadros das telas no 3D; holofote: o cone do ringue;
  // luzSimples: luz direta em Lambert (ver o começo do arquivo). Nível sem os campos novos: como era.
  setQualidade({ luzes, luzesEscritorio = luzes, sombra, pixelMax, densidade, sombraArvores, videoFps, holofote = true, luzSimples = false }, { aquecer = true } = {}) {
    this.luzesPorModo = { lazer: luzes, escritorio: Math.min(luzes, luzesEscritorio) };
    const maxLuzes = this.luzesDoModo();
    // número de luzes, sombra ligada, holofote e luz simples fazem parte do shader: mudou, pré-compila
    // de novo (só os programas: malhas e texturas já estão na placa)
    let recompila = maxLuzes !== this.maxLuzes || (sombra > 0) !== this.renderer.shadowMap.enabled;
    this.maxLuzes = maxLuzes;
    const ligar = sombra > 0;
    let trocaShader = false;
    if (ligar !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = ligar;
      this.sun.castShadow = ligar;
      trocaShader = true;
    }
    if (luzSimples !== this.luzSimples) {
      this.luzSimples = luzSimples;
      luzSimplesLigada = luzSimples;
      if (LUZ_SIMPLES_OK) trocaShader = recompila = true;
    }
    // ligar/desligar sombra (ou a luz simples) muda o shader de todos os materiais
    if (trocaShader) {
      this.scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) m.needsUpdate = true;
      });
    }
    if (ligar && this.sun.shadow.mapSize.x !== sombra) {
      this.sun.shadow.mapSize.set(sombra, sombra);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null; // o three cria de novo no tamanho novo
    }
    // trocar o tamanho zera o mapa e religar começa sem ele: refaz já, senão a cena fica escura.
    // Abaixo de 2048 (Média), gente de longe refaz a sombra a cada 2 quadros.
    this.sombraLeve = ligar && sombra < 2048;
    this.marcarSombra();
    this.sombrasRedondas.visible = !ligar;
    for (const m of this.sombraOpcional) m.castShadow = sombraArvores;
    this.holofoteNivel = holofote;
    if (this.aplicarLuzRingue()) recompila = true;
    this.pixelMax = pixelMax;
    this.aplicarResolucao();
    this.natureza?.ajustar({ densidade, sombras: sombraArvores });
    this.videoFps = videoFps;
    if (recompila && aquecer) this.aquecerShaders({ malhas: false });
  }

  // teto de luzes pontuais do modo atual (ver setQualidade)
  luzesDoModo() {
    return this.luzesPorModo?.[this.modo] ?? 8;
  }

  setEscala(e) {
    this.escala = e;
    this.aplicarResolucao();
  }

  aplicarResolucao() {
    const pr = Math.min(window.devicePixelRatio, this.pixelMax) * this.escala;
    if (Math.abs(pr - this.renderer.getPixelRatio()) > 0.01) this.renderer.setPixelRatio(pr);
  }

  // Cada luz pontual custa em todo pixel de material padrão, e são vinte e poucas (postes da
  // pista, cinema, mesas, brilho do xadrez). Só as mais perto da câmera ficam acesas — sempre
  // exatamente maxLuzes, porque mudar a quantidade faz o three recompilar todos os shaders
  // (engasgo de segundos). A última da lista vai apagando conforme a próxima se aproxima, para a
  // troca não piscar. A cor é que escurece (a intensidade é animada por quem criou a luz).
  // A lista das luzes da cena é guardada: refeita quando alguma entra ou sai (luzesMudaram) e, por
  // garantia, a cada 120 quadros. Varrer a cena toda a cada quadro era o que custava.
  atualizarLuzes() {
    if (!this._luzes || ++this.quadrosLuzes >= 120) {
      this.quadrosLuzes = 0;
      const luzes = [];
      this.scene.traverse((o) => { if (o.isPointLight) luzes.push({ luz: o, d: 0 }); });
      this._luzes = luzes;
    }
    const cam = this.camera.position;
    const vivas = this.luzesVivas;
    vivas.length = 0;
    for (const item of this._luzes) {
      const o = item.luz;
      // luz de um jogo desligado pelo dono da sala: apagada de vez
      if (o.userData.areaDesligada) {
        o.visible = false;
        continue;
      }
      // luz dentro de um grupo escondido já está apagada para o three, e a que saiu da cena não
      // existe mais: as duas ficam de fora da conta
      let p = o.parent;
      while (p && p !== this.scene && p.visible) p = p.parent;
      if (p !== this.scene) continue;
      if (!o.userData.cor) o.userData.cor = o.color.clone();
      item.d = o.getWorldPosition(_tmp).distanceTo(cam);
      vivas.push(item);
    }
    vivas.sort(porDistancia);
    const n = Math.min(this.maxLuzes, vivas.length);
    const proxima = vivas[n]?.d ?? Infinity;
    for (let i = 0; i < vivas.length; i++) {
      const { luz, d } = vivas[i];
      luz.visible = i < n;
      const f = i < n ? THREE.MathUtils.clamp((proxima - d) / 12, 0, 1) : 0;
      luz.color.copy(luz.userData.cor).multiplyScalar(f);
    }
  }

  // Uma luz pontual entrou ou saiu da cena (área nova, prédio desmontado, o brilho da promoção no
  // xadrez): a lista de atualizarLuzes é refeita no próximo quadro.
  luzesMudaram() {
    this._luzes = null;
  }

  // Altura (em pixels da janela) com que uma tela aparece agora: 0 se está fora da vista, de
  // costas ou escondida (sala do escritório que a câmera não vê, lado de fora atrás da parede).
  // Leva em conta a distância e o ângulo (de lado, ela encolhe). Sem alocar e sem ler o layout:
  // roda por tela, por quadro.
  alturaAparente(s) {
    const cam = this.camera;
    if (!s.group.visible || s.group.parent?.visible === false) return 0;
    // de costas para a câmera não aparece
    s.surface.getWorldPosition(_tmp);
    s.surface.getWorldQuaternion(_quat);
    if (_tmp3.set(0, 0, 1).applyQuaternion(_quat).dot(_tmp2.copy(cam.position).sub(_tmp)) <= 0) return 0;
    // os 4 cantos no espaço da câmera, recortados no plano da frente dela (o pedaço atrás da
    // câmera não aparece), projetados na imagem: mede o pedaço que cai dentro dela. Os cortes
    // saem antes de projetar.
    for (let i = 0; i < 4; i++) {
      _cantos[i].set((CANTOS[i][0] * s.w) / 2, (CANTOS[i][1] * s.h) / 2, 0)
        .applyMatrix4(s.surface.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
    }
    const plano = -cam.near * 1.01;
    _naFrente.length = 0;
    let cortes = 0;
    for (let i = 0; i < 4; i++) {
      const a = _cantos[i];
      const b = _cantos[(i + 1) % 4];
      const aDentro = a.z <= plano;
      if (aDentro) _naFrente.push(a);
      if (aDentro !== (b.z <= plano)) _naFrente.push(_cortes[cortes++].copy(a).lerp(b, (plano - a.z) / (b.z - a.z)));
    }
    if (!_naFrente.length) return 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < _naFrente.length; i++) {
      const v = _naFrente[i].applyMatrix4(cam.projectionMatrix);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    const vx = Math.min(1, x1) - Math.max(-1, x0);
    const vy = Math.min(1, y1) - Math.max(-1, y0);
    if (vx <= 0 || vy <= 0) return 0;
    return (vy / 2) * this.alturaTela;
  }

  // prepara o frustum da câmera (antes de alturaAparente)
  prepararVista() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m4);
  }

  // Uma vez por quadro, com a câmera deste quadro: o frustum (naVista, escondido), o lado de fora e
  // as salas do escritório. O laço chama antes dos bonecos; render() chama de novo (é barato).
  prepararQuadro() {
    this.prepararVista();
    this.cullFora();
    this.cullSalas();
  }

  // a esfera (de mundo) está na vista da câmera deste quadro? (depois de prepararQuadro)
  naVista(esfera) {
    return _frustum.intersectsSphere(esfera);
  }

  // Alguém em p que a câmera não tem como ver: do lado de fora com a câmera dentro do cinema ou do
  // prédio sem a porta à vista, ou numa sala do escritório escondida (cullSalas). Na soleira de
  // uma sala (perto da linha da porta) conta como corredor. Depois de prepararQuadro.
  escondido(p) {
    const L = this.escritorio?.limites || SALA;
    if (!this.fora.visible && (p.x < L.minX || p.x > L.maxX || p.z < L.minZ || p.z > L.maxZ)) return true;
    const salas = this.salas3d;
    if (!salas?.length || p.y >= PREDIO.altura - 1) return false;
    for (let i = 0; i < salas.length; i++) {
      const s = salas[i];
      if (p.x < s.x0 || p.x > s.x1 || p.z < s.z0 || p.z > s.z1) continue;
      return ((this.maskSalas >> i) & 1) === 0 && Math.abs(p.z - zDaPorta(s.lado)) >= 1.2;
    }
    return false;
  }

  // Interesse de vídeo, uma vez por rodada (250 ms): a vista e as caixas do que barra a câmera
  // agora, que valem até o fim desta tarefa (alturaDaTela e tapada da rodada). Sem cache entre
  // rodadas: paredes e salas mudam.
  prepararInteresse() {
    this.prepararVista();
    this.montarCaixas();
    this.caixasProntas = true;
    queueMicrotask(() => { this.caixasProntas = false; });
  }

  // Caixas (de mundo) de tudo que barra a câmera e está de pé agora: visível até a cena (uma
  // parede de um prédio desmontado fica de fora). Todo bloqueio é caixa alinhada ou cilindro
  // (paredes, pilares, postes, camarote), então a caixa é a forma dele.
  montarCaixas() {
    const caixas = this.caixasBloqueio;
    let n = 0;
    for (const m of this.cameraBlockers) {
      let o = m;
      while (o && o !== this.scene && o.visible) o = o.parent;
      if (o !== this.scene) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.updateWorldMatrix(false, false);
      if (!caixas[n]) caixas[n] = new THREE.Box3();
      caixas[n++].copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    }
    this.nCaixas = n;
  }

  // Tem parede (as que barram a câmera; vidro não conta) entre a câmera e a tela? Testa o
  // centro e quatro pontos perto dos cantos: basta um livre para a tela contar como vista.
  // Raio contra as caixas de montarCaixas; a caixa que contém a câmera não conta (de dentro, o
  // raio não bate na face de trás, como no raycast).
  tapada(s) {
    if (!this.caixasProntas) this.montarCaixas();
    const n = this.nCaixas;
    if (!n) return false;
    const cam = this.camera.position;
    const raio = _raio.ray;
    for (const [cx, cy] of PONTOS_TELA) {
      _tmp.set(cx * s.w * 0.4, cy * s.h * 0.4, 0).applyMatrix4(s.surface.matrixWorld);
      const ate = _tmp.distanceTo(cam) - 0.3;
      raio.origin.copy(cam);
      raio.direction.copy(_tmp).sub(cam).normalize();
      let livre = true;
      for (let i = 0; i < n; i++) {
        const b = this.caixasBloqueio[i];
        if (b.containsPoint(cam)) continue;
        if (raio.intersectBox(b, _tmp2) && _tmp2.distanceTo(cam) < ate) {
          livre = false;
          break;
        }
      }
      if (livre) return false;
    }
    return true;
  }

  // Maior altura aparente (px da janela) das telas que mostram o compartilhamento key, sem contar
  // a tela fazendo as vezes de telão e as tapadas por parede. 0 se nenhuma aparece. O main põe o
  // dono (owner) na tela antes de o vídeo chegar: o primeiro pedido já sai certo.
  alturaDaTela(key) {
    let maior = 0;
    for (const s of this.screens || []) {
      if (s.owner !== key || s.midia) continue;
      const px = this.alturaAparente(s);
      if (px > maior && !this.tapada(s)) maior = px;
    }
    return maior;
  }

  // Maior altura aparente entre as telas do 3D que mostram este <video> (telão incluído).
  alturaDoVideo(video) {
    let maior = 0;
    for (const s of this.screens || []) {
      if (s.video !== video) continue;
      const px = this.alturaAparente(s);
      if (px > maior && !this.tapada(s)) maior = px;
    }
    return maior;
  }

  // Quadros das telas compartilhadas no 3D. A que aparece grande (de perto, de frente) sobe a 60
  // sempre, qualquer que seja a qualidade gráfica; as menores, no ritmo da qualidade; as que
  // aparecem minúsculas, bem menos. Fora da vista não sobe nada (é o que mais pesa).
  // Depois de prepararQuadro (a câmera do quadro).
  atualizarTelas() {
    const agora = performance.now();
    const base = 1000 / this.videoFps;
    for (const s of this.screens || []) {
      if (!s.texture) continue;
      const px = this.alturaAparente(s);
      if (px <= 0) continue;
      const intervalo = px >= 240 ? 1000 / 60 : px >= 90 ? base : px >= 40 ? Math.max(base, 1000 / 20) : 1000 / 8;
      s.texture.atualizar(agora, intervalo - 2); // 2 ms de folga: quadro de 16,6 ms não pode cair para 30 fps
    }
  }

  // Dentro da sala do cinema, só a porta deixa ver o lado de fora; dentro do prédio do escritório,
  // a fachada de vidro (voando acima do telhado, o parque aparece). Usa o frustum do quadro.
  cullFora() {
    const p = this.camera.position;
    const E = this.escritorio;
    const L = E?.limites || SALA; // no modo escritório, o prédio do escritório
    let dentro = p.x > L.minX && p.x < L.maxX && p.z > L.minZ && p.z < L.maxZ;
    if (dentro && E) dentro = p.y < (p.x >= PREDIO.recepcao ? (L.alturaRecepcao ?? 10) : (L.altura ?? PREDIO.altura));
    let ver = !dentro;
    if (dentro) {
      ver = _frustum.intersectsBox(E?.porta || this.portaBox);
      // numa sala ou num corredor, a fachada só aparece pelo portal daquele corredor
      const portal = ver && E ? this.portalDaCamera(p) : null;
      if (portal) ver = _frustum.intersectsBox(portal);
    }
    if (ver === this.fora.visible) return;
    this.fora.visible = ver;
    this.sombraSuja = true; // árvores e torcida entram (ou saem) do mapa de sombra
  }

  // O portal (da recepção para um corredor) por onde a câmera, numa sala ou num corredor do
  // escritório, veria a recepção e a fachada; null fora deles. Lugares encolhidos 0,5 m: na
  // soleira de uma porta não conta, e o teste fica só o da fachada, mais folgado.
  portalDaCamera(p) {
    const port = this.escritorio.portais;
    const P = this.planta;
    if (!port || !P) return null;
    const R = PREDIO.recepcao;
    const [c0, c1] = PREDIO.corredor;
    const [f0, f1] = PREDIO.corredorFundos;
    if (dentroDe(p, P.minX, R, c0, c1, -0.5)) return port.principal;
    if (P.fundos && dentroDe(p, P.minX, R, f0, f1, -0.5)) return port.fundos;
    for (const s of this.salas3d || []) {
      if (dentroDe(p, s.x0, s.x1, s.z0, s.z1, -0.5)) return s.lado === 'fundos' ? port.fundos : port.principal;
    }
    return null;
  }

  // Salas do escritório que a câmera pode ver. As frentes de vidro de uma fileira ficam no mesmo
  // plano, e uma reta não cruza esse plano duas vezes: de uma sala do norte ou do sul vê-se ela e as
  // do outro lado do corredor (nunca as vizinhas, atrás das divisórias); dos fundos, só ela; do
  // corredor, as fileiras dele; da recepção ou de fora, o que o portal de cada corredor deixar. Da
  // altura do forro para cima, todas (vê-se por cima das divisórias). Folga de 0,5 m: perto de uma
  // divisa, junta o que os dois lados veem. Só mexe na cena quando o conjunto muda.
  cullSalas() {
    const salas = this.salas3d;
    if (!salas?.length) return;
    const c = this.camera.position;
    const B = this.bitsLado;
    const todas = (1 << salas.length) - 1;
    let mask = 0;
    if (c.y >= PREDIO.altura - 0.2) mask = todas;
    else {
      const P = this.planta;
      const R = PREDIO.recepcao;
      const [c0, c1] = PREDIO.corredor;
      const [f0, f1] = PREDIO.corredorFundos;
      let achou = false;
      for (let i = 0; i < salas.length; i++) {
        const s = salas[i];
        if (!dentroDe(c, s.x0, s.x1, s.z0, s.z1, 0.5)) continue;
        achou = true;
        mask |= (1 << i) | (s.lado === 'norte' ? B.sul : s.lado === 'sul' ? B.norte : 0);
      }
      if (dentroDe(c, P.minX, R, c0, c1, 0.5)) {
        achou = true;
        mask |= B.norte | B.sul;
      }
      if (P.fundos && dentroDe(c, P.minX, R, f0, f1, 0.5)) {
        achou = true;
        mask |= B.fundos;
      }
      // recepção, lado de fora, a porta: só pelos portais
      if (!achou || c.x > R - 0.5) {
        const port = this.escritorio.portais;
        if (!port) mask = todas;
        else {
          if (port.principal && _frustum.intersectsBox(port.principal)) mask |= B.norte | B.sul;
          if (port.fundos && _frustum.intersectsBox(port.fundos)) mask |= B.fundos;
        }
      }
    }
    if (mask === this.maskSalas) return;
    this.maskSalas = mask;
    for (let i = 0; i < salas.length; i++) {
      const v = ((mask >> i) & 1) === 1;
      if (salas[i].grupo) salas[i].grupo.visible = v;
      salas[i].caixa.visible = v;
    }
    this.marcarSombra();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.alturaTela = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aplicarResolucao(); // o zoom da página muda a densidade de pixels junto
    this.renderer.setSize(w, h);
    this.css.setSize(w, h);
  }

  render() {
    if (this.compilando || this.perdido) return; // ver aquecerShaders: o quadro anterior fica na tela
    // o laço anima o cenário antes (animar); se não animou, anima agora
    if (!this.animado) this.animar(this.tempo);
    this.animado = false;
    this.natureza?.seguirCamera(this.camera, performance.now() / 1000);
    this.atualizarTelao();
    this.prepararQuadro();
    this.atualizarLuzes(); // depois do cullFora: ele esconde grupos, e luz escondida não conta
    this.atualizarTelas();
    for (const label of this.fadeLabels) {
      if (label.userData.areaDesligada) {
        label.visible = false;
        continue;
      }
      label.getWorldPosition(_tmp);
      const d = _tmp.distanceTo(this.camera.position);
      label.material.opacity = THREE.MathUtils.clamp((d - 5) / 5, 0, 1);
      label.visible = label.material.opacity > 0.01;
    }
    this.atualizarSombra();
    const medindo = this.medirGpu && this.comecarGpu();
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      if (medindo) this.terminarGpu();
    }
    // logo depois do desenho principal: os quadros 4x4 do aquecimento usam o mesmo contador
    const info = this.renderer.info.render;
    this.ultimoQuadro.draws = info.calls;
    this.ultimoQuadro.triangulos = info.triangles;
    // CSS3D (player do telão, navegadores) só com algo à mostra; o quadro a mais esconde o último
    // que sumiu
    let cssAtivo = false;
    for (let i = 0; i < this.cssScene.children.length && !cssAtivo; i++) cssAtivo = this.cssScene.children[i].visible;
    if (cssAtivo || this.cssAntes) this.css.render(this.cssScene, this.camera);
    this.cssAntes = cssAtivo;
  }

  // Tempo de GPU do desenho principal (?perf=1): uma consulta de tempo em voo, lida nos quadros
  // seguintes, quando a placa terminar. Só existe no Chrome de PC (EXT_disjoint_timer_query_webgl2);
  // sem ela, gpuMs fica 0. Devolve se começou a medir este quadro.
  comecarGpu() {
    const gl = this.renderer.getContext();
    if (this.extGpu === undefined) this.extGpu = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const ext = this.extGpu;
    if (!ext) return false;
    if (this.consultaGpu) {
      if (!gl.getQueryParameter(this.consultaGpu, gl.QUERY_RESULT_AVAILABLE)) return false;
      // disjunto: a placa mudou de ritmo (ou outro programa entrou no meio) e a medida não vale
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) this.ultimoQuadro.gpuMs = gl.getQueryParameter(this.consultaGpu, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(this.consultaGpu);
    }
    this.consultaGpu = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, this.consultaGpu);
    return true;
  }

  terminarGpu() {
    this.renderer.getContext().endQuery(this.extGpu.TIME_ELAPSED_EXT);
  }

  // -------------------------------------------------------------- sombra redonda
  // Sem mapa de sombra (celular, Leve): uma mancha macia no chão sob cada pessoa, todas numa malha
  // instanciada (um desenho só). O laço (main.js) passa cada boneco por sombraDe e fecha a conta.
  criarSombrasRedondas(max = 96) {
    // textura própria (a da vitrine é liberada quando ela fecha)
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const malha = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
      max,
    );
    malha.count = 0;
    malha.frustumCulled = false;
    malha.visible = !this.renderer.shadowMap.enabled;
    this.scene.add(malha);
    this.sombrasRedondas = malha;
    this.maxSombrasRedondas = max;
  }

  // topo do colisor mais alto embaixo de (x, z) que não passa de y (o chão de quem está no ar)
  chaoEm(x, y, z) {
    let topo = Math.min(0, y);
    for (const c of this.colliders) {
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
      if (c.max.y <= y + 0.05 && c.max.y > topo) topo = c.max.y;
    }
    return topo;
  }

  // Põe a sombra do boneco av na posição i e devolve a próxima. Nada para quem não aparece ou está
  // sentado (anim 4 é o sentado que vem pela rede); no ar, a mancha fica no chão e encolhe com a
  // altura; o carro, comprida.
  sombraDe(i, av, noAr) {
    if (i >= this.maxSombrasRedondas || !av.inner.visible || av.anim === 4 || av.sitting) return i;
    const p = av.group.position;
    let chao = p.y;
    let k = 1;
    if (noAr) {
      chao = this.chaoEm(p.x, p.y, p.z);
      k = Math.max(0.4, 1 - (p.y - chao) / 5);
    }
    if (av.veiculo) _escala.set(1.5 * k, 1, 2.4 * k);
    else _escala.set(k, 1, k);
    _quat.setFromAxisAngle(_eixoY, av.inner.rotation.y);
    this.sombrasRedondas.setMatrixAt(i, _mSombra.compose(_tmp.set(p.x, chao + 0.02, p.z), _quat, _escala));
    return i + 1;
  }

  // quantas sombras sombraDe pôs neste quadro
  fecharSombrasRedondas(n) {
    this.sombrasRedondas.count = n;
    this.sombrasRedondas.instanceMatrix.needsUpdate = true;
  }
}
