// Truco (mineiro) e Uno nas mesas redondas do salão de jogos do parque, com a cara do Balatro.
// E perto da mesa abre o seletor de cadeira: escolhe um lugar livre (ou o de um robô, que levanta);
// no truco, a borda da cadeira mostra a dupla. A câmera fica atrás da sua cadeira. Por cima do 3D, sem tampar a mesa:
//   - a coluna do placar à esquerda (pontos que pulam, o valor da mão pegando fogo, rodadas,
//     manilhas; no uno o monte, o sentido e a cor);
//   - a plaquinha de cada lugar flutuando em cima da cadeira (nome, cartas, a vez, o balão do grito,
//     e o tapa, o tiro e o arremesso (tomate, galinha...) de brincadeira);
//   - a mão embaixo: as cartas balançam e inclinam com o mouse; um clique joga a carta; COBERTA
//     liga e a próxima carta vai virada; TRUCO! grita; o megafone zoa (com frase aleatória também);
//     no truco, o 🤫 Sinal cochicha uma frase que só o parceiro vê;
//   - a pergunta do truco (ou da mão de onze) no meio, com o tempo correndo.
// Os robôs aparecem sentados nas cadeiras deles. Cada truco, seis, nove e doze (e cada resposta) é
// um grito: murro na mesa, as cartas pulam, a voz neural (mp3 sintetizado no servidor, a mesma
// para todo mundo) e a faixa grande. "Começar"
// completa a mesa com robôs; Esc (ou "Sair") levanta e um robô assume as suas cartas. O servidor
// (cartas-servidor.js) conduz tudo; as regras são as de cartas-regras.js.
import * as THREE from 'three';
import {
  forcaTruco, valorDe, naipeDe, SIMBOLO, NOME_PEDIDO, PASSOS_TRUCO, MANILHAS, NOME_MANILHA, VALE_DEZ, ZOEIRA, SINAIS, ARREMESSOS,
  podeJogarUno, coringa, corUno, simboloUno, rotuloUno, HEX_COR, NOME_COR, CORES_UNO,
  numero21, trunfo21, soma21, TRUNFOS_21, MAX_21, DEDOS_21,
} from './cartas-regras.js';
import { MESAS_CARTAS } from './parque-dados.js';
import { hud, texturaViva, paraToque } from './hud-jogos.js';
import { sfxLigado } from './sfx.js';
import { Avatar } from './avatars.js';

const LUGARES = { truco: 4, uno: 6, vinteum: 2 };
const NOME_JOGO = { truco: 'TRUCO', uno: 'UNO', vinteum: '21' };
const COR_PLACA = { truco: '#fe5f55', uno: '#f5b244', vinteum: '#4bc292' };
const R_MESA = 1.15;
const R_CADEIRA = 1.75;
const Y_MESA = 0.85;
const PIXEL = "'Pixelify Sans', 'Plus Jakarta Sans', system-ui, sans-serif";
const fontePx = (p, peso = 700) => `${peso} ${p}px ${PIXEL}`;
// Os números e letras das cartas (e do placar) não vão na fonte pixelada: nela o 2 e o 3 quase não
// se distinguem. Vão numa fonte cheia, de traço grosso.
const NUMERO = "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif";
const fonteNum = (p, peso = 800) => `${peso} ${p}px ${NUMERO}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// O mp3 dos gritos sai SEMPRE por este único elemento. O iOS/Android só liberam o play() de um
// elemento que já tocou dentro de um gesto do usuário; criar Audio novo a cada grito (que chega por
// socket, sem gesto) volta a ser barrado. O primarVoz é chamado no primeiro toque/clique (main.js).
const audioVoz = new Audio();
audioVoz.setAttribute('playsinline','true'); // iOS: inline sem fullscreen
audioVoz.muted = false; // garante nao mutado em mobile
audioVoz.preload = 'auto';
// chiado de 0,05s: um play() com src real é o que o celular aceita como "destrave" do elemento
const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
let _vozDestravada = false;
export function primarVoz() {
  // iOS/Safari: destrava o elemento de audio exatamente uma vez, de forma sincrona
  // dentro do event handler do usuario (sem await/Promise antes desta chamada)
  if (_vozDestravada) return;
  _vozDestravada = true;
  audioVoz.src = SILENCIO;
  const p = audioVoz.play();
  if (p && typeof p.then === 'function') p.then(() => audioVoz.pause()).catch(() => { _vozDestravada = false; });
}
const PEDIDOS = ['truco', 'seis', 'nove', 'doze'];
const OUVE_ATE = 22; // metros: de mais longe que isso, o grito da mesa não chega
// as cores do Balatro: naipes do baralho de 4 cores e os botões
const COR_NAIPE = { o: '#e8642c', c: '#e2304c', e: '#3c4368', p: '#1f6b5f' };
const COR_ROBO = ['#94a3b8', '#a3e635', '#f472b6', '#fbbf24', '#22d3ee', '#c084fc'];
const ROSTO = { K: '♚', Q: '♛', J: '♞' };
const lerp = (a, b, k) => a + (b - a) * k;
const saida = (k) => 1 - (1 - k) ** 3;

// «0» e «1» (as duplas, nos avisos do servidor) viram "sua dupla" e "a outra dupla" para quem lê
function comDuplas(texto, meuTime) {
  return String(texto || '').replace(/«([01])»/g, (_, x, pos) => {
    const n = meuTime < 0 ? (x === '0' ? 'A dupla azul' : 'A dupla vermelha') : Number(x) === meuTime ? 'Sua dupla' : 'A outra dupla';
    return pos === 0 ? n : n[0].toLowerCase() + n.slice(1);
  });
}

// o texto que ondula, letra por letra (os títulos do Balatro)
const ondas = (texto) => [...String(texto)].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');

// ------------------------------------------------------------------ a voz dos gritos
// A voz do sistema em português (speechSynthesis). Cada lugar da mesa grita com uma voz e um tom
// diferentes, para dar para saber quem gritou sem olhar. As vozes "natural"/"neural" (Microsoft
// Online, Google...) são muito mais lisas que as vozes de desktop antigas: se tiver, usa só essas
// (as de desktop deixam o grito da pessoa robótico e arrastado).
const TOM = [1.15, 0.75, 1.35, 0.9, 1.05, 0.8];
let vozes = null;
if (typeof window !== 'undefined' && window.speechSynthesis) speechSynthesis.addEventListener?.('voiceschanged', () => { vozes = null; });
function falarGrito(frase, lugar, volume) {
  if (!sfxLigado() || !window.speechSynthesis) return;
  try {
    if (!vozes) {
      const todas = speechSynthesis.getVoices().filter((v) => /^pt(-|_)BR/i.test(v.lang));
      // as melhores primeiro: vozes natural/neural/online (Francisca, Antônio, Google...); sem elas,
      // qualquer uma que não seja "Desktop" (as de desktop antigas são robóticas e arrastadas)
      const naturais = todas.filter((v) => /natural|neural|online/i.test(v.name) && !/desktop/i.test(v.name));
      const naoDesktop = todas.filter((v) => !/desktop/i.test(v.name));
      vozes = naturais.length ? naturais : (naoDesktop.length ? naoDesktop : todas);
    }
    const u = new SpeechSynthesisUtterance(frase);
    u.lang = 'pt-BR';
    u.voice = vozes.length ? vozes[lugar % vozes.length] : null;
    u.pitch = TOM[lugar % TOM.length];
    u.rate = 1.12;
    u.volume = volume;
    speechSynthesis.cancel(); // o grito novo corta o anterior (truco e seis em seguida)
    speechSynthesis.speak(u);
  } catch { /* sem voz: fica o murro e a faixa */ }
}

// onde fica cada cadeira (lugar 0 ao sul, girando para leste)
export function cadeira(m, k) {
  const n = LUGARES[m.jogo];
  const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
  return { x: m.x + Math.cos(a) * R_CADEIRA, z: m.z + Math.sin(a) * R_CADEIRA, a };
}

// um ponto da mesa na direção da cadeira k, a raio metros do centro
function naMesa(m, k, raio) {
  const c = cadeira(m, k);
  const dx = c.x - m.x;
  const dz = c.z - m.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: m.x + (dx / d) * raio, z: m.z + (dz / d) * raio, ry: -c.a + Math.PI / 2 };
}

// ------------------------------------------------------------------ as cartas (com cache)
// Desenhadas no tamanho das do Balatro (71 × 95) vezes 2, num canvas 3× maior (para a carta não
// borrar deitada na mesa nem grande na mão). A fonte pixelada chega depois: quando
// ela carrega, tudo o que já foi desenhado com a fonte reserva é redesenhado.
const CW = 142;
const CH = 190;
const NITIDEZ = 3;
const _tex = new Map();
const _url = new Map();
const quandoFonte = [];
function redesenharTudo() {
  for (const t of _tex.values()) t.userData.redesenhar();
  _url.clear();
  for (const f of quandoFonte) f();
}
if (typeof document !== 'undefined' && document.fonts?.load) {
  Promise.all([document.fonts.load(fontePx(40)), document.fonts.load(fonteNum(40))]).then(redesenharTudo).catch(() => {});
  // a folha das fontes do Google entra depois (media=print): quando as fontes chegarem de fato, redesenha
  let tRedesenho = 0;
  document.fonts.addEventListener?.('loadingdone', () => {
    clearTimeout(tRedesenho);
    tRedesenho = setTimeout(redesenharTudo, 120);
  });
}
const urlCarta = (c) => {
  if (!_url.has(c)) _url.set(c, texturaCarta(c).image.toDataURL());
  return _url.get(c);
};
function texturaCarta(c) {
  if (_tex.has(c)) return _tex.get(c);
  const t = texturaViva(THREE, CW * NITIDEZ, CH * NITIDEZ, (ctx) => {
    ctx.setTransform(NITIDEZ, 0, 0, NITIDEZ, 0, 0);
    desenharCarta(ctx, CW, CH, c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  });
  t.anisotropy = 16; // o three limita ao máximo da placa; deitada na mesa é o que segura a nitidez
  _tex.set(c, t);
  return t;
}

function desenharCarta(ctx, w, h, c) {
  const corpo = (fundo, borda) => {
    ctx.beginPath();
    ctx.roundRect(3, 3, w - 6, h - 6, 12);
    ctx.fillStyle = fundo;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = borda;
    ctx.stroke();
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (c === 'verso') {
    // o verso vermelho, com a treliça de losangos
    corpo('#d64541', '#8f2622');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 28, 6);
    ctx.clip();
    ctx.fillStyle = '#b8322e';
    for (let y = 8; y < h; y += 18) for (let x = (y / 18) % 2 ? 8 : 17; x < w; x += 18) ctx.fillRect(x, y, 6, 6);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff4e6';
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 28, 6);
    ctx.stroke();
    ctx.fillStyle = '#fff4e6';
    ctx.font = fontePx(44);
    ctx.fillText('♦', w / 2, h / 2 + 2);
    return;
  }
  if (numero21(c) || trunfo21(c)) return desenharCarta21(ctx, w, h, c, corpo);
  if (/^[4-7QJKA23][oecp]$/.test(c)) {
    const v = valorDe(c);
    const n = naipeDe(c);
    const cor = COR_NAIPE[n];
    const manilha = NOME_MANILHA[c];
    // manilha: a carta de ouro do Balatro, com o selo vermelho e o apelido
    if (manilha) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#fbe08a');
      g.addColorStop(1, '#e3a92b');
      corpo(g, '#a8741f');
    } else corpo('#f6f1e6', '#cfc6b4');
    // os cantos: valor e naipe (o de baixo, de ponta-cabeça)
    const canto = () => {
      ctx.fillStyle = cor;
      ctx.font = fonteNum(34);
      ctx.fillText(v, 22, 27);
      ctx.font = fontePx(24, 400);
      ctx.fillText(SIMBOLO[n], 22, 52);
    };
    canto();
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    canto();
    ctx.restore();
    // o meio: rosto (K, Q, J), um naipe grande (ás e manilhas) ou os naipes empilhados (2 e 3)
    if (ROSTO[v] && !manilha) {
      ctx.fillStyle = `${cor}22`;
      ctx.fillRect(38, 36, w - 76, h - 72);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cor;
      ctx.strokeRect(38, 36, w - 76, h - 72);
      ctx.fillStyle = cor;
      ctx.font = `64px ${PIXEL}`;
      ctx.fillText(ROSTO[v], w / 2, h / 2 - 6);
      ctx.font = fontePx(22);
      ctx.fillText(SIMBOLO[n], w / 2, h / 2 + 38);
    } else if (v === '2' || v === '3') {
      ctx.fillStyle = cor;
      ctx.font = fontePx(40, 400);
      const ys = v === '2' ? [0.32, 0.68] : [0.27, 0.5, 0.73];
      for (const y of ys) ctx.fillText(SIMBOLO[n], w / 2, h * y);
    } else {
      ctx.fillStyle = cor;
      ctx.font = fontePx(manilha ? 64 : 78, 400);
      ctx.fillText(SIMBOLO[n], w / 2, h * (manilha ? 0.44 : 0.5));
    }
    if (manilha) {
      // o selo (canto de cima, à direita) e a faixa com o apelido
      ctx.fillStyle = '#d64541';
      ctx.beginPath();
      ctx.arc(w - 26, 30, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd6d1';
      ctx.fillRect(w - 29, 27, 6, 6);
      ctx.fillStyle = '#1e2b2d';
      ctx.beginPath();
      ctx.roundRect(18, h * 0.66, w - 36, 32, 6);
      ctx.fill();
      ctx.fillStyle = '#f5b244';
      ctx.font = fontePx(manilha.length > 6 ? 19 : 24);
      ctx.fillText(manilha.toUpperCase(), w / 2, h * 0.66 + 17);
    }
    return;
  }
  // uno: o corpo na cor, a elipse branca torta e o símbolo; o coringa tem as quatro cores
  const cor = coringa(c) ? '#1e2b2d' : HEX_COR[corUno(c)];
  corpo(cor, '#1e2b2d');
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.34, h * 0.3, 0, 0, Math.PI * 2);
  if (coringa(c)) {
    ctx.clip();
    CORES_UNO.forEach((k, i) => {
      ctx.fillStyle = HEX_COR[k];
      ctx.fillRect(i % 2 ? 0 : -w, i < 2 ? -h : 0, w, h);
    });
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = coringa(c) ? '#ffffff' : cor;
  ctx.font = fonteNum(rotuloUno(c).length > 1 ? 50 : 70);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e2b2d';
  if (coringa(c)) ctx.strokeText(rotuloUno(c), w / 2, h / 2 + 3);
  ctx.fillText(rotuloUno(c), w / 2, h / 2 + 3);
  // o canto, com contorno escuro para não sumir no amarelo
  ctx.font = fonteNum(26);
  ctx.lineWidth = 4;
  ctx.strokeText(rotuloUno(c), 24, 26);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(rotuloUno(c), 24, 26);
}

// 21: a carta de número (cada número com a sua cor, o número grande no meio) e o trunfo (escuro,
// com a borda na cor dele, o desenho grande e o nome embaixo)
const COR_21 = ['#4bc292', '#009dff', '#a782d1', '#e8642c', '#e2304c', '#1f6b5f', '#3c4368', '#d97706', '#0e7490', '#be185d', '#7c2d12'];
function desenharCarta21(ctx, w, h, c, corpo) {
  const n = numero21(c);
  if (n) {
    const cor = COR_21[(n - 1) % COR_21.length];
    corpo('#f6f1e6', '#cfc6b4');
    // a faixa de cima na cor do número
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(10, 10, w - 20, 18, 6);
    ctx.fill();
    ctx.font = fonteNum(n > 9 ? 84 : 98);
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e2b2d';
    ctx.strokeText(String(n), w / 2, h / 2 + 8);
    ctx.fillStyle = cor;
    ctx.fillText(String(n), w / 2, h / 2 + 8);
    // os cantos
    ctx.fillStyle = '#1e2b2d';
    ctx.font = fonteNum(24);
    ctx.fillText(String(n), 22, 44);
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    ctx.fillText(String(n), 22, 26);
    ctx.restore();
    // as bolinhas: quantas cartas o número vale, para conferir de relance
    ctx.fillStyle = cor;
    const porLinha = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const linha = Math.floor(i / 6);
      const naLinha = linha ? n - 6 : porLinha;
      const x = w / 2 + ((i % 6) - (naLinha - 1) / 2) * 13;
      ctx.beginPath();
      ctx.arc(x, h - 34 + linha * 13 - (n > 6 ? 6 : 0), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const T = TRUNFOS_21[trunfo21(c)];
  if (!T) return;
  corpo('#1e2b2d', T.cor);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `${T.cor}88`;
  ctx.beginPath();
  ctx.roundRect(11, 11, w - 22, h - 22, 8);
  ctx.stroke();
  ctx.fillStyle = T.cor;
  ctx.font = fontePx(12);
  ctx.fillText(T.mesa ? 'FICA NA MESA' : 'TRUNFO', w / 2, 24);
  if (/^\d+$/.test(T.icone)) {
    ctx.font = fonteNum(58);
    ctx.fillText(T.icone, w / 2, h * 0.44);
  } else {
    ctx.font = `56px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
    ctx.fillText(T.icone, w / 2, h * 0.44);
  }
  // o nome, em uma ou duas linhas
  const palavras = T.nome.split(' ');
  const linhas = T.nome.length > 10 && palavras.length > 1
    ? [palavras.slice(0, Math.ceil(palavras.length / 2)).join(' '), palavras.slice(Math.ceil(palavras.length / 2)).join(' ')]
    : [T.nome];
  ctx.fillStyle = '#fff4e6';
  ctx.font = fonteNum(linhas.length > 1 ? 15 : 17);
  linhas.forEach((l, i) => ctx.fillText(l.toUpperCase(), w / 2, h * 0.74 + (i - (linhas.length - 1) / 2) * 19));
}

