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
      case 'cacada':
        this.inicioCacada();
        break;
      case 'susto':
        this.susto(vol);
        break;
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
        this.morteDeOutro(pos, vol);
        break;
      default:
    }
  }

  // um grito: vozes de dente de serra subindo e caindo, com tremor, por um filtro de boca. Cada um
  // sai diferente: o (opcional) tom (multiplica tudo), f0/pico/fim em Hz, vozes, tremor (Hz), atraso (s)
  grito(dest, dur, vol, o = {}) {
    const ac = this.ac;
    const t0 = ac.currentTime + (o.atraso || 0);
    const k0 = o.tom ?? 0.85 + Math.random() * 0.35;
    const boca = ac.createBiquadFilter();
    boca.type = 'bandpass';
    boca.frequency.setValueAtTime(1100 * k0, t0);
    boca.frequency.linearRampToValueAtTime(1800 * k0, t0 + dur * 0.3);
    boca.frequency.linearRampToValueAtTime(900 * k0, t0 + dur);
    boca.Q.value = 1.2;
    const sat = this.distorcao(dest, 20);
    boca.connect(sat);
    for (const k of [1, 1.013, 0.987, 1.031, 0.969].slice(0, o.vozes || 3)) {
      const os = ac.createOscillator();
      os.type = 'sawtooth';
      os.frequency.setValueAtTime((o.f0 ?? 520) * k0 * k, t0);
      os.frequency.exponentialRampToValueAtTime((o.pico ?? 980) * k0 * k, t0 + dur * 0.25);
      os.frequency.exponentialRampToValueAtTime((o.fim ?? 420) * k0 * k, t0 + dur);
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = o.tremor ?? 5 + Math.random() * 4;
      lg.gain.value = 35 * k0;
      lfo.connect(lg).connect(os.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18 * vol, t0 + 0.04);
      g.gain.setValueAtTime(0.18 * vol, t0 + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      os.connect(g).connect(boca);
      os.start(t0);
      lfo.start(t0);
      os.stop(t0 + dur + 0.05);
      lfo.stop(t0 + dur + 0.05);
    }
    this.ruido(boca, { dur, vol: 0.4 * vol, filtro: 'highpass', f: 800, atraso: o.atraso || 0 });
  }

  // ---------------------------------------------------------------- sustos variados
  // De 0 a n-1, sem repetir o último daquela categoria: o mesmo susto duas vezes seguidas perde a graça
  sorteio(cat, n) {
    this.ultimos ||= {};
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.ultimos[cat]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.ultimos[cat] = i;
    return i;
  }

  // ganho com tremor (rosnado, engasgo): o que entra nele treme hz vezes por segundo
  tremolo(dest, hz, prof, dur) {
    const ac = this.ac;
    const am = ac.createGain();
    am.gain.value = 1 - prof;
    const lfo = ac.createOscillator();
    lfo.frequency.value = hz;
    const lg = ac.createGain();
    lg.gain.value = prof;
    lfo.connect(lg).connect(am.gain);
    lfo.start();
    lfo.stop(ac.currentTime + dur + 0.1);
    am.connect(dest);
    return am;
  }

  // O susto de quando ele pega você: oito jeitos, cada um com o tom sorteado. zumbido: o ouvido
  // fica apitando depois (só na morte)
  susto(vol = 1, zumbido = true) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(null, vol * 1.3, false);
    const k = 0.8 + Math.random() * 0.4;
    switch (this.sorteio('susto', 8)) {
      case 0: {
        // o acorde desafinado de uma vez, o chiado e o grito
        const dist = this.distorcao(g, 60);
        for (const f of [311, 330, 466, 494, 622]) this.osc(dist, { tipo: 'sawtooth', f: f * k, ate: f * k * 0.7, dur: 1.4, vol: 0.12, ataque: 0.005 });
        this.ruido(g, { dur: 0.9, vol: 0.8, filtro: 'highpass', f: 1500, ate: 400 });
        this.grito(g, 1.4, 1.2, { tom: k });
        break;
      }
      case 1: {
        // violinos de filme de terror: facadas agudas, cada vez mais altas, e o guincho no fim
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2600;
        bp.Q.value = 0.8;
        bp.connect(g);
        let t = 0;
        for (let i = 0; i < 7; i++) {
          for (const f of [1180, 1251, 1324]) this.osc(bp, { tipo: 'sawtooth', f: f * k * (1 + i * 0.025), dur: 0.11, vol: 0.18, ataque: 0.003, atraso: t, vibrato: 25 });
          t += 0.09 + Math.random() * 0.04;
        }
        this.osc(bp, { tipo: 'sawtooth', f: 1500 * k, ate: 1950 * k, dur: 1.1, vol: 0.16, atraso: t, vibrato: 45 });
        this.ruido(g, { dur: 0.3, vol: 0.5, filtro: 'highpass', f: 2000 });
        this.osc(g, { f: 60, ate: 32, dur: 0.9, vol: 0.7 });
        break;
      }
      case 2: {
        // o rugido: um bicho enorme rosnando na sua cara, com um guincho por cima
        const dist = this.distorcao(g, 90);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        lp.connect(dist);
        const am = this.tremolo(lp, 22, 0.45, 2);
        for (const f of [95, 97.5, 142]) this.osc(am, { tipo: 'sawtooth', f: f * k, ate: f * k * 0.45, dur: 1.8, vol: 0.35, ataque: 0.02 });
        this.ruido(am, { dur: 1.6, vol: 0.6, f: 900, ate: 200 });
        this.grito(g, 1.0, 0.6, { f0: 1400, pico: 2200, fim: 900, vozes: 2, atraso: 0.15, tom: k });
        break;
      }
      case 3: {
        // o chiado crescendo ao contrário até o estouro, com um sino rachado
        this.ruido(g, { dur: 0.36, vol: 0.55, filtro: 'highpass', f: 800, ate: 5000, ataque: 0.33 });
        const t = 0.34;
        this.osc(g, { f: 70 * k, ate: 28, dur: 1.6, vol: 1, atraso: t });
        this.ruido(g, { dur: 0.7, vol: 0.9, f: 4000, ate: 90, atraso: t });
        for (const f of [523, 787, 1103, 1560, 2210]) this.osc(g, { tipo: 'triangle', f: f * k, dur: 1.8, vol: 0.06, atraso: t });
        this.grito(g, 0.9, 0.9, { atraso: t + 0.05, f0: 700, pico: 1300, fim: 500, tom: k });
        break;
      }
      case 4: {
        // dois gritos engasgando juntos (o som picota no começo)
        const corte = ac.createGain();
        corte.connect(g);
        const t0 = ac.currentTime;
        for (let i = 0; i < 10; i++) corte.gain.setValueAtTime(i % 2 ? 0.12 : 1, t0 + i * 0.05);
        corte.gain.setValueAtTime(1, t0 + 0.5);
        this.grito(corte, 1.5, 1.1, { tom: k });
        this.grito(corte, 1.3, 0.9, { tom: k * 1.33, atraso: 0.04 });
        this.ruido(g, { dur: 0.5, vol: 0.6, filtro: 'bandpass', f: 1800, q: 0.7 });
        break;
      }
      case 5: {
        // a sirene subindo e o corte seco no estouro
        const dist = this.distorcao(g, 50);
        this.osc(dist, { tipo: 'sawtooth', f: 180 * k, ate: 2000 * k, dur: 0.55, vol: 0.18, ataque: 0.4 });
        this.osc(dist, { tipo: 'square', f: 190 * k, ate: 2100 * k, dur: 0.55, vol: 0.1, ataque: 0.4 });
        this.osc(g, { f: 60, ate: 30, dur: 1.2, vol: 1, atraso: 0.5 });
        this.ruido(g, { dur: 0.6, vol: 0.9, f: 3000, ate: 120, atraso: 0.5 });
        this.grito(g, 1.2, 1, { atraso: 0.5, tom: k * 1.1 });
        break;
      }
      case 6: {
        // o rádio quebrando: pedaços de som picotados e o grito no fim
        for (let i = 0; i < 16; i++) {
          const t = i * 0.045 + Math.random() * 0.02;
          const f = 80 + Math.random() * 2600;
          this.osc(g, { tipo: Math.random() < 0.5 ? 'square' : 'sawtooth', f, ate: f * (0.5 + Math.random()), dur: 0.05, vol: 0.14, atraso: t, ataque: 0.002 });
          if (i % 3 === 0) this.ruido(g, { dur: 0.04, vol: 0.5, filtro: 'bandpass', f: 500 + Math.random() * 4000, q: 2, atraso: t });
        }
        this.osc(g, { f: 55, ate: 30, dur: 1.4, vol: 0.9, atraso: 0.75 });
        this.grito(g, 1.1, 1, { atraso: 0.72, vozes: 4, tom: k });
        break;
      }
      default: {
        // ele fala antes de gritar
        const frases = ['Peguei você', 'Agora você é meu', 'Fique comigo', 'Achei você', 'Você é meu'];
        this.falar(frases[Math.floor(Math.random() * frases.length)], { tom: 0.05, ritmo: 0.75, vol: 1 });
        this.osc(g, { f: 50, ate: 28, dur: 2, vol: 0.9 });
        this.ruido(g, { dur: 1.2, vol: 0.4, f: 300, ate: 60 });
        this.grito(g, 1.3, 0.9, { atraso: 0.9, tom: k * 0.9 });
      }
    }
    if (zumbido) this.zumbido(vol);
  }

  // depois do susto: o ouvido apitando e um grave que demora a passar
  zumbido(vol = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(null, 0.25 * vol, false);
    this.osc(g, { f: 3900 + Math.random() * 800, dur: 5, vol: 0.12, ataque: 0.8, atraso: 1.2 });
    this.osc(g, { f: 48, dur: 6, vol: 0.4, ataque: 1.5, atraso: 1 });
  }

  // O ferrão: susto curto quando ele aparece perto (ou vê você na caçada). Cinco jeitos.
  ferroada(vol = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(null, vol, false);
    const k = 0.85 + Math.random() * 0.3;
    switch (this.sorteio('ferroada', 5)) {
      case 0:
        for (const f of [1180, 1251]) this.osc(g, { tipo: 'sawtooth', f: f * k, ate: f * k * 1.08, dur: 0.7, vol: 0.09, ataque: 0.01, vibrato: 30 });
        break;
      case 1:
        this.ruido(g, { dur: 0.6, vol: 0.4, filtro: 'bandpass', f: 600, ate: 3500, q: 1, ataque: 0.55 });
        this.osc(g, { f: 80, ate: 40, dur: 0.6, vol: 0.6, atraso: 0.58 });
        break;
      case 2:
        this.osc(g, { f: 4200 * k, dur: 1.2, vol: 0.06, ataque: 0.05 });
        this.osc(g, { f: 65, ate: 35, dur: 0.5, vol: 0.6 });
        break;
      case 3: {
        const dist = this.distorcao(g, 30);
        for (const f of [98, 104, 147]) this.osc(dist, { tipo: 'sawtooth', f: f * k, ate: f * k * 0.8, dur: 0.9, vol: 0.12, ataque: 0.01 });
        break;
      }
      default:
        // alguém puxando o ar de susto
        this.ruido(g, { dur: 0.35, vol: 0.5, filtro: 'bandpass', f: 1400, ate: 2600, q: 2, ataque: 0.25 });
        this.osc(g, { f: 900 * k, ate: 1300 * k, dur: 0.4, vol: 0.05, ataque: 0.2 });
    }
  }

  // O monstro na caçada, de onde ele está: rosnado, guincho, respiração, gemido, ossos estalando,
  // unha na parede, e de perto ri ou fala. perto: 0 (longe) a 1 (colado)
  vozDaCacada(pos, perto = 0) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(pos, 0.9 + perto * 0.6);
    const k = 0.8 + Math.random() * 0.45;
    let v = this.sorteio('voz', 8);
    if ((v === 5 || v === 6) && perto < 0.35) v = v === 5 ? 0 : 3; // risada e fala, só de perto
    switch (v) {
      case 0: {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        lp.connect(this.distorcao(g, 40));
        const am = this.tremolo(lp, 14 + Math.random() * 10, 0.5, 1.4);
        this.osc(am, { tipo: 'sawtooth', f: 72 * k, ate: 52 * k, dur: 1.3, vol: 0.45, ataque: 0.08 });
        this.ruido(am, { dur: 1.2, vol: 0.4, f: 400, ataque: 0.1 });
        break;
      }
      case 1:
        this.grito(g, 0.7, 0.6, { f0: 1100, pico: 1900, fim: 800, vozes: 2, tom: k });
        break;
      case 2:
        for (let i = 0; i < 2; i++) {
          this.ruido(g, { dur: 0.45, vol: 0.55, f: 900, q: 1.5, ataque: 0.3, atraso: i * 0.75 });
          this.ruido(g, { dur: 0.35, vol: 0.45, f: 600, ate: 300, q: 1.5, ataque: 0.05, atraso: i * 0.75 + 0.42 });
        }
        break;
      case 3: {
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        bp.Q.value = 2;
        bp.connect(g);
        this.osc(bp, { tipo: 'triangle', f: 220 * k, ate: 150 * k, dur: 1.6, vol: 0.5, ataque: 0.3, vibrato: 8 });
        this.osc(bp, { tipo: 'sawtooth', f: 330 * k, ate: 230 * k, dur: 1.5, vol: 0.12, ataque: 0.35, vibrato: 6 });
        break;
      }
      case 4: {
        let t = 0;
        for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
          this.ruido(g, { dur: 0.025, vol: 0.8, filtro: 'bandpass', f: 2500 + Math.random() * 1500, q: 6, atraso: t });
          t += 0.06 + Math.random() * 0.18;
        }
        break;
      }
      case 5:
        this.falar(['rá rá rá', 'rê rê rê', 'hi hi hi'][Math.floor(Math.random() * 3)], { tom: 0.25 + Math.random() * 0.3, ritmo: 0.8, vol: 0.5 + perto * 0.5 });
        break;
      case 6:
        this.falar(['Eu vejo você', 'Não adianta correr', 'Venha cá', 'Achei você', 'Você não vai sair'][Math.floor(Math.random() * 5)], { tom: 0.05, ritmo: 0.65, vol: 0.5 + perto * 0.5 });
        break;
      default:
        // unhas arranhando a parede
        this.ruido(g, { dur: 0.9, vol: 0.5, filtro: 'bandpass', f: 1800 * k, q: 5, mod: 25, ataque: 0.05 });
    }
  }

  // o começo da caçada: quatro jeitos (a porta da rua batendo vem à parte)
  inicioCacada() {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(null, 1, false);
    switch (this.sorteio('cacada', 4)) {
      case 0:
        this.osc(g, { tipo: 'sawtooth', f: 45, ate: 30, dur: 2.5, vol: 0.5, ataque: 0.05 });
        this.ruido(g, { dur: 2.2, vol: 0.5, f: 200, ate: 60 });
        this.ruido(g, { dur: 0.6, vol: 0.4, filtro: 'highpass', f: 3000 });
        break;
      case 1:
        // um grave subindo até o estouro
        this.osc(this.distorcao(g, 40), { tipo: 'sawtooth', f: 40, ate: 160, dur: 1.6, vol: 0.3, ataque: 1.4 });
        this.osc(g, { f: 55, ate: 28, dur: 1.5, vol: 0.8, atraso: 1.5 });
        this.ruido(g, { dur: 0.8, vol: 0.6, f: 2000, ate: 80, atraso: 1.5 });
        break;
      case 2:
        // um grito lá longe, ecoando pela casa
        this.grito(this.destino(null, 0.5, true), 2.0, 0.7, { tom: 0.7 });
        this.osc(g, { f: 45, ate: 30, dur: 2.5, vol: 0.6 });
        break;
      default:
        this.falar(['Hora de brincar', 'Agora é minha vez', 'Corra', 'Eu estou chegando'][Math.floor(Math.random() * 4)], { tom: 0.05, ritmo: 0.7 });
        this.osc(g, { tipo: 'sawtooth', f: 45, ate: 30, dur: 2.5, vol: 0.45, ataque: 0.05 });
        this.ruido(g, { dur: 2.2, vol: 0.4, f: 200, ate: 60 });
    }
  }

  // outra pessoa morreu (de onde ela estava)
  morteDeOutro(pos, vol = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const g = this.destino(pos, vol);
    this.grito(g, 1.0 + Math.random() * 0.6, 0.9, { tom: 0.75 + Math.random() * 0.6 });
    if (Math.random() < 0.5) this.ruido(g, { dur: 0.5, vol: 0.6, f: 300, ate: 60 });
    else this.osc(g, { f: 70, ate: 30, dur: 1, vol: 0.7, atraso: 0.2 });
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
