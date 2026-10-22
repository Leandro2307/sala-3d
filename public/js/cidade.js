// O 3D da cidade do mapa (cidade-dados.js), no tema dele (temas3d.js): a praça na porta do prédio,
// com a peça do meio (farol, pinheirão ou pagode), canteiros, bancos e a beirada; as ruas, com o
// meio-fio por baixo e o calçamento por cima (onde duas se encontram, o calçamento de uma cobre o
// meio-fio da outra: o encontro fica limpo), as trilhas que fazem curva, o píer e a ponte; os
// postes do tema; as pracinhas e os pisos das áreas; os pórticos com o nome de cada área e o que tem
// lá; placas de direção em cada cruzamento, um quadro "como funciona" na entrada de cada área,
// totens com o mapa "você está aqui" e, no jardim, o caminho de torii.
// Chamado pelo World antes do autódromo e da natureza: as ruas entram em world.estradas (o
// guard-rail abre passagem, a natureza não planta em cima) e as árvores em fileira vão para a
// natureza, que as desenha junto com as outras.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PRACA, RUAS, PRACAS, PISOS, AGUA, AREAS, PORTICOS, PLACAS, QUADROS, MAPAS_AQUI, BOSQUES, MESAS_NOVO, TORIIS,
} from './cidade-dados.js';
import { desenharMapa } from './mapa.js';
import { PISTA, pontoEm } from './pista.js';
import {
  TEMA, textura, texturaRua, relevoRua, relevoFoto, texturaPiso, texturaPracaCentral, poste as posteDoTema, estruturaPortico, pecaDaPraca, ARVORE_DA_RUA,
} from './temas3d.js';

