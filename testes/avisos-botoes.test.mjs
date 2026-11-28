// avisos-botoes.js: acha o ícone de botão do PS5 (disco branco com o símbolo escuro) e não confunde com
// disco liso (poste, farol). Os ícones aqui são desenhados; os de verdade (prints do GTA 6) foram
// conferidos à mão na criação (ver o comentário de MEDIDOS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectar, Rastreio, armaNaTela } from '../public/js/avisos-botoes.js';

const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
// uma imagem escura com um disco branco de raio r em (cx, cy) e, dentro, os segmentos escuros
function imagem(W, H, cx, cy, r, segs = [], e = 0.15) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 40;
    const u = (x + 0.5 - cx) / r, w = (y + 0.5 - cy) / r;
    if (Math.hypot(u, w) <= 1) v = segs.some((s) => distSeg(u, w, ...s) <= e) ? 35 : 235;
    data.set([v, v, v, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
const XIS = [[-0.5, -0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, -0.5]];
const TRI = [[0, -0.58, 0.66, 0.5], [0.66, 0.5, -0.66, 0.5], [-0.66, 0.5, 0, -0.58]];

test('acha o ✕ e o △ no lugar certo, em tamanhos diferentes', () => {
  for (const r of [10, 14, 22]) {
    const [a] = detectar(imagem(320, 180, 100, 90, r, XIS));
    assert.equal(a?.simbolo, 'xis', `✕ com raio ${r}`);
    assert.equal(a.id, 'b0');
    assert.ok(Math.abs(a.x * 320 - 100) < 1.5 && Math.abs(a.y * 180 - 90) < 1.5);
    assert.equal(detectar(imagem(320, 180, 200, 60, r, TRI, 0.13))[0]?.simbolo, 'triangulo', `△ com raio ${r}`);
  }
});

test('disco branco sem símbolo (poste, farol) não é aviso', () => {
  assert.deepEqual(detectar(imagem(320, 180, 100, 90, 14)), []);
});

test('o rastreio só mostra depois de 2 análises e some depois de 2 sem', () => {
  const r = new Rastreio();
  const a = { simbolo: 'xis', id: 'b0', x: 0.5, y: 0.5, r: 0.02 };
  assert.equal(r.passo([a]).length, 0);
  assert.equal(r.passo([{ ...a, x: 0.51 }]).length, 1);
  assert.equal(r.passo([]).length, 1);
  assert.equal(r.passo([]).length, 0);
});

// o disco meio transparente do The Last of Us (~165 em vez de 235): o branco fixo em 170 o perdia
test('acha o □ no disco cinza-claro', () => {
  const QUAD = [[-0.46, -0.46, 0.46, -0.46], [0.46, -0.46, 0.46, 0.46], [0.46, 0.46, -0.46, 0.46], [-0.46, 0.46, -0.46, -0.46]];
  const img = imagem(320, 180, 100, 90, 14, QUAD, 0.12);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === 235) img.data.fill(165, i, i + 3);
  assert.equal(detectar(img)[0]?.simbolo, 'quadrado');
});

// o anel vazado do canto (The Last of Us, "Largar"): anel cinza fino, o □ em contorno com um quadrado cheio
// menor no meio, tudo sobre fundo escuro
function anelQuadrado(W, H, cx, cy, r) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - cx) / r, w = (y + 0.5 - cy) / r, d = Math.hypot(u, w), m = Math.max(Math.abs(u), Math.abs(w));
    let v = 25;
    if (d >= 0.88 && d <= 1) v = 115;
    else if (m >= 0.45 && m <= 0.56) v = 115;
    else if (m <= 0.28) v = 90;
    data.set([v, v, v, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
test('acha o □ no anel vazado, e anel sem símbolo não é aviso', () => {
  for (const r of [12, 14, 20]) assert.equal(detectar(anelQuadrado(320, 180, 160, 90, r))[0]?.simbolo, 'quadrado', `raio ${r}`);
  const vazio = anelQuadrado(320, 180, 160, 90, 14);
  for (let y = 70; y < 110; y++) for (let x = 140; x < 180; x++) {
    const d = Math.hypot(x + 0.5 - 160, y + 0.5 - 90) / 14;
    if (d < 0.88) vazio.data.fill(25, (y * 320 + x) * 4, (y * 320 + x) * 4 + 3);
  }
  assert.deepEqual(detectar(vazio), []);
});

// o aviso de contorno preto (△ sobre a pedra, ✕ cinza sobre o bege): o fundo claro em volta não o derruba
function contornado(W, H, cx, cy, r, segs, disco, fundo, e = 0.15) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - cx) / r, w = (y + 0.5 - cy) / r, d = Math.hypot(u, w);
    let c = fundo;
    if (d <= 1.12) c = d > 1 ? [20, 20, 20] : segs.some((s) => distSeg(u, w, ...s) <= e) ? [25, 25, 25] : [disco, disco, disco];
    data.set([...c, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
test('acha o aviso de contorno preto sobre fundo claro, branco ou cinza', () => {
  for (const r of [8, 10, 12]) {
    assert.equal(detectar(contornado(320, 180, 100, 90, r, TRI, 240, [205, 200, 195], 0.13))[0]?.simbolo, 'triangulo', `△ branco, raio ${r}`);
    assert.equal(detectar(contornado(320, 180, 100, 90, r, XIS, 105, [215, 190, 165]))[0]?.simbolo, 'xis', `✕ cinza, raio ${r}`);
  }
  assert.deepEqual(detectar(contornado(320, 180, 100, 90, 10, [], 240, [205, 200, 195])), []);
});

// a munição do GTA ("6 54"): algarismos claros na mesma linha, no canto de cima à direita
function canto(W, H, fundo, algs = []) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([fundo, fundo, fundo + 5, 255], i * 4);
  for (const [x0, y0, w, h] of algs) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const borda = x < x0 + 2 || x >= x0 + w - 2 || y < y0 + 2 || y >= y0 + h - 2;
    if (borda) data.set([235, 235, 235, 255], (y * 960 + x) * 4);
  }
  return { width: W, height: H, data };
}
test('armaNaTela: acha a linha da munição; sem ela, ou com céu claro, não', () => {
  const a = armaNaTela(canto(960, 540, 35, [[880, 47, 7, 10], [896, 47, 7, 10], [904, 47, 7, 10]]));
  assert.ok(a, 'com munição');
  assert.ok(Math.abs(a.base - 57 / 540) < 0.003 && Math.abs(a.dir - 911 / 960) < 0.003);
  assert.equal(armaNaTela(canto(960, 540, 35)), null, 'sem munição');
  assert.equal(armaNaTela(canto(960, 540, 230, [[880, 47, 7, 10], [896, 47, 7, 10]])), null, 'céu claro');
  assert.equal(armaNaTela(canto(960, 540, 35, [[880, 47, 7, 10]])), null, 'um algarismo solto');
});
