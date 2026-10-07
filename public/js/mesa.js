// Mesa de trabalho: todas as telas compartilhadas lado a lado, como monitores de um PC.
//
// Abre com Tab (ou o botão da barra) e fecha com Esc, voltando direto para a visão do boneco.
// Nas telas em que o dono liberou o controle não há botão "Controlar": o mouse já mexe na tela
// que está embaixo dele e o teclado fica com a última clicada — igual a um PC com vários
// monitores. Alt+1…9 troca de monitor pelo teclado e Alt+Enter amplia o monitor da vez.
//
// Enquanto a mesa está aberta o 3D não é desenhado (ela cobre tudo): sobra placa de vídeo
// para decodificar as telas. E cada tela é pedida a quem compartilha no tamanho em que o
// monitor dela aparece (nivelDe): quatro monitores lado a lado não precisam de 1080p cada.

import { icon } from './icons.js';
import { isTouch } from './touch.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GAP = 10;
const ETIQUETA = 30; // altura da etiqueta em cima de cada monitor

// Quantas colunas deixam cada monitor maior? Testa todas e fica com a de maior área.
function melhorGrade(n, W, H, aspecto) {
  let melhor = { cols: 1, rows: n, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (W - GAP * (cols - 1)) / cols;
    const ch = (H - GAP * (rows - 1)) / rows - ETIQUETA;
    const w = Math.max(0, Math.min(cw, ch * aspecto));
    if (w > melhor.w) melhor = { cols, rows, w };
  }
  return melhor;
}

