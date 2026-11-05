// Modo turbo (experimental): a imagem do jogo sem o buffer do navegador.
//
// No vídeo normal da conexão, o navegador de quem joga guarda quadros antes de mostrar (o jitter
// buffer: 80–140 ms no iPhone, medido nos relatórios) para a imagem não engasgar. Para jogar, isso é
// atraso puro. No turbo a imagem vai por fora:
//   quem compartilha: a trilha da tela → MediaStreamTrackProcessor (cada quadro) → VideoEncoder
//     (H.264 na placa, modo "realtime") → pedaços de PEDACO bytes no canal "turbo" da conexão;
//   quem joga: junta os pedaços → VideoDecoder (optimizeForLatency) → desenha no <canvas> por cima
//     do vídeo assim que sai do decodificador. Nenhum quadro espera.
// O vídeo da conexão para essa pessoa fica desligado enquanto o turbo funciona (rtc.turboPara): não
// disputa a banda do Wi-Fi.
// O som também vai por fora (2026-11-03): no WebRTC ele tinha o buffer do navegador e chegava depois
// da imagem do turbo, que não espera nada. Quem compartilha: a trilha de som da tela →
// MediaStreamTrackProcessor → AudioEncoder (Opus, quadros de SOM_QUADRO_US) → canal "turbo-som", sem
// ordem e com vida curta (um pacote de som não espera atrás de um pedaço de imagem nem de outro
// perdido). Quem joga: AudioDecoder → AudioWorklet (SOM_WORKLET) com um buffer curto que cresce só
// quando falta som. O som do WebRTC continua vindo (é a reserva) e só fica calado enquanto o do
// turbo está tocando de verdade (TurboRecebe.vigiarSom).
//
// Canal "turbo" (quem joga abre, rtc.abrirTurbo): ordenado e com vida curta (TTL_MS) — um pedaço
// perdido no Wi-Fi é reenviado se ainda der tempo; se não der, o quadro se perde, quem joga para de
// decodificar até um quadro-chave novo e o pede ({chave:true}). Assim um engasgo vira uma imagem
// parada por um instante, e não atraso acumulado.
// A vida era 90 ms. Nos relatórios de 2026-11-05 (PC no Wi-Fi por um adaptador USB) o caminho parava
// de 100 a 350 ms de vez em quando: os pedaços venciam, o quadro se perdia e a imagem ficava parada
// de 170 a 820 ms (a travada + o pedido + o quadro-chave, que é grande). Com 250 ms a travada curta
// vira só atraso: os quadros chegam juntos depois, e o liso mostra o mais novo e alcança a hora.
// A vida vai na abertura do canal (TurboRecebe.vidaMs: os presets de teste trocam).
// Mensagens de texto (JSON): quem joga → {ligar: key, codecs, altura, versao}, {chave: true, desde},
// {desligar: true}, {ping: t} (a cada PING_MS; volta {pong: t, t: agora lá}: a ida e volta do próprio
// canal e a diferença entre os relógios dos dois aparelhos), {fila: {p90, base}} (a cada FILA_AVISO_MS:
// a viagem medida, ver ajustarBanda); quem compartilha → {cfg: {codec, w, h, description}}, {erro}. O
// H.264 vai no formato "avc" (tamanho na frente de cada NAL) com a descrição (avcC) que o codificador
// entrega: é o que todo VideoDecoder aceita (o Safari inclusive), sem depender do Annex B. Binário:
// cabeçalho (CAB bytes; CAB2 com a versao 2) + pedaço do quadro.
//
// O atraso que dá para tirar daqui (relatório de 2026-11-01, PC no Wi-Fi → iPhone): a fila de envio do
// canal ficava em 10–30 KB e chegava a 107 KB — a 6 Mbps, 15 a 140 ms de imagem esperando a vez, que a
// estimativa nem via (ela usava metade do ping). Por isso:
//   - a banda do codificador segue a fila que quem joga MEDE (ajustarBanda): a viagem de cada quadro
//     (fila + rede) menos a menor vista é o tempo de fila de verdade; crescendo, a banda desce; com
//     folga, volta. A 1ª versão (2026-11-02) media a fila pelo bufferedAmount aqui e errou feio no
//     Chrome de verdade: ele não desce aos poucos, atualiza aos trancos e atrasado — deu "caminho" de
//     2–4 Mbps num Wi-Fi que levava 9, esperas de segundos, um terço dos quadros pulados e a banda no
//     piso (relatório de 2026-11-03 02:10), com a viagem medida do outro lado em ~13 ms. Aqui o
//     bufferedAmount só serve de trava (FILA_QUADROS quadros na banda cheia);
//   - taxa constante (bitrateMode 'constant'): na NVIDIA, em 720p a 6 Mbps, a taxa variável dava
//     quadros de 15,7 KB em média (acima do alvo) e quadro-chave de 46 KB; a constante, 12,5 KB e
//     quadro-chave de 15 KB. Quadro grande é fila;
//   - sem quadro-chave de segurança a cada 5 s (era um pico na fila a cada 5 s): o canal é ordenado e
//     quem joga percebe quadro perdido e pede um;
//   - medida de verdade (versao 2): cada quadro leva a hora em que saiu da captura (relógio de quem
//     compartilha), e quem joga, com a diferença dos relógios pelo ping, mede quanto ele levou até
//     ser desenhado (pontaMs) e quanto ficou na fila + rede (viagemMs).

import { Ritmo } from './ritmo.js';

const PEDACO = 15000; // bytes de quadro por mensagem (abaixo do limite de 16 KB de qualquer navegador)
const CAB = 20; // id do quadro (u32), pedaço (u16), total (u16), chave (u8), versão (u8: 0 ou 2), ms codificando ×10 (u16), tempo em µs (f64)
const CAB2 = 28; // versão 2: + saiu da captura (f64, ms no relógio de quem compartilha)
const VERSAO = 2;
export const TTL_MS = 250; // vida de cada pedaço no canal (era 90; ver o cabeçalho)
// Trava da fila de envio: com mais que tantos quadros da banda cheia esperando, o próximo é pulado.
// Só trava: o bufferedAmount do Chrome atualiza aos trancos (ver o cabeçalho); quem manda na banda é
// a fila medida do outro lado. Uma trava pela banda de agora e pelo TTL_MS (2/3 dele: 1080p de 75 a
// 45 KB) foi testada em 2026-11-03 no Wi-Fi simulado e não serviu: os pedaços vencidos eram os das
// travadas do Wi-Fi (nenhuma trava evita) e só sobravam mais quadros pulados.
const FILA_QUADROS = 4;
const FILA_MIN = 48 * 1024;
const FILA_AVISO_MS = 500; // de quanto em quanto quem joga conta a viagem medida (ajustarBanda)
const FILA_ALTA = 30; // ms de fila (viagem p90 − a menor) que fazem a banda descer...
// ...e abaixo disso, ela pode subir. Era 12: no Wi-Fi de casa a fila fica em ~17–25 ms mesmo com a
// banda cheia (relatório de 2026-11-03 02:24), e depois de um aperto no começo a banda ficou em 6,1 de
// 10 Mbps até o fim.
const FILA_BAIXA = 24;
const BANDA_MIN = 0.6; // a banda desce até 60% da do tamanho, no máximo
const PEDIR_CHAVE_MS = 250; // intervalo mínimo entre pedidos de quadro-chave
// Um quadro-chave que saiu há menos que isto e que quem joga ainda não viu está a caminho: outro
// pedido por ele é ignorado (ver TurboEnvio.pedidoDeChave). Nos picos do Wi-Fi a viagem chegou a 250 ms.
const CHAVE_A_CAMINHO_MS = 400;
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
// A conexão não aguenta o turbo: volta ao vídeo normal (que baixa a resolução sozinho). No relatório de
// 2026-11-04 13:16 a conexão ia pelo servidor TURN (160 ms de ida e volta, contra 15 ms na direta): o
// canal não levava nem os 6 Mbps do piso da banda em 1080p, a fila foi a 3,4 s e a imagem ficou parada
// (0 qps) por 25 s sem o turbo desistir. O vídeo normal, no mesmo caminho, deu 27 qps em 720p.
const PAROU_MS = 2500; // já desenhou, e nenhum quadro novo há tanto tempo
const FILA_LENTA = 600; // ms de fila medida (viagem p90 − a menor)...
const FILA_LENTA_MS = 3000; // ...seguidos por tanto tempo

