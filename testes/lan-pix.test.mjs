// Aluguel pago por Pix (lanhouse.js): a hora não fica presa, ninguém paga duas vezes e o Pix que cai tarde
// não toma a hora de outra pessoa. A Stripe aqui é de mentira (fetch trocado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');
const HORA = 3600_000;
const MIN = 60_000;

async function montar(t) {
  const real = { fetch: globalThis.fetch, now: Date.now, env: { ...process.env }, log: console.log, warn: console.warn };
  // 10:05 em Brasília: a hora das 12h está livre
  const rel = { agora: Date.UTC(2026, 10, 24, 13, 5) };
  Date.now = () => rel.agora;
  console.log = () => {};
  console.warn = () => {};
  process.env.STRIPE_KEY = 'rk_test_mentira';
  process.env.LAN_SEGREDO = 'segredo';

  const sessoes = new Map();
  const pedidos = [];
  let fora = false;
  const resp = (status, j) => ({ ok: status < 400, status, json: async () => j });
  globalThis.fetch = async (url, op = {}) => {
    if (!String(url).startsWith('https://api.stripe.com/')) return real.fetch(url, op);
    if (fora) throw new Error('sem rede');
    const caminho = String(url).split('/v1/')[1];
    if (caminho.startsWith('products/')) return resp(200, { name: 'Hora', default_price: { id: 'price_1', type: 'one_time', unit_amount: 1000, currency: 'brl' } });
    if (caminho === 'checkout/sessions') {
      const corpo = Object.fromEntries(new URLSearchParams(op.body));
      pedidos.push(corpo);
      const s = { id: `cs_test_sessao0000${sessoes.size + 1}`, url: 'https://checkout.stripe.com/x', status: 'open', payment_status: 'unpaid', expires_at: Number(corpo.expires_at) };
      sessoes.set(s.id, s);
      return resp(200, { ...s });
    }
    const [, , id, acao] = caminho.split('/');
    const s = sessoes.get(id);
    if (acao === 'expire') {
      if (s.status !== 'open') return resp(400, { error: { message: 'not open' } });
      s.status = 'expired';
    }
    return resp(200, { ...s });
  };

  const guardadas = new Map();
  const contas = new Map();
  const banco = {
    lerReservas: async () => [...guardadas.values()].map((r) => ({ ...r })),
    // só as colunas que o banco de verdade guarda
    salvarReserva: async ({ id, sala, conta, maquina, jogo, jogoNome, inicio, status, sessao, expira, criada }) => {
      guardadas.set(id, { id, sala, conta, maquina, jogo, jogoNome, inicio, status, sessao, expira, criada });
    },
    lerTestes: async () => [],
    salvarTeste: async () => {},
    lerConta: async (n) => contas.get(n) || null,
    criarConta: async (n, senhaHash) => { contas.set(n, { senhaHash }); return true; },
  };
  const criar = require('../lanhouse.js');
  const servidores = [];
  async function ligar() {
    const lan = criar({
      banco, hashSenha: (s) => s, confereSenha: (a, b) => a === b, podeTentar: () => true, bloqueado: () => false,
      configDaSala: async () => ({ lanhouse: { ligada: true, abre: 8, fecha: 23 } }), jogosDaSala: async () => [],
    });
    await lan.iniciar();
    const app = express();
    lan.rotas(app);
    const srv = await new Promise((ok) => { const x = app.listen(0, '127.0.0.1', () => ok(x)); });
    servidores.push(srv);
    const post = async (c, corpo) => (await real.fetch(`http://127.0.0.1:${srv.address().port}${c}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json();
    return { lan, post };
  }
  t.after(() => {
    for (const s of servidores) { s.closeAllConnections?.(); s.close(); }
    globalThis.fetch = real.fetch;
    Date.now = real.now;
    console.log = real.log;
    console.warn = real.warn;
    process.env.STRIPE_KEY = real.env.STRIPE_KEY || '';
    process.env.LAN_SEGREDO = real.env.LAN_SEGREDO || '';
  });
  let a = await ligar();
  const x = {
    rel, pedidos, guardadas,
    sessao: (n) => sessoes.get(`cs_test_sessao0000${n}`),
    semRede: (v) => { fora = v; },
    get lan() { return a.lan; },
    post: (...p) => a.post(...p),
    religar: async () => { a = await ligar(); },
    entrar: async (nome) => (await a.post('/lan/conta', { nome, senha: '123456' })).token,
    reservar: (token, inicios) => a.post('/lan/reservar', { token, sala: 'principal', maquina: 'pc', inicios }),
    confirmar: (n) => a.post('/lan/confirmar', { sessao: `cs_test_sessao0000${n}` }),
    estado: async (token, inicio) => (await a.post('/lan/horarios', { token, sala: 'principal', maquina: 'pc', dia: '2026-11-24' })).horas.find((h) => h.inicio === inicio).estado,
  };
  x.ana = await x.entrar('ana');
  x.beto = await x.entrar('beto');
  x.h12 = Date.UTC(2026, 10, 24, 15);
  return x;
}
const gerouPix = (s) => { s.status = 'complete'; };
const pagou = (s) => { s.status = 'complete'; s.payment_status = 'paid'; };

test('o checkout pede um Pix de 10 minutos e o pago na hora vira reserva', async (t) => {
  const x = await montar(t);
  assert.equal((await x.reservar(x.ana, [x.h12])).ok, true);
  assert.equal(x.pedidos[0]['payment_method_options[pix][expires_after_seconds]'], '600');
  pagou(x.sessao(1));
  const r = await x.confirmar(1);
  assert.equal(r.status, 'paga');
  assert.equal(r.horas.length, 1);
  assert.equal(await x.estado(x.ana, x.h12), 'meu');
});

test('Pix gerado e não pago segura a hora só até vencer, e quem paga dentro do prazo fica com ela', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  const r = await x.confirmar(1);
  assert.equal(r.status, 'pendente');
  assert.ok(r.pixAte > x.rel.agora);
  x.rel.agora += 9 * MIN;
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.beto, x.h12), 'ocupado');
  x.rel.agora += 3 * MIN;
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.beto, x.h12), 'livre');
});

test('pago no último minuto do Pix vale', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  await x.lan.conferirPendentes();
  x.rel.agora += 10 * MIN;
  pagou(x.sessao(1));
  x.rel.agora += 2 * MIN;
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.ana, x.h12), 'meu');
});

test('com um Pix em aberto não dá para abrir outro pagamento da mesma hora; vencido, dá', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  const r = await x.reservar(x.ana, [x.h12]);
  assert.equal(r.ok, false);
  assert.match(r.erro, /Pix em aberto/);
  assert.equal(x.pedidos.length, 1);
  x.rel.agora += 12 * MIN;
  assert.equal((await x.reservar(x.ana, [x.h12])).ok, true);
});

test('sem falar com a Stripe, não abre um segundo pagamento por cima do primeiro', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  x.semRede(true);
  const r = await x.reservar(x.ana, [x.h12]);
  assert.equal(r.ok, false);
  x.semRede(false);
  assert.equal(await x.estado(x.ana, x.h12), 'esperando');
});

test('Pix que cai depois que outra pessoa pegou a hora fica para devolver', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  await x.lan.conferirPendentes();
  x.rel.agora += 12 * MIN;
  await x.lan.conferirPendentes();
  await x.reservar(x.beto, [x.h12]);
  pagou(x.sessao(2));
  await x.confirmar(2);
  pagou(x.sessao(1));
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.beto, x.h12), 'meu');
  assert.equal(await x.estado(x.ana, x.h12), 'ocupado');
  assert.equal((await x.confirmar(1)).status, 'devolver');
  assert.equal((await x.post('/lan/minhas', { token: x.ana })).lista[0].status, 'devolver');
});

test('Pix que cai tarde com a hora ainda livre fica com quem pagou', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  await x.lan.conferirPendentes();
  x.rel.agora += 12 * MIN;
  await x.lan.conferirPendentes();
  pagou(x.sessao(1));
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.ana, x.h12), 'meu');
});

test('o servidor reiniciando no meio do Pix não segura a hora para sempre', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  gerouPix(x.sessao(1));
  for (let i = 0; i < 9; i++) {
    x.rel.agora += 5 * MIN;
    await x.religar();
    await x.lan.conferirPendentes();
  }
  assert.equal(await x.estado(x.beto, x.h12), 'livre');
});

test('checkout abandonado (cartão) continua soltando a hora, e voltar a reservar continua funcionando', async (t) => {
  const x = await montar(t);
  await x.reservar(x.ana, [x.h12]);
  assert.equal((await x.reservar(x.ana, [x.h12])).ok, true);
  assert.equal(x.sessao(1).status, 'expired');
  x.sessao(2).status = 'expired';
  await x.lan.conferirPendentes();
  assert.equal(await x.estado(x.beto, x.h12), 'livre');
});

test('a vez encerrada pelo dono não volta quando o pagamento é conferido de novo', async (t) => {
  const x = await montar(t);
  const agora = Date.UTC(2026, 10, 24, 13);
  await x.reservar(x.ana, [agora]);
  pagou(x.sessao(1));
  await x.confirmar(1);
  assert.equal((await x.lan.encerrar({ sala: 'principal', maquina: 'pc' })).ok, true);
  await x.religar();
  await x.lan.conferirPendentes();
  assert.equal((await x.confirmar(1)).status, 'cancelada');
  assert.equal(x.lan.jogadorAgora('principal', 'pc'), null);
});
