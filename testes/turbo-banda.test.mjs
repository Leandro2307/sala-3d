// Modo turbo: a banda que se ajusta sozinha e o SPS sem espera para reordenar (turbo.js): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandaInicial, decidirBanda, descricaoSemReordenar, entregaDe, decidirAltura, TurboEnvio } from '../public/js/turbo.js';

const deHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
// avcC com um SPS e um PPS
function avcC(sps, pps = deHex('68ee3c80')) {
  return Uint8Array.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff, ...sps, 1, pps.length >> 8, pps.length & 0xff, ...pps]);
}
const spsDe = (d) => d.subarray(8, 8 + ((d[6] << 8) | d[7]));

// O bastante de um leitor de SPS para conferir a VUI depois da reescrita
function lerVui(nal) {
  const r = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0 && r.length >= 2 && r.at(-1) === 0 && r.at(-2) === 0) continue;
    r.push(nal[i]);
  }
  let p = 0;
  const u = (n) => { let v = 0; for (let i = 0; i < n; i++) { v = v * 2 + ((r[p >> 3] >> (7 - (p & 7))) & 1); p++; } return v; };
  const ue = () => { let z = 0; while (u(1) === 0) z++; return z ? 2 ** z - 1 + u(z) : 0; };
  u(8);
  const perfil = u(8);
  u(16);
  ue();
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(perfil)) { if (ue() === 3) u(1); ue(); ue(); u(1); u(1); }
  ue();
  const poc = ue();
  if (poc === 0) ue();
  const refs = ue();
  u(1); ue(); ue();
  if (!u(1)) u(1);
  u(1);
  if (u(1)) { ue(); ue(); ue(); ue(); }
  if (!u(1)) return null;
  const v = {};
  if (u(1) && u(8) === 255) { u(16); u(16); }
  if (u(1)) u(1);
  if ((v.sinal = u(1))) { v.formato = u(3); u(1); if (u(1)) { v.primarias = u(8); u(16); } }
  if (u(1)) { ue(); ue(); }
  if ((v.tempo = u(1))) { v.unidades = u(32); v.escala = u(32); u(1); }
  if (u(1) || u(1)) throw new Error('hrd no teste');
  u(1);
  v.restricao = u(1);
  if (v.restricao) { u(1); ue(); ue(); ue(); ue(); v.reordenar = ue(); v.buffer = ue(); }
  v.refs = refs;
  return v;
}

test('SPS sem VUI (codificador D3D12 do Chrome): ganha a VUI com reordenar 0', () => {
  // medido no Chrome 157 (RTX 3060 Ti) com o D3D12VideoEncodeAccelerator: a placa segurava 5 quadros
  for (const hex of ['6764001fac16dc0a00b720', '6742001f8b6e05005b90']) {
    const d = avcC(deHex(hex));
    assert.equal(lerVui(spsDe(d)), null);
    const nova = descricaoSemReordenar(d);
    assert.ok(nova, hex);
    const v = lerVui(spsDe(nova));
    assert.equal(v.restricao, 1);
    assert.equal(v.reordenar, 0);
    assert.equal(v.buffer, Math.max(1, v.refs));
    // o PPS e o resto continuam iguais
    assert.deepEqual([...nova.subarray(8 + spsDe(nova).length)], [...d.subarray(8 + spsDe(d).length)]);
  }
});

test('SPS que já diz reordenar 0 (Media Foundation, OpenH264): fica como está', () => {
  for (const hex of ['67640020ac2b402802dd808800001f40000ea60078e155', '67640c20ac18d00a00b74d40434041e1108d40']) {
    assert.equal(descricaoSemReordenar(avcC(deHex(hex))), null, hex);
  }
});

