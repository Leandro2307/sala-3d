// Modo turbo (experimental): a imagem do jogo sem o buffer do navegador.
//
// No vídeo normal da conexão, o navegador de quem joga guarda quadros antes de mostrar (o jitter
// buffer: 80–140 ms no iPhone, medido nos relatórios) para a imagem não engasgar. Para jogar, isso é
// atraso puro. No turbo a imagem vai por fora:
//   quem compartilha: a trilha da tela → MediaStreamTrackProcessor (cada quadro) → VideoEncoder
//     (H.264 na placa, modo "realtime") → pedaços de PEDACO bytes no canal "turbo" da conexão;
//   quem joga: junta os pedaços → VideoDecoder (optimizeForLatency) → desenha no <canvas> por cima
//     do vídeo assim que sai do decodificador. Nenhum quadro espera.
// O som continua no WebRTC (com o buffer dele). O vídeo da conexão para essa pessoa fica desligado
// enquanto o turbo funciona (rtc.turboPara): não disputa a banda do Wi-Fi.
//
// Canal "turbo" (quem joga abre, rtc.abrirTurbo): ordenado e com vida curta (TTL_MS) — um pedaço
// perdido no Wi-Fi é reenviado se ainda der tempo; se não der, o quadro se perde, quem joga para de
// decodificar até um quadro-chave novo e o pede ({chave:true}). Assim um engasgo vira uma imagem
// parada por um instante, e não atraso acumulado.
// Mensagens de texto (JSON): quem joga → {ligar: key, codecs, altura, versao}, {chave: true},
// {desligar: true}, {ping: t} (a cada PING_MS; volta {pong: t, t: agora lá}: a ida e volta do próprio
// canal e a diferença entre os relógios dos dois aparelhos); quem compartilha → {cfg: {codec, w, h,
// description}}, {erro}. O H.264 vai no formato "avc" (tamanho na frente de cada NAL) com a descrição
// (avcC) que o codificador entrega: é o que todo VideoDecoder aceita (o Safari inclusive), sem depender
// do Annex B. Binário: cabeçalho (CAB bytes; CAB2 com a versao 2) + pedaço do quadro.
//
// O atraso que dá para tirar daqui (relatório de 2026-11-01, PC no Wi-Fi → iPhone): a fila de envio do
// canal ficava em 10–30 KB e chegava a 107 KB — a 6 Mbps, 15 a 140 ms de imagem esperando a vez, que a
// estimativa nem via (ela usava metade do ping). Por isso:
//   - a fila medida em tempo (medirFila: o que ela tem ÷ a velocidade com que esvazia, medida): um
//     quadro que fosse esperar mais de FILA_MS nem é codificado — melhor pular um quadro do que
//     mandar atrasado; e com a fila apertando, a banda do codificador desce para caber no caminho
//     medido (ajustarBanda) e sobe de volta aos poucos quando folga. Em quilobytes (um quadro só)
//     pulava demais: a captura entrega quadros colados, e o segundo era pulado com a fila a 3 ms de
//     esvaziar;
//   - taxa constante (bitrateMode 'constant'): na NVIDIA, em 720p a 6 Mbps, a taxa variável dava
//     quadros de 15,7 KB em média (acima do alvo) e quadro-chave de 46 KB; a constante, 12,5 KB e
//     quadro-chave de 15 KB. Quadro grande é fila;
//   - sem quadro-chave de segurança a cada 5 s (era um pico na fila a cada 5 s): o canal é ordenado e
//     quem joga percebe quadro perdido e pede um;
//   - medida de verdade (versao 2): cada quadro leva a hora em que saiu da captura (relógio de quem
//     compartilha), e quem joga, com a diferença dos relógios pelo ping, mede quanto ele levou até
//     ser desenhado (pontaMs) e quanto ficou na fila + rede (viagemMs).

const PEDACO = 15000; // bytes de quadro por mensagem (abaixo do limite de 16 KB de qualquer navegador)
const CAB = 20; // id do quadro (u32), pedaço (u16), total (u16), chave (u8), versão (u8: 0 ou 2), ms codificando ×10 (u16), tempo em µs (f64)
const CAB2 = 28; // versão 2: + saiu da captura (f64, ms no relógio de quem compartilha)
const VERSAO = 2;
const TTL_MS = 90; // vida de cada pedaço no canal
const FILA_MS = 20; // um quadro novo que fosse esperar mais que isso na fila de envio é pulado
const FILA_TETO = 256 * 1024; // e com a fila acima disso, sempre (a velocidade medida pode estar velha)
const CONTROLE_MS = 250; // de quanto em quanto a banda do codificador é revista (ajustarBanda)
const BANDA_MIN = 0.5; // a banda desce até metade da do tamanho, no máximo
const PEDIR_CHAVE_MS = 250; // intervalo mínimo entre pedidos de quadro-chave
const PING_MS = 500;
const SEGURANDO = 3; // quadros dentro do decodificador depois de ele já ter soltado algum...
const SEGURANDO_QUADROS = 15; // ...em tantos quadros seguidos: ele está guardando (TurboRecebe.segurando)
const pct = (v, p) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return Math.round(o[Math.min(o.length - 1, Math.floor(o.length * p))] * 10) / 10;
};
const mediana = (v) => pct(v, 0.5);
const guardar = (lista, v, max = 120) => { lista.push(v); if (lista.length > max) lista.shift(); };
const SEM_IMAGEM_MS = 4000; // ligou e nenhum quadro apareceu: o turbo não serve aqui, volta ao normal

