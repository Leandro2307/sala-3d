// Telão: YouTube, Twitch, Kick, Vimeo, Dailymotion, Facebook e links diretos de vídeo
// (mp4, webm, HLS .m3u8, DASH .mpd), num iframe/<video> via CSS3D, sincronizado entre todos da sala.
// Cada plataforma é um "adaptador" com a mesma cara: o MediaSync não precisa saber qual está tocando.

const PX = { w: 1280, h: 720 }; // mesmo tamanho da superfície CSS3D do telão

// api: o player aceita comando de fora (play/pause/seek), então dá para sincronizar.
// live: transmissão ao vivo — não existe "minuto 12:30" para alinhar, só play/pause.
export const PROVIDERS = {
  youtube: { label: 'YouTube', color: '#ff4d5e', api: true },
  twitch: { label: 'Twitch', color: '#a970ff', api: true, live: true },
  'twitch-vod': { label: 'Twitch', color: '#a970ff', api: true },
  'twitch-clip': { label: 'Twitch', color: '#a970ff' },
  kick: { label: 'Kick', color: '#53fc18', live: true },
  vimeo: { label: 'Vimeo', color: '#1ab7ea', api: true },
  dailymotion: { label: 'Dailymotion', color: '#3d7bff' },
  facebook: { label: 'Facebook', color: '#1877f2' },
  video: { label: 'Vídeo', color: '#6ee7c8', api: true },
  // navegador compartilhado (neko): keepFocus deixa o teclado nele enquanto alguém usa
  browser: { label: 'Navegador', color: '#38bdf8', live: true, keepFocus: true },
};

