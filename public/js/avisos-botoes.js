// Acha na imagem do jogo os avisos de botão do PS5 (o GTA e outros põem um círculo branco com o símbolo
// escuro dentro: ✕ ○ □ △, e R/L dos analógicos; e a placa de L1 R1 L2 R2) para o /jogar mostrar em cima a tecla do
// teclado que faz aquele botão (mapa-teclas.js). Roda num worker (avisos-botoes-worker.js) sobre uma cópia
// pequena do quadro; aqui fica só a conta, sem nada do navegador, para o teste rodar no Node.
//
// Como acha: (1) os pixels claros e sem cor (o branco do círculo); (2) as manchas desses pixels com
// tamanho de ícone e caixa quase quadrada; (3) é um disco: o anel a 0,88 do raio é quase todo claro e o
// anel a 1,3 do raio quase não é; (4) tem um símbolo escuro dentro, comparado (correlação numa grade
// 12×12) com os desenhos de cada símbolo feitos aqui (proporções medidas em prints do GTA 6). Poste,
// farol e letra de texto caem no (3) ou no (4).

// o R e o L no círculo são os analógicos (mexer a câmera / andar), não o afundar: no teclado, o mouse e o WASD
export const SIMBOLOS = { xis: 'b0', bola: 'b1', quadrado: 'b2', triangulo: 'b3', L: 'andar', R: 'olhar', L1: 'b4', R1: 'b5', L2: 'b6', R2: 'b7' };

const N = 12; // a grade do símbolo
const LADO = 0.8; // a grade cobre [-LADO, LADO] × raio em volta do centro
const DENTRO = 0.92; // células fora deste raio (o fundo atrás do disco) não entram na comparação
const MIN_D = 11, MAX_D = 90; // diâmetro do disco em pixels da imagem analisada
const MIN_SCORE = 0.72; // correlação mínima com o símbolo
const MIN_MARGEM = 0.1; // e à frente do segundo símbolo por pelo menos isto
const MIN_PLACA = 0.85; // a placa de L1/R1/L2/R2: medida num print só de cada, então bem parecida

