// O 3D do mundo novo ("Praça central", ver mundo.js e cidade-dados.js): a praça na porta do prédio,
// com fonte, bancos, canteiros e cerca viva; as ruas de pedra com postes até cada área; os pórticos
// com o nome de cada uma; placas nas saídas da praça e um mapa "você está aqui" de frente para quem
// sai do prédio. As atrações em si (autódromo, mesas, portais...) são as de sempre, só que nos
// lugares de cidade-dados.js. Chamado pelo World antes do autódromo e da natureza: as ruas entram
// em world.estradas (o guard-rail abre passagem, a natureza não planta em cima) e as árvores em
// fileira vão para a natureza, que as desenha junto com as outras.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PRACA, RUAS, PRACA_JOGOS, PRACA_AVENTURA, MIRANTE, LAGO, PORTICOS, PLACAS, NOMES_DO_MAPA, BOSQUES, MESAS_NOVO,
} from './cidade-dados.js';
import { PISTA, CAMINHO, pontoEm } from './pista.js';
import { ESTADIO } from './futebol.js';
import { VOLEI, BASQUETE, BOLICHE } from './quadras-fisica.js';
import { SURF } from './ceu-dados.js';
import { PARQUE, RUAS_PARQUE, SALAO, QUEIMADA, PINTA_ARENA, GOLFE_AREA, KART_AREA } from './parque-dados.js';
import * as moduloQualidade from './qualidade.js';

const ESC = moduloQualidade.ESCALA_TEXTURA ?? 1;
const FONTE = (px, peso = 800) => `${peso} ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;
// alturas dos pisos: cada um um pouco acima do outro, para não piscarem onde se cruzam
const Y_RUA = 0.05;
const Y_PRACA = 0.07;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const CIMA = new THREE.Vector3(0, 1, 0);

// canvas desenhado em w x h lógicos (o canvas de verdade encolhe no celular: ESCALA_TEXTURA)
function textura(w, h, desenhar, { repetir = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * ESC));
  cv.height = Math.max(1, Math.round(h * ESC));
  const ctx = cv.getContext('2d');
  ctx.scale(ESC, ESC);
  desenhar(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repetir) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// várias geometrias numa malha só (um desenho)
export function fundir(geos, mat, { sombra = false, recebe = false } = {}) {
  const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
  for (const g of geos) g.dispose();
  m.castShadow = sombra;
  m.receiveShadow = recebe;
  return m;
}

// geometria posta no lugar: (geo, x, y, z, giroY)
const no = (geo, x, y, z, giro = 0) => geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1)));

// Peças do mesmo material entram num lote e viram uma malha só no fim (construirCidade): o ferro
// escuro (postes, pés de banco, corrimão, pilares, hastes de placa), a madeira dos bancos e o fundo
// escuro das placas e do mapa. Cada lote é um desenho a menos por peça.
export const novosLotes = () => ({ ferro: [], madeira: [], escuro: [] });

// cor por vértice, para juntar peças de cores diferentes num desenho só
function pintar(geo, cor) {
  const c = new THREE.Color(cor);
  const n = geo.attributes.position.count;
  const cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cores.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geo;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ------------------------------------------------------------------ texturas
// pedra das ruas: u atravessa a rua (faixa escura nas duas beiradas), v vai ao longo
function texturaRua() {
  const tex = textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a69d8f';
    ctx.fillRect(0, 0, w, h);
    // lajotas retangulares, em fiadas desencontradas
    for (let y = 0; y < 8; y++) {
      for (let x = -1; x < 6; x++) {
        const tom = 168 + Math.floor(Math.random() * 26);
        ctx.fillStyle = `rgb(${tom},${tom - 7},${tom - 18})`;
        roundRect(ctx, x * 44 + (y % 2) * 22 + 22 + 2, y * 32 + 2, 40, 28, 4);
        ctx.fill();
      }
    }
    // guia de granito escuro nas duas beiradas
    ctx.fillStyle = '#4a4f59';
    ctx.fillRect(0, 0, 18, h);
    ctx.fillRect(w - 18, 0, 18, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(18, 0, 3, h);
    ctx.fillRect(w - 21, 0, 3, h);
  }, { repetir: true });
  return tex;
}

// calçada da praça: ondas pretas e brancas como as do calçadão, em anéis em volta da fonte
function texturaPraca() {
  return textura(1024, 1024, (ctx, w) => {
    const c = w / 2;
    const R = w / 2; // = PRACA.r
    const m = (metros) => (metros / PRACA.r) * R;
    ctx.fillStyle = '#e9e3d6';
    ctx.fillRect(0, 0, w, w);
    // grão das pedrinhas
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(90,80,60,${(Math.random() * 0.07).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * w, 3, 3);
    }
    const onda = (raio, amp, n, larg, cor) => {
      ctx.beginPath();
      for (let i = 0; i <= 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        const r = m(raio + amp * Math.sin(a * n));
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.lineWidth = m(larg);
      ctx.strokeStyle = cor;
      ctx.stroke();
    };
    const anel = (raio, larg, cor) => {
      ctx.beginPath();
      ctx.arc(c, c, m(raio), 0, Math.PI * 2);
      ctx.lineWidth = m(larg);
      ctx.strokeStyle = cor;
      ctx.stroke();
    };
    const escuro = '#2f3a44';
    anel(PRACA.r - 1, 1.6, escuro);
    anel(PRACA.r - 3.2, 0.5, escuro);
    onda(PRACA.r * 0.75, 1.5, 16, 1.6, escuro);
    onda(PRACA.r * 0.62, 1.5, 16, 1.6, escuro);
    anel(PRACA.r * 0.5, 0.45, '#8a6f4e');
    anel(9.2, 1.2, escuro);
    anel(10.6, 0.4, '#8a6f4e');
    // rosa dos ventos em volta da fonte, apontando para as avenidas
    ctx.fillStyle = escuro;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const comp = k % 2 ? 13.5 : 16.5;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * m(comp), c + Math.sin(a) * m(comp));
      ctx.lineTo(c + Math.cos(a + 0.09) * m(10.8), c + Math.sin(a + 0.09) * m(10.8));
      ctx.lineTo(c + Math.cos(a - 0.09) * m(10.8), c + Math.sin(a - 0.09) * m(10.8));
      ctx.closePath();
      ctx.fill();
    }
  });
}

// pracinha de pedra com anéis na cor da área (aventura, mirante)
export function texturaRedonda(cor) {
  return textura(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#d8d1c3';
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(90,80,60,${(Math.random() * 0.07).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * w, 3, 3);
    }
    for (const [r, l, cc] of [[0.95, 0.05, '#3b4450'], [0.78, 0.03, cor], [0.6, 0.02, '#3b4450'], [0.28, 0.05, cor]]) {
      ctx.beginPath();
      ctx.arc(c, c, r * c, 0, Math.PI * 2);
      ctx.lineWidth = l * c;
      ctx.strokeStyle = cc;
      ctx.stroke();
    }
  });
}

function texturaLajotas() {
  return textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8f8a80';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const claro = (x + y) % 2 === 0;
        const tom = (claro ? 196 : 170) + Math.floor(Math.random() * 14);
        ctx.fillStyle = `rgb(${tom},${tom - 6},${tom - 16})`;
        ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    }
  }, { repetir: true });
}

// água da fonte: ondinhas claras que correm devagar (o offset anda no update)
function texturaAgua() {
  return textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f8fc4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(220,245,255,${(0.12 + Math.random() * 0.22).toFixed(2)})`;
      ctx.lineWidth = 2 + Math.random() * 3;
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + Math.random() * 22, 3 + Math.random() * 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, { repetir: true });
}

