// As peças 3D de cada tema de mapa (cidade-dados.js, MAPA_INFO.tema): as árvores (coqueiro,
// pinheiro com neve, bordo vermelho, cerejeira, bambu...), os postes (tocha de praia, lampião,
// lanterna de pedra), os pórticos (de praia, de chalé, torii), a peça do meio da praça (farol,
// pinheirão enfeitado, pagode) e as texturas de rua e de piso. Tudo em geometria simples, com cor
// por vértice: cada tipo vira um desenho só (instâncias ou malhas fundidas).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAPA_INFO } from './cidade-dados.js';
import * as moduloQualidade from './qualidade.js';

export const TEMA = MAPA_INFO.tema;
// De onde vem o sol (o céu, o clima e a sombra usam): meio da tarde, a uns 38° de altura e vindo
// do sudoeste. Mais baixo que o meio-dia: sombra mais comprida, luz de lado e mais contraste.
export const SOL_DA_TARDE = [0.55, 0.62, -0.56];
const ESC = moduloQualidade.ESCALA_TEXTURA ?? 1;
// Texturas detalhadas (fotos no chão, folhas recortadas, relevo) ou a versão simples de antes, de
// cor lisa, para PC fraco e celular (qualidade.js, TEXTURAS_DETALHADAS; vale ao recarregar). Sem a
// constante lá (um qualidade.js velho no cache), as detalhadas.
export const DETALHE = moduloQualidade.TEXTURAS_DETALHADAS ?? true;

// ------------------------------------------------------------------ utilidades
// comUv: guarda as coordenadas de textura (as peças texturizadas do coqueiro)
export function pintar(geo, cor, comUv = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(cor);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv && !comUv) g.deleteAttribute('uv');
  return g;
}
const juntar = (partes) => mergeGeometries(partes);

// sorteio com semente (as mesmas árvores para todo mundo)
function semente(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function textura(w, h, desenhar, { repetir = false } = {}) {
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
// As fotos de textura do chão (public/img/texturas, ver scripts/texturas.js). cor: a imagem é cor
// (sRGB); o relevo (-n) não. A imagem chega depois: até lá o material fica sem ela.
const carregador = new THREE.TextureLoader();
export function texturaFoto(nome, { cor = true } = {}) {
  const t = carregador.load(`/img/texturas/${nome}.webp`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// nas texturas simples não tem relevo (null: o material fica sem normalMap)
export const relevoFoto = (nome) => (DETALHE ? texturaFoto(`${nome}-n`, { cor: false }) : null);

// o relevo da rua do tema: as tábuas (a mesma repetição da texturaRua), o cascalho ou a neve
// pisada sobre os paralelepípedos (null nas simples)
export function relevoRua() {
  const tipo = TEMA.rua.tipo;
  return relevoFoto(tipo === 'madeira' ? 'madeira' : tipo === 'cascalho' ? 'cascalho' : 'neve');
}
// a foto do chão do tema, em cinza (multiplica a cor do terreno): grama, ou neve na vila da neve
export const CHAO_DO_TEMA = TEMA.id === 'neve' ? 'neve' : 'grama';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ------------------------------------------------------------------ árvores
// Folha de coqueiro: uma tira que sai do topo, arqueia e cai, afinando na ponta. As duas metades
// caem um pouco para os lados (forma de V). uv: u ao longo da folha, v de um lado ao outro (0,5 é
// a nervura): a textura desenha os folíolos e o resto é recortado (alphaTest).
function folhaCoqueiro(comp, larg, queda) {
  const n = 8;
  const pos = [];
  const uv = [];
  const ponto = (t) => [t * comp, Math.sin(t * Math.PI * 0.9) * comp * 0.16 - t * t * queda];
  const largura = (t) => larg * Math.pow(Math.sin(Math.PI * (0.06 + t * 0.94)), 0.6) * (1 - t * 0.3);
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const [x0, y0] = ponto(t0);
    const [x1, y1] = ponto(t1);
    const w0 = largura(t0);
    const w1 = largura(t1);
    for (const lado of [1, -1]) {
      const v = 0.5 + lado * 0.5;
      const a = [x0, y0, 0, t0, 0.5];
      const b = [x1, y1, 0, t1, 0.5];
      const c = [x1, y1 - w1 * 0.3, w1 * lado, t1, v];
      const d = [x0, y0 - w0 * 0.3, w0 * lado, t0, v];
      for (const p of lado > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
        pos.push(p[0], p[1], p[2]);
        uv.push(p[3], p[4]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// A textura da folha: a nervura no meio e os folíolos saindo dela inclinados para a ponta, longos
// no meio da folha e curtos nas pontas. Fundo transparente (o material recorta).
let texFolha = null;
function texturaFolhaCoqueiro() {
  if (texFolha) return texFolha;
  const rnd = semente(21);
  texFolha = textura(512, 128, (ctx, w, h) => {
    const meio = h / 2;
    ctx.lineCap = 'round';
    for (let x = 6; x < w - 4; x += 4.2) {
      const t = x / w;
      const comp = (h / 2 - 3) * Math.pow(Math.sin(Math.PI * (0.06 + t * 0.94)), 0.5) * (0.85 + rnd() * 0.15);
      for (const lado of [1, -1]) {
        if (rnd() < 0.06) continue; // um folíolo faltando aqui e ali
        const tom = 0.8 + rnd() * 0.35;
        ctx.strokeStyle = `rgb(${Math.round(70 * tom)},${Math.round(150 * tom)},${Math.round(55 * tom)})`;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x, meio);
        // o folíolo sai para a ponta da folha e cai um pouco no fim
        ctx.quadraticCurveTo(x + comp * 0.35, meio + lado * comp * 0.75, x + comp * 0.75, meio + lado * comp);
        ctx.stroke();
      }
    }
    // a nervura
    ctx.strokeStyle = '#9fb25a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, meio);
    ctx.lineTo(w, meio);
    ctx.stroke();
  });
  return texFolha;
}

// a casca: anéis escuros (as cicatrizes das folhas velhas) num cinza-marrom, dois por gomo
let texCasca = null;
function texturaCasca() {
  if (texCasca) return texCasca;
  const rnd = semente(22);
  texCasca = textura(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8c7458';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const t = 110 + Math.floor(rnd() * 60);
      ctx.fillStyle = `rgba(${t},${t - 18},${t - 40},0.5)`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1);
    }
    for (const y of [0, h / 2]) {
      ctx.fillStyle = 'rgba(55,40,28,0.75)';
      ctx.fillRect(0, y, w, 5);
      ctx.fillStyle = 'rgba(190,170,140,0.35)';
      ctx.fillRect(0, y + 5, w, 2);
    }
  }, { repetir: true });
  return texCasca;
}

// Os dois materiais do coqueiro (grupo 0: tronco e cocos; grupo 1: folhas). A natureza faz cópias
// com o shader só de sol para os de longe.
export function materiaisCoqueiro() {
  return [
    new THREE.MeshLambertMaterial({ vertexColors: true, map: texturaCasca() }),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: texturaFolhaCoqueiro(), alphaTest: 0.4, side: THREE.DoubleSide }),
  ];
}

function geoCoqueiro(altura = 9, folhas = 8, seed = 3) {
  const rnd = semente(seed);
  const tronco = [];
  const copa = [];
  // tronco curvo: gomos que vão inclinando, mais grosso no pé
  const gomos = 9;
  let x = 0;
  let y = 0;
  const curva = 0.55;
  for (let i = 0; i < gomos; i++) {
    const h = altura / gomos;
    const r0 = 0.3 - i * 0.011 + (i === 0 ? 0.08 : 0);
    const r1 = 0.3 - (i + 1) * 0.011;
    const incl = (i / gomos) * curva;
    const g = new THREE.CylinderGeometry(r1, r0, h * 1.04, 8, 1, true).translate(0, h / 2, 0).rotateZ(-incl).translate(x, y, 0);
    tronco.push(pintar(g, '#ffffff', true));
    x += Math.sin(incl) * h;
    y += Math.cos(incl) * h;
  }
  // cocos
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    tronco.push(pintar(new THREE.IcosahedronGeometry(0.22, 1).translate(x + Math.cos(a) * 0.3, y - 0.25, Math.sin(a) * 0.3), '#7a5a30', true));
  }
  // a copa: folhas em volta do topo, as de baixo mais caídas, e três novas quase em pé
  const tons = ['#ffffff', '#e6f2c8', '#d2e6a8', '#f4f0c0'];
  for (let i = 0; i < folhas; i++) {
    const a = (i / folhas) * Math.PI * 2 + rnd() * 0.35;
    const comp = 3.8 + rnd() * 1.5;
    const f = folhaCoqueiro(comp, 0.85, 1.6 + rnd() * 1.6).rotateZ(-0.1 + rnd() * 0.2).rotateY(a).translate(x, y + 0.05, 0);
    copa.push(pintar(f, tons[i % tons.length], true));
  }
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const f = folhaCoqueiro(2.4 + rnd() * 0.6, 0.6, 0.4).rotateZ(0.7 + rnd() * 0.3).rotateY(a).translate(x, y + 0.1, 0);
    copa.push(pintar(f, '#f2ffd8', true));
  }
  const geo = mergeGeometries([juntar(tronco), juntar(copa)], true);
  geo.userData.materiais = 'coqueiro';
  geo.userData.longe = geoCoqueiroLonge(altura, folhas, seed);
  return geo;
}

