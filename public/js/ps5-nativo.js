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
import { descricaoSemReordenar, temTocadorSom, criarTocadorSom, paraOTocador } from './turbo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAB = 8;
const VIDEO = 1, SOM = 2, CABECALHO = 3;
const CHAVE_MS = 300; // intervalo mínimo entre pedidos de quadro-chave ao PS5
// A cópia daqui (a tela da sala) pede bem menos: o quadro-chave do PS5 é grande e vai para quem joga
// também. O PS5 não manda quadro-chave sozinho de tempos em tempos: sem pedir, a cópia ficaria parada.
const CHAVE_LOCAL_MS = 2000;
const PAD_SOLTA_MS = 1500; // sem notícia do controle de quem joga por tanto tempo: solta tudo
const OPCOES = 'sala3d-ps5'; // localStorage: { altura, qps, kbps, codec, ultimo, v, psTravado, menuTravado }
// kbps 0: automática pela resolução (BANDA). codec 'auto': H.265 se este navegador decodifica.
// psTravado: o botão PS de quem joga (no controle ou o H do teclado) não chega ao PS5 — ninguém sai do
// jogo para o menu; daqui, o "Apertar PS" do painel ainda chega.
// menuTravado: o mesmo para o Create e o Options (pausa, menu e captura do jogo); o painel ainda aperta.
const PADRAO = { altura: 1080, qps: 60, kbps: 0, codec: 'auto', ultimo: null, v: 2, psTravado: true, menuTravado: true };
const BIT_PS = 1 << 16; // o botão PS/Home no mapa padrão do navegador
const BIT_CREATE = 1 << 8, BIT_OPTIONS = 1 << 9; // Create e Options no mesmo mapa
// A banda que o PS5 usa para cada resolução. Antes era 6 Mbps fixos (1080p a 60 ficava borrado no
// movimento: o próprio chiaki-ng usa 15 em 1080p). Dá para pôr à mão até 50 Mbps.
const BANDA = { 720: 10000, 1080: 15000 };
export const bandaDaImagem = (altura) => BANDA[altura] || BANDA[1080];
// o Remote Play vai até 1080p (os testes de 1440p e 4K saíram: o PS5 recusava)
const IMAGENS = [[720, 60], [720, 30], [1080, 60], [1080, 30]];
const NOME_IMAGEM = { 720: '720p', 1080: '1080p' };
const alturaValida = (a) => (Number(a) === 720 ? 720 : 1080);
const HEVC_TESTE = 'hvc1.1.6.L153.B0';
// este navegador decodifica H.265? (a resposta fica guardada: a pergunta leva uns ms)
let hevcAqui = null;
export async function decodificaHevc() {
  if (hevcAqui != null) return hevcAqui;
  try {
    const r = await VideoDecoder.isConfigSupported({ codec: HEVC_TESTE, optimizeForLatency: true });
    hevcAqui = !!r?.supported;
  } catch {
    hevcAqui = false;
  }
  return hevcAqui;
}

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

// ------------------------------------------------------------------ H.265 (fica em Annex B)
// O H.265 vai sem descrição (hvcC): o decodificador lê o Annex B, com VPS/SPS/PPS na frente de cada
// quadro-chave. Mais simples que montar o hvcC, e quem joga (turbo.js) já aceita config sem descrição.
export const tipoHevc = (n) => (n[0] >> 1) & 0x3f;

export function annexB(nals) {
  const total = nals.reduce((s, n) => s + 4 + n.length, 0);
  const r = new Uint8Array(total);
  let o = 0;
  for (const n of nals) {
    r.set([0, 0, 0, 1], o);
    r.set(n, o + 4);
    o += 4 + n.length;
  }
  return r;
}

// largura, altura e o nome do codec (hev1.…) a partir do SPS do H.265
export function infoDoSpsHevc(nal) {
  const L = new Bits(rbspDe(nal));
  L.u(16); // cabeçalho da NAL
  L.u(4);
  const maxSub = L.u(3);
  L.u(1);
  // profile_tier_level
  const espaco = L.u(2);
  const tier = L.u(1);
  const perfil = L.u(5);
  const compat = L.u(32);
  const restricoes = [];
  for (let i = 0; i < 6; i++) restricoes.push(L.u(8));
  const nivel = L.u(8);
  const subPerfil = [];
  const subNivel = [];
  for (let i = 0; i < maxSub; i++) { subPerfil.push(L.u(1)); subNivel.push(L.u(1)); }
  if (maxSub > 0) for (let i = maxSub; i < 8; i++) L.u(2);
  for (let i = 0; i < maxSub; i++) {
    if (subPerfil[i]) { L.u(32); L.u(32); L.u(24); }
    if (subNivel[i]) L.u(8);
  }
  L.ue(); // id do SPS
  const croma = L.ue();
  if (croma === 3) L.u(1);
  let w = L.ue();
  let h = L.ue();
  if (L.u(1)) {
    const sx = croma === 1 || croma === 2 ? 2 : 1;
    const sy = croma === 1 ? 2 : 1;
    const esq = L.ue(), dir = L.ue(), cima = L.ue(), baixo = L.ue();
    w -= (esq + dir) * sx;
    h -= (cima + baixo) * sy;
  }
  // as bandeiras de compatibilidade vão invertidas no nome (ISO 14496-15, anexo E)
  let inv = 0;
  for (let i = 0; i < 32; i++) inv = inv * 2 + (Math.floor(compat / 2 ** i) % 2);
  const r = [...restricoes];
  while (r.length && r[r.length - 1] === 0) r.pop();
  const codec = `hev1.${['', 'A', 'B', 'C'][espaco]}${perfil}.${inv.toString(16).toUpperCase()}.${tier ? 'H' : 'L'}${nivel}${r.map((b) => `.${b.toString(16).toUpperCase()}`).join('')}`;
  return { w, h, codec };
}

