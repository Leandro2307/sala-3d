// O teste da conexão antes do jogo (2026-11-25): de PC para PC, pelo mesmo caminho da imagem do turbo. Quem joga
// manda nele; quem compartilha só responde (TesteEnvio). Roda ao entrar no Modo jogo com o Automático ligado.
//
// Por que: o automático media com o jogo já andando e cada modo pegava um momento diferente da rede. No
// notebook do lokao16001 (16:52) o caminho cortava tudo por ~1 s (o som do WebRTC junto, com a internet dos
// dois lados normal) quando passava de ~12 Mbps — 10 de 34 amostras, contra 2 de 133 entre 8 e 10 —, a imagem
// caiu para a codificada no PC, e os três modos foram julgados assim.
//
// 1. a banda sobe em degraus (RAMPA) até um que não passa; o que passou é confirmado por CONFIRMA_MS;
// 2. a imagem da tela, de verdade, codificada lá em H.264 e em H.265 e decodificada aqui;
// 3. escolher(): o teto da banda, o codec e o modo de imagem. O teto vai no pedido do turbo (TurboEnvio.tetoDe).
//
// Dois canais: "turbo-teste" (ordenado e confiável: as mensagens e a imagem do passo 2) e
// "turbo-teste-dados" (sem ordem e sem reenvio: a perda e os buracos do caminho aparecem como são).
// Quem compartilha numa versão antiga não conhece os canais: ninguém responde em OLA_MS e o jogo começa sem teste.

import { descricaoSemReordenar } from './turbo.js';

export const CANAL_TESTE = 'turbo-teste';
export const CANAL_TESTE_DADOS = 'turbo-teste-dados';

const RAMPA = [3000, 6000, 9000, 12_000, 16_000, 20_000, 26_000]; // kbps
const DEGRAU_MS = 1500;
const CONFIRMA_MS = 5000;
const CONFIRMA_VEZES = 3;
const QUEDA = 0.75; // a confirmação não passou: a próxima é com esta fração
const ALVO_MIN = 12_000; // testa pelo menos até aqui
const ALVO_MAX = 26_000;
const CODEC_MS = 1600;
const CODEC_KBPS_MAX = 10_000;
const OLA_MS = 3000;
const PAUSA_MS = 120; // entre um degrau e outro (a fila do anterior acaba)
const RECUPERA_MS = 1200; // depois de um degrau que não passou
const CHEIO_MS = 40_000; // o teste inteiro nunca passa disto
// um degrau passa com tudo isto
const CHEGOU_MIN = 0.94;
const PERDA_MAX = 1.5; // %
const BURACO_MAX = 260; // ms sem chegar nada
const FILA_MAX = 70; // ms (p90 da viagem − a menor)
export const CORTE_MS = 500; // um buraco assim é o caminho cortando tudo

// quem compartilha: o que aceita de quem joga
const KBPS_MAX = 40_000;
const MS_MAX = 8000;
const TOTAL_MS_MAX = 45_000;
const QPS = 60;
const PEDACO = 1100;
const CAB = 24;
const PEDACO_CODEC = 16_000;
const AQUECE = 10; // os primeiros quadros são o codificador e o decodificador ligando: não contam nos tempos

const pct = (v, p) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(o.length * p))];
};
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------------------------------------------------------------- as contas (testes/turbo-teste.test.mjs)

// chegadas: [{ em, t0, bytes }] dos pedaços de um degrau; envio: o que quem compartilha contou
// { bytes, pedacos, adiados }; pedido: { kbps, ms }; inicio e fim: a janela daqui
export function resumirDegrau({ chegadas, envio, pedido, fim, travouAqui = 0 }) {
  const n = chegadas.length;
  const bytes = chegadas.reduce((s, c) => s + c.bytes, 0);
  const viagens = chegadas.map((c) => c.em - c.t0);
  const menor = n ? viagens.reduce((a, b) => Math.min(a, b)) : null;
  const ordem = chegadas.map((c) => c.em).sort((a, b) => a - b);
  // o buraco entre a última chegada e o fim do degrau também conta (cortou e não voltou)
  let buraco = 0;
  for (let i = 1; i < ordem.length; i++) buraco = Math.max(buraco, ordem[i] - ordem[i - 1]);
  if (n && fim != null) buraco = Math.max(buraco, fim - ordem[n - 1]);
  if (!n) buraco = pedido.ms;
  const pedidoBytes = (pedido.kbps * pedido.ms) / 8;
  const r = {
    kbps: pedido.kbps,
    ms: pedido.ms,
    saiuKbps: Math.round(((envio?.bytes || 0) * 8) / pedido.ms),
    chegouKbps: Math.round((bytes * 8) / pedido.ms),
    perdaPct: envio?.pedacos ? r1(Math.max(0, (1 - n / envio.pedacos) * 100)) : null,
    filaP50: n ? r1(pct(viagens, 0.5) - menor) : null,
    filaP90: n ? r1(pct(viagens, 0.9) - menor) : null,
    tremidoMs: n ? r1(pct(viagens, 0.95) - pct(viagens, 0.5)) : null,
    buracoMs: Math.round(buraco),
    travouLaMs: envio?.travou || 0, // a página de cada lado parada, não o caminho
    travouAquiMs: Math.round(travouAqui),
    adiados: envio?.adiados || 0,
  };
  // o buraco que a página parada (de um lado ou do outro) explica não conta
  const doCaminho = Math.max(r.travouLaMs, r.travouAquiMs) >= r.buracoMs * 0.7 ? 0 : r.buracoMs;
  r.buracoCaminhoMs = doCaminho;
  r.corte = doCaminho >= CORTE_MS;
  const porque = [];
  if (!envio) porque.push('sem resposta');
  if (bytes < (envio?.bytes || 1) * CHEGOU_MIN) porque.push('não chegou tudo');
  if ((envio?.bytes || 0) < pedidoBytes * 0.9) porque.push('não saiu tudo');
  if (r.perdaPct > PERDA_MAX) porque.push('perda');
  if (doCaminho > BURACO_MAX) porque.push(r.corte ? 'corte' : 'buraco');
  if (r.filaP90 > FILA_MAX) porque.push('fila');
  r.ok = !porque.length;
  if (porque.length) r.porque = porque.join(', ');
  return r;
}