// ------------------------------------------------------------------ as mesas (parte do mundo)
export function construirCartas(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.6 });
  const feltro = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95, emissive: 0x0a3a1d, emissiveIntensity: 0.5 });
  const geoCarta = new THREE.PlaneGeometry(0.4, 0.535).rotateX(-Math.PI / 2);
  const mesas = MESAS_CARTAS.map((m) => {
    const tampo = new THREE.Mesh(new THREE.CylinderGeometry(R_MESA, R_MESA, 0.08, 40), madeira);
    tampo.position.set(m.x, Y_MESA - 0.04, m.z);
    const pano = new THREE.Mesh(new THREE.CircleGeometry(R_MESA - 0.1, 40).rotateX(-Math.PI / 2), feltro);
    pano.position.set(m.x, Y_MESA + 0.002, m.z);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, Y_MESA - 0.08, 16), madeira);
    pe.position.set(m.x, (Y_MESA - 0.08) / 2, m.z);
    tampo.castShadow = pe.castShadow = true;
    pano.receiveShadow = true;
    g.add(tampo, pano, pe);
    world.addBox({ min: [m.x - R_MESA * 0.8, 0, m.z - R_MESA * 0.8], max: [m.x + R_MESA * 0.8, Y_MESA, m.z + R_MESA * 0.8] });
    for (let k = 0; k < LUGARES[m.jogo]; k++) {
      const c = cadeira(m, k);
      const banco = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 16), new THREE.MeshStandardMaterial({ color: m.jogo === 'truco' ? (k % 2 ? 0xb91c1c : 0x1d4ed8) : m.jogo === 'vinteum' ? 0x15803d : 0x7c3aed, roughness: 0.7 }));
      banco.position.set(c.x, 0.225, c.z);
      banco.castShadow = true;
      g.add(banco);
    }
    // o nome do jogo pendurado em cima
    const nome = texturaViva(THREE, 384, 96, (ctx, w, h) => {
      ctx.fillStyle = '#1e2b2d';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = COR_PLACA[m.jogo];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = m.jogo === 'vinteum' ? fonteNum(64) : fontePx(60);
      ctx.fillText(NOME_JOGO[m.jogo], w / 2, h / 2 + 2);
    });
    quandoFonte.push(() => nome.userData.redesenhar());
    const placa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), [madeira, madeira, madeira, madeira, new THREE.MeshBasicMaterial({ map: nome, toneMapped: false }), new THREE.MeshBasicMaterial({ map: nome, toneMapped: false })]);
    placa.position.set(m.x, 3.1, m.z);
    g.add(placa);
    // as cartas do centro (as da rodada e o monte no truco; o topo do descarte e o monte no uno; as
    // duas mãos e o monte no 21)
    const cartas = [];
    for (let k = 0; k < (m.jogo === 'vinteum' ? 28 : 6); k++) {
      const c = new THREE.Mesh(geoCarta, new THREE.MeshBasicMaterial({ map: texturaCarta('verso'), toneMapped: false }));
      c.visible = false;
      c.userData = { chave: '', alvo: { x: m.x, y: Y_MESA, z: m.z, ry: 0 }, voo: null, sai: null };
      g.add(c);
      cartas.push(c);
    }
    // o anel da vez, na frente de quem tem que jogar
    const anel = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.24, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf5b244, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
    );
    anel.visible = false;
    g.add(anel);
    return { cartas, placa, anel };
  });
  return { grupo: g, mesas };
}

