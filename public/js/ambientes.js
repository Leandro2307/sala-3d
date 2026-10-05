// Ambientes por setor da empresa: Sala do TI, Sala Comercial e Sala de Reunião.
//
// Cada um troca a plateia de cinema (sofás) pela mobília do setor, na frente da parede de telas
// (z de -34 a -6; o parkour começa em z = 6). É o World que chama, dentro de world.area(): os
// objetos, colisões e assentos criados aqui ligam e desligam juntos (World.setModulo).
//
// Peças repetidas (cadeiras, monitores, racks) são instanciadas: 24 cadeiras são 4 chamadas de
// desenho, não 96. Nenhum ambiente cria luz de verdade — o brilho é material emissivo.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FONTE = "'Plus Jakarta Sans', system-ui, sans-serif";
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ ajudantes
// placa desenhada num canvas; redesenhar(...args) chama desenhar de novo
function quadro(w, h, desenhar) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redesenhar = (...args) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    desenhar(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  redesenhar();
  return { tex, redesenhar };
}

// Uma peça feita de partes, repetida em vários lugares: uma InstancedMesh por parte.
// partes: [{ geo, mat, pos: [x, y, z], sombra }]; lugares: [[x, z, giroY]]
function repetir(scene, partes, lugares) {
  for (const p of partes) {
    const malha = new THREE.InstancedMesh(p.geo, p.mat, lugares.length);
    const local = new THREE.Matrix4().makeTranslation(...p.pos);
    if (p.giro) local.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.giro)));
    lugares.forEach(([x, z, ry = 0], i) => {
      _o.position.set(x, 0, z);
      _o.rotation.set(0, ry, 0);
      _o.updateMatrix();
      _m.multiplyMatrices(_o.matrix, local);
      malha.setMatrixAt(i, _m);
    });
    malha.castShadow = p.sombra !== false;
    malha.receiveShadow = true;
    malha.computeBoundingSphere();
    scene.add(malha);
  }
}

function piso(scene, { w, d, x = 0, z, cor, textura = null }) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: cor, map: textura, roughness: 0.92 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// cadeira: assento, encosto, coluna e base (quem senta olha para -z)
function partesCadeira({ tecido, metal, encosto = 0.75 }) {
  return [
    { geo: new RoundedBoxGeometry(0.62, 0.12, 0.6, 2, 0.05), mat: tecido, pos: [0, 0.55, 0] },
    { geo: new RoundedBoxGeometry(0.6, encosto, 0.09, 2, 0.04), mat: tecido, pos: [0, 0.6 + encosto / 2, 0.29] },
    { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), mat: metal, pos: [0, 0.27, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.3, 0.32, 0.06, 12), mat: metal, pos: [0, 0.04, 0], sombra: false },
  ];
}

// assento em que dá para subir e sentar (tecla C), girado ou não (o colisor é sempre de eixo)
function assentos(world, lugares) {
  for (const [x, z] of lugares) world.addBox({ min: [x - 0.32, 0, z - 0.32], max: [x + 0.32, 0.6, z + 0.32], data: { type: 'sofa' } });
}

// colisão só nos pés de uma peça girada (placa, quadro): dá para passar por baixo do resto
function pes(world, x, z, giro, distancias, alto, meia = 0.3) {
  for (const lx of distancias) {
    const px = x + lx * Math.cos(giro);
    const pz = z - lx * Math.sin(giro);
    world.addBox({ min: [px - meia, 0, pz - meia], max: [px + meia, alto, pz + meia] });
  }
}

function plantas(scene, lugares) {
  const vaso = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.8 });
  const folha = new THREE.MeshStandardMaterial({ color: 0x3f7d4a, roughness: 0.9, flatShading: true });
  repetir(scene, [
    { geo: new THREE.CylinderGeometry(0.55, 0.42, 1.0, 14), mat: vaso, pos: [0, 0.5, 0] },
    { geo: new THREE.IcosahedronGeometry(0.95, 0), mat: folha, pos: [0, 1.75, 0] },
    { geo: new THREE.IcosahedronGeometry(0.7, 0), mat: folha, pos: [0.25, 2.45, -0.1] },
  ], lugares);
}

const dinheiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