// O plano do teste: um gerador que pede um degrau ({ kbps, ms, confirma }) e recebe o resumo dele. Devolve
// { tetoKbps, livre, confirma }: livre, passou até o fim (o alvo) sem nenhum limite aparecer.
export function* planoDaBanda({ ps5Kbps = null } = {}) {
  const topo = Math.min(ALVO_MAX, Math.max(ALVO_MIN, Number(ps5Kbps) || 16_000));
  const rampa = [...RAMPA.filter((k) => k < topo), topo];
  let bom = 0;
  let ruim = null;
  let ultimo = null;
  for (const kbps of rampa) {
    let r = yield { kbps, ms: DEGRAU_MS };
    ultimo = r;
    // uma vez só pode ser um soluço: confere de novo antes de parar
    if (!r.ok) ultimo = r = yield { kbps, ms: DEGRAU_MS, deNovo: true };
    if (!r.ok) {
      ruim = kbps;
      break;
    }
    bom = kbps;
  }
  if (!bom) return { tetoKbps: Math.max(800, Math.round(Math.min(RAMPA[0], ultimo?.chegouKbps || 0) * 0.8)), livre: false, confirma: ultimo };
  // entre o último que passou e o que não passou tem um passo grande: tenta o meio
  if (ruim && bom >= 6000) {
    const meio = Math.round((bom + ruim) / 2);
    ultimo = yield { kbps: meio, ms: DEGRAU_MS };
    if (ultimo.ok) bom = meio;
  }
  let alvo = ruim ? Math.round(bom * 0.95) : bom;
  let livre = !ruim && alvo === topo;
  let confirma = null;
  for (let i = 0; i < CONFIRMA_VEZES; i++) {
    confirma = yield { kbps: alvo, ms: CONFIRMA_MS, confirma: true };
    if (confirma.ok) return { tetoKbps: alvo, livre, confirma };
    livre = false;
    alvo = Math.max(1200, Math.round(alvo * QUEDA));
  }
  return { tetoKbps: alvo, livre: false, confirma };
}

// um codec serve? c: { codec, quadros, saiu, decP50, decP95, codP50, segurando } do passo 2
const serve = (c) => !!c && !c.erro && c.quadros >= 20 && c.saiu >= c.quadros * 0.9 && c.decP95 <= 25 && (c.codP95 ?? 0) <= 25 && !c.segurando;

// O codec: H.265 só quando vale (a banda é pouca e os dois PCs dão conta sem demorar mais); senão, H.264.
// Com o PS5 em H.265 repassado, o H.264 obrigaria a codificar de novo no PC: aí o H.265 ganha se servir.
export function escolherCodec({ h264, h265, tetoKbps, livre, ps5Hevc = false }) {
  if (!serve(h265)) return { codec: 'h264', porque: !h265 || h265.erro ? 'o H.265 não funciona entre os dois PCs' : 'o H.265 demora ou perde quadros aqui' };
  if (!serve(h264)) return { codec: 'h265', porque: 'o H.264 demora ou perde quadros aqui' };
  if (ps5Hevc) return { codec: 'h265', porque: 'o PS5 já manda em H.265' };
  const custo = (h265.decP50 + (h265.codP50 || 0)) - (h264.decP50 + (h264.codP50 || 0));
  if (custo > 6) return { codec: 'h264', porque: `o H.265 demora ${r1(custo)} ms a mais` };
  if (livre || tetoKbps >= 14_000) return { codec: 'h264', porque: 'sobra banda: o H.264 é mais leve' };
  return { codec: 'h265', porque: 'mais nítido na banda que a conexão leva' };
}

// O modo: o padrão da página, a não ser que a conexão seja parada o bastante para a folga de 15 ms do Turbo rápido
export function escolherModo({ padrao, rapido, confirma }) {
  if (!confirma?.ok) return { modo: padrao, porque: 'a conexão oscila: o modo com mais folga' };
  if (confirma.tremidoMs <= 6 && confirma.perdaPct <= 0.2 && (confirma.buracoCaminhoMs ?? confirma.buracoMs) <= 80) return { modo: rapido, porque: 'conexão muito estável: o menor atraso' };
  return { modo: padrao, porque: `a conexão oscila (treme ${confirma.tremidoMs} ms, perda ${confirma.perdaPct}%, até ${confirma.buracoMs} ms sem chegar nada): precisa da folga do liso` };
}

