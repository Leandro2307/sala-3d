// Gincana (como o Fall Guys): 10 fases e a final, num show com pontos e uma coroa no fim. Só
// números e contas, sem three.js: o servidor lê daqui o tipo e o tempo de cada fase (as fases em
// si estão em gincana-fases.js); o navegador monta o 3D (gincana-3d.js) e anda com os obstáculos.
//
// O que anda sempre (varredores, plataformas, pêndulos, bolas) vai pelo relógio (Date.now). O que
// muda com a fase (as barras do Gira-Gira, os paredões, a memória, a gosma) vai pelo tempo desde
// que ela começou, que o servidor manda. O que é sorteado (portas, o caminho do Pisa Leve, os
// paredões, as frutas) sai de um número que o servidor sorteia a cada fase: igual para todos.
import { FASES } from './gincana-fases.js';

export { FASES };

// Bem longe do mapa (que vai até uns 500 m do centro; a câmera enxerga 3 km): lá de dentro não se
// vê nada daqui, e daqui nada de lá. Cada fase num lugar, 400 m uma da outra, no céu.
export const ORIGEM = { x: 6000, y: 200, z: 0 };
export const origemDa = (k) => ({ x: ORIGEM.x + k * 400, y: ORIGEM.y, z: ORIGEM.z });

// contagem: esperando o show começar; intro: o nome da fase e 3, 2, 1; resultado: os pontos da
// fase; fim: a coroa. depoisDoPrimeiro: numa corrida, quanto os outros têm depois que o 1º chega
export const TEMPOS = { contagem: 15, intro: 7, resultado: 7, fim: 12, depoisDoPrimeiro: 30 };
// corrida: pela ordem de chegada; sobrevivência: quem ficou em pé (quem caiu, pelo tempo que
// aguentou); final: o último em pé leva mais
export const PONTOS = { corrida: [12, 10, 8, 7, 6, 5, 4], corridaMin: 3, sobreviveu: 10, sobrevivencia: 7, gosma: 4, final: [20, 12, 8], finalMin: 4, finalEmPe: 15 };
export const N_FASES = FASES.filter((f) => f.tipo !== 'final').length;
export const nomeDaFase = (k) => (FASES[k]?.tipo === 'final' ? 'Final' : `Fase ${k + 1}/${N_FASES}`);

// ------------------------------------------------------------------ sorteios
// sorteio repetível: o mesmo número dá a mesma sequência em todo navegador (mulberry32)
export function sorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// k números diferentes de 0 a n-1
function escolher(rnd, n, k) {
  const lista = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista.slice(0, k);
}

// quais portas do paredão w seguram
export const portasSolidas = (semente, w, n, k) => new Set(escolher(sorteio(semente * 31 + w * 7919 + 1), n, k));

// o caminho de verdade de um campo do Pisa Leve (célula = linha * cols + coluna): uma linha por vez,
// às vezes andando de lado (as células do meio entram também: dá para ir sem pular na diagonal)
export function caminhoPisaLeve(semente, campo, cols, rows) {
  const rnd = sorteio(semente * 7 + campo * 1013 + 5);
  const certos = new Set();
  let c = Math.floor(rnd() * cols);
  for (let r = 0; r < rows; r++) {
    certos.add(r * cols + c);
    if (r === rows - 1) break;
    const s = rnd();
    let c2 = c;
    if (s < 0.32) c2 = c - 1 - (rnd() < 0.3 ? 1 : 0);
    else if (s < 0.64) c2 = c + 1 + (rnd() < 0.3 ? 1 : 0);
    c2 = Math.max(0, Math.min(cols - 1, c2));
    for (let x = Math.min(c, c2); x <= Math.max(c, c2); x++) certos.add(r * cols + x);
    c = c2;
  }
  return certos;
}

// ------------------------------------------------------------------ o que anda pelo relógio
// plataformas que vão e voltam: quanto andou no eixo dela
export const posMovel = (m, t) => Math.sin((t / m.periodo + m.fase) * Math.PI * 2) * m.amp;
// varredores: a barra gira em volta do eixo
export const anguloVarredor = (v, t) => t * v.vel;
// pêndulos: o ângulo, para que lado vai (w) e onde está a cabeça (d: de lado; y: altura)
export function cabecaPendulo(p, t) {
  const fase = (t / p.periodo + p.fase) * Math.PI * 2;
  const a = p.abre * Math.sin(fase);
  return { a, w: Math.cos(fase), d: Math.sin(a) * p.braco, y: p.y + p.eixo - Math.cos(a) * p.braco };
}
// plataformas que somem: no fim do tempo ligada, piscam avisando
export function sumidaEstado(s, t) {
  const u = (((t / s.periodo + s.fase) % 1) + 1) % 1;
  return { ligada: u < s.on, aviso: u < s.on && u > s.on - 0.2 };
}
// socadores: 0 recolhido, 1 esticado (sai rápido, segura, volta devagar); indo: saindo agora
export function socadorExt(s, t) {
  const u = (((t / s.periodo + s.fase) % 1) + 1) % 1;
  if (u < 0.12) return { ext: u / 0.12, indo: true };
  if (u < 0.3) return { ext: 1, indo: false };
  if (u < 0.6) return { ext: 1 - (u - 0.3) / 0.3, indo: false };
  return { ext: 0, indo: false };
}

