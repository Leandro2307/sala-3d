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
// Mensagens de texto (JSON): quem joga → {ligar: key, codecs, altura}, {chave: true}, {desligar: true},
// {ping: t} (a cada segundo; volta {pong: t}: a ida e volta do próprio canal, para o atraso estimado);
// quem compartilha → {cfg: {codec, w, h, description}}, {erro}. O H.264 vai no formato "avc" (tamanho na
// frente de cada NAL) com a descrição (avcC) que o codificador entrega: é o que todo VideoDecoder aceita
// (o Safari inclusive), sem depender do Annex B. Binário: cabeçalho de CAB bytes + pedaço do quadro.
// Fila de envio cheia (bufferedAmount > FILA_MAX): o quadro nem é codificado — melhor pular um quadro
// do que mandar atrasado.

const PEDACO = 15000; // bytes de quadro por mensagem (abaixo do limite de 16 KB de qualquer navegador)
const CAB = 20; // id do quadro (u32), pedaço (u16), total (u16), chave (u8), 1 livre, ms codificando ×10 (u16), tempo em µs (f64)
const FILA_MAX = 96 * 1024; // ~70 ms de quadros a 10 Mbps
const TTL_MS = 90; // vida de cada pedaço no canal
const CHAVE_MS = 5000; // quadro-chave de segurança
const PEDIR_CHAVE_MS = 250; // intervalo mínimo entre pedidos de quadro-chave
const PING_MS = 1000;
const mediana = (v) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return Math.round(o[Math.floor(o.length / 2)] * 10) / 10;
};
const guardar = (lista, v, max = 120) => { lista.push(v); if (lista.length > max) lista.shift(); };
const SEM_IMAGEM_MS = 4000; // ligou e nenhum quadro apareceu: o turbo não serve aqui, volta ao normal

// H.264 nos perfis High, Main e Baseline (nível 5.1: até 1080p acima de 60 qps). Quem joga diz quais
// decodifica; quem compartilha escolhe o primeiro que a placa dele codifica.
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];

export const temTurboEnvio = () => typeof MediaStreamTrackProcessor === 'function' && typeof VideoEncoder === 'function';
export const temTurboRecebe = () => typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';