// distância do ponto ao segmento
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const linhas = (pts, fechar = false) => {
  const s = [];
  for (let i = 0; i < pts.length - (fechar ? 0 : 1); i++) s.push([...pts[i], ...pts[(i + 1) % pts.length]]);
  return s;
};
// os símbolos em unidades do raio do disco (y para baixo): segmentos e meia espessura do traço
const FORMAS = {
  xis: { segs: [[-0.5, -0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, -0.5]], e: 0.15 },
  triangulo: { segs: linhas([[0, -0.58], [0.66, 0.5], [-0.66, 0.5]], true), e: 0.13 },
  quadrado: { segs: linhas([[-0.46, -0.46], [0.46, -0.46], [0.46, 0.46], [-0.46, 0.46]], true), e: 0.12 },
  bola: { anel: 0.5, e: 0.13 },
  R: {
    segs: [[-0.3, -0.5, -0.3, 0.5], ...linhas([[-0.3, -0.5], [0.05, -0.5], [0.24, -0.4], [0.3, -0.25], [0.24, -0.1], [0.05, 0], [-0.3, 0]]), [0.02, 0, 0.3, 0.5]],
    e: 0.12,
  },
  L: { segs: [[-0.22, -0.5, -0.22, 0.5], [-0.22, 0.5, 0.28, 0.5]], e: 0.12 },
  // não é ícone: o miolo escuro e redondo de uma letra o/O do texto (anel branco grosso em volta). Se o
  // melhor for este, a mancha é descartada
  nada: { anel: 0, e: 0.5 },
};
const dentro = (i, j) => {
  const x = ((i + 0.5) / N * 2 - 1) * LADO, y = ((j + 0.5) / N * 2 - 1) * LADO;
  return Math.hypot(x, y) <= DENTRO;
};
// normaliza (tira a média e divide pela norma) só nas células de dentro
function normalizar(v) {
  let s = 0, n = 0;
  for (let k = 0; k < N * N; k++) if (dentro(k % N, (k / N) | 0)) { s += v[k]; n++; }
  const m = s / n;
  let q = 0;
  for (let k = 0; k < N * N; k++) if (dentro(k % N, (k / N) | 0)) { v[k] -= m; q += v[k] * v[k]; } else v[k] = 0;
  const z = Math.sqrt(q) || 1;
  for (let k = 0; k < N * N; k++) v[k] /= z;
  return v;
}
// a grade de cada símbolo desenhado: quanto de cada célula o traço cobre (4×4 amostras por célula)
function desenhado(f) {
  const v = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let c = 0;
    for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
      const x = ((i + (a + 0.5) / 4) / N * 2 - 1) * LADO, y = ((j + (b + 0.5) / 4) / N * 2 - 1) * LADO;
      const d = f.pred ? (f.pred(x, y) ? 0 : 1) : f.anel != null ? Math.abs(Math.hypot(x, y) - f.anel) : Math.min(...f.segs.map((s) => distSeg(x, y, ...s)));
      if (d <= f.e) c++;
    }
    v[j * N + i] = c / 16;
  }
  return v;
}
// Os medidos em prints do GTA 6 (a grade() de cada ícone, de 0 a 9 por célula): o ✕ do menu de
// interação, o ✕ pequeno do aviso de segurar (com o anel de progresso), o △, o □ grande e o R do
// analógico direito. Valem mais que os desenhados: são o desenho de verdade, já com o borrado do vídeo.
const MEDIDOS = {
  xis: [
    '830000000039216100002503059710028920017971289500001797895000000189960000000289971000002895797100028950179710069510017940224000001513820000000038',
    '310000000027101100011002002530252001001683771000000388940000000179710000000179820000000595960000002861582000002420142001110100011003310010000138',
  ],
  triangulo: ['610026610016100069950001000399993000001795697100004971289400028930049810169600017950399301113992799777778996699999999995223333333322610000000015'],
  // o ○ grande (anel escuro grosso com o miolo branco): sem ele saía como o □ grande
  bola: ['721134421048204799986104048976689720288411137950596100003882793000001793793000001793694000002882388300015961159864479820115899997302411356642027'],
  // o □ grande do aviso de segurar (entrar no carro), traço grosso quase até a borda
  quadrado: ['720000010028268788888852089999999960188222224960188000003960188000003960088000003970088000003960088322224960089999999960168888888842610000000028'],
  // o L de empurrar o analógico (com o tracinho e o arco do lado para onde empurrar)
  L: ['730000000027300010000002000143000000000287100022000297100067000297100179000297100179000298321156000289884111000156663000200011110002730000000026'],
  R: ['400000000016000111100001000588862000001798896100001793498100001798896000000798992000001794793000000782397100000341144100100000000002610000000027'],
};
// os do anel vazado: os desenhados (os medidos são do disco branco do GTA) e o □ do The Last of Us (medido no
// print de "Largar": o contorno de 0,45 a 0,57 do raio e um quadrado cheio menor, até 0,28, no meio)
const dentroTri = (x, y, k) => y <= 0.5 * k && y >= -0.6 * k + (Math.abs(x) / (0.68 * k)) * 1.1 * k;
const FORMAS_ANEL = {
  ...FORMAS,
  quadrado2: { nome: 'quadrado', segs: linhas([[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]], true), e: 0.1 },
  quadrado3: { nome: 'quadrado', pred: (x, y) => { const m = Math.max(Math.abs(x), Math.abs(y)); return m <= 0.28 || (m >= 0.45 && m <= 0.57); }, e: 0 },
  triangulo2: { nome: 'triangulo', pred: (x, y) => dentroTri(x, y, 1), e: 0 },
};
const MODELOS_ANEL = Object.entries(FORMAS_ANEL).map(([nome, f]) => ({ nome: f.nome || nome, v: normalizar(desenhado(f)) }));
const deTexto = (t) => Float32Array.from(t, (c) => +c / 9);
const MODELOS = [
  ...Object.entries(FORMAS).map(([nome, f]) => ({ nome, v: normalizar(desenhado(f)) })),
  ...Object.entries(MEDIDOS).flatMap(([nome, lista]) => lista.map((t) => ({ nome, v: normalizar(deTexto(t)) }))),
];

// claro e sem cor: o branco do disco (o vídeo comprimido o deixa entre 200 e 250 no GTA; o The Last of Us
// põe o disco meio transparente, ~180, e no vídeo ao vivo ele caía abaixo de 170 e o aviso sumia)
const BRANCO_MIN = 120;
const claro = (d, i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  return mn > BRANCO_MIN && mx - mn < 50;
};
const lum = (d, i) => (d[i] * 2 + d[i + 1] * 5 + d[i + 2]) / 8;

// a fração do anel de raio rr em volta de (cx, cy) que é clara
function anelClaro(img, cx, cy, rr, n = 40) {
  const { width: W, height: H, data: d } = img;
  let sim = 0, tot = 0;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    tot++;
    if (claro(d, (y * W + x) * 4)) sim++;
  }
  return tot ? sim / tot : 0;
}

