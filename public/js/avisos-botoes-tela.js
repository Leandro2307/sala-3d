// Mostra a tecla do teclado em cima dos avisos de botão do jogo (PS5): quando o GTA põe o △ de "Arrombar"
// ou o ✕ de "Cumprimentar", aparece ali mesmo a tecla que faz aquele botão no mapa de quem joga (F, Espaço…).
// A procura é no avisos-botoes-worker.js; aqui ficam o envio dos quadros e as teclas na tela.
//
// De onde vem o quadro: no modo turbo, do próprio decodificador (turbo.js chama espiar() com cada quadro e
// a gente clona um de vez em quando); no vídeo normal, um VideoFrame tirado do <video>. Um quadro por vez
// no worker, no máximo a cada INTERVALO_MS: a tecla aparece ~0,3 s depois do ícone (2 análises seguidas).

import { visiveis, nomeEntrada } from './mapa-teclas.js';

const INTERVALO_MS = 150;
// a cor de cada símbolo, a mesma da legenda do PS5 (✕ azul, ○ vermelho, □ rosa, △ verde)
const COR = { b0: '#93c5fd', b1: '#fca5a5', b2: '#f9a8d4', b3: '#6ee7b7', andar: '#e5e7eb', olhar: '#e5e7eb' };

// O mouse desenhado: o botão que a ação usa aceso (esquerdo, direito ou a rodinha) ou, para o R (mexer a
// câmera), as setas dos lados
const CORPO = '<rect x="7" y="2.5" width="10" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 9.5h9M12 3v6.5" stroke="currentColor" stroke-width="1.5"/>';
const ACESO = {
  MouseLeft: '<path d="M12 3.4a4.2 4.2 0 0 0-4.2 4.2v1.9H12z" fill="var(--cor)"/>',
  MouseRight: '<path d="M12 3.4a4.2 4.2 0 0 1 4.2 4.2v1.9H12z" fill="var(--cor)"/>',
  MouseMiddle: '<rect x="10.6" y="4.6" width="2.8" height="4.2" rx="1.4" fill="var(--cor)"/>',
};
const SETAS = '<path d="M4.5 8.5 1.5 11l3 2.5M19.5 8.5l3 2.5-3 2.5" fill="none" stroke="var(--cor)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
const mouse = (dentro, setas = false) => `<svg viewBox="${setas ? '0' : '4'} 0 ${setas ? 24 : 16} 22" aria-hidden="true">${CORPO}${dentro}${setas ? SETAS : ''}</svg>`;

// o que aparece no lugar do ícone: { html, texto (para comparar), longa } ou null (o botão não tem tecla)
function rotuloDe(id) {
  if (id === 'olhar') return { html: mouse('', true), texto: 'mouse', icone: true };
  if (id === 'andar') return { html: 'WASD', texto: 'WASD', longa: true };
  const e = visiveis(id).find((x) => !/^Roda/.test(x));
  if (!e) return null;
  if (ACESO[e]) return { html: mouse(ACESO[e]), texto: e, icone: true };
  const t = nomeEntrada(e);
  return { html: t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])), texto: t, longa: t.length > 2 };
}

export class AvisosBotoes {
  // camada: a div por cima da imagem; video: o <video> da tela; telaTurbo(): o canvas do turbo à vista (ou null)
  constructor({ camada, video, telaTurbo }) {
    this.camada = camada;
    this.video = video;
    this.telaTurbo = telaTurbo;
    this.ligado = false;
    this.worker = null;
    this.ocupado = false;
    this.enviadoEm = 0;
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
      this.relogio = setInterval(() => this.doVideo(), INTERVALO_MS);
    } else {
      clearInterval(this.relogio);
      this.worker?.postMessage({ limpar: true });
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
      this.msAnalise = data.ms;
      if (this.ligado) this.mostrar(data.avisos);
    };
    this.worker.onerror = (e) => {
      console.warn('[avisos] o worker caiu', e.message);
      this.ocupado = false;
      this.falhou = true;
      this.ligar(false);
    };
    return this.worker;
  }

  // é hora de mandar outro quadro?
  quer() {
    return this.ligado && !this.ocupado && performance.now() - this.enviadoEm >= INTERVALO_MS;
  }

  enviar(quadro) {
    const w = this.abrirWorker();
    if (!w) return void quadro.close?.();
    this.ocupado = true;
    this.enviadoEm = performance.now();
    w.postMessage({ id: ++this.seq, quadro }, [quadro]);
  }

  // o turbo.js chama com cada quadro desenhado (que ele fecha logo depois: aqui vai uma cópia)
  espiar(frame) {
    if (!this.quer()) return;
    try {
      this.enviar(frame.clone());
    } catch {
      this.ocupado = false;
    }
  }

  // sem o turbo à vista, o quadro vem do <video>
  doVideo() {
    if (this.ocupado && performance.now() - this.enviadoEm > 2000) this.ocupado = false; // resposta perdida
    if (this.telaTurbo() || !this.quer()) return;
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    try {
      this.enviar(new VideoFrame(v));
    } catch {
      this.ocupado = true;
      this.enviadoEm = performance.now();
      createImageBitmap(v).then((b) => { this.ocupado = false; if (this.ligado) this.enviar(b); else b.close(); }, () => { this.ocupado = false; });
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
    const rotulos = {};
    for (const av of lista) if (!(av.id in rotulos)) rotulos[av.id] = rotuloDe(av.id);
    const avisos = lista.filter((av) => rotulos[av.id]); // botão sem tecla: nada a mostrar
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
    // reaproveita as que já estão (só mexe na posição): não pisca a cada análise
    const velhas = [...cam.children];
    avisos.forEach((av, i) => {
      const r = rotulos[av.id];
      let el = velhas[i];
      if (!el) {
        el = document.createElement('kbd');
        cam.append(el);
      }
      if (el.dataset.t !== r.texto) {
        el.dataset.t = r.texto;
        el.innerHTML = r.html;
      }
      const d = Math.max(26, av.r * 2 * a.h * 1.1);
      el.style.cssText = `left:${a.x + av.x * a.w}px;top:${a.y + av.y * a.h}px;height:${d}px;min-width:${d}px;font-size:${Math.max(12, d * 0.42)}px;--cor:${COR[av.id] || '#fff'}`;
      el.classList.toggle('longa', !!r.longa);
      el.classList.toggle('icone', !!r.icone);
    });
    for (const el of velhas.slice(avisos.length)) el.remove();
  }
}