// cortina de água caindo das bacias: listras verticais que descem
function texturaCortina() {
  return textura(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      const a = (0.25 + Math.random() * 0.5).toFixed(2);
      g.addColorStop(0, `rgba(235,250,255,${a})`);
      g.addColorStop(1, 'rgba(235,250,255,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(x, Math.random() * h * 0.3, 1.5 + Math.random() * 2.5, h);
    }
  }, { repetir: true });
}

export function texturaPlaca(texto, cor, { w = 1024, h = 192, tam = 104 } = {}) {
  return textura(w, h, (ctx) => {
    ctx.fillStyle = '#101826';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, h - 18, w, 18);
    ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(tam);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let t = tam;
    while (ctx.measureText(texto).width > w - 60 && t > 40) ctx.font = FONTE((t -= 4));
    ctx.fillText(texto, w / 2, h / 2 - 6);
  });
}

// ------------------------------------------------------------------ ruas
// a avenida leste vai até a beira da pista, ao lado da arquibancada (mesma entrada do mundo clássico)
function ruasComPista() {
  const meia = PISTA.largura / 2;
  const pj = pontoEm(PISTA.largadaT - 0.012);
  const entrada = [pj.x + Math.cos(pj.angulo) * (meia - 1), pj.z - Math.sin(pj.angulo) * (meia - 1)];
  const ruas = Object.values(RUAS).map((r) => ({ ...r, pontos: r.pontos.map((p) => [...p]) }));
  const leste = ruas.find((r) => r.nome === RUAS.leste.nome);
  leste.pontos.push(entrada);
  return ruas;
}

// uma fita de pedra por trecho reto, com uma rodela de emenda nas curvas
export function construirRuas(g, ruas) {
  const tex = texturaRua();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  const geos = [];
  ruas.forEach((r, ri) => {
    for (let i = 0; i < r.pontos.length - 1; i++) {
      const [x0, z0] = r.pontos[i];
      const [x1, z1] = r.pontos[i + 1];
      const comp = Math.hypot(x1 - x0, z1 - z0);
      const giro = Math.atan2(x1 - x0, z1 - z0);
      const geo = new THREE.PlaneGeometry(r.largura, comp + (i < r.pontos.length - 2 ? r.largura / 2 : 0)).rotateX(-Math.PI / 2);
      // v ao longo da rua, uma lajota a cada ~6 m; u atravessa a rua
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (comp / 6));
      // trechos seguintes ficam um fio acima: onde se sobrepõem não piscam
      const y = Y_RUA + ri * 0.002 + i * 0.001;
      const meio = (comp + (i < r.pontos.length - 2 ? r.largura / 2 : 0)) / 2;
      geos.push(no(geo, x0 + Math.sin(giro) * meio, y, z0 + Math.cos(giro) * meio, giro));
    }
  });
  g.add(fundir(geos, mat, { recebe: true }));
}

// ------------------------------------------------------------------ a praça
// Onde as ruas entram na praça: o ângulo (no plano do chão, x = cos α, z = sin α) e a meia largura
// da rua. A cerca viva abre ali, e canteiros, bancos e postes ficam fora do caminho.
function saidasDaPraca(ruas) {
  const { x: cx, z: cz, r } = PRACA;
  const saidas = [];
  for (const rua of ruas) {
    for (let i = 0; i < rua.pontos.length - 1; i++) {
      const [ax, az] = rua.pontos[i];
      const [bx, bz] = rua.pontos[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const fx = ax - cx;
      const fz = az - cz;
      const a = dx * dx + dz * dz;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - r * r;
      const delta = b * b - 4 * a * c;
      if (delta < 0) continue;
      for (const t of [(-b - Math.sqrt(delta)) / (2 * a), (-b + Math.sqrt(delta)) / (2 * a)]) {
        if (t < 0 || t > 1) continue;
        saidas.push({ a: Math.atan2(az + dz * t - cz, ax + dx * t - cx), meia: rua.largura / 2 });
      }
    }
  }
  return saidas;
}

// o ângulo α, a esta distância do centro da praça, cai no caminho de uma saída (com folga em m)?
const naSaida = (saidas, a, raio, folga) => saidas.some((s) => {
  const d = Math.abs(Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a)));
  return d < Math.asin(Math.min(1, (s.meia + folga) / raio));
});