// o símbolo dentro do disco: a grade de escuridão (0 = branco do disco, 1 = bem escuro)
function grade(img, cx, cy, r) {
  const { width: W, height: H, data: d } = img;
  // o branco de referência: a mediana do anel a 0,88 do raio
  const ref = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r * 0.88), y = Math.round(cy + Math.sin(a) * r * 0.88);
    if (x >= 0 && y >= 0 && x < W && y < H) ref.push(lum(d, (y * W + x) * 4));
  }
  ref.sort((a, b) => a - b);
  const branco = ref[ref.length >> 1] || 230;
  const faixa = Math.max(60, branco * 0.75);
  const v = new Float32Array(N * N);
  const amostra = (x, y) => {
    // bilinear na luminância
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const px = (xx, yy) => lum(d, (Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))) * 4);
    return px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const x = cx + ((i + (a + 0.5) / 3) / N * 2 - 1) * LADO * r, y = cy + ((j + (b + 0.5) / 3) / N * 2 - 1) * LADO * r;
      s += Math.max(0, Math.min(1, (branco - amostra(x, y)) / faixa));
    }
    v[j * N + i] = s / 9;
  }
  return v;
}

// Os ombros e gatilhos (L1 R1 L2 R2) não vêm num disco: é uma placa branca quase quadrada (um lado reto e o
// outro arredondado) com o nome escuro. A grade cobre a caixa da placa e é comparada com as medidas em prints
// do GTA 6 (MEDIDOS_PLACA); só a de cima e por boa margem vale (L1 e R1 diferem numa letra).
const MEDIDOS_PLACA = {
  L1: ['122122222211000000000000000620046000001930389000001930699100001930249100001930039000001930039000101965549101400888838004810222212019971000000289'],
  R1: ['000000000000000000000000006665004600009879439910009418969910009769833910009999203910009578003910109439203911509318803915923102301329984000000489'],
  L2: ['983000001389710000000028100000001003068000599810068001964940068000101940068000028700068221288320069995999960012220211110000000000000000000000000'],
  R2: ['983000001399710000000028200000001003099980089940095486683870095396010770099970005930093780069630093095699991020011111110000000000000000000000000'],
};
const MODELOS_PLACA = Object.entries(MEDIDOS_PLACA).flatMap(([nome, lista]) => lista.map((t) => ({ nome, v: normalizarTudo(deTexto(t)) })));
function normalizarTudo(v) {
  let m = 0;
  for (const x of v) m += x;
  m /= v.length;
  let q = 0;
  for (let k = 0; k < v.length; k++) { v[k] -= m; q += v[k] * v[k]; }
  const z = Math.sqrt(q) || 1;
  for (let k = 0; k < v.length; k++) v[k] /= z;
  return v;
}
function gradePlaca(img, x0, y0, w, h) {
  const { width: W, data: d } = img;
  // o branco da placa: o claro de verdade dela (85% dos pixels abaixo), não 235 fixo — no vídeo mais escuro
  // (o The Last of Us, a TV em modo limitado) a placa toda parecia tinta
  const ls = [];
  for (let y = y0; y < y0 + h; y += 2) for (let x = x0; x < x0 + w; x += 2) ls.push(lum(d, (y * W + x) * 4));
  ls.sort((a, b) => a - b);
  const branco = Math.min(235, Math.max(150, ls[Math.floor(ls.length * 0.85)] ?? 235)), faixa = branco * 0.745;
  const v = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, n = 0;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const x = Math.min(x0 + w - 1, Math.round(x0 + ((i + (a + 0.5) / 3) / N) * w - 0.5)), y = Math.min(y0 + h - 1, Math.round(y0 + ((j + (b + 0.5) / 3) / N) * h - 0.5));
      s += Math.max(0, Math.min(1, (branco - lum(d, (y * W + x) * 4)) / faixa));
      n++;
    }
    v[j * N + i] = s / n;
  }
  return v;
}
export function medirPlaca(img, x0, y0, w, h) {
  return Array.from(gradePlaca(img, x0, y0, w, h), (x) => Math.round(x * 9)).join('');
}
// a placa da caixa (x0, y0, w, h)? { nome, c, seg } ou null
function placa(img, x0, y0, w, h) {
  if (!MODELOS_PLACA.length || h < w * 0.7 || h > w * 1.25) return null;
  // logo em volta da caixa (2–3 px fora) é fundo: não é um pedaço de algo branco maior
  const { width: W, height: H, data: d } = img;
  const fora = Math.max(2, Math.round(w * 0.1));
  let sim = 0, tot = 0;
  const olhar = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    tot++;
    if (claro(d, (y * W + x) * 4)) sim++;
  };
  for (let k = 0; k <= 20; k++) {
    const x = Math.round(x0 - fora + ((w + 2 * fora) * k) / 20), y = Math.round(y0 - fora + ((h + 2 * fora) * k) / 20);
    olhar(x, y0 - fora); olhar(x, y0 + h - 1 + fora); olhar(x0 - fora, y); olhar(x0 + w - 1 + fora, y);
  }
  if (!tot || sim / tot > 0.25) return null;
  const v = gradePlaca(img, x0, y0, w, h);
  const t = v.reduce((a, b) => a + b, 0) / v.length;
  if (t < 0.12 || t > 0.5) return null;
  normalizarTudo(v);
  const por = {};
  for (const m of MODELOS_PLACA) {
    let c = 0;
    for (let k = 0; k < v.length; k++) c += v[k] * m.v[k];
    if (!(c <= por[m.nome])) por[m.nome] = c;
  }
  const ord = Object.entries(por).sort((a, b) => b[1] - a[1]);
  return { nome: ord[0][0], c: ord[0][1], seg: ord[1]?.[1] ?? 0 };
}

