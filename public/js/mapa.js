// O mapa da sala visto de cima, desenhado num canvas 2D com os mesmos dados do mundo (ruas, praças,
// áreas e pistas). Serve aos totens "você está aqui" do 3D (cidade.js) e ao mapa da tela (MapaTela),
// que mostra onde você e os outros estão e leva até uma área com um toque.
import { PRACA, PRACAS, PISOS, AGUA, BOSQUES, AREAS, ROTULOS, MAPA_INFO } from './cidade-dados.js';
import { PARQUE, SALAO, QUEIMADA, PINTA_ARENA, GOLFE_AREA, PORTAL_GINCANA, PORTAL_FANTASMAS } from './parque-dados.js';
import { prepararRuas } from './cidade.js';
import { PISTA, CAMINHO } from './pista.js';
import { LINHA as LINHA_KART, KART } from './kart-dados.js';
import { ESTADIO } from './futebol.js';
import { VOLEI, BASQUETE, BOLICHE } from './quadras-fisica.js';
import { SURF } from './ceu-dados.js';

const FONTE = (px, peso = 800) => `${peso} ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;
// a área cercada, com uma folga
const LIM = { x0: -60, x1: 488, z0: -48, z1: 868 };
// as cores do mapa no tema: o gramado, a mata e cada tipo de água
const TEMA = MAPA_INFO.tema;
const COR_CHAO = { tropical: '#4f9a45', neve: '#d9e3ee', outono: '#8f8b45' }[TEMA.id] || '#2f5d3a';
const COR_MATA = { tropical: '#2f7d3a', neve: '#9fb4c9', outono: '#a4472a' }[TEMA.id] || '#28502f';
const COR_AGUA = { lagoa: '#22c3cf', gelo: '#bfe3fb', carpas: '#2a7f86' };
// as ruas já com a curva e o trecho até o autódromo (na primeira vez que o mapa é desenhado)
let RUAS = null;
// os jogos do parque, com nome menor (o id é o do jogo: o mapa da tela leva até ele). O salão de
// jogos é uma área (AREAS.salao), com o nome dele.
const NO_PARQUE = [
  ['golfe', 'Minigolfe', (GOLFE_AREA.x0 + GOLFE_AREA.x1) / 2, (GOLFE_AREA.z0 + GOLFE_AREA.z1) / 2],
  ['queimada', 'Queimada', QUEIMADA.cx, QUEIMADA.cz],
  ['pinta', 'Pinta', PINTA_ARENA.cx, PINTA_ARENA.cz],
  ['gincana', 'Gincana', PORTAL_GINCANA.x, PORTAL_GINCANA.z - 8],
  ['fantasmas', 'Fantasmas', PORTAL_FANTASMAS.x, PORTAL_FANTASMAS.z + 9],
];
// os jogos que ficam no salão
const NO_SALAO = ['pingue', 'sinuca', 'cartas', 'poker'];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// Desenha o mapa em w x h. frente: para onde olha quem lê ([dx, dz]); essa direção fica para cima
// (no totem é a direção em que a pessoa está virada; na tela, o norte). aqui: { x, z, yaw? } marca
// "você"; pessoas: [{ x, z, cor }]. Devolve onde ficou cada nome (para o toque escolher uma área).
export function desenharMapa(ctx, w, h, { frente = [0, 1], aqui = null, pessoas = [], margem = 24, legenda = true } = {}) {
  const [fx, fz] = frente;
  // a direita de quem olha para a frente. No 3D (three.js, y para cima) quem olha para +z tem o +x à
  // esquerda: o mapa segue o que a pessoa vê, então com o norte para cima o "leste" (+x) fica à esquerda
  const rx = -fz;
  const rz = fx;
  const cantos = [[LIM.x0, LIM.z0], [LIM.x1, LIM.z0], [LIM.x1, LIM.z1], [LIM.x0, LIM.z1]];
  const proj = (x, z) => [x * rx + z * rz, -(x * fx + z * fz)];
  const ps = cantos.map(([x, z]) => proj(x, z));
  const minX = Math.min(...ps.map((p) => p[0]));
  const maxX = Math.max(...ps.map((p) => p[0]));
  const minY = Math.min(...ps.map((p) => p[1]));
  const maxY = Math.max(...ps.map((p) => p[1]));
  const esc = Math.min((w - margem * 2) / (maxX - minX), (h - margem * 2) / (maxY - minY));
  const ox = (w - (maxX - minX) * esc) / 2 - minX * esc;
  const oy = (h - (maxY - minY) * esc) / 2 - minY * esc;
  const px = (x, z) => {
    const [a, b] = proj(x, z);
    return [ox + a * esc, oy + b * esc];
  };
  const caminho = (pts, fechar = false) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const [qx, qy] = px(x, z);
      if (i) ctx.lineTo(qx, qy);
      else ctx.moveTo(qx, qy);
    });
    if (fechar) ctx.closePath();
  };
  const ret = (x0, z0, x1, z1, cor, raio = 4) => {
    const [a, b] = px(x0, z0);
    const [c, d] = px(x1, z1);
    ctx.fillStyle = cor;
    roundRect(ctx, Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), raio);
    ctx.fill();
  };
  const circulo = (x, z, r, cor) => {
    const [qx, qy] = px(x, z);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(qx, qy, Math.max(3, r * esc), 0, Math.PI * 2);
    ctx.fill();
  };

  RUAS ||= prepararRuas();
  ctx.fillStyle = TEMA.relevo.mar ? '#0e8fb3' : '#0f172a';
  ctx.fillRect(0, 0, w, h);
  // gramado e bosques
  ctx.fillStyle = COR_CHAO;
  caminho([[LIM.x0 + 8, LIM.z0 + 8], [LIM.x1 - 8, LIM.z0 + 8], [LIM.x1 - 8, LIM.z1 - 8], [LIM.x0 + 8, LIM.z1 - 8]], true);
  ctx.fill();
  for (const b of BOSQUES) ret(b.x0, b.z0, b.x1, b.z1, COR_MATA, 0);
  for (const a of AGUA) {
    if (a.tipo === 'lagoa') circulo(a.x, a.z, a.r * 1.3, '#ecd9a5');
    circulo(a.x, a.z, a.r * 1.05, COR_AGUA[a.tipo] || '#3b82c4');
  }
  // pistas: o autódromo e o kart
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const pista = (pts, larg, borda) => {
    caminho(pts, true);
    ctx.strokeStyle = '#1f2430';
    ctx.lineWidth = Math.max(4, larg * esc + 2);
    ctx.stroke();
    ctx.strokeStyle = borda;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  pista(CAMINHO.map((p) => [PISTA.cx + p.x, PISTA.cz + p.y]), PISTA.largura, '#ef4444');
  pista(LINHA_KART, KART.largura, '#facc15');
  // construções e quadras, na cor da área
  ret(-52, -40, 60, 60, '#64748b', 6);
  // o estádio: 84 x 108 m no sistema dele, girado como no mapa
  const ex = Math.abs(Math.cos(ESTADIO.giro)) * 42 + Math.abs(Math.sin(ESTADIO.giro)) * 54;
  const ez = Math.abs(Math.sin(ESTADIO.giro)) * 42 + Math.abs(Math.cos(ESTADIO.giro)) * 54;
  ret(ESTADIO.cx - ex, ESTADIO.cz - ez, ESTADIO.cx + ex, ESTADIO.cz + ez, '#0e7490', 6);
  ret(VOLEI.cx - 11, VOLEI.cz - 7, VOLEI.cx + 11, VOLEI.cz + 7, '#ca8a04');
  ret(BASQUETE.cx - 16, BASQUETE.cz - 9, BASQUETE.cx + 16, BASQUETE.cz + 9, '#c2410c');
  ret(BOLICHE.x0 - 6, BOLICHE.pistas[0] - 4, BOLICHE.x0 + 26, BOLICHE.pistas[BOLICHE.pistas.length - 1] + 4, '#a16207');
  for (const P of PISOS) ret(P.x0, P.z0, P.x1, P.z1, '#7c6fb0', 6);
  ret(SALAO.x0, SALAO.z0, SALAO.x1, SALAO.z1, '#15803d');
  ret(GOLFE_AREA.x0, GOLFE_AREA.z0, GOLFE_AREA.x1, GOLFE_AREA.z1, '#4d7c0f');
  ret(QUEIMADA.cx - QUEIMADA.comp / 2, QUEIMADA.cz - QUEIMADA.larg / 2, QUEIMADA.cx + QUEIMADA.comp / 2, QUEIMADA.cz + QUEIMADA.larg / 2, '#ea580c');
  const PA = PINTA_ARENA;
  ret(PA.cx - PA.lado / 2, PA.cz - PA.lado / 2, PA.cx + PA.lado / 2, PA.cz + PA.lado / 2, '#a21caf');
  // ruas por cima de tudo, e as praças
  ctx.strokeStyle = '#e7dfd0';
  for (const r of RUAS) {
    caminho(r.pontos);
    ctx.lineWidth = Math.max(4, r.largura * esc);
    ctx.stroke();
  }
  for (const c of [PRACA, ...PRACAS, PARQUE]) if (c.r > 0) circulo(c.x, c.z, c.r, '#ece5d6');
  circulo(SURF.chegada.x, SURF.chegada.z, 5, '#f472b6');

  // nomes: uma etiqueta na cor da área (os do parque, menores)
  const alvos = [];
  const etiqueta = (id, texto, x, z, cor, tam) => {
    const [qx, qy] = px(x, z);
    ctx.font = FONTE(tam);
    const tw = ctx.measureText(texto).width;
    const bw = tw + tam * 1.1;
    const bh = tam * 1.55;
    ctx.fillStyle = 'rgba(15,23,42,0.86)';
    roundRect(ctx, qx - bw / 2, qy - bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.strokeStyle = cor;
    ctx.lineWidth = Math.max(1.5, tam * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, qx, qy + tam * 0.04);
    alvos.push({ id, x: qx - bw / 2, y: qy - bh / 2, w: bw, h: bh });
  };
  const base = Math.max(11, Math.min(24, esc * 7));
  for (const [id, a] of Object.entries(AREAS)) {
    if (!ROTULOS[id]) continue;
    const [x, z] = ROTULOS[id];
    etiqueta(id, a.nome, x, z, a.cor, id === 'praca' || id === 'lago' ? base * 0.85 : base);
  }
  // os jogos do parque só quando o mapa é grande o bastante para os nomes não se encavalarem
  if (esc > 0.9) for (const [id, nome, x, z] of NO_PARQUE) etiqueta(id, nome, x, z, '#4ade80', base * (esc > 1.3 ? 0.72 : 0.62));

  // os outros e você (uma seta para onde está virado)
  for (const p of pessoas) circulo(p.x, p.z, 2.6, p.cor || '#e2e8f0');
  if (aqui) {
    const [vx, vy] = px(aqui.x, aqui.z);
    const r = Math.max(9, base * 0.6);
    ctx.save();
    ctx.translate(vx, vy);
    if (aqui.yaw != null) {
      // para onde a pessoa olha: (-sen yaw, -cos yaw), no plano do mapa
      const dx = -Math.sin(aqui.yaw);
      const dz = -Math.cos(aqui.yaw);
      const [a, b] = proj(dx, dz);
      ctx.rotate(Math.atan2(b, a) + Math.PI / 2);
    }
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 0.95, r);
    ctx.lineTo(0, r * 0.45);
    ctx.lineTo(-r * 0.95, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // a rosa dos ventos: onde fica o norte
  if (legenda) {
    const [nx, ny] = proj(0, 1);
    const cx = w - margem - 22;
    const cy = margem + 22;
    ctx.fillStyle = 'rgba(15,23,42,0.86)';
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    // a ponta vermelha aponta o norte; o N fica de pé, do outro lado
    const a = Math.atan2(ny, nx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(6, -2);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx - Math.cos(a) * 7, cy - Math.sin(a) * 7);
  }
  return { alvos, px };
}

// ------------------------------------------------------------------ o mapa da tela
// Botão de mapa (e a tecla L): o mapa inteiro com você e os outros. Tocar numa área (no mapa ou na
// lista) leva até ela. opts: posicao() -> { x, z, yaw }, pessoas() -> [{ x, z, cor }], ir(id),
// jogosDoParque() -> [{ id, nome, desc, cor }] (os jogos do parque que estão ligados)
export class MapaTela {
  constructor(opts) {
    this.opts = opts;
    this.aberto = false;
    this.alvos = [];
    this.montar();
  }

  montar() {
    const css = document.createElement('style');
    css.textContent = `
