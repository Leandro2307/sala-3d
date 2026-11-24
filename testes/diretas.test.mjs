// O PS5 direto e o PC direto voltam sozinhos depois de uma reconexão (public/js/diretas.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Diretas, DIRETAS } from '../public/js/diretas.js';

function nova(guarda = new Map()) {
  const t = { agora: 1_000_000_000, sala: 'principal' };
  const armazem = { getItem: (k) => guarda.get(k) ?? null, setItem: (k, v) => guarda.set(k, v), removeItem: (k) => guarda.delete(k) };
  const criar = () => new Diretas({ sala: () => t.sala, guarda: armazem, agora: () => t.agora });
  return { t, criar, guarda, d: criar() };
}

test('a recarga lembra o que estava no ar, sem ninguém alugando', () => {
  const { criar, d } = nova();
  d.quer('ps5', { slot: 2 });
  d.quer('pc', { nome: 'M144', qps: 120 });
  const depois = criar();
  assert.deepEqual(depois.paraVoltar(), ['ps5', 'pc']);
  assert.equal(depois.lista.pc.nome, 'M144');
  assert.equal(depois.lista.ps5.slot, 2);
});

test('parado de propósito não volta', () => {
  const { criar, d, guarda } = nova();
  d.quer('ps5', {});
  d.larga('ps5');
  assert.equal(guarda.has(DIRETAS), false);
  assert.deepEqual(criar().paraVoltar(), []);
});

test('a própria reconexão tirando a tela não conta como parar', () => {
  const { d } = nova();
  d.quer('ps5', {});
  d.travada = true;
  d.larga('ps5');
  d.travada = false;
  assert.deepEqual(d.paraVoltar(), ['ps5']);
});

test('caiu junto com a conexão: volta, mesmo com a internet muito tempo fora', () => {
  const { t, d } = nova();
  d.quer('ps5', {});
  d.caiu('ps5');
  t.agora += 40_000;
  const queda = t.agora; // a sala só nota a queda depois
  t.agora += 20 * 60_000;
  d.atualizar('ps5', {}); // a página seguiu aberta
  assert.deepEqual(d.paraVoltar(queda), ['ps5']);
});

test('caiu bem antes da queda da conexão: não volta (ligaria o PS5 sozinho)', () => {
  const { t, d } = nova();
  d.quer('ps5', {});
  d.caiu('ps5');
  t.agora += 10 * 60_000;
  d.atualizar('ps5', {});
  assert.deepEqual(d.paraVoltar(t.agora), []);
  assert.deepEqual(d.lista, {});
});

test('outra sala, ou aba restaurada muito depois: não volta', () => {
  const a = nova();
  a.d.quer('pc', {});
  a.t.sala = 'outra';
  assert.deepEqual(a.criar().paraVoltar(), []);
  const b = nova();
  b.d.quer('pc', {});
  b.t.agora += 31 * 60_000;
  assert.deepEqual(b.criar().paraVoltar(), []);
});

test('armazenamento quebrado não derruba a página', () => {
  const { d } = nova(new Map([[DIRETAS, '{quebrado']]));
  assert.deepEqual(d.paraVoltar(), []);
  const sem = new Diretas({ sala: () => 'x' });
  sem.quer('pc', {});
  assert.deepEqual(sem.paraVoltar(), ['pc']);
});
