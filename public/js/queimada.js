// Queimada na quadra do parque. E no círculo da entrada põe você no time com menos gente; o campo
// de cada time é uma metade da quadra (não dá para passar do meio). Passou perto da bola do seu lado,
// pega; segurando o clique (ou F) carrega o arremesso e, soltando, ela vai para onde a câmera olha.
// Bola que acerta alguém do outro time sem tocar no chão queima: ele vai para o cemitério, a volta
// do campo de vocês, e de lá ainda pode pegar a bola — queimando alguém, volta. Sem a bola, o clique
// é a defesa: por um instante, a bola que chegar é pega em vez de queimar. Time sem ninguém em campo
// perde a rodada. O servidor (queimada-servidor.js) manda na bola e em quem foi queimado.
import * as THREE from 'three';
import {
  QUEIMADA, TIMES_QUEIMADA as TIMES, AREA_QUEIMADA, zonaQueimada, prenderNaZona, lugarNaZona, naZona, andarQueimada,
} from './queimada-fisica.js';
import { hud, texturaViva, FONTE, painelDuasFaces } from './hud-jogos.js';

const Q = QUEIMADA;
const A = AREA_QUEIMADA;
const ENTRADA = { x: Q.cx, z: A.z0 - 2 }; // círculo de entrar, na beira da Rua dos Esportes
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ------------------------------------------------------------------ a quadra (parte do mundo)
export function construirQueimada(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const W = A.x1 - A.x0;
  const D = A.z1 - A.z0;
  const px = 16; // pixels por metro
  const chao = texturaViva(THREE, Math.round(W * px), Math.round(D * px), (ctx, w, h) => {
    const X = (x) => (x - A.x0) * px;
    const Z = (z) => (A.z1 - z) * px; // o norte em cima
    ctx.fillStyle = '#c9a16b';
    ctx.fillRect(0, 0, w, h);
    // os cemitérios: em volta do campo do outro time, na cor de quem vai para lá
    for (const t of [0, 1]) {
      const z = zonaQueimada(t, false);
      ctx.fillStyle = t === 0 ? 'rgba(59,130,246,0.22)' : 'rgba(239,68,68,0.22)';
      ctx.fillRect(X(z.x0), Z(z.z1), (z.x1 - z.x0) * px, (z.z1 - z.z0) * px);
    }
    // os dois campos
    for (const t of [0, 1]) {
      const z = zonaQueimada(t, true);
      ctx.fillStyle = t === 0 ? '#3b6fd6' : '#d64545';
      ctx.fillRect(X(z.x0), Z(z.z1), (z.x1 - z.x0) * px, (z.z1 - z.z0) * px);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(X(Q.cx - Q.comp / 2), Z(Q.cz + Q.larg / 2), Q.comp * px, Q.larg * px);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(X(Q.cx), Z(Q.cz + Q.larg / 2));
    ctx.lineTo(X(Q.cx), Z(Q.cz - Q.larg / 2));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = FONTE(34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [t, x] of [[0, Q.cx + Q.comp / 2 + Q.cemiterio / 2], [1, Q.cx - Q.comp / 2 - Q.cemiterio / 2]]) {
      ctx.save();
      ctx.translate(X(x), Z(Q.cz));
      ctx.rotate(t === 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = t === 0 ? '#1e3a8a' : '#7f1d1d';
      ctx.fillText(`CEMITÉRIO ${TIMES[t].nome.toUpperCase()}`, 0, 0);
      ctx.restore();
    }
  });
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chao, roughness: 0.95 }));
  piso.position.set((A.x0 + A.x1) / 2, 0.04, (A.z0 + A.z1) / 2);
  piso.receiveShadow = true;
  g.add(piso);
  // o círculo de entrar
  const entrada = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  entrada.position.set(ENTRADA.x, 0.07, ENTRADA.z);
  g.add(entrada);
  // traves nos quatro cantos (só enfeite: não seguram ninguém)
  const ferro = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.4, roughness: 0.4 });
  for (const [x, z] of [[A.x0, A.z0], [A.x1, A.z0], [A.x0, A.z1], [A.x1, A.z1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), ferro);
    p.position.set(x, 0.7, z);
    g.add(p);
  }
  const placar = texturaViva(THREE, 640, 240, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
  painelDuasFaces(THREE, g, placar, 4.4, 1.65, Q.cx, 3.2, A.z1 + 1.6, 0);
  return { grupo: g, placar };
}

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f97316';
  ctx.font = FONTE(46);
  ctx.fillText('QUEIMADA', w / 2, 38);
  if (!e?.jogadores?.length) {
    ctx.font = FONTE(26, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('aperte E no círculo laranja para jogar', w / 2, h / 2 + 30);
    return;
  }
  for (const t of [0, 1]) {
    const x = t === 0 ? w * 0.25 : w * 0.75;
    const lista = e.jogadores.filter((j) => j.time === t);
    const vivos = lista.filter((j) => j.vivo).length;
    ctx.fillStyle = TIMES[t].cor;
    ctx.font = FONTE(30, 800);
    ctx.fillText(TIMES[t].nome, x, 92);
    ctx.font = FONTE(64);
    ctx.fillText(`${vivos}/${lista.length}`, x, 152);
    ctx.font = FONTE(20, 600);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`em campo · ${e.placar[t]} ${e.placar[t] === 1 ? 'rodada' : 'rodadas'}`, x, 206);
  }
}