// H.264 nos perfis High, Main e Baseline (nível 5.1: até 1080p acima de 60 qps). Quem joga diz quais
// decodifica; quem compartilha escolhe o primeiro que a placa dele codifica.
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];

export const temTurboEnvio = () => typeof MediaStreamTrackProcessor === 'function' && typeof VideoEncoder === 'function';
export const temTurboRecebe = () => typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';

const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const bandaDe = (h) => (h >= 1000 ? 10_000_000 : h >= 700 ? 6_000_000 : 3_500_000);

// ------------------------------------------------------------------ SPS sem espera para reordenar
// O decodificador da placa no Chrome (medido: RTX 3060 Ti, Windows) segurava 5 quadros — 83 ms — em
// todos os perfis, quando o SPS vinha sem VUI: um dos dois codificadores da placa no Chrome manda assim
// (qual deles o Chrome usa variou de uma execução para outra), e sem o "max_num_reorder_frames" o
// decodificador guarda quadros para o caso de virem fora de ordem (nunca vêm: tempo real, sem quadro B).
// Aqui o SPS da descrição (avcC) ganha uma VUI só com essa restrição (reordenar 0): 0,3 ms, a mesma
// imagem pixel a pixel. Devolve a descrição nova, ou null se o SPS for de um jeito que não sei
// reescrever (matriz de escala, VUI que já existe): aí quem resolve é o decodificador do processador.
class LerBits {
  constructor(b) { this.b = b; this.p = 0; }
  u(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.p >> 3];
      if (byte === undefined) throw new Error('sps curto');
      v = v * 2 + ((byte >> (7 - (this.p & 7))) & 1);
      this.p++;
    }
    return v;
  }
  ue() {
    let z = 0;
    while (this.u(1) === 0) if (++z > 31) throw new Error('sps: ue');
    return z ? 2 ** z - 1 + this.u(z) : 0;
  }
  se() { const k = this.ue(); return k % 2 ? (k + 1) / 2 : -k / 2; }
}
const PERFIS_CROMA = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];
function semEmulacao(nal) {
  const r = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0 && r.length >= 2 && r[r.length - 1] === 0 && r[r.length - 2] === 0) continue;
    r.push(nal[i]);
  }
  return Uint8Array.from(r);
}
function comEmulacao(rbsp) {
  const r = [];
  let zeros = 0;
  for (const b of rbsp) {
    if (zeros >= 2 && b <= 3) { r.push(3); zeros = 0; }
    r.push(b);
    zeros = b === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(r);
}
function spsSemReordenar(nal) {
  const rbsp = semEmulacao(nal);
  const L = new LerBits(rbsp);
  L.u(8); // cabeçalho da NAL
  const perfil = L.u(8);
  L.u(16); // restrições e nível
  L.ue(); // id
  if (PERFIS_CROMA.includes(perfil)) {
    if (L.ue() === 3) L.u(1);
    L.ue();
    L.ue();
    L.u(1);
    if (L.u(1)) return null; // matriz de escala
  }
  L.ue(); // log2_max_frame_num
  const poc = L.ue();
  if (poc === 0) L.ue();
  else if (poc === 1) {
    L.u(1);
    L.se();
    L.se();
    const n = L.ue();
    for (let i = 0; i < n; i++) L.se();
  }
  const refs = L.ue();
  L.u(1);
  L.ue();
  L.ue();
  if (!L.u(1)) L.u(1);
  L.u(1);
  if (L.u(1)) { L.ue(); L.ue(); L.ue(); L.ue(); }
  const ate = L.p; // aqui vem vui_parameters_present_flag
  if (L.u(1)) return null; // já tem VUI
  const bits = [];
  for (let i = 0; i < ate; i++) bits.push((rbsp[i >> 3] >> (7 - (i & 7))) & 1);
  const u = (n, v) => { for (let i = n - 1; i >= 0; i--) bits.push(Math.floor(v / 2 ** i) % 2); };
  const ue = (v) => { const x = v + 1; const n = Math.floor(Math.log2(x)) + 1; u(n - 1, 0); u(n, x); };
  u(1, 1); // vui_parameters_present_flag
  u(5, 0); // aspecto, overscan, sinal de vídeo, croma, tempo: nada
  u(3, 0); // hrd nal, hrd vcl, pic_struct
  u(1, 1); // bitstream_restriction_flag
  u(1, 1); // vetores de movimento passando da borda
  ue(2); // max_bytes_per_pic_denom (o padrão)
  ue(1); // max_bits_per_mb_denom (o padrão)
  ue(16); // log2 do vetor máximo, horizontal e vertical (o padrão)
  ue(16);
  ue(0); // max_num_reorder_frames: nenhum
  ue(Math.max(1, refs)); // max_dec_frame_buffering: só os de referência
  bits.push(1); // rbsp_trailing_bits
  while (bits.length % 8) bits.push(0);
  const novo = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) if (bits[i]) novo[i >> 3] |= 0x80 >> (i & 7);
  return comEmulacao(novo);
}
export function descricaoSemReordenar(desc) {
  try {
    const d = desc instanceof Uint8Array ? desc : new Uint8Array(desc);
    if (d[0] !== 1) return null;
    const nSps = d[5] & 0x1f;
    if (!nSps) return null;
    const partes = [d.subarray(0, 6)];
    let o = 6;
    for (let i = 0; i < nSps; i++) {
      const len = (d[o] << 8) | d[o + 1];
      const nal = d.subarray(o + 2, o + 2 + len);
      if (nal.length !== len) return null;
      const novo = spsSemReordenar(nal);
      if (!novo) return null;
      partes.push(Uint8Array.of(novo.length >> 8, novo.length & 0xff), novo);
      o += 2 + len;
    }
    partes.push(d.subarray(o)); // PPS e o resto, como vieram
    const r = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
    let k = 0;
    for (const p of partes) { r.set(p, k); k += p.length; }
    return r;
  } catch {
    return null;
  }
}

