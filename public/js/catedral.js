// A catedral gótica (modelo de "patrix" no Sketchfab, feito no Minecraft; licença liberada pelo
// autor): o ponto de encontro de todos os mapas, com o interior aberto. Os blocos vêm de
// public/models/catedral.bin (scripts/preparar-catedral.js); a malha e a colisão saem de
// catedral-malha.js; as texturas são desenhadas aqui, no tema de pedra.
//
// A colisão tem dezenas de milhares de caixas: elas ficam numa grade e só as que estão perto da
// câmera entram em world.colliders (o jogador as testa uma a uma todo quadro).
import * as THREE from 'three';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import { lerCatedral, montarCatedral, MAT } from './catedral-malha.js';
import { CATEDRAL } from './catedral-dados.js';
import { Collider } from './world.js';

const TEX_BLOCOS = 4; // cada textura cobre 4 x 4 blocos
const PX = 64; // pixels por bloco

// ------------------------------------------------------------------ texturas
function sorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tela(desenhar, semente = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = PX * TEX_BLOCOS;
  const ctx = c.getContext('2d');
  desenhar(ctx, c.width, sorteio(semente));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
// granulado: pontinhos claros e escuros por cima
function granular(ctx, W, rnd, forca = 0.12, n = 2600) {
  for (let i = 0; i < n; i++) {
    const v = rnd();
    ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${forca * rnd()})` : `rgba(255,255,255,${forca * 0.8 * rnd()})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * W, rnd() * W, s, s);
  }
}

