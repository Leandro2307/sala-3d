// Caça-Fantasmas em 3D: monta a casa (paredes, portas, janelas, móveis, luzes, o terreno e a
// van), o monstro (o .glb, com o material de assombração), o que se segura na mão e os efeitos
// (digitais na luz UV, orbes, pontos do D.O.T.S., fumaça do incenso). Este arquivo só é baixado
// quando alguém entra pelo portal (import dinâmico em fantasmas.js), e cada casa só é montada
// quando é a da investigação.
//
// Tudo da casa fica num grupo na origem dela (C.origem): as malhas são montadas em coordenadas da
// casa, perto de zero, e o grupo é que vai para lá longe (a 9 km o float da placa tremeria).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PAREDE, linhaDoLado, caixaDoMovel, MODELO_URL, semente } from './fantasmas-dados.js';

const LADOS = ['x0', 'x1', 'z0', 'z1'];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const LONGE = -9999;

// ------------------------------------------------------------------ texturas (canvas)
const TEX = new Map();
function tela(chave, w, h, pintar, repetir = true) {
  if (TEX.has(chave)) return TEX.get(chave);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  pintar(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  TEX.set(chave, t);
  return t;
}

// pontinhos de sujeira e variação de tom: nada fica liso de computador
function sujeira(ctx, w, h, n = 1800, alfa = 0.05, rnd = Math.random) {
  for (let i = 0; i < n; i++) {
    const c = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${c},${c},${c},${alfa * rnd()})`;
    const r = 1 + rnd() * 3;
    ctx.fillRect(rnd() * w, rnd() * h, r, r);
  }
}
function manchas(ctx, w, h, n, cor, rnd = Math.random) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 20 + rnd() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const TEXTURAS = {
  madeira: (cor = '#6b4a2f', escuro = '#4a3020') => tela(`madeira${cor}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(7);
    const n = 6;
    for (let i = 0; i < n; i++) {
      _c.set(cor).lerp(_c.clone().set(escuro), rnd() * 0.7);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(0, (i * h) / n, w, h / n);
      // veios
      for (let k = 0; k < 18; k++) {
        ctx.strokeStyle = `rgba(30,18,8,${0.08 + rnd() * 0.12})`;
        ctx.lineWidth = 1 + rnd() * 2;
        ctx.beginPath();
        const y0 = (i * h) / n + rnd() * (h / n);
        ctx.moveTo(0, y0);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + k) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, (i * h) / n, w, 3);
      const corte = rnd() * w;
      ctx.fillRect(corte, (i * h) / n, 3, h / n);
    }
    sujeira(ctx, w, h, 2500, 0.06, rnd);
  }),
  ladrilho: (cor = '#d6d3c4', rejunte = '#77736a', n = 4) => tela(`ladrilho${cor}${n}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(11);
    ctx.fillStyle = rejunte;
    ctx.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      _c.set(cor).multiplyScalar(0.88 + rnd() * 0.16);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
    manchas(ctx, w, h, 5, 'rgba(60,50,30,0.12)', rnd);
    sujeira(ctx, w, h, 2000, 0.05, rnd);
  }),
  xadrez: (a = '#cfc8b4', b = '#3b3a36') => tela(`xadrez${a}${b}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(13);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? a : b;
      ctx.fillRect(i * s, j * s, s, s);
    }
    manchas(ctx, w, h, 8, 'rgba(40,35,20,0.15)', rnd);
    sujeira(ctx, w, h, 3000, 0.07, rnd);
  }),
  concreto: (cor = '#7b7d76') => tela(`concreto${cor}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(17);
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, w, h);
    sujeira(ctx, w, h, 9000, 0.08, rnd);
    manchas(ctx, w, h, 14, 'rgba(30,30,20,0.18)', rnd);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = rnd() * w;
      let y = rnd() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) ctx.lineTo((x += (rnd() - 0.5) * 60), (y += rnd() * 40));
      ctx.stroke();
    }
  }),
  carpete: (cor = '#5b2a2a') => tela(`carpete${cor}`, 256, 256, (ctx, w, h) => {
    const rnd = semente(19);
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, w, h);
    sujeira(ctx, w, h, 9000, 0.1, rnd);
  }),
  // papel de parede: fundo, desenho e o rodapé fica por conta da geometria
  papel: (fundo, desenho, tipo) => tela(`papel${fundo}${desenho}${tipo}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(23);
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = desenho;
    ctx.strokeStyle = desenho;
    if (tipo === 'listras') {
      for (let x = 0; x < w; x += 64) {
        ctx.fillRect(x, 0, 22, h);
        ctx.fillRect(x + 30, 0, 4, h);
      }
    } else if (tipo === 'damasco') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const cx = i * 256 + (j % 2) * 128 + 64;
        const cy = j * 256 + 128;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = 0.85;
        for (let k = 0; k < 8; k++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.ellipse(0, 34, 12, 34, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (tipo === 'flores') {
      for (let k = 0; k < 40; k++) {
        const x = (k % 8) * 64 + (Math.floor(k / 8) % 2) * 32;
        const y = Math.floor(k / 8) * 102 + 40;
        for (let p = 0; p < 5; p++) {
          ctx.beginPath();
          ctx.arc(x + Math.cos(p * 1.256) * 8, y + Math.sin(p * 1.256) * 8, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // descascado e manchado de umidade
    manchas(ctx, w, h, 10, 'rgba(70,55,25,0.16)', rnd);
    sujeira(ctx, w, h, 3000, 0.05, rnd);
  }),
  // a parede de baixo de azulejo e a de cima pintada (cozinha, banheiro, hospício)
  meiaParede: (azulejo, tinta) => tela(`meia${azulejo}${tinta}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(29);
    ctx.fillStyle = tinta;
    ctx.fillRect(0, 0, w, h);
    // a textura cobre 3 m de altura: os de baixo 1,2 m são azulejo
    const y0 = h * (1 - 1.2 / 3);
    ctx.fillStyle = '#5c5a52';
    ctx.fillRect(0, y0, w, h - y0);
    const s = w / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j * s < h - y0; j++) {
      _c.set(azulejo).multiplyScalar(0.9 + rnd() * 0.12);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(i * s + 2, y0 + j * s + 2, s - 4, s - 4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y0 - 6, w, 6);
    manchas(ctx, w, h, 12, 'rgba(60,50,20,0.2)', rnd);
    sujeira(ctx, w, h, 3000, 0.06, rnd);
  }),
  reboco: (cor = '#d8d2c2') => tela(`reboco${cor}`, 256, 256, (ctx, w, h) => {
    const rnd = semente(31);
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, w, h);
    sujeira(ctx, w, h, 4000, 0.05, rnd);
    manchas(ctx, w, h, 4, 'rgba(90,70,30,0.12)', rnd);
  }),
  tijolo: (cor = '#7a3b2a') => tela(`tijolo${cor}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(37);
    ctx.fillStyle = '#5d5a52';
    ctx.fillRect(0, 0, w, h);
    const bw = 128;
    const bh = 42;
    for (let j = 0; j * bh < h; j++) for (let i = -1; i * bw < w; i++) {
      _c.set(cor).multiplyScalar(0.75 + rnd() * 0.4);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(i * bw + (j % 2) * 64 + 3, j * bh + 3, bw - 6, bh - 6);
    }
    sujeira(ctx, w, h, 4000, 0.08, rnd);
    manchas(ctx, w, h, 8, 'rgba(20,30,10,0.25)', rnd);
  }),
  tabuas: (cor = '#8e8a7c') => tela(`tabuas${cor}`, 512, 512, (ctx, w, h) => {
    const rnd = semente(41);
    const n = 10;
    for (let i = 0; i < n; i++) {
      _c.set(cor).multiplyScalar(0.85 + rnd() * 0.2);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(0, (i * h) / n, w, h / n);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ((i + 1) * h) / n - 5, w, 5);
    }
    manchas(ctx, w, h, 10, 'rgba(30,40,20,0.25)', rnd);
    sujeira(ctx, w, h, 4000, 0.08, rnd);
  }),
  telhas: (cor = '#3d2b26') => tela(`telhas${cor}`, 256, 256, (ctx, w, h) => {
    const rnd = semente(43);
    ctx.fillStyle = '#1a1412';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 9; i++) {
      _c.set(cor).multiplyScalar(0.7 + rnd() * 0.5);
      ctx.fillStyle = `#${_c.getHexString()}`;
      ctx.fillRect(i * 32 + (j % 2) * 16 + 1, j * 32 + 1, 30, 30);
    }
  }),
  grama: () => tela('grama', 512, 512, (ctx, w, h) => {
    const rnd = semente(47);
    ctx.fillStyle = '#1e2a16';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const g = 30 + rnd() * 50;
      ctx.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.4},0.6)`;
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 4, y - 4 - rnd() * 6);
      ctx.stroke();
    }
    manchas(ctx, w, h, 10, 'rgba(50,40,20,0.35)', rnd);
  }),
  cascalho: () => tela('cascalho', 256, 256, (ctx, w, h) => {
    const rnd = semente(53);
    ctx.fillStyle = '#4a4740';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const g = 50 + rnd() * 90;
      ctx.fillStyle = `rgb(${g},${g * 0.97},${g * 0.9})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }),
  grao: () => tela('grao', 256, 256, (ctx, w, h) => {
    const rnd = semente(59);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
      ctx.beginPath();
      const y = rnd() * h;
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + k) * 2);
      ctx.stroke();
    }
    sujeira(ctx, w, h, 1500, 0.08, rnd);
  }),
  tapete: (cor, borda) => tela(`tapete${cor}`, 256, 256, (ctx, w, h) => {
    const rnd = semente(61);
    ctx.fillStyle = borda;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = borda;
    ctx.lineWidth = 4;
    ctx.strokeRect(34, 34, w - 68, h - 68);
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 50, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
    sujeira(ctx, w, h, 3000, 0.1, rnd);
  }, false),
  digital: () => tela('digital', 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    // a palma e os 5 dedos, com riscos de digital
    ctx.beginPath();
    ctx.ellipse(64, 84, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    const dedos = [[30, 50, -0.5], [44, 30, -0.2], [62, 24, 0], [80, 30, 0.2], [96, 58, 0.7]];
    for (const [x, y, a] of dedos) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let r = 4; r < 40; r += 4) {
      ctx.beginPath();
      ctx.arc(64, 84, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, false),
  paginas: (escrito) => tela(`paginas${escrito}`, 256, 128, (ctx, w, h) => {
    const rnd = semente(escrito ? 67 : 71);
    ctx.fillStyle = '#e9e0c8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(w / 2 - 2, 0, 4, h);
    ctx.strokeStyle = 'rgba(80,90,140,0.25)';
    for (let y = 16; y < h; y += 10) {
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
    if (!escrito) return;
    // rabiscos: espirais, palavras tortas e um rosto
    ctx.strokeStyle = 'rgba(20,10,10,0.9)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      let x = 14 + rnd() * (w - 40);
      let y = 14 + rnd() * (h - 30);
      ctx.moveTo(x, y);
      for (let i = 0; i < 14; i++) ctx.lineTo((x += (rnd() - 0.4) * 14), (y += (rnd() - 0.5) * 12));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(w * 0.75, h * 0.5, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,10,10,0.9)';
    ctx.fillRect(w * 0.75 - 10, h * 0.45, 5, 5);
    ctx.fillRect(w * 0.75 + 5, h * 0.45, 5, 5);
    ctx.font = 'bold 18px serif';
    ctx.fillText('MORTE', 20, h - 18);
  }, false),
  // retratos assustadores (a pessoa sem rosto, olhos riscados)
  retrato: (k) => tela(`retrato${k}`, 256, 320, (ctx, w, h) => {
    const rnd = semente(100 + k);
    const fundo = ['#3b2f2a', '#2d3436', '#3a2e3d', '#2f3b2f'][k % 4];
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, h * 0.7);
    g.addColorStop(0, '#6b5a4a');
    g.addColorStop(1, fundo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (k % 3 === 2) {
      // paisagem: casa no morro e a lua
      ctx.fillStyle = '#1b1d22';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w / 2, h * 0.45, w, h);
      ctx.fill();
      ctx.fillRect(w * 0.42, h * 0.5, 50, 40);
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.5);
      ctx.lineTo(w * 0.42 + 25, h * 0.4);
      ctx.lineTo(w * 0.42 + 54, h * 0.5);
      ctx.fill();
      ctx.fillStyle = '#d9d2b8';
      ctx.beginPath();
      ctx.arc(w * 0.75, h * 0.2, 18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#16120f';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.95, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ['#b9a58f', '#a88f78', '#c9b8a0'][k % 3];
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.38, 46, 60, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a120c';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.28, 52, 34, 0, Math.PI, 0);
      ctx.fill();
      // olhos: buracos pretos (ou riscados)
      ctx.fillStyle = '#000';
      if (k % 2) {
        ctx.fillRect(w / 2 - 30, h * 0.36, 22, 6);
        ctx.fillRect(w / 2 + 8, h * 0.36, 22, 6);
      } else {
        ctx.beginPath();
        ctx.ellipse(w / 2 - 18, h * 0.37, 9, 11, 0, 0, Math.PI * 2);
        ctx.ellipse(w / 2 + 18, h * 0.37, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3a1a14';
      ctx.fillRect(w / 2 - 12, h * 0.48, 24, 4);
    }
    sujeira(ctx, w, h, 2500, 0.1, rnd);
    manchas(ctx, w, h, 4, 'rgba(0,0,0,0.3)', rnd);
  }, false),
  lua: () => tela('lua', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.42, 'rgba(240,236,220,1)');
    g.addColorStop(0.5, 'rgba(200,210,255,0.35)');
    g.addColorStop(1, 'rgba(120,140,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(160,160,150,0.35)';
    for (const [x, y, r] of [[52, 50, 8], [74, 70, 10], [60, 80, 5], [80, 48, 4]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, false),
  brilho: () => tela('brilho', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false),
  fumaca: () => tela('fumaca', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(220,220,220,0.5)');
    g.addColorStop(1, 'rgba(220,220,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false),
};

// ------------------------------------------------------------------ estilos das casas
// piso e parede por tipo de cômodo, a fachada e o telhado
function estiloDe(estilo) {
  const T = TEXTURAS;
  const base = {
    casa: {
      piso: { padrao: T.madeira('#7a5638', '#5a3c24'), cozinha: T.ladrilho('#c9c3ad', '#6e6a5e', 4), banheiro: T.ladrilho('#b9c9c9', '#5f6b6b', 6), quarto: T.carpete('#5a4a3a'), bebe: T.carpete('#6b5a6e') },
      parede: { padrao: T.papel('#8c8468', '#7a7258', 'listras'), cozinha: T.meiaParede('#d9d4c0', '#a59a76'), banheiro: T.meiaParede('#a9c4c4', '#8d9a8c'), quarto: T.papel('#7c6c5a', '#6d5d4b', 'flores'), bebe: T.papel('#8a7c86', '#a08c98', 'flores') },
      fachada: T.tabuas('#7d8278'), telhado: T.telhas('#3b2a24'), rodape: 0x3a2a1c, porta: 0x5a3a22, portaRua: 0x5c1f1f, telhadoTipo: 'duas',
    },
    sitio: {
      piso: { padrao: T.madeira('#8a6a44', '#5c4528'), cozinha: T.ladrilho('#9c5a3c', '#4a2c20', 4), banheiro: T.ladrilho('#cfd4c8', '#6a6e64', 6), deposito: T.concreto('#6e6656'), lavanderia: T.concreto('#77705f') },
      parede: { padrao: T.reboco('#b9ae8f'), cozinha: T.meiaParede('#e0d9c0', '#b3a37a'), banheiro: T.meiaParede('#c3d1c3', '#aaa98d'), deposito: T.reboco('#8e8670'), quarto: T.papel('#8f8466', '#7a6e52', 'flores') },
      fachada: T.reboco('#b9a77f'), telhado: T.telhas('#6b2e22'), rodape: 0x4a3420, porta: 0x6b4a2a, portaRua: 0x2f4a2a, telhadoTipo: 'duas',
    },
    escola: {
      piso: { padrao: T.xadrez('#bdb59c', '#4a4a44'), banheiro: T.ladrilho('#c6c6bc', '#5b5b55', 8), cozinha: T.ladrilho('#c6c6bc', '#5b5b55', 6), biblioteca: T.madeira('#7a5a3a', '#523a24') },
      parede: { padrao: T.meiaParede('#5f7f7a', '#c9c2a6'), banheiro: T.meiaParede('#b6c6c6', '#c2c2b0'), biblioteca: T.papel('#6e6a52', '#625e46', 'listras') },
      fachada: T.tijolo('#8a4430'), telhado: T.concreto('#3b3b38'), rodape: 0x2b2b28, porta: 0x7a5a3a, portaRua: 0x2b4a6b, telhadoTipo: 'plano',
    },
    hospicio: {
      piso: { padrao: T.xadrez('#b9b7a6', '#3d4a44'), cela: T.concreto('#6f726b'), banheiro: T.ladrilho('#aab7ad', '#4f5750', 8), necroterio: T.ladrilho('#aab0b0', '#50585a', 6), cozinha: T.ladrilho('#b0ab98', '#55524a', 6), escritorio: T.madeira('#5e4630', '#40301f') },
      parede: { padrao: T.meiaParede('#7f9a8a', '#bdb9a2'), cela: T.concreto('#8c8a80'), escritorio: T.papel('#6e5e4a', '#5f4f3d', 'damasco'), necroterio: T.meiaParede('#b8c4c4', '#a4aaa0') },
      fachada: T.tijolo('#6e5a4c'), telhado: T.concreto('#2f302d'), rodape: 0x2a2e2a, porta: 0x55605a, portaRua: 0x3a3a3a, telhadoTipo: 'plano',
    },
    mansao: {
      piso: { padrao: T.madeira('#5a3a26', '#3a2416'), cozinha: T.xadrez('#d8d2c0', '#2a2a2a'), banheiro: T.ladrilho('#d8d4c8', '#7a756a', 6), capela: T.ladrilho('#8a8478', '#4a453c', 3), quarto: T.carpete('#4a1c1c'), hall: T.xadrez('#d8d2c0', '#2a2a2a') },
      parede: { padrao: T.papel('#4a1f22', '#5e2a2c', 'damasco'), biblioteca: T.papel('#26382a', '#304634', 'damasco'), cozinha: T.meiaParede('#d8d4c8', '#9a9078'), banheiro: T.meiaParede('#d8d4c8', '#7e8a7a'), capela: T.reboco('#8c8474'), quarto: T.papel('#3a2a40', '#4a3652', 'damasco') },
      fachada: T.tijolo('#5a4038'), telhado: T.telhas('#26262e'), rodape: 0x24160e, porta: 0x3a2214, portaRua: 0x1c1c22, telhadoTipo: 'duas',
    },
  };
  return base[estilo] || base.casa;
}

// uma caixa com UV em metros (tam: quantos metros a textura cobre), continuando de (u0, v0)
function caixa(w, h, d, x, y, z, tam = 2, u0 = 0, v0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0] + u0) / tam, (uv.getY(i) * dims[f][1] + v0) / tam);
    }
  }
  g.translate(x, y, z);
  return g;
}

// peça colorida para os móveis (todos num desenho só, com a cor no vértice)
function pintar(geo, cor) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  _c.set(cor);
  for (let i = 0; i < n; i++) c.set([_c.r, _c.g, _c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const bx = (w, h, d, x, y, z, cor) => pintar(new THREE.BoxGeometry(w, h, d).translate(x, y, z), cor);
const cil = (rt, rb, h, x, y, z, cor, seg = 12) => pintar(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), cor);
const esf = (r, x, y, z, cor) => pintar(new THREE.SphereGeometry(r, 10, 8).translate(x, y, z), cor);
// as mesmas, giradas antes de ir para o lugar
const bxR = (w, h, d, x, y, z, cor, rx = 0, ry = 0, rz = 0) => pintar(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z), cor);
const cilR = (rt, rb, h, x, y, z, cor, seg = 12, rx = 0, rz = 0) => pintar(new THREE.CylinderGeometry(rt, rb, h, seg).rotateX(rx).rotateZ(rz).translate(x, y, z), cor);
function juntar(lista) {
  if (!lista.length) return null;
  // tudo indexado e com os mesmos atributos (posição, normal, uv, cor)
  return mergeGeometries(lista.map((g) => (g.index ? g : g)), false);
}

// ------------------------------------------------------------------ os móveis (desenho de cada tipo)
// Local: centro do chão do móvel, de frente para +z (as costas em -z). Devolve as peças.
const MADEIRAS = [0x5a3a22, 0x6b4a2a, 0x4a2e1a, 0x7a5636, 0x3a2416];
const TECIDOS = [0x5b2a2a, 0x2f3d4a, 0x4a4a2f, 0x3d2f4a, 0x6b5a3a, 0x2f4a3a];
function desenharMovel(m, rnd, est) {
  const w = m.w;
  const d = m.d;
  const h = m.h;
  const mad = MADEIRAS[Math.floor(rnd() * MADEIRAS.length)];
  const tec = TECIDOS[Math.floor(rnd() * TECIDOS.length)];
  const P = [];
  const metal = 0x8a8f94;
  const branco = 0xd8d4c8;
  switch (m.t) {
    case 'cama':
    case 'camaSolteiro':
    case 'cama_cela': {
      const cela = m.t === 'cama_cela';
      const quadro = cela ? metal : mad;
      P.push(bx(w, 0.25, d, 0, 0.2, 0, quadro));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(bx(0.07, 0.2, 0.07, (sx * (w - 0.07)) / 2, 0.1, (sz * (d - 0.07)) / 2, quadro));
      P.push(bx(w - 0.08, 0.18, d - 0.08, 0, 0.41, 0, cela ? 0x8a8576 : 0xcfc8b8));
      if (!cela) {
        P.push(bx(w, 1.05, 0.08, 0, 0.52, -d / 2 + 0.04, quadro));
        P.push(bx(w * 0.9, 0.06, d * 0.62, 0, 0.52, d * 0.18, tec));
        P.push(bx(w * 0.92, 0.3, 0.04, 0, 0.36, d / 2 - 0.02, tec));
        const nTrav = w > 1.2 ? 2 : 1;
        for (let i = 0; i < nTrav; i++) P.push(bx(w / nTrav - 0.12, 0.12, 0.4, (i - (nTrav - 1) / 2) * (w / nTrav), 0.56, -d / 2 + 0.32, 0xe0dccf));
      } else {
        P.push(bx(w * 0.9, 0.04, d * 0.5, 0, 0.51, d * 0.2, 0x5a5648));
      }
      break;
    }
    case 'berco': {
      P.push(bx(w, 0.06, d, 0, 0.45, 0, 0xd8d0c0));
      P.push(bx(w - 0.08, 0.1, d - 0.08, 0, 0.53, 0, 0xe8e4d8));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(bx(0.05, 1.0, 0.05, (sx * (w - 0.05)) / 2, 0.5, (sz * (d - 0.05)) / 2, 0xd8d0c0));
      for (let i = 0; i < 9; i++) {
        const x = -w / 2 + (i + 0.5) * (w / 9);
        P.push(bx(0.02, 0.45, 0.02, x, 0.72, d / 2 - 0.02, 0xd8d0c0), bx(0.02, 0.45, 0.02, x, 0.72, -d / 2 + 0.02, 0xd8d0c0));
      }
      for (let i = 0; i < 13; i++) {
        const z = -d / 2 + (i + 0.5) * (d / 13);
        P.push(bx(0.02, 0.45, 0.02, w / 2 - 0.02, 0.72, z, 0xd8d0c0), bx(0.02, 0.45, 0.02, -w / 2 + 0.02, 0.72, z, 0xd8d0c0));
      }
      P.push(bx(w, 0.04, 0.04, 0, 0.98, d / 2 - 0.02, 0xd8d0c0), bx(w, 0.04, 0.04, 0, 0.98, -d / 2 + 0.02, 0xd8d0c0));
      // o móbile parado em cima
      P.push(cil(0.01, 0.01, 0.6, 0, 1.3, 0, 0x777777), cil(0.18, 0.18, 0.02, 0, 1.6, 0, 0x777777, 16));
      break;
    }
    case 'guardaRoupa':
    case 'armario': {
      const loja = est === 'escola' || est === 'hospicio';
      const cor = m.t === 'armario' && loja ? [0x5f7268, 0x6a6f5a, 0x55606b][Math.floor(rnd() * 3)] : mad;
      P.push(bx(w, h, d, 0, h / 2, 0, cor));
      if (m.t === 'armario' && loja) {
        for (let i = 0; i < 4; i++) P.push(bx(w * 0.6, 0.015, 0.01, 0, h * 0.82 + i * 0.04, d / 2 + 0.005, 0x2a2e2a));
        P.push(bx(0.04, 0.16, 0.03, w * 0.32, h * 0.5, d / 2 + 0.015, 0x999999));
        P.push(bx(0.01, h * 0.96, 0.01, 0, h / 2, d / 2 + 0.005, 0x2a2e2a));
      } else {
        P.push(bx(0.015, h * 0.94, 0.012, 0, h / 2, d / 2 + 0.006, 0x1f140c));
        P.push(bx(0.03, 0.22, 0.03, -0.06, h * 0.52, d / 2 + 0.02, 0xb8a060), bx(0.03, 0.22, 0.03, 0.06, h * 0.52, d / 2 + 0.02, 0xb8a060));
        P.push(bx(w + 0.06, 0.06, d + 0.04, 0, h + 0.03, 0, cor));
      }
      break;
    }
    case 'comoda':
    case 'criado': {
      P.push(bx(w, h, d, 0, h / 2, 0, mad));
      const n = m.t === 'comoda' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const y = h * ((i + 0.5) / n);
        P.push(bx(w * 0.9, 0.012, 0.01, 0, y + h / n / 2 - 0.01, d / 2 + 0.005, 0x1f140c));
        P.push(esf(0.025, -w * 0.2, y, d / 2 + 0.02, 0xb8a060), esf(0.025, w * 0.2, y, d / 2 + 0.02, 0xb8a060));
      }
      if (m.t === 'criado') {
        // abajur
        P.push(cil(0.08, 0.1, 0.04, 0, h + 0.02, 0, 0x3a3a3a), cil(0.015, 0.015, 0.3, 0, h + 0.18, 0, 0x8a7a5a));
        P.push(cil(0.09, 0.16, 0.2, 0, h + 0.38, 0, 0xc8b89a, 14));
      }
      break;
    }
    case 'sofa':
    case 'poltrona': {
      P.push(bx(w, 0.38, d, 0, 0.19, 0, tec));
      P.push(bx(w, 0.5, 0.22, 0, 0.6, -d / 2 + 0.11, tec));
      P.push(bx(0.16, 0.25, d, -w / 2 + 0.08, 0.5, 0, tec), bx(0.16, 0.25, d, w / 2 - 0.08, 0.5, 0, tec));
      const n = m.t === 'sofa' ? 3 : 1;
      _c.set(tec).multiplyScalar(1.15);
      const almofada = _c.getHex();
      for (let i = 0; i < n; i++) P.push(bx((w - 0.36) / n - 0.03, 0.14, d - 0.3, -w / 2 + 0.18 + ((i + 0.5) * (w - 0.36)) / n, 0.45, 0.06, almofada));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(bx(0.06, 0.08, 0.06, (sx * (w - 0.1)) / 2, 0.02, (sz * (d - 0.1)) / 2, 0x1a1008));
      break;
    }
    case 'mesaCentro':
    case 'mesa':
    case 'mesaLonga':
    case 'escrivaninha': {
      P.push(bx(w, 0.05, d, 0, h - 0.025, 0, mad));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(bx(0.06, h - 0.05, 0.06, (sx * (w - 0.12)) / 2, (h - 0.05) / 2, (sz * (d - 0.12)) / 2, mad));
      if (m.t === 'escrivaninha') {
        P.push(bx(0.45, h - 0.05, d - 0.06, w / 2 - 0.25, (h - 0.05) / 2, 0, mad));
        for (let i = 0; i < 3; i++) P.push(esf(0.02, w / 2 - 0.25, 0.15 + i * 0.2, d / 2 - 0.01, 0xb8a060));
        // papéis e a cadeira
        P.push(bx(0.3, 0.01, 0.22, -0.2, h + 0.005, 0.05, 0xe8e2cf), bx(0.25, 0.01, 0.3, 0.05, h + 0.01, -0.05, 0xd8d0b8));
        cadeira(P, 0, d / 2 + 0.35, Math.PI, mad);
      }
      if (m.t === 'mesa' || m.t === 'mesaLonga') {
        const n = m.t === 'mesa' ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + ((i + 0.5) * w) / n;
          cadeira(P, x, -d / 2 - 0.35, 0, mad);
          cadeira(P, x, d / 2 + 0.35, Math.PI, mad);
        }
        if (m.t === 'mesaLonga' && est === 'mansao') {
          // castiçal no meio
          P.push(cil(0.08, 0.1, 0.04, 0, h + 0.02, 0, 0x8a7a40), cil(0.015, 0.02, 0.35, 0, h + 0.2, 0, 0x8a7a40));
          for (const s of [-1, 1]) P.push(cil(0.02, 0.02, 0.18, s * 0.14, h + 0.33, 0, 0xe8e2cf), bx(0.3, 0.015, 0.015, 0, h + 0.24, 0, 0x8a7a40));
        }
      }
      break;
    }
    case 'estante':
    case 'prateleira': {
      const cor = m.t === 'prateleira' ? 0x6a6e70 : mad;
      P.push(bx(0.04, h, d, -w / 2 + 0.02, h / 2, 0, cor), bx(0.04, h, d, w / 2 - 0.02, h / 2, 0, cor));
      if (m.t === 'estante') P.push(bx(w, h, 0.02, 0, h / 2, -d / 2 + 0.01, cor));
      const prat = [0.02, 0.4, 0.93, 1.43, h - 0.02];
      for (const y of prat) P.push(bx(w, 0.03, d, 0, y, 0, cor));
      // livros (ou caixas e potes)
      for (let p = 0; p < prat.length - 1; p++) {
        let x = -w / 2 + 0.06;
        while (x < w / 2 - 0.12) {
          if (rnd() < 0.15) {
            x += 0.12 + rnd() * 0.2;
            continue;
          }
          const bw = m.t === 'estante' ? 0.03 + rnd() * 0.04 : 0.12 + rnd() * 0.12;
          const bh = m.t === 'estante' ? 0.18 + rnd() * 0.14 : 0.1 + rnd() * 0.2;
          const cor2 = m.t === 'estante' ? [0x6b1f1f, 0x1f3b6b, 0x2f5a2a, 0x6b5a1f, 0x3a2a4a, 0x5a3a22, 0x777060][Math.floor(rnd() * 7)] : [0x8a7a5a, 0x9a8a6a, 0x5a6a7a, 0x7a5a4a][Math.floor(rnd() * 4)];
          P.push(bx(bw, bh, d * 0.75, x + bw / 2, prat[p] + 0.015 + bh / 2, 0, cor2));
          x += bw + 0.005;
        }
      }
      break;
    }
    case 'tv': {
      P.push(bx(w, 0.5, d, 0, 0.25, 0, mad));
      P.push(bx(0.9, 0.62, 0.35, 0, 0.82, -0.02, 0x2a2a2a));
      P.push(bx(0.72, 0.5, 0.02, -0.06, 0.84, 0.16, 0x0e1012));
      for (let i = 0; i < 3; i++) P.push(cilR(0.02, 0.02, 0.02, 0.36, 0.95 - i * 0.08, 0.16, 0x777777, 12, Math.PI / 2));
      P.push(cilR(0.005, 0.005, 0.5, -0.15, 1.35, -0.05, 0x999999, 6, 0, 0.4), cilR(0.005, 0.005, 0.5, 0.15, 1.35, -0.05, 0x999999, 6, 0, -0.4));
      break;
    }
    case 'balcao':
    case 'balcaoRecepcao': {
      P.push(bx(w, h - 0.04, d, 0, (h - 0.04) / 2, 0, m.t === 'balcao' ? 0xcfc8b4 : mad));
      P.push(bx(w + 0.04, 0.04, d + 0.04, 0, h - 0.02, 0, m.t === 'balcao' ? 0x3a3a3a : 0x2a1a10));
      const n = Math.floor(w / 0.6);
      for (let i = 1; i < n; i++) P.push(bx(0.01, h - 0.15, 0.01, -w / 2 + (i * w) / n, (h - 0.04) / 2, d / 2 + 0.005, 0x55524a));
      if (m.t === 'balcaoRecepcao') P.push(bx(0.5, 0.35, 0.4, 0.6, h + 0.18, -0.1, 0xd8d4c8), bx(0.4, 0.02, 0.15, 0.6, h + 0.01, 0.15, 0x3a3a3a));
      break;
    }
    case 'geladeira':
      P.push(bx(w, h, d, 0, h / 2, 0, 0xd8d4c8));
      P.push(bx(w * 0.98, 0.01, 0.01, 0, h * 0.68, d / 2 + 0.005, 0x777777));
      P.push(bx(0.03, 0.4, 0.04, w * 0.38, h * 0.82, d / 2 + 0.02, 0x999999), bx(0.03, 0.4, 0.04, w * 0.38, h * 0.45, d / 2 + 0.02, 0x999999));
      break;
    case 'fogao':
      P.push(bx(w, h, d, 0, h / 2, 0, 0xd8d4c8));
      P.push(bx(w * 0.85, h * 0.5, 0.01, 0, h * 0.4, d / 2 + 0.005, 0x1a1a1a));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(cil(0.09, 0.09, 0.02, sx * 0.18, h + 0.01, sz * 0.15, 0x1a1a1a, 14));
      P.push(bx(w, 0.12, 0.05, 0, h + 0.06, -d / 2 + 0.025, 0xd8d4c8));
      break;
    case 'pia': {
      P.push(bx(w, h - 0.05, d, 0, (h - 0.05) / 2, 0, m.t === 'pia' && est === 'hospicio' ? 0xbfc4c0 : 0xd8d4c8));
      P.push(bx(w, 0.05, d, 0, h - 0.025, 0, 0xe8e4d8), bx(w * 0.7, 0.03, d * 0.6, 0, h + 0.003, 0.02, 0x7a7e80));
      P.push(cil(0.015, 0.015, 0.25, 0, h + 0.12, -d / 2 + 0.06, 0xaaaaaa), bx(0.03, 0.03, 0.15, 0, h + 0.24, -d / 2 + 0.12, 0xaaaaaa));
      break;
    }
    case 'vaso':
      P.push(cil(0.14, 0.11, 0.38, 0, 0.19, 0.08, 0xe8e4d8, 14), cil(0.2, 0.17, 0.08, 0, 0.42, 0.1, 0xe8e4d8, 14));
      P.push(bx(0.42, 0.38, 0.17, 0, 0.62, -d / 2 + 0.09, 0xe8e4d8));
      break;
    case 'banheira':
      P.push(bx(w, h, d, 0, h / 2, 0, 0xe8e4d8));
      P.push(bx(w - 0.14, 0.02, d - 0.14, 0, h - 0.01, 0, 0x8a8e88));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(esf(0.06, (sx * (w - 0.14)) / 2, 0.04, (sz * (d - 0.14)) / 2, 0xb8a060));
      P.push(cil(0.015, 0.015, 0.4, 0, h + 0.2, -d / 2 + 0.06, 0xaaaaaa));
      break;
    case 'maquina':
      P.push(bx(w, h, d, 0, h / 2, 0, 0xd8d4c8));
      P.push(cilR(0.22, 0.22, 0.03, 0, h * 0.45, d / 2 + 0.01, 0x55606a, 20, Math.PI / 2));
      P.push(bx(w * 0.9, 0.08, 0.02, 0, h - 0.06, d / 2 + 0.01, 0x8a8a8a));
      break;
    case 'caixas':
      P.push(bx(0.6, 0.45, 0.5, -0.15, 0.225, 0, 0x8a6a44), bx(0.45, 0.35, 0.4, 0.22, 0.175, 0.1, 0x9a7a50), bx(0.45, 0.3, 0.38, -0.1, 0.6, -0.02, 0x7a5a38));
      break;
    case 'carteira':
      P.push(bx(0.6, 0.03, 0.42, 0, 0.72, 0.05, 0xb08a5a), cil(0.015, 0.015, 0.7, -0.25, 0.36, 0.05, metal, 6), cil(0.015, 0.015, 0.7, 0.25, 0.36, 0.05, metal, 6));
      cadeira(P, 0, -0.35, 0, 0x4a6a8a, 0.42);
      break;
    case 'lousa':
      P.push(bx(w, h, d * 0.6, 0, h / 2, 0, 0x1f3a2a));
      P.push(bx(w + 0.1, 0.06, d, 0, h + 0.03, 0, 0x6b4a2a), bx(w + 0.1, 0.06, d, 0, -0.03, 0, 0x6b4a2a));
      P.push(bx(0.06, h, d, -w / 2 - 0.03, h / 2, 0, 0x6b4a2a), bx(0.06, h, d, w / 2 + 0.03, h / 2, 0, 0x6b4a2a));
      P.push(bx(w, 0.03, 0.08, 0, -0.02, 0.06, 0x6b4a2a));
      // giz: letras e um desenho torto
      for (let i = 0; i < 9; i++) P.push(bx(0.15 + rnd() * 0.25, 0.015, 0.005, -w / 2 + 0.3 + rnd() * (w - 0.8), 0.25 + rnd() * (h - 0.4), d * 0.31, 0xc8c8c0));
      break;
    case 'maca':
    case 'macaNecro': {
      const necro = m.t === 'macaNecro';
      P.push(bx(w, 0.06, d, 0, h - 0.03, 0, necro ? 0xa8acb0 : metal));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(cil(0.02, 0.02, h - 0.06, (sx * (w - 0.08)) / 2, (h - 0.06) / 2, (sz * (d - 0.08)) / 2, metal, 6));
      if (necro) {
        // o lençol em cima de alguém
        P.push(bx(w * 0.7, 0.2, d * 0.85, 0, h + 0.1, 0, 0xcfcfc4), esf(0.14, 0, h + 0.18, -d * 0.36, 0xcfcfc4), bx(0.25, 0.1, 0.1, 0, h + 0.05, d * 0.45, 0xcfcfc4));
      } else {
        P.push(bx(w - 0.06, 0.12, d - 0.06, 0, h + 0.06, 0, 0xd8d4c8), bx(w - 0.2, 0.1, 0.35, 0, h + 0.16, -d / 2 + 0.25, 0xe8e4d8));
        P.push(bx(w, 0.35, 0.04, 0, h + 0.2, -d / 2, metal));
        // as correias
        P.push(bx(w + 0.02, 0.02, 0.08, 0, h + 0.13, 0.1, 0x5a3a22), bx(w + 0.02, 0.02, 0.08, 0, h + 0.13, 0.6, 0x5a3a22));
      }
      break;
    }
    case 'gavetaNecro':
      P.push(bx(w, h, d, 0, h / 2, 0, 0xa8acb0));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        P.push(bx(w / 3 - 0.06, h / 3 - 0.06, 0.02, -w / 3 + i * (w / 3), h / 6 + j * (h / 3), d / 2 + 0.01, 0x8a8e92));
        P.push(bx(0.12, 0.03, 0.04, -w / 3 + i * (w / 3), h / 6 + j * (h / 3) + 0.1, d / 2 + 0.03, 0x5a5e62));
      }
      break;
    case 'cadeiraRodas':
      P.push(bx(0.5, 0.06, 0.45, 0, 0.5, 0, 0x2a2a2a), bx(0.5, 0.45, 0.04, 0, 0.75, -0.22, 0x2a2a2a));
      for (const s of [-1, 1]) {
        P.push(pintar(new THREE.TorusGeometry(0.3, 0.025, 6, 20).rotateY(Math.PI / 2).translate(s * 0.3, 0.32, 0), metal));
        P.push(cilR(0.06, 0.06, 0.03, s * 0.2, 0.06, 0.32, 0x2a2a2a, 10, 0, Math.PI / 2));
      }
      break;
    case 'piano': {
      P.push(bx(w, 0.4, d, 0, 0.75, 0, 0x0e0c0c));
      P.push(bxR(w, 0.03, d * 0.9, 0, 1.3, -0.15, 0x0e0c0c, -0.5));
      for (const [x, z] of [[-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1], [0, -d / 2 + 0.1]]) P.push(cil(0.05, 0.04, 0.55, x, 0.28, z, 0x0e0c0c));
      P.push(bx(w * 0.92, 0.04, 0.18, 0, 0.82, d / 2 + 0.06, 0xe8e4d8));
      for (let i = 0; i < 18; i++) P.push(bx(0.025, 0.03, 0.1, -w * 0.44 + i * (w * 0.88 / 18), 0.85, d / 2 + 0.03, 0x0a0a0a));
      // banquinho
      P.push(bx(0.6, 0.06, 0.32, 0, 0.5, d / 2 + 0.55, 0x0e0c0c), bx(0.05, 0.47, 0.05, -0.25, 0.24, d / 2 + 0.55, 0x0e0c0c), bx(0.05, 0.47, 0.05, 0.25, 0.24, d / 2 + 0.55, 0x0e0c0c));
      break;
    }
    case 'banco':
      P.push(bx(w, 0.05, d * 0.7, 0, 0.45, 0.06, mad), bx(w, 0.5, 0.05, 0, 0.75, -d / 2 + 0.05, mad));
      P.push(bx(0.06, 0.9, d, -w / 2 + 0.03, 0.45, 0, mad), bx(0.06, 0.9, d, w / 2 - 0.03, 0.45, 0, mad));
      break;
    case 'altar':
      P.push(bx(w, h - 0.05, d, 0, (h - 0.05) / 2, 0, 0x6b4a2a), bx(w + 0.1, 0.05, d + 0.1, 0, h - 0.025, 0, 0xe8e2cf));
      P.push(bx(w * 0.4, 0.5, 0.02, 0, h * 0.5, d / 2 + 0.06, 0x6b1f1f));
      for (const s of [-1, 1]) P.push(cil(0.04, 0.05, 0.3, s * 0.7, h + 0.15, 0, 0xe8e2cf), cil(0.06, 0.07, 0.04, s * 0.7, h + 0.02, 0, 0x8a7a40));
      P.push(bx(0.06, 0.8, 0.04, 0, h + 0.4, -0.2, 0x8a7a40), bx(0.4, 0.06, 0.04, 0, h + 0.55, -0.2, 0x8a7a40));
      break;
    case 'relogio':
      P.push(bx(w, h, d, 0, h / 2, 0, mad));
      P.push(cilR(0.2, 0.2, 0.02, 0, h - 0.4, d / 2 + 0.005, 0xe8e2cf, 20, Math.PI / 2));
      P.push(bx(0.3, 0.9, 0.01, 0, 0.75, d / 2 + 0.005, 0x1a1208), cilR(0.07, 0.07, 0.01, 0, 0.45, d / 2 + 0.012, 0xb8a060, 14, Math.PI / 2));
      P.push(bx(w + 0.08, 0.08, d + 0.06, 0, h, 0, mad));
      break;
    case 'lareira':
      P.push(bx(w, h, d, 0, h / 2, 0, 0x6a645a), bx(w * 0.6, h * 0.55, 0.02, 0, h * 0.28, d / 2 + 0.005, 0x0a0806));
      P.push(bx(w + 0.2, 0.08, d + 0.12, 0, h, 0, 0x3a2416));
      break;
    case 'boneca':
      P.push(cil(0.07, 0.11, 0.18, 0, 0.09, 0, 0x7a2a3a), esf(0.065, 0, 0.25, 0, 0xe8d0b8), esf(0.07, 0, 0.27, -0.01, 0x3a2414));
      P.push(esf(0.012, -0.022, 0.26, 0.058, 0x050505), esf(0.012, 0.022, 0.26, 0.058, 0x050505));
      P.push(cilR(0.02, 0.02, 0.12, -0.09, 0.12, 0, 0xe8d0b8, 8, 0, 0.4), cilR(0.02, 0.02, 0.12, 0.09, 0.12, 0, 0xe8d0b8, 8, 0, -0.4));
      break;
    default:
      if (!['quadro', 'espelho', 'tapete'].includes(m.t)) P.push(bx(w, h, d, 0, h / 2, 0, mad));
  }
  return P;
}

