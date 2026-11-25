// O teste da conexão (turbo-teste.js): as contas, o plano da banda com caminhos de mentira e as escolhas
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirDegrau, planoDaBanda, escolher, escolherCaminho, escolherCodec, escolherModo, MemoriaTeste } from '../public/js/turbo-teste.js';
import { TurboEnvio } from '../public/js/turbo.js';
import { TurboAuto, avaliar, foraDoModo } from '../public/js/turbo-auto.js';

// um degrau: um pedaço de 1100 bytes a cada tanto, com a viagem e o que falta
function degrau({ kbps, ms = 1500, viagem = () => 25, some = () => false, desde = 1000 }) {
  const n = Math.round((kbps * ms) / 8 / 1100);
  const chegadas = [];
  for (let i = 0; i < n; i++) {
    const t0 = desde + (i * ms) / n;
    if (some(t0 - desde)) continue;
    chegadas.push({ t0: t0 - 5000, em: t0 + viagem(t0 - desde), bytes: 1100 });
  }
  return { chegadas, envio: { bytes: n * 1100, pedacos: n, adiados: 0 }, pedido: { kbps, ms }, fim: desde + ms };
}

test('degrau limpo passa, e o relógio diferente dos dois PCs não conta', () => {
  const r = resumirDegrau(degrau({ kbps: 9000 }));
  assert.equal(r.ok, true);
  assert.equal(r.perdaPct, 0);
  assert.ok(r.filaP90 < 1);
  assert.ok(Math.abs(r.chegouKbps - 9000) < 100);
});

test('corte de 1 s: não passa e diz corte', () => {
  const r = resumirDegrau(degrau({ kbps: 12000, some: (t) => t > 300 && t < 1300 }));
  assert.equal(r.ok, false);
  assert.equal(r.corte, true);
  assert.match(r.porque, /corte/);
});

test('buraco porque a página de um dos lados parou não é do caminho', () => {
  const d = degrau({ kbps: 12000, viagem: (t) => (t > 400 && t < 800 ? 25 + 800 - t : 25) });
  assert.equal(resumirDegrau({ ...d, travouAqui: 390 }).porque?.includes('buraco') ?? false, false);
  assert.match(resumirDegrau(d).porque, /buraco/);
});

test('corte que não volta até o fim também é corte', () => {
  const r = resumirDegrau(degrau({ kbps: 12000, some: (t) => t > 700 }));
  assert.equal(r.corte, true);
});

test('a fila crescendo e a perda reprovam; um soluço curto não', () => {
  assert.match(resumirDegrau(degrau({ kbps: 9000, viagem: (t) => 25 + t / 10 })).porque, /fila/);
  let k = 0;
  assert.match(resumirDegrau(degrau({ kbps: 9000, some: () => ++k % 30 === 0 })).porque, /perda/);
  assert.equal(resumirDegrau(degrau({ kbps: 9000, viagem: (t) => (t > 500 && t < 560 ? 80 : 25) })).ok, true);
});

test('nada chegou, ou quem compartilha não respondeu', () => {
  const d = degrau({ kbps: 3000, some: () => true });
  assert.equal(resumirDegrau(d).ok, false);
  assert.match(resumirDegrau({ ...d, envio: null }).porque, /sem resposta/);
});

// roda o plano num caminho de mentira: limite(kbps, d) -> passa?
function rodar(limite, op = {}) {
  const g = planoDaBanda(op);
  const passos = [];
  let p = g.next();
  while (!p.done) {
    passos.push(p.value);
    p = g.next({ ok: limite(p.value.kbps, p.value), chegouKbps: Math.min(p.value.kbps, 2000), tremidoMs: 10, perdaPct: 0, buracoMs: 40 });
    assert.ok(passos.length < 30);
  }
  return { r: p.value, passos, ms: passos.reduce((s, d) => s + d.ms, 0) };
}

test('caminho largo: vai até a banda do PS5 e fica livre, em menos de 20 s', () => {
  const { r, ms } = rodar(() => true, { ps5Kbps: 20000 });
  assert.deepEqual([r.tetoKbps, r.livre], [20000, true]);
  assert.ok(ms < 20000, String(ms));
});

test('caminho que corta em 12 Mbps: o teto fica abaixo', () => {
  const { r } = rodar((k) => k < 12000, { ps5Kbps: 20000 });
  assert.equal(r.livre, false);
  assert.ok(r.tetoKbps < 12000 && r.tetoKbps > 9500, String(r.tetoKbps));
});

