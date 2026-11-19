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

test('padrão: clique esquerdo aperta o R2, Espaço o ✕ e W anda para frente', () => {
  mapaTeclas.restaurar();
  const { pad, tp } = novoPad();
  assert.equal(tp.evento({ t: 'mouse', a: 'down', b: 'left' }), true);
  assert.ok(pad.ultimo.b & R2);
  tp.evento({ t: 'tecla', a: 'down', code: 'Space' });
  assert.ok(pad.ultimo.b & 1);
  assert.equal(pad.ultimo.rt, 1);
  tp.evento({ t: 'tecla', a: 'down', code: 'KeyW' });
  assert.equal(pad.ultimo.ly, -1);
});

test('R2 no W: o W aperta o R2, o clique esquerdo fica livre e o andar para frente fica sem tecla', () => {
  mapaTeclas.restaurar();
  const r = mapaTeclas.definir('b7', 'KeyW');
  assert.equal(r.tirou, 'ly-');
  assert.deepEqual(mapaTeclas.entradas('b7'), ['KeyW']);
  assert.deepEqual(mapaTeclas.entradas('ly-'), []);
  const { pad, tp } = novoPad();
  tp.evento({ t: 'tecla', a: 'down', code: 'KeyW' });
  assert.ok(pad.ultimo.b & R2);
  assert.equal(pad.ultimo.ly, 0);
  // o clique esquerdo sem ação não aperta nada
  tp.evento({ t: 'mouse', a: 'down', b: 'left' });
  assert.ok(pad.ultimo.b & R2); // ainda o W segurado
  // P não tem ação: vai como tecla para o PC
  assert.equal(tp.evento({ t: 'tecla', a: 'down', code: 'KeyP' }), false);
  // ficou guardado
  assert.equal(JSON.parse(guardado.get('sala3d-mapa-teclas')).mapa.KeyW, 'b7');
});

test('somar: mais de uma tecla na mesma ação', () => {
  mapaTeclas.restaurar();
  mapaTeclas.definir('b7', 'KeyR', true);
  assert.deepEqual(mapaTeclas.entradas('b7').sort(), ['KeyR', 'MouseLeft']);
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
  assert.equal(mapaTeclas.acao('RodaBaixo'), 'b3');
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

test('o mapa guardado do padrão de antes (v1) dá lugar ao padrão novo', async () => {
  guardado.set('sala3d-mapa-teclas', JSON.stringify({ v: 1, mapa: { MouseLeft: 'b0', KeyE: 'b7' }, carro: { ligado: true, t: 1, mapa: { KeyW: 'b7' } } }));
  const m = await import(`../public/js/mapa-teclas.js?v1=${Date.now()}`);
  assert.equal(m.mapaTeclas.acao('MouseLeft'), 'b7');
  assert.equal(m.mapaTeclas.acao('Space'), 'b0');
  assert.equal(m.mapaTeclas.carroLigado(), true);
});

test('legenda do canto: botões, ombros, gatilhos, L3/R3 e touchpad (sem analógicos)', async () => {
  mapaTeclas.restaurar();
  const { legendaBotoes } = await import('../public/js/mapa-teclas.js');
  assert.deepEqual(legendaBotoes('ps5').map((b) => `${b.botao}=${b.teclas}`),
    ['✕=Espaço', '○=C', '□=R', '△=F', 'L1=Q', 'L2=🖱 dir', 'R1=E', 'R2=🖱 esq', 'L3=Shift', 'R3=V', 'Touch=Alt']);
  // no Switch não tem touchpad
  assert.equal(legendaBotoes('switch').some((b) => b.id === 'tp'), false);
});
