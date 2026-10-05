// O escritório em 3D (a planta está em escritorio.js): prédio, recepção, corredor e uma sala por
// departamento, cada uma com a cara do setor. Quem chama é o World, dentro de world.area(): tudo
// o que é criado aqui (objetos, colisões, luzes) liga, desliga e é desmontado junto.
//
// Cada sala é montada no próprio sistema de coordenadas: parede do fundo em z = -D (é onde ficam
// as telas), porta para o corredor em z = +D. As salas do lado sul são as mesmas, giradas 180°.
// As telas e o telão não são criados aqui: a função devolve onde ficam e o World cria (ele é que
// sabe ligar vídeo nelas).
//
// Peças repetidas (cadeiras, monitores, baias) são instanciadas, e cada sala tem uma luz no teto
// — o World só acende as mais perto da câmera.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PREDIO } from './escritorio.js';

const FONTE = "'Plus Jakarta Sans', system-ui, sans-serif";
const H = PREDIO.altura;
const T = 0.3; // espessura das paredes
const PORTA = 4; // largura da porta de cada sala
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();
const dinheiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

// ------------------------------------------------------------------ ajudantes
function quadro(w, h, desenhar) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redesenhar = (...args) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    desenhar(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  redesenhar();
  return { tex, redesenhar };
}

const mat = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...extra });
const brilho = (cor) => new THREE.MeshBasicMaterial({ color: cor, toneMapped: false });

// Uma peça feita de partes, repetida em vários lugares: uma InstancedMesh por parte.
// partes: [{ geo, mat, pos: [x, y, z], giro?: [rx, ry, rz], sombra? }]; lugares: [[x, z, giroY]]
function repetir(grupo, partes, lugares) {
  if (!lugares.length) return;
  for (const p of partes) {
    const malha = new THREE.InstancedMesh(p.geo, p.mat, lugares.length);
    const local = new THREE.Matrix4().makeTranslation(...p.pos);
    if (p.giro) local.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.giro)));
    lugares.forEach(([x, z, ry = 0], i) => {
      _o.position.set(x, 0, z);
      _o.rotation.set(0, ry, 0);
      _o.updateMatrix();
      _m.multiplyMatrices(_o.matrix, local);
      malha.setMatrixAt(i, _m);
    });
    malha.castShadow = p.sombra !== false;
    malha.receiveShadow = true;
    malha.computeBoundingSphere();
    grupo.add(malha);
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

// cadeira gamer: concha preta com faixas coloridas, abas laterais, almofada de cabeça e braços
function partesCadeiraGamer(cor) {
  const preto = mat(0x0f1115, { roughness: 0.55 });
  const faixa = mat(cor, { roughness: 0.45 });
  const metal = mat(0x2b2f36, { roughness: 0.3, metalness: 0.7 });
  const encosto = [-0.12, 0, 0]; // levemente reclinado
  return [
    { geo: new THREE.CylinderGeometry(0.36, 0.38, 0.06, 5), mat: metal, pos: [0, 0.05, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), mat: metal, pos: [0, 0.3, 0], sombra: false },
    { geo: new RoundedBoxGeometry(0.66, 0.14, 0.62, 2, 0.06), mat: preto, pos: [0, 0.58, 0] },
    { geo: new RoundedBoxGeometry(0.09, 0.16, 0.6, 2, 0.04), mat: faixa, pos: [-0.31, 0.66, 0] },
    { geo: new RoundedBoxGeometry(0.09, 0.16, 0.6, 2, 0.04), mat: faixa, pos: [0.31, 0.66, 0] },
    { geo: new RoundedBoxGeometry(0.6, 1.15, 0.14, 2, 0.06), mat: preto, pos: [0, 1.22, 0.33], giro: encosto },
    { geo: new RoundedBoxGeometry(0.1, 1.05, 0.16, 2, 0.04), mat: faixa, pos: [-0.27, 1.2, 0.34], giro: encosto },
    { geo: new RoundedBoxGeometry(0.1, 1.05, 0.16, 2, 0.04), mat: faixa, pos: [0.27, 1.2, 0.34], giro: encosto },
    { geo: new RoundedBoxGeometry(0.3, 0.16, 0.12, 2, 0.05), mat: faixa, pos: [0, 1.62, 0.33], giro: encosto },
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
  });
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
  });
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

