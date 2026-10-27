// Sinuca (bola 8) no salão de jogos do parque: duas mesas, até dois por mesa (sozinho é treino).
// E perto da mesa pega um lugar. Na sua vez a câmera vai para cima da mesa e o cursor aparece: a
// mira vai da branca até onde ele aponta no pano (a faixa mostra onde a branca bate e para onde a
// bola tocada vai); segurar o clique dá a força e soltar é a tacada. Na vez do outro, dá para andar
// em volta da mesa; quando a vez volta, a câmera volta para cima dela sozinha. O servidor
// (sinuca-servidor.js) simula e julga; todo mundo anima a mesma tacada com a mesma conta
// (sinuca-fisica.js) e, no fim, as bolas ficam onde ele disse.
import * as THREE from 'three';
import { SINUCA, BOLSOS, simularSinuca, mira, lisa, listrada } from './sinuca-fisica.js';
import { hud, texturaViva, FONTE, painelDuasFaces, vaiEVolta } from './hud-jogos.js';

const S = SINUCA;
const R = S.raio;
const CORES = ['#f8fafc', '#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d', '#111111'];
const corDa = (n) => CORES[n <= 8 ? n : n - 8];
const _a = new THREE.Vector3();
const BORDA = 0.3; // a madeira em volta do pano

// a textura de cada bola: lisa (cor cheia), listrada (faixa no meio), com o número num círculo
function texturaBola(n) {
  return texturaViva(THREE, 128, 64, (ctx, w, h) => {
    const cor = corDa(n);
    ctx.fillStyle = listrada(n) ? '#f8fafc' : cor;
    ctx.fillRect(0, 0, w, h);
    if (listrada(n)) {
      ctx.fillStyle = cor;
      ctx.fillRect(0, h * 0.25, w, h * 0.5);
    }
    if (n === 0) return;
    for (const cx of [w * 0.25, w * 0.75]) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(cx, h / 2, h * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = FONTE(18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), cx, h / 2 + 1);
    }
  });
}

// ------------------------------------------------------------------ as mesas (parte do mundo)
export function construirSinuca(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x5b3418, roughness: 0.55 });
  // um brilho próprio leve: à noite o pano e as bolas continuam legíveis (sem luz de verdade, que pesa)
  const pano = new THREE.MeshStandardMaterial({ color: 0x0f7a3d, roughness: 0.95, emissive: 0x0a4a26, emissiveIntensity: 0.6 });
  const tabela = new THREE.MeshStandardMaterial({ color: 0x0b5e2f, roughness: 0.9 });
  const preto = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const W = S.comp;
  const D = S.larg;
  // por mesa: o placar e o que fica entre a câmera de cima e o pano (some para quem está mirando)
  const mesas = S.mesas.map((m) => {
    const y = S.altura;
    const emCima = [];
    const panoM = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), pano);
    panoM.position.set(m.x, y, m.z);
    panoM.receiveShadow = true;
    g.add(panoM);
    // a caixa de baixo e a madeira em volta, com as tabelas verdes por dentro
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.3, D + 0.1), madeira);
    caixa.position.set(m.x, y - 0.16, m.z);
    caixa.castShadow = true;
    g.add(caixa);
    for (const [w, d, x, z] of [[W + 2 * BORDA, BORDA, 0, D / 2 + BORDA / 2], [W + 2 * BORDA, BORDA, 0, -D / 2 - BORDA / 2], [BORDA, D, W / 2 + BORDA / 2, 0], [BORDA, D, -W / 2 - BORDA / 2, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), madeira);
      b.position.set(m.x + x, y + 0.02, m.z + z);
      b.castShadow = true;
      g.add(b);
    }
    for (const [w, d, x, z] of [[W, 0.07, 0, D / 2 - 0.035], [W, 0.07, 0, -D / 2 + 0.035], [0.07, D, W / 2 - 0.035, 0], [0.07, D, -W / 2 + 0.035, 0]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), tabela);
      t.position.set(m.x + x, y + 0.035, m.z + z);
      g.add(t);
    }
    // os bolsos: discos pretos por cima da madeira e da tabela
    for (const [k, [bx, bz]] of BOLSOS.entries()) {
      const r = k === 1 || k === 4 ? 0.12 : 0.14;
      const bolso = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), preto);
      bolso.position.set(m.x + bx, y + 0.095, m.z + bz);
      g.add(bolso);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
      const pe = new THREE.Mesh(new THREE.BoxGeometry(0.22, y - 0.3, 0.22), madeira);
      pe.position.set(m.x + sx * (W / 2 - 0.1), (y - 0.3) / 2, m.z + sz * (D / 2 - 0.1));
      g.add(pe);
    }
    // a luminária em cima
    const luz = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0xfff3c4, emissiveIntensity: 0.15 }));
    luz.position.set(m.x, y + 2.1, m.z);
    const brilho = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.68, 0.46).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }));
    brilho.position.set(m.x, y + 2.03, m.z);
    g.add(luz, brilho);
    emCima.push(luz, brilho);
    for (const s of [-1, 1]) {
      const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4.4, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      fio.position.set(m.x + s * W * 0.3, y + 2.1 + 2.2, m.z);
      g.add(fio);
      emCima.push(fio);
    }
    world.addBox({ min: [m.x - W / 2 - BORDA, 0, m.z - D / 2 - BORDA], max: [m.x + W / 2 + BORDA, y + 0.1, m.z + D / 2 + BORDA] });
    const placar = texturaViva(THREE, 512, 220, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
    // pendurado em cima da mesa, acima da luminária: dá para ler dos dois lados compridos
    emCima.push(...painelDuasFaces(THREE, g, placar, 2.6, 1.12, m.x, y + 3.0, m.z, 0, { poste: false }));
    return { placar, emCima };
  });
  return { grupo: g, placares: mesas.map((x) => x.placar), emCima: mesas.map((x) => x.emCima) };
}