// cantaria: blocos de pedra em fiadas (2 por bloco de altura), juntas desencontradas
function tijolos(ctx, W, rnd, { h = 40, s = 8, l = 58, musgo = 0, rachado = false }) {
  ctx.fillStyle = hsl(h, s, l * 0.7);
  ctx.fillRect(0, 0, W, W);
  const fiada = PX / 2;
  for (let y = 0; y < W; y += fiada) {
    const desloc = (y / fiada) % 2 ? PX / 2 : 0;
    for (let x = -PX; x < W + PX; x += PX) {
      const ll = l + (rnd() - 0.5) * 10;
      ctx.fillStyle = hsl(h + (rnd() - 0.5) * 8, s + rnd() * 4, ll);
      ctx.fillRect(x + desloc + 2, y + 2, PX - 4, fiada - 4);
      // luz em cima, sombra embaixo: relevo de cada pedra
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + desloc + 2, y + 2, PX - 4, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + desloc + 2, y + fiada - 5, PX - 4, 3);
      if (musgo && rnd() < musgo) {
        ctx.fillStyle = `rgba(70,105,45,${0.35 + rnd() * 0.35})`;
        for (let k = 0; k < 14; k++) ctx.fillRect(x + desloc + rnd() * PX, y + fiada - 6 - rnd() * 12, 3 + rnd() * 7, 3 + rnd() * 5);
      }
      if (rachado && rnd() < 0.5) {
        ctx.strokeStyle = 'rgba(30,25,20,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let px = x + desloc + 8 + rnd() * 40, py = y + 3;
        ctx.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 14; py += fiada / 4; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }
  granular(ctx, W, rnd, 0.14);
}

// pedregulho: pedras redondas de tamanhos variados, argamassa escura
function pedras(ctx, W, rnd, { h = 35, s = 6, l = 50, musgo = 0 }) {
  ctx.fillStyle = hsl(h, s, l * 0.55);
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 230; i++) {
    const x = rnd() * W, y = rnd() * W, r = 8 + rnd() * 14;
    for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, W], [0, -W]]) {
      ctx.fillStyle = hsl(h + (rnd() - 0.5) * 10, s, l + (rnd() - 0.5) * 16);
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, r, r * (0.7 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(x + dx - r * 0.2, y + dy - r * 0.25, r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (musgo && rnd() < musgo) {
        ctx.fillStyle = `rgba(75,110,48,${0.4 + rnd() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy + r * 0.3, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  granular(ctx, W, rnd, 0.12);
}

const DESENHOS = {
  [MAT.cantaria]: (c, W, r) => tijolos(c, W, r, { h: 38, s: 7, l: 60 }),
  [MAT.musgo]: (c, W, r) => pedras(c, W, r, { h: 70, s: 10, l: 46, musgo: 0.45 }),
  [MAT.rachado]: (c, W, r) => tijolos(c, W, r, { h: 36, s: 6, l: 55, rachado: true }),
  [MAT.cinzel]: (c, W, r) => {
    tijolos(c, W, r, { h: 40, s: 8, l: 62 });
    // uma roseta em relevo no meio de cada bloco
    for (let y = 0; y < W; y += PX) for (let x = 0; x < W; x += PX) {
      c.strokeStyle = 'rgba(0,0,0,0.28)';
      c.lineWidth = 3;
      c.strokeRect(x + 8, y + 8, PX - 16, PX - 16);
      c.beginPath();
      c.arc(x + PX / 2, y + PX / 2, PX / 5, 0, Math.PI * 2);
      c.stroke();
    }
  },
  [MAT.pedregulho]: (c, W, r) => pedras(c, W, r, { h: 30, s: 5, l: 52 }),
  [MAT.liso]: (c, W, r) => {
    c.fillStyle = hsl(40, 8, 66);
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.1, 4000);
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2;
    for (let i = 0; i <= W; i += PX) { c.beginPath(); c.moveTo(0, i); c.lineTo(W, i); c.stroke(); }
  },
  [MAT.marmore]: (c, W, r) => {
    c.fillStyle = '#ece6da';
    c.fillRect(0, 0, W, W);
    c.strokeStyle = 'rgba(150,140,130,0.35)';
    for (let i = 0; i < 18; i++) {
      c.lineWidth = 0.6 + r() * 1.6;
      c.beginPath();
      let x = r() * W, y = r() * W;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.3) * 50; y += (r() - 0.5) * 40; c.lineTo(x, y); }
      c.stroke();
    }
    granular(c, W, r, 0.05);
  },
  // telhado: escamas de ardósia vermelho-escuro
  [MAT.telha]: (c, W, r) => {
    c.fillStyle = '#3a1416';
    c.fillRect(0, 0, W, W);
    const tw = PX / 2, th = PX / 4;
    for (let y = -th; y < W + th; y += th) {
      const off = ((y / th) & 1) ? tw / 2 : 0;
      for (let x = -tw; x < W + tw; x += tw) {
        c.fillStyle = hsl(356 + (r() - 0.5) * 8, 45, 22 + r() * 9);
        c.beginPath();
        c.moveTo(x + off + 1, y);
        c.lineTo(x + off + tw - 1, y);
        c.lineTo(x + off + tw - 1, y + th);
        c.arc(x + off + tw / 2, y + th, tw / 2 - 1, 0, Math.PI);
        c.closePath();
        c.fill();
      }
    }
    granular(c, W, r, 0.1);
  },
  [MAT.madeira]: (c, W, r) => {
    c.fillStyle = '#4a3020';
    c.fillRect(0, 0, W, W);
    const tabua = PX / 4;
    for (let y = 0; y < W; y += tabua) {
      c.fillStyle = hsl(26 + (r() - 0.5) * 6, 38, 26 + r() * 8);
      c.fillRect(0, y + 1, W, tabua - 2);
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        const yy = y + 3 + r() * (tabua - 6);
        c.moveTo(0, yy);
        c.bezierCurveTo(W / 3, yy + (r() - 0.5) * 4, (2 * W) / 3, yy + (r() - 0.5) * 4, W, yy);
        c.stroke();
      }
    }
  },
  [MAT.ferro]: (c, W, r) => {
    c.fillStyle = '#2e3136';
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.18, 3000);
  },
  [MAT.ouro]: (c, W, r) => {
    c.fillStyle = '#d7a93a';
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.18);
  },
  // vitral: vidros coloridos em losangos com o chumbo escuro entre eles
  [MAT.vitral]: (c, W, r) => {
    const cores = ['#1d4ed8', '#2563eb', '#b91c1c', '#ca8a04', '#15803d', '#7e22ce', '#0e7490', '#1e40af'];
    c.fillStyle = '#16181d';
    c.fillRect(0, 0, W, W);
    const p = PX / 4;
    for (let y = 0; y < W; y += p) for (let x = 0; x < W; x += p) {
      c.fillStyle = cores[Math.floor(r() * cores.length)];
      c.fillRect(x + 1.5, y + 1.5, p - 3, p - 3);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x + 2, y + 2, p / 3, p / 3);
    }
  },
  [MAT.tapete]: (c, W, r) => {
    c.fillStyle = '#8b1a1a';
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.12, 5000);
  },
  [MAT.tapeteCinza]: (c, W, r) => {
    c.fillStyle = '#6b6f76';
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.12, 5000);
  },
  [MAT.chama]: (c, W) => {
    c.fillStyle = '#ffcf5a';
    c.fillRect(0, 0, W, W);
  },
  [MAT.estante]: (c, W, r) => {
    c.fillStyle = '#3b2616';
    c.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += PX / 2) {
      let x = 2;
      while (x < W - 4) {
        const w = 4 + r() * 6;
        c.fillStyle = hsl(Math.floor(r() * 360), 40, 30 + r() * 15);
        c.fillRect(x, y + 5, w, PX / 2 - 9);
        x += w + 1;
      }
    }
  },
  [MAT.neve]: (c, W, r) => {
    c.fillStyle = '#f2f6fb';
    c.fillRect(0, 0, W, W);
    granular(c, W, r, 0.05);
  },
};

function material(mat) {
  const map = tela(DESENHOS[mat] || DESENHOS[MAT.liso], 17 + mat * 101);
  const opcoes = { map, vertexColors: true, roughness: 0.92, metalness: 0 };
  if (mat === MAT.ferro) Object.assign(opcoes, { roughness: 0.55, metalness: 0.5 });
  if (mat === MAT.ouro) Object.assign(opcoes, { roughness: 0.35, metalness: 0.8 });
  if (mat === MAT.marmore) opcoes.roughness = 0.6;
  // o vitral brilha um pouco: parece a luz atravessando
  if (mat === MAT.vitral) Object.assign(opcoes, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.25 });
  if (mat === MAT.chama) Object.assign(opcoes, { emissive: 0xffb340, emissiveIntensity: 1.6, toneMapped: false });
  return new THREE.MeshStandardMaterial(opcoes);
}

// ------------------------------------------------------------------ montagem
export function construirCatedral(world) {
  const C = CATEDRAL;
  const grupo = new THREE.Group();
  grupo.name = 'catedral';
  // o canto (0, 0, 0) da grade; a fachada das torres fica para o sul (-z)
  grupo.position.set(C.x0, 0, C.z0);
  world.scene.add(grupo);
  // nada de árvore nascendo dentro dela
  for (let z = 10; z < C.comp; z += 22) world.reservas.push({ x: C.x0 + C.larg / 2, z: C.z0 + z, r: 34 });

  const fisica = { caixas: [], grade: new Map(), perto: new Set(), centro: null, pronta: false, bloqueia: null };
  const CEL = 8;
  const cel = (x, z) => `${Math.floor(x / CEL)},${Math.floor(z / CEL)}`;

  fetch('/models/catedral.bin')
    .then((r) => {
      if (!r.ok) throw new Error(`catedral.bin: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const dados = lerCatedral(gunzipSync(new Uint8Array(buf)));
      const m = montarCatedral(dados, { texBlocos: TEX_BLOCOS });
      for (const lt of m.lotes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(lt.pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(lt.nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(lt.uv, 2));
        g.setAttribute('color', new THREE.BufferAttribute(lt.cor, 3));
        g.setIndex(new THREE.BufferAttribute(lt.idx, 1));
        g.computeBoundingSphere();
        const malha = new THREE.Mesh(g, material(lt.mat));
        malha.castShadow = lt.mat !== MAT.chama && lt.mat !== MAT.tapete && lt.mat !== MAT.tapeteCinza;
        malha.receiveShadow = true;
        grupo.add(malha);
      }
      for (const b of m.colisoes) {
        const c = new Collider(
          new THREE.Vector3(C.x0 + b[0], b[1], C.z0 + b[2]),
          new THREE.Vector3(C.x0 + b[3], b[4], C.z0 + b[5]),
          { type: b[6] === 1 ? 'banco' : 'catedral' },
        );
        fisica.caixas.push(c);
        for (let i = Math.floor(c.min.x / CEL); i <= Math.floor(c.max.x / CEL); i++) {
          for (let k = Math.floor(c.min.z / CEL); k <= Math.floor(c.max.z / CEL); k++) {
            const key = `${i},${k}`;
            if (!fisica.grade.has(key)) fisica.grade.set(key, []);
            fisica.grade.get(key).push(c);
          }
        }
      }
      fisica.bloqueia = m.bloqueia;
      fisica.pronta = true;
      fisica.centro = null;
      world.sombraSuja = true;
    })
    .catch((e) => console.warn('[catedral] não carregou:', e));

  // as caixas a até ~40 m de (x, z) entram em world.colliders; refaz quando se afasta 6 m
  function aproximar(x, z) {
    if (!fisica.pronta) return;
    if (fisica.centro && Math.hypot(x - fisica.centro.x, z - fisica.centro.z) < 6) return;
    fisica.centro = { x, z };
    const nova = new Set();
    // longe da catedral: nada
    if (x > C.x0 - 50 && x < C.x0 + C.larg + 50 && z > C.z0 - 50 && z < C.z0 + C.comp + 50) {
      const R = 40;
      for (let i = Math.floor((x - R) / CEL); i <= Math.floor((x + R) / CEL); i++) {
        for (let k = Math.floor((z - R) / CEL); k <= Math.floor((z + R) / CEL); k++) {
          const l = fisica.grade.get(`${i},${k}`);
          if (l) for (const c of l) nova.add(c);
        }
      }
    }
    const antes = fisica.perto;
    if (antes.size) world.colliders = world.colliders.filter((c) => !antes.has(c) || nova.has(c));
    for (const c of nova) if (!antes.has(c)) world.colliders.push(c);
    fisica.perto = nova;
  }

  // a câmera em 3ª pessoa: até onde dá para ir de o na direção d (passo a passo pela grade)
  function raioCamera(o, d, max) {
    if (!fisica.pronta) return null;
    const passo = 0.25;
    for (let t = 0; t <= max; t += passo) {
      const x = o.x + d.x * t - C.x0, y = o.y + d.y * t, z = o.z + d.z * t - C.z0;
      if (x < 0 || z < 0 || x >= C.larg || z >= C.comp || y < 0 || y >= C.alt) continue;
      if (fisica.bloqueia(Math.floor(x), Math.floor(y), Math.floor(z))) return t;
    }
    return null;
  }

  return { grupo, aproximar, raioCamera, fisica };
}