export class Mesa {
  // telas(): [{ key, nome, onde, cor, minha, controle, semControle, navega, site, titulo, stream }]
  // na ordem dos monitores. semControle: o que a etiqueta diz quando a tela não aceita controle
  // daqui. navega: é uma aba que dá para navegar (voltar, endereço) — ganha a barra de navegação.
  // aoOrganizar: os monitores mudaram de tamanho ou de vez (hora de pedir de novo cada tela).
  constructor({ raiz, controle, telas, aoNavegar, aoCompartilhar, aoTelaCheia, aoFechar, aoOrganizar }) {
    this.raiz = raiz;
    this.controle = controle;
    this.telas = telas;
    this.aoFechar = aoFechar;
    this.aoOrganizar = aoOrganizar;
    this.area = raiz.querySelector('.mesa-area');
    this.tarefas = raiz.querySelector('.mesa-tarefas');
    this.vazia = raiz.querySelector('.mesa-vazia');
    this.btnAmpliar = raiz.querySelector('[data-mesa="ampliar"]');
    this.monitores = new Map(); // key -> { el, video, dados }
    this.ordem = [];
    this.ativa = null;
    this.ampliada = false;
    this.alturaVideo = 0; // px CSS da imagem de cada monitor (o organizar mede)
    this.visiveis = 0; // monitores à vista (os outros estão atrás do ampliado)

    raiz.querySelector('[data-mesa="sair"]').addEventListener('click', () => this.aoFechar());
    raiz.querySelector('[data-mesa="cheia"]').addEventListener('click', (e) => {
      e.currentTarget.blur();
      aoTelaCheia();
    });
    raiz.querySelector('[data-mesa="compartilhar"]').addEventListener('click', () => aoCompartilhar());
    this.btnAmpliar.addEventListener('click', () => {
      this.btnAmpliar.blur();
      this.alternarAmpliar();
    });
    this.tarefas.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]');
      if (!b) return;
      b.blur();
      this.ativar(b.dataset.key);
    });
    // clique em qualquer lugar de um monitor deixa ele na vez (o Controle já manda o clique
    // para a tela quando ela aceita controle); duplo clique na etiqueta amplia
    this.area.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.monitor');
      if (!el || e.target.closest('.mon-max')) return;
      this.ativar(el.dataset.key);
    });
    this.area.addEventListener('dblclick', (e) => {
      if (e.target.closest('.mon-tag') && !e.target.closest('.mon-max, .nav-aba')) this.alternarAmpliar();
    });
    // barra de navegação de cada monitor (aba): voltar, avançar, recarregar, endereço
    this.area.addEventListener('submit', (e) => {
      const form = e.target.closest('.nav-aba');
      if (!form) return;
      e.preventDefault();
      aoNavegar(form.closest('.monitor').dataset.key, 'abrir', form.elements.endereco.value);
      form.elements.endereco.blur();
    });
    this.area.addEventListener('focusin', (e) => {
      if (e.target.name === 'endereco') e.target.select();
    });
    // saiu do campo sem dar Enter: volta a mostrar o site em que a aba está
    this.area.addEventListener('focusout', (e) => {
      if (e.target.name === 'endereco') setTimeout(() => this.marcar(), 0);
    });
    this.area.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        nav.blur();
        aoNavegar(nav.closest('.monitor').dataset.key, nav.dataset.nav);
        return;
      }
      const b = e.target.closest('.mon-max');
      if (!b) return;
      b.blur();
      const key = b.closest('.monitor').dataset.key;
      if (this.ampliada && this.ativa === key) this.alternarAmpliar();
      else {
        this.ativar(key);
        if (!this.ampliada) this.alternarAmpliar();
      }
    });
    new ResizeObserver(() => this.organizar()).observe(this.area);
  }

  get aberta() { return !this.raiz.hidden; }

  abrir() {
    this.raiz.hidden = false;
    this.atualizar();
  }

  fechar() {
    if (!this.aberta) return;
    for (const m of this.monitores.values()) this.descartar(m);
    this.monitores.clear();
    this.ordem = [];
    this.alturaVideo = 0;
    this.visiveis = 0;
    this.area.textContent = '';
    this.tarefas.textContent = '';
    this.raiz.hidden = true;
  }

  descartar(m) {
    this.controle.remover(m.video);
    m.video.srcObject = null;
    m.el.remove();
  }

  // Chamado sempre que as telas da sala mudam: cria, tira e ajusta os monitores sem recriar os
  // que continuam (recriar faria o vídeo piscar).
  atualizar() {
    if (!this.aberta) return;
    const lista = this.telas();
    const chaves = new Set(lista.map((t) => t.key));
    for (const [key, m] of this.monitores) {
      if (chaves.has(key)) continue;
      this.descartar(m);
      this.monitores.delete(key);
    }
    lista.forEach((t, i) => {
      let m = this.monitores.get(t.key);
      if (!m) {
        m = this.criar(t.key);
        this.monitores.set(t.key, m);
      }
      m.dados = t;
      // garante a ordem (só move se precisar: tirar o vídeo do lugar à toa pode pausá-lo)
      if (this.area.children[i] !== m.el) this.area.insertBefore(m.el, this.area.children[i] || null);
      if (m.video.srcObject !== t.stream) {
        m.video.srcObject = t.stream;
        if (t.stream) m.video.play().catch(() => {});
      }
      m.el.querySelector('.mon-espera').hidden = !!t.stream;
      if (t.controle && t.stream) this.controle.adicionar(m.video, t.key);
      else this.controle.remover(m.video);
      m.el.querySelector('.mon-n').textContent = i + 1;
      m.el.querySelector('.mon-cor').style.setProperty('--c', t.cor);
      // com a barra de navegação o site aparece no campo de endereço; sem ela, junto do nome
      m.el.querySelector('.mon-nome').textContent = `${t.nome} · ${t.onde}${!t.navega && t.site ? ` · ${t.site}` : ''}`;
      m.el.querySelector('.nav-aba').hidden = !t.navega;
    });
    this.ordem = lista.map((t) => t.key);
    if (this.ativa && !this.monitores.has(this.ativa)) {
      this.ativa = null;
      this.ampliada = false;
    }
    // sem monitor da vez: começa pela primeira tela que aceita controle
    if (!this.ativa && this.ordem.length) {
      this.ativa = this.ordem.find((k) => this.monitores.get(k).dados.controle) ?? this.ordem[0];
    }
    // a mesa abriu antes do vídeo chegar (ou o dono liberou o controle agora): o monitor da vez
    // ganha o teclado assim que vira controlável
    const vez = this.monitores.get(this.ativa);
    if (vez && !this.controle.teclado && this.controle.tem(vez.video)) this.controle.focar(vez.video);
    this.vazia.hidden = lista.length > 0;
    this.marcar();
  }

  criar(key) {
    const el = document.createElement('section');
    el.className = 'monitor';
    el.dataset.key = key;
    el.innerHTML = `<header class="mon-tag">
        <span class="mon-n"></span><i class="mon-cor"></i><span class="mon-nome"></span>
        <form class="nav-aba" hidden autocomplete="off">
          <button type="button" class="nav-btn" data-nav="voltar" title="Voltar">${icon('esq', 15)}</button>
          <button type="button" class="nav-btn" data-nav="avancar" title="Avançar">${icon('dir', 15)}</button>
          <button type="button" class="nav-btn" data-nav="recarregar" title="Recarregar">${icon('fwd', 14)}</button>
          <input name="endereco" placeholder="Endereço ou pesquisa" spellcheck="false" enterkeyhint="go">
        </form>
        <span class="mon-st"></span>
        <button type="button" class="mon-max" title="Ampliar (Alt+Enter)">${icon('maximize', 14)}</button>
      </header>
      <div class="mon-tela"><video playsinline autoplay muted></video><div class="mon-espera">Conectando à tela…</div></div>`;
    const video = el.querySelector('video');
    // a proporção da imagem só é conhecida quando o vídeo chega (e muda se a janela muda)
    video.addEventListener('resize', () => this.organizar());
    return { el, video, dados: null };
  }

  // monitor da vez: recebe o teclado (se aceita controle) e é o que aparece ampliado
  ativar(key) {
    const m = this.monitores.get(key);
    if (!m) return;
    this.ativa = key;
    this.controle.focar(this.controle.tem(m.video) ? m.video : null);
    this.marcar();
  }

  ativarN(i) {
    const key = this.ordem[i];
    if (key) this.ativar(key);
  }

  alternarAmpliar() {
    if (!this.ativa) return;
    this.ampliada = !this.ampliada;
    this.marcar();
  }

  // Atalhos da mesa. O Controle pergunta antes de mandar cada tecla para a tela; true = é da mesa.
  // Sem Ctrl junto: no teclado ABNT2 o AltGr chega como Ctrl+Alt (AltGr+2 é o "²").
  atalho(e, a) {
    if (!this.aberta || e.key === 'Escape') return false;
    if (a === 'down' && e.altKey && !e.ctrlKey && !e.metaKey) {
      if (/^Digit[1-9]$/.test(e.code)) {
        this.ativarN(Number(e.code.slice(5)) - 1);
        return true;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        this.alternarAmpliar();
        return true;
      }
    }
    // nenhuma tela com o teclado: as teclas não passam para a sala (o boneco não anda por trás)
    return !this.controle.ativo;
  }

  // etiquetas, barra de tarefas e quem aparece
  marcar() {
    const teclado = this.controle.teclado;
    for (const [key, m] of this.monitores) {
      const ativa = key === this.ativa;
      const comTeclado = teclado === m.video;
      m.el.classList.toggle('ativa', ativa);
      m.el.classList.toggle('teclado', comTeclado);
      m.el.hidden = this.ampliada && !ativa;
      const st = !m.dados.controle ? esc(m.dados.semControle || 'só ver')
        : comTeclado ? `${icon('teclado', 13)} teclado aqui` : `${icon('cursor', 12)} controle`;
      m.el.querySelector('.mon-st').innerHTML = st;
      const end = m.el.querySelector('.nav-aba').elements.endereco;
      if (m.dados.navega && document.activeElement !== end) {
        end.value = m.dados.site || '';
        end.title = m.dados.titulo || m.dados.site || '';
      }
      const max = m.el.querySelector('.mon-max');
      const desfaz = this.ampliada && ativa;
      max.innerHTML = icon(desfaz ? 'grade' : 'maximize', 14);
      max.title = desfaz ? 'Ver todas (Alt+Enter)' : 'Ampliar (Alt+Enter)';
    }
    this.tarefas.innerHTML = this.ordem.map((key, i) => {
      const m = this.monitores.get(key);
      const d = m.dados;
      const cls = [key === this.ativa ? 'on' : '', d.controle ? 'ctrl' : ''].join(' ');
      return `<button type="button" class="mon-chip ${cls}" data-key="${esc(key)}" title="${esc(`${d.nome} · ${d.onde}${d.titulo ? ` — ${d.titulo}` : ''}`)} (Alt+${i + 1})">
        <span class="mon-n">${i + 1}</span><i class="mon-cor" style="--c:${esc(d.cor)}"></i><span>${esc(d.nome)}</span><small>${esc(d.onde)}</small></button>`;
    }).join('');
    this.btnAmpliar.hidden = !this.ordem.length;
    this.btnAmpliar.innerHTML = `${icon(this.ampliada ? 'grade' : 'maximize', 16)}${this.ampliada ? 'Ver todas' : 'Ampliar'}`;
    this.organizar();
  }

  organizar() {
    if (!this.aberta) return;
    const vis = [...this.monitores.values()].filter((m) => !m.el.hidden);
    if (!vis.length) return;
    // proporção mais comum entre as telas visíveis (16:9 até o vídeo chegar)
    const asp = vis.map((m) => (m.video.videoWidth && m.video.videoHeight ? m.video.videoWidth / m.video.videoHeight : 16 / 9)).sort((a, b) => a - b);
    const aspecto = asp[Math.floor(asp.length / 2)];
    const cs = getComputedStyle(this.area);
    const W = this.area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = this.area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const g = melhorGrade(vis.length, W, H, aspecto);
    this.alturaVideo = Math.floor(g.w / aspecto);
    this.visiveis = vis.length;
    const w = Math.floor(g.w);
    const h = this.alturaVideo + ETIQUETA;
    this.area.style.gridTemplateColumns = `repeat(${g.cols}, ${w}px)`;
    this.area.style.gridAutoRows = `${h}px`;
    this.aoOrganizar?.();
  }

  // Quanto pedir de uma tela a quem compartilha (rtc.js, NIVEIS), pelo tamanho em que o monitor
  // dela aparece agora. Usa o que o organizar mediu (não lê layout).
  nivelDe(key) {
    const m = this.monitores.get(key);
    if (!m) return 'max';
    if (m.el.hidden) return 'off'; // atrás da ampliada: só o som continua
    if (this.visiveis === 1 || !this.alturaVideo) return 'max';
    // em pixels da tela; o 540p nunca estica (560: com folga)
    const px = this.alturaVideo * Math.min(window.devicePixelRatio || 1, 2);
    const nivel = px >= 560 ? 'max' : px >= 200 ? (isTouch ? 'baixo' : 'medio') : 'mini';
    // a tela em que se digita fica nos 60 quadros, mesmo pequena
    return nivel !== 'max' && this.controle.teclado === m.video ? 'medio' : nivel;
  }
}
