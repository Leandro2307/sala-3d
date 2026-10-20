// O que os jogos do parque (pingue-pongue, queimada, sinuca, minigolfe, cartas, gincana, kart e
// pinta-território) mostram por cima do 3D: a mensagem grande do meio da tela ("Ponto do Azul!"),
// a dica do E na parte de baixo, a barra de força (segurar F) e um placar pequeno no topo. Um só de
// cada para todos: quem decide qual dica aparece é o main.js (a do primeiro jogo que tiver uma).

let montado = false;
let el = {};
let tMsg = 0;
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
#pq-msg[hidden], #pq-dica[hidden], #pq-forca[hidden], #pq-placar[hidden] { display: none; }
body.touch #pq-dica { bottom: 200px; font-size: 13px; }
body.touch #pq-forca { bottom: 240px; }`;
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
    el.msg.querySelector('span').textContent = texto;
    el.msg.hidden = false;
    clearTimeout(tMsg);
    tMsg = setTimeout(() => { el.msg.hidden = true; }, ms);
  },
  // a dica de baixo (html com <kbd>); '' esconde
  dica(html) {
    montar();
    if (html === dicaAntes) return;
    dicaAntes = html;
    el.dica.innerHTML = html;
    el.dica.hidden = !html;
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
    if (el.placar.innerHTML !== html) el.placar.innerHTML = html;
    el.placar.hidden = !html;
  },
};

// Barra que vai e volta: 0 -> 1 em `periodo` ms e volta (segurar demais não ajuda)
export function vaiEVolta(desde, periodo = 1100) {
  const s = ((performance.now() - desde) / periodo) % 2;
  return s <= 1 ? s : 2 - s;
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

// Painel de duas faces (nenhuma espelhada) num poste: placar das mesas e quadras
export function painelDuasFaces(THREE, g, tex, larg, alt, x, y, z, ry, { poste = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const f of [0, Math.PI]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry + f;
    m.translateZ(0.03);
    g.add(m);
  }
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(larg + 0.12, alt + 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  fundo.position.set(x, y, z);
  fundo.rotation.y = ry;
  g.add(fundo);
  if (poste) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, y - alt / 2, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    p.position.set(x, (y - alt / 2) / 2, z);
    g.add(p);
  }
}