// ------------------------------------------------------------------ links
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|m3u8|mpd)$/i;
const TWITCH_RESERVED = new Set(['directory', 'videos', 'settings', 'search', 'downloads', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends', 'jobs', 'turbo', 'prime', 'store', 'p']);
const KICK_RESERVED = new Set(['video', 'videos', 'categories', 'category', 'browse', 'following', 'search', 'clips']);
// Esses serviços cifram o vídeo (DRM): não existe embed, e captura de tela costuma sair preta.
const DRM = [
  ['netflix.com', 'A Netflix'], ['primevideo.com', 'O Prime Video'], ['disneyplus.com', 'O Disney+'],
  ['max.com', 'A Max'], ['hbomax.com', 'A Max'], ['globoplay.globo.com', 'O Globoplay'],
  ['paramountplus.com', 'O Paramount+'], ['crunchyroll.com', 'A Crunchyroll'], ['tv.apple.com', 'A Apple TV+'],
  ['starplus.com', 'O Star+'], ['spotify.com', 'O Spotify'],
];

export const UNKNOWN_LINK = 'Não reconheci esse link. Funciona com YouTube, Twitch, Kick, Vimeo, Dailymotion, Facebook ou link direto de vídeo (.mp4, .webm, .m3u8, .mpd).';

const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

function parseTimestamp(t) {
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

// Converte o que a pessoa colou em { provider, id, start }.
// Devolve { error } para link conhecido que não dá para tocar, e null para link desconhecido.
export function parseMedia(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return { provider: 'youtube', id: text, start: 0 };
  if (/^[a-z][\w+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return null; // ftp://, file://…
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|music|web)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const q = (k) => url.searchParams.get(k);

  const drm = DRM.find(([d]) => hostIs(host, d));
  if (drm) {
    return { error: `${drm[1]} tem proteção contra cópia (DRM): não dá para pôr no telão, e compartilhando a tela a imagem costuma chegar preta. Cada um assiste na própria conta.` };
  }

  if (host === 'youtu.be' || hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com')) {
    let id = host === 'youtu.be' ? parts[0] : q('v');
    if (!id && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { provider: 'youtube', id, start: parseTimestamp(q('t') || q('start')) };
  }

  if (hostIs(host, 'twitch.tv')) {
    const clip = (slug) => (slug && /^[\w-]{3,100}$/.test(slug) ? { provider: 'twitch-clip', id: slug, start: 0 } : null);
    const vod = (id, t) => (/^\d{5,14}$/.test(id || '') ? { provider: 'twitch-vod', id, start: parseTimestamp(t) } : null);
    const canal = (name) => (name && /^[a-z0-9_]{2,25}$/i.test(name) && !TWITCH_RESERVED.has(name.toLowerCase())
      ? { provider: 'twitch', id: name.toLowerCase(), start: 0 } : null);
    if (host === 'clips.twitch.tv') return clip(parts[0] === 'embed' ? q('clip') : parts[0]);
    if (host === 'player.twitch.tv') return q('video') ? vod(q('video').replace(/^v/, ''), q('time') || q('t')) : canal(q('channel'));
    if (parts[0] === 'videos') return vod(parts[1], q('t'));
    if (parts[1] === 'clip') return clip(parts[2]);
    if (parts[1] === 'v') return vod(parts[2], q('t'));
    return canal(parts[0]);
  }

  if (hostIs(host, 'kick.com')) {
    const name = parts[0];
    if (!name || !/^[\w-]{2,40}$/.test(name) || KICK_RESERVED.has(name.toLowerCase())) return null;
    return { provider: 'kick', id: name.toLowerCase(), start: 0 };
  }

  if (hostIs(host, 'vimeo.com')) {
    let id = null;
    let hash = q('h');
    if (host === 'player.vimeo.com') {
      if (parts[0] === 'video') id = parts[1];
    } else {
      const i = parts.findIndex((p) => /^\d+$/.test(p));
      if (i >= 0) {
        id = parts[i];
        if (/^[0-9a-f]{6,20}$/i.test(parts[i + 1] || '')) hash = parts[i + 1];
      }
    }
    if (!id || !/^\d{1,12}$/.test(id)) return null;
    if (hash && !/^[0-9a-f]{6,20}$/i.test(hash)) hash = null;
    const t = url.hash.match(/t=([\dhms.]+)/);
    return { provider: 'vimeo', id: hash ? `${id}/${hash.toLowerCase()}` : id, start: parseTimestamp(t?.[1]) };
  }

  if (host === 'dai.ly' || hostIs(host, 'dailymotion.com')) {
    let id = null;
    if (host === 'dai.ly') id = parts[0];
    else if (parts[0] === 'video') id = parts[1];
    else if (parts[0] === 'embed' && parts[1] === 'video') id = parts[2];
    else if (q('video')) id = q('video');
    id = id?.split('_')[0];
    return id && /^[a-z0-9]{5,12}$/i.test(id) ? { provider: 'dailymotion', id, start: 0 } : null;
  }

  if (hostIs(host, 'facebook.com') || host === 'fb.watch') {
    if (url.pathname.startsWith('/plugins/video.php')) {
      const inner = q('href');
      return inner && !/plugins\/video\.php/.test(inner) ? parseMedia(inner) : null;
    }
    if (host === 'fb.watch') return parts[0] ? { provider: 'facebook', id: `https://fb.watch/${parts[0]}/`, start: 0 } : null;
    if (url.pathname.startsWith('/watch') && /^\d+$/.test(q('v') || '')) {
      return { provider: 'facebook', id: `https://www.facebook.com/watch/?v=${q('v')}`, start: 0 };
    }
    if (!/\/(videos?|reel|share\/v)\//.test(url.pathname)) return null;
    return { provider: 'facebook', id: `https://www.facebook.com${url.pathname}`, start: 0 };
  }

  if (VIDEO_EXT.test(url.pathname)) {
    url.hash = '';
    return { provider: 'video', id: url.href, start: 0 };
  }
  return null;
}

// Nome provisório enquanto o player não diz o título de verdade (ou para quem nunca diz).
export function defaultTitle(provider, id) {
  if (!id) return '';
  switch (provider) {
    case 'twitch': return `twitch.tv/${id}`;
    case 'twitch-vod': return 'Vídeo da Twitch';
    case 'twitch-clip': return 'Clipe da Twitch';
    case 'kick': return `kick.com/${id}`;
    case 'dailymotion': return 'Vídeo do Dailymotion';
    case 'facebook': return 'Vídeo do Facebook';
    case 'browser': return 'Navegador compartilhado';
    case 'video': {
      try {
        const u = new URL(id);
        const file = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
        return file || u.hostname;
      } catch {
        return 'Vídeo';
      }
    }
    default: return '';
  }
}

// ------------------------------------------------------------------ carregadores de script
const scripts = new Map();
function loadScript(src, label) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        s.remove();
        reject(new Error(`Não consegui carregar o player do ${label}. Algum bloqueador de anúncios pode estar impedindo.`));
      };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src);
}

let ytApi = null;
// também usado pela música da sala (musica.js), que toca num player do YouTube escondido
export function loadYouTubeApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytApi = null;
      s.remove();
      reject(new Error('Não consegui carregar o player do YouTube. Algum bloqueador de anúncios pode estar impedindo.'));
    };
    document.head.appendChild(s);
  });
  return ytApi;
}

