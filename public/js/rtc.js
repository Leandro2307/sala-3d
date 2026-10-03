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
    // ao mesmo tempo. preset: null segue o ajuste salvo; arquivo transmitido usa sempre
    // 'motion'. extraScale reduz vídeo acima de 1080p (arquivo 4K) antes de codificar.
    this.screens = new Map(); // key -> { stream, preset, extraScale }
    this.shareMode = 'detail'; // 'detail' (texto nítido) ou 'motion' (vídeo fluido)

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
  preset(key) {
    return SHARE_PRESETS[this.screens.get(key)?.preset || this.shareMode] || SHARE_PRESETS.detail;
  }

  // Várias telas saindo ao mesmo tempo dividem a banda de quem compartilha: cada uma fica com
  // uma parte do teto do preset (nunca abaixo de 1,2 Mbps, para o texto continuar legível).
  bitrate(key) {
    const n = Math.max(1, this.screens.size);
    return Math.max(1_200_000, Math.round(this.preset(key).maxBitrate / n));
  }

  // pede a aba/janela/tela ao navegador; quem chama decide se publica (addScreen)
  async captureScreen() {
    const preset = SHARE_PRESETS[this.shareMode] || SHARE_PRESETS.detail;
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
    return stream;
  }

  // Põe uma tela no ar para todo mundo (chamar depois do servidor reservar a tela).
  // Arquivo transmitido: o stream vem do próprio <video> (captureStream) e vai como 'motion'.
  addScreen(key, stream, { file = false, height = 0 } = {}) {
    if (file) {
      const video = stream.getVideoTracks()[0];
      if (video) video.contentHint = 'motion';
      const audio = stream.getAudioTracks()[0];
      if (audio) audio.contentHint = 'music';
    }
    this.screens.set(key, {
      stream,
      preset: file ? 'motion' : null,
      extraScale: file && height > 1080 ? height / 1080 : 1,
    });
    for (const peer of this.peers.values()) this.addScreenTo(peer, key);
    this.retuneAll(); // a banda agora é dividida por mais uma
  }

  addScreenTo(peer, only = null) {
    for (const [key, scr] of this.screens) {
      if (only && key !== only) continue;
      const preset = this.preset(key);
      const trs = peer.screenTransceivers.get(key) || [];
      for (const track of scr.stream.getTracks()) {
        // um envio por tipo (vídeo/áudio); o que já existe fica
        if (trs.some((tr) => tr.receiver.track.kind === track.kind)) continue;
        const init = { direction: 'sendonly', streams: [scr.stream] };
        if (track.kind === 'video') {
          init.sendEncodings = [{
            maxBitrate: this.bitrate(key),
            maxFramerate: preset.fps,
            scaleResolutionDownBy: preset.scale * scr.extraScale,
            networkPriority: 'high',
            priority: 'high',
          }];
        } else {
          init.sendEncodings = [{ maxBitrate: 192_000 }];
        }
        trs.push(peer.pc.addTransceiver(track, init));
      }
      peer.screenTransceivers.set(key, trs);
    }
    this.tuneScreen(peer);
  }

  // degradationPreference só existe no nível do sender: tem que ser aplicado
  // depois, com setParameters — não dá para passar em addTransceiver.
  async tuneScreen(peer) {
    for (const [key, trs] of peer.screenTransceivers) {
      const scr = this.screens.get(key);
      if (!scr) continue;
      const preset = this.preset(key);
      for (const tr of trs) {
        const sender = tr.sender;
        if (!sender || sender.track?.kind !== 'video') continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.degradationPreference = preset.degradation;
          Object.assign(params.encodings[0], {
            maxBitrate: this.bitrate(key),
            maxFramerate: preset.fps,
            scaleResolutionDownBy: preset.scale * scr.extraScale,
            networkPriority: 'high',
            priority: 'high',
          });
          await sender.setParameters(params);
        } catch (err) {
          console.warn('[rtc] ajuste do envio', err);
        }
      }
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
      }
    }
    if (keys.length) this.retuneAll(); // sobra mais banda para as que ficaram
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
      screenTransceivers: new Map(), // key da tela -> transceivers (vídeo e áudio)
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
