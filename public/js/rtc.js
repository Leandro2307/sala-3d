// WebRTC em malha (cada pessoa conecta direto com cada outra): microfone + tela + som da tela.
// Usa o padrão "perfect negotiation" para renegociar sem conflitos quando alguém liga/desliga a tela.

// Presets de captura. O que trava jogo pesado não é só banda: é o encoder brigando
// com o jogo pela GPU. Por isso o preset "game" captura em 60 fps mas manda o
// navegador sacrificar resolução antes de sacrificar fluidez.
export const SHARE_PRESETS = {
  detail: {
    label: 'Texto nítido',
    fps: 15,
    width: 1920,
    height: 1080,
    maxBitrate: 3_500_000,
    hint: 'detail',
    degradation: 'maintain-resolution',
    scale: 1,
  },
  motion: {
    label: 'Vídeo',
    fps: 30,
    width: 1920,
    height: 1080,
    maxBitrate: 6_000_000,
    hint: 'motion',
    degradation: 'balanced',
    scale: 1,
  },
  game: {
    label: 'Jogo',
    fps: 60,
    width: 1920,
    height: 1080,
    maxBitrate: 16_000_000, // 1080p60 precisa de banda; abaixo disso ele borra nas cenas de ação
    hint: 'motion',
    degradation: 'maintain-framerate',
    scale: 1, // Full HD de verdade
  },
};

export class RTC {
  constructor(socket, { iceServers, onTrack, onPeerGone }) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.onTrack = onTrack;
    this.onPeerGone = onPeerGone;
    this.selfId = null;
    this.peers = new Map();
    this.micStream = null;
    this.micTrack = null;
    this.screenStream = null;
    this.shareMode = 'detail'; // 'detail' (texto nítido) ou 'motion' (vídeo fluido)
    this.presetOverride = null; // arquivo transmitido usa sempre 'motion', sem mexer no ajuste salvo
    this.extraScale = 1; // reduz vídeo acima de 1080p (arquivo 4K) antes de codificar

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

  // -------------------------------------------------------------- tela
  preset() {
    return SHARE_PRESETS[this.presetOverride || this.shareMode] || SHARE_PRESETS.detail;
  }

  async startScreen() {
    this.presetOverride = null;
    this.extraScale = 1;
    const preset = this.preset();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: preset.fps, max: preset.fps },
        width: { ideal: preset.width },
        height: { ideal: preset.height },
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
    const video = stream.getVideoTracks()[0];
    if (video) video.contentHint = preset.hint;
    const audio = stream.getAudioTracks()[0];
    if (audio) audio.contentHint = 'music';
    this.screenStream = stream;
    return stream;
  }

  // Transmitir um arquivo: o stream vem do próprio <video> (captureStream), não da captura
  // de tela — imagem e som saem direto do arquivo, sem perder qualidade nem pegar o resto do PC.
  useStream(stream, { height = 0 } = {}) {
    this.presetOverride = 'motion';
    this.extraScale = height > 1080 ? height / 1080 : 1;
    const video = stream.getVideoTracks()[0];
    if (video) video.contentHint = 'motion';
    const audio = stream.getAudioTracks()[0];
    if (audio) audio.contentHint = 'music';
    this.screenStream = stream;
  }

  // adiciona a tela a todas as conexões (chamar depois do servidor reservar a tela)
  publishScreen() {
    for (const peer of this.peers.values()) this.addScreenTo(peer);
  }

  addScreenTo(peer) {
    if (!this.screenStream) return;
    const preset = this.preset();
    for (const track of this.screenStream.getTracks()) {
      // um envio por tipo (vídeo/áudio); o que já existe fica
      if (peer.screenTransceivers.some((tr) => tr.receiver.track.kind === track.kind)) continue;
      const init = { direction: 'sendonly', streams: [this.screenStream] };
      if (track.kind === 'video') {
        init.sendEncodings = [{
          maxBitrate: preset.maxBitrate,
          maxFramerate: preset.fps,
          scaleResolutionDownBy: preset.scale * this.extraScale,
          networkPriority: 'high',
          priority: 'high',
        }];
      } else {
        init.sendEncodings = [{ maxBitrate: 192_000 }];
      }
      peer.screenTransceivers.push(peer.pc.addTransceiver(track, init));
    }
    this.tuneScreen(peer);
  }

  // degradationPreference só existe no nível do sender: tem que ser aplicado
  // depois, com setParameters — não dá para passar em addTransceiver.
  async tuneScreen(peer) {
    const preset = this.preset();
    for (const tr of peer.screenTransceivers) {
      const sender = tr.sender;
      if (!sender || sender.track?.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.degradationPreference = preset.degradation;
        Object.assign(params.encodings[0], {
          maxBitrate: preset.maxBitrate,
          maxFramerate: preset.fps,
          scaleResolutionDownBy: preset.scale * this.extraScale,
          networkPriority: 'high',
          priority: 'high',
        });
        await sender.setParameters(params);
      } catch (err) {
        console.warn('[rtc] ajuste do envio', err);
      }
    }
  }

  // O captureStream() de um <video> encerra as trilhas quando o arquivo chega ao fim e cria
  // trilhas novas se ele voltar a tocar. Troca a trilha no envio (sem renegociar) e cria o
  // envio para quem entrou na sala enquanto o vídeo estava parado.
  replaceScreenTrack(track) {
    track.contentHint = track.kind === 'video' ? 'motion' : 'music';
    for (const peer of this.peers.values()) {
      const tr = peer.screenTransceivers.find((t) => t.receiver.track.kind === track.kind);
      if (tr) tr.sender.replaceTrack(track).catch((err) => console.warn('[rtc] troca de trilha', err));
      else this.addScreenTo(peer);
    }
  }

  // reaplica em todos (usado quando o preset muda com a tela já no ar)
  retuneAll() {
    for (const peer of this.peers.values()) this.tuneScreen(peer);
  }

  stopScreen() {
    if (!this.screenStream) return;
    for (const t of this.screenStream.getTracks()) t.stop();
    this.screenStream = null;
    this.presetOverride = null;
    this.extraScale = 1;
    for (const peer of this.peers.values()) {
      for (const tr of peer.screenTransceivers) {
        try {
          peer.pc.removeTrack(tr.sender);
          tr.stop();
        } catch { /* conexão já fechada */ }
      }
      peer.screenTransceivers = [];
    }
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
      screenTransceivers: [],
      pending: [],
    };
    this.peers.set(id, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
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
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      this.onTrack(id, stream, ev.track);
      ev.track.addEventListener('unmute', () => this.onTrack(id, stream, ev.track));
    };

    if (this.micTrack) peer.micSender = pc.addTrack(this.micTrack, this.micStream);
    this.addScreenTo(peer);
    return peer;
  }

  send(to, data) {
    this.socket.emit('signal', { to, data: JSON.parse(JSON.stringify(data)) });
  }

  async handleSignal(from, { description, candidate }) {
    const peer = this.getPeer(from);
    const { pc } = peer;
    try {
      if (description) {
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
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
}
