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
    // grava já o que estava esperando o atraso (servidor saindo)
    agora() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      fs.mkdirSync(DADOS, { recursive: true });
      fs.writeFileSync(arq, JSON.stringify(mapa));
    },
  };
}

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS sala3d_salas (
    nome        VARCHAR(40)  NOT NULL,
    config      MEDIUMTEXT   NOT NULL,
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
  // relatórios do modo jogo (jogo-diag.js), em JSON com gzip; ver guardarRelatorio
  `CREATE TABLE IF NOT EXISTS sala3d_relatorios (
    id        VARCHAR(40)  NOT NULL,
    lado      VARCHAR(12)  NOT NULL,
    sala      VARCHAR(40)  NULL,
    nome      VARCHAR(40)  NULL,
    inicio    VARCHAR(30)  NULL,
    resumo    TEXT         NULL,
    tamanho   INT          NOT NULL DEFAULT 0,
    dados     MEDIUMBLOB   NOT NULL,
    criado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mudou_em  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY (mudou_em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // lan house (lanhouse.js): a conta de cada jogador e os horários reservados
  `CREATE TABLE IF NOT EXISTS sala3d_contas (
    nome        VARCHAR(20)  NOT NULL,
    senha_hash  VARCHAR(200) NOT NULL,
    criada_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sala3d_reservas (
    id        VARCHAR(32)  NOT NULL,
    sala      VARCHAR(40)  NOT NULL,
    conta     VARCHAR(20)  NOT NULL,
    maquina   VARCHAR(8)   NOT NULL DEFAULT 'pc',
    jogo      VARCHAR(120) NULL,
    jogo_nome VARCHAR(60)  NULL,
    inicio    BIGINT       NOT NULL,
    status    VARCHAR(12)  NOT NULL,
    sessao    VARCHAR(255) NULL,
    expira    BIGINT       NOT NULL DEFAULT 0,
    criada    BIGINT       NOT NULL,
    PRIMARY KEY (id),
    KEY (sala, inicio)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// relatórios guardados por no máximo tantos dias (e, sem MySQL, no máximo tantos arquivos)
const RELATORIOS_DIAS = 60;
const RELATORIOS_MAX = 300;

const salasArq = arquivo('salas.json');
const moedasArq = arquivo('moedas.json');
const contasArq = arquivo('contas.json');
const reservasArq = arquivo('reservas.json');
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
    // tabela criada antes do logo da empresa: TEXT (64 kB) não cabe a config com o logo
    await pool.query('ALTER TABLE sala3d_salas MODIFY config MEDIUMTEXT NOT NULL').catch(() => {});
    // reservas de antes de separar PC e PS5: todas eram do PC
    await pool.query("ALTER TABLE sala3d_reservas ADD COLUMN maquina VARCHAR(8) NOT NULL DEFAULT 'pc' AFTER conta").catch(() => {});
    // o jogo escolhido ao alugar o PC (abre sozinho no horário)
    await pool.query('ALTER TABLE sala3d_reservas ADD COLUMN jogo VARCHAR(120) NULL AFTER maquina').catch(() => {});
    await pool.query('ALTER TABLE sala3d_reservas ADD COLUMN jogo_nome VARCHAR(60) NULL AFTER jogo').catch(() => {});
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
  timerSaldos = setTimeout(gravarSaldos, 2000);
}

async function gravarSaldos() {
  timerSaldos = null;
  if (!pendentes.size) return;
  const lote = [...pendentes];
  pendentes.clear();
  try {
    await pool.query('INSERT INTO sala3d_moedas (nome, saldo) VALUES ? ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)', [lote]);
  } catch (err) {
    console.warn('[banco] moedas', err.code || err.message);
    // não perde: tenta de novo junto com a próxima mudança
    for (const [k, v] of lote) if (!pendentes.has(k)) pendentes.set(k, v);
  }
}

// ---------------------------------------------------------------- relatórios do modo jogo
// r: { id, lado, sala, nome, inicio, resumo (objeto), tamanho (bytes do JSON), dados (Buffer gzip) }.
// O mesmo id substitui (a página manda a sessão de novo a cada minuto).
const relatoriosArq = arquivo('relatorios.json'); // sem MySQL: o índice; o conteúdo em dados/relatorios/
const DIR_RELATORIOS = path.join(DADOS, 'relatorios');
let limpouRelatorios = 0;

async function guardarRelatorio(r) {
  const meta = { lado: r.lado, sala: r.sala, nome: r.nome, inicio: r.inicio, resumo: r.resumo, tamanho: r.tamanho };
  if (!pool) {
    await fs.promises.mkdir(DIR_RELATORIOS, { recursive: true });
    await fs.promises.writeFile(path.join(DIR_RELATORIOS, `${r.id}.json.gz`), r.dados);
    const m = relatoriosArq.mapa;
    m[r.id] = { ...meta, criado: m[r.id]?.criado || new Date().toISOString(), mudou: new Date().toISOString() };
    const ids = Object.keys(m).sort((a, b) => (m[a].mudou < m[b].mudou ? 1 : -1));
    for (const velho of ids.slice(RELATORIOS_MAX)) {
      delete m[velho];
      fs.promises.unlink(path.join(DIR_RELATORIOS, `${velho}.json.gz`)).catch(() => {});
    }
    relatoriosArq.salvar();
    return;
  }
  await pool.query(
    `INSERT INTO sala3d_relatorios (id, lado, sala, nome, inicio, resumo, tamanho, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lado = VALUES(lado), sala = VALUES(sala), nome = VALUES(nome), inicio = VALUES(inicio),
       resumo = VALUES(resumo), tamanho = VALUES(tamanho), dados = VALUES(dados)`,
    [r.id, r.lado, r.sala, r.nome, r.inicio, JSON.stringify(r.resumo ?? null), r.tamanho, r.dados],
  );
  if (Date.now() - limpouRelatorios > 6 * 3600_000) {
    limpouRelatorios = Date.now();
    pool.query('DELETE FROM sala3d_relatorios WHERE mudou_em < NOW() - INTERVAL ? DAY', [RELATORIOS_DIAS]).catch(() => {});
  }
}

// os mais recentes primeiro, sem o conteúdo
async function listarRelatorios(limite = 50) {
  if (!pool) {
    const m = relatoriosArq.mapa;
    return Object.entries(m).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.mudou < b.mudou ? 1 : -1)).slice(0, limite);
  }
  const [linhas] = await pool.query(
    'SELECT id, lado, sala, nome, inicio, resumo, tamanho, criado_em, mudou_em FROM sala3d_relatorios ORDER BY mudou_em DESC LIMIT ?',
    [limite],
  );
  return linhas.map((l) => {
    let resumo = null;
    try { resumo = JSON.parse(l.resumo); } catch { /* sem resumo */ }
    return { id: l.id, lado: l.lado, sala: l.sala, nome: l.nome, inicio: l.inicio, resumo, tamanho: l.tamanho, criado: l.criado_em, mudou: l.mudou_em };
  });
}