// H.264 nos perfis High, Main e Baseline (nível 5.1: até 1080p acima de 60 qps). Quem joga diz quais
// decodifica; quem compartilha escolhe o primeiro que a placa dele codifica.
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'avc1.42001f'];

const QPS_TURBO = 60;

// Turbo liso (2026-11-04): sem buffer nenhum, cada quadro ia para a tela na hora em que saía do
// decodificador. No Wi-Fi eles chegam com 10–30 ms de diferença entre si (relatório de 2026-11-04
// 23:51: viagem p90 − mediana ~15 ms), e na tela de 60 Hz isso vira quadro repetido seguido de quadro
// que nunca aparece: o vídeo normal, com 80–300 ms de buffer, parecia mais liso. Com o liso, cada
// quadro tem a hora certa de aparecer: a hora em que saiu da captura lá (o timestamp, em µs) + a
// diferença mínima vista (o caminho mais rápido) + uma folga (alvo) do tamanho do tremido medido —
// o p95 de quanto cada quadro chegou atrasado em relação ao mais rápido, entre LISO_MIN e LISO_MAX. A
// cada volta da tela (requestAnimationFrame) vai um quadro, o mais velho cuja hora chegou (ver volta).
// A folga sobe na hora e desce devagar. O que um quadro-chave atrasa (perda) não entra na conta:
// viraria folga à toa. Simulado com o tremido dos relatórios (captura a 55 qps, tela de 60 Hz): os
// quadros que nunca apareciam caíram de ~360 para ~25 por minuto e os trancos de 3 voltas pela
// metade, com ~27 ms a mais de atraso.
const LISO_PCT = 0.95; // o tremido que a folga cobre
const LISO_MIN = 4;
const LISO_MAX = 45;
const LISO_INICIO = 16;
const LISO_ATRAS = 2; // quadros na hora ao mesmo tempo antes de pular um para alcançar (ver volta)
const LISO_ALCANCAR = 8; // quadros seguidos mostrados uma volta atrasados antes de pular um para alcançar
const LISO_FILA = 5; // quadros decodificados esperando a vez, no máximo (o decodificador do iPhone tem poucos)
// caixa-preta: os últimos quadros, um por um (vai no relatório quando quem joga marca "engasgou")
const CAIXA = 240;
const CAIXA_MS = 3000;
export const temTurboEnvio = () => typeof MediaStreamTrackProcessor === 'function' && typeof VideoEncoder === 'function';
export const temTurboRecebe = () => typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';

// ------------------------------------------------------------------ som
const SOM_QUADRO_US = 10_000; // 10 ms de som por pacote (o Opus aceita de 2,5 a 60)
// seq (u32), amostras/s (u32), canais (u8), livre (3), tempo em µs (f64), saiu do codificador (f64, relógio de lá)
const SOM_CAB = 28;
const SOM_FILA_MAX = 16 * 1024; // som esperando mais que isto no canal: o pacote novo fica de fora
const SOM_PARADO_MS = 600; // sem pacote de som há tanto tempo: o som do WebRTC volta
const temSomEnvio = () => typeof MediaStreamTrackProcessor === 'function' && typeof AudioEncoder === 'function';
const temSomRecebe = () => typeof AudioDecoder === 'function' && typeof EncodedAudioChunk === 'function'
  && typeof AudioWorkletNode === 'function' && typeof (window.AudioContext || window.webkitAudioContext) === 'function';

