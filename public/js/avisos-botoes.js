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
export const SIMBOLOS = { xis: 'b0', bola: 'b1', quadrado: 'b2', triangulo: 'b3', L: 'andar', R: 'olhar', L1: 'b4', R1: 'b5', L2: 'b6', R2: 'b7', R3: 'b11' };

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
  bola: ['721134421048204799986104048976689720288411137950596100003882793000001793793000001793694000002882388300015961159864479820115899997302411356642027',
    // o ○ do disco cinza (~100) de "Soltar" no menu de armas: anel escuro com o miolo cinza
    '621367875213215898899731048853236972179410002695387100000397496100000287386100000387288300001596059731124883126987779851412589987411841124431125'],
  // o □ grande do aviso de segurar (entrar no carro), traço grosso quase até a borda
  quadrado: ['720000010028268788888852089999999960188222224960188000003960188000003960088000003970088000003960088322224960089999999960168888888842610000000028',
    // o □ preto no disco cinza de contorno preto ("Zombar")
    '562100000146533333333333269999999982069777667982069311112782069200001782179200001782069200001782069300001782069644445882169999999982346666666652'],
  // o L de empurrar o analógico (com o tracinho e o arco do lado para onde empurrar)
  L: ['730000000027300010000002000143000000000287100022000297100067000297100179000297100179000298321156000289884111000156663000200011110002730000000026'],
  R: ['400000000016000111100001000588862000001798896100001793498100001798896000000798992000001794793000000782397100000341144100100000000002610000000027'],
  // R3 (afundar o analógico direito: "Examinar", o R3 do menu de armas), letras pretas no disco de contorno preto
  R3: [
    '100000000016344311344432899973899950873793259710885882179820899960145960875952621880861785987950530252378510000000001004300000000038951000001599',
    '300000000017222100122222788852788882887894579961873695159830898982068971888961222793873884863893861595799971320132145411100000000004610000000148',
  ],
  // L2 em letras cinza-claras dentro do disco de dentro (o aviso de chamar alguém: "Shirley"), com o contorno da
  // placa em volta das letras
  L2: [
    '853222223479521000000137321000133214353102567523375102667743375101335743375100136622376321477523368654688643234432344323100000000003211111111114',
    '732111123699210000111269220002443138561015787338671025457527671001257427672001475127686535886338466545665339122212222139000000000039433334444579',
    // o disco inteiro (a faixa branca de fora com o anel preto de dentro), quando o de dentro não sai sozinho
    '933899998349359876778944497311113792893100010487972611665279962610236269972610262269982664665279891000000287393222222492439877789825943799997259',
  ],
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
// Os discos são procurados em três passadas, cada uma com o seu "claro": a de sempre; a do branco estrito (o
// disco de contorno preto sobre fundo bege ou de pedra: com 120 o fundo se emendava no disco pelas falhas do
// contorno e a mancha ficava grande demais); e a do cinza (o disco cinza ~100 do ○ de "Soltar", o ✕ cinza).
// (o branco estrito acha a mancha, mas a borda do disco, já misturada com o contorno, fica abaixo dele: os
// anéis de conferência usam o claro de sempre, "anel: 0")
const PASSADAS = [{ min: BRANCO_MIN, croma: 50 }, { min: 200, croma: 30, anel: 0 }, { min: 78, croma: 30 }];
const claroCom = ({ min, croma }) => (d, i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  return mn > min && mx - mn < croma;
};
const claro = claroCom(PASSADAS[0]);
const lum = (d, i) => (d[i] * 2 + d[i + 1] * 5 + d[i + 2]) / 8;

