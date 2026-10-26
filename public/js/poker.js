// Poker Texas Hold'em nas duas mesas redondas do corredor do meio do salão de jogos, com a cara do
// PokerStars. As fichas são as moedas de verdade: o blind e cada aposta saem do saldo, o pote volta
// para quem ganha. E perto da mesa senta na cadeira livre mais perto (ou na de um robô fora da mão);
// a câmera fica atrás da cadeira e o mouse solto. Por cima do 3D:
//   - o painel do pote à esquerda (pote, blinds, a fase e o último lance);
//   - a plaquinha de cada lugar flutuando em cima da cadeira (nome, fichas, aposta, D do botão, a vez
//     com o tempo correndo, FOLD/ALL-IN e, no showdown, as cartas e o nome da mão);
//   - embaixo, as minhas duas cartas com o nome do jogo que elas fazem e os botões: Desistir,
//     Passar/Pagar, Aumentar (barra e os atalhos ½ pote e pote) e All-in.
// No 3D: cada aposta é uma pilha de fichas que VOA da cadeira até a frente do jogador num arco; quando
// a rodada fecha, as apostas deslizam para o pote, e no fim da mão o pote vai para quem ganhou.
// Clicar numa ficha da mesa arruma o pote em torres (as fichas de cada um, uma encaixada na outra);
// clicar de novo espalha. Isso vale para todo mundo que olha a mesa ('pk-empilhar').
// O servidor (poker-servidor.js) conduz tudo; o nome das mãos vem de poker-regras.js.
import * as THREE from 'three';
import { avaliarMao, LETRA, SIMBOLO, BLINDS, BIGS_MINIMO } from './poker-regras.js';
import { MESAS_POKER } from './parque-dados.js';
import { hud, texturaViva } from './hud-jogos.js';
import { Avatar } from './avatars.js';