// ================================================================== quem compartilha
export class TurboEnvio {
  // tela(key) -> { stream, controle } da minha tela (ou null); onMudou(id, key, ligado)
  constructor({ tela, onMudou }) {
    this.tela = tela;
    this.onMudou = onMudou;
    this.sessoes = new Map(); // id de quem joga -> sessão
  }

  // quem joga abriu o canal "turbo" comigo
  receber(id, canal) {
    canal.binaryType = 'arraybuffer';
    canal.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.ligar) this.ligar(id, canal, m);
      else if (m.chave) { const s = this.sessoes.get(id); if (s) s.chave = true; }
      // t: a hora daqui, para quem joga acertar a diferença entre os relógios
      else if (m.ping != null) { try { canal.send(JSON.stringify({ pong: m.ping, t: performance.now() })); } catch { /* fechou */ } }
      else if (m.desligar) this.desligar(id);
    };
    canal.onclose = () => this.desligar(id, canal);
  }

  async ligar(id, canal, { ligar: key, codecs, altura, versao }) {
    this.desligar(id);
    const t = typeof key === 'string' ? this.tela(key) : null;
    const responder = (m) => { try { canal.send(JSON.stringify(m)); } catch { /* canal fechou */ } };
    if (!t?.controle) return responder({ erro: 'sem-controle' });
    if (!temTurboEnvio()) return responder({ erro: 'navegador' });
    const original = t.stream?.getVideoTracks()[0];
    if (!original || original.readyState !== 'live') return responder({ erro: 'sem-tela' });
    // a tela saiu do ar (a cópia da trilha não acaba sozinha com ela)
    original.addEventListener('ended', () => this.desligar(id), { once: true });
    const s = { id, key, canal, chave: true, quadro: 0, enc: null, cfg: null, config: null, banda: 0, trilha: original.clone(), parar: false, pulados: 0, enviados: 0,
      cfgEnviada: null, ajuste: { desde: performance.now(), pulos: 0, esperas: 0, n: 0, folga: 0, mudou: 0 },
      totalBytes: 0, leitura: null, taxa: null, taxaEm: 0, // a fila de envio (medirFila); taxa em bytes por ms
      tempos: new Map(), conta: { enviados: 0, bytes: 0, pulados: 0, fila: 0, cod: [], espera: [], ultimo: performance.now() } };
    this.sessoes.set(id, s);
    // quem joga com a versão 2 lê o cabeçalho com a hora da captura (a antiga leria como imagem)
    s.v2 = Number(versao) >= 2;
    s.altMax = Math.min(1080, Number(altura) || 1080);
    s.aceitos = (Array.isArray(codecs) ? codecs : []).filter((c) => CODECS.includes(c));
    this.rodar(s).catch((err) => {
      console.warn('[turbo] envio', err);
      responder({ erro: 'codificador' });
      this.desligar(id);
    });
  }

  // escolhe o codec e (re)configura o codificador para o tamanho do quadro
  async configurar(s, w, h) {
    const k = Math.min(1, s.altMax / h);
    const cw = par(w * k);
    const ch = par(h * k);
    if (s.enc && s.cfg?.w === cw && s.cfg?.h === ch) return;
    let escolhido = null;
    // taxa constante primeiro (quadros do mesmo tamanho, quadro-chave pequeno: ver o cabeçalho)
    for (const codec of s.aceitos.length ? s.aceitos : CODECS) {
      for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
        for (const bitrateMode of ['constant', undefined]) {
          const config = { codec, width: cw, height: ch, bitrate: bandaDe(ch), framerate: 60, latencyMode: 'realtime', hardwareAcceleration, avc: { format: 'avc' } };
          if (bitrateMode) config.bitrateMode = bitrateMode;
          const r = await VideoEncoder.isConfigSupported(config).catch(() => null);
          if (r?.supported) { escolhido = config; break; }
        }
        if (escolhido) break;
      }
      if (escolhido) break;
    }
    if (!escolhido) throw new Error('nenhum H.264 em comum');
    if (!s.enc || s.enc.state === 'closed') {
      s.enc = new VideoEncoder({
        output: (chunk, meta) => this.enviarQuadro(s, chunk, meta),
        error: (err) => { console.warn('[turbo] codificador', err); s.parar = true; },
      });
    }
    s.enc.configure(escolhido);
    s.config = escolhido;
    s.banda = escolhido.bitrate;
    s.cfg = { codec: escolhido.codec, w: cw, h: ch, modo: escolhido.bitrateMode || 'variable' };
    s.chave = true; // a descrição nova sai junto com o próximo quadro-chave (enviarQuadro)
  }

  // Quanto um quadro novo esperaria na fila de envio do canal antes de começar a sair (ms): o que está
  // nela ÷ a velocidade com que ela esvazia. A velocidade só é medida entre duas leituras com a fila
  // ocupada nas duas (aí é a do caminho: o Wi-Fi, o controle de congestionamento do canal). Sem medida
  // (a fila esvazia entre um quadro e outro: o caminho folga) ou com a medida velha (meio segundo sem
  // fila), conta com o caminho a 3 vezes a banda: um quadro que acabou de entrar não é fila.
  medirFila(s, agora) {
    const fila = s.canal.bufferedAmount;
    const saiu = s.totalBytes - fila;
    const u = s.leitura;
    if (!u || agora - u.t >= 4) {
      if (u && u.fila > 0 && fila > 0) {
        const taxa = (saiu - u.saiu) / (agora - u.t);
        s.taxa = s.taxa == null ? taxa : s.taxa * 0.7 + taxa * 0.3;
        s.taxaEm = agora;
      }
      s.leitura = { t: agora, saiu, fila };
    }
    if (s.taxa != null && agora - s.taxaEm > 500) s.taxa = null;
    if (!fila) return 0;
    const taxa = s.taxa ?? ((s.banda || 6_000_000) / 8000) * 3;
    return fila / Math.max(1, taxa);
  }

  // A cada CONTROLE_MS: com 2 quadros pulados ou a espera média acima de metade do limite, a banda vai
  // para 90% do caminho medido (sem medida, 85% da atual), até BANDA_MIN da do tamanho; meio segundo sem
  // aperto, sobe 10%, até a do tamanho. Trocar só a banda não gera quadro-chave nem descrição nova
  // (medido na NVIDIA e no OpenH264); no máximo uma troca a cada CONTROLE_MS.
  ajustarBanda(s, agora, espera) {
    const a = s.ajuste;
    a.esperas += espera;
    a.n++;
    if (agora - a.desde < CONTROLE_MS) return;
    const apertou = a.pulos >= 2 || a.esperas / a.n > FILA_MS / 2;
    Object.assign(a, { pulos: 0, esperas: 0, n: 0, desde: agora });
    if (!s.enc || s.enc.state !== 'configured' || !s.config) return;
    const max = bandaDe(s.cfg.h);
    let nova = s.banda;
    if (apertou) {
      a.folga = 0;
      const alvo = s.taxa != null ? s.taxa * 8000 * 0.9 : s.banda * 0.85;
      nova = Math.max(max * BANDA_MIN, Math.min(s.banda, alvo));
    } else if ((a.folga += CONTROLE_MS) >= 500) {
      a.folga = 0;
      nova = Math.min(max, s.banda * 1.1);
    }
    if (Math.abs(nova - s.banda) < s.banda * 0.05) return;
    try {
      s.config = { ...s.config, bitrate: Math.round(nova) };
      s.enc.configure(s.config);
      s.banda = s.config.bitrate;
      a.mudou++;
    } catch (err) {
      console.warn('[turbo] banda', err);
    }
  }

  async rodar(s) {
    const leitor = new MediaStreamTrackProcessor({ track: s.trilha, maxBufferSize: 1 }).readable.getReader();
    s.leitor = leitor;
    this.onMudou?.(s.id, s.key, true);
    while (!s.parar) {
      const { value: frame, done } = await leitor.read();
      if (done || s.parar) { frame?.close(); break; }
      try {
        const agora = performance.now();
        const espera = this.medirFila(s, agora);
        guardar(s.conta.espera, espera);
        this.ajustarBanda(s, agora, espera);
        // ia esperar demais na fila, ou o codificador está atrasado: este quadro fica de fora (o
        // próximo é mais novo). Mandar assim mesmo só atrasaria este e todos os de depois.
        const filaCheia = espera > FILA_MS || s.canal.bufferedAmount > FILA_TETO;
        if (s.canal.readyState !== 'open' || filaCheia || (s.enc && s.enc.encodeQueueSize > 1)) {
          s.pulados++;
          s.conta.pulados++;
          if (filaCheia) {
            s.conta.fila++;
            s.ajuste.pulos++;
          }
          continue;
        }
        await this.configurar(s, frame.displayWidth, frame.displayHeight);
        const chave = s.chave;
        s.chave = false;
        if (s.tempos.size > 60) s.tempos.clear();
        s.tempos.set(frame.timestamp, agora);
        s.enc.encode(frame, { keyFrame: chave });
      } finally {
        frame.close();
      }
    }
  }

  enviarQuadro(s, chunk, meta) {
    if (s.parar || s.canal.readyState !== 'open') return;
    // configuração nova (começo ou tamanho trocado): a descrição vai antes do quadro — canal ordenado.
    // A mesma de antes não vai de novo (quem joga reconfiguraria e esperaria um quadro-chave à toa).
    const dc = meta?.decoderConfig;
    if (dc) {
      const v = dc.description;
      const d = !v ? null : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      const cfg = { codec: dc.codec || s.cfg.codec, w: s.cfg.w, h: s.cfg.h, description: d ? btoa(String.fromCharCode(...d)) : null };
      const ant = s.cfgEnviada;
      const igual = ant && ant.codec === cfg.codec && ant.w === cfg.w && ant.h === cfg.h && (!cfg.description || cfg.description === ant.description);
      if (!igual) {
        s.cfgEnviada = cfg;
        try {
          const txt = JSON.stringify({ cfg });
          s.canal.send(txt);
          s.totalBytes += txt.length;
        } catch { /* canal fechou */ }
      }
    }
    const dados = new Uint8Array(chunk.byteLength);
    chunk.copyTo(dados);
    const t0 = s.tempos.get(chunk.timestamp);
    s.tempos.delete(chunk.timestamp);
    const cod = t0 != null ? performance.now() - t0 : 0;
    guardar(s.conta.cod, cod);
    const id = (s.quadro = (s.quadro + 1) >>> 0);
    const total = Math.ceil(dados.length / PEDACO) || 1;
    const cab = s.v2 ? CAB2 : CAB;
    try {
      for (let i = 0; i < total; i++) {
        const parte = dados.subarray(i * PEDACO, (i + 1) * PEDACO);
        const msg = new Uint8Array(cab + parte.length);
        const v = new DataView(msg.buffer);
        v.setUint32(0, id);
        v.setUint16(4, i);
        v.setUint16(6, total);
        v.setUint8(8, chunk.type === 'key' ? 1 : 0);
        v.setUint16(10, Math.min(65535, Math.round(cod * 10)));
        v.setFloat64(12, chunk.timestamp);
        if (s.v2) {
          v.setUint8(9, VERSAO);
          v.setFloat64(20, t0 ?? -1); // quando o quadro saiu da captura, no relógio daqui
        }
        msg.set(parte, cab);
        s.canal.send(msg);
        s.totalBytes += msg.length;
      }
      s.enviados++;
      s.conta.enviados++;
      s.conta.bytes += dados.length + total * cab;
    } catch {
      s.chave = true; // a mensagem não coube na fila: o próximo quadro recomeça do zero
    }
  }

  desligar(id, canal = null) {
    const s = this.sessoes.get(id);
    if (!s || (canal && s.canal !== canal)) return;
    this.sessoes.delete(id);
    s.parar = true;
    s.leitor?.cancel().catch(() => {});
    s.trilha.stop();
    try { if (s.enc && s.enc.state !== 'closed') s.enc.close(); } catch { /* já fechado */ }
    this.onMudou?.(id, s.key, false);
  }

  // para o relatório de quem compartilha (no lugar do vídeo da conexão, parado): quadros e kbps
  // mandados por segundo, quadros pulados (fila cheia) e o tempo de codificação, desde a última leitura
  stats(id, key) {
    const s = this.sessoes.get(id);
    if (!s || s.key !== key) return null;
    const agora = performance.now();
    const seg = Math.max(0.001, (agora - s.conta.ultimo) / 1000);
    const r = {
      qps: Math.round((s.conta.enviados / seg) * 10) / 10,
      kbps: Math.round((s.conta.bytes * 8) / seg / 1000),
      pulados: s.conta.pulados,
      puladosFila: s.conta.fila, // destes, pela fila de envio cheia
      codMs: mediana(s.conta.cod),
      largura: s.cfg?.w ?? null,
      altura: s.cfg?.h ?? null,
      codec: s.cfg?.codec ?? null,
      taxa: s.cfg?.modo ?? null, // 'constant' ou 'variable'
      bandaKbps: s.banda ? Math.round(s.banda / 1000) : null, // a do codificador agora (ajustarBanda)
      trocasDeBanda: s.ajuste.mudou,
      fila: s.canal.bufferedAmount,
      esperaMs: mediana(s.conta.espera), // o que um quadro novo esperaria na fila (medirFila)
      esperaP90: pct(s.conta.espera, 0.9),
      caminhoKbps: s.taxa != null ? Math.round(s.taxa * 8) : null, // a velocidade medida da fila esvaziando
      versao: s.v2 ? VERSAO : 1,
    };
    s.ajuste.mudou = 0;
    Object.assign(s.conta, { enviados: 0, bytes: 0, pulados: 0, fila: 0, cod: [], espera: [], ultimo: agora });
    return r;
  }

  // a tela saiu do ar: quem jogava nela volta ao vídeo normal
  telaSaiu(key) {
    for (const [id, s] of this.sessoes) if (s.key === key) this.desligar(id);
  }
}