// O contorno escuro do disco (os avisos de contorno preto: o △ sobre a pedra, o □ e o ✕ sobre o bege): logo
// fora da borda (de 0,95 a 1,3 do raio), em quase toda a volta, passa um traço bem mais escuro que o disco.
// Com ele o disco vale mesmo com o fundo claro em volta.
function fracContorno(img, cx, cy, r, branco) {
  const { width: W, height: H, data: d } = img;
  const lim = Math.min(115, branco * 0.6);
  let sim = 0, tot = 0;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    let m = 255;
    for (let f = 0.92; f <= 1.32; f += 0.08) {
      const x = Math.round(cx + c * r * f), y = Math.round(cy + s * r * f);
      if (x >= 0 && y >= 0 && x < W && y < H) m = Math.min(m, lum(d, (y * W + x) * 4));
    }
    tot++;
    if (m < lim) sim++;
  }
  return sim / tot;
}
function contornado(img, cx, cy, r, branco) {
  return fracContorno(img, cx, cy, r, branco) >= 0.85;
}
// No vídeo reduzido o contorno fino se mistura com o fundo e a mancha clara erra o disco (pega um pedaço do
// fundo, ou só o miolo): procura em volta o centro e o raio em que o anel de dentro é claro e o contorno passa
// escuro logo fora. { cx, cy, r } ou null.
function ajustarContorno(img, cx, cy, r, claro) {
  // a busca é cara: só entra a mancha que já tem jeito de contornada (metade da volta escura), e o passo grosso
  // vem primeiro, o fino só em volta do melhor grosso
  if (fracContorno(img, cx, cy, r * 1.05, brancoDo(img, cx, cy, r)) < 0.25) return null;
  const grosso = procurarContorno(img, cx, cy, r, claro, 2, 1, 0.75, 1.3, 0.1);
  if (!grosso || grosso.f < 0.6) return null;
  const fino = procurarContorno(img, grosso.cx, grosso.cy, grosso.r, claro, 0.5, 0.5, 0.92, 1.08, 0.04);
  const melhor = fino && fino.f >= grosso.f ? fino : grosso;
  return melhor.f >= 0.85 ? melhor : null;
}
function procurarContorno(img, cx, cy, r, claro, raio, passo, k0, k1, dk) {
  let melhor = null;
  for (let dy = -raio; dy <= raio; dy += passo) for (let dx = -raio; dx <= raio; dx += passo) {
    const x = cx + dx, y = cy + dy;
    for (let k = k0; k <= k1 + 1e-9; k += dk) {
      const rr = r * k;
      if (rr * 2 < MIN_D - 2) continue;
      if (anelClaro(img, x, y, rr * 0.8, 24, claro) < 0.8) continue;
      const f = fracContorno(img, x, y, rr, brancoDo(img, x, y, rr));
      if (!melhor || f > melhor.f) melhor = { cx: x, cy: y, r: rr, f };
    }
  }
  return melhor;
}

// a fração do anel de raio rr em volta de (cx, cy) que é clara
function anelClaro(img, cx, cy, rr, n = 40, claro = claroCom(PASSADAS[0])) {
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

// o branco de referência do disco: a mediana do anel a 0,88 do raio
function brancoDo(img, cx, cy, r) {
  const { width: W, height: H, data: d } = img;
  const ref = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r * 0.88), y = Math.round(cy + Math.sin(a) * r * 0.88);
    if (x >= 0 && y >= 0 && x < W && y < H) ref.push(lum(d, (y * W + x) * 4));
  }
  ref.sort((a, b) => a - b);
  return ref[ref.length >> 1] || 230;
}

// o símbolo dentro do disco: a grade de escuridão (0 = branco do disco, 1 = bem escuro)
function grade(img, cx, cy, r) {
  const { width: W, height: H, data: d } = img;
  // o símbolo de traço cinza-claro (o L2 dentro do disco, ~195 sobre 250): a faixa vai até o mais escuro de
  // dentro, senão o traço ficava fraco demais para contar (o disco liso continua sem tinta: a faixa mínima)
  const dentroL = [];
  for (let y = Math.round(cy - r * 0.7); y <= cy + r * 0.7; y++) for (let x = Math.round(cx - r * 0.7); x <= cx + r * 0.7; x++) {
    if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x - cx, y - cy) <= r * 0.7) dentroL.push(lum(d, (y * W + x) * 4));
  }
  dentroL.sort((a, b) => a - b);
  const branco = Math.max(brancoDo(img, cx, cy, r), dentroL[Math.floor(dentroL.length * 0.85)] ?? 0);
  const escuro = dentroL[Math.floor(dentroL.length * 0.05)] ?? 0;
  const faixa = Math.max(45, Math.min(Math.max(60, branco * 0.75), branco - escuro));
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
  R1: [
    '000000000000000000000000006665004600009879439910009418969910009769833910009999203910009578003910109439203911509318803915923102301329984000000489',
    // a placa de "Escanear" (dentro de um anel cinza; a caixa da mancha pega um pouco do vão escuro em volta)
    '876666666666200000000000202444101310205999426820206868758820206736756820206999512820206889302820406748502821616615712823952100100237996211111489',
    '866655555556400000000000401333002200403887336700404746658800404877525800404989304700604868204801814625404705953302312429992000000179799877778998',
  ],
  L2: ['983000001389710000000028100000001003068000599810068001964940068000101940068000028700068221288320069995999960012220211110000000000000000000000000'],
  R2: [
    '983000001399710000000028200000001003099980089940095486683870095396010770099970005930093780069630093095699991020011111110000000000000000000000000',
    // a placa de "Zoom" (de cima redondo, dentro de um anel cinza como a do R1 de "Escanear")
    '863000000168710000000015534420024312389896388862387388352683388796110772388783026720386386389873265166488884100000000000100000000000544444444444',
    '794100000288940000000019812210013204559995379942567477674792468787111671569984015921567595169732556257689993501001112212500000000001500000000002',
  ],
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
  const { width: W, height: H } = img;
  const achados = [];
  const pilha = new Int32Array(W * H);
  for (const passada of PASSADAS) discos(img, achados, passada, pilha, minScore, minMargem);
  aneis(img, achados, minScore, minMargem);
  return achados.map(({ cx, cy, rp, ...a }) => a);
}

