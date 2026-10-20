// Pingue-pongue no salão de jogos do parque: duas mesas, cada uma com um lado azul e um vermelho.
// E na ponta da mesa pega aquele lado (sozinho, o robô joga do outro). A raquete bate sozinha
// quando a bolinha chega perto, depois de quicar do seu lado; a câmera mira para onde ela vai, e o
// clique (ou o F) com a bolinha perto é a cortada. 11 pontos, com 2 de diferença; o saque troca a
// cada 2 pontos. O servidor (pingue-servidor.js) manda no placar; a física é a mesma dos dois lados
// (pingue-fisica.js).
import * as THREE from 'three';
import { PINGUE, saquePingue, andarPingue, rebaterPingue, ladoPingue } from './pingue-fisica.js';
import { hud, texturaViva, FONTE, painelDuasFaces } from './hud-jogos.js';

const LADOS = [{ nome: 'Azul', cor: '#3b82f6' }, { nome: 'Vermelho', cor: '#ef4444' }];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ------------------------------------------------------------------ as mesas (parte do mundo)
export function construirPingue(world) {
  const P = PINGUE;
  const g = new THREE.Group();
  world.fora.add(g);
  const tampo = texturaViva(THREE, 880, 488, (ctx, w, h) => {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
  const matTampo = new THREE.MeshStandardMaterial({ map: tampo, roughness: 0.45 });
  const matBorda = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
  const matPe = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
  const malha = texturaViva(THREE, 256, 32, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  const placares = P.mesas.map((m) => {
    // tampo (as linhas desenhadas no comprimento: a textura gira para o comprimento ficar em x)
    const topo = new THREE.Mesh(new THREE.BoxGeometry(P.comp, 0.06, P.larg), [matBorda, matBorda, matTampo, matBorda, matBorda, matBorda]);
    topo.position.set(m.x, P.altura - 0.03, m.z);
    topo.castShadow = true;
    topo.receiveShadow = true;
    g.add(topo);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const pe = new THREE.Mesh(new THREE.BoxGeometry(0.08, P.altura - 0.06, 0.08), matPe);
      pe.position.set(m.x + sx * (P.comp / 2 - 0.3), (P.altura - 0.06) / 2, m.z + sz * (P.larg / 2 - 0.3));
      g.add(pe);
    }
    // rede com dois postinhos
    const rede = new THREE.Mesh(new THREE.PlaneGeometry(P.larg + 0.3, P.rede), new THREE.MeshBasicMaterial({ map: malha, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    rede.position.set(m.x, P.altura + P.rede / 2, m.z);
    rede.rotation.y = Math.PI / 2;
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, P.larg + 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    faixa.position.set(m.x, P.altura + P.rede, m.z);
    g.add(rede, faixa);
    for (const s of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, P.rede + 0.04, 8), matPe);
      poste.position.set(m.x, P.altura + P.rede / 2, m.z + s * (P.larg / 2 + 0.15));
      g.add(poste);
    }
    // faixa no chão em cada ponta, na cor do lado: é onde se aperta E para jogar
    for (const lado of [0, 1]) {
      const s = lado === 0 ? -1 : 1;
      const chao = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LADOS[lado].cor, transparent: true, opacity: 0.22, depthWrite: false }));
      chao.position.set(m.x + s * (P.comp / 2 + 1.5), 0.06, m.z);
      g.add(chao);
    }
    world.addBox({ min: [m.x - P.comp / 2, 0, m.z - P.larg / 2], max: [m.x + P.comp / 2, P.altura, m.z + P.larg / 2] });
    const placar = texturaViva(THREE, 512, 200, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
    painelDuasFaces(THREE, g, placar, 2.6, 1.0, m.x, 2.7, m.z - P.larg / 2 - 1.9, 0);
    return placar;
  });
  return { grupo: g, placares };
}

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!e || e.fase === 'espera') {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = FONTE(52);
    ctx.fillText('PINGUE-PONGUE', w / 2, h / 2 - 26);
    ctx.font = FONTE(24, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('chegue na ponta da mesa e aperte E', w / 2, h / 2 + 40);
    return;
  }
  for (const lado of [0, 1]) {
    const x = lado === 0 ? w * 0.25 : w * 0.75;
    ctx.fillStyle = LADOS[lado].cor;
    ctx.font = FONTE(96);
    ctx.fillText(String(e.pontos[lado]), x, h / 2 - 6);
    ctx.font = FONTE(22, 700);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText((e.lados[lado]?.nome || '—').slice(0, 14), x, h - 26);
    if (e.saque === lado && e.fase !== 'fim') {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(x, 26, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#475569';
  ctx.font = FONTE(56);
  ctx.fillText('x', w / 2, h / 2 - 8);
}

function malhaRaquete(cor) {
  const g = new THREE.Group();
  const lamina = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7 }));
  const cabo = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.035), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }));
  cabo.position.y = -0.22;
  g.add(lamina, cabo);
  g.traverse((o) => { o.castShadow = true; });
  g.visible = false;
  return g;
}