// adianta o download da API do YouTube (o mais usado) para o primeiro vídeo abrir rápido
export function preloadYouTube() {
  loadYouTubeApi().catch(() => {});
}

const cancelled = () => new Error('cancelado');

// ------------------------------------------------------------------ adaptadores
// Todos expõem: ready (Promise), state() → 'idle'|'playing'|'paused'|'buffering'|'ended',
// play(), pause(), seek(s), time(), duration(), title(), setVolume(0-100), setMuted(bool), destroy().
// Avisam o MediaSync por o.onState, o.onError, o.onBlocked (autoplay barrado) e o.onTouch.

function ytErrorMessage(code) {
  if (code === 101 || code === 150 || code === 153) return 'Esse vídeo não permite ser exibido fora do YouTube. Tente outro.';
  if (code === 100) return 'Vídeo não encontrado ou privado.';
  return 'Não foi possível tocar esse vídeo.';
}

class YouTubeAdapter {
  constructor(el, o) {
    this.o = o;
    this.ready = loadYouTubeApi().then((YT) => new Promise((resolve, reject) => {
      if (this.destroyed) return reject(cancelled());
      this.YT = YT;
      this.player = new YT.Player(el, {
        width: PX.w,
        height: PX.h,
        playerVars: {
          autoplay: 0, controls: 1, rel: 0, playsinline: 1, iv_load_policy: 3,
          modestbranding: 1, enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (this.destroyed) return reject(cancelled());
            this.player.getIframe().setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
            this.setVolume(o.volume);
            this.setMuted(o.muted);
            this.load(o.id, o.start, o.autoplay);
            resolve();
          },
          onStateChange: () => o.onState(this.state()),
          onError: (e) => {
            console.warn('[yt] erro do player:', e.data);
            o.onError(ytErrorMessage(e.data));
          },
        },
      });
    }));
  }

  // troca de vídeo reaproveitando o mesmo player (bem mais rápido que recriar o iframe)
  load(id, start, playing) {
    if (playing) this.player.loadVideoById({ videoId: id, startSeconds: start });
    else this.player.cueVideoById({ videoId: id, startSeconds: start });
  }

  state() {
    const S = this.YT.PlayerState;
    switch (this.player.getPlayerState()) {
      case S.PLAYING: return 'playing';
      case S.BUFFERING: return 'buffering';
      case S.PAUSED: return 'paused';
      case S.ENDED: return 'ended';
      default: return 'idle'; // não iniciado ou só carregado (cued)
    }
  }

  play() { this.player.playVideo(); }
  pause() { this.player.pauseVideo(); }
  seek(t) { this.player.seekTo(t, true); }
  time() { return this.player.getCurrentTime() || 0; }
  duration() { return this.player.getDuration() || 0; }
  title() { return this.player.getVideoData?.()?.title || ''; }
  setVolume(v) { this.player.setVolume(v); }
  setMuted(m) {
    if (m) this.player.mute();
    else this.player.unMute();
  }

  destroy() {
    this.destroyed = true;
    try { this.player?.destroy(); } catch { /* já foi */ }
  }
}

