// A gincana em 3D: monta as fases (gincana-fases.js) e mexe nos obstáculos delas todo quadro.
// Este arquivo só é baixado quando alguém entra na gincana (import dinâmico em gincana.js), e cada
// fase só é montada quando vai ser jogada: quem não joga não carrega nada disso.
//
// Cada fase é um grupo no lugar dela (origemDa), escondido enquanto não está valendo. As colisões
// também: só entram em world.colliders com a fase ativa (ativar) e saem quando ela acaba. O que
// empurra (varredores, pêndulos, bolas, paredões, socadores) só mexe no boneco de quem joga aqui.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  origemDa, nomeDaFase, posMovel, anguloVarredor, cabecaPendulo, portasSolidas, caminhoPisaLeve, sumidaEstado,
  socadorExt, bolasEm, vidaDaBola, barraAngulo, barraVel, barraSobe, barraPassou, paredesEm, memoriaEm, memoriaRodada, FRUTAS, gosmaY,
} from './gincana-dados.js';
import { texturaViva, FONTE } from './hud-jogos.js';

const LONGE = -9999; // colisor "tirado do mundo" (portão aberto, porta falsa, piso que caiu)
const HW = 0.36; // meia largura do boneco (player.js)
const ALTURA = 1.8;
const PALETA = {
  branco: 0xf8fafc, rosa: 0xf9a8d4, lilas: 0xc4b5fd, azul: 0x7dd3fc, amarelo: 0xfde047, verde: 0x86efac,
  laranja: 0xfdba74, roxo: 0x8b5cf6, vermelho: 0xef4444, escuro: 0x475569, ciano: 0x22d3ee,
};
const CORES_PORTA = ['rosa', 'azul', 'amarelo', 'verde', 'laranja', 'lilas', 'ciano'];
const CORES_HEX = [0xfde047, 0x7dd3fc, 0xf9a8d4];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// um material por cor, para todas as fases (compila uma vez só). Um pouco de brilho próprio: à
// noite a gincana continua colorida
const MATS = {};
function mat(cor) {
  if (!MATS[cor]) {
    const c = PALETA[cor] ?? cor;
    MATS[cor] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.14 });
  }
  return MATS[cor];
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

function placa(texto, cor, larg = 8) {
  const tex = texturaViva(THREE, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#f8fafc';
    // a fonte encolhe até o texto caber
    let px = 66;
    ctx.font = FONTE(px);
    while (px > 24 && ctx.measureText(texto).width > w - 40) ctx.font = FONTE((px -= 4));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, w / 2, h / 2 - 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(larg, larg / 4, 1);
  return s;
}

const caixaGeo = ([x0, y0, z0, x1, y1, z1]) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
function malha(geo, material, sombra = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = sombra;
  m.receiveShadow = true;
  return m;
}

// o grupo de todas as fases: direto na cena (o lado de fora do mapa some enquanto se joga aqui)
export function criarRaiz(world) {
  const raiz = new THREE.Group();
  raiz.name = 'gincana';
  world.scene.add(raiz);
  return raiz;
}

export const montarFase = (world, k, def, raiz, sfx) => new Fase3D(world, k, def, raiz, sfx);

// ------------------------------------------------------------------ uma fase
class Fase3D {
  constructor(world, k, def, raiz, sfx) {
    this.world = world;
    this.sfx = sfx;
    this.k = k;
    this.def = def;
    this.o = origemDa(k);
    this.grupo = new THREE.Group();
    this.grupo.position.set(this.o.x, this.o.y, this.o.z);
    this.grupo.visible = false;
    raiz.add(this.grupo);
    this.colisores = [];
    this.pecas = [];
    this.ativa = false;
    this.semente = 1;
    this.p = new THREE.Vector3(); // o boneco, nas coordenadas da fase
    this.montar();
  }

  // colisor numa caixa da fase (coordenadas dela): fica guardado aqui até a fase valer (ativar)
  colisor(c, data = {}) {
    const o = this.o;
    const col = this.world.addBox({ min: [c[0] + o.x, c[1] + o.y, c[2] + o.z], max: [c[3] + o.x, c[4] + o.y, c[5] + o.z], data });
    this.world.colliders.pop();
    this.colisores.push(col);
    return col;
  }

  montar() {
    const d = this.def;
    pecaCaixas(this, d.caixas || []);
    pecaGosma(this, d.gosma);
    pecaEnfeites(this);
    const nome = placa(`${nomeDaFase(this.k)} · ${d.nome}`.toUpperCase(), d.cor, 8);
    nome.position.set(0, d.portao ? 9 : 12, d.portao ? 0.3 : 0);
    this.grupo.add(nome);
    if (d.portao) {
      const c = d.portao;
      const m = malha(caixaGeo(c), new THREE.MeshStandardMaterial({ color: 0xf472b6, transparent: true, opacity: 0.55, emissive: 0xf472b6, emissiveIntensity: 0.3 }), false);
      this.grupo.add(m);
      this.portao = { malha: m, col: guardar(this.colisor(c)) };
    }
    if (d.arco) pecaArco(this, d.arco);
    const tipos = [
      ['moveis', pecaMoveis], ['varredores', pecaVarredores], ['pendulos', pecaPendulos], ['portas', pecaPortas],
      ['pisaLeve', pecaPisaLeve], ['esteiras', pecaEsteiras], ['ventos', pecaVentos], ['pads', pecaPads],
      ['sumidas', pecaSumidas], ['bolas', pecaBolas], ['paredes', pecaParedes], ['memoria', pecaMemoria],
      ['discos', pecaDiscos], ['barras', pecaBarras], ['socadores', pecaSocadores], ['hex', pecaHex],
    ];
    for (const [campo, criar] of tipos) if (d[campo]) this.pecas.push(criar(this, d[campo]));
    this.hex = this.pecas.find((p) => p.hex) || null;
  }

  ativar() {
    if (this.ativa) return;
    this.ativa = true;
    this.grupo.visible = true;
    this.world.colliders.push(...this.colisores);
  }

  desativar() {
    if (!this.ativa) return;
    this.ativa = false;
    this.grupo.visible = false;
    const sai = new Set(this.colisores);
    this.world.colliders = this.world.colliders.filter((c) => !sai.has(c));
  }

  // rodada nova (ou chegando no meio dela): o sorteio da fase e o que já quebrou
  preparar(semente, quebrados = []) {
    this.semente = semente;
    for (const p of this.pecas) p.preparar?.(semente);
    for (const id of quebrados) this.quebrar(id, true);
  }

  // uma porta ou piso falso quebrou (de fora: alguém quebrou, ou já estava quebrado)
  quebrar(id, deFora) {
    for (const p of this.pecas) p.quebrar?.(id, deFora);
  }

  marcarPiso(id, falta) {
    this.hex?.marcar(id, falta);
  }

  abrirPortao(aberto) {
    const p = this.portao;
    if (!p || p.aberto === aberto) return;
    p.aberto = aberto;
    p.malha.visible = !aberto;
    if (aberto) tirar(p.col);
    else repor(p.col);
  }

  // o texto do placar que a fase quer mostrar agora ('' nada)
  status(tf) {
    for (const p of this.pecas) {
      const s = p.status?.(tf);
      if (s) return s;
    }
    return '';
  }

  // todo quadro com a fase ativa. ctx (só com o boneco aqui dentro): { pl, dt, t, tf, jogando,
  // empurrar(vx, vy, vz), quebrar(id), pisar(id), sfx }
  update(dt, t, tf, ctx) {
    if (ctx) {
      const pos = ctx.pl.pos;
      this.p.set(pos.x - this.o.x, pos.y - this.o.y, pos.z - this.o.z);
      ctx.p = this.p;
      ctx.o = this.o;
    }
    for (const p of this.pecas) p.update?.(dt, t, tf);
    if (ctx) for (const p of this.pecas) p.tocar?.(ctx);
    this.world.marcarSombra?.(); // os obstáculos andam: a sombra deles também
  }
}

// ------------------------------------------------------------------ peças paradas
// as caixas paradas: uma malha por cor (poucos desenhos) e um colisor por caixa
function pecaCaixas(f, lista) {
  const porCor = new Map();
  for (const { c, cor } of lista) {
    if (!porCor.has(cor)) porCor.set(cor, []);
    porCor.get(cor).push(caixaGeo(c));
    f.colisor(c);
  }
  for (const [cor, geos] of porCor) {
    f.grupo.add(malha(mergeGeometries(geos), mat(cor)));
    for (const g of geos) g.dispose();
  }
}

// a gosma lá embaixo (na Sobe a Gosma, ela sobe)
let texGosma = null;
function pecaGosma(f, G) {
  if (!texGosma) {
    texGosma = texturaViva(THREE, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % w;
        const y = (i * 61 + (i % 7) * 23) % h;
        const r = 6 + ((i * 13) % 18);
        ctx.fillStyle = i % 3 ? 'rgba(251,207,232,0.45)' : 'rgba(190,24,93,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    texGosma.wrapS = texGosma.wrapT = THREE.RepeatWrapping;
    texGosma.repeat.set(400, 400);
  }
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: texGosma, color: 0xffffff, emissive: 0xdb2777, emissiveIntensity: 0.35, roughness: 0.25 }),
  );
  g.receiveShadow = true;
  f.grupo.add(g);
  f.pecas.push({
    update(dt, t, tf) {
      g.position.y = (G ? gosmaY(G, tf) : -26) + Math.sin(t * 0.9) * 0.12;
      texGosma.offset.set(t * 0.01, t * 0.006);
    },
    status: G ? (tf) => (tf > 0 ? `a gosma está a <b>${Math.max(0, f.p.y - gosmaY(G, tf)).toFixed(0)} m</b>` : '') : null,
  });
}

