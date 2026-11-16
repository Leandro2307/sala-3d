// PS5 direto (sem a janela do chiaki-ng). O ajudante do Windows (1.16+) abre a ponte
// extensao/nativo/ps5/sala3d-ps5.exe, que fala com o PS5 pela biblioteca do chiaki-ng e entrega à sala,
// por um WebSocket em 127.0.0.1, o vídeo H.264 do jeito que o PS5 mandou e o som em Opus.
//
// Antes: PS5 → codifica → chiaki-ng decodifica → janela → a sala captura → codifica de novo → quem joga.
// Agora: PS5 → codifica → ponte → a sala repassa os mesmos quadros (turbo) → quem joga decodifica.
// Some uma decodificação, a captura da janela e uma codificação, e a imagem que chega é a que o PS5 fez.
//
// Esta página (de quem compartilha) também decodifica uma cópia para pôr na tela da sala (quem só
// assiste recebe pelo WebRTC, como qualquer tela) e para ouvir o som aqui. O controle de quem joga vai
// direto para a ponte e chega no PS5 como o controle dele (sem o controle virtual de Xbox/ViGEmBus).
//
// Mensagens da ponte: ver o cabeçalho de ponte.c. Binário: [tipo, marcas, perdidos u16, seq u32] + dados.
import { icon } from './icons.js';
import { descricaoSemReordenar } from './turbo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAB = 8;
const VIDEO = 1, SOM = 2, CABECALHO = 3;
const CHAVE_MS = 300; // intervalo mínimo entre pedidos de quadro-chave ao PS5
// A cópia daqui (a tela da sala) pede bem menos: o quadro-chave do PS5 é grande e vai para quem joga
// também. O PS5 não manda quadro-chave sozinho de tempos em tempos: sem pedir, a cópia ficaria parada.
const CHAVE_LOCAL_MS = 2000;
const PAD_SOLTA_MS = 1500; // sem notícia do controle de quem joga por tanto tempo: solta tudo
const OPCOES = 'sala3d-ps5'; // localStorage: { altura, qps, kbps, ultimo }
const PADRAO = { altura: 720, qps: 60, kbps: 6000, ultimo: null };
// as imagens que o Remote Play do PS5 aceita (a ponte escolhe o perfil mais perto)
const IMAGENS = [[720, 60], [720, 30], [1080, 60], [1080, 30]];

export const temPs5Nativo = () => typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';

// ------------------------------------------------------------------ H.264 (Annex B -> avc)
// As NALs de um pedaço Annex B (00 00 01 / 00 00 00 01), sem os zeros do fim (preenchimento)
export function nalsDe(buf) {
  const r = [];
  let i = 0, ini = -1;
  const n = buf.length;
  while (i + 2 < n) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      if (ini >= 0) r.push(buf.subarray(ini, i));
      i += 3;
      ini = i;
    } else i++;
  }
  if (ini >= 0) r.push(buf.subarray(ini, n));
  return r.map((nal) => {
    let f = nal.length;
    while (f > 1 && nal[f - 1] === 0) f--;
    return nal.subarray(0, f);
  }).filter((nal) => nal.length > 0);
}

class Bits {
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

function rbspDe(nal) {
  const r = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0 && r.length >= 2 && r[r.length - 1] === 0 && r[r.length - 2] === 0) continue;
    r.push(nal[i]);
  }
  return Uint8Array.from(r);
}

// largura e altura do SPS (com o recorte)
export function tamanhoDoSps(nal) {
  const L = new Bits(rbspDe(nal));
  L.u(8);
  const perfil = L.u(8);
  L.u(16);
  L.ue();
  let croma = 1;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(perfil)) {
    croma = L.ue();
    if (croma === 3) L.u(1);
    L.ue();
    L.ue();
    L.u(1);
    if (L.u(1)) {
      for (let i = 0; i < (croma !== 3 ? 8 : 12); i++) {
        if (!L.u(1)) continue;
        let ultimo = 8, prox = 8;
        for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
          if (prox !== 0) prox = (ultimo + L.se() + 256) % 256;
          ultimo = prox === 0 ? ultimo : prox;
        }
      }
    }
  }
  L.ue();
  const poc = L.ue();
  if (poc === 0) L.ue();
  else if (poc === 1) {
    L.u(1);
    L.se();
    L.se();
    const n = L.ue();
    for (let i = 0; i < n; i++) L.se();
  }
  L.ue();
  L.u(1);
  const wMb = L.ue() + 1;
  const hMap = L.ue() + 1;
  const soQuadros = L.u(1);
  if (!soQuadros) L.u(1);
  L.u(1);
  let cl = 0, cr = 0, ct = 0, cb = 0;
  if (L.u(1)) { cl = L.ue(); cr = L.ue(); ct = L.ue(); cb = L.ue(); }
  const sx = croma === 1 || croma === 2 ? 2 : 1;
  const sy = (croma === 1 ? 2 : 1) * (2 - soQuadros);
  return { w: wMb * 16 - (cl + cr) * sx, h: (2 - soQuadros) * hMap * 16 - (ct + cb) * sy };
}

