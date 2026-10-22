// O 3D do parque (parque-dados.js): a praça com o marco no meio (nos mapas que têm uma), o pórtico na
// entrada, a placa e o salão de jogos (piso de madeira, pilares e telhado de vidro). As ruas até cada
// jogo são da cidade (cidade.js). As mesas, quadras e pistas em si são de cada jogo (pingue.js,
// sinuca.js...), cada um numa área que o dono da sala pode desligar. Chamado pelo World antes da
// natureza: os jogos entram em world.reservas (lá não nasce árvore nem lago).
import * as THREE from 'three';
import {
  malhaLanternas, construirPorticos, placaDeSaida, novosLotes, fundir, texturaRedonda, construirBancos, plantarFlores, fecharLotes,
} from './cidade.js';
import {
  PARQUE, SALAO, PORTICO_PARQUE, PLACA_PARQUE, QUEIMADA, PINTA_ARENA, GOLFE_AREA, PORTAL_GINCANA, PORTAL_FANTASMAS,
} from './parque-dados.js';
import { poste as posteDoTema } from './temas3d.js';

const FONTE = (px, peso = 800) => `${peso} ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;
const Y_PRACA = 0.07;

function textura(w, h, desenhar, repetir = false) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  desenhar(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repetir) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// tábuas do piso do salão
function texturaTabuas() {
  return textura(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      const tom = 150 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${tom},${Math.round(tom * 0.68)},${Math.round(tom * 0.42)})`;
      ctx.fillRect(0, (i * h) / 8, w, h / 8);
      ctx.fillStyle = 'rgba(40,20,5,0.35)';
      ctx.fillRect(0, (i * h) / 8, w, 2);
      const corte = ((i * 97) % 5) * (w / 5);
      ctx.fillRect(corte, (i * h) / 8, 2, h / 8);
    }
  }, true);
}

// ------------------------------------------------------------------ a praça do parque
function construirPracaDoParque(g, world, L, lanternas) {
  const { x, z, r } = PARQUE;
  const piso = new THREE.Mesh(new THREE.CircleGeometry(r, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texturaRedonda('#4ade80'), roughness: 0.88 }));
  piso.position.set(x, Y_PRACA, z);
  piso.receiveShadow = true;
  g.add(piso);

  // o marco: um pilar de pedra com o nome nas quatro faces
  const pedra = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 0.7, 8), pedra);
  base.position.set(x, 0.35 + Y_PRACA, z);
  const pilar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6, 1.6), pedra);
  pilar.position.set(x, 3.7, z);
  base.castShadow = pilar.castShadow = true;
  base.receiveShadow = pilar.receiveShadow = true;
  g.add(base, pilar);
  const nome = textura(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#f0fdf4';
    ctx.font = FONTE(78);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PARQUE', w / 2, h / 2 - 4);
  });
  const faces = [0, 1, 2, 3].map((k) => new THREE.PlaneGeometry(1.5, 0.375).translate(0, 0, 0.81).rotateY((k * Math.PI) / 2).translate(x, 5.6, z));
  g.add(fundir(faces, new THREE.MeshBasicMaterial({ map: nome, toneMapped: false })));
  const topo = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0x4ade80, toneMapped: false }));
  topo.position.set(x, 7.4, z);
  g.add(topo);
  world.decorAnimated.push((t) => {
    topo.rotation.y = t * 0.8;
    topo.position.y = 7.4 + Math.sin(t * 1.6) * 0.15;
  });
  world.addBox({ min: [x - 2.6, 0, z - 2.6], max: [x + 2.6, 0.7, z + 2.6] });
  world.addBox({ min: [x - 0.8, 0, z - 0.8], max: [x + 0.8, 6.7, z + 0.8] });

  // saídas da praça: sul (Rua do Parque), leste (Rua dos Esportes), norte (salão), oeste (minigolfe)
  const saidas = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const longeDasSaidas = (a, folga) => saidas.every((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) > folga);
  // canteiros redondos entre as saídas, com flores
  const flores = [];
  const cores = ['#f472b6', '#facc15', '#fb923c', '#a78bfa', '#f87171', '#fde68a'];
  const borda = [];
  const terra = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const cx = x + Math.cos(a) * 10.5;
    const cz = z + Math.sin(a) * 10.5;
    borda.push(new THREE.CylinderGeometry(2.2, 2.3, 0.45, 20, 1, true).translate(cx, 0.225 + Y_PRACA, cz));
    terra.push(new THREE.CircleGeometry(2.15, 20).rotateX(-Math.PI / 2).translate(cx, 0.4 + Y_PRACA, cz));
    for (let i = 0; i < 16; i++) {
      const aa = Math.random() * Math.PI * 2;
      const rr = Math.random() * 1.8;
      flores.push({ x: cx + Math.cos(aa) * rr, z: cz + Math.sin(aa) * rr, cor: cores[(i + k) % cores.length] });
    }
    world.addBox({ min: [cx - 2.1, 0, cz - 2.1], max: [cx + 2.1, 0.45, cz + 2.1] });
  }
  g.add(
    fundir(borda, new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.85, side: THREE.DoubleSide }), { recebe: true }),
    fundir(terra, new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), { recebe: true }),
  );
  plantarFlores(g, flores, 0.55 + Y_PRACA);
  // bancos virados para o marco e postes na beirada
  const bancos = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    if (!longeDasSaidas(a, 0.3)) continue;
    bancos.push({ x: x + Math.cos(a) * 15, z: z + Math.sin(a) * 15, giro: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  construirBancos(L, world, bancos);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    if (!longeDasSaidas(a, 0.32)) continue;
    posteDoTema(L, lanternas, x + Math.cos(a) * (r - 1.5), z + Math.sin(a) * (r - 1.5));
  }
}