// ilhas e balões flutuando em volta (só enfeite, sem colisão)
function pecaEnfeites(f) {
  const cores = ['rosa', 'lilas', 'azul', 'amarelo', 'verde', 'laranja'];
  let s = f.k * 7 + 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geoIlha = new THREE.CylinderGeometry(1, 0.6, 1, 10);
  const geoBalao = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 70 + rnd() * 70;
    const balao = i % 2 === 0;
    const m = new THREE.Mesh(balao ? geoBalao : geoIlha, mat(cores[i % cores.length]));
    const tam = balao ? 3 + rnd() * 4 : 6 + rnd() * 10;
    m.scale.set(tam, balao ? tam * 1.2 : 2 + rnd() * 2, tam);
    m.position.set(Math.cos(a) * d, -12 + rnd() * 40, 40 + Math.sin(a) * d);
    f.grupo.add(m);
  }
}

// o arco da chegada
function pecaArco(f, a) {
  const m = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x14532d, emissiveIntensity: 0.5 });
  for (const x of [a.x0 + 0.5, a.x1 - 0.5]) {
    const p = malha(new THREE.BoxGeometry(0.8, 6, 0.8), m);
    p.position.set(x, a.y + 3, a.z);
    f.grupo.add(p);
  }
  const topo = malha(new THREE.BoxGeometry(a.x1 - a.x0, 1, 0.8), m);
  topo.position.set((a.x0 + a.x1) / 2, a.y + 6.3, a.z);
  const nome = placa('CHEGADA', '#22c55e', 9);
  nome.position.set((a.x0 + a.x1) / 2, a.y + 8, a.z);
  f.grupo.add(topo, nome);
}

// ------------------------------------------------------------------ o que anda pelo relógio
function pecaMoveis(f, lista) {
  const itens = lista.map((m) => {
    const [hx, hy, hz] = m.meia;
    const ma = malha(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat(m.cor || 'amarelo'));
    f.grupo.add(ma);
    const col = f.colisor([m.x - hx, m.y - hy, m.z - hz, m.x + hx, m.y + hy, m.z + hz], { move: true });
    return { m, ma, col };
  });
  return {
    update(dt, t) {
      for (const { m, ma, col } of itens) {
        _p.set(m.x, m.y, m.z);
        _p[m.eixo] += posMovel(m, t);
        ma.position.copy(_p);
        _p.add(f.o);
        const [hx, hy, hz] = m.meia;
        col.delta.set(_p.x - hx - col.min.x, _p.y - hy - col.min.y, _p.z - hz - col.min.z);
        col.min.set(_p.x - hx, _p.y - hy, _p.z - hz);
        col.max.set(_p.x + hx, _p.y + hy, _p.z + hz);
      }
    },
  };
}