// ------------------------------------------------------------------ o jogo no navegador
export class Queimada {
  // opts: world, player, sfx, ligado(), posDe(id), yawDe(id)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'queimada';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.queimada3d;
    this.e = null;
    this.dono = null;
    this.bola = { p: new THREE.Vector3(Q.cx, Q.raio, Q.cz), v: new THREE.Vector3() };
    this.malha = new THREE.Mesh(new THREE.SphereGeometry(Q.raio, 22, 14), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, emissive: 0x3d2a00, emissiveIntensity: 0.3 }));
    this.malha.castShadow = true;
    this.g3d.grupo.add(this.malha);
    // o escudo da defesa (aparece em quem está defendendo: só o seu, que é o que importa)
    this.escudo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8, toneMapped: false }));
    this.escudo.visible = false;
    this.g3d.grupo.add(this.escudo);
    this.defendendo = 0;
    this.recargaDefesa = 0;
    this.carga = null;
    this.pediu = 0;
    this.largouEm = -1e9;
    this.mostrouPlacar = false;
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('qm-estado', (e) => this.estado(e));
    socket.on('qm-bola', (a) => this.recebeuBola(a));
    socket.on('qm-queimado', (m) => {
      if (m.id === this.eu) {
        hud.mensagem('QUEIMADO!', m.por ? `por ${m.por} · do cemitério, queime alguém para voltar` : 'do cemitério, queime alguém para voltar', 2800, '#ef4444');
        this.sfx.punchTaken();
        this.irPara(false);
      } else if (this.perto(30)) {
        hud.mensagem(`${m.nome} queimado!`, m.por ? `por ${m.por}` : '', 1500, '#fb923c');
        this.sfx.punchHit();
      }
    });
    socket.on('qm-voltou', (m) => {
      if (m.id !== this.eu) return;
      hud.mensagem('De volta ao campo!', '', 1800, '#4ade80');
      this.sfx.checkpoint();
      this.irPara(true);
    });
    socket.on('qm-defendeu', (m) => {
      if (this.perto(30)) hud.mensagem('DEFENDEU!', m.nome, 1300, '#67e8f9');
      if (m.id === this.eu) this.sfx.checkpoint();
    });
    socket.on('qm-recomecar', () => {
      if (this.meu()) this.irPara(true);
    });
  }

  ver() {
    this.socket?.emit('qm-ver', (r) => {
      if (!r) return;
      this.estado(r.estado);
      this.recebeuBola(r.bola);
    });
  }

  meu() {
    return this.e?.jogadores.find((j) => j.id === this.eu) || null;
  }

  // para a voz separada por jogo (main.js): os dois times são uma partida só
  partida(id) {
    return this.e?.jogadores.some((j) => j.id === id) ? 'queimada' : null;
  }

  perto(raio) {
    const p = this.player.pos;
    return Math.hypot(p.x - Q.cx, p.z - Q.cz) < raio;
  }

  // para o campo (vivo) ou para o cemitério do meu time
  irPara(vivo) {
    const eu = this.meu();
    if (!eu) return;
    const l = lugarNaZona(zonaQueimada(eu.time, vivo));
    // de frente para o meio da quadra
    this.player.teleport([l.x, 0, l.z], Math.atan2(l.x - Q.cx, l.z - Q.cz));
  }

  estado(e) {
    const antes = this.e;
    this.e = e;
    this.g3d.placar.userData.redesenhar(e);
    if (e.fase === 'fim' && antes?.fase !== 'fim' && this.perto(40)) {
      const t = e.vencedor;
      hud.mensagem(`${TIMES[t].nome} venceu a rodada!`, 'Rodada nova já já', 4500, TIMES[t].cor);
      this.sfx.finish();
    }
  }

  recebeuBola(a) {
    if (!Array.isArray(a)) return;
    const [x, y, z, vx, vy, vz, dono] = a;
    const antes = this.dono;
    this.dono = dono;
    if (dono === this.eu && antes !== this.eu) {
      hud.mensagem('Bola com você', 'Segure o clique e solte para arremessar', 1600, '#facc15');
      this.sfx.message();
    }
    if (dono !== this.eu && this.carga) this.carga = null;
    if (dono) return;
    // a minha bola acabou de sair da mão: a minha previsão vale até o servidor alcançar
    if (performance.now() - this.largouEm < 250) return;
    const s = { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz) };
    andarQueimada(s, 0.05);
    if (s.p.distanceTo(this.bola.p) > 2.5 || antes) this.bola.p.copy(s.p);
    else this.bola.p.lerp(s.p, 0.4);
    this.bola.v.copy(s.v);
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt, t) {
    const eu = this.meu();
    const pl = this.player;
    // a bola: na mão de alguém (na frente do peito) ou solta, prevista
    if (this.dono) {
      const meu = this.dono === this.eu;
      const pos = meu ? pl.pos : this.posDe(this.dono);
      if (pos) {
        const yaw = meu ? pl.bodyYaw : this.yawDe(this.dono) ?? 0;
        const y = meu && this.carga ? 1.9 : 1.25;
        this.bola.p.set(pos.x + Math.sin(yaw) * 0.5, pos.y + y, pos.z + Math.cos(yaw) * 0.5);
        this.bola.v.set(0, 0, 0);
      }
    } else if (this.e) {
      andarQueimada(this.bola, dt);
    }
    this.malha.position.copy(this.bola.p);
    const vh = Math.hypot(this.bola.v.x, this.bola.v.z);
    if (vh > 0.1) this.malha.rotateOnWorldAxis(_a.set(this.bola.v.z / vh, 0, -this.bola.v.x / vh), (vh * dt) / Q.raio);
    this.malha.visible = !!this.e?.jogadores.length;

    // a defesa: o anel em volta de mim
    this.defendendo = Math.max(0, this.defendendo - dt);
    this.recargaDefesa = Math.max(0, this.recargaDefesa - dt);
    this.escudo.visible = this.defendendo > 0;
    if (this.escudo.visible) {
      this.escudo.position.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
      this.escudo.rotation.set(Math.PI / 2, 0, t * 6);
    }

    if (!eu || !this.ligado()) {
      if (this.mostrouPlacar) {
        this.mostrouPlacar = false;
        hud.placar('');
        hud.forca(null);
      }
      if (eu && !this.ligado()) this.socket?.emit('qm-sair');
      return;
    }
    // longe da quadra (teleporte, painel): sai do jogo; perto, fica dentro da sua zona
    const p = pl.pos;
    if (p.x < A.x0 - 8 || p.x > A.x1 + 8 || p.z < A.z0 - 8 || p.z > A.z1 + 8 || p.y > 8) {
      this.socket?.emit('qm-sair');
      this.e = { ...this.e, jogadores: this.e.jogadores.filter((j) => j.id !== this.eu) };
      return;
    }
    const zona = zonaQueimada(eu.time, eu.vivo);
    const antes = _b.copy(p);
    prenderNaZona(p, zona);
    if (p.x !== antes.x) pl.vel.x = 0;
    if (p.z !== antes.z) pl.vel.z = 0;

    // passou perto da bola solta da sua zona: pega
    const agora = performance.now();
    const b = this.bola.p;
    if (!this.dono && this.e.fase === 'jogo' && agora - this.pediu > 400 && agora - this.largouEm > 600
      && Math.hypot(b.x - p.x, b.z - p.z) < 1.1 && b.y < p.y + 2.4 && naZona(b, zona, 0.8)) {
      this.pediu = agora;
      this.socket?.emit('qm-pegar');
    }
    // a força do arremesso enquanto segura o clique
    hud.forca(this.carga ? this.valorCarga() : null, '#f97316');
    const vivos = (time) => this.e.jogadores.filter((j) => j.time === time && j.vivo).length;
    hud.placar(`<b style="color:${TIMES[0].cor}">${vivos(0)}</b><small>Azul</small> · <small>Vermelho</small><b style="color:${TIMES[1].cor}">${vivos(1)}</b>`
      + ` <small>· você: ${eu.vivo ? 'em campo' : 'no cemitério'} · E sai</small>`);
    this.mostrouPlacar = true;
  }

  valorCarga() {
    return Math.min(1, (performance.now() - this.carga.desde) / 900);
  }

  // ---------------------------------------------------------------- teclas
  pertoDaEntrada() {
    const p = this.player.pos;
    return Math.hypot(p.x - ENTRADA.x, p.z - ENTRADA.z) < 2.2 && p.y < 2;
  }

  usarE() {
    if (!this.ligado()) return false;
    if (this.meu()) {
      this.socket?.emit('qm-sair');
      this.player.teleport([ENTRADA.x + 2.5, 0, ENTRADA.z - 1], Math.PI);
      hud.mensagem('Saiu da queimada', '', 1200);
      return true;
    }
    if (!this.pertoDaEntrada()) return false;
    this.socket?.emit('qm-entrar', {}, (r) => {
      if (!r?.ok) return;
      // o estado com o meu nome chega logo; o time já veio na resposta
      const t = r.time;
      const l = lugarNaZona(zonaQueimada(t, true));
      this.player.teleport([l.x, 0, l.z], Math.atan2(l.x - Q.cx, l.z - Q.cz));
      hud.mensagem(`Time ${TIMES[t].nome}`, 'Pegue a bola do seu lado · segure o clique e solte para arremessar · sem bola, o clique defende', 4200, TIMES[t].cor);
      this.sfx.teleport();
    });
    return true;
  }

  // clique (ou F): com a bola, começa a carregar; sem ela, defende
  apertou() {
    const eu = this.meu();
    if (!eu || !this.ligado()) return false;
    if (this.dono === this.eu) {
      this.carga = { desde: performance.now() };
      return true;
    }
    if (this.recargaDefesa <= 0) {
      this.recargaDefesa = Q.recargaDefesa / 1000;
      this.defendendo = Q.defesa / 1000;
      this.socket?.emit('qm-defender');
    }
    return true;
  }

  soltou() {
    if (!this.carga) return;
    const forca = THREE.MathUtils.lerp(Q.forca[0], Q.forca[1], this.valorCarga());
    this.carga = null;
    if (this.dono !== this.eu) return;
    const pl = this.player;
    const olhar = pl.lookDirection(_a);
    const h = _b.set(olhar.x, 0, olhar.z);
    if (h.lengthSq() < 1e-4) h.set(0, 0, 1);
    h.normalize();
    const mao = new THREE.Vector3(pl.pos.x + h.x * 0.6, pl.pos.y + 1.7, pl.pos.z + h.z * 0.6);
    const v = olhar.clone().multiplyScalar(forca);
    v.y += 1.5;
    this.bola.p.copy(mao);
    this.bola.v.copy(v);
    this.dono = null;
    this.largouEm = performance.now();
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.emit('qm-lancar', { p: [a(mao.x), a(mao.y), a(mao.z)], v: [a(v.x), a(v.y), a(v.z)] });
    this.sfx.jump();
  }

  ativo() {
    return this.ligado() && !!this.meu();
  }

  dica(livre) {
    if (!livre || !this.ligado()) return '';
    const eu = this.meu();
    if (eu) {
      if (this.dono === this.eu) return '<kbd>Clique</kbd>Segure e solte para arremessar (mire com a câmera)';
      return `Pegue a bola do seu lado · <kbd>Clique</kbd>defender · <kbd>E</kbd>sair`;
    }
    return this.pertoDaEntrada() ? '<kbd>E</kbd>Jogar queimada' : '';
  }

  lugar() {
    return { nome: 'Queimada', desc: 'Quadra do parque · times Azul × Vermelho', cor: '#f97316', pos: [ENTRADA.x, 0, ENTRADA.z - 1.5], yaw: Math.PI };
  }
}
