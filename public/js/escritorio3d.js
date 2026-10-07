// O escritório em 3D (a planta está em escritorio.js): prédio, recepção, corredor e uma sala por
// departamento, cada uma com a cara do setor. Quem chama é o World, dentro de world.area(): tudo
// o que é criado aqui (objetos, colisões, luzes) liga, desliga e é desmontado junto.
//
// Cada sala é montada no próprio sistema de coordenadas: parede do fundo em z = -D (é onde ficam
// as telas), porta para o corredor em z = +D. As salas do lado sul são as mesmas, giradas 180°;
// as da fileira dos fundos ficam como as do norte, com o corredor dos fundos na frente.
// As telas e o telão não são criados aqui: a função devolve onde ficam e o World cria (ele é que
// sabe ligar vídeo nelas).
//
// Peças repetidas (cadeiras, monitores, baias) são instanciadas, e cada sala tem uma luz no teto
// — o World só acende as mais perto da câmera. As peças soltas que sobram são mescladas por
// material no fim (juntarSoltas): a casca do prédio e cada sala viram poucos desenhos.
//
// Cada sala (e cada lounge) é uma célula: um grupo que o World pode esconder quando a câmera não
// tem como ver dentro dela (as luzes das salas ficam fora dos grupos, na raiz).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PREDIO, zDaPorta } from './escritorio.js';
import { criarPerifericos } from './perifericos.js';
import * as qualidade from './qualidade.js';

const FONTE = "'Plus Jakarta Sans', system-ui, sans-serif";
const H = PREDIO.altura;
const T = 0.3; // espessura das paredes
const PORTA = 4; // largura da porta de cada sala
const _o = new THREE.Object3D();
const dinheiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

// ------------------------------------------------------------------ ajudantes
// Levas de fontes que terminaram de carregar. Um painel que chega igual ao último desenho não é
// redesenhado, mas a fonte que chegou depois dele conta como mudança (ver quadro()).
let fontes = 0;
document.fonts?.addEventListener?.('loadingdone', () => { fontes++; });

// Cartazes, painéis e placas (texto, sem repetição) no tamanho do aparelho: no celular e no PC de
// até 4 GB o canvas tem menos pixels (qualidade.js; sem a constante lá, tamanho cheio). As
// texturas que se repetem (piso, grade, jardim...) ficam no tamanho cheio.
const NO_APARELHO = { escala: qualidade.ESCALA_TEXTURA ?? 1 };

// Textura desenhada num canvas. O desenho é sempre em w×h lógicos; o canvas tem w×h × escala.
// redesenhar(...args) não faz nada se os argumentos são os mesmos do último desenho: os painéis
// de TI, Central, Gestão e o placar chegam a cada 5 s quase sempre iguais, e cada desenho sobe a
// textura inteira (com mipmaps) para a placa de vídeo.
function quadro(w, h, desenhar, { escala = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let ultimo = null;
  const redesenhar = (...args) => {
    const chave = `${fontes}|${JSON.stringify(args)}`;
    if (chave === ultimo) return;
    ultimo = chave;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    desenhar(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  redesenhar();
  return { tex, redesenhar };
}

const mat = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...extra });
const brilho = (cor) => new THREE.MeshBasicMaterial({ color: cor, toneMapped: false });

// cópia só dos dados: o clone() roda de novo o construtor da forma (o do RoundedBox é caro)
const copiaGeo = (geo) => new THREE.BufferGeometry().copy(geo);

// Uma geometria só a partir de várias (já no lugar). Indexadas e não indexadas (Icosahedron,
// Extrude, RoundedBox) não se misturam no mergeGeometries: aí todas viram não indexadas.
// Devolve null se não deu para juntar.
function juntarGeos(geos) {
  if (geos.length === 1) return geos[0];
  const mistura = geos.some((g) => g.index) && geos.some((g) => !g.index);
  return mergeGeometries(mistura ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos);
}

// Uma peça feita de partes, repetida em vários lugares: uma InstancedMesh por material (as partes
// do mesmo material e com a mesma sombra viram uma geometria só).
// partes: [{ geo, mat, pos: [x, y, z], giro?: [rx, ry, rz], sombra? }]; lugares: [[x, z, giroY]]
function repetir(grupo, partes, lugares) {
  if (!lugares.length) return;
  const lotes = new Map();
  for (const p of partes) {
    const chave = `${p.mat.uuid}:${p.sombra !== false}`;
    if (!lotes.has(chave)) lotes.set(chave, { mat: p.mat, sombra: p.sombra !== false, geos: [] });
    const local = new THREE.Matrix4().makeTranslation(...p.pos);
    if (p.giro) local.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.giro)));
    // cópia: a mesma geometria às vezes serve a várias peças (os painéis hexagonais)
    lotes.get(chave).geos.push(copiaGeo(p.geo).applyMatrix4(local));
  }
  for (const { mat: material, sombra, geos } of lotes.values()) {
    const malha = new THREE.InstancedMesh(juntarGeos(geos), material, lugares.length);
    lugares.forEach(([x, z, ry = 0], i) => {
      _o.position.set(x, 0, z);
      _o.rotation.set(0, ry, 0);
      _o.updateMatrix();
      malha.setMatrixAt(i, _o.matrix);
    });
    malha.castShadow = sombra;
    malha.receiveShadow = true;
    malha.computeBoundingSphere();
    grupo.add(malha);
  }
}

// Mescla os filhos soltos de um grupo (Mesh comum, sem filhos, à vista, um material só) que têm o
// mesmo material e as mesmas flags de sombra: a casca do prédio e o miúdo de cada sala viram poucos
// desenhos. Ficam soltos: os de `fixas` (paredes que barram a câmera, o letreiro e o logo, que o
// setLogo mexe), os com userData.anima e os transparentes de lotes diferentes — transparente é
// ordenado pela distância do centro, e uma malha do prédio inteiro passaria na frente (ou atrás)
// de tudo; só se juntam os que nasceram como uma peça (userData.lote).
function juntarSoltas(grupo, fixas) {
  const lotes = new Map();
  for (const o of grupo.children) {
    if (!o.isMesh || o.isInstancedMesh || o.children.length || !o.visible || Array.isArray(o.material)) continue;
    if (fixas.has(o) || o.userData.anima) continue;
    const m = o.material;
    const chave = `${m.uuid}:${o.castShadow}:${o.receiveShadow}${m.transparent ? `:${o.userData.lote ?? o.uuid}` : ''}`;
    if (!lotes.has(chave)) lotes.set(chave, []);
    lotes.get(chave).push(o);
  }
  for (const lista of lotes.values()) {
    if (lista.length < 2) continue;
    // a matriz local de cada peça vai para dentro da geometria (sem o updateMatrix, cairia tudo na origem)
    const geo = juntarGeos(lista.map((o) => { o.updateMatrix(); return copiaGeo(o.geometry).applyMatrix4(o.matrix); }));
    if (!geo) continue;
    const { material, castShadow, receiveShadow } = lista[0];
    const junta = new THREE.Mesh(geo, material);
    junta.castShadow = castShadow;
    junta.receiveShadow = receiveShadow;
    for (const o of lista) {
      grupo.remove(o);
      o.geometry.dispose();
    }
    grupo.add(junta);
  }
}

function caixa(grupo, [w, h, d], [x, y, z], material, { sombra = true, arredondada = 0 } = {}) {
  const geo = arredondada ? new RoundedBoxGeometry(w, h, d, 2, arredondada) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = sombra;
  m.receiveShadow = true;
  grupo.add(m);
  return m;
}

function plano(grupo, [w, h], [x, y, z], material, giro = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.set(...giro);
  m.receiveShadow = true;
  grupo.add(m);
  return m;
}

// ------------------------------------------------------------------ móveis
// cadeira de escritório (quem senta olha para -z)
function partesCadeira({ tecido, metal, encosto = 0.75 }) {
  return [
    { geo: new RoundedBoxGeometry(0.62, 0.12, 0.6, 2, 0.05), mat: tecido, pos: [0, 0.55, 0] },
    { geo: new RoundedBoxGeometry(0.6, encosto, 0.09, 2, 0.04), mat: tecido, pos: [0, 0.6 + encosto / 2, 0.29] },
    { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), mat: metal, pos: [0, 0.27, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.3, 0.32, 0.06, 5), mat: metal, pos: [0, 0.04, 0], sombra: false },
  ];
}

// cadeira gamer: concha preta com faixas coloridas, abas laterais, almofada de cabeça e braços.
// Na sombra entram só as peças pretas: a das faixas e da almofada caía dentro da do assento e do
// encosto (e as faixas, todas de um material, viram um desenho a menos na passada de sombra).
function partesCadeiraGamer(cor) {
  const preto = mat(0x0f1115, { roughness: 0.55 });
  const faixa = mat(cor, { roughness: 0.45 });
  const metal = mat(0x2b2f36, { roughness: 0.3, metalness: 0.7 });
  const encosto = [-0.12, 0, 0]; // levemente reclinado
  return [
    { geo: new THREE.CylinderGeometry(0.36, 0.38, 0.06, 5), mat: metal, pos: [0, 0.05, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), mat: metal, pos: [0, 0.3, 0], sombra: false },
    { geo: new RoundedBoxGeometry(0.66, 0.14, 0.62, 2, 0.06), mat: preto, pos: [0, 0.58, 0] },
    { geo: new RoundedBoxGeometry(0.09, 0.16, 0.6, 2, 0.04), mat: faixa, pos: [-0.31, 0.66, 0], sombra: false },
    { geo: new RoundedBoxGeometry(0.09, 0.16, 0.6, 2, 0.04), mat: faixa, pos: [0.31, 0.66, 0], sombra: false },
    { geo: new RoundedBoxGeometry(0.6, 1.15, 0.14, 2, 0.06), mat: preto, pos: [0, 1.22, 0.33], giro: encosto },
    { geo: new RoundedBoxGeometry(0.1, 1.05, 0.16, 2, 0.04), mat: faixa, pos: [-0.27, 1.2, 0.34], giro: encosto, sombra: false },
    { geo: new RoundedBoxGeometry(0.1, 1.05, 0.16, 2, 0.04), mat: faixa, pos: [0.27, 1.2, 0.34], giro: encosto, sombra: false },
    { geo: new RoundedBoxGeometry(0.3, 0.16, 0.12, 2, 0.05), mat: faixa, pos: [0, 1.62, 0.33], giro: encosto, sombra: false },
    { geo: new THREE.BoxGeometry(0.07, 0.05, 0.38), mat: preto, pos: [-0.4, 0.86, 0.02] },
    { geo: new THREE.BoxGeometry(0.07, 0.05, 0.38), mat: preto, pos: [0.4, 0.86, 0.02] },
    { geo: new THREE.BoxGeometry(0.05, 0.28, 0.05), mat: metal, pos: [-0.4, 0.72, 0.05], sombra: false },
    { geo: new THREE.BoxGeometry(0.05, 0.28, 0.05), mat: metal, pos: [0.4, 0.72, 0.05], sombra: false },
  ];
}

function plantas(grupo, lugares) {
  repetir(grupo, [
    { geo: new THREE.CylinderGeometry(0.45, 0.34, 0.8, 14), mat: mat(0xd8d2c6), pos: [0, 0.4, 0] },
    { geo: new THREE.IcosahedronGeometry(0.75, 0), mat: mat(0x3f7d4a, { flatShading: true }), pos: [0, 1.4, 0] },
    { geo: new THREE.IcosahedronGeometry(0.55, 0), mat: mat(0x4f8f57, { flatShading: true }), pos: [0.2, 1.95, -0.1] },
  ], lugares);
}

// os 3 lugares de um sofá (centro x/z, virado para ry): chama f(x, z) para cada um
function lugaresDoSofa(x, z, ry, f) {
  for (const dx of [-0.95, 0, 0.95]) f(x + dx * Math.cos(ry) - 0.1 * Math.sin(ry), z - dx * Math.sin(ry) - 0.1 * Math.cos(ry));
}

function sofa(grupo, cor, lugares) {
  const tecido = mat(cor, { roughness: 0.9 });
  const almofada = mat(new THREE.Color(cor).offsetHSL(0, 0, 0.08), { roughness: 0.95 });
  repetir(grupo, [
    { geo: new RoundedBoxGeometry(3.2, 0.5, 1.1, 2, 0.12), mat: tecido, pos: [0, 0.3, 0] },
    { geo: new RoundedBoxGeometry(2.9, 0.2, 0.95, 2, 0.08), mat: almofada, pos: [0, 0.62, -0.05] },
    { geo: new RoundedBoxGeometry(3.2, 0.8, 0.3, 2, 0.1), mat: tecido, pos: [0, 0.85, 0.42] },
    { geo: new RoundedBoxGeometry(0.3, 0.55, 1.1, 2, 0.1), mat: tecido, pos: [-1.45, 0.65, 0] },
    { geo: new RoundedBoxGeometry(0.3, 0.55, 1.1, 2, 0.1), mat: tecido, pos: [1.45, 0.65, 0] },
  ], lugares);
}

