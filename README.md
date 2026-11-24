# Loja Dois Irmãos – Casa & Obra

Site e sistema de estoque que desenvolvemos para a Loja Dois Irmãos – Casa & Obra, uma loja de materiais de
construção de Alvinópolis-MG que trabalha com acabamentos, ferramentas, material elétrico e hidráulico.

**Site no ar:** https://lojadoisirmaos.onrender.com

> Como está no plano gratuito do Render, o site "dorme" depois de um tempo sem visitas. Se a primeira
> abertura demorar uns 30 a 50 segundos, é só esperar que ele acorda.

Trabalho da disciplina Sistemas Web I – UFOP / ICEA, Departamento de Computação e Sistemas.
Professor: Fernando Bernardes de Oliveira.
Alunos: Kaiky Linhares (24.1.8154) e Letícia Ferreira Silva (24.2.8067).

---

## Por que esse projeto

Na loja, dois problemas se repetiam no dia a dia:

1. **O estoque do sistema não batia com o da prateleira.** Vendas, devoluções e entradas eram registradas de
   qualquer jeito (ou nem eram), então ninguém sabia ao certo quanto tinha de cada item. Isso acabava em
   orçamento de produto que já tinha acabado.
2. **Produtos parecidos geravam confusão no balcão.** Tubo de 25 mm e de 32 mm, cimento CP II e CP V... o cliente
   pedia um, levava o outro, e voltava para trocar.

A ideia foi resolver as duas coisas juntas: um banco de dados com todo o estoque, atualizado a cada movimentação,
e um catálogo em que cada produto tem a sua descrição técnica, com um aviso dos itens que costumam ser confundidos.

## O que o sistema faz

O sistema tem duas partes.

**Site para os clientes**
- página inicial, catálogo com busca e filtros, e uma página para cada produto (por exemplo `/produto/HI-001`);
- especificações técnicas e se o produto está disponível, atualizado na hora;
- quadro "Não confunda", que compara o produto com os parecidos;
- lista de orçamento: o cliente junta os itens que quer e manda tudo pelo WhatsApp da loja de uma vez.

**Painel para os funcionários** (botão "Área do funcionário", no topo do site)
- entradas, saídas, devoluções e conferência do estoque;
- histórico de todas as movimentações;
- emissão de orçamentos, que não deixa incluir item sem estoque;
- cadastro de produtos e de funcionários (só o gerente).

## Tecnologias

| Parte | O que usamos |
|---|---|
| Páginas | HTML5 e CSS3, sem framework (fontes Montserrat e Inter) |
| Interação | JavaScript puro (`fetch` e Server-Sent Events) |
| Servidor | Node.js com Express |
| Banco de dados | PostgreSQL, hospedado no Neon |
| Tempo real | gatilhos do PostgreSQL + `LISTEN/NOTIFY` + Server-Sent Events |
| Hospedagem | Render (site) e Neon (banco) |

---

## Rodando no seu computador

