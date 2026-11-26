// WebRTC em malha (cada pessoa conecta direto com cada outra): microfone + tela + som da tela.
// Usa o padrão "perfect negotiation" para renegociar sem conflitos quando alguém liga/desliga a tela.
import { podeRecortar, recortarRosto } from './rosto.js';
import { isTouch } from './touch.js';

// Presets de qualidade: todos a 60 quadros por segundo. Se a internet ou o PC apertarem, o
// navegador baixa a resolução e segura os 60 quadros ("maintain-framerate"). A captura já sai no
// tamanho do preset (o navegador reduz na placa de vídeo, antes de codificar — sai mais barato).
// contentHint 'motion' e não 'detail': o modo "tela" do codificador segura quadros em conteúdo
// parado e derruba a fluidez quando algo se mexe.
// jogoBitrate: a banda de quem joga na tela (modo jogo, ver modoJogo). Jogo de ação mexe a imagem
// toda a cada quadro: com os 12 Mbps o codificador do processador passava do alvo e descartava
// quadros. Com o da placa (H.265/H.264 na NVIDIA) 14 Mbps dão 1080p60 limpo, e o teto mais baixo
// deixa folga: saindo 16–24 Mbps, uma queda do Wi-Fi para 8 Mbps enchia a fila de envio (até 1 s)
// e virava travada de 1–3 s no iPhone.
export const SHARE_PRESETS = {
  leve: { label: 'Leve', fps: 60, width: 1280, height: 720, maxBitrate: 5_000_000, jogoBitrate: 7_000_000 },
  max: { label: 'Máxima', fps: 60, width: 1920, height: 1080, maxBitrate: 12_000_000, jogoBitrate: 14_000_000 },
  ultra: { label: 'Ultra', fps: 60, width: 2560, height: 1440, maxBitrate: 20_000_000, jogoBitrate: 20_000_000 },
};
// os nomes antigos (texto nítido, vídeo, jogo) viram a Máxima
export const presetDe = (modo) => (SHARE_PRESETS[modo] ? modo : 'max');

// Webcam: só ocupa o rosto do boneco. Com o recorte do rosto (rosto.js) a câmera abre em 720p
// para o rosto aproximado continuar nítido, e o que sai é um quadrado de 360 px. O celular não
// recorta (quem recebe aproxima o meio da imagem): manda a câmera inteira, menor e a 24 quadros.
const CAM = isTouch
  ? { width: 480, height: 360, fps: 24, maxBitrate: 400_000 }
  : { width: 640, height: 480, fps: 30, maxBitrate: 600_000 };
const CAM_RECORTE = { width: 1280, height: 720 };

// Quanto cada pessoa que assiste precisa de cada tela (ela mesma avisa, ver enviarInteresse):
// max = olhando de perto ou em foco; medio = vê pequena num PC que desenha o vídeo a 60 quadros;
// baixo = vê de longe; mini = vê bem pequena; off = não vê.
// Quem não vê não recebe vídeo: o PC de quem compartilha não gasta codificando para ela, e sobra
// banda para quem está olhando. O som da tela continua indo para todo mundo.
// piso: abaixo disso a resolução do nível borra. teto: a fração do preset que o nível pode levar
// (o 540p não leva os 12 Mbps do 1080p só por ser a única tela que a pessoa vê). linhas: a altura
// que o nível mira, venha a captura em 1080p, 720p ou 768 (a metade fixa de uma captura de 720p
// saía com 360 linhas e esticava borrada na mesa); sem linhas, a escala fixa.
export const NIVEIS = {
  max: { escala: 1, fps: 60, peso: 1, piso: 3_000_000, teto: 1 },
  medio: { escala: 2, linhas: 540, fps: 60, peso: 0.3, piso: 700_000, teto: 0.25 },
  baixo: { escala: 2, linhas: 540, fps: 30, peso: 0.3, piso: 500_000, teto: 0.15 },
  mini: { escala: 4, linhas: 270, fps: 15, peso: 0.08, piso: 120_000, teto: 0.03 },
  off: { escala: 4, fps: 1, peso: 0, piso: 150_000, teto: 0.0125 },
};
// quem ainda não disse quanto precisa (tela nova, quem acabou de entrar) começa barato: quem
// olha sobe no próximo aviso dela (~250 ms)
const nivelDe = (peer, k) => NIVEIS[peer.interesse.get(k)] || NIVEIS.mini;

// Codec de vídeo das telas: o que este PC codifica na placa de vídeo (não pesa no processador nem
// no jogo). Entre os acelerados, nesta ordem: H.264 (todo mundo decodifica na placa), AV1, VP9.
// Nenhum acelerado: H.264 mesmo, que em software é o mais leve deles.
// O H.264 é testado em cada perfil que o navegador oferece, o High primeiro: um codificador da
// placa que só aceite o High ganha a frente. O encodingInfo nem sempre sabe: numa RTX ele disse
// "não é na placa" para todos e o Chrome codificou na NVIDIA mesmo assim (sem perfil escolhido,
// fica a ordem do navegador).
// ?codec=h264|vp9|av1|vp8 na sala força um (para medir); o que cada um respondeu fica em
// infoCodecs (vai no relatório do modo jogo).
let codecPreferido = null; // { mimeType, perfil } (perfil: profile-level-id do H.264, ou null)
let escolhendo = null;
let infoCodecs = { preferido: null, forcado: null, testados: [] };

// A captura de janela e tela é pedida no ritmo do preset (60). ?qps=N (30 a 240) na sala de quem
// compartilha pede outro, para medir; o envio continua em no máximo 60 (maxFramerate do nível; só a
// tela do OBS passa disso, ver QPS_OBS). Pedir 75 não tirou o teto de ~57 qps da janela de um jogo
// (relatório de 2026-10-29 12:45: a captura nunca passou de 58, e na placa Intel ficou um pouco pior).
const QPS_PADRAO = 60;
// direto primeiro e de volta ao direto (ver liberarTurn e vigiarRelay)
const DIRETO_PRIMEIRO_MS = 3000;
const VOLTA_DIRETO_MS = 30_000;
const VOLTA_DIRETO_MAX_MS = 8 * 60_000;
// Compartilhar pelo OBS: a captura de tela do Chrome/Edge no Windows não passa de ~54 qps mesmo
// pedindo 120/144/165 (teste de 2026-11-04, monitores de 144 e 165 Hz; igual com WGC, DXGI e pela
// extensão). A câmera virtual do OBS não tem esse teto: com o OBS a 120 qps o Chrome recebeu 120
// e o WebRTC enviou 120. A tela que vem por ela sai no ritmo da câmera no nível máximo.
export const QPS_OBS = 120;
// Quantos Hz a tela daqui mostra (medido pelo requestAnimationFrame; 60 até medir). Vai junto do
// interesse: quem compartilha pelo OBS só manda acima de 60 para quem consegue mostrar. O iPhone a
// 115 qps no turbo travava e a página caía (relatório de 2026-11-04 04:03).
let HZ_TELA = 60;
function medirHz() {
  if (typeof requestAnimationFrame !== 'function') return;
  let n = 0;
  let t0 = 0;
  const passo = (t) => {
    if (!t0) t0 = t;
    n++;
    if (t - t0 < 1000) return requestAnimationFrame(passo);
    const hz = (n - 1) / ((t - t0) / 1000);
    // aba escondida ou travada: não vale (fica o da medida anterior)
    if (hz >= 50) HZ_TELA = Math.round(hz);
  };
  requestAnimationFrame(passo);
}
setTimeout(medirHz, 3000);
setInterval(medirHz, 30_000); // a janela pode ir para outro monitor
const QPS_CAPTURA = (() => {
  const n = Number(new URLSearchParams(location.search).get('qps'));
  return Number.isFinite(n) && n >= 30 && n <= 240 ? Math.round(n) : null;
})();
export const codecsTestados = () => infoCodecs;
const perfilDe = (c) => /profile-level-id=([0-9a-f]{6})/i.exec(c.sdpFmtpLine || '')?.[1]?.toLowerCase() || null;
// High (64), Main (4d), Constrained Baseline (42e0), Baseline (4200)
const ordemPerfil = (p) => (p?.startsWith('64') ? 0 : p?.startsWith('4d') ? 1 : p?.startsWith('42e0') ? 2 : 3);
export function escolherCodec() {
  escolhendo ??= (async () => {
    const caps = RTCRtpSender.getCapabilities?.('video')?.codecs || [];
    const perfis = [...new Set(caps.filter((c) => c.mimeType === 'video/H264').map(perfilDe).filter(Boolean))]
      .sort((a, b) => ordemPerfil(a) - ordemPerfil(b));
    const candidatos = [
      ...perfis.map((p) => ({ mimeType: 'video/H264', perfil: p, contentType: `video/H264;profile-level-id=${p}` })),
      { mimeType: 'video/AV1', perfil: null, contentType: 'video/AV1' },
      { mimeType: 'video/VP9', perfil: null, contentType: 'video/VP9' },
    ];
    const pedido = { h264: 'video/H264', vp9: 'video/VP9', av1: 'video/AV1', vp8: 'video/VP8' }[new URLSearchParams(location.search).get('codec')?.toLowerCase()] || null;
    let escolhido = null;
    const testados = [];
    if (navigator.mediaCapabilities?.encodingInfo) {
      for (const c of candidatos) {
        try {
          const r = await navigator.mediaCapabilities.encodingInfo({
            type: 'webrtc',
            video: { contentType: c.contentType, width: 1920, height: 1080, bitrate: 12_000_000, framerate: 60 },
          });
          testados.push({ codec: c.contentType, suporta: r.supported, placa: r.powerEfficient, liso: r.smooth });
          if (!escolhido && r.supported && r.powerEfficient) escolhido = c;
        } catch (err) {
          testados.push({ codec: c.contentType, erro: String(err?.message || err) }); // navegador sem 'webrtc' no encodingInfo
        }
      }
    }
    if (pedido) {
      // o forçado: no perfil que a placa aceitou, se for o H.264 dela; senão na ordem do navegador
      escolhido = escolhido?.mimeType === pedido ? escolhido : { mimeType: pedido, perfil: null };
    }
    escolhido ??= { mimeType: 'video/H264', perfil: null };
    codecPreferido = caps.some((c) => c.mimeType === escolhido.mimeType) ? escolhido : null;
    infoCodecs = { preferido: codecPreferido && `${codecPreferido.mimeType}${codecPreferido.perfil ? ` ${codecPreferido.perfil}` : ''}`, forcado: pedido, testados };
    console.info('[rtc] codec das telas', infoCodecs);
    return codecPreferido;
  })();
  return escolhendo;
}

// põe o codec escolhido na frente, no perfil escolhido antes dos outros perfis dele (os outros
// codecs ficam de reserva; rtx, red e fec continuam)
function preferirCodec(transceiver) {
  if (!codecPreferido || !transceiver.setCodecPreferences) return;
  const todos = RTCRtpReceiver.getCapabilities?.('video')?.codecs || [];
  const { mimeType, perfil } = codecPreferido;
  // sem perfil escolhido a ordem do navegador fica (o OpenH264 só faz o Constrained Baseline)
  const primeiro = todos.filter((c) => c.mimeType === mimeType)
    .sort((a, b) => (perfil ? (perfilDe(b) === perfil) - (perfilDe(a) === perfil) : 0));
  if (!primeiro.length) return;
  try {
    transceiver.setCodecPreferences([...primeiro, ...todos.filter((c) => c.mimeType !== mimeType)]);
  } catch (err) {
    console.warn('[rtc] preferência de codec', err);
  }
}

// Modo jogo: o codec da tela para quem joga, pelo que vai para a placa de vídeo. Medido numa RTX
// 3060 Ti (Chrome 156): H.264 Baseline (42001f), Main e High → NVIDIA; Constrained Baseline
// (42e01f) → OpenH264, no processador; VP9 e AV1 → processador; H.265 → NVIDIA. O Safari do
// iPhone só oferece o H.264 em 42e01f e 640c1f (que o Chrome não tem): com ele a tela saía sempre
// no processador. Ordem: H.265 (o Chrome só o lista para enviar quando a placa codifica), o H.264
// que vai para a placa, e o resto de reserva. seguro: sem o H.265 (ver codecSeguroJogo).
const PERFIS_DA_PLACA = /profile-level-id=(42001f|4d00|6400)/i;
function preferirCodecDeJogo(transceiver, seguro) {
  if (!transceiver.setCodecPreferences) return;
  const todos = RTCRtpReceiver.getCapabilities?.('video')?.codecs || [];
  const h265 = !seguro && RTCRtpSender.getCapabilities?.('video')?.codecs.some((c) => c.mimeType === 'video/H265');
  const nota = (c) => (c.mimeType === 'video/H265' ? (h265 ? 0 : 9)
    : c.mimeType === 'video/H264' ? (PERFIS_DA_PLACA.test(c.sdpFmtpLine || '') ? 1 : 2) + (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 0 : 0.5)
      : 5);
  try {
    transceiver.setCodecPreferences([...todos].sort((a, b) => nota(a) - nota(b)));
  } catch (err) {
    console.warn('[modo-jogo] preferência de codec', err);
  }
}

// Fecha um canal de dados sem pegar o Chrome no meio da abertura. Os travamentos da aba
// (STATUS_ILLEGAL_INSTRUCTION na thread WebRTC_W_and_N, 22/11 a 25/11, Chrome 157 e 158; e os da TV LG
// em 23/11) quebram em SctpDataChannel::CloseAbruptlyWithDataChannelFailure: dentro de um
// setLocalDescription, quando o transporte dos canais fica pronto, o Chrome manda o que um canal
// esperava sem ele ter o número de stream (sid). Um canal fechado ainda em 'connecting' fica em
// 'closing' para sempre (testado no 158). Ainda abrindo: fica mudo agora (send não faz nada, para um
// "open" antigo não mandar o pedido de quem já trocou de canal) e fecha quando abrir.
function fecharCanal(c) {
  if (!c) return;
  if (c.readyState === 'connecting') {
    c.send = () => {};
    c.onmessage = null;
    c.addEventListener('open', () => { try { c.close(); } catch { /* já fechado */ } }, { once: true });
    return;
  }
  try { c.close(); } catch { /* já fechado */ }
}

