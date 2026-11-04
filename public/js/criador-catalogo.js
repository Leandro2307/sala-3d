// Catálogo do criador por voz (U, ou /catalogo no chat): todas as peças com a miniatura 3D, os
// jeitos, as ligações e combinações prontas. Clicar numa peça põe a palavra no montador (com o
// "que atira" no meio, se precisar); duplo clique cria só ela. A prévia mostra a árvore que o
// jogo vai montar com a frase, do mesmo jeito que a voz.
import * as THREE from 'three';
import { PECAS, CATEGORIAS, MODS, COMBOS, parsear, arvore, novoNo, normalizar } from './criador-dados.js';
import { construirModelo } from './criador-modelos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const palavra = (k) => PECAS[k].nome.toLowerCase();
const LIG_PALAVRAS = new Set(['que', 'atira', 'caga', 'solta', 'vira', 'em', 'de', 'bota', 'chove', 'cospe', 'joga']);
const CHIPS_LIG = [
  ['que atira', 'atira no mais perto (na arma: o que ela dispara)'],
  ['que cospe', 'o mesmo que atira'],
  ['que caga', 'deixa cair embaixo'],
  ['que solta', 'deixa cair embaixo'],
  ['que bota', 'bota atrás (bicho de chão)'],
  ['que chove', 'cai de cima (nuvem)'],
  ['que vira', 'no fim vira outras coisas'],
  ['que explode em', 'explode e vira outras coisas'],
  ['e', 'volta para a peça anterior: "pombo que caga ovos e atira abelhas"'],
];
const NUMS = ['dois', 'três', 'cinco', 'dez', 'vinte'];

const CSS = `
#cc-fundo { position: fixed; inset: 0; z-index: 90; background: rgba(2,6,23,.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
#cc-fundo[hidden] { display: none; }
#cc { width: min(1100px, 100%); height: min(760px, 100%); display: flex; flex-direction: column; background: #0f172a; color: #f1f5f9; border: 1px solid #1e293b;
  border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; font: 500 14px 'Plus Jakarta Sans', system-ui, sans-serif; }
#cc header { display: flex; align-items: center; gap: 12px; padding: 16px 20px 10px; }
#cc h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.01em; }
#cc header p { margin: 2px 0 0; color: #94a3b8; font-size: 13px; }
#cc header kbd { background: #1e293b; border: 1px solid #334155; border-radius: 5px; padding: 0 6px; font: 700 12px inherit; color: #fff; }
#cc .cc-x { margin-left: auto; width: 34px; height: 34px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; font-size: 18px; cursor: pointer; flex: none; }
#cc .cc-montador { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; padding: 0 20px; }
#cc-frase { min-width: 0; font: 600 16px inherit; padding: 11px 14px; border-radius: 12px; border: 2px solid #334155; background: #020617; color: #fff; outline: none; }
#cc-frase:focus { border-color: #fbbf24; }
#cc .cc-btn { border: 0; border-radius: 12px; padding: 0 16px; font: 800 14px inherit; cursor: pointer; background: #1e293b; color: #e2e8f0; }
#cc .cc-btn.criar { background: #fbbf24; color: #111827; }
#cc .cc-btn:disabled { opacity: .45; cursor: default; }
#cc-previa { margin: 8px 20px 0; padding: 8px 12px; min-height: 22px; max-height: 108px; overflow: auto; border-radius: 10px; background: #020617; border: 1px dashed #1e293b;
  font: 12px/1.45 ui-monospace, Consolas, monospace; color: #cbd5e1; white-space: pre; }
#cc-previa .vazio { color: #64748b; font-family: inherit; }
#cc-previa .ign { color: #fde68a; }
#cc nav { display: flex; gap: 6px; padding: 12px 20px 8px; flex-wrap: wrap; align-items: center; }
#cc nav button { border: 1px solid #334155; background: transparent; color: #cbd5e1; border-radius: 999px; padding: 5px 12px; font: 700 13px inherit; cursor: pointer; }
#cc nav button.on { background: var(--c, #fbbf24); border-color: var(--c, #fbbf24); color: #0f172a; }
#cc-busca { margin-left: auto; min-width: 160px; flex: 0 1 220px; padding: 6px 12px; border-radius: 999px; border: 1px solid #334155; background: #020617; color: #fff; font: 600 13px inherit; outline: none; }
#cc-grade { flex: 1; overflow: auto; padding: 6px 20px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 10px; align-content: start; }
#cc-grade h3 { grid-column: 1 / -1; margin: 10px 0 0; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--c, #94a3b8); }
.cc-item { position: relative; text-align: left; background: #111c33; border: 1px solid #1e293b; border-radius: 14px; padding: 8px 10px 10px; color: inherit; cursor: pointer;
  font: inherit; display: flex; flex-direction: column; gap: 2px; transition: transform .12s, border-color .12s, background .12s; }
.cc-item:hover { transform: translateY(-2px); border-color: var(--c, #fbbf24); background: #15213d; }
.cc-item:active { transform: scale(.97); }
.cc-item .cc-foto { width: 100%; aspect-ratio: 1.25; border-radius: 10px; background: radial-gradient(circle at 50% 40%, #1e293b, #0b1222); display: grid; place-items: center; overflow: hidden; }
.cc-item .cc-foto img { width: 92%; height: 92%; object-fit: contain; }
.cc-item b { font-size: 14px; margin-top: 4px; }
.cc-item small { color: #94a3b8; font-size: 12px; line-height: 1.3; }
.cc-item i { color: #64748b; font-size: 11px; font-style: normal; }
.cc-item .cc-tag { position: absolute; top: 12px; left: 14px; font: 800 10px inherit; letter-spacing: .08em; color: #0f172a; background: var(--c); border-radius: 6px; padding: 1px 6px; }
.cc-chip { text-align: left; background: #111c33; border: 1px solid #1e293b; border-radius: 12px; padding: 10px 12px; color: inherit; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 3px; }
.cc-chip:hover { border-color: #fbbf24; background: #15213d; }
.cc-chip b { font-size: 14px; display: flex; align-items: center; gap: 6px; }
.cc-chip b span { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
.cc-chip small { color: #94a3b8; font-size: 12px; }
.cc-combo { grid-column: span 2; }
.cc-combo b { font-size: 13px; font-weight: 700; }
@media (max-width: 640px) {
  #cc { border-radius: 14px; }
  #cc header p { display: none; }
  #cc .cc-montador { grid-template-columns: 1fr auto; }
  #cc .cc-btn.limpar { display: none; }
  #cc-grade { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); padding: 6px 12px 16px; }
  #cc nav { padding: 10px 12px 6px; }
  #cc-busca { margin-left: 0; flex: 1 1 100%; }
  .cc-combo { grid-column: 1 / -1; }
}`;

