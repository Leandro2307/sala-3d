// De quem é a travada: junta o relatório de quem joga com o de quem hospeda (os baixados por
// `npm run relatorios` em relatorios/) e, a cada amostra ruim de quem joga (2 s), diz onde estava o
// problema. Ver MODO-JOGO.md, "De quem é a travada".
//
//   node scripts/diagnostico-jogo.js                    → a sessão mais nova de quem joga e a de quem hospeda na mesma hora
//   node scripts/diagnostico-jogo.js <joga.json> [<compartilha.json>]
//
// Os culpados, na ordem em que são testados:
//   ps5       o PC de quem hospeda recebia menos de 50 qps do PS5 (Wi-Fi entre o PS5 e o PC)
//   aparelho  a travada foi no aparelho de quem joga (página ocupada, decodificador)
//   hospeda   a sonda de quem hospeda (ping até o servidor) teve pico ou falha: a rede da casa dele
//   joga      a sonda de quem joga teve pico ou falha: a rede de quem joga (Wi-Fi, 4G)
//   caminho   as duas sondas limpas e a imagem atrasou ou não chegou: a internet entre os dois (ou o TURN)
//   rede?     a imagem atrasou ou não chegou, mas falta a sonda de um dos lados (relatório antigo)
//   pc        o PC de quem hospeda pulou quadros sem a rede estar cheia (codificador, captura)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'relatorios');
const BOM = 50; // qps
const RUIM_QPS = 45;

const ler = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// a hora no servidor de cada amostra: o relógio do aparelho + a diferença medida (relogio.difMs = servidor − aparelho)
const deslocamento = (r) => r?.relogio?.difMs ?? r?.relogioServidor?.defasagemMs ?? 0;
const janela = (r) => {
  const d = deslocamento(r);
  return [Date.parse(r.inicio) + d, Date.parse(r.fim || r.inicio) + d];
};

function escolher(args) {
  if (args[0]) {
    const joga = ler(args[0]);
    const comp = args[1] ? ler(args[1]) : achar(joga, 'compartilha');
    return { joga, comp };
  }
  const arqs = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  const ultimo = [...arqs].reverse().find((f) => /_joga_/.test(f));
  if (!ultimo) throw new Error(`nenhum relatório de quem joga em ${DIR} (rode npm run relatorios)`);
  const joga = ler(path.join(DIR, ultimo));
  return { joga, comp: achar(joga, 'compartilha'), arq: ultimo };
}

// o relatório do outro lado que mais se sobrepõe no tempo
function achar(r, lado) {
  const [a, b] = janela(r);
  let melhor = null;
  let maior = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.includes(`_${lado}_`))) {
    const o = ler(path.join(DIR, f));
    const [c, d] = janela(o);
    const junto = Math.min(b, d) - Math.max(a, c);
    if (junto > maior) { maior = junto; melhor = o; }
  }
  return melhor;
}

function perto(amostras, t, desl) {
  let melhor = null;
  let dist = 1500;
  for (const x of amostras) {
    const d = Math.abs(x.t + desl - t);
    if (d < dist) { dist = d; melhor = x; }
  }
  return melhor;
}

const sondaRuim = (so) => !!so && (so.picos > 0 || so.falhas > 0);

function julgar(j, h) {
  const tb = j.turbo || {};
  const qps = tb.qps ?? j.fpsFinal ?? null;
  const travadas = j.ritmo?.travadas || [];
  const causas = travadas.map((t) => t.causa || '');
  const ruim = travadas.length > 0 || (qps != null && qps < RUIM_QPS);
  if (!ruim) return null;
  const ps5 = /PS5/i.test(h?.janela || '') || h?.somPs5 != null || h?.turbo?.ps5 != null;
  if (h && ps5 && h.captura != null && h.captura < BOM) return 'ps5';
  if (causas.length && causas.every((c) => c.startsWith('aqui'))) return 'aparelho';
  if (sondaRuim(h?.sonda)) return 'hospeda';
  if (sondaRuim(j.sonda)) return 'joga';
  const rede = causas.some((c) => /^(rede|perda|lá)/.test(c)) || (tb.viagemP90 != null && tb.viagemP90 > 60) || (tb.silencioMaxMs ?? 0) > 150;
  if (rede) {
    if (causas.length && causas.every((c) => c.startsWith('lá')) && h?.turbo && !h.turbo.puladosFila && (h.turbo.filaLaMs ?? 0) < 60) return 'pc';
    return j.sonda && h?.sonda ? 'caminho' : 'rede?';
  }
  return causas.length && causas.every((c) => c.startsWith('aqui')) ? 'aparelho' : 'rede?';
}