// o Buffer gzip do relatório, ou null
async function lerRelatorio(id) {
  if (!pool) {
    if (!relatoriosArq.mapa[id]) return null;
    return fs.promises.readFile(path.join(DIR_RELATORIOS, `${id}.json.gz`)).catch(() => null);
  }
  const [linhas] = await pool.query('SELECT dados FROM sala3d_relatorios WHERE id = ?', [id]);
  return linhas[0]?.dados ?? null;
}

// ---------------------------------------------------------- lan house (ver lanhouse.js)
// { nome, senhaHash } ou null
async function lerConta(nome) {
  if (!pool) return contasArq.mapa[nome] ? { nome, senhaHash: contasArq.mapa[nome] } : null;
  const [linhas] = await pool.query('SELECT senha_hash FROM sala3d_contas WHERE nome = ?', [nome]);
  return linhas.length ? { nome, senhaHash: linhas[0].senha_hash } : null;
}

// false se o nome já existe
async function criarConta(nome, senhaHash) {
  if (!pool) {
    if (contasArq.mapa[nome]) return false;
    contasArq.mapa[nome] = senhaHash;
    contasArq.salvar();
    return true;
  }
  const [r] = await pool.query('INSERT IGNORE INTO sala3d_contas (nome, senha_hash) VALUES (?, ?)', [nome, senhaHash]);
  return r.affectedRows === 1;
}

async function trocarSenhaConta(nome, senhaHash) {
  if (!pool) {
    contasArq.mapa[nome] = senhaHash;
    contasArq.salvar();
    return;
  }
  await pool.query('UPDATE sala3d_contas SET senha_hash = ? WHERE nome = ?', [senhaHash, nome]);
}

// as reservas que começam a partir de "desde" (ms)
async function lerReservas(desde) {
  if (!pool) return Object.values(reservasArq.mapa).filter((r) => r.inicio >= desde);
  const [linhas] = await pool.query('SELECT id, sala, conta, maquina, jogo, jogo_nome AS jogoNome, inicio, status, sessao, expira, criada FROM sala3d_reservas WHERE inicio >= ?', [desde]);
  return linhas.map((l) => ({ ...l, inicio: Number(l.inicio), expira: Number(l.expira), criada: Number(l.criada) }));
}

async function salvarReserva(r) {
  if (!pool) {
    reservasArq.mapa[r.id] = { ...r };
    // as de mais de 90 dias saem do arquivo
    for (const [id, v] of Object.entries(reservasArq.mapa)) if (v.inicio < Date.now() - 90 * 86400_000) delete reservasArq.mapa[id];
    reservasArq.salvar();
    return;
  }
  await pool.query(
    `INSERT INTO sala3d_reservas (id, sala, conta, maquina, jogo, jogo_nome, inicio, status, sessao, expira, criada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), sessao = VALUES(sessao), expira = VALUES(expira)`,
    [r.id, r.sala, r.conta, r.maquina || 'pc', r.jogo || null, r.jogoNome || null, r.inicio, r.status, r.sessao || null, r.expira || 0, r.criada],
  );
}

// Servidor saindo (deploy, Ctrl+C): o que esperava o atraso vai para o banco antes do fim.
async function encerrar() {
  salasArq.agora();
  moedasArq.agora();
  relatoriosArq.agora();
  contasArq.agora();
  reservasArq.agora();
  if (!pool) return;
  clearTimeout(timerSaldos);
  await gravarSaldos();
  await pool.end().catch(() => {});
}

module.exports = { iniciar, lerSala, salvarSala, lerSaldo, guardarSaldo, guardarRelatorio, listarRelatorios, lerRelatorio, lerConta, criarConta, trocarSenhaConta, lerReservas, salvarReserva, encerrar };