// O coqueiro de longe (a mais de 60 m da cerca): sem textura, folhas inteiras e menos gomos. Lá
// longe os folíolos recortados nem aparecem (o mipmap apaga o recorte) e só pesariam.
function geoCoqueiroLonge(altura, folhas, seed) {
  const rnd = semente(seed);
  const partes = [];
  const gomos = 5;
  let x = 0;
  let y = 0;
  for (let i = 0; i < gomos; i++) {
    const h = altura / gomos;
    const incl = (i / gomos) * 0.55;
    const g = new THREE.CylinderGeometry(0.27 - i * 0.02, 0.3 - i * 0.02, h * 1.04, 5, 1, true).translate(0, h / 2, 0).rotateZ(-incl).translate(x, y, 0);
    partes.push(pintar(g, '#86705a'));
    x += Math.sin(incl) * h;
    y += Math.cos(incl) * h;
  }
  for (let i = 0; i < folhas; i++) {
    const a = (i / folhas) * Math.PI * 2 + rnd() * 0.35;
    const f = folhaCoqueiro(3.8 + rnd() * 1.5, 0.6, 1.6 + rnd() * 1.6).rotateY(a).translate(x, y + 0.05, 0);
    f.deleteAttribute('uv');
    partes.push(pintar(f, i % 2 ? '#3f8f3a' : '#4a9a40'));
  }
  return juntar(partes);
}

// ------------------------------------------------------------------ árvores de folhas
// A copa é feita de "nuvens" de folhas: uma bola por dentro (a sombra entre as folhas) e, por
// fora, cartões com a textura de um cacho de folhas recortado. A normal de cada cartão aponta
// para fora da nuvem: a luz cai na copa como numa bola fofa, e não chapada em cada cartão.

