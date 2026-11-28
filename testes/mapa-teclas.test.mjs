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
  assert.equal(mapaTeclas.acao('RodaBaixo'), undefined); // desde a v6 a rodinha fica sem nada no padrão
  assert.ok(!mapaTeclas.definir('b3', 'RodaBaixo').erro);
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
    ['✕=Espaço', '○=C', '□=R', '△=F', 'L1=Tab', 'L2=🖱 dir', 'R1=E', 'R2=🖱 esq', 'L3=Shift', 'R3=Q', 'Touch=Alt']);
  // no Switch não tem touchpad
  assert.equal(legendaBotoes('switch').some((b) => b.id === 'tp'), false);
});

test('clique direito é o L2', () => {
  mapaTeclas.restaurar();
  const { pad, tp } = novoPad();
  tp.evento({ t: 'mouse', a: 'down', b: 'right' });
  assert.equal(pad.ultimo.lt, 1);
  assert.equal(pad.ultimo.rt, 0);
});

test('mapa guardado na v3 (esquerdo L2): os cliques trocam; o trocado à mão fica', async () => {
  const ler = async (v, mapa, carro) => {
    guardado.set('sala3d-mapa-teclas', JSON.stringify({ v, mapa, ...(carro ? { carro } : {}) }));
    return (await import(`../public/js/mapa-teclas.js?v=${Math.random()}`)).mapaTeclas;
  };
  let m = await ler(3, { MouseLeft: 'b6', MouseRight: 'b7', KeyP: 'b0' });
  assert.deepEqual([m.acao('MouseLeft'), m.acao('MouseRight'), m.acao('KeyP')], ['b7', 'b6', 'b0']);
  m = await ler(3, { MouseLeft: 'b0', MouseRight: 'b7' });
  assert.deepEqual([m.acao('MouseLeft'), m.acao('MouseRight')], ['b0', 'b7']);
  m = await ler(4, { MouseLeft: 'b6', MouseRight: 'b7' });
  assert.equal(m.acao('MouseLeft'), 'b6');
  m = await ler(3, {}, { ligado: false, t: 2, mapa: { KeyW: 'b7' } });
  assert.equal(m.modoCarro(), 'off');
  m = await ler(3, {}, { ligado: true, t: 2, mapa: { KeyW: 'b7' } });
  assert.equal(m.modoCarro(), 'soma');
  m = await ler(4, {}, { modo: 'sempre', t: 3, mapa: { KeyW: 'b7' } });
  assert.equal(m.modoCarro(), 'sempre');
  // antes da v4 a troca do padrão era o ' (2026-11-26: passou para o Y); quem pôs outra tecla fica com ela
  m = await ler(4, {}, { modo: 'soma', t: 3, mapa: { KeyW: 'b7', Backquote: 'troca' } });
  assert.deepEqual(m.entradasCarro('troca'), ['KeyY']);
  m = await ler(4, {}, { modo: 'soma', t: 3, mapa: { KeyW: 'b7', KeyG: 'troca' } });
  assert.deepEqual(m.entradasCarro('troca'), ['KeyG']);
});

const tecla = (tp, code, a = 'down') => tp.evento({ t: 'tecla', a, code });
test('modo carro soma: a pé o W só anda; no carro anda e acelera, sem soltar o andar na troca', () => {
  mapaTeclas.restaurar();
  mapaTeclas.definirModoCarro('soma');
  const { pad, tp } = novoPad();
  tecla(tp, 'KeyW');
  assert.deepEqual([pad.ultimo.ly, pad.ultimo.rt], [-1, 0]);
  tecla(tp, 'KeyF');
  assert.deepEqual([pad.ultimo.ly, pad.ultimo.rt], [-1, 1]);
  tecla(tp, 'KeyA'); // o volante vai até o fim com o W segurado
  assert.deepEqual([pad.ultimo.lx, pad.ultimo.ly], [-1, -1]);
  tecla(tp, 'KeyW'); // a repetição da tecla não muda nada
  tecla(tp, 'KeyW', 'up');
  assert.equal(pad.ultimo.ly, 0);
  tecla(tp, 'KeyF', 'up');
  tecla(tp, 'KeyY'); // volta a pé
  assert.equal(tp.carro, false);
  tecla(tp, 'KeyW');
  assert.equal(Math.round(pad.ultimo.ly * 100), -71); // a pé a diagonal é de analógico
  tp.desligar();
});

test('modo carro troca: no carro o W só acelera', () => {
  mapaTeclas.definirModoCarro('troca');
  const { pad, tp } = novoPad();
  tecla(tp, 'KeyY');
  tecla(tp, 'KeyW');
  assert.deepEqual([pad.ultimo.ly, pad.ultimo.rt], [0, 1]);
  tp.desligar();
});

