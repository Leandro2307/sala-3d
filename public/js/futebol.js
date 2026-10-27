// Futebol de carro: estádio ao norte do cinema, bola gigante, gols e turbo para voar com o carro.
//
// Quem entra (E na faixa da entrada) vira um carro de um dos dois times e joga contra quem mais
// estiver lá. O carro é dirigido aqui, no navegador, com física própria (pulo, pulo duplo, mortal,
// turbo e giro no ar), e a posição vai para os outros pela rede (fut-carro). A bola é do servidor
// (futebol-servidor.js): ela é prevista aqui entre um recado e outro, e quem encosta nela calcula o
// chute na hora e manda a bola nova. Quem só assiste, de fora do vidro, vê a mesma partida.
//
// O campo tem um sistema próprio (ver futebol-fisica.js): x de lado a lado, z de gol a gol, y para
// cima. O grupo do estádio é girado e posto no mundo; tudo da partida mora dentro dele.
import * as THREE from 'three';
import { CAMPO, BOLA, ALMOFADAS, andarBola, colidirCampo, lugarDaSaida } from './futebol-fisica.js';
import { criarPersonagem, PERSONAGENS } from './modelo.js';
import { isTouch } from './touch.js';
import { MAPAS, MAPA_DA_PAGINA } from './mapas-dados.js';

// onde o mapa da sala põe o estádio (a física do campo é no sistema dele, então o servidor não liga)
export const ESTADIO = { ...MAPAS[MAPA_DA_PAGINA].atracoes.estadio };
const W = CAMPO.largura / 2;
const L = CAMPO.comprimento / 2;
const G = CAMPO.gol;
const ARQ = 10; // fundo da arquibancada de cada lado
// a faixa da entrada: do lado do cinema (x do campo positivo é o sul do mundo), perto do gol leste
const ENTRADA = { x: W + ARQ + 6, z: 24 };
const TIMES = [
  { nome: 'Azul', cor: '#3b82f6', claro: '#93c5fd' },
  { nome: 'Laranja', cor: '#f97316', claro: '#fdba74' },
];

// o carro
const GRAV = BOLA.gravidade;
const TOPO = 18; // m/s só no acelerador
const MAX = 32; // com turbo
const TURBO_ACEL = 22;
const TURBO_GASTO = 33; // por segundo (100 dura 3 s)
const PULO = 7.5;
const PULO_SEGURAR = 14; // segurando o espaço, os primeiros 0,2 s sobem mais
const DUPLO = 7;
const MORTAL = 8.5;
const MORTAL_S = 0.62;
const CAIXA = new THREE.Vector3(0.95, 0.6, 1.7); // meia caixa do carro, para encostar na bola
const ALTURA_CENTRO = 0.6;
const RAIO_CARRO = 1.25; // nas paredes o carro é uma bola deste raio

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fr = new THREE.Vector3();
const _esq = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

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

