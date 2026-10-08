// Surf e mata-mata, no céu acima do mapa. Dois portais perto da porta do cinema levam até lá
// (E no portal); Esc volta para o chão.
//
// Surf (como o surf do CS): rampas em cunha, inclinadas demais para ficar de pé. Em cima delas o
// boneco desliza; no ar, A/D junto com o mouse virando para o mesmo lado acelera (a física do
// Source: o "air strafe"). Duas etapas, com ponto de volta em cada plataforma (R, ou caindo), e
// tempo no placar.
//
// Mata-mata (X1 do CS): arena fechada com caixas, muretas, pilares e uma torre com escada. Nasce
// com pistola; as outras armas ficam no chão e voltam 15 s depois de pegas. Cada abate conta;
// quem chega a 15 vence a rodada. Com 2 pessoas é um X1.
import * as THREE from 'three';
import { PORTAIS, SURF, ARENA, naArena } from './ceu-dados.js';
import { criarArma, ARMAS } from './armas.js';

const FONTE = (p, peso = 800) => `${peso} ${p}px 'Plus Jakarta Sans', system-ui, sans-serif`;
const CIMA = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function textura(w, h, desenhar) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.redesenhar = (...args) => {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    desenhar(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  tex.userData.redesenhar();
  return tex;
}

function placaTexto(texto, cor, larg = 6) {
  const tex = textura(512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, w / 2, h / 2 - 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(larg, larg / 4, 1);
  return s;
}

// ------------------------------------------------------------------ formas convexas (surf)
// Cada forma é uma lista de planos { n, c } (n·p <= c é dentro). Uma esfera colide quando a
// maior distância aos planos é menor que o raio; sai pelo plano dessa distância.
function planosDaRampa(r) {
  const A = new THREE.Vector3(...r.a);
  const B = new THREE.Vector3(...r.b);
  const d = B.clone().sub(A).normalize();
  const s = new THREE.Vector3().crossVectors(d, CIMA).normalize(); // de lado, no chão
  const u = new THREE.Vector3().crossVectors(s, d).normalize(); // "para cima", em pé na crista
  const face = (lado) => s.clone().multiplyScalar(lado * r.h).addScaledVector(u, r.w).normalize();
  const base = A.clone().addScaledVector(u, -r.h);
  const planos = [face(1), face(-1)].map((n) => ({ n, c: n.dot(A) }));
  planos.push({ n: u.clone().negate(), c: -u.dot(base) });
  planos.push({ n: d.clone().negate(), c: -d.dot(A) });
  planos.push({ n: d.clone(), c: d.dot(B) });
  return { planos, A, B, s, u };
}

function planosDaCaixa(min, max) {
  return {
    planos: [
      { n: new THREE.Vector3(1, 0, 0), c: max.x }, { n: new THREE.Vector3(-1, 0, 0), c: -min.x },
      { n: new THREE.Vector3(0, 1, 0), c: max.y }, { n: new THREE.Vector3(0, -1, 0), c: -min.y },
      { n: new THREE.Vector3(0, 0, 1), c: max.z }, { n: new THREE.Vector3(0, 0, -1), c: -min.z },
    ],
  };
}

function malhaDaRampa(r, f) {
  const { A, B, s, u } = f;
  const lado = (P, k) => P.clone().addScaledVector(s, k * r.w).addScaledVector(u, -r.h);
  const [Ap, Bp, Am, Bm] = [lado(A, 1), lado(B, 1), lado(A, -1), lado(B, -1)];
  const tri = [];
  const quad = (a, b, c, d) => tri.push(a, b, c, a, c, d);
  quad(A, Ap, Bp, B); // face +
  quad(A, B, Bm, Am); // face -
  quad(Ap, Am, Bm, Bp); // base
  tri.push(A, Am, Ap); // ponta A
  tri.push(B, Bp, Bm); // ponta B
  const geo = new THREE.BufferGeometry().setFromPoints(tri);
  geo.computeVertexNormals();
  // faixas ao longo da rampa: dá para ver a velocidade
  const comp = A.distanceTo(B);
  const uv = [];
  for (const p of tri) uv.push(p.clone().sub(A).dot(B.clone().sub(A).normalize()) / 4, p.clone().sub(A).dot(s) / 4);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const tex = textura(64, 64, (ctx, w, h) => {
    ctx.fillStyle = r.cor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, w / 8, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  void comp;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1, emissive: new THREE.Color(r.cor), emissiveIntensity: 0.18, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ o que fica no mundo
export function construirPortal(world, chave) {
  const g = new THREE.Group();
  world.fora.add(g);
  for (const p of [PORTAIS[chave]]) {
    const cor = new THREE.Color(p.cor);
    const anel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 12, 40), new THREE.MeshBasicMaterial({ color: cor, toneMapped: false }));
    anel.position.set(p.x, 2, p.z);
    anel.rotation.y = Math.PI / 2;
    const meio = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    meio.position.copy(anel.position);
    meio.rotation.y = Math.PI / 2;
    const chao = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    chao.position.set(p.x, 0.05, p.z);
    const placa = placaTexto(p.nome, p.cor, 4);
    placa.position.set(p.x, 4.4, p.z);
    g.add(anel, meio, chao, placa);
    p.anel = anel;
  }
  return { grupo: g };
}

export function construirSurf(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const formas = [];
  for (const r of SURF.rampas) {
    const f = planosDaRampa(r);
    formas.push(f);
    g.add(malhaDaRampa(r, f));
  }
  const pedra = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
  const borda = new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false });
  for (const p of SURF.plataformas) {
    const min = new THREE.Vector3(p.x - p.lx / 2, p.y - 2, p.z - p.lz / 2);
    const max = new THREE.Vector3(p.x + p.lx / 2, p.y, p.z + p.lz / 2);
    formas.push(planosDaCaixa(min, max));
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.lx, 2, p.lz), pedra);
    m.position.set(p.x, p.y - 1, p.z);
    m.receiveShadow = true;
    const aro = new THREE.Mesh(new THREE.BoxGeometry(p.lx + 0.2, 0.12, p.lz + 0.2), p.fim ? new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false }) : borda);
    aro.position.set(p.x, p.y - 0.05, p.z);
    g.add(m, aro);
    if (p.parede) {
      const pmin = new THREE.Vector3(...p.parede.min);
      const pmax = new THREE.Vector3(...p.parede.max);
      formas.push(planosDaCaixa(pmin, pmax));
      const tam = pmax.clone().sub(pmin);
      const pm = new THREE.Mesh(new THREE.BoxGeometry(tam.x, tam.y, tam.z), new THREE.MeshStandardMaterial({ color: 0x0e7490, transparent: true, opacity: 0.55 }));
      pm.position.copy(pmin).add(pmax).multiplyScalar(0.5);
      g.add(pm);
    }
    const placa = placaTexto(p.fim ? 'FIM' : p.etapa === 0 ? 'SURF — LARGADA' : 'ETAPA 2', p.fim ? '#facc15' : '#22d3ee', 6);
    placa.position.set(p.x, p.y + 4, p.z);
    g.add(placa);
  }
  // placar dos tempos, na largada
  const placar = textura(512, 320, (ctx, w, h, lista) => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#22d3ee';
    ctx.font = FONTE(40);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MELHORES TEMPOS', w / 2, 32);
    ctx.font = FONTE(28, 700);
    (lista || []).slice(0, 7).forEach((e, i) => {
      const y = 82 + i * 34;
      ctx.textAlign = 'left';
      ctx.fillStyle = e.color || '#fff';
      ctx.fillText(`${i + 1}. ${e.name.slice(0, 14)}`, 30, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${e.time.toFixed(2)} s`, w - 30, y);
    });
    if (!lista?.length) {
      ctx.font = FONTE(26, 600);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('ninguém terminou ainda', w / 2, h / 2 + 10);
    }
  });
  const i = SURF.inicio;
  const quadro = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.75), new THREE.MeshBasicMaterial({ map: placar, toneMapped: false, side: THREE.DoubleSide }));
  quadro.position.set(i.x - 5.5, i.y + 2.5, i.z);
  quadro.rotation.y = Math.PI / 2;
  g.add(quadro);
  return { grupo: g, formas, placar };
}

export function construirArena(world) {
  const A = ARENA;
  const g = new THREE.Group();
  world.fora.add(g);
  const caixa = (x0, y0, z0, x1, y1, z1, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set(A.x + (x0 + x1) / 2, A.y + (y0 + y1) / 2, A.z + (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    world.addBox({ min: [A.x + x0, A.y + y0, A.z + z0], max: [A.x + x1, A.y + y1, A.z + z1], mesh: m, blocksCamera: true });
    return m;
  };
  // chão de areia com grade, paredes de concreto e caixotes de madeira
  const areia = textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c9a66b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  });
  areia.wrapS = areia.wrapT = THREE.RepeatWrapping;
  areia.repeat.set(A.lx / 4, A.lz / 4);
  const madeira = textura(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9a6b3c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(w - 5, h - 5);
    ctx.stroke();
  });
  const matChao = new THREE.MeshStandardMaterial({ map: areia, roughness: 1 });
  const matParede = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.9 });
  const matCaixa = new THREE.MeshStandardMaterial({ map: madeira, roughness: 0.8 });
  const matTorre = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
  caixa(-A.lx / 2 - 1, -1.5, -A.lz / 2 - 1, A.lx / 2 + 1, 0, A.lz / 2 + 1, matChao);
  const t = 1;
  caixa(-A.lx / 2 - t, 0, -A.lz / 2 - t, A.lx / 2 + t, A.parede, -A.lz / 2, matParede);
  caixa(-A.lx / 2 - t, 0, A.lz / 2, A.lx / 2 + t, A.parede, A.lz / 2 + t, matParede);
  caixa(-A.lx / 2 - t, 0, -A.lz / 2, -A.lx / 2, A.parede, A.lz / 2, matParede);
  caixa(A.lx / 2, 0, -A.lz / 2, A.lx / 2 + t, A.parede, A.lz / 2, matParede);
  for (const c of A.caixas) {
    const alto = c[4] - c[1];
    const mat = Math.abs(c[0]) <= 7.2 && Math.abs(c[2]) <= 1.3 && alto <= 3.01 ? matTorre : alto <= 1.31 || alto >= 3.9 ? matParede : matCaixa;
    caixa(...c, mat);
  }
  // pedestais das armas
  const itens = A.itens.map((it) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    base.position.set(A.x + it.x, A.y + it.y + 0.1, A.z + it.z);
    const luz = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, toneMapped: false }));
    luz.position.set(A.x + it.x, A.y + it.y + 0.21, A.z + it.z);
    const nome = placaTexto(ARMAS[it.tipo]?.nome || it.tipo, '#facc15', 2.2);
    nome.position.set(A.x + it.x, A.y + it.y + 1.9, A.z + it.z);
    const segura = new THREE.Group();
    segura.position.set(A.x + it.x, A.y + it.y + 1.0, A.z + it.z);
    g.add(base, luz, nome, segura);
    criarArma(it.tipo).then((arma) => {
      arma.scale.multiplyScalar(1.8);
      segura.add(arma);
    }).catch(() => {});
    return { segura, luz, nome };
  });
  // placar de abates, numa das paredes do fundo, virado para dentro
  const placar = textura(512, 384, (ctx, w, h, e) => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ef4444';
    ctx.font = FONTE(42);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`MATA-MATA · até ${A.abates}`, w / 2, 34);
    const lista = [...(e?.jogadores || [])].sort((a, b) => b.abates - a.abates || a.mortes - b.mortes);
    ctx.font = FONTE(28, 700);
    lista.slice(0, 8).forEach((j, i) => {
      const y = 86 + i * 36;
      ctx.textAlign = 'left';
      ctx.fillStyle = j.cor;
      ctx.fillText(`${i + 1}. ${j.nome.slice(0, 14)}`, 26, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${j.abates} / ${j.mortes}`, w - 26, y);
    });
    if (!lista.length) {
      ctx.font = FONTE(26, 600);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('arena vazia', w / 2, h / 2);
    }
  });
  for (const s of [-1, 1]) {
    const quadro = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshBasicMaterial({ map: placar, toneMapped: false }));
    quadro.position.set(A.x + s * (A.lx / 2 - 0.05), A.y + A.parede + 3.2, A.z);
    quadro.rotation.y = -s * Math.PI / 2;
    g.add(quadro);
  }
  return { grupo: g, itens, placar };
}