export class Catalogo {
  constructor({ criar }) {
    this.criar = criar;
    this.aba = 'tudo';
    this.fotos = new Map(); // peça -> dataURL da miniatura
    this.montado = false;
  }

  montar() {
    if (this.montado) return;
    this.montado = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const f = document.createElement('div');
    f.id = 'cc-fundo';
    f.hidden = true;
    const abas = [['tudo', 'Tudo', '#fbbf24'], ...CATEGORIAS.map((c) => [c.id, c.nome, c.cor]), ['jeitos', 'Jeitos', '#facc15'], ['ligacoes', 'Ligações', '#94a3b8'], ['combos', 'Combos prontos', '#f472b6']];
    f.innerHTML = `<div id="cc" role="dialog" aria-label="Catálogo do criador">
  <header><div><h2>Catálogo do Criador</h2><p>Clique nas peças para montar a frase (duplo clique cria só ela). Ou segure <kbd>N</kbd> e fale. <kbd>U</kbd> abre e fecha.</p></div>
  <button class="cc-x" title="Fechar (Esc)">✕</button></header>
  <div class="cc-montador"><input id="cc-frase" autocomplete="off" spellcheck="false" placeholder="Ex.: pistola que atira pombos que cagam granadas">
  <button class="cc-btn limpar">Limpar</button><button class="cc-btn criar" disabled>Criar</button></div>
  <pre id="cc-previa"></pre>
  <nav>${abas.map(([id, nome, cor]) => `<button data-aba="${id}" style="--c:${cor}">${esc(nome)}</button>`).join('')}<input id="cc-busca" placeholder="Buscar…" autocomplete="off"></nav>
  <div id="cc-grade"></div></div>`;
    document.body.appendChild(f);
    this.fundo = f;
    this.frase = f.querySelector('#cc-frase');
    this.previa = f.querySelector('#cc-previa');
    this.grade = f.querySelector('#cc-grade');
    this.busca = f.querySelector('#cc-busca');
    this.btnCriar = f.querySelector('.cc-btn.criar');

    f.addEventListener('mousedown', (e) => { if (e.target === f) this.fechar(); });
    f.querySelector('.cc-x').addEventListener('click', () => this.fechar());
    f.querySelector('.cc-btn.limpar').addEventListener('click', () => { this.frase.value = ''; this.atualizarPrevia(); this.frase.focus(); });
    this.btnCriar.addEventListener('click', () => this.criarFrase());
    this.frase.addEventListener('input', () => this.atualizarPrevia());
    this.busca.addEventListener('input', () => this.render());
    f.querySelector('nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aba]');
      if (!b) return;
      this.aba = b.dataset.aba;
      this.render();
      this.grade.scrollTop = 0;
    });
    // as teclas daqui não vão para o jogo (WASD, atalhos); Enter cria, Esc fecha, U fecha fora dos campos
    f.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.fechar(); } else if (e.key === 'Enter' && e.target === this.frase) { e.preventDefault(); this.criarFrase(); }
    });
    this.teclaFora = (e) => {
      if (this.fundo.hidden || this.fundo.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.code === 'KeyU') { e.preventDefault(); this.fechar(); }
    };
    this.grade.addEventListener('click', (e) => {
      const it = e.target.closest('[data-por]');
      if (!it) return;
      const t = it.dataset.por;
      if (it.dataset.tipo === 'combo') this.frase.value = t;
      else this.acrescentar(t, it.dataset.tipo);
      this.atualizarPrevia();
      this.frase.focus();
    });
    this.grade.addEventListener('dblclick', (e) => {
      const it = e.target.closest('[data-tipo="peca"], [data-tipo="combo"]');
      if (!it) return;
      this.criar(it.dataset.por);
      this.fechar();
    });
  }

  abrir() {
    this.montar();
    if (document.pointerLockElement) document.exitPointerLock();
    this.fundo.hidden = false;
    this.aberto = true;
    window.addEventListener('keydown', this.teclaFora, true);
    this.render();
    this.atualizarPrevia();
    setTimeout(() => this.frase.focus(), 30);
    this.gerarFotos();
  }

  fechar() {
    if (!this.aberto) return;
    this.aberto = false;
    this.fundo.hidden = true;
    window.removeEventListener('keydown', this.teclaFora, true);
    this.frase.blur();
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  // põe a palavra no fim da frase; peça depois de peça ganha o "que atira" no meio
  acrescentar(t, tipo) {
    const atual = this.frase.value.trim();
    if (!atual) { this.frase.value = tipo === 'lig' ? '' : t; return; }
    const ultima = normalizar(atual).split(' ').pop();
    let junta = ' ';
    if (tipo === 'peca' && !LIG_PALAVRAS.has(ultima) && !/^\d+$/.test(ultima) && !NUMS.map(normalizar).includes(ultima)) junta = ' que atira ';
    this.frase.value = `${atual}${junta}${t}`;
  }

  criarFrase() {
    const t = this.frase.value.trim();
    if (!t || !parsear(t)?.raiz) return;
    this.criar(t);
    this.fechar();
  }

  atualizarPrevia() {
    const t = this.frase.value.trim();
    const r = t ? parsear(t) : null;
    this.btnCriar.disabled = !r?.raiz;
    if (!t) {
      this.previa.innerHTML = '<span class="vazio">A árvore do que você montar aparece aqui.</span>';
      return;
    }
    if (!r?.raiz) {
      this.previa.innerHTML = '<span class="vazio">Nenhuma peça reconhecida ainda.</span>';
      return;
    }
    this.previa.innerHTML = esc(arvore(r.raiz).trimEnd()) + (r.ignoradas.length ? `\n<span class="ign">ignorei: ${esc(r.ignoradas.join(', '))}</span>` : '');
  }

  cartaoPeca(k) {
    const d = PECAS[k];
    const cat = CATEGORIAS.find((c) => c.id === d.cat);
    const proprio = normalizar(d.nome);
    const outros = d.syn.filter((s) => s !== proprio && s !== proprio.replace(/ /g, '')).slice(0, 3);
    const foto = this.fotos.get(k);
    return `<button class="cc-item" data-tipo="peca" data-por="${esc(palavra(k))}" data-k="${k}" style="--c:${cat?.cor || '#fbbf24'}" title="Clique: põe na frase · duplo clique: cria só isso">
  <div class="cc-foto">${foto ? `<img alt="" src="${foto}">` : ''}</div><b>${esc(d.nome)}</b><small>${esc(d.desc)}</small>${outros.length ? `<i>também: ${esc(outros.join(', '))}</i>` : ''}</button>`;
  }

  render() {
    const q = normalizar(this.busca.value);
    for (const b of this.fundo.querySelectorAll('nav [data-aba]')) b.classList.toggle('on', b.dataset.aba === this.aba);
    const bate = (...txt) => !q || txt.some((x) => normalizar(x).includes(q));
    let html = '';
    const pecas = Object.keys(PECAS).filter((k) => !PECAS[k].oculto && bate(PECAS[k].nome, PECAS[k].desc, ...PECAS[k].syn));
    if (this.aba === 'tudo' || CATEGORIAS.some((c) => c.id === this.aba)) {
      for (const c of CATEGORIAS) {
        if (this.aba !== 'tudo' && this.aba !== c.id) continue;
        const ks = pecas.filter((k) => PECAS[k].cat === c.id);
        if (!ks.length) continue;
        html += `<h3 style="--c:${c.cor}">${esc(c.nome)} · ${ks.length}</h3>${ks.map((k) => this.cartaoPeca(k)).join('')}`;
      }
    }
    if (this.aba === 'tudo' || this.aba === 'jeitos') {
      const ms = MODS.filter((m) => bate(m.nome, m.desc || '', ...m.syn));
      if (ms.length) {
        html += `<h3 style="--c:#facc15">Jeitos · depois da peça ("pombo gigante")</h3>${ms.map((m) => `<button class="cc-chip" data-tipo="mod" data-por="${esc(m.nome === 'arco-íris' ? 'colorido' : m.nome)}">
  <b>${m.cor ? `<span style="background:${m.cor === 'arcoiris' ? 'linear-gradient(90deg,#ef4444,#facc15,#22c55e,#3b82f6,#a855f7)' : m.cor}"></span>` : ''}${esc(m.nome)}</b><small>${esc(m.desc || 'Cor')}</small></button>`).join('')}`;
      }
      if (!q) html += `<h3 style="--c:#facc15">Quantidade · antes da peça ("três bombas")</h3>${NUMS.map((n) => `<button class="cc-chip" data-tipo="num" data-por="${n}"><b>${n}</b><small>${n === 'vinte' ? 'até trinta' : 'de uma vez'}</small></button>`).join('')}`;
    }
    if (this.aba === 'tudo' || this.aba === 'ligacoes') {
      const ls = CHIPS_LIG.filter(([t, d]) => bate(t, d));
      if (ls.length) html += `<h3 style="--c:#94a3b8">Ligações · entre duas peças</h3>${ls.map(([t, d]) => `<button class="cc-chip" data-tipo="lig" data-por="${esc(t)}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}`;
    }
    if (this.aba === 'tudo' || this.aba === 'combos') {
      const cs = COMBOS.filter((c) => bate(c));
      if (cs.length) html += `<h3 style="--c:#f472b6">Combos prontos · clique para ver, duplo clique cria</h3>${cs.map((c) => `<button class="cc-chip cc-combo" data-tipo="combo" data-por="${esc(c)}"><b>${esc(c)}</b></button>`).join('')}`;
    }
    this.grade.innerHTML = html || '<p style="color:#64748b">Nada com esse nome. Tente outra palavra.</p>';
  }

  // miniaturas: cada peça desenhada uma vez num renderizador pequeno, umas por quadro
  gerarFotos() {
    if (this.gerando) return;
    const falta = Object.keys(PECAS).filter((k) => !PECAS[k].oculto && !this.fotos.has(k));
    if (!falta.length) return;
    this.gerando = true;
    let r;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      this.gerando = false;
      return;
    }
    r.setPixelRatio(1);
    r.setSize(160, 128);
    const cena = new THREE.Scene();
    cena.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
    const sol = new THREE.DirectionalLight(0xffffff, 2.2);
    sol.position.set(3, 5, 4);
    cena.add(sol);
    const cam = new THREE.PerspectiveCamera(30, 160 / 128, 0.05, 100);
    const caixa = new THREE.Box3();
    const tam = new THREE.Vector3();
    const centro = new THREE.Vector3();
    const passo = () => {
      for (let i = 0; i < 6 && falta.length; i++) {
        const k = falta.shift();
        const m = construirModelo(novoNo(k));
        m.rotation.y = PECAS[k].tipo === 'arma' ? -Math.PI / 2 + 0.35 : -0.7;
        m.rotation.x = PECAS[k].tipo === 'arma' ? 0 : 0.12;
        cena.add(m);
        m.updateMatrixWorld(true);
        caixa.setFromObject(m);
        caixa.getSize(tam);
        caixa.getCenter(centro);
        const raio = Math.max(tam.x, tam.y, tam.z, 0.2) * 0.62;
        const dist = raio / Math.sin((cam.fov * Math.PI) / 360) + raio * 0.3;
        cam.position.set(centro.x + dist * 0.35, centro.y + dist * 0.32, centro.z + dist * 0.88);
        cam.lookAt(centro);
        r.render(cena, cam);
        const url = r.domElement.toDataURL('image/png');
        this.fotos.set(k, url);
        cena.remove(m);
        if (this.aberto) {
          const el = this.grade.querySelector(`[data-k="${k}"] .cc-foto`);
          if (el && !el.firstChild) el.innerHTML = `<img alt="" src="${url}">`;
        }
      }
      if (falta.length) requestAnimationFrame(passo);
      else {
        r.dispose();
        r.forceContextLoss();
        this.gerando = false;
      }
    };
    requestAnimationFrame(passo);
  }
}