// ------------------------------------------------------------------ o estádio (parte do mundo)
// Chamado pelo World antes da natureza (as reservas deixam o lugar sem árvore e sem lago).
export function construirEstadio(world) {
  for (const x of [-15, 18, 51]) for (const z of [100, 150]) world.reservas.push({ x, z, r: 38 });
  const g = new THREE.Group();
  g.position.set(ESTADIO.cx, 0, ESTADIO.cz);
  g.rotation.y = ESTADIO.giro;
  world.fora.add(g);
  g.updateMatrixWorld(true);

  // caixa no sistema do campo -> parede de verdade no mundo (o giro é de 90°: continua alinhada)
  const parede = (x0, x1, y0, y1, z0, z1) => {
    const a = g.localToWorld(new THREE.Vector3(x0, y0, z0));
    const b = g.localToWorld(new THREE.Vector3(x1, y1, z1));
    world.addBox({ min: [Math.min(a.x, b.x), y0, Math.min(a.z, b.z)], max: [Math.max(a.x, b.x), y1, Math.max(a.z, b.z)] });
  };

  // gramado com as linhas
  const gramado = textura(512, 736, (ctx, w, h) => {
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#2f7d3a' : '#348a40';
      ctx.fillRect(0, (i * h) / 12, w, h / 12 + 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    const gw = (G.largura / CAMPO.largura) * w;
    for (const [y, s] of [[6, 1], [h - 6, -1]]) {
      ctx.strokeRect(w / 2 - gw, y, gw * 2, s * 90);
    }
    // o meio de cada campo puxado para a cor do time
    for (const [y0, cor] of [[0, 'rgba(59,130,246,0.10)'], [h / 2, 'rgba(249,115,22,0.10)']]) {
      ctx.fillStyle = cor;
      ctx.fillRect(0, y0, w, h / 2);
    }
  });
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO.largura, CAMPO.comprimento), new THREE.MeshStandardMaterial({ map: gramado, roughness: 0.9 }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = 0.03;
  chao.receiveShadow = true;
  g.add(chao);
  // o chão dentro dos gols e a calçada em volta do vidro
  const pisoGol = new THREE.MeshStandardMaterial({ color: 0x2a6b33, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(G.largura, G.fundo), pisoGol);
    p.rotation.x = -Math.PI / 2;
    p.position.set(0, 0.03, s * (L + G.fundo / 2));
    g.add(p);
  }
  const calcada = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO.largura + ARQ * 2 + 24, CAMPO.comprimento + G.fundo * 2 + 16),
    new THREE.MeshStandardMaterial({ color: 0x5b6170, roughness: 0.95 }));
  calcada.rotation.x = -Math.PI / 2;
  calcada.position.y = 0.015;
  calcada.receiveShadow = true;
  g.add(calcada);

  // vidro: laterais, cantos, fundos com o buraco do gol e a caixa do gol
  const vidro = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.1, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const placa = (larg, alt, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), vidro);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  };
  const H = CAMPO.altura;
  const ladoReto = CAMPO.comprimento - CAMPO.chanfro * 2;
  const fundoReto = CAMPO.largura - CAMPO.chanfro * 2;
  const diag = CAMPO.chanfro * Math.SQRT2;
  for (const s of [-1, 1]) {
    placa(ladoReto, H, s * W, H / 2, 0, Math.PI / 2);
    for (const t of [-1, 1]) {
      placa(diag, H, s * (W - CAMPO.chanfro / 2), H / 2, t * (L - CAMPO.chanfro / 2), s * t > 0 ? Math.PI / 4 : -Math.PI / 4);
    }
    // fundo: dos lados do gol e em cima dele
    const lado = (fundoReto - G.largura) / 2;
    for (const t of [-1, 1]) placa(lado, H, t * (G.largura / 2 + lado / 2), H / 2, s * L, 0);
    placa(G.largura, H - G.altura, 0, G.altura + (H - G.altura) / 2, s * L, 0);
  }
  // rede do gol
  const rede = textura(128, 128, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 8, 0);
      ctx.lineTo((i * w) / 8, h);
      ctx.moveTo(0, (i * h) / 8);
      ctx.lineTo(w, (i * h) / 8);
      ctx.stroke();
    }
  });
  rede.wrapS = rede.wrapT = THREE.RepeatWrapping;
  const matRede = (rx, ry) => {
    const t = rede.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  };
  // traves com a cor do time que defende, e uma faixa acesa em volta do campo, meio a meio
  TIMES.forEach((time, i) => {
    const s = i === 0 ? -1 : 1;
    const luz = new THREE.MeshBasicMaterial({ color: time.cor, toneMapped: false });
    const zb = s * L;
    const trave = new THREE.BoxGeometry(0.4, G.altura, 0.4);
    for (const t of [-1, 1]) {
      const m = new THREE.Mesh(trave, luz);
      m.position.set(t * G.largura / 2, G.altura / 2, zb);
      g.add(m);
    }
    const travessao = new THREE.Mesh(new THREE.BoxGeometry(G.largura + 0.4, 0.4, 0.4), luz);
    travessao.position.set(0, G.altura, zb);
    g.add(travessao);
    const fundo = new THREE.Mesh(new THREE.PlaneGeometry(G.largura, G.altura), matRede(G.largura / 2, G.altura / 2));
    fundo.position.set(0, G.altura / 2, s * (L + G.fundo));
    const teto = new THREE.Mesh(new THREE.PlaneGeometry(G.largura, G.fundo), matRede(G.largura / 2, G.fundo / 2));
    teto.rotation.x = Math.PI / 2;
    teto.position.set(0, G.altura, s * (L + G.fundo / 2));
    g.add(fundo, teto);
    for (const t of [-1, 1]) {
      const lado = new THREE.Mesh(new THREE.PlaneGeometry(G.fundo, G.altura), matRede(G.fundo / 2, G.altura / 2));
      lado.rotation.y = Math.PI / 2;
      lado.position.set(t * G.largura / 2, G.altura / 2, s * (L + G.fundo / 2));
      g.add(lado);
    }
    // faixa no pé do vidro (metade do campo de cada time) e no alto
    for (const y of [0.25, H]) {
      for (const t of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, L - CAMPO.chanfro), luz);
        f.position.set(t * W, y, s * (L - CAMPO.chanfro) / 2);
        g.add(f);
      }
      const fundoF = new THREE.Mesh(new THREE.BoxGeometry(fundoReto, 0.25, 0.25), luz);
      fundoF.position.set(0, y, zb);
      g.add(fundoF);
    }
  });

  // arquibancadas dos dois lados, por fora do vidro
  const concreto = new THREE.MeshStandardMaterial({ color: 0x8a909c, roughness: 0.9 });
  const assento = TIMES.map((t) => new THREE.MeshStandardMaterial({ color: t.cor, roughness: 0.7 }));
  const DEGRAUS = 6;
  for (const s of [-1, 1]) {
    for (let i = 0; i < DEGRAUS; i++) {
      const prof = ARQ / DEGRAUS;
      const alto = (i + 1) * 0.8;
      const x0 = W + 1.5 + i * prof;
      const comp = CAMPO.comprimento - 6;
      const d = new THREE.Mesh(new THREE.BoxGeometry(prof, alto, comp), concreto);
      d.position.set(s * (x0 + prof / 2), alto / 2, 0);
      d.receiveShadow = true;
      d.castShadow = i === DEGRAUS - 1;
      g.add(d);
      // a fileira de cadeiras: metade azul, metade laranja
      for (const [t, z] of [[0, -comp / 4], [1, comp / 4]]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(prof * 0.5, 0.12, comp / 2 - 1), assento[t]);
        c.position.set(s * (x0 + prof * 0.35), alto + 0.06, z);
        g.add(c);
      }
      parede(s > 0 ? x0 : -(x0 + prof), s > 0 ? x0 + prof : -x0, 0, alto, -comp / 2, comp / 2);
    }
  }
  // quem anda não entra no campo: uma parede em volta de tudo (gol incluído)
  const fim = L + G.fundo;
  for (const s of [-1, 1]) {
    parede(s > 0 ? W : -W - 1, s > 0 ? W + 1 : -W, 0, H, -fim - 1, fim + 1);
    parede(-W - 1, W + 1, 0, H, s > 0 ? fim : -fim - 1, s > 0 ? fim + 1 : -fim);
  }

  // placar, em cima da arquibancada do norte, virado para o campo (e para quem vem do cinema,
  // do outro lado)
  const placar = textura(1024, 320, (ctx, w, h, e) => desenharPlacar(ctx, w, h, e));
  const matPlacar = new THREE.MeshBasicMaterial({ map: placar, toneMapped: false });
  for (const s of [-1, 1]) {
    // costas com costas: uma face para o campo, outra para fora (nenhuma espelhada)
    for (const f of [-1, 1]) {
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(24, 7.5), matPlacar);
      tela.position.set(s * (W + ARQ + 3) + f * 0.05, 14, 0);
      tela.rotation.y = f * Math.PI / 2;
      g.add(tela);
    }
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10.5, 0.6), concreto);
    poste.position.set(s * (W + ARQ + 3.4), 5.25, 0);
    g.add(poste);
  }

  // a faixa da entrada, com a placa
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.12, 40), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.55, toneMapped: false }));
  faixa.position.set(ENTRADA.x, 0.08, ENTRADA.z);
  g.add(faixa);
  const placaEntrada = textura(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = TIMES[0].cor;
    ctx.fillRect(0, h - 16, w / 2, 16);
    ctx.fillStyle = TIMES[1].cor;
    ctx.fillRect(w / 2, h - 16, w / 2, 16);
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "800 92px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText('FUTEBOL DE CARRO', w / 2, h / 2 - 28);
    ctx.font = "600 52px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText('pise no círculo e aperte E', w / 2, h / 2 + 56);
  });
  const quadro = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: placaEntrada, toneMapped: false, side: THREE.DoubleSide }));
  quadro.position.set(ENTRADA.x + 4.5, 4.2, ENTRADA.z);
  quadro.rotation.y = Math.PI / 2;
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 6), concreto);
  haste.position.set(ENTRADA.x + 4.5, 1.6, ENTRADA.z);
  g.add(quadro, haste);

  // placa na porta do cinema (no mundo novo as placas ficam na praça: cidade.js)

  return { grupo: g, placar, faixa };
}