// os discos claros com o símbolo escuro, com o "claro" de uma das PASSADAS
function discos(img, achados, passada, pilha, minScore, minMargem) {
  const { width: W, height: H, data: d } = img;
  const claro = claroCom(passada), claroAnel = passada.anel != null ? claroCom(PASSADAS[passada.anel]) : claro;
  // os claros numa passada só (vis: 0 escuro, 1 claro, 2 já visto)
  const vis = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) if (claro(d, i)) vis[p] = 1;
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
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = (w + h) / 4;
    // a placa de L1/R1/L2/R2 (mais cheia que o disco: só o nome escuro dentro)
    if (preench >= 0.5 && preench <= 0.9) {
      const p = placa(img, x0, y0, w, h);
      // (borrada pelo vídeo a placa cai para ~0,78, mas segue bem à frente da segunda: vale com margem folgada)
      if (p && ((p.c >= MIN_PLACA && p.c - p.seg >= 0.08) || (p.c >= 0.75 && p.c - p.seg >= 0.15))) {
        if (globalThis.__avisosPlaca) globalThis.__avisosPlaca(p, x0, y0, w, h);
        // a placa dentro do anel também passa por disco (e lá o R2 parecia R3): fica a de maior parecença
        const igual = achados.findIndex((o) => Math.hypot(o.cx - cx, o.cy - cy) < Math.max(r, o.rp));
        if (igual >= 0 && achados[igual].score < p.c) achados.splice(igual, 1);
        if (!achados.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < Math.max(r, o.rp))) {
          achados.push({ cx, cy, rp: r, simbolo: p.nome, id: SIMBOLOS[p.nome], x: cx / W, y: cy / H, r: r / H, score: +p.c.toFixed(3), margem: +(p.c - p.seg).toFixed(3) });
        }
        continue;
      }
    }
    if (Math.abs(w - h) > Math.max(w, h) * 0.2) continue; // o disco é redondo (a placa pode ser mais larga)
    // disco cheio (sem símbolo) dá ~0,78 ou mais; o de contorno escuro com o símbolo cinza-claro (o L2, que passa
    // por claro) vai até 0,92 (o disco liso cai depois, sem tinta)
    if (preench < 0.3 || (preench > 0.8 && (preench > 0.92 || !contornado(img, cx, cy, r, brancoDo(img, cx, cy, r))))) continue;
    // (a letra O do texto cai no modelo 'nada'; o anel a 0,78 que a barrava também barrava o ○ grande)
    if (anelClaro(img, cx, cy, r * 0.88, 40, claroAnel) < 0.8 || (anelClaro(img, cx, cy, r * 1.3, 40, claroAnel) > 0.35 && !contornado(img, cx, cy, r, brancoDo(img, cx, cy, r)))) {
      // o disco de contorno escuro: centro e raio acertados pelo contorno
      const a = ajustarContorno(img, cx, cy, r, claroAnel);
      if (!a) continue;
      ({ cx, cy, r } = a);
    }
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
    const melhor = { nome: ord[0][0], c: ord[0][1] };
    if (melhor.nome === 'nada' || melhor.c < minScore) continue;
    // A margem é para o segundo símbolo de verdade. O 'nada' (o miolo escuro da letra o) fica perto do R e das
    // letras compactas (o R do anel lilás: 0,94 contra 0,88 do 'nada', e caía em metade dos quadros): perto
    // dele só vale com parecença alta
    const outros = ord.filter(([n]) => n !== 'nada'), seg = outros[1]?.[1] ?? 0, nada = por.nada ?? -1;
    if (melhor.c - seg < minMargem || (melhor.c - nada < minMargem && (melhor.c < 0.88 || melhor.c - nada < 0.03))) continue;
    // o ○ tem o miolo branco; a letra o do texto (legendas), escuro. E o vão entre letras de legenda às vezes
    // desenha um anel com ponto (0,83–0,89 nos prints): o ○ pede mais parecença
    if (melhor.nome === 'bola' && melhor.c < 0.9) continue;
    // a placa L1 pequena (16×13 no vídeo) parecia o □: o □ vem num disco, sem a caixa achatada
    if (melhor.nome === 'quadrado' && Math.abs(w - h) > Math.max(w, h) * 0.15) continue;
    if (melhor.nome === 'bola') {
      let claros = 0;
      for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) if (claro(d, (Math.round(cy + dy * r) * W + Math.round(cx + dx * r)) * 4)) claros++;
      if (claros < 3) continue;
    }
    // o mesmo disco achado inteiro e em pedaços: fica o de maior correlação
    const igual = achados.findIndex((o) => Math.hypot(o.cx - cx, o.cy - cy) < Math.max(r, o.rp));
    if (igual >= 0) { if (achados[igual].score >= melhor.c) continue; achados.splice(igual, 1); }
    const dir = melhor.nome === 'L' || melhor.nome === 'R' ? direcao(img, cx, cy, r) : null;
    achados.push({ cx, cy, rp: r, simbolo: melhor.nome, id: SIMBOLOS[melhor.nome], ...(dir ? { dir } : {}), x: cx / W, y: cy / H, r: r / H, score: +melhor.c.toFixed(3), margem: +(melhor.c - seg).toFixed(3) });
  }
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
    return this.visiveis();
  }
  visiveis() { return this.itens.filter((it) => it.vistos >= this.entrar); }
  // o recorte entre análises achou o aviso aqui (só a posição: entrar e sair seguem nas análises inteiras)
  mover(it, x, y) { Object.assign(it, { x, y }); }
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

