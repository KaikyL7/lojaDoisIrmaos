-- =====================================================================
--  Loja Dois Irmãos – Casa & Obra
--  Modelo do banco de dados (PostgreSQL 14 ou mais recente)
--
--  Executado por "npm run setup" (também pode ser rodado no pgAdmin
--  ou no SQL Editor do Neon). Pode ser executado mais de uma vez.
--  Valores em dinheiro ficam em CENTAVOS (inteiro) para evitar
--  erros de arredondamento.
-- =====================================================================

-- Funcionários que acessam o sistema ------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    login       VARCHAR(50)  NOT NULL UNIQUE,
    senha_hash  TEXT         NOT NULL,                  -- scrypt + salt
    perfil      VARCHAR(10)  NOT NULL CHECK (perfil IN ('atendente', 'gerente')),
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Sessões de login (credenciais individuais) ----------------------------
CREATE TABLE IF NOT EXISTS sessoes (
    token       CHAR(64)    PRIMARY KEY,
    usuario_id  INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em   TIMESTAMPTZ NOT NULL
);

-- Fotos enviadas pelo painel -------------------------------------------
--   Ficam no próprio banco: na hospedagem gratuita, arquivos gravados no
--   servidor se perdem quando ele reinicia.
CREATE TABLE IF NOT EXISTS imagens (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('image/png', 'image/jpeg', 'image/webp')),
    dados        BYTEA       NOT NULL,
    tamanho      INTEGER     NOT NULL CHECK (tamanho <= 2097152),   -- até 2 MB
    enviado_por  INTEGER     REFERENCES usuarios(id),
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias do catálogo ------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome       VARCHAR(60) NOT NULL UNIQUE,
    descricao  VARCHAR(120),                            -- texto curto da página inicial
    icone      VARCHAR(30) NOT NULL DEFAULT 'caixa',    -- nome do ícone desenhado no site
    ordem      INTEGER     NOT NULL DEFAULT 0
);

-- Produtos do estoque ---------------------------------------------------
--   Obrigatórios (regra de negócio): nome, preço, imagem e quantidade.
--   Opcionais: código, descrição, especificações técnicas e unidade.
CREATE TABLE IF NOT EXISTS produtos (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo            VARCHAR(30)  UNIQUE,
    nome              VARCHAR(120) NOT NULL,
    categoria_id      INTEGER      REFERENCES categorias(id),
    descricao         TEXT,
    especificacoes    TEXT,                             -- uma por linha: "Chave: valor"
    unidade           VARCHAR(15)  NOT NULL DEFAULT 'un',
    preco_centavos    INTEGER      NOT NULL CHECK (preco_centavos >= 0),
    quantidade        INTEGER      NOT NULL DEFAULT 0 CHECK (quantidade >= 0),   -- nunca negativo
    estoque_minimo    INTEGER      NOT NULL DEFAULT 5 CHECK (estoque_minimo >= 0),
    imagem            TEXT         NOT NULL,
    grupo_semelhanca  VARCHAR(40),                      -- produtos com o mesmo grupo aparecem em "Não confunda"
    destaque          BOOLEAN      NOT NULL DEFAULT FALSE,
    ativo             BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Devoluções: só retornam ao estoque após aprovação ---------------------
CREATE TABLE IF NOT EXISTS devolucoes (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id       INTEGER      NOT NULL REFERENCES produtos(id),
    quantidade       INTEGER      NOT NULL CHECK (quantidade > 0),
    motivo           VARCHAR(300) NOT NULL,
    status           VARCHAR(10)  NOT NULL DEFAULT 'pendente'
                                  CHECK (status IN ('pendente', 'aprovada', 'reprovada')),
    registrado_por   INTEGER      NOT NULL REFERENCES usuarios(id),
    data             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    avaliado_por     INTEGER      REFERENCES usuarios(id),
    data_avaliacao   TIMESTAMPTZ,
    parecer          VARCHAR(300)                       -- condição da mercadoria
);

-- Orçamentos ------------------------------------------------------------
--   "expirado" não é gravado: é calculado comparando data_validade com hoje.
CREATE TABLE IF NOT EXISTS orcamentos (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_nome       VARCHAR(120) NOT NULL,
    cliente_telefone   VARCHAR(30),
    cliente_documento  VARCHAR(30),
    observacoes        VARCHAR(500),
    data_emissao       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    data_validade      DATE         NOT NULL,           -- válido até o fim do dia
    status             VARCHAR(10)  NOT NULL DEFAULT 'emitido'
                                    CHECK (status IN ('emitido', 'convertido', 'cancelado', 'renovado')),
    total_centavos     INTEGER      NOT NULL CHECK (total_centavos >= 0),
    usuario_id         INTEGER      NOT NULL REFERENCES usuarios(id),
    renovado_de        INTEGER      REFERENCES orcamentos(id)
);

-- Itens do orçamento: o preço fica congelado no momento da emissão -------
CREATE TABLE IF NOT EXISTS orcamento_itens (
    id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orcamento_id             INTEGER      NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    produto_id               INTEGER      NOT NULL REFERENCES produtos(id),
    produto_codigo           VARCHAR(30),
    produto_nome             VARCHAR(120) NOT NULL,
    unidade                  VARCHAR(15)  NOT NULL,
    quantidade               INTEGER      NOT NULL CHECK (quantidade > 0),
    preco_unitario_centavos  INTEGER      NOT NULL CHECK (preco_unitario_centavos >= 0),
    subtotal_centavos        INTEGER      NOT NULL CHECK (subtotal_centavos >= 0)
);

-- Pedidos de orçamento feitos pelo site ---------------------------------
--   O cliente informa nome e CPF antes de enviar a lista pelo WhatsApp.
--   O pedido fica registrado para os funcionários atenderem no painel.
CREATE TABLE IF NOT EXISTS pedidos_site (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_nome      VARCHAR(120) NOT NULL,
    cliente_cpf       CHAR(11)     NOT NULL,            -- só os números
    data              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status            VARCHAR(10)  NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'atendido')),
    atendido_por      INTEGER      REFERENCES usuarios(id),
    data_atendimento  TIMESTAMPTZ,
    orcamento_id      INTEGER      REFERENCES orcamentos(id)
);

