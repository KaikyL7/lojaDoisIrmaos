// Rotas de orçamentos: emissão, validade, renovação, conversão em venda e cancelamento
const { db, transacao } = require('../db');
const { rota, enviarJson, ErroHttp, texto, inteiro } = require('../http');
const { exigirLogin } = require('../autenticacao');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

const VALIDADE_PADRAO_DIAS = 7;

// Situação calculada: um orçamento "emitido" vira "expirado" após a data de validade
const SITUACAO = `CASE WHEN o.status = 'emitido' AND o.data_validade < date('now', 'localtime')
                       THEN 'expirado' ELSE o.status END`;

/**
 * Confere produtos e quantidades contra o estoque atual e calcula os valores
 * com os preços vigentes. Se algum item estiver esgotado ou sem saldo suficiente,
 * o orçamento NÃO é confirmado e o funcionário recebe a lista de problemas.
 */
function montarItens(itensPedidos) {
  if (!Array.isArray(itensPedidos) || itensPedidos.length === 0) {
    throw new ErroHttp(400, 'Adicione pelo menos um produto ao orçamento.');
  }
  if (itensPedidos.length > 200) throw new ErroHttp(400, 'Itens demais em um único orçamento.');

  // Junta itens repetidos do mesmo produto
  const somados = new Map();
  for (const item of itensPedidos) {
    const id = Number(item.produto_id);
    const qtd = inteiro(item.quantidade, 'quantidade', { min: 1 });
    somados.set(id, (somados.get(id) || 0) + qtd);
  }

  const problemas = [];
  const itens = [];
  for (const [produtoId, quantidade] of somados) {
    const p = db.prepare('SELECT id, codigo, nome, unidade, preco_centavos, quantidade, ativo FROM produtos WHERE id = ?')
      .get(produtoId);
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

function gravarOrcamento({ cliente, itens, validadeDias, usuarioId, renovadoDe = null }) {
  const total = itens.reduce((s, i) => s + i.subtotal_centavos, 0);
  const r = db.prepare(
    `INSERT INTO orcamentos (cliente_nome, cliente_telefone, cliente_documento, observacoes,
                             data_validade, total_centavos, usuario_id, renovado_de)
     VALUES (?, ?, ?, ?, date('now', 'localtime', ?), ?, ?, ?)`
  ).run(cliente.nome, cliente.telefone || null, cliente.documento || null, cliente.observacoes || null,
    `+${validadeDias} days`, total, usuarioId, renovadoDe);
  const id = Number(r.lastInsertRowid);
  const inserir = db.prepare(
    `INSERT INTO orcamento_itens (orcamento_id, produto_id, produto_codigo, produto_nome, unidade,
                                  quantidade, preco_unitario_centavos, subtotal_centavos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const i of itens) {
    inserir.run(id, i.produto_id, i.produto_codigo, i.produto_nome, i.unidade, i.quantidade,
      i.preco_unitario_centavos, i.subtotal_centavos);
  }
  return id;
}

function buscarOrcamento(id) {
  const o = db.prepare(
    `SELECT o.*, ${SITUACAO} AS situacao, u.nome AS funcionario
       FROM orcamentos o JOIN usuarios u ON u.id = o.usuario_id WHERE o.id = ?`
  ).get(id);
  if (!o) throw new ErroHttp(404, 'Orçamento não encontrado.');
  return o;
}

// ---------------------------------------------------------------------
rota('GET', '/api/orcamentos', exigirLogin, (req, res, ctx) => {
  const where = [];
  const params = [];
  if (ctx.query.situacao) { where.push(`${SITUACAO} = ?`); params.push(String(ctx.query.situacao)); }
  if (ctx.query.q) {
    where.push('(o.cliente_nome LIKE ? OR o.cliente_telefone LIKE ? OR CAST(o.id AS TEXT) = ?)');
    params.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`, String(ctx.query.q).replace('#', ''));
  }
  const orcamentos = db.prepare(
    `SELECT o.id, o.cliente_nome, o.cliente_telefone, o.data_emissao, o.data_validade, o.total_centavos,
            ${SITUACAO} AS situacao, u.nome AS funcionario,
            (SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id) AS qtd_itens
       FROM orcamentos o JOIN usuarios u ON u.id = o.usuario_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY o.id DESC LIMIT 300`
  ).all(...params);
  enviarJson(res, 200, { orcamentos });
});

