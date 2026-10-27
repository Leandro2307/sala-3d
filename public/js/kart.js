// Kart no kartódromo do parque (no fim da Rua dos Esportes). E na placa da entrada inscreve na
// próxima corrida; na largada cada um vai para o seu lugar no grid já de carro (o veículo do
// personagem) e, no "VAI!", são 3 voltas. As caixas "?" dão um item, usado com o clique (ou F):
// turbo, casca de banana (fica no chão, atrás), míssil (vai no carro da frente) e escudo. Fora do
// asfalto o kart perde velocidade; R volta para a pista; Esc sai da corrida. O servidor
// (kart-servidor.js) manda nas fases e na colocação; o kart anda no navegador de cada um.
import * as THREE from 'three';
import {
  KART, LINHA, COMPRIMENTO, projetarKart, pontoKart, lugarNoGrid, LARGADA_T, naVoltaKart, CAIXAS_ITEM, NOME_ITEM, ICONE_ITEM, ENTRADA_KART,
} from './kart-dados.js';
import { hud, texturaViva, FONTE, painelDuasFaces } from './hud-jogos.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const Y_PISTA = 0.06;

function texturaAsfalto() {
  const t = texturaViva(THREE, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const c = 50 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${c},${c + 2},${c + 6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 5, h);
    ctx.fillRect(w - 5, 0, 5, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function texturaZebra() {
  const t = texturaViva(THREE, 32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, h / 2, w, h / 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// uma fita ao longo da linha da pista, de d0 a d1 metros do meio (negativo: lado esquerdo)
function fita(d0, d1, vPorMetro) {
  const n = LINHA.length;
  const pos = [];
  const uv = [];
  const idx = [];
  let acum = 0;
  for (let i = 0; i <= n; i++) {
    const [x, z] = LINHA[i % n];
    const [ax, az] = LINHA[(i - 1 + n) % n];
    const [bx, bz] = LINHA[(i + 1) % n];
    let tx = bx - ax;
    let tz = bz - az;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // a normal no chão (para a direita de quem anda pela pista)
    const nx = tz;
    const nz = -tx;
    if (i > 0) {
      const [px, pz] = LINHA[(i - 1) % n];
      acum += Math.hypot(x - px, z - pz);
    }
    pos.push(x + nx * d0, Y_PISTA, z + nz * d0, x + nx * d1, Y_PISTA, z + nz * d1);
    uv.push(0, acum * vPorMetro, 1, acum * vPorMetro);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // as normais saem para baixo se a ordem estiver ao contrário: o material desenha os dois lados
  return geo;
}

// ------------------------------------------------------------------ o kartódromo (parte do mundo)
export function construirKart(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const L = KART.largura / 2;
  const asfalto = new THREE.Mesh(fita(-L, L, 1 / 12), new THREE.MeshStandardMaterial({ map: texturaAsfalto(), roughness: 0.9, side: THREE.DoubleSide }));
  asfalto.receiveShadow = true;
  const zebraMat = new THREE.MeshStandardMaterial({ map: texturaZebra(), roughness: 0.8, side: THREE.DoubleSide });
  const zebras = [new THREE.Mesh(fita(L, L + 1.2, 1 / 2), zebraMat), new THREE.Mesh(fita(-L - 1.2, -L, 1 / 2), zebraMat)];
  for (const z of zebras) z.position.y = -0.005;
  g.add(asfalto, ...zebras);
  // a linha de largada e chegada, quadriculada
  const xadrez = texturaViva(THREE, 256, 32, (ctx, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111827' : '#f8fafc';
      ctx.fillRect((i * w) / 16, (j * h) / 2, w / 16, h / 2);
    }
  });
  const p0 = pontoKart(LARGADA_T);
  const linha = new THREE.Mesh(new THREE.PlaneGeometry(KART.largura, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: xadrez }));
  linha.position.set(p0.x, Y_PISTA + 0.01, p0.z);
  linha.rotation.y = p0.ang; // o x da linha atravessa a pista
  g.add(linha);
  // o pórtico da largada
  const ferro = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), ferro);
    p.position.set(p0.x + Math.cos(p0.ang) * s * (L + 1.5), 3, p0.z - Math.sin(p0.ang) * s * (L + 1.5));
    g.add(p);
  }
  const placaLargada = new THREE.Mesh(new THREE.BoxGeometry(KART.largura + 3, 1.2, 0.3), [ferro, ferro, ferro, ferro,
    new THREE.MeshBasicMaterial({ map: texturaViva(THREE, 512, 64, (ctx, w, h) => {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#facc15';
      ctx.font = FONTE(44);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KARTÓDROMO', w / 2, h / 2 + 2);
    }) }), ferro]);
  placaLargada.position.set(p0.x, 6, p0.z);
  placaLargada.rotation.y = p0.ang;
  g.add(placaLargada);
  // o grid pintado
  const grid = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.7, depthWrite: false });
  for (let k = 0; k < 8; k++) {
    const l = lugarNoGrid(k);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.2).rotateX(-Math.PI / 2), grid);
    m.position.set(l.x - Math.sin(l.ang) * 1.6, Y_PISTA + 0.01, l.z - Math.cos(l.ang) * 1.6);
    m.rotation.y = l.ang;
    g.add(m);
  }
  // as caixas de item
  const interrogacao = texturaViva(THREE, 128, 128, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#f472b6');
    gr.addColorStop(0.5, '#facc15');
    gr.addColorStop(1, '#22d3ee');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONTE(96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2 + 6);
  });
  const matCaixa = new THREE.MeshStandardMaterial({ map: interrogacao, transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveMap: interrogacao, emissiveIntensity: 0.4 });
  const caixas = CAIXAS_ITEM.map((c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), matCaixa);
    m.position.set(c.x, 1.1, c.z);
    g.add(m);
    return m;
  });
  // pneus nas curvas mais fechadas (só enfeite; o carro bate no colisor)
  const pneu = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const geoPneu = new THREE.TorusGeometry(0.42, 0.2, 8, 14).rotateX(Math.PI / 2);
  for (const t of [0.24, 0.31, 0.56, 0.64, 0.79]) {
    const p = pontoKart(t);
    for (const s of [-1, 1]) {
      const x = p.x + Math.cos(p.ang) * s * (L + 4);
      const z = p.z - Math.sin(p.ang) * s * (L + 4);
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(geoPneu, pneu);
        m.position.set(x, 0.2 + k * 0.4, z);
        g.add(m);
      }
      world.addBox({ min: [x - 0.6, 0, z - 0.6], max: [x + 0.6, 1.2, z + 0.6] });
    }
  }
  // a placa da entrada, com o placar, e o círculo de inscrição
  const placar = texturaViva(THREE, 512, 320, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
  painelDuasFaces(THREE, g, placar, 3.4, 2.1, ENTRADA_KART.x + 1.5, 2.4, ENTRADA_KART.z + 2, Math.PI / 2);
  const chao = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  chao.position.set(ENTRADA_KART.x, 0.06, ENTRADA_KART.z);
  g.add(chao);
  // a natureza não planta na pista (a linha, de 6 em 6 pontos, basta)
  world.estradas.push({ pontos: LINHA.filter((_, i) => i % 6 === 0).concat([LINHA[0]]), largura: KART.largura + 6 });
  world.reservas.push({ x: ENTRADA_KART.x, z: ENTRADA_KART.z, r: 6 });
  return { grupo: g, caixas, placar };
}

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#facc15';
  ctx.font = FONTE(44);
  ctx.fillText('KART', w / 2, 36);
  const lista = e?.pilotos || [];
  if (!lista.length) {
    ctx.font = FONTE(24, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${KART.voltas} voltas · ${Math.round(COMPRIMENTO)} m`, w / 2, 110);
    ctx.fillText('aperte E no círculo amarelo', w / 2, 150);
    return;
  }
  const fase = { contagem: 'inscrições abertas', largada: 'largada!', corrida: 'correndo', fim: 'resultado' }[e.fase] || '';
  ctx.font = FONTE(20, 600);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(fase, w / 2, 72);
  ctx.font = FONTE(24, 700);
  lista.slice(0, 6).forEach((p, k) => {
    const y = 108 + k * 34;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.cor;
    ctx.fillText(`${k + 1}. ${p.nome.slice(0, 14)}`, 24, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(p.espera ? 'próxima' : p.chegou ? `${p.tempo} s` : `volta ${Math.min(KART.voltas, p.volta + 1)}`, w - 24, y);
  });
}

// ------------------------------------------------------------------ o jogo no navegador
export class Kart {
  // opts: world, player, sfx, ligado(), carro(on) (main.js: vira carro ou volta a andar), posDe(id)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'kart';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.kart3d;
    this.e = null;
    this.inscrito = false;
    this.correndo = false; // de carro, no grid ou na pista
    this.item = null;
    this.pediuCaixa = false;
    this.turboAte = 0;
    this.giroAte = 0;
    this.escudoAte = 0;
    this.caixasFora = new Map(); // id -> até quando (performance.now)
    this.cascas = new Map(); // id -> malha
    this.misseis = [];
    this.envio = 0;
    this.passo = (dt, f, r) => this.passoKart(dt, f, r);
    const geoCasca = new THREE.ConeGeometry(0.35, 0.45, 6);
    this.matCasca = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 });
    this.geoCasca = geoCasca;
    this.escudo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
    this.escudo.visible = false;
    this.g3d.grupo.add(this.escudo);
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('kt-estado', (e) => this.estado(e));
    socket.on('kt-ordem', (lista) => { this.ordem = lista; });
    socket.on('kt-caixa', ([id, ms]) => this.caixasFora.set(id, performance.now() + ms));
    socket.on('kt-casca', ([id, x, z]) => this.porCasca(id, x, z));
    socket.on('kt-tirar-casca', (id) => this.tirarCasca(id));
    socket.on('kt-missil', (m) => this.missil(m));
    socket.on('kt-chegada', (m) => {
      if (!this.inscrito) return;
      if (m.id === this.eu) {
        hud.mensagem(`Você chegou em ${m.ordem}º!`, `${m.tempo} s`, 4000, '#facc15');
        this.sfx.finish();
      } else hud.mensagem(`${m.nome} chegou em ${m.ordem}º`, '', 1600, '#fde68a');
    });
  }

  ver() {
    this.socket?.emit('kt-ver', (e) => e && this.estado(e));
  }

  meu() {
    return this.e?.pilotos.find((p) => p.id === this.eu) || null;
  }

  // para a voz separada por jogo (main.js): quem corre (ou espera a próxima) está no kart
  partida(id) {
    return this.e?.pilotos.some((p) => p.id === id) ? 'kart' : null;
  }

  estado(e) {
    const antes = this.e;
    this.e = e;
    this.estadoEm = performance.now();
    this.g3d.placar.userData.redesenhar(e);
    for (const [id, ms] of e.caixas) this.caixasFora.set(id, performance.now() + ms);
    const ids = new Set(e.cascas.map(([id]) => id));
    for (const id of [...this.cascas.keys()]) if (!ids.has(id)) this.tirarCasca(id);
    for (const [id, x, z] of e.cascas) this.porCasca(id, x, z);
    if (this.inscrito && !this.meu()) return this.sairDaCorrida(false);
    if (antes?.fase === e.fase || !this.inscrito) return;
    const eu = this.meu();
    if (e.fase === 'largada' && !eu.espera) this.irParaGrid(eu.grid);
    if (e.fase === 'corrida' && this.correndo) {
      hud.mensagem('VAI!', `${KART.voltas} voltas · caixas "?" dão item (clique usa)`, 1600, '#facc15');
      this.sfx.rodada();
    }
    if (e.fase === 'fim') {
      const v = e.pilotos[0];
      if (v?.chegou) hud.mensagem(`${v.id === this.eu ? 'Você' : v.nome} venceu!`, 'Próxima corrida já já', 5000, '#facc15');
      this.desligarCarro();
      this.player.teleport([ENTRADA_KART.x + 2, 0, ENTRADA_KART.z - 2], -Math.PI / 2);
    }
    if (e.fase === 'contagem' && antes?.fase === 'fim') hud.mensagem('Corrida nova', 'Você continua inscrito · E na placa sai', 2400, '#fde68a');
  }

  // ---------------------------------------------------------------- carro
  irParaGrid(k) {
    const l = lugarNoGrid(Math.max(0, k));
    this.ligarCarro();
    this.player.teleport([l.x, Y_PISTA + 0.05, l.z], l.ang + Math.PI);
    this.player.velocidade = 0;
    this.volta = 0;
    this.proximo = 1;
    this.item = null;
    this.turboAte = this.giroAte = this.escudoAte = 0;
    this.terminou = false;
  }

  ligarCarro() {
    if (!this.correndo) {
      this.correndo = true;
      this.carro?.(true);
    }
    this.player.fisicaExterna = this.passo;
  }

  desligarCarro() {
    if (!this.correndo) return;
    this.correndo = false;
    if (this.player.fisicaExterna === this.passo) this.player.fisicaExterna = null;
    this.carro?.(false);
    this.escudo.visible = false;
    hud.placar('');
  }

  // um passo do kart (no lugar do passo do boneco)
  passoKart(dt, f, r) {
    const pl = this.player;
    const K = KART;
    const agora = performance.now();
    const solto = this.e?.fase === 'corrida';
    const girando = agora < this.giroAte;
    let v = pl.velocidade;
    if (!solto) {
      f = 0;
      r = 0;
      v = 0;
    }
    if (girando) {
      f = 0;
      pl.yaw += dt * 10;
      v *= Math.exp(-dt * 2.5);
    }
    const turbo = agora < this.turboAte;
    const topo = turbo ? K.turbo : this.foraDaPista ? K.grama : K.topo;
    if (turbo) v += 45 * dt;
    if (f > 0) v += K.acel * f * dt * Math.max(0.2, 1 - v / topo);
    else if (f < 0) v -= (v > 0.5 ? K.freio : K.acel * 0.6) * -f * dt;
    else v -= v * K.atrito * dt;
    if (v > topo) v -= (v - topo) * Math.min(1, dt * 3);
    v = Math.max(v, -K.re);
    const resposta = Math.min(1, Math.abs(v) / 6);
    pl.volante += (r - pl.volante) * Math.min(1, dt * 10);
    if (!girando) pl.yaw -= pl.volante * K.esterco * resposta * dt * Math.sign(v || 1);
    pl.vel.x = -Math.sin(pl.yaw) * v;
    pl.vel.z = -Math.cos(pl.yaw) * v;
    pl.vel.y = Math.max(pl.vel.y - 30 * dt, -45);
    pl.moveAxis('x', pl.vel.x * dt);
    pl.moveAxis('z', pl.vel.z * dt);
    pl.moveVertical(pl.vel.y * dt);
    if (Math.hypot(pl.vel.x, pl.vel.z) < Math.abs(v) - 2) v *= 0.5; // bateu
    pl.velocidade = v;
    if (pl.grounded) pl.coyote = 0.11;
  }

  // ---------------------------------------------------------------- itens
  porCasca(id, x, z) {
    if (this.cascas.has(id)) return;
    const m = new THREE.Mesh(this.geoCasca, this.matCasca);
    m.position.set(x, 0.25, z);
    m.castShadow = true;
    this.g3d.grupo.add(m);
    this.cascas.set(id, m);
  }

  tirarCasca(id) {
    const m = this.cascas.get(id);
    if (!m) return;
    m.removeFromParent();
    this.cascas.delete(id);
  }

  rodar(motivo) {
    if (performance.now() < this.escudoAte) {
      this.escudoAte = 0;
      hud.mensagem('O escudo segurou!', motivo, 1400, '#67e8f9');
      return;
    }
    this.giroAte = performance.now() + KART.giro * 1000;
    hud.mensagem('Rodou!', motivo, 1300, '#fb923c');
    this.sfx.punchTaken();
  }

  missil(m) {
    const de = m.de === this.eu ? this.player.pos : this.posDe(m.de);
    if (!de) return;
    const malha = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xef4444, toneMapped: false }));
    malha.position.copy(de);
    this.g3d.grupo.add(malha);
    this.misseis.push({ malha, de: de.clone(), alvo: m.alvo, inicio: performance.now(), ms: m.ms });
    if (m.alvo === this.eu) hud.mensagem('Míssil vindo!', '', 1200, '#ef4444');
  }

  usarItem() {
    const it = this.item;
    if (!it || this.e?.fase !== 'corrida') return;
    this.item = null;
    const pl = this.player;
    if (it === 'turbo') {
      this.turboAte = performance.now() + KART.turboTempo * 1000;
      this.sfx.pad();
    } else if (it === 'casca') {
      const x = pl.pos.x + Math.sin(pl.yaw) * 3.2;
      const z = pl.pos.z + Math.cos(pl.yaw) * 3.2;
      this.socket?.emit('kt-casca', { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
      this.imuneCasca = performance.now() + 800;
    } else if (it === 'missil') {
      this.socket?.emit('kt-missil');
      this.sfx.tiro(0.8);
    } else if (it === 'escudo') {
      this.escudoAte = performance.now() + KART.escudoTempo * 1000;
      this.sfx.checkpoint();
    }
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt, t) {
    const agora = performance.now();
    this.g3d.caixas.forEach((m, k) => {
      m.visible = !(this.caixasFora.get(k) > agora);
      m.rotation.y = t * 1.5 + k;
      m.position.y = 1.1 + Math.sin(t * 2 + k) * 0.15;
    });
    for (const m of this.cascas.values()) m.rotation.y = t;
    // mísseis voando: do lançador até o alvo (que roda quando chega, no navegador dele)
    this.misseis = this.misseis.filter((ms) => {
      const k = Math.min(1, (agora - ms.inicio) / ms.ms);
      const alvo = ms.alvo === this.eu ? this.player.pos : this.posDe(ms.alvo);
      if (alvo) {
        _a.lerpVectors(ms.de, alvo, k);
        _a.y += 1 + Math.sin(k * Math.PI) * 4;
        ms.malha.lookAt(_a);
        ms.malha.position.copy(_a);
      }
      if (k < 1) return true;
      ms.malha.removeFromParent();
      if (ms.alvo === this.eu && this.correndo) this.rodar('levou um míssil');
      return false;
    });
    if (!this.inscrito) return;
    if (!this.ligado()) return this.sairDaCorrida();
    if (!this.correndo) return;
    const pl = this.player;
    // o carro e a física do kart ficam ligados durante a corrida (G e o voo não valem aqui)
    if (!pl.veiculo || pl.voando) this.carro?.(true);
    if (pl.fisicaExterna !== this.passo) pl.fisicaExterna = this.passo;
    this.escudo.visible = agora < this.escudoAte;
    if (this.escudo.visible) this.escudo.position.set(pl.pos.x, pl.pos.y + 0.9, pl.pos.z);
    const pr = projetarKart(pl.pos.x, pl.pos.z);
    this.foraDaPista = pr.dist > KART.largura / 2 + 1.2;
    if (this.e?.fase !== 'corrida') {
      this.placar();
      return;
    }
    // as voltas: só conta passando pelos setores em ordem
    const tv = naVoltaKart(pr.t);
    const setor = Math.floor(tv * KART.setores);
    if (!this.terminou && pr.dist < KART.largura * 2) {
      if (setor === this.proximo % KART.setores) {
        if (this.proximo === KART.setores) {
          this.volta++;
          this.proximo = 1;
          if (this.volta < KART.voltas) {
            hud.mensagem(this.volta === KART.voltas - 1 ? 'Última volta!' : `Volta ${this.volta + 1}`, '', 1400, '#facc15');
            this.sfx.checkpoint();
          } else this.terminou = true;
        } else this.proximo++;
      }
    }
    if (agora - this.envio > 200) {
      this.envio = agora;
      this.socket?.emit('kt-prog', { volta: this.volta, t: Math.round(tv * 1000) / 1000 });
    }
    // caixas de item
    if (!this.item && !this.pediuCaixa) {
      for (let k = 0; k < CAIXAS_ITEM.length; k++) {
        const c = CAIXAS_ITEM[k];
        if (this.caixasFora.get(k) > agora || Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z) > 2) continue;
        this.pediuCaixa = true;
        this.caixasFora.set(k, agora + 4000);
        this.socket?.emit('kt-caixa', k, (item) => {
          this.pediuCaixa = false;
          if (!item) return;
          this.item = item;
          hud.mensagem(`${ICONE_ITEM[item]} ${NOME_ITEM[item]}`, 'Clique para usar', 1400, '#fde68a');
          this.sfx.moeda();
        });
        break;
      }
    }
    // cascas no chão
    if (!(agora < (this.imuneCasca || 0))) {
      for (const [id, m] of this.cascas) {
        if (Math.hypot(pl.pos.x - m.position.x, pl.pos.z - m.position.z) > 1.5) continue;
        this.socket?.emit('kt-pisou', id);
        this.tirarCasca(id);
        this.rodar('pisou numa casca');
        break;
      }
    }
    this.placar();
  }

  placar() {
    const e = this.e;
    if (!e) return;
    if (e.fase === 'largada') {
      const s = Math.ceil((e.falta - (performance.now() - this.estadoEm)) / 1000);
      if (s !== this.contou && s > 0 && s <= 3) {
        this.contou = s;
        hud.mensagem(String(s), '', 800, '#f8fafc');
        this.sfx.bip();
      }
    }
    const lista = this.ordem || e.pilotos.map((p) => [p.id, p.volta, p.chegou]);
    const pos = lista.findIndex(([id]) => id === this.eu) + 1;
    const vel = Math.round(Math.abs(this.player.velocidade) * 3.6);
    hud.placar(`<b>${Math.min(KART.voltas, (this.volta || 0) + 1)}</b><small>/${KART.voltas} voltas</small> · <b>${pos || '-'}º</b><small>de ${lista.length}</small> · ${vel} km/h`
      + `${this.item ? ` · ${ICONE_ITEM[this.item]} <small>${NOME_ITEM[this.item]} (clique)</small>` : ''}${this.foraDaPista ? ' · <small>fora da pista</small>' : ''}`);
  }

  // ---------------------------------------------------------------- teclas
  pertoDaEntrada() {
    const p = this.player.pos;
    return Math.hypot(p.x - ENTRADA_KART.x, p.z - ENTRADA_KART.z) < 2.2 && p.y < 2;
  }

  usarE() {
    if (!this.ligado() || !this.pertoDaEntrada() || this.correndo) return false;
    if (this.inscrito) {
      this.sairDaCorrida();
      hud.mensagem('Saiu do kart', '', 1200);
      return true;
    }
    this.socket?.emit('kt-entrar', {}, (r) => {
      if (r?.erro === 'cheio') return hud.mensagem('Corrida cheia', 'Até 8 pilotos', 1800);
      if (!r?.ok) return;
      this.inscrito = true;
      hud.mensagem('Inscrito no kart!', r.valendo ? 'Tem uma corrida valendo: você entra na próxima' : 'Na largada você vai para o grid', 3000, '#facc15');
      this.sfx.message();
    });
    return true;
  }

  sairDaCorrida(avisar = true) {
    if (!this.inscrito) return;
    this.inscrito = false;
    if (avisar) this.socket?.emit('kt-sair');
    const ia = this.correndo;
    this.desligarCarro();
    if (ia) this.player.teleport([ENTRADA_KART.x + 2, 0, ENTRADA_KART.z - 2], -Math.PI / 2);
    hud.placar('');
  }

  esc() {
    if (!this.correndo) return false;
    this.sairDaCorrida();
    return true;
  }

  // R: de volta para a pista, virado para a frente
  teclaR() {
    if (!this.correndo) return false;
    const pr = projetarKart(this.player.pos.x, this.player.pos.z);
    this.player.teleport([pr.x, Y_PISTA + 0.05, pr.z], pr.ang + Math.PI);
    this.player.velocidade = 0;
    return true;
  }

  apertou() {
    if (!this.correndo) return false;
    this.usarItem();
    return true;
  }

  soltou() {}

  ativo() {
    return this.ligado() && this.correndo;
  }

  dica(livre) {
    if (!livre || !this.ligado()) return '';
    if (this.correndo) return '';
    if (!this.pertoDaEntrada()) return '';
    return this.inscrito ? '<kbd>E</kbd>Sair do kart · espere a largada aqui' : '<kbd>E</kbd>Correr de kart (na próxima largada)';
  }

  lugar() {
    return { nome: 'Kart', desc: `Kartódromo · ${KART.voltas} voltas com itens`, cor: '#facc15', pos: [ENTRADA_KART.x - 2, 0, ENTRADA_KART.z], yaw: -Math.PI / 2 };
  }
}