test('SPS com VUI mas sem a restrição: a restrição entra no fim e o resto da VUI fica', () => {
  // o SPS do OpenH264 (cores BT.709) sem a bitstream_restriction: monta os bits na mão
  const bits = [];
  const u = (n, v) => { for (let i = n - 1; i >= 0; i--) bits.push(Math.floor(v / 2 ** i) % 2); };
  const ue = (v) => { const x = v + 1; const n = Math.floor(Math.log2(x)) + 1; u(n - 1, 0); u(n, x); };
  u(8, 0x67); u(8, 100); u(8, 0); u(8, 31); ue(0); // NAL, High, restrições, nível 3.1, id
  ue(1); ue(0); ue(0); u(1, 0); u(1, 0); // croma 4:2:0, 8 bits, sem matriz
  ue(4); ue(2); ue(1); u(1, 0); // frame_num, poc 2, 1 referência, sem lacunas
  ue(79); ue(44); u(1, 1); u(1, 1); u(1, 0); // 1280×720, só quadros, direct 8x8, sem corte
  u(1, 1); // VUI
  u(1, 0); u(1, 0); u(1, 1); u(3, 5); u(1, 0); u(1, 1); u(8, 1); u(8, 1); u(8, 1); // sinal de vídeo com cores
  u(1, 0); u(1, 1); u(32, 1000); u(32, 120000); u(1, 0); // croma; tempo
  u(1, 0); u(1, 0); u(1, 0); u(1, 0); // hrd nal, vcl, pic_struct, SEM restrição
  bits.push(1);
  while (bits.length % 8) bits.push(0);
  const sps = new Uint8Array(bits.length / 8);
  bits.forEach((b, i) => { if (b) sps[i >> 3] |= 0x80 >> (i & 7); });
  const antes = lerVui(sps);
  assert.equal(antes.restricao, 0);
  const nova = descricaoSemReordenar(avcC(sps));
  assert.ok(nova);
  const v = lerVui(spsDe(nova));
  assert.equal(v.restricao, 1);
  assert.equal(v.reordenar, 0);
  assert.equal(v.primarias, 1);
  assert.equal(v.escala, 120000);
});

test('banda inicial: a mesma casa vai na máxima; pela internet, 80% da estimativa; sem ela, a desconhecida', () => {
  assert.equal(bandaInicial({ max: 20000, min: 2000, rede: { lan: true, saidaKbps: 5000 } }), 20000);
  assert.equal(bandaInicial({ max: 20000, min: 2000, rede: { saidaKbps: 7000 } }), 5600);
  assert.equal(bandaInicial({ max: 20000, min: 2000, rede: { saidaKbps: 1000 } }), 2000);
  assert.equal(bandaInicial({ max: 20000, min: 2000, rede: null, desconhecida: 8000 }), 8000);
  // o codificador conta em bps (kbps: false); a estimativa vem sempre em kbps
  assert.equal(bandaInicial({ max: 10_000_000, min: 2_500_000, rede: { saidaKbps: 6000 }, kbps: false }), 4_800_000);
  assert.equal(bandaInicial({ max: 6_000_000, min: 1_500_000, rede: null, kbps: false }), 4_800_000);
});

test('decidirBanda: a fila alta leva para perto do que chegou lá; sem apertos, sobe aos poucos', () => {
  // PC direto a 12 Mbps com o caminho levando ~6 (o lorrel, 2026-11-18): em 1 s cai para perto de 5,4
  const a = { altas: 2, baixas: 0, rxs: [5800, 6000, 5600] };
  const n1 = decidirBanda({ atual: 12000, min: 2000, max: 20000, fila: 120, a });
  assert.equal(n1, 6000); // nunca mais que a metade de uma vez
  assert.equal(a.altas, 0);
  a.altas = 2;
  const n2 = decidirBanda({ atual: n1, min: 2000, max: 20000, fila: 120, a });
  assert.equal(n2, 5100); // 85% (a fila ainda alta), abaixo de 90% do que chegou (5400)
  // fila muito alta: 30% de uma vez
  const b = { altas: 2, baixas: 0 };
  assert.equal(decidirBanda({ atual: 10000, min: 2000, max: 20000, fila: 300, a: b }), 7000);
  // o piso segura
  const c = { altas: 2, baixas: 0, rxs: [500] };
  assert.equal(decidirBanda({ atual: 2500, min: 2000, max: 20000, fila: 80, a: c }), 2000);
  // fila baixa por 2 s: sobe 15% (longe da máxima) ou 10% (perto dela), até a máxima
  assert.equal(decidirBanda({ atual: 4000, min: 2000, max: 20000, fila: 10, a: { altas: 0, baixas: 4 } }), 4600);
  assert.equal(decidirBanda({ atual: 15000, min: 2000, max: 20000, fila: 10, a: { altas: 0, baixas: 4 } }), 16500);
  assert.equal(decidirBanda({ atual: 19500, min: 2000, max: 20000, fila: 10, a: { altas: 0, baixas: 4 } }), 20000);
  // nada a fazer: fica (e uma máxima menor puxa para baixo na hora: a ponte foi para 720p)
  assert.equal(decidirBanda({ atual: 8000, min: 2000, max: 20000, fila: 27, a: { altas: 1, baixas: 2 } }), 8000);
  assert.equal(decidirBanda({ atual: 16000, min: 2000, max: 12000, fila: 27, a: { altas: 0, baixas: 0 } }), 12000);
  // o codificador conta em bps: o rx (kbps) vai com rxEscala 1000
  const d = { altas: 2, baixas: 0, rxs: [3000] };
  assert.equal(decidirBanda({ atual: 6_000_000, min: 1_500_000, max: 6_000_000, fila: 60, a: d, rxEscala: 1000 }), 3_000_000);
});

