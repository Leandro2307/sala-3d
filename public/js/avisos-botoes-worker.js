// O worker dos avisos de botão (avisos-botoes.js): recebe um quadro do jogo (VideoFrame ou ImageBitmap),
// reduz para no máximo 960 de largura (os ícones ficam com ~17 px) e procura os ícones; devolve os que estão
// firmes na tela (e, se pedido, se o quadro do carro está lá e onde está a munição). Fora da página para não pesar no jogo.
//
// Leve de propósito (2026-11-27: com 1280 e um quadro a cada 150 ms, o PC com Intel UHD passou de ~3% para
// 13–33% de amostras travadas): a redução é na placa (canvas sem willReadFrequently) e só a imagem pequena
// volta para a memória; o quadro do decodificador fecha logo depois de desenhado (segurá-lo durante a busca
// tirava quadro do decodificador).

import { detectar, veiculo, hudCanto, textoNoCanto, Rastreio } from './avisos-botoes.js';

const LARGURA = 960;
let tela = null, ctx = null;
const rastreio = new Rastreio();

// Entre uma análise e outra (a cada ~40 ms, enquanto há aviso na tela): para cada aviso, só um recorte de
// ~8 raios em volta dele, na mesma escala da análise, procurado de novo; o mesmo símbolo achado mais perto
// leva o aviso para lá. Recorte pequeno: pouco para desenhar e trazer da placa.
let telaR = null, ctxR = null;
function seguir(q, k, w, h) {
  for (const it of rastreio.visiveis()) {
    const cx = it.x * w, cy = it.y * h, meio = Math.max(20, Math.round(it.r * h * 4));
    const x0 = Math.max(0, Math.round(cx - meio)), y0 = Math.max(0, Math.round(cy - meio));
    const lw = Math.min(w, Math.round(cx + meio)) - x0, lh = Math.min(h, Math.round(cy + meio)) - y0;
    if (lw < 12 || lh < 12) continue;
    if (!telaR || telaR.width < lw || telaR.height < lh) {
      telaR = new OffscreenCanvas(Math.max(lw, telaR?.width || 0), Math.max(lh, telaR?.height || 0));
      ctxR = telaR.getContext('2d', { alpha: false });
    }
    ctxR.drawImage(q, x0 / k, y0 / k, lw / k, lh / k, 0, 0, lw, lh);
    const achados = detectar(ctxR.getImageData(0, 0, lw, lh));
    let par = null, dist = Infinity;
    for (const a of achados) {
      if (a.simbolo !== it.simbolo) continue;
      const d = Math.hypot(x0 + a.x * lw - cx, y0 + a.y * lh - cy);
      if (d < dist) { par = a; dist = d; }
    }
    if (par) rastreio.mover(it, (x0 + par.x * lw) / w, (y0 + par.y * lh) / h);
  }
}

self.onmessage = ({ data }) => {
  if (data.limpar) {
    rastreio.limpar();
    return;
  }
  const q = data.quadro;
  try {
    const w0 = q.displayWidth || q.width, h0 = q.displayHeight || q.height;
    if (!w0 || !h0) return;
    const k = Math.min(1, LARGURA / w0);
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    if (!tela || tela.width !== w || tela.height !== h) {
      tela = new OffscreenCanvas(w, h);
      ctx = tela.getContext('2d', { alpha: false });
    }
    if (data.seguir) {
      // só os recortes em volta dos avisos já na tela (o ícone acompanha a câmera sem a análise inteira)
      const t = performance.now();
      seguir(q, k, w, h);
      q.close?.();
      self.postMessage({ id: data.id, avisos: rastreio.visiveis(), seguir: true, ms: performance.now() - t });
      return;
    }
    ctx.drawImage(q, 0, 0, w, h);
    q.close?.();
    const t = performance.now();
    const img = ctx.getImageData(0, 0, w, h);
    const achados = detectar(img);
    // dentro do carro? (o quadro do motor e da gasolina em cima do minimapa)
    const carro = data.carro ? veiculo(img) : false;
    // a estrela e a munição no canto de cima à direita (onde pôr o quadro "a pé / no carro")
    const arma = data.hud ? hudCanto(img) : null;
    // texto do jogo no canto de baixo à direita (as dicas e o "a pé" da /jogar saem da frente)
    const texto = data.canto ? textoNoCanto(img) : false;
    self.postMessage({ id: data.id, avisos: rastreio.passo(achados), carro, arma, hud: !!data.hud, texto, canto: !!data.canto, ms: performance.now() - t });
  } catch (err) {
    self.postMessage({ id: data.id, erro: String(err?.message || err) });
  } finally {
    q.close?.();
  }
};