// placa com texto (nome de sala, recepção)
function placa(texto, cor, { w = 1024, h = 256, sub = '' } = {}) {
  return quadro(w, h, (ctx, W, H2) => {
    ctx.fillStyle = '#0f131b';
    ctx.fillRect(0, 0, W, H2);
    ctx.fillStyle = cor;
    ctx.fillRect(0, H2 - 14, W, 14);
    ctx.beginPath();
    ctx.arc(H2 * 0.38, H2 * 0.45, H2 * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${Math.round(H2 * 0.42)}px ${FONTE}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, H2 * 0.7, sub ? H2 * 0.38 : H2 * 0.47, W - H2);
    if (sub) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 ${Math.round(H2 * 0.18)}px ${FONTE}`;
      ctx.fillText(sub, H2 * 0.7, H2 * 0.72, W - H2);
    }
  }, NO_APARELHO);
}

// ------------------------------------------------------------------ placa da porta de cada sala
// A placa tem a cara do setor: o ícone num quadrado na cor da sala, o nome, uma linha do que se
// faz ali e, à direita, um desenho que é a cara do lugar (trilhas de circuito no TI, o gráfico
// subindo no Comercial, a mesa vista de cima na Reunião...). Ícones em traço, no estilo Lucide
// (24×24) como os de icons.js.
const ICONES_DAS_PLACAS = {
  chip: ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z', 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2'],
  alta: ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'],
  headset: ['M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z', 'M21 16v2a4 4 0 0 1-4 4h-5'],
  pessoas: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  moeda: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5', 'M12 6.5V8M12 16v1.5'],
  coracao: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  megafone: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  alvo: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0'],
  cafe: ['M6 2v2M10 2v2M14 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'],
};

// Desenhos do lado direito das placas, em 1536×400 lógicos. Saem com força total: a camada
// inteira é esmaecida depois (placaDaSala). r: sorteio com semente (sai igual em todo navegador).
const MOTIVOS = {
  circuito(c, w, h, cor, r) {
    c.strokeStyle = c.fillStyle = cor;
    c.lineWidth = 5;
    for (let y = 36; y < h - 20; y += 38) {
      let x = 760 + r() * 260;
      const d = (r() < 0.5 ? -1 : 1) * (14 + r() * 22);
      c.beginPath();
      c.arc(x, y, 8, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(x + 8, y);
      x += 80 + r() * 220;
      c.lineTo(x, y);
      x += Math.abs(d);
      c.lineTo(x, y + d);
      x += 80 + r() * 300;
      c.lineTo(x, y + d);
      c.stroke();
      c.beginPath();
      c.arc(x + 9, y + d, 9, 0, Math.PI * 2);
      c.fill();
    }
  },
  grafico(c, w, h, cor) {
    c.strokeStyle = cor;
    c.lineWidth = 2;
    c.globalAlpha = 0.45;
    for (let y = 60; y < h; y += 70) {
      c.beginPath();
      c.moveTo(560, y);
      c.lineTo(w, y);
      c.stroke();
    }
    const pts = [[600, 340], [720, 296], [830, 318], [950, 232], [1070, 252], [1200, 160], [1320, 178], [1470, 66]];
    const linha = () => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    };
    const area = c.createLinearGradient(0, 60, 0, h);
    area.addColorStop(0, cor);
    area.addColorStop(1, 'rgba(0,0,0,0)');
    linha();
    c.lineTo(1470, h);
    c.lineTo(600, h);
    c.fillStyle = area;
    c.fill();
    c.globalAlpha = 1;
    linha();
    c.lineWidth = 8;
    c.stroke();
    c.fillStyle = cor;
    for (const [x, y] of pts) {
      c.beginPath();
      c.arc(x, y, 11, 0, Math.PI * 2);
      c.fill();
    }
  },
  ondas(c, w, h, cor) {
    c.strokeStyle = c.fillStyle = cor;
    for (let i = 0; i < 8; i++) {
      c.globalAlpha = 1 - i * 0.1;
      c.lineWidth = 7 - i * 0.5;
      c.beginPath();
      c.arc(1500, h / 2, 50 + i * 72, Math.PI * 0.68, Math.PI * 1.32);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(1500, h / 2, 18, 0, Math.PI * 2);
    c.fill();
  },
  // a mesa oval da sala, vista de cima, com as 10 cadeiras em volta
  mesa(c, w, h, cor) {
    const cx = 1190;
    const cy = h / 2;
    c.strokeStyle = c.fillStyle = cor;
    c.lineWidth = 6;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.ellipse(cx, cy, 220, 86, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      c.beginPath();
      c.arc(cx + Math.cos(a) * 272, cy + Math.sin(a) * 132, 24, 0, Math.PI * 2);
      c.fill();
    }
  },
  // velas de cotação subindo (cheia: subiu; vazada: desceu)
  velas(c, w, h, cor, r) {
    c.strokeStyle = c.fillStyle = cor;
    c.lineWidth = 4;
    let y = 330;
    for (let i = 0; i < 12; i++) {
      const x = 600 + i * 76;
      const sobe = r() < 0.72;
      const corpo = 20 + r() * 36;
      const y1 = Math.max(60, sobe ? y - corpo : y + corpo * 0.6);
      c.beginPath();
      c.moveTo(x, Math.min(y, y1) - 12 - r() * 18);
      c.lineTo(x, Math.max(y, y1) + 12 + r() * 18);
      c.stroke();
      if (sobe) c.fillRect(x - 18, y1, 36, y - y1);
      else c.strokeRect(x - 16, y, 32, y1 - y);
      y = y1;
    }
  },
  // a equipe: bustos lado a lado, de tamanhos e cores diferentes
  equipe(c, w, h, cor, r) {
    const cores = [cor, '#fdba74', '#f9a8d4', '#fcd34d', '#fb7185'];
    for (let i = 0; i < 7; i++) {
      const x = 780 + i * 116 + r() * 20;
      const k = 0.8 + r() * 0.45;
      c.fillStyle = cores[i % cores.length];
      c.beginPath();
      c.arc(x, h - 150 * k, 34 * k, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(x, h + 10, 62 * k, 100 * k, 0, Math.PI, 0);
      c.fill();
    }
  },
  // confete nas cores da parede criativa da sala
  confete(c, w, h, cor, r) {
    const cores = ['#e879f9', '#38bdf8', '#fbbf24', '#34d399', '#f87171'];
    for (let i = 0; i < 46; i++) {
      c.save();
      c.translate(580 + r() * 940, 20 + r() * 360);
      c.rotate(r() * Math.PI);
      c.fillStyle = cores[i % cores.length];
      c.beginPath();
      if (i % 3 === 0) c.rect(-16, -6, 32, 12);
      else if (i % 3 === 1) c.arc(0, 0, 9, 0, Math.PI * 2);
      else {
        c.moveTo(0, -13);
        c.lineTo(12, 9);
        c.lineTo(-12, 9);
      }
      c.fill();
      c.restore();
    }
  },
  // alvo com a flecha cravada no meio
  alvo(c, w, h, cor) {
    const cx = 1380;
    const cy = h / 2;
    c.strokeStyle = c.fillStyle = cor;
    c.lineWidth = 6;
    for (let raio = 50; raio < 340; raio += 62) {
      c.beginPath();
      c.arc(cx, cy, raio, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.arc(cx, cy, 20, 0, Math.PI * 2);
    c.fill();
    // flecha da cauda até o centro, com duas penas em V na cauda
    const [tx, ty] = [cx - 300, cy + 170];
    const [ux, uy] = [0.87, -0.49]; // direção da flecha
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(tx, ty);
    c.lineTo(cx - 14, cy + 8);
    c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    for (const k of [12, 42]) {
      const [px, py] = [tx + ux * k, ty + uy * k];
      for (const lado of [-1, 1]) {
        c.moveTo(px, py);
        c.lineTo(px - ux * 30 - uy * 24 * lado, py - uy * 30 + ux * 24 * lado);
      }
    }
    c.stroke();
  },
  // grãos de café espalhados
  graos(c, w, h, cor, r) {
    for (let i = 0; i < 16; i++) {
      c.save();
      c.translate(600 + r() * 920, 30 + r() * 340);
      c.rotate(r() * Math.PI);
      c.fillStyle = '#6f4a2e';
      c.beginPath();
      c.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#d9c3a5';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-24, 0);
      c.bezierCurveTo(-8, -10, 8, 10, 24, 0);
      c.stroke();
      c.restore();
    }
  },
};

// sub: a linha de baixo; fundo: degradê da placa; claro: placa clara (letras escuras)
const CARA_DAS_SALAS = {
  ti: { sub: 'Tecnologia · Sistemas', fundo: ['#081221', '#0f1d33'], icone: 'chip', motivo: 'circuito' },
  comercial: { sub: 'Vendas · Metas', fundo: ['#17130b', '#2a200c'], icone: 'alta', motivo: 'grafico' },
  telemarketing: { sub: 'Central de atendimento', fundo: ['#1c0b1b', '#2c1031'], icone: 'headset', motivo: 'ondas' },
  reuniao: { sub: 'Sala de reunião', fundo: ['#120f20', '#211a38'], icone: 'pessoas', motivo: 'mesa' },
  financeiro: { sub: 'Contas · Indicadores', fundo: ['#06140f', '#0c241b'], icone: 'moeda', motivo: 'velas' },
  rh: { sub: 'Pessoas · Cultura', fundo: ['#fff8ef', '#fde6cc'], claro: true, icone: 'coracao', motivo: 'equipe' },
  marketing: { sub: 'Marca · Campanhas', fundo: ['#1b0a25', '#300f40'], icone: 'megafone', motivo: 'confete' },
  gestao: { sub: 'Liderança · Equipe', fundo: ['#170a0d', '#2a1016'], icone: 'alvo', motivo: 'alvo' },
  descanso: { sub: 'Café · Pausa', fundo: ['#f7f1e6', '#e9dcc4'], claro: true, icone: 'cafe', motivo: 'graos' },
};

// só o caminho de um retângulo de cantos redondos
function cantos(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// a face da placa (3,76 × 0,98 m na porta)
function placaDaSala(s) {
  const cara = CARA_DAS_SALAS[s.id] ?? { sub: '', fundo: ['#0f131b', '#161b26'] };
  const tinta = cara.claro ? '#1c1917' : '#f8fafc';
  // na placa clara, a cor da sala (clarinha) não se lê: vai uma versão mais escura
  const destaque = cara.claro ? new THREE.Color(s.cor).offsetHSL(0, 0.1, -0.2).getStyle() : s.cor;
  return quadro(1536, 400, (ctx, w, h) => {
    const escala = ctx.getTransform().a; // o desfoque da sombra não segue a escala do canvas
    const fundo = ctx.createLinearGradient(0, 0, w, h);
    fundo.addColorStop(0, cara.fundo[0]);
    fundo.addColorStop(1, cara.fundo[1]);
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, w, h);
    // o desenho do setor numa camada à parte, que some para a esquerda (não briga com o nome)
    if (cara.motivo) {
      const camada = document.createElement('canvas');
      camada.width = ctx.canvas.width;
      camada.height = ctx.canvas.height;
      const c = camada.getContext('2d');
      c.setTransform(ctx.getTransform());
      c.lineCap = 'round';
      c.lineJoin = 'round';
      MOTIVOS[cara.motivo](c, w, h, s.cor, sorteio(s.id.length * 977 + s.id.charCodeAt(0)));
      const some = c.createLinearGradient(560, 0, 1150, 0);
      some.addColorStop(0, 'rgba(0,0,0,0)');
      some.addColorStop(1, `rgba(0,0,0,${cara.claro ? 0.5 : 0.38})`);
      c.globalCompositeOperation = 'destination-in';
      c.globalAlpha = 1;
      c.fillStyle = some;
      c.fillRect(0, 0, w, h);
      ctx.drawImage(camada, 0, 0, w, h);
    }
    // reflexo de vidro em cima e o filete de dentro na cor da sala
    const reflexo = ctx.createLinearGradient(0, 0, 0, h);
    reflexo.addColorStop(0, cara.claro ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.08)');
    reflexo.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflexo;
    ctx.fillRect(0, 0, w, h);
    cantos(ctx, 14, 14, w - 28, h - 28, 26);
    ctx.strokeStyle = destaque;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // o ícone, num quadrado na cor da sala (com brilho em volta na placa escura)
    const lado = 280;
    const ix = 60;
    const iy = (h - lado) / 2;
    ctx.save();
    ctx.shadowColor = cara.claro ? 'rgba(0,0,0,0.22)' : `${s.cor}99`;
    ctx.shadowBlur = (cara.claro ? 18 : 36) * escala;
    cantos(ctx, ix, iy, lado, lado, 64);
    ctx.fillStyle = s.cor;
    ctx.fill();
    ctx.restore();
    const volume = ctx.createLinearGradient(0, iy, 0, iy + lado);
    volume.addColorStop(0, 'rgba(255,255,255,0.3)');
    volume.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = volume;
    ctx.fill();
    if (cara.icone) {
      const tam = 168;
      ctx.save();
      ctx.translate(ix + (lado - tam) / 2, iy + (lado - tam) / 2);
      ctx.scale(tam / 24, tam / 24);
      ctx.strokeStyle = 'rgba(12,14,20,0.88)';
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const d of ICONES_DAS_PLACAS[cara.icone]) ctx.stroke(new Path2D(d));
      ctx.restore();
    }
    // o nome (encolhe para caber: "Telemarketing") e a linha do setor
    const x = ix + lado + 56;
    const largura = w - x - 60;
    let tam = 168;
    ctx.font = `800 ${tam}px ${FONTE}`;
    const medida = ctx.measureText(s.nome).width;
    if (medida > largura) {
      tam = Math.floor((tam * largura) / medida);
      ctx.font = `800 ${tam}px ${FONTE}`;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = tinta;
    if (!cara.claro) {
      ctx.shadowColor = `${s.cor}66`;
      ctx.shadowBlur = 24 * escala;
    }
    ctx.fillText(s.nome, x, 218);
    ctx.shadowBlur = 0;
    ctx.fillStyle = destaque;
    ctx.font = `700 46px ${FONTE}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '7px';
    ctx.fillText(cara.sub.toUpperCase(), x + 4, 306, largura);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }, NO_APARELHO);
}

// cor por vértice (uma só na peça inteira): peças de cores diferentes com um material só ainda
// viram um desenho no juntarSoltas
function pintar(geo, cor) {
  const c = new THREE.Color(cor);
  const n = geo.attributes.position.count;
  const cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cores.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geo;
}

// painel com linhas de status (TI e central de telemarketing): [rótulo, valor, cor]
function painel(titulo, corTopo) {
  return quadro(1024, 576, (ctx, w, h, linhas = [], rodape = '') => {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = corTopo;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `800 52px ${FONTE}`;
    ctx.fillText(titulo, 44, 92);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 30px ${FONTE}`;
    ctx.fillText(rodape, 44, 136);
    linhas.forEach(([nome, valor, cor], i) => {
      const y = 214 + i * 86;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(36, y - 54, w - 72, 70);
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(78, y - 19, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 36px ${FONTE}`;
      ctx.fillText(nome, 108, y - 6);
      ctx.textAlign = 'right';
      ctx.font = `800 38px ${FONTE}`;
      ctx.fillText(valor, w - 64, y - 6);
      ctx.textAlign = 'left';
    });
  }, NO_APARELHO);
}

// três monitores lado a lado: o do meio de frente, os dos lados virados para quem senta (o
// canto de dentro de cada lateral encosta no do meio). cx/z: centro da tela do meio; w: largura.
function tresMonitores(cx, z, y, w) {
  const a = 0.38;
  const h = (w * 9) / 16;
  const lado = w / 2 + (w / 2) * Math.cos(a) + 0.03;
  const frente = (w / 2) * Math.sin(a);
  return [
    { x: cx - lado, z: z + frente, y, ry: a, w, h },
    { x: cx, z, y, ry: 0, w, h },
    { x: cx + lado, z: z + frente, y, ry: -a, w, h },
  ];
}

// moldura, haste e pé de cada monitor (a tela em si é do World, que põe o vídeo nela).
// apagado: o cartaz de monitor desligado, material do World (compartilhado: nunca dar dispose
// aqui). Vem instanciado com as molduras, um desenho para a sala toda no lugar de dois por
// monitor. Fica em z = −0,005: entre a frente da moldura (−0,01) e a superfície preta da tela (0),
// que cobre ele quando chega vídeo (a tarja do 4:3); na frente continuam o (+), o buraco do player,
// o navegador e o vídeo.
function molduras(g, monitores, corpo, apagado = null) {
  const { w, h, y } = monitores[0];
  const partes = [
    { geo: new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), mat: corpo, pos: [0, y, -0.03] },
    { geo: new THREE.BoxGeometry(0.06, 0.3, 0.05), mat: corpo, pos: [0, y - h / 2 - 0.1, -0.06], sombra: false },
    { geo: new THREE.BoxGeometry(0.34, 0.025, 0.22), mat: corpo, pos: [0, y - h / 2 - 0.25, -0.05], sombra: false },
  ];
  if (apagado) partes.push({ geo: new THREE.PlaneGeometry(w, h), mat: apagado, pos: [0, y, -0.005], sombra: false });
  repetir(g, partes, monitores.map((m) => [m.x, m.z, m.ry]));
}

// ------------------------------------------------------------------ sala genérica
// Um "marco" é o sistema de coordenadas da sala: g é o grupo (já girado e no lugar), mundo()
// converte um ponto local para o mundo e bloco() cria a colisão (sempre de eixo) já convertida.
// celula: o índice da sala na lista de células (vai em cada tela, telão e posto, para o World
// pôr cada um junto da sala dele). apagado(cor): o cartaz de monitor desligado do World, ou null.
// As telas, os painéis e os telões das salas são embutidos: rentes à parede, o brilho em volta
// fica atrás do reboco e a moldura sai só uns centímetros dela.
function marco(world, raiz, s, telas, telaoes, postos, assentos, celula, apagado) {
  const cx = (s.x0 + s.x1) / 2;
  const cz = (s.z0 + s.z1) / 2;
  const giro = s.lado === 'sul' ? Math.PI : 0; // norte e fundos: porta para +z
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = giro;
  raiz.add(g);
  const mundo = (lx, lz) => (giro ? [cx - lx, cz - lz] : [cx + lx, cz + lz]);
  let k = 0;
  return {
    g,
    s,
    world,
    W: (s.x1 - s.x0) / 2,
    D: (s.z1 - s.z0) / 2,
    mundo,
    // cartaz de monitor desligado na cor do setor: só pedido por quem tem postos (cada um é uma
    // textura no World)
    get apagado() { return apagado ? apagado(s.cor) : null; },
    bloco(lmin, lmax, extra = {}) {
      const a = mundo(lmin[0], lmin[2]);
      const b = mundo(lmax[0], lmax[2]);
      world.addBox({ min: [Math.min(a[0], b[0]), lmin[1], Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), lmax[1], Math.max(a[1], b[1])], ...extra });
    },
    // tela de compartilhar (na ordem: a 1ª chamada é a 1ª tela da sala no servidor)
    tela(lx, y, lz, ry, w, h) {
      const [x, z] = mundo(lx, lz);
      telas.push({ pos: [x, y, z], rotY: ry + giro, w, h, rotulo: `${s.nome} · Tela ${++k}`, embutida: true, celula });
    },
    // painel (placar, status, mural...): também é tela de compartilhar — a ÚLTIMA da sala. Livre,
    // mostra a textura do painel; com alguém compartilhando, mostra o que foi compartilhado.
    painel(lx, y, lz, ry, w, h, tex, nome) {
      const [x, z] = mundo(lx, lz);
      telas.push({ pos: [x, y, z], rotY: ry + giro, w, h, rotulo: `${s.nome} · ${nome}`, painel: tex, embutida: true, celula });
    },
    telao(lx, y, lz, ry, w, h) {
      const [x, z] = mundo(lx, lz);
      telaoes.push({ pos: [x, y, z], rotY: ry + giro, w, h, embutida: true, celula });
    },
    // Lugar onde dá para sentar (tecla C perto dele). y: altura do assento; ry: para onde quem
    // senta olha (0 = -z local, para o fundo da sala).
    assento(lx, lz, y, ry = 0, posto = null) {
      const [x, z] = mundo(lx, lz);
      assentos.push({ x, z, y, yaw: ry + giro, posto });
    },
    // posto de trabalho n: a cadeira (já vira assento), os 3 monitores e onde ficam o teclado e o
    // mouse (topo: altura do tampo da mesa daquela sala)
    posto(n, cadeira, monitores, topo = 1.03) {
      const id = `${s.id}-${n}`;
      this.assento(cadeira.x, cadeira.z, cadeira.y, cadeira.ry ?? 0, id);
      const [tx, tz] = mundo(cadeira.x, cadeira.z - 1.02);
      postos.push({
        id,
        celula,
        monitores: monitores.map((mo) => {
          const [x, z] = mundo(mo.x, mo.z);
          return { pos: [x, mo.y, z], rotY: mo.ry + giro, w: mo.w, h: mo.h };
        }),
        mesa: { pos: [tx, topo, tz], rotY: giro }, // teclado aqui, virado para a cadeira (+z local)
      });
    },
  };
}

