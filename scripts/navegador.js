// Sobe o navegador compartilhado (neko no Docker) e depois o servidor da sala já apontando pra ele.
// Na primeira vez cria neko/.env com senhas aleatórias. Ctrl+C derruba os dois (o login fica salvo).
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const nekoDir = path.join(root, 'neko');
const envFile = path.join(nekoDir, '.env');
const NEKO_PORT = 8080;

function sair(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ Docker
const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (docker.error) {
  sair('Docker nao encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/');
}
if (docker.status !== 0) {
  sair('O Docker esta instalado mas nao esta rodando. Abra o Docker Desktop, espere ficar verde e tente de novo.');
}

// ------------------------------------------------------------------ senhas (.env)
function lerEnv() {
  if (!fs.existsSync(envFile)) return {};
  const env = {};
  for (const linha of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = lerEnv();
if (!env.BROWSER_PASSWORD || !env.BROWSER_ADMIN_PASSWORD) {
  const senha = () => crypto.randomBytes(12).toString('base64url');
  env.BROWSER_PASSWORD ||= senha();
  env.BROWSER_ADMIN_PASSWORD ||= senha();
  fs.writeFileSync(envFile, [
    '# Gerado por "npm run navegador". Nao vai para o git (.gitignore).',
    '# BROWSER_PASSWORD: participante (a sala usa sozinha). BROWSER_ADMIN_PASSWORD: so sua,',
    '# para entrar como admin em http://localhost:8080 com o usuario "admin".',
    `BROWSER_PASSWORD=${env.BROWSER_PASSWORD}`,
    `BROWSER_ADMIN_PASSWORD=${env.BROWSER_ADMIN_PASSWORD}`,
    '',
  ].join('\n'));
  console.log(`\n  Senhas do navegador criadas em ${path.relative(root, envFile)}`);
}

// O IP muda quando o roteador quer, então é descoberto a cada vez em vez de ficar no .env.
// Fica o da rede local: serve para você e para quem está no mesmo Wi-Fi.
function ipDaRede() {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  return ips.find((ip) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(ip)) || ips[0] || '127.0.0.1';
}
const ip = process.env.BROWSER_IP || ipDaRede();

// ------------------------------------------------------------------ container
console.log('  Subindo o navegador (na primeira vez baixa ~1 GB, demora)...');
const compose = spawnSync('docker', ['compose', 'up', '-d'], {
  cwd: nekoDir,
  stdio: 'inherit',
  env: { ...process.env, ...env, BROWSER_IP: ip },
});
if (compose.status !== 0) sair('O docker compose falhou (mensagem acima).');

function pararNavegador() {
  console.log('\n  Parando o navegador (o login fica salvo em neko/perfil)...');
  spawnSync('docker', ['compose', 'stop'], { cwd: nekoDir, stdio: 'inherit' });
}

// ------------------------------------------------------------------ servidor da sala
const server = spawn(process.execPath, [path.join(root, 'server.js'), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  // pelo IP (não localhost): o iframe abre no navegador de cada um, e para o amigo no mesmo
  // Wi-Fi "localhost" seria o PC dele
  env: { ...process.env, BROWSER_URL: `http://${ip}:${NEKO_PORT}`, BROWSER_PASSWORD: env.BROWSER_PASSWORD },
});
console.log(`  Navegador no ar (IP da rede: ${ip}). Abra a sala, painel "Telao" -> "Por o navegador no telao".`);
console.log(`  Admin do neko: http://localhost:${NEKO_PORT} usuario "admin", senha em neko/.env\n`);

let encerrando = false;
function encerrar() {
  if (encerrando) return;
  encerrando = true;
  try { server.kill(); } catch { /* já saiu */ }
  pararNavegador();
  process.exit(0);
}
server.on('exit', encerrar);
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