// varredores: barras que giram em volta de um eixo, na altura das canelas (pule!)
function pecaVarredores(f, lista) {
  const itens = lista.map((v) => {
    const barra = malha(new THREE.CylinderGeometry(0.35, 0.35, v.raio * 2, 12).rotateZ(Math.PI / 2), mat('vermelho'));
    barra.position.set(v.x, v.y + (v.y0 + v.y1) / 2, v.z);
    const eixo = malha(new THREE.CylinderGeometry(0.5, 0.6, v.y1 + 0.5, 16), mat('escuro'));
    eixo.position.set(v.x, v.y + (v.y1 + 0.5) / 2, v.z);
    f.grupo.add(barra, eixo);
    f.colisor([v.x - 0.4, v.y, v.z - 0.4, v.x + 0.4, v.y + v.y1 + 0.5, v.z + 0.4]);
    return { v, barra };
  });
  return {
    update(dt, t) {
      for (const { v, barra } of itens) barra.rotation.y = -anguloVarredor(v, t);
    },
    tocar(ctx) {
      const p = ctx.p;
      for (const { v } of itens) {
        if (Math.abs(p.z - v.z) > v.raio + 1 || Math.abs(p.x - v.x) > v.raio + 1) continue;
        if (!(p.y < v.y + v.y1 && p.y + ALTURA > v.y + v.y0)) continue;
        const a = anguloVarredor(v, ctx.t);
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        // o ponto da barra mais perto do boneco
        const s = limitar((p.x - v.x) * cx + (p.z - v.z) * cz, -v.raio, v.raio);
        const dx = p.x - (v.x + cx * s);
        const dz = p.z - (v.z + cz * s);
        if (dx * dx + dz * dz > 0.75 * 0.75) continue;
        const sinal = Math.sign(v.vel) * Math.sign(s || 1);
        ctx.empurrar(-cz * sinal * 14, 7, cx * sinal * 14);
        return;
      }
    },
  };
}

// pêndulos: o martelo balança de lado (plano 'x') ou de frente (plano 'z') embaixo de uma viga
function pecaPendulos(f, lista) {
  const itens = lista.map((p) => {
    const meia = p.meia ?? 9;
    const deLado = p.plano === 'x';
    for (const s of [-1, 1]) {
      const poste = malha(new THREE.BoxGeometry(0.5, p.eixo + 1, 0.5), mat('escuro'));
      poste.position.set(p.x + s * meia, p.y + p.eixo / 2 - 0.5, p.z);
      f.grupo.add(poste);
    }
    const viga = malha(new THREE.BoxGeometry(meia * 2 + 0.5, 0.5, 0.5), mat('escuro'));
    viga.position.set(p.x, p.y + p.eixo, p.z);
    const giro = new THREE.Group();
    giro.position.set(p.x, p.y + p.eixo, p.z);
    const braco = malha(new THREE.CylinderGeometry(0.08, 0.08, p.braco, 6).translate(0, -p.braco / 2, 0), mat('branco'));
    const geo = new THREE.CylinderGeometry(p.raio * 0.9, p.raio * 0.9, p.raio * 2.2, 18);
    if (deLado) geo.rotateX(Math.PI / 2);
    else geo.rotateZ(Math.PI / 2);
    const cabeca = malha(geo.translate(0, -p.braco, 0), mat('amarelo'));
    giro.add(braco, cabeca);
    f.grupo.add(viga, giro);
    return { p, giro, deLado };
  });
  return {
    update(dt, t) {
      for (const { p, giro, deLado } of itens) {
        const a = cabecaPendulo(p, t).a;
        if (deLado) giro.rotation.z = a;
        else giro.rotation.x = -a;
      }
    },
    tocar(ctx) {
      const P = ctx.p;
      for (const { p, deLado } of itens) {
        if (Math.abs(P.z - p.z) > p.braco + 2 || Math.abs(P.x - p.x) > p.braco + 2) continue;
        const c = cabecaPendulo(p, ctx.t);
        const hx = p.x + (deLado ? c.d : 0);
        const hz = p.z + (deLado ? 0 : c.d);
        // ao longo do eixo do martelo (comprido) e no plano em que ele balança (redondo)
        const aoLongo = deLado ? Math.abs(P.z - hz) : Math.abs(P.x - hx);
        if (aoLongo > p.raio * 1.1 + HW) continue;
        const noPlano = deLado ? Math.hypot(P.x - hx, P.y + 0.9 - c.y) : Math.hypot(P.z - hz, P.y + 0.9 - c.y);
        if (noPlano > p.raio * 0.9 + 0.55) continue;
        const dir = Math.sign(c.w || 1);
        if (deLado) ctx.empurrar(dir * 16, 7.5, 0);
        else ctx.empurrar(0, 7.5, dir * 16);
        return;
      }
    },
  };
}

