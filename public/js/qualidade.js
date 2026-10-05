// Qualidade gráfica: três níveis fixos e um automático que segura os 60 quadros por segundo.
//
// Medido numa Intel UHD em 1080p, o que mais pesa na placa de vídeo é: as luzes pontuais (metade
// do tempo do quadro), a resolução, a sombra e, do lado de fora, a vegetação. Cada nível mexe
// nisso (ver World.setQualidade).
//
// O automático começa num nível pelo tipo de aparelho. Se o quadro passa do tempo, baixa primeiro
// a resolução aos poucos (quase não se nota) e só depois o nível. Quando fica muito tempo sobrando
// folga, sobe a resolução de volta devagar — e, se subir fizer travar, desiste por um tempo.

import { isTouch } from './touch.js';

export const NIVEIS = {
  alta: { nome: 'Alta', luzes: 8, sombra: 2048, pixelMax: isTouch ? 1.25 : 1.75, densidade: 1, sombraArvores: true, videoFps: 60, antialias: true },
  media: { nome: 'Média', luzes: 5, sombra: 1024, pixelMax: isTouch ? 1 : 1.25, densidade: 0.7, sombraArvores: false, videoFps: 30, antialias: !isTouch },
  baixa: { nome: 'Leve', luzes: 3, sombra: 0, pixelMax: isTouch ? 0.8 : 1, densidade: 0.4, sombraArvores: false, videoFps: 24, antialias: false },
};
const ORDEM = ['baixa', 'media', 'alta'];

const LENTO_MS = 18.5; // média do quadro acima disso (< ~54 fps) = está pesado
const ESCALA_MIN = isTouch ? 0.6 : 0.7;
const JANELA_MS = 1000; // decide a cada segundo de medição

// Nome da placa de vídeo, lido num contexto WebGL descartável: o nível inicial decide o
// antialias, que só dá para escolher antes de criar o renderizador do jogo.
let placa = null;
function nomeDaPlaca() {
  if (placa != null) return placa;
  placa = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (info) placa = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* sem WebGL: o jogo nem roda */ }
  return placa;
}

// Por onde começar quando ninguém escolheu nada: celular e placa integrada começam na média.
export function nivelInicial() {
  if (isTouch) return (navigator.deviceMemory ?? 4) <= 3 ? 'baixa' : 'media';
  const p = nomeDaPlaca();
  if (/SwiftShader|llvmpipe|Basic Render/i.test(p)) return 'baixa'; // sem placa de vídeo de verdade
  if (/Intel|Mali|Adreno|PowerVR|Apple GPU/i.test(p)) return 'media';
  return 'alta';
}

export class Qualidade {
  // modo: 'auto' ou um dos NIVEIS. nivel: onde o automático parou da última vez (ou null).
  constructor(world, { modo = 'auto', nivel = null, aoMudar = () => {} } = {}) {
    this.world = world;
    this.aoMudar = aoMudar;
    // o automático nunca passa do teto; no celular a alta só esquenta e gasta bateria
    this.teto = isTouch ? 'media' : 'alta';
    this.modo = modo;
    this.nivel = NIVEIS[nivel] ? nivel : nivelInicial();
    this.escala = 1;
    this.tetoEscala = 1;
    this.tetoAte = 0;
    this.amostras = [];
    this.inicio = performance.now();
    this.carencia = 0;
    this.bom = 0; // há quanto tempo (ms) está folgado
    this.fps = 0;
    this.aplicar(true);
  }

  get efetivo() { return this.modo === 'auto' ? this.nivel : this.modo; }

  definirModo(modo) {
    this.modo = modo;
    if (modo === 'auto') this.nivel = nivelInicial();
    this.escala = 1;
    this.tetoEscala = 1;
    this.aplicar();
  }

  aplicar(primeira = false) {
    const n = NIVEIS[this.efetivo];
    this.world.setQualidade(n);
    this.world.setEscala(this.escala);
    // trocar de nível recompila shaders: o engasgo logo depois não conta como lentidão
    this.carencia = performance.now() + 2500;
    this.amostras = [];
    this.bom = 0;
    if (!primeira) this.aoMudar(this);
  }

  // Chamado a cada quadro com o tempo desde o anterior. desenhando: false quando o 3D não está
  // sendo desenhado (mesa aberta, tela em foco) — aí a medição não diz nada sobre o 3D.
  quadro(dt, desenhando) {
    const agora = performance.now();
    if (!desenhando || document.hidden || dt > 250) {
      this.amostras = []; // pulou quadros (aba escondida, troca de aba): recomeça
      return;
    }
    this.amostras.push(dt);
    const soma = this.amostras.reduce((a, b) => a + b, 0);
    if (soma < JANELA_MS) return;
    const media = soma / this.amostras.length;
    this.fps = 1000 / media;
    this.amostras = [];
    if (this.modo !== 'auto' || agora < this.carencia || agora - this.inicio < 4000) return;

    if (media > LENTO_MS) {
      this.bom = 0;
      if (this.escala > ESCALA_MIN + 0.001) {
        this.escala = Math.max(ESCALA_MIN, this.escala - 0.1);
        // acabou de subir e travou: não tenta de novo tão cedo
        this.tetoEscala = this.escala;
        this.tetoAte = agora + 60000;
        this.world.setEscala(this.escala);
        this.carencia = agora + 1200;
        this.aoMudar(this);
      } else if (ORDEM.indexOf(this.nivel) > 0) {
        this.nivel = ORDEM[ORDEM.indexOf(this.nivel) - 1];
        this.escala = 0.9;
        this.aplicar();
      }
      return;
    }

    // folgado: a cada 15 s tenta devolver um pouco de resolução; com resolução cheia por 60 s,
    // tenta o nível de cima (sem passar do teto do aparelho)
    this.bom += JANELA_MS;
    if (agora > this.tetoAte) this.tetoEscala = 1;
    if (this.escala < this.tetoEscala && this.bom >= 15000) {
      this.escala = Math.min(this.tetoEscala, this.escala + 0.1);
      this.world.setEscala(this.escala);
      this.bom = 0;
      this.carencia = agora + 1200;
      this.aoMudar(this);
    } else if (this.escala >= 1 && this.bom >= 60000 && ORDEM.indexOf(this.nivel) < ORDEM.indexOf(this.teto)) {
      this.nivel = ORDEM[ORDEM.indexOf(this.nivel) + 1];
      this.escala = 0.8;
      this.aplicar();
    }
  }
}