// cacho de folhas pontudas, em tons claros (a cor vem do vértice: cada árvore pinta a sua)
let texFolhas = null;
function texturaFolhas() {
  if (texFolhas) return texFolhas;
  const rnd = semente(31);
  texFolhas = textura(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 95; i++) {
      // mais folhas no meio, poucas na borda: o recorte do cartão some
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * w * 0.4;
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d;
      const tam = 13 + rnd() * 11;
      const giro = rnd() * Math.PI * 2;
      const tom = Math.round(150 + rnd() * 105);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(giro);
      ctx.fillStyle = `rgb(${tom},${tom},${tom})`;
      ctx.beginPath();
      ctx.moveTo(-tam, 0);
      ctx.quadraticCurveTo(0, -tam * 0.5, tam, 0);
      ctx.quadraticCurveTo(0, tam * 0.5, -tam, 0);
      ctx.fill();
      // a nervura, um pouco mais escura
      ctx.strokeStyle = `rgba(0,0,0,0.18)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-tam * 0.9, 0);
      ctx.lineTo(tam * 0.9, 0);
      ctx.stroke();
      ctx.restore();
    }
  });
  return texFolhas;
}

// agulhas de pinheiro: riscos finos pendurados, com a borda de baixo desfiada (recortada)
let texAgulhas = null;
function texturaAgulhas() {
  if (texAgulhas) return texAgulhas;
  const rnd = semente(32);
  texAgulhas = textura(256, 256, (ctx, w, h) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.95;
      const tom = Math.round(140 + rnd() * 115);
      ctx.strokeStyle = `rgb(${tom},${tom},${tom})`;
      ctx.lineWidth = 1.6;
      const comp = 12 + rnd() * 16;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 8, Math.min(h - 1, y + comp));
      ctx.stroke();
    }
    // a parte de cima, inteira (a camada de cima cobre)
    ctx.fillStyle = 'rgb(170,170,170)';
    ctx.fillRect(0, 0, w, h * 0.12);
  }, { repetir: true });
  texAgulhas.wrapT = THREE.ClampToEdgeWrapping;
  texAgulhas.repeat.x = 4; // u dá a volta no cone: sem isto as agulhas esticam
  return texAgulhas;
}

// cartões de folhas espalhados pela superfície de uma nuvem (cx, cy, cz, raio, achatada em y)
function cartoesDaNuvem(rnd, cx, cy, cz, r, sy, qtd, cor) {
  const partes = [];
  const n = new THREE.Vector3();
  for (let i = 0; i < qtd; i++) {
    // ponto na superfície, mais em cima e dos lados que embaixo
    const u = rnd() * 2 - 1;
    const yN = u < -0.5 ? u * 0.5 : u;
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(1 - yN * yN);
    n.set(Math.cos(a) * rr, yN, Math.sin(a) * rr).normalize();
    const lado = r * (0.95 + rnd() * 0.4);
    const g = new THREE.PlaneGeometry(lado, lado);
    // de frente para fora, girado no próprio eixo
    g.rotateZ(rnd() * Math.PI * 2);
    g.lookAt(n);
    g.translate(cx + n.x * r * 0.78, cy + n.y * r * 0.78 * sy, cz + n.z * r * 0.78);
    // a normal de cada vértice aponta para fora do centro da nuvem
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      n.set(pos.getX(k) - cx, (pos.getY(k) - cy) / sy, pos.getZ(k) - cz).normalize();
      nor.setXYZ(k, n.x, n.y, n.z);
    }
    partes.push(pintar(g, cor, true));
  }
  return partes;
}

// troncos: [{ raio0, raio1, altura, giroZ, x, y, z }]; nuvens: [[x, y, z, raio, cor, achatar]]
function geoFolhuda(troncos, corTronco, nuvens, seed) {
  const rnd = semente(seed);
  const solido = [];
  const cartoes = [];
  const longe = [];
  for (const t of troncos) {
    const g = () => new THREE.CylinderGeometry(t.r1, t.r0, t.h, 7, 1, true).translate(0, t.h / 2, 0).rotateZ(t.giro ?? 0).translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    solido.push(pintar(g(), corTronco, true));
    longe.push(pintar(g(), corTronco));
  }
  for (const [x, y, z, r, cor, sy = 0.85] of nuvens) {
    const escura = new THREE.Color(cor).multiplyScalar(0.55);
    solido.push(pintar(new THREE.IcosahedronGeometry(r * 0.82, 1).scale(1, sy, 1).translate(x, y, z), escura, true));
    cartoes.push(...cartoesDaNuvem(rnd, x, y, z, r, sy, Math.round(6 + r * 4), cor));
    longe.push(pintar(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), cor));
  }
  const geo = mergeGeometries([juntar(solido), juntar(cartoes)], true);
  geo.userData.materiais = 'folhuda';
  geo.userData.longe = juntar(longe);
  return geo;
}

function geoCopa(cores, tronco = '#6a4a33', altura = 1) {
  const s = altura;
  return geoFolhuda([{ r0: 0.45 * s, r1: 0.3 * s, h: 4.6 * s }], tronco, [
    [0, 5.6 * s, 0, 2.7 * s, cores[0]],
    [1.4 * s, 6.6 * s, 0.6 * s, 1.9 * s, cores[1]],
    [-1.3 * s, 6.2 * s, -0.8 * s, 1.7 * s, cores[2]],
    [0.2 * s, 7.4 * s, -0.9 * s, 1.4 * s, cores[0]],
  ], 41);
}

// bordo japonês: tronco escuro inclinado e uma copa larga e baixa, em camadas, vermelha
function geoBordo() {
  return geoFolhuda([
    { r0: 0.38, r1: 0.22, h: 3.4, giro: 0.12 },
    { r0: 0.2, r1: 0.12, h: 2.2, giro: -0.7, x: 0.4, y: 2.8 },
  ], '#3e2a22', [
    [0, 4.4, 0, 2.9, '#c2261b', 0.62], [1.8, 4.0, 0.8, 2.0, '#e0461d', 0.62], [-1.6, 4.1, -0.6, 2.1, '#a51d16', 0.62],
    [0.4, 5.4, -0.4, 2.0, '#ef6a24', 0.62], [-0.5, 4.8, 1.4, 1.7, '#d93a1b', 0.62],
  ], 42);
}

function geoCerejeira() {
  return geoFolhuda([
    { r0: 0.4, r1: 0.24, h: 3.6 },
    { r0: 0.2, r1: 0.12, h: 2.4, giro: 0.8, x: -0.4, y: 2.9 },
  ], '#4a3030', [
    [0, 4.8, 0, 2.6, '#f9a8d4', 0.7], [-1.9, 4.3, 0.5, 1.9, '#fbcfe8', 0.7], [1.7, 4.5, -0.6, 2.0, '#f472b6', 0.7],
    [0.3, 5.9, 0.4, 1.8, '#fbcfe8', 0.7], [0.6, 4.4, 1.7, 1.6, '#f9a8d4', 0.7],
  ], 43);
}

// Pinheiro: camadas de cone com a textura de agulhas (a borda de baixo desfiada e recortada) e,
// na neve, um chapéu branco em cada camada
function geoPinheiro(neve) {
  const solido = [pintar(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5b3d2a', true)];
  const agulhas = [];
  const longe = [pintar(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5b3d2a')];
  const camadas = [[2.7, 4.4, 4.6, '#2e6a41'], [2.1, 3.8, 6.7, '#357a48'], [1.35, 3.2, 8.6, '#3d8a51']];
  for (const [r, h, y, cor] of camadas) {
    const c = neve ? '#2c6a46' : cor;
    // o miolo escuro e, por fora, um cone um pouco maior com as agulhas
    solido.push(pintar(new THREE.ConeGeometry(r * 0.8, h * 0.9, 8, 1, true).translate(0, y - h * 0.05, 0), new THREE.Color(c).multiplyScalar(0.5), true));
    agulhas.push(pintar(new THREE.ConeGeometry(r, h, 10, 1, true).translate(0, y, 0), c, true));
    if (neve) solido.push(pintar(new THREE.ConeGeometry(r * 0.78, h * 0.55, 8, 1, true).translate(0, y + h * 0.24, 0), '#f6f9fc', true));
    longe.push(pintar(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0), c));
    if (neve) longe.push(pintar(new THREE.ConeGeometry(r * 0.78, h * 0.55, 7, 1, true).translate(0, y + h * 0.24, 0), '#f6f9fc'));
  }
  const geo = mergeGeometries([juntar(solido), juntar(agulhas)], true);
  geo.userData.materiais = 'pinheiro';
  geo.userData.longe = juntar(longe);
  return geo;
}

// arbusto: uma nuvem de folhas baixa, sem tronco (na neve, um monte arredondado mais achatado)
export function geoArbusto(cor) {
  return TEMA.id === 'neve'
    ? geoFolhuda([], '#000000', [[0, 0.5, 0, 1.2, cor, 0.5]], 44)
    : geoFolhuda([], '#000000', [[0, 0.7, 0, 1.15, cor, 0.72]], 45);
}

// Os materiais de cada tipo de árvore com textura: [o sólido (tronco, miolo), o recortado]
export function materiaisArvore(tipo) {
  if (tipo === 'coqueiro') return materiaisCoqueiro();
  const recorte = tipo === 'pinheiro' ? texturaAgulhas() : texturaFolhas();
  return [
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: recorte, alphaTest: 0.45, side: THREE.DoubleSide }),
  ];
}

function geoBambu() {
  const rnd = semente(11);
  const partes = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 1.1;
    const h = 7 + rnd() * 4;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const incl = (rnd() - 0.5) * 0.12;
    partes.push(pintar(new THREE.CylinderGeometry(0.08, 0.1, h, 5, 1, true).translate(0, h / 2, 0).rotateZ(incl).translate(x, 0, z), i % 2 ? '#6d9b3a' : '#7fae45'));
    // tufos de folhas no alto
    for (let k = 0; k < 3; k++) {
      partes.push(pintar(new THREE.IcosahedronGeometry(0.5 + rnd() * 0.3, 0).scale(1.4, 0.35, 0.6).rotateY(rnd() * 6).translate(x + Math.sin(incl) * h, h * (0.7 + k * 0.12), z), '#5a8f34'));
    }
  }
  return juntar(partes);
}

// ------------------------------------------------------------------ árvores simples
// A versão de antes das texturas (DETALHE falso): só cor por vértice, sem recorte nem relevo, num
// material só. É a que vai para PC fraco e celular.
function folhaCoqueiroSimples(comp, larg, queda) {
  const n = 7;
  const pos = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const ponto = (t) => [t * comp, Math.sin(t * Math.PI * 0.9) * comp * 0.18 - t * t * queda];
    const [x0, y0] = ponto(t0);
    const [x1, y1] = ponto(t1);
    const w0 = larg * Math.sin(Math.PI * (0.15 + t0 * 0.85)) * (1 - t0 * 0.6);
    const w1 = larg * Math.sin(Math.PI * (0.15 + t1 * 0.85)) * (1 - t1 * 0.6);
    // as duas metades da folha caem um pouco para os lados (forma de V)
    pos.push(x0, y0, 0, x1, y1, 0, x0, y0 - w0 * 0.25, w0, x1, y1, 0, x1, y1 - w1 * 0.25, w1, x0, y0 - w0 * 0.25, w0);
    pos.push(x0, y0, 0, x0, y0 - w0 * 0.25, -w0, x1, y1, 0, x1, y1, 0, x0, y0 - w0 * 0.25, -w0, x1, y1 - w1 * 0.25, -w1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function geoCoqueiroSimples(altura = 9, folhas = 8, seed = 3) {
  const rnd = semente(seed);
  const partes = [];
  // tronco curvo: gomos que vão inclinando, com anéis mais escuros
  const gomos = 9;
  let x = 0;
  let y = 0;
  const curva = 0.55;
  for (let i = 0; i < gomos; i++) {
    const h = altura / gomos;
    const r0 = 0.32 - i * 0.012;
    const r1 = r0 - 0.012;
    const incl = (i / gomos) * curva;
    const g = new THREE.CylinderGeometry(r1, r0, h * 1.04, 7, 1, true).translate(0, h / 2, 0).rotateZ(-incl).translate(x, y, 0);
    partes.push(pintar(g, i % 2 ? '#8a6a45' : '#7a5a38'));
    x += Math.sin(incl) * h;
    y += Math.cos(incl) * h;
  }
  // a copa: folhas em volta do topo, algumas mais caídas
  for (let i = 0; i < folhas; i++) {
    const a = (i / folhas) * Math.PI * 2 + rnd() * 0.3;
    const comp = 3.6 + rnd() * 1.4;
    const f = folhaCoqueiroSimples(comp, 0.62, 1.4 + rnd() * 1.4).rotateY(a).translate(x, y + 0.1, 0);
    partes.push(pintar(f, i % 3 === 0 ? '#3f8f3a' : i % 3 === 1 ? '#4fa443' : '#2f7a33'));
  }
  // cocos
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    partes.push(pintar(new THREE.IcosahedronGeometry(0.22, 0).translate(x + Math.cos(a) * 0.32, y - 0.25, Math.sin(a) * 0.32), '#6b4a22'));
  }
  return juntar(partes);
}

function geoPinheiroSimples(neve) {
  const partes = [pintar(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5b3d2a')];
  const camadas = [[2.7, 4.4, 4.6, '#2e6a41'], [2.1, 3.8, 6.7, '#357a48'], [1.35, 3.2, 8.6, '#3d8a51']];
  for (const [r, h, y, cor] of camadas) {
    partes.push(pintar(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0), neve ? '#245a3c' : cor));
    // neve: um cone branco menor, por cima da metade de cima de cada camada
    if (neve) partes.push(pintar(new THREE.ConeGeometry(r * 0.78, h * 0.55, 7, 1, true).translate(0, y + h * 0.24, 0), '#f6f9fc'));
  }
  return juntar(partes);
}

function geoCopaSimples(cores, tronco = '#6a4a33', altura = 1) {
  const s = altura;
  return juntar([
    pintar(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 4.4 * s, 6, 1, true).translate(0, 2.2 * s, 0), tronco),
    pintar(new THREE.IcosahedronGeometry(2.7 * s, 0).scale(1, 0.85, 1).translate(0, 5.6 * s, 0), cores[0]),
    pintar(new THREE.IcosahedronGeometry(1.9 * s, 0).translate(1.4 * s, 6.6 * s, 0.6 * s), cores[1]),
    pintar(new THREE.IcosahedronGeometry(1.7 * s, 0).translate(-1.3 * s, 6.2 * s, -0.8 * s), cores[2]),
    pintar(new THREE.IcosahedronGeometry(1.4 * s, 0).translate(0.2 * s, 7.4 * s, -0.9 * s), cores[0]),
  ]);
}

function geoBordoSimples() {
  const partes = [
    pintar(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6, 1, true).translate(0, 1.6, 0).rotateZ(0.12), '#3e2a22'),
    pintar(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5, 1, true).translate(0, 1.1, 0).rotateZ(-0.7).translate(0.4, 2.8, 0), '#3e2a22'),
  ];
  const nuvens = [[0, 4.4, 0, 2.9, '#c2261b'], [1.8, 4.0, 0.8, 2.0, '#e0461d'], [-1.6, 4.1, -0.6, 2.1, '#a51d16'], [0.4, 5.4, -0.4, 2.0, '#ef6a24'], [-0.5, 4.8, 1.4, 1.7, '#d93a1b']];
  for (const [x, y, z, r, cor] of nuvens) partes.push(pintar(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.62, 1).translate(x, y, z), cor));
  return juntar(partes);
}

function geoCerejeiraSimples() {
  const partes = [
    pintar(new THREE.CylinderGeometry(0.24, 0.4, 3.4, 6, 1, true).translate(0, 1.7, 0), '#4a3030'),
    pintar(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5, 1, true).translate(0, 1.2, 0).rotateZ(0.8).translate(-0.4, 2.9, 0), '#4a3030'),
  ];
  const nuvens = [[0, 4.8, 0, 2.6, '#f9a8d4'], [-1.9, 4.3, 0.5, 1.9, '#fbcfe8'], [1.7, 4.5, -0.6, 2.0, '#f472b6'], [0.3, 5.9, 0.4, 1.8, '#fbcfe8'], [0.6, 4.4, 1.7, 1.6, '#f9a8d4']];
  for (const [x, y, z, r, cor] of nuvens) partes.push(pintar(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).translate(x, y, z), cor));
  return juntar(partes);
}

// arbusto e pedra simples: a bola facetada de uma cor (natureza.js)
export function geoArbustoSimples(cor) {
  return TEMA.id === 'neve'
    ? pintar(new THREE.IcosahedronGeometry(1.1, 1).scale(1.4, 0.55, 1.4), cor)
    : pintar(new THREE.IcosahedronGeometry(1.1, 0).scale(1.3, 0.8, 1.3), cor);
}
export const geoPedraSimples = (cor) => pintar(new THREE.DodecahedronGeometry(1, 0), cor);

// Árvores do tema: { nome: geometria }. As que o tema não usa nem são feitas.
export function arvoresDoTema() {
  const feitas = DETALHE ? {
    palmeira: () => geoCoqueiro(9.5, 9, 3),
    palmeiraBaixa: () => geoCoqueiro(6, 10, 8),
    pinheiro: () => geoPinheiro(false),
    pinheiroNeve: () => geoPinheiro(true),
    frondosa: () => geoCopa(['#5c8f3e', '#68a046', '#4f8238']),
    frondosaOutono: () => geoCopa(['#d9a21b', '#e8b931', '#c4801a'], '#5a3f2a'),
    bordo: geoBordo,
    cerejeira: geoCerejeira,
    bambu: geoBambu,
  } : {
    palmeira: () => geoCoqueiroSimples(9.5, 9, 3),
    palmeiraBaixa: () => geoCoqueiroSimples(6, 10, 8),
    pinheiro: () => geoPinheiroSimples(false),
    pinheiroNeve: () => geoPinheiroSimples(true),
    frondosa: () => geoCopaSimples(['#5c8f3e', '#68a046', '#4f8238']),
    frondosaOutono: () => geoCopaSimples(['#d9a21b', '#e8b931', '#c4801a'], '#5a3f2a'),
    bordo: geoBordoSimples,
    cerejeira: geoCerejeiraSimples,
    bambu: geoBambu,
  };
  return Object.fromEntries(Object.keys(TEMA.arvores).map((k) => [k, feitas[k]()]));
}
// a árvore das fileiras das ruas
export const ARVORE_DA_RUA = { tropical: 'palmeira', neve: 'pinheiroNeve', outono: 'bordo' }[TEMA.id] || Object.keys(TEMA.arvores)[0];

// ------------------------------------------------------------------ postes
// Cada poste empurra geometrias nos lotes: a parte escura (L.ferro), a de pedra/madeira (L.madeira)
// e a luz (lista de luzes: acesas, numa malha só). Devolve a altura da luz.
export function poste(L, luzes, x, z, giro = 0) {
  const onde = new THREE.Matrix4().makeRotationY(giro).setPosition(x, 0, z);
  const m = (g) => g.applyMatrix4(onde);
  if (TEMA.poste === 'tocha') {
    // tocha de praia: vara de bambu com gomos, a cuia e a chama
    for (let i = 0; i < 4; i++) L.madeira.push(m(new THREE.CylinderGeometry(0.07, 0.08, 0.68, 6).translate(0, 0.35 + i * 0.7, 0)));
    L.ferro.push(m(new THREE.CylinderGeometry(0.2, 0.1, 0.32, 8).translate(0, 2.95, 0)));
    luzes.push(m(new THREE.ConeGeometry(0.17, 0.55, 7).translate(0, 3.35, 0)));
    return 3.3;
  }
  if (TEMA.poste === 'lanterna') {
    // lanterna de pedra (tōrō): base, haste, a caixa da luz e o telhadinho
    L.pedra.push(
      m(new THREE.CylinderGeometry(0.42, 0.5, 0.22, 6).translate(0, 0.11, 0)),
      m(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 6).translate(0, 0.66, 0)),
      m(new THREE.CylinderGeometry(0.36, 0.3, 0.16, 6).translate(0, 1.18, 0)),
      m(new THREE.ConeGeometry(0.62, 0.42, 6).translate(0, 1.82, 0)),
      m(new THREE.SphereGeometry(0.12, 6, 4).translate(0, 2.08, 0)),
    );
    luzes.push(m(new THREE.BoxGeometry(0.36, 0.34, 0.36).translate(0, 1.43, 0)));
    return 1.4;
  }
  // lampião: haste de ferro, a lanterna e um chapéu (com neve no tema de neve)
  L.ferro.push(
    m(new THREE.CylinderGeometry(0.09, 0.14, 4.0, 8).translate(0, 2.0, 0)),
    m(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8).translate(0, 4.05, 0)),
    m(new THREE.ConeGeometry(0.42, 0.34, 8).translate(0, 4.82, 0)),
  );
  if (TEMA.id === 'neve') L.neve.push(m(new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, 4.95, 0)));
  luzes.push(m(new THREE.CylinderGeometry(0.22, 0.18, 0.55, 8).translate(0, 4.38, 0)));
  return 4.4;
}

// ------------------------------------------------------------------ pórticos
// a estrutura do pórtico (sem a placa): vao = espaço entre os pilares; devolve a altura da placa
// e o lote de cada peça. grupo: matriz do lugar.
export function estruturaPortico(L, matriz, vao) {
  const m = (g) => g.applyMatrix4(matriz);
  const meio = vao / 2 + 0.7;
  if (TEMA.portico === 'torii') {
    // torii: dois pilares vermelhos, a viga de baixo (nuki) e a de cima (kasagi), preta, com as
    // pontas levantadas
    const alt = 7.4;
    for (const lx of [-meio, meio]) {
      L.vermelho.push(m(new THREE.CylinderGeometry(0.42, 0.5, alt, 12).translate(lx, alt / 2, 0)));
      L.ferro.push(m(new THREE.CylinderGeometry(0.58, 0.62, 0.5, 12).translate(lx, 0.25, 0)));
    }
    L.vermelho.push(m(new THREE.BoxGeometry(meio * 2 + 1.6, 0.42, 0.42).translate(0, alt - 1.3, 0)));
    L.vermelho.push(m(new THREE.BoxGeometry(meio * 2 + 2.6, 0.5, 0.9).translate(0, alt + 0.05, 0)));
    L.ferro.push(m(new THREE.BoxGeometry(meio * 2 + 3.2, 0.32, 1.1).translate(0, alt + 0.42, 0)));
    for (const s of [-1, 1]) L.ferro.push(m(new THREE.BoxGeometry(1.2, 0.32, 1.1).rotateZ(s * 0.28).translate(s * (meio + 1.9), alt + 0.6, 0)));
    return { altura: alt + 0.6, yPlaca: alt - 2.9, pilares: [-meio, meio] };
  }
  if (TEMA.portico === 'chale') {
    // de toras: dois pilares, a viga e neve em cima
    const alt = 7.2;
    for (const lx of [-meio, meio]) {
      L.madeira.push(m(new THREE.CylinderGeometry(0.5, 0.56, alt, 9).translate(lx, alt / 2, 0)));
      L.pedra.push(m(new THREE.BoxGeometry(1.6, 0.7, 1.6).translate(lx, 0.35, 0)));
      L.neve.push(m(new THREE.SphereGeometry(0.56, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(lx, alt, 0)));
    }
    L.madeira.push(m(new THREE.CylinderGeometry(0.42, 0.42, meio * 2 + 2.2, 9).rotateZ(Math.PI / 2).translate(0, alt - 0.3, 0)));
    L.neve.push(m(new THREE.BoxGeometry(meio * 2 + 2.1, 0.32, 0.7).translate(0, alt + 0.15, 0)));
    return { altura: alt, yPlaca: alt - 1.9, pilares: [-meio, meio] };
  }
  // de praia: troncos de coqueiro e um telhado de palha por cima da placa
  const alt = 6.6;
  for (const lx of [-meio, meio]) {
    for (let i = 0; i < 6; i++) L.madeira.push(m(new THREE.CylinderGeometry(0.34, 0.38, alt / 6 + 0.02, 8).translate(lx, alt / 12 + (i * alt) / 6, 0)));
  }
  L.palha.push(m(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale(meio * 2 + 3, 1.4, 3.2).translate(0, alt + 0.9, 0)));
  L.madeira.push(m(new THREE.BoxGeometry(meio * 2 + 1.4, 0.36, 0.5).translate(0, alt - 0.1, 0)));
  return { altura: alt, yPlaca: alt - 1.6, pilares: [-meio, meio] };
}

// ------------------------------------------------------------------ a peça do meio da praça
// O farol (praia), o pinheirão enfeitado (neve) ou o pagode (outono). Empurra nos lotes e devolve
// a função que anima (luzes que piscam). world: para os colisores.
export function pecaDaPraca(g, L, world, x, z, decor) {
  const colisor = (r, h) => world.addBox({ min: [x - r, 0, z - r], max: [x + r, h, z + r] });
  if (TEMA.id === 'tropical') {
    // farol listrado de vermelho e branco, com a sala da luz em cima
    const faixas = 8;
    const alt = 15;
    for (let i = 0; i < faixas; i++) {
      const r0 = 2.6 - (i / faixas) * 0.9;
      const r1 = 2.6 - ((i + 1) / faixas) * 0.9;
      L.cores.push(pintar(new THREE.CylinderGeometry(r1, r0, alt / faixas, 18).translate(x, alt / faixas / 2 + (i * alt) / faixas, z), i % 2 ? '#f8fafc' : '#dc2626'));
    }
    L.cores.push(
      pintar(new THREE.CylinderGeometry(3.4, 3.8, 0.9, 18).translate(x, 0.45, z), '#9ca3af'),
      pintar(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 18).translate(x, alt + 0.15, z), '#1f2937'),
      pintar(new THREE.CylinderGeometry(1.25, 1.25, 0.2, 14).translate(x, alt + 2.25, z), '#1f2937'),
      pintar(new THREE.ConeGeometry(1.45, 1.4, 14).translate(x, alt + 3.05, z), '#dc2626'),
    );
    // o parapeito da galeria
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      L.ferro.push(new THREE.BoxGeometry(0.06, 0.8, 0.06).translate(x + Math.cos(a) * 2.2, alt + 0.7, z + Math.sin(a) * 2.2));
    }
    L.ferro.push(new THREE.TorusGeometry(2.2, 0.05, 4, 32).rotateX(Math.PI / 2).translate(x, alt + 1.1, z));
    const luz = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 14), new THREE.MeshBasicMaterial({ color: 0xfff1b8, toneMapped: false }));
    luz.position.set(x, alt + 1.25, z);
    g.add(luz);
    colisor(3.8, alt);
    return;
  }
  if (TEMA.id === 'neve') {
    // o pinheirão: um pinheiro de 18 m com bolas coloridas e a estrela
    const s = 2.1;
    const arvore = (DETALHE ? geoPinheiro : geoPinheiroSimples)(true).scale(s, s, s).translate(x, 0, z);
    L.cores.push(arvore);
    const rnd = semente(5);
    const cores = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#f472b6', '#f97316'];
    const bolas = [];
    for (let i = 0; i < 60; i++) {
      const y = 3.5 + rnd() * 15;
      const r = (1 - (y - 3) / 17) * 5.4 + 0.3;
      const a = rnd() * Math.PI * 2;
      bolas.push(pintar(new THREE.IcosahedronGeometry(0.32, 1).translate(x + Math.cos(a) * r, y, z + Math.sin(a) * r), cores[i % cores.length]));
    }
    const enfeites = new THREE.Mesh(juntar(bolas), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    const estrela = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0).scale(1, 1.3, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false }));
    estrela.position.set(x, 21.2, z);
    g.add(enfeites, estrela);
    decor.push((t) => { estrela.rotation.y = t * 0.8; });
    // a base: um canteiro redondo de neve
    L.neve.push(new THREE.CylinderGeometry(4.6, 5, 0.6, 24).translate(x, 0.3, z));
    colisor(4.2, 6);
    return;
  }
  // o pagode de cinco andares: cada andar um bloco escuro e um telhado largo que vai diminuindo
  L.pedra.push(new THREE.BoxGeometry(9, 0.8, 9).translate(x, 0.4, z));
  let y = 0.8;
  for (let i = 0; i < 5; i++) {
    const lado = 5.4 - i * 0.7;
    const h = 2.2 - i * 0.15;
    L.cores.push(pintar(new THREE.BoxGeometry(lado, h, lado).translate(x, y + h / 2, z), '#3b2620'));
    // pilares vermelhos nos cantos
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      L.vermelho.push(new THREE.BoxGeometry(0.3, h, 0.3).translate(x + (sx * lado) / 2, y + h / 2, z + (sz * lado) / 2));
    }
    y += h;
    const telhado = lado + 2.6;
    L.cores.push(pintar(new THREE.ConeGeometry(telhado * 0.75, 1.1, 4).rotateY(Math.PI / 4).translate(x, y + 0.45, z), '#2b2b33'));
    y += 0.5;
  }
  L.cores.push(pintar(new THREE.CylinderGeometry(0.12, 0.18, 4.2, 8).translate(x, y + 2.1, z), '#d4a017'));
  for (let k = 0; k < 6; k++) L.cores.push(pintar(new THREE.TorusGeometry(0.42 - k * 0.04, 0.07, 5, 14).rotateX(Math.PI / 2).translate(x, y + 0.9 + k * 0.5, z), '#d4a017'));
  colisor(4.5, y);
}

// ------------------------------------------------------------------ texturas
// rua: u atravessa, v vai ao longo. Sem guia: o meio-fio é uma faixa embaixo (cidade.js)
export function texturaRua() {
  const tipo = TEMA.rua.tipo;
  // deque de tábuas atravessadas (a foto: 12 tábuas a cada repetição)
  if (tipo === 'madeira' && DETALHE) return texturaFoto('madeira');
  if (tipo === 'madeira') {
    // nas simples: tábuas desenhadas, com frestas
    return textura(256, 256, (ctx, w, h) => {
      for (let i = 0; i < 8; i++) {
        const tom = 150 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${tom},${Math.round(tom * 0.72)},${Math.round(tom * 0.47)})`;
        ctx.fillRect(0, (i * h) / 8, w, h / 8);
        ctx.fillStyle = 'rgba(40,20,5,0.55)';
        ctx.fillRect(0, (i * h) / 8, w, 3);
        ctx.fillStyle = 'rgba(40,20,5,0.25)';
        for (const px of [w * 0.2 + i * 13, w * 0.7 - i * 7]) ctx.fillRect(px % w, (i * h) / 8 + 6, 4, 4);
      }
    }, { repetir: true });
  }
  if (tipo === 'cascalho') {
    // cascalho claro varrido em linhas (como no jardim de pedras), com pedras de pisar no meio
    return textura(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#cdbf9f';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const t = 150 + Math.floor(Math.random() * 70);
        ctx.fillStyle = `rgba(${t},${t - 10},${t - 30},0.55)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.strokeStyle = 'rgba(90,75,55,0.22)';
      ctx.lineWidth = 2;
      for (let x = 10; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // pedras de pisar
      for (const [y, dx] of [[40, -10], [128, 14], [210, -6]]) {
        ctx.fillStyle = '#a8a196';
        ctx.beginPath();
        ctx.ellipse(w / 2 + dx, y, 46, 30, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(w / 2 + dx - 8, y - 6, 26, 14, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }, { repetir: true });
  }
  // pedra (a da vila de neve: paralelepípedos com neve nos cantos)
  return textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7e7f86';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) {
      for (let x = -1; x < 9; x++) {
        const tom = 120 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${tom},${tom + 2},${tom + 8})`;
        roundRect(ctx, x * 32 + (y % 2) * 16 + 2, y * 32 + 2, 28, 28, 6);
        ctx.fill();
      }
    }
    // neve varrida para as beiradas
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(250,252,255,0.95)');
    g.addColorStop(0.16, 'rgba(250,252,255,0)');
    g.addColorStop(0.84, 'rgba(250,252,255,0)');
    g.addColorStop(1, 'rgba(250,252,255,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(250,252,255,0.6)';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repetir: true });
}