// os paredões de portas: as de verdade seguram (têm colisor); as falsas deixam passar e quebram
function pecaPortas(f, paredes) {
  const portas = [];
  paredes.forEach((w, iw) => {
    w.vaos.forEach((v, k) => {
      const ma = malha(new THREE.BoxGeometry(v.x1 - v.x0, w.alt, 0.5), mat(CORES_PORTA[k % CORES_PORTA.length]));
      ma.position.set((v.x0 + v.x1) / 2, w.alt / 2, w.z);
      f.grupo.add(ma);
      const col = guardar(f.colisor([v.x0, 0, w.z - 0.25, v.x1, w.alt, w.z + 0.25]));
      portas[v.id] = { ma, col, w, iw, k, v, solida: false, quebrada: false, caindo: 0 };
    });
  });
  const caindo = new Set();
  const peca = {
    preparar(semente) {
      caindo.clear();
      paredes.forEach((w, iw) => {
        const solidas = portasSolidas(semente, iw, w.vaos.length, w.solidas);
        w.vaos.forEach((v, k) => {
          const p = portas[v.id];
          p.solida = solidas.has(k);
          p.quebrada = false;
          p.ma.visible = true;
          p.ma.rotation.set(0, 0, 0);
          p.ma.position.set((v.x0 + v.x1) / 2, w.alt / 2, w.z);
          if (p.solida) repor(p.col);
          else tirar(p.col);
        });
      });
    },
    quebrar(id, deFora) {
      const p = portas[id];
      if (!p || p.solida || p.quebrada) return;
      p.quebrada = true;
      p.caindo = 0;
      caindo.add(p);
      if (!deFora) f.sfx?.pedraQuebra?.(0.6);
    },
    update(dt) {
      // a porta falsa tomba para a frente e some
      for (const p of caindo) {
        p.caindo = Math.min(1, p.caindo + dt * 2.6);
        const a = p.caindo * 1.45;
        p.ma.rotation.x = a;
        p.ma.position.y = (p.w.alt / 2) * Math.cos(a);
        p.ma.position.z = p.w.z + (p.w.alt / 2) * Math.sin(a);
        if (p.caindo >= 1) {
          p.ma.visible = false;
          caindo.delete(p);
        }
      }
    },
    tocar(ctx) {
      if (!ctx.jogando) return;
      const P = ctx.p;
      for (const w of paredes) {
        if (Math.abs(P.z - w.z) > 0.7 || P.y > w.alt) continue;
        for (const v of w.vaos) {
          const p = portas[v.id];
          if (p.solida || p.quebrada || P.x < v.x0 - 0.3 || P.x > v.x1 + 0.3) continue;
          peca.quebrar(v.id, false);
          ctx.quebrar(v.id);
        }
      }
    },
  };
  return peca;
}

// o Pisa Leve: pisos iguais; os falsos tremem quando alguém pisa e caem (para todos)
function pecaPisaLeve(f, P) {
  const n = P.campos.length * P.cols * P.rows;
  const ma = new THREE.InstancedMesh(new THREE.BoxGeometry(P.tam, P.esp, P.tam), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x0e7490, emissiveIntensity: 0.15 }), n);
  ma.castShadow = ma.receiveShadow = true;
  ma.frustumCulled = false; // os pisos caem: a esfera do desenho de um só não serve
  f.grupo.add(ma);
  const pisos = [];
  for (const c of P.campos) {
    for (let r = 0; r < P.rows; r++) {
      for (let k = 0; k < P.cols; k++) {
        const id = c.base + r * P.cols + k;
        const x = c.x0 + k * P.passo + P.tam / 2;
        const z = c.z0 + r * P.passo + P.tam / 2;
        const col = guardar(f.colisor([x - P.tam / 2, P.y - P.esp, z - P.tam / 2, x + P.tam / 2, P.y, z + P.tam / 2]));
        pisos[id] = { id, x, z, col, falso: false, desde: 0 };
      }
    }
  }
  const pousar = (p, dy = 0, dx = 0, dz = 0, escala = 1) => ma.setMatrixAt(p.id, _m.compose(_p.set(p.x + dx, P.y - P.esp / 2 + dy, p.z + dz), _q.identity(), _s.setScalar(escala)));
  const tremendo = new Set();
  const peca = {
    preparar(semente) {
      tremendo.clear();
      P.campos.forEach((c, ic) => {
        const certos = caminhoPisaLeve(semente, ic, P.cols, P.rows);
        for (let i = 0; i < P.cols * P.rows; i++) {
          const p = pisos[c.base + i];
          p.falso = !certos.has(i);
          p.desde = 0;
          repor(p.col);
          if (p.falso) p.col.data.falso = p.id;
          else delete p.col.data.falso;
          pousar(p);
          ma.setColorAt(p.id, _c.set(0xa5f3fc));
        }
      });
      ma.instanceMatrix.needsUpdate = true;
      if (ma.instanceColor) ma.instanceColor.needsUpdate = true;
    },
    quebrar(id, deFora) {
      const p = pisos[id];
      if (!p || !p.falso || p.desde) return;
      p.desde = performance.now();
      tremendo.add(p);
      ma.setColorAt(id, _c.set(0xfca5a5));
      if (ma.instanceColor) ma.instanceColor.needsUpdate = true;
      f.sfx?.pedraQuebra?.(deFora ? 0.25 : 0.5);
    },
    update() {
      if (!tremendo.size) return;
      const agora = performance.now();
      for (const p of tremendo) {
        const s = (agora - p.desde) / 1000;
        if (s < 0.4) pousar(p, 0, Math.sin(s * 70) * 0.06, Math.cos(s * 55) * 0.06);
        else {
          if (p.col.min.y !== LONGE) tirar(p.col);
          const u = s - 0.4;
          pousar(p, -15 * u * u, 0, 0, u > 1.5 ? 0 : 1);
          if (u > 1.5) tremendo.delete(p);
        }
      }
      ma.instanceMatrix.needsUpdate = true;
    },
    tocar(ctx) {
      if (!ctx.jogando) return;
      const id = ctx.pl.grounded ? ctx.pl.ground?.data?.falso : undefined;
      if (id === undefined || pisos[id].desde) return;
      peca.quebrar(id, false);
      ctx.quebrar(id);
    },
  };
  return peca;
}