function cadeira(P, x, z, giro, cor, alt = 0.45) {
  const g = [];
  g.push(bx(0.42, 0.04, 0.42, 0, alt, 0, cor), bx(0.42, 0.45, 0.04, 0, alt + 0.24, -0.19, cor));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(bx(0.035, alt, 0.035, sx * 0.18, alt / 2, sz * 0.18, cor));
  for (const p of g) P.push(p.rotateY(giro).translate(x, 0, z));
}

// ------------------------------------------------------------------ os objetos soltos
const OBJ_GEO = {
  livro: () => new THREE.BoxGeometry(0.16, 0.04, 0.22).translate(0, 0.02, 0),
  copo: () => new THREE.CylinderGeometry(0.035, 0.03, 0.1, 10).translate(0, 0.05, 0),
  garrafa: () => mergeGeometries([new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10).translate(0, 0.1, 0), new THREE.CylinderGeometry(0.014, 0.03, 0.1, 8).translate(0, 0.25, 0)]),
  prato: () => new THREE.CylinderGeometry(0.11, 0.08, 0.02, 16).translate(0, 0.01, 0),
  caixinha: () => new THREE.BoxGeometry(0.14, 0.1, 0.1).translate(0, 0.05, 0),
  vela: () => new THREE.CylinderGeometry(0.025, 0.025, 0.15, 8).translate(0, 0.075, 0),
  xicara: () => mergeGeometries([new THREE.CylinderGeometry(0.04, 0.032, 0.07, 10).translate(0, 0.035, 0), new THREE.TorusGeometry(0.022, 0.006, 4, 8).translate(0.045, 0.04, 0)]),
  lata: () => new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10).translate(0, 0.06, 0),
};
const OBJ_COR = { livro: [0x6b1f1f, 0x1f3b6b, 0x2f5a2a, 0x5a4a2a], copo: [0xc8d8e0], garrafa: [0x2f5a2a, 0x5a3a1f], prato: [0xe8e4d8], caixinha: [0x6b4a2a, 0x3a2a4a], vela: [0xe8e2cf], xicara: [0xe8e4d8, 0x8a2a2a], lata: [0xa0a0a0, 0x8a2a2a] };