function desenharPlacar(ctx, w, h, e) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = TIMES[0].cor;
  ctx.fillRect(0, 0, w / 2, 14);
  ctx.fillStyle = TIMES[1].cor;
  ctx.fillRect(w / 2, 0, w / 2, 14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fonte = (p) => `800 ${p}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  if (!e) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = fonte(70);
    ctx.fillText('FUTEBOL DE CARRO', w / 2, h / 2 - 30);
    ctx.font = fonte(40);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ninguém jogando — entre pela faixa azul', w / 2, h / 2 + 50);
    return;
  }
  ctx.font = fonte(170);
  ctx.fillStyle = TIMES[0].claro;
  ctx.fillText(String(e.placar[0]), w * 0.2, h / 2 + 20);
  ctx.fillStyle = TIMES[1].claro;
  ctx.fillText(String(e.placar[1]), w * 0.8, h / 2 + 20);
  ctx.fillStyle = '#f8fafc';
  ctx.font = fonte(110);
  ctx.fillText(e.relogio, w / 2, h / 2 + 4);
  ctx.font = fonte(36);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(e.legenda, w / 2, h - 40);
}

const relogio = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ malhas
// Carro do jogador. Quem joga com personagem que se transforma (Optimus, Solus Prime) entra com o
// veículo dele: o carro desenhado aqui aparece só até o modelo carregar (ver vestirVeiculo).
// Em cima de qualquer um vai a luz do time, por baixo.
function malhaCarro(cor, charId = null) {
  const g = new THREE.Group();
  const corpo = desenharCarro(cor);
  g.add(corpo);
  g.userData.corpo = corpo;
  const luz = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }));
  luz.position.y = 0.06;
  g.add(luz);
  // o fogo do turbo, atrás
  const fogo = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 10).rotateX(-Math.PI / 2).translate(0, 0.6, -2.45),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, toneMapped: false }));
  fogo.visible = false;
  g.add(fogo);
  g.userData.fogo = fogo;
  if (PERSONAGENS[charId]?.transforma) vestirVeiculo(g, PERSONAGENS[charId]);
  return g;
}

// O personagem já na pose de veículo (o clipe de transformar até o fim, segurando o último
// quadro), do comprimento do carro, rodas no chão e virado para +z como o carro.
const COMPRIMENTO_VEICULO = 3.9;
async function vestirVeiculo(g, def) {
  let p;
  try {
    p = await criarPersonagem(def);
  } catch {
    return; // não veio: fica o carro desenhado
  }
  if (!p) return;
  if (g.userData.descartado || !p.temTransformacao || !p.transformar(true)) {
    p.dispose();
    return;
  }
  p.mixer.update(0.25); // termina de misturar com a pose de antes
  p.mixer.update(30); // e vai até o fim do clipe (segura o último quadro)
  const m = p.grupo;
  m.updateMatrixWorld(true);
  const caixa = new THREE.Box3();
  const v = new THREE.Vector3();
  m.traverse((o) => {
    const pos = o.isMesh && o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 3) caixa.expandByPoint(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld));
  });
  if (caixa.isEmpty()) {
    p.dispose();
    return;
  }
  const tam = caixa.getSize(new THREE.Vector3());
  const centro = caixa.getCenter(new THREE.Vector3());
  const escala = COMPRIMENTO_VEICULO / Math.max(tam.z, tam.x, 0.01);
  const encaixe = new THREE.Group();
  m.position.set(-centro.x, -caixa.min.y, -centro.z);
  encaixe.add(m);
  encaixe.scale.setScalar(escala);
  // a esfera de recorte do personagem foi feita para o tamanho dele de pé: o veículo cabe nela
  g.add(encaixe);
  g.userData.corpo.visible = false;
  g.userData.personagem = p;
  g.userData.fogo.position.z = 2.45 - (tam.z * escala) / 2 - 0.4; // o fogo sai da traseira dele
}

// tira o carro do campo: o personagem devolve o esqueleto; geometria e material dele são do
// arquivo em cache (dos outros bonecos também) e não podem ser apagados
function descartarCarro(g) {
  if (!g) return;
  g.userData.descartado = true;
  g.removeFromParent();
  const p = g.userData.personagem;
  if (p) {
    p.grupo.parent?.removeFromParent();
    p.dispose();
  }
  g.traverse((m) => { m.geometry?.dispose(); m.material?.map?.dispose(); m.material?.dispose(); });
}

function desenharCarro(cor) {
  const g = new THREE.Group();
  const pintura = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.35, metalness: 0.4 });
  const escuro = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.6 });
  const vidroM = new THREE.MeshStandardMaterial({ color: 0x9cc8ff, roughness: 0.1, metalness: 0.3 });
  const chassi = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 3.3), pintura);
  chassi.position.y = 0.6;
  const bico = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 0.7), pintura);
  bico.position.set(0, 0.45, 1.75);
  const cabine = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), vidroM);
  cabine.position.set(0, 1.05, -0.25);
  const aerofolio = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.45), escuro);
  aerofolio.position.set(0, 1.18, -1.55);
  for (const m of [chassi, bico, cabine, aerofolio]) m.castShadow = true;
  g.add(chassi, bico, cabine, aerofolio);
  for (const t of [-1, 1]) {
    const haste = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), escuro);
    haste.position.set(t * 0.7, 0.98, -1.55);
    g.add(haste);
  }
  const rodaGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14);
  rodaGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.1], [0.95, 1.1], [-0.95, -1.1], [0.95, -1.1]]) {
    const r = new THREE.Mesh(rodaGeo, escuro);
    r.position.set(x, 0.42, z);
    r.castShadow = true;
    g.add(r);
  }
  return g;
}

function placaDeNome(nome, cor) {
  const tex = textura(256, 64, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.beginPath();
    ctx.roundRect(4, 8, w - 8, h - 16, 18);
    ctx.fill();
    ctx.fillStyle = cor;
    ctx.font = "800 30px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nome.slice(0, 16), w / 2, h / 2 + 1);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1);
  s.position.y = 2.4;
  return s;
}

function malhaBola() {
  const tex = textura(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#334155';
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(((i + (j % 2) * 0.5) * w) / 6, ((j + 0.5) * h) / 3, 26, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(BOLA.raio, 32, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, emissive: 0x223344, emissiveIntensity: 0.4 }));
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ a partida no navegador
export class Futebol {
  // opts: world, player, avatarLocal, sfx, toast, estaLigado() (o dono da sala não desligou)
  constructor({ world, player, avatarLocal, sfx, toast, estaLigado }) {
    this.world = world;
    this.player = player;
    this.avatarLocal = avatarLocal;
    this.sfx = sfx;
    this.toast = toast;
    this.estaLigado = estaLigado;
    this.estadio = world.estadio; // ver construirEstadio
    this.g = this.estadio.grupo;
    this.socket = null;
    this.eu = null;
    this.jogando = false;
    this.estado = null; // o último fut-estado (null: ninguém jogando)
    this.faseAte = 0;
    this.tempoBase = 0;
    this.tempoEm = 0;
    this.meuTime = 0;

    this.bola = { p: new THREE.Vector3(0, BOLA.raio, 0), v: new THREE.Vector3() };
    this.malhaBola = malhaBola();
    this.malhaBola.visible = false;
    this.sombraBola = new THREE.Mesh(new THREE.CircleGeometry(BOLA.raio, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.sombraBola.visible = false;
    this.g.add(this.malhaBola, this.sombraBola);
    this.explosao = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.explosao.visible = false;
    this.g.add(this.explosao);
    this.tExplosao = 0;
    this.toqueSeq = 0;
    this.toqueEm = -1e9;

    // o meu carro
    this.carro = {
      p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
      chao: true, segurar: 0, duplo: 0, usou: false, mortal: 0, virando: 0, turbo: 33, turbando: false,
    };
    this.malhaCarro = null;
    this.recarga = 0; // depois de um toque na bola, um tiquinho até o próximo
    this.envio = 0;
    this.puloAntes = false;
    this.mouseTurbo = false;
    this.bolaCam = true;
    this.camDir = new THREE.Vector3(0, 0, 1);
    this.camPronta = false;

    this.outros = new Map(); // id -> { malha, p, q, alvoP, alvoQ, visto, time }

    // almofadas de turbo (de cada um)
    this.almofadas = ALMOFADAS.map((a) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(a.grande ? 1.6 : 1, a.grande ? 1.6 : 1, 0.1, 20),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }));
      base.position.set(a.x, 0.06, a.z);
      const brilho = new THREE.Mesh(a.grande ? new THREE.SphereGeometry(0.75, 16, 10) : new THREE.CylinderGeometry(0.7, 0.7, 0.14, 16),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false }));
      brilho.position.set(a.x, a.grande ? 1.2 : 0.14, a.z);
      this.g.add(base, brilho);
      return { ...a, brilho, volta: 0 };
    });

    this.montarHud();
    this.desenharPlacar(true);
    window.addEventListener('mousedown', (e) => { if (this.jogando && e.button === 0) this.mouseTurbo = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseTurbo = false; });
    window.addEventListener('keydown', (e) => {
      if (!this.jogando || e.repeat) return;
      if (e.code === 'KeyB') this.bolaCam = !this.bolaCam;
    });
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    this.eu = socket.id;
    socket.on('fut-estado', (e) => this.recebeuEstado(e));
    socket.on('fut-bola', (a) => this.recebeuBola(a));
    socket.on('fut-carro', ({ id, c }) => this.recebeuCarro(id, c));
    socket.on('fut-saiu', (id) => this.tirarOutro(id));
  }

  // acabou de entrar na sala: a partida que já está rolando (placar, quem joga)
  verPartida() {
    this.socket?.emit('fut-ver', (e) => this.recebeuEstado(e));
  }

  joga(id) { return !!this.estado?.jogadores.some((j) => j.id === id); }

  // para a voz separada por jogo (main.js)
  partida(id) { return this.joga(id) ? 'futebol' : null; }

  recebeuEstado(e) {
    const antes = this.estado;
    this.estado = e;
    if (!e) {
      for (const id of [...this.outros.keys()]) this.tirarOutro(id);
      this.malhaBola.visible = this.sombraBola.visible = false;
      if (this.jogando) this.sair();
      this.desenharPlacar(true);
      return;
    }
    this.faseAte = performance.now() + e.falta;
    this.tempoBase = e.tempo;
    this.tempoEm = performance.now();
    const eu = e.jogadores.find((j) => j.id === this.eu);
    // saí sem pedir (o dono desligou o jogo, caiu a conexão)
    if (this.jogando && !eu) this.sair(false);
    if (eu) this.meuTime = eu.time;
    // quem saiu da partida some do campo
    for (const id of [...this.outros.keys()]) if (!e.jogadores.some((j) => j.id === id)) this.tirarOutro(id);
    const mudouFase = antes?.fase !== e.fase;
    if (mudouFase && e.fase === 'saida') {
      this.bola.p.set(0, BOLA.raio, 0);
      this.bola.v.set(0, 0, 0);
      if (this.jogando && eu) this.paraSaida(eu.lugar);
    }
    if (mudouFase && e.fase === 'gol') this.comemorar(e.marcou);
    if (mudouFase && e.fase === 'fim' && this.jogando) {
      const [a, b] = e.placar;
      const venceu = a === b ? null : a > b ? 0 : 1;
      this.mensagem(venceu === null ? 'Fim de jogo' : `${TIMES[venceu].nome} venceu!`, venceu === this.meuTime ? 'Boa! Próxima partida já já.' : 'Próxima partida já já.', 6000);
      if (venceu === this.meuTime) this.sfx.finish();
    }
    if (mudouFase && e.fase === 'jogo' && this.jogando) {
      this.mensagem('VAI!', '', 900);
      this.sfx.checkpoint();
    }
    this.desenharPlacar(true);
    this.atualizarHud();
  }

  recebeuBola(a) {
    if (!Array.isArray(a) || this.estado?.fase !== 'jogo') return;
    const [x, y, z, vx, vy, vz, id, seq] = a;
    // acabei de chutar: até o servidor confirmar o meu chute, vale a minha bola
    if (performance.now() - this.toqueEm < 500 && (id !== this.eu || seq < this.toqueSeq)) return;
    const s = { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz) };
    andarBola(s, 0.06); // o recado chega uns 60 ms atrasado
    const erro = s.p.distanceTo(this.bola.p);
    if (erro > 4 || !this.malhaBola.visible) this.bola.p.copy(s.p);
    else this.bola.p.lerp(s.p, 0.3);
    this.bola.v.copy(s.v);
  }

  recebeuCarro(id, c) {
    if (!Array.isArray(c) || c.length !== 8) return;
    let o = this.outros.get(id);
    const jog = this.estado?.jogadores.find((j) => j.id === id);
    if (!o) {
      if (!jog) return;
      const malha = malhaCarro(TIMES[jog.time].cor, jog.char);
      malha.add(placaDeNome(jog.nome, TIMES[jog.time].claro));
      this.g.add(malha);
      o = { malha, alvoP: new THREE.Vector3(c[0], c[1], c[2]), alvoQ: new THREE.Quaternion(c[3], c[4], c[5], c[6]).normalize() };
      malha.position.copy(o.alvoP);
      malha.quaternion.copy(o.alvoQ);
      this.outros.set(id, o);
    }
    o.alvoP.set(c[0], c[1], c[2]);
    o.alvoQ.set(c[3], c[4], c[5], c[6]).normalize();
    o.malha.userData.fogo.visible = !!c[7];
    o.visto = performance.now();
  }

  tirarOutro(id) {
    const o = this.outros.get(id);
    if (!o) return;
    descartarCarro(o.malha);
    this.outros.delete(id);
  }

  // ---------------------------------------------------------------- entrar e sair
  pertoDaEntrada() {
    if (this.jogando || !this.estaLigado()) return false;
    const e = this.g.localToWorld(_a.set(ENTRADA.x, 0, ENTRADA.z));
    const p = this.player.pos;
    return Math.hypot(p.x - e.x, p.z - e.z) < 3.4 && p.y < 2;
  }

  entrar() {
    if (this.jogando || !this.socket) return;
    this.socket.emit('fut-entrar', {}, (r) => {
      if (!r?.ok) {
        this.toast('O futebol de carro está desligado nesta sala.', 'info', 2600);
        return;
      }
      this.jogando = true;
      this.eu = r.eu;
      if (this.player.veiculo) this.player.setVeiculo(false);
      if (this.player.sitting) this.player.stand?.();
      if (document.pointerLockElement === null) this.world.canvas.requestPointerLock?.()?.catch?.(() => {});
      descartarCarro(this.malhaCarro);
      const eu = r.estado.jogadores.find((j) => j.id === this.eu);
      this.meuTime = eu?.time ?? 0;
      this.malhaCarro = malhaCarro(TIMES[this.meuTime].cor, eu?.char);
      this.g.add(this.malhaCarro);
      this.avatarLocal.group.visible = false;
      const mira = document.getElementById('crosshair');
      if (mira) mira.hidden = true;
      this.camPronta = false;
      this.recebeuEstado(r.estado);
      this.paraSaida(eu?.lugar ?? 0);
      this.hud.hidden = false;
      this.ajuda.hidden = false;
      clearTimeout(this.tAjuda);
      this.tAjuda = setTimeout(() => { this.ajuda.hidden = true; }, 12000);
      this.sfx.teleport();
      this.toast(`Você é do time ${TIMES[this.meuTime].nome}. Faça gol no gol ${this.meuTime === 0 ? 'laranja' : 'azul'}!`, 'info', 4000);
    });
  }

  // avisar: false quando o servidor já tirou a gente
  sair(avisar = true) {
    if (!this.jogando) return;
    this.jogando = false;
    if (avisar) this.socket?.emit('fut-sair');
    descartarCarro(this.malhaCarro);
    this.malhaCarro = null;
    this.hud.hidden = true;
    this.ajuda.hidden = true;
    this.msg.hidden = true;
    this.avatarLocal.group.visible = true;
    const mira = document.getElementById('crosshair');
    if (mira) mira.hidden = false;
    // de volta a pé, na faixa da entrada, de frente para o estádio
    const e = this.g.localToWorld(_a.set(ENTRADA.x - 1, 0, ENTRADA.z));
    this.player.teleport([e.x, 0, e.z], 0);
    this.player.vel.set(0, 0, 0);
  }

  paraSaida(lugar) {
    const s = lugarDaSaida(this.meuTime, lugar);
    const c = this.carro;
    c.p.set(s.x, 0, s.z);
    c.v.set(0, 0, 0);
    c.w.set(0, 0, 0);
    c.q.setFromAxisAngle(Y, s.yaw);
    c.chao = true;
    c.mortal = c.virando = c.segurar = c.duplo = 0;
    c.turbo = 33;
    this.camDir.set(0, 0, this.meuTime === 0 ? 1 : -1);
    this.camPronta = false;
    for (const a of this.almofadas) a.volta = 0;
  }

  // ---------------------------------------------------------------- todo quadro, jogando
  // No lugar do player.update: o carro, a bola na minha máquina, a câmera e o envio
  update(dt) {
    if (!this.jogando) return;
    const k = this.player.keys;
    const p = this.player;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (!f && !r) {
      f = p.moveInput.y;
      r = p.moveInput.x;
    }
    if (p.pedal) f = p.pedal;
    const pulo = k.has('Space') || p.jumpHeld || p.jumpBuffer > 0;
    p.jumpBuffer = 0;
    const ent = {
      f, r, pulo,
      apertou: pulo && !this.puloAntes,
      turbo: k.has('ShiftLeft') || k.has('ShiftRight') || p.runInput || p.runLock || this.mouseTurbo,
      rolar: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0),
    };
    this.puloAntes = pulo;
    const n = Math.min(12, Math.ceil(dt * 120));
    for (let i = 0; i < n; i++) {
      this.passoCarro(dt / n, ent);
      ent.apertou = false;
    }
    this.pegarTurbo();
    this.recarga -= dt;
    if (this.estado?.fase === 'jogo') this.encostarNaBola();

    // o "eu" no mundo vai junto com o carro (voz por perto, quem olha de fora, sol)
    const c = this.carro;
    this.g.localToWorld(p.pos.copy(c.p));
    _fr.set(0, 0, 1).applyQuaternion(c.q).transformDirection(this.g.matrixWorld);
    p.bodyYaw = Math.atan2(_fr.x, _fr.z);
    p.vel.set(0, 0, 0);
    this.avatarLocal.group.position.copy(p.pos);

    this.malhaCarro.position.copy(c.p);
    this.malhaCarro.quaternion.copy(c.q);
    this.malhaCarro.userData.fogo.visible = c.turbando;

    this.envio -= dt;
    if (this.envio <= 0 && this.socket) {
      this.envio = 0.05;
      const a = (n) => Math.round(n * 100) / 100;
      const q = (n) => Math.round(n * 1000) / 1000;
      this.socket.volatile.emit('fut-carro', [a(c.p.x), a(c.p.y), a(c.p.z), q(c.q.x), q(c.q.y), q(c.q.z), q(c.q.w), c.turbando ? 1 : 0]);
    }
    this.camera(dt);
    this.atualizarHud();
  }

  passoCarro(dt, ent) {
    const c = this.carro;
    const fase = this.estado?.fase;
    c.turbando = false;
    if (fase === 'saida') {
      c.v.set(0, 0, 0); // contagem: parado no lugar
      return;
    }
    const up = _up.set(0, 1, 0).applyQuaternion(c.q);
    const fr = _fr.set(0, 0, 1).applyQuaternion(c.q);
    const esq = _esq.set(1, 0, 0).applyQuaternion(c.q); // o carro olha para +z: o +x é a esquerda
    const turbo = ent.turbo && c.turbo > 0;

    if (c.virando > 0) {
      // caiu de lado ou de cabeça para baixo: desvira sozinho
      c.virando -= dt;
      const rumo = Math.atan2(fr.x, fr.z);
      c.q.slerp(_q.setFromAxisAngle(Y, rumo), 1 - Math.exp(-dt * 9));
      c.v.multiplyScalar(Math.exp(-dt * 3));
      if (c.virando <= 0) {
        c.q.setFromAxisAngle(Y, rumo);
        c.chao = true;
      }
    } else if (c.chao) {
      const s = c.v.dot(fr);
      let a;
      if (ent.f > 0) a = s < -0.5 ? 30 * ent.f : 16 * ent.f * Math.max(0, 1 - s / TOPO);
      else if (ent.f < 0) a = s > 0.5 ? 30 * ent.f : s > -10 ? 12 * ent.f : 0;
      else a = -Math.sign(s) * Math.min(Math.abs(s) / dt, 5);
      if (turbo) a += TURBO_ACEL;
      c.v.addScaledVector(fr, a * dt);
      // pneu segura: o carro não escorrega de lado
      c.v.addScaledVector(esq, -c.v.dot(esq) * (1 - Math.exp(-dt * 12)));
      const s2 = c.v.dot(fr);
      const taxa = THREE.MathUtils.lerp(3.2, 1.4, Math.min(1, Math.abs(s2) / 30)) * Math.min(1, Math.abs(s2) / 2.5) * Math.sign(s2);
      if (ent.r) c.q.premultiply(_q.setFromAxisAngle(Y, -ent.r * taxa * dt));
      c.v.y = 0;
      if (ent.apertou) {
        c.v.addScaledVector(up, PULO);
        c.chao = false;
        c.segurar = 0.2;
        c.duplo = 1.25;
        c.usou = false;
        this.sfx.jump();
      }
    } else {
      c.v.y -= GRAV * dt;
      if (c.segurar > 0) {
        if (ent.pulo) c.v.addScaledVector(up, PULO_SEGURAR * dt);
        c.segurar = ent.pulo ? c.segurar - dt : 0;
      }
      c.duplo -= dt;
      if (ent.apertou && c.duplo > 0 && !c.usou) {
        c.usou = true;
        if (Math.abs(ent.f) > 0.3 || Math.abs(ent.r) > 0.3) {
          // mortal: um tranco para o lado do direcional e o carro gira junto
          const frH = _a.set(fr.x, 0, fr.z).normalize();
          const dirH = _b.set(-frH.z, 0, frH.x); // a direita, no chão
          const dir = _c.copy(frH).multiplyScalar(ent.f).addScaledVector(dirH, ent.r).normalize();
          c.v.y = Math.max(0, c.v.y) * 0.2;
          c.v.addScaledVector(dir, MORTAL);
          c.w.set(ent.f, 0, ent.r).normalize().multiplyScalar((Math.PI * 2) / MORTAL_S);
          c.mortal = MORTAL_S;
        } else c.v.addScaledVector(up, DUPLO);
        this.sfx.jump();
      }
      if (c.mortal > 0) {
        c.mortal -= dt;
        if (c.mortal <= 0) c.w.multiplyScalar(0.25);
      } else {
        // no ar: W/S empina, A/D gira, Q/E rola
        const ctrl = (eixo, entrada, forca) => {
          if (entrada) c.w[eixo] += entrada * forca * dt;
          else c.w[eixo] *= Math.exp(-dt * 5);
          c.w[eixo] = THREE.MathUtils.clamp(c.w[eixo], -5.5, 5.5);
        };
        ctrl('x', ent.f, 12);
        ctrl('y', -ent.r, 9);
        ctrl('z', ent.rolar, 12);
      }
      if (turbo) c.v.addScaledVector(fr, TURBO_ACEL * dt);
      const ang = c.w.length();
      if (ang > 1e-5) {
        c.q.multiply(_q.setFromAxisAngle(_d.copy(c.w).divideScalar(ang), ang * dt));
        c.q.normalize();
      }
    }
    if (turbo) {
      c.turbo = Math.max(0, c.turbo - TURBO_GASTO * dt);
      c.turbando = true;
    }
    const vel = c.v.length();
    if (vel > MAX) c.v.multiplyScalar(MAX / vel);
    c.p.addScaledVector(c.v, dt);

    // paredes: o carro é uma bola em volta do centro
    const centro = _d.copy(c.p).addScaledVector(_up.set(0, 1, 0).applyQuaternion(c.q), ALTURA_CENTRO);
    const antes = _a.copy(centro);
    colidirCampo(centro, c.v, RAIO_CARRO, 0.3, 0.2, true);
    c.p.add(centro.sub(antes));
    // chão
    if (c.p.y <= 0) {
      c.p.y = 0;
      if (c.v.y < 0) c.v.y = 0;
      if (!c.chao && c.virando <= 0) {
        const cima = _up.set(0, 1, 0).applyQuaternion(c.q).y;
        c.w.set(0, 0, 0);
        c.mortal = 0;
        if (cima > 0.55) {
          const f2 = _fr.set(0, 0, 1).applyQuaternion(c.q);
          c.q.setFromAxisAngle(Y, Math.atan2(f2.x, f2.z));
          c.chao = true;
        } else c.virando = 0.5;
      }
    }
    // outros carros: um empurrão (sem atravessar)
    for (const o of this.outros.values()) {
      const d = _a.copy(c.p).sub(o.malha.position);
      d.y *= 1.5;
      const dist = d.length();
      if (dist > 2.6 || dist < 1e-3) continue;
      d.normalize();
      c.p.addScaledVector(d, 2.6 - dist);
      const vn = c.v.dot(d);
      if (vn < 0) c.v.addScaledVector(d, -vn * 1.4);
      if (c.p.y < 0) c.p.y = 0;
    }
  }

  pegarTurbo() {
    const c = this.carro;
    const agora = performance.now();
    for (const a of this.almofadas) {
      if (a.volta > agora) continue;
      if (c.turbo >= 100 || c.p.y > 2.5 || Math.hypot(c.p.x - a.x, c.p.z - a.z) > (a.grande ? 2.2 : 1.6)) continue;
      c.turbo = a.grande ? 100 : Math.min(100, c.turbo + 12);
      a.volta = agora + (a.grande ? 10000 : 4000);
      if (a.grande) this.sfx.pad();
      else this.sfx.message();
    }
  }

  // o meu carro encostou na bola: o chute é calculado aqui e vai para o servidor
  encostarNaBola() {
    if (this.recarga > 0) return;
    const c = this.carro;
    const b = this.bola;
    const centro = _a.copy(c.p).addScaledVector(_up.set(0, 1, 0).applyQuaternion(c.q), ALTURA_CENTRO);
    _qi.copy(c.q).invert();
    const local = _b.copy(b.p).sub(centro).applyQuaternion(_qi);
    const perto = _c.set(
      THREE.MathUtils.clamp(local.x, -CAIXA.x, CAIXA.x),
      THREE.MathUtils.clamp(local.y, -CAIXA.y, CAIXA.y),
      THREE.MathUtils.clamp(local.z, -CAIXA.z, CAIXA.z),
    );
    const dif = local.sub(perto);
    let dist = dif.length();
    if (dist >= BOLA.raio) return;
    const n = dist > 1e-4 ? dif.divideScalar(dist) : _c.copy(b.p).sub(centro).applyQuaternion(_qi).normalize();
    n.applyQuaternion(c.q); // de volta para o campo
    if (dist <= 1e-4) dist = 0;
    const vr = _d.copy(b.v).sub(c.v);
    const vn = vr.dot(n);
    if (vn < 0) b.v.addScaledVector(n, -1.55 * vn);
    // o "chute": a mais na direção do carro para a bola, achatada (o chute sai mais rasteiro)
    const dir = _up.copy(b.p).sub(centro);
    dir.y *= 0.35;
    dir.normalize();
    const chegada = Math.max(0, -vr.dot(dir));
    b.v.addScaledVector(dir, chegada * 0.45);
    const vel = b.v.length();
    if (vel > BOLA.maxVel) b.v.multiplyScalar(BOLA.maxVel / vel);
    b.p.addScaledVector(n, BOLA.raio - dist + 0.03);
    if (vn < 0) c.v.addScaledVector(n, vn * 0.12);
    this.recarga = 0.06;
    this.toqueSeq++;
    this.toqueEm = performance.now();
    if (chegada > 4 || vn < -4) this.sfx.punchHit();
    const a = (x) => Math.round(x * 100) / 100;
    this.socket?.emit('fut-toque', { p: [a(b.p.x), a(b.p.y), a(b.p.z)], v: [a(b.v.x), a(b.v.y), a(b.v.z)], seq: this.toqueSeq });
  }

  camera(dt) {
    const c = this.carro;
    const b = this.bola;
    const verBola = this.bolaCam && this.malhaBola.visible;
    let dir;
    if (verBola) dir = _a.set(b.p.x - c.p.x, 0, b.p.z - c.p.z);
    else {
      const fr = _fr.set(0, 0, 1).applyQuaternion(c.q);
      dir = _a.set(fr.x, 0, fr.z);
      if (c.chao && c.v.lengthSq() > 4 && c.v.dot(fr) < -1) dir.negate(); // de ré: a câmera não gira
    }
    if (dir.lengthSq() > 0.01) {
      dir.normalize();
      if (!this.camPronta) this.camDir.copy(dir);
      else this.camDir.lerp(dir, 1 - Math.exp(-dt * 6)).normalize();
    }
    const alvo = _b.copy(c.p);
    alvo.y += 1.2;
    const pos = _c.copy(alvo).addScaledVector(this.camDir, -9.5);
    pos.y += 2.6;
    const olhar = _d.copy(alvo);
    if (verBola) {
      olhar.lerp(b.p, 0.5);
      olhar.y = Math.min(olhar.y, alvo.y + 6);
    } else olhar.addScaledVector(this.camDir, 4);
    pos.y = THREE.MathUtils.clamp(pos.y, 1, CAMPO.altura - 1);
    const cam = this.world.camera;
    this.g.localToWorld(pos);
    this.g.localToWorld(olhar);
    if (!this.camPronta) cam.position.copy(pos);
    else cam.position.lerp(pos, 1 - Math.exp(-dt * 14));
    this.camPronta = true;
    cam.lookAt(olhar);
  }

  // ---------------------------------------------------------------- todo quadro, jogando ou não
  animar(dt) {
    const e = this.estado;
    const agora = performance.now();
    const fase = e?.fase;
    // a bola: prevista entre um recado e outro
    if (fase === 'jogo') andarBola(this.bola, dt);
    const verBola = !!e && fase !== 'gol';
    this.malhaBola.visible = this.sombraBola.visible = verBola;
    if (verBola) {
      const m = this.malhaBola;
      // rola de verdade: gira em volta do eixo de lado ao que anda
      const v = this.bola.v;
      const vh = Math.hypot(v.x, v.z);
      if (vh > 0.05) m.rotateOnWorldAxis(_a.set(v.z / vh, 0, -v.x / vh), (vh * dt) / BOLA.raio);
      m.position.copy(this.bola.p);
      this.sombraBola.position.set(this.bola.p.x, 0.05, this.bola.p.z);
      this.sombraBola.material.opacity = 0.4 * Math.max(0.15, 1 - this.bola.p.y / 18);
    }
    // os outros carros, suaves entre um recado e outro (some quem parou de mandar)
    const k = 1 - Math.exp(-dt * 14);
    for (const [id, o] of this.outros) {
      if (agora - o.visto > 4000) {
        this.tirarOutro(id);
        continue;
      }
      if (o.malha.position.distanceToSquared(o.alvoP) > 100) o.malha.position.copy(o.alvoP);
      else o.malha.position.lerp(o.alvoP, k);
      o.malha.quaternion.slerp(o.alvoQ, k);
    }
    // almofadas: o brilho some enquanto ela recarrega
    for (const a of this.almofadas) {
      a.brilho.visible = a.volta <= agora;
      if (a.grande && a.brilho.visible) a.brilho.position.y = 1.2 + Math.sin(agora / 300 + a.x) * 0.15;
    }
    // explosão do gol
    if (this.tExplosao > 0) {
      this.tExplosao -= dt;
      const t = 1 - this.tExplosao / 1.2;
      this.explosao.scale.setScalar(2 + t * 22);
      this.explosao.material.opacity = 0.75 * (1 - t);
      this.explosao.visible = this.tExplosao > 0;
    }
    // o relógio do placar, uma vez por segundo
    this.desenharPlacar();
    if (this.jogando) this.atualizarHud();
  }

  comemorar(marcou) {
    if (!marcou) return;
    this.explosao.material.color.set(TIMES[marcou.time].cor);
    this.explosao.position.copy(this.bola.p);
    this.explosao.visible = true;
    this.tExplosao = 1.2;
    const meu = marcou.time === this.meuTime;
    if (this.jogando) {
      this.mensagem('GOL!', marcou.nome ? `${marcou.nome} marcou para o ${TIMES[marcou.time].nome}` : `Ponto para o ${TIMES[marcou.time].nome}`, 2800, TIMES[marcou.time].claro);
      if (meu) this.sfx.finish();
      else this.sfx.fall();
    }
  }

  // segundos de jogo que faltam, contando entre um recado e outro
  tempoQueFalta() {
    const e = this.estado;
    if (!e) return 0;
    if (e.fase !== 'jogo' || e.prorrogacao) return e.tempo;
    return Math.max(0, this.tempoBase - (performance.now() - this.tempoEm) / 1000);
  }

  legenda() {
    const e = this.estado;
    const n = e.jogadores.length;
    const quem = `${n} ${n === 1 ? 'jogador' : 'jogadores'}`;
    if (e.fase === 'saida') return `saída de bola — ${quem}`;
    if (e.fase === 'gol') return 'GOL!';
    if (e.fase === 'fim') return 'fim de jogo';
    return e.prorrogacao ? `prorrogação: gol de ouro — ${quem}` : quem;
  }

  desenharPlacar(forcar = false) {
    const e = this.estado;
    const chave = e ? `${e.placar.join(':')}|${Math.ceil(this.tempoQueFalta())}|${this.legenda()}` : '-';
    if (!forcar && chave === this.chavePlacar) return;
    this.chavePlacar = chave;
    this.estadio.placar.userData.redesenhar(e ? { placar: e.placar, relogio: e.prorrogacao ? '+' : relogio(Math.ceil(this.tempoQueFalta())), legenda: this.legenda() } : null);
  }

  // ---------------------------------------------------------------- tela (HUD)
  montarHud() {
    const css = document.createElement('style');
    css.textContent = `
#fut-hud { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #f8fafc; }
#fut-hud[hidden], #fut-dica[hidden], #fut-ajuda[hidden], #fut-msg[hidden] { display: none; }
.fut-placar { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: stretch; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.35); font-weight: 800; }
.fut-placar b { display: grid; place-items: center; min-width: 58px; font-size: 30px; padding: 4px 10px; }
.fut-placar .t0 { background: ${TIMES[0].cor}; }
.fut-placar .t1 { background: ${TIMES[1].cor}; }
.fut-placar time { display: grid; place-items: center; min-width: 96px; background: rgba(15,23,42,.88); font-size: 24px; font-variant-numeric: tabular-nums; }
.fut-turbo { position: absolute; right: 26px; bottom: 26px; width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center; align-content: center;
  background: conic-gradient(#fbbf24 calc(var(--t) * 1%), rgba(15,23,42,.6) 0); box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.fut-turbo::before { content: ''; position: absolute; inset: 9px; border-radius: 50%; background: rgba(15,23,42,.9); }
.fut-turbo b, .fut-turbo small { position: relative; }
.fut-turbo b { font-size: 34px; line-height: 1; font-variant-numeric: tabular-nums; }
.fut-turbo small { font-size: 10px; letter-spacing: .12em; color: #fbbf24; }
#fut-msg { position: absolute; top: 28%; left: 0; right: 0; text-align: center; text-shadow: 0 4px 22px rgba(0,0,0,.6); }
#fut-msg b { display: block; font-size: clamp(48px, 9vw, 110px); line-height: 1; }
#fut-msg span { display: block; margin-top: 10px; font-size: 20px; font-weight: 600; }
#fut-ajuda { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: min(760px, calc(100% - 180px)); padding: 10px 16px; border-radius: 12px;
  background: rgba(15,23,42,.82); font-size: 13px; line-height: 1.6; text-align: center; }
#fut-ajuda kbd { display: inline-block; min-width: 20px; padding: 0 5px; border-radius: 5px; background: rgba(255,255,255,.14); font: inherit; font-weight: 700; }
#fut-dica { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 30; padding: 10px 16px; border-radius: 12px; background: rgba(15,23,42,.85);
  color: #f8fafc; font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; }
#fut-dica kbd { padding: 1px 7px; margin-right: 6px; border-radius: 6px; background: #22d3ee; color: #0f172a; font: inherit; font-weight: 800; }`;
    document.head.appendChild(css);
    this.hud = document.createElement('div');
    this.hud.id = 'fut-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `
      <div class="fut-placar"><b class="t0" id="fut-p0">0</b><time id="fut-tempo">5:00</time><b class="t1" id="fut-p1">0</b></div>
      <div class="fut-turbo" id="fut-turbo" style="--t:33"><b>33</b><small>TURBO</small></div>
      <div id="fut-msg" hidden><b></b><span></span></div>
      <div id="fut-ajuda" hidden>${isTouch ? `
        Analógico: acelerar, ré e virar · pulo: pular (de novo no ar: pulo duplo)<br>
        correr ou analógico na borda: turbo (no ar, voa) · o X do canto sai` : `
        <kbd>W</kbd><kbd>S</kbd> acelerar e ré · <kbd>A</kbd><kbd>D</kbd> virar · <kbd>Espaço</kbd> pular (de novo no ar: pulo duplo; com direção: mortal)<br>
        <kbd>Shift</kbd> ou clique: turbo (no ar, voa) · no ar: <kbd>W</kbd><kbd>S</kbd> empinar, <kbd>A</kbd><kbd>D</kbd> girar, <kbd>Q</kbd><kbd>E</kbd> rolar · <kbd>B</kbd> câmera na bola · <kbd>Esc</kbd> sair`}
      </div>`;
    document.body.appendChild(this.hud);
    this.msg = this.hud.querySelector('#fut-msg');
    this.ajuda = this.hud.querySelector('#fut-ajuda');
    this.elTurbo = this.hud.querySelector('#fut-turbo');
    this.dica = document.createElement('div');
    this.dica.id = 'fut-dica';
    this.dica.hidden = true;
    this.dica.innerHTML = '<kbd>E</kbd>Jogar futebol de carro';
    document.body.appendChild(this.dica);
  }

  mensagem(titulo, texto, ms, cor = '#f8fafc') {
    this.msg.querySelector('b').textContent = titulo;
    this.msg.querySelector('b').style.color = cor;
    this.msg.querySelector('span').textContent = texto;
    this.msg.hidden = false;
    clearTimeout(this.tMsg);
    this.tMsg = setTimeout(() => { this.msg.hidden = true; }, ms);
  }

  atualizarHud() {
    const e = this.estado;
    if (!e || !this.jogando) return;
    const t = Math.round(this.carro.turbo);
    if (t !== this.turboAntes) {
      this.turboAntes = t;
      this.elTurbo.style.setProperty('--t', t);
      this.elTurbo.querySelector('b').textContent = t;
    }
    const txt = e.prorrogacao ? `+${relogio(0)}` : relogio(Math.ceil(this.tempoQueFalta()));
    const chave = `${e.placar[0]}|${e.placar[1]}|${txt}`;
    if (chave !== this.hudAntes) {
      this.hudAntes = chave;
      this.hud.querySelector('#fut-p0').textContent = e.placar[0];
      this.hud.querySelector('#fut-p1').textContent = e.placar[1];
      this.hud.querySelector('#fut-tempo').textContent = e.prorrogacao ? 'PRORR.' : txt;
    }
    // contagem da saída de bola
    if (e.fase === 'saida') {
      const s = Math.ceil((this.faseAte - performance.now()) / 1000);
      if (s > 0 && s !== this.contagem) {
        this.contagem = s;
        this.mensagem(String(s), '', 950);
        this.sfx.message();
      }
    } else this.contagem = 0;
  }

  // a dica do E perto da faixa (o main chama a 4 Hz)
  atualizarDica(livre) {
    const mostrar = livre && this.pertoDaEntrada();
    if (this.dica.hidden === mostrar) this.dica.hidden = !mostrar;
  }
}