function hms(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m${sec % 60}s`;
}

let twitchSeq = 0;
class TwitchAdapter {
  constructor(el, o) {
    this.o = o;
    this.isLive = o.provider === 'twitch';
    this.st = 'idle';
    el.id = `twitch-player-${++twitchSeq}`;
    this.ready = loadScript('https://player.twitch.tv/js/embed/v1.js', 'Twitch').then(() => new Promise((resolve, reject) => {
      if (this.destroyed) return reject(cancelled());
      const P = window.Twitch.Player;
      // a Twitch exige o domínio de quem embute (parent); localhost e o link do túnel servem
      const cfg = { width: '100%', height: '100%', parent: [window.location.hostname], autoplay: o.autoplay, muted: o.muted };
      if (this.isLive) cfg.channel = o.id;
      else {
        cfg.video = o.id;
        cfg.time = hms(o.start);
      }
      const p = new P(el.id, cfg);
      this.player = p;
      const set = (st) => () => {
        this.st = st;
        o.onState(this.state());
      };
      p.addEventListener(P.READY, () => {
        if (this.destroyed) return reject(cancelled());
        this.setVolume(o.volume);
        resolve();
      });
      p.addEventListener(P.PLAY, set('buffering'));
      p.addEventListener(P.PLAYING, set('playing'));
      p.addEventListener(P.PAUSE, set('paused'));
      p.addEventListener(P.ENDED, set('ended'));
      p.addEventListener(P.PLAYBACK_BLOCKED, () => {
        this.st = 'paused';
        o.onBlocked();
      });
      p.addEventListener(P.OFFLINE, () => {
        if (this.isLive) o.onNotice(`O canal ${o.id} está offline agora na Twitch.`);
      });
    }));
  }

  get live() { return this.isLive; }

  state() {
    if (this.st === 'ended') return 'ended';
    if (this.st !== 'idle' && this.player.isPaused()) return 'paused';
    return this.st;
  }

  play() { this.player.play(); }
  pause() { this.player.pause(); }
  seek(t) { if (!this.isLive) this.player.seek(t); }
  time() { return this.player.getCurrentTime() || 0; }
  duration() { return this.isLive ? 0 : this.player.getDuration() || 0; }
  title() { return this.isLive ? `twitch.tv/${this.o.id}` : ''; }
  setVolume(v) { this.player.setVolume(v / 100); }
  setMuted(m) { this.player.setMuted(m); }
  destroy() { this.destroyed = true; }
}

class VimeoAdapter {
  constructor(el, o) {
    this.o = o;
    this.st = 'idle';
    this.t = o.start || 0; // a API do Vimeo é toda assíncrona: guardo o tempo que ela vai avisando
    this.dur = 0;
    this.name = '';
    this.ready = loadScript('https://player.vimeo.com/api/player.js', 'Vimeo').then(async () => {
      if (this.destroyed) throw cancelled();
      const [id, hash] = o.id.split('/');
      const src = hash ? { url: `https://player.vimeo.com/video/${id}?h=${hash}` } : { id: Number(id) };
      const p = new window.Vimeo.Player(el, { ...src, width: PX.w, height: PX.h, autoplay: false, muted: o.muted, playsinline: true });
      this.player = p;
      const set = (st) => () => {
        this.st = st;
        o.onState(st);
      };
      p.on('play', set('buffering'));
      p.on('playing', set('playing'));
      p.on('pause', set('paused'));
      p.on('ended', set('ended'));
      p.on('bufferstart', () => { if (this.st === 'playing') set('buffering')(); });
      p.on('bufferend', () => { if (this.st === 'buffering') set('playing')(); });
      p.on('timeupdate', (d) => {
        this.t = d.seconds;
        this.dur = d.duration;
      });
      p.on('seeked', (d) => { this.t = d.seconds; });
      try {
        await p.ready();
      } catch {
        throw new Error('Esse vídeo do Vimeo não existe, é privado ou não permite ser exibido fora do site.');
      }
      if (this.destroyed) throw cancelled();
      this.setVolume(o.volume);
      p.getVideoTitle().then((t) => { this.name = t; }).catch(() => {});
      p.getDuration().then((d) => { this.dur = d; }).catch(() => {});
    });
  }

  state() { return this.st; }
  play() { this.player.play().catch(() => {}); } // recusa de autoplay é tratada pelo MediaSync
  pause() { this.player.pause().catch(() => {}); }
  seek(t) {
    this.t = t;
    this.player.setCurrentTime(t).catch(() => {});
  }

  time() { return this.t; }
  duration() { return this.dur; }
  title() { return this.name; }
  setVolume(v) { this.player.setVolume(v / 100).catch(() => {}); }
  setMuted(m) { this.player.setMuted(m).catch(() => {}); }
  destroy() {
    this.destroyed = true;
    this.player?.destroy().catch(() => {});
  }
}

