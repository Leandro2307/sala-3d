// Grava os mp3 de tudo o que a mesa de cartas fala (gritos, zoeira, trunfos do 21, cartas do uno)
// com a ElevenLabs: cada frase de frasesFaladas(voz) nas 4 vozes, em public/audio/cartas, com o nome de
// arquivoVoz (o mesmo que o servidor e o navegador usam). Só grava o que falta e, no fim, apaga os
// mp3 que nenhuma frase usa mais. Antes de gastar, confere os créditos que sobram na conta.
// A chave da API vem de ELEVENLABS_API_KEY ou do arquivo ~/.elevenlabs-key (fora do repositório).
// Run: node scripts/gerar-vozes-cartas.js [--simular] [--forcar] [--vozes=0,1,2] [--frases="A!|B!"] [--modelo=eleven_multilingual_v2]
const fs = require('fs');
const os = require('os');
const path = require('path');

const destino = path.join(__dirname, '..', 'public', 'audio', 'cartas');
const API = 'https://api.elevenlabs.io';
// uma voz por lugar da mesa, na ordem dos robôs: Zé, Lia, Tião e Bia. São vozes criadas no Voice
// Design do site (no plano grátis a API não usa as da biblioteca nem cria voz), e a conta grátis
// guarda só 3: a que sumir da conta não grava mais frase nova (crie outra e troque o id aqui).
const VOZES = [
  { id: 'snJUIfMjQl9wrrI96kEu', nome: 'Cartas Zé - mineiro brincalhão' },
  { id: 'dJIKByapCYYugiuuhAXv', nome: 'Cartas Lia - mineira enérgica' },
  { id: 'VsNHO2RINyEPA0Vtek61', nome: 'Cartas Tião - caipira rouco' },
  { id: 'wWTm5mfkNDHQN0SLaWqF', nome: 'Cartas Bia - jovem animada' }, // esta numa outra conta (vagas)
];
// --vozes=0,1,2: grava só essas (as outras ficam como estão)
const SO = process.argv.find((a) => a.startsWith('--vozes='))?.slice(8).split(',').map(Number);
// --frases="Neblina!|Furto!": grava só essas frases (as outras que faltam ficam para outra vez)
const FRASES = process.argv.find((a) => a.startsWith('--frases='))?.slice(9).split('|');
// o multilingual v2 é o que fala frase curta ("Uno!", "Bora!") sem inventar. Os ajustes ficam os da
// voz: com menos estabilidade e algum estilo, frase de 1 s virava 8 s de voz inventando.
const MODELO = process.argv.find((a) => a.startsWith('--modelo='))?.slice(9) || 'eleven_multilingual_v2';
const FORMATO = 'mp3_44100_64'; // voz curta: 64 kbps sobra, e o celular baixa metade
const NUMEROS = ['Zero', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove'];
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

// o texto que vai para a voz: o número da carta por extenso, o + dos trunfos ('Aposta +1!',
// 'Escudo+!') em palavra, e UNO/VAR como palavra (não soletrado)
const paraFalar = (frase) => frase.replace(/^\d\b/, (d) => NUMEROS[d])
  .replace(/ ?\+(\d)/g, (_, d) => ` mais ${NUMEROS[d].toLowerCase()}`).replace(/\+!/g, ' mais!')
  .replace(/\bUNO\b/g, 'Uno').replace(/\bVAR\b/g, 'Var');

function chave() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const arquivo = path.join(os.homedir(), '.elevenlabs-key');
  if (fs.existsSync(arquivo)) return fs.readFileSync(arquivo, 'utf8').trim();
  throw new Error(`Sem chave: defina ELEVENLABS_API_KEY ou salve a chave em ${arquivo}`);
}