// o relevo (foto) que a cidade põe junto do piso, na mesma repetição (nas simples, nenhum)
function comRelevo(nome, t) {
  if (DETALHE) t.userData.relevo = nome;
  return t;
}

// piso dos retângulos (praça dos jogos): deque, lajes com neve ou cascalho varrido
export function texturaPiso() {
  if (TEMA.piso === 'deck' && !DETALHE) {
    // nas simples: tábuas desenhadas, de pé
    return textura(256, 256, (ctx, w, h) => {
      for (let i = 0; i < 8; i++) {
        const tom = 165 + Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${tom},${Math.round(tom * 0.75)},${Math.round(tom * 0.52)})`;
        ctx.fillRect((i * w) / 8, 0, w / 8, h);
        ctx.fillStyle = 'rgba(40,20,5,0.4)';
        ctx.fillRect((i * w) / 8, 0, 3, h);
      }
    }, { repetir: true });
  }
  // a foto do deque de pé (tábuas no sentido z); metros: o lado de cada repetição
  if (TEMA.piso === 'deck') {
    const t = texturaFoto('madeira');
    t.rotation = Math.PI / 2;
    t.userData.metros = 3;
    t.userData.relevo = 'madeira';
    return t;
  }
  if (TEMA.piso === 'cascalho') {
    return comRelevo('cascalho', textura(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#d6cbb0';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        const t = 160 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgba(${t},${t - 8},${t - 28},0.5)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // ondas varridas no ancinho
      ctx.strokeStyle = 'rgba(95,80,60,0.25)';
      ctx.lineWidth = 2.2;
      for (let y = 6; y < h; y += 12) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 2) * 4);
        ctx.stroke();
      }
    }, { repetir: true }));
  }
  // lajes de pedra com neve nas juntas
  return comRelevo('neve', textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2f6fb';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const tom = 150 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${tom},${tom + 4},${tom + 12})`;
        roundRect(ctx, x * 64 + 5, y * 64 + 5, 54, 54, 6);
        ctx.fill();
      }
    }
  }, { repetir: true }));
}

