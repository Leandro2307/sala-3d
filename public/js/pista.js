// Pista de corrida: um circuito fechado em volta da sala, com largada/chegada,
// setores para não deixar cortar caminho, e cronometragem de volta.
import * as THREE from 'three';
import { NOVO } from './mundo.js';

const PISTA_CLASSICA = {
  // O autódromo fica numa ala própria, a nordeste do cinema.
  // Encostada na ala do cinema: o circuito é girado para a reta principal correr
  // ao lado da plateia, com o telão à vista de quem está nela.
  // Autódromo de verdade, em escala de verdade: ~2 km de volta e faixas bem
  // separadas. Fica numa ala própria, longe o bastante do cinema para nada se
  // sobrepor — a ligação com o telão é feita pelo telão da pista, não pela
  // proximidade.
  cx: 321,
  cz: 252,
  escala: 1.05, // coordenadas do desenho -> metros
  giro: -0.95,
  largura: 16,
  y: 0.14,
  setores: 12,
  // Linha de largada/chegada, em fração do traçado (0 = primeiro ponto do desenho): na reta
  // em frente à arquibancada, logo depois do telão. A volta é medida a partir daqui.
  largadaT: 0.03,
};

// No mundo novo (mundo.js, cidade-dados.js) o autódromo é menor, a leste da praça: ~1 km de volta,
// com a reta da largada correndo para leste na frente da arquibancada, onde chega a avenida. O
// desenho já é em metros do mundo (escala 1, sem giro, centro em 230/230 = coordenada do desenho).
const PISTA_PRACA = {
  cx: 230,
  cz: 230,
  escala: 1,
  giro: 0,
  largura: 16,
  y: 0.14,
  setores: 12,
  largadaT: 0.03,
};

export const PISTA = NOVO ? PISTA_PRACA : PISTA_CLASSICA;

// fração do traçado (0..1) -> fração da volta contada a partir da linha de largada, e de volta
const naVolta = (t) => (((t - PISTA.largadaT) % 1) + 1) % 1;
const noTracado = (v) => (v + PISTA.largadaT) % 1;

// Traçado do Autódromo Internacional Ayrton Senna (Goiânia).
// Os pontos são densos de propósito: com poucos pontos a suavização "inventa"
// a curva e o traçado chega a passar por cima de si mesmo nos grampos.
const DESENHO_GOIANIA = [
  // A largada fica no trecho mais perto do cinema: dá para ver o telão da reta.
  [237.4, 17.9], [265.4, 31.2], [283.1, 55.6], [303.4, 78.6],
  [333.9, 83.3], [360.3, 67.4], [389.2, 58.6], [417.6, 72.1],
  [430.8, 98.7], [432.0, 130.0], [424.0, 164.0], [406.0, 198.0],
  [382.1, 223.6], [356.6, 239.5], [327.4, 245.5], [291.9, 264.6],
  [259.2, 293.5], [219.5, 323.7], [191.7, 354.2], [179.9, 388.1],
  [158.1, 409.9], [126.1, 410.1], [89.0, 392.9], [48.3, 354.3],
  [28.0, 318.8], [18.0, 290.2], [33.5, 262.2], [64.5, 264.2],
  [77.8, 292.1], [79.7, 321.8], [97.5, 350.0], [130.0, 345.1],
  [138.2, 314.1], [131.3, 286.4], [114.6, 256.7], [131.9, 230.0],
  [163.1, 234.0], [182.1, 258.0], [205.8, 282.9], [240.0, 257.7],
  [270.4, 226.7], [304.7, 201.4], [333.4, 180.9], [358.2, 155.3],
  [345.1, 125.0], [313.7, 124.0], [293.2, 148.1], [262.4, 166.3],
  [228.0, 172.9], [198.5, 179.5], [171.2, 190.7], [141.5, 186.6],
  [125.7, 160.7], [135.7, 132.2], [159.9, 114.2], [189.7, 110.7],
  [218.3, 117.7], [245.5, 132.4], [272.9, 111.0], [246.3, 79.3],
  [217.0, 76.4], [187.8, 70.3], [172.2, 40.5], [204.5, 17.7],
];