// ------------------------------------------------------------------ o surf no navegador
const SURF_R = 0.5; // o boneco é uma bola deste raio, em cima dos pés
const GRAV = 16;
const AR_LIMITE = 0.6; // velocidade que o "querer" soma no ar (é o que permite o air strafe)
const AR_ACEL = 150; // sv_airaccelerate dos servidores de surf
const CHAO_ACEL = 10;
const ATRITO = 6;
const ANDAR = 7.5;
const MAX_VEL = 70;

export class Surf {
  // opts: world, player, sfx, toast, ligado(), socket(), aoEntrar(), aoSair()
  constructor(opts) {
    Object.assign(this, opts);
    this.formas = opts.world.ceu.surf.formas;
    this.ativo = false;
    this.chao = false;
    this.ponto = SURF.plataformas[0];
    this.etapa = 0;
    this.inicio = null; // quando largou (performance.now)
    this.terminou = false;
    this.montarHud();
  }

  ligar(socket) {
    socket.on('surf-fim', (m) => {
      this.world.ceu.surf.placar.userData.redesenhar(m.placar);
      if (m.name && this.ativo) this.toast(`${m.name} terminou o surf em ${m.time.toFixed(2)} s${m.recorde ? ' — recorde dele!' : ''}`, 'info', 4000, m.color);
    });
  }