// moldura, haste e pé de cada monitor (a tela em si é do World, que põe o vídeo nela)
function molduras(g, monitores, corpo) {
  const { w, h, y } = monitores[0];
  repetir(g, [
    { geo: new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), mat: corpo, pos: [0, y, -0.03] },
    { geo: new THREE.BoxGeometry(0.06, 0.3, 0.05), mat: corpo, pos: [0, y - h / 2 - 0.1, -0.06], sombra: false },
    { geo: new THREE.BoxGeometry(0.34, 0.025, 0.22), mat: corpo, pos: [0, y - h / 2 - 0.25, -0.05], sombra: false },
  ], monitores.map((m) => [m.x, m.z, m.ry]));
}

// ------------------------------------------------------------------ sala genérica
// Um "marco" é o sistema de coordenadas da sala: g é o grupo (já girado e no lugar), mundo()
// converte um ponto local para o mundo e bloco() cria a colisão (sempre de eixo) já convertida.
function marco(world, raiz, s, telas, telaoes, postos, assentos) {
  const cx = (s.x0 + s.x1) / 2;
  const cz = (s.z0 + s.z1) / 2;
  const giro = s.lado === 'norte' ? 0 : Math.PI;
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = giro;
  raiz.add(g);
  const mundo = (lx, lz) => (giro ? [cx - lx, cz - lz] : [cx + lx, cz + lz]);
  let k = 0;
  return {
    g,
    s,
    W: (s.x1 - s.x0) / 2,
    D: (s.z1 - s.z0) / 2,
    mundo,
    bloco(lmin, lmax, extra = {}) {
      const a = mundo(lmin[0], lmin[2]);
      const b = mundo(lmax[0], lmax[2]);
      world.addBox({ min: [Math.min(a[0], b[0]), lmin[1], Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), lmax[1], Math.max(a[1], b[1])], ...extra });
    },
    // tela de compartilhar (na ordem: a 1ª chamada é a 1ª tela da sala no servidor)
    tela(lx, y, lz, ry, w, h) {
      const [x, z] = mundo(lx, lz);
      telas.push({ pos: [x, y, z], rotY: ry + giro, w, h, rotulo: `${s.nome} · Tela ${++k}` });
    },
    telao(lx, y, lz, ry, w, h) {
      const [x, z] = mundo(lx, lz);
      telaoes.push({ pos: [x, y, z], rotY: ry + giro, w, h });
    },
    // Lugar onde dá para sentar (tecla C perto dele). y: altura do assento; ry: para onde quem
    // senta olha (0 = -z local, para o fundo da sala).
    assento(lx, lz, y, ry = 0, posto = null) {
      const [x, z] = mundo(lx, lz);
      assentos.push({ x, z, y, yaw: ry + giro, posto });
    },
    // posto de trabalho n: a cadeira (já vira assento) e os 3 monitores dele
    posto(n, cadeira, monitores) {
      const id = `${s.id}-${n}`;
      this.assento(cadeira.x, cadeira.z, cadeira.y, cadeira.ry ?? 0, id);
      postos.push({
        id,
        monitores: monitores.map((mo) => {
          const [x, z] = mundo(mo.x, mo.z);
          return { pos: [x, mo.y, z], rotY: mo.ry + giro, w: mo.w, h: mo.h };
        }),
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
        m.posto(n++, { x: lx + dx, z: lz + 1.3, y: 0.66 }, mons);
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
  molduras(g, monitores, mat(0x0b0d12, { roughness: 0.4 }));
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
  plano(g, [6, 3.375], [W - 0.25, 3.3, 6], new THREE.MeshBasicMaterial({ map: status.tex, toneMapped: false }), [0, -Math.PI / 2, 0]);

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
        m.posto(n++, { x: lx + dx, z: lz + 1.3, y: 0.62 }, mons);
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
  molduras(g, monitores, mat(0x111827, { roughness: 0.4 }));
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
  });
  caixa(g, [0.15, 4.9, 8.0], [W - 0.25, 3.3, -1], mat(0x111827));
  plano(g, [7.6, 4.56], [W - 0.34, 3.3, -1], new THREE.MeshBasicMaterial({ map: placar.tex, toneMapped: false }), [0, -Math.PI / 2, 0]);

  // sino de venda fechada, perto da porta
  const ouro = mat(0xf5c542, { roughness: 0.25, metalness: 0.9, emissive: 0x3a2a00 });
  const perfil = [[0, 0], [0.55, 0.01], [0.52, 0.1], [0.4, 0.32], [0.36, 0.6], [0.32, 0.78], [0.17, 0.9], [0, 0.94]].map(([x, y]) => new THREE.Vector2(x, y));
  const pendurado = new THREE.Group();
  const sino = new THREE.Mesh(new THREE.LatheGeometry(perfil, 28), ouro);
  sino.position.y = -0.94;
  sino.castShadow = true;
  const badalo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), ouro);
  badalo.position.y = -0.86;
  pendurado.add(sino, badalo);
  pendurado.position.set(-W + 2.5, 2.7, D - 2.5);
  const suporte = mat(0x5b3a26, { roughness: 0.5 });
  caixa(g, [1.6, 0.12, 0.12], [-W + 2.5, 2.76, D - 2.5], suporte);
  caixa(g, [0.12, 2.8, 0.12], [-W + 1.75, 1.4, D - 2.5], suporte);
  caixa(g, [0.12, 2.8, 0.12], [-W + 3.25, 1.4, D - 2.5], suporte);
  g.add(pendurado);
  m.bloco([-W + 1.6, 0, D - 2.7], [-W + 3.4, 2.8, D - 2.3]);

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
      pendurado.rotation.z = Math.sin(t * 9) * 0.45 * (balanco / 2.4);
    },
  };
}

