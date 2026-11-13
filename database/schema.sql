-- =====================================================================
--  Loja Dois Irmãos – Casa & Obra
--  Modelo do banco de dados (SQLite)
--  Este arquivo é executado automaticamente quando o servidor inicia.
--  Valores em dinheiro são guardados em CENTAVOS (inteiro) para evitar
--  erros de arredondamento.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- Funcionários que acessam o sistema ------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    login       TEXT    NOT NULL UNIQUE,
    senha_hash  TEXT    NOT NULL,                       -- scrypt + salt
    perfil      TEXT    NOT NULL CHECK (perfil IN ('atendente', 'gerente')),
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Sessões de login (credenciais individuais) ----------------------------
CREATE TABLE IF NOT EXISTS sessoes (
    token       TEXT    PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    expira_em   TEXT    NOT NULL
);

-- Categorias do catálogo ------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT    NOT NULL UNIQUE
);

-- Produtos do estoque ---------------------------------------------------
--   Obrigatórios (regra de negócio): nome, preço, imagem e quantidade.
--   Opcionais: código, descrição, especificações técnicas e unidade.
CREATE TABLE IF NOT EXISTS produtos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo          TEXT    UNIQUE,
    nome            TEXT    NOT NULL,
    categoria_id    INTEGER REFERENCES categorias(id),
    descricao       TEXT,
    especificacoes  TEXT,                               -- uma por linha: "Chave: valor"
    unidade         TEXT    NOT NULL DEFAULT 'un',
    preco_centavos  INTEGER NOT NULL CHECK (preco_centavos >= 0),
    quantidade      INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),  -- nunca negativo
    estoque_minimo  INTEGER NOT NULL DEFAULT 5 CHECK (estoque_minimo >= 0),
    imagem          TEXT    NOT NULL,
    ativo           INTEGER NOT NULL DEFAULT 1,
    criado_em       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Histórico de movimentações (rastreabilidade) --------------------------
--   entrada   = mercadoria recebida
--   saida     = venda / retirada efetiva
--   devolucao = devolução aprovada que voltou ao estoque
--   ajuste    = correção feita na conferência de estoque
CREATE TABLE IF NOT EXISTS movimentacoes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id       INTEGER NOT NULL REFERENCES produtos(id),
    tipo             TEXT    NOT NULL CHECK (tipo IN ('entrada', 'saida', 'devolucao', 'ajuste')),
    quantidade       INTEGER NOT NULL,                  -- quantidade movimentada (ou diferença no ajuste)
    saldo_anterior   INTEGER NOT NULL,
    saldo_posterior  INTEGER NOT NULL CHECK (saldo_posterior >= 0),
    observacao       TEXT,                              -- nota fiscal, motivo, justificativa...
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
    orcamento_id     INTEGER REFERENCES orcamentos(id),
    devolucao_id     INTEGER REFERENCES devolucoes(id),
    data             TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Devoluções: só retornam ao estoque após aprovação ---------------------
CREATE TABLE IF NOT EXISTS devolucoes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id        INTEGER NOT NULL REFERENCES produtos(id),
    quantidade        INTEGER NOT NULL CHECK (quantidade > 0),
    motivo            TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente', 'aprovada', 'reprovada')),
    registrado_por    INTEGER NOT NULL REFERENCES usuarios(id),
    data              TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    avaliado_por      INTEGER REFERENCES usuarios(id),
    data_avaliacao    TEXT,
    parecer           TEXT                               -- condição da mercadoria
);

-- Histórico de alteração de preços --------------------------------------
CREATE TABLE IF NOT EXISTS historico_precos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id       INTEGER NOT NULL REFERENCES produtos(id),
    preco_anterior   INTEGER NOT NULL,
    preco_novo       INTEGER NOT NULL,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
    data             TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Orçamentos ------------------------------------------------------------
--   "expirado" não é gravado: é calculado comparando data_validade com hoje.
CREATE TABLE IF NOT EXISTS orcamentos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nome      TEXT    NOT NULL,
    cliente_telefone  TEXT,
    cliente_documento TEXT,
    observacoes       TEXT,
    data_emissao      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    data_validade     TEXT    NOT NULL,                 -- AAAA-MM-DD (válido até o fim do dia)
    status            TEXT    NOT NULL DEFAULT 'emitido'
                              CHECK (status IN ('emitido', 'convertido', 'cancelado', 'renovado')),
    total_centavos    INTEGER NOT NULL,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
    renovado_de       INTEGER REFERENCES orcamentos(id)
);

-- Itens do orçamento: o preço fica congelado no momento da emissão -------
CREATE TABLE IF NOT EXISTS orcamento_itens (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    orcamento_id             INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    produto_id               INTEGER NOT NULL REFERENCES produtos(id),
    produto_codigo           TEXT,
    produto_nome             TEXT    NOT NULL,
    unidade                  TEXT    NOT NULL,
    quantidade               INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario_centavos  INTEGER NOT NULL,
    subtotal_centavos        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_produto   ON movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_data      ON movimentacoes(data);
CREATE INDEX IF NOT EXISTS idx_itens_orc     ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_prod_categoria ON produtos(categoria_id);