function construirPraca(g, world, decor, L, saidas) {
  const { x, z, r } = PRACA;
  const piso = new THREE.Mesh(new THREE.CircleGeometry(r, 128).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texturaPraca(), roughness: 0.88 }));
  piso.position.set(x, Y_PRACA, z);
  piso.receiveShadow = true;
  g.add(piso);
  construirFonte(g, world, decor);

  // canteiros floridos em volta da fonte (4 arcos, abertos onde a rosa dos ventos aponta)
  const terra = [];
  const borda = [];
  const flores = [];
  const cores = ['#f472b6', '#facc15', '#fb923c', '#a78bfa', '#f87171', '#fde68a'];
  // canteiros em arco entre uma saída e a seguinte (o caminho da fonte até cada rua fica livre);
  // arco grande demais vira dois, com uma passagem no meio
  const R_CANTEIRO = 13.5;
  const ordem = [...saidas].sort((p, q) => p.a - q.a);
  const arcos = [];
  ordem.forEach((s, i) => {
    const prox = ordem[(i + 1) % ordem.length];
    const de = s.a + Math.asin(Math.min(1, (s.meia + 2.5) / R_CANTEIRO));
    let ate = prox.a - Math.asin(Math.min(1, (prox.meia + 2.5) / R_CANTEIRO));
    while (ate <= de) ate += Math.PI * 2;
    const vao = 0.35;
    const partes = ate - de > (Math.PI * 2) / 3 ? 2 : 1;
    const cada = (ate - de - vao * (partes - 1)) / partes;
    for (let k = 0; k < partes; k++) arcos.push([de + k * (cada + vao), cada]);
  });
  // ângulo α no plano do chão: x = cos α, z = sin α (0 = leste, π/2 = norte)
  for (const [a0, comp] of arcos) {
    // o anel deitado (rotateX -90°) leva o θ do RingGeometry para α = -θ
    const arco = (r0, r1, h) => new THREE.RingGeometry(r0, r1, 24, 1, -(a0 + comp), comp).rotateX(-Math.PI / 2).translate(x, h, z);
    // no CylinderGeometry x = r sen θ e z = r cos θ: α = π/2 - θ
    const parede = (rr) => new THREE.CylinderGeometry(rr, rr, 0.45, 32, 1, true, Math.PI / 2 - a0 - comp, comp).translate(x, 0.225 + Y_PRACA, z);
    borda.push(parede(15), parede(12), arco(14.7, 15.2, 0.46 + Y_PRACA), arco(11.8, 12.3, 0.46 + Y_PRACA));
    terra.push(arco(12.2, 14.8, 0.4 + Y_PRACA));
    for (let i = 0; i < Math.round(comp * 45); i++) {
      const a = a0 + Math.random() * comp;
      const rr = 12.5 + Math.random() * 2;
      flores.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, cor: cores[Math.floor(Math.random() * cores.length)] });
    }
  }
  g.add(
    fundir(borda, new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.85, side: THREE.DoubleSide }), { recebe: true }),
    fundir(terra, new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), { recebe: true }),
  );
  plantarFlores(g, flores, 0.55 + Y_PRACA);

  // bancos de frente para a fonte, nos quatro cantos da praça
  const bancos = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    if (naSaida(saidas, a, 21, 2)) continue;
    bancos.push({ x: x + Math.cos(a) * 21, z: z + Math.sin(a) * 21, giro: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  construirBancos(L, world, bancos);

  // cerca viva na beirada, aberta onde as ruas chegam
  const sebe = [];
  const passos = Math.round((Math.PI * 2 * r) / 3.3);
  for (let i = 0; i < passos; i++) {
    const a = (i / passos) * Math.PI * 2;
    if (naSaida(saidas, a, r, 3)) continue;
    const ax = x + Math.cos(a) * (r - 0.4);
    const az = z + Math.sin(a) * (r - 0.4);
    const comp = ((Math.PI * 2 * (r - 0.4)) / passos) * 1.08;
    // o comprimento (z local) vai na tangente do círculo: (-sen α, cos α)
    const giro = Math.atan2(-Math.sin(a), Math.cos(a));
    sebe.push(no(new THREE.BoxGeometry(1.3, 1.1, comp), ax, 0.55, az, giro));
    // colisor: a caixa que cobre o trecho girado (sem vão entre um trecho e o outro)
    const hx = Math.abs(Math.cos(giro)) * 0.65 + Math.abs(Math.sin(giro)) * comp / 2;
    const hz = Math.abs(Math.sin(giro)) * 0.65 + Math.abs(Math.cos(giro)) * comp / 2;
    world.addBox({ min: [ax - hx, 0, az - hz], max: [ax + hx, 1.1, az + hz] });
  }
  g.add(fundir(sebe, new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.95 }), { sombra: true, recebe: true }));
}

