# Loja Dois Irmãos – Casa & Obra

Sistema web da **Loja Dois Irmãos – Casa & Obra** (Alvinópolis-MG), loja de materiais de construção, acabamentos,
ferramentas e componentes elétricos e hidráulicos.

O sistema tem duas partes:

- **Site público:** página inicial, catálogo com busca e filtros, e uma página para cada produto
  (`/produto/HI-001`), com especificações técnicas, disponibilidade em tempo real, quadro **"Não confunda"**
  comparando produtos parecidos e pedido de orçamento pelo WhatsApp.
- **Painel dos funcionários:** controle de estoque em tempo real (entradas, saídas, devoluções e conferência),
  histórico de movimentações e emissão de orçamentos que bloqueia itens sem estoque.

> Projeto acadêmico da disciplina **Sistemas Web I** – UFOP / ICEA – Departamento de Computação e Sistemas.
> Docente: Fernando Bernardes de Oliveira.
> Discentes: Kaiky Linhares (24.1.8154) e Letícia Ferreira Silva (24.2.8067).

---

## O problema

A loja tinha dificuldade para:

1. **Acompanhar o estoque:** erros nos registros de vendas, devoluções e entradas impediam saber a quantidade real
   disponível, gerando divergências entre o estoque físico e o sistema e orçamentos de itens esgotados.
2. **Identificar o produto pedido pelo cliente:** materiais com nomes parecidos e especificações diferentes
   (ex.: tubo de 25 mm × 32 mm, cimento CP II × CP V) geravam erros no atendimento.

A solução é um **banco de dados com os itens do estoque** e um **catálogo com a descrição técnica de cada item**.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Páginas | **HTML5 e CSS3** (sem framework), fontes Montserrat e Inter |
| Interação | **JavaScript** puro (`fetch`, Server-Sent Events) |
| Servidor | **Node.js + Express** |
| Banco de dados | **PostgreSQL** (pacote `pg`), hospedado no **Neon** |
| Tempo real | Gatilhos do PostgreSQL + `LISTEN/NOTIFY` + Server-Sent Events |

---

## Como executar

