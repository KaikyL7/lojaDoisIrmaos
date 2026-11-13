// Rotas de produtos e categorias (catálogo público e estoque interno)
const { db, transacao } = require('../db');
const { rota, enviarJson, ErroHttp, texto, inteiro, dinheiroEmCentavos } = require('../http');
const { exigirLogin, exigirGerente } = require('../autenticacao');
const { resolverImagem, listarIlustracoes } = require('../imagens');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

const SELECT_PRODUTO = `
  SELECT p.id, p.codigo, p.nome, p.categoria_id, c.nome AS categoria, p.descricao, p.especificacoes,
         p.unidade, p.preco_centavos, p.quantidade, p.estoque_minimo, p.imagem, p.ativo, p.atualizado_em
    FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id`;

function filtrosBusca(query) {
  const where = [];
  const params = [];
  if (query.q) {
    where.push('(p.nome LIKE ? OR p.codigo LIKE ? OR p.descricao LIKE ? OR p.especificacoes LIKE ?)');
    const termo = `%${String(query.q).slice(0, 80)}%`;
    params.push(termo, termo, termo, termo);
  }
  if (query.categoria) {
    where.push('p.categoria_id = ?');
    params.push(Number(query.categoria));
  }
  return { where, params };
}

// ---------------------------------------------------------------------
// Catálogo público: mostra se há ou não disponibilidade (sem a quantidade exata)
// ---------------------------------------------------------------------
rota('GET', '/api/catalogo', (req, res, ctx) => {
  const { where, params } = filtrosBusca(ctx.query);
  where.push('p.ativo = 1');
  const produtos = db.prepare(`${SELECT_PRODUTO} WHERE ${where.join(' AND ')} ORDER BY c.nome, p.nome`).all(...params);
  enviarJson(res, 200, {
    produtos: produtos.map((p) => ({
      id: p.id, codigo: p.codigo, nome: p.nome, categoria: p.categoria, categoria_id: p.categoria_id,
      descricao: p.descricao, especificacoes: p.especificacoes, unidade: p.unidade,
      preco_centavos: p.preco_centavos, imagem: p.imagem, disponivel: p.quantidade > 0,
    })),
  });
});

rota('GET', '/api/categorias', (req, res) => {
  const categorias = db.prepare(
    `SELECT c.id, c.nome, COUNT(p.id) AS total
       FROM categorias c LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo = 1
      GROUP BY c.id ORDER BY c.nome`
  ).all();
  enviarJson(res, 200, { categorias });
});

rota('POST', '/api/categorias', exigirGerente, (req, res, ctx) => {
  const nome = texto(ctx.body.nome, 'nome', { obrigatorio: true, max: 60 });
  try {
    const r = db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(nome);
    enviarJson(res, 201, { id: Number(r.lastInsertRowid), nome });
  } catch {
    throw new ErroHttp(409, 'Já existe uma categoria com esse nome.');
  }
});

rota('GET', '/api/ilustracoes', exigirLogin, (req, res) => {
  enviarJson(res, 200, { ilustracoes: listarIlustracoes() });
});

// ---------------------------------------------------------------------
// Estoque interno (somente funcionários)
// ---------------------------------------------------------------------
rota('GET', '/api/produtos', exigirLogin, (req, res, ctx) => {
  const { where, params } = filtrosBusca(ctx.query);
  if (ctx.query.inativos !== '1') where.push('p.ativo = 1');
  if (ctx.query.situacao === 'esgotado') where.push('p.quantidade = 0');
  if (ctx.query.situacao === 'baixo') where.push('p.quantidade > 0 AND p.quantidade <= p.estoque_minimo');
  const sql = `${SELECT_PRODUTO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.nome`;
  enviarJson(res, 200, { produtos: db.prepare(sql).all(...params) });
});