// ================================================================== quem joga
export class TurboRecebe {
  // abrir(idDoDono) -> canal "turbo" (rtc.abrirTurbo); onFalhou(motivo): volta ao vídeo normal;
  // onEvento(texto, dados): para o relatório
  constructor({ abrir, onFalhou, onEvento }) {
    this.abrir = abrir;
    this.onFalhou = onFalhou;
    this.onEvento = onEvento;
    this.s = null;
  }

  get ligado() { return !!this.s; }

  async ligar(key, video, altura = 1080) {
    this.desligar();
    if (!temTurboRecebe()) return this.onFalhou?.('navegador');
    const dono = String(key).split('~')[0];
    const canal = this.abrir(dono);
    if (!canal) return this.onFalhou?.('conexao');
    canal.binaryType = 'arraybuffer';
    const tela = document.createElement('canvas');
    tela.className = 'turbo-tela';
    tela.hidden = true;
    video.after(tela);
    const s = {
      key, video, canal, tela, ctx: tela.getContext('2d', { alpha: false, desynchronized: true }),
      dec: null, montando: null, ultimoId: 0, esperaChave: true, pedidoEm: 0, desenhou: 0, inicio: performance.now(),
      conta: { desenhados: 0, perdidos: 0, pedidos: 0, decMs: [], montagem: [], cod: [], ponta: [], viagem: [], bytes: 0, ultimo: performance.now() }, pendentes: new Map(),
      rtt: [], pingEm: 0,
      relogios: [], // { rtt, dif }: dos pongs com a hora de lá (versão 2)
      dif: null, // relógio de quem compartilha − o meu, do pong de menor ida e volta
      // o decodificador segurando quadros (segurando): 0 como veio, 1 SPS reescrito, 2 processador, 3 nada a fazer
      ajusteDec: 0,
    };
    this.s = s;
    const codecs = [];
    for (const codec of CODECS) {
      const r = await VideoDecoder.isConfigSupported({ codec, optimizeForLatency: true }).catch(() => null);
      if (r?.supported) codecs.push(codec);
    }
    if (this.s !== s) return;
    if (!codecs.length) return this.falhou('navegador');
    const ligar = () => canal.send(JSON.stringify({ ligar: key, codecs, altura, versao: VERSAO }));
    if (canal.readyState === 'open') ligar();
    else canal.addEventListener('open', ligar, { once: true });
    canal.onmessage = (e) => (typeof e.data === 'string' ? this.texto(s, e.data) : this.pedaco(s, e.data));
    canal.onclose = () => { if (this.s === s) this.falhou('conexao'); };
    s.vigia = setInterval(() => this.vigiar(s), 250);
    s.posicao = () => this.posicionar(s);
    addEventListener('resize', s.posicao);
    this.posicionar(s);
  }

