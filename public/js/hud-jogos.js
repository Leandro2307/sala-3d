// O que os jogos do parque (pingue-pongue, queimada, sinuca, minigolfe, cartas, gincana, kart e
// pinta-território) mostram por cima do 3D: a mensagem grande do meio da tela ("Ponto do Azul!"),
// a dica do E na parte de baixo, a barra de força (segurar F) e um placar pequeno no topo. Um só de
// cada para todos: quem decide qual dica aparece é o main.js (a do primeiro jogo que tiver uma).
import { isTouch } from './touch.js';

// Os textos dos jogos falam de clique, mouse e teclas. No celular o clique é o botão Ação, mirar é
// arrastar a tela, e não há Esc nem roda do mouse (o X do canto sai)
const TOQUE = [
  // sinuca: no celular a mira é tocar no pano (o mesmo toque segura e solta a tacada)
  [/Aponte no pano para mirar · <kbd>Clique<\/kbd>segure e solte · roda do mouse aproxima · <kbd>Esc<\/kbd>andar/, 'Toque no pano, segure e solte'],
  [/Aponte no pano para mirar · segure o clique e solte/, 'Toque no pano, segure e solte'],
  [/aponte no pano, segure o clique e solte/, 'toque no pano, segure e solte'],
  [/<kbd>Clique<\/kbd>/g, '<kbd class="acao">Ação</kbd>'],
  [/([Mm])ire com a câmera/g, (_, m) => `${m === 'M' ? 'A' : 'a'}rraste a tela para mirar`],
  [/([Ss])egure o clique/g, '$1egure Ação'],
  [/o clique defende/g, 'Ação defende'],
  [/\(clique usa\)/g, '(Ação usa)'],
  [/\(clique\)/g, '(Ação)'],
  [/Clique para usar/g, 'Toque em Ação para usar'],
  [/clique corta/g, 'Ação corta'],
  [/clique em Começar/g, 'toque em Começar'],
  [/clique numa carta/g, 'toque numa carta'],
  // pinta-território: no celular não tem E lá dentro, quem sai é o X do canto
  [/tanque enche rápido · E sai/, 'tanque enche rápido · o X do canto sai'],
  [/(você: (?:Rosa|Verde)) · E sai/, '$1'],
  [/(você: (?:em campo|no cemitério)) · E sai/, '$1'],
  [/ · <kbd>Esc<\/kbd> ?sai/g, ''],
  [/ · Esc sai/g, ''],
  [/<kbd>R<\/kbd> volta/g, '↺ volta'],
];
export function paraToque(texto) {
  if (!isTouch || !texto) return texto;
  return TOQUE.reduce((s, [re, troca]) => s.replace(re, troca), texto);
}

let montado = false;
let el = {};
let tMsg = 0;
let tDica = 0;
let dicaAntes = null;

