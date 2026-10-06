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