rota('GET', '/api/orcamentos/:id', exigirLogin, (req, res, ctx) => {
  const orcamento = buscarOrcamento(Number(ctx.params.id));
  // Junto com cada item vai o estoque e o preço ATUAIS, para comparação
  const itens = db.prepare(
    `SELECT i.*, p.quantidade AS estoque_atual, p.preco_centavos AS preco_atual_centavos, p.ativo
       FROM orcamento_itens i JOIN produtos p ON p.id = i.produto_id
      WHERE i.orcamento_id = ? ORDER BY i.id`
  ).all(orcamento.id);
  const renovadoPara = db.prepare('SELECT id FROM orcamentos WHERE renovado_de = ?').get(orcamento.id);
  enviarJson(res, 200, { orcamento: { ...orcamento, renovado_para: renovadoPara ? renovadoPara.id : null }, itens });
});

rota('POST', '/api/orcamentos', exigirLogin, (req, res, ctx) => {
  const b = ctx.body;
  const cliente = {
    nome: texto(b.cliente_nome, 'nome do cliente', { obrigatorio: true, max: 120 }),
    telefone: texto(b.cliente_telefone, 'telefone', { max: 30 }),
    documento: texto(b.cliente_documento, 'CPF/CNPJ', { max: 30 }),
    observacoes: texto(b.observacoes, 'observações', { max: 500 }),
  };
  const validadeDias = inteiro(b.validade_dias ?? VALIDADE_PADRAO_DIAS, 'validade (dias)', { min: 1, max: 30 });

  const id = transacao(() => {
    const itens = montarItens(b.itens);
    return gravarOrcamento({ cliente, itens, validadeDias, usuarioId: ctx.usuario.id });
  });
  enviarJson(res, 201, { id });
});

// Renovação: só para orçamento expirado; confere de novo preços e disponibilidade
rota('POST', '/api/orcamentos/:id/renovar', exigirLogin, (req, res, ctx) => {
  const antigo = buscarOrcamento(Number(ctx.params.id));
  if (antigo.situacao !== 'expirado') {
    throw new ErroHttp(409, 'Só é possível renovar um orçamento expirado.');
  }
  const validadeDias = inteiro(ctx.body.validade_dias ?? VALIDADE_PADRAO_DIAS, 'validade (dias)', { min: 1, max: 30 });
  const itensAntigos = db.prepare('SELECT produto_id, quantidade FROM orcamento_itens WHERE orcamento_id = ?')
    .all(antigo.id);

  const id = transacao(() => {
    const itens = montarItens(itensAntigos); // usa os preços e o estoque de AGORA
    const novoId = gravarOrcamento({
      cliente: { nome: antigo.cliente_nome, telefone: antigo.cliente_telefone,
        documento: antigo.cliente_documento, observacoes: antigo.observacoes },
      itens, validadeDias, usuarioId: ctx.usuario.id, renovadoDe: antigo.id,
    });
    db.prepare("UPDATE orcamentos SET status = 'renovado' WHERE id = ?").run(antigo.id);
    return novoId;
  });
  enviarJson(res, 201, { id });
});

// Converter em venda: registra a SAÍDA de cada item (com os preços do orçamento)
rota('POST', '/api/orcamentos/:id/converter', exigirLogin, (req, res, ctx) => {
  const o = buscarOrcamento(Number(ctx.params.id));
  if (o.situacao === 'expirado') throw new ErroHttp(409, 'Orçamento expirado. Renove-o antes de finalizar a venda.');
  if (o.situacao !== 'emitido') throw new ErroHttp(409, 'Este orçamento não está mais em aberto.');

  const movs = transacao(() => {
    const itens = db.prepare('SELECT produto_id, quantidade FROM orcamento_itens WHERE orcamento_id = ?').all(o.id);
    const feitas = itens.map((i) =>
      movimentar({
        produtoId: i.produto_id, tipo: 'saida', variacao: -i.quantidade, usuarioId: ctx.usuario.id,
        observacao: `Venda do orçamento #${o.id} — ${o.cliente_nome}`, orcamentoId: o.id,
      })
    );
    db.prepare("UPDATE orcamentos SET status = 'convertido' WHERE id = ?").run(o.id);
    return feitas;
  });

  avisar('estoque', {});
  enviarJson(res, 200, { ok: true, movimentacoes: movs.length });
});

rota('POST', '/api/orcamentos/:id/cancelar', exigirLogin, (req, res, ctx) => {
  const o = buscarOrcamento(Number(ctx.params.id));
  if (!['emitido', 'expirado'].includes(o.situacao)) throw new ErroHttp(409, 'Este orçamento não pode ser cancelado.');
  db.prepare("UPDATE orcamentos SET status = 'cancelado' WHERE id = ?").run(o.id);
  enviarJson(res, 200, { ok: true });
});