test('entregaDe: o que chegou ÷ o que saiu; sem conta que sirva, null', () => {
  assert.equal(entregaDe([{ rx: 1800, tx: 2000 }, { rx: 2000, tx: 2000 }]), 0.95);
  assert.equal(entregaDe([]), null);
  assert.equal(entregaDe(null), null);
  assert.equal(entregaDe([{ rx: 50, tx: 100 }]), null); // tela parada: quase nada saiu
});

test('decidirBanda: fila alta com a rede levando tudo é tranco do Wi-Fi e não desce', () => {
  const a = { altas: 2, baixas: 0, rxs: [1800] };
  assert.equal(decidirBanda({ atual: 2_500_000, min: 2_500_000, max: 10_000_000, fila: 150, a, rxEscala: 1000, entrega: 0.97 }), 2_500_000);
  assert.equal(a.altas, 0);
  assert.equal(a.trancos, 1);
  // chegando bem menos do que sai: desce como antes
  const b = { altas: 2, baixas: 0, rxs: [4000] };
  assert.equal(decidirBanda({ atual: 8_000_000, min: 2_500_000, max: 10_000_000, fila: 80, a: b, rxEscala: 1000, entrega: 0.55 }), 4_000_000);
});

// TurboEnvio.ajustarBanda de ponta a ponta com uma rede de mentira: a cada aviso (500 ms) quem joga
// manda a fila e o que chegou; o codificador manda a banda que tem
function simular({ cap, trancoCada = 0, avisos = 120, inicio = 2_500_000, limite = Infinity }) {
  const real = performance.now;
  let agora = 1000;
  performance.now = () => agora;
  try {
    const envio = new TurboEnvio({ tela: null, onMudou: null });
    const s = { banda: inicio, cfg: { h: 1080 }, config: { bitrate: inicio }, enc: { state: 'configured', configure(c) { this.c = c; } },
      ajuste: { altas: 0, baixas: 0, mudou: 0, ultima: null, tx: 0, trancos: 0, pulFila: 0 } };
    let atraso = 0; // kbit esperando no caminho
    for (let i = 0; i < avisos; i++) {
      agora += 500;
      // com a fila daqui cheia (limite, kbit) os quadros são pulados: sai só o que o caminho leva
      const cheia = atraso >= limite;
      const mandou = cheia ? cap : s.banda / 1000; // kbps
      if (cheia) s.ajuste.pulFila += 5;
      s.ajuste.tx += (mandou * 500) / 8; // bytes
      const tranco = trancoCada && i % trancoCada === trancoCada - 1;
      // no tranco o Wi-Fi para 200 ms e entrega tudo depois (o que não chegou vai no aviso seguinte)
      const levou = tranco ? Math.min(cap, mandou) * 0.6 : Math.min(cap, mandou + atraso / 0.5);
      atraso = Math.min(limite, Math.max(0, atraso + (mandou - levou) * 0.5));
      const fila = tranco ? 200 : (atraso / cap) * 1000 + 10;
      envio.ajustarBanda(s, { p90: 20 + fila, base: 20, rx: Math.round(levou) });
    }
    return s.banda;
  } finally {
    performance.now = real;
  }
}

test('ajustarBanda: Wi-Fi que tranca a cada 2 s mas leva 9,6 Mbps — a banda sobe para perto disso e não passa muito', () => {
  // como o lokao → lokao16001 em 2026-11-19 13:18 (antes ficava no piso, 2,5 Mbps)
  const b = simular({ cap: 9600, trancoCada: 4 });
  assert.ok(b >= 8_000_000 && b <= 12_000_000, `banda ${b}`);
  // com folga no caminho, chega na máxima
  assert.equal(simular({ cap: 30000, trancoCada: 4, avisos: 200 }), 20_000_000);
});

test('ajustarBanda: o caminho leva só 4 Mbps — a banda desce para perto dele', () => {
  const b = simular({ cap: 4000, inicio: 10_000_000, avisos: 40 });
  assert.ok(b <= 5_000_000 && b >= 2_500_000, `banda ${b}`); // passa um pouco ao subir e volta
});

