// Rotas de produtos e categorias (catálogo público e estoque interno)
const express = require('express');
const { consultar, consultarUm, transacao } = require('../db');
const { ErroHttp, texto, inteiro, dinheiroEmCentavos, id } = require('../erros');
const { exigirLogin, exigirGerente } = require('../autenticacao');
const { resolverImagem, listarIlustracoes } = require('../imagens');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

const rotas = express.Router();

const SELECT_PRODUTO = `
  SELECT p.id, p.codigo, p.nome, p.categoria_id, c.nome AS categoria, p.descricao, p.especificacoes,
         p.unidade, p.preco_centavos, p.quantidade, p.estoque_minimo, p.imagem, p.grupo_semelhanca,
         p.destaque, p.ativo, p.atualizado_em
    FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id`;

/** Monta o WHERE da busca (sempre com parâmetros $1, $2...). */
function filtrosBusca(query, where = [], params = []) {
  if (query.q) {
    params.push(`%${String(query.q).slice(0, 80)}%`);
    const n = params.length;
    where.push(`(p.nome ILIKE $${n} OR p.codigo ILIKE $${n} OR p.descricao ILIKE $${n} OR p.especificacoes ILIKE $${n})`);
  }
  if (query.categoria) {
    params.push(id(query.categoria, 'Categoria'));
    where.push(`p.categoria_id = $${params.length}`);
  }
  return { where, params };
}

/** O catálogo público mostra só se há disponibilidade, nunca a quantidade exata. */
function produtoPublico(p) {
  return {
    id: p.id, codigo: p.codigo, nome: p.nome, categoria: p.categoria, categoria_id: p.categoria_id,
    descricao: p.descricao, especificacoes: p.especificacoes, unidade: p.unidade,
    preco_centavos: p.preco_centavos, imagem: p.imagem, destaque: p.destaque,
    situacao: p.quantidade === 0 ? 'esgotado' : p.quantidade <= p.estoque_minimo ? 'ultimas' : 'disponivel',
  };
}

const ORDENS = {
  nome: 'p.nome',
  preco_asc: 'p.preco_centavos, p.nome',
  preco_desc: 'p.preco_centavos DESC, p.nome',
};

// ---------------------------------------------------------------------
// Catálogo público
// ---------------------------------------------------------------------
rotas.get('/catalogo', async (req, res) => {
  const { where, params } = filtrosBusca(req.query, ['p.ativo']);
  if (req.query.disponivel === '1') where.push('p.quantidade > 0');
  if (req.query.destaque === '1') where.push('p.destaque');
  const ordem = ORDENS[req.query.ordem] || 'c.ordem, p.nome';
  const produtos = await consultar(`${SELECT_PRODUTO} WHERE ${where.join(' AND ')} ORDER BY ${ordem}`, params);
  res.json({ produtos: produtos.map(produtoPublico) });
});

// Página do produto: aceita o código (HI-001) ou o número do produto
rotas.get('/catalogo/:ref', async (req, res) => {
  const ref = String(req.params.ref).slice(0, 30);
  const p = await consultarUm(
    `${SELECT_PRODUTO} WHERE p.ativo AND (upper(p.codigo) = upper($1) OR p.id::text = $1)`,
    [ref]
  );
  if (!p) throw new ErroHttp(404, 'Produto não encontrado.');

  // "Não confunda": produtos do mesmo grupo de semelhança
  const semelhantes = p.grupo_semelhanca
    ? await consultar(`${SELECT_PRODUTO} WHERE p.ativo AND p.grupo_semelhanca = $1 AND p.id <> $2 ORDER BY p.nome`,
      [p.grupo_semelhanca, p.id])
    : [];
  const relacionados = await consultar(
    `${SELECT_PRODUTO} WHERE p.ativo AND p.categoria_id = $1 AND p.id <> $2
       AND (p.grupo_semelhanca IS DISTINCT FROM $3) ORDER BY p.destaque DESC, p.nome LIMIT 4`,
    [p.categoria_id, p.id, p.grupo_semelhanca]
  );
  res.json({
    produto: produtoPublico(p),
    semelhantes: semelhantes.map(produtoPublico),
    relacionados: relacionados.map(produtoPublico),
  });
});