export function plantarFlores(g, flores, y) {
  const geo = new THREE.IcosahedronGeometry(0.22, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const malha = new THREE.InstancedMesh(geo, mat, flores.length);
  const cor = new THREE.Color();
  flores.forEach((f, i) => {
    malha.setMatrixAt(i, _m.compose(_p.set(f.x, y, f.z), _q.identity(), _s.setScalar(0.8 + Math.random() * 0.6)));
    malha.setColorAt(i, cor.set(f.cor));
  });
  // folhagem embaixo das flores
  const folhas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x3e7d3a, roughness: 0.9, flatShading: true }), flores.length);
  flores.forEach((f, i) => folhas.setMatrixAt(i, _m.compose(_p.set(f.x + 0.2, y - 0.25, f.z - 0.1), _q.identity(), _s.set(1, 0.6, 1))));
  g.add(malha, folhas);
}

// fonte de três bacias: a de baixo, larga, com a água ondulando; duas taças em cima, com a água
// caindo em cortina de uma para a outra, e um jato no alto
function construirFonte(g, world, decor) {
  const { x, z } = PRACA;
  const pedra = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.6 });
  const perfil = (pts) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 64);
  const partes = [
    perfil([[6.6, 0], [7.4, 0], [7.45, 0.75], [7.2, 0.9], [6.5, 0.9], [6.35, 0.75], [6.35, 0.3]]).translate(x, Y_PRACA, z),
    new THREE.CylinderGeometry(0.75, 1, 1.8, 24).translate(x, 0.9, z),
    perfil([[0.6, 1.6], [2.8, 2.05], [3.05, 2.3], [2.95, 2.4], [2.5, 2.25], [0.5, 2.0]]).translate(x, 0, z),
    new THREE.CylinderGeometry(0.4, 0.55, 1.6, 20).translate(x, 2.9, z),
    perfil([[0.35, 3.5], [1.55, 3.8], [1.7, 4.0], [1.6, 4.08], [1.3, 3.95], [0.3, 3.75]]).translate(x, 0, z),
    new THREE.SphereGeometry(0.32, 16, 10).translate(x, 4.35, z),
  ];
  g.add(fundir(partes, pedra, { sombra: true, recebe: true }));

  const agua = texturaAgua();
  agua.repeat.set(3, 3);
  const matAgua = new THREE.MeshStandardMaterial({ map: agua, color: 0xbfe6ff, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.88 });
  const espelhos = [
    new THREE.CircleGeometry(6.4, 64).rotateX(-Math.PI / 2).translate(x, 0.62 + Y_PRACA, z),
    new THREE.CircleGeometry(2.75, 48).rotateX(-Math.PI / 2).translate(x, 2.28, z),
    new THREE.CircleGeometry(1.45, 40).rotateX(-Math.PI / 2).translate(x, 3.98, z),
  ];
  g.add(fundir(espelhos, matAgua, { recebe: true }));

  const cortina = texturaCortina();
  const matCortina = new THREE.MeshBasicMaterial({ map: cortina, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe6f7ff });
  const quedas = [
    new THREE.CylinderGeometry(3.0, 3.25, 1.7, 48, 1, true).translate(x, 1.55, z),
    new THREE.CylinderGeometry(1.66, 1.8, 1.6, 40, 1, true).translate(x, 3.2, z),
  ];
  g.add(fundir(quedas, matCortina));
  const jato = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 2.2, 10, 1, true), matCortina);
  jato.position.set(x, 5.5, z);
  g.add(jato);
  const borrifo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.35, depthWrite: false }));
  borrifo.position.set(x, 6.6, z);
  g.add(borrifo);
  decor.push((t) => {
    agua.offset.set(t * 0.015, t * 0.01);
    cortina.offset.y = (t * 0.9) % 1;
    const s = 1 + Math.sin(t * 3.1) * 0.06;
    jato.scale.set(1, s, 1);
    borrifo.position.y = 6.5 + Math.sin(t * 3.1) * 0.12;
    borrifo.scale.setScalar(1 + Math.sin(t * 5.3) * 0.08);
  });

  // a bacia não deixa entrar: um octógono de três caixas em volta do círculo
  for (const [hx, hz] of [[7.4, 3.1], [3.1, 7.4], [5.25, 5.25]]) {
    world.addBox({ min: [x - hx, 0, z - hz], max: [x + hx, 0.9, z + hz] });
  }
}

// bancos de madeira com pés de ferro; o assento é colisor de sofá (C senta)
export function construirBancos(L, world, bancos) {
  const { madeira, ferro } = L;
  for (const b of bancos) {
    madeira.push(no(new THREE.BoxGeometry(2.6, 0.1, 0.62), b.x, 0.5, b.z, b.giro));
    madeira.push(no(new THREE.BoxGeometry(2.6, 0.5, 0.08).translate(0, 0.32, -0.32), b.x, 0.5, b.z, b.giro));
    for (const lx of [-1.05, 1.05]) {
      ferro.push(no(new THREE.BoxGeometry(0.08, 0.5, 0.6).translate(lx, -0.25, 0), b.x, 0.5, b.z, b.giro));
      ferro.push(no(new THREE.BoxGeometry(0.08, 0.6, 0.08).translate(lx, 0.25, -0.33), b.x, 0.5, b.z, b.giro));
    }
    world.addBox({ min: [b.x - 0.5, 0, b.z - 0.5], max: [b.x + 0.5, 0.55, b.z + 0.5], data: { type: 'sofa' } });
  }
}

