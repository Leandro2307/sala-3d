// O modo automático, a volta sozinha do turbo, o canal parado e o socorro (turbo-auto.js e turbo.js): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurboAuto, TurboVolta, avaliar, resumirAmostra } from '../public/js/turbo-auto.js';
import { TurboEnvio, TurboRecebe, vidaDoCanal } from '../public/js/turbo.js';

const BOA = { turbo: {}, fpsFinal: 59.5, atrasoMs: 70, rttMs: 8, ritmo: { travadas: 0, trancos: 1 }, la: { captura: 60, turbo: { bandaKbps: 11000 } } };
const RUIM = { turbo: {}, fpsFinal: 48, atrasoMs: 121, rttMs: 55, ritmo: { travadas: 1, trancos: 3 }, la: { captura: 60, turbo: { bandaKbps: null } } };
const PESSIMA = { ...RUIM, fpsFinal: 30, atrasoMs: 250, ritmo: { travadas: 2, trancos: 10 } };

function montar(modos = [14, 16, 17]) {
  const r = { t: 0, trocas: [], eventos: [] };
  r.auto = new TurboAuto({ modos, agora: () => r.t, aplicar: (id) => r.trocas.push(id), onEvento: (texto, dados) => r.eventos.push({ texto, dados }) });
  r.passar = (seg, am) => { for (let i = 0; i < seg / 2; i++) { r.t += 2000; r.auto.amostra(typeof am === 'function' ? am(r.auto.atual) : am); } };
  return r;
}

test('as sessões reais de 2026-11-25: o /jogar sai bom e a sala sai ruim', () => {
  assert.equal(avaliar(Array(10).fill(resumirAmostra(BOA))).bom, true);
  assert.equal(avaliar(Array(10).fill(resumirAmostra(RUIM))).bom, false);
});

test('as travadas vêm numa lista (ritmo.js), e a nota é sempre um número', () => {
  const a = resumirAmostra({ ...RUIM, ritmo: { travadas: [{ ms: 400, causa: 'x' }, { ms: 90, causa: 'y' }], trancos: 5 } });
  assert.equal(a.travadas, 2);
  assert.ok(Number.isFinite(avaliar(Array(10).fill(a)).nota));
  assert.equal(resumirAmostra({ ...BOA, ritmo: { travadas: [], trancos: 0 } }).travadas, 0);
  assert.ok(Number.isFinite(avaliar([resumirAmostra({})]).nota));
});

test('automático: não mede enquanto a banda sobe, e fica no padrão se ele é bom', () => {
  const r = montar();
  r.auto.comecar();
  let b = 3000;
  r.passar(14, () => ({ ...BOA, la: { captura: 60, turbo: { bandaKbps: (b *= 1.3) } } }));
  assert.equal(r.auto.fase, 'espera'); // passou do mínimo, mas a banda ainda subia
  r.passar(10, BOA);
  assert.equal(r.auto.fase, 'mede');
  r.passar(22, BOA);
  assert.equal(r.auto.fase, 'fixo');
  assert.equal(r.auto.escolhido, 14);
  assert.deepEqual(r.trocas, []);
});

test('automático: banda que nunca assenta não espera para sempre', () => {
  const r = montar();
  r.auto.comecar();
  let i = 0;
  r.passar(28, () => ({ ...BOA, la: { captura: 60, turbo: { bandaKbps: i++ % 2 ? 4000 : 9000 } } }));
  assert.equal(r.auto.fase, 'mede');
});

test('automático: padrão ruim, rápido ruim, TV boa: fica na TV', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(140, (modo) => (modo === 17 ? BOA : RUIM));
  assert.equal(r.auto.fase, 'fixo');
  assert.equal(r.auto.escolhido, 17);
  assert.deepEqual(r.trocas, [16, 17]);
});

test('automático: padrão ruim e rápido bom: nem testa a TV', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(140, (modo) => (modo === 16 ? BOA : RUIM));
  assert.equal(r.auto.escolhido, 16);
  assert.deepEqual(r.trocas, [16]);
});

