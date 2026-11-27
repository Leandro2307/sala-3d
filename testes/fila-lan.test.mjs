// fila-lan.js: a fila da vez numa máquina da lan house
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { FilaLan, CHAMADA_MS, AUSENTE_MS } = createRequire(import.meta.url)('../fila-lan.js');
const todos = new Set(['ana', 'bia', 'caio', 'joao']);

test('João jogando: a fila espera; a vez acabou, o 1º é chamado e só ele pode começar', () => {
  const f = new FilaLan();
  f.entrar('ps5', 'ana', 0);
  f.entrar('ps5', 'bia', 0);
  assert.equal(f.entrar('ps5', 'ana', 0), 0, 'entrar de novo não duplica');
  assert.deepEqual(f.passo('ps5', { vez: 'joao', presentes: todos, agora: 1000 }), []);
  assert.equal(f.chamada('ps5'), null);
  const ev = f.passo('ps5', { vez: null, presentes: todos, agora: 2000 });
  assert.deepEqual(ev, [{ tipo: 'chamada', conta: 'ana', ate: 2000 + CHAMADA_MS }]);
  assert.equal(f.bloqueia('ps5', 'bia'), 'ana');
  assert.equal(f.bloqueia('ps5', 'ana'), null);
  assert.equal(f.bloqueia('pc', 'bia'), null, 'a outra máquina tem a sua fila');
});

test('o chamado não começou em 2 min: sai e o seguinte é chamado', () => {
  const f = new FilaLan();
  f.entrar('pc', 'ana', 0);
  f.entrar('pc', 'bia', 0);
  f.passo('pc', { presentes: todos, agora: 0 });
  const ev = f.passo('pc', { presentes: todos, agora: CHAMADA_MS });
  assert.deepEqual(ev.map((e) => [e.tipo, e.conta]), [['passou', 'ana'], ['chamada', 'bia']]);
  assert.deepEqual(f.estado('pc').lista, ['bia']);
});

test('o chamado começou o teste: a chamada espera o teste e mais 2 min; alugou, sai da fila', () => {
  const f = new FilaLan();
  f.entrar('pc', 'ana', 0);
  f.entrar('pc', 'bia', 0);
  f.passo('pc', { presentes: todos, agora: 0 });
  f.comecouTeste('pc', 'ana', 60_000 + 120_000);
  assert.deepEqual(f.passo('pc', { presentes: todos, agora: CHAMADA_MS + 1 }), [], 'ainda no teste');
  assert.equal(f.chamada('pc').conta, 'ana');
  const ev = f.passo('pc', { vez: 'ana', presentes: todos, agora: 200_000 });
  assert.deepEqual(ev, [{ tipo: 'pegou', conta: 'ana' }]);
  assert.equal(f.chamada('pc'), null);
  assert.deepEqual(f.passo('pc', { presentes: todos, agora: 4 * HORA() })[0], { tipo: 'chamada', conta: 'bia', ate: 4 * HORA() + CHAMADA_MS });
});
function HORA() { return 3600_000; }

test('quem já testava antes de a fila existir termina o teste antes da chamada', () => {
  const f = new FilaLan();
  f.entrar('ps5', 'ana', 0);
  assert.deepEqual(f.passo('ps5', { testando: { conta: 'caio', fim: 50_000 }, presentes: todos, agora: 10_000 }), []);
  assert.equal(f.passo('ps5', { testando: { conta: 'caio', fim: 50_000 }, presentes: todos, agora: 50_000 })[0].tipo, 'chamada');
});

test('fora da sala por mais de 1 min sai da fila; voltar antes não tira', () => {
  const f = new FilaLan();
  f.entrar('pc', 'ana', 0);
  f.entrar('pc', 'bia', 0);
  const sem = new Set(['bia']);
  f.passo('pc', { vez: 'joao', presentes: sem, agora: 0 });
  f.passo('pc', { vez: 'joao', presentes: todos, agora: 30_000 });
  f.passo('pc', { vez: 'joao', presentes: sem, agora: 40_000 });
  assert.deepEqual(f.estado('pc').lista, ['ana', 'bia'], 'recarregou a página');
  const ev = f.passo('pc', { vez: 'joao', presentes: sem, agora: 40_000 + AUSENTE_MS });
  assert.deepEqual(ev, [{ tipo: 'saiu', conta: 'ana' }]);
  assert.deepEqual(f.estado('pc').lista, ['bia']);
});

test('sair da fila sendo o chamado chama o seguinte', () => {
  const f = new FilaLan();
  f.entrar('pc', 'ana', 0);
  f.entrar('pc', 'bia', 0);
  f.passo('pc', { presentes: todos, agora: 0 });
  assert.ok(f.sair('pc', 'ana'));
  assert.equal(f.passo('pc', { presentes: todos, agora: 1000 })[0].conta, 'bia');
});