// ------------------------------------------------------------------ praças das áreas
function construirPracinhas(g, world, L) {
  // praça dos jogos: lajotas em xadrez dos dois lados da avenida (as mesas sobem em cima)
  const J = PRACA_JOGOS;
  const lajotas = texturaLajotas();
  lajotas.repeat.set((J.x1 - J.x0) / 8, (J.z1 - J.z0) / 8);
  const jogos = new THREE.Mesh(new THREE.PlaneGeometry(J.x1 - J.x0, J.z1 - J.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lajotas, roughness: 0.9 }));
  jogos.position.set((J.x0 + J.x1) / 2, 0.035, (J.z0 + J.z1) / 2);
  jogos.receiveShadow = true;
  g.add(jogos);

  const redonda = (c, cor, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(c.r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texturaRedonda(cor), roughness: 0.88 }));
    m.position.set(c.x, y, c.z);
    m.receiveShadow = true;
    g.add(m);
  };
  redonda(PRACA_AVENTURA, '#f472b6', Y_PRACA);
  redonda(MIRANTE, '#22d3ee', Y_PRACA);

  // pilares com luz na cor dos portais em volta da praça da aventura (aberta do lado da rua, a leste)
  const A = PRACA_AVENTURA;
  const luzes = [];
  for (let k = 1; k < 8; k++) {
    if (k === 2 || k === 6) continue; // a Rua do Parque atravessa a praça de norte a sul (parque-dados.js)
    const a = (k / 8) * Math.PI * 2;
    const px = A.x + Math.cos(a) * (A.r - 1);
    const pz = A.z + Math.sin(a) * (A.r - 1);
    L.ferro.push(new THREE.BoxGeometry(0.6, 2.6, 0.6).translate(px, 1.3, pz));
    luzes.push(pintar(new THREE.OctahedronGeometry(0.42, 0).translate(px, 3.05, pz), k % 2 ? '#f472b6' : '#22d3ee'));
    world.addBox({ min: [px - 0.35, 0, pz - 0.35], max: [px + 0.35, 2.6, pz + 0.35] });
  }
  g.add(fundir(luzes, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // guarda-corpo do mirante, do lado do lago
  const postes = L.ferro;
  const M = MIRANTE;
  const aLago = Math.atan2(LAGO.z - M.z, LAGO.x - M.x);
  for (let i = 0; i <= 12; i++) {
    const a = aLago - 1.2 + (i / 12) * 2.4;
    postes.push(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6).translate(M.x + Math.cos(a) * (M.r - 0.4), 0.55, M.z + Math.sin(a) * (M.r - 0.4)));
  }
  postes.push(new THREE.TorusGeometry(M.r - 0.4, 0.06, 6, 40, 2.4).rotateX(Math.PI / 2).rotateY(-(aLago - 1.2)).translate(M.x, 1.1, M.z));
  const bancos = [-0.7, 0.7].map((d) => {
    const a = aLago + Math.PI + d;
    return { x: M.x + Math.cos(a) * 6, z: M.z + Math.sin(a) * 6, giro: Math.atan2(LAGO.x - M.x, LAGO.z - M.z) };
  });
  construirBancos(L, world, bancos);
}

// ------------------------------------------------------------------ postes de luz
// Postes de praça (haste escura e lanterna que acende à noite), alternando os lados das ruas e em
// volta da praça. Sem luz de verdade: só a lanterna brilha (muitas luzes pesariam no shader).
// praca: false nas ruas do parque (parque.js), que não passam pela praça central; evitar: círculos
// { x, z, r } onde não vai poste (as pracinhas por onde a rua passa)
export function construirPostes(g, ruas, L, saidas, { praca = true, evitar = [] } = {}) {
  const hastes = L.ferro;
  const lanternas = [];
  const poste = (x, z) => {
    hastes.push(new THREE.CylinderGeometry(0.09, 0.13, 4.2, 8).translate(x, 2.1, z));
    hastes.push(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8).translate(x, 4.25, z));
    lanternas.push(new THREE.SphereGeometry(0.34, 14, 10).translate(x, 4.6, z));
  };
  const naPraca = (x, z, folga) => Math.hypot(x - PRACA.x, z - PRACA.z) < PRACA.r + folga
    || evitar.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + folga);
  for (const r of ruas) {
    for (let i = 0; i < r.pontos.length - 1; i++) {
      const [x0, z0] = r.pontos[i];
      const [x1, z1] = r.pontos[i + 1];
      const comp = Math.hypot(x1 - x0, z1 - z0);
      const dx = (x1 - x0) / comp;
      const dz = (z1 - z0) / comp;
      for (let d = 8, k = 0; d < comp - 4; d += 18, k++) {
        const lado = k % 2 ? 1 : -1;
        const px = x0 + dx * d - dz * (r.largura / 2 + 1) * lado;
        const pz = z0 + dz * d + dx * (r.largura / 2 + 1) * lado;
        if (naPraca(px, pz, 2) || ruas.some((o) => o !== r && pertoDe(o, px, pz, 2))) continue;
        poste(px, pz);
      }
    }
  }
  for (let k = 0; praca && k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    if (naSaida(saidas, a, PRACA.r - 3, 1)) continue;
    poste(PRACA.x + Math.cos(a) * (PRACA.r - 3), PRACA.z + Math.sin(a) * (PRACA.r - 3));
  }
  return lanternas;
}

// as lanternas acesas, todas numa malha só
export const malhaLanternas = (lanternas) => fundir(lanternas, new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }));