// o chão da praça do meio (um círculo, raio R na textura inteira)
export function texturaPracaCentral(R) {
  return textura(1024, 1024, (ctx, w) => {
    const c = w / 2;
    const m = (metros) => (metros / R) * (w / 2);
    const anel = (raio, larg, cor) => {
      ctx.beginPath();
      ctx.arc(c, c, m(raio), 0, Math.PI * 2);
      ctx.lineWidth = m(larg);
      ctx.strokeStyle = cor;
      ctx.stroke();
    };
    if (TEMA.id === 'tropical') {
      // calçadão de ondas pretas e brancas, na areia clara
      ctx.fillStyle = '#efe6d0';
      ctx.fillRect(0, 0, w, w);
      const onda = (raio, amp, n, larg, cor) => {
        ctx.beginPath();
        for (let i = 0; i <= 720; i++) {
          const a = (i / 720) * Math.PI * 2;
          const r = m(raio + amp * Math.sin(a * n));
          if (i) ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
          else ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        }
        ctx.lineWidth = m(larg);
        ctx.strokeStyle = cor;
        ctx.stroke();
      };
      anel(R - 1, 1.6, '#1f2a33');
      for (const f of [0.82, 0.7, 0.58, 0.46]) onda(R * f, 1.4, 18, 1.4, '#1f2a33');
      anel(5.2, 0.6, '#b45309');
      return;
    }
    if (TEMA.id === 'neve') {
      // pedra com neve: lajes em anéis e neve fofa por cima, mais grossa na beirada
      ctx.fillStyle = '#c9ced6';
      ctx.fillRect(0, 0, w, w);
      for (let k = 2; k < 14; k++) {
        const r0 = (k / 14) * R;
        const n = Math.round(k * 7);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const tom = 150 + Math.floor(Math.random() * 40);
          ctx.fillStyle = `rgb(${tom},${tom + 4},${tom + 12})`;
          ctx.beginPath();
          ctx.arc(c, c, m(r0 + 0.95), a0 + 0.01, a0 + (Math.PI * 2) / n - 0.01);
          ctx.arc(c, c, m(r0 + 0.1), a0 + (Math.PI * 2) / n - 0.01, a0 + 0.01, true);
          ctx.closePath();
          ctx.fill();
        }
      }
      const g = ctx.createRadialGradient(c, c, m(R * 0.5), c, c, m(R));
      g.addColorStop(0, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
      anel(R - 0.8, 1.2, '#ffffff');
      return;
    }
    // jardim de pedras: cascalho varrido em círculos em volta do pagode
    ctx.fillStyle = '#d9cfb6';
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 26000; i++) {
      const t = 170 + Math.floor(Math.random() * 50);
      ctx.fillStyle = `rgba(${t},${t - 8},${t - 28},0.45)`;
      ctx.fillRect(Math.random() * w, Math.random() * w, 3, 3);
    }
    for (let r = 6; r < R - 1; r += 0.9) anel(r, 0.18, 'rgba(95,80,60,0.3)');
    anel(R - 0.6, 1.2, '#4a4038');
  });
}
