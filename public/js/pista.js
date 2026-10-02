// Pista de corrida: um circuito fechado em volta da sala, com largada/chegada,
// setores para não deixar cortar caminho, e cronometragem de volta.
import * as THREE from 'three';

export const PISTA = {
  cx: 0,
  cz: 0,
  rx: 45, // meia-largura do circuito (eixo X)
  rz: 33, // meia-altura do circuito (eixo Z)
  raio: 15, // raio das curvas
  largura: 9, // largura da pista
  y: 0.14, // altura do asfalto
  setores: 8, // quantos trechos a volta tem (impede cortar caminho)
  cores: {
    asfalto: 0x1b1f2b,
    borda: 0xf1f5f9,
    bordaAlt: 0xef4444,
    mureta: 0x2b3245,
    largada: 0xf8fafc,
  },
};

// Linha central do circuito: retas + curvas arredondadas, em sentido horário
// visto de cima, começando na reta de baixo (z negativo).
function construirCaminho(amostrasPorCurva = 18) {
  const { rx, rz, raio: r } = PISTA;
  const pts = [];
  const add = (x, z) => pts.push(new THREE.Vector2(x, z));

  const ax = rx - r; // até onde vai a reta no eixo X
  const az = rz - r;

  add(-ax, -rz);
  add(ax, -rz); // reta de baixo
  for (let i = 1; i <= amostrasPorCurva; i++) { // curva inferior direita
    const a = (-Math.PI / 2) + (i / amostrasPorCurva) * (Math.PI / 2);
    add(ax + Math.cos(a) * r, -az + Math.sin(a) * r);
  }
  add(rx, az); // reta da direita
  for (let i = 1; i <= amostrasPorCurva; i++) { // curva superior direita
    const a = 0 + (i / amostrasPorCurva) * (Math.PI / 2);
    add(ax + Math.cos(a) * r, az + Math.sin(a) * r);
  }
  add(-ax, rz); // reta de cima
  for (let i = 1; i <= amostrasPorCurva; i++) { // curva superior esquerda
    const a = (Math.PI / 2) + (i / amostrasPorCurva) * (Math.PI / 2);
    add(-ax + Math.cos(a) * r, az + Math.sin(a) * r);
  }
  add(-rx, -az); // reta da esquerda
  for (let i = 1; i <= amostrasPorCurva; i++) { // curva inferior esquerda
    const a = Math.PI + (i / amostrasPorCurva) * (Math.PI / 2);
    add(-ax + Math.cos(a) * r, -az + Math.sin(a) * r);
  }
  return pts;
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
export function projetar(x, z) {
  _p.set(x - PISTA.cx, z - PISTA.cz);
  let melhorDist = Infinity;
  let melhorT = 0;
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
    if (d < melhorDist) {
      melhorDist = d;
      melhorT = (ACUM[i] + u * (ACUM[i + 1] - ACUM[i])) / COMPRIMENTO;
    }
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
    const { t, dist } = projetar(x, z);
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