test('o corte só aparece nos 5 s da confirmação: desce', () => {
  const { r } = rodar((k, d) => !d.confirma || k <= 12000, { ps5Kbps: 20000 });
  assert.equal(r.livre, false);
  assert.ok(r.tetoKbps <= 12000 && r.tetoKbps >= 8000, String(r.tetoKbps));
});

test('um soluço num degrau não para a subida', () => {
  let n = 0;
  const { r } = rodar(() => ++n !== 3, { ps5Kbps: 20000 });
  assert.equal(r.tetoKbps, 20000);
});

test('nem 3 Mbps passa: um teto do que chegou', () => {
  const { r } = rodar(() => false, { ps5Kbps: 20000 });
  assert.equal(r.tetoKbps, 1600);
});

test('PS5 em banda baixa ainda testa até 12 Mbps', () => {
  assert.equal(rodar(() => true, { ps5Kbps: 10000 }).r.tetoKbps, 12000);
});

const bom = { quadros: 90, saiu: 90, decP50: 3, decP95: 6, codP50: 8, codP95: 11, segurando: false };
test('codec: H.265 com pouca banda, H.264 com banda sobrando ou sem suporte', () => {
  assert.equal(escolherCodec({ h264: bom, h265: bom, tetoKbps: 8000, livre: false }).codec, 'h265');
  assert.equal(escolherCodec({ h264: bom, h265: bom, tetoKbps: 20000, livre: true }).codec, 'h264');
  assert.equal(escolherCodec({ h264: bom, h265: { erro: 'codificador' }, tetoKbps: 8000 }).codec, 'h264');
  assert.equal(escolherCodec({ h264: bom, h265: { ...bom, decP95: 40 }, tetoKbps: 8000 }).codec, 'h264');
  assert.equal(escolherCodec({ h264: bom, h265: { ...bom, decP50: 14 }, tetoKbps: 8000 }).codec, 'h264');
  assert.equal(escolherCodec({ h264: { ...bom, segurando: true }, h265: bom, tetoKbps: 20000 }).codec, 'h265');
  assert.equal(escolherCodec({ h264: bom, h265: bom, tetoKbps: 20000, livre: true, ps5Hevc: true }).codec, 'h265');
});

test('modo: rápido só com a conexão parada', () => {
  const c = { ok: true, tremidoMs: 3, perdaPct: 0, buracoMs: 40 };
  assert.equal(escolherModo({ padrao: 17, rapido: 16, confirma: c }).modo, 16);
  assert.equal(escolherModo({ padrao: 17, rapido: 16, confirma: { ...c, tremidoMs: 10 } }).modo, 17);
  assert.equal(escolherModo({ padrao: 14, rapido: 16, confirma: { ...c, ok: false } }).modo, 14);
});

test('a banda sugerida para o PS5', () => {
  const banda = { tetoKbps: 9300, livre: false, confirma: { ok: true, tremidoMs: 10, perdaPct: 0, buracoMs: 50 } };
  assert.equal(escolher({ banda, h264: bom, h265: bom, ps5: { kbps: 20000 }, padrao: 17, rapido: 16 }).ps5Sugerido, 9000);
  assert.equal(escolher({ banda: { ...banda, tetoKbps: 20000, livre: true }, ps5: { kbps: 20000 }, padrao: 17, rapido: 16 }).ps5Sugerido, null);
});

test('o teste de há pouco vale no mesmo caminho', () => {
  let agora = 0;
  const m = new MemoriaTeste(() => agora);
  m.guardar('d', { modo: 17 }, { familia: 'ipv4', rttMs: 8 });
  assert.ok(m.valido('d', { familia: 'ipv4', rttMs: 10 }));
  assert.equal(m.valido('d', { familia: 'ipv6', rttMs: 10 }), null);
  assert.equal(m.valido('d', { familia: 'ipv4', rttMs: 50 }), null);
  assert.match(m.porque, /de 8 para 50/);
  agora = 11 * 60_000;
  assert.equal(m.valido('d', { familia: 'ipv4', rttMs: 8 }), null);
});

// ------------------------------------------------------------ o teto no PC que compartilha
function envio() {
  const eventos = [];
  const e = new TurboEnvio({ tela: () => null, onEvento: (id, texto) => eventos.push(texto) });
  e.ligados = [];
  e.ligar = (id, canal, p) => e.ligados.push(p);
  return { e, eventos };
}

