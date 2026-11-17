-- Sala 3D: tabelas do MySQL (ver banco.js). O servidor cria sozinho ao conectar; este arquivo
-- é para quem preferir criar na mão pelo phpMyAdmin.
-- No Render, em Environment: DB_HOST, DB_PORT (3306), DB_USER, DB_PASS, DB_NAME.
-- No cPanel, em "MySQL remoto", libere o host % (o Render grátis não tem IP fixo).

CREATE TABLE IF NOT EXISTS sala3d_salas (
  nome        VARCHAR(40)  NOT NULL,
  config      MEDIUMTEXT   NOT NULL,   -- módulo, jogos, nome e logo da empresa, placar (JSON)
  senha_hash  VARCHAR(200) NULL,       -- senha do dono (scrypt, nunca a senha em si)
  criada_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mudou_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sala3d_moedas (
  nome      VARCHAR(40) NOT NULL,
  saldo     INT         NOT NULL DEFAULT 100,
  mudou_em  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- lan house (lanhouse.js): conta de cada jogador (senha em scrypt) e horários reservados
CREATE TABLE IF NOT EXISTS sala3d_contas (
  nome        VARCHAR(20)  NOT NULL,
  senha_hash  VARCHAR(200) NOT NULL,
  criada_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sala3d_reservas (
  id        VARCHAR(32)  NOT NULL,
  sala      VARCHAR(40)  NOT NULL,
  conta     VARCHAR(20)  NOT NULL,
  maquina   VARCHAR(8)   NOT NULL DEFAULT 'pc', -- pc ou ps5: cada um tem a sua agenda
  jogo      VARCHAR(120) NULL,     -- PC: o jogo escolhido (id do atalho no PC da casa), abre sozinho no horário
  jogo_nome VARCHAR(60)  NULL,
  inicio    BIGINT       NOT NULL,   -- ms desde 1970 (UTC), começo da hora reservada
  status    VARCHAR(12)  NOT NULL,   -- pendente (no checkout da Stripe), paga, cancelada
  sessao    VARCHAR(255) NULL,       -- id da sessão de checkout da Stripe
  expira    BIGINT       NOT NULL DEFAULT 0,
  criada    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY (sala, inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