// a descrição (avcC) a partir do SPS e do PPS
export function avcC(sps, pps) {
  const d = new Uint8Array(11 + sps.length + pps.length);
  d.set([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff]);
  d.set(sps, 8);
  let o = 8 + sps.length;
  d.set([1, pps.length >> 8, pps.length & 0xff], o);
  d.set(pps, o + 3);
  return d;
}

const hex2 = (v) => v.toString(16).padStart(2, '0');
export const codecDoSps = (sps) => `avc1.${hex2(sps[1])}${hex2(sps[2])}${hex2(sps[3])}`;
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

// as NALs de imagem no formato avc (4 bytes de tamanho na frente de cada uma)
export function paraAvc(nals) {
  const total = nals.reduce((s, n) => s + 4 + n.length, 0);
  const r = new Uint8Array(total);
  const v = new DataView(r.buffer);
  let o = 0;
  for (const n of nals) {
    v.setUint32(o, n.length);
    r.set(n, o + 4);
    o += 4 + n.length;
  }
  return r;
}

// ------------------------------------------------------------------ a fonte (vídeo e som do PS5)
// Quem assina recebe { cfg }, { quadro, chave, ts, t0 } e { som, ts, hz, canais }. ts em µs.
export class Ps5Fonte {
  constructor({ pedirChave, onEvento }) {
    this.pedirChaveDaPonte = pedirChave;
    this.onEvento = onEvento;
    this.assinantes = new Set();
    this.cfg = null; // { codec, w, h, description (Uint8Array), b64 }
    this.sps = null;
    this.pps = null;
    this.somCfg = null; // { hz, canais }
    this.ultimaChave = 0;
    this.ultimaChaveLocal = 0;
    this.conta = { quadros: 0, chaves: 0, bytes: 0, perdidos: 0, recuperados: 0, erros: 0, desenhados: 0, decMs: [] };
    this.pendentes = new Map(); // ts -> hora (decodificação local)
    this.esperaChave = true;
    this.parada = false;
    this.montarSaida();
  }

  // a imagem e o som para a tela da sala: trilhas geradas (Chrome) ou um canvas
  montarSaida() {
    const trilhas = [];
    if (typeof MediaStreamTrackGenerator === 'function') {
      this.gerVideo = new MediaStreamTrackGenerator({ kind: 'video' });
      this.escritorVideo = this.gerVideo.writable.getWriter();
      trilhas.push(this.gerVideo);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1280;
      this.canvas.height = 720;
      this.ctx = this.canvas.getContext('2d');
      trilhas.push(...this.canvas.captureStream(60).getVideoTracks());
    }
    if (typeof MediaStreamTrackGenerator === 'function' && typeof AudioDecoder === 'function') {
      this.gerSom = new MediaStreamTrackGenerator({ kind: 'audio' });
      this.escritorSom = this.gerSom.writable.getWriter();
      trilhas.push(this.gerSom);
    }
    this.stream = new MediaStream(trilhas);
  }

  assinar(fn) {
    this.assinantes.add(fn);
    if (this.cfg) fn({ cfg: this.cfg });
    return () => this.assinantes.delete(fn);
  }

  avisar(m) {
    for (const fn of this.assinantes) {
      try { fn(m); } catch (err) { console.warn('[ps5] assinante', err); }
    }
  }

  pedirChave(local = false) {
    const agora = performance.now();
    if (local && agora - this.ultimaChaveLocal < CHAVE_LOCAL_MS) return;
    if (local) this.ultimaChaveLocal = agora;
    if (agora - this.ultimaChave < CHAVE_MS) return;
    this.ultimaChave = agora;
    this.pedirChaveDaPonte?.();
  }

  get temSom() { return !!this.somCfg; }

  // SPS/PPS novos: configuração nova (vai para quem assina e para o decodificador daqui)
  parametros(sps, pps) {
    if (sps) this.sps = sps;
    if (pps) this.pps = pps;
    if (!this.sps || !this.pps) return;
    // Sem VUI no SPS, o decodificador da placa do Chrome guarda quadros (até 83 ms, ver turbo.js): já vai
    // com a VUI que diz "nada fora de ordem" — a mesma imagem, pixel a pixel (null: o SPS já tem VUI)
    const original = avcC(this.sps, this.pps);
    const description = descricaoSemReordenar(original) || original;
    const b = b64(description);
    if (this.cfg?.b64 === b) return;
    let tam = { w: this.cfg?.w ?? 1280, h: this.cfg?.h ?? 720 };
    try { tam = tamanhoDoSps(this.sps); } catch (err) { console.warn('[ps5] sps', err); }
    this.cfg = { codec: codecDoSps(this.sps), w: tam.w, h: tam.h, description, b64: b };
    this.onEvento?.('ps5: configuração do vídeo', { codec: this.cfg.codec, w: tam.w, h: tam.h, spsReescrito: description !== original });
    this.configurarDec();
    this.avisar({ cfg: this.cfg });
  }