// ------------------------------------------------------------------ o salão de jogos
function construirSalao(g, world, L) {
  const S = SALAO;
  const W = S.x1 - S.x0;
  const D = S.z1 - S.z0;
  const cx = (S.x0 + S.x1) / 2;
  const cz = (S.z0 + S.z1) / 2;
  const tabuas = texturaTabuas();
  tabuas.repeat.set(W / 6, D / 6);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tabuas, roughness: 0.6 }));
  piso.position.set(cx, 0.045, cz);
  piso.receiveShadow = true;
  g.add(piso);
  // rodapé de pedra em volta do piso
  const rodape = [];
  for (const [w, d, px, pz] of [[W + 0.6, 0.3, cx, S.z0], [W + 0.6, 0.3, cx, S.z1], [0.3, D, S.x0, cz], [0.3, D, S.x1, cz]]) {
    rodape.push(new THREE.BoxGeometry(w, 0.12, d).translate(px, 0.06, pz));
  }
  g.add(fundir(rodape, new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.8 }), { recebe: true }));

  // pilares na beirada, a cada ~10 m (os do meio da frente ficam de fora: é a entrada)
  const pilares = [];
  const nx = Math.round(W / 10);
  const nz = Math.round(D / 10.5);
  const pontos = [];
  for (let i = 0; i <= nx; i++) pontos.push([S.x0 + (i * W) / nx, S.z0], [S.x0 + (i * W) / nx, S.z1]);
  for (let j = 1; j < nz; j++) pontos.push([S.x0, S.z0 + (j * D) / nz], [S.x1, S.z0 + (j * D) / nz]);
  for (const [px, pz] of pontos) {
    pilares.push(new THREE.BoxGeometry(0.5, S.altura, 0.5).translate(px, S.altura / 2, pz));
    world.addBox({ min: [px - 0.25, 0, pz - 0.25], max: [px + 0.25, S.altura, pz + 0.25] });
  }
  g.add(fundir(pilares, new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.7 }), { sombra: true, recebe: true }));
  // vigas em volta e no meio, e o telhado de vidro por cima
  for (const [w, d, px, pz] of [[W + 0.5, 0.5, cx, S.z0], [W + 0.5, 0.5, cx, S.z1], [0.5, D, S.x0, cz], [0.5, D, S.x1, cz], [W, 0.3, cx, cz]]) {
    L.ferro.push(new THREE.BoxGeometry(w, 0.6, d).translate(px, S.altura + 0.3, pz));
  }
  for (let i = 1; i < nx; i++) L.ferro.push(new THREE.BoxGeometry(0.25, 0.3, D).translate(S.x0 + (i * W) / nx, S.altura + 0.45, cz));
  const vidro = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({
    color: 0xbfe3ff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false,
  }));
  vidro.position.set(cx, S.altura + 0.55, cz);
  g.add(vidro);
  // o letreiro na frente (sul), dos dois lados
  const letreiro = textura(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#f0fdf4';
    ctx.font = FONTE(70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SALÃO DE JOGOS', w / 2, h / 2 - 4);
  });
  const placas = [0, Math.PI].map((f) => new THREE.PlaneGeometry(12, 1.5).rotateY(f).translate(cx, S.altura - 0.6, S.z0 + (f ? 0.32 : -0.32)));
  g.add(fundir(placas, new THREE.MeshBasicMaterial({ map: letreiro, toneMapped: false })));
  L.escuro.push(new THREE.BoxGeometry(12.4, 1.8, 0.5).translate(cx, S.altura - 0.6, S.z0));
}

// ------------------------------------------------------------------ tudo
export function construirParque(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const L = novosLotes();
  const lanternas = [];
  if (PORTICO_PARQUE) construirPorticos(g, world, L, [PORTICO_PARQUE]);
  if (PARQUE.r > 0) construirPracaDoParque(g, world, L, lanternas);
  construirSalao(g, world, L);
  // a placa na entrada do parque: a frente para quem chega, o verso para quem vai embora
  const P = PLACA_PARQUE;
  if (P) placaDeSaida(g, L, P.x, P.z, P.giro, P.frente, P.verso);
  if (lanternas.length) g.add(malhaLanternas(lanternas));
  fecharLotes(g, L);

  // nada de árvore (nem lago) em cima da praça e dos jogos
  const ret = (x0, x1, z0, z1, folga = 4) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 + folga });
  const Q = QUEIMADA;
  const PA = PINTA_ARENA;
  if (PARQUE.r > 0) world.reservas.push({ x: PARQUE.x, z: PARQUE.z, r: PARQUE.r + 4 });
  world.reservas.push(
    ret(SALAO.x0, SALAO.x1, SALAO.z0, SALAO.z1),
    ret(Q.cx - Q.comp / 2 - Q.cemiterio, Q.cx + Q.comp / 2 + Q.cemiterio, Q.cz - Q.larg / 2, Q.cz + Q.larg / 2),
    ret(PA.cx - PA.lado / 2, PA.cx + PA.lado / 2, PA.cz - PA.lado / 2, PA.cz + PA.lado / 2),
    ret(GOLFE_AREA.x0, GOLFE_AREA.x1, GOLFE_AREA.z0, GOLFE_AREA.z1, 2),
    { x: PORTAL_GINCANA.x, z: PORTAL_GINCANA.z, r: 6 },
    { x: PORTAL_FANTASMAS.x, z: PORTAL_FANTASMAS.z, r: 6 },
  );
  return { grupo: g };
}
