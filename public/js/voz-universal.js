// Dublagem do PS5 direto pelo Voz Universal (o projeto VozUniversal, dublagem das legendas na hora).
//
// Antes: o Voz Universal lia a TELA (a do PS5 tinha que ficar à vista, sem nada por cima) e a voz dele só
// chegava a quem joga pelo "Levar o som do PC" (o seletor do Chrome com o áudio do sistema).
// Agora, ligado no painel do PS5 direto:
//   - o ajudante do Windows acha o Voz Universal deste PC (aberto, ou abre ele minimizado);
//   - a sala manda a ele, por um WebSocket em 127.0.0.1 (porta e token do voz-universal.json), os quadros
//     do PS5 já decodificados (JPEG, ~8 por segundo) e o som do PS5 sozinho (16 kHz, para ele ouvir se quem
//     fala é homem ou mulher sem a voz dos amigos no meio);
//   - ele devolve a voz em português: vira uma trilha que main.js mistura no som do PS5 que vai para quem
//     joga, e um "abafar" que abaixa o PS5 neste PC enquanto a voz fala.
// Protocolo (8 bytes de cabeçalho; byte 0 = tipo): sala → Voz Universal 1 = JPEG, 2 = float32 16 kHz;
// Voz Universal → sala binário 1 = voz (bytes 4-7 = taxa, uint32 LE; depois float32 mono) e textos JSON
// { tipo: 'abafar' | 'estado' | 'fala' }. O outro lado é nucleo/sala.py, no VozUniversal.

const QUADRO = 1, SOM = 2, CAB = 8;
const QUADRO_MS = 120; // ~8 quadros por segundo: o Voz Universal lê a legenda a cada ~110 ms
const LARGURA_MAX = 1920;
const FILA_MAX = 2 * 1024 * 1024; // WebSocket entupido (o Voz Universal travou): pula quadros

// o som do PS5 em 16 kHz mono, em pedaços de 100 ms (média de cada janela: já filtra o que passaria de 8 kHz)
const ESCUTA_WORKLET = `
class Escuta16k extends AudioWorkletProcessor {
  constructor() { super(); this.passo = sampleRate / 16000; this.pos = 0; this.acc = 0; this.cont = 0; this.buf = new Float32Array(1600); this.n = 0; }
  process(entradas) {
    const e = entradas[0];
    if (!e || !e.length) return true;
    const a = e[0], b = e[1] || e[0];
    for (let i = 0; i < a.length; i++) {
      this.acc += (a[i] + b[i]) * 0.5; this.cont++;
      if (++this.pos >= this.passo) {
        this.pos -= this.passo;
        this.buf[this.n++] = this.acc / this.cont; this.acc = 0; this.cont = 0;
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('escuta-16k', Escuta16k);`;

export const ERROS_VOZ = {
  'ajudante-ausente': 'precisa da extensão Sala 3D e do ajudante do Windows (Ajustes → Extensão de controle).',
  'sem-resposta': 'precisa da extensão Sala 3D e do ajudante do Windows (Ajustes → Extensão de controle).',
  demorou: 'o ajudante não respondeu. Atualize a extensão (chrome://extensions → recarregar a Sala 3D, versão 1.27) e o ajudante (instalar.bat da pasta extensao/nativo).',
  'sem-voz-universal': 'o Voz Universal não está neste PC. Instale (Instalar Voz Universal.exe) ou clone o projeto VozUniversal na Área de Trabalho.',
  'nao-abriu': 'o Voz Universal não abriu em 90 s. Abra ele uma vez pelo atalho para ver o erro (log.txt na pasta dele).',
};

export class Dublagem {
  // pedirVoz(): o ajudante acha ou abre o Voz Universal → { ok, porta, token, abriu } ou { ok: false, msg | erro }
  // aoTrilha(trilha | null): a voz em português como trilha de áudio (main.js mistura no som do PS5)
  // abafarAqui(nivel): o PS5 neste PC (0..1) enquanto a voz fala
  // aoMudar(): o painel redesenha; onEvento(texto, dados): relatório
  constructor({ pedirVoz, aoTrilha, abafarAqui, aoMudar, onEvento }) {
    Object.assign(this, { pedirVoz, aoTrilha, abafarAqui, aoMudar, onEvento });
    this.estado = 'parado'; // parado | abrindo | ligado | erro
    this.erro = null;
    this.ws = null;
    this.fonte = null;
    this.voz = null; // { status, motor, clonada, escuta } do Voz Universal
    this.ultimaFala = null;
    this.enviados = 0;
  }

  get ligado() { return this.estado === 'abrindo' || this.estado === 'ligado'; }

  mudar(estado, erro = null) {
    this.estado = estado;
    this.erro = erro;
    this.aoMudar?.();
  }