  cabecalho(buf) {
    let sps = null, pps = null;
    for (const n of nalsDe(buf)) {
      const t = n[0] & 0x1f;
      if (t === 7) sps = n.slice();
      else if (t === 8) pps = n.slice();
    }
    this.parametros(sps, pps);
  }

  quadro(buf, marcas, perdidos) {
    if (this.parada) return;
    const t0 = performance.now();
    const imagem = [];
    let sps = null, pps = null, chave = false;
    for (const n of nalsDe(buf)) {
      const t = n[0] & 0x1f;
      if (t === 7) sps = n.slice();
      else if (t === 8) pps = n.slice();
      else if (t === 9) continue; // delimitador: o avc não precisa
      else {
        if (t === 5) chave = true;
        imagem.push(n);
      }
    }
    if (sps || pps) this.parametros(sps, pps);
    if (!imagem.length || !this.cfg) return;
    const dados = paraAvc(imagem);
    const ts = Math.round(t0 * 1000);
    this.conta.quadros++;
    this.conta.bytes += dados.length;
    if (chave) this.conta.chaves++;
    if (perdidos) this.conta.perdidos += perdidos;
    if (marcas & 1) this.conta.recuperados++;
    this.avisar({ quadro: dados, chave, ts, t0 });
    this.decodificar(dados, chave, ts, t0);
  }

  // ---------------------------------------------------------------- a cópia para a tela da sala
  configurarDec() {
    const cfg = this.cfg;
    if (!cfg) return;
    try {
      if (!this.dec || this.dec.state === 'closed') {
        this.dec = new VideoDecoder({
          output: (frame) => this.saiu(frame),
          error: (err) => {
            console.warn('[ps5] decodificador', err);
            this.conta.erros++;
            this.dec = null;
            if (this.parada) return;
            this.configurarDec();
            this.pedirChave(true);
          },
        });
      }
      this.dec.configure({ codec: cfg.codec, description: cfg.description, optimizeForLatency: true });
      this.esperaChave = true;
    } catch (err) {
      console.warn('[ps5] configurar', err);
    }
  }

  decodificar(dados, chave, ts, t0) {
    if (!this.dec || this.dec.state !== 'configured') return;
    if (this.esperaChave && !chave) { this.pedirChave(true); return; }
    // decodificador atrasado (o PC engasgou): pula até o próximo quadro-chave
    if (this.dec.decodeQueueSize > 6) { this.esperaChave = true; this.pedirChave(true); return; }
    this.esperaChave = false;
    if (this.pendentes.size > 30) this.pendentes.clear();
    this.pendentes.set(ts, t0);
    try {
      this.dec.decode(new EncodedVideoChunk({ type: chave ? 'key' : 'delta', timestamp: ts, data: dados }));
    } catch (err) {
      console.warn('[ps5] decode', err);
      this.esperaChave = true;
      this.pedirChave(true);
    }
  }