// ------------------------------------------------------------------ a fonte (vídeo e som do PS5)
// Quem assina recebe { cfg }, { quadro, chave, ts, t0 } e { som, ts, hz, canais }. ts em µs.
export class Ps5Fonte {
  constructor({ pedirChave, onEvento, hevc = false }) {
    this.pedirChaveDaPonte = pedirChave;
    this.onEvento = onEvento;
    this.hevc = hevc; // H.265 (Annex B, ver infoDoSpsHevc) em vez do H.264 (avc)
    this.vps = null;
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
    // O som: o Opus decodificado vai para o tocador com buffer do turbo (AudioWorklet: 30 ms que crescem
    // até 120 se faltar som) e sai numa trilha estável — a que toca aqui e vai para quem joga. Antes cada
    // pacote ia direto numa trilha gerada, com a hora de chegada: rajada da rede ou a página ocupada
    // (vídeo, 3D) deixavam buracos e o som picotava.
    if (typeof AudioDecoder === 'function' && temTocadorSom()) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        try { this.ctxSom = new AC({ latencyHint: 'interactive', sampleRate: 48000 }); } catch { this.ctxSom = new AC({ latencyHint: 'interactive' }); }
        this.destSom = this.ctxSom.createMediaStreamDestination();
        trilhas.push(...this.destSom.stream.getAudioTracks());
        criarTocadorSom(this.ctxSom).then((no) => {
          if (this.parada) return;
          no.port.onmessage = (e) => { this.estadoSom = e.data; };
          no.port.postMessage({ alvo: 0.06 }); // 60 ms de saída: a ponte e a rede de casa mandam em rajada
          no.connect(this.destSom);
          this.tocador = no;
        }).catch((err) => console.warn('[ps5] tocador de som', err));
        // o navegador pode abrir o AudioContext parado (sem clique ainda): o próximo clique ou tecla solta
        this.destravarSom = () => { if (this.ctxSom?.state === 'suspended') this.ctxSom.resume().catch(() => {}); };
        for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, this.destravarSom, true);
        this.destravarSom();
      } catch (err) {
        console.warn('[ps5] som', err);
        this.ctxSom = null;
      }
    }
    if (!this.ctxSom && typeof MediaStreamTrackGenerator === 'function' && typeof AudioDecoder === 'function') {
      this.gerSom = new MediaStreamTrackGenerator({ kind: 'audio' });
      this.escritorSom = this.gerSom.writable.getWriter();
      trilhas.push(this.gerSom);
    }
    this.stream = new MediaStream(trilhas);
    // o som do PS5 sozinho (a stream pode trocar ele por uma mistura com a voz da dublagem)
    this.trilhaSom = this.stream.getAudioTracks()[0] || null;
  }

  assinar(fn) {
    this.assinantes.add(fn);
    if (this.cfg) fn({ cfg: this.cfg });
    return () => this.assinantes.delete(fn);
  }

  // a banda que o PS5 manda de verdade (kbps), dos últimos seg segundos inteiros: a da sessão é só o teto dele
  taxa(seg = 10) {
    const agora = Math.floor(performance.now() / 1000);
    const v = [];
    for (const [s, b] of this.porSegundo || []) if (s < agora && s >= agora - seg) v.push((b * 8) / 1000);
    return v.length ? { media: Math.round(v.reduce((a, b) => a + b, 0) / v.length), pico: Math.round(Math.max(...v)) } : null;
  }

  // como o PS5 está chegando neste PC, dos últimos seg segundos inteiros: quadros por segundo, e o pior segundo
  saude(seg = 10) {
    const agora = Math.floor(performance.now() / 1000);
    const v = [];
    for (const [s, n] of this.quadrosPorSegundo || []) if (s < agora && s >= agora - seg) v.push(n);
    return v.length > 2 ? { qps: Math.round(v.reduce((a, b) => a + b, 0) / v.length), pior: Math.min(...v.slice(1)) } : null;
  }

  avisar(m) {
    if (m.quadro) {
      const seg = Math.floor(performance.now() / 1000);
      this.quadrosPorSegundo ??= new Map();
      this.quadrosPorSegundo.set(seg, (this.quadrosPorSegundo.get(seg) || 0) + 1);
      if (this.quadrosPorSegundo.size > 40) this.quadrosPorSegundo.delete(this.quadrosPorSegundo.keys().next().value);
      this.porSegundo ??= new Map();
      this.porSegundo.set(seg, (this.porSegundo.get(seg) || 0) + m.quadro.byteLength);
      if (this.porSegundo.size > 40) this.porSegundo.delete(this.porSegundo.keys().next().value);
    }
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

  // VPS/SPS/PPS do H.265: a configuração vai sem descrição (o decodificador lê o Annex B)
  parametrosHevc(vps, sps, pps) {
    if (vps) this.vps = vps;
    if (sps) this.sps = sps;
    if (pps) this.pps = pps;
    if (!this.vps || !this.sps || !this.pps) return;
    const chave = b64(annexB([this.vps, this.sps, this.pps]));
    if (this.cfg?.chave === chave) return;
    let info = { w: this.cfg?.w ?? 1920, h: this.cfg?.h ?? 1080, codec: HEVC_TESTE };
    try { info = infoDoSpsHevc(this.sps); } catch (err) { console.warn('[ps5] sps h265', err); }
    this.cfg = { codec: info.codec, w: info.w, h: info.h, description: undefined, b64: null, chave, hevc: true };
    this.onEvento?.('ps5: configuração do vídeo', { codec: info.codec, w: info.w, h: info.h });
    this.configurarDec();
    this.avisar({ cfg: this.cfg });
  }

  cabecalho(buf) {
    if (this.hevc) {
      let vps = null, sps = null, pps = null;
      for (const n of nalsDe(buf)) {
        const t = tipoHevc(n);
        if (t === 32) vps = n.slice();
        else if (t === 33) sps = n.slice();
        else if (t === 34) pps = n.slice();
      }
      return this.parametrosHevc(vps, sps, pps);
    }
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
    if (this.hevc) return this.quadroHevc(buf, marcas, perdidos);
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

  quadroHevc(buf, marcas, perdidos) {
    const t0 = performance.now();
    const imagem = [];
    let vps = null, sps = null, pps = null, chave = false;
    for (const n of nalsDe(buf)) {
      const t = tipoHevc(n);
      if (t === 32) vps = n.slice();
      else if (t === 33) sps = n.slice();
      else if (t === 34) pps = n.slice();
      else if (t === 35) continue; // delimitador
      else {
        if (t >= 16 && t <= 21) chave = true; // IRAP (IDR, CRA, BLA)
        imagem.push(n);
      }
    }
    if (vps || sps || pps) this.parametrosHevc(vps, sps, pps);
    if (!imagem.length || !this.cfg) return;
    // quadro-chave leva os parâmetros na frente: quem começa por ele (aqui e no turbo) decodifica
    const dados = annexB(chave ? [this.vps, this.sps, this.pps, ...imagem] : imagem);
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
      this.dec.configure({ codec: cfg.codec, ...(cfg.description ? { description: cfg.description } : {}), optimizeForLatency: true });
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
    // a dublagem (voz-universal.js) tira uma cópia de alguns quadros antes de o quadro seguir
    if (this.espiar) {
      try { this.espiar(frame); } catch (err) { console.warn('[ps5] espiar', err); }
    }
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
    if (!this.escritorSom && !this.ctxSom) return;
    try {
      if (this.decSom && this.decSom.state !== 'closed') this.decSom.close();
    } catch { /* já fechado */ }
    try {
      this.decSom = new AudioDecoder({
        output: (data) => {
          if (this.parada) { data.close(); return; }
          if (this.ctxSom) {
            if (this.tocador) paraOTocador(this.tocador, data);
            else data.close(); // o tocador ainda carregando (os primeiros ms)
            return;
          }
          if (!this.escritorSom) { data.close(); return; }
          this.escritorSom.write(data).catch(() => {});
        },
        // Um pacote ruim fecha o decodificador. Antes ele virava null e nunca mais voltava: o som daqui
        // e o do vídeo normal sumiam de vez (o turbo seguia, porque repassa sem decodificar). Agora o
        // próximo pacote cria outro (som()).
        error: (err) => {
          console.warn('[ps5] som', err);
          this.decSom = null;
          this.conta.errosSom = (this.conta.errosSom || 0) + 1;
          this.onEvento?.('ps5: o decodificador de som falhou (cria outro)', { erro: String(err?.message || err).slice(0, 120), vezes: this.conta.errosSom });
        },
      });
      this.decSom.configure({ codec: 'opus', sampleRate: this.somCfg.hz, numberOfChannels: this.somCfg.canais });
    } catch (err) {
      console.warn('[ps5] som', err);
      this.decSom = null;
    }
  }

  som(buf) {
    if (this.parada || !this.somCfg) return;
    // Pacote vazio da ponte: o AudioDecoder recusa ("Null or empty decoder buffer"), fecha e o som some até
    // nascer outro (até 1 s, aqui e no vídeo normal) — 19 vezes numa sessão do relatório de 2026-11-18
    if (!buf?.byteLength) {
      this.conta.somVazios = (this.conta.somVazios || 0) + 1;
      return;
    }
    const ts = Math.round(performance.now() * 1000);
    const dados = buf.slice();
    this.avisar({ som: dados, ts, hz: this.somCfg.hz, canais: this.somCfg.canais });
    this.conta.som = (this.conta.som || 0) + 1;
    // o decodificador caiu (pacote ruim): outro, no máximo um por segundo
    if ((!this.decSom || this.decSom.state === 'closed') && performance.now() - (this.recriouSom || 0) > 1000) {
      this.recriouSom = performance.now();
      this.somCabecalho({ hz: this.somCfg.hz, canais: this.somCfg.canais });
    }
    if (this.decSom?.state === 'configured' && this.decSom.decodeQueueSize < 10) {
      try { this.decSom.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data: dados })); } catch { /* pacote ruim */ }
    }
  }

  stats() {
    const c = this.conta;
    const o = [...c.decMs].sort((a, b) => a - b);
    const r = { quadros: c.quadros, chaves: c.chaves, kbps: null, perdidos: c.perdidos, recuperados: c.recuperados, erros: c.erros, desenhados: c.desenhados, decMs: o.length ? Math.round(o[o.length >> 1] * 10) / 10 : null, codec: this.cfg?.codec ?? null, largura: this.cfg?.w ?? null, altura: this.cfg?.h ?? null, som: !!this.somCfg,
      // o tocador do som: buffer agora, alvo, faltas (buracos) e descartes desde o começo
      tocador: this.estadoSom ? { nivelMs: Math.round(this.estadoSom.nivelMs), alvoMs: Math.round(this.estadoSom.alvoMs), faltas: this.estadoSom.faltas, descartes: this.estadoSom.descartes, ctx: this.ctxSom?.state ?? null } : null,
      somVazios: c.somVazios || 0 }; // pacotes de som vazios que vieram da ponte (ignorados)
    return r;
  }

  parar() {
    if (this.parada) return;
    this.parada = true;
    this.espiar = null;
    this.assinantes.clear();
    for (const d of [this.dec, this.decSom]) {
      try { if (d && d.state !== 'closed') d.close(); } catch { /* já fechado */ }
    }
    for (const w of [this.escritorVideo, this.escritorSom]) w?.close().catch(() => {});
    for (const t of this.stream.getTracks()) t.stop();
    if (this.destravarSom) for (const ev of ['pointerdown', 'keydown']) removeEventListener(ev, this.destravarSom, true);
    try { this.tocador?.disconnect(); } catch { /* já solto */ }
    this.ctxSom?.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ a ponte + o painel
const CSS = `
#ps5-nativo { --p5: #3b82f6; }
#ps5-nativo .p5-card { width: min(680px, 100%); grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 16px; }
#ps5-nativo .p5-cab { display: flex; align-items: center; gap: 12px; min-width: 0; }
#ps5-nativo .p5-cab h2 { margin: 0; font-size: 18px; }
#ps5-nativo .p5-cab small { display: block; color: var(--muted); font-size: 12.5px; margin-top: 1px; }
#ps5-nativo .p5-selo { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 12px; color: #fff;
  background: linear-gradient(150deg, #60a5fa, #1d4ed8); box-shadow: 0 6px 18px rgba(37,99,235,.35); }
#ps5-nativo .p5-corpo { display: grid; align-content: start; gap: 16px; min-height: 0; overflow-y: auto; margin-right: -8px; padding-right: 8px; }
#ps5-nativo .p5-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.5;
  color: var(--muted); background: color-mix(in srgb, var(--p5) 9%, transparent); border: 1px solid color-mix(in srgb, var(--p5) 22%, transparent); }
#ps5-nativo .p5-aviso .ic { flex: none; color: #93c5fd; margin-top: 1px; }
#ps5-nativo .p5-status { font-size: 13px; color: var(--muted); line-height: 1.5; margin: 0; }
#ps5-nativo .p5-status b, #ps5-nativo .p5-aviso b { color: var(--text); }
#ps5-nativo .p5-sec { display: grid; gap: 8px; }
#ps5-nativo .p5-sec > h3 { margin: 0; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
#ps5-nativo .p5-lista { display: grid; gap: 8px; }
#ps5-nativo .p5-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 14px;
  border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.035); transition: border-color 140ms, background 140ms; }
#ps5-nativo .p5-item:hover { border-color: var(--line-strong); background: rgba(255,255,255,.05); }
#ps5-nativo .p5-item.sem-ic { grid-template-columns: minmax(0, 1fr) auto; }
#ps5-nativo .p5-item b { font-size: 14px; }
#ps5-nativo .p5-item small { display: block; color: var(--muted); font-size: 12px; line-height: 1.45; margin-top: 3px; }
#ps5-nativo .p5-ic { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #bfdbfe;
  background: color-mix(in srgb, var(--p5) 16%, transparent); }
#ps5-nativo .p5-item.ar { border-color: color-mix(in srgb, var(--p5) 60%, transparent);
  background: linear-gradient(120deg, color-mix(in srgb, var(--p5) 16%, transparent), rgba(255,255,255,.03)); }
#ps5-nativo .p5-pilula { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 800;
  letter-spacing: .03em; vertical-align: 1px; margin-left: 6px; color: var(--c, #93c5fd); background: color-mix(in srgb, var(--c, #93c5fd) 15%, transparent); }
#ps5-nativo .p5-pilula::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
#ps5-nativo .p5-pilula.vivo::before { box-shadow: 0 0 0 0 currentColor; animation: p5-pulso 1.6s ease-out infinite; }
@keyframes p5-pulso { to { box-shadow: 0 0 0 7px transparent; } }
#ps5-nativo .p5-vol { grid-template-columns: auto minmax(0, 1fr); }
#ps5-nativo .p5-vol-linha { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
#ps5-nativo .p5-vol-linha input { flex: 1; min-width: 0; margin: 0; accent-color: var(--p5, var(--accent)); cursor: pointer; }
#ps5-nativo .p5-vol-linha output { min-width: 42px; text-align: right; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
#ps5-nativo .p5-acoes { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
#ps5-nativo .p5-linha { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#ps5-nativo .p5-campos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px 14px;
  border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.035); }
#ps5-nativo .p5-campos label, #ps5-nativo .p5-registro label { display: grid; gap: 5px; font-size: 12px; font-weight: 600; color: var(--muted); min-width: 0; }
#ps5-nativo .p5-campos input, #ps5-nativo .p5-campos select, #ps5-nativo .p5-registro input { width: 100%; min-width: 0; }
#ps5-nativo details { border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.035); }
#ps5-nativo summary { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; font-weight: 700; font-size: 14px; list-style: none; }
#ps5-nativo summary::-webkit-details-marker { display: none; }
#ps5-nativo summary .p5-seta { margin-left: auto; color: var(--muted); transition: transform 160ms var(--ease); }
#ps5-nativo details[open] summary .p5-seta { transform: rotate(180deg); }
#ps5-nativo .p5-registro { display: grid; gap: 10px; padding: 0 14px 14px; }
#ps5-nativo .p5-registro .p5-campos { padding: 0; border: 0; background: none; grid-template-columns: 1.2fr 1.2fr .9fr auto; align-items: end; }
#ps5-nativo .p5-dica { font-size: 12.5px; color: var(--muted); line-height: 1.55; margin: 0; }
#ps5-nativo .p5-vazio { display: grid; place-items: center; gap: 6px; padding: 18px 14px; text-align: center; font-size: 13px; color: var(--muted);
  border: 1px dashed var(--line-strong); border-radius: 14px; }
#ps5-nativo .p5-vazio .ic { color: #93c5fd; }
#ps5-nativo .p5-fase { font-weight: 700; color: #60a5fa; }
#ps5-nativo .p5-parar { background: var(--danger); color: #fff; }
#ps5-nativo .p5-parar:hover { background: #f4797d; }
#ps5-nativo .p5-campos > button { height: 44px; }
#ps5-nativo .p5-item small b { font-size: inherit; }
@media (max-width: 600px) {
  #ps5-nativo .p5-campos, #ps5-nativo .p5-registro .p5-campos { grid-template-columns: minmax(0, 1fr); }
  #ps5-nativo .p5-item { grid-template-columns: auto minmax(0, 1fr); }
  #ps5-nativo .p5-item > .p5-acoes { grid-column: 1 / -1; justify-content: flex-start; }
}
`;

export const CSS_PAINEL = CSS; // o PC direto (pc-direto.js) usa o mesmo visual

const FASES = { procurando: 'procurando o PS5 na rede…', acordando: 'acordando o PS5 (uns 20 s)…', conectando: 'conectando…', jogando: 'no ar', parado: '' };
const ERROS_REGISTRO = { conta: 'o ID da conta PSN não está certo (8 bytes em base64, como o chiaki-ng mostra)', pin: 'o PIN tem 8 números', ocupado: 'já tem um registro em andamento', falhou: 'o PS5 recusou (PIN vencido ou errado? o IP está certo?)', cancelado: 'cancelado' };

export class Ps5Nativo {
  // "05000000…" (22 dígitos hex: modo + 10 parâmetros) → [5, 0, 0, …]; inválido: solto ([0x05])
  static bytesGatilho(hex) {
    const s = String(hex ?? '');
    if (!/^[0-9a-f]{2,22}$/i.test(s) || s.length % 2) return [0x05];
    return s.match(/../g).map((x) => parseInt(x, 16));
  }

  // pedirPonte(): pede ao ajudante a porta e o token da ponte (via extensão)
  // compartilhar(fonte): põe a fonte numa tela da sala; devolve a chave ou null
  // pararTela(): tira a tela do PS5 da sala; onTremor(g, p); onEvento(texto, dados): relatório
  // jogarComLossless(key): a tela do PS5 em tela cheia no modo jogo, com o Lossless ligado (main.js)
  // losslessTodos: { ligado(), alternar() } — o Lossless deste PC para todos, pela câmera do OBS
  // somPc: { ligado(), alternar(), abafar(), alternarAbafar() } — o som do PC (Voz Universal) junto com o do PS5
  // dublagem: { ligada(), estado(), resumo(), ultimaFala(), alternar() } — o Voz Universal lendo a imagem do PS5 (voz-universal.js)
  // aoParar(): alguém parou de propósito; aoCair(): a imagem caiu sozinha (ver diretas.js)
  constructor({ pedirPonte, compartilhar, pararTela, onTremor, onGatilhos, onEvento, toast, aoAbrir, aoFechar, jogarComLossless, losslessTodos, somPc, volume, dublagem, aoParar, aoCair }) {
    Object.assign(this, { pedirPonte, compartilhar, pararTela, onTremor, onGatilhos, onEvento, toast, aoAbrir, aoFechar, jogarComLossless, losslessTodos, somPc, volume, dublagem, aoParar, aoCair });
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
    // toda vez que a página abre, a imagem do PS5 entra em 1080p · 60 qps (como o modo de imagem de quem
    // joga entra no 1080p Turbo liso): o 720p ou os 30 qps escolhidos valem até recarregar
    Object.assign(this.opcoes, { altura: PADRAO.altura, qps: PADRAO.qps });
    // antes da versão 2 a banda era 6 Mbps de fábrica (gravada junto): passa a ser automática
    if (!(this.opcoes.v >= 2)) {
      if (Number(this.opcoes.kbps) === 6000) this.opcoes.kbps = 0;
      this.opcoes.v = 2;
      this.guardarOpcoes();
    }
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
          if (this.noAr) {
            this.aoCair?.();
            this.terminar('a ponte do PS5 fechou');
          }
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
        this.paramos = false;
        // a sessão continuou na ponte enquanto a página recarregava (ela repete o "conectado", os
        // cabeçalhos e pede um quadro inteiro): sem a fonte, a imagem não tinha para onde ir e o PS5
        // ficava ligado fora da sala. A fonte nasce aqui e a tela volta para a sala sem perguntar.
        if (!this.fonte) {
          this.fonte = new Ps5Fonte({ pedirChave: () => this.mandar({ tipo: 'chave' }), onEvento: this.onEvento, hevc: m.codec === 'h265' });
          this.retomada = true;
          this.onEvento?.('ps5 direto: sessão retomada (a página recarregou)', m);
        }
        // a ponte só pede H.265 a um PS5: a fonte segue o que ficou combinado
        if (this.fonte && this.fonte.hevc !== (m.codec === 'h265')) this.fonte.hevc = m.codec === 'h265';
        // a banda da sessão (fixa enquanto ela durar): o turbo só repassa os quadros do PS5 para quem tem
        // rede para ela; para os outros, codifica de novo (TurboEnvio.ligarSessao, vigiarRepasse)
        if (this.fonte) this.fonte.kbps = Number(m.kbps) || null;
        this.fase = 'jogando';
        this.onEvento?.('ps5 direto: conectado', m);
        this.porNaSala();
        break;
      case 'som':
        this.fonte?.somCabecalho({ hz: m.hz, canais: m.canais });
        this.onEvento?.('ps5 direto: som', m);
        break;
      case 'tremor':
        // h: veio da vibração háptica do DualSense (a ponte converte em força dos motores)
        this.onTremor?.(Number(m.g) || 0, Number(m.p) || 0, !!m.h);
        break;
      case 'gatilhos':
        // gatilhos adaptativos: o modo e os 10 parâmetros de cada um, em hexadecimal
        this.onGatilhos?.(Ps5Nativo.bytesGatilho(m.e), Ps5Nativo.bytesGatilho(m.d));
        break;
      case 'pin':
        this.pedirPinDeLogin(!!m.errado);
        break;
      case 'saiu': {
        this.onEvento?.('ps5 direto: saiu', m);
        // sem erro: o PS5 foi desligado ou posto em repouso (voltar sozinho o ligaria de novo)
        if (m.erro) this.aoCair?.();
        else if (!this.paramos) this.aoParar?.();
        this.paramos = false; // o fim que a própria página pediu já foi tratado em quem pediu
        if (m.erro) this.toast?.(`PS5: ${this.motivo(m)}`, 'error', 9000);
        this.terminar(null);
        break;
      }
      case 'aviso': {
        // Erros da biblioteca: no console na hora; no relatório, juntos a cada 30 s (quadro corrompido
        // vem às centenas e empurrava o resto dos 300 eventos para fora)
        if (m.nivel === 'E') console.warn('[ps5]', m.texto);
        // imagem que se perdeu entre o PS5 e este PC: quem joga longe não põe essas travadas na conta da conexão
        if (/corrupt|Missing (unit|reference)|FEC failed|Failed to complete frame|could not flush|Takion dropping/i.test(m.texto)) this.danos = (this.danos || 0) + 1;
        const tipo = String(m.texto).replace(/[0-9]+/g, '#').slice(0, 80);
        this.avisos ??= new Map();
        this.avisos.set(tipo, (this.avisos.get(tipo) || 0) + 1);
        if (!this.avisosTimer) {
          this.avisosTimer = setTimeout(() => {
            this.avisosTimer = 0;
            const lista = [...this.avisos].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${n}x ${t}`);
            this.avisos.clear();
            this.onEvento?.('ps5 direto: avisos (30 s)', { avisos: lista });
          }, 30_000);
        }
        break;
      }
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
    const altura = alturaValida(this.opcoes.altura);
    const qps = Number(this.opcoes.qps) === 30 ? 30 : 60;
    const kbps = Number(this.opcoes.kbps) >= 2000 ? Number(this.opcoes.kbps) : bandaDaImagem(altura);
    const pedido = this.opcoes.codec === 'h264' ? 'h264' : this.opcoes.codec === 'h265' ? 'h265' : ((await decodificaHevc()) ? 'h265' : 'h264');
    const codec = pedido === 'h265' && !(await decodificaHevc()) ? 'h264' : pedido; // sem decodificador aqui, não dá
    // a fonte nasce antes: o cabeçalho do vídeo chega logo depois do "conectado"
    this.fonte?.parar();
    this.fonte = new Ps5Fonte({ pedirChave: () => this.mandar({ tipo: 'chave' }), onEvento: this.onEvento, hevc: codec === 'h265' });
    this.fase = 'procurando';
    this.onEvento?.('ps5 direto: pedido', { altura, qps, kbps, codec });
    this.mandar({ tipo: 'conectar', id, altura, qps, kbps, codec });
    this.render();
  }

  async porNaSala() {
    if (!this.fonte || this.key) return;
    const fonte = this.fonte;
    let key;
    try {
      key = await this.compartilhar(fonte);
    } finally {
      this.retomada = false;
    }
    // a sessão foi trocada enquanto a tela entrava na sala: essa tela sai (sobrava na sala)
    if (this.fonte !== fonte) { if (key) this.pararTela?.(key); return; }
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
    this.paramos = true;
    this.mandar({ tipo: 'parar' });
    this.terminar(null);
  }

  dormir() {
    this.aoParar?.();
    this.mandar({ tipo: 'dormir' });
  }

  // a tela do PS5 saiu da sala pelo X: a sessão para junto
  telaSaiu(key) {
    if (key !== this.key) return;
    this.key = null;
    this.aoParar?.();
    this.parar();
  }

  pedirPinDeLogin(errado) {
    const pin = prompt(errado ? 'PIN errado. O PIN de acesso do PS5 (o do usuário):' : 'O PS5 pede o PIN de acesso do usuário:');
    if (pin) this.mandar({ tipo: 'pin', pin: pin.replace(/\D/g, '') });
    else {
      this.aoParar?.();
      this.parar();
    }
  }

  // ---------------------------------------------------------------- o controle de quem joga
  // ev: { t: 'pad', b, lx, ly, rx, ry, lt, rt, tp?, m? } (já validado em controle.js)
  pad(ev, livre = false) {
    this.ultimoPad = performance.now();
    const tp = Array.isArray(ev.tp) && ev.tp.length === 4 ? ev.tp : [-1, -1, -1, -1];
    const m = Array.isArray(ev.m) && ev.m.length === 10 ? ev.m : null;
    this.padSolto = !ev.b && !ev.lx && !ev.ly && !ev.rx && !ev.ry && !ev.lt && !ev.rt && tp[0] < 0 && tp[2] < 0 && !m;
    // os dedos no touchpad vão em números soltos (a ponte lê campo a campo): -1 é sem dedo
    let b = ev.b;
    if (!livre && this.opcoes.psTravado) b &= ~BIT_PS;
    if (!livre && this.opcoes.menuTravado) b &= ~(BIT_CREATE | BIT_OPTIONS);
    const msg = { tipo: 'pad', b, lx: ev.lx, ly: ev.ly, rx: ev.rx, ry: ev.ry, lt: ev.lt, rt: ev.rt, t0x: tp[0], t0y: tp[1], t1x: tp[2], t1y: tp[3] };
    // o movimento também (ponte 1.1+): giroscópio, acelerômetro e orientação; sem ele, deitado e parado
    if (m) [msg.gx, msg.gy, msg.gz, msg.ax, msg.ay, msg.az, msg.ox, msg.oy, msg.oz, msg.ow] = m;
    this.ultimaMsgPad = msg;
    this.mandar(msg);
  }

  // um botão apertado daqui (vale mesmo travado): um toque curto por cima do que quem joga segura
  apertarPs(bit = BIT_PS) {
    const base = this.ultimaMsgPad || { tipo: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    this.mandar({ ...base, b: base.b | bit });
    setTimeout(() => this.mandar(this.ultimaMsgPad || { ...base, b: base.b & ~bit }), 150);
  }

  // o "estou aqui" do modo jogo
  vivo() {
    this.ultimoPad = performance.now();
  }

  // quem jogava sumiu (a conexão caiu) com um botão apertado: solta tudo
  vigiarPad() {
    if (!this.noAr || this.padSolto || performance.now() - this.ultimoPad < PAD_SOLTA_MS) return;
    this.padSolto = true;
    this.ultimaMsgPad = { tipo: 'pad', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    this.mandar(this.ultimaMsgPad);
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
        <div class="p5-cab"><span class="p5-selo">${icon('console', 22)}</span>
          <div><h2 id="p5-titulo">PS5 direto</h2><small>Remote Play na sala, sem o chiaki-ng</small></div></div>
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
      else if (acao === 'parar') { this.aoParar?.(); this.parar(); }
      else if (acao === 'dormir') this.dormir();
      else if (acao === 'procurar') { this.procurando = true; this.mandar({ tipo: 'descobrir' }); this.render(); }
      else if (acao === 'importar') this.mandar({ tipo: 'importar' });
      else if (acao === 'esquecer' && confirm('Esquecer este PS5 aqui? Para usar de novo, registre outra vez (ou traga do chiaki-ng).')) this.mandar({ tipo: 'esquecer', id });
      else if (acao === 'usar-ip') { const ip = this.raiz.querySelector('[name="p5-ip"]'); if (ip) ip.value = b.dataset.ip; }
      else if (acao === 'registrar') this.registrar();
      else if (acao === 'tentar') this.abrir();
      else if (acao === 'ls-jogar') { this.fechar(); this.jogarComLossless?.(this.key); }
      else if (acao === 'dublagem') { this.dublagem?.alternar(); this.render(); }
      else if (acao === 'som-pc') Promise.resolve(this.somPc?.alternar()).finally(() => this.render());
      else if (acao === 'som-pc-abafar') { this.somPc?.alternarAbafar(); this.render(); }
      else if (acao === 'ps-travar') { this.opcoes.psTravado = !this.opcoes.psTravado; this.guardarOpcoes(); this.render(); }
      else if (acao === 'ps-apertar') this.apertarPs();
      else if (acao === 'menu-travar') { this.opcoes.menuTravado = !this.opcoes.menuTravado; this.guardarOpcoes(); this.render(); }
      else if (acao === 'create-apertar') this.apertarPs(BIT_CREATE);
      else if (acao === 'options-apertar') this.apertarPs(BIT_OPTIONS);
      else if (acao === 'ls-todos') Promise.resolve(this.losslessTodos?.alternar()).finally(() => this.render());
    });
    // o volume muda enquanto arrasta (sem desenhar a janela de novo, que soltaria o controle)
    this.raiz.addEventListener('pointerdown', (e) => {
      if (e.target.name === 'p5-volume') this.arrastandoVolume = true;
    });
    addEventListener('pointerup', () => {
      if (!this.arrastandoVolume) return;
      this.arrastandoVolume = false;
      if (this.renderDepois) { this.renderDepois = false; this.render(); }
    });
    this.raiz.addEventListener('input', (e) => {
      if (e.target.name !== 'p5-volume') return;
      this.volume?.set(e.target.value);
      const saida = e.target.parentElement.querySelector('output');
      if (saida) saida.textContent = `${this.volume?.get() ?? e.target.value}%`;
    });
    this.raiz.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'p5-altura') {
        const [altura, qps] = String(e.target.value).split('-').map(Number);
        this.opcoes.altura = alturaValida(altura);
        this.opcoes.qps = qps === 30 ? 30 : 60;
      }
      else if (n === 'p5-kbps') this.opcoes.kbps = Number(e.target.value) ? Math.min(50000, Math.max(2000, Number(e.target.value))) : 0;
      else if (n === 'p5-codec') this.opcoes.codec = ['h264', 'h265'].includes(e.target.value) ? e.target.value : 'auto';
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
    // arrastando o volume: desenhar de novo soltaria o controle da mão — fica para quando soltar
    if (this.arrastandoVolume) { this.renderDepois = true; return; }
    const corpo = this.raiz.querySelector('.p5-corpo');
    if (!temPs5Nativo()) {
      corpo.innerHTML = `<div class="p5-aviso">${icon('help', 16)}<span>Este navegador não decodifica vídeo pela página (WebCodecs). Use o Chrome ou o Edge no PC do PS5.</span></div>`;
      return;
    }
    if (!this.ws) {
      corpo.innerHTML = `<div class="p5-vazio">${icon(this.erro ? 'help' : 'sync', 22)}<span>${this.erro ? esc(this.erro) : 'Abrindo a ponte do PS5…'}</span>
        ${this.erro ? '<button type="button" class="secondary small" data-p5="tentar">Tentar de novo</button>' : ''}</div>`;
      return;
    }
    const noAr = this.noAr || (this.fase && this.fase !== 'parado');
    const achado = (c) => this.achados?.find((a) => a.id && a.id.toUpperCase() === c.id.toUpperCase());
    const pilula = (txt, cor, vivo = false) => `<span class="p5-pilula${vivo ? ' vivo' : ''}" style="--c:${cor}">${txt}</span>`;
    const lista = this.consoles.map((c) => {
      const a = achado(c);
      const estado = !a ? (this.achados ? pilula('fora da rede', '#94a3b8') : '')
        : a.estado === 'pronto' ? pilula('ligado', '#4ade80')
          : a.estado === 'dormindo' ? pilula('em repouso', '#fbbf24') : pilula(esc(a.estado), '#94a3b8');
      const meta = [esc(a?.ip || c.ip || 'IP ainda não visto'), a?.estado === 'pronto' && a.app ? esc(a.app) : '', a?.estado === 'dormindo' ? 'acorda sozinho' : ''].filter(Boolean).join(' · ');
      return `<div class="p5-item">
        <span class="p5-ic">${icon('console', 20)}</span>
        <span><b>${esc(c.nome)}</b>${estado}<small>${meta}</small></span>
        <span class="p5-acoes">
          <button type="button" class="primary small" data-p5="jogar" data-id="${esc(c.id)}"${noAr ? ' disabled' : ''}>${icon('play', 14)} Jogar</button>
          <button type="button" class="secondary small" data-p5="esquecer" data-id="${esc(c.id)}"${noAr ? ' disabled' : ''} title="Esquecer este PS5">${icon('lixo', 14)}</button>
        </span>
      </div>`;
    }).join('');
    const novos = (this.achados || []).filter((a) => a.ps5 && !a.registrado);
    const fase = FASES[this.fase] ?? this.fase;
    const c = this.conectado;
    const extras = [];
    if (noAr && this.key && this.volume) {
      const v = this.volume.get();
      extras.push(`<div class="p5-item p5-vol"><span class="p5-ic">${icon('volume', 18)}</span>
        <span><b>Volume do PS5</b><small>Só o que você ouve neste PC. Quem joga ouve no volume das telas dele.</small>
          <span class="p5-vol-linha"><input type="range" name="p5-volume" min="0" max="100" step="1" value="${v}" aria-label="Volume do PS5"><output>${v}%</output></span></span></div>`);
    }
    const dub = this.dublagem;
    if (noAr && this.key && dub) {
      const on = dub.ligada();
      const est = dub.estado();
      const pil = est === 'ligado' ? pilula('ligada', '#4ade80', true) : est === 'abrindo' ? pilula('abrindo', '#fbbf24') : est === 'erro' ? pilula('erro', '#f87171') : '';
      const resumo = dub.resumo();
      const f = on ? dub.ultimaFala() : null;
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('mic', 18)}</span>
        <span><b>Dublagem (Voz Universal)</b>${pil}
        <small>${resumo ? `<b>${esc(resumo)}</b><br>` : ''}${f?.texto ? `“${esc(f.texto.slice(0, 90))}”${f.quem ? ` — ${esc(f.quem)}` : ''}<br>` : ''}Lê as legendas direto da imagem do PS5 (não precisa deixar a tela à vista) e fala em português. Quem joga ouve a voz junto com o PS5. Fica ligada para as próximas vezes.</small></span>
        <span class="p5-acoes"><button type="button" class="${on ? 'secondary' : 'primary'} small" data-p5="dublagem">${on ? 'Desligar' : est === 'erro' ? 'Tentar de novo' : 'Ligar'}</button></span></div>`);
    }
    if (noAr && this.key && this.somPc && !(dub && dub.ligada())) {
      const on = this.somPc.ligado();
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('volume', 18)}</span>
        <span><b>Som do PC (Voz Universal)</b>${on ? pilula('ligado', '#4ade80') : ''}
        <small>Mistura no som do PS5 tudo o que toca no PC fora do Chrome e manda na mesma tela. No seletor, escolha <b>Tela inteira</b> e marque <b>Compartilhar áudio do sistema</b>. Feche o Spotify, o Discord e o que mais não deve ir junto.</small></span>
        <span class="p5-acoes">${on ? `<button type="button" class="secondary small" data-p5="som-pc-abafar" title="Enquanto a voz fala, o PS5 abaixa para quem recebe (como o abafar do Voz Universal faz aqui)">${this.somPc.abafar() ? 'Abaixar na voz: sim' : 'Abaixar na voz: não'}</button>` : ''}<button type="button" class="${on ? 'secondary' : 'primary'} small" data-p5="som-pc">${on ? 'Parar' : 'Levar o som'}</button></span></div>`);
    }
    if (noAr && this.key) {
      const on = this.opcoes.psTravado;
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('console', 18)}</span>
        <span><b>Botão PS travado</b>${on ? pilula('ligado', '#4ade80') : ''}
        <small>O PS do controle e o H do teclado de quem joga não chegam ao PS5: ninguém sai do jogo para o menu. Daqui, o "Apertar PS" ainda funciona.</small></span>
        <span class="p5-acoes"><button type="button" class="secondary small" data-p5="ps-apertar"${c ? '' : ' disabled'}>Apertar PS</button><button type="button" class="${on ? 'secondary' : 'primary'} small" data-p5="ps-travar">${on ? 'Destravar' : 'Travar'}</button></span></div>`);
      const menu = this.opcoes.menuTravado;
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('console', 18)}</span>
        <span><b>Create e Options travados</b>${menu ? pilula('ligado', '#4ade80') : ''}
        <small>O Create e o Options de quem joga (controle, teclado ou toque) não chegam ao PS5: ninguém pausa, abre o menu do jogo nem captura. Daqui, os botões abaixo ainda funcionam.</small></span>
        <span class="p5-acoes"><button type="button" class="secondary small" data-p5="create-apertar"${c ? '' : ' disabled'}>Apertar Create</button><button type="button" class="secondary small" data-p5="options-apertar"${c ? '' : ' disabled'}>Apertar Options</button><button type="button" class="${menu ? 'secondary' : 'primary'} small" data-p5="menu-travar">${menu ? 'Destravar' : 'Travar'}</button></span></div>`);
    }
    if (noAr && this.key && this.losslessTodos) {
      const on = this.losslessTodos.ligado();
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('monitores', 18)}</span>
        <span><b>Lossless para todos</b>${on ? pilula('ligado', '#4ade80') : ''}
        <small>Ponha o PS5 a 30 qps: o Lossless deste PC dobra para 60 e todo mundo recebe pelo OBS. A janela do PS5 vai para o outro monitor e o Lossless segue nela mesmo com você usando a sala (modo de vários monitores dele, ligado sozinho). Precisa do OBS com o WebSocket ligado e do Lossless aberto.</small></span>
        <span class="p5-acoes"><button type="button" class="${on ? 'secondary' : 'primary'} small" data-p5="ls-todos">${on ? 'Voltar à imagem direta' : 'Ligar'}</button></span></div>`);
    }
    if (noAr && this.key && this.jogarComLossless) {
      extras.push(`<div class="p5-item"><span class="p5-ic">${icon('maximize', 18)}</span>
        <span><b>Jogar com o Lossless (só neste PC)</b>
        <small>Abre o PS5 em tela cheia no modo jogo e liga o Lossless Scaling nele, só para você. Ctrl+Alt+S liga e desliga.</small></span>
        <span class="p5-acoes"><button type="button" class="secondary small" data-p5="ls-jogar">Jogar</button></span></div>`);
    }
    const resolucao = c ? `${this.fonte?.cfg ? `${this.fonte.cfg.w}×${this.fonte.cfg.h}` : `${c.largura}×${c.altura}`} · ${c.qps} qps · ${Math.round(c.kbps / 100) / 10} Mbps · ${c.codec === 'h265' ? 'H.265' : 'H.264'}${this.fonte?.cfg && (this.fonte.cfg.w < c.largura || this.fonte.cfg.h < c.altura) ? ` <span class="p5-fase">(pedido ${c.largura}×${c.altura}: o PS5 mandou menos)</span>` : ''}` : '';
    corpo.innerHTML = `
      ${noAr ? `<section class="p5-sec"><h3>Agora</h3>
        <div class="p5-item ar"><span class="p5-ic">${icon('console', 20)}</span>
          <span><b>PS5</b>${pilula(esc(fase || 'no ar'), this.fase === 'jogando' ? '#4ade80' : '#60a5fa', true)}${resolucao ? `<small>${resolucao}</small>` : ''}</span>
          <span class="p5-acoes"><button type="button" class="secondary small" data-p5="dormir"${c ? '' : ' disabled'}>Pôr em repouso</button><button type="button" class="primary small p5-parar" data-p5="parar">${icon('stop', 14)} Parar</button></span></div>
        ${extras.join('')}</section>` : `<div class="p5-aviso">${icon('help', 16)}<span>A imagem que o PS5 faz vai direto para quem joga, e o controle de quem joga chega nele como um controle de PS5 (sem o ViGEmBus). <b>Feche o chiaki-ng antes:</b> o PS5 só aceita um Remote Play por vez.</span></div>`}
      <section class="p5-sec"><h3>Consoles</h3>
        <div class="p5-lista">${lista || `<div class="p5-vazio">${icon('console', 24)}<span>Nenhum PS5 registrado aqui ainda. Se o chiaki-ng já joga neste PC, é só trazer o registro dele.</span></div>`}</div>
        ${novos.length ? `<p class="p5-dica">Na rede, sem registro: ${novos.map((a) => `<button type="button" class="secondary small" data-p5="usar-ip" data-ip="${esc(a.ip)}">${esc(a.nome || a.ip)} (${esc(a.ip)})</button>`).join(' ')}</p>` : ''}
        <div class="p5-linha">
          <button type="button" class="secondary small" data-p5="procurar"${this.procurando ? ' disabled' : ''}>${icon('sync', 14)} ${this.procurando ? 'Procurando…' : 'Procurar na rede'}</button>
          <button type="button" class="secondary small" data-p5="importar">${icon('baixar', 14)} Trazer do chiaki-ng</button>
        </div>
      </section>
      <section class="p5-sec"><h3>Imagem</h3>
        <div class="p5-campos">
          <label>Resolução <select name="p5-altura">
            ${IMAGENS.map(([a, q]) => `<option value="${a}-${q}"${alturaValida(this.opcoes.altura) === a && (Number(this.opcoes.qps) === 30 ? 30 : 60) === q ? ' selected' : ''}>${NOME_IMAGEM[a]} · ${q} qps</option>`).join('')}
          </select></label>
          <label>Banda (kbps) <input name="p5-kbps" type="number" min="2000" max="50000" step="1000" value="${Number(this.opcoes.kbps) >= 2000 ? Number(this.opcoes.kbps) : ''}" placeholder="auto ${bandaDaImagem(alturaValida(this.opcoes.altura))}"></label>
          <label>Codec <select name="p5-codec">
            ${[['auto', 'Automático'], ['h265', 'H.265 (melhor imagem)'], ['h264', 'H.264 (mais compatível)']].map(([v, n]) => `<option value="${v}"${(this.opcoes.codec || 'auto') === v ? ' selected' : ''}>${n}</option>`).join('')}
          </select></label>
        </div>
      </section>
      <details${this.consoles.length ? '' : ' open'}>
        <summary>${icon('mais', 16)} Registrar um PS5 <span class="p5-seta">${icon('chevron', 16)}</span></summary>
        <div class="p5-registro">
          <p class="p5-dica">No PS5: Configurações → Sistema → Remote Play → <b>Vincular dispositivo</b> (mostra o PIN de 8 números). O ID da conta PSN é o mesmo que o chiaki-ng pede (8 bytes em base64, termina em “=”).</p>
          <div class="p5-campos">
            <label>IP do PS5 <input name="p5-ip" placeholder="192.168.0.20"></label>
            <label>ID da conta PSN <input name="p5-conta" placeholder="AbCdEfGhIjk="></label>
            <label>PIN <input name="p5-pin" inputmode="numeric" maxlength="9" placeholder="12345678"></label>
            <button type="button" class="primary small" data-p5="registrar"${this.registrando ? ' disabled' : ''}>${this.registrando ? 'Registrando…' : 'Registrar'}</button>
          </div>
        </div>
      </details>`;
  }
}