test('automático: nenhum bom, fica no de menor nota (e volta para ele)', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(160, (modo) => (modo === 16 ? RUIM : PESSIMA));
  assert.equal(r.auto.escolhido, 16);
  assert.deepEqual(r.trocas, [16, 17, 16]);
  // empate: fica no padrão
  const e = montar();
  e.auto.comecar();
  e.passar(160, RUIM);
  assert.equal(e.auto.escolhido, 14);
});

test('automático: depois de decidir, só mede de novo se ficar ruim de verdade e com tempo entre as rodadas', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(60, BOA);
  assert.equal(r.auto.fase, 'fixo');
  r.passar(60, RUIM);
  assert.equal(r.auto.fase, 'fixo'); // cedo demais
  r.passar(120, RUIM);
  assert.notEqual(r.auto.rodadas, 1);
  r.passar(4000, RUIM);
  assert.ok(r.auto.rodadas <= 4);
});

test('automático: página em segundo plano não conta, e escolher à mão desliga', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(12, BOA);
  assert.equal(r.auto.fase, 'mede');
  r.auto.amostra(PESSIMA, true);
  assert.equal(r.auto.fase, 'espera');
  r.auto.desligar();
  r.passar(200, PESSIMA);
  assert.deepEqual(r.trocas, []);
  r.auto.ligar(true);
  assert.equal(r.auto.fase, 'espera');
});

test('automático: o próximo jogo começa no que deu certo', () => {
  const r = montar();
  r.auto.comecar();
  r.passar(140, (modo) => (modo === 17 ? BOA : RUIM));
  r.auto.parar();
  assert.equal(r.auto.inicial, 17);
  r.auto.comecar();
  assert.equal(r.auto.atual, 17);
});

test('volta do turbo: espera crescente, desiste depois de 4 e não insiste no que não tem jeito', () => {
  const marcados = [];
  let t = 0;
  let ligou = 0;
  let pode = true;
  const v = new TurboVolta({ ligar: () => { ligou++; v.ligou(); }, pode: () => pode, agora: () => t, esperar: (f, ms) => { marcados.push({ f, ms }); return marcados.length; }, cancelar: () => {} });
  assert.equal(v.falhou('navegador'), false);
  assert.equal(v.falhou('sem-controle'), false);
  for (const ms of [6000, 20_000, 60_000, 120_000]) {
    assert.equal(v.falhou('lento'), true);
    assert.equal(marcados.at(-1).ms, ms);
    marcados.at(-1).f();
    t += 5000;
  }
  assert.equal(ligou, 4);
  assert.equal(v.falhou('lento'), false);
  t += 100_000; // durou: as tentativas zeram
  assert.equal(v.falhou('sem-imagem'), true);
  assert.equal(marcados.at(-1).ms, 6000);
  pode = false; // saiu do jogo enquanto esperava
  marcados.at(-1).f();
  assert.equal(ligou, 4);
});

// ------------------------------------------------------------------ o canal parado (quem compartilha)
function repassando({ inicio = -60_000, rxs = [12_000] } = {}) {
  const eventos = [];
  const envio = new TurboEnvio({ tela: () => null, onEvento: (id, texto, dados) => eventos.push({ texto, dados }) });
  const pedidos = [];
  envio.ligar = (id, canal, p) => pedidos.push(p);
  const s = { id: 'a', key: 'k', canal: { readyState: 'open' }, ps5: { kbps: 20_000 }, cfg: { h: 1080 }, inicioEm: inicio, ajuste: { rxs }, pedido: { ligar: 'k', codecs: [], versao: 2 } };
  return { envio, s, pedidos, eventos };
}

test('canal parado no repasse: passa a codificar aqui com menos banda, sem aviso de quem joga', () => {
  const { envio, s, pedidos, eventos } = repassando();
  s.saiuTotal = 500_000;
  let fila = 60_000;
  let t = 0;
  assert.equal(envio.repasseParado(s, fila, t), false);
  // nada anda: o que entra fica todo na fila
  for (; t < 690; t += 16) { s.saiuTotal += 2000; fila += 2000; assert.equal(envio.repasseParado(s, fila, t), false, String(t)); }
  t = 720;
  assert.equal(envio.repasseParado(s, fila, t), true);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].recodificar, true);
  assert.equal(pedidos[0].porFalha, true);
  assert.equal(pedidos[0].bandaInicialKbps, 7200);
  assert.equal(pedidos[0].tetoKbps, 10_200);
  assert.match(eventos[0].texto, /canal parou/);
  assert.equal(envio.lembrado('a').semRepasse, true);
  assert.equal(envio.memoria.get('a').freio.tetoKbps, 10_200); // ligar de novo em 1 min não volta à banda que parou
  assert.ok(envio.esperaRepasse(envio.memoria.get('a')) >= 5 * 60_000);
  assert.equal(envio.repasseParado(s, fila, t + 2000), false); // já trocando
});