test('o corte aprendido limita, e o menor (teste ou corte) vale', () => {
  const { e } = envio();
  assert.equal(e.tetoDe('a', {}), null);
  assert.equal(e.tetoDe('a', { teto: 15000 }), 15000);
  assert.equal(e.lembrarCorte('a', 3000), null); // pouca banda: não foi por passar dela
  assert.equal(e.lembrarCorte('a', 12500), 10000);
  assert.equal(e.tetoDe('a', { teto: 15000 }), 10000);
  assert.equal(e.tetoDe('a', {}), 10000);
  e.lembrarCorte('a', 16000);
  assert.equal(e.tetoDe('a', {}), 10000);
});

test('PS5 repassado: abaixo do teto fica; passou, é codificado aqui antes do corte', () => {
  const { e, eventos } = envio();
  const s = { id: 'a', key: 'k', canal: {}, ps5: { kbps: 20000 }, pedido: { ligar: 'k', teto: 10000 }, inicioEm: 0 };
  let agora = 5000;
  for (let i = 0; i < 180; i++) assert.equal(e.repasseAcima(s, (9000 * 1000) / 8 / 60, (agora += 1000 / 60)), false);
  let caiu = false;
  for (let i = 0; i < 90 && !caiu; i++) caiu = e.repasseAcima(s, (14000 * 1000) / 8 / 60, (agora += 1000 / 60));
  assert.equal(caiu, true);
  assert.equal(e.ligados[0].recodificar, true);
  assert.equal(e.ligados[0].bandaInicialKbps, 9000);
  assert.equal(e.lembrado('a').acima, true);
  assert.match(eventos[0], /antes de cortar/);
});

test('sem teto conhecido o repasse fica como sempre', () => {
  const { e } = envio();
  const s = { id: 'a', ps5: { kbps: 50000 }, pedido: {}, inicioEm: 0 };
  for (let i = 0; i < 120; i++) assert.equal(e.repasseAcima(s, 100000, 5000 + i * 16), false);
  assert.equal(e.cabeNoTeto(null, { kbps: 50000 }), true);
});

test('cabe no teto pelo que o PS5 manda de verdade', () => {
  const { e } = envio();
  assert.equal(e.cabeNoTeto(10000, { kbps: 20000, taxa: () => ({ media: 5000, pico: 7000 }) }), true);
  assert.equal(e.cabeNoTeto(10000, { kbps: 20000, taxa: () => ({ media: 9000, pico: 11000 }) }), false);
  assert.equal(e.cabeNoTeto(10000, { kbps: 10000, taxa: () => ({ media: 9000, pico: 11000 }) }), true);
});

// ------------------------------------------------------------ o automático depois do teste
const amostra = (o = {}) => ({ turbo: { silencioMaxMs: 40, ...o.turbo }, fpsFinal: o.qps ?? 60, atrasoMs: o.atraso ?? 100, rttMs: 50, la: { captura: 60, turbo: { bandaKbps: o.banda ?? null }, ps5: { manda: o.manda ?? 60 } }, ritmo: { trancos: o.trancos ?? 1, travadas: o.travadas ?? [] }, conexao: { par: o.par ?? 'p' }, somWebrtc: { inventadoPct: o.inventado ?? 0 } });

test('o que não é do modo não conta', () => {
  assert.equal(foraDoModo(amostra()), null);
  assert.equal(foraDoModo(amostra({ turbo: { silencioMaxMs: 1400 } })), 'caminho');
  assert.equal(foraDoModo(amostra({ inventado: 50 })), 'caminho');
  assert.equal(foraDoModo(amostra({ manda: 47 })), 'fonte');
  assert.equal(foraDoModo(amostra({ manda: 30 })), null);
});

test('um soluço isolado não reprova o modo (era o caso do Turbo da TV às 16:53)', () => {
  const l = Array.from({ length: 10 }, (_, i) => ({ turbo: true, qps: i === 3 ? 42 : 59, captura: 60, atrasoMs: 121, rttMs: 56, travadas: i === 3 ? 2 : 0, trancos: i === 3 ? 11 : 3 }));
  assert.equal(avaliar(l).bom, true);
});

function auto() {
  const ev = [];
  let agora = 0;
  const a = new TurboAuto({ modos: [17, 16, 14], aplicar: (id) => ev.push(`aplicar ${id}`), onEvento: (t) => ev.push(t), agora: () => agora });
  return { a, ev, passar: (o, n = 1) => { for (let i = 0; i < n; i++) { agora += 2000; a.amostra(amostra(o)); } } };
}