// O Constrained Baseline (42e01f) do outro lado vira Baseline (42001f) aqui dentro, nas seções das
// telas que vão para quem joga: o Chrome codifica na placa, e o que sai é o mesmo para o
// decodificador do iPhone (o Baseline do codificador não usa nada fora do Constrained). Para
// fora vai o contrário, para o outro lado continuar reconhecendo o que ofereceu.
function trocarPerfil(desc, mids, de, para) {
  if (!desc?.sdp || !mids.size) return desc;
  const saida = [];
  for (const sec of secoesDoSdp(desc.sdp)) {
    const mid = sec.find((l) => l.startsWith('a=mid:'))?.slice(6);
    const troca = sec[0].startsWith('m=video') && mids.has(mid);
    for (const l of sec) saida.push(troca && l.startsWith('a=fmtp:') ? l.replace(`profile-level-id=${de}`, `profile-level-id=${para}`) : l);
  }
  return { type: desc.type, sdp: saida.join('\r\n') };
}

// O codificador da placa (NVIDIA no Chrome 156) recusa largura ou altura ímpar e o Chrome cai no
// OpenH264: 1279×720, 1280×719 e 617×375 no processador; 1280×720, 618×376 e 1340×720 na placa.
// Uma janela de 926×562 com a escala de 1,5 saía em 617×375; uma janela de tamanho ímpar, sem
// escala nenhuma, também. Daqui sai a escala mais próxima (para baixo) com as duas medidas pares: a
// altura cai exata num número par e a largura logo acima de um par (menos de 0,45), que dá par
// arredondando ou truncando. Perde no máximo uns 1,5% (1283×751 → 1264×740).
function escalaPar(largura, altura, escala) {
  if (!largura || !altura) return escala;
  // Sem redução, sem escala: uma escala de 1,004 numa captura ímpar dava medidas imprevisíveis
  // (1283×751 → 1277×747), e a placa recusa a captura ímpar mesmo com a saída par (1283×751 →
  // 916×536 no processador). Captura ímpar se acerta na captura (reiniciarCodificador).
  if (escala <= 1) return 1;
  let linhas = Math.floor(altura / escala / 2) * 2;
  if (linhas + 0.25 > altura) linhas -= 2; // a escala não pode ficar abaixo de 1
  for (let i = 0; i < 40 && linhas >= 2; i++, linhas -= 2) {
    // mira 0,25 acima do par: 751 / (751 / 736) dava 735,9999 e o Chrome entregava 735
    const alvo = linhas + 0.25;
    const colunas = (largura * alvo) / altura;
    if (colunas - Math.floor(colunas / 2) * 2 < 0.45) return altura / alvo;
  }
  return escala;
}

// as linhas do SDP por seção: o cabeçalho e depois uma lista por m= (começando na linha m=)
function secoesDoSdp(sdp) {
  const secoes = [[]];
  for (const l of sdp.split('\r\n')) {
    if (l.startsWith('m=')) secoes.push([]);
    secoes[secoes.length - 1].push(l);
  }
  return secoes;
}

// O Chrome começa toda conexão com ~300 kbps e vai subindo aos poucos: nos primeiros segundos a
// tela sai em 270p–720p mesmo com internet sobrando (medido: em 6 s ainda estava em 720p). Com a
// banda inicial no SDP (x-google-start-bitrate, do libwebrtc: Chrome e Safari aplicam, o Firefox
// ignora) ela já sai em 1080p. O estimador de banda é um por conexão e a subida de quem manda é
// uma só: com mais gente cada conexão começa mais baixo (1-2: 6 Mbps; 4: 3 Mbps; 15 ou mais:
// 800 kbps). Piso de banda (x-google-min-bitrate) nenhum: na malha ele vale por conexão, e com 20
// pessoas assistindo eram 20 Mbps de subida forçados, com a voz picotando.
const bandaInicial = (conexoes) => Math.round(Math.min(6000, Math.max(800, 12000 / Math.max(1, conexoes))));

// Modo jogo: a conexão de quem joga no meu PC tem piso e começa alto. O estimador começava da
// banda da voz (a conexão já existia) e cada perda do Wi-Fi o derrubava de novo: num celular na
// mesma rede a tela saiu em 345×210, a ~200 kbps, por um minuto inteiro. Aqui o piso vale só para
// essa pessoa (as outras não recebem nada pesado de mim no modo jogo) e sai se a rede dela perder
// muito com ele (soltarPisoJogo).
const bandaDeJogo = (preset) => ({
  inicio: Math.round(preset.jogoBitrate * 0.5 / 1000),
  piso: Math.round(Math.min(6_000_000, preset.jogoBitrate * 0.3) / 1000),
});

// A banda inicial (kbps) em todo codec de vídeo de cada seção: vale o da seção que acabar
// escolhida. O piso que venha de uma aba antiga sai; piso (kbps) põe um novo.
// Só no vídeo (o áudio não muda).
function comBandaInicial(desc, kbps, piso = 0) {
  const extra = [`x-google-start-bitrate=${kbps}`, ...(piso ? [`x-google-min-bitrate=${piso}`] : [])];
  if (!desc?.sdp) return desc;
  const saida = [];
  for (const sec of secoesDoSdp(desc.sdp)) {
    if (!sec[0].startsWith('m=video')) {
      saida.push(...sec);
      continue;
    }
    // payloads que já têm a=fmtp nesta seção
    const comFmtp = new Set(sec.map((l) => /^a=fmtp:(\d+) /.exec(l)?.[1]).filter(Boolean));
    for (const l of sec) {
      // rtx (apt=) não: a banda é do codec, não da retransmissão
      if (l.startsWith('a=fmtp:') && !l.includes('apt=')) {
        const [cabeca, ...resto] = l.split(' ');
        const params = resto.join(' ').split(';').map((p) => p.trim())
          .filter((p) => p && !/^x-google-(start|min)-bitrate=/.test(p));
        saida.push(`${cabeca} ${[...params, ...extra].join(';')}`);
        continue;
      }
      saida.push(l);
      // codec sem a=fmtp (o VP8, por exemplo): cria a linha
      const rtp = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(l);
      if (rtp && !comFmtp.has(rtp[1]) && !/^(rtx|red|ulpfec|flexfec-03)$/i.test(rtp[2])) saida.push(`a=fmtp:${rtp[1]} ${extra.join(';')}`);
    }
  }
  return { type: desc.type, sdp: saida.join('\r\n') };
}

// DTX na voz: nos trechos sem fala o Opus manda só um ruído de conforto a cada 400 ms em vez de
// 50 pacotes/s (~36 kbps na rede com as pausas de uma conversa, contra ~60). Quem decide é o
// codificador de quem manda, e ele lê o usedtx=1 da descrição REMOTA: por isso só se mexe nela.
// O som das minhas telas fica de fora (semDtx: mids das seções delas), porque filme e música não
// trocam os trechos baixos por ruído.
function comDtx(desc, semDtx) {
  if (!desc?.sdp) return desc;
  const saida = [];
  for (const sec of secoesDoSdp(desc.sdp)) {
    const mid = sec.find((l) => l.startsWith('a=mid:'))?.slice(6);
    const opus = sec[0].startsWith('m=audio') && !semDtx.has(mid)
      ? sec.map((l) => /^a=rtpmap:(\d+) opus\/48000/i.exec(l)?.[1]).find(Boolean)
      : null;
    for (const l of sec) saida.push(opus && l.startsWith(`a=fmtp:${opus} `) && !l.includes('usedtx=') ? `${l};usedtx=1` : l);
  }
  return { type: desc.type, sdp: saida.join('\r\n') };
}

// Som do jogo em estéreo: com o Opus mono (o padrão) quem joga perdia de que lado vêm os passos e
// os golpes. Quem manda lê o stereo=1 da descrição REMOTA (como o usedtx, ver comDtx): mids são as
// seções do som das minhas telas para quem joga. Quem recebe declara na própria descrição que
// aceita estéreo nas seções que só recebem (mids null) — o decodificador sai com dois canais.
function comEstereo(desc, mids) {
  if (!desc?.sdp) return desc;
  if (mids && !mids.size) return desc;
  const saida = [];
  for (const sec of secoesDoSdp(desc.sdp)) {
    const mid = sec.find((l) => l.startsWith('a=mid:'))?.slice(6);
    const vale = sec[0].startsWith('m=audio') && (mids ? mids.has(mid) : sec.includes('a=recvonly'));
    const opus = vale ? sec.map((l) => /^a=rtpmap:(\d+) opus\/48000/i.exec(l)?.[1]).find(Boolean) : null;
    for (const l of sec) saida.push(opus && l.startsWith(`a=fmtp:${opus} `) && !l.includes('stereo=') ? `${l};stereo=1;sprop-stereo=1` : l);
  }
  return { type: desc.type, sdp: saida.join('\r\n') };
}

// Sem a sincronia entre a imagem e o som (2026-11-23): o WebRTC segura a imagem para casar com o som da mesma
// transmissão. Num vídeo está certo; jogando, o som com 150–300 ms de fila levava a imagem junto: nos relatórios,
// 48–95 ms sem a sincronia (jitterBufferMinimumDelay) viravam 140–290 ms, e na TV LG a fila subia em rampa até
// parar cravada em 300–500 ms sem nenhum pacote perdido. O navegador casa o que chega com o mesmo msid: na
// descrição que chega, o som ganha um msid só dele (+SEM_SINCRONIA) e o ontrack junta as trilhas de volta na
// mesma MediaStream. Só muda quem recebe: quem manda nem fica sabendo.
const SEM_SINCRONIA = '-som';
function somSolto(desc) {
  if (!desc?.sdp) return desc;
  const secoes = secoesDoSdp(desc.sdp);
  const idDe = (l) => /^a=(?:ssrc:\d+ )?msid:(\S+)/.exec(l)?.[1];
  const comImagem = new Set();
  for (const sec of secoes) if (sec[0].startsWith('m=video')) for (const l of sec) { const id = idDe(l); if (id && id !== '-') comImagem.add(id); }
  const saida = [];
  for (const sec of secoes) {
    const som = sec[0].startsWith('m=audio');
    for (const l of sec) {
      const id = som ? idDe(l) : null;
      saida.push(id && comImagem.has(id) ? l.replace(`msid:${id}`, () => `msid:${id}${SEM_SINCRONIA}`) : l);
    }
  }
  return { type: desc.type, sdp: saida.join('\r\n') };
}