const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const bandaDe = (h) => (h >= 1000 ? 10_000_000 : h >= 700 ? 6_000_000 : 3_500_000);

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
      else if (m.ping != null) { try { canal.send(JSON.stringify({ pong: m.ping })); } catch { /* fechou */ } }
      else if (m.desligar) this.desligar(id);
    };
    canal.onclose = () => this.desligar(id, canal);
  }

  async ligar(id, canal, { ligar: key, codecs, altura }) {
    this.desligar(id);
    const t = typeof key === 'string' ? this.tela(key) : null;
    const responder = (m) => { try { canal.send(JSON.stringify(m)); } catch { /* canal fechou */ } };
    if (!t?.controle) return responder({ erro: 'sem-controle' });
    if (!temTurboEnvio()) return responder({ erro: 'navegador' });
    const original = t.stream?.getVideoTracks()[0];
    if (!original || original.readyState !== 'live') return responder({ erro: 'sem-tela' });
    // a tela saiu do ar (a cópia da trilha não acaba sozinha com ela)
    original.addEventListener('ended', () => this.desligar(id), { once: true });
    const s = { id, key, canal, chave: true, ultimaChave: 0, quadro: 0, enc: null, cfg: null, trilha: original.clone(), parar: false, pulados: 0, enviados: 0,
      tempos: new Map(), conta: { enviados: 0, bytes: 0, pulados: 0, cod: [], ultimo: performance.now() } };
    this.sessoes.set(id, s);
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
    for (const codec of s.aceitos.length ? s.aceitos : CODECS) {
      for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
        const config = { codec, width: cw, height: ch, bitrate: bandaDe(ch), framerate: 60, latencyMode: 'realtime', hardwareAcceleration, avc: { format: 'avc' } };
        const r = await VideoEncoder.isConfigSupported(config).catch(() => null);
        if (r?.supported) { escolhido = config; break; }
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
    s.cfg = { codec: escolhido.codec, w: cw, h: ch };
    s.chave = true; // a descrição nova sai junto com o próximo quadro-chave (enviarQuadro)
  }

  async rodar(s) {
    const leitor = new MediaStreamTrackProcessor({ track: s.trilha, maxBufferSize: 1 }).readable.getReader();
    s.leitor = leitor;
    this.onMudou?.(s.id, s.key, true);
    while (!s.parar) {
      const { value: frame, done } = await leitor.read();
      if (done || s.parar) { frame?.close(); break; }
      try {
        // fila cheia ou codificador atrasado: este quadro fica de fora (o próximo é mais novo)
        if (s.canal.readyState !== 'open' || s.canal.bufferedAmount > FILA_MAX || (s.enc && s.enc.encodeQueueSize > 1)) {
          s.pulados++;
          s.conta.pulados++;
          continue;
        }
        await this.configurar(s, frame.displayWidth, frame.displayHeight);
        const agora = performance.now();
        const chave = s.chave || agora - s.ultimaChave > CHAVE_MS;
        if (chave) { s.chave = false; s.ultimaChave = agora; }
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
    // configuração nova (começo ou tamanho trocado): a descrição vai antes do quadro — canal ordenado
    const dc = meta?.decoderConfig;
    if (dc) {
      const v = dc.description;
      const d = !v ? null : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      const cfg = { ...s.cfg, codec: dc.codec || s.cfg.codec, description: d ? btoa(String.fromCharCode(...d)) : null };
      try { s.canal.send(JSON.stringify({ cfg })); } catch { /* canal fechou */ }
    }
    const dados = new Uint8Array(chunk.byteLength);
    chunk.copyTo(dados);
    const t0 = s.tempos.get(chunk.timestamp);
    s.tempos.delete(chunk.timestamp);
    const cod = t0 != null ? performance.now() - t0 : 0;
    guardar(s.conta.cod, cod);
    const id = (s.quadro = (s.quadro + 1) >>> 0);
    const total = Math.ceil(dados.length / PEDACO) || 1;
    try {
      for (let i = 0; i < total; i++) {
        const parte = dados.subarray(i * PEDACO, (i + 1) * PEDACO);
        const msg = new Uint8Array(CAB + parte.length);
        const v = new DataView(msg.buffer);
        v.setUint32(0, id);
        v.setUint16(4, i);
        v.setUint16(6, total);
        v.setUint8(8, chunk.type === 'key' ? 1 : 0);
        v.setUint16(10, Math.min(65535, Math.round(cod * 10)));
        v.setFloat64(12, chunk.timestamp);
        msg.set(parte, CAB);
        s.canal.send(msg);
      }
      s.enviados++;
      s.conta.enviados++;
      s.conta.bytes += dados.length + total * CAB;
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
      codMs: mediana(s.conta.cod),
      largura: s.cfg?.w ?? null,
      altura: s.cfg?.h ?? null,
      codec: s.cfg?.codec ?? null,
      fila: s.canal.bufferedAmount,
    };
    Object.assign(s.conta, { enviados: 0, bytes: 0, pulados: 0, cod: [], ultimo: agora });
    return r;
  }

  // a tela saiu do ar: quem jogava nela volta ao vídeo normal
  telaSaiu(key) {
    for (const [id, s] of this.sessoes) if (s.key === key) this.desligar(id);
  }
}

// ================================================================== quem joga
export class TurboRecebe {
  // abrir(idDoDono) -> canal "turbo" (rtc.abrirTurbo); onFalhou(motivo): volta ao vídeo normal
  constructor({ abrir, onFalhou }) {
    this.abrir = abrir;
    this.onFalhou = onFalhou;
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
      conta: { desenhados: 0, perdidos: 0, pedidos: 0, decMs: [], montagem: [], cod: [], bytes: 0, ultimo: performance.now() }, pendentes: new Map(),
      rtt: [], pingEm: 0,
    };
    this.s = s;
    const codecs = [];
    for (const codec of CODECS) {
      const r = await VideoDecoder.isConfigSupported({ codec, optimizeForLatency: true }).catch(() => null);
      if (r?.supported) codecs.push(codec);
    }
    if (this.s !== s) return;
    if (!codecs.length) return this.falhou('navegador');
    const ligar = () => canal.send(JSON.stringify({ ligar: key, codecs, altura }));
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
    if (m.pong != null) return void guardar(s.rtt, performance.now() - m.pong, 15);
    if (!m.cfg) return;
    try {
      if (!s.dec || s.dec.state === 'closed') {
        s.dec = new VideoDecoder({
          output: (frame) => this.desenhar(s, frame),
          error: (err) => { console.warn('[turbo] decodificador', err); s.dec = null; s.esperaChave = true; this.pedirChave(s, true); },
        });
      }
      const config = { codec: m.cfg.codec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' };
      if (m.cfg.description) config.description = Uint8Array.from(atob(m.cfg.description), (c) => c.charCodeAt(0));
      s.dec.configure(config);
      s.esperaChave = true;
    } catch (err) {
      console.warn('[turbo] configurar', err);
      this.falhou('decodificador');
    }
  }

  // um pedaço de quadro: junta; quadro inteiro vai direto para o decodificador
  pedaco(s, buf) {
    if (buf.byteLength < CAB) return;
    s.conta.bytes += buf.byteLength;
    const v = new DataView(buf);
    const id = v.getUint32(0);
    const i = v.getUint16(4);
    const total = v.getUint16(6);
    let q = s.montando;
    if (!q || q.id !== id) {
      // começou outro quadro com o anterior incompleto (pedaço que perdeu a vez): ele se perdeu
      if (q) this.perdeu(s);
      if (id <= s.ultimoId && s.ultimoId - id < 1e6) return; // pedaço velho
      q = s.montando = { id, total, chegaram: 0, partes: new Array(total), chave: v.getUint8(8) === 1, ts: v.getFloat64(12), t0: performance.now(), cod: v.getUint16(10) / 10 };
    }
    if (q.partes[i]) return;
    q.partes[i] = new Uint8Array(buf, CAB);
    q.chegaram++;
    if (q.chegaram < q.total) return;
    s.montando = null;
    guardar(s.conta.montagem, performance.now() - q.t0);
    guardar(s.conta.cod, q.cod);
    // faltou um quadro inteiro no meio: os de depois não decodificam sem ele
    if (!q.chave && q.id !== s.ultimoId + 1) this.perdeu(s);
    s.ultimoId = q.id;
    if (q.chave) s.esperaChave = false;
    if (s.esperaChave || !s.dec || s.dec.state !== 'configured') return;
    let tam = 0;
    for (const p of q.partes) tam += p.length;
    const dados = new Uint8Array(tam);
    let o = 0;
    for (const p of q.partes) { dados.set(p, o); o += p.length; }
    try {
      s.pendentes.set(q.ts, performance.now());
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
      const t0 = s.pendentes.get(frame.timestamp);
      if (t0 != null) {
        s.pendentes.delete(frame.timestamp);
        s.conta.decMs.push(performance.now() - t0);
        if (s.conta.decMs.length > 120) s.conta.decMs.shift();
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
      s.desenhou = performance.now();
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
      codec: s.dec?.state === 'configured' ? 'h264' : null,
    };
    Object.assign(s.conta, { desenhados: 0, perdidos: 0, pedidos: 0, bytes: 0, montagem: [], cod: [], ultimo: agora });
    return r;
  }
}