// a rua passa a menos de (largura/2 + folga) do ponto?
function pertoDe(rua, x, z, folga) {
  for (let i = 0; i < rua.pontos.length - 1; i++) {
    const [ax, az] = rua.pontos[i];
    const [bx, bz] = rua.pontos[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    if (Math.hypot(x - ax - vx * u, z - az - vz * u) < rua.largura / 2 + folga) return true;
  }
  return false;
}

// ------------------------------------------------------------------ pórticos das áreas
export function construirPorticos(g, world, L, lista = PORTICOS) {
  const pilar = [];
  for (const p of lista) {
    const meio = p.vao / 2 + 0.7;
    const altura = 7.2;
    const grupo = new THREE.Group();
    grupo.position.set(p.x, 0, p.z);
    grupo.rotation.y = p.giro;
    grupo.updateMatrixWorld();
    for (const lx of [-meio, meio]) {
      pilar.push(new THREE.BoxGeometry(1.1, altura, 1.1).translate(lx, altura / 2, 0).applyMatrix4(grupo.matrixWorld));
      pilar.push(new THREE.BoxGeometry(1.5, 0.5, 1.5).translate(lx, 0.25, 0).applyMatrix4(grupo.matrixWorld));
      const c = new THREE.Vector3(lx, 0, 0).applyMatrix4(grupo.matrixWorld);
      world.addBox({ min: [c.x - 0.6, 0, c.z - 0.6], max: [c.x + 0.6, altura, c.z + 0.6] });
    }
    L.ferro.push(new THREE.BoxGeometry(meio * 2 + 1.6, 0.5, 1.2).translate(0, altura + 0.25, 0).applyMatrix4(grupo.matrixWorld));
    // a placa com o nome, nos dois lados (numa malha só), com o fundo escuro entre as duas faces
    const largPlaca = Math.min(meio * 2 - 0.6, 16);
    const altPlaca = largPlaca * (192 / 1024);
    const faces = [0, Math.PI].map((f) => new THREE.PlaneGeometry(largPlaca, altPlaca).translate(0, 0, 0.08).rotateY(f).translate(0, altura - 1.0, 0).applyMatrix4(grupo.matrixWorld));
    g.add(fundir(faces, new THREE.MeshBasicMaterial({ map: texturaPlaca(p.nome, p.cor), toneMapped: false })));
    L.escuro.push(new THREE.BoxGeometry(largPlaca + 0.3, altPlaca + 0.3, 0.12).translate(0, altura - 1.0, 0).applyMatrix4(grupo.matrixWorld));
  }
  g.add(fundir(pilar, new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.7 }), { sombra: true, recebe: true }));
}

// ------------------------------------------------------------------ placas e mapa
// Poste com placas empilhadas, uma por destino (texto já com a seta): todas numa textura só, num
// plano só, com um fio transparente entre uma placa e a outra.
export function placaDeSaida(g, L, x, z, giro, linhas) {
  const LW = 768;
  const LH = 128;
  const VAO = 26;
  const tex = textura(LW, linhas.length * (LH + VAO) - VAO, (ctx) => {
    linhas.forEach(([texto, cor], i) => {
      const y = i * (LH + VAO);
      ctx.fillStyle = '#101826';
      ctx.fillRect(0, y, LW, LH);
      ctx.fillStyle = cor;
      ctx.fillRect(0, y + LH - 12, LW, 12);
      ctx.fillStyle = '#f8fafc';
      ctx.font = FONTE(70);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, LW / 2, y + LH / 2 - 4);
    });
  });
  const w = 3.6;
  const h = (w * (linhas.length * (LH + VAO) - VAO)) / LW;
  const alto = 1.9 + h;
  const onde = new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1));
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, alto - 0.05 - h / 2, 0.12).applyMatrix4(onde), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, side: THREE.DoubleSide }));
  g.add(placa);
  L.ferro.push(new THREE.CylinderGeometry(0.1, 0.12, alto, 8).translate(0, alto / 2, 0).applyMatrix4(onde));
}