export function escolher({ banda, h264 = null, h265 = null, ps5 = null, padrao, rapido }) {
  const c = escolherCodec({ h264, h265, tetoKbps: banda.tetoKbps, livre: banda.livre, ps5Hevc: !!ps5?.hevc });
  const m = escolherModo({ padrao, rapido, confirma: banda.confirma });
  const ps5Kbps = Number(ps5?.kbps) || null;
  return {
    tetoKbps: banda.tetoKbps,
    livre: banda.livre,
    codec: c.codec,
    codecPorque: c.porque,
    modo: m.modo,
    modoPorque: m.porque,
    // a banda que o PS5 deveria ter para ir repassado (a original) sem passar do que o caminho leva
    ps5Sugerido: ps5Kbps && !banda.livre && banda.tetoKbps < ps5Kbps ? Math.max(2000, Math.floor(banda.tetoKbps / 1000) * 1000) : null,
  };
}

// ---------------------------------------------------------------- quem compartilha
// Um relógio que não para com a aba em segundo plano (o setInterval da página cai para 1 por segundo)
function relogio(ms, f) {
  let w = null;
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = f;
    return () => w.terminate();
  } catch {
    const t = setInterval(f, ms);
    return () => clearInterval(t);
  }
}

export class TesteEnvio {
  // tela(key) -> { stream, controle, ps5 } (a do TurboEnvio); silenciar(id, key, sim): o vídeo normal para essa
  // pessoa para durante o teste; onEvento(id, texto, dados)
  constructor({ tela, silenciar = null, onEvento = null }) {
    Object.assign(this, { tela, silenciar, onEvento });
    this.testes = new Map(); // id de quem joga -> { canal, dados, key, gasto }
    this.canaisDados = new Map();
  }

  receberDados(id, canal) {
    canal.binaryType = 'arraybuffer';
    this.canaisDados.set(id, canal);
    canal.onclose = () => { if (this.canaisDados.get(id) === canal) this.canaisDados.delete(id); };
  }