  texto(s, txt) {
    let m;
    try {
      m = JSON.parse(txt);
    } catch {
      return;
    }
    if (m.erro) return this.falhou(m.erro);
    if (m.pong != null) {
      const volta = performance.now();
      const rtt = volta - m.pong;
      guardar(s.rtt, rtt, 15);
      // A hora de lá corresponde ao meio da ida e volta aqui. O pong que menos demorou é o que não
      // esperou atrás de imagem na fila: a diferença dele é a mais certa (erro de no máximo rtt/2).
      if (typeof m.t === 'number') {
        guardar(s.relogios, { rtt, dif: m.t - (m.pong + volta) / 2 }, 20);
        s.dif = s.relogios.reduce((a, b) => (b.rtt < a.rtt ? b : a)).dif;
      }
      return;
    }
    if (!m.cfg) return;
    // a mesma configuração que já está no decodificador: nada muda (reconfigurar faria esperar um quadro-chave)
    const c = s.cfgAtual;
    if (c && s.dec?.state === 'configured' && c.codec === m.cfg.codec && c.w === m.cfg.w && c.h === m.cfg.h && c.description === m.cfg.description) return;
    s.cfgAtual = m.cfg;
    this.configurarDec(s);
  }

  // (Re)cria o decodificador com a última configuração de lá. Depois de um erro ele se fecha sozinho, e
  // a configuração só viria de novo com outro tamanho de imagem: um novo na hora, com a mesma, e o
  // quadro-chave pedido já traz a imagem de volta. Erro atrás de erro sem desenhar nada: vídeo normal.
  configurarDec(s) {
    const cfg = s.cfgAtual;
    if (!cfg) return;
    try {
      if (!s.dec || s.dec.state === 'closed') {
        s.dec = new VideoDecoder({
          output: (frame) => this.desenhar(s, frame),
          error: (err) => {
            console.warn('[turbo] decodificador', err);
            if (this.s !== s) return;
            s.dec = null;
            s.esperaChave = true;
            s.errosDec = (s.errosDec || 0) + 1;
            if (s.errosDec > 5) return this.falhou('decodificador');
            this.configurarDec(s);
            this.pedirChave(s, true);
          },
        });
      }
      const config = { codec: cfg.codec, optimizeForLatency: true, hardwareAcceleration: s.ajusteDec === 2 ? 'prefer-software' : 'prefer-hardware' };
      if (cfg.description) {
        const d = Uint8Array.from(atob(cfg.description), (c) => c.charCodeAt(0));
        config.description = (s.ajusteDec === 1 && descricaoSemReordenar(d)) || d;
      }
      s.dec.configure(config);
      s.esperaChave = true;
      s.saiuDoDec = 0; // quadros que saíram deste decodificador assim configurado (ver segurando)
      s.seguros = 0;
    } catch (err) {
      console.warn('[turbo] configurar', err);
      this.falhou('decodificador');
    }
  }