// Para onde empurrar o analógico (L e R): o jogo põe um tracinho claro fora do disco, do lado da direção
// (e um arco atrás dele). Compara o brilho na linha daquele lado (de 1,15 a 1,8 do raio) com o brilho logo
// ao lado dela (o fundo): o tracinho destoa. null: sem direção clara (empurrar para qualquer lado).
export const DIRECOES = { dir: 0, baixo: Math.PI / 2, esq: Math.PI, cima: -Math.PI / 2 };
function direcao(img, cx, cy, r) {
  const { width: W, height: H, data: d } = img;
  const lumEm = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    return x < 0 || y < 0 || x >= W || y >= H ? null : lum(d, (y * W + x) * 4);
  };
  const media = (ang) => {
    let s = 0, n = 0;
    for (let k = 0; k <= 8; k++) {
      const v = lumEm(cx + Math.cos(ang) * r * (1.15 + k * 0.08), cy + Math.sin(ang) * r * (1.15 + k * 0.08));
      if (v != null) { s += v; n++; }
    }
    return n ? s / n : null;
  };
  let melhor = null, seg = 0;
  for (const [nome, ang] of Object.entries(DIRECOES)) {
    const no = media(ang), lados = [media(ang - 0.45), media(ang + 0.45)].filter((v) => v != null);
    if (no == null || !lados.length) continue;
    const c = no - lados.reduce((a, b) => a + b, 0) / lados.length;
    if (!melhor || c > melhor.c) { seg = melhor ? Math.max(seg, melhor.c) : seg; melhor = { nome, c }; } else seg = Math.max(seg, c);
  }
  return melhor && melhor.c > 30 && melhor.c - seg > 15 ? melhor.nome : null;
}

// a escuridão média das células de dentro (quanto símbolo tem no disco)
function tinta(v) {
  let s = 0, n = 0;
  for (let k = 0; k < N * N; k++) if (dentro(k % N, (k / N) | 0)) { s += v[k]; n++; }
  return s / n;
}

// a grade de um ícone já achado, em texto (para guardar em MEDIDOS)
export function medir(img, cx, cy, r) {
  return Array.from(grade(img, cx, cy, r), (x) => Math.round(x * 9)).join('');
}