function videoErrorMessage(err) {
  if (err?.code === 2) return 'Falha de rede ao baixar o vídeo.';
  if (err?.code === 3) return 'O navegador não conseguiu decodificar esse vídeo.';
  return 'Esse link não é um vídeo que o navegador consiga tocar (ou o servidor bloqueou o acesso).';
}

// Link direto. O <video> fica no CSS3D (não vira textura WebGL), então toca de qualquer
// servidor sem precisar de CORS — exceto HLS/DASH, que o hls.js/dash.js baixam via fetch.
class VideoAdapter {
  constructor(el, o) {
    this.o = o;
    this.isLive = false;
    const v = document.createElement('video');
    v.playsInline = true;
    v.controls = true;
    v.preload = 'auto';
    v.muted = o.muted;
    v.volume = o.volume / 100;
    el.appendChild(v);
    this.v = v;
    v.addEventListener('playing', () => o.onState('playing'));
    v.addEventListener('pause', () => o.onState(v.ended ? 'ended' : 'paused'));
    v.addEventListener('waiting', () => o.onState('buffering'));
    v.addEventListener('ended', () => o.onState('ended'));
    v.addEventListener('pointerdown', () => o.onTouch());
    v.addEventListener('keydown', () => o.onTouch());
    v.addEventListener('error', () => this.fail(videoErrorMessage(v.error)));
    this.ready = this.attach(o.id);
  }

  fail(msg) {
    if (this.failed || this.destroyed) return;
    this.failed = true;
    this.o.onError(msg);
  }

  async attach(url) {
    const path = new URL(url).pathname.toLowerCase();
    // HLS: o hls.js primeiro. O HLS nativo do Chrome ainda é novo e falha em lives que o
    // hls.js toca; o nativo fica para quem não tem MediaSource (iPhone antigo).
    const nativeHls = !!this.v.canPlayType('application/vnd.apple.mpegurl');
    if (path.endsWith('.m3u8') && (window.MediaSource || window.ManagedMediaSource || !nativeHls)) {
      const { default: Hls } = await import('/vendor/hls/hls.min.mjs');
      if (this.destroyed) throw cancelled();
      if (!Hls.isSupported()) {
        if (!nativeHls) throw new Error('Este navegador não toca transmissões HLS (.m3u8).');
        this.v.src = url;
        return;
      }
      const hls = new Hls();
      this.hls = hls;
      hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => { this.isLive = !!d.details?.live; });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        console.warn('[hls]', d);
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.fail('Não consegui abrir esse .m3u8: o link expirou ou o servidor não deixa outros sites lerem (CORS).');
      });
      hls.loadSource(url);
      hls.attachMedia(this.v);
      return;
    }
    if (path.endsWith('.mpd')) {
      const { MediaPlayer } = await import('/vendor/dash/dash.mediaplayer.min.js');
      if (this.destroyed) throw cancelled();
      const p = MediaPlayer().create();
      this.dash = p;
      const ev = MediaPlayer.events || {};
      p.on(ev.ERROR || 'error', (e) => {
        console.warn('[dash]', e);
        this.fail('Não consegui abrir esse .mpd: o link expirou, tem DRM ou o servidor não deixa outros sites lerem (CORS).');
      });
      p.on(ev.STREAM_INITIALIZED || 'streamInitialized', () => { this.isLive = !!p.isDynamic?.(); });
      p.initialize(this.v, url, false);
      return;
    }
    this.v.src = url;
  }

  get live() { return this.isLive || this.v.duration === Infinity; }

  state() {
    const v = this.v;
    if (v.ended) return 'ended';
    if (v.paused) return 'paused';
    if (v.readyState < 3 || v.seeking) return 'buffering';
    return 'playing';
  }

  play() {
    this.v.play().catch((err) => {
      if (err.name === 'NotAllowedError') this.o.onBlocked();
    });
  }

  pause() { this.v.pause(); }
  seek(t) { if (!this.live) this.v.currentTime = t; }
  time() { return this.v.currentTime || 0; }
  duration() { return Number.isFinite(this.v.duration) ? this.v.duration : 0; }
  title() { return ''; }
  setVolume(v) { this.v.volume = Math.min(1, Math.max(0, v / 100)); }
  setMuted(m) { this.v.muted = m; }
  destroy() {
    this.destroyed = true;
    this.hls?.destroy();
    try { this.dash?.reset(); } catch { /* já foi */ }
    this.v.pause();
    this.v.removeAttribute('src');
    this.v.load();
  }
}