  // O decodificador está segurando quadros: depois de soltar o primeiro, continua com SEGURANDO ou mais
  // dentro por SEGURANDO_QUADROS quadros seguidos (o da placa no Chrome segurava 5 — 83 ms — com o SPS
  // sem VUI de um dos codificadores da NVIDIA; ver descricaoSemReordenar).
  // Um passo: o SPS reescrito, na placa ainda (medido: 0,3 ms e a mesma imagem); se não der ou não
  // adiantar, o decodificador do processador (~2 ms em 720p). O iPhone solta na hora: lá nada muda.
  async segurando(s) {
    if (s.trocandoDec || s.ajusteDec >= 2 || !s.cfgAtual) return;
    s.trocandoDec = true;
    try {
      const cfg = s.cfgAtual;
      const d = cfg.description ? Uint8Array.from(atob(cfg.description), (c) => c.charCodeAt(0)) : null;
      let passo = s.ajusteDec === 0 && d && descricaoSemReordenar(d) ? 1 : 2;
      if (passo === 2) {
        const r = await VideoDecoder.isConfigSupported({ codec: cfg.codec, ...(d ? { description: d } : {}), optimizeForLatency: true, hardwareAcceleration: 'prefer-software' }).catch(() => null);
        if (this.s !== s) return;
        if (!r?.supported) passo = 3;
      }
      const presos = s.pendentes.size;
      s.ajusteDec = passo;
      this.onEvento?.(passo === 1 ? 'modo turbo: o decodificador segurava quadros, SPS sem espera' : passo === 2 ? 'modo turbo: o decodificador segurava quadros, decodificando no processador' : 'modo turbo: o decodificador segura quadros e não há outro', { presos });
      if (passo === 3) return;
      try { if (s.dec && s.dec.state !== 'closed') s.dec.close(); } catch { /* já fechado */ }
      s.dec = null;
      s.pendentes.clear();
      this.configurarDec(s);
      this.pedirChave(s, true);
    } finally {
      s.trocandoDec = false;
    }
  }

