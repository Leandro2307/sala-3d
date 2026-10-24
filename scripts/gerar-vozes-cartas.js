// Generates the checked-in, static MP3 assets for card-game bot phrases.
// Run: node scripts/gerar-vozes-cartas.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const destino = path.join(__dirname, '..', 'public', 'audio', 'cartas');
const vozes = ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'];
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nome = (frase, voz) => `${voz}-${crypto.createHash('sha1').update(`${voz}:${frase}`).digest('hex').slice(0, 16)}.mp3`;

async function gerar(t, frase, arquivo) {
  const { audioStream } = t.toStream(frase);
  const partes = [];
  await new Promise((resolve, reject) => {
    audioStream.on('data', (parte) => partes.push(parte));
    audioStream.once('close', resolve);
    audioStream.once('error', reject);
  });
  const audio = Buffer.concat(partes);
  if (!audio.length) throw new Error('TTS returned an empty file');
  fs.writeFileSync(arquivo, audio);
}

async function main() {
  const regras = await import('../public/js/cartas-regras.js');
  const frases = new Set([...Object.values(regras.GRITOS).flat(), ...regras.ZOEIRA]);
  for (const trunfo of Object.values(regras.TRUNFOS_21)) frases.add(`${trunfo.nome}!`);
  fs.mkdirSync(destino, { recursive: true });
  const forcar = process.argv.includes('--forcar');
  let feitas = 0;
  for (let voz = 0; voz < vozes.length; voz++) {
    const t = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 30000 });
    await t.setMetadata(vozes[voz], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    for (const frase of frases) {
      const arquivo = path.join(destino, nome(frase, voz));
      if (!forcar && fs.existsSync(arquivo) && fs.statSync(arquivo).size > 0) { feitas++; continue; }
      process.stdout.write(`[${feitas + 1}/${frases.size * vozes.length}] ${vozes[voz]}: ${frase}\n`);
      await gerar(t, frase, arquivo);
      feitas++;
      await pausa(1200); // stay below the public Edge endpoint burst limit
    }
  }
  console.log(`Generated ${feitas} static bot-voice files in ${destino}`);
}

main().catch((erro) => { console.error(erro); process.exitCode = 1; });