// Mundo novo: reta da largada para leste, curva longa para o norte, retão na beira da cerca, a volta
// do lago lá em cima, o gancho, os esses no meio e a descida até a arquibancada.
const DESENHO_PRACA = [
  [300, 45], [335, 45], [370, 45], [405, 46], [432, 56], [448, 78], [453, 108], [452, 145],
  [450, 185], [445, 222], [448, 258], [452, 295], [449, 332], [438, 363], [416, 386], [386, 398],
  [350, 400], [315, 396], [288, 384], [272, 362], [274, 336], [294, 318], [320, 312], [340, 296],
  [346, 272], [338, 250], [316, 238], [290, 230], [270, 214], [259, 188], [259, 158], [256, 130],
  [254, 102], [259, 76], [271, 58], [284, 49],
];
const DESENHO = NOVO ? DESENHO_PRACA : DESENHO_GOIANIA;

// nomes das curvas do mundo novo: a fração da volta sai do ponto (ver CURVAS, lá embaixo)
const CURVAS_PRACA = [
  { nome: 'Curva da Praça', x: 442, z: 64 },
  { nome: 'Curva do Lago', x: 430, z: 374 },
  { nome: 'Gancho', x: 276, z: 352 },
  { nome: 'Esses', x: 330, z: 305 },
  { nome: 'Curva do Bosque', x: 343, z: 258 },
  { nome: 'Curva do S', x: 266, z: 206 },
  { nome: 'Curva da Arquibancada', x: 263, z: 68 },
];

const CURVAS_GOIANIA = [
  { nome: 'Esses', t: 0.048 }, // logo depois da largada (antes ficava em cima da linha nova)
  { nome: 'Parabólica Ayrton Senna', t: 6 / 64 },
  { nome: 'Curva 1', t: 20 / 64 },
  { nome: 'Curva 2', t: 25 / 64 },
  { nome: 'Curva VIP', t: 30 / 64 },
  { nome: 'Curva 3', t: 35 / 64 },
  { nome: 'Parabólica Interior', t: 43 / 64 },
  { nome: 'Orelha', t: 50 / 64 },
  { nome: 'Gancho', t: 57 / 64 },
  { nome: 'Curva 10', t: 61 / 64 },
];

// Suaviza os pontos do desenho numa curva fechada e amostra a linha central.
function construirCaminho(amostras = 700) {
  const cos = Math.cos(PISTA.giro || 0);
  const sen = Math.sin(PISTA.giro || 0);
  const ctrl = DESENHO.map(([ix, iy]) => {
    const x = (ix - 230) * PISTA.escala;
    const z = (iy - 230) * PISTA.escala;
    return new THREE.Vector3(x * cos - z * sen, 0, x * sen + z * cos);
  });
  const curva = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
  return curva.getPoints(amostras).slice(0, amostras).map((p) => new THREE.Vector2(p.x, p.z));
}

export const CAMINHO = construirCaminho();

// Confere se o traçado passa por cima de si mesmo. É a checagem que faltava:
// sem ela dá para publicar uma pista com as zebras se cruzando em X.
export function validarTracado(folgaExtra = 2) {
  const n = CAMINHO.length;
  const preciso = PISTA.largura + folgaExtra;
  let pior = { d: Infinity, i: 0, j: 0 };
  let cruzamentos = 0;
  const vizinhos = Math.ceil(n * 0.02);
  const cruza = (p1, p2, p3, p4) => {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return u > 0 && u < 1 && v > 0 && v < 1;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + vizinhos; j < n - (i < vizinhos ? vizinhos : 0); j++) {
      const d = CAMINHO[i].distanceTo(CAMINHO[j]);
      if (d < pior.d) pior = { d, i, j };
      if (cruza(CAMINHO[i], CAMINHO[(i + 1) % n], CAMINHO[j], CAMINHO[(j + 1) % n])) cruzamentos++;
    }
  }
  return {
    comprimento: COMPRIMENTO,
    cruzamentos,
    aproximacao: pior.d,
    folga: pior.d - PISTA.largura,
    ok: cruzamentos === 0 && pior.d >= preciso,
    onde: { t1: (pior.i / n).toFixed(3), t2: (pior.j / n).toFixed(3) },
  };
}

// Tabela de comprimento acumulado: permite perguntar "que fração da volta é este
// ponto?", que é o que decide se a volta foi completa ou se cortaram caminho.
const ACUM = (() => {
  const acum = [0];
  for (let i = 1; i <= CAMINHO.length; i++) {
    const a = CAMINHO[i - 1];
    const b = CAMINHO[i % CAMINHO.length];
    acum.push(acum[i - 1] + a.distanceTo(b));
  }
  return acum;
})();

