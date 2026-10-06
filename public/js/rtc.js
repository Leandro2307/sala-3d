// WebRTC em malha (cada pessoa conecta direto com cada outra): microfone + tela + som da tela.
// Usa o padrão "perfect negotiation" para renegociar sem conflitos quando alguém liga/desliga a tela.

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

// Webcam: só ocupa o rosto do boneco, então 640x480 a 30 quadros sobra.
const CAM = { width: 640, height: 480, fps: 30, maxBitrate: 600_000 };

// Quanto cada pessoa que assiste precisa de cada tela (ela mesma avisa, ver enviarInteresse):
// max = olhando de perto ou em foco; baixo = vê de longe; mini = vê bem pequena; off = não vê.
// Quem não vê não recebe vídeo: o PC de quem compartilha não gasta codificando para ela, e sobra
// banda para quem está olhando. O som da tela continua indo para todo mundo.
export const NIVEIS = {
  max: { escala: 1, fps: 60, peso: 1 },
  baixo: { escala: 2, fps: 60, peso: 0.3 },
  mini: { escala: 4, fps: 30, peso: 0.08 },
  off: { escala: 4, fps: 1, peso: 0 },
};

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

// O Chrome começa toda conexão com ~300 kbps e vai subindo aos poucos: nos primeiros segundos a
// tela sai em 270p–720p mesmo com internet sobrando (medido: em 6 s ainda estava em 720p). Com a
// banda inicial e o piso no SDP (parâmetros x-google-* do Chrome; os outros navegadores ignoram),
// ela já sai em 1080p a 60 quadros. Só nas trilhas de vídeo (o áudio não muda).
const BANDA_INICIAL = 'x-google-start-bitrate=6000;x-google-min-bitrate=1000';
function comBandaInicial(desc) {
  if (!desc?.sdp) return desc;
  const linhas = desc.sdp.split('\r\n');
  const saida = [];
  let video = false;
  const comFmtp = new Set();
  // payloads de vídeo "de verdade" (não rtx/red/fec) que já têm a=fmtp, por seção
  const secoes = desc.sdp.split(/\r\nm=/);
  for (const sec of secoes) {
    if (!/^(m=)?video /.test(sec)) continue;
    for (const m of sec.matchAll(/a=fmtp:(\d+) /g)) comFmtp.add(m[1]);
  }
  for (const l of linhas) {
    if (l.startsWith('m=')) video = l.startsWith('m=video');
    if (video && l.startsWith('a=fmtp:') && !/apt=|x-google-start-bitrate/.test(l)) {
      saida.push(`${l};${BANDA_INICIAL}`);
      continue;
    }
    saida.push(l);
    // codec sem a=fmtp (o VP8, por exemplo): cria a linha
    const rtp = video && /^a=rtpmap:(\d+) ([\w-]+)\//.exec(l);
    if (rtp && !comFmtp.has(rtp[1]) && !/^(rtx|red|ulpfec|flexfec-03)$/i.test(rtp[2])) saida.push(`a=fmtp:${rtp[1]} ${BANDA_INICIAL}`);
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
      if (peer.micSender) await peer.micSender.replaceTrack(track);
      else peer.micSender = peer.pc.addTrack(track, this.micStream);
    }
    return this.micStream;
  }

  setMicEnabled(on) {
    if (this.micTrack) this.micTrack.enabled = on;
  }

  // -------------------------------------------------------------- webcam
  // Vai no rosto do boneco (Avatar.setCam): imagem pequena, 30 quadros e pouca banda. O stream é
  // sempre o mesmo (camStream): desligar e ligar de novo só troca a trilha, sem renegociar, e
  // quem recebe continua achando a câmera pelo mesmo id. Quem está longe avisa (interesse 'cam')
  // e para de receber.
  async startCam(deviceId = null) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : 'user',
        width: { ideal: CAM.width },
        height: { ideal: CAM.height },
        frameRate: { ideal: CAM.fps, max: CAM.fps },
      },
    });
    const track = stream.getVideoTracks()[0];
    track.contentHint = 'motion';
    this.camStream = this.camStream || new MediaStream();
    const old = this.camTrack;
    if (old) {
      this.camStream.removeTrack(old);
      old.stop();
    }
    this.camStream.addTrack(track);
    this.camTrack = track;
    for (const peer of this.peers.values()) this.addCamTo(peer);
    return this.camStream;
  }

  stopCam() {
    const track = this.camTrack;
    if (!track) return;
    this.camTrack = null;
    this.camStream?.removeTrack(track);
    track.stop();
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
  // dividida pelo peso das telas que ela vê (a que olha de perto leva quase tudo).
  envioPara(peer, key) {
    const preset = this.preset();
    const scr = this.screens.get(key);
    const nivel = NIVEIS[peer.interesse.get(key) || 'max'];
    let soma = 0;
    for (const k of this.screens.keys()) soma += NIVEIS[peer.interesse.get(k) || 'max'].peso;
    const parte = soma > 0 ? nivel.peso / soma : 1;
    // nunca abaixo do que a resolução daquele nível precisa para ficar limpa
    const piso = nivel === NIVEIS.max ? 3_000_000 : nivel === NIVEIS.baixo ? 700_000 : 150_000;
    return {
      active: nivel !== NIVEIS.off,
      maxBitrate: Math.max(piso, Math.round(preset.maxBitrate * parte)),
      maxFramerate: nivel.fps,
      scaleResolutionDownBy: Math.max(1, nivel.escala * (scr?.extraScale || 1)),
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
          init.sendEncodings = [{ maxBitrate: 192_000, networkPriority: 'high', priority: 'high' }];
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
  // Quem assiste avisa quanto precisa de cada tela minha ({ chave: 'max'|'baixo'|'mini'|'off' }).
  // A chave 'cam' é a minha webcam (só 'max' ou 'off').
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

  // Eu (que assisto) aviso a quem compartilha quanto preciso de cada tela dele.
  enviarInteresse(id, mapa) {
    if (this.peers.has(id)) this.send(id, { interesse: mapa });
  }

  // -------------------------------------------------------------- conexões
  getPeer(id) {
    let peer = this.peers.get(id);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    peer = {
      id,
      pc,
      polite: this.selfId > id,
      makingOffer: false,
      ignoreOffer: false,
      micSender: null,
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
        await pc.setLocalDescription(comBandaInicial(oferta));
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
      if (pc.iceConnectionState === 'failed') pc.restartIce();
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

    if (this.micTrack) peer.micSender = pc.addTrack(this.micTrack, this.micStream);
    this.addCamTo(peer);
    this.addScreenTo(peer);
    return peer;
  }

  send(to, data) {
    this.socket.emit('signal', { to, data: JSON.parse(JSON.stringify(data)) });
  }

  async handleSignal(from, { description, candidate, interesse }) {
    const peer = this.getPeer(from);
    if (interesse) return this.receberInteresse(peer, interesse);
    const { pc } = peer;
    try {
      if (description) {
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(comBandaInicial(description));
        if (description.type === 'offer') {
          await pc.setLocalDescription(comBandaInicial(await pc.createAnswer()));
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