export class RTC {
  constructor(socket, { iceServers, onTrack, onPeerGone, onFalha }) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.onTrack = onTrack;
    this.onPeerGone = onPeerGone;
    this.onFalha = onFalha; // (id, temTurn) — conexão de voz/vídeo com alguém não fechou
    this.onMicCaiu = null; // o sistema encerrou a trilha do microfone (fone trocado, ligação, app em 2º plano)
    this.temTurn = iceServers.some((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)));
    this.selfId = null;
    this.peers = new Map();
    this.micStream = null;
    this.micTrack = null;
    // Telas no ar, por chave (a mesma do servidor). Uma pessoa pode mandar várias abas/janelas
    // ao mesmo tempo. extraScale reduz vídeo de arquivo maior que o preset antes de codificar.
    this.screens = new Map(); // key -> { stream, extraScale }
    this.jogoTelas = new Set(); // telas minhas em que alguém está jogando (modoJogo)
    this.jogadores = new Map(); // tela minha em jogo -> ids de quem joga nela
    this.shareMode = 'max'; // preset das telas: leve, max ou ultra
    this.semHevc = false; // esta página não recebe H.265 (a TV, ver soH264)
    this.semSincronia = false; // a imagem não espera o som (ver somSolto); antes de conectar com alguém
    this.medidas = new WeakMap(); // receptor de vídeo -> os totais da medida anterior (ver recebendo)
    // A escolha do codec trava a página: o RTCRtpSender.getCapabilities levou 1,4 s na primeira
    // chamada (o Chrome acorda os codificadores da placa), bem no meio da abertura da sala. Fica
    // para quando a página estiver à toa; quem compartilha antes disso a puxa no captureScreen.
    const depois = () => (window.requestIdleCallback ? requestIdleCallback(() => escolherCodec(), { timeout: 15000 }) : escolherCodec());
    setTimeout(depois, 6000);

    socket.on('signal', ({ from, data }) => this.handleSignal(from, data));
    setInterval(() => this.vigiar(), 1000);
  }

  // -------------------------------------------------------------- microfone
  async startMic(deviceId = null) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => { if (this.micTrack === track) this.onMicCaiu?.(); });
    const enabled = this.micTrack ? this.micTrack.enabled : true;
    track.enabled = enabled;
    const old = this.micTrack;
    this.micStream = this.micStream || new MediaStream();
    if (old) {
      this.micStream.removeTrack(old);
      old.stop();
    }
    this.micStream.addTrack(track);
    this.micTrack = track;
    for (const peer of this.peers.values()) {
      // addTrack (e não addTransceiver): é ele que casa com a seção sendrecv da voz do outro lado
      if (!peer.micSender) {
        peer.micSender = peer.pc.addTrack(track, this.micStream);
        peer.micVai = track;
      }
      this.ajustarMic(peer);
    }
    return this.micStream;
  }

  setMicEnabled(on) {
    if (!this.micTrack) return;
    this.micTrack.enabled = on;
    for (const peer of this.peers.values()) this.ajustarMic(peer);
  }

  // A voz só sai para quem pode ouvir (o main decide: outra sala com privacidade, por exemplo).
  vozPara(id, ouve) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.ouveMic = !!ouve;
    this.ajustarMic(peer);
  }

  // Mudo, ou quem não ouve: a trilha sai do envio. Sem trilha nada é codificado nem enviado; com
  // enabled = false ia silêncio a 50 pacotes/s para cada conexão. A seção da voz continua
  // negociada, então voltar é só pôr a trilha de novo (sem renegociar).
  ajustarMic(peer) {
    if (!peer.micSender) return;
    const quer = this.micTrack?.enabled && peer.ouveMic ? this.micTrack : null;
    if (peer.micVai === quer) return;
    peer.micVai = quer;
    peer.micSender.replaceTrack(quer).catch((err) => {
      console.warn('[rtc] voz', err);
      // não entrou: o vigia tenta de novo no próximo segundo (antes ficava marcada como enviada)
      if (peer.micVai === quer) peer.micVai = undefined;
    });
  }

  // Quem ouve viu o aro verde e não chegou som: põe a trilha da voz de novo no envio e, se a
  // conexão caiu, refaz o caminho (ICE).
  reforcarVoz(peer) {
    if (this.micTrack && !peer.micSender) peer.micSender = peer.pc.addTrack(this.micTrack, this.micStream);
    peer.micVai = undefined;
    this.ajustarMic(peer);
    if (!['connected', 'completed'].includes(peer.pc.iceConnectionState)) this.restartIce(peer);
  }

  // eu (que ouço) peço a voz de novo a quem está falando
  pedirVoz(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.send(id, { voz: 1 });
    if (!['connected', 'completed'].includes(peer.pc.iceConnectionState)) this.restartIce(peer);
  }

  // pacotes de voz recebidos até agora na trilha trackId dessa pessoa (null: a trilha não é dela)
  async vozChegando(id, trackId) {
    const r = this.peers.get(id)?.pc.getReceivers().find((x) => x.track?.id === trackId);
    if (!r) return null;
    let n = null;
    try {
      (await r.getStats()).forEach((s) => {
        if (s.type === 'inbound-rtp' && (s.kind || s.mediaType) === 'audio') n = s.packetsReceived ?? 0;
      });
    } catch { /* conexão fechando */ }
    return n;
  }

  // Direto primeiro (2026-11-19): a conexão nova nasce só com o STUN (sem o TURN) e o TURN entra depois
  // de DIRETO_PRIMEIRO_MS — ligada direto, ele fica de reserva para o próximo reinício; sem ligar,
  // reinicia o ICE já com ele. Nos relatórios de 17 a 19/11 a conexão começava pelo TURN em ~1 de cada
  // 4 sessões com quem dava para ligar direto (o par do TURN ficava pronto antes).
  // reiniciar false: só troca os servidores (a outra ponta já está reiniciando, ver handleSignal).
  liberarTurn(peer, reiniciar = true) {
    if (!peer.soStun || peer.pc.connectionState === 'closed' || this.peers.get(peer.id) !== peer) return;
    peer.soStun = false;
    try {
      peer.pc.setConfiguration({ ...peer.pc.getConfiguration(), iceServers: this.iceServers });
    } catch (err) {
      console.warn('[rtc] TURN de reserva', err);
      this.refazer(peer.id, 'sem trocar os servidores de ICE');
      return;
    }
    if (reiniciar && !['connected', 'completed'].includes(peer.pc.iceConnectionState)) {
      peer.reinicioIce = -Infinity;
      this.restartIce(peer);
    }
  }

  // De volta ao direto: ligada pelo TURN, um dos lados (o que não é "polite") reinicia o ICE de tempos em
  // tempos para achar o caminho direto — o Chrome fica no par do TURN se o direto falhou na hora (uma
  // queda, o roteador demorando a abrir a porta) e não tenta de novo sozinho. No teste do kazu
  // (2026-11-19 19:06) a conexão caiu, voltou pelo TURN do lado dele e ficou ali, com o turbo a 0,8 Mbps,
  // até ele sair e entrar na sala (aí ligou direto). Espera VOLTA_DIRETO_MS e dobra a cada tentativa
  // sem sucesso (até VOLTA_DIRETO_MAX_MS): com quem só liga pelo TURN (4G), os reinícios ficam raros.
  async vigiarRelay(peer, agora) {
    if (peer.turnEscolhido || peer.polite || peer.vendoRelay || agora - (peer.relayVistoEm || 0) < 5000) return;
    peer.vendoRelay = true;
    peer.relayVistoEm = agora;
    try {
      const c = await this.caminhoPara(peer.id);
      if (!c || this.peers.get(peer.id) !== peer) return;
      if (!c.relay) {
        if (peer.relayDesde) peer.voltasDireto = (peer.voltasDireto || 0) + 1;
        peer.relayDesde = 0;
        peer.tentativasDireto = 0;
        return;
      }
      peer.relayDesde ||= agora;
      const espera = Math.min(VOLTA_DIRETO_MAX_MS, VOLTA_DIRETO_MS * 2 ** (peer.tentativasDireto || 0));
      if (agora - peer.relayDesde < espera) return;
      peer.relayDesde = agora;
      peer.tentativasDireto = (peer.tentativasDireto || 0) + 1;
      peer.reinicioIce = -Infinity;
      this.restartIce(peer);
    } finally {
      peer.vendoRelay = false;
    }
  }

  // O teste da conexão (turbo-teste.js) mediu os dois e escolheu: 'turn' (só o servidor no meio, deste lado) ou 'auto' (o
  // de sempre, direto primeiro). iPhone no 5G, 2026-11-25: direto por IPv6 com 260 ms de ida e volta; pelo TURN eram 50.
  // O outro lado é avisado para não ficar tentando voltar ao direto (vigiarRelay).
  usarCaminho(id, quer) {
    const peer = this.peers.get(id);
    if (!peer || !this.temTurn || peer.pc.connectionState === 'closed') return false;
    const turn = quer === 'turn';
    if (!turn && peer.turnEscolhido !== 'eu') return false;
    if (turn && peer.turnEscolhido === 'eu') return true;
    // Do zero: só reiniciar o ICE com a política 'relay' não basta, o Chrome segue usando as portas diretas que já
    // tinha (testado em 2026-11-25). É o mesmo refazer de quando uma conexão falha, uns 2 s.
    if (!this.refazer(id, turn ? 'pelo TURN, escolhido no teste da conexão' : 'de volta ao direto', null, turn ? { turnEscolhido: 'eu' } : { diretoPrimeiro: true })) return false;
    this.send(id, { caminho: turn ? 'turn' : 'auto' });
    return true;
  }

  // Procura de novo o melhor caminho (a conexão trocou sozinha para um bem mais lento)
  procurarCaminho(id) {
    const peer = this.peers.get(id);
    if (!peer || peer.turnEscolhido) return;
    this.restartIce(peer);
  }

  // Uma conexão à parte só para medir o TURN (quem joga): a oferta e os candidatos vão pelo canal do teste.
  // sinal(m): manda para o outro lado. Devolve { pc, canal, dados, receber(m) } ou null sem TURN.
  async sondaTurn(sinal) {
    if (!this.temTurn) return null;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: 'relay' });
    const dados = pc.createDataChannel('turbo-teste-dados', { ordered: false, maxRetransmits: 0 });
    const jogo = pc.createDataChannel('turbo-teste-jogo', { ordered: true, maxPacketLifeTime: 250 });
    const canal = pc.createDataChannel('turbo-teste', { ordered: true });
    pc.onicecandidate = ({ candidate }) => { if (candidate) sinal({ candidate: candidate.toJSON() }); };
    const fila = [];
    const receber = async (m) => {
      try {
        if (m.description) {
          await pc.setRemoteDescription(m.description);
          for (const c of fila.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        } else if (m.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {});
          else fila.push(m.candidate);
        }
      } catch (err) {
        console.warn('[rtc] sonda', err);
      }
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
    } catch (err) {
      console.warn('[rtc] sonda', err);
      pc.close();
      return null;
    }
    sinal({ description: pc.localDescription.toJSON() });
    return { pc, canal, dados, jogo, receber };
  }

  // O outro lado da sonda (quem compartilha): só o STUN, o TURN é o de quem joga
  responderSonda(sinal, onCanal) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers.map((x) => ({ ...x, urls: [].concat(x.urls).filter((u) => !/^turns?:/.test(u)) })).filter((x) => x.urls.length) });
    pc.onicecandidate = ({ candidate }) => { if (candidate) sinal({ candidate: candidate.toJSON() }); };
    pc.ondatachannel = ({ channel }) => onCanal(channel);
    const fila = [];
    const receber = async (m) => {
      try {
        if (m.description) {
          await pc.setRemoteDescription(m.description);
          await pc.setLocalDescription(await pc.createAnswer());
          sinal({ description: pc.localDescription.toJSON() });
          for (const c of fila.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        } else if (m.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {});
          else fila.push(m.candidate);
        }
      } catch (err) {
        console.warn('[rtc] sonda', err);
      }
    };
    return { pc, receber };
  }

  // Já negociou, ou tem o que pôr numa oferta (voz, tela, canal)?
  temOqueNegociar(peer) {
    const { pc } = peer;
    return !!(pc.localDescription || pc.remoteDescription || pc.getTransceivers().length || peer.ctrl || peer.mov || peer.turboCanal || peer.turboSomCanal);
  }

  // No máximo um reinício de ICE a cada 8 s por pessoa. Numa conexão que ainda não negociou nada (ninguém com voz
  // nem tela) não há o que reiniciar: o restartIce e o setConfiguration (o liberarTurn, aos 3 s) faziam o navegador
  // pedir uma oferta sem seção nenhuma, o Chrome a recusa ("max-bundle configured but ... no BUNDLE group") e a
  // conexão fica com erro de sessão — a oferta boa que chega depois também é recusada. Era o "Carregando a
  // imagem…" de 2026-11-22: com o PC sem microfone, a TV aberta antes de o PS5 entrar levava 14,8 s para mostrar a
  // imagem (0,4 s com a conexão sã).
  restartIce(peer) {
    if (!this.temOqueNegociar(peer)) return;
    const agora = performance.now();
    if (agora - peer.reinicioIce < 8000) return;
    peer.reinicioIce = agora;
    peer.reiniciosIce = (peer.reiniciosIce || 0) + 1;
    try {
      peer.pc.restartIce();
    } catch { /* conexão fechada */ }
  }

  // A cada segundo: a voz que devia sair e não entrou vai de novo; a oferta que ficou sem resposta
  // (perdida numa colisão) é desfeita e refeita; a conexão que caiu (Wi-Fi trocado por 4G, celular
  // que dormiu) refaz o caminho em 3 s, em vez de esperar o "failed", que leva até 30 s.
  vigiar() {
    const agora = performance.now();
    // A janela compartilhada mudou de tamanho: a escala de cada envio é refeita (ela sai do tamanho
    // da captura). Sem isso, a escala de 1,5 de uma janela em 1080p ficava numa janela de 926×562.
    let mudou = false;
    for (const scr of this.screens.values()) {
      const c = scr.stream?.getVideoTracks()[0]?.getSettings?.();
      const tamanho = c ? `${c.width}x${c.height}` : null;
      if (scr.tamanho && tamanho !== scr.tamanho) mudou = true;
      scr.tamanho = tamanho;
    }
    if (mudou) this.retuneAll();
    for (const peer of [...this.peers.values()]) { // cópia: refazer troca a conexão no meio
      const { pc } = peer;
      if (pc.connectionState === 'closed') continue;
      this.ajustarMic(peer);
      if (pc.signalingState === 'have-local-offer' && !peer.makingOffer && agora - peer.ofertaDesde > 6000) {
        peer.ofertaDesde = agora;
        // a segunda oferta seguida sem resposta: o outro lado não está negociando, refaz do zero
        // a oferta trazia os primeiros canais de dados: o rollback derruba o transporte deles, e o
        // canal criado antes nunca chega lá (testado no Chrome 158); refazer é o caminho limpo (ver fecharCanal)
        const canalNovo = /^m=application/m.test(pc.localDescription?.sdp || '') && !/^m=application/m.test(pc.currentRemoteDescription?.sdp || '');
        if (canalNovo) { this.refazer(peer.id, 'oferta com canal novo sem resposta'); continue; }
        if (++peer.ofertasPerdidas >= 2 && this.refazer(peer.id, 'ofertas sem resposta')) continue;
        pc.setLocalDescription({ type: 'rollback' })
          .then(() => { peer.reinicioIce = -Infinity; this.restartIce(peer); }) // força uma oferta nova
          .catch((err) => console.warn('[rtc] oferta sem resposta', err));
        continue;
      }
      if (pc.signalingState === 'stable') peer.ofertasPerdidas = 0;
      if (peer.renegociar) this.renegociar(peer);
      const ice = pc.iceConnectionState;
      if (ice === 'disconnected' || ice === 'failed') {
        peer.caiuDesde ||= agora;
        // o TURN escolhido caiu (ou nunca ligou): volta a valer qualquer caminho
        if (peer.turnEscolhido === 'eu' && agora - peer.caiuDesde > 3000 && agora - peer.turnDesde > 6000) this.usarCaminho(peer.id, 'auto');
        else if (agora - peer.caiuDesde > 3000) this.restartIce(peer);
      } else {
        peer.caiuDesde = 0;
      }
      // o "direto primeiro" só conta com algo negociando (ver restartIce)
      if (peer.soStun && !this.temOqueNegociar(peer)) peer.nasceuEm = agora;
      else if (peer.soStun && agora - peer.nasceuEm > DIRETO_PRIMEIRO_MS) this.liberarTurn(peer);
      if ((ice === 'connected' || ice === 'completed') && this.temTurn) this.vigiarRelay(peer, agora);
      // Negociada e sem ligar (ou caída) há 15 s, mesmo com o reinício de ICE: refaz do zero. Antes
      // ficava assim até alguém sair e entrar na sala (a voz do amigo não chegava).
      const ligada = ice === 'connected' || ice === 'completed';
      if (ligada && peer.refeitas && agora - peer.refeitaEm > 60000) peer.refeitas = 0; // firmou
      if (ligada || !pc.remoteDescription) {
        peer.semLigarDesde = 0;
      } else {
        peer.semLigarDesde ||= agora;
        if (agora - peer.semLigarDesde > 15000 && this.refazer(peer.id, `ICE ${ice} há 15 s`)) continue;
      }
    }
  }

  // -------------------------------------------------------------- webcam
  // Vai no rosto do boneco (Avatar.setCam): imagem pequena, 30 quadros (24 no celular) e pouca
  // banda; no celular sem recorte do rosto (podeRecortar), que pesava na thread do 3D. O stream é
  // sempre o mesmo (camStream): desligar e ligar de novo só troca a trilha, sem renegociar, e
  // quem recebe continua achando a câmera pelo mesmo id. Quem está longe avisa (interesse 'cam')
  // e para de receber. camFonte é a câmera de verdade; camTrack, o que sai (o rosto recortado).
  async startCam(deviceId = null) {
    const recortar = podeRecortar();
    const tam = recortar ? CAM_RECORTE : CAM;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : 'user',
        width: { ideal: tam.width },
        height: { ideal: tam.height },
        frameRate: { ideal: CAM.fps, max: CAM.fps },
      },
    });
    const fonte = stream.getVideoTracks()[0];
    fonte.contentHint = 'motion';
    let track = fonte;
    if (recortar) {
      try {
        track = recortarRosto(fonte);
      } catch (err) {
        console.warn('[rtc] recorte do rosto', err);
      }
    }
    this.camStream = this.camStream || new MediaStream();
    this.pararCam();
    this.camStream.addTrack(track);
    this.camTrack = track;
    this.camFonte = fonte;
    for (const peer of this.peers.values()) this.addCamTo(peer);
    return this.camStream;
  }

  pararCam() {
    const { camTrack: track, camFonte: fonte } = this;
    this.camTrack = null;
    this.camFonte = null;
    if (track) {
      this.camStream?.removeTrack(track);
      track.stop();
    }
    if (fonte && fonte !== track) fonte.stop();
  }

  stopCam() {
    if (!this.camTrack) return;
    this.pararCam();
    for (const peer of this.peers.values()) peer.camSender?.replaceTrack(null).catch(() => {});
  }

  get camId() {
    return this.camTrack ? this.camStream.id : null;
  }

  addCamTo(peer) {
    if (!this.camTrack) return;
    if (peer.camSender) {
      peer.camSender.replaceTrack(this.camTrack).catch((err) => console.warn('[rtc] webcam', err));
      return;
    }
    const tr = peer.pc.addTransceiver(this.camTrack, {
      direction: 'sendonly',
      streams: [this.camStream],
      sendEncodings: [{ maxBitrate: CAM.maxBitrate, maxFramerate: CAM.fps, active: peer.interesse.get('cam') !== 'off' }],
    });
    peer.camSender = tr.sender;
  }

  // longe ou sem olhar: a câmera para de ir para essa pessoa (o codificador nem roda para ela)
  async tuneCam(peer) {
    const sender = peer.camSender;
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) return;
      const ativo = peer.interesse.get('cam') !== 'off';
      if (params.encodings[0].active === ativo) return;
      params.encodings[0].active = ativo;
      await sender.setParameters(params);
    } catch (err) {
      if (err.name !== 'InvalidStateError') console.warn('[rtc] ajuste da webcam', err);
    }
  }

  // -------------------------------------------------------------- tela
  preset() {
    return SHARE_PRESETS[presetDe(this.shareMode)];
  }

  // já é tudo 60 quadros: o "turbo" de quando alguém controla a tela não muda mais nada
  turbo() {}

  // Alguém ligou (ou desligou) o modo jogo numa tela minha: quem olha de perto leva a banda de jogo,
  // e a conexão de quem joga (quem: os ids) ganha o piso de banda (bandaDeJogo)
  modoJogo(key, ligar, quem = []) {
    if (ligar) this.jogadores.set(key, new Set(quem));
    else this.jogadores.delete(key);
    for (const peer of this.peers.values()) this.atualizarBandaJogo(peer);
    if (ligar !== this.jogoTelas.has(key)) {
      if (ligar) this.jogoTelas.add(key);
      else this.jogoTelas.delete(key);
      console.info('[modo-jogo] banda de jogo', ligar ? 'ligada' : 'desligada', key, this.preset());
    }
    this.retuneAll(); // quem joga e quem só assiste (assiste) podem ter mudado
  }

  joga(peer) {
    for (const ids of this.jogadores.values()) if (ids.has(peer.id)) return true;
    return false;
  }

  // alguém joga nessa tela minha e essa pessoa não: só assiste
  assiste(peer, key) {
    return this.jogoTelas.has(key) && !this.jogadores.get(key)?.has(peer.id);
  }

  // a banda de jogo entra ou sai da conexão dessa pessoa: renegocia com o piso novo no SDP
  atualizarBandaJogo(peer) {
    const nova = this.joga(peer) ? bandaDeJogo(this.preset()) : null;
    const atual = peer.bandaJogo;
    if (nova?.inicio === atual?.inicio && nova?.piso === atual?.piso) return;
    peer.bandaJogo = nova;
    this.codecDeJogo(peer);
    if (!nova) {
      peer.semPiso = false;
      peer.balanceado = false;
      peer.linhasJogo = null;
      peer.rapido = false;
      peer.linhasPedidas = null;
      this.tuneScreen(peer);
    }
    console.info('[modo-jogo] banda da conexão', peer.id, nova ? `começa em ${nova.inicio} kbps, piso ${nova.piso} kbps` : 'normal');
    this.renegociar(peer);
  }

  // a rede de quem joga perde muito com o piso: fica só o começo alto
  soltarPisoJogo(id) {
    const peer = this.peers.get(id);
    if (!peer?.bandaJogo || peer.semPiso) return false;
    peer.semPiso = true;
    this.renegociar(peer);
    return true;
  }

  // Quem joga está recebendo a imagem em migalhas (a banda não dá para a resolução): 'balanced'
  // troca um pouco dos quadros por linhas. false volta a segurar os 60 quadros.
  imagemDeJogo(id, balanceado) {
    const peer = this.peers.get(id);
    if (!peer?.bandaJogo || peer.balanceado === balanceado) return false;
    peer.balanceado = balanceado;
    this.tuneScreen(peer);
    return true;
  }

  // A banda de quem joga está baixa: a tela sai com no máximo `linhas` linhas (null: a captura
  // inteira). Com a banda subindo e descendo, o navegador pulava de 1080 a 540 e voltava; cada
  // troca é um quadro-chave enorme, que demora a passar na banda curta, e o iPhone (o Safari não
  // deixa baixar o buffer) aumentava a espera para quase 0,4 s. Fixa, a imagem chega por igual.
  linhasDeJogo(id, linhas) {
    const peer = this.peers.get(id);
    if (!peer?.bandaJogo || peer.linhasJogo === linhas) return false;
    peer.linhasJogo = linhas;
    this.tuneScreen(peer);
    return true;
  }

  // o codec das telas para essa pessoa: o da placa enquanto ela joga, o de sempre fora disso
  codecDeJogo(peer) {
    for (const trs of peer.screenTransceivers.values()) {
      for (const tr of trs) {
        if (tr.receiver.track?.kind !== 'video') continue;
        if (peer.bandaJogo) preferirCodecDeJogo(tr, peer.recuoCodec >= 1);
        else preferirCodec(tr);
      }
    }
  }

  // TV: nunca H.265. A Philips (Android, 2026-11-23 11:52) diz que decodifica e mostra a imagem com uma faixa
  // verde embaixo e as cores fora do lugar (a sobra do quadro do H.265, 768 linhas para 720, sem o corte), a
  // 27–240 ms por quadro. Tira o H.265 do que esta página aceita receber, antes de cada oferta e resposta.
  soH264(pc) {
    if (!this.semHevc) return;
    // o H.264 na frente (com os pacotes do modo 1, o dos codificadores da placa) e o resto, menos o H.265, de
    // reserva: quem responde manda na ordem, e sem isto ela começava pelo VP8
    const nota = (c) => (c.mimeType === 'video/H264' ? (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 0 : 1) : 2);
    const codecs = (RTCRtpReceiver.getCapabilities?.('video')?.codecs || []).filter((c) => c.mimeType !== 'video/H265').sort((a, b) => nota(a) - nota(b));
    if (!codecs.length) return;
    for (const tr of pc.getTransceivers()) {
      if (tr.receiver.track?.kind !== 'video' || tr.stopped) continue;
      try { tr.setCodecPreferences?.(codecs); } catch (err) { console.warn('[rtc] sem H.265', err); }
    }
  }

  // Quem joga pediu a imagem com no máximo tantas linhas (a TV que não dá conta de decodificar): null tira
  linhasPedidas(id, linhas) {
    const peer = this.peers.get(id);
    const v = [432, 576, 720].includes(linhas) ? linhas : null;
    if (!peer || (peer.linhasPedidas ?? null) === v) return false;
    peer.linhasPedidas = v;
    this.tuneScreen(peer);
    return true;
  }

  // as seções do som das minhas telas que vão em estéreo para quem joga (comEstereo)
  midsSomDeJogo(peer) {
    const mids = new Set();
    if (!peer.bandaJogo) return mids;
    for (const trs of peer.screenTransceivers.values()) for (const tr of trs) if (tr.mid && tr.receiver.track?.kind === 'audio') mids.add(tr.mid);
    return mids;
  }

  // as seções das minhas telas em que o perfil do H.264 é trocado (trocarPerfil)
  midsDeJogo(peer) {
    const mids = new Set();
    if (!peer.bandaJogo || peer.recuoCodec >= 2) return mids;
    for (const trs of peer.screenTransceivers.values()) for (const tr of trs) if (tr.mid && tr.receiver.track?.kind === 'video') mids.add(tr.mid);
    return mids;
  }

  // Quem joga não decodificou nada por 6 s depois da troca de codec: um passo atrás (1: sem o
  // H.265; 2: sem a troca de perfil, como era antes) e renegocia. Devolve o passo, ou 0.
  codecSeguroJogo(id) {
    const peer = this.peers.get(id);
    if (!peer?.bandaJogo || peer.recuoCodec >= 2) return 0;
    peer.recuoCodec++;
    this.codecDeJogo(peer);
    this.renegociar(peer);
    return peer.recuoCodec;
  }

  // Quem joga pediu menos atraso (opção "Menos atraso"): 720p fixo e até 8 Mbps para essa pessoa.
  // Quadros menores codificam (12 → ~5 ms na NVIDIA), viajam e decodificam mais rápido, e chegam
  // mais por igual: o buffer do celular, a maior parte do atraso, fica menor.
  rapidoJogo(id, ligar) {
    const peer = this.peers.get(id);
    if (!peer || !!peer.rapido === ligar) return false;
    peer.rapido = ligar;
    this.tuneScreen(peer);
    return true;
  }

  // banda inicial e piso (kbps) que vão no SDP desta conexão
  bandaSdp(peer) {
    const j = peer.bandaJogo;
    return j ? [j.inicio, peer.semPiso ? 0 : j.piso] : [this.banda(peer), 0];
  }

  // uma oferta nova assim que a conexão estiver parada (senão o vigia tenta no próximo segundo)
  renegociar(peer) {
    peer.renegociar = true;
    const { pc } = peer;
    if (pc.connectionState === 'closed' || pc.signalingState !== 'stable' || peer.makingOffer) return;
    peer.negociar();
  }

  // O envio de UMA tela para UMA pessoa: do quanto ela precisa (NIVEIS) e da banda do preset,
  // dividida pelo peso das telas que ela vê (a que olha de perto leva quase tudo), entre o piso e
  // o teto do nível. Uma tela pequena sozinha não fica com o preset inteiro (soma < 1).
  envioPara(peer, key) {
    // modo turbo: a imagem vai pelo canal "turbo" (turboPara)
    if (peer.turbo?.has(key)) return { active: false, maxBitrate: 150_000, maxFramerate: 1, scaleResolutionDownBy: 1 };
    const preset = this.preset();
    const scr = this.screens.get(key);
    let nivel = nivelDe(peer, key);
    // Alguém joga nesta tela e essa pessoa só assiste: no máximo 540p a 30. Na malha cada conexão
    // tem o próprio codificador — quem assistia de perto fazia a placa codificar o 1080p60 duas
    // vezes, e quem joga perdia os quadros.
    if (this.assiste(peer, key) && (nivel === NIVEIS.max || nivel === NIVEIS.medio)) nivel = NIVEIS.baixo;
    let soma = 0;
    for (const k of this.screens.keys()) soma += nivelDe(peer, k).peso;
    const parte = nivel.peso / Math.max(1, soma);
    // altura do que sai no nível máximo: a da captura (no arquivo maior que o preset, já reduzida
    // pelo extraScale)
    const extra = scr?.extraScale || 1;
    // o tamanho medido nos quadros (capturaMedida) vale mais que o das configurações
    const cfg = scr?.medido || scr?.stream?.getVideoTracks()[0]?.getSettings?.() || {};
    const altura = (cfg.height || preset.height * extra) / extra;
    let escala = nivel.linhas ? Math.max(1, altura / nivel.linhas) : nivel.escala;
    const jogo = nivel === NIVEIS.max && this.jogoTelas.has(key);
    let banda = jogo ? preset.jogoBitrate : preset.maxBitrate;
    // tela do OBS a 120: quem olha de perto recebe todos os quadros, com mais banda para eles
    const qpsAlto = nivel === NIVEIS.max && scr?.qps > nivel.fps && peer.hz >= 90 ? Math.min(scr.qps, peer.hz) : null;
    if (qpsAlto) banda = Math.min(banda * 1.5, 30_000_000);
    // modo jogo com pouca banda: resolução fixa (linhasDeJogo) em vez de deixar pular; com "Menos
    // atraso" (rapidoJogo), 720p sempre
    const linhasJogo = jogo ? Math.min(peer.linhasJogo || Infinity, peer.rapido ? 720 : Infinity, peer.linhasPedidas || Infinity) : Infinity;
    if (linhasJogo < altura) {
      escala = altura / linhasJogo;
      // A banda cai junto com os pixels (720 de 1080: metade). Em 720p com a banda do 1080p a fila
      // de envio não esvaziava na queda do Wi-Fi, e a travada continuava.
      banda *= Math.max(0.5, (linhasJogo / altura) ** 2);
    }
    if (jogo && peer.rapido) banda = Math.min(banda, 8_000_000);
    if (jogo && peer.linhasPedidas && peer.linhasPedidas <= 576) banda = Math.min(banda, 4_000_000);
    return {
      active: nivel !== NIVEIS.off,
      maxBitrate: Math.round(Math.min(banda * nivel.teto, Math.max(nivel.piso, banda * parte))),
      maxFramerate: qpsAlto || nivel.fps,
      // medidas pares: senão a placa recusa e o Chrome codifica no processador (escalaPar)
      scaleResolutionDownBy: escalaPar(cfg.width, cfg.height, Math.max(1, escala * extra)),
    };
  }

  // os quadros por segundo pedidos à captura (o envio sai em no máximo preset.fps)
  qpsCaptura() {
    return QPS_CAPTURA ?? Math.max(QPS_PADRAO, this.preset().fps);
  }

  // o ritmo pedido à captura de uma tela minha (a do OBS fica no dela ao mudar de tamanho)
  qpsDaTela(key) {
    return this.screens.get(key)?.qps || this.qpsCaptura();
  }

  // O som do PC para a tela do OBS (a câmera virtual só leva a imagem): pede a tela inteira com
  // "Compartilhar áudio do sistema", fica só com o som e larga a imagem. Desistiu ou não marcou o
  // áudio: null (a tela vai sem som). Vem antes da câmera, enquanto o clique ainda vale para o seletor.
  async somDoSistema() {
    if (!navigator.mediaDevices?.getDisplayMedia) return null;
    let s;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: { ideal: 1, max: 5 }, width: { max: 640 }, height: { max: 360 } },
        audio: {
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
          restrictOwnAudio: true, // não reenvia a voz dos amigos que sai desta aba
        },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'include',
      });
    } catch (err) {
      console.warn('[rtc] som do sistema para o OBS', err);
      return null;
    }
    for (const t of s.getVideoTracks()) t.stop();
    return s.getAudioTracks()[0] || null;
  }

  // A tela pela câmera virtual do OBS ("Iniciar câmera virtual", com o OBS a 120 qps). A câmera
  // só leva a imagem; o som vem do sistema (somDoSistema), se a pessoa marcar no seletor.
  async captureObs() {
    escolherCodec();
    const som = await this.somDoSistema();
    try {
      const stream = await this.camObs();
      if (som) {
        stream.addTrack(som);
        // parou o som pela faixa do Chrome: a tela continua, só sem som
        som.addEventListener('ended', () => stream.removeTrack(som));
      }
      return this.prepararCaptura(stream);
    } catch (err) {
      som?.stop();
      throw err;
    }
  }

  async camObs() {
    const preset = this.preset();
    const acharObs = async () => (await navigator.mediaDevices.enumerateDevices())
      .find((d) => d.kind === 'videoinput' && /obs/i.test(d.label));
    let cam = await acharObs();
    if (!cam) {
      // sem a permissão da câmera os nomes vêm vazios: pede uma vez e procura de novo
      const s = await navigator.mediaDevices.getUserMedia({ video: true }).catch((err) => {
        if (err.name === 'NotAllowedError') throw err;
        return null;
      });
      for (const t of s?.getTracks() || []) t.stop();
      cam = await acharObs();
    }
    if (!cam) throw Object.assign(new Error('Não achei a câmera virtual do OBS. Instale o OBS Studio e clique em "Iniciar câmera virtual".'), { name: 'SemObs' });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: cam.deviceId },
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: QPS_OBS, max: QPS_OBS },
        },
      });
    } catch (err) {
      if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        throw Object.assign(new Error('A câmera virtual do OBS está desligada. No OBS, clique em "Iniciar câmera virtual" e tente de novo.'), { name: 'SemObs' });
      }
      throw err;
    }
    return stream;
  }

  // pede a aba/janela/tela ao navegador; quem chama decide se publica (addScreen)

  // monitor: o seletor abre na aba "Tela inteira"
  async captureScreen({ monitor = false } = {}) {
    escolherCodec(); // se ainda não rodou (ver constructor): fica pronto enquanto a pessoa escolhe a janela
    const preset = this.preset();
    const qps = this.qpsCaptura();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: qps, max: qps },
        width: { max: preset.width },
        height: { max: preset.height },
        cursor: 'always',
        ...(monitor ? { displaySurface: 'monitor' } : {}),
      },
      audio: {
        channelCount: { ideal: 2 }, // estéreo: no modo jogo vai assim para quem joga (comEstereo)
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
        restrictOwnAudio: true, // não reenvia a voz dos amigos que sai desta aba
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
    });
    return this.prepararCaptura(stream);
  }

  // Aba entregue pela extensão (chrome.tabCapture, Alt+Shift+S): sem a faixa "Compartilhando..."
  // que o Chrome põe no topo quando a aba vem do seletor. O id só vale nesta aba da sala.
  async captureAba(streamId) {
    const preset = this.preset();
    const fonte = { chromeMediaSource: 'tab', chromeMediaSourceId: streamId };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: fonte },
      video: { mandatory: { ...fonte, maxWidth: preset.width, maxHeight: preset.height, maxFrameRate: preset.fps } },
    });
    return this.prepararCaptura(stream);
  }

  prepararCaptura(stream) {
    const video = stream.getVideoTracks()[0];
    if (video) video.contentHint = 'motion';
    const audio = stream.getAudioTracks()[0];
    if (audio) audio.contentHint = 'music';
    return stream;
  }

  // Põe uma tela no ar para todo mundo (chamar depois do servidor reservar a tela).
  // Arquivo transmitido: o stream vem do próprio <video> (captureStream).
  // qps: o ritmo da captura quando passa de 60 (a do OBS)
  addScreen(key, stream, { file = false, height = 0, qps = null } = {}) {
    if (file) this.prepararCaptura(stream);
    const alto = this.preset().height;
    this.screens.set(key, { stream, extraScale: file && height > alto ? height / alto : 1, qps });
    for (const peer of this.peers.values()) this.addScreenTo(peer, key);
    this.retuneAll(); // a banda de cada pessoa agora é dividida por mais uma
  }

  addScreenTo(peer, only = null) {
    for (const [key, scr] of this.screens) {
      if (only && key !== only) continue;
      const trs = peer.screenTransceivers.get(key) || [];
      for (const track of scr.stream.getTracks()) {
        // um envio por tipo (vídeo/áudio); o que já existe fica
        if (trs.some((tr) => tr.receiver.track.kind === track.kind)) continue;
        const init = { direction: 'sendonly', streams: [scr.stream] };
        if (track.kind === 'video') {
          init.sendEncodings = [{ ...this.envioPara(peer, key), networkPriority: 'high', priority: 'high' }];
        } else {
          // o Opus aqui é mono (sem stereo=1 no SDP) e o Chrome usa o teto como alvo: com 192k
          // gastava ~220 kbps por conexão, e 96k mono já é transparente para música e filme
          init.sendEncodings = [{ maxBitrate: 96_000, networkPriority: 'high', priority: 'high' }];
        }
        const tr = peer.pc.addTransceiver(track, init);
        if (track.kind === 'video' && peer.bandaJogo) preferirCodecDeJogo(tr, peer.recuoCodec >= 1);
        else if (track.kind === 'video') preferirCodec(tr);
        trs.push(tr);
      }
      peer.screenTransceivers.set(key, trs);
    }
    this.tuneScreen(peer);
  }

  // degradationPreference só existe no nível do sender: tem que ser aplicado depois, com
  // setParameters — não dá para passar em addTransceiver. Um ajuste por vez por pessoa (o
  // setParameters reclama de pedidos sobrepostos): o que chegar no meio roda logo em seguida.
  async tuneScreen(peer) {
    if (peer.ajustando) {
      peer.ajustarDeNovo = true;
      return;
    }
    peer.ajustando = true;
    try {
      do {
        peer.ajustarDeNovo = false;
        for (const [key, trs] of peer.screenTransceivers) {
          if (!this.screens.has(key)) continue;
          for (const tr of trs) {
            const sender = tr.sender;
            if (!sender || sender.track?.kind !== 'video') continue;
            try {
              const params = sender.getParameters();
              if (!params.encodings || !params.encodings.length) params.encodings = [{}];
              // 60 quadros sempre: se apertar, cai a resolução e não a fluidez (no modo jogo, com a
              // imagem em migalhas, divide a perda entre os dois: imagemDeJogo)
              // e com a resolução fixa (linhasDeJogo), nem uma nem outra: o navegador reduzia por
              // cima da escala (720p virava 360p) — só a nitidez cede (navegador sem: segura os quadros)
              // Para quem joga, sempre: o navegador reduzindo sozinho (3/4, 1/2, 3/8...) dava
              // medida ímpar, e com medida ímpar a placa recusa e o Chrome fica no processador
              // (escalaPar). Com a banda curta quem reduz é o linhasDeJogo, sempre em medida par.
              const jogo = this.jogoTelas.has(key);
              // Quem só assiste a um jogo: cede quadros e não linhas — reduzindo sozinho, o navegador
              // dava medida ímpar e esse envio ia para o processador do PC do jogo.
              params.degradationPreference = peer.balanceado && jogo ? 'balanced'
                : this.assiste(peer, key) ? 'maintain-resolution'
                  : peer.bandaJogo && jogo && !this.semFixa ? 'maintain-framerate-and-resolution' : 'maintain-framerate';
              Object.assign(params.encodings[0], this.envioPara(peer, key), { networkPriority: 'high', priority: 'high' });
              await sender.setParameters(params);
            } catch (err) {
              // navegador que não conhece o 'maintain-framerate-and-resolution': fica no de sempre
              if (err.name === 'TypeError' && !this.semFixa && peer.bandaJogo) {
                this.semFixa = true;
                peer.ajustarDeNovo = true;
                continue;
              }
              // a negociação mudou os parâmetros no meio (logo que a tela entra): tenta de novo já já
              if (err.name === 'InvalidModificationError' && (peer.tentativas = (peer.tentativas || 0) + 1) <= 5) {
                setTimeout(() => this.tuneScreen(peer), 300);
              } else {
                console.warn('[rtc] ajuste do envio', err);
              }
              continue;
            }
            peer.tentativas = 0;
          }
        }
      } while (peer.ajustarDeNovo);
    } finally {
      peer.ajustando = false;
    }
  }

  // O captureStream() de um <video> encerra as trilhas quando o arquivo chega ao fim e cria
  // trilhas novas se ele voltar a tocar. Troca a trilha no envio (sem renegociar) e cria o
  // envio para quem entrou na sala enquanto o vídeo estava parado.
  replaceScreenTrack(key, track) {
    track.contentHint = track.kind === 'video' ? 'motion' : 'music';
    for (const peer of this.peers.values()) {
      const tr = (peer.screenTransceivers.get(key) || []).find((t) => t.receiver.track.kind === track.kind);
      if (tr) tr.sender.replaceTrack(track).catch((err) => console.warn('[rtc] troca de trilha', err));
      else this.addScreenTo(peer, key);
    }
  }

  // Modo jogo: a captura de uma tela minha no máximo com `linhas` linhas (null: a do preset). A
  // captura de um jogo pesado em 1080p ficava em ~32 qps e numa janela pequena em ~55: menor, o
  // Chrome copia menos da placa a cada quadro. Devolve as linhas que a captura tem agora.
  async capturaDeJogo(key, linhas) {
    const track = this.screens.get(key)?.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    const preset = this.preset();
    const alto = linhas || preset.height;
    const largo = linhas ? Math.round((linhas * 16) / 9) : preset.width;
    try {
      await track.applyConstraints({ width: { max: largo }, height: { max: alto }, frameRate: { ideal: this.qpsDaTela(key), max: this.qpsDaTela(key) } });
    } catch (err) {
      console.warn('[modo-jogo] tamanho da captura', err);
      return null;
    }
    delete this.screens.get(key).medido; // o medido era do tamanho antigo: vale o novo das configurações
    this.retuneAll(); // a escala de cada envio sai da altura da captura
    return track.getSettings().height ?? null;
  }

  // O Chrome caiu no processador (OpenH264) e não volta sozinho: nem escala nova, nem desligar e
  // ligar o envio, nem trocar a trilha, nem renegociar o codec. Volta quando o tamanho da própria
  // captura muda para medidas pares: aqui a captura vai para o par logo abaixo do tamanho atual.
  // O Chrome mantém a proporção arredondando a largura (750 linhas numa janela de 1283×751 davam
  // 1281), por isso a altura é escolhida com a largura que vai dar par.
  async reiniciarCodificador(key) {
    const scr = this.screens.get(key);
    const track = scr?.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    const { width: largura, height: altura } = scr.medido || track.getSettings();
    if (!largura || !altura) return null;
    for (let linhas = Math.floor((altura - 1) / 2) * 2; linhas >= altura - 80 && linhas >= 2; linhas -= 2) {
      const colunas = Math.round((largura * linhas) / altura);
      if (colunas % 2 || Math.abs((largura * linhas) / altura - colunas) > 0.4) continue;
      try {
        await track.applyConstraints({ width: { max: colunas }, height: { max: linhas }, frameRate: { ideal: this.qpsDaTela(key), max: this.qpsDaTela(key) } });
      } catch (err) {
        console.warn('[modo-jogo] reinício do codificador', err);
        return null;
      }
      delete scr.medido;
      this.retuneAll();
      // nativoPar: a captura de antes era par (a medida ímpar vinha da escala): dá para voltar a ela
      return { tamanho: `${colunas}x${linhas}`, nativoPar: largura % 2 === 0 && altura % 2 === 0 };
    }
    return null;
  }

  // O tamanho dos quadros que a captura de uma tela minha está entregando (das estatísticas, no
  // modo jogo): mudou, a escala de cada envio é refeita
  capturaMedida(key, width, height) {
    const scr = this.screens.get(key);
    if (!scr || !width || !height || (scr.medido?.width === width && scr.medido?.height === height)) return;
    scr.medido = { width, height };
    this.retuneAll();
  }

  // reaplica em todos (preset mudou ou o número de telas mudou)
  retuneAll() {
    for (const peer of this.peers.values()) this.tuneScreen(peer);
  }

  // tira uma tela do ar (key) ou todas
  // manterTrilhas: tira a tela do envio sem desligar a captura (reconexão: ela volta com chave nova)
  stopScreen(key = null, { manterTrilhas = false } = {}) {
    const keys = key == null ? [...this.screens.keys()] : [key];
    for (const k of keys) {
      const scr = this.screens.get(k);
      if (!scr) continue;
      if (!manterTrilhas) for (const t of scr.stream.getTracks()) t.stop();
      this.screens.delete(k);
      this.jogoTelas.delete(k);
      for (const peer of this.peers.values()) {
        for (const tr of peer.screenTransceivers.get(k) || []) {
          try {
            peer.pc.removeTrack(tr.sender);
            tr.stop();
          } catch { /* conexão já fechada */ }
        }
        peer.screenTransceivers.delete(k);
        peer.interesse.delete(k);
      }
    }
    if (keys.length) this.retuneAll(); // sobra mais banda para as que ficaram
  }

  // -------------------------------------------------------------- interesse (quem vê o quê)
  // Quem assiste avisa quanto precisa de cada tela minha ({ chave: nível de NIVEIS }). Nível que
  // esta versão não conhece fica de fora: abas de versões diferentes convivem. Tela de que ela
  // ainda não falou vai como 'mini' (nivelDe). A chave 'cam' é a minha webcam (só 'max' ou 'off').
  receberInteresse(peer, mapa, hz) {
    if (!mapa || typeof mapa !== 'object') return;
    let mudou = false;
    // os Hz da tela dela (versão de antes: não diz, fica em 60)
    const novoHz = Number.isFinite(hz) ? Math.max(30, Math.min(240, hz)) : null;
    if (novoHz && Math.abs(novoHz - (peer.hz || 60)) >= 5) {
      peer.hz = novoHz;
      mudou = true;
    }
    let cam = false;
    for (const [k, v] of Object.entries(mapa)) {
      if (!NIVEIS[v] || peer.interesse.get(k) === v) continue;
      peer.interesse.set(k, v);
      if (k === 'cam') cam = true;
      else mudou = true;
    }
    if (mudou) this.tuneScreen(peer);
    if (cam) this.tuneCam(peer);
  }

  // Eu (que assisto) aviso a quem compartilha quanto preciso de cada tela dele. Vai em dobro: o
  // 'interesse' no vocabulário de antes (sem 'medio'; o 'baixo' antigo é 540p a 60, o mesmo que o
  // 'medio' de agora) para a aba aberta antes do deploy, que descarta nível desconhecido e
  // deixaria a tela presa no último pedido (até 'off', tela preta); e o 'interesse2' completo.
  enviarInteresse(id, mapa) {
    if (!this.peers.has(id)) return;
    let compat = mapa;
    for (const v of Object.values(mapa)) {
      if (v !== 'medio') continue;
      compat = {};
      for (const [k, n] of Object.entries(mapa)) compat[k] = n === 'medio' ? 'baixo' : n;
      break;
    }
    this.send(id, compat === mapa ? { interesse: mapa, hz: HZ_TELA } : { interesse: compat, interesse2: mapa, hz: HZ_TELA });
  }

  // -------------------------------------------------------------- conexões
  // herdar: o que vem da conexão anterior quando ela é refeita do zero (ver refazer)
  getPeer(id, herdar = null) {
    let peer = this.peers.get(id);
    if (peer) return peer;

    // max-bundle: um transporte só desde a 1ª oferta. No 'balanced' o Chrome junta candidatos
    // (e reserva TURN) para cada seção até a resposta: voz + câmera + tela abriam 4 transportes
    // por pessoa que entrava.
    // direto primeiro (liberarTurn): só o STUN nos primeiros DIRETO_PRIMEIRO_MS. Refeita do zero (herdar:
    // a anterior falhou) já nasce com o TURN.
    const soStun = this.temTurn && (!herdar || herdar.diretoPrimeiro) && this.iceServers.some((x) => [].concat(x.urls).some((u) => /^stun:/.test(u)));
    const servidores = soStun
      ? this.iceServers.map((x) => ({ ...x, urls: [].concat(x.urls).filter((u) => !/^turns?:/.test(u)) })).filter((x) => x.urls.length)
      : this.iceServers;
    const pc = new RTCPeerConnection({ iceServers: servidores, bundlePolicy: 'max-bundle', ...(herdar?.turnEscolhido === 'eu' ? { iceTransportPolicy: 'relay' } : {}) });
    peer = {
      id,
      pc,
      polite: this.selfId > id,
      makingOffer: false,
      ignoreOffer: false,
      aplicandoResposta: false, // setRemoteDescription(answer) em andamento (ver handleSignal)
      ofertaDesde: 0, // quando saiu a minha última oferta (o vigia desfaz a que nunca teve resposta)
      caiuDesde: 0, // desde quando o ICE está desconectado
      reinicioIce: -Infinity, // quando foi o último (performance.now); com 0, uma página aberta há menos de 8 s não reiniciava
      soStun, // ainda sem o TURN (liberarTurn)
      nasceuEm: performance.now(),
      relayDesde: 0, // desde quando está ligada pelo TURN (vigiarRelay)
      tentativasDireto: 0, // reinícios seguidos atrás do caminho direto (vigiarRelay)
      voltasDireto: 0, // vezes que saiu do TURN para o direto
      criadaEm: Date.now(), // relatório do modo jogo: há quanto tempo esta conexão existe
      reiniciosIce: 0, // e quantas vezes o ICE foi reiniciado nela
      banda: null, // banda inicial da conexão, em kbps (ver banda)
      bandaJogo: null, // { inicio, piso } em kbps: essa pessoa joga numa tela minha (atualizarBandaJogo)
      semPiso: false, // o piso de jogo saiu (soltarPisoJogo)
      balanceado: false, // a tela de jogo dela sai em 'balanced' (imagemDeJogo)
      linhasJogo: null, // a tela de jogo dela sai com no máximo essas linhas (linhasDeJogo)
      rapido: false, // ela pediu menos atraso: 720p fixo (rapidoJogo)
      recuoCodec: 0, // passos atrás no codec de jogo (codecSeguroJogo)
      renegociar: false, // falta mandar uma oferta nova (renegociar)
      ctrl: null, // canal do controle remoto (ver canalControle)
      mov: null, // o do movimento do mouse no modo jogo (ver canalMovimento)
      micSender: null,
      micVai: null, // a trilha que está no micSender agora (null: a voz não vai para essa pessoa)
      ouveMic: true, // essa pessoa pode ouvir a minha voz (vozPara)
      camSender: null,
      screenTransceivers: new Map(), // key da tela -> transceivers (vídeo e áudio)
      interesse: new Map(), // key da tela -> quanto essa pessoa precisa dela (ver NIVEIS)
      pending: [],
      epoca: 0, // quantas vezes a conexão com essa pessoa foi refeita do zero (ver refazer)
      refeitaEm: -Infinity, // quando foi refeita pela última vez (performance.now; com 0, só depois de 20 s de página)
      semLigarDesde: 0, // desde quando a conexão negociada não liga (ver vigiar)
      ofertasPerdidas: 0, // ofertas seguidas que ficaram sem resposta (ver vigiar)
      ...herdar,
    };
    this.peers.set(id, peer);
    // quem joga e reconectou já volta com a banda de jogo
    if (this.joga(peer)) peer.bandaJogo = bandaDeJogo(this.preset());

    // também chamada direto quando só o SDP muda (renegociar), sem o navegador pedir
    peer.negociar = async () => {
      try {
        peer.makingOffer = true;
        peer.renegociar = false;
        this.soH264(pc);
        let oferta = await pc.createOffer();
        // outra negociação começou enquanto a oferta era montada: o evento volta sozinho depois
        if (pc.signalingState !== 'stable') return;
        // sem nada vivo na oferta, o Chrome a recusa e estraga a conexão (ver restartIce)
        if (!/^a=group:BUNDLE/m.test(oferta.sdp || '')) {
          // nada para negociar ainda: o vigia tenta de novo quando houver
          if (!/^m=/m.test(oferta.sdp || '')) return void (peer.renegociar = true);
          // só seções encerradas (a única tela saiu do ar, numa conexão sem voz): um canal vazio mantém a oferta válida
          if (!peer.base || peer.base.readyState === 'closed') peer.base = pc.createDataChannel('base');
          oferta = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
        }
        await pc.setLocalDescription(comEstereo(comBandaInicial(oferta, ...this.bandaSdp(peer)), null));
        peer.ofertaDesde = performance.now();
        this.send(id, { description: trocarPerfil(pc.localDescription, this.midsDeJogo(peer), '42001f', '42e01f'), e: peer.epoca });
      } catch (err) {
        console.warn('[rtc] offer', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onnegotiationneeded = () => peer.negociar();
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(id, { candidate, e: peer.epoca });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') this.restartIce(peer);
    };
    // Redes diferentes atrás de CGNAT (comum em fibra e 4G) não fecham conexão direta: sem TURN
    // a tela fica preta e a voz muda. Primeiro refaz a conexão do zero (o mesmo que sair e entrar);
    // só avisa se nem assim ligar.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' || this.peers.get(id) !== peer) return;
      if (!this.refazer(id, 'a conexão falhou') && peer.epoca >= 2) this.onFalha?.(id, this.temTurn);
    };
    // canal do controle remoto: quem controla abre (ver canalControle); aqui chega o de quem me controla
    pc.ondatachannel = ({ channel }) => {
      if (channel.label === 'controle') this.ligarCanal(peer, channel);
      else if (channel.label === 'controle-mov') this.ligarCanal(peer, channel, 'mov');
      // modo turbo: quem joga pediu a imagem de uma tela minha por fora do vídeo (turbo.js)
      else if (channel.label === 'turbo') this.onTurbo?.(peer.id, channel);
      else if (channel.label === 'turbo-som') this.onTurboSom?.(peer.id, channel);
      // o teste da conexão antes do jogo (turbo-teste.js)
      else if (channel.label === 'turbo-teste') this.onTeste?.(peer.id, channel);
      else if (/^turbo-teste-(dados|jogo)$/.test(channel.label)) this.onTesteDados?.(peer.id, channel);
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      if (this.semSincronia && this.juntarSom(peer, stream, ev.track)) return;
      this.onTrack(id, stream, ev.track);
      ev.track.addEventListener('unmute', () => this.onTrack(id, stream, ev.track));
    };

    if (this.micTrack) {
      peer.micSender = pc.addTrack(this.micTrack, this.micStream);
      peer.micVai = this.micTrack;
      this.ajustarMic(peer); // mudo: entra sem a trilha
    }
    this.addCamTo(peer);
    this.addScreenTo(peer);
    return peer;
  }

  // O som solto (somSolto) volta para a MediaStream da imagem dele, e quem recebe vê uma só, como sempre.
  // Devolve true quando era o som (a imagem segue o caminho normal, levando o som que chegou antes).
  juntarSom(peer, stream, track) {
    peer.imagens ??= new Map(); // id da transmissão -> a MediaStream da imagem
    peer.sonsSoltos ??= new Map(); // id da transmissão -> a trilha do som dela
    if (track.kind === 'video') {
      peer.imagens.set(stream.id, stream);
      const som = peer.sonsSoltos.get(stream.id);
      if (som && som.readyState === 'live' && !stream.getTracks().includes(som)) stream.addTrack(som);
      return false;
    }
    if (!stream.id.endsWith(SEM_SINCRONIA)) return false;
    const base = stream.id.slice(0, -SEM_SINCRONIA.length);
    peer.sonsSoltos.set(base, track);
    const avisar = () => {
      const imagem = peer.imagens.get(base);
      if (!imagem || peer.sonsSoltos.get(base) !== track) return;
      for (const t of imagem.getAudioTracks()) if (t !== track) imagem.removeTrack(t);
      if (!imagem.getTracks().includes(track)) imagem.addTrack(track);
      this.onTrack(peer.id, imagem, track);
    };
    // a outra ponta tirou o som
    stream.addEventListener('removetrack', (e) => {
      if (e.track !== track) return;
      if (peer.sonsSoltos.get(base) === track) peer.sonsSoltos.delete(base);
      peer.imagens.get(base)?.removeTrack(track);
    });
    track.addEventListener('unmute', avisar);
    avisar();
    return true;
  }

  // -------------------------------------------------------------- controle remoto direto
  // Mouse e teclado de quem controla vão direto para quem compartilha, pela mesma conexão do
  // vídeo — sem a ida e volta pelo servidor, que somava a distância até o Render a cada tecla.
  // O canal só abre quando alguém controla (uma renegociação). Enquanto não abre, o evento vai
  // pelo servidor como antes: mandarControle devolve false.
  canalControle(id) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    if (!peer.ctrl || peer.ctrl.readyState === 'closed') {
      try {
        this.ligarCanal(peer, peer.pc.createDataChannel('controle', { ordered: true }));
      } catch {
        return null;
      }
    }
    return peer.ctrl.readyState === 'open' ? peer.ctrl : null;
  }

  // Modo jogo: o movimento do mouse vai num canal à parte, sem ordem e sem reenvio. No canal de
  // sempre (ordenado), um pacote perdido no Wi-Fi segurava tudo o que vinha atrás até ser reenviado:
  // a câmera travava e depois pulava. Aqui cada mensagem leva o total andado desde o começo (ver
  // controle.enviarMove): a que se perde não faz falta, a seguinte traz a soma.
  canalMovimento(id) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    if (!peer.mov || peer.mov.readyState === 'closed') {
      try {
        this.ligarCanal(peer, peer.pc.createDataChannel('controle-mov', { ordered: false, maxRetransmits: 0 }), 'mov');
      } catch {
        return null;
      }
    }
    return peer.mov.readyState === 'open' ? peer.mov : null;
  }

  // Modo turbo (turbo.js), do lado de quem joga: um canal só para a imagem, ordenado e com vida
  // curta (um pedaço que perdeu a hora não segura os seguintes). Um por vez: abrir de novo fecha o anterior.
  // vida: ms que cada pedaço vale no canal (turbo.js, TTL_MS); passou disso sem chegar, é largado.
  // vida null: canal confiável (ordenado, sem prazo). A TV LG com Chromium 94 (2026-11-23): o canal com
  // prazo derrubou a conexão e, ~1 min depois, o Chrome de quem compartilhava travou na thread do WebRTC
  // (STATUS_ILLEGAL_INSTRUCTION), duas vezes. O SCTP antigo dela não combina com o "entrega parcial".
  abrirTurbo(id, vida = 250) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    fecharCanal(peer.turboCanal);
    try {
      peer.turboCanal = peer.pc.createDataChannel('turbo', vida == null ? { ordered: true } : { ordered: true, maxPacketLifeTime: Math.round(vida) });
      return peer.turboCanal;
    } catch {
      return null;
    }
  }

  // O som do turbo: canal à parte, sem ordem e com vida curta — um pacote de som não espera atrás de
  // um pedaço de imagem nem de outro pacote perdido (o tocador de lá prefere uma falha de 10 ms).
  abrirTurboSom(id, confiavel = false) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    fecharCanal(peer.turboSomCanal);
    try {
      peer.turboSomCanal = peer.pc.createDataChannel('turbo-som', confiavel ? { ordered: true } : { ordered: false, maxPacketLifeTime: 60 });
      return peer.turboSomCanal;
    } catch {
      return null;
    }
  }

  // O teste da conexão (turbo-teste.js), do lado de quem joga: um canal confiável e um sem reenvio
  abrirTeste(id) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    for (const c of peer.testeCanais || []) fecharCanal(c);
    try {
      // o dos dados primeiro: quando o outro abre lá, este já chegou
      const dados = peer.pc.createDataChannel('turbo-teste-dados', { ordered: false, maxRetransmits: 0 });
      const jogo = peer.pc.createDataChannel('turbo-teste-jogo', { ordered: true, maxPacketLifeTime: 250 }); // como o do turbo
      const canal = peer.pc.createDataChannel('turbo-teste', { ordered: true });
      peer.testeCanais = [canal, dados, jogo];
      return { canal, dados, jogo };
    } catch {
      return null;
    }
  }

  // Todos os caminhos que responderam até uma pessoa, para o relatório (por que o navegador troca de um de 8 ms
  // para um de 50): tipos, rede, família e ida e volta — nunca o endereço.
  async caminhosDe(id) {
    const peer = this.peers.get(id);
    if (!peer) return null;
    let report;
    try { report = await peer.pc.getStats(); } catch { return null; }
    let usado = null;
    report.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) usado = s.selectedCandidatePairId; });
    const lista = [];
    report.forEach((s) => {
      if (s.type !== 'candidate-pair') return;
      const l = report.get(s.localCandidateId);
      const r = report.get(s.remoteCandidateId);
      lista.push({
        par: s.id, usado: s.id === usado, estado: s.state, nomeado: !!s.nominated,
        local: l ? `${l.candidateType}/${l.protocol}${l.networkType ? ` ${l.networkType}` : ''}${l.vpn ? ' vpn' : ''}` : null,
        remoto: r ? `${r.candidateType}/${r.protocol}` : null,
        familia: familiaDe(l, r),
        prioridade: [l?.priority ?? null, r?.priority ?? null],
        rttMs: s.currentRoundTripTime != null ? Math.round(s.currentRoundTripTime * 1000) : null,
        pings: s.requestsSent ?? null, respostas: s.responsesReceived ?? null,
      });
    });
    // os que respondem primeiro, e poucos: o relatório tem limite
    return lista.sort((a, b) => Number(b.usado) - Number(a.usado) || (a.rttMs ?? 1e9) - (b.rttMs ?? 1e9)).slice(0, 12);
  }

  // Do lado de quem compartilha: enquanto essa pessoa recebe a tela pelo turbo, o vídeo da conexão
  // para ela fica desligado (o som continua) — os dois juntos disputariam o Wi-Fi.
  turboPara(id, key, ligar) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.turbo ??= new Set();
    if (ligar) peer.turbo.add(key);
    else peer.turbo.delete(key);
    this.tuneScreen(peer);
  }

  mandarMovimento(id, m) {
    const canal = this.canalMovimento(id);
    if (!canal) return false;
    try {
      canal.send(JSON.stringify(m));
      return true;
    } catch {
      return false;
    }
  }

  ligarCanal(peer, canal, tipo = 'ctrl') {
    peer[tipo] = canal;
    canal.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onControle?.(peer.id, m);
    };
  }

  mandarControle(id, m) {
    const canal = this.canalControle(id);
    if (!canal) return false;
    try {
      canal.send(JSON.stringify(m));
      return true;
    } catch {
      return false;
    }
  }

  // Banda inicial desta conexão (kbps): decidida na 1ª negociação e fixa depois. Um valor novo
  // numa renegociação (alguém ligou a tela) faria o estimador de banda recomeçar do zero.
  banda(peer) {
    return (peer.banda ??= bandaInicial(this.peers.size));
  }

  // Credencial nova do TURN (a da Cloudflare vence em 48 h): vale para as conexões novas e para
  // os próximos reinícios de ICE das que já existem.
  trocarIce(iceServers) {
    if (!Array.isArray(iceServers) || !iceServers.length) return;
    this.iceServers = iceServers;
    this.temTurn = iceServers.some((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)));
    for (const peer of this.peers.values()) {
      const { pc } = peer;
      if (pc.connectionState === 'closed' || peer.soStun) continue; // a que ainda espera o direto recebe em liberarTurn
      // sem nada negociado ainda, também recebe lá (ver restartIce)
      if (!this.temOqueNegociar(peer)) {
        Object.assign(peer, { soStun: true, nasceuEm: performance.now() });
        continue;
      }
      try {
        pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
      } catch (err) {
        console.warn('[rtc] troca do TURN', err);
      }
    }
  }

  send(to, data) {
    this.socket.emit('signal', { to, data: JSON.parse(JSON.stringify(data)) });
  }

  // Refaz a conexão com essa pessoa do zero: fecha a RTCPeerConnection, abre outra e avisa o outro
  // lado para fazer o mesmo. É o que sair e entrar na sala fazia — e era o único jeito de a voz
  // voltar quando o reinício de ICE não bastava (conexão que nunca ligou, credencial do TURN que
  // venceu no meio, negociação que travou). Os dois lados podem pedir ao mesmo tempo: a "época"
  // (número de vezes refeita) acerta, e quem já está na época pedida não refaz de novo.
  // Espera entre uma e outra: 20 s, depois 40, 80… até 5 min enquanto não ficar ligada (cada
  // conexão nova recria a voz e o vídeo das telas: em laço, pesa demais no celular). Devolve se refez.
  // escolha: refeita de propósito (usarCaminho), sem a espera nem contar como falha
  refazer(id, motivo = '', epoca = null, escolha = null) {
    const velho = this.peers.get(id);
    if (!velho) return false;
    const agora = performance.now();
    const pedido = epoca != null; // o outro lado refez e pediu que eu refaça também
    const espera = Math.min(300_000, 20_000 * 2 ** Math.max(0, (velho.refeitas || 0) - 1));
    if (pedido ? epoca <= velho.epoca : !escolha && agora - velho.refeitaEm < espera) return false;
    console.warn(`[rtc] refazendo a conexão com ${id}${motivo ? `: ${motivo}` : ''}`);
    const nova = pedido ? epoca : velho.epoca + 1;
    // o que a outra pessoa já tinha dito (o que ela quer das minhas telas, se ouve a minha voz…)
    const herdar = {
      epoca: nova,
      refeitaEm: agora,
      refeitas: (velho.refeitas || 0) + (escolha ? 0 : 1), // seguidas, sem a conexão ficar ligada entre elas
      ouveMic: velho.ouveMic,
      interesse: velho.interesse,
      hz: velho.hz,
      semPiso: velho.semPiso,
      balanceado: velho.balanceado,
      linhasJogo: velho.linhasJogo,
      rapido: velho.rapido,
      linhasPedidas: velho.linhasPedidas,
      recuoCodec: velho.recuoCodec,
      reiniciosIce: velho.reiniciosIce,
      ...escolha,
      turnDesde: agora,
    };
    // primeiro o aviso (os sinais chegam na ordem: o outro lado refaz antes da minha oferta nova)
    if (!pedido) this.send(id, { refazer: nova });
    this.peers.delete(id);
    try { velho.pc.close(); } catch { /* já fechada */ }
    this.getPeer(id, herdar);
    this.onRefeita?.(id);
    return true;
  }

  async handleSignal(from, { description, candidate, interesse, interesse2, hz, voz, refazer, caminho, e }) {
    if (caminho) {
      const p = this.peers.get(from);
      if (p && p.turnEscolhido !== 'eu') p.turnEscolhido = caminho === 'turn' ? 'ele' : null;
      return;
    }
    if (refazer) {
      this.refazer(from, 'o outro lado pediu', Number(refazer) || 0);
      return;
    }
    const peer = this.getPeer(from);
    if (interesse2 || interesse) return this.receberInteresse(peer, interesse2 || interesse, hz);
    if (voz) return this.reforcarVoz(peer);
    // oferta, resposta ou candidato da conexão anterior (ainda a caminho quando ela foi refeita)
    if (e != null && e !== peer.epoca) {
      if (e < peer.epoca) return;
      // a outra pessoa já refez e o aviso se perdeu: refaz também e segue com a conexão nova
      this.refazer(from, 'época nova', e);
      return this.handleSignal(from, { description, candidate, e });
    }
    const { pc } = peer;
    try {
      if (description) {
        // Oferta que chega enquanto a resposta à minha ainda está sendo aplicada não é colisão.
        // Antes o lado "impolite" descartava essa oferta e o outro ficava esperando a resposta
        // para sempre: nada mais negociava (a voz ligada depois nunca chegava).
        const pronto = !peer.makingOffer && (pc.signalingState === 'stable' || peer.aplicandoResposta);
        const collision = description.type === 'offer' && !pronto;
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        // o som das minhas telas sai sem DTX (ver comDtx)
        const semDtx = new Set();
        for (const trs of peer.screenTransceivers.values()) for (const tr of trs) if (tr.mid) semDtx.add(tr.mid);
        // A outra ponta reiniciou o ICE já com o TURN (liberarTurn de lá) e o daqui ainda não entrou: a resposta tem
        // que sair com ele também, senão o reinício de lá junta candidatos à toa.
        if (description.type === 'offer' && peer.soStun && pc.remoteDescription && ufragDe(description) !== ufragDe(pc.remoteDescription)) this.liberarTurn(peer, false);
        peer.aplicandoResposta = description.type === 'answer';
        try {
          const inteira = trocarPerfil(description, this.midsDeJogo(peer), '42e01f', '42001f');
          const recebida = this.semSincronia ? somSolto(inteira) : inteira;
          await pc.setRemoteDescription(comEstereo(comDtx(comBandaInicial(recebida, ...this.bandaSdp(peer)), semDtx), this.midsSomDeJogo(peer)));
        } finally {
          peer.aplicandoResposta = false;
        }
        if (description.type === 'offer') {
          this.soH264(pc);
          await pc.setLocalDescription(comEstereo(comBandaInicial(await pc.createAnswer(), ...this.bandaSdp(peer)), null));
          this.send(from, { description: trocarPerfil(pc.localDescription, this.midsDeJogo(peer), '42001f', '42e01f'), e: peer.epoca });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!peer.ignoreOffer) console.warn('[rtc] ice', err);
        }
      }
    } catch (err) {
      console.warn('[rtc] signal', err);
    }
  }

  removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(id);
    this.onPeerGone?.(id);
  }

  closeAll() {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.stopScreen();
    this.stopCam();
    this.micTrack?.stop();
  }

  // qualidade da conexão (para o painel de pessoas)
  async stats(id) {
    const peer = this.peers.get(id);
    if (!peer) return null;
    const report = await peer.pc.getStats();
    let rtt = null;
    report.forEach((s) => {
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated && s.currentRoundTripTime != null) {
        rtt = s.currentRoundTripTime * 1000;
      }
    });
    return { rtt, state: peer.pc.connectionState };
  }

  // Como uma tela minha está saindo agora: a melhor entre as pessoas que estão vendo (altura,
  // quadros por segundo, codec, se é na placa de vídeo e o que está limitando, se algo limita).
  async envioAtual(key) {
    let melhor = null;
    for (const peer of this.peers.values()) {
      const tr = (peer.screenTransceivers.get(key) || []).find((t) => t.sender.track?.kind === 'video');
      if (!tr) continue;
      let report;
      try {
        report = await tr.sender.getStats();
      } catch {
        continue;
      }
      const codecs = new Map();
      report.forEach((s) => { if (s.type === 'codec') codecs.set(s.id, s.mimeType); });
      report.forEach((s) => {
        if (s.type !== 'outbound-rtp' || s.kind !== 'video' || !s.frameHeight) return;
        const atual = {
          altura: s.frameHeight,
          fps: Math.round(s.framesPerSecond || 0),
          codec: (codecs.get(s.codecId) || '').replace('video/', ''),
          placa: s.powerEfficientEncoder === true,
          limite: s.qualityLimitationReason && s.qualityLimitationReason !== 'none' ? s.qualityLimitationReason : null,
        };
        if (!melhor || atual.altura * 100 + atual.fps > melhor.altura * 100 + melhor.fps) melhor = atual;
      });
    }
    return melhor;
  }

  // Como uma tela de outra pessoa está chegando aqui: trackId é a trilha de vídeo que está no
  // <video> daquela tela. altura e fps; atraso (ms), o que dá para medir deste lado: metade da ida
  // e volta da rede + quanto cada quadro levou do 1º pacote chegar até estar decodificado (a
  // espera do buffer e a decodificação), na média desde a medida anterior — a captura e a
  // codificação no PC de quem compartilha não entram. turn: o caminho passa pelo servidor TURN
  // ('udp', 'tcp' ou 'tls'; null = direto).
  async recebendo(peerId, trackId) {
    const peer = this.peers.get(peerId);
    const tr = peer?.pc.getTransceivers().find((t) => t.receiver.track?.id === trackId);
    if (!tr) return null;
    let report;
    try {
      report = await tr.receiver.getStats();
    } catch {
      return null; // conexão fechando
    }
    let entrada = null;
    let par = null;
    report.forEach((s) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameHeight) entrada = s;
      else if (s.type === 'transport' && s.selectedCandidatePairId) par = report.get(s.selectedCandidatePairId) || par;
      else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && !par) par = s;
    });
    if (!entrada) return null;
    const agora = { proc: entrada.totalProcessingDelay, quadros: entrada.framesDecoded, jb: entrada.jitterBufferDelay, jbn: entrada.jitterBufferEmittedCount };
    const antes = this.medidas.get(tr.receiver);
    this.medidas.set(tr.receiver, agora);
    let espera = null;
    if (antes && agora.proc != null && agora.quadros > antes.quadros) espera = (agora.proc - antes.proc) / (agora.quadros - antes.quadros);
    else if (antes && agora.jb != null && agora.jbn > antes.jbn) espera = (agora.jb - antes.jb) / (agora.jbn - antes.jbn);
    const rede = par?.currentRoundTripTime;
    const local = par && report.get(par.localCandidateId);
    const remoto = par && report.get(par.remoteCandidateId);
    return {
      altura: entrada.frameHeight,
      fps: Math.round(entrada.framesPerSecond || 0),
      atraso: espera == null ? null : Math.round(((rede || 0) / 2 + espera) * 1000),
      turn: local?.candidateType === 'relay' ? local.relayProtocol || 'udp' : remoto?.candidateType === 'relay' ? 'udp' : null,
    };
  }

  // -------------------------------------------------------------- modo jogo
  // Quem joga na tela de outra pessoa: o menor buffer possível no vídeo e no som dela. Cada quadro
  // vai para a tela assim que fica pronto; um tranco da rede vira um quadro repetido, não atraso.
  // Devolve o que mudou (para o relatório). alvoMs: quem joga pediu a imagem mais lisa (um buffer
  // pequeno segura o tremido do Wi-Fi em troca de uns ms de atraso).
  baixaLatencia(stream, ligar, alvoMs = 0) {
    const trilhas = new Set(stream?.getTracks() || []);
    const feitos = [];
    for (const peer of this.peers.values()) {
      for (const t of peer.pc.getTransceivers()) {
        const r = t.receiver;
        if (!r.track || !trilhas.has(r.track)) continue;
        try {
          if ('jitterBufferTarget' in r) r.jitterBufferTarget = ligar ? alvoMs : null;
          // o antigo do Chrome: 0 no vídeo liga o caminho de "quadro direto para a tela"
          if (r.track.kind === 'video' && 'playoutDelayHint' in r) r.playoutDelayHint = ligar ? 0 : null;
          // o mais antigo (Chrome até ~95, o das TVs LG webOS 22): em segundos
          if (!('jitterBufferTarget' in r) && 'jitterBufferDelayHint' in r) r.jitterBufferDelayHint = ligar ? alvoMs / 1000 : null;
          feitos.push({ tipo: r.track.kind, jitterBufferTarget: r.jitterBufferTarget ?? null, playoutDelayHint: r.playoutDelayHint ?? null, ...('jitterBufferDelayHint' in r ? { jitterBufferDelayHint: r.jitterBufferDelayHint ?? null } : {}) });
        } catch (err) {
          console.warn('[modo-jogo] buffer de quem joga', err);
          feitos.push({ tipo: r.track.kind, erro: String(err?.message || err) });
        }
      }
    }
    return feitos;
  }

  // Relatório do modo jogo (jogo-diag.js): os números crus do envio de uma tela minha, por pessoa
  // que recebe. São somas desde o começo: quem lê faz as diferenças entre duas leituras.
  async diagEnvio(key) {
    const lista = [];
    const trilha = this.screens.get(key)?.stream?.getVideoTracks()[0];
    for (const [id, peer] of this.peers) {
      const tr = (peer.screenTransceivers.get(key) || []).find((t) => t.sender.track?.kind === 'video');
      if (!tr) continue;
      let report;
      try {
        report = await tr.sender.getStats();
      } catch {
        continue;
      }
      const d = { id, nivel: peer.interesse.get(key) || null, conexao: peer.pc.connectionState, idadeS: Math.round((Date.now() - peer.criadaEm) / 1000), reiniciosIce: peer.reiniciosIce || 0, voltasDireto: peer.voltasDireto || 0, tentativasDireto: peer.tentativasDireto || 0 };
      if (peer.bandaJogo) d.bandaJogo = { ...peer.bandaJogo, semPiso: peer.semPiso, balanceado: peer.balanceado, linhas: peer.linhasJogo, recuoCodec: peer.recuoCodec, rapido: peer.rapido };
      try {
        const p = tr.sender.getParameters();
        d.params = { degradacao: p.degradationPreference ?? null, ...(p.encodings?.[0] || {}) };
      } catch { /* conexão fechando */ }
      const codecs = new Map();
      let par = null;
      report.forEach((s) => {
        if (s.type === 'codec') codecs.set(s.id, `${s.mimeType} ${s.sdpFmtpLine || ''}`.trim());
        else if (s.type === 'outbound-rtp' && s.kind === 'video') d.saida = pegar(s, CAMPOS_SAIDA);
        else if (s.type === 'media-source' && s.kind === 'video') d.captura = pegar(s, ['width', 'height', 'framesPerSecond', 'frames']);
        else if (s.type === 'remote-inbound-rtp' && s.kind === 'video') d.laLonge = pegar(s, ['packetsLost', 'fractionLost', 'jitter', 'roundTripTime']);
        else if (s.type === 'transport' && s.selectedCandidatePairId) par = report.get(s.selectedCandidatePairId) || par;
        else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && !par) par = s;
      });
      if (d.saida?.codecId) d.codec = codecs.get(d.saida.codecId) || null;
      if (par) d.rede = caminhoDe(report, par);
      lista.push(d);
    }
    return {
      trilha: trilha ? { rotulo: trilha.label, estado: trilha.readyState, mudo: trilha.muted, dica: trilha.contentHint, config: trilha.getSettings?.() || null } : null,
      jogo: this.jogoTelas.has(key),
      preset: this.preset(),
      codecs: infoCodecs,
      envios: lista,
    };
  }

  // O caminho até uma pessoa, para o turbo (TurboEnvio: banda inicial e repasse do PS5): a banda que o
  // WebRTC estima para mandar até ela (kbps), os tipos do par em uso e se é a mesma casa (lan: os dois
  // lados por endereço local). null sem conexão ou sem par escolhido ainda.
  async caminhoPara(id) {
    const peer = this.peers.get(id);
    if (!peer || ['failed', 'closed'].includes(peer.pc.connectionState)) return null;
    let report;
    try {
      report = await peer.pc.getStats();
    } catch {
      return null;
    }
    let par = null;
    report.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) par = report.get(s.selectedCandidatePairId) || par;
      else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && !par) par = s;
    });
    if (!par) return null;
    const c = caminhoDe(report, par);
    const local = report.get(par.localCandidateId);
    const remoto = report.get(par.remoteCandidateId);
    // host com host é a mesma casa, menos por um endereço público — uma VPN como o Radmin (26.x) dá
    // candidatos "host" que vão pela internet. O endereço do outro lado pode vir escondido (mDNS, .local).
    const privado = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|f[cd][0-9a-f]{2}:)/i.test(ip);
    const ip = String(remoto?.address ?? remoto?.ip ?? '');
    // IPv6 não passa por NAT: pela internet também é host com host. Só contava o IPv4, e o iPhone do usuário
    // pela rede de fora (host/udp, 260–450 ms, 2026-11-25) era "a mesma casa": banda máxima de cara, o turbo
    // sem conseguir mostrar um quadro. E quem está em casa não leva LAN_RTT_MS de ida e volta.
    const publico = (/^\d+\.\d+\.\d+\.\d+$/.test(ip) || ip.includes(':')) && !privado(ip);
    const rttMs = c.rtt != null ? Math.round(c.rtt * 1000) : null;
    const lan = local?.candidateType === 'host' && ((remoto?.candidateType === 'host' && !publico) || privado(ip))
      && !(rttMs != null && rttMs > LAN_RTT_MS);
    return {
      saidaKbps: c.saidaEstimada != null ? Math.round(c.saidaEstimada / 1000) : null,
      rttMs,
      par: c.par,
      familia: c.familia,
      local: c.local,
      remoto: c.remoto,
      relay: !!c.relay,
      lan,
    };
  }

  // Os números crus da chegada de uma tela de outra pessoa (a trilha de vídeo que está no <video>)
  async diagRecebe(trilha, somDaTela = null) {
    for (const peer of this.peers.values()) {
      const tr = peer.pc.getTransceivers().find((t) => t.receiver.track === trilha);
      if (!tr) continue;
      let report;
      try {
        report = await tr.receiver.getStats();
      } catch {
        return null;
      }
      const d = { conexao: peer.pc.connectionState, idadeS: Math.round((Date.now() - peer.criadaEm) / 1000), reiniciosIce: peer.reiniciosIce || 0, voltasDireto: peer.voltasDireto || 0, tentativasDireto: peer.tentativasDireto || 0, jitterBufferTarget: tr.receiver.jitterBufferTarget ?? null, playoutDelayHint: tr.receiver.playoutDelayHint ?? null };
      const codecs = new Map();
      let par = null;
      report.forEach((s) => {
        if (s.type === 'codec') codecs.set(s.id, `${s.mimeType} ${s.sdpFmtpLine || ''}`.trim());
        else if (s.type === 'inbound-rtp' && s.kind === 'video') d.entrada = pegar(s, CAMPOS_ENTRADA);
        else if (s.type === 'transport' && s.selectedCandidatePairId) par = report.get(s.selectedCandidatePairId) || par;
        else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && !par) par = s;
      });
      if (d.entrada?.codecId) d.codec = codecs.get(d.entrada.codecId) || null;
      if (par) d.rede = caminhoDe(report, par);
      // O som da mesma tela: os dois vão no mesmo stream e quem recebe os sincroniza — se o buffer
      // do som for maior, o vídeo espera por ele. O relatório compara os dois.
      const som = somDaTela && peer.pc.getTransceivers().find((t) => t.receiver.track === somDaTela);
      if (som) {
        try {
          (await som.receiver.getStats()).forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') d.som = pegar(s, CAMPOS_SOM);
          });
        } catch { /* conexão fechando */ }
      }
      return d;
    }
    return null;
  }
}

