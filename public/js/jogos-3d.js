// Palco 3D do catálogo de jogos (catalogo-jogos.js): uma maquete de cada jogo, feita de peças
// simples, girando devagar num pedestal com um anel de luz na cor do jogo. Também tira a foto de
// cada maquete para os cartões da grade (miniatura()), com o mesmo WebGL.
import * as THREE from 'three';
import { isTouch } from './touch.js';

const mat = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0.05, ...o });
const brilho = (cor, forca = 1.6) => new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: forca, roughness: 0.4 });

// textura desenhada num canvas
function tela(w, h, desenhar) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  desenhar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const xadrezTex = (a, b, n = 8) => tela(256, 256, (ctx, w) => {
  const q = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) % 2 ? a : b;
    ctx.fillRect(i * q, j * q, q, q);
  }
});

// as peças: y é a base (a peça fica em cima de y); m é uma cor ou um material
const malha = (geo, m) => new THREE.Mesh(geo, m instanceof THREE.Material || Array.isArray(m) ? m : mat(m));
function caixa(g, w, h, d, m, x = 0, y = 0, z = 0) {
  const o = malha(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  g.add(o);
  return o;
}
function cilindro(g, r1, r2, h, m, x = 0, y = 0, z = 0, lados = 24) {
  const o = malha(new THREE.CylinderGeometry(r1, r2, h, lados), m);
  o.position.set(x, y + h / 2, z);
  g.add(o);
  return o;
}
function bola(g, r, m, x = 0, y = 0, z = 0) {
  const o = malha(new THREE.SphereGeometry(r, 24, 16), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
// um bonequinho (corpo de cápsula e cabeça)
function boneco(g, cor, x = 0, z = 0, giro = 0, esc = 1) {
  const b = new THREE.Group();
  const corpo = malha(new THREE.CapsuleGeometry(0.13, 0.22, 4, 12), cor);
  corpo.position.y = 0.26;
  b.add(corpo);
  bola(b, 0.11, 0xf2c9a0, 0, 0.56);
  b.position.set(x, 0, z);
  b.rotation.y = giro;
  b.scale.setScalar(esc);
  g.add(b);
  return b;
}
// carrinho: carroceria, cabine e quatro rodas
function carro(g, cor, { baixo = false } = {}) {
  const c = new THREE.Group();
  const h = baixo ? 0.1 : 0.16;
  caixa(c, 0.56, h, 0.3, mat(cor, { metalness: 0.4, roughness: 0.3 }), 0, 0.07);
  if (baixo) boneco(c, 0xfacc15, -0.04, 0, 0, 0.55).position.y = 0.1;
  else caixa(c, 0.28, 0.13, 0.26, mat(0x1f2937, { metalness: 0.5, roughness: 0.2 }), -0.04, 0.07 + h);
  for (const [x, z] of [[0.18, 0.16], [-0.18, 0.16], [0.18, -0.16], [-0.18, -0.16]]) {
    const r = malha(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), 0x111827);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0.075, z);
    c.add(r);
  }
  g.add(c);
  return c;
}
function chao(g, w, d, m, h = 0.06) {
  return caixa(g, w, h, d, m);
}
// faixas brancas de quadra, por cima de uma cor
const quadraTex = (fundo, linhas = '#ffffff', extra) => tela(512, 320, (ctx, w, h) => {
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = linhas;
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.beginPath();
  ctx.moveTo(w / 2, 16);
  ctx.lineTo(w / 2, h - 16);
  ctx.stroke();
  extra?.(ctx, w, h);
});
const vaiVem = (t, p) => {
  const s = (t / p) % 2;
  return s < 1 ? s : 2 - s;
};

// cada jogo: monta a maquete no grupo g e devolve a animação (t em segundos)
const MAQUETES = {
  futebol(g) {
    chao(g, 3.4, 2.2, mat(0xffffff, { map: quadraTex('#2f9e44', '#e9fbe9', (ctx, w, h) => {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
      ctx.stroke();
    }) }));
    for (const s of [-1, 1]) {
      const gol = brilho(s < 0 ? 0x60a5fa : 0xfb923c, 0.8);
      caixa(g, 0.06, 0.6, 0.06, gol, s * 1.6, 0.06, -0.38);
      caixa(g, 0.06, 0.6, 0.06, gol, s * 1.6, 0.06, 0.38);
      caixa(g, 0.06, 0.06, 0.82, gol, s * 1.6, 0.63, 0);
    }
    const b = bola(g, 0.36, mat(0xf8fafc, { roughness: 0.35 }), 0, 0.42, 0);
    const c1 = carro(g, 0x3b82f6);
    const c2 = carro(g, 0xf97316);
    return (t) => {
      b.position.y = 0.42 + Math.abs(Math.sin(t * 2.2)) * 0.5;
      b.rotation.z = -t * 2;
      c1.position.set(-0.9 + Math.sin(t) * 0.25, 0.06, 0.55);
      c2.position.set(0.9 - Math.sin(t) * 0.25, 0.06, -0.55);
      c2.rotation.y = Math.PI;
    };
  },
  volei(g) {
    chao(g, 3.2, 2, 0xe8d29a, 0.1);
    for (const z of [-1, 1]) cilindro(g, 0.03, 0.03, 1.1, 0x94a3b8, 0, 0.1, z);
    caixa(g, 0.02, 0.36, 2, mat(0xffffff, { transparent: true, opacity: 0.75 }), 0, 0.72);
    boneco(g, 0x3b82f6, -0.9, 0.3, Math.PI / 2);
    boneco(g, 0x3b82f6, -1.1, -0.4, Math.PI / 2);
    boneco(g, 0xef4444, 0.9, -0.3, -Math.PI / 2);
    boneco(g, 0xef4444, 1.1, 0.4, -Math.PI / 2);
    const b = bola(g, 0.12, mat(0xfde047), 0, 1.2, 0);
    return (t) => {
      const s = vaiVem(t, 1.4);
      b.position.set(-1 + s * 2, 0.9 + Math.sin(s * Math.PI) * 0.9, 0);
    };
  },
  basquete(g) {
    chao(g, 3, 2, mat(0xffffff, { map: quadraTex('#c8814a') }));
    cilindro(g, 0.05, 0.05, 1.5, 0x334155, 1.35, 0.06);
    caixa(g, 0.05, 0.5, 0.75, 0xf8fafc, 1.25, 1.3);
    const aro = malha(new THREE.TorusGeometry(0.16, 0.02, 8, 24), brilho(0xf97316, 0.6));
    aro.rotation.x = Math.PI / 2;
    aro.position.set(1.06, 1.38, 0);
    g.add(aro);
    boneco(g, 0x8b5cf6, -0.6, 0.2, Math.PI / 2);
    const b = bola(g, 0.13, mat(0xea580c, { roughness: 0.7 }), 0, 1, 0);
    return (t) => {
      const s = (t / 1.6) % 1;
      b.position.set(-0.5 + s * 1.56, 0.85 + Math.sin(s * Math.PI) * 1.1 - s * 0.2, 0.2 - s * 0.2);
    };
  },
  boliche(g) {
    caixa(g, 3.4, 0.06, 0.7, mat(0xd9a066, { roughness: 0.25, metalness: 0.1 }));
    for (const z of [-0.45, 0.45]) caixa(g, 3.4, 0.04, 0.18, 0x3f3f46, 0, 0, z);
    const perfil = [[0, 0], [0.05, 0], [0.07, 0.08], [0.05, 0.17], [0.03, 0.21], [0.045, 0.27], [0.03, 0.32], [0, 0.33]].map(([x, y]) => new THREE.Vector2(x, y));
    const pinoGeo = new THREE.LatheGeometry(perfil, 14);
    const pinos = [];
    for (let fila = 0; fila < 4; fila++) for (let i = 0; i <= fila; i++) {
      const p = malha(pinoGeo, mat(0xffffff, { roughness: 0.3 }));
      p.position.set(1.05 + fila * 0.15, 0.06, (i - fila / 2) * 0.15);
      g.add(p);
      pinos.push(p);
    }
    const b = bola(g, 0.14, mat(0x7c3aed, { roughness: 0.15, metalness: 0.3 }), -1.5, 0.2, 0);
    return (t) => {
      const s = (t / 2.6) % 1;
      b.position.x = -1.5 + Math.min(s * 1.6, 1) * 2.5;
      b.rotation.z = -t * 6;
      const caiu = s > 0.62;
      pinos.forEach((p, i) => {
        p.rotation.z = caiu ? -Math.min((s - 0.62) * 8, 1) * (0.6 + (i % 3) * 0.4) : 0;
      });
    };
  },
  pingue(g) {
    const mesa = mat(0xffffff, { map: quadraTex('#1d4ed8'), roughness: 0.35 });
    caixa(g, 2.2, 0.06, 1.2, mesa, 0, 0.66);
    for (const [x, z] of [[1, 0.5], [-1, 0.5], [1, -0.5], [-1, -0.5]]) cilindro(g, 0.03, 0.03, 0.66, 0x111827, x, 0, z);
    caixa(g, 0.02, 0.12, 1.3, mat(0xffffff, { transparent: true, opacity: 0.8 }), 0, 0.72);
    const raquete = (x, cor) => {
      const r = new THREE.Group();
      const f = malha(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20), cor);
      f.rotation.z = Math.PI / 2;
      r.add(f);
      caixa(r, 0.03, 0.14, 0.04, 0x92400e, 0, -0.24);
      r.position.set(x, 0.95, 0);
      g.add(r);
      return r;
    };
    const ra = raquete(-1.25, 0xdc2626);
    const rb = raquete(1.25, 0x111827);
    const b = bola(g, 0.04, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }), 0, 0.9, 0);
    return (t) => {
      const s = vaiVem(t, 0.9);
      const z = Math.sin(t * 1.3) * 0.35;
      b.position.set(-1.15 + s * 2.3, 0.74 + Math.abs(Math.sin(s * Math.PI * 2)) * 0.3, z);
      ra.position.z = s < 0.5 ? z : ra.position.z;
      rb.position.z = s > 0.5 ? z : rb.position.z;
    };
  },
  sinuca(g) {
    caixa(g, 2.4, 0.1, 1.3, 0x15803d, 0, 0.62);
    const madeira = mat(0x7c2d12, { roughness: 0.4 });
    caixa(g, 2.6, 0.14, 0.12, madeira, 0, 0.62, 0.71);
    caixa(g, 2.6, 0.14, 0.12, madeira, 0, 0.62, -0.71);
    caixa(g, 0.12, 0.14, 1.3, madeira, 1.24, 0.62);
    caixa(g, 0.12, 0.14, 1.3, madeira, -1.24, 0.62);
    for (const [x, z] of [[1.1, 0.55], [-1.1, 0.55], [1.1, -0.55], [-1.1, -0.55]]) caixa(g, 0.14, 0.62, 0.14, madeira, x, 0, z);
    const cores = [0xfacc15, 0x2563eb, 0xdc2626, 0x7c3aed, 0xf97316, 0x16a34a, 0x991b1b, 0x111827, 0xfacc15, 0x2563eb];
    let k = 0;
    for (let fila = 0; fila < 4; fila++) for (let i = 0; i <= fila; i++) bola(g, 0.05, mat(cores[k++], { roughness: 0.2 }), 0.45 + fila * 0.09, 0.77, (i - fila / 2) * 0.1);
    const branca = bola(g, 0.05, mat(0xffffff, { roughness: 0.2 }), -0.6, 0.77, 0);
    const taco = new THREE.Group();
    const vara = malha(new THREE.CylinderGeometry(0.012, 0.025, 1.4, 10), 0xd6a35c);
    vara.rotation.z = Math.PI / 2;
    vara.position.x = -0.75;
    taco.add(vara);
    taco.position.set(-0.6, 0.8, 0);
    taco.rotation.z = -0.08;
    g.add(taco);
    return (t) => {
      const s = (t / 2.2) % 1;
      taco.position.x = -0.68 - Math.sin(Math.min(s * 2, 1) * Math.PI) * 0.18;
      branca.position.x = s < 0.5 ? -0.6 : -0.6 + Math.min((s - 0.5) * 3, 1) * 0.95;
    };
  },
  golfe(g) {
    cilindro(g, 1.9, 1.9, 0.08, 0x4ade80, 0, 0, 0, 48);
    const morro = bola(g, 0.7, 0x22c55e, -0.6, -0.25, -0.5);
    morro.scale.y = 0.6;
    const buraco = malha(new THREE.CircleGeometry(0.08, 20), 0x111827);
    buraco.rotation.x = -Math.PI / 2;
    buraco.position.set(1, 0.085, 0.4);
    g.add(buraco);
    cilindro(g, 0.012, 0.012, 0.8, 0xe5e7eb, 1, 0.08, 0.4);
    const bandeira = malha(new THREE.ConeGeometry(0.12, 0.3, 3), brilho(0xef4444, 0.6));
    bandeira.rotation.z = -Math.PI / 2;
    bandeira.position.set(1.15, 0.78, 0.4);
    g.add(bandeira);
    caixa(g, 0.4, 0.7, 0.4, 0xfef3c7, 0.2, 0.08, -0.9);
    const teto = malha(new THREE.ConeGeometry(0.34, 0.3, 4), 0xb91c1c);
    teto.position.set(0.2, 0.93, -0.9);
    teto.rotation.y = Math.PI / 4;
    g.add(teto);
    const pas = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = caixa(pas, 0.08, 0.5, 0.02, 0xf8fafc, 0, 0, 0);
      p.position.y = 0;
      p.geometry.translate(0, 0.25, 0);
      p.rotation.z = (i * Math.PI) / 2;
    }
    pas.position.set(0.2, 0.7, -0.68);
    g.add(pas);
    const b = bola(g, 0.04, 0xffffff, -1.1, 0.12, 0.6);
    return (t) => {
      pas.rotation.z = t * 1.5;
      const s = (t / 3) % 1;
      b.position.set(-1.1 + s * 2.1, 0.12, 0.6 - s * 0.2);
    };
  },
  queimada(g) {
    caixa(g, 1.6, 0.06, 1.8, 0x3b82f6, -0.8);
    caixa(g, 1.6, 0.06, 1.8, 0xef4444, 0.8);
    caixa(g, 0.04, 0.065, 1.8, 0xffffff);
    const azuis = [[-0.6, 0.4], [-1.1, -0.3], [-0.5, -0.5]].map(([x, z]) => boneco(g, 0x1d4ed8, x, z, Math.PI / 2));
    const verm = [[0.6, -0.4], [1.1, 0.3], [0.5, 0.55]].map(([x, z]) => boneco(g, 0xb91c1c, x, z, -Math.PI / 2));
    const b = bola(g, 0.11, mat(0xfacc15, { roughness: 0.6 }), 0, 0.6, 0);
    return (t) => {
      const s = vaiVem(t, 1.2);
      b.position.set(-0.6 + s * 1.2, 0.45 + Math.sin(s * Math.PI) * 0.4, 0.4 - s * 0.8);
      [...azuis, ...verm].forEach((p, i) => { p.position.y = Math.max(0, Math.sin(t * 5 + i)) * 0.08; });
    };
  },
  corrida(g) {
    const pista = malha(new THREE.RingGeometry(1.05, 1.75, 64), mat(0x374151, { side: THREE.DoubleSide, roughness: 0.8 }));
    pista.rotation.x = -Math.PI / 2;
    pista.position.y = 0.03;
    g.add(pista);
    cilindro(g, 1.05, 1.05, 0.03, 0x15803d, 0, 0, 0, 48);
    for (const r of [1.06, 1.74]) {
      const borda = malha(new THREE.TorusGeometry(r, 0.02, 6, 64), 0xf8fafc);
      borda.rotation.x = Math.PI / 2;
      borda.position.y = 0.04;
      g.add(borda);
    }
    const largada = caixa(g, 0.7, 0.01, 0.16, mat(0xffffff, { map: xadrezTex('#111', '#fff', 6) }), 1.4, 0.03);
    largada.rotation.y = Math.PI / 2;
    const c1 = carro(g, 0xef4444);
    const c2 = carro(g, 0x22d3ee);
    return (t) => {
      for (const [c, r, v] of [[c1, 1.25, 0.9], [c2, 1.55, 0.8]]) {
        const a = t * v;
        c.position.set(Math.cos(a) * r, 0.03, -Math.sin(a) * r);
        c.rotation.y = a + Math.PI / 2;
      }
    };
  },
  kart(g) {
    const pista = malha(new THREE.RingGeometry(1.0, 1.7, 64), mat(0x4b5563, { side: THREE.DoubleSide, roughness: 0.8 }));
    pista.rotation.x = -Math.PI / 2;
    pista.position.y = 0.03;
    g.add(pista);
    cilindro(g, 1.0, 1.0, 0.03, 0x65a30d, 0, 0, 0, 48);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const zebra = caixa(g, 0.18, 0.04, 0.06, i % 2 ? 0xffffff : 0xdc2626, Math.cos(a) * 1.72, 0.02, Math.sin(a) * 1.72);
      zebra.rotation.y = -a + Math.PI / 2;
    }
    const itemTex = tela(64, 64, (ctx, w) => {
      const gr = ctx.createLinearGradient(0, 0, w, w);
      ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].forEach((c, i) => gr.addColorStop(i / 4, c));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = '#fff';
      ctx.font = '900 44px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', w / 2, w / 2 + 2);
    });
    const itens = [0, 1, 2].map((i) => caixa(g, 0.2, 0.2, 0.2, mat(0xffffff, { map: itemTex, transparent: true, opacity: 0.92, emissive: 0x333333 }), -1.35, 0.25, (i - 1) * 0.25));
    const karts = [0xef4444, 0x22c55e, 0x3b82f6].map((c) => carro(g, c, { baixo: true }));
    return (t) => {
      karts.forEach((k, i) => {
        const a = t * 0.8 + i * 0.5;
        const r = 1.2 + i * 0.18;
        k.position.set(Math.cos(a) * r, 0.03, -Math.sin(a) * r);
        k.rotation.y = a + Math.PI / 2;
      });
      itens.forEach((it, i) => {
        it.rotation.set(t, t * 1.3, 0);
        it.position.y = 0.25 + Math.sin(t * 2 + i) * 0.05;
      });
    };
  },
  matamata(g) {
    chao(g, 3.2, 2.4, mat(0xffffff, { map: tela(256, 256, (ctx, w) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, w);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      for (let i = 0; i <= w; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, w); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
      }
    }) }));
    const madeira = mat(0x92400e, { roughness: 0.8 });
    caixa(g, 0.5, 0.5, 0.5, madeira, -0.9, 0.06, -0.6);
    caixa(g, 0.4, 0.4, 0.4, madeira, -0.6, 0.06, -0.85);
    caixa(g, 0.5, 0.5, 0.5, madeira, 1, 0.06, 0.5);
    caixa(g, 0.35, 0.35, 0.35, madeira, 1, 0.56, 0.5);
    const anel = malha(new THREE.TorusGeometry(0.32, 0.03, 8, 32), brilho(0xf43f5e, 2));
    anel.rotation.x = Math.PI / 2;
    anel.position.y = 0.1;
    g.add(anel);
    const arma = new THREE.Group();
    const metal = mat(0x475569, { metalness: 0.7, roughness: 0.3 });
    caixa(arma, 0.5, 0.1, 0.08, metal, 0, 0);
    caixa(arma, 0.3, 0.035, 0.035, metal, 0.35, 0.035);
    caixa(arma, 0.08, 0.18, 0.07, 0x1f2937, -0.12, -0.17);
    arma.position.y = 0.55;
    g.add(arma);
    boneco(g, 0x16a34a, -0.2, 0.8, Math.PI);
    boneco(g, 0xdc2626, 0.3, -0.8, 0);
    return (t) => {
      arma.rotation.y = t * 1.4;
      arma.position.y = 0.55 + Math.sin(t * 2) * 0.06;
      anel.material.emissiveIntensity = 1.4 + Math.sin(t * 4) * 0.6;
    };
  },
  batalha(g) {
    chao(g, 3.2, 2.2, 0x1f2937);
    const robo = (cor, x, giro) => {
      const r = new THREE.Group();
      const m = mat(cor, { metalness: 0.6, roughness: 0.35 });
      caixa(r, 0.12, 0.4, 0.14, 0x334155, -0.1, 0);
      caixa(r, 0.12, 0.4, 0.14, 0x334155, 0.1, 0);
      caixa(r, 0.44, 0.42, 0.26, m, 0, 0.4);
      caixa(r, 0.1, 0.36, 0.12, m, -0.28, 0.42);
      caixa(r, 0.1, 0.36, 0.12, m, 0.28, 0.42);
      caixa(r, 0.2, 0.2, 0.2, m, 0, 0.84);
      caixa(r, 0.14, 0.04, 0.02, brilho(0x67e8f9, 2.4), 0, 0.93, 0.105);
      r.position.x = x;
      r.rotation.y = giro;
      g.add(r);
      return r;
    };
    const a = robo(0x2563eb, -0.9, Math.PI / 2);
    const b = robo(0x7c3aed, 0.9, -Math.PI / 2);
    const laser = malha(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), brilho(0xfb7185, 3));
    laser.rotation.z = Math.PI / 2;
    laser.position.set(0, 0.62, 0);
    g.add(laser);
    return (t) => {
      a.position.y = Math.abs(Math.sin(t * 2)) * 0.05;
      b.position.y = Math.abs(Math.cos(t * 2)) * 0.05;
      laser.visible = (t * 2.5) % 1 < 0.35;
    };
  },
  ringue(g) {
    caixa(g, 2.6, 0.32, 2.6, 0x1e3a8a);
    caixa(g, 2.4, 0.02, 2.4, 0x2563eb, 0, 0.32);
    const cantos = [[1.15, 1.15], [-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15]];
    for (const [x, z] of cantos) cilindro(g, 0.05, 0.05, 0.8, 0xe5e7eb, x, 0.32, z);
    const cores = [0xef4444, 0xffffff, 0x3b82f6];
    cores.forEach((c, i) => {
      const y = 0.55 + i * 0.18;
      for (const [w, d, x, z] of [[2.3, 0.025, 0, 1.15], [2.3, 0.025, 0, -1.15], [0.025, 2.3, 1.15, 0], [0.025, 2.3, -1.15, 0]]) caixa(g, w, 0.025, d, c, x, y, z);
    });
    const lutador = (cor, x, giro) => {
      const b = boneco(g, cor, x, 0, giro, 1.3);
      b.position.y = 0.34;
      const luva = bola(b, 0.07, brilho(0xdc2626, 0.3), 0.1, 0.42, 0.14);
      return { b, luva };
    };
    const l1 = lutador(0xfacc15, -0.35, Math.PI / 2);
    const l2 = lutador(0x22c55e, 0.35, -Math.PI / 2);
    return (t) => {
      l1.luva.position.z = 0.14 + Math.max(0, Math.sin(t * 5)) * 0.18;
      l2.luva.position.z = 0.14 + Math.max(0, Math.sin(t * 5 + 2)) * 0.18;
      l1.b.position.x = -0.35 + Math.sin(t * 2) * 0.05;
    };
  },
  xadrez(g) {
    caixa(g, 2.5, 0.1, 2.5, 0x3f2a1d);
    caixa(g, 2.3, 0.02, 2.3, mat(0xffffff, { map: xadrezTex('#1f2937', '#e5e7eb') }), 0, 0.1);
    const q = 2.3 / 8;
    const peao = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.09, 0.03], [0.05, 0.06], [0.035, 0.16], [0.06, 0.18], [0.055, 0.23], [0, 0.27]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
    const rei = new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.11, 0.04], [0.06, 0.08], [0.045, 0.32], [0.08, 0.36], [0.05, 0.42], [0.02, 0.46], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
    const branco = mat(0xf8fafc, { roughness: 0.3 });
    const preto = mat(0x111827, { roughness: 0.3, metalness: 0.3 });
    const pecas = [];
    const por = (geo, m, i, j) => {
      const p = malha(geo, m);
      p.position.set((i - 3.5) * q, 0.12, (j - 3.5) * q);
      g.add(p);
      pecas.push(p);
      return p;
    };
    for (const i of [1, 2, 4, 6]) por(peao, branco, i, 6);
    for (const i of [0, 3, 5, 7]) por(peao, preto, i, 1);
    por(rei, branco, 4, 7);
    por(rei, preto, 3, 0);
    const voa = por(rei, mat(0xc4b5fd, { emissive: 0x7c3aed, emissiveIntensity: 0.5 }), 5, 4);
    return (t) => {
      voa.position.y = 0.3 + Math.sin(t * 1.6) * 0.12;
      voa.rotation.y = t;
    };
  },
  dama(g) {
    caixa(g, 2.5, 0.1, 2.5, 0x3f2a1d);
    caixa(g, 2.3, 0.02, 2.3, mat(0xffffff, { map: xadrezTex('#7f1d1d', '#fde68a') }), 0, 0.1);
    const q = 2.3 / 8;
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 24);
    const pecas = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      if ((i + j) % 2 === 0 || (j > 2 && j < 5)) continue;
      const p = malha(geo, mat(j < 3 ? 0xf8fafc : 0x111827, { roughness: 0.3 }));
      p.position.set((i - 3.5) * q, 0.15, (j - 3.5) * q);
      g.add(p);
      pecas.push(p);
    }
    const pula = pecas[9];
    const x0 = pula.position.x;
    const z0 = pula.position.z;
    return (t) => {
      const s = (t / 2) % 1;
      pula.position.set(x0 + s * q * 2, 0.15 + Math.sin(s * Math.PI) * 0.3, z0 + s * q * 2);
    };
  },
  velha(g) {
    caixa(g, 2.4, 0.1, 2.4, 0x0f172a);
    const linha = brilho(0x94a3b8, 0.4);
    for (const d of [-0.4, 0.4]) {
      caixa(g, 0.05, 0.05, 2.2, linha, d, 0.1);
      caixa(g, 2.2, 0.05, 0.05, linha, 0, 0.1, d);
    }
    const xMat = brilho(0x38bdf8, 1.2);
    const oMat = brilho(0xf472b6, 1.2);
    const pecas = [];
    const xis = (i, j) => {
      const x = new THREE.Group();
      for (const r of [Math.PI / 4, -Math.PI / 4]) {
        const b = caixa(x, 0.55, 0.08, 0.1, xMat, 0, -0.04);
        b.rotation.y = r;
      }
      x.position.set(i * 0.8, 0.2, j * 0.8);
      g.add(x);
      pecas.push(x);
    };
    const o = (i, j) => {
      const b = malha(new THREE.TorusGeometry(0.22, 0.05, 10, 32), oMat);
      b.rotation.x = Math.PI / 2;
      b.position.set(i * 0.8, 0.2, j * 0.8);
      g.add(b);
      pecas.push(b);
    };
    xis(-1, -1); o(0, -1); xis(1, 0); o(-1, 1); xis(0, 0); o(1, -1);
    const ultimo = malha(new THREE.TorusGeometry(0.22, 0.05, 10, 32), oMat);
    ultimo.rotation.x = Math.PI / 2;
    ultimo.position.set(1, 0.2, 1);
    g.add(ultimo);
    return (t) => {
      const s = (t / 2.4) % 1;
      ultimo.position.y = 0.2 + Math.max(0, 1 - s * 3) * 0.8;
      ultimo.scale.setScalar(Math.min(1, s * 3 + 0.2));
      pecas.forEach((p, i) => { p.position.y = 0.2 + Math.sin(t * 2 + i) * 0.03; });
    };
  },
  dados(g) {
    cilindro(g, 1.6, 1.5, 0.1, 0x14532d, 0, 0, 0, 48);
    const borda = malha(new THREE.TorusGeometry(1.6, 0.07, 8, 48), mat(0x78350f, { roughness: 0.4 }));
    borda.rotation.x = Math.PI / 2;
    borda.position.y = 0.11;
    g.add(borda);
    const face = (n) => tela(64, 64, (ctx, w) => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = n === 1 ? '#dc2626' : '#111827';
      const pos = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
      for (const [i, j] of pos) {
        ctx.beginPath();
        ctx.arc(i * 16, j * 16, n === 1 ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const faces = [1, 6, 2, 5, 3, 4].map((n) => mat(0xffffff, { map: face(n), roughness: 0.3 }));
    const dados = [[-0.3, 0.1], [0.3, -0.15]].map(([x, z]) => {
      const d = malha(new THREE.BoxGeometry(0.32, 0.32, 0.32), faces);
      d.position.set(x, 0.3, z);
      g.add(d);
      return d;
    });
    const ouro = mat(0xfbbf24, { metalness: 0.9, roughness: 0.25 });
    for (let i = 0; i < 5; i++) cilindro(g, 0.12, 0.12, 0.04, ouro, 0.9, 0.11 + i * 0.045, 0.4);
    for (let i = 0; i < 3; i++) cilindro(g, 0.12, 0.12, 0.04, ouro, -0.8, 0.11 + i * 0.045, -0.5);
    return (t) => {
      const s = (t / 2.2) % 1;
      dados.forEach((d, i) => {
        const no = Math.max(0, 1 - s * 2.2);
        d.position.y = 0.27 + Math.abs(Math.sin(s * Math.PI * 3)) * 0.5 * no;
        d.rotation.set(t * 4 * no + i, t * 3 * no, t * 5 * no);
      });
    };
  },
  cartas(g, id) {
    cilindro(g, 1.5, 1.4, 0.1, 0x7c2d12, 0, 0.5, 0, 48);
    cilindro(g, 1.35, 1.35, 0.02, id === 'uno' ? 0x1e293b : 0x166534, 0, 0.6, 0, 48);
    cilindro(g, 0.1, 0.18, 0.5, 0x451a03);
    const UNO = [['#ef4444', '7'], ['#facc15', '+2'], ['#22c55e', '3'], ['#3b82f6', '⟲'], ['#111827', '+4']];
    const TRUCO = [['♣', '4', '#111'], ['♥', '7', '#dc2626'], ['♠', 'A', '#111'], ['♦', '7', '#dc2626'], ['♥', '3', '#dc2626']];
    const frente = (i) => tela(96, 144, (ctx, w, h) => {
      if (id === 'uno') {
        const [cor, txt] = UNO[i];
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = cor;
        ctx.fillRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, 34, 52, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cor === '#111827' ? '#a855f7' : cor;
        ctx.font = '900 40px system-ui';
      } else {
        const [naipe, txt, cor] = TRUCO[i];
        ctx.fillStyle = '#fffdf5';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = cor;
        ctx.font = '800 26px system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(txt, 8, 6);
        ctx.font = '900 56px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(naipe, w / 2, h / 2 + 6);
        return;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNO[i][1], w / 2, h / 2 + 2);
    });
    const verso = mat(id === 'uno' ? 0x111827 : 0x1d4ed8);
    const cartas = [];
    for (let i = 0; i < 5; i++) {
      const lados = [verso, verso, mat(0xffffff, { map: frente(i) }), verso, verso, verso];
      const c = malha(new THREE.BoxGeometry(0.36, 0.008, 0.54), lados);
      const a = (i - 2) * 0.32;
      c.position.set(Math.sin(a) * 0.5, 0.63 + i * 0.004, 0.45 - Math.cos(a) * 0.5 + 0.5);
      c.rotation.y = -a;
      g.add(c);
      cartas.push(c);
    }
    for (const [x, z, giro, cor] of [[-1.7, 0, Math.PI / 2, 0xf472b6], [1.7, 0, -Math.PI / 2, 0x60a5fa], [0, -1.7, 0, 0xfacc15]]) boneco(g, cor, x, z, giro, 1.4);
    return (t) => {
      cartas.forEach((c, i) => { c.position.y = 0.63 + i * 0.004 + (Math.floor(t) % 5 === i ? Math.sin((t % 1) * Math.PI) * 0.12 : 0); });
    };
  },
  parkour(g) {
    caixa(g, 1, 0.08, 1, 0x22c55e, -1.1, 0, 1);
    const plats = [];
    const cores = [0x8b5cf6, 0xf97316, 0x8b5cf6, 0x06b6d4, 0x8b5cf6];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.1;
      const p = caixa(g, 0.55, 0.1, 0.55, cores[i], Math.cos(a) * 1.1, 0.3 + i * 0.32, Math.sin(a) * 1.1);
      plats.push(p);
    }
    const topo = plats[4];
    const trofeu = new THREE.Group();
    const ouro = mat(0xfbbf24, { metalness: 0.9, roughness: 0.2, emissive: 0x7c5a00, emissiveIntensity: 0.4 });
    cilindro(trofeu, 0.12, 0.06, 0.16, ouro, 0, 0.08);
    cilindro(trofeu, 0.03, 0.03, 0.08, ouro);
    cilindro(trofeu, 0.07, 0.07, 0.03, ouro);
    trofeu.position.set(topo.position.x, topo.position.y + 0.05, topo.position.z);
    g.add(trofeu);
    const b = boneco(g, 0xec4899, -1.1, 1, 0, 0.8);
    return (t) => {
      trofeu.rotation.y = t * 1.5;
      const s = (t / 0.8) % 5;
      const i = Math.floor(s);
      const f = s - i;
      const de = i === 0 ? { x: -1.1, y: 0.08, z: 1 } : { x: plats[i - 1].position.x, y: plats[i - 1].position.y + 0.05, z: plats[i - 1].position.z };
      const para = { x: plats[i].position.x, y: plats[i].position.y + 0.05, z: plats[i].position.z };
      b.position.set(de.x + (para.x - de.x) * f, de.y + (para.y - de.y) * f + Math.sin(f * Math.PI) * 0.35, de.z + (para.z - de.z) * f);
    };
  },
  gincana(g) {
    const cores = [0xf472b6, 0xfacc15, 0x60a5fa, 0x4ade80, 0xa78bfa, 0xfb923c];
    const hexes = [];
    const r = 0.36;
    for (let q = -2; q <= 2; q++) for (let s = -2; s <= 2; s++) {
      if (Math.abs(q + s) > 2) continue;
      const x = r * 1.75 * (q + s / 2);
      const z = r * 1.52 * s;
      const h = cilindro(g, r, r, 0.14, mat(cores[(q * 3 + s + 12) % 6], { roughness: 0.4 }), x, 0, z, 6);
      hexes.push(h);
    }
    cilindro(g, 0.12, 0.14, 0.5, 0xf8fafc, 0, 0.14);
    const barra = new THREE.Group();
    caixa(barra, 2.8, 0.1, 0.1, brilho(0xef4444, 0.6), 0, 0);
    barra.position.y = 0.5;
    g.add(barra);
    const gente = [[0xf97316, 0.8, 0.3], [0x22d3ee, -0.6, -0.6], [0xa855f7, -0.4, 0.7]].map(([c, x, z]) => {
      const b = new THREE.Group();
      const corpo = malha(new THREE.CapsuleGeometry(0.12, 0.14, 4, 12), mat(c, { roughness: 0.3 }));
      corpo.position.y = 0.3;
      b.add(corpo);
      caixa(b, 0.14, 0.06, 0.02, 0xffffff, 0, 0.36, 0.11);
      b.position.set(x, 0.14, z);
      g.add(b);
      return b;
    });
    return (t) => {
      barra.rotation.y = t * 1.2;
      hexes.forEach((h, i) => { h.position.y = Math.sin(t * 1.5 + i * 0.7) * 0.03; });
      gente.forEach((b, i) => {
        b.position.y = 0.14 + Math.abs(Math.sin(t * 4 + i * 2)) * 0.18;
        b.rotation.y = t + i;
      });
    };
  },
  surf(g) {
    for (const [x, z, r] of [[-1.2, -0.8, 0.35], [-0.9, -0.9, 0.28], [1.2, 0.9, 0.32], [1.4, 0.7, 0.25], [0.9, -1.1, 0.22]]) bola(g, r, mat(0xffffff, { roughness: 1 }), x, 0.1, z).scale.y = 0.6;
    const forma = new THREE.Shape([new THREE.Vector2(-0.35, 0), new THREE.Vector2(0.35, 0), new THREE.Vector2(0, 0.5)]);
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 2.6, bevelEnabled: false });
    geo.translate(0, 0, -1.3);
    const rampa = malha(geo, mat(0x38bdf8, { roughness: 0.25, metalness: 0.3, emissive: 0x0c4a6e, emissiveIntensity: 0.4 }));
    rampa.position.y = 0.45;
    g.add(rampa);
    const rampa2 = malha(geo, mat(0xa78bfa, { roughness: 0.25, metalness: 0.3, emissive: 0x3b0764, emissiveIntensity: 0.4 }));
    rampa2.position.set(1.1, 0.75, 0);
    rampa2.rotation.y = 0.3;
    rampa2.scale.setScalar(0.7);
    g.add(rampa2);
    const b = boneco(g, 0xf97316, 0, 0, 0, 0.8);
    return (t) => {
      const s = vaiVem(t, 1.6);
      const z = -1.1 + s * 2.2;
      b.position.set(-0.17, 0.45 + 0.25, z);
      b.rotation.z = 0.8;
      b.rotation.y = s > 0.5 ? Math.PI : 0;
    };
  },
  pinta(g) {
    const n = 7;
    const q = 2.8 / n;
    const tiles = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const t = caixa(g, q - 0.02, 0.06, q - 0.02, mat(0xe5e7eb, { roughness: 0.6 }), (i - (n - 1) / 2) * q, 0, (j - (n - 1) / 2) * q);
      tiles.push({ t, i, j });
    }
    const rosa = boneco(g, 0xec4899, 0, 0, 0);
    const verde = boneco(g, 0x22c55e, 0, 0, 0);
    const ROSA = new THREE.Color(0xf472b6);
    const VERDE = new THREE.Color(0x4ade80);
    let rodada = 0;
    return (t) => {
      // a cada 10 s o chão volta a ficar limpo
      if (Math.floor(t / 10) !== rodada) {
        rodada = Math.floor(t / 10);
        for (const { t: tile } of tiles) tile.material.color.set(0xe5e7eb);
      }
      const pr = [Math.cos(t * 0.9) * 0.9, Math.sin(t * 1.3) * 0.9];
      const pv = [Math.sin(t * 0.8 + 1) * 0.9, Math.cos(t * 1.1) * 0.9];
      rosa.position.set(pr[0], 0.06, pr[1]);
      verde.position.set(pv[0], 0.06, pv[1]);
      for (const { t: tile } of tiles) {
        const dr = Math.hypot(tile.position.x - pr[0], tile.position.z - pr[1]);
        const dv = Math.hypot(tile.position.x - pv[0], tile.position.z - pv[1]);
        if (dr < 0.32) tile.material.color.copy(ROSA);
        else if (dv < 0.32) tile.material.color.copy(VERDE);
      }
    };
  },
};
MAQUETES.truco = (g) => MAQUETES.cartas(g, 'truco');
MAQUETES.uno = (g) => MAQUETES.cartas(g, 'uno');

