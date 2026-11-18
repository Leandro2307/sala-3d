// DualSense de quem joga pelo WebHID (PS5 direto, Chrome/Edge no PC, com a permissão da pessoa uma
// vez: depois ele volta sozinho). Começou só pelo touchpad (o Gamepad do navegador dá o clique, mas
// não onde o dedo está) e hoje é o controle inteiro, nas duas direções:
//   - entrada: botões, analógicos, gatilhos e os dois dedos do touchpad vão no estado do controle
//     virtual (pad-virtual.js, fonte 'hid', e o campo tp), até a ponte do PS5; o giroscópio e o
//     acelerômetro viram o movimento do controle (movimento.js, o campo m): inclinar o DualSense
//     aqui inclina o controle no PS5;
//   - saída: a vibração (os dois motores) e os gatilhos adaptativos que o jogo do PS5 manda.
// Por que tudo por aqui: no Bluetooth, ler o relatório de recurso 0x05 põe o controle no relatório
// completo (0x31, o único com o touchpad), e aí o Chrome no Windows deixa de ver o controle na
// Gamepad API (teste de 2026-11-18: getGamepads() vazio, enquanto o WebHID recebia ~250 relatórios
// por segundo). Sem isto, com o touchpad ligado, nada do controle chegava ao PS5.
//
// Relatório de entrada (o mesmo do driver hid-playstation do Linux), contado a partir do primeiro
// byte depois do id: no cabo, id 0x01; no Bluetooth, id 0x31 com um byte a mais na frente.
//   0-3: analógicos (lx, ly, rx, ry; 128 no meio)   4-5: L2, R2 (0-255)
//   7: direcional (4 bits) e □ ✕ ○ △   8: L1 R1 L2 R2 Create Options L3 R3   9: PS, touchpad, mudo
//   15-20: giroscópio x, y, z (16 bits com sinal)   21-26: acelerômetro x, y, z   27-30: relógio dos
//   sensores (32 bits, em terços de µs)
//   32-35 e 36-39: os dois dedos — byte 0: bit 7 = sem dedo; x 12 bits (0-1919), y 12 bits (0-1079)
// O relatório simples do Bluetooth (0x01 curto, antes do 0x05) tem outra ordem e não tem os dedos.
//
// Relatório de saída: a parte comum (47 bytes) — 0: o que vale (0x01 vibração, 0x02 motores, 0x04
// gatilho direito, 0x08 esquerdo), 2-3: motores (direito fraco, esquerdo forte), 10-20: efeito do R2,
// 21-31: efeito do L2, 38: 0x04 vibração dos controles mais novos. No cabo vai como 0x02; no
// Bluetooth como 0x31, com sequência, a marca 0x10 e o CRC32 no fim.

import { Fusao } from './movimento.js';

const SONY = 0x054c;
const DUALSENSE = [0x0ce6, 0x0df2]; // DualSense e DualSense Edge
const FILTROS = DUALSENSE.map((productId) => ({ vendorId: SONY, productId }));
const LARGURA = 1919;
const ALTURA = 1079;
const ZONA = 0.08; // zona morta dos analógicos (como o pad-virtual faz com o Gamepad)
const SOLTO = [0x05]; // efeito de gatilho: solto (sem resistência)
const RAD = Math.PI / 180;

