// Qualidade gráfica: três níveis fixos e um automático que segura os 60 quadros por segundo.
//
// Medido numa Intel UHD em 1080p, o que mais pesa na placa de vídeo é: as luzes pontuais (metade
// do tempo do quadro), a resolução, a sombra e, do lado de fora, a vegetação. Cada nível mexe
// nisso (ver World.setQualidade).
//
// O automático começa num nível pelo tipo de aparelho. Quando o quadro passa do tempo, primeiro
// vê quem está segurando. Se é o próprio sistema (tela de 30 ou 50 Hz, economia de energia), não
// baixa nada: não adiantaria. Se é o processador, baixa o nível, que tira luz e sombra; menos
// resolução só borraria a imagem. Se é a placa de vídeo, baixa a resolução aos poucos (quase não
// se nota) e só depois o nível, e confere cada baixa: se o quadro não melhorou, ela volta.
// Quando fica muito tempo sobrando folga, sobe a resolução de volta devagar e depois o nível. Um
// nível que trava logo depois de subir fica bloqueado por um tempo que dobra a cada vez, e o
// main guarda essa conta entre as visitas.

import { isTouch } from './touch.js';

// luzes: quantas luzes pontuais ficam acesas; luzesEscritorio é o teto delas no modo escritório,
// onde a 8ª já estaria quase apagada pela troca suave. holofote: o cone do ringue (SpotLight),
// que só a Alta paga. luzSimples: luz direta de Lambert no lugar da GGX, só na Leve.
// sombra: tamanho do mapa de sombra do sol (0 = sem mapa). A Média do celular fica sem: o World
// põe uma sombra redonda sob cada pessoa, um desenho só para a sala inteira.
// bonecos: quantos dos mais perto fazem sombra e até que distância, até onde o nome aparece e se
// braços e mãos entram na sombra (o main.js lê a cada 250 ms).
export const NIVEIS = {
  alta: {
    nome: 'Alta', luzes: 8, luzesEscritorio: 7, sombra: 2048, pixelMax: isTouch ? 2 : 1.75, densidade: 1,
    sombraArvores: true, videoFps: 60, antialias: true, holofote: true, luzSimples: false,
    ambiente: true, pos: 2,
    bonecos: { sombras: 16, raioSombra: 40, nomes: 70, bracos: true },
  },
  media: {
    nome: 'Média', luzes: 5, luzesEscritorio: 4, sombra: isTouch ? 0 : 1024, pixelMax: isTouch ? 1.5 : 1.25, densidade: 0.7,
    sombraArvores: false, videoFps: 30, antialias: !isTouch, holofote: false, luzSimples: false,
    ambiente: !isTouch, pos: isTouch ? 0 : 1,
    bonecos: { sombras: isTouch ? 0 : 6, raioSombra: 28, nomes: 50, bracos: false },
  },
  baixa: {
    nome: 'Leve', luzes: 3, luzesEscritorio: 3, sombra: 0, pixelMax: isTouch ? 1.15 : 1, densidade: 0.4,
    sombraArvores: false, videoFps: 24, antialias: false, holofote: false, luzSimples: true,
    ambiente: false, pos: 0,
    bonecos: { sombras: 0, raioSombra: 0, nomes: 40, bracos: false },
  },
};
const ORDEM = ['baixa', 'media', 'alta'];

// Texturas de canvas ocupam memória duas vezes (o canvas e a cópia na placa, com mipmaps): no
// celular e no PC de até 4 GB, cartazes e etiquetas com menos pixels (no celular, metade; no
// tablet, 0,75). deviceMemory só existe no Chrome/Edge (e diz no máximo 8); sem ele conta como PC
// com memória.
export const POUCA_MEMORIA = isTouch || (navigator.deviceMemory ?? 8) <= 4;
export const ESCALA_TEXTURA = isTouch ? (Math.max(screen.width, screen.height) <= 1000 ? 0.5 : 0.75) : POUCA_MEMORIA ? 0.75 : 1;