const restam = (e, grupo) => e.bolas.filter(([n, , , fora]) => !fora && (grupo === 'lisas' ? lisa(n) : listrada(n))).length;

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4ade80';
  ctx.font = FONTE(42);
  ctx.fillText('SINUCA', w / 2, 34);
  if (!e?.jogadores?.length) {
    ctx.font = FONTE(24, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('chegue perto da mesa e aperte E', w / 2, h / 2 + 20);
    return;
  }
  e.jogadores.forEach((j, k) => {
    const y = 96 + k * 54;
    const vez = e.vez === k && e.fase !== 'fim';
    if (vez) {
      ctx.fillStyle = 'rgba(74,222,128,0.16)';
      ctx.fillRect(12, y - 24, w - 24, 48);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = j.cor;
    ctx.font = FONTE(28, 800);
    ctx.fillText(`${vez ? '▶ ' : ''}${j.nome.slice(0, 13)}`, 26, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = FONTE(22, 600);
    ctx.fillText(j.grupo ? `${j.grupo} · ${restam(e, j.grupo)}` : e.jogadores.length < 2 ? 'treino' : 'mesa aberta', w - 26, y);
  });
  if (e.aviso) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = FONTE(20, 700);
    ctx.fillText(e.aviso.slice(0, 40), w / 2, h - 22);
  }
}

// ------------------------------------------------------------------ o jogo no navegador
export class Sinuca {
  // opts: world, player, sfx, ligado(), focar() (o main.js põe a sinuca em foco: câmera de cima e o
  // cursor solto; devolve se deu), soltarFoco() (sai do foco e volta a andar)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'sinuca';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.sinuca3d;
    this.carga = null;
    this.mirando = false; // em foco: a câmera de cima da mesa
    this.focoPedido = false; // a vez chegou: entra na mira no próximo quadro que der
    this.ang = 0;
    this.zoom = 1;
    this.raio = new THREE.Raycaster();
    this.ponteiro = new THREE.Vector2();
    const geoBola = new THREE.SphereGeometry(R, 18, 12);
    this.mesas = S.mesas.map((m, i) => {
      const malhas = [];
      for (let n = 0; n < 16; n++) {
        const tex = texturaBola(n);
        const b = new THREE.Mesh(geoBola, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 }));
        b.castShadow = true;
        b.visible = false;
        this.g3d.grupo.add(b);
        malhas.push(b);
      }
      return { i, m, e: null, bolas: null, malhas, filme: null, t: 0 };
    });
    // o taco e a mira no pano (só na sua vez)
    this.taco = new THREE.Group();
    const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.022, 2.4, 10).rotateZ(Math.PI / 2).translate(-1.2, 0, 0), new THREE.MeshStandardMaterial({ color: 0xd6a35c, roughness: 0.5 }));
    const ponta = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 8).rotateZ(Math.PI / 2).translate(-0.02, 0, 0), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }));
    this.taco.add(vara, ponta);
    this.taco.visible = false;
    this.g3d.grupo.add(this.taco);
    // as faixas da mira no pano: da branca até onde ela bate, e da bola tocada para onde ela vai
    const faixa = (cor) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.016).rotateX(-Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
      f.visible = false;
      this.g3d.grupo.add(f);
      return f;
    };
    this.faixaBranca = faixa(0xffffff);
    this.faixaBola = faixa(0xfacc15);
    this.fantasma = new THREE.Mesh(new THREE.TorusGeometry(R, 0.008, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.fantasma.visible = false;
    this.g3d.grupo.add(this.fantasma);
    this.montarHud();
    this.ligarPonteiro();
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('sn-estado', (e) => this.estado(e));
    socket.on('sn-lance', (m) => this.lance(m));
  }

  ver() {
    this.socket?.emit('sn-ver', (lista) => lista?.forEach((e) => this.estado(e)));
  }

  minhaMesa() {
    return this.mesas.find((P) => P.e?.jogadores.some((j) => j.id === this.eu)) || null;
  }

  // a mesa em que essa pessoa joga, para a voz separada por jogo (main.js)
  partida(id) {
    const P = this.mesas.find((P) => P.e?.jogadores.some((j) => j.id === id));
    return P ? `sinuca${P.i}` : null;
  }

  minhaVez(P) {
    return !!P?.e && P.e.fase === 'jogando' && !P.filme && P.e.jogadores[P.e.vez]?.id === this.eu;
  }

  estado(e) {
    const P = this.mesas[e.mesa];
    if (!P) return;
    const antes = P.e;
    P.e = e;
    this.g3d.placares[e.mesa].userData.redesenhar(e);
    if (!P.filme) this.arrumar(P, e.bolas);
    const minha = e.jogadores.some((j) => j.id === this.eu);
    if (!minha) return;
    const vez = e.jogadores[e.vez]?.id === this.eu && e.fase === 'jogando';
    const eraVez = antes && antes.jogadores[antes.vez]?.id === this.eu && antes.fase === 'jogando';
    // a vez chegou (ou continua depois de encaçapar): a câmera vai para cima da mesa
    if (vez && !eraVez) {
      this.focoPedido = true;
      if (e.jogadores.length === 2) {
        hud.mensagem('Sua vez!', e.aviso || 'Aponte no pano para mirar · segure o clique e solte', 2200, '#4ade80');
        this.sfx.message();
      }
    }
    // a vez passou para o outro: livre para andar em volta da mesa
    if (e.fase === 'jogando' && !vez && this.mirando) this.soltarFoco?.();
    if (e.fase === 'fim' && antes?.fase !== 'fim') {
      const v = e.jogadores.find((j) => j.id === e.vencedor);
      hud.mensagem(e.jogadores.length < 2 ? 'Mesa limpa!' : `${v?.nome || ''} venceu!`, e.aviso, 5000, '#facc15');
      this.sfx.finish();
    }
  }

  // as bolas paradas onde o servidor disse
  arrumar(P, lista) {
    P.bolas = lista.map(([n, x, z, fora]) => ({ n, x, z, vx: 0, vz: 0, fora: !!fora }));
    for (const b of P.bolas) {
      const malha = P.malhas[b.n];
      malha.visible = !b.fora;
      malha.position.set(P.m.x + b.x, S.altura + R, P.m.z + b.z);
    }
  }

  // todos animam a mesma tacada; no fim, o estado do servidor
  lance(msg) {
    const P = this.mesas[msg.mesa];
    if (!P) return;
    const bolas = msg.antes.map(([n, x, z, fora]) => ({ n, x, z, vx: 0, vz: 0, fora: !!fora }));
    const quadros = [];
    simularSinuca(bolas, msg.vx, msg.vz, (t, bs) => quadros.push({ t, pos: bs.map((b) => [b.x, b.z, b.fora]) }));
    P.filme = { quadros, antes: msg.antes, caidas: msg.caidas, ultimo: null, somou: 0 };
    P.t = 0;
    this.carga = null;
    if (this.perto(P.m, 10)) this.sfx.dado(1.2);
  }

  perto(m, raio) {
    const p = this.player.pos;
    return Math.hypot(p.x - m.x, p.z - m.z) < raio;
  }

  // ---------------------------------------------------------------- foco (câmera de cima)
  // A câmera em cima do pano, um pouco puxada para o lado de quem joga (esse lado fica embaixo na
  // tela), alta o bastante para a mesa inteira caber. A roda do mouse aproxima e afasta.
  pose(P) {
    const cam = this.world.camera;
    const fovV = THREE.MathUtils.degToRad(cam.fov);
    const tanH = Math.tan(fovV / 2) * cam.aspect;
    const h = Math.max((S.larg + 2 * BORDA + 0.5) / 2 / Math.tan(fovV / 2), (S.comp + 2 * BORDA + 0.5) / 2 / tanH) * this.zoom;
    const lado = this.player.pos.z < P.m.z ? -1 : 1;
    return {
      position: new THREE.Vector3(P.m.x, S.altura + h, P.m.z + lado * h * 0.12),
      target: new THREE.Vector3(P.m.x, S.altura, P.m.z),
    };
  }

  // o main.js pôs a sinuca em foco
  entrarNaMira() {
    const P = this.minhaMesa();
    if (!P) return;
    this.mirando = true;
    this.zoom = 1.3;
    this.player.override = this.pose(P);
    for (const o of this.g3d.emCima[P.i]) o.visible = false;
    // começa mirando no triângulo (ou no que estiver do outro lado)
    const branca = P.bolas.find((b) => b.n === 0);
    this.ang = branca.x < 0 ? 0 : Math.PI;
    this.hudMira.hidden = false;
  }

  // o main.js tirou o foco (a vez passou, Esc, E, o botão)
  sairDaMira() {
    if (!this.mirando) return;
    this.mirando = false;
    this.carga = null;
    this.player.override = null;
    for (const lista of this.g3d.emCima) for (const o of lista) o.visible = !o.userData.areaDesligada;
    this.hudMira.hidden = true;
    this.world.canvas.style.cursor = '';
  }

  // o cursor (ou o dedo) no pano: a mira vai da branca até ele
  ligarPonteiro() {
    const canvas = this.world.canvas;
    const apontar = (e) => {
      const P = this.minhaMesa();
      if (!P?.bolas) return;
      const r = canvas.getBoundingClientRect();
      this.ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raio.setFromCamera(this.ponteiro, this.world.camera);
      const { origin: o, direction: d } = this.raio.ray;
      if (Math.abs(d.y) < 1e-4) return;
      const t = (S.altura + R - o.y) / d.y;
      if (t <= 0) return;
      const branca = P.bolas.find((b) => b.n === 0);
      const dx = o.x + d.x * t - (P.m.x + branca.x);
      const dz = o.z + d.z * t - (P.m.z + branca.z);
      if (dx * dx + dz * dz > 1e-4) this.ang = Math.atan2(dz, dx);
    };
    canvas.addEventListener('pointermove', (e) => {
      if (!this.mirando || document.pointerLockElement) return;
      apontar(e);
      canvas.style.cursor = 'crosshair';
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.mirando || document.pointerLockElement || e.button !== 0) return;
      apontar(e);
      if (this.minhaVez(this.minhaMesa())) this.carga = { desde: performance.now() };
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.mirando || e.button !== 0 || !this.carga) return;
      this.tacada();
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.mirando) return;
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 2);
      const P = this.minhaMesa();
      if (P) this.player.override = this.pose(P);
    }, { passive: true });
  }

  tacada() {
    const c = this.carga;
    this.carga = null;
    const P = this.minhaMesa();
    if (!c || !this.minhaVez(P)) return;
    const forca = vaiEVolta(c.desde, 1400);
    this.socket?.emit('sn-tacada', { mesa: P.i, ang: this.ang, forca: Math.round(forca * 1000) / 1000 });
    this.taco.visible = false;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt) {
    for (const P of this.mesas) {
      const f = P.filme;
      if (!f) continue;
      P.t += dt;
      const q = f.quadros.find((x) => x.t >= P.t) || f.quadros.at(-1);
      q.pos.forEach(([x, z, fora], k) => {
        const malha = P.malhas[f.antes[k][0]];
        const antes = f.ultimo?.[k];
        if (antes && !fora) {
          const dx = x - antes[0];
          const dz = z - antes[1];
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 1e-5) malha.rotateOnWorldAxis(_a.set(dz / d, 0, -dx / d), d / R);
        }
        malha.visible = !fora;
        malha.position.set(P.m.x + x, S.altura + R, P.m.z + z);
      });
      // uma bola caiu agora: o "toc" do bolso
      const caidasAgora = q.pos.filter((x) => x[2]).length;
      if (caidasAgora > f.somou) {
        f.somou = caidasAgora;
        if (this.perto(P.m, 12)) this.sfx.pedraPasso(0.5);
      }
      f.ultimo = q.pos;
      if (q === f.quadros.at(-1) && P.t > q.t + 0.5) {
        P.filme = null;
        if (P.e) this.arrumar(P, P.e.bolas);
      }
    }
    const P = this.minhaMesa();
    // a vez chegou: a câmera vai para cima da mesa (se o boneco estiver por perto)
    if (this.focoPedido && this.minhaVez(P) && this.ligado()) {
      this.focoPedido = false;
      if (!this.mirando && this.perto(P.m, 14)) this.focar?.();
    }
    // saiu da mesa (ou o jogo foi desligado) com a mira aberta
    if (this.mirando && (!P || !this.ligado())) this.soltarFoco?.();
    this.mirar(P);
  }

  // em foco, na sua vez: o taco, a faixa até onde a branca bate e a bola fantasma
  mirar(P) {
    const pode = this.mirando && this.minhaVez(P);
    this.taco.visible = this.fantasma.visible = this.faixaBranca.visible = pode;
    if (!pode) {
      this.faixaBola.visible = false;
      if (this.carga && !this.mirando) this.carga = null;
      if (this.mostrandoForca) {
        hud.forca(null);
        this.mostrandoForca = false;
      }
      return;
    }
    const ang = this.ang;
    const branca = P.bolas.find((b) => b.n === 0);
    const y = S.altura + R;
    const bx = P.m.x + branca.x;
    const bz = P.m.z + branca.z;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const carga = this.carga ? vaiEVolta(this.carga.desde, 1400) : 0;
    const recuo = R + 0.04 + carga * 0.35;
    this.taco.position.set(bx - dx * recuo, y + 0.03, bz - dz * recuo);
    this.taco.rotation.set(0, -ang, -0.07); // o cabo um pouco mais alto que a ponta
    const alvo = mira(P.bolas, ang);
    const yPano = S.altura + 0.004;
    const esticar = (f, x0, z0, x1, z1) => {
      f.position.set(x0, yPano, z0);
      f.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), 0);
      f.scale.set(Math.max(0.001, Math.hypot(x1 - x0, z1 - z0)), 1, 1);
    };
    esticar(this.faixaBranca, bx, bz, P.m.x + alvo.x, P.m.z + alvo.z);
    this.fantasma.position.set(P.m.x + alvo.x, y, P.m.z + alvo.z);
    this.faixaBola.visible = alvo.bola !== null;
    if (alvo.bola !== null) {
      // para onde a bola tocada vai: da bola fantasma para o centro dela
      const b = P.bolas.find((x) => x.n === alvo.bola);
      const ox = b.x - alvo.x;
      const oz = b.z - alvo.z;
      const d = Math.sqrt(ox * ox + oz * oz) || 1;
      esticar(this.faixaBola, P.m.x + b.x, P.m.z + b.z, P.m.x + b.x + (ox / d) * 0.7, P.m.z + b.z + (oz / d) * 0.7);
    }
    if (this.carga) {
      hud.forca(carga, carga > 0.85 ? '#ef4444' : '#4ade80');
      this.mostrandoForca = true;
    } else if (this.mostrandoForca) {
      hud.forca(null);
      this.mostrandoForca = false;
    }
  }

  // ---------------------------------------------------------------- teclas
  // a mesa perto do boneco (para o E)
  mesaPerto() {
    const p = this.player.pos;
    return this.mesas.find((P) => Math.abs(p.x - P.m.x) < S.comp / 2 + 2.6 && Math.abs(p.z - P.m.z) < S.larg / 2 + 2.6 && p.y < 2) || null;
  }

  usarE() {
    if (!this.ligado()) return false;
    const minha = this.minhaMesa();
    const P = this.mesaPerto();
    if (minha && (!P || P === minha)) {
      this.socket?.emit('sn-sair');
      hud.mensagem('Saiu da mesa', '', 1200);
      return true;
    }
    if (!P) return false;
    if (P.e?.jogadores.length >= 2) {
      hud.mensagem('Mesa cheia', P.e.jogadores.map((j) => j.nome).join(' × '), 1600);
      return true;
    }
    this.socket?.emit('sn-entrar', { mesa: P.i }, (r) => {
      if (r?.ok) hud.mensagem('Sinuca', 'Na sua vez a câmera vai para cima da mesa: aponte no pano, segure o clique e solte', 3200, '#4ade80');
    });
    return true;
  }

  // clique (ou F) andando, na sua vez: volta para a mira
  apertou() {
    const P = this.minhaMesa();
    if (!P || !this.ligado()) return false;
    if (this.minhaVez(P) && !this.mirando && this.perto(P.m, 14)) this.focar?.();
    return true; // na mesa, o clique é da sinuca (não soca nem foca tela)
  }

  soltou() {}

  ativo() {
    return this.ligado() && !!this.minhaMesa();
  }

  dica(livre) {
    if (!livre || !this.ligado()) return '';
    const minha = this.minhaMesa();
    if (minha) {
      const e = minha.e;
      if (this.mirando) return this.minhaVez(minha) ? 'Aponte no pano para mirar · <kbd>Clique</kbd>segure e solte · roda do mouse aproxima · <kbd>Esc</kbd>andar' : '';
      if (e.fase === 'rolando' || minha.filme) return '';
      if (e.jogadores[e.vez]?.id === this.eu) return '<kbd>Clique</kbd>voltar para a mira · <kbd>E</kbd>sair da mesa';
      return `Vez de ${e.jogadores[e.vez]?.nome || '…'}: ande à vontade · <kbd>E</kbd>sair da mesa`;
    }
    const P = this.mesaPerto();
    if (!P) return '';
    if (P.e?.jogadores.length >= 2) return `Sinuca: ${P.e.jogadores.map((j) => j.nome).join(' × ')}`;
    return `<kbd>E</kbd>Jogar sinuca${P.e?.jogadores.length === 1 ? ` com ${P.e.jogadores[0].nome}` : ''}`;
  }

  lugar() {
    const m = S.mesas[0];
    return { nome: 'Sinuca', desc: 'Salão de jogos · bola 8, até dois por mesa', cor: '#16a34a', pos: [m.x, 0, m.z - S.larg / 2 - 1.6], yaw: Math.PI };
  }

  // o botão de sair da mira (no celular não tem Esc)
  montarHud() {
    this.hudMira = document.createElement('button');
    this.hudMira.type = 'button';
    this.hudMira.id = 'sn-sair-mira';
    this.hudMira.hidden = true;
    this.hudMira.textContent = 'Andar (sair da mira)';
    this.hudMira.addEventListener('click', () => this.soltarFoco?.());
    const css = document.createElement('style');
    css.textContent = `#sn-sair-mira { position: fixed; top: 64px; right: 16px; z-index: 32; padding: 9px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18);
  background: rgba(15,23,42,.86); color: #f8fafc; font: 700 14px 'Plus Jakarta Sans', system-ui, sans-serif; cursor: pointer; }
#sn-sair-mira[hidden] { display: none; }`;
    document.head.appendChild(css);
    document.body.appendChild(this.hudMira);
  }
}