  // um pedaço de quadro: junta; quadro inteiro vai direto para o decodificador
  pedaco(s, buf) {
    if (buf.byteLength < CAB) return;
    s.conta.bytes += buf.byteLength;
    const v = new DataView(buf);
    // versão 2: o cabeçalho traz a hora em que o quadro saiu da captura lá (quem compartilha antigo: 0)
    const v2 = v.getUint8(9) === VERSAO;
    const cab = v2 ? CAB2 : CAB;
    if (buf.byteLength < cab) return;
    const id = v.getUint32(0);
    const i = v.getUint16(4);
    const total = v.getUint16(6);
    let q = s.montando;
    if (!q || q.id !== id) {
      // começou outro quadro com o anterior incompleto (pedaço que perdeu a vez): ele se perdeu
      if (q) this.perdeu(s);
      if (id <= s.ultimoId && s.ultimoId - id < 1e6) return; // pedaço velho
      const lido = v2 ? v.getFloat64(20) : -1;
      q = s.montando = { id, total, chegaram: 0, partes: new Array(total), chave: v.getUint8(8) === 1, ts: v.getFloat64(12), t0: performance.now(), cod: v.getUint16(10) / 10, lido: lido >= 0 ? lido : null };
    }
    if (q.partes[i]) return;
    q.partes[i] = new Uint8Array(buf, cab);
    q.chegaram++;
    if (q.chegaram < q.total) return;
    s.montando = null;
    const chegou = performance.now();
    guardar(s.conta.montagem, chegou - q.t0);
    guardar(s.conta.cod, q.cod);
    // da saída do codificador lá até o último pedaço aqui: a fila de envio + a rede
    if (q.lido != null && s.dif != null) guardar(s.conta.viagem, chegou + s.dif - (q.lido + q.cod));
    // faltou um quadro inteiro no meio: os de depois não decodificam sem ele
    if (!q.chave && q.id !== s.ultimoId + 1) this.perdeu(s);
    s.ultimoId = q.id;
    if (q.chave) s.esperaChave = false;
    // esperando um quadro-chave e chegou outro: pede (sem esperar o vigia)
    else if (s.esperaChave) this.pedirChave(s);
    if (s.esperaChave || !s.dec || s.dec.state !== 'configured') return;
    let tam = 0;
    for (const p of q.partes) tam += p.length;
    const dados = new Uint8Array(tam);
    let o = 0;
    for (const p of q.partes) { dados.set(p, o); o += p.length; }
    // O decodificador já soltou quadros e continua com SEGURANDO ou mais dentro, quadro após quadro:
    // está guardando (segurando). Antes do primeiro sair não conta — ligar a placa demora um pouco.
    s.seguros = s.saiuDoDec > 0 && s.pendentes.size >= SEGURANDO ? (s.seguros || 0) + 1 : 0;
    if (s.seguros >= SEGURANDO_QUADROS) {
      s.seguros = 0;
      this.segurando(s);
    }
    try {
      s.pendentes.set(q.ts, { t: chegou, lido: q.lido });
      s.dec.decode(new EncodedVideoChunk({ type: q.chave ? 'key' : 'delta', timestamp: q.ts, data: dados }));
    } catch (err) {
      console.warn('[turbo] decodificar', err);
      this.perdeu(s);
    }
  }

  perdeu(s) {
    s.conta.perdidos++;
    s.montando = null;
    s.esperaChave = true;
    this.pedirChave(s);
  }