// O canto de cima à direita do GTA 6 (pedido do usuário em 2026-11-28: o quadro "a pé / no carro" fica logo
// abaixo do ícone da arma quando há arma, e logo abaixo da estrela quando não há). De cima para baixo: as 5
// estrelas (as de procurado claras, as outras só contorno escuro; a da direita sempre clara), às vezes uma fila
// de ícones em disco vermelho (cabide, alfinete, carro), e com arma os números da munição ("6 54", algarismos
// claros) e o desenho da arma (~3 algarismos de altura) embaixo deles.
// hudCanto() devolve { dir, base, arma } em frações da imagem (a borda direita do HUD e onde ele acaba) ou null
// sem a estrela nem a munição. A posição sai sempre da imagem: a altura do HUD muda com o recorte da tela.

// as manchas (4-vizinhas) do retângulo [xa, xb) × [ya, yb) em que teste(i) vale: { x0, x1, y0, y1, n } na imagem
function manchas(img, xa, ya, xb, yb, teste) {
  const { width: W } = img;
  const RW = xb - xa, RH = yb - ya;
  const marca = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (teste(((ya + y) * W + xa + x) * 4)) marca[y * RW + x] = 1;
  const lista = [], pilha = [];
  for (let s0 = 0; s0 < marca.length; s0++) {
    if (marca[s0] !== 1) continue;
    let x0 = RW, y0 = RH, x1 = -1, y1 = -1, n = 0;
    marca[s0] = 2;
    pilha.push(s0);
    while (pilha.length) {
      const p = pilha.pop();
      n++;
      const px = p % RW, py = (p / RW) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      if (px > 0 && marca[p - 1] === 1) { marca[p - 1] = 2; pilha.push(p - 1); }
      if (px < RW - 1 && marca[p + 1] === 1) { marca[p + 1] = 2; pilha.push(p + 1); }
      if (py > 0 && marca[p - RW] === 1) { marca[p - RW] = 2; pilha.push(p - RW); }
      if (py < RH - 1 && marca[p + RW] === 1) { marca[p + RW] = 2; pilha.push(p + RW); }
    }
    lista.push({ x0: xa + x0, x1: xa + x1, y0: ya + y0, y1: ya + y1, n });
  }
  return { lista, marca, RW, xa, ya };
}
// a claridade típica (mediana do menor canal) do retângulo: com céu claro atrás (~165) o "claro" do HUD sobe junto,
// senão o céu entra junto com a estrela e os números (pedido do usuário em 2026-11-28, print com o céu nublado)
function fundoDo(img, xa, ya, xb, yb) {
  const { width: W, data: d } = img;
  const v = [];
  for (let y = ya; y < yb; y += 3) for (let x = xa; x < xb; x += 3) { const i = (y * W + x) * 4; v.push(Math.min(d[i], d[i + 1], d[i + 2])); }
  v.sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
}
const limiar = (base, fundo) => Math.max(base, Math.min(225, fundo + 30));
const claroSemCor = (d, min) => (i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2], mn = Math.min(r, g, b);
  return mn > min && Math.max(r, g, b) - mn < 45;
};