// ------------------------------------------------------------------ Sala do TI
// Parede de monitoramento (8 telas, o World cuida delas), três fileiras de bancadas com monitores
// virados para quem senta, dois corredores de racks com luzes piscando e um quadro de status com
// dados de verdade da sala (pessoas, telas no ar, hora).
function salaTI(world) {
  const scene = world.scene;
  const grade = quadro(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#161c27';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#26324a';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  grade.tex.wrapS = grade.tex.wrapT = THREE.RepeatWrapping;
  grade.tex.repeat.set(64 / 1.2, 30 / 1.2); // piso elevado em placas de 1,2 m
  piso(scene, { w: 64, d: 30, z: -20, cor: 0xffffff, textura: grade.tex });

  // bancadas: 3 fileiras × 2 blocos × 4 lugares, viradas para a parede de telas
  const mesa = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.55 });
  const lateral = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
  const neon = new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false });
  const corpoMonitor = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
  const telaMonitor = quadro(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    const cores = ['#38bdf8', '#6ee7c8', '#a78bfa', '#fbbf24', '#f472b6'];
    for (let y = 14; y < h - 8; y += 12) {
      let x = 12 + (y % 3) * 10;
      while (x < w - 30) {
        const len = 12 + ((x * 7 + y * 13) % 46);
        ctx.fillStyle = cores[(x + y) % cores.length];
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x, y, len, 4);
        x += len + 8;
      }
    }
    ctx.globalAlpha = 1;
  });
  const tela = new THREE.MeshBasicMaterial({ map: telaMonitor.tex, toneMapped: false });
  const blocos = [];
  const monitores = [];
  const cadeiras = [];
  for (const z of [-29, -22, -15]) {
    for (const x of [-11, 11]) {
      blocos.push([x, z]);
      for (const dx of [-6, -2, 2, 6]) {
        monitores.push([x + dx - 0.75, z - 0.35, 0.18], [x + dx + 0.75, z - 0.35, -0.18]);
        cadeiras.push([x + dx, z + 1.35]);
      }
      world.addBox({ min: [x - 8, 0, z - 0.7], max: [x + 8, 1.05, z + 0.7], data: { type: 'mesa' } });
    }
  }
  repetir(scene, [
    { geo: new THREE.BoxGeometry(16, 0.08, 1.4), mat: mesa, pos: [0, 1.0, 0] },
    { geo: new THREE.BoxGeometry(16, 0.95, 0.06), mat: lateral, pos: [0, 0.5, -0.66] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.36), mat: lateral, pos: [-7.97, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.95, 1.36), mat: lateral, pos: [7.97, 0.5, 0] },
    { geo: new THREE.BoxGeometry(16, 0.03, 0.03), mat: neon, pos: [0, 1.03, 0.69], sombra: false },
  ], blocos);
  repetir(scene, [
    { geo: new THREE.BoxGeometry(1.35, 0.82, 0.06), mat: corpoMonitor, pos: [0, 1.62, 0] },
    { geo: new THREE.PlaneGeometry(1.25, 0.72), mat: tela, pos: [0, 1.62, 0.035], sombra: false },
    { geo: new THREE.BoxGeometry(0.08, 0.4, 0.08), mat: corpoMonitor, pos: [0, 1.2, -0.05] },
    { geo: new THREE.BoxGeometry(0.45, 0.03, 0.3), mat: corpoMonitor, pos: [0, 1.05, -0.05] },
  ], monitores);
  const tecido = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.35, metalness: 0.6 });
  repetir(scene, partesCadeira({ tecido, metal }), cadeiras);
  assentos(world, cadeiras);

  // racks: dois corredores (frente com frente) do lado esquerdo
  const leds = quadro(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    const cores = ['#22c55e', '#22c55e', '#38bdf8', '#22c55e', '#fbbf24'];
    for (let y = 6; y < h; y += 9) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(4, y - 2, w - 8, 6);
      for (let x = 8; x < w - 8; x += 9) {
        if ((x * 31 + y * 17) % 5 < 2) continue;
        ctx.fillStyle = cores[(x + y) % cores.length];
        ctx.fillRect(x, y, 3, 2);
      }
    }
  });
  leds.tex.wrapT = THREE.RepeatWrapping;
  const racks = [];
  for (let i = 0; i < 6; i++) {
    racks.push([-42, -31 + i * 2.6, Math.PI / 2], [-36, -31 + i * 2.6, -Math.PI / 2]);
  }
  const caixa = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.4 });
  repetir(scene, [
    { geo: new THREE.BoxGeometry(1.0, 2.6, 1.3), mat: caixa, pos: [0, 1.3, 0] },
    { geo: new THREE.PlaneGeometry(0.86, 2.4), mat: new THREE.MeshBasicMaterial({ map: leds.tex, toneMapped: false }), pos: [0, 1.3, 0.66], sombra: false },
  ], racks);
  world.addBox({ min: [-42.7, 0, -31.7], max: [-41.3, 2.6, -16.9] });
  world.addBox({ min: [-36.7, 0, -31.7], max: [-35.3, 2.6, -16.9] });

  // quadro de status (dados de verdade da sala, ver atualizar)
  const status = quadro(1024, 600, (ctx, w, h, info = {}) => {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `800 54px ${FONTE}`;
    ctx.fillText('STATUS DOS SISTEMAS', 48, 100);
    ctx.font = `600 34px ${FONTE}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(info.empresa ? `${info.empresa} · ${info.hora || ''}` : info.hora || '', 48, 150);
    const linhas = [
      ['Pessoas online', `${info.pessoas ?? '–'}`, '#22c55e'],
      ['Telas no ar', `${info.telas ?? 0} de 8`, info.telas >= 8 ? '#fbbf24' : '#22c55e'],
      ['Rede', 'estável', '#22c55e'],
      ['Servidor da sala', 'no ar', '#22c55e'],
    ];
    linhas.forEach(([nome, valor, cor], i) => {
      const y = 240 + i * 88;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(40, y - 56, w - 80, 72);
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(84, y - 20, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 38px ${FONTE}`;
      ctx.fillText(nome, 118, y - 6);
      ctx.textAlign = 'right';
      ctx.font = `800 40px ${FONTE}`;
      ctx.fillText(valor, w - 70, y - 6);
      ctx.textAlign = 'left';
    });
  });
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.86), new THREE.MeshBasicMaterial({ map: status.tex, toneMapped: false }));
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(10.4, 6.26, 0.25), caixa);
  const suporte = new THREE.Group();
  suporte.add(moldura, placa);
  placa.position.z = 0.13;
  for (const sx of [-3.5, 3.5]) {
    const pe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), metal);
    pe.position.set(sx, -4.6, 0);
    suporte.add(pe);
  }
  // na lateral direita: no meio da sala ele tapava a Tela 6 da parede
  suporte.position.set(34, 6.2, -8);
  suporte.rotation.y = -1.1;
  scene.add(suporte);
  pes(world, 34, -8, -1.1, [-3.5, 3.5], 3.1);

  let piscou = 0;
  return {
    atualizar: (info) => status.redesenhar(info),
    update(t) {
      // as luzes dos racks "andam" de vez em quando, como tráfego
      if (t - piscou > 0.35) {
        piscou = t;
        leds.tex.offset.y = Math.floor(t * 3) * 0.037;
      }
    },
  };
}