  pertoDoPortal() {
    const p = this.player.pos;
    return !this.ativo && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAIS.surf.x, p.z - PORTAIS.surf.z) < 2.6;
  }

  entrar() {
    if (this.ativo) return;
    this.ativo = true;
    this.aoEntrar?.();
    this.modoAntes = this.player.mode;
    this.player.mode = 'first';
    this.player.fisicaExterna = (dt, f, r) => this.passo(dt, f, r);
    this.ponto = SURF.plataformas[0];
    this.etapa = 0;
    this.inicio = null;
    this.terminou = false;
    this.voltar();
    this.hud.hidden = false;
    this.socket()?.emit('surf-ver', (lista) => this.world.ceu.surf.placar.userData.redesenhar(lista));
    this.sfx.teleport();
    this.toast('Surf: em cima da rampa, segure A ou D para o lado dela (sem W) e deslize. No ar, A ou D com o mouse virando para o mesmo lado ganha velocidade. R volta para a etapa · Esc sai.', 'info', 10000);
  }

  sair() {
    if (!this.ativo) return;
    this.ativo = false;
    this.player.fisicaExterna = null;
    this.player.mode = this.modoAntes || 'third';
    this.hud.hidden = true;
    this.player.teleport([PORTAIS.surf.x - 3, 0, PORTAIS.surf.z], Math.PI / 2);
    this.aoSair?.();
  }

  // de volta para a plataforma da etapa (R, ou caiu)
  voltar() {
    const p = this.ponto;
    const yaw = p.etapa === 1 ? 0 : SURF.inicio.yaw; // etapa 2 desce para -z
    this.player.teleport([p.x, p.y, p.z], yaw);
    this.player.vel.set(0, 0, 0);
    this.chao = true;
    if (p.etapa === 0) {
      this.inicio = null; // na largada o tempo zera
      this.terminou = false;
    }
  }

  // um passo da física de surf (no lugar do passo normal do boneco)
  passo(dt, f, r) {
    const pl = this.player;
    const p = pl.pos;
    const v = pl.vel;
    const pulo = (pl.keys.has('Space') || pl.jumpHeld || pl.jumpBuffer > 0) && !pl.override;
    const sy = Math.sin(pl.yaw);
    const cy = Math.cos(pl.yaw);
    const quer = _a.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    const forca = Math.min(1, quer.length());
    if (forca > 0) quer.normalize();
    if (this.chao && pulo) {
      v.y = 7.2;
      this.chao = false;
      pl.jumpBuffer = 0;
      this.sfx.jump();
    }
    if (this.chao) {
      // atrito e aceleração no chão (plataformas)
      const vel = Math.hypot(v.x, v.z);
      if (vel > 0) {
        const k = Math.max(0, vel - Math.max(vel, 4) * ATRITO * dt) / vel;
        v.x *= k;
        v.z *= k;
      }
      this.acelerar(quer, ANDAR * forca, CHAO_ACEL, dt, ANDAR * forca);
      v.y = Math.min(v.y, 0);
    } else {
      // no ar (e nas rampas, que são "ar" com parede): o air strafe
      this.acelerar(quer, ANDAR * forca, AR_ACEL, dt, Math.min(ANDAR * forca, AR_LIMITE));
      v.y -= GRAV * dt;
    }
    const vel = v.length();
    if (vel > MAX_VEL) v.multiplyScalar(MAX_VEL / vel);
    p.addScaledVector(v, dt);
    // batidas: rampas e plataformas
    const centro = _b.set(p.x, p.y + SURF_R, p.z);
    let chao = false;
    for (let volta = 0; volta < 3; volta++) {
      let bateu = false;
      for (const forma of this.formas) {
        let maior = -Infinity;
        let plano = null;
        for (const pl2 of forma.planos) {
          const d = pl2.n.dot(centro) - pl2.c;
          if (d > maior) {
            maior = d;
            plano = pl2;
          }
          if (maior >= SURF_R) break;
        }
        if (maior >= SURF_R || !plano) continue;
        bateu = true;
        centro.addScaledVector(plano.n, SURF_R - maior);
        const vn = v.dot(plano.n);
        if (vn < 0) v.addScaledVector(plano.n, -vn); // tira só o que vai contra (desliza)
        if (plano.n.y > 0.7) chao = true;
      }
      if (!bateu) break;
    }
    p.set(centro.x, centro.y - SURF_R, centro.z);
    this.chao = chao;
    pl.grounded = chao;
    if (chao) pl.coyote = 0.11;
  }

  // Source: só soma o que falta para chegar em "limite" na direção que se quer; no ar o limite é
  // baixinho, e é isso que deixa ganhar velocidade virando
  acelerar(quer, desejo, acel, dt, limite) {
    if (desejo <= 0) return;
    const v = this.player.vel;
    const atual = v.x * quer.x + v.z * quer.z;
    const falta = limite - atual;
    if (falta <= 0) return;
    const soma = Math.min(acel * desejo * dt, falta);
    v.x += quer.x * soma;
    v.z += quer.z * soma;
  }

  update() {
    if (!this.ativo) return;
    if (!this.ligado()) return this.sair();
    const p = this.player.pos;
    // largou: o tempo começa
    const ini = SURF.plataformas[0];
    if (!this.inicio && (Math.abs(p.x - ini.x) > ini.lx / 2 || Math.abs(p.z - ini.z) > ini.lz / 2 || p.y < ini.y - 1)) this.inicio = performance.now();
    // pisou numa plataforma: etapa nova ou fim
    if (this.chao) {
      for (const pf of SURF.plataformas) {
        if (Math.abs(p.x - pf.x) > pf.lx / 2 || Math.abs(p.z - pf.z) > pf.lz / 2 || Math.abs(p.y - pf.y) > 0.3) continue;
        if (pf.etapa !== undefined && pf.etapa > this.etapa) {
          this.etapa = pf.etapa;
          this.ponto = pf;
          this.sfx.checkpoint();
          this.toast('Etapa 2! R volta para cá.', 'info', 2200);
        }
        if (pf.fim && this.inicio && !this.terminou) {
          this.terminou = true;
          const t = (performance.now() - this.inicio) / 1000;
          this.sfx.finish();
          this.toast(`Terminou em ${t.toFixed(2)} s! Esc volta para o chão, R recomeça.`, 'info', 6000);
          this.socket()?.emit('surf-fim', Math.round(t * 100) / 100);
          this.ponto = SURF.plataformas[0];
          this.etapa = 0;
        }
      }
    }
    // caiu: volta para a plataforma da etapa
    if (p.y < SURF.queda[this.etapa] && !this.terminou) {
      this.voltar();
      this.sfx.fall();
    }
    const t = this.inicio && !this.terminou ? (performance.now() - this.inicio) / 1000 : 0;
    const vel = Math.hypot(this.player.vel.x, this.player.vel.z);
    this.hudTempo.textContent = this.terminou ? 'FIM' : `${t.toFixed(1)} s`;
    this.hudVel.textContent = `${Math.round(vel * 3.6)} km/h`;
  }

  montarHud() {
    this.hud = document.createElement('div');
    this.hud.className = 'ceu-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = '<b>0.0 s</b><span>0 km/h</span><small><kbd>R</kbd> volta · <kbd>Esc</kbd> sai</small>';
    this.hudTempo = this.hud.querySelector('b');
    this.hudVel = this.hud.querySelector('span');
    document.body.appendChild(this.hud);
    estiloHud();
  }
}