  receber(id, canal) {
    this.acabar(id);
    const t = { id, canal, key: null, gasto: 0, parar: null };
    this.testes.set(id, t);
    canal.binaryType = 'arraybuffer';
    canal.onclose = () => { if (this.testes.get(id) === t) this.acabar(id); };
    canal.onmessage = (e) => {
      if (typeof e.data !== 'string' || this.testes.get(id) !== t) return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.ping != null) return this.dizer(t, { pong: m.ping, t: performance.now() });
      if (typeof m.ola === 'string') return this.ola(t, m.ola);
      if (!t.key) return;
      if (m.degrau != null) this.degrau(t, m);
      else if (m.codec != null) this.codec(t, m).catch((err) => this.dizer(t, { codecFim: m.codec, erro: String(err?.message || err).slice(0, 120) }));
      else if (m.resultado) this.onEvento?.(id, 'teste da conexão: resultado', m.resultado);
      else if (m.fim) this.acabar(id);
    };
  }

  dizer(t, m) { try { t.canal.send(JSON.stringify(m)); } catch { /* canal fechou */ } }

  ola(t, key) {
    const tela = this.tela(key);
    if (!tela?.controle) return this.dizer(t, { erro: 'sem-controle' });
    if (!t.key) {
      t.key = key;
      this.silenciar?.(t.id, key, true);
      // quem joga sumiu no meio (a página fechou): o vídeo normal volta de qualquer jeito
      t.prazo = setTimeout(() => this.acabar(t.id), TOTAL_MS_MAX);
    }
    const f = tela.ps5;
    this.dizer(t, { ola: 1, ps5: f ? { kbps: Number(f.kbps) || null, hevc: !!f.hevc, pcDireto: !!f.banda, taxa: f.taxa?.() ?? null } : null });
  }

  // manda kbps por ms em quadros (60 por segundo), como a imagem
  degrau(t, { degrau, kbps, ms }) {
    const k = Math.min(KBPS_MAX, Math.max(200, Number(kbps) || 0));
    const dura = Math.min(MS_MAX, Math.max(200, Number(ms) || 0));
    t.parar?.();
    t.gasto += dura;
    const dados = this.canaisDados.get(t.id);
    if (t.gasto > TOTAL_MS_MAX || !dados || dados.readyState !== 'open') return this.dizer(t, { acabou: degrau, erro: 'canal' });
    const porQuadro = Math.max(PEDACO, Math.round((k * 1000) / 8 / QPS));
    const total = Math.round((dura / 1000) * QPS);
    const filaMax = Math.max(64_000, (k * 1000) / 8 * 0.3); // 300 ms: mais que isto esperando, o caminho não leva
    const conta = { bytes: 0, pedacos: 0, quadros: 0, adiados: 0, filaMax: 0, travou: 0 };
    let antes = 0;
    const enchimento = crypto.getRandomValues(new Uint8Array(PEDACO)); // nada no caminho comprime
    const inicio = performance.now();
    let feitos = 0;
    const acabou = () => {
      parar();
      if (t.parar === parar) t.parar = null;
      this.dizer(t, { acabou: degrau, ...conta });
    };
    const passo = () => {
      if (dados.readyState !== 'open') return acabou();
      const agora = performance.now();
      // a página daqui parou (a sala 3D, outro programa): o buraco que chega lá não é do caminho
      if (antes) conta.travou = Math.max(conta.travou, Math.round(agora - antes));
      antes = agora;
      const devidos = Math.min(total, Math.floor(((agora - inicio) / 1000) * QPS));
      // a página parou e voltou: o que ficou para trás sai em no máximo 4 quadros de uma vez
      let n = 0;
      while (feitos < devidos && n++ < 4) {
        feitos++;
        conta.filaMax = Math.max(conta.filaMax, dados.bufferedAmount);
        if (dados.bufferedAmount > filaMax) { conta.adiados++; continue; }
        let falta = porQuadro;
        while (falta > 0) {
          const tam = Math.min(PEDACO, Math.max(64, falta));
          const msg = new Uint8Array(CAB + tam);
          const v = new DataView(msg.buffer);
          v.setUint8(0, 1);
          v.setUint16(2, degrau);
          v.setUint32(4, feitos);
          v.setFloat64(8, performance.now());
          msg.set(enchimento.subarray(0, tam), CAB);
          try { dados.send(msg); } catch { conta.adiados++; break; }
          conta.bytes += msg.length;
          conta.pedacos++;
          falta -= tam;
        }
        conta.quadros++;
      }
      if (feitos < devidos && n > 4) feitos = devidos;
      if (agora - inicio >= dura) acabou();
    };
    const parar = relogio(6, passo);
    t.parar = parar;
  }

  // a imagem da tela codificada aqui no codec pedido, pelo canal confiável
  async codec(t, { codec: n, codecs, kbps, ms }) {
    const dura = Math.min(4000, Math.max(300, Number(ms) || 0));
    t.parar?.();
    const original = this.tela(t.key)?.stream?.getVideoTracks()[0];
    if (!original || original.readyState !== 'live') return this.dizer(t, { codecFim: n, erro: 'sem-tela' });
    if (typeof VideoEncoder !== 'function' || typeof MediaStreamTrackProcessor !== 'function') return this.dizer(t, { codecFim: n, erro: 'navegador' });
    const trilha = original.clone();
    const leitor = new MediaStreamTrackProcessor({ track: trilha, maxBufferSize: 3 }).readable.getReader();
    const bitrate = Math.min(20_000, Math.max(1000, Number(kbps) || 6000)) * 1000;
    const tempos = new Map();
    const cod = [];
    let enc = null;
    let config = null;
    let seq = 0;
    let enviados = 0;
    let falhou = null;
    const mandar = (chunk, meta) => {
      const t0 = tempos.get(chunk.timestamp);
      tempos.delete(chunk.timestamp);
      if (t0 != null && seq >= AQUECE) cod.push(performance.now() - t0);
      const dc = meta?.decoderConfig;
      if (dc) {
        const d = dc.description;
        let b = !d ? null : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        // como no turbo (enviarQuadro): sem a VUI o decodificador da placa de lá guarda quadros e o teste o culparia
        if (b && /^avc/.test(dc.codec || config.codec)) b = descricaoSemReordenar(b) || b;
        this.dizer(t, { codecCfg: n, codec: dc.codec || config.codec, w: config.width, h: config.height, descricao: b ? btoa(String.fromCharCode(...b)) : null });
      }
      const dados = new Uint8Array(chunk.byteLength);
      chunk.copyTo(dados);
      seq++;
      const total = Math.ceil(dados.length / PEDACO_CODEC) || 1;
      for (let i = 0; i < total; i++) {
        const parte = dados.subarray(i * PEDACO_CODEC, (i + 1) * PEDACO_CODEC);
        const msg = new Uint8Array(CAB + parte.length);
        const v = new DataView(msg.buffer);
        v.setUint8(0, 2);
        v.setUint8(1, chunk.type === 'key' ? 1 : 0);
        v.setUint16(2, n);
        v.setUint32(4, seq);
        v.setFloat64(8, chunk.timestamp);
        v.setUint16(16, i);
        v.setUint16(18, total);
        msg.set(parte, CAB);
        try { t.canal.send(msg); } catch { falhou ??= 'canal'; return; }
      }
      enviados++;
    };
    const fim = performance.now() + dura;
    // a tela parada (o PS5 sem mandar nada) não prende o teste: o leitor acaba no prazo
    const prazo = setTimeout(() => leitor.cancel().catch(() => {}), dura + 800);
    try {
      while (performance.now() < fim && !falhou && this.testes.get(t.id) === t) {
        const { value: frame, done } = await leitor.read();
        if (done) { frame?.close(); break; }
        try {
          if (!enc) {
            const w = frame.displayWidth & ~1;
            const h = frame.displayHeight & ~1;
            for (const c of (Array.isArray(codecs) ? codecs : []).slice(0, 8)) {
              for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
                for (const bitrateMode of ['constant', undefined]) {
                  const cfg = { codec: String(c), width: w, height: h, bitrate, framerate: 60, latencyMode: 'realtime', hardwareAcceleration };
                  if (/^(hev1|hvc1)/.test(c)) cfg.hevc = { format: 'hevc' };
                  else cfg.avc = { format: 'avc' };
                  if (bitrateMode) cfg.bitrateMode = bitrateMode;
                  const r = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
                  if (r?.supported) { config = cfg; break; }
                }
                if (config) break;
              }
              if (config) break;
            }
            if (!config) { falhou = 'codificador'; break; }
            enc = new VideoEncoder({ output: mandar, error: (err) => { falhou = `codificador: ${err.message}`.slice(0, 100); } });
            enc.configure(config);
          }
          if (enc.state !== 'configured' || enc.encodeQueueSize > 2 || t.canal.bufferedAmount > 600_000) continue;
          tempos.set(frame.timestamp, performance.now());
          enc.encode(frame, { keyFrame: seq === 0 && tempos.size === 1 });
        } finally {
          frame.close();
        }
      }
      if (enc?.state === 'configured') await enc.flush().catch(() => {});
    } finally {
      clearTimeout(prazo);
      leitor.cancel().catch(() => {});
      trilha.stop();
      try { if (enc && enc.state !== 'closed') enc.close(); } catch { /* já fechado */ }
    }
    this.dizer(t, { codecFim: n, quadros: enviados, codP50: r1(pct(cod, 0.5)), codP95: r1(pct(cod, 0.95)), codec: config?.codec ?? null, placa: config?.hardwareAcceleration === 'prefer-hardware', ...(falhou ? { erro: falhou } : {}) });
  }

  acabar(id) {
    const t = this.testes.get(id);
    if (!t) return;
    this.testes.delete(id);
    clearTimeout(t.prazo);
    t.parar?.();
    try { t.canal.close(); } catch { /* já fechado */ }
    try { this.canaisDados.get(id)?.close(); } catch { /* já fechado */ }
    if (t.key) this.silenciar?.(id, t.key, false);
  }
}