const FONTE = (px, peso = 800) => `${peso} ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;
// alturas dos pisos: cada um um pouco acima do outro, para não piscarem onde se cruzam
const Y_RUA = 0.05;
const Y_PRACA = 0.07;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const CIMA = new THREE.Vector3(0, 1, 0);

// várias geometrias numa malha só (um desenho)
export function fundir(geos, mat, { sombra = false, recebe = false } = {}) {
  const lista = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  // só junta o que todas têm (umas peças vêm com uv, outras sem; algumas com cor por vértice)
  const comuns = Object.keys(lista[0].attributes).filter((k) => lista.every((g) => g.attributes[k]));
  for (const g of lista) for (const k of Object.keys(g.attributes)) if (!comuns.includes(k)) g.deleteAttribute(k);
  const m = new THREE.Mesh(mergeGeometries(lista), mat);
  for (const g of geos) g.dispose();
  m.castShadow = sombra;
  m.receiveShadow = recebe;
  return m;
}

// geometria posta no lugar: (geo, x, y, z, giroY)
const no = (geo, x, y, z, giro = 0) => geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1)));

// Peças do mesmo material entram num lote e viram uma malha só no fim (fecharLotes): o ferro escuro
// (postes, pés de banco, hastes de placa), a madeira (bancos, toras, tábuas), o fundo escuro das
// placas, a neve (chapéus, montinhos), o vermelho (torii, pilares), a palha, a pedra e as peças com
// cor por vértice. Cada lote é um desenho a menos por peça.
export const novosLotes = () => ({ ferro: [], madeira: [], escuro: [], neve: [], vermelho: [], palha: [], pedra: [], cores: [] });
const COR_MADEIRA = { tropical: 0xa0703f, neve: 0x6b4a33, outono: 0x5a3a2a }[TEMA.id] ?? 0x9a6a3e;
const COR_PEDRA = { tropical: 0xcfc3a8, neve: 0x8a8f9b, outono: 0x9b958a }[TEMA.id] ?? 0xcfc6b6;
export function fecharLotes(g, L) {
  const lote = (lista, mat, opcoes) => { if (lista.length) g.add(fundir(lista, mat, opcoes)); };
  lote(L.ferro, new THREE.MeshStandardMaterial({ color: 0x262b35, roughness: 0.5, metalness: 0.4 }), { sombra: true });
  lote(L.madeira, new THREE.MeshStandardMaterial({ color: COR_MADEIRA, roughness: 0.8 }), { sombra: true, recebe: true });
  lote(L.escuro, new THREE.MeshStandardMaterial({ color: new THREE.Color(TEMA.placa.fundo).multiplyScalar(0.7), roughness: 0.65 }), { sombra: true });
  lote(L.neve, new THREE.MeshStandardMaterial({ color: 0xf7faff, roughness: 0.9 }), { recebe: true });
  lote(L.vermelho, new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.55 }), { sombra: true, recebe: true });
  lote(L.palha, new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 1, flatShading: true }), { sombra: true });
  lote(L.pedra, new THREE.MeshStandardMaterial({ color: COR_PEDRA, roughness: 0.85 }), { sombra: true, recebe: true });
  lote(L.cores, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), { sombra: true, recebe: true });
  for (const k of Object.keys(L)) L[k] = [];
}

function pintar(geo, cor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(cor);
  const n = g.attributes.position.count;
  const cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cores.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// pracinha de pedra com anéis na cor da área
export function texturaRedonda(cor) {
  const base = { tropical: '#efe3c4', neve: '#eef3f9', outono: '#d9cfb6' }[TEMA.id] || '#d8d1c3';
  return textura(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = base;
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

// ------------------------------------------------------------------ ruas
// Os pontos de cada rua: a trilha que faz curva vira uma curva suave (Catmull-Rom centrípeta, um
// ponto a cada ~2,5 m); a que vai até o autódromo ganha o último trecho até a beira da pista
// (depende do traçado do mapa).
function suavizar(pontos) {
  const v = pontos.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curva = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  const n = Math.max(4, Math.round(curva.getLength() / 2.5));
  return curva.getSpacedPoints(n).map((p) => [p.x, p.z]);
}
export function prepararRuas(ruas = RUAS) {
  const meia = PISTA.largura / 2;
  const pj = pontoEm(PISTA.largadaT - 0.012);
  const entrada = [pj.x + Math.cos(pj.angulo) * (meia - 1), pj.z - Math.sin(pj.angulo) * (meia - 1)];
  return ruas.map((r) => {
    let pontos = r.pontos.map((p) => [...p]);
    if (r.pista) pontos.push(entrada);
    if (r.curva) pontos = suavizar(pontos);
    return { ...r, pontos };
  });
}

// Uma fita no chão ao longo dos pontos (largura w, na altura y): u atravessa, v anda ao longo (uma
// repetição da textura a cada `passo` m). Nas curvas a fita usa a média das direções dos dois lados.
function fita(pontos, w, y, passo) {
  const pos = [];
  const uv = [];
  const idx = [];
  let v = 0;
  pontos.forEach(([x, z], i) => {
    const [ax, az] = pontos[Math.max(0, i - 1)];
    const [bx, bz] = pontos[Math.min(pontos.length - 1, i + 1)];
    const dx = bx - ax;
    const dz = bz - az;
    const c = Math.hypot(dx, dz) || 1;
    const nx = -dz / c;
    const nz = dx / c;
    if (i > 0) v += Math.hypot(x - pontos[i - 1][0], z - pontos[i - 1][1]);
    pos.push(x - (nx * w) / 2, y, z - (nz * w) / 2, x + (nx * w) / 2, y, z + (nz * w) / 2);
    uv.push(0, v / passo, 1, v / passo);
    if (i < pontos.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // a fita sai virada para baixo quando a ordem dos lados inverte: conserta pela normal
  if (geo.attributes.normal.getY(0) < 0) {
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    geo.computeVertexNormals();
  }
  return geo;
}

// Rua reta de vários trechos: um retângulo por trecho, esticado meia largura nas emendas (cobre a
// quina). Devolve as geometrias (o meio-fio e o calçamento usam a mesma, com larguras diferentes).
function trechos(pontos, w, y, passo) {
  const geos = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const [x0, z0] = pontos[i];
    const [x1, z1] = pontos[i + 1];
    const comp = Math.hypot(x1 - x0, z1 - z0);
    const giro = Math.atan2(x1 - x0, z1 - z0);
    const extra = i < pontos.length - 2 ? w / 2 : 0;
    const geo = new THREE.PlaneGeometry(w, comp + extra).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * ((comp + extra) / passo));
    const meio = (comp + extra) / 2;
    geos.push(no(geo, x0 + Math.sin(giro) * meio, y + i * 0.0004, z0 + Math.cos(giro) * meio, giro));
  }
  return geos;
}

// As ruas: primeiro todos os meios-fios, depois todos os calçamentos, um pouco acima: onde duas
// ruas se encontram, o calçamento de uma passa por cima do meio-fio da outra.
export function construirRuas(g, ruas, L) {
  const tex = texturaRua();
  // a foto do deque tem tábuas de ~1 m: três repetições na largura, para não esticar (nas texturas
  // simples não tem foto nem relevo: as tábuas desenhadas já são estreitas)
  const relevo = relevoRua();
  if (TEMA.rua.tipo === 'madeira' && relevo) {
    tex.repeat.x = 3;
    relevo.repeat.x = 3;
  }
  const mat = new THREE.MeshStandardMaterial({ map: tex, normalMap: relevo, roughness: 0.82 });
  const guia = new THREE.MeshStandardMaterial({ color: TEMA.rua.guia, roughness: 0.85 });
  const calcadas = [];
  const guias = [];
  const passo = TEMA.rua.tipo === 'madeira' ? 3 : 6;
  ruas.forEach((r, ri) => {
    if (r.tipo === 'pier') return construirPier(g, r, L);
    if (r.tipo === 'ponte') return construirPonte(g, r, L);
    const fazer = r.curva ? (w, y) => [fita(r.pontos, w, y, passo)] : (w, y) => trechos(r.pontos, w, y, passo);
    guias.push(...fazer(r.largura + 0.9, Y_RUA + ri * 0.0003));
    calcadas.push(...fazer(r.largura, Y_RUA + 0.014 + ri * 0.0006));
  });
  if (guias.length) g.add(fundir(guias, guia, { recebe: true }));
  if (calcadas.length) g.add(fundir(calcadas, mat, { recebe: true }));
}

// píer de tábuas sobre a lagoa: o deque um pouco acima da água, estacas e um corrimão baixo
function construirPier(g, r, L) {
  const [[x0, z0], [x1, z1]] = r.pontos;
  const comp = Math.hypot(x1 - x0, z1 - z0);
  const giro = Math.atan2(x1 - x0, z1 - z0);
  const tex = texturaRua();
  tex.repeat.set(1, comp / 3);
  const relevo = relevoRua();
  relevo?.repeat.copy(tex.repeat);
  const deque = new THREE.Mesh(new THREE.BoxGeometry(r.largura, 0.18, comp + 4), new THREE.MeshStandardMaterial({ map: tex, normalMap: relevo, roughness: 0.8 }));
  no(deque.geometry, (x0 + x1) / 2, 0.11, (z0 + z1) / 2, giro);
  deque.receiveShadow = true;
  deque.castShadow = true;
  g.add(deque);
  const dx = Math.sin(giro);
  const dz = Math.cos(giro);
  for (let d = 2; d <= comp + 2; d += 3) {
    for (const lado of [-1, 1]) {
      const px = x0 + dx * d + dz * lado * (r.largura / 2 + 0.1);
      const pz = z0 + dz * d - dx * lado * (r.largura / 2 + 0.1);
      L.madeira.push(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6).translate(px, 0.3, pz));
    }
  }
  for (const lado of [-1, 1]) {
    L.madeira.push(no(new THREE.BoxGeometry(0.1, 0.1, comp).translate(lado * (r.largura / 2 + 0.1), 1.0, 0), (x0 + x1) / 2, 0, (z0 + z1) / 2, giro));
  }
  // o deque largo na ponta, com um guarda-sol
  const [ex, ez] = [x1 - dx * 1, z1 - dz * 1];
  L.madeira.push(new THREE.BoxGeometry(8, 0.18, 8).translate(ex, 0.11, ez));
  L.madeira.push(new THREE.CylinderGeometry(0.06, 0.06, 3, 6).translate(ex, 1.5, ez));
  L.cores.push(pintar(new THREE.ConeGeometry(2.4, 0.9, 10).translate(ex, 3.2, ez), '#f97316'));
}

// ponte vermelha sobre o lago das carpas: o deque reto (dá para andar) e o corrimão em arco
function construirPonte(g, r, L) {
  const [[x0, z0], [x1, z1]] = r.pontos;
  const comp = Math.hypot(x1 - x0, z1 - z0);
  const giro = Math.atan2(x1 - x0, z1 - z0);
  const dx = Math.sin(giro);
  const dz = Math.cos(giro);
  L.madeira.push(no(new THREE.BoxGeometry(r.largura, 0.22, comp), (x0 + x1) / 2, 0.12, (z0 + z1) / 2, giro));
  const n = Math.round(comp / 2.2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const arco = Math.sin(t * Math.PI) * 0.9;
    for (const lado of [-1, 1]) {
      const px = x0 + dx * comp * t + dz * lado * (r.largura / 2);
      const pz = z0 + dz * comp * t - dx * lado * (r.largura / 2);
      L.vermelho.push(new THREE.BoxGeometry(0.16, 1.1 + arco, 0.16).translate(px, (1.1 + arco) / 2, pz));
      if (i < n) {
        const t2 = (i + 1) / n;
        const arco2 = Math.sin(t2 * Math.PI) * 0.9;
        const qx = x0 + dx * comp * t2 + dz * lado * (r.largura / 2);
        const qz = z0 + dz * comp * t2 - dx * lado * (r.largura / 2);
        const len = Math.hypot(qx - px, qz - pz, arco2 - arco);
        const corrimao = new THREE.BoxGeometry(0.14, 0.12, len);
        corrimao.lookAt(new THREE.Vector3(qx - px, arco2 - arco, qz - pz));
        L.vermelho.push(corrimao.translate((px + qx) / 2, 1.1 + (arco + arco2) / 2, (pz + qz) / 2));
      }
    }
  }
}

// ------------------------------------------------------------------ a praça do meio
// Onde as ruas entram na praça: o ângulo (no plano do chão, x = cos α, z = sin α) e a meia largura
// da rua. A beirada abre ali, e canteiros, bancos e postes ficam fora do caminho.
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

function construirPraca(g, world, decor, L, saidas, luzes) {
  const { x, z, r } = PRACA;
  // o desenho da praça e, por cima, o relevo das pedrinhas (uma repetição a cada 0,9 m)
  const pedras = relevoFoto('pedras');
  pedras?.repeat.setScalar((r * 2) / 0.9);
  const piso = new THREE.Mesh(new THREE.CircleGeometry(r, 128).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    map: texturaPracaCentral(r), normalMap: pedras, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.8,
  }));
  piso.position.set(x, Y_PRACA, z);
  piso.receiveShadow = true;
  g.add(piso);
  pecaDaPraca(g, L, world, x, z, decor);

  // canteiros em arco entre uma saída e a seguinte (o caminho do meio até cada rua fica livre): de
  // flores na praia, montes de neve na vila, musgo com pedras no jardim
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
  const terra = [];
  const borda = [];
  const flores = [];
  const coresFlor = {
    tropical: ['#f43f5e', '#fb923c', '#facc15', '#ec4899', '#ef4444'],
    outono: ['#dc2626', '#ea580c', '#b91c1c', '#f59e0b'],
  }[TEMA.id] || [];
  for (const [a0, comp] of arcos) {
    const arco = (r0, r1, h) => new THREE.RingGeometry(r0, r1, 24, 1, -(a0 + comp), comp).rotateX(-Math.PI / 2).translate(x, h, z);
    const parede = (rr) => new THREE.CylinderGeometry(rr, rr, 0.45, 32, 1, true, Math.PI / 2 - a0 - comp, comp).translate(x, 0.225 + Y_PRACA, z);
    if (TEMA.id === 'neve') {
      // monte de neve fofo no lugar do canteiro
      L.neve.push(new THREE.CylinderGeometry(15, 15.4, 0.9, 32, 1, false, Math.PI / 2 - a0 - comp, comp).translate(x, 0.45, z));
    } else {
      borda.push(parede(15), parede(12), arco(14.7, 15.2, 0.46 + Y_PRACA), arco(11.8, 12.3, 0.46 + Y_PRACA));
      terra.push(arco(12.2, 14.8, 0.4 + Y_PRACA));
      for (let i = 0; i < Math.round(comp * 45); i++) {
        const a = a0 + Math.random() * comp;
        const rr = 12.5 + Math.random() * 2;
        flores.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, cor: coresFlor[Math.floor(Math.random() * coresFlor.length)] });
      }
    }
  }
  if (borda.length) g.add(fundir(borda, new THREE.MeshStandardMaterial({ color: COR_PEDRA, roughness: 0.85, side: THREE.DoubleSide }), { recebe: true }));
  if (terra.length) g.add(fundir(terra, new THREE.MeshStandardMaterial({ color: TEMA.id === 'outono' ? 0x3f5a2a : 0x5b4632, roughness: 1 }), { recebe: true }));
  if (flores.length) plantarFlores(g, flores, 0.55 + Y_PRACA);

  // bancos de frente para o meio
  const bancos = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    if (naSaida(saidas, a, 21, 2)) continue;
    bancos.push({ x: x + Math.cos(a) * 21, z: z + Math.sin(a) * 21, giro: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  construirBancos(L, world, bancos);

  // a beirada, aberta onde as ruas chegam: cerca viva (praia), muro de neve (vila), muro de pedra
  // baixo (jardim)
  const passos = Math.round((Math.PI * 2 * r) / 3.3);
  const beirada = [];
  for (let i = 0; i < passos; i++) {
    const a = (i / passos) * Math.PI * 2;
    if (naSaida(saidas, a, r, 3)) continue;
    const ax = x + Math.cos(a) * (r - 0.4);
    const az = z + Math.sin(a) * (r - 0.4);
    const comp = ((Math.PI * 2 * (r - 0.4)) / passos) * 1.08;
    const giro = Math.atan2(-Math.sin(a), Math.cos(a));
    const alt = TEMA.id === 'outono' ? 0.7 : 1.1;
    beirada.push(no(new THREE.BoxGeometry(1.3, alt, comp), ax, alt / 2, az, giro));
    const hx = Math.abs(Math.cos(giro)) * 0.65 + Math.abs(Math.sin(giro)) * comp / 2;
    const hz = Math.abs(Math.sin(giro)) * 0.65 + Math.abs(Math.cos(giro)) * comp / 2;
    world.addBox({ min: [ax - hx, 0, az - hz], max: [ax + hx, alt, az + hz] });
  }
  const corBeirada = { tropical: 0x3f8a3a, neve: 0xf7faff, outono: 0x8c8378 }[TEMA.id];
  g.add(fundir(beirada, new THREE.MeshStandardMaterial({ color: corBeirada, roughness: 0.95 }), { sombra: true, recebe: true }));

  // postes em volta, na beirada de dentro
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    if (naSaida(saidas, a, r - 3, 1)) continue;
    posteDoTema(L, luzes, x + Math.cos(a) * (r - 3), z + Math.sin(a) * (r - 3));
  }
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
    if (TEMA.id === 'neve') L.neve.push(no(new THREE.BoxGeometry(2.5, 0.08, 0.5), b.x, 0.59, b.z, b.giro));
    world.addBox({ min: [b.x - 0.5, 0, b.z - 0.5], max: [b.x + 0.5, 0.55, b.z + 0.5], data: { type: 'sofa' } });
  }
}

// ------------------------------------------------------------------ pracinhas e pisos das áreas
function construirPracinhas(g, world, L) {
  // os pisos retangulares (a praça dos jogos), com uma beirada de pedra
  for (const P of PISOS) {
    const tex = texturaPiso();
    const metros = tex.userData.metros ?? 8;
    tex.repeat.set((P.x1 - P.x0) / metros, (P.z1 - P.z0) / metros);
    const relevo = tex.userData.relevo ? relevoFoto(tex.userData.relevo) : null;
    if (relevo) {
      relevo.repeat.copy(tex.repeat);
      relevo.rotation = tex.rotation;
    }
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, normalMap: relevo, roughness: 0.85 }));
    piso.position.set((P.x0 + P.x1) / 2, 0.035, (P.z0 + P.z1) / 2);
    piso.receiveShadow = true;
    g.add(piso);
    const cx = (P.x0 + P.x1) / 2;
    const cz = (P.z0 + P.z1) / 2;
    for (const [w, d, px, pz] of [[P.x1 - P.x0 + 0.6, 0.3, cx, P.z0], [P.x1 - P.x0 + 0.6, 0.3, cx, P.z1], [0.3, P.z1 - P.z0, P.x0, cz], [0.3, P.z1 - P.z0, P.x1, cz]]) {
      L.pedra.push(new THREE.BoxGeometry(w, 0.14, d).translate(px, 0.07, pz));
    }
  }
  // as pracinhas redondas (a da aventura), com pilares de luz na cor dos portais
  const luzes = [];
  for (const A of PRACAS) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(A.r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texturaRedonda(A.cor), roughness: 0.88 }));
    m.position.set(A.x, Y_PRACA, A.z);
    m.receiveShadow = true;
    g.add(m);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const px = A.x + Math.cos(a) * (A.r - 1);
      const pz = A.z + Math.sin(a) * (A.r - 1);
      // a rua chega por algum lado: o pilar não fica no caminho dela
      if (RUAS_PRONTAS.some((r) => pertoDe(r, px, pz, 1.2))) continue;
      L.pedra.push(new THREE.BoxGeometry(0.6, 2.6, 0.6).translate(px, 1.3, pz));
      luzes.push(pintar(new THREE.OctahedronGeometry(0.42, 0).translate(px, 3.05, pz), k % 2 ? A.cor : '#22d3ee'));
      world.addBox({ min: [px - 0.35, 0, pz - 0.35], max: [px + 0.35, 2.6, pz + 0.35] });
    }
  }
  if (luzes.length) g.add(fundir(luzes, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
}

// ------------------------------------------------------------------ postes de luz
// Postes do tema alternando os lados das ruas, longe das praças (que têm os delas). Sem luz de
// verdade: só a lanterna brilha (muitas luzes pesariam no shader).
export function construirPostes(ruas, L, luzes, evitar = []) {
  const naPraca = (x, z, folga) => Math.hypot(x - PRACA.x, z - PRACA.z) < PRACA.r + folga
    || evitar.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + folga);
  const passo = TEMA.poste === 'lanterna' ? 14 : 18;
  for (const r of ruas) {
    if (r.tipo === 'pier' || r.tipo === 'ponte') continue;
    let d0 = 8;
    let k = 0;
    for (let i = 0; i < r.pontos.length - 1; i++) {
      const [x0, z0] = r.pontos[i];
      const [x1, z1] = r.pontos[i + 1];
      const comp = Math.hypot(x1 - x0, z1 - z0);
      if (comp < 1e-3) continue;
      const dx = (x1 - x0) / comp;
      const dz = (z1 - z0) / comp;
      let d = d0;
      for (; d < comp; d += passo, k++) {
        const lado = k % 2 ? 1 : -1;
        const px = x0 + dx * d - dz * (r.largura / 2 + 1) * lado;
        const pz = z0 + dz * d + dx * (r.largura / 2 + 1) * lado;
        if (naPraca(px, pz, 2) || ruas.some((o) => o !== r && pertoDe(o, px, pz, 2))) continue;
        posteDoTema(L, luzes, px, pz, Math.atan2(dx, dz));
      }
      // o que sobrou deste trecho conta no próximo (nas trilhas os trechos são curtos)
      d0 = d - comp;
    }
  }
}

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
// Pórtico por cima da rua, no estilo do tema, com o nome da área e, embaixo, o que tem lá (AREAS).
// p: { area, x, z, giro, vao } (ou nome/sub/cor no lugar da área)
export function construirPorticos(g, world, L, lista = PORTICOS) {
  for (const p of lista) {
    const a = { ...AREAS[p.area], ...p };
    const lugar = new THREE.Matrix4().compose(_p.set(p.x, 0, p.z), _q.setFromAxisAngle(CIMA, p.giro), _s.set(1, 1, 1));
    const e = estruturaPortico(L, lugar, p.vao);
    for (const lx of e.pilares) {
      const c = new THREE.Vector3(lx, 0, 0).applyMatrix4(lugar);
      world.addBox({ min: [c.x - 0.6, 0, c.z - 0.6], max: [c.x + 0.6, e.altura, c.z + 0.6] });
    }
    // a placa nos dois lados (numa malha só), com o fundo entre as duas faces
    const largPlaca = Math.min(p.vao + 0.8, 14);
    const altPlaca = largPlaca * (256 / 1024);
    const faces = [0, Math.PI].map((f) => new THREE.PlaneGeometry(largPlaca, altPlaca).translate(0, 0, 0.08).rotateY(f).translate(0, e.yPlaca, 0).applyMatrix4(lugar));
    g.add(fundir(faces, new THREE.MeshBasicMaterial({ map: texturaPortico(a.nome, a.sub, a.cor), toneMapped: false })));
    L.escuro.push(new THREE.BoxGeometry(largPlaca + 0.3, altPlaca + 0.3, 0.12).translate(0, e.yPlaca, 0).applyMatrix4(lugar));
  }
}

// o caminho de torii (jardim): um portal vermelho a cada `passo` m ao longo de uma trilha
function construirToriis(world, L, ruas) {
  if (!TORIIS || TEMA.portico !== 'torii') return;
  const rua = ruas.find((r) => r.nome === TORIIS.rua);
  if (!rua) return;
  let falta = 0;
  for (let i = 0; i < rua.pontos.length - 1; i++) {
    const [x0, z0] = rua.pontos[i];
    const [x1, z1] = rua.pontos[i + 1];
    const comp = Math.hypot(x1 - x0, z1 - z0);
    let d = falta;
    for (; d < comp; d += TORIIS.passo) {
      const t = d / comp;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (z < TORIIS.z0 || z > TORIIS.z1) continue;
      // os pilares atravessam a trilha (eixo x local = perpendicular à direção dela)
      const giro = Math.atan2(x1 - x0, z1 - z0);
      const lugar = new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromAxisAngle(CIMA, giro), _s.set(0.7, 0.7, 0.7));
      const e = estruturaPortico(L, lugar, rua.largura + 1.4);
      for (const lx of e.pilares) {
        const c = new THREE.Vector3(lx, 0, 0).applyMatrix4(lugar);
        world.addBox({ min: [c.x - 0.35, 0, c.z - 0.35], max: [c.x + 0.35, e.altura * 0.7, c.z + 0.35] });
      }
    }
    falta = d - comp;
  }
}

// ------------------------------------------------------------------ placas e mapa
// o nome grande e, embaixo, o que tem na área, com a faixa da cor dela em cima e embaixo
function texturaPortico(nome, sub, cor) {
  return textura(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = TEMA.placa.fundo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    caber(ctx, nome.toUpperCase(), w - 70, 104);
    ctx.fillText(nome.toUpperCase(), w / 2, sub ? 100 : h / 2);
    if (!sub) return;
    ctx.fillStyle = '#cbd5e1';
    caber(ctx, sub, w - 70, 42, 600);
    ctx.fillText(sub, w / 2, 192);
  });
}

// diminui a fonte até o texto caber na largura
function caber(ctx, texto, larg, tam, peso = 800) {
  ctx.font = FONTE(tam, peso);
  while (ctx.measureText(texto).width > larg && tam > 16) ctx.font = FONTE((tam -= 2), peso);
  return tam;
}

// ------------------------------------------------------------------ placas de direção
// A seta desenhada (não um caractere: fica igual em todo aparelho), virada para a direção dela
const GIRO_SETA = { '↑': 0, '↗': 45, '→': 90, '↘': 135, '↓': 180, '↙': 225, '←': 270, '↖': 315 };
function desenharSeta(ctx, cx, cy, s, seta, cor) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((GIRO_SETA[seta] ?? 0) * Math.PI) / 180);
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.9, -s * 0.05);
  ctx.lineTo(s * 0.32, -s * 0.05);
  ctx.lineTo(s * 0.32, s);
  ctx.lineTo(-s * 0.32, s);
  ctx.lineTo(-s * 0.32, -s * 0.05);
  ctx.lineTo(-s * 0.9, -s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// uma linha da placa: [seta, id da área (ou { nome, sub, cor }), sub no lugar do da área]
const destino = ([seta, alvo, sub]) => {
  const a = typeof alvo === 'string' ? AREAS[alvo] : alvo;
  return { seta, nome: a.nome, sub: sub ?? a.sub, cor: a.cor };
};
const LW = 1024;
const LH = 168;
const VAO = 16;
function texturaPlacas(linhas) {
  return textura(LW, linhas.length * (LH + VAO) - VAO, (ctx) => {
    linhas.map(destino).forEach(({ seta, nome, sub, cor }, i) => {
      const y = i * (LH + VAO);
      ctx.fillStyle = TEMA.placa.fundo;
      roundRect(ctx, 0, y, LW, LH, 18);
      ctx.fill();
      // o quadrado da cor da área com a seta
      ctx.fillStyle = cor;
      roundRect(ctx, 10, y + 10, LH - 20, LH - 20, 14);
      ctx.fill();
      desenharSeta(ctx, LH / 2, y + LH / 2, 50, seta, '#0f172a');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      caber(ctx, nome, LW - LH - 40, 66);
      ctx.fillText(nome, LH + 14, y + 58);
      ctx.fillStyle = '#cbd5e1';
      caber(ctx, sub, LW - LH - 40, 34, 600);
      ctx.fillText(sub, LH + 14, y + 122);
    });
  });
}

// Poste com uma placa por destino: a frente para quem vem pelo lado para onde o giro aponta e o
// verso (outras placas, ou só o fundo escuro) para quem vem do outro lado
export function placaDeSaida(g, L, x, z, giro, frente, verso = null) {
  const w = 3.4;
  const altura = (n) => (w * (n * (LH + VAO) - VAO)) / LW;
  const h = Math.max(altura(frente.length), verso ? altura(verso.length) : 0);
  const topo = 2.1 + h;
  const onde = new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1));
  const face = (linhas, lado) => {
    const hh = altura(linhas.length);
    const geo = new THREE.PlaneGeometry(w, hh).translate(0, topo - hh / 2, 0.07);
    if (lado) geo.rotateY(Math.PI);
    g.add(new THREE.Mesh(geo.applyMatrix4(onde), new THREE.MeshBasicMaterial({ map: texturaPlacas(linhas), toneMapped: false, transparent: true })));
  };
  face(frente, 0);
  if (verso) face(verso, 1);
  // o fundo: uma chapa entre as faces (sem verso, ela é o que se vê por trás)
  L.escuro.push(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.1).translate(0, topo - h / 2, 0).applyMatrix4(onde));
  L.ferro.push(new THREE.CylinderGeometry(0.1, 0.13, topo + 0.2, 8).translate(0, (topo + 0.2) / 2, 0).applyMatrix4(onde));
}

// ------------------------------------------------------------------ quadros "como funciona"
// Um quadro em dois pés na entrada da área: o nome na faixa da cor dela e, embaixo, como se joga
export function quadroInfo(g, L, world, { area, x, z, giro, linhas, nome, sub, cor }) {
  const a = { ...AREAS[area], ...(nome ? { nome } : {}), ...(sub ? { sub } : {}), ...(cor ? { cor } : {}) };
  const W = 1024;
  const H = 300 + linhas.length * 92;
  const tex = textura(W, H, (ctx) => {
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, 0, 0, W, H, 26);
    ctx.fill();
    ctx.fillStyle = a.cor;
    roundRect(ctx, 0, 0, W, 210, 26);
    ctx.fill();
    ctx.fillRect(0, 180, W, 30);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    caber(ctx, a.nome, W - 90, 84);
    ctx.fillText(a.nome, 46, 82);
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    caber(ctx, a.sub, W - 90, 38, 700);
    ctx.fillText(a.sub, 46, 160);
    ctx.fillStyle = '#64748b';
    ctx.font = FONTE(30, 800);
    ctx.fillText('COMO FUNCIONA', 46, 258);
    linhas.forEach((t, i) => {
      const y = 330 + i * 92;
      ctx.fillStyle = a.cor;
      ctx.beginPath();
      ctx.arc(62, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      caber(ctx, t, W - 140, 44, 700);
      ctx.fillText(t, 96, y);
    });
  });
  const w = 3.2;
  const h = (w * H) / W;
  const base = 0.9;
  const onde = new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, base + h / 2, 0.07).applyMatrix4(onde), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })));
  L.escuro.push(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.1).translate(0, base + h / 2, 0).applyMatrix4(onde));
  for (const lx of [-w / 2 + 0.35, w / 2 - 0.35]) L.ferro.push(new THREE.BoxGeometry(0.14, base + 0.1, 0.14).translate(lx, (base + 0.1) / 2, 0).applyMatrix4(onde));
  const hx = Math.abs(Math.cos(giro)) * (w / 2) + 0.2;
  const hz = Math.abs(Math.sin(giro)) * (w / 2) + 0.2;
  world.addBox({ min: [x - hx, 0, z - hz], max: [x + hx, base + h, z + hz] });
}

// ------------------------------------------------------------------ mapa "você está aqui"
// O mapa num totem (mapa.js), virado para o lado que a pessoa olha quando lê: o que fica à frente
// dela no mundo fica para cima no mapa
export function totemMapa(g, L, world, { x, z, giro }) {
  const W = 1024;
  const H = 1024;
  // quem lê olha para o lado oposto à frente do totem: (-sen giro, -cos giro)
  const olha = [-Math.sin(giro), -Math.cos(giro)];
  const tex = textura(W, H, (ctx) => {
    desenharMapa(ctx, W, H - 90, { frente: olha, aqui: { x, z }, margem: 30 });
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, H - 90, W, 90);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(52, H - 45, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(40);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Você está aqui', 82, H - 45);
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONTE(28, 600);
    ctx.textAlign = 'right';
    ctx.fillText('Mapa na tela: botão do mapa ou L', W - 30, H - 45);
  });
  const w = 4.6;
  const h = w * (H / W);
  const base = 0.8;
  const onde = new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromAxisAngle(CIMA, giro), _s.set(1, 1, 1));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, base + h / 2, 0.08).applyMatrix4(onde), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
  L.escuro.push(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.14).translate(0, base + h / 2, 0).applyMatrix4(onde));
  for (const lx of [-w / 2 + 0.5, w / 2 - 0.5]) L.escuro.push(new THREE.BoxGeometry(0.25, base, 0.25).translate(lx, base / 2, 0).applyMatrix4(onde));
  const hx = Math.abs(Math.cos(giro)) * (w / 2 + 0.2) + 0.3;
  const hz = Math.abs(Math.sin(giro)) * (w / 2 + 0.2) + 0.3;
  world.addBox({ min: [x - hx, 0, z - hz], max: [x + hx, base + h + 0.2, z + hz] });
}


// ------------------------------------------------------------------ árvores em fileira
// dos dois lados das ruas (não das trilhas curtas), longe das esquinas, das praças e da pista (a
// natureza desenha, com a árvore da rua do tema)
let RUAS_PRONTAS = [];
function arvoresEmFileira(ruas, ocupado) {
  const arvores = [];
  const longe = (x, z) => Math.hypot(x - PRACA.x, z - PRACA.z) > PRACA.r + 4
    && !ocupado.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)
    && !PISOS.some((P) => x > P.x0 - 3 && x < P.x1 + 3 && z > P.z0 - 3 && z < P.z1 + 3)
    && !PRACAS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 6)
    && !AGUA.some((a) => Math.hypot(x - a.x, z - a.z) < a.r * 1.3 + 4)
    && !PORTICOS.some((p) => Math.hypot(x - p.x, z - p.z) < 9)
    && !PLACAS.some((p) => Math.hypot(x - p.x, z - p.z) < 4)
    && !QUADROS.some((p) => Math.hypot(x - p.x, z - p.z) < 4);
  for (const r of ruas) {
    if (r.tipo || r.largura < 8) continue;
    for (let i = 0; i < r.pontos.length - 1; i++) {
      const [x0, z0] = r.pontos[i];
      const [x1, z1] = r.pontos[i + 1];
      const comp = Math.hypot(x1 - x0, z1 - z0);
      if (comp < 20) continue; // o trechinho até a pista
      const dx = (x1 - x0) / comp;
      const dz = (z1 - z0) / comp;
      const afast = r.largura / 2 + 3.5;
      for (let d = 7; d < comp - 5; d += TEMA.id === 'tropical' ? 11 : 13) {
        for (const lado of [-1, 1]) {
          const x = x0 + dx * d - dz * afast * lado;
          const z = z0 + dz * d + dx * afast * lado;
          if (!longe(x, z) || ruas.some((o) => pertoDe(o, x, z, 3))) continue;
          arvores.push({ x, z, tipo: ARVORE_DA_RUA });
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
  const luzes = [];
  const ruas = prepararRuas();
  RUAS_PRONTAS = ruas;
  const saidas = saidasDaPraca(ruas);
  construirRuas(g, ruas, L);
  construirPraca(g, world, decor, L, saidas, luzes);
  construirPracinhas(g, world, L);
  construirPostes(ruas, L, luzes, [...PRACAS.map((c) => ({ ...c, r: c.r + 1 }))]);
  construirPorticos(g, world, L);
  construirToriis(world, L, ruas);
  for (const p of PLACAS) placaDeSaida(g, L, p.x, p.z, p.giro, p.frente, p.verso);
  for (const q of QUADROS) quadroInfo(g, L, world, q);
  for (const m of MAPAS_AQUI) totemMapa(g, L, world, m);
  if (luzes.length) g.add(malhaLanternas(luzes));
  fecharLotes(g, L);

  for (const rua of ruas) world.estradas.push({ pontos: rua.pontos, largura: rua.largura });
  const { x, z, r } = PRACA;
  world.reservas.push(
    { x, z, r: r + 4 },
    ...PRACAS.map((c) => ({ x: c.x, z: c.z, r: c.r + 4 })),
    ...PISOS.map((P) => ({ x: (P.x0 + P.x1) / 2, z: (P.z0 + P.z1) / 2, r: Math.hypot(P.x1 - P.x0, P.z1 - P.z0) / 2 + 3 })),
  );
  return {
    grupo: g,
    // para a natureza: a água no lugar certo, bosques só nas áreas de bosque e as fileiras das ruas
    natureza: { agua: AGUA, bosques: BOSQUES, fileiras: arvoresEmFileira(ruas, world.reservas) },
    mesas: MESAS_NOVO,
  };
}

// as luzes acesas (lanternas, chamas), todas numa malha só, na cor do tema
export const malhaLanternas = (lanternas) => fundir(lanternas, new THREE.MeshBasicMaterial({
  color: { tropical: 0xffb347, neve: 0xffe2a8, outono: 0xffc87a }[TEMA.id] ?? 0xfff1c9, toneMapped: false,
}));