// ------------------------------------------------------------------ o jogo no navegador
export class Cartas {
  // opts: world, player, sfx, ligado(jogo), focar(mesa) (main.js: câmera e mouse para o painel),
  // soltarFoco(), avatarDe(id) (o boneco de quem está na mesa), levou(tipo, nome, dir) (eu levei um
  // tapa ou um tiro na mesa), tiroFx(de, ate) (o traçante)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'cartas';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.cartas3d;
    this.mesas = MESAS_CARTAS.map((m, i) => ({ i, m, e: null, mao: [], lugar: -1, robos: [], pulo: 0, pausaDesde: 0 }));
    this.ativa = null; // a mesa em que estou sentado (com o painel aberto)
    this.coberta = false; // COBERTA ligada: a próxima carta clicada vai virada
    this.esperandoCor = null; // coringa jogado, esperando a cor
    this.chaveMao = '';
    this.chavePergunta = '';
    this.montarHud();
    quandoFonte.push(() => {
      this.chaveMao = '';
      if (this.ativa) this.desenhar();
    });
    // 1, 2, 3...: joga a carta; espaço: TRUCO!
    window.addEventListener('keydown', (ev) => this.tecla(ev));
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('ct-estado', (e) => this.estado(e));
    socket.on('ct-mao', ({ mesa, lugar, mao, parceiro, trunfos, rivalOculta }) => {
      const M = this.mesas[mesa];
      if (!M) return;
      const antes = M.mao;
      M.mao = mao;
      M.lugar = lugar;
      M.parceiro = parceiro || null; // mão de onze: as cartas do parceiro, para decidir
      M.trunfos = trunfos || []; // 21: os meus trunfos
      M.rivalOculta = rivalOculta || null; // 21, com o raio-x: a carta fechada do rival
      // mão nova (três cartas chegando, ou as sete do uno): as cartas entram distribuídas
      if (mao.length > (antes?.length || 0) + 1) this.distribuir = true;
      if (M.e?.jogo === 'vinteum') this.mostrar3d(M); // a minha carta fechada (e a do raio-x) no 3D
      if (this.ativa === M) this.desenhar();
    });
    socket.on('ct-grito', (g) => this.grito(g));
    socket.on('ct-acao', (a) => this.acao(a));
    socket.on('ct-arremesso', (a) => this.arremesso(a));
    socket.on('ct-sinal', (s) => this.sinal(s));
  }

  ver() {
    this.socket?.emit('ct-ver', (lista) => lista?.forEach((e) => this.estado(e)));
  }

  // o boneco de quem está no lugar k: o robô (daqui) ou a pessoa (main.js)
  bonecoDe(M, k) {
    const l = M.e?.lugares[k];
    if (!l) return null;
    return l.bot ? M.robos[k]?.av ?? null : this.avatarDe?.(l.id) ?? null;
  }

  // Alguém gritou na mesa (truco, seis..., desce, corro, a zoeira, o robô reclamando): a voz para quem
  // está perto, o balão em cima de quem gritou e, nos pedidos, o murro na mesa (as cartas pulam);
  // para quem está sentado nela, a faixa grande e a tela tremendo quando o grito é contra a gente.
  // A voz é o mp3 neural do servidor ('voz'); sem ele, a voz do sistema do navegador (falarGrito).
  grito({ mesa, lugar, tipo, nome, frase, alvo, trunfo, voz }) {
    const M = this.mesas[mesa];
    if (!M || !this.ligado(M.m.jogo) || typeof frase !== 'string') return;
    const sentado = this.ativa === M;
    const p = this.player.pos;
    const d = Math.hypot(p.x - M.m.x, p.z - M.m.z);
    if (!sentado && d > OUVE_ATE) return;
    const vol = sentado ? 1 : Math.max(0.15, 1 - d / OUVE_ATE);
    const pedido = PEDIDOS.includes(tipo);
    const boneco = this.bonecoDe(M, lugar);
    if (pedido) {
      this.sfx.murroMesa?.(vol);
      M.pulo = 1;
      boneco?.punch();
    }
    boneco?.say(frase);
    if (voz) {
      this.tocarVoz(voz, vol);
    } else {
      // iOS: speechSynthesis falha fora de gesto do usuario. Tentamos buscar o MP3
      // gerado pelo servidor em background (pode demorar alguns segundos).
      // Se chegar, toca via audioVoz (ja destravado); se nao, usa a voz do sistema.
      const tentarVoz = (tentativa) => {
        if (!this.socket) { falarGrito(frase, lugar, vol); return; }
        this.socket.emit('pedir-voz', { frase, lugar }, (url) => {
          if (url) this.tocarVoz(url, vol);
          else if (tentativa < 3) setTimeout(() => tentarVoz(tentativa + 1), 1500);
          else falarGrito(frase, lugar, vol);
        });
      };
      tentarVoz(1);
    }
    if (!sentado) return;
    if (lugar !== M.lugar) this.balao(lugar, frase, pedido);
    if (tipo === 'trunfo' && TRUNFOS_21[trunfo]) return this.mostrarTrunfo(trunfo, lugar === M.lugar ? 'Você' : nome, lugar === M.lugar);
    if (!pedido && tipo !== 'aceito' && tipo !== 'corro') return;
    const nosso = lugar % 2 === M.lugar % 2;
    const quem = lugar === M.lugar ? 'Você' : nome;
    const pra = alvo === M.lugar ? ' ➜ VOCÊ!' : '';
    // o pedido contra a gente já vira a pergunta grande no meio (ver desenharPergunta): sem faixa
    if (!pedido || nosso) this.faixaGrito(pedido ? `${tipo.toUpperCase()}!` : frase.toUpperCase(), `${quem}: “${frase}”${pra}`, nosso);
    if (pedido) {
      this.sfx.fogo?.();
      this.flash(nosso ? '#009dff' : '#fe5f55');
      this.tremerHud();
      if (!nosso) this.player.addShake?.(0.7);
    }
  }

  // o mp3 da voz neural do servidor (mesma voz para todo mundo, humano ou robô). O grito novo corta
  // o anterior, como no falarGrito. volume pela distância, como os gritos.
  // Usa UM elemento de áudio só (audioVoz, no topo do módulo): no celular cada elemento novo
  // volta a ser barrado pelo autoplay; o desbloqueio vem do primarVoz, chamado no primeiro gesto.
  tocarVoz(url, volume) {
    if (!sfxLigado()) return;
    try {
      audioVoz.pause();
      audioVoz.volume = Math.min(1, Math.max(0, volume));
      audioVoz.src = url;
      audioVoz.load(); // iOS: sem load() o play() pode sair mudo ao trocar o src
      audioVoz.currentTime = 0;
      this.vozAtual = audioVoz;
      audioVoz.play().catch(() => {});
    } catch { /* sem áudio: fica a faixa e o murro */ }
  }

  // Tapa ou tiro de brincadeira na mesa: o braço de quem fez, o tranco (ou o tombo) de quem levou,
  // o som, o traçante, o PLAFT!/BANG! e, se fui eu que levei, a marca na tela (main.js).
  acao({ mesa, tipo, de, alvo, deNome, alvoId }) {
    const M = this.mesas[mesa];
    if (!M) return;
    const a = cadeira(M.m, de);
    const b = cadeira(M.m, alvo);
    const n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dir = [(b.x - a.x) / n, (b.z - a.z) / n];
    const p = this.player.pos;
    const vol = Math.max(0.05, 1 - Math.hypot(p.x - M.m.x, p.z - M.m.z) / 40);
    const quem = this.bonecoDe(M, de);
    const levou = this.bonecoDe(M, alvo);
    const eu = alvoId && alvoId === this.eu;
    if (tipo === 'tiro') {
      quem?.punch(); // o braço esticado, apontando
      this.tiroFx?.([a.x, 1.25, a.z], [b.x, 1.0, b.z]);
      this.sfx.tiro?.(vol);
      levou?.levarTapa(dir, !eu, 'BANG!');
      if (levou) {
        levou.setKo(true); // cai da cadeira e levanta logo
        setTimeout(() => levou.setKo(false), 1700);
      }
    } else {
      quem?.tapa();
      levou?.levarTapa(dir, !eu);
      this.sfx.tapa?.(vol);
    }
    if (this.ativa === M && alvo !== M.lugar) this.balao(alvo, tipo === 'tiro' ? 'BANG!' : 'PLAFT!', true);
    if (eu) this.levou?.(tipo, deNome, dir);
  }

  // O cochicho do truco chegou: só o parceiro recebe ('ct-sinal' vai só para ele). Balão roxo em
  // cima de quem sinalizou — sem voz e sem a faixa, para o resto da mesa não perceber.
  sinal({ mesa, lugar, frase, carta }) {
    const M = this.mesas[mesa];
    if (!M || typeof frase !== 'string') return;
    this.sfx.dado?.(0.5);
    if (this.ativa === M) this.balao(lugar, `🤫 ${frase}`, false, 'segredo', carta);
  }

  // Alguém jogou uma coisa (tomate, galinha...) em quem está na mesa: o objeto voa na tela de uma
  // plaquinha até a outra e espirra; quem levou toma o tranco e, se fui eu, a marca na tela.
  arremesso({ mesa, item, de, alvo, deNome, alvoId }) {
    const M = this.mesas[mesa];
    const A = ARREMESSOS[item];
    if (!M || !A) return;
    const a = cadeira(M.m, de);
    const b = cadeira(M.m, alvo);
    const n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dir = [(b.x - a.x) / n, (b.z - a.z) / n];
    const p = this.player.pos;
    const vol = Math.max(0.05, 1 - Math.hypot(p.x - M.m.x, p.z - M.m.z) / 40);
    const quem = this.bonecoDe(M, de);
    const levou = this.bonecoDe(M, alvo);
    const eu = alvoId && alvoId === this.eu;
    quem?.tapa(); // o braço do arremesso
    this.sfx.tapa?.(vol);
    if (this.ativa === M) this.voarCoisa(de, alvo, A.emoji);
    setTimeout(() => {
      levou?.levarTapa(dir, !eu);
      levou?.say(A.emoji);
      if (this.ativa === M && alvo !== M.lugar) this.balao(alvo, `${A.emoji} ${A.texto}`, true);
      if (eu) this.levou?.('tapa', deNome, dir);
    }, 480);
  }

  // o objeto voando de uma plaquinha até a outra (as cadeiras se movem com a câmera; o voo é curto)
  voarCoisa(de, alvo, emoji) {
    const elA = this.$(`.ct-assento[data-lugar="${de}"] .ct-placa`);
    const elB = this.$(`.ct-assento[data-lugar="${alvo}"] .ct-placa`);
    if (!elA || !elB) return;
    const ra = elA.getBoundingClientRect();
    const rb = elB.getBoundingClientRect();
    const voo = document.createElement('div');
    voo.className = 'ct-voo';
    voo.textContent = emoji;
    const x0 = ra.left + ra.width / 2;
    const y0 = ra.top;
    const x1 = rb.left + rb.width / 2;
    const y1 = rb.top;
    voo.style.left = `${x0}px`;
    voo.style.top = `${y0}px`;
    this.raiz.append(voo);
    voo.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(.7)' },
        { transform: `translate(calc(-50% + ${(x1 - x0) / 2}px), calc(-50% + ${(y1 - y0) / 2 - 70}px)) rotate(340deg) scale(1.25)`, offset: 0.55 },
        { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) rotate(720deg) scale(1.5)` },
      ],
      { duration: 480, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
    ).onfinish = () => voo.remove();
  }

  estado(e) {
    const M = this.mesas[e.mesa];
    if (!M) return;
    const antes = M.e;
    M.e = e;
    // as cartas da rodada que acabou ficam à vista um pouco (e.pausa ms) e vão para quem levou
    M.pausaAte = performance.now() + (e.pausa || 0);
    M.pausaLimpa = !e.pausa;
    if (e.pausa && !(antes?.pausa > 0)) M.pausaDesde = performance.now();
    // não estou mais na mesa (o servidor me tirou)
    const sentado = e.lugares.some((l) => l?.id === this.eu);
    if (!sentado) {
      M.mao = [];
      M.lugar = -1;
      if (this.ativa === M) this.soltarFoco?.();
    }
    this.sincronizarRobos(M);
    this.mostrar3d(M, antes);
    // o seletor de cadeira aberto nesta mesa acompanha quem senta e levanta
    if (!this.escolha.hidden && this.escolhendo === M) this.abrirEscolha(M);
    if (this.ativa !== M) return;
    this.desenhar();
    const meuTime = M.lugar % 2;
    const vez = e.vez === M.lugar && e.fase === 'jogando';
    const eraVez = antes?.vez === M.lugar && antes?.fase === 'jogando';
    if (vez && !eraVez && !e.pedido) this.sfx.message();
    if (e.jogo === 'uno' && e.aviso && e.aviso !== antes?.aviso && /UNO/.test(e.aviso)) this.sfx.punchHit();
    if (e.jogo === 'uno' && e.topo && e.topo !== antes?.topo) this.fraseUno(M, e, antes);
    if (e.jogo === 'truco' && antes?.pontos && e.pontos) {
      // os pontos pulam e contam até o valor novo
      for (const [time, lado] of [[meuTime, 'nos'], [1 - meuTime, 'eles']]) {
        const ganho = e.pontos[time] - antes.pontos[time];
        if (ganho > 0) this.contarPontos(lado, antes.pontos[time], e.pontos[time]);
      }
      if (e.vale > antes.vale) {
        this.pular(this.$('.ct-vale'));
        this.sfx.fogo?.();
      }
      if ((e.rodadas?.length || 0) > (antes.rodadas?.length || 0)) {
        const r = e.rodadas.at(-1);
        this.pular(this.$(`.ct-rodadas i:nth-child(${e.rodadas.length})`), true);
        this.sfx.ponto?.(r === meuTime ? 7 : 0);
      }
    }
    if (e.jogo === 'vinteum' && antes?.vidas && e.vidas) {
      // perdeu dedo: a tela treme (o meu) ou o número do rival pula
      e.vidas.forEach((n, k) => {
        if (n >= antes.vidas[k]) return;
        const meu = k === M.lugar;
        this.pular(this.$(`[data-p="${meu ? 'nos' : 'eles'}"]`));
        this.flash(meu ? '#fe5f55' : '#009dff');
        if (meu) {
          this.tremerHud();
          this.player.addShake?.(0.6);
          this.sfx.punchTaken?.();
        } else this.sfx.punchHit?.();
      });
      // a minha aposta subiu (trunfo do rival) ou a dele subiu (meu)
      const eu = Math.max(0, M.lugar);
      if ((e.aposta?.[eu] ?? 0) > (antes.aposta?.[eu] ?? 0)) {
        this.pular(this.$('.ct-vale'));
        this.sfx.fogo?.();
      }
      if ((e.aposta?.[1 - eu] ?? 0) > (antes.aposta?.[1 - eu] ?? 0)) this.pular(this.$('.ct-vale2'));
      if (e.silencio?.[eu] && !antes.silencio?.[eu]) this.faixaGrito('SILÊNCIO!', 'O rival te calou: você não pode pedir carta', false);
      if (e.meta !== antes.meta) this.pular(this.$('.ct-meta'));
      if (e.fase === 'fimDaRodada' && antes.fase !== 'fimDaRodada') this.sfx.rodada?.();
    }
    if (e.fase === 'fim' && antes?.fase !== 'fim') {
      const ganhei = e.jogo === 'truco' ? e.vencedor === meuTime : e.vencedor === M.lugar;
      this.fim(ganhei, comDuplas(e.aviso, meuTime), e);
    }
  }

  // os robôs sentados nas cadeiras deles (bonecos de verdade, com nome e balão)
  sincronizarRobos(M) {
    const lugares = M.e?.lugares || [];
    const n = Math.max(lugares.length, M.robos.length);
    for (let k = 0; k < n; k++) {
      const quer = lugares[k]?.bot ? lugares[k].nome : null;
      const r = M.robos[k];
      if (r && r.nome !== quer) {
        r.av.dispose();
        M.robos[k] = null;
      }
      if (!quer || M.robos[k]) continue;
      const av = new Avatar({ name: quer, color: COR_ROBO[k % COR_ROBO.length] });
      const c = cadeira(M.m, k);
      av.setNetworkState([c.x, 0.45, c.z], Math.atan2(M.m.x - c.x, M.m.z - c.z), 4);
      this.world.scene.add(av.group);
      M.robos[k] = { nome: quer, av };
    }
  }

  // ---------------------------------------------------------------- as cartas no 3D
  // O que aparece no centro da mesa (para quem olha de fora e de dentro); o movimento é no update.
  mostrar3d(M, antes) {
    const e = M.e;
    const cartas = this.g3d.mesas[M.i].cartas;
    const usadas = new Set();
    const por = (i, c, alvo, { de = null, chave = c } = {}) => {
      const s = cartas[i];
      usadas.add(i);
      if (s.userData.chave !== chave) {
        s.material.map = texturaCarta(c);
        s.material.needsUpdate = true;
        // carta nova na mesa: voa da cadeira de quem jogou
        s.userData.voo = de ? { t: 0, de } : null;
        s.userData.sai = null;
        s.userData.chave = chave;
      }
      s.userData.alvo = alvo;
      s.visible = true;
    };
    if (e && e.fase !== 'espera') {
      if (e.jogo === 'truco') {
        const pausa = !e.mesaCartas?.length && this.emPausa(M);
        const lista = e.mesaCartas?.length ? e.mesaCartas : pausa ? e.ultimaVaza : [];
        lista.forEach((j, i) => {
          const p = naMesa(M.m, j.lugar, 0.45);
          const c = cadeira(M.m, j.lugar);
          // a minha carta já voou pela tela (ver voarCarta): no 3D ela só aparece
          const de = this.ativa === M && j.lugar === M.lugar ? null : { x: c.x, y: 1.2, z: c.z };
          por(i, j.carta, { x: p.x, y: Y_MESA + 0.01 + i * 0.003, z: p.z, ry: p.ry }, { de, chave: `${j.lugar}:${j.carta}` });
        });
        // a rodada acabou: as cartas vão para o lado de quem fez (empate: ficam)
        if (pausa && lista.length) {
          const forca = (j) => (j.coberta ? -1 : forcaTruco(j.carta));
          const melhor = Math.max(...lista.map(forca));
          const fortes = lista.filter((j) => forca(j) === melhor);
          const ganhou = new Set(fortes.map((j) => j.lugar % 2)).size === 1 ? fortes[0].lugar : null;
          if (ganhou !== null) {
            const c = cadeira(M.m, ganhou);
            lista.forEach((_, i) => {
              cartas[i].userData.sai ||= { desde: M.pausaDesde + 650, x: c.x, z: c.z };
            });
          }
        }
        // o monte, do lado de quem deu as cartas
        const pm = naMesa(M.m, e.dador ?? 0, 0.82);
        por(5, 'verso', { x: pm.x, y: Y_MESA + 0.006, z: pm.z, ry: pm.ry + 0.3 }, { chave: 'monte' });
      } else if (e.jogo === 'vinteum') {
        // as duas mãos, cada uma numa fileira na frente do dono; o monte no meio. A minha carta
        // fechada eu vejo (e a do rival também, com o raio-x)
        let i = 0;
        for (const k of [0, 1]) {
          const lista = e.maos21?.[k] || [];
          const c = cadeira(M.m, k);
          const dx = (c.x - M.m.x) / R_CADEIRA;
          const dz = (c.z - M.m.z) / R_CADEIRA;
          const sentado = this.ativa === M;
          lista.forEach((carta, j) => {
            let face = carta;
            if (sentado && carta === 'verso') face = (k === M.lugar ? M.mao[j] : M.rivalOculta) || 'verso';
            const off = (j - (lista.length - 1) / 2) * 0.25;
            const alvo = { x: M.m.x + dx * 0.47 - dz * off, y: Y_MESA + 0.01 + j * 0.002, z: M.m.z + dz * 0.47 + dx * off, ry: -c.a + Math.PI / 2, esc: 0.78 };
            if (i < 15) por(i++, face, alvo, { de: { x: M.m.x, y: Y_MESA + 0.2, z: M.m.z }, chave: `${k}:${j}:${face}` });
          });
        }
        // os trunfos que cada um pôs na mesa, pequenos, mais para a beirada do lado do dono
        let t = 16;
        for (const k of [0, 1]) {
          const lista = e.mesa21?.[k] || [];
          const c = cadeira(M.m, k);
          const dx = (c.x - M.m.x) / R_CADEIRA;
          const dz = (c.z - M.m.z) / R_CADEIRA;
          lista.forEach((tr, j) => {
            const off = (j - (lista.length - 1) / 2) * 0.2;
            const alvo = { x: M.m.x + dx * 0.88 - dz * off, y: Y_MESA + 0.008, z: M.m.z + dz * 0.88 + dx * off, ry: -c.a + Math.PI / 2, esc: 0.42 };
            if (t < cartas.length) por(t++, `T:${tr}`, alvo, { de: { x: c.x, y: 1.2, z: c.z }, chave: `m${k}:${j}:${tr}` });
          });
        }
        if (e.monte) por(15, 'verso',{ x: M.m.x, y: Y_MESA + 0.006, z: M.m.z, ry: Math.PI / 2 + 0.15, esc: 0.78 }, { chave: 'monte' });
      } else if (e.topo) {
        // quem pôs a carta no topo é a vez anterior (a vez já passou ao próximo). A minha carta já
        // voou pela tela (ver voarCarta): no 3D ela só aparece no lugar dela.
        const quem = e.topo !== antes?.topo ? antes?.vez : null;
        const c = quem != null && quem >= 0 ? cadeira(M.m, quem) : null;
        const de = c && !(this.ativa === M && quem === M.lugar) ? { x: c.x, y: 1.2, z: c.z } : null;
        por(0, e.topo, { x: M.m.x, y: Y_MESA + 0.012, z: M.m.z, ry: 0.3 }, { de, chave: `topo:${e.topo}:${e.monte}` });
        por(1, 'verso', { x: M.m.x + 0.5, y: Y_MESA + 0.01, z: M.m.z, ry: -0.2 }, { chave: 'monte' });
      }
    }
    cartas.forEach((s, i) => {
      if (usadas.has(i)) return;
      s.visible = false;
      s.userData.chave = '';
    });
  }

  // o movimento das cartas da mesa, o pulo do murro e o anel da vez
  anima3d(M, dt, t) {
    const g = this.g3d.mesas[M.i];
    const agora = performance.now();
    M.pulo = Math.max(0, M.pulo - dt * 1.6);
    for (const s of g.cartas) {
      if (!s.visible) continue;
      const u = s.userData;
      const a = u.alvo;
      let { x, y, z, ry } = a;
      let rx = 0;
      let esc = a.esc ?? 1;
      if (u.voo) {
        u.voo.t = Math.min(1, u.voo.t + dt / 0.42);
        const k = saida(u.voo.t);
        x = lerp(u.voo.de.x, a.x, k);
        z = lerp(u.voo.de.z, a.z, k);
        y = lerp(u.voo.de.y, a.y, k) + Math.sin(Math.PI * k) * 0.35;
        ry += (1 - k) * 2.6;
        rx = (1 - k) * 0.7;
        if (u.voo.t >= 1) u.voo = null;
      }
      if (u.sai) {
        const k = Math.min(1, Math.max(0, (agora - u.sai.desde) / 500));
        const k2 = k * k;
        x = lerp(x, lerp(M.m.x, u.sai.x, 0.75), k2);
        z = lerp(z, lerp(M.m.z, u.sai.z, 0.75), k2);
        esc *= 1 - 0.35 * k2;
      }
      if (M.pulo > 0) y += Math.abs(Math.sin((1 - M.pulo) * Math.PI * 3)) * 0.09 * M.pulo;
      s.position.set(x, y, z);
      s.rotation.set(rx, ry, 0);
      s.scale.setScalar(esc);
    }
    // o anel: na frente de quem joga (vermelho com um pedido no ar)
    const e = M.e;
    const k = e && (e.fase === 'jogando' || e.fase === 'dez') ? e.vez : null;
    g.anel.visible = k !== null && k !== undefined && !!e.lugares[k];
    if (g.anel.visible) {
      const p = naMesa(M.m, k, 0.86);
      g.anel.position.set(p.x, Y_MESA + 0.006, p.z);
      g.anel.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
      g.anel.material.color.set(e.pedido ? 0xfe5f55 : 0xf5b244);
    }
  }

  // ---------------------------------------------------------------- sentar e levantar
  mesaPerto() {
    const p = this.player.pos;
    return this.mesas.find((M) => Math.hypot(p.x - M.m.x, p.z - M.m.z) < R_CADEIRA + 1.2 && p.y < 2) || null;
  }

  usarE() {
    const M = this.mesaPerto();
    if (!M || !this.ligado(M.m.jogo)) return false;
    // solta o mouse e abre o seletor de cadeira; sentar acontece no clique (sentarNa)
    if (this.focar?.()) {
      this.escolhendo = M;
      this.abrirEscolha(M);
    }
    return true;
  }

  // o seletor: cada botão na posição da cadeira de verdade (lugar 0 ao sul, girando para leste).
  // Cadeira com gente não dá para escolher; a do robô dá (ele levanta e deixa as cartas).
  abrirEscolha(M) {
    const e = M.e;
    const n = LUGARES[M.m.jogo];
    const truco = M.m.jogo === 'truco';
    this.escolha.querySelector('h3').textContent = `Sentar na mesa de ${NOME_JOGO[M.m.jogo]}`;
    this.escolha.querySelector('p').textContent = truco
      ? 'No truco a dupla é você e quem senta do outro lado. A cor da borda mostra a dupla da cadeira.'
      : 'Escolha a cadeira: nas de robô, ele levanta para você.';
    this.escolha.querySelector('.ct-roda').innerHTML = [...Array(n)].map((_, k) => {
      const l = e?.lugares[k];
      const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
      const estilo = `left:${50 + Math.cos(a) * 42}%;top:${50 + Math.sin(a) * 42}%${truco ? `;--time:${k % 2 ? '#fe5f55' : '#009dff'}` : ''}`;
      if (l && !l.bot) return `<button type="button" class="ct-cadeira" style="${estilo}" disabled title="${esc(l.nome)} já sentou aqui">${esc(l.nome)}</button>`;
      if (l) return `<button type="button" class="ct-cadeira robo" data-sentar="${k}" style="${estilo}" title="Sentar no lugar de ${esc(l.nome)}">🤖<small>${esc(l.nome)}</small></button>`;
      const time = truco ? `<small>${k % 2 ? 'Dupla vermelha' : 'Dupla azul'}</small>` : '';
      return `<button type="button" class="ct-cadeira" data-sentar="${k}" style="${estilo}">Sentar${time}</button>`;
    }).join('');
    this.escolha.hidden = false;
  }

  // clicou numa cadeira do seletor: senta nela
  sentarNa(M, k) {
    this.socket?.emit('ct-entrar', { mesa: M.i, lugar: k }, (r) => {
      if (r?.erro === 'cheia') {
        this.escolha.hidden = true;
        return hud.mensagem('Mesa cheia', '', 1500);
      }
      if (r?.erro === 'ocupado') return hud.mensagem('Alguém sentou aí', 'Escolha outra cadeira', 1500);
      if (!r?.ok) return;
      this.escolha.hidden = true;
      M.lugar = r.lugar;
      this.ativa = M;
      // senta na cadeira, virado para a mesa (o mouse já está solto: o seletor abriu focado)
      const c = cadeira(M.m, r.lugar);
      const yaw = Math.atan2(-(M.m.x - c.x), -(M.m.z - c.z));
      this.player.sentarEm({ x: c.x, y: 0.45, z: c.z, yaw });
      this.player.override = this.pose(M);
      this.raiz.hidden = false;
      document.body.classList.add('ct-sentado');
      this.chaveMao = '';
      this.ladoDe = '';
      this.distribuir = true;
      this.desenhar();
      this.sfx.teleport();
    });
  }

  // a câmera atrás da minha cadeira, olhando um pouco para cá do centro: a mesa sobe na tela e
  // sobra lugar para a mão embaixo
  pose(M) {
    const c = cadeira(M.m, Math.max(0, M.lugar));
    const dx = c.x - M.m.x;
    const dz = c.z - M.m.z;
    const d = Math.hypot(dx, dz) || 1;
    return {
      position: new THREE.Vector3(M.m.x + (dx / d) * (R_CADEIRA + 1.25), 3.05, M.m.z + (dz / d) * (R_CADEIRA + 1.25)),
      target: new THREE.Vector3(M.m.x + (dx / d) * 0.45, Y_MESA - 0.1, M.m.z + (dz / d) * 0.45),
    };
  }

  // o main.js tirou o foco (Esc, E, botão): levanta e sai da mesa
  sairDaMesa() {
    this.escolha.hidden = true; // o seletor de cadeira aberto some junto
    if (!this.ativa) return;
    this.ativa = null;
    this.coberta = false;
    this.esperandoCor = null;
    this.cores.hidden = true;
    this.raiz.hidden = true;
    this.zoar.hidden = true;
    this.sinal.hidden = true;
    this.menu.hidden = true;
    this.$('.ct-fim').hidden = true;
    this.$('.ct-pergunta').hidden = true;
    this.$('#ct-trunfo').hidden = true;
    this.chavePergunta = '';
    this.armado = null;
    document.body.classList.remove('ct-sentado');
    this.player.override = null;
    this.player.stand();
    this.socket?.emit('ct-sair');
  }

  // ---------------------------------------------------------------- jogar
  podeJogar(M, c) {
    const e = M.e;
    if (!e || e.fase !== 'jogando' || e.vez !== M.lugar) return false;
    if (e.jogo === 'vinteum') return false; // no 21 não se joga carta: pede, para ou usa trunfo
    if (e.jogo === 'truco') return !e.pedido && !this.emPausa(M);
    return podeJogarUno(c, e.topo, e.cor);
  }

  // clique numa carta: joga (virada, se a COBERTA estiver ligada)
  clicarCarta(c, el) {
    const M = this.ativa;
    if (!M) return;
    if (!this.podeJogar(M, c)) {
      el?.classList.remove('nao');
      void el?.offsetWidth;
      el?.classList.add('nao');
      return;
    }
    this.jogar(c, this.coberta);
  }

  jogar(carta, coberta = false) {
    const M = this.ativa;
    if (!M || !carta || !this.podeJogar(M, carta)) return;
    if (M.e?.jogo === 'uno' && coringa(carta)) {
      this.esperandoCor = carta;
      this.cores.hidden = false;
      return;
    }
    this.voarCarta(carta, coberta);
    this.socket?.emit('ct-jogar', { mesa: M.i, carta, coberta: M.e?.jogo === 'truco' && coberta });
    this.coberta = false;
    this.marcarCoberta();
    this.sfx.dado(0.8);
    this.sfx.cartaVoa?.();
  }

  // a carta sai da mão voando até o lugar dela na mesa (a cópia, por cima de tudo)
  voarCarta(carta, coberta) {
    const M = this.ativa;
    const el = this.mao.querySelector(`[data-carta="${CSS.escape(carta)}"] .ct-face`);
    if (!el || !M) return;
    const r = el.getBoundingClientRect();
    const p = M.e?.jogo === 'truco' ? naMesa(M.m, M.lugar, 0.45) : { x: M.m.x, z: M.m.z };
    const v = new THREE.Vector3(p.x, Y_MESA, p.z).project(this.world.camera);
    const x = ((v.x + 1) / 2) * innerWidth;
    const y = ((1 - v.y) / 2) * innerHeight;
    const copia = el.cloneNode(true);
    if (coberta) copia.style.backgroundImage = `url(${urlCarta('verso')})`;
    Object.assign(copia.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 40, pointerEvents: 'none', transform: 'none' });
    document.body.append(copia);
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const giro = (Math.random() - 0.5) * 50;
    const anim = copia.animate([
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) rotate(${giro / 2}deg) scale(.8)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${giro}deg) scale(.42)`, opacity: 0.85 },
    ], { duration: 420, easing: 'cubic-bezier(.3,.6,.4,1)' });
    anim.onfinish = () => copia.remove();
    anim.oncancel = () => copia.remove();
  }

  tecla(ev) {
    const M = this.ativa;
    if (!M || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const n = Number(ev.key);
    if (M.e?.jogo === 'vinteum') {
      // 1, 2, 3...: usa o trunfo; espaço: pede carta; S: para
      if (n >= 1 && n <= 9 && M.trunfos?.[n - 1]) this.usarTrunfo(M.trunfos[n - 1]);
      else if (ev.code === 'Space' || ev.code === 'KeyS') {
        ev.preventDefault();
        this.emit21(ev.code === 'Space' ? 'pedir' : 'parar');
      }
      return;
    }
    if (n >= 1 && n <= 9) {
      const mao = this.maoOrdenada(M);
      const c = mao[n - 1];
      if (c) this.clicarCarta(c, this.mao.querySelector(`[data-carta="${CSS.escape(c)}"]`));
    } else if (ev.code === 'Space' && M.e?.jogo === 'truco') {
      ev.preventDefault();
      if (this.raiz.querySelector('[data-acao="truco:pedir"]')) this.emitTruco('pedir');
    }
  }

  emitTruco(acao) {
    const M = this.ativa;
    if (M) this.socket?.emit('ct-truco', { mesa: M.i, acao });
  }

  // 21: só na minha vez (o servidor confere de novo)
  minhaVez21(M = this.ativa) {
    const e = M?.e;
    return !!e && e.jogo === 'vinteum' && e.fase === 'jogando' && e.vez === M.lugar;
  }

  emit21(acao, trunfo) {
    const M = this.ativa;
    if (!this.minhaVez21(M)) return;
    if (acao === 'pedir' && !M.e.monte) return hud.mensagem('O baralho acabou', 'Agora é parar', 1400);
    if (acao === 'pedir' && M.e.silencio?.[M.lugar]) return hud.mensagem('Silêncio!', 'Você não pode pedir carta: destrua o Silêncio do rival', 1800);
    this.socket?.emit('ct-21', { mesa: M.i, acao, trunfo });
    if (acao === 'pedir') this.sfx.cartaVoa?.();
    else if (acao === 'parar') this.sfx.bip?.();
  }

  usarTrunfo(chave, el) {
    const M = this.ativa;
    if (!this.minhaVez21(M)) {
      el?.classList.remove('nao');
      void el?.offsetWidth;
      el?.classList.add('nao');
      return;
    }
    this.emit21('trunfo', chave);
    this.sfx.dado?.(0.8);
  }

  maoOrdenada(M) {
    const e = M.e;
    return e?.jogo === 'truco' && !e.ferro ? [...M.mao].sort((a, b) => forcaTruco(a) - forcaTruco(b)) : M.mao;
  }

  emPausa(M) {
    return performance.now() < (M.pausaAte || 0);
  }

  // ---------------------------------------------------------------- o painel (Balatro)
  $(s) { return this.raiz.querySelector(s); }

  montarHud() {
    const css = document.createElement('style');
    const contorno = (c, p = 2) => `${p}px 0 0 ${c}, -${p}px 0 0 ${c}, 0 ${p}px 0 ${c}, 0 -${p}px 0 ${c}, ${p}px ${p}px 0 ${c}, -${p}px ${p}px 0 ${c}, ${p}px -${p}px 0 ${c}, -${p}px -${p}px 0 ${c}`;
    css.textContent = `
#ct-hud { position: fixed; inset: 0; z-index: 33; pointer-events: none; color: #fff; font: 700 15px ${PIXEL}; letter-spacing: .02em; }
#ct-hud[hidden], #ct-hud [hidden], #ct-cores[hidden] { display: none !important; }
#ct-hud button { font: inherit; letter-spacing: inherit; cursor: pointer; pointer-events: auto; }
#ct-hud.treme { animation: ct-treme .42s linear; }
body.ct-sentado #controls-help, body.ct-sentado #sit-hint { display: none !important; }
.ct-b { --cor: #009dff; --sombra: #00609c; padding: 9px 14px; border: 0; border-radius: 10px; background: var(--cor); color: #fff; text-transform: uppercase;
  box-shadow: 0 4px 0 var(--sombra); text-shadow: 0 2px 0 rgba(0,0,0,.3); transition: transform .08s ease, box-shadow .08s ease, filter .12s; white-space: nowrap; }
.ct-b:hover { transform: translateY(-2px); box-shadow: 0 6px 0 var(--sombra); filter: brightness(1.08); }
.ct-b:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--sombra); }
.ct-b:disabled { filter: grayscale(.8) brightness(.65); transform: none; box-shadow: 0 4px 0 var(--sombra); cursor: default; }
.ct-b.vermelho { --cor: #fe5f55; --sombra: #a8352e; } .ct-b.laranja { --cor: #ff9800; --sombra: #a86400; }
.ct-b.verde { --cor: #4bc292; --sombra: #2b7a5b; } .ct-b.roxo { --cor: #a782d1; --sombra: #6b4f8f; }
.ct-b.cinza { --cor: #5f7377; --sombra: #3a4a4d; } .ct-b.ouro { --cor: #f5b244; --sombra: #a8741f; color: #3b2a06; text-shadow: none; }
.ct-b.grande { font-size: 24px; padding: 12px 18px; border-radius: 12px; }
.ct-b.truco { animation: ct-pulsa 1.1s ease-in-out infinite; }
.ondas > span { display: inline-block; animation: ct-onda 1.7s ease-in-out infinite; animation-delay: calc(var(--i) * -.11s); }
.ct-painel { background: #3a5055; border-radius: 14px; box-shadow: 0 5px 0 #1e2b2d, 0 14px 30px rgba(0,0,0,.35); }
.ct-caixa { background: #1e2b2d; border-radius: 10px; }
/* a coluna do placar */
.ct-lado { position: absolute; left: 78px; top: 64px; width: 188px; padding: 8px; display: grid; gap: 7px; pointer-events: auto; }
.ct-titulo { text-align: center; padding: 7px 4px 9px; border-radius: 10px; font-size: 24px; background: #fe5f55; box-shadow: 0 4px 0 #a8352e; text-shadow: 0 3px 0 rgba(0,0,0,.3); }
.ct-titulo.uno { background: #f5b244; box-shadow: 0 4px 0 #a8741f; color: #3b2a06; text-shadow: none; }
.ct-placar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 4px; padding: 6px; }
.ct-placar > div { position: relative; }
.ct-placar small, .ct-linha2 small, .ct-manilhas small { display: block; font-size: 11px; color: #a9bfc2; text-align: center; letter-spacing: .08em; }
.ct-num { display: block; position: relative; text-align: center; font-size: 34px; line-height: 1.15; border-radius: 8px; }
.ct-num.azul { background: #009dff; box-shadow: 0 3px 0 #00609c; } .ct-num.vermelho { background: #fe5f55; box-shadow: 0 3px 0 #a8352e; }
.ct-x { color: #fe5f55; font-size: 22px; padding-bottom: 6px; }
.ct-linha2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; }
.ct-linha2 small { text-align: left; }
.ct-vale { position: relative; isolation: isolate; min-width: 44px; text-align: center; font-size: 26px; padding: 0 8px; border-radius: 8px; background: #ff9800; box-shadow: 0 3px 0 #a86400; }
.ct-vale[data-fogo]::before { content: ''; position: absolute; inset: -14px -6px -2px; z-index: -1; border-radius: 40% 40% 10px 10px;
  background: radial-gradient(ellipse at 50% 100%, #fff3a0 0%, #ffb300 30%, #ff5a00 58%, transparent 72%); filter: blur(2px);
  animation: ct-fogo .32s steps(3) infinite alternate; transform-origin: 50% 100%; }
.ct-vale[data-fogo="2"]::before { inset: -22px -10px -2px; } .ct-vale[data-fogo="3"]::before { inset: -30px -14px -2px; }
.ct-rodadas { display: flex; gap: 6px; } .ct-rodadas i { width: 18px; height: 18px; border-radius: 5px; background: #2b3d40; box-shadow: inset 0 2px 0 rgba(0,0,0,.35); }
.ct-rodadas i.nos { background: #009dff; box-shadow: 0 2px 0 #00609c; } .ct-rodadas i.eles { background: #fe5f55; box-shadow: 0 2px 0 #a8352e; }
.ct-rodadas i.empate { background: #e9e4d6; box-shadow: 0 2px 0 #9b958a; }
.ct-manilhas { padding: 6px 8px 8px; } .ct-manilhas span { display: flex; justify-content: center; gap: 4px; margin-top: 4px; }
.ct-manilhas img { width: 34px; height: 45px; border-radius: 4px; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
.ct-uno-cor { width: 46px; height: 26px; border-radius: 7px; box-shadow: 0 3px 0 rgba(0,0,0,.35); }
.ct-sentido { font-size: 26px; display: inline-block; animation: ct-gira 2.4s linear infinite; } .ct-sentido.anti { animation-direction: reverse; }
.ct-lado .ct-b { width: 100%; }
.ct-dica { font-size: 12px; color: #a9bfc2; text-align: center; line-height: 1.3; padding: 0 2px; }
/* as plaquinhas em cima das cadeiras */
.ct-assento { position: absolute; left: 0; top: 0; display: grid; justify-items: center; gap: 3px; will-change: transform; }
.ct-placa { display: flex; align-items: center; gap: 6px; padding: 3px 8px 4px; border-radius: 9px; background: #3a5055; box-shadow: 0 3px 0 #1e2b2d;
  border: 2px solid var(--time, #5f7377); white-space: nowrap; font-size: 14px; }
.ct-assento.vez .ct-placa { border-color: #f5b244; animation: ct-vez .8s ease-in-out infinite; }
.ct-dorso { display: flex; } .ct-dorso i { width: 9px; height: 13px; margin-left: -3px; border-radius: 2px; background: #d64541; box-shadow: inset 0 0 0 1.5px #fff4e6; }
.ct-mini { display: flex; gap: 4px; }
.ct-mini button { width: 28px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: #1e2b2d; box-shadow: 0 2px 0 #11191a; font-size: 14px; line-height: 26px; transition: transform .1s; }
.ct-mini button:hover { transform: scale(1.18) rotate(-10deg); }
.ct-balao { position: absolute; bottom: calc(100% + 8px); left: 50%; translate: -50% 0; padding: 6px 10px; border-radius: 10px; background: #fff4e6; color: #1e2b2d;
  box-shadow: 0 3px 0 rgba(0,0,0,.35); white-space: nowrap; font-size: 15px; animation: ct-balao .35s cubic-bezier(.2,1.6,.4,1) both; }
.ct-balao::after { content: ''; position: absolute; left: 50%; top: 100%; margin-left: -6px; border: 6px solid transparent; border-top-color: #fff4e6; }
.ct-balao.forte { background: #fe5f55; color: #fff; font-size: 20px; } .ct-balao.forte::after { border-top-color: #fe5f55; }
/* plaquinha lá no alto da tela: o balão sai por baixo */
.ct-assento.topo .ct-balao { bottom: auto; top: calc(100% + 8px); }
.ct-assento.topo .ct-balao::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: #fff4e6; }
.ct-assento.topo .ct-balao.forte::after { border-bottom-color: #fe5f55; }
/* embaixo: aviso, botões, a mão e o tempo */
.ct-baixo { position: absolute; left: 50%; bottom: 70px; translate: -50% 0; display: grid; justify-items: center; gap: 6px; width: max-content; max-width: 98vw; }
.ct-aviso { padding: 5px 12px; border-radius: 9px; background: #1e2b2d; box-shadow: 0 3px 0 #11191a; font-size: 15px; text-shadow: none; max-width: 92vw; text-align: center; }
.ct-aviso.novo { animation: ct-balao .35s cubic-bezier(.2,1.6,.4,1) both; }
.ct-linha { display: flex; align-items: flex-end; gap: 14px; }
.ct-esq, .ct-dir { display: grid; gap: 10px; align-content: end; padding-bottom: 6px; }
.ct-tempo { width: min(320px, 70vw); height: 8px; border-radius: 99px; background: #1e2b2d; overflow: hidden; }
.ct-tempo i { display: block; height: 100%; background: #f5b244; transform-origin: left; animation: ct-prazo linear forwards; }
.ct-mao { display: flex; align-items: flex-end; justify-content: center; padding-top: 34px; min-height: 128px; pointer-events: auto; }
.ct-mao.vez .ct-face { box-shadow: 0 6px 0 rgba(0,0,0,.28), 0 0 0 2px rgba(245,178,68,.55); }
.ct-carta { position: relative; width: 96px; height: 128px; padding: 0; border: 0; background: none; margin: 0 var(--junta, -6px); rotate: var(--rot, 0deg); translate: 0 var(--desce, 0px); transition: rotate .2s, translate .2s; }
.ct-carta.chega { animation: ct-chega .5s cubic-bezier(.2,1.4,.4,1) both; animation-delay: var(--chega, 0s); }
.ct-carta.nao { animation: ct-nao .3s linear; }
.ct-balanca { width: 100%; height: 100%; animation: ct-balanca 3.4s ease-in-out infinite; animation-delay: var(--atraso, 0s); }
.ct-face { width: 100%; height: 100%; border-radius: 10px; background: center / 100% 100% no-repeat; box-shadow: 0 6px 0 rgba(0,0,0,.28);
  transform: perspective(520px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(var(--sobe, 0px)) scale(var(--zoom, 1));
  transition: transform .14s ease-out, box-shadow .14s, filter .14s; }
.ct-carta.pode:hover .ct-face { --sobe: -14px; --zoom: 1.07; }
.ct-b.laranja.liga { --cor: #ffb74d; box-shadow: 0 4px 0 var(--sombra), 0 0 0 3px #fff, 0 0 18px #ff9800; }
.ct-mao.coberta .ct-carta.pode .ct-face { box-shadow: 0 6px 0 rgba(0,0,0,.28), 0 0 0 3px #ff9800; }
.ct-mao.coberta .ct-carta.pode:hover .ct-face { background-image: var(--verso) !important; }
.ct-carta:not(.pode) .ct-face { filter: brightness(.74) saturate(.75); }
.ct-carta:disabled { cursor: default; }
/* a pergunta do truco e da mão de onze */
.ct-pergunta { position: absolute; left: 50%; top: 13%; translate: -50% 0; padding: 10px 16px 14px; min-width: 300px; text-align: center; pointer-events: auto;
  animation: ct-entra .42s cubic-bezier(.2,1.5,.4,1) both; }
.ct-pergunta h2 { margin: 0; font-size: 56px; line-height: 1.1; font-weight: 700; color: #fe5f55; text-shadow: ${contorno('#1e2b2d', 3)}, 0 7px 0 #1e2b2d; }
.ct-pergunta h2.dez { color: #f5b244; }
.ct-pergunta p { margin: 4px 0 10px; font-size: 16px; color: #e9e4d6; }
.ct-pergunta .ct-botoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.ct-pergunta .ct-parceiro { display: flex; gap: 6px; justify-content: center; margin-bottom: 10px; }
.ct-pergunta .ct-parceiro img { width: 58px; height: 78px; border-radius: 7px; box-shadow: 0 4px 0 rgba(0,0,0,.3); }
.ct-pergunta .ct-tempo { margin: 12px auto 0; }
/* o megafone e os sinais do truco (a lista ficou grande: rola dentro do painel) */
.ct-zoar { position: absolute; bottom: calc(100% + 10px); right: 0; padding: 8px; display: grid; gap: 6px; width: 230px; max-height: min(48vh, 430px); overflow-y: auto; pointer-events: auto; animation: ct-balao .3s cubic-bezier(.2,1.6,.4,1) both; scrollbar-width: thin; scrollbar-color: #a782d1 transparent; }
.ct-zoar::-webkit-scrollbar { width: 8px; }
.ct-zoar::-webkit-scrollbar-thumb { background: #a782d1; border-radius: 4px; }
.ct-zoar button { text-align: left; padding: 7px 10px; border: 0; border-radius: 8px; background: #1e2b2d; color: #fff; box-shadow: 0 2px 0 #11191a; }
.ct-zoar button:hover { background: #a782d1; }
.ct-zoar button.sorte { position: sticky; top: 0; z-index: 1; background: #5b3a8c; font-size: 13px; color: #f5e9ff; }
.ct-sinais { right: 240px; }
.ct-sinais button { display: flex; align-items: center; gap: 8px; }
.ct-sinais button:hover { background: #4c7a3f; }
.ct-sinais img { width: 24px; height: 32px; border-radius: 3px; box-shadow: 0 2px 0 rgba(0,0,0,.4); flex: none; }
.ct-dir { position: relative; }
/* o sinal: balão roxo, segredo */
.ct-balao.segredo { background: #6d4fa1; color: #fff; }
.ct-balao.segredo::after { border-top-color: #6d4fa1; }
.ct-assento.topo .ct-balao.segredo::after { border-top-color: transparent; border-bottom-color: #6d4fa1; }
/* a mini carta nos balões dos sinais */
.ct-balaocarta { width: 26px; height: 35px; margin-left: 4px; vertical-align: middle; border-radius: 3px; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
/* o menu do que jogar e o objeto voando */
.ct-arremesso { position: absolute; bottom: calc(100% + 8px); left: 50%; translate: -50% 0; z-index: 3; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; padding: 8px; pointer-events: auto; animation: ct-balao .25s cubic-bezier(.2,1.6,.4,1) both; }
.ct-assento.topo .ct-arremesso { bottom: auto; top: calc(100% + 8px); }
.ct-arremesso button { width: 40px; height: 38px; padding: 0; border: 0; border-radius: 9px; background: #1e2b2d; box-shadow: 0 2px 0 #11191a; font-size: 20px; transition: transform .1s; }
.ct-arremesso button:hover { transform: scale(1.15) rotate(-8deg); }
.ct-voo { position: absolute; z-index: 4; font-size: 34px; pointer-events: none; filter: drop-shadow(0 3px 2px rgba(0,0,0,.4)); }
/* a faixa do grito, o clarão e o fim */
#ct-grito { position: absolute; left: 50%; top: 30%; translate: -50% -50%; text-align: center; width: max-content; max-width: 96vw; pointer-events: none; }
#ct-grito b { display: block; font-size: clamp(54px, 11vw, 128px); line-height: 1; color: #f5b244; text-shadow: ${contorno('#7f1d1d', 4)}, 0 10px 0 #7f1d1d; }
#ct-grito.nosso b { color: #fff4e6; text-shadow: ${contorno('#00609c', 4)}, 0 10px 0 #00609c; }
#ct-grito > span { display: inline-block; margin-top: 12px; padding: 6px 14px; border-radius: 10px; background: #1e2b2d; box-shadow: 0 3px 0 #11191a; font-size: 18px; }
#ct-grito.anda { animation: ct-grito .9s cubic-bezier(.2,1.5,.4,1) both; }
.ct-flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, transparent 40%, var(--cor, #fe5f55) 100%); }
.ct-flash.vai { animation: ct-flash .8s ease-out; }
.ct-mais { position: absolute; z-index: 2; left: 50%; top: -6px; translate: -50% 0; font-size: 22px; color: #f5b244; text-shadow: ${contorno('#1e2b2d', 2)}; animation: ct-mais 1s ease-out forwards; pointer-events: none; }
.pula { animation: ct-pula .45s cubic-bezier(.2,1.8,.4,1); }
.carimbo { animation: ct-carimbo .4s cubic-bezier(.2,1.6,.4,1); }
.ct-fim { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(10,16,18,.55); pointer-events: auto; overflow: hidden; }
.ct-fim > div { text-align: center; padding: 18px 26px 22px; animation: ct-entra .5s cubic-bezier(.2,1.5,.4,1) both; }
.ct-fim h2 { margin: 0; font-size: clamp(56px, 10vw, 110px); line-height: 1.05; color: #f5b244; text-shadow: ${contorno('#1e2b2d', 4)}, 0 9px 0 #1e2b2d; }
.ct-fim.perdeu h2 { color: #a9bfc2; }
.ct-fim p { margin: 8px 0 14px; font-size: 18px; }
.ct-confete { position: absolute; top: -20px; width: 10px; height: 14px; animation: ct-cai linear forwards; }
#ct-cores { position: fixed; inset: 0; z-index: 34; display: grid; place-items: center; background: rgba(10,16,18,.5); }
#ct-cores > div { display: flex; gap: 12px; padding: 14px; border-radius: 14px; background: #3a5055; box-shadow: 0 5px 0 #1e2b2d; }
#ct-cores button { width: 64px; height: 64px; border-radius: 12px; border: 0; cursor: pointer; box-shadow: 0 4px 0 rgba(0,0,0,.4); transition: transform .1s; }
#ct-cores button:hover { transform: translateY(-3px) scale(1.06); }
/* o seletor de cadeira: a mesa vista de cima, cada botão na posição da cadeira de verdade */
#ct-sentar { position: fixed; inset: 0; z-index: 34; display: grid; place-items: center; background: rgba(10,16,18,.45); color: #fff; font: 700 15px ${PIXEL}; }
#ct-sentar[hidden] { display: none !important; }
#ct-sentar > div { display: grid; justify-items: center; gap: 12px; padding: 18px 22px; }
#ct-sentar h3 { margin: 0; font-size: 21px; color: #fff4e6; }
#ct-sentar p { margin: 0; font-size: 13px; color: #a9bfc2; max-width: 330px; text-align: center; }
.ct-roda { position: relative; width: 250px; height: 250px; border-radius: 50%; background: radial-gradient(circle, #7a5c3d 0 30%, #5b4230 31% 40%, transparent 41%); }
.ct-cadeira { position: absolute; translate: -50% -50%; min-width: 76px; padding: 8px 10px; border: 2px solid var(--time, #5f7377); border-radius: 10px; background: #3a5055; color: #fff; box-shadow: 0 3px 0 #1e2b2d; cursor: pointer; font: inherit; font-size: 14px; transition: scale .12s; }
.ct-cadeira:hover:not(:disabled) { scale: 1.12; }
.ct-cadeira:disabled { opacity: .7; cursor: default; background: #2b3d40; }
.ct-cadeira.robo { background: #2b3d40; }
.ct-cadeira small { display: block; font-size: 11px; color: #a9bfc2; }
@keyframes ct-onda { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-3px) rotate(-2deg); } }
@keyframes ct-balanca { 0%, 100% { transform: translateY(0) rotate(-1.2deg); } 50% { transform: translateY(-5px) rotate(1.2deg); } }
@keyframes ct-chega { from { transform: translate(-40vw, 40vh) rotate(-40deg); opacity: 0; } 60% { opacity: 1; } to { transform: none; } }
@keyframes ct-nao { 0%, 100% { transform: none; } 25% { transform: translateX(-6px) rotate(-3deg); } 75% { transform: translateX(6px) rotate(3deg); } }
@keyframes ct-pulsa { 0%, 100% { box-shadow: 0 4px 0 var(--sombra), 0 0 0 0 rgba(254,95,85,.6); } 50% { box-shadow: 0 4px 0 var(--sombra), 0 0 0 9px rgba(254,95,85,0); } }
@keyframes ct-fogo { from { transform: scaleY(.88) skewX(-4deg); opacity: .8; } to { transform: scaleY(1.12) skewX(4deg); opacity: 1; } }
@keyframes ct-gira { to { transform: rotate(360deg); } }
@keyframes ct-vez { 0%, 100% { translate: 0 0; } 50% { translate: 0 -4px; } }
@keyframes ct-balao { from { transform: scale(.3); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ct-entra { from { transform: scale(.4) rotate(-6deg); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ct-prazo { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes ct-grito { 0% { transform: scale(.25) rotate(-10deg); opacity: 0; } 35% { transform: scale(1.15) rotate(3deg); opacity: 1; }
  50% { transform: scale(1) translateX(-9px) rotate(-2deg); } 65% { transform: translateX(9px) rotate(2deg); } 80% { transform: translateX(-4px); } 100% { transform: none; } }
@keyframes ct-flash { 0% { opacity: 0; } 15% { opacity: .85; } 100% { opacity: 0; } }
@keyframes ct-treme { 0%, 100% { transform: none; } 20% { transform: translate(-7px, 3px); } 40% { transform: translate(6px, -4px); } 60% { transform: translate(-4px, -2px); } 80% { transform: translate(3px, 3px); } }
@keyframes ct-mais { from { transform: translateY(0) scale(.6); opacity: 0; } 20% { transform: translateY(-8px) scale(1.25); opacity: 1; } to { transform: translateY(-46px) scale(1); opacity: 0; } }
@keyframes ct-pula { 0% { transform: scale(1); } 40% { transform: scale(1.35) rotate(-6deg); } 70% { transform: scale(.94) rotate(3deg); } 100% { transform: none; } }
@keyframes ct-carimbo { from { transform: scale(2.4) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ct-cai { to { transform: translateY(110vh) rotate(var(--giro, 540deg)); } }
@media (prefers-reduced-motion: reduce) {
  .ondas > span, .ct-balanca, .ct-b.truco, .ct-vale[data-fogo]::before, .ct-sentido, .ct-assento.vez .ct-placa { animation: none; }
  #ct-hud.treme, #ct-grito.anda, .ct-carta.chega { animation: none; }
}
body.touch .ct-lado { left: calc(6px + env(safe-area-inset-left)); top: calc(54px + env(safe-area-inset-top)); width: 150px; padding: 6px; gap: 5px; }
body.touch .ct-titulo { font-size: 18px; padding: 4px 4px 6px; } body.touch .ct-num { font-size: 24px; } body.touch .ct-vale { font-size: 20px; }
body.touch .ct-manilhas { display: none; }
body.touch .ct-baixo { bottom: calc(6px + env(safe-area-inset-bottom)); gap: 4px; }
body.touch .ct-carta { width: 64px; height: 86px; } body.touch .ct-mao { min-height: 86px; padding-top: 24px; }
body.touch .ct-b { padding: 7px 10px; font-size: 13px; } body.touch .ct-b.grande { font-size: 17px; padding: 9px 12px; }
body.touch .ct-pergunta { top: 8%; min-width: 0; width: min(92vw, 360px); } body.touch .ct-pergunta h2 { font-size: 40px; }
body.touch .ct-placa { font-size: 12px; }
/* os números do placar na fonte cheia (na pixelada o 2 parece 3) */
.ct-num, .ct-vale, .ct-vale2, .ct-monte, .ct-meta { font-family: ${NUMERO}; font-weight: 800; }
.ct-vale2 { min-width: 44px; text-align: center; font-size: 22px; padding: 0 8px; border-radius: 8px; background: #5f7377; box-shadow: 0 3px 0 #3a4a4d; }
.ct-mesa21 { padding: 6px 8px 8px; } .ct-mesa21 small { display: block; font-size: 11px; color: #a9bfc2; text-align: center; letter-spacing: .08em; }
.ct-namesa { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; margin-top: 4px; }
.ct-namesa img { width: 30px; height: 40px; border-radius: 4px; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
.ct-namesa em { font-size: 12px; color: #6b8285; }
.ct-rival .ct-namesa { margin: 0; max-width: 140px; }
/* 21: o placar dos dedos, a meta, a contagem das cartas */
.ct-titulo.v21 { background: #4bc292; box-shadow: 0 4px 0 #2b7a5b; font: 800 30px ${NUMERO}; padding: 4px 4px 6px; }
.ct-meta { min-width: 44px; text-align: center; font-size: 24px; padding: 0 8px; border-radius: 8px; background: #a782d1; box-shadow: 0 3px 0 #6b4f8f; }
.ct-dedos { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; width: 52px; margin: 5px auto 0; }
.ct-dedos i { width: 7px; height: 15px; border-radius: 4px 4px 2px 2px; background: #f6d7b0; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
.ct-dedos i.foi { background: #2b3d40; box-shadow: inset 0 2px 0 rgba(0,0,0,.4); }
.ct-conta { padding: 6px 8px 8px; } .ct-conta small { display: block; font-size: 11px; color: #a9bfc2; text-align: center; letter-spacing: .08em; }
.ct-conta small b { color: #fff; font-size: 13px; }
.ct-conta > span { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-top: 5px; }
.ct-conta i { font: normal 800 13px/22px ${NUMERO}; text-align: center; border-radius: 5px; background: #2b3d40; color: #e9e4d6; }
.ct-conta i.minha { background: #009dff; box-shadow: 0 2px 0 #00609c; } .ct-conta i.rival { background: #fe5f55; box-shadow: 0 2px 0 #a8352e; }
.ct-conta i.fora { background: transparent; color: #6b8285; text-decoration: line-through; }
/* 21: o rival lá em cima, a soma da minha mão, os trunfos */
.ct-rival { position: absolute; left: 50%; top: 62px; translate: -50% 0; display: flex; align-items: center; gap: 10px; padding: 8px 12px; pointer-events: auto; }
.ct-rival .ct-cartas { display: flex; gap: 4px; } .ct-rival img { width: 46px; height: 61px; border-radius: 6px; box-shadow: 0 3px 0 rgba(0,0,0,.3); }
.ct-rival img.raiox { outline: 3px solid #73ffcc; }
.ct-rival .ct-somar { font: 800 26px ${NUMERO}; padding: 2px 10px; border-radius: 8px; background: #fe5f55; box-shadow: 0 3px 0 #a8352e; white-space: nowrap; }
.ct-rival .ct-quem { display: grid; gap: 2px; font-size: 14px; white-space: nowrap; } .ct-rival .ct-quem small { color: #a9bfc2; font-size: 12px; }
.ct-soma { display: grid; justify-items: center; padding: 6px 12px; font: 800 36px/1 ${NUMERO}; }
.ct-soma small { font: 700 11px ${PIXEL}; color: #a9bfc2; letter-spacing: .08em; margin: 2px 0; }
.ct-soma.passou b { color: #fe5f55; } .ct-soma.cravou b { color: #f5b244; }
.ct-vez21 { font-size: 14px; color: #f5b244; text-align: center; animation: ct-vez .8s ease-in-out infinite; }
.ct-trunfos { position: relative; display: flex; gap: 8px; justify-content: center; pointer-events: auto; }
.ct-trunfo { position: relative; width: 62px; height: 83px; padding: 0; border: 0; border-radius: 8px; background: center / 100% 100% no-repeat; box-shadow: 0 4px 0 rgba(0,0,0,.3); transition: transform .12s, filter .12s; }
.ct-trunfo:hover, .ct-trunfo.armado { transform: translateY(-8px) scale(1.08) rotate(-2deg); }
.ct-trunfo kbd { position: absolute; top: -8px; left: -6px; font: 800 11px ${NUMERO}; background: #1e2b2d; color: #fff; border-radius: 5px; padding: 1px 5px; }
.ct-trunfos.longe .ct-trunfo { filter: brightness(.72) saturate(.7); }
.ct-trunfo.nao { animation: ct-nao .3s linear; }
.ct-tip { position: absolute; bottom: calc(100% + 12px); left: 50%; translate: -50% 0; width: 250px; padding: 8px 10px; font-size: 13px; line-height: 1.3; text-align: center; pointer-events: none; }
.ct-tip b { display: block; font-size: 16px; margin-bottom: 3px; }
.ct-mao.v21 .ct-carta .ct-face { filter: none; } .ct-mao.v21 .ct-carta { cursor: default; }
.ct-fechada { position: absolute; left: 50%; bottom: -10px; translate: -50% 0; z-index: 2; font-size: 11px; padding: 1px 6px; border-radius: 6px; background: #1e2b2d; color: #f5b244; white-space: nowrap; pointer-events: none; }
.ct-pergunta h2.ganhou { color: #f5b244; } .ct-pergunta h2.empate { color: #e9e4d6; }
.ct-res { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin: 8px 0 6px; }
.ct-res > div { display: grid; justify-items: center; gap: 6px; } .ct-res .ct-cartas { display: flex; gap: 3px; }
.ct-res img { width: 40px; height: 54px; border-radius: 5px; box-shadow: 0 2px 0 rgba(0,0,0,.3); }
.ct-res b { font: 800 32px ${NUMERO}; } .ct-res b.passou { color: #fe5f55; text-decoration: line-through; }
.ct-res small { color: #a9bfc2; font-size: 12px; }
/* o trunfo que alguém usou: a carta grande no meio */
#ct-trunfo { position: absolute; left: 50%; top: 36%; translate: -50% -50%; display: grid; justify-items: center; gap: 10px; pointer-events: none; }
#ct-trunfo img { width: 130px; height: 174px; border-radius: 12px; box-shadow: 0 8px 0 rgba(0,0,0,.35), 0 0 46px var(--cor, #f5b244); }
#ct-trunfo span { padding: 6px 14px; border-radius: 10px; background: #1e2b2d; box-shadow: 0 3px 0 #11191a; font-size: 17px; max-width: 86vw; text-align: center; }
#ct-trunfo span small { display: block; font-size: 13px; color: #a9bfc2; margin-top: 2px; }
#ct-trunfo.anda { animation: ct-trunfo 2s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes ct-trunfo { 0% { transform: scale(.2) rotate(-25deg); opacity: 0; } 16% { transform: scale(1.12) rotate(4deg); opacity: 1; } 26% { transform: none; }
  82% { transform: none; opacity: 1; } 100% { transform: translateY(-30px) scale(.9); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #ct-trunfo.anda, .ct-vez21 { animation: none; } }
body.touch .ct-rival { left: auto; right: calc(6px + env(safe-area-inset-right)); translate: none; top: calc(54px + env(safe-area-inset-top)); padding: 5px 8px; gap: 6px; }
body.touch .ct-rival img { width: 30px; height: 40px; } body.touch .ct-rival .ct-somar { font-size: 18px; }
body.touch .ct-trunfo { width: 44px; height: 59px; } body.touch .ct-soma { font-size: 26px; padding: 4px 8px; }
body.touch .ct-conta { display: none; } body.touch #ct-trunfo img { width: 96px; height: 128px; }`;
    document.head.appendChild(css);

    this.raiz = document.createElement('div');
    this.raiz.id = 'ct-hud';
    this.raiz.hidden = true;
    this.raiz.innerHTML = `<div class="ct-flash"></div>
<div class="ct-lado ct-painel"></div>
<div class="ct-assentos"></div>
<div class="ct-pergunta ct-painel" hidden></div>
<div id="ct-grito" hidden aria-live="polite"><b></b><span></span></div>
<div class="ct-rival ct-painel" hidden></div>
<div id="ct-trunfo" hidden><img alt=""><span></span></div>
<div class="ct-baixo">
  <div class="ct-aviso"></div>
  <div class="ct-trunfos" hidden></div>
  <div class="ct-linha"><div class="ct-esq"></div><div class="ct-mao"></div><div class="ct-dir"></div></div>
  <div class="ct-tempo" hidden><i></i></div>
</div>
<div class="ct-fim" hidden></div>`;
    this.mao = this.$('.ct-mao');
    this.zoar = document.createElement('div');
    this.zoar.className = 'ct-zoar ct-painel';
    this.zoar.hidden = true;
    this.zoar.innerHTML = `<button type="button" class="sorte" data-zoar="-1">🎲 Frase aleatória</button>`
      + ZOEIRA.map((f, i) => `<button type="button" data-zoar="${i}">${esc(f)}</button>`).join('');
    // o cochicho do truco (só o parceiro vê)
    this.sinal = document.createElement('div');
    this.sinal.className = 'ct-zoar ct-sinais ct-painel';
    this.sinal.hidden = true;
    this.sinal.innerHTML = SINAIS.map((s, i) => `<button type="button" data-sinal="${i}">${s.carta ? `<img src="${urlCarta(s.carta)}" alt="${esc(s.carta)}">` : ''}${esc(s.f)}</button>`).join('');
    // o menu do que jogar em alguém (abre dentro da plaquinha do alvo)
    this.menu = document.createElement('div');
    this.menu.className = 'ct-arremesso ct-painel';
    this.menu.hidden = true;
    this.menu.innerHTML = Object.entries(ARREMESSOS).map(([chave, a]) => `<button type="button" data-item="${chave}" title="${a.nome}">${a.emoji}</button>`).join('');
    this.cores = document.createElement('div');
    this.cores.id = 'ct-cores';
    this.cores.hidden = true;
    this.cores.innerHTML = `<div>${CORES_UNO.map((c) => `<button type="button" data-cor="${c}" style="background:${HEX_COR[c]}" aria-label="${NOME_COR[c]}"></button>`).join('')}</div>`;
    // o seletor de cadeira (abre ao chegar na mesa, antes de sentar)
    this.escolha = document.createElement('div');
    this.escolha.id = 'ct-sentar';
    this.escolha.hidden = true;
    this.escolha.innerHTML = `<div class="ct-painel"><h3></h3><div class="ct-roda"></div><p></p><button type="button" class="ct-b cinza" data-fechar="">Agora não</button></div>`;
    document.body.append(this.raiz, this.cores, this.escolha);
    this.escolha.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-fechar')) {
        this.escolha.hidden = true;
        return;
      }
      if (b.dataset.sentar !== undefined && this.escolhendo) this.sentarNa(this.escolhendo, Number(b.dataset.sentar));
    });

    this.raiz.addEventListener('click', (ev) => this.clique(ev));
    // a carta inclina para onde o mouse está (o "tilt" do Balatro)
    this.mao.addEventListener('pointermove', (ev) => {
      const face = ev.target.closest?.('.ct-face');
      if (!face || ev.pointerType !== 'mouse') return;
      const r = face.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      face.style.setProperty('--ry', `${x * 22}deg`);
      face.style.setProperty('--rx', `${-y * 22}deg`);
    });
    this.mao.addEventListener('pointerout', (ev) => {
      const face = ev.target.closest?.('.ct-face');
      if (!face || face.contains(ev.relatedTarget)) return;
      face.style.removeProperty('--rx');
      face.style.removeProperty('--ry');
    });
    // 21: passar o mouse num trunfo mostra o que ele faz
    this.trunfosEl = this.$('.ct-trunfos');
    this.trunfosEl.addEventListener('pointerover', (ev) => {
      const b = ev.target.closest?.('[data-trunfo]');
      if (b) this.dicaTrunfo(b.dataset.trunfo);
    });
    this.trunfosEl.addEventListener('pointerleave', () => {
      if (!this.armado) this.dicaTrunfo(null);
    });
    this.cores.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cor]');
      this.cores.hidden = true;
      const carta = this.esperandoCor;
      this.esperandoCor = null;
      if (!b || !carta || !this.ativa) return;
      this.voarCarta(carta);
      this.socket?.emit('ct-jogar', { mesa: this.ativa.i, carta, cor: b.dataset.cor });
      this.sfx.dado(0.8);
    });
  }

  clique(ev) {
    const b = ev.target.closest('button');
    const M = this.ativa;
    if (!b || !M) return;
    b.blur();
    const mesa = M.i;
    const d = b.dataset;
    if (d.carta) return this.clicarCarta(d.carta, b);
    if (d.trunfo) {
      // no celular o primeiro toque mostra o que o trunfo faz; o segundo usa
      if (document.body.classList.contains('touch') && this.armado !== d.trunfo) {
        this.armado = d.trunfo;
        this.trunfosEl.querySelectorAll('.armado').forEach((x) => x.classList.remove('armado'));
        b.classList.add('armado');
        return this.dicaTrunfo(d.trunfo);
      }
      this.armado = null;
      this.dicaTrunfo(null);
      return this.usarTrunfo(d.trunfo, b);
    }
    if (d.acao?.startsWith('v21:')) return this.emit21(d.acao.slice(4));
    if (d.tapa || d.tiro) {
      const tipo = d.tapa ? 'tapa' : 'tiro';
      return this.socket?.emit('ct-acao', { mesa, tipo, alvo: Number(d.tapa || d.tiro) });
    }
    if (d.pegouno) return this.socket?.emit('ct-uno', { mesa, acao: 'pegar', alvo: Number(d.pegouno) });
    if (d.zoar) {
      this.zoar.hidden = true;
      const i = Number(d.zoar);
      return this.socket?.emit('ct-zoar', { mesa, i: i >= 0 ? i : Math.floor(Math.random() * ZOEIRA.length) });
    }
    if (d.sinal) {
      this.sinal.hidden = true;
      const i = Number(d.sinal);
      // feedback: eu também vejo o balão que o parceiro vai ver (com a carta, se tiver)
      this.balao((M.lugar + 2) % 4, `🤫 ${SINAIS[i]?.f || ''}`, false, 'segredo', SINAIS[i]?.carta);
      return this.socket?.emit('ct-sinal', { mesa, i });
    }
    if (d.arremesso) {
      // abre (ou fecha) o menu do que jogar, dentro da plaquinha do alvo
      const assento = this.$(`.ct-assento[data-lugar="${d.arremesso}"]`);
      if (!assento) return;
      if (!this.menu.hidden && this.menu.parentElement === assento) {
        this.menu.hidden = true;
        return;
      }
      assento.append(this.menu);
      this.menu.dataset.alvo = d.arremesso;
      this.menu.hidden = false;
      return;
    }
    if (d.item) {
      this.menu.hidden = true;
      return this.socket?.emit('ct-arremesso', { mesa, alvo: Number(this.menu.dataset.alvo), item: d.item });
    }
    if (!b.closest('.ct-arremesso')) this.menu.hidden = true; // clique fora: fecha o menu
    const acao = d.acao;
    if (acao === 'sair') return this.soltarFoco?.();
    if (acao === 'comecar') {
      this.$('.ct-fim').hidden = true;
      return this.socket?.emit('ct-comecar', { mesa });
    }
    if (acao === 'fechar-fim') {
      this.$('.ct-fim').hidden = true;
      return;
    }
    if (acao === 'coberta') {
      this.coberta = !this.coberta;
      return this.marcarCoberta();
    }
    if (acao === 'zoar') {
      this.zoar.hidden = !this.zoar.hidden;
      if (!this.zoar.hidden) this.sinal.hidden = true;
      return;
    }
    if (acao === 'sinal') {
      this.sinal.hidden = !this.sinal.hidden;
      if (!this.sinal.hidden) this.zoar.hidden = true;
      return;
    }
    if (acao?.startsWith('truco:')) {
      this.$('.ct-pergunta').hidden = true;
      this.chavePergunta = '';
      return this.emitTruco(acao.slice(6));
    }
    if (acao?.startsWith('uno:')) return this.socket?.emit('ct-uno', { mesa, acao: acao.slice(4) });
  }

  desenhar() {
    const M = this.ativa;
    const e = M?.e;
    if (!e) return;
    this.desenharLado(M, e);
    this.desenharAssentos(M, e);
    this.desenharAviso(M, e);
    this.desenharPergunta(M, e);
    this.desenharRival(M, e);
    this.desenharTrunfos(M, e);
    this.desenharMao(M, e);
    this.desenharBotoes();
    this.desenharTempo(M, e);
  }

  // a coluna do placar (montada uma vez por jogo; os números trocam sem refazer, para poderem pular)
  desenharLado(M, e) {
    const lado = this.$('.ct-lado');
    const truco = e.jogo === 'truco';
    const v21 = e.jogo === 'vinteum';
    const meuTime = M.lugar % 2;
    const espera = e.fase === 'espera' || e.fase === 'fim';
    const chave = `${e.jogo}:${espera}`;
    if (this.ladoDe !== chave) {
      this.ladoDe = chave;
      const comecar = `<button type="button" class="ct-b verde grande" data-acao="comecar">Começar</button>
<div class="ct-dica">${paraToque('Sente quem quiser e clique em Começar: a mesa completa com robôs')}</div>`;
      const manilhas = [...MANILHAS].reverse().map((c) => `<img src="${urlCarta(c)}" alt="${NOME_MANILHA[c]}" title="${NOME_MANILHA[c]}">`).join('');
      const conta = Array.from({ length: MAX_21 }, (_, i) => `<i data-n="${i + 1}">${i + 1}</i>`).join('');
      lado.innerHTML = v21
        ? `<div class="ct-titulo v21 ondas">${ondas('21')}</div>
<div class="ct-placar ct-caixa"><div><small>VOCÊ</small><b class="ct-num azul" data-p="nos">${DEDOS_21}</b><span class="ct-dedos" data-d="nos"></span></div><span class="ct-x">×</span><div><small>RIVAL</small><b class="ct-num vermelho" data-p="eles">${DEDOS_21}</b><span class="ct-dedos" data-d="eles"></span></div></div>
<div class="ct-linha2 ct-caixa"><small>META</small><b class="ct-meta">21</b></div>
<div class="ct-linha2 ct-caixa" title="Quantos dedos você perde se perder a rodada"><small>SUA APOSTA</small><b class="ct-vale">1</b></div>
<div class="ct-linha2 ct-caixa" title="Quantos dedos o rival perde se perder a rodada"><small>APOSTA DO RIVAL</small><b class="ct-vale2">1</b></div>
<div class="ct-mesa21 ct-caixa"><small>SEUS TRUNFOS NA MESA</small><span class="ct-namesa"></span></div>
<div class="ct-conta ct-caixa"><small>CONTAGEM · NO MONTE <b class="ct-monte">–</b></small><span>${conta}</span></div>
${espera ? comecar : ''}<button type="button" class="ct-b cinza" data-acao="sair">Sair da mesa</button>`
        : truco
        ? `<div class="ct-titulo ondas">${ondas('TRUCO')}</div>
<div class="ct-placar ct-caixa"><div><small>NÓS</small><b class="ct-num azul" data-p="nos">0</b></div><span class="ct-x">×</span><div><small>ELES</small><b class="ct-num vermelho" data-p="eles">0</b></div></div>
<div class="ct-linha2 ct-caixa"><small>MÃO VALE</small><b class="ct-vale">2</b></div>
<div class="ct-linha2 ct-caixa"><small>RODADAS</small><span class="ct-rodadas"><i></i><i></i><i></i></span></div>
<div class="ct-manilhas ct-caixa"><small>MANILHAS</small><span>${manilhas}</span></div>
${espera ? comecar : ''}<button type="button" class="ct-b cinza" data-acao="sair">Sair da mesa</button>`
        : `<div class="ct-titulo uno ondas">${ondas('UNO')}</div>
<div class="ct-linha2 ct-caixa"><small>MONTE</small><b class="ct-monte">–</b></div>
<div class="ct-linha2 ct-caixa"><small>SENTIDO</small><b class="ct-sentido">↻</b></div>
<div class="ct-linha2 ct-caixa"><small>COR</small><b class="ct-uno-cor"></b></div>
${espera ? comecar : ''}<button type="button" class="ct-b cinza" data-acao="sair">Sair da mesa</button>`;
    }
    if (truco) {
      const p = e.pontos || [0, 0];
      const nos = lado.querySelector('[data-p="nos"]');
      const eles = lado.querySelector('[data-p="eles"]');
      if (!nos.dataset.contando) nos.textContent = p[meuTime];
      if (!eles.dataset.contando) eles.textContent = p[1 - meuTime];
      const vale = lado.querySelector('.ct-vale');
      vale.textContent = e.vale ?? PASSOS_TRUCO[0];
      const fogo = Math.min(3, PASSOS_TRUCO.indexOf(e.vale));
      if (fogo > 0) vale.dataset.fogo = fogo;
      else delete vale.dataset.fogo;
      lado.querySelectorAll('.ct-rodadas i').forEach((el, i) => {
        const r = e.rodadas?.[i];
        el.classList.remove('nos', 'eles', 'empate'); // (o carimbo, se estiver animando, fica)
        if (r !== undefined) el.classList.add(r === 'e' ? 'empate' : r === meuTime ? 'nos' : 'eles');
      });
    } else if (v21) {
      const eu = Math.max(0, M.lugar);
      const ele = 1 - eu;
      const vidas = e.vidas || [DEDOS_21, DEDOS_21];
      for (const [k, lugar] of [['nos', eu], ['eles', ele]]) {
        lado.querySelector(`[data-p="${k}"]`).textContent = vidas[lugar];
        lado.querySelector(`[data-d="${k}"]`).innerHTML = Array.from({ length: DEDOS_21 }, (_, i) => `<i${i < vidas[lugar] ? '' : ' class="foi"'}></i>`).join('');
      }
      lado.querySelector('.ct-meta').textContent = e.meta ?? 21;
      // as apostas: a minha (o que eu perco se perder) pega fogo quando sobe
      const minha = e.aposta?.[eu] ?? 1;
      const vale = lado.querySelector('.ct-vale');
      vale.textContent = minha;
      const fogo = minha >= 6 ? 3 : minha >= 4 ? 2 : minha >= 2 ? 1 : 0;
      if (fogo) vale.dataset.fogo = fogo;
      else delete vale.dataset.fogo;
      lado.querySelector('.ct-vale2').textContent = e.aposta?.[ele] ?? 1;
      // os meus trunfos na mesa
      const naMesa = e.mesa21?.[eu] || [];
      const caixa = lado.querySelector('.ct-namesa');
      const htmlMesa = naMesa.length ? naMesa.map((c) => `<img src="${urlCarta(`T:${c}`)}" alt="${esc(TRUNFOS_21[c]?.nome || c)}" title="${esc(`${TRUNFOS_21[c]?.nome}: ${TRUNFOS_21[c]?.desc}`)}">`).join('') : '<em>nenhum</em>';
      if (caixa.dataset.html !== htmlMesa) {
        caixa.dataset.html = htmlMesa;
        caixa.innerHTML = htmlMesa;
      }
      lado.querySelector('.ct-monte').textContent = e.monte ?? '–';
      // a contagem: o que eu já vi de cada número (meu, do rival, tirado do jogo); o resto está no
      // monte ou é a carta fechada do rival
      const minhas = new Set(M.mao.map(numero21));
      const dele = new Set([...(e.maos21?.[ele] || []), M.rivalOculta].map(numero21));
      const fora = new Set((e.fora || []).map(numero21));
      lado.querySelectorAll('.ct-conta i').forEach((el) => {
        const n = Number(el.dataset.n);
        el.className = minhas.has(n) ? 'minha' : dele.has(n) ? 'rival' : fora.has(n) ? 'fora' : '';
      });
    } else {
      lado.querySelector('.ct-monte').textContent = e.monte ?? '–';
      const s = lado.querySelector('.ct-sentido');
      s.textContent = (e.sentido ?? 1) > 0 ? '↻' : '↺';
      s.classList.toggle('anti', (e.sentido ?? 1) < 0);
      const cor = lado.querySelector('.ct-uno-cor');
      cor.style.background = HEX_COR[e.cor] || '#5f7377';
      cor.title = NOME_COR[e.cor] || '';
    }
  }

  // as plaquinhas dos outros lugares (a posição na tela é do update, seguindo a câmera)
  desenharAssentos(M, e) {
    const caixa = this.$('.ct-assentos');
    const n = e.lugares.length;
    if (caixa.children.length !== n || caixa.dataset.mesa !== String(M.i)) {
      caixa.dataset.mesa = M.i;
      caixa.innerHTML = e.lugares.map((_, k) => `<div class="ct-assento" data-lugar="${k}"><div class="ct-placa"></div><div class="ct-mini"></div></div>`).join('');
    }
    const truco = e.jogo === 'truco';
    const meuTime = M.lugar % 2;
    const tapa = this.ligado('tapa');
    const tiro = this.ligado('tiro');
    [...caixa.children].forEach((el, k) => {
      const l = e.lugares[k];
      el.hidden = !l || k === M.lugar;
      if (el.hidden) return;
      const vez = e.vez === k && (e.fase === 'jogando' || e.fase === 'dez');
      el.classList.toggle('vez', vez);
      el.style.setProperty('--time', truco ? (k % 2 === meuTime ? '#009dff' : '#fe5f55') : l.cor || '#5f7377');
      const dorso = '<i></i>'.repeat(Math.min(7, l.cartas));
      const placa = e.jogo === 'vinteum'
        ? `${l.bot ? '🤖 ' : ''}${esc(l.nome)} · ✋${e.vidas?.[k] ?? DEDOS_21} · 🃏${e.trunfosN?.[k] ?? 0}`
        : `${l.bot ? '🤖 ' : ''}${esc(l.nome)}<span class="ct-dorso">${dorso}</span>${l.cartas > 7 ? `+${l.cartas - 7}` : ''}`;
      const p = el.querySelector('.ct-placa');
      if (p.dataset.html !== placa) {
        p.dataset.html = placa;
        p.innerHTML = placa;
      }
      const mini = `${e.jogo === 'uno' && e.fase === 'jogando' && e.semUno === k ? `<button type="button" data-pegouno="${k}" title="Pegar: não falou UNO! (compra 2)" aria-label="Pegar ${esc(l.nome)} que não falou UNO">🫵</button>` : ''}${tapa ? `<button type="button" data-tapa="${k}" title="Dar um tapa" aria-label="Dar um tapa em ${esc(l.nome)}">👋</button>` : ''}${tiro ? `<button type="button" data-tiro="${k}" title="Dar um tiro (de brincadeira)" aria-label="Dar um tiro em ${esc(l.nome)}">🔫</button>` : ''}<button type="button" data-arremesso="${k}" title="Jogar alguma coisa" aria-label="Jogar alguma coisa em ${esc(l.nome)}">🍅</button>`;
      const b = el.querySelector('.ct-mini');
      if (b.dataset.html !== mini) {
        b.dataset.html = mini;
        b.innerHTML = mini;
      }
    });
  }

  // o balão em cima da plaquinha de quem gritou (some sozinho). classe: 'segredo' (o sinal, roxo).
  // carta: a mini carta vai no balão (os sinais de "tenho o Zap" e afins).
  balao(k, texto, forte = false, classe = '', carta = null) {
    const el = this.$(`.ct-assento[data-lugar="${k}"]`);
    if (!el) return;
    el.querySelector('.ct-balao')?.remove();
    const b = document.createElement('div');
    b.className = `ct-balao${forte ? ' forte' : ''}${classe ? ` ${classe}` : ''}`;
    if (carta) b.innerHTML = `${esc(texto)} <img class="ct-balaocarta" src="${urlCarta(carta)}" alt="${esc(carta)}">`;
    else b.textContent = texto;
    el.append(b);
    setTimeout(() => b.remove(), 2600);
  }

  desenharAviso(M, e) {
    const el = this.$('.ct-aviso');
    const minhaVez = e.vez === M.lugar && e.fase === 'jogando';
    let aviso = comDuplas(e.aviso, M.lugar % 2);
    if (e.fase === 'jogando' && !aviso) aviso = minhaVez ? (e.ferro ? 'Sua vez! (mão de ferro: sai a de cima)' : 'Sua vez!') : `Vez de ${e.lugares[e.vez]?.nome || '…'}`;
    if (e.fase === 'espera') aviso = 'Esperando começar';
    if (el.textContent === aviso) return;
    el.textContent = aviso;
    el.hidden = !aviso;
    el.classList.remove('novo');
    void el.offsetWidth;
    el.classList.add('novo');
  }

  // o truco (ou a mão de onze) esperando a minha resposta, no meio da tela, com o tempo correndo
  desenharPergunta(M, e) {
    const el = this.$('.ct-pergunta');
    const meuTime = M.lugar % 2;
    const p = e.jogo === 'truco' && e.fase === 'jogando' ? e.pedido : null;
    let chave = '';
    let html = '';
    const tempo = `<div class="ct-tempo"><i style="animation-duration:${(e.prazo || 0) / 1000}s"></i></div>`;
    if (p && p.porTime !== meuTime) {
      const seguinte = NOME_PEDIDO[PASSOS_TRUCO[PASSOS_TRUCO.indexOf(p.valor) + 1]];
      chave = `p:${p.valor}:${p.de}`;
      html = `<h2 class="ondas">${ondas(`${NOME_PEDIDO[p.valor]}!`)}</h2>
<p>${esc(e.lugares[p.de]?.nome || '')} pediu ${NOME_PEDIDO[p.valor].toLowerCase()}: a mão passa a valer ${p.valor}</p>
<div class="ct-botoes"><button type="button" class="ct-b verde grande" data-acao="truco:aceitar">Desce!</button>
<button type="button" class="ct-b cinza grande" data-acao="truco:correr">Corro</button>
${e.subir ? `<button type="button" class="ct-b vermelho grande truco" data-acao="truco:aumentar">${seguinte}!</button>` : ''}</div>${tempo}`;
    } else if (e.jogo === 'truco' && e.fase === 'dez' && e.maoDeDez === meuTime) {
      chave = `dez:${(M.parceiro || []).join()}`;
      html = `<h2 class="ondas dez">${ondas('MÃO DE ONZE')}</h2>
<p>As cartas do seu parceiro. Joga valendo ${VALE_DEZ}, ou corre e a outra dupla leva ${PASSOS_TRUCO[0]}?</p>
<div class="ct-parceiro">${(M.parceiro || []).map((c) => `<img src="${urlCarta(c)}" alt="${esc(c)}">`).join('')}</div>
<div class="ct-botoes"><button type="button" class="ct-b verde grande" data-acao="truco:dez-jogar">Jogar!</button>
<button type="button" class="ct-b cinza grande" data-acao="truco:dez-correr">Correr</button></div>${tempo}`;
    } else if (e.jogo === 'vinteum' && e.fase === 'fimDaRodada' && e.resultado) {
      // 21: a rodada fechou, as cartas fechadas abrem e o placar da rodada aparece
      const r = e.resultado;
      const eu = Math.max(0, M.lugar);
      const ele = 1 - eu;
      const nome = esc(e.lugares[ele]?.nome || 'Rival');
      const empate = r.vencedor === 'e';
      const ganhei = r.vencedor === eu;
      chave = `r21:${e.rodada}`;
      const mao = (k, quem) => `<div><small>${quem}</small><span class="ct-cartas">${(e.maos21?.[k] || []).map((c) => `<img src="${urlCarta(c)}" alt="${numero21(c)}">`).join('')}</span>`
        + `<b class="${r.somas[k] > r.meta ? 'passou' : ''}">${r.somas[k]}</b></div>`;
      const dedos = (n) => `${n} dedo${n === 1 ? '' : 's'}`;
      const sub = empate ? 'Empate: ninguém perde dedo'
        : !r.dano ? 'Os escudos seguraram o golpe'
          : ganhei ? `${nome} perde ${dedos(r.dano)}` : `Você perde ${dedos(r.dano)}`;
      html = `<h2 class="ondas ${empate ? 'empate' : ganhei ? 'ganhou' : ''}">${ondas(empate ? 'EMPATE' : ganhei ? 'GANHOU!' : 'PERDEU!')}</h2>
<div class="ct-res">${mao(eu, 'VOCÊ')}<span class="ct-x">×</span>${mao(ele, nome)}</div><p>${sub} · meta ${r.meta}</p>`;
    }
    if (chave === this.chavePergunta) return;
    this.chavePergunta = chave;
    el.hidden = !chave;
    if (!chave) return;
    el.innerHTML = html;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  // 21: o rival lá em cima — as cartas dele (a fechada virada, ou aberta com o raio-x), quanto dá
  // para ver da soma, os trunfos que ele tem e o que está armado
  desenharRival(M, e) {
    const el = this.$('.ct-rival');
    const mostra = e.jogo === 'vinteum' && e.fase === 'jogando';
    el.hidden = !mostra;
    if (!mostra) return;
    const ele = 1 - Math.max(0, M.lugar);
    const l = e.lugares[ele];
    const cartas = (e.maos21?.[ele] || []).map((c) => (c === 'verso' && M.rivalOculta ? { c: M.rivalOculta, raiox: true } : { c }));
    const fechada = cartas.some((x) => x.c === 'verso');
    const vista = soma21(cartas.map((x) => x.c).filter((c) => c !== 'verso'));
    const extras = [`🃏 ${e.trunfosN?.[ele] ?? 0} trunfo${e.trunfosN?.[ele] === 1 ? '' : 's'}`];
    if (e.raiox?.[ele]) extras.push('👁️ vê a sua fechada');
    if (e.silencio?.[ele]) extras.push('🤐 calado');
    // os trunfos que ele pôs na mesa (o Destruir tira o último)
    const mesa = (e.mesa21?.[ele] || []).map((c) => `<img src="${urlCarta(`T:${c}`)}" alt="${esc(TRUNFOS_21[c]?.nome || c)}" title="${esc(`${TRUNFOS_21[c]?.nome}: ${TRUNFOS_21[c]?.desc}`)}">`).join('');
    const html = `<div class="ct-quem">${l?.bot ? '🤖 ' : ''}${esc(l?.nome || 'Rival')}<small>${extras.join(' · ')}</small></div>
<span class="ct-cartas">${cartas.map((x) => `<img src="${urlCarta(x.c)}" alt="${x.c === 'verso' ? 'carta fechada' : numero21(x.c)}"${x.raiox ? ' class="raiox" title="Raio-X"' : ''}>`).join('')}</span>
<b class="ct-somar" title="O que dá para ver da soma dele">${fechada ? `? + ${vista}` : vista}</b>${mesa ? `<span class="ct-namesa" title="Trunfos dele na mesa">${mesa}</span>` : ''}`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
  }

  // 21: os meus trunfos, em cima da mão (o número é a tecla)
  desenharTrunfos(M, e) {
    const el = this.trunfosEl;
    const lista = e.jogo === 'vinteum' && (e.fase === 'jogando' || e.fase === 'fimDaRodada') ? M.trunfos || [] : [];
    el.hidden = !lista.length;
    el.classList.toggle('longe', !this.minhaVez21(M));
    const html = lista.map((k, i) => `<button type="button" class="ct-trunfo" data-trunfo="${esc(k)}" style="background-image:url(${urlCarta(`T:${k}`)})" aria-label="${esc(`${TRUNFOS_21[k]?.nome}: ${TRUNFOS_21[k]?.desc}`)}">`
      + `${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`).join('');
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    this.armado = null;
    this.dicaTrunfo(null);
  }

  dicaTrunfo(chave) {
    let tip = this.trunfosEl.querySelector('.ct-tip');
    const T = TRUNFOS_21[chave];
    if (!T) {
      tip?.remove();
      return;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'ct-tip ct-painel';
      this.trunfosEl.append(tip);
    }
    const vez = this.minhaVez21();
    tip.innerHTML = `<b style="color:${T.cor}">${esc(T.nome)}</b>${esc(T.desc)}${vez ? '' : '<br><small>(na sua vez)</small>'}`;
  }

  // alguém usou um trunfo: a carta aparece grande no meio da tela
  mostrarTrunfo(chave, quem, meu) {
    const T = TRUNFOS_21[chave];
    const f = this.$('#ct-trunfo');
    f.querySelector('img').src = urlCarta(`T:${chave}`);
    f.querySelector('img').alt = T.nome;
    f.style.setProperty('--cor', T.cor);
    f.querySelector('span').innerHTML = `${esc(quem)}: ${esc(T.nome)}<small>${esc(T.desc)}</small>`;
    f.hidden = false;
    f.classList.remove('anda');
    void f.offsetWidth;
    f.classList.add('anda');
    clearTimeout(this.tTrunfo);
    this.tTrunfo = setTimeout(() => { f.hidden = true; }, 2000);
    this.sfx.cartaVoa?.();
    this.sfx.fogo?.();
    if (!meu) this.flash(T.cor);
  }

  // 21: a minha mão (não se joga carta; a primeira é a fechada, que só eu vejo). Cada carta nova
  // entra voando.
  desenharMao21(M, e) {
    const mao = M.mao;
    this.mao.classList.add('v21');
    this.mao.classList.toggle('vez', this.minhaVez21(M));
    const chave = `${M.i}:21:${e.rodada}:${mao.join(',')}`;
    if (chave === this.chaveMao) return;
    this.chaveMao = chave;
    const antes = this.mao21?.mesa === M.i && this.mao21.rodada === e.rodada ? Math.min(this.mao21.n, mao.length) : 0;
    this.mao21 = { mesa: M.i, rodada: e.rodada, n: mao.length };
    const n = mao.length;
    const meio = (n - 1) / 2;
    const passo = n > 4 ? 4 : 7;
    this.mao.style.setProperty('--junta', `${(n > 4 ? -Math.min(40, 6 + (n - 4) * 5) : -6) / 2}px`);
    this.mao.innerHTML = mao.map((c, i) => {
      const off = i - meio;
      const estilo = `--rot:${off * passo}deg;--desce:${off * off * 4}px;--atraso:${-i * 0.37}s;--chega:${Math.max(0, i - antes) * 0.12}s`;
      return `<button type="button" class="ct-carta${i >= antes ? ' chega' : ''}" style="${estilo}" aria-label="${numero21(c)}${i === 0 ? ' (fechada)' : ''}" tabindex="-1">`
        + `<div class="ct-balanca"><div class="ct-face" style="background-image:url(${urlCarta(c)})"></div></div>${i === 0 ? '<span class="ct-fechada">🔒 fechada</span>' : ''}</button>`;
    }).join('');
    for (let i = antes; i < n; i++) setTimeout(() => this.sfx.cartaSel?.(i), (i - antes) * 120);
  }

  // a mão: refeita só quando muda o que tem nela (senão as cartas pulavam a cada aviso)
  desenharMao(M, e) {
    if (e.jogo === 'vinteum') return this.desenharMao21(M, e);
    this.mao.classList.remove('v21');
    const mao = this.maoOrdenada(M);
    const pode = mao.map((c) => this.podeJogar(M, c));
    const chave = `${M.i}:${mao.join(',')}:${pode.join(',')}`;
    this.mao.classList.toggle('vez', e.vez === M.lugar && e.fase === 'jogando');
    if (chave === this.chaveMao) return this.marcarCoberta();
    this.chaveMao = chave;
    const n = mao.length;
    const meio = (n - 1) / 2;
    const passo = n > 8 ? 2.5 : n > 4 ? 4 : 7;
    const junta = n > 4 ? -Math.min(40, 6 + (n - 4) * 5) : -6;
    this.mao.style.setProperty('--junta', `${junta / 2}px`);
    const distribuir = this.distribuir;
    this.distribuir = false;
    this.mao.innerHTML = mao.map((c, i) => {
      const off = i - meio;
      const estilo = `--rot:${off * passo}deg;--desce:${off * off * (n > 6 ? 1 : 4)}px;--atraso:${-i * 0.37}s;--chega:${i * 0.09}s`;
      return `<button type="button" class="ct-carta${pode[i] ? ' pode' : ''}${distribuir ? ' chega' : ''}" data-carta="${esc(c)}" style="${estilo}" aria-label="${esc(c === 'verso' ? 'carta virada' : c)}">`
        + `<div class="ct-balanca"><div class="ct-face" style="background-image:url(${urlCarta(c)})"></div></div></button>`;
    }).join('');
    if (distribuir && n) mao.forEach((_, i) => setTimeout(() => this.sfx.cartaSel?.(i), i * 90));
    this.marcarCoberta();
  }

  // COBERTA ligada: o botão fica aceso e as cartas que dá para jogar mostram que vão viradas
  marcarCoberta() {
    this.mao.classList.toggle('coberta', this.coberta);
    if (this.coberta) this.mao.style.setProperty('--verso', `url(${urlCarta('verso')})`);
    this.$('[data-acao="coberta"]')?.classList.toggle('liga', this.coberta);
  }

  // os botões dos lados da mão (Balatro: COBERTA laranja, TRUCO! vermelho)
  desenharBotoes() {
    const M = this.ativa;
    const e = M?.e;
    if (!e) return;
    const truco = e.jogo === 'truco';
    const meuTime = M.lugar % 2;
    const minhaVez = e.vez === M.lugar && e.fase === 'jogando';
    const esq = [];
    const dir = [];
    const podeCobrir = truco && e.fase === 'jogando' && minhaVez && !e.pedido && !e.ferro && e.rodadas?.length > 0;
    if (podeCobrir) esq.push('<button type="button" class="ct-b laranja" data-acao="coberta" title="A próxima carta vai virada">Coberta</button>');
    else this.coberta = false;
    if (truco && e.fase === 'jogando' && minhaVez && !e.pedido && e.trucar?.[meuTime]) {
      const nome = NOME_PEDIDO[PASSOS_TRUCO[PASSOS_TRUCO.indexOf(e.vale) + 1]];
      dir.push(`<button type="button" class="ct-b vermelho grande truco" data-acao="truco:pedir" title="Espaço">${nome}!</button>`);
    }
    if (e.jogo === 'uno' && e.fase === 'jogando') {
      if (minhaVez && !e.comprou) esq.push('<button type="button" class="ct-b verde" data-acao="uno:comprar">Comprar</button>');
      if (minhaVez && e.comprou) esq.push('<button type="button" class="ct-b cinza" data-acao="uno:passar">Passar</button>');
      if (M.mao.length <= 2 && !e.disseUno?.includes(M.lugar)) dir.push('<button type="button" class="ct-b ouro grande truco" data-acao="uno:uno">UNO!</button>');
    }
    if (e.jogo === 'vinteum' && e.fase === 'jogando') {
      const vez = this.minhaVez21(M);
      const s = soma21(M.mao);
      const meta = e.meta ?? 21;
      esq.push(`<div class="ct-soma ct-caixa${s > meta ? ' passou' : s === meta ? ' cravou' : ''}"><small>SUA MÃO</small><b>${s}</b><small>META ${meta}</small></div>`);
      const calado = !!e.silencio?.[M.lugar];
      esq.push(`<button type="button" class="ct-b verde grande" data-acao="v21:pedir" title="${calado ? 'O rival pôs Silêncio na mesa' : 'Espaço'}"${vez && e.monte && !calado ? '' : ' disabled'}>${calado ? '🤐 Calado' : 'Pedir carta'}</button>`);
      if (vez) dir.push('<div class="ct-vez21">SUA VEZ!</div>');
      dir.push(`<button type="button" class="ct-b vermelho grande" data-acao="v21:parar" title="S"${vez ? '' : ' disabled'}>Parar</button>`);
    }
    if (e.fase !== 'espera') dir.push('<button type="button" class="ct-b roxo" data-acao="zoar" title="Zoar a mesa">📣 Zoar</button>');
    // o sinal do truco: só aparece com um parceiro de gente na mesa (robô não lê cochicho)
    const parceiro = truco && e.lugares[(M.lugar + 2) % 4];
    if (truco && e.fase !== 'espera' && parceiro && !parceiro.bot) dir.push('<button type="button" class="ct-b roxo" data-acao="sinal" title="Cochichar um sinal que só o parceiro vê">🤫 Sinal</button>');
    const html = (l) => l.join('');
    const elEsq = this.$('.ct-esq');
    const elDir = this.$('.ct-dir');
    if (elEsq.dataset.html !== html(esq)) {
      elEsq.dataset.html = html(esq);
      elEsq.innerHTML = html(esq);
    }
    if (elDir.dataset.html !== html(dir)) {
      elDir.dataset.html = html(dir);
      elDir.innerHTML = html(dir);
      elDir.append(this.zoar, this.sinal);
    }
    this.marcarCoberta();
  }

  // a barra do tempo embaixo da mão, na minha vez
  desenharTempo(M, e) {
    const el = this.$('.ct-baixo > .ct-tempo');
    const minhaVez = e.vez === M.lugar && e.fase === 'jogando' && !e.pedido;
    const chave = minhaVez ? `${e.vez}:${e.mesaCartas?.length}:${e.rodadas?.length}:${M.mao.length}:${e.topo}:${e.aviso}` : '';
    if (chave === el.dataset.chave) return;
    el.dataset.chave = chave;
    el.hidden = !minhaVez;
    if (!minhaVez) return;
    const i = el.querySelector('i');
    i.style.animation = 'none';
    void i.offsetWidth;
    i.style.animation = '';
    i.style.animationDuration = `${(e.prazo || 0) / 1000}s`;
  }

  // ---------------------------------------------------------------- os efeitos
  // no uno, quando alguém joga: o balão "jogou <carta>" na plaquinha da cadeira e a faixa grande
  // do efeito (PULA!, VOLTA!, +2!...), como os gritos do truco
  fraseUno(M, e, antes) {
    const quem = antes?.vez;
    if (quem == null || quem < 0 || !e.lugares?.[quem]) return;
    const carta = e.topo;
    const nome = e.lugares[quem].nome;
    const cor = coringa(carta) ? (e.cor ? NOME_COR[e.cor] : null) : NOME_COR[corUno(carta)];
    this.balao(quem, 'jogou', true, '', carta);
    if (quem !== M.lugar) this.sfx.cartaVoa?.();
    const s = simboloUno(carta);
    const efeito = { B: 'PULA!', I: 'VOLTA!', P2: '+2!' }[s] || (s === 'W4' ? '+4!' : s === 'W' ? 'CORINGA!' : '');
    // a voz de quem jogou (o tom é por lugar, como nos gritos): o efeito em prosa, a carta em voz alta
    const falado = { B: 'Pula!', I: 'Volta!', P2: 'Mais dois!', W: 'Coringa!' }[s]
      || (s === 'W4' ? 'Mais quatro!' : `${rotuloUno(carta)}${cor ? ` ${cor}` : ''}`);
    this.bonecoDe(M, quem)?.say(falado);
    falarGrito(falado, quem, 1);
    if (!efeito) return;
    this.faixaGrito(efeito, `${nome} jogou ${cor ? `${cor} ` : ''}${rotuloUno(carta)}`, false);
  }

  faixaGrito(titulo, texto, nosso) {
    const f = this.$('#ct-grito');
    f.querySelector('b').innerHTML = `<span class="ondas">${ondas(titulo)}</span>`;
    f.querySelector(':scope > span').textContent = texto;
    f.classList.toggle('nosso', nosso);
    f.hidden = false;
    // recomeça a animação (grito em cima de grito)
    f.classList.remove('anda');
    void f.offsetWidth;
    f.classList.add('anda');
    clearTimeout(this.tFaixa);
    this.tFaixa = setTimeout(() => { f.hidden = true; }, 2300);
  }

  flash(cor) {
    const f = this.$('.ct-flash');
    f.style.setProperty('--cor', cor);
    f.classList.remove('vai');
    void f.offsetWidth;
    f.classList.add('vai');
  }

  tremerHud() {
    this.raiz.classList.remove('treme');
    void this.raiz.offsetWidth;
    this.raiz.classList.add('treme');
  }

  pular(el, carimbo = false) {
    if (!el) return;
    const c = carimbo ? 'carimbo' : 'pula';
    el.classList.remove(c);
    void el.offsetWidth;
    el.classList.add(c);
  }

  // os pontos contam de um em um (com o tique subindo de tom) e o "+4" sobe da caixa
  contarPontos(lado, de, ate) {
    const el = this.$(`[data-p="${lado}"]`);
    if (!el) return;
    const mais = document.createElement('span');
    mais.className = 'ct-mais';
    mais.textContent = `+${ate - de}`;
    el.parentElement.append(mais);
    setTimeout(() => mais.remove(), 1000);
    el.dataset.contando = '1';
    el.textContent = de;
    let v = de;
    const passo = () => {
      v += 1;
      el.textContent = v;
      this.pular(el);
      this.sfx.ponto?.(v);
      if (v < ate) setTimeout(passo, 110);
      else delete el.dataset.contando;
    };
    setTimeout(passo, 250);
  }

  fim(ganhei, texto, e) {
    const el = this.$('.ct-fim');
    const meuTime = this.ativa ? this.ativa.lugar % 2 : 0;
    const v21 = e.jogo === 'vinteum' && e.vidas ? `<p>Dedos: você ${e.vidas[Math.max(0, this.ativa?.lugar ?? 0)]} × ${e.vidas[1 - Math.max(0, this.ativa?.lugar ?? 0)]} rival</p>` : '';
    const placar = e.jogo === 'truco' && e.pontos ? `<p>Nós ${e.pontos[meuTime]} × ${e.pontos[1 - meuTime]} Eles</p>` : v21;
    el.classList.toggle('perdeu', !ganhei);
    el.innerHTML = `<div class="ct-painel"><h2 class="ondas">${ondas(ganhei ? 'VITÓRIA!' : 'DERROTA')}</h2><p>${esc(texto)}</p>${placar}
<button type="button" class="ct-b verde grande" data-acao="fechar-fim">${ganhei ? 'Bora de novo!' : 'Revanche!'}</button></div>`;
    if (ganhei) {
      const cores = ['#fe5f55', '#009dff', '#f5b244', '#4bc292', '#a782d1', '#fff4e6'];
      for (let i = 0; i < 70; i++) {
        const c = document.createElement('i');
        c.className = 'ct-confete';
        c.style.cssText = `left:${Math.random() * 100}%;background:${cores[i % cores.length]};animation-duration:${1.8 + Math.random() * 1.8}s;animation-delay:${Math.random() * 0.6}s;--giro:${(Math.random() - 0.5) * 1440}deg`;
        el.append(c);
      }
      this.sfx.finish();
      setTimeout(() => this.sfx.moeda?.(), 500);
    } else this.sfx.derrota?.();
    el.hidden = false;
    clearTimeout(this.tFim);
    this.tFim = setTimeout(() => { el.hidden = true; }, 7000);
  }

  // ---------------------------------------------------------------- por quadro
  update(dt = 0.016, t = performance.now() / 1000) {
    for (const M of this.mesas) {
      // a pausa da rodada do truco acabou: as cartas do meio somem e dá para jogar de novo
      if (!M.pausaLimpa && !this.emPausa(M)) {
        M.pausaLimpa = true;
        this.mostrar3d(M);
        if (this.ativa === M) {
          this.chaveMao = '';
          this.desenhar();
        }
      }
      if (M.e && M.e.fase !== 'espera') this.anima3d(M, dt, t);
      else this.g3d.mesas[M.i].anel.visible = false;
      for (const r of M.robos) {
        if (!r) continue;
        r.av.update(dt, t);
        // sentado nesta mesa a plaquinha já tem o nome: o do boneco, perto da câmera, ficaria enorme
        r.av.tag.sprite.visible = this.ativa !== M;
      }
    }
    if (this.ativa) this.posicionarAssentos(this.ativa);
  }

  // as plaquinhas seguem as cadeiras na tela
  posicionarAssentos(M) {
    const cam = this.world.camera;
    const v = this._v ||= new THREE.Vector3();
    const w = innerWidth;
    const h = innerHeight;
    for (const el of this.$('.ct-assentos').children) {
      if (el.hidden) continue;
      const c = cadeira(M.m, Number(el.dataset.lugar));
      v.set(c.x, 1.95, c.z).project(cam);
      if (v.z > 1) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      const x = Math.min(w - 90, Math.max(90, ((v.x + 1) / 2) * w));
      const y = Math.min(h - 200, Math.max(70, ((1 - v.y) / 2) * h));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('topo', y < 140);
    }
  }

  // o painel do parque mostra "Truco, Uno e 21" se um dos três estiver ligado
  algumLigado() {
    return this.ligado('truco') || this.ligado('uno') || this.ligado('vinteum');
  }

  apertou() { return false; }

  soltou() {}

  ativo() { return false; }

  dica(livre) {
    if (!livre) return '';
    const M = this.mesaPerto();
    if (!M || !this.ligado(M.m.jogo)) return '';
    const gente = M.e?.lugares.filter((l) => l && !l.bot).length || 0;
    const nome = { truco: 'truco', uno: 'uno', vinteum: '21' }[M.m.jogo];
    return `<kbd>E</kbd>Sentar na mesa de ${nome}${gente ? ` (${gente} ${gente === 1 ? 'pessoa' : 'pessoas'})` : ''}`;
  }

  lugar() {
    const m = MESAS_CARTAS[0];
    return { nome: 'Truco, Uno e 21', desc: 'Mesas de cartas do salão · com robôs', cor: '#f87171', pos: [m.x, 0, m.z - R_CADEIRA - 0.7], yaw: Math.PI };
  }
}