// ------------------------------------------------------------------ o jogo no navegador
export class Pingue {
  // opts: world, player, sfx, ligado(), posDe(id)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'pingue';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.pingue3d;
    this.querCortar = 0; // até quando o clique pede cortada
    this.recarga = 0;
    this.mesas = PINGUE.mesas.map((m, i) => {
      const s = saquePingue(m, 0);
      const bola = { p: new THREE.Vector3(s.x, s.y, s.z), v: new THREE.Vector3() };
      const malha = new THREE.Mesh(new THREE.SphereGeometry(PINGUE.raio, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: 0.35, emissive: 0x3b2a10, emissiveIntensity: 0.25 }));
      malha.castShadow = true;
      this.g3d.grupo.add(malha);
      const raquetes = [0, 1].map((lado) => {
        const r = malhaRaquete(LADOS[lado].cor);
        this.g3d.grupo.add(r);
        return r;
      });
      return { i, m, e: null, bola, malha, raquetes, golpe: [0, 0], parada: false, seq: 0, toqueEm: -1e9, ultimo: null, quiques: 0, bateuAqui: false, toqueVisto: null };
    });
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('pp-estado', (e) => this.estado(e));
    socket.on('pp-bola', (a) => this.bola(a));
  }

  ver() {
    this.socket?.emit('pp-ver', (lista) => lista?.forEach((e) => this.estado(e)));
  }

  minhaMesa() {
    for (const M of this.mesas) {
      const lado = M.e?.lados.findIndex((l) => l?.id === this.eu) ?? -1;
      if (lado >= 0) return { M, lado };
    }
    return null;
  }

  estado(e) {
    const M = this.mesas[e.mesa];
    if (!M) return;
    const antes = M.e;
    M.e = e;
    this.g3d.placares[e.mesa].userData.redesenhar(e);
    if (e.fase !== 'jogo' || antes?.fase !== e.fase) this.aplicarBola(M, e.bola, true);
    const perto = this.perto(M.m, 14);
    if (antes?.fase !== e.fase && e.fase === 'ponto' && e.marcou && perto) {
      const quem = e.lados[e.marcou.lado]?.nome || LADOS[e.marcou.lado].nome;
      hud.mensagem(`Ponto: ${quem}`, e.marcou.motivo, 1500, LADOS[e.marcou.lado].cor);
      this.sfx.checkpoint();
    }
    if (antes?.fase !== e.fase && e.fase === 'fim' && perto) {
      const v = e.pontos[0] > e.pontos[1] ? 0 : 1;
      hud.mensagem(`${e.lados[v]?.nome || LADOS[v].nome} venceu!`, `${e.pontos[0]} x ${e.pontos[1]}`, 4500, LADOS[v].cor);
      this.sfx.finish();
    }
    const eu = e.lados.findIndex((l) => l?.id === this.eu);
    if (eu >= 0 && e.fase === 'saque' && e.saque === eu && (antes?.fase !== 'saque' || antes?.saque !== eu)) {
      hud.mensagem('Seu saque', 'Encoste na bolinha', 1400, LADOS[eu].cor);
    }
  }

  bola(a) {
    const M = this.mesas[a[0]];
    if (!M) return;
    const [, x, y, z, vx, vy, vz, ultimo, quiques, id, seq] = a;
    // acabei de bater: a minha previsão vale até o servidor confirmar a minha raquetada
    if (performance.now() - M.toqueEm < 450 && (id !== this.eu || seq < M.seq)) return;
    // raquetada nova de alguém: a raquete dele balança
    const chave = `${id}:${seq}`;
    if (id && chave !== M.toqueVisto) {
      M.toqueVisto = chave;
      if (M.ultimo !== ultimo || id !== this.eu) M.golpe[ultimo] = 0.25;
      if (this.perto(M.m, 18) && id !== this.eu) this.sfx.dado(0.8);
    }
    if (M.ultimo !== ultimo) M.bateuAqui = false;
    M.ultimo = ultimo;
    M.quiques = quiques;
    this.aplicarBola(M, [a[0], x, y, z, vx, vy, vz], false);
  }

  aplicarBola(M, a, seco) {
    const s = { p: new THREE.Vector3(a[1], a[2], a[3]), v: new THREE.Vector3(a[4], a[5], a[6]) };
    if (!seco && M.e?.fase === 'jogo') andarPingue(s, M.m, 0.05); // o recado chega atrasado
    if (seco || s.p.distanceTo(M.bola.p) > 1.2) M.bola.p.copy(s.p);
    else M.bola.p.lerp(s.p, 0.4);
    M.bola.v.copy(s.v);
    M.parada = false;
  }

  perto(m, raio) {
    const p = this.player.pos;
    return Math.hypot(p.x - m.x, p.z - m.z) < raio;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt, t) {
    this.recarga -= dt;
    const minha = this.minhaMesa();
    for (const M of this.mesas) {
      const e = M.e;
      const b = M.bola;
      if (e?.fase === 'saque') {
        const s = saquePingue(M.m, e.saque);
        b.p.set(s.x, s.y + Math.sin(t * 3) * 0.05, s.z);
        b.v.set(0, 0, 0);
      } else if (e && !M.parada) {
        const meuLado = minha?.M === M ? minha.lado : -1;
        andarPingue(b, M.m, dt, (ev) => {
          if (ev.tipo === 'mesa' && ev.lado === meuLado && M.ultimo !== meuLado) M.bateuAqui = true;
          if (ev.tipo === 'mesa' && this.perto(M.m, 12)) this.sfx.dado(0.5);
          if (ev.tipo === 'chao' && e.fase !== 'jogo') M.parada = Math.abs(b.v.y) < 0.4;
          return false;
        });
      }
      M.malha.position.copy(b.p);
      M.malha.visible = !!e && e.fase !== 'espera';
      this.raquetes(M, dt);
    }
    if (minha && this.ligado()) this.tentarBater(minha.M, minha.lado);
  }

  // a raquete de cada lado, na frente de quem joga (a do robô flutua na ponta da mesa)
  raquetes(M, dt) {
    const P = PINGUE;
    for (const lado of [0, 1]) {
      const r = M.raquetes[lado];
      const quem = M.e?.lados[lado];
      r.visible = !!quem && M.e.fase !== 'espera';
      if (!r.visible) continue;
      const s = lado === 0 ? 1 : -1; // para onde a mesa fica
      if (quem.id === 'robo') {
        const alvoZ = THREE.MathUtils.clamp(M.bola.p.z, M.m.z - P.larg / 2, M.m.z + P.larg / 2);
        _a.set(M.m.x - s * (P.comp / 2 + 0.45), Math.max(P.altura + 0.25, Math.min(M.bola.p.y, 2)), alvoZ);
        r.position.lerp(_a, Math.min(1, dt * 8));
      } else {
        const pos = quem.id === this.eu ? this.player.pos : this.posDe(quem.id);
        if (!pos) {
          r.visible = false;
          continue;
        }
        // do lado da bolinha (direita ou esquerda de quem olha para a mesa)
        const lateral = THREE.MathUtils.clamp((M.bola.p.z - pos.z) * 0.6, -0.45, 0.45);
        _a.set(pos.x + s * 0.5, pos.y + 1.15, pos.z + lateral);
        r.position.lerp(_a, Math.min(1, dt * 14));
      }
      M.golpe[lado] = Math.max(0, M.golpe[lado] - dt);
      const giro = M.golpe[lado] > 0 ? Math.sin((M.golpe[lado] / 0.25) * Math.PI) * 1.2 : 0;
      r.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, -giro * s);
    }
  }

  // encostou: raquetada (saque ou devolução depois do quique), para onde a câmera olha
  tentarBater(M, lado) {
    const e = M.e;
    if (!e || this.recarga > 0) return;
    if (e.fase === 'saque') {
      if (e.saque !== lado) return;
    } else if (e.fase !== 'jogo' || M.ultimo === lado || !(M.quiques >= 1 || M.bateuAqui)) return;
    const p = this.player.pos;
    const b = M.bola.p;
    if (Math.hypot(b.x - p.x, b.z - p.z) > PINGUE.alcance || b.y < p.y + 0.3 || b.y > p.y + 2.5) return;
    if (e.fase === 'jogo' && ladoPingue(M.m, b.x) !== lado) return;
    this.bater(M, lado, performance.now() < this.querCortar && b.y > PINGUE.altura + 0.35);
  }

  bater(M, lado, forte) {
    const P = PINGUE;
    const b = M.bola;
    const s = lado === 0 ? 1 : -1;
    const olhar = this.player.lookDirection(_b);
    const alvoX = M.m.x + s * (P.comp / 2) * 0.65;
    let alvoZ = M.m.z + (b.p.z - M.m.z) * 0.3;
    if (Math.sign(olhar.x) === s && Math.abs(olhar.x) > 0.15) alvoZ = b.p.z + (olhar.z / olhar.x) * (alvoX - b.p.x);
    // a bolinha sai de cima da mesa, nunca de dentro dela
    if (b.p.y < P.altura + P.raio + 0.05) b.p.y = P.altura + P.raio + 0.05;
    const v = rebaterPingue(M.m, b.p, lado, alvoZ, forte);
    b.v.set(v.x, v.y, v.z);
    M.parada = false;
    M.ultimo = lado;
    M.quiques = 0;
    M.bateuAqui = false;
    M.seq++;
    M.toqueEm = performance.now();
    M.golpe[lado] = 0.25;
    this.recarga = 0.3;
    this.querCortar = 0;
    if (forte) this.sfx.punchHit();
    else this.sfx.dado(1);
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.emit('pp-toque', { mesa: M.i, p: [a(b.p.x), a(b.p.y), a(b.p.z)], v: [a(b.v.x), a(b.v.y), a(b.v.z)], seq: M.seq });
  }

  // ---------------------------------------------------------------- teclas
  // a ponta da mesa onde o boneco está (para o E): { M, lado } ou null
  pontaPerto() {
    const P = PINGUE;
    const p = this.player.pos;
    for (const M of this.mesas) {
      for (const lado of [0, 1]) {
        const s = lado === 0 ? -1 : 1;
        if (Math.abs(p.x - (M.m.x + s * (P.comp / 2 + 1.5))) < 1.6 && Math.abs(p.z - M.m.z) < 2.4 && p.y < 2) return { M, lado };
      }
    }
    return null;
  }

  usarE() {
    if (!this.ligado()) return false;
    const minha = this.minhaMesa();
    const ponta = this.pontaPerto();
    if (minha && (!ponta || ponta.M === minha.M)) {
      this.socket?.emit('pp-sair');
      hud.mensagem('Saiu da mesa', '', 1200);
      return true;
    }
    if (!ponta) return false;
    const ocupado = ponta.M.e?.lados[ponta.lado];
    if (ocupado && ocupado.id !== 'robo' && ocupado.id !== this.eu) {
      hud.mensagem('Lado ocupado', `${ocupado.nome} está jogando aí`, 1600);
      return true;
    }
    this.socket?.emit('pp-entrar', { mesa: ponta.M.i, lado: ponta.lado }, (r) => {
      if (r?.ok) hud.mensagem(`Lado ${LADOS[ponta.lado].nome}`, 'A raquete bate sozinha: chegue perto da bolinha e mire com a câmera', 3200, LADOS[ponta.lado].cor);
    });
    return true;
  }

  // clique (ou F): cortada, se a bolinha estiver perto; senão, pede cortada na próxima raquetada
  apertou() {
    const minha = this.minhaMesa();
    if (!minha || !this.ligado()) return false;
    this.querCortar = performance.now() + 350;
    this.tentarBater(minha.M, minha.lado);
    return true;
  }

  soltou() {}

  // onde se começa (painel do parque): na ponta azul da primeira mesa, olhando para ela
  lugar() {
    const m = PINGUE.mesas[0];
    return { nome: 'Pingue-pongue', desc: 'Salão de jogos · contra gente ou o robô', cor: '#3b82f6', pos: [m.x - PINGUE.comp / 2 - 1.6, 0, m.z], yaw: -Math.PI / 2 };
  }

  // jogando numa mesa: o botão de ação do celular aparece
  ativo() {
    return this.ligado() && !!this.minhaMesa();
  }

  dica(livre) {
    if (!livre || !this.ligado()) return '';
    const minha = this.minhaMesa();
    if (minha) {
      const e = minha.M.e;
      if (e?.fase === 'saque' && e.saque === minha.lado) return 'Encoste na bolinha para sacar · <kbd>Clique</kbd>cortada · <kbd>E</kbd>sair';
      return 'Mire com a câmera · <kbd>Clique</kbd>cortada com a bolinha perto · <kbd>E</kbd>sair da mesa';
    }
    const ponta = this.pontaPerto();
    if (!ponta) return '';
    const ocupado = ponta.M.e?.lados[ponta.lado];
    if (ocupado && ocupado.id !== 'robo') return `Lado ${LADOS[ponta.lado].nome}: ${ocupado.nome} está jogando`;
    return `<kbd>E</kbd>Jogar pingue-pongue (lado ${LADOS[ponta.lado].nome})`;
  }
}