// chão, paredes internas com a cor do setor, faixa de luz e a luz do teto
function vestirSala(m, { piso, parede, faixa, luz = 0xffffff, intensidade = 55 }) {
  const { g, W, D } = m;
  plano(g, [W * 2, D * 2], [0, 0.02, 0], piso, [-Math.PI / 2, 0, 0]);
  const pa = typeof parede === 'number' ? mat(parede, { roughness: 0.9 }) : parede;
  plano(g, [W * 2 - 0.4, H - 0.05], [0, H / 2, -D + 0.17], pa);
  plano(g, [D * 2 - 0.4, H - 0.05], [-W + 0.17, H / 2, 0], pa, [0, Math.PI / 2, 0]);
  plano(g, [D * 2 - 0.4, H - 0.05], [W - 0.17, H / 2, 0], pa, [0, -Math.PI / 2, 0]);
  if (faixa) {
    const f = brilho(faixa);
    caixa(g, [W * 2 - 0.5, 0.06, 0.04], [0, H - 0.3, -D + 0.2], f, { sombra: false });
    caixa(g, [0.04, 0.06, D * 2 - 0.5], [-W + 0.2, H - 0.3, 0], f, { sombra: false });
    caixa(g, [0.04, 0.06, D * 2 - 0.5], [W - 0.2, H - 0.3, 0], f, { sombra: false });
  }
  // painéis de luz no teto
  repetir(g, [{ geo: new THREE.BoxGeometry(3.2, 0.05, 1.2), mat: brilho(0xf5f7ff), pos: [0, H - 0.04, 0], sombra: false }],
    [[-7, -6], [7, -6], [-7, 5], [7, 5]]);
  const l = new THREE.PointLight(luz, intensidade, 30, 1.4);
  l.position.set(0, H - 0.8, 0);
  g.add(l);
}

// ------------------------------------------------------------------ TI
function salaTI(m) {
  const { g, W, D } = m;
  const grade = quadro(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#141a26';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#232d42';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });
  grade.tex.wrapS = grade.tex.wrapT = THREE.RepeatWrapping;
  grade.tex.repeat.set(W * 2 / 1.2, D * 2 / 1.2); // piso elevado em placas de 1,2 m
  vestirSala(m, { piso: mat(0xffffff, { map: grade.tex }), parede: 0x111827, faixa: 0x22d3ee, luz: 0xbfe8ff, intensidade: 50 });

  // parede de monitoramento: 8 telas, 2 fileiras × 4
  for (const y of [2.3, 4.95]) for (const lx of [-8.1, -2.7, 2.7, 8.1]) m.tela(lx, y, -D + 0.25, 0, 4.6, 2.59);

  // 12 postos: 2 fileiras × 2 bancadas × 3 lugares, de frente para a parede de telas.
  // Cada posto tem 3 monitores e uma cadeira gamer.
  const mesa = mat(0x1f2937, { roughness: 0.5 });
  const tampo = mat(0x0b0f17, { roughness: 0.35 });
  const blocos = [];
  const monitores = [];
  const cadeiras = [];
  let n = 0;
  for (const lz of [-2.5, 4.5]) {
    for (const lx of [-7, 7]) {
      blocos.push([lx, lz]);
      for (const dx of [-3.6, 0, 3.6]) {
        const mons = tresMonitores(lx + dx, lz - 0.32, 1.58, 1.0);
        monitores.push(...mons);
        cadeiras.push([lx + dx, lz + 1.3]);
        m.posto(n++, { x: lx + dx, z: lz + 1.3, y: 0.66 }, mons, 1.035);
      }
      m.bloco([lx - 5.5, 0, lz - 0.65], [lx + 5.5, 1.05, lz + 0.65], { data: { type: 'mesa' } });
    }
  }
  repetir(g, [
    { geo: new THREE.BoxGeometry(11, 0.07, 1.3), mat: tampo, pos: [0, 1.0, 0] },
    { geo: new THREE.BoxGeometry(11, 0.95, 0.06), mat: mesa, pos: [0, 0.5, -0.6] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: mesa, pos: [-5.47, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: mesa, pos: [5.47, 0.5, 0] },
    { geo: new THREE.BoxGeometry(11, 0.03, 0.03), mat: brilho(0x22d3ee), pos: [0, 0.97, 0.66], sombra: false },
  ], blocos);
  molduras(g, monitores, mat(0x0b0d12, { roughness: 0.4 }), m.apagado);
  repetir(g, partesCadeiraGamer(0x22d3ee), cadeiras);
  for (const [lx, lz] of cadeiras) m.bloco([lx - 0.33, 0, lz - 0.32], [lx + 0.33, 0.62, lz + 0.32], { data: { type: 'sofa' } });

  // racks com luzes, perto da porta, na parede da esquerda
  const leds = quadro(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    const cores = ['#22c55e', '#22c55e', '#38bdf8', '#22c55e', '#fbbf24'];
    for (let y = 6; y < h; y += 9) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(4, y - 2, w - 8, 6);
      for (let x = 8; x < w - 8; x += 9) {
        if ((x * 31 + y * 17) % 5 < 2) continue;
        ctx.fillStyle = cores[(x + y) % cores.length];
        ctx.fillRect(x, y, 3, 2);
      }
    }
  });
  leds.tex.wrapT = THREE.RepeatWrapping;
  repetir(g, [
    { geo: new THREE.BoxGeometry(1.0, 2.5, 1.3), mat: mat(0x111827, { roughness: 0.45, metalness: 0.4 }), pos: [0, 1.25, 0] },
    { geo: new THREE.PlaneGeometry(0.86, 2.3), mat: new THREE.MeshBasicMaterial({ map: leds.tex, toneMapped: false }), pos: [0, 1.25, 0.66], sombra: false },
  ], [[-W + 0.9, 8.4, Math.PI / 2], [-W + 0.9, 9.6, Math.PI / 2], [-W + 0.9, 10.8, Math.PI / 2]]);
  m.bloco([-W + 0.2, 0, 7.8], [-W + 1.6, 2.5, 11.4]);

  // quadro de status (dados de verdade da sala), na parede da direita
  const status = painel('STATUS DOS SISTEMAS', '#38bdf8');
  m.painel(W - 0.3, 3.3, 6, -Math.PI / 2, 6, 3.375, status.tex, 'Status');

  let piscou = 0;
  return {
    status: (info) => status.redesenhar([
      ['Pessoas na sala', `${info.pessoas ?? 0}`, '#22c55e'],
      ['Telas no ar', `${info.telas ?? 0} de 8`, info.telas >= 8 ? '#fbbf24' : '#22c55e'],
      ['Rede', 'estável', '#22c55e'],
      ['Servidor', 'no ar', '#22c55e'],
    ], `${info.empresa ? `${info.empresa} · ` : ''}${info.hora || ''}`),
    update(t) {
      if (t - piscou < 0.35) return;
      piscou = t;
      leds.tex.offset.y = Math.floor(t * 3) * 0.037;
    },
  };
}