// MSAA só é dispensável na Alta do PC numa tela densa de verdade (DPR >= 2), onde o 3D já sai a
// 87% da resolução física. n: um dos NIVEIS.
export function querAntialias(n) {
  const dpr = window.devicePixelRatio || 1;
  return n.antialias && (isTouch || dpr < 2 || n.pixelMax < 1.75);
}

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

// Placa integrada ou de entrada no PC. Apple M: Chrome/Edge no Mac com chip M (o Safari já vem como
// 'Apple GPU'). Radeon '... Graphics' e '780M': as integradas dos Ryzen. GeForce MX, GT e 940MX:
// as de entrada dos notebooks.
const INTEGRADA = /Intel|Mali|Adreno|PowerVR|Apple GPU|Apple M\d|Radeon(\(TM\))? (((RX )?Vega \d+ |R[2-7] )?Graphics|\d{3}M\b)|GeForce (MX ?\d|GT \d|\d{3}MX?\b)/i;

// Por onde começar quando ninguém escolheu nada. No PC, placa de vídeo começa na Alta; integrada
// ou de entrada, na Média (na Leve com até 4 GB ou 2 núcleos). No celular, Média, ou Leve nos de
// entrada. O automático sobe sozinho se sobrar.
export function nivelInicial() {
  const p = nomeDaPlaca();
  if (isTouch) {
    // GPU de entrada no Android (o ANGLE também escreve 'Mali-G52' etc.)
    if (/Mali-(G[0-5]\d|T)|Adreno \(TM\) ([1-5]\d\d|6[01]\d)|PowerVR/i.test(p)) return 'baixa';
    return (navigator.deviceMemory ?? 4) <= 3 ? 'baixa' : 'media';
  }
  if (/SwiftShader|llvmpipe|Basic Render/i.test(p)) return 'baixa'; // sem placa de vídeo de verdade
  // Arc com número (A380, A770, B580) é placa de vídeo; a Arc sem número do Core Ultra é integrada
  if (/Arc\(TM\) (Pro )?[AB]\d/i.test(p)) return 'alta';
  // memória e núcleos só rebaixam placa integrada/de entrada (o Brave sorteia hardwareConcurrency)
  const fraco = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 4) <= 2;
  if (INTEGRADA.test(p)) return fraco ? 'baixa' : 'media';
  return 'alta';
}

// Texturas do mapa: 'detalhadas' (fotos no chão, árvores e arbustos de folhas recortadas, pedras
// com relevo) ou 'simples' (a versão de antes, de cor lisa: bem mais leve para a placa de vídeo).
// O mundo é montado uma vez, ao abrir a página, então a escolha é lida aqui do que os Ajustes
// guardaram (main.js, chave 'texturas') e só muda ao recarregar. Na Automática, detalhadas só onde
// a qualidade começa na Alta: placa de vídeo de verdade no PC, ou a Alta escolhida à mão. Pelo
// aparelho, e não por onde o automático parou da última vez: senão as simples deixavam o jogo leve,
// o automático subia para a Alta, e a próxima visita voltava às pesadas.
export const OPCOES_TEXTURAS = ['auto', 'detalhadas', 'simples'];
export function texturasDetalhadas(ajustes) {
  if (ajustes?.texturas === 'detalhadas') return true;
  if (ajustes?.texturas === 'simples') return false;
  const fixa = NIVEIS[ajustes?.qualidade] ? ajustes.qualidade : null;
  return (fixa || nivelInicial()) === 'alta';
}
export const TEXTURAS_DETALHADAS = texturasDetalhadas((() => {
  try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
})());

