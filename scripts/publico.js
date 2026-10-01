// Sobe o servidor + o túnel Cloudflare e mostra o link público pra mandar pros amigos.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const exe = path.join(root, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const PORT = Number(process.env.PORT) || 3000;

if (!fs.existsSync(exe)) {
  console.error(`\n  cloudflared nao encontrado em ${exe}`);
  console.error('  Baixe em: https://github.com/cloudflare/cloudflared/releases/latest\n');
  process.exit(1);
}

const children = [];
function run(cmd, args, name) {
  const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', (err) => console.error(`  [${name}] ${err.message}`));
  children.push(child);
  return child;
}

const server = run(process.execPath, [path.join(root, 'server.js')], 'servidor');
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);
server.on('exit', (code) => {
  if (code !== 0 && code !== null) console.error(`  [servidor] encerrou com codigo ${code}`);
  encerrar();
});

const tunnel = run(exe, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], 'tunel');
let mostrado = false;
const procurarLink = (chunk) => {
  const link = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (link && !mostrado) {
    mostrado = true;
    const linha = '='.repeat(link[0].length + 6);
    console.log(`\n  ${linha}\n   LINK PUBLICO: ${link[0]}\n  ${linha}`);
    console.log('   Manda esse link pros amigos. Ctrl+C aqui derruba a sala.\n');
  }
};
tunnel.stdout.on('data', procurarLink);
tunnel.stderr.on('data', procurarLink); // cloudflared escreve os logs no stderr
tunnel.on('exit', (code) => {
  if (code !== 0 && code !== null) console.error(`  [tunel] encerrou com codigo ${code}`);
  encerrar();
});

let encerrando = false;
function encerrar() {
  if (encerrando) return;
  encerrando = true;
  for (const c of children) { try { c.kill(); } catch {} }
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