// ------------------------------------------------------------------ Comercial
function salaComercial(m) {
  const { g, W, D } = m;
  vestirSala(m, { piso: mat(0x3a2b31, { roughness: 1 }), parede: 0xe9e1d4, faixa: 0xfbbf24, luz: 0xfff1d6, intensidade: 60 });
  for (const lx of [-8.1, -2.7, 2.7, 8.1]) m.tela(lx, 3.1, -D + 0.25, 0, 4.6, 2.59);

  // 8 postos de venda: 2 fileiras × 2 bancadas de madeira × 2 lugares, cada um com 3 monitores
  const madeira = mat(0xb08a62, { roughness: 0.5 });
  const branco = mat(0xf3f4f6, { roughness: 0.6 });
  const bancadas = [];
  const monitores = [];
  const cadeiras = [];
  let n = 0;
  for (const lz of [-2, 4.5]) {
    for (const lx of [-6.5, 6.5]) {
      bancadas.push([lx, lz]);
      for (const dx of [-2.2, 2.2]) {
        const mons = tresMonitores(lx + dx, lz - 0.3, 1.56, 0.95);
        monitores.push(...mons);
        cadeiras.push([lx + dx, lz + 1.3]);
        m.posto(n++, { x: lx + dx, z: lz + 1.3, y: 0.62 }, mons, 1.04);
      }
      m.bloco([lx - 4.5, 0, lz - 0.65], [lx + 4.5, 1.05, lz + 0.65], { data: { type: 'mesa' } });
    }
  }
  repetir(g, [
    { geo: new RoundedBoxGeometry(9, 0.08, 1.3, 2, 0.03), mat: madeira, pos: [0, 1.0, 0] },
    { geo: new THREE.BoxGeometry(8.9, 0.95, 0.06), mat: branco, pos: [0, 0.5, -0.6] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: branco, pos: [-4.45, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: branco, pos: [4.45, 0.5, 0] },
    { geo: new THREE.BoxGeometry(9, 0.04, 0.04), mat: brilho(0xfbbf24), pos: [0, 0.97, 0.66], sombra: false },
  ], bancadas);
  molduras(g, monitores, mat(0x111827, { roughness: 0.4 }), m.apagado);
  repetir(g, partesCadeira({ tecido: mat(0x1c1c1c, { roughness: 0.6 }), metal: mat(0xa1a1aa, { roughness: 0.3, metalness: 0.7 }), encosto: 0.95 }), cadeiras);
  for (const [lx, lz] of cadeiras) m.bloco([lx - 0.32, 0, lz - 0.32], [lx + 0.32, 0.6, lz + 0.32], { data: { type: 'sofa' } });

  // placar de metas, na parede da direita
  const placar = quadro(1280, 768, (ctx, w, h, dados = { titulo: 'Metas do mês', itens: [] }) => {
    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 64px ${FONTE}`;
    ctx.fillText(dados.titulo || 'Metas do mês', 56, 104);
    const itens = [...(dados.itens || [])].sort((a, b) => (b.meta ? b.valor / b.meta : 0) - (a.meta ? a.valor / a.meta : 0));
    if (!itens.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 38px ${FONTE}`;
      ctx.fillText('O dono da sala preenche o placar no painel “Sala da empresa”.', 56, 200);
      return;
    }
    const linha = Math.min(84, (h - 220) / itens.length);
    itens.forEach((it, i) => {
      const y = 160 + i * linha;
      const pct = it.meta ? Math.min(1, it.valor / it.meta) : 0;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `700 ${Math.round(linha * 0.42)}px ${FONTE}`;
      ctx.fillText(`${i + 1}. ${it.nome}`, 56, y + linha * 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(470, y + linha * 0.2, 520, linha * 0.42);
      ctx.fillStyle = pct >= 1 ? '#22c55e' : pct >= 0.7 ? '#fbbf24' : '#38bdf8';
      ctx.fillRect(470, y + linha * 0.2, 520 * pct, linha * 0.42);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `600 ${Math.round(linha * 0.34)}px ${FONTE}`;
      ctx.textAlign = 'right';
      ctx.fillText(it.meta ? `${dinheiro.format(it.valor)} / ${dinheiro.format(it.meta)} · ${Math.round(pct * 100)}%` : dinheiro.format(it.valor), w - 48, y + linha * 0.5);
      ctx.textAlign = 'left';
    });
    const total = itens.reduce((s, it) => s + it.valor, 0);
    const meta = itens.reduce((s, it) => s + it.meta, 0);
    ctx.fillStyle = '#fbbf24';
    ctx.font = `800 40px ${FONTE}`;
    ctx.fillText(meta ? `Time: ${dinheiro.format(total)} de ${dinheiro.format(meta)} (${Math.round((total / meta) * 100)}%)` : `Time: ${dinheiro.format(total)}`, 56, h - 44);
  }, NO_APARELHO);
  m.painel(W - 0.3, 3.3, -1, -Math.PI / 2, 7.6, 4.56, placar.tex, 'Placar');

  // Sino de venda fechada, perto da porta: pórtico de madeira escura com anéis e remates de latão,
  // num tablado redondo com um filete de luz âmbar, e a plaquinha "Venda fechada!" em cima da
  // travessa. O sino é oco, com frisos, badalo e o cordão de sino de navio; balança em volta da
  // travessa e, ao tocar, brilha e solta ondas douradas. As peças paradas são soltas no g (o
  // juntarSoltas mescla por material); as que mexem ficam nos grupos pendurado, badalo e ecos.
  const sx = -W + 2.5;
  const sz = D - 2.5;
  const madeiraEsc = mat(0x3b2618, { roughness: 0.45 });
  const latao = mat(0xd9ad4b, { roughness: 0.3, metalness: 0.8, emissive: 0x2a1d05 });
  // (o escritório não tem mapa de ambiente: metal demais fica marrom, sem nada para refletir)
  const ouro = mat(0xf6c443, { roughness: 0.28, metalness: 0.6, emissive: 0x4a3000 });
  const cordao = mat(0xf1e6cf, { roughness: 0.95 });
  const peca = (pai, geo, material, [x, y, z], giro = null, sombra = true) => {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    if (giro) o.rotation.set(...giro);
    o.castShadow = sombra;
    o.receiveShadow = true;
    pai.add(o);
    return o;
  };
  // tablado com aro de latão e o filete de luz em volta
  peca(g, new THREE.CylinderGeometry(0.95, 1.0, 0.16, 40), madeiraEsc, [sx, 0.08, sz]);
  peca(g, new THREE.TorusGeometry(0.955, 0.018, 6, 48), latao, [sx, 0.16, sz], [Math.PI / 2, 0, 0], false);
  const fita = brilho(0xfbbf24);
  const corDaFita = fita.color.clone();
  peca(g, new THREE.CylinderGeometry(1.01, 1.01, 0.03, 40, 1, true), fita, [sx, 0.045, sz], null, false);
  // colunas com anéis e remates de latão, a travessa e a ferragem de onde o sino pende
  for (const dx of [-0.78, 0.78]) {
    peca(g, new THREE.CylinderGeometry(0.06, 0.075, 2.62, 16), madeiraEsc, [sx + dx, 1.47, sz]);
    peca(g, new THREE.CylinderGeometry(0.1, 0.115, 0.14, 16), latao, [sx + dx, 0.23, sz], null, false);
    peca(g, new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16), latao, [sx + dx, 2.74, sz], null, false);
    peca(g, new THREE.CylinderGeometry(0.035, 0.06, 0.08, 12), latao, [sx + dx, 2.95, sz], null, false);
    peca(g, new THREE.SphereGeometry(0.085, 16, 12), latao, [sx + dx, 3.05, sz]);
  }
  caixa(g, [1.84, 0.14, 0.16], [sx, 2.85, sz], madeiraEsc, { arredondada: 0.03 });
  caixa(g, [0.24, 0.07, 0.2], [sx, 2.745, sz], latao, { sombra: false });
  // plaquinha em cima da travessa, escrita dos dois lados
  const plaquinha = quadro(620, 150, (ctx, w, h) => {
    const fundo = ctx.createLinearGradient(0, 0, 0, h);
    fundo.addColorStop(0, '#2b1b10');
    fundo.addColorStop(1, '#160d07');
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d9ad4b';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    const dourado = ctx.createLinearGradient(0, 34, 0, 96);
    dourado.addColorStop(0, '#fde68a');
    dourado.addColorStop(1, '#d4a12a');
    ctx.fillStyle = dourado;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 60px ${FONTE}`;
    ctx.fillText('VENDA FECHADA!', w / 2, 66, w - 70);
    ctx.fillStyle = '#c9b48c';
    ctx.font = `600 25px ${FONTE}`;
    ctx.fillText('fechou? toque o sino · tecla B', w / 2, 114, w - 70);
  }, NO_APARELHO);
  caixa(g, [1.3, 0.36, 0.06], [sx, 3.1, sz], madeiraEsc, { arredondada: 0.02 });
  const letras = new THREE.MeshBasicMaterial({ map: plaquinha.tex, toneMapped: false });
  plano(g, [1.24, 0.3], [sx, 3.1, sz + 0.031], letras);
  plano(g, [1.24, 0.3], [sx, 3.1, sz - 0.031], letras, [0, Math.PI, 0]);

  // o sino: oco (o perfil desce por dentro até a boca e sobe por fora até a coroa), pendurado por
  // uma argola; o eixo é a travessa (x), então ele balança para a frente e para trás
  const pendurado = new THREE.Group();
  pendurado.position.set(sx, 2.71, sz);
  g.add(pendurado);
  peca(pendurado, new THREE.TorusGeometry(0.055, 0.018, 8, 20), latao, [0, -0.05, 0], [0, Math.PI / 2, 0], false);
  const perfil = [
    [0, 0.7], [0.15, 0.69], [0.25, 0.63], [0.3, 0.5], [0.33, 0.33], [0.38, 0.17], [0.44, 0.06], [0.46, 0], // por dentro
    [0.52, 0], [0.54, 0.035], [0.535, 0.08], [0.49, 0.14], [0.43, 0.25], [0.4, 0.4], [0.385, 0.55], [0.37, 0.68], [0.33, 0.77], [0.24, 0.835], [0.12, 0.855], [0, 0.86], // por fora
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const boca = -0.96; // a boca do sino, abaixo do eixo (0,86 de sino + a argola)
  peca(pendurado, new THREE.LatheGeometry(perfil, 40), ouro, [0, boca, 0]);
  // frisos em relevo: dois na cintura e um acima do bojo (nos pontos do perfil)
  for (const [r, y] of [[0.4, 0.4], [0.385, 0.55], [0.49, 0.14]]) peca(pendurado, new THREE.TorusGeometry(r + 0.004, 0.013, 6, 48), ouro, [0, boca + y, 0], [Math.PI / 2, 0, 0]);
  // badalo (haste e bola, que bate no bojo) e o cordão com nó e borla, para fora da boca
  const badalo = new THREE.Group();
  badalo.position.y = boca + 0.66;
  pendurado.add(badalo);
  peca(badalo, new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), latao, [0, -0.25, 0], null, false);
  peca(badalo, new THREE.SphereGeometry(0.07, 16, 12), ouro, [0, -0.56, 0]);
  peca(badalo, new THREE.CylinderGeometry(0.017, 0.017, 0.52, 8), cordao, [0, -0.88, 0]);
  peca(badalo, new THREE.TorusGeometry(0.026, 0.014, 6, 14), cordao, [0, -0.78, 0], [Math.PI / 2, 0, 0]);
  peca(badalo, new THREE.SphereGeometry(0.038, 10, 8), cordao, [0, -1.15, 0]);
  peca(badalo, new THREE.ConeGeometry(0.06, 0.17, 12), cordao, [0, -1.25, 0]);
  // o que mexe junto e tem o mesmo material vira uma malha (sino e frisos; as partes do cordão)
  juntarSoltas(pendurado, new Set());
  juntarSoltas(badalo, new Set());
  // ondas douradas que saem do sino quando ele toca (escondidas no resto do tempo)
  const ecos = new THREE.Group();
  ecos.position.set(sx, 2.71 + boca + 0.3, sz);
  ecos.visible = false;
  g.add(ecos);
  for (let i = 0; i < 3; i++) {
    const onda = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 48), new THREE.MeshBasicMaterial({
      color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, blending: THREE.AdditiveBlending,
    }));
    onda.rotation.x = -Math.PI / 2;
    ecos.add(onda);
  }
  m.bloco([sx - 1, 0, sz - 1], [sx + 1, 3.15, sz + 1]);

  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [W - 1.2, D - 1.6]]);
  let balanco = 0;
  let antes = 0;
  return {
    placar: (dados) => placar.redesenhar(dados),
    tocarSino() { balanco = 2.4; },
    update(t) {
      const dt = Math.min(0.1, t - antes);
      antes = t;
      if (balanco <= 0) return;
      balanco = Math.max(0, balanco - dt);
      const passou = 2.4 - balanco; // segundos desde a badalada
      const k = (balanco / 2.4) * Math.min(1, passou * 5); // força: entra rápido e vai morrendo
      pendurado.rotation.x = Math.sin(passou * 7) * 0.5 * k;
      // o badalo vai atrasado em relação ao sino: é ele que bate no bojo
      badalo.rotation.x = Math.sin(passou * 7 - 1.2) * 0.45 * k;
      ouro.emissiveIntensity = 1 + 5 * k * k;
      fita.color.copy(corDaFita).multiplyScalar(1 + 1.6 * k);
      ecos.visible = balanco > 0;
      ecos.children.forEach((onda, i) => {
        const f = passou * 0.85 - i * 0.3;
        const p = f < 0 ? 0 : f % 1;
        onda.visible = f >= 0;
        onda.scale.setScalar(1 + p * 2.4);
        onda.material.opacity = (1 - p) * 0.7 * Math.min(1, balanco / 0.6);
      });
      // a sombra do sol só é refeita quando algo muda: o sino balançando avisa a cada quadro
      m.world.marcarSombra?.();
    },
  };
}

// ------------------------------------------------------------------ Telemarketing
function salaTelemarketing(m) {
  const { g, W, D } = m;
  vestirSala(m, { piso: mat(0x25304a, { roughness: 1 }), parede: 0xece6f3, faixa: 0xf472b6, luz: 0xffe4f2, intensidade: 55 });
  // painel da central no meio da parede do fundo e 4 telas, duas de cada lado
  const central = painel('CENTRAL DE ATENDIMENTO', '#f472b6');
  for (const lx of [-10.2, 10.2]) for (const y of [2.1, 4.75]) m.tela(lx, y, -D + 0.25, 0, 4.4, 2.48);
  m.painel(0, 3.3, -D + 0.25, 0, 8, 4.5, central.tex, 'Central');

  // 8 baias (postos): 2 fileiras × 4, com divisórias, 3 monitores e headset
  const tampo = mat(0xf8fafc, { roughness: 0.5 });
  const divisoria = mat(0x7c3aed, { roughness: 0.95 });
  const baias = [];
  const monitores = [];
  const cadeiras = [];
  let n = 0;
  for (const lz of [-2, 5]) {
    for (const lx of [-9, -3, 3, 9]) {
      baias.push([lx, lz]);
      cadeiras.push([lx, lz + 1.25]);
      const mons = tresMonitores(lx, lz - 0.3, 1.47, 0.75);
      monitores.push(...mons);
      m.posto(n++, { x: lx, z: lz + 1.25, y: 0.62 }, mons, 1.01);
      // uma caixa por baia (tampo + divisórias): era uma só de parede a parede, e o vão entre
      // as baias travava com uma parede invisível
      m.bloco([lx - 1.66, 0, lz - 0.68], [lx + 1.62, 1.6, lz + 0.56], { data: { type: 'mesa' } });
    }
  }
  const fone = mat(0x1f2937, { roughness: 0.5 });
  repetir(g, [
    { geo: new THREE.BoxGeometry(3.0, 0.06, 1.1), mat: tampo, pos: [0, 0.98, 0] },
    { geo: new THREE.BoxGeometry(3.0, 0.95, 0.05), mat: mat(0xd4d4d8), pos: [0, 0.5, -0.52] },
    { geo: new RoundedBoxGeometry(3.2, 1.55, 0.08, 2, 0.03), mat: divisoria, pos: [0, 0.78, -0.62] },
    { geo: new RoundedBoxGeometry(0.08, 1.55, 1.2, 2, 0.03), mat: divisoria, pos: [-1.6, 0.78, -0.05] },
    // headset: arco + dois fones, apoiado na mesa
    { geo: new THREE.TorusGeometry(0.14, 0.018, 6, 16, Math.PI), mat: fone, pos: [1.1, 1.17, 0.2], sombra: false },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), mat: fone, pos: [0.96, 1.05, 0.2], giro: [0, 0, Math.PI / 2], sombra: false },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), mat: fone, pos: [1.24, 1.05, 0.2], giro: [0, 0, Math.PI / 2], sombra: false },
  ], baias);
  molduras(g, monitores, mat(0x111827, { roughness: 0.4 }), m.apagado);
  repetir(g, partesCadeira({ tecido: mat(0x312e81, { roughness: 0.85 }), metal: mat(0x52525b, { roughness: 0.35, metalness: 0.6 }) }), cadeiras);
  for (const [lx, lz] of cadeiras) m.bloco([lx - 0.32, 0, lz - 0.32], [lx + 0.32, 0.6, lz + 0.32], { data: { type: 'sofa' } });

  // painéis acústicos hexagonais nas paredes laterais: 3 fileiras desencontradas, cores alternadas
  const geoHex = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 6);
  const coresHex = [0xf472b6, 0xa855f7, 0x7c3aed].map((c) => mat(c, { roughness: 1 }));
  for (let lin = 0; lin < 3; lin++) {
    coresHex.forEach((material, c) => {
      const lugares = [];
      for (const lado of [-1, 1]) {
        for (let col = 0; col < 3; col++) if ((col + lin) % 3 === c) lugares.push([lado * (W - 0.24), -6 + col * 1.6 + (lin % 2) * 0.8, lado * Math.PI / 2]);
      }
      repetir(g, [{ geo: geoHex, mat: material, pos: [0, 2.6 + lin * 1.25, 0], giro: [Math.PI / 2, 0, Math.PI / 6], sombra: false }], lugares);
    });
  }
  return { central };
}

// ------------------------------------------------------------------ Reunião
function salaReuniao(m) {
  const { g, W, D } = m;
  const tabuas = quadro(512, 512, (ctx, w, h) => {
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = (y / 32) % 2 ? '#7a573c' : '#6c4a33';
      ctx.fillRect(0, y, w, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect((y * 7) % w, y, 2, 30);
      ctx.fillRect(0, y + 30, w, 2);
    }
  });
  tabuas.tex.wrapS = tabuas.tex.wrapT = THREE.RepeatWrapping;
  tabuas.tex.repeat.set(5, 4);
  vestirSala(m, { piso: mat(0xffffff, { map: tabuas.tex, roughness: 0.6 }), parede: 0xd9d2c5, faixa: null, luz: 0xfff3dc, intensidade: 55 });
  // telão no fundo e uma tela em cada parede lateral
  m.telao(0, 3.4, -D + 0.3, 0, 9.6, 5.4);
  m.tela(-W + 0.3, 3.0, -3, Math.PI / 2, 4.4, 2.48);
  m.tela(W - 0.3, 3.0, -3, -Math.PI / 2, 4.4, 2.48);
  caixa(g, [8, 0.7, 0.6], [0, 0.35, -D + 0.6], mat(0x3b2618, { roughness: 0.4 }));

  // mesa oval para 10
  const RX = 5.2;
  const RZ = 2.3;
  const madeira = mat(0x3b2618, { roughness: 0.35 });
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 48), madeira);
  tampo.scale.set(RX, 1, RZ);
  tampo.position.set(0, 1.0, 1.5);
  tampo.castShadow = true;
  tampo.receiveShadow = true;
  g.add(tampo);
  repetir(g, [{ geo: new THREE.CylinderGeometry(0.35, 0.6, 0.95, 16), mat: mat(0x1f2937, { roughness: 0.4, metalness: 0.5 }), pos: [0, 0.47, 0] }], [[-2.5, 1.5], [2.5, 1.5]]);
  m.bloco([-RX * 0.95, 0, 1.5 - RZ * 0.55], [RX * 0.95, 1.07, 1.5 + RZ * 0.55], { data: { type: 'mesa' } });
  m.bloco([-RX * 0.6, 0, 1.5 - RZ * 0.92], [RX * 0.6, 1.07, 1.5 + RZ * 0.92], { data: { type: 'mesa' } });
  const cadeiras = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const x = Math.cos(a) * (RX + 1.05);
    const z = 1.5 + Math.sin(a) * (RZ + 1.0);
    cadeiras.push([x, z, Math.atan2(x, z - 1.5)]);
  }
  repetir(g, partesCadeira({ tecido: mat(0x9ca3af, { roughness: 0.85 }), metal: mat(0x374151, { roughness: 0.35, metalness: 0.6 }), encosto: 0.85 }), cadeiras);
  for (const [x, z, ry] of cadeiras) {
    m.bloco([x - 0.32, 0, z - 0.32], [x + 0.32, 0.6, z + 0.32], { data: { type: 'sofa' } });
    m.assento(x, z, 0.6, ry);
  }
  // luminárias pendentes
  repetir(g, [
    { geo: new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), mat: brilho(0x111827), pos: [0, H - 1.1, 1.5], sombra: false },
    { geo: new THREE.CylinderGeometry(0.3, 0.8, 0.5, 20, 1, true), mat: mat(0x1f2937, { side: THREE.DoubleSide, metalness: 0.4 }), pos: [0, H - 2.4, 1.5], sombra: false },
    { geo: new THREE.CircleGeometry(0.76, 20), mat: brilho(0xfff1c9), pos: [0, H - 2.64, 1.5], giro: [Math.PI / 2, 0, 0], sombra: false },
  ], [[-2.6, 0], [2.6, 0]]);
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [-W + 1.2, D - 1.6], [W - 1.2, D - 1.6]]);
  return {};
}

// ------------------------------------------------------------------ salas de equipe
// Financeiro, RH, Marketing e Gestão têm a mesma base: telas na parede do fundo e bancadas com
// 2 postos cada (3 monitores por posto). O que muda é a cor, o piso e o que vai nas paredes.
function salaEquipe(m, { piso, parede, faixa, luz, telas, bancadas, madeira = 0xd6d3d1, cadeira = 0x1f2937 }) {
  const { g } = m;
  vestirSala(m, { piso, parede, faixa, luz, intensidade: 55 });
  const xs = telas === 4 ? [-8.1, -2.7, 2.7, 8.1] : [-5, 5];
  for (const lx of xs) m.tela(lx, 3.1, -m.D + 0.25, 0, 4.6, 2.59);
  const tampo = mat(madeira, { roughness: 0.5 });
  const pe = mat(0xf3f4f6, { roughness: 0.6 });
  const monitores = [];
  const cadeiras = [];
  let n = 0;
  for (const [lx, lz] of bancadas) {
    for (const dx of [-2.2, 2.2]) {
      const mons = tresMonitores(lx + dx, lz - 0.3, 1.56, 0.95);
      monitores.push(...mons);
      cadeiras.push([lx + dx, lz + 1.3]);
      m.posto(n++, { x: lx + dx, z: lz + 1.3, y: 0.62 }, mons, 1.04);
    }
    m.bloco([lx - 4.5, 0, lz - 0.65], [lx + 4.5, 1.05, lz + 0.65], { data: { type: 'mesa' } });
  }
  repetir(g, [
    { geo: new RoundedBoxGeometry(9, 0.08, 1.3, 2, 0.03), mat: tampo, pos: [0, 1.0, 0] },
    { geo: new THREE.BoxGeometry(8.9, 0.95, 0.06), mat: pe, pos: [0, 0.5, -0.6] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: pe, pos: [-4.45, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.26), mat: pe, pos: [4.45, 0.5, 0] },
    { geo: new THREE.BoxGeometry(9, 0.04, 0.04), mat: brilho(faixa), pos: [0, 0.97, 0.66], sombra: false },
  ], bancadas);
  molduras(g, monitores, mat(0x111827, { roughness: 0.4 }), m.apagado);
  repetir(g, partesCadeira({ tecido: mat(cadeira, { roughness: 0.7 }), metal: mat(0xa1a1aa, { roughness: 0.3, metalness: 0.7 }), encosto: 0.9 }), cadeiras);
  for (const [lx, lz] of cadeiras) m.bloco([lx - 0.32, 0, lz - 0.32], [lx + 0.32, 0.6, lz + 0.32], { data: { type: 'sofa' } });
}

// painel grande na parede da direita (olhando para dentro da sala); também é tela de compartilhar
function quadroDireita(m, q, nome, w = 7.6, h = 4.28) {
  m.painel(m.W - 0.3, 3.3, -1, -Math.PI / 2, w, h, q.tex, nome);
}

function salaFinanceiro(m) {
  const { g, W, D } = m;
  salaEquipe(m, { piso: mat(0x1f2a2a, { roughness: 1 }), parede: 0xe6ece8, faixa: 0x34d399, luz: 0xeafff5, telas: 2, bancadas: [[-6.5, -1.5], [6.5, -1.5], [-6.5, 4.5], [6.5, 4.5]], madeira: 0x9ca3af, cadeira: 0x064e3b });
  // painel de indicadores (gráfico de barras ilustrativo do mês)
  const ind = quadro(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#0b1512';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#ecfdf5';
    ctx.font = `800 60px ${FONTE}`;
    ctx.fillText('Indicadores do mês', 56, 100);
    const barras = [0.42, 0.55, 0.48, 0.66, 0.72, 0.61, 0.8, 0.86, 0.78, 0.92];
    const bw = (w - 160) / barras.length;
    barras.forEach((v, i) => {
      ctx.fillStyle = i === barras.length - 1 ? '#34d399' : 'rgba(52,211,153,0.45)';
      ctx.fillRect(80 + i * bw + 10, h - 80 - v * (h - 220), bw - 20, v * (h - 220));
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(70, h - 78);
    ctx.lineTo(w - 70, h - 78);
    ctx.stroke();
  }, NO_APARELHO);
  quadroDireita(m, ind, 'Indicadores');
  // cofre perto da porta, na parede da esquerda
  const aco = mat(0x52525b, { roughness: 0.35, metalness: 0.8 });
  caixa(g, [1.2, 1.5, 1.1], [-W + 1, 0.75, D - 3], aco);
  const roda = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20), mat(0xd4d4d8, { metalness: 0.9, roughness: 0.2 }));
  roda.position.set(-W + 1.62, 0.85, D - 3);
  roda.rotation.y = Math.PI / 2;
  g.add(roda);
  m.bloco([-W + 0.3, 0, D - 3.6], [-W + 1.7, 1.5, D - 2.4]);
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [W - 1.2, D - 1.6]]);
  return {};
}

function salaRH(m) {
  const { g, W, D } = m;
  salaEquipe(m, { piso: mat(0x3b2f2a, { roughness: 1 }), parede: 0xf3e8dc, faixa: 0xfb923c, luz: 0xfff1e2, telas: 2, bancadas: [[-6.5, -2], [6.5, -2], [-6.5, 4.5]], madeira: 0xc8a27a, cadeira: 0x7c2d12 });
  // cantinho de conversa (1:1, entrevistas): dois sofás frente a frente com mesinha
  sofa(g, 0xea8a4a, [[6.5, 3.4, Math.PI], [6.5, 8.2, 0]]);
  caixa(g, [1.6, 0.42, 1], [6.5, 0.21, 5.8], mat(0x3b2618, { roughness: 0.4 }));
  m.bloco([4.9, 0, 2.85], [8.1, 0.8, 3.95], { data: { type: 'sofa' } });
  m.bloco([4.9, 0, 7.65], [8.1, 0.8, 8.75], { data: { type: 'sofa' } });
  lugaresDoSofa(6.5, 3.4, Math.PI, (lx, lz) => m.assento(lx, lz, 0.8, Math.PI));
  lugaresDoSofa(6.5, 8.2, 0, (lx, lz) => m.assento(lx, lz, 0.8, 0));
  // mural da equipe
  const mural = quadro(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#c69c6d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff7ed';
    ctx.font = `800 64px ${FONTE}`;
    ctx.fillText('Mural da equipe', 56, 100);
    const notas = ['Boas-vindas aos novos!', 'Aniversariantes do mês', 'Benefícios: fale com o RH', 'Feedback é presente', 'Pesquisa de clima aberta', 'Treinamentos da semana'];
    const cores = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe'];
    notas.forEach((t, i) => {
      const x = 56 + (i % 3) * 400;
      const y = 160 + Math.floor(i / 3) * 260;
      ctx.save();
      ctx.translate(x + 170, y + 110);
      ctx.rotate(((i * 37) % 7 - 3) * 0.012);
      ctx.fillStyle = cores[i];
      ctx.fillRect(-170, -110, 340, 220);
      ctx.fillStyle = '#1f2937';
      ctx.font = `700 34px ${FONTE}`;
      ctx.fillText(t, -150, -40, 300);
      ctx.restore();
    });
  }, NO_APARELHO);
  quadroDireita(m, mural, 'Mural', 6.4, 3.6);
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [-W + 1.2, D - 1.6]]);
  return {};
}

function salaMarketing(m) {
  const { g, W, D } = m;
  salaEquipe(m, { piso: mat(0x2a2236, { roughness: 1 }), parede: 0xf5f0fa, faixa: 0xe879f9, luz: 0xfdf0ff, telas: 4, bancadas: [[-6.5, -1.5], [6.5, -1.5], [-6.5, 4.5], [6.5, 4.5]], madeira: 0xf5f5f4, cadeira: 0x86198f });
  // parede criativa: faixas coloridas na parede da esquerda
  const cores = [0xe879f9, 0x38bdf8, 0xfbbf24, 0x34d399, 0xf87171];
  cores.forEach((c, i) => caixa(g, [0.05, 0.5, D * 2 - 1], [-W + 0.2, 1.2 + i * 0.75, 0], mat(c, { roughness: 0.9 }), { sombra: false }));
  // quadro de ideias com post-its
  const ideias = quadro(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#86198f';
    ctx.font = `800 60px ${FONTE}`;
    ctx.fillText('Quadro de ideias', 56, 96);
    const pc = ['#fde047', '#f9a8d4', '#93c5fd', '#86efac', '#fdba74'];
    const t = ['Campanha', 'Reels', 'Lançamento', 'Parcerias', 'Blog', 'E-mail', 'Evento', 'Promo', 'Persona', 'Funil', 'Anúncios', 'Pesquisa'];
    t.forEach((x, i) => {
      const cx = 70 + (i % 6) * 200;
      const cy = 150 + Math.floor(i / 6) * 260 + (i % 2) * 30;
      ctx.fillStyle = pc[i % pc.length];
      ctx.fillRect(cx, cy, 170, 170);
      ctx.fillStyle = '#111827';
      ctx.font = `700 30px ${FONTE}`;
      ctx.fillText(x, cx + 14, cy + 90, 145);
    });
  }, NO_APARELHO);
  quadroDireita(m, ideias, 'Ideias');
  plantas(g, [[W - 1.2, -D + 1.2], [W - 1.2, D - 1.6]]);
  return {};
}

// Gestão: painel da equipe ao vivo — quem está trabalhando, em pausa, inativo — e 4 postos
const COR_STATUS = { disponivel: '#22c55e', ocupado: '#ef4444', reuniao: '#a78bfa', pausa: '#fbbf24', almoco: '#fb923c', ausente: '#94a3b8', inativo: '#64748b' };
function salaGestao(m) {
  const { g, W, D } = m;
  salaEquipe(m, { piso: mat(0x2b1f22, { roughness: 1 }), parede: 0xe7e2df, faixa: 0xf87171, luz: 0xfff3ef, telas: 2, bancadas: [[-6.5, -1], [6.5, -1]], madeira: 0x5b3a26, cadeira: 0x111827 });
  // mesa redonda para alinhamentos, no fundo da sala perto da porta
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 32), mat(0x3b2618, { roughness: 0.35 }));
  tampo.position.set(-5.5, 1.0, 6.5);
  tampo.castShadow = true;
  g.add(tampo);
  caixa(g, [0.3, 0.95, 0.3], [-5.5, 0.48, 6.5], mat(0x1f2937));
  m.bloco([-6.9, 0, 5.1], [-4.1, 1.05, 7.9], { data: { type: 'mesa' } });
  const cadeiras = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = -5.5 + Math.cos(a) * 2.1;
    const z = 6.5 + Math.sin(a) * 2.1;
    const ry = Math.atan2(x + 5.5, z - 6.5);
    cadeiras.push([x, z, ry]);
    m.bloco([x - 0.32, 0, z - 0.32], [x + 0.32, 0.6, z + 0.32], { data: { type: 'sofa' } });
    m.assento(x, z, 0.6, ry);
  }
  repetir(g, partesCadeira({ tecido: mat(0x7f1d1d, { roughness: 0.8 }), metal: mat(0x374151, { roughness: 0.35, metalness: 0.6 }) }), cadeiras);
  const painelEquipe = quadro(1280, 768, (ctx, w, h, pessoas = [], rodape = '') => {
    ctx.fillStyle = '#140d0f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#fef2f2';
    ctx.font = `800 58px ${FONTE}`;
    ctx.fillText('Painel da equipe', 56, 96);
    ctx.fillStyle = '#a8a29e';
    ctx.font = `600 30px ${FONTE}`;
    ctx.fillText(rodape, 56, 140);
    if (!pessoas.length) return;
    const col = pessoas.length > 8 ? 2 : 1;
    const linhas = Math.ceil(pessoas.length / col);
    const lh = Math.min(70, (h - 200) / linhas);
    pessoas.slice(0, 20).forEach((p, i) => {
      const x = 56 + Math.floor(i / linhas) * ((w - 80) / col);
      const y = 190 + (i % linhas) * lh;
      ctx.fillStyle = COR_STATUS[p.status] || '#22c55e';
      ctx.beginPath();
      ctx.arc(x + 14, y + lh * 0.35, Math.min(14, lh * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f5f4';
      ctx.font = `700 ${Math.round(lh * 0.42)}px ${FONTE}`;
      ctx.fillText(p.nome, x + 42, y + lh * 0.5, 260);
      ctx.fillStyle = '#a8a29e';
      ctx.font = `600 ${Math.round(lh * 0.34)}px ${FONTE}`;
      ctx.fillText(p.texto, x + 300, y + lh * 0.5, (w - 80) / col - 320);
    });
  }, NO_APARELHO);
  quadroDireita(m, painelEquipe, 'Equipe');
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [W - 1.2, D - 1.6]]);
  return { equipe: (pessoas, rodape) => painelEquipe.redesenhar(pessoas, rodape) };
}

// ------------------------------------------------------------------ lounge (vaga sem departamento)
// O Descanso é o mesmo lounge, com placa própria e uma TV em cima do balcão do café.
function salaDescanso(m) {
  lounge(m, 'Descanso');
  m.tela(-3, 3.25, -m.D + 0.25, 0, 4.4, 2.48);
  return {};
}

function lounge(m, sub = 'Lounge') {
  const { g, W, D } = m;
  plano(g, [W * 2, D * 2], [0, 0.02, 0], mat(0x8a7560, { roughness: 0.7 }), [-Math.PI / 2, 0, 0]);
  const tapete = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(0x2f3b52, { roughness: 1 }));
  tapete.rotation.x = -Math.PI / 2;
  tapete.scale.set(6, 4.2, 1);
  tapete.position.set(0, 0.03, 0);
  g.add(tapete);
  // os três de frente para a mesinha de centro
  sofa(g, 0x3f4a5f, [[0, -2.6, Math.PI], [-3.6, 0.6, -Math.PI / 2], [3.6, 0.6, Math.PI / 2]]);
  m.bloco([-1.6, 0, -3.15], [1.6, 0.8, -2.05], { data: { type: 'sofa' } });
  m.bloco([-4.15, 0, -1], [-3.05, 0.8, 2.2], { data: { type: 'sofa' } });
  m.bloco([3.05, 0, -1], [4.15, 0.8, 2.2], { data: { type: 'sofa' } });
  for (const [x, z, ry] of [[0, -2.6, Math.PI], [-3.6, 0.6, -Math.PI / 2], [3.6, 0.6, Math.PI / 2]]) lugaresDoSofa(x, z, ry, (lx, lz) => m.assento(lx, lz, 0.8, ry));
  caixa(g, [2.4, 0.4, 1.2], [0, 0.2, 0.5], mat(0x3b2618, { roughness: 0.4 }));
  // balcão de café no fundo
  caixa(g, [8, 1.05, 0.9], [0, 0.52, -D + 0.75], mat(0xe5e7eb, { roughness: 0.5 }));
  caixa(g, [0.6, 0.7, 0.5], [-2, 1.4, -D + 0.75], mat(0x111827, { roughness: 0.3, metalness: 0.5 }));
  m.bloco([-4, 0, -D + 0.3], [4, 1.05, -D + 1.2]);
  const cafe = placa('Café', '#a16207', { sub });
  plano(g, [4, 1], [2.5, 2.6, -D + 0.2], new THREE.MeshBasicMaterial({ map: cafe.tex, toneMapped: false }));
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [-W + 1.2, D - 1.6], [W - 1.2, D - 1.6]]);
  const l = new THREE.PointLight(0xffe8c7, 45, 28, 1.4);
  l.position.set(0, H - 0.8, 0);
  g.add(l);
  return {};
}

const SALAS = {
  ti: salaTI, comercial: salaComercial, telemarketing: salaTelemarketing, reuniao: salaReuniao,
  financeiro: salaFinanceiro, rh: salaRH, marketing: salaMarketing, gestao: salaGestao, descanso: salaDescanso,
};

// ------------------------------------------------------------------ texturas do prédio
// número pseudo-aleatório com semente: o desenho sai igual em todo navegador
function sorteio(semente) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// mármore claro em placas de 2×2 (o quadro inteiro vale 2 placas por lado)
function texMarmore() {
  const q = quadro(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ebe6dc';
    ctx.fillRect(0, 0, w, h);
    const r = sorteio(11);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '160,150,135'},${0.05 + r() * 0.06})`;
      ctx.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
    }
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = `rgba(125,113,96,${0.1 + r() * 0.14})`;
      ctx.lineWidth = 0.6 + r() * 1.5;
      ctx.beginPath();
      let x = r() * w;
      let y = r() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (r() - 0.35) * 110;
        y += (r() - 0.5) * 80;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(95,85,72,0.3)';
    for (const v of [0, w / 2]) {
      ctx.fillRect(v, 0, 2, h);
      ctx.fillRect(0, v, w, 2);
    }
  });
  q.tex.wrapS = q.tex.wrapT = THREE.RepeatWrapping;
  return q.tex;
}

