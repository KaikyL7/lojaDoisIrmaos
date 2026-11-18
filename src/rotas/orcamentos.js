// Rotas de orçamentos: emissão, validade, renovação, conversão em venda e cancelamento
const express = require('express');
const { consultar, consultarUm, transacao } = require('../db');
const { ErroHttp, texto, inteiro, id } = require('../erros');
const { exigirLogin } = require('../autenticacao');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

const rotas = express.Router();
const VALIDADE_PADRAO_DIAS = 7;
const SITUACOES = ['emitido', 'expirado', 'convertido', 'cancelado', 'renovado'];

// Situação calculada: um orçamento "emitido" vira "expirado" depois da data de validade
const SITUACAO = `CASE WHEN o.status = 'emitido' AND o.data_validade < current_date
                       THEN 'expirado' ELSE o.status END`;

/**
 * Confere produtos e quantidades contra o estoque atual e calcula os valores
 * com os preços vigentes. Se algum item estiver esgotado ou sem saldo suficiente,
 * o orçamento NÃO é confirmado e o funcionário recebe a lista de problemas.
 */
async function montarItens(cliente, itensPedidos) {
  if (!Array.isArray(itensPedidos) || itensPedidos.length === 0) {
    throw new ErroHttp(400, 'Adicione pelo menos um produto ao orçamento.');
  }
  if (itensPedidos.length > 200) throw new ErroHttp(400, 'Itens demais em um único orçamento.');

  // Junta itens repetidos do mesmo produto
  const somados = new Map();
  for (const item of itensPedidos) {
    const produtoId = id(item.produto_id, 'Produto');
    const qtd = inteiro(item.quantidade, 'quantidade', { min: 1 });
    somados.set(produtoId, (somados.get(produtoId) || 0) + qtd);
  }

  const problemas = [];
  const itens = [];
  for (const [produtoId, quantidade] of somados) {
    const { rows } = await cliente.query(
      'SELECT id, codigo, nome, unidade, preco_centavos, quantidade, ativo FROM produtos WHERE id = $1',
      [produtoId]
    );
    const p = rows[0];
    if (!p || !p.ativo) {
      problemas.push({ produto_id: produtoId, produto: p ? p.nome : `#${produtoId}`, motivo: 'Produto indisponível no catálogo.' });
      continue;
    }
    if (p.quantidade === 0) {
      problemas.push({ produto_id: p.id, produto: p.nome, motivo: 'Produto esgotado.', disponivel: 0 });
      continue;
    }
    if (quantidade > p.quantidade) {
      problemas.push({
        produto_id: p.id, produto: p.nome, disponivel: p.quantidade, solicitado: quantidade,
        motivo: `Quantidade acima do estoque: disponível ${p.quantidade} ${p.unidade}, solicitado ${quantidade}.`,
      });
      continue;
    }
    itens.push({
      produto_id: p.id, produto_codigo: p.codigo, produto_nome: p.nome, unidade: p.unidade, quantidade,
      preco_unitario_centavos: p.preco_centavos, subtotal_centavos: p.preco_centavos * quantidade,
    });
  }

  if (problemas.length) {
    throw new ErroHttp(409, 'O orçamento não pode ser confirmado: há itens sem estoque suficiente.', problemas);
  }
  return itens;
}