  pedirChave(s, ja = false) {
    const agora = performance.now();
    if (!ja && agora - s.pedidoEm < PEDIR_CHAVE_MS) return;
    s.pedidoEm = agora;
    s.conta.pedidos++;
    try { s.canal.send(JSON.stringify({ chave: true })); } catch { /* canal fechou */ }
  }

  desenhar(s, frame) {
    try {
      if (this.s !== s) return;
      const p = s.pendentes.get(frame.timestamp);
      if (p) {
        s.pendentes.delete(frame.timestamp);
        guardar(s.conta.decMs, performance.now() - p.t);
      }
      if (s.pendentes.size > 30) s.pendentes.clear();
      const w = frame.displayWidth;
      const h = frame.displayHeight;
      if (s.tela.width !== w || s.tela.height !== h) {
        s.tela.width = w;
        s.tela.height = h;
      }
      s.ctx.drawImage(frame, 0, 0, w, h);
      s.conta.desenhados++;
      s.saiuDoDec = (s.saiuDoDec || 0) + 1;
      s.errosDec = 0;
      s.desenhou = performance.now();
      // da captura lá até desenhado aqui (codificação, fila, rede, montagem, decodificação)
      if (p?.lido != null && s.dif != null) guardar(s.conta.ponta, s.desenhou + s.dif - p.lido);
      if (s.tela.hidden) {
        s.tela.hidden = false;
        this.posicionar(s);
      }
    } finally {
      frame.close();
    }
  }

  // o canvas fica exatamente onde o vídeo está (mesma caixa e mesmas margens: object-fit cuida do resto)
  posicionar(s) {
    const v = s.video;
    const cs = getComputedStyle(v);
    Object.assign(s.tela.style, {
      left: `${v.offsetLeft}px`, top: `${v.offsetTop}px`, width: `${v.offsetWidth}px`, height: `${v.offsetHeight}px`,
      padding: cs.padding, objectFit: cs.objectFit || 'contain',
    });
  }

  vigiar(s) {
    if (this.s !== s) return;
    const agora = performance.now();
    this.posicionar(s);
    // nada apareceu: este aparelho/PC não deu conta — vídeo normal de volta
    if (!s.desenhou && agora - s.inicio > SEM_IMAGEM_MS) return this.falhou('sem-imagem');
    // parado esperando um quadro-chave que não veio (o pedido se perdeu): pede de novo
    if (s.esperaChave && agora - s.pedidoEm > 500) this.pedirChave(s);
    if (agora - s.pingEm > PING_MS && s.canal.readyState === 'open') {
      s.pingEm = agora;
      try { s.canal.send(JSON.stringify({ ping: agora })); } catch { /* fechou */ }
    }
  }

  falhou(motivo) {
    const s = this.s;
    this.desligar();
    if (s) this.onFalhou?.(motivo);
  }

  desligar() {
    const s = this.s;
    if (!s) return;
    this.s = null;
    clearInterval(s.vigia);
    removeEventListener('resize', s.posicao);
    try { if (s.canal.readyState === 'open') s.canal.send(JSON.stringify({ desligar: true })); } catch { /* fechando */ }
    try { s.canal.close(); } catch { /* já fechado */ }
    try { if (s.dec && s.dec.state !== 'closed') s.dec.close(); } catch { /* já fechado */ }
    s.tela.remove();
  }

  // para o relatório e o selo: quadros desenhados por segundo, perdidos, pedidos de chave e o tempo
  // de decodificação (mediana) desde a última leitura
  stats() {
    const s = this.s;
    if (!s) return null;
    const agora = performance.now();
    const seg = Math.max(0.001, (agora - s.conta.ultimo) / 1000);
    const rtt = mediana(s.rtt);
    const r = {
      qps: Math.round((s.conta.desenhados / seg) * 10) / 10,
      perdidos: s.conta.perdidos,
      pedidosDeChave: s.conta.pedidos,
      kbps: Math.round((s.conta.bytes * 8) / seg / 1000),
      largura: s.tela.width || null,
      altura: s.tela.height || null,
      codMs: mediana(s.conta.cod), // lá, codificando
      montagemMs: mediana(s.conta.montagem), // do 1º ao último pedaço de cada quadro
      decMs: mediana(s.conta.decMs),
      rttMs: rtt, // ida e volta do canal turbo
      redeMs: rtt != null ? Math.round(rtt / 2) : null,
      // medidos quadro a quadro (quem compartilha com a versão 2), com os relógios acertados pelo ping
      pontaMs: mediana(s.conta.ponta), // da captura lá até desenhado aqui
      pontaP90: pct(s.conta.ponta, 0.9),
      viagemMs: mediana(s.conta.viagem), // fila de envio lá + rede
      viagemP90: pct(s.conta.viagem, 0.9),
      rttMinMs: s.relogios.length ? Math.round(Math.min(...s.relogios.map((x) => x.rtt)) * 10) / 10 : null,
      decAjuste: [null, 'sps', 'processador', 'sem-saida'][s.ajusteDec] ?? null, // ver segurando
      codec: s.dec?.state === 'configured' ? 'h264' : null,
    };
    Object.assign(s.conta, { desenhados: 0, perdidos: 0, pedidos: 0, bytes: 0, montagem: [], cod: [], ponta: [], viagem: [], ultimo: agora });
    return r;
  }
}