test('canal cheio mas andando, ou vazio com a tela parada: não é parada', () => {
  const { envio, s, pedidos } = repassando();
  s.saiuTotal = 500_000;
  for (let t = 0; t < 5000; t += 16) { s.saiuTotal += 40_000; assert.equal(envio.repasseParado(s, 150_000, t), false); }
  for (let t = 5000; t < 10_000; t += 16) assert.equal(envio.repasseParado(s, 0, t), false);
  assert.equal(pedidos.length, 0);
});

test('canal parado no começo da sessão tem mais tempo; PC direto não entra nisso', () => {
  const { envio, s, pedidos } = repassando({ inicio: 0 });
  s.saiuTotal = 100_000;
  envio.repasseParado(s, 80_000, 0);
  assert.equal(envio.repasseParado(s, 80_000, 900), false);
  assert.equal(envio.repasseParado(s, 80_000, 1250), true);
  const pc = repassando();
  pc.s.ps5 = { banda: {} };
  pc.envio.repasseParado(pc.s, 80_000, 0);
  assert.equal(pc.envio.repasseParado(pc.s, 80_000, 5000), false);
  assert.equal(pedidos.length, 1);
});

// ------------------------------------------------------------------ o socorro (quem joga)
test('antes de desistir, quem joga pede uma vez a imagem codificada lá com menos banda', () => {
  const mandados = [];
  const falhas = [];
  const tr = new TurboRecebe({ abrir: () => null, abrirSom: () => null, onFalhou: (m) => falhas.push(m) });
  const s = { canal: { readyState: 'open', send: (m) => mandados.push(JSON.parse(m)), close() {} }, pedido: { ligar: 'k', codecs: ['avc1.640033'], versao: 2 }, rxBons: [10_000, 8000], desenhou: 5 };
  tr.s = s;
  tr.falhou = (m) => falhas.push(m);
  tr.desistir(s, 'lento'); // socorro desligado (a TV): como antes
  assert.deepEqual(falhas, ['lento']);
  tr.socorro = true;
  tr.desistir(s, 'lento');
  assert.equal(falhas.length, 1);
  assert.equal(mandados.length, 1);
  assert.equal(mandados[0].ligar, 'k');
  assert.equal(mandados[0].recodificar, true);
  assert.equal(mandados[0].socorro, true);
  assert.equal(mandados[0].bandaInicialKbps, 6000);
  assert.ok(s.paradaEm > 0);
  tr.desistir(s, 'lento'); // não adiantou: vídeo normal
  assert.deepEqual(falhas, ['lento', 'lento']);
});

test('a vida do canal cresce com a distância, e o canal sem prazo continua sem prazo', () => {
  assert.equal(vidaDoCanal(250, null), 250);
  assert.equal(vidaDoCanal(250, 8), 250);
  assert.equal(vidaDoCanal(250, 55), 315);
  assert.equal(vidaDoCanal(250, 280), 990);
  assert.equal(vidaDoCanal(250, 5000), 1500);
  assert.equal(vidaDoCanal(null, 280), null);
});

test('a folga do liso muda na hora, sem ligar de novo', () => {
  const tr = new TurboRecebe({ abrir: () => null, abrirSom: () => null });
  assert.equal(tr.mudarLiso(0.95, 15), false); // desligado: vale na próxima
  assert.equal(tr.lisoMax, 15);
  tr.s = { alvo: 40, lisoMax: 45 };
  assert.equal(tr.mudarLiso(0.95, 15), true);
  assert.equal(tr.s.lisoMax, 15);
  assert.equal(tr.s.alvo, 15);
});