// ------------------------------------------------------------------ a casa
export class Casa3D {
  constructor(world, C) {
    this.world = world;
    this.C = C;
    this.E = estiloDe(C.estilo);
    this.grupo = new THREE.Group();
    this.grupo.name = `casa-${C.id}`;
    this.grupo.position.set(C.origem.x, C.origem.y, C.origem.z);
    this.grupo.visible = false;
    this.colisores = [];
    this.portas = []; // { def, pivo, folha, col, ang, alvo }
    this.luzes = []; // por cômodo: { grupo, luz, lampada, pisca }
    this.interruptores = []; // { def, alavanca, digital }
    this.ativa = false;
    this.rnd = semente(C.id.length * 977 + 13);
    this.digitais = [];
    this.montar();
    world.scene.add(this.grupo);
  }

  // um colisor em coordenadas da casa (guardado: só entra no mundo com a casa ativa)
  colisor(x0, y0, z0, x1, y1, z1, data = {}) {
    const o = this.C.origem;
    const c = this.world.addBox({ min: [x0 + o.x, y0 + o.y, z0 + o.z], max: [x1 + o.x, y1 + o.y, z1 + o.z], data });
    this.world.colliders.pop();
    this.colisores.push(c);
    return c;
  }

  montar() {
    const t0 = performance.now();
    this.montarCasa();
    this.montarMoveis();
    this.montarObjetos();
    this.montarLuzes();
    this.montarTerreno();
    this.montarVan();
    this.tempoMontar = performance.now() - t0;
  }

