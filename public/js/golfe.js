// Minigolfe no parque: 9 buracos, cada um com a sua bolinha (as dos outros aparecem também, na cor
// de cada um). E na placa da entrada começa a partida; perto da bolinha, a câmera mira, segurar o
// clique (ou F) dá a força e soltar é a tacada. E, durante a partida, leva até a sua bolinha. Água
// ou fora da pista: volta para onde estava, com uma tacada a mais; 8 tacadas no máximo por buraco.
// A física é do navegador (golfe-dados.js); o servidor (golfe-servidor.js) conta as tacadas, mostra
// as bolinhas para os outros e dá as moedas de quem termina.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GOLFE, BURACOS, PAR_TOTAL, ENTRADA_GOLFE, andarGolfe, dentroDoBuraco, giroDoMoinho } from './golfe-dados.js';
import { hud, texturaViva, FONTE, painelDuasFaces, vaiEVolta } from './hud-jogos.js';

const G = GOLFE;
const Y = G.y;
const _a = new THREE.Vector3();
const agoraS = () => Date.now() / 1000; // o moinho gira igual para todo mundo

function gramado() {
  return texturaViva(THREE, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2f9e4f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, (i * h) / 8, w, h / 8);
    }
  });
}

// ------------------------------------------------------------------ o campo (parte do mundo)
export function construirGolfe(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const grama = gramado();
  grama.wrapS = grama.wrapT = THREE.RepeatWrapping;
  grama.repeat.set(0.5, 0.5);
  const matGrama = new THREE.MeshStandardMaterial({ map: grama, roughness: 0.95 });
  const matParede = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75 });
  const matAgua = new THREE.MeshStandardMaterial({ color: 0x2b8fd6, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 });
  const matMorro = new THREE.MeshStandardMaterial({ color: 0x3fb862, roughness: 0.9 });
  const matPoste = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
  const preto = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
  const paredes = [];
  const moinhos = [];
  for (const h of BURACOS) {
    // o gramado no formato da pista
    const forma = new THREE.Shape(h.contorno.map((p) => new THREE.Vector2(p.x, -p.z)));
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(forma).rotateX(-Math.PI / 2).translate(0, Y, 0), matGrama);
    piso.receiveShadow = true;
    g.add(piso);
    // as paredes do contorno ficam por fora da pista; as do meio, em cima da linha
    let area = 0;
    for (let i = 0, c = h.contorno; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      area += a.x * b.z - b.x * a.z;
    }
    const nContorno = h.contorno.length;
    h.segmentos.forEach(([a, b], k) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      let ox = 0;
      let oz = 0;
      if (k < nContorno) {
        const s = area > 0 ? 1 : -1;
        ox = (s * dz / L) * 0.08;
        oz = (-s * dx / L) * 0.08;
      }
      const geo = new THREE.BoxGeometry(L + 0.16, 0.22, 0.16);
      geo.rotateY(-Math.atan2(dz, dx));
      geo.translate((a.x + b.x) / 2 + ox, Y + 0.11, (a.z + b.z) / 2 + oz);
      paredes.push(geo);
    });
    for (const w of h.agua) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0).rotateX(-Math.PI / 2), matAgua);
      m.position.set((w.x0 + w.x1) / 2, Y + 0.008, (w.z0 + w.z1) / 2);
      g.add(m);
    }
    for (const m of h.morros) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(m.r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), matMorro);
      s.scale.y = 0.22;
      s.position.set(m.x, Y, m.z);
      s.receiveShadow = true;
      g.add(s);
    }
    for (const q of h.postes) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(q.r, q.r, 0.5, 16), matPoste);
      p.position.set(q.x, Y + 0.25, q.z);
      p.castShadow = true;
      g.add(p);
    }
    // o copo com a bandeira (o mastro não segura a bola: é só para ver de longe)
    const copo = new THREE.Mesh(new THREE.CircleGeometry(G.copo, 24).rotateX(-Math.PI / 2), preto);
    copo.position.set(h.copo.x, Y + 0.004, h.copo.z);
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
    mastro.position.set(h.copo.x, Y + 0.8, h.copo.z);
    const bandeira = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: texturaViva(THREE, 96, 64, (ctx, w, hh) => {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#111827';
      ctx.font = FONTE(44);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.n), w / 2, hh / 2 + 2);
    }) }));
    bandeira.position.set(h.copo.x + 0.31, Y + 1.4, h.copo.z);
    g.add(copo, mastro, bandeira);
    // o tee e a plaquinha do buraco
    const tee = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
    tee.position.set(h.tee.x, Y + 0.005, h.tee.z);
    g.add(tee);
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: texturaViva(THREE, 320, 100, (ctx, w, hh) => {
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#f0fdf4';
      ctx.font = FONTE(34);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${h.n} · ${h.nome}`, w / 2, 36);
      ctx.font = FONTE(24, 600);
      ctx.fillStyle = '#bbf7d0';
      ctx.fillText(`par ${h.par}`, w / 2, 76);
    }) }));
    const xs = h.contorno.map((p) => p.x);
    placa.position.set(Math.min(...xs) - 0.7, 1.1, h.tee.z + 0.3);
    placa.rotation.y = Math.PI;
    g.add(placa);
    // o moinho: prédio em cima dos blocos, com o túnel embaixo e as pás na frente
    if (h.moinho) {
      const M = h.moinho;
      const larg = M.u1 - M.u0;
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(larg, 2.3, M.prof), new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 }));
      corpo.position.set(M.x, Y + 0.6 + 1.15, M.z + M.prof / 2);
      const telhado = new THREE.Mesh(new THREE.ConeGeometry(larg * 0.75, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 }));
      telhado.rotation.y = Math.PI / 4;
      telhado.position.set(M.x, Y + 2.9 + 0.65, M.z + M.prof / 2);
      for (const [a, b] of [[M.u0, M.x - M.tunel / 2], [M.x + M.tunel / 2, M.u1]]) {
        const bloco = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.6, M.prof), new THREE.MeshStandardMaterial({ color: 0xe7dcc7, roughness: 0.8 }));
        bloco.position.set((a + b) / 2, Y + 0.3, M.z + M.prof / 2);
        g.add(bloco);
      }
      corpo.castShadow = telhado.castShadow = true;
      g.add(corpo, telhado);
      const helice = new THREE.Group();
      helice.position.set(M.x, Y + 2.2, M.z - 0.08);
      const madeira = new THREE.MeshStandardMaterial({ color: 0x7c4a1e, roughness: 0.7 });
      for (let k = 0; k < M.pas; k++) {
        const pa = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.1, 0.05).translate(0, 1.05, 0), madeira);
        pa.rotation.z = (k * Math.PI * 2) / M.pas;
        helice.add(pa);
      }
      g.add(helice);
      moinhos.push({ helice, M });
    }
  }
  // as paredes de todos os buracos numa malha só (um desenho)
  const muros = new THREE.Mesh(mergeGeometries(paredes), matParede);
  for (const p of paredes) p.dispose();
  muros.castShadow = true;
  muros.receiveShadow = true;
  g.add(muros);
  // a placa da entrada, com o placar
  const placar = texturaViva(THREE, 512, 320, (ctx, w, hh, e) => desenharPlacar(ctx, w, hh, e));
  painelDuasFaces(THREE, g, placar, 3.2, 2.0, ENTRADA_GOLFE.x + 0.4, 2.2, ENTRADA_GOLFE.z + 1.6, Math.PI / 2);
  const chao = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
  chao.position.set(ENTRADA_GOLFE.x, 0.06, ENTRADA_GOLFE.z);
  g.add(chao);
  return { grupo: g, placar, moinhos };
}

const somaDe = (lista) => lista.reduce((s, n) => s + n, 0);
const parAte = (n) => BURACOS.slice(0, n).reduce((s, b) => s + b.par, 0);

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4ade80';
  ctx.font = FONTE(44);
  ctx.fillText('MINIGOLFE', w / 2, 36);
  const lista = e?.jogadores || [];
  if (!lista.length) {
    ctx.font = FONTE(24, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`9 buracos · par ${PAR_TOTAL}`, w / 2, 100);
    ctx.fillText('aperte E no círculo verde para jogar', w / 2, 140);
  }
  ctx.font = FONTE(24, 700);
  lista.slice(0, 5).forEach((j, k) => {
    const y = 88 + k * 34;
    const total = somaDe(j.tacadas);
    const dif = total - parAte(j.tacadas.length);
    ctx.textAlign = 'left';
    ctx.fillStyle = j.cor;
    ctx.fillText(j.nome.slice(0, 13), 22, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${j.fim ? 'fim' : `buraco ${j.buraco + 1}`} · ${total}${j.tacadas.length ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}`, w - 22, y);
  });
  if (e?.recordes?.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = FONTE(20, 700);
    const r = e.recordes[0];
    ctx.fillText(`melhor: ${r.nome.slice(0, 14)} · ${r.total} tacadas`, w / 2, h - 24);
  }
}