function estiloHud() {
  if (document.getElementById('ceu-estilo')) return;
  const css = document.createElement('style');
  css.id = 'ceu-estilo';
  css.textContent = `
.ceu-hud { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 14px; padding: 8px 16px;
  border-radius: 12px; background: rgba(15,23,42,.82); color: #f8fafc; font: 600 14px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; }
.ceu-hud[hidden], #ceu-dica[hidden] { display: none; }
.ceu-hud b { font-size: 22px; font-variant-numeric: tabular-nums; }
.ceu-hud span { color: #22d3ee; font-variant-numeric: tabular-nums; }
.ceu-hud kbd, #ceu-dica kbd { padding: 0 6px; border-radius: 5px; background: rgba(255,255,255,.16); font: inherit; font-weight: 800; }
#ceu-dica { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 30; padding: 10px 16px; border-radius: 12px; background: rgba(15,23,42,.85);
  color: #f8fafc; font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; }
#ceu-dica kbd { background: #22d3ee; color: #0f172a; margin-right: 6px; }`;
  document.head.appendChild(css);
}

// ------------------------------------------------------------------ o mata-mata no navegador
export class MataMata {
  // opts: world, player, sfx, toast, ligado(), socket(), knockedOut() (nocauteado agora),
  // armar(id, tipo|null) (arma na mão do boneco; null: volta à de sempre), eu()
  constructor(opts) {
    Object.assign(this, opts);
    this.a3d = opts.world.ceu.arena;
    this.ativo = false;
    this.arma = null; // a minha arma na arena
    this.estado = null;
    this.armados = new Set(); // ids com arma da arena na mão
    this.pediu = new Map(); // item -> quando pedi
    this.estavaKo = false;
    this.foraDesde = 0;
    this.montarHud();
  }