  material(chave, criar) {
    this.mats ||= new Map();
    if (!this.mats.has(chave)) this.mats.set(chave, criar());
    return this.mats.get(chave);
  }

  // ---------------------------------------------------------------- paredes, pisos, tetos, portas
  montarCasa() {
    const C = this.C;
    const E = this.E;
    const pe = C.pe;
    const porMat = new Map(); // material -> geometrias
    const add = (mat, geo) => {
      if (!porMat.has(mat)) porMat.set(mat, []);
      porMat.get(mat).push(geo);
    };
    const matTex = (tex, rough = 0.85, extra = {}) => this.material(tex.uuid, () => new THREE.MeshStandardMaterial({ map: tex, roughness: rough, ...extra }));
    const teto = matTex(TEXTURAS.reboco('#c9c2b0'), 0.95);
    const fachada = matTex(E.fachada, 0.9);
    const rodape = this.material('rodape', () => new THREE.MeshStandardMaterial({ color: E.rodape, roughness: 0.6 }));
    const batente = this.material('batente', () => new THREE.MeshStandardMaterial({ color: E.porta, roughness: 0.55, map: TEXTURAS.grao() }));
    const vidro = this.material('vidro', () => new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.35, depthWrite: false }));
    this.vidroMat = vidro;
    const L = C.limites;
    // o chão da casa (o terreno lá fora fica 31 cm abaixo)
    this.colisor(L.x0, -1, L.z0, L.x1, 0, L.z1, { type: 'floor' });
    for (const c of C.comodos) {
      const w = c.x1 - c.x0;
      const d = c.z1 - c.z0;
      const cx = (c.x0 + c.x1) / 2;
      const cz = (c.z0 + c.z1) / 2;
      const piso = matTex(E.piso[c.tipo] || E.piso.padrao, 0.75);
      const parede = matTex(E.parede[c.tipo] || E.parede.padrao, 0.9);
      add(piso, caixa(w, 0.1, d, cx, -0.05, cz, 2, c.x0, c.z0));
      add(teto, caixa(w, 0.1, d, cx, pe + 0.05, cz, 3));
      // as quatro paredes, com os vãos das portas e das janelas
      for (const lado of LADOS) {
        const Ld = linhaDoLado(c, lado);
        const fora = Math.abs(Ld.fixo - L[lado]) < 1e-6;
        const vaos = [
          ...c.aberturas[lado].map((a) => ({ s0: a.s - a.l / 2, s1: a.s + a.l / 2, y0: 0, y1: C.portas[a.porta].h, porta: true })),
          ...c.janelas[lado].map((j) => ({ s0: j.s - j.l / 2, s1: j.s + j.l / 2, y0: 0.95, y1: 2.1, janela: true })),
        ].sort((a, b) => a.s0 - b.s0);
        const espessura = PAREDE;
        const centro = Ld.fixo + (Ld.eixo === 'x' ? Ld.nz : Ld.nx) * (espessura / 2);
        const pedaco = (s0, s1, y0, y1, mat, esp = espessura, cen = centro) => {
          if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
          const sm = (s0 + s1) / 2;
          const geo = Ld.eixo === 'x'
            ? caixa(s1 - s0, y1 - y0, esp, sm, (y0 + y1) / 2, cen, 2, s0, y0)
            : caixa(esp, y1 - y0, s1 - s0, cen, (y0 + y1) / 2, sm, 2, s0, y0);
          add(mat, geo);
        };
        // parede de dentro
        let s = Ld.a;
        for (const v of vaos) {
          pedaco(s, v.s0, 0, pe, parede);
          pedaco(v.s0, v.s1, v.y1, pe, parede);
          if (v.janela) pedaco(v.s0, v.s1, 0, v.y0, parede);
          s = v.s1;
        }
        pedaco(s, Ld.b, 0, pe, parede);
        // rodapé
        s = Ld.a;
        const cenR = Ld.fixo + (Ld.eixo === 'x' ? Ld.nz : Ld.nx) * (espessura + 0.01);
        for (const v of vaos.filter((q) => q.porta)) {
          pedaco(s, v.s0, 0, 0.12, rodape, 0.02, cenR);
          s = v.s1;
        }
        pedaco(s, Ld.b, 0, 0.12, rodape, 0.02, cenR);
        // colisores: cada trecho entre portas, de cima a baixo (a janela não se atravessa)
        const n = Ld.eixo === 'x' ? Ld.nz : Ld.nx;
        const esp0 = fora ? -0.2 : 0;
        const a0 = Ld.fixo + n * esp0;
        const a1 = Ld.fixo + n * espessura;
        s = Ld.a;
        const portas = vaos.filter((q) => q.porta);
        for (const v of [...portas, { s0: Ld.b, s1: Ld.b }]) {
          if (v.s0 - s > 0.01) {
            if (Ld.eixo === 'x') this.colisor(s, 0, Math.min(a0, a1), v.s0, pe, Math.max(a0, a1));
            else this.colisor(Math.min(a0, a1), 0, s, Math.max(a0, a1), pe, v.s0);
          }
          if (v.porta) {
            // em cima da porta (para pular não passar)
            if (Ld.eixo === 'x') this.colisor(v.s0, v.y1, Math.min(a0, a1), v.s1, pe, Math.max(a0, a1));
            else this.colisor(Math.min(a0, a1), v.y1, v.s0, Math.max(a0, a1), pe, v.s1);
          }
          s = v.s1;
        }
        // por fora: a fachada, com os mesmos vãos
        if (fora) {
          const cenF = Ld.fixo - n * 0.08;
          s = Ld.a - (Ld.a === L[Ld.eixo === 'x' ? 'x0' : 'z0'] ? 0.16 : 0);
          const fim = Ld.b + (Ld.b === L[Ld.eixo === 'x' ? 'x1' : 'z1'] ? 0.16 : 0);
          for (const v of vaos) {
            pedaco(s, v.s0, -0.3, pe + 0.4, fachada, 0.16, cenF);
            pedaco(v.s0, v.s1, v.y1, pe + 0.4, fachada, 0.16, cenF);
            if (v.janela) pedaco(v.s0, v.s1, -0.3, v.y0, fachada, 0.16, cenF);
            s = v.s1;
          }
          pedaco(s, fim, -0.3, pe + 0.4, fachada, 0.16, cenF);
        }
        // as janelas: moldura, vidro e cortina
        for (const j of c.janelas[lado]) this.janela(Ld, j, fora, add, batente);
      }
    }
    // portas (o batente de cada lado e a folha que gira)
    for (const p of C.portas) this.montarPorta(p, add, batente);
    // telhado
    this.telhado(add);
    // degraus da entrada e a varandinha
    const e = C.entrada;
    const deg = matTex(TEXTURAS.concreto('#6a6a62'), 0.95);
    if (e.ladoA === 'z1') {
      add(deg, caixa(e.l + 2.4, 0.15, 1.6, e.x, -0.075, L.z1 + 0.95, 2));
      add(deg, caixa(e.l + 2.4, 0.15, 0.8, e.x, -0.225, L.z1 + 2.1, 2));
      this.colisor(e.x - e.l / 2 - 1.2, -0.3, L.z1 + 0.1, e.x + e.l / 2 + 1.2, 0, L.z1 + 1.75);
      // telhadinho da varanda com dois pilares
      add(rodape, caixa(e.l + 2.6, 0.12, 2.0, e.x, C.pe + 0.1, L.z1 + 1.0, 2));
      for (const s of [-1, 1]) {
        add(batente, caixa(0.14, C.pe + 0.05, 0.14, e.x + s * (e.l / 2 + 1.1), C.pe / 2, L.z1 + 1.85, 2));
        this.colisor(e.x + s * (e.l / 2 + 1.1) - 0.08, 0, L.z1 + 1.77, e.x + s * (e.l / 2 + 1.1) + 0.08, C.pe, L.z1 + 1.93);
      }
    }
    // tudo junto: uma malha por material
    for (const [mat, geos] of porMat) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = mat !== vidro;
      m.receiveShadow = true;
      if (mat === vidro) m.renderOrder = 2;
      this.grupo.add(m);
    }
  }

  janela(Ld, j, fora, add, batente) {
    const n = Ld.eixo === 'x' ? Ld.nz : Ld.nx;
    const s0 = j.s - j.l / 2;
    const s1 = j.s + j.l / 2;
    const y0 = 0.95;
    const y1 = 2.1;
    const meio = Ld.fixo + n * (PAREDE / 2) - (fora ? n * 0.04 : 0);
    const peca = (s, y, ls, ly, esp, cen) => (Ld.eixo === 'x' ? caixa(ls, ly, esp, s, y, cen, 1) : caixa(esp, ly, ls, cen, y, s, 1));
    // moldura
    add(batente, peca((s0 + s1) / 2, y0, j.l + 0.12, 0.06, PAREDE + 0.24, meio));
    add(batente, peca((s0 + s1) / 2, y1, j.l + 0.12, 0.06, PAREDE + 0.24, meio));
    add(batente, peca(s0, (y0 + y1) / 2, 0.06, y1 - y0, PAREDE + 0.24, meio));
    add(batente, peca(s1, (y0 + y1) / 2, 0.06, y1 - y0, PAREDE + 0.24, meio));
    add(batente, peca(j.s, (y0 + y1) / 2, 0.04, y1 - y0, 0.05, meio));
    add(batente, peca(j.s, (y0 + y1) / 2 + 0.1, j.l, 0.04, 0.05, meio));
    add(this.vidroMat, peca(j.s, (y0 + y1) / 2, j.l, y1 - y0, 0.01, meio));
    // cortina rasgada, de um lado só
    if (this.rnd() < 0.6) {
      const cor = TECIDOS[Math.floor(this.rnd() * TECIDOS.length)];
      const mat = this.material(`cortina${cor}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 1, side: THREE.DoubleSide }));
      const lado = this.rnd() < 0.5 ? s0 + 0.2 : s1 - 0.2;
      const cen = Ld.fixo + n * (PAREDE + 0.08);
      add(mat, peca(lado, (y0 + y1) / 2 + 0.2, 0.45, y1 - y0 + 0.6, 0.03, cen));
      add(batente, peca(j.s, y1 + 0.3, j.l + 0.5, 0.03, 0.03, cen));
    }
  }

  montarPorta(p, add, batente) {
    const C = this.C;
    const h = p.h;
    const esp = PAREDE * 2 + (p.rua ? 0.2 : 0.02);
    const s = p.eixo === 'x' ? p.x : p.z;
    const fixo = p.eixo === 'x' ? p.z : p.x;
    const meio = fixo - (p.rua ? 0.04 : 0) * (p.ladoA === 'z1' || p.ladoA === 'x1' ? -1 : 1);
    const peca = (ss, y, ls, ly, e) => (p.eixo === 'x' ? caixa(ls, ly, e, ss, y, meio, 1) : caixa(e, ly, ls, meio, y, ss));
    add(batente, peca(s - p.l / 2 - 0.04, h / 2, 0.08, h, esp));
    add(batente, peca(s + p.l / 2 + 0.04, h / 2, 0.08, h, esp));
    add(batente, peca(s, h + 0.04, p.l + 0.16, 0.08, esp));
    if (p.semPorta) {
      this.portas.push(null);
      return;
    }
    // a folha gira na dobradiça (começo do vão)
    const cor = p.rua ? this.E.portaRua : this.E.porta;
    const matFolha = this.material(`folha${cor}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, map: TEXTURAS.grao() }));
    const lw = p.l - 0.02;
    const geo = [
      bx(lw, h - 0.02, 0.045, lw / 2, (h - 0.02) / 2, 0, 0xffffff),
      // almofadas da porta
      bx(lw * 0.7, h * 0.32, 0.06, lw / 2, h * 0.72, 0, 0xd8d8d8),
      bx(lw * 0.7, h * 0.32, 0.06, lw / 2, h * 0.3, 0, 0xd8d8d8),
    ];
    const folha = new THREE.Mesh(juntar(geo), matFolha.clone());
    folha.material.vertexColors = true;
    folha.castShadow = true;
    folha.receiveShadow = true;
    const macaneta = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), this.material('latao', () => new THREE.MeshStandardMaterial({ color: 0xb8a060, metalness: 0.8, roughness: 0.3 })));
    macaneta.position.set(lw - 0.08, 1.0, 0);
    macaneta.scale.set(1, 1, 2.6);
    folha.add(macaneta);
    const pivo = new THREE.Group();
    // eixo x: a porta corre em x; a dobradiça fica em s - l/2
    if (p.eixo === 'x') pivo.position.set(s - p.l / 2 + 0.01, 0, fixo);
    else {
      pivo.position.set(fixo, 0, s - p.l / 2 + 0.01);
      folha.rotation.y = -Math.PI / 2;
    }
    pivo.add(folha);
    this.grupo.add(pivo);
    // abre para o lado do cômodo b (a da rua, para dentro)
    const paraDentro = p.rua ? (p.ladoA === 'z1' || p.ladoA === 'x1' ? -1 : 1) : p.ladoB === 'z0' || p.ladoB === 'x0' ? 1 : -1;
    const giro = p.eixo === 'x' ? -paraDentro * (Math.PI / 2) : paraDentro * (Math.PI / 2);
    const col = p.eixo === 'x'
      ? this.colisor(s - p.l / 2, 0, fixo - 0.06, s + p.l / 2, h, fixo + 0.06, { type: 'porta' })
      : this.colisor(fixo - 0.06, 0, s - p.l / 2, fixo + 0.06, h, s + p.l / 2, { type: 'porta' });
    col.userData = { min: col.min.clone(), max: col.max.clone() };
    this.portas.push({ def: p, pivo, folha, col, ang: 0, alvo: 0, giro, aberta: false });
  }

  telhado(add) {
    const C = this.C;
    const L = C.limites;
    const E = this.E;
    const pe = C.pe;
    const mat = this.material('telhado', () => new THREE.MeshStandardMaterial({ map: E.telhado, roughness: 0.95, side: THREE.DoubleSide }));
    const laje = this.material('laje', () => new THREE.MeshStandardMaterial({ map: TEXTURAS.concreto('#4a4a46'), roughness: 0.95 }));
    const w = L.x1 - L.x0 + 0.6;
    const d = L.z1 - L.z0 + 0.6;
    const cx = (L.x0 + L.x1) / 2;
    const cz = (L.z0 + L.z1) / 2;
    add(laje, caixa(w, 0.25, d, cx, pe + 0.22, cz, 4));
    if (E.telhadoTipo === 'plano') {
      // platibanda
      add(laje, caixa(w, 0.8, 0.2, cx, pe + 0.7, L.z0 - 0.2, 4), caixa(w, 0.8, 0.2, cx, pe + 0.7, L.z1 + 0.2, 4));
      add(laje, caixa(0.2, 0.8, d, L.x0 - 0.2, pe + 0.7, cz, 4), caixa(0.2, 0.8, d, L.x1 + 0.2, pe + 0.7, cz, 4));
      return;
    }
    // duas águas, cumeeira ao longo de x
    const alt = Math.min(5, d * 0.32);
    const meia = d / 2 + 0.5;
    const incl = Math.atan2(alt, meia);
    const comp = Math.hypot(alt, meia);
    for (const s of [-1, 1]) {
      const g = caixa(w + 1, 0.12, comp, 0, 0, 0, 3);
      g.rotateX(s * incl);
      g.translate(cx, pe + 0.35 + alt / 2, cz + (s * meia) / 2);
      add(mat, g);
    }
    // as empenas (triângulos) nas pontas
    const tri = new THREE.Shape([new THREE.Vector2(-meia, 0), new THREE.Vector2(meia, 0), new THREE.Vector2(0, alt)]);
    const fach = this.material(E.fachada.uuid, () => new THREE.MeshStandardMaterial({ map: E.fachada, roughness: 0.9 }));
    for (const x of [L.x0 - 0.1, L.x1 + 0.1]) {
      const g = new THREE.ShapeGeometry(tri);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
      g.rotateY(Math.PI / 2);
      g.translate(x, pe + 0.35, cz);
      const m = new THREE.Mesh(g, fach);
      m.material.side = THREE.DoubleSide;
      m.castShadow = true;
      this.grupo.add(m);
    }
  }

  // ---------------------------------------------------------------- móveis
  montarMoveis() {
    const C = this.C;
    const rnd = semente(C.id.length * 131 + 7);
    const pecas = [];
    const tapetes = [];
    for (const m of C.moveis) {
      const giro = (m.r * Math.PI) / 2;
      if (m.t === 'quadro' || m.t === 'espelho') {
        this.quadro(m, giro, rnd);
        continue;
      }
      if (m.t === 'tapete') {
        tapetes.push(m);
        continue;
      }
      for (const g of desenharMovel(m, rnd, C.estilo)) {
        g.rotateY(giro);
        g.translate(m.x, m.y || 0, m.z);
        pecas.push(g);
      }
      if (!m.semColisao) {
        const b = caixaDoMovel(m);
        const y0 = m.t === 'lousa' ? 1.0 : 0;
        this.colisor(b.x0, y0, b.z0, b.x1, y0 + m.h, b.z1, { type: 'movel' });
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, map: TEXTURAS.grao() });
    const malha = new THREE.Mesh(mergeGeometries(pecas, false), mat);
    malha.castShadow = true;
    malha.receiveShadow = true;
    this.grupo.add(malha);
    for (const m of tapetes) {
      const cores = [['#5a1f1f', '#2a120e'], ['#1f3a4a', '#0e1a22'], ['#4a3a1f', '#22180e']][Math.floor(rnd() * 3)];
      const t = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEXTURAS.tapete(...cores), roughness: 1 }));
      t.rotation.y = (m.r * Math.PI) / 2;
      t.position.set(m.x, 0.006, m.z);
      t.receiveShadow = true;
      this.grupo.add(t);
    }
  }

  quadro(m, giro, rnd) {
    const g = new THREE.Group();
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(m.w + 0.1, m.h + 0.1, 0.05), this.material('moldura', () => new THREE.MeshStandardMaterial({ color: 0x4a3216, roughness: 0.4, metalness: 0.3 })));
    g.add(moldura);
    const frente = m.t === 'espelho'
      ? new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.05, metalness: 0.9 })
      : new THREE.MeshStandardMaterial({ map: TEXTURAS.retrato(Math.floor(rnd() * 6)), roughness: 0.7 });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), frente);
    tela.position.z = 0.027;
    g.add(tela);
    g.rotation.y = giro;
    g.position.set(m.x, m.y + m.h / 2, m.z);
    // torto, às vezes
    if (rnd() < 0.3) g.rotation.z = (rnd() - 0.5) * 0.25;
    moldura.castShadow = true;
    this.grupo.add(g);
    if (m.t === 'quadro') (this.retratos ||= []).push(g);
  }

  // ---------------------------------------------------------------- objetos soltos (arremessáveis)
  montarObjetos() {
    const C = this.C;
    const porTipo = new Map();
    for (const o of C.objetos) {
      if (!porTipo.has(o.t)) porTipo.set(o.t, []);
      porTipo.get(o.t).push(o);
    }
    this.objetos = new Array(C.objetos.length);
    this.objMalhas = [];
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    for (const [t, lista] of porTipo) {
      const malha = new THREE.InstancedMesh(OBJ_GEO[t](), mat, lista.length);
      malha.castShadow = true;
      malha.receiveShadow = true;
      lista.forEach((o, k) => {
        const cores = OBJ_COR[t];
        malha.setColorAt(k, _c.set(cores[k % cores.length]));
        const st = { o, malha, k, pos: new THREE.Vector3(o.x, o.y, o.z), vel: new THREE.Vector3(), rot: new THREE.Euler(0, o.giro, 0), giroV: new THREE.Vector3(), voando: false, sala: C.sala[o.sala] };
        this.objetos[o.i] = st;
        this.matrizObj(st);
      });
      malha.instanceMatrix.needsUpdate = true;
      this.objMalhas.push(malha);
      this.grupo.add(malha);
    }
  }

  matrizObj(st) {
    _m.compose(st.pos, _q.setFromEuler(st.rot), _v.set(1, 1, 1));
    st.malha.setMatrixAt(st.k, _m);
    st.malha.instanceMatrix.needsUpdate = true;
  }

  arremessar(i, v) {
    const st = this.objetos[i];
    if (!st) return null;
    st.vel.set(v[0], v[1], v[2]);
    st.giroV.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    st.voando = true;
    return st.pos;
  }

  // queda dos objetos arremessados, quicando no chão e nas paredes do cômodo; devolve as batidas
  fisicaObjetos(dt, aoBater) {
    for (const st of this.objetos) {
      if (!st?.voando) continue;
      st.vel.y -= 9.8 * dt;
      st.pos.addScaledVector(st.vel, dt);
      st.rot.x += st.giroV.x * dt;
      st.rot.y += st.giroV.y * dt;
      st.rot.z += st.giroV.z * dt;
      const s = st.sala;
      const f = PAREDE + 0.08;
      if (s) {
        if (st.pos.x < s.x0 + f || st.pos.x > s.x1 - f) {
          st.pos.x = THREE.MathUtils.clamp(st.pos.x, s.x0 + f, s.x1 - f);
          st.vel.x *= -0.4;
          aoBater?.(st.pos, 0.5);
        }
        if (st.pos.z < s.z0 + f || st.pos.z > s.z1 - f) {
          st.pos.z = THREE.MathUtils.clamp(st.pos.z, s.z0 + f, s.z1 - f);
          st.vel.z *= -0.4;
          aoBater?.(st.pos, 0.5);
        }
      }
      if (st.pos.y <= 0.01) {
        st.pos.y = 0.01;
        if (Math.abs(st.vel.y) > 1.2) aoBater?.(st.pos, Math.min(1, Math.abs(st.vel.y) / 5));
        st.vel.y *= -0.3;
        st.vel.x *= 0.6;
        st.vel.z *= 0.6;
        st.giroV.multiplyScalar(0.5);
        if (st.vel.lengthSq() < 0.05) {
          st.voando = false;
          // deitado no chão
          st.rot.x = Math.round(st.rot.x / (Math.PI / 2)) * (Math.PI / 2);
          st.rot.z = Math.round(st.rot.z / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
      this.matrizObj(st);
    }
  }

  // ---------------------------------------------------------------- luzes (uma por cômodo) e interruptores
  montarLuzes() {
    const C = this.C;
    const pe = C.pe;
    const matApagada = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.3 });
    const matAcesa = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
    this.matLampada = { apagada: matApagada, acesa: matAcesa };
    const lustre = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
    const geos = [];
    for (const c of C.comodos) {
      const cx = (c.x0 + c.x1) / 2;
      const cz = (c.z0 + c.z1) / 2;
      const w = c.x1 - c.x0;
      const d = c.z1 - c.z0;
      const corredor = c.tipo === 'corredor';
      // a luminária: haste e cúpula (no corredor, comprido, uma calha)
      geos.push(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6).translate(cx, pe - 0.2, cz));
      geos.push(new THREE.CylinderGeometry(0.12, 0.3, 0.2, 16, 1, true).translate(cx, pe - 0.45, cz));
      const lampada = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), matApagada);
      lampada.position.set(cx, pe - 0.5, cz);
      this.grupo.add(lampada);
      const grupo = new THREE.Group();
      grupo.visible = false;
      const alcance = Math.max(w, d) * (corredor ? 0.75 : 1.1) + 3;
      const luz = new THREE.PointLight(0xffd8a0, 6 + Math.min(18, c.area * 0.18), alcance, 1.5);
      luz.position.set(cx, pe - 0.65, cz);
      grupo.add(luz);
      this.grupo.add(grupo);
      this.luzes.push({ grupo, luz, lampada, base: luz.intensity, pisca: 0, acesa: false, quebrada: 0 });
    }
    const m = new THREE.Mesh(mergeGeometries(geos, false), lustre);
    this.grupo.add(m);
    // interruptores: espelho e a tecla
    const espelho = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4 });
    const tecla = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.3 });
    for (const s of C.interruptores) {
      const g = new THREE.Group();
      g.position.set(s.x, s.y, s.z);
      g.lookAt(s.x + s.nx, s.y, s.z + s.nz);
      const placa = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.012), espelho);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), tecla);
      t.position.z = 0.012;
      g.add(placa, t);
      this.grupo.add(g);
      this.interruptores.push({ def: s, grupo: g, tecla: t });
    }
    // o disjuntor
    const dj = C.disjuntor;
    if (dj) {
      const c = C.sala[dj.sala];
      const Ld = linhaDoLado(c, dj.lado);
      const s = Ld.a + (Ld.b - Ld.a) * dj.t;
      const n = Ld.eixo === 'x' ? Ld.nz : Ld.nx;
      const p = Ld.eixo === 'x' ? { x: s, z: Ld.fixo + n * (PAREDE + 0.07) } : { x: Ld.fixo + n * (PAREDE + 0.07), z: s };
      const g = new THREE.Group();
      g.position.set(p.x, 1.5, p.z);
      g.lookAt(p.x + (Ld.eixo === 'x' ? 0 : n), 1.5, p.z + (Ld.eixo === 'x' ? n : 0));
      const caixaD = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.14), new THREE.MeshStandardMaterial({ color: 0x6a7068, roughness: 0.5, metalness: 0.5 }));
      const alav = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 }));
      alav.position.set(0, 0, 0.1);
      const aviso = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      aviso.position.set(0, 0.2, 0.071);
      g.add(caixaD, alav, aviso);
      this.grupo.add(g);
      this.disjuntor = { grupo: g, alavanca: alav, x: p.x, z: p.z };
    }
  }

  // ---------------------------------------------------------------- o terreno (grama, cerca, árvores, poste)
  montarTerreno() {
    const C = this.C;
    const T = C.terreno;
    const L = C.limites;
    const w = T.x1 - T.x0 + 120;
    const d = T.z1 - T.z0 + 120;
    const cx = (T.x0 + T.x1) / 2;
    const cz = (T.z0 + T.z1) / 2;
    const gramaTex = TEXTURAS.grama().clone();
    gramaTex.needsUpdate = true;
    gramaTex.repeat.set(w / 4, d / 4);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gramaTex, roughness: 1 }));
    chao.position.set(cx, -0.31, cz);
    chao.receiveShadow = true;
    this.grupo.add(chao);
    this.colisor(cx - w / 2, -3, cz - d / 2, cx + w / 2, -0.31, cz + d / 2, { type: 'floor' });
    // o caminho de cascalho da van até a porta
    const e = C.entrada;
    const cas = TEXTURAS.cascalho().clone();
    cas.needsUpdate = true;
    const compr = C.van.z - L.z1 - 2;
    cas.repeat.set(1, compr / 2);
    const trilha = new THREE.Mesh(new THREE.PlaneGeometry(2.4, compr).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: cas, roughness: 1 }));
    trilha.position.set(e.x, -0.3, L.z1 + 2 + compr / 2);
    trilha.receiveShadow = true;
    this.grupo.add(trilha);
    // a rua na frente
    const asf = new THREE.Mesh(new THREE.PlaneGeometry(w, 9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEXTURAS.concreto('#2a2a2a'), roughness: 0.95 }));
    asf.position.set(cx, -0.305, C.van.z);
    asf.receiveShadow = true;
    this.grupo.add(asf);
    // a cerca em volta do terreno (o colisor também segura quem quer fugir para o escuro)
    const pecas = [];
    const ferro = this.C.estilo === 'mansao' || this.C.estilo === 'hospicio';
    const corCerca = ferro ? 0x1a1a1a : 0x6e6656;
    const lado = (x0, z0, x1, z1, portao = null) => {
      const comp = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(comp / (ferro ? 0.25 : 0.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        if (portao && Math.abs(x - portao) < 1.8) continue;
        pecas.push(bx(ferro ? 0.03 : 0.1, ferro ? 1.8 : 1.1, ferro ? 0.03 : 0.04, x, ferro ? 0.6 : 0.25, z, corCerca));
        if (ferro && i % 2 === 0) pecas.push(pintar(new THREE.ConeGeometry(0.03, 0.1, 4).translate(x, 1.55, z), corCerca));
      }
      for (const y of ferro ? [0.0, 1.3] : [0.0, 0.6]) {
        const g = bx(comp, 0.05, 0.05, (x0 + x1) / 2, y, (z0 + z1) / 2, corCerca);
        g.translate(-(x0 + x1) / 2, 0, -(z0 + z1) / 2).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
        pecas.push(g);
      }
    };
    const zf = C.van.z - 6;
    lado(T.x0, T.z0, T.x1, T.z0);
    lado(T.x0, T.z0, T.x0, zf);
    lado(T.x1, T.z0, T.x1, zf);
    lado(T.x0, zf, T.x1, zf, e.x);
    for (const g of pecas) g.translate(0, -0.3, 0);
    this.colisor(T.x0 - 0.2, -1, T.z0 - 0.2, T.x1 + 0.2, 3, T.z0);
    this.colisor(T.x0 - 0.2, -1, T.z0, T.x0, 3, zf);
    this.colisor(T.x1, -1, T.z0, T.x1 + 0.2, 3, zf);
    this.colisor(T.x0, -1, zf, e.x - 1.8, 3, zf + 0.2);
    this.colisor(e.x + 1.8, -1, zf, T.x1, 3, zf + 0.2);
    // a rua tem fim: o escuro de lá não é para ir
    this.colisor(T.x0 - 30, -1, C.van.z + 4.5, T.x1 + 30, 4, C.van.z + 5);
    this.colisor(T.x0 - 30, -1, zf, T.x0 - 29.5, 4, C.van.z + 5);
    this.colisor(T.x1 + 29.5, -1, zf, T.x1 + 30, 4, C.van.z + 5);
    // árvores secas
    const rnd = semente(C.id.length * 71 + 3);
    const casca = 0x2a2018;
    const arvore = (x, z, alt) => {
      pecas.push(cil(0.12, 0.22, alt, x, alt / 2 - 0.3, z, casca, 7));
      for (let k = 0; k < 6; k++) {
        const a = rnd() * Math.PI * 2;
        const y = alt * (0.5 + rnd() * 0.45) - 0.3;
        const comp = 1 + rnd() * 2;
        const g = cil(0.02, 0.07, comp, 0, comp / 2, 0, casca, 5);
        g.rotateZ(0.6 + rnd() * 0.6).rotateY(a).translate(x, y, z);
        pecas.push(g);
      }
      this.colisor(x - 0.25, -1, z - 0.25, x + 0.25, alt, z + 0.25);
    };
    for (let k = 0; k < 14; k++) {
      const x = T.x0 + 2 + rnd() * (T.x1 - T.x0 - 4);
      const z = T.z0 + 2 + rnd() * (zf - T.z0 - 4);
      if (x > L.x0 - 3 && x < L.x1 + 3 && z > L.z0 - 3 && z < L.z1 + 4) continue;
      if (Math.abs(x - e.x) < 3 && z > L.z1) continue;
      arvore(x, z, 4 + rnd() * 4);
    }
    // do outro lado da rua, mato e árvores
    for (let k = 0; k < 18; k++) arvore(T.x0 - 20 + rnd() * (T.x1 - T.x0 + 40), C.van.z + 7 + rnd() * 18, 5 + rnd() * 5);
    // lápides (hospício e mansão), fardos de feno (sítio)
    if (ferro) {
      for (let k = 0; k < 16; k++) {
        const x = L.x1 + 3 + rnd() * Math.max(1, T.x1 - L.x1 - 5);
        const z = L.z0 + rnd() * (L.z1 - L.z0);
        pecas.push(bxR(0.6, 0.9, 0.15, x, 0.15, z, 0x5a5a56, 0, 0, (rnd() - 0.5) * 0.2));
        if (rnd() < 0.5) pecas.push(bx(0.1, 0.5, 0.06, x, 0.9, z, 0x4a4a46), bx(0.35, 0.08, 0.06, x, 0.98, z, 0x4a4a46));
      }
    }
    if (C.estilo === 'sitio') {
      for (let k = 0; k < 6; k++) {
        const x = L.x0 - 4 - rnd() * 6;
        const z = L.z0 + rnd() * (L.z1 - L.z0);
        pecas.push(cilR(0.7, 0.7, 1.4, x, 0.4, z, 0x8a7a3a, 14, Math.PI / 2));
        this.colisor(x - 0.7, -1, z - 0.7, x + 0.7, 1.1, z + 0.7);
      }
    }
    // o poste da rua, com a lâmpada piscando
    const px = e.x - 5;
    const pz = C.van.z - 4.2;
    pecas.push(cil(0.08, 0.12, 5.5, px, 2.45, pz, 0x2a2a2a, 8), bx(0.08, 0.08, 1.4, px, 5.1, pz - 0.6, 0x2a2a2a));
    this.colisor(px - 0.15, -1, pz - 0.15, px + 0.15, 5, pz + 0.15);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    lamp.position.set(px, 4.95, pz - 1.2);
    this.grupo.add(lamp);
    const luzPoste = new THREE.PointLight(0xffc27a, 30, 22, 1.4);
    luzPoste.position.set(px, 4.7, pz - 1.2);
    this.grupo.add(luzPoste);
    this.poste = { lamp, luz: luzPoste, base: 30 };
    const malha = new THREE.Mesh(mergeGeometries(pecas, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    malha.castShadow = true;
    malha.receiveShadow = true;
    this.grupo.add(malha);
    // a lua (um disco no céu, que anda com a câmera)
    const lua = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEXTURAS.lua(), fog: false, depthWrite: false, toneMapped: false }));
    lua.scale.set(60, 60, 1);
    lua.renderOrder = -2;
    this.lua = lua;
    this.grupo.add(lua);
  }

  // ---------------------------------------------------------------- a van
  montarVan() {
    const C = this.C;
    const v = C.van;
    const g = new THREE.Group();
    g.position.set(v.x, -0.3, v.z);
    // a van fica de lado na rua, com a traseira aberta para a casa (para -z)
    const P = [];
    const branco = 0xbfc4c4;
    const L = 5.4; // comprimento (x)
    const W = 2.3; // largura (z)
    const H = 2.5;
    const piso = 0.42;
    // o baú: piso, teto, laterais (a frente da van fica em +x)
    P.push(bx(L, 0.1, W, 0, piso - 0.05, 0, 0x3a3a3a));
    P.push(bx(L, 0.08, W, 0, H, 0, branco));
    P.push(bx(L, H - piso, 0.08, 0, (H + piso) / 2, W / 2 - 0.04, branco));
    P.push(bx(0.08, H - piso, W, L / 2 - 0.04, (H + piso) / 2, 0, branco));
    P.push(bx(0.08, H - piso, W, -L / 2 + 0.04, (H + piso) / 2, 0, branco));
    // a lateral de -z (da casa) tem a porta de correr aberta: só as pontas
    P.push(bx(1.6, H - piso, 0.08, -L / 2 + 0.8, (H + piso) / 2, -W / 2 + 0.04, branco), bx(1.6, H - piso, 0.08, L / 2 - 0.8, (H + piso) / 2, -W / 2 + 0.04, branco));
    P.push(bx(L - 3.2, 0.3, 0.08, 0, H - 0.15, -W / 2 + 0.04, branco));
    // a cabine
    P.push(bx(1.8, 1.7, W, L / 2 + 0.9, 0.95, 0, branco), bx(0.06, 0.7, W - 0.3, L / 2 + 1.79, 1.4, 0, 0x101820));
    for (const [x, z] of [[-1.6, 1], [-1.6, -1], [1.6, 1], [1.6, -1], [3.4, 1], [3.4, -1]]) P.push(cilR(0.42, 0.42, 0.3, x, 0.42, z * (W / 2 - 0.05), 0x151515, 16, Math.PI / 2));
    // listra e o nome
    P.push(bx(L, 0.18, 0.01, 0, 1.4, W / 2 + 0.005, 0x7c2d12));
    // dentro: prateleiras com equipamento e a mesa dos monitores
    P.push(bx(0.5, 1.6, W - 0.3, -L / 2 + 0.3, 1.2, 0, 0x2a2e33));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) P.push(bx(0.3, 0.15, 0.25, -L / 2 + 0.35, 0.6 + i * 0.4, -0.8 + k * 0.32, [0x22c55e, 0x1e293b, 0xf97316, 0x334155, 0x7c3aed][(i + k) % 5]));
    P.push(bx(2.2, 0.06, 0.7, 0.7, 1.15, W / 2 - 0.4, 0x2a2e33), bx(2.2, 1.1, 0.06, 0.7, 0.6, W / 2 - 0.1, 0x22262a));
    const malha = new THREE.Mesh(mergeGeometries(P, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }));
    malha.castShadow = true;
    malha.receiveShadow = true;
    g.add(malha);
    // o monitor (sanidade e atividade) e a caixa de remédios: canvas que fantasmas.js redesenha
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    tela.position.set(0.7, 1.75, W / 2 - 0.16);
    tela.rotation.y = Math.PI;
    g.add(tela);
    this.monitor = { cv, ctx: cv.getContext('2d'), tex };
    const remedio = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.25), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }));
    remedio.position.set(-0.3, 1.27, W / 2 - 0.4);
    const cruz = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
    cruz.position.set(0, 0, -0.126);
    cruz.rotation.y = Math.PI;
    const cruz2 = cruz.clone();
    cruz2.rotation.z = Math.PI / 2;
    remedio.add(cruz, cruz2);
    g.add(remedio);
    // o botão de terminar (alavanca vermelha)
    const botao = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x7f1d1d, emissiveIntensity: 0.6 }));
    botao.position.set(1.5, 1.22, W / 2 - 0.35);
    g.add(botao);
    // a luz de dentro da van
    const luz = new THREE.PointLight(0xbfe0ff, 9, 9, 1.5);
    luz.position.set(0, H - 0.3, 0);
    g.add(luz);
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: 0xdff1ff, toneMapped: false }));
    faixa.position.set(0, H - 0.06, 0);
    g.add(faixa);
    // faróis acesos
    for (const z of [-0.8, 0.8]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false }));
      f.position.set(L / 2 + 1.81, 0.8, z);
      f.rotation.y = Math.PI / 2;
      g.add(f);
    }
    this.grupo.add(g);
    // colisores da van (sem a abertura do lado da casa)
    const o = { x: v.x, z: v.z };
    const y0 = -0.3;
    this.colisor(o.x - L / 2, y0, o.z - W / 2, o.x + L / 2, y0 + piso, o.z + W / 2); // o piso (degrau)
    this.colisor(o.x - L / 2, y0, o.z + W / 2 - 0.08, o.x + L / 2, y0 + H, o.z + W / 2);
    this.colisor(o.x + L / 2 - 0.08, y0, o.z - W / 2, o.x + L / 2 + 1.8, y0 + H, o.z + W / 2);
    this.colisor(o.x - L / 2, y0, o.z - W / 2, o.x - L / 2 + 0.6, y0 + H, o.z + W / 2);
    this.colisor(o.x - L / 2, y0, o.z - W / 2, o.x - L / 2 + 1.6, y0 + H, o.z - W / 2 + 0.08);
    this.colisor(o.x + L / 2 - 1.6, y0, o.z - W / 2, o.x + L / 2, y0 + H, o.z - W / 2 + 0.08);
    this.colisor(o.x - L / 2, y0 + H, o.z - W / 2, o.x + L / 2, y0 + H + 0.2, o.z + W / 2);
    this.colisor(o.x - 0.4, y0, o.z + W / 2 - 0.75, o.x + 1.8, y0 + 1.18, o.z + W / 2); // a mesa
    this.colisor(o.x - 0.2, y0, o.z - W / 2 - 0.5, o.x + 1.2, y0 + 0.2, o.z - W / 2); // degrauzinho
    this.van = {
      grupo: g,
      monitor: { x: v.x + 0.7, y: 1.45, z: v.z + W / 2 - 0.3 },
      remedio: { x: v.x - 0.3, y: 0.97, z: v.z + W / 2 - 0.4 },
      botao: { x: v.x + 1.5, y: 0.92, z: v.z + W / 2 - 0.35 },
      dentro: (x, z) => x > v.x - L / 2 && x < v.x + L / 2 && z > v.z - W / 2 - 0.6 && z < v.z + W / 2,
    };
  }

  // ---------------------------------------------------------------- ligar e desligar
  ativar() {
    if (this.ativa) return;
    this.ativa = true;
    this.grupo.visible = true;
    this.world.colliders.push(...this.colisores);
    this.world.luzesMudaram();
  }

  desativar() {
    if (!this.ativa) return;
    this.ativa = false;
    this.grupo.visible = false;
    const sai = new Set(this.colisores);
    this.world.colliders = this.world.colliders.filter((c) => !sai.has(c));
    this.world.luzesMudaram();
  }

  // ---------------------------------------------------------------- estado vindo do servidor
  porta(i, aberta, ja = false) {
    const p = this.portas[i];
    if (!p) return;
    p.aberta = aberta;
    p.alvo = aberta ? 1 : 0;
    if (ja) p.ang = p.alvo;
  }

  luz(i, acesa) {
    const l = this.luzes[i];
    if (!l || l.acesa === acesa) return;
    l.acesa = acesa;
  }

  // todo quadro: portas girando, luzes piscando, objetos voando
  animar(dt, t, interferencia = 0) {
    for (const p of this.portas) {
      if (!p) continue;
      if (Math.abs(p.ang - p.alvo) > 0.001) {
        p.ang += Math.sign(p.alvo - p.ang) * Math.min(Math.abs(p.alvo - p.ang), dt * (p.rapida ? 6 : 1.6));
        p.pivo.rotation.y = p.giro * p.ang;
      }
      // a porta fechada (ou quase) bloqueia
      if (p.ang < 0.25) {
        p.col.min.copy(p.col.userData.min);
        p.col.max.copy(p.col.userData.max);
      } else {
        p.col.min.y = LONGE;
        p.col.max.y = LONGE + 0.1;
      }
    }
    for (const l of this.luzes) {
      let acesa = l.acesa && l.quebrada <= 0;
      if (l.quebrada > 0) l.quebrada -= dt;
      let k = 1;
      if (acesa && (l.pisca > 0 || interferencia > 0)) {
        l.pisca = Math.max(0, l.pisca - dt);
        const s = Math.sin(t * 53 + l.base) * Math.sin(t * 17.3);
        k = s > 0.2 - interferencia * 0.5 ? 1 : 0.05;
        if (Math.random() < 0.08) k = 0;
      }
      if (acesa !== l.grupo.visible) l.grupo.visible = acesa;
      l.luz.intensity = l.base * k;
      const mat = acesa && k > 0.5 ? this.matLampada.acesa : this.matLampada.apagada;
      if (l.lampada.material !== mat) l.lampada.material = mat;
    }
    // o poste da rua falha de vez em quando
    const p = this.poste;
    if (p) {
      const f = Math.sin(t * 0.7) > 0.93 ? (Math.random() < 0.5 ? 0.05 : 1) : 1;
      p.luz.intensity = p.base * f;
      p.lamp.visible = f > 0.5;
    }
  }

  // a lua acompanha a câmera, sempre no mesmo canto do céu
  seguirCamera(cam) {
    if (!this.lua) return;
    this.lua.position.set(cam.position.x - this.grupo.position.x - 220, cam.position.y - this.grupo.position.y + 170, cam.position.z - this.grupo.position.z - 300);
  }

  // ---------------------------------------------------------------- digitais (só aparecem na luz UV)
  marcarDigitais(lista) {
    for (const d of this.digitais) d.malha.parent?.remove(d.malha);
    this.digitais = [];
    const mat = this.material('digitalMat', () => new THREE.MeshBasicMaterial({ map: TEXTURAS.digital(), color: 0x7dffb0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    for (const d of lista) {
      const malha = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat.clone());
      if (d.tipo === 'porta') {
        const p = this.portas[d.i];
        if (!p) continue;
        malha.position.set(p.def.l - 0.18, 1.05 + Math.random() * 0.2, d.lado ? -0.05 : 0.05);
        malha.rotation.y = d.lado ? Math.PI : 0;
        malha.rotation.z = (Math.random() - 0.5) * 0.6;
        p.folha.add(malha);
      } else {
        const s = this.interruptores[d.i];
        if (!s) continue;
        malha.position.set(0.02, -0.03, 0.03);
        malha.scale.setScalar(0.8);
        s.grupo.add(malha);
      }
      this.digitais.push({ malha, d });
    }
  }

  // a luz UV: digital à vista na frente da câmera, de perto, acende
  luzUV(cam, ligada) {
    cam.getWorldDirection(_v2);
    for (const { malha } of this.digitais) {
      let alvo = 0;
      if (ligada) {
        malha.getWorldPosition(_v);
        const dist = _v.distanceTo(cam.position);
        _v.sub(cam.position).normalize();
        if (dist < 4.5 && _v.dot(_v2) > 0.9) alvo = 0.9 * (1 - dist / 5);
      }
      malha.material.opacity += (alvo - malha.material.opacity) * 0.25;
      malha.visible = malha.material.opacity > 0.01;
    }
  }

  // o texto do monitor da van
  desenharMonitor(info) {
    const { ctx, tex, cv } = this.monitor;
    const w = cv.width;
    const h = cv.height;
    ctx.fillStyle = '#04110a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`CASO: ${info.casa}`, 16, 34);
    ctx.font = '20px monospace';
    ctx.fillText(`Fantasma: ${info.nome}`, 16, 64);
    ctx.fillText(`Sanidade do time: ${info.media}%`, 16, 94);
    let y = 128;
    for (const j of info.jogadores.slice(0, 4)) {
      ctx.fillStyle = j.morto ? '#ef4444' : '#a7f3d0';
      ctx.fillText(`${j.nome.slice(0, 14).padEnd(14)} ${j.morto ? 'MORTO' : `${j.sanidade}%`}`, 16, y);
      y += 26;
    }
    // a linha da atividade
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    info.atividade.forEach((a, i) => {
      const x = 300 + i * (196 / Math.max(1, info.atividade.length - 1));
      const yy = 230 - a * 120;
      if (i) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
    });
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.font = '16px monospace';
    ctx.fillText('ATIVIDADE', 300, 100);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(74,222,128,${Math.random() * 0.06})`;
      ctx.fillRect(0, Math.random() * h, w, 2);
    }
    tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ o monstro
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // a dama vem com meshopt
const MODELOS = new Map();

function acharClipe(clipes, nomes) {
  for (const n of nomes) {
    const c = clipes.find((k) => k.name.split('|').pop() === n) || clipes.find((k) => k.name.includes(n));
    if (c) return c;
  }
  return clipes[0] || null;
}

// o material de assombração: a cor do modelo escurecida, com a borda brilhando na cor do monstro
// Os modelos de Quaternius pintam cada parte com uma cor lisa: a parte cinza-clara sem cor (olho,
// dente, garra) vira brasa vermelha, e o resto do boneco de desenho animado fica podre — sem cor e
// escuro. olhos: false nos que são claros inteiros (o esqueleto, o lençol, o pelo do yeti).
// realista (a dama, com textura de verdade): escurece menos (o vestido já é preto e a pele pálida é
// o que aparece na lanterna), mostra o avesso do pano e a borda brilha menos e só na beirada: o
// vestido é cheio de dobras, e a borda dos outros acendia todas, deixando a dama azul-clara.
function materialAssombrado(original, cor, modo, olhos = true, realista = false) {
  const base = original.color ? original.color.clone() : new THREE.Color(0xffffff);
  const hsl = base.getHSL({}, THREE.SRGBColorSpace);
  // no vulto (a sombra preta) os olhos também ficam acesos
  const olho = olhos && !original.map && hsl.s < 0.25 && hsl.l > 0.42;
  if (modo === 'inteiro' && !olho) base.setHSL(hsl.h, hsl.s * 0.4, hsl.l * (realista ? 0.75 : 0.45), THREE.SRGBColorSpace);
  const aro = new THREE.Color(cor).multiplyScalar(0.55);
  const m = new THREE.MeshStandardMaterial({
    map: modo === 'inteiro' ? original.map || null : null,
    color: modo === 'vulto' ? new THREE.Color(0x020203) : olho ? new THREE.Color(0x0a0000) : base,
    roughness: realista ? 0.9 : 0.85,
    side: realista ? original.side : THREE.FrontSide,
    metalness: 0,
    transparent: true,
    opacity: 1,
    emissive: olho ? new THREE.Color(0xff1a05) : aro,
    emissiveIntensity: olho ? 2.4 : modo === 'vulto' ? 0.02 : realista ? 0.005 : 0.04,
    // a sombra nunca é toda opaca: dá para ver a parede através dela
    depthWrite: modo !== 'vulto',
  });
  m.userData.olho = olho;
  // bordaBase e emissivo: quanto a borda e o corpo brilham parados (Monstro3D.update soma o brilho
  // da caçada)
  m.userData.bordaBase = modo === 'vulto' ? (realista ? 1.1 : 1.6) : realista ? 0.12 : 0.45;
  m.userData.borda = { value: m.userData.bordaBase };
  m.userData.bordaPot = { value: realista ? 5 : 2.2 };
  m.userData.emissivo = modo === 'vulto' ? 0.02 : realista ? 0.005 : 0.04;
  m.userData.emissivoCaca = realista ? 0.03 : 0.1;
  m.userData.cor = { value: modo === 'vulto' ? new THREE.Color(cor) : aro };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBorda = m.userData.borda;
    sh.uniforms.uBordaPot = m.userData.bordaPot;
    sh.uniforms.uBordaCor = m.userData.cor;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBorda;\nuniform float uBordaPot;\nuniform vec3 uBordaCor;')
      // a textura (os modelos que têm) também perde a cor
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fsLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(fsLum), diffuseColor.rgb, 0.55) * vec3(0.95, 0.88, 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float aro = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), uBordaPot);
        totalEmissiveRadiance += uBordaCor * aro * uBorda;`);
  };
  m.customProgramCacheKey = () => `assombrado-${modo}`;
  return m;
}