// a estrela clara da direita: em pé, quase quadrada, meio cheia (cheia ~0,4; só o contorno ~0,27)
function estrela(img) {
  const { width: W, height: H, data: d } = img;
  const xa = Math.round(W * 0.8), ya = Math.round(H * 0.01), yb = Math.round(H * 0.22);
  const { lista } = manchas(img, xa, ya, W, yb, claroSemCor(d, limiar(90, fundoDo(img, xa, ya, W, yb))));
  // reduzida pela metade a estrela tem ~10 px e sai um pouco mais estreita (0,75–0,8 da altura)
  const cands = [];
  for (const m of lista) {
    const w = m.x1 - m.x0 + 1, h = m.y1 - m.y0 + 1, f = m.n / (w * h);
    if (h < H * 0.013 || h > H * 0.045 || w < h * 0.7 || w > h * 1.4 || f < 0.2 || f > 0.6 || m.x1 < W * 0.9) continue;
    cands.push({ ...m, h });
  }
  if (!cands.length) return null;
  // as estrelas são o que há mais em cima no HUD: a fila de cima e, nela, a da direita
  const topo = Math.min(...cands.map((m) => m.y0));
  return cands.filter((m) => m.y0 - topo <= m.h * 0.5).reduce((a, b) => (b.x1 > a.x1 ? b : a));
}

// a fila de ícones vermelhos logo embaixo da estrela: a base dela (em pixels) ou null
function iconesVermelhos(img, e) {
  const { width: W, height: H, data: d } = img;
  const xa = Math.max(0, Math.round(e.x1 - e.h * 5)), xb = Math.min(W, e.x1 + 2);
  const ya = e.y1 + 1, yb = Math.min(H, Math.round(e.y1 + e.h * 1.8));
  if (yb <= ya) return null;
  const { lista } = manchas(img, xa, ya, xb, yb, (i) => d[i] > 110 && d[i] - Math.max(d[i + 1], d[i + 2]) > 50);
  const discos = lista.filter((m) => m.y1 - m.y0 + 1 >= e.h * 0.3 && m.n >= e.h * e.h * 0.1);
  return discos.length ? Math.max(...discos.map((m) => m.y1)) : null;
}

