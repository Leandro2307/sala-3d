// Gincana (como no Fall Guys), no céu acima do parque. E no portal (ao sul da Rua dos Esportes) leva
// para a largada; o portão abre quando a contagem acaba. A corrida: ponte com dois varredores
// (pule as barras), plataformas que vão e voltam, o paredão das portas (metade quebra, metade
// segura), a ponte dos pêndulos e a escada até a chegada. Caiu, volta para o último ponto (R também).
// Depois, a final no piso de hexágonos: o que você pisa fica vermelho e cai — o último em pé leva a
// coroa. Quem cai da final assiste da sacada. Esc sai da gincana. O servidor (gincana-servidor.js)
// manda nas fases; os obstáculos andam pelo relógio (gincana-dados.js), iguais para todos.
import * as THREE from 'three';
import {
  Y, CAIXAS, PORTAO, PORTAS, portasDeVerdade, MOVEIS, posMovel, VARREDORES, anguloVarredor, PENDULOS, cabecaPendulo,
  PONTOS, CHEGADA, FINAL, PISOS, nascerNaFinal, SACADA,
} from './gincana-dados.js';
import { PORTAL_GINCANA } from './parque-dados.js';
import { hud, texturaViva, FONTE } from './hud-jogos.js';

const CORES = [0xf472b6, 0xa78bfa, 0x22d3ee, 0xfacc15, 0x4ade80, 0xfb923c];
const LONGE = -9999; // colisor "tirado do mundo" (portão aberto, porta falsa, piso que caiu)
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const agora = () => Date.now() / 1000;