rotas.get('/categorias', async (req, res) => {
  const categorias = await consultar(
    `SELECT c.id, c.nome, c.descricao, c.icone, COUNT(p.id)::int AS total
       FROM categorias c LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo
      GROUP BY c.id ORDER BY c.ordem, c.nome`
  );
  res.json({ categorias });
});

rotas.post('/categorias', exigirGerente, async (req, res) => {
  const nome = texto(req.body.nome, 'nome', { obrigatorio: true, max: 60 });
  const existe = await consultarUm('SELECT 1 FROM categorias WHERE lower(nome) = lower($1)', [nome]);
  if (existe) throw new ErroHttp(409, 'Já existe uma categoria com esse nome.');
  const c = await consultarUm(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM categorias)) RETURNING id, nome',
    [nome]
  );
  res.status(201).json(c);
});

rotas.get('/ilustracoes', exigirLogin, (req, res) => {
  res.json({ ilustracoes: listarIlustracoes() });
});

// ---------------------------------------------------------------------
// Estoque interno (somente funcionários)
// ---------------------------------------------------------------------
rotas.get('/produtos', exigirLogin, async (req, res) => {
  const { where, params } = filtrosBusca(req.query);
  if (req.query.inativos !== '1') where.push('p.ativo');
  if (req.query.situacao === 'esgotado') where.push('p.quantidade = 0');
  if (req.query.situacao === 'baixo') where.push('p.quantidade > 0 AND p.quantidade <= p.estoque_minimo');
  const sql = `${SELECT_PRODUTO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.nome`;
  res.json({ produtos: await consultar(sql, params) });
});

