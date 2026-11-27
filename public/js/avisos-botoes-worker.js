// O worker dos avisos de botão (avisos-botoes.js): recebe um quadro do jogo (VideoFrame ou ImageBitmap),
// reduz para no máximo 960 de largura (os ícones ficam com ~17 px) e procura os ícones; devolve os que estão
// firmes na tela (e, se pedido, se o quadro do carro está lá). Fora da página para não pesar no jogo.
//
// Leve de propósito (2026-11-27: com 1280 e um quadro a cada 150 ms, o PC com Intel UHD passou de ~3% para
// 13–33% de amostras travadas): a redução é na placa (canvas sem willReadFrequently) e só a imagem pequena
// volta para a memória; o quadro do decodificador fecha logo depois de desenhado (segurá-lo durante a busca
// tirava quadro do decodificador).

import { detectar, veiculo, Rastreio } from './avisos-botoes.js';

const LARGURA = 960;
let tela = null, ctx = null;
const rastreio = new Rastreio();

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
    ctx.drawImage(q, 0, 0, w, h);
    q.close?.();
    const t = performance.now();
    const img = ctx.getImageData(0, 0, w, h);
    const achados = detectar(img);
    // dentro do carro? (o quadro do motor e da gasolina em cima do minimapa)
    const carro = data.carro ? veiculo(img) : false;
    self.postMessage({ id: data.id, avisos: rastreio.passo(achados), carro, ms: performance.now() - t });
  } catch (err) {
    self.postMessage({ id: data.id, erro: String(err?.message || err) });
  } finally {
    q.close?.();
  }
};