export class PalcoJogos {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(isTouch ? 1.5 : 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2440, 1.5));
    const sol = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sol.position.set(3, 6, 4);
    this.scene.add(sol);
    const contra = new THREE.DirectionalLight(0x6ee7c8, 1.2);
    contra.position.set(-4, 3, -3);
    this.scene.add(contra);

    // pedestal: disco escuro com um anel de luz na cor do jogo
    this.pedestal = new THREE.Group();
    const base = malha(new THREE.CylinderGeometry(2.3, 2.45, 0.32, 64), mat(0x1a1f2b, { metalness: 0.4, roughness: 0.45 }));
    base.position.y = -0.16;
    this.pedestal.add(base);
    this.anel = malha(new THREE.TorusGeometry(2.36, 0.035, 8, 96), brilho(0x6ee7c8, 2));
    this.anel.rotation.x = Math.PI / 2;
    this.anel.position.y = -0.02;
    this.pedestal.add(this.anel);
    this.scene.add(this.pedestal);

    this.maquete = null;
    this.anima = null;
    this.id = null;
    this.giro = 0;
    this.arrasto = null;
    this.t0 = performance.now();
    this.rodando = false;
    this.ultimo = 0;
    // arrastar gira a maquete
    canvas.addEventListener('pointerdown', (e) => {
      this.arrasto = { x: e.clientX, giro: this.giro };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.arrasto) this.giro = this.arrasto.giro + (e.clientX - this.arrasto.x) * 0.01;
    });
    const solta = () => { this.arrasto = null; };
    canvas.addEventListener('pointerup', solta);
    canvas.addEventListener('pointercancel', solta);
    this.tamanho(canvas.clientWidth || 320, canvas.clientHeight || 240);
  }

  tamanho(w, h) {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.enquadrar();
  }

  enquadrar() {
    // o pedestal inteiro cabe, mais longe quando a tela é estreita
    const dist = 7.4 / Math.min(1, this.camera.aspect / 1.25);
    this.camera.position.set(0, dist * 0.55, dist * 0.84);
    this.camera.lookAt(0, 0.35, 0);
  }

  mostrar(id, cor) {
    if (this.id === id) return;
    this.id = id;
    if (this.maquete) this.soltar(this.maquete);
    const g = new THREE.Group();
    this.anima = MAQUETES[id]?.(g) || null;
    this.maquete = g;
    this.scene.add(g);
    this.anel.material.color.set(cor);
    this.anel.material.emissive.set(cor);
    this.surgir = performance.now();
  }

  soltar(g) {
    this.scene.remove(g);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }

  quadro(agora = performance.now()) {
    const t = (agora - this.t0) / 1000;
    if (!this.arrasto) this.giro += 0.004;
    const s = Math.min(1, (agora - (this.surgir || 0)) / 420);
    const e = 1 - (1 - s) ** 3;
    if (this.maquete) {
      this.maquete.rotation.y = this.giro;
      this.maquete.scale.setScalar(0.6 + e * 0.4);
      this.maquete.position.y = (1 - e) * -0.4;
      this.anima?.(t);
    }
    this.pedestal.rotation.y = this.giro;
    this.anel.material.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.5;
    this.renderer.render(this.scene, this.camera);
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    const loop = (agora) => {
      if (!this.rodando) return;
      // no celular 30 quadros bastam, e o jogo atrás continua com a placa
      if (isTouch && agora - this.ultimo < 30) {
        requestAnimationFrame(loop);
        return;
      }
      this.ultimo = agora;
      this.quadro(agora);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // foto da maquete de um jogo (os cartões da grade): monta, desenha num tamanho pequeno e devolve
  // a imagem. Volta a mostrar o jogo que estava no palco.
  miniatura(id, cor, w = 240, h = 150) {
    const antes = { id: this.id, cor: this.anel.material.color.getHex(), giro: this.giro, surgir: this.surgir };
    const r = new THREE.Vector2();
    this.renderer.getSize(r);
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.enquadrar();
    this.id = null;
    this.mostrar(id, cor);
    this.giro = 0.5;
    this.surgir = 0;
    this.quadro(this.t0 + 1200);
    const url = this.canvas.toDataURL('image/webp', 0.85);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(r.x, r.y, false);
    this.camera.aspect = r.x / r.y;
    this.camera.updateProjectionMatrix();
    this.enquadrar();
    this.id = null;
    if (antes.id) this.mostrar(antes.id, antes.cor);
    this.giro = antes.giro;
    this.surgir = antes.surgir;
    this.quadro(); // o palco volta na hora, sem piscar a foto
    return url;
  }

  dispose() {
    this.rodando = false;
    if (this.maquete) this.soltar(this.maquete);
    this.maquete = null;
    this.soltar(this.pedestal);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