// ------------------------------------------------------------------ Telemarketing
function salaTelemarketing(m) {
  const { g, W, D } = m;
  vestirSala(m, { piso: mat(0x25304a, { roughness: 1 }), parede: 0xece6f3, faixa: 0xf472b6, luz: 0xffe4f2, intensidade: 55 });
  // painel da central no meio da parede do fundo e 4 telas, duas de cada lado
  const central = painel('CENTRAL DE ATENDIMENTO', '#f472b6');
  caixa(g, [8.3, 4.6, 0.12], [0, 3.3, -D + 0.24], mat(0x111827));
  plano(g, [8, 4.5], [0, 3.3, -D + 0.31], new THREE.MeshBasicMaterial({ map: central.tex, toneMapped: false }));
  for (const lx of [-10.2, 10.2]) for (const y of [2.1, 4.75]) m.tela(lx, y, -D + 0.25, 0, 4.4, 2.48);

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
      m.posto(n++, { x: lx, z: lz + 1.25, y: 0.62 }, mons);
    }
    m.bloco([-11.6, 0, lz - 0.7], [11.6, 1.6, lz + 0.5], { data: { type: 'mesa' } });
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
  molduras(g, monitores, mat(0x111827, { roughness: 0.4 }));
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

// ------------------------------------------------------------------ lounge (vaga sem departamento)
function lounge(m) {
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
  const cafe = placa('Café', '#a16207', { sub: 'Lounge' });
  plano(g, [4, 1], [2.5, 2.6, -D + 0.2], new THREE.MeshBasicMaterial({ map: cafe.tex, toneMapped: false }));
  plantas(g, [[-W + 1.2, -D + 1.2], [W - 1.2, -D + 1.2], [-W + 1.2, D - 1.6], [W - 1.2, D - 1.6]]);
  const l = new THREE.PointLight(0xffe8c7, 45, 28, 1.4);
  l.position.set(0, H - 0.8, 0);
  g.add(l);
  return {};
}

const SALAS = { ti: salaTI, comercial: salaComercial, telemarketing: salaTelemarketing, reuniao: salaReuniao };

