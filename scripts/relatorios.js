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
  for (const it of lista) {
    const quando = String(it.inicio || it.criado || '').slice(0, 16).replace(/[T:]/g, '-');
    const quem = String(it.nome || 'sem-nome').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 30);
    const arq = path.join(dir, `${quando}_${it.lado}_${quem}_${it.id.slice(0, 8)}.json`);
    const mudou = new Date(it.mudou).getTime();
    const st = fs.existsSync(arq) ? fs.statSync(arq) : null;
    if (!st || st.mtimeMs < mudou) {
      const d = await fetch(`${base}/relatorios-jogo/${it.id}`, { headers });
      if (!d.ok) { console.warn(`  ${it.id}: ${d.status}`); continue; }
      fs.writeFileSync(arq, JSON.stringify(await d.json(), null, 1));
      fs.utimesSync(arq, new Date(), new Date(Math.max(mudou, Date.now())));
      novos++;
    }
    const s = it.resumo || {};
    const fps = s.mediaQps ?? null;
    const extras = [fps != null ? `${Math.round(fps)} qps` : null, s.amostras ? `${s.amostras} amostras` : null, s.quemJoga?.length ? `com ${s.quemJoga.join(', ')}` : null].filter(Boolean).join(', ');
    console.log(`${st && st.mtimeMs >= mudou ? ' ' : '*'} ${quando}  ${it.lado.padEnd(11)} ${String(it.nome || '-').padEnd(16)} sala ${it.sala || '-'}  ${extras}`);
  }
  console.log(`\n${lista.length} relatórios no servidor, ${novos} baixados agora em ${dir}`);
}

main().catch((err) => {
  console.error('Não deu para baixar os relatórios:', err.message);
  process.exit(1);
});
