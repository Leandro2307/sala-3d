// Pista de corrida: um circuito fechado em volta da sala, com largada/chegada,
// setores para não deixar cortar caminho, e cronometragem de volta.
import * as THREE from 'three';

export const PISTA = {
  // O circuito fica num setor próprio, a leste da sala: assim o traçado pode ter
  // o desenho que tem sem esbarrar no parkour, no ringue nem na plateia.
  cx: 152,
  cz: 30,
  escala: 0.37, // converte as coordenadas do desenho para metros
  largura: 9,
  y: 0.14,
  setores: 10,
  cores: {
    asfalto: 0x1b1f2b,
    borda: 0xf1f5f9,
    bordaAlt: 0xef4444,
    largada: 0xf8fafc,
  },
};

// Traçado do Autódromo Internacional Ayrton Senna (Goiânia), ponto a ponto a
// partir do desenho do circuito. As coordenadas são as do desenho; o centro
// (230, 230) vira o centro do setor da pista.
const DESENHO = [
  [290, 262], // largada/chegada
  [260, 300], [220, 352],
  [175, 400], // Curva 1
  [100, 382],
  [25, 295], // Curva 2
  [52, 300], [88, 330], // Curva VIP
  [112, 300], [138, 233], // Curva 3
  [162, 240], [182, 265],
  [250, 230], [310, 190],
  [342, 148], // Parabólica Interior
  [300, 150], [240, 166], [190, 186],
  [160, 198], // Orelha
  [150, 160], [170, 128],
  [214, 114], [250, 115], // Gancho
  [236, 84], [192, 62],
  [248, 46], [284, 62], // Esses
  [302, 88],
  [350, 70], [408, 75], // Parabólica Ayrton Senna
  [434, 118], [418, 180],
  [372, 222], [326, 248],
];

export const CURVAS = [
  { nome: 'Curva 1', i: 3 },
  { nome: 'Curva 2', i: 5 },
  { nome: 'Curva VIP', i: 7 },
  { nome: 'Curva 3', i: 9 },
  { nome: 'Parabólica Interior', i: 14 },
  { nome: 'Orelha', i: 18 },
  { nome: 'Gancho', i: 22 },
  { nome: 'Esses', i: 26 },
  { nome: 'Parabólica Ayrton Senna', i: 29 },
];

// Suaviza os pontos do desenho numa curva fechada e amostra a linha central.
function construirCaminho(amostras = 420) {
  const ctrl = DESENHO.map(([ix, iy]) => new THREE.Vector3(
    (ix - 230) * PISTA.escala,
    0,
    (iy - 230) * PISTA.escala,
  ));
  const curva = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
  return curva.getPoints(amostras).slice(0, amostras).map((p) => new THREE.Vector2(p.x, p.z));
}

export const CAMINHO = construirCaminho();

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

// Onde o carro nasce: na linha de largada, olhando para a frente da pista.
export function largada(faixa = 0) {
  const p = pontoEm(0.002);
  const lateral = p.angulo + Math.PI / 2;
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
    this.ultimoT = 0;
    this.naPista = false;
  }

  // chamado a cada frame com a posição do jogador
  update(dt, x, z, emVeiculo) {
    const { t, dist } = projetar(x, z, this.naPista ? this.ultimoT : null);
    const dentro = dist <= PISTA.largura / 2 + 1.5;
    if (dentro !== this.naPista) {
      this.naPista = dentro;
      this.cb.onPista?.(dentro);
    }
    if (!dentro || !emVeiculo) {
      if (this.ativa) {
        this.ativa = false;
        this.cb.onCancelar?.();
      }
      this.ultimoT = t;
      return;
    }

    const alvoSetor = (this.setor + 1) / PISTA.setores;
    if (!this.ativa) {
      // só começa a contar quando cruza a largada para a frente
      if (this.ultimoT > 0.9 && t < 0.1) {
        this.ativa = true;
        this.tempo = 0;
        this.setor = 0;
        this.cb.onLargada?.();
      }
      this.ultimoT = t;
      return;
    }

    this.tempo += dt;
    if (this.setor < PISTA.setores - 1 && t >= alvoSetor && t < alvoSetor + 0.5) {
      this.setor++;
      this.cb.onSetor?.(this.setor, PISTA.setores);
    }

    // fechou a volta: tem que ter passado por todos os setores
    if (this.ultimoT > 0.9 && t < 0.1) {
      if (this.setor >= PISTA.setores - 1) {
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
    }
    this.ultimoT = t;
  }
}