test('ajustarBanda: a fila daqui sempre cheia (quadros pulados) baixa a banda mesmo com a entrega em dia', () => {
  // o teto de 20 Mbps num caminho que leva 8 (2026-11-19 19:14): a fila de 166 KB enche e fica cheia
  const b = simular({ cap: 8000, inicio: 20_000_000, avisos: 60, limite: 1300 });
  assert.ok(b <= 10_000_000, `banda ${b}`);
});

test('decidirAltura: no piso sem a rede levar desce um degrau; no teto com folga volta, devagar', () => {
  const base = { teto: 1080, min: 2_500_000, max: 20_000_000, fila: 300, tranco: false };
  const a = {};
  // 1º corte no piso: ainda não
  assert.equal(decidirAltura({ ...base, h: 1080, banda: 2_500_000, cortou: true, a, agora: 10_000 }), null);
  // 2º: 720p
  assert.equal(decidirAltura({ ...base, h: 1080, banda: 2_500_000, cortou: true, a, agora: 11_000 }), 720);
  // logo depois não troca de novo (espera), mesmo no piso do 720p
  const m720 = { ...base, min: 1_500_000, max: 6_000_000 };
  assert.equal(decidirAltura({ ...m720, h: 720, banda: 1_500_000, cortou: true, a, agora: 12_000 }), null);
  assert.equal(decidirAltura({ ...m720, h: 720, banda: 1_500_000, cortou: true, a, agora: 16_500 }), 540);
  // 540p é o último degrau
  const m540 = { ...base, min: 800_000, max: 3_500_000 };
  for (let i = 0; i < 4; i++) assert.equal(decidirAltura({ ...m540, h: 540, banda: 800_000, cortou: true, a, agora: 30_000 + i * 500 }), null);
  // a rede melhorou: 8 s no teto do 540p com a fila baixa → 720p
  let r = null;
  for (let i = 0; i < 16 && r == null; i++) r = decidirAltura({ ...m540, h: 540, banda: 3_500_000, cortou: false, fila: 10, a, agora: 40_000 + i * 500 });
  assert.equal(r, 720);
  // um tranco do Wi-Fi no meio não zera a conta para subir; fila alta de verdade zera
  const b = { noTeto: 10 };
  decidirAltura({ ...m720, h: 720, banda: 6_000_000, cortou: false, fila: 200, tranco: true, a: b, agora: 0 });
  assert.equal(b.noTeto, 10);
  decidirAltura({ ...m720, h: 720, banda: 6_000_000, cortou: false, fila: 200, tranco: false, a: b, agora: 0 });
  assert.equal(b.noTeto, 0);
  // nunca passa do pedido
  const c = { noTeto: 40 };
  assert.equal(decidirAltura({ ...m720, teto: 720, h: 720, banda: 6_000_000, cortou: false, fila: 10, a: c, agora: 0 }), null);
});

test('decidirBanda: no arranque sobe 30% a cada 2 avisos com a fila baixa; o primeiro corte acaba o arranque', () => {
  const a = { altas: 0, baixas: 2, arranque: true };
  assert.equal(decidirBanda({ atual: 4_800_000, min: 2_500_000, max: 20_000_000, fila: 10, a, rxEscala: 1000 }), 6_240_000);
  let b = 4_800_000;
  let avisos = 0;
  while (b < 20_000_000 && avisos < 40) { a.baixas += 1; avisos++; b = decidirBanda({ atual: b, min: 2_500_000, max: 20_000_000, fila: 10, a, rxEscala: 1000 }); }
  assert.equal(b, 20_000_000);
  assert.ok(avisos <= 12, `levou ${avisos} avisos`); // ~6 s (aviso a cada 0,5 s)
  const c = { altas: 2, baixas: 0, arranque: true };
  decidirBanda({ atual: 10_000_000, min: 2_500_000, max: 20_000_000, fila: 80, a: c, rxEscala: 1000 });
  assert.equal(c.arranque, false);
  c.baixas = 2;
  assert.equal(decidirBanda({ atual: 8_500_000, min: 2_500_000, max: 20_000_000, fila: 10, a: c, rxEscala: 1000 }), 8_500_000);
});

test('decidirBanda: um corte na graça do começo não acaba o arranque', () => {
  const a = { altas: 2, baixas: 0, arranque: true, graca: true };
  const n = decidirBanda({ atual: 4_900_000, min: 2_500_000, max: 20_000_000, fila: 200, a, rxEscala: 1000 });
  assert.ok(n < 4_900_000);
  assert.equal(a.arranque, true);
  a.graca = false;
  a.baixas = 2;
  assert.equal(decidirBanda({ atual: n, min: 2_500_000, max: 20_000_000, fila: 10, a, rxEscala: 1000 }), Math.round(n * 1.3));
});
