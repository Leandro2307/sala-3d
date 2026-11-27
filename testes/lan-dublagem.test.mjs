// A dublagem escolhida ao alugar o PS5 (lan.html "Quero o modo dublado" → lanhouse.js): desmarcada, a vez vem
// com semDublagem (o PC da casa manda só o som do jogo para essa pessoa). Marcada, sem a pergunta (PC) ou
// liberada pelo dono, vem com a dublagem. A Stripe aqui é de mentira (fetch trocado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');

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
  const resp = (status, j) => ({ ok: status < 400, status, json: async () => j });
  globalThis.fetch = async (url, op = {}) => {
    if (!String(url).startsWith('https://api.stripe.com/')) return real.fetch(url, op);
    const caminho = String(url).split('/v1/')[1];
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
    salvarReserva: async ({ id, sala, conta, maquina, jogo, jogoNome, dublagem, inicio, status, sessao, expira, criada }) => {
      guardadas.set(id, { id, sala, conta, maquina, jogo, jogoNome, dublagem: dublagem == null ? null : Number(dublagem) ? 1 : 0, inicio, status, sessao, expira, criada });
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
    rel, pedidos,
    get lan() { return a.lan; },
    religar: async () => { a = await ligar(); },
    entrar: async (nome) => (await a.post('/lan/conta', { nome, senha: '123456' })).token,
    // aluga, paga e chega a hora
    async alugar(token, maquina, extra = {}) {
      const h12 = Date.UTC(2026, 10, 24, 15);
      const r = await a.post('/lan/reservar', { token, sala: 'principal', maquina, inicios: [h12], ...extra });
      assert.equal(r.ok, true, JSON.stringify(r));
      const s = sessoes.get(`cs_test_sessao0000${sessoes.size}`);
      s.status = 'complete';
      s.payment_status = 'paid';
      assert.equal((await a.post('/lan/confirmar', { sessao: s.id })).status, 'paga');
      rel.agora = h12 + 5 * 60_000;
    },
  };
  return x;
}

test('PS5 alugado com a dublagem desmarcada: a vez vem sem dublagem, e continua assim depois de reiniciar', async (t) => {
  const x = await montar(t);
  await x.alugar(await x.entrar('ana'), 'ps5', { dublagem: false });
  assert.equal(x.pedidos[0]['metadata[dublagem]'], 'não');
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').semDublagem, true);
  await x.religar();
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').semDublagem, true);
});

test('PS5 alugado com a dublagem marcada (ou sem a resposta): vem com ela', async (t) => {
  const x = await montar(t);
  await x.alugar(await x.entrar('ana'), 'ps5', { dublagem: true });
  assert.equal(x.pedidos[0]['metadata[dublagem]'], 'sim');
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').semDublagem, false);
});

test('PC não tem a pergunta: um dublagem:false perdido não vale', async (t) => {
  const x = await montar(t);
  await x.alugar(await x.entrar('ana'), 'pc', { dublagem: false });
  assert.equal(x.pedidos[0]['metadata[dublagem]'], undefined);
  assert.equal(x.lan.jogadorAgora('principal', 'pc').semDublagem, false);
});

test('liberado pelo dono (cortesia) vem com a dublagem', async (t) => {
  const x = await montar(t);
  await x.entrar('beto');
  assert.equal((await x.lan.liberar({ sala: 'principal', maquina: 'ps5', conta: 'beto', horas: 1 })).ok, true);
  await x.lan.comecarLiberadas('principal', 'beto');
  assert.equal(x.lan.jogadorAgora('principal', 'ps5').semDublagem, false);
});
