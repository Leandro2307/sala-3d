// Mostra a tecla do teclado em cima dos avisos de botão do jogo (PS5): quando o GTA põe o △ de "Arrombar"
// ou o ✕ de "Cumprimentar", aparece ali mesmo a tecla que faz aquele botão no mapa de quem joga (F, Espaço…).
// A procura é no avisos-botoes-worker.js; aqui ficam o envio dos quadros e as teclas na tela.
//
// De onde vem o quadro: no modo turbo, do próprio decodificador (turbo.js chama espiar() com cada quadro e
// a gente clona um de vez em quando); no vídeo normal, um VideoFrame tirado do <video>. Um quadro por vez
// no worker, no máximo a cada INTERVALO_MS: a tecla aparece ~0,5 s depois do ícone (2 análises seguidas).
// Com tecla na tela, entre uma análise e outra vai um quadro a cada SEGUIR_MS só para o worker olhar um
// recorte pequeno em volta de cada aviso: a tecla acompanha o ícone quando a câmera mexe (e desliza entre as
// posições, no style.css) sem pesar como a análise inteira.

import { visiveis, nomeEntrada, mapaTeclas } from './mapa-teclas.js';

const INTERVALO_MS = 250; // 150 pesava no PC com placa fraca (ver avisos-botoes-worker.js)
const SEGUIR_MS = 40;
// a cor de cada símbolo, a mesma da legenda do PS5 (✕ azul, ○ vermelho, □ rosa, △ verde)
const COR = { b0: '#93c5fd', b1: '#fca5a5', b2: '#f9a8d4', b3: '#6ee7b7', andar: '#e5e7eb', olhar: '#e5e7eb', b4: '#e5e7eb', b5: '#e5e7eb', b6: '#e5e7eb', b7: '#e5e7eb' };

