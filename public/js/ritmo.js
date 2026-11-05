// Ritmo da imagem: o "liso" medido. A média de quadros por segundo não diz se eles vieram em ritmo
// certo: 55 qps em intervalos iguais e 55 qps aos trancos dão a mesma média. Aqui cada quadro novo
// que aparece na tela é marcado no instante da volta da tela (vsync) em que apareceu, e o relatório
// conta de quantas em quantas voltas eles vieram:
//   emVsyncs[0]: quadros que ficaram 1 volta na tela (o ideal a 60 qps numa tela de 60 Hz)
//   emVsyncs[1]: 2 voltas (um quadro repetido; com a captura a ~55 qps, ~5 por segundo são normais)
//   emVsyncs[2..4]: 3, 4 e 5 ou mais voltas — os trancos que se veem
// travadas: cada buraco de TRAVADA_MS ou mais sem quadro novo, com a causa quando quem marca sabe
// (o turbo sabe: perda, fila lá, rede parada; ver TurboRecebe.causa).
// invisiveis: quadros que chegaram mas foram trocados antes de a tela mostrar (dois na mesma volta).
// Usado pelo vídeo normal (requestVideoFrameCallback, em jogo-diag.js) e pelo turbo (turbo.js).

export const TRAVADA_MS = 80;
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const pct = (v, p) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(o.length * p))];
};

export class Ritmo {
  constructor() {
    this.voltas = []; // duração das últimas voltas da tela (ms)
    this.brutas = []; // as mesmas, sem filtro: com a página sobrecarregada elas passam de 50 ms (lenta)
    this.nVoltas = 0;
    this.desde = performance.now();
    this.ultimaVolta = 0;
    this.ultimo = 0; // quando apareceu o último quadro novo
    this.zerar();
  }

  zerar() {
    this.c = { emVsyncs: [0, 0, 0, 0, 0], intervalos: [], travadas: [], invisiveis: 0, quadros: 0 };
  }

  // a duração de uma volta da tela, medida (60 Hz: 16,7; 120 Hz: 8,3)
  get vsyncMs() {
    return pct(this.voltas, 0.5) || 1000 / 60;
  }

  // uma volta da tela aconteceu em t (requestAnimationFrame): mede a duração da volta
  volta(t) {
    this.nVoltas++;
    if (this.ultimaVolta) {
      const d = t - this.ultimaVolta;
      this.brutas.push(d);
      if (this.brutas.length > 30) this.brutas.shift();
      if (d > 3 && d < 50) {
        this.voltas.push(d);
        if (this.voltas.length > 120) this.voltas.shift();
      }
    }
    this.ultimaVolta = t;
  }

  // A tela está dando menos de ~40 voltas por segundo (iPhone quente ou no Modo de Pouca Energia, página
  // sobrecarregada): o requestAnimationFrame vem a cada 25 ms ou mais. No relatório de 2026-11-05 00:42
  // ele chegou a ~6 por segundo, e o liso, que mostra um quadro por volta, travou em 6 qps.
  get lenta() {
    return this.brutas.length >= 10 && pct(this.brutas, 0.5) > 25;
  }

  // Bem pior que lenta: menos de ~22 voltas por segundo (o Modo de Pouca Energia dá 30, isso não
  // conta). A página está quase parada; o turbo não deve culpar a conexão (TurboRecebe.vigiar).
  get parada() {
    return this.brutas.length >= 5 && pct(this.brutas.slice(-10), 0.5) > 45;
  }

  // Um quadro novo apareceu na tela em t (ms, relógio do performance.now). causa(): chamada só se o
  // buraco antes dele foi uma travada, devolve { causa, ... } para o relatório.
  marcar(t, causa = null) {
    const c = this.c;
    c.quadros++;
    if (this.ultimo && document.visibilityState === 'visible') {
      const d = t - this.ultimo;
      if (d > 0 && d < 5000) {
        const n = Math.max(1, Math.round(d / this.vsyncMs));
        c.emVsyncs[Math.min(5, n) - 1]++;
        c.intervalos.push(d);
        if (c.intervalos.length > 400) c.intervalos.shift();
        if (d >= TRAVADA_MS && c.travadas.length < 20) {
          c.travadas.push({ quando: new Date().toISOString().slice(11, 23), ms: Math.round(d), ...(causa?.(d) || {}) });
        }
      }
    }
    this.ultimo = t;
  }

  // quadros que chegaram e nunca apareceram (trocados na mesma volta da tela)
  invisivel(n = 1) {
    this.c.invisiveis += n;
  }

  // para a amostra do relatório (a cada 2 s): o que veio desde a última leitura
  stats() {
    const c = this.c;
    if (!c.quadros) {
      this.zerar();
      return null;
    }
    const iv = c.intervalos;
    const agora = performance.now();
    const voltasPorSeg = r1((this.nVoltas * 1000) / Math.max(1, agora - this.desde));
    this.nVoltas = 0;
    this.desde = agora;
    const r = {
      vsyncMs: r1(this.vsyncMs),
      // voltas da tela por segundo (requestAnimationFrame): 60 ou 120 normal; ~30 no Modo de Pouca
      // Energia; bem menos com o aparelho quente ou a página sobrecarregada
      voltasPorSeg,
      quadros: c.quadros,
      emVsyncs: c.emVsyncs,
      p50Ms: r1(pct(iv, 0.5)),
      p90Ms: r1(pct(iv, 0.9)),
      p99Ms: r1(pct(iv, 0.99)),
      maiorMs: iv.length ? r1(Math.max(...iv)) : null,
      // trancos: quadros que ficaram 3 voltas ou mais (2 voltas é a captura abaixo da tela)
      trancos: c.emVsyncs[2] + c.emVsyncs[3] + c.emVsyncs[4],
      invisiveis: c.invisiveis,
      travadas: c.travadas,
    };
    this.zerar();
    return r;
  }
}