// esteiras: o chão anda (setas correndo) e leva quem está em cima
let texSetas = null;
function pecaEsteiras(f, lista) {
  texSetas ||= texturaViva(THREE, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    for (const y of [36, 92]) {
      ctx.beginPath();
      ctx.moveTo(22, y + 22);
      ctx.lineTo(64, y - 14);
      ctx.lineTo(106, y + 22);
      ctx.stroke();
    }
  });
  const itens = lista.map((e) => {
    const [x0, y0, z0, x1, y1, z1] = e.c;
    const tex = texSetas.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((x1 - x0) / 4, (z1 - z0) / 4);
    tex.needsUpdate = true;
    const corpo = malha(caixaGeo([x0, y0, z0, x1, y1 - 0.02, z1]), mat('escuro'));
    const topo = malha(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2, roughness: 0.6 }), false);
    topo.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2);
    f.grupo.add(corpo, topo);
    f.colisor(e.c, { esteira: e });
    return { e, tex };
  });
  return {
    update(dt) {
      // as setas apontam para -z na textura (v crescente): andar para -z é tirar do offset
      for (const { e, tex } of itens) tex.offset.y += (e.vz / 4) * dt;
    },
    tocar(ctx) {
      const e = ctx.pl.grounded ? ctx.pl.ground?.data?.esteira : null;
      if (!e) return;
      if (e.vx) ctx.pl.moveAxis('x', e.vx * ctx.dt);
      if (e.vz) ctx.pl.moveAxis('z', e.vz * ctx.dt);
    },
  };
}

// ventiladores: um vento de lado dentro da caixa deles (no chão e no ar)
function pecaVentos(f, lista) {
  const brilho = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const itens = lista.map((v) => {
    const sentido = Math.sign(v.vx || v.vz);
    const g = new THREE.Group();
    g.position.set(v.fan.x, v.fan.y, v.fan.z);
    g.rotation.y = v.vx ? (sentido > 0 ? Math.PI / 2 : -Math.PI / 2) : sentido > 0 ? 0 : Math.PI;
    const aro = malha(new THREE.TorusGeometry(2.4, 0.25, 10, 32), mat('branco'));
    const pe = malha(new THREE.BoxGeometry(0.4, v.fan.y + 1, 0.4).translate(0, -(v.fan.y + 1) / 2, 0), mat('escuro'));
    const helice = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const pa = malha(new THREE.BoxGeometry(0.5, 2.1, 0.12).translate(0, 1.05, 0), mat('ciano'));
      pa.rotation.z = (i * Math.PI * 2) / 3;
      helice.add(pa);
    }
    g.add(aro, pe, helice);
    f.grupo.add(g);
    // riscos de vento correndo pela caixa
    const [x0, y0, z0, x1, y1, z1] = v.c;
    const riscos = [];
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(v.vx ? 1.6 : 0.06, 0.06).rotateY(v.vx ? 0 : Math.PI / 2), brilho);
      r.userData.u = i / 10;
      r.position.set(0, Math.max(0, y0) + 0.4 + ((i * 7) % 10) * 0.45, z0 + ((i * 3) % 10) * ((z1 - z0) / 10));
      if (!v.vx) r.position.x = x0 + ((i * 3) % 10) * ((x1 - x0) / 10);
      f.grupo.add(r);
      riscos.push(r);
    }
    return { v, helice, riscos };
  });
  return {
    update(dt) {
      for (const { v, helice, riscos } of itens) {
        helice.rotation.z += dt * 14;
        const [x0, , z0, x1, , z1] = v.c;
        for (const r of riscos) {
          r.userData.u = (r.userData.u + dt * 0.9) % 1;
          if (v.vx) r.position.x = v.vx > 0 ? x0 + r.userData.u * (x1 - x0) : x1 - r.userData.u * (x1 - x0);
          else r.position.z = v.vz > 0 ? z0 + r.userData.u * (z1 - z0) : z1 - r.userData.u * (z1 - z0);
        }
      }
    },
    tocar(ctx) {
      const p = ctx.p;
      for (const { v } of itens) {
        const [x0, y0, z0, x1, y1, z1] = v.c;
        if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || p.y < y0 - 0.5 || p.y > y1) continue;
        if (v.vx) ctx.pl.moveAxis('x', v.vx * ctx.dt);
        if (v.vz) ctx.pl.moveAxis('z', v.vz * ctx.dt);
      }
    },
  };
}

// trampolins: o 'pad' do player.js (joga para cima com a força dele)
function pecaPads(f, lista) {
  const itens = lista.map((p) => {
    const base = malha(new THREE.CylinderGeometry(p.r, p.r * 1.1, 0.3, 24), mat('escuro'));
    base.position.set(p.x, p.y + 0.15, p.z);
    const topo = malha(new THREE.CylinderGeometry(p.r * 0.85, p.r * 0.85, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfacc15, emissiveIntensity: 0.6 }), false);
    topo.position.set(p.x, p.y + 0.32, p.z);
    f.grupo.add(base, topo);
    const r = p.r * 0.8;
    f.colisor([p.x - r, p.y, p.z - r, p.x + r, p.y + 0.3, p.z + r], { type: 'pad', strength: p.forca });
    return topo;
  });
  return {
    update(dt, t) {
      itens.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t * 6 + i) * 0.05));
    },
  };
}

// plataformas que somem e voltam (piscam antes de sumir); apagadas ficam um fantasma
function pecaSumidas(f, lista) {
  const itens = lista.map((s, i) => {
    const m = new THREE.MeshStandardMaterial({ color: PALETA[i % 2 ? 'ciano' : 'verde'], transparent: true, roughness: 0.5, emissive: PALETA[i % 2 ? 'ciano' : 'verde'], emissiveIntensity: 0.2 });
    const ma = malha(caixaGeo(s.c), m);
    f.grupo.add(ma);
    return { s, ma, m, col: guardar(f.colisor(s.c)), ligada: true };
  });
  return {
    update(dt, t) {
      for (const it of itens) {
        const { ligada, aviso } = sumidaEstado(it.s, t);
        if (ligada !== it.ligada) {
          it.ligada = ligada;
          if (ligada) repor(it.col);
          else tirar(it.col);
          it.ma.castShadow = ligada;
        }
        it.m.opacity = !ligada ? 0.12 : aviso && Math.sin(t * 38) > 0 ? 0.35 : 1;
      }
    },
  };
}