function placa(texto, cor, larg = 8) {
  const tex = texturaViva(THREE, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, w / 2, h / 2 - 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(larg, larg / 4, 1);
  return s;
}

// um colisor que dá para tirar e pôr de volta no mesmo lugar
function guardar(c) {
  c.userData = { min: c.min.clone(), max: c.max.clone() };
  return c;
}
const tirar = (c) => {
  c.min.y = LONGE;
  c.max.y = LONGE + 0.1;
};
const repor = (c) => {
  c.min.copy(c.userData.min);
  c.max.copy(c.userData.max);
};

// ------------------------------------------------------------------ a pista (parte do mundo)
export function construirGincana(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const mat = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, ...extra });
  const caixa = (c, material, colide = true) => {
    const [x0, y0, z0, x1, y1, z1] = c;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, Y + (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    const col = colide ? world.addBox({ min: [x0, Y + y0, z0], max: [x1, Y + y1, z1] }) : null;
    return { malha: m, col };
  };
  CAIXAS.forEach((c, k) => caixa(c, mat(k % 2 ? 0xfde7f3 : 0xe9d5ff)));
  const portao = caixa(PORTAO, mat(0xf472b6, { transparent: true, opacity: 0.6 }));
  guardar(portao.col);
  // o paredão das portas: pilares e verga seguram sempre; as portas, conforme a rodada
  for (const c of [...PORTAS.pilares, PORTAS.verga]) caixa(c, mat(0x7c3aed));
  const portas = PORTAS.vaos.map((v, k) => {
    const p = caixa([v.x0, 0, PORTAS.z - 0.25, v.x1, 3, PORTAS.z + 0.25], mat(CORES[k % CORES.length]));
    guardar(p.col);
    return { ...p, vao: v };
  });
  // plataformas que vão e voltam
  const moveis = MOVEIS.map((m, k) => {
    const malha = new THREE.Mesh(new THREE.BoxGeometry(m.meia * 2, 1, m.meia * 2), mat(CORES[(k + 2) % CORES.length]));
    malha.castShadow = malha.receiveShadow = true;
    g.add(malha);
    const col = world.addBox({ min: [m.x - m.meia, Y - 1, m.z - m.meia], max: [m.x + m.meia, Y, m.z + m.meia], data: { move: true } });
    col.half = new THREE.Vector3(m.meia, 0.5, m.meia);
    return { m, malha, col };
  });
  // varredores: o eixo (colisor nas CAIXAS) e a barra que gira
  const varredores = VARREDORES.map((v) => {
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, v.raio * 2, 12).rotateZ(Math.PI / 2), mat(0xef4444, { emissive: 0x7f1d1d, emissiveIntensity: 0.3 }));
    barra.position.set(v.x, Y + (v.alt[0] + v.alt[1]) / 2, v.z);
    barra.castShadow = true;
    const eixo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16), mat(0x334155));
    eixo.position.set(v.x, Y + 0.8, v.z);
    g.add(barra, eixo);
    return { v, barra };
  });
  // pêndulos: o pórtico em cima da ponte e o martelo
  const pendulos = PENDULOS.map((p) => {
    for (const s of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.5, p.eixo, 0.5), mat(0x475569));
      poste.position.set(p.x + s * 9, Y + p.eixo / 2 - 1, p.z);
      g.add(poste);
    }
    const viga = new THREE.Mesh(new THREE.BoxGeometry(18.5, 0.5, 0.5), mat(0x475569));
    viga.position.set(p.x, Y + p.eixo, p.z);
    const giro = new THREE.Group();
    giro.position.set(p.x, Y + p.eixo, p.z);
    const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, p.braco, 6).translate(0, -p.braco / 2, 0), mat(0x94a3b8, { metalness: 0.6 }));
    const cabeca = new THREE.Mesh(new THREE.CylinderGeometry(p.raio * 0.9, p.raio * 0.9, p.raio * 2.2, 18).rotateX(Math.PI / 2).translate(0, -p.braco, 0), mat(0xfacc15));
    cabeca.castShadow = true;
    giro.add(braco, cabeca);
    g.add(viga, giro);
    return { p, giro };
  });
  // a chegada: um arco com o nome
  const arcoMat = mat(0x22c55e, { emissive: 0x14532d, emissiveIntensity: 0.4 });
  for (const x of [CHEGADA.x0 + 0.5, CHEGADA.x1 - 0.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), arcoMat);
    p.position.set(x, Y + CHEGADA.y + 3, CHEGADA.z0 + 1);
    g.add(p);
  }
  const topo = new THREE.Mesh(new THREE.BoxGeometry(CHEGADA.x1 - CHEGADA.x0, 1, 0.8), arcoMat);
  topo.position.set((CHEGADA.x0 + CHEGADA.x1) / 2, Y + CHEGADA.y + 6.3, CHEGADA.z0 + 1);
  g.add(topo);
  const nome = placa('CHEGADA', '#22c55e', 9);
  nome.position.set((CHEGADA.x0 + CHEGADA.x1) / 2, Y + CHEGADA.y + 8, CHEGADA.z0 + 1);
  const largada = placa('GINCANA', '#f472b6', 10);
  largada.position.set(40, Y + 6, 690);
  g.add(nome, largada);
  // a final: os hexágonos, instanciados (um desenho para todos), cada um com seu colisor
  const r = FINAL.raio;
  const pisos = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 0.6, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), PISOS.length);
  pisos.castShadow = pisos.receiveShadow = true;
  pisos.frustumCulled = false; // os pisos se espalham (e caem): a esfera do desenho de um só não serve
  const colPisos = PISOS.map((p) => {
    pisos.setMatrixAt(p.id, _m.compose(_p.set(p.x, Y + p.y - 0.3, p.z), _q.identity(), _s.set(1, 1, 1)));
    pisos.setColorAt(p.id, _c.set(p.andar === 0 ? 0xfde047 : 0x7dd3fc));
    return guardar(world.addBox({ min: [p.x - r * 0.866, Y + p.y - 0.6, p.z - r * 0.92], max: [p.x + r * 0.866, Y + p.y, p.z + r * 0.92], data: { piso: p.id } }));
  });
  g.add(pisos);
  const final = placa('FINAL', '#facc15', 10);
  final.position.set(FINAL.x, Y + FINAL.andares[0] + 9, FINAL.z);
  g.add(final);
  const S = SACADA;
  caixa([S.x0, S.y - 1, S.z0, S.x1, S.y, S.z1], mat(0xcbd5e1));
  // o portal no chão do parque
  const P = PORTAL_GINCANA;
  const anel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 12, 40), new THREE.MeshBasicMaterial({ color: 0xf472b6, toneMapped: false }));
  anel.position.set(P.x, 2, P.z);
  const meio = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  meio.position.copy(anel.position);
  const chao = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
  chao.position.set(P.x, 0.05, P.z);
  const nomePortal = placa('GINCANA', '#f472b6', 4);
  nomePortal.position.set(P.x, 4.4, P.z);
  g.add(anel, meio, chao, nomePortal);
  world.decorAnimated.push((t) => { anel.rotation.y = t * 0.8; });
  return { grupo: g, portao, portas, moveis, varredores, pendulos, pisos, colPisos };
}