// O mouse desenhado: o botão que a ação usa aceso (esquerdo, direito ou a rodinha) ou, para o R (mexer a
// câmera), setas do lado para onde mexer (as duas de lado quando o jogo não diz)
const CORPO = '<rect x="7" y="2.5" width="10" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 9.5h9M12 3v6.5" stroke="currentColor" stroke-width="1.5"/>';
const ACESO = {
  MouseLeft: '<path d="M12 3.4a4.2 4.2 0 0 0-4.2 4.2v1.9H12z" fill="var(--cor)"/>',
  MouseRight: '<path d="M12 3.4a4.2 4.2 0 0 1 4.2 4.2v1.9H12z" fill="var(--cor)"/>',
  MouseMiddle: '<rect x="10.6" y="4.6" width="2.8" height="4.2" rx="1.4" fill="var(--cor)"/>',
};
const SETA = {
  esq: 'M4.5 8.5 1.5 11l3 2.5',
  dir: 'M19.5 8.5l3 2.5-3 2.5',
  cima: 'M1.5 12l2.2-3 2.2 3M18.1 12l2.2-3 2.2 3',
  baixo: 'M1.5 10l2.2 3 2.2-3M18.1 10l2.2 3 2.2-3',
};
SETA.lados = SETA.esq + SETA.dir;
const seta = (d) => `<path d="${d}" fill="none" stroke="var(--cor)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const mouse = (dentro, setas = null) => `<svg viewBox="${setas ? '0 0 24' : '4 0 16'} 22" aria-hidden="true">${CORPO}${dentro}${setas ? seta(SETA[setas]) : ''}</svg>`;
// a barra de espaço desenhada (a palavra "Espaço" não cabe no lugar do ícone e cobria o texto do jogo)
const ESPACO = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M3 9v6h18V9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// nomes curtos: no lugar do ícone cabem 1 a 4 letras
const CURTO = { ShiftLeft: '⇧', ShiftRight: '⇧', Enter: '↵', Tab: '⇥', Backspace: '⌫', CapsLock: 'Caps', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'AltGr' };
// o analógico esquerdo empurrado para um lado: a tecla daquela direção (W, A, S, D no padrão)
const ANDAR = { cima: 'ly-', baixo: 'ly+', esq: 'lx-', dir: 'lx+' };

// O par L + R lado a lado (GTA 6: dois arcos, o do L aberto para a direita e o do R para a esquerda): é sempre
// empurrar o analógico esquerdo para a direita (D) e puxar o direito para a esquerda (o mouse para a esquerda),
// pedido do usuário em 2026-11-28 (a direção lida do L saía "A"). Em cima dos dois vai um card com o mouse
// sendo arrastado para a esquerda.
// Visto o par, ele fica pelo menos PAR_MS (pedido do usuário: um dos dois às vezes não era achado e o card
// piscava): enquanto um dos dois continua na tela o par continua, e sem nenhum ele fica mais PAR_MS; o que
// faltar fica no último lugar visto.
const PAR_MS = 3000;
const CARD_PAR = `<span class="par-mouse">${mouse('', 'esq')}</span><b>Arraste o mouse para a esquerda</b><small>e segure D</small>`;
function parLR(lista) {
  const l = lista.find((a) => a.id === 'andar'), r = lista.find((a) => a.id === 'olhar');
  if (!l || !r || r.x <= l.x) return null;
  const raio = Math.max(l.r, r.r);
  return Math.abs(l.y - r.y) < raio * 1.5 && r.x - l.x < raio * 12 ? { l, r } : null;
}

const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// o rótulo de uma entrada (tecla ou botão do mouse)
function daEntrada(e) {
  if (ACESO[e]) return { html: mouse(ACESO[e]), texto: e, icone: true };
  if (e === 'Space') return { html: ESPACO, texto: e, icone: true };
  const t = CURTO[e] || nomeEntrada(e);
  return { html: esc(t), texto: t, letras: [...t].length };
}
// o que aparece no lugar do ícone: { html, texto (para comparar), icone | letras } ou null (sem tecla)
// noCarro: no modo carro o L2 e o R2 são as teclas do carro (S freia, W acelera no padrão)
function rotuloDe(id, dir, noCarro = false) {
  if (id === 'olhar') return { html: mouse('', dir || 'lados'), texto: `mouse ${dir || ''}`, icone: true };
  if (id === 'andar') {
    const e = dir && visiveis(ANDAR[dir])[0];
    return e ? daEntrada(e) : { html: 'WASD', texto: 'WASD', letras: 4 };
  }
  const doCarro = noCarro ? mapaTeclas.entradasCarro(id)[0] : null;
  const e = doCarro || visiveis(id).find((x) => !/^Roda/.test(x));
  return e ? daEntrada(e) : null;
}

export class AvisosBotoes {
  // camada: a div por cima da imagem; video: o <video> da tela; telaTurbo(): o canvas do turbo à vista (ou null)
  // querCarro(): procurar também o quadro do carro; onCarro(): ele apareceu (visto em 2 análises seguidas)
  // noCarro(): as teclas do carro valem agora (o L2 e o R2 mostram as do carro)
  // querHud(): procurar também o HUD do canto de cima à direita; onArma(geo|null): mudou (geo: hudCanto)
  // querCanto(): procurar texto do jogo no canto de baixo à direita; onTexto(sim): mudou (2 análises para entrar, 4 para sair)
  constructor({ camada, video, telaTurbo, querCarro = () => false, onCarro = () => {}, noCarro = () => false, querHud = () => false, onArma = () => {}, querCanto = () => false, onTexto = () => {} }) {
    this.camada = camada;
    this.querCanto = querCanto;
    this.onTexto = onTexto;
    this.texto = false;
    this.textoSim = 0;
    this.textoNao = 0;
    this.querHud = querHud;
    this.onArma = onArma;
    this.arma = null; // a munição à vista agora (com folga: 2 análises para entrar, 3 para sair)
    this.armaSim = 0;
    this.armaNao = 0;
    this.noCarro = noCarro;
    this.querCarro = querCarro;
    this.onCarro = onCarro;
    this.vistoCarro = 0;
    this.video = video;
    this.telaTurbo = telaTurbo;
    this.ligado = false;
    this.worker = null;
    this.ocupado = false;
    this.enviadoEm = 0;
    this.completaEm = 0;
    this.seq = 0;
    this.avisos = [];
    this.falhou = false;
    this.msAnalise = 0;
  }

  ligar(sim) {
    sim = !!sim && !this.falhou;
    if (sim === this.ligado) return;
    this.ligado = sim;
    if (sim) {
      this.relogio = setInterval(() => this.doVideo(), SEGUIR_MS);
    } else {
      clearInterval(this.relogio);
      this.worker?.postMessage({ limpar: true });
      this.parVisto = null;
      if (this.arma) { this.arma = null; this.onArma(null); }
      this.armaSim = this.armaNao = 0;
      if (this.texto) { this.texto = false; this.onTexto(false); }
      this.textoSim = this.textoNao = 0;
      this.mostrar([]);
    }
  }

  abrirWorker() {
    if (this.worker || this.falhou) return this.worker;
    try {
      this.worker = new Worker(new URL('./avisos-botoes-worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      console.warn('[avisos] sem worker', err);
      this.falhou = true;
      this.ligar(false);
      return null;
    }
    this.worker.onmessage = ({ data }) => {
      this.ocupado = false;
      if (data.erro) return void console.warn('[avisos]', data.erro);
      if (!this.ligado) return;
      this.mostrar(data.avisos);
      if (data.seguir) return;
      this.msAnalise = data.ms;
      this.vistoCarro = data.carro ? this.vistoCarro + 1 : 0;
      if (this.vistoCarro === 2) this.onCarro();
      if (data.hud) this.viuArma(data.arma);
      if (data.canto) this.viuTexto(data.texto);
    };
    this.worker.onerror = (e) => {
      console.warn('[avisos] o worker caiu', e.message);
      this.ocupado = false;
      this.falhou = true;
      this.ligar(false);
    };
    return this.worker;
  }

  viuTexto(sim) {
    if (sim) { this.textoNao = 0; this.textoSim++; } else { this.textoSim = 0; this.textoNao++; }
    const agora = this.texto ? this.textoNao < 4 : this.textoSim >= 2;
    if (agora !== this.texto) { this.texto = agora; this.onTexto(agora); }
  }

  viuArma(geo) {
    if (geo) {
      this.armaNao = 0;
      if (++this.armaSim < 2) return;
      const mudou = !this.arma || this.arma.arma !== geo.arma; // só importa qual dos 3 lugares (jogar.js posHudModo)
      this.arma = geo;
      if (mudou) this.onArma(geo);
    } else {
      this.armaSim = 0;
      if (!this.arma || ++this.armaNao < 3) return;
      this.arma = null;
      this.onArma(null);
    }
  }

  // é hora de mandar outro quadro? 'tudo' (a análise inteira), 'seguir' (só os recortes dos avisos) ou null
  quer() {
    if (!this.ligado || this.ocupado) return null;
    const agora = performance.now();
    if (agora - this.completaEm >= INTERVALO_MS) return 'tudo';
    return this.avisos.length && agora - this.enviadoEm >= SEGUIR_MS ? 'seguir' : null;
  }

  enviar(quadro, tipo) {
    const w = this.abrirWorker();
    if (!w) return void quadro.close?.();
    this.ocupado = true;
    this.enviadoEm = performance.now();
    if (tipo === 'seguir') return void w.postMessage({ id: ++this.seq, quadro, seguir: true }, [quadro]);
    this.completaEm = this.enviadoEm;
    w.postMessage({ id: ++this.seq, quadro, carro: !!this.querCarro(), hud: !!this.querHud(), canto: !!this.querCanto() }, [quadro]);
  }

  // o turbo.js chama com cada quadro desenhado (que ele fecha logo depois: aqui vai uma cópia)
  espiar(frame) {
    const tipo = this.quer();
    if (!tipo) return;
    try {
      this.enviar(frame.clone(), tipo);
    } catch {
      this.ocupado = false;
    }
  }

  // sem o turbo à vista, o quadro vem do <video>
  doVideo() {
    if (this.ocupado && performance.now() - this.enviadoEm > 2000) this.ocupado = false; // resposta perdida
    const tipo = this.telaTurbo() ? null : this.quer();
    if (!tipo) return;
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    try {
      this.enviar(new VideoFrame(v), tipo);
    } catch {
      this.ocupado = true;
      this.enviadoEm = performance.now();
      createImageBitmap(v).then((b) => { this.ocupado = false; if (this.ligado) this.enviar(b, tipo); else b.close(); }, () => { this.ocupado = false; });
    }
  }

  // onde a imagem do jogo está dentro da camada (object-fit do vídeo, que a tela do turbo copia)
  areaDaImagem() {
    const el = this.telaTurbo() || this.video;
    const iw = el.videoWidth || el.width, ih = el.videoHeight || el.height;
    if (!iw || !ih) return null;
    const r = el.getBoundingClientRect(), c = this.camada.getBoundingClientRect(), cs = getComputedStyle(el);
    const px = (k) => parseFloat(cs[k]) || 0;
    const x = r.left + px('borderLeftWidth') + px('paddingLeft'), y = r.top + px('borderTopWidth') + px('paddingTop');
    const w = r.right - px('borderRightWidth') - px('paddingRight') - x, h = r.bottom - px('borderBottomWidth') - px('paddingBottom') - y;
    const fit = cs.objectFit;
    if (fit === 'fill') return { x: x - c.left, y: y - c.top, w, h };
    const k = (fit === 'cover' ? Math.max : Math.min)(w / iw, h / ih);
    return { x: x - c.left + (w - iw * k) / 2, y: y - c.top + (h - ih * k) / 2, w: iw * k, h: ih * k };
  }

  mostrar(lista) {
    let par = parLR(lista);
    const agora = performance.now();
    if (par) this.parVisto = { l: { ...par.l }, r: { ...par.r }, em: agora };
    else if (this.parVisto && agora - this.parVisto.em < PAR_MS) {
      const pv = this.parVisto, perto = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < b.r * 4;
      const l = lista.find((a) => a.id === 'andar' && perto(a, pv.l)), r = lista.find((a) => a.id === 'olhar' && perto(a, pv.r));
      // o que está na tela leva o outro junto (a câmera mexeu); o que falta fica onde estava
      if (l) pv.r = { ...pv.r, x: pv.r.x + l.x - pv.l.x, y: pv.r.y + l.y - pv.l.y };
      else if (r) pv.l = { ...pv.l, x: pv.l.x + r.x - pv.r.x, y: pv.l.y + r.y - pv.r.y };
      if (l || r) pv.em = agora; // um dos dois ainda na tela: continua
      if (l) pv.l = { ...pv.l, x: l.x, y: l.y };
      if (r) pv.r = { ...pv.r, x: r.x, y: r.y };
      par = { l: l || pv.l, r: r || pv.r };
      lista = [...lista.filter((a) => a !== l && a !== r && a.id !== 'andar' && a.id !== 'olhar'), par.l, par.r];
    } else this.parVisto = null;
    if (par) lista = lista.map((a) => (a === par.l ? { ...a, dir: 'dir' } : a === par.r ? { ...a, dir: 'esq' } : a));
    const rotulos = {};
    const carro = !!this.noCarro();
    const chave = (av) => `${av.id} ${av.dir || ''}`;
    for (const av of lista) if (!(chave(av) in rotulos)) rotulos[chave(av)] = rotuloDe(av.id, av.dir, carro);
    const avisos = lista.filter((av) => rotulos[chave(av)]); // botão sem tecla: nada a mostrar
    this.avisos = avisos;
    const cam = this.camada;
    if (!avisos.length) {
      if (cam.childElementCount) cam.replaceChildren();
      cam.hidden = true;
      return;
    }
    const a = this.areaDaImagem();
    if (!a) return;
    cam.hidden = false;
    this.mostrarCard(par, a);
    // reaproveita as que já estão (só mexe na posição): não pisca a cada análise
    const velhas = [...cam.querySelectorAll(':scope > kbd')];
    avisos.forEach((av, i) => {
      const r = rotulos[chave(av)];
      let el = velhas[i];
      if (!el) {
        el = document.createElement('kbd');
        cam.append(el);
      }
      if (el.dataset.t !== r.texto) {
        el.dataset.t = r.texto;
        el.innerHTML = r.html;
      }
      // do tamanho do ícone do jogo (um pouco maior): não cobre o texto do lado. Nome comprido diminui a letra
      const d = Math.max(24, av.r * 2 * a.h * 1.12);
      const fonte = r.letras > 1 ? Math.min(d * 0.46, (d * 1.15) / (r.letras * 0.62)) : d * 0.5;
      el.style.cssText = `left:${a.x + av.x * a.w}px;top:${a.y + av.y * a.h}px;width:${d}px;height:${d}px;font-size:${Math.max(9, fonte)}px;--cor:${COR[av.id] || '#fff'}`;
      el.classList.toggle('icone', !!r.icone);
    });
    for (const el of velhas.slice(avisos.length)) el.remove();
  }

  // o card do par L + R (parLR): centrado em cima dos dois ícones
  mostrarCard(par, a) {
    if (!par) return void this.card?.remove();
    if (!this.card) {
      this.card = document.createElement('div');
      this.card.className = 'aviso-card';
      this.card.innerHTML = CARD_PAR;
    }
    if (!this.card.isConnected) this.camada.append(this.card);
    const x = a.x + ((par.l.x + par.r.x) / 2) * a.w;
    const y = a.y + (Math.min(par.l.y, par.r.y) - Math.max(par.l.r, par.r.r) * 1.6) * a.h;
    this.card.style.left = `${x}px`;
    this.card.style.top = `${y}px`;
  }
}