// img: { width, height, data (RGBA) }. Devolve [{ simbolo, id (o botão do mapa-teclas, ou 'andar'/'olhar'),
// dir (L e R: para onde empurrar, se o jogo mostra), x, y, r, score }]
// com x, y, r em frações da largura/altura da imagem.
export function detectar(img, { minScore = MIN_SCORE, minMargem = MIN_MARGEM } = {}) {
  const { width: W, height: H, data: d } = img;
  // os claros numa passada só (vis: 0 escuro, 1 claro, 2 já visto)
  const vis = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r <= BRANCO_MIN || g <= BRANCO_MIN || b <= BRANCO_MIN) continue;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (mx - mn < 50) vis[p] = 1;
  }
  const pilha = new Int32Array(W * H);
  const achados = [];
  // 1) as manchas claras (pinta cada uma inteira para não voltar nela); as grandes demais ficam de fora
  const pedacos = [];
  for (let s = 0; s < W * H; s++) {
    if (vis[s] !== 1) continue;
    let topo = 0, cnt = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    pilha[topo++] = s;
    vis[s] = 2;
    while (topo) {
      const p = pilha[--topo];
      cnt++;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && vis[p - 1] === 1) { vis[p - 1] = 2; pilha[topo++] = p - 1; }
      if (x < W - 1 && vis[p + 1] === 1) { vis[p + 1] = 2; pilha[topo++] = p + 1; }
      if (y > 0 && vis[p - W] === 1) { vis[p - W] = 2; pilha[topo++] = p - W; }
      if (y < H - 1 && vis[p + W] === 1) { vis[p + W] = 2; pilha[topo++] = p + W; }
    }
    if (cnt < 3 || x1 - x0 >= MAX_D || y1 - y0 >= MAX_D) continue;
    pedacos.push({ x0, y0, x1, y1, cnt });
  }
  // 2) Pequeno, o símbolo corta o disco em pedaços (o ✕ em quatro, a base do △ separa a de baixo): os
  // pedaços cheios que se encostam (até 4 px: o traço grosso do □ grande) formam um candidato a mais. Anel (o de segurar) é vazado e
  // não entra, senão engoliria o disco.
  const pai = pedacos.map((_, i) => i);
  const raiz = (i) => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const cheio = (q) => q.cnt / ((q.x1 - q.x0 + 1) * (q.y1 - q.y0 + 1)) >= 0.35;
  const ordem = pedacos.map((_, i) => i).filter((i) => cheio(pedacos[i])).sort((i, j) => pedacos[i].x0 - pedacos[j].x0);
  for (let a = 0; a < ordem.length; a++) {
    const p = pedacos[ordem[a]];
    for (let b = a + 1; b < ordem.length && pedacos[ordem[b]].x0 <= p.x1 + 4; b++) {
      const q = pedacos[ordem[b]];
      if (q.y0 <= p.y1 + 4 && p.y0 <= q.y1 + 4) pai[raiz(ordem[a])] = raiz(ordem[b]);
    }
  }
  const grupos = new Map();
  for (const i of ordem) {
    const k = raiz(i), q = pedacos[i], g = grupos.get(k);
    if (!g) grupos.set(k, { ...q, n: 1 });
    else Object.assign(g, { x0: Math.min(g.x0, q.x0), y0: Math.min(g.y0, q.y0), x1: Math.max(g.x1, q.x1), y1: Math.max(g.y1, q.y1), cnt: g.cnt + q.cnt, n: g.n + 1 });
  }
  const candidatos = [...pedacos, ...[...grupos.values()].filter((g) => g.n > 1)];
  for (const { x0, y0, x1, y1, cnt } of candidatos) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < MIN_D || h < MIN_D || w > MAX_D || h > MAX_D) continue;
    const preench = cnt / (w * h);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = (w + h) / 4;
    // a placa de L1/R1/L2/R2 (mais cheia que o disco: só o nome escuro dentro)
    if (preench >= 0.5 && preench <= 0.9) {
      const p = placa(img, x0, y0, w, h);
      if (p && p.c >= MIN_PLACA && p.c - p.seg >= 0.08) {
        if (globalThis.__avisosPlaca) globalThis.__avisosPlaca(p, x0, y0, w, h);
        if (!achados.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < r)) {
          achados.push({ cx, cy, rp: r, simbolo: p.nome, id: SIMBOLOS[p.nome], x: cx / W, y: cy / H, r: r / H, score: +p.c.toFixed(3), margem: +(p.c - p.seg).toFixed(3) });
        }
        continue;
      }
    }
    if (Math.abs(w - h) > Math.max(w, h) * 0.2) continue; // o disco é redondo (a placa pode ser mais larga)
    if (preench < 0.3 || preench > 0.8) continue; // disco cheio (sem símbolo) dá ~0,78 ou mais
    if (anelClaro(img, cx, cy, r * 0.88) < 0.8) continue;
    // (a letra O do texto cai no modelo 'nada'; o anel a 0,78 que a barrava também barrava o ○ grande)
    if (anelClaro(img, cx, cy, r * 1.3) > 0.35) continue;
    const v = grade(img, cx, cy, r);
    const t = tinta(v);
    if (t < 0.12 || t > 0.65) continue;
    normalizar(v);
    // a melhor de cada símbolo; a margem é para o segundo símbolo (não para o outro tamanho do mesmo)
    const por = {};
    for (const m of MODELOS) {
      let c = 0;
      for (let k = 0; k < N * N; k++) c += v[k] * m.v[k];
      if (!(c <= por[m.nome])) por[m.nome] = c;
    }
    const ord = Object.entries(por).sort((a, b) => b[1] - a[1]);
    const melhor = { nome: ord[0][0], c: ord[0][1] }, seg = ord[1][1];
    if (melhor.nome === 'nada' || melhor.c < minScore || melhor.c - seg < minMargem) continue;
    // o ○ tem o miolo branco; a letra o do texto (legendas), escuro. E o vão entre letras de legenda às vezes
    // desenha um anel com ponto (0,83–0,89 nos prints): o ○ pede mais parecença
    if (melhor.nome === 'bola' && melhor.c < 0.9) continue;
    if (melhor.nome === 'bola') {
      let claros = 0;
      for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) if (claro(d, (Math.round(cy + dy * r) * W + Math.round(cx + dx * r)) * 4)) claros++;
      if (claros < 3) continue;
    }
    // o mesmo disco achado inteiro e em pedaços: fica o de maior correlação
    const igual = achados.findIndex((o) => Math.hypot(o.cx - cx, o.cy - cy) < r);
    if (igual >= 0) { if (achados[igual].score >= melhor.c) continue; achados.splice(igual, 1); }
    const dir = melhor.nome === 'L' || melhor.nome === 'R' ? direcao(img, cx, cy, r) : null;
    achados.push({ cx, cy, rp: r, simbolo: melhor.nome, id: SIMBOLOS[melhor.nome], ...(dir ? { dir } : {}), x: cx / W, y: cy / H, r: r / H, score: +melhor.c.toFixed(3), margem: +(melhor.c - seg).toFixed(3) });
  }
  aneis(img, achados, minScore, minMargem);
  return achados.map(({ cx, cy, rp, ...a }) => a);
}