const LUGARES = 6;
// a mesa oval do PokerStars (um "estádio": as laterais retas e as pontas redondas), no comprimento do
// eixo x. A_MESA e B_MESA: meio comprimento e meia largura até a borda de couro por fora; BORDA: a
// meia largura do pano que aparece (até onde começa o couro)
const A_MESA = 2.25;
const B_MESA = 1.3;
const RETA = A_MESA - B_MESA; // meio comprimento da parte reta das laterais
const BORDA = B_MESA - 0.21;
const FORA = 0.68; // da beira do pano até o meio do banco
const ASSENTO_X = 0.9; // os dois lugares de cada lateral, a esta distância do meio
const Y_MESA = 0.85;
// até o estado do servidor chegar: o blind padrão e o mínimo para sentar com ele
const [SMALL, BIG] = BLINDS[0];
const MINIMO_MESA = BIG * BIGS_MINIMO;
const FONTE = "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif";
const fonte = (p, peso = 800) => `${peso} ${p}px ${FONTE}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerp = (a, b, k) => a + (b - a) * k;
const saida = (k) => 1 - (1 - k) ** 3;
const COR_ROBO = ['#94a3b8', '#a3e635', '#f472b6', '#fbbf24', '#22d3ee', '#c084fc'];
const FASE = { espera: 'Esperando', 'pre-flop': 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
const emJogoAgora = (e) => e.fase !== 'espera' && e.fase !== 'showdown';
const OUVE_ATE = 18; // metros: de mais longe, as fichas caindo não se ouvem

// as fichas, do maior valor para o menor (as cores de cassino: 1 branca, 5 vermelha, 25 verde,
// 100 preta, 500 roxa)
const DENOM = [
  { v: 500, cor: '#6d28d9', listra: '#f5d0fe', texto: '#fff' },
  { v: 100, cor: '#111827', listra: '#fbbf24', texto: '#fbbf24' },
  { v: 25, cor: '#15803d', listra: '#f8fafc', texto: '#fff' },
  { v: 5, cor: '#dc2626', listra: '#f8fafc', texto: '#fff' },
  { v: 1, cor: '#f1f5f9', listra: '#2563eb', texto: '#1e3a8a' },
];
const R_FICHA = 0.075;
const H_FICHA = 0.022;
// o valor em fichas: as maiores primeiro
function fichasDe(valor) {
  const lista = [];
  let resto = Math.max(0, Math.floor(valor));
  for (const d of DENOM) {
    while (resto >= d.v && lista.length < 60) {
      lista.push(d.v);
      resto -= d.v;
    }
  }
  return lista;
}
// um número que parece aleatório mas é sempre o mesmo para o mesmo i (o pote espalhado não "pula")
const sorteio = (i, s = 1) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// onde fica cada cadeira: dois lugares na lateral norte (0 e 1, de oeste para leste), um na ponta
// leste (2), dois na lateral sul (3 e 4, de leste para oeste) e um na ponta oeste (5). px/pz: o
// ponto da beira do pano na frente dela; ux/uz: a direção para fora da mesa, ali
const ASSENTOS = [[-ASSENTO_X, -1], [ASSENTO_X, -1], ['ponta', 1], [ASSENTO_X, 1], [-ASSENTO_X, 1], ['ponta', -1]];
export function cadeira(m, k) {
  const [x, lado] = ASSENTOS[k];
  const ponta = x === 'ponta';
  const ux = ponta ? lado : 0;
  const uz = ponta ? 0 : lado;
  const px = m.x + (ponta ? lado * (RETA + BORDA) : x);
  const pz = m.z + (ponta ? 0 : lado * BORDA);
  return { x: px + ux * FORA, z: pz + uz * FORA, px, pz, ux, uz };
}
// um ponto do pano na frente da cadeira k, dentro metros para dentro da beira, deslocado de lado
function naMesa(m, k, dentro, lado = 0) {
  const c = cadeira(m, k);
  return { x: c.px - c.ux * dentro - c.uz * lado, z: c.pz - c.uz * dentro + c.ux * lado, ry: Math.atan2(c.ux, c.uz) };
}
// a distância de um ponto até a mesa (0 em cima dela): a reta do meio com as pontas redondas
const distMesa = (m, p) => Math.max(0, Math.hypot(Math.max(0, Math.abs(p.x - m.x) - RETA), p.z - m.z) - B_MESA);
// o contorno do estádio (no plano xy da Shape; deitado depois com rotateX)
function estadio(a, b) {
  const reta = a - b;
  const s = new THREE.Shape();
  s.moveTo(-reta, -b);
  s.lineTo(reta, -b);
  s.absarc(reta, 0, b, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-reta, b);
  s.absarc(-reta, 0, b, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

// ------------------------------------------------------------------ texturas (com cache)
const _tex = new Map();
const _url = new Map();
const CW = 192;
const CH = 268;
// as cartas são desenhadas no dobro do tamanho e com o filtro anisotrópico no máximo da placa: deitadas
// na mesa e vistas de lado, sem isso o mipmap borra os números
const NITIDEZ = 2;
let ANISO = 8;
const afiar = (tex) => {
  tex.anisotropy = ANISO;
  tex.needsUpdate = true;
  return tex;
};
const chaveCarta = (c) => (c === 'verso' ? 'verso' : `${c.n}${c.s}`);
const vermelha = (s) => s === 'c' || s === 'o';
function desenharCarta(ctx, w, h, c) {
  const r = 18;
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, h - 6, r);
  if (c === 'verso') {
    ctx.fillStyle = '#9f1239';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    // a trama do verso
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, h - 32, 10);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 3;
    for (let x = -h; x < w + h; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, h - 32, 10);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = fonte(70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', w / 2, h / 2 + 4);
    return;
  }
  ctx.fillStyle = '#fdfdfb';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  const cor = vermelha(c.s) ? '#d61f3a' : '#111827';
  const valor = String(LETRA[c.n] || c.n);
  const naipe = SIMBOLO[c.s];
  ctx.fillStyle = cor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // o canto (e o mesmo canto de ponta-cabeça)
  for (const giro of [0, Math.PI]) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(giro);
    ctx.translate(-w / 2, -h / 2);
    ctx.font = fonte(valor.length > 1 ? 50 : 58);
    ctx.fillText(valor, 38, 64);
    ctx.font = fonte(40, 400);
    ctx.fillText(naipe, 38, 104);
    ctx.restore();
  }
  ctx.font = fonte(120, 400);
  ctx.textBaseline = 'middle';
  ctx.fillText(naipe, w / 2 + 8, h / 2 + 8);
}
function texturaCarta(c) {
  const k = chaveCarta(c);
  if (!_tex.has(k)) {
    _tex.set(k, afiar(texturaViva(THREE, CW * NITIDEZ, CH * NITIDEZ, (ctx, w, h) => {
      ctx.save();
      ctx.scale(NITIDEZ, NITIDEZ);
      desenharCarta(ctx, w / NITIDEZ, h / NITIDEZ, c);
      ctx.restore();
    })));
  }
  return _tex.get(k);
}
const urlCarta = (c) => {
  const k = chaveCarta(c);
  if (!_url.has(k)) _url.set(k, texturaCarta(c).image.toDataURL());
  return _url.get(k);
};
if (typeof document !== 'undefined' && document.fonts?.load) {
  document.fonts.load(fonte(40)).then(() => {
    for (const t of _tex.values()) t.userData.redesenhar();
    _url.clear();
  }).catch(() => {});
}

// a ficha: em cima, o anel listrado e o valor; do lado, as listras da borda
let _matFicha = null;
function materiaisFicha() {
  if (_matFicha) return _matFicha;
  _matFicha = new Map();
  for (const d of DENOM) {
    const lado = texturaViva(THREE, 256, 16, (ctx, w, h) => {
      ctx.fillStyle = d.cor;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = d.listra;
      for (let i = 0; i < 8; i++) ctx.fillRect(i * 32 + 6, 0, 14, h);
    });
    const topo = texturaViva(THREE, 128, 128, (ctx, w, h) => {
      const c = w / 2;
      ctx.fillStyle = d.cor;
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      // as listras da borda (o "tracejado" das fichas do PokerStars)
      ctx.strokeStyle = d.listra;
      ctx.lineWidth = 14;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(c, c, c - 9, a, a + 0.32);
        ctx.stroke();
      }
      // o miolo com o valor
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath();
      ctx.arc(c, c, c - 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = d.listra;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(c, c, c - 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = d.texto;
      ctx.font = fonte(d.v >= 100 ? 34 : 40, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.v), c, c + 2);
    });
    const ladoM = new THREE.MeshStandardMaterial({ map: afiar(lado), roughness: 0.45 });
    const topoM = new THREE.MeshStandardMaterial({ map: afiar(topo), roughness: 0.4 });
    _matFicha.set(d.v, [ladoM, topoM, topoM]);
  }
  return _matFicha;
}
let _geoFicha = null;
const geoFicha = () => (_geoFicha ||= new THREE.CylinderGeometry(R_FICHA, R_FICHA, H_FICHA, 28));

// ------------------------------------------------------------------ a mesa no mundo
export function construirPoker(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.5 });
  const couro = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.55 });
  const feltro = new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 0.95, emissive: 0x06301d, emissiveIntensity: 0.45 });
  ANISO = world.renderer?.capabilities?.getMaxAnisotropy?.() || ANISO;
  const geoCarta = new THREE.PlaneGeometry(0.24, 0.335).rotateX(-Math.PI / 2);
  const mesas = MESAS_POKER.map((m) => {
    // o tampo de madeira, a borda de couro acolchoada em volta e o pano por dentro
    const tampo = new THREE.Mesh(new THREE.ExtrudeGeometry(estadio(A_MESA - 0.04, B_MESA - 0.04), { depth: 0.1, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2), madeira);
    tampo.position.set(m.x, Y_MESA - 0.1, m.z);
    const contorno = estadio(A_MESA - 0.05, B_MESA - 0.05);
    contorno.holes.push(estadio(A_MESA - 0.17, B_MESA - 0.17));
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(contorno, {
      depth: 0.03, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 5, curveSegments: 32,
    }).rotateX(-Math.PI / 2), couro);
    rail.position.set(m.x, Y_MESA + 0.01, m.z);
    const pano = new THREE.Mesh(new THREE.ShapeGeometry(estadio(A_MESA - 0.12, B_MESA - 0.12), 32).rotateX(-Math.PI / 2), feltro);
    pano.position.set(m.x, Y_MESA + 0.002, m.z);
    // a linha das apostas pintada no pano (um estádio menor) e o nome no meio
    const W = 1024;
    const H = Math.round((W * B_MESA) / A_MESA);
    const desenho = texturaViva(THREE, W, H, (ctx, w, h) => {
      const px = w / (2 * A_MESA); // pixels por metro
      const b = (BORDA - 0.4) * px;
      const reta = RETA * px;
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w / 2 - reta, h / 2 - b);
      ctx.lineTo(w / 2 + reta, h / 2 - b);
      ctx.arc(w / 2 + reta, h / 2, b, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(w / 2 - reta, h / 2 + b);
      ctx.arc(w / 2 - reta, h / 2, b, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.font = fonte(64, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♠ POKER ♥', w / 2, h / 2 + b * 0.62);
      ctx.fillText('♣ POKER ♦', w / 2, h / 2 - b * 0.62);
    });
    const linha = new THREE.Mesh(new THREE.PlaneGeometry(A_MESA * 2, B_MESA * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: afiar(desenho), transparent: true, depthWrite: false, toneMapped: false }));
    linha.position.set(m.x, Y_MESA + 0.004, m.z);
    // dois pés, um debaixo de cada ponta da parte reta
    const pes = [-1, 1].map((lado) => {
      const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.4, Y_MESA - 0.1, 16), madeira);
      pe.position.set(m.x + lado * RETA * 0.7, (Y_MESA - 0.1) / 2, m.z);
      pe.castShadow = true;
      return pe;
    });
    tampo.castShadow = rail.castShadow = true;
    tampo.receiveShadow = pano.receiveShadow = true;
    g.add(tampo, rail, pano, linha, ...pes);
    world.addBox({ min: [m.x - A_MESA + 0.3, 0, m.z - B_MESA + 0.1], max: [m.x + A_MESA - 0.3, Y_MESA, m.z + B_MESA - 0.1] });
    for (let k = 0; k < LUGARES; k++) {
      const c = cadeira(m, k);
      const banco = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 16), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.7 }));
      banco.position.set(c.x, 0.225, c.z);
      banco.castShadow = true;
      g.add(banco);
    }
    // o nome pendurado em cima
    const nome = texturaViva(THREE, 384, 96, (ctx, w, h) => {
      ctx.fillStyle = '#0b1f17';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, h - 8, w, 8);
      ctx.fillStyle = '#f0fdf4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fonte(54, 900);
      ctx.fillText("♠ POKER ♦", w / 2, h / 2 - 2);
    });
    const face = new THREE.MeshBasicMaterial({ map: nome, toneMapped: false });
    const placa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), [madeira, madeira, madeira, madeira, face, face]);
    placa.position.set(m.x, 3.1, m.z);
    g.add(placa);
    // as cartas: 5 comunitárias e 2 por lugar
    const cartas = [];
    for (let i = 0; i < 5 + LUGARES * 2; i++) {
      const c = new THREE.Mesh(geoCarta, new THREE.MeshBasicMaterial({ map: texturaCarta('verso'), toneMapped: false, side: THREE.DoubleSide }));
      c.rotation.order = 'YXZ';
      c.visible = false;
      c.userData = { chave: '', face: '', alvo: { x: m.x, y: Y_MESA, z: m.z, ry: 0 }, voo: null, vira: 1, some: false };
      g.add(c);
      cartas.push(c);
    }
    // o botão do dealer
    const tDealer = texturaViva(THREE, 128, 128, (ctx, w) => {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = fonte(76, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D', w / 2, w / 2 + 4);
    });
    const branco = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
    const topoD = new THREE.MeshStandardMaterial({ map: tDealer, roughness: 0.4 });
    const dealer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 28), [branco, topoD, topoD]);
    dealer.visible = false;
    dealer.castShadow = true;
    g.add(dealer);
    // o anel da vez, na frente de quem tem que jogar
    const anel = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.27, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
    );
    anel.visible = false;
    g.add(anel);
    return { grupo: g, cartas, dealer, anel, fichas: [] };
  });
  return { grupo: g, mesas };
}

// ------------------------------------------------------------------ o jogo no navegador
// ------------------------------------------------------------------ tutorial e cola
// cartas de exemplo: [valor, naipe] (p ♣, c ♥, o ♦, e ♠); usa: as posições que formam o jogo (as
// outras ficam apagadas)
const exemplo = (lista, usa) => `<div class="ex">${lista.map(([n, s], j) => `<img src="${urlCarta({ n, s })}" alt="${esc((LETRA[n] || n) + SIMBOLO[s])}"${usa && !usa.includes(j) ? ' class="fora"' : ''}>`).join('')}</div>`;
// os passos do tutorial: [título, () => html] (montado só quando abre: as cartas viram textura)
const PASSOS = [
  ['O objetivo', () => `<p>Cada um recebe <b>2 cartas fechadas</b> (só você vê as suas). No meio da mesa abrem <b>5 cartas comunitárias</b>, que valem para todo mundo.</p>
    <p>Você monta a <b>melhor mão de 5 cartas</b> misturando as suas 2 com as 5 da mesa. Ganha o <b>pote</b> quem tiver a melhor mão no fim, ou quem sobrar quando todos os outros desistirem.</p>
    <p>As fichas são as suas <b>moedas de verdade</b>: o que você aposta sai do saldo e o pote vai para quem ganha.</p>`],
  ['Blinds e o botão D', (e) => `<p>Antes das cartas, os dois jogadores à esquerda do botão <b>D</b> (o "dealer") pagam apostas obrigatórias: o <b>small blind</b> (${e?.small ?? SMALL}) e o <b>big blind</b> (${e?.big ?? BIG}). É isso que faz ter sempre algo em jogo no pote.</p>
    <p>A cada mão o <b>D</b> anda um lugar, então todo mundo paga os blinds na sua vez.</p>
    <p>O <b>dono da mesa</b> 👑 (quem sentou primeiro) escolhe o valor dos blinds no painel do pote. Para sentar você precisa ter pelo menos ${BIGS_MINIMO} big blinds em moedas (<b>${e?.minimoMesa ?? MINIMO_MESA} moedas</b> agora: o mínimo da mesa).</p>
    <p>Clique em <b>Começar</b> para dar as cartas: os robôs completam a mesa se faltar gente.</p>`],
  ['As rodadas', () => `<ul>
      <li><b>Pré-flop</b>: você recebe as suas 2 cartas e todos apostam.</li>
      <li><b>Flop</b>: abrem 3 cartas na mesa. Nova rodada de apostas.</li>
      <li><b>Turn</b>: abre a 4ª carta. Apostas.</li>
      <li><b>River</b>: abre a 5ª e última. A última rodada de apostas.</li>
      <li><b>Showdown</b>: quem continua mostra as cartas e a melhor mão leva o pote.</li>
    </ul>
    <p>Exemplo: com A♠ K♠ na mão e esta mesa, você fecha um <b>flush</b> de espadas (5 cartas de ♠):</p>
    ${exemplo([[14, 'e'], [13, 'e'], [9, 'e'], [4, 'e'], [2, 'c'], [7, 'e'], [12, 'o']], [0, 1, 2, 3, 5])}`],
  ['Na sua vez', () => `<ul>
      <li><b>Desistir</b> (fold): larga a mão e perde o que já apostou nela.</li>
      <li><b>Passar</b> (check): quando ninguém apostou na rodada, segue sem pagar nada.</li>
      <li><b>Pagar</b> (call): iguala a maior aposta da rodada para continuar.</li>
      <li><b>Aumentar</b> (raise): coloca mais. Use a barra ou os atalhos <b>Mín</b>, <b>½ pote</b> e <b>Pote</b>.</li>
      <li><b>All-in</b>: aposta todas as suas fichas de uma vez.</li>
    </ul>
    <p>A plaquinha de cada oponente mostra quanto ele <b>apostou</b> nesta rodada e quanto já pôs <b>na mão</b>.</p>
    <p>A vez tem tempo: a barrinha amarela na plaquinha de quem joga mostra quanto resta.</p>`],
  ['Dicas', () => `<ul>
      <li>Embaixo das suas cartas aparece o <b>nome do jogo</b> que você está fazendo agora.</li>
      <li>Na dúvida de qual mão ganha, abra a <b>🃏 Cola</b>: ela lista todas, da melhor para a pior, e marca a sua.</li>
      <li>Mão fraca e aposta alta? Desistir cedo custa menos.</li>
      <li>Clique nas fichas da mesa para empilhar ou espalhar o pote.</li>
      <li><b>Esc</b> ou <b>Levantar</b> sai da mesa.</li>
    </ul>`],
];
// as mãos, da melhor para a pior. forca: a de avaliarMao (9 = royal: o straight flush que vai até o Ás)
const COLA = [
  { forca: 9, nome: 'Royal flush', txt: 'A sequência mais alta (10 J Q K A), toda do mesmo naipe. Imbatível.', ex: [[14, 'c'], [13, 'c'], [12, 'c'], [11, 'c'], [10, 'c']] },
  { forca: 8, nome: 'Straight flush', txt: '5 cartas em sequência, todas do mesmo naipe.', ex: [[9, 'e'], [8, 'e'], [7, 'e'], [6, 'e'], [5, 'e']] },
  { forca: 7, nome: 'Quadra', txt: '4 cartas do mesmo valor.', ex: [[13, 'p'], [13, 'c'], [13, 'o'], [13, 'e'], [4, 'c']], usa: [0, 1, 2, 3] },
  { forca: 6, nome: 'Full house', txt: 'Uma trinca e um par juntos.', ex: [[10, 'e'], [10, 'c'], [10, 'o'], [6, 'p'], [6, 'e']] },
  { forca: 5, nome: 'Flush', txt: '5 cartas do mesmo naipe, em qualquer ordem.', ex: [[14, 'o'], [11, 'o'], [8, 'o'], [5, 'o'], [3, 'o']] },
  { forca: 4, nome: 'Sequência', txt: '5 valores seguidos, de naipes misturados. O Ás vale alto (10 a A) ou baixo (A a 5).', ex: [[10, 'p'], [9, 'c'], [8, 'e'], [7, 'o'], [6, 'p']] },
  { forca: 3, nome: 'Trinca', txt: '3 cartas do mesmo valor.', ex: [[7, 'p'], [7, 'c'], [7, 'e'], [13, 'o'], [2, 'p']], usa: [0, 1, 2] },
  { forca: 2, nome: 'Dois pares', txt: 'Dois pares de valores diferentes.', ex: [[12, 'c'], [12, 'e'], [5, 'p'], [5, 'o'], [9, 'c']], usa: [0, 1, 2, 3] },
  { forca: 1, nome: 'Par', txt: '2 cartas do mesmo valor.', ex: [[11, 'p'], [11, 'o'], [14, 'e'], [8, 'c'], [3, 'p']], usa: [0, 1] },
  { forca: 0, nome: 'Carta alta', txt: 'Nada disso? Vale a sua carta mais alta.', ex: [[14, 'e'], [12, 'o'], [9, 'p'], [6, 'c'], [2, 'e']], usa: [0] },
];

export class Poker {
  // opts: world, player, sfx, ligado(), focar() (main.js: solta o mouse, sem andar), soltarFoco()
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'poker';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.poker3d;
    // por mesa: o estado do servidor, a minha mão, o meu lugar, os robôs e as fichas que estão na mesa
    this.mesas = MESAS_POKER.map((m, i) => ({ i, m, e: null, mao: [], lugar: -1, robos: [], fichas: [], empilhado: false, recebidoEm: 0 }));
    this.ativa = null; // a mesa em que estou sentado (com o painel aberto)
    this.somEm = 0;
    this.ray = new THREE.Raycaster();
    this.montarHud();
    // clique no 3D: numa ficha da mesa, empilha (ou espalha) o pote
    const canvas = this.world.canvas;
    canvas.addEventListener('pointerdown', (ev) => this.cliqueNo3d(ev));
    canvas.addEventListener('pointermove', (ev) => this.passarNo3d(ev));
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('pk-mesa', (e) => this.estado(e));
    socket.on('pk-mao', ({ mesa, lugar, mao }) => {
      const M = this.mesas[mesa];
      if (!M) return;
      M.mao = mao || [];
      M.lugar = lugar;
      this.mostrarCartas(M);
      if (this.ativa === M) this.desenhar();
    });
    socket.on('pk-empilhar', ({ mesa, empilhado, por }) => {
      const M = this.mesas[mesa];
      if (!M || M.empilhado === empilhado) return;
      M.empilhado = empilhado;
      this.arrumarPote(M, true);
      if (this.ativa === M) hud.mensagem(empilhado ? 'Pote empilhado' : 'Pote espalhado', por ? `por ${por}` : '', 1100);
    });
    socket.on('pk-sem-moedas', ({ mesa }) => {
      if (this.ativa === this.mesas[mesa]) hud.mensagem('Sem fichas', 'Suas moedas acabaram: você saiu da mesa', 3000, '#fca5a5');
    });
  }

  ver() {
    this.socket?.emit('pk-ver', (lista) => lista?.forEach((e) => this.estado(e)));
  }

  estado(e) {
    const M = this.mesas[e.mesa];
    if (!M) return;
    const antes = M.e;
    M.e = e;
    M.recebidoEm = performance.now();
    if (e.empilhado !== undefined && e.empilhado !== M.empilhado && (!antes || antes.mao !== e.mao)) M.empilhado = e.empilhado;
    const meu = e.lugares.findIndex((l) => l?.id === this.eu);
    if (meu < 0) {
      M.mao = [];
      M.lugar = -1;
      if (this.ativa === M) this.soltarFoco?.();
    } else M.lugar = meu;
    // mão nova: as cartas da mão anterior saem de cena (as minhas chegam por 'pk-mao')
    if (antes && antes.mao !== e.mao) M.mao = M.mao.length && e.fase === 'pre-flop' && meu >= 0 ? M.mao : [];
    this.sincronizarRobos(M);
    this.sincronizarFichas(M, e, antes);
    this.mostrarCartas(M);
    if (this.ativa !== M) return;
    this.desenhar();
    const minhaVez = e.lugares[M.lugar]?.vez;
    if (minhaVez && !antes?.lugares[M.lugar]?.vez) {
      this.sfx.message();
      this.$('.pk-acoes').classList.remove('pulo');
      void this.$('.pk-acoes').offsetWidth;
      this.$('.pk-acoes').classList.add('pulo');
    }
    if (e.fase === 'showdown' && antes?.fase !== 'showdown' && e.resultado?.vencedores?.length) {
      const ganhei = e.resultado.vencedores.some((v) => v.lugar === M.lugar);
      if (ganhei) this.sfx.finish?.();
    }
    if (e.fase !== antes?.fase && ['flop', 'turn', 'river'].includes(e.fase)) this.sfx.cartaVoa?.();
  }

  // os robôs sentados nas cadeiras deles (bonecos de verdade, com nome)
  sincronizarRobos(M) {
    const lugares = M.e?.lugares || [];
    for (let k = 0; k < LUGARES; k++) {
      const quer = lugares[k]?.robo ? lugares[k].nome : null;
      const r = M.robos[k];
      if (r && r.nome !== quer) {
        r.av.dispose();
        M.robos[k] = null;
      }
      if (!quer || M.robos[k]) continue;
      const av = new Avatar({ name: quer, color: COR_ROBO[k % COR_ROBO.length] });
      const c = cadeira(M.m, k);
      av.setNetworkState([c.x, 0.45, c.z], Math.atan2(-c.ux, -c.uz), 4);
      this.world.scene.add(av.group);
      M.robos[k] = { nome: quer, av };
    }
  }

  // ---------------------------------------------------------------- a geometria da mesa
  // o lado de quem olha: sentado, a minha cadeira; de fora, o lugar 0 (as comunitárias ficam viradas
  // para lá e o pote do outro lado)
  olhando(M) {
    return this.ativa === M && M.lugar >= 0 ? M.lugar : 0;
  }
  centroDoPote(M) {
    const o = cadeira(M.m, this.olhando(M));
    return { x: M.m.x - o.ux * 0.44, z: M.m.z - o.uz * 0.44 };
  }

  // ---------------------------------------------------------------- as fichas
  novaFicha(M, v, dono) {
    const g = this.g3d.mesas[M.i];
    const mats = materiaisFicha();
    let mesh = g.fichas.find((f) => !f.visible && !f.userData.emUso);
    if (!mesh) {
      mesh = new THREE.Mesh(geoFicha(), mats.get(v));
      mesh.rotation.order = 'YXZ';
      mesh.castShadow = true;
      g.grupo.add(mesh);
      g.fichas.push(mesh);
    }
    mesh.material = mats.get(v);
    mesh.visible = true;
    mesh.scale.setScalar(1);
    mesh.userData.emUso = true;
    const f = { mesh, v, dono, grupo: 'aposta', alvo: null, voo: null, sai: null, som: false };
    mesh.userData.ficha = f;
    M.fichas.push(f);
    return f;
  }
  soltarFicha(M, f) {
    f.mesh.visible = false;
    f.mesh.userData.emUso = false;
    f.mesh.userData.ficha = null;
    M.fichas = M.fichas.filter((x) => x !== f);
  }
  limparFichas(M) {
    for (const f of [...M.fichas]) this.soltarFicha(M, f);
  }
  // voo de onde a ficha está agora até o alvo (com atraso em segundos)
  voar(f, de, { arco = 0.3, dur = 0.5, atraso = 0, som = true } = {}) {
    const p = de || f.mesh.position;
    f.voo = { t: -atraso / dur, de: { x: p.x, y: p.y, z: p.z }, arco, dur, giro: (Math.random() - 0.5) * 6 };
    f.som = som;
  }

  // compara o que o servidor diz com as fichas que estão na mesa e anima a diferença
  sincronizarFichas(M, e, antes) {
    const novaMao = antes && antes.mao !== e.mao;
    // a mesa voltou a esperar (esvaziou no meio de uma mão): não sobra ficha no pano
    if (e.fase === 'espera') {
      for (const f of [...M.fichas]) if (!f.sai) this.soltarFicha(M, f);
      return;
    }
    if (!antes || novaMao) {
      // a mão anterior acabou (as que estão saindo terminam de sair) ou cheguei agora: monta do zero
      for (const f of [...M.fichas]) if (!f.sai) this.soltarFicha(M, f);
      if (!antes && e.fase !== 'showdown') {
        for (const v of fichasDe(e.pote)) Object.assign(this.novaFicha(M, v, -1), { grupo: 'pote' });
        e.lugares.forEach((l, k) => {
          for (const v of fichasDe(l?.aposta || 0)) this.novaFicha(M, v, k);
        });
        this.arrumarApostas(M);
        this.arrumarPote(M, false);
        for (const f of M.fichas) this.pousar(f);
        return;
      }
    }
    // apostas que subiram: as fichas novas voam da cadeira; as que zeraram (a rodada fechou) deslizam
    // para o pote
    let mudouPote = false;
    for (let k = 0; k < LUGARES; k++) {
      const minhas = M.fichas.filter((f) => f.grupo === 'aposta' && f.dono === k);
      const tem = minhas.reduce((s, f) => s + f.v, 0);
      const quer = e.lugares[k]?.aposta || 0;
      if (quer > tem) {
        const c = naMesa(M.m, k, -0.45);
        const de = { x: c.x, y: 1.15, z: c.z };
        const novas = fichasDe(quer - tem).map((v) => this.novaFicha(M, v, k));
        this.arrumarApostas(M);
        novas.forEach((f, j) => this.voar(f, de, { arco: 0.35, dur: 0.55, atraso: j * 0.06 }));
      } else if (quer < tem) {
        for (const f of minhas) f.grupo = 'pote';
        mudouPote = true;
      }
    }
    if (mudouPote) this.arrumarPote(M, true, 0.25);
    this.arrumarApostas(M);
    // fim da mão: o servidor já zera as apostas ao mesmo tempo em que anuncia o
    // vencedor. Antes de pagar visualmente, garante que todo o pote apareceu no pano;
    // isso é especialmente importante quando a mão termina porque todos desistiram.
    if (e.fase === 'showdown' && antes?.fase !== 'showdown') {
      const valorPote = e.resultado?.pote || 0;
      const fichasNaMesa = M.fichas.filter((f) => !f.sai);
      const valorNaMesa = fichasNaMesa.reduce((s, f) => s + f.v, 0);
      if (valorPote > valorNaMesa) {
        for (const v of fichasDe(valorPote - valorNaMesa)) {
          Object.assign(this.novaFicha(M, v, -1), { grupo: 'pote' });
        }
        this.arrumarPote(M, true, 0.25);
      }
      const vs = (e.resultado?.vencedores || []).map((v) => v.lugar);
      const fichas = M.fichas.filter((f) => !f.sai);
      fichas.forEach((f, i) => {
        if (!vs.length) return;
        const c = naMesa(M.m, vs[i % vs.length], 0.05);
        f.sai = { desde: performance.now() + 1500 + i * 25, x: c.x, z: c.z };
      });
    }
    // muita ficha no pote: troca pelas de valor maior (mesmo total)
    const pote = M.fichas.filter((f) => f.grupo === 'pote' && !f.sai);
    if (pote.length > 90) {
      const total = pote.reduce((s, f) => s + f.v, 0);
      for (const f of pote) this.soltarFicha(M, f);
      for (const v of fichasDe(total)) Object.assign(this.novaFicha(M, v, -1), { grupo: 'pote' });
      this.arrumarPote(M, false);
      for (const f of M.fichas) if (f.grupo === 'pote') this.pousar(f);
    }
  }
  pousar(f) {
    f.voo = null;
    f.mesh.position.set(f.alvo.x, f.alvo.y, f.alvo.z);
    f.mesh.rotation.set(0, f.alvo.ry || 0, 0);
  }

  // as apostas: na frente de cada um, uma pilha por valor de ficha, lado a lado
  arrumarApostas(M) {
    for (let k = 0; k < LUGARES; k++) {
      const minhas = M.fichas.filter((f) => f.grupo === 'aposta' && f.dono === k && !f.sai);
      const valores = [...new Set(minhas.map((f) => f.v))].sort((a, b) => b - a);
      valores.forEach((v, j) => {
        const p = naMesa(M.m, k, 0.45, (j - (valores.length - 1) / 2) * (R_FICHA * 2.3));
        minhas.filter((f) => f.v === v).forEach((f, n) => {
          f.alvo = { x: p.x, y: Y_MESA + H_FICHA / 2 + n * H_FICHA, z: p.z, ry: n * 0.7 };
        });
      });
    }
  }

  // o pote: espalhado em montinhos bagunçados, ou (clicado) em torres, as fichas de cada um encaixadas
  // uma na outra, as maiores embaixo. animar: cada ficha voa até o lugar novo, em cascata.
  arrumarPote(M, animar, atrasoBase = 0) {
    const pote = M.fichas.filter((f) => f.grupo === 'pote' && !f.sai);
    const c = this.centroDoPote(M);
    const o = cadeira(M.m, this.olhando(M));
    const px = -o.uz;
    const pz = o.ux;
    if (M.empilhado) {
      // uma torre por dono (até 14 fichas; passou, outra do lado), as torres numa fileira
      const donos = [...new Set(pote.map((f) => f.dono))].sort((a, b) => a - b);
      const torres = [];
      for (const d of donos) {
        const dele = pote.filter((f) => f.dono === d).sort((a, b) => b.v - a.v);
        for (let i = 0; i < dele.length; i += 14) torres.push(dele.slice(i, i + 14));
      }
      const passo = R_FICHA * 2.25;
      const porFila = 8;
      torres.forEach((t, i) => {
        const fila = Math.floor(i / porFila);
        const naFila = Math.min(porFila, torres.length - fila * porFila);
        const lado = (i % porFila - (naFila - 1) / 2) * passo;
        const fundo = -fila * passo;
        const x = c.x + px * lado + o.ux * fundo;
        const z = c.z + pz * lado + o.uz * fundo;
        t.forEach((f, n) => {
          // o encaixe: cada ficha assenta um pouquinho dentro da de baixo, girada de leve
          f.alvo = { x, y: Y_MESA + H_FICHA / 2 + n * H_FICHA * 0.94, z, ry: n * 0.45 };
        });
      });
    } else {
      // montinhos de até 4, num círculo bagunçado
      pote.forEach((f, i) => {
        const monte = Math.floor(i / 4);
        const a = sorteio(monte, 1) * Math.PI * 2;
        const r = Math.sqrt(sorteio(monte, 2)) * 0.22;
        const n = i % 4;
        // mais largo de lado que para a frente (entre as comunitárias e as apostas do outro lado)
        const lado = Math.cos(a) * r * 1.5;
        const frente = Math.sin(a) * r * 0.5;
        f.alvo = {
          x: c.x + px * lado + o.ux * frente + (sorteio(i, 3) - 0.5) * 0.025,
          y: Y_MESA + H_FICHA / 2 + n * H_FICHA,
          z: c.z + pz * lado + o.uz * frente + (sorteio(i, 4) - 0.5) * 0.025,
          ry: sorteio(i, 5) * 6,
        };
      });
    }
    if (animar) pote.forEach((f, i) => this.voar(f, null, { arco: 0.12, dur: 0.38, atraso: atrasoBase + i * 0.012, som: i % 3 === 0 }));
  }

  // clicou numa ficha da mesa: empilha ou espalha o pote (para todo mundo)
  fichaNoMouse(ev) {
    const M = this.ativa || this.mesaPerto(6);
    if (!M || document.pointerLockElement) return null;
    const fichas = M.fichas.filter((f) => f.mesh.visible && !f.sai).map((f) => f.mesh);
    if (!fichas.length) return null;
    const r = this.world.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.world.camera);
    const hit = this.ray.intersectObjects(fichas, false)[0];
    return hit ? { M, f: hit.object.userData.ficha } : null;
  }
  cliqueNo3d(ev) {
    if (ev.button !== 0 || !this.ativa) return;
    const hit = this.fichaNoMouse(ev);
    if (!hit) return;
    const { M } = hit;
    M.empilhado = !M.empilhado;
    this.arrumarPote(M, true);
    this.socket?.emit('pk-empilhar', { mesa: M.i, empilhado: M.empilhado });
    this.$('.pk-dica').hidden = true;
  }
  passarNo3d(ev) {
    if (!this.ativa) return;
    const agora = performance.now();
    if (agora - (this._passouEm || 0) < 60) return;
    this._passouEm = agora;
    this.world.canvas.style.cursor = this.fichaNoMouse(ev) ? 'pointer' : '';
  }

  // ---------------------------------------------------------------- as cartas no 3D
  mostrarCartas(M) {
    const e = M.e;
    const cartas = this.g3d.mesas[M.i].cartas;
    const usadas = new Set();
    const por = (i, face, alvo, chave, de) => {
      const s = cartas[i];
      const u = s.userData;
      usadas.add(i);
      if (u.chave !== chave) {
        u.chave = chave;
        u.voo = de ? { t: 0, de } : null;
        u.some = false;
        u.face = '';
      }
      if (u.face !== chaveCarta(face)) {
        if (u.face && !u.voo) u.vira = 0; // virou (o showdown abre as cartas): gira no lugar
        u.face = chaveCarta(face);
        s.material.map = texturaCarta(face);
        s.material.needsUpdate = true;
      }
      u.alvo = alvo;
      s.visible = true;
    };
    if (e && e.fase !== 'espera') {
      const o = cadeira(M.m, this.olhando(M));
      const ry = Math.atan2(o.ux, o.uz);
      const d = e.lugares.findIndex((l) => l?.dealer);
      const cd = d >= 0 ? naMesa(M.m, d, 0.36) : { x: M.m.x, z: M.m.z };
      const doDealer = { x: cd.x, y: Y_MESA + 0.25, z: cd.z };
      // as comunitárias numa fileira no meio, viradas para quem olha
      e.comunitarias.forEach((c, i) => {
        const lado = (i - 2) * 0.34;
        por(i, c, { x: M.m.x - o.uz * lado - o.ux * 0.02, y: Y_MESA + 0.006, z: M.m.z + o.ux * lado - o.uz * 0.02, ry, esc: 1.3 }, `${e.mao}:c${i}`, doDealer);
      });
      // as duas de cada um, na frente da cadeira: a minha aberta, as dos outros fechadas (abrem no showdown)
      e.lugares.forEach((l, k) => {
        if (!l || l.fora) return;
        const minhas = k === M.lugar && M.mao.length === 2;
        for (let j = 0; j < 2; j++) {
          const i = 5 + k * 2 + j;
          const chave = `${e.mao}:h${k}:${j}`;
          if (l.fold) {
            // desistiu: as cartas vão para o meio e somem
            if (cartas[i].userData.chave === chave) {
              usadas.add(i);
              cartas[i].userData.some = true;
              cartas[i].userData.alvo = { x: M.m.x, y: Y_MESA + 0.01, z: M.m.z, ry: 0 };
            }
            continue;
          }
          const face = l.mao?.[j] || (minhas ? M.mao[j] : 'verso');
          const p = naMesa(M.m, k, 0.19, (j - 0.5) * 0.15);
          por(i, face, { x: p.x, y: Y_MESA + 0.006 + j * 0.002, z: p.z, ry: p.ry + (j - 0.5) * 0.18 }, chave, doDealer);
        }
      });
      // o botão do dealer
      const g = this.g3d.mesas[M.i];
      g.dealer.visible = d >= 0;
      if (d >= 0) {
        const p = naMesa(M.m, d, 0.36, 0.36);
        g.dealer.position.set(p.x, Y_MESA + 0.012, p.z);
        g.dealer.rotation.set(0, p.ry, 0);
      }
    } else this.g3d.mesas[M.i].dealer.visible = false;
    cartas.forEach((s, i) => {
      if (usadas.has(i)) return;
      s.visible = false;
      s.userData.chave = '';
    });
  }

  // o movimento das cartas e das fichas, e o anel da vez
  anima3d(M, dt, t) {
    const g = this.g3d.mesas[M.i];
    for (const s of g.cartas) {
      if (!s.visible) continue;
      const u = s.userData;
      const a = u.alvo;
      let { x, y, z, ry } = a;
      let rx = 0;
      let rz = 0;
      if (u.voo) {
        u.voo.t = Math.min(1, u.voo.t + dt / 0.4);
        const k = saida(u.voo.t);
        x = lerp(u.voo.de.x, a.x, k);
        z = lerp(u.voo.de.z, a.z, k);
        y = lerp(u.voo.de.y, a.y, k) + Math.sin(Math.PI * k) * 0.25;
        ry += (1 - k) * 3;
        rx = (1 - k) * 0.5;
        if (u.voo.t >= 1) u.voo = null;
      } else if (u.some) {
        // indo para o meio e sumindo
        const p = s.position;
        x = lerp(p.x, a.x, Math.min(1, dt * 5));
        z = lerp(p.z, a.z, Math.min(1, dt * 5));
        ry = s.rotation.y + dt * 4;
        if (Math.hypot(x - a.x, z - a.z) < 0.05) {
          s.visible = false;
          u.some = false;
        }
      }
      if (u.vira < 1) {
        u.vira = Math.min(1, u.vira + dt / 0.4);
        rz = (1 - saida(u.vira)) * Math.PI;
        y += Math.sin(Math.PI * u.vira) * 0.12;
      }
      s.position.set(x, y, z);
      s.rotation.set(rx, ry, rz);
      s.scale.setScalar(a.esc ?? 1);
    }
    // as fichas
    const agora = performance.now();
    let caiu = 0;
    for (const f of [...M.fichas]) {
      const m = f.mesh;
      const a = f.alvo;
      if (!a) continue;
      if (f.sai && agora >= f.sai.desde) {
        // indo para quem ganhou: desliza pela mesa e some na frente dele
        const k = Math.min(1, (agora - f.sai.desde) / 700);
        const e2 = k * k;
        m.position.x = lerp(a.x, f.sai.x, e2);
        m.position.z = lerp(a.z, f.sai.z, e2);
        m.position.y = a.y + Math.sin(Math.PI * k) * 0.08;
        m.scale.setScalar(1 - 0.6 * Math.max(0, k - 0.6) / 0.4);
        if (k >= 1) this.soltarFicha(M, f);
        continue;
      }
      if (f.voo) {
        const v = f.voo;
        v.t = Math.min(1, v.t + dt / v.dur);
        if (v.t < 0) {
          // ainda esperando a vez dela na cascata
          m.position.set(v.de.x, v.de.y, v.de.z);
          continue;
        }
        const k = saida(v.t);
        const dist = Math.hypot(a.x - v.de.x, a.z - v.de.z);
        m.position.set(lerp(v.de.x, a.x, k), lerp(v.de.y, a.y, k) + Math.sin(Math.PI * v.t) * (v.arco + dist * 0.12), lerp(v.de.z, a.z, k));
        m.rotation.set((1 - k) * v.giro, (a.ry || 0) + (1 - k) * 4, 0);
        if (v.t >= 1) {
          f.voo = null;
          if (f.som) caiu++;
          this.pousar(f);
        }
      } else if (m.position.x !== a.x || m.position.y !== a.y || m.position.z !== a.z) {
        this.pousar(f);
      }
    }
    if (caiu) this.somFicha(M, caiu);
    // o anel: na frente de quem joga
    const e = M.e;
    const vez = e ? e.lugares.findIndex((l) => l?.vez) : -1;
    g.anel.visible = vez >= 0;
    if (vez >= 0) {
      const p = naMesa(M.m, vez, 0.19);
      g.anel.position.set(p.x, Y_MESA + 0.004, p.z);
      g.anel.scale.setScalar(1 + Math.sin(t * 6) * 0.1);
    }
  }

  // o "tlec" das fichas caindo (mais baixo de longe; um por vez, mesmo com uma pilha caindo)
  somFicha(M, n) {
    const agora = performance.now();
    if (agora - this.somEm < 45) return;
    const d = Math.hypot(this.player.pos.x - M.m.x, this.player.pos.z - M.m.z);
    if (d > OUVE_ATE) return;
    this.somEm = agora;
    this.sfx.ficha?.(Math.min(1, 1.2 - d / OUVE_ATE) * Math.min(1.4, 0.7 + n * 0.15));
  }

  // ---------------------------------------------------------------- sentar e levantar
  mesaPerto(folga = 1.2) {
    const p = this.player.pos;
    return this.mesas.find((M) => distMesa(M.m, p) < FORA + 0.5 + folga && p.y < 2) || null;
  }

  usarE() {
    const M = this.mesaPerto();
    if (!M || !this.ligado()) return false;
    if (this.focar?.()) this.sentar(M);
    return true;
  }

  // senta na cadeira livre mais perto de onde estou (ou na de um robô que não está numa mão)
  sentar(M) {
    const e = M.e;
    const p = this.player.pos;
    const emJogo = e && e.fase !== 'espera' && e.fase !== 'showdown';
    const livres = [...Array(LUGARES).keys()]
      .filter((k) => {
        const l = e?.lugares[k];
        return !l || (l.robo && !(emJogo && !l.fold && !l.fora));
      })
      .sort((a, b) => {
        const ca = cadeira(M.m, a);
        const cb = cadeira(M.m, b);
        return Math.hypot(p.x - ca.x, p.z - ca.z) - Math.hypot(p.x - cb.x, p.z - cb.z);
      });
    if (!livres.length) {
      hud.mensagem('Mesa cheia', 'Espere alguém levantar (ou a mão acabar)', 1800);
      this.soltarFoco?.();
      return;
    }
    this.socket?.emit('pk-sentar', { mesa: M.i, lugar: livres[0] }, (r) => {
      if (!r?.ok) {
        const texto = { 'sem moedas': ['Moedas insuficientes', `A mesa pede no mínimo ${r.minimo ?? MINIMO_MESA} moedas para sentar`], ocupado: ['Alguém sentou aí', 'Tente de novo'], 'robo jogando': ['O robô está no meio da mão', 'Espere a mão acabar'], cheia: ['Mesa cheia', ''], desligado: ['Poker desligado', 'O dono da sala desligou este jogo'] }[r?.erro] || ['Não deu para sentar', ''];
        hud.mensagem(texto[0], texto[1], 2000);
        this.soltarFoco?.();
        return;
      }
      M.lugar = r.lugar;
      this.ativa = M;
      const c = cadeira(M.m, r.lugar);
      const yaw = Math.atan2(c.ux, c.uz);
      this.player.sentarEm({ x: c.x, y: 0.45, z: c.z, yaw });
      this.player.override = this.pose(M);
      this.raiz.hidden = false;
      this.$('.pk-dica').hidden = false;
      document.body.classList.add('pk-sentado');
      let viu = true;
      try {
        viu = !!localStorage.getItem('pk-tutorial');
        localStorage.setItem('pk-tutorial', '1');
      } catch {}
      if (!viu) this.abrirGuia('tutorial', 0);
      // as cartas e o pote passam a ficar virados para mim
      this.arrumarPote(M, true);
      this.mostrarCartas(M);
      this.desenhar();
      this.sfx.teleport();
    });
  }

  // a câmera atrás da minha cadeira, alta o bastante para a mesa comprida caber, olhando para o meio
  // (puxado um pouco para o meu lado: as minhas cartas ficam embaixo)
  pose(M) {
    const c = cadeira(M.m, Math.max(0, M.lugar));
    // de frente para a mesa: na lateral, a câmera vai quase para o meio dela (a mesa inteira cabe e
    // não fica torta); na ponta, já está no eixo
    const x = c.ux ? c.x : lerp(c.x, M.m.x, 0.75);
    return {
      position: new THREE.Vector3(x + c.ux * 0.9, c.ux ? 2.75 : 2.95, c.z + c.uz * 0.9),
      target: new THREE.Vector3(lerp(M.m.x, c.px, 0.15), Y_MESA - 0.35, lerp(M.m.z, c.pz, 0.15)),
    };
  }

  // o main.js tirou o foco (Esc, E, botão): levanta e sai da mesa
  sairDaMesa() {
    const M = this.ativa;
    if (!M) return;
    this.ativa = null;
    this.fecharGuia();
    this.raiz.hidden = true;
    document.body.classList.remove('pk-sentado');
    this.world.canvas.style.cursor = '';
    this.player.override = null;
    this.player.stand();
    this.socket?.emit('pk-sair', { mesa: M.i });
    this.arrumarPote(M, true);
    this.mostrarCartas(M);
  }

  // ---------------------------------------------------------------- o painel
  $(sel) {
    return this.raiz.querySelector(sel);
  }

  montarHud() {
    const css = document.createElement('style');
    css.textContent = `