// bolas (e frutas) rolando ladeira abaixo: encostou, é jogado para trás
let texBola = null;
function pecaBolas(f, B) {
  texBola ||= texturaViva(THREE, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15,23,42,0.18)';
    for (let i = 0; i < 4; i++) ctx.fillRect((i * w) / 4, 0, w / 8, h);
  });
  const vida = vidaDaBola(B);
  const porFaixa = Math.ceil(vida / Math.min(...B.periodos)) + 1;
  const n = B.faixas.length * porFaixa;
  const material = B.fruta
    ? new THREE.MeshStandardMaterial({ color: PALETA[B.cor] ?? 0xfdba74, roughness: 0.4, emissive: PALETA[B.cor] ?? 0xfdba74, emissiveIntensity: 0.15 })
    : new THREE.MeshStandardMaterial({ map: texBola, color: PALETA[B.cor] ?? 0xef4444, roughness: 0.4, emissive: PALETA[B.cor] ?? 0xef4444, emissiveIntensity: 0.12 });
  const ma = new THREE.InstancedMesh(new THREE.SphereGeometry(B.r, 24, 16), material, n);
  ma.castShadow = true;
  ma.frustumCulled = false;
  f.grupo.add(ma);
  const vivas = [];
  return {
    update(dt, t) {
      vivas.length = 0;
      for (let i = 0; i < n; i++) ma.setMatrixAt(i, _m.makeScale(0, 0, 0));
      bolasEm(B, t, (i, j, x, y, z, rolou) => {
        if (j >= porFaixa) return;
        _q.setFromEuler(_e.set(-rolou / B.r, 0, 0));
        ma.setMatrixAt(i * porFaixa + j, _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)));
        vivas.push(x, y, z);
      });
      ma.instanceMatrix.needsUpdate = true;
    },
    tocar(ctx) {
      const p = ctx.p;
      const alcance = B.r + 0.55;
      for (let i = 0; i < vivas.length; i += 3) {
        const dx = p.x - vivas[i];
        const dy = p.y + 0.9 - vivas[i + 1];
        const dz = p.z - vivas[i + 2];
        if (dx * dx + dy * dy + dz * dz > alcance * alcance) continue;
        ctx.empurrar(Math.sign(dx || 1) * 3, B.forca * 0.5, -B.forca);
        return;
      }
    },
  };
}

// ------------------------------------------------------------------ o que anda com a fase
// os paredões do Bloco a Bloco (cada um: células de 4 m, cheias, vazias, baixas ou altas)
function pecaParedes(f, P) {
  const w = (P.x1 - P.x0) / P.celulas;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const cores = { cheio: mat('roxo'), baixo: mat('amarelo'), alto: mat('laranja') };
  const slots = [0, 1, 2, 3].map(() => Array.from({ length: P.celulas }, () => {
    const m = malha(geo, cores.cheio);
    m.visible = false;
    f.grupo.add(m);
    return m;
  }));
  const vivas = [];
  let semente = 1;
  return {
    preparar(s) {
      semente = s;
    },
    update(dt, t, tf) {
      vivas.length = 0;
      const usados = new Set();
      paredesEm(semente, P, tf, (j, z, vel, tipos) => {
        const slot = slots[j % slots.length];
        usados.add(slot);
        tipos.forEach((tipo, i) => {
          const m = slot[i];
          m.visible = tipo !== 'vazio';
          if (!m.visible) return;
          const [y0, y1] = P.alturas[tipo];
          m.material = cores[tipo];
          m.scale.set(w - 0.06, y1 - y0, P.esp);
          m.position.set(P.x0 + (i + 0.5) * w, (y0 + y1) / 2, z);
        });
        vivas.push({ z, vel, tipos });
      });
      for (const slot of slots) if (!usados.has(slot)) for (const m of slot) m.visible = false;
    },
    tocar(ctx) {
      const p = ctx.p;
      const pl = ctx.pl;
      for (const pw of vivas) {
        if (p.z + HW < pw.z - P.esp / 2 || p.z - HW > pw.z + P.esp / 2) continue;
        for (let i = 0; i < pw.tipos.length; i++) {
          const tipo = pw.tipos[i];
          if (tipo === 'vazio') continue;
          const [y0, y1] = P.alturas[tipo];
          const x0 = P.x0 + i * w;
          if (p.x + HW <= x0 || p.x - HW >= x0 + w || p.y >= y1 || p.y + ALTURA <= y0) continue;
          // na frente do paredão: vai junto com ele; atrás (entrou pelas costas): sai por trás
          if (p.z <= pw.z) {
            pl.pos.z = ctx.o.z + pw.z - P.esp / 2 - HW - 0.02;
            pl.vel.z = Math.min(pl.vel.z, -pw.vel);
          } else {
            pl.pos.z = ctx.o.z + pw.z + P.esp / 2 + HW + 0.02;
            pl.vel.z = Math.max(pl.vel.z, 0);
          }
          return;
        }
      }
    },
  };
}

