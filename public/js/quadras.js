// Vôlei, basquete e boliche, jogados a pé com o próprio boneco, numa faixa ao norte do estádio.
//
// O botão de ação é o clique esquerdo (segurar e soltar carrega a força); o F faz o mesmo.
// - Vôlei: encostar na bola é manchete (vai para onde a câmera olha, por cima); clique perto da bola,
//   de preferência pulando, é cortada. Ponto quando a bola cai no chão; 4 toques do mesmo lado é
//   falta. 15 pontos com 2 de diferença.
// - Basquete: passou perto da bola solta, pega. Segurando o clique carrega o arremesso (a barra mostra o
//   ponto certo); soltou, arremessa na cesta para onde está olhando — olhando para outro lado, é
//   passe. Clique perto de quem está com a bola tenta roubar. Placar de cada um (2 ou 3 pontos).
// - Boliche: E na pista entra na fila (até 4). Na sua vez, segure o clique e solte para jogar; mira com
//   a câmera e o lado de onde sai é onde você está. Placar de 10 quadros, com strike e spare.
//
// O servidor (quadras-servidor.js) manda no placar e na vez; a física é a mesma dos dois lados
// (quadras-fisica.js).
import * as THREE from 'three';
import {
  VOLEI, andarVolei, ladoVolei, BASQUETE, aroBasquete, andarBasquete, forcaIdeal, ANGULO_ARREMESSO,
  BOLICHE, PINOS, simularBoliche, quadrosBoliche,
} from './quadras-fisica.js';

const LADOS = [{ nome: 'Azul', cor: '#3b82f6' }, { nome: 'Vermelho', cor: '#ef4444' }];
const FONTE = (p, peso = 800) => `${peso} ${p}px 'Plus Jakarta Sans', system-ui, sans-serif`;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const CIMA = new THREE.Vector3(0, 1, 0);

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

const plano = (w, h, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
};

// um painel de placar de duas faces (nenhuma espelhada), num poste
function painel(g, tex, larg, alt, x, y, z, ry) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const f of [0, Math.PI]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry + f;
    m.translateZ(0.03);
    g.add(m);
  }
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, y - alt / 2, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
  poste.position.set(x, (y - alt / 2) / 2, z);
  g.add(poste);
}

const fundoPlacar = (ctx, w, h) => {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
};