**Requisitos:** [Node.js](https://nodejs.org/) 22.9 ou mais recente (recomendado: versão LTS) e um banco
PostgreSQL. O mais simples é o [Neon](https://neon.tech), gratuito e na nuvem.

### 1. Baixar o projeto e instalar as dependências

```bash
git clone https://github.com/KaikyL7/lojaDoisIrmaos.git
cd lojaDoisIrmaos
npm install
```

### 2. Criar o banco no Neon

1. Crie uma conta em [neon.tech](https://neon.tech) (dá para entrar com o GitHub).
2. Crie um projeto (região sugerida: AWS São Paulo).
3. Clique em **Connect** e copie o endereço que começa com `postgresql://`.

### 3. Configurar o endereço do banco

Copie o arquivo `.env.example` com o nome `.env` e cole o endereço do banco na linha `DATABASE_URL`:

```
DATABASE_URL=postgresql://usuario:senha@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

> O `.env` contém a senha do banco e **não vai para o GitHub** (está no `.gitignore`).

### 4. Criar as tabelas e iniciar

```bash
npm run setup    # cria as tabelas e coloca os dados de exemplo
npm start        # inicia o site
```

| Página | Endereço |
|---|---|
| Site público | http://localhost:3000 |
| Área do funcionário | http://localhost:3000/login.html |

### Usuários de teste

| Perfil | Usuário | Senha |
|---|---|---|
| Gerente | `gerente` | `gerente123` |
| Atendente | `atendente` | `atendente123` |

> Em uso real, troque essas senhas na tela **Funcionários**.

### Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor na porta 3000 (ou na variável `PORT`) |
| `npm run setup` | Cria as tabelas que faltam e coloca os dados de exemplo se o banco estiver vazio |
| `npm run reset-db` | **Apaga tudo** e recria o banco com os dados de exemplo |

Também dá para criar as tabelas sem o Node: rode `database/schema.sql` e depois `database/seed.sql` no
**SQL Editor** do Neon ou no pgAdmin.

---

## Funcionalidades × requisitos

### Requisitos funcionais

| Requisito | Onde está no sistema |
|---|---|
| Controle da movimentação do estoque | **Entradas e saídas**, **Devoluções** e **Conferência de estoque** |
| Consultar a quantidade disponível em tempo real | **Produtos e estoque** e catálogo (atualizam sozinhos a cada movimentação) |
| Estoque com nome, preço e imagem de cada produto | Cadastro de produtos (foto enviada ou ilustração) e catálogo público |
| Geração e emissão de orçamentos | **Novo orçamento** e **Orçamentos** (impressão/PDF e envio por WhatsApp) |
| Autenticação e acesso de funcionários | Login com credenciais individuais e perfis **Atendente** e **Gerente** |

### Regras de negócio

| Regra | Como foi implementada |
|---|---|
| Cadastro de produtos | Nome, preço, imagem e quantidade são obrigatórios; código, unidade, descrição e especificações técnicas são opcionais. |
| Controle de entrada | Toda entrada grava produto, quantidade, data/hora e funcionário, e atualiza o saldo automaticamente. |
| Controle de saída | A saída desconta do saldo; o sistema **impede saldo negativo** (no código e por `CHECK` no banco). |
| Controle de devoluções | A devolução fica **pendente** e só volta ao estoque quando o gerente confirma a condição da mercadoria. |
| Estoque em tempo real | Um gatilho no PostgreSQL avisa o servidor (`pg_notify`) e o servidor avisa todas as telas abertas. |
| Geração de orçamentos | Produtos, quantidades, preço unitário, total por item e total geral. |
| Disponibilidade no orçamento | O orçamento **não é confirmado** se algum item estiver esgotado ou acima do estoque; o funcionário vê a lista de problemas. |
| Validade dos orçamentos | Todo orçamento tem emissão e validade. Depois do prazo ele aparece como **expirado** e só pode ser **renovado**, o que confere de novo preços e disponibilidade. |
| Alteração de preços | Só o gerente altera preços. Os itens do orçamento guardam o preço da emissão, e cada alteração vai para o histórico de preços. |
| Autenticação | Login individual, senha com hash (scrypt + salt), sessão em cookie `HttpOnly`. |
| Controle de permissões | Atendente: consulta, orçamentos, entradas, saídas e registro de devoluções. Gerente: também cadastro de produtos, preços, aprovação de devoluções, conferência e funcionários. As permissões são verificadas no servidor. |
| Conferência de estoque | O gerente informa a contagem física; cada divergência vira um **ajuste** com quantidade anterior, corrigida e justificativa obrigatória. |
| Histórico de movimentações | Tipo, produto, quantidade, saldo anterior e posterior, data e funcionário, com filtros por produto, tipo e período. |

### Requisitos não funcionais

| Requisito | Como foi atendido |
|---|---|
| Usabilidade | Busca por código, medida ou especificação; quadro "Não confunda"; mensagens claras; alertas de reposição |
| Interface responsiva | Layout para celular, tablet e computador (CSS Grid/Flexbox e media queries) |
| Desempenho | Sem frameworks no front-end, índices nas tabelas mais consultadas |
| Segurança dos dados | Senhas com hash, cookies `HttpOnly`/`SameSite=Strict`, consultas parametrizadas (contra SQL injection), dados escapados no HTML (contra XSS), *Content-Security-Policy*, bloqueio após 5 senhas erradas, validação das imagens enviadas, senha do banco fora do repositório |
| Disponibilidade | Banco gerenciado na nuvem (Neon), fotos guardadas no próprio banco |
| Confiabilidade | Movimentações em **transações** com `SELECT … FOR UPDATE`: duas vendas simultâneas não baixam o mesmo saldo, e saldo e histórico nunca ficam diferentes |
| Sincronização | O banco avisa cada mudança de estoque e as telas atualizam na hora |

---

## Estrutura de pastas

```
lojaDoisIrmaos/
├── server.js               # Servidor Express: páginas, fotos e API
├── package.json
├── .env.example            # Modelo do arquivo de configuração (.env)
├── database/
│   ├── schema.sql          # Tabelas, restrições, índices e gatilhos
│   └── seed.sql            # Dados de exemplo
├── src/
│   ├── db.js               # Conexão com o PostgreSQL e transações
│   ├── setup-banco.js      # npm run setup / reset-db
│   ├── autenticacao.js     # Sessões e permissões por perfil
│   ├── seguranca.js        # Hash de senha e limite de tentativas
│   ├── estoque.js          # Regra central de movimentação do estoque
│   ├── imagens.js          # Validação e gravação das fotos
│   ├── tempo-real.js       # LISTEN/NOTIFY + Server-Sent Events
│   ├── erros.js            # Erros HTTP e validação dos dados
│   └── rotas/              # auth, produtos, estoque, orcamentos, usuarios
└── public/                 # Front-end
    ├── index.html          # Página inicial
    ├── catalogo.html       # Catálogo com filtros
    ├── produto.html        # Página do produto (/produto/<código>)
    ├── lista.html          # Lista de orçamento do cliente
    ├── login.html
    ├── css/                # estilo.css (geral e site) e painel.css
    ├── js/                 # Um arquivo por página + comum.js, site.js e painel.js
    ├── img/                # Logo e ilustrações dos produtos
    └── painel/             # Páginas internas (estoque, orçamentos…)
```

Para trocar endereço, telefone ou horários da loja, edite o objeto `LOJA` no início de `public/js/comum.js`
e o cabeçalho/rodapé das páginas do site.

---

## Modelo do banco de dados

```mermaid
erDiagram
    USUARIOS ||--o{ SESSOES : "abre"
    USUARIOS ||--o{ MOVIMENTACOES : "registra"
    USUARIOS ||--o{ DEVOLUCOES : "registra / avalia"
    USUARIOS ||--o{ ORCAMENTOS : "emite"
    USUARIOS ||--o{ HISTORICO_PRECOS : "altera"
    USUARIOS ||--o{ IMAGENS : "envia"
    CATEGORIAS ||--o{ PRODUTOS : "agrupa"
    PRODUTOS ||--o{ MOVIMENTACOES : "tem"
    PRODUTOS ||--o{ DEVOLUCOES : "tem"
    PRODUTOS ||--o{ HISTORICO_PRECOS : "tem"
    PRODUTOS ||--o{ ORCAMENTO_ITENS : "aparece em"
    ORCAMENTOS ||--|{ ORCAMENTO_ITENS : "contém"
    ORCAMENTOS ||--o{ MOVIMENTACOES : "gera saída (venda)"
    DEVOLUCOES ||--o| MOVIMENTACOES : "gera entrada (se aprovada)"

    USUARIOS { int id PK
        varchar nome
        varchar login UK
        text senha_hash
        varchar perfil "atendente | gerente"
        boolean ativo }
    PRODUTOS { int id PK
        varchar codigo UK
        varchar nome
        int categoria_id FK
        text especificacoes
        varchar unidade
        int preco_centavos
        int quantidade "nunca negativa"
        int estoque_minimo
        text imagem
        varchar grupo_semelhanca "Não confunda"
        boolean destaque }
    MOVIMENTACOES { int id PK
        int produto_id FK
        varchar tipo "entrada | saida | devolucao | ajuste"
        int quantidade
        int saldo_anterior
        int saldo_posterior
        varchar observacao
        int usuario_id FK
        timestamptz data }
    DEVOLUCOES { int id PK
        int produto_id FK
        int quantidade
        varchar motivo
        varchar status "pendente | aprovada | reprovada"
        varchar parecer }
    ORCAMENTOS { int id PK
        varchar cliente_nome
        timestamptz data_emissao
        date data_validade
        varchar status "emitido | convertido | cancelado | renovado"
        int total_centavos
        int renovado_de FK }
    ORCAMENTO_ITENS { int id PK
        int orcamento_id FK
        int produto_id FK
        int quantidade
        int preco_unitario_centavos "congelado na emissão"
        int subtotal_centavos }
    IMAGENS { int id PK
        varchar tipo
        bytea dados }
```

Valores em dinheiro são guardados em **centavos** (inteiros) para evitar erros de arredondamento. O script
completo está em [`database/schema.sql`](database/schema.sql).

---

## Principais rotas da API

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login do funcionário |
| GET | `/api/catalogo` | público | Produtos do catálogo (sem quantidade exata) |
| GET | `/api/catalogo/:codigo` | público | Produto, semelhantes ("Não confunda") e relacionados |
| GET | `/api/produtos` | funcionário | Estoque com quantidades em tempo real |
| POST/PUT | `/api/produtos` | gerente | Cadastro e edição (preço gera histórico) |
| POST | `/api/movimentacoes/entrada` · `/saida` | funcionário | Movimenta o estoque |
| GET | `/api/movimentacoes` | funcionário | Histórico com filtros |
| POST | `/api/devolucoes` | funcionário | Registra devolução (pendente) |
| POST | `/api/devolucoes/:id/avaliar` | gerente | Aprova (volta ao estoque) ou reprova |
| POST | `/api/conferencia` | gerente | Conferência físico × sistema |
| POST | `/api/orcamentos` | funcionário | Emite orçamento (verifica estoque) |
| POST | `/api/orcamentos/:id/renovar` · `/converter` · `/cancelar` | funcionário | Renovação, venda e cancelamento |
| GET | `/api/eventos` | todos | Canal de tempo real (SSE) |