// a memória: 16 pisos com frutas e o telão que pede uma
function texturaFruta(i) {
  const fr = FRUTAS[i];
  return texturaViva(THREE, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fr ? fr.cor : '#94a3b8';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 8, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fr ? '120px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' : FONTE(150);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(fr ? fr.emoji : '?', w / 2, h / 2 - 2);
    ctx.font = FONTE(30);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(fr ? fr.nome.toUpperCase() : '', w / 2, h - 18);
  });
}
function pecaMemoria(f, M) {
  const n = M.cols * M.rows;
  const passo = M.tam + M.gap;
  const x0 = -(M.cols * passo - M.gap) / 2;
  const z0 = -(M.rows * passo - M.gap) / 2;
  const topos = [...FRUTAS.map((_, i) => i), -1].map((i) => {
    const tex = texturaFruta(i);
    // de pé nos pisos, olhando para o telão (+z), o desenho fica de cabeça para cima
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
  });
  const pergunta = topos[FRUTAS.length];
  const lado = mat('lilas');
  const geo = new THREE.BoxGeometry(M.tam, M.esp, M.tam);
  const pisos = [];
  for (let r = 0; r < M.rows; r++) {
    for (let k = 0; k < M.cols; k++) {
      const x = x0 + k * passo + M.tam / 2;
      const z = z0 + r * passo + M.tam / 2;
      // faces da caixa: 0 +x, 1 -x, 2 +y (o topo), 3 -y, 4 +z, 5 -z
      const ma = malha(geo, [lado, lado, pergunta, lado, lado, lado]);
      ma.position.set(x, M.y - M.esp / 2, z);
      f.grupo.add(ma);
      const col = guardar(f.colisor([x - M.tam / 2, M.y - M.esp, z - M.tam / 2, x + M.tam / 2, M.y, z + M.tam / 2]));
      pisos.push({ ma, col, x, z, topo: pergunta, solido: true });
    }
  }
  // o telão
  let quadroAntes = '';
  const tela = texturaViva(THREE, 640, 320, (ctx, w, h, st, rod) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const s = Math.ceil(st?.resta || 0);
    const fr = rod ? FRUTAS[rod.alvo] : null;
    if (st && (st.etapa === 'alvo' || st.etapa === 'cai') && fr) {
      ctx.font = '150px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(fr.emoji, w / 2, h / 2 - 30);
      ctx.font = FONTE(54);
      ctx.fillStyle = fr.cor;
      ctx.fillText(st.etapa === 'alvo' ? `${fr.nome.toUpperCase()} · ${s}` : fr.nome.toUpperCase(), w / 2, h - 52);
      return;
    }
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(64);
    const textos = { prepara: 'PREPARE-SE', mostra: `DECORE! ${s}`, volta: 'DE NOVO...', fim: 'FIM!' };
    ctx.fillText(textos[st?.etapa] || 'MEMÓRIA', w / 2, h / 2 - 20);
    if (st && st.r >= 0 && st.r < M.rodadas.length) {
      ctx.font = FONTE(34);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`rodada ${st.r + 1}/${M.rodadas.length}`, w / 2, h - 50);
    }
  });
  const painel = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: tela, toneMapped: false }));
  painel.position.set(0, M.painel.y, M.painel.z);
  painel.rotation.y = Math.PI; // virado para quem está nos pisos
  const moldura = malha(new THREE.BoxGeometry(14.8, 7.8, 0.4), mat('escuro'));
  moldura.position.set(0, M.painel.y, M.painel.z + 0.25);
  const pe = malha(new THREE.BoxGeometry(0.8, M.painel.y + 6, 0.8), mat('escuro'));
  pe.position.set(0, (M.painel.y - 6) / 2 - 2, M.painel.z + 0.5);
  f.grupo.add(painel, moldura, pe);
  let semente = 1;
  let rAntes = -99;
  let rod = null;
  let st = null;
  return {
    preparar(s) {
      semente = s;
      rAntes = -99;
    },
    update(dt, t, tf) {
      st = memoriaEm(M, tf);
      if (st.r !== rAntes) {
        rAntes = st.r;
        rod = st.r >= 0 && st.r < M.rodadas.length ? memoriaRodada(semente, st.r, n, M.rodadas[st.r][4]) : null;
      }
      pisos.forEach((p, i) => {
        let topo = pergunta;
        let dy = 0;
        let solido = true;
        if (rod) {
          const certo = rod.frutas[i] === rod.alvo;
          if (st.etapa === 'mostra') topo = topos[rod.frutas[i]];
          else if (st.etapa === 'cai') {
            topo = topos[rod.frutas[i]];
            if (!certo) {
              const u = st.dur - st.resta;
              dy = -Math.min(60, 15 * u * u); // cai junto com quem estava em cima
              solido = false;
            }
          } else if (st.etapa === 'volta' && !certo) {
            dy = -60 * (st.resta / st.dur) ** 2;
            solido = false;
          }
        }
        if (topo !== p.topo) {
          p.topo = topo;
          p.ma.material[2] = topo;
        }
        p.ma.position.y = M.y - M.esp / 2 + dy;
        if (solido !== p.solido) {
          p.solido = solido;
          if (solido) repor(p.col);
          else tirar(p.col);
        }
      });
      const quadro = `${st.etapa}:${st.r}:${Math.ceil(st.resta)}`;
      if (quadro !== quadroAntes) {
        quadroAntes = quadro;
        tela.userData.redesenhar(st, rod);
      }
    },
    status() {
      if (!st || !rod) return '';
      const fr = FRUTAS[rod.alvo];
      if (st.etapa === 'mostra') return `decore as frutas · <b>${Math.ceil(st.resta)}</b>`;
      if (st.etapa === 'alvo') return `vá para: <b style="color:${fr.cor}">${fr.emoji} ${fr.nome}</b> · <b>${Math.ceil(st.resta)}</b>`;
      return '';
    },
  };
}

// arenas redondas: o colisor é a caixa em volta do disco, e só vale para quem está em cima do
// disco de verdade (fora do círculo, ele some e o boneco cai)
function pecaDiscos(f, lista) {
  const itens = lista.map((d) => {
    const ma = malha(new THREE.CylinderGeometry(d.r, d.r, d.esp, 64), mat(d.cor || 'azul'));
    ma.position.set(d.x, d.y - d.esp / 2, d.z);
    const borda = malha(new THREE.TorusGeometry(d.r, 0.18, 8, 64).rotateX(Math.PI / 2), mat('branco'), false);
    borda.position.set(d.x, d.y, d.z);
    f.grupo.add(ma, borda);
    return { d, col: guardar(f.colisor([d.x - d.r, d.y - d.esp, d.z - d.r, d.x + d.r, d.y, d.z + d.r])), vale: true };
  });
  return {
    tocar(ctx) {
      const p = ctx.p;
      for (const it of itens) {
        const { d } = it;
        const vale = Math.hypot(p.x - d.x, p.z - d.z) <= d.r + 0.25 && p.y >= d.y - 0.3;
        if (vale === it.vale) continue;
        it.vale = vale;
        if (vale) repor(it.col);
        else tirar(it.col);
      }
    },
  };
}