// a altura do chão na descida das bolas (perfil: [z, y] do alto para baixo)
export function alturaPerfil(perfil, z) {
  if (z >= perfil[0][0]) return perfil[0][1];
  for (let i = 1; i < perfil.length; i++) {
    const [za, ya] = perfil[i - 1];
    const [zb, yb] = perfil[i];
    if (z >= zb) return yb + ((ya - yb) * (z - zb)) / (za - zb || 1);
  }
  return perfil[perfil.length - 1][1];
}
// quanto tempo uma bola vive (cai, rola até o fim e cai de lá)
export function vidaDaBola(B) {
  return Math.sqrt((2 * B.alturaQueda) / 30) + (B.zQueda - B.zFim) / B.vel + 1.4;
}
// as bolas de cada faixa: cada uma cai do alto em zQueda, rola para trás (-z) até zFim e cai.
// cb(faixa, j, x, y, z, rolou) com o centro da bola e quanto ela já rolou (para girar)
export function bolasEm(B, t, cb) {
  const g = 30;
  const tq = Math.sqrt((2 * B.alturaQueda) / g);
  const yTopo = alturaPerfil(B.perfil, B.zQueda);
  const rolar = (B.zQueda - B.zFim) / B.vel;
  const vida = vidaDaBola(B);
  B.faixas.forEach((x, i) => {
    const P = B.periodos[i];
    const idade0 = (((t + B.fases[i] * P) % P) + P) % P;
    for (let j = 0, idade = idade0; idade < vida; j++, idade += P) {
      let y;
      let z;
      let rolou = 0;
      if (idade < tq) {
        z = B.zQueda;
        y = yTopo + B.alturaQueda - 0.5 * g * idade * idade;
      } else if (idade < tq + rolar) {
        rolou = (idade - tq) * B.vel;
        z = B.zQueda - rolou;
        y = alturaPerfil(B.perfil, z);
      } else {
        const u = idade - tq - rolar;
        rolou = (rolar + u) * B.vel;
        z = B.zFim - u * B.vel;
        y = alturaPerfil(B.perfil, B.zFim) - 0.5 * g * u * u;
      }
      cb(i, j, x, y + B.r, z, rolou);
    }
  });
}

// ------------------------------------------------------------------ o que anda com a fase
// as barras do Gira-Gira: giram cada vez mais rápido a partir de `desde` s
export function barraAngulo(b, tf) {
  const u = Math.max(0, tf - b.desde);
  return b.giro0 + b.v0 * u + 0.5 * b.ac * u * u;
}
export const barraVel = (b, tf) => (tf < b.desde ? 0 : b.v0 + b.ac * (tf - b.desde));
// A barra (inteira, atravessando o centro) pegou o boneco em p (x, z) entre o ângulo `antes` e o
// `agora`? Rápida, ela anda mais que a grossura dela num quadro: vale também ter passado por ele.
// meia: meia grossura da barra mais a do boneco
export function barraPassou(antes, agora, p, meia) {
  const d = Math.hypot(p.x, p.z);
  const meiaAng = Math.asin(Math.min(1, meia / Math.max(d, meia)));
  const phi = Math.atan2(p.z, p.x);
  // diferença de ângulo até a barra, de -90° a 90° (ela tem as duas pontas)
  const dif = (a) => {
    const w = (((phi - a) % Math.PI) + Math.PI) % Math.PI;
    return w > Math.PI / 2 ? w - Math.PI : w;
  };
  const d0 = dif(antes);
  const d1 = dif(agora);
  if (Math.abs(d1) <= meiaAng) return true;
  return Math.sign(d0) !== Math.sign(d1) && Math.abs(d0) + Math.abs(d1) < Math.PI / 2;
}
// a barra que começa depois desce do alto nos 2 s antes de girar: quanto ainda falta descer
export const barraSobe = (b, tf) => Math.min(1, Math.max(0, (b.desde - tf) / 2)) * 7;