// ---------------------------------------------------------------- quem joga
export class TesteJoga {
  // abrir(idDoDono) -> { canal, dados } (rtc.abrirTeste) ou null; caminho(id) -> Promise: o caminho em uso (rtc.caminhoPara);
  // caminhos(id) -> Promise: todos os pares que respondem (rtc.caminhosDe); onProgresso({ fase, parte, texto })
  constructor({ abrir, caminho = null, caminhos = null, onProgresso = null, onEvento = null }) {
    Object.assign(this, { abrir, caminho, caminhos, onProgresso, onEvento });
    this.t = null;
  }

  get testando() { return !!this.t; }

  pular(motivo = 'pulado') {
    const t = this.t;
    if (t) t.abortar(motivo);
  }

  // codecs: { h264: [...], h265: [...] } que este aparelho decodifica; padrao/rapido: os modos (escolher).
  // Devolve { ...escolher(), banda, degraus, ... } ou { erro }. Nunca lança.
  async rodar(key, { codecs, padrao, rapido }) {
    this.pular('outro teste');
    const dono = String(key).split('~')[0];
    const ch = this.abrir(dono);
    if (!ch) return { erro: 'conexao' };
    const t = { canal: ch.canal, dados: ch.dados, esperas: new Map(), chegadas: new Map(), pings: new Map(), rtts: [], cod: null, ola: null, saiu: false };
    this.t = t;
    const inicio = performance.now();
    const abortado = new Promise((_, erra) => { t.abortar = (motivo) => { t.saiu = true; erra(new Error(motivo)); }; });
    abortado.catch(() => {});
    const limite = setTimeout(() => t.abortar('demorou demais'), CHEIO_MS);
    const com = (p) => Promise.race([p, abortado]);
    t.canal.binaryType = 'arraybuffer';
    t.dados.binaryType = 'arraybuffer';
    t.canal.onclose = () => t.abortar('o canal fechou');
    t.dados.onmessage = (e) => this.pedaco(t, e.data);
    t.canal.onmessage = (e) => (typeof e.data === 'string' ? this.texto(t, e.data) : this.quadroCodec(t, e.data));
    const tab = { degraus: [], caminhos: null };
    try {
      await com(Promise.all([this.aberto(t.canal), this.aberto(t.dados)]).then((v) => { if (!v.every(Boolean)) throw new Error('o canal não abriu'); }));
      this.dizer(t, { ola: key });
      const ola = await com(this.resposta(t, 'ola', OLA_MS));
      if (!ola) throw new Error('quem compartilha está numa versão antiga');
      if (ola.erro) throw new Error(ola.erro);
      t.ps5 = ola.ps5;
      t.pingar = setInterval(() => this.ping(t), 150);
      this.onProgresso?.({ parte: 0.02, texto: 'Medindo o tempo de resposta…' });
      await com(esperar(500));
      const rtt0 = r1(pct(t.rtts, 0.5));
      const rede0 = await com(Promise.resolve(this.caminho?.(dono)).catch(() => null));

      const plano = planoDaBanda({ ps5Kbps: ola.ps5?.kbps ?? null });
      let p = plano.next();
      let n = 0;
      while (!p.done) {
        const d = p.value;
        n++;
        this.onProgresso?.({ parte: Math.min(0.8, 0.05 + n * 0.075), texto: d.confirma ? `Confirmando ${fmt(d.kbps)}…` : `Testando ${fmt(d.kbps)}…` });
        const r = await com(this.medir(t, n, d));
        const rede = await com(Promise.resolve(this.caminho?.(dono)).catch(() => null));
        Object.assign(r, { rttMs: r.rttMs ?? null, iceRttMs: rede?.rttMs ?? null, familia: rede?.familia ?? null, par: rede?.par ?? null }, d.confirma ? { confirma: true } : {});
        tab.degraus.push(r);
        p = plano.next(r);
        // o caminho que cortou leva ~1 s para voltar: o próximo degrau não paga por este
        if (!p.done && !r.ok) await com(esperar(RECUPERA_MS));
      }
      const banda = p.value;
      tab.caminhos = await com(Promise.resolve(this.caminhos?.(dono)).catch(() => null));
      const rede1 = await com(Promise.resolve(this.caminho?.(dono)).catch(() => null));

      const kbpsCodec = Math.min(CODEC_KBPS_MAX, Math.max(1500, Math.round(banda.tetoKbps * 0.8)));
      const res = {};
      for (const [nome, lista, parte] of [['h264', codecs.h264, 0.86], ['h265', codecs.h265, 0.94]]) {
        if (!lista?.length) { res[nome] = { erro: 'este aparelho não decodifica' }; continue; }
        this.onProgresso?.({ parte, texto: `Comparando a imagem em ${nome === 'h264' ? 'H.264' : 'H.265'}…` });
        res[nome] = await com(this.medirCodec(t, ++n, lista, kbpsCodec));
        await com(esperar(PAUSA_MS));
      }
      const escolha = escolher({ banda, ...res, ps5: ola.ps5, padrao, rapido });
      const r = {
        ...escolha,
        rttInicioMs: rtt0,
        rttMs: r1(pct(t.rtts.slice(-12), 0.5)),
        // o caminho trocou sozinho durante o teste (2026-11-25: de 8 para 50 ms, sem motivo conhecido)
        caminho: { de: rede0 && { par: rede0.par, rttMs: rede0.rttMs, familia: rede0.familia, local: rede0.local, remoto: rede0.remoto }, para: rede1 && { par: rede1.par, rttMs: rede1.rttMs, familia: rede1.familia, local: rede1.local, remoto: rede1.remoto }, trocou: !!(rede0?.par && rede1?.par && rede0.par !== rede1.par) },
        relay: !!rede1?.relay,
        ps5: ola.ps5,
        codecs: res,
        degraus: tab.degraus,
        caminhos: tab.caminhos,
        duracaoMs: Math.round(performance.now() - inicio),
      };
      this.onEvento?.('teste da conexão', r);
      const { degraus, caminhos, ...curto } = r;
      this.dizer(t, { resultado: { ...curto, degraus: degraus.map((x) => `${x.kbps}${x.ok ? ' ok' : ` ${x.porque}`}`) } });
      this.onProgresso?.({ parte: 1, texto: 'Pronto' });
      return r;
    } catch (err) {
      const motivo = String(err?.message || err).slice(0, 120);
      this.onEvento?.('teste da conexão: não terminou', { motivo, degraus: tab.degraus, ms: Math.round(performance.now() - inicio) });
      return { erro: motivo };
    } finally {
      clearTimeout(limite);
      clearInterval(t.pingar);
      if (this.t === t) this.t = null;
      this.dizer(t, { fim: 1 });
      t.canal.onclose = null;
      t.canal.onmessage = null;
      t.dados.onmessage = null;
      try { t.cod?.dec?.close(); } catch { /* já fechado */ }
      // o "fim" ainda precisa sair antes de o canal fechar
      setTimeout(() => {
        try { t.canal.close(); } catch { /* já fechado */ }
        try { t.dados.close(); } catch { /* já fechado */ }
      }, 300);
    }
  }

