// O modo de imagem automático e a volta sozinha do turbo (main.js e jogar.js). Só a decisão: quem troca o
// modo e liga o turbo é a página, pelas funções que ela passa. Testado em testes/turbo-auto.test.mjs.
//
// Automático (2026-11-25): a banda ainda está subindo quando o jogo começa, então espera ela assentar
// (ESPERA_MIN_MS a ESPERA_MAX_MS) e mede o modo padrão por MEDIR amostras (20 s). Bom: fica nele. Ruim: mede o
// próximo da lista (a página passa a ordem: padrão, Turbo rápido, Turbo da TV) e, se nenhum for bom, fica
// no de menor nota. Depois de decidir, continua olhando: ficou ruim por JANELA amostras seguidas, mede tudo
// de novo, no máximo RODADAS vezes e com RODADA_MS entre uma e outra (cada troca mexe na imagem).

const ESPERA_MIN_MS = 10_000;
const ESPERA_MAX_MS = 25_000; // a banda que não assenta até aqui: mede assim mesmo
const ESPERA_TROCA_MS = 5000; // depois de trocar de modo: o recomeço (quadro-chave, decodificador) não conta
const BANDA_PARADA = 0.1; // a banda variou menos que isto em BANDA_AMOSTRAS amostras: assentou
const BANDA_AMOSTRAS = 4;
const MEDIR = 10; // amostras (de 2 s) por modo
const JANELA = 15;
const RODADAS = 4;
const RODADA_MS = 180_000;
const PRESSA_MS = 45_000; // depois do teste da conexão, o modo escolhido que se mostra ruim não espera os 3 min
const MARGEM = 0.15; // só troca para outro se ele for pelo menos 15% melhor que o padrão
// O que não é do modo não entra na conta (2026-11-25, 16:52: os três modos foram julgados com o caminho cortando
// e o PS5 perdendo pacotes até o PC, e um soluço só decidiu a escolha):
const FORA_SILENCIO_MS = 500; // o caminho parou de entregar tudo
const FORA_FONTE = 0.06; // a fonte (PS5 ou captura) fora do ritmo dela mais que isto
const PIORES = 2; // das 10 amostras, as 2 com mais travadas e trancos não contam
const RECOMECOS = 2; // o caminho ou a forma de envio trocou no meio da medida: recomeça, até tantas vezes por modo
const FORA_MAX = 20; // amostras de fora seguidas (40 s): mede com o que tiver
const SEM_ATRASO = 250; // amostra sem atraso medido (o vídeo normal entrou, por exemplo)

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const mediana = (v) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

const quantos = (v) => (Array.isArray(v) ? v.length : Number(v) || 0);

// Uma amostra do relatório (jogo-diag.js, amostraRecebe) no que interessa aqui
export function resumirAmostra(r) {
  return {
    turbo: !!r.turbo,
    qps: r.fpsFinal ?? null,
    captura: r.la?.captura ?? null,
    atrasoMs: r.atrasoMs ?? null,
    rttMs: r.turbo?.rttMs ?? r.rttMs ?? null,
    // ritmo.js: as travadas vêm numa lista (uma por travada, com a causa); os trancos, num número
    travadas: quantos(r.ritmo?.travadas),
    trancos: quantos(r.ritmo?.trancos),
    bandaKbps: r.la?.turbo?.bandaKbps ?? null,
    par: r.conexao?.par ?? null,
    repasse: r.la?.turbo ? r.la.turbo.bandaKbps == null : null,
    fora: foraDoModo(r),
  };
}

// a amostra fala de outra coisa que não o modo? (o motivo, ou null)
export function foraDoModo(r) {
  if (r.turbo?.silencioMaxMs >= FORA_SILENCIO_MS) return 'caminho';
  if (r.somWebrtc?.inventadoPct >= 10) return 'caminho'; // o som do WebRTC também faltou: foi o caminho
  const manda = r.la?.ps5?.manda;
  if (manda > 0) {
    const ritmo = manda > 45 ? 60 : 30;
    if (Math.abs(manda - ritmo) / ritmo > FORA_FONTE) return 'fonte';
  }
  return null;
}

// sem as piores (por travadas e trancos): um soluço isolado não decide
function semAsPiores(am) {
  if (am.length < MEDIR) return am;
  const peso = (a) => a.travadas * 10 + a.trancos + Math.max(0, 60 - (a.qps ?? 0)) + (a.turbo ? 0 : 100);
  const fora = new Set(am.map((_, i) => i).sort((a, b) => peso(am[b]) - peso(am[a])).slice(0, PIORES));
  return am.filter((a, i) => !fora.has(i) || !a.turbo); // sem turbo é sempre para contar
}

