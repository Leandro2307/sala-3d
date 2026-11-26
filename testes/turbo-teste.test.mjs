// O teste da conexão (turbo-teste.js): as contas, o plano da banda com caminhos de mentira e as escolhas
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirDegrau, resumirJogo, avaliarConexao, preverJogo, planoDaBanda, escolher, escolherCaminho, escolherCodec, escolherModo, MemoriaTeste } from '../public/js/turbo-teste.js';
import { tetoDoEixo } from '../public/js/turbo-teste-painel.js';
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

test('o teste vale o dia no mesmo caminho', () => {
  let agora = new Date(2026, 10, 25, 9).getTime();
  const m = new MemoriaTeste(() => agora, null);
  m.guardar('d', { modo: 17 }, { familia: 'ipv4', rttMs: 8 });
  assert.ok(m.valido('d', { familia: 'ipv4', rttMs: 10 }));
  assert.equal(m.valido('d', { familia: 'ipv6', rttMs: 22 }), null);
  assert.equal(m.valido('d', { familia: 'ipv4', rttMs: 50 }), null);
  assert.match(m.porque, /de 8 para 50/);
  agora += 10 * 3600_000; // 19 h: o mesmo dia ainda vale
  assert.ok(m.valido('d', { familia: 'ipv4', rttMs: 8 }));
  agora += 6 * 3600_000; // outro dia
  assert.equal(m.valido('d', { familia: 'ipv4', rttMs: 8 }), null);
  assert.match(m.porque, /outro dia/);
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
const amostra = (o = {}) => ({ turbo: { silencioMaxMs: 40, ...o.turbo }, fpsFinal: o.qps ?? 60, atrasoMs: o.atraso ?? 100, rttMs: 50, la: { captura: 60, turbo: { bandaKbps: o.banda ?? null }, ps5: { manda: o.manda ?? 60, danos: o.danos ?? 0 } }, ritmo: { trancos: o.trancos ?? 1, travadas: o.travadas ?? [] }, conexao: { par: o.par ?? 'p' }, somWebrtc: { inventadoPct: o.inventado ?? 0 } });

test('o que não é do modo não conta', () => {
  assert.equal(foraDoModo(amostra()), null);
  assert.equal(foraDoModo(amostra({ turbo: { silencioMaxMs: 1400 } })), 'caminho');
  assert.equal(foraDoModo(amostra({ inventado: 50 })), 'caminho');
  assert.equal(foraDoModo(amostra({ manda: 47 })), 'fonte');
  assert.equal(foraDoModo(amostra({ manda: 30 })), null);
  // o PS5 parou ou perdeu imagem até o PC de lá (Gerp, 2026-11-26)
  assert.equal(foraDoModo(amostra({ manda: 0 })), 'fonte');
  assert.equal(foraDoModo(amostra({ danos: 3 })), 'fonte');
});

test('a travada do PS5 que aparece na amostra seguinte também não reprova o modo', () => {
  const { a, ev, passar } = auto();
  a.comecarCom(16);
  passar({}, 25);
  for (let i = 0; i < 6; i++) { passar({ manda: 0 }); passar({ travadas: [{ ms: 2400 }, { ms: 2400 }, { ms: 2400 }] }); }
  passar({}, 20);
  assert.ok(!ev.some((t) => t.includes('piorou')), ev.join(' | '));
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

// ------------------------------------------------------------ a confirmação como o jogo, a nota e o previsto
function jogo({ n = 360, viagem = () => 20, some = () => false } = {}) {
  const quadros = [];
  for (let i = 0; i < n; i++) { const t0 = i * (1000 / 60); if (!some(i)) quadros.push({ seq: i, t0, em: t0 + viagem(i) }); }
  return { quadros, enviados: n, ms: n * (1000 / 60) };
}

test('jogo: liso passa; parar 300 ms três vezes, perder quadros ou fila reprova', () => {
  const bom = resumirJogo(jogo());
  assert.deepEqual([bom.ok, bom.travadas, bom.perdidosPct], [true, 0, 0]);
  // três paradas: os quadros delas chegam todos juntos no fim
  const pausa = resumirJogo(jogo({ viagem: (i) => ([60, 160, 260].some((k) => i >= k && i < k + 18) ? 20 + (18 - ((i - 60) % 100)) * 16.7 : 20) }));
  assert.equal(pausa.travadas, 3);
  assert.equal(pausa.ok, false);
  assert.equal(resumirJogo(jogo({ some: (i) => i % 20 === 0 })).ok, false);
  assert.equal(resumirJogo(jogo({ viagem: (i) => 20 + i })).ok, false);
  assert.equal(resumirJogo({ quadros: [], enviados: 360, ms: 6000 }).ok, false);
});

test('jogo: a página parada não é travada da rede', () => {
  const d = jogo({ viagem: (i) => (i >= 60 && i < 72 ? 20 + (72 - i) * 16.7 : 20) });
  assert.equal(resumirJogo(d).travadas, 1);
  assert.equal(resumirJogo({ ...d, travou: 200 }).travadas, 0);
});

test('a confirmação é com o jogo, e mais longa no celular e pelo TURN', () => {
  for (const [op, ms] of [[{}, 6000], [{ oscila: true }, 8000]]) {
    const g = planoDaBanda({ ps5Kbps: 20000, ...op });
    let p = g.next();
    while (!p.done && !p.value.confirma) p = g.next({ ok: true, chegouKbps: p.value.kbps });
    assert.deepEqual([p.value.jogo, p.value.ms], [true, ms]);
  }
});

test('modo: celular e TURN nunca no rápido; o rápido exige o jogo liso e perto', () => {
  const c = (j) => ({ ok: true, ms: 6000, tremidoMs: 1, perdaPct: 0, buracoMs: 20, jogo: { tremidoMs: 4, travadas: 0, perdidosPct: 0, ...j } });
  const m = (o) => escolherModo({ padrao: 14, rapido: 16, rttMs: 8, confirma: c(), ...o }).modo;
  assert.equal(m({}), 16);
  assert.equal(m({ toque: true }), 14);
  assert.equal(m({ rota: 'turn' }), 14);
  assert.equal(m({ rttMs: 80 }), 14);
  assert.equal(m({ confirma: c({ travadas: 1 }) }), 14);
  assert.equal(m({ confirma: c({ tremidoMs: 14 }) }), 14);
});

test('celular fora de casa começa em 8 Mbps; em casa não', () => {
  const banda = { tetoKbps: 15000, livre: false, confirma: { ok: true, tremidoMs: 2, perdaPct: 0, buracoMs: 20 } };
  assert.equal(escolher({ banda, padrao: 14, rapido: 16, rttMs: 71, rota: 'turn', toque: true }).tetoKbps, 8000);
  assert.equal(escolher({ banda, padrao: 14, rapido: 16, rttMs: 5, toque: true }).tetoKbps, 15000);
});

test('nota: a conexão das 17:55 é ótima e a do 5G direto é ruim, com a dica certa', () => {
  const conf = (j) => ({ ok: true, jogo: { tremidoMs: 3, travadas: 0, perdidosPct: 0, ...j } });
  assert.equal(avaliarConexao({ rttMs: 8, confirma: conf(), tetoKbps: 20000, livre: true }).nivel, 'otima');
  const ruim = avaliarConexao({ rttMs: 265, confirma: conf({ tremidoMs: 25, travadas: 3 }), tetoKbps: 6000, livre: false });
  assert.equal(ruim.nivel, 'ruim');
  assert.match(ruim.dicas.join(), /distância/);
  assert.match(avaliarConexao({ rttMs: 8, confirma: conf(), tetoKbps: 20000, livre: true, ps5Saude: { qps: 58, pior: 40 } }).dicas[0], /PS5/);
  assert.match(avaliarConexao({ rttMs: 8, confirma: conf({ travadas: 2 }), tetoKbps: 20000, livre: true, wifi: true }).dicas.join(), /Wi-Fi/);
});

test('previsto: perto do que deu de verdade nos dois testes reais', () => {
  const casa = preverJogo({ rttMs: 8, confirma: { jogo: { tremidoMs: 4, travMin: 0 } }, modo: 16, rapido: 16, decMs: 1 });
  assert.ok(Math.abs(casa.atrasoMs - 63) <= 8, String(casa.atrasoMs));
  const g5 = preverJogo({ rttMs: 72, confirma: { jogo: { tremidoMs: 12, travMin: 5 } }, modo: 16, rapido: 16, decMs: 5 });
  assert.ok(Math.abs(g5.atrasoMs - 146) <= 15, String(g5.atrasoMs));
});

test('eixo do gráfico: degraus redondos e nunca abaixo do maior', () => {
  for (const v of [0, 3, 9.5, 21, 88, 264, 900, 4000]) assert.ok(tetoDoEixo(v, 10) >= v);
  assert.equal(tetoDoEixo(3, 10), 10);
  assert.equal(tetoDoEixo(20.5, 10), 25);
});

test('a memória do dia sobrevive a recarregar a página e guarda só o que o jogo usa', () => {
  const guarda = { v: null, getItem() { return this.v; }, setItem(_, v) { this.v = v; } };
  const agora = () => new Date(2026, 10, 25, 20).getTime();
  const m = new MemoriaTeste(agora, guarda);
  m.guardar('lokao', { tetoKbps: 9000, codec: 'h264', modo: 14, rota: 'turn', degraus: [1, 2, 3], caminhos: [] }, { familia: 'ipv4', rttMs: 30 });
  assert.ok(!/degraus/.test(guarda.v));
  const outra = new MemoriaTeste(agora, guarda); // a página recarregou
  assert.deepEqual(outra.valido('lokao', { familia: 'ipv4', rttMs: 31 }), { tetoKbps: 9000, codec: 'h264', modo: 14, rota: 'turn' });
  outra.esquecer('lokao');
  assert.equal(new MemoriaTeste(agora, guarda).valido('lokao', { familia: 'ipv4', rttMs: 31 }), null);
  // a de ontem não volta
  const amanha = new MemoriaTeste(() => new Date(2026, 10, 26, 8).getTime(), { getItem: () => guarda.v ?? JSON.stringify({ x: { r: {}, em: agora() } }), setItem() {} });
  assert.equal(amanha.valido('x', null), null);
});

// ------------------------------------------------------------ imagem tratada no PC do jogo
test('tratar: só com banda sobrando e perto; aí o H.265 se os dois dão conta', () => {
  const conf = { ok: true, tremidoMs: 2, perdaPct: 0, buracoMs: 20 };
  const bom = { quadros: 90, saiu: 90, decP50: 1, decP95: 3, codP50: 6, codP95: 9, segurando: false };
  const r = escolher({ banda: { tetoKbps: 20000, livre: true, confirma: conf }, h264: bom, h265: { ...bom, codP50: 9 }, padrao: 14, rapido: 16, rttMs: 30 });
  assert.deepEqual([r.tratar, r.codec], [true, 'h265']);
  assert.equal(escolher({ banda: { tetoKbps: 8000, livre: false, confirma: conf }, h264: bom, h265: bom, padrao: 14, rapido: 16, rttMs: 30 }).tratar, false);
  assert.equal(escolher({ banda: { tetoKbps: 20000, livre: true, confirma: conf }, padrao: 14, rapido: 16, rttMs: 260 }).tratar, false);
  // sem H.265 que preste, fica no H.264 tratado
  assert.deepEqual((({ tratar, codec }) => [tratar, codec])(escolher({ banda: { tetoKbps: 20000, livre: true, confirma: conf }, h264: bom, h265: { erro: 'x' }, padrao: 14, rapido: 16, rttMs: 8 })), [true, 'h264']);
});

test('tratar: o teto da banda é o do caminho, e quando cede não volta por 5 min', () => {
  const { e, eventos } = envio();
  const s = { id: 'a', key: 'k', canal: {}, tratar: true, recodificado: true, kbpsFonte: 20000, tetoKbps: 18000, pedido: { ligar: 'k', tratar: true, teto: 18000 } };
  assert.equal(e.tetoBanda(s, 1080), 18_000_000); // e não 16 (80% do PS5)
  assert.equal(e.tetoBanda({ ...s, tratar: false }, 1080), 16_000_000);
  e.desligarTratar(s, 'a placa passou de 85%');
  assert.equal(s.tratar, false);
  assert.equal(e.ligados[0].tratar, undefined);
  assert.equal(e.semTratar('a'), true);
  assert.match(eventos.at(-1), /tratamento da imagem nesta placa desligado/);
  e.desligarTratar(s, 'de novo'); // já cedeu: nada
  assert.equal(e.ligados.length, 1);
});