  aberto(canal) {
    if (canal.readyState === 'open') return Promise.resolve(true);
    return new Promise((ok) => {
      const fim = setTimeout(() => ok(false), OLA_MS + 1000);
      canal.addEventListener('open', () => { clearTimeout(fim); ok(true); }, { once: true });
    });
  }

  dizer(t, m) { try { t.canal.send(JSON.stringify(m)); } catch { /* canal fechou */ } }

  resposta(t, chave, ms) {
    return new Promise((ok) => {
      const fim = setTimeout(() => { t.esperas.delete(chave); ok(null); }, ms);
      t.esperas.set(chave, (m) => { clearTimeout(fim); t.esperas.delete(chave); ok(m); });
    });
  }

  ping(t) {
    const n = (t.pingN = (t.pingN || 0) + 1);
    t.pings.set(n, performance.now());
    if (t.pings.size > 40) t.pings.delete(t.pings.keys().next().value);
    this.dizer(t, { ping: n });
  }

  texto(t, txt) {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (m.pong != null) {
      const em = t.pings.get(m.pong);
      if (em != null) { t.pings.delete(m.pong); t.rtts.push(performance.now() - em); if (t.rtts.length > 200) t.rtts.shift(); }
      return;
    }
    if (m.ola || m.erro) t.esperas.get('ola')?.(m);
    if (m.acabou != null) t.esperas.get(`d${m.acabou}`)?.(m);
    if (m.codecCfg != null) this.cfgCodec(t, m);
    if (m.codecFim != null) t.esperas.get(`c${m.codecFim}`)?.(m);
  }