test('modo carro sempre: o W anda e acelera e o △ não troca; desligado: só anda', () => {
  mapaTeclas.definirModoCarro('sempre');
  let { pad, tp } = novoPad();
  tecla(tp, 'KeyF');
  assert.equal(tp.carro, false);
  tecla(tp, 'KeyW');
  assert.deepEqual([pad.ultimo.ly, pad.ultimo.rt], [-1, 1]);
  tecla(tp, 'KeyS');
  assert.equal(pad.ultimo.lt, 1);
  tp.desligar();
  mapaTeclas.definirModoCarro('off');
  ({ pad, tp } = novoPad());
  tecla(tp, 'KeyF');
  tecla(tp, 'KeyW');
  assert.deepEqual([pad.ultimo.ly, pad.ultimo.rt], [-1, 0]);
  tp.desligar();
  mapaTeclas.definirModoCarro('soma');
});

test('o aviso do modo e a legenda no carro', async () => {
  mapaTeclas.restaurar();
  const { textoModoCarro, legendaBotoes } = await import('../public/js/mapa-teclas.js');
  assert.deepEqual(textoModoCarro(false), { icone: '🚶', nome: 'A PÉ', faz: 'WASD anda', troca: 'F ou Y', noCarro: false });
  assert.equal(textoModoCarro(true).faz, 'W anda + acelera · S freia / ré');
  const l = Object.fromEntries(legendaBotoes('ps5', true).map((b) => [b.botao, b.teclas]));
  assert.deepEqual([l.L2, l.R2], ['S', 'W']);
});

test('no tutorial (treino) o F e a tecla de troca não ligam o modo carro', () => {
  mapaTeclas.restaurar();
  const { pad, tp } = novoPad();
  pad.treino = () => {};
  for (const c of ['KeyF', 'KeyY']) { tecla(tp, c); tecla(tp, c, 'up'); }
  assert.equal(tp.carro, false);
  pad.treino = null;
  tecla(tp, 'KeyY');
  assert.equal(tp.carro, true);
  tp.desligar();
});

test('v5: L1 no Tab, Q no Create, M abre o mapa e o touchpad vai para o N; o guardado na v4 migra', async () => {
  mapaTeclas.restaurar();
  assert.deepEqual([mapaTeclas.acao('Tab'), mapaTeclas.acao('KeyQ'), mapaTeclas.acao('KeyV'), mapaTeclas.acao('KeyM'), mapaTeclas.acao('KeyN')], ['b4', 'b11', 'b8', 'mapa', 'b17']);
  assert.deepEqual([mapaTeclas.acao('MouseX1'), mapaTeclas.acao('RodaCima'), mapaTeclas.acao('RodaBaixo'), mapaTeclas.acao('KeyF')], [undefined, undefined, undefined, 'b3']);
  const ler = async (mapa) => {
    guardado.set('sala3d-mapa-teclas', JSON.stringify({ v: 4, mapa }));
    return (await import(`../public/js/mapa-teclas.js?v5=${Math.random()}`)).mapaTeclas;
  };
  // o padrão da v4: Q no L1, Tab no Create, V no R3, Mouse 4 no L1, a rodinha no △, M no touchpad
  let m = await ler({ KeyQ: 'b4', Tab: 'b8', KeyV: 'b11', MouseX1: 'b4', RodaCima: 'b3', RodaBaixo: 'b3', KeyF: 'b3', KeyM: 'b17', KeyP: 'b2' });
  assert.deepEqual([m.acao('Tab'), m.acao('KeyQ'), m.acao('KeyV'), m.acao('KeyM'), m.acao('KeyN'), m.acao('KeyP')], ['b4', 'b11', 'b8', 'mapa', 'b17', 'b2']);
  assert.deepEqual([m.acao('MouseX1'), m.acao('RodaCima'), m.acao('RodaBaixo'), m.acao('KeyF')], [undefined, undefined, undefined, 'b3']);
  guardado.set('sala3d-mapa-teclas', JSON.stringify({ v: 5, mapa: { Tab: 'b4', KeyQ: 'b8', KeyV: 'b11', MouseX1: 'b4', RodaCima: 'b0' } }));
  m = (await import(`../public/js/mapa-teclas.js?v6=${Math.random()}`)).mapaTeclas;
  assert.deepEqual([m.acao('KeyQ'), m.acao('KeyV'), m.acao('MouseX1'), m.acao('RodaCima')], ['b11', 'b8', undefined, 'b0']);
  // quem trocou à mão fica com o seu
  m = await ler({ KeyQ: 'b0', Tab: 'b8', KeyM: 'b3' });
  assert.deepEqual([m.acao('KeyQ'), m.acao('Tab'), m.acao('KeyM')], ['b0', 'b8', 'b3']);
  guardado.delete('sala3d-mapa-teclas');
});

test('o M (mapa) aperta o Options no PS5; no Switch vai como tecla', async () => {
  mapaTeclas.restaurar();
  const { tp, pad } = novoPad();
  tp.ligar('ps5');
  assert.equal(tp.acionar('k', 'mapa', true), true);
  assert.ok(pad.ultimo.b & (1 << 9));
  tp.acionar('k', 'mapa', false);
  await new Promise((r) => setTimeout(r, 200)); // o toque mínimo (MIN_MS)
  assert.equal(pad.ultimo.b & (1 << 9), 0);
  tp.ligar('switch');
  assert.equal(tp.acionar('k', 'mapa', true), false);
});
