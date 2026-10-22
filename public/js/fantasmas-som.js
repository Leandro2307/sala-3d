// Os sons do Caça-Fantasmas, todos sintetizados na hora (sem arquivo): portas rangendo e batendo,
// passos, batidas na parede, sussurro no ouvido, a caixinha de música, a respiração, o grito, o
// coração na caçada, a estática do Spirit Box, os bipes do EMF e o vento lá fora. Os que vêm de
// algum lugar da casa saem de lá (PannerNode, com o ouvinte na câmera).
//
// A voz do Spirit Box e os sussurros com palavras usam a voz do próprio navegador
// (speechSynthesis), bem grave e lenta.
import { audioContext, sfxLigado } from './sfx.js';

const PALAVRAS = ['saia', 'estou aqui', 'atrás de você', 'morra', 'fique', 'minha casa', 'não', 'socorro', 'eu vejo você', 'venha'];

export class SomFantasma {
  constructor() {
    this.ac = null;
    this.saida = null;
    this.ambienteNos = null;
    this.coracao = { prox: 0, ritmo: 0 };
    this.estaticaNo = null;
    this.rosnado = null;
  }

  ctx() {
    if (!sfxLigado()) return null;
    if (!this.ac) {
      this.ac = audioContext();
      this.saida = this.ac.createGain();
      this.saida.gain.value = 0.9;
      // um compressor no fim: o grito não estoura
      const comp = this.ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.saida.connect(comp).connect(this.ac.destination);
      // reverberação curta de casa vazia
      this.eco = this.ac.createConvolver();
      this.eco.buffer = this.impulso(1.6);
      const ecoVol = this.ac.createGain();
      ecoVol.gain.value = 0.35;
      this.eco.connect(ecoVol).connect(comp);
    }
    return this.ac;
  }