// O mapa "você está aqui": a área toda vista de cima, desenhada com os mesmos dados do mundo
function texturaMapa(aqui) {
  const W = 1280;
  const H = 960;
  const x0 = -60;
  const x1 = 488;
  const z0 = -48;
  const z1 = 868; // até a cerca do norte, com o parque
  // Quem lê o mapa está de frente para leste (de costas para o prédio): o leste fica para cima e o
  // norte à esquerda, como o que a pessoa tem à frente.
  const marg = 60;
  const esc = Math.min((H - marg * 2) / (x1 - x0), (W - marg * 2 - 260) / (z1 - z0));
  const px = (x, z) => [marg + (z1 - z) * esc, H - marg - (x - x0) * esc];
  return textura(W, H, (ctx) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    // gramado
    const [ax, ay] = px(x0 + 8, z1 - 8);
    const [bx, by] = px(x1 - 8, z0 + 8);
    ctx.fillStyle = '#2f5d3a';
    roundRect(ctx, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), 18);
    ctx.fill();
    // bosques
    ctx.fillStyle = '#25492e';
    for (const b of BOSQUES) {
      const [cx0, cy0] = px(b.x0, b.z1);
      const [cx1, cy1] = px(b.x1, b.z0);
      ctx.fillRect(Math.min(cx0, cx1), Math.min(cy0, cy1), Math.abs(cx1 - cx0), Math.abs(cy1 - cy0));
    }
    // lago
    const [lx, ly] = px(LAGO.x, LAGO.z);
    ctx.fillStyle = '#3b82c4';
    ctx.beginPath();
    ctx.arc(lx, ly, LAGO.r * 1.15 * esc, 0, Math.PI * 2);
    ctx.fill();
    // autódromo
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2430';
    ctx.lineWidth = PISTA.largura * esc + 4;
    ctx.beginPath();
    CAMINHO.forEach((p, i) => {
      const [qx, qy] = px(PISTA.cx + p.x, PISTA.cz + p.y);
      if (i) ctx.lineTo(qx, qy);
      else ctx.moveTo(qx, qy);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();
    // prédio, estádio e quadras
    const bloco = (xa, za, xb, zb, cor) => {
      const [qa, ra] = px(xa, zb);
      const [qb, rb] = px(xb, za);
      ctx.fillStyle = cor;
      roundRect(ctx, Math.min(qa, qb), Math.min(ra, rb), Math.abs(qb - qa), Math.abs(rb - ra), 6);
      ctx.fill();
    };
    bloco(-52, -40, 60, 60, '#475569');
    bloco(ESTADIO.cx - 62, ESTADIO.cz - 54, ESTADIO.cx + 62, ESTADIO.cz + 54, '#0e7490');
    bloco(VOLEI.cx - 11, VOLEI.cz - 7, VOLEI.cx + 11, VOLEI.cz + 7, '#ca8a04');
    bloco(BASQUETE.cx - 16, BASQUETE.cz - 9, BASQUETE.cx + 16, BASQUETE.cz + 9, '#c2410c');
    bloco(BOLICHE.x0 - 6, BOLICHE.pistas[0] - 4, BOLICHE.x0 + 26, BOLICHE.pistas[BOLICHE.pistas.length - 1] + 4, '#7c3aed');
    // ruas e praças
    ctx.strokeStyle = '#d6cfc2';
    ctx.lineCap = 'round';
    for (const r of [...Object.values(RUAS), ...Object.values(RUAS_PARQUE)]) {
      ctx.lineWidth = Math.max(6, r.largura * esc);
      ctx.beginPath();
      r.pontos.forEach(([x, z], i) => {
        const [qx, qy] = px(x, z);
        if (i) ctx.lineTo(qx, qy);
        else ctx.moveTo(qx, qy);
      });
      ctx.stroke();
    }
    const J = PRACA_JOGOS;
    bloco(J.x0, J.z0, J.x1, J.z1, '#8b7fb8');
    // o parque: salão de jogos, minigolfe, queimada, pinta-território e kartódromo
    bloco(SALAO.x0, SALAO.z0, SALAO.x1, SALAO.z1, '#16a34a');
    bloco(GOLFE_AREA.x0, GOLFE_AREA.z0, GOLFE_AREA.x1, GOLFE_AREA.z1, '#4ade80');
    bloco(QUEIMADA.cx - QUEIMADA.comp / 2, QUEIMADA.cz - QUEIMADA.larg / 2, QUEIMADA.cx + QUEIMADA.comp / 2, QUEIMADA.cz + QUEIMADA.larg / 2, '#f97316');
    const PA = PINTA_ARENA;
    bloco(PA.cx - PA.lado / 2, PA.cz - PA.lado / 2, PA.cx + PA.lado / 2, PA.cz + PA.lado / 2, '#d946ef');
    ctx.strokeStyle = '#1f2430';
    ctx.lineWidth = 3;
    {
      const [ka, kb] = px(KART_AREA.x0 + 6, KART_AREA.z1 - 6);
      const [kc, kd] = px(KART_AREA.x1 - 6, KART_AREA.z0 + 6);
      roundRect(ctx, Math.min(ka, kc), Math.min(kb, kd), Math.abs(kc - ka), Math.abs(kd - kb), 30);
      ctx.stroke();
    }
    ctx.fillStyle = '#e9e3d6';
    for (const c of [PRACA, PRACA_AVENTURA, MIRANTE, PARQUE]) {
      const [qx, qy] = px(c.x, c.z);
      ctx.beginPath();
      ctx.arc(qx, qy, Math.max(8, c.r * esc), 0, Math.PI * 2);
      ctx.fill();
    }
    // chegada do surf
    const [sx, sy] = px(SURF.chegada.x, SURF.chegada.z);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fill();
    // nomes
    const nome = (texto, x, z, cor = '#f8fafc', tam = 26) => {
      const [qx, qy] = px(x, z);
      ctx.font = FONTE(tam);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(15,23,42,0.85)';
      ctx.strokeText(texto, qx, qy);
      ctx.fillStyle = cor;
      ctx.fillText(texto, qx, qy);
    };
    nome('PRÉDIO', 4, 10);
    nome('PRAÇA', PRACA.x, PRACA.z - 2, '#0f172a', 22);
    nome('ESTÁDIO', ESTADIO.cx, ESTADIO.cz, '#a5f3fc');
    nome('QUADRAS', 22, 196, '#fde68a', 22);
    nome('AVENTURA', PRACA_AVENTURA.x, PRACA_AVENTURA.z + 22, '#fbcfe8', 22);
    nome('PARQUE', PARQUE.x, PARQUE.z, '#0f172a', 20);
    nome('SALÃO', (SALAO.x0 + SALAO.x1) / 2, (SALAO.z0 + SALAO.z1) / 2, '#dcfce7', 20);
    nome('GOLFE', (GOLFE_AREA.x0 + GOLFE_AREA.x1) / 2, (GOLFE_AREA.z0 + GOLFE_AREA.z1) / 2, '#14532d', 20);
    nome('KART', (KART_AREA.x0 + KART_AREA.x1) / 2, (KART_AREA.z0 + KART_AREA.z1) / 2, '#fef08a', 26);
    for (const [t, x, z, cor, tam] of NOMES_DO_MAPA) nome(t, x, z, cor, tam);
    // você está aqui
    const [vx, vy] = px(aqui.x, aqui.z);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(vx, vy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    nome('VOCÊ ESTÁ AQUI', aqui.x - 26, aqui.z, '#fecaca', 22);
    // título e legenda à direita
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(44);
    ctx.fillText('Mapa', W - 250, 90);
    ctx.font = FONTE(22, 600);
    ctx.fillStyle = '#cbd5e1';
    const legenda = [
      ['Praça central', '#e9e3d6'], ['Ruas', '#d6cfc2'], ['Autódromo', '#ef4444'], ['Estádio', '#0e7490'],
      ['Quadras', '#ca8a04'], ['Praça dos jogos', '#8b7fb8'], ['Aventura', '#f472b6'], ['Lago', '#3b82c4'], ['Bosque', '#25492e'],
      ['Salão de jogos', '#16a34a'], ['Minigolfe', '#4ade80'], ['Queimada', '#f97316'], ['Pinta-território', '#d946ef'],
    ];
    legenda.forEach(([t, c], i) => {
      ctx.fillStyle = c;
      ctx.fillRect(W - 250, 140 + i * 44, 26, 26);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(t, W - 212, 154 + i * 44);
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONTE(20, 600);
    ctx.fillText('↑ leste', W - 250, H - 60);
  });
}

function construirMapa(g, world, L) {
  // na praça, à direita de quem chega pela alameda, de frente para o prédio (oeste)
  const aqui = { x: PRACA.x - PRACA.r + 5, z: PRACA.z - 13 };
  const w = 8;
  const h = w * (960 / 1280);
  const onde = new THREE.Matrix4().compose(_p.set(aqui.x, 0, aqui.z), _q.setFromAxisAngle(CIMA, -Math.PI / 2), _s.set(1, 1, 1));
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, 1.2 + h / 2, 0.09).applyMatrix4(onde), new THREE.MeshBasicMaterial({ map: texturaMapa(aqui), toneMapped: false }));
  g.add(tela);
  L.escuro.push(new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.14).translate(0, 1.2 + h / 2, 0).applyMatrix4(onde));
  for (const lx of [-w / 2 + 0.6, w / 2 - 0.6]) L.escuro.push(new THREE.BoxGeometry(0.25, 1.3, 0.25).translate(lx, 0.65, 0).applyMatrix4(onde));
  world.addBox({ min: [aqui.x - 0.3, 0, aqui.z - w / 2 - 0.2], max: [aqui.x + 0.3, 1.2 + h + 0.2, aqui.z + w / 2 + 0.2] });
}

