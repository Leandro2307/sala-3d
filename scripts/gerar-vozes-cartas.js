// Generates the checked-in, static MP3 assets for card-game bot phrases.
// Run: node scripts/gerar-vozes-cartas.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const destino = path.join(__dirname, '..', 'public', 'audio', 'cartas');
const vozes = ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'];
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nome = (frase, voz) => `${voz}-${crypto.createHash('sha1').update(`${voz}:${frase}`).digest('hex').slice(0, 16)}.mp3`;

async function main() {
  const regras = await import('../public/js/cartas-regras.js');
  const frases = new Set([...Object.values(regras.GRITOS).flat(), ...regras.ZOEIRA]);
  for (const trunfo of Object.values(regras.TRUNFOS_21)) frases.add(`${trunfo.nome}!`);
  fs.mkdirSync(destino, { recursive: true });
  const forcar = process.argv.includes('--forcar');
  let feitas = 0;
  
  for (let voz = 0; voz < vozes.length; voz++) {
    const vozNome = vozes[voz];
    for (const frase of frases) {
      const arquivo = path.join(destino, nome(frase, voz));
      if (!forcar && fs.existsSync(arquivo) && fs.statSync(arquivo).size > 0) { feitas++; continue; }
      
      process.stdout.write(`[${feitas + 1}/${frases.size * vozes.length}] ${vozNome}: ${frase}\n`);
      
      // Escapa possíveis aspas na frase para não quebrar o comando no terminal
      const fraseEscapada = frase.replace(/"/g, '\\"');
      const caminhoPython = "C:/Users/Leandro/AppData/Local/Python/pythoncore-3.14-64/python.exe";
      const comando = `"${caminhoPython}" -m edge_tts --voice ${vozNome} --text "${fraseEscapada}" --write-media "${arquivo}"`;
      
      // Executa o comando Python pelo Node
      execSync(comando, { stdio: 'pipe' });
      
      feitas++;
      await pausa(1200); // stay below the public Edge endpoint burst limit
    }
  }
  console.log(`Generated ${feitas} static bot-voice files in ${destino}`);
}

main().catch((erro) => { console.error(erro); process.exitCode = 1; });