// ------------------------------------------------------------------ as quadras (parte do mundo)
export function construirVolei(world) {
  const V = VOLEI;
  world.reservas.push({ x: V.cx, z: V.cz, r: 17 });
  const g = new THREE.Group();
  world.fora.add(g);
  g.add(plano(V.comp + 8, V.larg + 8, new THREE.MeshStandardMaterial({ color: 0xe3cf96, roughness: 1 }), V.cx, 0.02, V.cz));
  const linhas = textura(720, 360, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(59,130,246,0.16)';
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = 'rgba(239,68,68,0.16)';
    ctx.fillRect(w / 2, 0, w / 2, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath();
    for (const x of [w / 2, w / 2 - w / 6, w / 2 + w / 6]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
  });
  g.add(plano(V.comp, V.larg, new THREE.MeshBasicMaterial({ map: linhas, transparent: true, depthWrite: false }), V.cx, 0.03, V.cz));
  // postes e rede
  const metal = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.5, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const z = V.cz + s * (V.larg / 2 + 0.6);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, V.rede.altura + 0.15, 10), metal);
    p.position.set(V.cx, (V.rede.altura + 0.15) / 2, z);
    p.castShadow = true;
    g.add(p);
    world.addBox({ min: [V.cx - 0.1, 0, z - 0.1], max: [V.cx + 0.1, V.rede.altura, z + 0.1] });
  }
  const malha = textura(256, 64, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  malha.wrapS = malha.wrapT = THREE.RepeatWrapping;
  malha.repeat.set(4, 1);
  const altRede = V.rede.altura - V.rede.base;
  const rede = new THREE.Mesh(new THREE.PlaneGeometry(V.larg + 1.2, altRede), new THREE.MeshBasicMaterial({ map: malha, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  rede.position.set(V.cx, V.rede.base + altRede / 2, V.cz);
  rede.rotation.y = Math.PI / 2;
  const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, V.larg + 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  faixa.position.set(V.cx, V.rede.altura - 0.05, V.cz);
  g.add(rede, faixa);
  const placar = textura(512, 192, (ctx, w, h, e) => {
    fundoPlacar(ctx, w, h);
    if (!e) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = FONTE(64);
      ctx.fillText('VÔLEI', w / 2, h / 2 - 22);
      ctx.font = FONTE(26, 600);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('encoste na bola para sacar · clique corta', w / 2, h / 2 + 44);
      return;
    }
    ctx.font = FONTE(110);
    ctx.fillStyle = LADOS[0].cor;
    ctx.fillText(String(e.pontos[0]), w * 0.25, h / 2 + 4);
    ctx.fillStyle = LADOS[1].cor;
    ctx.fillText(String(e.pontos[1]), w * 0.75, h / 2 + 4);
    ctx.fillStyle = '#64748b';
    ctx.font = FONTE(60);
    ctx.fillText('x', w / 2, h / 2);
    ctx.font = FONTE(22, 600);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(e.legenda, w / 2, h - 20);
  });
  painel(g, placar, 4, 1.5, V.cx, 4, V.cz - V.larg / 2 - 3, 0);
  return { grupo: g, placar };
}

export function construirBasquete(world) {
  const B = BASQUETE;
  world.reservas.push({ x: B.cx, z: B.cz, r: 20 });
  const g = new THREE.Group();
  world.fora.add(g);
  const quadra = textura(840, 450, (ctx, w, h) => {
    ctx.fillStyle = '#b7793f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, (i * h) / 30, w, h / 30);
    }
    const ex = w / B.comp; // px por metro
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 1.8 * ex, 0, Math.PI * 2);
    ctx.stroke();
    for (const s of [-1, 1]) {
      const ax = w / 2 + s * B.aro.dist * ex;
      // garrafão e linha dos 3
      ctx.fillStyle = 'rgba(30,64,175,0.55)';
      const larg = 4.9 * ex;
      const fundo = s < 0 ? 0 : w - 5.8 * ex;
      ctx.fillRect(fundo, h / 2 - larg / 2, 5.8 * ex, larg);
      ctx.strokeRect(fundo, h / 2 - larg / 2, 5.8 * ex, larg);
      ctx.beginPath();
      // meia-volta virada para o meio da quadra
      if (s < 0) ctx.arc(ax, h / 2, B.tres * ex, -Math.PI / 2, Math.PI / 2, false);
      else ctx.arc(ax, h / 2, B.tres * ex, Math.PI / 2, Math.PI * 1.5, false);
      ctx.stroke();
    }
  });
  g.add(plano(B.comp + 4, B.larg + 4, new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.9 }), B.cx, 0.02, B.cz));
  g.add(plano(B.comp, B.larg, new THREE.MeshStandardMaterial({ map: quadra, roughness: 0.55 }), B.cx, 0.03, B.cz));
  const ferro = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4, roughness: 0.5 });
  const laranja = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.4 });
  const vidro = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.2 });
  const redeTex = textura(128, 64, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3;
    for (let x = -h; x <= w + h; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + h, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  });
  const redes = [];
  for (const i of [0, 1]) {
    const s = i === 0 ? -1 : 1;
    const a = aroBasquete(i);
    const xPoste = B.cx + s * (B.comp / 2 + 1);
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.9, 0.25), ferro);
    poste.position.set(xPoste, 1.95, B.cz);
    poste.castShadow = true;
    const braco = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(xPoste - (B.cx + s * B.tabela.dist)), 0.18, 0.18), ferro);
    braco.position.set((xPoste + B.cx + s * B.tabela.dist) / 2, 3.6, B.cz);
    const tabela = new THREE.Mesh(new THREE.BoxGeometry(0.05, B.tabela.alt, B.tabela.larg), vidro);
    tabela.position.set(B.cx + s * (B.tabela.dist + 0.025), B.tabela.base + B.tabela.alt / 2, B.cz);
    const quadrado = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true }));
    quadrado.position.set(B.cx + s * (B.tabela.dist - 0.01), B.aro.altura + 0.3, B.cz);
    quadrado.rotation.y = -s * Math.PI / 2;
    const aro = new THREE.Mesh(new THREE.TorusGeometry(B.aro.raio, 0.025, 8, 28), laranja);
    aro.rotation.x = Math.PI / 2;
    aro.position.set(a.x, a.y, a.z);
    const rede = new THREE.Mesh(new THREE.CylinderGeometry(B.aro.raio, B.aro.raio * 0.6, 0.5, 16, 1, true),
      new THREE.MeshBasicMaterial({ map: redeTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    rede.position.set(a.x, a.y - 0.25, a.z);
    redes.push(rede);
    g.add(poste, braco, tabela, quadrado, aro, rede);
    world.addBox({ min: [xPoste - 0.15, 0, B.cz - 0.15], max: [xPoste + 0.15, 3.9, B.cz + 0.15] });
  }
  const placar = textura(512, 256, (ctx, w, h, e) => {
    fundoPlacar(ctx, w, h);
    ctx.fillStyle = '#f97316';
    ctx.font = FONTE(44);
    ctx.fillText('BASQUETE', w / 2, 34);
    const lista = e?.placar || [];
    if (!lista.length) {
      ctx.font = FONTE(24, 600);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('pegue a bola · segure o clique e solte na hora certa', w / 2, h / 2 + 20);
      return;
    }
    ctx.font = FONTE(30, 700);
    lista.slice(0, 5).forEach((j, k) => {
      const y = 86 + k * 36;
      ctx.textAlign = 'left';
      ctx.fillStyle = j.cor;
      ctx.fillText(`${k + 1}. ${j.nome.slice(0, 14)}`, 40, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(String(j.pts), w - 40, y);
    });
  });
  painel(g, placar, 4, 2, B.cx, 4.6, B.cz - B.larg / 2 - 3, 0);
  return { grupo: g, placar, redes };
}

export function construirBoliche(world) {
  const B = BOLICHE;
  const zMeio = (B.pistas[0] + B.pistas[1]) / 2;
  const fimDeck = B.comprimento + 3 * B.pino.espaco + 0.6;
  world.reservas.push({ x: B.x0 + 9, z: zMeio, r: 22 });
  const g = new THREE.Group();
  world.fora.add(g);
  const comp = fimDeck + 9;
  g.add(plano(comp, 14, new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.8 }), B.x0 - 6 + comp / 2, 0.02, zMeio));
  const madeira = textura(512, 64, (ctx, w, h) => {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? '#e7c89a' : '#dfbe8d';
      ctx.fillRect(0, (i * h) / 16, w, h / 16 + 1);
    }
    // as setas de mira, a 1/3 da pista
    ctx.fillStyle = '#7c2d12';
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      const x = w * 0.28 + Math.abs(i - 4) * 10;
      const y = (i * h) / 8;
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x + 14, y);
      ctx.lineTo(x, y + 3);
      ctx.fill();
    }
  });
  const pistaMat = new THREE.MeshStandardMaterial({ map: madeira, roughness: 0.35, metalness: 0.05 });
  const canaletaMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });
  const vermelho = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const placares = [];
  B.pistas.forEach((z, i) => {
    const pista = plano(fimDeck, B.largura, pistaMat, B.x0 + fimDeck / 2, 0.05, z);
    const falta = plano(0.06, B.largura + 2 * B.canaleta, vermelho, B.x0, 0.06, z);
    g.add(pista, falta);
    for (const s of [-1, 1]) g.add(plano(fimDeck, B.canaleta, canaletaMat, B.x0 + fimDeck / 2, 0.035, z + s * (B.largura + B.canaleta) / 2));
    // área de chegada, com o número da pista
    const chegada = textura(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#c9a77a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.font = FONTE(120);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(String(i + 1), 0, 0);
      ctx.restore();
    });
    g.add(plano(5, B.largura + 2 * B.canaleta, new THREE.MeshStandardMaterial({ map: chegada, roughness: 0.6 }), B.x0 - 2.5, 0.045, z));
    // fundo: o poço e a parede
    const parede = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, B.largura + 2 * B.canaleta + 0.6), new THREE.MeshStandardMaterial({ color: 0x111827 }));
    parede.position.set(B.x0 + fimDeck + 1.2, 0.8, z);
    g.add(parede);
    const placar = textura(1024, 300, (ctx, w, h, e) => desenharBoliche(ctx, w, h, e, i));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.35), new THREE.MeshBasicMaterial({ map: placar, toneMapped: false }));
    tela.position.set(B.x0 + fimDeck + 1.0, 2.6, z);
    tela.rotation.y = -Math.PI / 2;
    g.add(tela);
    placares.push(placar);
  });
  // a divisória entre as pistas (retorno da bola) e a parede do fundo para quem anda
  const div = new THREE.Mesh(new THREE.BoxGeometry(fimDeck + 4, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0x374151 }));
  div.position.set(B.x0 - 2 + (fimDeck + 4) / 2, 0.175, zMeio);
  g.add(div);
  world.addBox({ min: [B.x0 + fimDeck + 1, 0, B.pistas[0] - 2.5], max: [B.x0 + fimDeck + 1.4, 1.6, B.pistas[1] + 2.5] });
  return { grupo: g, placares, fimDeck };
}