// a linha da munição: algarismos claros em pé, da mesma altura, um do lado do outro; abaixo de y0 (a estrela)
export function armaNaTela(img, y0 = Math.round(img.height * 0.03)) {
  const { width: W, height: H, data: d } = img;
  const yb = Math.round(H * 0.3);
  if (yb - y0 < 10) return null;
  const x0 = Math.round(W * 0.78);
  const { lista, marca, RW, xa, ya } = manchas(img, x0, y0, W, yb, claroSemCor(d, limiar(120, fundoDo(img, x0, y0, W, yb))));
  const hMin = Math.max(5, H * 0.011), hMax = H * 0.035;
  const algs = [];
  for (const m of lista) {
    const w = m.x1 - m.x0 + 1, h = m.y1 - m.y0 + 1, f = m.n / (w * h);
    // um algarismo é mais alto que largo (a estrela, quase quadrada, não entra)
    if (h >= hMin && h <= hMax && w >= h * 0.25 && w <= h * 0.85 && f >= 0.25 && f <= 0.92) algs.push({ ...m, h });
  }
  algs.sort((p, q) => p.x0 - q.x0);
  let melhor = null;
  for (const a of algs) {
    const linha = [a];
    for (const b of algs) {
      const u = linha[linha.length - 1];
      if (b.x0 <= u.x1 || b.x0 - u.x1 > a.h * 1.6) continue;
      if (Math.abs(b.y0 - a.y0) > a.h * 0.2 || Math.abs(b.h - a.h) > a.h * 0.2) continue;
      linha.push(b);
    }
    if (linha.length < 2) continue;
    const dir = linha[linha.length - 1].x1, base = Math.max(...linha.map((k) => k.y1));
    if (dir < W * 0.93) continue;
    // fundo não claro em cima e embaixo da linha (céu claro não vira munição)
    let claros = 0, tot = 0;
    for (const yy of [a.y0 - Math.round(a.h * 0.6), base + Math.round(a.h * 0.6)]) {
      if (yy < ya || yy >= yb) continue;
      for (let x = a.x0; x <= dir; x++) { tot++; if (marca[(yy - ya) * RW + x - xa]) claros++; }
    }
    if (tot && claros / tot > 0.3) continue;
    if (!melhor || linha.length > melhor.n) melhor = { n: linha.length, dir, topo: a.y0, base, h: a.h };
  }
  if (!melhor) return null;
  return { dir: (melhor.dir + 1) / W, topo: melhor.topo / H, base: (melhor.base + 1) / H, h: melhor.h / H };
}

export function hudCanto(img) {
  const { width: W, height: H } = img;
  const e = estrela(img);
  const arma = armaNaTela(img, e ? e.y1 + 1 : undefined);
  // com arma: o desenho dela ocupa ~3,4 algarismos embaixo dos números
  if (arma) return { dir: e ? (e.x1 + 1) / W : arma.dir, base: arma.base + arma.h * 3.4, arma: true };
  if (!e) return null;
  const base = Math.max(e.y1, iconesVermelhos(img, e) ?? 0);
  return { dir: (e.x1 + 1) / W, base: (base + 1) / H, arma: false };
}

// O menu do Options do GTA 6 (a lista Mapa, Jogo, Loja… e as de dentro, como a "Jogo": Salvar, Carregar,
// Novo jogo): um painel azul-escuro liso (~33,32,43) no terço da esquerda, com o item marcado numa barra
// branca; a lista principal tem o "VI" rosa em cima, as de dentro um título branco. telaDoMenu() devolve
// { lista, logo, barra }: barra é o meio da barra branca (fração da altura; o 1º item fica em ~0,23) ou null.
export function telaDoMenu(img) {
  const { width: W, height: H, data: d } = img;
  const at = (x, y) => (Math.round(y) * W + Math.round(x)) * 4;
  let liso = 0, tot = 0;
  for (let y = H * 0.4; y < H * 0.9; y += H / 60) for (let x = W * 0.02; x < W * 0.24; x += W / 120) {
    const i = at(x, y), r = d[i], g = d[i + 1], b = d[i + 2];
    tot++;
    if (r >= 15 && r <= 60 && g >= 15 && g <= 60 && b - r >= 0 && b - r <= 30) liso++;
  }
  // 0,75: com o jogo claro atrás o painel pega um pouco do desfoque (a lista do "Estúdio de fotos" deu 0,86)
  const painel = tot > 0 && liso / tot >= 0.75;
  let barra = null;
  if (painel) {
    let y0 = -1;
    for (let y = Math.round(H * 0.1); y < H * 0.7; y++) {
      let brancos = 0, n = 0;
      // a barra clareia da esquerda para a direita e tem o nome do item escuro por cima: basta metade clara
      for (let x = W * 0.02; x < W * 0.2; x += 2) { const i = at(x, y); n++; if (Math.min(d[i], d[i + 1], d[i + 2]) > 140) brancos++; }
      const cheia = brancos / n >= 0.5;
      if (cheia && y0 < 0) y0 = y;
      if (!cheia && y0 >= 0) {
        if (y - y0 >= H * 0.03) { barra = (y0 + y) / 2 / H; break; }
        y0 = -1;
      }
    }
  }
  let rosa = 0;
  for (let y = 0; y < H * 0.15; y++) for (let x = 0; x < W * 0.12; x++) {
    const i = at(x, y), r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 150 && r - g > 60 && b > 90) rosa++;
  }
  return { lista: painel && barra != null, logo: rosa >= 10, barra };
}

// o jogo na tela (fora dos menus e do mapa): a estrela do canto de cima à direita
export const jogoNaTela = (img) => !!estrela(img);