// ------------------------------------------------------------------ prédio
export function construirEscritorio(world, p, { empresa = '' } = {}) {
  const raiz = new THREE.Group();
  world.scene.add(raiz);
  const minX = p.minX;
  const maxX = PREDIO.maxX;
  const [c0, c1] = PREDIO.corredor;
  const { z0, z1, recepcao } = PREDIO;
  const externa = mat(0xd9dde3, { roughness: 0.9 });
  const interna = mat(0xdfe2e7, { roughness: 0.9 });
  const vidro = new THREE.MeshStandardMaterial({ color: 0xa5d8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const caixilho = mat(0x2b3240, { roughness: 0.4, metalness: 0.5 });

  // parede (alinhada a x ou a z), com colisão e barrando a câmera
  const parede = (xa, za, xb, zb, material, { y0 = 0, y1 = H, camera = true, colide = true } = {}) => {
    const w = Math.max(T, Math.abs(xb - xa));
    const d = Math.max(T, Math.abs(zb - za));
    const m = caixa(raiz, [w, y1 - y0, d], [(xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2], material, { sombra: material !== vidro });
    if (colide) world.addBox({ min: [Math.min(xa, xb) - (w === T ? T / 2 : 0), y0, Math.min(za, zb) - (d === T ? T / 2 : 0)], max: [Math.max(xa, xb) + (w === T ? T / 2 : 0), y1, Math.max(za, zb) + (d === T ? T / 2 : 0)], mesh: m, blocksCamera: camera });
    return m;
  };

  // casca: paredes de fora (porta de entrada no leste, alinhada ao corredor), laje e piso
  parede(minX, z0, maxX, z0, externa);
  parede(minX, z1, maxX, z1, externa);
  parede(minX, z0, minX, z1, externa);
  parede(maxX, z0, maxX, c0, externa);
  parede(maxX, c1, maxX, z1, externa);
  parede(maxX, c0, maxX, c1, externa, { y0: 3.6, colide: false });
  const laje = caixa(raiz, [maxX - minX + 0.6, 0.35, z1 - z0 + 0.6], [(minX + maxX) / 2, H + 0.17, (z0 + z1) / 2], mat(0x3a3f4a, { roughness: 0.95 }), { sombra: false });
  laje.receiveShadow = false;
  // forro claro por dentro: a parte de baixo da laje quase não pega luz e ficava preta
  plano(raiz, [maxX - minX, z1 - z0], [(minX + maxX) / 2, H - 0.01, (z0 + z1) / 2], mat(0xd9dce1, { roughness: 1, emissive: 0x3d4149 }), [Math.PI / 2, 0, 0]);
  // faixa de janelas por fora (norte, sul e oeste)
  const janela = mat(0x1e3a5f, { roughness: 0.15, metalness: 0.6, emissive: 0x0b1a2e });
  caixa(raiz, [maxX - minX, 2.2, 0.06], [(minX + maxX) / 2, 3.4, z0 - T / 2 - 0.04], janela, { sombra: false });
  caixa(raiz, [maxX - minX, 2.2, 0.06], [(minX + maxX) / 2, 3.4, z1 + T / 2 + 0.04], janela, { sombra: false });
  caixa(raiz, [0.06, 2.2, z1 - z0], [minX - T / 2 - 0.04, 3.4, (z0 + z1) / 2], janela, { sombra: false });
  // fachada: nome da empresa em cima da porta, por fora
  const letreiro = placa(empresa || 'Escritório', '#6ee7c8', { sub: 'Entrada' });
  plano(raiz, [7.6, 1.9], [maxX + T / 2 + 0.03, 4.9, (c0 + c1) / 2], new THREE.MeshBasicMaterial({ map: letreiro.tex, toneMapped: false }), [0, Math.PI / 2, 0]);
  for (const z of [c0 + 0.1, c1 - 0.1]) caixa(raiz, [0.25, 3.6, 0.25], [maxX, 1.8, z], caixilho);

  // corredor: piso com passadeira, luz no teto
  plano(raiz, [recepcao - minX, c1 - c0], [(minX + recepcao) / 2, 0.02, (c0 + c1) / 2], mat(0x2a2f3a, { roughness: 0.85 }), [-Math.PI / 2, 0, 0]);
  plano(raiz, [recepcao - minX, 2.2], [(minX + recepcao) / 2, 0.03, (c0 + c1) / 2], mat(0x3b4459, { roughness: 1 }), [-Math.PI / 2, 0, 0]);
  caixa(raiz, [recepcao - minX - 2, 0.05, 0.5], [(minX + recepcao) / 2, H - 0.03, (c0 + c1) / 2], brilho(0xf5f7ff), { sombra: false });
  for (let x = recepcao - 14; x > minX; x -= 28) {
    const l = new THREE.PointLight(0xf1f5ff, 40, 26, 1.5);
    l.position.set(x, H - 0.8, (c0 + c1) / 2);
    raiz.add(l);
  }

  // divisórias entre as colunas de salas (e entre a última coluna e a recepção)
  const divisas = [...new Set([...p.salas, ...p.lounges].map((s) => s.x1))];
  for (const x of divisas) {
    parede(x, z0, x, c0, interna);
    parede(x, c1, x, z1, interna);
  }

  // frente de cada sala para o corredor: vidro com porta e placa; o lounge é aberto
  for (const s of p.salas) {
    const zc = s.lado === 'norte' ? c0 : c1;
    const meio = (s.x0 + s.x1) / 2;
    parede(s.x0, zc, meio - PORTA / 2, zc, vidro, { camera: false });
    parede(meio + PORTA / 2, zc, s.x1, zc, vidro, { camera: false });
    parede(meio - PORTA / 2, zc, meio + PORTA / 2, zc, interna, { y0: 3.2, colide: false });
    // caixilhos verticais a cada 3,5 m
    for (let x = s.x0 + 3.5; x < s.x1 - 0.5; x += 3.5) if (Math.abs(x - meio) > PORTA / 2) caixa(raiz, [0.08, H, 0.12], [x, H / 2, zc], caixilho, { sombra: false });
    const pl = placa(s.nome, s.cor);
    const virado = s.lado === 'norte' ? 0 : Math.PI; // a placa olha para o corredor
    plano(raiz, [3.6, 0.9], [meio, 4.25, zc + (s.lado === 'norte' ? 0.18 : -0.18)], new THREE.MeshBasicMaterial({ map: pl.tex, toneMapped: false }), [0, virado, 0]);
  }

  // recepção: balcão, nome da empresa na parede, sofás de espera
  plano(raiz, [maxX - recepcao, z1 - z0], [(recepcao + maxX) / 2, 0.02, (z0 + z1) / 2], mat(0x8f96a1, { roughness: 0.4 }), [-Math.PI / 2, 0, 0]);
  const balcao = mat(0xf8fafc, { roughness: 0.4 });
  caixa(raiz, [9, 1.1, 1.2], [50, 0.55, 10], balcao, { arredondada: 0.1 });
  caixa(raiz, [9, 0.08, 1.4], [50, 1.14, 10], mat(0x6ee7c8, { roughness: 0.4 }), { sombra: false });
  world.addBox({ min: [45.5, 0, 9.4], max: [54.5, 1.15, 10.6] });
  const recep = placa(empresa || 'Bem-vindo', '#6ee7c8', { w: 1280, h: 320, sub: empresa ? 'Bem-vindo' : 'Escritório virtual' });
  plano(raiz, [10, 2.5], [50, 3.6, z0 + T / 2 + 0.03], new THREE.MeshBasicMaterial({ map: recep.tex, toneMapped: false }));
  const esperaSofa = new THREE.Group();
  raiz.add(esperaSofa);
  sofa(esperaSofa, 0x334155, [[47, 52, 0], [53, 52, 0]]); // de frente para o balcão
  world.addBox({ min: [45.4, 0, 51.45], max: [54.6, 0.8, 52.55], data: { type: 'sofa' } });
  const assentos = [];
  for (const x of [47, 53]) lugaresDoSofa(x, 52, 0, (lx, lz) => assentos.push({ x: lx, z: lz, y: 0.8, yaw: 0, posto: null }));
  plantas(raiz, [[41.5, 4], [58.5, 4], [41.5, 56], [58.5, 56], [58, 22], [58, 38]]);
  const lr = new THREE.PointLight(0xffffff, 55, 30, 1.4);
  lr.position.set(50, H - 0.8, 30);
  raiz.add(lr);

  // salas
  const telas = [];
  const telaoes = [];
  const postos = [];
  const salas = {};
  for (const s of p.salas) salas[s.id] = SALAS[s.id](marco(world, raiz, s, telas, telaoes, postos, assentos));
  for (const l of p.lounges) lounge(marco(world, raiz, l, telas, telaoes, postos, assentos));

  return {
    telas,
    telaoes,
    postos, // [{ id: 'ti-0', monitores: [3 × { pos, rotY, w, h }] }], na ordem da planta
    assentos, // [{ x, z, y, yaw, posto }]: onde dá para sentar com C
    entrada: { pos: [55, 0, (c0 + c1) / 2], yaw: Math.PI / 2 }, // olhando para o corredor
    limites: { minX, maxX, minZ: z0, maxZ: z1 },
    porta: new THREE.Box3(new THREE.Vector3(maxX - 1, 0, c0), new THREE.Vector3(maxX + 1, 3.6, c1)),
    placar: (dados) => salas.comercial?.placar(dados),
    tocarSino: () => salas.comercial?.tocarSino(),
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
      for (const s of Object.values(salas)) s.update?.(t);
    },
  };
}