// Calibração dos sensores, no relatório de recurso 0x05 (como o hid-playstation do Linux lê): quanto
// vale cada passo do giroscópio (°/s) e o zero e o passo do acelerômetro (g). O zero do giroscópio o
// próprio controle já desconta. Sem calibração, ou com números sem sentido, os valores típicos.
const PADRAO = { g: [1 / 16, 1 / 16, 1 / 16], az: [0, 0, 0], a: [1 / 8192, 1 / 8192, 1 / 8192] };
export function calibracao(dv) {
  if (!dv?.byteLength) return PADRAO;
  // o primeiro byte pode ser o id do relatório (0x05) ou já o primeiro dado
  for (const o of dv.getUint8(0) === 0x05 ? [1, 0] : [0]) {
    if (dv.byteLength < o + 34) continue;
    const s = (i) => dv.getInt16(o + i, true);
    const vel2 = s(18) + s(20); // as velocidades de referência (+ e −)
    const g = [0, 1, 2].map((k) => {
      const zero = s(k * 2);
      const passos = Math.abs(s(6 + k * 4) - zero) + Math.abs(s(8 + k * 4) - zero);
      return passos ? vel2 / passos : 0;
    });
    const faixa = [0, 1, 2].map((k) => s(22 + k * 4) - s(24 + k * 4)); // de −1 g a +1 g
    const az = [0, 1, 2].map((k) => s(22 + k * 4) - faixa[k] / 2);
    const ok = g.every((x) => x > 1 / 32 && x < 1 / 8) && faixa.every((x) => x > 8000 && x < 33000) && az.every((x) => Math.abs(x) < 3000);
    if (ok) return { g, az, a: faixa.map((x) => 2 / x) };
  }
  return PADRAO;
}

export const temTouchpadHid = () => typeof navigator !== 'undefined' && !!navigator.hid?.requestDevice;
const eDualSense = (d) => d.vendorId === SONY && DUALSENSE.includes(d.productId);

// CRC32 (o do zlib): o Bluetooth do DualSense descarta relatório de saída sem ele
const TABELA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const arred = (v) => Math.round(v * 1000) / 1000;
const eixo = (v) => {
  const n = Math.max(-1, Math.min(1, (v - 128) / 127));
  return Math.abs(n) < ZONA ? 0 : arred(n);
};

export class Ps5Touchpad {
  constructor({ pad, onMudou }) {
    this.pad = pad;
    this.onMudou = onMudou || (() => {});
    this.dev = null;
    this.ativo = false; // modo jogo numa tela de PS5
    this.ultimo = '';
    this.ultimoEstado = '';
    this.bt = null; // null: ainda não chegou relatório para saber
    this.seq = 0;
    this.saida = { forte: 0, fraco: 0, e: SOLTO, d: SOLTO };
    this.enviando = false;
    this.pendente = false;
    this.calib = PADRAO;
    this.fusao = new Fusao(); // giroscópio + acelerômetro → a orientação (movimento.js)
    this.tsAntes = null; // o relógio dos sensores no relatório anterior
    this.tAntes = 0;
    this.ler = (e) => this.relatorio(e);
    navigator.hid?.addEventListener?.('disconnect', (e) => {
      if (e.device !== this.dev) return;
      this.dev = null;
      this.bt = null;
      this.pad.touchpad(null);
      this.pad.soltar('hid');
      this.onMudou();
    });
    navigator.hid?.addEventListener?.('connect', (e) => {
      if (this.ativo && !this.dev && eDualSense(e.device)) this.abrir(e.device).catch(() => {});
    });
  }

  get ligado() { return !!this.dev; }

  // o botão "Usar o DualSense" (precisa do clique: o navegador mostra a lista)
  async pedir() {
    if (!temTouchpadHid()) throw new Error('Este navegador não lê o DualSense (precisa do Chrome ou do Edge no PC).');
    const [d] = await navigator.hid.requestDevice({ filters: FILTROS });
    if (!d) return false;
    await this.abrir(d);
    return true;
  }

  // modo jogo no PS5: volta sozinho no controle que já tinha permissão
  async ligar() {
    if (!this.ativo) {
      // a orientação recomeça a cada modo jogo (acha a gravidade de novo nas primeiras amostras)
      this.fusao.zerar();
      this.tsAntes = null;
      this.tAntes = 0;
    }
    this.ativo = true;
    if (this.dev || !temTouchpadHid()) return;
    try {
      const d = (await navigator.hid.getDevices()).find(eDualSense);
      if (d && this.ativo) await this.abrir(d);
    } catch { /* sem permissão ainda: fica no botão */ }
  }

