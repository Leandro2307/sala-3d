// Mapa de teclas do PC no controle virtual (public/js/mapa-teclas.js + teclado-pad.js)
import test from 'node:test';
import assert from 'node:assert/strict';

const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};
globalThis.document = { pointerLockElement: {} };

const { mapaTeclas, dicaTeclado, PADRAO } = await import('../public/js/mapa-teclas.js');
const { TecladoPad } = await import('../public/js/teclado-pad.js');

function novoPad() {
  const pad = { ultimo: null, definir: (_, e) => { pad.ultimo = e; }, soltar() {}, touchpad() {}, movimento() {} };
  const tp = new TecladoPad({ pad });
  tp.ligar('ps5');
  return { pad, tp };
}
const R2 = 1 << 7;

test('padrão: E aperta o R2 e W anda para frente', () => {
  mapaTeclas.restaurar();
  const { pad, tp } = novoPad();
  assert.equal(tp.evento({ t: 'tecla', a: 'down', code: 'KeyE' }), true);
  assert.ok(pad.ultimo.b & R2);
  assert.equal(pad.ultimo.rt, 1);
  tp.evento({ t: 'tecla', a: 'down', code: 'KeyW' });
  assert.equal(pad.ultimo.ly, -1);
});

test('R2 no W: o W aperta o R2, o E fica livre e o andar para frente fica sem tecla', () => {
  mapaTeclas.restaurar();
  const r = mapaTeclas.definir('b7', 'KeyW');
  assert.equal(r.tirou, 'ly-');
  assert.deepEqual(mapaTeclas.entradas('b7'), ['KeyW']);
  assert.deepEqual(mapaTeclas.entradas('ly-'), []);
  const { pad, tp } = novoPad();
  tp.evento({ t: 'tecla', a: 'down', code: 'KeyW' });
  assert.ok(pad.ultimo.b & R2);
  assert.equal(pad.ultimo.ly, 0);
  // E sem ação: vai como tecla para o PC
  assert.equal(tp.evento({ t: 'tecla', a: 'down', code: 'KeyE' }), false);
  // ficou guardado
  assert.equal(JSON.parse(guardado.get('sala3d-mapa-teclas')).mapa.KeyW, 'b7');
});

test('somar: mais de uma tecla na mesma ação', () => {
  mapaTeclas.restaurar();
  mapaTeclas.definir('b7', 'KeyR', true);
  assert.deepEqual(mapaTeclas.entradas('b7').sort(), ['KeyE', 'KeyR']);
});

test('botão do mouse e analógico direito pelo teclado', () => {
  mapaTeclas.restaurar();
  mapaTeclas.definir('b7', 'MouseX1');
  mapaTeclas.definir('rx+', 'KeyL');
  const { pad, tp } = novoPad();
  tp.evento({ t: 'mouse', a: 'down', b: 'x1' });
  assert.ok(pad.ultimo.b & R2);
  tp.evento({ t: 'tecla', a: 'down', code: 'KeyL' });
  assert.equal(pad.ultimo.rx, 1);
});

test('a rodinha só vira botão', () => {
  mapaTeclas.restaurar();
  assert.ok(mapaTeclas.definir('ly-', 'RodaBaixo').erro);
  assert.equal(mapaTeclas.acao('RodaBaixo'), 'b2');
});

test('voltar ao padrão e o recado com as teclas de agora', () => {
  mapaTeclas.definir('b7', 'KeyW');
  assert.ok(mapaTeclas.personalizado());
  assert.match(dicaTeclado('ps5'), /W R2/);
  mapaTeclas.restaurar();
  assert.equal(mapaTeclas.personalizado(), false);
  assert.deepEqual(mapaTeclas.entradas('b7'), Object.keys(PADRAO).filter((e) => PADRAO[e] === 'b7'));
  assert.match(dicaTeclado('ps5'), /^WASD anda/);
});
