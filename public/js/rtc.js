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
// toda a cada quadro: com os 12 Mbps o codificador passava do alvo e descartava quadros.
export const SHARE_PRESETS = {
  leve: { label: 'Leve', fps: 60, width: 1280, height: 720, maxBitrate: 5_000_000, jogoBitrate: 9_000_000 },
  max: { label: 'Máxima', fps: 60, width: 1920, height: 1080, maxBitrate: 12_000_000, jogoBitrate: 20_000_000 },
  ultra: { label: 'Ultra', fps: 60, width: 2560, height: 1440, maxBitrate: 20_000_000, jogoBitrate: 30_000_000 },
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
    this.medidas = new WeakMap(); // receptor de vídeo -> os totais da medida anterior (ver recebendo)
    escolherCodec();

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

  // no máximo um reinício de ICE a cada 8 s por pessoa
  restartIce(peer) {
    const agora = performance.now();
    if (agora - peer.reinicioIce < 8000) return;
    peer.reinicioIce = agora;
    try {
      peer.pc.restartIce();
    } catch { /* conexão fechada */ }
  }

  // A cada segundo: a voz que devia sair e não entrou vai de novo; a oferta que ficou sem resposta
  // (perdida numa colisão) é desfeita e refeita; a conexão que caiu (Wi-Fi trocado por 4G, celular
  // que dormiu) refaz o caminho em 3 s, em vez de esperar o "failed", que leva até 30 s.
  vigiar() {
    const agora = performance.now();
    for (const peer of this.peers.values()) {
      const { pc } = peer;
      if (pc.connectionState === 'closed') continue;
      this.ajustarMic(peer);
      if (pc.signalingState === 'have-local-offer' && !peer.makingOffer && agora - peer.ofertaDesde > 6000) {
        peer.ofertaDesde = agora;
        pc.setLocalDescription({ type: 'rollback' })
          .then(() => { peer.reinicioIce = 0; this.restartIce(peer); }) // força uma oferta nova
          .catch((err) => console.warn('[rtc] oferta sem resposta', err));
        continue;
      }
      if (peer.renegociar) this.renegociar(peer);
      const ice = pc.iceConnectionState;
      if (ice === 'disconnected' || ice === 'failed') {
        peer.caiuDesde ||= agora;
        if (agora - peer.caiuDesde > 3000) this.restartIce(peer);
      } else {
        peer.caiuDesde = 0;
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
    if (ligar === this.jogoTelas.has(key)) return;
    if (ligar) this.jogoTelas.add(key);
    else this.jogoTelas.delete(key);
    console.info('[modo-jogo] banda de jogo', ligar ? 'ligada' : 'desligada', key, this.preset());
    this.retuneAll();
  }

  joga(peer) {
    for (const ids of this.jogadores.values()) if (ids.has(peer.id)) return true;
    return false;
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
    const preset = this.preset();
    const scr = this.screens.get(key);
    const nivel = nivelDe(peer, key);
    let soma = 0;
    for (const k of this.screens.keys()) soma += nivelDe(peer, k).peso;
    const parte = nivel.peso / Math.max(1, soma);
    // altura do que sai no nível máximo: a da captura (no arquivo maior que o preset, já reduzida
    // pelo extraScale)
    const extra = scr?.extraScale || 1;
    const altura = (scr?.stream?.getVideoTracks()[0]?.getSettings?.().height || preset.height * extra) / extra;
    let escala = nivel.linhas ? Math.max(1, altura / nivel.linhas) : nivel.escala;
    // modo jogo com pouca banda: resolução fixa (linhasDeJogo) em vez de deixar pular
    if (nivel === NIVEIS.max && peer.linhasJogo && this.jogoTelas.has(key)) escala = Math.max(1, altura / peer.linhasJogo);
    const banda = nivel === NIVEIS.max && this.jogoTelas.has(key) ? preset.jogoBitrate : preset.maxBitrate;
    return {
      active: nivel !== NIVEIS.off,
      maxBitrate: Math.round(Math.min(banda * nivel.teto, Math.max(nivel.piso, banda * parte))),
      maxFramerate: nivel.fps,
      scaleResolutionDownBy: Math.max(1, escala * extra),
    };
  }

  // pede a aba/janela/tela ao navegador; quem chama decide se publica (addScreen)
  async captureScreen() {
    const preset = this.preset();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: preset.fps, max: preset.fps },
        width: { max: preset.width },
        height: { max: preset.height },
        cursor: 'always',
      },
      audio: {
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
  addScreen(key, stream, { file = false, height = 0 } = {}) {
    if (file) this.prepararCaptura(stream);
    const alto = this.preset().height;
    this.screens.set(key, { stream, extraScale: file && height > alto ? height / alto : 1 });
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
              const jogo = this.jogoTelas.has(key);
              params.degradationPreference = peer.balanceado && jogo ? 'balanced'
                : peer.linhasJogo && jogo && !this.semFixa ? 'maintain-framerate-and-resolution' : 'maintain-framerate';
              Object.assign(params.encodings[0], this.envioPara(peer, key), { networkPriority: 'high', priority: 'high' });
              await sender.setParameters(params);
            } catch (err) {
              // navegador que não conhece o 'maintain-framerate-and-resolution': fica no de sempre
              if (err.name === 'TypeError' && !this.semFixa && peer.linhasJogo) {
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
      await track.applyConstraints({ width: { max: largo }, height: { max: alto }, frameRate: { ideal: preset.fps, max: preset.fps } });
    } catch (err) {
      console.warn('[modo-jogo] tamanho da captura', err);
      return null;
    }
    this.retuneAll(); // a escala de cada envio sai da altura da captura
    return track.getSettings().height ?? null;
  }

  // reaplica em todos (preset mudou ou o número de telas mudou)
  retuneAll() {
    for (const peer of this.peers.values()) this.tuneScreen(peer);
  }

  // tira uma tela do ar (key) ou todas
  stopScreen(key = null) {
    const keys = key == null ? [...this.screens.keys()] : [key];
    for (const k of keys) {
      const scr = this.screens.get(k);
      if (!scr) continue;
      for (const t of scr.stream.getTracks()) t.stop();
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
  receberInteresse(peer, mapa) {
    if (!mapa || typeof mapa !== 'object') return;
    let mudou = false;
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
    this.send(id, compat === mapa ? { interesse: mapa } : { interesse: compat, interesse2: mapa });
  }

  // -------------------------------------------------------------- conexões
  getPeer(id) {
    let peer = this.peers.get(id);
    if (peer) return peer;

    // max-bundle: um transporte só desde a 1ª oferta. No 'balanced' o Chrome junta candidatos
    // (e reserva TURN) para cada seção até a resposta: voz + câmera + tela abriam 4 transportes
    // por pessoa que entrava.
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    peer = {
      id,
      pc,
      polite: this.selfId > id,
      makingOffer: false,
      ignoreOffer: false,
      aplicandoResposta: false, // setRemoteDescription(answer) em andamento (ver handleSignal)
      ofertaDesde: 0, // quando saiu a minha última oferta (o vigia desfaz a que nunca teve resposta)
      caiuDesde: 0, // desde quando o ICE está desconectado
      reinicioIce: 0,
      banda: null, // banda inicial da conexão, em kbps (ver banda)
      bandaJogo: null, // { inicio, piso } em kbps: essa pessoa joga numa tela minha (atualizarBandaJogo)
      semPiso: false, // o piso de jogo saiu (soltarPisoJogo)
      balanceado: false, // a tela de jogo dela sai em 'balanced' (imagemDeJogo)
      linhasJogo: null, // a tela de jogo dela sai com no máximo essas linhas (linhasDeJogo)
      recuoCodec: 0, // passos atrás no codec de jogo (codecSeguroJogo)
      renegociar: false, // falta mandar uma oferta nova (renegociar)
      ctrl: null, // canal do controle remoto (ver canalControle)
      micSender: null,
      micVai: null, // a trilha que está no micSender agora (null: a voz não vai para essa pessoa)
      ouveMic: true, // essa pessoa pode ouvir a minha voz (vozPara)
      camSender: null,
      screenTransceivers: new Map(), // key da tela -> transceivers (vídeo e áudio)
      interesse: new Map(), // key da tela -> quanto essa pessoa precisa dela (ver NIVEIS)
      pending: [],
    };
    this.peers.set(id, peer);
    // quem joga e reconectou já volta com a banda de jogo
    if (this.joga(peer)) peer.bandaJogo = bandaDeJogo(this.preset());

    // também chamada direto quando só o SDP muda (renegociar), sem o navegador pedir
    peer.negociar = async () => {
      try {
        peer.makingOffer = true;
        peer.renegociar = false;
        const oferta = await pc.createOffer();
        // outra negociação começou enquanto a oferta era montada: o evento volta sozinho depois
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(comBandaInicial(oferta, ...this.bandaSdp(peer)));
        peer.ofertaDesde = performance.now();
        this.send(id, { description: trocarPerfil(pc.localDescription, this.midsDeJogo(peer), '42001f', '42e01f') });
      } catch (err) {
        console.warn('[rtc] offer', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onnegotiationneeded = () => peer.negociar();
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(id, { candidate });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') this.restartIce(peer);
    };
    // Redes diferentes atrás de CGNAT (comum em fibra e 4G) não fecham conexão direta: sem TURN
    // a tela fica preta e a voz muda. Avisa em vez de deixar a pessoa adivinhando.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.onFalha?.(id, this.temTurn);
    };
    // canal do controle remoto: quem controla abre (ver canalControle); aqui chega o de quem me controla
    pc.ondatachannel = ({ channel }) => {
      if (channel.label === 'controle') this.ligarCanal(peer, channel);
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
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

  ligarCanal(peer, canal) {
    peer.ctrl = canal;
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
    for (const { pc } of this.peers.values()) {
      if (pc.connectionState === 'closed') continue;
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

  async handleSignal(from, { description, candidate, interesse, interesse2, voz }) {
    const peer = this.getPeer(from);
    if (interesse2 || interesse) return this.receberInteresse(peer, interesse2 || interesse);
    if (voz) return this.reforcarVoz(peer);
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
        peer.aplicandoResposta = description.type === 'answer';
        try {
          const recebida = trocarPerfil(description, this.midsDeJogo(peer), '42e01f', '42001f');
          await pc.setRemoteDescription(comDtx(comBandaInicial(recebida, ...this.bandaSdp(peer)), semDtx));
        } finally {
          peer.aplicandoResposta = false;
        }
        if (description.type === 'offer') {
          await pc.setLocalDescription(comBandaInicial(await pc.createAnswer(), ...this.bandaSdp(peer)));
          this.send(from, { description: trocarPerfil(pc.localDescription, this.midsDeJogo(peer), '42001f', '42e01f') });
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
  // Devolve o que mudou (para o relatório).
  baixaLatencia(stream, ligar) {
    const trilhas = new Set(stream?.getTracks() || []);
    const feitos = [];
    for (const peer of this.peers.values()) {
      for (const t of peer.pc.getTransceivers()) {
        const r = t.receiver;
        if (!r.track || !trilhas.has(r.track)) continue;
        try {
          if ('jitterBufferTarget' in r) r.jitterBufferTarget = ligar ? 0 : null;
          // o antigo do Chrome: 0 no vídeo liga o caminho de "quadro direto para a tela"
          if (r.track.kind === 'video' && 'playoutDelayHint' in r) r.playoutDelayHint = ligar ? 0 : null;
          feitos.push({ tipo: r.track.kind, jitterBufferTarget: r.jitterBufferTarget ?? null, playoutDelayHint: r.playoutDelayHint ?? null });
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
      const d = { id, nivel: peer.interesse.get(key) || null, conexao: peer.pc.connectionState };
      if (peer.bandaJogo) d.bandaJogo = { ...peer.bandaJogo, semPiso: peer.semPiso, balanceado: peer.balanceado, linhas: peer.linhasJogo, recuoCodec: peer.recuoCodec };
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

  // Os números crus da chegada de uma tela de outra pessoa (a trilha de vídeo que está no <video>)
  async diagRecebe(trilha) {
    for (const peer of this.peers.values()) {
      const tr = peer.pc.getTransceivers().find((t) => t.receiver.track === trilha);
      if (!tr) continue;
      let report;
      try {
        report = await tr.receiver.getStats();
      } catch {
        return null;
      }
      const d = { conexao: peer.pc.connectionState, jitterBufferTarget: tr.receiver.jitterBufferTarget ?? null, playoutDelayHint: tr.receiver.playoutDelayHint ?? null };
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

// só os campos que vieram (cada versão do Chrome manda um pedaço)
function pegar(s, campos) {
  const d = {};
  for (const c of campos) if (s[c] !== undefined) d[c] = s[c];
  return d;
}

// o caminho da conexão: ida e volta, banda estimada e se é direto ou pelo TURN
function caminhoDe(report, par) {
  const local = report.get(par.localCandidateId);
  const remoto = report.get(par.remoteCandidateId);
  return {
    rtt: par.currentRoundTripTime ?? null,
    saidaEstimada: par.availableOutgoingBitrate ?? null,
    entradaEstimada: par.availableIncomingBitrate ?? null,
    local: local ? `${local.candidateType}/${local.protocol}${local.relayProtocol ? `/${local.relayProtocol}` : ''}${local.networkType ? ` ${local.networkType}` : ''}` : null,
    remoto: remoto ? `${remoto.candidateType}/${remoto.protocol}` : null,
  };
}