  desligar() {
    this.ativo = false;
    this.ultimo = '';
    this.ultimoEstado = '';
    this.pad.touchpad(null);
    this.pad.soltar('hid');
    // saiu do jogo: o controle não pode ficar tremendo nem com o gatilho duro
    this.saida = { forte: 0, fraco: 0, e: SOLTO, d: SOLTO };
    this.escrever();
  }

  async abrir(d) {
    if (this.dev === d) return;
    if (!d.opened) await d.open();
    // 0x05: a calibração dos sensores. No Bluetooth, lê-lo também põe o controle no relatório
    // completo, com o touchpad e os sensores
    let cal = null;
    try { cal = await d.receiveFeatureReport(0x05); } catch { /* fica a calibração típica */ }
    this.calib = calibracao(cal);
    d.addEventListener('inputreport', this.ler);
    this.dev = d;
    this.onMudou();
  }

  relatorio(e) {
    const v = e.data;
    let o;
    let simples = false;
    if (e.reportId === 0x01 && v.byteLength >= 60) { o = 0; this.bt = false; }
    else if (e.reportId === 0x31 && v.byteLength >= 41) { o = 1; this.bt = true; }
    else if (e.reportId === 0x01 && v.byteLength >= 9) { simples = true; this.bt = true; }
    else return;
    if (!this.ativo) return;
    this.controle(v, o, simples);
    if (simples) return; // o relatório simples do Bluetooth não tem o touchpad nem os sensores
    this.movimento(v, o, e.timeStamp);
    const dedo = (i) => {
      if (v.getUint8(o + i) & 0x80) return [-1, -1];
      const b1 = v.getUint8(o + i + 1);
      const b2 = v.getUint8(o + i + 2);
      const b3 = v.getUint8(o + i + 3);
      const x = b1 | ((b2 & 0x0f) << 8);
      const y = (b2 >> 4) | (b3 << 4);
      return [Math.min(1, x / LARGURA), Math.min(1, y / ALTURA)];
    };
    const tp = [...dedo(32), ...dedo(36)].map((n) => (n < 0 ? -1 : Math.round(n * 1000) / 1000));
    const clique = !!(v.getUint8(o + 9) & 0x02);
    // o controle manda ~250 relatórios por segundo: só passa adiante o que mudou
    const chave = tp.join(',') + (clique ? '+' : '');
    if (chave === this.ultimo) return;
    this.ultimo = chave;
    this.pad.touchpad(tp, clique);
  }

  // botões, analógicos e gatilhos → fonte 'hid' do controle virtual (bits no mapa padrão do navegador)
  controle(v, o, simples) {
    const u = (i) => v.getUint8(i);
    let lx, ly, rx, ry, l2, r2, b0, b1, b2;
    if (simples) {
      [lx, ly, rx, ry] = [u(0), u(1), u(2), u(3)];
      [b0, b1, b2] = [u(4), u(5), u(6)];
      [l2, r2] = [u(7), u(8)];
    } else {
      [lx, ly, rx, ry, l2, r2] = [u(o), u(o + 1), u(o + 2), u(o + 3), u(o + 4), u(o + 5)];
      [b0, b1, b2] = [u(o + 7), u(o + 8), u(o + 9)];
    }
    const seta = b0 & 0x0f; // 0 cima, sentido horário até 7; 8 solto
    const lig = [
      b0 & 0x20, b0 & 0x40, b0 & 0x10, b0 & 0x80, // ✕ ○ □ △
      b1 & 0x01, b1 & 0x02, b1 & 0x04, b1 & 0x08, // L1 R1 L2 R2
      b1 & 0x10, b1 & 0x20, b1 & 0x40, b1 & 0x80, // Create Options L3 R3
      [7, 0, 1].includes(seta), [3, 4, 5].includes(seta), [5, 6, 7].includes(seta), [1, 2, 3].includes(seta),
      b2 & 0x01, b2 & 0x02, // PS, touchpad afundado
    ];
    let b = 0;
    lig.forEach((x, i) => { if (x) b |= 1 << i; });
    const estado = { b, lx: eixo(lx), ly: eixo(ly), rx: eixo(rx), ry: eixo(ry), lt: arred(l2 / 255), rt: arred(r2 / 255) };
    const chave = `${b},${estado.lx},${estado.ly},${estado.rx},${estado.ry},${estado.lt},${estado.rt}`;
    if (chave === this.ultimoEstado) return;
    this.ultimoEstado = chave;
    this.pad.definir('hid', estado);
  }

