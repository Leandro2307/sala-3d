// Generates the checked-in, static MP3 assets for card-game bot phrases.
// Run: node scripts/gerar-vozes-cartas.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const destino = path.join(__dirname, '..', 'public', 'audio', 'cartas');
const vozes = ['normal', 'grave'];
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nome = (frase, voz) => `${voz}-${crypto.createHash('sha1').update(`${voz}:${frase}`).digest('hex').slice(0, 16)}.mp3`;

async function gerar(frase, voz, arquivo) {
  // This endpoint is used only while building the checked-in assets. The game never calls it.
  const busca = new URL('https://translate.googleapis.com/translate_tts');
  busca.search = new URLSearchParams({ client: 'gtx', tl: 'pt-BR', q: frase, ttsspeed: voz ? '0.24' : '1' });
  const resposta = await fetch(busca, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!resposta.ok) throw new Error(`TTS HTTP ${resposta.status}`);
  const audio = Buffer.from(await resposta.arrayBuffer());
  if (!audio.length) throw new Error('TTS returned an empty file');
  fs.writeFileSync(arquivo, audio);
}

async function main() {
  const regras = await import('../public/js/cartas-regras.js');
  const frases = new Set([...Object.values(regras.GRITOS).flat(), ...regras.ZOEIRA]);
  for (const trunfo of Object.values(regras.TRUNFOS_21)) frases.add(`${trunfo.nome}!`);
  fs.mkdirSync(destino, { recursive: true });
  let feitas = 0;
  for (let voz = 0; voz < vozes.length; voz++) {
    for (const frase of frases) {
      const arquivo = path.join(destino, nome(frase, voz));
      if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > 0) { feitas++; continue; }
      process.stdout.write(`[${feitas + 1}/${frases.size * vozes.length}] ${vozes[voz]}: ${frase}\n`);
      await gerar(frase, voz, arquivo);
      feitas++;
      await pausa(350); // keep the one-time batch gentle on the endpoint
    }
  }
  console.log(`Generated ${feitas} static bot-voice files in ${destino}`);
}

main().catch((erro) => { console.error(erro); process.exitCode = 1; });