// Plataformas sem API de controle: só o iframe. Cada um usa os controles do próprio player
// (modo foco, tecla E), e play/pause não sincroniza.
function frameUrl(provider, id, o) {
  const e = encodeURIComponent;
  switch (provider) {
    // embed=1 esconde a interface do neko; usr/pwd entram direto, sem tela de login
    case 'browser': {
      const b = o.browser;
      if (!b) return 'about:blank';
      return `${b.url}/?embed=1&usr=${e(b.name())}&pwd=${e(b.password)}&volume=${(o.volume / 100).toFixed(2)}`;
    }
    case 'kick': return `https://player.kick.com/${e(id)}?autoplay=true`;
    case 'twitch-clip': return `https://clips.twitch.tv/embed?clip=${e(id)}&parent=${e(window.location.hostname)}&autoplay=true`;
    case 'dailymotion': return `https://geo.dailymotion.com/player.html?video=${e(id)}`;
    case 'facebook': return `https://www.facebook.com/plugins/video.php?href=${e(id)}&show_text=false&autoplay=true&width=${PX.w}`;
    default: return 'about:blank';
  }
}

class FrameAdapter {
  constructor(el, o) {
    const f = document.createElement('iframe');
    f.src = frameUrl(o.provider, o.id, o);
    f.width = PX.w;
    f.height = PX.h;
    // clipboard: copiar e colar entre o seu PC e o navegador compartilhado
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write';
    f.allowFullscreen = true;
    el.appendChild(f);
    this.ready = Promise.resolve();
  }

  state() { return 'playing'; }
  play() {}
  pause() {}
  seek() {}
  time() { return 0; }
  duration() { return 0; }
  title() { return ''; }
  setVolume() {}
  setMuted() {}
  destroy() {}
}

const ADAPTERS = {
  youtube: YouTubeAdapter,
  twitch: TwitchAdapter,
  'twitch-vod': TwitchAdapter,
  'twitch-clip': FrameAdapter,
  kick: FrameAdapter,
  vimeo: VimeoAdapter,
  dailymotion: FrameAdapter,
  facebook: FrameAdapter,
  video: VideoAdapter,
  browser: FrameAdapter,
};

// ------------------------------------------------------------------ sincronização
export class MediaSync {
  constructor(socket, host, { onChange, onError, onNotice, browser = null }) {
    this.socket = socket;
    this.host = host; // div dentro da superfície CSS3D do telão
    this.browser = browser; // { url, password, name() } do navegador compartilhado, se houver
    this.onChange = onChange;
    this.onError = onError;
    this.onNotice = onNotice;
    this.state = { provider: null, id: null, playing: false, time: 0, updatedAt: Date.now(), by: null };
    this.clockOffset = 0; // servidor - local (ms)
    this.adapter = null;
    this.loadedKey = null; // "provedor:id" montado agora
    this.mountSeq = 0;
    this.volume = 80;
    this.hidden = false;
    this.suppressUntil = 0;
    this.userTouchAt = -1e9;
    this.interactive = false;
    this.title = '';
    this.blocked = false; // autoplay com som bloqueado → tocando mudo até a pessoa clicar
    this.failed = false; // o player deu erro: não confundir "parado" com autoplay bloqueado
    this.stuckSince = null;

    socket.on('media', (s) => this.receive(s));
    setInterval(() => this.tick(), 1000);

    // Detecta clique dentro do iframe (modo foco): o iframe "rouba" o foco da janela.
    // Devolve o foco ao jogo para as teclas continuarem andando — menos no navegador
    // compartilhado, onde a pessoa precisa digitar.
    window.addEventListener('blur', () => {
      const el = document.activeElement;
      if (el?.tagName === 'IFRAME' && this.host.contains(el)) {
        this.touch();
        if (!this.meta?.keepFocus) setTimeout(() => el.blur(), 150);
      }
    });
  }