// O tocador de quem joga (roda no fio de áudio): um anel com o som que chegou e a leitura começando
// quando há `alvo` guardado. Faltou som (o Wi-Fi segurou): silêncio, enche de novo e o alvo cresce
// 10 ms (até 120). 10 s sem faltar: diminui 5 ms (até 20). Fora do alvo, a leitura anda até 1% mais
// rápida ou mais lenta (não se ouve) e acompanha a diferença entre os relógios dos dois aparelhos;
// muito acima dele (60 ms a mais), pula direto para o alvo. Também converte a taxa de amostras
// (o iPhone pode não abrir o AudioContext a 48 kHz).
const SOM_WORKLET = `
class TurboSom extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = 1 << 16;
    this.b = [new Float32Array(this.cap), new Float32Array(this.cap)];
    this.w = 0;
    this.r = 0;
    this.hz = sampleRate;
    this.alvo = 0.03;
    this.enchendo = true;
    this.faltas = 0;
    this.descartes = 0;
    this.semFalta = 0;
    this.aviso = 0;
    this.port.onmessage = (e) => this.chegou(e.data);
  }
  chegou({ canais, hz }) {
    this.hz = hz;
    const n = canais[0].length;
    const m = this.cap - 1;
    if (this.w - this.r + n > m - 256) { this.r = this.w - this.alvo * hz; this.descartes++; }
    const a = canais[0];
    const b = canais[1] || a;
    for (let i = 0; i < n; i++) {
      const k = (this.w + i) & m;
      this.b[0][k] = a[i];
      this.b[1][k] = b[i];
    }
    this.w += n;
  }
  process(_, outputs) {
    const L = outputs[0][0];
    const R = outputs[0][1] || L;
    const n = L.length;
    const hz = this.hz;
    const alvo = this.alvo * hz;
    let tem = this.w - this.r;
    if (this.enchendo && tem >= alvo) this.enchendo = false;
    if (this.enchendo) {
      L.fill(0);
      R.fill(0);
    } else {
      if (tem > alvo + 0.06 * hz) { this.r = this.w - alvo; tem = alvo; this.descartes++; }
      let passo = hz / sampleRate;
      if (tem > alvo * 1.4 + 0.005 * hz) passo *= 1.01;
      else if (tem < alvo * 0.6) passo *= 0.99;
      const m = this.cap - 1;
      const [x, y] = this.b;
      for (let i = 0; i < n; i++) {
        if (this.w - this.r < 2) {
          for (; i < n; i++) { L[i] = 0; R[i] = 0; }
          this.faltas++;
          this.enchendo = true;
          this.semFalta = 0;
          this.alvo = Math.min(0.12, this.alvo + 0.01);
          break;
        }
        const p = Math.floor(this.r);
        const f = this.r - p;
        const i0 = p & m;
        const i1 = (p + 1) & m;
        L[i] = x[i0] + (x[i1] - x[i0]) * f;
        R[i] = y[i0] + (y[i1] - y[i0]) * f;
        this.r += passo;
      }
      this.semFalta += n;
      if (this.semFalta > sampleRate * 10 && this.alvo > 0.02) { this.alvo = Math.max(0.02, this.alvo - 0.005); this.semFalta = 0; }
    }
    if ((this.aviso += n) >= sampleRate / 4) {
      this.aviso = 0;
      this.port.postMessage({ nivelMs: ((this.w - this.r) / hz) * 1000, alvoMs: this.alvo * 1000, faltas: this.faltas, descartes: this.descartes, tocando: !this.enchendo });
    }
    return true;
  }
}
registerProcessor('turbo-som', TurboSom);
`;
let urlWorklet = null;

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
    this.canaisSom = new Map(); // id de quem joga -> canal "turbo-som"
  }

  // quem joga abriu o canal do som comigo (só pacotes de som, daqui para lá)
  receberSom(id, canal) {
    canal.binaryType = 'arraybuffer';
    this.canaisSom.set(id, canal);
    canal.onclose = () => { if (this.canaisSom.get(id) === canal) this.canaisSom.delete(id); };
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
      else if (m.chave) { const s = this.sessoes.get(id); if (s) this.pedidoDeChave(s, m.desde); }
      // t: a hora daqui, para quem joga acertar a diferença entre os relógios
      else if (m.ping != null) { try { canal.send(JSON.stringify({ pong: m.ping, t: performance.now() })); } catch { /* fechou */ } }
      // a fila medida do lado de lá (versão 2): é ela que manda na banda
      else if (m.fila && typeof m.fila === 'object') { const s = this.sessoes.get(id); if (s) this.ajustarBanda(s, m.fila); }
      else if (m.desligar) this.desligar(id);
    };
    canal.onclose = () => this.desligar(id, canal);
  }

  async ligar(id, canal, { ligar: key, codecs, altura, versao, som }) {
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
      cfgEnviada: null, ajuste: { altas: 0, baixas: 0, mudou: 0, ultima: null }, // ajustarBanda
      chaveId: 0, chaveEm: 0, // o último quadro-chave mandado (pedidoDeChave)
      tempos: new Map(), conta: { enviados: 0, bytes: 0, pulados: 0, fila: 0, cod: [], chaves: 0, chaveMax: 0, ignorados: 0, ultimo: performance.now() },
      // a fila de envio a cada 100 ms (a maior vista em cada um, em KB) e os pulados em cada um: mostra
      // se os pulos são picos curtos do Wi-Fi ou falta de banda o tempo todo; rajada: pulados em seguida
      serie: { fila: [], pulados: [] }, rajada: 0, maiorRajada: 0 };
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
    // quem joga toca o som do turbo (versão nova, com o canal "turbo-som"): o som da tela vai junto
    if (som) this.ligarSom(s, t.stream);
  }

  // ---------------------------------------------------------------- som
  ligarSom(s, stream) {
    const original = stream?.getAudioTracks()[0];
    if (!original || original.readyState !== 'live' || !temSomEnvio()) return;
    const som = { trilha: original.clone(), enc: null, cfg: null, seq: 0, conta: { enviados: 0, bytes: 0, pulados: 0 } };
    s.som = som;
    this.rodarSom(s, som).catch((err) => {
      console.warn('[turbo] som', err);
      this.pararSom(s, som);
    });
  }

  async rodarSom(s, som) {
    const leitor = new MediaStreamTrackProcessor({ track: som.trilha }).readable.getReader();
    som.leitor = leitor;
    while (!s.parar && s.som === som) {
      const { value: data, done } = await leitor.read();
      if (done || s.parar || s.som !== som) { data?.close(); break; }
      try {
        if (!som.enc) await this.configurarSom(s, som, data);
        // codificador atrasado (o Opus é rápido: só se o PC engasgar) — o pedaço fica de fora
        if (som.enc?.state === 'configured' && som.enc.encodeQueueSize < 4) som.enc.encode(data);
        else som.conta.pulados++;
      } finally {
        data.close();
      }
    }
  }

  async configurarSom(s, som, data) {
    const canais = Math.min(2, data.numberOfChannels);
    const base = { codec: 'opus', sampleRate: data.sampleRate, numberOfChannels: canais, bitrate: canais > 1 ? 128_000 : 96_000 };
    let cfg = null;
    for (const c of [{ ...base, opus: { frameDuration: SOM_QUADRO_US } }, base]) {
      const r = await AudioEncoder.isConfigSupported(c).catch(() => null);
      if (r?.supported) { cfg = c; break; }
    }
    if (!cfg) throw new Error('sem Opus');
    if (s.som !== som) return;
    som.enc = new AudioEncoder({
      output: (chunk) => this.enviarSom(s, som, chunk),
      error: (err) => { console.warn('[turbo] codificador de som', err); this.pararSom(s, som); },
    });
    som.enc.configure(cfg);
    som.cfg = cfg;
  }

  enviarSom(s, som, chunk) {
    const canal = this.canaisSom.get(s.id);
    if (s.som !== som || !canal || canal.readyState !== 'open') return;
    // som esperando na fila: mandar mais só atrasaria (o tocador de lá prefere uma falha curta)
    if (canal.bufferedAmount > SOM_FILA_MAX) { som.conta.pulados++; return; }
    const msg = new Uint8Array(SOM_CAB + chunk.byteLength);
    const v = new DataView(msg.buffer);
    som.seq = (som.seq + 1) >>> 0;
    v.setUint32(0, som.seq);
    v.setUint32(4, som.cfg.sampleRate);
    v.setUint8(8, som.cfg.numberOfChannels);
    v.setFloat64(12, chunk.timestamp);
    v.setFloat64(20, performance.now());
    chunk.copyTo(msg.subarray(SOM_CAB));
    try {
      canal.send(msg);
      som.conta.enviados++;
      som.conta.bytes += msg.length;
    } catch {
      som.conta.pulados++;
    }
  }

  pararSom(s, som = s.som) {
    if (!som) return;
    if (s.som === som) s.som = null;
    som.leitor?.cancel().catch(() => {});
    som.trilha.stop();
    try { if (som.enc && som.enc.state !== 'closed') som.enc.close(); } catch { /* já fechado */ }
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

  // A trava da fila de envio: FILA_QUADROS quadros da banda cheia (720p: ~50 KB; 1080p: ~83 KB)
  limiteFila(s) {
    return Math.max(FILA_MIN, (bandaDe(s.cfg?.h ?? 720) / 8 / 60) * FILA_QUADROS);
  }

  // Quem joga pediu um quadro-chave (perdeu um quadro). desde: o quadro mais novo de que chegou alguma
  // coisa lá. Se o último quadro-chave daqui é mais novo que isso e saiu há pouco, ele ainda está a
  // caminho: mandar outro só engrossaria a fila. Nos picos do Wi-Fi o quadro-chave levava mais que os
  // 250 ms entre um pedido e outro, e saíam dois ou três seguidos (relatório de 2026-11-03 16:13).
  // Quem joga numa versão antiga não manda o desde: aí vale sempre.
  pedidoDeChave(s, desde) {
    const d = Number(desde);
    if (Number.isFinite(d) && s.chaveId > d && performance.now() - s.chaveEm < CHAVE_A_CAMINHO_MS) {
      s.conta.ignorados++;
      return;
    }
    s.chave = true;
  }

  // Quem joga conta a cada FILA_AVISO_MS a viagem medida dos quadros (fila de envio + rede): o p90 e a
  // menor dos últimos ~10 s. A diferença é a fila de verdade (o erro entre os relógios some na conta).
  // Acima de FILA_ALTA em 2 avisos seguidos (1 s): a banda desce 15%, até BANDA_MIN da do tamanho;
  // abaixo de FILA_BAIXA em 4 avisos (2 s; os do meio não contam nem zeram): sobe 10%, até a do tamanho.
  // Quem joga deixa de fora da conta a fila que um quadro-chave causa (TurboRecebe.pedaco). Nos relatórios
  // de 2026-11-03 (Wi-Fi de casa, PS5 → iPhone) a fila assim dava ~10–27 ms com a banda cheia.
  // Trocar só a banda não gera quadro-chave nem descrição nova (medido na NVIDIA e no OpenH264).
  ajustarBanda(s, f) {
    const p90 = Number(f.p90);
    const base = Number(f.base);
    if (!Number.isFinite(p90) || !Number.isFinite(base)) return;
    const fila = Math.max(0, p90 - base);
    const a = s.ajuste;
    a.ultima = Math.round(fila * 10) / 10;
    a.altas = fila > FILA_ALTA ? a.altas + 1 : 0;
    // Entre FILA_BAIXA e FILA_ALTA a conta para subir fica onde está: zerar ali (como era) quase nunca
    // deixava juntar 4 seguidos — no relatório de 2026-11-03 16:13, 22 de 82 avisos caíram entre 24 e
    // 30 ms (Wi-Fi), e a imagem recebida foi de ~6,9 para ~4,8 Mbps sem voltar.
    a.baixas = fila < FILA_BAIXA ? a.baixas + 1 : fila > FILA_ALTA ? 0 : a.baixas;
    if (!s.enc || s.enc.state !== 'configured' || !s.config) return;
    const max = bandaDe(s.cfg.h);
    let nova = s.banda;
    if (a.altas >= 2) {
      nova = Math.max(max * BANDA_MIN, s.banda * 0.85);
      a.altas = 0;
    } else if (a.baixas >= 4 && s.banda < max) {
      nova = Math.min(max, s.banda * 1.1);
      a.baixas = 0;
    }
    if (Math.abs(nova - s.banda) < s.banda * 0.03) return;
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
        // fila de envio na trava ou codificador atrasado: este quadro fica de fora (o próximo é mais
        // novo). Mandar assim mesmo só atrasaria este e todos os de depois.
        // No máximo QPS_TURBO: o codificador é configurado para 60, e a tela do OBS chega a 120 — o
        // iPhone recebendo 115 qps em 1080p travava e a página caía (relatório de 2026-11-04 04:03).
        // Não conta como pulado (não é fila nem codificador atrasado). Ritmo fixo (proximoEnvio anda
        // de 1/60 em 1/60 s): comparar com o último quadro deixava passar quadros adiantados (64 qps).
        if (s.proximoEnvio && agora < s.proximoEnvio - 2) continue;
        const fila = s.canal.bufferedAmount;
        const filaCheia = fila > this.limiteFila(s);
        const b = Math.min(49, Math.floor((agora - s.conta.ultimo) / 100));
        const sf = s.serie.fila;
        while (sf.length <= b) { sf.push(0); s.serie.pulados.push(0); }
        if (fila / 1024 > sf[b]) sf[b] = Math.round(fila / 102.4) / 10;
        if (s.canal.readyState !== 'open' || filaCheia || (s.enc && s.enc.encodeQueueSize > 1)) {
          s.pulados++;
          s.conta.pulados++;
          s.serie.pulados[b]++;
          if (++s.rajada > s.maiorRajada) s.maiorRajada = s.rajada;
          if (filaCheia) s.conta.fila++;
          continue;
        }
        s.rajada = 0;
        const passo = 1000 / QPS_TURBO;
        s.proximoEnvio = s.proximoEnvio && agora - s.proximoEnvio < passo ? s.proximoEnvio + passo : agora + passo;
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
          s.canal.send(JSON.stringify({ cfg }));
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
    if (chunk.type === 'key') {
      s.chaveId = id;
      s.chaveEm = performance.now();
      s.conta.chaves++;
      s.conta.chaveMax = Math.max(s.conta.chaveMax, dados.length);
    }
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
    this.pararSom(s);
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
      filaLaMs: s.ajuste.ultima, // a última fila medida do outro lado (viagem p90 − a menor; ajustarBanda)
      chaves: s.conta.chaves, // quadros-chave mandados
      chaveKB: s.conta.chaves ? Math.round(s.conta.chaveMax / 102.4) / 10 : null, // o maior deles
      chavesIgnoradas: s.conta.ignorados, // pedidos de quadro-chave com um ainda a caminho (pedidoDeChave)
      // a fila de envio (KB) a cada 100 ms e os pulados em cada 100 ms; maiorRajada: pulados em seguida
      filaSerieKB: s.serie.fila,
      puladosSerie: s.serie.pulados.some((n) => n) ? s.serie.pulados : null,
      maiorRajada: s.maiorRajada,
      limiteFilaKB: Math.round(this.limiteFila(s) / 1024),
      versao: s.v2 ? VERSAO : 1,
      // o som pelo turbo (null: quem joga não pediu, a tela não tem som ou o Opus não abriu)
      som: s.som ? { pps: Math.round(s.som.conta.enviados / seg), kbps: Math.round((s.som.conta.bytes * 8) / seg / 1000), pulados: s.som.conta.pulados, canal: this.canaisSom.get(id)?.readyState ?? null } : null,
    };
    if (s.som) Object.assign(s.som.conta, { enviados: 0, bytes: 0, pulados: 0 });
    s.ajuste.mudou = 0;
    s.serie = { fila: [], pulados: [] };
    s.maiorRajada = 0;
    Object.assign(s.conta, { enviados: 0, bytes: 0, pulados: 0, fila: 0, cod: [], chaves: 0, chaveMax: 0, ignorados: 0, ultimo: agora });
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
  // abrirSom(idDoDono) -> canal "turbo-som" (rtc.abrirTurboSom)
  constructor({ abrir, abrirSom, onFalhou, onEvento }) {
    this.abrir = abrir;
    this.abrirSom = abrirSom;
    this.onFalhou = onFalhou;
    this.onEvento = onEvento;
    this.s = null;
    this._liso = true;
    this.vidaMs = TTL_MS; // a vida dos pedaços no canal: vale na próxima vez que o turbo ligar
  }

  get ligado() { return !!this.s; }

  // turbo liso (ver LISO_MIN): pode trocar com o turbo ligado
  get liso() { return this._liso; }
  set liso(v) {
    this._liso = !!v;
    const s = this.s;
    if (s && !this._liso) {
      // sem o liso: o que estava esperando a vez vai embora (o próximo quadro já vai direto)
      for (const q of s.fila) q.frame.close();
      s.fila = [];
    }
  }

  // relógio de quem compartilha − o meu (pelo pong de menor ida e volta), ou null: o main.js mede com
  // ele a ida do controle sem a volta (que espera atrás da imagem no mesmo caminho)
  get dif() { return this.s?.dif ?? null; }

  async ligar(key, video, altura = 1080) {
    this.desligar();
    if (!temTurboRecebe()) return this.onFalhou?.('navegador');
    const dono = String(key).split('~')[0];
    const canal = this.abrir(dono, this.vidaMs);
    if (!canal) return this.onFalhou?.('conexao');
    canal.binaryType = 'arraybuffer';
    const tela = document.createElement('canvas');
    tela.className = 'turbo-tela';
    tela.hidden = true;
    video.after(tela);
    const s = {
      key, video, canal, tela, ctx: tela.getContext('2d', { alpha: false, desynchronized: true }),
      dec: null, montando: null, ultimoId: 0, esperaChave: true, pedidoEm: 0, desenhou: 0, inicio: performance.now(),
      maiorId: 0, // o quadro mais novo de que chegou algum pedaço (vai no pedido de quadro-chave)
      fimChave: null, // quando o último quadro-chave terminou de chegar, no relógio de lá (a fila dele não conta)
      conta: { desenhados: 0, perdidos: 0, pedidos: 0, decMs: [], montagem: [], cod: [], ponta: [], viagem: [], bytes: 0, chaves: 0, chaveMax: 0, ultimo: performance.now() }, pendentes: new Map(),
      rtt: [], pingEm: 0,
      relogios: [], // { rtt, dif }: dos pongs com a hora de lá (versão 2)
      dif: null, // relógio de quem compartilha − o meu, do pong de menor ida e volta
      // o decodificador segurando quadros (segurando): 0 como veio, 1 SPS reescrito, 2 processador, 3 nada a fazer
      ajusteDec: 0,
      // a fila medida, para quem compartilha (vigiar): viagens desde o último aviso, a menor de cada aviso
      janelaViagem: [], minimos: [], filaEm: 0, filaMs: null,
      filaLentaDesde: 0, // desde quando a fila medida passa de FILA_LENTA (vigiar)
      // liso: quadros decodificados esperando a hora { frame, hora, info }; base: a menor diferença
      // (chegada − timestamp) por segundo, dos últimos 10 s; atrasos: quanto cada quadro veio depois da base
      fila: [], baseSeg: [], baseSegEm: 0, atrasos: [], alvo: LISO_INICIO, base: null, foraDaBase: 0,
      // ritmo na tela (ritmo.js) e o que explica cada travada (causa)
      ritmo: new Ritmo(), pintados: 0, vistos: 0, tsChegou: null, saltoLa: 0,
      ultimoPacote: 0, silencio: 0, silencioMax: 0, perdaEm: 0, chaveChegouEm: 0, esperouChave: null,
      caixa: [], // os últimos CAIXA quadros (caixaPreta)
      lisoConta: { atrasados: 0, trocados: 0, cheia: 0 },
    };
    s.vidaMs = this.vidaMs;
    this.s = s;
    // a volta da tela: o liso escolhe o quadro, e o ritmo vê se apareceu um novo
    const volta = (t) => {
      if (this.s !== s) return;
      this.volta(s, t);
      s.raf = requestAnimationFrame(volta);
    };
    s.raf = requestAnimationFrame(volta);
    // o AudioContext nasce aqui, antes de qualquer espera: ainda dentro do toque que ligou o modo
    // jogo (o iPhone só deixa tocar assim; senão, destrava no próximo toque — ver prepararSom)
    this.prepararSom(s, dono);
    const codecs = [];
    for (const codec of CODECS) {
      const r = await VideoDecoder.isConfigSupported({ codec, optimizeForLatency: true }).catch(() => null);
      if (r?.supported) codecs.push(codec);
    }
    if (s.som) {
      const r = await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 }).catch(() => null);
      if (this.s === s && !r?.supported) this.pararSom(s, 'sem Opus');
    }
    if (this.s !== s) return;
    if (!codecs.length) return this.falhou('navegador');
    const ligar = () => canal.send(JSON.stringify({ ligar: key, codecs, altura, versao: VERSAO, som: !!s.som }));
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
    // o maior tempo sem nada chegando: o Wi-Fi parado (vai na causa da travada e no relatório)
    const agoraP = performance.now();
    if (s.ultimoPacote) {
      const sem = agoraP - s.ultimoPacote;
      if (sem > s.silencio) s.silencio = sem;
      if (sem > s.silencioMax) s.silencioMax = sem;
    }
    s.ultimoPacote = agoraP;
    const v = new DataView(buf);
    // versão 2: o cabeçalho traz a hora em que o quadro saiu da captura lá (quem compartilha antigo: 0)
    const v2 = v.getUint8(9) === VERSAO;
    const cab = v2 ? CAB2 : CAB;
    if (buf.byteLength < cab) return;
    const id = v.getUint32(0);
    const i = v.getUint16(4);
    const total = v.getUint16(6);
    if (id > s.maiorId) s.maiorId = id;
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
    let tam = 0;
    for (const p of q.partes) tam += p.length;
    if (q.chave) {
      s.conta.chaves++;
      s.conta.chaveMax = Math.max(s.conta.chaveMax, tam);
    }
    // da saída do codificador lá até o último pedaço aqui: a fila de envio + a rede
    let viagem = null;
    let atrasDaChave = q.chave;
    if (q.lido != null && s.dif != null) {
      viagem = chegou + s.dif - (q.lido + q.cod);
      guardar(s.conta.viagem, viagem);
      // A fila que um quadro-chave causa (ele é bem maior que um quadro comum, e os capturados enquanto
      // ele passava esperam atrás dele) vem da perda que o pediu, não da banda: fica fora da conta que
      // vai para quem compartilha cortar a banda (ajustarBanda). O relatório continua vendo tudo.
      atrasDaChave = q.chave || (s.fimChave != null && q.lido < s.fimChave);
      if (q.chave) s.fimChave = chegou + s.dif;
      if (!atrasDaChave) s.janelaViagem.push(viagem); // vai para quem compartilha a cada FILA_AVISO_MS (vigiar)
    }
    if (q.chave && s.perdaEm && !s.chaveChegouEm) {
      s.chaveChegouEm = chegou;
      s.esperouChave = Math.round(chegou - s.perdaEm); // da perda até o quadro-chave novo chegar inteiro
    }
    // quanto o timestamp de lá andou desde o quadro inteiro anterior: bem mais que 1/60 s = quadros que
    // quem compartilha não mandou (pulados na fila ou captura parada; ver causa)
    const tsMs = q.ts / 1000;
    if (s.tsChegou != null && tsMs > s.tsChegou && tsMs - s.tsChegou > s.saltoLa) s.saltoLa = tsMs - s.tsChegou;
    s.tsChegou = tsMs;
    if (s.caixa.length >= CAIXA) s.caixa.shift();
    const reg = { c: chegou, id: q.id, ts: q.ts / 1000, k: q.chave ? 1 : 0, kb: Math.round(tam / 102.4) / 10, mont: Math.round(chegou - q.t0), v: viagem != null ? Math.round(viagem) : null, d: null, m: null };
    s.caixa.push(reg);
    // faltou um quadro inteiro no meio: os de depois não decodificam sem ele
    if (!q.chave && q.id !== s.ultimoId + 1) this.perdeu(s);
    s.ultimoId = q.id;
    if (q.chave) s.esperaChave = false;
    // esperando um quadro-chave e chegou outro: pede (sem esperar o vigia)
    else if (s.esperaChave) this.pedirChave(s);
    if (s.esperaChave || !s.dec || s.dec.state !== 'configured') return;
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
      s.pendentes.set(q.ts, { t: chegou, lido: q.lido, chaveAtrasou: atrasDaChave, reg });
      s.dec.decode(new EncodedVideoChunk({ type: q.chave ? 'key' : 'delta', timestamp: q.ts, data: dados }));
    } catch (err) {
      console.warn('[turbo] decodificar', err);
      this.perdeu(s);
    }
  }

  perdeu(s) {
    s.conta.perdidos++;
    // a 1ª perda desde o último quadro-chave: dela até a imagem voltar é o tempo esperando o quadro-chave
    if (!s.perdaEm || s.chaveChegouEm) {
      s.perdaEm = performance.now();
      s.chaveChegouEm = 0;
      s.esperouChave = null;
    }
    if (s.caixa.length) s.caixa[s.caixa.length - 1].perdeu = 1;
    s.montando = null;
    s.esperaChave = true;
    this.pedirChave(s);
  }

  pedirChave(s, ja = false) {
    const agora = performance.now();
    if (!ja && agora - s.pedidoEm < PEDIR_CHAVE_MS) return;
    s.pedidoEm = agora;
    s.conta.pedidos++;
    // desde: o quadro mais novo de que chegou alguma coisa. Lá, um quadro-chave mais novo que isso e
    // recente está a caminho, e o pedido repetido não gera outro (TurboEnvio.pedidoDeChave)
    try { s.canal.send(JSON.stringify({ chave: true, desde: s.maiorId })); } catch { /* canal fechou */ }
  }

  // ---------------------------------------------------------------- som
  // O tocador do som do turbo: AudioContext (latência "interactive") → AudioWorklet → volume (o do
  // vídeo da tela: o mesmo controle e o mesmo "mudo" de sempre) → alto-falante. Sem o que precisa,
  // ou sem o canal: fica o som do WebRTC.
  prepararSom(s, dono) {
    if (!temSomRecebe()) return;
    const canal = this.abrirSom?.(dono);
    if (!canal) return;
    canal.binaryType = 'arraybuffer';
    let ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      try {
        ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
      } catch {
        ctx = new AC({ latencyHint: 'interactive' });
      }
    } catch (err) {
      console.warn('[turbo] som: AudioContext', err);
      try { canal.close(); } catch { /* já fechado */ }
      return;
    }
    const som = {
      canal, ctx, no: null, ganho: ctx.createGain(), dec: null, cfg: null, ultimoSeq: 0, chegouEm: 0, errosDec: 0,
      estado: null, // o último aviso do tocador (nivelMs, alvoMs, faltas, descartes, tocando)
      calada: null, // a trilha de som do WebRTC que eu calei (volta no fim)
      ativo: false,
      conta: { pacotes: 0, bytes: 0, perdidos: 0, atrasados: 0, viagem: [], faltas: 0, descartes: 0 },
    };
    s.som = som;
    som.ganho.connect(ctx.destination);
    // o navegador barrou o som (sem toque ainda): o próximo toque ou tecla destrava
    som.destravar = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, som.destravar, true);
    som.destravar();
    canal.onmessage = (e) => { if (typeof e.data !== 'string') this.somPacote(s, som, e.data); };
    urlWorklet ??= URL.createObjectURL(new Blob([SOM_WORKLET], { type: 'text/javascript' }));
    ctx.audioWorklet.addModule(urlWorklet).then(() => {
      if (s.som !== som) return;
      som.no = new AudioWorkletNode(ctx, 'turbo-som', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      som.no.port.onmessage = (e) => { som.estado = e.data; };
      som.no.connect(som.ganho);
    }).catch((err) => {
      console.warn('[turbo] som: tocador', err);
      if (s.som === som) this.pararSom(s, 'tocador');
    });
  }

  somPacote(s, som, buf) {
    if (s.som !== som || !som.no || buf.byteLength <= SOM_CAB) return;
    const v = new DataView(buf);
    const seq = v.getUint32(0);
    const hz = v.getUint32(4);
    const canais = v.getUint8(8);
    const ts = v.getFloat64(12);
    const lido = v.getFloat64(20);
    const c = som.conta;
    c.pacotes++;
    c.bytes += buf.byteLength;
    // canal sem ordem: um pacote que chegou depois do seguinte já não serve
    if (som.ultimoSeq && seq <= som.ultimoSeq && som.ultimoSeq - seq < 1e6) { c.atrasados++; return; }
    if (som.ultimoSeq && seq > som.ultimoSeq + 1) c.perdidos += seq - som.ultimoSeq - 1;
    som.ultimoSeq = seq;
    som.chegouEm = performance.now();
    if (s.dif != null) guardar(c.viagem, som.chegouEm + s.dif - lido);
    const cfg = `${hz}/${canais}`;
    try {
      if (!som.dec || som.dec.state === 'closed' || som.cfg !== cfg) {
        if (!som.dec || som.dec.state === 'closed') {
          som.dec = new AudioDecoder({
            output: (data) => this.tocarSom(som, data),
            error: (err) => {
              console.warn('[turbo] decodificador de som', err);
              som.dec = null;
              if (++som.errosDec > 5 && s.som === som) this.pararSom(s, 'decodificador');
            },
          });
        }
        som.dec.configure({ codec: 'opus', sampleRate: hz, numberOfChannels: canais });
        som.cfg = cfg;
      }
      som.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data: new Uint8Array(buf, SOM_CAB) }));
    } catch (err) {
      console.warn('[turbo] som: decodificar', err);
    }
  }

  tocarSom(som, data) {
    try {
      if (!som.no) return;
      const n = data.numberOfFrames;
      const canais = [];
      for (let i = 0; i < Math.min(2, data.numberOfChannels); i++) {
        const p = new Float32Array(n);
        data.copyTo(p, { planeIndex: i, format: 'f32-planar' });
        canais.push(p);
      }
      som.errosDec = 0;
      som.no.port.postMessage({ canais, hz: data.sampleRate }, canais.map((p) => p.buffer));
    } catch (err) {
      console.warn('[turbo] som: tocar', err);
    } finally {
      data.close();
    }
  }

  // A cada volta do vigia: o volume segue o do vídeo da tela, e o som do WebRTC fica calado só
  // enquanto o do turbo está tocando de verdade (som destravado, pacotes chegando, tocador cheio).
  vigiarSom(s) {
    const som = s.som;
    if (!som) return;
    const v = s.video;
    const vol = v.muted ? 0 : v.volume;
    if (Math.abs(som.ganho.gain.value - vol) > 0.005) som.ganho.gain.setTargetAtTime(vol, som.ctx.currentTime, 0.02);
    // Para ligar, o tocador tem que estar tocando; depois, só os pacotes parando por SOM_PARADO_MS
    // devolvem o som ao WebRTC. Uma falha curta (o tocador enchendo de novo) não troca: no teste com
    // Wi-Fi ruim, trocar a cada falha alternava os dois sons, com atrasos diferentes.
    const chegando = som.ctx.state === 'running' && !!som.no && performance.now() - som.chegouEm < SOM_PARADO_MS;
    const ativo = chegando && (som.ativo || !!som.estado?.tocando);
    const trilha = v.srcObject?.getAudioTracks?.()[0] || null;
    // a conexão trocou a trilha: a antiga volta como estava
    if (som.calada && som.calada !== trilha) { som.calada.enabled = true; som.calada = null; }
    if (ativo && trilha && !som.calada) {
      if (trilha.enabled) { trilha.enabled = false; som.calada = trilha; }
    } else if (!ativo && som.calada) {
      som.calada.enabled = true;
      som.calada = null;
    }
    if (ativo !== som.ativo) {
      som.ativo = ativo;
      this.onEvento?.(ativo ? 'modo turbo: som pelo turbo' : 'modo turbo: som pelo WebRTC (o do turbo parou)', { contexto: som.ctx.state, nivelMs: som.estado ? Math.round(som.estado.nivelMs) : null });
    }
  }

  pararSom(s, motivo = null) {
    const som = s.som;
    if (!som) return;
    s.som = null;
    if (som.calada) som.calada.enabled = true;
    for (const ev of ['pointerdown', 'keydown', 'touchend']) removeEventListener(ev, som.destravar, true);
    try { som.canal.close(); } catch { /* já fechado */ }
    try { if (som.dec && som.dec.state !== 'closed') som.dec.close(); } catch { /* já fechado */ }
    try { som.no?.disconnect(); } catch { /* já solto */ }
    som.ctx.close().catch(() => {});
    if (motivo) this.onEvento?.('modo turbo: som de volta ao WebRTC', { motivo });
  }

  // Saiu um quadro do decodificador: sem o liso, vai para a tela na hora; com o liso, espera a hora
  // dele na fila (volta escolhe a cada volta da tela).
  desenhar(s, frame) {
    if (this.s !== s) return void frame.close();
    const agora = performance.now();
    const p = s.pendentes.get(frame.timestamp);
    if (p) {
      s.pendentes.delete(frame.timestamp);
      guardar(s.conta.decMs, agora - p.t);
      if (p.reg) p.reg.d = Math.round(agora - p.t);
    }
    if (s.pendentes.size > 30) s.pendentes.clear();
    s.saiuDoDec = (s.saiuDoDec || 0) + 1;
    s.errosDec = 0;
    if (!this._liso) return void this.pintar(s, frame, p);
    // a hora deste quadro: o timestamp (µs, relógio da captura lá) + a base + a folga
    const ts = frame.timestamp / 1000;
    const dif = agora - ts;
    this.medirBase(s, dif, agora, p?.chaveAtrasou);
    const hora = ts + s.base + s.alvo;
    s.fila.push({ frame, hora, p });
    // fila cheia (o decodificador do iPhone tem poucos quadros): o mais velho sai sem aparecer
    while (s.fila.length > LISO_FILA) {
      s.fila.shift().frame.close();
      s.lisoConta.cheia++;
      s.ritmo.invisivel();
    }
  }

  // A base (a menor diferença chegada − timestamp: o caminho mais rápido, com a diferença dos relógios
  // dentro) e a folga (alvo): o p95 de quanto os quadros vieram depois da base nos últimos ~2 s.
  medirBase(s, dif, agora, chaveAtrasou) {
    // relógios/timestamps que pularam (quem compartilha recomeçou a captura): recomeça a conta
    if (s.base != null && Math.abs(dif - s.base) > 1000) {
      if (++s.foraDaBase > 10) { s.base = null; s.baseSeg = []; s.atrasos = []; s.foraDaBase = 0; }
    } else s.foraDaBase = 0;
    const seg = Math.floor(agora / 1000);
    if (seg !== s.baseSegEm || !s.baseSeg.length) {
      s.baseSegEm = seg;
      s.baseSeg.push(dif);
      if (s.baseSeg.length > 10) s.baseSeg.shift();
    } else if (dif < s.baseSeg[s.baseSeg.length - 1]) s.baseSeg[s.baseSeg.length - 1] = dif;
    s.base = Math.min(...s.baseSeg);
    if (chaveAtrasou) return;
    guardar(s.atrasos, dif - s.base, 120);
    if (s.atrasos.length < 20) return;
    const p95 = Math.min(LISO_MAX, Math.max(LISO_MIN, pct(s.atrasos, LISO_PCT) + 2));
    // sobe na hora, desce devagar (um tremido que passou pode voltar)
    s.alvo = p95 > s.alvo ? p95 : s.alvo + (p95 - s.alvo) * 0.02;
  }

  // A cada volta da tela: com o liso, vai um quadro da fila (o mais velho que já está na hora). Depois,
  // se apareceu quadro novo desde a última volta, o ritmo marca.
  volta(s, t) {
    s.ritmo.volta(t);
    if (s.fila.length) {
      const agora = performance.now();
      const meia = s.ritmo.vsyncMs / 2;
      // quantos já estão na hora
      let n = 0;
      while (n < s.fila.length && s.fila[n].hora <= agora + meia) n++;
      // Um quadro que chegou atrasado ainda aparece (uma volta depois), e os seguintes vão uma volta
      // atrás; só com LISO_ATRAS ou mais na hora ao mesmo tempo o mais velho sai, para alcançar.
      // Jogar fora o atrasado (como era) virava quadro repetido + quadro pulado a cada atraso.
      // Atrás há LISO_ALCANCAR quadros seguidos (com a captura a 60 cravados, nunca sobra uma volta
      // para alcançar sozinho): pula um, uma vez, para voltar à hora.
      const alcancar = n >= 2 && s.atrasSeguidos >= LISO_ALCANCAR;
      while (n > LISO_ATRAS || (alcancar && n > 1)) {
        s.fila.shift().frame.close();
        s.lisoConta.trocados++;
        s.ritmo.invisivel();
        s.atrasSeguidos = 0;
        n--;
      }
      if (n > 0) {
        const q = s.fila.shift();
        const atras = agora - q.hora > meia;
        s.atrasSeguidos = atras ? (s.atrasSeguidos || 0) + 1 : 0;
        if (atras) s.lisoConta.atrasados++;
        this.pintar(s, q.frame, q.p);
      }
    }
    const novos = s.pintados - s.vistos;
    if (novos > 0) {
      s.vistos = s.pintados;
      if (novos > 1) s.ritmo.invisivel(novos - 1);
      s.ritmo.marcar(t, (ms) => this.causa(s, t, ms));
      s.silencio = 0;
      s.saltoLa = 0;
    }
  }

  // Por que a imagem ficou ms parada antes do quadro que apareceu em t. Na ordem: um quadro se perdeu
  // e esperou o quadro-chave; quem compartilha não mandou (quadros pulados lá: o timestamp pulou junto);
  // nada chegou pela rede (Wi-Fi parado); o decodificador demorou; senão, foi aqui (página ocupada).
  causa(s, t, ms) {
    const r = { silencioMs: Math.round(s.silencio), pulouLaMs: Math.round(s.saltoLa) };
    const ult = s.caixa.length ? s.caixa[s.caixa.length - 1] : null;
    if (ult?.v != null) r.viagemMs = ult.v;
    if (s.perdaEm && s.perdaEm >= t - ms - 20) return { causa: 'perda: esperou o quadro-chave', esperouChaveMs: s.esperouChave, ...r };
    if (s.saltoLa >= ms * 0.6) return { causa: 'lá: quadros não mandados (fila ou captura)', ...r };
    if (s.silencio >= ms * 0.6) return { causa: 'rede: nada chegou (Wi-Fi parado)', ...r };
    if (ult?.d != null && ult.d > ms * 0.5) return { causa: 'decodificador', decMs: ult.d, ...r };
    if (ult?.v != null && ult.v > ms * 0.5) return { causa: 'rede: quadro atrasado', ...r };
    return { causa: 'aqui: a página ou a tela demorou', ...r };
  }

  pintar(s, frame, p) {
    try {
      const w = frame.displayWidth;
      const h = frame.displayHeight;
      if (s.tela.width !== w || s.tela.height !== h) {
        s.tela.width = w;
        s.tela.height = h;
      }
      s.ctx.drawImage(frame, 0, 0, w, h);
      s.pintados++;
      s.conta.desenhados++;
      s.desenhou = performance.now();
      if (p?.reg) p.reg.m = Math.round(s.desenhou - p.reg.c);
      // da captura lá até desenhado aqui (codificação, fila, rede, montagem, decodificação, liso)
      if (p?.lido != null && s.dif != null) guardar(s.conta.ponta, s.desenhou + s.dif - p.lido);
      if (s.tela.hidden) {
        s.tela.hidden = false;
        this.posicionar(s);
      }
    } finally {
      frame.close();
    }
  }

  // Os últimos CAIXA_MS, quadro a quadro, para o relatório (quem joga marcou "engasgou"): quando chegou
  // (ms antes de agora), id, timestamp de lá (ms, relativo ao primeiro), quadro-chave, tamanho (KB),
  // montagem, viagem, decodificação, chegada→tela (m; null = não apareceu) e perdeu (faltou o de antes).
  caixaPreta() {
    const s = this.s;
    if (!s) return null;
    const agora = performance.now();
    const q = s.caixa.filter((r) => agora - r.c <= CAIXA_MS);
    const ts0 = q.length ? q[0].ts : 0;
    return {
      liso: this._liso, alvoMs: Math.round(s.alvo * 10) / 10,
      quadros: q.map((r) => ({ ...r, c: -Math.round(agora - r.c), ts: Math.round((r.ts - ts0) * 10) / 10 })),
    };
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
    this.vigiarSom(s);
    // nada apareceu: este aparelho/PC não deu conta — vídeo normal de volta
    if (!s.desenhou && agora - s.inicio > SEM_IMAGEM_MS) return this.falhou('sem-imagem');
    // a imagem parou ou a fila não para de crescer: a conexão não aguenta (ver PAROU_MS). Parou só
    // conta com quadro a caminho (chegando aos pedaços ou à espera do quadro-chave): tela parada lá não
    // manda quadro nenhum, e aí não é a conexão.
    const aCaminho = s.esperaChave || s.montando;
    if (aCaminho && s.desenhou && agora - s.desenhou > PAROU_MS && s.canal.readyState === 'open') return this.falhou('lento');
    if (s.filaLentaDesde && agora - s.filaLentaDesde > FILA_LENTA_MS) return this.falhou('lento');
    // parado esperando um quadro-chave que não veio (o pedido se perdeu): pede de novo
    if (s.esperaChave && agora - s.pedidoEm > 500) this.pedirChave(s);
    if (agora - s.pingEm > PING_MS && s.canal.readyState === 'open') {
      s.pingEm = agora;
      try { s.canal.send(JSON.stringify({ ping: agora })); } catch { /* fechou */ }
    }
    // A fila medida aqui vai para quem compartilha, que ajusta a banda por ela (TurboEnvio.ajustarBanda):
    // o p90 da viagem desde o último aviso e a menor dos últimos ~10 s (a menor de cada aviso, 20 avisos)
    if (agora - s.filaEm >= FILA_AVISO_MS && s.janelaViagem.length >= 5 && s.canal.readyState === 'open') {
      s.filaEm = agora;
      const v = s.janelaViagem;
      s.janelaViagem = [];
      guardar(s.minimos, Math.min(...v), 20);
      const base = Math.min(...s.minimos);
      const p90 = pct(v, 0.9);
      s.filaMs = Math.round(Math.max(0, p90 - base) * 10) / 10;
      if (s.filaMs <= FILA_LENTA) s.filaLentaDesde = 0;
      else if (!s.filaLentaDesde) s.filaLentaDesde = agora;
      try { s.canal.send(JSON.stringify({ fila: { p90, base: Math.round(base * 10) / 10 } })); } catch { /* fechou */ }
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
    cancelAnimationFrame(s.raf);
    for (const q of s.fila) q.frame.close();
    s.fila = [];
    this.pararSom(s);
    s.tela.remove();
  }

  // o som do turbo desde a última leitura (null: está no WebRTC). bufferMs: o que o tocador tem guardado
  // (o atraso do som aqui, fora o do alto-falante, que vai em saidaMs); faltas: vezes que o som acabou
  statsSom(s, seg) {
    const som = s.som;
    if (!som) return null;
    const c = som.conta;
    const e = som.estado;
    const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
    const r = {
      ativo: som.ativo,
      contexto: som.ctx.state,
      pps: Math.round(c.pacotes / seg),
      kbps: Math.round((c.bytes * 8) / seg / 1000),
      perdidos: c.perdidos,
      atrasados: c.atrasados,
      viagemMs: mediana(c.viagem),
      bufferMs: r1(e?.nivelMs),
      alvoMs: r1(e?.alvoMs),
      faltas: e ? e.faltas - c.faltas : 0,
      descartes: e ? e.descartes - c.descartes : 0,
      saidaMs: r1(((som.ctx.baseLatency || 0) + (som.ctx.outputLatency || 0)) * 1000),
    };
    Object.assign(c, { pacotes: 0, bytes: 0, perdidos: 0, atrasados: 0, viagem: [], faltas: e?.faltas ?? 0, descartes: e?.descartes ?? 0 });
    return r;
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
      filaMs: s.filaMs, // a última fila mandada a quem compartilha (viagem p90 − a menor)
      decAjuste: [null, 'sps', 'processador', 'sem-saida'][s.ajusteDec] ?? null, // ver segurando
      codec: s.dec?.state === 'configured' ? 'h264' : null,
      chaves: s.conta.chaves, // quadros-chave que chegaram inteiros
      chaveKB: s.conta.chaves ? Math.round(s.conta.chaveMax / 102.4) / 10 : null, // o maior deles
      som: this.statsSom(s, seg),
      // o ritmo na tela (ritmo.js): de quantas em quantas voltas da tela veio cada quadro, e as travadas com a causa
      ritmo: s.ritmo.stats(),
      vidaMs: s.vidaMs, // a vida dos pedaços no canal (TTL_MS ou a do preset)
      // o maior tempo sem nada chegando pela rede (Wi-Fi parado)
      silencioMaxMs: Math.round(s.silencioMax),
      // turbo liso: a folga de agora, quadros que chegaram depois da hora, trocados por um mais novo na
      // mesma volta e jogados fora com a fila cheia
      liso: this._liso ? { alvoMs: Math.round(s.alvo * 10) / 10, fila: s.fila.length, ...s.lisoConta } : null,
    };
    s.silencioMax = 0;
    s.lisoConta = { atrasados: 0, trocados: 0, cheia: 0 };
    Object.assign(s.conta, { desenhados: 0, perdidos: 0, pedidos: 0, bytes: 0, montagem: [], cod: [], ponta: [], viagem: [], chaves: 0, chaveMax: 0, ultimo: agora });
    return r;
  }
}