// O outro jeito de ícone (The Last of Us e outros, na lista de ações do canto): um anel fino cinza ou branco,
// vazado, com o símbolo também em traço claro sobre o fundo escuro (o □ de "Largar"). Acha os anéis (manchas
// acesas, redondas e ocas) e compara a grade de claridade de dentro (o anel apagado) com os mesmos símbolos.
const ACESO_MIN = 72; // o anel apagado vem ~115 no print e ~80 depois de reduzido
function aneis(img, achados, minScore, minMargem) {
  const { width: W, height: H, data: d } = img;
  const vis = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r < ACESO_MIN || g < ACESO_MIN || b < ACESO_MIN) continue;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (mx - mn < 40) vis[p] = 1;
  }
  const L = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    return x < 0 || y < 0 || x >= W || y >= H ? null : lum(d, (y * W + x) * 4);
  };
  const mediana = (cx, cy, rr, n = 32) => {
    const v = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, l = L(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      if (l != null) v.push(l);
    }
    v.sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : null;
  };
  const pilha = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (vis[s] !== 1) continue;
    let topo = 0, cnt = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    pilha[topo++] = s;
    vis[s] = 2;
    while (topo) {
      const p = pilha[--topo];
      cnt++;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && vis[p - 1] === 1) { vis[p - 1] = 2; pilha[topo++] = p - 1; }
      if (x < W - 1 && vis[p + 1] === 1) { vis[p + 1] = 2; pilha[topo++] = p + 1; }
      if (y > 0 && vis[p - W] === 1) { vis[p - W] = 2; pilha[topo++] = p - W; }
      if (y < H - 1 && vis[p + W] === 1) { vis[p + W] = 2; pilha[topo++] = p + W; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 14 || h < 14 || w > MAX_D || h > MAX_D || Math.abs(w - h) > Math.max(w, h) * 0.15) continue;
    // oco: só o anel (às vezes com o símbolo encostado), longe de um disco cheio
    if (cnt / (w * h) > 0.5) continue;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = (w + h) / 4;
    if (achados.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < Math.max(r, o.rp))) continue; // já achado como disco ou placa
    // o anel aceso por inteiro na borda, e o fundo escuro dentro (entre o anel e o símbolo) e fora
    let acesos = 0, tot = 0;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      let m = 0;
      for (const f of [0.86, 0.93, 1]) m = Math.max(m, L(cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f) ?? 0);
      tot++;
      if (m >= ACESO_MIN) acesos++;
    }
    if (acesos / tot < 0.85) continue;
    const anelL = mediana(cx, cy, r * 0.95), fora = mediana(cx, cy, r * 1.35), vao = mediana(cx, cy, r * 0.76);
    if (anelL == null || fora == null || vao == null || anelL - fora < 45 || anelL - vao < 35) continue;
    // a grade de claridade (0 = fundo, 1 = o cinza do anel); o próprio anel (de 0,84 r para fora) não entra
    const fundo = (fora + vao) / 2, faixa = Math.max(30, anelL - fundo);
    const v = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sm = 0;
      for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
        const u = ((i + (a + 0.5) / 3) / N * 2 - 1) * LADO, z = ((j + (b + 0.5) / 3) / N * 2 - 1) * LADO;
        if (Math.hypot(u, z) > 0.84) continue;
        sm += Math.max(0, Math.min(1, ((L(cx + u * r, cy + z * r) ?? fundo) - fundo) / faixa));
      }
      v[j * N + i] = sm / 9;
    }
    const t = tinta(v);
    if (t < 0.08 || t > 0.6) continue;
    normalizar(v);
    const por = {};
    for (const m of MODELOS_ANEL) {
      let c = 0;
      for (let k = 0; k < N * N; k++) c += v[k] * m.v[k];
      if (!(c <= por[m.nome])) por[m.nome] = c;
    }
    const ord = Object.entries(por).sort((a, b) => b[1] - a[1]);
    const melhor = { nome: ord[0][0], c: ord[0][1] }, seg = ord[1][1];
    if (melhor.nome === 'nada' || melhor.c < minScore || melhor.c - seg < minMargem) continue;
    if (melhor.nome === 'bola' && melhor.c < 0.9) continue;
    if (globalThis.__avisosAnel) globalThis.__avisosAnel(melhor, cx, cy, r);
    achados.push({ cx, cy, rp: r, simbolo: melhor.nome, id: SIMBOLOS[melhor.nome], x: cx / W, y: cy / H, r: r / H, score: +melhor.c.toFixed(3), margem: +(melhor.c - seg).toFixed(3) });
  }
}