// as barras do Gira-Gira, em volta do centro: cada vez mais rápidas
function pecaBarras(f, lista) {
  const itens = lista.map((b) => {
    const r = (b.y1 - b.y0) / 2;
    const ma = malha(new THREE.CylinderGeometry(r, r, b.raio * 2, 14).rotateZ(Math.PI / 2), mat(b.cor));
    f.grupo.add(ma);
    return { b, ma, r, antes: null };
  });
  return {
    preparar() {
      for (const it of itens) it.antes = null;
    },
    update(dt, t, tf) {
      for (const { b, ma } of itens) {
        ma.position.set(0, (b.y0 + b.y1) / 2 + barraSobe(b, tf), 0);
        ma.rotation.y = -barraAngulo(b, tf);
      }
    },
    tocar(ctx) {
      const p = ctx.p;
      const tf = ctx.tf;
      for (const it of itens) {
        const { b, r } = it;
        const a = barraAngulo(b, tf);
        // o ângulo do quadro anterior (depois de um engasgo grande, só o de agora)
        const antes = it.antes !== null && Math.abs(a - it.antes) < 0.8 ? it.antes : a;
        it.antes = a;
        if (tf < b.desde || !(p.y < b.y1 && p.y + ALTURA > b.y0)) continue;
        if (Math.hypot(p.x, p.z) > b.raio + HW || !barraPassou(antes, a, p, r + HW + 0.1)) continue;
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        const s = limitar(p.x * cx + p.z * cz, -b.raio, b.raio);
        const w = barraVel(b, tf);
        const sinal = Math.sign(w) * Math.sign(s || 1);
        // devagar, a barra só derruba; rápida, joga longe (para fora da arena)
        const forca = 5 + Math.abs(w * s) * 0.6;
        const d = Math.hypot(p.x, p.z) || 1;
        ctx.empurrar(-cz * sinal * forca + (p.x / d) * 2, 6.5, cx * sinal * forca + (p.z / d) * 2);
        return;
      }
    },
  };
}

// socadores: saem do lado do corredor de repente e jogam quem estiver na frente para o outro lado
function pecaSocadores(f, lista) {
  const itens = lista.map((s) => {
    const luva = malha(new THREE.BoxGeometry(1.2, 2.2, 2.6), mat('vermelho'));
    const haste = malha(new THREE.BoxGeometry(1, 0.5, 0.5), mat('escuro'));
    f.grupo.add(luva, haste);
    return { s, luva, haste, hx: s.lado * 4.6, indo: false };
  });
  return {
    update(dt, t) {
      for (const it of itens) {
        const { s } = it;
        const { ext, indo } = socadorExt(s, t);
        it.hx = s.lado * 4.6 - s.lado * ext * s.alcance;
        it.indo = indo;
        it.luva.position.set(it.hx, 1.3, s.z);
        // a haste vai da base (x = ±5,2) até as costas da luva
        const costas = it.hx + s.lado * 0.6;
        const base = s.lado * 5.2;
        it.haste.scale.x = Math.max(0.01, Math.abs(base - costas));
        it.haste.position.set((base + costas) / 2, 1.3, s.z);
      }
    },
    tocar(ctx) {
      const p = ctx.p;
      for (const { s, hx, indo } of itens) {
        if (Math.abs(p.x - hx) > 0.6 + HW || Math.abs(p.z - s.z) > 1.3 + HW || p.y > 2.4 || p.y + ALTURA < 0.2) continue;
        ctx.empurrar(-s.lado * (indo ? 17 : 6), indo ? 6.5 : 3, 0);
        return;
      }
    },
  };
}

// a final: os hexágonos, instanciados (um desenho para todos), cada um com seu colisor
function pecaHex(f, H) {
  const r = H.raio;
  const ma = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 0.6, 6), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x334155, emissiveIntensity: 0.25 }), H.pisos.length);
  ma.castShadow = ma.receiveShadow = true;
  ma.frustumCulled = false; // os pisos se espalham (e caem): a esfera do desenho de um só não serve
  f.grupo.add(ma);
  const cols = H.pisos.map((p) => guardar(f.colisor([p.x - r * 0.866, p.y - 0.6, p.z - r * 0.92, p.x + r * 0.866, p.y, p.z + r * 0.92], { piso: p.id })));
  const caindo = new Map(); // piso -> quando cai (performance.now)
  const pisei = new Set();
  const pousar = (p, dy = 0, escala = 1) => ma.setMatrixAt(p.id, _m.compose(_p.set(p.x, p.y - 0.3 + dy, p.z), _q.identity(), _s.setScalar(escala)));
  const peca = {
    hex: true,
    preparar() {
      caindo.clear();
      pisei.clear();
      for (const p of H.pisos) {
        repor(cols[p.id]);
        pousar(p);
        ma.setColorAt(p.id, _c.set(CORES_HEX[p.andar % CORES_HEX.length]));
      }
      ma.instanceMatrix.needsUpdate = true;
      if (ma.instanceColor) ma.instanceColor.needsUpdate = true;
    },
    marcar(id, falta) {
      if (caindo.has(id) || !H.pisos[id]) return;
      caindo.set(id, performance.now() + falta);
      ma.setColorAt(id, _c.set(0xef4444));
      if (ma.instanceColor) ma.instanceColor.needsUpdate = true;
    },
    update() {
      let mexeu = false;
      const agora = performance.now();
      for (const [id, em] of caindo) {
        if (agora < em) continue;
        const k = Math.min(1, (agora - em) / 1200);
        if (cols[id].min.y !== LONGE) tirar(cols[id]);
        pousar(H.pisos[id], -k * k * 30, k >= 1 ? 0 : 1);
        mexeu = true;
        if (k >= 1) caindo.set(id, Infinity);
      }
      if (mexeu) ma.instanceMatrix.needsUpdate = true;
    },
    tocar(ctx) {
      if (!ctx.jogando) return;
      const id = ctx.pl.grounded ? ctx.pl.ground?.data?.piso : undefined;
      if (id === undefined || pisei.has(id)) return;
      pisei.add(id);
      peca.marcar(id, H.caiEm); // aqui já fica vermelho; o servidor avisa os outros
      ctx.pisar(id);
    },
  };
  return peca;
}