async function api(rota, { metodo = 'GET', corpo, xi } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(API + rota, {
      method: metodo,
      headers: { 'xi-api-key': xi, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    // 429: muitas ao mesmo tempo (o plano grátis deixa poucas); espera e tenta de novo
    if (r.status === 429 && tentativa < 6) { await pausa(2000 * tentativa); continue; }
    if (!r.ok) {
      const erro = new Error(`${metodo} ${rota.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
      erro.status = r.status;
      throw erro;
    }
    return r;
  }
}

async function gravar(item, xi) {
  const corpo = { text: item.texto, model_id: MODELO };
  const r = await api(`/v1/text-to-speech/${VOZES[item.voz].id}?output_format=${FORMATO}`, { metodo: 'POST', corpo, xi });
  fs.writeFileSync(item.arquivo, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  const regras = await import('../public/js/cartas-regras.js');
  if (regras.VOZES_CARTAS !== VOZES.length) throw new Error(`cartas-regras.js usa ${regras.VOZES_CARTAS} vozes, aqui tem ${VOZES.length}`);
  const forcar = process.argv.includes('--forcar');
  const todos = [];
  for (let voz = 0; voz < VOZES.length; voz++) {
    for (const frase of regras.frasesFaladas(voz)) { // as mulheres com as frases no feminino
      const arquivo = path.join(destino, path.basename(regras.arquivoVoz(frase, voz)));
      todos.push({ voz, frase, texto: paraFalar(frase), arquivo });
    }
  }
  const nomes = new Set(todos.map((i) => path.basename(i.arquivo)));
  if (nomes.size !== todos.length) throw new Error('Dois arquivos com o mesmo nome: mude o hash de arquivoVoz');
  const falta = todos.filter((i) => (!SO || SO.includes(i.voz)) && (!FRASES || FRASES.includes(i.frase))
    && (forcar || !fs.existsSync(i.arquivo) || fs.statSync(i.arquivo).size === 0));
  const semId = [...new Set(falta.filter((i) => !VOZES[i.voz].id).map((i) => VOZES[i.voz].nome))];
  if (semId.length) throw new Error(`Sem id de voz: ${semId.join(', ')} (ou use --vozes=)`);
  const caracteres = falta.reduce((s, i) => s + i.texto.length, 0);
  console.log(`${VOZES.length} vozes = ${todos.length} mp3; faltam ${falta.length} (${caracteres} caracteres)`);
  if (process.argv.includes('--simular')) return;

  const xi = chave();
  if (falta.length) {
    const conta = await (await api('/v1/user/subscription', { xi })).json();
    const modelos = await (await api('/v1/models', { xi })).json();
    const modelo = modelos.find((m) => m.model_id === MODELO);
    if (!modelo) throw new Error(`Modelo ${MODELO} não existe; tem: ${modelos.map((m) => m.model_id).join(', ')}`);
    const custo = Math.ceil(caracteres * (modelo.model_rates?.character_cost_multiplier ?? modelo.token_cost_factor ?? 1));
    const sobra = conta.character_limit - conta.character_count;
    console.log(`plano ${conta.tier}: sobram ${sobra} créditos; isto gasta ~${custo} (${MODELO})`);
    if (custo > sobra) throw new Error('Créditos não dão: nada foi gravado');
  }

  fs.mkdirSync(destino, { recursive: true });
  let feitos = 0;
  const fila = [...falta];
  await Promise.all([1, 2].map(async () => { // duas de cada vez: o plano grátis não deixa mais
    while (fila.length) {
      const item = fila.shift();
      await gravar(item, xi);
      feitos++;
      process.stdout.write(`[${feitos}/${falta.length}] ${item.voz} ${item.frase}\n`);
    }
  }));

  // os mp3 que nenhuma frase usa mais (frase mudada, as vozes antigas)
  let apagados = 0;
  for (const f of fs.readdirSync(destino)) {
    if (f.endsWith('.mp3') && !nomes.has(f)) { fs.unlinkSync(path.join(destino, f)); apagados++; }
  }
  // frase curta virando áudio comprido é sinal de voz que inventou (apague e rode de novo): a fala
  // normal dá uns 0,1 s por letra
  const suspeitos = falta.filter((i) => fs.statSync(i.arquivo).size * 8 / 64000 > 0.9 + i.texto.length * 0.11);
  for (const i of suspeitos) console.log(`  ? ouça: ${path.basename(i.arquivo)} (${i.voz}) "${i.frase}"`);
  if (falta.length) {
    const conta = await (await api('/v1/user/subscription', { xi })).json();
    console.log(`créditos usados no mês: ${conta.character_count}/${conta.character_limit}`);
  }
  const prontos = todos.filter((i) => fs.existsSync(i.arquivo)).length;
  console.log(`Gravados ${feitos}, apagados ${apagados} antigos; ${prontos}/${todos.length} mp3 prontos em ${destino}`);
}

main().catch((erro) => { console.error(erro.message || erro); process.exitCode = 1; });