rotas.get('/produtos/:id', exigirLogin, async (req, res) => {
  const produtoId = id(req.params.id, 'Produto');
  const produto = await consultarUm(`${SELECT_PRODUTO} WHERE p.id = $1`, [produtoId]);
  if (!produto) throw new ErroHttp(404, 'Produto não encontrado.');
  const movimentacoes = await consultar(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.observacao, m.data, u.nome AS funcionario
       FROM movimentacoes m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.produto_id = $1 ORDER BY m.id DESC LIMIT 20`,
    [produtoId]
  );
  const precos = await consultar(
    `SELECT h.preco_anterior, h.preco_novo, h.data, u.nome AS funcionario
       FROM historico_precos h JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.produto_id = $1 ORDER BY h.id DESC LIMIT 10`,
    [produtoId]
  );
  res.json({ produto, movimentacoes, precos });
});

async function dadosProduto(body) {
  const categoriaId = body.categoria_id ? id(body.categoria_id, 'Categoria') : null;
  if (categoriaId && !(await consultarUm('SELECT 1 FROM categorias WHERE id = $1', [categoriaId]))) {
    throw new ErroHttp(400, 'Categoria inválida.');
  }
  return {
    codigo: texto(body.codigo, 'código', { max: 30 }).toUpperCase() || null,
    nome: texto(body.nome, 'nome', { obrigatorio: true, max: 120 }),
    categoria_id: categoriaId,
    descricao: texto(body.descricao, 'descrição', { max: 1000 }) || null,
    especificacoes: texto(body.especificacoes, 'especificações', { max: 2000 }) || null,
    unidade: texto(body.unidade, 'unidade de medida', { obrigatorio: true, max: 15 }),
    preco_centavos: dinheiroEmCentavos(body.preco, 'preço de venda'),
    estoque_minimo: inteiro(body.estoque_minimo ?? 0, 'estoque mínimo'),
    grupo_semelhanca: texto(body.grupo_semelhanca, 'grupo de produtos parecidos', { max: 40 }).toLowerCase() || null,
    destaque: body.destaque === true || body.destaque === 'on' || body.destaque === '1',
  };
}

async function conferirCodigoLivre(codigo, produtoId = 0) {
  if (!codigo) return;
  const outro = await consultarUm('SELECT 1 FROM produtos WHERE upper(codigo) = upper($1) AND id <> $2', [codigo, produtoId]);
  if (outro) throw new ErroHttp(409, 'Já existe um produto com esse código.');
}

// Cadastro: a quantidade inicial entra como movimentação de entrada (fica no histórico)
rotas.post('/produtos', exigirGerente, async (req, res) => {
  const d = await dadosProduto(req.body);
  const qtdInicial = inteiro(req.body.quantidade ?? 0, 'quantidade inicial');
  await conferirCodigoLivre(d.codigo);

  const novoId = await transacao(async (cliente) => {
    const imagem = await resolverImagem(cliente, req.body, null, req.usuario.id);
    const { rows } = await cliente.query(
      `INSERT INTO produtos (codigo, nome, categoria_id, descricao, especificacoes, unidade, preco_centavos,
                             quantidade, estoque_minimo, imagem, grupo_semelhanca, destaque)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11) RETURNING id`,
      [d.codigo, d.nome, d.categoria_id, d.descricao, d.especificacoes, d.unidade, d.preco_centavos,
        d.estoque_minimo, imagem, d.grupo_semelhanca, d.destaque]
    );
    const produtoId = rows[0].id;
    if (qtdInicial > 0) {
      await movimentar(cliente, { produtoId, tipo: 'entrada', variacao: qtdInicial, usuarioId: req.usuario.id,
        observacao: 'Estoque inicial no cadastro do produto' });
    }
    return produtoId;
  });

  avisar('estoque', { produto_id: novoId });
  res.status(201).json({ id: novoId });
});

// Edição: a quantidade NÃO é alterada aqui, só por movimentações (rastreabilidade)
rotas.put('/produtos/:id', exigirGerente, async (req, res) => {
  const produtoId = id(req.params.id, 'Produto');
  const atual = await consultarUm('SELECT imagem, preco_centavos FROM produtos WHERE id = $1', [produtoId]);
  if (!atual) throw new ErroHttp(404, 'Produto não encontrado.');
  const d = await dadosProduto(req.body);
  await conferirCodigoLivre(d.codigo, produtoId);

  await transacao(async (cliente) => {
    const imagem = await resolverImagem(cliente, req.body, atual.imagem, req.usuario.id);
    await cliente.query(
      `UPDATE produtos SET codigo = $1, nome = $2, categoria_id = $3, descricao = $4, especificacoes = $5,
              unidade = $6, preco_centavos = $7, estoque_minimo = $8, imagem = $9,
              grupo_semelhanca = $10, destaque = $11
        WHERE id = $12`,
      [d.codigo, d.nome, d.categoria_id, d.descricao, d.especificacoes, d.unidade, d.preco_centavos,
        d.estoque_minimo, imagem, d.grupo_semelhanca, d.destaque, produtoId]
    );
    if (d.preco_centavos !== atual.preco_centavos) {
      await cliente.query(
        'INSERT INTO historico_precos (produto_id, preco_anterior, preco_novo, usuario_id) VALUES ($1, $2, $3, $4)',
        [produtoId, atual.preco_centavos, d.preco_centavos, req.usuario.id]
      );
    }
  });

  avisar('estoque', { produto_id: produtoId });
  res.json({ ok: true });
});

// Desativar/reativar (não apaga, para manter o histórico)
rotas.post('/produtos/:id/ativo', exigirGerente, async (req, res) => {
  const produtoId = id(req.params.id, 'Produto');
  const r = await consultarUm('UPDATE produtos SET ativo = $1 WHERE id = $2 RETURNING id', [req.body.ativo === true, produtoId]);
  if (!r) throw new ErroHttp(404, 'Produto não encontrado.');
  avisar('estoque', { produto_id: produtoId });
  res.json({ ok: true });
});

module.exports = rotas;