#mapa-tela { position: fixed; inset: 0; z-index: 40; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; padding: 16px;
  background: rgba(8,10,16,.88); color: #f8fafc; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
#mapa-tela[hidden] { display: none; }
#mapa-tela .mt-mapa { position: relative; min-height: 0; border-radius: 16px; overflow: hidden; background: #0f172a; }
#mapa-tela canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: pointer; touch-action: none; }
#mapa-tela .mt-lado { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
#mapa-tela .mt-topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
#mapa-tela h2 { margin: 0; font-size: 22px; }
#mapa-tela .mt-fechar { width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: inherit;
  font-size: 20px; cursor: pointer; }
#mapa-tela .mt-dica { margin: 0; color: #94a3b8; font-size: 12.5px; }
#mapa-tela .mt-lista { display: grid; gap: 6px; overflow-y: auto; padding-right: 2px; }
#mapa-tela .mt-lista button { display: grid; grid-template-columns: 12px 1fr; gap: 2px 10px; align-items: center; text-align: left; padding: 8px 10px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); color: inherit; font: inherit; cursor: pointer; }
#mapa-tela .mt-lista button:hover, #mapa-tela .mt-lista button:focus-visible { background: rgba(255,255,255,.1); }
#mapa-tela .mt-lista i { grid-row: span 2; width: 12px; height: 12px; border-radius: 50%; background: var(--c); }
#mapa-tela .mt-lista b { font-size: 14px; }
#mapa-tela .mt-lista small { color: #94a3b8; font-size: 12px; }
#mapa-tela .mt-lista .mt-sub { padding-left: 22px; }
#mapa-tela .mt-lista .mt-sub b { font-size: 13px; font-weight: 600; }
@media (max-width: 720px), (max-height: 500px) {
  #mapa-tela { grid-template-columns: minmax(0, 1fr) 210px; gap: 8px; padding: calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) 8px calc(8px + env(safe-area-inset-left)); }
  #mapa-tela h2 { font-size: 17px; }
  #mapa-tela .mt-lista button { padding: 6px 8px; }
  #mapa-tela .mt-lista small { display: none; }
}
@media (orientation: portrait) and (max-width: 720px) {
  #mapa-tela { grid-template-columns: 1fr; grid-template-rows: auto auto minmax(0, 1fr) 26%; }
  #mapa-tela .mt-lado { display: contents; }
  #mapa-tela .mt-topo { order: -2; }
  #mapa-tela .mt-dica { order: -1; }
}`;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.id = 'mapa-tela';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Mapa');
    el.innerHTML = `
      <div class="mt-mapa"><canvas></canvas></div>
      <div class="mt-lado">
        <div class="mt-topo"><h2>Mapa</h2><button type="button" class="mt-fechar" aria-label="Fechar o mapa">✕</button></div>
        <p class="mt-dica">A seta vermelha é você. Toque numa área para ir até lá.</p>
        <div class="mt-lista"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.lista = el.querySelector('.mt-lista');
    el.querySelector('.mt-fechar').addEventListener('click', () => this.fechar());
    this.lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ir]');
      if (b) this.ir(b.dataset.ir);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // a etiqueta tocada (com uma folga para o dedo)
      const alvo = this.alvos.find((a) => x > a.x - 8 && x < a.x + a.w + 8 && y > a.y - 8 && y < a.y + a.h + 8);
      if (alvo) this.ir(alvo.id);
    });
    // clicar no fundo escuro (fora do mapa e da lista) fecha
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.fechar(); });
  }

  ir(id) {
    this.fechar();
    this.opts.ir(id);
  }

  abrir() {
    if (this.aberto) return;
    this.aberto = true;
    this.el.hidden = false;
    // os jogos do salão ficam embaixo dele; os outros, embaixo do parque
    const todos = this.opts.jogosDoParque();
    const doSalao = (j) => NO_SALAO.includes(j.id);
    this.lista.innerHTML = Object.entries(AREAS).map(([id, a]) => {
      const item = `<button type="button" data-ir="${id}" style="--c:${a.cor}"><i></i><b>${a.nome}</b><small>${a.sub}</small></button>`;
      if (id !== 'parque' && id !== 'salao') return item;
      const parque = todos.filter((j) => doSalao(j) === (id === 'salao'));
      return item + parque.map((j) => `<button type="button" class="mt-sub" data-ir="${j.id}" style="--c:${j.cor}"><i></i><b>${j.nome}</b><small>${j.desc}</small></button>`).join('');
    }).join('');
    this.desenhar();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.desenhar(), 250);
  }

  fechar() {
    if (!this.aberto) return;
    this.aberto = false;
    this.el.hidden = true;
    clearInterval(this.timer);
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  desenhar() {
    const cv = this.canvas;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // o mapa é comprido de sul a norte: numa tela larga ele deita, com o norte à direita (o prédio,
    // onde se começa, fica à esquerda)
    const frente = r.width > r.height * 1.1 ? [1, 0] : [0, 1];
    const { alvos } = desenharMapa(ctx, r.width, r.height, { frente, aqui: this.opts.posicao(), pessoas: this.opts.pessoas(), margem: 14 });
    this.alvos = alvos;
  }
}