// ------------------------------------------------------------------ Sala Comercial
// Mesa de reunião comprida com a cabeceira de frente para o telão, placar de metas (preenchido
// pelo dono da sala no painel) e um sino que qualquer um toca quando fecha uma venda.
function salaComercial(world) {
  const scene = world.scene;
  piso(scene, { w: 56, d: 30, z: -20, cor: 0x2b2130 });

  // mesa de reunião (eixo comprido apontando para a parede de telas)
  const madeira = new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.5 });
  const pe = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.6 });
  const tampo = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.14, 16, 3, 0.06), madeira);
  tampo.position.set(0, 1.0, -20);
  tampo.castShadow = true;
  tampo.receiveShadow = true;
  scene.add(tampo);
  repetir(scene, [{ geo: new THREE.BoxGeometry(3.2, 0.93, 0.25), mat: pe, pos: [0, 0.47, 0] }], [[0, -26], [0, -20], [0, -14]]);
  world.addBox({ min: [-2.1, 0, -28], max: [2.1, 1.07, -12], data: { type: 'mesa' } });

  const couro = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.7 });
  const cadeiras = [];
  for (let i = 0; i < 7; i++) {
    const z = -26.6 + i * 2.2;
    cadeiras.push([-3.15, z, -Math.PI / 2], [3.15, z, Math.PI / 2]);
  }
  cadeiras.push([0, -10.6, 0]); // cabeceira, de frente para o telão
  repetir(scene, partesCadeira({ tecido: couro, metal, encosto: 1.0 }), cadeiras);
  assentos(world, cadeiras);

  // placar de metas
  const placar = quadro(1280, 768, (ctx, w, h, dados = { titulo: 'Metas do mês', itens: [] }) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#111827');
    g.addColorStop(1, '#0b0f19');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 64px ${FONTE}`;
    ctx.fillText(dados.titulo || 'Metas do mês', 56, 104);
    const itens = [...(dados.itens || [])].sort((a, b) => (b.meta ? b.valor / b.meta : 0) - (a.meta ? a.valor / a.meta : 0));
    if (!itens.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 38px ${FONTE}`;
      ctx.fillText('O dono da sala preenche o placar no painel “Sala da empresa”.', 56, 200);
      return;
    }
    const linha = Math.min(84, (h - 220) / itens.length);
    itens.forEach((it, i) => {
      const y = 160 + i * linha;
      const pct = it.meta ? Math.min(1, it.valor / it.meta) : 0;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `700 ${Math.round(linha * 0.42)}px ${FONTE}`;
      ctx.fillText(`${i + 1}. ${it.nome}`, 56, y + linha * 0.5);
      const bx = 470;
      const bw = 520;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, y + linha * 0.2, bw, linha * 0.42);
      ctx.fillStyle = pct >= 1 ? '#22c55e' : pct >= 0.7 ? '#fbbf24' : '#38bdf8';
      ctx.fillRect(bx, y + linha * 0.2, bw * pct, linha * 0.42);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `600 ${Math.round(linha * 0.34)}px ${FONTE}`;
      ctx.textAlign = 'right';
      ctx.fillText(it.meta ? `${dinheiro.format(it.valor)} / ${dinheiro.format(it.meta)} · ${Math.round(pct * 100)}%` : dinheiro.format(it.valor), w - 48, y + linha * 0.5);
      ctx.textAlign = 'left';
    });
    const total = itens.reduce((s, it) => s + it.valor, 0);
    const metaTotal = itens.reduce((s, it) => s + it.meta, 0);
    ctx.fillStyle = '#fbbf24';
    ctx.font = `800 40px ${FONTE}`;
    ctx.fillText(metaTotal ? `Time: ${dinheiro.format(total)} de ${dinheiro.format(metaTotal)} (${Math.round((total / metaTotal) * 100)}%)` : `Time: ${dinheiro.format(total)}`, 56, h - 44);
  });
  const quadroPlacar = new THREE.Group();
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(14, 8.4), new THREE.MeshBasicMaterial({ map: placar.tex, toneMapped: false }));
  tela.position.z = 0.16;
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(14.5, 8.9, 0.3), pe);
  quadroPlacar.add(moldura, tela);
  for (const sx of [-5, 5]) {
    const coluna = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), pe);
    coluna.position.set(sx, -6.1, 0);
    quadroPlacar.add(coluna);
  }
  // na lateral direita, virado para a mesa: mais para o meio, ele tapava as telas da parede
  quadroPlacar.position.set(32, 8.2, -12);
  quadroPlacar.rotation.y = -1.0;
  scene.add(quadroPlacar);
  pes(world, 32, -12, -1.0, [-5, 5], 4.2);

  // sino de venda fechada, num pedestal
  const ouro = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.25, metalness: 0.9, emissive: 0x3a2a00 });
  const perfil = [[0, 0], [0.95, 0.02], [0.9, 0.18], [0.7, 0.55], [0.62, 1.05], [0.55, 1.35], [0.3, 1.55], [0, 1.62]].map(([x, y]) => new THREE.Vector2(x, y));
  const sino = new THREE.Mesh(new THREE.LatheGeometry(perfil, 32), ouro);
  sino.castShadow = true;
  const badalo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), ouro);
  badalo.position.y = 0.1;
  const pendurado = new THREE.Group(); // gira em volta do ponto onde está preso
  sino.position.y = -1.62;
  badalo.position.y = -1.5;
  pendurado.add(sino, badalo);
  pendurado.position.y = 4.2;
  const pedestal = new THREE.Group();
  const trave = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 0.2), madeira);
  trave.position.y = 4.3;
  for (const sx of [-1.2, 1.2]) {
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), madeira);
    poste.position.set(sx, 2.2, 0);
    poste.castShadow = true;
    pedestal.add(poste);
  }
  pedestal.add(trave, pendurado);
  pedestal.position.set(-26, 0, -10);
  pedestal.rotation.y = 0.9;
  scene.add(pedestal);
  pes(world, -26, -10, 0.9, [-1.2, 1.2], 4.4, 0.2);

  plantas(scene, [[-22, -33], [22, -33], [-32, -20], [24, -5]]);
  for (const [x, z] of [[-22, -33], [22, -33], [-32, -20], [24, -5]]) world.addBox({ min: [x - 0.55, 0, z - 0.55], max: [x + 0.55, 1.0, z + 0.55] });

  let balanco = 0; // segundos de balanço que faltam
  let antes = 0;
  return {
    placar: (dados) => placar.redesenhar(dados),
    tocarSino() { balanco = 2.4; },
    update(t) {
      const dt = Math.min(0.1, t - antes);
      antes = t;
      if (balanco <= 0) return;
      balanco = Math.max(0, balanco - dt);
      pendurado.rotation.z = Math.sin(t * 9) * 0.45 * (balanco / 2.4);
    },
  };
}