const LENTO_MS = 18.5; // média do quadro acima disso (< ~54 fps) = está pesado
const ESCALA_MIN = 0.7;
const JANELA_MS = 1000; // decide a cada segundo de medição
// Processador folgado para subir de nível (só no PC): 70% do quadro de 60 qps, nunca do intervalo
// medido (a 144 Hz seriam 3 ms e o PC forte nunca subiria). Mais apertado que isso, a sala cheia
// do escritório (8 a 12 ms de JavaScript num PC médio) prendia no nível de baixo para sempre
// depois de uma queda qualquer; o vaivém quem segura é o bloqueio do registrarFalha.
const CPU_PARA_SUBIR = 0.7 * 16.7;

// passo de 10% na escala sem acumular erro de ponto flutuante (0,7 + 0,1 + 0,1 + 0,1 dá 0,999...)
const passo = (escala, d) => Math.round((escala + d) * 10) / 10;

export class Qualidade {
  // modo: 'auto' ou um dos NIVEIS. nivel: onde o automático parou da última vez (ou null).
  // falhas: nível -> quantas vezes ele travou logo depois de subir (o main guarda entre as visitas).
  constructor(world, { modo = 'auto', nivel = null, falhas = {}, aoMudar = () => {} } = {}) {
    const agora = performance.now();
    this.world = world;
    this.aoMudar = aoMudar;
    // o automático nunca passa do teto; no celular a alta só esquenta e gasta bateria
    this.teto = isTouch ? 'media' : 'alta';
    this.economia = false; // ver setEconomia
    this.modo = modo;
    this.nivel = this.limitarAoTeto(NIVEIS[nivel] ? nivel : nivelInicial());
    this.escala = 1;
    this.tetoEscala = 1;
    this.tetoAte = 0;
    this.esperaEscala = 60000; // por quanto tempo a resolução não volta a subir depois de travar
    this.escalaFalhou = 0; // a escala em que travou da última vez
    this.escalaSubiuEm = 0;
    this.amostras = [];
    this.somaCpu = 0;
    this.inicio = agora;
    this.carencia = 0;
    this.bom = 0; // há quanto tempo (ms) está folgado
    this.fps = 0;
    // sonda do vsync (ver quadro): alguns quadros sem desenhar dizem se é o sistema que segura
    this.intervaloTela = 0; // > 0: o sistema ou a tela seguram o quadro nesse intervalo (ms)
    this.sonda = 0; // quadros da sonda que ainda faltam
    this.sondaDt = [];
    this.sondaCpu = [];
    this.sondaAte = 0;
    this.proximaSonda = 0;
    this.esperaSonda = 60000;
    this.antesDaEscala = 0; // quadro médio antes da última baixa de resolução, para conferir
    this.escalaInutilAte = 0; // baixar a resolução não ajudou: até aqui o gargalo é outro
    this.subirDepois = 0; // desceu por causa do processador: não tenta subir antes disso
    // Memória de falha (ver registrarFalha). Vem a contagem e não o instante: o relógio
    // (performance.now) zera a cada visita.
    this.falhas = {};
    this.bloqueio = {};
    for (const n of ORDEM) {
      const k = Number(falhas?.[n]);
      if (!(k > 0)) continue;
      this.falhas[n] = k;
      this.bloqueio[n] = agora + Math.min(30 * 60000, 60000 * 2 ** k);
    }
    this.subiuEm = 0;
    this.firmeDesde = agora;
    this.aplicar(true);
  }

  get efetivo() { return this.modo === 'auto' ? this.nivel : this.modo; }

  // Sonda do vsync em andamento: o main não desenha este quadro. O canvas segura a última
  // imagem, como enquanto compila.
  get pulando() { return this.sonda > 0 && performance.now() < this.sondaAte; }

  // O sistema segura o quadro em 40 qps ou menos (tela de 30 Hz, economia de energia): o nível em
  // que o automático está não diz nada sobre o aparelho e não deve ser gravado.
  get presoNoSistema() { return this.intervaloTela >= 25; }

