// WebRTC em malha (cada pessoa conecta direto com cada outra): microfone + tela + som da tela.
// Usa o padrão "perfect negotiation" para renegociar sem conflitos quando alguém liga/desliga a tela.
import { podeRecortar, recortarRosto } from './rosto.js';
import { isTouch } from './touch.js';

// Presets de qualidade: todos a 60 quadros por segundo. Se a internet ou o PC apertarem, o
// navegador baixa a resolução e segura os 60 quadros ("maintain-framerate"). A captura já sai no
// tamanho do preset (o navegador reduz na placa de vídeo, antes de codificar — sai mais barato).
// contentHint 'motion' e não 'detail': o modo "tela" do codificador segura quadros em conteúdo
// parado e derruba a fluidez quando algo se mexe.
export const SHARE_PRESETS = {
  leve: { label: 'Leve', fps: 60, width: 1280, height: 720, maxBitrate: 5_000_000 },
  max: { label: 'Máxima', fps: 60, width: 1920, height: 1080, maxBitrate: 12_000_000 },
  ultra: { label: 'Ultra', fps: 60, width: 2560, height: 1440, maxBitrate: 20_000_000 },
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
let codecPreferido = null;
let escolhendo = null;
export function escolherCodec() {
  escolhendo ??= (async () => {
    const candidatos = [
      ['video/H264', 'video/H264; profile-level-id=42e01f'],
      ['video/AV1', 'video/AV1'],
      ['video/VP9', 'video/VP9'],
    ];
    let escolhido = 'video/H264';
    if (navigator.mediaCapabilities?.encodingInfo) {
      for (const [mime, contentType] of candidatos) {
        try {
          const r = await navigator.mediaCapabilities.encodingInfo({
            type: 'webrtc',
            video: { contentType, width: 1920, height: 1080, bitrate: 12_000_000, framerate: 60 },
          });
          if (r.supported && r.powerEfficient) {
            escolhido = mime;
            break;
          }
        } catch { /* navegador sem 'webrtc' no encodingInfo */ }
      }
    }
    const temNoNavegador = RTCRtpSender.getCapabilities?.('video')?.codecs.some((c) => c.mimeType === escolhido);
    codecPreferido = temNoNavegador ? escolhido : null;
    return codecPreferido;
  })();
  return escolhendo;
}

// põe o codec escolhido na frente (os outros ficam de reserva; rtx, red e fec continuam)
function preferirCodec(transceiver) {
  if (!codecPreferido || !transceiver.setCodecPreferences) return;
  const todos = RTCRtpReceiver.getCapabilities?.('video')?.codecs || [];
  const primeiro = todos.filter((c) => c.mimeType === codecPreferido);
  if (!primeiro.length) return;
  try {
    transceiver.setCodecPreferences([...primeiro, ...todos.filter((c) => c.mimeType !== codecPreferido)]);
  } catch (err) {
    console.warn('[rtc] preferência de codec', err);
  }
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

// A banda inicial (kbps) em todo codec de vídeo de cada seção: vale o da seção que acabar
// escolhida. O piso que venha de uma aba antiga sai. Só no vídeo (o áudio não muda).
function comBandaInicial(desc, kbps) {
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
        saida.push(`${cabeca} ${[...params, `x-google-start-bitrate=${kbps}`].join(';')}`);
        continue;
      }
      saida.push(l);
      // codec sem a=fmtp (o VP8, por exemplo): cria a linha
      const rtp = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(l);
      if (rtp && !comFmtp.has(rtp[1]) && !/^(rtx|red|ulpfec|flexfec-03)$/i.test(rtp[2])) saida.push(`a=fmtp:${rtp[1]} x-google-start-bitrate=${kbps}`);
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
    this.shareMode = 'max'; // preset das telas: leve, max ou ultra
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
    const escala = nivel.linhas ? Math.max(1, altura / nivel.linhas) : nivel.escala;
    return {
      active: nivel !== NIVEIS.off,
      maxBitrate: Math.round(Math.min(preset.maxBitrate * nivel.teto, Math.max(nivel.piso, preset.maxBitrate * parte))),
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
        if (track.kind === 'video') preferirCodec(tr);
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
              // 60 quadros sempre: se apertar, cai a resolução e não a fluidez
              params.degradationPreference = 'maintain-framerate';
              Object.assign(params.encodings[0], this.envioPara(peer, key), { networkPriority: 'high', priority: 'high' });
              await sender.setParameters(params);
            } catch (err) {
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
      micSender: null,
      micVai: null, // a trilha que está no micSender agora (null: a voz não vai para essa pessoa)
      ouveMic: true, // essa pessoa pode ouvir a minha voz (vozPara)
      camSender: null,
      screenTransceivers: new Map(), // key da tela -> transceivers (vídeo e áudio)
      interesse: new Map(), // key da tela -> quanto essa pessoa precisa dela (ver NIVEIS)
      pending: [],
    };
    this.peers.set(id, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const oferta = await pc.createOffer();
        // outra negociação começou enquanto a oferta era montada: o evento volta sozinho depois
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(comBandaInicial(oferta, this.banda(peer)));
        peer.ofertaDesde = performance.now();
        this.send(id, { description: pc.localDescription });
      } catch (err) {
        console.warn('[rtc] offer', err);
      } finally {
        peer.makingOffer = false;
      }
    };
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
          await pc.setRemoteDescription(comDtx(comBandaInicial(description, this.banda(peer)), semDtx));
        } finally {
          peer.aplicandoResposta = false;
        }
        if (description.type === 'offer') {
          await pc.setLocalDescription(comBandaInicial(await pc.createAnswer(), this.banda(peer)));
          this.send(from, { description: pc.localDescription });
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

  // Como uma tela de outra pessoa está chegando aqui (altura e quadros por segundo): trackId é
  // a trilha de vídeo que está no <video> daquela tela.
  async recebendo(peerId, trackId) {
    const peer = this.peers.get(peerId);
    const tr = peer?.pc.getTransceivers().find((t) => t.receiver.track?.id === trackId);
    if (!tr) return null;
    let r = null;
    try {
      (await tr.receiver.getStats()).forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameHeight) r = { altura: s.frameHeight, fps: Math.round(s.framesPerSecond || 0) };
      });
    } catch { /* conexão fechando */ }
    return r;
  }
}