// O que está na tela de verdade: um aviso só aparece depois de visto em 2 análises seguidas (no mesmo
// lugar, com o mesmo símbolo) e some depois de 2 sem ele. Evita piscar por um quadro borrado.
export class Rastreio {
  constructor({ entrar = 2, sair = 2 } = {}) {
    this.entrar = entrar;
    this.sair = sair;
    this.itens = []; // { simbolo, id, dir, x, y, r, vistos, faltas }
  }
  // achados de uma análise -> os avisos que devem aparecer agora
  passo(achados) {
    const livres = new Set(achados);
    for (const it of this.itens) {
      let par = null, dist = Infinity;
      for (const a of livres) {
        if (a.simbolo !== it.simbolo) continue;
        const dd = Math.hypot(a.x - it.x, (a.y - it.y));
        if (dd < Math.max(it.r, a.r) * 4 && dd < dist) { par = a; dist = dd; }
      }
      if (par) {
        livres.delete(par);
        Object.assign(it, { x: par.x, y: par.y, r: par.r, dir: par.dir ?? it.dir, vistos: it.vistos + 1, faltas: 0 });
      } else it.faltas++;
    }
    this.itens = this.itens.filter((it) => it.faltas < this.sair);
    for (const a of livres) this.itens.push({ simbolo: a.simbolo, id: a.id, dir: a.dir, x: a.x, y: a.y, r: a.r, vistos: 1, faltas: 0 });
    return this.itens.filter((it) => it.vistos >= this.entrar);
  }
  limpar() { this.itens = []; }
}

// Dentro de um veículo o GTA 6 mostra, logo acima do minimapa, um quadro escuro com a marca e o modelo (duas
// linhas de texto claro centralizadas: "KARIN" / "REBEL (1984)") e, embaixo delas, dois ícones redondos
// escuros: o motor e a gasolina. veiculo() procura os dois jeitos (os ícones às vezes não aparecem bem): true
// é estar no veículo. Só o canto de baixo à esquerda (onde fica o minimapa) é olhado.
export function veiculo(img) {
  return quadroDoCarro(img) || iconesDoCarro(img);
}

// o quadro: duas linhas de texto claro, uma embaixo da outra e com o mesmo centro, num painel escuro e liso
function quadroDoCarro(img) {
  const { width: W, height: H, data: d } = img;
  const xMax = Math.round(W * 0.42), yMin = Math.round(H * 0.4);
  const L = (x, y) => lum(d, (y * W + x) * 4);
  // o texto: claro e sem cor (a marca vem cinza, ~150)
  const texto = (x, y) => {
    const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const mn = Math.min(r, g, b);
    return mn > 115 && Math.max(r, g, b) - mn < 45;
  };
  // 1) as letras: manchas de texto do tamanho de letra
  const vis = new Uint8Array(W * H);
  const pilha = [];
  const letras = [];
  for (let y = yMin; y < H; y++) for (let x = 0; x < xMax; x++) {
    const s = y * W + x;
    if (vis[s] || !texto(x, y)) continue;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
    pilha.push(s);
    vis[s] = 1;
    while (pilha.length) {
      const p = pilha.pop();
      n++;
      const px = p % W, py = (p / W) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      if (px > 0 && !vis[p - 1] && texto(px - 1, py)) { vis[p - 1] = 1; pilha.push(p - 1); }
      if (px < xMax - 1 && !vis[p + 1] && texto(px + 1, py)) { vis[p + 1] = 1; pilha.push(p + 1); }
      if (py > yMin && !vis[p - W] && texto(px, py - 1)) { vis[p - W] = 1; pilha.push(p - W); }
      if (py < H - 1 && !vis[p + W] && texto(px, py + 1)) { vis[p + W] = 1; pilha.push(p + W); }
    }
    const h = y1 - y0 + 1, w = x1 - x0 + 1;
    if (h >= 4 && h <= 30 && w <= h * 1.8 && n >= 4) letras.push({ x0, x1, y0, y1, h });
  }
  // 2) as linhas: letras da mesma altura, na mesma faixa, uma depois da outra
  letras.sort((p, q) => p.x0 - q.x0);
  const linhas = [];
  for (const l of letras) {
    const ln = linhas.find((k) => Math.abs(k.y0 - l.y0) <= k.h * 0.35 && Math.abs(k.h - l.h) <= k.h * 0.35 && l.x0 - k.x1 <= k.h * 1.2 && l.x0 >= k.x1 - 1);
    if (ln) Object.assign(ln, { x1: Math.max(ln.x1, l.x1), y0: Math.min(ln.y0, l.y0), y1: Math.max(ln.y1, l.y1), n: ln.n + 1 });
    else linhas.push({ ...l, n: 1 });
  }
  const boas = linhas.filter((k) => k.n >= 3 && k.x1 - k.x0 >= k.h * 2.5);
  // 3) duas empilhadas e centralizadas, com painel escuro e liso dos lados e em cima
  for (const a of boas) for (const b of boas) {
    if (b === a || b.y0 <= a.y1) continue;
    const h = Math.max(a.h, b.h);
    if (b.y0 - a.y1 > h * 1.5 || Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) > h * 0.8) continue;
    const xs = [Math.round(Math.min(a.x0, b.x0) - h * 2), Math.round(Math.max(a.x1, b.x1) + h * 1.2)];
    let n = 0, escuro = 0, s = 0, s2 = 0;
    for (let y = a.y0 - Math.round(h * 0.8); y <= b.y1; y++) for (const xi of xs) for (let x = xi; x < xi + h * 0.8; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const l = L(x | 0, y);
      n++;
      s += l;
      s2 += l * l;
      if (l < 90) escuro++;
    }
    if (!n) continue;
    const m = s / n;
    if (escuro / n >= 0.9 && Math.sqrt(Math.max(0, s2 / n - m * m)) < 18) return true;
  }
  return false;
}