  limitarAoTeto(nivel) { return ORDEM.indexOf(nivel) > ORDEM.indexOf(this.teto) ? this.teto : nivel; }

  definirModo(modo) {
    this.modo = modo;
    if (modo === 'auto') {
      // escolher o Automático nos Ajustes recomeça do zero, sem os níveis que travaram
      this.nivel = this.limitarAoTeto(nivelInicial());
      this.falhas = {};
      this.bloqueio = {};
      this.subiuEm = 0;
    }
    this.escala = 1;
    this.aplicar();
  }

  // Economia de bateria (nos Ajustes, ou sozinha com a bateria no fim): o automático fica preso
  // na Leve e as telas no 3D andam a 15 quadros. O teto de 30 qps é do main, que avisa no
  // quadro() (alvo) para isso não contar como lentidão.
  setEconomia(on) {
    on = !!on;
    if (on === this.economia) return;
    this.economia = on;
    this.teto = on ? 'baixa' : isTouch ? 'media' : 'alta';
    if (this.modo === 'auto') {
      // A Leve da economia não diz nada sobre o aparelho: na volta, o nível de antes dela (senão
      // o main gravava a Leve como o nível deste aparelho, e ainda levava minutos para subir).
      if (on) this.nivelAntesDaEconomia = this.nivel;
      else if (this.nivelAntesDaEconomia) this.nivel = this.nivelAntesDaEconomia;
      this.nivel = this.limitarAoTeto(this.nivel);
    }
    this.aplicar();
  }

  // Para de medir por um tempo: na volta do contexto WebGL, os primeiros quadros sobem tudo para
  // a placa de novo e não dizem nada sobre o aparelho.
  pausar(ms) {
    this.carencia = Math.max(this.carencia, performance.now() + ms);
    this.amostras = [];
    this.somaCpu = 0;
    this.sonda = 0;
  }

  aplicar(primeira = false) {
    const agora = performance.now();
    const n = NIVEIS[this.efetivo];
    this.world.setQualidade(this.economia ? { ...n, videoFps: Math.min(15, n.videoFps) } : n);
    this.world.setEscala(this.escala);
    // trocar de nível recompila shaders: o engasgo logo depois não conta como lentidão
    this.carencia = Math.max(this.carencia, agora + 2500);
    this.amostras = [];
    this.somaCpu = 0;
    this.antesDaEscala = 0;
    // "baixar a resolução não ajudou" era do nível de antes: no novo o gargalo pode ser outro
    this.escalaInutilAte = 0;
    this.sonda = 0;
    this.bom = 0;
    // o recuo da resolução era do nível de antes (e pode ter chegado a 15 min): no novo ela
    // volta a subir com a folga
    this.tetoEscala = 1;
    this.esperaEscala = 60000;
    this.escalaFalhou = 0;
    this.escalaSubiuEm = 0;
    this.firmeDesde = agora;
    if (!primeira) this.aoMudar(this);
  }