// assoalho de tábuas (ao longo de x)
function texTabuas(base) {
  const q = quadro(512, 512, (ctx, w, h) => {
    const r = sorteio(5);
    const alto = 32;
    for (let y = 0; y < h; y += alto) {
      let x = -r() * 200;
      while (x < w) {
        const comp = 140 + r() * 180;
        const l = 0.88 + r() * 0.2;
        const [cr, cg, cb] = base;
        ctx.fillStyle = `rgb(${Math.round(cr * l)},${Math.round(cg * l)},${Math.round(cb * l)})`;
        ctx.fillRect(x, y, comp, alto);
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x, y + 4 + r() * (alto - 8), comp, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, y, 2, alto);
        x += comp;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y + alto - 2, w, 2);
    }
  });
  q.tex.wrapS = q.tex.wrapT = THREE.RepeatWrapping;
  return q.tex;
}

// jardim vertical: folhas de vários verdes
function texJardim() {
  const q = quadro(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1f3a24';
    ctx.fillRect(0, 0, w, h);
    const r = sorteio(3);
    const verdes = ['#2f6b3a', '#3f8a4a', '#4f9d55', '#2a5a33', '#6bb35f', '#8fcf6e', '#356e3f'];
    for (let i = 0; i < 1500; i++) {
      ctx.save();
      ctx.translate(r() * w, r() * h);
      ctx.rotate(r() * Math.PI * 2);
      ctx.fillStyle = verdes[Math.floor(r() * verdes.length)];
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 + r() * 9, 2.5 + r() * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  q.tex.wrapS = q.tex.wrapT = THREE.RepeatWrapping;
  return q.tex;
}

// passadeira do corredor: azul-petróleo com borda dupla
function texPassadeira() {
  const q = quadro(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#23394a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 8, h);
    ctx.fillStyle = '#c9a14a';
    ctx.fillRect(0, 10, w, 4);
    ctx.fillRect(0, h - 14, w, 4);
    ctx.fillStyle = '#6ee7c8';
    ctx.fillRect(0, 20, w, 2);
    ctx.fillRect(0, h - 22, w, 2);
  });
  q.tex.wrapS = THREE.RepeatWrapping;
  return q.tex;
}

// água do espelho d'água (anda devagar)
function texAgua() {
  const q = quadro(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0e5a63');
    g.addColorStop(1, '#127a7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = sorteio(9);
    ctx.strokeStyle = 'rgba(190,255,245,0.22)';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const x = r() * w;
      const y = r() * h;
      ctx.arc(x, y, 6 + r() * 26, r() * 6, r() * 6 + 1.4);
      ctx.stroke();
    }
  });
  q.tex.wrapS = q.tex.wrapT = THREE.RepeatWrapping;
  return q.tex;
}