// O que se viu num modo: a nota (menor é melhor, na unidade de ms de atraso) e se está bom
export function avaliar(todas, segPorAmostra = 2) {
  if (!todas.length) return null;
  const am = semAsPiores(todas);
  const min = (am.length * segPorAmostra) / 60;
  const atraso = mediana(am.map((a) => a.atrasoMs ?? SEM_ATRASO));
  const qps = media(am.map((a) => a.qps ?? 0));
  // a fonte pode não dar 60 (captura de jogo pesado): o alvo é o que ela dá
  const fonte = mediana(am.map((a) => a.captura).filter((v) => v > 0)) ?? 60;
  const alvoQps = Math.min(57, fonte - 3);
  const travMin = am.reduce((n, a) => n + a.travadas, 0) / min;
  const trancosMin = am.reduce((n, a) => n + a.trancos, 0) / min;
  const semTurbo = am.filter((a) => !a.turbo).length / am.length;
  const rtt = mediana(am.map((a) => a.rttMs).filter((v) => v != null)) ?? 0;
  const nota = atraso + 6 * travMin + 0.15 * trancosMin + 4 * Math.max(0, alvoQps - qps) + 300 * semTurbo;
  // 33 ms são fixos na conta (jogo, captura e tela) e a distância não muda de um modo para o outro
  const bom = semTurbo === 0 && qps >= alvoQps - 2 && travMin <= 3 && trancosMin <= 120 && atraso - 33 - rtt <= 60;
  const r1 = (x) => Math.round(x * 10) / 10;
  return { nota: r1(nota), bom, atraso: Math.round(atraso), qps: r1(qps), travMin: r1(travMin), trancosMin: r1(trancosMin), semTurbo: r1(semTurbo * 100) };
}

export class TurboAuto {
  // modos: os ids na ordem de tentar; aplicar(id, motivo): troca o modo; onEvento(texto, dados);
  // onEstado(estado, id): para a página mostrar ('medindo' ou 'fixo')
  constructor({ modos, aplicar, onEvento = null, onEstado = null, agora = () => performance.now() }) {
    Object.assign(this, { modos, aplicar, onEvento, onEstado, agora });
    this.ligado = true; // o usuário pode escolher um modo à mão (desligar)
    this.fase = null; // null, 'espera', 'mede' ou 'fixo'
    this.escolhido = null; // o da última vez que decidiu: o próximo jogo começa nele
  }

  get ativo() { return this.ligado && this.fase != null; }

  // o modo em que o jogo deve começar
  get inicial() { return this.escolhido ?? this.modos[0]; }

  comecar() {
    this.parar();
    if (!this.ligado) return;
    this.rodadas = 0;
    this.decidiuEm = null;
    this.rodada(this.inicial, ESPERA_MIN_MS, ESPERA_MAX_MS);
  }

  // o teste da conexão (turbo-teste.js) já escolheu: começa decidido e só mede de novo se piorar
  comecarCom(modo) {
    this.parar();
    if (!this.ligado) return;
    this.rodadas = 1;
    this.fase = 'fixo';
    this.escolhido = modo;
    this.decidiuEm = this.agora();
    this.espera = PRESSA_MS;
    this.onEstado?.('fixo', modo);
  }

  parar() {
    this.fase = null;
    this.am = [];
    this.ultima = null;
    this.foras = 0;
  }

  desligar() {
    this.ligado = false;
    this.parar();
  }

  ligar(jogando) {
    this.ligado = true;
    this.escolhido = null;
    if (jogando) this.comecar();
  }

  rodada(primeiro, min, max) {
    this.rodadas++;
    this.espera = RODADA_MS;
    this.ordem = [primeiro, ...this.modos.filter((m) => m !== primeiro)];
    this.notas = new Map();
    this.i = 0;
    this.recomecos = 0;
    this.esperar(min, max);
  }

  esperar(min, max) {
    this.fase = 'espera';
    this.desde = this.agora();
    this.min = min;
    this.max = max;
    this.am = [];
    this.foras = 0;
    this.bandas = [];
    this.onEstado?.('medindo', this.atual);
  }

  get atual() { return this.fase === 'fixo' ? this.escolhido : this.ordem?.[this.i] ?? null; }

  // uma amostra a cada 2 s; oculta: a página em segundo plano (os números não dizem nada)
  amostra(r, oculta = false) {
    if (!this.ativo || !r) return;
    if (oculta) {
      this.am = [];
      if (this.fase === 'mede') this.esperar(ESPERA_TROCA_MS, ESPERA_TROCA_MS);
      return;
    }
    const a = resumirAmostra(r);
    // o caminho trocou, ou o PS5 passou de repassado a codificado lá (ou o contrário): o que se mediu até aqui
    // era outra coisa
    const u = this.ultima;
    this.ultima = a;
    const trocou = u && ((u.par && a.par && u.par !== a.par) || (u.repasse != null && a.repasse != null && u.repasse !== a.repasse));
    if (trocou && this.fase === 'mede' && this.recomecos < RECOMECOS) {
      this.recomecos++;
      this.onEvento?.('turbo automático: a conexão mudou no meio da medida, recomeçando', { modo: this.atual, caminho: u.par !== a.par, repasse: a.repasse });
      return this.esperar(ESPERA_TROCA_MS, ESPERA_TROCA_MS);
    }
    if (trocou && this.fase === 'espera') this.desde = this.agora() - Math.min(this.agora() - this.desde, Math.max(0, this.min - ESPERA_TROCA_MS));
    if (trocou && this.fase === 'fixo') this.am = [];
    if (this.fase === 'espera') return this.noEsperar(a);
    if (a.fora && ++this.foras < FORA_MAX) return;
    if (!a.fora) this.foras = 0;
    this.am.push(a);
    if (this.fase === 'mede') {
      if (this.am.length >= MEDIR) this.mediu();
    } else this.vigiar();
  }