  // Chamado a cada quadro, antes de desenhar, com o tempo desde o anterior (ms). medir: false
  // quando a medição não diz nada sobre o 3D (mesa aberta, tela em foco, compilando, teto baixo
  // de propósito). Opções: cpu, os ms de JavaScript do quadro anterior; alvo, o teto proposital
  // de quadros por segundo (30 na economia; 0 = sem teto).
  quadro(dt, medir, opcoes) {
    const { cpu = 0, alvo = 0 } = opcoes ?? {};
    const agora = performance.now();
    if (!medir || document.hidden || dt > 250) {
      // pulou quadros (aba escondida, troca de aba) ou não está desenhando: recomeça
      this.amostras = [];
      this.somaCpu = 0;
      this.sonda = 0;
      return;
    }

    if (this.sonda > 0) {
      this.sondaDt.push(dt);
      this.sondaCpu.push(cpu);
      if (--this.sonda > 0) return;
      // O 1º intervalo ainda paga a fila da placa; os outros dois são sem desenho nenhum. Se
      // mesmo assim o quadro segue lento, firme e o JavaScript não explica, quem segura é o
      // sistema ou a tela, e baixar qualidade não adiantaria.
      const [, a, b] = this.sondaDt;
      const [, ca, cb] = this.sondaCpu;
      const m = Math.min(a, b);
      const sistema = m > LENTO_MS && Math.abs(a - b) < 2 && Math.max(ca, cb) < m * 0.5;
      this.intervaloTela = sistema ? (a + b) / 2 : 0;
      // enquanto for o sistema, a espera até a próxima sonda dobra (até 15 min)
      this.proximaSonda = agora + this.esperaSonda;
      this.esperaSonda = sistema ? Math.min(this.esperaSonda * 2, 15 * 60000) : 60000;
      this.amostras = [];
      this.somaCpu = 0;
      return;
    }

    this.amostras.push(dt);
    this.somaCpu += cpu;
    const soma = this.amostras.reduce((x, y) => x + y, 0);
    if (soma < JANELA_MS) return;
    const media = soma / this.amostras.length;
    const mediaCpu = this.somaCpu / this.amostras.length;
    this.fps = 1000 / media;
    this.amostras = [];
    this.somaCpu = 0;
    // o teto do sistema acabou (voltou para a tomada, saiu da economia de energia)
    if (this.intervaloTela && media < this.intervaloTela * 0.8) this.intervaloTela = 0;
    if (this.modo !== 'auto' || agora < this.carencia || agora - this.inicio < 4000) return;

    // lento: acima do normal, do teto proposital e do intervalo que o sistema impõe. A folga do
    // teto cobre o vsync: 30 qps numa tela de 50 ou 75 Hz saem a 40 ms (2 ou 3 vsyncs), e isso
    // não é lentidão (com +2 ms o automático baixava a resolução a cada minuto, para sempre).
    const lento = Math.max(LENTO_MS, alvo ? (1000 / alvo) * 1.3 : 0, this.intervaloTela * 1.15);

    // Conferência da última baixa de resolução: se o quadro não melhorou, o gargalo não eram os
    // pixels (o processo da placa no Chrome, o layout das páginas nas telas) e ela volta.
    if (this.antesDaEscala) {
      const ajudou = media <= lento || media < this.antesDaEscala * 0.93;
      this.antesDaEscala = 0;
      if (!ajudou) {
        this.escala = Math.min(1, passo(this.escala, 0.1));
        this.tetoEscala = Math.min(1, passo(this.tetoEscala, 0.1));
        this.escalaInutilAte = agora + 60000;
        this.world.setEscala(this.escala);
        this.carencia = agora + 1200;
        this.aoMudar(this);
        // o canvas acabou de ser redimensionado (e apagado): nada de sonda neste quadro, que
        // deixaria o 3D sem desenho por 3 quadros
        return;
      }
    }

    if (media > lento) {
      // Antes de baixar qualquer coisa, a sonda: 3 quadros sem desenhar (a imagem para ~100 ms, no
      // máximo uma vez por minuto). Só quando quem chama passa as opções: é o main que lê pulando
      // e deixa de desenhar. Desenhando, a sonda tomaria placa lenta por teto do sistema.
      if (opcoes && !alvo && agora >= this.proximaSonda) {
        this.sonda = 3;
        this.sondaDt = [];
        this.sondaCpu = [];
        this.sondaAte = agora + 400;
        return;
      }
      this.bom = 0;
      this.registrarFalha(agora);
      const i = ORDEM.indexOf(this.nivel);
      const inutil = agora < this.escalaInutilAte;
      const cpuCheia = mediaCpu > LENTO_MS * 0.8 || mediaCpu > media * 0.7;
      const naCpu = cpuCheia || inutil;
      if (naCpu && !isTouch && i > 0) {
        // preso no processador: desce o nível e a imagem continua nítida. A espera para subir é
        // só quando o processador estava cheio mesmo (não quando a resolução não ajudou)
        this.nivel = ORDEM[i - 1];
        if (cpuCheia) this.subirDepois = agora + 5 * 60000;
        this.aplicar();
      } else if (this.escala > ESCALA_MIN + 0.001 && (isTouch ? !inutil : !naCpu)) {
        // No celular a resolução desce mesmo com o processador cheio (menos pixels, menos calor),
        // mas não depois de a conferência mostrar que não adianta: aí desce o nível.
        // Travou de novo na mesma resolução logo depois de voltar a ela: espera o dobro (1 min,
        // 2, 4... até 15) para tentar outra vez.
        const deNovo = this.escalaSubiuEm && agora - this.escalaSubiuEm < 60000
          && Math.abs(this.escala - this.escalaFalhou) < 0.01;
        this.esperaEscala = deNovo ? Math.min(this.esperaEscala * 2, 15 * 60000) : 60000;
        this.escalaFalhou = this.escala;
        this.escalaSubiuEm = 0;
        this.antesDaEscala = media;
        this.escala = Math.max(ESCALA_MIN, passo(this.escala, -0.1));
        this.tetoEscala = this.escala;
        this.tetoAte = agora + this.esperaEscala;
        this.world.setEscala(this.escala);
        this.carencia = agora + 1200;
        this.aoMudar(this);
      } else if (i > 0) {
        this.nivel = ORDEM[i - 1];
        this.escala = 0.9;
        this.aplicar();
      }
      // no chão e preso no processador: nada a fazer, e a imagem continua nítida
      return;
    }

    // folgado: a cada 15 s tenta devolver um pouco de resolução; com resolução cheia por 60 s,
    // tenta o nível de cima (sem passar do teto do aparelho)
    this.bom += JANELA_MS;
    if (agora > this.tetoAte) this.tetoEscala = 1;
    // firme no mesmo nível por 5 min: as falhas dele ficam para trás (o main grava)
    if (agora - this.firmeDesde > 5 * 60000 && this.falhas[this.nivel] > 0) {
      delete this.falhas[this.nivel];
      delete this.bloqueio[this.nivel];
      this.aoMudar(this);
    }
    const i = ORDEM.indexOf(this.nivel);
    const proximo = ORDEM[i + 1];
    if (this.escala < this.tetoEscala && this.bom >= 15000) {
      this.escala = Math.min(this.tetoEscala, passo(this.escala, 0.1));
      this.escalaSubiuEm = agora;
      this.world.setEscala(this.escala);
      this.bom = 0;
      this.carencia = agora + 1200;
      this.aoMudar(this);
    } else if (this.escala >= 1 && this.bom >= 60000 && i < ORDEM.indexOf(this.teto)
      // com o sistema segurando o quadro não dá para ver se o nível de cima cabe; o processador
      // também precisa de folga; e o nível que travou logo depois de subir espera o bloqueio
      && !this.presoNoSistema && agora > this.subirDepois && (isTouch || mediaCpu < CPU_PARA_SUBIR)
      && agora >= (this.bloqueio[proximo] || 0)) {
      this.nivel = proximo;
      this.escala = 0.8;
      this.subiuEm = agora;
      this.aplicar();
    }
  }

  // Caiu logo depois de subir: esse nível não cabe neste aparelho agora. Fica bloqueado por 2 min,
  // depois 4, 8... até 30, e a contagem vai para o main gravar: a próxima visita já começa com
  // o bloqueio.
  registrarFalha(agora) {
    if (!this.subiuEm || agora - this.subiuEm >= 45000) return;
    const n = (this.falhas[this.nivel] = (this.falhas[this.nivel] || 0) + 1);
    this.bloqueio[this.nivel] = agora + Math.min(30 * 60000, 120000 * 2 ** (n - 1));
    this.subiuEm = 0;
  }
}