// letreiro só com as letras (fundo transparente), para paredes e marquise
function letreiro(texto, sub, cor = '#6ee7c8') {
  const q = quadro(1024, 256, (ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 12 * ctx.getTransform().a; // o desfoque não segue a escala do canvas
    ctx.font = `800 ${sub ? 112 : 128}px ${FONTE}`;
    ctx.fillText(texto, w / 2, sub ? h * 0.4 : h / 2, w - 40);
    ctx.shadowBlur = 0;
    if (sub) {
      ctx.fillStyle = cor;
      ctx.font = `700 40px ${FONTE}`;
      ctx.fillText(sub.toUpperCase().split('').join(' '), w / 2, h * 0.82, w - 40);
    }
  }, NO_APARELHO);
  return new THREE.MeshBasicMaterial({ map: q.tex, transparent: true, toneMapped: false, depthWrite: false });
}

// totem com a lista de salas de um corredor
function totem(titulo, salas) {
  return quadro(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#14181f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9a14a';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 54px ${FONTE}`;
    ctx.fillText('Departamentos', 40, 100);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 30px ${FONTE}`;
    ctx.fillText(titulo, 40, 148);
    salas.forEach((s, i) => {
      const y = 240 + i * 112;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(28, y - 52, w - 56, 88);
      ctx.fillStyle = s.cor;
      ctx.fillRect(28, y - 52, 10, 88);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = `700 44px ${FONTE}`;
      ctx.fillText(s.nome, 64, y + 6, w - 170);
      ctx.fillStyle = '#94a3b8';
      ctx.font = `700 40px ${FONTE}`;
      ctx.textAlign = 'right';
      ctx.fillText(s.lado === 'sul' ? '↙' : '↖', w - 48, y + 6);
      ctx.textAlign = 'left';
    });
  }, NO_APARELHO);
}

// árvores de interior em vasos redondos: [x, z]
function arvores(grupo, lugares, world) {
  repetir(grupo, [
    { geo: new THREE.CylinderGeometry(0.85, 0.7, 0.9, 20), mat: mat(0x4b5563, { roughness: 0.7 }), pos: [0, 0.45, 0] },
    { geo: new THREE.CylinderGeometry(0.78, 0.78, 0.04, 20), mat: mat(0x3b2a1e, { roughness: 1 }), pos: [0, 0.88, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.09, 0.14, 3.2, 8), mat: mat(0x6b4a33, { roughness: 0.9 }), pos: [0, 2.4, 0] },
    { geo: new THREE.IcosahedronGeometry(1.35, 1), mat: mat(0x3f7d4a, { flatShading: true }), pos: [0, 4.2, 0] },
    { geo: new THREE.IcosahedronGeometry(1.0, 1), mat: mat(0x55994f, { flatShading: true }), pos: [0.6, 4.9, 0.3] },
    { geo: new THREE.IcosahedronGeometry(1.05, 1), mat: mat(0x2f6b3a, { flatShading: true }), pos: [-0.55, 3.6, -0.35] },
  ], lugares);
  for (const [x, z] of lugares) world.addBox({ min: [x - 0.8, 0, z - 0.8], max: [x + 0.8, 0.9, z + 0.8] });
}

// ------------------------------------------------------------------ prédio
// apagado(cor): o cartaz compartilhado de monitor desligado do World (ver molduras), ou null
export function construirEscritorio(world, p, { empresa = '', apagado = null } = {}) {
  const raiz = new THREE.Group();
  world.scene.add(raiz);
  const minX = p.minX;
  const maxX = PREDIO.maxX;
  const [c0, c1] = PREDIO.corredor;
  const [f0, f1] = PREDIO.corredorFundos;
  const { z1, recepcao } = PREDIO;
  const z0 = p.z0;
  const HR = 10; // pé-direito da recepção (átrio)
  const zEntrada = (c0 + c1) / 2;

  // paleta: neutros quentes, madeira, grafite e um toque de verde-água (a cor da marca) e latão
  const reboco = mat(0xe6e0d6, { roughness: 0.92 });
  const interna = mat(0xece7df, { roughness: 0.9 });
  const pedra = mat(0x8a8277, { roughness: 0.95 });
  const grafite = mat(0x2b2f36, { roughness: 0.5, metalness: 0.3 });
  const madeira = mat(0xa47551, { roughness: 0.55 });
  const madeiraEsc = mat(0x6b4a33, { roughness: 0.5 });
  const latao = mat(0xc9a14a, { roughness: 0.3, metalness: 0.85 });
  // Vidro de uma camada só (FrontSide): as caixas de vidro são fechadas, e de qualquer lado aparece
  // só a face virada para a câmera. 0,29 = 1 − (1 − 0,16)²: a densidade das duas camadas de antes
  // (frente e fundo da caixa, com o vidro dos dois lados). Continua PBR, com o brilho da Alta.
  const vidro = new THREE.MeshStandardMaterial({ color: 0xa5d8ff, transparent: true, opacity: 0.29, roughness: 0.05, metalness: 0.1, depthWrite: false });
  // planos transparentes vistos dos dois lados: numa passada só (o three desenhava 2×, uma por face,
  // trocando de programa); num plano sem luz o resultado é o mesmo
  const fosco = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  const caixilho = mat(0x2b3240, { roughness: 0.4, metalness: 0.5 });
  const janela = mat(0x1e3a5f, { roughness: 0.15, metalness: 0.6, emissive: 0x0b1a2e });
  const luzQuente = brilho(0xfff1d6);
  // peças que ficam soltas no juntarSoltas do fim (ver lá)
  const fixas = new Set();

  // parede (alinhada a x ou a z), com colisão e barrando a câmera. As que barram a câmera ficam
  // soltas (fixas): estão em cameraBlockers, que o raio da câmera, o tiro e o tapada usam.
  // Vidro não faz nem recebe sombra (recebida, ela custava a busca no mapa por pixel de vidro).
  const parede = (xa, za, xb, zb, material, { y0 = 0, y1 = H, camera = true, colide = true } = {}) => {
    const w = Math.max(T, Math.abs(xb - xa));
    const d = Math.max(T, Math.abs(zb - za));
    const m = caixa(raiz, [w, y1 - y0, d], [(xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2], material, { sombra: material !== vidro });
    if (material === vidro) m.receiveShadow = false;
    if (colide) world.addBox({ min: [Math.min(xa, xb) - (w === T ? T / 2 : 0), y0, Math.min(za, zb) - (d === T ? T / 2 : 0)], max: [Math.max(xa, xb) + (w === T ? T / 2 : 0), y1, Math.max(za, zb) + (d === T ? T / 2 : 0)], mesh: m, blocksCamera: camera });
    if (colide && camera) fixas.add(m);
    return m;
  };

  // por fora de uma parede externa: rodapé de pedra, faixas de janela com montantes e cornija.
  // [nx, nz]: o lado de fora
  const acabamento = (xa, za, xb, zb, [nx, nz], altura) => {
    const aoLongoX = za === zb;
    const comp = aoLongoX ? Math.abs(xb - xa) : Math.abs(zb - za);
    const cx = (xa + xb) / 2;
    const cz = (za + zb) / 2;
    const fora = T / 2 + 0.05;
    const px = cx + nx * fora;
    const pz = cz + nz * fora;
    const dims = (w, h, d) => (aoLongoX ? [w, h, d] : [d, h, w]);
    caixa(raiz, dims(comp + 0.1, 1.2, 0.1), [px, 0.6, pz], pedra, { sombra: false });
    const faixas = altura > 8 ? [3.3, 7.3] : [3.4];
    for (const y of faixas) caixa(raiz, dims(comp - 1.2, 2.2, 0.06), [px, y, pz], janela, { sombra: false });
    const n = Math.max(1, Math.round((comp - 1.2) / 3.5));
    const lugares = [];
    for (let i = 0; i <= n; i++) {
      const s = -(comp - 1.2) / 2 + (i * (comp - 1.2)) / n;
      lugares.push(aoLongoX ? [cx + s, pz + nz * 0.05] : [px + nx * 0.05, cz + s]);
    }
    repetir(raiz, faixas.map((y) => ({ geo: new THREE.BoxGeometry(0.14, 2.45, 0.14), mat: caixilho, pos: [0, y, 0], sombra: false })), lugares);
    caixa(raiz, dims(comp + 0.8, 0.45, 0.4), [cx + nx * (T / 2 + 0.2), altura + 0.12, cz + nz * (T / 2 + 0.2)], grafite, { sombra: false });
  };

  // ---------------------------------------------------------------- casca
  // salas e corredores: pé-direito H; recepção (x de 40 a 60): átrio de HR, com fachada de vidro
  parede(minX, z0, recepcao, z0, reboco);
  parede(minX, z1, recepcao, z1, reboco);
  parede(minX, z0, minX, z1, reboco);
  parede(recepcao, z0, maxX, z0, reboco, { y1: HR });
  parede(recepcao, z1, maxX, z1, reboco, { y1: HR });
  acabamento(minX, z0, recepcao, z0, [0, -1], H);
  acabamento(minX, z1, recepcao, z1, [0, 1], H);
  acabamento(minX, z0, minX, z1, [-1, 0], H);
  acabamento(recepcao, z0, maxX, z0, [0, -1], HR);
  acabamento(recepcao, z1, maxX, z1, [0, 1], HR);
  // lajes e forro (o forro claro por dentro: a laje quase não pega luz e ficava preta)
  const laje = mat(0x3a3f4a, { roughness: 0.95 });
  caixa(raiz, [recepcao - minX + 0.6, 0.35, z1 - z0 + 0.6], [(minX + recepcao) / 2, H + 0.17, (z0 + z1) / 2], laje, { sombra: false }).receiveShadow = false;
  caixa(raiz, [maxX - recepcao + 0.3, 0.35, z1 - z0 + 0.6], [(recepcao + maxX) / 2, HR + 0.17, (z0 + z1) / 2], laje, { sombra: false }).receiveShadow = false;
  const forro = mat(0xdcd8d0, { roughness: 1, emissive: 0x3d3b37 });
  plano(raiz, [recepcao - minX, z1 - z0], [(minX + recepcao) / 2, H - 0.01, (z0 + z1) / 2], forro, [Math.PI / 2, 0, 0]);
  plano(raiz, [maxX - recepcao, z1 - z0], [(recepcao + maxX) / 2, HR - 0.01, (z0 + z1) / 2], forro, [Math.PI / 2, 0, 0]);

  // fachada leste: pele de vidro do chão ao teto, com montantes, e a porta no eixo do corredor
  parede(maxX, z0, maxX, c0, vidro, { y1: HR, camera: false });
  parede(maxX, c1, maxX, z1, vidro, { y1: HR, camera: false });
  parede(maxX, c0, maxX, c1, vidro, { y0: 3.8, y1: HR, colide: false });
  {
    const montantes = [];
    const n = Math.round((z1 - z0) / 3);
    for (let i = 0; i <= n; i++) {
      const z = z0 + (i * (z1 - z0)) / n;
      if (z > c0 + 0.2 && z < c1 - 0.2) continue;
      montantes.push([maxX, z]);
    }
    repetir(raiz, [{ geo: new THREE.BoxGeometry(0.16, HR, 0.12), mat: grafite, pos: [0, HR / 2, 0], sombra: false }], montantes);
    for (const y of [3.8, 7.1]) {
      caixa(raiz, [0.16, 0.12, c0 - z0], [maxX, y, (z0 + c0) / 2], grafite, { sombra: false });
      caixa(raiz, [0.16, 0.12, z1 - c1], [maxX, y, (c1 + z1) / 2], grafite, { sombra: false });
    }
    caixa(raiz, [0.16, 0.12, c1 - c0], [maxX, 7.1, zEntrada], grafite, { sombra: false });
    caixa(raiz, [0.3, 0.3, c1 - c0], [maxX, 3.8, zEntrada], grafite, { sombra: false });
    caixa(raiz, [0.5, 0.4, c0 - z0], [maxX, 0.2, (z0 + c0) / 2], pedra, { sombra: false });
    caixa(raiz, [0.5, 0.4, z1 - c1], [maxX, 0.2, (c1 + z1) / 2], pedra, { sombra: false });
    caixa(raiz, [0.9, 0.45, z1 - z0 + 0.8], [maxX + 0.1, HR + 0.12, (z0 + z1) / 2], grafite, { sombra: false });
    // portas de correr abertas, encostadas dos dois lados do vão
    for (const z of [c0 - 1.3, c1 + 1.3]) caixa(raiz, [0.06, 3.6, 2.4], [maxX - 0.35, 1.8, z], vidro, { sombra: false }).receiveShadow = false;
  }

  // marquise sobre a entrada, com pilares, luzes embutidas e o nome da empresa em cima
  caixa(raiz, [7, 0.35, 14], [maxX + 3.5, 4.3, zEntrada], grafite);
  caixa(raiz, [7.05, 0.08, 14.05], [maxX + 3.5, 4.1, zEntrada], mat(0xa47551, { roughness: 0.6, emissive: 0x3a2414 }), { sombra: false });
  for (const z of [zEntrada - 6.3, zEntrada + 6.3]) {
    caixa(raiz, [0.32, 4.15, 0.32], [maxX + 6.5, 2.07, z], grafite);
    world.addBox({ min: [maxX + 6.3, 0, z - 0.2], max: [maxX + 6.7, 4.2, z + 0.2] });
  }
  repetir(raiz, [{ geo: new THREE.CircleGeometry(0.16, 16), mat: luzQuente, pos: [0, 4.05, 0], giro: [Math.PI / 2, 0, 0], sombra: false }],
    [[maxX + 1.5, zEntrada - 4], [maxX + 1.5, zEntrada], [maxX + 1.5, zEntrada + 4], [maxX + 4.5, zEntrada - 4], [maxX + 4.5, zEntrada], [maxX + 4.5, zEntrada + 4]]);
  plano(raiz, [9, 2.25], [maxX + 6.9, 5.6, zEntrada], letreiro(empresa || 'Escritório', 'escritório'), [0, Math.PI / 2, 0]);
  // calçada de pedra na frente, floreiras e balizadores de luz. O mármore é um canvas só: o piso da
  // recepção usa uma cópia dele (a mesma imagem na placa), com outra repetição.
  const marmore = texMarmore();
  plano(raiz, [12, 22], [maxX + 6, 0.025, zEntrada], mat(0xb9b2a6, { map: marmore, roughness: 0.8 }), [-Math.PI / 2, 0, 0]);
  const floreira = mat(0x57534e, { roughness: 0.8 });
  for (const z of [zEntrada - 9.5, zEntrada + 9.5]) {
    caixa(raiz, [6, 0.7, 1.4], [maxX + 4, 0.35, z], floreira);
    world.addBox({ min: [maxX + 1, 0, z - 0.7], max: [maxX + 7, 0.7, z + 0.7] });
  }
  plantas(raiz, [[maxX + 2.2, zEntrada - 9.5], [maxX + 5.8, zEntrada - 9.5], [maxX + 2.2, zEntrada + 9.5], [maxX + 5.8, zEntrada + 9.5]]);
  repetir(raiz, [
    { geo: new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), mat: grafite, pos: [0, 0.45, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.105, 0.105, 0.12, 10), mat: brilho(0xffe6b0), pos: [0, 0.82, 0], sombra: false },
  ], [[maxX + 9, zEntrada - 5], [maxX + 9, zEntrada - 1.5], [maxX + 9, zEntrada + 1.5], [maxX + 9, zEntrada + 5]]);

  // ---------------------------------------------------------------- corredores
  // assoalho de madeira com passadeira, forro de ripas, sancas de luz nas laterais, plantas
  // entre as portas e um jardim vertical no fim
  const assoalho = texTabuas([150, 108, 74]);
  const passadeira = texPassadeira();
  const verde = texJardim();
  const corredor = (za, zb) => {
    const comp = recepcao - minX;
    const cx = (minX + recepcao) / 2;
    const cz = (za + zb) / 2;
    const larg = zb - za;
    const piso = assoalho.clone();
    piso.needsUpdate = true;
    piso.repeat.set(comp / 4, larg / 4);
    plano(raiz, [comp, larg], [cx, 0.02, cz], mat(0xffffff, { map: piso, roughness: 0.55 }), [-Math.PI / 2, 0, 0]);
    const tapete = passadeira.clone();
    tapete.needsUpdate = true;
    tapete.repeat.set(comp / 3, 1);
    plano(raiz, [comp - 1, 2.6], [cx, 0.03, cz], mat(0xffffff, { map: tapete, roughness: 1 }), [-Math.PI / 2, 0, 0]);
    // forro de ripas de madeira, de lado a lado
    const ripas = [];
    for (let x = minX + 0.4; x < recepcao - 0.2; x += 0.55) ripas.push([x, cz]);
    repetir(raiz, [{ geo: new THREE.BoxGeometry(0.09, 0.28, larg - 0.3), mat: madeira, pos: [0, H - 0.2, 0], sombra: false }], ripas);
    // sancas: linhas de luz nas duas laterais do forro
    for (const z of [za + 0.35, zb - 0.35]) caixa(raiz, [comp - 0.4, 0.05, 0.12], [cx, H - 0.06, z], luzQuente, { sombra: false });
    // rodapé escuro dos dois lados
    for (const z of [za + 0.05, zb - 0.05]) caixa(raiz, [comp, 0.14, 0.1], [cx, 0.07, z], grafite, { sombra: false });
    // fundo do corredor: jardim vertical emoldurado, com arandelas e dois vasos
    const jv = verde.clone();
    jv.needsUpdate = true;
    jv.repeat.set(larg / 4, (H - 1.4) / 4);
    caixa(raiz, [0.12, H - 1.0, larg - 1.4], [minX + T / 2 + 0.06, (H - 1.0) / 2 + 0.3, cz], madeiraEsc, { sombra: false });
    plano(raiz, [larg - 1.8, H - 1.4], [minX + T / 2 + 0.13, (H - 1.0) / 2 + 0.3, cz], mat(0xffffff, { map: jv, roughness: 1 }), [0, Math.PI / 2, 0]);
    plantas(raiz, [[minX + 1.2, za + 1.0], [minX + 1.2, zb - 1.0]]);
    world.addBox({ min: [minX, 0, za + 0.4], max: [minX + 1.7, 1, za + 1.6] });
    world.addBox({ min: [minX, 0, zb - 1.6], max: [minX + 1.7, 1, zb - 0.4] });
    // luzes (o World acende só as mais perto)
    for (let x = recepcao - 14; x > minX; x -= 28) {
      const l = new THREE.PointLight(0xfff1e0, 42, 26, 1.5);
      l.position.set(x, H - 0.8, cz);
      raiz.add(l);
    }
    // vasos encostados nas divisas entre as salas
    const vasos = [];
    for (const s of [...p.salas, ...p.lounges]) {
      if (s.x0 <= minX + 1) continue;
      const lado = zDaPorta(s.lado);
      if (lado !== za && lado !== zb) continue;
      vasos.push([s.x0, lado === za ? za + 0.75 : zb - 0.75]);
    }
    const unicos = [...new Map(vasos.map((v) => [v.join(','), v])).values()];
    plantas(raiz, unicos);
    for (const [x, z] of unicos) world.addBox({ min: [x - 0.5, 0, z - 0.5], max: [x + 0.5, 1, z + 0.5] });
  };
  corredor(c0, c1);
  if (p.fundos) corredor(f0, f1);

  // ---------------------------------------------------------------- paredes internas
  // divisórias entre as colunas de salas (a da recepção, em x = 40, é feita à parte). São opacas,
  // como o fundo da fileira norte, e é nisso que o World se apoia para esconder as salas que não
  // dá para ver (cullSalas): se alguma delas virar vidro, a regra de lá tem de acompanhar.
  const trechos = p.fundos ? [[z0, f0], [f1, c0], [c1, z1]] : [[z0, c0], [c1, z1]];
  const divisas = [...new Set([...p.salas, ...p.lounges].map((s) => s.x1))].filter((x) => x !== recepcao);
  for (const x of divisas) for (const [a, b] of trechos) parede(x, a, x, b, interna);
  // fileira dos fundos: o fundo das salas do norte vira parede do corredor dos fundos, com quadros
  if (p.fundos) {
    parede(minX, f1, recepcao, f1, interna);
    // parede mais grossa do lado do corredor: as telas das salas do norte não aparecem através dela
    parede(minX, f1 - 0.45, recepcao, f1 - 0.45, interna);
    caixa(raiz, [recepcao - minX, 0.14, 0.1], [(minX + recepcao) / 2, 0.07, f1 - 0.65], grafite, { sombra: false });
    const quadros = [];
    for (const s of p.salas.filter((x) => x.lado === 'norte').concat(p.lounges.filter((x) => x.lado === 'norte'))) quadros.push([(s.x0 + s.x1) / 2, f1 - 0.65]);
    const arte = quadro(512, 320, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0f766e');
      g.addColorStop(0.5, '#c9a14a');
      g.addColorStop(1, '#7c3aed');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(80 + i * 75, 160 + Math.sin(i) * 60, 40 + i * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    repetir(raiz, [
      { geo: new THREE.BoxGeometry(4.4, 2.8, 0.08), mat: madeiraEsc, pos: [0, 3.1, 0], sombra: false },
      { geo: new THREE.PlaneGeometry(4.1, 2.5), mat: new THREE.MeshBasicMaterial({ map: arte.tex }), pos: [0, 3.1, -0.05], giro: [0, Math.PI, 0], sombra: false },
    ], quadros);
  }

  // parede entre a recepção e as salas: alta como o átrio, com portais de madeira nos corredores
  const vaos = p.fundos ? [[f0, f1], [c0, c1]] : [[c0, c1]];
  let zz = z0;
  for (const [a, b] of vaos) {
    parede(recepcao, zz, recepcao, a, interna, { y1: HR });
    parede(recepcao, a, recepcao, b, interna, { y0: H, y1: HR, colide: false });
    // portal: batentes e verga de madeira
    for (const z of [a + 0.15, b - 0.15]) caixa(raiz, [0.6, H, 0.3], [recepcao + 0.15, H / 2, z], madeira);
    caixa(raiz, [0.6, 0.4, b - a], [recepcao + 0.15, H - 0.2, (a + b) / 2], madeira, { sombra: false });
    zz = b;
  }
  parede(recepcao, zz, recepcao, z1, interna, { y1: HR });
  // do lado do átrio: faixa de madeira na altura do forro dos corredores e quadros grandes
  caixa(raiz, [0.1, 0.7, z1 - z0], [recepcao + T / 2 + 0.05, H + 0.35, (z0 + z1) / 2], madeira, { sombra: false });
  // duas telas de compartilhar na parede da recepção, uma de cada lado do corredor principal
  // (entram na lista de telas depois das salas — é a ordem da planta)
  const telasRecepcao = [(PREDIO.z0 + c0) / 2, (c1 + z1) / 2].map((z, i) => ({
    pos: [recepcao + T / 2 + 0.55, 3.6, z], rotY: Math.PI / 2, w: 6.4, h: 3.6, rotulo: `Recepção · Tela ${i + 1}`,
  }));

  // ---------------------------------------------------------------- frente das salas
  // vidro com faixa jateada na cor do setor, porta com batentes de madeira e placa iluminada.
  // O vidro, o fosco e a faixa ficam peças separadas (fora do juntarSoltas): transparentes são
  // desenhados na ordem da distância de cada peça, e mesclar as duas metades da frente punha o
  // centro na porta, com o rosto de quem está perto do vidro aparecendo na frente da faixa.
  // Os contornos das placas, cada um na cor da sua sala, são um material só (cor por vértice).
  const contornoDaPlaca = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  for (const s of p.salas) {
    const zc = zDaPorta(s.lado);
    const meio = (s.x0 + s.x1) / 2;
    const ladoCorredor = s.lado === 'sul' ? -1 : 1; // para que lado de zc fica o corredor
    parede(s.x0, zc, meio - PORTA / 2, zc, vidro, { camera: false });
    parede(meio + PORTA / 2, zc, s.x1, zc, vidro, { camera: false });
    parede(meio - PORTA / 2, zc, meio + PORTA / 2, zc, interna, { y0: 3.2, colide: false });
    const faixa = new THREE.MeshBasicMaterial({ color: s.cor, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    for (const [xa, xb] of [[s.x0 + 0.2, meio - PORTA / 2 - 0.2], [meio + PORTA / 2 + 0.2, s.x1 - 0.2]]) {
      plano(raiz, [xb - xa, 0.7], [(xa + xb) / 2, 1.45, zc + ladoCorredor * 0.17], fosco);
      plano(raiz, [xb - xa, 0.05], [(xa + xb) / 2, 1.85, zc + ladoCorredor * 0.17], faixa);
    }
    for (let x = s.x0 + 3.5; x < s.x1 - 0.5; x += 3.5) if (Math.abs(x - meio) > PORTA / 2) caixa(raiz, [0.08, H, 0.12], [x, H / 2, zc], caixilho, { sombra: false });
    for (const x of [meio - PORTA / 2, meio + PORTA / 2]) caixa(raiz, [0.22, 3.25, 0.4], [x, 1.62, zc], madeira);
    caixa(raiz, [PORTA + 0.22, 0.22, 0.4], [meio, 3.2, zc], madeira, { sombra: false });
    // placa: a cara do setor (placaDaSala) numa caixa de grafite, com o contorno aceso na cor da
    // sala e uma luminária de quadro em cima. Cabe no trecho de parede sobre a porta (4 m).
    const yp = 4.35;
    const face = zc + ladoCorredor * (T / 2); // a face da parede, do lado do corredor
    const fora = (d) => face + ladoCorredor * d;
    pintar(caixa(raiz, [3.7, 1.1, 0.05], [meio, yp, fora(0.025)], contornoDaPlaca, { sombra: false, arredondada: 0.04 }).geometry, s.cor);
    caixa(raiz, [3.6, 1.0, 0.1], [meio, yp, fora(0.06)], grafite, { sombra: false, arredondada: 0.04 });
    plano(raiz, [3.52, 0.917], [meio, yp, fora(0.112)], new THREE.MeshBasicMaterial({ map: placaDaSala(s).tex, toneMapped: false }), [0, ladoCorredor > 0 ? 0 : Math.PI, 0]);
    for (const dx of [-1.15, 1.15]) caixa(raiz, [0.04, 0.04, 0.34], [meio + dx, yp + 0.8, fora(0.17)], grafite, { sombra: false });
    caixa(raiz, [2.8, 0.07, 0.11], [meio, yp + 0.8, fora(0.36)], grafite, { sombra: false });
    caixa(raiz, [2.7, 0.02, 0.07], [meio, yp + 0.76, fora(0.36)], luzQuente, { sombra: false });
  }

  // ---------------------------------------------------------------- recepção (átrio)
  const rx = (recepcao + maxX) / 2;
  const pisoRecepcao = marmore.clone();
  pisoRecepcao.repeat.set((maxX - recepcao) / 4, (z1 - z0) / 4);
  plano(raiz, [maxX - recepcao, z1 - z0], [rx, 0.02, (z0 + z1) / 2], mat(0xffffff, { map: pisoRecepcao, roughness: 0.25, metalness: 0.05 }), [-Math.PI / 2, 0, 0]);
  // medalhão de latão no piso, no eixo da entrada
  const medalhao = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.6, 64), latao);
  medalhao.rotation.x = -Math.PI / 2;
  medalhao.position.set(rx, 0.035, zEntrada);
  raiz.add(medalhao);
  const miolo = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), mat(0x2b2f36, { roughness: 0.3 }));
  miolo.rotation.x = -Math.PI / 2;
  miolo.position.set(rx, 0.03, zEntrada);
  raiz.add(miolo);
  const anel = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.08, 64), latao);
  anel.rotation.x = -Math.PI / 2;
  anel.position.set(rx, 0.036, zEntrada);
  raiz.add(anel);

  // claraboia: grelha de vigas sobre um painel de luz no teto do átrio
  const za0 = z0 + 4;
  const za1 = z1 - 4;
  plano(raiz, [maxX - recepcao - 6, za1 - za0], [rx, HR - 0.03, (za0 + za1) / 2], brilho(0xf3f6fb), [Math.PI / 2, 0, 0]);
  const vigas = [];
  for (let z = za0; z <= za1 + 0.01; z += 2.5) vigas.push([rx, z]);
  repetir(raiz, [{ geo: new THREE.BoxGeometry(maxX - recepcao - 5.6, 0.45, 0.22), mat: grafite, pos: [0, HR - 0.25, 0], sombra: false }], vigas);
  for (const x of [recepcao + 3, maxX - 3, rx]) caixa(raiz, [0.22, 0.45, za1 - za0 + 0.4], [x, HR - 0.25, (za0 + za1) / 2], grafite, { sombra: false });

  // quatro colunas redondas emoldurando o eixo da entrada (um material para as quatro: viram uma
  // malha só no fim)
  const marfim = mat(0xf4f1ea, { roughness: 0.4 });
  for (const [x, z] of [[rx - 4.5, zEntrada - 8.5], [rx + 4.5, zEntrada - 8.5], [rx - 4.5, zEntrada + 8.5], [rx + 4.5, zEntrada + 8.5]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, HR, 24), marfim);
    col.position.set(x, HR / 2, z);
    col.castShadow = true;
    raiz.add(col);
    for (const y of [0.15, HR - 0.15]) {
      const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 24), latao);
      aro.position.set(x, y, z);
      raiz.add(aro);
    }
    world.addBox({ min: [x - 0.5, 0, z - 0.5], max: [x + 0.5, HR, z + 0.5] });
  }

  // balcão curvo (Corian branco, tampo de madeira e filete de luz), virado para quem chega
  const dc = { x: rx + 1, z: zEntrada - 14.5 };
  const abre = 1.2; // meia-abertura do arco (rad)
  const R0 = 3.0;
  const R1 = 3.8;
  const forma = new THREE.Shape();
  forma.absarc(0, 0, R1, -Math.PI / 2 - abre, -Math.PI / 2 + abre, false);
  forma.absarc(0, 0, R0, -Math.PI / 2 + abre, -Math.PI / 2 - abre, true);
  const corian = mat(0xf8f7f4, { roughness: 0.35 });
  const luzBalcao = brilho(0x6ee7c8);
  const corpo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 1.08, bevelEnabled: false, curveSegments: 40 }), corian);
  corpo.rotation.x = -Math.PI / 2;
  corpo.position.set(dc.x, 0, dc.z);
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  raiz.add(corpo);
  const tampoBalcao = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.07, bevelEnabled: false, curveSegments: 40 }), madeira);
  tampoBalcao.rotation.x = -Math.PI / 2;
  tampoBalcao.position.set(dc.x, 1.08, dc.z);
  raiz.add(tampoBalcao);
  const filete = new THREE.Mesh(new THREE.TorusGeometry(R1 + 0.01, 0.025, 6, 64, abre * 2), luzBalcao);
  filete.rotation.x = Math.PI / 2;
  const fileteG = new THREE.Group();
  fileteG.add(filete);
  fileteG.rotation.y = abre - Math.PI / 2;
  fileteG.position.set(dc.x, 0.12, dc.z);
  raiz.add(fileteG);
  for (const a of [-0.8, 0, 0.8]) {
    const x = dc.x + Math.sin(a) * 3.4;
    const z = dc.z + Math.cos(a) * 3.4;
    world.addBox({ min: [x - 1.1, 0, z - 1.1], max: [x + 1.1, 1.15, z + 1.1] });
  }
  // Posto da recepcionista, por dentro do balcão: mesa reta (cabe no arco de dentro, R0), 3 monitores
  // virados para a cadeira, teclado e mouse. Quem senta olha para +z (para quem chega). Entra nos
  // postos e nos assentos lá embaixo, depois dos das salas (é a ordem da planta).
  const zMon = dc.z + 2.38; // tela do meio
  const zCad = zMon - 1.6; // a mesma distância das bancadas do Comercial
  const zMesa = dc.z + 2.08; // de dc.z + 1,6 a 2,56: os cantos de trás ficam dentro do R0
  repetir(raiz, [
    { geo: new RoundedBoxGeometry(2.9, 0.08, 0.96, 2, 0.03), mat: madeira, pos: [0, 1.0, 0] },
    { geo: new THREE.BoxGeometry(2.8, 0.95, 0.06), mat: corian, pos: [0, 0.5, -0.44] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 0.92), mat: corian, pos: [-1.4, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 0.92), mat: corian, pos: [1.4, 0.5, 0] },
    { geo: new THREE.BoxGeometry(2.9, 0.03, 0.03), mat: luzBalcao, pos: [0, 0.97, 0.49], sombra: false },
  ], [[dc.x, zMesa, Math.PI]]);
  world.addBox({ min: [dc.x - 1.45, 0, zMesa - 0.48], max: [dc.x + 1.45, 1.05, zMesa + 0.48], data: { type: 'mesa' } });
  // tresMonitores olha para +z: girado meia volta em torno da tela do meio
  const monsRecepcao = tresMonitores(0, 0, 1.56, 0.95).map((mo) => ({ ...mo, x: dc.x - mo.x, z: zMon - mo.z, ry: mo.ry + Math.PI }));
  molduras(raiz, monsRecepcao, mat(0x111827, { roughness: 0.4 }), apagado ? apagado(p.recepcao.cor) : null);
  repetir(raiz, partesCadeira({ tecido: mat(0x23394a, { roughness: 0.8 }), metal: mat(0x9ca3af, { metalness: 0.6, roughness: 0.3 }) }), [[dc.x, zCad, Math.PI]]);
  world.addBox({ min: [dc.x - 0.32, 0, zCad - 0.32], max: [dc.x + 0.32, 0.6, zCad + 0.32], data: { type: 'sofa' } });
  const idPostoRecepcao = `${p.recepcao.id}-0`;
  const postoRecepcao = {
    id: idPostoRecepcao,
    monitores: monsRecepcao.map((mo) => ({ pos: [mo.x, mo.y, mo.z], rotY: mo.ry, w: mo.w, h: mo.h })),
    mesa: { pos: [dc.x, 1.04, zCad + 1.02], rotY: Math.PI }, // teclado virado para a cadeira (−z)
  };

  // parede de destaque atrás do balcão: ripas de madeira sobre fundo escuro, com o nome da empresa
  const zp = dc.z - R1 - 1.3;
  // (11 m de largura: sobram passagens dos dois lados para o fundo do átrio e o corredor dos fundos)
  caixa(raiz, [11, 5.6, 0.3], [rx, 2.8, zp], mat(0x1f2329, { roughness: 0.8 }));
  world.addBox({ min: [rx - 5.5, 0, zp - 0.2], max: [rx + 5.5, 5.6, zp + 0.2] });
  const ripasDestaque = [];
  for (let x = rx - 5.3; x <= rx + 5.3; x += 0.22) ripasDestaque.push([x, zp + 0.2]);
  repetir(raiz, [{ geo: new THREE.BoxGeometry(0.1, 5.6, 0.1), mat: madeira, pos: [0, 2.8, 0], sombra: false }], ripasDestaque);
  caixa(raiz, [11.2, 0.06, 0.5], [rx, 5.62, zp], luzQuente, { sombra: false });
  const nomeEmpresa = plano(raiz, [9.6, 2.4], [rx, 3.4, zp + 0.3], letreiro(empresa || 'Bem-vindo', empresa ? 'bem-vindo' : 'escritório virtual'));
  // logo da empresa (o dono põe no painel "Sala da empresa"): numa placa clara acima do nome
  const logoMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
  const logoFundo = caixa(raiz, [1, 1, 0.06], [rx, 4.35, zp + 0.3], mat(0xf5f2ec, { roughness: 0.6 }), { sombra: false, arredondada: 0.02 });
  const logoPlano = plano(raiz, [1, 1], [rx, 4.35, zp + 0.34], logoMat);
  logoFundo.visible = false;
  logoPlano.visible = false;
  const mostrarLogo = (img) => {
    logoMat.map?.dispose();
    logoMat.map = null;
    if (!img) {
      logoFundo.visible = logoPlano.visible = false;
      nomeEmpresa.position.y = 3.4;
      nomeEmpresa.scale.set(1, 1, 1);
      return;
    }
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    logoMat.map = tex;
    logoMat.needsUpdate = true;
    const asp = img.width / img.height || 1;
    let h = 1.7;
    let w = h * asp;
    if (w > 5.6) {
      w = 5.6;
      h = w / asp;
    }
    logoPlano.scale.set(w, h, 1);
    logoFundo.scale.set(w + 0.4, h + 0.3, 1);
    logoFundo.visible = logoPlano.visible = true;
    nomeEmpresa.position.y = 2.25;
    nomeEmpresa.scale.set(0.8, 0.8, 1);
  };
  // jardim vertical na parede do fundo (norte) do átrio, com árvores
  const jvR = verde.clone();
  jvR.needsUpdate = true;
  jvR.repeat.set((maxX - recepcao - 4) / 4, (HR - 2) / 4);
  const jardimRecepcao = mat(0xffffff, { map: jvR, roughness: 1 });
  plano(raiz, [maxX - recepcao - 4, HR - 2], [rx, HR / 2, z0 + T / 2 + 0.03], jardimRecepcao);
  caixa(raiz, [maxX - recepcao - 3.6, 0.5, 0.6], [rx, 0.25, z0 + 0.45], madeiraEsc, { sombra: false });
  // e outro na parede sul, atrás do espelho d'água (o mesmo material: os dois viram uma malha só)
  plano(raiz, [maxX - recepcao - 4, HR - 2], [rx, HR / 2, z1 - T / 2 - 0.03], jardimRecepcao, [0, Math.PI, 0]);
  const arv = [[rx - 3.4, zp - 2.2], [rx + 3.4, zp - 2.2], [recepcao + 2.4, z1 - 3], [maxX - 2.4, z1 - 3]];
  if (p.fundos) arv.push([recepcao + 2.6, z0 + 3], [maxX - 2.6, z0 + 3]);
  arvores(raiz, arv, world);

  // espera: tapete redondo, dois sofás frente a frente, mesinha de centro e luminárias pendentes
  const assentos = [];
  const ze = zEntrada + 13.5;
  const tapete = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(0x8c7a64, { roughness: 1 }));
  tapete.rotation.x = -Math.PI / 2;
  tapete.scale.set(5, 4, 1);
  tapete.position.set(rx, 0.04, ze);
  raiz.add(tapete);
  sofa(raiz, 0x2f4858, [[rx, ze + 2.6, 0], [rx, ze - 2.6, Math.PI]]);
  world.addBox({ min: [rx - 1.6, 0, ze + 2.05], max: [rx + 1.6, 0.8, ze + 3.15], data: { type: 'sofa' } });
  world.addBox({ min: [rx - 1.6, 0, ze - 3.15], max: [rx + 1.6, 0.8, ze - 2.05], data: { type: 'sofa' } });
  lugaresDoSofa(rx, ze + 2.6, 0, (lx, lz) => assentos.push({ x: lx, z: lz, y: 0.8, yaw: 0, posto: null }));
  lugaresDoSofa(rx, ze - 2.6, Math.PI, (lx, lz) => assentos.push({ x: lx, z: lz, y: 0.8, yaw: Math.PI, posto: null }));
  const mesinha = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 32), madeira);
  mesinha.position.set(rx, 0.45, ze);
  raiz.add(mesinha);
  caixa(raiz, [0.2, 0.42, 0.2], [rx, 0.21, ze], latao, { sombra: false });
  world.addBox({ min: [rx - 0.9, 0, ze - 0.9], max: [rx + 0.9, 0.5, ze + 0.9] });
  // pendentes: globos de luz em alturas diferentes (um material para os cinco)
  const globos = [[rx - 1.6, 6.4, ze - 0.8], [rx + 0.2, 7.2, ze + 0.6], [rx + 1.8, 6.0, ze - 0.2], [rx - 0.6, 7.8, ze + 1.4], [rx + 1.0, 6.8, ze - 1.6]];
  const luzGlobo = brilho(0xffe7b8);
  for (const [x, y, z] of globos) {
    const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, HR - y, 4), grafite);
    fio.position.set(x, (HR + y) / 2, z);
    raiz.add(fio);
    const globo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), luzGlobo);
    globo.position.set(x, y, z);
    raiz.add(globo);
  }

  // espelho d'água com borda de pedra, entre a espera e a parede sul
  const agua = texAgua();
  agua.repeat.set(3, 1.5);
  const zl0 = ze + 4.6;
  const zl1 = z1 - 1.2;
  const lx0 = recepcao + 5;
  const lx1 = maxX - 5;
  caixa(raiz, [lx1 - lx0 + 0.8, 0.45, zl1 - zl0 + 0.8], [(lx0 + lx1) / 2, 0.22, (zl0 + zl1) / 2], mat(0x9a9285, { roughness: 0.9 }));
  plano(raiz, [lx1 - lx0, zl1 - zl0], [(lx0 + lx1) / 2, 0.46, (zl0 + zl1) / 2], new THREE.MeshBasicMaterial({ map: agua, toneMapped: false, color: 0xcfe9ea }), [-Math.PI / 2, 0, 0]);
  world.addBox({ min: [lx0 - 0.4, 0, zl0 - 0.4], max: [lx1 + 0.4, 0.46, zl1 + 0.4] });

  // fundos do átrio (só com a fileira dos fundos): lounge com poltronas em volta de uma mesa
  if (p.fundos) {
    const zf = (z0 + zp) / 2 - 1;
    const t2 = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(0x5b6b73, { roughness: 1 }));
    t2.rotation.x = -Math.PI / 2;
    t2.scale.set(4.6, 3.6, 1);
    t2.position.set(rx, 0.04, zf);
    raiz.add(t2);
    sofa(raiz, 0x8c5a3c, [[rx, zf - 2.4, Math.PI], [rx, zf + 2.4, 0]]);
    world.addBox({ min: [rx - 1.6, 0, zf - 2.95], max: [rx + 1.6, 0.8, zf - 1.85], data: { type: 'sofa' } });
    world.addBox({ min: [rx - 1.6, 0, zf + 1.85], max: [rx + 1.6, 0.8, zf + 2.95], data: { type: 'sofa' } });
    lugaresDoSofa(rx, zf - 2.4, Math.PI, (lx, lz) => assentos.push({ x: lx, z: lz, y: 0.8, yaw: Math.PI, posto: null }));
    lugaresDoSofa(rx, zf + 2.4, 0, (lx, lz) => assentos.push({ x: lx, z: lz, y: 0.8, yaw: 0, posto: null }));
    const m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 32), madeira);
    m2.position.set(rx, 0.45, zf);
    raiz.add(m2);
    world.addBox({ min: [rx - 0.8, 0, zf - 0.8], max: [rx + 0.8, 0.5, zf + 0.8] });
  }

  // totens com as salas de cada corredor, na entrada dele
  // caminho até o corredor dos fundos: passadeira no mármore, rente à parede, do eixo da entrada
  // até o portal, e placas em cima dos dois portais
  if (p.fundos) {
    const zA = (f0 + f1) / 2 - 1.2;
    const zB = zEntrada - 4;
    const cam = passadeira.clone();
    cam.needsUpdate = true;
    cam.repeat.set((zB - zA) / 3, 1);
    plano(raiz, [zB - zA, 2.4], [recepcao + 2.3, 0.032, (zA + zB) / 2], mat(0xffffff, { map: cam, roughness: 1 }), [-Math.PI / 2, 0, Math.PI / 2]);
  }
  const placasDosPortais = [[zEntrada, 'Salas', 'corredor principal']];
  if (p.fundos) placasDosPortais.push([(f0 + f1) / 2, 'Mais salas', 'corredor dos fundos']);
  for (const [z, t, sub] of placasDosPortais) {
    const pl = placa(t, '#c9a14a', { sub });
    plano(raiz, [4.4, 1.1], [recepcao + T / 2 + 0.04, H + 1.4, z], new THREE.MeshBasicMaterial({ map: pl.tex, toneMapped: false }), [0, Math.PI / 2, 0]);
  }
  const totens = [[c1 + 3.2, 'Corredor principal', p.salas.filter((s) => s.lado !== 'fundos')]];
  if (p.fundos) totens.push([f0 - 3.2, 'Corredor dos fundos', p.salas.filter((s) => s.lado === 'fundos')]);
  for (const [z, titulo, lista] of totens) {
    if (!lista.length) continue;
    const t = totem(titulo, lista);
    caixa(raiz, [0.3, 3.0, 1.6], [recepcao + 1.6, 1.5, z], grafite);
    plano(raiz, [1.4, 2.8], [recepcao + 1.76, 1.6, z], new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }), [0, Math.PI / 2, 0]);
    world.addBox({ min: [recepcao + 1.4, 0, z - 0.8], max: [recepcao + 1.8, 3, z + 0.8] });
  }

  // luzes do átrio
  for (const [z, i] of [[zEntrada, 60], [dc.z, 45], [ze, 45]].concat(p.fundos ? [[(z0 + zp) / 2, 40]] : [])) {
    const l = new THREE.PointLight(0xfff4e6, i, 38, 1.3);
    l.position.set(rx, HR - 1.2, z);
    raiz.add(l);
  }

  // ---------------------------------------------------------------- salas
  // Cada sala e cada lounge é uma célula, com o próprio grupo (os dois lounges têm id 'lounge':
  // cada um é uma célula)
  const telas = [];
  const telaoes = [];
  const postos = [];
  const salas = {};
  const celulas = [];
  const novaCelula = (s) => {
    const m = marco(world, raiz, s, telas, telaoes, postos, assentos, celulas.length, apagado);
    celulas.push({ id: s.id, lado: s.lado, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, grupo: m.g });
    return m;
  };
  for (const s of p.salas) salas[s.id] = SALAS[s.id](novaCelula(s));
  for (const l of p.lounges) lounge(novaCelula(l));
  telas.push(...telasRecepcao);
  // o balcão da recepção: o último posto (sem célula, como as telas da recepção: sempre à vista)
  postos.push(postoRecepcao);
  assentos.push({ x: dc.x, z: zCad, y: 0.62, yaw: Math.PI, posto: idPostoRecepcao });
  // A luz do teto de cada sala vai para a raiz (o attach mantém onde ela está). O World esconde a
  // sala que não dá para ver, e luz dentro de grupo escondido sai das candidatas: a contagem
  // cairia abaixo do teto de luzes, tudo recompilaria e as luzes piscariam ao cruzar as portas.
  for (const c of celulas) {
    const luzes = [];
    c.grupo.traverse((o) => { if (o.isPointLight) luzes.push(o); });
    for (const l of luzes) raiz.attach(l);
  }
  // as peças soltas viram poucas malhas: o miúdo de cada sala no grupo dela (continua sumindo junto
  // com a sala) e a casca na raiz, sempre à vista
  fixas.add(nomeEmpresa).add(logoFundo).add(logoPlano);
  for (const c of celulas) juntarSoltas(c.grupo, fixas);
  juntarSoltas(raiz, fixas);
  // teclado e mouse em cada posto (o do seu posto se mexe junto com você: perifericos.js)
  const perifericos = criarPerifericos(raiz, postos);
  let antes = 0;

  return {
    // [{ pos, rotY, w, h, rotulo, painel? }]; as das salas também com embutida e celula
    telas,
    telaoes, // [{ pos, rotY, w, h, embutida, celula }]
    postos, // [{ id: 'ti-0', celula, monitores: [3 × { pos, rotY, w, h }], mesa }], na ordem da planta (o 'recepcao-0' sem celula)
    assentos, // [{ x, z, y, yaw, posto }]: onde dá para sentar com C
    // [{ id, lado, x0, x1, z0, z1, grupo }]: salas e lounges, na ordem dos índices `celula` acima
    celulas,
    entrada: { pos: [55, 0, zEntrada], yaw: Math.PI / 2 }, // olhando para o corredor
    limites: { minX, maxX, minZ: z0, maxZ: z1, altura: H, alturaRecepcao: HR },
    // a fachada é de vidro: olhando para ela, o lado de fora aparece
    porta: new THREE.Box3(new THREE.Vector3(maxX - 1, 0, z0), new THREE.Vector3(maxX + 1, HR, z1)),
    // vãos entre a recepção e cada corredor: da recepção (ou de fora do prédio), só por eles se vê
    // dentro das salas
    portais: {
      principal: new THREE.Box3(new THREE.Vector3(recepcao - 0.3, 0, c0), new THREE.Vector3(recepcao + 0.3, H, c1)),
      fundos: p.fundos ? new THREE.Box3(new THREE.Vector3(recepcao - 0.3, 0, f0), new THREE.Vector3(recepcao + 0.3, H, f1)) : null,
    },
    placar: (dados) => salas.comercial?.placar(dados),
    perifericos,
    setLogo: mostrarLogo,
    tocarSino: () => salas.comercial?.tocarSino(),
    // painel da sala de Gestão: [{ nome, status, texto }]
    equipe: (pessoas, rodape) => salas.gestao?.equipe(pessoas, rodape),
    status(info) {
      salas.ti?.status({ ...info, pessoas: info.porSala?.ti ?? 0, telas: info.telasPorSala?.ti ?? 0 });
      salas.telemarketing?.central.redesenhar([
        ['Operadores na sala', `${info.porSala?.telemarketing ?? 0}`, '#22c55e'],
        ['Telas no ar', `${info.telasPorSala?.telemarketing ?? 0} de 4`, '#22c55e'],
        ['Pessoas no escritório', `${info.pessoas ?? 0}`, '#38bdf8'],
        ['Sistema de chamadas', 'no ar', '#22c55e'],
      ], `${info.empresa ? `${info.empresa} · ` : ''}${info.hora || ''}`);
    },
    update(t) {
      agua.offset.set(t * 0.012, t * 0.007);
      for (const s of Object.values(salas)) s.update?.(t);
      perifericos.update(Math.min(0.1, Math.max(0, t - antes)));
      antes = t;
    },
  };
}