export const COMPRIMENTO = ACUM[ACUM.length - 1];

// Caixa da linha central, com meia largura e folga: quem está fora dela não está na pista, e a
// pé não precisa projetar (são 700 segmentos por quadro, à toa no cinema e no escritório).
const CAIXA = (() => {
  const folga = PISTA.largura / 2 + 2;
  const xs = CAMINHO.map((p) => PISTA.cx + p.x);
  const zs = CAMINHO.map((p) => PISTA.cz + p.y);
  return { x0: Math.min(...xs) - folga, x1: Math.max(...xs) + folga, z0: Math.min(...zs) - folga, z1: Math.max(...zs) + folga };
})();

const _p = new THREE.Vector2();
const _ab = new THREE.Vector2();
const _ap = new THREE.Vector2();

// Projeta uma posição no caminho: devolve a fração da volta (0..1) e a distância
// até a linha central (para saber se está dentro da pista).
// Distância entre duas frações de volta, considerando que a volta é circular.
function distT(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

export function projetar(x, z, tAnterior = null) {
  _p.set(x - PISTA.cx, z - PISTA.cz);
  let melhorDist = Infinity;
  let melhorT = 0;
  let pertoDist = Infinity; // melhor candidato perto de onde o carro estava
  let pertoT = 0;
  for (let i = 0; i < CAMINHO.length; i++) {
    const a = CAMINHO[i];
    const b = CAMINHO[(i + 1) % CAMINHO.length];
    _ab.subVectors(b, a);
    _ap.subVectors(_p, a);
    const len2 = _ab.lengthSq();
    const u = len2 > 0 ? Math.max(0, Math.min(1, _ap.dot(_ab) / len2)) : 0;
    const px = a.x + _ab.x * u;
    const pz = a.y + _ab.y * u;
    const d = Math.hypot(_p.x - px, _p.y - pz);
    const t = (ACUM[i] + u * (ACUM[i + 1] - ACUM[i])) / COMPRIMENTO;
    if (d < melhorDist) {
      melhorDist = d;
      melhorT = t;
    }
    if (tAnterior !== null && distT(t, tAnterior) < 0.04 && d < pertoDist) {
      pertoDist = d;
      pertoT = t;
    }
  }
  // Onde a pista passa rente a ela mesma (o grampo da 10, o complexo da VIP), a
  // distância sozinha pode "pular" o carro para a outra faixa e bagunçar os
  // setores. Se existe um ponto quase tão bom perto de onde ele estava, vale esse.
  if (pertoDist < melhorDist + 3) {
    return { t: pertoT, dist: pertoDist };
  }
  return { t: melhorT, dist: melhorDist };
}

export function pontoEm(t) {
  const alvo = ((t % 1) + 1) % 1 * COMPRIMENTO;
  let i = 0;
  while (i < ACUM.length - 2 && ACUM[i + 1] < alvo) i++;
  const a = CAMINHO[i];
  const b = CAMINHO[(i + 1) % CAMINHO.length];
  const seg = ACUM[i + 1] - ACUM[i];
  const u = seg > 0 ? (alvo - ACUM[i]) / seg : 0;
  return {
    x: PISTA.cx + a.x + (b.x - a.x) * u,
    z: PISTA.cz + a.y + (b.y - a.y) * u,
    angulo: Math.atan2(b.x - a.x, b.y - a.y),
  };
}

// Curvas com nome (placa e pneus em world.js): no mundo clássico em fração do traçado, no novo
// a partir de um ponto perto de cada uma
export const CURVAS = NOVO ? CURVAS_PRACA.map(({ nome, x, z }) => ({ nome, t: projetar(x, z).t })) : CURVAS_GOIANIA;

// Onde o carro nasce: no grid, uns 9 m ANTES da linha, olhando para a frente. Antes nascia
// logo depois dela, e o tempo só começava a contar depois de uma volta inteira.
export function largada(faixa = 0) {
  const p = pontoEm(PISTA.largadaT - 0.004);
  const lateral = p.angulo;
  const desl = (faixa - 1) * 3;
  return {
    pos: [p.x + Math.cos(lateral) * desl, PISTA.y, p.z - Math.sin(lateral) * desl],
    yaw: p.angulo + Math.PI,
  };
}

export function formatarVolta(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

// Voltar para a pista mais à frente do que isto (fração da volta, ~46 m) é cortar caminho.
const CORTE_MAX = 0.02;

// Controla uma corrida: conta setores na ordem e fecha a volta na largada.
export class Corrida {
  constructor(cb = {}) {
    this.cb = cb;
    this.reset();
  }

  reset() {
    this.ativa = false;
    this.tempo = 0;
    this.setor = 0;
    this.voltas = 0;
    this.melhor = null;
    this.ultimoT = 0; // último ponto da volta (0..1) em que o carro esteve NA pista
    this.naPista = false;
    this.saidaT = null; // onde saiu da pista, enquanto estiver fora
    this.invalida = false; // cortou caminho nesta volta: o tempo corre, mas não vale
  }

  // chamado a cada frame com a posição do jogador
  update(dt, x, z, emVeiculo) {
    // a pé e longe do traçado: o mesmo que fora da pista, sem projetar
    if (!emVeiculo && (x < CAIXA.x0 || x > CAIXA.x1 || z < CAIXA.z0 || z > CAIXA.z1)) {
      if (this.naPista) {
        this.naPista = false;
        this.cb.onPista?.(false);
      }
      if (this.ativa) {
        this.ativa = false;
        this.cb.onCancelar?.();
      }
      this.saidaT = null;
      return;
    }
    // daqui para baixo, t é a fração da VOLTA (0 na linha de largada), não do traçado
    const proj = projetar(x, z, this.naPista ? noTracado(this.ultimoT) : null);
    const t = naVolta(proj.t);
    const { dist } = proj;
    const dentro = dist <= PISTA.largura / 2 + 1.5;
    if (dentro !== this.naPista) {
      this.naPista = dentro;
      this.cb.onPista?.(dentro);
    }

    // a pé não tem corrida
    if (!emVeiculo) {
      if (this.ativa) {
        this.ativa = false;
        this.cb.onCancelar?.();
      }
      this.saidaT = null;
      if (dentro) this.ultimoT = t;
      return;
    }

    // Sair da pista NÃO para o relógio, como numa corrida de verdade. Enquanto está fora,
    // só se lembra de onde saiu; a conferência é feita quando o carro volta.
    if (this.ativa) this.tempo += dt;
    if (!dentro) {
      if (this.saidaT === null) this.saidaT = this.ultimoT;
      return;
    }

    let cortou = false;
    if (this.saidaT !== null) {
      // quanto andou para a frente enquanto estava fora
      const avanco = (((t - this.saidaT) % 1) + 1) % 1;
      cortou = avanco > CORTE_MAX && avanco < 0.5;
      // a passagem pela linha é medida a partir de onde saiu: cruzar a linha por fora conta
      this.ultimoT = this.saidaT;
      this.saidaT = null;
      if (cortou && !this.ativa) this.ultimoT = t; // volta nenhuma começa num atalho
      if (cortou && this.ativa && !this.invalida) {
        this.invalida = true;
        this.cb.onInvalida?.();
      }
    }

    if (!this.ativa) {
      // só começa a contar quando cruza a largada para a frente
      if (this.ultimoT > 0.9 && t < 0.1) {
        this.ativa = true;
        this.tempo = 0;
        this.setor = 0;
        this.invalida = false;
        this.cb.onLargada?.();
      }
      this.ultimoT = t;
      return;
    }

    const alvoSetor = (this.setor + 1) / PISTA.setores;
    if (this.setor < PISTA.setores - 1 && t >= alvoSetor && t < alvoSetor + 0.5) {
      this.setor++;
      this.cb.onSetor?.(this.setor, PISTA.setores);
    }

    // fechou a volta: tem que ter passado por todos os setores e não ter cortado caminho
    if (this.ultimoT > 0.9 && t < 0.1) {
      if (this.setor >= PISTA.setores - 1 && !this.invalida) {
        const tempo = this.tempo;
        this.voltas++;
        const recorde = this.melhor === null || tempo < this.melhor;
        if (recorde) this.melhor = tempo;
        this.cb.onVolta?.(tempo, this.voltas, recorde);
      } else {
        this.cb.onCortou?.();
      }
      this.tempo = 0;
      this.setor = 0;
      // se a linha foi cruzada no meio do atalho, a volta nova também já nasce sem valer
      this.invalida = cortou;
      if (cortou) this.cb.onInvalida?.();
    }
    this.ultimoT = t;
  }
}