CREATE TABLE IF NOT EXISTS pedido_site_itens (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id       INTEGER      NOT NULL REFERENCES pedidos_site(id) ON DELETE CASCADE,
    produto_id      INTEGER      NOT NULL REFERENCES produtos(id),
    produto_codigo  VARCHAR(30),
    produto_nome    VARCHAR(120) NOT NULL,
    unidade         VARCHAR(15)  NOT NULL,
    quantidade      INTEGER      NOT NULL CHECK (quantidade > 0)
);

-- Histórico de movimentações (rastreabilidade) --------------------------
--   entrada   = mercadoria recebida
--   saida     = venda / retirada efetiva
--   devolucao = devolução aprovada que voltou ao estoque
--   ajuste    = correção feita na conferência de estoque
CREATE TABLE IF NOT EXISTS movimentacoes (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id       INTEGER      NOT NULL REFERENCES produtos(id),
    tipo             VARCHAR(10)  NOT NULL CHECK (tipo IN ('entrada', 'saida', 'devolucao', 'ajuste')),
    quantidade       INTEGER      NOT NULL CHECK (quantidade >= 0),   -- quantidade movimentada (ou diferença no ajuste)
    saldo_anterior   INTEGER      NOT NULL CHECK (saldo_anterior >= 0),
    saldo_posterior  INTEGER      NOT NULL CHECK (saldo_posterior >= 0),
    observacao       VARCHAR(300),                      -- nota fiscal, motivo, justificativa...
    usuario_id       INTEGER      NOT NULL REFERENCES usuarios(id),
    orcamento_id     INTEGER      REFERENCES orcamentos(id),
    devolucao_id     INTEGER      REFERENCES devolucoes(id),
    data             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Histórico de alteração de preços --------------------------------------
CREATE TABLE IF NOT EXISTS historico_precos (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id       INTEGER     NOT NULL REFERENCES produtos(id),
    preco_anterior   INTEGER     NOT NULL,
    preco_novo       INTEGER     NOT NULL,
    usuario_id       INTEGER     NOT NULL REFERENCES usuarios(id),
    data             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices das consultas mais usadas -------------------------------------
CREATE INDEX IF NOT EXISTS idx_mov_produto      ON movimentacoes (produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_data         ON movimentacoes (data DESC);
CREATE INDEX IF NOT EXISTS idx_itens_orcamento  ON orcamento_itens (orcamento_id);
CREATE INDEX IF NOT EXISTS idx_prod_categoria   ON produtos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_prod_grupo       ON produtos (grupo_semelhanca);
CREATE INDEX IF NOT EXISTS idx_dev_status       ON devolucoes (status);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira   ON sessoes (expira_em);
CREATE INDEX IF NOT EXISTS idx_pedidos_status   ON pedidos_site (status);
CREATE INDEX IF NOT EXISTS idx_itens_pedido     ON pedido_site_itens (pedido_id);

-- =====================================================================
--  Tempo real: o próprio banco avisa quando o estoque muda (LISTEN/NOTIFY).
--  O servidor escuta o canal "estoque" e repassa o aviso para as telas.
-- =====================================================================
CREATE OR REPLACE FUNCTION avisar_estoque() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('estoque', json_build_object(
        'produto_id', NEW.id,
        'quantidade', NEW.quantidade,
        'ativo', NEW.ativo
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avisar_estoque ON produtos;
CREATE TRIGGER trg_avisar_estoque
    AFTER INSERT OR UPDATE ON produtos
    FOR EACH ROW EXECUTE FUNCTION avisar_estoque();

CREATE OR REPLACE FUNCTION avisar_devolucao() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('devolucao', json_build_object('id', NEW.id, 'status', NEW.status)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avisar_devolucao ON devolucoes;
CREATE TRIGGER trg_avisar_devolucao
    AFTER INSERT OR UPDATE ON devolucoes
    FOR EACH ROW EXECUTE FUNCTION avisar_devolucao();

CREATE OR REPLACE FUNCTION avisar_pedido() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('pedido', json_build_object('id', NEW.id, 'status', NEW.status)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avisar_pedido ON pedidos_site;
CREATE TRIGGER trg_avisar_pedido
    AFTER INSERT OR UPDATE ON pedidos_site
    FOR EACH ROW EXECUTE FUNCTION avisar_pedido();

-- Mantém "atualizado_em" sempre correto
CREATE OR REPLACE FUNCTION marcar_atualizacao() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produtos_atualizado ON produtos;
CREATE TRIGGER trg_produtos_atualizado
    BEFORE UPDATE ON produtos
    FOR EACH ROW EXECUTE FUNCTION marcar_atualizacao();