#pk-hud { position: fixed; inset: 0; z-index: 33; pointer-events: none; color: #f8fafc; font: 700 14px ${FONTE}; touch-action: manipulation; }
#pk-hud[hidden], #pk-hud [hidden] { display: none !important; }
#pk-hud button { font: inherit; cursor: pointer; pointer-events: auto; }
body.pk-sentado #controls-help, body.pk-sentado #sit-hint { display: none !important; }
.pk-b { --cor: #334155; --sombra: #1e293b; padding: 10px 16px; border: 0; border-radius: 10px; background: var(--cor); color: #fff;
  box-shadow: 0 4px 0 var(--sombra), 0 8px 18px rgba(0,0,0,.35); transition: transform .08s ease, box-shadow .08s ease, filter .12s; white-space: nowrap; font-weight: 800 !important; }
.pk-b:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 0 var(--sombra), 0 10px 20px rgba(0,0,0,.35); filter: brightness(1.08); }
.pk-b:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 var(--sombra); }
.pk-b:disabled { filter: grayscale(.7) brightness(.6); cursor: default !important; }
.pk-b.vermelho { --cor: #dc2626; --sombra: #7f1d1d; } .pk-b.verde { --cor: #16a34a; --sombra: #14532d; }
.pk-b.azul { --cor: #2563eb; --sombra: #1e3a8a; } .pk-b.ouro { --cor: #f59e0b; --sombra: #92400e; color: #1c1206; }
.pk-b small { display: block; font-size: 11px; opacity: .8; font-weight: 700; }
.pk-painel { background: linear-gradient(#1f2937f2, #111827f2); border: 1px solid #ffffff1f; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.pk-esq { position: absolute; left: 78px; top: 64px; width: 200px; display: grid; gap: 8px; }
.pk-info { padding: 12px; display: grid; gap: 8px; }
.pk-ajuda { display: flex; gap: 6px; }
.pk-ajuda button { flex: 1; padding: 6px 4px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; color: #e2e8f0; font-size: 12px !important; }
.pk-ajuda button:hover { background: #334155; }
.pk-titulo { font: 900 22px ${FONTE}; letter-spacing: .04em; color: #4ade80; }
.pk-titulo span { color: #f87171; }
.pk-pote { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: #0b1f17; }
.pk-pote i { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle, #15803d 45%, #fff 46% 52%, #15803d 53%); box-shadow: 0 2px 0 #052e16; flex: none; }
.pk-pote b { font-size: 24px; }
.pk-pote small, .pk-linha small { display: block; font-size: 10px; letter-spacing: .1em; color: #94a3b8; }
.pk-linha { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.pk-dono { display: grid; gap: 4px; padding: 6px 8px; border-radius: 10px; background: #0b1220; }
.pk-dono small { display: block; margin-bottom: 4px; font-size: 10px; letter-spacing: .1em; color: #fbbf24; }
.pk-dono select { width: 100%; padding: 5px 6px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; color: #f8fafc; font: 700 12px ${FONTE}; pointer-events: auto; cursor: pointer; }
.pk-v-proximo { font-size: 11px; color: #fde68a; }
.pk-assentos .coroa { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); font-size: 14px; }
.pk-aviso { font-size: 13px; color: #fde68a; min-height: 18px; line-height: 1.3; }
.pk-sair { position: absolute; right: 18px; top: 64px; }
.pk-assentos > div { position: absolute; left: 0; top: 0; min-width: 118px; padding: 6px 10px 7px; text-align: center; pointer-events: none;
  background: #0f172aeb; border: 2px solid #334155; border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,.4); transition: border-color .2s, opacity .2s; }
.pk-assentos .nome { font-size: 13px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-assentos .fichas { font-size: 12px; color: #86efac; }
.pk-assentos .vazio { color: #64748b; font-size: 12px; }
.pk-assentos .vez { border-color: #facc15; box-shadow: 0 0 0 3px #facc1555, 0 6px 16px rgba(0,0,0,.4); }
.pk-assentos .eu { border-color: #38bdf8; }
.pk-assentos .fold { opacity: .5; }
.pk-assentos .ganhou { border-color: #fbbf24; background: #422006f0; animation: pk-brilha 1s ease-in-out infinite alternate; }
.pk-assentos .selo { position: absolute; top: -10px; right: -8px; padding: 1px 6px; border-radius: 8px; font-size: 11px; background: #f8fafc; color: #111827; }
.pk-assentos .selo.allin { background: #dc2626; color: #fff; left: -8px; right: auto; }
.pk-assentos .aposta { margin-top: 3px; font-size: 12px; color: #fde68a; }
.pk-assentos .lance { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 2px 8px; border-radius: 999px; background: #422006; color: #fde68a; font-size: 13px; }
.pk-assentos .lance i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle, #dc2626 45%, #fff 46% 56%, #dc2626 57%); flex: none; }
.pk-assentos .total { margin-top: 2px; font-size: 11px; color: #94a3b8; }
.pk-assentos .jogo { margin-top: 3px; font-size: 11px; color: #fbbf24; }
.pk-assentos .mini { display: flex; gap: 3px; justify-content: center; margin-top: 4px; }
.pk-assentos .mini img { width: 30px; border-radius: 3px; }
.pk-assentos .tempo { height: 4px; margin-top: 5px; border-radius: 2px; background: #334155; overflow: hidden; }
.pk-assentos .tempo i { display: block; height: 100%; background: #facc15; width: 100%; }
.pk-baixo { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: flex-end; gap: 14px; max-width: calc(100vw - 24px); }
.pk-mao { display: grid; justify-items: center; gap: 6px; }
.pk-cartas { display: flex; gap: 6px; }
.pk-cartas img { width: 74px; border-radius: 7px; box-shadow: 0 8px 18px rgba(0,0,0,.45); transition: transform .15s; }
.pk-cartas img:nth-child(1) { transform: rotate(-5deg); } .pk-cartas img:nth-child(2) { transform: rotate(5deg) translateY(2px); }
.pk-cartas img.nova { animation: pk-chega .45s cubic-bezier(.2,.8,.2,1.2) both; }
.pk-cartas img.nova:nth-child(2) { animation-delay: .12s; }
.pk-jogo { font-size: 13px; padding: 3px 10px; border-radius: 8px; background: #0f172ad9; color: #fbbf24; }
.pk-acoes { padding: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; pointer-events: auto; }
.pk-acoes.pulo { animation: pk-pulo .5s ease; }
.pk-saldo { padding: 0 6px; font-size: 12px; color: #94a3b8; text-align: center; }
.pk-saldo b { display: block; font-size: 20px; color: #86efac; }
.pk-raise { display: grid; gap: 5px; padding: 6px 8px; border-radius: 10px; background: #0b1220; }
.pk-raise input { width: 160px; accent-color: #22c55e; pointer-events: auto; }
.pk-rapidos { display: flex; gap: 4px; }
.pk-rapidos button { padding: 3px 7px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #cbd5e1; font-size: 11px !important; }
.pk-rapidos button:hover { background: #334155; }
.pk-espera { padding: 0 6px; color: #cbd5e1; font-size: 13px; max-width: 220px; }
.pk-banner { position: absolute; left: 50%; bottom: 200px; transform: translateX(-50%); padding: 12px 22px; border-radius: 14px; text-align: center;
  background: linear-gradient(#78350ff2, #451a03f2); border: 2px solid #fbbf24; box-shadow: 0 12px 30px rgba(0,0,0,.45); font-size: 18px; animation: pk-chega .5s ease both; }
.pk-banner small { display: block; font-size: 12px; color: #fde68a; margin-top: 2px; }
.pk-dica { padding: 6px 12px; border-radius: 10px; background: #0f172acc; font-size: 12px; color: #cbd5e1; }
.pk-fundo { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; background: #020617b3; pointer-events: auto; animation: pk-aparece .2s ease both; }
.pk-guia { position: relative; width: min(600px, 100%); max-height: calc(100vh - 24px); overflow-y: auto; padding: 20px 22px; animation: pk-chega .3s cubic-bezier(.2,.8,.2,1) both; }
.pk-guia h2 { margin: 0 34px 4px 0; font: 900 20px ${FONTE}; color: #4ade80; }
.pk-guia h3 { margin: 0 0 8px; font-size: 17px; color: #fbbf24; }
.pk-guia p, .pk-guia li { font-weight: 600; line-height: 1.5; color: #e2e8f0; }
.pk-guia p { margin: 0 0 10px; }
.pk-guia b { color: #fff; }
.pk-fechar { position: absolute; right: 12px; top: 12px; width: 32px; height: 32px; border: 0; border-radius: 8px; background: #334155; color: #fff; font-size: 18px !important; }
.pk-fechar:hover { background: #475569; }
.pk-abas { display: flex; gap: 6px; margin: 10px 0 14px; }
.pk-abas button { padding: 6px 12px; border: 1px solid #334155; border-radius: 8px; background: #0b1220; color: #94a3b8; }
.pk-abas button[aria-selected="true"] { background: #16a34a; border-color: #16a34a; color: #fff; }
.pk-passo ul { margin: 0 0 10px; padding-left: 18px; }
.pk-passo .ex { display: flex; gap: 4px; margin: 4px 0 12px; }
.pk-guia .ex img { width: 34px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
.pk-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; }
.pk-pontos { display: flex; gap: 6px; }
.pk-pontos i { width: 8px; height: 8px; border-radius: 50%; background: #334155; }
.pk-pontos i.on { background: #4ade80; }
.pk-cola { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.pk-cola li { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 4px 10px; padding: 8px 10px; border-radius: 10px; background: #0b1220; border: 2px solid transparent; }
.pk-cola li.agora { border-color: #fbbf24; background: #422006; }
.pk-cola .pos { font-size: 18px; font-weight: 900; color: #64748b; text-align: center; }
.pk-cola .nm { color: #fbbf24; font-size: 15px; }
.pk-cola .nm em { font-style: normal; font-size: 11px; color: #fde68a; margin-left: 6px; }
.pk-cola .txt { display: block; font-size: 12px; color: #cbd5e1; font-weight: 600; line-height: 1.35; }
.pk-cola .ex { display: flex; gap: 2px; }
.pk-cola .ex img { width: 26px; }
.pk-cola .ex img.fora { opacity: .3; }
.pk-rodape { margin-top: 12px !important; font-size: 12px; color: #94a3b8 !important; }
@keyframes pk-aparece { from { opacity: 0; } }
@keyframes pk-chega { from { opacity: 0; transform: translateY(26px) scale(.85); } }
@keyframes pk-pulo { 30% { transform: translateY(-8px); } }
@keyframes pk-brilha { to { box-shadow: 0 0 22px #fbbf24aa; } }
@media (max-width: 760px) {
  .pk-esq { left: 10px; top: 56px; width: 150px; } .pk-info { padding: 8px; } .pk-pote b { font-size: 18px; }
  .pk-guia { padding: 14px; } .pk-cola li { grid-template-columns: 22px 1fr; } .pk-cola .ex { grid-column: 2; }
  .pk-baixo { flex-direction: column; align-items: center; bottom: 8px; gap: 6px; }
  .pk-cartas img { width: 54px; } .pk-raise input { width: 120px; } .pk-b { padding: 8px 11px; }
}
body.touch .pk-esq { left: calc(8px + env(safe-area-inset-left)); top: calc(52px + env(safe-area-inset-top)); max-height: calc(100dvh - 60px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
body.touch .pk-sair { right: calc(8px + env(safe-area-inset-right)); top: calc(52px + env(safe-area-inset-top)); }
body.touch .pk-baixo { bottom: calc(8px + env(safe-area-inset-bottom)); width: min(520px, calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right))); }
body.touch .pk-acoes { width: 100%; justify-content: center; }
@media (max-height: 460px) {
  body.touch .pk-esq { width: 138px; }
  body.touch .pk-info { padding: 6px; gap: 5px; }
  body.touch .pk-titulo { font-size: 17px; }
  body.touch .pk-ajuda { display: none; }
  body.touch .pk-dica { display: none; }
  /* iPhone em pé deitado: a mesa precisa ficar livre. Os comandos viram uma grade curta,
     presa à direita, em vez de uma faixa larga cobrindo o centro da tela. */
  body.touch .pk-baixo { left: auto; right: calc(8px + env(safe-area-inset-right)); transform: none; align-items: stretch; gap: 3px;
    width: min(380px, calc(100vw - 168px - env(safe-area-inset-left) - env(safe-area-inset-right))); }
  body.touch .pk-mao { position: absolute; right: 100%; bottom: 0; margin-right: 8px; }
  body.touch .pk-cartas { gap: 3px; }
  body.touch .pk-cartas img { width: 42px; }
  body.touch .pk-jogo { font-size: 11px; padding: 2px 6px; }
  body.touch .pk-acoes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 6px; gap: 5px; }
  body.touch .pk-b { min-width: 0; padding: 6px 7px; font-size: 12px; white-space: normal; }
  body.touch .pk-b small { font-size: 9px; }
  body.touch .pk-saldo { grid-column: span 3; padding: 0; }
  body.touch .pk-saldo b { display: inline; margin-left: 4px; font-size: 16px; }
  body.touch .pk-raise { grid-column: span 2; padding: 4px 6px; gap: 3px; }
  body.touch .pk-raise input { width: 100%; }
  body.touch .pk-rapidos button { padding: 2px 4px; font-size: 10px !important; }
  body.touch .pk-espera { grid-column: span 3; max-width: none; padding: 0; text-align: center; font-size: 11px; }
  body.touch .pk-assentos > div { min-width: 86px; padding: 4px 6px 5px; border-radius: 9px; }
  body.touch .pk-assentos .nome { max-width: 98px; font-size: 11px; }
  body.touch .pk-assentos .fichas, body.touch .pk-assentos .aposta, body.touch .pk-assentos .lance { font-size: 10px; }
  body.touch .pk-assentos .mini { margin-top: 2px; }
  body.touch .pk-assentos .mini img { width: 22px; }
}
/* iPhone 13 / telas estreitas (380x840): painel do pote e comandos de baixo mais compactos */
@media (max-width: 400px) {
  body.touch .pk-esq { left: calc(4px + env(safe-area-inset-left)); top: calc(48px + env(safe-area-inset-top)); width: 132px; padding: 6px; gap: 6px; }
  body.touch .pk-info { padding: 6px; gap: 5px; }
  body.touch .pk-titulo { font-size: 16px; }
  body.touch .pk-pote b { font-size: 16px; }
  body.touch .pk-pote i { width: 20px; height: 20px; }
  body.touch .pk-linha { font-size: 10.5px; gap: 6px; }
  body.touch .pk-ajuda { display: none; }
  body.touch .pk-dica { display: none; }
  body.touch .pk-sair { right: calc(4px + env(safe-area-inset-right)); top: calc(48px + env(safe-area-inset-top)); padding: 6px 8px; font-size: 11px; }
  body.touch .pk-baixo { bottom: calc(4px + env(safe-area-inset-bottom)); width: min(520px, calc(100vw - 8px - env(safe-area-inset-left) - env(safe-area-inset-right))); gap: 5px; }
  body.touch .pk-cartas img { width: 44px; }
  body.touch .pk-jogo { font-size: 10px; padding: 2px 6px; }
  body.touch .pk-acoes { padding: 6px; gap: 5px; }
  body.touch .pk-b { padding: 6px 8px; font-size: 11px; }
  body.touch .pk-b small { font-size: 9px; }
  body.touch .pk-saldo { font-size: 10px; }
  body.touch .pk-saldo b { font-size: 14px; }
  body.touch .pk-raise { gap: 3px; padding: 4px 6px; }
  body.touch .pk-raise input { width: 100px; }
  body.touch .pk-rapidos button { padding: 2px 4px; font-size: 9px !important; }
  body.touch .pk-espera { font-size: 10px; }
  body.touch .pk-assentos > div { min-width: 78px; padding: 3px 5px 4px; border-radius: 8px; }
  body.touch .pk-assentos .nome { max-width: 88px; font-size: 10px; }
  body.touch .pk-assentos .fichas, body.touch .pk-assentos .aposta, body.touch .pk-assentos .lance { font-size: 9px; }
  body.touch .pk-assentos .mini img { width: 18px; }
}
/* iPhone 13 deitado (landscape, ~844×390): a altura é baixa, então os comandos encolhem */
@media (orientation: landscape) and (max-height: 430px) {
  body.touch .pk-esq { left: calc(6px + env(safe-area-inset-left)); top: calc(44px + env(safe-area-inset-top)); width: 150px; max-height: calc(100dvh - 48px - env(safe-area-inset-top)); overflow-y: auto; padding: 6px; gap: 5px; }
  body.touch .pk-info { padding: 6px; gap: 4px; }
  body.touch .pk-titulo { font-size: 16px; }
  body.touch .pk-pote b { font-size: 16px; }
  body.touch .pk-pote i { width: 20px; height: 20px; }
  body.touch .pk-ajuda, body.touch .pk-dica { display: none; }
  body.touch .pk-sair { right: calc(6px + env(safe-area-inset-right)); top: calc(44px + env(safe-area-inset-top)); padding: 5px 7px; font-size: 10px; }
  body.touch .pk-baixo { bottom: calc(4px + env(safe-area-inset-bottom)); flex-direction: row; align-items: flex-end; gap: 8px; }
  body.touch .pk-cartas img { width: 42px; }
  body.touch .pk-jogo { font-size: 10px; padding: 2px 6px; }
  body.touch .pk-acoes { padding: 5px; gap: 4px; }
  body.touch .pk-b { padding: 5px 7px; font-size: 10px; }
  body.touch .pk-b small { font-size: 8px; }
  body.touch .pk-saldo { font-size: 10px; }
  body.touch .pk-saldo b { font-size: 14px; }
  body.touch .pk-raise { gap: 3px; padding: 4px 6px; }
  body.touch .pk-raise input { width: 90px; }
  body.touch .pk-rapidos button { padding: 2px 4px; font-size: 9px !important; }
  body.touch .pk-espera { font-size: 10px; }
  body.touch .pk-assentos > div { min-width: 80px; padding: 3px 5px 4px; }
  body.touch .pk-assentos .nome { max-width: 90px; font-size: 10px; }
  body.touch .pk-assentos .mini img { width: 18px; }
}
@media (prefers-reduced-motion: reduce) { #pk-hud * { animation: none !important; transition: none !important; } }
`;
    document.head.appendChild(css);
    const raiz = document.createElement('div');
    raiz.id = 'pk-hud';
    raiz.hidden = true;
    raiz.innerHTML = `
      <div class="pk-esq">
      <div class="pk-info pk-painel">
        <div class="pk-titulo">♠ POKER <span>♥</span></div>
        <div class="pk-pote"><i></i><div><small>POTE</small><b class="pk-v-pote">0</b></div></div>
        <div class="pk-linha"><div><small>BLINDS</small><span class="pk-v-blinds">${SMALL}/${BIG}</span></div><div><small>FASE</small><span class="pk-v-fase">—</span></div><div><small>MÃO</small><span class="pk-v-mao">—</span></div></div>
        <div class="pk-linha"><div><small>MÍNIMO DA MESA</small><span class="pk-v-min">${MINIMO_MESA}</span> moedas</div><div><small>APOSTA</small><span class="pk-v-aposta">—</span></div></div>
        <div class="pk-dono" hidden>
          <label><small>👑 VOCÊ É O DONO DA MESA</small>
            <select aria-label="Blinds da mesa">${BLINDS.map(([s, b], i) => `<option value="${i}">Blinds ${s}/${b} · mín. ${b * BIGS_MINIMO}</option>`).join('')}</select>
          </label>
          <span class="pk-v-proximo" hidden></span>
        </div>
        <div class="pk-aviso"></div>
        <div class="pk-ajuda"><button type="button" data-guia="tutorial">❓ Como jogar</button><button type="button" data-guia="cola">🃏 Cola</button></div>
      </div>
      <div class="pk-dica">Clique nas fichas da mesa para empilhar o pote</div>
      </div>
      <button type="button" class="pk-b pk-sair" data-pk="sair">Levantar <small>Esc</small></button>
      <div class="pk-assentos"></div>
      <div class="pk-banner" hidden></div>
      <div class="pk-baixo">
        <div class="pk-mao"><div class="pk-cartas"></div><div class="pk-jogo" hidden></div></div>
        <div class="pk-acoes pk-painel">
          <div class="pk-saldo">Suas fichas<b class="pk-v-saldo">0</b></div>
          <button type="button" class="pk-b verde" data-pk="comecar">Começar<small>os robôs completam a mesa</small></button>
          <button type="button" class="pk-b vermelho" data-pk="fold">Desistir</button>
          <button type="button" class="pk-b azul" data-pk="call">Passar</button>
          <div class="pk-raise">
            <input type="range" min="0" max="0" step="1" value="0" aria-label="Valor do aumento">
            <div class="pk-rapidos"><button type="button" data-rap="min">Mín</button><button type="button" data-rap="meio">½ pote</button><button type="button" data-rap="pote">Pote</button></div>
          </div>
          <button type="button" class="pk-b verde" data-pk="raise">Aumentar<small class="pk-v-raise">para 0</small></button>
          <button type="button" class="pk-b ouro" data-pk="allin">All-in<small class="pk-v-allin">0</small></button>
          <div class="pk-espera"></div>
        </div>
      </div>
      <div class="pk-fundo" hidden>
        <div class="pk-guia pk-painel" role="dialog" aria-modal="true" aria-labelledby="pk-guia-titulo">
          <button type="button" class="pk-fechar" data-guia="fechar" aria-label="Fechar">✕</button>
          <h2 id="pk-guia-titulo">♠ Poker Texas Hold'em</h2>
          <div class="pk-abas" role="tablist">
            <button type="button" role="tab" data-guia="tutorial">Como jogar</button>
            <button type="button" role="tab" data-guia="cola">Cola das mãos</button>
          </div>
          <div class="pk-conteudo"></div>
        </div>
      </div>`;
    document.body.appendChild(raiz);
    this.raiz = raiz;
    this.barra = raiz.querySelector('.pk-raise input');
    this.barra.addEventListener('input', () => this.mostrarRaise());
    this.$('.pk-dono select').addEventListener('change', (ev) => {
      const M = this.ativa;
      if (M) this.socket?.emit('pk-blind', { mesa: M.i, nivel: Number(ev.target.value) });
      ev.target.blur();
    });
    raiz.addEventListener('click', (ev) => this.clique(ev));
  }

  // ---------------------------------------------------------------- tutorial e cola
  // o modal por cima da mesa: 'tutorial' (passo a passo) ou 'cola' (as mãos da melhor para a pior).
  // Esc fecha só o modal (pego antes do main.js, que levantaria da mesa)
  abrirGuia(aba, passo = this.passo || 0) {
    const fundo = this.$('.pk-fundo');
    this.passo = Math.max(0, Math.min(PASSOS.length - 1, passo));
    for (const t of this.$('.pk-abas').children) t.setAttribute('aria-selected', String(t.dataset.guia === aba));
    this.$('.pk-conteudo').innerHTML = aba === 'cola' ? this.htmlCola() : this.htmlPasso();
    if (!fundo.hidden) return;
    fundo.hidden = false;
    this._escGuia = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      ev.preventDefault();
      this.fecharGuia();
    };
    document.addEventListener('keydown', this._escGuia, true);
  }

  fecharGuia() {
    this.$('.pk-fundo').hidden = true;
    if (this._escGuia) document.removeEventListener('keydown', this._escGuia, true);
    this._escGuia = null;
  }

  htmlPasso() {
    const k = this.passo;
    const [titulo, corpo] = PASSOS[k];
    const ultimo = k === PASSOS.length - 1;
    return `<div class="pk-passo"><h3>${k + 1}. ${titulo}</h3>${corpo(this.ativa?.e)}</div>
      <div class="pk-nav">
        <button type="button" class="pk-b" data-passo="-1" ${k === 0 ? 'disabled' : ''}>← Voltar</button>
        <div class="pk-pontos">${PASSOS.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</div>
        ${ultimo ? '<button type="button" class="pk-b verde" data-guia="fechar">Bora jogar!</button>' : '<button type="button" class="pk-b verde" data-passo="1">Próximo →</button>'}
      </div>`;
  }

  htmlCola() {
    // a mão que eu tenho agora fica marcada na lista
    const M = this.ativa;
    const sete = M ? [...M.mao, ...(M.e?.comunitarias || [])] : [];
    let agora = -1;
    if (sete.length >= 5 && !M.e?.lugares[M.lugar]?.fold) {
      const a = avaliarMao(sete);
      agora = a.forca === 8 && a.tie[0] === 14 ? 9 : a.forca;
    }
    return `<ol class="pk-cola">${COLA.map((h, i) => `
      <li class="${h.forca === agora ? 'agora' : ''}">
        <span class="pos">${i + 1}</span>
        <div><span class="nm">${h.nome}${h.forca === agora ? '<em>← a sua mão agora</em>' : ''}</span><span class="txt">${h.txt}</span></div>
        ${exemplo(h.ex, h.usa)}
      </li>`).join('')}</ol>
      <p class="pk-rodape">Mesma mão? Vence quem tem as cartas mais altas nela; se ainda empatar, a carta que sobra (o <b>kicker</b>) desempata. O naipe nunca desempata: empate de verdade divide o pote. Os valores, do maior para o menor: A K Q J 10 9 8 7 6 5 4 3 2.</p>`;
  }

  // os números da minha vez: quanto falta pagar, o mínimo e o máximo do aumento
  contas(M) {
    const e = M.e;
    const l = e?.lugares[M.lugar];
    if (!l) return null;
    const saldo = l.saldo ?? 0;
    const precisa = Math.max(0, e.apostaAtual - l.aposta);
    const max = l.aposta + saldo; // tudo o que tenho, contando o que já está na mesa nesta rodada
    const min = Math.min(e.minimo, max);
    const pote = e.pote + e.lugares.reduce((s, x) => s + (x?.aposta || 0), 0);
    return { l, saldo, precisa, max, min, pote };
  }

  mostrarRaise() {
    const v = Number(this.barra.value);
    this.$('.pk-v-raise').textContent = `para ${v}`;
    this.$('[data-pk="raise"]').firstChild.textContent = this.ativa?.e?.apostaAtual ? 'Aumentar' : 'Apostar';
  }

  clique(ev) {
    const b = ev.target.closest('button');
    const M = this.ativa;
    if (!b && ev.target.classList.contains('pk-fundo')) return this.fecharGuia();
    if (!b || !M) return;
    b.blur();
    const d = b.dataset;
    if (d.guia === 'fechar') return this.fecharGuia();
    if (d.guia) return this.abrirGuia(d.guia);
    if (d.passo) return this.abrirGuia('tutorial', this.passo + Number(d.passo));
    if (d.pk === 'sair') return this.soltarFoco?.();
    if (d.pk === 'comecar') return this.socket?.emit('pk-comecar', { mesa: M.i });
    if (d.rap) {
      const c = this.contas(M);
      if (!c) return;
      const alvo = d.rap === 'min' ? c.min : M.e.apostaAtual + Math.ceil(c.pote * (d.rap === 'meio' ? 0.5 : 1));
      this.barra.value = String(Math.max(c.min, Math.min(c.max, alvo)));
      this.mostrarRaise();
      return;
    }
    if (!d.pk) return;
    const c = this.contas(M);
    if (!c?.l.vez) return;
    const tipo = d.pk === 'call' && c.precisa === 0 ? 'check' : d.pk;
    this.socket?.emit('pk-apostar', { mesa: M.i, tipo, valor: Number(this.barra.value) });
    this.sfx.cartaSel?.(tipo === 'fold' ? 0 : 4);
  }

  desenhar() {
    const M = this.ativa;
    const e = M?.e;
    if (!M || !e) return;
    const c = this.contas(M);
    const naRodada = e.lugares.reduce((s, x) => s + (x?.aposta || 0), 0);
    this.$('.pk-v-pote').textContent = String(e.fase === 'showdown' ? e.resultado?.pote ?? 0 : e.pote + naRodada);
    this.$('.pk-v-fase').textContent = FASE[e.fase] || e.fase;
    this.$('.pk-v-mao').textContent = e.mao ? `#${e.mao}` : '—';
    this.$('.pk-v-min').textContent = String(e.minimoMesa ?? MINIMO_MESA);
    this.$('.pk-v-blinds').textContent = `${e.small ?? SMALL}/${e.big ?? BIG}`;
    // o dono da mesa escolhe o blind (com a mão rolando, o escolhido entra na próxima)
    const dono = this.$('.pk-dono');
    dono.hidden = !e.dono || e.dono !== e.lugares[M.lugar]?.id;
    if (!dono.hidden) {
      const nivel = e.nivelProximo ?? e.nivel ?? 0;
      const sel = dono.querySelector('select');
      if (document.activeElement !== sel) sel.value = String(nivel);
      const prox = this.$('.pk-v-proximo');
      prox.hidden = e.nivelProximo == null;
      if (!prox.hidden) prox.textContent = `Vale a partir da próxima mão (agora ${e.small}/${e.big})`;
    }
    this.$('.pk-v-aposta').textContent = emJogoAgora(e) && e.apostaAtual ? String(e.apostaAtual) : '—';
    this.$('.pk-aviso').textContent = e.aviso || '';
    this.$('.pk-v-saldo').textContent = String(c?.saldo ?? 0);
    // as minhas cartas e o que elas fazem com a mesa
    const cartasEl = this.$('.pk-cartas');
    const chave = M.mao.map(chaveCarta).join(',');
    if (cartasEl.dataset.chave !== chave) {
      cartasEl.dataset.chave = chave;
      cartasEl.innerHTML = M.mao.map((x) => `<img class="nova" src="${urlCarta(x)}" alt="${esc((LETRA[x.n] || x.n) + SIMBOLO[x.s])}">`).join('');
    }
    const jogo = this.$('.pk-jogo');
    const sete = [...M.mao, ...e.comunitarias];
    jogo.hidden = M.mao.length < 2 || c?.l.fold;
    if (!jogo.hidden) {
      if (sete.length >= 5) jogo.textContent = avaliarMao(sete).nome;
      else jogo.textContent = M.mao[0].n === M.mao[1].n ? 'Par na mão' : M.mao[0].s === M.mao[1].s ? 'Mesmo naipe' : 'Carta alta';
    }
    // os botões
    const emJogo = e.fase !== 'espera' && e.fase !== 'showdown';
    const vez = !!c?.l.vez;
    const decide = emJogo && c && !c.l.fold && !c.l.allIn && !c.l.fora;
    const b = (k) => this.$(`[data-pk="${k}"]`);
    b('comecar').hidden = e.fase !== 'espera';
    for (const k of ['fold', 'call', 'raise', 'allin']) {
      b(k).hidden = !decide;
      b(k).disabled = !vez;
    }
    this.$('.pk-raise').hidden = !decide;
    if (decide) {
      b('call').firstChild.textContent = c.precisa > 0 ? `Pagar ${Math.min(c.precisa, c.saldo)}` : 'Passar';
      b('fold').hidden = !decide;
      const podeAumentar = c.max > e.apostaAtual && c.saldo > c.precisa;
      b('raise').disabled = !vez || !podeAumentar;
      this.barra.disabled = !vez || !podeAumentar;
      this.barra.min = String(c.min);
      this.barra.max = String(c.max);
      if (!vez || Number(this.barra.value) < c.min || Number(this.barra.value) > c.max) this.barra.value = String(c.min);
      this.mostrarRaise();
      this.$('.pk-v-allin').textContent = String(c.saldo);
    }
    const espera = this.$('.pk-espera');
    let txt = '';
    if (e.fase === 'espera') txt = '';
    else if (e.fase === 'showdown') txt = 'Próxima mão já já…';
    else if (c?.l.fora) txt = 'Você entra na próxima mão';
    else if (c?.l.fold) txt = 'Você desistiu desta mão';
    else if (c?.l.allIn) txt = 'Você está all-in: torcendo…';
    else if (!vez) {
      const quem = e.lugares.find((l) => l?.vez);
      txt = quem ? `Vez de ${quem.nome}…` : '';
    }
    espera.textContent = txt;
    espera.hidden = !txt;
    // o resultado da mão
    const banner = this.$('.pk-banner');
    const res = e.fase === 'showdown' ? e.resultado : null;
    banner.hidden = !res?.vencedores?.length;
    if (res?.vencedores?.length) {
      const chaveB = `${e.mao}`;
      if (banner.dataset.chave !== chaveB) {
        banner.dataset.chave = chaveB;
        const v = res.vencedores;
        const nomes = v.map((x) => (x.lugar === M.lugar ? 'Você' : x.nome)).join(' e ');
        const ganhei = v.some((x) => x.lugar === M.lugar);
        banner.innerHTML = `${ganhei ? '🏆 ' : ''}${esc(nomes)} ${v.length > 1 ? 'dividem' : ganhei && v.length === 1 ? 'ganhou' : 'levou'} ${res.pote} fichas${v[0].mao ? `<small>${esc(v[0].mao)}</small>` : '<small>todos desistiram</small>'}`;
      }
    }
    this.desenharAssentos(M, e);
  }

  desenharAssentos(M, e) {
    const vencedores = new Set(e.fase === 'showdown' ? (e.resultado?.vencedores || []).map((v) => v.lugar) : []);
    const maos = new Map((e.fase === 'showdown' ? e.resultado?.maos || [] : []).map((x) => [x.lugar, x.mao]));
    this.$('.pk-assentos').innerHTML = e.lugares.map((l, k) => {
      if (!l) return `<div data-lugar="${k}"><span class="vazio">Lugar livre</span></div>`;
      const coroa = e.dono && l.id === e.dono ? '<span class="coroa" title="Dono da mesa">👑</span>' : '';
      const classes = [l.vez && 'vez', k === M.lugar && 'eu', l.fold && 'fold', vencedores.has(k) && 'ganhou'].filter(Boolean).join(' ');
      const nome = k === M.lugar ? 'Você' : `${l.robo ? '🤖 ' : ''}${l.nome}`;
      const fichas = l.robo ? '∞ fichas' : `${l.saldo ?? 0} fichas`;
      const estado = l.fora ? 'próxima mão' : l.fold ? 'desistiu' : '';
      // o que apostou nesta rodada (em destaque) e o total que já pôs nesta mão
      const lance = l.aposta && !l.fora ? `<div class="lance"><i></i>apostou ${l.aposta}</div>` : '';
      const total = l.total && !l.fora && e.fase !== 'espera' ? `<div class="total">${l.total} na mão</div>` : '';
      const mini = l.mao?.length ? `<div class="mini">${l.mao.map((x) => `<img src="${urlCarta(x)}" alt="">`).join('')}</div>` : '';
      const jogo = maos.has(k) ? `<div class="jogo">${esc(maos.get(k))}</div>` : '';
      return `<div data-lugar="${k}" class="${classes}">
        ${coroa}${l.dealer ? '<span class="selo">D</span>' : ''}${l.allIn ? '<span class="selo allin">ALL-IN</span>' : ''}
        <div class="nome" style="${l.cor && k !== M.lugar ? `color:${esc(l.cor)}` : ''}">${esc(nome)}</div>
        <div class="fichas">${fichas}</div>
        ${estado ? `<div class="aposta">${esc(estado)}</div>` : ''}${lance}${total}${mini}${jogo}
        ${l.vez ? '<div class="tempo"><i></i></div>' : ''}
      </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- quadro a quadro
  update(dt = 0.016, t = performance.now() / 1000) {
    const p = this.player.pos;
    for (const M of this.mesas) {
      const perto = this.ativa === M || Math.hypot(p.x - M.m.x, p.z - M.m.z) < 45;
      if (perto && M.e) this.anima3d(M, dt, t);
      for (const r of M.robos) {
        if (!r) continue;
        r.av.update(dt, t);
        r.av.tag.sprite.visible = this.ativa !== M;
      }
    }
    if (this.ativa) {
      this.posicionarAssentos(this.ativa);
      // o tempo da vez correndo
      const M = this.ativa;
      const barra = this.$('.pk-assentos .vez .tempo i');
      if (barra && M.e?.prazoTotal) {
        const resta = Math.max(0, M.e.prazo - (performance.now() - M.recebidoEm));
        barra.style.width = `${(resta / M.e.prazoTotal) * 100}%`;
      }
    }
  }

  // as plaquinhas seguem as cadeiras na tela
  posicionarAssentos(M) {
    const cam = this.world.camera;
    const v = this._v ||= new THREE.Vector3();
    const w = innerWidth;
    const h = innerHeight;
    for (const el of this.$('.pk-assentos').children) {
      const k = Number(el.dataset.lugar);
      // a minha plaquinha fica de fora: as minhas fichas e cartas estão embaixo
      if (k === M.lugar) {
        el.style.visibility = 'hidden';
        continue;
      }
      const c = cadeira(M.m, k);
      v.set(c.x, 1.9, c.z).project(cam);
      if (v.z > 1) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      // a plaquinha fica pendurada acima do ponto: não sobe para fora da tela nem cobre o painel do pote
      const y = Math.min(h - 220, Math.max(el.offsetHeight + 60, ((1 - v.y) / 2) * h));
      const x = Math.min(w - 80, Math.max(y < 360 ? 370 : 80, ((v.x + 1) / 2) * w));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  apertou() { return false; }

  soltou() {}

  ativo() { return false; }

  dica(livre) {
    if (!livre) return '';
    const M = this.mesaPerto();
    if (!M || !this.ligado()) return '';
    const gente = M.e?.lugares.filter((l) => l && !l.robo).length || 0;
    return `<kbd>E</kbd>Sentar na mesa de poker${gente ? ` (${gente} ${gente === 1 ? 'pessoa' : 'pessoas'})` : ''} · mín. ${M.e?.minimoMesa ?? MINIMO_MESA} moedas`;
  }

  lugar() {
    const m = MESAS_POKER[0];
    return { nome: 'Poker', desc: "Texas Hold'em valendo as suas moedas · com robôs", cor: '#16a34a', pos: [m.x, 0, m.z - B_MESA - FORA - 1.1], yaw: Math.PI };
  }
}
