// WebRTC em malha (cada pessoa conecta direto com cada outra): microfone + tela + som da tela.
// Usa o padrão "perfect negotiation" para renegociar sem conflitos quando alguém liga/desliga a tela.

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
  async startScreen() {
    const motion = this.shareMode === 'motion';
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: motion ? 30 : 15, max: 30 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
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
    if (video) video.contentHint = motion ? 'motion' : 'detail';
    const audio = stream.getAudioTracks()[0];
    if (audio) audio.contentHint = 'music';
    this.screenStream = stream;
    return stream;
  }

  // adiciona a tela a todas as conexões (chamar depois do servidor reservar a tela)
  publishScreen() {
    for (const peer of this.peers.values()) this.addScreenTo(peer);
  }

  addScreenTo(peer) {
    if (!this.screenStream || peer.screenTransceivers.length) return;
    const motion = this.shareMode === 'motion';
    for (const track of this.screenStream.getTracks()) {
      const init = { direction: 'sendonly', streams: [this.screenStream] };
      if (track.kind === 'video') {
        init.sendEncodings = [{ maxBitrate: motion ? 6_000_000 : 3_500_000, maxFramerate: 30 }];
      } else {
        init.sendEncodings = [{ maxBitrate: 192_000 }];
      }
      peer.screenTransceivers.push(peer.pc.addTransceiver(track, init));
    }
  }

  stopScreen() {
    if (!this.screenStream) return;
    for (const t of this.screenStream.getTracks()) t.stop();
    this.screenStream = null;
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