// os ícones do motor e da gasolina: duas manchas escuras redondas do mesmo tamanho, na mesma altura, com os
// centros a ~2,7 raios, num painel cinza um pouco mais claro e com texto claro logo acima
function iconesDoCarro(img) {
  const { width: W, height: H, data: d } = img;
  const xMax = Math.round(W * 0.5), yMin = Math.round(H * 0.45);
  const L = (x, y) => lum(d, (y * W + x) * 4);
  const vis = new Uint8Array(W * H);
  for (let y = yMin; y < H; y++) for (let x = 0; x < xMax; x++) if (L(x, y) < 58) vis[y * W + x] = 1;
  const pilha = new Int32Array(W * H);
  const discos = [];
  for (let y = yMin; y < H; y++) for (let x = 0; x < xMax; x++) {
    const s = y * W + x;
    if (vis[s] !== 1) continue;
    let topo = 0, cnt = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    pilha[topo++] = s;
    vis[s] = 2;
    while (topo) {
      const p = pilha[--topo];
      cnt++;
      const px = p % W, py = (p / W) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      if (px > 0 && vis[p - 1] === 1) { vis[p - 1] = 2; pilha[topo++] = p - 1; }
      if (px < xMax - 1 && vis[p + 1] === 1) { vis[p + 1] = 2; pilha[topo++] = p + 1; }
      if (py > yMin && vis[p - W] === 1) { vis[p - W] = 2; pilha[topo++] = p - W; }
      if (py < H - 1 && vis[p + W] === 1) { vis[p + W] = 2; pilha[topo++] = p + W; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 8 || h < 8 || w > 70 || h > 70 || Math.abs(w - h) > Math.max(w, h) * 0.2) continue;
    const f = cnt / (w * h);
    if (f < 0.45 || f > 0.82) continue; // disco escuro com o desenho (mais claro) dentro
    discos.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (w + h) / 4 });
  }
  const anel = (c, k) => {
    const v = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, x = Math.round(c.cx + Math.cos(a) * c.r * k), y = Math.round(c.cy + Math.sin(a) * c.r * k);
      if (x >= 0 && y >= 0 && x < W && y < H) v.push(L(x, y));
    }
    v.sort((a, b) => a - b);
    return v[v.length >> 1] ?? 0;
  };
  for (const a of discos) for (const b of discos) {
    if (b.cx <= a.cx) continue;
    const r = (a.r + b.r) / 2, dx = b.cx - a.cx;
    if (Math.abs(a.r - b.r) > r * 0.25 || Math.abs(a.cy - b.cy) > r * 0.3 || dx < r * 2.3 || dx > r * 3.2) continue;
    // o painel em volta: cinza, mais claro que o miolo dos discos
    const painel = (anel(a, 1.35) + anel(b, 1.35)) / 2, miolo = (anel(a, 0.75) + anel(b, 0.75)) / 2;
    if (painel < 45 || painel > 140 || painel - miolo < 8) continue;
    // o nome do carro logo acima (texto claro)
    let claros = 0, tot = 0;
    const ya = Math.max(0, Math.round(a.cy - r * 5)), yb = Math.round(a.cy - r * 1.4);
    const xa = Math.max(0, Math.round(a.cx - r * 3)), xb = Math.min(W - 1, Math.round(b.cx + r * 3));
    for (let y = ya; y < yb; y++) for (let x = xa; x <= xb; x++) { tot++; if (L(x, y) > 150) claros++; }
    if (tot && claros / tot >= 0.02) return true;
  }
  return false;
}