function desenharBoliche(ctx, w, h, e, i) {
  fundoPlacar(ctx, w, h);
  ctx.fillStyle = '#f8fafc';
  ctx.font = FONTE(34);
  ctx.textAlign = 'left';
  ctx.fillText(`PISTA ${i + 1}`, 24, 30);
  if (!e?.jogadores?.length) {
    ctx.textAlign = 'center';
    ctx.font = FONTE(40, 600);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('livre — chegue na faixa da pista e aperte E', w / 2, h / 2 + 20);
    return;
  }
  const linha = Math.min(60, (h - 60) / e.jogadores.length);
  e.jogadores.forEach((j, k) => {
    const y = 60 + k * linha + linha / 2;
    const vez = e.vez === k && e.fase !== 'fim';
    if (vez) {
      ctx.fillStyle = 'rgba(250,204,21,0.18)';
      ctx.fillRect(10, y - linha / 2 + 2, w - 20, linha - 4);
    }
    ctx.textAlign = 'left';
    ctx.font = FONTE(26, 700);
    ctx.fillStyle = j.cor;
    ctx.fillText(j.nome.slice(0, 10), 20, y);
    const marcas = marcasBoliche(j.rolls);
    const tot = quadrosBoliche(j.rolls);
    ctx.textAlign = 'center';
    for (let q = 0; q < 10; q++) {
      const x = 200 + q * 72;
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(x - 34, y - linha / 2 + 4, 68, linha - 8);
      ctx.font = FONTE(18, 700);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(marcas[q] || '', x, y - 10);
      ctx.font = FONTE(18, 600);
      ctx.fillStyle = '#94a3b8';
      if (tot[q] !== undefined) ctx.fillText(String(tot[q]), x, y + 14);
    }
    ctx.font = FONTE(30);
    ctx.fillStyle = '#facc15';
    ctx.fillText(String(tot.at(-1) ?? 0), w - 50, y);
  });
}

// as marcas de cada quadro: "X", "7 /", "8 1"...
function marcasBoliche(rolls) {
  const m = [];
  let i = 0;
  for (let q = 0; q < 10 && i < rolls.length; q++) {
    const a = rolls[i];
    const b = rolls[i + 1];
    if (q < 9) {
      if (a === 10) {
        m.push('X');
        i += 1;
      } else {
        m.push(b === undefined ? `${a}` : a + b === 10 ? `${a} /` : `${a} ${b}`);
        i += 2;
      }
    } else {
      const r = rolls.slice(i);
      let s = '';
      r.forEach((n, k) => {
        const ant = r[k - 1];
        if (n === 10 && (k === 0 || ant === 10 || (k === 2 && r[0] + r[1] === 10))) s += 'X ';
        else if (k > 0 && ant !== 10 && !(k === 2 && r[0] + r[1] === 10) && ant + n === 10) s += '/ ';
        else s += `${n} `;
      });
      m.push(s.trim());
      i = rolls.length;
    }
  }
  return m;
}

