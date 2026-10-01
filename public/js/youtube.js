// YouTube no telão 3D (iframe via CSS3D), sincronizado entre todos da sala.

export function parseYouTube(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return { id: text, start: 0 };
  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    id = url.searchParams.get('v');
    const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return { id, start: parseTimestamp(url.searchParams.get('t') || url.searchParams.get('start')) };
}

function parseTimestamp(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export class YouTubeSync {
  constructor(socket, { onChange, onError }) {
    this.socket = socket;
    this.onChange = onChange;
    this.onError = onError;
    this.state = { videoId: null, playing: false, time: 0, updatedAt: Date.now(), by: null };
    this.clockOffset = 0; // servidor - local (ms)
    this.player = null;
    this.ready = false;
    this.loadedId = null;
    this.volume = 80;
    this.hidden = false;
    this.suppressUntil = 0;
    this.userTouchAt = -1e9;
    this.interactive = false;
    this.title = '';
    this.blocked = false; // autoplay com som bloqueado → tocando mudo até a pessoa clicar
    this.stuckSince = null;

    socket.on('yt', (s) => this.receive(s));
    setInterval(() => this.tick(), 1000);

    // Detecta clique dentro do iframe (modo foco): o iframe "rouba" o foco da janela.
    window.addEventListener('blur', () => {
      const iframe = this.player?.getIframe?.();
      if (iframe && document.activeElement === iframe) {
        this.userTouchAt = performance.now();
        setTimeout(() => iframe.blur(), 150);
      }
    });
  }

  async init(containerId) {
    const YT = await loadApi();
    this.YT = YT;
    await new Promise((resolve) => {
      this.player = new YT.Player(containerId, {
        width: 1280,
        height: 720,
        playerVars: {
          autoplay: 0, controls: 1, rel: 0, playsinline: 1, iv_load_policy: 3,
          modestbranding: 1, enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.player.setVolume(this.volume);
            resolve();
          },
          onStateChange: (e) => this.handleStateChange(e.data),
          onError: (e) => this.handleError(e.data),
        },
      });
    });
    const iframe = this.player.getIframe();
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    this.apply(true);
  }

  // -------------------------------------------------------------- estado
  receive(s) {
    this.clockOffset = s.serverNow - Date.now();
    this.state = s;
    if (s.action === 'load') this.title = '';
    this.apply(true);
    this.onChange?.(this.state);
  }

  setInitial(s) {
    this.clockOffset = s.serverNow - Date.now();
    this.state = s;
    this.onChange?.(this.state);
  }

  expectedTime() {
    const s = this.state;
    if (!s.playing) return s.time;
    return s.time + (Date.now() + this.clockOffset - s.updatedAt) / 1000;
  }

  apply(force = false) {
    if (!this.ready) return;
    const p = this.player;
    const s = this.state;
    const YTS = this.YT.PlayerState;
    if (!s.videoId) {
      if (this.loadedId) {
        p.stopVideo();
        this.loadedId = null;
        this.title = '';
      }
      return;
    }
    const t = this.expectedTime();
    this.suppressUntil = performance.now() + 1200;
    if (s.videoId !== this.loadedId) {
      this.loadedId = s.videoId;
      if (s.playing) p.loadVideoById({ videoId: s.videoId, startSeconds: t });
      else p.cueVideoById({ videoId: s.videoId, startSeconds: t });
      this.applyMute();
      return;
    }
    const state = p.getPlayerState();
    const cur = p.getCurrentTime() || 0;
    const drift = Math.abs(cur - t);
    if (s.playing) {
      if (drift > (force ? 0.8 : 2) && state !== YTS.BUFFERING) p.seekTo(t, true);
      if (state !== YTS.PLAYING && state !== YTS.BUFFERING) p.playVideo();
    } else {
      if (state === YTS.PLAYING || state === YTS.BUFFERING) p.pauseVideo();
      if (drift > 0.5) p.seekTo(t, true);
    }
  }

  tick() {
    if (!this.ready || !this.state.videoId) return;
    const YTS = this.YT.PlayerState;
    const p = this.player;
    const st = p.getPlayerState();
    // vídeo deveria estar tocando mas o navegador bloqueou o autoplay com som: toca mudo e pede um clique
    // (abas em segundo plano adiam a reprodução: só conta com a aba visível)
    const stuck = this.state.playing && !this.blocked && document.visibilityState === 'visible'
      && (st === YTS.UNSTARTED || st === YTS.CUED || st === YTS.PAUSED);
    if (!stuck) this.stuckSince = null;
    else if (this.stuckSince == null) this.stuckSince = performance.now();
    else if (performance.now() - this.stuckSince > 2500) {
      this.blocked = true;
      this.stuckSince = null;
      this.applyMute();
      p.seekTo(this.expectedTime(), true);
      p.playVideo();
      this.onChange?.(this.state);
    }

    if (this.recentlyTouched()) {
      const drift = (p.getCurrentTime() || 0) - this.expectedTime();
      if (Math.abs(drift) > 2 && st !== YTS.BUFFERING) {
        this.send('seek', { time: p.getCurrentTime() });
        return;
      }
    }
    this.apply(false);
    const title = p.getVideoData?.()?.title;
    if (title && title !== this.title) {
      this.title = title;
      this.onChange?.(this.state);
    }
  }

  recentlyTouched() {
    return this.interactive && performance.now() - this.userTouchAt < 4000;
  }

  handleStateChange(st) {
    const YTS = this.YT.PlayerState;
    if (st === YTS.PLAYING) {
      const title = this.player.getVideoData?.()?.title;
      if (title && title !== this.title) {
        this.title = title;
        this.onChange?.(this.state);
      }
    }
    if (st === YTS.ENDED) {
      this.send('ended');
      return;
    }
    // mudanças feitas clicando direto no player (só no modo foco)
    if (!this.recentlyTouched() || performance.now() < this.suppressUntil) return;
    const time = this.player.getCurrentTime();
    if (st === YTS.PLAYING && !this.state.playing) this.send('play', { time });
    if (st === YTS.PAUSED && this.state.playing) this.send('pause', { time });
  }

  handleError(code) {
    console.warn('[yt] erro do player:', code);
    const msg = code === 101 || code === 150 || code === 153
      ? 'Esse vídeo não permite ser exibido fora do YouTube. Tente outro.'
      : code === 100 ? 'Vídeo não encontrado ou privado.' : 'Não foi possível tocar esse vídeo.';
    this.onError?.(msg);
  }

  // -------------------------------------------------------------- ações (vão para todos)
  send(action, extra = {}) {
    this.socket.emit('yt', { action, ...extra });
  }

  load(input) {
    const parsed = parseYouTube(input);
    if (!parsed) return false;
    this.send('load', { videoId: parsed.id, time: parsed.start });
    return true;
  }

  togglePlay() {
    if (!this.state.videoId) return;
    const time = this.player && this.ready ? this.player.getCurrentTime() : undefined;
    this.send(this.state.playing ? 'pause' : 'play', { time });
    // clique do usuário: aproveita para destravar o autoplay
    if (!this.state.playing && this.ready) this.player.playVideo();
  }

  seekBy(delta) {
    if (!this.state.videoId) return;
    this.send('seek', { time: Math.max(0, this.expectedTime() + delta) });
  }

  stop() { this.send('stop'); }

  unblock() {
    if (!this.ready) return;
    this.blocked = false;
    this.applyMute();
    if (this.state.playing) this.player.playVideo();
  }

  // -------------------------------------------------------------- som local
  setVolume(v) {
    this.volume = v;
    if (this.ready) this.player.setVolume(v);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    this.applyMute();
  }

  applyMute() {
    if (!this.ready) return;
    if (this.hidden || this.blocked) this.player.mute();
    else this.player.unMute();
  }

  currentTime() {
    return this.ready ? this.player.getCurrentTime() || 0 : this.expectedTime();
  }

  duration() {
    return this.ready ? this.player.getDuration() || 0 : 0;
  }
}
