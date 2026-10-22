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
export const relevoFoto = (nome) => texturaFoto(`${nome}-n`, { cor: false });

// o relevo das tábuas, quando a rua do tema é de madeira (a mesma repetição da texturaRua)
export function relevoRua() {
  return TEMA.rua.tipo === 'madeira' ? relevoFoto('deque') : null;
}

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
  return geo;
}

function geoPinheiro(neve) {
  const partes = [pintar(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5b3d2a')];
  const camadas = [[2.7, 4.4, 4.6, '#2e6a41'], [2.1, 3.8, 6.7, '#357a48'], [1.35, 3.2, 8.6, '#3d8a51']];
  for (const [r, h, y, cor] of camadas) {
    partes.push(pintar(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0), neve ? '#245a3c' : cor));
    // neve: um cone branco menor, por cima da metade de cima de cada camada
    if (neve) partes.push(pintar(new THREE.ConeGeometry(r * 0.78, h * 0.55, 7, 1, true).translate(0, y + h * 0.24, 0), '#f6f9fc'));
  }
  return juntar(partes);
}

function geoCopa(cores, tronco = '#6a4a33', altura = 1) {
  const s = altura;
  return juntar([
    pintar(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 4.4 * s, 6, 1, true).translate(0, 2.2 * s, 0), tronco),
    pintar(new THREE.IcosahedronGeometry(2.7 * s, 0).scale(1, 0.85, 1).translate(0, 5.6 * s, 0), cores[0]),
    pintar(new THREE.IcosahedronGeometry(1.9 * s, 0).translate(1.4 * s, 6.6 * s, 0.6 * s), cores[1]),
    pintar(new THREE.IcosahedronGeometry(1.7 * s, 0).translate(-1.3 * s, 6.2 * s, -0.8 * s), cores[2]),
    pintar(new THREE.IcosahedronGeometry(1.4 * s, 0).translate(0.2 * s, 7.4 * s, -0.9 * s), cores[0]),
  ]);
}

// bordo japonês: tronco escuro inclinado e uma copa larga e baixa, em camadas, vermelha
function geoBordo() {
  const partes = [
    pintar(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6, 1, true).translate(0, 1.6, 0).rotateZ(0.12), '#3e2a22'),
    pintar(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5, 1, true).translate(0, 1.1, 0).rotateZ(-0.7).translate(0.4, 2.8, 0), '#3e2a22'),
  ];
  const nuvens = [[0, 4.4, 0, 2.9, '#c2261b'], [1.8, 4.0, 0.8, 2.0, '#e0461d'], [-1.6, 4.1, -0.6, 2.1, '#a51d16'], [0.4, 5.4, -0.4, 2.0, '#ef6a24'], [-0.5, 4.8, 1.4, 1.7, '#d93a1b']];
  for (const [x, y, z, r, cor] of nuvens) partes.push(pintar(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.62, 1).translate(x, y, z), cor));
  return juntar(partes);
}

function geoCerejeira() {
  const partes = [
    pintar(new THREE.CylinderGeometry(0.24, 0.4, 3.4, 6, 1, true).translate(0, 1.7, 0), '#4a3030'),
    pintar(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5, 1, true).translate(0, 1.2, 0).rotateZ(0.8).translate(-0.4, 2.9, 0), '#4a3030'),
  ];
  const nuvens = [[0, 4.8, 0, 2.6, '#f9a8d4'], [-1.9, 4.3, 0.5, 1.9, '#fbcfe8'], [1.7, 4.5, -0.6, 2.0, '#f472b6'], [0.3, 5.9, 0.4, 1.8, '#fbcfe8'], [0.6, 4.4, 1.7, 1.6, '#f9a8d4']];
  for (const [x, y, z, r, cor] of nuvens) partes.push(pintar(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).translate(x, y, z), cor));
  return juntar(partes);
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

// Árvores do tema: { nome: geometria }. As que o tema não usa nem são feitas.
export function arvoresDoTema() {
  const feitas = {
    palmeira: () => geoCoqueiro(9.5, 9, 3),
    palmeiraBaixa: () => geoCoqueiro(6, 10, 8),
    pinheiro: () => geoPinheiro(false),
    pinheiroNeve: () => geoPinheiro(true),
    frondosa: () => geoCopa(['#5c8f3e', '#68a046', '#4f8238']),
    frondosaOutono: () => geoCopa(['#d9a21b', '#e8b931', '#c4801a'], '#5a3f2a'),
    bordo: geoBordo,
    cerejeira: geoCerejeira,
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
    const arvore = geoPinheiro(true).scale(s, s, s).translate(x, 0, z);
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
  if (tipo === 'madeira') return texturaFoto('deque');
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

// piso dos retângulos (praça dos jogos): deque, lajes com neve ou cascalho varrido
export function texturaPiso() {
  // a foto do deque de pé (tábuas no sentido z); metros: o lado de cada repetição
  if (TEMA.piso === 'deck') {
    const t = texturaFoto('deque');
    t.rotation = Math.PI / 2;
    t.userData.metros = 3;
    t.userData.relevo = 'deque';
    return t;
  }
  if (TEMA.piso === 'cascalho') {
    return textura(256, 256, (ctx, w, h) => {
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
    }, { repetir: true });
  }
  // lajes de pedra com neve nas juntas
  return textura(256, 256, (ctx, w, h) => {
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
  }, { repetir: true });
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