Você vai precisar do [Node.js](https://nodejs.org/) 22.9 ou mais novo e de um banco PostgreSQL. O jeito mais
fácil de conseguir o banco é criar um no [Neon](https://neon.tech), que é gratuito e não precisa instalar nada.

**1. Baixe o projeto e instale as dependências**

```bash
git clone https://github.com/KaikyL7/lojaDoisIrmaos.git
cd lojaDoisIrmaos
npm install
```

**2. Crie o banco no Neon**

Crie uma conta no Neon e um projeto (sugerimos a região AWS São Paulo). Na página do projeto, clique em
**Connect** e copie o endereço que começa com `postgresql://`. Antes de copiar, clique no olho para mostrar a
senha.

**3. Configure o endereço do banco**

Faça uma cópia do arquivo `.env.example` com o nome `.env` e cole o endereço na linha `DATABASE_URL`:

```
DATABASE_URL=postgresql://usuario:senha@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

O `.env` guarda a senha do banco, por isso está no `.gitignore` e não vai para o GitHub.

**4. Crie as tabelas e inicie o site**

```bash
npm run setup    # cria as tabelas e coloca os dados de exemplo
npm start        # inicia o site
```

Depois é só abrir http://localhost:3000. O painel fica em http://localhost:3000/login.html.

### Usuários de exemplo

O `npm run setup` cria dois usuários para teste:

| Perfil | Usuário | Senha |
|---|---|---|
| Gerente | `gerente` | `gerente123` |
| Atendente | `atendente` | `atendente123` |

Essas senhas servem só para quem está rodando o projeto no próprio computador. No site publicado elas já foram
trocadas. Se precisar de acesso ao painel online, é só falar com a gente.

### Outros comandos

| Comando | Para que serve |
|---|---|
| `npm start` | inicia o servidor na porta 3000 (ou na porta da variável `PORT`) |
| `npm run setup` | cria as tabelas que faltam e, se o banco estiver vazio, coloca os dados de exemplo |
| `npm run reset-db` | apaga tudo e recria o banco com os dados de exemplo (cuidado!) |

Se preferir criar as tabelas sem o Node, dá para rodar `database/schema.sql` e depois `database/seed.sql` direto
no SQL Editor do Neon ou no pgAdmin.

---

## Como o site foi publicado

O código fica aqui no GitHub, o banco no Neon e o site no Render, todos no plano gratuito.

No Render, criamos um *Web Service* apontando para este repositório, com:

- comando de build: `npm install`
- comando de início: `npm start`
- variáveis de ambiente: `DATABASE_URL` (o mesmo endereço do Neon) e `NODE_ENV=production`

O `NODE_ENV=production` faz o cookie de login só circular por HTTPS. A porta quem define é o próprio Render,
e o servidor já lê ela da variável `PORT`. Quando mudamos alguma coisa no código, mandamos para o GitHub e
pedimos um novo deploy no painel do Render (*Manual Deploy → Deploy latest commit*).

---

## Requisitos do trabalho e onde cada um aparece

### Requisitos funcionais

| Requisito | Onde está |
|---|---|
| Controle da movimentação do estoque | telas de Entradas e saídas, Devoluções e Conferência de estoque |
| Consultar a quantidade disponível em tempo real | tela Produtos e estoque e catálogo do site, que se atualizam sozinhos |
| Estoque com nome, preço e imagem de cada produto | cadastro de produtos (com foto enviada ou ilustração) e catálogo |
| Geração e emissão de orçamentos | telas Novo orçamento e Orçamentos (dá para imprimir, salvar em PDF e mandar por WhatsApp) |
| Autenticação e acesso de funcionários | login individual, com perfis de Atendente e Gerente |

### Regras de negócio

| Regra | Como fizemos |
|---|---|
| Cadastro de produtos | nome, preço, imagem e quantidade são obrigatórios; código, unidade, descrição e especificações são opcionais |
| Entradas | cada entrada guarda produto, quantidade, data e hora e quem registrou, e já atualiza o saldo |
| Saídas | a saída desconta do saldo, e o saldo nunca fica negativo (o código barra e o banco também, com um `CHECK`) |
| Devoluções | a devolução fica pendente e só volta para o estoque depois que o gerente confere a mercadoria |
| Estoque em tempo real | um gatilho no PostgreSQL avisa o servidor (`pg_notify`), e o servidor avisa todas as telas abertas |
| Orçamentos | cada orçamento tem produtos, quantidades, preço unitário, total por item e total geral |
| Disponibilidade no orçamento | se algum item estiver esgotado ou pedido em quantidade maior que o estoque, o orçamento não é emitido e o funcionário vê o que está faltando |
| Validade | todo orçamento tem data de emissão e de validade; depois do prazo ele aparece como expirado e só pode ser renovado, o que confere de novo preço e estoque |
| Alteração de preços | só o gerente muda preços; o orçamento guarda o preço do dia em que foi feito, e cada mudança fica no histórico de preços |
| Login | cada funcionário tem o seu usuário; a senha é guardada com hash (scrypt + salt) e a sessão fica num cookie `HttpOnly` |
| Permissões | o atendente consulta, faz orçamentos, entradas, saídas e registra devoluções; o gerente faz tudo isso e também cadastra produtos, muda preços, aprova devoluções, faz conferência e cuida dos funcionários. As permissões são checadas no servidor, não só na tela |
| Conferência de estoque | o gerente informa a contagem da prateleira; cada diferença vira um ajuste, com a quantidade antes, a corrigida e uma justificativa obrigatória |
| Histórico | cada movimentação guarda tipo, produto, quantidade, saldo antes e depois, data e funcionário, com filtros por produto, tipo e período |

### Requisitos não funcionais

| Requisito | Como atendemos |
|---|---|
| Usabilidade | busca por nome, código ou medida, quadro "Não confunda", mensagens de erro claras e aviso de estoque baixo |
| Interface responsiva | funciona no celular, tablet e computador (CSS Grid, Flexbox e media queries) |
| Desempenho | nenhum framework no front-end e índices nas tabelas mais consultadas |
| Segurança | senhas com hash, cookies `HttpOnly`, `Secure` e `SameSite=Strict`, consultas parametrizadas contra SQL injection, texto escapado contra XSS, Content-Security-Policy, bloqueio depois de 5 senhas erradas, checagem das imagens enviadas e senha do banco fora do repositório |
| Disponibilidade | banco gerenciado na nuvem (Neon) e site hospedado no Render; as fotos ficam guardadas no próprio banco |
| Confiabilidade | as movimentações rodam em transações com `SELECT … FOR UPDATE`, então duas vendas ao mesmo tempo não descontam o mesmo saldo e o histórico sempre bate com o estoque |
| Sincronização | toda mudança no estoque é avisada pelo banco e as telas abertas se atualizam na hora |

---

## Organização das pastas

```
lojaDoisIrmaos/
├── server.js               # servidor Express: páginas, fotos e API
├── package.json
├── .env.example            # modelo do arquivo .env
├── database/
│   ├── schema.sql          # tabelas, restrições, índices e gatilhos
│   └── seed.sql            # dados de exemplo
├── src/
│   ├── db.js               # conexão com o PostgreSQL e transações
│   ├── setup-banco.js      # npm run setup / reset-db
│   ├── autenticacao.js     # sessões e permissões
│   ├── seguranca.js        # hash de senha e limite de tentativas
│   ├── estoque.js          # regra central das movimentações
│   ├── imagens.js          # validação e gravação das fotos
│   ├── tempo-real.js       # LISTEN/NOTIFY + Server-Sent Events
│   ├── erros.js            # erros HTTP e validação dos dados
│   └── rotas/              # auth, produtos, estoque, orcamentos, usuarios
└── public/                 # tudo o que roda no navegador
    ├── index.html          # página inicial
    ├── catalogo.html       # catálogo com filtros
    ├── produto.html        # página de cada produto
    ├── lista.html          # lista de orçamento do cliente
    ├── login.html
    ├── 404.html            # página de "não encontrado"
    ├── css/                # estilo.css (site) e painel.css
    ├── js/                 # um arquivo por página, mais comum.js, site.js e painel.js
    ├── img/                # logo e ilustrações dos produtos
    └── painel/             # páginas internas (estoque, orçamentos...)
```

Para mudar endereço, telefone ou horário da loja, edite o objeto `LOJA` no começo de `public/js/comum.js` e o
rodapé das páginas do site.

---

## Banco de dados

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

Os valores em dinheiro ficam em centavos (números inteiros), para não ter problema de arredondamento. O script
completo está em [`database/schema.sql`](database/schema.sql).

---

## Principais rotas da API

| Método | Rota | Quem acessa | O que faz |
|---|---|---|---|
| POST | `/api/auth/login` | qualquer um | login do funcionário |
| GET | `/api/catalogo` | qualquer um | produtos do catálogo (sem mostrar a quantidade exata) |
| GET | `/api/catalogo/:codigo` | qualquer um | um produto, os parecidos ("Não confunda") e os relacionados |
| GET | `/api/produtos` | funcionário | estoque com as quantidades |
| POST/PUT | `/api/produtos` | gerente | cadastro e edição (mudança de preço vai para o histórico) |
| POST | `/api/movimentacoes/entrada` e `/saida` | funcionário | movimenta o estoque |
| GET | `/api/movimentacoes` | funcionário | histórico, com filtros |
| POST | `/api/devolucoes` | funcionário | registra uma devolução (fica pendente) |
| POST | `/api/devolucoes/:id/avaliar` | gerente | aprova (volta ao estoque) ou reprova |
| POST | `/api/conferencia` | gerente | conferência entre a prateleira e o sistema |
| POST | `/api/orcamentos` | funcionário | emite um orçamento (confere o estoque antes) |
| POST | `/api/orcamentos/:id/renovar`, `/converter` e `/cancelar` | funcionário | renova, transforma em venda ou cancela |
| GET | `/api/eventos` | qualquer um | canal de atualização em tempo real (SSE) |