  noEsperar(a) {
    const passou = this.agora() - this.desde;
    if (a.bandaKbps != null) {
      this.bandas.push(a.bandaKbps);
      if (this.bandas.length > BANDA_AMOSTRAS) this.bandas.shift();
    }
    const b = this.bandas;
    // sem banda para olhar (o PS5 repassado não tem): vale só o tempo
    const assentou = !b.length || (b.length >= BANDA_AMOSTRAS && (Math.max(...b) - Math.min(...b)) / Math.max(...b) <= BANDA_PARADA);
    if (passou < this.min || (!assentou && passou < this.max)) return;
    this.fase = 'mede';
    this.am = [];
  }

  mediu() {
    const id = this.ordem[this.i];
    const av = avaliar(this.am);
    this.notas.set(id, av);
    this.onEvento?.('turbo automático: modo medido', { modo: id, ...av });
    if (av.bom) return this.decidir(id, 'bom');
    if (this.i + 1 < this.ordem.length) {
      this.i++;
      this.recomecos = 0;
      this.aplicar(this.ordem[this.i], 'automático: testando');
      this.esperar(ESPERA_TROCA_MS, ESPERA_TROCA_MS);
      return;
    }
    // nenhum ficou bom: o de menor nota, com vantagem para o primeiro (trocar à toa não ajuda)
    let melhor = this.ordem[0];
    for (const m of this.ordem) if (this.notas.get(m).nota < this.notas.get(melhor).nota * (melhor === this.ordem[0] ? 1 - MARGEM : 1)) melhor = m;
    this.decidir(melhor, 'o melhor dos medidos');
  }

  decidir(id, porque) {
    const era = this.ordem[this.i];
    this.fase = 'fixo';
    this.escolhido = id;
    this.decidiuEm = this.agora();
    this.am = [];
    this.onEvento?.('turbo automático: ficou neste modo', { modo: id, porque, rodada: this.rodadas, notas: Object.fromEntries([...this.notas].map(([k, v]) => [k, v.nota])) });
    if (id !== era) this.aplicar(id, 'automático: o melhor');
    this.onEstado?.('fixo', id);
  }

  // decidido: se ficar ruim por JANELA amostras seguidas, mede de novo começando pelo que está
  vigiar() {
    if (this.am.length > JANELA) this.am.shift();
    if (this.am.length < JANELA || this.rodadas >= RODADAS || this.agora() - this.decidiuEm < (this.espera ?? RODADA_MS)) return;
    const av = avaliar(this.am);
    if (av.bom) return;
    this.onEvento?.('turbo automático: piorou, medindo de novo', { modo: this.escolhido, ...av });
    this.rodada(this.escolhido, 0, 0);
  }
}

// A volta do turbo depois de ele desistir (TurboRecebe.onFalhou): a página continua no vídeo normal e o turbo
// tenta de novo sozinho, com menos banda e codificado no PC (depoisDaFalha, em turbo.js). Antes, uma
// travada de 1,5 s deixava o jogo no vídeo normal até a pessoa trocar o modo à mão (2026-11-25).
const ESPERAS = [6000, 20_000, 60_000, 120_000];
const DUROU_MS = 60_000; // durou isto depois de voltar: as tentativas zeram
const VOLTAM = new Set(['lento', 'sem-imagem', 'conexao', 'codificador']);

export class TurboVolta {
  // ligar(): liga o turbo de novo; pode(): ainda está jogando, quer turbo e ele está desligado
  constructor({ ligar, pode, onEvento = null, agora = () => performance.now(), esperar = (f, ms) => setTimeout(f, ms), cancelar = (t) => clearTimeout(t) }) {
    Object.assign(this, { ligar, pode, onEvento, agora, esperar, cancelar });
    this.n = 0;
    this.t = null;
    this.ligouEm = 0;
  }

  // o turbo foi ligado (pela pessoa, pelo automático ou por aqui)
  ligou() {
    this.cancelar(this.t);
    this.t = null;
    this.ligouEm = this.agora();
  }

  parar() {
    this.cancelar(this.t);
    this.t = null;
    this.n = 0;
  }

  // true: vai tentar de novo
  falhou(motivo) {
    if (!VOLTAM.has(motivo)) return false;
    if (this.agora() - this.ligouEm > DUROU_MS) this.n = 0;
    const ms = ESPERAS[this.n];
    if (ms == null) {
      this.onEvento?.('turbo: não voltou depois de várias tentativas, fica no vídeo normal', { tentativas: this.n });
      return false;
    }
    this.n++;
    this.cancelar(this.t);
    this.t = this.esperar(() => {
      this.t = null;
      if (!this.pode()) return;
      this.onEvento?.('turbo: tentando de novo sozinho', { tentativa: this.n, motivo });
      this.ligar();
    }, ms);
    return true;
  }
}
