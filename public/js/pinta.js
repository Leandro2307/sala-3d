// Pinta-território (como no Splatoon), na arena do parque. E na entrada (lado sul) põe você no time
// com menos gente, na base dele. Segurando o clique (ou F) a arma atira tinta em arco para onde a
// câmera olha; onde a tinta cai, o chão fica da cor do seu time. O tanque esvazia atirando e enche
// sozinho — bem mais rápido em cima da sua cor. Tinta que acerta alguém do outro time conta: 3
// acertos e ele volta para a base. Ganha a rodada (2 minutos) o time com mais chão pintado. E ou Esc
// saem. O servidor (pinta-servidor.js) guarda a grade do chão e conta a área (pinta-dados.js).
import * as THREE from 'three';
import {
  PINTA, TIMES_PINTA as TIMES, LIMITES, OBSTACULOS, BASES, ENTRADA_PINTA, celulaDe, pintarGrade, naArena,
} from './pinta-dados.js';
import { hud, texturaViva, FONTE, painelDuasFaces } from './hud-jogos.js';

const L = LIMITES;
const PX = 512; // o canvas da tinta
const PX_M = PX / PINTA.lado;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ------------------------------------------------------------------ a arena (parte do mundo)
export function construirPinta(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const cx = PINTA.cx;
  const cz = PINTA.cz;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(PINTA.lado, PINTA.lado).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.9 }));
  piso.position.set(cx, 0.04, cz);
  piso.receiveShadow = true;
  g.add(piso);
  // a tinta: um canvas por cima do piso
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const tinta = new THREE.CanvasTexture(cv);
  tinta.colorSpace = THREE.SRGBColorSpace;
  const camada = new THREE.Mesh(new THREE.PlaneGeometry(PINTA.lado, PINTA.lado).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tinta, transparent: true, roughness: 0.4, depthWrite: false, emissive: 0xffffff, emissiveMap: tinta, emissiveIntensity: 0.25 }));
  camada.position.set(cx, 0.06, cz);
  camada.receiveShadow = true;
  g.add(camada);
  // o muro em volta (sólido) e os obstáculos
  const muroMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
  const t = 0.6;
  for (const [x0, z0, x1, z1] of [[L.x0 - t, L.z0 - t, L.x1 + t, L.z0], [L.x0 - t, L.z1, L.x1 + t, L.z1 + t], [L.x0 - t, L.z0, L.x0, L.z1], [L.x1, L.z0, L.x1 + t, L.z1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, PINTA.muro, z1 - z0), muroMat);
    m.position.set((x0 + x1) / 2, PINTA.muro / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    world.addBox({ min: [x0, 0, z0], max: [x1, PINTA.muro, z1] });
  }
  const obsMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
  for (const [x0, y0, z0, x1, y1, z1] of OBSTACULOS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), obsMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    world.addBox({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }
  // as bases
  BASES.forEach((b, k) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TIMES[k].cor, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    m.position.set(b.x, 0.08, b.z);
    g.add(m);
  });
  // a entrada, o placar e o nome
  const chao = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  chao.position.set(ENTRADA_PINTA.x, 0.06, ENTRADA_PINTA.z);
  g.add(chao);
  const placar = texturaViva(THREE, 512, 256, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
  painelDuasFaces(THREE, g, placar, 4.4, 2.2, cx, PINTA.muro + 2.6, L.z0 - 0.3, 0, { poste: false });
  world.reservas.push({ x: ENTRADA_PINTA.x, z: ENTRADA_PINTA.z, r: 5 });
  return { grupo: g, tinta, cv, placar };
}

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e879f9';
  ctx.font = FONTE(40);
  ctx.fillText('PINTA-TERRITÓRIO', w / 2, 34);
  if (!e?.jogadores?.length) {
    ctx.font = FONTE(22, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('aperte E no círculo roxo para jogar', w / 2, 120);
    return;
  }
  const total = e.total || 1;
  e.area.forEach((a, t) => {
    const y = 96 + t * 58;
    const pct = Math.round((a / total) * 100);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(30, y - 18, w - 60, 36);
    ctx.fillStyle = TIMES[t].cor;
    ctx.fillRect(30, y - 18, ((w - 60) * pct) / 100, 36);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(24, 800);
    ctx.textAlign = 'left';
    ctx.fillText(`${TIMES[t].nome} · ${e.jogadores.filter((j) => j.time === t).length}`, 40, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, w - 40, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = FONTE(20, 600);
  ctx.fillText({ contagem: 'começa já já', jogo: 'valendo!', fim: e.vencedor === null ? 'empate' : `${TIMES[e.vencedor].nome} venceu` }[e.fase] || '', w / 2, h - 26);
}

// ------------------------------------------------------------------ o jogo no navegador
export class Pinta {
  // opts: world, player, sfx, ligado(), posDe(id), aoEntrar() (desliga carro, voo, pulo alto)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'pinta';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.pinta3d;
    this.e = null;
    this.dentro = false;
    this.time = 0;
    this.tinta = PINTA.tanque;
    this.atirando = false;
    this.ultimoTiro = 0;
    this.protegidoAte = 0;
    this.grade = new Uint8Array(PINTA.n * PINTA.n);
    this.area = [0, 0];
    this.gotas = [];
    this.geoGota = new THREE.SphereGeometry(0.22, 10, 8);
    this.matGota = TIMES.map((t) => new THREE.MeshBasicMaterial({ color: t.cor, toneMapped: false }));
    this.aneis = new Map(); // id -> anel na cor do time, embaixo de cada um
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('pt-estado', (e) => this.estado(e));
    socket.on('pt-area', (a) => {
      this.area = a;
      if (this.e) {
        this.e = { ...this.e, area: a };
        this.g3d.placar.userData.redesenhar(this.e);
      }
    });
    socket.on('pt-tinta', ([x, z, time]) => this.pingar(x, z, time));
    socket.on('pt-tiro', ([time, ox, oy, oz, vx, vy, vz]) => this.gota(time, new THREE.Vector3(ox, oy, oz), new THREE.Vector3(vx, vy, vz), false));
    socket.on('pt-limpar', () => this.limpar());
    socket.on('pt-dano', ({ vida }) => {
      hud.mensagem('Pintado!', `${vida} ${vida === 1 ? 'acerto' : 'acertos'} e você volta para a base`, 900, '#f472b6');
      this.sfx.punchTaken();
    });
    socket.on('pt-splat', ({ por }) => {
      hud.mensagem('SPLAT!', `${por} te pintou · de volta à base`, 2200, '#f472b6');
      this.sfx.ko();
      this.protegidoAte = performance.now() + PINTA.protecao;
      this.irParaBase();
    });
    socket.on('pt-abate', (m) => {
      if (this.dentro && m.por !== this.nome) hud.mensagem(`${m.por} pintou ${m.alvo}`, '', 1100, TIMES[m.porTime].cor);
    });
  }

  ver() {
    this.socket?.emit('pt-ver', (r) => {
      if (!r) return;
      const bin = atob(r.grade);
      for (let i = 0; i < bin.length && i < this.grade.length; i++) this.grade[i] = bin.charCodeAt(i);
      this.redesenharGrade();
      this.estado(r.estado);
    });
  }

  meu() {
    return this.e?.jogadores.find((j) => j.id === this.eu) || null;
  }

  estado(e) {
    const antes = this.e;
    this.e = e;
    this.estadoEm = performance.now();
    this.area = e.area;
    this.g3d.placar.userData.redesenhar(e);
    // anéis dos times embaixo de quem joga
    const ids = new Set(e.jogadores.map((j) => j.id));
    for (const [id, m] of this.aneis) if (!ids.has(id)) {
      m.removeFromParent();
      this.aneis.delete(id);
    }
    for (const j of e.jogadores) {
      let m = this.aneis.get(j.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TIMES[j.time].cor, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
        this.g3d.grupo.add(m);
        this.aneis.set(j.id, m);
      }
      m.material.color.set(TIMES[j.time].cor);
    }
    if (!this.dentro) return;
    if (!this.meu()) return this.sair(false);
    if (antes?.fase === e.fase) return;
    if (e.fase === 'jogo') {
      this.irParaBase();
      this.tinta = PINTA.tanque;
      hud.mensagem('PINTE!', 'Segure o clique para atirar tinta · ganha quem pintar mais chão', 2200, TIMES[this.time].cor);
      this.sfx.rodada();
    }
    if (e.fase === 'fim') {
      const v = e.vencedor;
      hud.mensagem(v === null ? 'Empate!' : `${TIMES[v].nome} venceu!`, `${Math.round((e.area[0] / e.total) * 100)}% × ${Math.round((e.area[1] / e.total) * 100)}%`, 5000, v === null ? '#f8fafc' : TIMES[v].cor);
      if (v === this.time) this.sfx.finish();
      this.atirando = false;
    }
  }

  // ---------------------------------------------------------------- a tinta no chão
  pingar(x, z, time) {
    pintarGrade(this.grade, x, z, time + 1);
    const ctx = this.g3d.cv.getContext('2d');
    ctx.fillStyle = TIMES[time].cor;
    ctx.beginPath();
    // borrão um pouco irregular: três círculos
    for (let k = 0; k < 3; k++) {
      const ox = (Math.random() - 0.5) * 0.6;
      const oz = (Math.random() - 0.5) * 0.6;
      ctx.moveTo((x + ox - L.x0) * PX_M + PINTA.raioTinta * PX_M * 0.8, (z + oz - L.z0) * PX_M);
      ctx.arc((x + ox - L.x0) * PX_M, (z + oz - L.z0) * PX_M, PINTA.raioTinta * PX_M * (k ? 0.75 : 1), 0, Math.PI * 2);
    }
    ctx.fill();
    this.g3d.tinta.needsUpdate = true;
  }

  redesenharGrade() {
    const ctx = this.g3d.cv.getContext('2d');
    ctx.clearRect(0, 0, PX, PX);
    for (let k = 0; k < this.grade.length; k++) {
      const c = this.grade[k];
      if (!c) continue;
      ctx.fillStyle = TIMES[c - 1].cor;
      ctx.fillRect((k % PINTA.n) * PX_M, Math.floor(k / PINTA.n) * PX_M, PX_M + 0.5, PX_M + 0.5);
    }
    this.g3d.tinta.needsUpdate = true;
  }

  limpar() {
    this.grade.fill(0);
    this.area = [0, 0];
    this.redesenharGrade();
  }

  gota(time, p, v, meu) {
    const malha = new THREE.Mesh(this.geoGota, this.matGota[time]);
    malha.position.copy(p);
    this.g3d.grupo.add(malha);
    this.gotas.push({ time, p, v, meu, malha, vida: 4 });
    if (this.gotas.length > 80) this.tirarGota(this.gotas.shift());
  }

  tirarGota(gt) {
    gt.malha.removeFromParent();
  }

  // ---------------------------------------------------------------- entrar e sair
  pertoDaEntrada() {
    const p = this.player.pos;
    return Math.hypot(p.x - ENTRADA_PINTA.x, p.z - ENTRADA_PINTA.z) < 2.2 && p.y < 2;
  }

  irParaBase() {
    const b = BASES[this.time];
    this.player.teleport([b.x + (Math.random() - 0.5) * 3, 0.1, b.z + (Math.random() - 0.5) * 3], Math.atan2(b.x - PINTA.cx, b.z - PINTA.cz));
  }

  usarE() {
    if (!this.ligado()) return false;
    if (this.dentro) {
      this.sair();
      return true;
    }
    if (!this.pertoDaEntrada()) return false;
    this.socket?.emit('pt-entrar', {}, (r) => {
      if (!r?.ok) return;
      this.dentro = true;
      this.time = r.time;
      this.tinta = PINTA.tanque;
      this.aoEntrar?.();
      this.irParaBase();
      hud.mensagem(`Time ${TIMES[r.time].nome}`, 'Segure o clique para atirar tinta · em cima da sua cor o tanque enche rápido · E sai', 4200, TIMES[r.time].cor);
      this.sfx.teleport();
    });
    return true;
  }

  sair(avisar = true) {
    if (!this.dentro) return;
    this.dentro = false;
    this.atirando = false;
    if (avisar) this.socket?.emit('pt-sair');
    hud.placar('');
    hud.forca(null);
    if (naArena(this.player.pos, 1)) this.player.teleport([ENTRADA_PINTA.x + 2.5, 0, ENTRADA_PINTA.z - 1.5], 0);
  }

  esc() {
    if (!this.dentro) return false;
    this.sair();
    return true;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt) {
    const agora = performance.now();
    // as gotas voando (as de todo mundo); as minhas pintam onde caem e acertam quem encostam
    this.gotas = this.gotas.filter((gt) => {
      gt.vida -= dt;
      gt.v.y -= PINTA.gravidade * dt;
      gt.p.addScaledVector(gt.v, dt);
      gt.malha.position.copy(gt.p);
      const p = gt.p;
      const fora = p.x < L.x0 || p.x > L.x1 || p.z < L.z0 || p.z > L.z1 || gt.vida <= 0;
      const bateu = OBSTACULOS.some(([x0, y0, z0, x1, y1, z1]) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y > y0 && p.y < y1);
      if (gt.meu && !fora && !bateu && this.acertou(gt)) return this.tirarGota(gt), false;
      if (fora || bateu) return this.tirarGota(gt), false;
      if (p.y > 0.1) return true;
      if (gt.meu && this.e?.fase === 'jogo') this.socket?.emit('pt-tinta', [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]);
      this.tirarGota(gt);
      return false;
    });
    // os anéis embaixo de quem joga
    for (const [id, m] of this.aneis) {
      const pos = id === this.eu ? this.player.pos : this.posDe(id);
      m.visible = !!pos;
      if (pos) m.position.set(pos.x, pos.y + 0.09, pos.z);
    }
    if (!this.dentro) return;
    if (!this.ligado()) return this.sair();
    const pl = this.player;
    if (pl.voando || pl.puloAlto || pl.veiculo) this.aoEntrar?.();
    // fora da arena (teleporte, painel): sai do jogo
    if (!naArena(pl.pos, 6) || pl.pos.y > 10) return this.sair();
    const jogo = this.e?.fase === 'jogo';
    // o tanque: atirar gasta, parado enche (bem mais rápido em cima da sua cor)
    const k = celulaDe(pl.pos.x, pl.pos.z);
    const naCor = k >= 0 && this.grade[k] === this.time + 1;
    if (!this.atirando) this.tinta = Math.min(PINTA.tanque, this.tinta + (naCor ? PINTA.recargaCor : PINTA.recarga) * dt);
    if (jogo && this.atirando && this.tinta >= PINTA.custo && agora - this.ultimoTiro > PINTA.cadencia * 1000) {
      this.ultimoTiro = agora;
      this.tinta -= PINTA.custo;
      this.atirar();
    }
    hud.forca(this.tinta / PINTA.tanque, TIMES[this.time].cor);
    const e = this.e;
    const s = Math.max(0, Math.ceil((e.falta - (agora - this.estadoEm)) / 1000));
    const pct = (a) => Math.round((a / (e.total || 1)) * 100);
    const relogio = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    hud.placar(e.fase === 'jogo'
      ? `<b style="color:${TIMES[0].cor}">${pct(this.area[0])}%</b><small>Rosa</small> · <small>Verde</small><b style="color:${TIMES[1].cor}">${pct(this.area[1])}%</b> · <b>${relogio}</b><small> · você: ${TIMES[this.time].nome} · E sai</small>`
      : e.fase === 'contagem' ? `<b>Pinta-território</b><small>começa em</small><b>${s}</b><small>s · você: ${TIMES[this.time].nome}</small>` : `<b>${e.vencedor === null ? 'Empate' : `${TIMES[e.vencedor].nome} venceu`}</b>`);
  }

  atirar() {
    const pl = this.player;
    const olhar = pl.lookDirection(_a);
    const h = _b.set(olhar.x, 0, olhar.z);
    if (h.lengthSq() < 1e-4) h.set(0, 0, 1);
    h.normalize();
    const p = new THREE.Vector3(pl.pos.x + h.x * 0.6, pl.pos.y + 1.4, pl.pos.z + h.z * 0.6);
    const v = olhar.clone().multiplyScalar(PINTA.vel);
    v.y += 3;
    // um tiquinho de espalhado, como uma arma de tinta
    v.x += (Math.random() - 0.5) * 1.2;
    v.z += (Math.random() - 0.5) * 1.2;
    this.gota(this.time, p, v, true);
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.volatile.emit('pt-tiro', [a(p.x), a(p.y), a(p.z), a(v.x), a(v.y), a(v.z)]);
    if (Math.random() < 0.5) this.sfx.dado(0.4);
  }

  // a minha gota encostou em alguém do outro time?
  acertou(gt) {
    for (const j of this.e?.jogadores || []) {
      if (j.time === this.time || j.id === this.eu) continue;
      const pos = this.posDe(j.id);
      if (!pos) continue;
      if (Math.hypot(gt.p.x - pos.x, gt.p.z - pos.z) < 0.7 && gt.p.y > pos.y && gt.p.y < pos.y + 2) {
        this.socket?.emit('pt-acerto', j.id);
        this.sfx.punchHit();
        return true;
      }
    }
    return false;
  }

  apertou() {
    if (!this.dentro || !this.ligado()) return false;
    this.atirando = true;
    return true;
  }

  soltou() {
    this.atirando = false;
  }

  ativo() {
    return this.ligado() && this.dentro;
  }

  dica(livre) {
    if (!livre || !this.ligado() || this.dentro) return '';
    return this.pertoDaEntrada() ? '<kbd>E</kbd>Jogar pinta-território (Rosa × Verde)' : '';
  }

  lugar() {
    return { nome: 'Pinta-território', desc: 'Times pintam o chão com tinta · 2 minutos', cor: '#d946ef', pos: [ENTRADA_PINTA.x, 0, ENTRADA_PINTA.z - 1.5], yaw: Math.PI };
  }
}
