// A voz natural dos gritos da mesa de cartas. O servidor sintetiza cada frase uma vez com a voz
// neural da Microsoft (a mesma do "Ler em voz alta" do Edge — grátis, sem chave, via msedge-tts)
// e serve o mp3 pronto; o cliente toca o arquivo em vez da voz de robô do navegador. As frases são
// um conjunto fechado (GRITOS + ZOEIRA + nomes de trunfo), então o servidor gera tudo na subida e
// emenda pelo cache as que aparecerem depois. Sem rede (ou com a síntese fora do ar), urlDaFrase
// devolve null e o cliente volta para a voz do sistema dele (cartas.js, falarGrito).
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// a dupla de vozes pt-BR, alternando por lugar da mesa: lugares pares gritam com a Francisca,
// ímpares com o Antônio (quem gritou aparece no balão em cima da cadeira)
const VOZES = ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'];

const conexoes = [null, null]; // um websocket por voz
const porId = new Map(); // id (vai na URL) -> { buffer }
const porChave = new Map(); // `${voz}:${frase}` -> id | null (null: falhou, não tenta de novo)
const fila = []; // sínteses pendentes, uma de cada vez (a rede agradece)
let processando = false;
let foraDoAr = false; // uma falha de conexão: para de tentar, a voz do sistema assume

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

// a fila: tira um pedido de cada vez e grava no cache (a próxima vez a URL já sai na hora)
async function processaFila() {
  const item = fila.shift();
  if (!item) {
    processando = false;
    return;
  }
  processando = true;
  try {
    const buffer = await sintetiza(item.voz, item.frase);
    if (buffer.length) {
      const id = crypto.createHash('md5').update(item.chave).digest('hex').slice(0, 12);
      porId.set(id, { buffer });
      porChave.set(item.chave, id);
    } else porChave.set(item.chave, null);
  } catch (err) {
    if (!foraDoAr) {
      foraDoAr = true; // desiste da TTS nesta sessão: a voz do sistema dos clientes assume
      console.warn('  Voz neural fora do ar (sem rede ou API mudou):', err.message);
    }
    porChave.set(item.chave, null);
  }
  processaFila();
}

// a URL do mp3 da frase na voz daquele lugar, se já estiver pronta; senão enfileira a síntese
// (para a próxima vez) e devolve null — nesse grito o cliente usa a voz do sistema
function urlDaFrase(frase, lugar) {
  if (foraDoAr || typeof frase !== 'string' || !frase.trim()) return null;
  const chave = `${lugar % VOZES.length}:${frase}`;
  if (porChave.has(chave)) {
    const id = porChave.get(chave);
    return id ? `/ct-voz/${id}.mp3` : null;
  }
  fila.push({ chave, voz: lugar % VOZES.length, frase });
  if (!processando) processaFila();
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
