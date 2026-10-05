// Onde a sala guarda o que precisa sobreviver a um reinício do servidor: a configuração das salas
// das empresas (módulo, jogos, senha do dono) e as carteiras de moedas.
//
// Com DB_HOST, DB_USER, DB_PASS e DB_NAME no ambiente (no Render: Environment), usa o MySQL — as
// tabelas estão em banco/sala3d.sql. Sem isso, guarda em dados/*.json, que no Render grátis é
// apagado a cada reinício: serve para testar no PC.
const fs = require('fs');
const path = require('path');

const DADOS = path.join(__dirname, 'dados');

// arquivo JSON { chave: valor }, gravado com um pequeno atraso (várias mudanças = uma escrita)
function arquivo(nome) {
  const arq = path.join(DADOS, nome);
  let mapa = {};
  try {
    mapa = JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch { /* ainda não existe */ }
  let timer = null;
  return {
    mapa,
    salvar() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fs.mkdir(DADOS, { recursive: true }, () => fs.writeFile(arq, JSON.stringify(mapa), () => {}));
      }, 1500);
    },
  };
}

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS sala3d_salas (
    nome        VARCHAR(40)  NOT NULL,
    config      TEXT         NOT NULL,
    senha_hash  VARCHAR(200) NULL,
    criada_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mudou_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sala3d_moedas (
    nome      VARCHAR(40) NOT NULL,
    saldo     INT         NOT NULL DEFAULT 100,
    mudou_em  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const salasArq = arquivo('salas.json');
const moedasArq = arquivo('moedas.json');
let pool = null;

async function iniciar() {
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.log('  Dados:         arquivo dados/ (sem DB_HOST — no Render some a cada reinício)');
    return;
  }
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    charset: 'utf8mb4',
    connectionLimit: 4,
    connectTimeout: 10000,
    enableKeepAlive: true,
  });
  try {
    // cria as tabelas se ainda não existirem (o mesmo de banco/sala3d.sql): não precisa do phpMyAdmin
    for (const sql of TABELAS) await pool.query(sql);
    await pool.query('SELECT 1 FROM sala3d_salas LIMIT 1');
    await pool.query('SELECT 1 FROM sala3d_moedas LIMIT 1');
    console.log(`  Dados:         MySQL em ${DB_HOST}`);
  } catch (err) {
    // sem conexão ou sem as tabelas: segue com arquivo, para a sala não cair por causa do banco
    console.warn(`  Dados:         não deu para usar o MySQL (${err.code || err.message}) — usando arquivo`);
    await pool.end().catch(() => {});
    pool = null;
  }
}

// { config, senhaHash } ou null se a sala nunca foi configurada
async function lerSala(nome) {
  if (!pool) {
    const s = salasArq.mapa[nome];
    return s ? { config: s.config || {}, senhaHash: s.senhaHash || null } : null;
  }
  const [linhas] = await pool.query('SELECT config, senha_hash FROM sala3d_salas WHERE nome = ?', [nome]);
  if (!linhas.length) return null;
  let config = {};
  try {
    config = JSON.parse(linhas[0].config);
  } catch { /* config estragada: volta ao padrão */ }
  return { config, senhaHash: linhas[0].senha_hash || null };
}

async function salvarSala(nome, config, senhaHash) {
  if (!pool) {
    salasArq.mapa[nome] = { config, senhaHash };
    salasArq.salvar();
    return;
  }
  await pool.query(
    'INSERT INTO sala3d_salas (nome, config, senha_hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config), senha_hash = VALUES(senha_hash)',
    [nome, JSON.stringify(config), senhaHash],
  );
}

async function lerSaldo(nome, inicial) {
  if (!pool) return moedasArq.mapa[nome] ?? inicial;
  const [linhas] = await pool.query('SELECT saldo FROM sala3d_moedas WHERE nome = ?', [nome]);
  return linhas.length ? linhas[0].saldo : inicial;
}

// Saldos mudam muito (cada aposta de dados): junta as mudanças e grava de 2 em 2 segundos.
const pendentes = new Map();
let timerSaldos = null;
function guardarSaldo(nome, saldo) {
  if (!pool) {
    moedasArq.mapa[nome] = saldo;
    moedasArq.salvar();
    return;
  }
  pendentes.set(nome, saldo);
  if (timerSaldos) return;
  timerSaldos = setTimeout(async () => {
    timerSaldos = null;
    const lote = [...pendentes];
    pendentes.clear();
    try {
      await pool.query('INSERT INTO sala3d_moedas (nome, saldo) VALUES ? ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)', [lote]);
    } catch (err) {
      console.warn('[banco] moedas', err.code || err.message);
      // não perde: tenta de novo junto com a próxima mudança
      for (const [k, v] of lote) if (!pendentes.has(k)) pendentes.set(k, v);
    }
  }, 2000);
}

module.exports = { iniciar, lerSala, salvarSala, lerSaldo, guardarSaldo };