  async ligar(fonte) {
    if (!fonte || fonte.parada) return;
    if (this.ligado && this.fonte === fonte) return;
    this.desligar(false);
    this.fonte = fonte;
    const vez = (this.vez = (this.vez || 0) + 1);
    // os AudioContexts nascem ainda no clique (depois de um await o navegador pode abrir eles parados)
    this.prepararAudio();
    this.mudar('abrindo');
    const r = await this.pedirVoz().catch(() => null);
    if (vez !== this.vez) return;
    if (!r?.ok) {
      const m = r?.msg || r?.erro || 'sem resposta';
      this.onEvento?.('dublagem: o Voz Universal não respondeu', r || { erro: 'sem resposta' });
      this.soltar();
      return void this.mudar('erro', ERROS_VOZ[m] || `o Voz Universal não respondeu (${m}).`);
    }
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${Number(r.porta)}/sala?t=${encodeURIComponent(r.token)}`);
    } catch (err) {
      this.soltar();
      return void this.mudar('erro', `não deu para falar com o Voz Universal (${err.message}).`);
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.mudar('ligado');
      this.onEvento?.('dublagem: ligada', { abriu: !!r.abriu });
      this.comecar();
    };
    ws.onerror = () => {
      if (this.ws === ws && this.estado === 'abrindo') {
        this.erro = 'o Chrome não deixou a sala falar com o Voz Universal. Se ele perguntar sobre “dispositivos na rede local”, permita.';
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const erro = this.estado === 'abrindo' ? (this.erro || 'o Voz Universal recusou a conexão.') : 'o Voz Universal fechou.';
      this.onEvento?.('dublagem: caiu', { erro });
      this.soltar();
      this.mudar('erro', erro);
    };
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.texto(e.data) : this.vozChegou(e.data));
  }

  // desliga e solta tudo (aviso: redesenha o painel)
  desligar(aviso = true) {
    this.vez = (this.vez || 0) + 1;
    this.soltar();
    this.estado = 'parado';
    this.erro = null;
    if (aviso) this.aoMudar?.();
  }

  soltar() {
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(); } catch { /* já fechado */ } }
    if (this.fonte) this.fonte.espiar = null;
    this.fonte = null;
    try { this.noEscuta?.disconnect(); } catch { /* */ }
    this.noEscuta = null;
    this.ctxEscuta?.close().catch(() => {});
    this.ctxEscuta = null;
    if (this.trilha) {
      this.aoTrilha?.(null);
      this.trilha.stop();
    }
    this.trilha = null;
    this.pararVoz();
    this.ctxVoz?.close().catch(() => {});
    this.ctxVoz = null;
    this.destVoz = null;
    this.voz = null;
    this.abafarAqui?.(1);
  }

  prepararAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const novo = () => { try { return new AC({ latencyHint: 'interactive', sampleRate: 48000 }); } catch { return new AC({ latencyHint: 'interactive' }); } };
    this.ctxVoz = novo();
    this.ctxEscuta = novo();
    this.destVoz = this.ctxVoz.createMediaStreamDestination();
    this.proximo = 0;
    this.agendados = [];
    for (const c of [this.ctxVoz, this.ctxEscuta]) if (c.state === 'suspended') c.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- sala → Voz Universal
  comecar() {
    const fonte = this.fonte;
    if (!fonte) return;
    // a voz vira uma trilha (vai na mistura com o PS5 para quem joga)
    this.trilha = this.destVoz.stream.getAudioTracks()[0];
    this.aoTrilha?.(this.trilha);
    // os quadros: uma cópia a cada ~120 ms, um de cada vez
    this.ultimoQuadro = 0;
    this.convertendo = false;
    fonte.espiar = (frame) => this.espiar(frame);
    // o som do PS5 sozinho (a trilha original da fonte, antes de qualquer mistura)
    const trilhaPs5 = fonte.trilhaSom;
    if (trilhaPs5 && this.ctxEscuta) {
      const ctx = this.ctxEscuta;
      const url = URL.createObjectURL(new Blob([ESCUTA_WORKLET], { type: 'text/javascript' }));
      ctx.audioWorklet.addModule(url).then(() => {
        if (this.ctxEscuta !== ctx) return;
        const no = new AudioWorkletNode(ctx, 'escuta-16k', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        no.port.onmessage = (e) => this.mandarSom(e.data);
        const mudo = ctx.createGain();
        mudo.gain.value = 0; // só para o navegador processar o nó (nada toca)
        ctx.createMediaStreamSource(new MediaStream([trilhaPs5])).connect(no).connect(mudo).connect(ctx.destination);
        this.noEscuta = no;
      }).catch((err) => console.warn('[dublagem] escuta', err)).finally(() => URL.revokeObjectURL(url));
    }
  }

  espiar(frame) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 || this.convertendo) return;
    const agora = performance.now();
    if (agora - this.ultimoQuadro < QUADRO_MS || ws.bufferedAmount > FILA_MAX) return;
    this.ultimoQuadro = agora;
    this.convertendo = true;
    const copia = frame.clone();
    this.paraJpeg(copia).then((u8) => {
      if (u8 && this.ws === ws && ws.readyState === 1) {
        ws.send(u8);
        this.enviados++;
      }
    }).catch((err) => console.warn('[dublagem] quadro', err)).finally(() => { this.convertendo = false; });
  }

  async paraJpeg(frame) {
    try {
      let w = frame.displayWidth, h = frame.displayHeight;
      if (w > LARGURA_MAX) { h = Math.round((h * LARGURA_MAX) / w); w = LARGURA_MAX; }
      if (!this.tela || this.tela.width !== w || this.tela.height !== h) {
        this.tela = new OffscreenCanvas(w, h);
        this.ctxTela = this.tela.getContext('2d', { alpha: false });
      }
      this.ctxTela.drawImage(frame, 0, 0, w, h);
    } finally {
      frame.close();
    }
    const blob = await this.tela.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const ab = await blob.arrayBuffer();
    const u8 = new Uint8Array(CAB + ab.byteLength);
    u8[0] = QUADRO;
    u8.set(new Uint8Array(ab), CAB);
    return u8;
  }

  mandarSom(f32) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > FILA_MAX) return;
    const u8 = new Uint8Array(CAB + f32.byteLength);
    u8[0] = SOM;
    u8.set(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength), CAB);
    ws.send(u8);
  }

  // ---------------------------------------------------------------- Voz Universal → sala
  vozChegou(ab) {
    if (ab.byteLength <= CAB || new Uint8Array(ab, 0, 1)[0] !== 1 || !this.ctxVoz) return;
    const sr = new DataView(ab).getUint32(4, true);
    const n = (ab.byteLength - CAB) >> 2;
    if (!n || sr < 8000 || sr > 96000) return;
    const ctx = this.ctxVoz;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const buf = ctx.createBuffer(1, n, sr);
    buf.copyToChannel(new Float32Array(ab, CAB, n), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.destVoz);
    // os pedaços em fila, sem buraco entre eles; 60 ms de folga para a rede local.
    // Fila longa demais (relógio do áudio parado, rede engasgou): CORTA o que estava agendado e recomeça.
    // Antes só recomeçava o relógio e os pedaços antigos continuavam agendados: 3-4 vozes ao mesmo tempo.
    const agora = ctx.currentTime;
    if (this.proximo > agora + 1.5) {
      console.warn('[dublagem] voz atrasada', (this.proximo - agora).toFixed(1), 's: cortei', this.agendados.length, 'pedaços');
      this.pararVoz();
    }
    if (this.proximo < agora + 0.02) this.proximo = agora + 0.06;
    src.start(this.proximo);
    this.proximo += buf.duration;
    this.agendados.push(src);
    src.onended = () => {
      const i = this.agendados.indexOf(src);
      if (i >= 0) this.agendados.splice(i, 1);
    };
  }

  pararVoz() {
    for (const s of this.agendados || []) {
      s.onended = null;
      try { s.stop(); } catch {}
    }
    this.agendados = [];
    this.proximo = 0;
  }

  texto(txt) {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (m.tipo === 'abafar') this.abafarAqui?.(Math.min(1, Math.max(0, Number(m.nivel) || 0)));
    else if (m.tipo === 'estado') { this.voz = m; this.aoMudar?.(); }
    else if (m.tipo === 'fala') { this.ultimaFala = { quem: String(m.quem || ''), texto: String(m.texto || '') }; this.aoMudar?.(); }
  }

  // uma linha para o painel do PS5
  resumo() {
    if (this.estado === 'abrindo') return 'abrindo o Voz Universal…';
    if (this.estado === 'erro') return this.erro || 'erro';
    if (this.estado !== 'ligado') return '';
    const v = this.voz || {};
    const motor = v.motor === 'clonada' ? 'voz clonada' : v.motor === 'local' ? 'voz local' : v.motor ? 'voz rápida' : '';
    const carregando = v.clonada === 'carregando' ? ' (a voz clonada ainda está carregando)' : '';
    const st = v.pausado ? 'pausada (F10 retoma)' : v.status === 'lendo' ? 'lendo as legendas' : v.status === 'aguardando' ? 'esperando a imagem do PS5' : (v.status || 'ligada');
    return `${st}${motor ? ` · ${motor}` : ''}${carregando}`;
  }
}