const CAMPOS_SAIDA = ['frameWidth', 'frameHeight', 'framesPerSecond', 'framesEncoded', 'framesSent', 'hugeFramesSent',
  'keyFramesEncoded', 'bytesSent', 'headerBytesSent', 'packetsSent', 'retransmittedBytesSent', 'retransmittedPacketsSent',
  'targetBitrate', 'totalEncodeTime', 'totalEncodedBytesTarget', 'totalPacketSendDelay', 'nackCount', 'pliCount', 'firCount',
  'qpSum', 'qualityLimitationReason', 'qualityLimitationDurations', 'qualityLimitationResolutionChanges',
  'encoderImplementation', 'powerEfficientEncoder', 'scalabilityMode', 'codecId', 'active'];
const CAMPOS_ENTRADA = ['frameWidth', 'frameHeight', 'framesPerSecond', 'framesReceived', 'framesDecoded', 'framesDropped',
  'framesRendered', 'keyFramesDecoded', 'freezeCount', 'totalFreezesDuration', 'pauseCount', 'totalPausesDuration',
  'jitterBufferDelay', 'jitterBufferTargetDelay', 'jitterBufferMinimumDelay', 'jitterBufferEmittedCount',
  'totalDecodeTime', 'totalProcessingDelay', 'totalAssemblyTime', 'totalInterFrameDelay', 'totalSquaredInterFrameDelay',
  'bytesReceived', 'headerBytesReceived', 'packetsReceived', 'packetsLost', 'packetsDiscarded', 'jitter', 'nackCount',
  'pliCount', 'firCount', 'qpSum', 'decoderImplementation', 'powerEfficientDecoder', 'codecId'];