  pedaco(t, buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < CAB) return;
    const v = new DataView(buf);
    if (v.getUint8(0) !== 1) return;
    const n = v.getUint16(2);
    const l = t.chegadas.get(n);
    if (l) l.push({ em: performance.now(), t0: v.getFloat64(8), bytes: buf.byteLength });
  }

  async medir(t, n, d) {
    const chegadas = [];
    t.chegadas.set(n, chegadas);
    const rtts = t.rtts.length;
    let travou = 0;
    let antes = performance.now();
    const vigia = setInterval(() => { const a = performance.now(); travou = Math.max(travou, a - antes - 20); antes = a; }, 20);
    this.dizer(t, { degrau: n, kbps: d.kbps, ms: d.ms });
    const fim = await this.resposta(t, `d${n}`, d.ms + 4000);
    const acabou = performance.now();
    await esperar(PAUSA_MS + Math.min(300, pct(t.rtts.slice(-8), 0.5) || 0));
    clearInterval(vigia);
    t.chegadas.delete(n);
    const r = resumirDegrau({ chegadas, envio: fim && !fim.erro ? fim : null, pedido: d, fim: acabou, travouAqui: travou });
    const novos = t.rtts.slice(Math.min(rtts, t.rtts.length - 1));
    r.rttMs = r1(pct(novos, 0.5));
    return r;
  }

  // ------------------------------------------------------------ codec
  async medirCodec(t, n, lista, kbps) {
    const c = { n, partes: null, dec: null, sub: new Map(), tempos: [], saiu: 0, quadros: 0, erro: null, filaMax: 0, filas: [] };
    t.cod = c;
    this.dizer(t, { codec: n, codecs: lista, kbps, ms: CODEC_MS });
    const fim = await this.resposta(t, `c${n}`, CODEC_MS + 5000);
    await esperar(150);
    const r = { codec: fim?.codec ?? null, kbps, quadros: c.quadros, saiu: c.saiu, decP50: r1(pct(c.tempos, 0.5)), decP95: r1(pct(c.tempos, 0.95)), codP50: fim?.codP50 ?? null, codP95: fim?.codP95 ?? null, placaLa: fim?.placa ?? null, chegaram: fim?.quadros ?? null };
    // guardando: o decodificador só solta o quadro com vários na frente (a espera vira atraso fixo)
    r.segurando = c.filas.length >= 15 && pct(c.filas, 0.5) >= 3;
    const erro = c.erro || fim?.erro || (!fim ? 'sem resposta' : null);
    if (erro) r.erro = erro;
    t.cod = null;
    try { if (c.dec && c.dec.state !== 'closed') c.dec.close(); } catch { /* já fechado */ }
    return r;
  }

  cfgCodec(t, m) {
    const c = t.cod;
    if (!c || c.n !== m.codecCfg) return;
    try {
      c.dec ??= new VideoDecoder({
        output: (f) => {
          const em = c.sub.get(f.timestamp);
          if (em != null) { c.sub.delete(f.timestamp); if (c.saiu >= AQUECE) c.tempos.push(performance.now() - em); }
          c.saiu++;
          f.close();
        },
        error: (err) => { c.erro ??= `decodificador: ${err.message}`.slice(0, 100); },
      });
      const cfg = { codec: m.codec, codedWidth: m.w, codedHeight: m.h, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' };
      if (m.descricao) cfg.description = Uint8Array.from(atob(m.descricao), (x) => x.charCodeAt(0));
      c.dec.configure(cfg);
    } catch (err) {
      c.erro ??= `decodificador: ${err.message}`.slice(0, 100);
    }
  }

  quadroCodec(t, buf) {
    const c = t.cod;
    if (!c || !(buf instanceof ArrayBuffer) || buf.byteLength < CAB) return;
    const v = new DataView(buf);
    if (v.getUint8(0) !== 2 || v.getUint16(2) !== c.n) return;
    const seq = v.getUint32(4);
    const i = v.getUint16(16);
    const total = v.getUint16(18);
    if (!c.partes || c.partes.seq !== seq) c.partes = { seq, l: [], n: 0 };
    c.partes.l[i] = new Uint8Array(buf, CAB);
    if (++c.partes.n < total) return;
    const dados = new Uint8Array(c.partes.l.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of c.partes.l) { dados.set(p, o); o += p.length; }
    c.partes = null;
    if (!c.dec || c.dec.state !== 'configured') return;
    c.quadros++;
    const ts = v.getFloat64(8);
    c.sub.set(ts, performance.now());
    if (c.quadros > AQUECE) c.filas.push(c.sub.size);
    try {
      c.dec.decode(new EncodedVideoChunk({ type: v.getUint8(1) ? 'key' : 'delta', timestamp: ts, data: dados }));
    } catch (err) {
      c.erro ??= `decodificador: ${err.message}`.slice(0, 100);
    }
  }
}

const fmt = (kbps) => `${(kbps / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbps`;