const NOMES = {
  ps5: 'PS5 → PC de quem hospeda (Wi-Fi entre os dois, na casa dele)',
  aparelho: 'o aparelho de quem joga (página, decodificador)',
  hospeda: 'a rede de quem hospeda (Wi-Fi do PC, roteador, upload)',
  joga: 'a rede de quem joga (Wi-Fi, 4G)',
  caminho: 'o caminho entre os dois (internet, TURN): as duas redes limpas',
  'rede?': 'rede, sem a sonda dos dois lados para dizer qual (relatório antigo)',
  pc: 'o PC de quem hospeda (codificador ou captura, sem a rede estar cheia)',
};

function main() {
  const { joga, comp, arq } = escolher(process.argv.slice(2));
  if (arq) console.log(`quem joga: ${arq}`);
  console.log(`quem joga: ${joga.inicio} → ${joga.fim} · ${joga.ambiente?.navegador?.match(/iPhone|Android|Windows|Mac/)?.[0] ?? '?'} · ${joga.amostras?.length ?? 0} amostras`);
  if (!comp) console.log('quem hospeda: relatório não achado na mesma hora (só o lado de quem joga)');
  else console.log(`quem hospeda: ${comp.inicio} → ${comp.fim} · ${comp.amostras?.length ?? 0} amostras`);
  const dj = deslocamento(joga);
  const dh = deslocamento(comp);
  const conta = {};
  const linhas = [];
  let ruins = 0;
  let total = 0;
  for (const j of joga.amostras || []) {
    if (!j.t) continue;
    total++;
    const t = j.t + dj;
    const h = comp ? perto(comp.amostras || [], t, dh) : null;
    const quem = julgar(j, h);
    if (!quem) continue;
    ruins++;
    conta[quem] = (conta[quem] || 0) + 1;
    const qps = j.turbo?.qps ?? j.fpsFinal;
    linhas.push(`  ${new Date(t).toISOString().slice(11, 19)}  ${String(quem).padEnd(9)} ${qps != null ? `${Math.round(qps)} qps` : ''}`
      + `${h?.captura != null ? ` · PS5→PC ${Math.round(h.captura)} qps` : ''}`
      + `${h?.sonda ? ` · sonda lá ${h.sonda.p50}/${h.sonda.max} ms (base ${h.sonda.base}, picos ${h.sonda.picos})` : ''}`
      + `${j.sonda ? ` · sonda aqui ${j.sonda.p50}/${j.sonda.max} ms (base ${j.sonda.base}, picos ${j.sonda.picos})` : ''}`
      + `${(j.ritmo?.travadas || []).length ? ` · ${j.ritmo.travadas.map((x) => x.causa).join('; ')}` : ''}`);
  }
  const semSonda = !(joga.amostras || []).some((x) => x.sonda) || (comp && !(comp.amostras || []).some((x) => x.sonda));
  console.log(`\n${ruins} de ${total} amostras (2 s cada) com travada ou abaixo de ${RUIM_QPS} qps:\n`);
  for (const [k, n] of Object.entries(conta).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(Math.round((n / ruins) * 100)).padStart(3)}%  ${String(n).padStart(3)}×  ${NOMES[k] || k}`);
  }
  if (semSonda) console.log('\n  (falta a sonda de um dos lados: relatório de antes de 2026-11-19 ou página não recarregada — "rede?" não separa quem hospeda de quem joga)');
  if (process.argv.includes('-v') || linhas.length <= 40) console.log(`\n${linhas.join('\n')}`);
  else console.log('\n  (-v mostra cada amostra)');
}

main();