  get meta() { return PROVIDERS[this.state.provider] || null; }
  get label() { return this.meta?.label || 'Telão'; }
  get controllable() { return !!this.meta?.api; }
  get live() { return !!(this.meta?.live || this.adapter?.live); }
  get canSeek() { return this.controllable && !this.live; }
  get ready() { return !!this.adapter?.isReady; }

  // -------------------------------------------------------------- estado
  receive(s) {
    this.clockOffset = s.serverNow - Date.now();
    this.state = s;
    // mesmo link de novo depois de uma falha (bloqueador, rede, link expirado): remonta do zero
    if (s.action === 'load' && this.failed) this.loadedKey = null;
    this.apply(true);
    this.onChange?.(this.state);
  }

  setInitial(s) {
    this.clockOffset = s.serverNow - Date.now();
    this.state = s;
    this.onChange?.(this.state);
    this.apply(true);
  }

  expectedTime() {
    const s = this.state;
    if (!s.playing) return s.time;
    return s.time + (Date.now() + this.clockOffset - s.updatedAt) / 1000;
  }

  apply(force = false) {
    const s = this.state;
    if (!s.id || !this.meta) {
      this.unmount();
      return;
    }
    // player sem API não tem como ficar mudo: com o telão mostrando outra coisa, ele sai da página
    if (this.hidden && !this.meta.api) {
      this.unmount();
      return;
    }
    this.suppressUntil = performance.now() + 1200;
    const key = `${s.provider}:${s.id}`;
    if (key !== this.loadedKey) {
      // this.live ainda olharia o player antigo: aqui só vale o que se sabe do link novo
      const t = this.meta.live ? 0 : this.expectedTime();
      const a = this.adapter;
      if (a?.isReady && a.provider === s.provider && a.load) {
        this.loadedKey = key;
        this.title = '';
        this.failed = false;
        a.load(s.id, t, s.playing);
        this.applyMute();
        return;
      }
      this.mount(s, t);
      return;
    }
    const a = this.adapter;
    if (!a?.isReady || !this.meta.api) return;
    const t = this.expectedTime();
    const st = a.state();
    const drift = this.live ? 0 : Math.abs(a.time() - t);
    if (s.playing) {
      if (drift > (force ? 0.8 : 2) && st !== 'buffering') a.seek(t);
      if (st !== 'playing' && st !== 'buffering') a.play();
    } else {
      if (st === 'playing' || st === 'buffering') a.pause();
      if (drift > 0.5) a.seek(t);
    }
  }

  mount(s, t) {
    this.unmount();
    const seq = ++this.mountSeq;
    const mine = (fn) => (...args) => { if (seq === this.mountSeq) fn(...args); };
    const el = document.createElement('div');
    el.className = 'tv-frame';
    this.host.appendChild(el);
    this.loadedKey = `${s.provider}:${s.id}`;
    this.title = defaultTitle(s.provider, s.id);
    this.failed = false;
    const Adapter = ADAPTERS[s.provider];
    const a = new Adapter(el, {
      provider: s.provider,
      id: s.id,
      start: t,
      autoplay: s.playing,
      volume: this.volume,
      muted: this.hidden || this.blocked,
      browser: this.browser,
      onState: mine((st) => this.handleState(st)),
      onError: mine((msg) => {
        this.failed = true;
        this.onError?.(msg);
      }),
      onNotice: mine((msg) => this.onNotice?.(msg)),
      onBlocked: mine(() => this.block()),
      onTouch: mine(() => this.touch()),
    });
    a.provider = s.provider;
    this.adapter = a;
    a.ready.then(mine(() => {
      a.isReady = true;
      a.setVolume(this.volume);
      this.applyMute();
      this.apply(true);
      this.refreshTitle();
      this.onChange?.(this.state);
    })).catch(mine((err) => {
      this.failed = true;
      console.warn('[telão]', err);
      this.onError?.(err?.message || 'Não foi possível abrir esse vídeo.');
    }));
  }

  unmount() {
    this.loadedKey = null;
    this.stuckSince = null;
    if (!this.adapter) return;
    this.mountSeq++;
    try { this.adapter.destroy(); } catch (err) { console.warn('[telão] destroy', err); }
    this.adapter = null;
    this.title = '';
    this.host.replaceChildren(); // o YouTube troca a div pelo iframe: limpa o que tiver sobrado
  }

