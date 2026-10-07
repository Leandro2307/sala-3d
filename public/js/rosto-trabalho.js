// Recorte do rosto da webcam fora da thread do 3D (ver rosto.js, que manda para cá os quadros da
// câmera e recebe de volta o quadrado com o rosto no meio). Worker clássico de propósito: num
// Worker de módulo o carregador do MediaPipe falha ('ModuleFactory not set'), porque ele põe o
// WebAssembly no ar com importScripts.

const LADO = 360; // o quadrado que sai (o rosto do boneco é pequeno: 360 px sobra)
const A_CADA = 8; // procura o rosto a cada 8 quadros (~4 vezes por segundo a 30 qps)
const MARGEM = 1.45; // o quadrado tem 1,45x o tamanho do rosto: o rosto enche a cabeça, com cabelo e queixo
const SEGUIR = 0.12; // quanto o recorte anda até o rosto a cada quadro (suave, sem tremer)
const ESQUECER_MS = 4000; // sem achar o rosto por esse tempo, volta ao meio da imagem

let detector = null; // Promise<FaceDetector | null>: carrega uma vez e serve a cada câmera ligada
function carregarDetector() {
  detector ||= (async () => {
    try {
      importScripts('/vendor/mediapipe/vision_bundle.js'); // o MediaPipe em self.Vision
      const arquivos = await Vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      return await Vision.FaceDetector.createFromOptions(arquivos, {
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

// quadros da câmera -> quadrados com o rosto no meio (um por câmera ligada)
function recortar() {
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

  return new TransformStream({
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
}

// r: os quadros da câmera (MediaStreamTrackProcessor); w: a trilha que sai (MediaStreamTrackGenerator)
onmessage = ({ data: { r, w } }) => {
  r.pipeThrough(recortar()).pipeTo(w).catch(() => { /* câmera desligada */ });
};

// carregou: a página só manda as trilhas depois disto (ver abrirTrabalho no rosto.js)
postMessage('pronto');