  saiu(frame) {
    const t0 = this.pendentes.get(frame.timestamp);
    if (t0 != null) {
      this.pendentes.delete(frame.timestamp);
      const ms = performance.now() - t0;
      this.conta.decMs.push(ms);
      if (this.conta.decMs.length > 120) this.conta.decMs.shift();
    }
    if (this.parada) { frame.close(); return; }
    this.conta.desenhados++;
    if (this.escritorVideo) {
      // a trilha atrasada (ninguém puxando): este quadro fica de fora
      if (this.escritorVideo.desiredSize != null && this.escritorVideo.desiredSize <= 0) { frame.close(); return; }
      this.escritorVideo.write(frame).catch(() => {});
    } else {
      if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
      }
      this.ctx.drawImage(frame, 0, 0);
      frame.close();
    }
  }

  // ---------------------------------------------------------------- som
  somCabecalho({ hz, canais }) {
    this.somCfg = { hz: hz || 48000, canais: Math.min(2, canais || 2) };
    if (!this.escritorSom) return;
    try {
      if (this.decSom && this.decSom.state !== 'closed') this.decSom.close();
    } catch { /* já fechado */ }
    try {
      this.decSom = new AudioDecoder({
        output: (data) => {
          if (this.parada || !this.escritorSom) { data.close(); return; }
          this.escritorSom.write(data).catch(() => {});
        },
        error: (err) => { console.warn('[ps5] som', err); this.decSom = null; },
      });
      this.decSom.configure({ codec: 'opus', sampleRate: this.somCfg.hz, numberOfChannels: this.somCfg.canais });
    } catch (err) {
      console.warn('[ps5] som', err);
      this.decSom = null;
    }
  }

  som(buf) {
    if (this.parada || !this.somCfg) return;
    const ts = Math.round(performance.now() * 1000);
    const dados = buf.slice();
    this.avisar({ som: dados, ts, hz: this.somCfg.hz, canais: this.somCfg.canais });
    if (this.decSom?.state === 'configured' && this.decSom.decodeQueueSize < 10) {
      try { this.decSom.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data: dados })); } catch { /* pacote ruim */ }
    }
  }

  stats() {
    const c = this.conta;
    const o = [...c.decMs].sort((a, b) => a - b);
    const r = { quadros: c.quadros, chaves: c.chaves, kbps: null, perdidos: c.perdidos, recuperados: c.recuperados, erros: c.erros, desenhados: c.desenhados, decMs: o.length ? Math.round(o[o.length >> 1] * 10) / 10 : null, codec: this.cfg?.codec ?? null, largura: this.cfg?.w ?? null, altura: this.cfg?.h ?? null, som: !!this.somCfg };
    return r;
  }

  parar() {
    if (this.parada) return;
    this.parada = true;
    this.assinantes.clear();
    for (const d of [this.dec, this.decSom]) {
      try { if (d && d.state !== 'closed') d.close(); } catch { /* já fechado */ }
    }
    for (const w of [this.escritorVideo, this.escritorSom]) w?.close().catch(() => {});
    for (const t of this.stream.getTracks()) t.stop();
  }
}

// ------------------------------------------------------------------ a ponte + o painel
const CSS = `
#ps5-nativo .p5-card { width: min(640px, 100%); grid-template-columns: minmax(0, 1fr); gap: 14px; }
#ps5-nativo .p5-status { font-size: 13px; color: var(--muted); line-height: 1.5; }
#ps5-nativo .p5-status b { color: var(--text); }
#ps5-nativo .p5-lista { display: grid; gap: 8px; }
#ps5-nativo .p5-item { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.03); }
#ps5-nativo .p5-item small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
#ps5-nativo .p5-acoes { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
#ps5-nativo .p5-linha { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#ps5-nativo .p5-linha label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
#ps5-nativo .p5-linha input, #ps5-nativo .p5-linha select { min-width: 0; }
#ps5-nativo details { border-top: 1px solid var(--line); padding-top: 10px; }
#ps5-nativo summary { cursor: pointer; font-weight: 700; font-size: 14px; }
#ps5-nativo .p5-dica { font-size: 12.5px; color: var(--muted); line-height: 1.55; margin: 8px 0; }
#ps5-nativo .p5-vazio { font-size: 13px; color: var(--muted); }
#ps5-nativo .p5-fase { font-weight: 700; color: #38bdf8; }
`;

const FASES = { procurando: 'procurando o PS5 na rede…', acordando: 'acordando o PS5 (uns 20 s)…', conectando: 'conectando…', jogando: 'no ar', parado: '' };
const ERROS_REGISTRO = { conta: 'o ID da conta PSN não está certo (8 bytes em base64, como o chiaki-ng mostra)', pin: 'o PIN tem 8 números', ocupado: 'já tem um registro em andamento', falhou: 'o PS5 recusou (PIN vencido ou errado? o IP está certo?)', cancelado: 'cancelado' };

export class Ps5Nativo {
  // pedirPonte(): pede ao ajudante a porta e o token da ponte (via extensão)
  // compartilhar(fonte): põe a fonte numa tela da sala; devolve a chave ou null
  // pararTela(): tira a tela do PS5 da sala; onTremor(g, p); onEvento(texto, dados): relatório
  constructor({ pedirPonte, compartilhar, pararTela, onTremor, onEvento, toast, aoAbrir, aoFechar }) {
    Object.assign(this, { pedirPonte, compartilhar, pararTela, onTremor, onEvento, toast, aoAbrir, aoFechar });
    this.ws = null;
    this.consoles = [];
    this.achados = null;
    this.fase = 'parado';
    this.conectado = null; // { largura, altura, qps, kbps, codec }
    this.fonte = null;
    this.key = null; // a tela da sala
    this.raiz = null;
    this.erro = null;
    this.procurando = false;
    this.ultimoPad = 0;
    this.padSolto = true;
    try { this.opcoes = { ...PADRAO, ...JSON.parse(localStorage.getItem(OPCOES) || '{}') }; } catch { this.opcoes = { ...PADRAO }; }
    setInterval(() => this.vigiarPad(), 500);
  }