// ------------------------------------------------------------------ o jogo no navegador
export class Golfe {
  // opts: world, player, sfx, ligado(), posDe(id)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'golfe';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.golfe3d;
    this.e = null;
    this.bola = { p: { x: 0, z: 0 }, v: { x: 0, z: 0 } };
    this.rolando = false;
    this.noCopo = false; // caiu: espera um pouco e vai para o próximo buraco
    this.ultima = { x: 0, z: 0 };
    this.carga = null;
    this.envio = 0;
    this.malha = this.malhaBola('#ffffff');
    this.malha.visible = false;
    this.outras = new Map(); // id -> { malha, alvo }
    // a seta da tacada, no chão
    const seta = new THREE.Shape([new THREE.Vector2(0, -0.05), new THREE.Vector2(0.85, -0.05), new THREE.Vector2(0.85, -0.13), new THREE.Vector2(1, 0), new THREE.Vector2(0.85, 0.13), new THREE.Vector2(0.85, 0.05), new THREE.Vector2(0, 0.05)]);
    this.seta = new THREE.Mesh(new THREE.ShapeGeometry(seta).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.seta.visible = false;
    this.g3d.grupo.add(this.seta);
  }

  malhaBola(cor) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(G.raio, 16, 10), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.35, emissive: cor, emissiveIntensity: 0.15 }));
    m.castShadow = true;
    this.g3d.grupo.add(m);
    return m;
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('gf-estado', (e) => this.estado(e));
    socket.on('gf-bola', ({ id, x, z }) => {
      const j = this.e?.jogadores.find((k) => k.id === id);
      if (!j) return;
      let o = this.outras.get(id);
      if (!o) {
        o = { malha: this.malhaBola(j.cor), alvo: new THREE.Vector3(x, Y + G.raio, z) };
        o.malha.position.copy(o.alvo);
        this.outras.set(id, o);
      }
      o.alvo.set(x, Y + G.raio, z);
    });
    socket.on('gf-saiu', (id) => this.tirarOutra(id));
    socket.on('gf-fim', (m) => {
      if (m.id === this.eu) {
        const dif = m.total - m.par;
        hud.mensagem('Fim do minigolfe!', `${m.total} tacadas (${dif > 0 ? '+' : ''}${dif} do par)`, 6000, '#facc15');
        this.sfx.finish();
      }
    });
  }

  ver() {
    this.socket?.emit('gf-ver', (e) => e && this.estado(e));
  }

  tirarOutra(id) {
    const o = this.outras.get(id);
    if (!o) return;
    o.malha.removeFromParent();
    o.malha.geometry.dispose();
    o.malha.material.dispose();
    this.outras.delete(id);
  }

  meu() {
    return this.e?.jogadores.find((j) => j.id === this.eu) || null;
  }

  estado(e) {
    this.e = e;
    this.g3d.placar.userData.redesenhar(e);
    for (const id of [...this.outras.keys()]) if (!e.jogadores.some((j) => j.id === id && !j.fim)) this.tirarOutra(id);
    const eu = this.meu();
    if (!eu && this.malha.visible) {
      this.malha.visible = false;
      this.rolando = false;
      hud.placar('');
    }
  }

  buracoAtual() {
    const eu = this.meu();
    return eu && !eu.fim ? BURACOS[eu.buraco] : null;
  }

  // a bolinha no tee do buraco, e o boneco atrás dela olhando para o copo
  noTee(h) {
    this.bola.p = { x: h.tee.x, z: h.tee.z };
    this.bola.v = { x: 0, z: 0 };
    this.rolando = false;
    this.noCopo = false;
    this.malha.visible = true;
    this.irParaBola();
    this.mandarBola(true);
  }

  irParaBola() {
    const h = this.buracoAtual();
    if (!h) return;
    const b = this.bola.p;
    let dx = h.copo.x - b.x;
    let dz = h.copo.z - b.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.player.teleport([b.x - dx * 1.3, 0, b.z - dz * 1.3], Math.atan2(-dx, -dz));
  }

  mandarBola(ja = false) {
    if (!ja && performance.now() - this.envio < 100) return;
    this.envio = performance.now();
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.volatile.emit('gf-bola', [a(this.bola.p.x), a(this.bola.p.z)]);
  }

  naArea(folga = 10) {
    const p = this.player.pos;
    const xs = BURACOS.flatMap((h) => h.contorno.map((c) => c.x));
    const zs = BURACOS.flatMap((h) => h.contorno.map((c) => c.z));
    return p.x > Math.min(...xs) - folga && p.x < Math.max(...xs) + folga && p.z > Math.min(...zs) - folga && p.z < Math.max(...zs) + folga;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt) {
    const T = agoraS();
    for (const { helice, M } of this.g3d.moinhos) helice.rotation.z = -giroDoMoinho(M, T);
    for (const o of this.outras.values()) o.malha.position.lerp(o.alvo, Math.min(1, dt * 10));
    const eu = this.meu();
    const h = this.buracoAtual();
    if (!eu || !h || !this.ligado()) {
      this.seta.visible = false;
      if (this.carga) this.carga = null;
      if (this.mostrandoForca) {
        hud.forca(null);
        this.mostrandoForca = false;
      }
      if (eu && !this.ligado()) this.socket?.emit('gf-sair');
      return;
    }
    const b = this.bola;
    if (this.rolando) {
      const r = andarGolfe(b, h, dt, T);
      if (r === 'bateu') this.sfx.dado(0.6);
      if (r === 'dentro') this.caiu(h, eu);
      else if (r === 'agua' || !dentroDoBuraco(h, b.p.x, b.p.z)) {
        hud.mensagem(r === 'agua' ? 'Na água!' : 'Fora da pista!', 'Volta para onde estava · +1 tacada', 1800, '#38bdf8');
        this.sfx.fall();
        b.p = { ...this.ultima };
        b.v = { x: 0, z: 0 };
        this.rolando = false;
        eu.atual++; // a tacada a mais (o servidor confirma no próximo estado)
        this.socket?.emit('gf-tacada', eu.buraco);
        if (eu.atual >= G.maxTacadas) this.fecharBuraco(eu, G.maxTacadas, 'Limite de tacadas');
      } else if (r === 'parou') {
        this.rolando = false;
        this.mandarBola(true);
        // acabaram as tacadas: fecha o buraco com o máximo
        if (eu.atual >= G.maxTacadas) this.fecharBuraco(eu, G.maxTacadas, 'Limite de tacadas');
      }
      if (this.rolando) this.mandarBola();
    }
    this.malha.position.set(b.p.x, Y + G.raio, b.p.z);
    const vh = Math.hypot(b.v.x, b.v.z);
    if (vh > 0.05) this.malha.rotateOnWorldAxis(_a.set(b.v.z / vh, 0, -b.v.x / vh), (vh * dt) / G.raio);
    // a seta: perto da bolinha parada, para onde a câmera olha (maior quanto mais força)
    const perto = this.pertoDaBola();
    const pode = perto && !this.rolando && !this.noCopo;
    this.seta.visible = pode;
    if (pode) {
      const olhar = this.player.lookDirection(_a);
      const ang = Math.atan2(olhar.z, olhar.x);
      const forca = this.carga ? vaiEVolta(this.carga.desde, 1200) : 0;
      this.seta.position.set(b.p.x, Y + 0.012, b.p.z);
      this.seta.rotation.set(0, -ang, 0);
      this.seta.scale.setScalar(0.5 + forca * 2.2);
      this.seta.material.opacity = this.carga ? 0.95 : 0.45;
    }
    if (!pode && this.carga) this.carga = null;
    if (this.carga) {
      hud.forca(vaiEVolta(this.carga.desde, 1200), '#facc15');
      this.mostrandoForca = true;
    } else if (this.mostrandoForca) {
      hud.forca(null);
      this.mostrandoForca = false;
    }
    const total = somaDe(eu.tacadas);
    const dif = total - parAte(eu.tacadas.length);
    hud.placar(`<b>${h.n}</b><small>/9 · ${h.nome} · par ${h.par}</small> · tacada <b>${eu.atual}</b> · <small>total ${total}${eu.tacadas.length ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}</small>`);
  }

  pertoDaBola() {
    const p = this.player.pos;
    return Math.hypot(p.x - this.bola.p.x, p.z - this.bola.p.z) < 2 && p.y < 2;
  }

  caiu(h, eu) {
    this.rolando = false;
    this.noCopo = true;
    this.malha.visible = false;
    const tacadas = eu.atual;
    const dif = tacadas - h.par;
    const nome = tacadas === 1 ? 'HOLE IN ONE!' : dif <= -2 ? 'Eagle!' : dif === -1 ? 'Birdie!' : dif === 0 ? 'Par!' : dif === 1 ? 'Bogey' : `+${dif}`;
    hud.mensagem(nome, `${tacadas} ${tacadas === 1 ? 'tacada' : 'tacadas'} · par ${h.par}`, 2200, dif <= 0 ? '#facc15' : '#f8fafc');
    if (dif <= 0) this.sfx.finish();
    else this.sfx.checkpoint();
    this.fecharBuraco(eu, tacadas);
  }

  fecharBuraco(eu, tacadas, aviso = '') {
    const n = eu.buraco;
    this.noCopo = true;
    if (aviso) hud.mensagem(aviso, `fica com ${tacadas} neste buraco`, 2000);
    this.socket?.emit('gf-buraco', { buraco: n, tacadas });
    clearTimeout(this.tProximo);
    this.tProximo = setTimeout(() => {
      const h = BURACOS[n + 1];
      if (h && this.meu()) this.noTee(h);
      else this.malha.visible = false;
    }, 2200);
  }

  // ---------------------------------------------------------------- teclas
  pertoDaEntrada() {
    const p = this.player.pos;
    return Math.hypot(p.x - ENTRADA_GOLFE.x, p.z - ENTRADA_GOLFE.z) < 2.2 && p.y < 2;
  }

  usarE() {
    if (!this.ligado()) return false;
    const eu = this.meu();
    if (this.pertoDaEntrada()) {
      if (eu && !eu.fim) {
        this.socket?.emit('gf-sair');
        this.malha.visible = false;
        hud.placar('');
        hud.mensagem('Saiu do minigolfe', '', 1200);
        return true;
      }
      this.socket?.emit('gf-entrar', {}, (r) => {
        if (!r?.ok) return;
        // o estado com o meu nome chega junto; espera um tiquinho para pôr a bola no 1º tee
        setTimeout(() => {
          this.noTee(BURACOS[0]);
          hud.mensagem('Minigolfe', 'Perto da bolinha: mire com a câmera, segure o clique e solte · E leva até a bolinha', 4000, '#4ade80');
          this.sfx.teleport();
        }, 150);
      });
      return true;
    }
    // jogando, perto do campo: E leva até a bolinha
    if (eu && !eu.fim && this.naArea() && !this.rolando && !this.noCopo) {
      this.irParaBola();
      return true;
    }
    return false;
  }

  apertou() {
    const eu = this.meu();
    if (!eu || eu.fim || !this.ligado() || !this.naArea()) return false;
    if (this.pertoDaBola() && !this.rolando && !this.noCopo) this.carga = { desde: performance.now() };
    return true;
  }

  soltou() {
    const c = this.carga;
    if (!c) return;
    this.carga = null;
    const eu = this.meu();
    if (!eu || this.rolando || this.noCopo || !this.pertoDaBola()) return;
    const forca = vaiEVolta(c.desde, 1200);
    const vel = G.forca[0] + (G.forca[1] - G.forca[0]) * forca ** 1.5;
    const olhar = this.player.lookDirection(_a);
    const h = Math.hypot(olhar.x, olhar.z) || 1;
    this.ultima = { ...this.bola.p };
    this.bola.v = { x: (olhar.x / h) * vel, z: (olhar.z / h) * vel };
    this.rolando = true;
    eu.atual++; // o servidor confirma no próximo estado
    this.socket?.emit('gf-tacada', eu.buraco);
    this.sfx.dado(1.2);
  }

  ativo() {
    const eu = this.meu();
    return this.ligado() && !!eu && !eu.fim && this.naArea();
  }

  dica(livre) {
    if (!livre || !this.ligado()) return '';
    const eu = this.meu();
    if (this.pertoDaEntrada()) return eu && !eu.fim ? '<kbd>E</kbd>Sair do minigolfe' : `<kbd>E</kbd>Jogar minigolfe (9 buracos · par ${PAR_TOTAL})`;
    if (!eu || eu.fim || !this.naArea()) return '';
    if (this.rolando || this.noCopo) return '';
    if (this.pertoDaBola()) return 'Mire com a câmera · <kbd>Clique</kbd>segure e solte · <kbd>E</kbd>atrás da bolinha';
    return '<kbd>E</kbd>Ir até a sua bolinha';
  }

  lugar() {
    return { nome: 'Minigolfe', desc: `9 buracos · par ${PAR_TOTAL}`, cor: '#a3e635', pos: [ENTRADA_GOLFE.x + 1.6, 0, ENTRADA_GOLFE.z], yaw: -Math.PI / 2 };
  }
}
