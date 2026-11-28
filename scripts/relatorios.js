// Baixa os relatórios do modo jogo que as páginas mandaram ao servidor (jogo-diag.js → POST
// /relatorio-jogo) para a pasta relatorios/, um arquivo por sessão e por lado. Só baixa o que
// mudou desde a última vez e lista os mais recentes.
//
//   npm run relatorios                  → do Render (https://sala-3d.onrender.com)
//   npm run relatorios -- local         → do servidor rodando neste PC (localhost:3000)
//   npm run relatorios -- <endereço> 100 → de outro endereço, os últimos 100
//
// A chave: RELATORIOS_CHAVE no ambiente ou no arquivo .env (a mesma do Render). No localhost sem
// chave configurada no servidor, não precisa.
const fs = require('fs');
const path = require('path');

function lerEnv() {
  try {
    for (const linha of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sem .env */ }
}

async function main() {
  lerEnv();
  const args = process.argv.slice(2);
  let base = args.find((a) => /^https?:|^local$/.test(a)) || process.env.RELATORIOS_URL || 'https://sala-3d.onrender.com';
  if (base === 'local') base = 'http://localhost:3000';
  base = base.replace(/\/$/, '');
  const n = Number(args.find((a) => /^\d+$/.test(a))) || 30;
  const headers = process.env.RELATORIOS_CHAVE ? { 'x-chave': process.env.RELATORIOS_CHAVE } : {};

  const r = await fetch(`${base}/relatorios-jogo?n=${n}`, { headers });
  if (r.status === 403) throw new Error('chave errada ou faltando (RELATORIOS_CHAVE no .env)');
  if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`);
  const lista = await r.json();

  const dir = path.join(__dirname, '..', 'relatorios');
  fs.mkdirSync(dir, { recursive: true });
  let novos = 0;
  // o "mudou" de cada relatório como o servidor mandou da última vez. Antes comparava com a hora do arquivo, mas
  // o banco devolve o mudou_em com 3 h a menos (fuso do MySQL): o relatório em andamento nunca vinha de novo
  const marcas = path.join(dir, '.mudou.json');
  let vistos = {};
  try { vistos = JSON.parse(fs.readFileSync(marcas, 'utf8')); } catch { /* primeira vez */ }
  for (const it of lista) {
    const quando = String(it.inicio || it.criado || '').slice(0, 16).replace(/[T:]/g, '-');
    const quem = String(it.nome || 'sem-nome').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 30);
    // a sessão longa vem em partes de 30 min (jogo-diag.js virarParte): <sessão>-p2, -p3…
    const parte = Number(String(it.id).match(/-p(\d+)$/)?.[1]) || 1;
    const arq = path.join(dir, `${quando}_${it.lado}_${quem}_${it.id.slice(0, 8)}${parte > 1 ? `_p${parte}` : ''}.json`);
    const st = fs.existsSync(arq) ? fs.statSync(arq) : null;
    const marca = `${it.mudou}|${it.tamanho ?? ''}|${it.resumo?.amostras ?? ''}`;
    const velho = !st || vistos[it.id] !== marca;
    // o relógio do aparelho que mandou − o do servidor (s): a hora dos eventos dele menos isso = a do servidor.
    // Casa os relatórios dos dois lados (2026-11-18: ~52 s entre o PC de quem compartilhava e o do lorrel)
    let relogio = null;
    if (velho) {
      const d = await fetch(`${base}/relatorios-jogo/${it.id}`, { headers });
      if (!d.ok) { console.warn(`  ${it.id}: ${d.status}`); continue; }
      const rel = await d.json();
      const dif = rel?.relogio?.difMs ?? rel?.relogioServidor?.defasagemMs ?? null;
      if (dif != null) relogio = -dif / 1000;
      fs.writeFileSync(arq, JSON.stringify(rel, null, 1));
      vistos[it.id] = marca;
      novos++;
    }
    const s = it.resumo || {};
    const fps = s.mediaQps ?? null;
    const extras = [fps != null ? `${Math.round(fps)} qps` : null, s.amostras ? `${s.amostras} amostras` : null, s.quemJoga?.length ? `com ${s.quemJoga.join(', ')}` : null,
      relogio != null && Math.abs(relogio) >= 1 ? `relógio ${relogio > 0 ? '+' : ''}${relogio.toFixed(1)} s` : null].filter(Boolean).join(', ');
    console.log(`${velho ? '*' : ' '} ${quando}  ${it.lado.padEnd(11)} ${String(it.nome || '-').padEnd(16)} sala ${it.sala || '-'}  ${extras}`);
  }
  fs.writeFileSync(marcas, JSON.stringify(vistos));
  console.log(`\n${lista.length} relatórios no servidor, ${novos} baixados agora em ${dir}`);
  juntarPartes(dir);
}

// As partes de uma sessão (…_<id>.json, …_<id>_p2.json…) viram um arquivo só, …_<id>_completo.json, com as
// amostras e os eventos em ordem e o resumo de cada parte em "partes". Refeito quando chega parte nova.
function juntarPartes(dir) {
  const grupos = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(.+_[0-9a-f]{8})(?:_p(\d+))?\.json$/i);
    if (!m) continue;
    if (!grupos.has(m[1])) grupos.set(m[1], []);
    grupos.get(m[1]).push({ f, parte: Number(m[2]) || 1 });
  }
  for (const [base, partes] of grupos) {
    if (partes.length < 2) continue;
    partes.sort((a, b) => a.parte - b.parte);
    const destino = path.join(dir, `${base}_completo.json`);
    const maisNova = Math.max(...partes.map((p) => fs.statSync(path.join(dir, p.f)).mtimeMs));
    if (fs.existsSync(destino) && fs.statSync(destino).mtimeMs >= maisNova) continue;
    const rels = partes.map((p) => JSON.parse(fs.readFileSync(path.join(dir, p.f), 'utf8')));
    const ultimo = rels.at(-1);
    const quemJoga = new Map();
    for (const r of rels) {
      for (const q of r.quemJoga || []) {
        const j = quemJoga.get(q.id) || { ...q, amostras: [] };
        j.amostras.push(...(q.amostras || []));
        j.resumo = q.resumo;
        if (q.ambiente) j.ambiente = q.ambiente;
        quemJoga.set(q.id, j);
      }
    }
    const furo = partes.some((p, i) => p.parte !== i + 1);
    const junto = {
      ...rels[0],
      fim: ultimo.fim,
      ...(furo ? { faltando: 'alguma parte não chegou ao servidor' } : {}),
      partes: rels.map((r) => ({ parte: r.parte || 1, inicio: r.inicioParte || r.inicio, fim: r.fim, amostras: r.amostras?.length || 0, resumo: r.resumo })),
      resumo: ultimo.resumo,
      eventos: rels.flatMap((r) => r.eventos || []),
      amostras: rels.flatMap((r) => r.amostras || []),
      quemJoga: [...quemJoga.values()],
    };
    fs.writeFileSync(destino, JSON.stringify(junto, null, 1));
    console.log(`  sessão inteira em ${path.basename(destino)} (${partes.length} partes, ${junto.amostras.length} amostras)`);
  }
}

main().catch((err) => {
  console.error('Não deu para baixar os relatórios:', err.message);
  process.exit(1);
});