// os pontos verdes do D.O.T.S.: só pinta uma grade de pontinhos
function materialDots() {
  const m = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      vec2 cel = mod(gl_FragCoord.xy, 7.0) - 3.5;
      if (dot(cel, cel) > 3.2) discard;`);
  };
  m.customProgramCacheKey = () => 'dots';
  return m;
}

export async function carregarMonstro(world, def) {
  const url = MODELO_URL(def);
  let gltf = MODELOS.get(url);
  if (!gltf) {
    gltf = await loader.loadAsync(url);
    MODELOS.set(url, gltf);
  }
  return new Monstro3D(world, def, gltf);
}

export class Monstro3D {
  constructor(world, def, gltf) {
    this.world = world;
    this.def = def;
    this.grupo = new THREE.Group();
    this.grupo.name = `monstro-${def.id}`;
    this.grupo.visible = false;
    const modelo = SkeletonUtils.clone(gltf.scene);
    // tamanho certo e pé no chão: com o esqueleto já no lugar (sem isso a caixa do corpo vem
    // na escala do arquivo, em centímetros, e o monstro nascia do tamanho de um rato)
    modelo.updateMatrixWorld(true);
    modelo.traverse((o) => {
      if (o.isSkinnedMesh) o.boundingBox = null;
    });
    const caixaM = new THREE.Box3().setFromObject(modelo, true);
    const alt = caixaM.max.y - caixaM.min.y || 1;
    const k = def.altura / alt;
    modelo.scale.setScalar(k);
    modelo.position.y = -caixaM.min.y * k + (def.flutua || 0);
    const centro = caixaM.getCenter(new THREE.Vector3());
    modelo.position.x = -centro.x * k;
    modelo.position.z = -centro.z * k;
    this.modelo = modelo;
    this.malhas = [];
    const dots = materialDots();
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      const orig = Array.isArray(o.material) ? o.material : [o.material];
      const mats = {
        vulto: orig.map((mm) => materialAssombrado(mm, def.borda || def.cor, 'vulto', def.olhos !== false, !!def.realista)),
        inteiro: orig.map((mm) => materialAssombrado(mm, def.borda || def.cor, 'inteiro', def.olhos !== false, !!def.realista)),
        dots: orig.map(() => dots),
      };
      const um = (lista) => (Array.isArray(o.material) ? lista : lista[0]);
      this.malhas.push({ o, mats: { vulto: um(mats.vulto), inteiro: um(mats.inteiro), dots: um(mats.dots) } });
    });
    this.grupo.add(modelo);
    // a luz fria que ele traz junto (some quando ele some)
    this.luz = new THREE.PointLight(0xb4231a, 0, 6, 1.6);
    this.luz.position.y = def.altura * 0.7;
    this.grupoLuz = new THREE.Group();
    this.grupoLuz.add(this.luz);
    this.grupoLuz.visible = false;
    this.grupo.add(this.grupoLuz);
    this.mixer = new THREE.AnimationMixer(modelo);
    const c = def.clipes;
    const clipes = gltf.animations;
    this.acoes = {};
    for (const nome of ['parado', 'andar', 'correr', 'ataque']) {
      const clip = acharClipe(clipes, c[nome] || []);
      if (clip) this.acoes[nome] = this.mixer.clipAction(clip);
    }
    if (this.acoes.ataque) {
      this.acoes.ataque.setLoop(THREE.LoopOnce, 1);
      this.acoes.ataque.clampWhenFinished = true;
    }
    this.atual = null;
    this.tocar('parado');
    this.modo = '';
    this.setModo('inteiro');
    this.pos = new THREE.Vector3();
    this.alvo = new THREE.Vector3();
    this.rot = 0;
    this.alvoRot = 0;
    this.t = Math.random() * 10;
    world.scene.add(this.grupo);
  }

  tocar(nome) {
    const a = this.acoes[nome] || this.acoes.andar || this.acoes.parado;
    if (!a || a === this.atual) return;
    a.reset().fadeIn(0.25).play();
    if (nome === 'correr') a.timeScale = 1.15;
    this.atual?.fadeOut(0.25);
    this.atual = a;
  }

  setModo(modo) {
    if (modo === this.modo) return;
    this.modo = modo;
    for (const { o, mats } of this.malhas) {
      o.material = mats[modo];
      o.castShadow = modo === 'inteiro';
    }
  }

  // de onde a câmera olharia os olhos dele (para o susto)
  cabeca(out) {
    return out.copy(this.grupo.position).add(_v.set(0, this.def.altura * 0.85, 0));
  }

  // estado vindo do servidor: posição na casa (já no mundo), giro, visível e animação
  receber(x, y, z, rot, anim) {
    if (this.preso) return; // no susto, quem manda é o fantasmas.js
    if (!this.grupo.visible) this.pos.set(x, y, z);
    this.alvo.set(x, y, z);
    this.alvoRot = rot;
    const nomes = ['parado', 'andar', 'correr', 'ataque'];
    this.tocar(nomes[anim] || 'parado');
  }

  update(dt, visivel, opacidade = 1, brilho = 0) {
    this.t += dt;
    this.pos.lerp(this.alvo, Math.min(1, dt * 10));
    let d = this.alvoRot - this.rot;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.rot += d * Math.min(1, dt * 8);
    this.grupo.position.copy(this.pos);
    if (this.def.voa) this.grupo.position.y += Math.sin(this.t * 2.2) * 0.12;
    this.grupo.rotation.y = this.rot;
    this.grupo.visible = visivel;
    this.grupoLuz.visible = visivel && this.modo !== 'dots';
    this.luz.intensity = visivel ? 1.5 + brilho * 3 : 0;
    for (const { mats } of this.malhas) {
      for (const m of [].concat(mats.vulto, mats.inteiro)) {
        m.opacity = opacidade;
        m.userData.borda.value = m.userData.bordaBase + brilho * (this.modo === 'vulto' ? 1.5 : 0.5);
        // os olhos em brasa pulsam
        m.emissiveIntensity = m.userData.olho ? 1.8 + brilho * 1.5 + Math.sin(this.t * 6) * 0.4 : m.userData.emissivo + brilho * m.userData.emissivoCaca;
      }
    }
    if (visivel) this.mixer.update(dt);
  }

  destruir() {
    this.world.scene.remove(this.grupo);
    this.mixer.stopAllAction();
  }
}

// ------------------------------------------------------------------ o que se segura na mão
// Um grupo que segue a câmera (fantasmas.js copia a pose dela todo quadro), com os aparelhos.
export function criarMao(world) {
  const g = new THREE.Group();
  g.name = 'mao-fantasmas';
  const itens = {};
  const preto = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 });
  const cinza = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.4, metalness: 0.3 });
  const telaCanvas = (w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { cv, ctx: cv.getContext('2d'), tex };
  };
  // EMF: caixa preta com 5 luzes
  {
    const it = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.16), preto);
    it.add(corpo);
    const cores = [0x22c55e, 0x84cc16, 0xeab308, 0xf97316, 0xef4444];
    it.userData.leds = cores.map((c, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, toneMapped: false }));
      m.position.set(-0.024 + i * 0.012, 0.014, -0.06);
      m.userData.cor = c;
      it.add(m);
      return m;
    });
    itens.emf = it;
  }
  // Spirit Box: radinho com tela
  {
    const it = new THREE.Group();
    it.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.13), new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.5 })));
    const t = telaCanvas(256, 96);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.024), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
    tela.rotation.x = -Math.PI / 2;
    tela.position.set(0, 0.016, -0.025);
    it.add(tela);
    const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.14, 4), cinza);
    antena.position.set(0.03, 0.015, -0.1);
    antena.rotation.x = -1.2;
    it.add(antena);
    it.userData.tela = t;
    itens.spirit = it;
  }
  // Termômetro
  {
    const it = new THREE.Group();
    it.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 })));
    const t = telaCanvas(128, 64);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.019), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
    tela.rotation.x = -Math.PI / 2;
    tela.position.set(0, 0.0135, -0.02);
    it.add(tela);
    const ponta = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), cinza);
    ponta.rotation.x = Math.PI / 2;
    ponta.position.z = -0.08;
    it.add(ponta);
    it.userData.tela = t;
    itens.termo = it;
  }
  // Câmera de vídeo
  {
    const it = new THREE.Group();
    it.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.12), preto));
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 14), cinza);
    lente.rotation.x = Math.PI / 2;
    lente.position.z = -0.08;
    it.add(lente);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xef4444, toneMapped: false }));
    rec.position.set(0.02, 0.037, -0.04);
    it.add(rec);
    it.userData.rec = rec;
    itens.camera = it;
  }
  // Lanterna UV
  {
    const it = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.15, 12), preto);
    corpo.rotation.x = Math.PI / 2;
    it.add(corpo);
    const lente = new THREE.Mesh(new THREE.CircleGeometry(0.018, 14), new THREE.MeshBasicMaterial({ color: 0x5b21b6, toneMapped: false }));
    lente.position.z = -0.0751;
    lente.rotation.y = Math.PI;
    it.add(lente);
    it.userData.lente = lente;
    itens.uv = it;
  }
  // Livro, D.O.T.S., crucifixo, incenso
  {
    const it = new THREE.Group();
    it.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a1f14, roughness: 0.7 })));
    itens.livro = it;
    const d = new THREE.Group();
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.5 })));
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: 0x4ade80, toneMapped: false }));
    l.position.z = -0.051;
    l.rotation.y = Math.PI;
    d.add(l);
    itens.dots = d;
    const c = new THREE.Group();
    const ouro = new THREE.MeshStandardMaterial({ color: 0xb8a060, metalness: 0.8, roughness: 0.3 });
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.012), ouro);
    const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.012), ouro);
    v2.position.y = 0.035;
    c.add(v1, v2);
    itens.crucifixo = c;
    const inc = new THREE.Group();
    const bastao = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0x6b7a4a, roughness: 1 }));
    bastao.rotation.x = Math.PI / 2;
    inc.add(bastao);
    const brasa = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a00, toneMapped: false }));
    brasa.position.z = -0.075;
    brasa.visible = false;
    inc.add(brasa);
    inc.userData.brasa = brasa;
    itens.incenso = inc;
  }
  for (const [id, it] of Object.entries(itens)) {
    it.visible = false;
    it.position.set(0.16, -0.16, -0.32);
    it.rotation.set(0.25, 0.1, 0);
    if (id === 'uv' || id === 'camera' || id === 'incenso') it.rotation.set(0.05, 0.05, 0);
    if (id === 'crucifixo') it.rotation.set(0.1, 0.4, 0);
    it.traverse((o) => {
      // na mão, sempre por cima (não entra na parede)
      if (o.isMesh) {
        o.renderOrder = 10;
        o.frustumCulled = false;
      }
    });
    g.add(it);
  }
  // a lanterna (luz) e a UV saem da mão
  // a luz sai na frente do aparelho (atrás dele, estourava o aparelho de branco)
  const lanterna = new THREE.SpotLight(0xfff1dc, 0, 26, 0.48, 0.55, 1.4);
  lanterna.position.set(0.08, -0.06, -0.55);
  lanterna.target.position.set(0.02, -0.12, -5);
  g.add(lanterna, lanterna.target);
  const uv = new THREE.SpotLight(0x7c3aed, 0, 7, 0.32, 0.5, 1.6);
  uv.position.set(0.14, -0.12, -0.5);
  uv.target.position.set(0.05, -0.2, -5);
  g.add(uv, uv.target);
  world.scene.add(g);
  return { grupo: g, itens, lanterna, uv };
}

// a lanterna de outra pessoa (um holofote a mais, sem sombra)
export function criarLanternaRemota(world) {
  const l = new THREE.SpotLight(0xfff1dc, 0, 20, 0.45, 0.6, 1.5);
  world.scene.add(l, l.target);
  return l;
}

// ------------------------------------------------------------------ o que vai no chão
export function criarColocado(c, casa) {
  const g = new THREE.Group();
  if (c.t === 'livro') {
    const capa = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a1f14, roughness: 0.7 }));
    const pag = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ map: TEXTURAS.paginas(!!c.escrito), roughness: 0.9 }));
    pag.rotation.x = -Math.PI / 2;
    pag.position.y = 0.012;
    g.add(capa, pag);
    g.userData.paginas = pag;
  } else if (c.t === 'dots') {
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.5 }));
    corpo.position.y = 0.04;
    g.add(corpo);
    // a nuvem de pontinhos verdes na frente do projetor
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const dist = 0.4 + Math.random() * 4;
      const a = (Math.random() - 0.5) * 1.3;
      const y = Math.random() * 2.4;
      pos.set([Math.sin(a) * dist, y, -Math.cos(a) * dist], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: TEXTURAS.brilho(), color: 0x4ade80, size: 0.03, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    g.userData.pontos = pts;
  } else if (c.t === 'crucifixo') {
    const ouro = new THREE.MeshStandardMaterial({ color: c.usos > 0 ? 0xb8a060 : 0x1a1410, metalness: 0.8, roughness: 0.3 });
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.3), ouro);
    const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.03), ouro);
    v1.position.y = v2.position.y = 0.01;
    v2.position.z = -0.06;
    g.add(v1, v2);
    g.userData.ouro = ouro;
  }
  g.position.set(c.x, (c.y || 0) + 0.005, c.z);
  g.rotation.y = c.giro || 0;
  casa.grupo.add(g);
  return g;
}

// ------------------------------------------------------------------ orbes, fumaça e respiração
export function criarOrbes(casa) {
  const n = 7;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: TEXTURAS.brilho(), color: 0xeef6ff, size: 0.09, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  pts.visible = false;
  pts.frustumCulled = false;
  casa.grupo.add(pts);
  const sementes = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random(), Math.random() * 10]);
  return {
    pts,
    update(t, sala, ver) {
      pts.visible = !!sala && ver;
      if (!pts.visible) return;
      const a = geo.attributes.position;
      sementes.forEach(([u, v, w, f], i) => {
        const x = sala.x0 + 0.6 + (sala.x1 - sala.x0 - 1.2) * (0.5 + 0.45 * Math.sin(t * 0.13 + f + u * 6));
        const z = sala.z0 + 0.6 + (sala.z1 - sala.z0 - 1.2) * (0.5 + 0.45 * Math.cos(t * 0.11 + f * 1.3 + v * 6));
        const y = 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * 0.3 + w * 6));
        a.setXYZ(i, x, y, z);
      });
      a.needsUpdate = true;
    },
  };
}

export function criarFumaca(casa) {
  const n = 40;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: TEXTURAS.fumaca(), color: 0xd8d8d0, size: 0.6, transparent: true, opacity: 0.5, depthWrite: false }));
  pts.frustumCulled = false;
  pts.visible = false;
  casa.grupo.add(pts);
  const part = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), vida: 0 }));
  let ate = 0;
  let origem = new THREE.Vector3();
  return {
    acender(x, y, z, dur = 6) {
      origem.set(x, y, z);
      ate = performance.now() + dur * 1000;
      pts.visible = true;
    },
    update(dt) {
      if (!pts.visible) return;
      const viva = performance.now() < ate;
      let algum = false;
      part.forEach((q, i) => {
        q.vida -= dt;
        if (q.vida <= 0 && viva) {
          q.p.copy(origem);
          q.v.set((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4);
          q.vida = 2 + Math.random() * 2;
        }
        if (q.vida > 0) {
          q.p.addScaledVector(q.v, dt);
          algum = true;
        } else q.p.set(0, LONGE, 0);
        pos.set([q.p.x, q.p.y, q.p.z], i * 3);
      });
      geo.attributes.position.needsUpdate = true;
      if (!algum) pts.visible = false;
    },
  };
}