test('começa decidido pelo teste, e cortes do caminho não o fazem trocar', () => {
  const { a, ev, passar } = auto();
  a.comecarCom(17);
  assert.equal(a.fase, 'fixo');
  passar({ turbo: { silencioMaxMs: 1400 }, qps: 10, travadas: [{}, {}] }, 10);
  passar({}, 5);
  passar({ turbo: { silencioMaxMs: 1400 }, qps: 10, travadas: [{}, {}] }, 10);
  passar({}, 100);
  assert.equal(a.atual, 17);
  assert.ok(!ev.some((x) => /aplicar/.test(x)), ev.join());
});

test('ruim de verdade depois do teste: mede de novo e troca', () => {
  const { a, ev, passar } = auto();
  a.comecarCom(17);
  passar({ qps: 40, trancos: 20, atraso: 250 }, 130);
  assert.ok(ev.some((x) => /piorou/.test(x)));
  assert.ok(ev.some((x) => x === 'aplicar 16'));
});

test('o caminho trocou no meio da medida: recomeça', () => {
  const { a, ev, passar } = auto();
  a.comecar();
  passar({}, 8);
  assert.equal(a.fase, 'mede');
  passar({ par: 'outro' });
  assert.equal(a.fase, 'espera');
  assert.ok(ev.some((x) => /recomeçando/.test(x)));
  passar({ par: 'outro' }, 20);
  assert.equal(a.fase, 'fixo');
});

// ------------------------------------------------------------ direto e TURN
const via = (rttMs, o = {}) => ({ rttMs, banda: { tetoKbps: o.teto ?? 12000, livre: o.livre ?? true, confirma: { ok: o.ok ?? true, tremidoMs: o.tremido ?? 5, perdaPct: 0, buracoMs: 30 } } });

test('caminho: o TURN ganha só com folga', () => {
  assert.equal(escolherCaminho({ direto: via(260), turn: via(50) }).caminho, 'turn'); // o iPhone no 5G
  assert.equal(escolherCaminho({ direto: via(8), turn: via(30) }).caminho, 'direto');
  assert.equal(escolherCaminho({ direto: via(50), turn: via(45) }).caminho, 'direto'); // parecido: sem o servidor no meio
  assert.equal(escolherCaminho({ direto: via(90), turn: null }).caminho, 'direto');
  assert.equal(escolherCaminho({ direto: via(60, { teto: 2000, ok: false }), turn: via(55) }).caminho, 'turn'); // o direto não leva a banda
  assert.equal(escolherCaminho({ direto: via(120), turn: via(50, { teto: 1500, ok: false }) }).caminho, 'direto'); // nem o TURN
  assert.equal(escolherCaminho({ direto: via(120), turn: { rttMs: 40, banda: null } }).caminho, 'direto'); // não mediu
});

test('longe: menos banda, modo com folga, e o teste não passa de 12 Mbps', () => {
  const r = escolher({ banda: { tetoKbps: 20000, livre: true, confirma: { ok: true, tremidoMs: 2, perdaPct: 0, buracoMs: 20 } }, ps5: { kbps: 20000 }, padrao: 14, rapido: 16, rttMs: 260 });
  assert.deepEqual([r.tetoKbps, r.livre, r.modo], [6000, false, 14]);
  assert.match(r.modoPorque, /longe/);
  const g = planoDaBanda({ ps5Kbps: 20000, longe: true });
  let p = g.next();
  let maior = 0;
  while (!p.done) { maior = Math.max(maior, p.value.kbps); p = g.next({ ok: true, chegouKbps: p.value.kbps }); }
  assert.equal(maior, 12000);
});

test('longe: uma espera normal de 260 ms não é canal parado', () => {
  const { e } = envio();
  const s = { id: 'a', key: 'k', canal: {}, ps5: { kbps: 20000 }, rede: { rttMs: 260 }, pedido: {}, inicioEm: -60_000, saiuTotal: 500_000, ajuste: {} };
  let fila = 90_000;
  assert.equal(e.repasseParado(s, fila, 0), false);
  for (let x = 16; x < 1300; x += 16) { s.saiuTotal += 2000; fila += 2000; assert.equal(e.repasseParado(s, fila, x), false, String(x)); }
  assert.equal(e.repasseParado(s, fila, 1500), true);
});