// ------------------------------------------------------------------ o jogo no navegador
export class Gincana {
  // opts: world, player, sfx, ligado(), aoEntrar() (desliga carro, voo, pulo alto)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'gincana';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.gincana3d;
    this.e = null;
    this.dentro = false;
    this.ponto = 0;
    this.terminou = false;
    this.caiu = false;
    this.rodada = -1;
    this.empurrao = 0;
    this.quebradas = new Set();
    this.caindo = new Map(); // piso -> quando cai (performance.now)
    this.pisei = new Set();
    this.verdadeiras = new Set();
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('gc-estado', (e) => this.estado(e));
    socket.on('gc-piso', ([id, falta]) => this.marcarPiso(id, falta));
    socket.on('gc-porta', (k) => this.quebrarPorta(k, false));
    socket.on('gc-chegada', (m) => {
      if (!this.dentro) return;
      if (m.id === this.eu) hud.mensagem(`Você chegou em ${m.ordem}º!`, `${m.tempo} s · espere a final`, 3500, '#22c55e');
      else hud.mensagem(`${m.nome} chegou em ${m.ordem}º`, '', 1600, '#86efac');
      this.sfx.checkpoint();
    });
    socket.on('gc-queda', (m) => {
      if (this.dentro && m.id !== this.eu) hud.mensagem(`${m.nome} caiu!`, '', 1300, '#fb923c');
    });
  }

  ver() {
    this.socket?.emit('gc-ver', (e) => e && this.estado(e));
  }

  meu() {
    return this.e?.jogadores.find((j) => j.id === this.eu) || null;
  }

  estado(e) {
    const antes = this.e;
    this.e = e;
    this.estadoEm = performance.now();
    if (e.rodada !== this.rodada) this.novaRodada(e);
    for (const [id, falta] of e.pisos) this.marcarPiso(id, falta);
    const mudou = antes?.fase !== e.fase;
    if (!this.dentro) return;
    if (!this.meu()) return this.sair(false); // o servidor tirou (desligado, reconexão)
    if (!mudou) return;
    if (e.fase === 'contagem') this.irParaLargada();
    if (e.fase === 'corrida') {
      hud.mensagem('VAI!', 'Até a chegada · caiu, volta no último ponto (R)', 1800, '#facc15');
      this.sfx.rodada();
    }
    if (e.fase === 'final') {
      const k = e.jogadores.findIndex((j) => j.id === this.eu);
      if (this.meu()?.caiu) this.irParaSacada();
      else {
        const p = nascerNaFinal(k);
        this.player.teleport([p.x, Y + FINAL.andares[0] + 0.1, p.z], Math.atan2(p.x - FINAL.x, p.z - FINAL.z));
        hud.mensagem('FINAL!', 'O piso que você pisa cai · o último em pé leva a coroa', 3000, '#facc15');
        this.sfx.rodada();
      }
    }
    if (e.fase === 'fim') {
      const v = e.vencedor;
      hud.mensagem(v ? `${v.id === this.eu ? 'Você' : v.nome} levou a coroa!` : 'Fim da gincana', 'Rodada nova já já', 5000, '#facc15');
      if (v?.id === this.eu) this.sfx.finish();
    }
  }

  // rodada nova: portas (sorteadas pelo servidor) e pisos de volta
  novaRodada(e) {
    this.rodada = e.rodada;
    this.verdadeiras = portasDeVerdade(e.semente);
    this.quebradas.clear();
    this.g3d.portas.forEach((p, k) => {
      p.malha.visible = true;
      if (this.verdadeiras.has(k)) repor(p.col);
      else tirar(p.col);
    });
    this.caindo.clear();
    this.pisei.clear();
    const P = this.g3d.pisos;
    PISOS.forEach((p) => {
      repor(this.g3d.colPisos[p.id]);
      P.setMatrixAt(p.id, _m.compose(_p.set(p.x, Y + p.y - 0.3, p.z), _q.identity(), _s.set(1, 1, 1)));
      P.setColorAt(p.id, _c.set(p.andar === 0 ? 0xfde047 : 0x7dd3fc));
    });
    P.instanceMatrix.needsUpdate = true;
    if (P.instanceColor) P.instanceColor.needsUpdate = true;
    this.ponto = 0;
    this.terminou = false;
    this.caiu = false;
  }

  marcarPiso(id, falta) {
    if (this.caindo.has(id)) return;
    this.caindo.set(id, performance.now() + falta);
    this.g3d.pisos.setColorAt(id, _c.set(0xef4444));
    if (this.g3d.pisos.instanceColor) this.g3d.pisos.instanceColor.needsUpdate = true;
  }

  quebrarPorta(k, avisar) {
    if (this.quebradas.has(k) || this.verdadeiras.has(k)) return;
    this.quebradas.add(k);
    this.g3d.portas[k].malha.visible = false;
    if (avisar) this.socket?.emit('gc-porta', k);
    if (this.dentro) this.sfx.pedraQuebra(0.6);
  }

  // ---------------------------------------------------------------- entrar e sair
  pertoDoPortal() {
    const p = this.player.pos;
    return !this.dentro && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAL_GINCANA.x, p.z - PORTAL_GINCANA.z) < 2.6;
  }

  usarE() {
    if (!this.pertoDoPortal()) return false;
    this.socket?.emit('gc-entrar', {}, (r) => {
      if (!r?.ok) return;
      this.dentro = true;
      this.aoEntrar?.();
      if (r.atrasado) {
        this.irParaSacada();
        hud.mensagem('Gincana', 'Já está valendo: assista da sacada e jogue a próxima', 3500, '#f472b6');
      } else {
        this.irParaLargada();
        hud.mensagem('Gincana', 'Espere o portão abrir · Esc sai', 3000, '#f472b6');
      }
      this.sfx.teleport();
    });
    return true;
  }

  irParaLargada() {
    this.ponto = 0;
    this.player.teleport([30.8 + Math.random() * 18.4, Y + 0.1, 689 + Math.random() * 9], Math.PI);
  }

  irParaSacada() {
    const S = SACADA;
    this.player.teleport([(S.x0 + S.x1) / 2, Y + S.y + 0.1, (S.z0 + S.z1) / 2], Math.PI / 2); // olhando para a final
  }

  voltarAoPonto() {
    const p = PONTOS[this.ponto];
    this.player.teleport([p.x + (Math.random() - 0.5) * 2, Y + 0.1, p.z], p.yaw);
  }

  sair(avisar = true) {
    if (!this.dentro) return;
    this.dentro = false;
    if (avisar) this.socket?.emit('gc-sair');
    hud.placar('');
    this.player.teleport([PORTAL_GINCANA.x + 3, 0, PORTAL_GINCANA.z], -Math.PI / 2);
  }

  esc() {
    if (!this.dentro) return false;
    this.sair();
    return true;
  }

  teclaR() {
    if (!this.dentro) return false;
    if (this.e?.fase === 'corrida' && !this.terminou) this.voltarAoPonto();
    return true;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt) {
    const t = agora();
    const G3 = this.g3d;
    // os obstáculos andam para todo mundo (mesmo de fora: dá para ver de baixo)
    for (const { m, malha, col } of G3.moveis) {
      const x = posMovel(m, t);
      const antes = col.min.x + m.meia;
      col.min.set(x - m.meia, Y - 1, m.z - m.meia);
      col.max.set(x + m.meia, Y, m.z + m.meia);
      col.delta.set(x - antes, 0, 0);
      malha.position.set(x, Y - 0.5, m.z);
    }
    for (const { v, barra } of G3.varredores) barra.rotation.y = -anguloVarredor(v, t);
    for (const { p, giro } of G3.pendulos) giro.rotation.z = cabecaPendulo(p, t).a;
    // o portão: aberto só na corrida
    if (this.e?.fase === 'corrida') tirar(G3.portao.col);
    else repor(G3.portao.col);
    G3.portao.malha.visible = this.e?.fase !== 'corrida';
    // pisos caindo: vermelhos, depois caem e somem
    const P = G3.pisos;
    let mexeu = false;
    const ms = performance.now();
    for (const [id, em] of this.caindo) {
      if (ms < em) continue;
      const p = PISOS[id];
      const k = Math.min(1, (ms - em) / 1200);
      if (k === 0 || G3.colPisos[id].min.y !== LONGE) tirar(G3.colPisos[id]);
      P.setMatrixAt(id, _m.compose(_p.set(p.x, Y + p.y - 0.3 - k * k * 30, p.z), _q.identity(), _s.setScalar(k >= 1 ? 0 : 1)));
      mexeu = true;
      if (k >= 1) this.caindo.set(id, Infinity);
    }
    if (mexeu) P.instanceMatrix.needsUpdate = true;

    if (!this.dentro) return;
    if (!this.ligado()) return this.sair();
    const pl = this.player;
    const pos = pl.pos;
    const fase = this.e?.fase;
    if (pl.voando || pl.puloAlto || pl.veiculo) this.aoEntrar?.(); // nada de poder na gincana
    this.empurrao -= dt;
    if (fase === 'corrida' || fase === 'contagem') this.obstaculos(t);
    // a corrida: pontos de volta, portas falsas, quedas e a chegada
    if (fase === 'corrida' && !this.terminou) {
      for (let k = PONTOS.length - 1; k > this.ponto; k--) {
        if (pos.z >= PONTOS[k].desde && pos.y > Y - 1) {
          this.ponto = k;
          this.sfx.checkpoint();
          break;
        }
      }
      if (Math.abs(pos.z - PORTAS.z) < 0.7 && pos.y < Y + 3) {
        PORTAS.vaos.forEach((v, k) => {
          if (pos.x > v.x0 - 0.3 && pos.x < v.x1 + 0.3) this.quebrarPorta(k, true);
        });
      }
      if (pos.x > CHEGADA.x0 && pos.x < CHEGADA.x1 && pos.z > CHEGADA.z0 && pos.z < CHEGADA.z1 && pos.y > Y + CHEGADA.y - 0.5) {
        this.terminou = true;
        this.socket?.emit('gc-chegou');
      }
    }
    if ((fase === 'corrida' || fase === 'contagem' || fase === 'intervalo') && pos.y < Y - 25) {
      this.sfx.fall();
      if (fase === 'contagem') this.irParaLargada();
      else if (this.terminou) this.player.teleport([40, Y + CHEGADA.y + 0.1, 838], Math.PI);
      else this.voltarAoPonto();
    }
    // a final: o piso que pisou cai; quem cai vai para a sacada
    if (fase === 'final' && !this.meu()?.caiu && !this.caiu) {
      const id = pl.grounded ? pl.ground?.data?.piso : undefined;
      if (id !== undefined && !this.pisei.has(id)) {
        this.pisei.add(id);
        this.socket?.emit('gc-pisou', id);
      }
      if (pos.y < Y + FINAL.queda) {
        this.caiu = true;
        this.socket?.emit('gc-caiu');
        hud.mensagem('Caiu!', 'Assista da sacada', 2200, '#fb923c');
        this.sfx.fall();
        this.irParaSacada();
      }
    }
    if (fase === 'final' && pos.y < Y - 30) this.irParaSacada();
    this.placar();
  }

  // varredores e pêndulos: encostou, voa
  obstaculos(t) {
    if (this.empurrao > 0) return;
    const pl = this.player;
    const p = pl.pos;
    for (const { v } of this.g3d.varredores) {
      if (Math.abs(p.z - v.z) > v.raio + 1 || Math.abs(p.x - v.x) > v.raio + 1) continue;
      if (!(p.y < Y + v.alt[1] && p.y + 1.8 > Y + v.alt[0])) continue;
      const a = anguloVarredor(v, t);
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      // o ponto da barra mais perto do boneco
      const s = Math.max(-v.raio, Math.min(v.raio, (p.x - v.x) * cx + (p.z - v.z) * cz));
      const dx = p.x - (v.x + cx * s);
      const dz = p.z - (v.z + cz * s);
      if (dx * dx + dz * dz > 0.75 * 0.75) continue;
      const sinal = Math.sign(v.vel) * Math.sign(s || 1);
      this.empurrar(-cz * sinal * 14, 7, cx * sinal * 14);
      return;
    }
    for (const { p: pd } of this.g3d.pendulos) {
      if (Math.abs(p.z - pd.z) > 3) continue;
      const c = cabecaPendulo(pd, t);
      const d = Math.hypot(p.x - c.x, p.y + 0.9 - (Y + c.y), p.z - c.z);
      if (d > pd.raio + 0.5) continue;
      this.empurrar(Math.sign(c.w || 1) * 16, 7.5, 0);
      return;
    }
  }

  empurrar(vx, vy, vz) {
    const pl = this.player;
    pl.vel.x = vx;
    pl.vel.z = vz;
    pl.vel.y = vy;
    pl.grounded = false;
    pl.ground = null;
    this.empurrao = 0.45;
    this.sfx.punchTaken();
  }

  placar() {
    const e = this.e;
    if (!e) return;
    const s = Math.ceil((e.falta - (performance.now() - this.estadoEm)) / 1000);
    const n = e.jogadores.length;
    const textos = {
      contagem: `<b>Gincana</b><small>começa em</small><b>${Math.max(0, s)}</b><small>s · ${n} ${n === 1 ? 'jogador' : 'jogadores'} · Esc sai</small>`,
      corrida: `<b>Corrida</b><small>chegaram ${e.jogadores.filter((j) => j.chegou).length}/${n} · R volta no ponto · Esc sai</small>`,
      intervalo: '<b>Final já já</b><small>prepare-se</small>',
      final: `<b>Final</b><small>em pé: ${e.jogadores.filter((j) => !j.caiu).length}/${n} · não caia!</small>`,
      fim: `<b>Coroa</b><small>${e.vencedor ? e.vencedor.nome : '—'}</small>`,
    };
    hud.placar(textos[e.fase] || '');
  }

  apertou() { return false; }

  ativo() { return false; } // na gincana não tem botão de ação (é correr e pular)

  soltou() {}

  dica(livre) {
    if (!livre || !this.pertoDoPortal()) return '';
    return '<kbd>E</kbd>Ir para a gincana';
  }

  lugar() {
    return { nome: 'Gincana', desc: 'Corrida de obstáculos no céu e o piso que cai', cor: '#f472b6', pos: [PORTAL_GINCANA.x - 3, 0, PORTAL_GINCANA.z], yaw: -Math.PI / 2 };
  }
}