// ------------------------------------------------------------------ malhas que se mexem
function bolaMalha(raio, cores) {
  const tex = textura(256, 128, (ctx, w, h) => {
    cores.forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.fillRect((k * w) / cores.length, 0, w / cores.length + 1, h);
    });
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 24, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  m.castShadow = true;
  return m;
}
function basqueteMalha() {
  const tex = textura(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d9611c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1f1308';
    ctx.lineWidth = 4;
    for (const x of [0, w / 4, w / 2, (3 * w) / 4]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(BASQUETE.raio, 22, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.castShadow = true;
  return m;
}
const geoPino = (() => {
  const s = BOLICHE.pino.altura / 0.38;
  const perfil = [[0, 0], [0.026, 0], [0.033, 0.04], [0.06, 0.11], [0.058, 0.16], [0.032, 0.24], [0.024, 0.27], [0.03, 0.31], [0.031, 0.35], [0.02, 0.375], [0, 0.38]]
    .map(([r, y]) => new THREE.Vector2(r * s, y * s));
  return new THREE.LatheGeometry(perfil, 14);
})();
const matPino = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
const matFaixa = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
function pinoMalha() {
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(geoPino, matPino);
  corpo.castShadow = true;
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.029 * (BOLICHE.pino.altura / 0.38), 0.032 * (BOLICHE.pino.altura / 0.38), 0.02, 12), matFaixa);
  faixa.position.y = 0.255 * (BOLICHE.pino.altura / 0.38);
  g.add(corpo, faixa);
  return g;
}

// ------------------------------------------------------------------ o jogo no navegador
export class Quadras {
  // opts: world, player, sfx, toast, ligado(nome), livre() (dá para usar clique/F/E agora), posDe(id),
  // yawDe(id) (onde está e para onde olha cada pessoa da sala)
  constructor(opts) {
    Object.assign(this, opts);
    this.socket = null;
    this.eu = null;
    this.q3d = opts.world.quadras3d;

    // vôlei
    this.vol = { e: null, bola: { p: new THREE.Vector3(VOLEI.cx - 7.5, 2.2, VOLEI.cz), v: new THREE.Vector3() }, seq: 0, toqueEm: -1e9, recarga: 0, noChao: false };
    this.vol.malha = bolaMalha(VOLEI.raio, ['#facc15', '#2563eb', '#f8fafc', '#facc15', '#2563eb', '#f8fafc']);
    this.q3d.volei.grupo.add(this.vol.malha);

    // basquete
    this.bas = { e: null, bola: { p: new THREE.Vector3(BASQUETE.cx, 1, BASQUETE.cz), v: new THREE.Vector3() }, pediu: 0, largouEm: -1e9, carga: null, cesta: 0 };
    this.bas.malha = basqueteMalha();
    this.q3d.basquete.grupo.add(this.bas.malha);

    // boliche: pinos e bola de cada pista
    this.bol = BOLICHE.pistas.map((z, i) => {
      const pinos = PINOS.map((p) => {
        const m = pinoMalha();
        m.position.set(BOLICHE.x0 + p.u, 0.05, z + p.w);
        this.q3d.boliche.grupo.add(m);
        return m;
      });
      const bola = bolaMalha(BOLICHE.bola.raio, ['#7c3aed', '#4c1d95', '#7c3aed', '#5b21b6']);
      bola.position.set(BOLICHE.x0 - 3, 0.6, z + (i === 0 ? -1 : 1) * (BOLICHE.largura / 2 + 0.6));
      this.q3d.boliche.grupo.add(bola);
      return { z, e: null, pinos, bola, filme: null, t: 0, carga: null };
    });

    this.carga = null; // { jogo, desde } enquanto o clique (ou o F) está apertado
    this.montarHud();
    // o clique esquerdo e o F chegam pelo main.js (acaoDosJogos), que decide qual jogo usa
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('vol-estado', (e) => this.estadoVolei(e));
    socket.on('vol-bola', (a) => this.bolaVolei(a));
    socket.on('bas-estado', (e) => this.estadoBasquete(e));
    socket.on('bas-bola', (a) => this.bolaBasquete(a));
    socket.on('bas-cesta', (m) => this.cesta(m));
    socket.on('bas-roubo', (m) => {
      if (m.roubaram) this.toast(`${m.roubaram} roubou a bola de você!`, 'warn', 2200);
      else this.toast(m.conseguiu ? 'Roubou a bola!' : 'Não conseguiu roubar.', m.conseguiu ? 'info' : 'warn', 1600);
    });
    socket.on('bol-estado', (e) => this.estadoPista(e));
    socket.on('bol-lance', (m) => this.lanceBoliche(m));
  }

  ver() {
    this.socket?.emit('quadras-ver', (r) => {
      if (!r) return;
      this.estadoVolei(r.volei);
      this.estadoBasquete(r.basquete);
      r.boliche.forEach((p) => this.estadoPista(p));
    });
  }

  perto(onde, raio) {
    const p = this.player.pos;
    return Math.hypot(p.x - onde.x, p.z - onde.z) < raio;
  }

  // ---------------------------------------------------------------- vôlei
  estadoVolei(e) {
    const antes = this.vol.e;
    this.vol.e = e;
    if (e.fase === 'saque' || antes?.fase !== e.fase) {
      const [x, y, z, vx, vy, vz] = e.bola;
      this.vol.bola.p.set(x, y, z);
      this.vol.bola.v.set(vx, vy, vz);
      this.vol.noChao = false;
    }
    if (antes?.fase !== e.fase && e.fase === 'ponto' && e.marcou && this.perto({ x: VOLEI.cx, z: VOLEI.cz }, 24)) {
      this.mensagem(`Ponto do ${LADOS[e.marcou.lado].nome}`, e.marcou.motivo, 1800, LADOS[e.marcou.lado].cor);
      this.sfx.checkpoint();
    }
    if (antes?.fase !== e.fase && e.fase === 'fim' && this.perto({ x: VOLEI.cx, z: VOLEI.cz }, 24)) {
      const v = e.pontos[0] > e.pontos[1] ? 0 : 1;
      this.mensagem(`${LADOS[v].nome} venceu!`, `${e.pontos[0]} x ${e.pontos[1]}`, 5000, LADOS[v].cor);
      this.sfx.finish();
    }
    const parado = e.fase === 'saque' && !e.pontos[0] && !e.pontos[1];
    const legenda = e.fase === 'saque' ? `saque do ${LADOS[e.saque].nome}` : e.fase === 'fim' ? 'fim de jogo' : e.fase === 'ponto' ? `ponto: ${e.marcou?.motivo || ''}` : 'em jogo';
    this.q3d.volei.placar.userData.redesenhar(parado ? null : { pontos: e.pontos, legenda });
  }

  bolaVolei(a) {
    if (this.vol.e?.fase !== 'jogo' && this.vol.e?.fase !== 'saque') return;
    const [x, y, z, vx, vy, vz, id, seq] = a;
    if (performance.now() - this.vol.toqueEm < 450 && (id !== this.eu || seq < this.vol.seq)) return;
    const s = { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz) };
    andarVolei(s, 0.06);
    if (s.p.distanceTo(this.vol.bola.p) > 3) this.vol.bola.p.copy(s.p);
    else this.vol.bola.p.lerp(s.p, 0.35);
    this.vol.bola.v.copy(s.v);
    this.vol.noChao = false;
  }

  updateVolei(dt, t) {
    const V = this.vol;
    const e = V.e;
    const b = V.bola;
    if (e?.fase === 'jogo' && !V.noChao) V.noChao = andarVolei(b, dt) === 'chao';
    V.malha.position.copy(b.p);
    if (e?.fase === 'saque') V.malha.position.y = b.p.y + Math.sin(t * 2.5) * 0.08; // esperando o saque
    const vh = Math.hypot(b.v.x, b.v.z);
    if (vh > 0.1 && !V.noChao) V.malha.rotateOnWorldAxis(_a.set(b.v.z / vh, 0, -b.v.x / vh), (vh * dt) / VOLEI.raio);
    V.recarga -= dt;
    if (!this.ligado('volei') || !e || (e.fase !== 'jogo' && e.fase !== 'saque') || V.recarga > 0) return;
    if (!this.perto({ x: VOLEI.cx, z: VOLEI.cz }, 20)) return;
    // encostou: manchete
    const p = this.player.pos;
    const R = VOLEI.raio;
    const partes = [[1.1, 0.55], [1.75, 0.34]];
    if (!this.player.grounded) partes.push([2.15, 0.45]); // pulando, as mãos para cima
    for (const [y, r] of partes) {
      if (_a.set(p.x, p.y + y, p.z).distanceTo(b.p) < r + R) return this.baterVolei(false);
    }
  }

  baterVolei(cortada) {
    const V = this.vol;
    const b = V.bola;
    const pl = this.player;
    const olhar = pl.lookDirection(_b);
    const h = _c.set(olhar.x, 0, olhar.z);
    if (h.lengthSq() < 1e-4) h.set(ladoVolei(pl.pos.x) === 0 ? 1 : -1, 0, 0);
    h.normalize();
    if (cortada && !pl.grounded) {
      // cortada: forte, para baixo, para onde a câmera olha
      b.v.copy(olhar).multiplyScalar(15);
      b.v.y = THREE.MathUtils.clamp(b.v.y, -7, 1.5);
      if (Math.hypot(b.v.x, b.v.z) < 8) b.v.addScaledVector(h, 8);
      this.sfx.punchHit();
    } else if (cortada) {
      // toque de dedos: mais alto e mais curto (levantar para alguém cortar)
      b.v.copy(h).multiplyScalar(3.4);
      b.v.y = 8.2;
    } else {
      b.v.copy(h).multiplyScalar(4.3);
      b.v.y = 7.4;
      b.v.x += pl.vel.x * 0.25;
      b.v.z += pl.vel.z * 0.25;
    }
    // a bola sai de cima do boneco
    if (b.p.y < pl.pos.y + 1.3) b.p.y = pl.pos.y + 1.3;
    V.noChao = false;
    V.recarga = 0.35;
    V.seq++;
    V.toqueEm = performance.now();
    if (!cortada) this.sfx.jump();
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.emit('vol-toque', { p: [a(b.p.x), a(b.p.y), a(b.p.z)], v: [a(b.v.x), a(b.v.y), a(b.v.z)], seq: V.seq });
  }

  // ---------------------------------------------------------------- basquete
  estadoBasquete(e) {
    const antes = this.bas.e;
    this.bas.e = e;
    if (!e.dono) {
      // ficou solta agora (ou chegou assim): segue a do servidor
      if (antes?.dono !== null || !antes) {
        const [x, y, z, vx, vy, vz] = e.bola;
        if (antes?.dono !== this.eu) {
          this.bas.bola.p.set(x, y, z);
          this.bas.bola.v.set(vx, vy, vz);
        }
      }
    }
    if (e.dono === this.eu && antes?.dono !== this.eu) {
      this.toast('Bola com você: segure o clique e solte na hora certa para arremessar.', 'info', 2600);
      this.sfx.message();
    }
    if (e.dono !== this.eu && this.carga?.jogo === 'basquete') this.carga = null;
    this.q3d.basquete.placar.userData.redesenhar(e);
  }

  bolaBasquete(a) {
    if (this.bas.e?.dono) return;
    // a minha bola acabou de sair da mão: a minha previsão vale até o servidor alcançar
    if (performance.now() - this.bas.largouEm < 300) return;
    const [x, y, z, vx, vy, vz] = a;
    const s = { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz) };
    andarBasquete(s, 0.06);
    if (s.p.distanceTo(this.bas.bola.p) > 2.5) this.bas.bola.p.copy(s.p);
    else this.bas.bola.p.lerp(s.p, 0.35);
    this.bas.bola.v.copy(s.v);
  }

  cesta(m) {
    this.bas.cesta = 0.6;
    this.bas.aroCesta = m.aro;
    if (!this.perto({ x: BASQUETE.cx, z: BASQUETE.cz }, 26)) return;
    if (m.pts) this.mensagem(`CESTA! +${m.pts}`, m.nome, 1800, '#f97316');
    this.sfx.finish();
  }

  updateBasquete(dt, t) {
    const S = this.bas;
    const e = S.e;
    const b = S.bola;
    const m = S.malha;
    const dono = e?.dono;
    if (dono) {
      // na mão de alguém: quica do lado dele andando, no peito parado (ou carregando)
      const meu = dono === this.eu;
      const pos = meu ? this.player.pos : this.posDe(dono);
      if (pos) {
        const yaw = meu ? this.player.bodyYaw : this.yawDe(dono) ?? 0;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const vel = meu ? Math.hypot(this.player.vel.x, this.player.vel.z) : 3;
        const carregando = meu && this.carga?.jogo === 'basquete';
        let y;
        if (carregando) y = 2.0;
        else if (vel > 0.8) y = 0.25 + Math.abs(Math.sin(t * 8)) * 0.75;
        else y = 1.1;
        b.p.set(pos.x + fx * 0.45 - fz * (carregando ? 0 : 0.3), pos.y + y, pos.z + fz * 0.45 + fx * (carregando ? 0 : 0.3));
        b.v.set(0, 0, 0);
      }
    } else if (e) {
      const r = andarBasquete(b, dt);
      if (r) S.cesta = Math.max(S.cesta, 0.01);
    }
    m.position.copy(b.p);
    const vh = Math.hypot(b.v.x, b.v.z);
    if (vh > 0.1) m.rotateOnWorldAxis(_a.set(b.v.z / vh, 0, -b.v.x / vh), (vh * dt) / BASQUETE.raio);
    // a rede balança na cesta
    if (S.cesta > 0) {
      S.cesta -= dt;
      const rede = this.q3d.basquete.redes[S.aroCesta ?? 0];
      if (rede) rede.scale.y = 1 + Math.sin(S.cesta * 20) * 0.25 * S.cesta;
    }
    if (!this.ligado('basquete') || !e || dono) return;
    // passou perto da bola solta: pega
    const p = this.player.pos;
    const agora = performance.now();
    if (agora - S.largouEm < 700 || agora - S.pediu < 400) return;
    if (Math.hypot(p.x - b.p.x, p.z - b.p.z) < 1.0 && b.p.y > p.y - 0.3 && b.p.y < p.y + 2.5) {
      S.pediu = agora;
      this.socket?.emit('bas-pegar');
    }
  }

  // soltou o clique (ou o F) com a bola: arremesso na cesta para onde olha (ou passe, olhando para outro lado)
  arremessar(carga) {
    const S = this.bas;
    const pl = this.player;
    const olhar = pl.lookDirection(_b);
    const h = _c.set(olhar.x, 0, olhar.z).normalize();
    const mao = new THREE.Vector3(pl.pos.x + h.x * 0.4, pl.pos.y + 2.0, pl.pos.z + h.z * 0.4);
    let melhor = null;
    for (const i of [0, 1]) {
      const a = aroBasquete(i);
      const d = _a.set(a.x - mao.x, 0, a.z - mao.z);
      const dist = d.length();
      const cos = d.normalize().dot(h);
      if (cos > 0.55 && (!melhor || dist < melhor.dist)) melhor = { a, dist, dir: d.clone() };
    }
    const v = new THREE.Vector3();
    if (!melhor) {
      v.copy(olhar).multiplyScalar(9); // passe
      v.y = Math.max(v.y, 2.5);
    } else {
      // perto demais da cesta (embaixo dela): bandeja para cima
      const ideal = forcaIdeal(melhor.dist + 0.05, melhor.a.y - mao.y) ?? 6;
      const forca = ideal * (0.8 + 0.4 * carga); // carga 0,5 = no ponto
      // mira com um errinho, maior de longe e correndo
      const correndo = Math.hypot(pl.vel.x, pl.vel.z) > 3 ? 1.8 : 1;
      const erro = (Math.random() - 0.5) * 0.02 * (melhor.dist / 6) * correndo;
      const ang = Math.atan2(melhor.dir.z, melhor.dir.x) + erro;
      v.set(Math.cos(ang) * Math.cos(ANGULO_ARREMESSO), Math.sin(ANGULO_ARREMESSO), Math.sin(ang) * Math.cos(ANGULO_ARREMESSO)).multiplyScalar(forca);
    }
    S.bola.p.copy(mao);
    S.bola.v.copy(v);
    S.largouEm = performance.now();
    if (S.e) S.e = { ...S.e, dono: null };
    const a = (n) => Math.round(n * 100) / 100;
    this.socket?.emit('bas-arremesso', { p: [a(mao.x), a(mao.y), a(mao.z)], v: [a(v.x), a(v.y), a(v.z)] });
    this.sfx.jump();
  }

  // ---------------------------------------------------------------- boliche
  estadoPista(e) {
    const P = this.bol[e.pista];
    const antes = P.e;
    P.e = e;
    this.q3d.boliche.placares[e.pista].userData.redesenhar(e);
    // fora da animação: os pinos ficam como o servidor diz
    if (!P.filme) this.arrumarPinos(P, e.emPe);
    const minha = e.jogadores[e.vez]?.id === this.eu && e.fase === 'jogando';
    const eraMinha = antes && antes.jogadores[antes.vez]?.id === this.eu && antes.fase === 'jogando';
    if (minha && !eraMinha) {
      this.mensagem('Sua vez!', 'Segure o clique e solte para jogar. Mire com a câmera.', 2200, '#facc15');
      this.sfx.message();
    }
    if (e.fase === 'fim' && antes?.fase !== 'fim' && e.jogadores.some((j) => j.id === this.eu)) {
      const lista = e.jogadores.map((j) => ({ nome: j.nome, t: quadrosBoliche(j.rolls).at(-1) ?? 0 })).sort((a, b) => b.t - a.t);
      this.mensagem(`${lista[0].nome} venceu!`, lista.map((j) => `${j.nome} ${j.t}`).join(' · '), 6000, '#facc15');
      this.sfx.finish();
    }
  }

  arrumarPinos(P, emPe) {
    PINOS.forEach((pp, i) => {
      const m = P.pinos[i];
      m.visible = !!emPe[i];
      m.position.set(BOLICHE.x0 + pp.u, 0.05, P.z + pp.w);
      m.quaternion.identity();
    });
    P.bola.position.set(BOLICHE.x0 - 3, 0.6, P.z + (P === this.bol[0] ? -1 : 1) * (BOLICHE.largura / 2 + 0.6));
  }

  // todos animam a mesma jogada (a conta é a mesma do servidor); no fim os pinos ficam como ele disse
  lanceBoliche(m) {
    const P = this.bol[m.pista];
    const quadros = [];
    simularBoliche(m.lance, m.antes, (t, bola, pinos) => {
      quadros.push({ t, bola: { ...bola }, pinos: pinos.map((p) => ({ u: p.u, w: p.w, tomb: p.tomb, dir: p.dir, ativo: p.ativo })) });
    });
    P.filme = { quadros, depois: m.depois, caiu: m.caiu, antes: m.antes, nome: m.nome, id: m.id };
    P.t = 0;
    this.arrumarPinos(P, m.antes);
    if (m.id === this.eu) this.sfx.jump();
  }

  updateBoliche(dt) {
    for (const P of this.bol) {
      const f = P.filme;
      if (!f) continue;
      P.t += dt;
      const q = f.quadros.find((x) => x.t >= P.t) || f.quadros.at(-1);
      P.bola.visible = !q.bola.fora;
      P.bola.position.set(BOLICHE.x0 + q.bola.u, BOLICHE.bola.raio + (q.bola.canaleta ? -0.02 : 0.05), P.z + q.bola.w);
      P.bola.rotation.z -= dt * 12;
      q.pinos.forEach((p, i) => {
        const m = P.pinos[i];
        if (!f.antes[i]) return;
        m.visible = p.ativo || p.tomb < 1;
        m.position.set(BOLICHE.x0 + p.u, 0.05, P.z + p.w);
        // tombando para o lado em que foi empurrado
        const dx = Math.cos(p.dir);
        const dz = Math.sin(p.dir);
        m.quaternion.setFromAxisAngle(_a.set(dz, 0, -dx), p.tomb * Math.PI / 2);
      });
      // terminou: o resultado, e um tempinho com os pinos caídos à vista
      if (P.t > q.t + 0.01 && q === f.quadros.at(-1) && !f.avisou) {
        f.avisou = true;
        const strike = f.caiu === 10 && f.antes.every(Boolean);
        const spare = !strike && f.depois.every((x) => !x);
        if (this.perto({ x: BOLICHE.x0, z: P.z }, 26)) {
          this.mensagem(strike ? 'STRIKE!' : spare ? 'SPARE!' : `${f.caiu} ${f.caiu === 1 ? 'pino' : 'pinos'}`, f.nome, 1600, strike || spare ? '#facc15' : '#f8fafc');
          if (strike || spare) this.sfx.finish();
          else this.sfx.punchHit();
        }
      }
      if (P.t > q.t + 1.4 && q === f.quadros.at(-1)) {
        P.filme = null;
        this.arrumarPinos(P, P.e?.emPe ?? f.depois);
      }
    }
  }

  pistaPerto() {
    const p = this.player.pos;
    for (let i = 0; i < this.bol.length; i++) {
      const z = this.bol[i].z;
      if (p.x > BOLICHE.x0 - 6 && p.x < BOLICHE.x0 + 0.6 && Math.abs(p.z - z) < BOLICHE.largura / 2 + 0.9) return i;
    }
    return -1;
  }

  minhaPista() {
    return this.bol.findIndex((P) => P.e?.jogadores.some((j) => j.id === this.eu));
  }

  jogarBoliche(i, carga) {
    const P = this.bol[i];
    const olhar = this.player.lookDirection(_b);
    const ang = THREE.MathUtils.clamp(Math.atan2(olhar.z, olhar.x), -0.07, 0.07);
    const vel = THREE.MathUtils.lerp(BOLICHE.bola.min, BOLICHE.bola.max, carga);
    const w = THREE.MathUtils.clamp(this.player.pos.z - P.z, -(BOLICHE.largura / 2 - BOLICHE.bola.raio), BOLICHE.largura / 2 - BOLICHE.bola.raio);
    this.socket?.emit('bol-lancar', { pista: i, w: Math.round(w * 1000) / 1000, vu: Math.round(vel * Math.cos(ang) * 1000) / 1000, vw: Math.round(vel * Math.sin(ang) * 1000) / 1000 });
  }

  // ---------------------------------------------------------------- teclas
  // Clique (ou F) apertado: começa a carregar (basquete com a bola, boliche na vez), ou bate/rouba
  // na hora. Devolve se usou o clique (o main.js não soca nem foca tela com ele).
  apertouF() {
    const agora = performance.now();
    // vôlei: cortada (ou toque) com a bola perto
    const V = this.vol;
    if (this.ligado('volei') && (V.e?.fase === 'jogo' || V.e?.fase === 'saque') && V.recarga <= 0) {
      const p = this.player.pos;
      if (_a.set(p.x, p.y + 1.9, p.z).distanceTo(V.bola.p) < 1.9) {
        this.baterVolei(true);
        return true;
      }
    }
    // basquete
    const e = this.bas.e;
    if (this.ligado('basquete') && e) {
      if (e.dono === this.eu) {
        this.carga = { jogo: 'basquete', desde: agora };
        return true;
      }
      if (e.dono) {
        const pos = this.posDe(e.dono);
        const p = this.player.pos;
        if (pos && Math.hypot(pos.x - p.x, pos.z - p.z) < 1.9) {
          this.socket?.emit('bas-roubar');
          return true;
        }
      }
    }
    // boliche: na minha vez, na faixa da minha pista
    const i = this.pistaPerto();
    const P = this.bol[i];
    if (i >= 0 && this.ligado('boliche') && P.e?.fase === 'jogando' && P.e.jogadores[P.e.vez]?.id === this.eu && !P.filme) {
      this.carga = { jogo: 'boliche', pista: i, desde: agora };
      return true;
    }
    return false;
  }

  soltouF() {
    const c = this.carga;
    if (!c) return false;
    this.carga = null;
    const carga = this.valorCarga(c);
    if (c.jogo === 'basquete' && this.bas.e?.dono === this.eu) this.arremessar(carga);
    else if (c.jogo === 'boliche') this.jogarBoliche(c.pista, carga);
    return true;
  }

  // vai e volta: 0 -> 1 em 1,1 s, depois volta (segurar demais não ajuda)
  valorCarga(c) {
    const s = ((performance.now() - c.desde) / 1100) % 2;
    return s <= 1 ? s : 2 - s;
  }

  // a ação (clique, F ou o botão do celular) vale agora: na areia do vôlei, na quadra de basquete ou
  // na sua pista do boliche
  ativo() {
    return (this.ligado('volei') && this.perto({ x: VOLEI.cx, z: VOLEI.cz }, 16))
      || (this.ligado('basquete') && this.perto({ x: BASQUETE.cx, z: BASQUETE.cz }, 18))
      || (this.ligado('boliche') && this.minhaPista() >= 0 && this.pistaPerto() === this.minhaPista());
  }

  // E: entrar ou sair da fila de uma pista do boliche. Devolve se usou o E.
  usarE() {
    if (!this.ligado('boliche')) return false;
    const i = this.pistaPerto();
    if (i < 0) return false;
    const minha = this.minhaPista();
    if (minha === i) {
      this.socket?.emit('bol-sair');
      this.toast('Você saiu da pista.', 'info', 1800);
      return true;
    }
    if (minha >= 0) {
      this.toast(`Você já está na pista ${minha + 1}.`, 'info', 1800);
      return true;
    }
    this.socket?.emit('bol-entrar', { pista: i }, (r) => {
      if (r?.ok) this.toast(`Você entrou na pista ${i + 1}. Na sua vez: segure o clique e solte.`, 'info', 3200);
      else if (r?.erro === 'cheia') this.toast('Pista cheia (4 jogadores). Tente a outra.', 'warn', 2200);
    });
    return true;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt, t) {
    this.updateVolei(dt, t);
    this.updateBasquete(dt, t);
    this.updateBoliche(dt);
    // a barra de força enquanto o clique (ou o F) está apertado
    if (this.carga) {
      const v = this.valorCarga(this.carga);
      this.forca.hidden = false;
      this.forcaBarra.style.width = `${Math.round(v * 100)}%`;
      // no basquete o ponto certo é o meio; no boliche, quanto mais, mais forte
      const certo = this.carga.jogo === 'basquete' && Math.abs(v - 0.5) < 0.05;
      this.forcaBarra.style.background = certo ? '#22c55e' : this.carga.jogo === 'basquete' ? '#f97316' : '#facc15';
      this.forcaAlvo.hidden = this.carga.jogo !== 'basquete';
    } else if (!this.forca.hidden) this.forca.hidden = true;
  }

  // a 4 Hz: a dica do E (boliche) e da vez
  atualizarDica(livre) {
    let txt = '';
    const i = this.pistaPerto();
    if (livre && i >= 0 && this.ligado('boliche')) {
      const P = this.bol[i];
      const minha = this.minhaPista();
      if (minha === i) {
        const vez = P.e?.jogadores[P.e.vez];
        txt = P.e?.fase === 'jogando' && vez?.id === this.eu ? '<kbd>Clique</kbd>Segure e solte para jogar · <kbd>E</kbd>sair' : `Vez de ${vez?.nome || '…'} · <kbd>E</kbd>sair da pista`;
      } else if (minha < 0) txt = `<kbd>E</kbd>Jogar boliche na pista ${i + 1}`;
    }
    if (txt !== this.dicaAntes) {
      this.dicaAntes = txt;
      this.dica.innerHTML = txt;
      this.dica.hidden = !txt;
    }
  }

  // ---------------------------------------------------------------- tela
  montarHud() {
    const css = document.createElement('style');
    css.textContent = `
#q-forca { position: fixed; left: 50%; bottom: 150px; transform: translateX(-50%); width: min(320px, 70vw); height: 16px; border-radius: 9px; background: rgba(15,23,42,.8);
  overflow: hidden; z-index: 30; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
#q-forca[hidden], #q-msg[hidden], #q-dica[hidden] { display: none; }
#q-forca i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; }
#q-forca b { position: absolute; left: 45%; width: 10%; top: 0; bottom: 0; border-left: 2px solid #fff; border-right: 2px solid #fff; }
#q-msg { position: fixed; top: 24%; left: 0; right: 0; text-align: center; z-index: 30; pointer-events: none; color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  text-shadow: 0 4px 22px rgba(0,0,0,.6); }
#q-msg b { display: block; font-size: clamp(40px, 7vw, 84px); line-height: 1; }
#q-msg span { display: block; margin-top: 8px; font-size: 18px; font-weight: 600; }
#q-dica { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 30; padding: 10px 16px; border-radius: 12px; background: rgba(15,23,42,.85);
  color: #f8fafc; font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; }
#q-dica kbd { padding: 1px 7px; margin: 0 6px 0 4px; border-radius: 6px; background: #facc15; color: #0f172a; font: inherit; font-weight: 800; }`;
    document.head.appendChild(css);
    this.forca = document.createElement('div');
    this.forca.id = 'q-forca';
    this.forca.hidden = true;
    this.forca.innerHTML = '<i></i><b></b>';
    this.forcaBarra = this.forca.querySelector('i');
    this.forcaAlvo = this.forca.querySelector('b');
    this.msg = document.createElement('div');
    this.msg.id = 'q-msg';
    this.msg.hidden = true;
    this.msg.innerHTML = '<b></b><span></span>';
    this.dica = document.createElement('div');
    this.dica.id = 'q-dica';
    this.dica.hidden = true;
    document.body.append(this.forca, this.msg, this.dica);
  }

  mensagem(titulo, texto, ms, cor = '#f8fafc') {
    this.msg.querySelector('b').textContent = titulo;
    this.msg.querySelector('b').style.color = cor;
    this.msg.querySelector('span').textContent = texto || '';
    this.msg.hidden = false;
    clearTimeout(this.tMsg);
    this.tMsg = setTimeout(() => { this.msg.hidden = true; }, ms);
  }
}
