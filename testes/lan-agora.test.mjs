// "Jogar agora" (lanhouse.js planoAgora): a vez começa no minuto seguinte e vai até a mesma hora e minuto, n horas
// depois (22:32 → 22:33 às 23:33), sem esperar a hora cheia. A Stripe aqui é de mentira (fetch trocado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');

async function montar(t) {
  const real = { fetch: globalThis.fetch, now: Date.now, env: { ...process.env }, log: console.log, warn: console.warn };
  // 10:05 em Brasília: a hora das 12h está livre
  const rel = { agora: Date.UTC(2026, 10, 25, 1, 32, 20) }; // 22:32:20 em Brasília
  Date.now = () => rel.agora;
  console.log = () => {};
  console.warn = () => {};
  process.env.STRIPE_KEY = 'rk_test_mentira';
  process.env.LAN_SEGREDO = 'segredo';
  const sessoes = new Map();
  const pedidos = [];
  const resp = (status, j) => ({ ok: status < 400, status, json: async () => j });
  globalThis.fetch = async (url, op = {}) => {
    if (!String(url).startsWith('https://api.stripe.com/')) return real.fetch(url, op);
    const caminho = String(url).split('/v1/')[1];
    if (caminho.startsWith('products/prod_VhePW44U1zjLbZ')) return resp(200, { name: 'Jogar agora', default_price: { id: 'price_agora', type: 'one_time', unit_amount: 1500, currency: 'brl' } });
    if (caminho.startsWith('products/')) return resp(200, { name: 'Hora', default_price: { id: 'price_1', type: 'one_time', unit_amount: 1000, currency: 'brl' } });
    if (caminho === 'checkout/sessions') {
      const corpo = Object.fromEntries(new URLSearchParams(op.body));
      pedidos.push(corpo);
      const s = { id: `cs_test_sessao0000${sessoes.size + 1}`, url: 'https://checkout.stripe.com/x', status: 'open', payment_status: 'unpaid', expires_at: Number(corpo.expires_at) };
      sessoes.set(s.id, s);
      return resp(200, { ...s });
    }
    const [, , id] = caminho.split('/');
    return resp(200, { ...sessoes.get(id) });
  };
  const guardadas = new Map();
  const contas = new Map();
  const banco = {
    lerReservas: async () => [...guardadas.values()].map((r) => ({ ...r })),
    // só as colunas que o banco de verdade guarda (a dublagem volta 0, 1 ou null, como do MySQL)
    salvarReserva: async ({ id, sala, conta, maquina, jogo, jogoNome, dublagem, fimCedo, inicio, status, sessao, expira, criada }) => {
      guardadas.set(id, { id, sala, conta, maquina, jogo, jogoNome, dublagem: dublagem == null ? null : Number(dublagem) ? 1 : 0, fimCedo: fimCedo || undefined, inicio, status, sessao, expira, criada });
    },
    lerTestes: async () => [],
    salvarTeste: async () => {},
    lerConta: async (n) => contas.get(n) || null,
    criarConta: async (n, senhaHash) => { contas.set(n, { senhaHash }); return true; },
  };
  const criar = require('../lanhouse.js');
  const servidores = [];
  const cfg = { abre: 8, fecha: 24 };
  async function ligar() {
    const lan = criar({
      banco, hashSenha: (s) => s, confereSenha: (a, b) => a === b, podeTentar: () => true, bloqueado: () => false,
      configDaSala: async () => ({ lanhouse: { ligada: true, abre: cfg.abre, fecha: cfg.fecha } }), jogosDaSala: async () => [],
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
    rel, pedidos, cfg, sessoes,
    get lan() { return a.lan; },
    religar: async () => { a = await ligar(); },
    entrar: async (nome) => (await a.post('/lan/conta', { nome, senha: '123456' })).token,
    agora: (token, horas, maquina = 'ps5') => a.post('/lan/reservar', { token, sala: 'principal', maquina, agora: true, horas }),
    reservar: (token, inicios, maquina = 'ps5') => a.post('/lan/reservar', { token, sala: 'principal', maquina, inicios }),
    horarios: (token, maquina = 'ps5') => a.post('/lan/horarios', { token, sala: 'principal', maquina }),
    pagar: async (n) => {
      const s = sessoes.get(`cs_test_sessao0000${n}`);
      s.status = 'complete';
      s.payment_status = 'paid';
      return a.post('/lan/confirmar', { sessao: s.id });
    },
  };
  return x;
}

const MIN = 60_000;
const HORA = 3600_000;
const ms = (h, m) => Date.UTC(2026, 10, 24, h + 3, m); // hh:mm de 24/11 em Brasília (h pode passar de 24)

test('22:32 livre: joga das 22:33 às 23:33 e paga 1 hora', async (t) => {
  const x = await montar(t);
  const ana = await x.entrar('ana');
  const h = await x.horarios(ana);
  // 2 h passariam da meia-noite (esta sala fecha às 24h e abre às 8h): livre até 00:00
  assert.equal(h.jogarAgora.inicio, ms(22, 33));
  assert.equal(h.jogarAgora.max, 1);
  assert.equal(h.jogarAgora.livreAte, ms(24, 0));
  assert.equal(h.jogarAgora.dia24, false);
  const r = await x.agora(ana, 1);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(x.pedidos[0]['line_items[0][quantity]'], '1');
  assert.equal(x.pedidos[0]['line_items[0][price]'], 'price_agora'); // o produto do jogar agora (R$ 15)
  const c = await x.pagar(1);
  assert.equal(c.status, 'paga');
  assert.equal(c.agoraAte, ms(23, 33));
});

test('Pix pago 8 min depois: o tempo conta do pagamento (22:41 às 23:41)', async (t) => {
  const x = await montar(t);
  const ana = await x.entrar('ana');
  await x.agora(ana, 1);
  x.rel.agora = ms(22, 40) + 5000;
  const c = await x.pagar(1);
  assert.equal(c.agoraAte, ms(23, 41));
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').fim, ms(23, 41));
});

test('a vez acaba às 23:33, fica no banco e depois a máquina fica livre para outro jogar agora', async (t) => {
  const x = await montar(t);
  const ana = await x.entrar('ana');
  const beto = await x.entrar('beto');
  await x.agora(ana, 1);
  await x.pagar(1);
  x.rel.agora = ms(23, 0);
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').conta, 'ana');
  assert.equal((await x.agora(beto, 1)).erro, 'O PS5 está com ana agora. Escolha um horário na agenda.');
  await x.religar(); // o servidor reiniciou: o fim no meio da hora vem do banco
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').fim, ms(23, 33));
  x.rel.agora = ms(23, 33) + 1000;
  assert.equal(x.lan.jogadorAgora('principal', 'ps5'), null);
  x.cfg.fecha = 24;
  const h = await x.horarios(beto);
  assert.equal(h.jogarAgora, null); // 23:34 + 1 h passa da meia-noite
});

test('a próxima hora já é de outra pessoa: não dá para jogar agora', async (t) => {
  const x = await montar(t);
  const ana = await x.entrar('ana');
  const beto = await x.entrar('beto');
  assert.equal((await x.reservar(beto, [ms(23, 0)])).ok, true);
  await x.pagar(1);
  assert.equal((await x.horarios(ana)).jogarAgora, null);
  assert.match((await x.agora(ana, 1)).erro, /23h já é de outra pessoa/);
});

test('a sala fecha antes do fim: avisa', async (t) => {
  const x = await montar(t);
  x.cfg.fecha = 23;
  await x.religar();
  const ana = await x.entrar('ana');
  assert.match((await x.agora(ana, 1)).erro, /aluga das 8h às 23h/);
});

test('aberta 24 h e a próxima reserva às 02h: livre até as 02:00, e a agenda segue no preço normal', async (t) => {
  const x = await montar(t);
  x.cfg.abre = 0;
  await x.religar();
  const ana = await x.entrar('ana');
  const beto = await x.entrar('beto');
  assert.equal((await x.reservar(beto, [ms(26, 0)])).ok, true);
  assert.equal(x.pedidos[0]['line_items[0][price]'], 'price_1');
  await x.pagar(1);
  const j = (await x.horarios(ana)).jogarAgora;
  assert.equal(j.max, 3); // 22:33 às 01:33
  assert.equal(j.livreAte, ms(26, 0));
  assert.equal(j.dia24, true);
  assert.equal(j.preco.valor, 1500);
});