// os paredões do Bloco a Bloco: cb(j, z, vel, tipos) para cada um passando agora (z do meio)
export function paredesEm(semente, P, tf, cb) {
  let inicio = P.atraso;
  for (let j = 0; inicio <= tf && j < 300; j++) {
    const vel = Math.min(P.velMax, P.vel0 + P.velAc * j);
    const z = P.zIni - vel * (tf - inicio);
    if (z >= P.zFim) cb(j, z, vel, tiposDaParede(semente, j, P.celulas));
    inicio += Math.max(P.intervaloMin, P.intervalo0 - P.intervaloAc * j);
  }
}
// cada célula do paredão: 'cheio', 'vazio' (o buraco), 'baixo' (pule) ou 'alto' (fique embaixo)
const cacheParedes = new Map();
export function tiposDaParede(semente, j, n) {
  const chave = `${semente}:${j}`;
  if (cacheParedes.has(chave)) return cacheParedes.get(chave);
  const rnd = sorteio(semente * 977 + j * 131 + 7);
  let tipos;
  if (j >= 3 && rnd() < 0.15) tipos = Array(n).fill('baixo'); // pula todo mundo
  else {
    tipos = Array(n).fill('cheio');
    const livres = j < 3 ? 2 : rnd() < 0.4 ? 2 : 1;
    for (const i of escolher(rnd, n, livres)) tipos[i] = j < 2 ? 'vazio' : ['vazio', 'baixo', 'alto'][Math.floor(rnd() * 3)];
  }
  if (cacheParedes.size > 400) cacheParedes.clear();
  cacheParedes.set(chave, tipos);
  return tipos;
}

// a memória: em que rodada e etapa está (prepara, mostra, alvo, cai, volta, fim) e quanto falta
export function memoriaEm(M, tf) {
  let t = tf - M.preparo;
  if (t < 0) return { r: -1, etapa: 'prepara', resta: -t, dur: M.preparo };
  for (let r = 0; r < M.rodadas.length; r++) {
    const [mostra, alvo, cai, volta] = M.rodadas[r];
    for (const [etapa, d] of [['mostra', mostra], ['alvo', alvo], ['cai', cai], ['volta', volta]]) {
      if (t < d) return { r, etapa, resta: d - t, dur: d };
      t -= d;
    }
  }
  return { r: M.rodadas.length, etapa: 'fim', resta: 0, dur: 1 };
}
export const FRUTAS = [
  { nome: 'Maçã', emoji: '🍎', cor: '#ef4444' }, { nome: 'Banana', emoji: '🍌', cor: '#facc15' },
  { nome: 'Uva', emoji: '🍇', cor: '#a855f7' }, { nome: 'Melancia', emoji: '🍉', cor: '#22c55e' },
  { nome: 'Laranja', emoji: '🍊', cor: '#f97316' }, { nome: 'Morango', emoji: '🍓', cor: '#ec4899' },
];
// a rodada r: qual fruta o telão pede e a fruta de cada piso (k pisos com a certa)
export function memoriaRodada(semente, r, n, k) {
  const rnd = sorteio(semente * 613 + r * 89 + 3);
  const alvo = Math.floor(rnd() * FRUTAS.length);
  const certos = new Set(escolher(rnd, n, k));
  const frutas = [];
  for (let i = 0; i < n; i++) {
    if (certos.has(i)) frutas.push(alvo);
    else {
      let f = Math.floor(rnd() * (FRUTAS.length - 1));
      if (f >= alvo) f++;
      frutas.push(f);
    }
  }
  return { alvo, frutas };
}

// a gosma subindo
export const gosmaY = (G, tf) => G.y0 + G.vel * Math.max(0, tf);

// ------------------------------------------------------------------ onde cada um nasce
// a vaga i: numa lista de lugares, num anel (arenas redondas) ou em fileiras na área de largada
export function vaga(nascer, i) {
  if (nascer.lista) {
    const l = nascer.lista[i % nascer.lista.length];
    const volta = Math.floor(i / nascer.lista.length); // mais gente que lugar: um pouco ao lado
    return { x: l.x + [0, 1.1, -1.1][volta % 3], y: nascer.y, z: l.z + (volta > 2 ? 1.1 : 0), yaw: nascer.yaw };
  }
  if (nascer.anel) {
    const a = 0.4 + i * 2.4;
    const r = nascer.anel - (i % 3) * 1.5;
    return { x: Math.cos(a) * r, y: nascer.y, z: Math.sin(a) * r, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
  }
  const larg = nascer.x1 - nascer.x0;
  const cols = Math.max(1, Math.floor(larg / 2));
  const col = i % cols;
  const fila = Math.floor(i / cols);
  const z = Math.max(nascer.z0, nascer.z1 - fila * 2);
  return { x: nascer.x0 + ((col + 0.5) * larg) / cols, y: nascer.y, z, yaw: nascer.yaw };
}