async function gravarOrcamento(cliente, { dadosCliente, itens, validadeDias, usuarioId, renovadoDe = null }) {
  const total = itens.reduce((s, i) => s + i.subtotal_centavos, 0);
  const { rows } = await cliente.query(
    `INSERT INTO orcamentos (cliente_nome, cliente_telefone, cliente_documento, observacoes,
                             data_validade, total_centavos, usuario_id, renovado_de)
     VALUES ($1, $2, $3, $4, current_date + $5::int, $6, $7, $8) RETURNING id`,
    [dadosCliente.nome, dadosCliente.telefone || null, dadosCliente.documento || null, dadosCliente.observacoes || null,
      validadeDias, total, usuarioId, renovadoDe]
  );
  const orcamentoId = rows[0].id;
  for (const i of itens) {
    await cliente.query(
      `INSERT INTO orcamento_itens (orcamento_id, produto_id, produto_codigo, produto_nome, unidade,
                                    quantidade, preco_unitario_centavos, subtotal_centavos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orcamentoId, i.produto_id, i.produto_codigo, i.produto_nome, i.unidade, i.quantidade,
        i.preco_unitario_centavos, i.subtotal_centavos]
    );
  }
  return orcamentoId;
}

async function buscarOrcamento(orcamentoId) {
  const o = await consultarUm(
    `SELECT o.*, ${SITUACAO} AS situacao, u.nome AS funcionario
       FROM orcamentos o JOIN usuarios u ON u.id = o.usuario_id WHERE o.id = $1`,
    [orcamentoId]
  );
  if (!o) throw new ErroHttp(404, 'Orçamento não encontrado.');
  return o;
}

// ---------------------------------------------------------------------
rotas.get('/orcamentos', exigirLogin, async (req, res) => {
  const where = [];
  const params = [];
  if (SITUACOES.includes(req.query.situacao)) {
    params.push(req.query.situacao);
    where.push(`${SITUACAO} = $${params.length}`);
  }
  if (req.query.q) {
    const termo = String(req.query.q).slice(0, 80);
    params.push(`%${termo}%`, termo.replace('#', ''));
    const n = params.length;
    where.push(`(o.cliente_nome ILIKE $${n - 1} OR o.cliente_telefone ILIKE $${n - 1} OR o.id::text = $${n})`);
  }
  const orcamentos = await consultar(
    `SELECT o.id, o.cliente_nome, o.cliente_telefone, o.data_emissao, o.data_validade, o.total_centavos,
            ${SITUACAO} AS situacao, u.nome AS funcionario,
            (SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id)::int AS qtd_itens
       FROM orcamentos o JOIN usuarios u ON u.id = o.usuario_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY o.id DESC LIMIT 300`,
    params
  );
  res.json({ orcamentos });
});

rotas.get('/orcamentos/:id', exigirLogin, async (req, res) => {
  const orcamento = await buscarOrcamento(id(req.params.id, 'Orçamento'));
  // Junto com cada item vão o estoque e o preço ATUAIS, para comparação
  const itens = await consultar(
    `SELECT i.*, p.quantidade AS estoque_atual, p.preco_centavos AS preco_atual_centavos, p.ativo
       FROM orcamento_itens i JOIN produtos p ON p.id = i.produto_id
      WHERE i.orcamento_id = $1 ORDER BY i.id`,
    [orcamento.id]
  );
  const renovadoPara = await consultarUm('SELECT id FROM orcamentos WHERE renovado_de = $1', [orcamento.id]);
  res.json({ orcamento: { ...orcamento, renovado_para: renovadoPara ? renovadoPara.id : null }, itens });
});

rotas.post('/orcamentos', exigirLogin, async (req, res) => {
  const b = req.body;
  const dadosCliente = {
    nome: texto(b.cliente_nome, 'nome do cliente', { obrigatorio: true, max: 120 }),
    telefone: texto(b.cliente_telefone, 'telefone', { max: 30 }),
    documento: texto(b.cliente_documento, 'CPF/CNPJ', { max: 30 }),
    observacoes: texto(b.observacoes, 'observações', { max: 500 }),
  };
  const validadeDias = inteiro(b.validade_dias ?? VALIDADE_PADRAO_DIAS, 'validade (dias)', { min: 1, max: 30 });

  const novoId = await transacao(async (cliente) => {
    const itens = await montarItens(cliente, b.itens);
    return gravarOrcamento(cliente, { dadosCliente, itens, validadeDias, usuarioId: req.usuario.id });
  });
  res.status(201).json({ id: novoId });
});

// Renovação: só para orçamento expirado; confere de novo preços e disponibilidade
rotas.post('/orcamentos/:id/renovar', exigirLogin, async (req, res) => {
  const antigo = await buscarOrcamento(id(req.params.id, 'Orçamento'));
  if (antigo.situacao !== 'expirado') throw new ErroHttp(409, 'Só é possível renovar um orçamento expirado.');
  const validadeDias = inteiro(req.body.validade_dias ?? VALIDADE_PADRAO_DIAS, 'validade (dias)', { min: 1, max: 30 });

  const novoId = await transacao(async (cliente) => {
    const { rows: itensAntigos } = await cliente.query(
      'SELECT produto_id, quantidade FROM orcamento_itens WHERE orcamento_id = $1', [antigo.id]
    );
    const itens = await montarItens(cliente, itensAntigos); // preços e estoque de AGORA
    const criado = await gravarOrcamento(cliente, {
      dadosCliente: { nome: antigo.cliente_nome, telefone: antigo.cliente_telefone,
        documento: antigo.cliente_documento, observacoes: antigo.observacoes },
      itens, validadeDias, usuarioId: req.usuario.id, renovadoDe: antigo.id,
    });
    await cliente.query("UPDATE orcamentos SET status = 'renovado' WHERE id = $1", [antigo.id]);
    return criado;
  });
  res.status(201).json({ id: novoId });
});

// Finalizar venda: registra a SAÍDA de cada item no estoque
rotas.post('/orcamentos/:id/converter', exigirLogin, async (req, res) => {
  const orcamentoId = id(req.params.id, 'Orçamento');
  const total = await transacao(async (cliente) => {
    // Trava o orçamento para não ser vendido duas vezes ao mesmo tempo
    const { rows } = await cliente.query(
      `SELECT o.*, ${SITUACAO} AS situacao FROM orcamentos o WHERE o.id = $1 FOR UPDATE`, [orcamentoId]
    );
    const o = rows[0];
    if (!o) throw new ErroHttp(404, 'Orçamento não encontrado.');
    if (o.situacao === 'expirado') throw new ErroHttp(409, 'Orçamento expirado. Renove-o antes de finalizar a venda.');
    if (o.situacao !== 'emitido') throw new ErroHttp(409, 'Este orçamento não está mais em aberto.');

    const { rows: itens } = await cliente.query(
      'SELECT produto_id, quantidade FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY produto_id', [o.id]
    );
    for (const i of itens) {
      await movimentar(cliente, {
        produtoId: i.produto_id, tipo: 'saida', variacao: -i.quantidade, usuarioId: req.usuario.id,
        observacao: `Venda do orçamento #${o.id} — ${o.cliente_nome}`.slice(0, 300), orcamentoId: o.id,
      });
    }
    await cliente.query("UPDATE orcamentos SET status = 'convertido' WHERE id = $1", [o.id]);
    return itens.length;
  });

  avisar('estoque', {});
  res.json({ ok: true, movimentacoes: total });
});

rotas.post('/orcamentos/:id/cancelar', exigirLogin, async (req, res) => {
  const o = await buscarOrcamento(id(req.params.id, 'Orçamento'));
  if (!['emitido', 'expirado'].includes(o.situacao)) throw new ErroHttp(409, 'Este orçamento não pode ser cancelado.');
  await consultar("UPDATE orcamentos SET status = 'cancelado' WHERE id = $1", [o.id]);
  res.json({ ok: true });
});

module.exports = rotas;
