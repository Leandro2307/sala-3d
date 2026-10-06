// Recorte do rosto na webcam: acha o rosto (MediaPipe, modelo BlazeFace de 230 KB rodando no
// processador) e manda só um quadrado em volta dele, já aproximado. Sem isso a câmera inteira
// ia para o rosto do boneco e a pessoa aparecia pequena, com a cadeira e a sala em volta.
//
// Trabalha direto nos quadros da trilha (MediaStreamTrackProcessor -> canvas -> gerador), sem
// <video> nem requestAnimationFrame: continua saindo com a aba da sala escondida, quando a
// pessoa está em outra aba. Navegador sem isso (Firefox, Safari): vai a câmera inteira.

const LADO = 360; // o quadrado que sai (o rosto do boneco é pequeno: 360 px sobra)
const A_CADA = 4; // procura o rosto a cada 4 quadros (~7 vezes por segundo a 30 qps)
const MARGEM = 1.45; // o quadrado tem 1,45x o tamanho do rosto: o rosto enche a cabeça, com cabelo e queixo
const SEGUIR = 0.12; // quanto o recorte anda até o rosto a cada quadro (suave, sem tremer)
const ESQUECER_MS = 4000; // sem achar o rosto por esse tempo, volta ao meio da imagem

let detector = null; // Promise<FaceDetector | null>
function carregarDetector() {
  detector ||= (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import('/vendor/mediapipe/vision_bundle.mjs');
      const arquivos = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      return await FaceDetector.createFromOptions(arquivos, {
        // no processador: o modelo é minúsculo, e a placa de vídeo fica com o 3D
        baseOptions: { modelAssetPath: '/models/rosto/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
    } catch (err) {
      console.warn('[rosto] sem detector de rosto, a câmera vai só aproximada', err);
      return null;
    }
  })();
  return detector;
}

export const podeRecortar = () => typeof MediaStreamTrackProcessor === 'function'
  && typeof MediaStreamTrackGenerator === 'function' && typeof OffscreenCanvas === 'function';

// Trilha nova, quadrada, com o rosto no meio. A original continua sendo a fonte dos quadros:
// quem chama para as duas.
export function recortarRosto(original) {
  const processador = new MediaStreamTrackProcessor({ track: original });
  const gerador = new MediaStreamTrackGenerator({ kind: 'video' });
  const saida = new OffscreenCanvas(LADO, LADO);
  const ctx = saida.getContext('2d', { alpha: false });
  const mini = new OffscreenCanvas(256, 256); // a busca roda numa cópia pequena (mais rápido)
  const mctx = mini.getContext('2d', { alpha: false });
  let det = null;
  carregarDetector().then((d) => { det = d; });

  let n = 0;
  let alvo = null; // onde o rosto foi visto por último: { cx, cy, lado } em pixels do quadro
  let visto = 0;
  let atual = null; // o recorte de agora, andando até o alvo

  const procurar = (quadro, w, h) => {
    const esc = 256 / Math.max(w, h);
    const mw = Math.round(w * esc);
    const mh = Math.round(h * esc);
    if (mini.width !== mw || mini.height !== mh) {
      mini.width = mw;
      mini.height = mh;
    }
    mctx.drawImage(quadro, 0, 0, mw, mh);
    let rostos;
    try {
      rostos = det.detectForVideo(mini, performance.now()).detections;
    } catch {
      return;
    }
    // o maior rosto é o de quem está na frente da câmera
    let b = null;
    for (const d of rostos) if (!b || d.boundingBox.width > b.width) b = d.boundingBox;
    if (!b) return;
    const bw = b.width / esc;
    const bh = b.height / esc;
    // a caixa do detector vai das sobrancelhas ao queixo: sobe um pouco para o cabelo entrar
    const novo = { cx: (b.originX + b.width / 2) / esc, cy: (b.originY + b.height / 2) / esc - bh * 0.12, lado: Math.max(bw, bh) * MARGEM };
    // mexidinhas não mudam o alvo: o recorte fica parado em vez de tremer junto com a detecção
    const parecido = alvo && Math.abs(novo.cx - alvo.cx) < alvo.lado * 0.05
      && Math.abs(novo.cy - alvo.cy) < alvo.lado * 0.05 && Math.abs(novo.lado - alvo.lado) < alvo.lado * 0.1;
    if (!parecido) alvo = novo;
    visto = performance.now();
  };

  const transformar = new TransformStream({
    transform(quadro, fila) {
      const w = quadro.displayWidth;
      const h = quadro.displayHeight;
      if (det && n++ % A_CADA === 0) procurar(quadro, w, h);
      // sem rosto (ainda carregando, ou a pessoa saiu): aproxima o meio, onde ela costuma estar
      const quer = alvo && performance.now() - visto < ESQUECER_MS
        ? alvo
        : { cx: w / 2, cy: h * 0.45, lado: Math.min(w, h) * 0.72 };
      if (!atual) atual = { ...quer };
      atual.cx += (quer.cx - atual.cx) * SEGUIR;
      atual.cy += (quer.cy - atual.cy) * SEGUIR;
      atual.lado += (quer.lado - atual.lado) * SEGUIR;
      const lado = Math.min(atual.lado, w, h);
      const sx = Math.min(Math.max(atual.cx - lado / 2, 0), w - lado);
      const sy = Math.min(Math.max(atual.cy - lado / 2, 0), h - lado);
      ctx.drawImage(quadro, sx, sy, lado, lado, 0, 0, LADO, LADO);
      const novo = new VideoFrame(saida, { timestamp: quadro.timestamp });
      quadro.close();
      fila.enqueue(novo);
    },
  });
  processador.readable.pipeThrough(transformar).pipeTo(gerador.writable).catch(() => { /* câmera desligada */ });
  gerador.contentHint = 'motion';
  return gerador;
}