  ligar(socket) {
    socket.on('mm-estado', (e) => this.recebeu(e));
  }

  ver() {
    this.socket()?.emit('mm-ver', (e) => this.recebeu(e));
  }

  pertoDoPortal() {
    const p = this.player.pos;
    return !this.ativo && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAIS.matamata.x, p.z - PORTAIS.matamata.z) < 2.6;
  }

  entrar() {
    if (this.ativo) return;
    this.socket()?.emit('mm-entrar', (r) => {
      if (!r?.ok) {
        this.toast('O mata-mata está desligado nesta sala.', 'info', 2600);
        return;
      }
      this.ativo = true;
      this.arma = ARENA.inicial;
      this.nascer();
      this.hud.hidden = false;
      this.sfx.teleport();
      this.toast('Mata-mata: pegue as armas do chão passando por cima. Clique ou X atira, F soca. Esc sai.', 'info', 7000);
    });
  }

  sair(avisar = true) {
    if (!this.ativo) return;
    this.ativo = false;
    this.arma = null;
    if (avisar) this.socket()?.emit('mm-sair');
    this.hud.hidden = true;
    this.armar(this.eu(), null);
    if (naArena(this.player.pos)) this.player.teleport([PORTAIS.matamata.x + 3, 0, PORTAIS.matamata.z], -Math.PI / 2);
  }

  nascer() {
    const [x, y, z] = ARENA.nascer[Math.floor(Math.random() * ARENA.nascer.length)];
    // de frente para o meio
    const yaw = Math.atan2(x, z);
    this.player.teleport([ARENA.x + x, ARENA.y + y, ARENA.z + z], yaw);
    this.player.vel.set(0, 0, 0);
  }

  recebeu(e) {
    this.estado = e;
    const lista = e?.jogadores || [];
    const ids = new Set(lista.map((j) => j.id));
    // armas na mão de quem está na arena (e de volta à de sempre para quem saiu)
    for (const j of lista) this.armar(j.id, j.arma);
    for (const id of this.armados) if (!ids.has(id)) this.armar(id, null);
    this.armados = ids;
    const eu = lista.find((j) => j.id === this.eu());
    if (this.ativo && !eu) this.sair(false); // o servidor tirou (desligado, reconexão)
    if (eu && eu.arma !== this.arma) {
      if (this.ativo && eu.arma !== ARENA.inicial) {
        this.toast(`Pegou: ${ARMAS[eu.arma]?.nome || eu.arma}`, 'info', 1600);
        this.sfx.checkpoint();
      }
      this.arma = eu.arma;
    }
    if (e?.vencedor && !this.vencedorAntes && this.ativo) {
      this.toast(`${e.vencedor.nome} venceu a rodada! Placar zerando…`, 'info', 6000, e.vencedor.cor);
      this.sfx.finish();
    }
    this.vencedorAntes = !!e?.vencedor;
    this.a3d.placar.userData.redesenhar(e);
    if (eu) this.hudPlacar.textContent = `${eu.abates} abates · ${eu.mortes} mortes`;
  }

  update(dt) {
    const agora = performance.now();
    // as armas do chão giram; some a que foi pega (volta sozinha)
    this.a3d.itens.forEach((it, i) => {
      const fora = (this.estado?.itens?.[i] ?? 0) > 0;
      it.segura.visible = !fora;
      it.luz.material.opacity = fora ? 0.12 : 0.6;
      it.segura.rotation.y += dt * 1.6;
      it.segura.position.y = ARENA.y + ARENA.itens[i].y + 1.0 + Math.sin(agora / 400 + i) * 0.08;
    });
    if (!this.ativo) return;
    if (!this.ligado()) return this.sair();
    const p = this.player.pos;
    // saiu da arena por outro caminho (R, teleporte): sai do jogo
    if (!naArena(p)) {
      this.foraDesde ||= agora;
      if (agora - this.foraDesde > 1500) this.sair();
      return;
    }
    this.foraDesde = 0;
    // caiu da arena (não deveria, com as paredes): nasce de novo
    if (p.y < ARENA.y - 20) this.nascer();
    // voltou do nocaute: nasce num canto
    const ko = this.knockedOut();
    if (this.estavaKo && !ko) this.nascer();
    this.estavaKo = ko;
    if (ko) return;
    // passou por cima de uma arma: pega
    ARENA.itens.forEach((it, i) => {
      if ((this.estado?.itens?.[i] ?? 0) > 0 || it.tipo === this.arma) return;
      if (Math.hypot(p.x - (ARENA.x + it.x), p.z - (ARENA.z + it.z)) > 1.3 || Math.abs(p.y - (ARENA.y + it.y)) > 1.5) return;
      if (agora - (this.pediu.get(i) || 0) < 1000) return;
      this.pediu.set(i, agora);
      this.socket()?.emit('mm-pegar', i);
    });
    this.hudArma.textContent = ARMAS[this.arma]?.nome || '';
  }

  montarHud() {
    this.hud = document.createElement('div');
    this.hud.className = 'ceu-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = '<b>Pistola</b><span>0 abates</span><small><kbd>Esc</kbd> sai</small>';
    this.hudArma = this.hud.querySelector('b');
    this.hudPlacar = this.hud.querySelector('span');
    document.body.appendChild(this.hud);
    estiloHud();
  }
}

// a dica do E nos portais
export function dicaDoPortal(texto) {
  let el = document.getElementById('ceu-dica');
  if (!el) {
    estiloHud();
    el = document.createElement('div');
    el.id = 'ceu-dica';
    el.hidden = true;
    document.body.appendChild(el);
  }
  const html = texto ? `<kbd>E</kbd>${texto}` : '';
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = !texto;
}