// ------------------------------------------------------------------ Sala de Reunião
// Mesa oval com 12 cadeiras de frente para o centro, piso de madeira, tapete, plantas e luminárias
// pendentes (só brilho, sem luz de verdade). A tela é o telão da parede.
function salaReuniao(world) {
  const scene = world.scene;
  const tabuas = quadro(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6b4a32';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = (y / 32) % 2 ? '#74513a' : '#634430';
      ctx.fillRect(0, y, w, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(((y * 7) % w), y, 2, 30);
    }
  });
  tabuas.tex.wrapS = tabuas.tex.wrapT = THREE.RepeatWrapping;
  tabuas.tex.repeat.set(6, 4);
  piso(scene, { w: 48, d: 30, z: -20, cor: 0xffffff, textura: tabuas.tex });
  const tapete = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 1 }));
  tapete.rotation.x = -Math.PI / 2;
  tapete.scale.set(13, 8, 1);
  tapete.position.set(0, 0.03, -19);
  tapete.receiveShadow = true;
  scene.add(tapete);

  const RX = 8;
  const RZ = 4;
  const madeira = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.35 });
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 48), madeira);
  tampo.scale.set(RX, 1, RZ);
  tampo.position.set(0, 1.0, -19);
  tampo.castShadow = true;
  tampo.receiveShadow = true;
  scene.add(tampo);
  const pe = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.5 });
  repetir(scene, [{ geo: new THREE.CylinderGeometry(0.5, 0.9, 0.95, 20), mat: pe, pos: [0, 0.47, 0] }], [[-4, -19], [4, -19]]);
  // a mesa oval vira três caixas de colisão (o colisor é de eixo, não oval)
  world.addBox({ min: [-RX * 0.95, 0, -19 - RZ * 0.55], max: [RX * 0.95, 1.07, -19 + RZ * 0.55], data: { type: 'mesa' } });
  world.addBox({ min: [-RX * 0.6, 0, -19 - RZ * 0.92], max: [RX * 0.6, 1.07, -19 + RZ * 0.92], data: { type: 'mesa' } });

  const tecido = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.35, metalness: 0.6 });
  const cadeiras = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.cos(a) * (RX + 1.25);
    const z = -19 + Math.sin(a) * (RZ + 1.15);
    // de frente para o centro da mesa (quem senta olha para -z no próprio eixo da cadeira)
    cadeiras.push([x, z, Math.atan2(x, z + 19)]);
  }
  repetir(scene, partesCadeira({ tecido, metal, encosto: 0.85 }), cadeiras);
  assentos(world, cadeiras);

  // luminárias pendentes: fio + disco que brilha
  const fio = new THREE.MeshBasicMaterial({ color: 0x111827 });
  const brilho = new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false });
  const cupula = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  repetir(scene, [
    { geo: new THREE.CylinderGeometry(0.02, 0.02, 4, 4), mat: fio, pos: [0, 8, 0], sombra: false },
    { geo: new THREE.CylinderGeometry(0.35, 1.0, 0.6, 20, 1, true), mat: cupula, pos: [0, 5.75, 0], sombra: false },
    { geo: new THREE.CircleGeometry(0.95, 20), mat: brilho, pos: [0, 5.46, 0], giro: [Math.PI / 2, 0, 0], sombra: false },
  ], [[-5, -19], [0, -19], [5, -19]]);

  plantas(scene, [[-20, -32], [20, -32], [-20, -8], [20, -8]]);
  for (const [x, z] of [[-20, -32], [20, -32], [-20, -8], [20, -8]]) world.addBox({ min: [x - 0.55, 0, z - 0.55], max: [x + 0.55, 1.0, z + 0.55] });
  return {};
}

const CONSTRUTORES = { ti: salaTI, comercial: salaComercial, reuniao: salaReuniao };

// constrói a mobília do setor; devolve { atualizar?, placar?, tocarSino?, update? }
export function construirAmbiente(nome, world) {
  return CONSTRUTORES[nome]?.(world) ?? {};
}