function montar() {
  if (montado) return;
  montado = true;
  const css = document.createElement('style');
  css.textContent = `
#pq-msg { position: fixed; top: 22%; left: 0; right: 0; text-align: center; z-index: 31; pointer-events: none; color: #f8fafc;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif; text-shadow: 0 4px 22px rgba(0,0,0,.6); }
#pq-msg b { display: block; font-size: clamp(36px, 6.5vw, 80px); line-height: 1; }
#pq-msg span { display: block; margin-top: 8px; font-size: 18px; font-weight: 600; }
#pq-dica { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 30; padding: 10px 16px; border-radius: 12px; max-width: min(92vw, 720px);
  background: rgba(15,23,42,.86); color: #f8fafc; font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; text-align: center; }
#pq-dica kbd { padding: 1px 7px; margin: 0 6px 0 4px; border-radius: 6px; background: #4ade80; color: #0f172a; font: inherit; font-weight: 800; }
#pq-forca { position: fixed; left: 50%; bottom: 168px; transform: translateX(-50%); width: min(320px, 70vw); height: 16px; border-radius: 9px; background: rgba(15,23,42,.8);
  overflow: hidden; z-index: 30; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
#pq-forca i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #facc15; }
#pq-placar { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 14px; padding: 8px 16px;
  border-radius: 12px; background: rgba(15,23,42,.84); color: #f8fafc; font: 600 14px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; white-space: nowrap; }
#pq-placar b { font-size: 20px; font-variant-numeric: tabular-nums; }
#pq-placar small { color: #94a3b8; }
#pq-dica kbd.acao { background: #facc15; }
#pq-msg[hidden], #pq-dica[hidden], #pq-forca[hidden], #pq-placar[hidden] { display: none; }
#pq-dica.some { opacity: 0; transition: opacity .6s; }
/* celular: o meio e a parte de baixo são do jogo e dos botões. Placar no topo, a dica logo abaixo,
   a mensagem menor e a barra de força entre o analógico e os botões */
body.touch #pq-placar { top: calc(8px + env(safe-area-inset-top)); max-width: calc(100vw - 132px); gap: 8px; padding: 6px 12px; font-size: 12px;
  white-space: normal; flex-wrap: wrap; justify-content: center; row-gap: 0; }
body.touch #pq-placar b { font-size: 16px; }
body.touch.barra-aberta #pq-placar { top: calc(60px + env(safe-area-inset-top)); }
body.touch #pq-dica { top: calc(60px + env(safe-area-inset-top)); bottom: auto; padding: 7px 12px; border-radius: 10px; font-size: 12.5px; max-width: calc(100vw - 132px); }
body.touch[data-jogo] #pq-dica { top: calc(56px + env(safe-area-inset-top)); }
body.touch.barra-aberta #pq-dica { top: calc(108px + env(safe-area-inset-top)); }
body.touch #pq-dica kbd { padding: 0 6px; margin: 0 4px 0 2px; }
body.touch #pq-msg { top: 26%; padding: 0 16px; }
body.touch #pq-msg b { font-size: clamp(30px, 8vw, 52px); }
body.touch #pq-msg span { font-size: 14px; margin-top: 6px; }
body.touch #pq-forca { bottom: calc(34px + env(safe-area-inset-bottom)); width: min(240px, calc(100vw - 420px)); min-width: 120px; height: 14px; }
@media (orientation: portrait) {
  body.touch #pq-forca { bottom: calc(190px + env(safe-area-inset-bottom)); width: 56vw; }
}`;
  document.head.appendChild(css);
  const div = (id, html) => {
    const d = document.createElement('div');
    d.id = id;
    d.hidden = true;
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  };
  el.msg = div('pq-msg', '<b></b><span></span>');
  el.dica = div('pq-dica', '');
  el.forca = div('pq-forca', '<i></i>');
  el.barra = el.forca.querySelector('i');
  el.placar = div('pq-placar', '');
}

export const hud = {
  // título grande no meio da tela por ms milissegundos
  mensagem(titulo, texto = '', ms = 2000, cor = '#f8fafc') {
    montar();
    const b = el.msg.querySelector('b');
    b.textContent = titulo;
    b.style.color = cor;
    el.msg.querySelector('span').textContent = paraToque(texto);
    el.msg.hidden = false;
    clearTimeout(tMsg);
    tMsg = setTimeout(() => { el.msg.hidden = true; }, ms);
  },
  // a dica de baixo (html com <kbd>); '' esconde
  dica(html) {
    montar();
    if (html === dicaAntes) return;
    dicaAntes = html;
    el.dica.innerHTML = paraToque(html);
    el.dica.hidden = !html;
    el.dica.classList.remove('some');
    // no celular a tela é pequena: a explicação de como jogar some depois de lida (volta quando
    // muda). O convite curto para entrar ("E Jogar...") fica, porque o botão E está ali do lado
    clearTimeout(tDica);
    if (isTouch && html && !html.startsWith('<kbd>E</kbd>')) tDica = setTimeout(() => el.dica.classList.add('some'), 5000);
  },
  // barra de força: v de 0 a 1 (null esconde); cor opcional
  forca(v, cor = '#facc15') {
    montar();
    if (v == null) {
      if (!el.forca.hidden) el.forca.hidden = true;
      return;
    }
    el.forca.hidden = false;
    el.barra.style.width = `${Math.round(v * 100)}%`;
    el.barra.style.background = cor;
  },
  // placarzinho no topo (html); '' esconde
  placar(html) {
    montar();
    html = paraToque(html);
    if (el.placar.innerHTML !== html) el.placar.innerHTML = html;
    el.placar.hidden = !html;
  },
};

