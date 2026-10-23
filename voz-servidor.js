// A voz natural dos gritos da mesa de cartas. O servidor sintetiza cada frase uma vez com a voz
// neural da Microsoft (a mesma do "Ler em voz alta" do Edge — grátis, sem chave, via msedge-tts)
// e serve o mp3 pronto; o cliente toca o arquivo em vez da voz de robô do navegador. As frases são
// um conjunto fechado (GRITOS + ZOEIRA + nomes de trunfo), então o servidor gera tudo na subida e
// emenda pelo cache as que aparecerem depois. A API limita rajada (429) e banimentos por IP são
// temporários: a fila tenta de novo sozinha, com espera crescente, até conseguir — e devolve null
// enquanto isso, para o cliente usar a voz do sistema dele (cartas.js, falarGrito) sem quebrar nada.
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// a dupla de vozes pt-BR, alternando por lugar da mesa: lugares pares gritam com a Francisca,
// ímpares com o Antônio (quem gritou aparece no balão em cima da cadeira)
const VOZES = ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'];

const conexoes = [null, null]; // um websocket por voz
const porId = new Map(); // id (vai na URL) -> { buffer }
const porChave = new Map(); // `${voz}:${frase}` -> id | null (null: áudio vazio)
const fila = []; // sínteses pendentes, uma de cada vez (a API limita: 429 em rajada)
const pendente = new Set(); // chaves já na fila (não repete)
let processando = false;
let espera = 1000; // backoff atual entre tentativas em erro (dobra até 5 min)
let avisou = false; // loga a limitada só uma vez

async function conexao(v) {
  if (!conexoes[v]) {
    const t = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 30000 });
    await t.setMetadata(VOZES[v], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    conexoes[v] = t;
  }
  return conexoes[v];
}

function sintetiza(v, frase) {
  return new Promise((resolve, reject) => {
    conexao(v).then((t) => {
      const { audioStream } = t.toStream(frase);
      const partes = [];
      audioStream.on('data', (d) => partes.push(d));
      audioStream.on('close', () => resolve(Buffer.concat(partes)));
      audioStream.on('error', reject);
    }).catch(reject);
  });
}

// a fila: tira um pedido de cada vez, com respiro entre sínteses. Em erro (a API vive limitando
// rajada em 429 e o banimento por IP é temporário) recoloca na frente e dobra a espera até 5 min,
// tentando para sempre — a voz neural volta sozinha quando o bloqueio cair, sem reiniciar nada
function processaFila() {
  const item = fila.shift();
  if (!item) {
    processando = false;
    return;
  }
  processando = true;
  pendente.delete(item.chave);
  sintetiza(item.voz, item.frase).then((buffer) => {
    espera = 1000;
    if (buffer.length) {
      const id = crypto.createHash('md5').update(item.chave).digest('hex').slice(0, 12);
      porId.set(id, { buffer });
      porChave.set(item.chave, id);
    } else porChave.set(item.chave, null);
    setTimeout(processaFila, 1200); // respiro entre uma síntese e outra
  }).catch((err) => {
    if (!avisou) {
      avisou = true;
      console.warn('  Voz neural limitada pela API (429/rede). Tentando de novo em segundo plano; os gritos usam a voz do sistema até lá. (' + err.message + ')');
    }
    espera = Math.min(300000, espera * 2); // 1s, 2s, 4s... no máximo 5 min entre as rodadas
    pendente.add(item.chave);
    fila.unshift(item);
    setTimeout(processaFila, espera);
  });
}

// a URL do mp3 da frase na voz daquele lugar, se já estiver pronta; senão põe na fila da síntese
// (se ainda não estiver) e devolve null — nesse grito o cliente usa a voz do sistema
function urlDaFrase(frase, lugar) {
  if (typeof frase !== 'string' || !frase.trim()) return null;
  const chave = `${lugar % VOZES.length}:${frase}`;
  if (porChave.has(chave)) {
    const id = porChave.get(chave);
    return id ? `/ct-voz/${id}.mp3` : null;
  }
  if (!pendente.has(chave) && fila.length < 500) {
    pendente.add(chave);
    fila.push({ chave, voz: lugar % VOZES.length, frase });
    if (!processando) processaFila();
  }
  return null;
}

// gera tudo de uma vez na subida (em segundo plano): cada frase nas duas vozes
function esquentar(frases) {
  for (const frase of frases) for (let voz = 0; voz < VOZES.length; voz++) urlDaFrase(frase, voz);
}

// a rota express: /ct-voz/<id>.mp3
function servir(req, res) {
  const item = porId.get(req.params.id);
  if (!item) return res.status(404).end();
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(item.buffer);
}

module.exports = { urlDaFrase, esquentar, servir };