  guardarOpcoes() {
    try { localStorage.setItem(OPCOES, JSON.stringify(this.opcoes)); } catch { /* sem armazenamento */ }
  }

  get aberto() { return !!this.raiz && !this.raiz.hidden; }
  get noAr() { return !!this.fonte && !this.fonte.parada; }

  // ---------------------------------------------------------------- a ponte
  async ligarPonte() {
    if (this.ws && this.ws.readyState <= 1) return true;
    if (this.abrindoPonte) return this.abrindoPonte;
    this.abrindoPonte = (async () => {
      const r = await this.pedirPonte();
      if (!r?.ok) {
        this.erro = r?.erro === 'ajudante-ausente' || r?.erro === 'sem-resposta' ? 'Precisa da extensão Sala 3D e do ajudante do Windows (Ajustes → Extensão de controle).'
          : r?.erro === 'demorou' ? `Atualize o ajudante do Windows: rode o instalar.bat da pasta extensao/nativo de novo (este é o ${r.versao || 'antigo'}; o PS5 direto precisa do 1.16).`
          : r?.msg === 'sem-ponte' ? 'A ponte do PS5 (extensao/nativo/ps5/sala3d-ps5.exe) não está na pasta da extensão. Atualize a pasta (git pull).'
          : `A ponte do PS5 não abriu (${r?.msg || r?.erro || 'sem resposta'}).`;
        return false;
      }
      return new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(`ws://127.0.0.1:${Number(r.porta)}/ps5?t=${encodeURIComponent(r.token)}`);
        } catch (err) {
          this.erro = `Não deu para falar com a ponte: ${err.message}`;
          return resolve(false);
        }
        ws.binaryType = 'arraybuffer';
        const fim = setTimeout(() => { try { ws.close(); } catch { /* */ } }, 8000);
        ws.onopen = () => {
          clearTimeout(fim);
          this.ws = ws;
          this.erro = null;
          resolve(true);
        };
        ws.onerror = () => {
          // o Chrome pede licença para o site falar com este PC (rede local): sem ela, não conecta
          this.erro = 'O Chrome não deixou a sala falar com a ponte neste PC. Se ele perguntar sobre “dispositivos na rede local”, permita.';
        };
        ws.onclose = () => {
          clearTimeout(fim);
          if (this.ws === ws) this.ws = null;
          resolve(false);
          if (this.noAr) this.terminar('a ponte do PS5 fechou');
          this.render();
        };
        ws.onmessage = (e) => (typeof e.data === 'string' ? this.texto(e.data) : this.binario(e.data));
      });
    })();
    try { return await this.abrindoPonte; } finally { this.abrindoPonte = null; }
  }

  mandar(m) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  binario(ab) {
    if (ab.byteLength < CAB) return;
    const u = new Uint8Array(ab);
    const tipo = u[0];
    const dados = u.subarray(CAB);
    if (!this.fonte) return;
    if (tipo === VIDEO) this.fonte.quadro(dados, u[1], (u[2] << 8) | u[3]);
    else if (tipo === SOM) this.fonte.som(dados);
    else if (tipo === CABECALHO) this.fonte.cabecalho(dados);
  }

  texto(txt) {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    switch (m.tipo) {
      case 'oi':
        this.versaoPonte = m.versao;
        break;
      case 'consoles':
        this.consoles = Array.isArray(m.lista) ? m.lista : [];
        break;
      case 'achados':
        this.achados = Array.isArray(m.lista) ? m.lista : [];
        this.procurando = false;
        break;
      case 'importados':
        this.toast?.(m.n ? `Trouxe ${m.n} console${m.n > 1 ? 's' : ''} do chiaki-ng.` : 'Não achei nenhum PS5 registrado no chiaki-ng deste PC.', m.n ? 'success' : 'warn', 5000);
        break;
      case 'registro':
        this.registrando = false;
        if (m.ok) this.toast?.(`PS5 “${m.nome}” registrado. Agora é só Jogar.`, 'success', 6000);
        else this.toast?.(`O registro não deu certo: ${ERROS_REGISTRO[m.erro] || m.erro}.`, 'error', 9000);
        break;
      case 'estado':
        this.fase = m.fase;
        if (m.fase === 'parado' && this.noAr) this.terminar(null);
        break;
      case 'conectado':
        this.conectado = m;
        this.fase = 'jogando';
        this.onEvento?.('ps5 direto: conectado', m);
        this.porNaSala();
        break;
      case 'som':
        this.fonte?.somCabecalho({ hz: m.hz, canais: m.canais });
        this.onEvento?.('ps5 direto: som', m);
        break;
      case 'tremor':
        this.onTremor?.(Number(m.g) || 0, Number(m.p) || 0);
        break;
      case 'pin':
        this.pedirPinDeLogin(!!m.errado);
        break;
      case 'saiu':
        this.onEvento?.('ps5 direto: saiu', m);
        if (m.erro) this.toast?.(`PS5: ${this.motivo(m)}`, 'error', 9000);
        this.terminar(null);
        break;
      case 'aviso':
        // erros da biblioteca vão para o relatório (o console do navegador também)
        if (m.nivel === 'E') console.warn('[ps5]', m.texto);
        this.onEvento?.('ps5 direto: aviso', { nivel: m.nivel, texto: String(m.texto).slice(0, 200) });
        break;
      default:
    }
    this.render();
  }

  motivo(m) {
    if (m.motivo === 'nao-achou') return 'o PS5 não respondeu na rede. Ele está ligado (ou em repouso) e no mesmo Wi-Fi/cabo deste PC?';
    if (m.motivo === 'dormindo') return 'o PS5 não acordou. Confira “Ligar o PS5 pela rede” em Configurações → Sistema → Economia de energia.';
    if (m.motivo === 'sem-registro') return 'esse console não está registrado aqui.';
    if (/in use/i.test(m.motivo)) return 'o Remote Play já está em uso (feche o chiaki-ng ou o app da Sony).';
    if (/version/i.test(m.motivo)) return 'a versão do Remote Play do PS5 não bate (atualize o chiaki-ng e a ponte).';
    if (/refused|regist/i.test(m.motivo)) return 'o PS5 recusou a conexão. Registre de novo (o registro pode ter sido apagado no PS5).';
    return `${m.motivo}${m.texto ? ` (${m.texto})` : ''}`;
  }

  // ---------------------------------------------------------------- jogar
  async jogar(id) {
    if (this.noAr || (this.fase !== 'parado' && this.fase)) return;
    if (!(await this.ligarPonte())) { this.render(); return; }
    this.opcoes.ultimo = id;
    this.guardarOpcoes();
    // a fonte nasce antes: o cabeçalho do vídeo chega logo depois do "conectado"
    this.fonte?.parar();
    this.fonte = new Ps5Fonte({ pedirChave: () => this.mandar({ tipo: 'chave' }), onEvento: this.onEvento });
    this.fase = 'procurando';
    this.mandar({ tipo: 'conectar', id, altura: Number(this.opcoes.altura) || 720, qps: Number(this.opcoes.qps) === 30 ? 30 : 60, kbps: Number(this.opcoes.kbps) || 6000, codec: 'h264' });
    this.render();
  }

  async porNaSala() {
    if (!this.fonte || this.key) return;
    const fonte = this.fonte;
    const key = await this.compartilhar(fonte);
    if (this.fonte !== fonte) return;
    if (!key) {
      this.toast?.('A sala não conseguiu pôr o PS5 numa tela. Desligando o PS5.', 'error', 6000);
      this.parar();
      return;
    }
    this.key = key;
    this.fechar();
  }

  // a sessão acabou (ou a tela saiu da sala): limpa tudo
  terminar(motivo) {
    const fonte = this.fonte;
    this.fonte = null;
    this.conectado = null;
    this.fase = 'parado';
    if (motivo) this.toast?.(`PS5 desligado: ${motivo}.`, 'warn', 6000);
    const key = this.key;
    this.key = null;
    fonte?.parar();
    if (key) this.pararTela?.(key);
    this.render();
  }

  parar() {
    this.mandar({ tipo: 'parar' });
    this.terminar(null);
  }

  dormir() {
    this.mandar({ tipo: 'dormir' });
  }

  // a tela do PS5 saiu da sala pelo X: a sessão para junto
  telaSaiu(key) {
    if (key !== this.key) return;
    this.key = null;
    this.parar();
  }

  pedirPinDeLogin(errado) {
    const pin = prompt(errado ? 'PIN errado. O PIN de acesso do PS5 (o do usuário):' : 'O PS5 pede o PIN de acesso do usuário:');
    if (pin) this.mandar({ tipo: 'pin', pin: pin.replace(/\D/g, '') });
    else this.parar();
  }

  // ---------------------------------------------------------------- o controle de quem joga
  // ev: { t: 'pad', b, lx, ly, rx, ry, lt, rt } (já validado em controle.js)
  pad(ev) {
    this.ultimoPad = performance.now();
    this.padSolto = !ev.b && !ev.lx && !ev.ly && !ev.rx && !ev.ry && !ev.lt && !ev.rt;
    this.mandar({ tipo: 'pad', b: ev.b, lx: ev.lx, ly: ev.ly, rx: ev.rx, ry: ev.ry, lt: ev.lt, rt: ev.rt });
  }

  // o "estou aqui" do modo jogo
  vivo() {
    this.ultimoPad = performance.now();
  }

  // quem jogava sumiu (a conexão caiu) com um botão apertado: solta tudo
  vigiarPad() {
    if (!this.noAr || this.padSolto || performance.now() - this.ultimoPad < PAD_SOLTA_MS) return;
    this.padSolto = true;
    this.mandar({ tipo: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
  }

  stats() {
    return this.fonte ? { ...this.fonte.stats(), conectado: this.conectado, ponte: this.versaoPonte ?? null } : null;
  }

  // ---------------------------------------------------------------- painel
  montar() {
    if (this.raiz) return;
    const css = document.createElement('style');
    css.textContent = CSS;
    document.head.appendChild(css);
    this.raiz = document.createElement('div');
    this.raiz.id = 'ps5-nativo';
    this.raiz.className = 'ep-fundo';
    this.raiz.hidden = true;
    this.raiz.innerHTML = `<div class="ep-card p5-card" role="dialog" aria-modal="true" aria-labelledby="p5-titulo">
      <header class="guia-head">
        <h2 id="p5-titulo">PS5 direto</h2>
        <button type="button" class="icon-btn" data-p5="fechar" aria-label="Fechar">${icon('x')}</button>
      </header>
      <div class="p5-corpo"></div>
    </div>`;
    document.body.appendChild(this.raiz);
    this.raiz.addEventListener('click', (e) => {
      if (e.target === this.raiz || e.target.closest('[data-p5="fechar"]')) return this.fechar();
      const b = e.target.closest('[data-p5]');
      if (!b || b.disabled) return;
      const acao = b.dataset.p5;
      const id = b.dataset.id;
      if (acao === 'jogar') this.jogar(id);
      else if (acao === 'parar') this.parar();
      else if (acao === 'dormir') this.dormir();
      else if (acao === 'procurar') { this.procurando = true; this.mandar({ tipo: 'descobrir' }); this.render(); }
      else if (acao === 'importar') this.mandar({ tipo: 'importar' });
      else if (acao === 'esquecer' && confirm('Esquecer este PS5 aqui? Para usar de novo, registre outra vez (ou traga do chiaki-ng).')) this.mandar({ tipo: 'esquecer', id });
      else if (acao === 'usar-ip') { const ip = this.raiz.querySelector('[name="p5-ip"]'); if (ip) ip.value = b.dataset.ip; }
      else if (acao === 'registrar') this.registrar();
      else if (acao === 'tentar') this.abrir();
    });
    this.raiz.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'p5-altura') {
        const [altura, qps] = String(e.target.value).split('-').map(Number);
        this.opcoes.altura = altura || 720;
        this.opcoes.qps = qps === 30 ? 30 : 60;
      }
      else if (n === 'p5-kbps') this.opcoes.kbps = Math.min(30000, Math.max(2000, Number(e.target.value) || 6000));
      else return;
      this.guardarOpcoes();
    });
    this.raiz.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.fechar();
    });
  }

  registrar() {
    const v = (n) => this.raiz.querySelector(`[name="${n}"]`)?.value.trim() || '';
    const host = v('p5-ip'), conta = v('p5-conta'), pin = v('p5-pin').replace(/\D/g, '');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return this.toast?.('O IP do PS5 (Configurações → Rede → Status da conexão), tipo 192.168.0.20.', 'warn', 6000);
    if (!conta) return this.toast?.('Falta o ID da conta PSN.', 'warn', 5000);
    if (pin.length !== 8) return this.toast?.('O PIN do PS5 tem 8 números.', 'warn', 5000);
    this.registrando = true;
    this.mandar({ tipo: 'registrar', host, conta, pin, ps5: true });
    this.render();
  }

  async abrir() {
    this.montar();
    if (!this.aberto) {
      this.raiz.hidden = false;
      this.aoAbrir?.();
    }
    this.render();
    if (!temPs5Nativo()) return;
    if (await this.ligarPonte()) {
      this.mandar({ tipo: 'consoles' });
      if (!this.achados && !this.procurando) { this.procurando = true; this.mandar({ tipo: 'descobrir' }); }
    }
    this.render();
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    this.aoFechar?.();
  }

  render() {
    if (!this.aberto) return;
    const corpo = this.raiz.querySelector('.p5-corpo');
    if (!temPs5Nativo()) {
      corpo.innerHTML = '<p class="p5-status">Este navegador não decodifica vídeo pela página (WebCodecs). Use o Chrome ou o Edge no PC do PS5.</p>';
      return;
    }
    if (!this.ws) {
      corpo.innerHTML = `<p class="p5-status">${this.erro ? esc(this.erro) : 'Abrindo a ponte do PS5…'}</p>
        ${this.erro ? '<div class="p5-linha"><button type="button" class="secondary small" data-p5="tentar">Tentar de novo</button></div>' : ''}`;
      return;
    }
    const noAr = this.noAr || (this.fase && this.fase !== 'parado');
    const achado = (c) => this.achados?.find((a) => a.id && a.id.toUpperCase() === c.id.toUpperCase());
    const lista = this.consoles.map((c) => {
      const a = achado(c);
      const estado = a ? (a.estado === 'pronto' ? `ligado${a.app ? ` · ${esc(a.app)}` : ''}` : a.estado === 'dormindo' ? 'em repouso (acorda sozinho)' : a.estado) : this.achados ? 'não respondeu na rede' : '';
      return `<div class="p5-item">
        <span><b>${esc(c.nome)}</b><small>${esc(a?.ip || c.ip || 'IP ainda não visto')}${estado ? ` · ${estado}` : ''}</small></span>
        <span class="p5-acoes">
          <button type="button" class="small" data-p5="jogar" data-id="${esc(c.id)}"${noAr ? ' disabled' : ''}>Jogar</button>
          <button type="button" class="secondary small" data-p5="esquecer" data-id="${esc(c.id)}"${noAr ? ' disabled' : ''}>Esquecer</button>
        </span>
      </div>`;
    }).join('');
    const novos = (this.achados || []).filter((a) => a.ps5 && !a.registrado);
    const fase = FASES[this.fase] ?? this.fase;
    const c = this.conectado;
    corpo.innerHTML = `
      <p class="p5-status">O PS5 sem o chiaki-ng aberto: a imagem que ele faz vai direto para quem joga, e o controle de quem joga chega nele como um controle de PS5 (sem o ViGEmBus). Feche o chiaki-ng antes: o PS5 só aceita um Remote Play por vez.</p>
      ${noAr ? `<div class="p5-item"><span><span class="p5-fase">${esc(fase)}</span>${c ? `<small>${c.largura}×${c.altura} · ${c.qps} qps · ${Math.round(c.kbps / 100) / 10} Mbps · ${esc(c.codec)}</small>` : ''}</span>
        <span class="p5-acoes"><button type="button" class="secondary small" data-p5="dormir"${c ? '' : ' disabled'}>Pôr em repouso</button><button type="button" class="small danger" data-p5="parar">Parar</button></span></div>` : ''}
      <div class="p5-lista">${lista || '<p class="p5-vazio">Nenhum PS5 registrado aqui ainda. Se o chiaki-ng já joga neste PC, é só trazer o registro dele.</p>'}</div>
      <div class="p5-linha">
        <button type="button" class="secondary small" data-p5="procurar"${this.procurando ? ' disabled' : ''}>${this.procurando ? 'Procurando…' : 'Procurar na rede'}</button>
        <button type="button" class="secondary small" data-p5="importar">Trazer do chiaki-ng</button>
        <label>Imagem <select name="p5-altura">
          ${IMAGENS.map(([a, q]) => `<option value="${a}-${q}"${Number(this.opcoes.altura) === a && (Number(this.opcoes.qps) === 30 ? 30 : 60) === q ? ' selected' : ''}>${a}p · ${q} qps</option>`).join('')}
        </select></label>
        <label>Banda (kbps) <input name="p5-kbps" type="number" min="2000" max="30000" step="500" value="${Number(this.opcoes.kbps) || 6000}" style="width:96px"></label>
      </div>
      ${novos.length ? `<p class="p5-dica">Na rede, sem registro: ${novos.map((a) => `<button type="button" class="secondary small" data-p5="usar-ip" data-ip="${esc(a.ip)}">${esc(a.nome || a.ip)} (${esc(a.ip)})</button>`).join(' ')}</p>` : ''}
      <details${this.consoles.length ? '' : ' open'}>
        <summary>Registrar um PS5</summary>
        <p class="p5-dica">No PS5: Configurações → Sistema → Remote Play → <b>Vincular dispositivo</b> (mostra o PIN de 8 números). O ID da conta PSN é o mesmo que o chiaki-ng pede (8 bytes em base64, termina em “=”).</p>
        <div class="p5-linha">
          <label>IP do PS5 <input name="p5-ip" placeholder="192.168.0.20" style="width:130px"></label>
          <label>ID da conta PSN <input name="p5-conta" placeholder="AbCdEfGhIjk=" style="width:140px"></label>
          <label>PIN <input name="p5-pin" inputmode="numeric" maxlength="9" placeholder="12345678" style="width:96px"></label>
          <button type="button" class="small" data-p5="registrar"${this.registrando ? ' disabled' : ''}>${this.registrando ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </details>`;
  }
}