// Barra que vai e volta: 0 -> 1 em `periodo` ms e volta (segurar demais não ajuda)
export function vaiEVolta(desde, periodo = 1100) {
  const s = ((performance.now() - desde) / periodo) % 2;
  return s <= 1 ? s : 2 - s;
}

// As plaquinhas das mesas (cartas e poker) seguem as cadeiras na tela e, numa tela baixa, se
// amontoam e tampam os painéis. placas: [{ x, y, w, h }] (x no meio, y na base da plaquinha);
// area: { esquerda, direita, topo, baixo } onde elas podem ficar; evitar: retângulos dos painéis
// e da mão (getBoundingClientRect). Mexe x e y no lugar: primeiro sai de cima dos painéis (pelo
// lado mais perto que caiba: esquerda, direita ou para cima), depois uma empurra a outra (de lado,
// quase sempre) e no fim tudo volta para dentro da área.
export function arrumarPlacas(placas, area, evitar = []) {
  const prende = (p) => {
    p.x = Math.min(area.direita - p.w / 2, Math.max(area.esquerda + p.w / 2, p.x));
    p.y = Math.min(area.baixo, Math.max(area.topo + p.h, p.y));
  };
  const cruza = (p, r) => p.x + p.w / 2 + 4 > r.left && p.x - p.w / 2 - 4 < r.right && p.y + 4 > r.top && p.y - p.h - 4 < r.bottom;
  for (let volta = 0; volta < 8; volta++) {
    let mexeu = false;
    for (const p of placas) {
      prende(p);
      for (const r of evitar) {
        if (!r || !cruza(p, r)) continue;
        const saidas = [
          r.left - area.esquerda >= p.w + 6 && { x: r.left - 6 - p.w / 2, y: p.y },
          area.direita - r.right >= p.w + 6 && { x: r.right + 6 + p.w / 2, y: p.y },
          r.top - area.topo >= p.h + 6 && { x: p.x, y: r.top - 6 },
        ].filter(Boolean);
        if (!saidas.length) continue;
        const melhor = saidas.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
        p.x = melhor.x;
        p.y = melhor.y;
        mexeu = true;
      }
    }
    for (let i = 0; i < placas.length; i++) {
      for (let j = i + 1; j < placas.length; j++) {
        const a = placas[i];
        const b = placas[j];
        const sx = (a.w + b.w) / 2 + 6 - Math.abs(b.x - a.x);
        const sy = (a.h + b.h) / 2 + 4 - Math.abs(b.y - b.h / 2 - (a.y - a.h / 2));
        if (sx <= 0 || sy <= 0) continue;
        mexeu = true;
        if (sx < sy * 1.5) {
          const d = ((b.x >= a.x ? 1 : -1) * sx) / 2;
          a.x -= d;
          b.x += d;
        } else {
          const d = ((b.y >= a.y ? 1 : -1) * sy) / 2;
          a.y -= d;
          b.y += d;
        }
      }
    }
    if (!mexeu) break;
  }
  placas.forEach(prende);
}

// textura de canvas que se redesenha com redesenhar(...args)
export function texturaViva(THREE, w, h, desenhar) {
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

export const FONTE = (p, peso = 800) => `${peso} ${p}px 'Plus Jakarta Sans', system-ui, sans-serif`;

// Painel de duas faces (nenhuma espelhada) num poste: placar das mesas e quadras. Devolve as malhas.
export function painelDuasFaces(THREE, g, tex, larg, alt, x, y, z, ry, { poste = true } = {}) {
  const malhas = [];
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const f of [0, Math.PI]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry + f;
    m.translateZ(0.03);
    malhas.push(m);
  }
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(larg + 0.12, alt + 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  fundo.position.set(x, y, z);
  fundo.rotation.y = ry;
  malhas.push(fundo);
  if (poste) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, y - alt / 2, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    p.position.set(x, (y - alt / 2) / 2, z);
    malhas.push(p);
  }
  g.add(...malhas);
  return malhas;
}