  tick() {
    const a = this.adapter;
    if (!this.state.id || !a?.isReady || !this.meta?.api || this.failed) return;
    const st = a.state();
    // deveria estar tocando mas o navegador bloqueou o autoplay com som: toca mudo e pede um clique
    // (abas em segundo plano adiam a reprodução: só conta com a aba visível)
    const stuck = this.state.playing && !this.blocked && document.visibilityState === 'visible'
      && (st === 'idle' || st === 'paused');
    if (!stuck) this.stuckSince = null;
    else if (this.stuckSince == null) this.stuckSince = performance.now();
    else if (performance.now() - this.stuckSince > 2500) this.block();

    if (this.recentlyTouched() && !this.live) {
      const drift = a.time() - this.expectedTime();
      if (Math.abs(drift) > 2 && st !== 'buffering') {
        this.send('seek', { time: a.time() });
        return;
      }
    }
    this.apply(false);
    this.refreshTitle();
  }

  block() {
    if (this.blocked) return;
    this.blocked = true;
    this.stuckSince = null;
    this.applyMute();
    const a = this.adapter;
    if (a?.isReady && this.meta?.api) {
      if (!this.live) a.seek(this.expectedTime());
      a.play();
    }
    this.onChange?.(this.state);
  }

  // título e "ao vivo" às vezes só aparecem depois de o player abrir (um .m3u8 só diz que é live
  // quando a playlist chega): avisa a interface quando algum dos dois muda
  refreshTitle() {
    const t = (this.adapter?.isReady && this.adapter.title()) || defaultTitle(this.state.provider, this.state.id);
    const live = this.live;
    if ((t && t !== this.title) || live !== this.wasLive) {
      if (t) this.title = t;
      this.wasLive = live;
      this.onChange?.(this.state);
    }
  }

  touch() {
    this.userTouchAt = performance.now();
  }

  recentlyTouched() {
    return this.interactive && performance.now() - this.userTouchAt < 4000;
  }

  // mudanças feitas clicando direto no player (só no modo foco)
  handleState(st) {
    if (st === 'playing') this.refreshTitle();
    if (st === 'ended') {
      if (!this.live) this.send('ended');
      return;
    }
    if (!this.recentlyTouched() || performance.now() < this.suppressUntil) return;
    const time = this.adapter.time();
    if (st === 'playing' && !this.state.playing) this.send('play', { time });
    if (st === 'paused' && this.state.playing) this.send('pause', { time });
  }

  // -------------------------------------------------------------- ações (vão para todos)
  send(action, extra = {}) {
    this.socket.emit('media', { action, ...extra });
  }

  // devolve { ok } ou { error } com a mensagem para mostrar
  load(input) {
    const parsed = parseMedia(input);
    if (!parsed) return { error: UNKNOWN_LINK };
    if (parsed.error) return parsed;
    this.send('load', { provider: parsed.provider, id: parsed.id, time: parsed.start });
    return { ok: true };
  }

  togglePlay() {
    if (!this.state.id || !this.controllable) return;
    const a = this.ready ? this.adapter : null;
    this.send(this.state.playing ? 'pause' : 'play', { time: a && !this.live ? a.time() : undefined });
    // clique do usuário: aproveita para destravar o autoplay
    if (!this.state.playing && a) a.play();
  }

  seekBy(delta) {
    if (!this.state.id || !this.canSeek) return;
    this.send('seek', { time: Math.max(0, this.expectedTime() + delta) });
  }

  stop() { this.send('stop'); }

  unblock() {
    this.blocked = false;
    this.applyMute();
    if (this.ready && this.controllable && this.state.playing) this.adapter.play();
  }

  // -------------------------------------------------------------- som local
  setVolume(v) {
    this.volume = v;
    if (this.ready) this.adapter.setVolume(v);
  }

  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.applyMute();
    if (this.meta && !this.meta.api) this.apply(true); // monta/desmonta o iframe sem API
  }

  applyMute() {
    if (this.ready) this.adapter.setMuted(this.hidden || this.blocked);
  }

  currentTime() {
    return this.ready && this.controllable ? this.adapter.time() : this.expectedTime();
  }

  duration() {
    return this.ready && this.controllable ? this.adapter.duration() : 0;
  }
}