rota('GET', '/api/produtos/:id', exigirLogin, (req, res, ctx) => {
  const id = Number(ctx.params.id);
  const produto = db.prepare(`${SELECT_PRODUTO} WHERE p.id = ?`).get(id);
  if (!produto) throw new ErroHttp(404, 'Produto não encontrado.');
  const movimentacoes = db.prepare(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.observacao, m.data, u.nome AS funcionario
       FROM movimentacoes m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.produto_id = ? ORDER BY m.id DESC LIMIT 20`
  ).all(id);
  const precos = db.prepare(
    `SELECT h.preco_anterior, h.preco_novo, h.data, u.nome AS funcionario
       FROM historico_precos h JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.produto_id = ? ORDER BY h.id DESC LIMIT 10`
  ).all(id);
  enviarJson(res, 200, { produto, movimentacoes, precos });
});

function dadosProduto(body) {
  const categoriaId = body.categoria_id ? Number(body.categoria_id) : null;
  if (categoriaId && !db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) {
    throw new ErroHttp(400, 'Categoria inválida.');
  }
  return {
    codigo: texto(body.codigo, 'código', { max: 30 }) || null,
    nome: texto(body.nome, 'nome', { obrigatorio: true, max: 120 }),
    categoria_id: categoriaId,
    descricao: texto(body.descricao, 'descrição', { max: 1000 }) || null,
    especificacoes: texto(body.especificacoes, 'especificações', { max: 2000 }) || null,
    unidade: texto(body.unidade, 'unidade de medida', { obrigatorio: true, max: 15 }),
    preco_centavos: dinheiroEmCentavos(body.preco, 'preço de venda'),
    estoque_minimo: inteiro(body.estoque_minimo ?? 0, 'estoque mínimo'),
  };
}

function erroCodigoDuplicado(erro) {
  if (String(erro.message).includes('UNIQUE') && String(erro.message).includes('codigo')) {
    throw new ErroHttp(409, 'Já existe um produto com esse código.');
  }
  throw erro;
}

// Cadastro: a quantidade inicial entra como movimentação de entrada (fica no histórico)
rota('POST', '/api/produtos', exigirGerente, (req, res, ctx) => {
  const d = dadosProduto(ctx.body);
  const qtdInicial = inteiro(ctx.body.quantidade ?? 0, 'quantidade inicial');
  const imagem = resolverImagem(ctx.body, null);

  const id = transacao(() => {
    let r;
    try {
      r = db.prepare(
        `INSERT INTO produtos (codigo, nome, categoria_id, descricao, especificacoes, unidade,
                               preco_centavos, quantidade, estoque_minimo, imagem)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(d.codigo, d.nome, d.categoria_id, d.descricao, d.especificacoes, d.unidade,
        d.preco_centavos, d.estoque_minimo, imagem);
    } catch (e) {
      erroCodigoDuplicado(e);
    }
    const novoId = Number(r.lastInsertRowid);
    if (qtdInicial > 0) {
      movimentar({ produtoId: novoId, tipo: 'entrada', variacao: qtdInicial, usuarioId: ctx.usuario.id,
        observacao: 'Estoque inicial no cadastro do produto' });
    }
    return novoId;
  });

  avisar('estoque', { produto_id: id });
  enviarJson(res, 201, { id });
});

// Edição: a quantidade NÃO é alterada aqui, só por movimentações (rastreabilidade)
rota('PUT', '/api/produtos/:id', exigirGerente, (req, res, ctx) => {
  const id = Number(ctx.params.id);
  const atual = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
  if (!atual) throw new ErroHttp(404, 'Produto não encontrado.');
  const d = dadosProduto(ctx.body);
  const imagem = resolverImagem(ctx.body, atual.imagem);

  transacao(() => {
    try {
      db.prepare(
        `UPDATE produtos SET codigo = ?, nome = ?, categoria_id = ?, descricao = ?, especificacoes = ?,
                unidade = ?, preco_centavos = ?, estoque_minimo = ?, imagem = ?,
                atualizado_em = datetime('now', 'localtime')
          WHERE id = ?`
      ).run(d.codigo, d.nome, d.categoria_id, d.descricao, d.especificacoes, d.unidade,
        d.preco_centavos, d.estoque_minimo, imagem, id);
    } catch (e) {
      erroCodigoDuplicado(e);
    }
    if (d.preco_centavos !== atual.preco_centavos) {
      db.prepare('INSERT INTO historico_precos (produto_id, preco_anterior, preco_novo, usuario_id) VALUES (?, ?, ?, ?)')
        .run(id, atual.preco_centavos, d.preco_centavos, ctx.usuario.id);
    }
  });

  avisar('estoque', { produto_id: id });
  enviarJson(res, 200, { ok: true });
});

// Desativar/reativar (não apaga, para manter o histórico)
rota('POST', '/api/produtos/:id/ativo', exigirGerente, (req, res, ctx) => {
  const id = Number(ctx.params.id);
  const ativo = ctx.body.ativo ? 1 : 0;
  const r = db.prepare("UPDATE produtos SET ativo = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
    .run(ativo, id);
  if (r.changes === 0) throw new ErroHttp(404, 'Produto não encontrado.');
  avisar('estoque', { produto_id: id });
  enviarJson(res, 200, { ok: true });
});
