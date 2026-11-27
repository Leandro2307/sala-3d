// avisos-botoes.js: acha o ícone de botão do PS5 (disco branco com o símbolo escuro) e não confunde com
// disco liso (poste, farol). Os ícones aqui são desenhados; os de verdade (prints do GTA 6) foram
// conferidos à mão na criação (ver o comentário de MEDIDOS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectar, Rastreio } from '../public/js/avisos-botoes.js';

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