// os codecs que este aparelho decodifica, nas listas que o teste manda
export async function codecsDaqui(listaH264, listaH265) {
  const ver = async (l) => {
    const r = [];
    for (const codec of l) {
      const s = typeof VideoDecoder === 'function' ? await VideoDecoder.isConfigSupported({ codec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' }).catch(() => null) : null;
      if (s?.supported) r.push(codec);
    }
    return r;
  };
  return { h264: await ver(listaH264), h265: await ver(listaH265) };
}

// ---------------------------------------------------------------- o painel na tela de quem joga
const CSS = `
.tc-painel{position:absolute;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;padding-bottom:84px;pointer-events:none;background:rgba(6,8,14,.35);color:#eef2ff;font:15px/1.45 system-ui,sans-serif}
.tc-caixa{pointer-events:auto;width:min(440px,calc(100% - 32px));padding:22px 24px;border-radius:14px;background:#141927;border:1px solid #2b3450;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.tc-caixa b{display:block;font-size:17px;margin-bottom:4px}
.tc-caixa p{margin:0 0 14px;color:#aab4d0}
.tc-barra{height:8px;border-radius:99px;background:#232b42;overflow:hidden}
.tc-barra i{display:block;height:100%;width:0;border-radius:99px;background:#5b8cff;transition:width .3s}
.tc-linha{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:14px}
.tc-linha span{color:#cdd6f4}
.tc-caixa button{background:none;border:1px solid #3b4668;color:#cdd6f4;border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer}
.tc-caixa button:hover{border-color:#5b8cff}
.tc-fim{background:none;align-items:flex-start;padding:0}
.tc-fim .tc-caixa{pointer-events:none;margin-top:56px;padding:14px 18px}
.tc-fim p{margin:0}`;
let estilo = null;
// Registrado já no import, antes do teclado do jogo (que segura as teclas na mesma fase)
let aberto = null;
if (typeof addEventListener === 'function' && typeof document !== 'undefined') addEventListener('keydown', (e) => {
  if (e.key !== 'F7' || !aberto) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  aberto.onPular?.();
}, true);

export class PainelTeste {
  // dentro: o elemento da tela cheia (#focus); onPular(): o botão ou a tecla F7 (com o mouse preso não há clique)
  constructor({ dentro, onPular }) {
    Object.assign(this, { dentro, onPular, el: null });
  }

  mostrar() {
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.textContent = CSS;
      document.head.append(estilo);
    }
    this.fechar();
    const el = document.createElement('div');
    el.className = 'tc-painel';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="tc-caixa"><b>Testando a conexão com o PC do jogo</b><p>Uns 15 a 25 segundos, para escolher a melhor imagem agora.</p><div class="tc-barra"><i></i></div><div class="tc-linha"><span></span><button type="button">Pular (F7)</button></div></div>';
    el.querySelector('button').addEventListener('click', () => this.onPular?.());
    this.el = el;
    this.dentro()?.append(el);
    aberto = this;
  }

  progresso({ parte, texto }) {
    if (!this.el) return;
    this.el.querySelector('i').style.width = `${Math.round(Math.max(0, Math.min(1, parte)) * 100)}%`;
    this.el.querySelector('span').textContent = texto || '';
  }

  // o resultado por uns segundos, sem tapar o jogo
  resultado(r, nomeDoModo) {
    this.fechar();
    const el = document.createElement('div');
    el.className = 'tc-painel tc-fim';
    el.setAttribute('role', 'status');
    const caixa = document.createElement('div');
    caixa.className = 'tc-caixa';
    const b = document.createElement('b');
    b.textContent = nomeDoModo;
    const p = document.createElement('p');
    p.textContent = textoDoResultado(r);
    caixa.append(b, p);
    el.append(caixa);
    this.el = el;
    this.dentro()?.append(el);
    this.some = setTimeout(() => this.fechar(), 6000);
  }

  fechar() {
    clearTimeout(this.some);
    if (aberto === this) aberto = null;
    this.el?.remove();
    this.el = null;
  }
}

export function textoDoResultado(r) {
  const banda = r.livre ? `mais de ${fmt(r.tetoKbps)}` : `até ${fmt(r.tetoKbps)}`;
  return `${banda} · ${r.rttMs != null ? `${Math.round(r.rttMs)} ms` : '–'} · ${r.codec === 'h265' ? 'H.265' : 'H.264'}`;
}

// ---------------------------------------------------------------- o que fica lembrado
// O resultado vale por VALE_MS com o mesmo dono e um caminho parecido (um corte no meio do jogo fica lembrado no
// PC que compartilha: TurboEnvio.lembrarCorte).
const VALE_MS = 10 * 60_000;

export class MemoriaTeste {
  constructor(agora = () => Date.now()) {
    this.agora = agora;
    this.m = new Map();
  }

  guardar(dono, r, rede) { this.m.set(dono, { r, em: this.agora(), familia: rede?.familia ?? null, rttMs: rede?.rttMs ?? null }); }

  // ainda vale? uma conexão nova (o par é outro) com a ida e volta parecida serve: o navegador alterna sozinho
  // entre pares equivalentes
  valido(dono, rede) {
    this.porque = null;
    const v = this.m.get(dono);
    if (!v) return null;
    if (this.agora() - v.em > VALE_MS) this.porque = 'faz mais de 10 min';
    else if (rede?.rttMs != null && v.rttMs != null && Math.abs(rede.rttMs - v.rttMs) > Math.max(25, v.rttMs * 0.6)) this.porque = `a ida e volta mudou de ${v.rttMs} para ${rede.rttMs} ms`;
    else if (rede?.familia && v.familia && rede.familia !== v.familia) this.porque = `o caminho mudou de ${v.familia} para ${rede.familia}`;
    return this.porque ? null : v.r;
  }

  esquecer(dono) { this.m.delete(dono); }
}