// ------------------------------------------------------------------ árvores em fileira
// dos dois lados das avenidas, longe das esquinas, das praças e da pista (a natureza desenha)
function arvoresEmFileira(ruas) {
  const arvores = [];
  // o prédio, o estádio e as quadras (com a calçada de cada um) não recebem árvore
  const ocupado = [[-54, 64, -42, 63], [-46, 84, 68, 182], [-34, 90, 183, 209]];
  const longe = (x, z) => Math.hypot(x - PRACA.x, z - PRACA.z) > PRACA.r + 4
    && !ocupado.some(([ax, bx, az, bz]) => x > ax && x < bx && z > az && z < bz)
    && !(x > PRACA_JOGOS.x0 - 3 && x < PRACA_JOGOS.x1 + 3 && z > PRACA_JOGOS.z0 - 3 && z < PRACA_JOGOS.z1 + 3)
    && Math.hypot(x - PRACA_AVENTURA.x, z - PRACA_AVENTURA.z) > PRACA_AVENTURA.r + 6
    && Math.hypot(x - MIRANTE.x, z - MIRANTE.z) > MIRANTE.r + 4
    && !PORTICOS.some((p) => Math.hypot(x - p.x, z - p.z) < 9);
  for (const r of ruas) {
    for (let i = 0; i < r.pontos.length - 1; i++) {
      const [x0, z0] = r.pontos[i];
      const [x1, z1] = r.pontos[i + 1];
      const comp = Math.hypot(x1 - x0, z1 - z0);
      if (comp < 20) continue; // o trechinho até a pista
      const dx = (x1 - x0) / comp;
      const dz = (z1 - z0) / comp;
      const afast = r.largura / 2 + 3.5;
      for (let d = 7; d < comp - 5; d += 13) {
        for (const lado of [-1, 1]) {
          const x = x0 + dx * d - dz * afast * lado;
          const z = z0 + dz * d + dx * afast * lado;
          if (!longe(x, z) || ruas.some((o) => pertoDe(o, x, z, 3))) continue;
          arvores.push({ x, z });
        }
      }
    }
  }
  return arvores;
}

// ------------------------------------------------------------------ tudo
export function construirCidade(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const decor = world.decorAnimated;
  const L = novosLotes();
  const ruas = ruasComPista();
  const saidas = saidasDaPraca(ruas);
  construirRuas(g, ruas);
  construirPraca(g, world, decor, L, saidas);
  construirPracinhas(g, world, L);
  g.add(malhaLanternas(construirPostes(g, ruas, L, saidas)));
  construirPorticos(g, world, L);
  construirMapa(g, world, L);
  for (const p of PLACAS) placaDeSaida(g, L, p.x, p.z, p.giro, p.linhas);
  const { x, z, r } = PRACA;
  g.add(
    fundir(L.ferro, new THREE.MeshStandardMaterial({ color: 0x262b35, roughness: 0.5, metalness: 0.4 }), { sombra: true }),
    fundir(L.madeira, new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.75 }), { sombra: true, recebe: true }),
    fundir(L.escuro, new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.65 }), { sombra: true }),
  );

  for (const rua of ruas) world.estradas.push({ pontos: rua.pontos, largura: rua.largura });
  world.reservas.push(
    { x, z, r: r + 4 },
    { x: PRACA_AVENTURA.x, z: PRACA_AVENTURA.z, r: PRACA_AVENTURA.r + 4 },
    { x: MIRANTE.x, z: MIRANTE.z, r: MIRANTE.r + 3 },
  );
  return {
    grupo: g,
    // para a natureza: o lago no lugar certo, bosques só nas áreas de bosque e as fileiras das ruas
    natureza: { lago: LAGO, bosques: BOSQUES, fileiras: arvoresEmFileira(ruas) },
    mesas: MESAS_NOVO,
  };
}