  impulso(seg) {
    const ac = this.ac;
    const n = Math.floor(ac.sampleRate * seg);
    const b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.5;
    }
    return b;
  }

  ruidoBuf() {
    if (this._ruido) return this._ruido;
    const ac = this.ac;
    const n = ac.sampleRate * 2;
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._ruido = b;
    return b;
  }

  // o destino de um som: com posição (x, y, z do mundo) sai de lá; sem, no meio da cabeça
  destino(pos, vol = 1, eco = true) {
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = vol;
    if (pos) {
      const p = ac.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.2;
      p.rolloffFactor = 1.3;
      p.maxDistance = 60;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.saida);
      if (eco) p.connect(this.eco);
    } else {
      g.connect(this.saida);
      if (eco) g.connect(this.eco);
    }
    return g;
  }

  ouvinte(cam) {
    const ac = this.ac;
    if (!ac) return;
    const L = ac.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = p.clone()));
    if (L.positionX) {
      const t = ac.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- peças
  osc(dest, { tipo = 'sine', f = 440, ate = null, dur = 0.3, vol = 0.3, ataque = 0.01, atraso = 0, vibrato = 0 }) {
    const ac = this.ac;
    const t0 = ac.currentTime + atraso;
    const o = ac.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(f, t0);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
    if (vibrato) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = 6 + Math.random() * 2;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  ruido(dest, { dur = 0.2, vol = 0.3, filtro = 'lowpass', f = 1000, ate = null, q = 1, ataque = 0.005, atraso = 0, mod = 0 }) {
    const ac = this.ac;
    const t0 = ac.currentTime + atraso;
    const s = ac.createBufferSource();
    s.buffer = this.ruidoBuf();
    s.loop = true;
    const fi = ac.createBiquadFilter();
    fi.type = filtro;
    fi.frequency.setValueAtTime(f, t0);
    if (ate) fi.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
    fi.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let saida = g;
    if (mod) {
      // tremor (sussurro, respiração)
      const am = ac.createGain();
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = mod;
      lg.gain.value = 0.5;
      am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      g.connect(am);
      saida = am;
    }
    s.connect(fi).connect(g);
    saida.connect(dest);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  distorcao(dest, k = 40) {
    const ac = this.ac;
    const w = ac.createWaveShaper();
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    w.curve = c;
    w.connect(dest);
    return w;
  }

  // ---------------------------------------------------------------- os sons
  tocar(nome, pos = null, vol = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const d = () => this.destino(pos, vol);
    switch (nome) {
      case 'rangido': {
        const g = d();
        this.osc(g, { tipo: 'sawtooth', f: 70 + Math.random() * 30, ate: 140 + Math.random() * 60, dur: 0.9, vol: 0.05, ataque: 0.15, vibrato: 18 });
        this.ruido(g, { dur: 0.9, vol: 0.06, filtro: 'bandpass', f: 900, ate: 1400, q: 8, ataque: 0.2 });
        break;
      }
      case 'bate': {
        const g = d();
        this.ruido(g, { dur: 0.35, vol: 0.9, f: 500, ate: 80, q: 0.7 });
        this.osc(g, { f: 90, ate: 38, dur: 0.4, vol: 0.8 });
        break;
      }
      case 'clique':
        this.ruido(d(), { dur: 0.04, vol: 0.4, filtro: 'bandpass', f: 3000, q: 3 });
        break;
      case 'pancada':
        this.ruido(d(), { dur: 0.12, vol: 0.5, filtro: 'bandpass', f: 700 + Math.random() * 900, q: 2 });
        this.osc(d(), { f: 180, ate: 90, dur: 0.12, vol: 0.2 });
        break;
      case 'vidro':
        for (let i = 0; i < 6; i++) this.osc(d(), { f: 2500 + Math.random() * 3500, dur: 0.15 + Math.random() * 0.2, vol: 0.08, atraso: i * 0.03 });
        this.ruido(d(), { dur: 0.2, vol: 0.4, filtro: 'highpass', f: 3000 });
        break;
      case 'passo':
        this.ruido(d(), { dur: 0.12, vol: 0.5, f: 300, ate: 90, q: 0.8 });
        this.osc(d(), { f: 70, ate: 40, dur: 0.15, vol: 0.35 });
        break;
      case 'batida':
        for (let i = 0; i < 3; i++) {
          this.ruido(d(), { dur: 0.15, vol: 0.8, f: 350, ate: 100, atraso: i * 0.38 });
          this.osc(d(), { f: 110, ate: 50, dur: 0.18, vol: 0.5, atraso: i * 0.38 });
        }
        break;
      case 'sussurro': {
        const g = d();
        this.ruido(g, { dur: 1.6, vol: 0.35, filtro: 'bandpass', f: 2600, ate: 1800, q: 3, ataque: 0.3, mod: 7 });
        this.falar(PALAVRAS[Math.floor(Math.random() * PALAVRAS.length)], { tom: 0.6, ritmo: 0.6, vol: 0.35 });
        break;
      }
      case 'respira': {
        const g = d();
        for (let i = 0; i < 2; i++) {
          this.ruido(g, { dur: 1.1, vol: 0.4, filtro: 'lowpass', f: 700, q: 1.5, ataque: 0.6, atraso: i * 2.2 });
          this.ruido(g, { dur: 1.3, vol: 0.3, filtro: 'lowpass', f: 500, ate: 300, q: 1.5, ataque: 0.2, atraso: i * 2.2 + 1.1 });
        }
        break;
      }
      case 'musica': {
        // caixinha de música: uma canção de ninar em lá menor, desafinando no fim
        const notas = [76, 74, 72, 74, 76, 76, 76, 74, 74, 74, 76, 79, 79, 76, 74, 72, 74, 76, 76, 76, 76, 74, 74, 76, 74, 72];
        const g = d();
        notas.forEach((n, i) => {
          const f = 440 * 2 ** ((n - 69) / 12) * (1 - (i / notas.length) * 0.04);
          this.osc(g, { f, dur: 0.9, vol: 0.09, atraso: i * 0.32 * (1 + i * 0.012) });
          this.osc(g, { f: f * 2.01, dur: 0.5, vol: 0.03, atraso: i * 0.32 * (1 + i * 0.012) });
        });
        break;
      }
      case 'risada':
        this.falar('rá rá rá rá', { tom: 1.9, ritmo: 1.1, vol: 0.4 });
        break;
      case 'grito':
        this.grito(d(), 1.6, 1);
        break;
      case 'cacada': {
        const g = d();
        this.osc(g, { tipo: 'sawtooth', f: 45, ate: 30, dur: 2.5, vol: 0.5, ataque: 0.05 });
        this.ruido(g, { dur: 2.2, vol: 0.5, f: 200, ate: 60 });
        this.ruido(g, { dur: 0.6, vol: 0.4, filtro: 'highpass', f: 3000 });
        break;
      }
      case 'susto': {
        // o susto: um acorde desafinado de uma vez, ruído e o grito
        const g = this.destino(null, vol * 1.3, false);
        const dist = this.distorcao(g, 60);
        for (const f of [311, 330, 466, 494, 622]) this.osc(dist, { tipo: 'sawtooth', f, ate: f * 0.7, dur: 1.4, vol: 0.12, ataque: 0.005 });
        this.ruido(g, { dur: 0.9, vol: 0.8, filtro: 'highpass', f: 1500, ate: 400 });
        this.grito(g, 1.4, 1.2);
        break;
      }
      case 'trovao':
        this.ruido(d(), { dur: 4, vol: 0.7, f: 160, ate: 40, ataque: 0.15 });
        this.ruido(d(), { dur: 0.6, vol: 0.4, f: 1200, ate: 200, ataque: 0.01 });
        break;
      case 'chiado':
        this.ruido(d(), { dur: 1.5, vol: 0.3, filtro: 'highpass', f: 4000, ataque: 0.05 });
        break;
      case 'fosforo':
        this.ruido(d(), { dur: 0.25, vol: 0.4, filtro: 'bandpass', f: 2500, q: 1.5 });
        this.ruido(d(), { dur: 1.5, vol: 0.1, filtro: 'highpass', f: 5000, atraso: 0.2 });
        break;
      case 'trancada':
        for (let i = 0; i < 4; i++) this.ruido(d(), { dur: 0.07, vol: 0.6, filtro: 'bandpass', f: 1800, q: 4, atraso: i * 0.11 });
        break;
      case 'comprimidos':
        for (let i = 0; i < 8; i++) this.ruido(d(), { dur: 0.05, vol: 0.2, filtro: 'bandpass', f: 4000 + Math.random() * 2000, q: 5, atraso: i * 0.05 });
        break;
      case 'escrita':
        this.ruido(d(), { dur: 1.2, vol: 0.2, filtro: 'bandpass', f: 3500, q: 4, mod: 11 });
        break;
      case 'teleporte':
        this.osc(d(), { f: 200, ate: 60, dur: 0.8, vol: 0.3 });
        this.ruido(d(), { dur: 0.8, vol: 0.2, f: 3000, ate: 200 });
        break;
      case 'bipe':
        this.osc(d(), { tipo: 'square', f: 1800, dur: 0.06, vol: 0.05 });
        break;
      case 'morte':
        this.grito(d(), 1.2, 0.8);
        this.ruido(d(), { dur: 0.5, vol: 0.6, f: 300, ate: 60 });
        break;
      default:
    }
  }

  // um grito: três vozes de dente de serra subindo e caindo, com tremor, por um filtro de boca
  grito(dest, dur, vol) {
    const ac = this.ac;
    const t0 = ac.currentTime;
    const boca = ac.createBiquadFilter();
    boca.type = 'bandpass';
    boca.frequency.setValueAtTime(1100, t0);
    boca.frequency.linearRampToValueAtTime(1800, t0 + dur * 0.3);
    boca.frequency.linearRampToValueAtTime(900, t0 + dur);
    boca.Q.value = 1.2;
    const sat = this.distorcao(dest, 20);
    boca.connect(sat);
    for (const k of [1, 1.013, 0.987]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520 * k, t0);
      o.frequency.exponentialRampToValueAtTime(980 * k, t0 + dur * 0.25);
      o.frequency.exponentialRampToValueAtTime(420 * k, t0 + dur);
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = 35;
      lfo.connect(lg).connect(o.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18 * vol, t0 + 0.04);
      g.gain.setValueAtTime(0.18 * vol, t0 + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(boca);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + dur + 0.05);
      lfo.stop(t0 + dur + 0.05);
    }
    this.ruido(boca, { dur, vol: 0.4 * vol, filtro: 'highpass', f: 800 });
  }

  // a voz do navegador: grave e lenta (Spirit Box) ou fina (risada)
  falar(texto, { tom = 0.1, ritmo = 0.7, vol = 1 } = {}) {
    if (!sfxLigado() || typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      u.pitch = tom;
      u.rate = ritmo;
      u.volume = vol;
      const voz = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
      if (voz) u.voice = voz;
      speechSynthesis.speak(u);
    } catch { /* sem voz no navegador: fica o texto na tela */ }
  }

  // ---------------------------------------------------------------- contínuos
  // o fundo: um zumbido grave e o vento lá fora (dentro, mais abafado)
  ambiente(ligar) {
    const ac = this.ctx();
    if (!ac) return;
    if (ligar && !this.ambienteNos) {
      const g = ac.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(1, ac.currentTime + 3);
      g.connect(this.saida);
      const zumbido = [55, 58.3, 82.5].map((f) => {
        const o = ac.createOscillator();
        o.frequency.value = f;
        const og = ac.createGain();
        og.gain.value = 0.025;
        o.connect(og).connect(g);
        o.start();
        return o;
      });
      const vento = ac.createBufferSource();
      vento.buffer = this.ruidoBuf();
      vento.loop = true;
      const vf = ac.createBiquadFilter();
      vf.type = 'bandpass';
      vf.frequency.value = 500;
      vf.Q.value = 0.8;
      const vg = ac.createGain();
      vg.gain.value = 0.05;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ac.createGain();
      lg.gain.value = 300;
      lfo.connect(lg).connect(vf.frequency);
      const lfo2 = ac.createOscillator();
      lfo2.frequency.value = 0.11;
      const lg2 = ac.createGain();
      lg2.gain.value = 0.035;
      lfo2.connect(lg2).connect(vg.gain);
      vento.connect(vf).connect(vg).connect(g);
      vento.start();
      lfo.start();
      lfo2.start();
      this.ambienteNos = { g, zumbido, vento, lfo, lfo2, vg, vf };
    } else if (!ligar && this.ambienteNos) {
      const n = this.ambienteNos;
      this.ambienteNos = null;
      n.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
      setTimeout(() => {
        for (const o of [...n.zumbido, n.vento, n.lfo, n.lfo2]) o.stop();
        n.g.disconnect();
      }, 700);
    }
  }

  // dentro da casa o vento fica abafado
  dentro(sim) {
    const n = this.ambienteNos;
    if (!n) return;
    n.vf.frequency.value = sim ? 260 : 500;
  }

  // o coração: 0 parado, 1 disparado (todo quadro)
  coracaoBate(nivel, dt) {
    const ac = this.ctx();
    if (!ac || nivel <= 0.02) return;
    this.coracao.prox -= dt;
    if (this.coracao.prox > 0) return;
    this.coracao.prox = 1.1 - nivel * 0.65;
    const g = this.destino(null, 0.35 + nivel * 0.6, false);
    this.osc(g, { f: 62, ate: 38, dur: 0.16, vol: 0.9 });
    this.osc(g, { f: 55, ate: 34, dur: 0.18, vol: 0.7, atraso: 0.2 });
  }

  // a estática na caçada (e o rosnado quando ele chega perto): nivel 0 desliga
  estatica(nivel) {
    const ac = this.ctx();
    if (!ac) return;
    if (nivel > 0 && !this.estaticaNo) {
      const s = ac.createBufferSource();
      s.buffer = this.ruidoBuf();
      s.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.saida);
      s.start();
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 68;
      const of = ac.createBiquadFilter();
      of.type = 'lowpass';
      of.frequency.value = 280;
      const og = ac.createGain();
      og.gain.value = 0;
      o.connect(of).connect(og).connect(this.saida);
      o.start();
      this.estaticaNo = { s, g, o, og, f };
    }
    const n = this.estaticaNo;
    if (!n) return;
    const t = ac.currentTime;
    n.g.gain.setTargetAtTime(nivel > 0 ? 0.015 + nivel * 0.06 * Math.random() : 0, t, 0.05);
    n.og.gain.setTargetAtTime(nivel > 0.5 ? (nivel - 0.5) * 0.35 : 0, t, 0.1);
    n.o.frequency.setTargetAtTime(60 + Math.random() * 25, t, 0.1);
    if (nivel <= 0) {
      this.estaticaNo = null;
      setTimeout(() => {
        n.s.stop();
        n.o.stop();
      }, 400);
    }
  }

  // o Spirit Box varrendo as estações: um chiado que pula de frequência
  varredura(dur = 2) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(null, 0.6, false);
    for (let i = 0; i < dur / 0.09; i++) {
      this.ruido(g, { dur: 0.08, vol: 0.18, filtro: 'bandpass', f: 400 + Math.random() * 3000, q: 4, atraso: i * 0.09 });
      if (Math.random() < 0.3) this.osc(g, { tipo: 'square', f: 200 + Math.random() * 800, dur: 0.05, vol: 0.03, atraso: i * 0.09 });
    }
  }

  // bipes do EMF: mais rápidos e agudos quanto maior o nível
  emf(nivel, dt) {
    const ac = this.ctx();
    if (!ac || nivel < 2) return;
    this._emf = (this._emf || 0) - dt;
    if (this._emf > 0) return;
    this._emf = [0, 0, 0.6, 0.35, 0.2, 0.09][nivel];
    const g = this.destino(null, 0.25, false);
    this.osc(g, { tipo: 'square', f: 1400 + nivel * 260, dur: 0.05, vol: 0.12 });
  }

  parar() {
    this.ambiente(false);
    this.estatica(0);
    try { speechSynthesis.cancel(); } catch { /* sem voz */ }
  }
}