// a senha curta do ICE de uma descrição: muda quando a ponta de lá reinicia o ICE
const ufragDe = (d) => /^a=ice-ufrag:(\S+)/m.exec(d?.sdp || '')?.[1] ?? null;
const CAMPOS_SOM = ['jitterBufferDelay', 'jitterBufferTargetDelay', 'jitterBufferMinimumDelay', 'jitterBufferEmittedCount',
  'packetsLost', 'packetsReceived', 'concealedSamples', 'totalSamplesReceived', 'audioLevel', 'bytesReceived', 'silentConcealedSamples'];

// só os campos que vieram (cada versão do Chrome manda um pedaço)
function pegar(s, campos) {
  const d = {};
  for (const c of campos) if (s[c] !== undefined) d[c] = s[c];
  return d;
}

const LAN_RTT_MS = 80; // ida e volta acima disto não é a mesma casa (caminhoPara)

// 'ipv4', 'ipv6' ou null (os dois endereços escondidos por mDNS). Só a família: o endereço não sai daqui.
export function familiaDe(...candidatos) {
  for (const c of candidatos) {
    const ip = String(c?.address ?? c?.ip ?? '');
    if (ip.includes(':')) return 'ipv6';
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return 'ipv4';
  }
  return null;
}

// o caminho da conexão: ida e volta, banda estimada e se é direto ou pelo TURN
function caminhoDe(report, par) {
  const local = report.get(par.localCandidateId);
  const remoto = report.get(par.remoteCandidateId);
  // o servidor TURN do caminho (o IP público do relay, da Cloudflare): o do meu lado, ou o do outro
  const relay = local?.candidateType === 'relay' ? local : remoto?.candidateType === 'relay' ? remoto : null;
  return {
    rtt: par.currentRoundTripTime ?? null,
    saidaEstimada: par.availableOutgoingBitrate ?? null,
    entradaEstimada: par.availableIncomingBitrate ?? null,
    local: local ? `${local.candidateType}/${local.protocol}${local.relayProtocol ? `/${local.relayProtocol}` : ''}${local.networkType ? ` ${local.networkType}` : ''}` : null,
    remoto: remoto ? `${remoto.candidateType}/${remoto.protocol}` : null,
    // qual par está em uso (trocou = o caminho mudou no meio) e por qual relay
    par: par.id ?? null,
    familia: familiaDe(local, remoto),
    relay: relay ? { lado: relay === local ? 'aqui' : 'la', ip: relay.address ?? relay.ip ?? null, porta: relay.port ?? null, url: relay.url ?? null } : null,
    // somas do par (quem lê faz a diferença): o que saiu, o que voltou e os pings de consentimento
    bytesEnviados: par.bytesSent ?? null,
    bytesRecebidos: par.bytesReceived ?? null,
    pacotesDescartadosNoEnvio: par.packetsDiscardedOnSend ?? null,
    pingsSemResposta: par.requestsSent != null && par.responsesReceived != null ? par.requestsSent - par.responsesReceived : null,
  };
}