  // giroscópio e acelerômetro → a orientação (a cada relatório, com o relógio do controle) → o campo m
  // do controle virtual. O pad-virtual só manda a foto mais nova, no máximo uma a cada 12 ms.
  movimento(v, o, t) {
    const c = this.calib;
    const s = (i) => v.getInt16(o + i, true);
    const g = [0, 1, 2].map((k) => s(15 + k * 2) * c.g[k] * RAD);
    const a = [0, 1, 2].map((k) => (s(21 + k * 2) - c.az[k]) * c.a[k]);
    const ts = v.getUint32(o + 27, true);
    let dt = this.tsAntes === null ? 0 : ((ts - this.tsAntes) >>> 0) / 3e6;
    // relógio dos sensores parado ou pulando: o do navegador
    if (!(dt > 0 && dt < 0.1)) dt = this.tAntes ? Math.min(0.1, Math.max(0, (t - this.tAntes) / 1000)) : 0;
    this.tsAntes = ts;
    this.tAntes = t;
    this.fusao.passo(g, a, dt);
    this.pad.movimento('hid', this.fusao.estado());
  }

  // ------------------------------------------------------------ saída: vibração e gatilhos
  // forte/fraco de 0 a 1 (o motor esquerdo é o tranco; o direito, o zumbido)
  motores(forte, fraco) {
    const f = Math.round(Math.min(1, Math.max(0, forte)) * 255);
    const p = Math.round(Math.min(1, Math.max(0, fraco)) * 255);
    if (f === this.saida.forte && p === this.saida.fraco) return true;
    this.saida = { ...this.saida, forte: f, fraco: p };
    return this.escrever();
  }

  // os gatilhos adaptativos como o PS5 mandou: e (L2) e d (R2), 11 bytes cada (modo + parâmetros)
  gatilhos(e, d) {
    const ok = (x) => (Array.isArray(x) && x.length ? x.slice(0, 11) : SOLTO);
    this.saida = { ...this.saida, e: ok(e), d: ok(d) };
    return this.escrever();
  }

  // manda o estado de saída; se um envio ainda está saindo, manda o mais novo logo depois
  escrever() {
    if (!this.dev || this.bt === null) return false;
    if (this.enviando) {
      this.pendente = true;
      return true;
    }
    this.enviando = true;
    const s = this.saida;
    const c = new Uint8Array(47);
    c[0] = 0x01 | 0x02 | 0x04 | 0x08;
    c[2] = s.fraco;
    c[3] = s.forte;
    c.set(s.d, 10);
    c.set(s.e, 21);
    c[38] = 0x04;
    let id = 0x02;
    let dados = c;
    if (this.bt) {
      const r = new Uint8Array(78);
      r[0] = 0x31;
      r[1] = (this.seq << 4) & 0xf0;
      this.seq = (this.seq + 1) & 0x0f;
      r[2] = 0x10;
      r.set(c, 3);
      new DataView(r.buffer).setUint32(74, crc32([0xa2, ...r.subarray(0, 74)]), true);
      id = 0x31;
      dados = r.subarray(1);
    }
    this.dev.sendReport(id, dados)
      .catch(() => {})
      .finally(() => {
        this.enviando = false;
        if (this.pendente) {
          this.pendente = false;
          this.escrever();
        }
      });
    return true;
  }
}
